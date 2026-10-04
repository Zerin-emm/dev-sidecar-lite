const http = require('node:http')
const https = require('node:https')
const tls = require('node:tls')
const jsonApi = require('../../../json')
const log = require('../../../utils/util.log.server')
const RequestCounter = require('../../choice/RequestCounter')
const commonUtil = require('../common/util')
// const upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i
const DnsUtil = require('../../dns')
const { reportIPv6Error } = require('../../dns/base')
const compatible = require('../compatible/compatible')
const InsertScriptMiddleware = require('../middleware/InsertScriptMiddleware')
const dnsLookup = require('./dnsLookup')
const speedTest = require('../../speed')

const MAX_SLOW_TIME = 8000 // 超过此时间 则认为太慢了
const WWW_AUTH_HEADER_RE = /^www-authenticate$/i

// 失败重试：只对「幂等且无请求体」的方法重试一次
// 连接池里的死连接（keep-alive 竞态）和被 RST 的 IP 都能被这一层兜住，避免直接给用户报错误页
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH', 'ERR_STREAM_DESTROYED'])
const MAX_RETRY_COUNT = 1

// 可以把失败归因到「这个远端 IP 有问题」的错误码，用于把坏 IP 从存活列表里剔除
// 注意：不要把 ERR_STREAM_DESTROYED 放进来，那是我们自己 destroy() 产生的
const IP_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'])

// 取本次真正连上的远端 IP：连接池复用的 socket 不会再走 DNS lookup，
// isDnsIntercept 里没有 IP，只能从 socket 上拿。remoteAddress 可能是 ::ffff:x.x.x.x 形式
function getRemoteIp (proxyReq) {
  const socket = proxyReq && proxyReq.socket
  const ip = socket && socket.remoteAddress
  if (!ip) {
    return null
  }
  return ip.startsWith('::ffff:') ? ip.substring(7) : ip
}

// 按本次请求的 host/port 找到对应的测速器（与 dnsLookup 用的是同一个实例，key 一致）
function getTesterForRequest (rOptions) {
  const hostname = rOptions.host || rOptions.hostname
  if (!hostname || typeof hostname !== 'string') {
    return null
  }
  return speedTest.getSpeedTester(hostname, rOptions.port)
}

// create requestHandler function
module.exports = function createRequestHandler (createIntercepts, middlewares, externalProxy, dnsConfig, setting, compatibleConfig) {
  // return
  return function requestHandler (req, res, ssl) {
    let proxyReq
    let clientAborted = false // 客户端已断开/取消：重试没有任何意义

    const rOptions = commonUtil.getOptionsFromRequest(req, ssl, externalProxy, setting, compatibleConfig)
    let url = `${rOptions.method} ➜ ${rOptions.protocol}//${rOptions.hostname}:${rOptions.port}${rOptions.path}`

    if (rOptions.headers.connection === 'close') {
      req.socket && req.socket.setKeepAlive(false)
    } else if (rOptions.customSocketId != null) { // for NTLM
      req.socket && req.socket.setKeepAlive(true, 60 * 60 * 1000)
    } else {
      req.socket && req.socket.setKeepAlive(true, 30000)
    }
    const context = {
      rOptions,
      log,
      RequestCounter,
      setting,
    }
    let interceptors = createIntercepts(context)
    if (interceptors == null) {
      interceptors = []
    }
    const reqIncpts = interceptors.filter((item) => {
      return item.requestIntercept != null
    })
    const resIncpts = interceptors.filter((item) => {
      return item.responseIntercept != null
    })

    const requestInterceptorPromise = () => {
      return new Promise((resolve, reject) => {
        const next = () => {
          resolve()
        }
        try {
          if (setting.script.enabled) {
            reqIncpts.unshift(InsertScriptMiddleware)
          }
          for (const middleware of middlewares) {
            reqIncpts.push(middleware)
          }
          if (reqIncpts && reqIncpts.length > 0) {
            for (const reqIncpt of reqIncpts) {
              if (!reqIncpt.requestIntercept) {
                continue
              }
              const goNext = reqIncpt.requestIntercept(context, req, res, ssl, next)
              if (goNext) {
                if (goNext !== 'no-next') {
                  next()
                }
                return
              }
            }
            next()
          } else {
            next()
          }
        } catch (e) {
          reject(e)
        }
      })
    }

    function countSlow (isDnsIntercept, reason) {
      if (isDnsIntercept && isDnsIntercept.dns && isDnsIntercept.ip !== isDnsIntercept.hostname) {
        const { dns, ip, hostname } = isDnsIntercept
        dns.count(hostname, ip, true)
        log.error(`记录ip失败次数，用于优选ip！ hostname: ${hostname}, ip: ${ip}, reason: ${reason}, dns: ${dns.dnsName}`)
      }
      const counter = context.requestCount
      if (counter != null) {
        counter.count.doCount(counter.value, true)
        log.error(`记录Proxy请求失败次数，用于切换备选域名！ hostname: ${counter.value}, reason: ${reason}, counter.count:`, counter.count)
      }
    }

    // 判断本次失败能否安全重试：只重试幂等、无请求体、响应尚未开始的请求
    function canRetryRequest (e) {
      if (clientAborted || res.headersSent || res.writableEnded) {
        return false
      }
      if (!RETRYABLE_METHODS.has((rOptions.method || 'GET').toUpperCase())) {
        return false
      }
      // 请求体必须已完整收完：否则数据已经发给了那条坏连接，重试会丢 body
      if (!req.complete) {
        return false
      }
      if (e && e.code && RETRYABLE_ERROR_CODES.has(e.code)) {
        return true
      }
      // 7 秒连接超时 / 请求空闲超时：换一个 IP 再试一次
      const msg = e && e.message
      return typeof msg === 'string' && (msg.startsWith('连接超时') || msg.startsWith('代理请求超时'))
    }

    const proxyRequestPromise = async () => {
      rOptions.host = rOptions.hostname || rOptions.host || 'localhost'
      return new Promise((resolve, reject) => {
        // use the binded socket for NTLM
        if (rOptions.agent && rOptions.customSocketId != null && rOptions.agent.getName) {
          const socketName = rOptions.agent.getName(rOptions)
          const bindingSocket = rOptions.agent.sockets[socketName]
          if (bindingSocket && bindingSocket.length > 0) {
            bindingSocket[0].once('free', onFree)
            return
          }
        }
        onFree()

        function onFree () {
          url = `${rOptions.method} ➜ ${rOptions.protocol}//${rOptions.hostname}:${rOptions.port}${rOptions.path}`
          const start = Date.now()
          log.info('发起代理请求:', url, (rOptions.servername ? `, sni: ${rOptions.servername}` : ''), ', headers:', jsonApi.stringify2(rOptions.headers))

          const isDnsIntercept = {}
          if (dnsConfig && dnsConfig.dnsMap) {
            let dnsAndFamily = DnsUtil.getDNSAndFamily(dnsConfig, rOptions.hostname)
            if (!dnsAndFamily && rOptions.servername) {
              const dns = dnsConfig.dnsMap.ForSNI
              if (dns) {
                dnsAndFamily = { dns }
                log.info(`域名 ${rOptions.hostname} 在dns中未配置，但使用了 sni: ${rOptions.servername}, 必须使用dns，现默认使用 '${dnsAndFamily.dnsName}' DNS.`)
              } else {
                log.warn(`域名 ${rOptions.hostname} 在dns中未配置，但使用了 sni: ${rOptions.servername}，然而DNS服务管理中，并未指定SNI默认使用的DNS。`)
              }
            }
            if (dnsAndFamily) {
              rOptions.lookup = dnsLookup.createLookupFunc(res, dnsAndFamily, 'request url', url, rOptions.port, isDnsIntercept)
              if (dnsAndFamily.family === 6) {
                rOptions.family = 6
              }
              log.debug(`域名 ${rOptions.hostname} DNS: ${dnsAndFamily.dns.dnsName}, family: ${rOptions.family || 4}`)
              res.setHeader('DS-DNS', dnsAndFamily.dns.dnsName === '预设IP' ? 'PreSet' : dnsAndFamily.dns.dnsName.replace(/[^\x20-\x7E]/g, ''))
            } else {
              log.info(`域名 ${rOptions.hostname} 在DNS中未配置`)
            }
          } else {
            log.info(`域名 ${rOptions.hostname} DNS配置不存在`)
          }

          res.setHeader('DS-Proxy-Request', `${rOptions.protocol}//${rOptions.hostname}:${rOptions.port}${req.url}`)

          // 自动兼容程序：2
          if (rOptions.agent) {
            const compatibleConfig = compatible.getRequestCompatibleConfig(rOptions, rOptions.compatibleConfig)
            if (compatibleConfig && compatibleConfig.rejectUnauthorized === false && commonUtil.unVerifySsl(rOptions)) {
              log.info(`【自动兼容程序】${rOptions.hostname}:${rOptions.port}: 设置 'rejectUnauthorized = false'（不校验上游证书）`)
              res.setHeader('DS-Compatible', 'unVerifySsl')
            }
          }

          res.setHeader('DS-Proxy-Request-Family', rOptions.family || 4)

          // SNI 伪装（例如 github.com ➜ baidu.com）：servername 被改写后，Node 默认会拿改写后的
          // servername 去校验证书，必然报 ERR_TLS_CERT_ALTNAME_INVALID。历史上为了绕开这个错误，
          // 直接在 sni.js 里把整条请求的证书校验关掉（rejectUnauthorized=false）——代价是任何受信 CA
          // 签发的证书都能冒充该域名。这里改为：证书链仍由 rejectUnauthorized 校验，域名匹配改成
          // 按【真实域名】校验（规则里显式写了 verifyHost 时，按 verifyHost 校验）。
          // 注意：走 proxy 拦截器时 rOptions.hostname 已被改成代理目标（见 proxy.js 的 doProxy），
          // 那种情况下 proxy.js 会自行把 agent 换成 unVerifySslAgent，这里的覆盖不参与校验。
          if (rOptions.protocol === 'https:') {
            const realHost = rOptions.hostname
            if (rOptions.servername == null) {
              rOptions.servername = realHost
            }
            const verifyHost = (rOptions.verifyHost != null && rOptions.verifyHost !== '') ? rOptions.verifyHost : realHost
            if (rOptions.servername !== realHost || verifyHost !== realHost) {
              rOptions.checkServerIdentity = (_host, cert) => tls.checkServerIdentity(verifyHost, cert)
            }
          }

          proxyReq = (rOptions.protocol === 'https:' ? https : http).request(rOptions, (proxyRes) => {
            const cost = Date.now() - start
            if (rOptions.protocol === 'https:') {
              log.info(`代理请求返回: 【${proxyRes.statusCode}】${url}, cost: ${cost} ms`)
            } else {
              log.info(`请求返回: 【${proxyRes.statusCode}】${url}, cost: ${cost} ms`)
            }

            // 按需探测反馈：IP 连接成功
            if (isDnsIntercept && isDnsIntercept.tester) {
              isDnsIntercept.tester.reportProbeResult(isDnsIntercept.ip, true)
            }
            // log.info('request:', proxyReq, proxyReq.socket)

            if (cost > MAX_SLOW_TIME) {
              countSlow(isDnsIntercept, `代理请求成功但太慢, cost: ${cost} ms > ${MAX_SLOW_TIME} ms`)
            }

            resolve(proxyRes)
          })

          // 代理请求的事件监听
          // 连接超时定时器：OS 级 TCP 超时 15-21 秒太慢，7 秒内未建立连接则判定 IP 不通
          let connectionTimer = setTimeout(() => {
            if (isDnsIntercept && isDnsIntercept.tester && isDnsIntercept.ip) {
              isDnsIntercept.tester.reportProbeResult(isDnsIntercept.ip, false)
            }
            const cost = Date.now() - start
            const errorMsg = `连接超时: ${url}, cost: ${cost} ms`
            log.error(errorMsg, ', rOptions:', jsonApi.stringify2(rOptions))
            countSlow(isDnsIntercept, `连接超时, cost: ${cost} ms`)
            proxyReq.destroy(new Error(errorMsg))
          }, 7000)
          proxyReq.once('socket', (socket) => {
            // 关键修复：从连接池复用的 keep-alive socket 已经是 connected 状态，
            // 永远不会再触发 'connect' 事件；若不在这里清掉定时器，它会在请求开始约 7 秒后
            // 无差别 destroy() 掉这条健康连接（日志里表现为请求已成功返回后又出现 连接超时）
            if (!socket.connecting) {
              clearTimeout(connectionTimer)
              connectionTimer = null
              return
            }
            socket.once('connect', () => {
              clearTimeout(connectionTimer)
              connectionTimer = null
            })
          })
          proxyReq.once('response', () => {
            // 收到响应说明连接早已建立，同样要清掉连接超时定时器
            if (connectionTimer) {
              clearTimeout(connectionTimer)
              connectionTimer = null
            }
          })

          proxyReq.on('timeout', () => {
            if (connectionTimer) { clearTimeout(connectionTimer); connectionTimer = null }
            const cost = Date.now() - start
            const errorMsg = `代理请求超时: ${url}, cost: ${cost} ms`
            log.error(errorMsg, ', rOptions:', jsonApi.stringify2(rOptions))
            countSlow(isDnsIntercept, `代理请求超时, cost: ${cost} ms`)
            proxyReq.end()
            proxyReq.destroy()
            const error = new Error(errorMsg)
            error.code = 'ETIMEOUT'
            error.status = 408
            reject(error)
          })
          proxyReq.on('error', (e) => {
            if (connectionTimer) { clearTimeout(connectionTimer); connectionTimer = null }
            // 上报失败 IP：优先用 DNS lookup 记下的 IP；连接池复用的 socket 没有走 lookup，
            // 就用 socket.remoteAddress 兜底，否则坏 IP 永远不会被剔除、后续请求会一直复用它。
            // 客户端主动取消（clientAborted）不能算成 IP 的问题。
            let failedIp = isDnsIntercept && isDnsIntercept.ip
            if (!failedIp && !clientAborted && e && IP_ERROR_CODES.has(e.code)) {
              failedIp = getRemoteIp(proxyReq)
            }
            if (failedIp) {
              const tester = (isDnsIntercept && isDnsIntercept.tester) || getTesterForRequest(rOptions)
              if (tester) {
                tester.reportProbeResult(failedIp, false)
              }
            }
            const cost = Date.now() - start
            log.error(`代理请求错误: ${url}, cost: ${cost} ms, error:`, e, ', rOptions:', jsonApi.stringify2(rOptions))
            countSlow(isDnsIntercept, `代理请求错误: ${e.message}`)
            if (e.code === 'ENETUNREACH' && isDnsIntercept && isDnsIntercept.ip) {
              reportIPv6Error(isDnsIntercept.ip)
            }
            reject(e)

            // 自动兼容程序：2
            if (e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
              compatible.setRequestRejectUnauthorized(rOptions, false)
            }
          })
          proxyReq.on('aborted', () => {
            const cost = Date.now() - start
            const errorMsg = `代理请求被取消: ${url}, cost: ${cost} ms`
            log.error(errorMsg, ', rOptions:', jsonApi.stringify2(rOptions))

            if (cost > MAX_SLOW_TIME) {
              countSlow(isDnsIntercept, `代理请求被取消，且请求太慢, cost: ${cost} ms > ${MAX_SLOW_TIME} ms`)
            }

            if (res.writableEnded) {
              return
            }
            reject(new Error(errorMsg))
          })

          // 设置代理请求超时（避免请求无限挂起）
          // agent.options.timeout 是连接池空闲超时（20s），不适合直接用作请求超时。
          // request timeout 是 socket 空闲超时：socket 上多久无数据即判定超时。
          // 部分站点响应慢（如 Google Cloud），默认 60 秒，最小 10 秒。
          const agentTimeout = (rOptions.agent && rOptions.agent.options && rOptions.agent.options.timeout) || 30000
          const reqTimeout = Math.max(agentTimeout * 2, 10000)
          proxyReq.setTimeout(reqTimeout)

          // 原始请求的事件监听
          req.on('aborted', () => {
            clientAborted = true
            const cost = Date.now() - start
            const errorMsg = `请求被取消: ${url}, cost: ${cost} ms`
            log.error(errorMsg, ', rOptions:', jsonApi.stringify2(rOptions))
            proxyReq.destroy()
            if (res.writableEnded) {
              return
            }
            reject(new Error(errorMsg))
          })
          req.on('error', (e) => {
            clientAborted = true
            const cost = Date.now() - start
            log.error(`请求错误: ${url}, cost: ${cost} ms, error:`, e, ', rOptions:', jsonApi.stringify2(rOptions))
            reject(e)
          })
          req.on('timeout', () => {
            clientAborted = true
            const cost = Date.now() - start
            const errorMsg = `请求超时: ${url}, cost: ${cost} ms`
            log.error(errorMsg, ', rOptions:', jsonApi.stringify2(rOptions))
            reject(new Error(errorMsg))
          })
          req.pipe(proxyReq)
        }
      })
    }

    // workflow control
    (async () => {
      await requestInterceptorPromise()

      if (res.writableEnded) {
        // log.info('res is writableEnded, return false')
        return false
      }

      let proxyRes
      let retryCount = 0
      for (;;) {
        try {
          proxyRes = await proxyRequestPromise()
          break
        } catch (e) {
          if (retryCount >= MAX_RETRY_COUNT || !canRetryRequest(e)) {
            throw e
          }
          retryCount++
          log.warn(`代理请求失败，换 IP 重试(第 ${retryCount} 次): ${url}, error: ${e && e.message}`)
          if (!res.headersSent) {
            res.removeHeader('DS-DNS-Lookup') // 清掉上一次尝试留下的旧 IP 调试头
          }
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
      }

      // proxyRes.on('data', (chunk) => {
      //   // log.info('BODY: ')
      // })
      proxyRes.on('error', (error) => {
        countSlow(null, `error: ${error.message}`)
        log.error(`proxy res error: ${url}, error:`, error)
      })

      const responseInterceptorPromise = new Promise((resolve, reject) => {
        const next = () => {
          resolve()
        }
        for (const middleware of middlewares) {
          if (middleware.responseInterceptor) {
            middleware.responseInterceptor(req, res, proxyReq, proxyRes, ssl, next)
          }
        }
        if (!setting.script.enabled) {
          next()
          return
        }
        try {
          if (resIncpts && resIncpts.length > 0) {
            let head = ''
            let body = ''
            for (const resIncpt of resIncpts) {
              const append = resIncpt.responseIntercept(context, req, res, proxyReq, proxyRes, ssl, next)
              // 判断是否已经关闭
              if (res.writableEnded) {
                next()
                return
              }
              if (append) {
                if (append.head) {
                  head += append.head
                }
                if (append.body) {
                  body += append.body
                }
              } else if (append === false) {
                break // 返回false表示终止拦截器，跳出循环
              }
            }
            InsertScriptMiddleware.responseInterceptor(req, res, proxyReq, proxyRes, ssl, next, {
              head,
              body,
            })
          } else {
            next()
          }
        } catch (e) {
          reject(e)
        }
      })

      await responseInterceptorPromise

      if (!res.headersSent) { // prevent duplicate set headers
        // HTTP/2 禁止头，上游服务器可能返回，直传会导致 http2 模块抛异常
        const HTTP2_FORBIDDEN = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'http2-settings'])
        Object.keys(proxyRes.headers).forEach((key) => {
          if (proxyRes.headers[key] !== undefined) {
            // https://github.com/nodejitsu/node-http-proxy/issues/362
            if (WWW_AUTH_HEADER_RE.test(key)) {
              if (proxyRes.headers[key]) {
                proxyRes.headers[key] = proxyRes.headers[key] && proxyRes.headers[key].split(',')
              }
              key = 'www-authenticate'
            }
            if (HTTP2_FORBIDDEN.has(key)) {
              return
            }
            res.setHeader(key, proxyRes.headers[key])
          }
        })

        if (proxyRes.statusCode >= 400) {
          countSlow(null, `Status return: ${proxyRes.statusCode}`)
        }
        res.writeHead(proxyRes.statusCode)
        proxyRes.pipe(res)
      }
    })().catch((e) => {
      if (!res.writableEnded) {
        try {
          const status = e.status || 500

          const headers = { 'Content-Type': 'text/html;charset=UTF8' }

          // headers.Access-Control-Allow-*：避免跨域问题
          if (rOptions.headers.origin) {
            headers['Access-Control-Allow-Credentials'] = 'true'
            headers['Access-Control-Allow-Origin'] = rOptions.headers.origin
            headers['Vary'] = 'Origin'
          }

          res.writeHead(status, headers)
          res.write(`<style>
            p {
              margin: 10px 0;
              color: white;
              background-color: black;
            }
          </style>
          <p>DevSidecar Error:</p>
          <p>目标网站请求错误：【${e.code || (e.status || 'UNKNOWN')}】 ${e.message}</p>
          <p>目标地址：${rOptions.protocol}//${rOptions.hostname}:${rOptions.port}${rOptions.path}</p>`,
          )
        } catch {
          // do nothing
        }

        try {
          res.end()
        } catch {
          // do nothing
        }

        // region 忽略部分已经打印过ERROR日志的错误
        if (e.message) {
          const ignoreErrors = [
            '代理请求错误: ',
            '代理请求超时: ',
            '代理请求被取消: ',
          ]
          for (const ignoreError of ignoreErrors) {
            if (e.message.startsWith(ignoreError)) {
              return
            }
          }
        }
        // endregion

        log.error(`Request error: ${url}, error:`, e)
      }
    })
  }
}
