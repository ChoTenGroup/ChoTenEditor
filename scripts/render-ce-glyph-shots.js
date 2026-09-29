/* 字体图像(<image:...>)在真实 Chromium 里的渲染截图 + 像素度量
 * 用真实 CE 工程 (E:\craft-engine ...\resources\internal\configuration\gui.yml) 驱动,
 * 校验: 图片实际画出来的像素尺寸 == 配置的 height, 文字仍是原版字体 (不是点阵回退)。
 * 用法: node_modules\.bin\electron.cmd scripts\render-ce-glyph-shots.js
 * 输出: _ce_shots\glyph-*.png
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require(path.join(__dirname, '..', 'mc-assets.js'));
const ceProject = require(path.join(__dirname, '..', 'ce-project.js'));

const APP_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(APP_DIR, '_ce_shots');
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const CE_YML = 'E:/craft-engine/common-files/src/main/resources/resources/internal/configuration/gui.yml';

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

async function main() {
  await app.whenReady();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));

  const boot = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(CE_YML)};
    // 先让应用自己完成一次资源索引 (renderer.js 启动时就会 init)
    let st = window.CEMCAssets.status();
    for (let i = 0; i < 300 && st.state !== 'ready'; i++) {
      await new Promise(r => setTimeout(r, 100));
      st = window.CEMCAssets.status();
    }
    // 应用自己的扫描没有工程上下文 → 这里显式带 filePath 再扫一次 (force)
    st = await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    if (st.state !== 'ready') return { ok: false, err: 'assets ' + st.state + ' ' + (st.error || '') };
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);
    await window.CEPreview.preloadImages();
    const pd = window.CEPreview.getProjectData();
    return { ok: true, projectRoot: st.projectRoot,
             images: Object.keys(pd.images).length,
             loaded: Object.keys(pd.images).filter(k => pd.images[k]._img).length,
             warns: window.CEPreview.lastWarnings().filter(w => w.indexOf('missing-image') === 0).slice(0, 3),
             metrics: { A: window.CEPreview.measureText('A').width, i: window.CEPreview.measureText('i').width } };
  })()`, true);
  console.log('boot:', JSON.stringify(boot));
  if (!boot || !boot.ok) { app.exit(2); return; }

  const out = await win.webContents.executeJavaScript(`(async () => {
    const shots = [];
    // 0) 像素级校验: 单独渲染一张字体图像, 量它的实际绘制包围盒
    async function bboxOf(scene) {
      const c = document.createElement('canvas');
      const rr = await window.CEPreview.renderScene(c, scene);
      const gg = c.getContext('2d');
      const px = gg.getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (px[(y * c.width + x) * 4 + 3] <= 8) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return { w: c.width, h: c.height, bw: x1 >= x0 ? x1 - x0 + 1 : 0, bh: y1 >= y0 ? y1 - y0 + 1 : 0,
               warnings: rr.warnings || [] };
    }
    // 直接在透明画布上画 (不经过场景背景), 才能量出字形自身的像素尺寸
    function measureTag(tag, shadow) {
      const c = document.createElement('canvas');
      c.width = 600; c.height = 400;
      const gg = c.getContext('2d');
      gg.imageSmoothingEnabled = false;
      const p = window.CEPreview.parseText(tag, {});
      const D = window.CEPreview._internals.drawItems;
      D(gg, p.items, 20, 120, { shadow: !!shadow });
      const px = gg.getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (px[(y * c.width + x) * 4 + 3] <= 8) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return { w: x1 >= x0 ? x1 - x0 + 1 : 0, h: y1 >= y0 ? y1 - y0 + 1 : 0,
               top: y1 >= y0 ? y0 - 120 : null, advance: p.width };
    }
    const only = measureTag('<image:internal:item_browser>', false);
    const onlySmelt = measureTag('<image:internal:smelting>', false);
    const emoji = measureTag('<image:default:emojis:0:1>', false);
    const textA = measureTag('A', false);
    shots.push({ name: 'glyph-bbox', bbox: { item_browser: only, smelting: onlySmelt, emojis: emoji, textA: textA } });
    // 1) 单张字体图像: 与文字同排
    const cv = document.createElement('canvas');
    const r = await window.CEPreview.renderScene(cv, {
      type: 'chat', scale: 1, chatWidth: 420,
      lines: ['<white>text <image:internal:item_browser> <image:internal:smelting> more text']
    });
    const g = cv.getContext('2d');
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    // 逐列扫描非透明像素, 得到两个图的包围盒
    const cols = [];
    for (let x = 0; x < cv.width; x++) {
      let n = 0;
      for (let y = 0; y < cv.height; y++) if (px[(y * cv.width + x) * 4 + 3] > 8) n++;
      cols.push(n);
    }
    shots.push({ name: 'glyph-chat-inline', dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height,
                 warnings: r.warnings || [], cols: cols.join(',') });
    // 2) 字体图像总览 (只展示选中的这一个条目, 按真实尺寸)
    const cv2 = document.createElement('canvas');
    const r2 = await window.CEPreview.sceneImageGallery(cv2, { type: 'image', scale: 1, imageId: 'internal:item_browser' });
    shots.push({ name: 'glyph-gallery-selected', dataUrl: cv2.toDataURL('image/png'), w: cv2.width, h: cv2.height, warnings: r2.warnings || [] });
    // 逐行统计不透明像素, 用来确认「图片完整落在画布内 + 说明文字不重叠」
    (function () {
      const gg = cv2.getContext('2d');
      const px = gg.getImageData(0, 0, cv2.width, cv2.height).data;
      // 背景是 rgba(0,0,0,0.85) → 与纯黑背景的差别在 alpha; 这里用「非背景色」判定内容
      const isContent = (i) => !(px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0 && px[i + 3] === 217);
      const rows = [];
      for (let y = 0; y < cv2.height; y++) {
        let n = 0;
        for (let x = 0; x < cv2.width; x++) if (isContent((y * cv2.width + x) * 4)) n++;
        rows.push(n);
      }
      const first = rows.findIndex(n => n > 0);
      const last = rows.length - 1 - [...rows].reverse().findIndex(n => n > 0);
      // 图片横向占满左半边 (182px), 说明文字更长 (455px) → 用「右半部分是否有内容」区分说明行
      const rightRows = [];
      for (let y = 0; y < cv2.height; y++) {
        let n = 0;
        for (let x = 200; x < cv2.width; x++) if (isContent((y * cv2.width + x) * 4)) n++;
        if (n > 0) rightRows.push(y);
      }
      shots.push({ name: 'glyph-gallery-rows',
        rows: '内容 y=' + first + '..' + last + ' (画布高 ' + cv2.height + ', 图片应为 y=6..145)' +
              '  说明文字行(右半有内容) y=' + (rightRows.length ? rightRows[0] + '..' + rightRows[rightRows.length - 1] : '无') });
    })();
    const cv2b = document.createElement('canvas');
    const r2b = await window.CEPreview.sceneImageGallery(cv2b, { type: 'image', scale: 1, imageId: 'internal:smelting' });
    shots.push({ name: 'glyph-gallery-small', dataUrl: cv2b.toDataURL('image/png'), w: cv2b.width, h: cv2b.height, warnings: r2b.warnings || [] });
    // 3x 界面尺寸下的同一张图: 像素数应为 1x 的 3 倍, 且仍然锐利
    const cv2c = document.createElement('canvas');
    const r2c = await window.CEPreview.renderScene(cv2c, { type: 'image', scale: 3, imageId: 'internal:item_browser' });
    shots.push({ name: 'glyph-gallery-3x', dataUrl: cv2c.toDataURL('image/png'), w: cv2c.width, h: cv2c.height, warnings: r2c.warnings || [] });
    // 3) 箱子 GUI 标题里放字体图像
    const cv3 = document.createElement('canvas');
    const r3 = await window.CEPreview.renderScene(cv3, {
      type: 'gui', rows: 3, scale: 2, title: '<image:internal:smelting> <dark_gray>Crafting',
      items: [{ id: 'minecraft:diamond_sword' }, { id: 'minecraft:stone', count: 64 }]
    });
    shots.push({ name: 'glyph-gui-title', dataUrl: cv3.toDataURL('image/png'), w: cv3.width, h: cv3.height, warnings: r3.warnings || [] });
    return shots;
  })()`, true);

  for (const s of out) {
    if (s.rows) {
      console.log('ROWS  ' + s.rows);
      continue;
    }
    if (s.bbox) {
      const b = s.bbox;
      const fmt = (k) => k + ': ' + b[k].w + 'x' + b[k].h + ' top=' + b[k].top + ' adv=' + b[k].advance;
      console.log('BBOX  ' + [fmt('item_browser'), fmt('smelting'), fmt('emojis'), fmt('textA')].join('   '));
      continue;
    }
    if (!s.dataUrl) continue;
    fs.writeFileSync(path.join(OUT_DIR, s.name + '.png'),
      Buffer.from(String(s.dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
    let extra = '';
    if (s.cols) {
      // 从列占用里切出连续的非零块, 报告每个块的宽度/高度
      const cols = s.cols.split(',').map(Number);
      const blocks = [];
      let start = -1;
      for (let i = 0; i <= cols.length; i++) {
        const v = i < cols.length ? cols[i] : 0;
        if (v > 0 && start < 0) start = i;
        else if (v === 0 && start >= 0) { blocks.push([start, i - 1 - start + 1]); start = -1; }
      }
      extra = '  列块(含文字)=' + JSON.stringify(blocks.slice(0, 12));
    }
    console.log('WROTE ' + s.name + '.png  ' + s.w + 'x' + s.h +
      (s.warnings && s.warnings.length ? '  warnings=' + JSON.stringify(s.warnings) : '') + extra);
  }
  app.exit(0);
}
main().catch(e => { console.error('FATAL', e); app.exit(1); });
