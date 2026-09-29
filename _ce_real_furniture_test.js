/* 用真实的 CE 官方默认包配置验证家具预览 (坐标基准 + 碰撞箱对齐)
 * 用法: node_modules\.bin\electron.cmd _ce_real_furniture_test.js
 *
 * 直接读 E:\MC\...\plugins\CraftEngine\resources\default\configuration\furniture\*.yml,
 * 把每个家具的每个变体都渲染一遍, 并检查:
 *   - 能解析出元素/碰撞箱/座位
 *   - 渲染无告警、确实画了内容
 *   - 元素模型的包围盒与碰撞箱是否在同一格内对齐 (错位回归)
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');
// 本机上的 CraftEngine 默认资源包 (找不到就跳过这个测试, 其它机器上不一定有)
const PACK_CANDIDATES = [
  'E:/Downloads/resources/default',
  'E:/MC/tra/2601/plugins/CraftEngine/resources/default',
  'E:/MC/tra/Ets/plugins/CraftEngine/resources/default',
  'E:/MC/tra/Ets/plugins/craft-engine-plugin-0.0.53-beta.1/resources/default',
];
function findPackRoots() {
  const out = [];
  for (const p of PACK_CANDIDATES) {
    if (fs.existsSync(path.join(p, 'configuration'))) out.push(p);
  }
  return out;
}

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'real'; });

// 取官方默认包里的几个家具 (单文件 + 主 furniture.yml 里的)
function collectRealFurniture(pack) {
  const out = [];
  const dir = path.join(pack, 'configuration', 'furniture');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.yml')) out.push(path.join(dir, f));
    }
  }
  const main = path.join(pack, 'configuration', 'furniture.yml');
  if (fs.existsSync(main)) out.push(main);
  return out;
}

(async () => {
  await app.whenReady();
  const packs = findPackRoots();
  if (!packs.length) {
    console.log('SKIP  本机没有找到 CraftEngine 默认资源包, 跳过真实配置对照');
    app.exit(0);
    return;
  }
  const files = [];
  for (const p of packs) {
    for (const f of collectRealFurniture(p)) files.push({ pack: p, file: f });
  }
  console.log('CraftEngine 包:', packs.length, '个 →', packs.join(' | '));
  console.log('家具文件:', files.length, '个');
  const win = new BrowserWindow({
    width: 1000, height: 800, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await sleep(700);

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    return true;
  })()`, true);

  const yaml = require('js-yaml');
  const results = [];
  for (const entry of files) {
    const file = entry.file;
    let doc;
    try { doc = yaml.load(fs.readFileSync(file, 'utf-8')); } catch (e) { console.log('YAML 读取失败', file, e.message); continue; }
    if (!doc) continue;
    // furniture: 段 (有的文件把家具放在 items 里的 behavior.furniture 内联)
    const furn = {};
    if (doc.furniture) Object.assign(furn, doc.furniture);
    if (doc.items) {
      for (const id of Object.keys(doc.items)) {
        const beh = (doc.items[id] || {}).behavior;
        if (beh && beh.furniture && typeof beh.furniture === 'object' && beh.furniture.placement) {
          furn['#inline:' + id] = beh.furniture;
        }
      }
    }
    for (const id of Object.keys(furn)) {
      const def = furn[id];
      const vs = (def.placement ? Object.keys(def.placement) : Object.keys(def.variants || {}));
      for (const vname of vs) {
        const single = { variants: {} };
        if (def.placement) single.variants[vname] = def.placement[vname];
        else single.variants[vname] = def.variants[vname];
        const payload = await win.webContents.executeJavaScript(`(async () => {
          const F = ${JSON.stringify(single)};
          const mk = async (scene) => {
            const cv = document.createElement('canvas');
            const r = await window.CEPreview.renderScene(cv, Object.assign({ type: 'furniture', furniture: F, variant: 0, scale: 1 }, scene));
            return { cv: cv, warn: r.warnings.slice() };
          };
          // 1) 关掉碰撞箱: 只剩家具模型, 求它像素的重心 (跳过页眉文字和灰色基准框)
          const only = await mk({ showGrid: false, showHitboxes: false, showSeats: false });
          const cv = only.cv;
          const g = cv.getContext('2d');
          const px = g.getImageData(0, 0, cv.width, cv.height).data;
          let sx = 0, sy = 0, n = 0, ink = 0;
          for (let y = 34; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
              const i = (y * cv.width + x) * 4;
              if (px[i+3] <= 8) continue;
              ink++;
              const r0 = px[i], g0 = px[i+1], b0 = px[i+2];
              if (r0 + g0 + b0 <= 30) continue;                                  // 背景
              if (Math.abs(r0 - g0) <= 6 && Math.abs(g0 - b0) <= 6) continue;     // 灰色基准框
              sx += x; sy += y; n++;
            }
          }
          const model = n ? { x: sx / n, y: sy / n, n: n } : null;
          // 2) 打开碰撞箱: 取每个箱子的投影中心 (拾取多边形重心)
          const full = await mk({ showGrid: false });
          const pv = window.CEPreview.furnitureVariants(F)[0] || { elements: [], hitboxes: [] };
          const pick = window.CEPreview.furniturePickData();
          const boxes = (pick && pick.boxes || []).map(b => {
            let cx = 0, cy = 0;
            b.poly.forEach(p => { cx += p.x / b.poly.length; cy += p.y / b.poly.length; });
            return { type: b.type, w: b.w, h: b.h, d: b.d, cx: cx, cy: cy };
          });
          let hb = null;
          if (boxes.length) {
            hb = { x: boxes.reduce((a, b) => a + b.cx, 0) / boxes.length,
                   y: boxes.reduce((a, b) => a + b.cy, 0) / boxes.length };
          }
          return {
            canvas: cv.width + 'x' + cv.height, ink: ink, warn: full.warn.concat(only.warn),
            elements: pv.elements.length, hitboxes: pv.hitboxes.length, boxes: boxes,
            model: model, hb: hb,
            url: full.cv.toDataURL('image/png'),
          };
        })()`, true);
        results.push({ file: path.relative(entry.pack, file), id: id, variant: vname, ...payload });
      }
    }
  }

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = Date.now();
  const UNIT = 54 / 32;   // 1× 时 1/16 方块 = 1.6875 逻辑像素
  const misaligned = [];
  for (const r of results) {
    let off = null;
    if (r.model && r.hb) {
      const dx = Math.abs(r.model.x - r.hb.x) / UNIT / 16;   // 方块
      const dy = Math.abs(r.model.y - r.hb.y) / UNIT / 16;
      off = { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 };
      if (Math.hypot(dx, dy) > 0.75) misaligned.push({ id: r.id, variant: r.variant, off: off });
    }
    console.log(`[${r.file}] ${r.id} / ${r.variant}: ${r.canvas} 元素 ${r.elements} 碰撞箱 ${r.hitboxes} ` +
      JSON.stringify(r.boxes.map(b => b.type + ' ' + b.w + 'x' + b.h + 'x' + b.d)) +
      (off ? ' 重心偏差 ' + JSON.stringify(off) + ' 格' : '') +
      (r.warn.length ? ' 告警 ' + JSON.stringify(r.warn) : ''));
    if (r.url && r.warn.length === 0) {
      const name = ('real-' + r.file.replace(/\.yml$/, '') + '-' + String(r.id).replace(/[^\w]+/g, '_') + '-' + r.variant).slice(0, 80);
      try { fs.writeFileSync(path.join(SHOT_DIR, name + '-' + ts + '.png'), Buffer.from(String(r.url).replace(/^data:image\/png;base64,/, ''), 'base64')); } catch (e) { /* ignore */ }
    }
  }

  const total = results.length;
  const bad = results.filter(r => r.warn.length);
  const empty = results.filter(r => r.ink < 500);
  const noBox = results.filter(r => r.hitboxes > 0 && r.boxes.length === 0);
  check(total > 5, '读到了足够多的官方家具变体 (' + total + ' 个)');
  check(bad.length === 0, '所有变体渲染无告警 (' + bad.length + ' 个有告警: ' + JSON.stringify(bad.slice(0, 3).map(b => b.id + '/' + b.variant + ':' + b.warn.join(','))) + ')');
  check(empty.length === 0, '所有变体都画出了内容 (' + empty.length + ' 个空白: ' + JSON.stringify(empty.slice(0, 3).map(e => e.id + '/' + e.variant)) + ')');
  check(noBox.length === 0, '有碰撞箱的变体都产出了拾取多边形 (' + noBox.length + ' 个缺失)');
  check(misaligned.length === 0, '家具模型与碰撞箱没有错位 (超过 0.75 格的: ' + JSON.stringify(misaligned) + ')');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔ (截图见 _ce_shots\\real-*)' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
