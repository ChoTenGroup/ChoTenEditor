/* 用真实条目走一遍「内容类型 → 场景」映射, 渲染出 PNG 供人工/视觉模型核对
 * 用法: node_modules\.bin\electron.cmd _ce_tmp\render_scene_matrix.js
 * 输出: _ce_shots\scene-*.png
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require(path.join(__dirname, '..', 'mc-assets.js'));
const ceProject = require(path.join(__dirname, '..', 'ce-project.js'));

const APP_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(APP_DIR, '_ce_shots');
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'shots'; });

// 模拟「用户点了某个条目上的 👁」: 直接构造 CEPreviewPanel.open 的 ctx
const CASES = [
  { file: 'item', sectionBase: 'items', section: 'items', entryKey: 'demo:topaz_sword',
    data: { material: 'diamond_sword', data: { item_name: '<!i><gradient:#FFD700:#FF8C00>Topaz Sword</gradient>',
      lore: ['<gray>Damage: <red>42', '<gray>A demo item'] } }, scene: 'item' },
  { file: 'block', sectionBase: 'blocks', section: 'blocks', entryKey: 'demo:stone_bricks',
    data: { state: { model: { path: 'minecraft:block/stone_bricks' } } }, scene: 'item' },
  { file: 'block2', sectionBase: 'blocks', section: 'blocks', entryKey: 'demo:oak_stairs',
    data: { state: { model: { path: 'minecraft:block/oak_stairs' } } }, scene: 'item' },
  { file: 'block3', sectionBase: 'blocks', section: 'blocks', entryKey: 'demo:chest',
    data: { state: { appearances: { default: { model: { path: 'minecraft:block/chest' } } } } }, scene: 'item' },
  { file: 'item-lore', sectionBase: 'items', section: 'items', entryKey: 'demo:topaz_sword',
    data: { material: 'diamond_sword', data: { item_name: '<!i><gold>Topaz Sword', lore: ['<gray>Damage: <red>42'] } }, scene: 'lore' },
  { file: 'item-gui', sectionBase: 'items', section: 'items', entryKey: 'demo:topaz_sword',
    data: { material: 'diamond_sword', data: { item_name: '<!i><gold>Topaz Sword' } }, scene: 'gui' },
  { file: 'glyph-gui', sectionBase: 'images', section: 'images', entryKey: 'demo:star',
    data: { file: 'minecraft:item/nether_star', height: 10, ascent: 9 }, scene: 'gui' },
  { file: 'glyph-chat', sectionBase: 'images', section: 'images', entryKey: 'demo:star',
    data: { file: 'minecraft:item/nether_star', height: 10, ascent: 9 }, scene: 'chat' },
  { file: 'glyph-lore', sectionBase: 'images', section: 'images', entryKey: 'demo:star',
    data: { file: 'minecraft:item/nether_star', height: 10, ascent: 9 }, scene: 'lore' },
  { file: 'glyph-gallery', sectionBase: 'images', section: 'images', entryKey: 'demo:star',
    data: { file: 'minecraft:item/nether_star', height: 10, ascent: 9 }, scene: 'image' },
];

async function main() {
  await app.whenReady();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const win = new BrowserWindow({
    width: 1100, height: 820, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));

  const boot = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)};
    let st = window.CEMCAssets.status();
    for (let i = 0; i < 120 && st.state !== 'ready'; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (st.state === 'idle' || st.state === 'error') window.CEMCAssets.init({ mcRoot: R });
      st = window.CEMCAssets.status();
    }
    if (st.state !== 'ready') return { ok: false, err: st.state };
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    window.CEPreview.setImages({
      'demo:star': { file: 'minecraft:item/nether_star', height: 10, ascent: 9 },
      'demo:coin': { file: 'minecraft:item/gold_ingot', height: 10, ascent: 9 },
    });
    window.CEPreview.setGlobals({ rare_tag: '<!i><bold><#FF8C00>[RARE]</#FF8C00></bold>' });
    await window.CEPreview.preloadImages();
    // 打开预览窗口 (不显示), 用它自己的场景映射逻辑
    return { ok: true };
  })()`, true);
  console.log('boot:', JSON.stringify(boot));
  if (!boot || !boot.ok) { app.exit(2); return; }

  const shots = await win.webContents.executeJavaScript(`(async () => {
    const cases = ${JSON.stringify(CASES)};
    const out = [];
    for (const c of cases) {
      const ctx = { file: 'E:/proj/resources/demo/configuration/items/x.yml', section: c.section,
                    sectionBase: c.sectionBase, entryKey: c.entryKey, data: c.data, scene: c.scene };
      window.CEPreviewPanel.open(ctx);
      // 等渲染完成 (render 是 async, 轮询画布尺寸变化)
      let prev = '';
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 50));
        const cv = document.getElementById('pv-canvas');
        if (cv && cv.width > 1 && (cv.width + 'x' + cv.height) === prev) break;
        if (cv) prev = cv.width + 'x' + cv.height;
      }
      const cv = document.getElementById('pv-canvas');
      const status = (document.getElementById('pv-status') || {}).textContent || '';
      const tabs = Array.from(document.querySelectorAll('[data-pv-scene]')).map(b => b.textContent);
      const active = (document.querySelector('[data-pv-scene].active') || {}).textContent || '';
      out.push({ name: c.file, dataUrl: cv ? cv.toDataURL('image/png') : null,
                 w: cv ? cv.width : 0, h: cv ? cv.height : 0, status: status, tabs: tabs, active: active,
                 key: c.entryKey, sectionBase: c.sectionBase });
    }
    return out;
  })()`, true);

  let n = 0;
  for (const s of shots) {
    console.log('--- ' + s.name + '  ' + s.key + ' (' + s.sectionBase + ')');
    console.log('    tabs=[' + (s.tabs || []).join(' | ') + ']  active=' + s.active + '  ' + s.w + 'x' + s.h);
    console.log('    ' + (s.status || '').slice(0, 150));
    if (!s.dataUrl) continue;
    fs.writeFileSync(path.join(OUT_DIR, 'scene-' + s.name + '.png'),
      Buffer.from(String(s.dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
    n++;
  }
  console.log('done, ' + n + ' png → ' + OUT_DIR);
  app.exit(0);
}
main().catch(e => { console.error('FATAL', e); app.exit(1); });
