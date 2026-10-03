const net = require('node:net')
const _ = require('lodash')
const log = require('../../utils/util.log.server')
const config = require('./config.js')
const matchUtil = require('../../utils/util.match.js')
const { configFromFiles } = require('@docmirror/dev-sidecar/src/config/index.js')

const familyMapping = matchUtil.domainMapRegexply(configFromFiles.server.dns.familyMapping)

const DISABLE_TIMEOUT = 60 * 60 * 1000
// 实际请求失败过的 IP 的冷却时间：TCP 能连上不代表能用（被 RST/黑洞的 IP 也能完成三次握手），
// 冷却期内即使 TCP 测速成功也不重新启用，避免“能连但一用就断”的 IP 长期占据 alive[0]
const FAILED_IP_COOLDOWN = 10 * 60 * 1000

class SpeedTester {
  constructor ({ hostname, port }) {
    this.dnsMap = config.getConfig().dnsMap

    this.hostname = hostname
    this.port = port || 443

    this.ready = false
    this.alive = []
    this.backupList = []

    this.testCount = 0
    this.lastReadTime = Date.now()
    this.keepCheckIntervalId = false

    this.tryTestCount = 0
    this.isTesting = false
    this.isTestingBackups = false

    this._probeIndex = 0 // 按需探测的轮转索引

    this.test() // 异步：初始化完成后先测速一次
  }

  // 按需探测：SpeedTester 未就绪时，轮转分配未失败 IP，并发请求自动分散
  pickNextForProbing () {
    // 第一轮：优先选未探测、未失败的 IP
    const fresh = this.backupList.filter(item =>
      item.status !== 'failed' && !item._probing,
    )
    if (fresh.length > 0) {
      this._probeIndex = this._probeIndex % fresh.length
      const pick = fresh[this._probeIndex]
      this._probeIndex++
      pick._probing = true
      return pick
    }
    // 第二轮：全部都在探测中，允许复用，总比回退到 DNS 缓存好
    const retry = this.backupList.filter(item => item.status !== 'failed')
    if (retry.length > 0) {
      this._probeIndex = this._probeIndex % retry.length
      return retry[this._probeIndex++]
    }
    return null
  }

  // 按需探测结果反馈：记录 IP 成败，供后续请求决策
  reportProbeResult (host, success) {
    const item = this.backupList.find(i => i.host === host)
    if (!item) return
    item._probing = false
    if (success) {
      item.status = 'success'
      item.time = item.time || 1
      item.failTime = null
      // alive 里可能是 _doTest 放进去的副本，这里按 host 去重，避免每次成功都往数组里塞重复项
      if (!this.alive.some(i => i.host === item.host)) {
        this.alive.push(item)
      }
    } else {
      item.status = 'failed'
      item.failTime = Date.now()
      item.failCount = (item.failCount || 0) + 1
      // 关键修复：失败 IP 必须从 alive 中剔除，否则 pickFastAliveIpObj() 会一直返回它
      this.alive = this.alive.filter(i => i.host !== host)
    }
  }

  pickFastAliveIpObj () {
    this.touch()

    // 兜底：alive 中可能残留历史失败项
    if (this.alive.length > 0 && this.alive.some(i => i.status === 'failed')) {
      this.alive = this.alive.filter(i => i.status !== 'failed')
    }

    if (this.alive.length === 0) {
      if (this.backupList.length > 0 && this.tryTestCount % 10 > 0) {
        this.testBackups() // 异步
      } else if (this.tryTestCount % 10 === 0) {
        this.test() // 异步
      }
      this.tryTestCount++

      return null
    }
    return this.alive[0]
  }

  touch () {
    this.lastReadTime = Date.now()
    if (!this.keepCheckIntervalId) {
      this.startChecker()
    }
  }

  startChecker () {
    if (this.keepCheckIntervalId) {
      clearInterval(this.keepCheckIntervalId)
    }
    this.keepCheckIntervalId = setInterval(() => {
      if (Date.now() - DISABLE_TIMEOUT > this.lastReadTime) {
        // 超过很长时间没有访问，取消测试
        clearInterval(this.keepCheckIntervalId)
        this.keepCheckIntervalId = false
        return
      }
      if (this.alive.length > 0) {
        this.testBackups() // 异步
      } else {
        this.test() // 异步
      }
    }, config.getConfig().interval)
  }

  async getIpListFromDns (dnsMap) {
    const ips = {}
    const promiseList = []
    for (const dnsKey in dnsMap) {
      const dns = dnsMap[dnsKey]
      const one = this.getFromOneDns(dns).then((ipList) => {
        if (ipList && ipList.length > 0) {
          for (const ip of ipList) {
            ips[ip] = { dns: ipList.isPreSet === true ? '预设IP' : dnsKey }
          }
        }
      })
      promiseList.push(one)
    }
    await Promise.all(promiseList)

    const items = []
    for (const ip in ips) {
      items.push({ host: ip, dns: ips[ip].dns })
    }
    return items
  }

  async getFromOneDns (dns) {
    const family = Number.parseInt(matchUtil.matchHostname(familyMapping, this.hostname, 'get family')) === 6 ? 6 : 4
    return await dns._lookupWithPreSetIpList(this.hostname, { family })
  }

  async test () {
    if (this.isTesting) {
      log.debug(`[speed] test skipped (already running): ${this.hostname}`)
      return
    }
    this.isTesting = true
    this.testCount++
    log.debug(`[speed] test start: ${this.hostname}, testCount: ${this.testCount}`)

    try {
      const newList = await this.getIpListFromDns(this.dnsMap)
      const newBackupList = [...newList, ...this.backupList]
      this.backupList = _.unionBy(newBackupList, 'host')
      await this.testBackups()
      log.info(`[speed] test end: ${this.hostname} ➜ ip-list:`, this.backupList, `, testCount: ${this.testCount}`)
      if (config.notify) {
        config.notify({ key: 'test' })
      }
    } catch (e) {
      log.error(`[speed] test failed: ${this.hostname}, testCount: ${this.testCount}, error:`, e)
    } finally {
      this.isTesting = false
    }
  }

  async testBackups () {
    if (this.isTestingBackups) {
      log.debug(`[speed] testBackups skipped (already running): ${this.hostname}`)
      return
    }
    this.isTestingBackups = true

    try {
      if (this.backupList.length > 0) {
        const aliveList = []

        const testAll = []
        for (const item of this.backupList) {
          testAll.push(this._doTest(item, aliveList))
        }
        await Promise.all(testAll)

        // 全部测速完成后，根据耗时进行排序
        aliveList.sort((a, b) => a.time - b.time)
        this.backupList.sort((a, b) => {
          if (a.time === b.time) {
            return 0
          }
          if (a.time == null) {
            return 1
          }
          if (b.time == null) {
            return -1
          }
          return a.time - b.time
        })

        this.alive = aliveList
      }

      this.ready = true
    } finally {
      this.isTestingBackups = false
    }
  }

  async _doTest (item, aliveList) {
    try {
      const ret = await this.testOne(item)
      item.title = `${ret.by}测速成功：${ret.target}`
      // 冷却期内的 IP 不复活：TCP 通的 IP 也可能一用就被 RST（TCP 握手不代表可用）
      if (item.failTime && Date.now() - item.failTime < FAILED_IP_COOLDOWN) {
        const now = Date.now()
        const hasOtherCandidate = this.backupList.some(i => i.host !== item.host && (!i.failTime || now - i.failTime >= FAILED_IP_COOLDOWN))
        if (hasOtherCandidate) {
          log.warn(`[speed] test success but ip in failed-cooldown: ${this.hostname} ➜ ${item.host}:${this.port} from DNS '${item.dns}', failCount: ${item.failCount}`)
          return
        }
        // 所有备用 IP 都在冷却中：宁可再试一次，也不能让 alive 为空（否则会退化成系统 DNS）
        log.warn(`[speed] all backup ip in failed-cooldown, revive it: ${this.hostname} ➜ ${item.host}:${this.port} from DNS '${item.dns}'`)
      }
      log.info(`[speed] test success: ${this.hostname} ➜ ${item.host}:${this.port} from DNS '${item.dns}'`)
      _.merge(item, ret)
      aliveList.push({ ...ret, ...item })
    } catch (e) {
      if (item.time == null) {
        item.title = e.message
        item.status = 'failed'
      }
      if (!e.message.includes('timeout')) {
        log.warn(`[speed] test error:   ${this.hostname} ➜ ${item.host}:${this.port} from DNS '${item.dns}', errorMsg: ${e.message}`)
      }
    }
  }

  testByTCP (item) {
    return new Promise((resolve, reject) => {
      const { host, dns } = item
      const startTime = Date.now()

      let isOver = false
      const timeout = 5000
      let timeoutId = null

      const client = net.createConnection({ host, port: this.port, family: host.includes(':') ? 6 : 4 }, () => {
        isOver = true
        clearTimeout(timeoutId)

        const connectionTime = Date.now()
        resolve({ status: 'success', by: 'TCP', target: `${host}:${this.port}`, time: connectionTime - startTime })
        client.end()
      })
      client.on('error', (e) => {
        isOver = true
        clearTimeout(timeoutId)

        log.warn('[speed] test by TCP error:  ', this.hostname, `➜ ${host}:${this.port} from DNS '${dns}', cost: ${Date.now() - startTime} ms, errorMsg:`, e.message)
        reject(e)
        client.destroy()
      })

      timeoutId = setTimeout(() => {
        if (!isOver) {
          isOver = true
          log.warn('[speed] test by TCP timeout:', this.hostname, `➜ ${host}:${this.port} from DNS '${dns}', cost: ${Date.now() - startTime} ms`)
          reject(new Error('timeout'))
          client.destroy()
        }
      }, timeout)
    })
  }

  testOne (item) {
    return new Promise((resolve, reject) => {
      const thenFun = (ret) => {
        resolve(ret)
      }

      // 先用TCP测速
      this.testByTCP(item)
        .then(thenFun)
        .catch((e) => {
          reject(new Error(`TCP测速失败：${item.host}:${this.port} ${e.message}`))
        })
    })
  }
}

module.exports = SpeedTester
