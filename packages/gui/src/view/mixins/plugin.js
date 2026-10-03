import lodash from 'lodash'
import DsContainer from '../components/container'

// 平台名映射，与主进程 packages/core/src/shell/shell.js 的 getSystemPlatform() 保持一致
const PLATFORM_NAME_MAP = { darwin: 'mac', linux: 'linux', win32: 'windows', win64: 'windows' }

// 渲染进程里可以同步拿到平台（Electron 的 process.platform），
// 比走一次 IPC 快得多，而且能让首帧就带上 v-if="isWindows()" 的表单项：
// 否则表单项会在页面画好之后才「凭空插入」，把下面的内容顶下去。
function getSystemPlatformSync () {
  try {
    return PLATFORM_NAME_MAP[process.platform] || 'unknown-os'
  } catch (e) {
    return 'unknown-os'
  }
}

export default {
  components: {
    DsContainer,
  },
  data () {
    return {
      key: undefined,
      config: undefined,
      status: {},
      labelCol: { span: 5 },
      wrapperCol: { span: 19 },
      resetDefaultLoading: false,
      applyLoading: false,
      systemPlatform: getSystemPlatformSync(),
    }
  },
  created () {
    // 首帧就用启动时已经取到的全局配置渲染（见 packages/gui/src/view/index.js 的 initPre：
    // $global.config = await api.config.get()，只读主进程内存，很快）。
    // 不能在这里等 config.reload()：那是「读 config.json + 多层远程配置合并」的一次 IPC，
    // 页面会先渲染空容器（如 packages/gui/src/view/pages/proxy.vue:98 的 v-if="config"），
    // 等它回来才「弹出」整个表单 —— 观感上就是切页卡顿 / 系统代理页空白约 1 秒。
    // 这里同步先赋值，init() 里的 reloadConfig() 仍会异步再取一次最新配置覆盖它。
    const globalConfig = this.$global && this.$global.config
    if (globalConfig) {
      this.setConfig(lodash.cloneDeep(globalConfig))
    }
    this.init()
  },
  mounted () {
  },
  methods: {
    getKey () {
      if (this.key) {
        return this.key
      }
      throw new Error('请设置key')
    },
    async init () {
      this.status = this.$status
      // systemPlatform 已在 data() 里同步取好（见文件顶部 getSystemPlatformSync），
      // 这里不再 await 任何平台相关的 IPC：页面首帧就能画出 v-if="isWindows()" 的项，
      // 既不会「凭空插入」，也不会像 Promise.all 那样让每个页面都多等一次 IPC。
      await this.reloadConfig()
      this.printConfig('Init, ')
      // 兜底：万一渲染进程里取不到 process.platform，再异步补一次（正常情况下不会走到）
      if (!this.systemPlatform || this.systemPlatform === 'unknown-os') {
        this.$api.info.getSystemPlatform()
          .then(platform => {
            if (platform) {
              this.systemPlatform = platform
            }
          })
          .catch(() => {})
      }

      if (this.ready) {
        return this.ready(this.config)
      }
    },
    async apply () {
      if (this.applyLoading === true) {
        return // 防重复提交
      }
      this.applyLoading = true
      try {
        await this.applyBefore()
        await this.saveConfig()
        await this.applyAfter()
      } finally {
        this.applyLoading = false
      }
    },
    async applyBefore () {

    },
    async applyAfter () {

    },
    resetDefault () {
      const key = this.getKey()
      this.$confirm({
        title: '提示',
        content: '确定要恢复默认设置吗？',
        cancelText: '取消',
        okText: '确定',
        onOk: async () => {
          this.resetDefaultLoading = true
          try {
            this.config = await this.$api.config.resetDefault(key)
            if (this.ready) {
              await this.ready(this.config)
            }
            await this.apply()
          } finally {
            this.resetDefaultLoading = false
          }
        },
        onCancel () {},
      })
    },
    saveConfig () {
      const configCopy = lodash.cloneDeep(this.config)
      return this.$api.config.save(configCopy).then((ret) => {
        this.$message.success('设置已保存')
        this.setConfig(ret.allConfig)
        this.printConfig('After saveConfig(), ')
        return ret
      })
    },
    getConfig (key) {
      const value = lodash.get(this.config, key)
      if (value == null) {
        return {}
      }
      return value
    },
    setConfig (newConfig) {
      this.config = newConfig
    },
    printConfig (prefix = '') {
      console.log(`${prefix}${this.key} page config:`, this.config, this.systemPlatform)
    },
    getStatus (key) {
      const value = lodash.get(this.status, key)
      if (value == null) {
        return {}
      }
      return value
    },
    async reloadConfig () {
      const config = await this.$api.config.reload()
      this.setConfig(config)
    },
    async reloadConfigAndRestart () {
      await this.reloadConfig()
      this.printConfig('After reloadConfigAndRestart(), ')
      if (this.status.server.enabled || this.status.proxy.enabled) {
        await this.$api.proxy.restart()
        await this.$api.server.restart()
        this.$message.success('代理服务和系统代理重启成功')
      } else {
        this.$message.info('代理服务和系统代理未启动，无需重启')
      }
    },
    isWindows () {
      return this.systemPlatform === 'windows'
    },
    isMac () {
      return this.systemPlatform === 'mac'
    },
    isLinux () {
      return this.systemPlatform === 'linux'
    },
    async openLog () {
      const dir = await this.$api.info.getLogDir()
      await this.$api.shell.openPath(dir)
    },
    async focusFirst (ref) {
      if (ref && ref.length != null) {
        setTimeout(() => {
          if (ref.length > 0) {
            try {
              ref[0].$el.querySelector('.ant-input').focus()
            } catch (e) {
              console.error('获取输入框焦点失败：', e)
            }
          }
        }, 100)
      }
    },
    handleHostname (hostname) {
      if (this.isNotHostname(hostname)) {
        return ''
      }

      // 移除所有空白符
      return hostname.replaceAll(/\s+/g, '')
    },
    isNotHostname (hostname) {
      // 暂时只判断数字
      return !hostname || /^[\d\s]+$/.test(hostname)
    },
  },
}
