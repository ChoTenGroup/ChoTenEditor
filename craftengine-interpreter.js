/* ChoTenEditor CraftEngine (CE) 配置可视化编辑器
 * 依赖: js-yaml (jsyaml 全局), I18N, playSound, window.codeMirrorEditor, window.updateStatus
 * CE 配置特征: 顶层集合键 (items:/blocks:/furniture:/recipes:/...) + namespace:path 条目, 无顶层 type 字段
 * 分段键 items#0: / items#extra_item: 同文件多段合并; :: 扁平嵌套; $$ 版本条件键
 * !!type 值 (!!long/!!IntArray 等) 解析为包装对象 {__ceTag, v}, 渲染时解包显示, 写回时恢复前缀
 * 已知限制 (与 chemdah 一致): 同步为全文件重建, 注释与引号风格丢失
 */
(function () {
  'use strict';
  var ROOT = typeof window !== 'undefined' ? window : globalThis;
  var YAML = (typeof jsyaml !== 'undefined') ? jsyaml : require('js-yaml');

  function _t(key, params) {
    return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(key, params) : key;
  }
  // 带兜底文案的 i18n (字典尚未加载/缺键时使用 fallback, 并自行做 {x} 插值)
  function _tf(key, fallback, params) {
    var v = null;
    try {
      if (typeof I18N !== 'undefined' && I18N.t) {
        v = I18N.t(key);
        if (v === key) v = null;
      }
    } catch (e) { v = null; }
    if (v == null) v = fallback != null ? fallback : key;
    if (params) {
      v = String(v).replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; });
    }
    return v;
  }
  function _sound(name) {
    try { if (typeof playSound === 'function') playSound(name); } catch (e) {}
  }
  function _escHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _safeJsonStringify(val) {
    try { return JSON.stringify(val); } catch (e) { return '[Circular or unserializable data]'; }
  }

  // ============ 常量 ============
  var SECTION_KEYS = [
    'items', 'blocks', 'furniture', 'recipes', 'equipments', 'images', 'emoji',
    'categories', 'global_variables', 'jukebox_songs', 'loot_sources', 'paintings',
    'sounds', 'translations', 'placed_features', 'templates', 'lang',
  ];
  // 条目类型: 决定表单分支; 未列出的 section 走通用 JSON 编辑
  var TYPE_SECTIONS = {
    items: 'item', blocks: 'block', furniture: 'furniture', recipes: 'recipe',
    equipments: 'equipment', images: 'image', categories: 'category', sounds: 'sound',
    emoji: 'emoji', jukebox_songs: 'jukeboxSong', paintings: 'painting',
    global_variables: 'globalVariable', translations: 'translation', lang: 'lang',
    loot_sources: 'lootSource', placed_features: 'placedFeature', templates: 'template',
  };
  // 条目键不带 namespace:path 的 section（新建/重命名用单 ID 输入）
  var KEY_ONLY_SECTIONS = { global_variables: 1, translations: 1, lang: 1 };
  var KEY_ONLY_RE = /^[a-zA-Z0-9_.-]+$/;
  var SECTION_BASE_RE = /^([A-Za-z0-9_]+)(#.*)?$/;
  var EQUIPMENT_TYPES = ['component', 'trim'];
  var EQUIPMENT_LAYERS = ['humanoid', 'humanoid_leggings', 'wings', 'wolf_body', 'horse_body', 'llama_body', 'pig_saddle', 'strider_saddle', 'camel_saddle', 'horse_saddle', 'donkey_saddle', 'mule_saddle', 'skeleton_horse_saddle', 'zombie_horse_saddle', 'happy_ghast_body', 'camel_husk_saddle', 'nautilus_body'];
  var LOOT_SOURCE_TYPES = ['block_break', 'entity_death', 'fishing', 'piglin_barter', 'container', 'archaeology', 'entity_drop', 'harvest', 'shear_block', 'vault', 'advancement'];
  var LOOT_OVERWRITE = ['none', 'items', 'experience', 'all'];
  // 使用选项卡分页表单的条目类型 (基础/模型/物品数据/行为/事件)
  var TABBED_TYPES = { item: 1, block: 1, furniture: 1 };
  var ITEM_BEHAVIOR_TYPES = [
    'item', 'block_item', 'ceiling_block_item', 'wall_block_item', 'ground_block_item',
    'double_high_block_item', 'multi_high_block_item', 'liquid_collision_block_item',
    'furniture_item', 'liquid_collision_furniture_item', 'compostable_item', 'range_mining_item',
  ];
  var BLOCK_BEHAVIOR_TYPES = [
    'crop_block', 'door_block', 'fence_block', 'stairs_block', 'slab_block', 'falling_block',
    'strippable_block', 'budding_block', 'button_block', 'trapdoor_block', 'pressure_plate_block',
    'seat_block', 'sofa_block', 'grass_block', 'spreading_block', 'sapling_block', 'stem_block',
    'bush_block', 'lamp_block', 'toggleable_lamp_block', 'decay_block', 'leaves_block',
    'snowy_block', 'concrete_powder_block', 'drop_experience_block', 'display_item_block',
    'simple_storage_block', 'liquid_flowable_block', 'near_liquid_block', 'on_liquid_block',
    'hangable_block', 'hanging_block', 'multi_high_block', 'double_high_block',
    'directional_attached_block', 'face_attached_horizontal_directional_block',
    'attached_stem_block', 'change_over_time_block', 'chime_block', 'drawer_block',
    'fence_gate_block', 'item_frame_block', 'simple_particle_block', 'stackable_block',
    'sturdy_base_block', 'surface_spreading_block', 'tint_source_block', 'vertical_crop_block',
    'wall_torch_particle_block', 'bouncing_block', 'drop_exp_block',
  ];
  var FURNITURE_BEHAVIOR_TYPES = ['simple_storage_furniture', 'glowing_furniture', 'display_item_furniture'];
  // 每个 behavior 的建模字段: [path, type] 或 [path, 'select', [options]]
  // type: text / number / bool / lines / select / json; 数据源: wiki i18n/zh-Hans behaviors 文档
  var BEHAVIOR_FIELDS = {
    // ---- block behaviors ----
    attached_stem_block: [['fruit', 'text'], ['stem', 'text']],
    bouncing_block: [['bounce_height', 'number'], ['fall_damage_multiplier', 'number'], ['sync_player_position', 'bool']],
    budding_block: [['growth_chance', 'number'], ['blocks', 'lines']],
    bush_block: [['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['bottom_blocks', 'lines'], ['bottom_block_tags', 'lines']],
    button_block: [['ticks_to_stay_pressed', 'number'], ['can_be_activated_by_arrows', 'bool'], ['sounds', 'json']],
    change_over_time_block: [['change_speed', 'number'], ['next_block', 'text'], ['excluded_properties', 'lines']],
    chime_block: [['sounds', 'json']],
    concrete_powder_block: [['solid_block', 'text']],
    crop_block: [['grow_speed', 'number'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['spawn_light_requirement', 'number'], ['max_spawn_light_requirement', 'number'], ['is_bone_meal_target', 'bool'], ['bone_meal_age_bonus', 'json']],
    decay_block: [['decay_into', 'text'], ['delay', 'text'], ['chance', 'number'], ['required_light', 'number']],
    directional_attached_block: [['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']],
    display_item_block: [['position', 'text'], ['has_signal', 'bool'], ['data_key', 'text'], ['tint_source', 'bool'], ['sounds', 'json']],
    door_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    drawer_block: [['max_stacks', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['item_position', 'text'], ['text_position', 'text'], ['item_scale', 'text'], ['text_scale', 'text'], ['data_key', 'text'], ['compatible_mode', 'bool'], ['sounds', 'json']],
    drop_exp_block: [['amount', 'text'], ['conditions', 'json']],
    drop_experience_block: [['amount', 'text'], ['conditions', 'json']],
    face_attached_horizontal_directional_block: [['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']],
    falling_block: [['hurt_amount', 'number'], ['max_hurt', 'number'], ['sounds', 'json']],
    fence_block: [['connectable_block_tag', 'text'], ['can_leash', 'bool']],
    fence_gate_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    grass_block: [['feature', 'text']],
    hanging_block: [['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['above_blocks', 'lines'], ['above_block_tags', 'lines']],
    item_frame_block: [['position', 'text'], ['glow', 'bool'], ['invisible', 'bool'], ['render_map_item', 'bool'], ['data_key', 'text'], ['sounds', 'json']],
    liquid_flowable_block: [['drop_item', 'bool']],
    multi_high_block: [['property', 'text']],
    near_liquid_block: [['liquid_type', 'lines'], ['stackable', 'bool'], ['positions', 'lines']],
    on_liquid_block: [['liquid_type', 'lines'], ['stackable', 'bool']],
    pressure_plate_block: [['sensitivity', 'select', ['all', 'mob']], ['pressed_time', 'number'], ['sounds', 'json']],
    sapling_block: [['feature', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['grow_speed', 'number'], ['bone_meal_success_chance', 'number']],
    seat_block: [['seats', 'lines']],
    simple_particle_block: [['tick_interval', 'number'], ['particles', 'json']],
    simple_storage_block: [['title', 'text'], ['rows', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['data_key', 'text'], ['sounds', 'json']],
    spreading_block: [['target_block', 'text']],
    stackable_block: [['property', 'text'], ['items', 'lines']],
    stem_block: [['fruit', 'text'], ['attached_stem', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['fruit_bottom_blocks', 'lines'], ['fruit_bottom_block_tags', 'lines']],
    strippable_block: [['stripped', 'text'], ['excluded_properties', 'lines'], ['tools', 'lines'], ['sound', 'text']],
    sturdy_base_block: [['direction', 'text'], ['support_types', 'lines'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number']],
    surface_spreading_block: [['light_requirement', 'number'], ['max_light_requirement', 'number'], ['base_block', 'text']],
    tint_source_block: [['drop_item', 'bool'], ['data_key', 'text']],
    toggleable_lamp_block: [['can_open_with_hand', 'bool']],
    trapdoor_block: [['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json']],
    vertical_crop_block: [['max_height', 'number'], ['grow_speed', 'number'], ['direction', 'select', ['up', 'down']]],
    wall_torch_particle_block: [['tick_interval', 'number'], ['particles', 'json']],
    // ---- item behaviors ----
    block_item: [['block', 'text']],
    ceiling_block_item: [['block', 'text']],
    compostable_item: [['chance', 'number']],
    double_high_block_item: [['block', 'text']],
    furniture_item: [['furniture', 'text'], ['rules', 'json'], ['ignore_placer', 'bool'], ['ignore_entities', 'bool']],
    ground_block_item: [['block', 'text']],
    liquid_collision_block_item: [['offset_y', 'number'], ['block', 'text']],
    liquid_collision_furniture_item: [['furniture', 'text'], ['rules', 'json'], ['ignore_placer', 'bool'], ['ignore_entities', 'bool'], ['source_only', 'bool'], ['liquid_type', 'lines']],
    multi_high_block_item: [['block', 'text']],
    range_mining_item: [['conditions', 'json'], ['range', 'lines']],
    wall_block_item: [['block', 'text']],
    // ---- furniture behaviors ----
    display_item_furniture: [['data_key', 'text'], ['sounds', 'json'], ['variants', 'json']],
    glowing_furniture: [['lights', 'json'], ['variants', 'json']],
    simple_storage_furniture: [['title', 'text'], ['rows', 'number'], ['data_key', 'text'], ['sounds', 'json']],
  };
  var RECIPE_TYPES = [
    'shaped', 'shapeless', 'shaped_transform', 'shapeless_transform', 'smelting', 'blasting',
    'smoking', 'campfire_cooking', 'stonecutting', 'smithing_transform', 'smithing_trim', 'brewing',
  ];
  var VETO_NAME_RE = /^pack\.ya?ml$/;
  var NS_RE = /^[a-z0-9_]+$/;
  var PATH_RE = /^[a-zA-Z0-9_./-]+$/;
  // CE config.yml 特有顶层键 (用于区分其它插件 config.yml; 经服务器实测至少需 2 个)
  var CE_CONFIG_KEYS_RE = /^[ \t]*(resource-pack|light-system|chunk-system|client-optimization|forced-locale)\s*:/gm;
  function _looksLikeCeConfig(fname, content) {
    if (!/^config\.ya?ml$/.test(fname)) return false;
    if (!/^[ \t]*config-version\s*:/m.test(content || '')) return false;
    var m = String(content || '').match(CE_CONFIG_KEYS_RE);
    return m !== null && m.length >= 2;
  }

  // ============ 检测 ============
  // 策略: 路径优先。CE 工程文件仅在 resources/<命名空间>/configuration(s)/ 目录内识别;
  // config.yml (插件配置) 高优先级单独识别。
  function detectFileType(content, filePath) {
    if (typeof content !== 'string' || !content.trim()) return 'unknown';
    var fpath = filePath ? String(filePath).replace(/\\/g, '/') : '';
    var fname = fpath.split('/').pop() || '';
    if (VETO_NAME_RE.test(fname)) return 'unknown';
    // CE 工程文件: 仅 resources/<namespace>/configuration(s)/ 目录内
    if (fpath) {
      var parts = fpath.split('/');
      for (var i = 0; i + 2 < parts.length; i++) {
        if (parts[i] === 'resources' && (parts[i + 2] === 'configuration' || parts[i + 2] === 'configurations')) {
          return 'craftengine';
        }
      }
    }
    // [高优先级] CE 插件 config.yml
    if (_looksLikeCeConfig(fname, content)) return 'craftengine';
    return 'unknown';
  }

  // ============ 工程根回溯（渲染层经 IPC） ============
  var _projectCache = Object.create(null); // dir -> Promise
  function resolveProjectRoot(filePath) {
    if (!filePath || !ROOT.electronAPI || !ROOT.electronAPI.ce) {
      return Promise.resolve({ found: false });
    }
    var dir = filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
    if (_projectCache[dir]) return _projectCache[dir];
    var p = ROOT.electronAPI.ce.resolveProjectRoot(filePath).catch(function () { return { found: false }; });
    if (Object.keys(_projectCache).length > 50) {
      var oldest = Object.keys(_projectCache)[0];
      delete _projectCache[oldest];
    }
    _projectCache[dir] = p;
    return p;
  }

  // ============ 工程级检测（打开项目目录时） ============
  // 仿 ChemdahInterpreter.detectProjectTypes: 在项目根一层内识别 CE 特征
  // 返回 { isCraftEngine, namespace: string|null }
  // 特征 (任一即命中):
  //   a) 子目录 resources/ 内任意 pack.yml (读头 4KB 校验 namespace: 字段) → 取该 namespace
  //   b) 根下 config.yml 含 config-version: 且同目录存在 mappings.yml|commands.yml|translations → 插件根特征
  var _projectTypesCache = { path: null, result: null };
  async function detectProjectTypes(projectPath) {
    var result = { isCraftEngine: false, namespace: null };
    if (!projectPath || typeof projectPath !== 'string') return result;
    if (!ROOT.electronAPI || !ROOT.electronAPI.readdir) return result;
    if (_projectTypesCache.path === projectPath && _projectTypesCache.result) return _projectTypesCache.result;

    var normPath = String(projectPath).replace(/\\/g, '/').replace(/\/+$/, '');
    var readHead = async function (p) {
      try {
        var r = await ROOT.electronAPI.readFile(p);
        if (r && r.success && typeof r.content === 'string') {
          return r.content.slice(0, 4096);
        }
      } catch (e) {}
      return '';
    };

    try {
      var entries = await ROOT.electronAPI.readdir(normPath);
      if (entries && entries.success && Array.isArray(entries.files)) {
        var names = {};
        for (var i = 0; i < entries.files.length; i++) names[entries.files[i].name] = entries.files[i];
        // b) 插件根特征 (config.yml + 版本键 + 兄弟特征); 版本键: 旧版 config-version:, 新版 ___version___:
        if (names['config.yml'] && !names['config.yml'].isDirectory) {
          var head = await readHead(normPath + '/config.yml');
          if (/^[\t ]*(config-version|___version___)\s*:/m.test(head) &&
              (names['mappings.yml'] || names['commands.yml'] || (names['translations'] && names['translations'].isDirectory))) {
            result.isCraftEngine = true;
          }
        }
        // a) resources/<pack>/... : pack.yml 可选 (缺失时按目录结构判定)。
        //    即使 b) 已命中 (插件根), 也继续扫 namespace —— b) 只证插件在, 不给命名空间。
        if (names['resources'] && names['resources'].isDirectory) {
          try {
            var resEntries = await ROOT.electronAPI.readdir(normPath + '/resources');
            if (resEntries && resEntries.success && Array.isArray(resEntries.files)) {
              for (var j = 0; j < resEntries.files.length; j++) {
                var packDir = resEntries.files[j];
                if (!packDir.isDirectory) continue;
                var packBase = normPath + '/resources/' + packDir.name;
                // a1) pack.yml 带 namespace: (最权威)
                var packHead = await readHead(packBase + '/pack.yml');
                var m = packHead.match(/^namespace:\s*(\S+)/m);
                if (m) {
                  result.isCraftEngine = true;
                  result.namespace = m[1];
                  break;
                }
                // a2) 无 pack.yml: 看包内是否有 configuration(s)/ 或 resourcepack/ 特征目录
                var packEntries = await ROOT.electronAPI.readdir(packBase);
                if (packEntries && packEntries.success && Array.isArray(packEntries.files)) {
                  var pkNames = {};
                  for (var k = 0; k < packEntries.files.length; k++) pkNames[packEntries.files[k].name] = packEntries.files[k];
                  var hasStruct = (pkNames['configuration'] && pkNames['configuration'].isDirectory) ||
                    (pkNames['configurations'] && pkNames['configurations'].isDirectory) ||
                    (pkNames['resourcepack'] && pkNames['resourcepack'].isDirectory);
                  if (hasStruct) {
                    result.isCraftEngine = true;
                    if (!result.namespace) result.namespace = packDir.name;
                    break;
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    _projectTypesCache = { path: projectPath, result: result };
    return result;
  }

  // ============ !!type 值包装 (configuration.mdx Expanded Value Structure) ============
  // 11 种 Java 类型 tag 注册到自定义 schema: 解析时构造包装对象 {__ceTag, v},
  // 渲染汇聚点 (_sfScalarText/_sfYvCtrl/...) 解包显示, 序列化汇聚点恢复 !!前缀
  function _ceIsWrap(v) { return v !== null && typeof v === 'object' && typeof v.__ceTag === 'string'; }
  function _ceUnwrap(v) { return _ceIsWrap(v) ? v.v : v; }
  var _ceSchema = null;
  function _ceYamlSchema() {
    if (_ceSchema) return _ceSchema;
    var scNum = function (name, conv) {
      return new YAML.Type('tag:yaml.org,2002:' + name, {
        kind: 'scalar', resolve: function () { return true; },
        construct: function (d) { return { __ceTag: name, v: conv(d) }; },
      });
    };
    var scSeq = function (name, conv) {
      return new YAML.Type('tag:yaml.org,2002:' + name, {
        kind: 'sequence', resolve: function () { return true; },
        construct: function (d) { return { __ceTag: name, v: conv(d) }; },
      });
    };
    var i32 = function (d) { var n = parseInt(String(d), 10); return isNaN(n) ? String(d) : n; };
    var f64 = function (d) { var n = parseFloat(String(d)); return isNaN(n) ? String(d) : n; };
    var arrN = function (fn) { return function (a) { return a.map(fn); }; };
    _ceSchema = YAML.DEFAULT_SCHEMA.extend({ explicit: [
      scNum('long', i32), scNum('float', f64), scNum('byte', i32), scNum('short', i32),
      scSeq('ByteArray', arrN(i32)), scSeq('IntArray', arrN(i32)), scSeq('LongArray', arrN(i32)),
      scSeq('DoubleArray', arrN(f64)), scSeq('IntList', arrN(i32)), scSeq('LongList', arrN(i32)),
      scSeq('DoubleList', arrN(f64)),
    ]});
    return _ceSchema;
  }

  // ============ 解析 ============
  function parse(content) {
    var doc = null;
    var strippedTags = 0;
    try {
      doc = YAML.load(content, { schema: _ceYamlSchema() });
    } catch (e) {
      if (/unknown tag/.test(String(e.message || e))) {
        var fixed = content.replace(/!![A-Za-z][A-Za-z0-9]* /g, function () { strippedTags++; return ''; });
        try { doc = YAML.load(fixed, { schema: _ceYamlSchema() }); } catch (e2) { return { error: e2.message || String(e2) }; }
      } else {
        return { error: e.message || String(e) };
      }
    }

    var parsed = {
      sections: [],
      _fileLevelRaw: {},
      _topOrder: [],
      _strippedTags: strippedTags,
      _comments: { head: [], tail: [], top: {}, topInline: {}, sub: {}, subInline: {}, afterKey: {}, afterSection: {} },
    };
    if (doc === null || doc === undefined) {
      _collectComments(content, parsed);
      return parsed;
    }
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      return { error: 'top-level must be a mapping' };
    }

    var order = Object.keys(doc);
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var m = key.match(SECTION_BASE_RE);
      if (m && SECTION_KEYS.indexOf(m[1]) !== -1 && doc[key] && typeof doc[key] === 'object' && !Array.isArray(doc[key])) {
        var section = {
          key: key,
          base: m[1],
          segment: m[2] || '',
          entries: [],
          entryOrder: Object.keys(doc[key]),
          _comments: { beforeEntry: {}, inlineEntry: {} },
        };
        var entries = Object.keys(doc[key]);
        var isRootMap = _sfSectionIsRootMap(m[1]);
        for (var e = 0; e < entries.length; e++) {
          var ekey = entries[e];
          var edata = doc[key][ekey];
          // 版本键分组 (equipments 等 root-map / items 等条目 section): 组内条目展开为条目, 版本键只作分组标记;
          // 非 root-map section 要求组内键全部为 namespace:path 条目 (排除把物品字段直接写在版本键下的扁平写法)
          if (_sfVersionKeyRe.test(ekey) && edata !== null && typeof edata === 'object' &&
              !Array.isArray(edata) && Object.keys(edata).length > 0 &&
              (isRootMap || (TYPE_SECTIONS[m[1]] && _sfVersionGroupChildrenAreEntries(edata)))) {
            var gkeys = Object.keys(edata);
            var shareC = { before: {}, inline: {}, afterKey: {} };
            for (var g = 0; g < gkeys.length; g++) {
              var gdata = edata[gkeys[g]];
              section.entries.push({
                key: gkeys[g],
                _group: ekey,
                data: gdata,
                _rawOrder: (gdata && typeof gdata === 'object' && !Array.isArray(gdata)) ? Object.keys(gdata) : [],
                _comments: shareC,
              });
            }
            continue;
          }
          section.entries.push({
            key: ekey,
            data: edata,
            _rawOrder: (edata && typeof edata === 'object' && !Array.isArray(edata)) ? Object.keys(edata) : [],
            _comments: { before: {}, inline: {}, afterKey: {} },
          });
        }
        parsed.sections.push(section);
        parsed._topOrder.push({ kind: 'section', key: key });
      } else {
        parsed._fileLevelRaw[key] = doc[key];
        parsed._topOrder.push({ kind: 'raw', key: key });
      }
    }
    _collectComments(content, parsed);
    return parsed;
  }

  // ---- 注释采集 ----
  // 按行扫描原文件, 把注释按"键路径"记录到解析模型, 供序列化时回写
  function _splitInline(line) {
    var inS = false, inD = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '\\' && (inS || inD)) { i++; continue; }
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (c === '#' && !inS && !inD && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
        return { value: line.slice(0, i).replace(/\s+$/, ''), comment: line.slice(i) };
      }
    }
    return { value: line, comment: null };
  }

  function _collectComments(content, parsed) {
    var C = parsed._comments;
    var secByKey = Object.create(null);
    for (var s = 0; s < parsed.sections.length; s++) secByKey[parsed.sections[s].key] = parsed.sections[s];

    var lines = content.split(/\r?\n/);
    var stack = [{ indent: -1, kind: 'root', path: '', sec: null, entry: null, entryKey: null }];
    var pending = [];
    var inBlock = false, blockBase = -1;
    var inDq = false; // 多行双引号标量 (续行以 # 开头时不应视为注释)
    var prevTopKey = null;

    function dqOpen(line) {
      var n = 0, esc = false;
      for (var qi = 0; qi < line.length; qi++) {
        var ch = line[qi];
        if (ch === '\\' && !esc) { esc = true; continue; }
        if (ch === '"' && !esc) n++;
        esc = false;
      }
      return (n % 2) === 1;
    }

    function pushTo(b, key, text) {
      var arr = b[key] || (b[key] = []);
      arr.push(text);
    }
    function bucket(scope, inline) {
      if (scope.kind === 'section' || scope.kind === 'filetop') return inline ? C.topInline : C.top;
      if (scope.kind === 'entry') {
        // 版本键分组条目: 注释存进组内共享容器 (回写按 gCom.before[entryKey] 读取)
        if (scope.entry && scope.entry._group) {
          return inline ? scope.entry._comments.inline : scope.entry._comments.before;
        }
        var ec = scope.sec._comments;
        return inline ? ec.inlineEntry : ec.beforeEntry;
      }
      if (scope.kind === 'map') {
        return scope.entry
          ? (inline ? scope.entry._comments.inline : scope.entry._comments.before)
          : (inline ? C.subInline : C.sub);
      }
      return null;
    }
    function afterBucket(scope) {
      return scope.entry ? scope.entry._comments.afterKey : C.afterKey;
    }
    function targetOf(scope, inline) {
      var b = (scope.kind === 'seq' || scope.kind === 'itemmap') ? afterBucket(scope) : bucket(scope, inline);
      if (!b) return null;
      return { b: b, key: scope.kind === 'entry' ? scope.entryKey : scope.path };
    }
    function flushText(scope, inline, text) {
      var t = targetOf(scope, inline);
      if (t) pushTo(t.b, t.key, text);
    }
    function flushPending(scope) {
      var t = targetOf(scope, false);
      if (!t) return;
      for (var i = 0; i < pending.length; i++) pushTo(t.b, t.key, pending[i].text);
      pending = [];
    }
    function newScope(indent, kind, path, sec, entry, entryKey) {
      return { indent: indent, kind: kind, path: path, sec: sec, entry: entry, entryKey: entryKey || null };
    }

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var indent = 0;
      while (indent < line.length && line[indent] === ' ') indent++;

      if (inBlock) {
        if (!line.trim() || indent > blockBase) continue;
        inBlock = false;
      }
      if (inDq) {
        inDq = dqOpen(line);
        continue;
      }
      if (/^\s*#/.test(line)) { pending.push({ text: line.replace(/^\s+/, ''), indent: indent }); continue; }
      if (!line.trim()) continue;
      inDq = dqOpen(line);

      var sp = _splitInline(line);
      var content = sp.value;
      var dash = content.substr(indent, 2) === '- ' || content.substr(indent) === '-';

      if (dash) {
        while (stack.length > 1 && stack[stack.length - 1].indent > indent) stack.pop();
        var top = stack[stack.length - 1];
        if (top.kind === 'seq' && top.indent === indent) {
          flushPending(top);
        } else {
          var seqScope = newScope(indent, 'seq', top.path, top.sec, top.entry, null);
          flushPending(seqScope);
          stack.push(seqScope);
          top = seqScope;
        }
        if (sp.comment) flushText(top, false, sp.comment);
        var rest = content.substr(indent).replace(/^- ?/, '');
        if (/^[|>][-+]?\d*\s*$/.test(rest)) { inBlock = true; blockBase = indent; }
        else {
          var km = rest.match(/^(\S.*?):(\s|$)/);
          if (km) stack.push(newScope(indent + 2, 'itemmap', top.path, top.sec, top.entry, null));
        }
        continue;
      }

      var keyM = content.substr(indent).match(/^(\S.*?):(\s|$)/);
      if (keyM) {
        var key = keyM[1];
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        var top = stack[stack.length - 1];
        if (top.kind === 'seq' || top.kind === 'itemmap') {
          flushPending(top);
          if (sp.comment) flushText(top, false, sp.comment);
          stack.push(newScope(indent, 'itemmap', top.path, top.sec, top.entry, null));
          continue;
        }
        var parent = top;
        var scope;
        if (parent.kind === 'root') {
          var isSec = !!secByKey[key];
          for (var pi = 0; pi < pending.length; pi++) {
            if (pending[pi].indent === 0) pushTo(C.top, key, pending[pi].text);
            else if (prevTopKey) pushTo(C.afterSection, prevTopKey, pending[pi].text);
            else C.head.push(pending[pi].text);
          }
          pending = [];
          scope = newScope(indent, isSec ? 'section' : 'filetop', key, isSec ? secByKey[key] : null, null, null);
          prevTopKey = key;
        } else if (parent.kind === 'section') {
          var en = null;
          for (var eni = 0; eni < parent.sec.entries.length; eni++) {
            var e2 = parent.sec.entries[eni];
            // 版本键分组: 文件里的分组键匹配组内条目 (共享注释容器)
            if (e2.key === key || (e2._group && e2._group === key)) { en = e2; break; }
          }
          scope = newScope(indent, 'entry', '', parent.sec, en, key);
        } else {
          var p = parent.path;
          scope = newScope(indent, 'map', p ? p + '.' + key : key, parent.sec, parent.entry, null);
        }
        flushPending(scope);
        if (sp.comment) flushText(scope, true, sp.comment);
        stack.push(scope);
        if (/:\s*[|>][-+]?\d*\s*$/.test(content.substr(indent))) { inBlock = true; blockBase = indent; }
        continue;
      }
      // 其它续行: 保持作用域, 不采集
    }
    for (var ti = 0; ti < pending.length; ti++) {
      if (pending[ti].indent === 0) C.tail.push(pending[ti].text);
      else if (prevTopKey) pushTo(C.afterSection, prevTopKey, pending[ti].text);
      else C.tail.push(pending[ti].text);
    }
  }

  // ============ 序列化 ============
  var _SPECIAL_START_RE = /^[-?!#`"&*|>%@<\s,\[\]{}]/;
  var _NUMBER_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
  var _BOOL_RE = /^(true|false|yes|no|on|off|null|none|~)$/i;

  function _quoteKey(key) {
    if (/:\s/.test(key) || /\s#/.test(key) || /[:#\s]$/.test(key) || _SPECIAL_START_RE.test(key) || key === '' || key !== String(key) ||
        _NUMBER_RE.test(key) || _BOOL_RE.test(key)) {
      return "'" + String(key).replace(/'/g, "''") + "'";
    }
    return String(key);
  }

  function _genFlow(val) {
    if (_ceIsWrap(val)) return '!!' + val.__ceTag + ' ' + _genFlow(val.v);
    if (Array.isArray(val)) return '[' + val.map(_genFlow).join(', ') + ']';
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      return '{' + Object.keys(val).map(function (k) { return _quoteKey(k) + ': ' + _genFlow(val[k]); }).join(', ') + '}';
    }
    return _genScalar(val);
  }

  function _genScalarRaw(val) {
    if (typeof val === 'number') {
      // YAML 特殊数值符号, 避免 .inf/.nan 被静默改成 null
      if (!isFinite(val)) return isNaN(val) ? '.nan' : (val > 0 ? '.inf' : '-.inf');
      return String(val);
    }
    if (typeof val === 'boolean') return String(val);
    var s = String(val);
    if (s === '') return "''";
    var needsQuote =
      _SPECIAL_START_RE.test(s) || /:\s/.test(s) || /\s#/.test(s) || /[\s:#]$/.test(s) ||
      _NUMBER_RE.test(s) || _BOOL_RE.test(s);
    if (!needsQuote) return s;
    if (s.indexOf("'") !== -1) {
      return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return "'" + s + "'";
  }

  function _genScalar(val) {
    if (_ceIsWrap(val)) {
      // 数值型 tag (!!long 等) 的值可能经输入框写回为数字字符串, 保持裸数字输出, 避免 !!long '7'
      var raw;
      if (Array.isArray(val.v)) raw = _genFlow(val.v);
      else if (typeof val.v === 'number') raw = _genScalarRaw(val.v);
      else if (typeof val.v === 'string' && _NUMBER_RE.test(val.v)) raw = val.v;
      else raw = _genScalarRaw(val.v);
      return '!!' + val.__ceTag + ' ' + raw;
    }
    return _genScalarRaw(val);
  }

  function _fmtDate(d) {
    var y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  // 生成 map 块的行（含缩进）; cm 为注释表 { before, inline, afterKey }, prefix 为当前路径前缀
  function _genMapLines(map, indent, cm, prefix) {
    var pad = '  '.repeat(indent);
    var lines = [];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var path = prefix ? prefix + '.' + k : k;
      if (cm && cm.before && cm.before[path]) {
        var bcs = cm.before[path];
        for (var bci = 0; bci < bcs.length; bci++) lines.push(pad + bcs[bci]);
      }
      var inline = (cm && cm.inline && cm.inline[path]) || null;
      var after = (cm && cm.afterKey && cm.afterKey[path]) || null;
      var v = map[k];
      var kq = _quoteKey(k);
      var header;
      if (_ceIsWrap(v)) header = pad + kq + ': ' + _genScalar(v);
      else if (v === null || v === undefined) header = pad + kq + ': ~';
      else if (typeof v === 'string' && v.indexOf('\n') !== -1) header = pad + kq + ': |-';
      else if (typeof v === 'object') {
        if (v instanceof Date) header = pad + kq + ': ' + _genScalar(_fmtDate(v));
        else if (Array.isArray(v)) header = (v.length === 0) ? pad + kq + ': []' : pad + kq + ':';
        else header = (Object.keys(v).length === 0) ? pad + kq + ': {}' : pad + kq + ':';
      } else header = pad + kq + ': ' + _genScalar(v);
      if (inline) header += ' ' + inline;
      lines.push(header);
      // 值体
      if (typeof v === 'string' && v.indexOf('\n') !== -1) {
        var vs = v.split('\n');
        for (var li = 0; li < vs.length; li++) lines.push(pad + '  ' + vs[li]);
      } else if (v !== null && typeof v === 'object' && !(v instanceof Date) && !_ceIsWrap(v)) {
        if (Array.isArray(v)) {
          if (v.length > 0) {
            if (after) for (var aci = 0; aci < after.length; aci++) lines.push(pad + '  ' + after[aci]);
            for (var ai = 0; ai < v.length; ai++) {
              var item = v[ai];
              if (_ceIsWrap(item)) {
                lines.push(pad + '  - !!' + item.__ceTag + ' ' + _genFlow(item.v));
              } else if (item !== null && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
                if (Object.keys(item).length === 0) { lines.push(pad + '  - {}'); continue; }
                var rendered = _genMapLines(item, indent + 2);
                lines.push(rendered[0].replace(pad + '    ', pad + '  - '));
                for (var ri = 1; ri < rendered.length; ri++) lines.push(rendered[ri]);
              } else if (typeof item === 'string' && item.indexOf('\n') !== -1) {
                lines.push(pad + '  - |-');
                var is = item.split('\n');
                for (var ii = 0; ii < is.length; ii++) lines.push(pad + '    ' + is[ii]);
              } else if (Array.isArray(item)) {
                lines.push(pad + '  - ' + _genFlow(item));
              } else {
                lines.push(pad + '  - ' + _genScalar(item));
              }
            }
          }
        } else if (Object.keys(v).length > 0) {
          var sub = _genMapLines(v, indent + 1, cm, path);
          for (var si = 0; si < sub.length; si++) lines.push(sub[si]);
        }
      }
    }
    return lines;
  }

  // 序列化单个顶层键值对（file-level raw 键）; cm 为文件级注释表, prefix 为路径前缀
  function _genTopBlock(key, val, cm, prefix) {
    var kq = _quoteKey(key);
    var path = prefix ? prefix + '.' + key : key;
    var inline = (cm && cm.topInline && cm.topInline[key]) || null;
    if (val === null || val === undefined) {
      var l0 = kq + ': ~';
      return inline ? l0 + ' ' + inline : l0;
    }
    if (_ceIsWrap(val)) {
      var lw = kq + ': ' + _genScalar(val);
      return inline ? lw + ' ' + inline : lw;
    }
    if (val instanceof Date) {
      var ld = kq + ': ' + _genScalar(_fmtDate(val));
      return inline ? ld + ' ' + inline : ld;
    }
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) {
      var l1 = kq + ': {}';
      return inline ? l1 + ' ' + inline : l1;
    }
    if (typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      var lines = [kq + ':'];
      if (cm && cm.afterKey && cm.afterKey[path]) {
        var a = cm.afterKey[path];
        for (var ai = 0; ai < a.length; ai++) lines.push('  ' + a[ai]);
      }
      var sub = _genMapLines(val, 1, { before: cm.sub, inline: cm.subInline, afterKey: cm.afterKey }, key);
      for (var si = 0; si < sub.length; si++) lines.push(sub[si]);
      if (inline) lines[0] += ' ' + inline;
      return lines.join('\n');
    }
    var l2 = kq + ': ' + _genScalar(val);
    return inline ? l2 + ' ' + inline : l2;
  }

  function _entryKeyOrder(entry) {
    var keys = [];
    for (var i = 0; i < (entry._rawOrder || []).length; i++) keys.push(entry._rawOrder[i]);
    if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
      var all = Object.keys(entry.data);
      for (var j = 0; j < all.length; j++) {
        if (keys.indexOf(all[j]) === -1) keys.push(all[j]);
      }
    }
    return keys;
  }

  function generateYAML(parsed) {
    var C = parsed._comments || { head: [], tail: [], top: {}, topInline: {}, afterSection: {} };
    var blocks = [];
    if (!parsed._topOrder || parsed._topOrder.length === 0) {
      var emptyLines = (C.head || []).concat(C.tail || []);
      return emptyLines.length ? emptyLines.join('\n') + '\n{}' : '{}';
    }
    for (var hi = 0; hi < (C.head || []).length; hi++) blocks.push(C.head[hi]);
    for (var i = 0; i < parsed._topOrder.length; i++) {
      var t = parsed._topOrder[i];
      var topC = (C.top || {})[t.key] || null;
      if (topC) for (var tci = 0; tci < topC.length; tci++) blocks.push(topC[tci]);
      var inlineTop = (C.topInline || {})[t.key] || null;
      if (t.kind === 'raw') {
        blocks.push(_genTopBlock(t.key, parsed._fileLevelRaw[t.key], C, t.key));
      } else {
        var section = null;
        for (var s = 0; s < parsed.sections.length; s++) {
          if (parsed.sections[s].key === t.key) { section = parsed.sections[s]; break; }
        }
        if (section) {
          var kq = _quoteKey(section.key);
          if (section.entries.length === 0) {
            var es = kq + ': {}';
            if (inlineTop) es += ' ' + inlineTop;
            blocks.push(es);
          } else {
            var lines = [kq + ':'];
            if (inlineTop) lines[0] += ' ' + inlineTop;
            var secC = section._comments || { beforeEntry: {}, inlineEntry: {} };
            var curGroup = null;
            var gCom = null; // 版本键分组的共享注释容器
            for (var e = 0; e < section.entries.length; e++) {
              var entry = section.entries[e];
              var ec = entry._comments || { before: {}, inline: {}, afterKey: {} };
              var g = entry._group || null;
              var padE = g !== null ? '    ' : '  ';
              var padArr = g !== null ? '      ' : '    ';
              if (g !== curGroup) {
                curGroup = g;
                if (g !== null) {
                  gCom = ec;
                  // 分组键注释与组内条目同存共享容器: 采集端 entry 级注释也写入 entry._comments(shareC)
                  var gbf = (gCom.before && gCom.before[g]) || null;
                  if (gbf) for (var gbi = 0; gbi < gbf.length; gbi++) lines.push('  ' + gbf[gbi]);
                  var gInl = (gCom.inline && gCom.inline[g]) || null;
                  lines.push('  ' + _quoteKey(g) + ':' + (gInl ? ' ' + gInl : ''));
                }
              }
              var bf = (g !== null ? (gCom.before ? gCom.before[entry.key] : null) : (secC.beforeEntry[entry.key] || null));
              if (bf) for (var bi = 0; bi < bf.length; bi++) lines.push(padE + bf[bi]);
              var eq = _quoteKey(entry.key);
              var inlineEntry = g !== null ? (gCom.inline ? gCom.inline[entry.key] : null) : (secC.inlineEntry[entry.key] || null);
              var ed = entry.data;
              var el;
              if (ed === null || ed === undefined) { el = padE + eq + ': ~'; }
              else if (typeof ed === 'object' && !Array.isArray(ed) && !(ed instanceof Date)) {
                el = (Object.keys(ed).length === 0) ? padE + eq + ': {}' : padE + eq + ':';
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
                el = null;
                if (Object.keys(ed).length > 0) {
                  // prefix 必须为空: 采集端嵌套注释按 "键名" 记录, 不带条目前缀
                  var em = _genMapLines(ed, g !== null ? 3 : 2, g !== null ? gCom : ec, '');
                  for (var mi = 0; mi < em.length; mi++) lines.push(em[mi]);
                }
              } else if (Array.isArray(ed)) {
                el = (ed.length === 0) ? padE + eq + ': []' : padE + eq + ':';
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
                el = null;
                if (ed.length > 0) {
                  var aE = ec.afterKey[''] || null;
                  if (aE) for (var ae = 0; ae < aE.length; ae++) lines.push(padArr + aE[ae]);
                  for (var li2 = 0; li2 < ed.length; li2++) {
                    var it2 = ed[li2];
                    if (it2 !== null && typeof it2 === 'object' && !Array.isArray(it2) && !(it2 instanceof Date)) {
                      if (Object.keys(it2).length === 0) { lines.push(padArr + '- {}'); continue; }
                      var r2 = _genMapLines(it2, 3);
                      lines.push(r2[0].replace('      ', padArr + '- '));
                      for (var rj = 1; rj < r2.length; rj++) lines.push(r2[rj]);
                    } else if (typeof it2 === 'string' && it2.indexOf('\n') !== -1) {
                      lines.push(padArr + '- |-');
                      var i3 = it2.split('\n');
                      for (var i4 = 0; i4 < i3.length; i4++) lines.push(padArr + '  ' + i3[i4]);
                    } else if (Array.isArray(it2)) {
                      lines.push(padArr + '- ' + _genFlow(it2));
                    } else {
                      lines.push(padArr + '- ' + _genScalar(it2));
                    }
                  }
                }
              } else { el = padE + eq + ': ' + _genScalar(ed); }
              if (el !== null) {
                if (inlineEntry) el += ' ' + inlineEntry;
                lines.push(el);
              }
            }
            blocks.push(lines.join('\n'));
          }
        } /* if (section) */
      } /* else (section block) */
      var afterS = (C.afterSection || {})[t.key] || null;
      if (afterS) for (var asi = 0; asi < afterS.length; asi++) blocks.push(afterS[asi]);
    }
    for (var tli = 0; tli < (C.tail || []).length; tli++) blocks.push(C.tail[tli]);
    return blocks.join('\n');
  }

  function syncToSource(parsed) {
    if (parsed && parsed._isPopup) return; // 弹窗内临时数据, 不写回源码
    var yaml = generateYAML(parsed);
    if (ROOT.codeMirrorEditor) {
      ROOT.codeMirrorEditor.setValue(yaml);
      if (typeof ROOT.updateStatus === 'function') ROOT.updateStatus(_t('craftengine.syncedToSource'));
    }
    if (parsed) parsed._visualDirty = false;
  }

  // ============ Schema 表单引擎 (craftengine-schemas.js) ============
  var _sfSchemas = (typeof CESchemas !== 'undefined' && CESchemas) ? CESchemas : null;
  var _sfDatalistMap = null;
  var _sfUidSeq = 0;
  var _sfUidMap = {};
  var _sfActiveContainer = null; // 当前渲染/交互中的容器 (events widget 导航状态按容器持久)
  var _sfL = function (zh, en) { return { zh: zh, en: en }; };
  var _sfNumRe = /^-?\d+(\.\d+)?$/;
  var _sfLastParsed = null; // 最近一次 render 的 parsed, 用于标记"尚未同步到源码"的更改

  function _sfMarkDirty(parsed) {
    if (parsed && !parsed._visualDirty) parsed._visualDirty = true;
  }

  function _sfInit() {
    if (_sfSchemas === null && typeof CESchemas !== 'undefined') _sfSchemas = CESchemas;
    if (_sfDatalistMap) return;
    _sfDatalistMap = {};
    if (_sfSchemas && _sfSchemas.constants) {
      var cs = _sfSchemas.constants;
      Object.keys(cs).forEach(function (k) {
        if (Array.isArray(cs[k])) _sfDatalistMap[k] = cs[k].slice();
      });
      var vi = cs.vanillaItems || [];
      _sfDatalistMap.items = vi.slice();
      _sfDatalistMap.blocks = vi.slice();
    }
  }

  // ---- Minecraft 资源注册表 (ce-mcassets.js) 接入 ----
  // 原版 resources 索引就绪/重扫后, 把资源列表合并进 datalist;
  // 未配置资源目录时保持原样 (只有内置的原版常量列表)。
  var _ceAssetsBound = false;
  var _ceAssetsKindBound = {};
  function _sfMergeList(name, arr) {
    _sfInit();
    if (!_sfDatalistMap) return false;
    if (!arr || !arr.length) return false;
    var base = _sfDatalistMap[name] || [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < base.length; i++) { var a = base[i]; if (!seen[a]) { seen[a] = 1; out.push(a); } }
    for (var j = 0; j < arr.length; j++) { var b = arr[j]; if (!seen[b]) { seen[b] = 1; out.push(b); } }
    out.sort();
    _sfDatalistMap[name] = out;
    return true;
  }
  function _ceAssetsBind() {
    var A = (typeof CEMCAssets !== 'undefined') ? CEMCAssets : null;
    if (!A || !A.status || A.status().state !== 'ready') return;
    _sfInit();
    var kinds = ['items', 'blocks', 'textures', 'blockTextures', 'itemTextures', 'guiTextures',
      'models', 'blockModels', 'itemModels', 'particles', 'fonts', 'equipments', 'atlases',
      'soundFiles', 'soundEvents', 'enchantments', 'potionEffects', 'entities', 'biomes',
      'attributes', 'paintings', 'jukeboxSongs'];
    var changed = false;
    for (var i = 0; i < kinds.length; i++) {
      var k = kinds[i];
      var list = A.listFor(k);
      if (list && list.length) {
        if (_sfMergeList(k, list)) { changed = true; _ceAssetsKindBound[k] = 1; }
        _ceElemRefreshDatalist(k);
        _ceElemRefreshDatalist(k + 's');
      }
    }
    _ceAssetsBound = true;
    // 资源就绪后补挂 picker 按钮 / 刷新 datalist: 重新渲染当前表单
    if (changed && _sfActiveContainer && _sfActiveContainer._ceRenderFn) {
      try { _sfActiveContainer._ceRenderFn(); } catch (e) { /* 忽略渲染异常 */ }
    }
  }
  function _ceAssetsEnsureBind() {
    if (_ceAssetsBound) return;
    if (typeof CEMCAssets === 'undefined' || !CEMCAssets) return;
    CEMCAssets.onReady(function () { _ceAssetsBind(); });
    if (CEMCAssets.status && CEMCAssets.status().state === 'ready') _ceAssetsBind();
  }

  // ---- CE 元素预载扫描 (picker 数据源) ----
  // 扫描工程 configuration/<section> 目录收集条目键 (items/blocks/furniture/categories/templates),
  // 合并进 _sfDatalistMap (items/blocks 与 vanilla 去重合并, 其余直接存储); 结果按 configuration 目录缓存
  var _CE_ELEM_SECTIONS = {
    items: 1, blocks: 1, furniture: 1, categories: 1, templates: 1,
    equipments: 1, recipes: 1, loot_sources: 1, images: 1, emoji: 1,
    sounds: 1, jukebox_songs: 1, paintings: 1, global_variables: 1,
    placed_features: 1, translations: 1, lang: 1,
  };
  // 工程内可被 <image:ns:id> / <global:id> / <i18n:id> 引用的段 (供预览与诊断使用)
  var _CE_EXTRA_SECTIONS = { images: 1, global_variables: 1, emoji: 1, translations: 1, lang: 1 };
  var _ceElemCache = Object.create(null); // configDir -> { state: 'loading'|'done', data: {sec:[keys]} }
  var _ceElemListeners = [];
  // 同步: 文件路径中显式含 configuration(s) 段 (标准布局)
  function _ceElemConfigDir(filePath) {
    var parts = String(filePath || '').replace(/\\/g, '/').split('/');
    for (var i = parts.length - 2; i >= 1; i--) {
      if (parts[i] === 'configuration' || parts[i] === 'configurations') return parts.slice(0, i + 1).join('/');
    }
    return null;
  }
  // 标准布局 resources/<命名空间>/configuration(s): 上溯两级得 resources 根; 非标准布局返回 null
  function _ceElemResourcesRoot(configDir) {
    var parts = String(configDir || '').replace(/\\/g, '/').split('/');
    var last = parts[parts.length - 1] || '';
    if (last !== 'configuration' && last !== 'configurations') return null;
    parts.pop(); // configuration
    parts.pop(); // <命名空间>
    if (parts.length < 2) return null;
    return parts.join('/');
  }
  // 当前文件的命名空间 (resources/<ns>/configuration 的 <ns>)
  function _sfCurNamespace(st) {
    if (!st || !st.file) return '';
    var cfg = _ceElemConfigDir(st.file);
    if (!cfg) return '';
    var parts = cfg.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  }
  // 异步: 配置目录名可自定义 (如"工程内容"), 从文件所在目录向上探测,
  // 第一个含 section 子目录 (items/blocks/categories/...) 或根下散落 section 单文件
  // (categories.yml 等, 兼容单文件布局) 的目录即配置目录
  function _ceElemLocate(filePath) {
    var cfg = _ceElemConfigDir(filePath);
    if (cfg) return Promise.resolve(cfg);
    var api = ROOT.electronAPI;
    if (!api || !api.readdir) return Promise.resolve(null);
    var parts = String(filePath || '').replace(/\\/g, '/').split('/');
    if (parts.length < 3) return Promise.resolve(null);
    return _ceElemProbeUp(parts.slice(0, -1).join('/'), 0, api);
  }
  function _ceElemProbeUp(dir, depth, api) {
    if (depth > 8) return Promise.resolve(null);
    return api.readdir(dir).then(function (res) {
      if (!res || !res.success) return null;
      for (var i = 0; i < res.files.length; i++) {
        if (res.files[i].isDirectory && _CE_ELEM_SECTIONS[res.files[i].name]) return dir;
      }
      for (var j = 0; j < res.files.length; j++) {
        if (!res.files[j].isDirectory && _CE_ELEM_SECTIONS[res.files[j].name.replace(/\.ya?ml$/i, '')]) return dir;
      }
      var parts = dir.split('/');
      parts.pop();
      if (parts.length < 3) return null;
      return _ceElemProbeUp(parts.join('/'), depth + 1, api);
    }).catch(function () { return null; });
  }
  function _ceElemGet(configDir) {
    var rec = _ceElemCache[configDir];
    return rec && rec.state === 'done' ? rec.data : null;
  }
  function _ceElemEnabled() {
    // 设置开关 (默认开启): body 有 ce-element-picker 类才启用
    return typeof document === 'undefined' || !document.body || !document.body.classList ||
      document.body.classList.contains('ce-element-picker');
  }
  function _ceElemOnDone(cb) {
    if (typeof cb === 'function' && _ceElemListeners.indexOf(cb) === -1) _ceElemListeners.push(cb);
  }
  function _ceElemFire(rec) {
    if (!rec) return;
    for (var i = 0; i < _ceElemListeners.length; i++) {
      try { _ceElemListeners[i](rec.data); } catch (e) {}
    }
  }
  // 解析文件内容, 按 section 分组收集条目键 (顶层 items:/blocks:/... 各键下的直接子键,
  // $$ 版本键组展开; 单文件可同时含多个 section, 如 categories.yml)
  function _ceElemFileKeysBySec(content) {
    var doc;
    try { doc = YAML.load(content); } catch (e) { return {}; }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return {};
    var bySec = {};
    Object.keys(doc).forEach(function (k) {
      var m = k.match(SECTION_BASE_RE);
      if (!m || !_CE_ELEM_SECTIONS[m[1]]) return;
      var v = doc[k];
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return;
      var out = bySec[m[1]] = bySec[m[1]] || [];
      Object.keys(v).forEach(function (ek) {
        if (_sfVersionKeyRe.test(ek) && v[ek] !== null && typeof v[ek] === 'object' && !Array.isArray(v[ek])) {
          // 版本键分组 ($$...): 展开组内条目 (要求完整命名键, 跳过普通说明键)
          Object.keys(v[ek]).forEach(function (gk) {
            if (gk.indexOf(':') === -1) return;
            if (out.indexOf(gk) === -1) out.push(gk);
          });
        } else if (out.indexOf(ek) === -1) {
          out.push(ek);
        }
      });
    });
    return bySec;
  }
  function _ceElemFileKeys(content) {
    var bySec = _ceElemFileKeysBySec(content);
    var out = [];
    Object.keys(bySec).forEach(function (sec) {
      for (var i = 0; i < bySec[sec].length; i++) if (out.indexOf(bySec[sec][i]) === -1) out.push(bySec[sec][i]);
    });
    return out;
  }
  // 各命名空间扫描结果按 configDir 记录贡献, 合并时从全部贡献重建 (跨命名空间聚合, 重扫幂等)
  var _ceElemContrib = Object.create(null); // configDir -> {sec:[keys]}
  var _ceElemRescanAt = 0; // 最近一次全量重扫时间, 扫描中状态 (loading) 可据此保持"扫描中"提示
  var _ceElemScanning = false; // 互斥锁, 防止并发扫描
  function _ceElemMerge(configDir, data) {
    if (!data) return;
    if (!_ceElemCache[configDir]) return; // 已被清除 (切换项目) 的旧扫描结果丢弃
    _sfInit();
    _ceElemContrib[configDir] = data;
    _ceElemRebuild();
  }
  function _ceElemRebuild() {
    _sfInit();
    var out = {};
    Object.keys(_CE_ELEM_SECTIONS).forEach(function (sec) { out[sec] = []; });
    Object.keys(_ceElemContrib).forEach(function (cd) {
      var d = _ceElemContrib[cd];
      Object.keys(_CE_ELEM_SECTIONS).forEach(function (sec) {
        var arr = d[sec] || [];
        var o = out[sec];
        for (var i = 0; i < arr.length; i++) if (o.indexOf(arr[i]) === -1) o.push(arr[i]);
      });
    });
    var vi = (_sfSchemas && _sfSchemas.constants && _sfSchemas.constants.vanillaItems) || [];
    Object.keys(_CE_ELEM_SECTIONS).forEach(function (sec) {
      if (sec === 'items' || sec === 'blocks') {
        var seen = {}, merged = [];
        function push(v) { v = String(v); if (v && !seen[v]) { seen[v] = 1; merged.push(v); } }
        out[sec].forEach(push);
        vi.forEach(push);
        _sfDatalistMap[sec] = merged;
      } else {
        _sfDatalistMap[sec] = out[sec];
      }
      _ceElemRefreshDatalist(sec);
    });
    // 工程扫描会重建 items/blocks 等列表, 需要把原版资源索引再合并回来
    if (_ceAssetsBound) {
      Object.keys(_ceAssetsKindBound).forEach(function (k) {
        var A = (typeof CEMCAssets !== 'undefined') ? CEMCAssets : null;
        if (!A) return;
        var list = A.listFor(k);
        if (list && list.length) { _sfMergeList(k, list); _ceElemRefreshDatalist(k); }
      });
    }
  }
  function _ceElemRefreshDatalist(sec) {
    if (!ROOT.document) return;
    var el = ROOT.document.getElementById('ce-dl-' + sec);
    if (!el) return;
    var arr = _sfDatalistMap[sec] || [];
    var html = '';
    for (var i = 0; i < arr.length; i++) html += '<option value="' + _escHtml(String(arr[i])) + '">';
    el.innerHTML = html;
  }
  function _ceElemStart(configDir) {
    if (_ceElemCache[configDir]) return;
    var rec = { state: 'loading', data: null };
    _ceElemCache[configDir] = rec;
    var api = ROOT.electronAPI;
    if (!api || !api.readdir || !api.readFile) {
      rec.state = 'done';
      _ceElemFire(rec);
      return;
    }
    var secs = Object.keys(_CE_ELEM_SECTIONS);
    var data = {};
    var pending = secs.length;
    function secDone(sec, keys) {
      data[sec] = keys;
      pending--;
      if (pending === 0) {
        rec.data = data;
        rec.state = 'done';
        // 身份检查: 重扫/切换工程已替换缓存记录时, 丢弃本次过期结果 (避免旧数据覆盖新扫描)
        if (_ceElemCache[configDir] === rec) {
          _ceElemMerge(configDir, data);
          _ceElemFire(rec);
        }
      }
    }
    // 递归收集配置目录下全部 .yml 文件, 逐个解析按顶层键分组:
    // 标准 <sec>/ 子目录、根下散落单文件 (categories.yml / sword.yml)、任意分组子目录 (armor/) 均覆盖
    var files = [];
    (function walk(dir, depth) {
      return api.readdir(dir).then(function (res) {
        if (!res || !res.success) return;
        var dirs = [];
        for (var i = 0; i < res.files.length; i++) {
          var fl = res.files[i];
          if (fl.isDirectory) { dirs.push(fl); continue; }
          if (/\.ya?ml$/i.test(fl.name)) files.push(fl);
        }
        if (depth < 3 && dirs.length) {
          return Promise.all(dirs.map(function (d) { return walk(d.path, depth + 1); }));
        }
      }).catch(function () {});
    })(configDir, 0).then(function () {
      var keys = {}; // sec -> [keys]
      var fi = 0;
      (function next() {
        if (fi >= files.length) { finish(); return; }
        var fp = files[fi++].path;
        api.readFile(fp).then(function (rr) {
          if (rr && rr.success && rr.content) {
            var bySec = _ceElemFileKeysBySec(rr.content);
            Object.keys(bySec).forEach(function (sec) {
              var arr = keys[sec] = keys[sec] || [];
              for (var i = 0; i < bySec[sec].length; i++) {
                if (arr.indexOf(bySec[sec][i]) === -1) arr.push(bySec[sec][i]);
              }
            });
          }
          next();
        }).catch(next);
      })();
      function finish() {
        secs.forEach(function (sec) { secDone(sec, keys[sec] || []); });
      }
    });
  }
  // 清理不属于当前工程 (resources 根不同) 的旧贡献/缓存, 避免跨项目条目残留
  function _ceElemPruneOutside(prefixes) {
    var changed = false;
    Object.keys(_ceElemContrib).forEach(function (cd) {
      var keep = false;
      for (var i = 0; i < prefixes.length; i++) {
        if (cd === prefixes[i] || cd.indexOf(prefixes[i] + '/') === 0) { keep = true; break; }
      }
      if (!keep) { delete _ceElemContrib[cd]; delete _ceElemCache[cd]; changed = true; }
    });
    if (changed) _ceElemRebuild();
  }
  // 扫描 resources 根下所有命名空间目录 (含 configuration(s) 子目录的才扫描)
  function _ceElemStartSiblings(resRoot) {
    var api = ROOT.electronAPI;
    if (!api || !api.readdir) return;
    api.readdir(resRoot).then(function (res) {
      if (!res || !res.success) return;
      for (var i = 0; i < res.files.length; i++) {
        var fl = res.files[i];
        if (!fl.isDirectory) continue;
        var nsDir = String(fl.path).replace(/\\/g, '/');
        (function (nd) {
          api.readdir(nd).then(function (r2) {
            if (!r2 || !r2.success) return;
            for (var j = 0; j < r2.files.length; j++) {
              if (r2.files[j].isDirectory &&
                  (r2.files[j].name === 'configuration' || r2.files[j].name === 'configurations')) {
                _ceElemStart(nd + '/' + r2.files[j].name);
                break;
              }
            }
          }).catch(function () {});
        })(nsDir);
      }
    }).catch(function () {});
  }
  function _ceElemScan(filePath) {
    if (_ceElemScanning) return;
    _ceElemScanning = true;
    _sfInit();
    if (!_ceElemEnabled()) { _ceElemScanning = false; return; }
    // 1) 显式 configuration 段 / 向上探测含 section 子目录的目录 (兼容自定义配置目录名)
    _ceElemLocate(filePath).then(function (configDir) {
      if (configDir) {
        // 当前命名空间 + resources 根下所有命名空间一起扫; 非当前工程的旧贡献清掉
        var resRoot = _ceElemResourcesRoot(configDir);
        _ceElemPruneOutside(resRoot ? [resRoot] : [configDir]);
        _ceElemStart(configDir);
        if (resRoot) _ceElemStartSiblings(resRoot);
        _ceElemScanning = false;
        return;
      }
      // 2) 兜底: 经工程根回溯 (插件根 / 数据包根 都试)
      resolveProjectRoot(filePath).then(function (r) {
        if (r && r.found) {
          var prefixes = [];
          var pr = r.pluginRoot ? String(r.pluginRoot).replace(/\\/g, '/') : '';
          if (pr) {
            prefixes.push(pr + '/configuration');
            _ceElemStart(pr + '/configuration');
            _ceElemStartSiblings(pr + '/resources');
            prefixes.push(pr + '/resources');
          }
          var pk = r.packRoot ? String(r.packRoot).replace(/\\/g, '/') : '';
          if (pk && pk !== pr) {
            prefixes.push(pk + '/configuration');
            _ceElemStart(pk + '/configuration');
            _ceElemStartSiblings(pk + '/resources');
            prefixes.push(pk + '/resources');
          }
          _ceElemPruneOutside(prefixes);
        }
        _ceElemScanning = false;
      }).catch(function () { _ceElemScanning = false; });
    });
  }
  function _ceElemRescan(filePath) {
    // 清空全部贡献与缓存后按当前文件重扫 (含所有命名空间)
    Object.keys(_ceElemContrib).forEach(function (k) { delete _ceElemContrib[k]; });
    Object.keys(_ceElemCache).forEach(function (k) { delete _ceElemCache[k]; });
    _ceElemRebuild();
    _ceElemRescanAt = Date.now();
    _ceElemScan(filePath);
  }
  function _ceElemCleanup() {
    _ceElemScanning = false;
    Object.keys(_ceElemContrib).forEach(function (k) { delete _ceElemContrib[k]; });
    Object.keys(_ceElemCache).forEach(function (k) { delete _ceElemCache[k]; });
    _ceElemRebuild();
  }

  // section 的 schema 是否 root-map (条目键 = 直接子键, 版本键可作分组)
  function _sfSectionIsRootMap(base) {
    _sfInit();
    var s = _sfSchemas && _sfSchemas.sections && _sfSchemas.sections[TYPE_SECTIONS[base]];
    if (!s || !s.fields) return false;
    for (var i = 0; i < s.fields.length; i++) {
      if (s.fields[i].custom === 'root-map') return true;
    }
    return false;
  }
  // 版本键值是否全部为 namespace:path 条目键 ($$<约束>#<id> 包裹真实条目, 如 items 文件写法)
  function _sfVersionGroupChildrenAreEntries(gdata) {
    var ks = Object.keys(gdata);
    if (!ks.length) return false;
    for (var i = 0; i < ks.length; i++) {
      if (ks[i].indexOf(':') === -1) return false;
    }
    return true;
  }
  function _labelOf(field) {
    if (field === null || field === undefined) return '';
    if (typeof field === 'string') return field;
    var lb = field.label;
    if (typeof lb === 'string') return lb;
    if (lb && typeof lb === 'object') {
      return (typeof I18N !== 'undefined' && I18N.pick) ? I18N.pick(lb) : (lb.zh || lb.en || '');
    }
    // 直接传 {zh, en} 对象 (如 placeholder)
    if (field.zh !== undefined || field.en !== undefined) {
      return (typeof I18N !== 'undefined' && I18N.pick) ? I18N.pick(field) : (field.zh || field.en || '');
    }
    return field.key || '';
  }
  function _sfTypesOf(def) {
    return (typeof def.types === 'function') ? def.types() : (def.types || {});
  }
  function _sfUidAlloc(path, kind, def, opts) {
    _sfUidSeq++;
    var uid = 'ce-sf-' + _sfUidSeq;
    var uidMap = (_sfActiveContainer && _sfActiveContainer._ceUi && _sfActiveContainer._ceUi._sfUidMap) || _sfUidMap;
    uidMap[uid] = { path: path, kind: kind, def: def, inList: !!(opts && opts.inList) };
    return uid;
  }
  function _sfUidOf(el) {
    if (!el || !el.closest) return null;
    var w = el.closest('[data-sf-uid]');
    return w ? w.getAttribute('data-sf-uid') : null;
  }
  function _sfEntry(parsed, ui) {
    if (!parsed || !ui || !parsed.sections[ui.section]) return null;
    return parsed.sections[ui.section].entries[ui.entry] || null;
  }
  function _sfSection(parsed, ui) {
    if (!parsed || !ui) return null;
    return parsed.sections[ui.section] || null;
  }
  function _sfDefaultOf(def) {
    if (!def) return {};
    var t = def.type;
    if (t === 'listOf') return [];
    if (t === 'mapOf') return {};
    if (t === 'union' || t === 'object' || t === 'tabs') return {};
    if (t === 'lines' || t === 'linesScalar') return [];
    if (t === 'kv' || t === 'kvRest') return {};
    if (t === 'bool') return false;
    return '';
  }
  // kv 行解析: JSON 对象/数组 / 带引号字符串 / true/false / 数字 / 字符串 (键始终为字符串)
  function _parseKvLine(v) {
    var s = String(v).trim();
    // !!tag 前缀: 保留为 wrap 对象, 序列化时写回 k: !!tag 值
    var tagMatch = s.match(/^!!(\S+)\s+([\s\S]*)$/);
    if (tagMatch) {
      var tv = _parseKvLine(tagMatch[2]);
      return { __ceTag: tagMatch[1], v: tv };
    }
    if (/^[\[{"']/.test(s)) {
      try {
        var j = JSON.parse(s);
        if (j !== null && typeof j === 'object') return j;
        if (typeof j === 'string') return j; // "xxx" → 字符串 (含转义处理)
      } catch (e) {}
      if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1);
    }
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (_sfNumRe.test(s)) return parseFloat(s);
    return v;
  }
  function _parseKvText(text) {
    var obj = {};
    var bad = null;
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\r$/, '');
      if (!ln.trim()) continue;
      var idx = ln.indexOf(':');
      if (idx <= 0) { bad = lines[i]; break; }
      var k = ln.slice(0, idx).trim();
      if (k.length >= 2 && ((k[0] === '"' && k[k.length - 1] === '"') || (k[0] === "'" && k[k.length - 1] === "'"))) {
        k = k.slice(1, -1);
      }
      var v = ln.slice(idx + 1).trim();
      obj[k] = v === '' ? '' : _parseKvLine(v);
    }
    return { obj: obj, bad: bad };
  }
  function _sfScalarText(v) {
    if (v === undefined || v === null) return '';
    if (_ceIsWrap(v)) v = v.v;
    if (typeof v === 'object') return '';
    return String(v);
  }
  function _sfObjText(obj) {
    return Object.keys(obj).map(function (k) {
      var v = obj[k];
      if (_ceIsWrap(v)) return k + ': !!' + v.__ceTag + ' ' + (Array.isArray(v.v) ? JSON.stringify(v.v) : String(v.v));
      return k + ': ' + ((v && typeof v === 'object') ? JSON.stringify(v) : String(v));
    }).join('\n');
  }

  // ---- 布局: 两栏 (行) / 堆叠 ----
  var _SF_STACK_TYPES = { textarea: 1, miniText: 1, lines: 1, linesScalar: 1, kv: 1, kvRest: 1, listOf: 1, mapOf: 1, union: 1, object: 1, wholeText: 1, kvWhole: 1, components: 1, model: 1, popup: 1, tabs: 1, events: 1 };
  function _sfIsStack(t) { return _SF_STACK_TYPES[t] === 1; }

  // ---- 控件 (无标签) ----
  function _sfInput(def, path, value, type) {
    var pick = _sfEffPicker(def, path);
    return '<input class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (type || 'text') + '"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      (pick && _sfHasList(pick) ? ' list="ce-dl-' + _escHtml(pick) + '"' : '') +
      ' value="' + _escHtml(_sfScalarText(value)) + '" spellcheck="false">';
  }
  function _sfCheckbox(def, path, value) {
    return '<input type="checkbox" class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="bool"' + (value ? ' checked' : '') + '>';
  }
  function _sfSelect(def, path, value) {
    var opts = def.options || [];
    var num = false;
    for (var i = 0; i < opts.length; i++) {
      if (typeof opts[i] === 'number') { num = true; break; }
    }
    var html = '<select class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="select"' + (num ? ' data-sf-num="1"' : '') + '>' +
      '<option value="">-- ' + _escHtml(_t('craftengine.fieldEmpty')) + ' --</option>';
    for (var j = 0; j < opts.length; j++) {
      var o = opts[j];
      var ov = (o !== null && typeof o === 'object') ? o.v : o;
      var ol = (o !== null && typeof o === 'object') ? (o.l !== undefined ? o.l : String(o.v)) : String(o);
      html += '<option value="' + _escHtml(String(ov)) + '"' + (String(value) === String(ov) ? ' selected' : '') + '>' + _escHtml(String(ol)) + '</option>';
    }
    return html + '</select>';
  }
  function _sfTextarea(def, path, value, rows) {
    return '<textarea class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="text"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + (rows || def.rows || 4) + '" spellcheck="false">' + _escHtml(_sfScalarText(value)) + '</textarea>';
  }
  function _sfLines(def, path, value, scalar) {
    value = _ceUnwrap(value);
    var arr;
    if (Array.isArray(value)) arr = value;
    else if (value === undefined || value === null) arr = [];
    else arr = [String(value)];
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (scalar ? 'lines-scalar' : 'lines') + '"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + (scalar ? (arr.length > 1 ? Math.min(arr.length + 1, 8) : 2) : Math.max(2, Math.min(arr.length + 1, 8))) + '" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _sfKvTextarea(def, path, value, exclude) {
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var lines = [];
    Object.keys(obj).forEach(function (k) {
      if (exclude && exclude.indexOf(k) !== -1) return;
      var v = obj[k];
      lines.push(k + ': ' + ((v && typeof v === 'object') ? JSON.stringify(v) : String(v)));
    });
    return '<textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (def.type === 'kvRest' ? 'kv-rest' : 'kv') + '"' +
      (exclude ? ' data-sf-exclude="' + _escHtml(exclude.join(',')) + '"' : '') +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' rows="' + Math.max(3, Math.min(lines.length + 1, 10)) + '" spellcheck="false">' + _escHtml(lines.join('\n')) + '</textarea>';
  }
  function _sfScalarInput(def, path, value, type) {
    return '<input class="ce-input" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="' + (type || 'scalar') + '"' +
      (def.placeholder ? ' placeholder="' + _escHtml(_labelOf(def.placeholder)) + '"' : '') +
      ' value="' + _escHtml(_sfScalarText(value)) + '" spellcheck="false">';
  }
  function _sfWholeText(def, value, rows) {
    return '<textarea class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-text"' +
      ' rows="' + (rows || 3) + '" spellcheck="false">' + _escHtml(_sfScalarText(value)) + '</textarea>';
  }
  function _sfKvWhole(def, value) {
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return '<textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="kv-whole"' +
      ' rows="' + Math.max(3, Math.min(Object.keys(obj).length + 1, 12)) + '" spellcheck="false">' + _escHtml(_sfObjText(obj)) + '</textarea>';
  }
  // 整条 YAML 编辑: 任意键值对集合, 支持深层嵌套 / $$ 版本键 / !!type 值 (templates 等)
  // 背景 pre 层高亮 ${xxx} 占位符: textarea 文字透明, pre 显示高亮文本, 滚动同步
  function _ceYamlHighlight(txt) {
    var esc = _escHtml(txt);
    return esc.indexOf('${') === -1 ? esc : esc.replace(/(\$\{[^}]*\})/g, '<span class="ce-yaml-var">$1</span>');
  }
  function _sfYamlWhole(value) {
    var obj = value;
    var txt;
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      txt = _genMapLines(obj, 0).join('\n');
    } else {
      txt = (obj === undefined || obj === null) ? '' : (typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
    var rows = Math.max(6, Math.min(txt.split('\n').length + 1, 16));
    return '<div class="ce-yaml-box">' +
      '<pre class="ce-input ce-kv-field ce-yaml-hl" aria-hidden="true">' + _ceYamlHighlight(txt) + '</pre>' +
      '<textarea class="ce-input ce-kv-field ce-yaml-ta" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="yaml-whole"' +
      ' rows="' + rows + '" wrap="off" spellcheck="false">' + _escHtml(txt) + '</textarea>' +
      '</div>';
  }
  function _sfControl(def, path, value) {
    var t = def.type || 'text';
    if (t === 'number') return _sfInput(def, path, value, 'number');
    if (t === 'bool') return _sfCheckbox(def, path, value);
    if (t === 'select') return _sfSelect(def, path, value);
    if (t === 'textarea' || t === 'miniText') return _sfPickWrap(def, path, _sfTextarea(def, path, value, t === 'miniText' ? 2 : 0));
    if (t === 'lines') {
      var lh = _sfLines(def, path, value, false);
      return _sfPickWrap(def, path, def.mini ? _sfMiniWrap(lh) : lh);
    }
    if (t === 'linesScalar') {
      var ls = _sfLines(def, path, value, true);
      return _sfPickWrap(def, path, def.mini ? _sfMiniWrap(ls) : ls);
    }
    if (t === 'kv' || t === 'kvRest') return _sfKvTextarea(def, path, value);
    if (t === 'scalar') return _sfPickWrap(def, path, _sfScalarInput(def, path, value));
    if (t === 'string-scalar') return _sfPickWrap(def, path, _sfScalarInput(def, path, value, 'string-scalar'));
    var html = _sfInput(def, path, value, 'text');
    return _sfPickWrap(def, path, def.mini ? _sfMiniWrap(html) : html);
  }
  // CE 元素 picker: 带 datalist/picker 标记的文本类输入框右侧加 ▾ 按钮 (设置关闭时不渲染)
  function _sfPickWrap(def, path, html) {
    var name = _sfEffPicker(def, path);
    if (!name || typeof document === 'undefined') return html;
    if (!_sfHasList(name)) return html;
    if (document.body && document.body.classList && !document.body.classList.contains('ce-element-picker')) return html;
    return '<span class="ce-sf-pick-wrap">' + html +
      '<button type="button" class="ce-sf-pick-btn" data-sf-action="picker-open" data-sf-picker="' + _escHtml(name) + '" data-sf-path="' + _escHtml(path) + '" data-tip="' + _escHtml(_t('craftengine.pickerBtn')) + '" title="' + _escHtml(_t('craftengine.pickerBtn')) + '">▾</button>' +
      '</span>';
  }
  // MiniMessage 快捷按钮: 输入框右侧留出小段距离放置铅笔按钮
  function _sfMiniWrap(html) {
    return '<div class="ce-sf-mini-wrap">' + html +
      '<button type="button" class="ce-sf-mini-btn" data-sf-action="mini-edit" data-tip="' + _escHtml(_t('minimessage.editBtn', 'MiniMessage 编辑器')) + '">✏️</button>' +
      '</div>';
  }
  function _sfDatalistHtml() {
    _sfInit();
    _ceAssetsEnsureBind();
    if (!_sfDatalistMap) return '';
    var html = '';
    Object.keys(_sfDatalistMap).forEach(function (name) {
      html += '<datalist id="ce-dl-' + _escHtml(name) + '">';
      var arr = _sfDatalistMap[name] || [];
      for (var i = 0; i < arr.length; i++) html += '<option value="' + _escHtml(String(arr[i])) + '">';
      html += '</datalist>';
    });
    return html;
  }

  // ---- CE 元素 picker 下拉面板 ----
  var _cePickerOpen = null;
  var _cePickerBound = false;
  function _sfClosePicker() {
    var p = _cePickerOpen;
    _cePickerOpen = null;
    if (p && p.panel && p.panel.parentNode) p.panel.parentNode.removeChild(p.panel);
  }
  function _sfPickerTarget(btn) {
    var wrap = btn.closest ? btn.closest('.ce-sf-pick-wrap') : null;
    return wrap ? wrap.querySelector('input.ce-input, textarea.ce-input') : null;
  }
  function _sfPickerItems(name) {
    _sfInit();
    return (_sfDatalistMap[name] || []).slice();
  }
  function _sfPickerRender(panel, st, query) {
    var q = String(query || '').trim().toLowerCase();
    var items = st.list.filter(function (v) { return !q || String(v).toLowerCase().indexOf(q) !== -1; });
    var ns = _sfCurNamespace(st);
    if (ns && items.length > 1) {
      // 当前命名空间条目优先, 其余按字母序
      items = items.slice().sort(function (a, b) {
        var na = String(a).split(':')[0] === ns ? 0 : 1;
        var nb = String(b).split(':')[0] === ns ? 0 : 1;
        if (na !== nb) return na - nb;
        return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
      });
    }
    var body;
    if (!st.list.length) {
      var scanning = false;
      if (st.file) {
        var cfg0 = _ceElemConfigDir(st.file);
        var rec0 = cfg0 ? _ceElemCache[cfg0] : null;
        scanning = !!(rec0 && rec0.state === 'loading');
        // 同 resources 根下其它命名空间仍在扫描也算扫描中
        if (!scanning && cfg0) {
          var res0 = _ceElemResourcesRoot(cfg0);
          if (res0) {
            Object.keys(_ceElemCache).forEach(function (cd) {
              if (!scanning && _ceElemCache[cd] && _ceElemCache[cd].state === 'loading' &&
                  _ceElemResourcesRoot(cd) === res0) scanning = true;
            });
          }
        }
        // 重扫后缓存记录重建前的空窗期 (记录缺失或仍在 loading) 视为扫描中
        if (!scanning && cfg0) {
          var recC0 = _ceElemCache[cfg0];
          if ((!recC0 || recC0.state === 'loading') && Date.now() - _ceElemRescanAt < 30000) scanning = true;
        }
      }
      body = '<div class="ce-picker-empty">' + _escHtml(_t(scanning ? 'craftengine.pickerScanning' : 'craftengine.pickerEmpty')) + '</div>';
    } else if (!items.length) {
      body = '<div class="ce-picker-empty">' + _escHtml(_t('craftengine.pickerNoMatch')) + '</div>';
    } else {
      body = items.map(function (v) {
        return '<div class="ce-picker-item" data-ce-picker-value="' + _escHtml(String(v)) + '" title="' + _escHtml(String(v)) + '">' + _escHtml(String(v)) + '</div>';
      }).join('');
    }
    var foot = '<span>' + _escHtml(_t('craftengine.pickerCount', { n: items.length })) + '</span>';
    if (st.file) {
      foot += '<button type="button" class="ce-picker-rescan" data-ce-picker-action="rescan" title="' + _escHtml(_t('craftengine.pickerRescan')) + '">⟳</button>';
    }
    var listEl = panel.querySelector('.ce-picker-list');
    if (listEl) listEl.innerHTML = body;
    var footEl = panel.querySelector('.ce-picker-foot');
    if (footEl) footEl.innerHTML = foot;
  }
  function _sfPickerRefreshOnDone() {
    var p = _cePickerOpen;
    if (!p || !p.panel || !p.panel.isConnected) return;
    p.list = _sfPickerItems(p.name);
    var sb = p.panel.querySelector('.ce-picker-search');
    _sfPickerRender(p.panel, p, sb ? sb.value : '');
  }
  function _sfPickerFill(target, val) {
    if (!target) return;
    var isLines = target.classList.contains('ce-lines-field');
    if (isLines) {
      // 多行输入: 追加一行 (去重), 面板保持打开可连续添加
      var lines = target.value ? target.value.split('\n') : [];
      if (lines.indexOf(val) === -1) {
        lines.push(val);
        target.value = lines.join('\n');
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      target.value = val;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      _sfClosePicker();
    }
  }
  function _sfPickerRescan(panel) {
    var st = _cePickerOpen;
    if (!st) return;
    var emptyEl = panel.querySelector('.ce-picker-empty');
    if (emptyEl) emptyEl.textContent = _t('craftengine.pickerScanning');
    _ceElemRescan(st.file);
  }
  function _sfPickerBindGlobal() {
    if (_cePickerBound || !ROOT.document) return;
    _cePickerBound = true;
    var doc = ROOT.document;
    function _sfPickerMousedown(e) {
      if (!_cePickerOpen) return;
      var t = e.target;
      if (t && t.closest && t.closest('.ce-picker-panel')) return;
      if (t && t.closest && t.closest('.ce-sf-pick-btn')) return;
      _sfClosePicker();
    }
    function _sfPickerKeydown(e) {
      if (_cePickerOpen && e.key === 'Escape') _sfClosePicker();
    }
    function _sfPickerScroll(e) {
      if (!_cePickerOpen) return;
      var t = e.target;
      if (t && t !== doc && typeof t.closest === 'function' && t.closest('.ce-picker-panel')) return;
      _sfClosePicker();
    }
    function _sfPickerResize() { _sfClosePicker(); }
    _sfPickerBindGlobal._mousedown = _sfPickerMousedown;
    _sfPickerBindGlobal._keydown = _sfPickerKeydown;
    _sfPickerBindGlobal._scroll = _sfPickerScroll;
    _sfPickerBindGlobal._resize = _sfPickerResize;
    doc.addEventListener('mousedown', _sfPickerMousedown, true);
    doc.addEventListener('keydown', _sfPickerKeydown, true);
    doc.addEventListener('scroll', _sfPickerScroll, true);
    if (doc.defaultView) doc.defaultView.addEventListener('resize', _sfPickerResize);
  }
  function _sfPickerUnbindGlobal() {
    if (!_cePickerBound || !ROOT.document) return;
    _cePickerBound = false;
    var doc = ROOT.document;
    if (_sfPickerBindGlobal._mousedown) doc.removeEventListener('mousedown', _sfPickerBindGlobal._mousedown, true);
    if (_sfPickerBindGlobal._keydown) doc.removeEventListener('keydown', _sfPickerBindGlobal._keydown, true);
    if (_sfPickerBindGlobal._scroll) doc.removeEventListener('scroll', _sfPickerBindGlobal._scroll, true);
    if (doc.defaultView && _sfPickerBindGlobal._resize) doc.defaultView.removeEventListener('resize', _sfPickerBindGlobal._resize);
    _sfPickerBindGlobal._mousedown = null;
    _sfPickerBindGlobal._keydown = null;
    _sfPickerBindGlobal._scroll = null;
    _sfPickerBindGlobal._resize = null;
  }
  function _sfOpenPicker(btn, name, containerEl) {
    var doc = ROOT.document;
    if (!doc || !doc.body) return;
    if (_cePickerOpen && _cePickerOpen.btn === btn) { _sfClosePicker(); return; }
    var target = _sfPickerTarget(btn);
    if (!target) return;
    _sfClosePicker();
    _sfInit();
    _sfPickerBindGlobal();
    var panel = doc.createElement('div');
    panel.className = 'ce-picker-panel';
    panel.setAttribute('data-ce-picker', name);
    panel.innerHTML = '<div class="ce-picker-head"><input class="ce-picker-search" placeholder="' +
      _escHtml(_t('craftengine.pickerSearch')) + '" spellcheck="false"></div>' +
      '<div class="ce-picker-list"></div><div class="ce-picker-foot"></div>';
    doc.body.appendChild(panel);
    _cePickerOpen = { panel: panel, btn: btn, target: target, name: name, list: _sfPickerItems(name), file: containerEl._ceFilePath };
    _sfPickerRender(panel, _cePickerOpen, '');
    var rect = btn.getBoundingClientRect();
    var top = rect.bottom + 4;
    var maxTop = doc.defaultView.innerHeight - panel.offsetHeight - 8;
    if (top > maxTop) top = Math.max(8, maxTop);
    panel.style.top = Math.round(top) + 'px';
    panel.style.right = Math.round(Math.max(8, doc.defaultView.innerWidth - rect.right)) + 'px';
    var sb = panel.querySelector('.ce-picker-search');
    if (sb) {
      sb.focus();
      sb.addEventListener('input', function () { _sfPickerRender(panel, _cePickerOpen, sb.value); });
    }
    panel.addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('[data-ce-picker-value], [data-ce-picker-action]') : null;
      if (!it) return;
      if (it.getAttribute('data-ce-picker-action') === 'rescan') { _sfPickerRescan(panel); return; }
      var val = it.getAttribute('data-ce-picker-value');
      if (val == null) return;
      var cur = _cePickerOpen;
      _sfPickerFill(cur && cur.panel === panel ? cur.target : null, val);
    });
    _ceElemOnDone(_sfPickerRefreshOnDone);
  }
  // 容器类字段标签: object (内含子字段) 作为分类标题加大加深, 与子字段区分 (如 INSERT LORE / LEGACY MODEL)
  // 仅 object; listOf/union 等数据容器不算分类, 避免 INSERT LORE 内部的 INSERT 列表标签也被加大
  var _SF_CAT_TYPES = { object: 1 };
  function _sfWrap(def, html, path, value) {
    var label = _labelOf(def);
    var icon = _sfHintIcon(def, path);
    var spec = _sfSpecIcon(def, path, value);
    var hint = def.hint ? '<div class="ce-sf-hint">' + _escHtml(_labelOf(def.hint)) + '</div>' : '';
    if (_sfIsStack(def.type) || def.layout === 'stack') {
      var lblCls = _SF_CAT_TYPES[def.type] ? 'ce-field-label ce-cat-label' : 'ce-field-label';
      return '<div class="ce-stack"><label class="' + lblCls + '">' + _escHtml(label) + icon + spec + '</label>' + hint + html + '</div>';
    }
    return '<div class="ce-row"><label class="ce-field-label">' + _escHtml(label) + icon + spec + '</label>' +
      '<div class="ce-row-ctrl">' + html + hint + '</div></div>';
  }
  function _sfFieldHtml(def, path, value, opts) {
    var t = def.type || 'text';
    var inner = _sfIsStack(t) ? _sfItemHtml(def, path, value, opts) : _sfControl(def, path, value);
    return _sfWrap(def, inner, path, value);
  }

  // ---- 字段路径 → 补全数据源 自动映射 ----
  // 未显式声明 datalist/picker 的字段按「路径末段」自动挂上资源补全 (原版资源 + 工程资源)。
  // 数据源由 ce-mcassets.js 提供, 未配置/未扫描时退化为原版常量列表。
  var _SF_AUTO_PICK = [
    // 精确路径优先 (整条 path 匹配, 用正则 ^...$)
    { re: /^result\.id$/, list: 'items' },
    { re: /^use_remainder\.id$/, list: 'items' },
    { re: /\.result\.id$/, list: 'items' },
    { re: /\.ingredient$/, list: 'items' },
    { re: /\.using_converts_to$/, list: 'items' },
    { re: /^overrides\.[^.]+$/, list: 'items' },
    // 末段匹配
    { re: /(^|\.)textures$/, list: 'textures', listItem: true },
    { re: /(^|\.)texture$/, list: 'textures' },
    { re: /(^|\.)models$/, list: 'models', listItem: true },
    { re: /(^|\.)(item_model|model_path|custom_model|model)$/, list: 'models' },
    { re: /(^|\.)material$/, list: 'items' },
    { re: /(^|\.)(item|icon)$/, list: 'items' },
    { re: /(^|\.)font$/, list: 'fonts' },
    { re: /(^|\.)particle$/, list: 'particles' },
    { re: /(^|\.)(sound|equip_sound|break_sound|place_sound|hit_sound|step_sound|fall_sound|land_sound|open_sound|close_sound|insert_sound|remove_sound|sound_event)$/, list: 'soundEvents' },
    { re: /(^|\.)(enchantment)$/, list: 'enchantments' },
    { re: /(^|\.)(potion_effect|effect)$/, list: 'potionEffects' },
    { re: /(^|\.)biome$/, list: 'biomes' },
    { re: /(^|\.)(entity|entity_type|mob)$/, list: 'entities' },
    { re: /(^|\.)attribute$/, list: 'attributes' },
    { re: /(^|\.)(recipe|loot_table|loot_source)$/, list: 'recipes' },
    { re: /(^|\.)(ref|image)$/, list: 'images' },
    { re: /(^|\.)category$/, list: 'categories' },
    { re: /(^|\.)template$/, list: 'templates' },
    { re: /(^|\.)painting_variant$/, list: 'paintings' },
  ];
  // 哪些 auto-pick 允许把「路径末段本身」当作数据源键 (listOf 的父字段)
  function _sfAutoPickList(path) {
    var p = String(path || '');
    for (var i = 0; i < _SF_AUTO_PICK.length; i++) {
      var r = _SF_AUTO_PICK[i];
      if (r.re.test(p)) return r.list;
    }
    return null;
  }
  // 单个字段的有效补全数据源: 显式 picker > 显式 datalist > 路径自动推断
  function _sfEffPicker(def, path) {
    if (!def) return null;
    if (def.picker) return def.picker;
    if (def.datalist) return def.datalist;
    return _sfAutoPickList(path);
  }
  function _sfHasList(name) {
    if (!name) return false;
    _sfInit();
    return !!(_sfDatalistMap && _sfDatalistMap[name]);
  }
  // listOf: 值自身是数组, 末段即数据源名 (textures/models), 把 datalist 注入 itemType
  function _sfListItemDef(def, path) {
    var itemDef = def.itemType;
    if (!itemDef || itemDef.datalist || itemDef.picker) return itemDef;
    if (itemDef.type && itemDef.type !== 'text' && itemDef.type !== 'scalar' && itemDef.type !== 'string-scalar') return itemDef;
    var name = _sfAutoPickList(path) || _sfAutoPickList(path + '.x');
    if (!name || !_sfHasList(name)) return itemDef;
    var copy = {};
    for (var k in itemDef) if (Object.prototype.hasOwnProperty.call(itemDef, k)) copy[k] = itemDef[k];
    copy.datalist = name;
    return copy;
  }

  // ---- CE 别名键 ----------------------------------------------------------
  // CraftEngine 通过 ConfigKeys.of("a|b|c") 接受多个键名 (behavior/behaviors、texture/textures…)。
  // ce-cekeys.js 由 CE 源码生成, 这里据此把 schema 的规范键映射到文件里实际写的那个键。
  function _ceAliasKeyIn(data, key, canonicalSet) {
    if (!data || typeof data !== 'object') return null;
    var db = (typeof CECeKeys !== 'undefined') ? CECeKeys : null;
    if (!db || !db.aliasOf) return null;
    var norm = String(key).toLowerCase().replace(/-/g, '_');
    var alts = db.aliasOf[norm];
    if (!alts || !alts.length) return null;
    for (var i = 0; i < alts.length; i++) {
      var cand = alts[i];
      if (cand === norm) continue;
      // 别名本身若是本 schema 的另一个规范键 (如 model 既是 item_model 的别名又是独立字段),
      // 不能拿来绑定, 否则同一 YAML 键会被两个字段重复渲染
      if (canonicalSet && canonicalSet[cand]) continue;
      if (data[cand] !== undefined) return cand;
      var dashed = cand.replace(/_/g, '-');
      if (canonicalSet && canonicalSet[dashed]) continue;
      if (data[dashed] !== undefined) return dashed;
    }
    return null;
  }

  // CEHints (craftengine-hints.js): 文档原文提示数据库, key = 字段完整路径
  // 注意: interpreter 先于 hints 加载 (index.html), 必须按需读取, 不能加载时捕获
  function _sfCeHints() {
    return (typeof CEHints !== 'undefined') ? CEHints : null;
  }
  function _sfHintKey(path) {
    return String(path || '').replace(/^__popup__\.?/, '');
  }
  function _sfTipOf(h) {
    if (h === null || h === undefined) return '';
    if (typeof h === 'string') return h;
    return (typeof I18N !== 'undefined' && I18N.pick) ? I18N.pick(h) : (h.zh || h.en || '');
  }
  // 原生 title 用: 剥离富文本标记 (**粗体** / `代码` / §颜色码 / 换行)
  function _sfPlain(t) {
    return String(t || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/§[0-9a-fk-orlmn]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ');
  }
  // 短键词条有歧义 (多个 section 共用字段名, 词条来自特定 section, 如 type=战利品源类型):
  // 命中短键词条的字段若有 schema 显式 hint, 优先用 hint, 避免张冠李戴 (lootSource.type 等无 hint 的仍用词条)
  var _sfAmbiguousShortKeys = { type: 1, height: 1, asset_id: 1, category: 1, conditions: 1 };
  function _sfTipText(def, path) {
    var db = _sfCeHints();
    var k = _sfHintKey(path);
    var h = null;
    var srcKey = null;
    if (db && k) { h = db[k]; srcKey = k; }
    // 连字符键文件 (方块设置等): 提示库键为下划线形式, 如 settings.push-reaction → settings.push_reaction
    if (!h && db && k && k.indexOf('-') !== -1) {
      var ks = k.replace(/-/g, '_');
      if (db[ks]) { h = db[ks]; srcKey = ks; }
    }
    if (!h && db && def && def.key) { h = db[def.key]; srcKey = def.key; }
    if (!h && def) h = def.hint;
    if (h && srcKey && srcKey.indexOf('.') === -1 && def && def.key && def.hint && _sfAmbiguousShortKeys[def.key]) h = def.hint;
    return _sfTipOf(h);
  }
  // 高级版专属字段 (wiki 标记 Premium Exclusive), tooltip 末尾追加红色提示
  // 键名比对统一把下划线/连字符/大小写归一, 避免 client_bound_data 与 client-bound-data 漏判
  var _sfPremiumKeys = ['client_bound_data', 'client_bound_material', 'data.conditional', 'visual_result', 'functions', 'variants.entity_culling', 'config.item.client-bound-model'];
  var _sfPremiumSet = (function () {
    var s = {};
    for (var i = 0; i < _sfPremiumKeys.length; i++) s[_sfNormKey(_sfPremiumKeys[i])] = 1;
    return s;
  })();
  function _sfNormKey(k) {
    return String(k == null ? '' : k).replace(/[-_]/g, '').toLowerCase();
  }
  function _sfIsPremiumKey(k) {
    if (!k) return false;
    return _sfPremiumSet[_sfNormKey(k)] === 1;
  }
  function _sfPremiumHidden() {
    return typeof document !== 'undefined' && !!(document.body && document.body.classList && document.body.classList.contains('ce-hide-premium-hints'));
  }
  // 版本限制字段 (tooltip 内含 1.20.x+ / 1.21.2+ / 1.20.4- 等标记), 末尾追加绿色版本提示
  var _sfVersionRe = /(?:1\.\d{1,2}(?:\.\d{1,2})?(?:\.x)?[-+]|\d{1,2}\.x[-+])/gi;
  function _sfVersionOf(txt) {
    var list = [];
    var m;
    var re = new RegExp(_sfVersionRe.source, 'gi');
    while ((m = re.exec(String(txt || ''))) !== null) {
      if (list.indexOf(m[0]) === -1) list.push(m[0]);
    }
    return list;
  }
  function _sfVersionHidden() {
    return typeof document !== 'undefined' && !!(document.body && document.body.classList && document.body.classList.contains('ce-hide-version-hints'));
  }
  // 字段 schema 定义缓存: 渲染 tooltip 编辑器方式时按路径取 def 分情况渲染控件
  var _sfHintDefs = {};
  function _sfHintIcon(def, path) {
    var tip = _sfTipText(def, path);
    if (!tip) return '';
    var k = _sfHintKey(path);
    if (k && def) _sfHintDefs[k] = def;
    var isPremium = _sfIsPremiumKey(k) || (def && _sfIsPremiumKey(def.key));
    if (isPremium && !_sfPremiumHidden()) {
      tip += '\n\n§c' + _t('craftengine.premiumHint');
    }
    var versions = _sfVersionOf(tip);
    if (versions.length && !_sfVersionHidden()) {
      tip += '\n\n§a' + _t('craftengine.versionHint', { versions: versions.join('、') });
    }
    return '<span class="ce-sf-hint-icon" data-sf-hint="' + _escHtml(tip) + '" data-sf-path="' + _escHtml(k) + '">ℹ</span>';
  }
  // ---- 特殊配置 (! 按钮): 版本条件键 ($$...) / 值类型 (!!type) ----
  // 版本键 (wiki configuration.mdx): $$1.21.4 (固定) / $$1.20.1~1.21.4 (范围) / $$>=1.21.4 (比较) / $$fallback (回退)
  var _sfVersionKeyRe = /^\$\$[^$]+$/;
  var _sfSpecMapTypes = { mapOf: 1, map: 1, components: 1, model: 1, object: 1, kv: 1, kvRest: 1, union: 1, wholeText: 1, kvWhole: 1 };
  var _sfSpecScalarTypes = { text: 1, number: 1, bool: 1, select: 1, 'string-scalar': 1, miniText: 1, textarea: 1, linesScalar: 1, lines: 1 };
  function _sfSpecState(def, path, value) {
    var st = { hasSpec: false, versions: [], type: '' };
    var v = value;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !_ceIsWrap(v)) {
      Object.keys(v).forEach(function (k) {
        if (_sfVersionKeyRe.test(k)) st.versions.push(k);
      });
    }
    if (_ceIsWrap(v)) st.type = v.__ceTag;
    st.hasSpec = st.versions.length > 0 || st.type !== '';
    return st;
  }
  function _sfSpecIcon(def, path, value) {
    var st = _sfSpecState(def, path, value);
    var ttl = _t('craftengine.specTitle');
    var det = [];
    if (st.versions.length) det.push(_t('craftengine.specHasVersions', { n: st.versions.length }));
    if (st.type) det.push(_t('craftengine.specHasType', { type: st.type }));
    if (det.length) ttl += ' · ' + det.join(' · ');
    var ft = (def && def.type) || '';
    return '<button type="button" class="ce-sf-spec-icon' + (st.hasSpec ? ' has-spec' : '') + '" data-sf-action="spec-popup"' +
      ' data-sf-path="' + _escHtml(path) + '" data-sf-ftype="' + _escHtml(ft) + '"' +
      ' data-sf-label="' + _escHtml(_labelOf(def)) + '" data-tip="' + _escHtml(ttl) + '">!</button>';
  }
  function _sfBindHintIcons() {
    if (typeof RichTooltip === 'undefined') return;
    if (document.__ceHintIconsBound) return;
    document.__ceHintIconsBound = 1;
    function _onMouseover(e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      var icon = (t.classList && t.classList.contains('ce-sf-hint-icon')) ? t : (t.closest ? t.closest('.ce-sf-hint-icon') : null);
      if (!icon || icon.__ceTip) return;
      icon.__ceTip = 1;
      var txt = icon.getAttribute('data-sf-hint');
      if (!txt) return;
      var def = _sfHintDefs[icon.getAttribute('data-sf-path') || ''];
      var html = _sfTipEditorHtml(txt, def);
      RichTooltip.bind(icon, function () { return html; });
      RichTooltip.show(e, html);
    }
    function _onClickHint(e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      var icon = (t.classList && t.classList.contains('ce-sf-hint-icon')) ? t : (t.closest ? t.closest('.ce-sf-hint-icon') : null);
      if (!icon) return;
      e.preventDefault();
      e.stopPropagation();
      _sfOpenHintPopup(icon);
    }
    function _onClickTab(e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
      var tab = t.classList && t.classList.contains('ce-yv-tab') ? t : (t.closest ? t.closest('.ce-yv-tab') : null);
      if (!tab) return;
      var root = tab.parentNode ? tab.parentNode.parentNode : null;
      if (!root || !root.classList || !root.classList.contains('ce-yv-tabs')) return;
      _sfSwitchTab(root, parseInt(tab.getAttribute('data-ce-tab') || '0', 10));
    }
    function _onKeydownHint(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var root = _sfCurrentTabs();
      if (!root) return;
      var cur = 0;
      var tabs = root.querySelectorAll('.ce-yv-tab');
      for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains('is-active')) { cur = i; break; }
      _sfSwitchTab(root, cur + (e.key === 'ArrowRight' ? 1 : -1));
      e.preventDefault();
    }
    _sfBindHintIcons._mouseover = _onMouseover;
    _sfBindHintIcons._clickHint = _onClickHint;
    _sfBindHintIcons._clickTab = _onClickTab;
    _sfBindHintIcons._keydown = _onKeydownHint;
    document.addEventListener('mouseover', _onMouseover);
    document.addEventListener('click', _onClickHint);
    document.addEventListener('click', _onClickTab);
    document.addEventListener('keydown', _onKeydownHint);
  }
  function _sfUnbindHintIcons() {
    if (typeof document === 'undefined' || !document.__ceHintIconsBound) return;
    document.__ceHintIconsBound = 0;
    if (_sfBindHintIcons._mouseover) document.removeEventListener('mouseover', _sfBindHintIcons._mouseover);
    if (_sfBindHintIcons._clickHint) document.removeEventListener('click', _sfBindHintIcons._clickHint);
    if (_sfBindHintIcons._clickTab) document.removeEventListener('click', _sfBindHintIcons._clickTab);
    if (_sfBindHintIcons._keydown) document.removeEventListener('keydown', _sfBindHintIcons._keydown);
    _sfBindHintIcons._mouseover = null;
    _sfBindHintIcons._clickHint = null;
    _sfBindHintIcons._clickTab = null;
    _sfBindHintIcons._keydown = null;
  }
  _sfBindHintIcons();

  // ---- 提示详情弹窗 + YAML 编辑器方式树 (tooltip 内的 ```yaml 块 → 表单式结构) ----
  // 只切出 yaml 代码块; 非 yaml 代码块整段保留交给 RichTooltip.md 渲染 (它自己处理 ``` 围栏)
  function _sfSplitTip(txt) {
    var s = String(txt || '');
    var out = [];
    var i = 0, n = s.length;
    while (i < n) {
      var fence = s.indexOf('```', i);
      if (fence === -1) { out.push({ yaml: false, text: s.slice(i) }); break; }
      var fe = s.indexOf('```', fence + 3);
      if (fe === -1) { out.push({ yaml: false, text: s.slice(i) }); break; }
      var fin = s.slice(fence + 3, fe);
      if (!/^yaml\b/i.test(fin)) {
        // 非 yaml 代码块: 连同围栏整段保留, 交给 RichTooltip.md 渲染
        if (fence > i) out.push({ yaml: false, text: s.slice(i, fe + 3) });
        i = fe + 3;
        continue;
      }
      var lm = /^[a-zA-Z0-9_-]*\n/.exec(fin);
      var body = lm ? fin.slice(lm[0].length) : fin;
      if (fence > i) out.push({ yaml: false, text: s.slice(i, fence) });
      out.push({ yaml: true, text: body });
      i = fe + 3;
    }
    return out;
  }
  function _sfYvType(v) {
    if (v === null || v === undefined) return 'null';
    if (_ceIsWrap(v)) return 'wrap';
    if (Array.isArray(v)) return 'arr';
    if (typeof v === 'object') return 'obj';
    return typeof v;
  }
  function _sfWrapText(v) {
    if (_ceIsWrap(v)) {
      var inner = Array.isArray(v.v) ? JSON.stringify(v.v) : String(v.v);
      return '!!' + v.__ceTag + ' ' + inner;
    }
    return String(v);
  }
  // 控件模拟: 按值类型分情况 (文本→输入框 / 数字→数字框 / 布尔→勾选框 / null→空 / type 键→下拉 / !!type→类型前缀)
  function _sfYvCtrl(v, isTypeKey) {
    var t = _sfYvType(v);
    if (t === 'null') return '<span class="ce-yv-ctrl ce-yv-nullctrl">' + _escHtml(_t('craftengine.yvEmpty')) + '</span>';
    if (t === 'boolean') return '<span class="ce-yv-ctrl ce-yv-boolctrl' + (v ? ' is-on' : '') + '">' + (v ? '☑' : '☐') + ' ' + v + '</span>';
    if (t === 'number') return '<span class="ce-yv-ctrl ce-yv-numctrl">' + v + '</span>';
    if (t === 'wrap') return '<span class="ce-yv-ctrl ce-yv-textctrl ce-yv-wrapctrl">' + _escHtml(_sfWrapText(v)) + '</span>';
    if (isTypeKey) return '<span class="ce-yv-ctrl ce-yv-select">' + _escHtml(String(v)) + '<span class="ce-yv-sel-arrow">▾</span></span>';
    return '<span class="ce-yv-ctrl ce-yv-textctrl">' + _escHtml(String(v)) + '</span>';
  }
  function _sfYvPlain(v) {
    var t = _sfYvType(v);
    if (t === 'null') return 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'wrap') return _sfWrapText(v);
    return String(v);
  }
  // 递归生成只读「编辑器方式」结构: 对象=字段组(字段名标签+控件), 列表=每行一个控件 (无 YAML 语法)
  function _sfYvHtml(v, ind, isItem) {
    var t = _sfYvType(v);
    var pad = 'padding-left:' + (ind * 18) + 'px';
    var html = '';
    if (t === 'arr') {
      if (!v.length) return '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-type">' + _escHtml(_t('craftengine.yvList')) + '</span></div>';
      for (var i = 0; i < v.length; i++) {
        var item = v[i];
        if (item !== null && typeof item === 'object') {
          html += _sfYvHtml(item, ind, true);
        } else {
          html += '<div class="ce-yv-row" style="' + pad + '">' + _sfYvCtrl(item, false) + '</div>';
        }
      }
      return '<div class="ce-yv-group">' + html + '</div>';
    }
    if (t === 'obj') {
      var keys = Object.keys(v);
      if (!keys.length) return '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-type">' + _escHtml(_t('craftengine.yvObject')) + '</span></div>';
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        var val = v[k];
        var vt = _sfYvType(val);
        html += '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-key">' + _escHtml(k) + '</span>';
        if (vt === 'obj' || vt === 'arr') {
          html += '<span class="ce-yv-type">' + (vt === 'arr' ? _escHtml(_t('craftengine.yvList')) : _escHtml(_t('craftengine.yvObject'))) + '</span></div>';
          html += _sfYvHtml(val, ind + 1, false);
        } else {
          html += _sfYvCtrl(val, k === 'type') + '</div>';
        }
      }
      return '<div class="ce-yv-group">' + html + '</div>';
    }
    return '<div class="ce-yv-row" style="' + pad + '">' + _sfYvCtrl(v, false) + '</div>';
  }
  // 递归找目标字段: 深度大的(示例重点)优先
  function _sfFindKey(obj, key, depth) {
    if (!obj || typeof obj !== 'object') return null;
    var found = null;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var cur = (k === key) ? { val: v, ctx: obj, depth: depth } : null;
      if (v !== null && typeof v === 'object') {
        var sub = _sfFindKey(v, key, depth + 1);
        if (sub && (!found || sub.depth > found.depth)) found = sub;
      }
      if (cur && (!found || cur.depth > found.depth)) found = cur;
    });
    return found;
  }
  // 去掉示例里的集合/条目容器 (items: → 条目名 → 配置结构)
  function _sfUnwrapSample(obj) {
    var o = obj;
    for (var i = 0; i < 3; i++) {
      if (o === null || typeof o !== 'object' || Array.isArray(o)) break;
      var keys = Object.keys(o);
      if (keys.length !== 1) break;
      if (SECTION_KEYS.indexOf(keys[0]) !== -1 || keys[0].indexOf(':') !== -1) o = o[keys[0]];
      else break;
    }
    return o;
  }
  // 目标字段按 schema 类型分情况渲染 (与编辑器控件一致, 新手可对照):
  // 列表→每行一个控件 / union→下拉模拟 / 对象→字段组 / 布尔→勾选框 / 其余→文本框; 兄弟标量压缩为描述
  function _sfTargetHtml(def, val, ctx, ind) {
    var t = def.type || 'text';
    var pad = 'padding-left:' + (ind * 18) + 'px';
    var desc = '';
    if (ctx && typeof ctx === 'object') {
      var sibs = [];
      Object.keys(ctx).forEach(function (k) {
        if (k === def.key) return;
        var sv = ctx[k];
        if (sv !== null && typeof sv !== 'object') sibs.push(k + _t('craftengine.yvOf') + _sfYvPlain(sv));
      });
      if (sibs.length) desc = '（' + sibs.join('、') + '）';
    }
    if (t === 'listOf' || t === 'lines' || t === 'linesScalar' || Array.isArray(val)) {
      var arr = Array.isArray(val) ? val : [];
      var rows = '';
      for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (item !== null && typeof item === 'object') rows += _sfYvHtml(item, ind, true);
        else rows += '<div class="ce-yv-row" style="' + pad + '">' + _sfYvCtrl(item, false) + '</div>';
      }
      if (!rows) rows = '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-type">' + _escHtml(_t('craftengine.yvList')) + '</span></div>';
      return (desc ? '<div class="ce-yv-desc">' + _escHtml(desc) + '</div>' : '') + '<div class="ce-yv-group">' + rows + '</div>';
    }
    if (t === 'union') {
      var cur = _sfUnionCurrent(def, val);
      var curLabel = cur && cur.def ? _labelOf(cur.def) : _t('craftengine.unionEmpty');
      var body = '';
      var pad2 = 'padding-left:' + ((ind + 1) * 18) + 'px';
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        body = '<div class="ce-yv-row" style="' + pad2 + '"><span class="ce-yv-type">' + _escHtml(_t('craftengine.yvObject')) + '</span></div>' + _sfYvHtml(val, ind + 1, false);
      } else if (typeof val === 'string' && val !== '') {
        body = '<div class="ce-yv-row" style="' + pad2 + '">' + _sfYvCtrl(val, false) + '</div>';
      }
      return (desc ? '<div class="ce-yv-desc">' + _escHtml(desc) + '</div>' : '') +
        '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-ctrl ce-yv-select">' + _escHtml(curLabel) + '<span class="ce-yv-sel-arrow">▾</span></span></div>' + body;
    }
    if (t === 'object') {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return (desc ? '<div class="ce-yv-desc">' + _escHtml(desc) + '</div>' : '') + _sfYvHtml(val, ind + 1, false);
      }
    }
    if (t === 'popup') {
      var pc = _sfPopupContent(def);
      if (pc) return _sfTargetHtml(pc, val, null, ind);
    }
    if (t === 'mapOf' || t === 'map' || t === 'components' || t === 'model' || t === 'tabs' || t === 'kv' || t === 'kvRest') {
      if (val && typeof val === 'object') {
        return (desc ? '<div class="ce-yv-desc">' + _escHtml(desc) + '</div>' : '') + _sfYvHtml(val, ind + 1, false);
      }
    }
    if (t === 'bool') {
      return '<div class="ce-yv-row" style="' + pad + '"><span class="ce-yv-ctrl ce-yv-boolctrl' + (val ? ' is-on' : '') + '">' + (val ? '☑' : '☐') + ' ' + (val ? 'true' : 'false') + '</span></div>';
    }
    return '<div class="ce-yv-row" style="' + pad + '">' + _sfYvCtrl(val, false) + '</div>';
  }
  // 文本级切段: 多种情况 → 每个一段. 切点 = 重复容器键(多个 items 块)/直接条目键(含冒号);
  // 容器段内多条目再按条目切. 段名取前导注释, 无注释取段内第一个行内注释, 再退条目键名/「情况 N」
  function _sfSplitSections(yamlText) {
    var lines = yamlText.replace(/\r/g, '').split('\n');
    // 阶段1: 顶层切分
    var tops = [];
    var cur = null;
    var nameBuf = [];
    var lastTopKey = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^```/.test(l)) continue;
      var cm = /^#\s?(.*)$/.exec(l);
      if (cm) { nameBuf.push(cm[1].trim()); continue; }
      if (!l.trim()) { if (cur) cur.lines.push(''); continue; }
      var topM = /^([A-Za-z0-9_.\-]+(?::[A-Za-z0-9_.\-]+)*):/.exec(l);
      var isList = /^- /.test(l);
      if (topM || isList) {
        var key = isList ? '-' : topM[1];
        var isContainer = !isList && SECTION_KEYS.indexOf(topM[1]) !== -1;
        var newTop = false;
        if (!cur) newTop = true;
        else if (key === lastTopKey) newTop = true;
        else if (!cur.isContainer && key !== lastTopKey) newTop = true;
        if (newTop) {
          cur = { name: nameBuf.join(' ').trim(), isContainer: isContainer, lines: [], inline: '' };
          tops.push(cur);
          nameBuf = [];
          lastTopKey = key;
        }
      }
      if (!cur) { nameBuf.push(l.trim()); continue; }
      cur.lines.push(l);
      if (!cur.inline) {
        var ic = /#\s?(.*)$/.exec(l);
        if (ic) cur.inline = ic[1].trim();
      }
    }
    // 阶段2: 段内条目切分 — 容器段(如 items)每条目一段; 非容器段仅当缩进2键重复(同键多写法)时切段;
    // 输出段统一去公共缩进. 单条目/无条目时整段输出, 容器前注释作段名
    function dedent(text) {
      var ls = text.split('\n');
      var minInd = -1;
      for (var a = 0; a < ls.length; a++) {
        if (!ls[a].trim()) continue;
        var ind = /^\s*/.exec(ls[a])[0].length;
        if (minInd === -1 || ind < minInd) minInd = ind;
      }
      if (minInd <= 0) return text;
      for (var b = 0; b < ls.length; b++) if (ls[b]) ls[b] = ls[b].slice(minInd);
      return ls.join('\n');
    }
    var out = [];
    for (var j = 0; j < tops.length; j++) {
      var t = tops[j];
      // 该段是否需要条目切分: 容器段 / 含冒号条目名 / 缩进2键重复
      var repKeys = {};
      var hasRep = false;
      var hasColon = false;
      for (var r = 0; r < t.lines.length; r++) {
        var rm = /^ {2}([A-Za-z0-9_.\-]+(?::[A-Za-z0-9_.\-]+)*):/.exec(t.lines[r]);
        if (rm) {
          if (rm[1].indexOf(':') !== -1) hasColon = true;
          if (repKeys[rm[1]]) hasRep = true;
          repKeys[rm[1]] = 1;
        }
      }
      var splitEntries = t.isContainer || hasColon || hasRep;
      if (!splitEntries) {
        out.push({ name: t.name || t.inline || '', text: dedent(t.lines.join('\n')) });
        continue;
      }
      var ents = [];
      var ce = null;
      var ename = [];
      for (var k = 0; k < t.lines.length; k++) {
        var l2 = t.lines[k];
        if (/^```/.test(l2)) continue;
        var cm2 = /^#\s?(.*)$/.exec(l2);
        if (cm2) { ename.push(cm2[1].trim()); continue; }
        var entM = /^ {2}([A-Za-z0-9_.\-]+(?::[A-Za-z0-9_.\-]+)*):/.exec(l2);
        if (entM) {
          ce = { key: entM[1], name: ename.join(' ').trim(), lines: [l2], inline: '' };
          ents.push(ce);
          ename = [];
        } else if (ce) {
          ce.lines.push(l2);
          if (!ce.inline) {
            var ic2 = /#\s?(.*)$/.exec(l2);
            if (ic2) ce.inline = ic2[1].trim();
          }
        }
      }
      if (ents.length > 1) {
        for (var m = 0; m < ents.length; m++) {
          out.push({ name: ents[m].name || ents[m].inline || ents[m].key, text: dedent(ents[m].lines.join('\n')) });
        }
      } else if (ents.length === 1) {
        out.push({ name: t.name || ents[0].name || ents[0].inline || '', text: dedent(t.lines.join('\n')) });
      } else {
        out.push({ name: t.name || '', text: dedent(t.lines.join('\n')) });
      }
    }
    return out;
  }
  // 单段渲染: 解析 → 去容器 → 目标字段分情况渲染, 找不到目标字段则全结构编辑器化
  function _sfSectionHtml(secText, def) {
    var obj;
    try { obj = YAML.load(secText); } catch (e) { return ''; }
    if (obj === null || obj === undefined || typeof obj !== 'object') return '';
    var root = _sfUnwrapSample(obj);
    var tgt = (def && def.key) ? _sfFindKey(root, def.key, 0) : null;
    if (tgt) {
      var t0 = def.type || 'text';
      if (t0 === 'text' || t0 === 'number' || t0 === 'bool' || t0 === 'select' || t0 === 'string-scalar') {
        return _sfYvHtml(root, 0, false);
      }
      return _sfTargetHtml(def, tgt.val, tgt.ctx, 0);
    }
    return _sfYvHtml(root, 0, false);
  }
  function _sfYamlTreeHtml(yamlText, def) {
    var secs = _sfSplitSections(yamlText);
    if (!secs.length) return '';
    if (secs.length === 1) {
      var h1 = _sfSectionHtml(secs[0].text, def);
      return h1 ? '<div class="ce-yv">' + h1 + '</div>' : '';
    }
    // 多种情况 → 选项卡 (点击 / 左右键切换)
    var tabs = '';
    var panes = '';
    for (var i = 0; i < secs.length; i++) {
      var h = _sfSectionHtml(secs[i].text, def);
      if (!h) h = '<pre class="rt-pre"><code>' + _escHtml(secs[i].text) + '</code></pre>';
      var nm = secs[i].name || _t('craftengine.yvCase') + ' ' + (i + 1);
      tabs += '<span class="ce-yv-tab' + (i === 0 ? ' is-active' : '') + '" data-ce-tab="' + i + '" data-tip="' + _escHtml(nm) + '">' + _escHtml(nm) + '</span>';
      panes += '<div class="ce-yv-pane' + (i === 0 ? ' is-active' : '') + '" data-ce-pane="' + i + '">' + h + '</div>';
    }
    return '<div class="ce-yv ce-yv-tabs" data-ce-tabs="' + secs.length + '">' +
      '<div class="ce-yv-tabbar">' + tabs + '</div>' +
      '<div class="ce-yv-panes">' + panes + '</div>' +
      '</div>';
  }
  function _sfSwitchTab(root, idx) {
    var n = parseInt(root.getAttribute('data-ce-tabs') || '1', 10);
    if (!n) return;
    idx = ((idx % n) + n) % n;
    var tabs = root.querySelectorAll('.ce-yv-tab');
    var panes = root.querySelectorAll('.ce-yv-pane');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('is-active', i === idx);
    for (var j = 0; j < panes.length; j++) panes[j].classList.toggle('is-active', j === idx);
  }
  function _sfCurrentTabs() {
    var ov = document.getElementById('ce-hint-overlay');
    if (ov) {
      var p = ov.querySelector('.ce-yv-tabs');
      if (p) return p;
    }
    var tip = document.querySelector('.rt-tooltip');
    if (tip && tip.style.display !== 'none') {
      var p2 = tip.querySelector('.ce-yv-tabs');
      if (p2) return p2;
    }
    return null;
  }
  // tooltip 全文: ```yaml 块用编辑器方式结构, 其余走 RichTooltip.md; 解析失败回退原文代码块。
  // 同一 tooltip 内相邻的多个 yaml 块(块间仅空文本)合并为一个选项卡组, 每个块一种情况
  function _sfTipEditorHtml(txt, def) {
    if (!txt) return '';
    if (typeof RichTooltip === 'undefined' || !RichTooltip.md) return '<span class="rt-strong">' + _escHtml(txt) + '</span>';
    var parts = _sfSplitTip(txt);
    var html = '';
    var yamlBuf = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.yaml) { yamlBuf.push(p.text); continue; }
      var t = p.text.replace(/[\n\r]+/g, ' ').trim();
      if (!t && yamlBuf.length) continue;
      if (yamlBuf.length) { html += _sfYamlBlocksHtml(yamlBuf, def); yamlBuf = []; }
      html += RichTooltip.md(p.text);
    }
    if (yamlBuf.length) html += _sfYamlBlocksHtml(yamlBuf, def);
    return html;
  }
  // 多个 yaml 块 → 选项卡组 (每个块一个情况, 块内首个 # 注释作选项卡名); 单块 → 编辑器结构
  function _sfYamlBlocksHtml(blocks, def) {
    if (!blocks.length) return '';
    if (blocks.length === 1) {
      var h1 = _sfYamlTreeHtml(blocks[0], def);
      return h1 || ('<pre class="rt-pre"><code>' + _escHtml(blocks[0]) + '</code></pre>');
    }
    var tabs = '';
    var panes = '';
    for (var i = 0; i < blocks.length; i++) {
      var h = _sfYamlTreeHtml(blocks[i], def);
      if (!h) h = '<pre class="rt-pre"><code>' + _escHtml(blocks[i]) + '</code></pre>';
      var nm = _sfYamlBlockName(blocks[i]) || (_t('craftengine.yvCase') + ' ' + (i + 1));
      tabs += '<span class="ce-yv-tab' + (i === 0 ? ' is-active' : '') + '" data-ce-tab="' + i + '" data-tip="' + _escHtml(nm) + '">' + _escHtml(nm) + '</span>';
      panes += '<div class="ce-yv-pane' + (i === 0 ? ' is-active' : '') + '" data-ce-pane="' + i + '">' + h + '</div>';
    }
    return '<div class="ce-yv ce-yv-tabs" data-ce-tabs="' + blocks.length + '">' +
      '<div class="ce-yv-tabbar">' + tabs + '</div>' +
      '<div class="ce-yv-panes">' + panes + '</div>' +
      '</div>';
  }
  function _sfYamlBlockName(blockText) {
    var m = /^\s*#\s?(.*)$/m.exec(blockText);
    return m ? m[1].trim() : '';
  }
  function _sfHintPopupEsc(e) {
    if (e.key === 'Escape') _sfCloseHintPopup();
  }
  function _sfCloseHintPopup() {
    var ov = document.getElementById('ce-hint-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _sfHintPopupEsc, true);
  }
  function _sfOpenHintPopup(icon) {
    if (typeof RichTooltip === 'undefined') return;
    if (typeof RichTooltip.hide === 'function') RichTooltip.hide();
    _sound('click');
    var txt = icon.getAttribute('data-sf-hint');
    if (!txt) return;
    var def = _sfHintDefs[icon.getAttribute('data-sf-path') || ''];
    var editorHtml = _sfTipEditorHtml(txt, def);
    var wikiHtml = RichTooltip.md(txt);
    _sfCloseHintPopup();
    var ov = document.createElement('div');
    ov.id = 'ce-hint-overlay';
    ov.className = 'ce-hint-overlay';
    ov.innerHTML =
      '<div class="ce-hint-popup">' +
        '<div class="ce-hint-head">' +
          '<span class="ce-hint-title">' + _escHtml(_t('craftengine.hintDetail')) + '</span>' +
          '<span class="ce-hint-modes">' +
            '<button type="button" class="cv-btn cv-btn-sm ce-hint-mode-btn is-active" data-ce-hint-mode="editor">' + _escHtml(_t('craftengine.hintModeEditor')) + '</button>' +
            '<button type="button" class="cv-btn cv-btn-sm ce-hint-mode-btn" data-ce-hint-mode="wiki">' + _escHtml(_t('craftengine.hintModeWiki')) + '</button>' +
          '</span>' +
          '<button type="button" class="cv-btn cv-btn-sm cv-btn-danger ce-hint-close" data-tip="Esc">✕</button>' +
        '</div>' +
        '<div class="ce-hint-body">' +
          '<div class="ce-hint-content" data-ce-hint-view="editor">' + editorHtml + '</div>' +
          '<div class="ce-hint-content" data-ce-hint-view="wiki" style="display:none">' + wikiHtml + '</div>' +
        '</div>' +
      '</div>';
    ov.addEventListener('click', function (e) {
      var t = e.target;
      if (t === ov) { _sfCloseHintPopup(); return; }
      var c = t.closest ? t.closest('.ce-hint-close') : null;
      if (c) { _sfCloseHintPopup(); return; }
      var mb = t.closest ? t.closest('[data-ce-hint-mode]') : null;
      if (!mb) return;
      var view = mb.getAttribute('data-ce-hint-mode');
      var v0 = ov.querySelector('[data-ce-hint-view="editor"]');
      var v1 = ov.querySelector('[data-ce-hint-view="wiki"]');
      if (view === 'wiki') { v0.style.display = 'none'; v1.style.display = ''; }
      else { v0.style.display = ''; v1.style.display = 'none'; }
      var btns = ov.querySelectorAll('.ce-hint-mode-btn');
      for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('is-active', btns[b] === mb);
      _sound('click');
    });
    document.body.appendChild(ov);
    document.addEventListener('keydown', _sfHintPopupEsc, true);
  }

  // ---- 容器 (list/map/union/object) ----
  function _sfItemHtml(def, path, value, opts) {
    if (!def) return '';
    var t = def.type || 'text';
    if (t === 'union') return _sfUnionHtml(def, path, value, opts);
    if (t === 'listOf') return _sfListHtml(def, path, value, opts);
    if (t === 'mapOf') return _sfMapHtml(def, path, value, opts);
    if (t === 'object') return _sfObjectHtml(def, path, value, opts);
    if (t === 'components') return _sfComponentsHtml(def, path, value, opts);
    if (t === 'model') return _sfModelHtml(def, path, value, opts);
    if (t === 'popup') return _sfPopupHtml(def, path, value, opts);
    if (t === 'tabs') return _sfTabsWidgetHtml(def, path, value, opts);
    if (t === 'events') return _sfEventsWidgetHtml(def, path, value, opts);
    return _sfControl(def, path, value);
  }
  function _sfListHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'list', def, opts);
    var arr = Array.isArray(value) ? value : [];
    var itemDef = _sfListItemDef(def, path);
    var isUnionItem = itemDef && itemDef.type === 'union';
    var html = '<div class="ce-sf-list" data-sf-kind="list" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    for (var i = 0; i < arr.length; i++) {
      html += '<div class="ce-sf-list-item" data-sf-idx="' + i + '">' +
        '<div class="ce-sf-list-ops">' +
        '<button class="cv-btn cv-btn-sm" data-sf-action="list-move" data-sf-dir="up" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" data-tip="↑">↑</button>' +
        '<button class="cv-btn cv-btn-sm" data-sf-action="list-move" data-sf-dir="down" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" data-tip="↓">↓</button>' +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="list-del" data-sf-idx="' + i + '" data-sf-uid="' + uid + '" data-tip="✕">✕</button>' +
        '</div>' +
        '<div class="ce-sf-list-body">' + _sfItemHtml(itemDef, path + '.' + i, arr[i], { inList: true }) + '</div>' +
        '</div>';
    }
    if (!arr.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.listEmpty')) + '</div>';
    html += '<div class="ce-sf-list-add">';
    if (isUnionItem) html += _sfUnionPickHtml(itemDef, uid);
    else html += '<button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="list-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.listAdd')) + '</button>';
    html += '</div>';
    return html + '</div>';
  }
  function _sfUnionPickHtml(def, uid) {
    var types = _sfTypesOf(def);
    var html = '<select class="ce-input ce-sf-pick" data-sf-list-pick="1" data-sf-uid="' + uid + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.listAdd')) + ' --</option>';
    if (def.allowScalar) html += '<option value="__scalar">' + _escHtml(_t('craftengine.customValue')) + '</option>';
    var keys = Object.keys(types);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lb = _labelOf(types[k]) || k;
      html += '<option value="' + _escHtml(k) + '">' + _escHtml(lb) + '</option>';
      if (def.negatable) html += '<option value="!' + _escHtml(k) + '">' + _escHtml('!' + lb) + '</option>';
    }
    return html + '</select>' +
      '<button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="list-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.listAdd')) + '</button>';
  }
  // $$ 版本键徽标: 固定/范围/比较/回退 识别 + tooltip
  function _sfVersionKeyKind(k) {
    var kl = String(k).toLowerCase();
    if (kl === '$$fallback') return 'fallback';
    if (k.indexOf('~') !== -1) return 'range';
    if (/^\$\$(>=|<=|>|<|=)/.test(k)) return 'compare';
    return 'fixed';
  }
  function _sfVersionKeyBadge(k) {
    var kind = _sfVersionKeyKind(k);
    var lbl = kind === 'fallback' ? _t('craftengine.specFallback')
      : kind === 'range' ? _t('craftengine.specRange')
      : kind === 'compare' ? _t('craftengine.specCompare')
      : _t('craftengine.specFixed');
    var sym = kind === 'fallback' ? '↩'
      : kind === 'range' ? '~'
      : kind === 'compare' ? (function () { var m = String(k).match(/^\$\$(>=|<=|>|<|=)/); return m ? m[1] : '>'; })()
      : '=';
    return '<span class="ce-sf-map-ver" data-tip="' + _escHtml(lbl + ' · ' + k) + '">' + sym + '</span>';
  }
  // entry 键输入框: 版本键 ($$...) 或所属版本键分组 (group) 前加徽标
  function _sfEntryKeyCtrl(key, group) {
    var badge = group ? group : key;
    var inp = '<input class="ce-input ce-key-input" data-ce-field="__key__" value="' + _escHtml(key) + '" spellcheck="false">';
    return _sfVersionKeyRe.test(badge) ? '<div class="ce-sf-map-keybox">' + _sfVersionKeyBadge(badge) + inp + '</div>' : inp;
  }
  function _sfMapHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'map', def, opts);
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var keys = Object.keys(obj);
    var valueDef = def.valueType || { type: 'scalar' };
    var hasVer = false;
    for (var vk = 0; vk < keys.length; vk++) {
      if (_sfVersionKeyRe.test(keys[vk])) { hasVer = true; break; }
    }
    var html = '<div class="ce-sf-map' + (hasVer ? ' has-verkey' : '') + '" data-sf-kind="map" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    // 键本身是资源 ID 的 map (如 enchantment.enchantments / ingredients.map): 给键输入框挂 datalist
    var keyList = _sfAutoPickList(path + '.x');
    var keyListAttr = (keyList && _sfHasList(keyList)) ? ' list="ce-dl-' + _escHtml(keyList) + '"' : '';
    if (keyList === 'items' && _sfHasList('items')) keyListAttr = ' list="ce-dl-items"';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var keyCtrl = '<input class="ce-input ce-sf-map-key" data-sf-kind="map-key" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '"' + keyListAttr + ' value="' + _escHtml(k) + '" spellcheck="false">';
      if (_sfVersionKeyRe.test(k)) {
        keyCtrl = '<div class="ce-sf-map-keybox">' + _sfVersionKeyBadge(k) + keyCtrl + '</div>';
      }
      html += '<div class="ce-sf-map-row" data-sf-okey="' + _escHtml(k) + '">' + keyCtrl +
        '<div class="ce-sf-map-val">' + _sfItemHtml(valueDef, _sfKeyPath(path, k), obj[k], { inList: opts && opts.inList }) + '</div>' +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="map-del" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '" data-sf-uid="' + uid + '">✕</button>' +
        '</div>';
    }
    if (!keys.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.listEmpty')) + '</div>';
    html += '<div class="ce-sf-map-add"><button class="cv-btn cv-btn-sm cv-btn-secondary" data-sf-action="map-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.mapAdd')) + '</button></div>';
    return html + '</div>';
  }
  function _sfUnionCurrent(def, value) {
    if (value === undefined || value === null) return { key: '', neg: false };
    value = _ceUnwrap(value);
    if (typeof value === 'object') {
      if (def.noTypeKey) {
        var types = _sfTypesOf(def);
        var ks = Object.keys(types);
        if (Array.isArray(value)) {
          // 元素含对象 → 优先 listOf 类型; 全字符串 → 优先 lines/linesScalar
          var hasObj = false;
          for (var e = 0; e < value.length; e++) {
            if (value[e] !== null && typeof value[e] === 'object') { hasObj = true; break; }
          }
          for (var i = 0; i < ks.length; i++) {
            var w = (types[ks[i]].widget || {}).type;
            if (w === 'listOf' || w === 'lines' || w === 'linesScalar') {
              if (hasObj && w !== 'listOf') continue;
              if (!hasObj && w === 'listOf') continue;
              return { key: ks[i], neg: false };
            }
          }
        } else {
          // 键名形式: value 的键命中 types 键 → 该类型 (如 {simple: ''}); 否则回退第一个容器类型
          for (var kv in value) {
            if (types[kv]) return { key: kv, neg: false };
          }
          // 字段名推断: value 键是某 object 类型字段名的子集 → 该类型 (如 {default, overrides} → targeted)
          var best = null, bestScore = 0;
          for (var t2 = 0; t2 < ks.length; t2++) {
            var wf = types[ks[t2]].widget;
            if (!wf || wf.type !== 'object' || !wf.fields) continue;
            var names = {};
            for (var fi = 0; fi < wf.fields.length; fi++) names[wf.fields[fi].key] = 1;
            var score = 0;
            for (var vk in value) { if (names[vk]) score++; else if (vk !== 'type') score--; }
            if (score > bestScore) { bestScore = score; best = ks[t2]; }
          }
          if (best) return { key: best, neg: false };
          for (var j = 0; j < ks.length; j++) {
            var w2 = (types[ks[j]].widget || {}).type;
            if (w2 === 'object' || w2 === 'mapOf' || w2 === 'kv' || w2 === 'kvRest' || w2 === 'union' || w2 === 'tabs') return { key: ks[j], neg: false };
          }
        }
        return { key: ks.length ? ks[0] : '', neg: false };
      }
      if (value.type === undefined || value.type === null || value.type === '') return { key: '', neg: false };
      var t = String(value.type);
      return { key: t.charAt(0) === '!' ? t.slice(1) : t, neg: t.charAt(0) === '!' };
    }
    if (def.allowScalar) return { key: '__scalar', neg: false };
    if (def.noTypeKey) {
      var types2 = _sfTypesOf(def);
      var ks2 = Object.keys(types2);
      for (var m = 0; m < ks2.length; m++) {
        var w3 = (types2[ks2[m]].widget || {}).type;
        if (w3 === 'text' || w3 === 'textarea' || w3 === 'miniText' || w3 === 'linesScalar' || w3 === 'bool') return { key: ks2[m], neg: false };
      }
      return { key: ks2.length ? ks2[0] : '', neg: false };
    }
    return { key: '', neg: false };
  }
  function _sfTypeBody(td, path, value, opts) {
    var html = '';
    var sub = { inList: opts && opts.inList, entry: opts && opts.entry }; // 不向下传播 uid: 子容器/嵌套 union 需要自己的 uid
    if (td.widget) return _sfFieldHtml(td.widget, path, value, sub);
    var modeled = {};
    if (td.fields) {
      var keyStyle = _sfObjKeyStyle(value, td.fields);
      sub.keyStyle = keyStyle;
      html += '<div class="ce-sf-type-card">';
      td.fields.forEach(function (fld) {
        var fk = _sfObjFldKey(fld, value, keyStyle);
        modeled[fk] = 1;
        html += _sfFieldHtml(fld, path + '.' + fk, (value && typeof value === 'object') ? value[fk] : undefined, sub);
      });
      html += '</div>';
    }
    // 类型体未知字段: 迷你折叠 kv, 防数据丢失
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var rest = Object.keys(value).filter(function (k) { return k !== 'type' && !modeled[k]; });
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = value[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).concat(['type']).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 8)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    }
    return html;
  }
  function _sfUnionHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'union', def, opts);
    var types = _sfTypesOf(def);
    var cur = _sfUnionCurrent(def, value);
    // keepKey: 用户显式切换过的类型优先于形状推断 (如 lore 切到复杂定义后空数组不再弹回普通定义)
    if (def.keepKey && opts && opts.entry) {
      var kk = (opts.entry._unionKeys || {})[path];
      if (kk === '__scalar') cur = { key: '__scalar', neg: false };
      else if (kk && types[kk]) cur = { key: kk, neg: false };
    }
    // defaultKey: 空值时默认选中并展开该类型 (如 lore 默认普通定义)
    if (!cur.key && def.defaultKey && types[def.defaultKey]) cur = { key: def.defaultKey, neg: false };
    var optHtml = '<option value=""' + (!cur.key ? ' selected' : '') + '>' + _escHtml(_t('craftengine.unionEmpty')) + '</option>';
    if (def.allowScalar) {
      optHtml += '<option value="__scalar"' + (cur.key === '__scalar' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.customValue')) + '</option>';
    }
    var hintPrefix = '';
    if (_sfSchemas) {
      if (def.types === _sfSchemas.functions) hintPrefix = 'function';
      else if (def.types === _sfSchemas.conditions) hintPrefix = 'condition';
      else if (def.types === _sfSchemas.loot) hintPrefix = 'loot';
    }
    var keys = Object.keys(types);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var lb = _labelOf(types[k]) || k;
      var otip = '';
      var _chU = _sfCeHints();
      if (hintPrefix && _chU) {
        var oh = _chU[hintPrefix + '.' + k];
        if (oh) otip = ' data-tip="' + _escHtml(_sfPlain(_sfTipOf(oh))) + '"';
      }
      optHtml += '<option value="' + _escHtml(k) + '"' + otip + (cur.key === k && !cur.neg ? ' selected' : '') + '>' + _escHtml(lb) + '</option>';
      if (def.negatable) {
        optHtml += '<option value="!' + _escHtml(k) + '"' + (cur.key === k && cur.neg ? ' selected' : '') + '>' + _escHtml('!' + lb) + '</option>';
      }
    }
    var body = '';
    if (cur.key && cur.key !== '__scalar') {
      var td = types[cur.key];
      if (td) {
        // 键名形式 (noTypeKey, 值 = {类型键: 内容}) 时类型体取 value[类型键]; 形状推断形式值即内容
        var bodyValue = value;
        if (def.noTypeKey && value && typeof value === 'object' && !Array.isArray(value) && value[cur.key] !== undefined) {
          bodyValue = value[cur.key];
        }
        body = _sfTypeBody(td, path, bodyValue, opts);
      } else body = _sfControl({ type: 'kv' }, path, value); // 未知类型: kv 兜底
    } else if (cur.key === '__scalar') {
      var sd = (def.allowScalar && typeof def.allowScalar === 'object') ? def.allowScalar : {};
      sd.type = sd.type || 'text';
      if (sd.label) body = _sfFieldHtml(sd, path, value, opts);
      else body = '<div class="ce-sf-scalar">' + _sfControl(sd, path, value) + '</div>';
    }
    var clear = '';
    if (cur.key && !(opts && opts.inList)) {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-union-clear" data-sf-action="union-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" data-tip="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    return '<div class="ce-sf-union" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-union-head">' +
      '<select class="ce-input" data-sf-action="union-set" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' + optHtml + '</select>' + clear +
      '</div>' +
      '<div class="ce-sf-union-body">' + body + '</div>' +
      '</div>';
  }
  function _sfObjectHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'object', def, opts);
    var html = '<div class="ce-sf-object" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    var modeled = {};
    var keyStyle = _sfObjKeyStyle(value, def.fields);
    (def.fields || []).forEach(function (fld) {
      var fk = _sfObjFldKey(fld, value, keyStyle);
      modeled[fk] = 1;
      html += _sfFieldHtml(fld, path + '.' + fk, (value && typeof value === 'object') ? value[fk] : undefined, { inList: opts && opts.inList, keyStyle: keyStyle });
    });
    html += '</div>';
    // 未知字段: 折叠 kv
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var rest = Object.keys(value).filter(function (k) { return !modeled[k]; });
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = value[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="' + _escHtml(path) + '" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 8)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    }
    return html;
  }
  // ---- data 组件编辑器: 键 + 每组件独立表单 + 添加组件下拉 ----
  function _sfCompsOf(def) {
    var c = def ? def.components : null;
    return (typeof c === 'function') ? c() : (c || {});
  }
  function _sfComponentsHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'components', def, opts);
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var comps = _sfCompsOf(def);
    var condKey = def.conditionKey;
    // conditional 键支持 conditional#id 变体(多项条件), 以 # 前段匹配
    var condKeyBase = condKey ? String(condKey).split('#')[0] : null;
    var keys = [];
    Object.keys(obj).forEach(function (k) { if (!condKeyBase || String(k).split('#')[0] !== condKeyBase) keys.push(k); });
    var html = '<div class="ce-sf-map ce-sf-components" data-sf-kind="components" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    // 组件列表: 行 = 名称 + 摘要行(弹窗编辑/清除) + 删除按钮
    // 摘要行必须作为 popup uid 节点本体渲染: 弹窗确定后 _sfRerender(puid) 会替换该节点,
    // 若只放按钮, 按钮会被替换成摘要结构, 造成组件行内嵌套错乱
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var base = String(k).split('#')[0];
      var wd = comps[base];
      var name = wd ? (_labelOf(wd) || base) : k;
      var bodyDef = wd ? (wd.widget || wd) : { type: 'kv', label: k };
      var puid = _sfUidAlloc(_sfKeyPath(path, k), 'popup', bodyDef, opts);
      html += '<div class="ce-sf-comp-row" data-sf-okey="' + _escHtml(k) + '">' +
        '<div class="ce-sf-comp-head">' +
        '<span class="ce-sf-comp-name" data-tip="' + _escHtml(k) + '">' + _escHtml(name) + '</span>' +
        _sfPopupHtml(bodyDef, _sfKeyPath(path, k), obj[k], { uid: puid }) +
        '<button class="cv-btn cv-btn-sm cv-btn-danger" data-sf-action="map-del" data-sf-path="' + _escHtml(path) + '" data-sf-okey="' + _escHtml(k) + '" data-sf-uid="' + uid + '" data-tip="✕">✕</button>' +
        '</div></div>';
    }
    if (!keys.length) html += '<div class="ce-sf-empty">' + _escHtml(_t('craftengine.componentsEmpty')) + '</div>';
    // 条件部分: conditional 独立成区, 弹窗编辑 data + conditions
    if (condKey && comps[condKey]) {
      var condWd = comps[condKey].widget || comps[condKey];
      var condVal = obj[condKey];
      var condActualKey = condKey;
      if (condVal === undefined && condKeyBase) {
        // conditional#id 变体已存在: 取第一个, 避免重复生成普通 conditional 键
        // 注意 keys 已过滤掉 conditional# 前缀键, 需扫描 obj 原始键
        var objKeys = Object.keys(obj);
        for (var ck0 = 0; ck0 < objKeys.length; ck0++) {
          if (String(objKeys[ck0]).indexOf(condKeyBase + '#') === 0) { condVal = obj[objKeys[ck0]]; condActualKey = objKeys[ck0]; break; }
        }
      }
      var hasCond = condVal !== undefined && condVal !== null && typeof condVal === 'object' && !Array.isArray(condVal);
      html += '<div class="ce-sf-cond-block">' +
        '<div class="ce-sf-cond-title">' + _escHtml(_t('craftengine.componentConditionTitle', '条件')) + '</div>';
      if (hasCond) {
        // 编辑/清除作用于实际键 (可能为 conditional#id 变体)
        var cuid = _sfUidAlloc(_sfKeyPath(path, condActualKey), 'popup', condWd, opts);
        html += '<div class="ce-sf-cond-row">' + _sfPopupHtml(condWd, _sfKeyPath(path, condActualKey), condVal, { uid: cuid }) + '</div>';
      } else {
        html += '<button type="button" class="cv-btn cv-btn-sm ce-sf-cond-add" data-sf-action="cond-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.condAdd', '添加条件')) + '</button>';
      }
      html += '</div>';
    }
    var addSel = '<select class="ce-input ce-sf-pick" data-sf-action="comp-add" data-sf-uid="' + uid + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.componentAdd')) + ' --</option>';
    var cks = Object.keys(comps);
    for (var c = 0; c < cks.length; c++) {
      var ck = cks[c];
      if (ck === condKey) continue;
      if (obj[ck] === undefined) {
        addSel += '<option value="' + _escHtml(ck) + '">' + _escHtml(_labelOf(comps[ck]) || ck) + '</option>';
      }
    }
    addSel += '<option value="__custom__">' + _escHtml(_t('craftengine.componentCustom')) + '</option>';
    addSel += '</select>';
    html += '<div class="ce-sf-map-add">' + addSel + '</div>';
    return html + '</div>';
  }
  // ---- 子选项卡 (tabs widget): 面板纯 CSS 切换, 字段写回走现有 field 委托 ----
  function _sfTabsWidgetHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'tabs', def, opts);
    var tabs = def.tabs || [];
    // 汇总所有面板已建模的键: 未建模键只在一个面板折叠一次, 避免重复 kv 编辑器
    var tabModeled = {};
    for (var ti = 0; ti < tabs.length; ti++) {
      var tflds = tabs[ti].fields;
      if (tflds) for (var tf = 0; tf < tflds.length; tf++) tabModeled[tflds[tf].key] = 1;
    }
    var html = '<div class="ce-sf-subtabs" data-sf-kind="tabs" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '"><div class="ce-sf-subtab-bar">';
    for (var i = 0; i < tabs.length; i++) {
      html += '<button type="button" class="cv-btn cv-btn-sm ce-sf-subtab-btn' + (i === 0 ? ' active' : '') + '" data-sf-action="subtab" data-sf-subtab="' + _escHtml(tabs[i].key) + '" data-sf-uid="' + uid + '">' +
        _escHtml(_labelOf(tabs[i]) || tabs[i].key) + '</button>';
    }
    html += '</div>';
    for (var j = 0; j < tabs.length; j++) {
      html += '<div class="ce-sf-subtab-panel' + (j === 0 ? ' active' : '') + '" data-sf-subtabpanel="' + _escHtml(tabs[j].key) + '" data-sf-uid="' + uid + '">' +
        _sfTabPanelHtml(tabs[j], path, value, opts, tabModeled) + '</div>';
    }
    return html + '</div>';
  }
  function _sfTabPanelHtml(panel, path, value, opts, tabModeled) {
    if (panel.bind) {
      var bkey = _sfFldKey({ key: panel.bind }, opts && opts.keyStyle);
      var bv = (opts && opts.entryData) ? opts.entryData[bkey] : undefined;
      return _sfItemHtml(panel.widget, bkey, bv, opts);
    }
    var modeled = {};
    var html = '';
    var keyStyle = _sfObjKeyStyle(value, panel.fields);
    (panel.fields || []).forEach(function (fld) {
      var fk = _sfObjFldKey(fld, value, keyStyle);
      modeled[fk] = 1;
      html += _sfFieldHtml(fld, _sfKeyPath(path, fk), value ? value[fk] : undefined, opts);
    });
    var rest = [];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var ks = Object.keys(value);
      for (var i = 0; i < ks.length; i++) {
        if (!modeled[ks[i]] && !(tabModeled && tabModeled[ks[i]])) rest.push(ks[i]);
      }
    }
    if (rest.length) {
      html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>';
      for (var r = 0; r < rest.length; r++) {
        var k = rest[r];
        var v = value[k];
        var p = _sfKeyPath(path, k);
        var editor = (v !== null && typeof v === 'object' && !Array.isArray(v))
          ? _sfKvTextarea({ type: 'kv' }, p, v)
          : _sfScalarInput({}, p, v);
        html += '<div class="ce-stack ce-sf-rest"><label class="ce-field-label">' + _escHtml(k) + '</label>' + editor + '</div>';
      }
      html += '</details>';
    }
    return html;
  }
  // ---- 事件 widget (内联方块等嵌套位置): 与根级事件面板同机制, 状态存 _sfUidMap[uid].evKey, 局部重渲染 ----
  function _sfEventsWidgetHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'events', def, opts);
    var rec = _sfUidMap[uid];
    var evKey = (rec && rec.evKey) || (_sfActiveContainer && _sfActiveContainer._ceEvKeys ? _sfActiveContainer._ceEvKeys[path] : '') || '';
    var evs = value;
    var isArr = Array.isArray(evs);
    var isMap = evs && typeof evs === 'object' && !Array.isArray(evs);
    var html = '<div class="ce-sf-events" data-sf-kind="events" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">';
    if (evKey !== '') {
      if (isArr) {
        var iIdx = parseInt(evKey, 10);
        if (!isNaN(iIdx) && evs[iIdx] !== undefined) {
          return html + _eventsSubHtml(null, String(iIdx), evs[iIdx], true, path, uid) + '</div>';
        }
      } else if (isMap && evs[evKey] !== undefined) {
        return html + _eventsSubHtml(null, evKey, evs[evKey], false, path, uid) + '</div>';
      }
    }
    html += '<div class="ce-events-header">' +
      '<span class="ce-events-title">' + _escHtml(_t('craftengine.eventsCount', { count: isArr ? evs.length : (isMap ? Object.keys(evs).length : 0) })) + '</span>' +
      '<button type="button" class="cv-btn cv-btn-primary cv-btn-sm" data-sf-action="sf-event-add" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.eventsAdd')) + '</button>' +
      '</div>';
    if (isArr && evs.length) {
      for (var i = 0; i < evs.length; i++) {
        var item = evs[i];
        var label = item && typeof item === 'object' ? (item.on !== undefined ? (Array.isArray(item.on) ? item.on.join(', ') : String(item.on)) : String(i + 1)) : String(i + 1);
        html += '<div class="ce-event-item">' +
          '<span class="ce-event-name" data-sf-action="sf-event-open" data-sf-ev="' + i + '" data-sf-uid="' + uid + '">' + _escHtml(label) + '</span>' +
          '<button type="button" class="cv-btn cv-btn-danger cv-btn-sm ce-event-del" data-sf-action="sf-event-del" data-sf-ev="' + i + '" data-sf-uid="' + uid + '">✕</button>' +
          '</div>';
      }
    } else if (isMap && Object.keys(evs).length) {
      var mk = Object.keys(evs);
      for (var m = 0; m < mk.length; m++) {
        html += '<div class="ce-event-item">' +
          '<span class="ce-event-name" data-sf-action="sf-event-open" data-sf-ev="' + _escHtml(mk[m]) + '" data-sf-uid="' + uid + '">' + _escHtml(mk[m]) + '</span>' +
          '<button type="button" class="cv-btn cv-btn-danger cv-btn-sm ce-event-del" data-sf-action="sf-event-del" data-sf-ev="' + _escHtml(mk[m]) + '" data-sf-uid="' + uid + '">✕</button>' +
          '</div>';
      }
    } else {
      html += '<div class="ce-events-empty">' + _escHtml(_t('craftengine.eventsEmpty')) + '</div>';
    }
    return html + '</div>';
  }
  // ---- 对象字段键名兼容: 官方中文文档/旧版文件用连字符 (push-reaction), 英文新版 wiki 用下划线 (push_reaction) ----
  // 检测对象内已有键的风格 (同键数下划线优先), 新建键沿用文件风格, 保证写回不破坏用户键名
  function _sfObjKeyStyle(value, fields) {
    if (!fields || !value || typeof value !== 'object' || Array.isArray(value)) return 'snake';
    var snake = 0, kebab = 0;
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i].key;
      if (String(k).indexOf('_') === -1) continue;
      if (value[k] !== undefined) snake++;
      else if (value[k.replace(/_/g, '-')] !== undefined) kebab++;
    }
    return kebab > snake ? 'kebab' : 'snake';
  }
  function _sfObjFldKey(fld, value, keyStyle) {
    if (String(fld.key).indexOf('_') === -1) return fld.key;
    var has = value && typeof value === 'object' && !Array.isArray(value);
    if (keyStyle === 'kebab') {
      var kb = fld.key.replace(/_/g, '-');
      // 文件已存在该键 (任一种写法) 时沿用; 新键按文件风格
      if (!has || value[kb] !== undefined || value[fld.key] === undefined) return kb;
    }
    return fld.key;
  }
  // ---- item 根级键风格: 检测文件已有写法 (snake 新版 / kebab 旧版), 新建用设置默认 ----
  function _sfItemKeyStyle(entryData) {
    var t = (_sfSchemas && _sfSchemas.itemKeyStyle) || null;
    if (t && entryData && typeof entryData === 'object') {
      for (var k in entryData) {
        if (!Object.prototype.hasOwnProperty.call(entryData, k)) continue;
        if (t[k]) return 'snake';
        for (var s in t) {
          if (Object.prototype.hasOwnProperty.call(t, s) && t[s].kebab === k) return 'kebab';
        }
      }
    }
    return _sfDefaultKeyStyle();
  }
  function _sfDefaultKeyStyle() {
    try {
      var cfg = JSON.parse(ROOT.localStorage.getItem('editorConfig') || '{}');
      return cfg.itemKeyStyle === 'kebab' ? 'kebab' : 'snake';
    } catch (e) { return 'snake'; }
  }
  function _sfFldKey(fld, style) {
    var t = (_sfSchemas && _sfSchemas.itemKeyStyle) || null;
    if (t && t[fld.key] && style === 'kebab') return t[fld.key].kebab;
    return fld.key;
  }
  // ---- item 模型编辑器: 简化 / 模型树 / 路径 三种模式 ----
  function _sfModelForms() {
    _sfInit();
    return (_sfSchemas && _sfSchemas.itemModelForms) ? _sfSchemas.itemModelForms : null;
  }
  function _sfModelHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'model', def, opts);
    var isStr = typeof value === 'string';
    var isObj = !isStr && value !== null && typeof value === 'object' && !Array.isArray(value);
    var mode = isStr ? 'path' : (isObj && value.type !== undefined && value.type !== null && value.type !== '' ? 'tree' : 'simplified');
    var clear = '';
    if (value !== undefined && value !== null) {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-union-clear" data-sf-action="model-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" data-tip="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    var html = '<div class="ce-sf-model" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-union-head">' +
      '<select class="ce-input" data-sf-action="model-mode" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' +
      '<option value="simplified"' + (mode === 'simplified' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelSimplified')) + '</option>' +
      '<option value="tree"' + (mode === 'tree' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelTree')) + '</option>' +
      '<option value="path"' + (mode === 'path' ? ' selected' : '') + '>' + _escHtml(_t('craftengine.modelPath')) + '</option>' +
      '</select>' + clear + '</div>';
    var forms = _sfModelForms();
    var body;
    if (mode === 'path') {
      body = _sfInput({ type: 'text', placeholder: _sfL('minecraft:item/custom/xxx', 'minecraft:item/custom/xxx') }, path, value);
    } else if (mode === 'tree') {
      body = forms && forms.tree ? _sfUnionHtml(forms.tree, path, value, { inList: opts && opts.inList }) : _sfInput({ type: 'text' }, path, value);
    } else {
      body = forms && forms.simplified ? _sfObjectHtml(forms.simplified, path, value, opts) : _sfKvTextarea({ type: 'kv' }, path, value);
    }
    return html + '<div class="ce-sf-union-body">' + body + '</div></div>';
  }
  // ---- 弹窗编辑器 (popup): 界面显示简略值, 点击弹窗编辑完整字段 ----
  // content 可为函数 (延迟求值, 支持前向引用的共享 def)
  function _sfPopupContent(def) {
    var c = def.content;
    return typeof c === 'function' ? c() : c;
  }
  function _sfPopupScalar(fld, v) {
    v = _ceUnwrap(v);
    var ft = fld.type;
    if (ft === 'union') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.type) return String(v.type);
        if (v.id || v.name) return String(v.id || v.name);
        return _t('craftengine.popupDetailed');
      }
      return String(v);
    }
    if (ft === 'lines' || ft === 'linesScalar') return Array.isArray(v) ? String(v.length) + ' 行' : String(v);
    if (ft === 'mapOf' || ft === 'map') return String(Object.keys(v).length) + ' 项';
    if (ft === 'listOf') return String(v.length) + ' 项';
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function _sfPopupSummary(def, value) {
    // content 是 popup 字段定义; 递归传入的 widget 定义没有 content, 直接用自身
    var c = _sfPopupContent(def) || def;
    var empty = _t('craftengine.popupEmpty');
    if (!c || value === undefined || value === null || value === '') return empty;
    value = _ceUnwrap(value);
    if (typeof value !== 'object') return String(value);
    var t = c.type;
    if (t === 'mapOf' || t === 'map' || t === 'components') {
      var keys = Object.keys(value);
      if (!keys.length) return empty;
      return keys.slice(0, 4).join(', ') + (keys.length > 4 ? ' …' : '') + ' (' + keys.length + ' 个)';
    }
    if (t === 'object') {
      var parts = [];
      (c.fields || []).forEach(function (fld) {
        var v = value[fld.key];
        if (v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) return;
        parts.push(fld.key + ': ' + _sfPopupScalar(fld, v));
      });
      if (!parts.length) return empty;
      return parts.slice(0, 5).join(', ') + (parts.length > 5 ? ' …' : '');
    }
    if (t === 'listOf' || t === 'lines' || t === 'linesScalar') {
      if (!Array.isArray(value) || !value.length) return empty;
      return String(value.length) + ' 项';
    }
    if (t === 'union') {
      if (Array.isArray(value)) {
        var ks = _sfTypesOf(c), ksL = Object.keys(ks);
        for (var i = 0; i < ksL.length; i++) {
          var w = (ks[ksL[i]].widget || {}).type;
          if (w === 'listOf' || w === 'lines' || w === 'linesScalar') return _sfPopupSummary(ks[ksL[i]].widget, value);
        }
        return String(value.length) + ' 项';
      }
      if (value.type) return String(value.type);
      var ks2 = _sfTypesOf(c), ks2L = Object.keys(ks2);
      for (var j = 0; j < ks2L.length; j++) {
        var w2 = (ks2[ks2L[j]].widget || {}).type;
        if (w2 === 'object' || w2 === 'mapOf' || w2 === 'components') return _sfPopupSummary(ks2[ks2L[j]].widget, value);
      }
      return String(value);
    }
    return String(value);
  }
  function _sfPopupHtml(def, path, value, opts) {
    var uid = (opts && opts.uid) || _sfUidAlloc(path, 'popup', def, opts);
    var clear = '';
    if (value !== undefined && value !== null && value !== '') {
      clear = '<button class="cv-btn cv-btn-sm cv-btn-danger ce-sf-popup-clear" data-sf-action="popup-clear" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '" data-tip="' + _escHtml(_t('craftengine.unionClear')) + '">✕</button>';
    }
    return '<div class="ce-sf-popup" data-sf-uid="' + uid + '">' +
      '<div class="ce-sf-popup-row">' +
      '<span class="ce-sf-popup-summary">' + _escHtml(_sfPopupSummary(def, value)) + '</span>' +
      '<button class="cv-btn cv-btn-sm ce-sf-popup-btn" data-sf-action="popup-edit" data-sf-path="' + _escHtml(path) + '" data-sf-uid="' + uid + '">' + _escHtml(_t('craftengine.popupEdit')) + '</button>' + clear +
      '</div></div>';
  }
  // 打开 popup 弹窗: 弹窗 body 复用 _bindEvents, 编辑副本数据, 确定后写回真实数据
  function _sfOpenPopup(rec, path, containerEl, entry, parsed, section, uid) {
    if (!document) return;
    var old = document.getElementById('ce-popup-modal');
    if (old) old.remove();
    var cur = path ? _getNested(entry.data, path) : entry.data;
    var copy;
    if (cur === undefined || cur === null) {
      copy = undefined;
    } else {
      try { copy = JSON.parse(JSON.stringify(cur)); } catch (e) { copy = Object.assign({}, cur); }
    }
    // 保存父容器 UID 状态, 弹窗内渲染使用独立 UID 空间
    var savedUidMap = _sfUidMap;
    var savedUidSeq = _sfUidSeq;
    _sfUidMap = {};
    _sfUidSeq = Date.now() % 1000000;

    var bodyEl = document.createElement('div');
    bodyEl.className = 'ce-popup-body';
    bodyEl._ceParsed = { sections: [{ entries: [{ data: { __popup__: copy }, _rawOrder: ['__popup__'] }] }], _isPopup: true };
    bodyEl._ceUi = { section: 0, entry: 0 };
    bodyEl.innerHTML = _sfItemHtml(_sfPopupContent(rec.def) || rec.def, '__popup__', copy, {});
    _bindEvents(bodyEl);

    var modal = document.createElement('div');
    modal.id = 'ce-popup-modal';
    modal.className = 'cv-modal ce-popup-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content ce-popup-content">' +
      '<h3>' + _escHtml(_labelOf(rec.def)) + '</h3>' +
      '<div class="ce-popup-scroll"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" data-ce-popup="cancel">' + _escHtml(_t('craftengine.popupCancel')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" data-ce-popup="ok">' + _escHtml(_t('craftengine.popupOk')) + '</button>' +
      '</div></div>';
    modal.querySelector('.ce-popup-scroll').appendChild(bodyEl);
    document.body.appendChild(modal);

    function close() {
      modal.remove();
      _sfUidMap = savedUidMap;
      _sfUidSeq = savedUidSeq;
    }
    modal.querySelector('[data-ce-popup="cancel"]').addEventListener('click', close);
    modal.querySelector('[data-ce-popup="ok"]').addEventListener('click', function () {
      var got = bodyEl._ceParsed.sections[0].entries[0].data.__popup__;
      close();
      if (got === undefined || got === null ||
          (typeof got === 'object' && !Array.isArray(got) && Object.keys(got).length === 0)) {
        // 弹窗内为空 → 删除字段
        if (path) _applyValue(entry, path, undefined, parsed, section);
      } else {
        if (path) _applyValue(entry, path, got, parsed, section);
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    });
    modal.addEventListener('click', function (e) { if (e.target === this) close(); });
  }
  // ---- 特殊配置弹窗: 版本条件 ($ 键) / 值类型 (!!type), 显示段/条目位置 ----
  function _sfSpecShowSections(ft, value) {
    var isObj = value !== null && typeof value === 'object' && !Array.isArray(value) && !_ceIsWrap(value);
    if (isObj) return 'versions';
    if (value === undefined || value === null) {
      if (_sfSpecMapTypes[ft]) return 'versions';
      if (_sfSpecScalarTypes[ft]) return 'type';
      return null;
    }
    return 'type'; // 标量 / 数组 / wrap
  }
  function _sfSpecTypeNames() {
    return ['long', 'float', 'byte', 'short', 'ByteArray', 'IntArray', 'LongArray', 'DoubleArray', 'IntList', 'LongList', 'DoubleList'];
  }
  // 1=整数数组, 2=浮点数组, 0=标量
  function _sfSpecSeqConv(tag) {
    if (tag === 'ByteArray' || tag === 'IntArray' || tag === 'LongArray' || tag === 'IntList' || tag === 'LongList') return 1;
    if (tag === 'DoubleArray' || tag === 'DoubleList') return 2;
    return 0;
  }
  function _sfSpecRowHtml(key, val) {
    var vs;
    if (val !== null && typeof val === 'object') {
      try { vs = JSON.stringify(val); } catch (e) { vs = String(val); }
    } else vs = (val === undefined || val === null) ? '' : String(val);
    return '<div class="ce-spec-row" data-ce-okey="' + _escHtml(key) + '">' +
      '<input class="ce-input ce-spec-key" value="' + _escHtml(key) + '" spellcheck="false" data-tip="' + _escHtml(key) + '">' +
      '<input class="ce-input ce-spec-val" value="' + _escHtml(vs) + '" spellcheck="false" placeholder="' + _escHtml(_t('craftengine.specEmptyVal')) + '">' +
      '<button type="button" class="cv-btn cv-btn-sm cv-btn-danger" data-ce-spec="del" data-tip="' + _escHtml(_t('craftengine.specDel')) + '">✕</button>' +
      '</div>';
  }
  function _sfOpenSpecPopup(def, path, uid, entry, parsed, section, containerEl) {
    if (!document) return;
    var old = document.getElementById('ce-spec-modal');
    if (old) old.remove();
    var whole = !path || path === '__whole__';
    var cur = whole ? entry.data : _getNested(entry.data, path);
    var ft = (def && def.type) || '';
    var mode = _sfSpecShowSections(ft, cur);
    var raw = _ceUnwrap(cur);

    var title = _t('craftengine.specTitle') + (def && _labelOf(def) ? ' — ' + _labelOf(def) : '');
    var loc = [];
    if (section) loc.push(section.key);
    if (entry) loc.push(entry.key);
    if (path && !whole) loc.push(path);
    var body = '<div class="ce-spec-loc">' + _escHtml(_t('craftengine.specLoc') + ': ' + (loc.join(' / ') || '—')) + '</div>';

    if (mode === 'versions') {
      var obj = (cur !== null && typeof cur === 'object' && !Array.isArray(cur) && !_ceIsWrap(cur)) ? cur : {};
      var vkeys = Object.keys(obj).filter(function (k) { return _sfVersionKeyRe.test(k); });
      body += '<div class="ce-spec-section" data-ce-spec-sec="versions">' +
        '<div class="ce-spec-title">' + _escHtml(_t('craftengine.specVersions')) + '</div>' +
        '<div class="ce-spec-desc">' + _escHtml(_t('craftengine.specVersionsDesc')) + '</div>' +
        '<div class="ce-spec-rows">';
      for (var i = 0; i < vkeys.length; i++) body += _sfSpecRowHtml(vkeys[i], obj[vkeys[i]]);
      body += '<div class="ce-spec-empty"' + (vkeys.length ? ' style="display:none"' : '') + '>' + _escHtml(_t('craftengine.specNoVersions')) + '</div>' +
        '</div>' +
        '<div class="ce-spec-add">' +
        '<select class="ce-input ce-spec-add-type">' +
        '<option value="fixed">' + _escHtml(_t('craftengine.specFixed')) + '</option>' +
        '<option value="range">' + _escHtml(_t('craftengine.specRange')) + '</option>' +
        '<option value="compare">' + _escHtml(_t('craftengine.specCompare')) + '</option>' +
        '<option value="fallback">' + _escHtml(_t('craftengine.specFallback')) + '</option>' +
        '</select>' +
        '<input class="ce-input ce-spec-add-key" placeholder="' + _escHtml(_t('craftengine.specKeyPh')) + '" spellcheck="false">' +
        '<input class="ce-input ce-spec-add-val" placeholder="' + _escHtml(_t('craftengine.specValPh')) + '" spellcheck="false">' +
        '<button type="button" class="cv-btn cv-btn-sm cv-btn-secondary" data-ce-spec="add">' + _escHtml(_t('craftengine.specAdd')) + '</button>' +
        '</div></div>';
    } else if (mode === 'type') {
      var curTag = _ceIsWrap(cur) ? cur.__ceTag : '';
      var opts = '<option value="">' + _escHtml(_t('craftengine.specTypeNone')) + '</option>';
      var tags = _sfSpecTypeNames();
      for (var t2 = 0; t2 < tags.length; t2++) {
        opts += '<option value="' + tags[t2] + '"' + (curTag === tags[t2] ? ' selected' : '') + '>' + tags[t2] + '</option>';
      }
      var curText = (raw === undefined || raw === null) ? '' : (Array.isArray(raw) ? raw.join(', ') : String(raw));
      body += '<div class="ce-spec-section" data-ce-spec-sec="type">' +
        '<div class="ce-spec-title">' + _escHtml(_t('craftengine.specType')) + '</div>' +
        '<div class="ce-spec-desc">' + _escHtml(_t('craftengine.specTypeHint')) + '</div>' +
        '<select class="ce-input ce-spec-type-sel">' + opts + '</select>' +
        '<div class="ce-spec-cur">' + _escHtml(_t('craftengine.specCurVal') + ': ' + (curText || _t('craftengine.specEmptyVal'))) + '</div>' +
        '</div>';
    } else {
      body += '<div class="ce-spec-desc">' + _escHtml(_t('craftengine.specVersionsDesc')) + '</div>';
    }

    var modal = document.createElement('div');
    modal.id = 'ce-spec-modal';
    modal.className = 'cv-modal ce-popup-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content ce-popup-content">' +
      '<h3>' + _escHtml(title) + '</h3>' +
      '<div class="ce-spec-scroll">' + body + '</div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" data-ce-spec="cancel">' + _escHtml(_t('craftengine.popupCancel')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" data-ce-spec="ok">' + _escHtml(_t('craftengine.popupOk')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    _sound('click');

    var scroll = modal.querySelector('.ce-spec-scroll');
    function rowCount() { return scroll.querySelectorAll('.ce-spec-row').length; }
    function refreshEmpty() {
      var emp = scroll.querySelector('.ce-spec-empty');
      if (emp) emp.style.display = rowCount() ? 'none' : '';
    }
    function bindRow(row) {
      var del = row.querySelector('[data-ce-spec="del"]');
      if (del) del.addEventListener('click', function () { row.remove(); refreshEmpty(); });
    }
    function addRow(key, val) {
      var rows = scroll.querySelector('.ce-spec-rows');
      if (!rows) return;
      var div = document.createElement('div');
      div.innerHTML = _sfSpecRowHtml(key, val);
      var row = div.firstChild;
      rows.appendChild(row);
      bindRow(row);
      refreshEmpty();
    }
    var typeSel = scroll.querySelector('.ce-spec-add-type');
    if (typeSel) {
      typeSel.addEventListener('change', function () {
        var ph = typeSel.value === 'range' ? '1.20.1~1.21.4' : (typeSel.value === 'compare' ? '>=1.21.4' : (typeSel.value === 'fallback' ? '' : '1.21.4'));
        var kInp = scroll.querySelector('.ce-spec-add-key');
        kInp.placeholder = _t('craftengine.specKeyPh') + (ph ? ' ' + ph : '');
        kInp.disabled = typeSel.value === 'fallback';
        if (typeSel.value === 'fallback') kInp.value = '';
      });
    }
    scroll.querySelectorAll('.ce-spec-row').forEach(bindRow);
    var addBtn = scroll.querySelector('[data-ce-spec="add"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var kInp = scroll.querySelector('.ce-spec-add-key');
        var vInp = scroll.querySelector('.ce-spec-add-val');
        var k = typeSel && typeSel.value === 'fallback' ? '$$fallback' : '$$' + String(kInp.value || '').trim();
        kInp.classList.remove('ce-invalid');
        if (!typeSel || k === '$$') { kInp.classList.add('ce-invalid'); return; }
        // 遍历比较 data-ce-okey (HTML 实体编码), 避免 key 含引号/& 时 selector 语法错误或匹配失效
        var dup = null;
        var allRows = scroll.querySelectorAll('.ce-spec-row');
        for (var di = 0; di < allRows.length; di++) {
          if (allRows[di].getAttribute('data-ce-okey') === _escHtml(k)) { dup = allRows[di]; break; }
        }
        if (dup) { kInp.classList.add('ce-invalid'); return; }
        addRow(k, vInp.value ? _parseKvLine(vInp.value) : '');
        kInp.value = ''; vInp.value = '';
      });
    }
    function close() { modal.remove(); }
    modal.querySelector('[data-ce-spec="cancel"]').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === this) close(); });
    modal.querySelector('[data-ce-spec="ok"]').addEventListener('click', function () {
      var invalid = false;
      if (mode === 'versions') {
        var rows = scroll.querySelectorAll('.ce-spec-row');
        var seen = {};
        var entries = [];
        for (var r = 0; r < rows.length; r++) {
          var kInp2 = rows[r].querySelector('.ce-spec-key');
          var vInp2 = rows[r].querySelector('.ce-spec-val');
          var k2 = String(kInp2.value || '').trim();
          kInp2.classList.remove('ce-invalid');
          if (!k2) continue;
          if (k2.indexOf('$$') !== 0) { kInp2.classList.add('ce-invalid'); invalid = true; continue; }
          if (seen[k2]) { kInp2.classList.add('ce-invalid'); invalid = true; continue; }
          seen[k2] = 1;
          entries.push({ key: k2, text: vInp2.value });
        }
        if (!invalid) {
          var wasObj = cur !== null && typeof cur === 'object' && !Array.isArray(cur) && !_ceIsWrap(cur);
          var obj = wasObj ? cur : {};
          var keep = {};
          entries.forEach(function (e) { keep[e.key] = 1; });
          Object.keys(obj).forEach(function (k) {
            if (_sfVersionKeyRe.test(k) && !keep[k]) delete obj[k];
          });
          entries.forEach(function (e) {
            if (String(e.text).trim() === '') delete obj[e.key];
            else obj[e.key] = _parseKvLine(e.text);
          });
          if (!wasObj) {
            // 统一走 _applyValue: 同步 config 场景的 _fileLevelRaw, 避免类型/版本修改静默丢失
            _applyValue(entry, whole ? '__whole__' : path, obj, parsed, section);
          }
        }
      }
      if (mode === 'type' && !invalid) {
        var tsel = scroll.querySelector('.ce-spec-type-sel');
        var chosen = tsel ? tsel.value : '';
        var curRaw = raw;
        if (chosen === '') {
          if (_ceIsWrap(cur) && !invalid) {
            if (curRaw === '' || curRaw === undefined) {
              _applyValue(entry, whole ? '__whole__' : path, undefined, parsed, section);
            } else {
              _applyValue(entry, whole ? '__whole__' : path, curRaw, parsed, section);
            }
          }
        } else {
          var sv = _sfSpecSeqConv(chosen);
          var val = curRaw;
          if (sv) {
            if (!Array.isArray(val)) {
              val = String(val === undefined || val === null ? '' : val).split(/[,;\n]/)
                .map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
            }
            val = val.map(function (x) {
              if (sv === 2) { var f = parseFloat(String(x)); return isNaN(f) ? String(x) : f; }
              var n = parseInt(String(x), 10);
              return isNaN(n) ? String(x) : n;
            });
          } else if (typeof val === 'string') {
            if (chosen === 'float') { var f2 = parseFloat(val); if (!isNaN(f2)) val = f2; }
            else { var n2 = parseInt(val, 10); if (!isNaN(n2)) val = n2; }
          }
          var w = { __ceTag: chosen, v: val };
          _applyValue(entry, whole ? '__whole__' : path, w, parsed, section);
        }
      }
      if (invalid) return;
      close();
      _sfMarkDirty(parsed);
      var rec = uid ? (containerEl._ceUi._sfUidMap || _sfUidMap)[uid] : null;
      if (rec && rec.kind !== 'tabs') _sfRerender(uid, containerEl);
      else _ceRenderFn();
      if (ROOT.__keAutoSync) syncToSource(parsed);
    });
  }
  // 容器局部重渲染 (list/map/union/object/components/model 内容), 不整页刷新、不丢焦点
  function _sfRerender(uid, containerEl) {
    var rec = (containerEl._ceUi._sfUidMap || _sfUidMap)[uid];
    if (!rec || !containerEl || !containerEl.querySelectorAll) return;
    _sfActiveContainer = containerEl;
    if (!containerEl._ceEvKeys) containerEl._ceEvKeys = {};
    _sfClosePicker();
    var wraps = containerEl.querySelectorAll('[data-sf-uid="' + uid + '"]');
    if (!wraps.length) return;
    var wrap = wraps[0];
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var entry = _sfEntry(parsed, ui);
    if (!entry) return;
    var value = rec.path ? _getNested(entry.data, rec.path) : entry.data;
    var html;
    if (rec.kind === 'list') html = _sfListHtml(rec.def, rec.path, value, { uid: uid, inList: rec.inList });
    else if (rec.kind === 'map') html = _sfMapHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'union') html = _sfUnionHtml(rec.def, rec.path, value, { uid: uid, inList: rec.inList, entry: entry });
    else if (rec.kind === 'object') html = _sfObjectHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'components') html = _sfComponentsHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'model') html = _sfModelHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'popup') html = _sfPopupHtml(rec.def, rec.path, value, { uid: uid });
    else if (rec.kind === 'events') html = _sfEventsWidgetHtml(rec.def, rec.path, value, { uid: uid });
    else return;
    // html 含根节点, 必须替换节点本身 (innerHTML 会把新根嵌套进旧根, 每轮残留一层)
    wrap.outerHTML = html;
    wrap = containerEl.querySelector('[data-sf-uid="' + uid + '"]');
  }
  // schema 动作: 点击按钮 (list/map/union) / select 变更 (union-set/list-add)
  function _sfHandleAction(action, el, containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = _sfSection(parsed, ui);
    var entry = _sfEntry(parsed, ui);
    if (!section || !entry) return;
    var uid = el.getAttribute('data-sf-uid');
    var rec = uid ? (containerEl._ceUi._sfUidMap || _sfUidMap)[uid] : null;
    if (action === 'subtab') {
      // 子选项卡切换: 仅切 CSS 类, 不改数据
      var root = el.closest ? el.closest('.ce-sf-subtabs') : null;
      if (root && root.querySelectorAll) {
        var key = el.getAttribute('data-sf-subtab');
        var btns = root.querySelectorAll('[data-sf-action="subtab"]');
        for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('active', btns[b] === el);
        var panels = root.querySelectorAll('[data-sf-subtabpanel]');
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.toggle('active', panels[p].getAttribute('data-sf-subtabpanel') === key);
        }
      }
      return;
    }
    if (action === 'sf-event-open' || action === 'sf-event-back') {
      // 事件子页导航: 仅改视图状态, 不改数据
      if (!rec || rec.kind !== 'events') return;
      rec.evKey = (action === 'sf-event-back') ? null : (el.getAttribute('data-sf-ev') || '');
      // 导航状态持久到事件来源容器, 全量重渲染 (uid 重置) 后 events 子页不丢失
      if (containerEl && containerEl._ceEvKeys) containerEl._ceEvKeys[rec.path] = rec.evKey || '';
      _sfRerender(uid, containerEl);
      return;
    }
    if (action === 'mini-edit') {
      // 打开 MiniMessage 编辑器; 沙箱/未加载时静默跳过
      if (!ROOT.MiniMessageEditor) return;
      var wrapEl = el.closest ? el.closest('.ce-sf-mini-wrap') : null;
      var inp = wrapEl ? wrapEl.querySelector('input.ce-input, textarea.ce-input') : null;
      if (!inp) return;
      _sound('click');
      ROOT.MiniMessageEditor.open(inp.value, function (out) {
        if (out != null && String(out) !== inp.value) {
          inp.value = out;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      return;
    }
    if (action === 'spec-popup') {
      // 特殊配置弹窗 (版本条件 / !!type); 写回在确定按钮里处理, 取消不标记脏
      var spPath = el.getAttribute('data-sf-path') || '';
      var spFtype = el.getAttribute('data-sf-ftype') || '';
      var spLabel = el.getAttribute('data-sf-label') || '';
      var spDef = (spFtype || spLabel) ? { type: spFtype || 'text', label: spLabel } : null;
      _sfOpenSpecPopup(spDef, spPath, _sfUidOf(el), entry, parsed, section, containerEl);
      return;
    }
    if (action === 'picker-open') {
      // CE 元素快速填入面板: 不修改数据, 填入由 input change 事件负责
      var pkName = el.getAttribute('data-sf-picker') || '';
      if (!pkName) return;
      _sfOpenPicker(el, pkName, containerEl);
      return;
    }
    _sfMarkDirty(parsed); // 所有 schema 动作都会修改数据

    if (action === 'union-set') {
      if (!rec || rec.kind !== 'union') return;
      var path = el.getAttribute('data-sf-path') || rec.path;
      var v = el.value;
      if (v === '') {
        // 改回"不指定": 删除字段值
        if (path) _applyValue(entry, path, undefined, parsed, section);
        if (rec.def.keepKey && entry && entry._unionKeys) delete entry._unionKeys[path];
        _sfRerender(uid, containerEl);
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }
      var cur = path ? _getNested(entry.data, path) : entry.data;
      if (rec.def.noTypeKey) {
        // keepKey: 记录用户显式选择的类型, rerender 后形状推断不覆盖
        if (rec.def.keepKey && entry) {
          if (!entry._unionKeys) entry._unionKeys = {};
          entry._unionKeys[path] = v;
        }
        // 形状推断 union: 切换类型时若当前值不匹配目标形状, 创建默认值
        var curShape = _sfUnionCurrent(rec.def, cur);
        if (v === '__scalar') {
          if (curShape.key !== '__scalar' && path) _sfSetScalar(entry, path);
        } else if (curShape.key !== v) {
          var td = _sfTypesOf(rec.def)[v];
          var wt2 = td && td.widget ? td.widget.type : '';
          var scalarLike = wt2 === 'text' || wt2 === 'textarea' || wt2 === 'miniText' || wt2 === 'bool' || wt2 === 'linesScalar';
          if (scalarLike) {
            // 简单值类型: 写入空串占位 (_applyValue 会删除空值导致 select 弹回, remove_lore 正则等)
            if (path) _sfSetScalar(entry, path);
          } else {
            var defVal = {};
            if (td && td.widget) {
              // 形状切换时尽量保留数据:
              // 目标为 list/lines 且当前为对象/标量 → 包裹为 [cur]
              // 目标为对象值 widget 且当前为单元素数组 → 解包 cur[0]
              var wt = td.widget.type;
              var listLike = wt === 'listOf' || wt === 'lines' || wt === 'linesScalar';
              var objLike = wt === 'object' || wt === 'union' || wt === 'mapOf' || wt === 'kv' || wt === 'kvRest' || wt === 'components' || wt === 'model' || wt === 'tabs';
              if (listLike && cur !== undefined && cur !== null) {
                defVal = Array.isArray(cur) ? cur : [cur];
              } else if (objLike && Array.isArray(cur)) {
                // 数组→对象: 仅单项时解包, 多项保留数组 (解包会静默丢弃其余元素)
                defVal = cur.length === 1 ? cur[0] : cur;
              } else {
                defVal = _sfDefaultOf(td.widget);
              }
            }
            if (path) _applyValue(entry, path, defVal, parsed, section);
          }
        }
        _sfRerender(uid, containerEl);
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }
      var newVal;
      if (v === '__scalar') {
        newVal = (typeof cur === 'string') ? cur : '';
      } else {
        var neg = v.charAt(0) === '!';
        var tk = neg ? v.slice(1) : v;
        var td = _sfTypesOf(rec.def)[tk];
        newVal = { type: neg ? '!' + tk : tk };
        if (td && td.fields && cur && typeof cur === 'object' && !Array.isArray(cur)) {
          td.fields.forEach(function (f) {
            if (cur[f.key] !== undefined) newVal[f.key] = cur[f.key];
          });
        }
      }
      if (path) {
        if (newVal === '') _sfSetScalar(entry, path);
        else _applyValue(entry, path, newVal, parsed, section);
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-add') {
      if (!rec || rec.kind !== 'list') return;
      var arr = _getNested(entry.data, rec.path);
      if (!Array.isArray(arr)) { arr = []; _setNested(entry.data, rec.path, arr); }
      var itemDef = rec.def.itemType;
      var nv;
      if (itemDef && itemDef.type === 'union') {
        var tv = '';
        if (el.closest) {
          var addBox = el.closest('.ce-sf-list-add');
          var pick = addBox ? addBox.querySelector('.ce-sf-pick') : null;
          if (pick) tv = pick.value;
        }
        if (!tv) return;
        if (tv === '__scalar') nv = '';
        else if (itemDef.noTypeKey) {
          // 形状推断 union: 值即内容 (shape-form), 与 union-set 切换写入形式一致;
          // 键名形式 {类型键: 值} 会与形状推断渲染混淆, 造成同列表内两种形式混杂的数据损坏
          var wd = _sfTypesOf(itemDef)[tv];
          nv = (wd && wd.widget) ? _sfDefaultOf(wd.widget) : '';
        }
        else nv = { type: tv };
      } else {
        nv = _sfDefaultOf(itemDef);
      }
      arr.push(nv);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-del') {
      if (!rec || rec.kind !== 'list') return;
      var arr2 = _getNested(entry.data, rec.path);
      var idx = parseInt(el.getAttribute('data-sf-idx'), 10);
      if (Array.isArray(arr2) && idx >= 0 && idx < arr2.length) arr2.splice(idx, 1);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'list-move') {
      if (!rec || rec.kind !== 'list') return;
      var arr3 = _getNested(entry.data, rec.path);
      var i3 = parseInt(el.getAttribute('data-sf-idx'), 10);
      var dir = el.getAttribute('data-sf-dir');
      if (Array.isArray(arr3)) {
        var j3 = dir === 'up' ? i3 - 1 : i3 + 1;
        if (i3 >= 0 && i3 < arr3.length && j3 >= 0 && j3 < arr3.length) {
          var tmp = arr3[i3]; arr3[i3] = arr3[j3]; arr3[j3] = tmp;
        }
      }
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'map-add') {
      if (!rec || rec.kind !== 'map') return;
      var obj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        obj = {};
        if (rec.path) _setNested(entry.data, rec.path, obj);
        else entry.data = obj;
      }
      var base = 'new';
      var n = 1;
      var nk = base;
      while (Object.prototype.hasOwnProperty.call(obj, nk)) nk = base + (n++);
      obj[nk] = _sfDefaultOf(rec.def.valueType);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'map-del') {
      var path2 = el.getAttribute('data-sf-path');
      var okey = el.getAttribute('data-sf-okey');
      var obj2 = path2 ? _getNested(entry.data, path2) : entry.data;
      if (obj2 && typeof obj2 === 'object' && !Array.isArray(obj2)) delete obj2[okey];
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'union-clear') {
      if (!rec || rec.kind !== 'union') return;
      var path3 = el.getAttribute('data-sf-path') || rec.path;
      if (path3) _applyValue(entry, path3, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    }
    if (action === 'model-clear') {
      if (!rec || rec.kind !== 'model') return;
      var mp = el.getAttribute('data-sf-path') || rec.path;
      if (mp) _applyValue(entry, mp, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
    }
    if (action === 'popup-clear') {
      if (!rec || rec.kind !== 'popup') return;
      var pp = el.getAttribute('data-sf-path') || rec.path;
      if (pp) _applyValue(entry, pp, undefined, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'popup-edit') {
      if (!rec || rec.kind !== 'popup') return;
      var pep = el.getAttribute('data-sf-path') || rec.path;
      _sfOpenPopup(rec, pep, containerEl, entry, parsed, section, uid);
      return;
    }
    if (action === 'sf-event-add') {
      if (!rec || rec.kind !== 'events') return;
      _showAddEventModal(containerEl, rec.path, uid);
      return;
    }
    if (action === 'sf-event-del') {
      if (!rec || rec.kind !== 'events') return;
      _showEventDeleteConfirm(containerEl, el.getAttribute('data-sf-ev'), rec.path, uid);
      return;
    }
    if (action === 'comp-add') {
      if (!rec || rec.kind !== 'components') return;
      var ckey = el.value;
      if (!ckey) return;
      if (ckey === rec.def.conditionKey) return; // 条件走 cond-add, 不占组件槽
      var comps = _sfCompsOf(rec.def);
      var cobj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      if (!cobj || typeof cobj !== 'object' || Array.isArray(cobj)) {
        cobj = {};
        if (rec.path) _setNested(entry.data, rec.path, cobj);
      }
      if (ckey === '__custom__') {
        // 自定义组件: 自动生成不冲突的键, 值用 kv 编辑器 (支持嵌套)
        var cbn = 'custom';
        var cni = 1;
        while (cobj[cbn + (cni === 1 ? '' : '_' + cni)] !== undefined) cni++;
        ckey = cbn + (cni === 1 ? '' : '_' + cni);
      }
      var wd = comps[ckey];
      cobj[ckey] = wd ? _sfDefaultOf(wd.widget || wd) : {};
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'cond-add') {
      if (!rec || rec.kind !== 'components') return;
      var cdk = rec.def.conditionKey;
      if (!cdk) return;
      var cdobj = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      // 容器/条件值为标量时是非法形状: 重建为对象, 否则点击按钮静默无反应
      if (!cdobj || typeof cdobj !== 'object' || Array.isArray(cdobj)) {
        cdobj = {};
        if (rec.path) _setNested(entry.data, rec.path, cdobj);
      }
      var cdCur = cdobj[cdk];
      if (cdCur !== undefined && cdCur !== null && typeof cdCur === 'object' && !Array.isArray(cdCur)) return;
      var cdWd = _sfCompsOf(rec.def)[cdk];
      cdobj[cdk] = cdWd ? _sfDefaultOf(cdWd.widget || cdWd) : {};
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
    if (action === 'model-mode') {
      if (!rec || rec.kind !== 'model') return;
      var mode2 = el.value;
      var cur = rec.path ? _getNested(entry.data, rec.path) : entry.data;
      var next;
      if (mode2 === 'path') {
        next = (typeof cur === 'string') ? cur
          : (cur && typeof cur === 'object' && typeof cur.path === 'string') ? cur.path
          : '';
      } else if (mode2 === 'simplified') {
        next = (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) ? cur
          : (typeof cur === 'string') ? { path: cur }
          : {};
      } else {
        next = (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) ? Object.assign({}, cur) : {};
        if (!next.type) next.type = 'minecraft:model';
      }
      if (rec.path) _applyValue(entry, rec.path, next, parsed, section);
      _sfRerender(uid, containerEl);
      if (ROOT.__keAutoSync) syncToSource(parsed);
      return;
    }
  }

  // ---- schema section 表单 ----
  function _sfSchemaOf(type) {
    _sfInit();
    return (_sfSchemas && _sfSchemas.sections) ? (_sfSchemas.sections[type] || null) : null;
  }
  function _sfConfigSchemaOf(group) {
    _sfInit();
    return (_sfSchemas && _sfSchemas.config) ? (_sfSchemas.config[group] || null) : null;
  }
  // 条目其他字段: 折叠 + 每键 kv 行编辑
  function _sfOtherFieldsHtml(entry, modeled) {
    var data = entry.data;
    var rest = [];
    var keys = _entryKeyOrder(entry);
    for (var i = 0; i < keys.length; i++) {
      if (!modeled[keys[i]]) rest.push(keys[i]);
    }
    if (!rest.length) return '';
    var html = '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>';
    for (var r = 0; r < rest.length; r++) {
      var k = rest[r];
      var v = data ? data[k] : undefined;
      var editor;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) editor = _sfKvTextarea({ type: 'kv' }, k, v);
      else editor = _sfScalarInput({}, k, v);
      html += '<div class="ce-stack ce-sf-rest"><label class="ce-field-label">' +
        (_sfVersionKeyRe.test(k) ? _sfVersionKeyBadge(k) : '') + _escHtml(k) + '</label>' + editor + '</div>';
    }
    return html + '</details>';
  }
  function _sfEntryFormHtml(section, entry, schema, formTab, evKey) {
    _sfInit();
    var html = _renderField(_t('craftengine.entryKey'),
      _sfEntryKeyCtrl(entry.key, entry._group),
      _t('craftengine.entryKeyHint'));
    if (schema.wholeValue) {
      if (entry.data !== null && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
        html += _renderField(_t('craftengine.content'), _sfKvWhole({}, entry.data), _t('craftengine.kvWholeHint'));
      } else if (typeof entry.data === 'string') {
        html += _renderField(_t('craftengine.content'), _sfWholeText({}, entry.data), _t('craftengine.kvWholeHint'));
      } else {
        html += _renderField(_t('craftengine.content'),
          '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
          _escHtml(JSON.stringify(entry.data)) + '</textarea>', _t('craftengine.jsonEditorHint'));
      }
      return html;
    }
    var modeled = {};
    var tabs = null;
    if (schema.tabs && schema.tabs.length) {
      tabs = { other: '' };
      for (var t = 0; t < schema.tabs.length; t++) tabs[schema.tabs[t].key] = '';
    }
    var keyStyle = _sfItemKeyStyle(entry.data);
    // 本 schema 的规范键集合 (别名解析时避免与其它字段撞车)
    var canonicalKeys = Object.create(null);
    (schema.fields || []).forEach(function (f0) {
      if (!f0 || !f0.key) return;
      canonicalKeys[f0.key] = 1;
      canonicalKeys[f0.key.replace(/_/g, '-')] = 1;
    });
    (schema.fields || []).forEach(function (fld) {
      var fk = _sfFldKey(fld, keyStyle);
      // CE 别名键 (behaviors ↔ behavior / textures ↔ texture 等): 文件里写的是别名时,
      // 用实际存在的那个键作为字段路径, 这样表单能正确回显与写回, 而不是落到「其他字段」
      if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data) &&
          entry.data[fk] === undefined) {
        var aliasKey = _ceAliasKeyIn(entry.data, fk, canonicalKeys);
        if (aliasKey) fk = aliasKey;
      }
      modeled[fk] = 1;
      var fhtml;
      if (fld.custom === 'events') fhtml = _eventsPanel(entry, evKey);
      else if (fld.custom === 'root-map') {
        fhtml = _sfFieldHtml(fld, '', entry.data, { entryData: entry.data, entry: entry, keyStyle: keyStyle });
        // 根键已由 root-map 渲染, 全部标记为已建模
        if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
          for (var rk = 0; rk < Object.keys(entry.data).length; rk++) modeled[Object.keys(entry.data)[rk]] = 1;
        }
      }
      else fhtml = _sfFieldHtml(fld, fk, entry.data ? entry.data[fk] : undefined, { entryData: entry.data, entry: entry, keyStyle: keyStyle });
      if (tabs) {
        var tk = fld.tab || 'other';
        if (tabs[tk] === undefined) tabs[tk] = '';
        tabs[tk] += fhtml;
      } else {
        html += fhtml;
      }
    });
    if (tabs && tabs.custom !== undefined) {
      // 自定义选项卡: 警告 + 未建模键 kv 折叠 (写回保留 modeled 键)
      var cdata = (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) ? entry.data : {};
      var customRest = [];
      var customKeys = _entryKeyOrder(entry);
      for (var cr = 0; cr < customKeys.length; cr++) {
        if (!modeled[customKeys[cr]]) customRest.push(customKeys[cr]);
      }
      var customText = _sfObjText((function () { var o = {}; customRest.forEach(function (k) { o[k] = cdata[k]; }); return o; })());
      tabs.custom = '<div class="ce-sf-custom-warn">⚠ ' + _escHtml(_t('craftengine.customTabWarning')) + '</div>' +
        '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="" data-sf-type="kv-rest"' +
        ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
        ' rows="' + Math.max(3, Math.min(customRest.length + 1, 10)) + '" spellcheck="false">' + _escHtml(customText) + '</textarea></div>';
    }
    var other = _sfOtherFieldsHtml(entry, modeled);
    if (tabs) {
      tabs.other += other;
      html += _sfTabsHtml(schema, tabs, formTab);
    } else {
      html += other;
    }
    html += _sfDatalistHtml();
    return html;
  }
  // schema 选项卡: 标签取 schema.tabs 定义, 'other' 用 i18n
  function _sfTabsHtml(schema, tabsData, activeTab) {
    var order = [];
    Object.keys(tabsData).forEach(function (k) {
      if (tabsData[k] !== '') order.push(k);
    });
    if (!order.length) return '';
    var tabDefs = {};
    (schema.tabs || []).forEach(function (t) { tabDefs[t.key] = t; });
    var idx = 0;
    for (var i = 0; i < order.length; i++) {
      if (order[i] === activeTab) { idx = i; break; }
    }
    var bar = '<div class="ce-tabs">';
    for (var j = 0; j < order.length; j++) {
      var label;
      if (tabDefs[order[j]]) label = _labelOf(tabDefs[order[j]]);
      else if (order[j] === 'other') label = _t('craftengine.otherFields');
      else label = order[j];
      bar += '<button class="cv-btn cv-btn-sm ce-tab-btn' + (j === idx ? ' active' : '') + '" data-action="ce-tab" data-ce-tab="' + _escHtml(order[j]) + '">' +
        _escHtml(label) + '</button>';
    }
    bar += '</div>';
    var panels = '';
    for (var k = 0; k < order.length; k++) {
      panels += '<div class="ce-tab-panel' + (k === idx ? ' ce-tab-active' : '') + '" data-ce-tabpanel="' + _escHtml(order[k]) + '">' + tabsData[order[k]] + '</div>';
    }
    return bar + panels;
  }
  // config.yml 组表单: 顶层键投影的伪 section
  function _sfConfigEntryForm(section, entry) {
    _sfInit();
    var data = entry.data;
    var schema = _sfConfigSchemaOf(section.key);
    var html = '';
    if (schema && schema.type && !schema.fields) {
      // 标量组值 (config-version / metrics ...)
      var t = schema.type;
      if (t === 'bool') {
        html += _sfWrap(schema, '<input type="checkbox" class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-bool"' + (data ? ' checked' : '') + '>', '__whole__', data);
      } else if (t === 'number') {
        html += _sfWrap(schema, '<input class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-number" value="' + _escHtml(_sfScalarText(data)) + '" spellcheck="false">', '__whole__', data);
      } else {
        html += _sfWrap(schema, '<input class="ce-input" data-sf-kind="field" data-sf-path="__whole__" data-sf-type="whole-text" value="' + _escHtml(_sfScalarText(data)) + '" spellcheck="false">', '__whole__', data);
      }
      return html;
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      var modeled = {};
      if (schema && schema.fields) {
        for (var i = 0; i < schema.fields.length; i++) {
          var fld = schema.fields[i];
          modeled[fld.key] = 1;
          html += _sfFieldHtml(fld, fld.key, data[fld.key]);
        }
      }
      // 未建模键: 单个折叠 kv 编辑器 (整组替换, 保留已建模键)
      var rest = [];
      var keys = _entryKeyOrder(entry);
      for (var r = 0; r < keys.length; r++) {
        if (!modeled[keys[r]]) rest.push(keys[r]);
      }
      if (rest.length) {
        var text = _sfObjText((function () { var o = {}; rest.forEach(function (k) { o[k] = data[k]; }); return o; })());
        html += '<details class="ce-sf-collapse"><summary>' + _escHtml(_t('craftengine.otherFields') + ' (' + rest.length + ')') + '</summary>' +
          '<div class="ce-stack"><textarea class="ce-input ce-kv-field" data-sf-kind="field" data-sf-path="" data-sf-type="kv-rest"' +
          ' data-sf-exclude="' + _escHtml(Object.keys(modeled).join(',')) + '"' +
          ' rows="' + Math.max(3, Math.min(rest.length + 1, 10)) + '" spellcheck="false">' + _escHtml(text) + '</textarea></div></details>';
      }
    } else {
      html += _renderField(_t('craftengine.content'), _sfWholeText({}, data), _t('craftengine.kvWholeHint'));
    }
    html += _sfDatalistHtml();
    return html;
  }
  // config.yml: 顶层键投影为伪 sections (渲染层), 数据仍存 _fileLevelRaw
  function _projectConfigSections(parsed) {
    var ordered = [];
    for (var i = 0; i < parsed._topOrder.length; i++) {
      if (parsed._topOrder[i].kind === 'raw') ordered.push(parsed._topOrder[i].key);
    }
    for (var o = 0; o < ordered.length; o++) {
      var k = ordered[o];
      var v = parsed._fileLevelRaw[k];
      var isObj = v !== null && typeof v === 'object' && !Array.isArray(v);
      parsed.sections.push({
        key: k, base: 'config', segment: '',
        entries: [{ key: k, data: v, _rawOrder: isObj ? Object.keys(v) : [], _comments: { before: {}, inline: {}, afterKey: {} } }],
        _comments: { beforeEntry: {}, inlineEntry: {} },
      });
    }
  }

  // ============ 渲染 ============
  // 路径: 点号分段; map/组件键含 '.' 时经 _sfKeyPath 转义为 \.
  function _pathParts(path) {
    var parts = [];
    var cur = '';
    var s = String(path);
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\\' && s[i + 1] === '.') { cur += '.'; i++; }
      else if (s[i] === '.') { parts.push(cur); cur = ''; }
      else cur += s[i];
    }
    parts.push(cur);
    return parts;
  }
  function _sfKeyPath(path, key) {
    var esc = String(key).replace(/\./g, '\\.');
    return path ? path + '.' + esc : esc;
  }
  function _setNested(obj, path, value) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }
  function _getNested(obj, path) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      o = o[parts[i]];
    }
    return o;
  }
  function _deleteNested(obj, path) {
    var parts = _pathParts(path);
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o == null || typeof o[parts[i]] !== 'object') return;
      o = o[parts[i]];
    }
    delete o[parts[parts.length - 1]];
  }

  function _renderField(label, html, hint, key) {
    var icon = '';
    var tip = hint || '';
    var k = _sfHintKey(key);
    var _ch2 = _sfCeHints(); if (_ch2 && k && _ch2[k]) tip = _sfTipOf(_ch2[k]);
    if (tip) icon = '<span class="ce-sf-hint-icon" data-sf-hint="' + _escHtml(tip) + '">ℹ</span>';
    return '<div class="ce-field">' +
      '<label class="ce-field-label">' + _escHtml(label) + icon + '</label>' +
      (hint ? '<div class="ce-field-hint">' + _escHtml(hint) + '</div>' : '') +
      html + '</div>';
  }
  function _textInput(path, value, placeholder, type) {
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<input class="ce-input" data-ce-field="' + _escHtml(path) + '"' +
      (type === 'number' ? ' type="number" data-ce-type="number"' : '') +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' value="' + _escHtml(v) + '">';
  }
  function _checkbox(path, value) {
    return '<input type="checkbox" class="ce-input" data-ce-field="' + _escHtml(path) + '" data-ce-type="bool"' +
      (value ? ' checked' : '') + '>';
  }
  function _selectField(path, value, options, num, titlePrefix) {
    var html = '<select class="ce-input" data-ce-field="' + _escHtml(path) + '">' +
      '<option value="">-- ' + _escHtml(_t('craftengine.fieldEmpty')) + ' --</option>';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var otip = '';
      var _chL = _sfCeHints();
      if (titlePrefix && _chL) {
        var oh = _chL[titlePrefix + '.' + o];
        if (oh) otip = ' data-tip="' + _escHtml(_sfPlain(_sfTipOf(oh))) + '"';
      }
      html += '<option value="' + _escHtml(o) + '"' + otip + (String(value) === o ? ' selected' : '') + '>' + _escHtml(o) + '</option>';
    }
    return html + '</select>';
  }
  function _jsonField(path, value, exclude, placeholder) {
    var obj = value;
    if (exclude && obj && typeof obj === 'object' && !Array.isArray(obj)) {
      var copy = {};
      Object.keys(obj).forEach(function (k) {
        if (exclude.indexOf(k) === -1) copy[k] = obj[k];
      });
      obj = copy;
    }
    var text = '';
    if (obj !== undefined && obj !== null) {
      try { text = JSON.stringify(obj, null, 2); } catch (e) { text = String(obj); }
    }
    return '<textarea class="ce-input ce-json-field" data-ce-field-json="' + _escHtml(path) + '"' +
      (exclude ? ' data-json-exclude="' + _escHtml(exclude.join(',')) + '"' : '') +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="4" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _linesField(path, value, placeholder) {
    var arr = Array.isArray(value) ? value : [];
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="4" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _kvField(path, value, placeholder) {
    // 键值行编辑器: A: default:topaz / #tag / {...JSON}
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var text = Object.keys(obj).map(function (k) {
      var v = obj[k];
      var vs = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return k + ': ' + vs;
    }).join('\n');
    return '<textarea class="ce-input ce-kv-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="kv"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="5" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _textArea(path, value, placeholder, rows) {
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<textarea class="ce-input" data-ce-field="' + _escHtml(path) + '" data-ce-type="text"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (rows || 4) + '" spellcheck="false">' + _escHtml(v) + '</textarea>';
  }
  function _linesScalarField(path, value, placeholder) {
    // 1 行写字符串, 多行写数组 (item category / template)
    var arr = Array.isArray(value) ? value : (value !== undefined && value !== null ? [String(value)] : []);
    var text = arr.map(function (l) { return String(l); }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines-scalar"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (arr.length > 1 ? Math.min(arr.length + 1, 8) : 2) + '" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _linesJsonField(path, value, placeholder) {
    // 每行: 纯字符串或 JSON 对象 (sound.sounds 列表)
    var arr = Array.isArray(value) ? value : [];
    var text = arr.map(function (l) {
      if (l !== null && typeof l === 'object') return JSON.stringify(l);
      return String(l);
    }).join('\n');
    return '<textarea class="ce-input ce-lines-field" data-ce-field="' + _escHtml(path) + '" data-ce-type="lines-json"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="5" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  function _wholeTextField(value, placeholder, rows) {
    // 整条 entry 值为纯文本 (global_variables)
    var v = (value === undefined || value === null) ? '' : String(value);
    return '<textarea class="ce-input" data-ce-field="__whole__" data-ce-type="whole-text"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="' + (rows || 3) + '" spellcheck="false">' + _escHtml(v) + '</textarea>';
  }
  function _kvWholeField(value, placeholder) {
    // 整条 entry 值为 map (translations / lang)
    var obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var text = Object.keys(obj).map(function (k) {
      var v = obj[k];
      var vs = (v && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return k + ': ' + vs;
    }).join('\n');
    return '<textarea class="ce-input ce-kv-field" data-ce-field="__whole__" data-ce-type="kv-whole"' +
      (placeholder ? ' placeholder="' + _escHtml(placeholder) + '"' : '') +
      ' rows="8" spellcheck="false">' + _escHtml(text) + '</textarea>';
  }
  // behavior 子表单: type select + 该 type 的建模字段 + JSON 兜底
  function _behaviorForm(used, behaviorObj, typeOptions, typeKey, jsonKey) {
    var html = '';
    var bhv = behaviorObj && typeof behaviorObj === 'object' && !Array.isArray(behaviorObj) ? behaviorObj : {};
    var type = bhv.type;
    used[jsonKey || 'behavior'] = 1;
    html += _renderField(_t('craftengine.behaviorType'), _selectField('behavior.type', type, typeOptions, null, 'behavior'));
    var fields = BEHAVIOR_FIELDS[type] || null;
    var modeled = ['type'];
    if (fields) {
      for (var i = 0; i < fields.length; i++) {
        var spec = fields[i];
        var f = spec[0], ft = spec[1];
        modeled.push(f);
        var path = 'behavior.' + f;
        var v = _getNested(bhv, f);
        if (ft === 'number') html += _renderField(f, _textInput(path, v, '', 'number'));
        else if (ft === 'bool') html += _renderField(f, _checkbox(path, v));
        else if (ft === 'lines') html += _renderField(f, _linesField(path, v));
        else if (ft === 'lines-scalar') html += _renderField(f, _linesScalarField(path, v));
        else if (ft === 'lines-json') html += _renderField(f, _linesJsonField(path, v));
        else if (ft === 'select') html += _renderField(f, _selectField(path, v, spec[2] || []));
        else if (ft === 'json') html += _renderField(f, _jsonField(path, v));
        else html += _renderField(f, _textInput(path, v));
      }
    }
    html += _renderField(_t('craftengine.jsonEditor'), _jsonField('behavior', bhv, modeled));
    return html;
  }

  // ---- 条目表单 ----
  // templates: 模板 = 任意键值对集合 (深层嵌套 / $$ 版本键 / !!type 值), 整条 YAML 编辑
  function _sfTemplateEntryForm(section, entry) {
    return _renderField(_t('craftengine.entryKey'), _sfEntryKeyCtrl(entry.key, entry._group), _t('craftengine.entryKeyHint')) +
      _renderField(_t('craftengine.templateContent'), _sfYamlWhole(entry.data), _t('craftengine.templateContentHint'));
  }
  function _renderEntryForm(section, entry, formTab, evKey) {
    var type = TYPE_SECTIONS[section.base];
    var data = entry.data;
    // config 伪 section / schema 化 section (简单类型) 走数据驱动表单
    if (section.base === 'config') return _sfConfigEntryForm(section, entry);
    if (type === 'template') return _sfTemplateEntryForm(section, entry);
    var schema = _sfSchemaOf(type);
    if (schema) return _sfEntryFormHtml(section, entry, schema, formTab, evKey);
    var keyField = _renderField(_t('craftengine.entryKey'),
      _sfEntryKeyCtrl(entry.key, entry._group),
      _t('craftengine.entryKeyHint'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      // 标量条目 → 整条文本 (global_variables); 数组 → 通用 JSON
      if (type === 'globalVariable' && typeof data === 'string') {
        return keyField + _renderField(_t('craftengine.content'), _wholeTextField(data, '<global:id> 内容'));
      }
      return keyField + _renderField(_t('craftengine.jsonEditor'),
        '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
        _escHtml(_safeJsonStringify(data)) + '</textarea>',
        _t('craftengine.jsonEditorHint'));
    }
    var keys = _entryKeyOrder(entry);
    var html = '';
    var used = {};
    // 选项卡缓冲: basic/model/itemData/behavior/events/other
    var tabs = { basic: '', model: '', itemData: '', behavior: '', events: '', other: '' };

    if (type === 'item') {
      used['material'] = 1; tabs.basic += _renderField(_t('craftengine.material'), _textInput('material', data.material, 'paper'));
      used['custom-model-data'] = 1; tabs.basic += _renderField(_t('craftengine.customModelData'), _textInput('custom-model-data', data['custom-model-data'], '10000', 'number'));
      used['texture'] = 1; tabs.basic += _renderField(_t('craftengine.texture'), _textInput('texture', data.texture, 'minecraft:item/custom/xxx'));
      used['category'] = 1; tabs.basic += _renderField(_t('craftengine.category'), _linesScalarField('category', data.category, 'default:category（多行 = 多个分类）'));
      used['template'] = 1; tabs.basic += _renderField(_t('craftengine.template'), _linesScalarField('template', data.template, 'default:template（多行 = 多模板组合）'));
      used['arguments'] = 1; tabs.basic += _renderField(_t('craftengine.arguments'), _kvField('arguments', data.arguments, 'part: helmet\nslot: head'));
      used['client-bound-material'] = 1; tabs.basic += _renderField(_t('craftengine.clientBoundMaterial'), _textInput('client-bound-material', data['client-bound-material'], 'minecraft:paper'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.tags'), _linesField('settings.tags', _getNested(data, 'settings.tags'), 'minecraft:planks'));
      tabs.basic += _renderField(_t('craftengine.equipment'), _jsonField('settings.equipment', _getNested(data, 'settings.equipment')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['tags', 'equipment']));
      tabs.basic += '</div>';
      used['model'] = 1; tabs.model += _renderField(_t('craftengine.model'), _jsonField('model', data.model), _t('craftengine.modelJsonHint'));
      tabs.itemData += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.dataLabel')) + '</div>';
      used['data'] = 1;
      tabs.itemData += _renderField(_t('craftengine.displayName'), _textInput('data.item-name', _getNested(data, 'data.item-name'), '<!i><#FF8C00>Name'));
      tabs.itemData += _renderField(_t('craftengine.itemName'), _textInput('data.display-name', _getNested(data, 'data.display-name'), '<!i><white>Name'));
      tabs.itemData += _renderField(_t('craftengine.lore'), _linesField('data.lore', _getNested(data, 'data.lore'), '每行一条 lore'));
      tabs.itemData += _renderField(_t('craftengine.food'), _jsonField('data.food', _getNested(data, 'data.food')));
      tabs.itemData += _renderField(_t('craftengine.jsonEditor'), _jsonField('data', data.data), _t('craftengine.dataJsonHint'));
      tabs.itemData += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, ITEM_BEHAVIOR_TYPES);
      used['merges'] = 1; tabs.events += _renderField(_t('craftengine.merges'), _jsonField('merges', data.merges));
      used['overrides'] = 1; tabs.events += _renderField(_t('craftengine.overrides'), _jsonField('overrides', data.overrides));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
      used['updater'] = 1; tabs.events += _renderField(_t('craftengine.updater'), _jsonField('updater', data.updater));
    } else if (type === 'block') {
      used['state'] = 1; tabs.basic += _renderField(_t('craftengine.state'), _jsonField('state', data.state));
      used['states'] = 1; tabs.basic += _renderField(_t('craftengine.states'), _jsonField('states', data.states), _t('craftengine.statesHint'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.hardness'), _textInput('settings.hardness', _getNested(data, 'settings.hardness'), '2.0', 'number'));
      tabs.basic += _renderField(_t('craftengine.resistance'), _textInput('settings.resistance', _getNested(data, 'settings.resistance'), '2.0', 'number'));
      tabs.basic += _renderField(_t('craftengine.settingsItem'), _textInput('settings.item', _getNested(data, 'settings.item'), 'default:my_block'));
      tabs.basic += _renderField(_t('craftengine.mapColor'), _textInput('settings.map-color', _getNested(data, 'settings.map-color'), '19'));
      tabs.basic += _renderField(_t('craftengine.tags'), _linesField('settings.tags', _getNested(data, 'settings.tags'), 'minecraft:planks'));
      tabs.basic += _renderField(_t('craftengine.settingsSounds'), _jsonField('settings.sounds', _getNested(data, 'settings.sounds')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['hardness', 'resistance', 'item', 'map-color', 'tags', 'sounds']));
      tabs.basic += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, BLOCK_BEHAVIOR_TYPES);
      used['behaviors'] = 1; tabs.events += _renderField(_t('craftengine.behaviors'), _jsonField('behaviors', data.behaviors));
      used['loot'] = 1; tabs.events += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
    } else if (type === 'furniture') {
      used['variants'] = 1; tabs.basic += _renderField(_t('craftengine.variants'), _jsonField('variants', data.variants), _t('craftengine.variantsHint'));
      tabs.basic += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.settings')) + '</div>';
      used['settings'] = 1;
      tabs.basic += _renderField(_t('craftengine.settingsItem'), _textInput('settings.item', _getNested(data, 'settings.item'), 'default:my_furniture'));
      tabs.basic += _renderField(_t('craftengine.hitTimes'), _textInput('settings.hit-times', _getNested(data, 'settings.hit-times'), '0', 'number'));
      tabs.basic += _renderField(_t('craftengine.settingsSounds'), _jsonField('settings.sounds', _getNested(data, 'settings.sounds')));
      tabs.basic += _renderField(_t('craftengine.jsonEditor'), _jsonField('settings', data.settings, ['item', 'hit-times', 'sounds']));
      tabs.basic += '</div>';
      tabs.behavior += _behaviorForm(used, data.behavior, FURNITURE_BEHAVIOR_TYPES);
      used['behaviors'] = 1; tabs.events += _renderField(_t('craftengine.behaviors'), _jsonField('behaviors', data.behaviors));
      used['loot'] = 1; tabs.events += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
      used['events'] = 1; tabs.events += _eventsPanel(entry, evKey);
    } else if (type === 'recipe') {
      used['type'] = 1; html += _renderField(_t('craftengine.recipeType'), _selectField('type', data.type, RECIPE_TYPES));
      used['pattern'] = 1; html += _renderField(_t('craftengine.pattern'), _linesField('pattern', data.pattern), _t('craftengine.patternHint'));
      used['ingredients'] = 1; html += _renderField(_t('craftengine.ingredients'), _kvField('ingredients', data.ingredients), _t('craftengine.ingredientsHint'));
      html += '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.result')) + '</div>';
      used['result'] = 1;
      html += _renderField(_t('craftengine.resultId'), _textInput('result.id', _getNested(data, 'result.id'), 'default:item'));
      html += _renderField(_t('craftengine.resultCount'), _textInput('result.count', _getNested(data, 'result.count'), '1', 'number'));
      html += _renderField(_t('craftengine.jsonEditor'), _jsonField('result', data.result, ['id', 'count']));
      html += '</div>';
      used['experience'] = 1; html += _renderField(_t('craftengine.experience'), _textInput('experience', data.experience, '1.0', 'number'));
      used['time'] = 1; html += _renderField(_t('craftengine.time'), _textInput('time', data.time, '200', 'number'));
      used['base'] = 1; html += _renderField(_t('craftengine.base'), _textInput('base', data.base, 'default:item'));
      used['addition'] = 1; html += _renderField(_t('craftengine.addition'), _textInput('addition', data.addition, 'default:item'));
      used['template_type'] = 1; html += _renderField(_t('craftengine.templateType'), _textInput('template_type', data.template_type, 'minecraft:netherite_upgrade_smithing_template'));
      used['category'] = 1; html += _renderField(_t('craftengine.category'), _textInput('category', data.category, 'building'));
      used['group'] = 1; html += _renderField(_t('craftengine.group'), _textInput('group', data.group));
      used['unlock_on_ingredient_obtained'] = 1; html += _renderField(_t('craftengine.unlockOnIngredient'), _checkbox('unlock_on_ingredient_obtained', data.unlock_on_ingredient_obtained));
      used['unlock_on_join'] = 1; html += _renderField(_t('craftengine.unlockOnJoin'), _checkbox('unlock_on_join', data.unlock_on_join));
    } else if (type === 'equipment') {
      used['type'] = 1; html += _renderField(_t('craftengine.equipmentType'), _selectField('type', data.type, EQUIPMENT_TYPES));
      used['layers'] = 1; html += _renderField(_t('craftengine.layers'), _kvField('layers', data.layers), _t('craftengine.layersHint', { names: EQUIPMENT_LAYERS.join(' / ') }));
    } else if (type === 'image') {
      used['file'] = 1; html += _renderField(_t('craftengine.file'), _textInput('file', data.file, 'assets/images/xxx.png'));
      used['height'] = 1; html += _renderField(_t('craftengine.height'), _textInput('height', data.height, '16', 'number'));
      used['ascent'] = 1; html += _renderField(_t('craftengine.ascent'), _textInput('ascent', data.ascent, '12', 'number'));
      used['font'] = 1; html += _renderField(_t('craftengine.font'), _textInput('font', data.font, 'minecraft:default'));
      used['char'] = 1; html += _renderField(_t('craftengine.char'), _textInput('char', data.char, ''));
      used['chars'] = 1; html += _renderField(_t('craftengine.chars'), _linesField('chars', data.chars, '每行一个字符'));
      used['grid_size'] = 1; html += _renderField(_t('craftengine.gridSize'), _textInput('grid_size', data.grid_size, '16', 'number'));
      used['ref'] = 1; html += _renderField(_t('craftengine.ref'), _textInput('ref', data.ref, 'default:image'));
      used['row'] = 1; html += _renderField(_t('craftengine.row'), _textInput('row', data.row, '0', 'number'));
      used['column'] = 1; html += _renderField(_t('craftengine.column'), _textInput('column', data.column, '0', 'number'));
    } else if (type === 'category') {
      used['name'] = 1; html += _renderField(_t('craftengine.name'), _textInput('name', data.name, '分类显示名'));
      used['icon'] = 1; html += _renderField(_t('craftengine.icon'), _textInput('icon', data.icon, 'minecraft:paper'));
      used['priority'] = 1; html += _renderField(_t('craftengine.priority'), _textInput('priority', data.priority, '0', 'number'));
      used['hidden'] = 1; html += _renderField(_t('craftengine.hidden'), _checkbox('hidden', data.hidden));
      used['lore'] = 1; html += _renderField(_t('craftengine.lore'), _linesField('lore', data.lore, '每行一条 lore'));
      used['list'] = 1; html += _renderField(_t('craftengine.list'), _linesField('list', data.list, '分类下物品列表'));
      used['all_items'] = 1; html += _renderField(_t('craftengine.allItems'), _checkbox('all_items', data.all_items));
      used['conditions'] = 1; html += _renderField(_t('craftengine.conditions'), _jsonField('conditions', data.conditions));
    } else if (type === 'sound') {
      used['replace'] = 1; html += _renderField(_t('craftengine.replace'), _checkbox('replace', data.replace));
      used['subtitle'] = 1; html += _renderField(_t('craftengine.subtitle'), _textInput('subtitle', data.subtitle, '声音字幕'));
      var snds = data.sounds;
      used['sounds'] = 1;
      if (snds && typeof snds === 'object' && !Array.isArray(snds)) {
        html += _renderField(_t('craftengine.sounds'), _jsonField('sounds', snds));
      } else {
        html += _renderField(_t('craftengine.sounds'), _linesJsonField('sounds', snds), _t('craftengine.soundsHint'));
      }
    } else if (type === 'emoji') {
      used['keywords'] = 1; html += _renderField(_t('craftengine.keywords'), _linesField('keywords', data.keywords, '每行一个关键词'));
      used['content'] = 1; html += _renderField(_t('craftengine.content'), _textArea('content', data.content, 'emoji 文本', 2));
      used['image'] = 1; html += _renderField(_t('craftengine.image'), _textInput('image', data.image, 'assets/emoji/xxx.png'));
      used['permission'] = 1; html += _renderField(_t('craftengine.permission'), _textInput('permission', data.permission, 'chat.emoji.xxx'));
      used['chat_completion'] = 1; html += _renderField(_t('craftengine.chatCompletion'), _checkbox('chat_completion', data.chat_completion));
      used['template'] = 1; html += _renderField(_t('craftengine.template'), _textInput('template', data.template, 'default:emoji'));
      used['overrides'] = 1; html += _renderField(_t('craftengine.overrides'), _jsonField('overrides', data.overrides));
    } else if (type === 'jukeboxSong') {
      used['sound'] = 1; html += _renderField(_t('craftengine.sound'), _textInput('sound', data.sound, 'minecraft:music_disc.pigstep'));
      used['length'] = 1; html += _renderField(_t('craftengine.length'), _textInput('length', data.length, '150', 'number'));
      used['description'] = 1; html += _renderField(_t('craftengine.description'), _textInput('description', data.description, '唱片描述'));
      used['comparator_output'] = 1; html += _renderField(_t('craftengine.comparatorOutput'), _textInput('comparator_output', data.comparator_output, '0', 'number'));
      used['range'] = 1; html += _renderField(_t('craftengine.range'), _textInput('range', data.range, '10', 'number'));
    } else if (type === 'painting') {
      used['width'] = 1; html += _renderField(_t('craftengine.width'), _textInput('width', data.width, '2', 'number'));
      used['height'] = 1; html += _renderField(_t('craftengine.height'), _textInput('height', data.height, '2', 'number'));
      used['asset_id'] = 1; html += _renderField(_t('craftengine.assetId'), _textInput('asset_id', data.asset_id, 'assets/paintings/xxx'));
      used['title'] = 1; html += _renderField(_t('craftengine.title'), _textInput('title', data.title, '画名'));
      used['author'] = 1; html += _renderField(_t('craftengine.author'), _textInput('author', data.author, '作者'));
      used['show_in_op_tab'] = 1; html += _renderField(_t('craftengine.showInOpTab'), _checkbox('show_in_op_tab', data.show_in_op_tab));
    } else if (type === 'globalVariable') {
      // object 值: 整条键值行编辑 (string 已在上方标量分支处理)
      return _renderField(_t('craftengine.globalVariableMap'), _kvWholeField(data), _t('craftengine.kvWholeHint'));
    } else if (type === 'translation' || type === 'lang') {
      return _renderField(_t('craftengine.translationMap'), _kvWholeField(data), _t('craftengine.kvWholeHint'));
    } else if (type === 'lootSource') {
      used['type'] = 1; html += _renderField(_t('craftengine.lootSourceType'), _selectField('type', data.type, LOOT_SOURCE_TYPES, null, 'loot_source'));
      used['target'] = 1; html += _renderField(_t('craftengine.target'), _textInput('target', data.target, 'default:block'));
      used['targets'] = 1; html += _renderField(_t('craftengine.targets'), _linesField('targets', data.targets, '每行一个目标'));
      used['overwrite'] = 1; html += _renderField(_t('craftengine.overwrite'), _selectField('overwrite', data.overwrite, LOOT_OVERWRITE));
      used['conditions'] = 1; html += _renderField(_t('craftengine.conditions'), _jsonField('conditions', data.conditions));
      used['loot'] = 1; html += _renderField(_t('craftengine.loot'), _jsonField('loot', data.loot));
    } else if (type === 'placedFeature') {
      used['feature'] = 1; html += _renderField(_t('craftengine.feature'), _jsonField('feature', data.feature), _t('craftengine.featureHint'));
      used['placement'] = 1; html += _renderField(_t('craftengine.placement'), _jsonField('placement', data.placement));
      used['world'] = 1; html += _renderField(_t('craftengine.world'), _linesField('world', data.world, '每行一个世界'));
      used['dimension'] = 1; html += _renderField(_t('craftengine.dimension'), _linesField('dimension', data.dimension, '每行一个维度'));
      used['dimension_type'] = 1; html += _renderField(_t('craftengine.dimensionType'), _linesField('dimension_type', data.dimension_type));
      used['biome'] = 1; html += _renderField(_t('craftengine.biome'), _linesField('biome', data.biome, '每行一个生物群系'));
    } else {
      // 通用 section: 整条 JSON
      return _renderField(_t('craftengine.jsonEditor'),
        '<textarea class="ce-input ce-json-field ce-json-whole" data-ce-field-json="__whole__" rows="6" spellcheck="false">' +
        _escHtml(_safeJsonStringify(data)) + '</textarea>',
        _t('craftengine.jsonEditorHint'));
    }

    // 未建模字段: 逐键 JSON 编辑 (选项卡类型 → 附加到"其他"选项卡)
    var rest = [];
    for (var i = 0; i < keys.length; i++) {
      if (!used[keys[i]]) rest.push(keys[i]);
    }
    if (rest.length > 0) {
      var restHtml = '<div class="ce-field ce-field-collapse"><div class="ce-field-label">' + _escHtml(_t('craftengine.otherFields')) + ' (' + rest.length + ')</div>';
      for (var r = 0; r < rest.length; r++) {
        restHtml += _renderField(_escHtml(rest[r]), _jsonField(rest[r], data[rest[r]]));
      }
      restHtml += '</div>';
      if (TABBED_TYPES[type]) tabs.other = restHtml;
      else html += restHtml;
    }
    if (TABBED_TYPES[type]) {
      tabs.basic = keyField + tabs.basic;
      return _renderTabsHtml(tabs, formTab);
    }
    return keyField + html;
  }

  // ---- 选项卡表单 ----
  function _renderTabsHtml(tabs, activeTab) {
    var order = [];
    if (tabs.basic !== '') order.push(['basic', _t('craftengine.tabBasic')]);
    if (tabs.model !== '') order.push(['model', _t('craftengine.tabModel')]);
    if (tabs.itemData !== '') order.push(['itemData', _t('craftengine.tabItemData')]);
    if (tabs.behavior !== '') order.push(['behavior', _t('craftengine.tabBehavior')]);
    if (tabs.events !== '') order.push(['events', _t('craftengine.tabEvents')]);
    if (tabs.other !== '') order.push(['other', _t('craftengine.otherFields')]);
    if (!order.length) return tabs.basic || tabs.events || '';
    var idx = 0;
    for (var i = 0; i < order.length; i++) {
      if (order[i][0] === activeTab) { idx = i; break; }
    }
    var bar = '<div class="ce-tabs">';
    for (var j = 0; j < order.length; j++) {
      bar += '<button class="cv-btn cv-btn-sm ce-tab-btn' + (j === idx ? ' active' : '') + '" data-action="ce-tab" data-ce-tab="' + order[j][0] + '">' +
        _escHtml(order[j][1]) + '</button>';
    }
    bar += '</div>';
    var panels = '';
    for (var k = 0; k < order.length; k++) {
      panels += '<div class="ce-tab-panel' + (k === idx ? ' ce-tab-active' : '') + '" data-ce-tabpanel="' + order[k][0] + '">' + tabs[order[k][0]] + '</div>';
    }
    return bar + panels;
  }

  // ---- 事件选项卡: 列表 + 子页面 ----
  function _eventsPanel(entry, evKey) {
    var evs = entry.data.events;
    var isArr = Array.isArray(evs);
    var isMap = evs && typeof evs === 'object' && !Array.isArray(evs);
    if (evKey !== undefined && evKey !== null && evKey !== '') {
      if (isArr) {
        var iIdx = parseInt(evKey, 10);
        if (!isNaN(iIdx) && evs[iIdx] !== undefined) {
          return _eventsSubHtml(entry, String(iIdx), evs[iIdx], true, 'events');
        }
      } else if (isMap && evs[evKey] !== undefined) {
        return _eventsSubHtml(entry, evKey, evs[evKey], false, 'events');
      }
    }
    // 列表视图
    var html = '<div class="ce-events-header">' +
      '<span class="ce-events-title">' + _escHtml(_t('craftengine.eventsCount', { count: isArr ? evs.length : (isMap ? Object.keys(evs).length : 0) })) + '</span>' +
      '<button class="cv-btn cv-btn-primary cv-btn-sm" data-action="ce-add-event">' + _escHtml(_t('craftengine.eventsAdd')) + '</button>' +
      '</div>';
    if (isArr) {
      for (var i = 0; i < evs.length; i++) {
        var item = evs[i];
        var label = item && typeof item === 'object' ? (item.on !== undefined ? (Array.isArray(item.on) ? item.on.join(', ') : String(item.on)) : String(i + 1)) : String(i + 1);
        html += _eventRow(String(i), label);
      }
    } else if (isMap) {
      var mk = Object.keys(evs);
      for (var m = 0; m < mk.length; m++) {
        html += _eventRow(mk[m], mk[m]);
      }
    } else {
      html += '<div class="ce-events-empty">' + _escHtml(_t('craftengine.eventsEmpty')) + '</div>';
    }
    return html;
  }
  function _eventRow(evKey, label) {
    return '<div class="ce-event-item">' +
      '<span class="ce-event-name" data-action="ce-open-event" data-ce-ev="' + _escHtml(evKey) + '">' + _escHtml(label) + '</span>' +
      '<button class="cv-btn cv-btn-danger cv-btn-sm ce-event-del" data-action="ce-del-event" data-ce-ev="' + _escHtml(evKey) + '">✕</button>' +
      '</div>';
  }
  function _eventsSubHtml(entry, evKey, item, isArr, basePath, uid) {
    var isWidget = !!uid;
    var base = basePath || 'events';
    var html = '<button type="button" class="cv-btn cv-btn-secondary cv-btn-sm ce-ev-back"' +
      (isWidget ? ' data-sf-action="sf-event-back" data-sf-uid="' + uid + '"' : ' data-action="ce-ev-back"') +
      ' data-sf-ev="' + _escHtml(evKey) + '">' + _escHtml(_t('craftengine.eventsBack')) + '</button>';
    if (!_sfSchemas) {
      if (entry) {
        html += _renderField(_t('craftengine.eventsTrigger'), _linesScalarField(base + '.' + evKey + '.on', _getNested(entry.data, base + '.' + evKey + '.on'), 'right_click（多行 = 多个触发器）'));
        html += _renderField(_t('craftengine.eventsFunctions'), _jsonField(base + '.' + evKey + '.functions', _getNested(entry.data, base + '.' + evKey + '.functions'), null, '[{"type":"command","command":"say hi"}]'));
        html += _renderField(_t('craftengine.jsonEditor'), _jsonField(base + '.' + evKey, item, ['on', 'functions']));
      }
      return html;
    }
    _sfInit();
    if (isArr) {
      var p = base + '.' + evKey;
      html += _sfFieldHtml({
        type: 'linesScalar', label: _sfL(_t('craftengine.eventsTrigger'), _t('craftengine.eventsTrigger')),
        hint: _t('craftengine.eventsTriggerHint'), placeholder: _t('craftengine.eventsTriggerPh'),
      }, p + '.on', item ? item.on : undefined);
      html += _sfFieldHtml({
        type: 'listOf', label: _sfL(_t('craftengine.eventsFunctions'), _t('craftengine.eventsFunctions')),
        hint: _t('craftengine.eventsFunctionsHint'),
        itemType: { type: 'union', types: _sfSchemas.functions },
      }, p + '.functions', item ? item.functions : undefined);
    } else {
      html += _sfFieldHtml({
        type: 'listOf', label: _sfL(_t('craftengine.eventsContent'), _t('craftengine.eventsContent')),
        hint: _t('craftengine.eventsFunctionsHint'),
        itemType: { type: 'union', types: _sfSchemas.functions, allowScalar: { type: 'text', placeholder: _t('craftengine.eventsScalarPh') } },
      }, base + '.' + evKey, item);
    }
    html += _sfDatalistHtml();
    return html;
  }

  function _renderFromParsed(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    if (!parsed) return;
    _sfHintDefs = {};
    _sfPickerUnbindGlobal();
    _sfClosePicker(); // 重渲染会替换输入框, 关闭可能指向旧 DOM 的 picker 面板
    _sfActiveContainer = null;
    _sfActiveContainer = containerEl;
    _sfLastParsed = null;
    _sfUidSeq = Date.now() % 1000000;
    _sfUidMap = containerEl._ceUi._sfUidMap = {};
    if (!containerEl._ceEvKeys) containerEl._ceEvKeys = {};

    // 全量重建会重置 .ce-entry-scroll 滚动位置, 选中远处条目后视口会跳回顶部
    var prevScroll = 0;
    var prevSection = ui.section;
    var scrollEl = containerEl.querySelector('.ce-entry-scroll');
    if (scrollEl) prevScroll = scrollEl.scrollTop;

    if (parsed.error) {
      containerEl.innerHTML =
        '<div class="cv-error-banner"><span class="cv-error-icon">⚠️</span><div>' +
        '<strong>' + _escHtml(_t('craftengine.yamlError')) + '</strong>' +
        '<p>' + _escHtml(parsed.error) + '</p>' +
        '<p>' + _escHtml(_t('craftengine.yamlErrorHint')) + '</p></div></div>';
      return;
    }

    if (ui.section >= parsed.sections.length) ui.section = 0;
    var section = parsed.sections[ui.section];
    if (section) {
      if (ui.entry >= section.entries.length) ui.entry = 0;
    } else {
      ui.entry = 0;
    }

    // 左1: sections
    var secHtml = '';
    for (var s = 0; s < parsed.sections.length; s++) {
      var sec = parsed.sections[s];
      secHtml += '<div class="ce-section-item' + (s === ui.section ? ' ce-active' : '') + '" data-action="ce-select-section" data-section="' + s + '">' +
        _escHtml(sec.key) + ' <span class="ce-count">' + sec.entries.length + '</span></div>';
    }
    if (parsed.sections.length === 0) {
      secHtml += '<div class="ce-empty">' + _escHtml(_t('craftengine.noSections')) + '</div>';
    }
    // "添加分段"始终可用 (有空态提示 / 有分段时放列表末尾; config.yml 除外, 其顶层键由文件自身定义)
    if (!parsed._isConfig) {
      secHtml += '<button class="cv-btn cv-btn-secondary ce-add-btn" data-action="ce-add-section">' +
        _escHtml(_t('craftengine.addSection')) + '</button>';
    }

    // 左2: 条目列表
    var entryHtml = '';
    var addBtnHtml = '';
    if (section) {
      for (var e = 0; e < section.entries.length; e++) {
        var en = section.entries[e];
        entryHtml += '<div class="ce-entry-item' + (e === ui.entry ? ' ce-active' : '') + '" data-action="ce-select-entry" data-entry="' + e + '">' +
          (en._group ? _sfVersionKeyBadge(en._group) : (_sfVersionKeyRe.test(en.key) ? _sfVersionKeyBadge(en.key) : '')) + _escHtml(en.key) + '</div>';
      }
      if (section.entries.length === 0) {
        entryHtml += '<div class="ce-empty">' + _escHtml(_t('craftengine.noEntries')) + '</div>';
      }
      if (!parsed._isConfig) {
        addBtnHtml = '<button class="cv-btn cv-btn-secondary ce-add-btn" data-action="ce-add-entry">' +
          _escHtml(_t('craftengine.addEntry')) + '</button>';
      }
    }

    // 右: 表单
    var mainHtml = '';
    if (section && section.entries[ui.entry]) {
      var entry = section.entries[ui.entry];
      var typeName;
      if (section.base === 'config') typeName = _t('craftengine.type_config') + ' · ' + section.key;
      else typeName = TYPE_SECTIONS[section.base] ? _t('craftengine.type_' + TYPE_SECTIONS[section.base]) : _t('craftengine.type_generic');
      mainHtml =
        '<div class="ce-form-header">' +
        '<div class="ce-form-title">' + _escHtml(typeName) + '</div>' +
        '<div class="ce-form-actions">' +
        _cePreviewButtons(section) +
        (parsed._isConfig ? '' :
          '<button class="cv-btn cv-btn-danger ce-rm-btn" data-action="ce-delete-entry">' + _escHtml(_t('craftengine.deleteEntry')) + '</button>') +
        '</div></div>' +
        '<div class="ce-form-body">' + _renderEntryForm(section, entry, ui.formTab, ui.evKey) + '</div>';
    } else if (section && section.entries.length === 0) {
      mainHtml = '<div class="ce-empty">' + _escHtml(_t('craftengine.emptySection')) + '</div>';
    } else {
      mainHtml = '<div class="ce-empty">' + _escHtml(_t('craftengine.selectEntry')) + '</div>';
    }

    containerEl.innerHTML =
      '<div class="ce-container">' +
      '<div class="ce-header">' +
      '<div class="ce-badge" id="ce-owner-badge">' + _escHtml(_t('craftengine.ownerLoading')) + '</div>' +
      '<div class="ce-toolbar">' +
      '<button class="cv-btn cv-btn-secondary" data-action="ce-sync">' + _escHtml(_t('craftengine.syncToSource')) + '</button>' +
      '<button class="cv-btn cv-btn-secondary ce-diag-btn" data-action="ce-diag-open" data-tip="' + _escHtml(_tf('diagnostics.openPanel', '配置检查')) + '"><span id="ce-diag-badge" class="ce-diag-badge ce-diag-badge-none">✓</span> ' + _escHtml(_tf('diagnostics.title', '配置检查')) + '</button>' +
      '<label class="ce-autosync"><input type="checkbox" id="ce-autosync"' + (ROOT.__keAutoSync ? ' checked' : '') + '> ' + _escHtml(_t('craftengine.autoSync')) + '</label>' +
      '</div></div>' +
      '<div class="ce-layout">' +
      '<div class="ce-sections">' + secHtml + '</div>' +
      '<div class="ce-entry-list">' + '<div class="ce-entry-scroll">' + entryHtml + '</div>' + addBtnHtml + '</div>' +
      '<div class="ce-main">' + mainHtml + '</div>' +
      '</div></div>';

    // 同 section 内重建时恢复条目列表滚动位置
    if (ui.section === prevSection && prevScroll > 0) {
      var sc = containerEl.querySelector('.ce-entry-scroll');
      if (sc) sc.scrollTop = prevScroll;
    }

    // 工程归属徽章（异步）
    var badge = containerEl.querySelector('#ce-owner-badge');
    if (badge) {
      resolveProjectRoot(containerEl._ceFilePath).then(function (r) {
        if (badge.isConnected && r && r.found) {
          badge.textContent = _t('craftengine.ownerBadge', {
            pack: r.namespace || '',
            root: r.pluginRoot || r.packRoot || '',
          });
        } else if (badge.isConnected) {
          badge.textContent = _t('craftengine.ownerNone');
        }
      });
    }
    _sfLastParsed = containerEl._ceParsed;
    _ceDiagApply(containerEl);
    // 条目/分区切完后让开着的预览窗口跟着换内容 (自动切换预览)
    _ceNotifyPreviewFollow(containerEl);
  }

  // ============ 配置诊断 (IDEA 风格 ERROR/WARN/WEAK_WARN/INFO) ============
  var _CE_DIAG_CLASS = { ERROR: 'ce-diag-error', WARN: 'ce-diag-warn', WEAK_WARN: 'ce-diag-weak', INFO: 'ce-diag-info' };
  var _CE_DIAG_MARK = { ERROR: '✖', WARN: '⚠', WEAK_WARN: '△', INFO: 'ⓘ' };
  function _ceDiagApply(containerEl) {
    var parsed = containerEl._ceParsed;
    if (!parsed) return;
    // 诊断开关 (设置里关闭时不显示任何标记)
    var diagOff = (typeof document !== 'undefined' && document.body && document.body.classList &&
      document.body.classList.contains('ce-no-diagnostics'));
    var issues = [];
    if (!diagOff && typeof CEDiagnostics !== 'undefined') {
      try { issues = CEDiagnostics.analyze(parsed, { file: containerEl._ceFilePath }) || []; }
      catch (e) { issues = []; }
    }
    containerEl._ceIssues = issues;
    var c = (typeof CEDiagnostics !== 'undefined')
      ? CEDiagnostics.counts(issues)
      : { ERROR: 0, WARN: 0, WEAK_WARN: 0, INFO: 0, total: issues.length };
    // 工具条徽章
    var badge = containerEl.querySelector('#ce-diag-badge');
    if (badge) {
      badge.className = 'ce-diag-badge ' + (c.ERROR ? 'ce-diag-badge-error'
        : c.WARN ? 'ce-diag-badge-warn'
          : c.WEAK_WARN ? 'ce-diag-badge-weak' : c.INFO ? 'ce-diag-badge-info' : 'ce-diag-badge-none');
      badge.textContent = c.ERROR ? String(c.ERROR) : c.WARN ? String(c.WARN)
        : c.WEAK_WARN ? String(c.WEAK_WARN) : c.INFO ? String(c.INFO) : '✓';
      badge.title = _tf('diagnostics.summary', 'ERROR {e} · WARN {w} · WEAK {k} · INFO {i}',
        { e: c.ERROR, w: c.WARN, k: c.WEAK_WARN, i: c.INFO });
    }
    _ceDiagMark(containerEl, issues);
    try {
      ROOT.document.dispatchEvent(new CustomEvent('ce-diagnostics', {
        detail: { file: containerEl._ceFilePath, issues: issues, counts: c },
      }));
    } catch (e) { /* 宿主未监听时忽略 */ }
  }
  // 把诊断结果落到当前条目的字段控件上 (只标注当前编辑条目, 避免跨条目路径冲突)
  function _ceDiagMark(containerEl, issues) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    if (!parsed || !ui) return;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    var body = containerEl.querySelector('.ce-form-body');
    if (!body) return;
    // 清掉上一次的标注
    var old = body.querySelectorAll('.ce-diag-mark');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var marked = body.querySelectorAll('[class*="ce-diag-field-"]');
    for (var m = 0; m < marked.length; m++) {
      marked[m].className = marked[m].className.replace(/\s*ce-diag-field-\w+/g, '');
      marked[m].removeAttribute('title');
    }
    if (!issues.length || !entry) return;
    var byPath = {};
    var entryLevel = [];
    for (var j = 0; j < issues.length; j++) {
      var it = issues[j];
      if (it.entry && it.entry !== entry.key) continue;
      if (it.section && section && it.section !== section.key) continue;
      if (it.path) {
        (byPath[it.path] = byPath[it.path] || []).push(it);
      } else {
        entryLevel.push(it);
      }
    }
    var sevCls = { ERROR: 'ce-diag-field-error', WARN: 'ce-diag-field-warn', WEAK_WARN: 'ce-diag-field-weak', INFO: 'ce-diag-field-info' };
    var n = 0;
    Object.keys(byPath).forEach(function (p) {
      if (n++ > 400) return;
      var ctrl = null;
      try { ctrl = body.querySelector('[data-sf-path="' + _cssEsc(p) + '"]'); } catch (e) { ctrl = null; }
      if (!ctrl) ctrl = body.querySelector('[data-ce-field="' + _cssEsc(p) + '"]');
      if (!ctrl) return;
      var list = byPath[p].slice().sort(function (a, b) {
        return (CEDiagnostics ? CEDiagnostics.SEV_ORDER[a.severity] : 0) - (CEDiagnostics ? CEDiagnostics.SEV_ORDER[b.severity] : 0);
      });
      var worst = list[0];
      ctrl.classList.add(sevCls[worst.severity] || 'ce-diag-field-warn');
      ctrl.title = list.map(function (x) { return _CE_DIAG_MARK[x.severity] + ' ' + x.message; }).join('\n');
      var row = ctrl.closest ? (ctrl.closest('.ce-row') || ctrl.closest('.ce-stack')) : null;
      if (row) {
        var lbl = row.querySelector('.ce-field-label');
        if (lbl && !lbl.querySelector('.ce-diag-mark')) {
          var span = document.createElement('span');
          span.className = 'ce-diag-mark ce-diag-mark-' + worst.severity.toLowerCase();
          span.textContent = _CE_DIAG_MARK[worst.severity] || '!';
          span.title = ctrl.title;
          span.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            try {
              ROOT.document.dispatchEvent(new CustomEvent('ce-diagnostics-open', {
                detail: { file: containerEl._ceFilePath, issues: containerEl._ceIssues || [], focusPath: p },
              }));
            } catch (e2) { /* ignore */ }
          });
          lbl.appendChild(span);
        }
      }
    });
    // 条目级 (无 path) 的提示放在表单头部
    if (entryLevel.length) {
      var hdr = body.parentNode ? body.parentNode.querySelector('.ce-form-actions') : null;
      if (hdr) {
        var worstEntry = entryLevel.slice().sort(function (a, b) {
          return (CEDiagnostics ? CEDiagnostics.SEV_ORDER[a.severity] : 0) - (CEDiagnostics ? CEDiagnostics.SEV_ORDER[b.severity] : 0);
        })[0];
        var b2 = document.createElement('span');
        b2.className = 'ce-diag-entrymark ' + (SEV_CLS_ENTRY[worstEntry.severity] || '');
        b2.textContent = _CE_DIAG_MARK[worstEntry.severity] + ' ' + entryLevel.length;
        b2.title = entryLevel.map(function (x) { return _CE_DIAG_MARK[x.severity] + ' ' + x.message; }).join('\n');
        b2.addEventListener('click', function () {
          try {
            ROOT.document.dispatchEvent(new CustomEvent('ce-diagnostics-open', {
              detail: { file: containerEl._ceFilePath, issues: containerEl._ceIssues || [] },
            }));
          } catch (e2) { /* ignore */ }
        });
        hdr.insertBefore(b2, hdr.firstChild);
      }
    }
  }
  var SEV_CLS_ENTRY = { ERROR: 'ce-diag-mark-error', WARN: 'ce-diag-mark-warn', WEAK_WARN: 'ce-diag-mark-weak_warn', INFO: 'ce-diag-mark-info' };
  function _cssEsc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  // ============ 条目预览按钮 (物品/模型/字体图像 场景预览) ============
  // 只有能产生视觉结果的 section 才显示预览按钮
  var _CE_PREVIEW_SECTIONS = { items: 1, blocks: 1, furniture: 1, equipments: 1, images: 1, emoji: 1, categories: 1, paintings: 1 };
  function _cePreviewButtons(section) {
    if (!section || !_CE_PREVIEW_SECTIONS[section.base]) return '';
    if (typeof document !== 'undefined' && document.body && document.body.classList &&
        document.body.classList.contains('ce-no-preview')) return '';
    var tip = _escHtml(_tf('preview.open', '在模拟游戏场景中预览'));
    return '<button class="cv-btn cv-btn-secondary ce-preview-btn" data-action="ce-preview-entry" data-tip="' + tip + '" title="' + tip + '">👁 ' + _escHtml(_tf('preview.title', '预览')) + '</button>' +
      '<button class="cv-btn cv-btn-secondary ce-preview-btn" data-action="ce-preview-scene" data-ce-scene="gui" data-tip="' + _escHtml(_tf('preview.sceneGui', 'GUI 场景预览')) + '" title="' + _escHtml(_tf('preview.sceneGui', 'GUI 场景预览')) + '">▦</button>';
  }
  // 取当前条目并交给预览面板; scene 为 'auto' 时按 section 自动选择场景
  function _cePreviewCurrentEntry(containerEl, scene) {
    var P = ROOT.CEPreviewPanel;
    if (!P) {
      if (typeof ROOT.updateStatus === 'function') ROOT.updateStatus(_tf('preview.unavailable', '预览模块未加载'));
      return;
    }
    var c = _ceCurrentEntryCtx(containerEl);
    if (!c) return;
    c.scene = scene || 'auto';
    P.open(c);
  }
  // 「自动切换预览」: 条目/分区切换后, 若预览窗口开着就让它跟着换内容。
  // 开关来自设置 (defaultConfig.autoSwitchPreview, 由 renderer 写到 ROOT.__ceAutoSwitchPreview,
  // 缺省视为开启)。关闭时不动, 由用户点 👁 手动切。
  // 编辑器内浮层和独立系统窗口都算「预览开着」: 浮层走 follow, 独立窗口走 pushToDetached。
  function _ceNotifyPreviewFollow(containerEl) {
    if (ROOT.__ceAutoSwitchPreview === false) return;
    var P = ROOT.CEPreviewPanel;
    if (!P) return;
    var cur = _ceCurrentEntryCtx(containerEl);
    if (!cur) return;
    if (P.isOpen && P.isOpen()) {
      if (P.follow) { try { P.follow(cur); } catch (e) { /* 预览跟随失败不影响编辑 */ } }
      return;
    }
    // 浮层没开但独立窗口开着 → 同步给独立窗口 (open() 在 detached 模式下也会走到 detach)
    if (P.isDetached && P.isDetached()) {
      if (P.pushToDetached) { try { P.pushToDetached(cur); } catch (e) { /* ignore */ } }
    }
  }
  // 组装当前选中条目的预览上下文 (供 follow 复用), 与 _cePreviewCurrentEntry 的数据源一致
  function _ceCurrentEntryCtx(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    if (!parsed || !ui) return null;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!section || !entry) return null;
    return {
      file: containerEl._ceFilePath,
      section: section.key,
      sectionBase: section.base,
      entryKey: entry.key,
      data: entry.data,
      scene: 'auto',
    };
  }
  function _applyValue(entry, path, value, parsed, section) {
    if (path === '__key__') return; // 由 ce-rename 处理
    if (path === '__whole__') {
      entry.data = value;
      entry._rawOrder = (value && typeof value === 'object' && !Array.isArray(value)) ? Object.keys(value) : [];
      if (parsed && parsed._isConfig && section) parsed._fileLevelRaw[section.key] = value;
      _sfMarkDirty(parsed || _sfLastParsed);
      return;
    }
    var oldV = _getNested(entry.data, path);
    var existed = _getNested(entry.data, path) !== undefined;
    if (value === undefined || value === null || value === '') {
      if (existed) {
        _deleteNested(entry.data, path);
        _sfMarkDirty(parsed || _sfLastParsed);
      }
      return;
    }
    if (_ceIsWrap(oldV)) value = { __ceTag: oldV.__ceTag, v: value };
    if (!existed) {
      // 记录新键序
      var topKey = _pathParts(path)[0];
      if (entry._rawOrder.indexOf(topKey) === -1) entry._rawOrder.push(topKey);
    }
    _setNested(entry.data, path, value);
    _sfMarkDirty(parsed || _sfLastParsed);
  }
  // union 切到简单值: 存空串 (不走 _applyValue 的空值删除), 让输入框出现
  function _sfSetScalar(entry, path) {
    if (_getNested(entry.data, path) === undefined) {
      var tk = _pathParts(path)[0];
      if (entry._rawOrder.indexOf(tk) === -1) entry._rawOrder.push(tk);
    }
    _setNested(entry.data, path, '');
    _sfMarkDirty(_sfLastParsed);
  }

  function _bindEvents(containerEl) {
    var clickHandler = function (e) {
      var el = e.target.closest ? e.target.closest('[data-action], [data-sf-action]') : null;
      if (!el) return;
      var action = el.getAttribute('data-action');
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui) return;

      // schema 按钮动作 (list/map/union; select 类动作由 change 事件触发)
      var sfAction = el.getAttribute('data-sf-action');
      if (sfAction && el.tagName !== 'SELECT') {
        _sound('click');
        _sfHandleAction(sfAction, el, containerEl);
        return;
      }

      if (action === 'ce-select-section') {
        _sound('click');
        ui.section = parseInt(el.getAttribute('data-section'), 10);
        ui.entry = 0;
        _ceRenderFn();
      } else if (action === 'ce-select-entry') {
        _sound('click');
        ui.entry = parseInt(el.getAttribute('data-entry'), 10);
        _ceRenderFn();
      } else if (action === 'ce-sync') {
        _sound('click');
        syncToSource(parsed);
      } else if (action === 'ce-add-section') {
        _sound('click');
        _showAddSectionModal(containerEl);
      } else if (action === 'ce-add-entry') {
        _sound('click');
        _showAddEntryModal(containerEl);
      } else if (action === 'ce-delete-entry') {
        _sound('click');
        _showDeleteConfirm(containerEl);
      } else if (action === 'ce-tab') {
        _sound('click');
        var tab = el.getAttribute('data-ce-tab');
        ui.formTab = tab;
        var btns = containerEl.querySelectorAll('[data-action="ce-tab"]');
        for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('active', btns[b] === el);
        var panels = containerEl.querySelectorAll('[data-ce-tabpanel]');
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.toggle('ce-tab-active', panels[p].getAttribute('data-ce-tabpanel') === tab);
        }
      } else if (action === 'ce-open-event') {
        _sound('click');
        ui.evKey = el.getAttribute('data-ce-ev');
        ui.formTab = 'events';
        _ceRenderFn();
      } else if (action === 'ce-ev-back') {
        _sound('click');
        ui.evKey = null;
        _ceRenderFn();
      } else if (action === 'ce-add-event') {
        _sound('click');
        _showAddEventModal(containerEl);
      } else if (action === 'ce-del-event') {
        _sound('click');
        _showEventDeleteConfirm(containerEl, el.getAttribute('data-ce-ev'));
      } else if (action === 'ce-preview-entry') {
        _sound('click');
        _cePreviewCurrentEntry(containerEl);
      } else if (action === 'ce-preview-scene') {
        _sound('click');
        _cePreviewCurrentEntry(containerEl, el.getAttribute('data-ce-scene') || 'auto');
      } else if (action === 'ce-diag-open') {
        _sound('click');
        try {
          document.dispatchEvent(new CustomEvent('ce-diagnostics-open', {
            detail: { file: containerEl._ceFilePath, issues: containerEl._ceIssues || [] },
          }));
        } catch (err) { /* ignore */ }
      }
    };
    var changeHandler = function (e) {
      var target = e.target;
      if (!target || !target.getAttribute) return;
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui || !parsed.sections[ui.section]) return;
      var section = parsed.sections[ui.section];
      var entry = section.entries[ui.entry];
      if (!entry) return;

      // ---- schema 表单 ----
      var sfAct = target.getAttribute('data-sf-action');
      if (sfAct) {
        _sfHandleAction(sfAct, target, containerEl);
        return;
      }
      var sfKind = target.getAttribute('data-sf-kind');
      if (sfKind) {
        var path = target.getAttribute('data-sf-path');
        var sfType = target.getAttribute('data-sf-type');
        if (sfKind === 'map-key') {
          var okey = target.getAttribute('data-sf-okey');
          var nkey = target.value.trim();
          if (!nkey) { target.classList.add('ce-invalid'); return; }
          var mkObj = path ? _getNested(entry.data, path) : entry.data;
          if (mkObj && typeof mkObj === 'object' && !Array.isArray(mkObj)) {
            if (nkey !== okey) {
              if (Object.prototype.hasOwnProperty.call(mkObj, nkey)) { target.classList.add('ce-invalid'); return; }
              mkObj[nkey] = mkObj[okey];
              delete mkObj[okey];
            }
          }
          target.classList.remove('ce-invalid');
          var muid = _sfUidOf(target);
          if (muid) _sfRerender(muid, containerEl);
          if (ROOT.__keAutoSync) syncToSource(parsed);
          return;
        }
        var val;
        if (path === '__whole__') {
          if (sfType === 'yaml-whole') {
            var yt = target.value;
            var yo;
            try {
              yo = yt.trim() ? YAML.load(yt, { schema: _ceYamlSchema() }) : undefined;
            } catch (e2) {
              target.classList.add('ce-invalid');
              return;
            }
            target.classList.remove('ce-invalid');
            _applyValue(entry, '__whole__', yo, parsed, section);
          } else if (sfType === 'kv-whole') {
            var wr = _parseKvText(target.value);
            if (wr.bad) { target.classList.add('ce-invalid'); return; }
            target.classList.remove('ce-invalid');
            _applyValue(entry, '__whole__', wr.obj, parsed, section);
          } else if (sfType === 'whole-bool') {
            _applyValue(entry, '__whole__', target.checked, parsed, section);
          } else if (sfType === 'whole-number') {
            var wn = parseFloat(target.value);
            _applyValue(entry, '__whole__', isNaN(wn) ? undefined : wn, parsed, section);
          } else {
            _applyValue(entry, '__whole__', target.value, parsed, section);
          }
          if (ROOT.__keAutoSync) syncToSource(parsed);
          return;
        }
        if (sfType === 'number') {
          var n2 = parseFloat(target.value);
          val = isNaN(n2) ? undefined : n2;
        } else if (sfType === 'bool') {
          val = target.checked;
        } else if (sfType === 'lines') {
          var la = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          val = la.length ? la : undefined;
        } else if (sfType === 'lines-scalar') {
          var lsa = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          val = lsa.length > 1 ? lsa : (lsa.length === 1 ? lsa[0] : undefined);
        } else if (sfType === 'kv' || sfType === 'kv-rest') {
          var kr = _parseKvText(target.value);
          if (kr.bad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          if (sfType === 'kv-rest') {
            var excl = (target.getAttribute('data-sf-exclude') || '').split(',').filter(Boolean);
            var curObj = path ? _getNested(entry.data, path) : entry.data;
            var next = {};
            if (curObj && typeof curObj === 'object' && !Array.isArray(curObj)) {
              Object.keys(curObj).forEach(function (k) {
                if (excl.indexOf(k) !== -1) next[k] = curObj[k];
              });
            }
            Object.keys(kr.obj).forEach(function (k) { next[k] = kr.obj[k]; });
            if (!path) _applyValue(entry, '__whole__', next, parsed, section);
            else _applyValue(entry, path, next, parsed, section);
          } else {
            val = Object.keys(kr.obj).length ? kr.obj : undefined;
          }
        } else if (sfType === 'scalar') {
          val = _parseKvLine(target.value);
        } else if (sfType === 'string-scalar') {
          val = target.value;
        } else if (sfType === 'select') {
          val = target.getAttribute('data-sf-num') ? parseFloat(target.value) : target.value;
        } else {
          val = target.value;
        }
        if (val !== undefined || sfType === 'kv' || sfType === 'kv-rest') {
          if (val !== undefined) _applyValue(entry, path, val, parsed, section);
        }
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }

      var field = target.getAttribute('data-ce-field');
      if (field) {
        if (field === '__key__') return; // 由 ce-rename 处理
        var type = target.getAttribute('data-ce-type');
        if (type === 'number') {
          var n = parseFloat(target.value);
          _applyValue(entry, field, isNaN(n) ? undefined : n, parsed, section);
        } else if (type === 'bool') {
          _applyValue(entry, field, target.checked, parsed, section);
        } else if (type === 'lines') {
          var arr = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          _applyValue(entry, field, arr.length ? arr : undefined, parsed, section);
        } else if (type === 'kv') {
          var obj = {};
          var bad = null;
          var lns = target.value.split('\n');
          for (var i = 0; i < lns.length; i++) {
            var ln = lns[i].replace(/\r$/, '');
            if (!ln.trim()) continue;
            var idx = ln.indexOf(':');
            if (idx <= 0) { bad = lns[i]; break; }
            var k = ln.slice(0, idx).trim();
            var v = ln.slice(idx + 1).trim();
            var parsedV = v;
            if (/^[\[{"]/.test(v)) {
              try { parsedV = JSON.parse(v); } catch (err) { parsedV = v; }
            }
            obj[k] = parsedV;
          }
          if (bad) {
            target.classList.add('ce-invalid');
            return;
          }
          target.classList.remove('ce-invalid');
          _applyValue(entry, field, Object.keys(obj).length ? obj : undefined, parsed, section);
        } else if (type === 'lines-scalar') {
          var ls = target.value.split('\n').map(function (l) { return l.replace(/\r$/, ''); })
            .filter(function (l) { return l.trim() !== ''; });
          _applyValue(entry, field, ls.length > 1 ? ls : (ls.length === 1 ? ls[0] : undefined), parsed, section);
        } else if (type === 'lines-json') {
          var lj = [];
          var ljBad = null;
          var ljs = target.value.split('\n');
          for (var j = 0; j < ljs.length; j++) {
            var l = ljs[j].replace(/\r$/, '').trim();
            if (!l) continue;
            if (/^[\[{"']/.test(l)) {
              try { lj.push(JSON.parse(l)); } catch (err) { ljBad = ljs[j]; break; }
            } else lj.push(l);
          }
          if (ljBad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          _applyValue(entry, field, lj.length ? lj : undefined, parsed, section);
        } else if (type === 'whole-text') {
          _applyValue(entry, '__whole__', target.value, parsed, section);
        } else if (type === 'kv-whole') {
          var kw = {};
          var kwBad = null;
          var kls = target.value.split('\n');
          for (var k2 = 0; k2 < kls.length; k2++) {
            var kl = kls[k2].replace(/\r$/, '');
            if (!kl.trim()) continue;
            var kIdx = kl.indexOf(':');
            if (kIdx <= 0) { kwBad = kls[k2]; break; }
            var kk = kl.slice(0, kIdx).trim();
            var kvv = kl.slice(kIdx + 1).trim();
            var pv = kvv;
            if (/^[\[{"]/.test(kvv)) {
              try { pv = JSON.parse(kvv); } catch (err) { pv = kvv; }
            }
            kw[kk] = pv;
          }
          if (kwBad) { target.classList.add('ce-invalid'); return; }
          target.classList.remove('ce-invalid');
          _applyValue(entry, '__whole__', kw, parsed, section);
        } else {
          _applyValue(entry, field, target.value, parsed, section);
        }
        if (ROOT.__keAutoSync) syncToSource(parsed);
        return;
      }

      var jsonField = target.getAttribute('data-ce-field-json');
      if (jsonField) {
        var exclude = target.getAttribute('data-json-exclude');
        var excl = exclude ? exclude.split(',') : [];
        var current = _getNested(entry.data, jsonField);
        var newVal = null;
        try {
          newVal = JSON.parse(target.value);
        } catch (err) {
          target.classList.add('ce-invalid');
          return;
        }
        target.classList.remove('ce-invalid');
        if (jsonField === '__whole__') {
          _applyValue(entry, '__whole__', newVal, parsed, section);
          if (ROOT.__keAutoSync) syncToSource(parsed);
          _ceRenderFn();
          return;
        }
        if (excl.length && current && typeof current === 'object' && !Array.isArray(current) &&
          newVal && typeof newVal === 'object' && !Array.isArray(newVal)) {
          for (var x = 0; x < excl.length; x++) {
            if (current[excl[x]] !== undefined) newVal[excl[x]] = current[excl[x]];
          }
        }
        _applyValue(entry, jsonField, newVal, parsed, section);
        if (ROOT.__keAutoSync) syncToSource(parsed);
      }
    };
    var keyChangeHandler = function (e) {
      var containerEl = e.currentTarget;
      var target = e.target;
      if (!target || target.getAttribute('data-ce-field') !== '__key__') return;
      var parsed = containerEl._ceParsed;
      var ui = containerEl._ceUi;
      if (!parsed || !ui || !parsed.sections[ui.section]) return;
      var section = parsed.sections[ui.section];
      if (parsed._isConfig) return; // config 伪 section 键不可编辑
      var entry = section.entries[ui.entry];
      if (!entry) return;
      var newKey = target.value.trim();
      if (!newKey) return;
      var keyOnly = !!KEY_ONLY_SECTIONS[section.key];
      var valid = keyOnly ? KEY_ONLY_RE.test(newKey) :
        (NS_RE.test(newKey.split(':')[0] || '') && PATH_RE.test(newKey.split(':')[1] || '') && newKey.indexOf(':') !== -1);
      if (!valid) {
        target.classList.add('ce-invalid');
        return;
      }
      for (var i = 0; i < section.entries.length; i++) {
        if (i !== ui.entry && section.entries[i].key === newKey) {
          target.classList.add('ce-invalid');
          return;
        }
      }
      target.classList.remove('ce-invalid');
      if (entry.key !== newKey) {
        entry.key = newKey;
        _sfMarkDirty(parsed);
        _ceRenderFn();
      }
    };
    var autoSyncHandler = function (e) {
      if (e.target && e.target.id === 'ce-autosync') {
        ROOT.__keAutoSync = e.target.checked;
      }
    };

    // yaml-whole 高亮层: input 实时重绘, scroll 同步 (scroll 不冒泡, 用 capture)
    var yamlHlHandler = function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-sf-type') === 'yaml-whole') {
        var pre = t.parentNode.querySelector('.ce-yaml-hl');
        if (pre) {
          pre.innerHTML = _ceYamlHighlight(t.value);
          pre.scrollTop = t.scrollTop;
          pre.scrollLeft = t.scrollLeft;
        }
      }
    };
    var yamlScrollHandler = function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-sf-type') === 'yaml-whole') {
        var pre = t.parentNode.querySelector('.ce-yaml-hl');
        if (pre) { pre.scrollTop = t.scrollTop; pre.scrollLeft = t.scrollLeft; }
      }
    };
    containerEl.addEventListener('click', clickHandler);
    containerEl.addEventListener('change', changeHandler);
    containerEl.addEventListener('change', keyChangeHandler);
    containerEl.addEventListener('change', autoSyncHandler);
    containerEl.addEventListener('input', yamlHlHandler);
    containerEl.addEventListener('scroll', yamlScrollHandler, true);
    containerEl._ceClickHandler = clickHandler;
    containerEl._ceChangeHandler = changeHandler;
    containerEl._ceKeyChangeHandler = keyChangeHandler;
    containerEl._ceAutoSyncHandler = autoSyncHandler;
    containerEl._ceYamlHlHandler = yamlHlHandler;
    containerEl._ceYamlScrollHandler = yamlScrollHandler;
  }

  function _ceRenderFn() {
    if (_sfActiveContainer && _sfActiveContainer._ceRenderFn) _sfActiveContainer._ceRenderFn();
    else if (ROOT._ceRenderFn) ROOT._ceRenderFn();
  }

  // ---- 新建条目弹窗 ----
  function _showAddEntryModal(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    if (!section) return;
    var old = document.getElementById('ce-add-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-add-modal';
    modal.className = 'cv-modal';
    var secOptions = parsed.sections.map(function (s, i) {
      return '<option value="' + i + '"' + (i === ui.section ? ' selected' : '') + '>' + _escHtml(s.key) + '</option>';
    }).join('');
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.newEntryTitle')) + '</h3>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.section')) + '</label>' +
      '<select id="ce-add-section" class="cv-select cv-select-lg">' + secOptions + '</select></div>' +
      '<div class="cv-modal-field" id="ce-add-ns-field"><label>' + _escHtml(_t('craftengine.entryNamespace')) + '</label>' +
      '<input id="ce-add-ns" class="cv-input" placeholder="kangelitem" spellcheck="false"></div>' +
      '<div class="cv-modal-field" id="ce-add-path-field"><label>' + _escHtml(_t('craftengine.entryPath')) + '</label>' +
      '<input id="ce-add-path" class="cv-input" placeholder="white_horse" spellcheck="false"></div>' +
      '<div class="cv-modal-field" id="ce-add-id-field" style="display:none;"><label>' + _escHtml(_t('craftengine.entryId')) + '</label>' +
      '<input id="ce-add-id" class="cv-input" placeholder="my_variable" spellcheck="false">' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.keyOnlyHint')) + '</div></div>' +
      '<div class="cv-modal-field" id="ce-add-err" style="display:none;color:var(--color-error);font-size:12px;"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-add-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" id="ce-add-confirm">' + _escHtml(_t('craftengine.confirmAdd')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var errEl = document.getElementById('ce-add-err');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
    var secSel = document.getElementById('ce-add-section');
    var nsWrap = document.getElementById('ce-add-ns-field');
    var pathWrap = document.getElementById('ce-add-path-field');
    var idWrap = document.getElementById('ce-add-id-field');
    function syncKeyFields() {
      var s = parsed.sections[parseInt(secSel.value, 10)];
      var ko = !!(s && KEY_ONLY_SECTIONS[s.key]);
      nsWrap.style.display = ko ? 'none' : '';
      pathWrap.style.display = ko ? 'none' : '';
      idWrap.style.display = ko ? '' : 'none';
    }
    secSel.addEventListener('change', syncKeyFields);
    syncKeyFields();
    document.getElementById('ce-add-confirm').addEventListener('click', function () {
      var secIdx = parseInt(secSel.value, 10);
      var target = parsed.sections[secIdx];
      var key;
      if (KEY_ONLY_SECTIONS[target.key]) {
        var id = document.getElementById('ce-add-id').value.trim();
        if (!KEY_ONLY_RE.test(id)) { showErr(_t('craftengine.entryIdInvalid')); return; }
        key = id;
      } else {
        var ns = document.getElementById('ce-add-ns').value.trim();
        var p = document.getElementById('ce-add-path').value.trim();
        if (!NS_RE.test(ns)) { showErr(_t('craftengine.entryNamespaceInvalid')); return; }
        if (!PATH_RE.test(p)) { showErr(_t('craftengine.entryPathInvalid')); return; }
        key = ns + ':' + p;
      }
      for (var i = 0; i < target.entries.length; i++) {
        if (target.entries[i].key === key) { showErr(_t('craftengine.entryExists', { key: key })); return; }
      }
      target.entries.push({ key: key, data: {}, _rawOrder: [] });
      _sfMarkDirty(parsed);
      ui.section = secIdx;
      ui.entry = target.entries.length - 1;
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-add-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 新建分段弹窗 (空文件/无分段时的起步入口; 空态按钮 data-action="ce-add-section") ----
  function _showAddSectionModal(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    if (!parsed || parsed._isConfig) return; // config.yml 顶层键由文件自身定义, 不在此新增
    var old = document.getElementById('ce-addsec-modal');
    if (old) old.remove();

    // 下拉: SECTION_KEYS 中尚未出现的顶层分段 (已存在的无从新建)
    var existing = {};
    for (var i = 0; i < parsed.sections.length; i++) {
      existing[parsed.sections[i].key] = true;
    }
    for (var rk in parsed._fileLevelRaw) existing[rk] = true;
    var candidates = SECTION_KEYS.filter(function (k) { return !existing[k]; });

    var modal = document.createElement('div');
    modal.id = 'ce-addsec-modal';
    modal.className = 'cv-modal';
    var opts = candidates.map(function (k, idx) {
      return '<option value="' + _escHtml(k) + '"' + (idx === 0 ? ' selected' : '') + '>' + _escHtml(k) + '</option>';
    }).join('');
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.addSectionTitle')) + '</h3>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.sectionPreset')) + '</label>' +
      '<select id="ce-addsec-preset" class="cv-select cv-select-lg">' +
      (opts || '<option value="">' + _escHtml(_t('craftengine.sectionPresetNone')) + '</option>') +
      '</select>' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.sectionPresetHint')) + '</div></div>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.sectionCustom')) + '</label>' +
      '<input id="ce-addsec-custom" class="cv-input" placeholder="items" spellcheck="false">' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.sectionCustomHint')) + '</div></div>' +
      '<div class="cv-modal-field" id="ce-addsec-err" style="display:none;color:var(--color-error);font-size:12px;"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-addsec-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" id="ce-addsec-confirm">' + _escHtml(_t('craftengine.confirmAdd')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var errEl = document.getElementById('ce-addsec-err');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
    document.getElementById('ce-addsec-confirm').addEventListener('click', function () {
      var custom = document.getElementById('ce-addsec-custom').value.trim();
      var preset = document.getElementById('ce-addsec-preset').value;
      var key = custom || preset;
      if (!key) { showErr(_t('craftengine.sectionEmpty')); return; }
      // 校验: 顶层分段键形如 items / items#1 (SECTION_BASE_RE), 且不与现有键重复
      var m = key.match(SECTION_BASE_RE);
      if (!m || SECTION_KEYS.indexOf(m[1]) === -1) { showErr(_t('craftengine.sectionInvalid')); return; }
      for (var i = 0; i < parsed.sections.length; i++) {
        if (parsed.sections[i].key === key) { showErr(_t('craftengine.sectionExists', { key: key })); return; }
      }
      if (parsed._fileLevelRaw[key] !== undefined) { showErr(_t('craftengine.sectionExists', { key: key })); return; }
      // 与 parse() 同构的 section 结构: 同步写入 sections + _topOrder, generateYAML 才会带上
      var sec = {
        key: key,
        base: m[1],
        segment: m[2] || '',
        entries: [],
        entryOrder: [],
        _comments: { beforeEntry: {}, inlineEntry: {} },
      };
      parsed.sections.push(sec);
      parsed._topOrder.push({ kind: 'section', key: key });
      _sfMarkDirty(parsed);
      ui.section = parsed.sections.length - 1;
      ui.entry = 0;
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-addsec-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 删除确认弹窗 ----
  function _showDeleteConfirm(containerEl) {
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry) return;
    var old = document.getElementById('ce-del-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-del-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.deleteConfirmTitle')) + '</h3>' +
      '<p class="cv-modal-desc">' + _escHtml(_t('craftengine.deleteConfirmMsg', { key: entry.key })) + '</p>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-del-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-danger" id="ce-del-confirm">' + _escHtml(_t('craftengine.confirmDelete')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    document.getElementById('ce-del-confirm').addEventListener('click', function () {
      section.entries.splice(ui.entry, 1);
      _sfMarkDirty(parsed);
      if (ui.entry >= section.entries.length) ui.entry = Math.max(0, section.entries.length - 1);
      modal.remove();
      _ceRenderFn();
    });
    document.getElementById('ce-del-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 新建事件弹窗 (root: path='events'; 内联块 widget: path='behavior.block.events' + uid 局部重渲染) ----
  function _showAddEventModal(containerEl, path, uid) {
    path = path || 'events';
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry) return;
    var old = document.getElementById('ce-ev-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-ev-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.newEventTitle')) + '</h3>' +
      '<div class="cv-modal-field"><label>' + _escHtml(_t('craftengine.eventsTrigger')) + '</label>' +
      '<input id="ce-ev-name" class="cv-input" placeholder="right_click" spellcheck="false">' +
      '<div class="ce-field-hint">' + _escHtml(_t('craftengine.newEventHint')) + '</div></div>' +
      '<div class="cv-modal-field" id="ce-ev-err" style="display:none;color:var(--color-error);font-size:12px;"></div>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-ev-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-primary" id="ce-ev-confirm">' + _escHtml(_t('craftengine.confirmAdd')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var errEl = document.getElementById('ce-ev-err');
    function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
    document.getElementById('ce-ev-confirm').addEventListener('click', function () {
      var name = document.getElementById('ce-ev-name').value.trim();
      if (!name) { showErr(_t('craftengine.eventsTriggerRequired')); return; }
      var evs = _getNested(entry.data, path);
      if (!evs || typeof evs !== 'object') {
        evs = [];
        _applyValue(entry, path, evs, parsed, section);
      }
      var triggers = name.split(/[\s,]+/).filter(function (t) { return t !== ''; });
      var onVal = triggers.length > 1 ? triggers : triggers[0];
      var evKey;
      if (Array.isArray(evs)) {
        for (var i = 0; i < evs.length; i++) {
          var e2 = evs[i];
          if (e2 && typeof e2 === 'object' && (Array.isArray(e2.on) ? e2.on.join(' ') : String(e2.on)) === (Array.isArray(onVal) ? onVal.join(' ') : onVal)) {
            showErr(_t('craftengine.eventExists', { name: name })); return;
          }
        }
        evs.push({ on: onVal, functions: [] });
        evKey = String(evs.length - 1);
      } else {
        if (evs[name] !== undefined) { showErr(_t('craftengine.eventExists', { name: name })); return; }
        evs[name] = [];
        evKey = name;
      }
      _sfMarkDirty(parsed);
      modal.remove();
      if (uid) {
        var rec = (containerEl._ceUi._sfUidMap || _sfUidMap)[uid];
        if (rec) rec.evKey = evKey;
        _sfRerender(uid, containerEl);
      } else {
        ui.evKey = evKey;
        ui.formTab = 'events';
        _ceRenderFn();
      }
    });
    document.getElementById('ce-ev-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ---- 删除事件确认 ----
  function _showEventDeleteConfirm(containerEl, evKey, path, uid) {
    path = path || 'events';
    var parsed = containerEl._ceParsed;
    var ui = containerEl._ceUi;
    var section = parsed.sections[ui.section];
    var entry = section && section.entries[ui.entry];
    if (!entry || evKey === null) return;
    var old = document.getElementById('ce-evd-modal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'ce-evd-modal';
    modal.className = 'cv-modal';
    modal.innerHTML =
      '<div class="cv-modal-content ce-modal-content">' +
      '<h3>' + _escHtml(_t('craftengine.deleteConfirmTitle')) + '</h3>' +
      '<p class="cv-modal-desc">' + _escHtml(_t('craftengine.eventDeleteMsg', { name: evKey })) + '</p>' +
      '<div class="cv-modal-actions">' +
      '<button class="cv-btn cv-btn-secondary" id="ce-evd-cancel">' + _escHtml(_t('common.close')) + '</button>' +
      '<button class="cv-btn cv-btn-danger" id="ce-evd-confirm">' + _escHtml(_t('craftengine.confirmDelete')) + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    document.getElementById('ce-evd-confirm').addEventListener('click', function () {
      var evs = _getNested(entry.data, path);
      if (Array.isArray(evs)) {
        var i = parseInt(evKey, 10);
        if (!isNaN(i) && i >= 0 && i < evs.length) evs.splice(i, 1);
      } else if (evs && typeof evs === 'object') {
        delete evs[evKey];
      }
      _sfMarkDirty(parsed);
      modal.remove();
      if (uid) {
        var rec = (containerEl._ceUi._sfUidMap || _sfUidMap)[uid];
        if (rec) rec.evKey = null;
        _sfRerender(uid, containerEl);
      } else {
        ui.evKey = null;
        _ceRenderFn();
      }
    });
    document.getElementById('ce-evd-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === this) modal.remove(); });
  }

  // ============ 主入口 ============
  function render(filePath, content, containerEl, opts) {
    opts = opts || {};
    if (containerEl._ceClickHandler) {
      containerEl.removeEventListener('click', containerEl._ceClickHandler);
      containerEl.removeEventListener('change', containerEl._ceChangeHandler);
      containerEl.removeEventListener('change', containerEl._ceKeyChangeHandler);
      containerEl.removeEventListener('change', containerEl._ceAutoSyncHandler);
      containerEl.removeEventListener('input', containerEl._ceYamlHlHandler);
      containerEl.removeEventListener('scroll', containerEl._ceYamlScrollHandler, true);
      containerEl._ceClickHandler = null;
      containerEl._ceChangeHandler = null;
      containerEl._ceKeyChangeHandler = null;
      containerEl._ceAutoSyncHandler = null;
      containerEl._ceYamlHlHandler = null;
      containerEl._ceYamlScrollHandler = null;
      _ceElemCleanup();
    }
    var parsed = parse(content);
    var fname2 = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
    if (_looksLikeCeConfig(fname2, content)) {
      parsed._isConfig = true;
      _projectConfigSections(parsed);
    }
    if (typeof CEMCAssets !== 'undefined' && CEMCAssets) {
      try { CEMCAssets.setActiveFile(filePath); } catch (e) { /* 资源索引非核心功能 */ }
    }
    parsed._visualDirty = false;
    _sfLastParsed = parsed;
    containerEl._ceParsed = parsed;
    containerEl._ceFilePath = filePath;
    _ceElemScan(filePath);
    if (!containerEl._ceUi) containerEl._ceUi = { section: 0, entry: 0 };
    containerEl._ceRenderFn = function () { _renderFromParsed(containerEl); };
    _bindEvents(containerEl);
    _sfUnbindHintIcons();
    _sfBindHintIcons();
    _renderFromParsed(containerEl);
    return parsed;
  }

  // ============ 公共 API ============
  ROOT.CraftEngineInterpreter = {
    TYPES: ['craftengine'],
    SECTION_KEYS: SECTION_KEYS,
    detectFileType: detectFileType,
    resolveProjectRoot: resolveProjectRoot,
    detectProjectTypes: detectProjectTypes,
    parse: parse,
    render: render,
    generateYAML: generateYAML,
    syncToSource: syncToSource,
    // 诊断: 对已解析模型跑检查 (宿主源码模式/问题面板使用)
    validate: function (parsed, ctx) {
      if (typeof CEDiagnostics === 'undefined') return [];
      try { return CEDiagnostics.analyze(parsed, ctx || {}) || []; } catch (e) { return []; }
    },
    // 当前可视化编辑容器的上下文读取 (预览/诊断用)
    currentEntry: function (containerEl) {
      if (!containerEl || !containerEl._ceParsed || !containerEl._ceUi) return null;
      var p = containerEl._ceParsed, u = containerEl._ceUi;
      var sec = p.sections[u.section];
      var en = sec && sec.entries[u.entry];
      if (!sec || !en) return null;
      return { file: containerEl._ceFilePath, section: sec.key, sectionBase: sec.base, entryKey: en.key, data: en.data };
    },
    // 取 datalist 数据源 (设置页/调试用)
    datalistNames: function () {
      _sfInit();
      return Object.keys(_sfDatalistMap || {}).sort();
    },
    datalistSize: function (name) {
      _sfInit();
      return (_sfDatalistMap && _sfDatalistMap[name]) ? _sfDatalistMap[name].length : 0;
    },
    // 资源索引就绪后手动触发补全数据刷新
    refreshAssetLists: function () { _ceAssetsBind(); },
  };
  ROOT._ceElem = {
    scan: _ceElemScan,
    rescan: _ceElemRescan,
    get: _ceElemGet,
    configDir: _ceElemConfigDir,
    enabled: _ceElemEnabled,
    onDone: _ceElemOnDone,
    fileKeys: _ceElemFileKeys,
  };
})();
