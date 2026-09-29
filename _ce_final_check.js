/* 最终验收: 在真实 Electron 编辑器里打开真实 CE 工程, 走预览面板的真实链路
 * (CEPreviewPanel.open → 扫描工程 → 解析 images → 渲染场景), 断言:
 *   - 字体不回退点阵
 *   - 字体图像全部加载成功、无 missing-image
 *   - 渲染出的场景里没有小红/粉占位块
 * 用法: node_modules\.bin\electron.cmd _ce_final_check.js
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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'check'; });

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await new Promise(r => setTimeout(r, 800));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(CE_YML)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);
    await window.CEPreview.preloadImages();
    const pd = window.CEPreview.getProjectData();
    const ids = Object.keys(pd.images);
    const loaded = ids.filter(k => pd.images[k]._img);
    const warns = window.CEPreview.lastWarnings();
    // 渲染字体图像所在条目的「箱子 GUI」场景, 数红色占位像素
    const cv = document.createElement('canvas');
    window.CEPreviewPanel.open({ file: Y, section: 'images', sectionBase: 'images',
      entryKey: 'internal:item_browser', data: pd.images['internal:item_browser'], scene: 'gui' });
    for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 50));
      const c = document.getElementById('pv-canvas'); if (c && c.width > 1) break; }
    const pc = document.getElementById('pv-canvas');
    // 占位块是纯 #FF0000 的虚线框 + 白色 "?"; 物品贴图里的暖色是抗锯齿的, 不能用宽松阈值
    let placeholderPx = 0, magenta = 0;
    if (pc) {
      const g = pc.getContext('2d');
      const px = g.getImageData(0, 0, pc.width, pc.height).data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i+1], b = px[i+2], a = px[i+3];
        if (a < 200) continue;
        if (r === 255 && gg === 0 && b === 0) placeholderPx++;
        if (r === 255 && gg === 0 && b === 255) magenta++;
      }
    }
    return { images: ids.length, loaded: loaded.length,
             missing: warns.filter(w => w.indexOf('missing-image') === 0).length,
             noFont: warns.filter(w => w.indexOf('no-font') === 0 || w.indexOf('assets-not-ready') === 0).length,
             warns: warns.slice(0, 5),
             panelSize: pc ? pc.width + 'x' + pc.height : null,
             panelWarnings: window.CEPreview.lastWarnings().slice(0, 5),
             placeholderPx, magenta,
             metrics: { A: window.CEPreview.measureText('A').width, i: window.CEPreview.measureText('i').width, space: window.CEPreview.measureText(' ').width } };
  })()`, true);

  console.log('结果:', JSON.stringify(out, null, 1));
  check(out.images > 0, '工程里解析出 images 条目 (' + out.images + ' 个)');
  check(out.loaded === out.images, '全部字体图像都加载成功 (' + out.loaded + '/' + out.images + ')');
  check(out.missing === 0, '没有 missing-image 警告');
  // 启动时应用自己会先扫一次资源 (那时还没有工程文件), 因此 assets-not-ready 是启动期的陈旧告警;
  // 真正有意义的是「面板这次渲染」的告警列表
  check(out.panelWarnings.length === 0, '预览面板本次渲染无任何告警 (' + JSON.stringify(out.panelWarnings) + ')');
  check(out.metrics.A === 6 && out.metrics.i === 2 && out.metrics.space === 4,
    '字体度量是原版 MC 字体的 (' + JSON.stringify(out.metrics) + ')');
  check(out.placeholderPx === 0, '预览里没有红色占位框 (found ' + out.placeholderPx + ')');
  check(out.magenta === 0, '预览里没有品红缺贴图色 (found ' + out.magenta + ')');

  if (out.panelSize) {
    fs.mkdirSync(path.join(APP_DIR, '_ce_shots'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(APP_DIR, '_ce_shots', 'final-glyph-entry.png'), img.toPNG());
    console.log('截图 → _ce_shots\\final-glyph-entry.png  (面板 ' + out.panelSize + ')');
  }
  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
