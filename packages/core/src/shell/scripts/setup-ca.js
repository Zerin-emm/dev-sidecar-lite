const fs = require('node:fs')
const Shell = require('../shell')
const log = require('../../utils/util.log.core')

const execute = Shell.execute
const execFile = Shell.execFile

// 本地 CA 根证书的 Subject 里固定带这段特征串，用它识别历史遗留的同类证书
const CA_SUBJECT_KEYWORD = 'dev-sidecar'

/**
 * 删除用户根证书库中历史遗留的 DevSidecar 证书，只保留 certPath 指向的这一张。
 *
 * CA 根证书是本地随机生成的，重装或清空用户数据目录后都会换一张新的，旧证书却
 * 一直留在证书库里（实测同一台机器上攒了 2 张同名证书，都会出现在「受信任的根
 * 证书颁发机构」列表中）。这里顺手清理，保证「装一次、只留一张」。
 *
 * 清理失败不抛异常：它是锦上添花，不能反过来阻断安装。
 */
async function cleanupOldCertificates (certPath) {
  try {
    const psPath = certPath.replace(/'/g, "''")
    // 注意用 '; ' 分隔两条语句：靠空格拼在一起会变成
    // `...Thumbprint Get-ChildItem ...`，PowerShell 直接语法报错（已实测）
    const script = [
      `$current = (Get-PfxCertificate -FilePath '${psPath}').Thumbprint`,
      `Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object { $_.Subject -like '*${CA_SUBJECT_KEYWORD}*' -and $_.Thumbprint -ne $current } | Remove-Item -Force -ErrorAction SilentlyContinue`,
    ].join('; ')
    await execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
  } catch (e) {
    log.warn('清理旧的 CA 根证书失败（不影响本次安装）：', e.message)
  }
}

const executor = {
  async windows (exec, { certPath }) {
    if (!certPath) {
      throw new Error('证书路径为空，无法安装根证书。请确认证书文件已生成。')
    }
    if (!fs.existsSync(certPath)) {
      throw new Error(`证书文件不存在: ${certPath}`)
    }

    // -user：装进「当前用户」的根证书库，不需要管理员权限，也不会弹 UAC；
    //        Chrome/Edge/微信/.NET 等都信任用户级根证书库，与装到本机证书库等效
    // -f   ：同名证书已存在时直接覆盖
    // 这里用 execFile + 参数数组，不能拼成 cmd 命令行：shell.js 的
    // WindowsSystemShell 走 `cmd.exe /d /s /c <整串>`，路径两边的引号会被当成
    // 文件名的一部分，报 0x8007007b ERROR_INVALID_NAME（已实测）
    try {
      await execFile('certutil', ['-user', '-addstore', '-f', 'Root', certPath])
    } catch (e) {
      throw new Error(`安装根证书失败：${e.message}`)
    }

    // 装机历史里可能留着旧 CA，顺手清掉
    await cleanupOldCertificates(certPath)
    return true
  },
  async linux (exec, { certPath }) {
    if (!certPath) {
      throw new Error('证书路径为空，无法安装根证书。请确认证书文件已生成。')
    }
    if (!fs.existsSync(certPath)) {
      throw new Error(`证书文件不存在: ${certPath}`)
    }
    const cmds = [`sudo cp ${certPath} /usr/local/share/ca-certificates`, 'sudo update-ca-certificates ']
    await exec(cmds)
    return true
  },
  async mac (exec, { certPath }) {
    if (!certPath) {
      throw new Error('证书路径为空，无法安装根证书。请确认证书文件已生成。')
    }
    if (!fs.existsSync(certPath)) {
      throw new Error(`证书文件不存在: ${certPath}`)
    }
    const cmds = [`open "${certPath}"`]
    await exec(cmds, { type: 'cmd' })
    return true
  },
}

module.exports = async function (args) {
  return execute(executor, args)
}
