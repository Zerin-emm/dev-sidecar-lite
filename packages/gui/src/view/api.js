import { ipcRenderer, shell } from 'electron'
import lodash from 'lodash'

let inited = false
let apiObj = null
export function apiInit (app) {
  const invoke = (api, args) => {
    return ipcRenderer.invoke('apiInvoke', [api, args]).catch((e) => {
      const notification = app.config.globalProperties.$notification
      if (notification) {
        notification.error({
          message: 'Api invoke error',
          description: e.message,
        })
      }
      throw e
    })
  }
  const send = (channel, message) => {
    console.log('ipcRenderer.send, channel=', channel, ', message=', message)
    return ipcRenderer.send(channel, message)
  }

  apiObj = {
    ipc: {
      on (channel, callback) {
        ipcRenderer.on(channel, callback)
      },
      removeAllListeners (channel) {
        ipcRenderer.removeAllListeners(channel)
      },
      invoke,
      postMessage (channel, ...args) {
        ipcRenderer.postMessage(channel, ...args)
      },
      send,
      async openExternal (href) {
        await shell.openExternal(href)
      },
      openPath (file) {
        // 注意：渲染进程里的 path 是 path-browserify，会把 Windows 绝对路径解析成错误路径（C:\... 变成 /C:\...）；
        // 并且 shell 本身是主进程模块。这里统一转发给主进程的 shell.openPath 处理，路径由主进程的 node:path 解析。
        return invoke('shell.openPath', file)
      },
    },
  }

  const bindApi = (api, param1) => {
    lodash.set(apiObj, api, (param2) => {
      return invoke(api, param2 || param1)
    })
  }

  if (!inited) {
    return invoke('getApiList').then((list) => {
      inited = true
      for (const item of list) {
        bindApi(item)
      }
      console.log('api inited:', apiObj)
      return apiObj
    })
  }

  return new Promise((resolve) => {
    resolve(apiObj)
  })
}
export function useApi () {
  return apiObj
}
