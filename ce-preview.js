/* ChoTenEditor Minecraft 风格预览渲染器
 * 依赖(全部可选, 缺失时自动降级): window.CEMCAssets / window.electronAPI.mc / window.I18N / jsyaml
 *
 * 能力:
 *   1) MC 位图字体引擎: 读取原版 font provider(reference/bitmap/space), 支持
 *      MiniMessage、旧版 § 颜色码、CraftEngine 自定义标签
 *      (image / shift / global / i18n / l10n / expr / random / arg / var / papi / bubble 等)
 *   2) 物品/方块图标: 平面物品贴图 + 由原版模型 JSON 生成的等轴测 3D 方块
 *   3) 场景合成: 聊天栏 / 物品悬浮提示(lore) / 原版容器 GUI (9x1~9x6) / 字体图像总览
 *   4) 模型场景 (item-model): 物品/方块模型按 display.<context> (ItemTransform)
 *      完整展开渲染, 支持视角旋转与俯仰 —— 「物品模型的完全预览」
 *   5) 家具场景编辑: 碰撞箱/座位/元素的可拖拽手柄 + 反投影 API (预览内编辑)
 *
 * 对外 API: window.CEPreview
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined' ? globalThis : this);
  if (root.CEPreview) return;

  var VERSION = 1;
  var LINE_HEIGHT = 9;            // MC 文本行高 (Font.lineHeight = 9)
  var SHADOW_FACTOR = 0.25;       // MC 阴影 = 原色 * 0.25 (ARGB.scaleRGB(color, 0.25f))
  var CACHE_CAP = 400;
  var COS30 = Math.cos(Math.PI / 6);
  var SIN30 = Math.sin(Math.PI / 6);

  // ---------------- MiniMessage 具名颜色 (与原版 16 色一致) ----------------
  var NAMED_COLORS = {
    black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00', dark_aqua: '#00AAAA',
    dark_red: '#AA0000', dark_purple: '#AA00AA', gold: '#FFAA00', gray: '#AAAAAA',
    grey: '#AAAAAA', dark_gray: '#555555', dark_grey: '#555555', blue: '#5555FF',
    green: '#55FF55', aqua: '#55FFFF', red: '#FF5555', light_purple: '#FF55FF',
    yellow: '#FFFF55', white: '#FFFFFF'
  };
  // ---------------- 旧版 § 颜色码 ----------------
  var LEGACY_COLORS = {
    '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA', '4': '#AA0000',
    '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA', '8': '#555555', '9': '#5555FF',
    'a': '#55FF55', 'b': '#55FFFF', 'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55',
    'f': '#FFFFFF'
  };
  var LEGACY_FORMATS = { l: 'bold', o: 'italic', n: 'underlined', m: 'strikethrough', k: 'obfuscated' };

  // ---------------- 标签命名空间 ----------------
  // MiniMessage(Adventure) 和 CraftEngine 都用 <>, 必须分开识别与开关:
  //   MM 标签只影响样式/交互 (颜色、装饰、点击悬浮...)
  //   CE 标签会展开成实际内容 (图像、变量、计算、偏移...)
  // 装饰标签的短名/长名都映射到同一个样式键 —— 之前直接把标签名当键写,
  // 于是 <i>/<b>/<u>/<st>/<obf> 全部静默失效 (样式键其实叫 italic/bold/...)。
  var DECOR_ALIASES = {
    bold: 'bold', b: 'bold',
    italic: 'italic', em: 'italic', i: 'italic',
    underlined: 'underlined', u: 'underlined',
    strikethrough: 'strikethrough', st: 'strikethrough',
    obfuscated: 'obfuscated', obf: 'obfuscated'
  };
  // MiniMessage 里「有语义但不改变外观」的标签: 预览中直接吃掉 (点击/悬浮/插入)
  var MM_OPAQUE = { click: 1, hover: 1, insertion: 1 };
  // MiniMessage 里需要显示成灰色占位符的动态标签 (预览无法求值)
  var MM_PLACEHOLDER = { key: 1, selector: 1, score: 1, nbt: 1 };
  // MiniMessage 的翻译标签 (CE 用的是 i18n / l10n)
  var MM_TRANSLATE = { lang: 1, translate: 1 };
  // CraftEngine 扩展标签 (见 CE wiki: reference/text_format)
  var CE_TAGS = {
    shift: 1, image: 1, global: 1, i18n: 1, l10n: 1, expr: 1, random: 1,
    arg: 1, viewer_arg: 1, var: 1, papi: 1, viewer_papi: 1, rel_papi: 1,
    head_texture: 1, bubble: 1, nameplate: 1, background: 1
  };

  // ---------------- 选项 / 状态 ----------------
  var options = {
    mcRoot: null,
    lang: 'zh_cn',
    shadow: true,
    resolveTags: true,          // 总开关
    resolveMiniMessage: true,   // MiniMessage(Adventure) 标签
    resolveCeTags: true,        // CraftEngine 扩展标签
    resolveGlobals: true,
    resolveImages: true,
    // 原版「强制 Unicode 字体」(Force Unicode Font): true = 缺失字形也强制走 unifont
    // (此处即系统合成的 unifont 风格点阵), false = 保持默认 (同样回退合成, 见 glyphFor)。
    // 两个模式当前都回退到合成字形, 区别在于: 强制模式下 ASCII 也按 unicode 页渲染。
    forceUnicode: false
  };
  var _projectData = { images: {}, globals: {}, emojis: {}, langs: {}, furniture: {}, items: {}, blocks: {} };
  // 当前场景视图俯仰 (度): 30 = 等轴测 (缺省), 90 = 正俯视, -90 = 正仰视。
  // scenePitch 与 sceneViewYaw 一起构成视图旋转, 家具场景/模型场景共用;
  // 每个场景渲染入口都会按 scene.pitch 重新赋值 (缺省 30)。
  var scenePitch = 30;
  var _fonts = null;             // minecraft:default glyph map
  var _fontMaps = Object.create(null); // resource id -> glyph map
  var _fontMapLoaded = Object.create(null); // provider-loaded maps; image registration may be provisional
  var _fontMapPromises = Object.create(null); // in-flight provider loads by resource id
  var _fontPromise = null;
  var _fontSettled = false;      // 是否已基于资源就绪完成一次真实加载
  var _readyFired = false;
  var _readyListeners = [];
  var _activeFile = null;
  var _projectCacheKey = null;
  var _imgCache = new Map();
  var _jsonCache = new Map();
  var _modelCache = new Map();
  // CE 运行时生成的模型 (configuration 里 model.generation 声明、资源包上无 json):
  // loadModelChain 磁盘未命中时从这里合成 {parent, textures} —— 与 CE 生成行为一致。
  var _runtimeModels = Object.create(null);
  function registerRuntimeModel(id, modelJson, defaultNs) {
    if (!id || !modelJson || typeof modelJson !== 'object') return false;
    var s = normalizeResourceId(id, defaultNs);
    _runtimeModels[s] = modelJson;
    _modelCache.delete(s);
    return true;
  }
  function runtimeModelOf(id, defaultNs) {
    return _runtimeModels[normalizeResourceId(id, defaultNs)] || null;
  }
  var _warnings = [];

  // ---------------- 小工具 ----------------
  function warn(msg) {
    if (_warnings.indexOf(msg) === -1) _warnings.push(msg);
  }
  function t(key, fb, params) {
    var v = null;
    try {
      if (root.I18N && root.I18N.t) { v = root.I18N.t(key); if (v === key) v = null; }
    } catch (e) { v = null; }
    if (v == null) v = fb != null ? fb : key;
    if (params) v = String(v).replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; });
    return v;
  }
  function cacheSet(map, k, v) {
    if (map.size >= CACHE_CAP) {
      var first = map.keys().next();
      if (!first.done) map.delete(first.value);
    }
    map.set(k, v);
    return v;
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---------- 颜色 ----------
  function parseColor(s) {
    if (typeof s !== 'string') return null;
    var v = s.trim();
    if (NAMED_COLORS[v]) return hexToRgb(NAMED_COLORS[v]);
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return hexToRgb('#' + m[1]);
    m = /^#([0-9a-f]{3})$/i.exec(v);
    if (m) {
      var h = m[1];
      return hexToRgb('#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]);
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (m) {
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  }
  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  function rgbCss(c, alpha) {
    if (!c) return '#FFFFFF';
    var a = alpha == null ? (c.a == null ? 1 : c.a) : alpha;
    return a >= 1 ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'
      : 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function scaleColor(c, f) {
    return { r: Math.round(c.r * f), g: Math.round(c.g * f), b: Math.round(c.b * f), a: c.a == null ? 1 : c.a };
  }
  function lerpColor(a, b, k) {
    return {
      r: Math.round(a.r + (b.r - a.r) * k),
      g: Math.round(a.g + (b.g - a.g) * k),
      b: Math.round(a.b + (b.b - a.b) * k),
      a: 1
    };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      var hue = function (tt) {
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      r = hue(h + 1 / 3); g = hue(h); b = hue(h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: 1 };
  }

  // ---------------- 内置回退字形 (5x7 点阵, 覆盖 ASCII 0x20-0x7E) ----------------
  // 每个字符 5 ?x 7 ? 每位丢? ?5 个字符编?(0-9A-V ?base32 行?
  var FALLBACK_ROWS = {
    'A': '0E11 11 1F11 11 11', 'B': '1E11 11 1E11 11 1E', 'C': '0E11 10 10 10 11 0E',
    'D': '1E11 11 11 11 11 1E', 'E': '1F10 10 1E10 10 1F', 'F': '1F10 10 1E10 10 10',
    'G': '0E11 10 1711 11 0E', 'H': '11 11 11 1F11 11 11', 'I': '1F04 04 04 04 04 1F',
    'J': '07 02 02 02 12 0C', 'K': '11 12 14 1814 12 11', 'L': '10 10 10 10 10 1F',
    'M': '11 1B15 15 11 11 11', 'N': '11 1915 1311 11 11', 'O': '0E11 11 11 11 11 0E',
    'P': '1E11 11 1E10 10 10', 'Q': '0E11 11 11 1512 0D', 'R': '1E11 11 1E14 12 11',
    'S': '0F10 10 0E01 01 1E', 'T': '1F04 04 04 04 04 04', 'U': '11 11 11 11 11 11 0E',
    'V': '11 11 11 11 11 0A04', 'W': '11 11 11 1515 1B11', 'X': '11 11 0A04 0A11 11',
    'Y': '11 11 0A04 04 04 04', 'Z': '1F01 02 04 08 10 1F'
  };

  function buildFallbackFont() {
    var glyphs = Object.create(null);
    var mk = function (ch, rows) {
      // rows: 7 个数? 每个 5 bit
      var px = [];
      for (var y = 0; y < 7; y++) {
        var row = rows[y] | 0;
        var line = [];
        for (var x = 0; x < 5; x++) line.push(((row >> (4 - x)) & 1) ? 1 : 0);
        px.push(line);
      }
      glyphs[ch.codePointAt(0)] = { type: 'fallback', px: px, w: 5, h: 7, advance: 6, ascent: 7 };
    };
    // 数字与字母的点阵数据 (紧凑字面?
    var G = {
      '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
      '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
      '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
      '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
      '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
      'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30],
      'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
      'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
      'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
      'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12],
      'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
      'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 25, 21, 19, 17, 17, 17],
      'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
      'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
      'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
      'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4],
      'W': [17, 17, 17, 21, 21, 27, 17], 'X': [17, 17, 10, 4, 10, 17, 17],
      'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
      '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
      '.': [0, 0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 0, 4, 8],
      ':': [0, 0, 4, 0, 0, 4, 0], ';': [0, 0, 4, 0, 0, 4, 8],
      '-': [0, 0, 0, 31, 0, 0, 0], '_': [0, 0, 0, 0, 0, 0, 31],
      '+': [0, 4, 4, 31, 4, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0],
      '/': [1, 2, 2, 4, 8, 8, 16], '\\': [16, 8, 8, 4, 2, 2, 1],
      '*': [0, 10, 4, 31, 4, 10, 0], '#': [10, 10, 31, 10, 31, 10, 10],
      '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
      '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14],
      '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8],
      "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 20, 0, 0, 0, 0],
      '%': [25, 26, 2, 4, 8, 11, 19], '&': [12, 18, 20, 8, 21, 18, 13],
      '@': [14, 17, 23, 21, 23, 16, 14], '$': [4, 15, 20, 14, 5, 30, 4],
      '~': [0, 0, 8, 21, 2, 0, 0], '^': [4, 10, 17, 0, 0, 0, 0],
      '|': [4, 4, 4, 4, 4, 4, 4], '{': [6, 4, 4, 8, 4, 4, 6], '}': [12, 4, 4, 2, 4, 4, 12]
    };
    Object.keys(G).forEach(function (ch) { mk(ch, G[ch]); });
    glyphs[32] = { type: 'space', w: 0, h: 0, advance: 4, ascent: 7 };
    return glyphs;
  }

  // ---------------- 原版字体加载 ----------------
  function mcApi() {
    var a = root.electronAPI;
    return a && a.mc ? a.mc : null;
  }
  function readText(p) {
    var m = mcApi();
    if (!m || !m.readText) return Promise.resolve(null);
    return m.readText(p).then(function (r) { return (r && r.success) ? r.content : null; }).catch(function () { return null; });
  }
  function readDataUrl(p) {
    var m = mcApi();
    if (!m || !m.readBinary) return Promise.resolve(null);
    return m.readBinary(p).then(function (r) { return (r && r.success) ? r.dataUrl : null; }).catch(function () { return null; });
  }
  function loadImagePath(p) {
    if (!p) return Promise.resolve(null);
    if (_imgCache.has(p)) return _imgCache.get(p);
    var pr = readDataUrl(p).then(function (url) {
      if (!url || typeof Image === 'undefined') return null;
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { res(null); };
        im.src = url;
      });
    }).catch(function () { return null; });
    return cacheSet(_imgCache, p, pr);
  }
  function loadJsonPath(p) {
    if (!p) return Promise.resolve(null);
    if (_jsonCache.has(p)) return _jsonCache.get(p);
    var pr = readText(p).then(function (txt) {
      if (!txt) return null;
      try { return JSON.parse(txt); } catch (e) { return null; }
    }).catch(function () { return null; });
    return cacheSet(_jsonCache, p, pr);
  }
  // .mcmeta (动画/纹理元数据): 与贴图同目录同名, 后缀 .mcmeta
  async function loadTextureMeta(texturePath) {
    var p = String(texturePath || '');
    if (!p) return null;
    return await loadJsonPath(p.replace(/\.png$/i, '') + '.mcmeta');
  }
  // 带动画 (.mcmeta animation) 的贴图是纵向帧条: 整张直接画会把所有帧叠在一起。
  // 这里按 animation 声明 (或宽高推断) 裁出单帧, 供静态图标/模型 UV 使用。
  // 返回 { img, sw, sh, sx, sy }; 非动画贴图返回 null (调用方按整图绘制)。
  async function spriteFrameOf(img, texturePath) {
    try {
      if (!img || !img.width || !img.height) return null;
      var meta = await loadTextureMeta(texturePath);
      var anim = meta && meta.animation;
      if (!anim) return null;
      var fw = anim.width != null ? anim.width : img.width;      // mc 帧宽默认 = 贴图宽
      var fh = anim.height != null ? anim.height : img.width;    // 帧高默认 = 帧宽 (纵向条)
      if (!(fw > 0) || !(fh > 0) || fw > img.width || fh > img.height) return null;
      // 帧数 = 总高 / 帧高; interpolate 等参数只影响播放, 静态预览取第一帧即可
      var frames = Math.floor(img.height / fh + 1e-6);
      if (frames <= 1) return null;
      return { img: img, sw: fw, sh: fh, sx: 0, sy: 0 };
    } catch (e) { return null; }
  }
  function assets() { return root.CEMCAssets || null; }
  function activeNamespace() {
    var A = assets();
    try { return A && A.currentNamespace ? A.currentNamespace() : null; } catch (e) { return null; }
  }
  function normalizeResourceId(id, defaultNs) {
    var s = String(id == null ? '' : id).trim().replace(/\\/g, '/');
    if (!s) return '';
    var i = s.indexOf(':');
    if (i > 0) return s;
    var ns = defaultNs || activeNamespace() || 'minecraft';
    return String(ns).replace(/:$/, '') + ':' + s;
  }
  function resourceNamespace(id, fallback) {
    var s = String(id || '');
    var i = s.indexOf(':');
    return i > 0 ? s.slice(0, i) : (fallback || activeNamespace() || 'minecraft');
  }
  function resourcePath(id) {
    var s = String(id || '');
    var i = s.indexOf(':');
    return i > 0 ? s.slice(i + 1) : s;
  }
  function resolvePath(kind, id) {
    var A = assets();
    return A && A.resolve ? A.resolve(kind, id) : null;
  }
  // 同一个资源 id 可能在多个资源包里都有（当前工程包 / 其它包 / 原版），
  // 只取第一个路径会读错包（<image:...> 变成「找不到图片」小红块、字体回退点阵）。
  // 这里返回全部候选路径，由调用方按顺序尝试读取。
  function resolveCandidates(kind, id) {
    var A = assets();
    if (A && A.resolveCandidates) {
      var list = A.resolveCandidates(kind, id);
      if (list && list.length) return list;
    }
    var p = resolvePath(kind, id);
    return p ? [p] : [];
  }
  function nsDirsOf(ns) {
    var A = assets();
    ns = ns || 'minecraft';
    if (A && A.nsDirs) { var l = A.nsDirs(ns); if (l && l.length) return l; }
    if (A && A.nsDir) { var d0 = A.nsDir(ns); if (d0) return [d0]; }
    return [];
  }
  // 依次尝试候选路径，返回第一个真正读到的图片
  async function loadImageAny(kind, id) {
    var cands = resolveCandidates(kind, id);
    for (var i = 0; i < cands.length; i++) {
      var img = await loadImagePath(cands[i]);
      if (img) return img;
    }
    return null;
  }
  // 带路径的加载: 命中哪个候选就返回它 (供 .mcmeta 按「贴图路径 + .mcmeta」查找)
  async function loadImageAnyWithPath(kind, id) {
    var cands = resolveCandidates(kind, id);
    for (var i = 0; i < cands.length; i++) {
      var img = await loadImagePath(cands[i]);
      if (img) return { img: img, path: cands[i] };
    }
    return null;
  }
  // 贴图加载 (动画感知): 命中图 + 若是 .mcmeta 动画帧条则裁出第一帧。
  // 返回 { img, sw, sh, sx, sy } 或 null; sw/sh/sx/sy 缺省 = 整图。
  async function loadTextureFrame(kind, id) {
    var hit = await loadImageAnyWithPath(kind, id);
    if (!hit) return null;
    var fr = await spriteFrameOf(hit.img, hit.path);
    if (fr) return fr;
    var img = hit.img;
    return { img: img, sw: img.width, sh: img.height, sx: 0, sy: 0 };
  }
  async function loadJsonAny(kind, id) {
    var cands = resolveCandidates(kind, id);
    for (var i = 0; i < cands.length; i++) {
      var j = await loadJsonPath(cands[i]);
      if (j) return j;
    }
    return null;
  }
  // provider ?file 字段?namespace:path (可带 textures/ 前缀)
  function fontTextureCandidates(fileRef, defaultNs) {
    var s = String(fileRef || '');
    var i = s.indexOf(':');
    var ns = i === -1 ? (defaultNs || 'minecraft') : s.slice(0, i);
    var p = i === -1 ? s : s.slice(i + 1);
    p = p.replace(/^textures\//, '');
    p = p.replace(/\.png$/i, '');
    return resolveCandidates('texture', ns + ':' + p);
  }
  function fontTexturePath(fileRef, defaultNs) {
    return fontTextureCandidates(fileRef, defaultNs)[0] || null;
  }
  function fontJsonPath(id) {
    return resolvePath('font', normalizeResourceId(id, 'minecraft:default'.split(':')[0]));
  }

  function loadFontMap(fontId, addFallback) {
    var id = normalizeResourceId(fontId, 'minecraft');
    if (!id) id = 'minecraft:default';
    if (_fontMapLoaded[id]) return Promise.resolve(_fontMaps[id]);
    if (_fontMapPromises[id]) return _fontMapPromises[id];
    var promise = (async function () {
      var provisional = _fontMaps[id] || null;
      var glyphs = Object.create(null);
      var seenFonts = Object.create(null);
      var chain = [];
      try { await expandFont(id, 0, seenFonts, chain, resourceNamespace(id, 'minecraft')); } catch (e) { warn('font-load-failed: ' + (e && e.message)); }
      for (var i = 0; i < chain.length; i++) {
        var prov = chain[i];
        if (prov.type === 'space') {
          var adv = prov.advances || {};
          Object.keys(adv).forEach(function (ch) {
            var cp = ch.codePointAt(0);
            glyphs[cp] = { type: 'space', w: 0, h: 0, advance: adv[ch] | 0, ascent: 7 };
          });
        } else if (prov.type === 'bitmap') {
          await loadBitmapProvider(prov, glyphs, resourceNamespace(id));
        }
      }
      if (addFallback !== false) {
        var fb = buildFallbackFont();
        Object.keys(fb).forEach(function (k) { if (!glyphs[k]) glyphs[k] = fb[k]; });
      }
      // Image registration may have created a provisional map before providers load.
      // Provider glyphs stay authoritative; only fill genuinely missing codepoints.
      if (provisional) Object.keys(provisional).forEach(function (k) {
        if (!glyphs[k]) glyphs[k] = provisional[k];
      });
      _fontMaps[id] = glyphs;
      _fontMapLoaded[id] = true;
      delete _fontMapPromises[id];
      return glyphs;
    })();
    _fontMapPromises[id] = promise;
    return promise;
  }

  function loadFontData() {
    if (_fontPromise) return _fontPromise;
    var A = assets();
    if (A && A.status && A.status().state !== 'ready' && !_fontSettled) {
      warn('assets-not-ready');
      if (A.onReady) A.onReady(function () { _fontSettled = true; _fonts = null; _fontMaps = Object.create(null); _fontMapLoaded = Object.create(null); _fontMapPromises = Object.create(null); _fontPromise = null; });
      return Promise.resolve(buildFallbackFont());
    }
    _fontSettled = true;
    _fontPromise = (async function () {
      var glyphs = await loadFontMap('minecraft:default');
      _fonts = glyphs;
      await loadUnihex();                     // 缺字合成数据, 不阻塞主字体表返回
      var ids = [];
      try { ids = A && A.listFor ? (A.listFor('fonts') || []) : []; } catch (e) { ids = []; }
      for (var i = 0; i < ids.length; i++) {
        if (normalizeResourceId(ids[i], 'minecraft') === 'minecraft:default') continue;
        await loadFontMap(ids[i]);
      }
      return glyphs;
    })();
    return _fontPromise;
  }

  async function expandFont(fontId, depth, seenFonts, out, defaultNs) {
    var id = normalizeResourceId(fontId, defaultNs || resourceNamespace(fontId, 'minecraft'));
    if (depth > 4 || seenFonts[id]) return;
    seenFonts[id] = 1;
    var json = await loadJsonAny('font', id);
    if (!json || !Array.isArray(json.providers)) return;
    var ns = resourceNamespace(id, defaultNs || 'minecraft');
    for (var i = 0; i < json.providers.length; i++) {
      var prov = json.providers[i];
      if (!prov || typeof prov !== 'object') continue;
      if (prov.type === 'reference') {
        await expandFont(prov.id, depth + 1, seenFonts, out, ns);
      } else {
        prov = Object.assign({}, prov);
        prov._fontNamespace = ns;
        out.push(prov);
      }
    }
  }

  async function loadBitmapProvider(prov, glyphs, defaultNs) {
    var cands = fontTextureCandidates(prov.file, prov._fontNamespace || defaultNs || 'minecraft');
    var img = null;
    for (var ci = 0; ci < cands.length && !img; ci++) img = await loadImagePath(cands[ci]);
    if (!img) { warn('missing-font-texture: ' + prov.file); return; }
    var chars = Array.isArray(prov.chars) ? prov.chars : null;
    if (!chars || !chars.length) return;
    // 注意: 原版的 chars 用 codePoints() 统计列数 (代理对算 1 个),
    // 直接用 String.length 会把 U+1F300 之类的字符算成 2 列,
    // 导致格子宽度被腰斩、整个 provider 的字形都被压窄。
    var rowCount = chars.length;
    var rows = [];
    var colCount = 0;
    for (var i = 0; i < rowCount; i++) {
      var cps = decodeChars(chars[i]);
      rows.push(cps);
      colCount = Math.max(colCount, cps.length);
    }
    if (!colCount) return;
    var cellW = img.width / colCount;
    var cellH = img.height / rowCount;
    // 原版 BitmapProvider 的定义: `height` 缺省值是 8 (不是格子高度),
    // 渲染时按 scale = height / 格子高度 缩放。CE 生成的 provider 一定会写 height,
    // 但第三方字体包常常省略, 之前用格子高度兜底会让字形整体偏大/偏小。
    var rawH = prov.height != null ? Number(prov.height) : 8;
    if (!isFinite(rawH)) { warn('invalid-font-height: ' + prov.height); rawH = 8; }
    var ascent = prov.ascent != null ? Number(prov.ascent) : rawH - 1;
    if (!isFinite(ascent)) { warn('invalid-font-ascent: ' + prov.ascent); ascent = rawH - 1; }
    var offsetOnly = imageOffsetOnly(rawH, ascent);
    var renderH = imageRenderHeight(rawH, 8);
    if (rawH === 0) warn('invalid-font-height: ' + prov.height);
    var scale = cellH > 0 ? renderH / cellH : 1;
    var rawScale = cellH > 0 ? rawH / cellH : rawH;
    // 整张图一次取出像? 避免每个字形都做丢?canvas 操作
    var atlas = atlasPixels(img);
    for (var r = 0; r < rowCount; r++) {
      var row = rows[r];                   // 已解码的码位数组
      for (var c = 0; c < row.length; c++) {
        var cp = row[c];
        if (!cp) continue;                 // \u0000 = 无字?
        if (glyphs[cp]) continue;          // 先出现的 provider 优先
        var x0 = c * cellW;
        var y0 = r * cellH;
        var trimmed = atlas ? trimmedWidth(atlas, x0, y0, cellW, cellH) : 0;
        glyphs[cp] = {
          type: 'bitmap', img: img,
          sx: x0, sy: y0, sw: cellW, sh: cellH,
          w: Math.round(cellW * scale), h: Math.round(renderH),
          advance: mcGlyphAdvance(trimmed, rawScale),
          ascent: ascent,
          offsetOnly: offsetOnly,
          rawHeight: rawH,
          renderHeight: renderH
        };
      }
    }
  }
  // 把整张贴图读进内?(只做丢?canvas 操作)
  function atlasPixels(img) {
    try {
      if (typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      return { data: ctx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
    } catch (e) {
      warn('atlas-read-failed: ' + (e && e.message));
      return null;
    }
  }
  function trimmedWidth(atlas, x0, y0, w, h) {
    var x1 = Math.min(atlas.w, Math.ceil(x0 + w));
    var y1 = Math.min(atlas.h, Math.ceil(y0 + h));
    var sx = Math.max(0, Math.floor(x0));
    var sy = Math.max(0, Math.floor(y0));
    for (var x = x1 - 1; x >= sx; x--) {
      for (var y = sy; y < y1; y++) {
        if (atlas.data[(y * atlas.w + x) * 4 + 3] > 0) return x - sx + 1;
      }
    }
    return 0;
  }
  // 把一行 chars 解成码位数组 (支持混合的 \\uXXXX 转义串, 并合并 UTF-16 代理对)
  function decodeChars(str) {
    var s = String(str == null ? '' : str);
    var units = [];
    for (var i = 0; i < s.length;) {
      if (s.charAt(i) === '\\' && s.charAt(i + 1) === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
        units.push(parseInt(s.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      var cp = s.codePointAt(i);
      units.push(cp);
      i += cp > 0xFFFF ? 2 : 1;
    }
    return units;
  }
  // 统计一行 chars 的码位数 (CE / MC 都按码位分列)
  function countCodepoints(str) {
    return decodeChars(str).length;
  }
  // 用采样法估算字形实际占用的像素宽?(旧字形实? 保留给外部调试使?
  function measureTrimmed(img, x0, y0, w, h) {
    if (!img) return 0;
    try {
      if (typeof document === 'undefined') return 0;
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(w));
      cv.height = Math.max(1, Math.ceil(h));
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, x0, y0, w, h, 0, 0, cv.width, cv.height);
      var data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (var x = cv.width - 1; x >= 0; x--) {
        for (var y = 0; y < cv.height; y++) {
          if (data[(y * cv.width + x) * 4 + 3] > 0) return x + 1;
        }
      }
 } catch (e) { /* tainted canvas ?*/ }
    return 0;
  }

  // ---------------- 文本解析 ----------------
  // 产出 item 列表: {kind:'glyph'|'space'|'image'|'break', cp, style, ...}

  function cloneStyle(s) {
    return {
      color: s.color, bold: s.bold, italic: s.italic, underlined: s.underlined,
      strikethrough: s.strikethrough, obfuscated: s.obfuscated,
      font: s.font, shadow: s.shadow, gradId: s.gradId
    };
  }
  function defaultStyle() {
    return { color: { r: 255, g: 255, b: 255, a: 1 }, shadow: true };
  }

  /**
   * 解析带标签的文本, 产出样式化字形序列
   * @returns {items: Array, width:number, height:number}
   */
  function parseText(text, opts) {
    var o = opts || {};
    var resolveTags = o.resolveTags !== false && options.resolveTags !== false;
    // 两个命名空间各自可关: 关掉时标签按普通文本原样显示 (方便看到原始配置)
    var mmOn = resolveTags && o.resolveMiniMessage !== false && options.resolveMiniMessage !== false;
    var ceOn = resolveTags && o.resolveCeTags !== false && options.resolveCeTags !== false;
    o = Object.assign({}, o, { mmOn: mmOn, ceOn: ceOn });
    var items = [];
    var style = o.style ? cloneStyle(o.style) : defaultStyle();
    if (o.baseColor) style.color = o.baseColor;
    var grads = {};        // gradId -> {type:'gradient'|'rainbow', stops, phase, reversed}
    var gradSeq = 0;
    var fontStack = [];
    var lines = [];        // 行高累计
    var lineH = LINE_HEIGHT;
    var lineCount = 1;

    var s = String(text == null ? '' : text);
    var i = 0;
    var guard = 0;
    while (i < s.length && guard++ < 200000) {
      var ch = s[i];
      // ---- 转义 ----
      if (ch === '\\' && i + 1 < s.length && (s[i + 1] === '<' || s[i + 1] === '\\' || s[i + 1] === '&')) {
        pushGlyph(items, s[i + 1], style);
        i += 2; continue;
      }
      // ---- 旧版 § 颜色码 ----
      if (ch === '\u00a7' && i + 1 < s.length) {
        var code = s[i + 1].toLowerCase();
        if (LEGACY_COLORS[code]) {
          style.color = hexToRgb(LEGACY_COLORS[code]);
          style.bold = style.italic = style.underlined = style.strikethrough = style.obfuscated = false;
          i += 2; continue;
        }
        if (LEGACY_FORMATS[code]) { style[LEGACY_FORMATS[code]] = true; i += 2; continue; }
        if (code === 'r') { style = defaultStyle(); i += 2; continue; }
      }
      // ---- & 颜色码 (部分配置文件使用) ----
      if (ch === '&' && i + 1 < s.length && /^[0-9a-fk-or]$/i.test(s[i + 1])) {
        var c2 = s[i + 1].toLowerCase();
        if (LEGACY_COLORS[c2]) { style.color = hexToRgb(LEGACY_COLORS[c2]); i += 2; continue; }
        if (LEGACY_FORMATS[c2]) { style[LEGACY_FORMATS[c2]] = true; i += 2; continue; }
        if (c2 === 'r') { style = defaultStyle(); i += 2; continue; }
      }
      // ---- 换行 ----
      if (ch === '\n') {
        items.push({ kind: 'break' });
        lineCount++;
        i++; continue;
      }
      // ---- MiniMessage / CE 标签 ----
      if (ch === '<' && resolveTags) {
        var close = findTagEnd(s, i);
        if (close > i) {
          var raw = s.slice(i + 1, close);
          var handled = applyTag(raw, style, grads, function (g) { gradSeq = Math.max(gradSeq, g); },
            items, o, fontStack);
          if (handled) {
            if (handled === 'break') { lineCount++; }
            if (handled === 'consumed') { /* nothing */ }
            i = close + 1;
            continue;
          }
        }
      }
      // ---- 普通字符 ----
      var cp = s.codePointAt(i);
      var clen = cp > 0xFFFF ? 2 : 1;
      pushGlyph(items, s.slice(i, i + clen), style);
      i += clen;
    }
    // ---- 渐变着色 ----
    applyGradients(items, grads);
    // ---- 测量 ----
    var font = glyphsSync();
    var width = 0, maxW = 0, maxH = lineH;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it.kind === 'break') { maxW = Math.max(maxW, width); width = 0; maxH += lineH; continue; }
      width += itemAdvance(it);
    }
    maxW = Math.max(maxW, width);
    return { items: items, width: maxW, height: maxH, lines: Math.max(1, maxH / lineH) };
  }

  function pushGlyph(items, str, style) {
    var cp = str.codePointAt(0);
    items.push({ kind: 'glyph', cp: cp, ch: str, style: cloneStyle(style), gradId: style.gradId });
  }

  function findTagEnd(s, start) {
    // <tag> / <tag:arg> / <tag:'a:b'> ; 只在遇到 ' 时跳?
    var quote = null;
    for (var i = start + 1; i < s.length; i++) {
      var c = s[i];
      if (c === '\n') return -1;
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"') { quote = c; continue; }
      if (c === '>') return i;
      if (c === '<') return -1;
    }
    return -1;
  }

  // 将内?MiniMessage 样式?(?"'<!shadow><white>'") 应用到临时样?
  function styleFromFormat(fmt, base) {
    var st = cloneStyle(base);
    if (!fmt) return st;
    var inner = String(fmt).trim();
    if ((inner.charAt(0) === "'" && inner.charAt(inner.length - 1) === "'") ||
        (inner.charAt(0) === '"' && inner.charAt(inner.length - 1) === '"')) {
      inner = inner.slice(1, -1);
    }
    var re = /<([^<>]*)>/g;
    var m;
    while ((m = re.exec(inner)) !== null) {
      var nm = m[1].replace(/^\//, '');
      var negated = nm.charAt(0) === '!';
      if (negated) nm = nm.slice(1);
      var low = nm.toLowerCase();
      var deco = DECOR_ALIASES[low];
      if (deco) { st[deco] = !negated; continue; }
      if (low === 'shadow') { st.shadow = !negated; continue; }
      if (NAMED_COLORS[low]) { if (!negated) st.color = hexToRgb(NAMED_COLORS[low]); continue; }
      var hex = parseColor(low);
      if (hex && /^#/.test(low)) { if (!negated) st.color = hex; continue; }
    }
    return st;
  }

  var _gradCounter = 0;
  /**
   * 处理一个标签
   * @returns {string|undefined|boolean} 处理结果: 'break' 表示换行, true 表示已消费
   */
  // 把「无法求值的动态标签」显示成灰色占位符, 让用户看得见这里有什么
  function pushPlaceholder(items, text, style) {
    var st = cloneStyle(style);
    st.color = hexToRgb('#7F7F7F');
    st.shadow = false;
    for (var i = 0; i < text.length; i++) pushGlyph(items, text[i], st);
  }

  function applyTag(raw, style, grads, bump, items, o, fontStack) {
    var name = raw;
    var arg = '';
    var ci = raw.indexOf(':');
    if (ci !== -1) { name = raw.slice(0, ci); arg = raw.slice(ci + 1); }
    name = name.trim();
    var closing = false, negated = false;
    // </i> / <!i> / <!/i> 三种关闭写法都要认 (前缀顺序任意)
    for (var pass = 0; pass < 2; pass++) {
      if (name.charAt(0) === '/') { closing = true; name = name.slice(1); }
      else if (name.charAt(0) === '!') { negated = true; name = name.slice(1); }
      else break;
    }
    var low = name.toLowerCase();
    var off = closing || negated;
    var mm = o.mmOn !== false;   // MiniMessage 命名空间是否启用
    var ce = o.ceOn !== false;   // CraftEngine 命名空间是否启用

    // ==================== MiniMessage ====================
    // 装饰: <i>/<italic>/<em> ... ; <!i>/</i>  = 去掉该样式
    var deco = DECOR_ALIASES[low];
    if (deco) {
      if (!mm) return false;
      style[deco] = !off;
      return true;
    }
    if (low === 'reset') {
      if (!mm) return false;
      var d = defaultStyle();
      Object.keys(d).forEach(function (k) { style[k] = d[k]; });
      style.bold = style.italic = style.underlined = style.strikethrough = style.obfuscated = false;
      style.gradId = null;
      return true;
    }
    if (low === 'newline' || low === 'br') {
      if (!mm) return false;
      items.push({ kind: 'break' });
      return 'break';
    }
    // 阴影: <shadow> / <!shadow> / </shadow> / <shadow:#rrggbb>
    if (low === 'shadow') {
      if (!mm) return false;
      style.shadow = !off;
      if (!off && arg) { var sc = parseColor(unquote(arg)); if (sc) style.shadowColor = sc; }
      return true;
    }
    // 颜色
    if (low === 'color' || low === 'colour') {
      if (!mm) return false;
      if (off) { style.color = null; return true; }
      var c = parseColor(unquote(arg));
      if (c) style.color = c;
      return true;
    }
    if (NAMED_COLORS[low]) {
      if (!mm) return false;
      style.color = off ? null : hexToRgb(NAMED_COLORS[low]);
      return true;
    }
    var hx = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(low);
    if (hx) {
      if (!mm) return false;
      style.color = off ? null : parseColor(low);
      return true;
    }
    if (low === 'font') {
      if (!mm) return false;
      if (off) {
        style.font = fontStack && fontStack.length ? fontStack.pop() : null;
      } else {
        if (fontStack) fontStack.push(style.font || null);
        style.font = unquote(arg);
      }
      return true;
    }

    // 渐变 / 彩虹 / 过渡
    if (low === 'gradient' || low === 'rainbow' || low === 'transition') {
      if (!mm) return false;
      if (off) { style.gradId = null; return true; }
      var id = '$g' + (++_gradCounter);
      if (low === 'rainbow') {
        grads[id] = { type: 'rainbow', phase: parseFloat(unquote(arg)) || 0 };
      } else {
        var stops = splitArgs(arg).map(function (x) { return parseColor(unquote(x)); }).filter(Boolean);
        grads[id] = { type: low === 'transition' ? 'transition' : 'gradient', stops: stops.length ? stops : [hexToRgb('#FFFFFF')] };
      }
      style.gradId = id;
      return true;
    }

    // 点击 / 悬浮 / 插入: 改变的是交互而非外观, 预览里直接消费掉
    if (MM_OPAQUE[low]) {
      if (!mm) return false;
      return true;
    }
    // 翻译: 先查工程译文, 查不到就灰占位
    if (MM_TRANSLATE[low]) {
      if (!mm) return false;
      var tval = langLookup(unquote(arg));
      if (tval != null) { parseTextInto(tval, style, items, grads, o); return true; }
      pushPlaceholder(items, '<' + low + ':' + arg + '>', style);
      return true;
    }
    // 键位 / 选择器 / 计分板 / NBT: 预览无法求值 → 灰占位
    if (MM_PLACEHOLDER[low]) {
      if (!mm) return false;
      pushPlaceholder(items, '<' + low + ':' + arg + '>', style);
      return true;
    }

    // ==================== CraftEngine ====================
    if (!ce) return false;
    if (low === 'shift') {
      var px = null;
      if (/^-?\d+(\.\d+)?$/.test(unquote(arg))) px = parseFloat(unquote(arg));
      else if (options.mcRoot) px = null;
      if (px != null && isFinite(px)) {
        items.push({ kind: 'shift', dx: px, style: cloneStyle(style) });
        return true;
      }
      // 无法解析时按 0 处理 (offset-characters 未配?)
      items.push({ kind: 'shift', dx: 0, style: cloneStyle(style) });
      return true;
    }
    if (low === 'image') {
      var parts = splitArgs(arg).map(function (x) { return unquote(x); });
      var imgId = parts.length >= 2 ? parts[0] + ':' + parts[1] : (parts[0] || '');
      var row = parts.length >= 4 ? parseInt(parts[2], 10) : null;
      var col = parts.length >= 4 ? parseInt(parts[3], 10) : null;
      var fmt = parts.length >= 4 ? parts[4] : (parts.length === 3 ? parts[2] : null);
      var st2 = fmt ? styleFromFormat(fmt, style) : cloneStyle(style);
      var info = options.resolveImages === false ? null : imageGlyph(imgId, row, col);
      items.push({
        kind: 'image', id: imgId, row: row, col: col,
        info: info, style: st2, tag: '<image:' + arg + '>'
      });
      return true;
    }
    if (low === 'global') {
      var ga = splitArgs(arg).map(function (x) { return x; });
      var gid = unquote(ga[0] || '');
      if (options.resolveGlobals !== false && _projectData.globals[gid] != null) {
        var body = String(_projectData.globals[gid]);
        // 支持 <arg:0> 等索引参?
        var args = ga.slice(1).map(function (x) { return unquote(x); });
        body = body.replace(/<arg:(\d+)>/g, function (m, idx) {
          var v = args[parseInt(idx, 10)];
          return v != null ? v : m;
        });
        var sub = parseTextInto(body, style, items, grads, o);
        return true;
      }
      // 未定? 原样保留
      return false;
    }
    // CE 的 i18n(服务端语言) / l10n(客户端语言); MiniMessage 的 lang/translate 已在上方处理
    if (low === 'i18n' || low === 'l10n') {
      var key = unquote(arg);
      var val = langLookup(key);
      if (val != null) { parseTextInto(val, style, items, grads, o); return true; }
      return false;
    }
    if (low === 'expr') {
      var ea = splitArgs(arg);
      var fmt = unquote(ea[0]);
      var expr = ea.length > 1 ? unquote(ea.slice(1).join(':')) : '';
      var r = evalExpr(expr);
      if (r !== null) {
        var txt = fmt === 'bool' ? (r ? 'true' : 'false')
          : (fmt ? formatNumber(r, fmt) : String(Math.round(r * 100) / 100));
        parseTextInto(txt, style, items, grads, o);
        return true;
      }
      return false;
    }
    if (low === 'random') {
      var ra = splitArgs(arg);
      var rid = unquote(ra[0] || 'random');
      var val2 = randomRoll(rid, ra.slice(1).map(function (x) { return unquote(x); }));
      if (val2 !== null) { parseTextInto(val2, style, items, grads, o); return true; }
      return false;
    }
    if (low === 'arg' || low === 'viewer_arg' || low === 'var' || low === 'papi' ||
        low === 'viewer_papi' || low === 'rel_papi') {
      // papi 支持 <papi:name:default> —— 预览里没有 PlaceholderAPI, 有默认值就显示默认值
      if (low === 'papi' || low === 'viewer_papi' || low === 'rel_papi') {
        var pa = splitArgs(arg);
        if (pa.length >= 2) {
          parseTextInto(unquote(pa[1]), style, items, grads, o);
          return true;
        }
      }
      pushPlaceholder(items, '<' + low + ':' + arg + '>', style);
      return true;
    }
    if (low === 'head_texture') {
      items.push({ kind: 'head', style: cloneStyle(style), hash: unquote(arg) });
      return true;
    }
    if (low === 'bubble' || low === 'nameplate' || low === 'background') {
      // 形如 <bubble:id:left:right:'text'> ?只渲染文本参?
      var ba = splitArgs(arg);
      if (ba.length) {
        var bodyTxt = unquote(ba[ba.length - 1]);
        parseTextInto(bodyTxt, style, items, grads, o);
        return true;
      }
      return false;
    }
    return false;
  }

  function parseTextInto(text, style, items, grads, o) {
    var tmp = parseText(text, Object.assign({}, o, { style: style }));
    // 合并 (保持目标数组)
    for (var i = 0; i < tmp.items.length; i++) items.push(tmp.items[i]);
    return true;
  }
  function unquote(s) {
    s = String(s == null ? '' : s).trim();
    if (s.length >= 2) {
      var a = s.charAt(0), b = s.charAt(s.length - 1);
      if ((a === "'" && b === "'") || (a === '"' && b === '"')) return s.slice(1, -1);
    }
    return s;
  }
  function splitArgs(arg) {
    // ?: 分隔, 但引号内?: 不切
    var out = [];
    var cur = '';
    var q = null;
    for (var i = 0; i < String(arg).length; i++) {
      var c = arg[i];
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; cur += c; continue; }
      if (c === ':') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  // 箢易表达式求?(仅支持数字四则运算与比较, ?<expr:> 预览)
  function evalExpr(expr) {
    var e = String(expr || '').trim();
    if (!e) return null;
    if (!/^[-+*/%().\d\s<>=!&|]+$/.test(e)) return null;
    if (/[<>]=?|==|!=/.test(e)) {
      try {
        var parts = e.split(/(>=|<=|==|!=|>|<)/);
        if (parts.length === 3) {
          var a = safeNum(parts[0]), b = safeNum(parts[2]);
          if (a === null || b === null) return null;
          switch (parts[1]) {
            case '>': return a > b; case '<': return a < b;
            case '>=': return a >= b; case '<=': return a <= b;
            case '==': return a === b; case '!=': return a !== b;
          }
        }
      } catch (err) { return null; }
      return null;
    }
    try {
      /* eslint-disable no-new-func */
      var v = Function('"use strict";return (' + e + ');')();
      return (typeof v === 'number' && isFinite(v)) ? v : null;
    } catch (err) { return null; }
  }
  function safeNum(x) {
    var v = parseFloat(String(x).trim());
    return isNaN(v) ? null : v;
  }
  function formatNumber(v, fmt) {
    var m = /^(0*)(?:\.(0+))?$/.exec(fmt);
    if (!m) return String(v);
    var dec = m[2] ? m[2].length : 0;
    return dec ? v.toFixed(dec) : String(Math.round(v));
  }
  var _randCache = Object.create(null);
  function randomRoll(id, args) {
    if (_randCache[id] !== undefined) return _randCache[id];
    var type = 'uniform', nums = [];
    if (args.length === 1 && /^-?\d+(\.\d+)?~-?\d+(\.\d+)?$/.test(args[0])) {
      nums = args[0].split('~').map(parseFloat);
    } else if (args.length === 1 && /^-?\d+(\.\d+)?$/.test(args[0])) {
      nums = [parseFloat(args[0]), parseFloat(args[0])];
    } else if (args.length >= 2) {
      type = args[0];
      nums = args.slice(1).map(function (x) { return parseFloat(x); }).filter(function (x) { return !isNaN(x); });
    }
    var v = null;
    try {
      if (type === 'fixed' || type === 'constant') v = nums[0] || 0;
      else {
        var min = nums.length ? nums[0] : 0;
        var max = nums.length > 1 ? nums[1] : (nums.length ? nums[0] : 1);
        v = min + Math.random() * (max - min);
      }
    } catch (e) { v = null; }
    if (v === null) return null;
    v = Math.round(v * 100) / 100;
    _randCache[id] = String(v);
    return _randCache[id];
  }
  function langLookup(key) {
    if (!key) return null;
    var pd = _projectData.langs || {};
    if (pd[key] != null) return pd[key];
    var A = assets();
    if (A && A.langObject) {
      var o = A.langObject(options.lang) || A.langObject('en_us');
      if (o && o[key] != null) return o[key];
    }
    return null;
  }

  function applyGradients(items, grads) {
    var groups = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.gradId || !grads[it.gradId]) continue;
      (groups[it.gradId] = groups[it.gradId] || []).push(it);
    }
    Object.keys(groups).forEach(function (gid) {
      var spec = grads[gid];
      var arr = groups[gid];
      var total = arr.length;
      for (var k = 0; k < total; k++) {
        var t = total <= 1 ? 0 : k / (total - 1);
        if (spec.type === 'rainbow') arr[k].gradColor = hslToRgb(t * 360 + (spec.phase || 0), 1, 0.55);
        else {
          var stops = spec.stops;
          var seg = Math.min(stops.length - 1, Math.floor(t * (stops.length - 1)));
          var local = (t * (stops.length - 1)) - seg;
          arr[k].gradColor = lerpColor(stops[seg], stops[Math.min(stops.length - 1, seg + 1)], local);
        }
      }
    });
  }

  function glyphsSync(fontId) {
    var base = _fonts || buildFallbackFont();
    if (!fontId) return base;
    var id = normalizeResourceId(fontId, resourceNamespace(fontId, 'minecraft'));
    return _fontMaps[id] || base;
  }
  function glyphFor(cp, fontId) {
    var f = glyphsSync(fontId);
    var g = f[cp];
    // 强制 Unicode 字体 (原版 Force Unicode Font 语义): 默认页的全部可见字形 (含 ASCII)
    // 一律替换为 unifont 风格合成字形; 合成不出的 (PUA/控制字符/空白) 保留原字形。
    // 显式命名字体不受影响, 也不做静默回退。
    if (options.forceUnicode && !fontId) {
      var s = systemGlyph(cp);
      if (s) return s;
      return g || null;
    }
    if (!g && !fontId) g = systemGlyph(cp);
    return g || null;
  }

  // 字形宽度 (像素)
  // 缺失字形合成 (非 ASCII 字形从字体链里拿不到时的兜底), 分两级:
  // 1) unihex: 读取启动器 assets 里的 unifont.zip (assets index → objects/<h0h1>/<hash>),
  //    渲染端解压出 unifont_all_no_pua-*.hex, 用真实 unifont 点阵合成字形 — 与游戏
  //    「Unicode 字体」模式同一份数据, 基线/步进完全一致 (中英文基线对齐的根)。
  // 2) 系统字体回退: unihex 数据不可用时, 用系统字体超采样光栅化成同规格白色点阵
  //    (source-in 着色管线直接复用), 观感降级但布局不塌。
  // 两级产物统一缓存 (source-in 着色直接复用), 混入查询路径。
  var _sysGlyphCache = new Map();
  var _SYS_GLYPH_CAP = 2000;
  var _SYS_FONT_STACK = '"Microsoft YaHei","Microsoft YaHei UI","Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Malgun Gothic","Meiryo","Segoe UI",sans-serif';
  var _unihexMap = null;          // Map<cp, {rows:Int32Array(16), cols}> rows 左对齐 32 位, MSB=最左列
  var _unihexPromise = null;

  // unihex size_overrides 语义: 这些区段按全宽字符处理 (左/右 bearing 强制 0..cols-1,
  // 不裁墨, 整格显示)。与原版 unifont.json 的 size_overrides 区段一致。
  function unihexWide(cp) {
    return (cp >= 0x1100 && cp <= 0x115F) ||            // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0xA4CF) ||                 // CJK 部首..Yi (含 3000-303F 标点)
      (cp >= 0xA960 && cp <= 0xA97F) ||                 // Hangul Jamo Extended-A
      (cp >= 0xAC00 && cp <= 0xD7A3) ||                 // Hangul 音节
      (cp >= 0xF900 && cp <= 0xFAFF) ||                 // CJK 兼容表意
      (cp >= 0xFE10 && cp <= 0xFE19) ||                 // 竖排形式
      (cp >= 0xFE30 && cp <= 0xFE6F) ||                 // CJK 兼容形式
      (cp >= 0xFF00 && cp <= 0xFF60) ||                 // 全角形式
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||                 // 全角符号
      (cp >= 0x1F300 && cp <= 0x1FAFF) ||               // emoji (unifont 双宽)
      (cp >= 0x20000 && cp <= 0x3FFFD);                 // CJK 扩展 B+
  }

  // 从 hex 数据合成字形 (vanilla UnihexProvider 语义, 按 26.3 javap 反编译核对):
  // GlyphBitmap: oversample=2, pixelHeight=16 —— 游戏把 [left,right] 墨域的 16 行纹素
  // 「原样」贴上纹理, 四边形按 GUI 尺寸 (width/2 × 8) 显示, 即纹素:GUI = 2:1,
  // GUI 尺寸 ≥2 时每纹素恰好 1 屏幕像素 (这就是游戏里 unifont 比编辑器细腻的原因)。
  // 这里保留全分辨率 16 行位图 (os=2), 绘制时按 g.w/g.h (GUI 尺寸) 最近邻采样;
  // advance 布局步进取 ⌊width/2⌋+1 (整数, 与游戏 width/2+1 在偶宽下一致)。
  function unihexGlyph(cp) {
    if (!_unihexMap || !_unihexMap.size) return null;
    var e = _unihexMap.get(cp);
    if (!e) return null;
    var rows = e.rows, cols = e.cols;
    var mask = 0;
    for (var i = 0; i < 16; i++) mask = (mask | rows[i]) >>> 0;
    var left, right;
    if (unihexWide(cp) || mask === 0) { left = 0; right = cols - 1; }
    else {
      left = Math.clz32(mask);
      right = Math.clz32((mask & -mask) >>> 0);   // 31 - ctz(mask) = 末墨列
    }
    var width = right - left + 1;
    var dispW = width / 2;                        // GUI 显示宽 (奇数宽可为 x.5, 同游戏)
    var advance = Math.floor(width / 2) + 1;
    var ink = document.createElement('canvas');
    ink.width = width; ink.height = 16;           // 全分辨率纹素, 不做阈值降采样
    var ictx = ink.getContext('2d');
    var im = ictx.createImageData(width, 16);
    for (var r = 0; r < 16; r++) {
      var line = rows[r];
      for (var c = 0; c < width; c++) {
        var col = left + c;
        if ((line >>> (31 - col)) & 1) {
          var o = (r * width + c) * 4;
          im.data[o] = 255; im.data[o + 1] = 255; im.data[o + 2] = 255; im.data[o + 3] = 255;
        }
      }
    }
    ictx.putImageData(im, 0, 0);
    return {
      type: 'bitmap', img: ink,
      sx: 0, sy: 0, sw: width, sh: 16,            // 纹素尺寸 (oversample 源)
      w: dispW, h: 8,                             // GUI 显示尺寸
      os: 2,                                      // 纹素:GUI = 2:1 (GlyphBitmap.oversample)
      advance: advance,
      ascent: 7
    };
  }

  // 启动器 assets 根下的 unifont.zip 定位: 显式 options.unihexZip 优先, 否则扫
  // indexes/*.json (版本号新的优先) 取 objects['minecraft/font/unifont.zip'].hash。
  // unihex 数据源: 优先显式 unihexZip, 否则用随应用打包的 vanilla unifont.zip
  // (ce-unihex-data.js 在本文件之前加载, 注入 root.CE_UNIHEX_ZIP_B64)。
  // 不再动态扫描 assets/indexes —— 生产 mcRoot 下没有 indexes, 扫描恒为 null。
  function findUnihexSource() {
    if (options.unihexZip) return options.unihexZip;
    var b64 = root.CE_UNIHEX_ZIP_B64;
    if (b64) return 'data:application/zip;base64,' + b64;
    return null;
  }

  // zip 读取: EOCD/中央目录/LFH 定位第一个 .hex 条目; method 0 直取, method 8
  // 走 DecompressionStream('deflate-raw') (Electron 41 / Chromium 134 可用)。
  async function unzipHexEntry(dataUrl) {
    var resp = await fetch(dataUrl);
    var buf = new Uint8Array(await resp.arrayBuffer());
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocd = -1;
    var scanStart = Math.max(0, buf.length - 22);
    var scanEnd = Math.max(0, buf.length - 22 - 65535);
    for (var i = scanStart; i >= scanEnd; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(cdOff, true) !== 0x02014b50) break;
      var method = dv.getUint16(cdOff + 10, true);
      var csize = dv.getUint32(cdOff + 20, true);
      var nameLen = dv.getUint16(cdOff + 28, true);
      var extraLen = dv.getUint16(cdOff + 30, true);
      var commLen = dv.getUint16(cdOff + 32, true);
      var lho = dv.getUint32(cdOff + 42, true);
      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(buf[cdOff + 46 + c]);
      cdOff += 46 + nameLen + extraLen + commLen;
      if (!/\.hex$/i.test(name) || dv.getUint32(lho, true) !== 0x04034b50) continue;
      var dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      var raw = buf.subarray(dataStart, dataStart + csize);
      var out = raw;
      if (method === 8) {
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([raw]).stream().pipeThrough(ds);
        out = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      return new TextDecoder('utf-8').decode(out);
    }
    return null;
  }

  // hex 文本 → Map。行格式 `hexcp:data`, data 长 32/64/96/128 → 列数 8/16/24/32
  // (每行 hex 字符数 = 长/16), 行值左对齐到 32 位 (MSB=最左列)。
  function parseUnihex(text) {
    var map = new Map();
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ci = lines[i].indexOf(':');
      if (ci !== 4 && ci !== 5 && ci !== 6) continue;
      var cp = parseInt(lines[i].slice(0, ci), 16);
      if (!(cp >= 0)) continue;
      var data = lines[i].slice(ci + 1).trim();
      var len = data.length;
      if (len !== 32 && len !== 64 && len !== 96 && len !== 128) continue;
      var cols = len / 4;
      var per = len / 16;
      var rows = new Int32Array(16);
      for (var r = 0; r < 16; r++) {
        rows[r] = (parseInt(data.substr(r * per, per), 16) << (32 - cols));
      }
      map.set(cp, { rows: rows, cols: cols });
    }
    return map;
  }

  function loadUnihex() {
    if (_unihexPromise) return _unihexPromise;
    _unihexPromise = (async function () {
      var map = null;
      try {
        var src = await findUnihexSource();
        if (src) {
          // data: URL (打包数据) 可直接 fetch, 无需 readDataUrl 读盘
          var dataUrl = /^data:/i.test(src) ? src : await readDataUrl(src);
          if (dataUrl) {
            var hexText = await unzipHexEntry(dataUrl);
            if (hexText) map = parseUnihex(hexText);
          }
        }
      } catch (e) { warn('unihex-load: ' + (e && e.message)); }
      if (map && map.size) {
        _unihexMap = map;
        _sysGlyphCache.clear();               // 已缓存的系统字体合成字形全部重造
      }
      return _unihexMap;
    })();
    return _unihexPromise;
  }

  function unihexStatus() {
    return { loaded: !!(_unihexMap && _unihexMap.size), size: _unihexMap ? _unihexMap.size : 0 };
  }

  // 合成入口: unihex 真数据优先, 系统字体兜底。产物 (含 null 负缓存) 统一进缓存。
  function systemGlyph(cp) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var hit = _sysGlyphCache.get(cp);
    if (hit !== undefined) return hit;
    var g = unihexGlyph(cp) || systemFontGlyph(cp);
    if (_sysGlyphCache.size >= _SYS_GLYPH_CAP) {
      var f0 = _sysGlyphCache.keys().next();
      if (!f0.done) _sysGlyphCache.delete(f0.value);
    }
    _sysGlyphCache.set(cp, g);
    return g;
  }
  // 系统字体回退合成: 16px 渲染 → 2:1 面积阈值降采样 → 裁墨 (基线随字符浮动,
  // 观感次于 unihex; 仅在 unihex 数据不可用时使用)。
  function systemFontGlyph(cp) {
    var g = null;
    // PUA (U+E000-F8FF) 是 CE 图片字形载体, 系统字没有对应字形, 保持跳过;
    // 控制字符同样跳过。
    var isPUA = cp >= 0xE000 && cp <= 0xF8FF;
    if (cp >= 0x20 && !isPUA && cp <= 0x10FFFF) {
      try {
        var ch = String.fromCodePoint(cp);
        var wide = unihexWide(cp);
        var SIZE = 16;                        // unihex 设计尺寸: 16x16
        var probe = document.createElement('canvas').getContext('2d');
        probe.font = SIZE + 'px ' + _SYS_FONT_STACK;
        var m = probe.measureText(ch);
        var asc = m.actualBoundingBoxAscent || SIZE * 0.8;
        var desc = m.actualBoundingBoxDescent || SIZE * 0.2;
        var cv = document.createElement('canvas');
        cv.width = Math.max(SIZE, Math.ceil(m.width) + 4);
        cv.height = Math.max(SIZE, Math.ceil(asc + desc) + 4);
        var cctx = cv.getContext('2d');
        cctx.font = SIZE + 'px ' + _SYS_FONT_STACK;
        cctx.textBaseline = 'alphabetic';
        cctx.fillStyle = '#fff';
        cctx.fillText(ch, 1, 2 + asc);
        var data = cctx.getImageData(0, 0, cv.width, cv.height).data;
        // unihex → 游戏渲染: 双轴 2:1 降采样 (16x16 设计 → 8x8 显示格)。
        // 阈值取 2x2 面积过半, 抗锯齿边缘不会变成额外墨量。
        var gh = 8, gw = Math.floor(cv.width / 2), grid = [];
        for (var y = 0; y < gh; y++) {
          var row = [];
          for (var x = 0; x < gw; x++) {
            var a = 0;
            for (var dy = 0; dy < 2; dy++) {
              var rowOff = (y * 2 + dy) * cv.width;
              for (var dx = 0; dx < 2; dx++) a += data[(rowOff + x * 2 + dx) * 4 + 3];
            }
            row.push(a >= 127 * 4);
          }
          grid.push(row);
        }
        // 裁掉空白边 (unihex 语义: 左/右空白列在 sizes 表里裁掉, advance = 墨宽 + 1)
        var minX = -1, maxX = -1;
        for (var xx = 0; xx < gw; xx++) {
          for (var yy2 = 0; yy2 < gh; yy2++) {
            if (grid[yy2][xx]) { if (minX < 0) minX = xx; maxX = xx; break; }
          }
        }
        if (minX < 0) { minX = 0; maxX = 0; }   // 空白字形: 保留 1 列占位
        var inkW = maxX - minX + 1;
        // unihex size_overrides: 全宽区段不裁墨, 整 8 显示列, advance 9 (原版步进);
        // 半宽字符保持裁墨 + advance = 墨宽+1。
        if (wide) { minX = 0; inkW = Math.min(gw, 8); }
        var ink = document.createElement('canvas');
        ink.width = inkW; ink.height = gh;
        var ictx = ink.getContext('2d');
        var im = ictx.createImageData(inkW, gh);
        for (var yy3 = 0; yy3 < gh; yy3++) {
          for (var xx3 = 0; xx3 < inkW; xx3++) {
            if (grid[yy3][minX + xx3]) {
              var o = (yy3 * inkW + xx3) * 4;
              im.data[o] = 255; im.data[o + 1] = 255; im.data[o + 2] = 255; im.data[o + 3] = 255;
            }
          }
        }
        ictx.putImageData(im, 0, 0);
        g = {
          type: 'bitmap', img: ink,
          sx: 0, sy: 0, sw: inkW, sh: gh,
          w: inkW, h: gh,
          advance: inkW + 1,          // MC 规则: advance = 墨宽 + 1
          ascent: gh - 1
        };
      } catch (e) { g = null; }
    }
    return g;
  }
  function itemAdvance(it, font) {
    if (it.kind === 'break') return 0;
    if (it.kind === 'shift') return it.dx || 0;
    if (it.kind === 'head') return 9;
    if (it.kind === 'image') {
      if (it.info && it.info.advance != null) return it.info.advance;
      if (it.info && it.info.img) return it.info.width + 1;
      return 7;   // 未解析的占位块宽度
    }
    var g = glyphFor(it.cp, it.style && it.style.font);
    if (!g) return 6;
    var adv = g.advance || 6;
    if (it.style && it.style.bold) adv += 1;
    return adv;
  }

  // ---------------- 绘制 ----------------
  function setPixelFont(ctx) {
    ctx.imageSmoothingEnabled = false;
  }
  function drawItems(ctx, items, x, y, o) {
    var opts = o || {};
    var shadow = opts.shadow !== false && options.shadow !== false;
    var cx = x, cy = y;
    var startX = x;
    var width = 0, maxW = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'break') {
        maxW = Math.max(maxW, cx - startX);
        cx = startX; cy += LINE_HEIGHT; continue;
      }
      if (it.kind === 'shift') { cx += it.dx || 0; continue; }
      var color = it.gradColor || (it.style && it.style.color) || { r: 255, g: 255, b: 255, a: 1 };
      var itemShadow = shadow && !(it.style && it.style.shadow === false);
      if (it.kind === 'image') {
        drawImageGlyph(ctx, it, cx, cy, color, itemShadow);
        cx += itemAdvance(it);
        continue;
      }
      if (it.kind === 'head') {
        drawHeadPlaceholder(ctx, cx, cy, color, itemShadow);
        cx += 9;
        continue;
      }
      var g = glyphFor(it.cp, it.style && it.style.font);
      if (!g) { cx += 6; continue; }
      if (g.type === 'space') { cx += g.advance || 4; continue; }
      if (g.offsetOnly) { cx += g.advance || 0; continue; }
      var baseY = cy - (g.ascent != null ? g.ascent : (g.h - 1));
      // 游戏 javap 语义: GlyphInfo.shadowOffset/boldOffset = 1 GUI px ÷ oversample,
      // unihex (os=2) 的阴影与加粗副本只偏移 0.5 GUI px (1 纹素), 普通字形仍是 1。
      var bo = (g.os === 2) ? 0.5 : 1;
      if (itemShadow) drawGlyph(ctx, g, it, cx + bo, baseY + bo, scaleColor(color, SHADOW_FACTOR));
      if (it.style && it.style.obfuscated) {
        // 混淆: 用随机字形的形状, 保留颜色 (静化以便可读)
        drawGlyph(ctx, g, it, cx, baseY, color);
      } else {
        drawGlyph(ctx, g, it, cx, baseY, color);
      }
      if (it.style && it.style.bold) drawGlyph(ctx, g, it, cx + bo, baseY, color);
 if (it.style && it.style.italic) { /* 斜体?drawGlyph 中处?*/ }
      var adv = g.advance || 6;
      if (it.style && it.style.bold) adv += bo;   // 游戏语义: 加粗步进 += boldOffset (os=2 时 0.5)
      // 下划?/ 删除?
      if (it.style && it.style.underlined) {
        ctx.fillStyle = rgbCss(color);
        ctx.fillRect(cx, cy + 1, Math.max(1, adv - 1), 1);
      }
      if (it.style && it.style.strikethrough) {
        ctx.fillStyle = rgbCss(color);
        ctx.fillRect(cx, cy - 4, Math.max(1, adv - 1), 1);
      }
      cx += adv;
    }
    maxW = Math.max(maxW, cx - startX);
    return { width: maxW, x: cx, y: cy };
  }
  // ---- 字形着色 ----
  // MC 的字体图集是纯白字形, 颜色完全来自文本颜色: 必须先把字形画到离屏画布,
  // 再用 source-in 填充颜色, 否则扢有文字都会是白色 (阴影也会丢起变白不可见)?
  var _tintCache = new Map();
  var _TINT_CAP = 2000;
  // os=2 手动光栅化缓存: sprite → (设备尺寸 → 二值像素列), 上限裁最旧。
  var _rasterCache = new Map();
  var _RASTER_CAP = 4000;
  var _rasterTmp = null;          // 二值墨暂存画布 (按需增长, 复用)
  // 字形实例唯一 id: 着色缓存键必须区分「不同来源图片」——系统合成字形与不同字体页的
  // 位图字形可能共享相同裁剪坐标 (0,0,8,8), 只用坐标+颜色当键会让所有中文串成第一个字。
  var _glyphSeq = 0;
  function glyphUid(g) {
    if (g._uid == null) g._uid = ++_glyphSeq;
    return g._uid;
  }
  function colorKey(c) {
    if (!c) return 'w';
    return (((c.r | 0) << 16) | ((c.g | 0) << 8) | (c.b | 0)) + (c.a == null || c.a >= 1 ? '' : '@' + Math.round(c.a * 100));
  }
  function tintedGlyph(g, color) {
    if (!document || !document.createElement) return null;
    var key = glyphUid(g) + '|' + colorKey(color);
    var hit = _tintCache.get(key);
    if (hit) return hit;
    var cv;
    try { cv = document.createElement('canvas'); } catch (e) { return null; }
    // 着色画布保持「纹素」分辨率 (unihex os=2 时是 16 高而不是 8):
    // drawGlyph 把它按 GUI 尺寸最近邻采样到目标 —— 采样发生在最终设备像素上,
    // 缩到 GUI 尺寸再放大只会丢一次细节 (旧 8 高阈值的糊来源)。
    cv.width = Math.max(1, Math.round(g.sw || g.w));
    cv.height = Math.max(1, Math.round(g.sh || g.h));
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    try { c.drawImage(g.img, g.sx, g.sy, g.sw, g.sh, 0, 0, cv.width, cv.height); }
    catch (e) { return null; }
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = rgbCss(color);
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
    if (_tintCache.size >= _TINT_CAP) {
      var f = _tintCache.keys().next();
      if (!f.done) _tintCache.delete(f.value);
    }
    _tintCache.set(key, cv);
    return cv;
  }
  function drawGlyph(ctx, g, it, x, y, color) {
    if (g.type === 'fallback') {
      ctx.fillStyle = rgbCss(color);
      for (var ry = 0; ry < g.px.length; ry++) {
        for (var rx = 0; rx < g.px[ry].length; rx++) {
          if (g.px[ry][rx]) ctx.fillRect(x + rx, y + ry, 1, 1);
        }
      }
      return;
    }
    if (!g.img) return;
    var sprite = tintedGlyph(g, color);
    if (!sprite) {
      // 离屏失败 (极少数环?: 逢化为直接绘制, 颜色会丢失但不会报错
      try { ctx.drawImage(g.img, g.sx, g.sy, g.sw, g.sh, x, y, g.w, g.h); } catch (e) { /* ignore */ }
      return;
    }
    try {
      if (g.os === 2 && !(it.style && it.style.italic)) {
        // os=2 (unihex): 不交给 drawImage 的隐式采样 (各实现缩小时的取点不保证),
        // 按游戏 NEAREST 语义手动光栅化到设备像素:
        // 设备像素 d 的中心 (d+0.5) 映射回 GUI 坐标再乘纹素比, floor 取纹素 —
        // 与 GL NEAREST 的纹心采样一致: scale≥2 时每纹素恰好 ≥1 设备像素
        // (游戏 GUI scale≥2 的观感), scale=1 时取奇数纹素 2d+1 (原版半分辨率)。
        var m = ctx.getTransform ? ctx.getTransform() : null;
        var s = (m && m.a) ? m.a : 1;                       // makeSurface 只有纯 s 缩放
        var tw = g.sw / g.w, th = g.sh / g.h;               // 每显示格纹素数 (=2)
        var gx0 = Math.round(x * s), gy0 = Math.round(y * s);
        var pw = Math.max(1, Math.round((x + g.w) * s) - gx0);
        var ph = Math.max(1, Math.round((y + g.h) * s) - gy0);
        var cache = _rasterCache.get(sprite);
        var key = pw + 'x' + ph;
        var cells = cache && cache.get(key);
        if (!cells) {
          var sctx = sprite.getContext('2d');
          var sd = sctx.getImageData(0, 0, sprite.width, sprite.height).data;
          var out = new Uint8ClampedArray(pw * ph * 4);
          // 颜色来自 tintedGlyph 着色后的 sprite: sprite RGB 就是当前文字颜色
          // (普通色 / 阴影 0.25 倍色 / 渐变 gradColor, §0 黑也是合法请求色)。
          // 旧实现在这里硬编码白色, 导致所有 unihex 文字一律发白、阴影跟着刷白不可见。
          var cr = 255, cg = 255, cb = 255;
          for (var q = 0; q < sd.length; q += 4) {
            if (sd[q + 3] > 127) { cr = sd[q]; cg = sd[q + 1]; cb = sd[q + 2]; break; }
          }
          for (var py = 0; py < ph; py++) {
            var sy2 = Math.min(g.sh - 1, Math.floor(((py + gy0 + 0.5) / s - y) * th));
            for (var px = 0; px < pw; px++) {
              var sx2 = Math.min(g.sw - 1, Math.floor(((px + gx0 + 0.5) / s - x) * tw));
              var so = (sy2 * sprite.width + sx2) * 4;
              if (sd[so + 3] > 127) {
                var oo = (py * pw + px) * 4;
                out[oo] = cr; out[oo + 1] = cg; out[oo + 2] = cb; out[oo + 3] = 255;
              }
            }
          }
          cells = out;
          if (!_rasterCache.has(sprite)) _rasterCache.set(sprite, new Map());
          var sub = _rasterCache.get(sprite);
          if (sub.size >= _RASTER_CAP) {
            var kf = sub.keys().next();
            if (!kf.done) sub.delete(kf.value);
          }
          sub.set(key, cells);
        }
        // putImageData 不混合 (整块替换含 alpha=0): 直接落墨会抹掉同笔画重叠的
        // 前一字符 (§l 加粗副本紧贴主字形) 与阴影, 还会挖出空洞。先把二值墨按
        // 1:1 落进复用的暂存画布, 再用 drawImage 取同尺寸源矩形混合回目标 ——
        // 无插值、不改尺寸、保留下层。画布按需增长, 避免每字形分配一张 canvas
        // (实时预览每帧数百字形)。
        var td = _rasterTmp || (_rasterTmp = (function () { try { return document.createElement('canvas'); } catch (e) { return null; } })());
        if (!td) { try { ctx.putImageData(new ImageData(cells, pw, ph), gx0, gy0); } catch (e) { /* ignore */ } return; }
        if (td.width < pw || td.height < ph) { td.width = Math.max(td.width, pw); td.height = Math.max(td.height, ph); }
        var tc = td.getContext('2d');
        tc.putImageData(new ImageData(cells, pw, ph), 0, 0);
        ctx.drawImage(td, 0, 0, pw, ph, gx0, gy0, pw, ph);
        return;
      }
      if (it.style && it.style.italic) {
        ctx.save();
        ctx.transform(1, 0, -0.25, 1, 0.25 * g.h, 0);
        // sprite 是纹素分辨率 (unihex os=2 时 16 高), 必须按 GUI 尺寸 g.w/g.h 落笔,
        // 在当前变换 (设备像素) 上做最近邻采样 —— scale≥2 时每纹素恰好 1 屏幕像素。
        ctx.drawImage(sprite, x, y, g.w, g.h);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, x, y, g.w, g.h);
      }
 } catch (e) { /* 尺寸异常时跳?*/ }
  }
  function drawImageGlyph(ctx, it, x, y, color, shadow) {
    var info = it.info;
    if (!info) {
      // 连配置条目都没有: 画一个小小的红色占位块 (不能按标签长度拉长, 否则会糊出一大片)
      ctx.fillStyle = 'rgba(255,80,80,0.35)';
      ctx.fillRect(x, y - 7, 6, 8);
      ctx.strokeStyle = 'rgba(255,120,120,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y - 6.5, 5, 7);
      return;
    }
    // Negative-height / sentinel-ascent entries are CE offset glyphs in preview policy:
    // keep their signed advance, but never send unsafe dimensions to Canvas or draw a placeholder.
    if (info.offsetOnly) return;
    var h = imageRenderHeight(info.height, 8);
    var w = Math.max(1, Math.round(Number(info.width) || 1));
    var asc = (typeof info.ascent === 'number' && isFinite(info.ascent)) ? info.ascent : h - 1;
    var top = y - asc;
    if (info.missing || !info.img) {
      // 条目存在但图片没读到: 按配置的 height 画出「本来应该占多大」的红框
      var mh = clamp(Math.abs(h) || 8, 4, 256);
      var mw = clamp(Math.abs(w) || 8, 4, 256);
      ctx.save();
      ctx.fillStyle = 'rgba(255,80,80,0.18)';
      ctx.fillRect(x, top, mw, mh);
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash && ctx.setLineDash([2, 2]);
      ctx.strokeRect(x + 0.5, top + 0.5, mw - 1, mh - 1);
      ctx.setLineDash && ctx.setLineDash([]);
      if (mh >= 10 && mw >= 10) {
        ctx.fillStyle = 'rgba(255,150,150,0.95)';
        ctx.font = '9px monospace';
        ctx.fillText('?', x + mw / 2 - 2, top + mh / 2 + 3);
      }
      ctx.restore();
      return;
    }
    var sx = info.sx || 0, sy = info.sy || 0;
    var sw = info.sw, sh = info.sh;
    if (shadow) {
      try {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(info.img, sx, sy, sw, sh, x + 1, top + 1, w, h);
        ctx.restore();
      } catch (e) { /* ignore */ }
    }
    try { ctx.drawImage(info.img, sx, sy, sw, sh, x, top, w, h); }
    catch (e) { /* ignore */ }
  }
  function drawHeadPlaceholder(ctx, x, y, color, shadow) {
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y - 7, 8, 8); }
    ctx.fillStyle = rgbCss(color);
    ctx.fillRect(x, y - 8, 8, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 2, y - 6, 1, 1);
    ctx.fillRect(x + 5, y - 6, 1, 1);
    ctx.fillRect(x + 2, y - 3, 4, 1);
  }

  // ---------------- 字体图像 (CraftEngine images 段) ----------------
  function imageCodepoints(entry) {
    if (!entry) return null;
    var raw = entry.chars != null ? entry.chars : (entry.char != null ? entry.char : entry.unicode);
    if (raw == null) return null;
    if (Array.isArray(raw)) {
      var out = [];
      for (var i = 0; i < raw.length; i++) out.push(decodeChars(raw[i]));
      return out;
    }
    if (typeof raw === 'number' || (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw))) return [[parseInt(raw, 10)]];
    return [decodeChars(raw)];
  }
  function imageFontId(entry, imageId) {
    var raw = entry && entry.font != null ? entry.font : null;
    return normalizeResourceId(raw || resourceNamespace(imageId, activeNamespace() || 'minecraft') + ':default', resourceNamespace(imageId, 'minecraft'));
  }
  function registerImageGlyphs(images) {
    Object.keys(images || {}).forEach(function (id) {
      var entry = images[id];
      if (!entry || entry.ref || !entry.file) return;
      var grid = gridSize(entry);
      var cps = imageCodepoints(entry);
      var rows = grid ? grid.rows : 1;
      var cols = grid ? grid.cols : 1;
      if (cps) {
        rows = cps.length;
        cols = cps.reduce(function (m, row) { return Math.max(m, row.length); }, 0) || 1;
      }
      var fontId = imageFontId(entry, id);
      var map = _fontMaps[fontId] || (_fontMaps[fontId] = Object.create(null));
      var height = imageHeightOf(entry);
      var ascent = imageAscentOf(entry, height);
      for (var r = 0; r < rows; r++) {
        var row = cps ? (cps[r] || []) : [];
        for (var c = 0; c < cols; c++) {
          var cp = row[c];
          if (!cp) continue;
          var info = imageGlyphFrom(entry, r, c);
          if (!info || !info.img) continue;
          if (!_fontMapLoaded[fontId] || !map[cp]) {
            map[cp] = {
              type: 'bitmap', img: info.img, sx: info.sx, sy: info.sy, sw: info.sw, sh: info.sh,
              w: info.width, h: info.height, advance: info.advance != null ? info.advance : info.width + 1,
              ascent: ascent != null ? ascent : info.ascent, offsetOnly: !!info.offsetOnly
            };
          }
        }
      }
    });
  }
  function imageGlyph(id, row, col) {
    var e = _projectData.images[id];
    if (!e) return null;
    var entry = e;
    // ref 引用
    if (entry.ref && !entry.file) {
      var parts = String(entry.ref).split(':');
      var rid = parts.length >= 2 ? parts[0] + ':' + parts[1] : entry.ref;
      var base = _projectData.images[rid];
      if (!base) return null;
      var r0 = parts.length >= 3 ? parseInt(parts[2], 10) : (entry.row || 0);
      var c0 = parts.length >= 4 ? parseInt(parts[3], 10) : (entry.col || entry.column || 0);
      return imageGlyphFrom(base, entry.row != null ? entry.row : r0, entry.column != null ? entry.column : (entry.col != null ? entry.col : c0));
    }
    return imageGlyphFrom(entry, row, col);
  }
  function imageGlyphFrom(entry, row, col) {
    if (!entry) return null;
    var grid = gridSize(entry);
    var rows = grid ? grid.rows : 1;
    var cols = grid ? grid.cols : 1;
    var r = (row != null && !isNaN(row)) ? row : 0;
    var c = (col != null && !isNaN(col)) ? col : 0;
    r = clamp(r, 0, rows - 1);
    c = clamp(c, 0, cols - 1);
    var cfgH = imageHeightOf(entry);
    var cfgA = imageAscentOf(entry, cfgH);
    function buildInfo(img, sx, sy, sw, sh, rawH, rawA, cellH) {
      var h = rawH == null ? cellH : rawH;
      var a = rawA == null ? h - 1 : rawA;
      var safeH = imageRenderHeight(h, cellH || 8);
      var safeCellH = cellH > 0 ? cellH : (sh > 0 ? sh : 1);
      var signedScale = safeCellH > 0 ? Number(h) / safeCellH : Number(h);
      if (!isFinite(signedScale)) signedScale = 1;
      var adv = imageAdvanceOf(entry, sx, sy, sw, sh, h, safeCellH, a, 1);
      var safeW = Math.max(1, Math.round((sw || 1) * Math.abs(signedScale || 1)));
      return {
        img: img, sw: sw || 1, sh: sh || 1, sx: sx || 0, sy: sy || 0,
        width: safeW, height: safeH, advance: adv, ascent: a,
        offsetOnly: imageOffsetOnly(h, a), rawHeight: h, renderHeight: safeH
      };
    }
    if (!entry._img) {
      // Missing offset/sentinel glyphs stay invisible; regular missing images retain a diagnostic box.
      var ph = imageRenderHeight(cfgH, 8);
      var missing = buildInfo(null, 0, 0, 1, 1, cfgH == null ? 8 : cfgH, cfgA, 1);
      missing.missing = true;
      missing.width = ph;
      missing.height = ph;
      return missing;
    }
    var img = entry._img;
    // 动画帧条 (无 grid 配置时): 用预加载算好的帧窗口 (sw/sh/sx/sy) 当作这一格;
    // 配了 grid_size/chars 的精灵图仍按 grid 切 (那是精灵表, 不是动画)
    if (entry._frame && !grid) {
      var fw0 = entry._frame.sw, fh0 = entry._frame.sh;
      return buildInfo(img, entry._frame.sx, entry._frame.sy, fw0, fh0,
        cfgH != null ? cfgH : fh0, cfgA, fh0);
    }
    var cw = img.width / cols;
    var chh = img.height / rows;
    var outH = cfgH != null ? cfgH : chh;
    return buildInfo(img, c * cw, r * chh, cw, chh, outH,
      cfgA != null ? cfgA : outH - 1, chh);
  }
  function imageOffsetOnly(height, ascent) {
    return (typeof height === 'number' && isFinite(height) && height < 0) ||
      (typeof ascent === 'number' && isFinite(ascent) && ascent <= -1000);
  }
  function mcGlyphRound(v) {
    var n = Number(v);
    return isFinite(n) ? Math.trunc(n + 0.5) : 0;
  }
  function mcGlyphAdvance(trimmedWidth, scale) {
    return mcGlyphRound(Number(trimmedWidth) * Number(scale)) + 1;
  }
  function imageRenderHeight(height, fallback) {
    var n = height == null ? fallback : Number(height);
    if (!isFinite(n) || n === 0) return 1;
    return Math.max(1, Math.round(Math.abs(n)));
  }
  function imageTrimmedWidth(entry, sx, sy, sw, sh) {
    if (!entry || !entry._img) return 0;
    var key = [sx, sy, sw, sh].join(',');
    entry._trimmedWidths = entry._trimmedWidths || Object.create(null);
    if (entry._trimmedWidths[key] == null) entry._trimmedWidths[key] = measureTrimmed(entry._img, sx, sy, sw, sh);
    return entry._trimmedWidths[key] || 0;
  }
  function imageAdvanceOf(entry, sx, sy, sw, sh, rawHeight, cellHeight, ascent, fallback) {
    var fallbackAdvance = fallback == null ? 1 : fallback;
    var h = Number(rawHeight);
    if (!isFinite(h)) return fallbackAdvance;
    var trimmed = imageTrimmedWidth(entry, sx, sy, sw, sh);
    var scale = cellHeight > 0 ? h / cellHeight : h;
    return mcGlyphAdvance(trimmed, scale);
  }
  // CE: height 别名为 scale / scale_ratio
  function imageHeightOf(entry) {
    if (!entry) return null;
    var v = entry.height != null ? entry.height : (entry.scale != null ? entry.scale : entry.scale_ratio);
    var n = typeof v === 'string' ? parseFloat(v) : v;
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }
  // CE: ascent 别名为 y_position; 缺省 height - 1
  function imageAscentOf(entry, height) {
    var v = entry ? (entry.ascent != null ? entry.ascent : entry.y_position) : null;
    var n = typeof v === 'string' ? parseFloat(v) : v;
    if (typeof n === 'number' && isFinite(n)) return n;
    return height != null ? height - 1 : null;
  }
  function gridSize(entry) {
    if (!entry) return null;
    if (entry.grid_size != null) {
      var raw = Array.isArray(entry.grid_size) ? entry.grid_size.join(',') : String(entry.grid_size);
      var g = raw.split(/[,x×\s]+/).filter(Boolean).map(Number);
      if (g.length >= 2 && g[0] > 0 && g[1] > 0) return { rows: g[0], cols: g[1] };
    }
    // chars 可以是列表 (每行一个字符串) 或单个字符串 (只有一行)
    var rowsArr = null;
    if (Array.isArray(entry.chars) && entry.chars.length) rowsArr = entry.chars;
    else if (typeof entry.chars === 'string' && entry.chars) rowsArr = [entry.chars];
    if (rowsArr) {
      var cols = 0;
      rowsArr.forEach(function (r) { cols = Math.max(cols, countCodepoints(r)); });
      if (cols > 0) return { rows: rowsArr.length, cols: cols };
    }
    return null;
  }

  // ---------------- CE 工程数据 (images / global_variables / emoji / lang) ----------------
  function configDirOf(filePath) {
    var parts = String(filePath || '').replace(/\\/g, '/').split('/');
    for (var i = parts.length - 2; i >= 1; i--) {
      if (parts[i] === 'configuration' || parts[i] === 'configurations') return parts.slice(0, i + 1).join('/');
    }
    return null;
  }
  function readTextFile(p) {
    var a = root.electronAPI;
    if (!a || !a.readFile) return Promise.resolve(null);
    return a.readFile(p).then(function (r) { return (r && r.success) ? r.content : null; }).catch(function () { return null; });
  }
  function listDir(p) {
    var a = root.electronAPI;
    if (!a || !a.readdir) return Promise.resolve([]);
    return a.readdir(p).then(function (r) { return (r && r.success) ? r.files : []; }).catch(function () { return []; });
  }

  async function collectProjectDataImpl() {
    var images = {}, globals = {}, emojis = {}, langs = {}, furniture = {}, items = {}, blocks = {};
    var A = assets();
    var resRoot = A && A.projectResourcesRoot ? A.projectResourcesRoot() : null;
    var dirs = [];
    if (resRoot) {
      var packs = await listDir(resRoot);
      for (var i = 0; i < packs.length; i++) {
        if (!packs[i].isDirectory || packs[i].name.charAt(0) === '.') continue;
        var pd = String(packs[i].path).replace(/\\/g, '/');
        dirs.push(pd + '/configuration');
        dirs.push(pd + '/configurations');
      }
    }
    var cd = configDirOf(_activeFile);
    if (cd) dirs.push(cd);
    var seen = Object.create(null);
    var files = [];
    for (var d = 0; d < dirs.length; d++) {
      if (seen[dirs[d]]) continue;
      seen[dirs[d]] = 1;
      await walkYaml(dirs[d], 0, files, seen);
    }
    var Y = root.jsyaml || (typeof YAML !== 'undefined' ? YAML : null);
    for (var f = 0; f < files.length; f++) {
      var txt = await readTextFile(files[f]);
      if (!txt) continue;
      var doc = null;
      if (Y) { try { doc = Y.load(txt); } catch (e) { doc = null; } }
      if (!doc || typeof doc !== 'object') continue;
      harvestConfigObject(doc, images, globals, emojis, langs, furniture, items, blocks);
    }
    // 图片资源预加?
    for (var id in images) {
      if (!Object.prototype.hasOwnProperty.call(images, id)) continue;
      await preloadImageEntry(id, images[id], images);
    }
    registerImageGlyphs(images);
    // CE 运行时生成模型 (model.generation → 磁盘上不存在的 json)
    registerRuntimeModelsIn(items, items, blocks);
    return { images: images, globals: globals, emojis: emojis, langs: langs, furniture: furniture, items: items, blocks: blocks };
  }
  async function walkYaml(dir, depth, out, seen) {
    if (depth > 3) return;
    var files = await listDir(dir);
    var subdirs = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].isDirectory) { subdirs.push(files[i].path); continue; }
      if (/\.ya?ml$/i.test(files[i].name)) out.push(String(files[i].path).replace(/\\/g, '/'));
    }
    for (var s = 0; s < subdirs.length && s < 24; s++) {
      var p = String(subdirs[s]).replace(/\\/g, '/');
      if (seen[p]) continue;
      seen[p] = 1;
      await walkYaml(p, depth + 1, out, seen);
    }
  }
  // generation: CE 运行时生成模型声明的最小集 ({parent, textures}); 非法返回 null。
  function generationOf(v) {
    var o = fobj(v);
    if (!o) return null;
    var g = fobj(o.generation);
    if (!g && !o.parent && !o.textures) return null;
    var out = {};
    if (o.parent || (g && g.parent)) out.parent = o.parent || g.parent;
    var tex = fobj(o.textures) || fobj(g && g.textures);
    if (tex) out.textures = tex;
    return Object.keys(out).length ? out : null;
  }
  // CE 运行时模型注册: 每个带 model:{path, generation} 的条目 → <path> 合成模型。
  function registerRuntimeModelsIn(data, items, blocks) {
    function handle(key, d) {
      var o = fobj(d) || {};
      var inner = fobj(o.data) || {};
      var modelNs = resourceNamespace(key, activeNamespace() || 'minecraft');
      var containers = [o, inner, fobj(o.block) || fobj(inner.block) || null];
      for (var c = 0; c < containers.length; c++) {
        var base = containers[c];
        if (!base) continue;
        var mo = fobj(base.model) || fobj(base.item_model);
        var gid = generationOf(base.model) || generationOf(base.item_model);
        if (!mo || !gid) continue;
        var p = fval(mo.path) || fval(mo.model);
        if (!p) continue;
        var pid = normalizeResourceId(p, modelNs);
        registerRuntimeModel(pid, gid, modelNs);
      }
      var st = fobj(o.state) || fobj(inner.state);
      if (!st) {
        // blocks 条目形态: state 藏在 behavior.block.state (kangelblocks 的 blocks.yml 就是)
        var bhs = fobj(o.behavior) || fobj(inner.behavior);
        var bo = fobj(bhs);
        if (!bo && bhs && Array.isArray(bhs)) { for (var bi = 0; bi < bhs.length && !bo; bi++) bo = fobj(bhs[bi]); }
        if (bo && String(fval(bo.type) || '').indexOf('block') !== -1) st = fobj(bo.block) ? (fobj(fval(bo.block).state) || null) : null;
      }
      if (st) {
        var smo = fobj(st.model);
        var sgid = generationOf(st.model);
        if (smo && sgid) {
          var sp = fval(smo.path) || fval(smo.model);
          if (sp) {
            var spid = normalizeResourceId(sp, modelNs);
            registerRuntimeModel(spid, sgid, modelNs);
          }
        }
        var apps = fobj(st.appearances);
        if (apps) {
          Object.keys(apps).forEach(function (ak) {
            var ap = fobj(apps[ak]);
            if (!ap) return;
            var amo = fobj(ap.model);
            var agid = generationOf(ap.model);
            if (!amo || !agid) return;
            var ap2 = fval(amo.path) || fval(amo.model);
            if (!ap2) return;
            var apid = normalizeResourceId(ap2, modelNs);
            registerRuntimeModel(apid, agid, modelNs);
          });
        }
      }
    }
    if (items) Object.keys(items).forEach(function (k) { handle(k, items[k]); });
    if (blocks) Object.keys(blocks).forEach(function (k) {
      if (String(k).indexOf('#') === 0) return;
      handle(k, blocks[k]);
    });
  }
  function harvestConfigObject(doc, images, globals, emojis, langs, furniture, items, blocks) {
    var keys = Object.keys(doc);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var base = key.replace(/#.*$/, '');
      var val = doc[key];
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      if (base === 'blocks' || base === 'block') {
        // 方块条目: 供 block_item 行为按 id 引用
        if (blocks) Object.keys(val).forEach(function (k) {
          if (isObj(val[k])) blocks[k] = val[k];
        });
      } else if (base === 'images' || base === 'image') {
        Object.keys(val).forEach(function (k) {
          if (!isObj(val[k])) return;
          images[k] = Object.assign({}, val[k]);
        });
      } else if (base === 'furniture') {
        // 家具条目: 供 furniture_item 行为按 id 引用
        if (furniture) Object.keys(val).forEach(function (k) {
          if (isObj(val[k])) furniture[k] = val[k];
        });
      } else if (base === 'items' || base === 'item') {
        if (items) Object.keys(val).forEach(function (k) {
          if (isObj(val[k])) items[k] = val[k];
        });
        // 物品里内联的家具 (behavior.type: furniture_item) —— 也收一份, 便于按物品 id 找到家具
        if (furniture) Object.keys(val).forEach(function (k) {
          var inline = furnitureInlineOf(val[k]);
          if (inline) furniture['#item:' + k] = inline;
        });
        // 物品里内联的方块 (behavior.type: block_item) —— 同理收一份
        if (blocks) Object.keys(val).forEach(function (k) {
          var inlineB = blockInlineOf(val[k]);
          if (inlineB) blocks['#item:' + k] = inlineB;
        });
      } else if (base === 'global_variables' || base === 'global_variable') {
        Object.keys(val).forEach(function (k) {
          var v = val[k];
          if (typeof v === 'string') globals[k] = v;
        });
      } else if (base === 'emoji' || base === 'emojis') {
        Object.keys(val).forEach(function (k) {
          if (isObj(val[k])) emojis[k] = val[k];
        });
      } else if (base === 'translations' || base === 'translation' || base === 'l10n' ||
                 base === 'i18n' || base === 'localization' || base === 'internationalization' ||
                 base === 'lang' || base === 'language' || base === 'languages') {
        // 结构: <lang>: { key: value } ?{ key: value }
        Object.keys(val).forEach(function (k) {
          var v = val[k];
          if (typeof v === 'string') { langs[k] = v; return; }
          if (isObj(v)) {
            Object.keys(v).forEach(function (k2) {
              if (typeof v[k2] === 'string') langs[k2] = v[k2];
            });
          }
        });
      }
    }
  }
  // 找到图片文件的实际路? CE ?file ?namespace:path (相对资源?assets/<ns>/textures)
  function imageFileCandidates(fileRef) {
    var s = String(fileRef || '');
    var i = s.indexOf(':');
    var ns = i === -1 ? null : s.slice(0, i);
    var p = i === -1 ? s : s.slice(i + 1);
    p = p.replace(/\.png$/i, '');
    var out = [];
    // 1) 作为纹理 id 解析 —— 遍历该命名空间的全部根 (当前工程包 → 其它工程包 → 原版)
    var rel = p.replace(/^textures\//, '');
    resolveCandidates('texture', (ns || 'minecraft') + ':' + rel).forEach(function (x) { out.push(x); });
    // 2) 直连工程目录 (贴图不一定放在 textures/ 下, 老工程常见)
    var dirs = nsDirsOf(ns);
    for (var d = 0; d < dirs.length; d++) {
      var nd = dirs[d];
      out.push(nd + '/textures/' + rel + '.png');
      out.push(nd + '/' + p + '.png');
      out.push(nd + '/' + p);
    }
    var seen = Object.create(null);
    return out.filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = 1;
      return true;
    });
  }
  async function preloadImageEntry(id, entry, all) {
    if (!entry || entry._img || !entry.file) return;
    var cands = imageFileCandidates(entry.file);
    for (var i = 0; i < cands.length; i++) {
      var img = await loadImagePath(cands[i]);
      if (img) {
        entry._img = img; entry._path = cands[i];
        // CE 图像也可能指向动画帧条: 预加载时一并算出静态帧窗口
        var fr = await spriteFrameOf(img, cands[i]);
        if (fr) { entry._frame = fr; }
        return;
      }
    }
    warn('missing-image: ' + id + ' (' + entry.file + ')');
  }

  // ---------------- 物品 / 模型渲染 ----------------
  function normalizeItemRef(ref) {
    if (ref == null) return { id: null };
    if (typeof ref === 'string') {
      if (!ref) return { id: null };
      return ref.indexOf(':') !== -1 ? { id: ref } : { id: ref };
    }
    if (isObj(ref)) return ref;
    return { id: null };
  }
  function looksLikeTextureId(s) {
    return typeof s === 'string' && /^(?:\w+:)?(?:block|item|gui|font|entity|misc)\//.test(s);
  }

  async function resolveItemModel(ref, defaultNs) {
    var r = normalizeItemRef(ref);
    var id = r.id || r.material || null;
    var refNs = resourceNamespace(id, defaultNs || 'minecraft');
    var ceBlock = r.blockData || (r.behavior || r.behaviors ? blockInlineOf(r) : null);
    if (ceBlock && !ceBlock.__missingBlock) return { kind: 'ce-block', blockData: ceBlock, id: id };
    // 显式纹理 / 模型
    if (r.texture) return { kind: 'flat', texture: normalizeResourceId(r.texture, refNs) };
    if (r.model) {
      var rm = fobj(r.model);
      var rmp = rm ? (fval(rm.path) || fval(rm.model)) : r.model;
      return { kind: 'block', model: normalizeResourceId(rmp, refNs) };
    }
    if (!id) return { kind: 'none', error: 'no item id' };
    var s = normalizeResourceId(id, defaultNs || activeNamespace() || 'minecraft');
    var ns = s.slice(0, s.indexOf(':'));
    var path0 = s.slice(s.indexOf(':') + 1);

    // 0) 工程里定义过的物品: 优先用它自己声明的 model / texture / material。
    //    家具元素通常引用包内自定义物品 (item: default:my_chair), 只有这样才画得出材质。
    var proj = _projectData.items && _projectData.items[s];
    if (proj) {
      var po = fobj(proj) || {};
      var pd = fobj(po.data) || po;
      var ptex = fval(pd.texture) || fval(pd.item_texture) || fval(pd.icon);
      // model 可能是对象 (CE generation 写法 {type, path, generation}) —— 取其 path
      var pmObj = fobj(pd.model) || fobj(pd.item_model) || fobj(po.model) || fobj(po.item_model);
      var pmdl = pmObj ? (fval(pmObj.path) || fval(pmObj.model)) :
        (fval(pd.model) || fval(pd.item_model) || fval(pd.blueprint) ||
         fval(po.model) || fval(po.item_model) || fval(po.blueprint));
      if (ptex) return { kind: 'flat', texture: String(ptex) };
      if (pmdl) {
        var ms = String(pmdl);
        ms = normalizeResourceId(ms, ns);
        // 按模型内容决定 3D/平面 (带 elements 的椅子模型不能被拍平)
        var cls = await classifyModel(ms);
        if (cls) return cls;
        var pmTex = await flatTextureOf(ms);
        if (pmTex) return { kind: 'flat', texture: pmTex, model: ms };
        return { kind: 'flat', texture: ms };
      }
      // 只写了原版材质 → 回到该原版物品继续解析
      var pmat = fval(pd.material) || fval(po.material);
      if (pmat) {
        var mid = normalizeResourceId(pmat, ns);
        if (mid !== s) return await resolveItemModel(mid, ns);
      }
    }

    // 1) 原版 item model definition (items/<path>.json)
    var def = await loadJsonAny('item', s);
    if (def && def.model && typeof def.model === 'object') {
      var mdef = pickModelDef(def.model);
      if (mdef) {
        // pickModelDef 只能按路径猜 3D/平面, 这里用模型内容再确认一次
        if (mdef.model) {
          mdef.model = normalizeResourceId(mdef.model, ns);
          var cls2 = await classifyModel(mdef.model, ns);
          if (cls2) return cls2;
        }
        return mdef;
      }
    }
    // 1.5) CE 运行时生成模型 (configuration 声明了 generation、资源包上无 json)
    if (runtimeModelOf(s)) {
      var rcls = await classifyModel(s);
      if (rcls) return rcls;
    }
    // 2) 直接当模型路径 (item/)
    //    注意: id 本身可能已经带 "item/" 或 "block/" 前缀, 不能无脑再拼一次
    var itemCands = [];
    if (/^item\//.test(path0)) itemCands.push(normalizeResourceId(path0, ns));
    itemCands.push(normalizeResourceId('item/' + path0, ns));
    for (var ic = 0; ic < itemCands.length; ic++) {
      if (!resolveCandidates('model', itemCands[ic]).length) continue;
      var cls3 = await classifyModel(itemCands[ic]);
      if (cls3 && cls3.kind === 'block') return cls3;
      if (cls3) return cls3;
      var tex0 = await flatTextureOf(itemCands[ic]);
      if (tex0) return { kind: 'flat', texture: tex0, model: itemCands[ic] };
    }
    // 3) 方块模型
    var blockCands = [];
    if (/^block\//.test(path0)) blockCands.push(normalizeResourceId(path0, ns));
    blockCands.push(normalizeResourceId('block/' + path0, ns));
    for (var bc = 0; bc < blockCands.length; bc++) {
      if (await loadJsonAny('model', blockCands[bc])) return { kind: 'block', model: blockCands[bc] };
    }
    // 4) 当作纹理
    if (looksLikeTextureId(path0) || looksLikeTextureId(s)) {
      return { kind: 'flat', texture: s };
    }
    return { kind: 'flat', texture: ns + ':item/' + path0 };
  }
  // 1.21.4+ item model definition ?我们支持的最小集?
  function pickModelDef(m) {
    var type = m.type || 'minecraft:model';
    type = String(type).replace(/^minecraft:/, '');
    // 1.21.4+ ?model 定义里目标模型写?`model` 字段 (旧写法是 `path`)
    var target = m.path || m.model;
    if (type === 'model') {
      if (target) {
        return isBlockModelPath(target) ? { kind: 'block', model: String(target) }
          : { kind: 'flat', model: String(target) };
      }
      if (m.blueprint) return { kind: 'flat', texture: m.blueprint };
      return { kind: 'flat', texture: null, model: null };
    }
    if (type === 'composite' && Array.isArray(m.models) && m.models.length) {
      return pickModelDef(m.models[0]);
    }
    if (type === 'select' || type === 'range_dispatch') {
      var c = m.cases || m.entries;
      if (Array.isArray(c) && c.length) return pickModelDef(c[0].model || {});
      if (m.fallback) return pickModelDef(m.fallback);
      return { kind: 'flat' };
    }
    if (type === 'condition') return pickModelDef(m.on_true || m.on_false || {});
    if (type === 'empty') return { kind: 'none' };
    return { kind: 'flat' };
  }
  function isBlockModelPath(p) {
    return /(?:^|:)block\//.test(String(p));
  }
  // 一个模型该按 3D 几何体渲染, 还是拍平成一张图标?
  // 必须看模型内容 (elements), 不能看路径名字 —— 物品模型 (models/item/*.json)
  // 同样可以带 elements (椅子/家具模型就是这样), 按路径判断会把它们拍平成一张贴图糊在画面上。
  async function classifyModel(modelId, defaultNs) {
    var id = normalizeResourceId(modelId, defaultNs || activeNamespace() || 'minecraft');
    var chain = await loadModelChain(id);
    if (!chain) return null;
    if (Array.isArray(chain.elements) && chain.elements.length) {
      return { kind: 'block', model: id };
    }
    // 没有几何体: 只能是平面图标 (item/generated 之类), 取它的 layer0 贴图
    var tex = await flatTextureOf(id);
    return { kind: 'flat', texture: tex, model: id };
  }
  // 平面物品贴图: 读取模型? ?layer0 / textures 的第丢?
  async function flatTextureOf(modelId) {
    var model = await loadModelChain(modelId);
    if (!model || !model.textures) return null;
    var texKeys = ['layer0', 'layer1', 'texture', 'all', 'side', 'top', 'front', 'particle'];
    for (var i = 0; i < texKeys.length; i++) {
      var v = model.textures[texKeys[i]];
      if (typeof v === 'string' && v.charAt(0) !== '#') return v;
    }
    var ks = Object.keys(model.textures);
    for (var j = 0; j < ks.length; j++) {
      if (typeof model.textures[ks[j]] === 'string' && model.textures[ks[j]].charAt(0) !== '#') return model.textures[ks[j]];
    }
    return null;
  }
  async function loadModelChain(modelId, depth, defaultNs) {
    depth = depth || 0;
    if (depth > 8) return null;
    var id0 = normalizeResourceId(modelId, defaultNs || activeNamespace() || 'minecraft');
    if (_modelCache.has(id0)) return _modelCache.get(id0);
    var pr = (async function () {
      var id = id0;
      var json = await loadJsonAny('model', id);
      if (!json) {
        // CE 运行时生成模型: 磁盘上没有 json, 用 configuration 里的 generation 合成
        var rt = runtimeModelOf(id, resourceNamespace(id));
        if (!rt) return null;
        json = rt;
      }
      var modelNs = resourceNamespace(id);
      var parentId = json.parent ? normalizeResourceId(json.parent, modelNs) : null;
      var merged = { textures: {}, elements: null, display: null, parent: parentId };
      if (json.textures) Object.assign(merged.textures, json.textures);
      if (json.elements) merged.elements = json.elements;
      if (json.display) merged.display = json.display;
      if (json.parent) {
        var par = await loadModelChain(parentId, depth + 1, modelNs);
        if (par) {
          var t = {};
          Object.assign(t, par.textures, merged.textures);
          merged.textures = t;
          if (!merged.elements) merged.elements = par.elements;
          if (!merged.display) merged.display = par.display;
        }
      }
      return merged;
    })();
    return cacheSet(_modelCache, id0, pr);
  }
  function resolveTextureRef(model, ref) {
    var seen = 0;
    var v = ref;
    while (typeof v === 'string' && v.charAt(0) === '#' && seen++ < 8) {
      v = model.textures[v.slice(1)];
    }
    return typeof v === 'string' ? v : null;
  }

  // ??4 个角 (顺序?MC FaceBakery 丢? 用于 UV 映射)
  function faceCorners(face, f, t) {
    var x1 = f[0], y1 = f[1], z1 = f[2], x2 = t[0], y2 = t[1], z2 = t[2];
    return {
      down: [[x1, y1, z1], [x1, y1, z2], [x2, y1, z2], [x2, y1, z1]],
      up: [[x1, y2, z1], [x1, y2, z2], [x2, y2, z2], [x2, y2, z1]],
      north: [[x2, y2, z1], [x2, y1, z1], [x1, y1, z1], [x1, y2, z1]],
      south: [[x1, y2, z2], [x1, y1, z2], [x2, y1, z2], [x2, y2, z2]],
      west: [[x1, y2, z1], [x1, y1, z1], [x1, y1, z2], [x1, y2, z2]],
      east: [[x2, y2, z2], [x2, y1, z2], [x2, y1, z1], [x2, y2, z1]]
    }[face];
  }
  function defaultUV(face, f, t) {
    var x1 = f[0], y1 = f[1], z1 = f[2], x2 = t[0], y2 = t[1], z2 = t[2];
    switch (face) {
      case 'up': case 'down': return [x1, z1, x2, z2];
      case 'north': case 'south': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
      default: return [z1, 16 - y2, z2, 16 - y1];
    }
  }
  function uvQuad(face, uv, corners) {
    var u1 = uv[0], v1 = uv[1], u2 = uv[2], v2 = uv[3];
    switch (face) {
      case 'down': return [[u1, v1], [u1, v2], [u2, v2], [u2, v1]];
      case 'up': return [[u1, v2], [u1, v1], [u2, v1], [u2, v2]];
      case 'north': return [[u1, v1], [u1, v2], [u2, v2], [u2, v1]];
      case 'south': return [[u2, v1], [u2, v2], [u1, v2], [u1, v1]];
      case 'west': return [[u2, v1], [u2, v2], [u1, v2], [u1, v1]];
      case 'east': return [[u1, v1], [u1, v2], [u2, v2], [u2, v1]];
      default: return [[u1, v1], [u1, v2], [u2, v2], [u2, v1]];
    }
  }

  var FACE_NORMALS = {
    up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1],
    south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0]
  };
  // 视图方向 (yaw 45°, pitch 30°): ?+x +y +z 方向看向方块 ?可见?up / south / east
  var VIEW = { x: COS30, y: SIN30 * 2, z: COS30 };
  // 物品栏 GUI 的视图向量: 原版把 display.gui 的 ItemTransform 烘进模型后再「正交直视」,
  // 观察方向就是变换后空间的 +Z (镜头在 +Z 无穷远处看向原点)
  var GUI_SLOT_VIEW = { x: 0, y: 0, z: 1 };
  function faceVisible(face) {
    var n = FACE_NORMALS[face];
    if (!n) return false;
    return (n[0] * VIEW.x + n[1] * VIEW.y + n[2] * VIEW.z) > 0.0001;
  }
  // MC 物品渲染使用两盏方向? 使顶面最亮两个侧面亮度不?(否则方块看起来是平的)?
  // 参? 光照方向约为 (±0.2, 1.0, ?.7), 环境?0.6?
  var SHADE_LIGHTS = [
    { x: 0.1617, y: 0.8084, z: -0.5659 },
    { x: -0.1617, y: 0.8084, z: 0.5659 }
  ];
  var SHADE_AMBIENT = 0.6;
  var SHADE_WEIGHT = 0.5;
  var _faceBrightness = Object.create(null);
  function faceBrightness(face) {
    if (_faceBrightness[face] != null) return _faceBrightness[face];
    var n = FACE_NORMALS[face];
    var b = 1;
    if (n) {
      b = SHADE_AMBIENT;
      for (var i = 0; i < SHADE_LIGHTS.length; i++) {
        var L = SHADE_LIGHTS[i];
        var d = n[0] * L.x + n[1] * L.y + n[2] * L.z;
        if (d > 0) b += SHADE_WEIGHT * d;
      }
      if (b > 1) b = 1;
      if (b < 0.35) b = 0.35;
    }
    _faceBrightness[face] = b;
    return b;
  }
  // 把亮度换算成霢要叠加的黑色 alpha
  function faceShadeAlpha(face) {
    var b = faceBrightness(face);
    var a = 1 - b;
    return a > 0 ? a : 0;
  }
  // 按法线直接算明暗 (元素带旋转时法线也跟着转, 不能再用面名字查表)
  function normalShadeAlpha(n) {
    var b = SHADE_AMBIENT;
    for (var i = 0; i < SHADE_LIGHTS.length; i++) {
      var L = SHADE_LIGHTS[i];
      var d = n[0] * L.x + n[1] * L.y + n[2] * L.z;
      if (d > 0) b += SHADE_WEIGHT * d;
    }
    if (b > 1) b = 1;
    if (b < 0.35) b = 0.35;
    var a = 1 - b;
    return a > 0 ? a : 0;
  }
  // MC 元素旋转 (FaceBakery.rotateVertexBy): 绕某个轴旋转顶点, 原点取 rotation.origin
  // MC 用的是 -angle 弧度, 这里保持一致
  function rotateAbout(p, axis, angleDeg, origin) {
    if (!angleDeg) return p.slice ? p.slice() : [p[0], p[1], p[2]];
    var rad = -angleDeg * Math.PI / 180;
    var c = Math.cos(rad), sn = Math.sin(rad);
    var o = origin || [0, 0, 0];
    var x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
    var nx = x, ny = y, nz = z;
    if (axis === 'x') { ny = y * c + z * sn; nz = z * c - y * sn; }
    else if (axis === 'y') { nx = x * c - z * sn; nz = z * c + x * sn; }
    else { nx = x * c + y * sn; ny = y * c - x * sn; }
    return [nx + o[0], ny + o[1], nz + o[2]];
  }
  // 方向向量旋转 (不含平移)
  function rotateDir(n, axis, angleDeg) {
    return rotateAbout(n, axis, angleDeg, [0, 0, 0]);
  }

  // ---------------- 3x3 旋转矩阵 (行主序) ----------------
  // 家具元素支持 MC 展示实体式旋转: rotation(单数=绕Y / 3数=欧拉角度 / 4数=四元数 xyzw),
  // 外加 yaw/pitch 实体朝向。两种约定见 furnitureRotationMatrix 上的说明。
  function mat3Mul(a, b) {
    var r = new Array(9);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      }
    }
    return r;
  }
  function mat3Apply(m, p) {
    return [
      m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
      m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
      m[6] * p[0] + m[7] * p[1] + m[8] * p[2]
    ];
  }
  function rotMatX(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }
  // 标准右手系绕 Y 轴旋转 (JOML / 展示实体 transformation 四元数的约定):
  // +X → -Z (+90°); CE 的 rotation 字段走这个约定
  function rotMatY(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }
  // MC 实体 yaw 约定: 0 = +Z(南), 正值顺时针 (俯视), 90 = -X(西)。
  // CE 的 yaw 字段 (实体朝向, armor_stand/better_model/展示实体本体) 走这个约定
  function rotMatYaw(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0, 1, 0, s, 0, c];
  }
  function rotMatZ(deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }
  function quatToMat(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    x /= n; y /= n; z /= n; w /= n;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
    ];
  }
  function axisAngleToMat(axis, deg) {
    var l = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]) || 1;
    var h = deg * Math.PI / 360, s = Math.sin(h);
    return quatToMat([axis[0] / l * s, axis[1] / l * s, axis[2] / l * s, Math.cos(h)]);
  }
  // 绕竖直轴旋转 (度, MC yaw 语义), axisXZ = 旋转中心 [x, z]
  function rotYmc(p, deg, axisXZ) {
    if (!deg) return [p[0], p[1], p[2]];
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var ox = axisXZ ? axisXZ[0] : 0, oz = axisXZ ? axisXZ[1] : 0;
    var x = p[0] - ox, z = p[2] - oz;
    return [ox + x * c - z * s, p[1], oz + x * s + z * c];
  }
  // 元素的 rotation/yaw/pitch → 复合旋转矩阵 (null = 无旋转)
  // 两套约定 (和 CE 一致):
  //   rotation  展示实体的 transformation 旋转 (单数=绕Y / 3数=欧拉角 / 4数=四元数 xyzw),
  //             右手系 (JOML), 与四元数写法自洽; 欧拉角按 X→Y→Z 复合
  //   yaw/pitch 实体朝向 (MC 约定: yaw 0=南, 正值顺时针; pitch 正值低头)
  // 复合次序: rotation → pitch(X) → yaw(Y)
  function furnitureRotationMatrix(el) {
    var m = null;
    var apply = function (nm) { m = m ? mat3Mul(nm, m) : nm; };
    var raw = fval(el.rotation);
    if (raw != null) {
      if (typeof raw === 'number') {
        apply(rotMatY(raw));
      } else if (typeof raw === 'string' || Array.isArray(raw)) {
        var parts = Array.isArray(raw)
          ? raw.map(function (x) { return parseFloat(fval(x)); })
          : String(raw).trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);
        if (parts.length && parts.every(function (x) { return isFinite(x); })) {
          if (parts.length === 1) apply(rotMatY(parts[0]));
          else if (parts.length === 3) {
            if (parts[0]) apply(rotMatX(parts[0]));
            if (parts[1]) apply(rotMatY(parts[1]));
            if (parts[2]) apply(rotMatZ(parts[2]));
          } else if (parts.length >= 4) {
            apply(quatToMat(parts));
          }
        }
      } else {
        var ro = fobj(raw);
        // {angle, axis} 轴角形式 (angle 按弧度, 同展示实体 transformation)
        if (ro && fnum(ro.angle)) {
          apply(axisAngleToMat(fvec(ro.axis, [0, 1, 0]), fnum(ro.angle) * 180 / Math.PI));
        }
      }
    }
    var pitch = fnum(el.pitch);
    if (pitch) apply(rotMatX(pitch));
    var yaw = fnum(el.yaw);
    if (yaw != null && yaw) apply(rotMatYaw(yaw));
    return m;
  }
  // ---------------- 家具坐标系 ----------------
  // 家具里所有相对坐标 (元素 position、碰撞箱 position、座位) 都以「原点方块的底部中心」
  // 为原点 —— 这是 CE 官方默认包的做法 (wooden_chair 的座位 0,0,-0.1 落在方块中心;
  // flower_basket 的 ceiling 变体 position: 0,-0.46,0 正好挂在方块下方)。
  var FURN_ORIGIN = [0.5, 0, 0.5];
  function furnWorld(x, y, z) {   // 家具相对坐标 (方块) → 场景 1/16 方块单位
    return [(FURN_ORIGIN[0] + x) * 16, (FURN_ORIGIN[1] + y) * 16, (FURN_ORIGIN[2] + z) * 16];
  }
  // 元素 → 模型空间(0..16)到世界空间(1/16 单位)的坐标变换, 供 3D 模型渲染使用。
  // 世界点 = anchor + rot * (scale * (p - 8,8,8)), 再整体绕场景竖直轴旋转 viewYaw。
  // 位置: anchor = 原点 + position + translation。position 默认 0,0,0 = 方块底部中心;
  // 官方模型普遍再写 translation: 0,0.5,0 把 0..16 的模型抬到方块正中 (展示实体把模型居中在锚点上)。
  function furnitureElementXf(el, viewYaw) {
    var type = furnitureElementType(el);
    var pos = fvec(el.position, [0, 0, 0]);
    var tr = fvec(el.translation, [0, 0, 0]);
    var sc = fscale(el.scale);
    var rot = furnitureRotationMatrix(el);
    var a = furnWorld(pos[0] + tr[0], pos[1] + tr[1], pos[2] + tr[2]);
    var ax = a[0], ay = a[1], az = a[2];
    return {
      type: type, pos: pos, tr: tr, sc: sc, rot: rot, anchor: [ax, ay, az],
      pt: function (p) {
        var x = (p[0] - 8) * sc[0], y = (p[1] - 8) * sc[1], z = (p[2] - 8) * sc[2];
        if (rot) { var r = mat3Apply(rot, [x, y, z]); x = r[0]; y = r[1]; z = r[2]; }
        var out = rotYmc([ax + x, ay + y, az + z], viewYaw);
        var t = tiltMat(scenePitch);
        return t ? mat3Apply(t, out) : out;
      },
      nrm: function (n) {
        var r = rot ? mat3Apply(rot, [n[0], n[1], n[2]]) : [n[0], n[1], n[2]];
        var out = rotYmc(r, viewYaw);
        var t = tiltMat(scenePitch);
        return t ? mat3Apply(t, out) : out;
      }
    };
  }
  var FURN_IDENTITY_XF = {
    pt: function (p) { return [p[0], p[1], p[2]]; },
    nrm: function (n) { return [n[0], n[1], n[2]]; }
  };

  // ---------------- display 上下文 (ItemTransform) ----------------
  // 物品/方块模型在原版里的展示变换 (models/*/block.json 等), 键为展示上下文:
  //   gui / ground / fixed / head / thirdperson_righthand / thirdperson_lefthand /
  //   firstperson_righthand / firstperson_lefthand / on_shelf (26.4+ 新增)
  // 变换语义 (Minecraft Wiki / BlockBakery): 顶点 p (0..16 模型空间) →
  //   1. scale      p → s∘p
  //   2. rotation   XYZ 欧拉 → R_x·R_y·R_z (先 Z 后 Y 后 X, 角度任意, 非原版 ±45 限制)
  //   3. translation(1/16 单位) 旋转之后平移
  // 左手上下文 = 对应右手上下文整体镜像 (R_pt 里 x → -x), 与 GUI 左手持物的镜像一致。
  var DISPLAY_CONTEXTS = ['gui', 'ground', 'fixed', 'head', 'thirdperson_righthand',
    'thirdperson_lefthand', 'firstperson_righthand', 'firstperson_lefthand', 'on_shelf'];
  function displayContextList() { return DISPLAY_CONTEXTS.slice(); }
  // 沿 parent 链逐层合并 display (子级按上下文覆盖父级, 上下文内字段也逐个覆盖)。
  // loadModelChain 只保留最近一层有 display 的模型, 这里需要完整链上的 JSON。
  async function collectDisplayChain(modelId, depth, defaultNs) {
    depth = depth || 0;
    if (depth > 8) return {};
    var id = normalizeResourceId(modelId, defaultNs || activeNamespace() || 'minecraft');
    var json = null;
    try { json = await loadJsonAny('model', id); } catch (e) { json = null; }
    var merged = {};
    if (json && json.parent) merged = await collectDisplayChain(json.parent, depth + 1, resourceNamespace(id));
    if (json && json.display) {
      var dk = Object.keys(json.display);
      for (var i = 0; i < dk.length; i++) {
        var ctxName = dk[i];
        var base = isObj(merged[ctxName]) ? Object.assign({}, merged[ctxName]) : {};
        var own = json.display[ctxName];
        if (isObj(own)) {
          var fk = Object.keys(own);
          for (var j = 0; j < fk.length; j++) base[fk[j]] = own[fk[j]];
        }
        merged[ctxName] = base;
      }
    }
    return merged;
  }
  // 上下文名归一: 接受缩写 (3rd/1st, 简写 righthand 等), 找不到就返回 null
  function normalizeDisplayContext(name) {
    var s = String(name || '').trim().toLowerCase().replace(/^minecraft:/, '');
    if (!s) return null;
    var all = DISPLAY_CONTEXTS;
    for (var i = 0; i < all.length; i++) if (all[i] === s) return all[i];
    var alias = s
      .replace(/^thirdperson/, 'thirdperson').replace(/^firstperson/, 'firstperson')
      .replace(/^3rd_?person/, 'thirdperson').replace(/^1st_?person/, 'firstperson')
      .replace(/^third/, 'thirdperson').replace(/^first$/, 'firstperson')
      .replace(/_?right_?hand$/, 'righthand').replace(/_?left_?hand$/, 'lefthand');
    var cand = [];
    if (alias.indexOf('thirdperson') === 0) {
      cand.push(alias.indexOf('left') >= 0 ? 'thirdperson_lefthand' : 'thirdperson_righthand');
    } else if (alias.indexOf('firstperson') === 0) {
      cand.push(alias.indexOf('left') >= 0 ? 'firstperson_lefthand' : 'firstperson_righthand');
    }
    for (var c = 0; c < cand.length; c++) {
      for (var k = 0; k < all.length; k++) if (all[k] === cand[c]) return all[k];
    }
    // 最后按包含关系猜 (比如 "head" / "fixed" / "ground" / "gui" 的变体拼写)
    for (var m = 0; m < all.length; m++) {
      if (all[m].indexOf(s) === 0 || s.indexOf(all[m]) === 0) return all[m];
    }
    return null;
  }
  // 把一条 ItemTransform 变成与 furnitureElementXf 同构的 xf (供 collectFacesFromModel 用)。
  // centred: 旋转/缩放围绕模型中心 (8,8,8) —— MC 的 ItemTransform 就是这样做的
  // (BlockBakery 先把模型平移到 -8..8, 应用变换, 再放回 0..16)。
  // yaw (度, MC 语义): 场景视角旋转; pitch: 场景俯仰 —— 都作用在变换结果上 (与家具场景一致)。
  // mirrorLeft: 左手上下文的 x 镜像 (在旋转之后)。
  function displayXf(tr, yaw, mirrorLeft, pitch) {
    tr = tr || {};
    var sc = fscale(tr.scale != null ? tr.scale : 1);
    var rot = tr.rotation;
    var m = null;
    if (rot != null) {
      var parts = Array.isArray(rot)
        ? rot.map(function (x) { return parseFloat(x); })
        : String(rot).trim().split(/[\s,]+/).filter(Boolean).map(parseFloat);
      if (parts.length === 3 && parts.every(function (x) { return isFinite(x); })) {
        // R = R_x·R_y·R_z (右乘次序: 顶点先被 Z 旋转)
        m = mat3Mul(rotMatX(parts[0]), mat3Mul(rotMatY(parts[1]), rotMatZ(parts[2])));
      }
    }
    var tv = fvec(tr.translation, [0, 0, 0]);
    var scx = sc[0], scy = sc[1], scz = sc[2];
    var hasRot = !!m, hasMirror = !!mirrorLeft;
    return {
      tr: tr, sc: sc, rot: m, translation: tv,
      pt: function (p) {
        var x = (p[0] - 8) * scx, y = (p[1] - 8) * scy, z = (p[2] - 8) * scz;
        if (hasRot) { var r = mat3Apply(m, [x, y, z]); x = r[0]; y = r[1]; z = r[2]; }
        if (hasMirror) x = -x;
        var out = [x + tv[0], y + tv[1], z + tv[2]];
        if (yaw) out = rotYmc(out, yaw);
        var t = tiltMat(pitch);
        return t ? mat3Apply(t, out) : out;
      },
      nrm: function (n) {
        var r = hasRot ? mat3Apply(m, [n[0], n[1], n[2]]) : [n[0], n[1], n[2]];
        if (hasMirror) r = [-r[0], r[1], r[2]];
        var out = yaw ? rotYmc(r, yaw) : r;
        var t = tiltMat(pitch);
        return t ? mat3Apply(t, out) : out;
      }
    };
  }

  // 收集一个模型在给定变换下的全部可见面 (不含贴图加载)。
  // view: 「变换后空间」里的视图向量 (默认 VIEW = 等轴测); 物品栏 GUI 场景传 GUI_SLOT_VIEW
  // (烘焙后的正视角: +Z 朝观察者)。面按深度升序返回 (先远后近, 画的时候就是正确的遮挡)。
  // 返回 [{face, corners(世界坐标), uvs, texId, depth, shade, shadeAlpha}] 或 null。
  async function collectModelFaces(modelId, xf) {
    var model = await loadModelChain(modelId);
    return collectFacesFromModel(model, xf);
  }
  // 平面物品元素 (item/generated 那种一张贴图) 的等价卡片模型:
  // 一张竖直的 16x16 面 —— 这样元素 rotation/yaw 和视角旋转都能真正作用到它身上
  // (MC 的展示实体本来也是把平面模型当竖直卡片渲染, 不是永远朝向镜头)。
  // 正反两面都建, 从背面看就是左右镜像的贴图, 和游戏里一致;
  // shade: false —— 贴图不做方向光压暗, 保持物品原本的颜色 (和旧的平面图标观感一致)。
  function flatCardModel(textureId) {
    return {
      textures: { layer0: textureId },
      elements: [{
        from: [0, 0, 7.5], to: [16, 16, 8.5],
        faces: {
          north: { texture: '#layer0', shade: false },
          south: { texture: '#layer0', shade: false }
        }
      }]
    };
  }
  // 模型没有几何体 (只有 parent 链 + 贴图, 如 item/generated 一族) → 该按平面卡片画。
  // 带 elements 的模型 (方块/家具) 返回 false, 必须按 3D 几何体渲染。
  // 异步版: 缓存里没有时先加载再判 (scene.modelId 直指的模型此前从未加载过), 加载失败同样拍平。
  async function flatKindModelAsync(modelId) {
    // 缓存里存的是 Promise (loadModelChain 的返回值), 必须先 await 拿到真正的模型 ——
    // 直接读 .elements 永远是 undefined, 任何加载过的模型都会被误判成「平面」。
    var hit = (_modelCache && _modelCache.has && _modelCache.has(modelId))
      ? _modelCache.get(modelId) : loadModelChain(modelId);
    var m = null;
    try { m = await hit; } catch (e) { m = null; }
    if (!m) return false;                        // json 都读不到 → 交给后续 model-json-missing 分支报错
    return !(Array.isArray(m.elements) && m.elements.length);
  }
  function collectFacesFromModel(model, xf, view) {
    if (!model || !Array.isArray(model.elements)) return null;
    var T = xf || FURN_IDENTITY_XF;
    // 视图向量 (变换后空间): 默认等轴测 VIEW; 物品栏 GUI 场景传 GUI_SLOT_VIEW (正交直视 +Z)
    var V = view || VIEW;
    var faces = [];
    for (var e = 0; e < model.elements.length; e++) {
      var el = model.elements[e];
      if (!el || !Array.isArray(el.from) || !Array.isArray(el.to)) continue;
      var rot = el.rotation || null;
      var rotAxis = rot && rot.angle ? String(rot.axis || 'y').toLowerCase() : null;
      var rotAngle = rotAxis ? Number(rot.angle) || 0 : 0;
      var rotOrigin = rotAxis ? (Array.isArray(rot.origin) && rot.origin.length === 3 ? rot.origin : [8, 8, 8]) : null;
      var f = el.from, tt = el.to;
      var faceNames = Object.keys(el.faces || {});
      for (var fi = 0; fi < faceNames.length; fi++) {
        var face = faceNames[fi];
        var nrm = FACE_NORMALS[face];
        if (!nrm) continue;
        var visN = T.nrm(rotAxis ? rotateDir(nrm, rotAxis, rotAngle) : nrm);
        if ((visN[0] * V.x + visN[1] * V.y + visN[2] * V.z) <= 0.0001) continue;
        var fd = el.faces[face];
        if (!fd) continue;
        var texId = resolveTextureRef(model, fd.texture);
        if (!texId) continue;
        var uv = fd.uv && fd.uv.length === 4 ? fd.uv.slice() : defaultUV(face, f, tt);
        var corners = faceCorners(face, f, tt);
        if (rotAxis) {
          corners = corners.map(function (p) { return rotateAbout(p, rotAxis, rotAngle, rotOrigin); });
        }
        corners = corners.map(function (p) { return T.pt(p); });
        var uvs = uvQuad(face, uv, corners);
        // face.rotation: 把角 「UV」的对应关系整体旋转 90°/180°/270° (MC FaceBakery 的做法)
        var steps = ((((fd.rotation || 0) % 360) + 360) % 360) / 90;
        if (steps) uvs = uvs.slice(steps).concat(uvs.slice(0, steps));
        var cxm = 0, cym = 0, czm = 0;
        corners.forEach(function (p) { cxm += p[0] / 4; cym += p[1] / 4; czm += p[2] / 4; });
        faces.push({ face: face, corners: corners, uvs: uvs, texId: texId,
          depth: cxm * V.x + cym * V.y + czm * V.z,
          shade: fd.shade !== false && el.shade !== false, tint: fd.tintindex,
          shadeAlpha: (rotAxis || xf) ? normalShadeAlpha(visN) : null });
      }
    }
    // 先远后近 (depth 小 = 离观察者远), 画的时候就是正确的画家算法遮挡
    faces.sort(function (a, b) { return a.depth - b.depth; });
    return faces.length ? faces : null;
  }

  async function drawBlockModel(ctx, modelId, cx, cy, size, xf) {
    var faces = await collectModelFaces(modelId, xf);
    if (!faces) return false;
    // 加载贴图 (动画贴图取第一帧)
    var texCache = {};
    for (var i = 0; i < faces.length; i++) {
      var id = faces[i].texId;
      if (!texCache[id]) texCache[id] = await loadTextureFrame('texture', id);
      var fr = texCache[id];
      if (fr) {
        faces[i].img = fr.img;
        faces[i].sx = fr.sx; faces[i].sy = fr.sy;
        faces[i].sw = fr.sw; faces[i].sh = fr.sh;
      } else {
        faces[i].img = null;
      }
    }
    // 缩放: 16 单位方块在等轴测下宽 (x+z)*cos30 ≈27.7, 高 (x+z)*sin30 + y = 32
    var unit = size / 32;
    ctx.save();
    paintFaces(ctx, faces, unit, cx, cy);
    ctx.restore();
    return true;
  }
  // CraftEngine block_item / inline block fallback used by hotbar, tooltip and inventory.
  async function drawCraftBlockData(ctx, data, cx, cy, size) {
    var visual = await resolveBlockVisual(data, activeNamespace() || 'minecraft');
    (visual.warnings || []).forEach(function (w) { warn(w); });
    var chain = await blkBuildGeometry(visual);
    var faces = chain ? (collectFacesFromModel(chain.model, FURN_IDENTITY_XF) || []) : null;
    if (!faces) return false;
    var texCache = {};
    for (var i = 0; i < faces.length; i++) {
      var id = faces[i].texId;
      if (!texCache[id]) texCache[id] = await loadTextureFrame('texture', id);
      var fr = texCache[id];
      if (fr) {
        faces[i].img = fr.img;
        faces[i].sx = fr.sx; faces[i].sy = fr.sy;
        faces[i].sw = fr.sw; faces[i].sh = fr.sh;
      } else faces[i].img = null;
    }
    paintFaces(ctx, faces, size / 32, cx, cy);
    return true;
  }
  // 把已收集 (已变换/已排序) 的面画到 (ox, oy) 屏幕锚点上。
  // projFn: 世界坐标 → 屏幕坐标 (单位仍要乘 unit), 默认等轴测 project();
  // 物品栏 GUI 场景传 projectGui (正交直视, 1 单位 = 1 像素, y 翻转朝上)。
  function paintFaces(ctx, faces, unit, ox, oy, projFn) {
    var proj = projFn || project;
    for (var k = 0; k < faces.length; k++) {
      var fc = faces[k];
      if (!fc.img) continue;
      drawTexturedQuad(ctx, fc, unit, ox, oy, proj);
    }
  }
  function drawTexturedQuad(ctx, fc, unit, ox, oy, projFn) {
    var proj = projFn || project;
    var pts = fc.corners.map(function (p) {
      var s = proj(p[0], p[1], p[2]);
      return { x: ox + s.x * unit, y: oy + s.y * unit };
    });
    // UV (0..16) ?贴图坐标 (动画帧: fc.sw/sh/sx/sy 指向帧条中的那一帧)
    var tw = fc.sw != null ? fc.sw : fc.img.width;
    var th = fc.sh != null ? fc.sh : fc.img.height;
    var u0 = fc.sx || 0, v0 = fc.sy || 0;
    var uv = fc.uvs.map(function (q) {
      return { u: u0 + (q[0] / 16) * tw, v: v0 + (q[1] / 16) * th };
    });
    // 仿射: ?3 个角点解?(平行四边形精?
    var p0 = pts[0], p1 = pts[1], p3 = pts[3];
    var q0 = uv[0], q1 = uv[1], q2 = uv[3];
    var det = (q1.u - q0.u) * (q2.v - q0.v) - (q2.u - q0.u) * (q1.v - q0.v);
    if (Math.abs(det) < 1e-6) return;
    var a = ((p1.x - p0.x) * (q2.v - q0.v) - (p3.x - p0.x) * (q1.v - q0.v)) / det;
    var b = ((p3.x - p0.x) * (q1.u - q0.u) - (p1.x - p0.x) * (q2.u - q0.u)) / det;
    var c = ((p1.y - p0.y) * (q2.v - q0.v) - (p3.y - p0.y) * (q1.v - q0.v)) / det;
    var d = ((p3.y - p0.y) * (q1.u - q0.u) - (p1.y - p0.y) * (q2.u - q0.u)) / det;
    var e0 = p0.x - a * q0.u - b * q0.v;
    var f0 = p0.y - c * q0.u - d * q0.v;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, c, b, d, e0, f0);
    try { ctx.drawImage(fc.img, fc.sx || 0, fc.sy || 0, tw, th, 0, 0, tw, th); } catch (err) { /* ignore */ }
    ctx.restore();
    if (fc.shade) {
      var alpha = fc.shadeAlpha != null ? fc.shadeAlpha : faceShadeAlpha(fc.face);
      if (alpha > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 有平面的纹理能直接当 16x16 图标; 否则用方块模?
  async function drawItem(ctx, itemRef, x, y, size) {
    size = size || 16;
    var res = { kind: 'none', error: null };
    try {
      var info = await resolveItemModel(itemRef);
      res.kind = info.kind;
      if (info.kind === 'none') return res;
      if (info.kind === 'ce-block' && info.blockData) {
        if (await drawCraftBlockData(ctx, info.blockData, x + size / 2, y + size / 2, size)) return res;
        return res;
      }
      if (info.kind === 'block' && info.model) {
        var ok = await drawBlockModel(ctx, info.model, x + size / 2, y + size / 2, size);
        if (ok) return res;
        // 方块模型不可用时尝试它的纹理
        var t2 = await flatTextureOf(info.model);
        if (t2) { info = { kind: 'flat', texture: t2 }; res.kind = 'flat'; }
        else return res;
      }
      if (info.model && !info.texture) {
        var t3 = await flatTextureOf(info.model);
        if (t3) info.texture = t3;
      }
      if (info.texture) {
        var fr2 = await loadTextureFrame('texture', info.texture);
        if (fr2) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fr2.img, fr2.sx, fr2.sy, fr2.sw, fr2.sh, x, y, size, size);
          ctx.restore();
          return res;
        }
        res.error = 'missing texture ' + info.texture;
        // 缺贴图时用占?
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = 'rgba(255,80,80,0.85)';
        ctx.fillRect(x, y, size, 1); ctx.fillRect(x, y + size - 1, size, 1);
        ctx.fillRect(x, y, 1, size); ctx.fillRect(x + size - 1, y, 1, size);
        return res;
      }
      // 完全没有可用资源
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, size, size);
      return res;
    } catch (e) {
      res.error = String(e && e.message || e);
      return res;
    }
  }

  // ---------------- 界面尺寸 (GUI Scale) ----------------
  // MC 的「界面尺寸」把整个 GUI 从「GUI 像素」放大成屏幕像素 —— 字体图像的像素数
  // 也随之变化 (height: 140 在 3x 下就是 420 个屏幕像素高)。这里用同一个模型:
  // 场景先按 GUI 像素原尺寸绘制, 再整体按界面尺寸做整数倍最近邻放大 (和原版一样是方块感,
  // 但绝不会糊)。0 / 缺省 = 自动, 选一个能放进预览区且不超过 4 的最大倍率。
  var GUI_SCALE_MAX = 6;   // 「自动」能到几倍 (窗口拉大后预览也跟着变大; 手动还能选到 6x)
  var _stageW = 0;
  function setStageWidth(w) { _stageW = w > 0 ? Math.round(w) : 0; }
  function normScale(v) {
    var n = parseInt(v, 10);
    if (!isFinite(n) || n <= 0) return 0;   // 0 = 自动
    return clamp(n, 1, 8);
  }
  function autoScaleFor(logicalW) {
    if (!_stageW || !logicalW) return 1;
    var avail = Math.max(64, _stageW - 36);  // 预览区左右内边距
    // 选能放进预览区的最小倍率 (和 MC 的「自动」一个思路), 不强行放大 ——
    // 1x 就是 height 个像素的原尺寸, 图像按原始 PNG 一次性采样, 不会因为被放大而变糊
    for (var s = 1; s <= GUI_SCALE_MAX; s++) {
      if (logicalW * s > avail) return Math.max(1, s - 1);
    }
    return GUI_SCALE_MAX;
  }
  // ---------------- 画布 / 场景 ----------------
  // 关键: 画布直接按「最终设备像素」分配, 再用 setTransform 把逻辑(GUI)像素放大到设备像素。
  // 这样每个字形/字体图像都是「从原始 PNG 一次性采样到最终尺寸」——
  // 而不是先缩到 height 再整体放大 (那会先丢一次细节, 放大后就成了糊掉的方块)。
  // MC 用的是 NEAREST 过滤, 所以 1 次采样的方块感才是原版效果。
  function makeSurface(w, h, scale, basisW) {
    // scale <= 0 = 自动: 按逻辑宽度和预览区宽度选倍率 (basisW 可覆盖用于计算的宽度)
    var s = scale > 0 ? Math.max(1, scale | 0) : autoScaleFor(basisW || w);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * s));
    cv.height = Math.max(1, Math.ceil(h * s));
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0);
    return { canvas: cv, ctx: ctx, scale: s, w: w, h: h };
  }
  // 画布已经是最终分辨率, blit 只做 1:1 搬运 (不再重采样)
  function blit(canvas, surface) {
    canvas.width = surface.canvas.width;
    canvas.height = surface.canvas.height;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(surface.canvas, 0, 0);
    if (canvas.style) {
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
    }
    canvas.setAttribute && canvas.setAttribute('data-gui-scale', String(surface.scale || 1));
  }

  // 一行的实际占位: 字体图像/高字形会向上(基线以上)和向下同时撑开。
  // MC 本身允许图像压到上一行, 但预览里那样会糊成一团, 所以这里按内容撑开 —
  // 关键是「基线以上」的高度也必须算进去, 否则 ascent 大的字体图像会被画布顶边切掉
  // (CE 内置 GUI 图的 ascent 高达 18~20, 而普通文字只有 7)。
  var LINE_ASCENT = 7;   // 普通文字: 基线以上 7px
  function lineMetricsOf(items) {
    var up = LINE_ASCENT, down = LINE_HEIGHT - LINE_ASCENT;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.kind === 'break') continue;
      if (it.kind === 'image') {
        if (it.info && !it.info.offsetOnly) {
          var ih = imageRenderHeight(it.info.height, 8);
          var ia = (typeof it.info.ascent === 'number' && isFinite(it.info.ascent)) ? it.info.ascent : ih - 1;
          if (ia > up) up = ia;
          if (ih - ia > down) down = ih - ia;
        }
        continue;
      }
      if (it.kind === 'head') { if (8 > up) up = 8; continue; }
      if (it.kind !== 'glyph') continue;
      var g = glyphFor(it.cp, it.style && it.style.font);
      if (!g || g.type === 'space' || g.offsetOnly) continue;
      var gh = Number(g.h);
      if (!isFinite(gh) || gh < 0) gh = 0;
      var a = (typeof g.ascent === 'number' && isFinite(g.ascent)) ? g.ascent : (gh - 1);
      if (a > up) up = a;
      if (gh - a > down) down = gh - a;
    }
    return { up: up, down: down, height: up + down };
  }
  function lineHeightOf(items) {
    return lineMetricsOf(items).height;
  }

  // ---- 聊天场景 ----
  async function sceneChat(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    var chatW = parseInt(scene.chatWidth, 10) || 320;
    var lines = [].concat(scene.lines || []);
    var o = Object.assign({}, options, scene.options || {});
    var parsed = [];
    var textW = 0;
    for (var i = 0; i < lines.length; i++) {
      var raw = typeof lines[i] === 'string' ? lines[i] : (lines[i].text || '');
      var sender = (typeof lines[i] === 'object' && lines[i].sender) ? ('<' + lines[i].sender + '> ') : '';
      var wrapped = wrapText(sender + raw, chatW, o);
      for (var w = 0; w < wrapped.length; w++) {
        var p = parseTextWith(wrapped[w], o);
        p.metrics = lineMetricsOf(p.items);
        p.advance = p.metrics.height;
        parsed.push(p);
        textW = Math.max(textW, p.width);
      }
    }
    var padX = 2, padY = 3;
    var totalH = padY * 2;
    for (var ph = 0; ph < Math.max(1, parsed.length); ph++) {
      totalH += parsed[ph] ? parsed[ph].advance : LINE_HEIGHT;
    }
    var cw = Math.max(80, Math.min(chatW + padX * 2, textW + padX * 2 + 4));
    var surf = makeSurface(cw, totalH, scale);
    // 聊天半明背景
    surf.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    surf.ctx.fillRect(0, 0, cw, totalH);
    var y = padY + 7;
    for (var k = 0; k < parsed.length; k++) {
      drawItems(surf.ctx, parsed[k].items, padX + 1, y, { shadow: true });
      y += parsed[k].advance || LINE_HEIGHT;
    }
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  function parseTextWith(text, o) {
    return parseText(text, o || {});
  }

  // ---- 物品 Lore / 悬浮提示 ----
  // 抽出「工具提示面板」的画法, 供物品提示(lore)与物品栏(item)两个场景共用
  async function buildTooltipSurface(scene, forceNoItem, scaleOverride) {
    var name = scene.name != null ? String(scene.name) : '';
    var lore = (scene.lore || []).map(function (x) { return typeof x === 'string' ? x : String(x && x.text || ''); });
    var pName = parseText(name, {});
    var pLore = lore.map(function (l) { return parseText(l, {}); });
    var itemSize = 16;
    var showItem = !forceNoItem && scene.showItem !== false;
    var hasIcon = !!(scene.item || scene.itemId);
    if (showItem && !hasIcon) showItem = false;
    var iconW = showItem ? itemSize + 4 : 0;
    var contentW = Math.max(pName.width, Math.max.apply(null, [0].concat(pLore.map(function (p) { return p.width; }))));
    var padX = 6, padY = 5;
    var w = contentW + padX * 2 + iconW;
    // 行高固定 9px: 与游戏一致 —— 字体图像比文字高时会溢出, 不去撑开 (按用户要求照抄游戏行为)
    var h = padY * 2 + LINE_HEIGHT + (pLore.length ? 2 + pLore.length * LINE_HEIGHT : 0);
    var surf = makeSurface(Math.max(40, w), Math.max(20, h),
      scaleOverride != null ? scaleOverride : normScale(scene.scale));
    // 背景 (MC 工具提示: #100010 底 + 边框)
    var border = rarityBorder(scene.rarity);
    surf.ctx.fillStyle = 'rgba(16,0,16,0.94)';
    surf.ctx.fillRect(0, 0, surf.w, surf.h);
    surf.ctx.strokeStyle = border;
    surf.ctx.lineWidth = 1;
    surf.ctx.strokeRect(0.5, 0.5, surf.w - 1, surf.h - 1);
    if (showItem) {
      await drawItem(surf.ctx, scene.item || scene.itemId, padX, padY, itemSize);
    }
    var tx = padX + iconW;
    drawItems(surf.ctx, pName.items, tx, padY + 7, { shadow: true });
    var ly = padY + LINE_HEIGHT + 2 + 7;
    for (var i = 0; i < pLore.length; i++) {
      drawItems(surf.ctx, pLore[i].items, tx, ly, { shadow: true });
      ly += LINE_HEIGHT;
    }
    return surf;
  }
  async function sceneLore(canvas, scene) {
    await fontReady();
    var surf = await buildTooltipSurface(scene, false);
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  function rarityBorder(r) {
    switch (r) {
      case 'uncommon': return '#FFFF55';
      case 'rare': return '#55FFFF';
      case 'epic': return '#FF55FF';
      default: return '#2D0A63';
    }
  }

  // ---- 物品栏 (物品/方块预览的默认场景) ----
  // 上方是悬浮提示, 下方是原版快捷栏 1x9 格子, 物品放在第一格并显示堆叠数 ——
  // 与游戏内「鼠标悬停在快捷栏物品上」看到的画面一致。
  var HOTBAR_SRC_X = 7, HOTBAR_SRC_Y = 197, HOTBAR_SRC_W = 163, HOTBAR_SRC_H = 18;
  async function sceneItem(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    // 先按 1x 量出提示框的逻辑尺寸, 再据此定下整个场景的倍率, 最后按同一倍率重建提示框 ——
    // 否则「自动」下内层提示框和外层画布可能选到不同倍率, 贴上去就会错位/糊掉
    var tip = await buildTooltipSurface(scene, false, scale > 0 ? scale : 1);
    var gui = await loadImageAny('texture', GUI_GENERIC);
    var stripW = HOTBAR_SRC_W, stripH = HOTBAR_SRC_H, gap = 10;
    var PAD = 4;
    var W = Math.max(stripW, tip.w) + PAD * 2;
    var H = tip.h + gap + stripH + PAD * 2;
    var finalScale = scale > 0 ? scale : autoScaleFor(W);
    if (finalScale !== tip.scale) tip = await buildTooltipSurface(scene, false, finalScale);
    var surf = makeSurface(W, H, finalScale);
    // tip 已经是最终分辨率, 这里按它的「逻辑尺寸」摆放, 变换会把它映射回同样大小的设备像素 (1:1)
    surf.ctx.drawImage(tip.canvas, Math.round((W - tip.w) / 2), PAD, tip.w, tip.h);
    var sx = Math.round((W - stripW) / 2);
    var sy = PAD + tip.h + gap;
    if (gui) {
      surf.ctx.drawImage(gui, HOTBAR_SRC_X, HOTBAR_SRC_Y, HOTBAR_SRC_W, HOTBAR_SRC_H, sx, sy, stripW, stripH);
    } else {
      drawFallbackHotbar(surf.ctx, sx, sy);
      warn('gui-texture-missing');
    }
    var slot0x = sx + 1, slot0y = sy + 1;
    await drawItem(surf.ctx, scene.item || scene.itemId, slot0x, slot0y, 16);
    var count = scene.count != null ? scene.count : 1;
    if (count > 1) {
      var pCount = parseText(String(count), { style: { color: hexToRgb('#FFFFFF'), shadow: true } });
      drawItems(surf.ctx, pCount.items, slot0x + 17 - pCount.width, slot0y + 8 + 7, { shadow: true });
    }
    // 原版「选中框」: 第一格加一圈白色描边
    surf.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    surf.ctx.lineWidth = 1;
    surf.ctx.strokeRect(sx + 0.5, sy + 0.5, 17, 17);
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  function drawFallbackHotbar(ctx, sx, sy) {
    ctx.fillStyle = '#8B8B8B';
    ctx.fillRect(sx, sy, HOTBAR_SRC_W, HOTBAR_SRC_H);
    ctx.fillStyle = '#373737';
    ctx.fillRect(sx, sy, HOTBAR_SRC_W, 1);
    ctx.fillRect(sx, sy, 1, HOTBAR_SRC_H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sx, sy + HOTBAR_SRC_H - 1, HOTBAR_SRC_W, 1);
    ctx.fillRect(sx + HOTBAR_SRC_W - 1, sy, 1, HOTBAR_SRC_H);
    for (var c = 1; c < 9; c++) {
      ctx.fillStyle = '#373737';
      ctx.fillRect(sx + c * 18, sy, 1, HOTBAR_SRC_H);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx + c * 18 - 1, sy, 1, HOTBAR_SRC_H);
    }
  }

  // ---- 原版容器 GUI (9x1 ~ 9x6) ----
  var GUI_GENERIC = 'minecraft:gui/container/generic_54';
  async function loadGuiTexture() {
    return loadImageAny('texture', GUI_GENERIC);
  }
  async function sceneGui(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    var rows = clamp(parseInt(scene.rows, 10) || 3, 1, 6);
    var img = await loadGuiTexture();
    var imageHeight = 114 + 18 * rows;
    var W = 176, H = imageHeight;
    var surf = makeSurface(W, H, scale);
    if (img) {
      // 顶部 17px + 重复行带(18px x rows) + 玩家背包带 96px。
      // 原版玩家背包带从纹理 y=126 开始 (96px 高) —— 槽位内容在其中相对 +14/+32/+50/+72,
      // 贴到 17+rows*18 后恰落在原版槽位坐标 103+18i+(rows-4)*18 / 161+(rows-4)*18。
      // 从 125 起会整体低 1px (整个玩家物品栏下沉)。
      surf.ctx.drawImage(img, 0, 0, 176, 17, 0, 0, 176, 17);
      for (var r = 0; r < rows; r++) {
        surf.ctx.drawImage(img, 0, 17, 176, 18, 0, 17 + r * 18, 176, 18);
      }
      surf.ctx.drawImage(img, 0, 126, 176, 96, 0, 17 + rows * 18, 176, 96);
    } else {
      // 无贴图时手绘丢个近似容?
      drawFallbackContainer(surf.ctx, W, H, rows);
      warn('gui-texture-missing');
    }
    // 标题 (MC: titleLabelX=8, titleLabelY=6, 颜色 0xFF404040)
    // 与游戏一致: 不因为标题里有高字体图像就把界面下移, 溢出部分按原样被裁
    if (scene.title != null && scene.title !== '') {
      var pTitle = parseText(String(scene.title), { style: { color: hexToRgb('#404040'), shadow: false } });
      drawItems(surf.ctx, pTitle.items, 8, 6 + 7, { shadow: false });
    }
    // 物品
    var items = scene.items || [];
    var slots = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < 9; col++) slots.push({ x: 8 + 18 * col, y: 18 + 18 * row });
    }
    // 玩家背包带贴图从目标 y = 17 + rows*18 起 (顶部 17px + rows 行) —— 槽位内容区
    // 相对该带 +14/+32/+50/+72 → 原版槽位 y = 103 + 18i + (rows-4)*18, 快捷栏 +58。
    // 若按 18 + rows*18 + 14 计算会整体低 1px (贴图带原点在 17 而非 18)。
    if (scene.fillPlayerInventory !== false) {
      var pyBand = 17 + rows * 18 + 14;
      for (var pr = 0; pr < 3; pr++) {
        for (var pc = 0; pc < 9; pc++) {
          slots.push({ x: 8 + 18 * pc, y: pyBand + 18 * pr });
        }
      }
      for (var hc = 0; hc < 9; hc++) {
        slots.push({ x: 8 + 18 * hc, y: pyBand + 58 });
      }
    }
    for (var i = 0; i < items.length && i < slots.length; i++) {
      var it = items[i];
      if (!it) continue;
      var sl = slots[i];
      await drawItem(surf.ctx, it, sl.x, sl.y, 16);
      if (it.count != null && it.count > 1) {
        var cs = String(it.count);
        var pCount = parseText(cs, { style: { color: hexToRgb('#FFFFFF'), shadow: true } });
        // MC: drawString(text, x + 17 - width, y + 9, white, true) —?这里?y 是文字顶?
        // ?drawItems ?y 是基? 默认字形 ascent=7, 故基?= 顶部 + 7
        var cx2 = sl.x + 17 - pCount.width;
        drawItems(surf.ctx, pCount.items, cx2, sl.y + 9 + 7, { shadow: true });
      }
    }
    // 悬浮槽高?
    if (scene.hoverSlot != null && slots[scene.hoverSlot]) {
      var hs = slots[scene.hoverSlot];
      surf.ctx.save();
      surf.ctx.fillStyle = 'rgba(255,255,255,0.55)';
      surf.ctx.fillRect(hs.x, hs.y, 16, 16);
      surf.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      surf.ctx.lineWidth = 1;
      surf.ctx.strokeRect(hs.x - 0.5, hs.y - 0.5, 17, 17);
      surf.ctx.restore();
    }
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  function drawFallbackContainer(ctx, W, H, rows) {
    // 近似原版容器: #C6C6C6 ?+ 3D 边框
    ctx.fillStyle = '#C6C6C6';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, 0, 1, H);
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, H - 1, W, 1); ctx.fillRect(W - 1, 0, 1, H);
    drawSlotRect(ctx, 8 + 18 * 0, 18, 18 * 9 + 2, rows * 18 + 2);
    var pyIn = 17 + rows * 18 + 14;   // 与贴图带原点 (17 + rows*18) 一致, 不然低 1px
    drawSlotRect(ctx, 8, pyIn, 18 * 9 + 2, 18 * 3 + 2);
    drawSlotRect(ctx, 8, pyIn + 58, 18 * 9 + 2, 18 + 2);
  }
  function drawSlotRect(ctx, x, y, w, h) {
    ctx.fillStyle = '#8B8B8B';
    ctx.fillRect(x - 1, y - 1, w, h);
    ctx.fillStyle = '#373737';
    ctx.fillRect(x - 1, y - 1, w, 1); ctx.fillRect(x - 1, y - 1, 1, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 1, y + h - 2, w, 1); ctx.fillRect(x + w - 2, y - 1, 1, h);
  }

  // ---------------- 原版生存物品栏 GUI (物品模型按 gui 上下文渲染) ----------------
  // 与 sceneGui (generic_54 容器) 不同: 这里画的是玩家自带的生存物品栏
  // (textures/gui/container/inventory), 物品不再走 drawItem 的「平面/等轴测」两条路,
  // 而是原版槽位渲染管线 —— display.gui 的 ItemTransform 烘进模型后正交直视。
  var GUI_INVENTORY = 'minecraft:gui/container/inventory';
  var INV_W = 176, INV_H = 166;   // 原版该贴图 256x256, 有效区 176x166
  // 原版模型没有 display 时, block/block.json 的 [30,225,0]/0.625 也拿不到 (gui 上下文为空),
  // 渲染结果会是一坨 16x16 的正投影 —— 这在原版是真的, 但观感不对。
  // 这里对 3D 模型回退到标准方块 gui 变换 (和原版 block/block.json 一致), 并发 warning。
  var GUI_FALLBACK_TR = { rotation: [30, 225, 0], translation: [0, 0, 0], scale: 0.625 };

  // 生存物品栏槽位坐标 (InventoryMenu: armor 8, 8+i*18; 合成 98+j*18, 18+i*18;
  // 成品 154, 28; 主背包 8+j*18, 84+i*18; 快捷栏 8+j*18, 142)。返回 [{key, x, y}]。
  function inventorySlots() {
    var s = [], i, j;
    for (i = 0; i < 4; i++) s.push({ key: 'armor' + i, x: 8, y: 8 + i * 18 });
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) s.push({ key: 'craft' + i + j, x: 98 + j * 18, y: 18 + i * 18 });
    s.push({ key: 'result', x: 154, y: 28 });
    for (i = 0; i < 3; i++) for (j = 0; j < 9; j++) s.push({ key: 'main' + i + j, x: 8 + j * 18, y: 84 + i * 18 });
    for (j = 0; j < 9; j++) s.push({ key: 'hotbar' + j, x: 8 + j * 18, y: 142 });
    return s;
  }

  // 单个槽位的物品渲染: (sx, sy) = 槽位 16x16 内容区原点 (与原版槽位坐标一致,
  // 不是 18x18 格子的外框 —— 差这一像素就是用户看到的物品整体偏右下)。
  // 平面物品 = 16x16 贴图 (与原版一致);
  // 3D 模型 = display.gui ItemTransform + 正交投影 (projectGui), 单位 1:1, 居中在槽位。
  // 解析不出 / 贴图缺失: 画 drawItem 同款占位框并警告 (原版此时什么都不画, 预览里明示更好排查)
  function drawInvPlaceholder(ctx, sx, sy) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = 'rgba(255,80,80,0.85)';
    ctx.fillRect(sx, sy, 16, 1); ctx.fillRect(sx, sy + 15, 16, 1);
    ctx.fillRect(sx, sy, 1, 16); ctx.fillRect(sx + 15, sy, 1, 16);
  }
  async function renderInvSlotItem(ctx, itemRef, sx, sy) {
    var info = await resolveItemModel(itemRef);
    if (!info || info.kind === 'none') {
      drawInvPlaceholder(ctx, sx, sy);
      warn('item-not-renderable: ' + itemRef);
      return info || { kind: 'none' };
    }
    if (info.kind === 'ce-block' && info.blockData) {
      if (await drawCraftBlockData(ctx, info.blockData, sx + 8, sy + 8, 16)) return { kind: 'block', blockData: info.blockData };
      drawInvPlaceholder(ctx, sx, sy);
      warn('block-item-not-renderable: ' + (itemRef && itemRef.id || itemRef));
      return { kind: 'none' };
    }
    if (info.kind !== 'block' || !info.model) {
      // 平面物品: 原版就是一张 16x16 贴图原样画进槽位
      var tex = info.texture || (info.model ? await flatTextureOf(info.model) : null);
      if (tex) {
        var fr = await loadTextureFrame('texture', tex);
        if (fr) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, sx, sy, 16, 16);
          ctx.restore();
          return { kind: 'flat', texture: tex };
        }
      }
      drawInvPlaceholder(ctx, sx, sy);
      warn('missing texture ' + (tex || itemRef));
      return { kind: 'none' };
    }
    // 3D 模型: collectDisplayChain 沿 parent 链合并 display (子优先), 再叠模型自身的
    var modelId = info.model;
    var model = await loadModelChain(modelId);
    if (!model) {
      drawInvPlaceholder(ctx, sx, sy);
      warn('model-json-missing: ' + modelId);
      return { kind: 'none' };
    }
    if (await flatKindModelAsync(modelId)) {
      // 带 parent 到 item/generated 的「伪 3D」: 实为平面贴图, 拍平处理
      var ft = await flatTextureOf(modelId);
      if (ft) {
        var fr2 = await loadTextureFrame('texture', ft);
        if (fr2) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(fr2.img, fr2.sx, fr2.sy, fr2.sw, fr2.sh, sx, sy, 16, 16);
          ctx.restore();
          return { kind: 'flat', texture: ft };
        }
      }
      drawInvPlaceholder(ctx, sx, sy);
      warn('missing texture ' + (ft || modelId));
      return { kind: 'none' };
    }
    var chainDisp = await collectDisplayChain(modelId);
    if (model.display) {
      var dk = Object.keys(model.display);
      for (var d = 0; d < dk.length; d++) {
        var base = isObj(chainDisp[dk[d]]) ? Object.assign({}, chainDisp[dk[d]]) : {};
        var own = model.display[dk[d]];
        if (isObj(own)) {
          var fk = Object.keys(own);
          for (var k = 0; k < fk.length; k++) base[fk[k]] = own[fk[k]];
        }
        chainDisp[dk[d]] = base;
      }
    }
    // gui 上下文缺失时回退到标准方块 gui 变换 (原版里这意味着模型没有任何 display,
    // 但那样的直投影完全没有立体感 —— 预览选择向 block/block.json 的经典外观看齐)
    var tr = chainDisp.gui || GUI_FALLBACK_TR;
    var fallbackUsed = !chainDisp.gui;
    if (fallbackUsed) warn('gui-display-fallback: ' + modelId);
    // 关键: yaw 恒为 0, pitch 恒为 30 (tiltMat(30) = null) ⇒ displayXf 就是纯 ItemTransform
    var xf = displayXf(tr, 0, false, 30);
    var faces = collectFacesFromModel(model, xf, GUI_SLOT_VIEW) || [];
    var texCache = {};
    for (var ti = 0; ti < faces.length; ti++) {
      var tid = faces[ti].texId;
      if (!texCache[tid]) texCache[tid] = await loadTextureFrame('texture', tid);
      var tfr = texCache[tid];
      if (tfr) {
        faces[ti].img = tfr.img;
        faces[ti].sx = tfr.sx; faces[ti].sy = tfr.sy;
        faces[ti].sw = tfr.sw; faces[ti].sh = tfr.sh;
      } else {
        faces[ti].img = null;
      }
    }
    // 正交直视: 屏幕 x = 模型 x, 屏幕 y = -模型 y (画布 y 朝下), 1 模型单位 = 1 像素,
    // 模型中心 (变换后原点) 对准槽位中心 (sx+8, sy+8)。面片已按深度升序 (先远后近)。
    paintFaces(ctx, faces, 1, sx + 8, sy + 8, projectGui);
    return { kind: 'model', model: modelId, faces: faces.length, fallback: fallbackUsed };
  }

  async function sceneInventory(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    var img = await loadImageAny('texture', GUI_INVENTORY);
    var surf = makeSurface(INV_W, INV_H, scale);
    var ctx = surf.ctx;
    if (img) {
      // 原版贴图是 256x256 画布, 有效区只有左上 176x166, 直接裁剪绘制
      ctx.drawImage(img, 0, 0, INV_W, INV_H, 0, 0, INV_W, INV_H);
    } else {
      // 无贴图时手绘近似生存物品栏: 底板 + 槽位格
      ctx.fillStyle = '#C6C6C6';
      ctx.fillRect(0, 0, INV_W, INV_H);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, INV_W, 1); ctx.fillRect(0, 0, 1, INV_H);
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, INV_H - 1, INV_W, 1); ctx.fillRect(INV_W - 1, 0, 1, INV_H);
      var slotsFb = inventorySlots();
      for (var fbi = 0; fbi < slotsFb.length; fbi++) {
        drawSlotRect(ctx, slotsFb[fbi].x, slotsFb[fbi].y, 18, 18);
      }
      warn('gui-texture-missing');
    }
    var slots = inventorySlots();
    // 选中的槽位 (面板点击可换; 越界回落到 0 = 快捷栏第一格)
    var slotIdx = clamp(parseInt(scene.slot, 10) || 0, 0, slots.length - 1);
    var sel = slots[slotIdx];
    // 物品渲染 (槽位坐标 = 内容区原点, renderInvSlotItem 内部不再 +1)
    var r = { kind: 'none' };
    if (scene.item) r = await renderInvSlotItem(ctx, scene.item, sel.x, sel.y);
    var count = scene.count != null ? parseInt(scene.count, 10) || 0 : 1;
    if (scene.item && count > 1) {
      // MC: drawString(count, x + 17 - width, y + 9, white, shadow) —— x/y 是槽位内容原点,
      // drawItems 的 y 是基线, 默认 ascent=7 → 基线 = 槽内顶 + 9 + 7
      var pCount = parseText(String(count), { style: { color: hexToRgb('#FFFFFF'), shadow: true } });
      drawItems(ctx, pCount.items, sel.x + 17 - pCount.width, sel.y + 9 + 7, { shadow: true });
    }
    // 鼠标悬浮高亮 (半透明白 16x16, 和原版渲染一致)
    if (scene.hoverSlot != null && parseInt(scene.hoverSlot, 10) === slotIdx) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(sel.x, sel.y, 16, 16);
      ctx.restore();
    }
    // 拾取数据: 面板点击换槽位用 (逻辑坐标)
    _invPick = { slots: slots, w: INV_W, h: INV_H, slot: slotIdx, rendered: r };
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  // 最近一次物品栏渲染的拾取数据 (面板点击时查它)
  var _invPick = null;
  function inventoryPickAt(px, py) {
    if (!_invPick || !_invPick.slots) return -1;
    var slots = _invPick.slots;
    for (var i = 0; i < slots.length; i++) {
      // 槽位坐标是 16x16 内容区原点, 18x18 格子外框 = [x-1, x+17)
      if (px >= slots[i].x - 1 && px < slots[i].x + 17 && py >= slots[i].y - 1 && py < slots[i].y + 17) return i;
    }
    return -1;
  }

  // ---------------- 家具 (furniture) ----------------
  // CE 家具是基于展示实体的装饰系统: 一个家具下有多个 variants,
  // 每个变体 = elements (外观部件) + hitboxes (碰撞箱, 可带 seats 座位)。
  // 预览用等轴测投影: 地面网格 → 元素按深度排序绘制 → 碰撞箱线框 + 座位标记。
  var FURN_HITBOX_COLORS = {
    interaction: '#4FC3F7', shulker: '#FFB74D', happy_ghast: '#BA68C8', custom: '#81C784'
  };
  var FURN_BLOCK_PX = 54;              // 一格方块在等轴测下的基准像素
  var FURN_W = 272, FURN_H = 226;      // 最小画布 (内容超出时自动扩)
  var FURN_UNIT = FURN_BLOCK_PX / 32;
  var FURN_MAX_W = 860, FURN_MAX_H = 660;   // 自适应画布的上限
  // 当前家具场景的视图状态 (渲染期间由 sceneFurniture 设置, 其余场景保持默认)
  var sceneViewYaw = 0;
  var sceneZoom = 1;
  // 最近一次家具渲染的拾取数据 (画布逻辑坐标): 面板点击时查它
  var _furnPick = null;

  function fval(v) { return (v !== null && typeof v === 'object' && typeof v.__ceTag === 'string') ? v.v : v; }
  function fobj(v) { v = fval(v); return (v !== null && typeof v === 'object' && !Array.isArray(v)) ? v : null; }
  function flist(v) { v = fval(v); return v == null ? [] : (Array.isArray(v) ? v.map(fval) : [fval(v)]); }
  function fnum(v) { var n = parseFloat(fval(v)); return isFinite(n) ? n : null; }
  // 取字段: CE 的 YAML 同时接受 snake_case 与 kebab-case (官方默认包用的是 kebab-case,
  // 例如 interaction-entity / display-transform / has-shadow), 这里两种都认
  function fkey(o, name) {
    if (!o) return undefined;
    var v = fval(o[name]);
    if (v !== undefined) return v;
    var kebab = String(name).replace(/_/g, '-');
    if (kebab !== name) {
      v = fval(o[kebab]);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  // "x,y,z" / "x y z" / [x,y,z] / 单个数 → [x,y,z]
  function fvec(v, def) {
    var d = def || [0, 0, 0];
    var raw = fval(v);
    if (raw == null) return d.slice();
    if (typeof raw === 'number') return [raw, raw, raw];
    var parts;
    if (Array.isArray(raw)) parts = raw.map(function (x) { return parseFloat(fval(x)); });
    else parts = String(raw).replace(/[[\]]/g, '').split(/[,\s]+/).filter(Boolean).map(parseFloat);
    if (!parts.length) return d.slice();
    if (parts.length === 1) return [parts[0], parts[0], parts[0]];
    return [
      isFinite(parts[0]) ? parts[0] : d[0],
      isFinite(parts[1]) ? parts[1] : d[1],
      isFinite(parts[2]) ? parts[2] : d[2]
    ];
  }
  // scale: 单个数 = 等比
  function fscale(v) {
    var raw = fval(v);
    if (raw == null) return [1, 1, 1];
    if (typeof raw === 'number') return [raw, raw, raw];
    if (Array.isArray(raw) && raw.length === 1) { var n = parseFloat(fval(raw[0])); return [n, n, n]; }
    return fvec(raw, [1, 1, 1]);
  }
  // 从条目数据里找出 variants 表 (可能在 data.variants 或 data.data.variants)
  function furnitureVariants(data) {
    var o = fobj(data);
    if (!o) return [];
    var vs = fobj(o.variants) || fobj(fobj(o.data) && fobj(o.data).variants);
    if (!vs) return [];
    return Object.keys(vs).map(function (name) {
      var v = fobj(vs[name]) || {};
      return {
        name: name,
        elements: flist(v.elements),
        hitboxes: flist(v.hitboxes),
        blueprint: fval(v.blueprint) || null,
        lootSpawnOffset: fval(v.loot_spawn_offset),
        raw: v
      };
    });
  }

  // ---------------- furniture_item 行为 ----------------
  // 物品可以通过 behavior.type: furniture_item 携带家具: furniture 可以是
  //   - 家具 id (字符串) → 去 furniture: 段里找
  //   - 内联的完整家具配置 (含 variants)
  var FURNITURE_ITEM_BEHAVIORS = {
    furniture_item: 1, liquid_collision_furniture_item: 1
  };
  // block_item 系行为 (craftengine-interpreter.js BEHAVIOR_SLOTS 同清单):
  // 右键放置一个 CE 方块, block 字段可引用也可内联
  var BLOCK_ITEM_BEHAVIOR_TYPES = {
    block_item: 1, ceiling_block_item: 1, wall_block_item: 1, ground_block_item: 1,
    double_high_block_item: 1, multi_high_block_item: 1, liquid_collision_block_item: 1
  };
  // 单个 behavior 节点 → 家具定义; 返回 {ref} 或 {inline}
  function furnitureFromBehavior(beh) {
    var b = fobj(beh);
    if (!b) return null;
    var type = fval(b.type);
    if (!type || !FURNITURE_ITEM_BEHAVIORS[String(type).toLowerCase()]) return null;
    var f = fval(b.furniture);
    if (f == null) return null;
    var fo = fobj(f);
    if (fo) {
      // 内联: 必须自己带 variants (否则当作引用对象)
      if (fobj(fo.variants)) return { inline: fo };
      var ref2 = fval(fo.id) || fval(fo.furniture);
      return ref2 ? { ref: String(ref2) } : null;
    }
    return { ref: String(f) };
  }
  // 条目数据 → 家具定义 (支持 behavior / behaviors / 数组)
  function furnitureInlineOf(data) {
    var d = fobj(data);
    if (!d) return null;
    var cands = [];
    var pushAll = function (v) {
      if (Array.isArray(v)) { v.forEach(function (x) { cands.push(x); }); return; }
      if (v != null) cands.push(v);
    };
    pushAll(fval(d.behavior));
    pushAll(fval(d.behaviors));
    var inner = fobj(d.data);
    if (inner) {
      pushAll(fval(inner.behavior));
      pushAll(fval(inner.behaviors));
    }
    for (var i = 0; i < cands.length; i++) {
      var got = furnitureFromBehavior(cands[i]);
      if (got) {
        if (got.inline) return got.inline;
        var target = _projectData.furniture && _projectData.furniture[got.ref];
        if (target) return fobj(target) || null;
        return { __missingFurniture: got.ref };
      }
    }
    return null;
  }
  // 条目是否声明了 furniture_item 行为 (即使找不到家具定义)
  function furnitureItemRef(data) {
    var d = fobj(data);
    if (!d) return null;
    var cands = [fval(d.behavior), fval(d.behaviors)];
    var inner = fobj(d.data);
    if (inner) { cands.push(fval(inner.behavior)); cands.push(fval(inner.behaviors)); }
    var flat = [];
    cands.forEach(function (v) { if (Array.isArray(v)) v.forEach(function (x) { flat.push(x); }); else if (v != null) flat.push(v); });
    for (var i = 0; i < flat.length; i++) {
      var got = furnitureFromBehavior(flat[i]);
      if (got) return got.ref || '(inline)';
    }
    return null;
  }
  // ---------------- block_item 行为 → 方块 (镜像家具三件套) ----------------
  // block 字段: <id> 引用 或 {settings/behavior/state(s)/loot…} 内联定义 (注册在物品自身 id 下)
  function blockFromBehavior(beh) {
    var b = fobj(beh);
    if (!b) return null;
    var type = fval(b.type);
    if (!type || !BLOCK_ITEM_BEHAVIOR_TYPES[String(type).toLowerCase()]) return null;
    var blk = b.block;
    if (blk == null) return null;
    var bo = fobj(blk);
    if (bo) {
      // 内联: 必须自己带 state/states (纯 settings 对象按引用处理)
      if (fobj(bo.state) || fobj(bo.states)) return { inline: bo };
      var ref2 = fval(bo.id) || fval(bo.block);
      return ref2 ? { ref: String(ref2) } : null;
    }
    return { ref: String(blk) };
  }
  // 条目数据 → 方块定义 (支持 behavior / behaviors / 数组; 引用查工程 blocks 段)
  function blockInlineOf(data) {
    var d = fobj(data);
    if (!d) return null;
    var cands = [];
    var pushAll = function (v) {
      if (Array.isArray(v)) { v.forEach(function (x) { cands.push(x); }); return; }
      if (v != null) cands.push(v);
    };
    pushAll(fval(d.behavior));
    pushAll(fval(d.behaviors));
    var inner = fobj(d.data);
    if (inner) {
      pushAll(fval(inner.behavior));
      pushAll(fval(inner.behaviors));
    }
    for (var i = 0; i < cands.length; i++) {
      var got = blockFromBehavior(cands[i]);
      if (got) {
        if (got.inline) return got.inline;
        var target = _projectData.blocks && _projectData.blocks[got.ref];
        if (target) return fobj(target) || null;
        return { __missingBlock: got.ref };
      }
    }
    return null;
  }
  // 条目是否声明了 block_item 系行为 (即使找不到方块定义)
  function blockItemRef(data) {
    var d = fobj(data);
    if (!d) return null;
    var cands = [fval(d.behavior), fval(d.behaviors)];
    var inner = fobj(d.data);
    if (inner) { cands.push(fval(inner.behavior)); cands.push(fval(inner.behaviors)); }
    var flat = [];
    cands.forEach(function (v) { if (Array.isArray(v)) v.forEach(function (x) { flat.push(x); }); else if (v != null) flat.push(v); });
    for (var i = 0; i < flat.length; i++) {
      var got = blockFromBehavior(flat[i]);
      if (got) return got.ref || '(inline)';
    }
    return null;
  }
  // 按 id 取家具定义 (供面板/其它模块使用)
  function furnitureById(id) {
    var m = _projectData.furniture || {};
    return fobj(m[String(id)]) || null;
  }
  // 元素类型 (CE: item_display / text_display / block_display / item / armor_stand / better_model / model_engine)
  function furnitureElementType(el) {
    var t = fval(el && el.type);
    return t ? String(t).toLowerCase() : 'item_display';
  }
  // 碰撞箱 → 相对原点的 1/16 单位包围盒。
  // 坐标基准与官方家具配置一致 (见 CE 默认包的 wooden_chair / bench / flower_basket):
  //   position 是相对「原点方块底部中心」的偏移;
  //   盒体水平居中在这个点上、底面贴在它的 y 上 (原版 interaction/shulker 实体的包围箱就是这么算的)。
  //   例: 椅子 width: 0.7 height: 1.2 position: 0,0,0 → 方块中心 0.7 宽、从地面起 1.2 高。
  //   direction 只影响潜影贝模型朝向, 不改变包围箱 (原版潜影贝的箱子与朝向无关)。
  function furnitureHitboxBox(h) {
    var type = String(fval(h.type) || 'interaction').toLowerCase();
    var p = fvec(h.position, [0, 0, 0]);
    var c = furnWorld(p[0], p[1], p[2]);
    var cx = c[0], cy = c[1], cz = c[2];
    if (type === 'shulker') {
      var s = fnum(h.scale) || 1;
      var half = 8 * s;
      // 潜影贝本体: scale 倍率的 1×1×1, 水平居中、底面在 position.y。
      // 打开的那部分 (壳) 是另一个同尺寸箱体, 见 furnitureHitboxBoxes。
      return { type: type, min: [cx - half, cy, cz - half], max: [cx + half, cy + 16 * s, cz + half] };
    }
    if (type === 'happy_ghast') {
      var s2 = fnum(h.scale) || 1;
      var half2 = 32 * s2;                 // scale=1 时 4×4×4 格
      return { type: type, min: [cx - half2, cy, cz - half2], max: [cx + half2, cy + 64 * s2, cz + half2] };
    }
    if (type === 'custom') {
      var s3 = fnum(h.scale) || 1;
      var half3 = 8 * s3;                  // 近似 1×1×1 格 × scale (真实尺寸取决于 entity_type)
      return { type: type, min: [cx - half3, cy, cz - half3], max: [cx + half3, cy + 16 * s3, cz + half3] };
    }
    // interaction: width × height (scale: 宽,高 可作简写), 水平居中、从 position 底面向上
    var sc = fscale(h.scale);
    var w = fnum(h.width); if (w == null) w = sc[0];
    var hh = fnum(h.height); if (hh == null) hh = sc[1];
    if (!isFinite(w) || w <= 0) w = 1;
    if (!isFinite(hh) || hh <= 0) hh = 1;
    var hw = w * 8;
    return { type: type, min: [cx - hw, cy, cz - hw], max: [cx + hw, cy + hh * 16, cz + hw] };
  }
  // 一条碰撞箱配置可能对应多个箱体: 潜影贝在 peek > 0 时, 打开的壳是另一个 1×1×1 箱体,
  // 沿 direction 方向推出 peek 比例的一格。所以 direction: east + peek: 100 在游戏里就是
  // 「两个并排的 1×1×1、都在 y=0」; direction: up 时则是上下叠着的两个。
  function furnitureHitboxBoxes(h) {
    var base = furnitureHitboxBox(h);
    var out = [base];
    if (base.type === 'shulker') {
      var peek = clamp(fnum(fkey(h, 'peek')) || 0, 0, 100) / 100;
      if (peek > 0.001) {
        var s = fnum(fkey(h, 'scale')) || 1;
        var d = String(fkey(h, 'direction') || 'up').toLowerCase();
        var v = d === 'down' ? [0, -1, 0]
          : d === 'north' ? [0, 0, -1]
          : d === 'south' ? [0, 0, 1]
          : d === 'west' ? [-1, 0, 0]
          : d === 'east' ? [1, 0, 0] : [0, 1, 0];
        var off = peek * 16 * s;
        out.push({
          type: 'shulker', lid: true, dir: d,
          min: [base.min[0] + v[0] * off, base.min[1] + v[1] * off, base.min[2] + v[2] * off],
          max: [base.max[0] + v[0] * off, base.max[1] + v[1] * off, base.max[2] + v[2] * off]
        });
      }
    }
    return out;
  }
  // ---- 家具场景投影 ----
  // 基础等轴测投影 (dimetric 2:1, 无视图变换)
  function project(x, y, z) {
    var sx = (x - z) * COS30;
    var sy = (x + z) * SIN30 - y;
    return { x: sx, y: sy };
  }
  // 物品栏 GUI 的投影: display.gui 的 ItemTransform 烘进模型后, 原版把结果「正交直视」——
  // 屏幕 x = 模型 x, 屏幕 y = 模型 y (画布 y 轴朝下, 所以显示时翻转)。1 单位 = 1 像素。
  function projectGui(x, y, z) {
    return { x: x, y: -y };
  }
  // 等轴测投影 (yaw 45° pitch 30°), 可叠加:
  //   - viewYaw:   绕竖直轴的视图旋转 (±90/180 → 看家具的四个朝向)
  //   - viewPitch: 视图俯仰 (度: 30 = 默认等轴测, 90 = 正俯视, -90 = 正仰视)
  //   - zoom:      视图缩放 (>1 放大)
  // project() 返回「1/16 方块单位」下的屏幕偏移, 调用方乘 FURN_UNIT 或 zoom 后再加锚点。
  // 俯仰的实现: 先把点绕「屏幕水平轴」r = (1,0,-1)/√2 旋转 β, 再做等轴测投影。
  // 旋转轴垂直于视线且水平, 所以旋转只改俯仰不改方位角 (转台式俯仰)。
  // 标定: β=+54.74° 时世界 +Y 恰好转到视线 (1,1,1) 方向 = 正俯视; 等轴测俯仰为 30°、
  // 俯视区间 [30,90) 对应 β∈[0,54.74), 换算 β = (pitch-30) × 54.74/60 —— pitch=30 时
  // β=0, 投影与原等轴测完全一致。
  var TILT_AXIS = [1 / Math.SQRT2, 0, -1 / Math.SQRT2];
  var TILT_TOP = 54.7356;   // 世界 +Y → 视线 (1,1,1) 方向的旋转角
  function tiltBeta(pitch) {
    return ((pitch == null ? 30 : pitch) - 30) * (TILT_TOP / 60);
  }
  // 绕任意单位轴旋转 3x3 矩阵 (Rodrigues): R = cosβ·I + sinβ·[k]× + (1-cosβ)·k⊗k
  function rodriguesMat(k, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    var x = k[0], y = k[1], z = k[2];
    return [
      c + t * x * x,      t * x * y - s * z,  t * x * z + s * y,
      t * x * y + s * z,  c + t * y * y,      t * y * z - s * x,
      t * x * z - s * y,  t * y * z + s * x,  c + t * z * z
    ];
  }
  var _tiltCache = { pitch: NaN, m: null };
  function tiltMat(pitch) {
    var p = pitch == null ? 30 : pitch;
    if (_tiltCache.pitch === p && _tiltCache.m !== null) return _tiltCache.m;
    var b = tiltBeta(p);
    _tiltCache.m = Math.abs(b) < 0.001 ? null : rodriguesMat(TILT_AXIS, b);
    _tiltCache.pitch = p;
    return _tiltCache.m;
  }
  // 带俯仰的等轴测投影 (俯仰只影响投影; 剔除/光照用「最终坐标系」的固定 VIEW 向量,
  // 与 project 的视线自洽, 不受俯仰影响)
  function projectPitched(x, y, z, pitch) {
    var p = pitch == null ? 30 : pitch;
    if (Math.abs(p - 30) < 0.01) return project(x, y, z);
    var m = tiltMat(p);
    var q = m ? mat3Apply(m, [x, y, z]) : [x, y, z];
    return project(q[0], q[1], q[2]);
  }
  function projectView(x, y, z, viewYaw) {
    var p = rotYmc([x, y, z], viewYaw || 0);
    return project(p[0], p[1], p[2]);
  }
  // 带俯仰的视图投影 (家具/模型场景共用; pitch 缺省 30 = 原等轴测)
  function projectViewP(x, y, z, viewYaw, viewPitch) {
    var p = rotYmc([x, y, z], viewYaw || 0);
    return projectPitched(p[0], p[1], p[2], viewPitch);
  }
  function viewDepth(x, y, z, viewYaw) {
    var p = rotYmc([x, y, z], viewYaw || 0);
    return p[0] * VIEW.x + p[1] * VIEW.y + p[2] * VIEW.z;
  }
  function fpt(cx, cy, x, y, z) {
    var s = projectViewP(x, y, z, sceneViewYaw, scenePitch);
    var u = FURN_UNIT * sceneZoom;
    return { x: cx + s.x * u, y: cy + s.y * u };
  }
  function clampPitchDeg(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return 30;
    return clamp(n, -90, 90);
  }
  // 画一个 3D 线框盒 (8 顶点 12 边)。半透明填充 + 背面虚线用于「填充」模式。
  function drawWireBox(ctx, cx, cy, min, max, color, width, o) {
    o = o || {};
    var P = [];
    for (var i = 0; i < 8; i++) {
      P.push(fpt(cx, cy, (i & 1) ? max[0] : min[0], (i & 2) ? max[1] : min[1], (i & 4) ? max[2] : min[2]));
    }
    // 顶点编号: 0(-x,-y,-z) 1(+x,-y,-z) 2(-x,+y,-z) 3(+x,+y,-z) 4(-x,-y,+z) 5(+x,-y,+z) 6(-x,+y,+z) 7(+x,+y,+z)
    var FACES = [
      { idx: [0, 1, 3, 2], n: [0, 0, -1] },   // -z (北)
      { idx: [4, 6, 7, 5], n: [0, 0, 1] },    // +z (南)
      { idx: [0, 2, 6, 4], n: [-1, 0, 0] },   // -x (西)
      { idx: [1, 5, 7, 3], n: [1, 0, 0] },    // +x (东)
      { idx: [2, 3, 7, 6], n: [0, 1, 0] },    // 顶
      { idx: [0, 4, 5, 1], n: [0, -1, 0] }    // 底
    ];
    var EDGES = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
    var fillA = o.fillAlpha != null ? o.fillAlpha : 0;
    var front = [], back = [];
    var tilt = tiltMat(scenePitch);
    for (var fi = 0; fi < FACES.length; fi++) {
      var fc = FACES[fi];
      var nrm = rotYmc(fc.n, sceneViewYaw);
      if (tilt) nrm = mat3Apply(tilt, nrm);
      var dv = nrm[0] * VIEW.x + nrm[1] * VIEW.y + nrm[2] * VIEW.z;
      (dv > 0.0001 ? front : back).push(fc);
    }
    ctx.save();
    if (fillA > 0) {
      // 背面: 虚线 + 极淡填充 (识别出被家具挡住的后半部分)
      ctx.setLineDash && ctx.setLineDash([3, 3]);
      for (var bi = 0; bi < back.length; bi++) {
        var bf = back[bi];
        ctx.beginPath();
        ctx.moveTo(P[bf.idx[0]].x, P[bf.idx[0]].y);
        for (var bj = 1; bj < 4; bj++) ctx.lineTo(P[bf.idx[bj]].x, P[bf.idx[bj]].y);
        ctx.closePath();
        if (fillA > 0) {
          ctx.fillStyle = withAlpha(color, fillA * 0.35);
          ctx.fill();
        }
        ctx.strokeStyle = withAlpha(color, 0.35);
        ctx.lineWidth = width || 1;
        ctx.stroke();
      }
      ctx.setLineDash && ctx.setLineDash([]);
      // 前面: 半透明填充
      for (var fi2 = 0; fi2 < front.length; fi2++) {
        var ff = front[fi2];
        ctx.beginPath();
        ctx.moveTo(P[ff.idx[0]].x, P[ff.idx[0]].y);
        for (var fj = 1; fj < 4; fj++) ctx.lineTo(P[ff.idx[fj]].x, P[ff.idx[fj]].y);
        ctx.closePath();
        ctx.fillStyle = withAlpha(color, fillA);
        ctx.fill();
      }
    }
    // 边线
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    for (var e = 0; e < EDGES.length; e++) {
      var a = P[EDGES[e][0]], b = P[EDGES[e][1]];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // '#rrggbb' + alpha → rgba()
  function withAlpha(hex, a) {
    var h = String(hex || '#ffffff');
    if (h.charAt(0) !== '#') return h;
    var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return h;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  // 座位标记: 圆点 + (有 yaw 时) 朝向箭头
  function drawSeatMarker(ctx, cx, cy, x, y, z, yaw, highlight) {
    var q = fpt(cx, cy, x, y, z);
    ctx.save();
    ctx.fillStyle = highlight ? '#FFF59D' : '#FFD54F';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(q.x, q.y, highlight ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (yaw != null && yaw !== 0) {
      // MC yaw: 0 = +Z(南), 正值顺时针 (俯视) → 90 = -X(西)
      var a = yaw * Math.PI / 180;
      var dx = -Math.sin(a), dz = Math.cos(a);
      var tip = fpt(cx, cy, x + dx * 4, y, z + dz * 4);
      ctx.strokeStyle = highlight ? '#FFF59D' : '#FFC107';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }
    ctx.restore();
    return q;
  }  // 座位: "x,y,z [yaw] [force]" 或 {position,yaw,...}
  // 字符串座位解析出 tail (yaw 之后的未知 token, 编辑回写时原样保留)
  function furnitureSeat(seat) {
    var o = fobj(seat);
    if (o) {
      var p = fvec(o.position, null) || [0, 0, 0];
      return { pos: p, yaw: fnum(o.yaw), tail: [], obj: true };
    }
    var s = String(fval(seat) == null ? '' : fval(seat)).trim();
    if (!s) return null;
    var parts = s.split(/[\s,]+/).filter(Boolean);
    var n = parts.slice(0, 3).map(parseFloat);
    if (n.length < 3 || !isFinite(n[0])) return null;
    var yaw = isFinite(parseFloat(parts[3])) ? parseFloat(parts[3]) : null;
    // yaw 后面的 token (force 等) 原样保留; yaw 缺省时从第 4 个起全是 tail
    var tail = parts.slice(yaw != null ? 4 : 3);
    return { pos: n, yaw: yaw, tail: tail, obj: false };
  }

  // ---- 编辑手柄绘制 (预览内编辑) ----
  // shape: 'square' 碰撞箱角/中心 | 'diamond' 高度 | 'ring' 座位 | 'dot' 元素锚点
  function drawEditHandle(ctx, x, y, color, shape, active) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.fillStyle = active ? '#FFFFFF' : color;
    ctx.beginPath();
    if (shape === 'square') { ctx.rect(x - 3.5, y - 3.5, 7, 7); }
    else if (shape === 'diamond') {
      ctx.moveTo(x, y - 5.5); ctx.lineTo(x + 5.5, y);
      ctx.lineTo(x, y + 5.5); ctx.lineTo(x - 5.5, y); ctx.closePath();
    } else if (shape === 'ring') {
      ctx.arc(x, y, 5, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // 元素要画的东西: {kind:'item'|'block'|'text'|'external', ...}
  function furnitureElementVisual(el) {
    var type = furnitureElementType(el);
    if (type === 'text_display') {
      return { kind: 'text', text: fval(el.text) == null ? '' : String(fval(el.text)), el: el };
    }
    if (type === 'better_model' || type === 'model_engine' || type === 'external') {
      return { kind: 'external', model: fval(el.model) || fval(el.blueprint) || '', el: el };
    }
    if (type === 'block_display') {
      var b = fval(el.block);
      return { kind: 'block', block: b == null ? '' : String(b), el: el };
    }
    var item = fval(el.item) || fval(el.item_model);
    return { kind: 'item', item: item == null ? '' : String(item), el: el };
  }

  // ---- 拾取辅助: 点在凸多边形内 / 凸包 / 面积 ----
  function pointInPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function polyArea(poly) {
    var a = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return Math.abs(a / 2);
  }
  function convexHull(pts) {
    if (pts.length < 3) return pts.slice();
    var ps = pts.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    var cross = function (o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); };
    var lo = [], hi = [];
    for (var i = 0; i < ps.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], ps[i]) <= 0) lo.pop();
      lo.push(ps[i]);
    }
    for (var j = ps.length - 1; j >= 0; j--) {
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], ps[j]) <= 0) hi.pop();
      hi.push(ps[j]);
    }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  // 点击拾取: 画布逻辑坐标 → 命中的碰撞箱。
  // 相邻碰撞箱的投影会互相压住, 所以「同时包含该点」时按投影中心距离取最近的那个
  // (同一位置上更小的箱子自然也会赢, 因为它离点击更近), 面积只作为距离相当时的微调。
  // 数据来自最近一次家具渲染 (_furnPick), 非家具场景返回 null。
  function furniturePickAt(px, py) {
    if (!_furnPick || !_furnPick.boxes || !_furnPick.boxes.length) return null;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < _furnPick.boxes.length; i++) {
      var b = _furnPick.boxes[i];
      if (!pointInPoly(px, py, b.poly)) continue;
      var dx = b.cx - px, dy = b.cy - py;
      var score = Math.sqrt(dx * dx + dy * dy) + polyArea(b.poly) * 0.0005;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  // ---------------- 预览内编辑 (家具画布手柄) ----------------
  // 编辑模式下场景会画出手柄并把「屏幕坐标 + 反投影函数」暴露给面板:
  //   面板负责指针事件 → 反投影出世界坐标 → 直接改 ctx.data (解析树里的活对象)
  //   → 拖动结束派发 'ce-preview-data-changed', 由 renderer 桥接同步可视化表单。
  function furnitureEditHandles() {
    return (_furnPick && _furnPick.handles) || [];
  }
  function furnitureEditHitAt(px, py) {
    var hs = furnitureEditHandles();
    if (!hs.length) return null;
    // 命中半径按「手柄半径 + 容差」, 同距时 prio 大者优先 (seat=2 > el-pos=3 > hb-height=1 > hb-pos=0;
    // 数值越大越后画/越小越精, score = d − prio → 高 prio 赢)
    var best = null, bestScore = Infinity;
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      var dx = px - h.x, dy = py - h.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var R = (h.r || 7) + 4;
      if (d > R) continue;
      var score = d - (h.prio || 0);
      if (score < bestScore) { bestScore = score; best = h; }
    }
    return best;
  }
  // 视图信息 (面板拖拽时把像素增量换算成世界增量用)
  function furnitureViewInfo() {
    if (!_furnPick) return null;
    return {
      ox: _furnPick.ox || 0, oy: _furnPick.oy || 0,
      unit: FURN_UNIT * sceneZoom,
      yaw: sceneViewYaw, pitch: scenePitch,
      boxes: _furnPick.boxes || []
    };
  }
  // 世界坐标(1/16) → 画布逻辑坐标 的仿射映射 (视图旋转 + 俯仰都是线性变换, 精确求逆用)。
  // 返回 {ox, oy, mx, my, mz}: screen = origin + world.x·mx + world.y·my + world.z·mz
  function furnitureAffine() {
    var u = FURN_UNIT * sceneZoom;
    function F(x, y, z) {
      var s = projectViewP(x, y, z, sceneViewYaw, scenePitch);
      return [s.x * u, s.y * u];
    }
    var o = F(0, 0, 0);
    var ex = F(1, 0, 0), ey = F(0, 1, 0), ez = F(0, 0, 1);
    return {
      ox: o[0], oy: o[1],
      mx: [ex[0] - o[0], ex[1] - o[1]],   // d(screen) / d(world.x)
      my: [ey[0] - o[0], ey[1] - o[1]],
      mz: [ez[0] - o[0], ez[1] - o[1]]
    };
  }
  // 已知世界高度 y (1/16 单位) 时, 画布逻辑坐标 → 世界 (x, z): 解 2x2 线性方程组
  function furnitureUnproject(lx, ly, y) {
    if (!_furnPick) return null;
    var A = furnitureAffine();
    var rx = lx - (_furnPick.ox || 0) - A.ox - A.my[0] * y;
    var ry = ly - (_furnPick.oy || 0) - A.oy - A.my[1] * y;
    var det = A.mx[0] * A.mz[1] - A.mz[0] * A.mx[1];
    if (Math.abs(det) < 1e-9) return null;
    var wx = (rx * A.mz[1] - A.mz[0] * ry) / det;
    var wz = (A.mx[0] * ry - rx * A.mx[1]) / det;
    return [wx, y, wz];
  }
  // 已知世界 (x, z) 时, 画布逻辑坐标 → 世界 y (Shift 垂直拖动)
  function furnitureUnprojectY(lx, ly, x, z) {
    if (!_furnPick) return null;
    var A = furnitureAffine();
    var bx = (_furnPick.ox || 0) + A.ox + A.mx[0] * x + A.mz[0] * z;
    var rx = lx - bx;
    if (Math.abs(A.my[0]) > 1e-6) return rx / A.my[0];
    var by = (_furnPick.oy || 0) + A.oy + A.mx[1] * x + A.mz[1] * z;
    var ry = ly - by;
    if (Math.abs(A.my[1]) < 1e-6) return null;
    return ry / A.my[1];
  }
  // 世界坐标 (1/16 单位) → 画布逻辑坐标 (与 furniturePickAt / 手柄命中同一坐标系)
  function furnitureProjectPoint(x, y, z) {
    if (!_furnPick) return null;
    var A = furnitureAffine();
    return {
      x: (_furnPick.ox || 0) + A.ox + A.mx[0] * x + A.my[0] * y + A.mz[0] * z,
      y: (_furnPick.oy || 0) + A.oy + A.mx[1] * x + A.my[1] * y + A.mz[1] * z
    };
  }

  // 碰撞箱尺寸文案: 1/16 单位 → 方块 (去尾零)
  function furnDim(n) {
    var v = Math.round(n * 100) / 100;
    return String(v);
  }

  async function sceneFurniture(canvas, scene) {
    await fontReady();
    var variants = furnitureVariants(scene.furniture || {});
    var scale = normScale(scene.scale);

    if (!variants.length) {
      var surf0 = makeSurface(FURN_W, FURN_H, scale);
      var ctx0 = surf0.ctx;
      ctx0.fillStyle = 'rgba(0,0,0,0.72)';
      ctx0.fillRect(0, 0, FURN_W, FURN_H);
      var missing = (scene.furniture && scene.furniture.__missingFurniture) || null;
      var msg = missing
        ? '<red>furniture not found: ' + missing
        : '<red>no variants (at least one is required)';
      var pm = parseText(msg, {});
      drawItems(ctx0, pm.items, 8, 20, { shadow: false });
      if (missing) warn('furniture-missing-ref: ' + missing);
      blit(canvas, surf0);
      return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
    }
    var vi = clamp(parseInt(scene.variant, 10) || 0, 0, variants.length - 1);
    var v = variants[vi];

    // ---- 视图状态: 旋转 (yaw, 45°步进) / 缩放 / 俯仰 ----
    sceneViewYaw = ((parseFloat(scene.yaw) || 0) % 360 + 360) % 360;
    sceneZoom = clamp(parseFloat(scene.zoom) || 1, 0.25, 4);
    scenePitch = clampPitchDeg(scene.pitch != null ? scene.pitch : scene.viewPitch);
    var editMode = scene.edit === true;
    var opt = {
      hitboxes: scene.showHitboxes !== false,
      seats: scene.showSeats !== false,
      grid: scene.showGrid !== false,
      // 填充默认关: 和 /ce debug furniture 一样先给纯线框, 避免半透明色盖住家具材质;
      // 需要更直观的体积感时由面板打开
      fill: scene.hbFill === true,
      labels: scene.hbLabels !== false,
      highlight: isFinite(parseInt(scene.hlHitbox, 10)) ? parseInt(scene.hlHitbox, 10) : -1,
      // 编辑模式: 当前选中的手柄 id (白亮显示)
      editSel: scene.editSel || null
    };
    var unit = FURN_UNIT * sceneZoom;

    // ---- 第一遍: 解析几何 + 内容包围盒 (画布按内容自适应) ----
    var draws = [];          // {depth, kind:'face'|'sprite'|'text'|'external', ...}
    var pickBoxes = [];
    var externalModels = [];
    var seatCount = 0;
    var bMinX = 0, bMinY = 0, bMaxX = 0, bMaxY = 0, hasBound = false;
    function grow(x, y) {
      if (!hasBound) { bMinX = bMaxX = x; bMinY = bMaxY = y; hasBound = true; return; }
      if (x < bMinX) bMinX = x; if (y < bMinY) bMinY = y;
      if (x > bMaxX) bMaxX = x; if (y > bMaxY) bMaxY = y;
    }
    var scrOf = function (x, y, z) {
      var s = projectViewP(x, y, z, sceneViewYaw, scenePitch);
      return { x: s.x * unit, y: s.y * unit };
    };
    // 面片角点在 collectModelFaces 里已随 xf 旋转过 (含 viewYaw + 俯仰), 投影时不能再转一次
    var scrOfRaw = function (x, y, z) {
      var s = project(x, y, z);
      return { x: s.x * unit, y: s.y * unit };
    };
    // 元素深度: 与面片同一「倾斜后」坐标系里比较
    var depthOf = function (x, y, z) {
      var p = rotYmc([x, y, z], sceneViewYaw);
      var t = tiltMat(scenePitch);
      var q = t ? mat3Apply(t, p) : p;
      return q[0] * VIEW.x + q[1] * VIEW.y + q[2] * VIEW.z;
    };
    var growBox = function (min, max) {
      for (var i = 0; i < 8; i++) {
        var s = scrOf((i & 1) ? max[0] : min[0], (i & 2) ? max[1] : min[1], (i & 4) ? max[2] : min[2]);
        grow(s.x, s.y);
      }
    };
    var growFaces = function (faces) {
      for (var i = 0; i < faces.length; i++) {
        var c = faces[i].corners;
        for (var j = 0; j < c.length; j++) {
          var s = scrOfRaw(c[j][0], c[j][1], c[j][2]);
          grow(s.x, s.y);
        }
      }
    };

    // 地面网格 (3x3) 与原点方块轮廓都参与包围盒 (隐藏时网格不计)
    if (opt.grid) growBox([-16, 0, -16], [32, 0, 32]);
    growBox([0, 0, 0], [16, 16, 16]);

    for (var ei = 0; ei < v.elements.length; ei++) {
      var el = fobj(v.elements[ei]) || {};
      var xf = furnitureElementXf(el, sceneViewYaw);
      var vis = furnitureElementVisual(el);
      var sp = scrOf(xf.anchor[0], xf.anchor[1], xf.anchor[2]);
      var avg = (xf.sc[0] + xf.sc[1] + xf.sc[2]) / 3;
      var depth = depthOf(xf.anchor[0], xf.anchor[1], xf.anchor[2]);

      if (vis.kind === 'external') {
        externalModels.push(vis.model || '(未指定模型)');
        var esz = 16 * unit * avg;
        draws.push({ depth: depth, kind: 'external', sx: sp.x, sy: sp.y, size: esz, model: vis.model || '' });
        grow(sp.x - esz / 2, sp.y - esz / 2);
        grow(sp.x + esz / 2, sp.y + esz / 2 + 14);
        continue;
      }
      if (vis.kind === 'text') {
        if (!vis.text) continue;
        var ptx = parseText(vis.text, { style: { color: { r: 255, g: 255, b: 255, a: 1 }, shadow: fkey(el, 'has_shadow') === true } });
        draws.push({ depth: depth, kind: 'text', sx: sp.x, sy: sp.y, parsed: ptx, el: el, avg: avg });
        var tw = ptx.width * Math.max(0.05, avg);
        var tx0 = sp.x - tw / 2, tx1 = sp.x + tw / 2;
        var al = String(fval(el.alignment) || 'center').toLowerCase();
        if (al === 'left') { tx0 = sp.x; tx1 = sp.x + tw; }
        else if (al === 'right') { tx0 = sp.x - tw; tx1 = sp.x; }
        grow(tx0 - 2, sp.y - (LINE_ASCENT + 2) * Math.max(0.05, avg));
        grow(tx1 + 2, sp.y + (LINE_HEIGHT - LINE_ASCENT + 2) * Math.max(0.05, avg));
        continue;
      }
      if (vis.kind === 'block' && vis.block) {
        var bp = vis.block.indexOf(':') === -1 ? vis.block : vis.block.split(':')[1].replace(/\[.*\]$/, '');
        var bns = vis.block.indexOf(':') === -1 ? 'minecraft' : vis.block.split(':')[0];
        var bFaces = dnsOk(bns) ? await collectModelFaces(bns + ':block/' + bp, xf) : null;
        if (bFaces) {
          growFaces(bFaces);
          for (var bf = 0; bf < bFaces.length; bf++) draws.push({ depth: bFaces[bf].depth, kind: 'face', face: bFaces[bf] });
          continue;
        }
        // 没有几何体的方块: 按物品解析平面贴图
        var bInfo = await resolveItemModel(bns + ':' + bp);
        if (!bInfo || bInfo.kind === 'none') { warn('furniture-unknown-block: ' + vis.block); continue; }
        vis = { kind: 'item', item: bns + ':' + bp };
      }
      // item_display / item / armor_stand (以及上面回退下来的 block)
      if (vis.item) {
        var im = await resolveItemModel(vis.item);
        var iFaces = (im && im.kind === 'block' && im.model) ? await collectModelFaces(im.model, xf) : null;
        var asCard = false;
        if (!iFaces && im && im.texture) {
          // 平面物品默认按竖直卡片渲染 —— 元素 rotation/yaw/pitch 与「视角旋转」都能作用到它;
          // billboard: vertical/center/horizontal 时才保持朝向镜头 (公告板)
          var bill = String(fval(el.billboard) || '').toLowerCase();
          var camFacing = (bill === 'vertical' || bill === 'center' || bill === 'horizontal');
          if (!camFacing) {
            var cardTex = await loadImageAny('texture', im.texture);
            if (cardTex) {
              asCard = true;
              // 完全侧对镜头时所有面都会被剔除 → 空数组, 此时什么都不画 (和游戏里一致)
              iFaces = collectFacesFromModel(flatCardModel(im.texture), xf) || [];
            }
          }
        }
        if (asCard || iFaces) {
          if (iFaces.length) {
            growFaces(iFaces);
            for (var iff = 0; iff < iFaces.length; iff++) draws.push({ depth: iFaces[iff].depth, kind: 'face', face: iFaces[iff] });
          } else {
            // 侧对镜头: 画面上没有它, 但包围盒要留出位置, 免得画布随旋转乱跳
            var rad = 8 * Math.max(Math.abs(xf.sc[0]), Math.abs(xf.sc[1]), Math.abs(xf.sc[2])) * 1.35 * unit;
            grow(sp.x - rad, sp.y - rad);
            grow(sp.x + rad, sp.y + rad);
          }
        } else {
          var ssz = 16 * unit * avg;   // 公告板: 1 格见方的卡片, 以锚点为中心
          draws.push({ depth: depth, kind: 'sprite', sx: sp.x, sy: sp.y, size: ssz, item: vis.item });
          grow(sp.x - ssz / 2, sp.y - ssz / 2);
          grow(sp.x + ssz / 2, sp.y + ssz / 2);
          if (!im || im.kind === 'none') warn('furniture-unknown-item: ' + vis.item);
        }
      }
    }

    // 碰撞箱 + 座位 (一条配置可能对应多个箱体, 例如潜影贝打开后的壳)
    for (var hi = 0; hi < v.hitboxes.length; hi++) {
      var hb = fobj(v.hitboxes[hi]) || {};
      var hbBoxes = furnitureHitboxBoxes(hb);
      var col = FURN_HITBOX_COLORS[hbBoxes[0].type] || '#4FC3F7';
      var seatPts = [];
      var seats = flist(hb.seats);
      for (var si = 0; si < seats.length; si++) {
        var st = furnitureSeat(seats[si]);
        if (!st) continue;
        seatCount++;
        var sw = furnWorld(st.pos[0], st.pos[1], st.pos[2]);
        var sq = scrOf(sw[0], sw[1], sw[2]);
        // si = hb.seats 里的真实下标 (seatPts 会跳过解析失败的座位, 拖拽写回必须用 si)
        seatPts.push({ st: st, q: sq, world: sw, si: si });
        if (opt.seats) { grow(sq.x - 5, sq.y - 5); grow(sq.x + 8, sq.y + 8); }
      }
      for (var bi = 0; bi < hbBoxes.length; bi++) {
        if (opt.hitboxes) growBox(hbBoxes[bi].min, hbBoxes[bi].max);
        pickBoxes.push({ index: hi, hb: hb, box: hbBoxes[bi], color: col, seatPts: seatPts });
      }
    }

    // ---- 画布: 内容自适应尺寸 + 居中, 顶部留页眉 (碰撞箱标注画在盒体上方, 额外留一行) ----
    var PAD = 14, HEAD_H = 26;
    var LABEL_PAD = (opt.hitboxes && opt.labels) ? 14 : 0;
    var w = clamp(Math.ceil(bMaxX - bMinX) + PAD * 2, FURN_W, FURN_MAX_W);
    var h = clamp(Math.ceil(bMaxY - bMinY) + PAD + HEAD_H + LABEL_PAD, FURN_H, FURN_MAX_H);
    var surf = makeSurface(w, h, scale);
    var ctx = surf.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);
    var ox = PAD + (w - PAD * 2 - (bMaxX - bMinX)) / 2 - bMinX;
    var oy = HEAD_H + LABEL_PAD +
      (h - PAD - HEAD_H - LABEL_PAD - (bMaxY - bMinY)) / 2 - bMinY;

    // ---- 地面网格 (3x3 格, 随视图旋转) ----
    if (opt.grid) {
      for (var gx = -1; gx <= 1; gx++) {
        for (var gz = -1; gz <= 1; gz++) {
          var c0 = fpt(ox, oy, gx * 16, 0, gz * 16);
          var c1 = fpt(ox, oy, (gx + 1) * 16, 0, gz * 16);
          var c2 = fpt(ox, oy, (gx + 1) * 16, 0, (gz + 1) * 16);
          var c3 = fpt(ox, oy, gx * 16, 0, (gz + 1) * 16);
          ctx.beginPath();
          ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
          ctx.closePath();
          ctx.fillStyle = (gx === 0 && gz === 0) ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.035)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.17)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // 北向标记: 画在网格北侧边缘, 跟随视图旋转, 方便对照 yaw/座位朝向
      var npt = fpt(ox, oy, 8, 0, -20);
      var pn = parseText('<dark_gray>N', {});
      drawItems(ctx, pn.items, npt.x - pn.width / 2, npt.y, { shadow: false });
    }
    // 家具所在方块 (0,0,0) 的轮廓, 作为位置基准
    drawWireBox(ctx, ox, oy, [0, 0, 0], [16, 16, 16], 'rgba(255,255,255,0.38)', 1, {});

    // ---- 深度排序绘制: 面片 + 公告板混排 ----
    draws.sort(function (a, b) { return a.depth - b.depth; });
    var texCache = {};
    for (var tdi = 0; tdi < draws.length; tdi++) {
      if (draws[tdi].kind !== 'face') continue;
      var tid = draws[tdi].face.texId;
      if (!texCache[tid]) texCache[tid] = await loadTextureFrame('texture', tid);
      var tfr = texCache[tid];
      if (tfr) {
        draws[tdi].face.img = tfr.img;
        draws[tdi].face.sx = tfr.sx; draws[tdi].face.sy = tfr.sy;
        draws[tdi].face.sw = tfr.sw; draws[tdi].face.sh = tfr.sh;
      } else {
        draws[tdi].face.img = null;
      }
    }
    for (var ddi = 0; ddi < draws.length; ddi++) {
      var d = draws[ddi];
      if (d.kind === 'face') {
        if (d.face.img) drawTexturedQuad(ctx, d.face, unit, ox, oy);
        continue;
      }
      if (d.kind === 'sprite') {
        // 修复: 展示实体把模型/图标渲染在实体位置「居中」, 不是底部贴地
        var rr = await drawItem(ctx, d.item, ox + d.sx - d.size / 2, oy + d.sy - d.size / 2, d.size);
        if (rr.kind === 'none') warn('furniture-unknown-item: ' + d.item);
        continue;
      }
      if (d.kind === 'text') {
        var tel = d.el, tavg = Math.max(0.05, d.avg);
        var tal = String(fval(tel.alignment) || 'center').toLowerCase();
        var ttx = -d.parsed.width / 2;
        if (tal === 'left') ttx = 0;
        else if (tal === 'right') ttx = -d.parsed.width;
        ctx.save();
        ctx.translate(ox + d.sx, oy + d.sy);
        if (tavg !== 1) ctx.scale(tavg, tavg);
        if (fkey(tel, 'use_default_background_color') === true || fkey(tel, 'background_color') != null) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(ttx - 1, -9, d.parsed.width + 2, LINE_HEIGHT + 1);
        }
        drawItems(ctx, d.parsed.items, ttx, 0, { shadow: fkey(tel, 'has_shadow') === true });
        ctx.restore();
        continue;
      }
      if (d.kind === 'external') {
        ctx.save();
        ctx.setLineDash && ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#BA68C8';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + d.sx - d.size / 2 + 0.5, oy + d.sy - d.size / 2 + 0.5, d.size - 1, d.size - 1);
        ctx.setLineDash && ctx.setLineDash([]);
        var ptE = parseText('<light_purple>' + (d.model || 'model'), { style: { color: hexToRgb('#BA68C8') } });
        drawItems(ctx, ptE.items, ox + d.sx - ptE.width / 2, oy + d.sy + d.size / 2 + 4, { shadow: false });
        ctx.restore();
        continue;
      }
    }

    // ---- 碰撞箱 + 座位 (最后画, 始终在最上层, 与 /ce debug furniture 一致) ----
    _furnPick = { boxes: [], handles: [], ox: 0, oy: 0 };
    for (var pi = 0; pi < pickBoxes.length; pi++) {
      var pk = pickBoxes[pi];
      var isHl = opt.highlight === pk.index;
      if (opt.hitboxes) {
        // 记录屏幕凸包多边形, 供面板点击拾取
        var hullPts = [];
        for (var hp = 0; hp < 8; hp++) {
          hullPts.push(fpt(ox, oy, (hp & 1) ? pk.box.max[0] : pk.box.min[0], (hp & 2) ? pk.box.max[1] : pk.box.min[1], (hp & 4) ? pk.box.max[2] : pk.box.min[2]));
        }
        // 盒体投影中心 (拾取时用来判断哪个箱子离点击更近)
        var boxC = fpt(ox, oy, (pk.box.min[0] + pk.box.max[0]) / 2, (pk.box.min[1] + pk.box.max[1]) / 2, (pk.box.min[2] + pk.box.max[2]) / 2);
        var poly = convexHull(hullPts);
        var dim = function (a, b) { return furnDim((b - a) / 16); };
        _furnPick.boxes.push({
          index: pk.index,
          poly: poly,
          type: pk.box.type,
          color: pk.color,
          cx: boxC.x, cy: boxC.y,
          lid: !!pk.box.lid,
          w: dim(pk.box.min[0], pk.box.max[0]),
          h: dim(pk.box.min[1], pk.box.max[1]),
          d: dim(pk.box.min[2], pk.box.max[2]),
          pos: fvec(pk.hb.position, [0, 0, 0]),
          seats: pk.seatPts.length
        });
        // 编辑手柄 (仅非壳体箱体 + 编辑模式): 底面中心 (挪位置) / 顶面中心 (改高度)
        if (editMode && !pk.box.lid) {
          var bmin = pk.box.min, bmax = pk.box.max;
          var pCen = fpt(ox, oy, (bmin[0] + bmax[0]) / 2, bmin[1], (bmin[2] + bmax[2]) / 2);
          var pTop = fpt(ox, oy, (bmin[0] + bmax[0]) / 2, bmax[1], (bmin[2] + bmax[2]) / 2);
          var hidP = 'hb-pos:' + pk.index, hidH = 'hb-height:' + pk.index;
          var midX = (bmin[0] + bmax[0]) / 2, midZ = (bmin[2] + bmax[2]) / 2;
          _furnPick.handles.push({ id: hidP, kind: 'hb-pos', boxIndex: pk.index, x: pCen.x, y: pCen.y, r: 8, color: pk.color, shape: 'square', prio: 0, hb: pk.hb, boxType: pk.box.type, baseY: bmin[1], topY: bmax[1] });
          // wx/wz = 手柄的世界中心: 高度手柄拖动时沿这条竖直线改 y
          _furnPick.handles.push({ id: hidH, kind: 'hb-height', boxIndex: pk.index, x: pTop.x, y: pTop.y, r: 8, color: pk.color, shape: 'diamond', prio: 1, hb: pk.hb, boxType: pk.box.type, baseY: bmin[1], topY: bmax[1], wx: midX, wz: midZ });
          drawEditHandle(ctx, pCen.x, pCen.y, pk.color, 'square', opt.editSel === hidP);
          drawEditHandle(ctx, pTop.x, pTop.y, pk.color, 'diamond', opt.editSel === hidH);
        }
        drawWireBox(ctx, ox, oy, pk.box.min, pk.box.max, pk.color, isHl ? 2 : 1.25,
          { fillAlpha: isHl ? 0.28 : (opt.fill ? 0.10 : 0) });
        if (isHl || opt.labels) {
          // 类型 + 尺寸标注 (画布内只能 ASCII): 画在盒体最高角的上方。
          // 潜影贝标上 direction / peek, 这样能看出为什么会有第二个箱体 (打开的壳)。
          var dirTag = '';
          if (pk.box.type === 'shulker') {
            var hdir = String(fkey(pk.hb, 'direction') || 'up').toLowerCase();
            if (hdir !== 'up') dirTag = ':' + hdir;
            if (pk.box.lid) dirTag += ' lid';
          }
          var lab = pk.box.type + dirTag + ' ' + furnDim((pk.box.max[0] - pk.box.min[0]) / 16) +
            'x' + furnDim((pk.box.max[1] - pk.box.min[1]) / 16) +
            'x' + furnDim((pk.box.max[2] - pk.box.min[2]) / 16);
          var top = hullPts[0];
          for (var tp = 1; tp < hullPts.length; tp++) if (hullPts[tp].y < top.y) top = hullPts[tp];
          var plab = parseText(isHl ? '<white>' + lab : furnColorTag(pk.color, lab), {});
          drawItems(ctx, plab.items, ox + top.x - plab.width / 2, oy + top.y - 4, { shadow: false });
        }
      }
      if (opt.seats) {
        for (var spi = 0; spi < pk.seatPts.length; spi++) {
          var sm = pk.seatPts[spi];
          var smq = drawSeatMarker(ctx, ox, oy, sm.world[0], sm.world[1], sm.world[2], sm.st.yaw, isHl);
          if (editMode) {
            var sid = 'seat:' + pk.index + ':' + (sm.si != null ? sm.si : spi);
            drawEditHandle(ctx, smq.x, smq.y, '#FFD54F', 'ring', opt.editSel === sid);
            // hb 必须带上: 面板写回座位时要用它定位 hb.seats 列表;
            // seatIndex 用 sm.si (hb.seats 的真实下标), 不能用渲染序号 —— 后者跳过了解析失败的座位
            _furnPick.handles.push({ id: sid, kind: 'seat', boxIndex: pk.index, seatIndex: (sm.si != null ? sm.si : spi), x: smq.x, y: smq.y, r: 7, color: '#FFD54F', shape: 'ring', prio: 2, world: sm.world, seat: sm.st, hb: pk.hb });
          }
        }
      }
    }
    // ---- 元素锚点手柄 (item/block_display 的 translation 拖拽) ----
    if (editMode) {
      for (var em = 0; em < v.elements.length; em++) {
        var eEl = fobj(v.elements[em]) || {};
        var eType = furnitureElementType(eEl);
        if (eType !== 'item_display' && eType !== 'block_display' && eType !== 'item') continue;
        var eXf = furnitureElementXf(eEl, sceneViewYaw);
        var eQ = fpt(ox, oy, eXf.anchor[0], eXf.anchor[1], eXf.anchor[2]);
        var eid = 'el-pos:' + em;
        drawEditHandle(ctx, eQ.x, eQ.y, '#EF5350', 'dot', opt.editSel === eid);
        _furnPick.handles.push({ id: eid, kind: 'el-pos', elementIndex: em, x: eQ.x, y: eQ.y, r: 6, color: '#EF5350', shape: 'dot', prio: 3, anchor: eXf.anchor, el: eEl });
      }
    }
    _furnPick.ox = ox; _furnPick.oy = oy; _furnPick.pitch = scenePitch; _furnPick.edit = !!editMode;

    // ---- 说明 ----
    // 画布里的文字只能用 ASCII: 原版字体数据包里 unifont 的 providers 是空的,
    // 这个资源版本没有 CJK 字形, 中文画进画布会变成空白。
    // 中文标签放在面板底部的状态栏 (DOM) 里显示。
    var head = v.name + '   elements ' + v.elements.length +
      '  ·  hitboxes ' + pickBoxes.length +
      '  ·  seats ' + seatCount;
    if (sceneViewYaw) head += '  ·  yaw ' + Math.round(sceneViewYaw) + 'deg';
    if (variants.length > 1) head += '   (' + (vi + 1) + '/' + variants.length + ')';
    var ph = parseText('<gray>' + head, {});
    drawItems(ctx, ph.items, 6, 14, { shadow: false });
    if (v.blueprint) {
      var pb = parseText('<light_purple>external model: ' + v.blueprint, {});
      drawItems(ctx, pb.items, 6, h - 12, { shadow: false });
    }
    if (externalModels.length) {
      warn('furniture-external-model: ' + externalModels.join(', '));
    }
    if (!v.elements.length) warn('furniture-no-elements');
    if (!v.hitboxes.length) warn('furniture-no-hitboxes');

    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  // 用碰撞箱自身的颜色给标注上色 (MiniMessage 支持 <#rrggbb>)
  function furnColorTag(hex, text) {
    return '<' + hex + '>' + text;
  }

  // ---------------- 模型场景 (display 上下文完整预览) ----------------
  // 「物品模型的完全预览」: 把物品/方块按指定 display 上下文的 ItemTransform 展开渲染。
  // 视图: yaw (±45 步进, 拖拽自由旋转) + pitch (俯仰) + zoom, 画布内容自适应。
  async function sceneItemModel(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    sceneViewYaw = ((parseFloat(scene.yaw) || 0) % 360 + 360) % 360;
    sceneZoom = clamp(parseFloat(scene.zoom) || 1, 0.25, 4);
    scenePitch = clampPitchDeg(scene.pitch != null ? scene.pitch : scene.viewPitch);
    var ctxName = normalizeDisplayContext(scene.displayContext) || 'gui';

    // ---- 解析模型: 1.21.4+ 定义 / 蓝图路径 / 直接模型 / 项目内引用 ----
    var ref = scene.modelRef || scene.icon || scene.item || scene.entryKey || null;
    var modelId = null, flatTex = null;
    var info = ref ? await resolveItemModel(ref) : { kind: 'none' };
    if (info && info.kind === 'ce-block' && info.blockData) {
      return await sceneBlock(canvas, { type: 'block', scale: scene.scale, options: scene.options,
        blockData: info.blockData, entryKey: scene.entryKey || '', yaw: scene.yaw, zoom: scene.zoom, pitch: scene.pitch });
    }
    if (info && info.kind === 'block' && info.model) modelId = info.model;
    else if (info && info.model) modelId = info.model;
    else if (info && info.texture) flatTex = info.texture;
    if (scene.modelId) modelId = String(scene.modelId);
    if (scene.textureId && !modelId) flatTex = String(scene.textureId);
    var flatCardSource = null;
    // 平面物品优先按贴图画卡片 (flatCardModel): 1.21.4 的 item/stick 之类只有
    // parent + layer0 贴图、没有 elements, 拿它当几何体会得到零面片的空模型。
    if (modelId && flatTex && (await flatKindModelAsync(modelId))) {
      flatCardSource = modelId; modelId = null;
    }
    // 只有 modelId (scene.modelId 直指 / 3D 判定路径) 也判一次: 无 elements 的模型
    // 此前从未进过缓存, 同步版会误报 false → 渲染出空模型
    else if (modelId && !flatTex && (await flatKindModelAsync(modelId))) {
      var ftex = await flatTextureOf(modelId);
      if (ftex) { flatCardSource = modelId; flatTex = ftex; modelId = null; }
    }
    // 贴图也读不到 (模型/纹理都不存在) → 老老实实报 model not found,
    // 不然 resolveItemModel 的「最后按路径猜贴图」回退会把错误吞成一张空卡片。
    if (!modelId && flatTex && !(await loadTextureFrame('texture', flatTex))) {
      modelId = null; flatTex = null;
    }
    if (!modelId && !flatTex) {
      var surfE = makeSurface(FURN_W, FURN_H, scale);
      surfE.ctx.fillStyle = 'rgba(0,0,0,0.72)';
      surfE.ctx.fillRect(0, 0, FURN_W, FURN_H);
      var pe = parseText('<red>model not found' + (ref ? ': ' + ref : ''), {});
      drawItems(surfE.ctx, pe.items, 8, 20, { shadow: false });
      warn('model-not-found' + (ref ? ': ' + ref : ''));
      blit(canvas, surfE);
      return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
    }

    // 平面物品: 竖直卡片 (和游戏内展示实体一致), 同样吃 display 变换
    var model = modelId ? await loadModelChain(modelId) : flatCardModel(flatTex);
    if (!model) {
      var surfM = makeSurface(FURN_W, FURN_H, scale);
      surfM.ctx.fillStyle = 'rgba(0,0,0,0.72)';
      surfM.ctx.fillRect(0, 0, FURN_W, FURN_H);
      var pmE = parseText('<red>model json missing: ' + modelId, {});
      drawItems(surfM.ctx, pmE.items, 8, 20, { shadow: false });
      warn('model-json-missing: ' + modelId);
      blit(canvas, surfM);
      return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
    }
    // display 链按「显示时的模型 id」取; 卡片化时链从原模型 id 取 (贴图上下文仍生效),
    // ref 兜底时把 ref 规范成裸路径再拼 item/ 前缀, 避免拼出 minecraft:item/minecraft:stick 这种非法 id
    var dispId = modelId || flatCardSource;
    if (!dispId && ref) {
      var rs = String(ref).replace(/^minecraft:/, '');
      dispId = 'minecraft:item/' + rs;
    }
    var chainDisp = dispId ? await collectDisplayChain(dispId) : {};
    // 项目内模型可能自带 display (CE 的物品模型类型), 与模型自身的合并 (自身优先)
    if (model && model.display) {
      var dk2 = Object.keys(model.display);
      for (var d2 = 0; d2 < dk2.length; d2++) {
        var base2 = isObj(chainDisp[dk2[d2]]) ? Object.assign({}, chainDisp[dk2[d2]]) : {};
        var own2 = model.display[dk2[d2]];
        if (isObj(own2)) {
          var fk2 = Object.keys(own2);
          for (var j2 = 0; j2 < fk2.length; j2++) base2[fk2[j2]] = own2[fk2[j2]];
        }
        chainDisp[dk2[d2]] = base2;
      }
    }
    var hasCtx = !!chainDisp[ctxName];
    // ground 是「掉在地上」的基准 (无 display 的旧模型也按 0.25 缩放渲染), 其余上下文缺省时回退
    var tr = chainDisp[ctxName] || (ctxName === 'ground' ? { scale: 0.25, translation: [0, 3, 0] } : chainDisp.gui) || {};
    var xf = displayXf(tr, sceneViewYaw, ctxName.indexOf('lefthand') >= 0, scenePitch);
    var unit = FURN_UNIT * sceneZoom;
    var faces = collectFacesFromModel(model, xf) || [];

    // ---- 包围盒 (投影后), 画布自适应 ----
    var PAD = 14, HEAD_H = 26;
    var bMinX = 0, bMinY = 0, bMaxX = 0, bMaxY = 0, hasBound = false;
    function grow(x, y) {
      if (!hasBound) { bMinX = bMaxX = x; bMinY = bMaxY = y; hasBound = true; return; }
      if (x < bMinX) bMinX = x; if (y < bMinY) bMinY = y;
      if (x > bMaxX) bMaxX = x; if (y > bMaxY) bMaxY = y;
    }
    // 面片角点已含 display 变换 + 视图 yaw + 俯仰 (displayXf 内倾斜), 直接等轴测投影
    var scrOf = function (x, y, z) {
      var s = project(x, y, z);
      return { x: s.x * unit, y: s.y * unit };
    };
    for (var fi = 0; fi < faces.length; fi++) {
      var c = faces[fi].corners;
      for (var ci = 0; ci < c.length; ci++) {
        var sp = scrOf(c[ci][0], c[ci][1], c[ci][2]);
        grow(sp.x, sp.y);
      }
    }
    if (!hasBound) { grow(-8, -16); grow(8, 0); }   // 空模型: 至少给个 1 格大的画布
    // 地面足迹 (y=0 平面上的方块轮廓), 帮助判断 translation 的高度
    if (scene.showGround !== false) {
      for (var gxi = 0; gxi < 2; gxi++) {
        for (var gzi = 0; gzi < 2; gzi++) {
          var gp = scrOf(gxi * 16, 0, gzi * 16);
          grow(gp.x, gp.y);
        }
      }
    }
    var w = clamp(Math.ceil(bMaxX - bMinX) + PAD * 2, FURN_W, FURN_MAX_W);
    var h = clamp(Math.ceil(bMaxY - bMinY) + PAD + HEAD_H, FURN_H, FURN_MAX_H);
    var surf = makeSurface(w, h, scale);
    var ctx = surf.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);
    var ox = PAD + (w - PAD * 2 - (bMaxX - bMinX)) / 2 - bMinX;
    var oy = HEAD_H + (h - PAD - HEAD_H - (bMaxY - bMinY)) / 2 - bMinY;

    // ---- 地面足迹 (显示 translation 是否把模型抬离地面) ----
    if (scene.showGround !== false) {
      var gg = [];
      for (var gi = 0; gi < 4; gi++) {
        gg.push(scrOf((gi & 1) ? 16 : 0, 0, (gi & 2) ? 16 : 0));
      }
      ctx.beginPath();
      ctx.moveTo(ox + gg[0].x, oy + gg[0].y);
      ctx.lineTo(ox + gg[1].x, oy + gg[1].y);
      ctx.lineTo(ox + gg[3].x, oy + gg[3].y);
      ctx.lineTo(ox + gg[2].x, oy + gg[2].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ---- 面片: 贴图加载 + 深度已由 collectFacesFromModel 排序 ----
    var texCache = {};
    for (var ti = 0; ti < faces.length; ti++) {
      var tid = faces[ti].texId;
      if (!texCache[tid]) texCache[tid] = await loadTextureFrame('texture', tid);
      var tfr = texCache[tid];
      if (tfr) {
        faces[ti].img = tfr.img;
        faces[ti].sx = tfr.sx; faces[ti].sy = tfr.sy;
        faces[ti].sw = tfr.sw; faces[ti].sh = tfr.sh;
      } else {
        faces[ti].img = null;
      }
    }
    paintFaces(ctx, faces, unit, ox, oy);

    // ---- 页眉 (ASCII) ----
    var head = String(ref || modelId || flatTex || '') + '   ctx: ' + ctxName +
      (hasCtx ? '' : ' (fallback)') + '   faces ' + faces.length;
    if (sceneViewYaw) head += '  yaw ' + Math.round(sceneViewYaw);
    if (Math.abs(scenePitch - 30) > 0.5) head += '  pitch ' + Math.round(scenePitch);
    if (sceneZoom !== 1) head += '  zoom ' + Math.round(sceneZoom * 100) + '%';
    var ph = parseText('<gray>' + head, {});
    drawItems(ctx, ph.items, 6, 14, { shadow: false });
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  // 命名空间是否形如合法 id (block_display 的解析用)
  function dnsOk(ns) { return !!ns && /^[a-z0-9_.-]+$/.test(ns); }

  // ---- 字体图像总览: 只看当前选中的这一个条目 (按配置的真实尺寸 1:1 绘制) ----
  // 之前是把工程里全部 images 条目堆在一个固定行高的列表里, 大图 (CE 内置 GUI 图 140px)
  // 会互相重叠、被裁成窄条, 反而看不清。这里改为只展示当前条目。
  async function sceneImageGallery(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    var id = scene.imageId || scene.entryKey || null;
    if (!id) {
      var all = Object.keys(_projectData.images || {});
      id = all.length === 1 ? all[0] : null;
    }
    if (!id || !_projectData.images[id]) {
      var s0 = makeSurface(220, 20, scale);
      var p0 = parseText(t('preview.noImages', '当前工程未找到 images 条目'), { style: { color: hexToRgb('#AAAAAA') } });
      drawItems(s0.ctx, p0.items, 4, 12, {});
      blit(canvas, s0);
      return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
    }
    var entry = _projectData.images[id];
    var glyph = imageGlyph(id, null, null);
    var info = glyph || { width: 8, height: 8, ascent: 7, missing: true };
    var offsetOnly = !!info.offsetOnly;
    var imgH = offsetOnly ? 0 : imageRenderHeight(info.height, 8);
    var imgW = offsetOnly ? 1 : Math.max(1, Number(info.width) || 1);
    var asc = offsetOnly ? 0 : ((typeof info.ascent === 'number' && isFinite(info.ascent)) ? info.ascent : imgH - 1);
    // 文字提示行 (条目 id + 配置的 height/ascent/文件名)
    var cfgH = imageHeightOf(entry);
    var cfgA = imageAscentOf(entry, cfgH);
    var note = id + (cfgH != null ? '  height=' + cfgH : '') + (cfgA != null ? ' ascent=' + cfgA : '') +
      (entry.file ? '  ' + String(entry.file).split('/').pop() : (entry.ref ? '  ref=' + entry.ref : ''));
    var pNote = parseText('<gray>' + note, {});
    var padX = 8, padY = 6;
    var captionH = LINE_HEIGHT;
    // 自动界面尺寸按「图片宽度」计算 (说明文字更长, 不该把图缩小)
    var surf = makeSurface(Math.max(120, Math.max(imgW, pNote.width) + padX * 2), padY * 2 + imgH + 4 + captionH,
      scale, imgW + padX * 2);
    surf.ctx.fillStyle = 'rgba(0,0,0,0.85)';
    surf.ctx.fillRect(0, 0, surf.w, surf.h);
    // 直接把图像顶边放在 padY 处: 字形绘制位置 = 基线 - ascent, 所以基线取 padY + ascent
    drawItems(surf.ctx, parseText('<image:' + id + '>', {}).items, padX, padY + asc, { shadow: false });
    // 说明文字排在图片下方
    drawItems(surf.ctx, pNote.items, padX, padY + imgH + 4 + LINE_ASCENT, { shadow: false });
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }

  // ================= CraftEngine 方块 (block) 预览 =================
  // 与家具不同: 方块按「原版方块模型」渲染 —— 一个 1x1x1 的立方体 + 贴图槽位。
  // 语义全部按 CraftEngine 源码核校 (E:\craft-engine), 官方 WIKI 有若干处与源码不符, 这里以源码为准:
  //   · 贴图槽位顺序 3 张 = bottom,side,top (WIKI 写的 bottom,top,side 是错的)
  //   · 4 张 = bottom,front,side,top (WIKI 写 bottom,top,front,side)
  //   · 5+ 张 = down,up,north,south,west,east, 且 5 张时 east/west 互补共享
  //   · 槽位分配先按文件名匹配, 匹配不上才按顺序填 (TextureSlotAssigner 三段式)
  //   · 没有任何 model/textures 的方块渲染为「空」, 不是原版载体方块
  var BLOCK_SLOTS = {
    1: { parent: 'minecraft:block/cube_all', slots: ['all'] },
    2: { parent: 'minecraft:block/cube_column', slots: ['end', 'side'] },
    3: { parent: 'minecraft:block/cube_bottom_top', slots: ['bottom', 'side', 'top'] },
    4: { parent: 'minecraft:block/orientable', slots: ['bottom', 'front', 'side', 'top'] },
  };
  var BLOCK_CUBE_PARENT = 'minecraft:block/cube';
  var BLOCK_SIX_SLOTS = ['down', 'up', 'north', 'south', 'west', 'east'];
  // 方块预览的基准尺寸: 1 格方块放大到 ~150px 见方, 才看得清贴图细节
  var BLOCK_BLOCK_PX = 150;   // (旧孤立大方块基准, 世界视角后未再使用)
  var BLOCK_MIN_W = 180, BLOCK_MIN_H = 170;
  // 方块属性类型 → 可选值 (源码 Properties.java + 各枚举声明顺序)
  var BLOCK_PROPERTY_TYPES = {
    'boolean': { values: ['true', 'false'], def: 'false' },
    'axis': { values: ['x', 'y', 'z'], def: 'x' },
    'horizontal_direction': { values: ['north', 'east', 'south', 'west'], def: 'north' },
    '4-direction': { values: ['north', 'east', 'south', 'west'], def: 'north' },
    'direction': { values: ['down', 'up', 'north', 'south', 'west', 'east'], def: 'down' },
    '6-direction': { values: ['down', 'up', 'north', 'south', 'west', 'east'], def: 'down' },
    'single_block_half': { values: ['bottom', 'top'], def: 'bottom' },
    'double_block_half': { values: ['upper', 'lower'], def: 'upper' },
    'hinge': { values: ['left', 'right'], def: 'left' },
    'stairs_shape': { values: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'], def: 'straight' },
    'slab_type': { values: ['top', 'bottom', 'double'], def: 'top' },
    'sofa_shape': { values: ['straight', 'inner_left', 'inner_right'], def: 'straight' },
    'anchor_type': { values: ['floor', 'wall', 'ceiling'], def: 'floor' },
    'bed_part': { values: ['head', 'foot'], def: 'head' },
  };
  var BLOCK_SIMPLE_TEX = { yaml: 1 };
  function blkSlotKeyName(id) {
    var s = String(id == null ? '' : id);
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }
  // TextureSlotAssigner 的三段式: ①文件名精确/后缀匹配 ②包含匹配 ③按顺序填
  function blkAssignSlots(textures, slots) {
    var features = textures.map(blkSlotKeyName);
    var used = textures.map(function () { return false; });
    var filled = {};
    var out = {};
    function high(f, s) { return f === s || f.slice(-(s.length + 1)) === '_' + s; }
    function low(f, s) { return f.indexOf(s) >= 0; }
    function pass(test) {
      for (var i = 0; i < textures.length; i++) {
        if (used[i]) continue;
        for (var s = 0; s < slots.length; s++) {
          if (filled[slots[s]]) continue;
          if (test(features[i], slots[s])) {
            out[slots[s]] = textures[i]; used[i] = true; filled[slots[s]] = true; break;
          }
        }
      }
    }
    pass(high); pass(low);
    var si = 0;
    for (var i = 0; i < textures.length; i++) {
      if (used[i]) continue;
      while (si < slots.length && filled[slots[si]]) si++;
      if (si >= slots.length) break;
      out[slots[si]] = textures[i]; used[i] = true; filled[slots[si]] = true; si++;
    }
    return out;
  }
  // 取出 state/appearance 里的贴图列表 (texture / textures, 字符串或列表), 附带粒子贴图标记
  function blkTextureList(modelSection) {
    var raw = fval(fkey(modelSection, 'textures'));
    if (raw === undefined) raw = fval(fkey(modelSection, 'texture'));
    var list = flist(raw).filter(function (x) { return typeof x === 'string'; });
    var particle = null;
    list = list.map(function (t) {
      var s = String(t).replace(/\\/g, '/').toLowerCase();
      if (s.charAt(0) === '^') { if (particle == null) particle = s.slice(1); return s.slice(1); }
      return s;
    });
    return { textures: list, particle: particle };
  }
  // 由 N 张贴图推出父模型 + 槽位分配 (源码 SimplifiedBlockModelReader 系列)
  function blkInferFromTextures(textures) {
    var n = textures.length;
    var spec = BLOCK_SLOTS[n];
    var slots, parent;
    if (spec) { slots = spec.slots; parent = spec.parent; }
    else if (n >= 5) { slots = BLOCK_SIX_SLOTS; parent = BLOCK_CUBE_PARENT; }
    else return null;
    var assign = blkAssignSlots(textures, slots);
    // 原版 cube 模型 east/west 恒定共享: 5 张时缺的一边补另一边
    if (parent === BLOCK_CUBE_PARENT) {
      if (assign.east == null && assign.west != null) assign.east = assign.west;
      if (assign.west == null && assign.east != null) assign.west = assign.east;
    }
    return { parent: parent, textures: assign };
  }
  // 解析方块条目的视觉模型 → { model:{textures,elements}, transparent, entityRenderer, warnings }
  // 优先级严格按源码 AbstractBlockManager: transparent > blueprint > textures > model/models > 无
  async function resolveBlockVisual(data, defaultNs) {
    var d = fobj(data) || {};
    var warnList = [];
    // states 段里依次是 properties / appearances / variants (源码 AbstractBlockManager 607-626)
    var stateSec = fobj(fkey(d, 'state'));
    var statesSec = fobj(fkey(d, 'states'));
    // appearances 在 states 里面; 兼容极少数把它写在块顶层的写法
    var appearances = statesSec ? fobj(fkey(statesSec, 'appearances')) : null;
    if (!appearances) appearances = fobj(fkey(d, 'appearances'));
    var appearanceNames = appearances ? Object.keys(appearances) : [];
    var chosenName = null;
    if (statesSec && appearanceNames.length) {
      // variant 匹配: 命中的第一条取 appearance, 都不命中 → YAML 里第一个 appearance
      chosenName = blkPickAppearance(statesSec, appearanceNames);
    } else if (appearances && appearanceNames.length === 1) {
      // 没有 properties 时, 单个 appearance 等价于 state 段 (源码 609-619)
      chosenName = appearanceNames[0];
    }
    var sec = null;
    if (chosenName != null && appearances) sec = fobj(appearances[chosenName]);
    else if (stateSec) sec = stateSec;
    else if (appearances && appearanceNames.length) sec = fobj(appearances[appearanceNames[0]]);
    if (!sec) {
      // 连 state 段都没有: 该方块没有视觉模型
      return { model: null, transparent: true, entityRenderer: null, appearances: appearanceNames,
               appearance: chosenName, warnings: ['block-no-state'] };
    }
    var transparent = fkey(sec, 'transparent') === true;
    var entityRenderer = fkey(sec, 'entity_renderer');
    var modelSec = fobj(fkey(sec, 'model'));
    var modelsSec = fkey(sec, 'models');
    var blueprint = fkey(sec, 'blueprint');
    var out = { model: null, transparent: transparent, entityRenderer: entityRenderer,
                appearances: appearanceNames, appearance: chosenName, warnings: warnList };
    // ① transparent: 清空自身模型 (仍可能有 entity_renderer)
    if (transparent) return out;
    // ② blueprint (Blockbench .bbmodel): 客户端拿不到几何, 明确提示
    var bp = blueprint != null ? blueprint : (modelSec ? fkey(modelSec, 'blueprint') : null);
    if (bp != null) {
      warnList.push('block-blueprint-unsupported: ' + bp);
      out.blueprint = String(fval(bp));
      return out;
    }
    // ③ textures / texture 简写
    var tl = modelSec ? blkTextureList(modelSec) : blkTextureList(sec);
    if (tl.textures.length) {
      var infer = blkInferFromTextures(tl.textures);
      if (infer) {
        var gen = modelSec ? fobj(fkey(modelSec, 'generation')) : null;
        if (gen) {
          // generation 优先: 显式 parent + 显式槽位
          var gt = fobj(fkey(gen, 'textures')) || {};
          var gtMap = {};
          Object.keys(gt).forEach(function (k) { var v = fval(gt[k]); if (typeof v === 'string') gtMap[k] = v; });
          out.model = { parent: normalizeResourceId(fval(fkey(gen, 'parent')) || BLOCK_CUBE_PARENT, defaultNs || activeNamespace() || 'minecraft'), textures: gtMap };
        } else {
          out.model = { parent: infer.parent, textures: infer.textures };
        }
        if (tl.particle) out.model.textures.particle = tl.particle;
        out.fromTextures = tl.textures.length;
        out.rot = blkRotation(modelSec || sec);
        return out;
      }
      warnList.push('block-texture-count-unsupported: ' + tl.textures.length);
      return out;
    }
    // ④ model / models: 直接给模型路径, 或 weights 列表 (预览取第一个)
    var mv = modelSec ? fkey(modelSec, 'path') : null;
    if (mv == null && modelSec) mv = fkey(modelSec, 'model');
    if (mv == null && typeof fval(fkey(sec, 'model')) === 'string') mv = fval(fkey(sec, 'model'));
    if (mv == null && Array.isArray(fval(modelsSec)) && fval(modelsSec).length) {
      var first = fobj(fval(modelsSec)[0]);
      mv = first ? (fkey(first, 'path') || fkey(first, 'model')) : null;
      if (Array.isArray(fval(modelsSec)) && fval(modelsSec).length > 1) {
        out.modelChoices = fval(modelsSec).length;
      }
    }
    if (mv != null) {
      var mid = normalizeResourceId(fval(mv), defaultNs || activeNamespace() || 'minecraft');
      out.model = { ref: mid };
      out.rot = blkRotation(modelSec || sec);
      return out;
    }
    // ⑤ 什么都没有: 源码里这种方块渲染为「空模型」
    warnList.push('block-no-model');
    out.transparent = true;
    out.emptyModel = true;
    return out;
  }
  // model/appearance 上的 x/y/z 旋转 (必须是 90 的倍数)
  function blkRotation(sec) {
    if (!sec) return null;
    var mx = fnum(fkey(sec, 'x')), my = fnum(fkey(sec, 'y')), mz = fnum(fkey(sec, 'z'));
    if (mx == null && my == null && mz == null) return null;
    return { x: mx || 0, y: my || 0, z: mz || 0 };
  }
  // 变体匹配: 返回 appearance 名; 不命中返回 YAML 里第一个
  function blkPickAppearance(statesSec, names) {
    var variants = fobj(fkey(statesSec, 'variants'));
    var sel = fobj(fkey(statesSec, '_ceVariant'));
    if (!variants || !sel) return names[0];
    var vkeys = Object.keys(variants);
    for (var i = 0; i < vkeys.length; i++) {
      if (blkVariantMatches(vkeys[i], sel)) {
        var v = fobj(variants[vkeys[i]]);
        var ap = v ? fkey(v, 'appearance') : null;
        if (ap != null && names.indexOf(String(fval(ap))) >= 0) return String(fval(ap));
      }
    }
    return names[0];
  }
  // variant 键 = "prop=val,prop=val"; 没写的属性是通配
  function blkVariantMatches(key, sel) {
    var parts = String(key).split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var eq = p.indexOf('=');
      if (eq < 0) return false;
      var n = p.slice(0, eq).trim(), want = p.slice(eq + 1).trim();
      var got = sel[n];
      if (got == null) continue;              // 该状态没这个属性: 视为通配
      if (String(got) !== want) return false;
    }
    return true;
  }
  // 枚举全部内部状态 (属性名按字母序 —— 源码用 ImmutableSortedMap)
  function blockStateList(data) {
    var d = fobj(data) || {};
    var statesSec = fobj(fkey(d, 'states'));
    if (!statesSec) return null;
    var props = fobj(fkey(statesSec, 'properties'));
    if (!props) return null;
    var names = Object.keys(props).sort();
    var dims = names.map(function (n) {
      var p = fobj(props[n]) || {};
      var type = String(fval(fkey(p, 'type')) || '');
      var spec = BLOCK_PROPERTY_TYPES[type];
      var vals = null;
      if (type === 'int') {
        var rng = fval(fkey(p, 'range'));
        var lo = fnum(fkey(p, 'min')), hi = fnum(fkey(p, 'max'));
        if (typeof rng === 'string' && rng.indexOf('~') >= 0) {
          var sp = rng.split('~');
          lo = parseFloat(sp[0]); hi = parseFloat(sp[1]);
        }
        if (lo != null && hi != null && hi >= lo) {
          vals = [];
          for (var v = lo; v <= hi; v++) vals.push(String(v));
        }
      } else if (type === 'string') {
        vals = flist(fkey(p, 'values')).map(String);
      }
      var given = flist(fkey(p, 'values')).map(String);
      if (given.length && (!vals || !vals.length)) vals = given;
      if (!vals || !vals.length) vals = spec ? spec.values.slice() : [];
      var def = fval(fkey(p, 'default'));
      if (def == null || vals.indexOf(String(def)) < 0) {
        def = spec && vals.indexOf(spec.def) >= 0 ? spec.def : (vals[0] || '');
      }
      return { name: n, type: type, values: vals, def: String(def) };
    }).filter(function (x) { return x.values.length; });
    if (!dims.length) return null;
    // 笛卡尔积
    var out = [{}];
    dims.forEach(function (dim) {
      var next = [];
      out.forEach(function (base) {
        dim.values.forEach(function (v) {
          var o = {};
          Object.keys(base).forEach(function (k) { o[k] = base[k]; });
          o[dim.name] = v;
          next.push(o);
        });
      });
      out = next;
    });
    return { props: dims, states: out };
  }
  // 一个 state 上生效的 settings (variants 里只写 settings 的条目也会合并)
  function blockEffectiveSettings(data, sel) {
    var d = fobj(data) || {};
    var statesSec = fobj(fkey(d, 'states')) || fobj(fkey(d, 'state'));
    var merged = {};
    var base = fobj(fkey(d, 'settings'));
    if (base) Object.keys(base).forEach(function (k) { merged[k] = base[k]; });
    var variants = statesSec ? fobj(fkey(statesSec, 'variants')) : null;
    if (variants && sel) {
      Object.keys(variants).forEach(function (vk) {
        if (!blkVariantMatches(vk, sel)) return;
        var v = fobj(variants[vk]);
        var st = v ? fobj(fkey(v, 'settings')) : null;
        if (st) Object.keys(st).forEach(function (k) { merged[k] = st[k]; });
      });
    }
    return merged;
  }
  // 从 state 段取 auto_state / state 的「载体方块」名 (仅用于状态栏提示)
  function blockCarrier(data) {
    var d = fobj(data) || {};
    var statesSec = fobj(fkey(d, 'states'));
    var appearances = fobj(fkey(d, 'appearances'));
    var sec = fobj(fkey(d, 'state'));
    if (!sec && appearances) {
      var ks = Object.keys(appearances);
      if (ks.length) sec = fobj(appearances[ks[0]]);
    }
    if (!sec && statesSec) return null;
    if (!sec) return null;
    var car = fkey(sec, 'auto_state');
    if (car != null) {
      var co = fobj(car);
      return co ? String(fval(fkey(co, 'type')) || '') : String(fval(car));
    }
    var st = fkey(sec, 'state');
    return st != null ? String(fval(st)) : null;
  }
  // 把「父模型 + 槽位贴图」展开成可渲染的 elements (cube_all 等原版方块模型)
  async function blkBuildGeometry(visual) {
    if (!visual || !visual.model) return null;
    if (visual.model.ref) {
      var chain = await loadModelChain(visual.model.ref);
      if (!chain) return null;
      return { model: chain, modelId: visual.model.ref };
    }
    var parentChain = await loadModelChain(visual.model.parent);
    if (!parentChain) return null;
    var tex = visual.model.textures || {};
    // 用槽位贴图覆盖父模型贴图 (对应 CE 生成的 textures 覆盖)
    var merged = { textures: {}, elements: parentChain.elements, display: parentChain.display, parent: parentChain.parent };
    Object.assign(merged.textures, parentChain.textures || {});
    if (!parentChain.elements) {
      // 父模型 (cube_all 等) 自身也是 parent 链: 合并后 elements 应在链上
      // loadModelChain 已递归合并, 到这里还没有 elements 说明模板缺失 → 用内置立方体
      merged.elements = builtinCubeElements();
    }
    Object.keys(tex).forEach(function (k) {
      // 槽位名直接覆盖; 原版 cube 的贴图键就是 all/side/top/...
      merged.textures[k] = tex[k];
    });
    return { model: merged, modelId: visual.model.parent };
  }
  // 内置 1x1x1 立方体 (父模型读不到时的兜底, 保证总能画出一个方块)
  function builtinCubeElements() {
    var faces = {};
    ['down', 'up', 'north', 'south', 'west', 'east'].forEach(function (f) {
      faces[f] = { texture: '#' + f };
    });
    return [{ from: [0, 0, 0], to: [16, 16, 16], faces: faces }];
  }

  // ---------------- 方块 entity_renderer ----------------
  // CE 的 entity_renderer 在方块本体之外再渲染一层实体 (BlockDisplay/ItemDisplay/TextDisplay/
  // Item/ArmorStand)。方块自身的 model 与这一层互不影响: transparent: true 只清方块模型。
  // 各类型的 position 默认值不同 (源码 EntityRenderer 默认值):
  //   item_display / text_display / item / armor_stand / better_model / model_engine → (0.5, 0.5, 0.5)
  //   block_display → (0, 0, 0)
  // better_model / model_engine 是插件侧渲染, 浏览器里没有几何体, 只出提示。
  function blkEntityType(er) {
    var t = fval(er && (er.type || er.entity_type));
    return t ? String(t).toLowerCase() : 'item_display';
  }
  function blkEntityDefaultPos(type) {
    return type === 'block_display' ? [0, 0, 0] : [0.5, 0.5, 0.5];
  }
  // entity_renderer 在画布上占的范围 (用于包围盒/居中)。
  // 返回 {x, y, half} (方块/物品层) 或 {x, y, textWidth} (文本层); 无实体层返回 null。
  // scr: (x,y,z) → 画布内相对坐标 (未含 ox/oy); unit: 当前场景的每单位像素
  function blockEntityExtent(visual, scr, unit) {
    var er = fobj(visual && visual.entityRenderer);
    if (!er) return null;
    var type = blkEntityType(er);
    if (type === 'better_model' || type === 'model_engine') return null;
    var pos = fvec(fkey(er, 'position'), blkEntityDefaultPos(type));
    var a = scr(pos[0] * 16, pos[1] * 16, pos[2] * 16);
    if (type === 'text_display') {
      var txt = String(fval(fkey(er, 'text')) || '');
      if (!txt) return null;
      var parsed = parseText(txt, {});
      return { x: a.x, y: a.y, textWidth: parsed.width };
    }
    // 展示实体占位: 按 8 个角点在屏幕上精确 grow。
    // block_display: 方块从 position 向 +x/+y/+z 伸展整格 (原版语义);
    // 其余类型: 以 entity 位置为中心的一格立方体。
    // scr 为 wscr (与烘焙同一旋转), 故任意 yaw/pitch 下范围稳定不跳。
    var corners = [];
    if (type === 'block_display') {
      for (var bx = 0; bx <= 1; bx++) for (var by = 0; by <= 1; by++) for (var bz = 0; bz <= 1; bz++)
        corners.push([pos[0] * 16 + bx * 16, pos[1] * 16 + by * 16, pos[2] * 16 + bz * 16]);
    } else {
      for (var cx = -1; cx <= 1; cx += 2) for (var cy = -1; cy <= 1; cy += 2) for (var cz = -1; cz <= 1; cz += 2)
        corners.push([pos[0] * 16 + cx * 8, pos[1] * 16 + cy * 8, pos[2] * 16 + cz * 8]);
    }
    var half = 8 * unit;
    for (var ci = 0; ci < corners.length; ci++) {
      var cs = scr(corners[ci][0], corners[ci][1], corners[ci][2]);
      half = Math.max(half, Math.abs(cs.x - a.x), Math.abs(cs.y - a.y));
    }
    return { x: a.x, y: a.y, half: half };
  }

  // 返回值给 sceneBlock 追加到抬头文字里
  async function drawBlockEntityRenderer(ctx, visual, env) {
    var er = fobj(visual.entityRenderer);
    if (!er) return [];
    var lines = [];
    var type = blkEntityType(er);
    var unit = env.unit;

    if (type === 'better_model' || type === 'model_engine') {
      // 这两种由插件/客户端模型引擎渲染, 浏览器预览没有几何数据
      warn('block-entity-external: ' + type);
      lines.push('<yellow>' + t('preview.blockEntityExternal', 'entity_renderer 由插件渲染, 预览不可用') + ': ' + type);
      return lines;
    }

    var pos = fvec(fkey(er, 'position'), blkEntityDefaultPos(type));
    // 世界坐标 (格) → 方块局部坐标 (1 格 = 16 单位, 方块底部中心为原点)
    var lx = pos[0] * 16, ly = pos[1] * 16, lz = pos[2] * 16;
    var anchor = env.scr(lx, ly, lz);
    var sx = env.ox + anchor.x, sy = env.oy + anchor.y;

    // 该实体层自己的旋转 (yaw/pitch, 单位度)
    var eyaw = parseFloat(fval(fkey(er, 'yaw'))) || 0;
    var epitch = parseFloat(fval(fkey(er, 'pitch'))) || 0;

    if (type === 'text_display') {
      var txt = fval(fkey(er, 'text')) || '';
      if (txt === '') { lines.push('<gray>' + t('preview.blockEntityText', '文本实体') + ': (空)'); return lines; }
      var parsed = parseText(String(txt), { style: { color: { r: 255, g: 255, b: 255, a: 1 } } });
      // 文本层按「实体中心」对齐, 再往上提半行, 让文字落在 position 处
      var tx = sx, ty = sy + LINE_ASCENT / 2;
      var align = String(fval(fkey(er, 'alignment')) || 'center').toLowerCase();
      if (align === 'left') { /* 左对齐: 原点在左侧 */ }
      else if (align === 'right') tx -= parsed.width;
      else tx -= parsed.width / 2;
      drawItems(ctx, parsed.items, tx, ty, { shadow: fkey(er, 'has_shadow') === true });
      lines.push('<gray>' + t('preview.blockEntityText', '文本实体') + ': ' + String(txt).slice(0, 40));
      return lines;
    }

    if (type === 'block_display') {
      var blk = String(fval(fkey(er, 'block')) || '');
      if (!blk) { lines.push('<gray>' + t('preview.blockEntityBlock', '方块实体') + ': (未指定)'); return lines; }
      var bp = blk.indexOf(':') === -1 ? blk : blk.split(':')[1].replace(/\[.*\]$/, '');
      var bns = blk.indexOf(':') === -1 ? 'minecraft' : blk.split(':')[0];
      if (!dnsOk(bns)) return lines;
      // 展示实体里的方块用同一套 3D 变换渲染
      var bxf = { pt: function (p) { return blockRot(p, null, env.yaw + eyaw, env.pitch + epitch); },
                  nrm: function (n) { return blockRotN(n, null, env.yaw + eyaw, env.pitch + epitch); } };
      var bFaces = await collectModelFaces(bns + ':block/' + bp, bxf);
      if (bFaces && bFaces.length) {
        // 新 blockRot 不做中心平移: 烘焙后模型 [0..16]³ 原点落在
        // anchor = wscr(pos*16), 即方块从 position 向 +x/+y/+z 伸展整格
        // (原版 block_display 的放置语义), 与主方块/线框同一世界变换
        var cache = {};
        for (var i = 0; i < bFaces.length; i++) {
          var fid = bFaces[i].texId;
          if (!(fid in cache)) cache[fid] = await loadTextureFrame('texture', fid);
          var fr = cache[fid];
          if (fr) { bFaces[i].img = fr.img; bFaces[i].sx = fr.sx; bFaces[i].sy = fr.sy; bFaces[i].sw = fr.sw; bFaces[i].sh = fr.sh; }
          else bFaces[i].img = null;
        }
        paintFaces(ctx, bFaces, unit, env.ox + anchor.x, env.oy + anchor.y, null);
        lines.push('<gray>' + t('preview.blockEntityBlock', '方块实体') + ': ' + blk);
      } else {
        warn('block-entity-unknown-block: ' + blk);
        lines.push('<yellow>' + t('preview.blockEntityUnknown', '实体引用的方块解析不到') + ': ' + blk);
      }
      return lines;
    }

    // item_display / item / armor_stand: 用物品模型
    var item = fval(fkey(er, 'item')) || fval(fkey(er, 'item_model'));
    if (!item) { lines.push('<gray>' + t('preview.blockEntityItem', '物品实体') + ': (未指定)'); return lines; }
    var im = await resolveItemModel(String(item));
    if (!im || im.kind === 'none') {
      warn('block-entity-unknown-item: ' + item);
      lines.push('<yellow>' + t('preview.blockEntityUnknown', '实体引用的方块解析不到') + ': ' + item);
      return lines;
    }
    // 3D 方块物品: 直接按模型画
    if (im.kind === 'block' && im.model) {
      // 物品展示实体以 entity 位置为中心: 先局部把模型立方体中心化
      // (-8), 再走与场景同一的世界烘焙变换 (blockRot 无平移)
      var ixf = { pt: function (p) { return blockRot([p[0] - 8, p[1] - 8, p[2] - 8], null, env.yaw + eyaw, env.pitch + epitch); },
                  nrm: function (n) { return blockRotN(n, null, env.yaw + eyaw, env.pitch + epitch); } };
      var iFaces = await collectModelFaces(im.model, ixf);
      if (iFaces && iFaces.length) {
        var c2 = {};
        for (var j = 0; j < iFaces.length; j++) {
          var jid = iFaces[j].texId;
          if (!(jid in c2)) c2[jid] = await loadTextureFrame('texture', jid);
          var fr2 = c2[jid];
          if (fr2) { iFaces[j].img = fr2.img; iFaces[j].sx = fr2.sx; iFaces[j].sy = fr2.sy; iFaces[j].sw = fr2.sw; iFaces[j].sh = fr2.sh; }
          else iFaces[j].img = null;
        }
        // 中心化后的烘焙坐标以 anchor 为中心线性叠加
        paintFaces(ctx, iFaces, unit, env.ox + anchor.x, env.oy + anchor.y, null);
        lines.push('<gray>' + t('preview.blockEntityItem', '物品实体') + ': ' + String(item));
        return lines;
      }
    }
    // 平面物品: 画成竖直卡片 (与原版展示实体一致)
    var tex = (im.texture && im.kind === 'flat') ? await loadImageAny('texture', im.texture) : null;
    if (tex) {
      var size = 16 * unit;
      var cardX = sx - size / 2, cardY = sy - size / 2;
      try { ctx.drawImage(tex, cardX, cardY, size, size); } catch (e) { /* ignore */ }
      lines.push('<gray>' + t('preview.blockEntityItem', '物品实体') + ': ' + String(item));
    } else {
      warn('block-entity-unknown-item: ' + item);
      lines.push('<yellow>' + t('preview.blockEntityUnknown', '实体引用的方块解析不到') + ': ' + item);
    }
    return lines;
  }

  async function sceneBlock(canvas, scene) {
    await fontReady();
    var scale = normScale(scene.scale);
    sceneViewYaw = ((parseFloat(scene.yaw) || 0) % 360 + 360) % 360;
    sceneZoom = clamp(parseFloat(scene.zoom) || 1, 0.25, 4);
    scenePitch = clampPitchDeg(scene.pitch != null ? scene.pitch : 30);
    var data = scene.blockData || scene.data || {};
    var visual = await resolveBlockVisual(data, resourceNamespace(scene.entryKey, activeNamespace() || 'minecraft'));
    // 解析阶段的警告要并入渲染警告 (面板状态栏/诊断会读它)
    (visual.warnings || []).forEach(function (w) { warn(w); });
    var chain = await blkBuildGeometry(visual);
    var blockModel = chain ? chain.model : null;

    // 模型自带 display (少数方块模型有) 与视图角度一起构成变换;
    // 方块按原版方式立在世界原点, 默认等轴测视角
    var xf = { pt: function (p) { return blockRot(p, visual.rot, sceneViewYaw, scenePitch); },
               nrm: function (n) { return blockRotN(n, visual.rot, sceneViewYaw, scenePitch); } };
    var faces = blockModel ? (collectFacesFromModel(blockModel, xf) || []) : [];

    var PAD = 20, HEAD_H = 26;
    var opt = { grid: scene.showGrid !== false };
    // 世界视角 (与家具场景同一套): 一格方块 = FURN_BLOCK_PX, 方块坐在地面网格的原点格上
    var unit = FURN_UNIT * sceneZoom;
    function scr(x, y, z) { var s = project(x, y, z); return { x: s.x * unit, y: s.y * unit }; }
    // 世界坐标 (未烘焙视图旋转) → 屏幕: 网格/线框等参照物用这个
    function wscr(x, y, z) { var s = projectViewP(x, y, z, sceneViewYaw, scenePitch); return { x: s.x * unit, y: s.y * unit }; }
    var growBoxW = function (min, max) {
      for (var i = 0; i < 8; i++) {
        var s = wscr((i & 1) ? max[0] : min[0], (i & 2) ? max[1] : min[1], (i & 4) ? max[2] : min[2]);
        grow(s.x, s.y);
      }
    };
    var bMinX = 0, bMinY = 0, bMaxX = 0, bMaxY = 0, hasBound = false;
    function grow(x, y) {
      if (!hasBound) { bMinX = bMaxX = x; bMinY = bMaxY = y; hasBound = true; return; }
      if (x < bMinX) bMinX = x; if (y < bMinY) bMinY = y;
      if (x > bMaxX) bMaxX = x; if (y > bMaxY) bMaxY = y;
    }
    // 方块占位 1x1x1 (即使模型是透明的, 也按整格给个参照框); 用 wscr 与
    // 面片烘焙变换同构 (blockRot 无平移 ⇒ wscr(点) ≡ scr(烘焙(点))), 包围盒
    // 在任意 yaw/pitch 下稳定, 不随视图旋转跳动
    for (var cx = 0; cx <= 1; cx++) {
      for (var cy = 0; cy <= 1; cy++) {
        for (var cz = 0; cz <= 1; cz++) {
          var sp = wscr(cx * 16, cy * 16, cz * 16);
          grow(sp.x, sp.y);
        }
      }
    }
    if (opt.grid) growBoxW([-16, 0, -16], [32, 0, 32]);
    for (var fi = 0; fi < faces.length; fi++) {
      var c = faces[fi].corners;
      for (var ci = 0; ci < c.length; ci++) {
        var q = scr(c[ci][0], c[ci][1], c[ci][2]);
        grow(q.x, q.y);
      }
    }
    // entity_renderer 那一层也要算进包围盒, 否则挂在高处的展示实体 (position.y 大)
    // 会被画到画布上边之外裁掉。text_display 还要按文字宽高额外留位。
    var entBox = blockEntityExtent(visual, wscr, unit);
    if (entBox) {
      if (entBox.textWidth) {
        // 文本按对齐方式向左右扩展
        grow(entBox.x - entBox.textWidth / 2, entBox.y - LINE_ASCENT);
        grow(entBox.x + entBox.textWidth / 2, entBox.y + (LINE_HEIGHT - LINE_ASCENT));
      } else {
        var eh = entBox.half;
        grow(entBox.x - eh, entBox.y - eh);
        grow(entBox.x + eh, entBox.y + eh);
      }
    }
    // 抬头文字先排版: 行高固定, 从顶部往下排, 画布高度要把它算进去
    var lines = [];
    lines.push(String(scene.entryKey || scene.blockId || 'block'));
    if (visual.emptyModel) lines.push('<red>' + t('preview.blockNoModel', '该方块没有配置 state/model (渲染为空)'));
    if (visual.blueprint) lines.push('<yellow>' + t('preview.blockBlueprint', 'blueprint 蓝图需由插件转换, 预览不可用') + ': ' + visual.blueprint);
    var car = blockCarrier(data);
    if (car) lines.push('<gray>' + t('preview.blockCarrier', '载体') + ': ' + car);
    if (visual.fromTextures) lines.push('<gray>' + t('preview.blockTextures', '贴图') + ' ×' + visual.fromTextures);
    if (visual.appearance) lines.push('<gray>' + t('preview.blockAppearance', '外观') + ': ' + visual.appearance);
    if (visual.transparent) lines.push('<gray>' + t('preview.blockTransparent', 'transparent: true (自身模型已清空)'));
    var headH = HEAD_H + Math.max(0, lines.length - 1) * LINE_HEIGHT;
    // 画布贴合方块本身 (方块只有几十像素, 用家具的最小画布会留一大片空白)
    var bw = Math.ceil(bMaxX - bMinX) + PAD * 2;
    var bh = Math.ceil(bMaxY - bMinY) + PAD + headH;
    var w = clamp(bw, Math.min(BLOCK_MIN_W, FURN_W), FURN_MAX_W);
    var h = clamp(bh, Math.min(BLOCK_MIN_H, FURN_H), FURN_MAX_H);
    var surf = makeSurface(w, h, scale);
    var ctx = surf.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, w, h);
    // 贴图
    var texCache = {};
    for (var i = 0; i < faces.length; i++) {
      var id = faces[i].texId;
      if (!(id in texCache)) texCache[id] = await loadTextureFrame('texture', id);
      var fr = texCache[id];
      if (fr) { faces[i].img = fr.img; faces[i].sx = fr.sx; faces[i].sy = fr.sy; faces[i].sw = fr.sw; faces[i].sh = fr.sh; }
      else faces[i].img = null;
    }
    // 居中: 方块区域 = 文字之下的那块空间
    var ox = (w - (bMaxX - bMinX)) / 2 - bMinX;
    var oy = headH + (h - headH - (bMaxY - bMinY)) / 2 - bMinY;
    // ---- 世界参照层 (与家具场景同一套): 3x3 地面网格 + 原点格线框 + 北向标记 ----
    if (opt.grid) {
      var gpt = function (x, y, z) { var s = wscr(x, y, z); return { x: ox + s.x, y: oy + s.y }; };
      for (var gx = -1; gx <= 1; gx++) {
        for (var gz = -1; gz <= 1; gz++) {
          var c0 = gpt(gx * 16, 0, gz * 16);
          var c1 = gpt((gx + 1) * 16, 0, gz * 16);
          var c2 = gpt((gx + 1) * 16, 0, (gz + 1) * 16);
          var c3 = gpt(gx * 16, 0, (gz + 1) * 16);
          ctx.beginPath();
          ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
          ctx.closePath();
          ctx.fillStyle = (gx === 0 && gz === 0) ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.035)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.17)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      var nptB = gpt(8, 0, -20);
      var pnB = parseText('<dark_gray>N', {});
      drawItems(ctx, pnB.items, nptB.x - pnB.width / 2, nptB.y, { shadow: false });
    }
    // 方块所坐的原点格轮廓 (0,0,0)..(16,16,16), 作为位置基准
    drawWireBox(ctx, ox, oy, [0, 0, 0], [16, 16, 16], 'rgba(255,255,255,0.38)', 1, {});
    // ---- 方块本体 (面片已烘焙视图旋转, 投影用原始等轴测) ----
    paintFaces(ctx, faces, unit, ox, oy, null);
    // entity_renderer: 方块本体之上再挂一层实体渲染 (display 实体 / 盔甲架 / 物品 / 文本)。
    // 它与方块模型是两层, transparent: true 只清方块模型, 实体层照样渲染。
    var entLines = await drawBlockEntityRenderer(ctx, visual, {
      unit: unit, ox: ox, oy: oy, scr: wscr, surf: surf,
      yaw: sceneViewYaw, pitch: scenePitch, scene: scene,
    });
    entLines.forEach(function (l) { lines.push(l); });
    // 空/透明方块: 画个虚线框提示「该方块没有自身模型」
    if (!faces.length) {
      var e0 = wscr(0, 0, 0), e1 = wscr(16, 16, 16);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(ox + Math.min(e0.x, e1.x), oy + Math.min(e0.y, e1.y),
        Math.abs(e1.x - e0.x), Math.abs(e1.y - e0.y));
      ctx.restore();
    }
    // 文字从上往下排 (基线 = LINE_ASCENT + 行序 * 行高)
    var ty = LINE_ASCENT + 4;
    lines.forEach(function (ln) {
      var p = parseText(ln, {});
      drawItems(ctx, p.items, 8, ty, { shadow: true });
      ty += LINE_HEIGHT;
    });
    blit(canvas, surf);
    return { width: canvas.width, height: canvas.height, warnings: _warnings.slice() };
  }
  // 方块模型的坐标变换: model 自身 x/y/z 旋转 → 视图 yaw (绕世界原点竖直轴,
  // 与网格/线框等参照物的 rotYmc 同轴) → 俯仰 (tiltMat, 与 projectPitched 同一
  // 矩阵)。烘焙后的坐标再用裸 project 投影 ⇒ 与 projectViewP 逐点重合:
  // 拖动旋转视图时, 方块与格子/线框保持相对静止, 不再「各转各的轴」。
  // 注意: 不做中心平移 —— project 线性, 锚点/参照物按同一原点变换即自然对齐。
  function blockRot(p, rot, yaw, pitch) {
    var q = p.slice();
    if (rot) {
      if (rot.x) q = rotateAbout(q, 'x', rot.x, [0, 0, 0]);
      if (rot.y) q = rotateAbout(q, 'y', rot.y, [0, 0, 0]);
      if (rot.z) q = rotateAbout(q, 'z', rot.z, [0, 0, 0]);
    }
    if (yaw) q = rotYmc(q, yaw);
    if (pitch != null && pitch !== 30) {
      var m = tiltMat(pitch);
      if (m) q = mat3Apply(m, q);
    }
    return q;
  }
  // 方向向量版: 旋转矩阵与点变换完全一致 (纯旋转, 法线同矩阵作用)
  function blockRotN(n, rot, yaw, pitch) {
    var q = n.slice();
    if (rot) {
      if (rot.x) q = rotateDir(q, 'x', rot.x);
      if (rot.y) q = rotateDir(q, 'y', rot.y);
      if (rot.z) q = rotateDir(q, 'z', rot.z);
    }
    if (yaw) q = rotateDir(q, 'y', -yaw);
    if (pitch != null && pitch !== 30) {
      var m2 = tiltMat(pitch);
      if (m2) q = mat3Apply(m2, q);
    }
    return q;
  }

  async function renderScene(canvas, scene) {
    _warnings = [];
    scene = scene || {};
    if (!canvas || !canvas.getContext) {
      return { width: 0, height: 0, warnings: ['no canvas'] };
    }
    try {
      if (scene.options) setOptions(scene.options);
      var type = scene.type || 'lore';
      if (type !== 'furniture' && type !== 'item-model' && type !== 'block') {
        sceneViewYaw = 0; sceneZoom = 1; scenePitch = 30; _furnPick = null;
      }
      if (type !== 'inventory') _invPick = null;
      if (type === 'chat') return await sceneChat(canvas, scene);
      if (type === 'gui') return await sceneGui(canvas, scene);
      if (type === 'item' || type === 'hotbar') return await sceneItem(canvas, scene);
      if (type === 'inventory') return await sceneInventory(canvas, scene);
      if (type === 'image' || type === 'gallery') return await sceneImageGallery(canvas, scene);
      if (type === 'furniture') return await sceneFurniture(canvas, scene);
      if (type === 'item-model') return await sceneItemModel(canvas, scene);
      if (type === 'block') return await sceneBlock(canvas, scene);
      return await sceneLore(canvas, scene);
    } catch (e) {
      warn('render-error: ' + (e && e.message));
      try {
        var s = makeSurface(200, 30, 1);
        s.ctx.fillStyle = '#300';
        s.ctx.fillRect(0, 0, 200, 30);
        var p = parseText('render error: ' + (e && e.message), {});
        s.ctx.fillStyle = '#fff';
        drawItems(s.ctx, p.items, 4, 18, {});
        blit(canvas, s);
      } catch (e2) { /* ignore */ }
      return { width: canvas.width || 0, height: canvas.height || 0, warnings: _warnings.slice() };
    }
  }

  // ---------------- 换行 / 测量 ----------------
  function wrapText(text, maxWidth, o) {
    var out = [];
    var paragraphs = String(text == null ? '' : text).split('\n');
    for (var pi = 0; pi < paragraphs.length; pi++) {
      var para = paragraphs[pi];
      if (!para) { out.push(''); continue; }
      var words = para.split(' ');
      var line = '';
      for (var w = 0; w < words.length; w++) {
        var cand = line ? line + ' ' + words[w] : words[w];
        if (measureText(cand, o).width <= maxWidth || !line) {
          // 单词本身超宽 ?按字符切
          if (!line && measureText(words[w], o).width > maxWidth) {
            var chunk = '';
            for (var ci = 0; ci < words[w].length; ci++) {
              var c2 = chunk + words[w][ci];
              if (measureText(c2, o).width > maxWidth && chunk) { out.push(chunk); chunk = ''; }
              chunk += words[w][ci];
            }
            line = chunk;
          } else {
            line = cand;
          }
        } else {
          out.push(line);
          line = words[w];
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }
  function measureText(text, o) {
    var p = parseText(text, o || {});
    return { width: p.width, height: p.height, lines: p.lines };
  }
  async function drawText(ctx, text, x, y, o) {
    await fontReady();
    var p = parseText(text, o || {});
    return drawItems(ctx, p.items, x, y, o || {});
  }

  // ---------------- 生命周期 ----------------
  function setOptions(patch) {
    if (!patch) return options;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] !== undefined) options[k] = patch[k];
    });
    return options;
  }
  function getOptions() { return Object.assign({}, options); }
  function onReady(cb) {
    if (typeof cb !== 'function') return;
    if (_readyFired) { try { cb(); } catch (e) {} return; }
    _readyListeners.push(cb);
  }
  async function init(opts) {
    setOptions(opts || {});
    _projectCacheKey = null;
    _fonts = null;
    _fontMaps = Object.create(null);
    _fontMapLoaded = Object.create(null);
    _fontMapPromises = Object.create(null);
    _fontPromise = null;
    _unihexMap = null;
    _unihexPromise = null;
    _sysGlyphCache.clear();
    if (typeof document === 'undefined') return;
    if (options.mcRoot == null) {
      var A = assets();
      options.mcRoot = A && A.mcRoot ? A.mcRoot() : null;
    }
    try { await fontReady(); } catch (e) { warn('init-font: ' + (e && e.message)); }
  }
  function fontReady() {
    if (_fonts) return Promise.resolve(_fonts);
    return loadFontData().then(function (g) {
      _fonts = g;
      if (!_readyFired) {
        _readyFired = true;
        for (var i = 0; i < _readyListeners.length; i++) {
          try { _readyListeners[i](); } catch (e) { /* ignore */ }
        }
        _readyListeners = [];
      }
      return g;
    });
  }
  // 保留调用方注入的数据: 工程扫描结果优先, 但扫描为空/缺项时不要抹掉 setImages/setGlobals 的内容
  function mergeProjectData(prev, next) {
    if (!next) return prev;
    if (!prev) return next;
    var out = { images: {}, globals: {}, emojis: {}, langs: {}, furniture: {}, items: {}, blocks: {} };
    ['images', 'globals', 'emojis', 'langs', 'furniture', 'items', 'blocks'].forEach(function (k) {
      var a = prev[k] || {}, b = next[k] || {};
      var merged = {};
      Object.keys(a).forEach(function (x) { merged[x] = a[x]; });
      Object.keys(b).forEach(function (x) { merged[x] = b[x]; });
      out[k] = merged;
    });
    return out;
  }
  async function setActiveFile(filePath) {
    _activeFile = filePath || null;
    var cd = configDirOf(_activeFile);
    if (cd === _projectCacheKey) return _projectData;
    _projectCacheKey = cd;
    if (!cd) return _projectData;
    try {
      var next = await collectProjectDataImpl();
      _projectData = mergeProjectData(_projectData, next);
      // 合并进来的旧条目可能还没解码图片, 补一次预加载
      await preloadImages().catch(function () {});
    } catch (e) {
      warn('project-data: ' + (e && e.message));
    }
    return _projectData;
  }
  async function collectProjectData(force) {
    if (!force && _projectData && Object.keys(_projectData.images).length) return _projectData;
    try {
      _projectData = await collectProjectDataImpl();
    } catch (e) { warn('project-data: ' + (e && e.message)); }
    return _projectData;
  }
  function setImages(map) {
    _projectData.images = map || {};
    registerImageGlyphs(_projectData.images);
    // 后台预加载；等待完成时调用 preloadImages()
    preloadImages().then(function (imgs) { registerImageGlyphs(imgs); }).catch(function () {});
  }
  async function preloadImages(map) {
    var imgs = map || _projectData.images || {};
    var ids = Object.keys(imgs);
    for (var i = 0; i < ids.length; i++) {
      await preloadImageEntry(ids[i], imgs[ids[i]], imgs);
    }
    registerImageGlyphs(imgs);
    return imgs;
  }
  function setGlobals(map) { _projectData.globals = map || {}; }
  function setLangs(map) { _projectData.langs = map || {}; }
  function getProjectData() { return _projectData; }

  // 诊断? 报告模型链解析结果与可见面数?
  async function inspectModel(modelId, defaultNs) {
    if (!modelId) return { ok: false, error: 'no model id' };
    var id = normalizeResourceId(modelId, defaultNs || activeNamespace() || 'minecraft');
    var path = resolveCandidates('model', id)[0] || null;
    if (!path) return { ok: false, error: 'model not found: ' + id, path: null };
    var model = await loadModelChain(id);
    if (!model) return { ok: false, error: 'model json unreadable', path: path };
    var faces = 0, visible = 0, textures = {}, rotated = 0, skippedNoTex = 0;
    var els = Array.isArray(model.elements) ? model.elements : [];
    els.forEach(function (el) {
      if (el && el.rotation && el.rotation.angle) rotated++;
      Object.keys((el && el.faces) || {}).forEach(function (f) {
        faces++;
        var fd = el.faces[f];
        if (!fd) { skippedNoTex++; return; }
        if (faceVisible(f)) visible++;
        var texId = resolveTextureRef(model, fd.texture);
        if (texId) textures[texId] = 1; else skippedNoTex++;
      });
    });
    return {
      ok: faces > 0,
      id: id, path: path, parent: model.parent,
      elements: els.length, faces: faces, visibleFaces: visible,
      rotatedElements: rotated, facesWithoutTexture: skippedNoTex,
      textures: Object.keys(textures),
    };
  }

  root.CEPreview = {
    version: VERSION,
    init: init,
    setOptions: setOptions,
    getOptions: getOptions,
    onReady: onReady,
    setActiveFile: setActiveFile,
    collectProjectData: collectProjectData,
    getProjectData: getProjectData,
    setImages: setImages,
    preloadImages: preloadImages,
    setGlobals: setGlobals,
    setLangs: setLangs,
    fontReady: fontReady,
    setStageWidth: setStageWidth,
    autoScaleFor: autoScaleFor,
    GUI_SCALE_MAX: GUI_SCALE_MAX,
    // 标签命名空间 (供面板/诊断/测试复用): MiniMessage 与 CraftEngine 分属两套
    tags: {
      decorations: DECOR_ALIASES,
      mmOpaque: MM_OPAQUE,
      mmPlaceholder: MM_PLACEHOLDER,
      mmTranslate: MM_TRANSLATE,
      ce: CE_TAGS,
      colors: NAMED_COLORS,
    },
    measureText: measureText,
    measure: measureText,
    wrapText: wrapText,
    drawText: drawText,
    parseText: parseText,
    // 字形诊断 (测试用): 查询码位字形来源 bitmap/space/合成/缺失
    // 必须走 glyphFor —— 与实际渲染完全同一条路径 (含 forceUnicode 分支)。
    glyphInfo: function (ch, fontId) {
      var cp = String(ch).codePointAt(0);
      var f = glyphsSync(fontId);
      var g = glyphFor(cp, fontId);
      if (!g) return { cp: cp, found: false };
      var src = (g === f[cp]) ? (g.type === 'space' ? 'space' : 'font') : 'system';
      return { cp: cp, found: true, source: src, w: g.w, h: g.h, advance: g.advance, ascent: g.ascent, offsetOnly: !!g.offsetOnly };
    },
    resolveItemModel: resolveItemModel,
    inspectModel: inspectModel,
    drawItem: drawItem,
    renderScene: renderScene,
    sceneChat: sceneChat,
    sceneLore: sceneLore,
    sceneItem: sceneItem,
    sceneGui: sceneGui,
    sceneInventory: sceneInventory,
    inventorySlots: function () { return inventorySlots(); },
    inventoryPickAt: function (px, py) { return inventoryPickAt(px, py); },
    inventoryPickData: function () { return _invPick; },
    sceneFurniture: sceneFurniture,
    sceneItemModel: sceneItemModel,
    // CraftEngine 方块预览: 模型解析 / 状态枚举 (面板与测试直接用)
    sceneBlock: sceneBlock,
    resolveBlockVisual: resolveBlockVisual,
    blockStateList: blockStateList,
    blockEffectiveSettings: blockEffectiveSettings,
    blockCarrier: blockCarrier,
    blockPropertyTypes: function () { return BLOCK_PROPERTY_TYPES; },
    _blockInternals: {
      blkAssignSlots: blkAssignSlots,
      blkInferFromTextures: blkInferFromTextures,
      blkTextureList: blkTextureList,
      blkVariantMatches: blkVariantMatches,
      blkBuildGeometry: blkBuildGeometry,
      builtinCubeElements: builtinCubeElements,
      BLOCK_SLOTS: BLOCK_SLOTS,
      BLOCK_SIX_SLOTS: BLOCK_SIX_SLOTS,
    },
    displayContextList: displayContextList,
    normalizeDisplayContext: normalizeDisplayContext,
    furnitureVariants: furnitureVariants,
    furnitureInlineOf: furnitureInlineOf,
    furnitureById: furnitureById,
    furnitureItemRef: furnitureItemRef,
    // block_item 行为 → 方块 (镜像家具三件套)
    blockInlineOf: blockInlineOf,
    blockItemRef: blockItemRef,
    furnitureHitboxBox: furnitureHitboxBox,
    furnitureHitboxBoxes: furnitureHitboxBoxes,
    furniturePickAt: function (px, py) { return furniturePickAt(px, py); },
    furniturePickData: function () { return _furnPick; },
    // 预览内编辑: 手柄列表 / 命中测试 / 视图与投影换算 (面板拖拽用)
    furnitureEditHandles: function () { return furnitureEditHandles(); },
    furnitureEditHitAt: function (px, py) { return furnitureEditHitAt(px, py); },
    furnitureViewInfo: function () { return furnitureViewInfo(); },
    furnitureUnproject: function (lx, ly, y) { return furnitureUnproject(lx, ly, y); },
    furnitureUnprojectY: function (lx, ly, x, z) { return furnitureUnprojectY(lx, ly, x, z); },
    furnitureProjectPoint: function (x, y, z) { return furnitureProjectPoint(x, y, z); },
    hasVariants: function (d) {
      var o = fobj(d);
      if (!o) return false;
      return !!(fobj(o.variants) || fobj(fobj(o.data) && fobj(o.data).variants));
    },
    // 运行时生成模型 (测试/诊断): 注册合成模型 + 查询
    registerRuntimeModel: registerRuntimeModel,
    runtimeModelOf: runtimeModelOf,
    sceneImageGallery: sceneImageGallery,
    listImages: function () { return Object.keys(_projectData.images || {}); },
    lastWarnings: function () { return _warnings.slice(); },
    _internals: {
      NAMED_COLORS: NAMED_COLORS,
      LINE_HEIGHT: LINE_HEIGHT,
      parseColor: parseColor,
      drawItems: drawItems,
      glyphFor: glyphFor,
      systemGlyph: systemGlyph,
      tintedGlyph: tintedGlyph,
      unihexStatus: unihexStatus,
      parseUnihex: parseUnihex,
      findUnihexSource: findUnihexSource,
      // 生存物品栏槽位坐标 (测试/诊断: 验证槽位内物品居中)
      inventorySlots: inventorySlots,
      // 动画贴图帧窗口 (供测试/诊断直接验证)
      loadImageAnyWithPath: loadImageAnyWithPath,
      spriteFrameOf: spriteFrameOf,
      loadTextureFrame: loadTextureFrame,
      // 家具几何 (供测试/诊断直接验证, 不参与渲染流程)
      mat3Apply: mat3Apply,
      furnitureRotationMatrix: furnitureRotationMatrix,
      furnitureElementXf: furnitureElementXf,
      furnitureSeat: furnitureSeat,
      furnWorld: furnWorld,
      FURN_ORIGIN: FURN_ORIGIN,
      // display 上下文 (模型场景) 与视图俯仰
      collectDisplayChain: collectDisplayChain,
      displayXf: displayXf,
      projectViewP: projectViewP,
      projectPitched: projectPitched,
      tiltMat: tiltMat,
      // 等轴测基投影与方块烘焙 (供测试验证 project(blockRot(p)) ≡ projectViewP(p))
      project: project,
      blockRot: blockRot,
      blockRotN: blockRotN,
      // 物品栏 GUI 场景: 正交投影与视图向量 (供测试直接验证)
      projectGui: projectGui,
      GUI_SLOT_VIEW: GUI_SLOT_VIEW,
      collectFacesFromModel: collectFacesFromModel,
      GUI_FALLBACK_TR: GUI_FALLBACK_TR,
      renderInvSlotItem: renderInvSlotItem,
      furnitureAffine: furnitureAffine,
      get scenePitch() { return scenePitch; },
      get sceneViewYaw() { return sceneViewYaw; },
    },
  };
})();
