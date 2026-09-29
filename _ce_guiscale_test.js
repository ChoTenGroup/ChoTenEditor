/* 界面尺寸 (GUI Scale) 验证
 * 用法: node_modules\.bin\electron.cmd _ce_guiscale_test.js
 *
 * 断言: 字体图像的最终像素高度 == 配置的 height × 界面尺寸, 且各倍率都是整数倍、
 * 无裁切; 「自动」会依据预览区宽度选一个 1..4 的倍率。
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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'gs'; });

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

    const ID = 'internal:item_browser';   // height 140, ascent 18, PNG 182x140
    const CFG_H = 140;
    // 只画这张图 + 说明行, 背景不透明; 量「图片」这个连续不透明块的高度
    async function measure(scale) {
      const c = document.createElement('canvas');
      // 走 renderScene (面板的真实入口), 它会在每次渲染前清空告警列表
      const r = await window.CEPreview.renderScene(c, { type: 'image', scale: scale, imageId: ID });
      const g = c.getContext('2d');
      const px = g.getImageData(0, 0, c.width, c.height).data;
      // 布局 (逻辑像素): 图片 y=padY(6)..6+140, 说明文字 y=150..157
      // 只扫描「图片应该出现」的区域 —— 上边界到 150*scale, 横向 8*scale..191*scale,
      // 这样说明文字完全落在扫描区之外, 量到的就是图片本身
      const yMax = Math.min(c.height, 150 * scale);
      const x0 = Math.min(c.width - 1, 8 * scale), x1 = Math.min(c.width - 1, 191 * scale);
      let first = -1, last = -1, minX = -1, maxX = -1;
      for (let y = 0; y < yMax; y++) {
        for (let x = x0; x <= x1; x++) {
          const a = px[(y * c.width + x) * 4 + 3];
          if (a >= 240) {
            if (first < 0) first = y;
            last = y;
            if (minX < 0 || x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }
      return { w: c.width, h: c.height, first: first, last: last,
               imgH: last >= first ? last - first + 1 : 0,
               imgW: maxX >= minX ? maxX - minX + 1 : 0,
               warnings: (r.warnings || []).slice(0, 3), warnCount: (r.warnings || []).length };
    }
    const res = {};
    for (const s of [1, 2, 3, 4]) res[s] = await measure(s);
    // 自动: 给一个预览区宽度, 看它选几倍 (窄场景应该能到 4x, 宽场景不低于 2x)
    window.CEPreview.setStageWidth(800);
    const auto = {};
    for (const logical of [182, 400, 900]) auto[logical] = window.CEPreview.autoScaleFor(logical);
    window.CEPreview.setStageWidth(560);
    const autoNarrow = window.CEPreview.autoScaleFor(182);
    const cAuto = document.createElement('canvas');
    window.CEPreview.setStageWidth(800);
    await window.CEPreview.renderScene(cAuto, { type: 'image', scale: 0, imageId: ID });
    return { res, auto, autoNarrow, cfgH: CFG_H,
             autoCanvas: cAuto.width + 'x' + cAuto.height,
             autoAttr: cAuto.getAttribute('data-gui-scale') };
  })()`, true);

  console.log('配置 height =', out.cfgH);
  for (const s of [1, 2, 3, 4]) {
    const r = out.res[s];
    const expect = out.cfgH * s;
    check(r.imgH === expect && r.imgW === 182 * s,
      '界面尺寸 ' + s + 'x: 图片像素 ' + r.imgW + 'x' + r.imgH + ' (期望 ' + (182 * s) + 'x' + expect + '), 画布 ' + r.w + 'x' + r.h);
    check(r.warnCount === 0, '界面尺寸 ' + s + 'x: 无告警 (' + JSON.stringify(r.warnings) + ')');
  }
  console.log('自动倍率 (预览区宽 800):', JSON.stringify(out.auto), ' 560 宽时窄场景:', out.autoNarrow + 'x');
  check(out.auto[182] === 4, '自动: 800 宽预览区下窄场景选满 4x (' + out.auto[182] + 'x)');
  check(out.auto[400] >= 1, '自动: 中等宽度场景给出可用倍率 (' + out.auto[400] + 'x)');
  check(out.auto[900] === 1, '自动: 超宽场景退到 1x 原尺寸, 不再强行放大 (' + out.auto[900] + 'x)');
  console.log('自动渲染画布:', out.autoCanvas, ' 生效倍率:', out.autoAttr);

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
