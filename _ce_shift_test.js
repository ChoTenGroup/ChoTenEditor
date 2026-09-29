/* 偏移 <shift:N> 快捷控件验证
 * 用法: node_modules\.bin\electron.cmd _ce_shift_test.js
 *
 * 覆盖: -10/-1/+1/+10 微调、插入 <shift:N>、连续微调改同一个标签、
 *       文本里真的出现标签、以及渲染宽度随之变化。
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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'shift'; });

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
    window.CEPreviewPanel.open({ file: Y, section: 'images', sectionBase: 'images',
      entryKey: 'internal:item_browser',
      data: { height: 140, ascent: 18, file: 'minecraft:font/gui/custom/item_browser.png' } });
    return true;
  })()`, true);
  await sleep(1200);

  function state() {
    return win.webContents.executeJavaScript(`(function(){
      const t = document.querySelector('#pv-text');
      const s = document.querySelector('#pv-shift');
      const c = document.querySelector('#pv-canvas');
      return { text: t ? t.value : null, shift: s ? s.value : null,
               caret: t ? t.selectionStart : null,
               canvas: c ? c.width + 'x' + c.height : null,
               useText: document.querySelector('#pv-usetext') ? document.querySelector('#pv-usetext').checked : null };
    })()`, true);
  }
  function click(sel) {
    return win.webContents.executeJavaScript(`(function(){ const b=document.querySelector('${sel}'); if(!b) return false; b.click(); return true; })()`, true);
  }
  function nudge(v) {
    return win.webContents.executeJavaScript(`(function(){ const b=document.querySelector('.pv-nudge[data-shift="${v}"]'); if(!b) return false; b.click(); return true; })()`, true);
  }
  async function setShiftValue(v) {
    await win.webContents.executeJavaScript(`(function(){
      const s=document.querySelector('#pv-shift'); s.value='${v}';
      s.dispatchEvent(new Event('change',{bubbles:true}));
    })()`, true);
    await sleep(600);
  }

  // 面板控件存在
  const hasCtl = await win.webContents.executeJavaScript(`(function(){
    return { nudges: Array.from(document.querySelectorAll('.pv-nudge')).map(b=>b.getAttribute('data-shift')),
             insert: !!document.querySelector('#pv-shift-insert'),
             input: !!document.querySelector('#pv-shift') };
  })()`, true);
  check(hasCtl.input, '偏移数值输入框存在');
  check(hasCtl.insert, '「插入 <shift:N>」按钮存在');
  check(JSON.stringify(hasCtl.nudges) === JSON.stringify(['-10','-1','1','10']),
    '四个快捷按键 -10/-1/+1/+10 齐全 (' + JSON.stringify(hasCtl.nudges) + ')');

  // 先清空文本, 从干净状态开始
  await win.webContents.executeJavaScript(`(function(){
    const t=document.querySelector('#pv-text'); t.value='<white>AB';
    t.dispatchEvent(new Event('change',{bubbles:true}));
    const u=document.querySelector('#pv-usetext'); u.checked=true; u.dispatchEvent(new Event('change',{bubbles:true}));
    t.setSelectionRange(0,0);
  })()`, true);
  await sleep(700);
  const s0 = await state();
  check(s0.text === '<white>AB', '起点文本 = <white>AB (' + s0.text + ')');

  // 点 +10: 应该在光标处插入 <shift:10>
  await win.webContents.executeJavaScript(`(function(){ document.querySelector('#pv-text').setSelectionRange(0,0); })()`, true);
  await nudge(10); await sleep(700);
  const s1 = await state();
  check(s1.text.indexOf('<shift:10>') === 0, '点 +10 在光标处插入 <shift:10> (' + s1.text + ')');
  check(s1.shift === '10', '数值框同步为 10 (' + s1.shift + ')');

  // 再点 +1: 应该改同一个标签 -> <shift:11>, 而不是再插一个
  await nudge(1); await sleep(700);
  const s2 = await state();
  check(s2.text === '<shift:11><white>AB', '再点 +1 就地改成 <shift:11> (' + s2.text + ')');
  check((s2.text.match(/<shift:/g) || []).length === 1, '没有重复插入标签 (共 ' + (s2.text.match(/<shift:/g) || []).length + ' 个)');

  // -10 -> 1
  await nudge(-10); await sleep(700);
  const s3 = await state();
  check(s3.text === '<shift:1><white>AB', '−10 后为 <shift:1> (' + s3.text + ')');

  // -1 -> 0
  await nudge(-1); await sleep(700);
  const s4 = await state();
  check(s4.text === '<shift:0><white>AB', '−1 后为 <shift:0> (' + s4.text + ')');

  // 直接输入数值
  await setShiftValue(-136);
  const s5 = await state();
  check(s5.text === '<shift:-136><white>AB', '输入 −136 后标签为 <shift:-136> (' + s5.text + ')');

  // 渲染宽度必须随 shift 变化 —— 切到聊天场景 (容器 GUI 的画布是固定 176px, 看不出位移)
  await click('[data-pv-scene="chat"]');
  await sleep(800);
  const canvasW = () => win.webContents.executeJavaScript(
    `(function(){ const c=document.querySelector('#pv-canvas'); return c ? c.width : 0; })()`, true);
  await setShiftValue(-136);
  const w1 = await canvasW();
  await setShiftValue(120);
  const w2 = await canvasW();
  console.log('聊天画布宽度: <shift:-136> → ' + w1 + 'px,  <shift:120> → ' + w2 + 'px');
  check(w2 > w1, '渲染结果随偏移变化 (右移越多画布越宽)');

  // 插入按钮: 在光标处追加一个独立标签 (先用 getState 直接设数值, 避免触发自动插入)
  await win.webContents.executeJavaScript(`(function(){
    window.CEPreviewPanel.getState().shiftValue = -11;
    const t=document.querySelector('#pv-text'); t.value='<white>AB';
    t.dispatchEvent(new Event('change',{bubbles:true}));
    t.setSelectionRange(9,9);
  })()`, true);
  await sleep(500);
  await click('#pv-shift-insert'); await sleep(700);
  const s6 = await state();
  check(s6.text === '<white>AB<shift:-11>', '「插入」在光标处追加一个独立标签 (' + s6.text + ')');

  // 上限保护
  await setShiftValue(9999);
  const s7 = await state();
  check(/<shift:(256|9999)>/.test(s7.text) && s7.shift === '256',
    '数值被夹到 ±256 (' + s7.shift + ', 文本 ' + s7.text + ')');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
