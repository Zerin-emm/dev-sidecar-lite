const URL = require('node:url')
const tunnelAgent = require('tunnel-agent')
const log = require('../../../utils/util.log.server')
const matchUtil = require('../../../utils/util.match')
const Agent = require('./ProxyHttpAgent')
const HttpsAgent = require('./ProxyHttpsAgent')

// 匹配形如 `[::1]` 或 `[::1]:443` 的 IPv6 地址（带或不带端口）
const IPv6_HOST_RE = /^(\[[^\]]+\])(?::(\d+))?$/

const util = exports

const httpsAgentCache = {}
const httpAgentCache = {}

let socketId = 0

let httpsOverHttpAgent, httpOverHttpsAgent, httpsOverHttpsAgent

function getTimeoutConfig (hostname, serverSetting) {
  const timeoutMapping = serverSetting.timeoutMapping

  const timeoutConfig = matchUtil.matchHostname(timeoutMapping, hostname, 'get timeoutConfig') || {}

  return {
    timeout: timeoutConfig.timeout || serverSetting.defaultTimeout || 15000,
    keepAliveTimeout: timeoutConfig.keepAliveTimeout || serverSetting.defaultKeepAliveTimeout || 30000,
  }
}

function createHttpsAgent (timeoutConfig, verifySsl) {
  const key = `${timeoutConfig.timeout}-${timeoutConfig.keepAliveTimeout}`
  if (!httpsAgentCache[key]) {
    verifySsl = !!verifySsl

    // 证书回调函数
    const checkServerIdentity = (host, cert) => {
      log.info(`checkServerIdentity: ${host}, CN: ${cert.subject.CN}, C: ${cert.subject.C || cert.issuer.C}, ST: ${cert.subject.ST || cert.issuer.ST}, bits: ${cert.bits}`)
    }

    const agent = new HttpsAgent({
      keepAlive: true,
      timeout: timeoutConfig.timeout,
      keepAliveTimeout: timeoutConfig.keepAliveTimeout,
      checkServerIdentity,
      rejectUnauthorized: verifySsl,
    })

    agent.unVerifySslAgent = new HttpsAgent({
      keepAlive: true,
      timeout: timeoutConfig.timeout,
      keepAliveTimeout: timeoutConfig.keepAliveTimeout,
      checkServerIdentity,
      rejectUnauthorized: false,
    })

    httpsAgentCache[key] = agent
    log.info('创建 HttpsAgent 成功, timeoutConfig:', timeoutConfig, ', verifySsl:', verifySsl)
  }
  return httpsAgentCache[key]
}

function createHttpAgent (timeoutConfig) {
  const key = `${timeoutConfig.timeout}-${timeoutConfig.keepAliveTimeout}`
  if (!httpAgentCache[key]) {
    httpAgentCache[key] = new Agent({
      keepAlive: true,
      timeout: timeoutConfig.timeout,
      keepAliveTimeout: timeoutConfig.keepAliveTimeout,
    })
    log.info('创建 HttpAgent 成功, timeoutConfig:', timeoutConfig)
  }
  return httpAgentCache[key]
}

function createAgent (protocol, timeoutConfig, verifySsl) {
  return protocol === 'https:'
    ? createHttpsAgent(timeoutConfig, verifySsl)
    : createHttpAgent(timeoutConfig)
}

/**
 * 判断本次请求是否已经处于「不校验上游证书」的状态。
 */
util.isUnVerifySsl = (rOptions) => {
  const agent = rOptions.agent
  if (agent && agent.options && agent.options.rejectUnauthorized === false) {
    return true
  }
  return rOptions.rejectUnauthorized === false
}

/**
 * 确保本次请求不再校验上游服务器的证书。
 *
 * 优先切换到 agent 上的 unVerifySslAgent（agent 是共享单例，不能直接改它的 options）；
 * 当 agent 不存在或没有 unVerifySslAgent 时（例如外部代理的 tunnel-agent，或历史上
 * `Connection: close` 造成的 agent === false），退化为在本次请求的 options 上设置
 * rejectUnauthorized = false —— node 在没有自定义 agent 时会用该选项创建连接，
 * 因此同样能关掉证书校验。
 *
 * SNI 改写（sni.js）、unVerifySsl 拦截、域名代理（proxy.js）、自动兼容程序
 * （createRequestHandler.js）都通过它降级校验：少了这一步，就会拿原域名的证书去校验
 * 被改写后的 servername，报 ERR_TLS_CERT_ALTNAME_INVALID，代理直接返回 500。
 *
 * @returns {boolean} true 表示本次调用关闭了证书校验；false 表示本来就没校验（无需改动）。
 */
util.unVerifySsl = (rOptions) => {
  if (util.isUnVerifySsl(rOptions)) {
    return false
  }
  if (rOptions.protocol !== 'https:') {
    // http 请求没有证书校验一说
    return false
  }

  const agent = rOptions.agent
  if (agent && agent.options && agent.unVerifySslAgent) {
    rOptions.agent = agent.unVerifySslAgent
    return true
  }

  rOptions.rejectUnauthorized = false
  return true
}

util.parseHostnameAndPort = (host, defaultPort) => {
  let arr = host.match(IPv6_HOST_RE) // 尝试解析IPv6
  if (arr) {
    arr = arr.slice(1)
    if (arr[1]) {
      arr[1] = Number.parseInt(arr[1], 10)
    }
  } else {
    arr = host.split(':')
    if (arr.length > 1) {
      arr[1] = Number.parseInt(arr[1], 10)
    }
  }

  if (defaultPort > 0 && (arr.length === 1 || arr[1] === undefined)) {
    arr[1] = defaultPort
  } else if (arr.length === 2 && arr[1] === undefined) {
    arr.pop()
  }

  return arr
}

util.getOptionsFromRequest = (req, ssl, externalProxy = null, serverSetting, compatibleConfig = null) => {
  // eslint-disable-next-line node/no-deprecated-api
  const urlObj = URL.parse(req.url)

  // 修复：当 ssl=true（请求来自HTTPS代理端口）但请求URL是绝对HTTP路径时，
  // 说明这是HTTP请求被错误发送到了HTTPS代理端口。
  // 例：GET http://example.com/path HTTP/1.1 被发送到HTTPS代理端口。
  // 此时应修正协议为HTTP，避免将HTTP请求以HTTPS方式转发到目标服务器。
  const isHttpAbsUrl = !!(urlObj.protocol === 'http:' && urlObj.hostname)
  const actualSsl = ssl && !isHttpAbsUrl
  const defaultPort = actualSsl ? 443 : 80
  const protocol = actualSsl ? 'https:' : 'http:'
  // 过滤 HTTP/2 伪头（:method, :path, :authority, :scheme），
  // 它们在上游 HTTP/1.1 请求中不合法
  const headers = Object.fromEntries(
    Object.entries(req.headers).filter(([key]) => !key.startsWith(':')),
  )
  let externalProxyUrl = null

  if (externalProxy) {
    if (typeof externalProxy === 'string') {
      externalProxyUrl = externalProxy
    } else if (typeof externalProxy === 'function') {
      try {
        externalProxyUrl = externalProxy(req, ssl)
      } catch (e) {
        log.error('externalProxy error:', e)
      }
    }
  }

  // 解析host和port
  const arr = util.parseHostnameAndPort(req.headers.host)
  const hostname = arr[0]
  const port = arr[1] || defaultPort

  delete headers['proxy-connection']
  let agent
  if (!externalProxyUrl) {
    // 无论客户端是否声明 `Connection: close`，都必须挂上 agent，不能置为 false：
    // agent 上除了超时配置，还挂着 unVerifySslAgent（见 createHttpsAgent），
    // SNI 改写（sni.js）、关闭证书校验（unVerifySsl.js）、域名代理（proxy.js）、
    // 自动兼容程序（createRequestHandler.js）都要靠它把校验降级为不校验。
    // 历史缺陷：这里曾在 `headers.connection === 'close'` 时设置 agent = false，
    // 于是 servername 被改写成 sni（例如 github.com → baidu.com）后，无法换成不校验证书的
    // agent，上游仍拿原域名的证书去校验 → ERR_TLS_CERT_ALTNAME_INVALID → 代理返回 500。
    // node 的 request 库默认就会发送 `Connection: close`，所以受影响的客户端不止一个。
    // 注意：`Connection: close` 的「不复用连接」语义保留在 headers 上即可 ——
    // 实测 node 的 Agent 收到请求头 connection: close 后不会把 socket 放回连接池（freeSockets 为空），
    // 等价于每次新建连接。
    const timeoutConfig = getTimeoutConfig(hostname, serverSetting)
    // log.info(`get timeoutConfig '${hostname}':`, timeoutConfig)
    agent = createAgent(protocol, timeoutConfig, serverSetting.verifySsl)
    if (headers.connection !== 'close') {
      // keepAlive
      headers.connection = 'keep-alive'
    }
  } else {
    agent = util.getTunnelAgent(protocol === 'https:', externalProxyUrl)
  }

  // 初始化options
  const options = {
    protocol,
    method: req.method,
    url: req.url,
    hostname,
    port,
    path: urlObj.path,
    headers,
    agent,
    compatibleConfig,
    // 增大响应头大小限制（默认 16KB），
    // 解决 issue #575 中 Google Cloud Console 等站点响应头过大导致的 HPE_HEADER_OVERFLOW 错误
    maxHeaderSize: 65536,
  }

  if (protocol === 'http:' && externalProxyUrl) {
    // eslint-disable-next-line node/no-deprecated-api
    const externalUrlObj = URL.parse(externalProxyUrl)
    if (externalUrlObj.protocol === 'http:') {
      options.hostname = externalUrlObj.hostname
      options.port = externalUrlObj.port
      options.path = `http://${externalUrlObj.host}${externalUrlObj.path}`
    }
  }

  // mark a socketId for Agent to bind socket for NTLM
  if (req.socket.customSocketId) {
    options.customSocketId = req.socket.customSocketId
  } else if (headers.authorization) {
    options.customSocketId = req.socket.customSocketId = socketId++
  }

  return options
}

util.getTunnelAgent = (requestIsSSL, externalProxyUrl) => {
  // eslint-disable-next-line node/no-deprecated-api
  const urlObj = URL.parse(externalProxyUrl)
  const protocol = urlObj.protocol || 'http:'
  let port = urlObj.port
  if (!port) {
    port = protocol === 'http:' ? 80 : 443
  }
  const hostname = urlObj.hostname || 'localhost'

  if (requestIsSSL) {
    if (protocol === 'http:') {
      if (!httpsOverHttpAgent) {
        httpsOverHttpAgent = tunnelAgent.httpsOverHttp({
          proxy: {
            host: hostname,
            port,
          },
        })
      }
      return httpsOverHttpAgent
    } else {
      if (!httpsOverHttpsAgent) {
        httpsOverHttpsAgent = tunnelAgent.httpsOverHttps({
          proxy: {
            host: hostname,
            port,
          },
        })
      }
      return httpsOverHttpsAgent
    }
  } else {
    if (protocol === 'http:') {
      return false
    } else {
      if (!httpOverHttpsAgent) {
        httpOverHttpsAgent = tunnelAgent.httpOverHttps({
          proxy: {
            host: hostname,
            port,
          },
        })
      }
      return httpOverHttpsAgent
    }
  }
}
