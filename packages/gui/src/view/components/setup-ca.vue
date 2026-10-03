<script>
import { defineComponent } from 'vue';

export default defineComponent({
  emits: ['update:open', 'setup'],
  name: 'SetupCa',

  components: {

  },

  props: {
    title: {
      type: String,
      default: '安装根证书',
    },
    open: {
      type: Boolean,
    },
  },

  data () {
    return {
      systemPlatform: '',
    }
  },

  computed: {
    setupImage () {
      const base = process.env.BASE_URL || './'
      if (this.systemPlatform === 'mac') {
        return `${base}setup-mac.png`
      } else if (this.systemPlatform === 'linux') {
        return `${base}setup-linux.png`
      } else {
        return `${base}setup.png`
      }
    },
  },

  async created () {
    this.systemPlatform = await this.$api.info.getSystemPlatform()
  },

  methods: {
    async openExternal (url) {
      await this.$api.ipc.openExternal(url)
    },
    afterVisibleChange (val) {
    },
    showDrawer () {
      this.$emit('update:open', true)
    },
    onClose () {
      this.$emit('update:open', false)
    },
    async doSetup () {
      // 不要在 emit 之后立刻报成功：安装是异步的，而且可能失败。
      // 成功/失败提示统一交给 index.vue 的 handleCaSetuped 在拿到真实结果后给出。
      this.$emit('setup')
    },
  },
});
</script>

<template>
  <a-drawer
    placement="right"
    :closable="false"
    :open="open"
    @after-open-change="afterVisibleChange"
    width="660px"
    height="100%"
    wrap-class-name="json-wrapper"
    @close="onClose"
  >
    <template #title>
      {{ title }}
      <a-button type="primary" style="float:right" @click="doSetup()">
        点此去安装
      </a-button>
      <a-button style="float:right;margin-right:10px;" @click="openExternal('https://github.com/docmirror/dev-sidecar/blob/master/doc/caroot.md')">
        为什么要安装证书？
      </a-button>
    </template>
    <div>
      <b>本应用在非“安全模式”下必须安装和信任CA根证书</b>，该证书是应用启动时本地随机生成的<br>

      <template v-if="systemPlatform === 'mac'">
        1、点击右上角“点此去安装按钮”，打开钥匙串，<b style="color:red">选择”系统“</b><br>
        2、然后按如下图步骤将随机生成的根证书设置为始终信任<br>
        3、可能需要重新启动应用和浏览器才能生效<br>
        4、注意：如果出现无法导入提示时，先点一下钥匙串的左边切换到<b style="color:red">“系统”栏</b>，然后再重新安装证书即可<br>
      </template>
      <template v-else-if="systemPlatform === 'linux'">
        1、点击右上角“点此去安装按钮”,将自动安装到系统证书库中<br>
        2、<b color="red">火狐、chrome等浏览器不走系统证书</b>，需要手动安装(下图以chrome为例安装根证书)<br>
      </template>
      <template v-else>
        1、点击右上角“点此去安装按钮”，会自动安装到当前用户的<b style="color:red">受信任的根证书颁发机构</b>（不需要管理员权限，也不会弹出证书导入向导）<br>
        2、安装完成后可能需要重新启动浏览器才会生效
      </template>
    </div>
    <img v-if="systemPlatform !== 'windows'" width="100%" :src="setupImage">
  </a-drawer>
</template>
