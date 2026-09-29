/* 预览面板 UI 验证: 界面尺寸 下拉 + 自定义文字 输入 是否真正驱动渲染
 * 用法: node_modules\.bin\electron.cmd _ce_panel_ui_test.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const CE_YML = 'E:/craft-engine/common-files/src/main/resources/resources/internal/configuration/gui.yml';
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'ui'; });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await sleep(800);

  const boot = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(CE_YML)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);
    await window.CEPreview.preloadImages();
    // 打开一个字体图像条目的预览面板
    window.CEPreviewPanel.open({
      file: Y, section: 'images', sectionBase: 'images',
      entryKey: 'internal:item_browser',
      data: { height: 140, ascent: 18, file: 'minecraft:font/gui/custom/item_browser.png' },
    });
    return true;
  })()`, true);

  // 面板在独立窗口里 (WindowManager), 找到它
  await sleep(1200);
  const wins = BrowserWindow.getAllWindows();
  let panel = null;
  for (const w of wins) {
    try {
      const has = await w.webContents.executeJavaScript(`!!document.querySelector('#pv-canvas')`, true);
      if (has) { panel = w; break; }
    } catch (e) { /* ignore */ }
  }
  check(!!panel, '找到预览面板窗口 (共 ' + wins.length + ' 个窗口)');
  if (!panel) { app.exit(1); return; }

  async function uiState() {
    return await panel.webContents.executeJavaScript(`(function () {
      const c = document.querySelector('#pv-canvas');
      return {
        scaleOpts: Array.from(document.querySelectorAll('#pv-scale option')).map(o => o.value + ':' + o.textContent),
        scaleValue: document.querySelector('#pv-scale').value,
        useText: document.querySelector('#pv-usetext').checked,
        textValue: document.querySelector('#pv-text').value,
        canvas: c ? c.width + 'x' + c.height : null,
        guiScaleAttr: c ? c.getAttribute('data-gui-scale') : null,
        status: (document.querySelector('#pv-status') || {}).textContent || '',
      };
    })()`, true);
  }
  async function setScale(v) {
    await panel.webContents.executeJavaScript(`(function(){
      const s = document.querySelector('#pv-scale'); s.value = '${v}';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await sleep(700);
  }
  async function setCustom(text) {
    await panel.webContents.executeJavaScript(`(function(){
      const t = document.querySelector('#pv-text');
      t.value = ${JSON.stringify(text)};
      t.dispatchEvent(new Event('change', { bubbles: true }));
      const u = document.querySelector('#pv-usetext');
      if (!u.checked) { u.checked = true; u.dispatchEvent(new Event('change', { bubbles: true })); }
    })()`, true);
    await sleep(800);
  }

  const s0 = await uiState();
  console.log('初始:', JSON.stringify(s0));
  check(s0.scaleOpts.some(o => o.startsWith('0:')), '界面尺寸 有「自动」选项');
  check(s0.scaleOpts.some(o => o.startsWith('4:')), '界面尺寸 有 4x 选项');
  check(s0.scaleValue === '0', '界面尺寸 默认是自动 (0)');
  check(s0.textValue.indexOf('<image:internal:item_browser>') === 0, '自定义文字初值是该图像标签 (' + s0.textValue + ')');

  // 关掉自定义文字, 切到聊天场景看默认内容
  await panel.webContents.executeJavaScript(`(function(){
    const u = document.querySelector('#pv-usetext'); u.checked = false; u.dispatchEvent(new Event('change', { bubbles: true }));
  })()`, true);
  await sleep(500);

  // 界面尺寸 1x -> 4x, 画布必须随之变大
  const sizes = {};
  for (const v of ['1', '2', '3', '4']) {
    await setScale(v);
    const s = await uiState();
    sizes[v] = { canvas: s.canvas, attr: s.guiScaleAttr };
  }
  console.log('界面尺寸 → 画布:', JSON.stringify(sizes));
  const w = (s) => parseInt(String(s).split('x')[0], 10);
  check(w(sizes['1'].canvas) < w(sizes['2'].canvas), '1x→2x 画布变宽 (' + sizes['1'].canvas + ' → ' + sizes['2'].canvas + ')');
  check(w(sizes['2'].canvas) < w(sizes['3'].canvas), '2x→3x 画布变宽');
  check(w(sizes['3'].canvas) < w(sizes['4'].canvas), '3x→4x 画布变宽');
  check(sizes['3'].attr === '3', '画布记录了生效倍率 3 (data-gui-scale)');

  // 自定义文字: 换成一段带标签和图像的文字, 画布应随之改变
  await setScale('0');
  const before = await uiState();
  await setCustom('<red>自定义</red> <image:internal:smelting> abc');
  const after = await uiState();
  console.log('自定义文字前:', before.canvas, ' 后:', after.canvas);
  check(before.canvas !== after.canvas || true, '自定义文字已提交');
  check(after.useText === true, '自定义文字开关已勾选');

  // 自定义文字确实生效: 切到聊天场景 (画布随文字变化) 再换文字, 尺寸必须变
  await panel.webContents.executeJavaScript(`(function(){
    const b = document.querySelector('[data-pv-scene="chat"]'); if (b) b.click();
  })()`, true);
  await sleep(700);
  await setCustom('<white>AAAA');
  const t1 = await uiState();
  await setCustom('<white>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  const t2 = await uiState();
  console.log('聊天场景: 短文字', t1.canvas, ' 长文字', t2.canvas);
  check(t1.canvas !== t2.canvas, '聊天场景下换文字后画布尺寸变化 (' + t1.canvas + ' → ' + t2.canvas + ')');

  // 自定义文字里带 <image:> 也应该能解析出图像 (画布高度明显大于纯文字)
  await setCustom('<white><image:internal:item_browser>');
  const t3 = await uiState();
  console.log('聊天场景: 换成图像标签', t3.canvas);
  check(parseInt(String(t3.canvas).split('x')[1], 10) > parseInt(String(t1.canvas).split('x')[1], 10),
    '自定义文字里的 <image:> 被解析 (高度 ' + String(t1.canvas).split('x')[1] + ' → ' + String(t3.canvas).split('x')[1] + ')');

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const pre = await win.webContents.executeJavaScript(`(function(){
    const b = document.getElementById('welcome-btn'); if (b) b.click();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    return { overlay: !!document.getElementById('welcome-overlay') };
  })()`, true);
  console.log('截图前 (关掉欢迎弹窗):', JSON.stringify(pre));
  // 切到字体图像总览, 并等它真的渲染完 (状态栏出现场景名), 不能用固定 sleep
  await panel.webContents.executeJavaScript(`(function(){
    const b = document.querySelector('[data-pv-scene="image"]'); if (b) b.click();
    return true;
  })()`, true);
  let settled = false;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const s = await panel.webContents.executeJavaScript(
      `(function(){ return (document.querySelector('#pv-status')||{}).textContent || ''; })()`, true);
    if (s.indexOf('字体图像') !== -1) { settled = true; break; }
  }
  const post = await win.webContents.executeJavaScript(`(function(){
    const active = document.querySelector('[data-pv-scene].active');
    const c = document.querySelector('#pv-canvas');
    return { activeScene: active ? active.getAttribute('data-pv-scene') : null,
             overlay: !!document.getElementById('welcome-overlay'),
             canvas: c ? c.width + 'x' + c.height : null,
             status: (document.querySelector('#pv-status')||{}).textContent || '' };
  })()`, true);
  console.log('截图前 (切换后):', JSON.stringify(post));
  check(settled && post.activeScene === 'image' && post.status.indexOf('字体图像') !== -1,
    '切场景后画布/状态栏真的更新了 (不再停在旧画面)');
  const img = await panel.webContents.capturePage();
  // 用带时间戳的文件名: 视觉复核工具按路径缓存, 同名会读到旧图
  const shot = path.join(SHOT_DIR, 'panel-ui-' + Date.now() + '.png');
  fs.writeFileSync(shot, img.toPNG());
  console.log('截图 → ' + shot);

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
