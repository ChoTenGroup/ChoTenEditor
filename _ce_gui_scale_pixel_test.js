/* 「界面尺寸 = 像素渲染」验证
 * 用法: node_modules\.bin\electron.cmd _ce_gui_scale_pixel_test.js
 *
 * 核心断言: 字体图像必须「从原始 PNG 一次性采样到最终尺寸」。
 * 例: height=9, 界面尺寸 2x → 目标 18 像素高; 若源格子是 18px, 结果应与原图逐像素一致。
 * 旧实现会先缩到 9px (丢掉一半像素) 再放大, 于是变成 2x2 方块 —— 这就是「还是像素的」。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const FIX = path.join(APP_DIR, '_ce_tmp', 'guiscale_pixels');

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }

// ---- 极简 PNG 写入 (与 _ce_font_test.js 同款) ----
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
// 画一张 w x h 的图, 每个像素由 pick(x,y) 给出 [r,g,b,a]
function makePng(w, h, pick) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0;
    for (let x = 0; x < w; x++) {
      const p = pick(x, y);
      raw[off++] = p[0]; raw[off++] = p[1]; raw[off++] = p[2]; raw[off++] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 源图 18x18: 每一列一个不同的纯色 → 任何横向缩放都会改变列结构, 便于检测细节丢失
const SRC = 18;
const COLORS = [];
for (let x = 0; x < SRC; x++) COLORS.push([(x * 13 + 20) & 255, (x * 29 + 40) & 255, (x * 47 + 60) & 255, 255]);
const pickSrc = (x, y) => COLORS[x];

function buildFixture() {
  const res = path.join(FIX, 'resources');
  const pack = path.join(res, 'gpix');
  fs.mkdirSync(path.join(pack, 'configuration'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'resourcepack', 'assets', 'gpix', 'textures', 'font'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'pack.yml'), 'name: gpix\n');
  fs.writeFileSync(path.join(pack, 'resourcepack', 'assets', 'gpix', 'textures', 'font', 'strip.png'), makePng(SRC, SRC, pickSrc));
  // height: 9 -> 1x 画 9px, 2x 画 18px (源正好 18px, 2x 应当逐像素还原)
  fs.writeFileSync(path.join(pack, 'configuration', 'images.yml'),
    'images:\n  gpix:strip:\n    height: 9\n    ascent: 8\n    file: gpix:font/strip.png\n');
  return path.join(pack, 'configuration', 'images.yml');
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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'gp'; });

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
    await window.CEPreview.preloadImages();
    const pd = window.CEPreview.getProjectData();
    if (!pd.images['gpix:strip'] || !pd.images['gpix:strip']._img) return { err: 'fixture image not loaded' };

    // 把图像单独画在透明画布上, 量它的设备像素与列结构
    function drawAt(scale) {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 200;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      // 复刻 renderScene 的做法: 画布按最终分辨率分配 + 变换
      const s = scale;
      const cv2 = document.createElement('canvas');
      cv2.width = 400 * s; cv2.height = 200 * s;
      const gg = cv2.getContext('2d');
      gg.imageSmoothingEnabled = false;
      gg.setTransform(s, 0, 0, s, 0, 0);
      const p = window.CEPreview.parseText('<image:gpix:strip>', {});
      window.CEPreview._internals.drawItems(gg, p.items, 20, 120, { shadow: false });
      const px = gg.getImageData(0, 0, cv2.width, cv2.height).data;
      // 量包围盒
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < cv2.height; y++) for (let x = 0; x < cv2.width; x++) {
        if (px[(y * cv2.width + x) * 4 + 3] <= 8) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      // 取该图中间一行, 读出每一列的颜色 (十六进制)
      const midY = Math.round((y0 + y1) / 2);
      const cols = [];
      for (let x = x0; x <= x1; x++) {
        const i = (midY * cv2.width + x) * 4;
        cols.push(((px[i] << 16) | (px[i+1] << 8) | px[i+2]).toString(16).padStart(6, '0'));
      }
      // 相邻列不同的"色块"数: 源图每列一色, 所以 1x 应有 9 个块, 2x 应有 18 个块
      let blocks = cols.length ? 1 : 0;
      for (let i = 1; i < cols.length; i++) if (cols[i] !== cols[i-1]) blocks++;
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, blocks: blocks, cols: cols.join(','),
               dataUrl: cv2.toDataURL('image/png') };
    }
    return { s1: drawAt(1), s2: drawAt(2) };
  })()`, true);

  if (out.err) { console.log('FIXTURE ERROR:', out.err); app.exit(1); return; }
  console.log('height=9, 源图 18x18 (每列一色)');
  console.log('  界面尺寸 1x → 图 ' + out.s1.w + 'x' + out.s1.h + ', 色块数 ' + out.s1.blocks);
  console.log('  界面尺寸 2x → 图 ' + out.s2.w + 'x' + out.s2.h + ', 色块数 ' + out.s2.blocks);

  check(out.s1.h === 9, '1x: 高度 = height = 9 像素');
  check(out.s1.w === 9, '1x: 宽度按比例 = 9 像素');
  check(out.s2.h === 18, '2x: 高度 = 18 像素 (= height × 2)');
  check(out.s2.w === 18, '2x: 宽度 = 18 像素');
  check(out.s2.blocks === 18, '2x: 18 个独立像素列全部保留 (源图细节没被先缩小丢掉)');
  check(out.s1.blocks === 9, '1x: 9 个像素列');

  // 存一张 2x 的图供人工/视觉复核 (用 toDataURL, 是可信的当前渲染结果)
  try {
    const dir = path.join(APP_DIR, '_ce_shots');
    fs.mkdirSync(dir, { recursive: true });
    const b64 = String(out.s2.dataUrl).replace(/^data:image\/png;base64,/, '');
    const shot = path.join(dir, 'srcsize-2x-' + Date.now() + '.png');
    fs.writeFileSync(shot, Buffer.from(b64, 'base64'));
    console.log('截图 → ' + shot);
  } catch (e) { /* ignore */ }

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
