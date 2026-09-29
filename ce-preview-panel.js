/* ChoTenEditor CraftEngine 预览面板
 * 依赖: window.CEPreview (渲染核心), window.CEMCAssets, window.WindowManager, window.I18N
 * 提供: 仿 Minecraft 场景预览 —— 聊天 / 物品 Lore / 原版 9x1~9x6 GUI / 字体图像总览
 * 入口: CEPreviewPanel.open(ctx)
 *   ctx = { file, section, sectionBase, entryKey, data, scene }
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.CEPreviewPanel) return;

  var win = null;          // WindowManager 句柄
  var ctx = null;          // 当前预览上下文
  var els = {};            // 面板内元素引用
  var state = {
    scene: 'auto',
    rows: 3,
    // 0 = 界面尺寸「自动」(与 MC 的 GUI Scale「自动」同义), 否则是整数倍率
    scale: 0,
    shadow: true,
    resolveGlobals: true,
    resolveImages: true,
    dark: true,
    useCustomText: false,
    customText: '',
    // 两个标签命名空间分开开关
    resolveMiniMessage: true,
    resolveCeTags: true,
    // 家具: 当前查看的变体下标
    variant: 0,
    // 家具视图: yaw 旋转 (度, 45°步进), 缩放, 显示开关
    furnYaw: 0,
    furnZoom: 1,
    furnHitboxes: true,
    furnSeats: true,
    furnGrid: true,
    furnFill: false,
    furnLabels: true,
    // 点击选中的碰撞箱下标 (-1 = 无)
    furnPick: -1,
    // 偏移 <shift:N>: 当前数值, 以及文本里「正在编辑的那个标签」的区间
    shiftValue: 0,
    shiftRange: null,
  };
  var _busy = false;
  var _pending = false;
  var _lastKey = null;
  var _furnDrag = null;        // 画布拖动旋转视角的进行中状态
  var _furnDragged = false;    // 本次指针操作是否发生了拖动 (用来抑制随后的 click 选箱)
  var _winSize = null;         // 记住用户调过的预览窗口大小 (拉大/最大化后重开也保持)
  var _projectData = { images: {}, globals: {}, emojis: {}, langs: {} };

  function t(key, fb, params) {
    var v = null;
    try {
      if (root.I18N && root.I18N.t) { v = root.I18N.t(key); if (v === key) v = null; }
    } catch (e) { v = null; }
    if (v == null) v = fb != null ? fb : key;
    if (params) {
      v = String(v).replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; });
    }
    return v;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function unwrap(v) { return (v !== null && typeof v === 'object' && typeof v.__ceTag === 'string') ? v.v : v; }

  // ---------------- 从 CE 条目数据中提取预览素材 ----------------
  function findKey(obj, key, depth) {
    if (!isObj(obj) || (depth || 0) > 4) return undefined;
    if (obj[key] !== undefined) return obj[key];
    var inner = obj.data;
    if (isObj(inner) && inner[key] !== undefined) return inner[key];
    // 再深一层 (lore > insert > ...)
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (isObj(v)) {
        var r = findKey(v, key, (depth || 0) + 1);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  }
  function findAny(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = findKey(obj, keys[i]);
      if (v !== undefined && v !== null && v !== '') return unwrap(v);
    }
    return undefined;
  }
  function toStringList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(function (x) { return String(unwrap(x)); });
    return [String(unwrap(v))];
  }
  // 收集条目内所有 MiniMessage 文本 (用于聊天场景)
  function collectTexts(obj, out, depth) {
    if ((depth || 0) > 4) return;
    if (typeof obj === 'string') { out.push(obj); return; }
    if (Array.isArray(obj)) { obj.forEach(function (x) { collectTexts(x, out, (depth || 0) + 1); }); return; }
    if (!isObj(obj)) return;
    Object.keys(obj).forEach(function (k) {
      if (/^(item_name|name|title|display_name|lore|description|content|message|subtitle|prompt|text|format|actionbar)$/i.test(k)) {
        collectTexts(obj[k], out, (depth || 0) + 1);
      } else if (isObj(obj[k]) && /^(data|settings|content_overrides)$/i.test(k)) {
        collectTexts(obj[k], out, (depth || 0) + 1);
      }
    });
  }

  function buildPayload(c) {
    var d = c.data || {};
    var name = findAny(d, ['item_name', 'name', 'title', 'display_name', 'custom_name']);
    var lore = toStringList(findAny(d, ['lore', 'description', 'lines']));
    var icon = resolveEntryIcon(d);
    var texts = [];
    collectTexts(d, texts);
    // 没有写显示名时, 用原版语言文件里的名字 (比裸 ID 直观)
    if (name === undefined && icon) {
      var A = root.CEMCAssets;
      if (A && A.langName) {
        try {
          var ln = A.langName(icon, (root.I18N && root.I18N.lang) || 'zh_cn');
          if (ln) name = '<white>' + ln;
        } catch (e) { /* ignore */ }
      }
    }
    if (name === undefined && c.entryKey) name = '<white>' + c.entryKey;
    if (!lore.length && texts.length) lore = texts.slice(0, 12);
    return {
      ctx: c,
      section: c.sectionBase || '',
      entryKey: c.entryKey || '',
      name: name !== undefined ? String(name) : null,
      lore: lore,
      icon: icon,
      texts: texts,
      data: d,
    };
  }

  // 从条目里挑出一个可直接渲染的图标引用 (字符串)。
  // 注意: model / item_model 这类字段常常是对象 ({path}/{model}), 直接丢给 drawItem 会画不出来。
  function _iconFromValue(v) {
    v = unwrap(v);
    if (typeof v === 'string' && v) return v;
    if (isObj(v)) {
      var keys = ['path', 'model', 'texture', 'file', 'id', 'item'];
      for (var i = 0; i < keys.length; i++) {
        var x = unwrap(v[keys[i]]);
        if (typeof x === 'string' && x) return x;
      }
    }
    return null;
  }
  function resolveEntryIcon(d) {
    // 1) 条目自身的直观字段
    var direct = ['texture', 'item_model', 'material', 'icon', 'asset_id', 'file', 'image',
      'item', 'side_texture', 'model_path'];
    for (var i = 0; i < direct.length; i++) {
      var v = _iconFromValue(findKey(d, direct[i]));
      if (v) return v;
    }
    // 2) 方块: state.model.* / state.appearances.<x>.model.*
    var st = unwrap(findKey(d, 'state'));
    if (isObj(st)) {
      var fromState = _iconFromValue(st.model);
      if (fromState) return fromState;
      var apps = unwrap(st.appearances);
      if (isObj(apps)) {
        var ak = Object.keys(apps);
        for (var a = 0; a < ak.length; a++) {
          var ap = unwrap(apps[ak[a]]);
          if (!isObj(ap)) continue;
          var fromAp = _iconFromValue(ap.model) || _iconFromValue(ap.texture);
          if (fromAp) return fromAp;
        }
      }
    }
    // 3) 物品: model / item_model 对象
    var m = _iconFromValue(findKey(d, 'model'));
    if (m) return m;
    // 4) 家具/装备: variants.<x>.elements[].item
    var variants = unwrap(findKey(d, 'variants'));
    if (isObj(variants)) {
      var vk = Object.keys(variants);
      for (var vi = 0; vi < vk.length; vi++) {
        var vv = unwrap(variants[vk[vi]]);
        if (isObj(vv) && Array.isArray(vv.elements)) {
          for (var e = 0; e < vv.elements.length; e++) {
            var el = unwrap(vv.elements[e]);
            if (isObj(el) && typeof unwrap(el.item) === 'string') return unwrap(el.item);
          }
        }
      }
    }
    // 5) 阵营/装备层的纹理
    var layers = unwrap(findKey(d, 'humanoid')) || unwrap(findKey(d, 'layer0'));
    var lv = _iconFromValue(layers);
    if (lv) return lv;
    return null;
  }

  // images 条目 → <image:ns:id> 引用
  function imageTagFor(c) {
    if (!c || (c.sectionBase !== 'images' && c.section !== 'images')) return null;
    var key = c.entryKey || '';
    return '<image:' + key + '>';
  }

  // GUI 场景: 从条目里挑出可用的物品 ID 填格子
  function buildGuiItems(p) {
    var ids = [];
    var push = function (v) {
      if (typeof v === 'string' && v.indexOf(':') !== -1 && ids.indexOf(v) === -1) ids.push(v);
      else if (v !== null && typeof v === 'object' && typeof v.__ceTag === 'string') { /* skip */ }
    };
    var listLike = ['items', 'list', 'members', 'all_items'];
    listLike.forEach(function (k) {
      var v = findKey(p.data, k);
      if (Array.isArray(v)) v.forEach(push);
    });
    var ing = findKey(p.data, 'ingredients');
    if (isObj(ing)) {
      Object.keys(ing).forEach(function (k) {
        var e = unwrap(ing[k]);
        if (isObj(e)) push(unwrap(e.item) || unwrap(e.items));
        else push(e);
      });
    }
    var res = findKey(p.data, 'result');
    if (isObj(res)) push(unwrap(res.id));
    if (p.icon && p.icon.indexOf(':') !== -1) push(p.icon);
    // 用物品 ID 填充格子, 不足的用记数占位
    var items = ids.map(function (id) { return { id: id, count: 1 }; });
    return items;
  }

  // ---------------- 内容类型 → 场景集 ----------------
  // 关键: 预览必须「按内容类型给出对应场景」——
  //   字体图像/表情 → 只关心字形在游戏里长什么样: 箱子 GUI 标题、聊天、物品 Lore、图像总览
  //   物品/方块/家具 → 只关心东西本身: 物品栏格子、悬浮提示、容器 GUI、聊天
  var GLYPH_SECTIONS = { images: 1, image: 1, emoji: 1, emojis: 1 };
  var FURNITURE_SECTIONS = { furniture: 1 };
  // 物品带 furniture_item 行为时也按家具预览
  function hasFurnitureBehavior(c) {
    if (!c || !root.CEPreview || !root.CEPreview.furnitureItemRef) return false;
    try { return !!root.CEPreview.furnitureItemRef(c.data || {}); } catch (e) { return false; }
  }
  function contentKind(c) {
    if (!c) return 'icon';
    var s = c.sectionBase || String(c.section || '').replace(/s$/, '');
    if (GLYPH_SECTIONS[c.sectionBase] || GLYPH_SECTIONS[c.section] || GLYPH_SECTIONS[s]) return 'glyph';
    if (FURNITURE_SECTIONS[c.sectionBase] || FURNITURE_SECTIONS[c.section] || FURNITURE_SECTIONS[s]) return 'furniture';
    if (hasFurnitureBehavior(c)) return 'furniture';
    return 'icon';
  }
  function sceneDefs(kind) {
    if (kind === 'glyph') {
      return [
        { id: 'gui', label: t('preview.sceneGlyphGui', '箱子 GUI') },
        { id: 'chat', label: t('preview.sceneChat', '聊天') },
        { id: 'lore', label: t('preview.sceneLore', '物品 Lore') },
        { id: 'image', label: t('preview.sceneImage', '图像总览') }
      ];
    }
    if (kind === 'furniture') {
      return [
        { id: 'furniture', label: t('preview.sceneFurniture', '家具') },
        { id: 'lore', label: t('preview.sceneLore', '物品提示') },
        { id: 'gui', label: t('preview.sceneGui', '容器 GUI') },
        { id: 'chat', label: t('preview.sceneChat', '聊天') }
      ];
    }
    return [
      { id: 'item', label: t('preview.sceneItem', '物品栏') },
      { id: 'lore', label: t('preview.sceneLore', '物品提示') },
      { id: 'gui', label: t('preview.sceneGui', '容器 GUI') },
      { id: 'chat', label: t('preview.sceneChat', '聊天') }
    ];
  }
  function defaultScene(kind) {
    if (kind === 'glyph') return 'gui';
    if (kind === 'furniture') return 'furniture';
    return 'item';
  }
  // 当前条目的家具定义: 家具段条目直接用; 物品则解出它 furniture_item 行为引用的家具
  // (引用 id → 去工程 furniture: 段找; 内联 → 直接用它自己)
  function resolvedFurniture() {
    var d = (ctx && ctx.data) || {};
    if (root.CEPreview && root.CEPreview.hasVariants && root.CEPreview.hasVariants(d)) return d;
    if (root.CEPreview && root.CEPreview.furnitureInlineOf) {
      try {
        var f = root.CEPreview.furnitureInlineOf(d);
        if (f) return f;
      } catch (e) { /* ignore */ }
    }
    return d;
  }
  // 当前条目的家具变体列表 (非家具返回 [])
  function furnitureVariantList() {
    if (!ctx || !root.CEPreview || !root.CEPreview.furnitureVariants) return [];
    try { return root.CEPreview.furnitureVariants(resolvedFurniture()) || []; } catch (e) { return []; }
  }
  // 该字体图像条目的 <image:ns:id> 引用
  function glyphTag() {
    var key = ctx && ctx.entryKey ? String(ctx.entryKey) : '';
    if (!key) return '';
    return '<image:' + key + '>';
  }

  // ---------------- 各场景的文本内容 ----------------
  // 聊天: 字体图像列出「字形在聊天里长什么样」; 物品列出名称/描述
  function chatLines(p, kind) {
    if (kind === 'glyph') {
      var g = glyphTag();
      var id = ctx && ctx.entryKey ? ctx.entryKey : '';
      var lines = [
        '<gray>[<green>Server<gray>] <yellow>' + t('preview.glyphChatIntro', '字体图像在聊天中的效果') + '</yellow>',
        '<white>' + g + ' <gray>' + esc(id) + '</gray>',
        '<white>' + g + '<white> ' + t('preview.glyphInline', '和文字排在一行') + '</white>',
        '<aqua>' + g + '<aqua>' + g + '<aqua>' + g + ' <gray>' + t('preview.glyphRepeat', '连续多次') + '</gray>',
        '<yellow>' + t('preview.glyphColored', '换颜色') + ' <red>' + g + '<green>' + g + '<blue>' + g
      ];
      // 项目里的全局变量如果引用了图像, 也一并展示
      if (p.name) lines.push('<white>' + String(p.name));
      return lines;
    }
    if (p.texts && p.texts.length) return p.texts.slice(0, 24);
    return [String(p.name || (ctx && ctx.entryKey) || '')];
  }
  // 容器标题: 字体图像直接做成标题里的图标 (CE 里就是这么拼自定义界面的)
  function guiTitle(p, kind) {
    if (kind === 'glyph') {
      var g = glyphTag();
      return g + ' <dark_gray>' + esc(ctx && ctx.entryKey ? ctx.entryKey : '') + '</dark_gray>';
    }
    return p.name || (ctx && ctx.entryKey) || '';
  }
  function countOf(p) {
    var v = findKey(p.data, 'count');
    var n = parseInt(unwrap(v), 10);
    if (!isNaN(n) && n > 1) return n;
    var res = findKey(p.data, 'result');
    if (isObj(res)) {
      var c = parseInt(unwrap(res.count), 10);
      if (!isNaN(c) && c > 1) return c;
    }
    return 1;
  }

  // ---------------- 面板 DOM ----------------
  function panelHtml() {
    return '' +
      '<div class="pv-wrap">' +
      '  <div class="pv-toolbar">' +
      '    <div class="pv-group" id="pv-scenes"></div>' +
      '    <div class="pv-group">' +
      '      <label class="pv-field" id="pv-rows-field"><span>' + esc(t('preview.rows', '行数')) + '</span>' +
      '        <select class="pv-select" id="pv-rows">' +
      '          <option value="1">9x1</option><option value="2">9x2</option><option value="3" selected>9x3</option>' +
      '          <option value="4">9x4</option><option value="5">9x5</option><option value="6">9x6 (54)</option>' +
      '        </select></label>' +
      '      <label class="pv-field"><span>' + esc(t('preview.guiScale', '界面尺寸')) + '</span>' +
      '        <select class="pv-select" id="pv-scale">' +
      '          <option value="0" selected>' + esc(t('preview.scaleAuto', '自动')) + '</option>' +
      '          <option value="1">1x</option><option value="2">2x</option>' +
      '          <option value="3">3x</option><option value="4">4x</option>' +
      '          <option value="6">6x</option>' +
      '        </select></label>' +
      '      <label class="pv-field" id="pv-variant-field" style="display:none;"><span>' + esc(t('preview.furnitureVariant', '变体')) + '</span>' +
      '        <select class="pv-select" id="pv-variant"></select></label>' +
      '    </div>' +
      '    <div class="pv-group" id="pv-furn-group" style="display:none;">' +
      '      <button type="button" class="pv-btn" data-furn-yaw="-45" title="' + esc(t('preview.furnYawLeft', '视角左转 45° (Q)')) + '">⟲</button>' +
      '      <span class="pv-field pv-furn-yawval" id="pv-furn-yawval" title="' + esc(t('preview.furnYawDrag', '在画布上左右拖动可直接旋转视角')) + '">0°</span>' +
      '      <button type="button" class="pv-btn" data-furn-yaw="45" title="' + esc(t('preview.furnYawRight', '视角右转 45° (E)')) + '">⟳</button>' +
      '      <button type="button" class="pv-btn pv-furn-reset" title="' + esc(t('preview.furnReset', '重置视角 (R)')) + '">' + esc(t('preview.furnReset', '重置')) + '</button>' +
      '      <button type="button" class="pv-btn" data-furn-zoom="-1" title="' + esc(t('preview.furnZoomOut', '缩小 (-)')) + '">−</button>' +
      '      <span class="pv-field pv-furn-zoomval" id="pv-furn-zoomval">100%</span>' +
      '      <button type="button" class="pv-btn" data-furn-zoom="1" title="' + esc(t('preview.furnZoomIn', '放大 (+)')) + '">+</button>' +
      '    </div>' +
      '    <div class="pv-group pv-checks" id="pv-furn-checks" style="display:none;">' +
      '      <label class="pv-check"><input type="checkbox" id="pv-furn-hb" checked> ' + esc(t('preview.furnitureHitboxes', '碰撞箱')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-furn-fill"> ' + esc(t('preview.furnFill', '填充')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-furn-labels" checked> ' + esc(t('preview.furnLabels', '标注')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-furn-seats" checked> ' + esc(t('preview.furnitureSeats', '座位')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-furn-grid" checked> ' + esc(t('preview.furnGrid', '网格')) + '</label>' +
      '    </div>' +
      '    <div class="pv-group pv-text">' +
      '      <label class="pv-check"><input type="checkbox" id="pv-usetext"' + (state.useCustomText ? ' checked' : '') + '> ' + esc(t('preview.customText', '自定义文字')) + '</label>' +
      '      <input type="text" class="pv-input" id="pv-text" spellcheck="false" value="' + esc(state.customText) + '" ' +
      '        placeholder="' + esc(t('preview.customTextHint', '支持 MiniMessage 与 <image:ns:id>, 如 <image:internal:item_browser>')) + '">' +
      '    </div>' +
      '    <div class="pv-group pv-shift">' +
      '      <span class="pv-field"><span>' + esc(t('preview.shift', '偏移')) + '</span></span>' +
      '      <button type="button" class="pv-btn pv-nudge" data-shift="-10" title="-10">−10</button>' +
      '      <button type="button" class="pv-btn pv-nudge" data-shift="-1" title="-1">−1</button>' +
      '      <input type="number" class="pv-input pv-shiftval" id="pv-shift" step="1" value="' + esc(String(state.shiftValue)) + '">' +
      '      <button type="button" class="pv-btn pv-nudge" data-shift="1" title="+1">+1</button>' +
      '      <button type="button" class="pv-btn pv-nudge" data-shift="10" title="+10">+10</button>' +
      '      <button type="button" class="pv-btn" id="pv-shift-insert" title="' +
        esc(t('preview.shiftInsertHint', '在光标处插入一个 <shift:N>')) + '">' +
        esc(t('preview.shiftInsert', '插入 <shift:N>')) + '</button>' +
      '    </div>' +
      '    <div class="pv-group pv-checks">' +
      '      <label class="pv-check"><input type="checkbox" id="pv-tags" checked> ' + esc(t('preview.resolveMiniMessage', '解析 MiniMessage 标签')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-cetags" checked> ' + esc(t('preview.resolveCeTags', '解析 CE 标签')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-globals" checked> ' + esc(t('preview.resolveGlobals', '解析全局变量')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-images" checked> ' + esc(t('preview.resolveImages', '渲染字体图像')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-shadow" checked> ' + esc(t('preview.shadow', '文字阴影')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-dark" checked> ' + esc(t('preview.darkBg', '深色底')) + '</label>' +
      '    </div>' +
      '    <div class="pv-group pv-right">' +
      '      <button type="button" class="pv-btn" id="pv-refresh" title="' + esc(t('common.reload', '重新加载')) + '">⟳</button>' +
      '      <button type="button" class="pv-btn" id="pv-copy">' + esc(t('preview.copyImage', '复制图片')) + '</button>' +
      '      <button type="button" class="pv-btn" id="pv-source">' + esc(t('preview.showSource', '查看文本')) + '</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pv-stage" id="pv-stage">' +
      '    <canvas id="pv-canvas"></canvas>' +
      '  </div>' +
      '  <div class="pv-status" id="pv-status"></div>' +
      '  <pre class="pv-source" id="pv-source-box" style="display:none;"></pre>' +
      '</div>';
  }

  // ---------------- 偏移 <shift:N> ----------------
  var SHIFT_RE = /<shift:-?\d+(?:\.\d+)?>/g;
  var SHIFT_ONE = /^<shift:-?\d+(?:\.\d+)?>$/;
  var SHIFT_MIN = -256, SHIFT_MAX = 256;   // CE 的 offset-characters 覆盖 -256..+256

  function shiftTag(v) { return '<shift:' + Math.round(v) + '>'; }
  function clampShift(v) {
    if (!isFinite(v)) return 0;
    return Math.max(SHIFT_MIN, Math.min(SHIFT_MAX, Math.round(v)));
  }
  function syncTextEl() {
    if (els.text && els.text.value !== state.customText) els.text.value = state.customText;
  }
  function syncShiftEl() {
    if (els.shift && els.shift.value !== String(state.shiftValue)) els.shift.value = String(state.shiftValue);
  }
  function ensureCustomTextOn() {
    if (!state.useCustomText) {
      state.useCustomText = true;
      if (els.useText) els.useText.checked = true;
    }
  }
  function rangeIsShift(t, r) {
    return !!(r && r.start >= 0 && r.end <= t.length && t.length && SHIFT_ONE.test(t.slice(r.start, r.end)));
  }
  // 光标落在哪个 <shift:N> 里 (含两端), 返回它的区间
  function shiftRangeAtCaret() {
    var t = state.customText;
    var pos = (els.text && typeof els.text.selectionStart === 'number') ? els.text.selectionStart : t.length;
    SHIFT_RE.lastIndex = 0;
    var m;
    while ((m = SHIFT_RE.exec(t))) {
      if (pos >= m.index && pos <= m.index + m[0].length) return { start: m.index, end: m.index + m[0].length };
    }
    return null;
  }
  function writeShiftTag(tag, range) {
    var t = state.customText;
    if (range) {
      state.customText = t.slice(0, range.start) + tag + t.slice(range.end);
      state.shiftRange = { start: range.start, end: range.start + tag.length };
    } else {
      var pos = (els.text && typeof els.text.selectionStart === 'number') ? els.text.selectionStart : t.length;
      var end = (els.text && typeof els.text.selectionEnd === 'number') ? els.text.selectionEnd : pos;
      state.customText = t.slice(0, pos) + tag + t.slice(end);
      state.shiftRange = { start: pos, end: pos + tag.length };
    }
    syncTextEl();
    // 光标停在标签之后, 这样连续点 ±1/±10 会一直改同一个标签
    if (els.text && els.text.setSelectionRange) {
      els.text.setSelectionRange(state.shiftRange.end, state.shiftRange.end);
    }
    ensureCustomTextOn();
  }
  // delta 为 0 表示「用输入框里的数值」; 否则先累加再应用
  function applyShift(delta) {
    if (delta) state.shiftValue = clampShift(state.shiftValue + delta);
    else state.shiftValue = clampShift(parseFloat(state.shiftValue));
    syncShiftEl();
    // 优先改光标处的标签, 其次是上一次插入的那个; 都没有就新插一个
    var t = state.customText;
    var range = shiftRangeAtCaret();
    if (!rangeIsShift(t, range)) range = rangeIsShift(t, state.shiftRange) ? state.shiftRange : null;
    writeShiftTag(shiftTag(state.shiftValue), range);
    render();
  }
  function insertShiftAtCaret() {
    state.shiftValue = clampShift(parseFloat(state.shiftValue));
    syncShiftEl();
    state.shiftRange = null;
    writeShiftTag(shiftTag(state.shiftValue), null);
    render();
  }

  function bind() {
    var body = win.body;
    els.stage = body.querySelector('#pv-stage');
    els.canvas = body.querySelector('#pv-canvas');
    els.status = body.querySelector('#pv-status');
    els.sourceBox = body.querySelector('#pv-source-box');
    els.useText = body.querySelector('#pv-usetext');
    els.text = body.querySelector('#pv-text');
    els.shift = body.querySelector('#pv-shift');

    // 偏移: -10 / -1 / +1 / +10
    var nudges = body.querySelectorAll('.pv-nudge');
    for (var ni = 0; ni < nudges.length; ni++) {
      (function (btn) {
        btn.addEventListener('click', function () { applyShift(parseInt(btn.getAttribute('data-shift'), 10) || 0); });
      })(nudges[ni]);
    }
    if (els.shift) {
      els.shift.addEventListener('change', function () {
        state.shiftValue = clampShift(parseInt(this.value, 10));
        applyShift(0);
      });
    }
    var shiftIns = body.querySelector('#pv-shift-insert');
    if (shiftIns) shiftIns.addEventListener('click', insertShiftAtCaret);

    var scenes = body.querySelector('#pv-scenes');
    if (scenes) {
      scenes.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-pv-scene]') : null;
        if (!b) return;
        state.scene = b.getAttribute('data-pv-scene');
        state.furnPick = -1;
        syncSceneButtons();
        render();
      });
    }
    body.querySelector('#pv-rows').addEventListener('change', function () { state.rows = parseInt(this.value, 10) || 3; render(); });
    body.querySelector('#pv-scale').addEventListener('change', function () { state.scale = parseInt(this.value, 10) || 0; render(); });
    var varEl = body.querySelector('#pv-variant');
    if (varEl) varEl.addEventListener('change', function () {
      state.variant = parseInt(this.value, 10) || 0;
      state.furnPick = -1;
      render();
    });

    // ---- 家具视图控制: 旋转 / 缩放 / 显示开关 ----
    var yawBtns = body.querySelectorAll('[data-furn-yaw]');
    for (var yi = 0; yi < yawBtns.length; yi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          state.furnYaw = ((state.furnYaw || 0) + (parseInt(btn.getAttribute('data-furn-yaw'), 10) || 0) % 360 + 360) % 360;
          render();
        });
      })(yawBtns[yi]);
    }
    var zoomBtns = body.querySelectorAll('[data-furn-zoom]');
    for (var zi = 0; zi < zoomBtns.length; zi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          stepFurnZoom((parseInt(btn.getAttribute('data-furn-zoom'), 10) || 0) > 0 ? 1 : -1);
        });
      })(zoomBtns[zi]);
    }
    var resetBtn = body.querySelector('.pv-furn-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      state.furnYaw = 0;
      state.furnZoom = 1;
      state.furnPick = -1;
      render();
    });
    [['pv-furn-hb', 'furnHitboxes'], ['pv-furn-fill', 'furnFill'], ['pv-furn-labels', 'furnLabels'],
     ['pv-furn-seats', 'furnSeats'], ['pv-furn-grid', 'furnGrid']].forEach(function (pair) {
      var el = body.querySelector('#' + pair[0]);
      if (el) el.addEventListener('change', function () { state[pair[1]] = this.checked; render(); });
    });
    // 点击画布: 命中碰撞箱 → 高亮并在状态栏显示它的类型/尺寸/座位
    if (els.canvas) {
      els.canvas.addEventListener('click', function (e) {
        if (resolvedScene() !== 'furniture' || state.furnHitboxes === false) return;
        if (!root.CEPreview || !root.CEPreview.furniturePickAt) return;
        // 刚拖过视角就不要再当成点击选箱子
        if (_furnDragged) { _furnDragged = false; return; }
        var lx = e.offsetX, ly = e.offsetY;
        var gs = parseFloat(this.getAttribute('data-gui-scale')) || 1;
        if (gs > 0) { lx /= gs; ly /= gs; }
        var hit = null;
        try { hit = root.CEPreview.furniturePickAt(lx, ly); } catch (err) { hit = null; }
        var idx = hit ? hit.index : -1;
        if (idx === state.furnPick) return;
        state.furnPick = idx;
        render();
      });
      // Ctrl+滚轮 = 缩放 (普通滚轮留给预览区滚动)
      els.canvas.addEventListener('wheel', function (e) {
        if (resolvedScene() !== 'furniture' || !e.ctrlKey) return;
        e.preventDefault();
        stepFurnZoom(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });
      // 左右拖动 = 自由旋转视角 (按住 Shift 吸附到 15°)
      els.canvas.addEventListener('pointerdown', function (e) {
        if (resolvedScene() !== 'furniture' || e.button !== 0) return;
        _furnDrag = { id: e.pointerId, x: e.clientX, yaw: state.furnYaw || 0, moved: 0 };
        _furnDragged = false;
        try { this.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.style.cursor = 'grabbing';
        e.preventDefault();
      });
      els.canvas.addEventListener('pointermove', function (e) {
        if (!_furnDrag || _furnDrag.id !== e.pointerId) return;
        var dx = e.clientX - _furnDrag.x;
        if (Math.abs(dx) > 3) { _furnDrag.moved = 1; _furnDragged = true; }
        var yaw = _furnDrag.yaw + dx * (e.shiftKey ? 0.4 : 0.8);
        if (e.shiftKey) yaw = Math.round(yaw / 15) * 15;
        state.furnYaw = ((yaw % 360) + 360) % 360;
        render();
      });
      var endDrag = function (e) {
        if (!_furnDrag || _furnDrag.id !== e.pointerId) return;
        var wasMove = _furnDrag.moved;
        _furnDrag = null;
        try { els.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (els.canvas.style) els.canvas.style.cursor = '';
        // 拖动结束后吸附到最近的 45°? 不吸附 —— 自由角度就是本功能的意义, 需要正交视角时按 Q/E
        if (wasMove) render();
      };
      els.canvas.addEventListener('pointerup', endDrag);
      els.canvas.addEventListener('pointercancel', endDrag);
    }
    var useTextEl = els.useText;
    var textEl = els.text;
    if (useTextEl) useTextEl.addEventListener('change', function () { state.useCustomText = this.checked; render(); });
    if (textEl) {
      textEl.addEventListener('input', function () { state.customText = this.value; });
      textEl.addEventListener('change', function () { state.customText = this.value; render(); });
      textEl.addEventListener('keydown', function (e) {
        // Alt+←/→ = ∓1, Alt+Shift+←/→ = ∓10 (和输入框里的偏移联动)
        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          var step = e.shiftKey ? 10 : 1;
          applyShift(e.key === 'ArrowLeft' ? -step : step);
          return;
        }
        if (e.key === 'Enter') { state.customText = this.value; render(); }
      });
    }
    ['tags:resolveMiniMessage', 'cetags:resolveCeTags', 'globals:resolveGlobals', 'images:resolveImages', 'shadow:shadow', 'dark:dark'].forEach(function (pair) {
      var parts = pair.split(':');
      var el = body.querySelector('#pv-' + parts[0]);
      if (el) el.addEventListener('change', function () { state[parts[1]] = this.checked; render(); });
    });
    body.querySelector('#pv-refresh').addEventListener('click', function () { hardRefresh(); });
    body.querySelector('#pv-copy').addEventListener('click', copyImage);
    body.querySelector('#pv-source').addEventListener('click', function () {
      var box = els.sourceBox;
      box.style.display = box.style.display === 'none' ? '' : 'none';
      if (box.style.display !== 'none') box.textContent = buildSourceText();
    });
    buildSceneTabs();
  }

  // 按内容类型重建场景标签 (物品 → 物品栏/提示/GUI/聊天; 字体图像 → 箱子 GUI/聊天/Lore/总览)
  function buildSceneTabs() {
    if (!win || !win.body) return;
    var kind = contentKind(ctx);
    var defs = sceneDefs(kind);
    var host = win.body.querySelector('#pv-scenes');
    if (!host) return;
    host.innerHTML = defs.map(function (d) {
      return '<button type="button" class="pv-btn pv-scene-btn" data-pv-scene="' + esc(d.id) + '">' + esc(d.label) + '</button>';
    }).join('');
    // 切到新内容类型时, 若当前场景不在可选集合里则回到该类型的默认场景
    var ids = defs.map(function (d) { return d.id; });
    if (ids.indexOf(state.scene) === -1) state.scene = defaultScene(kind);
    syncSceneButtons();
  }

  function syncSceneButtons() {
    if (!win || !win.body) return;
    var btns = win.body.querySelectorAll('[data-pv-scene]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-pv-scene') === state.scene);
    }
    var rowsEl = win.body.querySelector('#pv-rows');
    var rowsField = win.body.querySelector('#pv-rows-field');
    var guiLike = (state.scene === 'gui');
    if (rowsEl) rowsEl.disabled = !guiLike;
    if (rowsField) rowsField.style.opacity = guiLike ? '' : '0.45';
    // 家具场景: 显示变体下拉 + 视图控制组
    var isFurn = (state.scene === 'furniture');
    var furnGroup = win.body.querySelector('#pv-furn-group');
    var furnChecks = win.body.querySelector('#pv-furn-checks');
    if (furnGroup) furnGroup.style.display = isFurn ? '' : 'none';
    if (furnChecks) furnChecks.style.display = isFurn ? '' : 'none';
    var zoomVal = win.body.querySelector('#pv-furn-zoomval');
    if (zoomVal) zoomVal.textContent = Math.round((state.furnZoom || 1) * 100) + '%';
    var yawVal = win.body.querySelector('#pv-furn-yawval');
    if (yawVal) yawVal.textContent = Math.round(state.furnYaw || 0) + '°';
    if (els.stage) els.stage.style.cursor = isFurn ? 'crosshair' : '';
    if (els.canvas && !_furnDrag) els.canvas.style.cursor = isFurn ? 'grab' : '';
    // 开关状态回填 (state 可能被程序改动)
    [['pv-furn-hb', 'furnHitboxes'], ['pv-furn-fill', 'furnFill'], ['pv-furn-labels', 'furnLabels'],
     ['pv-furn-seats', 'furnSeats'], ['pv-furn-grid', 'furnGrid']].forEach(function (pair) {
      var el = win.body.querySelector('#' + pair[0]);
      if (el) el.checked = state[pair[1]] !== false;
    });
    var varEl = win.body.querySelector('#pv-variant');
    var varField = win.body.querySelector('#pv-variant-field');
    if (varEl && varField) {
      var list = isFurn ? furnitureVariantList() : [];
      if (list.length > 1) {
        var sig = list.map(function (x) { return x.name; }).join('\u0001');
        if (varEl.getAttribute('data-sig') !== sig) {
          varEl.setAttribute('data-sig', sig);
          varEl.innerHTML = list.map(function (x, i) {
            return '<option value="' + i + '">' + esc(x.name) + '</option>';
          }).join('');
        }
        if (state.variant >= list.length) state.variant = 0;
        varEl.value = String(state.variant);
        varField.style.display = '';
      } else {
        varField.style.display = 'none';
      }
    }
  }

  // 家具视图缩放步进: 50% → 75% → 100% → 150% → 200% → 300%
  var FURN_ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
  function stepFurnZoom(dir) {
    var cur = state.furnZoom || 1;
    var idx = 0, best = Infinity;
    for (var i = 0; i < FURN_ZOOMS.length; i++) {
      var d = Math.abs(FURN_ZOOMS[i] - cur);
      if (d < best) { best = d; idx = i; }
    }
    idx = Math.max(0, Math.min(FURN_ZOOMS.length - 1, idx + (dir > 0 ? 1 : -1)));
    state.furnZoom = FURN_ZOOMS[idx];
    render();
  }

  // 家具场景快捷键 (焦点不在输入框时): Q/E 旋转, R 重置, +/- 缩放
  function onFurnKey(e) {
    if (!win || win._closed || resolvedScene() !== 'furniture') return;
    var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    var k = e.key;
    if (k === 'q' || k === 'Q') { state.furnYaw = ((state.furnYaw || 0) - 45 + 360) % 360; render(); e.preventDefault(); }
    else if (k === 'e' || k === 'E') { state.furnYaw = ((state.furnYaw || 0) + 45) % 360; render(); e.preventDefault(); }
    else if (k === 'r' || k === 'R') { state.furnYaw = 0; state.furnZoom = 1; state.furnPick = -1; render(); e.preventDefault(); }
    else if (k === '+' || k === '=') { stepFurnZoom(1); e.preventDefault(); }
    else if (k === '-' || k === '_') { stepFurnZoom(-1); e.preventDefault(); }
  }

  function resolvedScene() { return state.scene || defaultScene(contentKind(ctx)); }

  function makeOpts() {
    return {
      shadow: state.shadow,
      resolveTags: true,
      // 两个命名空间分开控制: MiniMessage(Adventure) 与 CraftEngine
      resolveMiniMessage: state.resolveMiniMessage !== false,
      resolveCeTags: state.resolveCeTags !== false,
      resolveGlobals: state.resolveGlobals,
      resolveImages: state.resolveImages,
      lang: (root.I18N && root.I18N.lang) || 'zh_cn',
    };
  }

  function setStatus(msg, kind, legend) {
    if (!els.status) return;
    els.status.textContent = '';
    els.status.className = 'pv-status' + (kind ? ' pv-status-' + kind : '');
    if (legend && legend.length) {
      legend.forEach(function (d) {
        var dot = document.createElement('span');
        dot.className = 'pv-dot';
        dot.style.background = d.color || '#888888';
        els.status.appendChild(dot);
        var lab = document.createElement('span');
        lab.textContent = d.label;
        els.status.appendChild(lab);
      });
      var sep = document.createElement('span');
      sep.className = 'pv-sep';
      sep.textContent = '·';
      els.status.appendChild(sep);
    }
    els.status.appendChild(document.createTextNode(msg || ''));
  }
  // 碰撞箱类型的中文名 (画布里的标注只能 ASCII, 这里可以随便写)
  function hbTypeLabel(type) {
    switch (String(type || '').toLowerCase()) {
      case 'shulker': return t('preview.hbTypeShulker', '潜影贝');
      case 'happy_ghast': return t('preview.hbTypeHappyGhast', '快乐恶魂');
      case 'custom': return t('preview.hbTypeCustom', '自定义');
      default: return t('preview.hbTypeInteraction', '交互');
    }
  }

  // ---------------- 渲染 ----------------
  async function render() {
    if (!root.CEPreview || !ctx) return;
    // 渲染期间又来了新请求 (快速切场景/改选项) 时不能直接丢掉 —— 否则界面停在旧画面上,
    // 只有标签变了。这里记一个待办, 当前这次结束后再补一次渲染。
    if (_busy) { _pending = true; return; }
    _busy = true;
    var scene = resolvedScene();
    var p = buildPayload(ctx);
    var warnings = [];
    try {
      root.CEPreview.setOptions(makeOpts());
      if (ctx.file) { try { await root.CEPreview.setActiveFile(ctx.file); } catch (e) {} }
      try { _projectData = (await root.CEPreview.collectProjectData()) || _projectData; } catch (e) {}
      await root.CEPreview.fontReady();

      var payload;
      var kind = contentKind(ctx);
      // 自定义文字: 勾选且非空时, 用它替换各场景的主文本 (chat=多行, gui=标题, lore/item=名称+描述)
      var useCustom = state.useCustomText && String(state.customText || '').trim().length > 0;
      var cLines = useCustom ? String(state.customText).split(/\r?\n/) : null;
      if (scene === 'chat') {
        payload = { type: 'chat', lines: useCustom ? cLines : chatLines(p, kind), scale: state.scale, options: makeOpts(), chatWidth: 320 };
      } else if (scene === 'gui') {
        payload = {
          type: 'gui', rows: state.rows, scale: state.scale, options: makeOpts(),
          title: useCustom ? state.customText : guiTitle(p, kind), items: buildGuiItems(p), fillPlayerInventory: true,
        };
      } else if (scene === 'image') {
        payload = {
          type: 'image', scale: state.scale, options: makeOpts(),
          imageId: (useCustom ? cLines[0] : '').replace(/^.*<image:([^>]+)>.*$/, '$1') || ctx.entryKey || null,
        };
      } else if (scene === 'furniture') {
        payload = {
          type: 'furniture', scale: state.scale, options: makeOpts(),
          furniture: resolvedFurniture(), variant: state.variant || 0,
          yaw: state.furnYaw || 0, zoom: state.furnZoom || 1,
          showHitboxes: state.furnHitboxes !== false,
          showSeats: state.furnSeats !== false,
          showGrid: state.furnGrid !== false,
          hbFill: state.furnFill !== false,
          hbLabels: state.furnLabels !== false,
          hlHitbox: state.furnPick,
        };
      } else if (scene === 'item') {
        payload = {
          type: 'item', scale: state.scale, options: makeOpts(),
          name: useCustom ? cLines[0] : (p.name || ('<white>' + esc(ctx.entryKey || ''))),
          lore: useCustom ? cLines.slice(1) : p.lore, item: p.icon || undefined,
          count: countOf(p), rarity: rarityOf(ctx),
        };
      } else {
        payload = {
          type: 'lore', scale: state.scale, options: makeOpts(),
          name: useCustom ? cLines[0] : (p.name || ('<white>' + esc(ctx.entryKey || ''))),
          lore: useCustom ? cLines.slice(1) : p.lore, showItem: true, item: p.icon || undefined,
          rarity: rarityOf(ctx),
        };
      }
      try { root.CEPreview.setStageWidth(els.stage ? els.stage.clientWidth : 0); } catch (e) {}
      var res = await root.CEPreview.renderScene(els.canvas, payload);
      warnings = (res && res.warnings) || [];
      var w = root.CEMCAssets ? root.CEMCAssets.status() : null;
      var parts = [];
      parts.push(t('preview.sceneLabel', '场景') + ': ' + sceneName(scene));
      if (els.canvas) parts.push(els.canvas.width + '×' + els.canvas.height);
      // 实际生效的界面尺寸 (自动时会随预览区宽度变化)
      var effScale = els.canvas && els.canvas.getAttribute ? parseInt(els.canvas.getAttribute('data-gui-scale'), 10) : NaN;
      if (isFinite(effScale) && effScale > 0) {
        parts.push(t('preview.guiScale', '界面尺寸') + ': ' + (state.scale > 0 ? effScale + 'x' : effScale + 'x (' + t('preview.scaleAuto', '自动') + ')'));
      }
      // 家具: 在状态栏(中文能正常显示)里给出变体与统计 —— 画布里的文字只能用 ASCII
      var legend = null;
      if (scene === 'furniture') {
        var vlist = furnitureVariantList();
        var cur = vlist[state.variant || 0];
        // 一条配置可能对应多个箱体 (潜影贝打开后的壳也是箱体), 状态栏按实际箱体数统计,
        // 和画布上看到的箱子数量一致
        var drawnBoxes = 0;
        if (cur) {
          (cur.hitboxes || []).forEach(function (h) {
            var n = 1;
            if (h && root.CEPreview && root.CEPreview.furnitureHitboxBoxes) {
              try { n = root.CEPreview.furnitureHitboxBoxes(h).length || 1; } catch (e) { n = 1; }
            }
            drawnBoxes += n;
          });
        }
        if (cur) {
          parts.push(t('preview.furnitureVariant', '变体') + ': ' + cur.name +
            (vlist.length > 1 ? ' (' + ((state.variant || 0) + 1) + '/' + vlist.length + ')' : ''));
          parts.push(t('preview.furnitureElements', '元素') + ' ' + cur.elements.length);
          parts.push(t('preview.furnitureHitboxes', '碰撞箱') + ' ' + drawnBoxes +
            (drawnBoxes !== (cur.hitboxes || []).length
              ? ' (' + t('preview.furnitureBoxConfig', '配置 {n}', { n: (cur.hitboxes || []).length }) + ')'
              : ''));
          var seats = 0;
          (cur.hitboxes || []).forEach(function (h) {
            var s = h && h.seats;
            seats += Array.isArray(s) ? s.length : (s ? 1 : 0);
          });
          parts.push(t('preview.furnitureSeats', '座位') + ' ' + seats);
        }
        if (state.furnYaw) parts.push(t('preview.furnYaw', '视角') + ' ' + state.furnYaw + '°');
        if ((state.furnZoom || 1) !== 1) parts.push(t('preview.furnZoom', '缩放') + ' ' + Math.round((state.furnZoom || 1) * 100) + '%');
        // 碰撞箱图例 + 选中详情 (数据来自刚渲染的拾取表)
        var pickData = null;
        try { pickData = root.CEPreview.furniturePickData ? root.CEPreview.furniturePickData() : null; } catch (e) { pickData = null; }
        if (pickData && pickData.boxes && pickData.boxes.length) {
          var counts = {}, colors = {};
          pickData.boxes.forEach(function (b) {
            counts[b.type] = (counts[b.type] || 0) + 1;
            if (!colors[b.type]) colors[b.type] = b.color;
          });
          legend = Object.keys(counts).map(function (tp) {
            return { color: colors[tp], label: hbTypeLabel(tp) + ' ×' + counts[tp] };
          });
          if (state.furnPick >= 0) {
            var sel = null;
            for (var sb = 0; sb < pickData.boxes.length; sb++) {
              if (pickData.boxes[sb].index === state.furnPick) { sel = pickData.boxes[sb]; break; }
            }
            if (sel) {
              parts.push(t('preview.furnSelected', '已选碰撞箱') + ' #' + sel.index + ': ' + hbTypeLabel(sel.type) +
                ' ' + sel.w + '×' + sel.h + '×' + sel.d +
                (sel.seats ? ' · ' + t('preview.furnitureSeats', '座位') + ' ' + sel.seats : ''));
            }
          }
        }
      }
      if (w && w.state === 'ready') parts.push(t('preview.assetsOk', '资源已索引 ({n} 项)', { n: Object.keys(w.counts || {}).reduce(function (a, k) { return a + w.counts[k]; }, 0) }));
      else if (w && w.state === 'loading') parts.push(t('preview.assetsLoading', '资源索引中…'));
      else parts.push(t('preview.assetsMissing', '未配置 Minecraft 资源目录，使用内置回退字形'));
      if (warnings.length) parts.push('⚠ ' + warnings.length);
      setStatus(parts.join('  ·  '), warnings.length ? 'warn' : '', legend);
      // 视图缩放/角度读数回写 (按钮/滚轮/快捷键/拖动都会改 state)
      var zv = win.body.querySelector('#pv-furn-zoomval');
      if (zv) zv.textContent = Math.round((state.furnZoom || 1) * 100) + '%';
      var yv = win.body.querySelector('#pv-furn-yawval');
      if (yv) yv.textContent = Math.round(state.furnYaw || 0) + '°';
      if (warnings.length) console.warn('[CEPreviewPanel] warnings:', warnings);
    } catch (e) {
      console.error('[CEPreviewPanel] render failed:', e);
      setStatus(t('preview.renderFailed', '渲染失败: {msg}', { msg: e && e.message || e }), 'error');
    } finally {
      _busy = false;
      if (_pending) { _pending = false; render(); }
    }
  }

  function sceneName(s) {
    var map = {
      item: t('preview.sceneItem', '物品栏'),
      chat: t('preview.sceneChat', '聊天'),
      lore: t('preview.sceneLore', '物品 Lore'),
      gui: t('preview.sceneGui', kindSceneLabel(s)),
      image: t('preview.sceneImage', '图像总览'),
      furniture: t('preview.sceneFurniture', '家具')
    };
    return map[s] || s;
  }
  function kindSceneLabel(s) {
    if (s === 'gui') return contentKind(ctx) === 'glyph'
      ? t('preview.sceneGlyphGui', '箱子 GUI') : t('preview.sceneGui', '容器 GUI');
    return s;
  }
  function rarityOf(c) {
    var d = c.data || {};
    var r = findKey(d, 'rarity');
    return ['common', 'uncommon', 'rare', 'epic'].indexOf(r) === -1 ? 'common' : r;
  }

  function buildSourceText() {
    var p = buildPayload(ctx);
    var lines = [];
    lines.push('# ' + t('preview.sourceHint', '以下为预览使用的原始文本（未经解析）'));
    lines.push('name: ' + (p.name || ''));
    (p.lore || []).forEach(function (l, i) { lines.push('lore[' + i + ']: ' + l); });
    if (state.resolveGlobals) {
      var g = _projectData.globals || {};
      var keys = Object.keys(g);
      if (keys.length) {
        lines.push('');
        lines.push('# ' + t('preview.globalsHint', '工程全局变量') + ' (' + keys.length + ')');
        keys.slice(0, 60).forEach(function (k) { lines.push('<global:' + k + '> = ' + g[k]); });
      }
    }
    return lines.join('\n');
  }

  function copyImage() {
    if (!els.canvas) return;
    try {
      els.canvas.toBlob(function (blob) {
        if (!blob) return;
        if (root.navigator && root.navigator.clipboard && root.ClipboardItem) {
          root.navigator.clipboard.write([new root.ClipboardItem({ 'image/png': blob })])
            .then(function () { setStatus(t('preview.copied', '已复制到剪贴板')); })
            .catch(function () { download(blob); });
        } else {
          download(blob);
        }
      }, 'image/png');
    } catch (e) {
      setStatus(t('preview.copyFailed', '复制失败: {msg}', { msg: e && e.message }), 'error');
    }
  }
  function download(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ce-preview-' + (ctx && ctx.entryKey ? ctx.entryKey.replace(/[^\w.-]/g, '_') : 'scene') + '.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  async function hardRefresh() {
    setStatus(t('preview.reloading', '正在重新扫描资源…'));
    try {
      if (root.CEMCAssets && root.CEMCAssets.rescan) await root.CEMCAssets.rescan({ filePath: ctx && ctx.file });
    } catch (e) { /* ignore */ }
    try { if (root.CEPreview && root.CEPreview.init) await root.CEPreview.init({ mcRoot: root.CEMCAssets ? root.CEMCAssets.mcRoot() : null }); } catch (e) {}
    render();
  }

  // 打开某个条目时给自定义文字一个合理的初值: 字体图像就是它自己 (勾选后立刻能在场景里
  // 按当前界面尺寸看到它的真实像素), 其它内容用条目 id / 名称
  function defaultCustomText(kind) {
    var key = ctx && ctx.entryKey ? String(ctx.entryKey) : '';
    if (kind === 'glyph' && key) return '<image:' + key + '>  ' + key;
    return key;
  }

  // ---------------- 对外 ----------------
  function open(c) {
    ctx = c || {};
    var kind = contentKind(ctx);
    // 换条目时刷新自定义文字初值 (同一条目重开则保留用户输入)
    if (!_lastKey || _lastKey !== (ctx.entryKey || '')) {
      _lastKey = ctx.entryKey || '';
      state.customText = defaultCustomText(kind);
      state.shiftValue = 0;
      state.shiftRange = null;
      state.furnPick = -1;
    }
    // 尊重调用方指定的场景, 否则用该内容类型的默认场景
    if (c && c.scene && c.scene !== 'auto') state.scene = c.scene;
    else if (sceneDefs(kind).map(function (d) { return d.id; }).indexOf(state.scene) === -1) {
      state.scene = defaultScene(kind);
    }
    var title = t('preview.windowTitle', 'MC 场景预览') + (ctx.entryKey ? ' — ' + ctx.entryKey : '');
    if (win && !win._closed) {
      win.setTitle(title);
      win.body.innerHTML = panelHtml();
      bind();
      render();
      return win;
    }
    var content = document.createElement('div');
    content.className = 'pv-content';
    content.innerHTML = panelHtml();
    win = root.WindowManager.open({
      title: title,
      content: content,
      width: (_winSize && _winSize.w) || 760,
      height: (_winSize && _winSize.h) || 620,
      minWidth: 520,
      minHeight: 380,
      className: 'cw-preview',
      maxTitle: t('preview.windowMax', '最大化 / 还原'),
      resizeTitle: t('preview.windowResize', '拖动改大小'),
      onClose: function () {
        win = null; els = {};
        _furnDrag = null; _furnDragged = false;
        document.removeEventListener('keydown', onFurnKey);
      },
    });
    // 窗口被拉大/最大化后要重新渲染: 画布尺寸取决于预览区宽度, 而界面尺寸「自动」也跟着变
    var rememberSize = function () {
      if (!win || win._closed) return;
      _winSize = { w: win.el.offsetWidth, h: win.el.offsetHeight };
    };
    win.onResize(function () { rememberSize(); render(); });
    bind();
    document.addEventListener('keydown', onFurnKey);
    render();
    return win;
  }

  function close() { if (win && !win._closed) win.close(); }
  function refresh() { if (win && !win._closed) render(); }

  root.CEPreviewPanel = { open: open, close: close, refresh: refresh, getState: function () { return state; } };
})();
