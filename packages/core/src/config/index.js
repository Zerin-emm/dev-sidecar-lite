const path = require('node:path')
const configLoader = require('./local-config-loader')

function getRootCaCertPath () {
  return path.join(configLoader.getUserBasePath(), '/dev-sidecar.ca.crt')
}

function getRootCaKeyPath () {
  return path.join(configLoader.getUserBasePath(), '/dev-sidecar.ca.key.pem')
}

// 本文件为软件的内置默认配置，已包含官方 remote_config.json 的全部内容（plugin 整块除外）。
// 官方配置来源：https://gitee.com/wangliang181230/dev-sidecar-config （remote_config.json）
// 注意：软件已移除「远程配置」功能，内置配置即最终默认值；用户自己的 config.json 优先级更高。
const defaultConfig = {
  app: {
    metaInfo: {
      updateLog: '删除测试条目',
      version: 202610031400,
      id: 'official',
    },
    mode: 'default',
    autoStart: {
      enabled: false,
    },
    startShowWindow: true,
    needCheckHideWindow: true,
    showHideShortcut: 'Alt + S',
    windowSize: {
      width: 900,
      height: 550,
    },
    theme: 'dark',
    autoChecked: true,
    skipPreRelease: true,
    dock: {
      hideWhenWinClose: false,
    },
    closeStrategy: 0,
    showShutdownTip: true,
    logFileSavePath: path.join(configLoader.getUserBasePath(), '/logs'),
    keepLogFileCount: 15,
    maxLogFileSize: 1,
    maxLogFileSizeUnit: 'GB',
  },
  server: {
    enabled: true,
    host: '127.0.0.1',
    port: 31181,
    fakeServerMaxLength: 100,
    setting: {
      NODE_TLS_REJECT_UNAUTHORIZED: true,
      verifySsl: true,
      script: {
        enabled: true,
        defaultDir: './extra/scripts/',
      },
      userBasePath: configLoader.getUserBasePath(),
      rootCaFile: {
        certPath: getRootCaCertPath(),
        keyPath: getRootCaKeyPath(),
      },
      defaultTimeout: 10000,
      defaultKeepAliveTimeout: 30000,
      timeoutMapping: {
        'github.com': {
          timeout: 10000,
          keepAliveTimeout: 30000,
        },
      },
      lowSpeedDelay: 200,
    },
    compatible: {
      connect: {},
      request: {},
    },
    intercept: {
      enabled: true,
    },
    intercepts: {
      'github.com': {
        '.*': {
          sni: 'baidu.com',
        },
        '/fluidicon.png': {
          cacheDays: 365,
          desc: 'Github那只猫的图片，缓存1年',
        },
        '^(/[^/]+){2}/pull/\\d+/open_with_menu.*$': {
          cacheDays: 7,
          desc: 'PR详情页：标题右边那个Code按钮的HTML代码请求地址，感觉上应该可以缓存。暂时先设置为缓存7天',
        },
        '^((/[^/]+){2,})/raw((/[^/]+)+\\.(jpg|jpeg|png|gif))(\\?.*)?$': {
          cacheDays: 365,
          desc: '仓库内图片重定向，缓存1年。',
        },
        '^((/[^/]+){2,})/raw((/[^/]+)+\\.js)(\\?.*)?$': {
          responseReplace: {
            headers: {
              'content-type': 'application/javascript; charset=utf-8',
            },
          },
          desc: '仓库内脚本，设置响应头Content-Type。作用：方便script拦截器直接使用，避免引起跨域问题和脚本内容限制问题。',
        },
        '^(/[^/]+){2,}/?(\\?.*)?$': {
          script: 'githubEnhanced',
          remark: '注：脚本已本地化，直接使用程序自带的 extra/scripts/tampermonkey.js（油猴本体，提供 GM_* API）和 extra/scripts/GithubEnhanced-High-Speed-Download.user.js（加速脚本）。',
          desc: '油猴脚本：高速下载 Git Clone/SSH、Release、Raw、Code(ZIP) 等文件 (公益加速)、项目列表单文件快捷下载、添加 git clone 命令',
        },
      },
      'github.githubassets.com': {
        '.*': {
          sni: 'baidu.com',
        },
        '/assets/fakefile.js': {
          success: {
            script: ';',
          },
          cacheDays: 365,
        },
        '^(/[^/]+)*/[^./]+\\.(svg|png|gif|jpg|jpeg|ico|js|css)(\\?.*)?$': {
          cacheDays: 365,
          desc: '图片、JS文件、CSS文件，缓存1年',
        },
        '.*.backup': {
          desc: 'github.com域名下，该请求已经不存在，此配置暂时先备份掉。',
          proxy: 'github.com',
          sni: 'baidu.com',
          responseReplace: {
            headers: {
              'access-control-allow-origin': '*',
              'cross-origin-resource-policy': 'cross-origin',
              'set-cookie': '[remove]',
            },
          },
        },
      },
      'camo.githubusercontent.com': {
        '^[a-zA-Z0-9/]+(\\?.*)?$': {
          cacheDays: 365,
          desc: '图片，缓存1年',
        },
      },
      'collector.github.com': {
        '.*': {
          sni: 'baidu.com',
        },
        '/github/collect': {
          success: true,
          status: 204,
          desc: '采集数据，快速成功',
        },
      },
      'customer-stories-feed.github.com': {
        '.*': {
          proxy: 'customer-stories-feed.fastgit.org',
        },
      },
      'user-images.githubusercontent.com': {
        '^/.*\\.png(\\?.*)?$': {
          cacheDays: 365,
          desc: '用户在PR或issue等内容中上传的图片，缓存1年。注：每张图片都有唯一的ID，不会重复，可以安心缓存',
        },
      },
      'private-user-images.githubusercontent.com': {
        '^/.*\\.png(\\?.*)?$': {
          cacheDays: 30,
          desc: '用户在PR或issue等内容中上传的图片，缓存30天',
        },
      },
      'avatars.githubusercontent.com': {
        '^/u/\\d+(\\?.*)?$': {
          cacheDays: 365,
          desc: '用户头像，缓存1年',
        },
      },
      'api.github.com': {
        '^/_private/browser/stats$': {
          success: true,
          desc: 'github的访问速度分析上传，没有必要，直接返回成功',
        },
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.docker.com': {
        '.*': {
          sni: 'www.docker.com',
        },
      },
      'login.docker.com': {
        '/favicon.ico': {
          proxy: 'hub.docker.com',
          sni: 'baidu.com',
          desc: '登录页面的ico，采用hub.docker.com的',
        },
        '.*': {
          sni: 'login.docker.com',
        },
      },
      'www.google.com': {
        '/recaptcha/.*': {
          proxy: 'www.recaptcha.net',
        },
      },
      'www.gstatic.com': {
        '/recaptcha/.*': {
          proxy: 'www.recaptcha.net',
        },
      },
      'ajax.googleapis.com': {
        '.*': {
          proxy: 'ajax.proxy.ustclug.org',
          backup: [
            'gapis.geekzu.org',
          ],
          test: 'ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js',
          desc: '根据2026年4月24日时访问https://mirrors.ustc.edu.cn 的说明，修正internal v202604122348中指向ajax.lug.ustc.edu.cn的配置',
        },
      },
      'fonts.googleapis.com': {
        '.*': {
          proxy: 'fonts.googleapis.cn',
          backup: [
            'fonts.loli.net',
          ],
          test: 'https://fonts.googleapis.com/css?family=Oswald',
        },
      },
      'fonts.gstatic.com': {
        '.*': {
          proxy: 'fonts-gstatic.proxy.ustclug.org',
          backup: [
            'gstatic.loli.net',
          ],
          test: 'https://fonts.googleapis.com/css?family=Oswald',
        },
      },
      'themes.googleapis.com': {
        '.*': {
          proxy: 'themes.loli.net',
          backup: [
            'themes.proxy.ustclug.org',
          ],
        },
      },
      'themes.googleusercontent.com': {
        '.*': {
          proxy: 'google-themes.proxy.ustclug.org',
        },
      },
      'clients*.google.com': {
        '.*': {
          abort: false,
          desc: '设置abort：true可以快速失败，节省时间',
        },
      },
      'www.googleapis.com': {
        '.*': {
          abort: false,
          desc: '设置abort：true可以快速失败，节省时间',
        },
      },
      'lh*.googleusercontent.com': {
        '.*': {
          abort: false,
          desc: '设置abort：true可以快速失败，节省时间',
        },
      },
      '*.s3.1amazonaws1.com': {
        '/sqlite3/.*': {
          redirect: 'npmmirror.com/mirrors',
        },
      },
      '*.carbonads.com': {
        '/carbon.*': {
          abort: true,
          desc: '广告拦截',
        },
      },
      '*.buysellads.com': {
        '/ads/.*': {
          abort: true,
          desc: '广告拦截',
        },
      },
      'opengraph.githubassets.com': {
        '^/(([^/]+/){3}issues/\\d+)?(\\?.*)?$': {
          cacheDays: 365,
        },
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.githubusercontent.com': {
        '.*': {
          sni: 'baidu.com',
          requestReplace: {
            headers: {
              'accept-language': 'en-US,en;q=0.8',
            },
          },
        },
      },
      'gist.github.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.github.io': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.gravatar.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.windows.net': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.googleapis.com': {
        '.*': {
          sni: 'www.google.cn',
        },
      },
      'kubernetes-charts.storage.googleapis.com': {
        '.*': {
          proxy: 'kubernetes-charts.proxy.ustclug.org',
        },
      },
      '^(?!.*(translate-pa).google(?:apis|usercontent)?.com).*google(?:apis|usercontent)?.com$': {
        '.*': {
          sni: 'www.google.cn',
          desc: '部分需要走其它代理的服务',
        },
      },
      '^.*(youtube.com|gstatic.com|youtube.nocookie.com|youtu.be|ggpht.com|i.ytimg.com|blogger.com|doodles.google|about.google|android.com)$': {
        '.*': {
          sni: 'www.google.cn',
        },
      },
      '^.*\\.google\\.com(\\.\\w+)?$': {
        '.*': {
          sni: 'www.google.cn',
        },
      },
      '^(?<pre>.*).googlevideo.com$': {
        '.*': {
          proxy: '${pre}.xn--ngstr-lra8j.com',
          sni: 'g.cn',
          options: true,
        },
      },
      'ms-sso.copilot.microsoft.com': {
        '.*': {
          sni: 'microsoft.com',
        },
      },
      'www.docker.com': {
        '.*': {
          sni: 'www.docker.com',
        },
      },
      'download.docker.com': {
        '.*': {
          sni: 'download.docker.com',
        },
      },
      'hub.docker.com': {
        '.*': {
          sni: 'none',
        },
      },
      '*.pixiv.net': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.pixiv.org': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.pximg.net': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.ads-pixiv.net': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.nikke-global.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      'i.pximg.net': {
        '.*': {
          cacheDays: 365,
          requestReplace: {
            headers: {
              referer: 'https://www.pixiv.net/',
            },
            desc: '篡改请求头\'Referer\'，使Pixiv图片链接可以单独在浏览器打开',
          },
        },
      },
      '*.youtube.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.youtu.be': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.youtube-nocookie.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.ggpht.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      'i.ytimg.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      'cdn.jsdelivr.net': {
        '^/.*\\.(js|css|png|jpg|jpeg|gif|json)(\\?.*)?$': {
          proxy: 'fastly.jsdelivr.net',
          backup: [
            'gcore.jsdelivr.net',
          ],
        },
      },
      '*.greasyfork.org': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.cn-greasyfork.org': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.huggingface.co': {
        '.*': {
          sni: 'huggingface.cn',
        },
      },
      'cn.vuejs.org': {
        '.*': {
          sni: 'vuejs.org',
        },
      },
      '*z-library.sk': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*z-lib.help': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      'images.steamusercontent.com': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*steamcommunity.com': {
        '^(?!/discussions|/Profile|/app.*/discussions).*$': {
          sni: 'www.baidu.com',
          desc: '讨论区锁区,考虑不拦截丢给彩蛋',
        },
      },
      '^(?!.*cloudflare).*steamstatic.com$': {
        '.*': {
          sni: 'baidu.com',
          desc: 'steam社区数据不能也不需调整sni,直接直连',
        },
      },
      '*.steampowered.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      'external-content.duckduckgo.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*duckduckgo.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*onedrive.live.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*dropbox.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*f-droid.org': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      'fdroid.org': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*apkmirror.com': {
        '.*': {
          sni: 'none',
        },
      },
      '*.claude.ai': {
        '.*': {
          sni: 'claude.ai',
        },
      },
      'jsd.proxy.aks.moe': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'fastly.jsdelivr.net': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'jsdelivr.pai233.top': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'raw.incept.pw': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'gh-proxy.com': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'gh-proxy.org': {
        '^.*\\?DS_DOWNLOAD$': {
          requestReplace: {
            doDownload: true,
          },
          responseReplace: {
            doDownload: true,
          },
        },
      },
      'packages.elastic.co': {
        '.*': {
          proxy: 'elastic.proxy.ustclug.org',
        },
      },
      'ppa.launchpad.net': {
        '.*': {
          proxy: 'launchpad.proxy.ustclug.org',
        },
      },
      'downloads.openwrt.org': {
        '.*': {
          proxy: 'openwrt.proxy.ustclug.org',
        },
      },
      'registry.npmjs.org': {
        '.*': {
          desc: '既然ds有NPM镜像了，这个就没什么必要了，先不配置了',
        },
      },
      'repo1.maven.org': {
        '.*': {
          proxy: 'maven.proxy.ustclug.org',
        },
      },
      '*.msecnd.net': {
        '.*': {
          sni: 'baidu.com',
        },
      },
      '*.instagram.com': {
        '.*': {
          sni: 'g.cn',
        },
      },
      '*.cdninstagram.com': {
        '.*': {
          sni: 'g.cn',
        },
      },
      '*.intercom.io': {
        '.*': {
          sni: 'g.cn',
        },
      },
      '*startpage.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
      '*.brave.com': {
        '.*': {
          sni: 'www.baidu.com',
        },
      },
    },
    preSetIpList: {
      'github.com': {
        '4.237.22.38': true,
        '20.26.156.215': true,
        '20.27.177.113': true,
        '20.87.245.0': true,
        '20.200.245.247': true,
        '20.201.28.151': true,
        '20.205.243.166': true,
        '140.82.113.3': true,
        '140.82.114.4': true,
        '140.82.116.3': true,
        '140.82.116.4': true,
        '140.82.121.3': true,
        '140.82.121.4': true,
      },
      'api.github.com': {
        '20.26.156.210': true,
        '20.27.177.116': true,
        '20.87.245.6': true,
        '20.200.245.245': true,
        '20.201.28.148': true,
        '20.205.243.168': true,
        '20.248.137.49': true,
        '140.82.112.5': true,
        '140.82.113.6': true,
        '140.82.116.6': true,
        '140.82.121.6': true,
      },
      'codeload.github.com': {
        '20.26.156.216': true,
        '20.27.177.114': true,
        '20.87.245.7': true,
        '20.200.245.246': true,
        '20.201.28.149': true,
        '20.205.243.165': true,
        '20.248.137.55': true,
        '140.82.113.9': true,
        '140.82.114.10': true,
        '140.82.116.10': true,
        '140.82.121.9': true,
      },
      '*.githubusercontent.com': {
        '146.75.92.133': true,
        '199.232.88.133': true,
        '199.232.144.133': true,
        '185.199.111.133': true,
        '185.199.108.133': true,
        '185.199.109.133': true,
        '185.199.110.133': true,
      },
      'viewscreen.githubusercontent.com': {
        '140.82.112.21': true,
        '140.82.112.22': true,
        '140.82.113.21': true,
        '140.82.113.22': true,
        '140.82.114.21': true,
        '140.82.114.22': true,
      },
      'github.io': {
        '185.199.108.153': true,
        '185.199.109.153': true,
        '185.199.110.153': true,
        '185.199.111.153': true,
      },
      '*.githubassets.com': {
        '185.199.108.154': true,
        '185.199.109.154': true,
        '185.199.110.154': true,
        '185.199.111.154': true,
      },
      '^(analytics|ghcc)\\.githubassets\\.com$': {
        '185.199.108.153': true,
        '185.199.110.153': true,
        '185.199.109.153': true,
        '185.199.111.153': true,
      },
      '*.pixiv.net': {
        '210.140.139.154': true,
        '210.140.139.157': true,
        '210.140.139.160': true,
      },
      'hub.docker.com': {
        '144.34.172.106': true,
        '69.63.207.139': false,
        '47.236.233.96': false,
      },
      'sessions-bugsnag.docker.com': {
        '54.156.14.194': true,
        '54.208.73.48': true,
        '100.29.167.200': true,
      },
      'gist.github.com': {
        '20.27.177.113': true,
        '20.200.245.247': true,
        '20.205.243.166': false,
        '140.82.116.3': true,
        '140.82.116.4': true,
        '4.237.22.38': true,
      },
      'github.dev': {
        '20.43.185.14': true,
        '20.99.227.183': true,
        '51.137.3.17': true,
        '52.224.38.193': true,
      },
      'github.githubassets.com': {
        '2606:50c0:8000::154': true,
        '2606:50c0:8001::154': true,
        '2606:50c0:8002::154': true,
        '2606:50c0:8003::154': true,
        '185.199.108.154': true,
        '185.199.109.154': true,
        '185.199.110.154': true,
        '185.199.111.154': true,
      },
      'i.pximg.net': {
        '210.140.139.132': true,
        '210.140.139.137': true,
        '203.137.29.48': true,
        '210.140.139.134': true,
        '203.137.29.49': true,
        '210.140.139.133': true,
        '210.140.139.135': true,
        '203.137.29.47': true,
      },
      'a.pixiv.org': {
        '210.140.139.182': true,
        '210.140.139.183': true,
        '210.140.139.184': true,
      },
      'api.fanbox.cc': {
        '172.64.146.116': true,
      },
      '*.fanbox.cc': {
        '210.140.139.155': true,
      },
      '^(aistudio|.*pa.clients6|apis|gemini|console.cloud|notebooklm|mail).google.com$': {
        '8.137.102.117': {
          desc: 'AI Studio相关,阿里云,解锁地区限制,新加坡,仅大陆访问',
        },
        '47.102.115.14': false,
      },
      'stitch.withgoogle.com': {
        '8.137.102.117': {
          desc: 'AI Studio相关,阿里云,解锁地区限制,新加坡,仅大陆访问',
        },
        '47.102.115.14': false,
      },
      'scholar.googleusercontent.com': {
        '142.251.190.206': true,
        '172.217.204.206': true,
        '172.253.122.206': true,
      },
      '(*account*|scholar).google.com': {
        '172.217.204.206': true,
      },
      '^(?!fonts).*(with)?google(apis|usercontent)?.com.*$': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '^.*(youtube.com|gstatic.com|youtube.nocookie.com|youtu.be|ggpht.com|i.ytimg.com|blogger.com|doodles.google|about.google|android.com|antigravity.google)$': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.youtube.com': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.youtu.be': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.youtube-nocookie.com': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.ggpht.com': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      'i.ytimg.com': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.gstatic.com': {
        '8.137.102.117': false,
        '142.251.189.206': {
          desc: '自动地区官方',
        },
      },
      '*.huggingface.co': {
        '3.167.200.113': true,
      },
      '*.greasyfork.org': {
        '96.126.98.220': true,
        '50.116.4.196': true,
      },
      '*.cn-greasyfork.org': {
        '96.126.98.220': true,
        '50.116.4.196': true,
      },
      '*.instagram.com': {
        '163.70.159.174': true,
        '57.144.144.34': true,
        '57.144.216.34': true,
        '157.240.229.174': true,
        '57.144.188.34': true,
        '157.240.210.174': true,
        '157.240.252.174': true,
        '102.132.97.174': true,
        '31.13.94.174': true,
        '31.13.85.174': true,
        '102.132.104.174': true,
      },
      '*.cdninstagram.com': {
        '57.144.152.192': true,
        '57.144.220.192': true,
        '57.144.216.192': true,
      },
      '*z-library.sk': {
        '176.123.7.105': true,
      },
      '*z-lib.help': {
        '176.123.7.105': true,
      },
      'community.cloudflare.steamstatic.com': {
        '23.209.46.70': true,
        '104.18.42.105': true,
        '172.64.145.151': true,
      },
      'clientconfig.akamai.steamstatic.com': {
        ' 23.208.12.191': true,
        '23.32.91.19': true,
        '2.16.168.104': true,
        '2.16.168.109': true,
        '23.32.91.17': true,
        '23.208.12.174': true,
      },
      'community.steamstatic.com': {
        '146.75.47.52': true,
        '151.101.91.52': true,
        '199.232.163.52': true,
        '146.75.115.52': true,
        '199.232.215.52': true,
        '199.232.211.52': true,
        '151.101.79.52': true,
      },
      'cdn.steamcommunity.com': {
        '23.221.227.5': true,
      },
      '*.steamcommunity.com': {
        '23.209.217.19': true,
        '23.15.140.216': true,
        '104.79.200.218': true,
      },
      '^(store|checkout).steampowered.com$': {
        '23.209.218.108': true,
        '184.31.230.122': true,
        '23.35.102.114': true,
        '104.83.198.104': true,
        '23.51.62.114': true,
        '23.55.98.103': true,
      },
      'external-content.duckduckgo.com': {
        '20.43.160.189': true,
      },
      '*duckduckgo.com': {
        '20.43.161.105': true,
      },
      '*onedrive.live.com': {
        '13.107.42.13': true,
      },
      '*dropbox.com': {
        '162.125.248.18': true,
      },
      'forum.f-droid.org': {
        '37.218.242.53': true,
      },
      '*f-droid.org': {
        '37.218.243.72': true,
      },
      'fdroid.org': {
        '37.218.243.72': true,
      },
      '*apkmirror.com': {
        '104.17.67.215': true,
      },
      '*startpage.com': {
        '67.63.58.139': true,
      },
      '*.claude.ai': {
        '2a01:4f8:c2c:123f:64:5:a04f:680a': true,
      },
      'cdn.jsdelivr.net': {
        '104.16.89.20': true,
      },
    },
    whiteList: {
      '*.cn': true,
      '*china*': true,
      '*.dingtalk.com': true,
      '*.apple.com': true,
      '*.microsoft.com': true,
      '*.alipay.com': true,
      '*.qq.com': true,
      '*.baidu.com': true,
      '*.icloud.com': true,
      '*.lenovo.net': true,
      localhost: true,
      '127.*.*.*': true,
      '192.168.*.*': true,
    },
    dns: {
      providers: {
        safe360: {
          server: 'tls://dot.360.cn',
          forSNI: true,
        },
        aliyun: {
          server: 'tls://dns.alidns.com',
        },
        cloudflare: {
          server: 'https://1.1.1.1/dns-query',
        },
        quad9: {
          server: 'https://9.9.9.9/dns-query',
        },
        rubyfish: {
          server: 'https://rubyfish.cn/dns-query',
        },
        'cf-DoT': {
          server: 'tls://1.1.1.1',
          sni: 'baidu.com',
        },
        bebasid: {
          server: 'tls://dns.bebasid.com',
          sni: 'baidu.com',
        },
        'cf-DoH': {
          server: 'https://cloudflare-dns.com/dns-query',
          sni: 'baidu.com',
        },
      },
      mapping: {
        '*.github.com': 'cf-DoT',
        '*github*.com': 'cf-DoT',
        '*.github.io': 'cf-DoT',
        '*.docker.com': 'cf-DoT',
        '*.stackoverflow.com': 'cf-DoT',
        '*.electronjs.org': 'cf-DoT',
        '*.amazonaws.com': 'cf-DoT',
        '*.yarnpkg.com': 'cf-DoT',
        '*.cloudfront.net': 'cf-DoT',
        '*.cloudflare.com': 'cf-DoT',
        'img.shields.io': 'cf-DoT',
        '*.vuepress.vuejs.org': 'cf-DoT',
        '*.gh.docmirror.top': 'cf-DoT',
        '*.v2ex.com': 'cf-DoT',
        '*.pypi.org': 'cf-DoT',
        '*.jetbrains.com': 'cf-DoT',
        '*.azureedge.net': 'cf-DoT',
        '*.xn--ngstr-lra8j.com': 'bebasid',
        '*.googlevideo.com': 'bebasid',
        '*.gvt1.com': 'bebasid',
        '*.pixiv.org': 'cf-DoT',
        '*.pximg.net': 'cf-DoT',
        '*.onesignal.com': 'cf-DoT',
        '*.iubenda.com': 'cf-DoT',
        '*.brave.com': 'cf-DoT',
        '*duckduckgo.com': 'cf-DoT',
      },
      familyMapping: {
        '*.github.com': '4',
        '*github*.com': '4',
        '*.github.io': '4',
        '*.docker.com': '4',
        '*.stackoverflow.com': '4',
        '*.electronjs.org': '4',
        '*.amazonaws.com': '4',
        '*.yarnpkg.com': '4',
        '*.cloudfront.net': '4',
        '*.cloudflare.com': '4',
        'img.shields.io': '4',
        '*.vuepress.vuejs.org': '4',
        '*.gh.docmirror.top': '4',
        '*.v2ex.com': '4',
        '*.pypi.org': '4',
        '*.jetbrains.com': '4',
        '*.azureedge.net': '4',
        '*.xn--ngstr-lra8j.com': '6',
        '*.googlevideo.com': '6',
        '*.gvt1.com': '6',
        '*.pixiv.org': '4',
        '*.pximg.net': '4',
        '*.onesignal.com': '4',
        '*.iubenda.com': '4',
        '*.brave.com': '4',
        '*duckduckgo.com': '4',
      },
      speedTest: {
        enabled: true,
        interval: 60000,
        hostnameList: [
          'google.com',
          'zh.wikipedia.org',
          'steamgames.com',
          'epicgames-download1-1251447533.file.myqcloud.com',
          'store.steampowered.com',
          'community.akamai.steamstatic.com',
          'cdn.akamai.steamstatic.com',
          'steamcdn-a.akamaihd.net',
          'store.akamai.steamstatic.com',
          'steamcommunity.com',
          'api.steampowered.com',
        ],
        dnsProviders: [
          'cf-DoT',
          'safe360',
        ],
      },
    },
  },
  proxy: {},
  help: {
    dataList: [
      {
        title: '暂定',
        rowClass: 'title1',
      },
    ],
  },
}
// 从本地文件中加载配置
defaultConfig.configFromFiles = configLoader.getConfigFromFiles(configLoader.getUserConfig(), defaultConfig)

module.exports = defaultConfig
