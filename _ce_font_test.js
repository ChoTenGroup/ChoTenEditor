/* ce-preview.js 字体引擎真机测试
 * 用真实的 E:\MC\...\assets 字体文件驱动: 解码 PNG → 假 Image/canvas → 校验字形度量
 * 运行: node _ce_font_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const mcAssets = require('./mc-assets.js');

const MC_ROOT = 'E:\\MC\\Windose\\.minecraft\\versions\\26.3\\26.3\\assets';
let fails = 0;
function check(cond, msg) {
  if (cond) console.log('PASS  ' + msg);
  else { console.log('FAIL  ' + msg); fails++; }
}

// ---------------- PNG 解码 (支持 8/4/2/1 bit, colorType 0/2/3/4/6) ----------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('not png');
  let off = 8, w = 0, h = 0, bitDepth = 8, colorType = 6, palette = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('colorType ' + colorType + ' unsupported');
  if ([1, 2, 4, 8, 16].indexOf(bitDepth) === -1) throw new Error('bitDepth ' + bitDepth);
  const bpp = Math.max(1, Math.ceil(bitDepth * channels / 8));   // 滤波器用字节步长
  const stride = Math.ceil(w * channels * bitDepth / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  let prev = Buffer.alloc(stride);
  const lines = [];
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        v = (v + pr) & 255;
      }
      cur[i] = v;
    }
    lines.push(cur);
    prev = cur;
  }
  // 采样某个通道的原始样本值
  function sample(line, index) {
    if (bitDepth === 8) return line[index];
    if (bitDepth === 16) return line[index * 2];
    const perByte = 8 / bitDepth;
    const byte = line[Math.floor(index / perByte)];
    const shift = 8 - bitDepth * ((index % perByte) + 1);
    const mask = (1 << bitDepth) - 1;
    return (byte >> shift) & mask;
  }
  const rgba = Buffer.alloc(w * h * 4);
  const maxVal = (1 << bitDepth) - 1;
  for (let y = 0; y < h; y++) {
    const line = lines[y];
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (colorType === 3) {
        const idx = sample(line, x);
        const p = palette && palette[idx] ? palette[idx] : [0, 0, 0];
        rgba[di] = p[0]; rgba[di + 1] = p[1]; rgba[di + 2] = p[2];
        rgba[di + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
      } else if (colorType === 6) {
        const o = x * 4;
        rgba[di] = line[o]; rgba[di + 1] = line[o + 1]; rgba[di + 2] = line[o + 2]; rgba[di + 3] = line[o + 3];
      } else if (colorType === 2) {
        const o = x * 3;
        rgba[di] = line[o]; rgba[di + 1] = line[o + 1]; rgba[di + 2] = line[o + 2]; rgba[di + 3] = 255;
      } else if (colorType === 4) {
        const o = x * 2;
        const g = line[o] * (bitDepth === 8 ? 1 : 255 / maxVal);
        rgba[di] = rgba[di + 1] = rgba[di + 2] = Math.round(g);
        rgba[di + 3] = line[o + 1];
      } else {
        const g = sample(line, x) * (bitDepth === 8 ? 1 : 255 / maxVal);
        rgba[di] = rgba[di + 1] = rgba[di + 2] = Math.round(g);
        rgba[di + 3] = 255;
      }
    }
  }
  return { w, h, data: rgba };
}

// ---------------- 假 canvas: 支持 drawImage(image,0,0) + getImageData ----------------
function makeCanvasStub() {
  const cv = { width: 1, height: 1, style: {}, _px: null };
  cv.getContext = () => {
    const ctx = {
      imageSmoothingEnabled: true,
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
      calls: { drawImage: 0, fillRect: 0 },
      fillRect() { this.calls.fillRect++; }, strokeRect() {}, clearRect() {},
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
      clip() {}, fill() {}, stroke() {}, transform() {}, translate() {}, scale() {}, rotate() {},
      drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        this.calls.drawImage++;
        if (arguments.length <= 3 && img && img._pixels) {
          cv._px = { w: img.width, h: img.height, data: img._pixels };
        } else if (img && img._pixels) {
          // 子区域裁剪 (仅测试用: 直接整图)
          cv._px = { w: img.width, h: img.height, data: img._pixels };
        }
      },
      fillText() {}, measureText() { return { width: 6 }; },
      getImageData(x, y, w, h) {
        if (!cv._px) return { data: new Uint8ClampedArray(w * h * 4) };
        if (w === cv._px.w && h === cv._px.h) return { data: cv._px.data };
        // 裁剪视图
        const out = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const sxi = (x + xx), syi = (y + yy);
            if (sxi >= cv._px.w || syi >= cv._px.h) continue;
            const si = (syi * cv._px.w + sxi) * 4, di = (yy * w + xx) * 4;
            out[di] = cv._px.data[si]; out[di + 1] = cv._px.data[si + 1];
            out[di + 2] = cv._px.data[si + 2]; out[di + 3] = cv._px.data[si + 3];
          }
        }
        return { data: out, width: w, height: h };
      },
      createLinearGradient() { return { addColorStop() {} }; },
    };
    return ctx;
  };
  return cv;
}

const pngCache = new Map();
function fakeImage(p) {
  if (pngCache.has(p)) return pngCache.get(p);
  const buf = fs.readFileSync(p);
  const dec = decodePng(buf);
  const im = { width: dec.w, height: dec.h, _pixels: dec.data, onload: null, onerror: null };
  pngCache.set(p, im);
  return im;
}

const electronAPI = {
  readdir: async (p) => {
    try {
      const es = await fs.promises.readdir(p, { withFileTypes: true });
      return { success: true, files: es.map(e => ({ name: e.name, isDirectory: e.isDirectory(), path: path.join(p, e.name) })) };
    } catch (e) { return { success: false }; }
  },
  readFile: async (p) => {
    try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; } catch (e) { return { success: false }; }
  },
  ce: { resolveProjectRoot: async () => ({ found: false }) },
  mc: {
    scanAssets: (r) => mcAssets.scanAssets(r),
    scanNamespace: async (d, n) => ({ ok: true, registry: await mcAssets.scanNamespace(d, n) }),
    readSoundEvents: async (d, l) => ({ ok: true, events: await mcAssets.readSoundEvents(d, l) }),
    readBinary: (p) => mcAssets.readBinaryDataUrl(p),
    readText: (p) => mcAssets.readTextFile(p),
    detectRoots: async () => ({ ok: true, roots: await mcAssets.detectRoots() }),
  },
};

const sandbox = {
  console, Promise, setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number,
  Boolean, RegExp, Error, Map, Set, Uint8ClampedArray, Buffer, isFinite, parseInt, parseFloat,
  electronAPI,
  jsyaml: require('js-yaml'),
  I18N: { lang: 'zh_cn', t: (k) => k },
  localStorage: {
    _d: { editorConfig: JSON.stringify({ mcAssetsPath: MC_ROOT }) },
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  document: {
    createElement(tag) { return tag === 'canvas' ? makeCanvasStub() : { style: {} }; },
    body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
    getElementById: () => null, addEventListener() {}, removeEventListener() {},
  },
  Image: function () {
    const self = this;
    this.onload = null; this.onerror = null; this.width = 0; this.height = 0;
    Object.defineProperty(this, 'src', {
      set(url) {
        try {
          const m = /^data:[^;]+;base64,(.*)$/.exec(String(url));
          if (!m) { if (self.onerror) self.onerror(); return; }
          const buf = Buffer.from(m[1], 'base64');
          const dec = decodePng(buf);
          self.width = dec.w; self.height = dec.h; self._pixels = dec.data;
          setTimeout(() => { if (self.onload) self.onload(); }, 0);
        } catch (e) { if (self.onerror) self.onerror(); }
      },
      get() { return ''; },
    });
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync('ce-mcassets.js', 'utf8'), sandbox, { filename: 'ce-mcassets.js' });
vm.runInContext(fs.readFileSync('ce-preview.js', 'utf8'), sandbox, { filename: 'ce-preview.js' });

(async () => {
  const st = await sandbox.CEMCAssets.init({ mcRoot: MC_ROOT });
  check(st.state === 'ready', 'CEMCAssets 就绪');
  const P = sandbox.CEPreview;
  await P.init({ mcRoot: MC_ROOT });
  await P.fontReady();
  const fontWarnings = P.lastWarnings();
  check(fontWarnings.filter(w => w.indexOf('missing-font-texture') === 0).length === 0,
    '所有字体贴图均已解码 (' + (fontWarnings.join(' | ') || '无警告') + ')');
  check(fontWarnings.length === 0, '字体加载过程无任何警告');

  // 真实度量断言
  const wA = P.measureText('A').width;
  const wI = P.measureText('i').width;
  const wSpace = P.measureText(' ').width;
  const wAA = P.measureText('AA').width;
  console.log('      实测宽度: A=' + wA + ' i=' + wI + ' space=' + wSpace + ' AA=' + wAA + ' "Hello"=' + P.measureText('Hello').width);
  check(wA === 6, "默认字体 'A' 宽度 = 6 (得到 " + wA + ')');
  check(wSpace === 4, "空格宽度 = 4 (得到 " + wSpace + ')');
  check(wAA === 12, "'AA' 宽度 = 12 (得到 " + wAA + ')');
  check(wI === 2, "'i' 宽度 = 2 (得到 " + wI + ')');
  // 逐字符宽度应与整串一致 (可加性)
  const hello = 'Hello';
  let sum = 0;
  const parts = [];
  for (const ch of hello) { const cw = P.measureText(ch).width; parts.push(ch + '=' + cw); sum += cw; }
  console.log('      ' + parts.join(' '));
  check(P.measureText(hello).width === sum,
    "'Hello' 宽度等于逐字符之和 (" + P.measureText(hello).width + ' vs ' + sum + ')');
  check(sum >= 20 && sum <= 30, "'Hello' 宽度在合理范围 (" + sum + ')');
  check(P.measureText('A\nB').height === 18, '两行文本高度 = 18 (得到 ' + P.measureText('A\nB').height + ')');

  // 粗体 +1
  check(P.measureText('<bold>A</bold>').width === 7, '粗体 A 宽度 = 7 (得到 ' + P.measureText('<bold>A</bold>').width + ')');

  // 真实绘制不报错 & 产生绘制调用
  const cv = makeCanvasStub();
  const res = await P.renderScene(cv, { type: 'lore', scale: 2, name: '<gold>Diamond Sword</gold>', lore: ['<gray>A test line</gray>'], showItem: false });
  check(cv.width > 0 && cv.height > 0, 'lore 场景尺寸 ' + cv.width + 'x' + cv.height);
  check((res.warnings || []).filter(w => w.indexOf('missing-font-texture') === 0).length === 0,
    '渲染过程无字体贴图缺失警告 (' + (res.warnings || []).join(' | ') + ')');

  // 物品图标 (真实贴图)
  const ctx = makeCanvasStub().getContext('2d');
  const d1 = await P.drawItem(ctx, 'minecraft:diamond_sword', 0, 0, 16);
  check(d1.kind === 'flat' && !d1.error, 'diamond_sword 平面图标渲染 (' + JSON.stringify(d1) + ')');
  const ctx2 = makeCanvasStub().getContext('2d');
  const d2 = await P.drawItem(ctx2, 'minecraft:stone', 0, 0, 16);
  check(d2.kind === 'block', 'stone 识别为方块模型 (得到 ' + d2.kind + ')');
  check(ctx2.calls.drawImage > 0, 'stone 实际产生了绘制调用 (drawImage=' + ctx2.calls.drawImage + ')');

  // 带 block/ 前缀的 id 不能被拼成 block/block/xxx (用户常这么写)
  const blkA = await P.resolveItemModel('minecraft:block/stone_bricks');
  const blkB = await P.resolveItemModel('minecraft:stone_bricks');
  check(blkA.kind === 'block' && blkA.model.indexOf('block/block/') === -1,
    "resolveItemModel('minecraft:block/stone_bricks') → " + JSON.stringify(blkA));
  check(blkA.model === blkB.model, '带前缀与不带前缀解析到同一模型 (' + blkA.model + ')');
  const stairsM = await P.resolveItemModel('minecraft:block/oak_stairs');
  check(stairsM.kind === 'block' && stairsM.model === 'minecraft:block/oak_stairs',
    'oak_stairs 正确解析 (' + stairsM.model + ')');
  const chesM = await P.resolveItemModel('minecraft:chest');
  check(!!chesM.kind, 'chest 有解析结果 (' + JSON.stringify(chesM) + ')');

  // 方块模型内部诊断
  for (const mid of ['minecraft:block/stone', 'minecraft:block/stone_bricks', 'minecraft:block/oak_stairs', 'minecraft:block/cube_all']) {
    const info = await P.inspectModel(mid);
    console.log('      inspectModel ' + mid + ': ' + JSON.stringify(info));
  }
  const infoSB = await P.inspectModel('minecraft:block/stone_bricks');
  check(infoSB.ok && infoSB.visibleFaces > 0, 'stone_bricks 模型有可见面 (' + infoSB.visibleFaces + ')');

  // 每个 GUI 槽位用的方块物品都应真的画出东西
  for (const id of ['minecraft:stone', 'minecraft:stone_bricks', 'minecraft:oak_stairs', 'minecraft:torch', 'minecraft:redstone_block']) {
    const c3 = makeCanvasStub().getContext('2d');
    const r3 = await P.drawItem(c3, id, 0, 0, 16);
    check(c3.calls.drawImage > 0, 'drawItem(' + id + ') 有绘制 (kind=' + r3.kind + ', drawImage=' + c3.calls.drawImage + ', err=' + (r3.error || '-') + ')');
  }

  // 字形着色/阴影需要真实 canvas 合成, 由 Electron 截图脚本做像素级校验 (见 _ce_tmp/render_shots.js)

  // ---------------- 多资源包工程: 命名空间根不能被互相挤掉 ----------------
  // 回归: 以前 CEMCAssets 每个命名空间只保留一个 root, 工程包会覆盖原版 root,
  // 于是 (a) minecraft:default 字体 JSON 落到不含 font/ 的工程包里 → 整个预览回退点阵字体,
  //      (b) CE images 的 file(minecraft:font/...) 解析到错误的包 → <image:...> 变成小红块。
  await runProjectRootTests(P);

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });

// 构造一个「两个包都带 assets/minecraft」的工程, 验证多根解析与字体图像尺寸
async function runProjectRootTests(P) {
  const tmp = path.join(__dirname, '_ce_tmp', 'multipack_fixture');
  const res = path.join(tmp, 'resources');
  const packA = path.join(res, 'alpha');
  const packB = path.join(res, 'beta');
  fs.mkdirSync(path.join(packA, 'configuration'), { recursive: true });
  fs.mkdirSync(path.join(packB, 'configuration'), { recursive: true });
  // beta 包: 也带一个 assets/minecraft (只有 items/, 没有 font/) —— 用来触发旧 bug
  fs.mkdirSync(path.join(packB, 'resourcepack', 'assets', 'minecraft', 'items'), { recursive: true });
  fs.writeFileSync(path.join(packB, 'resourcepack', 'assets', 'minecraft', 'items', 'beta_thing.json'), '{"model":{"type":"minecraft:model","model":"minecraft:item/stick"}}');
  // alpha 包: 放两张字体图像 (一张单图, 一张 4x4 精灵图)
  fs.writeFileSync(path.join(packB, 'pack.yml'), 'namespace: beta\n');
  fs.writeFileSync(path.join(packA, 'pack.yml'), 'namespace: alpha\n');
  const texDir = path.join(packA, 'resourcepack', 'assets', 'alpha', 'textures', 'font', 'ui');
  fs.mkdirSync(texDir, { recursive: true });
  fs.writeFileSync(path.join(texDir, 'banner.png'), makePng(180, 90));
  fs.writeFileSync(path.join(texDir, 'icons.png'), makePng(64, 64));
  const yml =
    'images:\n' +
    '  alpha:banner:\n' +
    '    height: 45\n' +
    '    ascent: 20\n' +
    '    file: alpha:font/ui/banner.png\n' +
    '  alpha:icons:\n' +
    '    height: 20\n' +
    '    ascent: 18\n' +
    '    file: alpha:font/ui/icons.png\n' +
    '    grid_size: 4,4\n';
  const ymlPath = path.join(packA, 'configuration', 'images.yml');
  fs.writeFileSync(ymlPath, yml);

  const st = await sandbox.CEMCAssets.init({ mcRoot: MC_ROOT, filePath: ymlPath, force: true });
  check(st.state === 'ready', '多包工程: 资源索引就绪');
  check((sandbox.CEMCAssets.nsDirs('minecraft') || []).length >= 2,
    '多包工程: minecraft 保留多个根 (' + (sandbox.CEMCAssets.nsDirs('minecraft') || []).length + ')');
  const fontCands = sandbox.CEMCAssets.resolveCandidates('font', 'minecraft:default');
  check(fontCands.some(p => p.indexOf('26.3') !== -1 || p.replace(/\\/g, '/').indexOf('/assets/minecraft/font/default.json') !== -1 && p.indexOf('resources') === -1),
    '多包工程: minecraft:default 仍能解析到原版字体 JSON');

  await P.init({ mcRoot: MC_ROOT });
  await P.fontReady();
  const wI = P.measureText('i').width;
  check(wI === 2, "多包工程下字体未回退点阵 ('i' 宽度 = " + wI + ', 期望 2)');

  await P.setActiveFile(ymlPath);
  const pd = await P.collectProjectData(true);
  await P.preloadImages();
  const banner = (P.parseText('<image:alpha:banner>', {}).items || []).find(x => x.kind === 'image');
  check(!!(banner && banner.info), '<image:alpha:banner> 已解析出图片 (不再是小占位块)');
  check(!!(banner && banner.info && banner.info.width === 90 && banner.info.height === 45),
    '<image:alpha:banner> 按 height 等比缩放为 90x45 (得到 ' +
    (banner && banner.info ? banner.info.width + 'x' + banner.info.height : 'null') + ')');
  const cell = (P.parseText('<image:alpha:icons:1:2>', {}).items || []).find(x => x.kind === 'image');
  check(!!(cell && cell.info && cell.info.sx === 32 && cell.info.sy === 16),
    '精灵图 <image:alpha:icons:1:2> 选中 (row=1,col=2) 的那一格 (sx/sy = ' +
    (cell && cell.info ? cell.info.sx + '/' + cell.info.sy : 'null') + ', 期望 32/16)');
}

// 生成纯色 PNG (无依赖): w x h 的 RGBA 图
function makePng(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 4 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const i = off + 1 + x * 4;
      raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255;
    }
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff);
}
