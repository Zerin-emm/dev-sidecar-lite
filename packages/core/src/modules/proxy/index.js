const ProxyPlugin = function (context) {
  const { config, event, shell, log } = context
  const api = {
    async start () {
      return api.setProxy()
    },

    async close () {
      return api.unsetProxy()
    },

    async restart () {
      await api.close()
      await api.start()
    },

    async setProxy () {
      const ip = '127.0.0.1'
      const port = config.get().server.port
      const proxyConfig = config.get().proxy || {}
      const setEnv = proxyConfig.setEnv ?? false
      const setCaBundle = proxyConfig.setCaBundle ?? false
      await shell.setSystemProxy({ ip, port, setEnv, setCaBundle })
      log.info(`开启系统代理成功：${ip}:${port}`)
      event.fire('status', { key: 'proxy.enabled', value: true })
      return { ip, port }
    },

    async unsetProxy (setEnv) {
      if (setEnv == null) {
        const proxyConfig = config.get().proxy || {}
        setEnv = proxyConfig.setEnv ?? false
      }
      try {
        await shell.setSystemProxy({ setEnv })
        event.fire('status', { key: 'proxy.enabled', value: false })
        log.info('关闭系统代理成功')
        return true
      } catch (err) {
        log.error('关闭系统代理失败:', err)
        return false
      }
    },

    async setEnableLoopback () {
      await shell.enableLoopback()
      log.info('打开EnableLoopback成功')
      return true
    },
  }
  return api
}
module.exports = {
  key: 'proxy',
  config: {
    enabled: true,
    name: '系统代理',
    use: 'local',
    other: [],
    proxyHttp: false, // false=只代理HTTPS请求   true=同时代理HTTP和HTTPS请求
    setEnv: false,
    setCaBundle: false,

    // 排除国内域名 所需配置
    excludeDomesticDomainAllowList: false, // 是否排除国内域名，默认：不排除（国内域名由下方的 excludeIpList 逐条排除）
    autoUpdateDomesticDomainAllowList: true, // 是否自动更新国内域名
    remoteDomesticDomainAllowListFileUrl: 'https://ghproxy.net/https://raw.githubusercontent.com/pluwen/china-domain-allowlist/main/allow-list.sorl',
    domesticDomainAllowListFileAbsolutePath: null, // 自定义 domestic-domain-allowlist.txt 文件位置，可以是本地文件路径
    domesticDomainAllowListFilePath: './extra/proxy/domestic-domain-allowlist.txt', // 内置国内域名文件

    // 自定义系统代理排除列表
    excludeIpList: {
      // region 常用国内可访问域名

      // 中国大陆
      '*.cn': true,
      '*china*': true,

      // Github加速源：以下加速源代理后反而出现问题，从系统代理中排除掉
      '*.kkgithub.com': true,
      '*.ghproxy.*': true,

      // Github ssh
      'ssh.github.com': true,

      // DeepL
      'www.deepl.com': true,

      // CSDN
      '*.csdn.net': true,

      // 360 so
      '*.so.com': true,

      // 百度
      '*.baidu.com': true,
      '*.baiducontent.com': true,
      '*.bdimg.com': true,
      '*.bdstatic.com': true,
      '*.bdydns.com': true,

      // 腾讯
      '*.tencent.com': true,
      '*.qq.com': true,
      '*.weixin.com': true,
      '*.weixinbridge.com': true,
      '*.wechat.com': true,
      '*.idqqimg.com': true,
      '*.gtimg.com': true,
      '*.qpic.com': true,
      '*.qlogo.com': true,
      '*.myapp.com': true,

      // 阿里
      '*.aliyun.com': true,
      '*.alipay.com': true,
      '*.taobao.com': true,
      '*.tmall.com': true,
      '*.alipayobjects.com': true,
      '*.dingtalk.com': true,
      '*.mmstat.com': true,
      '*.alicdn.com': true,
      '*.hdslb.com': true,

      // Gitee
      'gitee.com': true,
      '*.gitee.com': true,
      '*.gitee.io': true,
      '*.giteeusercontent.com': true,

      // Mozilla Firefox
      '*.mozilla.org': true,
      '*.mozilla.com': true,
      '*.mozilla.net': true,
      '*.firefox.com': true,
      '*.firefox.org': true,
      '*.mozillademos.org': true,
      '*.mozillians.org': true,
      '*.mozillians.net': true,
      '*.mozillians.com': true,

      // OSS
      '*.sonatype.org': true,
      // Maven镜像
      '*.maven.org': true,
      // Maven Repository
      '*.mvnrepository.com': true,

      // 苹果
      '*.apple.com': true,
      '*.icloud.com': true,

      // 微软
      '*.microsoft.com': true,
      '*.windows.com': true,
      '*.office.com': true,
      '*.office.net': true,
      '*.msn.com': true,

      // WPS
      '*.wps.com': true,
      '*.wps.net': true,
      '*.ksord.com': true,

      // 奇虎
      '*.qihoo.com': true,
      '*.qihucdn.com': true,
      // 360
      '*.360.com': true,
      '*.360safe.com': true,
      '*.360buyimg.com': true,
      '*.360buy.com': true,

      // 京东
      '*.jd.com': true,
      '*.jcloud.com': true,
      '*.jcloudcs.com': true,
      '*.jcloudcache.com': true,
      '*.jcloudcdn.com': true,
      '*.jcloudlb.com': true,

      // 哔哩哔哩
      '*.bilibili.com': true,
      '*.bilivideo.com': true,
      '*.biliapi.net': true,

      // 移动
      '*.10086.com': true,
      '*.10086cloud.com': true,

      // 移动：139邮箱
      '*.139.com': true,

      // 迅雷
      '*.xunlei.com': true,

      // 网站ICP备案查询
      '*.icpapi.com': true,

      // Navicat
      '*.navicat.com': true,

      // Github文件上传所使用的域名，被DS代理会导致文件上传经常失败，从系统代理中排除掉
      'objects-origin.githubusercontent.com': true,

      // endregion

      // 本地地址，无需代理
      'localhost': true,
      'localhost.*': true, // 部分VPN会在host中添加这种格式的域名指向127.0.0.1，所以也排除掉
      '127.*.*.*': true,
      'test.*': true, // 本地开发时，测试用的虚拟域名格式，无需代理

      // 服务器端常用地址，无需代理
      '10.*.*.*': true,
      '172.16.*.*': true,
      '172.17.*.*': true,
      '172.18.*.*': true,
      '172.19.*.*': true,
      '172.20.*.*': true,
      '172.21.*.*': true,
      '172.22.*.*': true,
      '172.23.*.*': true,
      '172.24.*.*': true,
      '172.25.*.*': true,
      '172.26.*.*': true,
      '172.27.*.*': true,
      '172.28.*.*': true,
      '172.29.*.*': true,
      '172.30.*.*': true,
      '172.31.*.*': true,

      // 局域网地址，无需代理
      '192.168.*.*': true,

      // region 以下排除项来自官方 remote_config.json 的 proxy.excludeIpList
      '*.ghproxy.net': true,
      '*.ghp.ci': true,
      '*.dgithub.xyz': true,
      'pages.github.com': true,
      'help.github.com': true,
      'docs.github.com': true,
      '*.github.blog': true,
      'analytics.githubassets.com': true,
      'ghcc.githubassets.com': true,
      'www.docker.com': true,
      'login.docker.com': true,
      'api.dso.docker.com': true,
      'desktop.docker.com': true,
      'docs.docker.com': true,
      '*.s-microsoft.com': true,
      '*.xboxlive.com': true,
      '*.mihoyo.com': true,
      '*.bilicomic.com': true,
      '*.cmicapm.com': true,
      '*.cloudflare-cn.com': true,
      '*.microsoftonline.com': true,
      '*.msedge.net': true,
      '*kaspersky*.com': true,
      '*.upd.kaspersky.com': true,
      '*.lanhuapp.com': true,
      '*.soboten.com': true,
      '*.sandboxie-plus.com': true,
      '*.wuyou.net': true,
      '*.pyecharts.org': true,
      '*.bcloudlink.com': true,
      '*.qijishow.com': true,
      '*.z-lib.fo': true,
      '*.finalshell.com': true,
      '*.minebbs.com': true,
      '*.spigotmc.org': true,
      '*.virustotal.com': true,
      '*.gitlab.com': true,
      '*.deepseek.com': true,
      '*steaminventoryhelper.com': true,
      '*.youdemai.com': true,
      '*.casualthink.com': true,
      '*.elastic.co': false,
      '[2049:8c54:813:10c::140]': true,
      '[2409:8a0c:a442:ff40:a51f:4b9c:8b41:25ea]': true,
      '[2606:2800:147:120f:30c:1ba0:fc6:265a]': true,
      '44.239.165.12': true,
      '3.164.110.117': true,
      // endregion
    },
  },
  status: {
    enabled: false,
    proxyTarget: '',
  },
  plugin: ProxyPlugin,
}
