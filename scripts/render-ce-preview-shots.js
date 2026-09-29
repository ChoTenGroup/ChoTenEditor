/* 无头 Electron 截图工具: 用真实 Chromium 渲染 CE 预览场景并导出 PNG
 * 用法: node_modules\.bin\electron.cmd _ce_tmp\render_shots.js
 * 输出: _ce_shots\*.png
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mcAssets = require(path.join(__dirname, '..', 'mc-assets.js'));
const ceProject = require(path.join(__dirname, '..', 'ce-project.js'));

const APP_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(APP_DIR, '_ce_shots');
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';

// ---- 注册渲染进程需要的 IPC (main.js 的子集) ----
ipcMain.handle('app:getPath', async () => APP_DIR);
ipcMain.handle('fs:readFile', async (e, p) => {
  try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('fs:readdir', async (e, p) => {
  try {
    const es = await fs.promises.readdir(p, { withFileTypes: true });
    return { success: true, files: es.map(x => ({ name: x.name, isDirectory: x.isDirectory(), path: path.join(p, x.name) })) };
  } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('fs:stat', async (e, p) => {
  try { return { success: true, stat: await fs.promises.stat(p) }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('ce:resolveProjectRoot', async (e, p) => {
  try { return await ceProject.resolveProjectRoot(p); } catch (err) { return { found: false }; }
});
ipcMain.handle('mc:scanAssets', async (e, r) => mcAssets.scanAssets(r));
ipcMain.handle('mc:scanNamespace', async (e, d, n) => ({ ok: true, registry: await mcAssets.scanNamespace(d, n) }));
ipcMain.handle('mc:readSoundEvents', async (e, d, l) => ({ ok: true, events: await mcAssets.readSoundEvents(d, l) }));
ipcMain.handle('mc:readBinary', async (e, p) => mcAssets.readBinaryDataUrl(p));
ipcMain.handle('mc:readText', async (e, p) => mcAssets.readTextFile(p));
ipcMain.handle('mc:detectRoots', async () => ({ ok: true, roots: await mcAssets.detectRoots() }));
ipcMain.handle('fonts:list', async () => ({ success: true, fonts: [] }));
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'shots'; });

const SCENES = [
  {
    name: '01-lore-item',
    scene: {
      type: 'lore', scale: 3,
      name: '<bold><gradient:#FFD700:#FF8C00>Topaz Blade</gradient></bold>',
      lore: [
        '<dark_gray>◆ <gray>Damage: <red>42',
        '<dark_gray>◆ <gray>Speed: <aqua>1.6 <dark_gray>· Crit: <yellow>12%',
        '',
        '<image:demo:star> <gradient:#55FFFF:#55FF55>Rare Enchantment</gradient>',
        '<dark_gray>  Sharpness <gold>V',
        '<dark_gray>  Fire Aspect <gold>II',
        '',
        '<italic><dark_gray>Forged in the deep caverns.'
      ],
      showItem: true, item: 'minecraft:diamond_sword', rarity: 'rare'
    }
  },
  {
    name: '02-lore-block',
    scene: {
      type: 'lore', scale: 3,
      name: '<white>Stone Bricks',
      lore: ['<gray>An isometric block model preview', '<dark_gray>minecraft:block/stone_bricks'],
      showItem: true, item: 'minecraft:stone_bricks'
    }
  },
  {
    name: '03-chat',
    scene: {
      type: 'chat', scale: 3, chatWidth: 300,
      lines: [
        '<gray>[<green>Server<gray>] <yellow>Welcome to the realm!',
        '<white><bold>Steve<reset><gray>: look at my new sword <image:demo:star>',
        '<aqua>» <white><global:rare_tag> <gradient:#FF8C00:#FFD700>Topaz Blade</gradient></white>',
        '<red>❤ <gray>HP: <red>18<dark_gray>/20   <blue>✦ <gray>MP: <aqua>64<dark_gray>/100',
        '<dark_gray><strikethrough>old price<reset> <green>1<gold>0 <yellow>coins',
        '<white>tab:<shift:24>aligned column'
      ]
    }
  },
  {
    name: '04-gui-9x3',
    scene: {
      type: 'gui', rows: 3, scale: 3, title: '<dark_gray>Vault',
      fillPlayerInventory: true, hoverSlot: 10,
      items: [
        { id: 'minecraft:diamond_sword' }, { id: 'minecraft:golden_apple', count: 16 },
        { id: 'minecraft:stone_bricks', count: 64 }, { id: 'minecraft:ender_pearl', count: 12 },
        { id: 'minecraft:netherite_ingot', count: 3 }, { id: 'minecraft:enchanted_book' },
        { id: 'minecraft:oak_stairs', count: 32 }, { id: 'minecraft:redstone', count: 64 },
        { id: 'minecraft:clock' }, { id: 'minecraft:emerald', count: 48 },
        { id: 'minecraft:diamond_pickaxe' }, { id: 'minecraft:torch', count: 64 }
      ]
    }
  },
  {
    name: '05-gui-9x6',
    scene: {
      type: 'gui', rows: 6, scale: 2, title: '<white>Large Chest',
      fillPlayerInventory: true,
      items: (function () {
        const ids = ['minecraft:diamond_sword', 'minecraft:golden_apple', 'minecraft:stone_bricks',
          'minecraft:ender_pearl', 'minecraft:netherite_ingot', 'minecraft:enchanted_book',
          'minecraft:oak_stairs', 'minecraft:redstone', 'minecraft:clock', 'minecraft:emerald',
          'minecraft:diamond_pickaxe', 'minecraft:torch', 'minecraft:apple', 'minecraft:bread',
          'minecraft:iron_ingot', 'minecraft:coal', 'minecraft:stick', 'minecraft:book'];
        return ids.map((id, i) => ({ id: id, count: (i % 4) + 1 }));
      })()
    }
  },
  {
    name: '06-image-gallery',
    scene: { type: 'image', scale: 3 }
  }
];

async function main() {
  await app.whenReady();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true,
      offscreen: false,
    },
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2) console.log('[RENDERER]', message);
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));

  const json = JSON.stringify;
  // 等待应用自身的资源索引完成 (并发 init 现已合并, 但仍显式等一次 ready)
  const boot = await win.webContents.executeJavaScript(`(async () => {
    const root = ${json(MC_ROOT)};
    try {
      if (!window.CEMCAssets || !window.CEPreview) return { ok:false, err:'modules missing' };
      let st = window.CEMCAssets.status();
      for (let i = 0; i < 120 && st.state !== 'ready'; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (st.state === 'idle' || st.state === 'error') await window.CEMCAssets.init({ mcRoot: root });
        st = window.CEMCAssets.status();
      }
      if (st.state !== 'ready') st = await window.CEMCAssets.init({ mcRoot: root });
      if (st.state !== 'ready') return { ok:false, err:'assets not ready: ' + st.state + ' ' + (st.error||'') };
      await window.CEPreview.init({ mcRoot: root });
      await window.CEPreview.fontReady();
      window.CEPreview.setGlobals({
        rare_tag: '<!i><bold><#FF8C00>[RARE]</#FF8C00></bold>',
        coin_icon: '<!shadow><image:demo:coin>'
      });
      window.CEPreview.setLangs({ 'item.demo.sword': '<gold>Topaz Blade</gold>' });
      window.CEPreview.setImages({
        'demo:star': { file: 'minecraft:item/nether_star', height: 16, ascent: 15 },
        'demo:coin': { file: 'minecraft:item/gold_ingot', height: 10, ascent: 9 },
        'demo:icons': { file: 'minecraft:item/diamond', height: 10, ascent: 9, grid_size: '1,1' }
      });
      await window.CEPreview.preloadImages();
      return { ok:true, state: st.state, counts: st.counts, fonts: Object.keys(window.CEPreview.getProjectData().images),
               glyphs: window.CEPreview.measureText('A').width + '/' + window.CEPreview.measureText(' ').width };
    } catch (e) { return { ok:false, err: String(e && e.message || e) }; }
  })()`, true);
  console.log('boot:', JSON.stringify(boot));
  if (!boot || !boot.ok) { console.error('BOOT FAILED'); app.exit(2); return; }

  const shots = await win.webContents.executeJavaScript(`(async () => {
    const defs = ${json(SCENES)};
    const out = [];
    for (const d of defs) {
      try {
        const cv = document.createElement('canvas');
        const r = await window.CEPreview.renderScene(cv, d.scene);
        // 像素统计: 校验着色 / 阴影 / 缺图占位
        const g = cv.getContext('2d');
        const px = g.getImageData(0, 0, cv.width, cv.height).data;
        const seen = new Set();
        let opaque = 0, magenta = 0, grey = 0, gold = 0, cyan = 0, green = 0, red = 0,
            shadow = 0, white = 0, darkTitle = 0;
        const near = (r, gg, b, tr, tg, tb, tol) =>
          Math.abs(r - tr) <= tol && Math.abs(gg - tg) <= tol && Math.abs(b - tb) <= tol;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 8) continue;
          opaque++;
          const r0 = px[i], g0 = px[i + 1], b0 = px[i + 2];
          seen.add((r0 >> 2) + ',' + (g0 >> 2) + ',' + (b0 >> 2));
          if (near(r0, g0, b0, 255, 0, 255, 20)) magenta++;
          if (near(r0, g0, b0, 170, 170, 170, 24)) grey++;
          if (near(r0, g0, b0, 255, 170, 0, 24)) gold++;
          if (near(r0, g0, b0, 85, 255, 255, 24)) cyan++;
          if (near(r0, g0, b0, 85, 255, 85, 24)) green++;
          if (near(r0, g0, b0, 255, 85, 85, 24)) red++;
          if (near(r0, g0, b0, 64, 64, 64, 14)) shadow++;
          if (r0 > 240 && g0 > 240 && b0 > 240) white++;
          if (near(r0, g0, b0, 64, 64, 64, 12)) darkTitle++;
        }
        out.push({
          name: d.name, dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height,
          warnings: (r && r.warnings) || [],
          stats: { opaque: opaque, distinctColors: seen.size, magenta: magenta, grey: grey,
                   gold: gold, cyan: cyan, green: green, red: red,
                   shadow: shadow, white: white }
        });
      } catch (e) {
        out.push({ name: d.name, error: String(e && e.message || e) });
      }
    }
    return out;
  })()`, true);

  let n = 0;
  for (const s of shots) {
    if (s.error) { console.error('FAIL ' + s.name + ': ' + s.error); continue; }
    const b64 = String(s.dataUrl).replace(/^data:image\/png;base64,/, '');
    const file = path.join(OUT_DIR, s.name + '.png');
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    n++;
    console.log('WROTE ' + path.basename(file) + '  ' + s.w + 'x' + s.h +
      '  stats=' + JSON.stringify(s.stats) +
      (s.warnings && s.warnings.length ? '  warnings=' + JSON.stringify(s.warnings) : ''));
  }
  console.log('done, ' + n + ' screenshots → ' + OUT_DIR);
  app.exit(0);
}

main().catch(e => { console.error('FATAL', e); app.exit(1); });
