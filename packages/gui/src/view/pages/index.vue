<script>
import lodash from 'lodash'
import { CheckOutlined, CloseOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
import DsContainer from '../components/container'
import SetupCa from '../components/setup-ca'

export default {
  name: 'Index',
  components: {
    DsContainer,
    SetupCa,
    CheckOutlined,
    CloseOutlined,
    ArrowRightOutlined,
  },
  data () {
    return {
      publicPath: process.env.BASE_URL || './',
      status: undefined,
      startup: {
        loading: false,
        doClick: () => {
          if (this.status.server.enabled) {
            this.apiCall(this.startup, this.$api.shutdown)
          } else {
            this.apiCall(this.startup, this.$api.startup)
          }
        },
      },
      info: {},
      newVersionDownloading: false,
      setting: {},
      server: {
        key: '代理服务',
        loading: false,
        doClick: (checked) => {
          this.onServerClick(checked)
        },
      },
      switchBtns: undefined,
      config: undefined,
      setupCa: {
        visible: false,
      },
      update: { checking: false, newVersion: false },
    }
  },
  computed: {
    _rootCaSetuped () {
      if (this.setting.rootCa) {
        return this.setting.rootCa.setuped === true
      }
      return false
    },
    _githubStarBadgeUrl () {
      // 生成每天更新一次的缓存键，减少API调用频率
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      return `https://img.shields.io/github/stars/Zerin-emm/dev-sidecar-lite?logo=github&cacheSeconds=86400&t=${today}`
    },
  },
  async created () {
    await this.doCheckRootCa()
    await this.reloadConfig()
    this.status = this.$status
    this.switchBtns = this.createSwitchBtns()
    // 合并全局更新参数到 data() 中的默认值，避免 $global.update 尚未
    // 初始化时（update/front.js 在 mount 之后才执行）覆盖为 undefined
    if (this.$global.update) {
      Object.assign(this.update, this.$global.update)
    }
    // 自动检查更新 延后到 mounted 中处理（等待代理服务启动后再执行）
    this.$api.info.get().then((ret) => {
      this.info = ret
    })
  },
  mounted () {
    // 自动检查更新：等待代理服务启动后再执行，避免代理未就绪时
    // 直接请求 GitHub API 导致超时或失败
    const tryAutoCheck = () => {
      if (!this.config || !this.update) return
      if (this.update.autoChecked) return
      if (!this.config.app.autoChecked) return
      this.update.autoChecked = true
      this.$watch('status.server.enabled', (enabled) => {
        if (enabled) {
          this.doCheckUpdate(false)
        }
      }, { immediate: true })
    }
    // mounted 时 config 可能尚未加载完毕（created 是 async 的），
    // 先试一次，不行就等 config 就绪后再试
    tryAutoCheck()
    if (!this.config) {
      this.$watch('config', () => { tryAutoCheck() }, { immediate: true })
    }
  },
  methods: {
    async modeChange (event) {
      const mode = this.config.app.mode
      if (mode === 'safe') {
        this.config.server.intercept.enabled = false
        this.config.server.dns.speedTest.enabled = true
      } else if (mode === 'default') {
        this.config.server.intercept.enabled = true
        this.config.server.dns.speedTest.enabled = true
      }
      const configCopy = lodash.cloneDeep(this.config)
      await this.$api.config.save(configCopy)
      if (this.status.server && this.status.server.enabled) {
        return this.$api.server.restart()
      }
    },
    async doCheckRootCa () {
      const setting = await this.$api.setting.load()
      console.log('setting', setting)
      this.setting = setting || {}
      if (this.setting.rootCa && (this.setting.rootCa.setuped || this.setting.rootCa.noTip)) {
        return
      }
      this.$confirm({
        title: '第一次使用，请先安装CA根证书',
        content: '本应用正常使用，必须安装和信任CA根证书',
        cancelText: '下次安装',
        okText: '去安装',
        onOk: () => {
          this.openSetupCa()
        },
        onCancel: () => {
          this.setting.rootCa = this.setting.rootCa || {}
          // const rootCa = this.setting.rootCa
          // rootCa.noTip = true
          // this.$api.setting.save(this.setting)
        },
      })
    },
    openSetupCa () {
      this.setupCa.visible = true
    },
    getDateTimeStr () {
      const date = new Date() // 创建一个表示当前日期和时间的 Date 对象
      const year = date.getFullYear() // 获取年份
      const month = String(date.getMonth() + 1).padStart(2, '0') // 获取月份（注意月份从 0 开始计数）
      const day = String(date.getDate()).padStart(2, '0') // 获取天数
      const hours = String(date.getHours()).padStart(2, '0') // 获取小时
      const minutes = String(date.getMinutes()).padStart(2, '0') // 获取分钟
      const seconds = String(date.getSeconds()).padStart(2, '0') // 获取秒数
      const milliseconds = String(date.getMilliseconds()).padStart(3, '0') // 获取毫秒
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
    },
    async handleCaSetuped () {
      const certPath = this.config?.server?.setting?.rootCaFile?.certPath
      console.log('certPath:', certPath)
      if (!certPath) {
        this.$message.error('证书路径未配置，请先启动代理服务生成 CA 根证书后再试')
        return
      }
      // Windows：shell.setupCa 用 certutil -user 静默装进「当前用户」的根证书库，
      //          不需要管理员权限、不弹 UAC，也不再弹证书导入向导
      // Linux  ：shell.setupCa 复制到系统证书目录
      // macOS  ：仍然只能交给系统打开「钥匙串访问」，由用户手动设为始终信任
      const platform = await this.$api.info.getSystemPlatform()
      try {
        if (platform === 'mac') {
          await this.$api.shell.openPath(certPath)
        } else {
          await this.$api.shell.setupCa({ certPath })
        }
      } catch (e) {
        console.error('安装 CA 根证书失败:', e)
        this.$message.error(`安装 CA 根证书失败：${e.message || e}`)
        return
      }
      this.setting.rootCa = this.setting.rootCa || {}
      const rootCa = this.setting.rootCa

      // 根证书已安装
      rootCa.setuped = true
      // 保存安装时间
      rootCa.setupTime = this.getDateTimeStr()
      // 保存安装描述
      rootCa.desc = '根证书已安装'
      // 删除noTip数据
      // delete rootCa.noTip

      this.$api.setting.save(JSON.parse(JSON.stringify(this.setting)))

      // 安装结果由这里统一提示：drawer 里的按钮只是 emit，拿不到真实结果
      if (platform === 'mac') {
        this.$message.info('已打开系统钥匙串，请按提示把根证书设置为始终信任')
      } else if (platform === 'linux') {
        this.$message.success('根证书已安装到系统证书库（浏览器可能仍需手动导入）')
      } else {
        this.$message.success('根证书已成功安装，重启浏览器后生效')
      }
    },
    reloadConfig () {
      return this.$api.config.reload().then((ret) => {
        this.config = ret
        return ret
      })
    },
    createSwitchBtns () {
      console.log('api,', this.$api)
      const btns = {}
      const status = this.status
      btns.server = this.createSwitchBtn('server', '代理服务', this.$api.server, status)
      btns.proxy = this.createSwitchBtn('proxy', '系统代理', this.$api.proxy, status)
      return btns
    },
    createSwitchBtn (key, label, apiTarget, statusParent, tip) {
      return {
        loading: false,
        key,
        label,
        tip,
        status: () => {
          return statusParent[key].enabled
        },
        doClick: (checked) => {
          this.onSwitchClick(this.switchBtns[key], apiTarget.start, apiTarget.close, checked)
        },
      }
    },
    async apiCall (btn, api, param) {
      btn.loading = true
      try {
        const ret = await api(param)
        console.log('this status', this.status)
        return ret
      } catch (err) {
        btn.loading = false // 有时候记录日志会卡死，先设置为false
        console.log('api invoke error:', err)
      } finally {
        btn.loading = false
      }
    },

    onSwitchClick (btn, openApi, closeApi, checked) {
      if (checked) {
        return this.apiCall(btn, openApi)
      } else {
        return this.apiCall(btn, closeApi)
      }
    },
    onServerClick (checked) {
      return this.onSwitchClick(this.server, this.$api.server.start, this.$api.server.close, checked)
    },
    start (checked) {
      this.apiCall(this.startup, this.$api.startup)
    },
    openSettings () {
      this.setting.visible = true
    },
    onConfigChanged (newConfig) {
      console.log('config changed', newConfig)
      this.reloadConfig().then(() => {
        if (this.status.server) {
          return this.$api.server.restart()
        }
      })
    },
    goDonate () {
      this.$message.info('感谢支持')
    },
    doCheckUpdate (fromUser) {
      this.$api.update.checkForUpdate(fromUser)
    },
    async openExternal (url) {
      await this.$api.ipc.openExternal(url)
    },
    onShutdownTipClose (e) {
      this.$confirm({
        title: '是否永久关闭该提示',
        okText: '我已知晓，不再提示',
        cancelText: '下次还显示',
        onOk: () => {
          this.$api.config.update({ app: { showShutdownTip: false } })
        },
      })
    },
  },
}
</script>

<template>
  <DsContainer class="page_index">
    <template #header>
      给开发者的辅助工具
    </template>
    <template #header-right>
      <a-button style="margin-right:10px" @click="openSetupCa">
        <a-badge :count="_rootCaSetuped ? 0 : 1" dot>安装根证书</a-badge>
      </a-button>

      <a-button
        style="margin-right:10px" :loading="update.checking" :title="`当前版本:${info.version}`"
        @click="doCheckUpdate(true)"
      >
        <a-badge :count="update.newVersion ? 1 : 0" dot>
          {{ `检查更新${update.checking ? '中' : ''}` }}
        </a-badge>
      </a-button>
    </template>

    <div class="box">
      <a-alert v-if="config && config.app.showShutdownTip" message="本应用开启后会修改系统代理，直接重启电脑可能会无法上网，您可以再次启动本应用即可恢复。如您需要卸载，在卸载前请务必完全退出本应用再进行卸载" banner closable @close="onShutdownTipClose" />
      <div v-if="config && config.app" class="mode-bar" style="margin:20px;">
        <a-radio-group v-model:value="config.app.mode" button-style="solid" @change="modeChange">
          <a-tooltip placement="topLeft" title="启用测速，关闭拦截（不稳定，不需要安装证书，最安全）">
            <a-radio-button value="safe">
              安全模式
            </a-radio-button>
          </a-tooltip>
          <a-tooltip placement="topLeft" title="启用测速，启用拦截（需要安装证书）">
            <a-radio-button value="default">
              默认模式
            </a-radio-button>
          </a-tooltip>
        </a-radio-group>
      </div>

      <div
        v-if="status"
        class="main-control-panel"
      >
        <div class="main-switch-wrapper">
          <div class="big-button">
            <a-button
              shape="circle"
              :class="{ 'is-active': status.server.enabled }"
              :loading="startup.loading"
              @click="startup.doClick"
            >
              <img v-if="!startup.loading && !status.server.enabled" width="50" :src="`${publicPath}logo/logo-simple.svg`">
              <img v-if="!startup.loading && status.server.enabled" width="50" :src="`${publicPath}logo/logo-fff.svg`">
            </a-button>
            <div class="switch-status-label" :class="{ 'is-active': status.server.enabled }">
              {{ status.server.enabled ? '已开启' : '已关闭' }}
            </div>
          </div>
        </div>
        <div class="sub-switches-wrapper">
          <a-form :label-col="{ span: 15 }" :wrapper-col="{ span: 9 }">
            <a-form-item v-for="(item, key) in switchBtns" :key="key" :label="item.label">
              <a-tooltip placement="topLeft" :title="item.tip">
                <a-switch
                  class="sub-switch"
                  :loading="item.loading"
                  :checked="item.status()"
                  @change="item.doClick"
                >
                  <template #checkedChildren><CheckOutlined /></template>
                  <template #unCheckedChildren><CloseOutlined /></template>
                </a-switch>
              </a-tooltip>
            </a-form-item>
          </a-form>
        </div>
      </div>
    </div>

    <SetupCa title="安装证书" v-model:open="setupCa.visible" @setup="handleCaSetuped" />
    <template #footer>
      <div v-if="setting.development == null || !setting.development" class="star">
        <div class="right">
          <div>
            如果它解决了你的问题，请不要吝啬你的star哟！点这里
            <ArrowRightOutlined style="margin-right:10px;" />
          </div>
          <a @click="openExternal('https://github.com/Zerin-emm/dev-sidecar-lite')"><img
            alt="GitHub stars"
            :src="_githubStarBadgeUrl"
          ></a>
        </div>
      </div>
    </template>
  </DsContainer>
</template>

<style lang="scss">
.page_index {
  .mode-bar {
    margin: 30px;
    text-align: center;
  }

  .star {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 10px;

    .right {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
    }

    a {
      height: 21px;

      img {
        height: 21px;
      }
    }
  }

  /* 主控制面板 */
  .main-control-panel {
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    flex-direction: row;
  }

  /* 主开关区域 */
  .main-switch-wrapper {
    text-align: center;

    .big-button {
      > button {
        width: 100px;
        height: 100px;
        border-radius: 100px;
        transition: all 0.3s ease;
        border: 2px solid var(--btn-border);
        background-color: var(--btn-bg);

        &:hover {
          border-color: var(--accent-hover);
          box-shadow: 0 0 8px var(--accent-shadow);
        }

        /* 激活状态 */
        &.is-active {
          background-color: var(--accent-color);
          border-color: var(--accent-color);
          box-shadow: 0 0 12px var(--accent-shadow);

          &:hover {
            background-color: var(--accent-hover);
            border-color: var(--accent-hover);
          }
        }
      }

      > button i {
        font-size: 40px;
      }
    }

    .switch-status-label {
      margin-top: 10px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
      transition: color 0.3s ease;

      &.is-active {
        color: var(--accent-color);
        font-weight: 600;
      }
    }
  }

  /* 子开关区域 */
  .sub-switches-wrapper {
    margin-top: 20px;

    .sub-switch {
      margin-left: 10px;

      &.ant-switch-checked {
        background-color: #1890ff;
      }
    }
  }
}

.payQrcode {
  padding: 10px;
  display: flex;
  justify-content: space-evenly;
}

div.ant-form-item {
  margin-bottom: 9px;
}

/* 表单标签固定宽度，防止不同长度文字导致按钮错位 */
.page_index .ant-form-item-label {
  flex: 0 0 100px !important;
}
</style>
