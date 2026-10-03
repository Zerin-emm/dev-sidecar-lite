import api from './api/backend.js'
import autoStart from './auto-start/backend.js'
import fileSelector from './file-selector/backend.js'
import update from './update/backend.js'
import log from '../utils/util.log.gui.js'

const modules = {
  api, // 核心接口模块
  fileSelector, // 文件选择模块
  update, // 检查更新
  autoStart,
}
export default {
  install (context) {
    for (const module in modules) {
      log.info('install module:', module)
      modules[module].install(context)
    }
  },
  ...modules,
}
