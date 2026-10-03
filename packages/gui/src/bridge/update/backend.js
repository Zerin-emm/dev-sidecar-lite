import DevSidecar from '@docmirror/dev-sidecar'
import { ipcMain } from 'electron'
import request from 'request'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pkg = require('../../../package.json')
import log from '../../utils/util.log.gui.js'
import { isNewVersion } from '@docmirror/dev-sidecar/src/utils/util.version.js'

const curVersion = pkg.version
const isCurrentPreRelease = curVersion.includes('-')

// 本 fork 的发布地址。
// 更新只做「检查有没有新版本 + 引导去 Releases 页面手动下载安装包」：
// 不再使用 electron-updater（上游早就注释掉了 autoUpdater.checkForUpdates），
// 也不再下载增量 zip（releases 里本来就没有 update-<platform>-<arch>-*.zip 资产，
// partPackage 恒为空，那段解压代码从未被执行过）。
const releasesPageUrl = 'https://github.com/Zerin-emm/dev-sidecar-lite/releases'

// 检查更新只用 releases.atom，不用 api.github.com：
// 未认证的 GitHub API 配额只有 60 次/小时，而且按出口 IP 共享，配额用完直接 403
// （实测本机直连 api.github.com 就是 403）。releases.atom 由 github.com 自己提供，
// 不受 API 配额限制，本机实测可用，所以直接以它为准。
const releasesAtomUrl = 'https://github.com/Zerin-emm/dev-sidecar-lite/releases.atom'

/**
 * 组装 releases.atom 的请求参数。
 *
 * 两个坑（都实测过，别改）：
 *
 * 1、必须走本地代理，而且必须显式带 `Connection: keep-alive`。
 *    本机直连 github.com 是 ETIMEDOUT（这正是本应用存在的意义），所以更新请求要发给
 *    本地代理。而 DS 在 `packages/mitmproxy/src/lib/proxy/common/util.js:145-152` 里，
 *    一旦看到客户端发 `Connection: close` 就把 agent 置为 false；随后 sni 拦截器
 *    （`packages/mitmproxy/src/lib/interceptor/impl/req/sni.js:10`）虽然把 servername 改成了
 *    baidu.com，却因为没有 agent.unVerifySslAgent 可用，无法关掉上游证书校验，
 *    于是上游拿着 github.com 的证书去和 baidu.com 比对，报
 *    `ERR_TLS_CERT_ALTNAME_INVALID`，代理直接回 500 错误页。
 *    （node 的 request 库默认发 Connection: close，curl 默认 keep-alive，
 *     所以同一时刻 curl 能通、本应用却拿到 500。）显式 keep-alive 后实测 200。
 *
 * 2、客户端必须信任 DS 的根证书（ca 选项），否则报
 *    `unable to verify the first certificate` —— node 不读 Windows 证书库。
 */
function buildRequestOptions () {
  const config = DevSidecar.api.config.get()
  const server = config.server || {}
  const options = {
    timeout: 15000,
    headers: {
      'User-Agent': `DS/${curVersion}`,
      Connection: 'keep-alive',
    },
  }

  // 代理没开时不带 proxy：直连虽然在本机不通，但用户没开代理时本来就没有网络加速
  if (server.enabled === false || !server.port) {
    return options
  }

  const host = server.host || '127.0.0.1'
  // 代理同时监听两个端口：httpsPort = server.port，httpPort = server.port - 1
  // （见 packages/mitmproxy/src/lib/proxy/mitmproxy/index.js:152）
  options.proxy = `http://${host}:${server.port - 1}`

  const certPath = server.setting && server.setting.rootCaFile && server.setting.rootCaFile.certPath
  try {
    if (certPath && fs.existsSync(certPath)) {
      options.ca = fs.readFileSync(certPath)
    } else {
      // 实在拿不到根证书就退化为不校验（本地代理用的是自签证书）
      options.strictSSL = false
    }
  } catch (e) {
    log.warn('读取根证书失败，本次检查更新不校验证书：', e.message)
    options.strictSSL = false
  }

  return options
}

function extractVersion (versionData) {
  const candidates = [versionData.tag_name, versionData.name]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const matched = candidate.match(/^v?(\d+(?:\.\d+)+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/)
    if (matched) {
      return matched[0].startsWith('v') ? matched[0].substring(1) : matched[0]
    }
  }
  return null
}

function decodeHtml (text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
}

/**
 * 解析 releases.atom，按「从新到旧」的顺序返回所有能识别的 release。
 *
 * Atom 里没有 assets / prerelease 字段，所以：
 * - 版本号优先从 <link href=".../releases/tag/<tag>"> 里取 —— release 的标题
 *   （<title>）是发布者自己填的名字，往往不是版本号（例如标题填 "testupdate"、
 *   tag 才是 v8.0.0），只认标题会漏掉版本。标题能解析出纯版本号时也接受。
 * - 是否预发布只能靠版本号里有没有 '-' 判断。
 */
function parseReleasesFromAtom (body) {
  const releases = []
  if (!body) {
    return releases
  }

  const entries = body.match(/<entry>[\s\S]*?<\/entry>/g) || []
  for (const entry of entries) {
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/)
    let tagFromLink = ''
    if (linkMatch) {
      const tagMatch = linkMatch[1].match(/\/releases\/tag\/([^/?#"]+)/)
      if (tagMatch) {
        tagFromLink = decodeURIComponent(tagMatch[1])
      }
    }
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/)
    const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : ''

    const version = extractVersion({ tag_name: tagFromLink, name: title })
    if (!version) {
      log.info('跳过无法提取版本号的版本:', title || tagFromLink || '(空)')
      continue
    }

    let releaseNotes = ''
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)
    if (contentMatch) {
      const text = decodeHtml(contentMatch[1]).replace(/<[^>]*>/g, '').trim()
      // release 正文为空时 GitHub 会写死 "No content."
      if (text && text !== 'No content.') {
        releaseNotes = text
      }
    }

    releases.push({ version, releaseNotes: releaseNotes || '无', title })
  }
  return releases
}

/**
 * 检测更新：查询 releases.atom，发现新版本就通知渲染进程弹窗，
 * 由用户自己点「前往下载」跳到 Releases 页面下载安装包。
 */
function updateHandle (win, log) {
  function notifyByVersion (onlineVersion, releaseNotes) {
    const isNew = isNewVersion(onlineVersion, curVersion, log)
    log.info(`版本比对结果：isNewVersion('${onlineVersion}', '${curVersion}') = ${isNew}`)
    if (isNew > 0) {
      log.info(`检查更新：发现新版本 '${onlineVersion}'，当前版本号为 '${curVersion}'`)
      win.webContents.send('update', {
        key: 'available',
        value: {
          version: onlineVersion,
          releaseNotes: releaseNotes || '无',
          releasePageUrl: releasesPageUrl,
        },
      })
    } else {
      log.info(`检查更新：没有新版本，最近发布的版本号为 '${onlineVersion}'，而当前版本号为 '${curVersion}'`)
      win.webContents.send('update', { key: 'notAvailable' })
    }
  }

  function sendError (message) {
    win.webContents.send('update', { key: 'error', action: 'checkForUpdate', error: message })
  }

  function checkForUpdates () {
    const options = buildRequestOptions()
    log.info(`检查更新：GET ${releasesAtomUrl}${options.proxy ? ` , proxy: ${options.proxy}` : ' , 直连'}`)

    request(releasesAtomUrl, options, (error, response, body) => {
      try {
        if (error) {
          log.error('检查更新失败:', error)
          sendError(`检查更新失败：${error}`)
          return
        }
        if (!response || response.statusCode !== 200) {
          const status = response && response.statusCode
          log.error('检查更新失败, status:', status, ', body:', typeof body === 'string' ? body.substring(0, 300) : body)
          // DS 代理出错时会回一个 HTML 错误页，把里面的错误描述提取出来更友好
          let detail = ''
          if (typeof body === 'string') {
            const errMatch = body.match(/【([^】]+)】/)
            if (errMatch) {
              detail = errMatch[1]
            } else {
              const titleMatch = body.match(/<title>([^<]*)<\/title>/i)
              detail = titleMatch ? titleMatch[1] : body.substring(0, 200)
            }
          } else if (response && response.statusMessage) {
            detail = response.statusMessage
          }
          sendError(`检查更新失败: ${detail}, code: ${status}`)
          return
        }

        const releases = parseReleasesFromAtom(body)
        if (releases.length === 0) {
          log.info('检查更新-没有正式版本数据，releases.atom 里没有可识别的 release')
          win.webContents.send('update', { key: 'notAvailable' })
          return
        }

        const skipPreRelease = DevSidecar.api.config.get().app.skipPreRelease
        for (const release of releases) {
          const isOnlinePreRelease = release.version.includes('-')
          if (!isCurrentPreRelease && skipPreRelease && isOnlinePreRelease) {
            log.info('跳过预发布版本:', release.title, ', onlineVersion:', release.version)
            continue
          }
          log.info('最近可用版本：', release.title, ', onlineVersion:', release.version)
          // 只检查最近一个可用版本
          notifyByVersion(release.version, release.releaseNotes)
          return
        }

        log.info('检查更新-没有正式版本数据')
        win.webContents.send('update', { key: 'notAvailable' })
      } catch (e) {
        log.error('检查更新失败:', e)
        sendError(`检查更新失败:${e.message}`)
      }
    })
  }

  ipcMain.on('update', (e, arg) => {
    if (arg.key === 'checkForUpdate') {
      // 请求 releases.atom，获取最新版本号，来检查更新
      log.info('checkForUpdate:', arg.fromUser)
      checkForUpdates()
    }
  })

  log.info('check update inited')
}

export default {
  install (context) {
    const { win, log } = context
    updateHandle(win, log)
  },
}
