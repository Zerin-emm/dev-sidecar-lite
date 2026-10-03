const util = require('../../../proxy/common/util')

module.exports = {
  name: 'sni',
  priority: 123,
  requestIntercept (context, interceptOpt, req, res, ssl, next) {
    const { rOptions, log } = context

    rOptions.servername = interceptOpt.sni
    // servername 被改写后，必须关闭证书校验（否则会拿原域名的证书去校验新的 servername）
    util.unVerifySsl(rOptions)
    const unVerifySsl = util.isUnVerifySsl(rOptions)

    const unVerifySslStr = unVerifySsl ? ', unVerifySsl' : ''
    res.setHeader('DS-Interceptor', `sni: ${interceptOpt.sni}${unVerifySslStr}`)

    log.info(`sni intercept: sni replace servername: ${rOptions.hostname} ➜ ${rOptions.servername}${unVerifySslStr}`)
    return true
  },
  is (interceptOpt) {
    return !!interceptOpt.sni && !interceptOpt.proxy // proxy生效时，sni不需要生效，因为proxy中也会使用sni覆盖 rOptions.servername
  },
}
