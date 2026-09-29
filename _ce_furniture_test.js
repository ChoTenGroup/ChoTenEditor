/* 家具预览验证
 * 用法: node_modules\.bin\electron.cmd _ce_furniture_test.js
 *
 * 覆盖: 变体解析、元素/碰撞箱/座位解析、场景渲染尺寸、未知物品告警、外部模型告警、
 *       无 variants 的提示, 以及本次家具预览改进:
 *       - 元素渲染位置 (展示实体把模型居中在锚点, 不再是底部贴地)
 *       - 视角旋转 (yaw 45° 步进) 与视图缩放
 *       - 画布按内容自适应 (高家具不再被裁)
 *       - 碰撞箱显示开关 (碰撞箱/填充/标注/座位/网格)
 *       - 碰撞箱几何: shulker direction、happy_ghast 4x4x4、custom 默认箱
 *       - 点击拾取 (furniturePickAt) 与元素旋转矩阵
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'furn'; });

// 一个典型的「落地灯式」家具: 元素彼此错开 (不要叠在同一格, 否则互相遮挡看不清)。
// 注意: 文字用 ASCII —— 这个资源版本的 unifont providers 是空的, 画布里的中文渲染不出来。
const CHAIR = {
  settings: { item: 'demo:my_chair', hit_times: 3 },
  variants: {
    ground: {
      loot_spawn_offset: '0,0.5,0',
      elements: [
        { type: 'item_display', item: 'minecraft:oak_planks', translation: '-0.6,0,0', scale: '0.5,0.5,0.5' },
        { type: 'block_display', block: 'minecraft:stone', translation: '0.6,0,0', scale: '0.5,0.5,0.5' },
        { type: 'text_display', text: 'HELLO', translation: '0,1.4,0', has_shadow: true, alignment: 'center' },
      ],
      hitboxes: [
        { type: 'interaction', width: 1, height: 2, blocks_building: true, interactive: true, seats: ['0.5,0.3,0', '0.5,0.3,0.5 90'] },
        { type: 'shulker', position: '1.5,0,0', scale: 1, peek: 50, seats: ['2,0.3,0 0 true'] },
      ],
    },
    wall: {
      elements: [
        { type: 'item_display', item: 'minecraft:torch', position: '0,0,0.5', translation: '0,0,-0.5' },
        { type: 'better_model', model: 'custom_lamp' },
      ],
      hitboxes: [{ type: 'interaction', width: 0.5, height: 0.5 }],
    },
  },
};

// 居中锚点测试 (对齐官方默认包的写法): 元素 position 默认 0,0,0 落在「原点方块底部中心」,
// 官方模型再写 translation: 0,0.5,0 把 0..16 的模型抬到方块正中 —— 此时
// 元素模型、碰撞箱、原点方块轮廓三者必须完全重合 (这正是「碰撞箱对不上」的回归测试)。
const CENTER = {
  variants: {
    ground: {
      elements: [{ type: 'block_display', block: 'minecraft:stone', translation: '0,0.5,0' }],
      hitboxes: [{ type: 'interaction', width: 1, height: 1 }],
    },
  },
};

// 非对称家具: 3 格宽的判定箱 —— 45° 视角下投影形状明显不同, 用来验证视角旋转
const ASYM = {
  variants: {
    ground: {
      elements: [
        { type: 'block_display', block: 'minecraft:stone', translation: '0.5,0,0' },
        { type: 'block_display', block: 'minecraft:oak_planks', translation: '0,0,0.5' },
      ],
      hitboxes: [{ type: 'interaction', width: 3, height: 1 }],
    },
  },
};

// 高家具: 碰撞箱 6 格高 → 画布要能自适应撑开
const TALL = {
  variants: {
    ground: {
      elements: [{ type: 'item_display', item: 'minecraft:torch', translation: '0,3,0' }],
      hitboxes: [{ type: 'interaction', width: 1, height: 6 }],
    },
  },
};

// 旋转元素: 同时用 rotation(欧拉/四元数)/yaw/pitch, 只要求不崩且画出了东西
const ROTATED = {
  variants: {
    ground: {
      elements: [
        { type: 'block_display', block: 'minecraft:stone', translation: '-0.6,0,0', rotation: '0,90,0' },
        { type: 'block_display', block: 'minecraft:oak_planks', translation: '0,0,0', yaw: 45, pitch: 30 },
        { type: 'block_display', block: 'minecraft:glass', translation: '0.6,0,0', rotation: [0, 0.7071068, 0, 0.7071068] },
      ],
      hitboxes: [{ type: 'interaction', width: 1, height: 1 }],
    },
  },
};

// 平面物品元素: stick 是 item/generated (没有 elements, 就是一张贴图) —— 按竖直卡片渲染,
// 元素旋转/视角旋转都要生效。面朝 +Z: yaw=0 正对镜头 (面积最大), yaw=45 侧对镜头 (几乎看不见),
// yaw=90 看到背面镜像贴图。
const FLAT = {
  variants: {
    ground: {
      elements: [{ type: 'item_display', item: 'minecraft:stick', translation: '0,0.5,0' }],
      hitboxes: [],
    },
  },
};
// 同一个平面元素, 但用 yaw 把卡片自己转 45° (元素旋转也要能把它转侧过去)
const FLAT_ROT = {
  variants: {
    ground: {
      elements: [{ type: 'item_display', item: 'minecraft:stick', translation: '0,0.5,0', yaw: 45 }],
      hitboxes: [],
    },
  },
};

// 潜影贝: 打开的壳是第二个箱体 —— 官方 bench 就是 direction: east + peek: 100,
// 表现为两个并排的 1×1×1、都贴在地面。
const SHULKER_P0 = {
  variants: {
    ground: {
      elements: [{ type: 'block_display', block: 'minecraft:stone', translation: '0,0.5,0' }],
      hitboxes: [{ type: 'shulker', position: '0,0,0', direction: 'east', peek: 0 }],
    },
  },
};
const SHULKER_P100 = {
  variants: {
    ground: {
      elements: [{ type: 'block_display', block: 'minecraft:stone', translation: '0,0.5,0' }],
      hitboxes: [{ type: 'shulker', position: '0,0,0', direction: 'east', peek: 100 }],
    },
  },
};

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await new Promise(r => setTimeout(r, 700));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    const CH = ${JSON.stringify(CHAIR)};
    const CENTER = ${JSON.stringify(CENTER)};
    const ASYM = ${JSON.stringify(ASYM)};
    const TALL = ${JSON.stringify(TALL)};
    const ROT = ${JSON.stringify(ROTATED)};
    const FLAT = ${JSON.stringify(FLAT)};
    const FLAT_ROT = ${JSON.stringify(FLAT_ROT)};
    const SHULKER_P0 = ${JSON.stringify(SHULKER_P0)};
    const SHULKER_P100 = ${JSON.stringify(SHULKER_P100)};

    const mkCanvas = () => document.createElement('canvas');
    const render = (canvas, scene) => window.CEPreview.renderScene(canvas, scene);

    // 1) 变体解析
    const vs = window.CEPreview.furnitureVariants(CH);
    const parsed = vs.map(v => ({ name: v.name, els: v.elements.length, hbs: v.hitboxes.length,
      types: v.elements.map(e => e.type || 'item_display') }));

    // 2) 渲染 ground 变体 (2x)
    const c1 = mkCanvas();
    const r1 = await render(c1, { type: 'furniture', furniture: CH, variant: 0, scale: 2 });

    // 3) 渲染 wall 变体 (含外部模型)
    const c2 = mkCanvas();
    const r2 = await render(c2, { type: 'furniture', furniture: CH, variant: 1, scale: 2 });

    // 4) 没有 variants
    const c3 = mkCanvas();
    const r3 = await render(c3, { type: 'furniture', furniture: { settings: {} }, scale: 1 });

    // 5) 居中锚点: 整方块元素必须和 [0,16]^3 重合
    const cCenter = mkCanvas();
    const rC = await render(cCenter, { type: 'furniture', furniture: CENTER, variant: 0, scale: 2,
      showGrid: false, hbFill: false, hbLabels: false });
    const centerPick = window.CEPreview.furniturePickData();
    const centerPoly = centerPick && centerPick.boxes.length ? centerPick.boxes[0].poly : null;

    // 6) 视角旋转: 3 格宽判定箱在 yaw 0 / 45 下投影不同
    const cR0 = mkCanvas();
    await render(cR0, { type: 'furniture', furniture: ASYM, variant: 0, scale: 1, showGrid: false, hbFill: false, hbLabels: false });
    const pick0 = window.CEPreview.furniturePickData();
    const cR90 = mkCanvas();
    await render(cR90, { type: 'furniture', furniture: ASYM, variant: 0, scale: 1, yaw: 45, showGrid: false, hbFill: false, hbLabels: false });
    const pick90 = window.CEPreview.furniturePickData();

    // 7) 开关: 隐藏碰撞箱 / 隐藏座位
    const cNoHb = mkCanvas();
    const rNoHb = await render(cNoHb, { type: 'furniture', furniture: CH, variant: 0, scale: 2, showHitboxes: false });
    const cNoSeat = mkCanvas();
    await render(cNoSeat, { type: 'furniture', furniture: CH, variant: 0, scale: 2, showSeats: false });

    // 8) 缩放: 200% 画布应更大
    const cZoom = mkCanvas();
    await render(cZoom, { type: 'furniture', furniture: CH, variant: 0, scale: 2, zoom: 2 });

    // 9) 高家具: 画布自适应撑高
    const cTall = mkCanvas();
    await render(cTall, { type: 'furniture', furniture: TALL, variant: 0, scale: 1 });

    // 10) 旋转元素 (欧拉 / yaw+pitch / 四元数) 不崩
    const cRot = mkCanvas();
    const rRot = await render(cRot, { type: 'furniture', furniture: ROT, variant: 0, scale: 1 });

    // 10b) 平面物品旋转: 卡片面朝 +Z, 侧对镜头时应该几乎消失
    const cFlat0 = mkCanvas();
    await render(cFlat0, { type: 'furniture', furniture: FLAT, variant: 0, scale: 2, showGrid: false, showHitboxes: false });
    const cFlat45 = mkCanvas();
    await render(cFlat45, { type: 'furniture', furniture: FLAT, variant: 0, scale: 2, yaw: 45, showGrid: false, showHitboxes: false });
    const cFlat90 = mkCanvas();
    await render(cFlat90, { type: 'furniture', furniture: FLAT, variant: 0, scale: 2, yaw: 90, showGrid: false, showHitboxes: false });
    const cFlatElem = mkCanvas();
    await render(cFlatElem, { type: 'furniture', furniture: FLAT_ROT, variant: 0, scale: 2, showGrid: false, showHitboxes: false });

    // 10c) 潜影贝打开 → 第二个箱体 (官方 bench: direction east + peek 100 → 并排两个)
    const cP0 = mkCanvas();
    await render(cP0, { type: 'furniture', furniture: SHULKER_P0, variant: 0, scale: 2, showGrid: false });
    const p0Boxes = (window.CEPreview.furniturePickData() || { boxes: [] }).boxes.map(b => b.index + ':' + b.type);
    const cP100 = mkCanvas();
    await render(cP100, { type: 'furniture', furniture: SHULKER_P100, variant: 0, scale: 2, showGrid: false });
    const p100Boxes = (window.CEPreview.furniturePickData() || { boxes: [] }).boxes.map(b => b.index + ':' + b.type + (b.lid ? '(lid)' : ''));
    const p100 = window.CEPreview.furniturePickData();
    let p100dx = null;
    if (p100 && p100.boxes.length === 2) {
      p100dx = Math.round(Math.abs(p100.boxes[0].cx - p100.boxes[1].cx) * 10) / 10;
    }

    // 11) 点击拾取: 用交互箱多边形的重心命中, 用远处点不命中
    await render(cR0, { type: 'furniture', furniture: ASYM, variant: 0, scale: 1, showGrid: false, hbFill: false, hbLabels: false });
    let pickHit = null, pickMiss = null;
    const pk = window.CEPreview.furniturePickData();
    if (pk && pk.boxes.length) {
      const poly = pk.boxes[0].poly;
      let cx = 0, cy = 0;
      poly.forEach(p => { cx += p.x / poly.length; cy += p.y / poly.length; });
      pickHit = window.CEPreview.furniturePickAt(cx, cy);
      pickMiss = window.CEPreview.furniturePickAt(-500, -500);
    }

    // 12) 碰撞箱几何 (潜影贝 peek/direction / happy_ghast / custom)
    const HB = window.CEPreview.furnitureHitboxBoxes;
    const hbUp = HB({ type: 'shulker', position: '0,0,0', scale: 1 });
    const hbPeek100 = HB({ type: 'shulker', position: '0,0,0', scale: 1, peek: 100 });
    const hbEast = HB({ type: 'shulker', position: '0,0,0', scale: 1, peek: 100, direction: 'east' });
    const hbGhast = window.CEPreview.furnitureHitboxBox({ type: 'happy_ghast', position: '0,0,0', scale: 1 });
    const hbCustom = window.CEPreview.furnitureHitboxBox({ type: 'custom', position: '0,0,0' });
    const dim = b => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const bb = b => [b.min.map(v => Math.round(v * 100) / 100), b.max.map(v => Math.round(v * 100) / 100)];

    // 12b) 官方默认包的三份配置: 坐标原点与「水平居中 + 底面在 position.y」语义
    const chairEl = window.CEPreview._internals.furnitureElementXf({ type: 'item_display', translation: '0,0.5,0' }, 0);
    const chairHb = window.CEPreview.furnitureHitboxBox({ type: 'interaction', position: '0,0,0', width: 0.7, height: 1.2 });
    const benchEl = window.CEPreview._internals.furnitureElementXf({ type: 'item_display', position: '0.5,0,0', translation: '0,0.5,0' }, 0);
    const ceilEl = window.CEPreview._internals.furnitureElementXf({ type: 'item_display', position: '0,-0.46,0' }, 0);
    const ceilHb = window.CEPreview.furnitureHitboxBox({ type: 'interaction', position: '0,-0.7,0', width: 0.7, height: 0.7 });
    const seat2 = window.CEPreview._internals.furnWorld(1, 0, -0.1);
    const defEl = window.CEPreview._internals.furnitureElementXf({ type: 'block_display', block: 'minecraft:stone' }, 0);

    // 13) 旋转矩阵 (元素 rotation 的三种写法)
    const M = window.CEPreview._internals;
    const apply = (m, v) => M.mat3Apply(m, v).map(x => Math.round(x * 1000) / 1000);
    const rotEuler = apply(M.furnitureRotationMatrix({ rotation: '0,90,0' }), [1, 0, 0]);
    const rotQuat = apply(M.furnitureRotationMatrix({ rotation: [0, 0.7071068, 0, 0.7071068] }), [1, 0, 0]);
    const rotYaw = apply(M.furnitureRotationMatrix({ yaw: 90 }), [0, 0, 1]);
    // 元素锚点: item 元素 position 默认方块中心
    const xfItem = M.furnitureElementXf({ type: 'item', item: 'minecraft:torch' }, 0);
    const xfBlock = M.furnitureElementXf({ type: 'block_display', block: 'minecraft:stone' }, 0);

    function ink(cv) {
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 8) n++;
      return n;
    }
    function countColor(cv, hex) {
      const R2 = parseInt(hex.slice(1,3),16), G2 = parseInt(hex.slice(3,5),16), B2 = parseInt(hex.slice(5,7),16);
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (Math.abs(px[i]-R2) <= 12 && Math.abs(px[i+1]-G2) <= 12 && Math.abs(px[i+2]-B2) <= 12 && px[i+3] > 40) n++;
      }
      return n;
    }
    // 彩色 (非灰) 像素: 排除纯黑背景/灰色基准框/灰色页眉文字, 只量平面卡片的可见面积。
    // 侧对镜头时卡片被完全剔除 → 0, 正对时是它的投影面积。
    function countColored(cv) {
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i+3] <= 40) continue;
        const r = px[i], gg = px[i+1], b = px[i+2];
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 25) n++;
      }
      return n;
    }
    function pointInPoly(px, py, poly) {      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
    // 灰色 (石头贴图) 像素在 [0,16]^3 投影多边形内/外的数量: 验证元素渲染位置
    function greyInOut(cv, poly, gs) {
      if (!poly) return { inside: 0, outside: 0 };
      const g = cv.getContext('2d');
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      const headerY = 26 * gs;   // 跳过画布页眉文字 (灰色, 会污染统计)
      let inside = 0, outside = 0;
      for (let y = 0; y < cv.height; y++) {
        if (y < headerY) continue;
        for (let x = 0; x < cv.width; x++) {
          const i = (y * cv.width + x) * 4;
          if (px[i + 3] <= 40) continue;
          const r = px[i], gg = px[i+1], b = px[i+2];
          if (Math.abs(r - gg) > 14 || Math.abs(gg - b) > 14) continue;
          if (r < 50 || r > 215) continue;
          if (pointInPoly(x / gs, y / gs, poly)) inside++; else outside++;
        }
      }
      return { inside: inside, outside: outside };
    }
    function diffRatio(a, b) {
      const ga = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      const gb = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
      const n = Math.min(ga.length, gb.length);
      let d = 0;
      for (let i = 0; i < n; i += 4) if (Math.abs(ga[i] - gb[i]) > 12 || Math.abs(ga[i+3] - gb[i+3]) > 12) d++;
      return { diff: d, total: n / 4 };
    }

    const gsCenter = parseFloat(cCenter.getAttribute('data-gui-scale')) || 1;
    const centreStat = greyInOut(cCenter, centerPoly, gsCenter);
    const rotDiff = diffRatio(cR0, cR90);
    const polyW = pk2 => {
      if (!pk2 || !pk2.boxes.length) return null;
      const xs = pk2.boxes[0].poly.map(p => p.x);
      return Math.round((Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 100) / 100;
    };

    return {
      parsed: parsed,
      c1: c1.width + 'x' + c1.height, w1: r1.warnings.slice(),
      c2: c2.width + 'x' + c2.height, w2: r2.warnings.slice(),
      c3: c3.width + 'x' + c3.height, w3: r3.warnings.slice(),
      ink1: ink(c1), ink3: ink(c3),
      c1url: c1.toDataURL('image/png'),
      c2url: c2.toDataURL('image/png'),
      blue: countColor(c1, '#4FC3F7'), orange: countColor(c1, '#FFB74D'), yellow: countColor(c1, '#FFD54F'),
      purple: countColor(c2, '#BA68C8'),
      blueNoHb: countColor(cNoHb, '#4FC3F7'), orangeNoHb: countColor(cNoHb, '#FFB74D'), yellowNoHb: countColor(cNoHb, '#FFD54F'),
      inkNoHb: ink(cNoHb),
      blueNoSeat: countColor(cNoSeat, '#4FC3F7'), yellowNoSeat: countColor(cNoSeat, '#FFD54F'),
      zoomW: cZoom.width, zoomH: cZoom.height, baseW: c1.width, baseH: c1.height,
      cTall: cTall.width + 'x' + cTall.height,
      wRot: rRot.warnings.slice(), inkRot: ink(cRot),
      inkFlat0: countColored(cFlat0), inkFlat45: countColored(cFlat45), inkFlat90: countColored(cFlat90), inkFlatElem: countColored(cFlatElem),
      ixBlue: countColor(cP0, '#FFB74D'), ixOrange: countColor(cP100, '#FFB74D'),
      p0Boxes: p0Boxes, p100Boxes: p100Boxes, p100dx: p100dx,
      noIxBlue: 0, noIxOrange: 0,
      cCenter: cCenter.width + 'x' + cCenter.height,
      centreInside: centreStat.inside, centreOutside: centreStat.outside,
      rotDiff: rotDiff.diff, rotTotal: rotDiff.total,
      polyW0: polyW(pick0), polyW45: polyW(pick90),
      pickHit: pickHit ? pickHit.index : null, pickMiss: pickMiss,
      hbUp: dim(hbUp[0]), hbUpCount: hbUp.length,
      hbUpMin: hbUp[0].min.map(v => Math.round(v * 100) / 100),
      hbPeek100: hbPeek100.map(bb), hbEast: hbEast.map(bb),
      hbGhast: dim(hbGhast), hbCustom: dim(hbCustom),
      chairAnchor: chairEl.anchor, chairHb: [chairHb.min, chairHb.max].map(a => a.map(v => Math.round(v * 100) / 100)),
      benchAnchor: benchEl.anchor, ceilAnchor: ceilEl.anchor,
      ceilHbY: [ceilHb.min[1], ceilHb.max[1]], seat2: seat2, defAnchor: defEl.anchor,
      rotEuler: rotEuler, rotQuat: rotQuat, rotYaw: rotYaw,
      itemAnchor: xfItem.anchor, blockAnchor: xfBlock.anchor,
      w1len: r1.warnings.length,
      cR0url: cR0.toDataURL('image/png'), cR90url: cR90.toDataURL('image/png'),
      cCenterUrl: cCenter.toDataURL('image/png')
    };
  })()`, true);

  console.log('解析:', JSON.stringify(out.parsed));
  check(out.parsed.length === 2, '解析出 2 个变体 (' + out.parsed.length + ')');
  check(out.parsed[0] && out.parsed[0].name === 'ground', '  第一个是 ground');
  check(out.parsed[0] && out.parsed[0].els === 3, '  ground 有 3 个元素');
  check(out.parsed[0] && out.parsed[0].hbs === 2, '  ground 有 2 个碰撞箱');
  check(out.parsed[0] && out.parsed[0].types.join(',') === 'item_display,block_display,text_display',
    '  元素类型正确 (' + (out.parsed[0] && out.parsed[0].types.join(',')) + ')');
  check(out.parsed[1] && out.parsed[1].types.indexOf('better_model') !== -1, '  wall 变体含 better_model');

  console.log('画布:', out.c1, out.c2, out.c3, '高家具:', out.cTall);
  const c1w = parseInt(String(out.c1).split('x')[0], 10);
  const c1h = parseInt(String(out.c1).split('x')[1], 10);
  check(c1w >= 272 * 2 && c1h >= 226 * 2 && c1w % 2 === 0 && c1h % 2 === 0,
    '家具场景按界面尺寸 2x 渲染且画布自适应 (' + out.c1 + ')');
  check(out.ink1 > 5000, '场景确实画了内容 (非透明像素 ' + out.ink1 + ')');
  console.log('颜色像素: 交互蓝 ' + out.blue + ', 潜影贝橙 ' + out.orange + ', 座位黄 ' + out.yellow + ', 外部模型紫 ' + out.purple);
  check(out.blue > 50, '画出了交互碰撞箱线框 (蓝 ' + out.blue + ')');
  check(out.orange > 50, '画出了潜影贝碰撞箱线框 (橙 ' + out.orange + ')');
  check(out.yellow > 10, '画出了座位标记 (黄 ' + out.yellow + ')');
  check(out.purple > 10, '外部模型画了占位框 (紫 ' + out.purple + ')');

  check(out.w1.indexOf('furniture-external-model') === -1, 'ground 变体没有外部模型告警');
  check(out.w2.some(w => w.indexOf('furniture-external-model') === 0), 'wall 变体报告了外部模型告警: ' + JSON.stringify(out.w2));
  check(out.ink3 > 200, '无 variants 时画出提示文字而不是空白/崩溃 (像素 ' + out.ink3 + ')');
  check(out.c3 === '272x226', '无 variants 也能按 1x 渲染 (' + out.c3 + ')');

  // ---- 本次改进的验证 ----
  console.log('');
  console.log('居中锚点: [0,16]^3 投影内灰色像素 ' + out.centreInside + ', 外面 ' + out.centreOutside + ' (' + out.cCenter + ')');
  const cTot = out.centreInside + out.centreOutside;
  check(cTot > 800, '方块元素确实渲染出了贴图像素 (' + cTot + ')');
  check(out.centreInside / Math.max(1, cTot) > 0.85,
    '元素以锚点为中心渲染 (与 [0,16]^3 基准方框重合, 内部占比 ' + (out.centreInside / Math.max(1, cTot)).toFixed(3) + ')');

  console.log('视角旋转: 图像差异像素 ' + out.rotDiff + '/' + out.rotTotal + ', 拾取多边形宽度 ' + out.polyW0 + ' → ' + out.polyW45);
  check(out.rotDiff > out.rotTotal * 0.02, 'yaw 45 确实改变了画面 (' + out.rotDiff + ' 像素)');
  check(out.polyW0 != null && out.polyW45 != null && Math.abs(out.polyW45 - out.polyW0) > out.polyW0 * 0.1,
    '旋转后碰撞箱投影跟着变形 (' + out.polyW0 + ' → ' + out.polyW45 + ')');

  console.log('显示开关: 隐藏碰撞箱后 蓝 ' + out.blueNoHb + ' 橙 ' + out.orangeNoHb + ' 黄 ' + out.yellowNoHb + ' (内容像素 ' + out.inkNoHb + ')');
  check(out.blueNoHb === 0 && out.orangeNoHb === 0, '关闭碰撞箱后不再画线框');
  check(out.inkNoHb > 1000, '关闭碰撞箱后元素仍在渲染 (' + out.inkNoHb + ')');
  check(out.yellowNoHb > 10, '座位有自己的开关, 关碰撞箱时仍然显示 (' + out.yellowNoHb + ')');
  check(out.blueNoSeat > 50 && out.yellowNoSeat === 0, '只关座位时保留线框、去掉座位 (蓝 ' + out.blueNoSeat + ')');

  check(out.zoomW > out.baseW && out.zoomH > out.baseH,
    '视图缩放到 200% 后画布更大 (' + out.baseW + 'x' + out.baseH + ' → ' + out.zoomW + 'x' + out.zoomH + ')');
  const tallH = parseInt(String(out.cTall).split('x')[1], 10);
  check(tallH > 226, '高家具的画布自适应撑高, 不再被裁 (' + out.cTall + ')');
  check(out.inkRot > 1000 && out.wRot.length === 0, '元素 rotation/yaw/pitch/四元数 都能渲染 (' + out.inkRot + ', 告警 ' + JSON.stringify(out.wRot) + ')');

  console.log('平面物品旋转: yaw0 ' + out.inkFlat0 + ' / yaw45 ' + out.inkFlat45 + ' / yaw90 ' + out.inkFlat90 + ' / 元素yaw45 ' + out.inkFlatElem);
  check(out.inkFlat0 > 100, '平面物品正常渲染 (彩色像素 ' + out.inkFlat0 + ')');
  check(out.inkFlat45 < out.inkFlat0 * 0.35, '视角转到 45° 时平面物品侧对镜头、几乎消失 (' + out.inkFlat45 + ' < ' + Math.round(out.inkFlat0 * 0.35) + ')');
  check(out.inkFlat90 > out.inkFlat45, '继续转到 90° 又能看到卡片背面 (' + out.inkFlat90 + ')');
  check(out.inkFlatElem < out.inkFlat0 * 0.35, '元素自己的 yaw 同样能把平面物品转侧 (' + out.inkFlatElem + ')');

  console.log('潜影贝箱体: peek0 → ' + JSON.stringify(out.p0Boxes) + ' (橙色像素 ' + out.ixBlue + ')' +
    '; peek100 → ' + JSON.stringify(out.p100Boxes) + ' (橙色像素 ' + out.ixOrange + ', 两箱中心屏幕距 ' + out.p100dx + ')');
  check(out.p0Boxes.length === 1 && out.p0Boxes[0] === '0:shulker', 'peek 0 时只有一个箱子 (' + JSON.stringify(out.p0Boxes) + ')');
  check(out.p100Boxes.length === 2, 'peek 100 时画出两个箱子 (' + JSON.stringify(out.p100Boxes) + ')');
  check(out.p100Boxes[1] === '0:shulker(lid)', '第二个是本体同属一条配置的「壳」(' + out.p100Boxes[1] + ')');
  check(out.ixOrange > out.ixBlue * 1.5, '两个箱子比一个箱子画的线框多 (' + out.ixBlue + ' → ' + out.ixOrange + ')');
  check(out.p100dx > 10, '两个箱子在画面上是分开的 (中心相距 ' + out.p100dx + 'px)');

  console.log('碰撞箱几何: up=' + JSON.stringify(out.hbUp) + ' (' + out.hbUpCount + ' 个箱体)' +
    ' peek100=' + JSON.stringify(out.hbPeek100) + ' east+peek100=' + JSON.stringify(out.hbEast) +
    ' ghast=' + JSON.stringify(out.hbGhast) + ' custom=' + JSON.stringify(out.hbCustom));
  check(out.hbUp.join(',') === '16,16,16', '潜影贝本体是 1×1×1 格 (' + out.hbUp.join(',') + ')');
  check(out.hbUpCount === 1, 'peek 为 0 时只有一个箱体 (' + out.hbUpCount + ')');
  check(out.hbUpMin.join(',') === '0,0,0', '潜影贝 position 0,0,0 水平居中、底面贴地 (' + out.hbUpMin.join(',') + ')');
  check(out.hbPeek100.length === 2, 'peek=100 时多出「打开的壳」这个箱体 (' + out.hbPeek100.length + ')');
  check(JSON.stringify(out.hbPeek100[1]) === '[[0,16,0],[16,32,16]]',
    'direction=up 时壳叠在正上方 (' + JSON.stringify(out.hbPeek100[1]) + ')');
  check(JSON.stringify(out.hbEast[1]) === '[[16,0,0],[32,16,16]]',
    'direction=east 时壳并排在东侧、同样贴地 (' + JSON.stringify(out.hbEast[1]) + ')');
  check(JSON.stringify(out.hbEast[0]) === '[[0,0,0],[16,16,16]]',
    '本体仍然是原点方块那一格 (' + JSON.stringify(out.hbEast[0]) + ')');
  check(out.hbGhast.join(',') === '64,64,64', 'happy_ghast 4×4×4 格 (' + out.hbGhast.join(',') + ')');
  check(out.hbCustom.join(',') === '16,16,16', 'custom 默认箱 1×1×1 格 × scale (' + out.hbCustom.join(',') + ')');

  // ---- 坐标基准 (对齐 CE 官方默认包) ----
  console.log('官方配置对照: 椅子元素 ' + JSON.stringify(out.chairAnchor) + ' 碰撞箱 ' + JSON.stringify(out.chairHb) +
    ' / 长椅元素 ' + JSON.stringify(out.benchAnchor) + ' 座位2 ' + JSON.stringify(out.seat2) +
    ' / 吊篮天花板 元素 ' + JSON.stringify(out.ceilAnchor) + ' 碰撞箱 y ' + JSON.stringify(out.ceilHbY));
  check(JSON.stringify(out.chairAnchor) === '[8,8,8]',
    'wooden_chair: 元素 translation 0,0.5,0 → 方块正中 (' + JSON.stringify(out.chairAnchor) + ')');
  check(JSON.stringify(out.chairHb) === '[[2.4,0,2.4],[13.6,19.2,13.6]]',
    'wooden_chair: 0.7 宽碰撞箱水平居中、从地面起 1.2 高 (' + JSON.stringify(out.chairHb) + ')');
  check(JSON.stringify(out.benchAnchor) === '[16,8,8]',
    'bench: position 0.5,0,0 + translation 0,0.5,0 → 锚点在格边界正中 (' + JSON.stringify(out.benchAnchor) + ')');
  check(JSON.stringify(out.seat2) === '[24,0,6.4]', 'bench: 座位 1,0,-0.1 → 第二格中心 (' + JSON.stringify(out.seat2) + ')');
  check(JSON.stringify(out.ceilAnchor) === '[8,-7.36,8]',
    'flower_basket ceiling: position 0,-0.46,0 → 挂在方块下方 (' + JSON.stringify(out.ceilAnchor) + ')');
  check(JSON.stringify(out.ceilHbY) === '[-11.2,0]', 'flower_basket ceiling: 碰撞箱在方块下方 (' + JSON.stringify(out.ceilHbY) + ')');
  check(JSON.stringify(out.defAnchor) === '[8,0,8]', '元素 position 默认 0,0,0 = 原点方块底部中心 (' + JSON.stringify(out.defAnchor) + ')');

  console.log('旋转矩阵: euler(0,90,0)*x=' + JSON.stringify(out.rotEuler) +
    ' quatY90*x=' + JSON.stringify(out.rotQuat) + ' yaw90*z=' + JSON.stringify(out.rotYaw));
  check(JSON.stringify(out.rotEuler) === '[0,0,-1]', '欧拉 0,90,0 把 +X 转到 -Z (右手系, 与四元数一致)');
  check(JSON.stringify(out.rotQuat) === '[0,0,-1]', '四元数 [0,.707,0,.707] 把 +X 转到 -Z (JOML 右手系)');
  check(JSON.stringify(out.rotYaw) === '[-1,0,0]', 'yaw 90 把 +Z(南) 转到 -X(西) (MC 实体朝向)');
  check(JSON.stringify(out.itemAnchor) === '[8,0,8]', 'item 元素 position 默认在原点方块底部中心 (' + JSON.stringify(out.itemAnchor) + ')');
  check(JSON.stringify(out.blockAnchor) === '[8,0,8]', 'block_display 同样默认底部中心 (' + JSON.stringify(out.blockAnchor) + ')');

  check(out.pickHit === 0, '点击碰撞箱内部能选中它 (index ' + out.pickHit + ')');
  check(out.pickMiss === null, '点击空白处不选中 (' + JSON.stringify(out.pickMiss) + ')');

  // 存图供人工查看
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const ts = Date.now();
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-ground-' + ts + '.png'), Buffer.from(String(out.c1url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-wall-' + ts + '.png'), Buffer.from(String(out.c2url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-center-' + ts + '.png'), Buffer.from(String(out.cCenterUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-yaw0-' + ts + '.png'), Buffer.from(String(out.cR0url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-yaw90-' + ts + '.png'), Buffer.from(String(out.cR90url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('截图 → _ce_shots\\furniture-*-' + ts + '.png');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
