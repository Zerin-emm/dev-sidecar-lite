const fs = require('node:fs')
const path = require('node:path')
const log = require('../../utils/util.log.server')

let scripts

// 读取脚本文件，失败时只记录日志并返回null，避免一个文件缺失导致所有脚本都无法注入
function tryReadFile (rootDir, script) {
  log.info('read script, script root location:', path.resolve('./'))
  const location = path.join(rootDir, `./${script}`)
  log.info('read script, the script location:', location)
  try {
    return fs.readFileSync(location).toString()
  } catch (e) {
    log.error(`read script failed, location: ${location}, error:`, e.message)
    return null
  }
}

const api = {
  get (rootDir) {
    if (scripts == null) {
      return api.load(rootDir)
    }
    return scripts
  },
  load (rootDir) {
    scripts = {}

    // 油猴本体（提供 GM_* API）
    const tampermonkey = tryReadFile(rootDir, 'tampermonkey.js')
    if (tampermonkey != null) {
      scripts.tampermonkey = { script: tampermonkey }
    }

    // Github增强-高速下载（油猴用户脚本）：该文件没有 `==UserScript==` 头，不做头部解析，原样注入，由上面的油猴本体提供 GM_* API
    const githubEnhanced = tryReadFile(rootDir, 'GithubEnhanced-High-Speed-Download.user.js')
    if (githubEnhanced != null) {
      scripts.githubEnhanced = { script: githubEnhanced }
    }

    return scripts
  },
}

module.exports = api
