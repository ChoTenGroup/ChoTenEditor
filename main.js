const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { StringDecoder } = require('string_decoder');
const ceProject = require('./ce-project.js');
const mcAssets = require('./mc-assets.js');
const appVersion = require('./package.json').version;

// fs IPC 路径校验: 防非字符串/超长路径进入 fs API
function isValidFsPath(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 4096;
}

let mainWindow;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    frame: false,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
    },
  });
  mainWindow = win;

  win.loadFile('index.html');

  // 关闭窗口统一交给渲染进程确认：渲染进程的 beforeunload 会静默取消关闭，
  // 导致标题栏 ✕ / 任务栏 ✕ / Alt+F4 全都没反应 (只能任务管理器)。
  // 只有渲染进程注册过 onBeforeClose (app:closeHandlerReady) 时才拦截，
  // 否则照常关闭，避免页面没有确认逻辑时窗口被锁死。
  win.on('close', (event) => {
    if (win.__forceClose) return;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed()) return; // 渲染进程已死: 直接放行
    if (!win.__closeHandlerReady) return;                  // 该页面没有关闭确认逻辑: 直接放行
    event.preventDefault();
    try { wc.send('app:beforeClose'); } catch (e) {}
  });

  // 渲染进程卡死时给出强制关闭出口 (否则用户只能结束进程)
  // 用异步对话框: showMessageBoxSync 会阻塞主进程事件循环, 反而让窗口更关不掉
  win.on('unresponsive', () => {
    if (win.isDestroyed() || win.__forceClose || win.__unresponsivePrompt) return;
    win.__unresponsivePrompt = true;
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'ChoTenEditor',
      message: '编辑器界面无响应\nEditor window is not responding',
      detail: '可以继续等待它恢复；强制关闭会丢弃未保存的更改。\nYou can keep waiting, or force close and lose unsaved changes.',
      buttons: ['继续等待 / Wait', '强制关闭 / Force close'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then((res) => {
      if (win.isDestroyed()) return;
      win.__unresponsivePrompt = false;
      if (res && res.response === 1) {
        win.__forceClose = true;
        win.destroy();
      }
    }).catch(() => {
      if (!win.isDestroyed()) win.__unresponsivePrompt = false;
    });
  });

  // 渲染进程崩溃后窗口已无内容可保存, 不再拦截关闭
  win.webContents.on('render-process-gone', () => {
    win.__forceClose = true;
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// 供冒烟测试复用真实窗口逻辑 (非入口脚本 require 本文件时)
module.exports = {
  createWindow: createWindow,
  getMainWindow: () => mainWindow,
};

// 渲染进程已注册关闭确认流程 (只有这类窗口才拦截关闭)
ipcMain.on('app:closeHandlerReady', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.__closeHandlerReady = true;
});

// 渲染进程处理完未保存确认后, 允许真正关闭
ipcMain.on('app:closeConfirmed', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.__forceClose = true;
  win.close();
});

function startApp() {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// 入口判断: Electron 41+ 下 require.main 指向 electron 加载器而非入口脚本 (恒不等),
// 改用 argv[1] 与 package.json main 比对; 测试脚本 require 本文件时必须判定为非入口,
// 否则测试进程会占用单实例锁并阻止正常启动
function isAppEntry() {
  if (process.defaultApp !== true) return true; // 打包应用: 入口必是 main.js (Electron 41+ 打包后 defaultApp 为 undefined 而非 false)
  if (!process.argv[1]) return false;
  let entryFile = path.resolve(process.argv[1]);
  try {
    if (fs.statSync(entryFile).isDirectory()) {
      const pkg = JSON.parse(fs.readFileSync(path.join(entryFile, 'package.json'), 'utf-8'));
      if (pkg.main) entryFile = path.resolve(entryFile, pkg.main);
    }
  } catch (e) { /* 目录解析失败按非入口处理 */ }
  return entryFile === path.resolve(__filename);
}

// 单实例检测: 多实例共享同一磁盘缓存会导致缓存读写错误, 检测到已有实例时询问是否继续。
// 必须在 isAppEntry() 内执行: 测试脚本 require 本文件时不得占用实例锁,
// 否则残留测试进程会一直阻止正常启动
if (isAppEntry()) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    // 直接拦截: 多实例同时运行会因共享磁盘缓存/用户数据导致缓存错误与数据异常, 提示关闭现有实例后退出
    console.log('[MAIN] another instance detected, blocking startup');
    // dialog 只能在 app ready 后使用
    app.whenReady().then(() => {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'ChoTenEditor',
        message: '检测到另一个编辑器实例正在运行\nAnother editor instance is already running',
        detail: '请先关闭所有正在运行的编辑器实例，再重新启动编辑器。多个实例同时运行可能导致数据异常。\nPlease close all running editor instances before restarting. Running multiple instances may cause data corruption.',
        buttons: ['确定 / OK'],
        defaultId: 0,
        cancelId: 0,
      });
      app.quit();
    });
  } else {
    startApp();
  }
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths;
});
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.filePaths;
});
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.filePath;
});
ipcMain.handle('fs:readFile', async (event, filePath) => {
  if (!isValidFsPath(filePath)) return { success: false, error: '无效路径' };
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('[MAIN] readFile error:', filePath, error.message);
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
  if (!isValidFsPath(filePath) || typeof content !== 'string') return { success: false, error: '无效路径或内容' };
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:readdir', async (event, dirPath) => {
  if (!isValidFsPath(dirPath)) return { success: false, error: '无效路径' };
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
      // symlink 的 isDirectory() 恒为 false, 需 stat 目标判定, 否则符号链接目录会被当作文件跳过
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        try { isDir = (await fs.promises.stat(path.join(dirPath, entry.name))).isDirectory(); } catch (e) {}
      }
      return { name: entry.name, isDirectory: isDir, path: path.join(dirPath, entry.name) };
    }));
    // 目录在前, 名称排序 (与文件树展示一致)
    files.sort((a, b) => (a.isDirectory === b.isDirectory)
      ? a.name.localeCompare(b.name)
      : (a.isDirectory ? -1 : 1));
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
// ── 系统字体枚举 (Windows 注册表 / macOS·Linux 字体目录) ──
const VARIANT_RE = /\s+(bold|italic|light|medium|semibold|semilight|semi\s?bold|black|thin|regular|extrabold|extralight|condensed|narrow|heavy|display|outline|rounded|smallcaps)$/i;
let fontsCache = null;

function cleanFontName(raw) {
  let n = raw.replace(/\s*\((?:TrueType|OpenType)\)\s*$/i, '').trim();
  n = n.replace(/\s+(?:Italic|Oblique)$/i, '').trim();
  if (VARIANT_RE.test(n)) return null; // 过滤 Bold/Italic/Light 等变体, 只留主 family
  return n || null;
}

function listDirFonts(dirs) {
  const names = new Set();
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of files) {
      if (!/\.(ttf|otf|ttc)$/i.test(f)) continue;
      let name = f.replace(/\.(ttf|otf|ttc)$/i, '');
      // 目录文件名不等于 family 名, 去除常见文件后缀 (如 msyh.ttc → msyh), 保留原名作为候选
      name = name.replace(/[-_](bold|italic|light|medium|semibold|black|thin|regular)$/i, '');
      if (name && name.length > 1) names.add(name);
    }
  }
  return [...names];
}

async function listWindowsFonts() {
  const names = new Set();
  try {
    const { execFile } = require('child_process');
    // PowerShell 强制 UTF-8 输出注册表字体名, 规避 reg 的 ANSI 码页编码问题
    const script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n"
      + "$ErrorActionPreference = 'SilentlyContinue'\n"
      + "$key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'\n"
      + "(Get-ItemProperty -Path $key).PSObject.Properties | ForEach-Object { Write-Output $_.Name }";
    const out = await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    out.split(/\r?\n/).forEach((line) => {
      const n = cleanFontName(line.trim());
      if (n) names.add(n);
    });
  } catch (e) {}
  if (names.size === 0) {
    // 失败时退回枚举字体目录 (文件名近似 family 名)
    const dirs = [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')];
    names.add(...listDirFonts(dirs));
  }
  return [...names];
}

async function listSystemFonts() {
  if (fontsCache) return fontsCache;
  let names = [];
  if (process.platform === 'win32') {
    names = await listWindowsFonts();
  } else if (process.platform === 'darwin') {
    names = listDirFonts(['/System/Library/Fonts', '/Library/Fonts', path.join(require('os').homedir(), 'Library', 'Fonts')]);
  } else {
    names = listDirFonts(['/usr/share/fonts', '/usr/local/share/fonts', path.join(require('os').homedir(), '.fonts'), path.join(require('os').homedir(), '.local', 'share', 'fonts')]);
  }
  names = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  fontsCache = names;
  return names;
}
ipcMain.handle('fonts:list', async () => {
  try { return { success: true, fonts: await listSystemFonts() }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
  if (!isValidFsPath(dirPath)) return { success: false, error: '无效路径' };
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('fs:stat', async (event, filePath) => {
  if (!isValidFsPath(filePath)) return { success: false, error: '无效路径' };
  try {
    const stat = await fs.promises.stat(filePath);
    return { success: true, stat };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  if (!isValidFsPath(filePath)) return { success: false, error: '无效路径' };
  try {
    // 移入系统回收站 (而非永久删除)
    await shell.trashItem(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 目录复制 (递归): 渲染层树右键"复制/粘贴"用
async function copyDirRecursive(src, dest) {
  const stat = await fs.promises.stat(src);
  if (!stat.isDirectory()) {
    await fs.promises.copyFile(src, dest);
    return;
  }
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    await copyDirRecursive(path.join(src, entry.name), path.join(dest, entry.name));
  }
}

ipcMain.handle('fs:copyPath', async (event, src, dest) => {
  if (!isValidFsPath(src) || !isValidFsPath(dest)) return { success: false, error: '无效路径' };
  try {
    const stat = await fs.promises.stat(src);
    if (stat.isDirectory()) {
      // 防止把目录复制进自身 (dest 在 src 内部)
      const resolvedSrc = path.resolve(src);
      const resolvedDest = path.resolve(dest);
      if (resolvedDest === resolvedSrc || resolvedDest.startsWith(resolvedSrc + path.sep)) {
        return { success: false, error: '不能将目录复制到其自身内部' };
      }
      await copyDirRecursive(resolvedSrc, resolvedDest);
    } else {
      await fs.promises.copyFile(src, dest);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 重命名/移动文件或目录 (同一系统调用天然支持目录; 树右键"重命名"用)
ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  if (!isValidFsPath(oldPath) || !isValidFsPath(newPath)) return { success: false, error: '无效路径' };
  try {
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.resolve(newPath);
    if (resolvedOld === resolvedNew) return { success: true };
    // 目标已存在时拒绝, 避免覆盖用户文件
    try {
      await fs.promises.stat(resolvedNew);
      return { success: false, error: '目标名称已存在' };
    } catch (e) { /* 目标不存在, 继续 */ }
    await fs.promises.rename(resolvedOld, resolvedNew);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 在系统资源管理器中显示文件/目录 (并选中)
ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
  if (!isValidFsPath(filePath)) return { success: false, error: '无效路径' };
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('app:getPath', async () => {
  return __dirname;
});

ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  if (!isValidFsPath(src) || !isValidFsPath(dest)) return { success: false, error: '无效路径' };
  try {
    await fs.promises.copyFile(src, dest);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ce:resolveProjectRoot', async (event, filePath) => {
  try {
    return await ceProject.resolveProjectRoot(filePath);
  } catch (error) {
    return { found: false, error: error.message };
  }
});

// ============ Minecraft 资源索引 (补全 / 预览 数据源) ============
ipcMain.handle('mc:scanAssets', async (event, root) => {
  try {
    return await mcAssets.scanAssets(root);
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('mc:scanNamespace', async (event, nsDir, namespace) => {
  try {
    return { ok: true, registry: await mcAssets.scanNamespace(nsDir, namespace || path.basename(nsDir)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('mc:readSoundEvents', async (event, nsDir, langName) => {
  try {
    return { ok: true, events: await mcAssets.readSoundEvents(nsDir, langName) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// 二进制读取 (PNG/OGG 等) → data URL, 供预览渲染使用
ipcMain.handle('mc:readBinary', async (event, filePath) => {
  try {
    return await mcAssets.readBinaryDataUrl(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 文本读取 (模型 JSON / 字体 JSON / 语言 JSON)
ipcMain.handle('mc:readText', async (event, filePath) => {
  try {
    return await mcAssets.readTextFile(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mc:detectRoots', async () => {
  try {
    return { ok: true, roots: await mcAssets.detectRoots() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// Window controls
ipcMain.on('window:openDevTools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.openDevTools();
});
ipcMain.on('window:toggleDevTools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  } else {
    win.webContents.openDevTools();
  }
});
ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});
ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});
ipcMain.handle('app:getVersion', () => appVersion);
ipcMain.on('app:getVersionSync', (event) => { event.returnValue = appVersion; });

// ---- Checks (Debug) 窗口: 展示整个工程的配置问题 ----
let checksWindow = null;
let checksPayload = null;

function openChecksWindow() {
  if (checksWindow && !checksWindow.isDestroyed()) {
    if (checksWindow.isMinimized()) checksWindow.restore();
    checksWindow.focus();
    return checksWindow;
  }
  checksWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 720,
    minHeight: 420,
    title: 'Checks — ChoTenEditor',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try { checksWindow.setMenuBarVisibility(false); } catch (e) {}
  // 用 file:// URL 显式加载: loadFile 的路径解析依赖应用根, 入口脚本不在根时会跑偏
  const checksPage = pathToFileURL(path.join(__dirname, 'checks.html')).href;
  checksWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    console.error('[CHECKS] did-fail-load', code, desc, url, 'main=' + isMain);
  });
  checksWindow.loadURL(checksPage).catch((e) => {
    console.error('[CHECKS] load failed:', e && e.message);
  });
  // 页面加载完成后补推一次最新数据: 扫描可能在窗口还没加载完时就结束了, 那次推送会丢
  checksWindow.webContents.on('did-finish-load', () => {
    if (checksPayload) sendToChecksWindow('checks:update', checksPayload);
  });
  checksWindow.once('ready-to-show', () => { if (checksWindow && !checksWindow.isDestroyed()) checksWindow.show(); });
  checksWindow.on('closed', () => { checksWindow = null; });
  return checksWindow;
}

function sendToChecksWindow(channel, payload) {
  if (checksWindow && !checksWindow.isDestroyed()) {
    try { checksWindow.webContents.send(channel, payload); } catch (e) {}
  }
}

ipcMain.handle('checks:open', (event, payload) => {
  checksPayload = payload || null;
  openChecksWindow();
  return { ok: true };
});

ipcMain.handle('checks:update', (event, payload) => {
  checksPayload = payload || null;
  sendToChecksWindow('checks:update', checksPayload);
  return { ok: true };
});

// 窗口加载完成后主动拉取最新数据 (避免「开窗 → 扫描完成」之间的推送丢失)
ipcMain.handle('checks:data', () => checksPayload);

ipcMain.handle('checks:requestRescan', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('checks:rescan'); } catch (e) {}
  }
  return { ok: true };
});

ipcMain.handle('checks:gotoIssue', (event, issue) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('checks:goto', issue || {}); } catch (e) {}
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  return { ok: true };
});

ipcMain.handle('window:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

// ---- 预览独立窗口: 把 MC 场景预览放到真正的独立 OS 窗口里 ----
// 与 Checks 窗口同一套做法 (单独页面 + preload + 主进程推数据)。
// 独立窗口里只有预览面板本身, 不再叠在编辑器之上, 适合多屏/边看边改。
let previewWindow = null;
let previewPayload = null;   // 最近一次要渲染的 ctx + 选项

function openPreviewWindow(payload) {
  if (payload) previewPayload = payload;
  if (previewWindow && !previewWindow.isDestroyed()) {
    if (previewWindow.isMinimized()) previewWindow.restore();
    previewWindow.focus();
    return previewWindow;
  }
  previewWindow = new BrowserWindow({
    width: 880,
    height: 700,
    minWidth: 420,
    minHeight: 320,
    title: 'MC Preview — ChoTenEditor',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
    },
  });
  try { previewWindow.setMenuBarVisibility(false); } catch (e) {}
  const page = pathToFileURL(path.join(__dirname, 'ce-preview-window.html')).href;
  previewWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    console.error('[PREVIEWWIN] did-fail-load', code, desc, url, 'main=' + isMain);
  });
  previewWindow.loadURL(page).catch((e) => {
    console.error('[PREVIEWWIN] load failed:', e && e.message);
  });
  // 页面加载完补推一次: 打开窗口时那次可能早于页面就绪
  previewWindow.webContents.on('did-finish-load', () => {
    if (previewPayload) sendToPreviewWindow('preview:update', previewPayload);
  });
  previewWindow.once('ready-to-show', () => {
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.show();
  });
  previewWindow.on('closed', () => {
    previewWindow = null;
    // 通知主窗口: 独立预览已关闭 (面板好同步按钮状态)
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('preview:closed'); } catch (e) {}
    }
  });
  return previewWindow;
}

function sendToPreviewWindow(channel, payload) {
  if (previewWindow && !previewWindow.isDestroyed()) {
    try { previewWindow.webContents.send(channel, payload); } catch (e) {}
  }
}

ipcMain.handle('preview:openWindow', (event, payload) => {
  openPreviewWindow(payload || null);
  return { ok: true };
});

ipcMain.handle('preview:updateWindow', (event, payload) => {
  previewPayload = payload || null;
  sendToPreviewWindow('preview:update', previewPayload);
  return { ok: true };
});

ipcMain.handle('preview:getPayload', () => previewPayload);

ipcMain.handle('preview:closeWindow', () => {
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close();
  return { ok: true };
});

ipcMain.handle('preview:isWindowOpen', () => !!(previewWindow && !previewWindow.isDestroyed()));

// 独立预览窗口 → 主窗口的交互回传 (切换场景/条目等)
ipcMain.on('preview:fromWindow', (event, msg) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('preview:fromWindow', msg || {}); } catch (e) {}
  }
});

// 仅允许 http/https/mailto 链接交给系统打开, 防 file:// 等协议被渲染进程滥用
ipcMain.handle('shell:openExternal', async (event, url) => {
  if (typeof url !== 'string' || !/^(https?|mailto):/i.test(url)) return { success: false, error: '不允许的链接协议' };
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ============================================
// AI 制作
// ============================================

ipcMain.handle('ai:chat', async (event, { endpoint, model, apiKey, messages, maxTokens, temperature, systemPrompt }) => {
  try {
    var urlObj = new URL(endpoint);
    var isHttps = urlObj.protocol === 'https:';
    var postData = JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens || 4096,
      temperature: temperature !== undefined ? temperature : 0.7,
      stream: true,
    });

    var options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    var sender = event.sender;

    return new Promise(function(resolve, reject) {
      var requester = isHttps ? https : http;
      var req = requester.request(options, function(res) {
        var fullContent = '';
        var isDone = false;
        var decoder = new StringDecoder('utf8');
        var pendingLine = '';
        var totalBytes = 0;
        // 防御: 超大响应(异常 API 行为)直接终止, 避免内存无限增长
        var MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

        if (res.statusCode !== 200) {
          var errBody = '';
          res.on('data', function(chunk) { errBody += chunk.toString(); });
          res.on('end', function() {
            var errObj = { key: 'ai.apiError', params: { status: res.statusCode, body: errBody }, fallback: 'API 错误 ' + res.statusCode + ': ' + errBody };
            sender.send('ai:error', errObj);
            resolve({ success: false, error: errObj });
          });
          return;
        }

        res.on('data', function(chunk) {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            req.destroy(new Error('响应超出大小限制'));
            return;
          }
          // StringDecoder 保证跨 chunk 的 UTF-8 多字节字符不截断(中文不乱码);
          // pendingLine 保留未完成的行, 等下一个 chunk 拼完再解析
          pendingLine += decoder.write(chunk);
          var lines = pendingLine.split('\n');
          pendingLine = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || !line.startsWith('data: ')) continue;
            var data = line.slice(6).trim();
            if (data === '[DONE]') { isDone = true; continue; }
            try {
              var parsed = JSON.parse(data);
              var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                fullContent += delta.content;
                sender.send('ai:chunk', delta.content);
              }
            } catch (e) { /* skip parse errors */ }
          }
        });

        res.on('end', function() {
          pendingLine += decoder.end();
          if (pendingLine.trim()) {
            var tail = pendingLine.trim();
            if (tail.startsWith('data: ')) {
              var tailData = tail.slice(6).trim();
              if (tailData !== '[DONE]') {
                try {
                  var tp = JSON.parse(tailData);
                  var tdelta = tp.choices && tp.choices[0] && tp.choices[0].delta;
                  if (tdelta && tdelta.content) {
                    fullContent += tdelta.content;
                    sender.send('ai:chunk', tdelta.content);
                  }
                } catch (e) {}
              }
            }
          }
          sender.send('ai:done', fullContent);
          resolve({ success: true, content: fullContent });
        });
      });

      req.on('error', function(err) {
        sender.send('ai:error', err.message);
        resolve({ success: false, error: { key: 'ai.requestFailed', params: { msg: err.message }, fallback: '请求失败: ' + err.message } });
      });

      // 120s 无响应视为超时, 终止挂起请求
      req.setTimeout(120000, function() {
        req.destroy(new Error('请求超时'));
      });

      req.write(postData);
      req.end();
    });
  } catch (err) {
    event.sender.send('ai:error', err.message);
    return { success: false, error: { key: 'ai.requestFailed', params: { msg: err.message }, fallback: err.message } };
  }
});

// ============================================
// 提示词管理
// ============================================

ipcMain.handle('ai:getUserDataPath', async () => {
  return app.getPath('userData');
});

ipcMain.handle('ai:loadPrompts', async () => {
  try {
    var builtInDir = path.join(__dirname, 'prompts');
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    var prompts = {};

    // 加载内置提示词
    try {
      var builtInFiles = await fs.promises.readdir(builtInDir);
      for (var i = 0; i < builtInFiles.length; i++) {
        var file = builtInFiles[i];
        if (!file.endsWith('.md')) continue;
        var name = file.slice(0, -3);
        var content = await fs.promises.readFile(path.join(builtInDir, file), 'utf-8');
        prompts[name] = { name: name, content: content, builtIn: true };
      }
    } catch (e) { /* 内置目录不存在则忽略 */ }

    // 加载用户自定义提示词（覆盖内置同名）
    try {
      await fs.promises.mkdir(userDataDir, { recursive: true });
      var userFiles = await fs.promises.readdir(userDataDir);
      for (var j = 0; j < userFiles.length; j++) {
        var uf = userFiles[j];
        if (!uf.endsWith('.md')) continue;
        var uname = uf.slice(0, -3);
        var ucontent = await fs.promises.readFile(path.join(userDataDir, uf), 'utf-8');
        // 用户提示词覆盖同名内置，保留原 builtIn 标志
        if (prompts[uname]) {
          prompts[uname].content = ucontent;
          prompts[uname].overridden = true;
        } else {
          prompts[uname] = { name: uname, content: ucontent, builtIn: false };
        }
      }
    } catch (e) { /* 用户目录异常忽略 */ }

    return { success: true, prompts: prompts };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 提示词名白名单: 只允许文件系统安全的名称, 防路径穿越 (../../x 写出 userData 目录)
function isValidPromptName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 100 &&
    !/[\\\/:*?"<>|]/.test(name) && name !== '.' && name !== '..';
}

ipcMain.handle('ai:saveUserPrompt', async (event, promptName, content) => {
  try {
    if (!isValidPromptName(promptName) || typeof content !== 'string') {
      return { success: false, error: '无效的提示词名称' };
    }
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    await fs.promises.mkdir(userDataDir, { recursive: true });
    var filePath = path.join(userDataDir, promptName + '.md');
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('ai:deleteUserPrompt', async (event, promptName) => {
  try {
    if (!isValidPromptName(promptName)) {
      return { success: false, error: '无效的提示词名称' };
    }
    var userDataDir = path.join(app.getPath('userData'), 'prompts');
    var filePath = path.join(userDataDir, promptName + '.md');
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ============================================
// 远程模式
// ============================================

const remote = require('./remote.js');

// 设置事件回调：将 remote 模块的事件转发到 renderer
remote.setEventHandler((event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('remote:event', event, data);
  }
});

// 服务器
ipcMain.handle('remote:startServer', async (event, { port, password, allowDifferentVersions }) => {
  try {
    return await remote.startServer(port, password, { allowDifferentVersions });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('remote:stopServer', async () => {
  await remote.stopServer();
  return { success: true };
});

ipcMain.handle('remote:getServerStatus', () => {
  return remote.getServerStatus();
});

ipcMain.handle('remote:confirmClient', (event, { clientId }) => {
  return remote.confirmClient(clientId);
});

ipcMain.handle('remote:rejectClient', (event, { clientId }) => {
  return remote.rejectClient(clientId);
});

ipcMain.handle('remote:setClientPermission', (event, { clientId, permission }) => {
  return remote.setClientPermission(clientId, permission);
});

ipcMain.handle('remote:setClientFilePermission', (event, { clientId, filePath, permission }) => {
  return remote.setClientFilePermission(clientId, filePath, permission);
});

ipcMain.handle('remote:disconnectClient', (event, { clientId }) => {
  remote.disconnectClient(clientId);
  return { success: true };
});

ipcMain.handle('remote:disconnectAll', () => {
  remote.disconnectAll();
  return { success: true };
});

ipcMain.handle('remote:applyApprovedWrite', (event, { clientId, filePath, content }) => {
  remote.applyApprovedWrite(clientId, filePath, content);
  return { success: true };
});

ipcMain.handle('remote:notifyFileChangeRejected', (event, { clientId, filePath }) => {
  remote.notifyFileChangeRejected(clientId, filePath, '管理员拒绝了更改', 'remote.changeRejectedByAdmin');
  return { success: true };
});

ipcMain.handle('remote:applyApprovedDelete', (event, { clientId, filePath }) => {
  remote.applyApprovedDelete(clientId, filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyFileDeleteRejected', (event, { clientId, filePath }) => {
  remote.notifyFileDeleteRejected(clientId, filePath, '管理员拒绝了删除请求', 'remote.deleteRejectedByAdmin');
  return { success: true };
});

// 客户端
ipcMain.handle('remote:connectToServer', async (event, { host, port, password, version }) => {
  try {
    return await remote.connectToServer(host, port, password, version);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('remote:disconnectFromServer', async () => {
  await remote.disconnectFromServer();
  return { success: true };
});

ipcMain.handle('remote:getClientStatus', () => {
  return remote.getClientStatus();
});

ipcMain.handle('remote:requestFileRead', (event, { filePath }) => {
  remote.requestFileRead(filePath);
  return { success: true };
});

ipcMain.handle('remote:requestFileWrite', (event, { filePath, content }) => {
  remote.requestFileWrite(filePath, content);
  return { success: true };
});

ipcMain.handle('remote:requestFileList', (event, { dirPath }) => {
  remote.requestFileList(dirPath);
  return { success: true };
});

ipcMain.handle('remote:requestFileDelete', (event, { filePath }) => {
  remote.requestFileDelete(filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyEditingStart', (event, { filePath }) => {
  remote.notifyEditingStart(filePath);
  return { success: true };
});

ipcMain.handle('remote:notifyEditingEnd', (event, { filePath }) => {
  remote.notifyEditingEnd(filePath);
  return { success: true };
});

ipcMain.handle('remote:requestEditingList', () => {
  remote.requestEditingList();
  return { success: true };
});
