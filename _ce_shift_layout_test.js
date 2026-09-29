/* 验证预览面板里「偏移」行是否单独占一行
 * 用法: node_modules\.bin\electron.cmd _ce_shift_layout_test.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const CE_YML = 'E:/craft-engine/common-files/src/main/resources/resources/internal/configuration/gui.yml';

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'lay'; });

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await sleep(800);
  await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(CE_YML)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);
    await window.CEPreview.preloadImages();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    window.CEPreviewPanel.open({ file: Y, section: 'images', sectionBase: 'images',
      entryKey: 'internal:item_browser',
      data: { height: 140, ascent: 18, file: 'minecraft:font/gui/custom/item_browser.png' } });
    return true;
  })()`, true);
  await sleep(1200);

  const box = await win.webContents.executeJavaScript(`(function(){
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const shift = rect('.pv-shift');
    const text = rect('.pv-text');
    const checks = rect('.pv-checks');
    // 偏移行内所有控件是否在同一水平带里
    const kids = Array.from(document.querySelectorAll('.pv-shift > *')).map(e => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : ''),
               top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    });
    const tb = rect('.pv-toolbar');
    return { shift: shift, text: text, checks: checks, kids: kids, toolbar: tb,
             shiftCss: (function(){ const e=document.querySelector('.pv-shift'); const c=getComputedStyle(e);
               return { flexBasis: c.flexBasis, flexGrow: c.flexGrow, flexShrink: c.flexShrink }; })() };
  })()`, true);

  console.log('偏移行:', JSON.stringify(box.shift));
  console.log('文字行:', JSON.stringify(box.text));
  console.log('偏移行内控件:');
  for (const k of box.kids) console.log('   ' + k.tag + '  top=' + k.top + ' bottom=' + k.bottom + ' (x ' + k.left + '..' + k.right + ')');
  console.log('flex:', JSON.stringify(box.shiftCss));

  check(!!box.shift && !!box.text, '偏移行与文字行都存在');
  // 偏移行必须整行宽, 且顶边在文字行下方 (不与文字行并排)
  check(box.shift.w >= box.toolbar.w - 4, '偏移行占满整行宽度 (' + box.shift.w + ' / 工具栏 ' + box.toolbar.w + ')');
  check(box.shift.top >= box.text.bottom - 2, '偏移行在文字行下方另起一行 (偏移 top=' + box.shift.top + ', 文字 bottom=' + box.text.bottom + ')');
  // 行内控件都在同一水平带
  const tops = box.kids.map(k => k.top);
  const bottoms = box.kids.map(k => k.bottom);
  check(Math.max.apply(null, tops) < Math.min.apply(null, bottoms),
    '偏移行内所有控件同一行 (top ' + JSON.stringify(tops) + ')');
  // 顺序: -10 -1 [数值] +1 +10 插入
  const order = box.kids.map(k => k.left);
  let sorted = true;
  for (let i = 1; i < order.length; i++) if (order[i] < order[i - 1]) sorted = false;
  check(sorted, '控件从左到右顺序正确 (-10 −1 数值 +1 +10 插入)');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
