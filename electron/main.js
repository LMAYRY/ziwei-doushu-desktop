// Electron shell: starts the Next standalone server in a utility process on a
// random 127.0.0.1 port, opens the window once it is ready, and stops it on quit.
//
// Pages are shown at the fixed origin ziwei://app, which forwards every request to the server.
// localStorage (charts, chat history, 合盘 records) is kept per origin, so with the random port
// as the origin it would start empty on every launch.
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, shell, utilityProcess } = require('electron');
const { createWriteStream, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { createAiConfig } = require('./ai-config');

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 60_000;
const PORT_ATTEMPTS = 3;
const SCHEME = 'ziwei';
const APP_ORIGIN = `${SCHEME}://app`;

// Must happen before 'ready'. `standard` + `secure` give the scheme its own origin with
// localStorage, fetch and a secure context like https; `stream` lets SSE answers flow through.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
}]);

// Packaged: Contents/Resources/{server,data}. Unpackaged: dist-desktop/{server,resources}, run either
// from dist-desktop/app/ (npm run desktop:start) or from the source electron/ directory.
const dist = app.isPackaged
  ? process.resourcesPath
  : path.basename(path.dirname(__dirname)) === 'dist-desktop'
    ? path.dirname(__dirname)
    : path.resolve(__dirname, '..', 'dist-desktop');
const serverDir = path.join(dist, 'server');
const resourcesDir = path.join(dist, app.isPackaged ? 'data' : 'resources');

let server = null; // { child, port, origin }
let mainWindow = null;
let quitting = false;
const aiConfig = createAiConfig(app.getPath('userData'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  // 本地服务等子进程非正常结束时记下原因（崩溃、被系统结束、内存不足等），便于排查。
  app.on('child-process-gone', (_event, details) => {
    serverLog?.write(`[${new Date().toISOString()}] child process gone: ${JSON.stringify(details)}\n`);
  });
  app.whenReady().then(() => {
    setUpProtocol();
    setUpMenu();
    setUpIpc();
    return launch();
  });
}

function logFile() {
  const directory = path.join(app.getPath('userData'), 'logs');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, 'server.log');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function respond(origin) {
  return new Promise(resolve => {
    const request = http.get(`${origin}/`, { timeout: 5000 }, response => {
      response.resume();
      resolve(response.statusCode > 0);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

/** Start the server once on a fresh port. Rejects with { code, message, log } on failure. */
function startOnce(log) {
  return freePort().then(port => new Promise((resolve, reject) => {
    const origin = `http://${HOST}:${port}`;
    const tail = [];
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !/^(AI_PROVIDER|DEEPSEEK_|SILICONFLOW_|OPENAI_|ANTHROPIC_)/.test(key)));
    Object.assign(env, {
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: HOST,
      NEXT_TELEMETRY_DISABLED: '1',
      ZIWEI_RESOURCES_DIR: resourcesDir,
      ZIWEI_DATA_DIR: app.getPath('userData'),
      // Tells lib/ai-provider.ts to ask this process for the AI settings instead of reading env vars.
      ZIWEI_DESKTOP: '1',
    });
    const child = utilityProcess.fork(path.join(serverDir, 'server.js'), [], {
      cwd: serverDir,
      env,
      stdio: 'pipe',
      serviceName: 'ziwei-server',
    });
    // The server asks for the decrypted AI settings right before each AI request; the reply goes
    // over this private message port only, so changes apply at once without a restart.
    child.on('message', (message) => {
      if (message?.type !== 'ai-config:get') return;
      let config = null;
      try {
        config = aiConfig.resolve();
      } catch {}
      child.postMessage({ type: 'ai-config', id: message.id, config });
    });
    let settled = false;
    let announced = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else {
        resolve({ child, port, origin });
      }
    };
    const onData = (chunk) => {
      log.write(chunk);
      const text = chunk.toString();
      tail.push(text);
      if (tail.length > 40) tail.shift();
      if (/Ready in|started server/i.test(text)) announced = true;
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    // 'exit' can arrive before the last stderr chunk (e.g. the EADDRINUSE error), so let the pipes drain first.
    const drained = Promise.all([child.stdout, child.stderr].filter(Boolean).map(stream =>
      new Promise(done => { stream.once('end', done); stream.once('close', done); })));
    child.once('exit', async (code) => {
      await Promise.race([drained, new Promise(done => setTimeout(done, 1000))]);
      const output = tail.join('');
      const busy = /EADDRINUSE/.test(output);
      finish(Object.assign(new Error(busy ? `端口 ${port} 已被占用` : `服务进程退出（代码 ${code}）`), {
        code: busy ? 'EADDRINUSE' : 'EXITED',
        log: output,
      }));
    });
    const timer = setTimeout(() => finish(Object.assign(new Error('服务启动超时'), { code: 'TIMEOUT', log: tail.join('') })), START_TIMEOUT_MS);
    // Wait for Next's "Ready" line (so we never talk to another process that took the port), then for a response.
    const poll = async () => {
      if (settled) return;
      if (announced && await respond(origin)) return finish();
      setTimeout(poll, 200);
    };
    poll();
  }));
}

let serverLog = null;

async function startServer() {
  const log = createWriteStream(logFile(), { flags: 'w' });
  serverLog = log;
  log.write(`[${new Date().toISOString()}] starting ${serverDir}\n`);
  let lastError;
  for (let attempt = 1; attempt <= PORT_ATTEMPTS; attempt++) {
    try {
      const started = await startOnce(log);
      log.write(`[${new Date().toISOString()}] ready on ${started.origin}\n`);
      started.child.once('exit', code => onServerExit(started, code));
      return started;
    } catch (error) {
      lastError = error;
      log.write(`[${new Date().toISOString()}] attempt ${attempt} failed: ${error.message}\n`);
      if (error.code !== 'EADDRINUSE') break;
    }
  }
  throw lastError;
}

function stopServer() {
  if (!server) return;
  const { child } = server;
  server = null;
  child.kill();
}

// Reopen the window where the user last left it (e.g. on a second monitor). Falls back to the
// primary display when that monitor is no longer connected.
function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const state = JSON.parse(readFileSync(windowStateFile(), 'utf8'));
    const { x, y, width, height } = state;
    if (![x, y, width, height].every(Number.isFinite)) return null;
    // At least 100×50 of the title bar area must be on a connected display.
    const visible = screen.getAllDisplays().some(({ workArea: area }) =>
      Math.min(x + width, area.x + area.width) - Math.max(x, area.x) >= 100
      && Math.min(y + 50, area.y + area.height) - Math.max(y, area.y) >= 50);
    return visible ? { bounds: { x, y, width, height }, maximized: !!state.maximized } : null;
  } catch {
    return null;
  }
}

function trackWindowState(window) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    try {
      writeFileSync(windowStateFile(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
    } catch {}
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  window.on('move', later);
  window.on('resize', later);
  window.on('maximize', save);
  window.on('unmaximize', save);
  window.on('close', save);
}

function createWindow() {
  const saved = loadWindowState();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    ...(saved?.bounds ?? {}),
    minWidth: 900,
    minHeight: 600,
    title: '紫微斗数',
    backgroundColor: '#f4efe4',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  trackWindowState(mainWindow);
  mainWindow.once('ready-to-show', () => {
    if (saved?.maximized) mainWindow?.maximize();
    mainWindow?.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  const isLocal = (url) => url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`);
  const openOutside = (url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: 'allow' };
    openOutside(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocal(url) || url.startsWith('file:')) return;
    event.preventDefault();
    openOutside(url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit' && server) mainWindow?.loadURL(APP_ORIGIN);
  });
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
}

async function launch() {
  if (!mainWindow) createWindow();
  try {
    server = await startServer();
  } catch (error) {
    stopServer();
    await showStartError(error);
    return;
  }
  // 打开首页和启动服务分开处理：首页还没加载完就被别的跳转打断（用户很快点了菜单、⌘, 等）时，
  // loadURL 会报 ERR_ABORTED。以前这会被当成「服务启动失败」，把正常运行的服务关掉并弹窗。
  mainWindow?.loadURL(aiConfig.needsSetup() ? `${APP_ORIGIN}/settings?welcome=1` : `${APP_ORIGIN}/`)
    .catch(error => serverLog?.write(`[${new Date().toISOString()}] first page load interrupted: ${error.message}\n`));
}

async function showStartError(error) {
  const detail = [error.message, '', ...(error.log ? [error.log.trim().split('\n').slice(-12).join('\n'), ''] : []), `日志：${logFile()}`].join('\n');
  const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'error',
    title: '紫微斗数',
    message: error.code === 'CRASHED' ? '本地服务意外退出' : '本地服务启动失败',
    detail,
    buttons: ['重试', '打开日志', '退出'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0) {
    mainWindow?.loadFile(path.join(__dirname, 'loading.html'));
    return launch();
  }
  if (response === 1) {
    shell.showItemInFolder(logFile());
    return showStartError(error);
  }
  app.quit();
}

function onServerExit(started, code) {
  serverLog?.write(`[${new Date().toISOString()}] server exited, code ${code}${quitting ? ' (quitting)' : ''}${server !== started ? ' (replaced)' : ''}\n`);
  if (quitting || server !== started) return;
  server = null;
  mainWindow?.loadFile(path.join(__dirname, 'loading.html'));
  showStartError(Object.assign(new Error(`本地服务意外退出（代码 ${code}）`), { code: 'CRASHED' }));
}

function openPage(path) {
  if (server && mainWindow) mainWindow.loadURL(`${APP_ORIGIN}${path}`);
}

function openSettings(hash = '') {
  openPage(`/settings${hash}`);
}

function setUpMenu() {
  const settings = { label: '设置 AI…', accelerator: 'CmdOrCtrl+,', click: () => openSettings() };
  if (process.platform !== 'darwin') {
    // Windows：不要窗口顶上那排「文件 / 编辑 …」菜单。设置在页面顶栏的「设置」里；
    // 输入框里的复制、粘贴、撤销等快捷键不依赖菜单。
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [
      { role: 'about' }, { type: 'separator' }, settings, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: '使用说明', click: () => openPage('/help') },
      { label: '版权与许可', click: () => openPage('/licenses') },
    ] },
  ]));
}

/** Only our own pages (ziwei://app) may use the settings API. */
function fromApp(event) {
  const url = event.senderFrame?.url ?? '';
  return url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`);
}

/** Forward ziwei://app/<path> to the local server, keeping method, headers, body and streaming. */
function setUpProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not Found', { status: 404 });
    if (!server) return new Response('本地服务尚未就绪', { status: 503 });
    const headers = new Headers(request.headers);
    // The server sees an ordinary same-origin request from itself.
    for (const name of ['host', 'origin', 'referer']) headers.delete(name);
    const hasBody = !['GET', 'HEAD'].includes(request.method) && request.body;
    let response;
    try {
      // Node's fetch rather than net.fetch: it hands back redirects as they are with redirect: 'manual'.
      response = await fetch(`${server.origin}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        duplex: hasBody ? 'half' : undefined,
        redirect: 'manual',
      });
    } catch {
      return new Response('本地服务没有响应', { status: 502 });
    }
    const out = new Headers(response.headers);
    // The body arrives already decompressed, so the original encoding and length no longer apply.
    out.delete('content-encoding');
    out.delete('content-length');
    const location = out.get('location');
    if (location?.startsWith(server.origin)) out.set('location', APP_ORIGIN + location.slice(server.origin.length));
    const empty = [101, 204, 205, 304].includes(response.status) || request.method === 'HEAD';
    return new Response(empty ? null : response.body, { status: response.status, statusText: response.statusText, headers: out });
  });
}

function setUpIpc() {
  const handle = (channel, run) => ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) throw new Error('不允许的来源');
    return run(...args);
  });
  handle('ai-config:get', () => aiConfig.view());
  handle('ai-config:test', (settings) => aiConfig.test(settings));
  handle('ai-config:save', (settings) => {
    try {
      aiConfig.save(settings);
      return { ok: true, config: aiConfig.view() };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  handle('ai-config:skip', () => {
    aiConfig.skip();
    return { ok: true };
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  quitting = true;
  stopServer();
});
