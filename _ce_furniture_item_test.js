/* furniture_item 行为 → 家具预览 + 自定义物品材质 验证
 * 用法: node_modules\.bin\electron.cmd _ce_furniture_item_test.js
 *
 * 覆盖:
 *   - items 段里 behavior.type: furniture_item 的物品被识别为家具
 *   - furniture: <id> 引用 → 从工程 furniture: 段解析出定义
 *   - furniture: { ... } 内联 → 直接使用
 *   - 家具元素引用包内自定义物品时, 能解析出该物品声明的模型/纹理 (带材质)
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const FIX = path.join(APP_DIR, '_ce_tmp', 'furniture_item_fixture');
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }

// 与其它测试同款的极简 PNG 写入
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
      // 左上角留一块深色, 便于确认贴图真的被用上
      const dark = (x < 3 && y < 3);
      raw[off++] = dark ? 20 : rgb[0];
      raw[off++] = dark ? 20 : rgb[1];
      raw[off++] = dark ? 20 : rgb[2];
      raw[off++] = 255;
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

const TEX_RGB = [0, 200, 255];   // 自定义物品贴图的主色 (青蓝)

function buildFixture() {
  const pack = path.join(FIX, 'resources', 'demo');
  fs.mkdirSync(path.join(pack, 'configuration'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'resourcepack', 'assets', 'demo', 'textures', 'item'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'pack.yml'), 'name: demo\n');

  fs.writeFileSync(path.join(pack, 'configuration', 'furniture.yml'), [
    'furniture:',
    '  demo:chair:',
    '    settings:',
    '      item: demo:chair_item',
    '      hit_times: 3',
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
    '            seats:',
    '              - 0.5,0.3,0.5',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(pack, 'configuration', 'items.yml'), [
    'items:',
    '  demo:chair_item:',
    '    material: paper',
    '    data:',
    '      item_model: demo:item/chair_item',
    '    behavior:',
    '      type: furniture_item',
    '      furniture: demo:chair',
    '  demo:inline_stool:',
    '    material: paper',
    '    behavior:',
    '      type: furniture_item',
    '      furniture:',
    '        variants:',
    '          ground:',
    '            elements:',
    '              - type: block_display',
    '                block: minecraft:stone',
    '            hitboxes:',
    '              - type: interaction',
    '                width: 0.5',
    '                height: 0.5',
    '  demo:plain_item:',
    '    material: stick',
    '',
  ].join('\n'));

  // 自定义物品的贴图: assets/demo/textures/item/chair_item.png
  fs.writeFileSync(path.join(pack, 'resourcepack', 'assets', 'demo', 'textures', 'item', 'chair_item.png'),
    makePng(16, 16, TEX_RGB));

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'fi'; });

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
    const pd = await window.CEPreview.collectProjectData(true);

    const itemData = pd.items['demo:chair_item'];
    const inlineData = pd.items['demo:inline_stool'];
    const res = {};
    res.furnCount = Object.keys(pd.furniture || {}).length;
    res.itemCount = Object.keys(pd.items || {}).length;
    res.hasChair = !!(pd.furniture && pd.furniture['demo:chair']);
    res.hasItem = !!itemData;

    // furniture_item 行为识别
    res.ref = window.CEPreview.furnitureItemRef(itemData);
    res.refPlain = window.CEPreview.furnitureItemRef(pd.items['demo:plain_item']);
    // 引用 → 工程 furniture 段
    const resolved = window.CEPreview.furnitureInlineOf(itemData);
    res.resolvedVariants = resolved ? Object.keys(resolved.variants || {}) : null;
    res.missingRef = window.CEPreview.furnitureInlineOf({ behavior: { type: 'furniture_item', furniture: 'demo:nope' } });
    // 内联
    const inl = window.CEPreview.furnitureInlineOf(inlineData);
    res.inlineVariants = inl ? Object.keys(inl.variants || {}) : null;
    // 变体解析
    res.variants = window.CEPreview.furnitureVariants(resolved).map(v => v.name + ':' + v.elements.length);

    // 自定义物品的模型/纹理解析
    res.model = await window.CEPreview.resolveItemModel('demo:chair_item');

    // 渲染: 家具元素引用自定义物品 → 应该画出青蓝贴图
    const c = document.createElement('canvas');
    const r = await window.CEPreview.renderScene(c, { type: 'furniture', furniture: resolved, variant: 0, scale: 2 });
    const g = c.getContext('2d');
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let tex = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - ${TEX_RGB[0]}) <= 8 && Math.abs(px[i+1] - ${TEX_RGB[1]}) <= 8 && Math.abs(px[i+2] - ${TEX_RGB[2]}) <= 8) tex++;
    }
    res.texPixels = tex;
    res.cw = c.width + 'x' + c.height;
    res.warnings = r.warnings.slice();
    res.url = c.toDataURL('image/png');
    return res;
  })()`, true);

  console.log('工程数据: 家具 ' + out.furnCount + ' 个, 物品 ' + out.itemCount + ' 个');
  check(out.hasChair, '工程里收集到 furniture: demo:chair');
  check(out.hasItem, '工程里收集到 items: demo:chair_item');

  check(out.ref === 'demo:chair', 'furniture_item 行为识别出引用 id (' + out.ref + ')');
  check(out.refPlain === null, '普通物品不会被误判为家具 (' + out.refPlain + ')');
  check(out.resolvedVariants && out.resolvedVariants.join(',') === 'ground',
    '引用 → 从 furniture: 段解析出变体 (' + JSON.stringify(out.resolvedVariants) + ')');
  check(out.inlineVariants && out.inlineVariants.join(',') === 'ground',
    '内联 furniture 直接可用 (' + JSON.stringify(out.inlineVariants) + ')');
  check(out.missingRef && out.missingRef.__missingFurniture === 'demo:nope',
    '引用不存在的家具时给出可识别的缺失标记');
  check(out.variants.join(',') === 'ground:1', '解析出 1 个变体 1 个元素 (' + out.variants.join(',') + ')');

  console.log('自定义物品模型:', JSON.stringify(out.model));
  check(out.model && out.model.kind === 'flat' && String(out.model.texture || '').indexOf('chair_item') !== -1,
    '自定义物品解析到它声明的贴图 (' + JSON.stringify(out.model) + ')');

  console.log('渲染: ' + out.cw + ', 贴图色像素 ' + out.texPixels + ', 告警 ' + JSON.stringify(out.warnings));
  check(out.texPixels > 500, '家具预览里画出了自定义贴图 (青蓝像素 ' + out.texPixels + ')');
  check(out.warnings.filter(w => w.indexOf('furniture-unknown') === 0).length === 0,
    '没有 unknown-item 告警 (' + JSON.stringify(out.warnings) + ')');

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = Date.now();
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-item-' + ts + '.png'),
    Buffer.from(String(out.url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('截图 → _ce_shots\\furniture-item-' + ts + '.png');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
