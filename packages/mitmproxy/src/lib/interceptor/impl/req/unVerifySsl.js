const util = require('../../../proxy/common/util')

module.exports = {
  name: 'unVerifySsl',
  priority: 124,
  requestIntercept (context, interceptOpt, req, res, ssl, next) {
    const { rOptions, log } = context

    if (util.unVerifySsl(rOptions)) {
      log.info(`unVerifySsl intercept: ${rOptions.hostname}, unVerifySsl`)
      res.setHeader('DS-Interceptor', 'unVerifySsl')
    } else {
      log.info(`unVerifySsl intercept: ${rOptions.hostname}, already unVerifySsl`)
      res.setHeader('DS-Interceptor', 'already unVerifySsl')
    }

    return true
  },
  is (interceptOpt) {
    return interceptOpt.unVerifySsl === true || interceptOpt.ssl === false
  },
}
