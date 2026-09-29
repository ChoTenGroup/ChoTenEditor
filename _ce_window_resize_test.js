/* 预览窗口可放大: WindowManager 右下角拖动改大小 + ⛶ 最大化/还原 + 尺寸记忆
 * 用法: node_modules\.bin\electron.cmd _ce_window_resize_test.js
 *
 * 覆盖:
 *   - 窗口有 .cw-resize 拖角与 .cw-max 最大化按钮
 *   - 拖动右下角能改大小, 内容是跟着变 + 会派发 resize
 *   - ⛶ 最大化铺到视口内, 再点还原
 *   - 预览面板: 窗口变大后画布(界面尺寸自动)跟着变大; 关掉重开保持调过的大小
 *   - resizable: false / 最小尺寸限制
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

ipcMain.handle('app:getPath', async () => APP_DIR);
ipcMain.handle('fs:readFile', async (e, p) => { try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; } catch (x) { return { success: false }; } });
ipcMain.handle('fs:readdir', async (e, p) => { try { const es = await fs.promises.readdir(p, { withFileTypes: true }); return { success: true, files: es.map(x => ({ name: x.name, isDirectory: x.isDirectory(), path: path.join(p, x.name) })) }; } catch (x) { return { success: false }; } });
ipcMain.handle('ce:resolveProjectRoot', async (e, p) => { try { return await ceProject.resolveProjectRoot(p); } catch (x) { return { found: false }; } });
ipcMain.handle('mc:scanAssets', async (e, r) => mcAssets.scanAssets(r));
ipcMain.handle('mc:scanNamespace', async (e, d, n) => ({ ok: true, registry: await mcAssets.scanNamespace(d, n) }));
ipcMain.handle('mc:readSoundEvents', async (e, d, l) => ({ ok: true, events: await mcAssets.readSoundEvents(d, l) }));
ipcMain.handle('mc:readBinary', async (e, p) => mcAssets.readBinaryDataUrl(p));
ipcMain.handle('mc:readText', async (e, p) => mcAssets.readTextFile(p));
ipcMain.handle('mc:detectRoots', async () => ({ ok: true, roots: await mcAssets.detectRoots() }));
ipcMain.handle('fonts:list', async () => ({ success: true, fonts: [] }));
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'resize'; });

const YML = [
  'images:',
  '  internal:item_browser:',
  '    height: 9',
  '    ascent: 8',
  '    font: minecraft:include/unifont',
  '',
].join('\n');

(async () => {
  await app.whenReady();
  const fixture = path.join(APP_DIR, '_ce_tmp', 'window_resize', 'demo.yml');
  fs.mkdirSync(path.dirname(fixture), { recursive: true });
  fs.writeFileSync(fixture, YML);

  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await sleep(700);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  // 先关掉欢迎弹窗与首次启动的语言选择遮罩: 它们的 z-index (999999) 本来就在窗口层之上,
  // 会挡住命中测试 (真实使用时它们只出现一次, 而且应用标题栏始终在它们之上)
  await js(`(function () {
    const b = document.getElementById('welcome-btn'); if (b) b.click();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    const lp = document.getElementById('lang-picker-overlay'); if (lp) lp.style.display = 'none';
    return true;
  })()`);
  await sleep(300);

  // ---------- 1) 纯 WindowManager: 拖角 / 最大化 / 最小尺寸 / 不可缩放 ----------
  const plain = await js(`(function () {
    const w1 = window.WindowManager.open({ title: 'T1', content: 'x', width: 400, height: 300, x: 40, y: 40 });
    const w2 = window.WindowManager.open({ title: 'T2', content: 'x', width: 300, height: 200, x: 500, y: 40, resizable: false, maximizable: false });
    const w3 = window.WindowManager.open({ title: 'T3', content: 'x', width: 400, height: 300, x: 40, y: 400, minWidth: 360, minHeight: 260 });
    return {
      w1: { w: w1.el.offsetWidth, h: w1.el.offsetHeight, grip: !!w1.el.querySelector('.cw-resize'), max: !!w1.el.querySelector('.cw-max') },
      w2: { grip: !!w2.el.querySelector('.cw-resize'), max: !!w2.el.querySelector('.cw-max') },
      w3: { minW: w3.el.style.minWidth, minH: w3.el.style.minHeight },
      resizeEvents: 0,
    };
  })()`, true);
  console.log('窗口初始:', JSON.stringify(plain));
  check(plain.w1.grip && plain.w1.max, '普通窗口有拖角 + 最大化按钮');
  check(!plain.w2.grip && !plain.w2.max, 'resizable/maximizable: false 时不生成那些控件');
  check(plain.w3.minW === '360px' && plain.w3.minH === '260px', '支持自定义最小尺寸 (' + plain.w3.minW + '/' + plain.w3.minH + ')');

  // 拖动右下角 (第 1 个窗口)
  const dragged = await js(`(function () {
    const el = document.querySelectorAll('.cw-window')[0];
    const w1 = window.WindowManager.windows[0];
    let events = 0;
    w1.onResize(function () { events++; });
    const g = el.querySelector('.cw-resize');
    const r = g.getBoundingClientRect();
    const sx = r.left + 6, sy = r.top + 6;
    g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: sx, clientY: sy }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: sx + 220, clientY: sy + 130 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: sx + 220, clientY: sy + 130 }));
    return { w: w1.el.offsetWidth, h: w1.el.offsetHeight, events: events };
  })()`, true);
  console.log('拖角后:', JSON.stringify(dragged));
  check(dragged.w >= 610 && dragged.w <= 640, '向右拖 220px 后宽度跟着变 (' + dragged.w + ')');
  check(dragged.h >= 420 && dragged.h <= 445, '向下拖 130px 后高度跟着变 (' + dragged.h + ')');
  check(dragged.events > 0, 'onResize 回调被触发 (' + dragged.events + ' 次)');

  // 最小尺寸限制: 往左上拖回去
  const shrunk = await js(`(function () {
    const w1 = window.WindowManager.windows[0];
    const g = w1.el.querySelector('.cw-resize');
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + 6, clientY: r.top + 6 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left - 900, clientY: r.top - 900 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { w: w1.el.offsetWidth, h: w1.el.offsetHeight };
  })()`, true);
  check(shrunk.w === 320 && shrunk.h === 200, '缩到默认最小尺寸就停住 (' + shrunk.w + 'x' + shrunk.h + ')');

  // ⛶ 最大化 / 还原
  const maxed = await js(`(function () {
    const w1 = window.WindowManager.windows[0];
    const before = { w: w1.el.offsetWidth, h: w1.el.offsetHeight, x: w1.el.offsetLeft, y: w1.el.offsetTop };
    w1.el.querySelector('.cw-max').click();
    const chrome = window.WindowManager.chromeTop();
    const during = { w: w1.el.offsetWidth, h: w1.el.offsetHeight, x: w1.el.offsetLeft, y: w1.el.offsetTop,
                     isMax: w1.isMaximized(), vw: window.innerWidth, vh: window.innerHeight, chrome: chrome };
    w1.el.querySelector('.cw-max').click();
    const after = { w: w1.el.offsetWidth, h: w1.el.offsetHeight, isMax: w1.isMaximized() };
    return { before: before, during: during, after: after };
  })()`, true);
  console.log('最大化:', JSON.stringify(maxed));
  check(maxed.during.isMax
    && maxed.during.w === maxed.during.vw - 16
    && maxed.during.y === maxed.during.chrome + 8
    && maxed.during.h === maxed.during.vh - maxed.during.y - 8,
    '⛶ 铺满视口、顶部让开标题栏 (' + maxed.during.w + 'x' + maxed.during.h + ' @y' + maxed.during.y +
    ', 视口 ' + maxed.during.vw + 'x' + maxed.during.vh + ', chrome ' + maxed.during.chrome + ')');
  check(!maxed.after.isMax && maxed.after.w === maxed.before.w && maxed.after.h === maxed.before.h,
    '再点一次还原成原来的大小 (' + maxed.after.w + 'x' + maxed.after.h + ')');

  // ---------- 1b) 关不掉的两种情况 ----------
  // (a) 窗口 z-index 无限递增会盖住应用标题栏 → 右上角 ✕ 点不到
  const zs = await js(`(function () {
    const w1 = window.WindowManager.windows[0];
    for (let i = 0; i < 12000; i++) w1.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const z = window.WindowManager.debugZ();
    const appClose = document.getElementById('tb-close');
    const r = appClose.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: z.top, max: z.max, windows: z.windows, hitId: hit ? (hit.id || hit.className) : null,
             appCloseZ: getComputedStyle(document.querySelector('.title-bar')).zIndex };
  })()`, true);
  console.log('z-index:', JSON.stringify(zs));
  check(zs.windows.every(z => z < 1000000), '窗口 z-index 始终低于应用标题栏 (' + zs.windows.join(',') + ' < ' + zs.appCloseZ + ')');
  check(zs.windows.every(z => z <= zs.max), '不会超出窗口层上限 ' + zs.max + ' (' + zs.windows.join(',') + ')');
  check(zs.hitId === 'tb-close', '点很多次窗口后, 应用右上角关闭按钮仍然可点 (命中 ' + zs.hitId + ')');

  // (b) 最大化不能钻到应用标题栏下面, 否则窗口自己的 ✕ 也点不到
  const maxHit = await js(`(function () {
    const w1 = window.WindowManager.windows[0];
    w1.toggleMax();
    const chrome = window.WindowManager.chromeTop();
    const el = w1.el;
    const close = el.querySelector('.cw-close');
    const r = close.getBoundingClientRect();
    const hitWin = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const app = document.getElementById('tb-close');
    const ar = app.getBoundingClientRect();
    const hitApp = document.elementFromPoint(ar.left + ar.width / 2, ar.top + ar.height / 2);
    const desc = function (el) {
      if (!el) return null;
      return (el.tagName || '?').toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '');
    };
    return { top: el.offsetTop, chrome: chrome, winCloseHit: hitWin === close, appCloseHit: hitApp === app,
             hitWinDesc: desc(hitWin), closeZ: getComputedStyle(close).zIndex,
             winZ: el.style.zIndex, fullyVisible: r.top >= chrome };
  })()`, true);
  console.log('最大化命中测试:', JSON.stringify(maxHit));
  check(maxHit.top >= maxHit.chrome, '最大化后窗口顶部让开标题栏 (' + maxHit.top + ' >= ' + maxHit.chrome + ')');
  check(maxHit.fullyVisible && maxHit.winCloseHit, '窗口自己的 ✕ 完全可见可点');
  check(maxHit.appCloseHit, '应用右上角 ✕ 依然可点');

  // (c) 应用窗口被缩小后, 大窗口要收回视口内 (否则 ✕ 跑到屏幕外)
  await js(`(function () { window.WindowManager.windows[0].toggleMax(); })()`);
  await js(`(function () { window.WindowManager.windows[0].setSize(1100, 720); })()`);
  win.setSize(900, 640);
  await sleep(700);
  const refit = await js(`(function () {
    const w = window.WindowManager.windows[0];
    const r = w.el.getBoundingClientRect();
    const c = w.el.querySelector('.cw-close');
    const cr = c.getBoundingClientRect();
    return { w: w.el.offsetWidth, h: w.el.offsetHeight, left: r.left, top: r.top,
             vw: window.innerWidth, vh: window.innerHeight,
             closeVisible: cr.right <= window.innerWidth + 1 && cr.bottom <= window.innerHeight + 1 && cr.top >= -1 && cr.left >= -1 };
  })()`, true);
  console.log('应用窗口缩小后:', JSON.stringify(refit));
  check(refit.w <= refit.vw && refit.h <= refit.vh && refit.closeVisible,
    '应用窗口缩小时大窗口自动收回视口内 (' + refit.w + 'x' + refit.h + ' / 视口 ' + refit.vw + 'x' + refit.vh + ')');
  win.setSize(1200, 900);
  await sleep(700);

  await js(`window.WindowManager.windows.slice().forEach(w => w.close())`);

  // ---------- 2) 预览面板: 放大后画布跟着变大, 关掉重开保持大小 ----------
  await js(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(fixture)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    const b = document.getElementById('welcome-btn'); if (b) b.click();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    window.CEPreviewPanel.open({ file: Y, section: 'images', sectionBase: 'images', entryKey: 'internal:item_browser' });
    return true;
  })()`, true);
  await sleep(1200);

  const panelState = async () => await js(`(function () {
    const w = document.querySelector('.cw-preview');
    const c = document.querySelector('#pv-canvas');
    return w && c ? { w: w.offsetWidth, h: w.offsetHeight, canvas: c.width + 'x' + c.height,
      scale: parseInt(c.getAttribute('data-gui-scale'), 10),
      grip: !!w.querySelector('.cw-resize'), max: !!w.querySelector('.cw-max'),
      vw: window.innerWidth, vh: window.innerHeight } : null;
  })()`, true);

  const before = await panelState();
  console.log('面板初始:', JSON.stringify(before));
  check(!!before && before.grip && before.max, '预览窗口也有拖角 + 最大化按钮');

  await js(`document.querySelector('.cw-preview .cw-max').click()`);
  await sleep(1200);
  const maxPanel = await panelState();
  console.log('面板最大化:', JSON.stringify(maxPanel));
  check(maxPanel.w > before.w && maxPanel.h > before.h, '预览窗口被拉大 (' + before.w + 'x' + before.h + ' → ' + maxPanel.w + 'x' + maxPanel.h + ')');
  check(maxPanel.scale > before.scale, '界面尺寸「自动」跟着变大 (' + before.scale + 'x → ' + maxPanel.scale + 'x)');
  check(parseInt(maxPanel.canvas, 10) > parseInt(before.canvas, 10),
    '画布实际变大 (' + before.canvas + ' → ' + maxPanel.canvas + ')');

  // 还原 + 拖动改大小, 然后关掉重开
  await js(`document.querySelector('.cw-preview .cw-max').click()`);
  await sleep(900);
  await js(`(function () {
    const el = document.querySelector('.cw-preview');
    const g = el.querySelector('.cw-resize');
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + 6, clientY: r.top + 6 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 6 + 200, clientY: r.top + 6 + 90 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })()`);
  await sleep(1200);
  const resized = await panelState();
  console.log('面板拖动后:', JSON.stringify(resized));
  check(resized.w > before.w, '拖动右下角把预览窗口拉大 (' + before.w + ' → ' + resized.w + ')');

  await js(`(function () { window.CEPreviewPanel.close(); return true; })()`);
  await sleep(300);
  await js(`(function () {
    window.CEPreviewPanel.open({ file: ${JSON.stringify(fixture)}, section: 'images', sectionBase: 'images', entryKey: 'internal:item_browser' });
    return true;
  })()`);
  await sleep(1200);
  const reopened = await panelState();
  console.log('重开:', JSON.stringify(reopened));
  check(reopened.w === resized.w && reopened.h === resized.h,
    '重开时保持调过的大小 (' + reopened.w + 'x' + reopened.h + ')');

  // 截图留档
  const SHOT_DIR = path.join(APP_DIR, '_ce_shots');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOT_DIR, 'window-resize-' + Date.now() + '.png'), img.toPNG());
  console.log('截图 → _ce_shots\\window-resize-*.png');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
