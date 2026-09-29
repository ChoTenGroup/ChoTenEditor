/* 针对具体文件的核对: 直接读用户的 bench.yml, 打印几何与 ASCII 视图
 * 用法: node_modules\.bin\electron.cmd _ce_furn_check.js "<yml 路径>"
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');
const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const FILE = process.argv[2] || 'E:/Downloads/resources/default/configuration/furniture/bench.yml';

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'chk'; });

(async () => {
  await app.whenReady();
  const yaml = require('js-yaml');
  const doc = yaml.load(fs.readFileSync(FILE, 'utf-8'));
  const furn = {};
  if (doc.furniture) Object.assign(furn, doc.furniture);
  if (doc.items) {
    for (const id of Object.keys(doc.items)) {
      const beh = (doc.items[id] || {}).behavior;
      if (beh && beh.furniture && typeof beh.furniture === 'object') furn['#item:' + id] = beh.furniture;
    }
  }
  const samples = {};
  for (const id of Object.keys(furn)) {
    const def = furn[id];
    const vs = def.placement ? Object.keys(def.placement) : Object.keys(def.variants || {});
    for (const v of vs) {
      samples[id + '/' + v] = { variants: { [v]: (def.placement ? def.placement[v] : def.variants[v]) } };
    }
  }
  console.log('文件:', FILE);
  console.log('家具:', Object.keys(samples).filter(k => k.indexOf('/') > 0 ? k.split('/')[0] === k.split('/')[0] : true).join(', '));

  const win = new BrowserWindow({ width: 900, height: 700, show: false, webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true } });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await new Promise(r => setTimeout(r, 700));
  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    const S = ${JSON.stringify(samples)};
    const T = window.CEPreview._internals;
    const res = {};
    for (const key of Object.keys(S)) {
      const F = S[key];
      const v = window.CEPreview.furnitureVariants(F)[0];
      const geo = {
        elements: (v.elements || []).map(e => {
          const xf = T.furnitureElementXf(e, 0);
          const lo = xf.pt([0, 0, 0]).map(x => Math.round(x * 100) / 100);
          const hi = xf.pt([16, 16, 16]).map(x => Math.round(x * 100) / 100);
          return { type: e.type || 'item_display', pos: e.position, tr: e.translation, anchor: xf.anchor.map(x => Math.round(x * 100) / 100), box: [lo, hi] };
        }),
        hitboxes: [].concat(...(v.hitboxes || []).map(h => {
          const f = x => Math.round(x * 100) / 100;
          return window.CEPreview.furnitureHitboxBoxes(h).map((b, i) => ({
            cfg: h, part: b.lid ? '壳(lid)' : '本体', min16: b.min.map(f), max16: b.max.map(f),
            blocks: [f((b.max[0]-b.min[0])/16), f((b.max[1]-b.min[1])/16), f((b.max[2]-b.min[2])/16)],
            y_blocks: [f(b.min[1]/16), f(b.max[1]/16)]
          }));
        })),
        seats: [].concat(...(v.hitboxes || []).map(h => {
          const raw = h.seats == null ? [] : (Array.isArray(h.seats) ? h.seats : [h.seats]);
          return raw.map(s => {
            const st = T.furnitureSeat(s);
            if (!st) return null;
            const w = T.furnWorld(st.pos[0], st.pos[1], st.pos[2]);
            return { raw: s, world_blocks: w.map(x => Math.round(x / 16 * 100) / 100) };
          }).filter(Boolean);
        })),
      };
      const cv = document.createElement('canvas');
      const r = await window.CEPreview.renderScene(cv, { type: 'furniture', furniture: F, variant: 0, scale: 1, showGrid: true });
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      res[key] = { geo: geo, canvas: cv.width + 'x' + cv.height, warn: r.warnings, px: Array.from(px), w: cv.width, h: cv.height };
    }
    return res;
  })()`, true);

  const ramp = ' .:-=+*#%@';
  for (const key of Object.keys(out)) {
    const r = out[key];
    console.log('');
    console.log('=== ' + key + '  (' + r.canvas + ') ===');
    console.log('元素:');
    r.geo.elements.forEach(e => console.log('  ' + e.type + ' position=' + e.pos + ' translation=' + e.tr +
      ' → 锚点(1/16) ' + JSON.stringify(e.anchor) + ' 模型范围 ' + JSON.stringify(e.box)));
    console.log('碰撞箱:');
    r.geo.hitboxes.forEach(b => console.log('  position=' + JSON.stringify(b.cfg.position) + ' type=' + (b.cfg.type || 'interaction') +
      ' [' + b.part + '] → 尺寸(格) ' + JSON.stringify(b.blocks) + '  y(格) ' + JSON.stringify(b.y_blocks) +
      '  min16 ' + JSON.stringify(b.min16) + ' max16 ' + JSON.stringify(b.max16)));
    console.log('座位:');
    r.geo.seats.forEach(s => console.log('  ' + JSON.stringify(s.raw) + ' → 世界坐标(格) ' + JSON.stringify(s.world_blocks)));
    if (r.warn.length) console.log('告警: ' + JSON.stringify(r.warn));
    // ASCII
    const cols = 92, rows = 30;
    for (let ry = 0; ry < rows; ry++) {
      let line = '';
      for (let rx = 0; rx < cols; rx++) {
        const x = Math.floor(rx * r.w / cols), y = Math.floor(ry * r.h / rows);
        const i = (y * r.w + x) * 4;
        const a = r.px[i + 3] / 255;
        const lum = (r.px[i] * 0.3 + r.px[i + 1] * 0.6 + r.px[i + 2] * 0.1) / 255 * a;
        line += ramp[Math.min(9, Math.round(lum * 9))];
      }
      console.log(line);
    }
  }
  app.exit(0);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
