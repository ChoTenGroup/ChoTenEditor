/* ChoTenEditor CraftEngine 配置诊断引擎
 * 依赖: window.CESchemas (可选, 缺失时只做通用检查), window.CEMCAssets (可选),
 *       window.CraftEngineInterpreter (可选, 仅用于 SECTION_KEYS)
 *
 * 严重级别 (对齐 IDEA Inspections):
 *   ERROR      配置一定不合法 / 插件会拒绝或报错
 *   WARN       很可能有问题, 但存在合法特例
 *   WEAK_WARN  可以更好 / 冗余 / 风格问题 (IDEA 的 Weak Warning)
 *   INFO       提示性信息 (版本要求、付费功能、可用增强)
 *
 * 对外 API:
 *   CEDiagnostics.SEVERITY
 *   CEDiagnostics.analyze(parsed, ctx)      -> Issue[]
 *   CEDiagnostics.analyzeYaml(content, filePath) -> Issue[]   仅语法层 (源码模式)
 *   CEDiagnostics.lineOf(content, key, subKey) -> number     文本行定位 (1-based, 0 = 未知)
 *   CEDiagnostics.counts(issues)           -> {ERROR,WARN,WEAK_WARN,INFO,total}
 *   CEDiagnostics.setProjectData({globals, images, emojis})
 *   CEDiagnostics.setOptions({hidePremiumHints})  设置页开关注入 (隐藏付费版提示)
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (root.CEDiagnostics) return;

  var SEV = { ERROR: 'ERROR', WARN: 'WARN', WEAK_WARN: 'WEAK_WARN', INFO: 'INFO' };
  var SEV_ORDER = { ERROR: 0, WARN: 1, WEAK_WARN: 2, INFO: 3 };

  // 与 craftengine-interpreter.js 的 TYPE_SECTIONS 保持一致
  var TYPE_SECTIONS = {
    items: 'item', blocks: 'block', furniture: 'furniture', recipes: 'recipe',
    equipments: 'equipment', images: 'image', categories: 'category', sounds: 'sound',
    emoji: 'emoji', jukebox_songs: 'jukeboxSong', paintings: 'painting',
    global_variables: 'globalVariable', translations: 'translation', lang: 'lang',
    loot_sources: 'lootSource', placed_features: 'placedFeature', templates: 'template',
  };
  var KEY_ONLY_SECTIONS = { global_variables: 1, translations: 1, lang: 1 };
  // CraftEngine 认可的顶层段 (含源码里的别名), 用于 unknownSection 判定
  var KNOWN_SECTIONS = [
    'items', 'blocks', 'furniture', 'recipes', 'equipments', 'images', 'emoji',
    'categories', 'global_variables', 'jukebox_songs', 'loot_sources', 'paintings',
    'sounds', 'translations', 'placed_features', 'templates', 'lang', 'config',
    // 源码 ConfigKeys 里存在但编辑器未做可视化的段
    'entities', 'attributes', 'equipment_sets', 'attribute_operations', 'damage_rules',
    'advancements', 'configured_features', 'block_state_mappings', 'loots', 'particles',
    'entity', 'attribute', 'equipment_set', 'attribute_operation', 'damage_rule',
    'advancement', 'configured_feature', 'block_state_mapping', 'loot',
    'translation', 'l10n', 'localization', 'i18n', 'internationalization', 'language', 'languages',
    'sound', 'jukebox_song', 'painting', 'category', 'template', 'loot_source', 'vanilla_loot',
    'placed_feature', 'item', 'block', 'equipment', 'recipe', 'image', 'emojis',
  ];
  var SECTION_KEYS = ['items', 'blocks', 'furniture', 'recipes', 'equipments', 'images', 'emoji',
    'categories', 'global_variables', 'jukebox_songs', 'loot_sources', 'paintings',
    'sounds', 'translations', 'placed_features', 'templates', 'lang'];

  // 版本限制字段 (与 interpreter 的 _sfVersionRe 同源)
  var VERSION_RE = /(?:1\.\d{1,2}(?:\.\d{1,2})?(?:\.x)?[-+]|\d{1,2}\.x[-+])/gi;

  var _projectData = { globals: {}, images: {}, emojis: {} };
  var _issueSeq = 0;

  // 设置开关: 可由宿主显式注入, 缺失时回退到设置页写入的 body class
  var _opts = { hidePremiumHints: false };

  /** 设置页开关注入 (hidePremiumHints 等) */
  function setOptions(o) {
    if (!o) return;
    if (o.hidePremiumHints !== undefined) _opts.hidePremiumHints = o.hidePremiumHints === true;
  }

  function _bodyHas(cls) {
    try {
      return !!(root.document && root.document.body && root.document.body.classList
        && root.document.body.classList.contains(cls));
    } catch (e) { return false; }
  }

  /** 「隐藏付费版功能提示」是否生效 (显式设置或 body class 任一为真) */
  function premiumHintsHidden() {
    return _opts.hidePremiumHints === true || _bodyHas('ce-hide-premium-hints');
  }

  // config.yml 的顶层分组名 (与数据段同名: emoji / item / block / furniture / image / recipe ...)
  var CONFIG_GROUPS = ['metrics', 'update-checker', 'forced-locale', 'storage', 'resource-pack',
    'item', 'equipment', 'block', 'furniture', 'emoji', 'entity', 'image', 'network', 'recipe',
    'attribute', 'damage-indicator', 'gui', 'chunk-system', 'client-optimization', 'scripting',
    'misc', 'debug'];

  // 该文件是否是 config.yml 这类「配置分组」文件 (与条目文件同名段会冲突, 必须区分)
  function isConfigLikeFile(parsed, file) {
    if (parsed && parsed._isConfig) return true;
    var base = file ? String(file).replace(/\\/g, '/').split('/').pop().toLowerCase() : '';
    if (base === 'config.yml' || base === 'config.yaml') return true;
    var hit = 0;
    var roots = [];
    (parsed && parsed.sections || []).forEach(function (s) { roots.push(s.base); });
    Object.keys((parsed && parsed._fileLevelRaw) || {}).forEach(function (k) { roots.push(String(k).replace(/#.*$/, '')); });
    roots.forEach(function (r) { if (CONFIG_GROUPS.indexOf(r) !== -1) hit++; });
    var hasEntryLike = false;
    (parsed && parsed.sections || []).forEach(function (s) {
      (s.entries || []).forEach(function (e) { if (ID_RE.test(e.key)) hasEntryLike = true; });
    });
    // 命中多个配置分组名, 且没有任何 ns:path 形式的条目 → 视为配置文件
    return hit >= 3 && !hasEntryLike;
  }
  // 文件路径是否明确位于 CE 数据目录 (此时条目语义可信)
  function fileLooksLikeCEData(file) {
    if (!file) return false;
    var p = String(file).replace(/\\/g, '/');
    return /\/configurations?\//.test(p) || /\/resources\/[^/]+\//.test(p);
  }
  // 文档文件 (.md/.mdx) 里的 YAML 只是示例片段, 不做条目级校验
  function isDocFile(file) {
    return !!file && /\.mdx?$/i.test(String(file));
  }

  // CE 源码 AutoStateGroup.java 的真实取值 + 未写入 wiki 的别名
  var AUTO_STATE_GROUPS = [
    'solid', 'note_block', 'mushroom_stem', 'red_mushroom_block', 'brown_mushroom_block',
    'mushroom', 'tintable_leaves', 'waterlogged_tintable_leaves',
    'non_tintable_leaves', 'no_tint_leaves', 'leaves_no_tint',
    'waterlogged_non_tintable_leaves', 'waterlogged_no_tint_leaves', 'waterlogged_leaves_no_tint',
    'leaves', 'waterlogged_leaves', 'lower_tripwire', 'higher_tripwire', 'tripwire',
    'sapling', 'pressure_plate', 'cactus', 'sugar_cane',
    'weeping_vines', 'weeping_vine', 'twisting_vines', 'twisting_vine',
    'cave_vines', 'cave_vine', 'kelp', 'chorus',
  ];
  // CE Properties.java 注册的方块状态属性类型 (含未写入 wiki 的 4-direction / 6-direction / bed_part)
  var BLOCK_PROPERTY_TYPES = [
    'boolean', 'int', 'string', 'axis', 'horizontal_direction', '4-direction', 'direction',
    '6-direction', 'single_block_half', 'double_block_half', 'hinge', 'stairs_shape',
    'slab_type', 'sofa_shape', 'anchor_type', 'bed_part',
  ];
  // 顶层段别名 → 规范名 (CE 用 ConfigKeys.of 接受多个名字, 但写规范名更清晰)
  var SECTION_ALIAS = {    item: 'items', equipment: 'equipments', block: 'blocks',
    block_state_mapping: 'blocks', entity: 'entities', entities: 'entities',
    image: 'images', emoji: 'emoji', emojis: 'emoji',
    global_variable: 'global_variables', recipe: 'recipes',
    loot: 'loot_sources', loot_source: 'loot_sources', vanilla_loot: 'loot_sources',
    category: 'categories', categories: 'categories', template: 'templates',
    sound: 'sounds', jukebox_song: 'jukebox_songs', painting: 'paintings',
    translation: 'translations', l10n: 'translations', localization: 'translations',
    i18n: 'translations', internationalization: 'translations',
    language: 'lang', languages: 'lang',
  };
  // 被 CE 接受的别名 (非规范写法) → 提示规范化
  var NON_CANONICAL = {
    item: 1, equipment: 1, block: 1, image: 1, emoji: 1, emojis: 1,
    global_variable: 1, recipe: 1, category: 1, template: 1, sound: 1,
    jukebox_song: 1, painting: 1, translation: 1, l10n: 1, localization: 1,
    i18n: 1, internationalization: 1, language: 1, languages: 1,
    loot_source: 1, vanilla_loot: 1, block_state_mapping: 1,
  };

  // ---------------- 工具 ----------------
  function t(key, fb, params) {
    try {
      if (root.I18N && typeof root.I18N.t === 'function') {
        var v = root.I18N.t(key, params);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    if (fb && params) {
      fb = String(fb).replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; });
    }
    return fb != null ? fb : key;
  }
  function schemas() { return (typeof root.CESchemas !== 'undefined') ? root.CESchemas : null; }
  function assets() { return root.CEMCAssets || null; }
  function labelOf(l) {
    if (l == null) return '';
    if (typeof l === 'string') return l;
    var lang = (root.I18N && root.I18N.lang) || 'zh_cn';
    return lang === 'en_us' ? (l.en || l.zh || '') : (l.zh || l.en || '');
  }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isVersionKey(k) { return /^\$\$[^$]+$/.test(String(k)); }
  function isWrap(v) { return v !== null && typeof v === 'object' && typeof v.__ceTag === 'string'; }
  function unwrap(v) { return isWrap(v) ? v.v : v; }
  // ns:path 形式的 ID
  var ID_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
  function isId(v) { return typeof v === 'string' && ID_RE.test(v); }
  function splitId(v) {
    var i = String(v).indexOf(':');
    return i === -1 ? { ns: '', path: String(v) } : { ns: String(v).slice(0, i), path: String(v).slice(i + 1) };
  }

  // ---------------- 内部资源包豁免 ----------------
  // CraftEngine 自己生成的资源包放在 resources/internal 下, 并占用 internal / craftengine 命名空间。
  // 这些命名空间不在用户扫描到的资源包里属于正常现象, 不提示。
  var INTERNAL_NAMESPACES = { internal: 1, craftengine: 1 };
  function isInternalPath(filePath) {
    var p = String(filePath || '').replace(/\\/g, '/');
    if (!p) return false;
    var parts = p.split('/');
    for (var i = 0; i < parts.length - 1; i++) { // 末段是文件名, 不参与判断
      var seg = parts[i];
      if (seg === 'internal' || seg.indexOf('internal_') === 0) return true;
    }
    return false;
  }
  /** 内部包 + 内部命名空间 → 跳过「命名空间不在资源包中」提示 */
  function isInternalNamespaceRef(filePath, ns) {
    return INTERNAL_NAMESPACES[ns] === 1 && isInternalPath(filePath);
  }

  // ---------------- Issue 构造 ----------------
  function make(severity, code, message, ctx) {
    var c = ctx || {};
    return {
      id: 'ce-diag-' + (++_issueSeq),
      severity: severity,
      code: code,
      message: message,
      hint: c.hint || null,
      section: c.section || null,   // 顶层 section key (items/blocks/...)
      entry: c.entry || null,       // 条目 ID
      group: c.group || null,       // $$ 版本组
      path: c.path || null,         // 条目内的字段路径
      key: c.key || null,           // 出问题的键名
      file: c.file || null,
      line: c.line || 0,
    };
  }

  // 字段是否属于某个路径前缀 (用于判定规则作用域)
  function pathHas(path, seg) {
    if (!path) return false;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) if (parts[i] === seg) return true;
    return false;
  }
  function pathEndsWith(path, seg) {
    if (!path) return false;
    var parts = String(path).split('.');
    return parts[parts.length - 1] === seg;
  }

  // ---------------- 资源/引用检查 ----------------
  // 当资源索引可用时, 校验 minecraft: 命名空间下的 ID 是否存在
  var REGISTRY_FOR_PATH = [
    { re: /(^|\.)(sound|equip_sound|break_sound|place_sound|hit_sound|step_sound|fall_sound|land_sound|open_sound|close_sound|insert_sound|remove_sound)$/i, list: 'soundEvents', label: '音效事件' },
    { re: /(^|\.)particle$/i, list: 'particles', label: '粒子' },
    { re: /(^|\.)enchantment$/i, list: 'enchantments', label: '魔咒' },
    { re: /(^|\.)potion_effect$/i, list: 'potionEffects', label: '状态效果' },
    { re: /(^|\.)biome$/i, list: 'biomes', label: '生物群系' },
    // 纹理/模型允许资源包自定义, 只做 INFO 提示
    { re: /(^|\.)(item_model|model_path)$/i, list: 'models', label: '模型', textureOk: true, infoOnly: true },
    { re: /(^|\.)texture$/i, list: 'textures', label: '纹理', infoOnly: true },
    { re: /(^|\.)(material|item|icon)$/i, list: 'items', label: '物品' },
  ];

  function checkRegistryRef(value, path, emit, ctx) {
    var a = assets();
    if (!a || !a.status || a.status().state !== 'ready') return;
    if (typeof value !== 'string' || !isId(value)) return;
    var s = splitId(value);
    if (s.ns !== 'minecraft') return; // 其他命名空间来自工程/其他插件, 不能判定
    for (var i = 0; i < REGISTRY_FOR_PATH.length; i++) {
      var rule = REGISTRY_FOR_PATH[i];
      if (!rule.re.test(path)) continue;
      // 纹理/模型: 资源包可以自由添加 minecraft: 命名空间下的自定义路径,
      // 编辑器无法知道用户装了哪些资源包 → 只给 INFO 提示, 不算问题
      if (rule.infoOnly) {
        if (/^(?:block|item)\/custom\//.test(s.path)) return;
        var probeI = 'minecraft:' + s.path;
        var listI = a.listFor(rule.list);
        if (!listI || !listI.length || listI.indexOf(probeI) !== -1) return;
        if (rule.textureOk) {
          var texI = a.listFor('textures');
          if (texI && texI.indexOf(probeI) !== -1) return;
        }
        emit(SEV.INFO, 'vanillaRefNotFound', t('diagnostics.vanillaRefNotFound',
          '原版资源索引中没有 {id}（若它来自其它资源包，可忽略）', { id: value }), ctx, path);
        return;
      }
      var list = a.listFor(rule.list);
      if (!list || !list.length) return;
      var probe = 'minecraft:' + s.path;
      if (list.indexOf(probe) !== -1) return;
      // 唱片/音乐类音效事件大多没有 subtitle, 字幕表里查不到 → 不报
      if (rule.list === 'soundEvents' && /^music[./]/.test(s.path)) return;
      emit(SEV.WARN, 'unknownRef', t('diagnostics.unknownRef',
        '未知的{label} ID: {id}（原版注册表中未找到）', { label: rule.label, id: value }), ctx, path);
      return;
    }
  }

  // CE 文本标签引用检查: <global:xxx> / <image:ns:xxx> / <i18n:xxx>
  // 注意 lang/translate 属于 MiniMessage 的翻译标签, 不是 CE 标签, 不要在这里当成 CE 引用检查
  var TAG_RE = /<(global|image|i18n|l10n):([^<>\s]+)>/g;
  function checkTextRefs(text, path, emit, ctx) {
    if (typeof text !== 'string' || text.indexOf('<') === -1) return;
    var m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) {
      var kind = m[1];
      var arg = m[2];
      if (kind === 'global') {
        var gid = arg.split(':')[0];
        if (gid && Object.keys(_projectData.globals).length && !_projectData.globals[gid]) {
          emit(SEV.WARN, 'unknownGlobal', t('diagnostics.unknownGlobal',
            '未定义的全局变量 <global:{id}>', { id: gid }), ctx);
        }
      } else if (kind === 'image') {
        var parts = arg.split(':');
        var iid = parts.length >= 2 ? parts[0] + ':' + parts[1] : null;
        if (!iid) continue;
        if (Object.keys(_projectData.images).length && !_projectData.images[iid]) {
          emit(SEV.WARN, 'unknownImage', t('diagnostics.unknownImage',
            '未定义的图片 <image:{id}>（images 段中不存在）', { id: iid }), ctx);
        } else if (_projectData.images[iid]) {
          // 单元格索引检查
          if (parts.length >= 4) {
            var row = parseInt(parts[2], 10), col = parseInt(parts[3], 10);
            var grid = gridOf(_projectData.images[iid]);
            if (grid && (isNaN(row) || isNaN(col) || row < 0 || col < 0 || row >= grid.rows || col >= grid.cols)) {
              emit(SEV.ERROR, 'imageCellOutOfRange', t('diagnostics.imageCellOutOfRange',
                '图片单元格越界: {id} 的网格为 {rows} 行 × {cols} 列，但引用了第 {row} 行第 {col} 列',
                { id: iid, rows: grid.rows, cols: grid.cols, row: parts[2], col: parts[3] }), ctx);
            }
          }
        }
      }
    }
  }
  function gridOf(img) {
    if (!img || typeof img !== 'object') return null;
    if (typeof img.grid_size === 'string') {
      var g = img.grid_size.split(/[,x×\s]+/).filter(Boolean).map(Number);
      if (g.length >= 2 && g[0] > 0 && g[1] > 0) return { rows: g[0], cols: g[1] };
    }
    if (Array.isArray(img.chars) && img.chars.length) {
      var cols = String(img.chars[0]).length;
      return { rows: img.chars.length, cols: cols };
    }
    return null;
  }

  // ---------------- 通用字段校验 ----------------
  function fieldKeys(fields) {
    var map = Object.create(null);
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f || !f.key) continue;
      map[f.key] = f;
      var alt = f.key.indexOf('_') !== -1 ? f.key.replace(/_/g, '-') : f.key.replace(/-/g, '_');
      if (alt !== f.key) map[alt] = f;
    }
    return map;
  }

  function checkField(fld, value, path, emit, ctx, depth) {
    if (!fld || depth > 12) return;
    var type = fld.type || 'text';
    var label = labelOf(fld.label) || fld.key || t('diagnostics.someField', '该字段');
    var v = unwrap(value);

    if (v === undefined || v === null) return;
    // 文档/模板里的占位值 "..." 不参与形状校验
    if (v === '...') return;

    if (type === 'number') {
      if (typeof v !== 'number' && isNaN(parseFloat(v))) {
        emit(SEV.ERROR, 'notNumber', t('diagnostics.notNumber', '“{label}”需要数字，当前为 {value}', { label: label, value: JSON.stringify(v) }), ctx);
      }
      return;
    }
    if (type === 'bool') {
      if (typeof v !== 'boolean' && v !== 'true' && v !== 'false') {
        emit(SEV.WARN, 'notBool', t('diagnostics.notBool', '“{label}”应为 true/false，当前为 {value}', { label: label, value: JSON.stringify(v) }), ctx);
      }
      return;
    }
    if (type === 'select') {
      var opts = fld.options || [];
      var found = false;
      for (var i = 0; i < opts.length; i++) {
        var ov = (opts[i] !== null && typeof opts[i] === 'object') ? opts[i].v : opts[i];
        if (String(ov) === String(v)) { found = true; break; }
      }
      if (!found && opts.length) {
        emit(SEV.WEAK_WARN, 'notInOptions', t('diagnostics.notInOptions',
          '“{label}”的值 {value} 不在编辑器列出的推荐取值内（CraftEngine 也接受其它取值）', { label: label, value: JSON.stringify(v) }), ctx);
      }
      return;
    }
    if (type === 'lines' || type === 'linesScalar') {
      if (isPlainObject(v)) {
        emit(SEV.WEAK_WARN, 'expectList', t('diagnostics.expectList', '“{label}”通常是字符串列表，当前是键值映射', { label: label }), ctx);
      }
      var arr = Array.isArray(v) ? v : [v];
      for (var j = 0; j < arr.length; j++) checkTextRefs(arr[j], path, emit, ctx);
      return;
    }
    if (type === 'listOf') {
      // CraftEngine 的 getList 也接受单个元素 (标量/映射) 的简写形式
      if (!Array.isArray(v)) {
        if (fld.itemType && (isPlainObject(v) || typeof v === 'string')) {
          checkField(fld.itemType, v, path + '.0', emit, ctx, depth + 1);
        } else if (fld.itemType) {
          checkField(fld.itemType, v, path + '.0', emit, ctx, depth + 1);
        }
        return;
      }
      for (var k = 0; k < v.length; k++) {
        if (fld.itemType) checkField(fld.itemType, v[k], path + '.' + k, emit, ctx, depth + 1);
      }
      return;
    }
    if (type === 'mapOf') {
      if (!isPlainObject(v)) {
        // 单个键值对以外的形态: 只提示, 不当作错误
        emit(SEV.WEAK_WARN, 'expectMap', t('diagnostics.expectMap', '“{label}”通常是键值映射，当前为 {actual}', { label: label, actual: shapeName(v) }), ctx);
        return;
      }
      var keys = Object.keys(v);
      for (var m = 0; m < keys.length; m++) {
        if (fld.valueType) checkField(fld.valueType, v[keys[m]], path + '.' + keys[m], emit, ctx, depth + 1);
      }
      return;
    }
    if (type === 'object') {
      if (!isPlainObject(v)) {
        emit(SEV.WEAK_WARN, 'expectMap', t('diagnostics.expectMap', '“{label}”通常是键值映射，当前为 {actual}', { label: label, actual: shapeName(v) }), ctx);
        return;
      }
      walkFields(v, fld.fields || [], path, emit, ctx, depth + 1);
      return;
    }
    if (type === 'union') {
      // behaviors: [ {type: ...}, {type: ...} ] 这种「复数键 = 列表」的写法
      if (Array.isArray(v)) {
        for (var ui = 0; ui < v.length; ui++) {
          checkUnion(fld, v[ui], path + '.' + ui, emit, ctx, depth);
        }
        return;
      }
      checkUnion(fld, v, path, emit, ctx, depth);
      return;
    }
    if (type === 'kv' || type === 'kvRest') {
      // 编辑器把这一类字段渲染成 key: value 文本域; CE 侧通常是映射或列表, 两种都接受
      if (isPlainObject(v)) {
        var kvKeys = Object.keys(v);
        for (var ki = 0; ki < kvKeys.length; ki++) {
          checkTextRefs(v[kvKeys[ki]], path + '.' + kvKeys[ki], emit, ctx);
        }
      } else {
        collectStrings(v, path, function (txt, p) { checkTextRefs(txt, p, emit, ctx); });
      }
      return;
    }
    if (type === 'components') {
      if (!isPlainObject(v)) {
        emit(SEV.WARN, 'expectMap', t('diagnostics.expectMap', '“{label}”应为键值映射', { label: label }), ctx);
        return;
      }
      scanSubtree(v, path, emit, ctx);
      return;
    }
    if (type === 'popup') {
      // popup 内可能有嵌套 content 字段
      if (fld.content) {
        var cd = (typeof fld.content === 'function') ? fld.content() : fld.content;
        if (cd) checkField(cd, v, path, emit, ctx, depth + 1);
      }
      scanSubtree(v, path, emit, ctx);
      return;
    }
    if (type === 'tabs') {
      // 选项卡容器: 逐 tab 用其 widget 渲染同一个值, 键名不可靠 → 只做子树引用扫描
      scanSubtree(v, path, emit, ctx);
      return;
    }
    if (type === 'model' || type === 'events' || type === 'json' || type === 'wholes') {
      scanSubtree(v, path, emit, ctx);
      return;
    }
    // 编辑器 schema 未建模的 widget 类型: 只做子树引用扫描, 不做形状判断
    if (['union', 'listOf', 'mapOf', 'object', 'components', 'popup', 'tabs',
      'model', 'events', 'json', 'text', 'textarea', 'miniText', 'lines', 'linesScalar',
      'kv', 'kvRest', 'scalar', 'string-scalar', 'select', 'number', 'bool',
      'wholeText', 'kvWhole'].indexOf(type) === -1) {
      scanSubtree(v, path, emit, ctx);
      return;
    }

    // 文本类: 只有「键值映射」才提示 (CE 很多文本字段也接受字符串列表, 不报)
    if (isPlainObject(v)) {
      emit(SEV.WEAK_WARN, 'expectScalar', t('diagnostics.expectScalar',
        '“{label}”在编辑器 schema 中是文本，当前为 {actual}', { label: label, actual: shapeName(v) }), ctx);
      return;
    }
    if (Array.isArray(v)) {
      for (var ai = 0; ai < v.length; ai++) checkTextRefs(v[ai], path + '.' + ai, emit, ctx);
      return;
    }
    checkTextRefs(v, path, emit, ctx);
    checkRegistryRef(v, path, emit, ctx);
  }
  function shapeName(v) {
    if (Array.isArray(v)) return t('diagnostics.shapeList', '列表');
    if (isPlainObject(v)) return t('diagnostics.shapeMap', '键值映射');
    if (typeof v === 'string') return t('diagnostics.shapeText', '文本');
    if (typeof v === 'number') return t('diagnostics.shapeNumber', '数字');
    if (typeof v === 'boolean') return t('diagnostics.shapeBool', '布尔值');
    return typeof v;
  }

  function checkUnion(fld, v, path, emit, ctx, depth) {
    var types = fld.types;
    if (typeof types === 'function') { try { types = types(); } catch (e) { types = null; } }
    if (!types) return;
    var typeName = null;
    var hasTypeKey = false;
    var inferred = false;
    if (!fld.noTypeKey && isPlainObject(v)) {
      if (v.type !== undefined) { typeName = unwrap(v.type); hasTypeKey = true; }
    }
    if (fld.noTypeKey) {
      // 形状推断优先 (string/list/map 等), 推断结果不在 types 里时才回退到对象内的 type 键
      var shapeName2 = null;
      if (typeof v === 'string') shapeName2 = 'string';
      else if (Array.isArray(v)) shapeName2 = 'list';
      else if (isPlainObject(v)) shapeName2 = 'map';
      if (shapeName2 && types[shapeName2]) {
        typeName = shapeName2;
        inferred = true;
      } else if (isPlainObject(v) && typeof unwrap(v.type) === 'string') {
        typeName = unwrap(v.type);
        hasTypeKey = true;
      } else if (shapeName2) {
        typeName = shapeName2;
        inferred = true;
      }
    }
    // CE 通过 Key.ce(type) 读取, 默认命名空间为 craftengine, 也接受显式命名空间
    var rawType = typeName == null ? null : String(typeName);
    var bareType = rawType == null ? null : rawType.replace(/^(?:craftengine|minecraft):/, '');
    if (!hasTypeKey && !fld.noTypeKey && fld.allowScalar === undefined && fld.defaultKey === undefined) {
      // 该 union 需要 type, 但文件里没写 (CE 通常用 getNonEmptyString("type") 读取)
      if (isPlainObject(v) && Object.keys(v).length > 0) {
        emit(SEV.WARN, 'typeMissing', t('diagnostics.typeMissing',
          '缺少 “type” 字段（CraftEngine 通常需要一个类型标识）'), ctx, path, 'type');
      }
      return;
    }
    if (rawType == null) return;
    // negatable: !type
    var neg = false;
    if (bareType.charAt(0) === '!') { neg = true; bareType = bareType.slice(1); }
    var td = types[bareType];
    if (!td && bareType !== rawType) td = types[rawType];
    if (!td) {
      // 形状推断出来的名字 (map/list/string) 没命中 → 该 union 不是这种建模方式, 不报
      if (inferred) return;
      // CraftEngine 源码里注册过这个类型标识 → 属于编辑器 schema 遗漏, 不报
      if (ceKnowsType(bareType)) return;
      if (!fld.allowScalar && !(fld.noTypeKey && typeof v === 'string' && types.string)) {
        emit(SEV.WARN, 'unknownType', t('diagnostics.unknownType',
          '未识别的类型 “{type}”：CraftEngine 的类型注册表中没有它', { type: rawType }), ctx, path, 'type');
      }
      return;
    }
    if (neg) return;
    if (td.widget) { checkField(td.widget, v, path, emit, ctx, depth + 1); return; }
    if (td.fields && isPlainObject(v)) {
      // 关键: type 是判别键, 不属于类型体; sharedKeys 是切换类型时保留的公共键
      walkFields(v, td.fields, path, emit, ctx, depth + 1, skipKeysOf(fld, hasTypeKey));
    }
  }
  // 遍历某个 union 类型体时需要忽略的键 (判别键 + sharedKeys)
  function skipKeysOf(fld, hasTypeKey) {
    var skip = Object.create(null);
    if (hasTypeKey) skip.type = 1;
    if (fld && Array.isArray(fld.sharedKeys)) {
      for (var i = 0; i < fld.sharedKeys.length; i++) skip[fld.sharedKeys[i]] = 1;
    }
    return skip;
  }
  // CE 源码 ConfigKeys.of(...) 提供的别名组 (ce-cekeys.js)
  function ceKeys() {
    return (typeof root.CECeKeys !== 'undefined') ? root.CECeKeys : null;
  }
  var _ceNameSet = null;
  function ceNameSet() {
    if (_ceNameSet) return _ceNameSet;
    var k = ceKeys();
    _ceNameSet = Object.create(null);
    if (k && Array.isArray(k.names)) {
      for (var i = 0; i < k.names.length; i++) _ceNameSet[normalizeKey(k.names[i])] = 1;
    }
    return _ceNameSet;
  }
  function normalizeKey(s) { return String(s).toLowerCase().replace(/-/g, '_'); }
  // 该键名 CraftEngine 是否真的会读取 (源码确认过)
  function ceKnowsKey(k) { return ceNameSet()[normalizeKey(k)] === 1; }
  // 该「类型标识」CraftEngine 是否注册过 (行为/设置/渲染器等)
  var _ceTypeSet = null;
  function ceTypeSet() {
    if (_ceTypeSet) return _ceTypeSet;
    var c = ceKeys();
    _ceTypeSet = Object.create(null);
    if (c && Array.isArray(c.typeIds)) {
      for (var i = 0; i < c.typeIds.length; i++) _ceTypeSet[String(c.typeIds[i]).toLowerCase()] = 1;
    }
    return _ceTypeSet;
  }
  function ceKnowsType(t) {
    if (typeof t !== 'string' || !t) return false;
    return ceTypeSet()[t.replace(/^(?:craftengine|minecraft):/, '').toLowerCase()] === 1;
  }
  // 取某个键名在 CE 里的全部别名 (含自身)
  function ceAliases(k) {
    var c = ceKeys();
    var n = normalizeKey(k);
    if (c && c.aliasOf && c.aliasOf[n]) return c.aliasOf[n];
    return [n];
  }

  // 遍历一层对象的键, 校验未知键与已知字段
  function walkFields(data, fields, path, emit, ctx, depth, skip) {
    if (!isPlainObject(data)) return;
    var known = fieldKeys(fields);
    // root-map (如 equipments 的层名) 的键由用户自由定义, 不做 unknownKey 判定
    var freeKeys = false;
    for (var fi = 0; fi < fields.length; fi++) {
      if (fields[fi] && fields[fi].custom === 'root-map') { freeKeys = true; break; }
    }
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (isVersionKey(k)) continue;
      if (skip && skip[k]) continue;
      var fld = known[k];
      if (!fld && k.indexOf('_') !== -1) fld = known[k.replace(/_/g, '-')];
      if (!fld && k.indexOf('-') !== -1) fld = known[k.replace(/-/g, '_')];
      // schema 未收录, 但 CE 在别处用到过该键的别名 → 用别名对应的 schema 字段来校验
      if (!fld) {
        var aliases = ceAliases(k);
        for (var a = 0; a < aliases.length; a++) {
          if (known[aliases[a]]) { fld = known[aliases[a]]; break; }
          var dashed = aliases[a].replace(/_/g, '-');
          if (known[dashed]) { fld = known[dashed]; break; }
        }
      }
      var sub = path ? path + '.' + k : k;
      if (!fld) {
        if (freeKeys) {
          collectStrings(data[k], sub, function (txt, p) { checkTextRefs(txt, p, emit, ctx); });
          continue;
        }
        // CE 源码里确实会读取这个键名 → 只是编辑器 schema 未收录, 不报错
        if (ceKnowsKey(k)) {
          collectStrings(data[k], sub, function (txt, p) { checkTextRefs(txt, p, emit, ctx); });
          continue;
        }
        emit(SEV.WEAK_WARN, 'unknownKey', t('diagnostics.unknownKey',
          '未识别的键 “{key}”：CraftEngine 的键名注册表中没有它，编辑器 schema 也没有；若为自定义/扩展字段可忽略',
          { key: k }), ctx, sub, k);
        // 仍然对未知键做文本引用检查
        collectStrings(data[k], sub, function (txt, p) { checkTextRefs(txt, p, emit, ctx); });
        continue;
      }
      checkField(fld, data[k], sub, emit, ctx, depth);
    }
  }

  function collectStrings(v, path, cb) {
    if (typeof v === 'string') { cb(v, path); return; }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) collectStrings(v[i], path + '.' + i, cb); return; }
    if (isPlainObject(v)) {
      var ks = Object.keys(v);
      for (var j = 0; j < ks.length; j++) collectStrings(v[ks[j]], path + '.' + ks[j], cb);
    }
  }

  // 无法按 schema 逐键校验的容器 (tabs/components/model/events/popup):
  // 退化为「子树引用扫描」—— 检查全部字符串里的 CE 标签引用 + 按路径末段做原版 ID 校验。
  // 不产生 unknownKey, 避免误报。
  function scanSubtree(v, path, emit, ctx) {
    collectStrings(v, path, function (txt, p) {
      checkTextRefs(txt, p, emit, ctx);
      checkRegistryRef(txt, p, emit, ctx);
    });
    walkPath(v, path, function (p, val) {
      if (typeof val === 'string' && p !== path) {
        checkRegistryRef(val, p, emit, ctx);
      }
    });
  }

  // ---------------- 分区专属规则 ----------------
  var PREMIUM_KEYS = ['client_bound_data', 'client_bound_material', 'visual_result', 'functions',
    'entity_culling', 'client-bound-model', 'client-bound-data', 'client-bound-material'];
  var LEGACY_KEYS = { model: 'item_model', blockstate: 'block_state' };

  function sectionRules(section, entry, emit, ctx) {
    var data = entry.data;
    if (!isPlainObject(data)) return;
    var base = section.base;
    var file = ctx.file;

    // ---- 通用: 付费 / 版本 / 弃用 ----
    walkKeyInfo(data, '', function (k, p, v) {
      if (PREMIUM_KEYS.indexOf(k) !== -1 && !premiumHintsHidden()) {
        emit(SEV.INFO, 'premium', t('diagnostics.premium',
          '“{key}”为付费版专属功能', { key: k }), ctx, p, k);
      }
      if (LEGACY_KEYS[k] && data[LEGACY_KEYS[k]] !== undefined) {
        emit(SEV.WEAK_WARN, 'legacyKey', t('diagnostics.legacyKey',
          '“{key}”是旧键，新写法为 “{new}”，两者同时存在可能产生冲突', { key: k, new: LEGACY_KEYS[k] }), ctx, p, k);
      }
      if (typeof v === 'string') {
        var vm = v.match(VERSION_RE);
        if (vm && vm.length) { /* 字段值里出现版本号不是问题，跳过 */ }
      }
    });

    if (base === 'items') {
      // 未设置 material 会回落到 config.yml 的默认材质, 属于正常用法, 不再提示
    }

    if (base === 'images') {
      var isRef = data.ref !== undefined;
      if (!isRef && (data.file === undefined || data.file === '')) {
        emit(SEV.ERROR, 'imageFileRequired', t('diagnostics.imageFileRequired',
          'images 条目缺少 file（或改用 ref 引用已有图片）'), ctx, 'file');
      }
      var h = Number(unwrap(data.height));
      var a = Number(unwrap(data.ascent));
      if (!isNaN(h) && !isNaN(a) && h < a) {
        emit(SEV.ERROR, 'imageHeightAscent', t('diagnostics.imageHeightAscent',
          'height({h}) 必须 ≥ ascent({a})，Minecraft 会拒绝该字体定义', { h: h, a: a }), ctx, 'height');
      }
      if (data.grid_size !== undefined) {
        var g = gridOf(data);
        if (!g) {
          emit(SEV.ERROR, 'badGridSize', t('diagnostics.badGridSize',
            'grid_size 格式应为 “行,列”（如 2,3）'), ctx, 'grid_size');
        }
      }
      if (Array.isArray(data.chars) && data.chars.length > 1) {
        var len0 = String(data.chars[0]).length;
        for (var ci = 1; ci < data.chars.length; ci++) {
          if (String(data.chars[ci]).length !== len0) {
            emit(SEV.ERROR, 'charsRowMismatch', t('diagnostics.charsRowMismatch',
              'chars 每行长度必须一致（第 1 行为 {n} 个字符，第 {row} 行为 {m} 个）',
              { n: len0, row: ci + 1, m: String(data.chars[ci]).length }), ctx, 'chars');
            break;
          }
        }
      }
      if (data.file !== undefined) {
        var fp = String(unwrap(data.file)).replace(/^[a-z0-9_.-]+:/, '');
        if (/\.png$/i.test(fp) === false) {
          emit(SEV.INFO, 'imageFileExt', t('diagnostics.imageFileExt',
            'file 未带 .png 扩展名，插件会自动补全'), ctx, 'file');
        }
      }
    }

    if (base === 'emoji') {
      // 使用模板时 keywords/content 由模板 + overrides 提供, 不必写在条目上
      var ov = isPlainObject(data.overrides) ? data.overrides : null;
      var usesTemplate = data.template !== undefined || data.templates !== undefined;
      var hasKw = data.keywords !== undefined || (ov && ov.keywords !== undefined);
      var partialOnly = data.content_overrides !== undefined && !hasKw && !usesTemplate && !ov;
      if (!hasKw && !usesTemplate && !ov && !partialOnly) {
        emit(SEV.WEAK_WARN, 'emojiKeywords', t('diagnostics.emojiKeywords',
          'emoji 条目没有 keywords，玩家无法用关键词触发它'), ctx, 'keywords');
      }
      var hasContent = data.image !== undefined || data.content !== undefined ||
        data.template !== undefined || data.overrides !== undefined ||
        data.content_overrides !== undefined;
      if (!hasContent) {
        emit(SEV.WEAK_WARN, 'emojiContent', t('diagnostics.emojiContent',
          'emoji 条目既没有 image 也没有 content/template，将不会有任何显示内容'), ctx);
      }
      if (data.content_overrides !== undefined && isPlainObject(data.content_overrides)) {
        var VALID_SCENES = ['chat', 'book', 'anvil', 'sign', 'command'];
        Object.keys(data.content_overrides).forEach(function (k) {
          if (VALID_SCENES.indexOf(k) === -1) {
            emit(SEV.WEAK_WARN, 'emojiScene', t('diagnostics.emojiScene',
              '编辑器未收录的场景名 “{scene}”（常见: chat/book/anvil/sign/command）', { scene: k }), ctx, 'content_overrides', 'content_overrides');
          }
        });
      }
    }

    if (base === 'blocks') {
      var st = unwrap(data.state);
      var auto = st && st.auto_state;
      if (auto !== undefined) {
        var autoName = isPlainObject(unwrap(auto)) ? unwrap(auto).type : unwrap(auto);
        var groups = (schemas() && schemas().constants && schemas().constants.autoStateGroups) || [];
        var known = groups.concat(AUTO_STATE_GROUPS);
        if (autoName != null && known.indexOf(String(autoName)) === -1) {
          emit(SEV.ERROR, 'badAutoState', t('diagnostics.badAutoState',
            'auto_state 组名 “{name}” 不存在（CE 会忽略该状态组）', { name: autoName }), ctx, 'state.auto_state', 'auto_state');
        }
        if (isPlainObject(unwrap(auto)) && unwrap(auto).id === undefined) {
          emit(SEV.INFO, 'autoStateId', t('diagnostics.autoStateId',
            '展开形式的 auto_state 建议同时提供 id，否则每个方块会各占一组状态'), ctx, 'state.auto_state', 'auto_state');
        }
      }
      // 方块状态属性类型
      var props = st && st.properties;
      if (Array.isArray(props)) {
        props.forEach(function (p, pi) {
          var pu = unwrap(p);
          if (!isPlainObject(pu)) return;
          var pt = unwrap(pu.type);
          if (pt === undefined) {
            emit(SEV.ERROR, 'propTypeMissing', t('diagnostics.propTypeMissing',
              '方块状态属性缺少 type（CE 会抛出 unknown_type）'), ctx, 'state.properties.' + pi + '.type', 'type');
          } else if (BLOCK_PROPERTY_TYPES.indexOf(String(pt)) === -1) {
            emit(SEV.ERROR, 'propTypeUnknown', t('diagnostics.propTypeUnknown',
              '未知的方块状态属性类型 “{type}”（可用: {list}）', { type: pt, list: BLOCK_PROPERTY_TYPES.join(', ') }),
              ctx, 'state.properties.' + pi + '.type', 'type');
          } else if (String(pt) === 'string' && pu.values === undefined) {
            emit(SEV.WARN, 'propStringValues', t('diagnostics.propStringValues',
              'string 类型的属性需要提供 values 列表'), ctx, 'state.properties.' + pi + '.values', 'values');
          } else if (String(pt) === 'int' && pu.range === undefined) {
            emit(SEV.WEAK_WARN, 'propIntRange', t('diagnostics.propIntRange',
              'int 类型的属性建议提供 range（如 0~15）'), ctx, 'state.properties.' + pi + '.range', 'range');
          }
        });
      }
      if (st && st.model && st.model.rotation !== undefined) {
        var rot = Number(unwrap(st.model.rotation));
        if (!isNaN(rot) && rot % 90 !== 0) {
          emit(SEV.ERROR, 'rotationStep', t('diagnostics.rotationStep',
            'rotation {v} 不是 90 的整数倍（CE 只接受 90/180/270）', { v: rot }), ctx, 'state.model.rotation', 'rotation');
        }
      }
    }

    if (base === 'recipes') {
      if (Array.isArray(data.pattern) && data.pattern.length > 1) {
        var w0 = String(data.pattern[0]).length;
        for (var pi = 1; pi < data.pattern.length; pi++) {
          if (String(data.pattern[pi]).length !== w0) {
            emit(SEV.ERROR, 'patternRowMismatch', t('diagnostics.patternRowMismatch',
              'pattern 每行长度必须一致（第 1 行 {n} 列，第 {row} 行 {m} 列）',
              { n: w0, row: pi + 1, m: String(data.pattern[pi]).length }), ctx, 'pattern');
            break;
          }
        }
        // ingredients 中的键必须出现在 pattern 里
        var ings = data.ingredients;
        if (isPlainObject(ings)) {
          var used = Object.create(null);
          data.pattern.forEach(function (row) {
            String(row).split('').forEach(function (ch) { if (ch !== ' ') used[ch] = 1; });
          });
          Object.keys(ings).forEach(function (k) {
            var kk = String(k);
            // 支持 A/B/C 与 'A ' 之类写法
            var chars = kk.replace(/\s/g, '').split('');
            var hit = chars.some(function (c) { return used[c]; });
            if (!hit) {
              emit(SEV.WARN, 'ingredientUnused', t('diagnostics.ingredientUnused',
                'ingredients 中的键 “{key}” 未出现在 pattern 中，该原料不会被使用', { key: k }), ctx, 'ingredients.' + k, k);
            }
          });
        }
      }
      if (data.type === undefined) {
        emit(SEV.WARN, 'recipeTypeMissing', t('diagnostics.recipeTypeMissing', '配方缺少 type'), ctx, 'type');
      }
      if (data.result === undefined && data.functions === undefined && data.type !== 'replace') {
        emit(SEV.WEAK_WARN, 'recipeResultMissing', t('diagnostics.recipeResultMissing', '配方没有 result'), ctx, 'result');
      }
    }

    if (base === 'categories') {
      if (data.icon === undefined) {
        emit(SEV.WEAK_WARN, 'categoryIcon', t('diagnostics.categoryIcon',
          '分类未设置 icon，菜单中将没有图标'), ctx, 'icon');
      }
    }

    if (base === 'equipments') {
      if (data.type === undefined) {
        emit(SEV.WARN, 'equipmentType', t('diagnostics.equipmentType',
          '装备缺少 type（component / trim）'), ctx, 'type');
      }
    }

    // ---- 逐路径的专属规则 ----
    var isBlockish = (base === 'blocks' || base === 'furniture');
    // 翻译/语言/全局变量段里空字符串是合法内容
    var isTextTable = (base === 'translations' || base === 'lang' || base === 'global_variables');
    walkPath(data, '', function (p, v) {
      // destroy_stages.brightness 需要 block_light 与 sky_light 同时存在 (仅方块/家具)
      if (isBlockish && /\.brightness$/.test(p) && isPlainObject(v)) {
        if (v.block_light === undefined || v.sky_light === undefined) {
          emit(SEV.ERROR, 'brightnessIncomplete', t('diagnostics.brightnessIncomplete',
            'brightness 必须同时提供 block_light 与 sky_light，否则该项无效'), ctx, p);
        }
      }
      // 空字符串值通常是误删留下的 (翻译/语言段、列表元素里的空串是有意义的)
      var lastSeg = p ? p.split('.').pop() : '';
      var inList = /^\d+$/.test(lastSeg);
      if (v === '' && !inList && !/\.(password|key)$/i.test(p) && !isTextTable) {
        emit(SEV.WEAK_WARN, 'emptyValue', t('diagnostics.emptyValue',
          '“{key}”是空字符串，等同于未设置', { key: lastSeg || p }), ctx, p);
      }
    });

    if (file) { /* 保留 */ }
  }

  function walkKeyInfo(v, path, cb) {
    if (!isPlainObject(v)) return;
    var ks = Object.keys(v);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (isVersionKey(k)) continue;
      var sub = path ? path + '.' + k : k;
      cb(k, sub, unwrap(v[k]));
      walkKeyInfo(unwrap(v[k]), sub, cb);
    }
  }
  function walkPath(v, path, cb) {
    cb(path, unwrap(v));
    var u = unwrap(v);
    if (Array.isArray(u)) {
      for (var i = 0; i < u.length; i++) walkPath(u[i], path + '.' + i, cb);
    } else if (isPlainObject(u)) {
      var ks = Object.keys(u);
      for (var j = 0; j < ks.length; j++) {
        if (isVersionKey(ks[j])) continue;
        walkPath(u[ks[j]], path ? path + '.' + ks[j] : ks[j], cb);
      }
    }
  }

  // ---------------- 入口 ----------------
  /**
   * @param {object} parsed CraftEngineInterpreter.parse() 的结果
   * @param {object} ctx    {file}
   * @returns {object[]} Issue[]
   */
  function analyze(parsed, ctx) {
    var out = [];
    var c0 = ctx || {};
    _issueSeq = 0;
    function emit(severity, code, message, c, path, key) {
      var cc = {};
      for (var k in c0) if (Object.prototype.hasOwnProperty.call(c0, k)) cc[k] = c0[k];
      if (c) {
        if (c.section != null) cc.section = c.section;
        if (c.entry != null) cc.entry = c.entry;
        if (c.group != null) cc.group = c.group;
      }
      if (path != null) cc.path = path;
      if (key != null) cc.key = key;
      out.push(make(severity, code, message, cc));
    }

    if (!parsed) return out;

    // 文件级: YAML 语法
    if (parsed.error) {
      out.push(make(SEV.ERROR, 'yamlSyntax', t('diagnostics.yamlSyntax',
        'YAML 语法错误: {msg}', { msg: parsed.error }), { file: c0.file }));
      return out;
    }
    if (parsed._strippedTags) {
      out.push(make(SEV.WARN, 'strippedTags', t('diagnostics.strippedTags',
        '文件中有 {n} 处未知的 !! 类型标签，已被忽略（该标签不是 CraftEngine 支持的）', { n: parsed._strippedTags }),
        { file: c0.file }));
    }

    // 顶层 section 检查
    var knownSections = KNOWN_SECTIONS;
    var configLike = isConfigLikeFile(parsed, c0.file);
    if (configLike || isDocFile(c0.file)) {
      // config.yml 的顶层键是配置分组, 文档文件里的 YAML 只是示例片段 —— 都不做顶层段校验
    } else {
      Object.keys(parsed._fileLevelRaw || {}).forEach(function (k) {
        var base = String(k).replace(/#.*$/, '');
        if (knownSections.indexOf(base) !== -1) return;
        if (NON_CANONICAL[base]) {
          out.push(make(SEV.WEAK_WARN, 'aliasSection', t('diagnostics.aliasSection',
            '顶层段 “{key}” 是别名写法，CraftEngine 能识别，但编辑器与规范写法为 “{canon}”',
            { key: k, canon: SECTION_ALIAS[base] || base }), { file: c0.file, key: k }));
          return;
        }
        out.push(make(SEV.WEAK_WARN, 'unknownSection', t('diagnostics.unknownSection',
          '未收录的顶层段 “{key}”，CraftEngine 可能不会读取它', { key: k }), { file: c0.file, key: k }));
      });
    }

    // 条目检查 (config.yml 的同名分组不是数据段, 跳过)
    var cmdSeen = Object.create(null);
    var sectionsToCheck = (configLike || isDocFile(c0.file)) ? [] : (parsed.sections || []);
    sectionsToCheck.forEach(function (sec) {
      var typeKey = TYPE_SECTIONS[sec.base];
      var schema = (schemas() && schemas().sections) ? schemas().sections[typeKey] : null;
      // 先判断这个 section 是否「整体不是条目表」(子表说明/片段), 避免逐条刷 ERROR
      var idOkCount = 0, idBad = [];
      sec.entries.forEach(function (entry) {
        if (KEY_ONLY_SECTIONS[sec.base]) { idOkCount++; return; }
        if (ID_RE.test(entry.key)) idOkCount++; else idBad.push(entry);
      });
      // 明确位于 CE 数据目录时条目语义可信; 否则要求至少有一个合法条目才报 ID 错误
      var sectionLooksLikeEntries = fileLooksLikeCEData(c0.file) || idOkCount > 0;

      sec.entries.forEach(function (entry) {
        var ectx = {
          file: c0.file, section: sec.key, entry: entry.key, group: entry._group || null,
          sectionBase: sec.base,
        };
        // 条目 ID 格式
        if (KEY_ONLY_SECTIONS[sec.base]) {
          if (!/^[a-zA-Z0-9_.-]+$/.test(entry.key)) {
            emit(SEV.ERROR, 'badEntryId', t('diagnostics.badEntryId',
              '条目 ID “{id}” 含非法字符（只允许字母/数字/下划线/连字符/点）', { id: entry.key }), ectx);
          }
        } else if (!ID_RE.test(entry.key)) {
          // 只有「看起来就是条目表」且内容确实是配置对象时才报 (排除文档里的子表说明)
          if (sectionLooksLikeEntries && isPlainObject(entry.data)) {
            emit(SEV.ERROR, 'badEntryId', t('diagnostics.badEntryIdNs',
              '条目 ID “{id}” 不是合法的 namespace:path 形式', { id: entry.key }), ectx);
          }
        } else {
          var nsAssets = assets();
          if (nsAssets && nsAssets.status && nsAssets.status().state === 'ready') {
            var eid = splitId(entry.key);
            if (eid.ns !== 'minecraft' && nsAssets.namespaces().indexOf(eid.ns) === -1
                && nsAssets.namespaces().length && !isInternalNamespaceRef(c0.file, eid.ns)) {
              emit(SEV.INFO, 'unknownNamespace', t('diagnostics.unknownNamespace',
                '命名空间 “{ns}” 不在当前扫描到的资源包中', { ns: eid.ns }), ectx);
            }
          }
        }

        if (!isPlainObject(entry.data)) {
          if (typeof entry.data !== 'string') {
            emit(SEV.WARN, 'entryNotMap', t('diagnostics.entryNotMap',
              '条目内容不是键值映射，CraftEngine 需要一个配置对象'), ectx);
          }
        } else if (schema) {
          // schema 校验 (wholeValue 类型不适用)
          if (!schema.wholeValue) {
            walkFields(entry.data, schema.fields || [], '', emit, ectx, 0);
          }
        }

        // 分区专属规则
        if (isPlainObject(entry.data)) {
          try { sectionRules(sec, entry, emit, ectx); } catch (e) { /* 单条规则异常不影响整体 */ }
        }

        // 同文件 custom_model_data 重复
        if (sec.base === 'items' && isPlainObject(entry.data)) {
          var cmd = unwrap(entry.data.custom_model_data);
          if (typeof cmd === 'number' || (typeof cmd === 'string' && /^\d+$/.test(cmd))) {
            var key = String(cmd);
            if (cmdSeen[key]) {
              emit(SEV.WARN, 'cmdDuplicate', t('diagnostics.cmdDuplicate',
                'custom_model_data {n} 与条目 “{other}” 重复，两者会渲染成同一模型',
                { n: key, other: cmdSeen[key] }), ectx, 'custom_model_data', 'custom_model_data');
            } else {
              cmdSeen[key] = entry.key;
            }
          }
        }
      });

      if (!sec.entries.length && !parsed._isConfig) {
        out.push(make(SEV.INFO, 'emptySection', t('diagnostics.emptySection',
          '段 “{key}” 为空', { key: sec.key }), { file: c0.file, section: sec.key }));
      }
    });

    // 排序: 严重级别优先, 然后按 section/entry
    out.sort(function (a, b) {
      var d = (SEV_ORDER[a.severity] || 9) - (SEV_ORDER[b.severity] || 9);
      if (d) return d;
      return String(a.section + '/' + a.entry + '/' + a.path).localeCompare(String(b.section + '/' + b.entry + '/' + b.path));
    });
    // 去重 (同 severity+code+section+entry+path+key)
    var seen = Object.create(null);
    var dedup = [];
    for (var i = 0; i < out.length; i++) {
      var it = out[i];
      var k = [it.severity, it.code, it.section, it.entry, it.path, it.key, it.message].join('|');
      if (seen[k]) continue;
      seen[k] = 1;
      dedup.push(it);
    }
    return dedup;
  }

  /** 仅做 YAML 语法层检查 (源码模式, 或未渲染可视化时) */
  function analyzeYaml(content, filePath) {
    var out = [];
    if (typeof content !== 'string') return out;
    if (typeof root.jsyaml === 'undefined' && typeof YAML === 'undefined') return out;
    var Y = root.jsyaml || root.YAML;
    try {
      Y.load(content);
    } catch (e) {
      var line = 0;
      var m = /at line (\d+), column (\d+)/.exec(String(e.message || ''));
      if (m) line = parseInt(m[1], 10);
      if (!line) {
        var m2 = /line (\d+)/i.exec(String(e.message || ''));
        if (m2) line = parseInt(m2[1], 10);
      }
      out.push(make(SEV.ERROR, 'yamlSyntax',
        t('diagnostics.yamlSyntax', 'YAML 语法错误: {msg}', { msg: e.message }), { file: filePath, line: line }));
    }
    var tabs = /^[\t ]*\t/m.exec(content);
    if (tabs) {
      var ln = content.slice(0, tabs.index).split('\n').length;
      out.push(make(SEV.ERROR, 'yamlTab', t('diagnostics.yamlTab',
        'YAML 不允许使用 Tab 缩进，请改用空格'), { file: filePath, line: ln }));
    }
    var dupIndent = /^( *)([A-Za-z0-9_.:-]+):/gm;
    return out;
  }

  function counts(issues) {
    var c = { ERROR: 0, WARN: 0, WEAK_WARN: 0, INFO: 0, total: 0 };
    (issues || []).forEach(function (i) { if (c[i.severity] != null) c[i.severity]++; c.total++; });
    return c;
  }

  /** 文本行定位: 在 content 中查找 key, 再在其后查找 subKey; 找不到返回 0 */
  function lineOf(content, key, subKey) {
    if (typeof content !== 'string' || !key) return 0;
    var lines = content.split('\n');
    var keyRe = new RegExp('^\\s*("?\\.?' + escapeRe(String(key).replace(/^.*\//, '')) + '"?\\s*:)');
    var start = -1;
    for (var i = 0; i < lines.length; i++) {
      if (keyRe.test(lines[i])) { start = i; break; }
    }
    if (start === -1) {
      // 退化为包含匹配 (条目 ID 可能带引号)
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].indexOf(key) !== -1) { start = j; break; }
      }
    }
    if (start === -1) return 0;
    if (!subKey) return start + 1;
    var leaf = String(subKey).split('.').pop();
    if (leaf === String(subKey)) {
      // 整个 path 可能是带点的键
    }
    var subRe = new RegExp('^\\s*"?\\.?' + escapeRe(leaf) + '"?\\s*:');
    for (var m = start + 1; m < lines.length; m++) {
      var s = lines[m];
      if (/^\S/.test(s) && m > start + 1 && !/^\s/.test(s)) break; // 新顶层键, 停止
      if (subRe.test(s)) return m + 1;
    }
    return start + 1;
  }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function setProjectData(d) {
    _projectData = {
      globals: (d && d.globals) || {},
      images: (d && d.images) || {},
      emojis: (d && d.emojis) || {},
    };
  }

  root.CEDiagnostics = {
    SEVERITY: SEV,
    SEV_ORDER: SEV_ORDER,
    analyze: analyze,
    analyzeYaml: analyzeYaml,
    counts: counts,
    lineOf: lineOf,
    setProjectData: setProjectData,
    setOptions: setOptions,
    TYPE_SECTIONS: TYPE_SECTIONS,
  };
})();
