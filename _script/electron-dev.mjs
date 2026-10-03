import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const guiDir = process.cwd()
const require = createRequire(import.meta.url)

const devServerUrl = 'http://localhost:8080'
const state = {
  closing: false,
  devServer: null,
  electron: null,
}

function spawnCommand (entry, args = [], extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  // 某些宿主/工具会注入 ELECTRON_RUN_AS_NODE=1，那会让 electron.exe 退化成纯 Node 进程：
  // electron 模块被解析成 npm 包（只有 dist 路径字符串），主进程报
  // "SyntaxError: The requested module 'electron' does not provide an export named 'app'"。
  // 这里为子进程清掉该变量，保证以真正的 Electron 主进程启动。
  delete env.ELECTRON_RUN_AS_NODE
  return spawn(entry, args, {
    cwd: guiDir,
    env,
    shell: false,
    stdio: 'inherit',
    windowsHide: false,
  })
}

function resolveVueCliServiceBin () {
  return require.resolve('@vue/cli-service/bin/vue-cli-service.js', {
    paths: [guiDir],
  })
}

function resolveElectronBin () {
  return require('electron')
}

async function waitForServer (url, child) {
  const timeoutAt = Date.now() + 120000

  while (Date.now() < timeoutAt) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error('Dev server exited before it became ready')
    }

    try {
      const response = await fetch(url, { method: 'GET' })
      if (response.ok || response.status >= 200) {
        return
      }
    } catch {
      // Keep polling until the dev server is reachable.
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

function stopChild (child) {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return
  }

  child.kill('SIGTERM')
}

async function shutdown (code = 0) {
  if (state.closing) {
    return
  }

  state.closing = true
  stopChild(state.electron)
  stopChild(state.devServer)
  process.exitCode = code
}

process.on('SIGINT', () => {
  void shutdown(0)
})
process.on('SIGTERM', () => {
  void shutdown(0)
})

async function main () {
  const vueCliServiceBin = resolveVueCliServiceBin()
  const electronBin = resolveElectronBin()

  state.devServer = spawnCommand(process.execPath, [vueCliServiceBin, 'serve', '--port', '8080'])
  state.devServer.on('exit', (code, signal) => {
    if (!state.closing) {
      void shutdown(code ?? (signal ? 1 : 0))
    }
  })

  try {
    await waitForServer(devServerUrl, state.devServer)
    // 需要检查渲染进程时（例如量页面首帧耗时），设 DS_DEBUG_PORT=9222 再启动：
    // 之后可以访问 http://127.0.0.1:9222/json 拿到页面，用 DevTools 协议执行脚本。
    const electronArgs = ['.']
    if (process.env.DS_DEBUG_PORT) {
      electronArgs.push(`--remote-debugging-port=${process.env.DS_DEBUG_PORT}`)
    }
    state.electron = spawnCommand(electronBin, electronArgs, {
      WEBPACK_DEV_SERVER_URL: devServerUrl,
    })
    state.electron.on('exit', (code, signal) => {
      void shutdown(code ?? (signal ? 1 : 0))
    })
  } catch (error) {
    console.error(error)
    await shutdown(1)
  }
}

void main()
