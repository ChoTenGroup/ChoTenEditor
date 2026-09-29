/* 「按模型 JSON 渲染」验证
 * 用法: node_modules\.bin\electron.cmd _ce_model_json_test.js
 *
 * 回归的 bug: 判断「3D 模型 vs 平面图标」时看的是路径里有没有 block/,
 * 于是 models/item/*.json 里带 elements 的模型 (椅子/家具本体) 被拍平成一张贴图糊在画面上。
 * 另外: 带 rotation 的元素以前被整个跳过, 模型会缺件。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const FIX = path.join(APP_DIR, '_ce_tmp', 'model_json_fixture');
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0;
    for (let x = 0; x < w; x++) {
      raw[off++] = rgb[0]; raw[off++] = rgb[1]; raw[off++] = rgb[2]; raw[off++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TEX_RGB = [255, 140, 0];   // 橙色, 便于在画面上定位

function buildFixture() {
  const pack = path.join(FIX, 'resources', 'demo');
  const models = path.join(pack, 'resourcepack', 'assets', 'demo', 'models', 'item');
  const texDir = path.join(pack, 'resourcepack', 'assets', 'demo', 'textures', 'item');
  fs.mkdirSync(path.join(pack, 'configuration'), { recursive: true });
  fs.mkdirSync(models, { recursive: true });
  fs.mkdirSync(texDir, { recursive: true });
  fs.writeFileSync(path.join(pack, 'pack.yml'), 'name: demo\n');

  // 1) 带 elements 的物品模型 (一把椅子: 座面 + 4 条腿 + 一个旋转过的靠背)
  fs.writeFileSync(path.join(models, 'chair.json'), JSON.stringify({
    credit: 'fixture',
    textures: { 0: 'demo:item/chair_tex', particle: 'demo:item/chair_tex' },
    elements: [
      { from: [1, 8, 1], to: [15, 10, 15], faces: {
        down: { texture: '#0' }, up: { texture: '#0' },
        north: { texture: '#0' }, south: { texture: '#0' }, west: { texture: '#0' }, east: { texture: '#0' } } },
      { from: [2, 0, 2], to: [4, 8, 4], faces: {
        north: { texture: '#0' }, south: { texture: '#0' }, west: { texture: '#0' }, east: { texture: '#0' } } },
      { from: [12, 0, 2], to: [14, 8, 4], faces: {
        north: { texture: '#0' }, south: { texture: '#0' }, west: { texture: '#0' }, east: { texture: '#0' } } },
      // 靠背: 明确带 rotation, 以前会被整个跳过
      { from: [1, 10, 13], to: [15, 22, 15], rotation: { origin: [8, 10, 14], axis: 'x', angle: -12, rescale: false },
        faces: { north: { texture: '#0' }, south: { texture: '#0' }, up: { texture: '#0' }, west: { texture: '#0' }, east: { texture: '#0' } } },
    ],
  }, null, 2));

  // 2) 普通平面物品模型 (只有 layer0, 没有 elements) → 仍应拍平成图标
  fs.mkdirSync(path.join(pack, 'resourcepack', 'assets', 'demo', 'models', 'item'), { recursive: true });
  fs.writeFileSync(path.join(models, 'flat_thing.json'), JSON.stringify({
    parent: 'minecraft:item/generated',
    textures: { layer0: 'demo:item/flat_tex' },
  }, null, 2));

  fs.writeFileSync(path.join(texDir, 'chair_tex.png'), makePng(16, 16, TEX_RGB));
  fs.writeFileSync(path.join(texDir, 'flat_tex.png'), makePng(16, 16, TEX_RGB));

  // 3) 物品 + 引用这些模型的家具
  fs.writeFileSync(path.join(pack, 'configuration', 'furniture.yml'), [
    'furniture:',
    '  demo:chair:',
    '    variants:',
    '      ground:',
    '        elements:',
    '          - type: item_display',
    '            item: demo:chair_item',
    '            translation: 0,0,0',
    '        hitboxes:',
    '          - type: interaction',
    '            width: 1',
    '            height: 1',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(pack, 'configuration', 'items.yml'), [
    'items:',
    '  demo:chair_item:',
    '    material: paper',
    '    data:',
    '      item_model: demo:item/chair',
    '  demo:flat_item:',
    '    material: paper',
    '    data:',
    '      item_model: demo:item/flat_thing',
    '',
  ].join('\n'));

  return path.join(pack, 'configuration', 'items.yml');
}

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'mj'; });

(async () => {
  await app.whenReady();
  const YML = buildFixture();
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await new Promise(r => setTimeout(r, 700));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(YML)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);

    const res = {};
    // 关键: 带 elements 的物品模型必须被判成 3D (kind=block), 而不是拍平
    res.chair = await window.CEPreview.resolveItemModel('demo:chair_item');
    res.flat = await window.CEPreview.resolveItemModel('demo:flat_item');

    // 直接渲染这两个物品, 比较"是不是只有一层平面"——
    // 3D 模型会画出多个面/多个高度, 平面模型只有一个矩形
    function measure(cv) {
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      const rows = new Set(); const cols = new Set();
      let n = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (px[i + 3] > 8) { n++; rows.add(y); cols.add(x); }
      }
      return { ink: n, h: rows.size, w: cols.size };
    }
    // 不透明像素里有几种颜色: 平面贴图 = 1 种纯色; 3D 模型各面明暗不同 = 多种
    function shades(cv) {
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      const s = new Set();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] > 200) s.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
      }
      return s.size;
    }
    const c1 = document.createElement('canvas');
    c1.width = 200; c1.height = 200;
    window.CEPreview.setStageWidth(0);
    await window.CEPreview.drawItem(c1.getContext('2d'), 'demo:chair_item', 60, 60, 80);
    res.chairPx = measure(c1);
    res.chairShades = shades(c1);
    res.chairUrl = c1.toDataURL('image/png');

    // 家具场景也要画出 3D 椅子
    const c2 = document.createElement('canvas');
    const pd = window.CEPreview.getProjectData();
    const furn = window.CEPreview.furnitureInlineOf(pd.items['demo:chair_item']);
    const r2 = await window.CEPreview.renderScene(c2, { type: 'furniture', furniture: furn, variant: 0, scale: 2 });
    res.furnUrl = c2.toDataURL('image/png');
    res.furnWarnings = r2.warnings.slice();
    res.furnCanvas = c2.width + 'x' + c2.height;

    // 平面物品仍应走 flat
    const c3 = document.createElement('canvas');
    c3.width = 120; c3.height = 120;
    await window.CEPreview.drawItem(c3.getContext('2d'), 'demo:flat_item', 20, 20, 80);
    res.flatPx = measure(c3);
    res.flatShades = shades(c3);
    const pd2 = window.CEPreview.getProjectData();
    res.hbegone = !!pd2.items['demo:flat_item'];
    return res;
  })()`, true);

  console.log('chair_item →', JSON.stringify(out.chair));
  console.log('flat_item  →', JSON.stringify(out.flat));
  console.log('椅子绘制: ' + JSON.stringify(out.chairPx) + '   平面物品: ' + JSON.stringify(out.flatPx));

  check(out.chair && out.chair.kind === 'block',
    '带 elements 的物品模型按 3D 渲染 (kind=' + (out.chair && out.chair.kind) + ')');
  check(out.chair && out.chair.model === 'demo:item/chair', '  指向正确的模型 JSON (' + (out.chair && out.chair.model) + ')');
  check(out.flat && out.flat.kind === 'flat', '没有 elements 的模型仍走平面图标 (kind=' + (out.flat && out.flat.kind) + ')');
  check(out.flat && String(out.flat.texture || '').indexOf('flat_tex') !== -1, '  取到 layer0 贴图 (' + (out.flat && out.flat.texture) + ')');

  // 3D 椅子有多个高度层 (座面 y8-10 + 靠背到 y22), 而且各面明暗不同;
  // 被拍平的贴图只会是「一张纯色矩形」—— 这正是之前「糊在上面」的样子。
  check(out.chairPx.ink > 0, '椅子画出了内容 (' + out.chairPx.ink + ' px)');
  check(out.chairPx.w < 80 && out.chairPx.h < 80,
    '椅子按等轴测几何体绘制, 不是 80x80 的整张贴图 (' + out.chairPx.w + 'x' + out.chairPx.h + ')');
  console.log('明暗层数: 3D 模型 ' + out.chairShades + ' 种, 平面贴图 ' + out.flatShades + ' 种');
  check(out.chairShades >= 3, '3D 模型各面有不同明暗 (立体: ' + out.chairShades + ' 种颜色)');
  check(out.flatShades === 1, '平面贴图就是纯色一张 (' + out.flatShades + ' 种颜色)');
  check(out.furnCanvas === '544x452', '家具场景正常渲染 (' + out.furnCanvas + ')');
  check(out.furnWarnings.filter(w => w.indexOf('furniture-unknown') === 0).length === 0,
    '家具场景没有 unknown-item 告警 (' + JSON.stringify(out.furnWarnings) + ')');

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = Date.now();
  fs.writeFileSync(path.join(SHOT_DIR, 'modeljson-chair-' + ts + '.png'),
    Buffer.from(String(out.chairUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  fs.writeFileSync(path.join(SHOT_DIR, 'modeljson-furniture-' + ts + '.png'),
    Buffer.from(String(out.furnUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('截图 → _ce_shots\\modeljson-chair-' + ts + '.png , modeljson-furniture-' + ts + '.png');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
