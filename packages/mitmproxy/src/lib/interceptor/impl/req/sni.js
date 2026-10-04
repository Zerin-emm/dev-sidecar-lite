const util = require('../../../proxy/common/util')

module.exports = {
  name: 'sni',
  priority: 123,
  requestIntercept (context, interceptOpt, req, res, ssl, next) {
    const { rOptions, log } = context

    if (interceptOpt.sni != null) {
      rOptions.servername = interceptOpt.sni
    }

    // 证书名字确实与真实域名不同的站点（例如故意用另一个真实域名的 SNI：huggingface.co 走
    // huggingface.cn），可以用 verifyHost 显式声明「请用这个域名校验证书」。
    if (interceptOpt.verifyHost != null && interceptOpt.verifyHost !== '') {
      rOptions.verifyHost = interceptOpt.verifyHost
    }

    // 注意：这里【不再】无条件关闭证书校验。
    // servername 被改写后，createRequestHandler.js 会按【真实域名】（或 verifyHost）覆盖
    // checkServerIdentity —— 证书链照旧校验、域名按真实域名校验，既不报
    // ERR_TLS_CERT_ALTNAME_INVALID，也不必放弃校验（历史做法是整条请求 rejectUnauthorized=false，
    // 等于任何受信 CA 签的证书都能冒充该域名）。
    // 只有规则显式声明 unVerifySsl: true（自签名、或证书确实对不上）时才降级。
    if (interceptOpt.unVerifySsl === true) {
      util.unVerifySsl(rOptions)
    }
    const unVerifySsl = util.isUnVerifySsl(rOptions)

    const sniStr = interceptOpt.sni != null ? interceptOpt.sni : '(unchanged)'
    const verifyHostStr = rOptions.verifyHost ? `, verifyHost: ${rOptions.verifyHost}` : ''
    const unVerifySslStr = unVerifySsl ? ', unVerifySsl' : ''
    res.setHeader('DS-Interceptor', `sni: ${sniStr}${verifyHostStr}${unVerifySslStr}`)

    log.info(`sni intercept: sni replace servername: ${rOptions.hostname} ➜ ${rOptions.servername}${verifyHostStr}${unVerifySslStr}`)
    return true
  },
  is (interceptOpt) {
    // proxy 生效时 sni 不需要生效，因为 proxy 中也会使用 sni 覆盖 rOptions.servername
    // 只配了 verifyHost 的规则也要生效，否则没人把 verifyHost 写到 rOptions 上
    if (interceptOpt.proxy) {
      return false
    }
    return !!interceptOpt.sni || interceptOpt.verifyHost != null
  },
}
