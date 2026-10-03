import { h } from 'vue'

function install (app, api) {
  const updateParams = app.config.globalProperties.$global.update = { fromUser: false, checking: false, newVersion: false, releasePageUrl: '' }
  api.ipc.on('update', (event, message) => {
    console.log('on message', event, message)
    handleUpdateMessage(message, app)
  })

  api.update = {
    /**
     * 检查更新。
     * 发现新版本后只有一个动作：跳转 Releases 页面由用户手动下载安装包。
     * （不再有增量 zip 覆盖和 electron-updater 全量更新）
     */
    checkForUpdate (fromUser) {
      if (fromUser != null) {
        updateParams.fromUser = fromUser
      }
      updateParams.checking = true
      api.ipc.send('update', { key: 'checkForUpdate', fromUser })
    },
  }

  function handleUpdateMessage (message) {
    const type = message.key
    if (type === 'available') {
      updateParams.checking = false
      updateParams.newVersionData = message.value
      foundNewVersion(message.value)
    } else if (type === 'notAvailable') {
      updateParams.checking = false
      noNewVersion()
    } else if (type === 'error') {
      updateParams.checking = false
      if (message.action === 'checkForUpdate' && updateParams.newVersionData) {
        // 如果检查更新报错了，但刚才成功拿到过一次数据，就拿之前的数据
        foundNewVersion(updateParams.newVersionData)
      } else {
        if (updateParams.fromUser === false && message.action === 'checkForUpdate') {
          return // 不是手动检查更新，不提示错误信息，避免打扰
        }
        const error = message.error
        app.config.globalProperties.$message.error((error == null ? '未知错误' : (error.stack || error).toString()))
      }
    }
  }

  function noNewVersion () {
    updateParams.newVersion = false
    if (updateParams.fromUser) {
      app.config.globalProperties.$message.info('当前已经是最新版本')
    }
  }

  function openReleasePage (url) {
    api.ipc.openExternal(url || updateParams.releasePageUrl)
  }

  function foundNewVersion (value) {
    updateParams.newVersion = true
    updateParams.releasePageUrl = value.releasePageUrl

    app.config.globalProperties.$confirm({
      title: `发现新版本：v${value.version}`,
      cancelText: '暂不升级',
      okText: '前往下载',
      width: 700,
      content: () => {
        const children = []
        if (value.releaseNotes) {
          const releaseNotes = typeof value.releaseNotes === 'string'
            ? value.releaseNotes.replace(/\r\n/g, '\n')
            : value.releaseNotes.join('\n')
          children.push(
            h('div', {}, [
              h('span', {}, '发布公告：'),
              h('a', { onClick: () => openReleasePage(value.releasePageUrl) }, value.releasePageUrl),
            ]),
            h('hr'),
            h('pre', { style: { maxHeight: '350px', fontFamily: 'auto' } }, releaseNotes),
          )
        }
        children.push(
          h('div', { style: { marginTop: '12px' } }, '本应用只做版本检查，不自动下载。点击「前往下载」打开 Releases 页面，下载安装包后覆盖安装即可。'),
        )
        return h('div', {}, children)
      },
      onOk () {
        openReleasePage(value.releasePageUrl)
      },
      onCancel () {},
    })
  }
}

export default {
  install,
}
