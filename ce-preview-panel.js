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
    // 字体模式: 'auto' = 原版默认 (缺失才回退 unifont), 'unicode' = 强制 Unicode 字体
    fontMode: 'auto',
    // 家具: 当前查看的变体下标
    variant: 0,
    // 方块: 当前查看的内部状态下标 (blockStates() 的顺序, 0 = 默认状态)
    blockState: 0,
    // 家具视图: yaw 旋转 (度, 45°步进), 缩放, 俯仰, 显示开关
    furnYaw: 0,
    furnZoom: 1,
    furnPitch: 30,
    furnHitboxes: true,
    furnSeats: true,
    furnGrid: true,
    furnFill: false,
    furnLabels: true,
    // 点击选中的碰撞箱下标 (-1 = 无)
    furnPick: -1,
    // 物品栏 GUI 场景: 当前查看的槽位下标 (inventorySlots() 的顺序)
    invSlot: 0,
    // 预览内编辑: 开关 + 当前选中手柄 id (null = 无)
    furnEdit: false,
    furnEditSel: null,
    // 偏移 <shift:N>: 当前数值, 以及文本里「正在编辑的那个标签」的区间
    shiftValue: 0,
    shiftRange: null,
    // 自动刷新模式: 'editor' (跟随编辑器, 默认) / 'disk' (轮询磁盘) / 'off' (不刷新)
    refreshMode: 'editor',
  };
  var _busy = false;
  var _pending = false;
  var _lastKey = null;
  var _furnDrag = null;        // 画布拖动旋转视角的进行中状态
  var _furnDragged = false;    // 本次指针操作是否发生了拖动 (用来抑制随后的 click 选箱)
  var _winSize = null;         // 记住用户调过的预览窗口大小 (拉大/最大化后重开也保持)
  var _customTextDirty = false; // 用户手改过自定义文字? 改过则自动切换条目时不再覆盖
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
    // 0) model/item_model 为对象时 (CE generation 写法) 优先取 path,
    //    避免被 material (原版材质 id) 抢走图标 —— 方块物品在背包里显示的是自己的模型。
    var mObj = unwrap(findKey(d, 'model')) || unwrap(findKey(d, 'item_model'));
    if (isObj(mObj)) {
      var mp = _iconFromValue(mObj);
      if (mp) return mp;
    }
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
  var BLOCK_SECTIONS = { blocks: 1, block: 1 };
  // 物品带 furniture_item 行为时也按家具预览
  function hasFurnitureBehavior(c) {
    if (!c || !root.CEPreview || !root.CEPreview.furnitureItemRef) return false;
    try { return !!root.CEPreview.furnitureItemRef(c.data || {}); } catch (e) { return false; }
  }
  // 物品带 block_item 系行为时也按方块预览 (block 字段可引用也可内联)
  function hasBlockItemBehavior(c) {
    if (!c || !root.CEPreview || !root.CEPreview.blockItemRef) return false;
    try { return !!root.CEPreview.blockItemRef(c.data || {}); } catch (e) { return false; }
  }
  function isBlockEntry(c) {
    if (!c) return false;
    var s = c.sectionBase || String(c.section || '').replace(/s$/, '');
    return !!(BLOCK_SECTIONS[c.sectionBase] || BLOCK_SECTIONS[c.section] || BLOCK_SECTIONS[s]);
  }
  function contentKind(c) {
    if (!c) return 'icon';
    var s = c.sectionBase || String(c.section || '').replace(/s$/, '');
    if (GLYPH_SECTIONS[c.sectionBase] || GLYPH_SECTIONS[c.section] || GLYPH_SECTIONS[s]) return 'glyph';
    if (FURNITURE_SECTIONS[c.sectionBase] || FURNITURE_SECTIONS[c.section] || FURNITURE_SECTIONS[s]) return 'furniture';
    if (isBlockEntry(c)) return 'block';
    if (hasFurnitureBehavior(c)) return 'furniture';
    if (hasBlockItemBehavior(c)) return 'block';
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
        { id: 'item-model', label: t('preview.sceneItemModel', '模型') },
        { id: 'lore', label: t('preview.sceneLore', '物品提示') },
        { id: 'gui', label: t('preview.sceneGui', '容器 GUI') },
        { id: 'chat', label: t('preview.sceneChat', '聊天') }
      ];
    }
    if (kind === 'block') {
      return [
        { id: 'block', label: t('preview.sceneBlock', '方块') },
        { id: 'item-model', label: t('preview.sceneItemModel', '模型') },
        { id: 'item', label: t('preview.sceneItem', '物品栏') },
        { id: 'inventory', label: t('preview.sceneInventory', '背包 GUI') },
        { id: 'lore', label: t('preview.sceneLore', '物品提示') },
        { id: 'chat', label: t('preview.sceneChat', '聊天') }
      ];
    }
    return [
      { id: 'item', label: t('preview.sceneItem', '物品栏') },
      { id: 'inventory', label: t('preview.sceneInventory', '背包 GUI') },
      { id: 'item-model', label: t('preview.sceneItemModel', '模型') },
      { id: 'lore', label: t('preview.sceneLore', '物品提示') },
      { id: 'gui', label: t('preview.sceneGui', '容器 GUI') },
      { id: 'chat', label: t('preview.sceneChat', '聊天') }
    ];
  }
  function defaultScene(kind) {
    if (kind === 'glyph') return 'gui';
    if (kind === 'furniture') return 'furniture';
    if (kind === 'block') return 'block';
    return 'item';
  }
  // 方块条目的状态列表 (由 states.properties 的笛卡尔积推出来)
  // 物品内联方块: 状态定义在 behavior.block.state(s) 里, 传解出来的方块定义
  function blockStates() {
    if (!root.CEPreview || !root.CEPreview.blockStateList) return null;
    var src = resolvedBlock();
    try { return root.CEPreview.blockStateList(src); } catch (e) { return null; }
  }
  // 当前条目的方块定义: 方块段条目直接用; 物品则解出它 block_item 行为引用的方块
  // (引用 id → 去工程 blocks: 段找; 内联 → 直接用它自己)
  function resolvedBlock() {
    var d = (ctx && ctx.data) || {};
    if (root.CEPreview && root.CEPreview.blockInlineOf) {
      try {
        var b = root.CEPreview.blockInlineOf(d);
        if (b) return b;
      } catch (e) { /* ignore */ }
    }
    return d;
  }
  // 把「当前选中的内部状态」注进数据副本 (渲染核心据此做 variant 匹配),
  // 原对象不动 —— 预览不该改动编辑器里的配置
  function blockDataWithState() {
    var d = resolvedBlock();
    if (!d || typeof d !== 'object') return d;
    var list = blockStates();
    var idx = state.blockState || 0;
    // 浅拷贝保留引用语义, states 单独拷一层再塞 _ceVariant
    var copy = {};
    Object.keys(d).forEach(function (k) { copy[k] = d[k]; });
    var st = copy.states;
    if (st && typeof st === 'object' && !Array.isArray(st)) {
      var stCopy = {};
      Object.keys(st).forEach(function (k) { stCopy[k] = st[k]; });
      stCopy._ceVariant = (list && list.states[idx]) ? list.states[idx] : {};
      copy.states = stCopy;
    }
    return copy;
  }
  // Block entries and block_item entries must carry their resolved CE block
  // definition into item/inventory/model scenes; the material icon alone is not enough.
  function sceneItemRef(p) {
    if (contentKind(ctx) === 'block') {
      return { id: p.icon || ctx.entryKey || null, blockData: blockDataWithState() };
    }
    return p.icon || undefined;
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
      '      <label class="pv-field" id="pv-modelctx-field" style="display:none;"><span>' + esc(t('preview.modelContext', 'display 上下文')) + '</span>' +
      '        <select class="pv-select" id="pv-modelctx"></select></label>' +
      '      <label class="pv-field" id="pv-blockstate-field" style="display:none;"><span>' + esc(t('preview.blockState', '方块状态')) + '</span>' +
      '        <select class="pv-select" id="pv-blockstate"></select></label>' +
      '    </div>' +
      '    <div class="pv-group" id="pv-furn-group" style="display:none;">' +
      '      <button type="button" class="pv-btn" data-furn-yaw="-45" title="' + esc(t('preview.furnYawLeft', '视角左转 45° (Q)')) + '">⟲</button>' +
      '      <span class="pv-field pv-furn-yawval" id="pv-furn-yawval" title="' + esc(t('preview.furnYawDrag', '在画布上左右拖动可直接旋转视角')) + '">0°</span>' +
      '      <button type="button" class="pv-btn" data-furn-yaw="45" title="' + esc(t('preview.furnYawRight', '视角右转 45° (E)')) + '">⟳</button>' +
      '      <button type="button" class="pv-btn pv-furn-reset" title="' + esc(t('preview.furnReset', '重置视角 (R)')) + '">' + esc(t('preview.furnReset', '重置')) + '</button>' +
      '      <button type="button" class="pv-btn" data-furn-zoom="-1" title="' + esc(t('preview.furnZoomOut', '缩小 (-)')) + '">−</button>' +
      '      <span class="pv-field pv-furn-zoomval" id="pv-furn-zoomval">100%</span>' +
      '      <button type="button" class="pv-btn" data-furn-zoom="1" title="' + esc(t('preview.furnZoomIn', '放大 (+)')) + '">+</button>' +
      '      <button type="button" class="pv-btn" data-furn-pitch="-15" title="' + esc(t('preview.furnPitchDown', '压低视角 (俯仰 -15°)')) + '">⤓</button>' +
      '      <span class="pv-field pv-furn-pitchval" id="pv-furn-pitchval" title="' + esc(t('preview.furnPitchHint', '30° = 等轴测, 90° = 正俯视')) + '">30°</span>' +
      '      <button type="button" class="pv-btn" data-furn-pitch="15" title="' + esc(t('preview.furnPitchUp', '抬高视角 (俯仰 +15°)')) + '">⤒</button>' +
      '    </div>' +
      '    <div class="pv-group pv-checks" id="pv-furn-checks" style="display:none;">' +
      '      <label class="pv-check pv-edit-toggle" title="' + esc(t('preview.furnEditHint', '在预览里直接拖动碰撞箱 / 座位 / 元素锚点 (改动写回编辑器)')) + '">' +
      '        <input type="checkbox" id="pv-furn-edit"> ' + esc(t('preview.furnEdit', '编辑')) + '</label>' +
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
      '      <label class="pv-check"><input type="checkbox" id="pv-uni"' + (state.fontMode === 'unicode' ? ' checked' : '') + '> ' + esc(t('preview.forceUnicode', '强制 Unicode 字体 (unifont)')) + '</label>' +
      '      <label class="pv-check"><input type="checkbox" id="pv-dark" checked> ' + esc(t('preview.darkBg', '深色底')) + '</label>' +
      '    </div>' +
      '    <div class="pv-group pv-right">' +
      '      <button type="button" class="pv-btn" id="pv-refresh" title="' + esc(t('common.reload', '重新加载')) + '">⟳</button>' +
      '      <button type="button" class="pv-btn" id="pv-detach" title="' + esc(t('preview.detachHint', '在独立窗口中打开')) + '">' +
        esc(t('preview.detach', '独立窗口')) + '</button>' +
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
      state.furnPitch = 30;
      state.furnPick = -1;
      state.furnEditSel = null;
      render();
    });
    [['pv-furn-hb', 'furnHitboxes'], ['pv-furn-fill', 'furnFill'], ['pv-furn-labels', 'furnLabels'],
     ['pv-furn-seats', 'furnSeats'], ['pv-furn-grid', 'furnGrid']].forEach(function (pair) {
      var el = body.querySelector('#' + pair[0]);
      if (el) el.addEventListener('change', function () { state[pair[1]] = this.checked; render(); });
    });
    // 预览内编辑开关
    var editEl = body.querySelector('#pv-furn-edit');
    if (editEl) editEl.addEventListener('change', function () {
      state.furnEdit = this.checked;
      if (!state.furnEdit) state.furnEditSel = null;
      render();
    });
    // 俯仰步进 (±15°, clamp -90..90, 30 = 等轴测基准)
    var pitchBtns = body.querySelectorAll('[data-furn-pitch]');
    for (var pbi = 0; pbi < pitchBtns.length; pbi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var d = (parseInt(btn.getAttribute('data-furn-pitch'), 10) || 0) > 0 ? 15 : -15;
          state.furnPitch = Math.max(-90, Math.min(90, Math.round((state.furnPitch == null ? 30 : state.furnPitch) + d)));
          render();
        });
      })(pitchBtns[pbi]);
    }
    // 点击画布: 命中碰撞箱 → 高亮并在状态栏显示它的类型/尺寸/座位
    if (els.canvas) {
      els.canvas.addEventListener('click', function (e) {
        var sc = resolvedScene();
        // 物品栏 GUI: 点哪个槽位, 物品就放进哪个槽位
        if (sc === 'inventory') {
          if (!root.CEPreview || !root.CEPreview.inventoryPickAt) return;
          var rectI = this.getBoundingClientRect();
          var lxI = (e.clientX != null && rectI) ? (e.clientX - rectI.left) : (e.offsetX || 0);
          var lyI = (e.clientY != null && rectI) ? (e.clientY - rectI.top) : (e.offsetY || 0);
          var gsI = parseFloat(this.getAttribute('data-gui-scale')) || 1;
          if (gsI > 0) { lxI /= gsI; lyI /= gsI; }
          var slot = root.CEPreview.inventoryPickAt(lxI, lyI);
          if (slot >= 0 && slot !== (state.invSlot || 0)) { state.invSlot = slot; render(); }
          return;
        }
        if (sc !== 'furniture' || state.furnHitboxes === false) return;
        if (!root.CEPreview || !root.CEPreview.furniturePickAt) return;
        // 刚拖过视角就不要再当成点击选箱子
        if (_furnDragged) { _furnDragged = false; return; }
        var rect = this.getBoundingClientRect();
        var lx = (e.clientX != null && rect) ? (e.clientX - rect.left) : (e.offsetX || 0);
        var ly = (e.clientY != null && rect) ? (e.clientY - rect.top) : (e.offsetY || 0);
        var gs = parseFloat(this.getAttribute('data-gui-scale')) || 1;
        if (gs > 0) { lx /= gs; ly /= gs; }
        // 编辑模式: 点手柄 = 选中它 (再点空白处取消), 不做碰撞箱拾取
        if (state.furnEdit) {
          var eh = null;
          try { eh = root.CEPreview.furnitureEditHitAt(lx, ly); } catch (err) { eh = null; }
          var eid = eh ? (eh.id || null) : null;
          if (eid !== state.furnEditSel) { state.furnEditSel = eid; render(); }
          return;
        }
        var hit = null;
        try { hit = root.CEPreview.furniturePickAt(lx, ly); } catch (err) { hit = null; }
        var idx = hit ? hit.index : -1;
        if (idx === state.furnPick) return;
        state.furnPick = idx;
        render();
      });
      // Ctrl+滚轮 = 缩放 (普通滚轮留给预览区滚动)
      els.canvas.addEventListener('wheel', function (e) {
        var sc = resolvedScene();
        if ((sc !== 'furniture' && sc !== 'item-model') || !e.ctrlKey) return;
        e.preventDefault();
        stepFurnZoom(e.deltaY < 0 ? 1 : -1);
      }, { passive: false });
      // 左右拖动 = 自由旋转视角 (按住 Shift 吸附到 15°); 编辑模式下先试手柄命中
      // 家具 / 模型两个场景共用同一组视图状态 (yaw/zoom/pitch), 交互一并放行
      els.canvas.addEventListener('pointerdown', function (e) {
        var sc = resolvedScene();
        if ((sc !== 'furniture' && sc !== 'item-model') || e.button !== 0) return;
        if (state.furnEdit && handleDragStart(e)) {
          try { this.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          this.style.cursor = 'move';
          e.preventDefault();
          return;
        }
        _furnDrag = { id: e.pointerId, x: e.clientX, yaw: state.furnYaw || 0, moved: 0 };
        _furnDragged = false;
        try { this.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.style.cursor = 'grabbing';
        e.preventDefault();
      });
      els.canvas.addEventListener('pointermove', function (e) {
        // 手柄拖拽优先于视角拖拽
        if (_handleDrag && _handleDrag.id === e.pointerId) { handleDragMove(e); return; }
        if (!_furnDrag || _furnDrag.id !== e.pointerId) {
          // 悬停高亮: 编辑模式下把手柄光标变成 move
          if (state.furnEdit && root.CEPreview && root.CEPreview.furnitureEditHitAt) {
            var pt = canvasLogicalXY(e);
            var hv = null;
            try { hv = root.CEPreview.furnitureEditHitAt(pt.x, pt.y); } catch (err) { hv = null; }
            this.style.cursor = hv ? 'move' : 'grab';
          }
          return;
        }
        var dx = e.clientX - _furnDrag.x;
        if (Math.abs(dx) > 3) { _furnDrag.moved = 1; _furnDragged = true; }
        var yaw = _furnDrag.yaw + dx * (e.shiftKey ? 0.4 : 0.8);
        if (e.shiftKey) yaw = Math.round(yaw / 15) * 15;
        state.furnYaw = ((yaw % 360) + 360) % 360;
        render();
      });
      var endDrag = function (e) {
        if (_handleDrag && _handleDrag.id === e.pointerId) {
          handleDragEnd(e);
          try { els.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          if (els.canvas.style) els.canvas.style.cursor = '';
          return;
        }
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
      textEl.addEventListener('input', function () { state.customText = this.value; _customTextDirty = true; });
      textEl.addEventListener('change', function () { state.customText = this.value; _customTextDirty = true; render(); });
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
    ['tags:resolveMiniMessage', 'cetags:resolveCeTags', 'globals:resolveGlobals', 'images:resolveImages', 'shadow:shadow', 'dark:dark', 'uni:fontMode'].forEach(function (pair) {
      var parts = pair.split(':');
      var el = body.querySelector('#pv-' + parts[0]);
      if (el) el.addEventListener('change', function () {
        if (parts[1] === 'fontMode') state.fontMode = this.checked ? 'unicode' : 'auto';
        else state[parts[1]] = this.checked;
        render();
      });
    });
    body.querySelector('#pv-refresh').addEventListener('click', function () { hardRefresh(); });
    var detachBtn = body.querySelector('#pv-detach');
    if (detachBtn) detachBtn.addEventListener('click', function () { detach(); });
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
    // 家具/模型/方块场景: 显示视图控制组; 家具场景再加显示开关, 模型场景加 display 上下文
    var isFurn = (state.scene === 'furniture');
    var isModel = (state.scene === 'item-model');
    // 方块也是 3D 视图, 复用同一套 旋转/缩放/俯仰 控件
    var isBlock = (state.scene === 'block');
    var is3D = isFurn || isModel || isBlock;
    var furnGroup = win.body.querySelector('#pv-furn-group');
    var furnChecks = win.body.querySelector('#pv-furn-checks');
    if (furnGroup) furnGroup.style.display = is3D ? '' : 'none';
    if (furnChecks) furnChecks.style.display = isFurn ? '' : 'none';
    var zoomVal = win.body.querySelector('#pv-furn-zoomval');
    if (zoomVal) zoomVal.textContent = Math.round((state.furnZoom || 1) * 100) + '%';
    var yawVal = win.body.querySelector('#pv-furn-yawval');
    if (yawVal) yawVal.textContent = Math.round(state.furnYaw || 0) + '°';
    var pitchVal = win.body.querySelector('#pv-furn-pitchval');
    if (pitchVal) pitchVal.textContent = Math.round(state.furnPitch != null ? state.furnPitch : 30) + '°';
    var editEl = win.body.querySelector('#pv-furn-edit');
    if (editEl) editEl.checked = state.furnEdit === true;
    if (els.stage) els.stage.style.cursor = is3D ? 'crosshair' : '';
    if (els.canvas && !_furnDrag) els.canvas.style.cursor = is3D ? 'grab' : '';
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
    // 方块状态下拉 (多状态方块): 选项 = properties 的笛卡尔积, 按源码语义排序
    var bsEl = win.body.querySelector('#pv-blockstate');
    var bsField = win.body.querySelector('#pv-blockstate-field');
    if (bsEl && bsField) {
      var bsList = contentKind(ctx) === 'block' ? blockStates() : null;
      if (bsList && bsList.states.length > 1) {
        var propNames = bsList.props.map(function (p) { return p.name; });
        var bsig = propNames.join(',') + '|' + bsList.states.length;
        if (bsEl.getAttribute('data-sig') !== bsig) {
          bsEl.setAttribute('data-sig', bsig);
          bsEl.innerHTML = bsList.states.map(function (st, i) {
            var label = propNames.map(function (n) { return n + '=' + st[n]; }).join(', ');
            return '<option value="' + i + '">' + esc(label) + '</option>';
          }).join('');
        }
        if (state.blockState >= bsList.states.length || state.blockState == null) state.blockState = 0;
        bsEl.value = String(state.blockState);
        bsField.style.display = '';
        if (!bsEl.getAttribute('data-bound')) {
          bsEl.setAttribute('data-bound', '1');
          bsEl.addEventListener('change', function () {
            state.blockState = parseInt(this.value, 10) || 0;
            render();
          });
        }
      } else {
        bsField.style.display = 'none';
      }
    }
    // display 上下文下拉 (模型场景): 上下文列表来自渲染核心
    var ctxEl = win.body.querySelector('#pv-modelctx');
    var ctxField = win.body.querySelector('#pv-modelctx-field');
    if (ctxEl && ctxField) {
      if (isModel && root.CEPreview && root.CEPreview.displayContextList) {
        var ctxList = null;
        try { ctxList = root.CEPreview.displayContextList(); } catch (e) { ctxList = null; }
        var names = (ctxList && ctxList.length) ? ctxList : ['gui'];
        if (state.modelCtx == null) state.modelCtx = 'gui';
        var csig = names.join('\u0001');
        if (ctxEl.getAttribute('data-sig') !== csig) {
          ctxEl.setAttribute('data-sig', csig);
          ctxEl.innerHTML = names.map(function (n) {
            return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
          }).join('');
        }
        if (names.indexOf(state.modelCtx) === -1) state.modelCtx = 'gui';
        ctxEl.value = state.modelCtx;
        ctxField.style.display = '';
        if (!ctxEl.getAttribute('data-bound')) {
          ctxEl.setAttribute('data-bound', '1');
          ctxEl.addEventListener('change', function () { state.modelCtx = this.value; render(); });
        }
      } else {
        ctxField.style.display = 'none';
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

  // 家具/模型场景快捷键 (焦点不在输入框时): Q/E 旋转, R 重置, +/- 缩放, PageUp/PageDown 俯仰
  function onFurnKey(e) {
    if (!win || win._closed) return;
    var sc = resolvedScene();
    if (sc !== 'furniture' && sc !== 'item-model') return;
    var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    var k = e.key;
    if (k === 'q' || k === 'Q') { state.furnYaw = ((state.furnYaw || 0) - 45 + 360) % 360; render(); e.preventDefault(); }
    else if (k === 'e' || k === 'E') { state.furnYaw = ((state.furnYaw || 0) + 45) % 360; render(); e.preventDefault(); }
    else if (k === 'r' || k === 'R') { state.furnYaw = 0; state.furnZoom = 1; state.furnPitch = 30; state.furnPick = -1; state.furnEditSel = null; render(); e.preventDefault(); }
    else if (k === '+' || k === '=') { stepFurnZoom(1); e.preventDefault(); }
    else if (k === '-' || k === '_') { stepFurnZoom(-1); e.preventDefault(); }
    else if (k === 'PageUp') { state.furnPitch = Math.max(-90, Math.min(90, (state.furnPitch == null ? 30 : state.furnPitch) + 15)); render(); e.preventDefault(); }
    else if (k === 'PageDown') { state.furnPitch = Math.max(-90, Math.min(90, (state.furnPitch == null ? 30 : state.furnPitch) - 15)); render(); e.preventDefault(); }
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
      forceUnicode: state.fontMode === 'unicode',
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

  // ---------------- 预览内编辑: 把手柄拖动写回条目数据 ----------------
  // 手柄几何来自渲染核心 (_furnPick.handles 里有活引用), 这里只负责「数字 → 配置文本」。
  // 家具相对坐标是方块单位 (原点 = 原点方块底部中心), 世界坐标是 1/16 单位。
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function fmtCoord(v) {
    var n = round3(v);
    return (Object.is(n, -0) ? 0 : n) + '';
  }
  function unwrapLive(v) {
    return (v !== null && typeof v === 'object' && typeof v.__ceTag === 'string') ? v.v : v;
  }
  // 把新值写回活对象字段: 原值是 !!tag 包装 ({__ceTag, v}) 时只替换 .v —— 保留 YAML tag,
  // syncToSource 序列化时才能原样输出 !!前缀; 普通值直接赋。
  function writeLive(obj, key, value) {
    var cur = obj[key];
    if (cur !== null && typeof cur === 'object' && typeof cur.__ceTag === 'string') cur.v = value;
    else obj[key] = value;
  }
  // 字符串坐标 ('0,-0.46,0' 官方包常态) → 数字数组 (解析不了的分量为 0)
  function parseCoord3(v) {
    var arr = [0, 0, 0];
    if (typeof v === 'string') {
      var parts = v.trim().split(/[\s,]+/).filter(Boolean);
      for (var i = 0; i < 3; i++) {
        var n = parseFloat(parts[i]);
        if (isFinite(n)) arr[i] = n;
      }
    }
    return arr;
  }
  // 座位串重建: "x,y,z yaw [tail token 原样保留]" (CE 允许 force / 未知 flags 附加在后面;
  // 原本没写 yaw 时 tail 从第 4 个 token 开始, 重建时也不凭空补 yaw)
  function seatToString(st, pos, yaw) {
    var s = fmtCoord(pos[0]) + ',' + fmtCoord(pos[1]) + ',' + fmtCoord(pos[2]);
    if (yaw != null && isFinite(yaw)) s += ' ' + fmtCoord(yaw);
    var tail = (st && st.tail && st.tail.length) ? ' ' + st.tail.join(' ') : '';
    return s + tail;
  }
  // 把世界坐标 (1/16) 写回碰撞箱的 position (方块单位, 相对原点方块底部中心)。
  // y 始终写回: 普通拖拽锁定在底面平面 (w[1] === baseY, 恒等), Shift 竖直拖拽才真正改 y。
  function applyHbPos(hb, wx, wz, wy) {
    var p = unwrapLive(hb.position);
    var arr = Array.isArray(p) ? p.slice() : parseCoord3(p);
    while (arr.length < 3) arr.push(0);
    arr[0] = round3(wx / 16 - 0.5);
    arr[2] = round3(wz / 16 - 0.5);
    if (wy != null && isFinite(wy)) arr[1] = round3(wy / 16);
    writeLive(hb, 'position', arr);
  }
  // 改高度: 优先写 height; scale: [宽, 高] 简写时拆成显式 width + height (语义更清楚)
  function applyHbHeight(hb, worldY, baseY) {
    var newH = Math.max(0.0625, round3((worldY - baseY) / 16));
    var curH = unwrapLive(hb.height);
    var curScale = unwrapLive(hb.scale);
    if (curH != null) { writeLive(hb, 'height', newH); return; }
    if (Array.isArray(curScale) && curScale.length >= 2 && unwrapLive(hb.width) == null) {
      writeLive(hb, 'width', round3(unwrapLive(curScale[0]) || 1));
      delete hb.scale;
    }
    writeLive(hb, 'height', newH);
  }
  // 座位: position 相对方块中心 (x-0.5, z-0.5), y 保持方块单位; yaw 不变
  function applySeatPos(st, hb, seatIdx, wx, wy, wz) {
    var list = flistLocal(hb.seats);
    var raw = list[seatIdx];
    var target = (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.__ceTag === 'string') ? raw : null;
    if (target && isObjLocal(target.v)) {
      target.v.position = [round3(wx / 16 - 0.5), round3(wy / 16), round3(wz / 16 - 0.5)];
      return;
    }
    if (isObjLocal(raw)) {
      writeLive(raw, 'position', [round3(wx / 16 - 0.5), round3(wy / 16), round3(wz / 16 - 0.5)]);
      return;
    }
    // 字符串座位: 原样数组写入 (保留 tail token), 保证 seats 列表类型不变
    var s = seatToString(st, [wx / 16 - 0.5, wy / 16, wz / 16 - 0.5], st.yaw);
    if (Array.isArray(unwrapLive(hb.seats))) {
      if (hb.seats !== null && typeof hb.seats === 'object' && typeof hb.seats.__ceTag === 'string') {
        hb.seats.v[seatIdx] = s;    // wrap 列表: 只改内部数组, 保留 !!tag
      } else {
        hb.seats[seatIdx] = s;
      }
    } else {
      writeLive(hb, 'seats', s);
    }
  }
  // 元素 translation (方块单位): 锚点世界坐标 = furnWorld(pos + translation), 这里只改平移部分
  function applyElPos(el, wx, wy, wz) {
    var pos = unwrapLive(el.position);
    var pa = Array.isArray(pos)
      ? pos.map(function (x) { return typeof x === 'number' ? x : (parseFloat(x) || 0); })
      : parseCoord3(pos);
    while (pa.length < 3) pa.push(0);
    writeLive(el, 'translation', [round3(wx / 16 - 0.5 - pa[0]), round3(wy / 16 - pa[1]), round3(wz / 16 - 0.5 - pa[2])]);
  }
  function isObjLocal(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function flistLocal(v) {
    v = unwrapLive(v);
    return v == null ? [] : (Array.isArray(v) ? v : [v]);
  }

  // 拖拽结束 / 每次写回后: 通知宿主同步可视化编辑器
  function dispatchDataChanged(reason) {
    try {
      document.dispatchEvent(new CustomEvent('ce-preview-data-changed', {
        detail: {
          file: ctx && ctx.file, entryKey: ctx && ctx.entryKey,
          section: ctx && ctx.section, reason: reason || 'edit',
          apply: function (data) {
            // data 是 renderer 传进来的解析树条目 data; 预览期间直接改的就是同一棵树,
            // 这里无需再拷贝 —— 保留钩子是为了未来面板与编辑器分离数据时的兼容。
            return true;
          }
        }
      }));
    } catch (e) { /* ignore */ }
  }

  // 手柄拖拽状态机: pointerdown 命中手柄 → move 反投影 → 改数据 → up 提交 + 重渲染
  var _handleDrag = null;
  // 指针事件 → 画布逻辑坐标。offsetX/offsetY 在合成事件 (自动化测试/程序派发) 上
  // 不可用 (构造时只读、恒为 0), 所以统一从 clientX/Y - 画布矩形推导, 两者都正确。
  function canvasLogicalXY(e) {
    var lx, ly;
    if (e.clientX != null && els.canvas && els.canvas.getBoundingClientRect) {
      var r = els.canvas.getBoundingClientRect();
      lx = e.clientX - r.left;
      ly = e.clientY - r.top;
    } else {
      lx = e.offsetX || 0;
      ly = e.offsetY || 0;
    }
    var gs = parseFloat(els.canvas && els.canvas.getAttribute ? els.canvas.getAttribute('data-gui-scale') : null) || 1;
    if (gs > 0) { lx /= gs; ly /= gs; }
    return { x: lx, y: ly };
  }
  function handleDragStart(e) {
    if (!root.CEPreview || !root.CEPreview.furnitureEditHitAt) return false;
    if (state.furnEdit !== true || resolvedScene() !== 'furniture') return false;
    var pt = canvasLogicalXY(e);
    var h = null;
    try { h = root.CEPreview.furnitureEditHitAt(pt.x, pt.y); } catch (err) { h = null; }
    if (!h) return false;
    _handleDrag = {
      id: e.pointerId, h: h,
      start: { x: e.clientX, y: e.clientY },
      startWorld: (h.kind === 'seat') ? (h.world || [0, 0, 0]).slice()
        : (h.kind === 'el-pos') ? (h.anchor || [0, 0, 0]).slice()
        : null
    };
    state.furnEditSel = h.id || null;
    return true;
  }
  // 把世界坐标写到对应目标 (拖拽中实时调用, 活引用直接生效 → 下一次渲染就反映移动)
  function applyHandleWorld(h, w) {
    var hb = h.hb;
    if (h.kind === 'hb-pos' && hb) applyHbPos(hb, w[0], w[2], w[1]);
    else if (h.kind === 'hb-height' && hb) applyHbHeight(hb, w[1], h.baseY);
    else if (h.kind === 'seat' && hb) applySeatPos(h.seat, hb, h.seatIndex, w[0], w[1], w[2]);
    else if (h.kind === 'el-pos' && h.el) applyElPos(h.el, w[0], w[1], w[2]);
  }
  // 移动中: 只改内存里的数据 (活引用), 不派发事件; up 时统一提交
  function handleDragMove(e) {
    if (!_handleDrag || _handleDrag.id !== e.pointerId) return;
    var P = root.CEPreview;
    var h = _handleDrag.h;
    var pt = canvasLogicalXY(e);
    var lx = pt.x, ly = pt.y;
    var w;
    if (h.kind === 'hb-height') {
      // 高度手柄: 沿手柄的竖直线改世界 y (已知 x/z, 反解 y)。
      // 不走平面反投影 —— 锁在 y=topY 平面上 y 永远等于 topY, 高度就改不动了。
      var hx = (h.wx != null) ? h.wx : ((_handleDrag.startWorld && _handleDrag.startWorld[0]) || 8);
      var hz = (h.wz != null) ? h.wz : ((_handleDrag.startWorld && _handleDrag.startWorld[2]) || 8);
      var hy = null;
      try { hy = P.furnitureUnprojectY(lx, ly, hx, hz); } catch (err) { hy = null; }
      if (hy == null || !isFinite(hy)) return;
      w = [hx, hy, hz];
    } else if (e.shiftKey) {
      // Shift = 锁定水平位置只改高度 (hb-pos/seat 锁 x/z, el-pos 也一样 ——
      // 元素锚点平时在 y=锚点平面内拖动, 只有 Shift 才能竖直移动它)
      var base = _handleDrag.startWorld || [0, 0, 0];
      var y = null;
      try { y = P.furnitureUnprojectY(lx, ly, base[0], base[2]); } catch (err) { y = null; }
      if (y == null || !isFinite(y)) return;
      w = [base[0], y, base[2]];
    } else {
      // hb-pos 锁底面 (h.baseY), 其它手柄锁拖拽开始时的锚点高度;
      // 普通分支里 y 不变 → applyHbPos 的 y 写回是恒等操作
      var planeY = h.kind === 'hb-pos' ? h.baseY : (_handleDrag.startWorld ? _handleDrag.startWorld[1] : 0);
      try { w = P.furnitureUnproject(lx, ly, planeY); } catch (err) { w = null; }
      if (!w || !isFinite(w[0]) || !isFinite(w[2])) return;
    }
    _handleDrag.last = w;
    // 实时写活数据 + 重画: 渲染核心下次 render() 读的就是被改过的配置
    applyHandleWorld(h, w);
    render();
  }
  function handleDragEnd(e) {
    if (!_handleDrag || _handleDrag.id !== e.pointerId) return false;
    var h = _handleDrag.h;
    var w = _handleDrag.last;
    _handleDrag = null;
    if (!w) { render(); return true; }   // 没动过: 只取消选中态
    applyHandleWorld(h, w);
    dispatchDataChanged(h.kind);
    render();
    return true;
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
          yaw: state.furnYaw || 0, zoom: state.furnZoom || 1, pitch: state.furnPitch != null ? state.furnPitch : 30,
          showHitboxes: state.furnHitboxes !== false,
          showSeats: state.furnSeats !== false,
          showGrid: state.furnGrid !== false,
          hbFill: state.furnFill !== false,
          hbLabels: state.furnLabels !== false,
          hlHitbox: state.furnPick,
          edit: state.furnEdit === true,
          editSel: state.furnEditSel || null,
        };
      } else if (scene === 'block') {
        // 方块: 把「当前选中的内部状态」注入数据副本, 让渲染核心按 variant 选对外观
        payload = {
          type: 'block', scale: state.scale, options: makeOpts(),
          blockData: blockDataWithState(),
          entryKey: ctx.entryKey || '',
          yaw: state.furnYaw || 0, zoom: state.furnZoom || 1,
          pitch: state.furnPitch != null ? state.furnPitch : 30,
          showGrid: state.furnGrid !== false,
        };
      } else if (scene === 'item-model') {
        payload = {
          type: 'item-model', scale: state.scale, options: makeOpts(),
          modelRef: sceneItemRef(p) || ctx.entryKey || undefined,
          displayContext: state.modelCtx || 'gui',
          yaw: state.furnYaw || 0, zoom: state.furnZoom || 1,
          pitch: state.furnPitch != null ? state.furnPitch : 30,
          showGround: state.furnGrid !== false,
        };
      } else if (scene === 'item') {
        payload = {
          type: 'item', scale: state.scale, options: makeOpts(),
          name: useCustom ? cLines[0] : (p.name || ('<white>' + esc(ctx.entryKey || ''))),
          lore: useCustom ? cLines.slice(1) : p.lore, item: sceneItemRef(p),
          count: countOf(p), rarity: rarityOf(ctx),
        };
      } else if (scene === 'inventory') {
        // 原版生存物品栏: 物品按 gui 上下文的 ItemTransform 渲染 (3D 模型 = 正交直视)
        payload = {
          type: 'inventory', scale: state.scale, options: makeOpts(),
          item: sceneItemRef(p), slot: state.invSlot || 0,
          count: countOf(p), hoverSlot: state.invSlot || 0,
        };
      } else {
        payload = {
          type: 'lore', scale: state.scale, options: makeOpts(),
          name: useCustom ? cLines[0] : (p.name || ('<white>' + esc(ctx.entryKey || ''))),
          lore: useCustom ? cLines.slice(1) : p.lore, showItem: true, item: sceneItemRef(p),
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
      // 物品栏 GUI: 当前槽位 (点击画布上的其它槽位可以把物品挪过去)
      if (scene === 'inventory') {
        var invData = null;
        try { invData = root.CEPreview.inventoryPickData ? root.CEPreview.inventoryPickData() : null; } catch (e) { invData = null; }
        var invSlotIdx = state.invSlot || 0;
        if (invData && invData.slots && invData.slots[invSlotIdx]) {
          var invKey = String(invData.slots[invSlotIdx].key || '');
          var invName = invKey.replace(/^hotbar/, t('preview.invSlotHotbar', '快捷栏') + ' ')
            .replace(/^main(\d)(\d)$/, t('preview.invSlotMain', '背包') + ' $1-$2')
            .replace(/^craft(\d)(\d)$/, t('preview.invSlotCraft', '合成') + ' $1-$2')
            .replace(/^armor(\d)$/, t('preview.invSlotArmor', '装备') + ' $1')
            .replace(/^result$/, t('preview.invSlotResult', '产物'));
          parts.push(t('preview.invSlotLabel', '槽位') + ': ' + invName + ' #' + invSlotIdx);
        }
      }
      if (w && w.state === 'ready') parts.push(t('preview.assetsOk', '资源已索引 ({n} 项)', { n: Object.keys(w.counts || {}).reduce(function (a, k) { return a + w.counts[k]; }, 0) }));
      else if (w && w.state === 'loading') parts.push(t('preview.assetsLoading', '资源索引中…'));
      else parts.push(t('preview.assetsMissing', '未配置 Minecraft 资源目录，使用内置回退字形'));
      if (warnings.length) parts.push('⚠ ' + warnings.length);
      setStatus(parts.join('  ·  '), warnings.length ? 'warn' : '', legend);
      // 视图缩放/角度/俯仰读数回写 (按钮/滚轮/快捷键/拖动都会改 state)
      var zv = win.body.querySelector('#pv-furn-zoomval');
      if (zv) zv.textContent = Math.round((state.furnZoom || 1) * 100) + '%';
      var yv = win.body.querySelector('#pv-furn-yawval');
      if (yv) yv.textContent = Math.round(state.furnYaw || 0) + '°';
      var pv2 = win.body.querySelector('#pv-furn-pitchval');
      if (pv2) pv2.textContent = Math.round(state.furnPitch != null ? state.furnPitch : 30) + '°';
      if (warnings.length) console.warn('[CEPreviewPanel] warnings:', warnings);
      // 独立窗口开着的话, 把最新内容同步过去 (场景/状态/勾选项变化都跟上)
      pushToDetached();
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
      inventory: t('preview.sceneInventory', '背包 GUI'),
      chat: t('preview.sceneChat', '聊天'),
      lore: t('preview.sceneLore', '物品 Lore'),
      gui: t('preview.sceneGui', kindSceneLabel(s)),
      image: t('preview.sceneImage', '图像总览'),
      furniture: t('preview.sceneFurniture', '家具'),
      block: t('preview.sceneBlock', '方块'),
      'item-model': t('preview.sceneItemModel', '模型')
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
      _customTextDirty = false;
      state.shiftValue = 0;
      state.shiftRange = null;
      state.furnPick = -1;
      state.furnEditSel = null;   // 手柄选中态是旧条目数据的 id, 换条目一并清掉
      state.invSlot = 0;          // 物品栏场景的槽位选择也回到快捷栏第一格
    }
    // 尊重调用方指定的场景, 否则用该内容类型的默认场景
    if (c && c.scene && c.scene !== 'auto') state.scene = c.scene;
    else if (sceneDefs(kind).map(function (d) { return d.id; }).indexOf(state.scene) === -1) {
      state.scene = defaultScene(kind);
    }
    // 设置里选了「独立窗口」→ 直接开独立系统窗口, 不在编辑器里开浮层
    if (root.__cePreviewWindowMode === 'detached' && !(c && c.forceDocked)) {
      detach();
      return null;
    }
    var title = t('preview.windowTitle', 'MC 场景预览') + (ctx.entryKey ? ' — ' + ctx.entryKey : '');
    if (win && !win._closed) {
      win.setTitle(title);
      win.body.innerHTML = panelHtml();
      bind();
      render();
      if (state.refreshMode === 'disk') startDiskWatch();
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
        _handleDrag = null;   // 手柄拖拽状态一并清掉, 防止 pointerId 复用时旧状态劫持新窗口
        stopDiskWatch();
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
    if (state.refreshMode === 'disk') startDiskWatch();
    return win;
  }

  // 换条目但保持同一个窗口: 不重建 DOM (勾选态/滚动位置/尺寸都留着),
  // 只换 ctx + 标题 + 场景标签后重画。自动切换预览走这里。
  function follow(c) {
    if (!win || win._closed || !c) return null;
    var prevKey = _lastKey;
    ctx = c;
    var kind = contentKind(ctx);
    if (prevKey !== (ctx.entryKey || '')) {
      _lastKey = ctx.entryKey || '';
      // 自定义文字跟随新条目, 但用户手改过就不再覆盖 (避免自动切换吃掉输入)
      if (!_customTextDirty) state.customText = defaultCustomText(kind);
      state.shiftValue = 0;
      state.shiftRange = null;
      state.furnPick = -1;
      state.furnEditSel = null;
      state.invSlot = 0;
    }
    if (c.scene && c.scene !== 'auto') state.scene = c.scene;
    else if (sceneDefs(kind).map(function (d) { return d.id; }).indexOf(state.scene) === -1) {
      state.scene = defaultScene(kind);
    }
    win.setTitle(t('preview.windowTitle', 'MC 场景预览') + (ctx.entryKey ? ' — ' + ctx.entryKey : ''));
    // 场景集合可能变了 (物品 → 字体图像), 标签要重建; 勾选框与文字框回写 state
    buildSceneTabs();
    syncControls();
    render();
    return win;
  }

  // follow() 后把 state 回写到已存在的 DOM 控件上 (与 open() 的全量重建等价)
  function syncControls() {
    if (!win || !win.body) return;
    var body = win.body;
    var setChecked = function (id, v) { var e = body.querySelector(id); if (e) e.checked = !!v; };
    setChecked('#pv-tags', state.resolveMiniMessage);
    setChecked('#pv-cetags', state.resolveCeTags);
    setChecked('#pv-globals', state.resolveGlobals);
    setChecked('#pv-images', state.resolveImages);
    setChecked('#pv-shadow', state.shadow);
    setChecked('#pv-uni', state.fontMode === 'unicode');
    setChecked('#pv-dark', state.dark);
    var txt = body.querySelector('#pv-text');
    if (txt && !_customTextDirty) txt.value = state.customText || '';
    var use = body.querySelector('#pv-usetext');
    if (use) use.checked = state.useCustomText === true;
  }

  // ---------------- 独立窗口模式: 就地挂载 ----------------
  // 与 open() 共用同一套面板/渲染逻辑, 区别只是「窗口」换成一个页面内的宿主元素。
  // 这样独立窗口里没有嵌套的 WindowManager 窗口, 面板直接铺满整个 OS 窗口。
  function mount(hostEl, c) {
    if (!hostEl) return null;
    ctx = c || {};
    var kind = contentKind(ctx);
    _lastKey = ctx.entryKey || '';
    state.customText = defaultCustomText(kind);
    _customTextDirty = false;
    if (c && c.scene && c.scene !== 'auto') state.scene = c.scene;
    else if (sceneDefs(kind).map(function (d) { return d.id; }).indexOf(state.scene) === -1) {
      state.scene = defaultScene(kind);
    }
    hostEl.innerHTML = '';
    var content = document.createElement('div');
    content.className = 'pv-content';
    content.innerHTML = panelHtml();
    hostEl.appendChild(content);
    // 伪装成一个 WindowManager 句柄: 面板内部大量代码用 win.body / win.setTitle / onResize
    var fake = {
      _closed: false,
      el: hostEl,
      body: content,
      setTitle: function () { return fake; },
      onResize: function () { return fake; },
      close: function () { fake._closed = true; win = null; els = {}; },
      isMaximized: function () { return false; },
    };
    win = fake;
    bind();
    render();
    if (state.refreshMode === 'disk') startDiskWatch();
    return fake;
  }
  function unmount() {
    stopDiskWatch();
    if (win && win._closed !== undefined) win._closed = true;
    win = null; els = {};
    _furnDrag = null; _furnDragged = false;
    _handleDrag = null;
  }

  function close() { if (win && !win._closed) win.close(); }

  // ---------------- 独立窗口 ----------------
  // 把「当前正在看的东西」交给独立的 OS 窗口渲染。ctx 直接可结构化克隆 (纯数据),
  // 所以能原样丢给主进程再转给那个窗口。
  function payloadFor() {
    if (!ctx) return null;
    // mcRoot 让独立窗口自己也能加载贴图 (它是独立渲染上下文, 不共享主窗口的缓存)
    var mcRoot = null;
    try {
      if (root.CEMCAssets && root.CEMCAssets.getState) {
        var st = root.CEMCAssets.getState();
        mcRoot = (st && (st.mcRoot || st.assetRoot)) || null;
      }
    } catch (e) { mcRoot = null; }
    return {
      file: ctx.file || null,
      section: ctx.section || null,
      sectionBase: ctx.sectionBase || null,
      entryKey: ctx.entryKey || null,
      data: ctx.data || null,
      scene: state.scene || null,
      mcRoot: mcRoot,
    };
  }
  function detach() {
    var api = root.electronAPI && root.electronAPI.preview;
    if (!api) return false;
    var p = payloadFor();
    // 已经有独立窗口就先关掉再开, 保证内容和当前面板一致
    Promise.resolve(api.isWindowOpen()).then(function (o) {
      var open = !!(o && (o.open !== undefined ? o.open : o));
      return open ? api.closeWindow() : null;
    }).then(function () {
      return api.openWindow(p);
    }).catch(function () { /* ignore */ });
    return true;
  }
  function isDetached() {
    var api = root.electronAPI && root.electronAPI.preview;
    if (!api) return false;
    try { return !!api.isWindowOpen(); } catch (e) { return false; }
  }
  // 面板内容变化时同步给独立窗口 (场景切换/状态切换/勾选项都要跟过去)。
  // 也可以由外部直接塞一个 ctx (自动切换预览在「只有独立窗口开着」时走这条路)。
  function pushToDetached(forceCtx) {
    // 独立窗口里的面板自己 render 时不要回推 (主进程会把旧 payload 再广播回来,
    // 迟到的回声会把窗口里刚收到的新条目覆盖回旧的)
    if (root.__cePreviewStandalone) return;
    var api = root.electronAPI && root.electronAPI.preview;
    if (!api) return;
    var c = forceCtx || ctx;
    if (!c) return;
    var keep = ctx;
    if (forceCtx) ctx = forceCtx;   // payloadFor() 读 ctx, 临时换上去
    var p = payloadFor();
    if (forceCtx) ctx = keep;
    if (p) { try { api.updateWindow(p); } catch (e) { /* ignore */ } }
  }
  function refresh() { if (win && !win._closed) render(); }
  function isOpen() { return !!(win && !win._closed); }

  // ---------------- 从磁盘读取刷新 ----------------
  // 三态: 'editor' = 跟随编辑器内存数据 (默认, 走 follow/refresh);
  //       'disk'   = 定时轮询磁盘文件, 有变化就重新解析并刷新预览;
  //       'off'    = 不自动刷新, 只能用 ⟳ 手动重载。
  var _diskWatch = null;
  function setRefreshMode(mode) {
    state.refreshMode = (mode === 'disk' || mode === 'off') ? mode : 'editor';
    if (state.refreshMode === 'disk') startDiskWatch(); else stopDiskWatch();
    return state.refreshMode;
  }
  function stopDiskWatch() {
    if (_diskWatch && _diskWatch.timer) clearInterval(_diskWatch.timer);
    _diskWatch = null;
  }
  function startDiskWatch() {
    stopDiskWatch();
    if (!ctx || !ctx.file) return;
    _diskWatch = { file: ctx.file, stamp: null, timer: null, busy: false };
    var tick = async function () {
      var w = _diskWatch;
      if (!w || w.busy) return;
      if (!win || win._closed) { stopDiskWatch(); return; }
      if (!root.electronAPI || !root.electronAPI.readFile) return;
      w.busy = true;
      try {
        var res = await root.electronAPI.readFile(w.file);
        var text = res && res.success ? res.content : null;
        if (typeof text !== 'string') return;
        if (w.stamp === null) { w.stamp = text; return; }   // 首次只记基线
        if (text === w.stamp) return;
        w.stamp = text;
        await reloadFromDisk(text);
      } catch (e) { /* 文件暂时读不到: 下一轮再试 */ }
      finally { if (w) w.busy = false; }
    };
    _diskWatch.timer = setInterval(tick, 1000);
    tick();
  }
  // 用磁盘上的原文重新解析出当前条目, 再刷新预览
  async function reloadFromDisk(text) {
    var CI = root.CraftEngineInterpreter;
    if (!CI || !CI.parse) return;
    var parsed = null;
    try { parsed = CI.parse(text); } catch (e) { return; }
    if (!parsed || !parsed.sections) return;
    var sec = null;
    for (var i = 0; i < parsed.sections.length; i++) {
      var s = parsed.sections[i];
      if (ctx.sectionBase ? s.base === ctx.sectionBase : s.key === ctx.section) { sec = s; break; }
    }
    if (!sec) return;
    var ent = null;
    for (var j = 0; j < sec.entries.length; j++) {
      if (sec.entries[j].key === ctx.entryKey) { ent = sec.entries[j]; break; }
    }
    if (!ent) return;   // 条目被外部删掉了, 保留旧画面
    ctx.data = ent.data;
    setStatus(t('preview.diskReloaded', '已从磁盘重新读取'), '');
    render();
  }

  root.CEPreviewPanel = {
    open: open, close: close, refresh: refresh, follow: follow,
    isOpen: isOpen, setRefreshMode: setRefreshMode,
    mount: mount, unmount: unmount,
    detach: detach, isDetached: isDetached, pushToDetached: pushToDetached,
    getState: function () { return state; },
    // 诊断/测试: 条目图标解析 (model.path 优先于 material 的规则在这里)
    resolveEntryIcon: resolveEntryIcon,
  };
})();
