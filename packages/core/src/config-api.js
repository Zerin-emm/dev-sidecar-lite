const fs = require('node:fs')
const jsonApi = require('@docmirror/mitmproxy/src/json')
const lodash = require('lodash')
const defConfig = require('./config/index.js')
const mergeApi = require('./merge.js')
const Shell = require('./shell')
const log = require('./utils/util.log.core')
const configLoader = require('./config/local-config-loader')

let configTarget = lodash.cloneDeep(defConfig)

function get () {
  return configTarget
}

const configApi = {
  /**
   * 保存自定义的 config
   * @param newConfig
   */
  save (newConfig) {
    // 对比默认config的异同
    const defConfig = configApi.cloneDefault()

    // 计算新配置与默认配置的差异
    const diffConfig = mergeApi.doDiff(defConfig, newConfig)

    // 将差异作为用户配置保存到 config.json 中
    const configPath = configLoader.getUserConfigPath()
    try {
      fs.writeFileSync(configPath, jsonApi.stringify(diffConfig))
      log.info('保存 config.json 自定义配置文件成功:', configPath)
    } catch (e) {
      log.error('保存 config.json 自定义配置文件失败:', configPath, ', error:', e)
      throw e
    }

    // 重载配置
    const allConfig = configApi.set(diffConfig)

    return {
      diffConfig,
      allConfig,
    }
  },
  doMerge: mergeApi.doMerge,
  doDiff: mergeApi.doDiff,
  /**
   * 读取 config.json 后，合并配置
   */
  reload () {
    const userConfig = configLoader.getUserConfig()
    return configApi.set(userConfig) || {}
  },
  update (partConfig) {
    const newConfig = lodash.merge(configApi.get(), partConfig)
    configApi.save(newConfig)
  },
  get,
  set (newConfig) {
    if (newConfig == null) {
      log.warn('newConfig 为空，不做任何操作')
      return configTarget
    }
    return configApi.load(newConfig)
  },
  load (newConfig) {
    const config = configLoader.getConfigFromFiles(newConfig, defConfig)
    configTarget = config
    return config
  },
  /**
   * 获取用户配置文件（config.json）的绝对路径
   */
  getUserConfigPath () {
    return configLoader.getUserConfigPath()
  },
  cloneDefault () {
    return lodash.cloneDeep(defConfig)
  },
  addDefault (key, defValue) {
    lodash.set(defConfig, key, defValue)
  },
  // 移除用户配置，用于恢复出厂设置功能
  async removeUserConfig () {
    const configPath = configLoader.getUserConfigPath()
    if (fs.existsSync(configPath)) {
      // 读取 config.json 文件内容
      const fileOriginalStr = fs.readFileSync(configPath).toString()

      // 判断文件内容是否为空或空配置
      const fileStr = fileOriginalStr.replace(/\s/g, '')
      if (fileStr.length < 5) {
        try {
          fs.writeFileSync(configPath, '{}')
        } catch (e) {
          log.warn('简化用户配置文件失败:', configPath, ', error:', e)
        }
        return false // config.json 内容为空，或为空json
      }

      // 备份用户自定义配置文件
      const bakConfigPath = `${configPath}.${Date.now()}.bak.json`
      try {
        fs.writeFileSync(bakConfigPath, fileOriginalStr)
        log.info('备份用户配置文件成功:', bakConfigPath)
      } catch (e) {
        log.error('备份用户配置文件失败:', bakConfigPath, ', error:', e)
        throw e
      }
      // 原配置文件内容设为空
      try {
        fs.writeFileSync(configPath, '{}')
      } catch (e) {
        log.error('初始化用户配置文件失败:', configPath, ', error:', e)
        throw e
      }

      // 重新加载配置
      configApi.load(null)

      return true // 删除并重新加载配置成功
    } else {
      return false // config.json 文件不存在
    }
  },
  resetDefault (key) {
    if (key) {
      let value = lodash.get(defConfig, key)
      value = lodash.cloneDeep(value)
      lodash.set(configTarget, key, value)
    } else {
      configTarget = lodash.cloneDeep(defConfig)
    }
    return configTarget
  },
  async getVariables (type) {
    const method = type === 'npm' ? Shell.getNpmEnv : Shell.getSystemEnv
    const currentMap = await method()
    const list = []
    const map = configTarget.variables[type]
    for (const key in map) {
      const exists = currentMap[key] != null
      list.push({
        key,
        value: map[key],
        exists,
      })
    }
    return list
  },
  async setVariables (type) {
    const list = await configApi.getVariables(type)
    const noSetList = list.filter((item) => {
      return !item.exists
    })
    if (noSetList.length > 0) {
      const context = {
        root_ca_cert_path: configApi.get().server.setting.rootCaFile.certPath,
      }
      for (const item of noSetList) {
        if (item.value.includes('${')) {
          for (const key in context) {
            item.value = item.value.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), context[key])
          }
        }
      }
      const method = type === 'npm' ? Shell.setNpmEnv : Shell.setSystemEnv
      return method({ list: noSetList })
    }
  },
}

module.exports = configApi
