// ============================================
// Kether 可视化编辑器 (Scratch 风格积木块)
// ============================================
(function () {
  'use strict';

  // ============================================
  // 常量定义
  // ============================================
  const DEFAULT_PROVIDERS = ['Kether', 'TabooLib', 'Chemdah', 'Adyeshach', '内置'];

  const CAT_COLORS = {
    '实体操作': '#c06262', '数据与变量': '#5edf85', '文本与运算': '#437a32',
    '游戏机制': '#1566d1', '系统管理': '#ee4d4d', '逻辑判断': '#55939e',
    '世界与坐标': '#8ad195', '物品管理': '#ad9a69', '脚本控制': '#d115a8',
    '界面与显示': '#3e5255', '时间与日期': '#1a182c', '基本': '#6b7475'
  };

  const DEFAULT_CAT_COLOR = '#7f8c8d';

  var SLOT_HELP = '点击或者拖拽到此处以添加动作<br>CTRL+点击 快速添加文本<br>SHIFT+点击 快速添加动作组<br>CTRL+SHIFT+点击 快速添加列表';

  // 原始分类 → 合并后的大类
  const CAT_GROUP = {
    实体控制: '实体操作', 数据处理: '数据与变量', 变量操作: '数据与变量',
    文本处理: '文本与运算', 数学运算: '文本与运算', 正则表达式: '文本与运算',
    游戏系统: '游戏机制', 经济: '游戏机制', 游戏机制: '游戏机制',
    药水效果: '游戏机制', 网络信息: '游戏机制',
    系统配置: '系统管理', 服务器管理: '系统管理',
    逻辑与数学: '逻辑判断',
    世界与坐标: '世界与坐标', 物品管理: '物品管理',
    脚本控制: '脚本控制', 脚本操作: '脚本控制', 命令执行: '脚本控制',
    权限操作: '脚本控制', 事件处理: '脚本控制', 函数操作: '脚本控制',
    界面交互: '界面与显示', 消息显示: '界面与显示', 视觉特效: '界面与显示',
    模型处理: '界面与显示', 音效操作: '界面与显示',
    时间与日期: '时间与日期',
  };

  // 模块颜色增强（部分模块颜色过暗/过淡）
  const COLOR_ENHANCE = {
    Invero: '#1a8a8a', Zaphkiel: '#a0a0a0',
  };

  // 动作名称中文化
  const NAME_CN = {
    check: '检查', tell: '发送消息', print: '输出', give: '给予', take: '取出',
    set: '设置', delete: '删除', remove: '移除', create: '创建', spawn: '生成',
    kill: '杀死', damage: '伤害', heal: '治疗', teleport: '传送', play: '播放',
    stop: '停止', wait: '等待', loop: '循环', break: '中断', return: '返回',
    random: '随机数', math: '数学计算', format: '格式化', eval: '表达式计算',
    papi: '变量解析', placeholderapi: '变量解析', command: '执行命令', permission: '权限检测',
    hasPermission: '权限判断', has: '拥有判断', item: '物品操作', inventory: '背包操作',
    open: '打开', close: '关闭', click: '点击事件', sound: '音效',
    particle: '粒子效果', title: '标题显示', actionbar: '操作栏', bossbar: 'Boss血条',
    json: 'JSON操作', yaml: 'YAML操作', http: '网络请求',
    if_else: '如果/判断', all: '全部条件', any: '任一条件',
    while: '循环执行', repeat: '重复执行', foreach: '遍历循环', for: '遍历循环',
    __true__: '真', __false__: '假',
  };

  // 参数标签中文化
  const PARAM_LABEL_CN = {
    symbol: '符号', action: '动作', int: '整数', double: '小数',
    number: '数字', string: '文本', token: '参数', player: '玩家',
    item: '物品', location: '坐标', world: '世界', time: '时间',
    message: '消息', permission: '权限', list: '列表',
  };

  function blockLabelHtml(block, semanticOverride) {
    const cn = semanticOverride || NAME_CN[block.actionId];
    const nameMode = (_state && _state.settings) ? _state.settings.nameMode : 'cn-en';
    if (nameMode === 'cn') {
      return '<span class="ke-b-label">' + esc(cn || block.name) + '</span>';
    }
    if (nameMode === 'en') {
      return '<span class="ke-b-label">' + esc(block.name) + '</span>';
    }
    // 'cn-en' (default)
    if (cn) {
      return '<span class="ke-b-label">' + esc(cn) + '</span><span class="ke-b-label-sub">' + esc(block.name) + '</span>';
    }
    return '<span class="ke-b-label">' + esc(block.name) + '</span>';
  }

  // 显式定义控制流语句的参数结构
  const CONTROL_PARAMS = {
    if_else: [
      { type: 'action', label: '条件', key: 'condition' },
      { type: 'body-then', label: '执行', key: 'thenBody' },
      { type: 'body-else', label: '否则', key: 'elseBody', optional: true },
    ],
    all: [
      { type: 'action-list', label: '条件列表', key: 'conditions' },
    ],
    any: [
      { type: 'action-list', label: '条件列表', key: 'conditions' },
    ],
    while: [
      { type: 'action', label: '条件', key: 'condition' },
      { type: 'body', label: '执行', key: 'body' },
    ],
    repeat: [
      { type: 'text', label: '次数', key: 'count' },
      { type: 'body', label: '执行', key: 'body' },
    ],
    foreach: [
      { type: 'text', label: '变量', key: 'varName' },
      { type: 'action', label: '列表', key: 'list' },
      { type: 'body', label: '执行', key: 'body' },
    ],
    'case & when': [
      { type: 'action', label: '条件', key: 'condition' },
    ],
  };

  // 数据
  let _actions = [];
  let _modules = [];
  let _categorizedActions = {};
  let _categoryList = [];
  let _state = null;
  let _clipboard = null;
  let _keMouseX = 0, _keMouseY = 0;
  let _savedBlocks = []; // { name, code }
  let _stashBlocks = [];
  let _commonBlocks = []; // 常用积木（来自文件 + 用户自定义）
  let _userCommonBlocks = []; // 用户自定义常用积木（localStorage）
  let _COMMON_CAT = '⭐ 常用';
  let _undoStack = [];
  let _redoStack = [];
  let _undoDuringRedo = false;
  const _MAX_UNDO = 50;

  function _pushUndo(state) {
    if (_undoDuringRedo) return;
    _undoStack.push(JSON.parse(JSON.stringify(state.blocks)));
    if (_undoStack.length > _MAX_UNDO) _undoStack.shift();
    _redoStack = [];
    _updateUndoButtons();
  }

  function _undo(state, overlay) {
    if (_undoStack.length === 0) return;
    _redoStack.push(JSON.parse(JSON.stringify(state.blocks)));
    state.blocks = JSON.parse(JSON.stringify(_undoStack.pop()));
    state.mode = 'visual';
    _undoDuringRedo = true;
    switchMode(overlay, state);
    updatePreview(overlay, state);
    _undoDuringRedo = false;
    _updateUndoButtons();
  }

  function _redo(state, overlay) {
    if (_redoStack.length === 0) return;
    _undoStack.push(JSON.parse(JSON.stringify(state.blocks)));
    state.blocks = JSON.parse(JSON.stringify(_redoStack.pop()));
    state.mode = 'visual';
    _undoDuringRedo = true;
    switchMode(overlay, state);
    updatePreview(overlay, state);
    _undoDuringRedo = false;
    _updateUndoButtons();
  }

  function _updateUndoButtons() {
    const ub = document.getElementById('ke-undo');
    const rb = document.getElementById('ke-redo');
    if (ub) ub.disabled = _undoStack.length === 0;
    if (rb) rb.disabled = _redoStack.length === 0;
  }

  // ============================================
  // localStorage 持久化
  // ============================================
  function loadPersistentData() {
    try {
      const s = localStorage.getItem('kether_editor_settings');
      if (s) _savedSettings = JSON.parse(s);
      // 加载编辑器主配置（分类颜色、字体等）
      const cfg = localStorage.getItem('editorConfig');
      if (cfg) {
        const config = JSON.parse(cfg);
        if (config.categoryColors) {
          Object.assign(CAT_COLORS, config.categoryColors);
        }
        _savedSettings._editorConfig = config;
      }
      const b = localStorage.getItem('kether_saved_blocks');
      if (b) _savedBlocks = JSON.parse(b);
      const st = localStorage.getItem('kether_stash_blocks');
      if (st) _stashBlocks = JSON.parse(st);
      const uc = localStorage.getItem('kether_user_common');
      if (uc) _userCommonBlocks = JSON.parse(uc);
    } catch (e) { /* ignore */ }
  }
  let _savedSettings = {};
  function saveSettings(settings) {
    _savedSettings = settings;
    try { localStorage.setItem('kether_editor_settings', JSON.stringify(settings)); } catch (e) {}
  }
  function saveSavedBlocks() {
    try { localStorage.setItem('kether_saved_blocks', JSON.stringify(_savedBlocks)); } catch (e) {}
  }
  function saveStashBlocks() {
    try { localStorage.setItem('kether_stash_blocks', JSON.stringify(_stashBlocks)); } catch (e) {}
  }
  function saveUserCommonBlocks() {
    try { localStorage.setItem('kether_user_common', JSON.stringify(_userCommonBlocks)); } catch (e) {}
  }

  // ============================================
  // 工具
  // ============================================
  function esc(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function catColor(cat) {
    if (CAT_COLORS[cat]) return CAT_COLORS[cat];
    for (const [k, v] of Object.entries(CAT_COLORS)) {
      if (cat.includes(k)) return v;
    }
    return DEFAULT_CAT_COLOR;
  }
  function modColor(provider) {
    const mod = _modules.find(m => m.name === provider);
    return mod ? mod.color : '#7f8c8d';
  }
  function isDefaultProvider(provider) {
    return DEFAULT_PROVIDERS.includes(provider);
  }
  function textColorForBg(hexColor) {
    const c = hexColor.replace('#', '');
    if (c.length < 6) return '#fff';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    // 相对亮度公式 (ITU-R BT.709)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 140 ? '#000' : '#fff';
  }
  function getBlockColor(block) {
    if (_state && _state.settings && _state.settings.colorMode === 'category') {
      let cat;
      if (block._preferredCat) {
        cat = block._preferredCat;
      } else {
        const cats = block.categories;
        if (cats && cats.length > 0) {
          cat = CAT_GROUP[cats[0]] || cats[0];
        }
      }
      if (cat) return catColor(cat);
    }
    return block.color;
  }
  function actionColor(act, preferredCat) {
    if (_state && _state.settings && _state.settings.colorMode === 'category') {
      let cat;
      if (preferredCat) {
        cat = preferredCat;
      } else {
        const cats = act.categories;
        if (cats && cats.length > 0) {
          cat = CAT_GROUP[cats[0]] || cats[0];
        }
      }
      if (cat) return catColor(cat);
    }
    return act._providerColor;
  }

  function resetBlockIds(b) {
    b.id = uid();
    (b.thenBlocks || []).forEach(resetBlockIds);
    (b.elseBlocks || []).forEach(resetBlockIds);
    (b.condBlocks || []).forEach(resetBlockIds);
    if (b._actSlots) {
      for (const k of Object.keys(b._actSlots)) {
        b._actSlots[k].forEach(resetBlockIds);
      }
    }
  }
  function cloneBlock(block) {
    return JSON.parse(JSON.stringify(block));
  }

  // ============================================
  // 加载动作定义
  // ============================================
  async function loadActions() {
    if (_actions.length > 0) return;
    try {
      const resp = await fetch('desc/kether-actions.json');
      _modules = await resp.json();
      const all = [];
      const catMap = {};
      for (const mod of _modules) {
        mod.color = COLOR_ENHANCE[mod.name] || mod.color;
        for (const act of mod.actions) {
          // Expand syntaxs into individual action entries
          if (act.syntaxs) {
            for (const [key, variant] of Object.entries(act.syntaxs)) {
              const entry = Object.assign({}, act);
              entry.id = act.id + '_' + key;
              entry.name = act.name + ' (' + key + ')';
              entry.syntax = variant.syntax;
              entry.example = variant.example || act.example;
              entry.semantic = variant.semantic || act.semantic;
              entry.syntaxs = undefined;
              entry._providerColor = mod.color;
              entry._module = mod.name;
              entry._variantOf = act.id;
              all.push(entry);
              const seen = new Set();
              for (const cat of entry.categories) {
                const group = CAT_GROUP[cat] || cat;
                if (seen.has(group)) continue;
                seen.add(group);
                if (!catMap[group]) catMap[group] = [];
                catMap[group].push(entry);
              }
            }
          } else {
            act._providerColor = mod.color;
            act._module = mod.name;
            all.push(act);
            const seen = new Set();
            for (const cat of act.categories) {
              const group = CAT_GROUP[cat] || cat;
              if (seen.has(group)) continue;
              seen.add(group);
              if (!catMap[group]) catMap[group] = [];
              catMap[group].push(act);
            }
          }
        }
      }
      _actions = all;
      // 注入内置积木块
      for (const def of _BUILTIN_DEFS) {
        def._module = '内置';
        _actions.push(def);
        for (const cat of def.categories) {
          if (!catMap[cat]) catMap[cat] = [];
          catMap[cat].push(def);
        }
      }
      const order = Object.keys(CAT_COLORS);
      _categoryList = Object.keys(catMap).sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });
      _categorizedActions = catMap;
    } catch (e) {
      console.error('[KE] Failed to load actions:', e);
    }
  }

  async function loadCommonBlocks() {
    try {
      const resp = await fetch('desc/common-kether.json');
      const data = await resp.json();
      _commonBlocks = [];
      for (const [id, entry] of Object.entries(data)) {
        _commonBlocks.push({ id: id, isUser: false, ...entry });
      }
    } catch (e) { console.warn('[KE] 无法加载常用积木文件:', e); }
    // 合并用户自定义
    for (const ub of _userCommonBlocks) {
      if (!_commonBlocks.find(function(b) { return b.id === ub.id; })) {
        _commonBlocks.push(ub);
      }
    }
  }

  function resolveCommonSyntax(syntax, params, values) {
    var result = syntax;
    for (var key in params) {
      var val = values[key];
      if (val != null) {
        result = result.split('%' + key + '%').join(val);
      }
    }
    return result;
  }

  function addUserCommonBlock(name, syntax) {
    var id = 'user_' + Date.now().toString(36);
    _userCommonBlocks.push({ id: id, name: name, isUser: true, desc: '', syntax: syntax, params: {} });
    saveUserCommonBlocks();
    // 合并到 _commonBlocks
    if (!_commonBlocks.find(function(b) { return b.id === id; })) {
      _commonBlocks.push(_userCommonBlocks[_userCommonBlocks.length - 1]);
    }
  }

  function removeUserCommonBlock(id) {
    _userCommonBlocks = _userCommonBlocks.filter(function(b) { return b.id !== id; });
    _commonBlocks = _commonBlocks.filter(function(b) { return b.id !== id; });
    saveUserCommonBlocks();
  }

  // ============================================
  // 块数据模型
  // ============================================
  function uid() {
    var _keUidCounter = window._keUidCounter || 0;
    _keUidCounter++;
    window._keUidCounter = _keUidCounter;
    return Date.now().toString(36) + '_' + (_keUidCounter).toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function createBlock(action) {
    const b = {
      id: uid(),
      actionId: action.id,
      name: action.name,
      provider: action.provider,
      module: action._module,
      color: action._providerColor || modColor(action.provider),
      categories: action.categories,
      isControl: !!CONTROL_PARAMS[action.id],
      params: [],
      values: {},
      children: [],
      thenBlocks: [],
      elseBlocks: [],
      condBlocks: [],   // for all/any
      customCode: null,
      _actionLiterals: {},
      _actSlots: {},
      _actionQuoted: {},
    };

    // 使用显式控制流参数或从语法解析
    if (CONTROL_PARAMS[action.id]) {
      b.params = CONTROL_PARAMS[action.id];
    } else {
      b.params = parseSyntax(action.syntax);
    }

    // case & when 初始化 when 分支
    if (action.id === 'case & when') {
      b._whenBranches = [
        { id: uid(), condition: '', condBlocks: [], blocks: [] },
      ];
    }

    // 初始化值
    for (const p of b.params) {
      if (p.type === 'action' || p.type === 'body' || p.type === 'body-then' || p.type === 'body-else' || p.type === 'action-list') continue;
      b.values[p.key || p.label] = '';
    }

    return b;
  }

  function createCustomBlock(code) {
    return {
      id: uid(),
      actionId: '__custom__',
      name: '自定义',
      provider: '', module: '', color: '#ffd600',
      categories: [], params: [], values: { code: code || '' },
      isControl: false,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
      customCode: code || '',
    };
  }

  // ============================================
  // 值积木块（文本、无引号、列表）
  // ============================================
  function createTextBlock(value) {
    return {
      id: uid(),
      actionId: '__text__',
      name: '文本值',
      provider: '内置', module: '', color: '#bdbdbd',
      categories: ['_值'], params: [], values: { text: value || '' },
      isControl: false, isValueBlock: true,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {}, _quoted: true,
    };
  }

  function createUnquotedBlock(value) {
    return {
      id: uid(),
      actionId: '__unquoted__',
      name: '无引号值',
      provider: '内置', module: '', color: '#bdbdbd',
      categories: ['_值'], params: [], values: { text: value || '' },
      isControl: false, isValueBlock: true,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
    };
  }

  function createListBlock() {
    return {
      id: uid(),
      actionId: '__list__',
      name: '列表',
      provider: '内置', module: '', color: '#888888',
      categories: ['基本'], params: [], values: { separator: ' ' },
      isControl: false, isValueBlock: true,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
    };
  }

  function createBraceBlock() {
    return {
      id: uid(),
      actionId: '__brace__',
      name: '动作组',
      provider: '内置', module: '', color: '#555555',
      categories: ['基本'], params: [], values: {},
      isControl: false,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
    };
  }

  function createTrueBlock() {
    return {
      id: uid(),
      actionId: '__true__',
      name: 'true',
      provider: '内置', module: '', color: '#6b7475',
      categories: ['基本'], params: [], values: {},
      isControl: false, isValueBlock: true,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
    };
  }

  function createFalseBlock() {
    return {
      id: uid(),
      actionId: '__false__',
      name: 'false',
      provider: '内置', module: '', color: '#6b7475',
      categories: ['基本'], params: [], values: {},
      isControl: false, isValueBlock: true,
      children: [], thenBlocks: [], elseBlocks: [], condBlocks: [],
      _actSlots: {}, _actionQuoted: {},
    };
  }

  // 内置积木块定义（文本值、数值、列表、动作组）
  const _BUILTIN_DEFS = [
    { id: '__text__', name: '文本值', syntax: '"text"', provider: '内置', _providerColor: '#bdbdbd', color: '#bdbdbd', categories: ['基本'] },
    { id: '__true__', name: 'true', syntax: 'true', provider: '内置', _providerColor: '#6b7475', color: '#6b7475', categories: ['基本'] },
    { id: '__false__', name: 'false', syntax: 'false', provider: '内置', _providerColor: '#6b7475', color: '#6b7475', categories: ['基本'] },
    { id: '__list__', name: '列表', syntax: '[items]', provider: '内置', _providerColor: '#888888', color: '#888888', categories: ['基本'] },
    { id: '__brace__', name: '动作组', syntax: '{actions}', provider: '内置', _providerColor: '#555555', color: '#555555', categories: ['基本'] },
  ];

  function createEntryBlock(type, name) {
    return {
      id: uid(),
      actionId: '__entry__',
      isEntry: true,
      entryType: type || 'normal',
      defName: name || 'main',
      thenBlocks: [],
      elseBlocks: [],
      condBlocks: [],
      _actSlots: {},
    };
  }

  function expandName(name) {
    // "color[ed]" → ["color", "colored"]
    const m = name.match(/^(\w+)\[(\w+)\]$/);
    if (m) return [m[1], m[1] + m[2]];
    return [name];
  }

  /** Expand syntax first token to possible names: (javascript|js|$) → ["javascript","js","$"] */
  function expandSyntaxFirst(syntax) {
    if (!syntax) return [];
    const raw = syntax.trim().split(/\s+/)[0];
    if (!raw) return [];
    const altMatch = raw.match(/^\((.+)\)$/);
    if (altMatch) return altMatch[1].split('|').map(s => s.trim().toLowerCase());
    return expandName(raw.toLowerCase());
  }

  // 分割语法中的 | 替代项，仅在括号外分割
  function splitSyntaxFirst(syntax) {
    if (!syntax) return '';
    let depth = 0;
    for (let i = 0; i < syntax.length; i++) {
      const ch = syntax[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if ((ch === '|' || ch === '\n' || ch === '\r') && depth === 0) {
        return syntax.substring(0, i).trim();
      }
    }
    return syntax.trim();
  }

  // ============================================
  // 语法解析（通用动作参数）
  // ============================================
  function parseSyntax(syntax) {
    if (!syntax) return [];
    const first = splitSyntaxFirst(syntax);
    const rawTokens = first.split(/\s+/);
    // 去除动作名中的 [别名] 后缀：color[ed] → color, hour[s] → hour
    if (rawTokens[0]) rawTokens[0] = rawTokens[0].replace(/\[\w+\]$/, '');
    // 合并被空格拆分的花括号参数：{action list} → {action list}
    // 仅合并纯 {word ... word} 形式，排除 ( ) 后缀干扰
    const mergedTokens = [];
    for (let ri = 0; ri < rawTokens.length; ri++) {
      const t = rawTokens[ri];
      const next = rawTokens[ri + 1];
      if (t.startsWith('{') && !t.endsWith('}') && !t.includes(')') && next && next.endsWith('}') && !next.startsWith('{') && !next.includes(')')) {
        mergedTokens.push(t + ' ' + next);
        ri++;
      } else {
        mergedTokens.push(t);
      }
    }
    // 去除可选组标记 [ ]，保留内部内容
    const tokens = [];
    for (const t of mergedTokens) {
      let s = t;
      if (s.startsWith('[')) s = s.slice(1);
      else if (s.startsWith('\\[')) s = s.slice(2);
      if (s.endsWith(']')) s = s.slice(0, -1);
      else if (s.endsWith('\\]')) s = s.slice(0, -2);
      if (s) tokens.push(s);
    }
    const params = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith('(') && t.endsWith(')')) {
        params.push({ type: 'select', label: '', key: i.toString(), options: t.slice(1, -1).split('|').map(s => s.trim()) });
      } else if (t === '{action}') {
        params.push({ type: 'action', label: '', key: 'action' + i });
      } else if (t === '{action' || t.startsWith('{action')) {
        const rest = t.slice(8, -1);
        params.push({ type: 'action', label: rest || '', key: 'action' + i });
      } else if (t === '{aciton}') {
        // 兼容 typo：{aciton} → 视为 {action}
        params.push({ type: 'action', label: '', key: 'action' + i });
      } else if (t === '{aciton' || t.startsWith('{aciton')) {
        const rest = t.slice(8, -1);
        params.push({ type: 'action', label: rest || '', key: 'action' + i });
      } else if (t.startsWith('<') && t.endsWith('>')) {
        // 兼容 Invero 的 <param> 语法
        const inner = t.slice(1, -1);
        params.push({ type: 'text', label: inner, key: 'param' + i });
      } else if (t.startsWith('{') && t.endsWith('}')) {
        const inner = t.slice(1, -1);
        if (inner === 'int' || inner === 'double' || inner === 'number') {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        } else if (inner === 'token' || inner === 'string') {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        } else if (inner.includes('list')) {
          params.push({ type: 'text', label: inner, key: 'list' + i });
        } else {
          params.push({ type: 'text', label: inner, key: 'param' + i });
        }
      } else if (t.startsWith('{') && !t.endsWith('}')) {
        // {token}) 之类的拆分 token，剥离后缀非字母字符
        var clean = t.slice(1);
        while (clean.length > 0 && !/[\w一-鿿]/.test(clean[clean.length - 1])) {
          clean = clean.slice(0, -1);
        }
        params.push({ type: 'text', label: clean || t.slice(1), key: 'param' + i });
      } else if (t.startsWith('(') && !t.endsWith(')') && t.length > 1) {
        // 处理以 ( 开头的混合 token，如 (to、(by、(percent|bar
        // 提取内部内容创建 select 或 keyword
        const inner = t.slice(1);
        if (inner.includes('|')) {
          params.push({ type: 'select', label: '', key: i.toString(), options: inner.split('|').map(s => s.trim()) });
        } else {
          params.push({ type: 'keyword', label: inner, key: inner, value: inner });
        }
      } else if ((t.endsWith(')') || t.endsWith('}>')) && t.length > 1 && (t.startsWith('<') || t.startsWith('{'))) {
        // 处理以 ) 或 }> 结尾的混合 token，如 <slot)>、{token})
        // 剥离后缀字符
        var clean = t;
        while (clean.length > 1 && (clean.endsWith(')') || clean.endsWith('>') || clean.endsWith('}'))) {
          clean = clean.slice(0, -1);
        }
        if (clean.startsWith('<') && clean.endsWith('>')) {
          params.push({ type: 'text', label: clean.slice(1, -1), key: 'param' + i });
        } else if (clean.startsWith('{') && clean.endsWith('}')) {
          params.push({ type: 'text', label: clean.slice(1, -1), key: 'param' + i });
        } else if (clean.startsWith('<')) {
          params.push({ type: 'text', label: clean.slice(1), key: 'param' + i });
        } else if (clean.startsWith('{')) {
          params.push({ type: 'text', label: clean.slice(1), key: 'param' + i });
        } else {
          params.push({ type: 'keyword', label: t, key: t, value: clean });
        }
      } else if (t.startsWith('&') && t.length > 1) {
        // Aiyatsbus &param → 视为可编辑文本
        params.push({ type: 'text', label: t, key: 'param' + i });
      } else {
        // keyword (e.g., "to", "as", "in", "then", "else")
        params.push({ type: 'keyword', label: t, key: t, value: t });
      }
    }
    if (params.length === 0 && tokens.length === 1 && tokens[0].startsWith('&') && tokens[0].length > 1) {
      // &{token} only: first token is both action name and param
      params.push({ type: 'text', label: 'token', key: 'param1' });
    }
    return params;
  }

  // ============================================
  // 代码生成
  // ============================================
  function generateCode(blocks) {
    return blocks.map(b => blockToCode(b, '')).filter(l => l.trim()).join('\n');
  }

  function blockToCode(block, indent) {
    if (block.actionId === '__entry__') {
      if (block.entryType === 'definition') {
        const body = block.thenBlocks.map(b => blockToCode(b, indent + '  ')).join('\n');
        return indent + 'def ' + (block.defName || 'main') + ' = {\n' + body + '\n' + indent + '}';
      }
      // normal entry: just output children
      return block.thenBlocks.map(b => blockToCode(b, indent)).join('\n');
    }
    if (block.actionId === '__custom__') return indent + (block.values.code || block.customCode || '');
    if (block.actionId === '__text__') {
      const v = block.values.text || '';
      const quoted = block._quoted !== false;
      return indent + (quoted ? '"' + v + '"' : v);
    }
    if (block.actionId === '__true__') return indent + 'true';
    if (block.actionId === '__false__') return indent + 'false';
    if (block.actionId === '__unquoted__') return indent + (block.values.text || '');
    if (block.actionId === '__list__') {
      const items = block.thenBlocks || [];
      if (items.length === 0) return indent + '[ ]';
      const parts = items.map(b => blockToCode(b, '').trim());
      return indent + '[ ' + parts.join(' ') + ' ]';
    }
    if (block.actionId === '__brace__') {
      const items = block.thenBlocks || [];
      if (items.length === 0) return indent + '{ }';
      const parts = items.map(b => blockToCode(b, '').trim());
      if (parts.length === 1) return indent + '{ ' + parts[0] + ' }';
      return indent + '{\n' + parts.map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}';
    }

    const aid = block.actionId;
    if (aid === 'if_else') return genIfElse(block, indent);
    if (aid === 'all' || aid === 'any') return genAllAny(block, indent);
    if (aid === 'while') return genWhile(block, indent);
    if (aid === 'repeat') return genRepeat(block, indent);
    if (aid === 'foreach' || aid === 'for') return genForEach(block, indent);
    if (aid === 'case & when') return genCaseWhen(block, indent);

    // 通用动作
    const action = _actions.find(a => a.id === aid);
    const syn = action ? splitSyntaxFirst(action.syntax) : aid;
    const synTokens = syn.split(/\s+/);
    let actionName = synTokens[0];
    // 处理 (javascript|js|$) 替代语法 → javascript
    const altMatch = actionName && actionName.match(/^\((.+)\)$/);
    if (altMatch) actionName = altMatch[1].split('|')[0].trim();
    // 去除动作名中的 [别名] 后缀：color[ed] → color
    actionName = actionName.replace(/\[\w+\]$/, '');
    const args = [];

    // &{token} 直接输出 &+值
    if (synTokens.length === 1 && synTokens[0].startsWith('&')) {
      const tp = block.params.find(pp => pp.type === 'text');
      const rawVal = block.values[tp ? (tp.key || tp.label) : 'param1'] || '';
      return indent + '&' + (rawVal.includes(' ') ? '"' + rawVal + '"' : rawVal);
    }

    if (CONTROL_PARAMS[aid]) {
      // 如果有控制参数定义但没被上面的特殊处理覆盖
      for (const p of block.params) {
        if (p.type === 'keyword') args.push(p.value);
        else if (p.type === 'select') args.push(block.values[p.key || p.label] || '');
        else if (p.type === 'text') {
          const val = block.values[p.key || p.label] || '';
          if (val) args.push(val.includes(' ') ? '"' + val + '"' : val);
        } else if (p.type === 'action') {
          if (block.thenBlocks.length > 0) {
            args.push('{');
            args.push(block.thenBlocks.map(b => blockToCode(b, '')).join(' '));
            args.push('}');
          }
        }
      }
    } else {
      // 从语法推导
      for (let pi = 0; pi < block.params.length; pi++) {
        const p = block.params[pi];
        if (p.type === 'keyword') {
          // 跳过后接空可选 select 的关键字（如 [as xxx]）
          const nextP = block.params[pi + 1];
          if (nextP && nextP.type === 'select' && !block.values[nextP.key || nextP.label]) continue;
          // 跳过后接空动作的关键字（如 [default {action}]）
          if (nextP && nextP.type === 'action') {
            const k = nextP.key || nextP.label;
            const isEmpty = !(block._actionLiterals && block._actionLiterals[k]) &&
              !(block._actSlots && block._actSlots[k] && block._actSlots[k].length);
            if (isEmpty) continue;
          }
          args.push(p.value); continue;
        }
        if (p.type === 'select') {
          const val = block.values[p.key || p.label] || '';
          if (val) args.push(val);
          continue;
        }
        if (p.type === 'action') {
          const key = p.key || p.label;
          let code;
          // 文字模式
          if (block._actionLiterals && block._actionLiterals[key] !== undefined && block._actionLiterals[key] !== '') {
            code = block._actionLiterals[key];
          } else {
            // 积木模式——从专用动作槽读取
            let children;
            if (block._actSlots && block._actSlots[key]) children = block._actSlots[key];
            else children = block.thenBlocks || [];
            if (children.length > 0) {
              code = children.map(b => blockToCode(b, '')).join(' ');
            }
          }
          if (code !== undefined && code !== '') {
            const quoted = block._actionQuoted && block._actionQuoted[key] === true;
            if (quoted && code.length >= 2 && code[0] === '"' && code[code.length - 1] === '"') {
              args.push('"' + code.slice(1, -1) + '"');
            } else {
              args.push(quoted ? '"' + code + '"' : code);
            }
          }
          continue;
        }
        const val = block.values[p.key || p.label] || '';
        if (val) args.push(val.includes(' ') ? '"' + val + '"' : val);
      }
    }

    const line = [actionName, ...args].join(' ');
    return indent + line;
  }

  function genIfElse(block, indent) {
    const lines = [indent + 'if'];
    // 条件
    const condBlocks = block.thenBlocks; // NOTE: first block goes to thenBlocks as "condition"
    const thenBlocks = block.elseBlocks; // NOTE: this is a mapping trick

    // Actually, let's restructure: condition is in thenBlocks[0] if it's sub-blocks,
    // or in values as expression text.
    // Better: for if/else, use children[0] for condition, children[1] for then, children[2] for else

    // Let me redo this cleanly:
    // - block.condBlocks -> condition sub-blocks
    // - block.thenBlocks -> then body
    // - block.elseBlocks -> else body

    const condTxt = block._actionLiterals && block._actionLiterals['condition'] !== undefined
      ? block._actionLiterals['condition']
      : block.condBlocks.map(b => blockToCode(b, '')).join(' ');
    if (condTxt) {
      if (condTxt.includes(' ')) lines.push('{ ' + condTxt + ' }');
      else lines.push(condTxt);
    }

    const thenTxt = block.thenBlocks.map(b => blockToCode(b, '')).join('\n');
    const elseTxt = block.elseBlocks.map(b => blockToCode(b, '')).join('\n');

    if (thenTxt) {
      if (block.thenBlocks.length === 1 && !block.thenBlocks[0].isControl) {
        lines.push('then ' + blockToCode(block.thenBlocks[0], ''));
      } else {
        lines.push('then {\n' + thenTxt.split('\n').map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}');
      }
    }

    if (elseTxt) {
      if (block.elseBlocks.length === 1 && !block.elseBlocks[0].isControl) {
        lines.push('else ' + blockToCode(block.elseBlocks[0], ''));
      } else {
        lines.push('else {\n' + elseTxt.split('\n').map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}');
      }
    }

    return lines.join(' ');
  }

  function genAllAny(block, indent) {
    const actionName = block.actionId; // "all" or "any"
    const conds = block.condBlocks;
    if (conds.length === 0) return indent + actionName + ' [ ]';
    // 每个条件用 {} 包裹（防止 UNIT 返回值破坏判断）
    const items = conds.map(b => {
      const code = blockToCode(b, '').trim();
      // 如果包含空格或含可能返回 UNIT 的动作，用 {} 包裹
      if (code.includes(' ') || b.isControl) {
        return '{ ' + code + ' }';
      }
      return code;
    });
    return indent + actionName + ' [ ' + items.join(' ') + ' ]';
  }

  function genWhile(block, indent) {
    // block.condBlocks[0] = condition
    const condTxt = block._actionLiterals && block._actionLiterals['condition'] !== undefined
      ? block._actionLiterals['condition']
      : (block.condBlocks.length > 0 ? blockToCode(block.condBlocks[0], '').trim() : '');
    const body = block.thenBlocks;
    const bodyTxt = body.map(b => blockToCode(b, '')).join('\n');
    let line = indent + 'while';
    if (condTxt) line += ' ' + (condTxt.includes(' ') ? '{ ' + condTxt + ' }' : condTxt);
    if (body.length === 1 && !body[0].isControl) {
      line += ' then ' + blockToCode(body[0], '');
    } else if (bodyTxt) {
      line += ' then {\n' + bodyTxt.split('\n').map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}';
    }
    return line;
  }

  function genRepeat(block, indent) {
    const count = block.values.count || '1';
    const body = block.thenBlocks;
    const bodyTxt = body.map(b => blockToCode(b, '')).join('\n');
    let line = indent + 'repeat ' + count;
    if (body.length === 1 && !body[0].isControl) {
      line += ' ' + blockToCode(body[0], '');
    } else if (bodyTxt) {
      line += ' {\n' + bodyTxt.split('\n').map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}';
    }
    return line;
  }

  function genForEach(block, indent) {
    const varName = block.values.varName || 'i';
    const list = block._actionLiterals && block._actionLiterals['list'] !== undefined
      ? block._actionLiterals['list']
      : (block.condBlocks.length > 0 ? blockToCode(block.condBlocks[0], '').trim() : '');
    const body = block.thenBlocks;
    const bodyTxt = body.map(b => blockToCode(b, '')).join('\n');
    let line = indent + 'for ' + varName + ' in';
    if (list) line += ' ' + (list.includes(' ') ? '{ ' + list + ' }' : list);
    if (body.length === 1 && !body[0].isControl) {
      line += ' then ' + blockToCode(body[0], '');
    } else if (bodyTxt) {
      line += ' then {\n' + bodyTxt.split('\n').map(l => indent + '  ' + l).join('\n') + '\n' + indent + '}';
    }
    return line;
  }

  function genCaseWhen(block, indent) {
    // 条件
    const condTxt = block._actionLiterals && block._actionLiterals['condition'] !== undefined
      ? block._actionLiterals['condition']
      : block.condBlocks.map(b => blockToCode(b, '')).join(' ');
    const branches = block._whenBranches || [];
    const elseBlocks = block.elseBlocks || [];
    let line = indent + 'case';
    if (condTxt) line += ' ' + (condTxt.includes(' ') ? '{ ' + condTxt + ' }' : condTxt);
    line += ' [';
    // when 分支
    for (const br of branches) {
      const cond = (br.condBlocks && br.condBlocks.length > 0)
        ? br.condBlocks.map(b => blockToCode(b, '')).join(' ')
        : (br.condition || '');
      const body = br.blocks.map(b => blockToCode(b, '')).join('\n');
      if (!cond && !body) continue;
      const bodyWrapped = body.includes('\n')
        ? '{\n' + body.split('\n').map(l => indent + '    ' + l).join('\n') + '\n' + indent + '  }'
        : body || '""';
      line += '\n' + indent + '  when ' + cond + ' -> ' + bodyWrapped;
    }
    // else 分支
    if (elseBlocks.length > 0) {
      const elseTxt = elseBlocks.map(b => blockToCode(b, '')).join('\n');
      const elseWrapped = elseTxt.includes('\n')
        ? '{\n' + elseTxt.split('\n').map(l => indent + '    ' + l).join('\n') + '\n' + indent + '  }'
        : elseTxt;
      line += '\n' + indent + '  else ' + elseWrapped;
    }
    line += '\n' + indent + ']';
    return line;
  }

  // ============================================
  // 代码解析为块
  // ============================================
  function parseCodeToBlocks(code) {
    if (!code || !code.trim()) return [];
    const blocks = [];
    // 按行解析，支持 {} 跨行
    const lines = splitTopLevel(code);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const b = parseLineToBlock(trimmed);
      if (b) blocks.push(b);
      else { const tb = createTextBlock(trimmed); tb._quoted = false; blocks.push(tb); }
    }
    return blocks;
  }

  function splitTopLevel(code) {
    // 按大括号分组分割
    const result = [];
    let depth = 0;
    let sqDepth = 0;
    let cur = '';
    for (const ch of code) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '[') sqDepth++;
      else if (ch === ']') sqDepth--;
      if (depth === 0 && sqDepth === 0 && ch === '\n') {
        if (cur.trim()) result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) result.push(cur);
    return result;
  }

  function tokenizeLine(line) {
    const tokens = [];
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if (ch === '"' || ch === "'") {
        let s = ''; i++;
        while (i < line.length && line[i] !== ch) {
          if (line[i] === '\\') { s += line[i + 1] || ''; i += 2; } else { s += line[i]; i++; }
        }
        i++;
        tokens.push({ t: 'str', v: s });
        continue;
      }
      if (ch === '{') {
        let depth = 1; let s = ''; i++;
        while (i < line.length && depth > 0) {
          if (line[i] === '{') depth++;
          else if (line[i] === '}') depth--;
          if (depth > 0) s += line[i];
          i++;
        }
        tokens.push({ t: 'block', v: s.trim() });
        continue;
      }
      if (ch === '[') {
        let depth = 1; let s = ''; i++;
        while (i < line.length && depth > 0) {
          if (line[i] === '[') depth++;
          else if (line[i] === ']') depth--;
          if (depth > 0) s += line[i];
          i++;
        }
        tokens.push({ t: 'list', v: s.trim() });
        continue;
      }
      let s = '';
      while (i < line.length && line[i] !== ' ' && line[i] !== '\t' && line[i] !== '{' && line[i] !== '[' && line[i] !== '"' && line[i] !== "'") {
        s += line[i]; i++;
      }
      if (s) tokens.push({ t: 'word', v: s });
    }
    return tokens;
  }

  function parseTokenToBlock(token) {
    // 单个带引号文本 → __text__
    if (token.t === 'str') {
      const tb = createTextBlock(token.v);
      tb._quoted = true;
      return tb;
    }
    // 单个单词 → __text__ 无引号
    if (token.t === 'word') {
      const tb = createTextBlock(token.v);
      tb._quoted = false;
      return tb;
    }
    // 单个列表 [...] → __list__
    if (token.t === 'list') {
      const list = createListBlock();
      const inner = token.v;
      if (inner.trim()) {
        const itemTokens = tokenizeLine(inner);
        list.thenBlocks = itemTokens.map(t => {
          const line = t.t === 'str' ? '"' + t.v + '"'
                    : t.t === 'list' ? '[' + t.v + ']'
                    : t.t === 'block' ? '{' + t.v + '}'
                    : t.v;
          const b = parseLineToBlock(line);
          return b || createTextBlock(line);
        });
      }
      return list;
    }
    // 单个大括号 { } → __brace__
    if (token.t === 'block') {
      const brace = createBraceBlock();
      const inner = token.v;
      if (inner.trim()) {
        brace.thenBlocks = parseCodeToBlocks(inner);
      }
      return brace;
    }
    return null;
  }

  function parseLineToBlock(line) {
    const tokens = tokenizeLine(line);
    if (tokens.length === 0) return null;
    const first = tokens[0].v.toLowerCase();

    // def name = { ... }
    if (first === 'def') return parseDefLine(tokens);

    // if ... then ... else
    if (first === 'if') return parseIfLine(tokens);
    // while
    if (first === 'while') return parseWhileLine(tokens);
    // repeat
    if (first === 'repeat') return parseRepeatLine(tokens);
    // for
    if (first === 'for') return parseForLine(tokens);
    // all [...]
    if (first === 'all' || first === 'any') return parseAllAnyLine(first, tokens);
    // check (重要动作)
    if (first === 'check') return parseCheckLine(tokens);
    // case ... when ... else
    if (first === 'case') return parseCaseLine(tokens);

    // 通用动作查找（支持 color[ed] 别名模式 和 (javascript|js|$) 替代语法）
    const action = findBestAction(tokens);
    if (action) return parseGenericAction(action, tokens);

    // 单词不匹配任何动作 → 作为文本值处理
    if (tokens.length === 1) {
      const tb = parseTokenToBlock(tokens[0]);
      if (tb) return tb;
    }

    return null;
  }

  function parseIfLine(tokens) {
    const block = createBlock(_actions.find(a => a.id === 'if_else'));
    // 提取条件：到 "then" 之前
    const thenIdx = tokens.findIndex(t => t.v === 'then');
    const elseIdx = tokens.findIndex(t => t.v === 'else');
    const condEnd = thenIdx > 0 ? thenIdx : tokens.length;
    const condTokens = tokens.slice(1, condEnd);

    // 条件可以是 { ... } block 或简单表达式
    if (condTokens.length === 1 && condTokens[0].t === 'block') {
      const innerBlocks = parseCodeToBlocks(condTokens[0].v);
      block.condBlocks = innerBlocks;
    } else {
      const condStr = condTokens.map(t => t.t === 'str' ? '"' + t.v + '"' : t.v).join(' ');
      const cb = findOrCreateActionBlock(condStr);
      if (cb && cb.actionId !== '__custom__') {
        block.condBlocks = [cb];
      } else {
        // 当作文字值存储
        if (!block._actionLiterals) block._actionLiterals = {};
        block._actionLiterals['condition'] = condStr;
      }
    }

    // then body
    if (thenIdx > 0) {
      const thenEnd = elseIdx > thenIdx ? elseIdx : tokens.length;
      const bodyTokens = tokens.slice(thenIdx + 1, thenEnd);
      block.thenBlocks = extractBodyBlocks(bodyTokens);
    }

    // else body
    if (elseIdx > 0) {
      const bodyTokens = tokens.slice(elseIdx + 1);
      block.elseBlocks = extractBodyBlocks(bodyTokens);
    }

    return block;
  }

  function parseWhileLine(tokens) {
    const block = createBlock(_actions.find(a => a.id === 'while'));
    const thenIdx = tokens.findIndex(t => t.v === 'then');
    const condEnd = thenIdx > 0 ? thenIdx : tokens.length;
    const condTokens = tokens.slice(1, condEnd);
    if (condTokens.length === 1 && condTokens[0].t === 'block') {
      block.condBlocks = parseCodeToBlocks(condTokens[0].v);
    } else {
      const str = condTokens.map(t => t.t === 'str' ? '"' + t.v + '"' : t.v).join(' ');
      const cb = findOrCreateActionBlock(str);
      if (cb && cb.actionId !== '__custom__') {
        block.condBlocks = [cb];
      } else {
        if (!block._actionLiterals) block._actionLiterals = {};
        block._actionLiterals['condition'] = str;  }
    }
    if (thenIdx > 0) block.thenBlocks = extractBodyBlocks(tokens.slice(thenIdx + 1));
    return block;
  }

  function parseRepeatLine(tokens) {
    const block = createBlock(_actions.find(a => a.id === 'repeat'));
    // repeat {count} [{body}]
    if (tokens.length >= 2) block.values.count = tokens[1].v;
    if (tokens.length >= 3) {
      const bodyTokens = tokens.slice(2);
      block.thenBlocks = extractBodyBlocks(bodyTokens);
    }
    return block;
  }

  function parseForLine(tokens) {
    const block = createBlock(_actions.find(a => a.id === 'foreach'));
    // for {var} in {list} then {body}
    if (tokens.length >= 2) block.values.varName = tokens[1].v;
    const inIdx = tokens.findIndex(t => t.v === 'in');
    const thenIdx = tokens.findIndex(t => t.v === 'then');
    if (inIdx > 0 && thenIdx > inIdx) {
      const listTokens = tokens.slice(inIdx + 1, thenIdx);
      const listStr = listTokens.map(t => t.t === 'str' ? '"' + t.v + '"' : t.v).join(' ');
      const cb = findOrCreateActionBlock(listStr);
      if (cb && cb.actionId !== '__custom__') {
        block.condBlocks = [cb];
      } else {
        if (!block._actionLiterals) block._actionLiterals = {};
        block._actionLiterals['list'] = listStr;
      }
    }
    if (thenIdx > 0) block.thenBlocks = extractBodyBlocks(tokens.slice(thenIdx + 1));
    return block;
  }

  function parseDefLine(tokens) {
    const entry = createEntryBlock('definition');
    if (tokens.length >= 2) entry.defName = tokens[1].v;
    const eqIdx = tokens.findIndex(t => t.v === '=');
    const braceStart = tokens.findIndex(t => t.t === 'block');
    if (braceStart >= 0) {
      entry.thenBlocks = parseCodeToBlocks(tokens[braceStart].v);
    } else {
      const bodyStart = eqIdx >= 0 ? eqIdx + 1 : 2;
      if (bodyStart < tokens.length) {
        entry.thenBlocks = extractBodyBlocks(tokens.slice(bodyStart));
      }
    }
    return entry;
  }

  function parseAllAnyLine(first, tokens) {
    const action = _actions.find(a => a.id === first);
    if (!action) return null;
    const block = createBlock(action);
    // all [ ... ] 或 any [ ... ]
    if (tokens.length >= 2 && tokens[1].t === 'list') {
      const listContent = tokens[1].v;
      // 分割 listContent 中的各个条件（按 {} 或空格分割）
      const parts = splitListItems(listContent);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // 尝试移除外部 {}
        const inner = (trimmed.startsWith('{') && trimmed.endsWith('}'))
          ? trimmed.slice(1, -1).trim() : trimmed;
        const cb = findOrCreateActionBlock(inner);
        if (cb) block.condBlocks.push(cb);
        else { const tb = createTextBlock(inner); tb._quoted = false; block.condBlocks.push(tb); }
      }
    }
    return block;
  }

  function parseCheckLine(tokens) {
    const action = _actions.find(a => a.id === 'check');
    if (!action) return null;
    const block = createBlock(action);
    // check {action} {symbol} {action}
    const CHK_OPS = ['>=', '<=', '!=', '==', '=!', '>', '<', 'in', 'is'];
    const words = tokens.slice(1).map(t => t.t === 'str' ? '"' + t.v + '"' : t.v);
    let opIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (CHK_OPS.includes(words[i])) { opIdx = i; break; }
    }
    if (opIdx > 0) {
      const left = words.slice(0, opIdx).join(' ');
      const op = words[opIdx];
      const right = words.slice(opIdx + 1).join(' ');
      // left operand
      const lb = findOrCreateActionBlock(left);
      if (lb && lb.actionId !== '__custom__') {
        if (!block._actSlots) block._actSlots = {};
        block._actSlots['action1'] = [lb];
      } else {
        if (!block._actionLiterals) block._actionLiterals = {};
        block._actionLiterals['action1'] = left;
      }
      // operator
      block.values['param2'] = op;
      // right operand
      const rb = findOrCreateActionBlock(right);
      if (rb && rb.actionId !== '__custom__') {
        if (!block._actSlots) block._actSlots = {};
        block._actSlots['action3'] = [rb];
      } else {
        if (!block._actionLiterals) block._actionLiterals = {};
        block._actionLiterals['action3'] = right;
      }
    } else {
      // fallback: all to text
      block.values['param2'] = words.join(' ');
    }
    return block;
  }

  function findOrCreateActionBlock(str) {
    const tokens = tokenizeLine(str);
    if (tokens.length === 0) return null;
    const first = tokens[0].v.toLowerCase();
    const action = findBestAction(tokens);
    if (action) return parseGenericAction(action, tokens);
    // 单个 token → 使用共享解析逻辑
    if (tokens.length === 1) {
      const tb = parseTokenToBlock(tokens[0]);
      if (tb) return tb;
    }
    const tb = createTextBlock(str); tb._quoted = false; return tb;
  }

  /** Score how well an action's syntax matches the given tokens.
   *  Higher score = better match. Exact keywords score 2 each,
   *  param slots ({token}, {action}, &var) score 1 each.
   *  First token is assumed to already match (base score 1). */
  function scoreActionSyntax(action, tokens) {
    const rawTokens = splitSyntaxFirst(action.syntax || '').split(/\s+/);
    if (rawTokens.length === 0) return 0;
    if (rawTokens[0]) rawTokens[0] = rawTokens[0].replace(/\[\w+\]$/, '');
    const synTokens = [];
    for (const t of rawTokens) {
      let s = t;
      if (s.startsWith('[') || s.startsWith('\\[')) s = s.replace(/^\\?\[+/, '');
      if (s.endsWith(']') || s.endsWith('\\]')) s = s.replace(/\\?\]+$/, '');
      if (s.startsWith(']') || s.startsWith('\\]')) s = s.replace(/^\\?\]+/, '');
      if (s.endsWith('[') || s.endsWith('\\[')) s = s.replace(/\\?\[+$/, '');
      if (s) synTokens.push(s);
    }
    let score = 1;
    let ti = 1;
    for (let si = 1; si < synTokens.length && ti < tokens.length; si++) {
      const st = synTokens[si];
      if (st.startsWith('(') && st.endsWith(')')) {
        const opts = st.slice(1, -1).split('|').map(s => s.trim());
        if (opts.includes(tokens[ti].v)) { score += 2; ti++; }
        continue;
      }
      if (st.startsWith('{') && st.endsWith('}')) {
        // param slot — always matches, weight 1
        score++;
        ti++;
        continue;
      }
      if (st.startsWith('&')) {
        // Aiyatsbus &var — like text param, weight 1
        score++;
        ti++;
        continue;
      }
      // exact keyword match — higher weight 2
      if (tokens[ti].v === st) { score += 2; ti++; }
    }
    return score;
  }

  /** Find the action in _actions that best matches the token sequence. */
  function findBestAction(tokens) {
    const first = tokens[0].v.toLowerCase();
    const candidates = _actions.filter(a => {
      const names = expandSyntaxFirst(a.syntax);
      if (names.includes(first)) return true;
      // & prefix match: &{token} syntax matches any &xxx input
      if (first.startsWith('&') && names.length === 1 && names[0].startsWith('&')) return true;
      return false;
    });
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0];
    let bestScore = scoreActionSyntax(best, tokens);
    for (let i = 1; i < candidates.length; i++) {
      const s = scoreActionSyntax(candidates[i], tokens);
      if (s > bestScore) { bestScore = s; best = candidates[i]; }
    }
    return best;
  }

  function parseGenericAction(action, tokens) {
    const block = createBlock(action);
    const rawTokens = splitSyntaxFirst(action.syntax || '').split(/\s+/);
    // 去除动作名中的 [别名] 后缀：color[ed] → color
    if (rawTokens[0]) rawTokens[0] = rawTokens[0].replace(/\[\w+\]$/, '');
    // 去除可选组标记 [ ]，与 parseSyntax 保持一致
    const synTokens = [];
    for (const t of rawTokens) {
      let s = t;
      if (s.startsWith('[') || s.startsWith('\\[')) s = s.replace(/^\\?\[+/, '');
      if (s.endsWith(']') || s.endsWith('\\]')) s = s.replace(/\\?\]+$/, '');
      if (s.startsWith(']') || s.startsWith('\\]')) s = s.replace(/^\\?\]+/, '');
      if (s.endsWith('[') || s.endsWith('\\[')) s = s.replace(/\\?\[+$/, '');
      if (s) synTokens.push(s);
    }
    let ti = 1;
    for (let si = 1; si < synTokens.length && ti < tokens.length; si++) {
      const st = synTokens[si];

      if (st.startsWith('(') && st.endsWith(')')) {
        // select - 尝试匹配
        const opt = st.slice(1, -1).split('|').map(s => s.trim());
        if (opt.includes(tokens[ti].v)) {
          const p = block.params.find(pp => pp.type === 'select');
          if (p) block.values[p.key || p.label] = tokens[ti].v;
          ti++;
        }
        continue;
      }

      if (st === '{action}') {
        // 动作参数：仅消费到下一个语法关键字/选择项之前
        let endIdx = tokens.length;
        for (let s2 = si + 1; s2 < synTokens.length; s2++) {
          const nextSt = synTokens[s2];
          if (!nextSt.startsWith('{') && !nextSt.startsWith('(')) {
            // 普通关键字
            const kwIdx = tokens.findIndex((tok, idx) => idx >= ti && tok.v === nextSt);
            if (kwIdx >= ti) { endIdx = kwIdx; break; }
          } else if (nextSt.startsWith('(') && nextSt.endsWith(')')) {
            // 选择项
            const opts = nextSt.slice(1, -1).split('|');
            const optIdx = tokens.findIndex((tok, idx) => idx >= ti && opts.includes(tok.v));
            if (optIdx >= ti) { endIdx = optIdx; break; }
          }
        }
        const actionTokens = tokens.slice(ti, endIdx);
        const remaining = actionTokens.map(t => t.t === 'str' ? '"' + t.v + '"' : t.v).join(' ');
        if (remaining) {
          const actionBlock = findOrCreateActionBlock(remaining);
          if (actionBlock && actionBlock.actionId !== '__custom__') {
            if (!block._actSlots) block._actSlots = {};
            block._actSlots['action' + si] = [actionBlock];
          } else {
            if (!block._actionLiterals) block._actionLiterals = {};
            if (!block._actionQuoted) block._actionQuoted = {};
            const key = 'action' + si;
            // 去掉外层引号再存，引号由 _actionQuoted 控制
            let clean = remaining.trim();
            if (clean.startsWith('"') && clean.endsWith('"') && clean.length >= 2) {
              clean = clean.slice(1, -1);
              block._actionQuoted[key] = true;
            }
            block._actionLiterals[key] = clean;
            // 原始值带引号时自动开启引号
            const trimmed = remaining.trim();
            if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
              block._actionQuoted[key] = true;
            }
          }
        }
        ti = endIdx;
        continue;
      }

      if (st.startsWith('{') && st.endsWith('}')) {
        // 普通参数
        const p = block.params.find(pp => pp.type === 'text' && pp.key === ('param' + si));
        if (p) {
          block.values[p.key] = tokens[ti].v;
        } else {
          // 放进第一个未填充的文本参数
          const tp = block.params.find(pp => pp.type === 'text' && !block.values[pp.key || pp.label]);
          if (tp) block.values[tp.key || tp.label] = tokens[ti].v;
        }
        ti++;
        continue;
      }

      // 关键字
      ti++;
    }
    // &{token} 只有第一个 token（如 &var_name），提取 & 后面的值作为参数
    if (synTokens.length === 1 && synTokens[0].startsWith('&') && tokens.length >= 1) {
      const refVal = tokens[0].v.startsWith('&') ? tokens[0].v.slice(1) : tokens[0].v;
      const tp = block.params.find(pp => pp.type === 'text');
      if (tp) block.values[tp.key || tp.label] = refVal;
      else block.values.param1 = refVal;
    }
    return block;
  }

  function extractBodyBlocks(tokens) {
    // 如果只有一个 block token { ... }，解析其内部
    if (tokens.length === 1 && tokens[0].t === 'block') {
      return parseCodeToBlocks(tokens[0].v);
    }
    // 如果只有一个 word token，当作单行命令
    if (tokens.length === 1 && tokens[0].t === 'word') {
      const b = findOrCreateActionBlock(tokens[0].v);
      if (b) return [b];
      const tb = createTextBlock(tokens[0].v); tb._quoted = false; return [tb];
    }
    // 多个 token - 当作单个表达式
    const str = tokens.map(t => t.t === 'str' ? '"' + t.v + '"' : t.v).join(' ');
    const b = findOrCreateActionBlock(str);
    if (b) return [b];
    const tb = createTextBlock(str); tb._quoted = false; return [tb];
  }

  function parseCaseLine(tokens) {
    // case <condition> [ ...when/else... ]
    const action = _actions.find(a => a.id === 'case & when');
    if (!action) return null;
    const block = createBlock(action);

    // Token 1: condition
    if (tokens.length >= 2) {
      const ct = tokens[1];
      if (ct.t === 'block') {
        block.condBlocks = parseCodeToBlocks(ct.v);
      } else {
        const str = ct.t === 'str' ? '"' + ct.v + '"' : ct.v;
        const cb = findOrCreateActionBlock(str);
        if (cb && cb.actionId !== '__custom__') {
          block.condBlocks = [cb];
        } else {
          block._actionLiterals['condition'] = str;
        }
      }
    }

    // Token 2: [ ... ] list containing when/else branches
    if (tokens.length >= 3 && tokens[2].t === 'list') {
      const content = tokens[2].v;
      // Parse branches from content by scanning for "when" and "else" at depth 0
      const whenBranches = [];
      const branches = parseWhenElseBody(content);
      for (const br of branches) {
        if (br.type === 'when') {
          const condBlocks = [];
          if (br.condition) {
            const cb = findOrCreateActionBlock(br.condition);
            if (cb) condBlocks.push(cb);
          }
          whenBranches.push({ condition: br.condition || '', condBlocks, blocks: br.blocks });
        } else if (br.type === 'else') {
          block.elseBlocks.push(...br.blocks);
        }
      }
      block._whenBranches = whenBranches.length > 0 ? whenBranches : [{ id: uid(), condition: '', condBlocks: [], blocks: [] }];
    } else {
      block._whenBranches = [{ id: uid(), condition: '', condBlocks: [], blocks: [] }];
    }
    return block;
  }

  // Parse the body of a case statement: extract when/else branches at depth 0
  // Supports single-line and multi-line formats
  function parseWhenElseBody(content) {
    const branches = [];
    let i = 0;
    const len = content.length;

    function skipWhitespace() {
      while (i < len && (content[i] === ' ' || content[i] === '\t' || content[i] === '\n' || content[i] === '\r')) i++;
    }

    while (i < len) {
      skipWhitespace();
      if (i >= len) break;

      // Check for "when" or "else" keyword at the current position
      const rest = content.slice(i);
      let isWhen = rest.startsWith('when ');
      let isElse = rest.startsWith('else ');
      if (!isWhen && !isElse) { i++; continue; }

      i += isWhen ? 5 : 5; // skip "when " or "else "
      if (isWhen) {
        // Find the -> separator, respecting { } depth and strings
        let arrowIdx = -1;
        let depth = 0;
        let inStr = false;
        let strChar = '';
        let j = i;
        while (j < len) {
          const ch = content[j];
          if (inStr) {
            if (ch === strChar && content[j - 1] !== '\\') inStr = false;
          } else {
            if (ch === '"' || ch === "'") { inStr = true; strChar = ch; }
            else if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth < 0) break; }
            else if (ch === '-' && content[j + 1] === '>' && depth === 0) {
              arrowIdx = j;
              break;
            }
          }
          j++;
        }

        if (arrowIdx >= 0) {
          const condition = content.slice(i, arrowIdx).trim();
          i = arrowIdx + 2; // skip ->
          let exprStr = content.slice(i).trimStart();

          // Find the end of this branch: next " when " or " else " at depth 0
          let branchEnd = -1;
          let exprDepth = 0;
          let inStr2 = false;
          let strChar2 = '';
          for (let k = i; k < len; k++) {
            const ch = content[k];
            if (inStr2) {
              if (ch === strChar2 && content[k - 1] !== '\\') inStr2 = false;
            } else {
              if (ch === '"' || ch === "'") { inStr2 = true; strChar2 = ch; }
              else if (ch === '{') exprDepth++;
              else if (ch === '}') { exprDepth--; if (exprDepth < 0) break; }
              else if (exprDepth === 0 && (content.startsWith(' when ', k) || content.startsWith(' else ', k))) {
                branchEnd = k;
                break;
              }
            }
          }
          const branchContent = (branchEnd >= 0 ? exprStr.slice(0, branchEnd - i) : exprStr).trim();
          i = branchEnd >= 0 ? branchEnd : len;

          // Parse branch content as expression(s)
          const blockContent = branchContent.startsWith('{') && branchContent.endsWith('}')
            ? branchContent.slice(1, -1).trim()
            : branchContent;
          const exprBlocks = blockContent
            ? parseCodeToBlocks(blockContent)
            : [];
          branches.push({ type: 'when', condition, blocks: exprBlocks });
        } else {
          // No -> found, treat entire rest as condition
          branches.push({ type: 'when', condition: content.slice(i).trim(), blocks: [] });
          i = len;
        }
      } else if (isElse) {
        let exprStr = content.slice(i).trimStart();

        // Find end of else branch (next " when " or " else " at depth 0)
        let branchEnd = -1;
        let exprDepth = 0;
        let inStr2 = false;
        let strChar2 = '';
        for (let k = i; k < len; k++) {
          const ch = content[k];
          if (inStr2) {
            if (ch === strChar2 && content[k - 1] !== '\\') inStr2 = false;
          } else {
            if (ch === '"' || ch === "'") { inStr2 = true; strChar2 = ch; }
            else if (ch === '{') exprDepth++;
            else if (ch === '}') { exprDepth--; if (exprDepth < 0) break; }
            else if (exprDepth === 0 && content.startsWith(' when ', k)) {
              branchEnd = k;
              break;
            }
          }
        }
        const branchContent = (branchEnd >= 0 ? exprStr.slice(0, branchEnd - i) : exprStr).trim();
        i = branchEnd >= 0 ? branchEnd : len;

        const blockContent = branchContent.startsWith('{') && branchContent.endsWith('}')
          ? branchContent.slice(1, -1).trim()
          : branchContent;
        const eBlocks = blockContent
          ? parseCodeToBlocks(blockContent)
          : [];
        branches.push({ type: 'else', blocks: eBlocks });
      }
    }
    return branches;
  }

  function splitListItems(listContent) {
    // 按 {} 分组或按空格分割
    const items = [];
    let i = 0;
    while (i < listContent.length) {
      if (listContent[i] === ' ' || listContent[i] === '\t') { i++; continue; }
      if (listContent[i] === '{') {
        let depth = 0; let s = ''; i++;
        while (i < listContent.length && !(depth === 0 && listContent[i] === '}')) {
          if (listContent[i] === '{') depth++;
          else if (listContent[i] === '}') depth--;
          if (depth >= 0 || listContent[i] !== '}') s += listContent[i];
          i++;
        }
        i++; // skip closing }
        items.push(s.trim());
      } else {
        let s = '';
        while (i < listContent.length && listContent[i] !== ' ' && listContent[i] !== '\t') {
          s += listContent[i]; i++;
        }
        if (s.trim()) items.push(s.trim());
      }
    }
    return items;
  }

  // ============================================
  // UI 渲染
  // ============================================
  function createOverlay() {
    const old = document.getElementById('ke-editor-overlay');
    if (old) old.remove();
    const o = document.createElement('div');
    o.id = 'ke-editor-overlay';
    o.className = 'ke-overlay';
    o.tabIndex = 0;
    return o;
  }

  function applyBackgroundToOverlay(overlay) {
    try {
      const stored = localStorage.getItem('editorConfig');
      if (!stored) return;
      const config = JSON.parse(stored);
      if (!config.background || !config.background.filename) return;
      const bg = config.background;
      const theme = document.body.getAttribute('data-theme') || 'dark';
      const opacity = bg.opacity != null ? bg.opacity : 0.3;
      // 黑色半透明遮罩：alpha 取 (1-opacity) 的 0.6~0.95 范围，保证至少 0.6 以上
      const alpha = Math.min(0.9, Math.round((1 - opacity) * 85) / 100 + 0.15);
      const bgColor = theme === 'light' ? 'rgba(255,255,255,' + Math.min(alpha, 0.5) + ')' : 'rgba(0,0,0,' + alpha + ')';
      overlay.style.background = 'linear-gradient(' + bgColor + ', ' + bgColor + '), url(background/' + bg.filename + ') center/cover no-repeat fixed';
    } catch (e) { /* 静默失败 */ }
  }

  function renderHeader(overlay, state) {
    const h = document.createElement('div');
    h.className = 'ke-header';
    h.innerHTML = `
      <button class="ke-btn" id="ke-back">← 返回</button>
      <h2>Kether 积木编辑器</h2>
      <span style="font-size:10px;opacity:0.4;margin-right:auto;">${_actions.length} 动作</span>
      <div class="ke-header-actions">
        <button class="ke-btn" id="ke-undo" disabled>↩</button>
        <button class="ke-btn" id="ke-redo" disabled>↪</button>
        <button class="ke-btn ${state.mode === 'visual' ? 'ke-btn-active' : ''}" id="ke-mode-visual">🧊 积木</button>
        <button class="ke-btn ${state.mode === 'code' ? 'ke-btn-active' : ''}" id="ke-mode-code">📝 代码</button>
        <label class="ke-auto-sync-label">
          <input type="checkbox" id="ke-auto-sync" ${state.autoSync ? 'checked' : ''}> 🔄
        </label>
        <button class="ke-btn ke-btn-primary" id="ke-confirm">✓ 确定</button>
      </div>
      <div class="ke-header-winctrl">
        <button class="tb-btn tb-btn-minimize" id="ke-win-minimize">─</button>
        <button class="tb-btn tb-btn-maximize" id="ke-win-maximize">□</button>
        <button class="tb-btn tb-btn-close" id="ke-win-close">✕</button>
      </div>`;
    overlay.appendChild(h);

    bindTooltip(h.querySelector('#ke-undo'), '撤销 (Ctrl+Z)');
    bindTooltip(h.querySelector('#ke-redo'), '重做 (Ctrl+Shift+Z)');
    bindTooltip(h.querySelector('.ke-auto-sync-label'), '自动同步积木到 Kether 代码');
    // 窗口控件提示跟随语言设置 (kether.* 与应用标题栏共用同一组词)
    bindTooltip(h.querySelector('#ke-win-minimize'), keI18n('kether.minimize', '最小化'));
    bindTooltip(h.querySelector('#ke-win-maximize'), keI18n('kether.maximize', '最大化'));
    bindTooltip(h.querySelector('#ke-win-close'), keI18n('kether.close', '关闭'));

    h.querySelector('#ke-back').onclick = () => { playSound('back'); if (state.onCancel) state.onCancel(); overlay.remove(); };
    h.querySelector('#ke-undo').onclick = () => { playSound('click'); _undo(state, overlay); };
    h.querySelector('#ke-redo').onclick = () => { playSound('click'); _redo(state, overlay); };
    h.querySelector('#ke-mode-visual').onclick = () => { playSound('click'); state.mode = 'visual'; switchMode(overlay, state); };
    h.querySelector('#ke-mode-code').onclick = () => { playSound('click'); state.mode = 'code'; switchMode(overlay, state); };
    h.querySelector('#ke-auto-sync').onchange = (e) => {
      playSound('click');
      state.autoSync = e.target.checked;
      _savedSettings.autoSync = state.autoSync;
      saveSettings(_savedSettings);
      // 开启时自动刷新
      if (state.autoSync) refreshCanvas(overlay, state);
    };
    h.querySelector('#ke-confirm').onclick = () => {
      playSound('submit');
      // 只保留入口块及其子块，游离块被丢弃
      const entries = state.blocks.filter(b => b.actionId === '__entry__');
      const code = generateCode(entries);
      state.onConfirm(code);
      overlay.remove();
    };
    h.querySelector('#ke-win-minimize').onclick = () => { if (window.electronAPI) window.electronAPI.minimize(); };
    h.querySelector('#ke-win-maximize').onclick = () => { if (window.electronAPI) window.electronAPI.maximize(); };
    h.querySelector('#ke-win-close').onclick = () => { if (window.electronAPI) window.electronAPI.close(); };
  }

  function switchMode(overlay, state) {
    overlay.querySelector('#ke-mode-visual').className = 'ke-btn' + (state.mode === 'visual' ? ' ke-btn-active' : '');
    overlay.querySelector('#ke-mode-code').className = 'ke-btn' + (state.mode === 'code' ? ' ke-btn-active' : '');
    const body = overlay.querySelector('.ke-body');
    if (body) body.remove();
    const nb = document.createElement('div');
    nb.className = 'ke-body';
    overlay.appendChild(nb);
    if (state.mode === 'visual') renderVisualMode(overlay, nb, state);
    else renderCodeMode(overlay, nb, state);
  }

  // ============================================
  // 可视模式
  // ============================================
  function renderVisualMode(overlay, body, state) {
    body.innerHTML = `
      <div class="ke-sidebar">
        <div class="ke-sidebar-search"><input type="text" id="ke-search" placeholder="搜索动作..."></div>
        <div class="ke-cat-list" id="ke-cat-list"></div>
        <div class="ke-action-list" id="ke-action-list"></div>
      </div>
      <div class="ke-workspace">
        <div class="ke-workspace-header">
          <span>入口 (<span id="ke-ec">${state.blocks.length}</span>) · 积木 (<span id="ke-count">${countBlocks(state)}</span>)</span>
          <div class="ke-workspace-actions">
            <div class="ke-settings-wrapper">
              <button class="ke-btn" id="ke-settings-btn">⚙️</button>
              <div class="ke-settings-dropdown" id="ke-settings-dd" style="display:none;">
                <div class="ke-settings-row">
                  <span class="ke-settings-label">积木颜色</span>
                  <select id="ke-setting-color">
                    <option value="provider">提供者</option>
                    <option value="category">分类</option>
                  </select>
                </div>
                <div class="ke-settings-row">
                  <span class="ke-settings-label">显示名称</span>
                  <select id="ke-setting-name">
                    <option value="cn-en">中文+英文</option>
                    <option value="cn">仅中文</option>
                    <option value="en">仅英文</option>
                  </select>
                </div>
                <div class="ke-settings-row">
                  <span class="ke-settings-label">引号按钮</span>
                  <input type="checkbox" id="ke-setting-quote" ${_savedSettings.showQuoteBtn ? 'checked' : ''}>
                </div>
                <div class="ke-settings-row">
                  <span class="ke-settings-label">语义化显示</span>
                  <select id="ke-setting-semantic">
                    <option value="on" ${_savedSettings.semanticMode !== false ? 'selected' : ''}>开启</option>
                    <option value="off" ${_savedSettings.semanticMode === false ? 'selected' : ''}>关闭</option>
                  </select>
                </div>
              </div>
            </div>
            <button class="ke-btn" id="ke-add">+ 添加积木</button>
            <button class="ke-btn" id="ke-add-entry">📥 新入口</button>
            <button class="ke-btn" id="ke-add-def">📦 新定义</button>
            <button class="ke-btn" id="ke-clear">🗑 清空</button>
          </div>
        </div>
        <div class="ke-canvas"><div class="ke-canvas-inner" id="ke-canvas"></div></div>
        <div class="ke-footer">
          <div class="ke-footer-toggle" id="ke-ft">▶ 代码预览</div>
          <div class="ke-footer-code" id="ke-fc"></div>
        </div>
      </div>
      <div class="ke-sidebar-right" id="ke-sidebar-right">
        <div class="ke-sidebar-right-toggle" id="ke-sidebar-right-toggle">📦 <span class="ke-sr-label">暂存</span><span class="ke-sr-arrow">◀</span></div>
        <div class="ke-sidebar-right-content" id="ke-sidebar-right-content">
          <div class="ke-stash" id="ke-stash">
            <div class="ke-stash-header">📦 暂存区 <span class="ke-stash-count">${_stashBlocks.length}</span></div>
            <div class="ke-stash-list" id="ke-stash-list"></div>
            <div class="ke-stash-drop" id="ke-stash-drop">拖入积木暂存</div>
          </div>
          <div class="ke-saved" id="ke-saved-section" style="${_savedBlocks.length ? '' : 'display:none'}">
            <div class="ke-stash-header">💾 已保存 <span class="ke-stash-count">${_savedBlocks.length}</span></div>
            <div class="ke-saved-list" id="ke-saved-list"></div>
          </div>
        </div>
      </div>`;

    renderCatList(overlay, state);
    renderActions(overlay, state, null, '');
    renderCanvas(overlay, state);
    requestAnimationFrame(() => {
      overlay.querySelectorAll('.ke-b-input, .ke-branch-input').forEach(el => {
        el.style.width = '1px';
        el.style.width = Math.max(40, el.scrollWidth) + 'px';
      });
    });

    overlay.querySelector('#ke-search').oninput = (e) => renderActions(overlay, state, state.activeCategory, e.target.value);
    overlay.querySelector('#ke-add').onclick = () => {
      playSound('click');
      const entry = state.blocks.find(b => b.isEntry) || state.blocks[0];
      if (entry) showToolbox(overlay, state, entry.id, 'entry');
    };
    overlay.querySelector('#ke-add-entry').onclick = () => {
      playSound('click');
      state.blocks.push(createEntryBlock('normal'));
      refreshCanvas(overlay, state);
    };
    overlay.querySelector('#ke-add-def').onclick = () => {
      playSound('click');
      state.blocks.push(createEntryBlock('definition'));
      refreshCanvas(overlay, state);
    };
    overlay.querySelector('#ke-clear').onclick = () => {
      playSound('update');
      for (const b of state.blocks) {
        if (b.isEntry) b.thenBlocks = [];
      }
      refreshCanvas(overlay, state);
    };
    overlay.querySelector('#ke-ft').onclick = () => {
      playSound('collapse');
      const fc = overlay.querySelector('#ke-fc');
      const open = fc.classList.toggle('ke-footer-open');
      overlay.querySelector('#ke-ft').textContent = open ? '▼ 代码预览' : '▶ 代码预览';
      fc.textContent = generateCode(state.blocks) || '(空)';
    };

    // 设置面板
    const settingsDD = overlay.querySelector('#ke-settings-dd');
    overlay.querySelector('#ke-settings-btn').onclick = (e) => {
      e.stopPropagation();
      playSound('collapse');
      settingsDD.style.display = settingsDD.style.display === 'none' ? '' : 'none';
    };
    if (window._keCloseSettings) document.removeEventListener('click', window._keCloseSettings);
    window._keCloseSettings = function(e) {
      if (settingsDD.style.display !== 'none' && !settingsDD.contains(e.target) && e.target !== overlay.querySelector('#ke-settings-btn')) {
        settingsDD.style.display = 'none';
      }
    };
    document.addEventListener('click', window._keCloseSettings);
    overlay.querySelector('#ke-setting-color').value = state.settings.colorMode;
    overlay.querySelector('#ke-setting-color').onchange = (e) => {
      playSound('click');
      state.settings.colorMode = e.target.value;
      saveSettings(state.settings);
      refreshCanvas(overlay, state);
    };
    overlay.querySelector('#ke-setting-name').value = state.settings.nameMode;
    overlay.querySelector('#ke-setting-name').onchange = (e) => {
      playSound('click');
      state.settings.nameMode = e.target.value;
      saveSettings(state.settings);
      refreshCanvas(overlay, state);
    };
    const semanticSel = overlay.querySelector('#ke-setting-semantic');
    if (semanticSel) {
      semanticSel.value = state.settings.semanticMode ? 'on' : 'off';
      semanticSel.onchange = (e) => {
        playSound('click');
        state.settings.semanticMode = e.target.value === 'on';
        saveSettings(state.settings);
        refreshCanvas(overlay, state);
      };
    }
    const quoteCb = overlay.querySelector('#ke-setting-quote');
    if (quoteCb) {
      quoteCb.onchange = (e) => {
        playSound('click');
        state.settings.showQuoteBtn = e.target.checked;
        saveSettings(state.settings);
        refreshCanvas(overlay, state);
      };
    }

    // 渲染暂存区和已保存（右侧面板）
    renderStashSidebar(overlay, state);
    renderSavedSidebar(overlay, state);
    setupStashDrop(overlay, state);
    // 右侧面板折叠切换
    const rightPanel = overlay.querySelector('#ke-sidebar-right');
    const toggleBtn = overlay.querySelector('#ke-sidebar-right-toggle');
    if (rightPanel && toggleBtn) {
      toggleBtn.onclick = () => {
        playSound('collapse');
        rightPanel.classList.toggle('ke-collapsed');
        const arrow = toggleBtn.querySelector('.ke-sr-arrow');
        if (arrow) arrow.textContent = rightPanel.classList.contains('ke-collapsed') ? '▶' : '◀';
      };
    }
  }

  function renderCommonActions(overlay, state, list, search) {
    var blocks = _commonBlocks;
    var q = (search || '').toLowerCase();
    if (q) {
      blocks = blocks.filter(function(b) { return b.name.toLowerCase().indexOf(q) >= 0 || b.desc.toLowerCase().indexOf(q) >= 0; });
    }
    for (var i = 0; i < blocks.length; i++) {
      var cb = blocks[i];
      var item = document.createElement('div');
      item.className = 'ke-action-item ke-action-warn';
      item.innerHTML = '<span class="ke-action-color" style="background:#ff69b4"></span><span class="ke-action-name">' + esc(cb.name) + '</span><span class="ke-action-provider">' + (cb.isUser ? '自定义' : '常用') + '</span>';
      item.onclick = function(cb) {
        return function() {
          playSound('select');
          var params = cb.params;
          var paramKeys = Object.keys(params || {});
          if (paramKeys.length === 0) {
            var code = cb.syntax;
            if (cb.isUser) {
              insertCommonCode(overlay, state, code);
            } else {
              insertRawCodeBlock(overlay, state, code);
            }
          } else {
            showCommonParamDialog(overlay, state, cb, !cb.isUser);
          }
        };
      }(cb);
      if (cb.isUser) {
        item.oncontextmenu = function(cb) {
          return function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('删除常用积木 "' + cb.name + '"？')) {
              removeUserCommonBlock(cb.id);
              renderActions(overlay, state, _COMMON_CAT, '');
            }
          };
        }(cb);
      }
      list.appendChild(item);
    }
    if (blocks.length === 0) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-tertiary);font-size:13px;">暂无常用积木<br><small>右键积木可添加为常用</small></div>';
    }
  }

  function showCommonParamDialog(overlay, state, cb, asCustom) {
    var modal = document.createElement('div');
    modal.className = 'cv-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200001;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    var html = '<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:10px;padding:24px;max-width:460px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">' +
      '<h3 style="margin:0 0 4px;font-size:15px;">' + esc(cb.name) + '</h3>' +
      (cb.desc ? '<p style="margin:0 0 16px;font-size:12px;color:var(--color-text-tertiary);">' + esc(cb.desc) + '</p>' : '') +
      '<div class="ke-param-fields">';
    var params = cb.params || {};
    var inputs = {};
    for (var key in params) {
      var p = params[key];
      if (typeof p === 'string') {
        html += '<div style="margin-bottom:10px;"><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:3px;">' + esc(p) + '</label><input class="ke-param-input" id="ke-pi-' + key + '" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-tertiary);color:var(--color-text-primary);box-sizing:border-box;"></div>';
      } else if (p.selectable) {
        html += '<div style="margin-bottom:10px;"><label style="display:block;font-size:12px;color:var(--color-text-secondary);margin-bottom:3px;">' + esc(p.name || key) + '</label><select class="ke-param-select" id="ke-pi-' + key + '" style="width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-tertiary);color:var(--color-text-primary);">';
        for (var label in p.selectable) {
          var val = p.selectable[label];
          html += '<option value="' + esc(val) + '">' + esc(label) + '</option>';
        }
        html += '</select></div>';
      }
    }
    html += '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
      '<button class="ke-btn" id="ke-param-cancel" style="padding:6px 16px;">取消</button>' +
      '<button class="ke-btn ke-btn-primary" id="ke-param-ok" style="padding:6px 16px;">插入</button>' +
      '</div></div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    modal.querySelector('#ke-param-cancel').onclick = function() { modal.remove(); };
    modal.querySelector('#ke-param-ok').onclick = function() {
      var values = {};
      for (var key in params) {
        var inp = modal.querySelector('#ke-pi-' + key);
        if (inp) values[key] = inp.value;
      }
      var code = resolveCommonSyntax(cb.syntax, params, values);
      modal.remove();
      if (asCustom) {
        insertRawCodeBlock(overlay, state, code);
      } else {
        insertCommonCode(overlay, state, code);
      }
    };
    modal.addEventListener('click', function(e) { if (e.target === this) modal.remove(); });
    // 回车确认
    modal.querySelector('.ke-param-input')?.addEventListener('keydown', function(e) { if (e.key === 'Enter') modal.querySelector('#ke-param-ok').click(); });
  }

  function insertRawCodeBlock(overlay, state, code) {
    if (!code || !code.trim()) return;
    try {
      var block = createCustomBlock(code.trim());
      var entry = state.blocks.find(function(b) { return b.isEntry; });
      if (entry) {
        entry.thenBlocks.push(block);
      } else {
        state.blocks.push(block);
      }
      refreshCanvas(overlay, state);
      updatePreview(overlay, state);
    } catch (e) { console.error('[KE] 插入原始代码失败:', e); }
  }

  function insertCommonCode(overlay, state, code) {
    if (!code || !code.trim()) return;
    try {
      var parsed = parseCodeToBlocks(code);
      if (parsed.length === 0) return;
      var entry = state.blocks.find(function(b) { return b.isEntry; });
      if (entry) {
        for (var pi = 0; pi < parsed.length; pi++) {
          entry.thenBlocks.push(parsed[pi]);
        }
      } else {
        for (var pj = 0; pj < parsed.length; pj++) {
          state.blocks.push(parsed[pj]);
        }
      }
      refreshCanvas(overlay, state);
      updatePreview(overlay, state);
    } catch (e) { console.error('[KE] 插入常用积木失败:', e); }
  }

  function renderCatList(overlay, state) {
    const list = overlay.querySelector('#ke-cat-list');
    list.innerHTML = '';
    // ⭐ 常用
    var favItem = mk('div', 'ke-cat-item' + (state.activeCategory === _COMMON_CAT ? ' ke-cat-active' : ''), '<span style="font-weight:600;">' + _COMMON_CAT + '</span><span class="ke-cat-count">' + _commonBlocks.length + '</span>');
    favItem.onclick = function() { playSound('lightclick'); state.activeCategory = _COMMON_CAT; list.querySelectorAll('.ke-cat-item').forEach(function(el) { el.classList.remove('ke-cat-active'); }); favItem.classList.add('ke-cat-active'); renderActions(overlay, state, _COMMON_CAT, ''); };
    list.appendChild(favItem);

    const allItem = mk('div', 'ke-cat-item' + (state.activeCategory == null ? ' ke-cat-active' : ''), '<span style="font-weight:600;">全部</span><span class="ke-cat-count">' + _actions.length + '</span>');
    allItem.onclick = () => { playSound('lightclick'); state.activeCategory = null; list.querySelectorAll('.ke-cat-item').forEach(el => el.classList.remove('ke-cat-active')); allItem.classList.add('ke-cat-active'); renderActions(overlay, state, null, ''); };
    list.appendChild(allItem);

    for (const cat of _categoryList) {
      const color = catColor(cat);
      const count = (_categorizedActions[cat] || []).length;
      const item = mk('div', 'ke-cat-item' + (state.activeCategory === cat ? ' ke-cat-active' : ''), '<span class="ke-cat-dot" style="background:' + color + '"></span>' + esc(cat) + '<span class="ke-cat-count">' + count + '</span>');
      item.onclick = () => { playSound('lightclick'); state.activeCategory = cat; list.querySelectorAll('.ke-cat-item').forEach(el => el.classList.remove('ke-cat-active')); item.classList.add('ke-cat-active'); renderActions(overlay, state, cat, ''); };
      list.appendChild(item);
    }
  }

  function renderActions(overlay, state, category, search) {
    const list = overlay.querySelector('#ke-action-list');
    list.innerHTML = '';
    // ⭐ 常用：渲染常用积木列表
    if (category === _COMMON_CAT) {
      renderCommonActions(overlay, state, list, search);
      return;
    }
    let acts = category ? (_categorizedActions[category] || []) : _actions;
    const q = (search || '').toLowerCase();
    if (q) {
      acts = acts.filter(a => {
        const nameMatch = a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
        const syntaxMatch = a.syntax && a.syntax.toLowerCase().replace(/[{}]/g, '').includes(q);
        const descMatch = a.description && a.description.toLowerCase().replace(/[{}]/g, '').includes(q);
        return nameMatch || syntaxMatch || descMatch;
      });
      acts.sort((a, b) => {
        const score = (act) => {
          if (act.name.toLowerCase().includes(q) || act.id.toLowerCase().includes(q)) return 0;
          if (act.syntax && act.syntax.toLowerCase().replace(/[{}]/g, '').includes(q)) return 1;
          return 2;
        };
        return score(a) - score(b);
      });
    }

    for (const act of acts) {
      const def = isDefaultProvider(act.provider);
      const item = mk('div', 'ke-action-item' + (def ? '' : ' ke-action-warn'), '');
      const aColor = actionColor(act, state.activeCategory);
      item.innerHTML = '<span class="ke-action-color" style="background:' + aColor + '"></span><span class="ke-action-name">' + esc(act.name) + '</span><span class="ke-action-provider">' + esc(act.provider) + '</span>';
      item.onclick = () => { playSound('select'); addBlock(overlay, state, act, null, null, state.activeCategory); };
      item.draggable = true;
      item.ondragstart = (e) => {
        e.stopPropagation();
        _keLastDropTarget = null;
        removeDropIndicator();
        e.dataTransfer.setData('text/ke-new', act.id);
        e.dataTransfer.effectAllowed = 'copy';
      };
      bindTooltip(item, highlightBraces(act.description), true);
      item.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        var oldMenu = document.querySelector('.ke-ctx-menu');
        if (oldMenu) oldMenu.remove();
        var menu = document.createElement('div');
        menu.className = 'ke-ctx-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.innerHTML =
          '<div class="ke-ctx-item" data-act="copy-block"><span>📋</span> 复制积木</div>' +
          '<div class="ke-ctx-sep"></div>' +
          '<div class="ke-ctx-item" data-act="view-detail"><span>📖</span> 查看描述</div>' +
          '<div class="ke-ctx-sep"></div>' +
          '<div class="ke-ctx-item" data-act="fav-block"><span>⭐</span> 添加为常用积木</div>';
        menu.querySelector('[data-act="copy-block"]').onclick = function() {
          playSound('click');
          _clipboard = { _type: 'act', action: act };
          console.log('[KE] 复制积木:', act.id, act.name);
          menu.remove();
        };
        menu.querySelector('[data-act="view-detail"]').onclick = function() {
          playSound('click');
          menu.remove();
          showBlockDetail({ actionId: act.id }, null);
        };
        menu.querySelector('[data-act="fav-block"]').onclick = function() {
          playSound('click');
          menu.remove();
          addUserCommonBlock(act.name, act.syntax);
        };
        document.body.appendChild(menu);
        var closeCtx = function(e2) {
          if (!menu.contains(e2.target)) { menu.remove(); document.removeEventListener('mousedown', closeCtx); }
        };
        setTimeout(function() { document.addEventListener('mousedown', closeCtx); }, 0);
      };
      list.appendChild(item);
    }
    if (acts.length === 0) list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-tertiary);font-size:11px;">无匹配动作</div>';
  }

  // ============================================
  // 积木块渲染
  // ============================================
  var _keDraggedId = null;
  var _keLastDropTarget = null;
  var _keLastDropType = '';
document.addEventListener('dragover', function (e) {
    const hasNew = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('text/ke-new');
    if (!_keDraggedId && !hasNew) return;
    if (!e.target.closest('.ke-overlay')) return;
    // 当鼠标位于控制积木（ALL/ANY/if/while）的主体上方时，
    // closest('.ke-b-slot') 会跳过内部的 .ke-b-slot 直接匹配外层的 entry-slot。
    // 这里检查是否在含有 .ke-b-c-body 的控制块内，如果是则直接定位到其内部插槽。
    var cb = e.target.closest('.ke-b');
    if (cb) {
      // Check if directly over a valid slot belonging to this block
      // (handles condition slot in header, then/else in C-body, etc.)
      var directSlot = e.target.closest('.ke-b-slot, .ke-entry-slot');
      if (directSlot && directSlot.closest('.ke-b') === cb) {
        e.preventDefault();
        directSlot.classList.add('drag-over');
        _keLastDropTarget = directSlot;
        showDropIndicator(directSlot, e.clientY);
        updateDragDebug('slot', directSlot.dataset.slotType + '@' + directSlot.dataset.bid);
        return;
      }
      // Fallback for control blocks: when dragging over blocks inside C-body,
      // closest('.ke-b-slot') can skip inner slots — find the first slot
      var cbody = cb.querySelector('.ke-b-c-body');
      if (cbody) {
        var allSlots = cbody.querySelectorAll('.ke-b-slot');
        var bestSlot = null;
        var bestDist = Infinity;
        for (var si = 0; si < allSlots.length; si++) {
          var r = allSlots[si].getBoundingClientRect();
          var midY = r.top + r.height / 2;
          var dist = Math.abs(e.clientY - midY);
          if (dist < bestDist) {
            bestDist = dist;
            bestSlot = allSlots[si];
          }
        }
        if (bestSlot) {
          e.preventDefault();
          bestSlot.classList.add('drag-over');
          _keLastDropTarget = bestSlot;
          showDropIndicator(bestSlot, e.clientY);
          updateDragDebug('slot', bestSlot.dataset.slotType + '@' + bestSlot.dataset.bid);
          return;
        }
      }
    }
    var slot = e.target.closest('.ke-b-slot, .ke-entry-slot');
    if (slot) { e.preventDefault(); slot.classList.add('drag-over'); _keLastDropTarget = slot; showDropIndicator(slot, e.clientY); updateDragDebug('slot', slot.dataset.slotType + '@' + slot.dataset.bid); }
  });

  function updateDragDebug(type, info) {
    var el = document.getElementById('ke-drag-debug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ke-drag-debug';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.8);color:#0f0;font-size:11px;padding:2px 8px;font-family:monospace;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = 'drag: ' + (_keDraggedId || '').slice(-8) + ' | target: ' + info + ' | t: ' + type;
  }
  function removeDropIndicator() {
    var el = document.querySelector('.ke-drop-indicator');
    if (el) el.remove();
  }

  function showDropIndicator(slot, clientY) {
    // Remove existing indicator in this slot first
    var existing = slot.querySelector('.ke-drop-indicator');
    if (existing) existing.remove();
    // Calculate insertion index based on cursor Y
    var children = [];
    for (var ci = 0; ci < slot.children.length; ci++) {
      var ch = slot.children[ci];
      if (ch.classList.contains('ke-b')) children.push(ch);
    }
    if (children.length === 0) {
      // Empty slot: just use drag-over highlight, no indicator needed
      return;
    }
    // Find the insertion index
    var index = -1;
    for (var i = 0; i < children.length; i++) {
      var rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    if (index === -1) index = children.length;
    // Create indicator
    var indicator = document.createElement('div');
    indicator.className = 'ke-drop-indicator';
    if (index < children.length) {
      slot.insertBefore(indicator, children[index]);
    } else {
      // Append after last block, before the slot's own + button if present
      var lastChild = slot.children[slot.children.length - 1];
      if (lastChild && lastChild.classList.contains('ke-slot-add-btn')) {
        slot.insertBefore(indicator, lastChild);
      } else {
        slot.appendChild(indicator);
      }
    }
  }

  // ============================================
  // 语义化渲染
  // ============================================
  function renderSemanticBlock(body, block, actionDef, state, overlay) {
    const sm = actionDef.semantic;
    if (!sm) { body.innerHTML = blockLabelHtml(block); return; }

    // collect non-keyword params in order
    const vps = block.params.filter(p => p.type !== 'keyword');
    const parts = sm.split(/(\{\d+\})/);

    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      if (!part) continue;
      const pm = part.match(/^\{(\d+)\}$/);
      if (pm) {
        const idx = parseInt(pm[1]);
        const p = vps[idx];
        if (!p) continue;
        if (p.type === 'select') {
          const cv = block.values[p.key || p.label] || '';
          const sl = mk('select', 'ke-b-select', '');
          sl.innerHTML = '<option value="">─</option>' +
            p.options.map(o => '<option value="' + esc(o) + '"' + (cv === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
          const sk = p.key, slb = p.label;
          sl.onchange = () => { block.values[sk || slb] = sl.value; updatePreview(overlay, state); };
          body.appendChild(sl);
        } else if (p.type === 'action') {
          body.appendChild(createActionParamWidget(block, p, 'val-' + p.key, state, overlay));
        } else if (p.type === 'text' && p.label === 'symbol') {
          const SYM_OPS = ['>', '>=', '==', '<=', '<', '!=', '=!', 'in', 'is'];
          const curVal = block.values[p.key || p.label] || '';
          const sel = mk('select', 'ke-b-select', '');
          sel.innerHTML = '<option value="">?</option>' + SYM_OPS.map(o => '<option value="' + esc(o) + '"' + (curVal === o ? ' selected' : '') + '>' + esc(o) + '</option>') + '<option value="__custom__"' + (curVal && !SYM_OPS.includes(curVal) ? ' selected' : '') + '>✎ 自定义</option>';
          const sk = p.key, slb = p.label;
          sel.onchange = () => {
            if (sel.value === '__custom__') {
              custInp.style.display = '';
              sel.style.display = 'none';
              if (curVal && !SYM_OPS.includes(curVal)) custInp.value = curVal;
            } else {
              block.values[sk || slb] = sel.value;
              updatePreview(overlay, state);
            }
          };
          body.appendChild(sel);
          const custInp = mk('input', 'ke-b-input', '');
          custInp.value = curVal && !SYM_OPS.includes(curVal) ? curVal : '';
          custInp.placeholder = '自定义符号';
          custInp.style.display = curVal && !SYM_OPS.includes(curVal) ? '' : 'none';
          custInp.style.maxWidth = '80px';
          const ck = p.key, clb = p.label;
          custInp.oninput = () => { block.values[ck || clb] = custInp.value; updatePreview(overlay, state); };
          body.appendChild(custInp);
        } else {
          const v = block.values[p.key || p.label] || '';
          const ip = mk('input', 'ke-b-input', '');
          ip.value = v;
          ip.placeholder = p.label || p.key;
          ip.style.maxWidth = '80px';
          const ik = p.key, ilb = p.label;
          ip.oninput = () => { block.values[ik || ilb] = ip.value; updatePreview(overlay, state); };
          body.appendChild(ip);
          const invActs = ['inventory_check','inventory_count','inventory_take','equipment_check','inventory_slot_check'];
          if (invActs.indexOf(block.actionId) !== -1 && p.label === 'token') {
            const eb = mk('button', 'ke-b-helper', '📦');
            bindTooltip(eb, '可视化物品编辑');
            const ev = v, ek = p.key || p.label;
            eb.onclick = (e) => {
              e.stopPropagation();
              if (window.ChemdahInterpreter && window.ChemdahInterpreter.showItemEditor) {
                window.ChemdahInterpreter.showItemEditor(ev, r => { if (r != null) { block.values[ek] = r; ip.value = r; updatePreview(overlay, state); } });
              }
            };
            body.appendChild(eb);
          } else if (block.actionId === 'position' && p.label === 'token') {
            const eb2 = mk('button', 'ke-b-helper', '📍');
            bindTooltip(eb2, '可视化坐标编辑');
            const ev2 = v, ek2 = p.key || p.label;
            eb2.onclick = (e) => {
              e.stopPropagation();
              if (window.ChemdahInterpreter && window.ChemdahInterpreter.showPositionEditor) {
                window.ChemdahInterpreter.showPositionEditor(ev2, r => { if (r != null) { block.values[ek2] = r; ip.value = r; updatePreview(overlay, state); } });
              }
            };
            body.appendChild(eb2);
          }
        }
      } else {
        body.appendChild(mk('span', 'ke-b-semantic-text', esc(part)));
      }
    }

    if (!isDefaultProvider(block.provider)) {
      body.appendChild(mk('span', 'ke-b-provider-warn', '⚠' + block.provider));
    }
    const db = mk("button", "ke-b-del", "✕");
    db.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(db);
  }

  function renderCanvas(overlay, state) {
    const c = overlay.querySelector('#ke-canvas');
    if (!c) return;
    if (state.blocks.length === 0) {
      c.innerHTML = '<div class="ke-empty-state"><p style="font-size:32px;opacity:0.15;">🧊</p><p>点击 <strong>+ 添加积木</strong> 开始</p><p style="font-size:10px;opacity:0.3;">或切换到代码模式直接输入</p></div>';
      return;
    }
    const inner = document.createElement('div');
    inner.className = 'ke-canvas-inner ke-blocks-stack';
    for (const b of state.blocks) {
      if (b.actionId === '__entry__') {
        inner.appendChild(renderEntryBlock(b, state, overlay));
      } else {
        inner.appendChild(renderBlock(b, state, overlay));
      }
    }
    c.innerHTML = '';
    c.appendChild(inner);
    updateCount(overlay, state);
  }

  function renderBlock(block, state, overlay, inSlot) {
    if (block.actionId === '__custom__') return renderCustomBlock(block, state, overlay);
    if (block.actionId === '__text__') return renderTextBlock(block, state, overlay);
    if (block.actionId === '__true__') return renderTrueBlock(block, state, overlay);
    if (block.actionId === '__false__') return renderFalseBlock(block, state, overlay);
    if (block.actionId === '__unquoted__') return renderUnquotedBlock(block, state, overlay);
    if (block.actionId === '__list__') return renderListBlock(block, state, overlay);
    if (block.actionId === '__brace__') return renderBraceBlock(block, state, overlay);

    const el = document.createElement('div');
    el.className = 'ke-b';
    el.dataset.bid = block.id;
    const blockColor = getBlockColor(block);
    el.style.setProperty('--b-color', blockColor);
    el.style.setProperty('--b-text-color', textColorForBg(blockColor));
    el.draggable = true;
    el.ondragstart = (e) => {
      console.log('[KE] dragstart action=' + block.actionId + ' bid=' + block.id.slice(-8));
      playSound('select');
      e.stopPropagation();
      _keDraggedId = block.id;
      _keLastDropTarget = null;
      removeDropIndicator();
      e.dataTransfer.setData('text/plain', block.id);
      e.dataTransfer.setData('text/ke-bid', block.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
      updateDragDebug('start', block.actionId);
    };
    el.ondragend = (e) => {
      el.classList.remove('dragging');
      removeDropIndicator();
      const id = _keDraggedId;
      _keDraggedId = null;
      if (!id) { console.log('[KE] dragend: no id'); return; }
      var slot = _keLastDropTarget;
      _keLastDropTarget = null;
      if (!slot) { console.log('[KE] dragend: no target');
        var sidebar = overlay.querySelector('.ke-sidebar');
        if (sidebar) {
          var r = sidebar.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            removeBlock(state, id, overlay);
            playSound('delete');
            refreshCanvas(overlay, state);
            updatePreview(overlay, state);
          }
        }
        return; }
      console.log('[KE] dragend target: class=' + slot.className + ' bid=' + (slot.dataset.bid || '?').slice(-8) + ' tp=' + (slot.dataset.slotType || '?'));
      var pid = slot.dataset.bid, tp = slot.dataset.slotType;
      if (pid && tp) {
        var idx = calculateDropIndex(slot, e.clientY);
        console.log('[KE] dragend->moveBlock bid=' + id.slice(-8) + ' pid=' + pid.slice(-8) + ' tp=' + tp + ' idx=' + idx);
        moveBlock(state, id, pid, tp, idx);
        playSound('drag');
        refreshCanvas(overlay, state);
        updatePreview(overlay, state);
      }
    };
    el.oncontextmenu = (e) => { showContextMenu(e, block, state, overlay); };
    // 插槽内的积木将 dragover 视觉反馈转发给父级插槽
    // 注意：不调用 preventDefault，块本身不注册为拖放目标（仅插槽可接收）
    if (inSlot) {
      el.ondragover = (e) => {
        var s = el.parentNode?.closest('.ke-b-slot, .ke-entry-slot');
        if (s) s.classList.add('drag-over');
      };
      el.ondragleave = () => {
        var s = el.parentNode?.closest('.ke-b-slot, .ke-entry-slot');
        if (s) s.classList.remove('drag-over');
      };
    }

    if (block.isControl) {
      // C 形控制块
      const body = document.createElement('div');
      body.className = 'ke-b-body';
      body.innerHTML = blockLabelHtml(block);
      // 添加控制参数行
      for (const p of block.params) {
        if (p.type === 'action' && p.key === 'condition') {
          // 条件插槽（支持文字/积木双模式）
          const widget = createActionParamWidget(block, p, 'cond', state, overlay);
          body.appendChild(widget);
        } else if (p.type === 'action') {
          // 通用动作参数（支持文字/积木双模式）
          const widget = createActionParamWidget(block, p, 'val-' + p.key, state, overlay);
          body.appendChild(widget);
        } else if (p.type === 'text') {
          const val = block.values[p.key || p.label] || '';
          const inp = mk('input', 'ke-b-input', '');
          inp.value = val;
          inp.placeholder = PARAM_LABEL_CN[p.label] || p.label;
          inp.oninput = () => { block.values[p.key || p.label] = inp.value; updatePreview(overlay, state); };
          body.appendChild(inp);
        } else if (p.type === 'keyword') {
          body.appendChild(mk('span', 'ke-b-keyword', p.value));
        }
      }
      var delBtn = mk("button", "ke-b-del", "✕");
      delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
      body.appendChild(delBtn);
      el.appendChild(body);

      // C 形体（then/else 或 body）
      const cbody = document.createElement('div');
      cbody.className = 'ke-b-c-body';

      if (block.actionId === 'if_else') {
        // then slot
        const thenLabel = mk('div', 'ke-b-slot-label', '执行');
        cbody.appendChild(thenLabel);
        const thenSlot = mkSlot(block, 'then', state, overlay);
        cbody.appendChild(thenSlot);
        // else slot
        const elseLabel = mk('div', 'ke-b-slot-label ke-slot-else-label', '否则');
        cbody.appendChild(elseLabel);
        const elseSlot = mkSlot(block, 'else', state, overlay);
        cbody.appendChild(elseSlot);
      } else if (block.actionId === 'all' || block.actionId === 'any') {
        // 条件列表（列表积木块风格）
        const listSlot = document.createElement('div');
        listSlot.className = 'ke-b-slot';
        listSlot.style.display = 'inline-flex';
        listSlot.style.flexWrap = 'wrap';
        listSlot.style.gap = '2px';
        listSlot.style.padding = '2px';
        listSlot.style.minWidth = '60px';
        listSlot.style.minHeight = '20px';
        listSlot.dataset.slotType = 'cond';
        listSlot.dataset.bid = block.id;
        const conds = block.condBlocks || [];
        if (conds.length === 0) {
          listSlot.classList.add('ke-b-slot-empty');
          listSlot.textContent = '+ 添加条件';
          bindTooltip(listSlot, SLOT_HELP, true);
        } else {
          for (const child of conds) {
            listSlot.appendChild(renderBlock(child, state, overlay, true));
          }
          var addBtn = document.createElement('span');
          addBtn.className = 'ke-slot-add-btn';
          addBtn.textContent = '+';
          bindTooltip(addBtn, SLOT_HELP, true);
          listSlot.appendChild(addBtn);
        }
        listSlot.onclick = (e) => {
          if (e.target === listSlot || e.target.classList.contains('ke-slot-add-btn')) {
            showToolbox(overlay, state, block.id, 'cond');
          }
        };
        makeDropTarget(listSlot, state, overlay);
        cbody.appendChild(listSlot);
      } else if (block.actionId === 'case & when') {
        // when 分支列表
        if (!block._whenBranches || block._whenBranches.length === 0) {
          block._whenBranches = [{ id: uid(), condition: '', condBlocks: [], blocks: [] }];
        }
        for (let bi = 0; bi < block._whenBranches.length; bi++) {
          const br = block._whenBranches[bi];
          const branchEl = document.createElement('div');
          branchEl.className = 'ke-branch';
          branchEl.style.cssText = 'margin-bottom:6px;';
          // 分支头：条件插槽
          const branchHeader = document.createElement('div');
          branchHeader.className = 'ke-branch-header';
          branchHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:2px;';
          const whenKw = mk('span', 'ke-b-keyword', 'when');
          branchHeader.appendChild(whenKw);
          // 条件插槽（积木/文字）
          const condSlot = document.createElement('div');
          condSlot.className = 'ke-b-slot';
          condSlot.style.cssText = 'display:inline-flex;align-items:center;min-width:30px;max-width:140px;';
          condSlot.dataset.slotType = 'wcond-' + bi;
          condSlot.dataset.bid = block.id;
          const condItems = br.condBlocks || [];
          if (condItems.length === 0) {
            condSlot.classList.add('ke-b-slot-empty');
            condSlot.textContent = '+';
            bindTooltip(condSlot, SLOT_HELP, true);
          } else {
            for (const child of condItems) {
              condSlot.appendChild(renderBlock(child, state, overlay, true));
            }
          }
          condSlot.onclick = (e) => {
            if (e.target === condSlot || e.target.classList.contains('ke-slot-add-btn')) {
              handleSlotClick(e, block, 'wcond-' + bi, state, overlay);
            }
          };
          makeDropTarget(condSlot, state, overlay);
          // 当条件有积木时添加常驻+按钮
          if (condItems.length > 0) {
            const addBtn = document.createElement('span');
            addBtn.className = 'ke-slot-add-btn';
            addBtn.textContent = '+';
            bindTooltip(addBtn, SLOT_HELP, true);
            addBtn.onclick = (e) => {
              e.stopPropagation();
              handleSlotClick(e, block, 'wcond-' + bi, state, overlay);
            };
            condSlot.appendChild(addBtn);
          }
          branchHeader.appendChild(condSlot);
          const arrow = mk('span', 'ke-b-keyword', '->');
          branchHeader.appendChild(arrow);
          if (block._whenBranches.length > 1) {
            const delBtn = mk('button', 'ke-branch-del', '✕');
            delBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:10px;padding:0 2px;line-height:1;margin-left:auto;';
            bindTooltip(delBtn, '删除此分支');
            delBtn.onclick = (e) => {
              e.stopPropagation();
              playSound('close');
              block._whenBranches.splice(bi, 1);
              refreshCanvas(overlay, state);
              updatePreview(overlay, state);
            };
            branchHeader.appendChild(delBtn);
          }
          branchEl.appendChild(branchHeader);
          // 分支的块插槽
          const branchSlot = document.createElement('div');
          branchSlot.className = 'ke-b-slot';
          branchSlot.dataset.slotType = 'branch-' + bi;
          branchSlot.dataset.bid = block.id;
          if (br.blocks.length === 0) {
            branchSlot.classList.add('ke-b-slot-empty');
            branchSlot.textContent = '+';
            bindTooltip(branchSlot, SLOT_HELP, true);
          } else {
            for (const child of br.blocks) {
              branchSlot.appendChild(renderBlock(child, state, overlay, true));
            }
            var addBtn = document.createElement('span');
            addBtn.className = 'ke-slot-add-btn';
            addBtn.textContent = '+';
            bindTooltip(addBtn, SLOT_HELP, true);
            addBtn.onclick = (e) => {
              e.stopPropagation();
              handleSlotClick(e, block, 'branch-' + bi, state, overlay);
            };
            branchSlot.appendChild(addBtn);
          }
          branchSlot.onclick = (e) => {
            if (e.target === branchSlot) {
              handleSlotClick(e, block, 'branch-' + bi, state, overlay);
            }
          };
          makeDropTarget(branchSlot, state, overlay);
          branchEl.appendChild(branchSlot);
          cbody.appendChild(branchEl);
        }
        // 添加分支按钮
        const addBranchBtn = mk('button', 'ke-branch-add', '+ 添加 when 分支');
        addBranchBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px dashed rgba(255,255,255,0.25);border-radius:4px;color:rgba(255,255,255,0.6);cursor:pointer;font-size:10px;padding:3px 10px;margin-bottom:6px;width:100%;';
        addBranchBtn.onclick = () => {
          playSound('lightclick');
          block._whenBranches.push({ id: uid(), condition: '', condBlocks: [], blocks: [] });
          refreshCanvas(overlay, state);
          updatePreview(overlay, state);
        };
        cbody.appendChild(addBranchBtn);
        // else 分支
        const elseLabel = mk('div', 'ke-b-slot-label ke-slot-else-label', 'else');
        cbody.appendChild(elseLabel);
        const elseSlot = mkSlot(block, 'else', state, overlay);
        cbody.appendChild(elseSlot);
      } else {
        // while/repeat/foreach - body slot
        if (block.actionId === 'while' || block.actionId === 'repeat') {
          const bodyLabel = mk('div', 'ke-b-slot-label', '执行');
          cbody.appendChild(bodyLabel);
          const bodySlot = mkSlot(block, 'then', state, overlay);
          cbody.appendChild(bodySlot);
        } else if (block.actionId === 'foreach') {
          const bodyLabel = mk('div', 'ke-b-slot-label', '执行');
          cbody.appendChild(bodyLabel);
          const bodySlot = mkSlot(block, 'then', state, overlay);
          cbody.appendChild(bodySlot);
        }
      }
      el.appendChild(cbody);
    } else {
      // 简单块
      const body = document.createElement('div');
      body.className = 'ke-b-body';

      // 语义化显示模式
      const semMode = state.settings.semanticMode !== false;
      const actionDef = semMode ? _actions.find(a => a.id === block.actionId) : null;
      if (semMode && actionDef && actionDef.semantic) {
        renderSemanticBlock(body, block, actionDef, state, overlay);
        el.appendChild(body);
        return el;
      }
      {
        body.innerHTML = blockLabelHtml(block);

        for (let pi = 0; pi < block.params.length; pi++) {
          const p = block.params[pi];
          if (p.type === 'keyword') {
            const nextP = block.params[pi + 1];
            if (nextP && nextP.type === 'select') {
              const curVal = block.values[nextP.key || nextP.label] || '';
              const kw = mk('span', 'ke-b-keyword', p.value);
              if (!curVal) kw.style.display = 'none';
              kw.dataset.condKey = nextP.key || nextP.label;
              body.appendChild(kw);
            } else {
              body.appendChild(mk('span', 'ke-b-keyword', p.value));
            }
            continue;
          }
          if (p.type === 'select') {
            const curVal = block.values[p.key || p.label] || '';
            const sel = mk('select', 'ke-b-select', '');
            sel.innerHTML = '<option value="">─</option>' +
              p.options.map(o => '<option value="' + esc(o) + '"' + (curVal === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
            sel.onchange = () => {
              block.values[p.key || p.label] = sel.value;
              const condKw = body.querySelector('.ke-b-keyword[data-cond-key="' + (p.key || p.label) + '"]');
              if (condKw) condKw.style.display = sel.value ? '' : 'none';
              updatePreview(overlay, state);
            };
            body.appendChild(sel);
            continue;
          }
          if (p.type === 'action') {
            const widget = createActionParamWidget(block, p, 'val-' + p.key, state, overlay);
            body.appendChild(widget);
            continue;
          }
          if (p.type === 'text' && p.label === 'symbol') {
            const SYM_OPS = ['>', '>=', '==', '<=', '<', '!=', '=!', 'in', 'is'];
            const curVal = block.values[p.key || p.label] || '';
            const sel = mk('select', 'ke-b-select', '');
            sel.innerHTML = '<option value="">?</option>' + SYM_OPS.map(o => '<option value="' + esc(o) + '"' + (curVal === o ? ' selected' : '') + '>' + esc(o) + '</option>') + '<option value="__custom__"' + (curVal && !SYM_OPS.includes(curVal) ? ' selected' : '') + '>✎ 自定义</option>';
            sel.onchange = () => {
              if (sel.value === '__custom__') {
                custInp.style.display = '';
                sel.style.display = 'none';
                if (curVal && !SYM_OPS.includes(curVal)) custInp.value = curVal;
              } else {
                block.values[p.key || p.label] = sel.value;
                updatePreview(overlay, state);
              }
            };
            body.appendChild(sel);
            const custInp = mk('input', 'ke-b-input', '');
            custInp.value = curVal && !SYM_OPS.includes(curVal) ? curVal : '';
            custInp.placeholder = '自定义符号';
            custInp.style.display = curVal && !SYM_OPS.includes(curVal) ? '' : 'none';
            custInp.oninput = () => { block.values[p.key || p.label] = custInp.value; updatePreview(overlay, state); };
            body.appendChild(custInp);
            continue;
          }
          const val = block.values[p.key || p.label] || '';
          const inp = mk('input', 'ke-b-input', '');
          inp.value = val;
          inp.placeholder = p.label || p.key;
          inp.oninput = () => { block.values[p.key || p.label] = inp.value; updatePreview(overlay, state); };
          body.appendChild(inp);

          const invActions = ['inventory_check','inventory_count','inventory_take','equipment_check','inventory_slot_check'];
          if (invActions.includes(block.actionId) && p.label === 'token') {
            const editBtn = mk('button', 'ke-b-helper', '📦');
            bindTooltip(editBtn, '可视化物品编辑');
            editBtn.onclick = (e) => {
              e.stopPropagation();
              const current = block.values[p.key || p.label] || '';
              if (window.ChemdahInterpreter && window.ChemdahInterpreter.showItemEditor) {
                window.ChemdahInterpreter.showItemEditor(current, (result) => {
                  if (result != null) {
                    block.values[p.key || p.label] = result;
                    inp.value = result;
                    updatePreview(overlay, state);
                  }
                });
              }
            };
            body.appendChild(editBtn);
          } else if (block.actionId === 'position' && p.label === 'token') {
            const editBtn = mk('button', 'ke-b-helper', '📍');
            bindTooltip(editBtn, '可视化坐标编辑');
            editBtn.onclick = (e) => {
              e.stopPropagation();
              const current = block.values[p.key || p.label] || '';
              if (window.ChemdahInterpreter && window.ChemdahInterpreter.showPositionEditor) {
                window.ChemdahInterpreter.showPositionEditor(current, (result) => {
                  if (result != null) {
                    block.values[p.key || p.label] = result;
                    inp.value = result;
                    updatePreview(overlay, state);
                  }
                });
              }
            };
            body.appendChild(editBtn);
          }
        }
      }

      // 非默认提供者标记
      if (!isDefaultProvider(block.provider)) {
        body.appendChild(mk('span', 'ke-b-provider-warn', '⚠' + block.provider));
      }
      var delBtn = mk("button", "ke-b-del", "✕");
      delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
      body.appendChild(delBtn);
      el.appendChild(body);
    }

    return el;
  }

  function renderCustomBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-custom';
    el.style.setProperty('--b-color', '#ffd600');
    el.dataset.bid = block.id;
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.innerHTML = '<span class="ke-b-label">⧉ 自定义</span>';
    const inp = mk('input', 'ke-b-input', '');
    inp.value = block.values.code || block.customCode || '';
    inp.placeholder = 'Kether 代码...';
    inp.style.flex = '1';
    inp.oninput = () => { block.values.code = inp.value; updatePreview(overlay, state); };
    body.appendChild(inp);
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  // ============================================
  // 值积木块渲染
  // ============================================
  function _setupDrag(el, block, state, overlay) {
    el.draggable = true;
    el.ondragstart = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.stopPropagation();
      _keDraggedId = block.id;
      _keLastDropTarget = null;
      removeDropIndicator();
      e.dataTransfer.setData('text/plain', block.id);
      e.dataTransfer.setData('text/ke-bid', block.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    };
    el.ondragend = (e) => {
      el.classList.remove('dragging');
      removeDropIndicator();
      const id = _keDraggedId;
      _keDraggedId = null;
      if (!id) return;
      var slot = _keLastDropTarget;
      _keLastDropTarget = null;
      if (!slot) {
        var sidebar = overlay.querySelector('.ke-sidebar');
        if (sidebar) {
          var r = sidebar.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            removeBlock(state, id, overlay);
            playSound('delete');
            refreshCanvas(overlay, state);
            updatePreview(overlay, state);
          }
        }
        return;
      }
      var pid = slot.dataset.bid, tp = slot.dataset.slotType;
      if (pid && tp) {
        var idx = calculateDropIndex(slot, e.clientY);
        moveBlock(state, id, pid, tp, idx);
        playSound('drag');
        refreshCanvas(overlay, state);
        updatePreview(overlay, state);
      }
    };
    el.oncontextmenu = (e) => { showContextMenu(e, block, state, overlay); };
  }

  function renderTextBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#bdbdbd');
    el.style.setProperty('--b-text-color', textColorForBg('#bdbdbd'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 6px';
    // 引号切换按钮
    const quoted = block._quoted !== false;
    const quoteBtn = document.createElement('button');
    quoteBtn.textContent = '""';
    quoteBtn.className = 'ke-quote-btn-inline';
    bindTooltip(quoteBtn, quoted ? '点击取消引号' : '点击添加引号');
    quoteBtn.style.cssText = 'background:' + (quoted ? '#2ecc71' : 'rgba(255,255,255,0.1)') + ';border:none;border-radius:2px;color:#fff;font-size:9px;padding:0 4px;cursor:pointer;line-height:1.6;flex-shrink:0;font-weight:' + (quoted ? '700' : '400') + ';margin-right:2px;';
    quoteBtn.onclick = (e) => {
      e.stopPropagation();
      playSound("lightclick");
      block._quoted = block._quoted === false ? true : false;
      const q = block._quoted !== false;
      quoteBtn.style.background = q ? '#2ecc71' : 'rgba(255,255,255,0.1)';
      quoteBtn.style.fontWeight = q ? '700' : '400';
      bindTooltip(quoteBtn, q ? '点击取消引号' : '点击添加引号');
      updatePreview(overlay, state);
    };
    body.appendChild(quoteBtn);
    const inp = mk('input', 'ke-b-input', '');
    inp.value = block.values.text || '';
    inp.placeholder = '文本值...';
    inp.style.fontSize = '10px';
    inp.style.padding = '1px 4px';
    inp.style.minWidth = '40px';
    inp.oninput = () => { block.values.text = inp.value; updatePreview(overlay, state); };
    body.appendChild(inp);
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  function renderTrueBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#6b7475');
    el.style.setProperty('--b-text-color', textColorForBg('#6b7475'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 8px';
    body.innerHTML = '<span class="ke-b-label" style="font-weight:700;font-size:11px;">true</span>';
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  function renderFalseBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#6b7475');
    el.style.setProperty('--b-text-color', textColorForBg('#6b7475'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 8px';
    body.innerHTML = '<span class="ke-b-label" style="font-weight:700;font-size:11px;">false</span>';
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  function renderUnquotedBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#bdbdbd');
    el.style.setProperty('--b-text-color', textColorForBg('#bdbdbd'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 6px';
    body.innerHTML = '<span class="ke-b-label" style="font-size:9px;opacity:0.7;"># 无引号</span>';
    const inp = mk('input', 'ke-b-input', '');
    inp.value = block.values.text || '';
    inp.placeholder = '值...';
    inp.style.fontSize = '10px';
    inp.style.padding = '1px 4px';
    inp.style.minWidth = '40px';
    inp.oninput = () => { block.values.text = inp.value; updatePreview(overlay, state); };
    body.appendChild(inp);
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  function renderListBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#888888');
    el.style.setProperty('--b-text-color', textColorForBg('#888888'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 6px';
    body.innerHTML = '<span class="ke-b-label" style="font-size:9px;opacity:0.7;">[ ] 列表</span>';
    // 子项插槽
    const slot = document.createElement('div');
    slot.className = 'ke-b-slot';
    slot.style.display = 'inline-flex';
    slot.style.flexWrap = 'wrap';
    slot.style.gap = '2px';
    slot.style.padding = '2px';
    slot.style.minWidth = '60px';
    slot.style.minHeight = '20px';
    slot.dataset.slotType = 'then';
    slot.dataset.bid = block.id;
    const items = block.thenBlocks || [];
    if (items.length === 0) {
      slot.classList.add('ke-b-slot-empty');
      slot.textContent = '+';
      bindTooltip(slot, SLOT_HELP, true);
    } else {
      for (const child of items) {
        slot.appendChild(renderBlock(child, state, overlay, true));
      }
      var addBtn = document.createElement('span');
      addBtn.className = 'ke-slot-add-btn';
      addBtn.textContent = '+';
      bindTooltip(addBtn, SLOT_HELP, true);
      addBtn.onclick = (e) => {
        e.stopPropagation();
        handleSlotClick(e, block, 'then', state, overlay);
      };
      slot.appendChild(addBtn);
    }
    slot.onclick = (e) => {
      if (e.target === slot) {
        handleSlotClick(e, block, 'then', state, overlay);
      }
    };
    makeDropTarget(slot, state, overlay);
    body.appendChild(slot);
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  function renderBraceBlock(block, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-b ke-b-value';
    el.style.setProperty('--b-color', '#555555');
    el.style.setProperty('--b-text-color', textColorForBg('#555555'));
    el.dataset.bid = block.id;
    _setupDrag(el, block, state, overlay);
    const body = document.createElement('div');
    body.className = 'ke-b-body';
    body.style.padding = '2px 6px';
    body.innerHTML = '<span class="ke-b-label" style="font-size:9px;opacity:0.7;">{ } 动作组</span>';
    // 子动作插槽
    const slot = document.createElement('div');
    slot.className = 'ke-b-slot';
    slot.style.display = 'inline-flex';
    slot.style.flexWrap = 'wrap';
    slot.style.gap = '2px';
    slot.style.padding = '2px';
    slot.style.minWidth = '60px';
    slot.style.minHeight = '20px';
    slot.dataset.slotType = 'then';
    slot.dataset.bid = block.id;
    const items = block.thenBlocks || [];
    if (items.length === 0) {
      slot.classList.add('ke-b-slot-empty');
      slot.textContent = '+';
      bindTooltip(slot, SLOT_HELP, true);
    } else {
      for (const child of items) {
        slot.appendChild(renderBlock(child, state, overlay, true));
      }
      var addBtn = document.createElement('span');
      addBtn.className = 'ke-slot-add-btn';
      addBtn.textContent = '+';
      bindTooltip(addBtn, SLOT_HELP, true);
      addBtn.onclick = (e) => {
        e.stopPropagation();
        handleSlotClick(e, block, 'then', state, overlay);
      };
      slot.appendChild(addBtn);
    }
    slot.onclick = (e) => {
      if (e.target === slot) {
        handleSlotClick(e, block, 'then', state, overlay);
      }
    };
    makeDropTarget(slot, state, overlay);
    body.appendChild(slot);
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.style.fontSize = '8px';
    delBtn.style.padding = '1px 4px';
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, block.id, overlay); };
    body.appendChild(delBtn);
    el.appendChild(body);
    return el;
  }

  // ============================================
  // 入口积木渲染
  // ============================================
  function renderEntryBlock(entry, state, overlay) {
    const el = document.createElement('div');
    el.className = 'ke-entry';
    el.dataset.bid = entry.id;

    // Header
    const header = document.createElement('div');
    header.className = 'ke-entry-header';
    if (entry.entryType === 'definition') {
      header.innerHTML = '<span class="ke-entry-icon">📦</span> def';
      const nameInp = mk('input', 'ke-entry-name', '');
      nameInp.value = entry.defName || 'main';
      nameInp.oninput = () => { entry.defName = nameInp.value; updatePreview(overlay, state); };
      header.appendChild(nameInp);
      header.appendChild(mk('span', '', '='));
    } else {
      header.innerHTML = '<span class="ke-entry-icon">📥</span> 入口 <span class="ke-entry-sub">普通</span>';
    }
    var delBtn = mk("button", "ke-b-del", "✕");
    delBtn.onclick = () => { playSound("lightclick"); removeBlock(state, entry.id, overlay); };
    header.appendChild(delBtn);
    el.appendChild(header);

    // Body with slot
    const body = document.createElement('div');
    body.className = 'ke-entry-body';
    body.appendChild(mkEntrySlot(entry, state, overlay));
    el.appendChild(body);

    return el;
  }

  function mkEntrySlot(entry, state, overlay) {
    const slot = document.createElement('div');
    slot.className = 'ke-entry-slot';
    slot.dataset.slotType = 'entry';
    slot.dataset.bid = entry.id;

    const items = entry.thenBlocks || [];
    if (items.length === 0) {
      slot.classList.add('ke-entry-slot-empty');
      slot.textContent = '+ 拖入或点击添加积木';
      bindTooltip(slot, SLOT_HELP, true);
    } else {
      for (const item of items) {
        slot.appendChild(renderBlock(item, state, overlay, true));
      }
    }

    slot.onclick = (e) => {
      if (e.target === slot) {
        playSound('lightclick');
        handleSlotClick(e, entry, 'entry', state, overlay);
      }
    };
    // 拖拽支持
    makeDropTarget(slot, state, overlay);

    return slot;
  }

  // 拖拽目标通用处理
  function makeDropTarget(el, state, overlay) {
    el.ondragover = (e) => { e.preventDefault(); el.classList.add('drag-over'); _keLastDropTarget = el; };
    el.ondragleave = () => { el.classList.remove('drag-over'); };
    el.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
      const parentId = el.dataset.bid;
      const slotType = el.dataset.slotType;
      // 处理从左侧积木栏拖入
      const newId = e.dataTransfer.getData('text/ke-new');
      if (newId && parentId && slotType) {
        const action = _actions.find(a => a.id === newId);
        if (action) {
          addBlock(overlay, state, action, parentId, slotType);
          refreshCanvas(overlay, state);
          updatePreview(overlay, state);
        }
        return;
      }
      // 处理从暂存区拖入（代码字符串），积木拖拽统一由 dragend 处理
      const code = e.dataTransfer.getData('text/ke-code');
      if (!code) return;
      if (parentId && slotType) {
        const parent = findBlock(state.blocks, parentId);
        if (parent) {
          const b = findOrCreateActionBlock(code) || createCustomBlock(code);
          if (slotType === 'entry' || slotType === 'then') parent.thenBlocks.push(b);
          else if (slotType === 'cond') parent.condBlocks.push(b);
          else if (slotType === 'else') parent.elseBlocks.push(b);
          else if (slotType.startsWith('val-')) {
            const key = slotType.slice(4);
            if (!parent._actSlots) parent._actSlots = {};
            if (!parent._actSlots[key]) parent._actSlots[key] = [];
            parent._actSlots[key].push(b);
          } else if (slotType.startsWith('branch-')) {
            const idx = parseInt(slotType.slice(7), 10);
            if (!parent._whenBranches) parent._whenBranches = [];
            if (!parent._whenBranches[idx]) parent._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
            if (!parent._whenBranches[idx].blocks) parent._whenBranches[idx].blocks = [];
            parent._whenBranches[idx].blocks.push(b);
          } else if (slotType.startsWith('wcond-')) {
            const idx = parseInt(slotType.slice(6), 10);
            if (!parent._whenBranches) parent._whenBranches = [];
            if (!parent._whenBranches[idx]) parent._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
            if (!parent._whenBranches[idx].condBlocks) parent._whenBranches[idx].condBlocks = [];
            parent._whenBranches[idx].condBlocks.push(b);
          }
        }
        refreshCanvas(overlay, state);
        updatePreview(overlay, state);
      }
    };
  }
  function handleSlotClick(e, block, slotType, state, overlay) {
    if (e.ctrlKey && e.shiftKey) {
      const act = _actions.find(a => a.id === '__list__');
      if (act) addBlock(overlay, state, act, block.id, slotType);
    } else if (e.shiftKey) {
      const act = _actions.find(a => a.id === '__brace__');
      if (act) addBlock(overlay, state, act, block.id, slotType);
    } else if (e.ctrlKey) {
      const ta = _actions.find(a => a.id === '__text__');
      if (ta) addBlock(overlay, state, ta, block.id, slotType);
    } else {
      showToolbox(overlay, state, block.id, slotType);
    }
  }
  function createActionParamWidget(block, param, slotType, state, overlay) {
    const key = param.key || slotType.replace('val-', '');
    const wrapper = document.createElement('div');
    wrapper.className = 'ke-action-param';
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:2px;vertical-align:middle;';

    // 引号切换按钮（默认隐藏，可在设置中开启）
    const showQuote = _savedSettings.showQuoteBtn === true;
    if (showQuote) {
      const quoteBtn = document.createElement('button');
      const isQuoted = block._actionQuoted && block._actionQuoted[key] === true;
      quoteBtn.textContent = '""';
      quoteBtn.className = 'ke-quote-btn';
      bindTooltip(quoteBtn, isQuoted ? '点击取消引号' : '点击添加引号');
      quoteBtn.style.cssText = 'background:' + (isQuoted ? '#2ecc71' : 'rgba(255,255,255,0.1)') + ';border:none;border-radius:2px;color:#fff;font-size:9px;padding:0 4px;cursor:pointer;line-height:1.6;flex-shrink:0;font-weight:' + (isQuoted ? '700' : '400') + ';';
      quoteBtn.onclick = (e) => {
        e.stopPropagation();
        playSound('lightclick');
        if (!block._actionQuoted) block._actionQuoted = {};
        const current = block._actionQuoted[key] === true;
        block._actionQuoted[key] = current ? false : true;
        quoteBtn.style.background = block._actionQuoted[key] === true ? '#2ecc71' : 'rgba(255,255,255,0.1)';
        quoteBtn.style.fontWeight = block._actionQuoted[key] === true ? '700' : '400';
        bindTooltip(quoteBtn, block._actionQuoted[key] === true ? '点击取消引号' : '点击添加引号');
        updatePreview(overlay, state);
      };
      wrapper.appendChild(quoteBtn);
    }

    // 积木插槽（点击插槽打开工具箱选择积木）
    const slot = mkSlot(block, slotType, state, overlay);
    wrapper.appendChild(slot);

    return wrapper;
  }

  // 创建插槽
  function mkSlot(block, type, state, overlay) {
    const slot = document.createElement('div');
    slot.className = 'ke-b-slot';
    slot.dataset.slotType = type;
    slot.dataset.bid = block.id;

    let items = [];
    if (type === 'cond') items = block.condBlocks || [];
    else if (type === 'then') items = block.thenBlocks || [];
    else if (type === 'else') items = block.elseBlocks || [];
    else if (type.startsWith('val-')) {
      const k = type.slice(4);
      if (block._actSlots && block._actSlots[k]) items = block._actSlots[k];
      else items = [];
    }

    if (items.length === 0) {
      slot.classList.add('ke-b-slot-empty');
      slot.textContent = '+';
      bindTooltip(slot, SLOT_HELP, true);
    } else {
      for (const item of items) {
        slot.appendChild(renderBlock(item, state, overlay, true));
      }
      // 常驻"+"按钮
      var addBtn = document.createElement('span');
      addBtn.className = 'ke-slot-add-btn';
      addBtn.textContent = '+';
      bindTooltip(addBtn, SLOT_HELP, true);
      addBtn.onclick = (e) => {
        e.stopPropagation();
        if (e.ctrlKey && e.shiftKey) {
          const act = _actions.find(a => a.id === '__list__');
          if (act) addBlock(overlay, state, act, block.id, type);
        } else if (e.shiftKey) {
          const act = _actions.find(a => a.id === '__brace__');
          if (act) addBlock(overlay, state, act, block.id, type);
        } else if (e.ctrlKey) {
          const ta = _actions.find(a => a.id === '__text__');
          if (ta) addBlock(overlay, state, ta, block.id, type);
        } else {
          wrapSlotInBrace(block, type, state, overlay);
        }
      };
      slot.appendChild(addBtn);
    }

    slot.onclick = (e) => {
      if (e.target === slot) {
        handleSlotClick(e, block, type, state, overlay);
      }
    };
    makeDropTarget(slot, state, overlay);
    return slot;
  }

  function mk(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    return el;
  }

  // ============================================
  // 块操作
  // ============================================

  // 将槽位中的现有积木合并到一个大括号积木中
  function wrapSlotInBrace(parent, slotType, state, overlay) {
    let items;
    if (slotType === 'then' || slotType === 'entry') items = parent.thenBlocks;
    else if (slotType === 'cond') items = parent.condBlocks;
    else if (slotType === 'else') items = parent.elseBlocks;
    else if (slotType.startsWith('val-')) {
      const key = slotType.slice(4);
      if (parent._actSlots && parent._actSlots[key]) items = parent._actSlots[key];
    }
    if (!items || items.length === 0) return;

    _pushUndo(state);
    const brace = createBraceBlock();
    brace.thenBlocks = items.splice(0);
    items.push(brace);
    refreshCanvas(overlay, state);
    updatePreview(overlay, state);
  }

  function addBlock(overlay, state, action, parentId, slotType, preferredCat, premadeBlock) {
    if (!action) return;
    _pushUndo(state);
    let b = premadeBlock;
    if (!b) {
      if (action.id === '__text__') b = createTextBlock();
      else if (action.id === '__true__') b = createTrueBlock();
      else if (action.id === '__false__') b = createFalseBlock();
      else if (action.id === '__list__') b = createListBlock();
      else if (action.id === '__brace__') b = createBraceBlock();
      else b = createBlock(action);
    }
    if (!premadeBlock && preferredCat) b._preferredCat = preferredCat;
    if (parentId && slotType) {
      const parent = findBlock(state.blocks, parentId);
      if (parent) {
        if (slotType === 'entry' || slotType === 'then') parent.thenBlocks.push(b);
        else if (slotType === 'cond') {
          if (parent._actionLiterals) delete parent._actionLiterals['condition'];
          parent.condBlocks.push(b);
        }
        else if (slotType === 'else') parent.elseBlocks.push(b);
        else if (slotType.startsWith('val-')) {
          const key = slotType.slice(4);
          if (parent._actionLiterals) delete parent._actionLiterals[key];
          if (!parent._actSlots) parent._actSlots = {};
          if (!parent._actSlots[key]) parent._actSlots[key] = [];
          parent._actSlots[key].push(b);
        } else if (slotType.startsWith('branch-')) {
          const idx = parseInt(slotType.slice(7), 10);
          if (!parent._whenBranches) parent._whenBranches = [];
          if (!parent._whenBranches[idx]) parent._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
          if (!parent._whenBranches[idx].blocks) parent._whenBranches[idx].blocks = [];
          parent._whenBranches[idx].blocks.push(b);
        } else if (slotType.startsWith('wcond-')) {
          const idx = parseInt(slotType.slice(6), 10);
          if (!parent._whenBranches) parent._whenBranches = [];
          if (!parent._whenBranches[idx]) parent._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
          if (!parent._whenBranches[idx].condBlocks) parent._whenBranches[idx].condBlocks = [];
          parent._whenBranches[idx].condBlocks.push(b);
        }
      }
    } else {
      // 没有指定父级，自动放入第一个入口
      const entry = state.blocks.find(b => b.isEntry);
      if (entry) entry.thenBlocks.push(b);
      else state.blocks.push(b);
    }
    playSound('update');
    refreshCanvas(overlay, state);
    updatePreview(overlay, state);
  }

  function removeBlock(state, bid, overlay) {
    _pushUndo(state);
    const rec = (list) => {
      const idx = list.findIndex(b => b.id === bid);
      if (idx >= 0) { list.splice(idx, 1); return true; }
      for (const b of list) {
        if (rec(b.thenBlocks || [])) return true;
        if (rec(b.elseBlocks || [])) return true;
        if (rec(b.condBlocks || [])) return true;
        if (b._whenBranches) {
          for (const br of b._whenBranches) {
            if (rec(br.blocks || [])) return true;
            if (rec(br.condBlocks || [])) return true;
          }
        }
        if (b._actSlots) {
          for (const k of Object.keys(b._actSlots)) {
            if (rec(b._actSlots[k])) return true;
          }
        }
      }
      return false;
    };
    rec(state.blocks);
    playSound('close');
    refreshCanvas(overlay, state);
    updatePreview(overlay, state);
  }

  function findBlock(list, id) {
    for (const b of list) {
      if (b.id === id) return b;
      let f = findBlock(b.thenBlocks || [], id) || findBlock(b.elseBlocks || [], id) || findBlock(b.condBlocks || [], id);
      if (!f && b._whenBranches) {
        for (const br of b._whenBranches) {
          f = findBlock(br.blocks || [], id) || findBlock(br.condBlocks || [], id);
          if (f) break;
        }
      }
      if (!f && b._actSlots) {
        for (const k of Object.keys(b._actSlots)) {
          f = findBlock(b._actSlots[k], id);
          if (f) break;
        }
      }
      if (f) return f;
    }
    return null;
  }

  function calculateDropIndex(slot, clientY) {
    var children = [];
    for (var ci = 0; ci < slot.children.length; ci++) {
      var ch = slot.children[ci];
      if (ch.classList.contains('ke-b')) children.push(ch);
    }
    if (children.length === 0) return -1;
    for (var i = 0; i < children.length; i++) {
      var rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return i;
      }
    }
    return children.length;
  }

  function moveBlock(state, blockId, targetParentId, targetSlotType, insertIndex) {
    _pushUndo(state);
    let movedBlock = null;
    let sourceDesc = 'unknown';
    const extract = (list) => {
      const idx = list.findIndex(b => b.id === blockId);
      if (idx >= 0) { movedBlock = list.splice(idx, 1)[0]; return true; }
      for (const b of list) {
        if (b.isEntry) {
          if (extract(b.thenBlocks || [])) { sourceDesc = b.actionId + '.then'; return true; }
          if (extract(b.elseBlocks || [])) { sourceDesc = b.actionId + '.else'; return true; }
          if (extract(b.condBlocks || [])) { sourceDesc = b.actionId + '.cond'; return true; }
          continue;
        }
        if (extract(b.thenBlocks || [])) { sourceDesc = b.actionId + '.then'; return true; }
        if (extract(b.elseBlocks || [])) { sourceDesc = b.actionId + '.else'; return true; }
        if (extract(b.condBlocks || [])) { sourceDesc = b.actionId + '.cond'; return true; }
        if (b._actSlots) {
          for (const k of Object.keys(b._actSlots)) {
            if (extract(b._actSlots[k])) { sourceDesc = b.actionId + '._act.' + k; return true; }
          }
        }
        if (b._whenBranches) {
          for (let bi = 0; bi < b._whenBranches.length; bi++) {
            if (extract(b._whenBranches[bi].blocks || [])) { sourceDesc = b.actionId + '.branch.' + bi; return true; }
            if (extract(b._whenBranches[bi].condBlocks || [])) { sourceDesc = b.actionId + '.wcond.' + bi; return true; }
          }
        }
      }
      return false;
    };
    if (!extract(state.blocks)) {
      console.log('[KE] moveBlock FAILED to find block ' + blockId.slice(-8));
      return;
    }

    console.log('[KE] moveBlock extracted ' + movedBlock.actionId + ' from ' + sourceDesc + ' target=' + targetSlotType + '@' + targetParentId.slice(-8) + ' idx=' + insertIndex);

    const target = findBlock(state.blocks, targetParentId);
    if (!target) { state.blocks.push(movedBlock); console.log('[KE] moveBlock target not found, pushed to root'); return; }

    function insertInto(arr) {
      if (arr && insertIndex !== undefined && insertIndex >= 0 && insertIndex <= arr.length) {
        arr.splice(insertIndex, 0, movedBlock);
      } else if (arr) {
        arr.push(movedBlock);
      }
    }

    if (targetSlotType === 'entry' || targetSlotType === 'then') insertInto(target.thenBlocks);
    else if (targetSlotType === 'cond') {
      if (target._actionLiterals) delete target._actionLiterals['condition'];
      insertInto(target.condBlocks);
    }
    else if (targetSlotType === 'else') insertInto(target.elseBlocks);
    else if (targetSlotType.startsWith('val-')) {
      const key = targetSlotType.slice(4);
      if (target._actionLiterals) delete target._actionLiterals[key];
      if (!target._actSlots) target._actSlots = {};
      if (!target._actSlots[key]) target._actSlots[key] = [];
      insertInto(target._actSlots[key]);
    } else if (targetSlotType.startsWith('branch-')) {
      const idx = parseInt(targetSlotType.slice(7), 10);
      if (!target._whenBranches) target._whenBranches = [];
      if (!target._whenBranches[idx]) target._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
      if (!target._whenBranches[idx].blocks) target._whenBranches[idx].blocks = [];
      insertInto(target._whenBranches[idx].blocks);
    } else if (targetSlotType.startsWith('wcond-')) {
      const idx = parseInt(targetSlotType.slice(6), 10);
      if (!target._whenBranches) target._whenBranches = [];
      if (!target._whenBranches[idx]) target._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
      if (!target._whenBranches[idx].condBlocks) target._whenBranches[idx].condBlocks = [];
      insertInto(target._whenBranches[idx].condBlocks);
    }
    console.log('[KE] moveBlock DONE');
  }

  function pasteIntoSlot(copy, parentBlock, slotType) {
    if (slotType === 'entry' || slotType === 'then') parentBlock.thenBlocks.push(copy);
    else if (slotType === 'cond') parentBlock.condBlocks.push(copy);
    else if (slotType === 'else') parentBlock.elseBlocks.push(copy);
    else if (slotType.startsWith('val-')) {
      const key = slotType.slice(4);
      if (!parentBlock._actSlots) parentBlock._actSlots = {};
      if (!parentBlock._actSlots[key]) parentBlock._actSlots[key] = [];
      parentBlock._actSlots[key].push(copy);
    } else if (slotType.startsWith('branch-')) {
      const idx = parseInt(slotType.slice(7), 10);
      if (!parentBlock._whenBranches) parentBlock._whenBranches = [];
      if (!parentBlock._whenBranches[idx]) parentBlock._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
      if (!parentBlock._whenBranches[idx].blocks) parentBlock._whenBranches[idx].blocks = [];
      parentBlock._whenBranches[idx].blocks.push(copy);
    } else if (slotType.startsWith('wcond-')) {
      const idx = parseInt(slotType.slice(6), 10);
      if (!parentBlock._whenBranches) parentBlock._whenBranches = [];
      if (!parentBlock._whenBranches[idx]) parentBlock._whenBranches[idx] = { id: uid(), condition: '', condBlocks: [], blocks: [] };
      if (!parentBlock._whenBranches[idx].condBlocks) parentBlock._whenBranches[idx].condBlocks = [];
      parentBlock._whenBranches[idx].condBlocks.push(copy);
    }
  }

  function showContextMenu(e, block, state, overlay) {
    e.preventDefault();
    e.stopPropagation();
    const old = document.querySelector('.ke-ctx-menu');
    if (old) old.remove();
    const menu = document.createElement('div');
    menu.className = 'ke-ctx-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
        menu.innerHTML =
      '<div class="ke-ctx-item" data-action="detail"><span>📋</span> 查看描述</div>' +
      '<div class="ke-ctx-sep"></div>' +
      '<div class="ke-ctx-item" data-action="copy"><span>📋</span> 复制<span class="ke-ctx-shortcut">Ctrl+C</span></div>' +
      '<div class="ke-ctx-item" data-action="paste"><span>📄</span> 粘贴<span class="ke-ctx-shortcut">Ctrl+V</span></div>' +
      '<div class="ke-ctx-sep"></div>' +
      '<div class="ke-ctx-item" data-action="save"><span>💾</span> 保存语句</div>' +
      '<div class="ke-ctx-sep"></div>' +
      '<div class="ke-ctx-item ke-ctx-item-danger" data-action="delete"><span>🗑</span> 删除<span class="ke-ctx-shortcut">Del</span></div>';
    menu.querySelector('[data-action="copy"]').onclick = () => {
      playSound('click');
      _clipboard = { _type: 'block', block: cloneBlock(block) };
      console.log('[KE] 复制画布积木:', block.actionId);
      menu.remove();
    };
    menu.querySelector('[data-action="paste"]').onclick = () => {
      playSound('click');
      menu.remove();
      if (!_clipboard) { console.log('[KE] 粘贴失败: _clipboard 为空'); return; }
      console.log('[KE] 粘贴, _clipboard:', _clipboard._type, _clipboard._type === 'act' ? _clipboard.action.id : 'block');
      const blockEl = e.target.closest('.ke-b');
      const slotEl = blockEl ? blockEl.parentNode.closest('.ke-b-slot, .ke-entry-slot') : null;
      const pid = slotEl ? slotEl.dataset.bid : null;
      const stp = slotEl ? slotEl.dataset.slotType : null;
      console.log('[KE] 槽位检测:', !!slotEl, 'pid:', pid ? pid.slice(-8) : null, 'stp:', stp);
      _pushUndo(state);
      if (_clipboard._type === 'act') {
        console.log('[KE] 粘贴动作:', _clipboard.action.id);
        addBlock(overlay, state, _clipboard.action, pid, stp, null);
      } else if (_clipboard._type === 'block') {
        const copy = cloneBlock(_clipboard.block);
        resetBlockIds(copy);
        if (pid && stp) {
          const parentBlock = findBlock(state.blocks, pid);
          if (parentBlock) {
            pasteIntoSlot(copy, parentBlock, stp);
            refreshCanvas(overlay, state);
            updatePreview(overlay, state);
            return;
          }
        }
        const entry = state.blocks.find(b => b.isEntry);
        if (entry) {
          entry.thenBlocks.push(copy);
          refreshCanvas(overlay, state);
          updatePreview(overlay, state);
        }
      }
    };    
    menu.querySelector('[data-action="detail"]').onclick = () => {
      menu.remove();
      showBlockDetail(block, state);
    };
    menu.querySelector('[data-action="save"]').onclick = () => {
      menu.remove();
      const code = blockToCode(block, '');
      const name = prompt('保存语句名称:', block.name || block.actionId || '积木');
      if (name && code) {
        playSound('save');
        _savedBlocks.push({ name, code, id: Date.now().toString(36) });
        saveSavedBlocks();
      }
    };
    menu.querySelector('[data-action="delete"]').onclick = () => {
      menu.remove();
      removeBlock(state, block.id, overlay);
    };
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function closeCtx(e2) {
        if (!menu.contains(e2.target)) { menu.remove(); document.removeEventListener('click', closeCtx); }
      });
    }, 0);
  }


  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function highlightBraces(text) {
    if (!text) return '';
    return esc(String(text)).replace(/{([^}]+)}/g, '<b class="ke-tip-highlight">{' + esc('$1') + '}</b>');
  }

  var _tipEl = null;
  function _getTip() {
    if (!_tipEl) {
      _tipEl = document.createElement('div');
      _tipEl.className = 'ke-tooltip';
      _tipEl.style.display = 'none';
      document.body.appendChild(_tipEl);
    }
    return _tipEl;
  }
  function _posTip(e) {
    var tip = _getTip();
    var x = e.clientX + 14;
    var y = e.clientY + 14;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 10) x = e.clientX - r.width - 10;
    if (y + r.height > window.innerHeight - 10) y = e.clientY - r.height - 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function showTooltip(e, content, isHtml) {
    var tip = _getTip();
    if (isHtml) tip.innerHTML = content;
    else tip.textContent = content;
    tip.style.display = 'block';
    _posTip(e);
  }
  function hideTooltip() {
    if (_tipEl) _tipEl.style.display = 'none';
  }
  function bindTooltip(el, content, isHtml) {
    el.removeAttribute('title');
    el.addEventListener('mouseenter', function(e) { showTooltip(e, content, isHtml); });
    el.addEventListener('mousemove', function(e) { if (_tipEl && _tipEl.style.display !== 'none' && _tipEl.style.display !== '') _posTip(e); });
    el.addEventListener('mouseleave', hideTooltip);
  }
  // 语言包查找 (key 不存在时回退中文源文案); I18N 未加载时直接用回退
  function keI18n(key, fb) {
    try {
      if (window.I18N && window.I18N.t) {
        var v = window.I18N.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) { /* ignore */ }
    return fb;
  }

  function showBlockDetail(block, state) {
    var old = document.querySelector('.ke-detail-overlay');
    if (old) old.remove();
    var actionDef = _actions.find(function(a) { return a.id === block.actionId; });
    var overlay2 = document.createElement('div');
    overlay2.className = 'ke-detail-overlay';
    var modal = document.createElement('div');
    modal.className = 'ke-detail-modal';
    var html = '<div class="ke-detail-header"><span class="ke-detail-title">积木详情</span><button class="ke-detail-close">✕</button></div><div class="ke-detail-body">';
    if (actionDef) {
      var fields = [];
      fields.push({ label: 'ID', value: actionDef.id });
      fields.push({ label: '名称', value: actionDef.name });
      fields.push({ label: '提供者', value: actionDef._module || actionDef.provider });
      fields.push({ label: '类型', value: actionDef.type === 'private' ? '私有' : '公有' });
      var catStr = (actionDef.categories || []).map(function(c) { var g = CAT_GROUP[c] || c; return g + '-' + c; }).join(', ');
      fields.push({ label: '分类', value: catStr });
      fields.push({ label: '语法', value: actionDef.syntax, mono: true, highlight: true });
      if (actionDef.example) fields.push({ label: '示例', value: actionDef.example, mono: true });
      if (actionDef.semantic) fields.push({ label: '语义', value: actionDef.semantic });
      if (actionDef.description) fields.push({ label: '描述', value: actionDef.description, highlight: true });
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (!f.value) continue;
        html += '<div class="ke-detail-field"><span class="ke-detail-label">' + escapeHtml(f.label) + '</span>';
        var val = f.highlight ? highlightBraces(f.value) : escapeHtml(f.value);
        if (f.mono) {
          html += '<code class="ke-detail-value ke-detail-mono">' + val + '</code>';
        } else {
          html += '<span class="ke-detail-value">' + val + '</span>';
        }
        html += '</div>';
      }
    } else {
      html += '<div class="ke-detail-field"><span class="ke-detail-label">ID</span><span class="ke-detail-value">' + escapeHtml(block.id) + '</span></div>';
      html += '<div class="ke-detail-field"><span class="ke-detail-label">Action ID</span><span class="ke-detail-value">' + escapeHtml(block.actionId || '—') + '</span></div>';
    }
    html += '</div>';
    modal.innerHTML = html;
    overlay2.appendChild(modal);
    document.body.appendChild(overlay2);
    modal.querySelector('.ke-detail-close').onclick = function() { overlay2.remove(); };
    overlay2.onclick = function(e) { if (e.target === overlay2) overlay2.remove(); };
  }

  function findParentBlock(blocks, childId) {
    for (const b of blocks) {
      if (b.thenBlocks && b.thenBlocks.some(c => c.id === childId)) return b;
      if (b.elseBlocks && b.elseBlocks.some(c => c.id === childId)) return b;
      if (b.condBlocks && b.condBlocks.some(c => c.id === childId)) return b;
      if (b._actSlots) {
        for (const k of Object.keys(b._actSlots)) {
          if (b._actSlots[k].some(c => c.id === childId)) return b;
        }
      }
      let found = findParentBlock(b.thenBlocks || [], childId) || findParentBlock(b.elseBlocks || [], childId) || findParentBlock(b.condBlocks || [], childId);
      if (b._actSlots) {
        for (const k of Object.keys(b._actSlots)) {
          if (!found) found = findParentBlock(b._actSlots[k], childId);
        }
      }
      if (found) return found;
    }
    return null;
  }

  function refreshCanvas(overlay, state) {
    renderCanvas(overlay, state);
    updateCount(overlay, state);
    // 初始化输入框宽度
    requestAnimationFrame(() => {
      overlay.querySelectorAll('.ke-b-input, .ke-branch-input').forEach(el => {
        el.style.width = '1px';
        el.style.width = Math.max(40, el.scrollWidth) + 'px';
      });
    });
    if (state.autoSync) {
      // 自动同步积木到 Kether 代码
      const entries = state.blocks.filter(b => b.actionId === '__entry__');
      const code = generateCode(entries);
      state.onConfirm(code);
    }
  }

  function updatePreview(overlay, state) {
    const fc = overlay.querySelector('#ke-fc');
    if (fc) fc.textContent = generateCode(state.blocks) || '(空)';
  }

  function countBlocks(state) {
    return state.blocks.reduce((sum, b) => {
      if (b.isEntry) return sum + (b.thenBlocks || []).length;
      return sum + 1;
    }, 0);
  }
  function updateCount(overlay, state) {
    const c = overlay.querySelector('#ke-count');
    if (c) c.textContent = countBlocks(state);
    const ec = overlay.querySelector('#ke-ec');
    if (ec) ec.textContent = state.blocks.length;
  }

  // ============================================
  // 动作选择器弹窗
  // ============================================
  function showToolbox(overlay, state, parentId, slotType, clearLiteralKey) {
    const old = document.querySelector('.ke-toolbox');
    if (old) old.remove();

    const tb = document.createElement('div');
    tb.className = 'ke-toolbox';
    tb.innerHTML = '<div class="ke-toolbox-header">选择动作</div><button class="ke-toolbox-close">✕</button><div class="ke-toolbox-search"><input id="ke-tb-s" placeholder="搜索..." autofocus></div><div class="ke-toolbox-list" id="ke-tb-list"></div>';
    playSound('click');

    function render(q) {
      const list = tb.querySelector('#ke-tb-list');
      let acts = _actions;
      if (q) {
        const ql = q.toLowerCase();
        acts = acts.filter(a => {
          const nameMatch = a.name.toLowerCase().includes(ql) || a.id.toLowerCase().includes(ql);
          const syntaxMatch = a.syntax && a.syntax.toLowerCase().replace(/[{}]/g, '').includes(ql);
          const descMatch = a.description && a.description.toLowerCase().replace(/[{}]/g, '').includes(ql);
          return nameMatch || syntaxMatch || descMatch;
        });
        acts.sort((a, b) => {
          const score = (act) => {
            if (act.name.toLowerCase().includes(ql) || act.id.toLowerCase().includes(ql)) return 0;
            if (act.syntax && act.syntax.toLowerCase().replace(/[{}]/g, '').includes(ql)) return 1;
            return 2;
          };
          return score(a) - score(b);
        });
      }
      list.innerHTML = acts.map(a => '<div class="ke-toolbox-item" data-id="' + a.id + '"><span style="width:4px;height:14px;border-radius:2px;background:' + a._providerColor + ';flex-shrink:0;"></span><span style="font-weight:500;">' + esc(a.name) + '</span><span style="opacity:0.4;font-size:9px;">' + esc(a.provider) + '</span></div>').join('') || '<div style="padding:20px;text-align:center;color:var(--color-text-tertiary);">无匹配</div>';
      list.querySelectorAll('.ke-toolbox-item').forEach(el => {
        el.onclick = () => {
          if (clearLiteralKey && parentId) {
            const p = findBlock(state.blocks, parentId);
            if (p && p._actionLiterals) delete p._actionLiterals[clearLiteralKey];
          }
          const act = _actions.find(a => a.id === el.dataset.id);
          if (act) { playSound('select'); addBlock(overlay, state, act, parentId, slotType); }
          tb.remove();
        };
        el.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const act = _actions.find(a => a.id === el.dataset.id);
          if (!act) return;
          var oldMenu = document.querySelector('.ke-ctx-menu');
          if (oldMenu) oldMenu.remove();
          var menu = document.createElement('div');
          menu.className = 'ke-ctx-menu';
          menu.style.left = e.clientX + 'px';
          menu.style.top = e.clientY + 'px';
          menu.innerHTML =
            '<div class="ke-ctx-item" data-act="copy-block"><span>📋</span> 复制积木</div>' +
            '<div class="ke-ctx-sep"></div>' +
            '<div class="ke-ctx-item" data-act="view-detail"><span>📖</span> 查看描述</div>' +
            '<div class="ke-ctx-sep"></div>' +
            '<div class="ke-ctx-item" data-act="fav-block"><span>⭐</span> 添加为常用积木</div>';
          menu.querySelector('[data-act="copy-block"]').onclick = function() {
            playSound('click');
            _clipboard = { _type: 'act', action: act };
            menu.remove();
          };
          menu.querySelector('[data-act="view-detail"]').onclick = function() {
            playSound('click');
            menu.remove();
            showBlockDetail({ actionId: act.id }, null);
          };
          menu.querySelector('[data-act="fav-block"]').onclick = function() {
            playSound('click');
            menu.remove();
            addUserCommonBlock(act.name, act.syntax);
          };
          document.body.appendChild(menu);
          var closeCtx = function(e2) {
            if (!menu.contains(e2.target)) { menu.remove(); document.removeEventListener('mousedown', closeCtx); }
          };
          setTimeout(function() { document.addEventListener('mousedown', closeCtx); }, 0);
        };
      });
    }
    render('');
    tb.querySelector('#ke-tb-s').oninput = (e) => render(e.target.value);
    tb.querySelector('.ke-toolbox-close').onclick = () => { playSound('close'); tb.remove(); };
    document.body.appendChild(tb);
  }

  // ============================================
  // 暂存区 & 已保存积木
  // ============================================
  function renderStashSidebar(overlay, state) {
    const list = overlay.querySelector('#ke-stash-list');
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < _stashBlocks.length; i++) {
      const item = _stashBlocks[i];
      const el = document.createElement('div');
      el.className = 'ke-stash-item';
      el.textContent = item.name || item.code;
      bindTooltip(el, item.code);
      el.draggable = true;
      el.ondragstart = (e) => {
        e.dataTransfer.setData('text/ke-code', item.code);
        e.dataTransfer.effectAllowed = 'copy';
      };
      el.onclick = () => {
        playSound('click');
        // 插入到第一个入口
        const entry = state.blocks.find(b => b.isEntry);
        if (entry) {
          const b = findOrCreateActionBlock(item.code) || createCustomBlock(item.code);
          entry.thenBlocks.push(b);
          refreshCanvas(overlay, state);
          updatePreview(overlay, state);
        }
      };
      const del = document.createElement('button');
      del.className = 'ke-stash-item-del';
      del.textContent = '✕';
      del.onclick = (e) => {
        e.stopPropagation();
        playSound('close');
        _stashBlocks.splice(i, 1);
        saveStashBlocks();
        renderStashSidebar(overlay, state);
      };
      el.appendChild(del);
      list.appendChild(el);
    }
  }

  function renderSavedSidebar(overlay, state) {
    const section = overlay.querySelector('#ke-saved-section');
    const list = overlay.querySelector('#ke-saved-list');
    if (!list || !section) return;
    section.style.display = _savedBlocks.length ? '' : 'none';
    list.innerHTML = '';
    for (let i = 0; i < _savedBlocks.length; i++) {
      const item = _savedBlocks[i];
      const el = document.createElement('div');
      el.className = 'ke-saved-item';
      el.textContent = item.name || item.code;
      bindTooltip(el, item.code);
      el.onclick = () => {
        playSound('click');
        const entry = state.blocks.find(b => b.isEntry);
        if (entry) {
          const b = findOrCreateActionBlock(item.code) || createCustomBlock(item.code);
          entry.thenBlocks.push(b);
          refreshCanvas(overlay, state);
          updatePreview(overlay, state);
        }
      };
      const del = document.createElement('button');
      del.className = 'ke-saved-item-del';
      del.textContent = '✕';
      del.onclick = (e) => {
        e.stopPropagation();
        playSound('close');
        _savedBlocks.splice(i, 1);
        saveSavedBlocks();
        renderSavedSidebar(overlay, state);
      };
      el.appendChild(del);
      list.appendChild(el);
    }
  }

  function setupStashDrop(overlay, state) {
    const dropZone = overlay.querySelector('#ke-stash-drop');
    if (!dropZone) return;
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => { dropZone.classList.remove('drag-over'); };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      playSound('drag');
      const bid = e.dataTransfer.getData('text/ke-bid');
      if (bid) {
        const block = findBlock(state.blocks, bid);
        if (block) {
          const code = blockToCode(block, '');
          const name = block.name || block.actionId || '积木';
          _stashBlocks.push({ name, code, id: Date.now().toString(36) });
          saveStashBlocks();
          removeBlock(state, bid, overlay);
          renderStashSidebar(overlay, state);
          updatePreview(overlay, state);
        }
      }
    };
  }

  // ============================================
  // 代码模式
  // ============================================
  function renderCodeMode(overlay, body, state) {
    body.innerHTML = '<div class="ke-code-panel"><div class="ke-workspace-header"><span>Kether 代码</span><div class="ke-workspace-actions"><button class="ke-btn" id="ke-parse">🔄 解析为积木</button></div></div><div class="ke-code-editor"><textarea id="ke-code-ta">' + esc(generateCode(state.blocks) || '') + '</textarea></div></div>';
    body.querySelector('#ke-parse').onclick = () => {
      playSound('update');
      _pushUndo(state);
      const code = body.querySelector('#ke-code-ta').value;
      const parsed = parseCodeToBlocks(code);
      // 分离 def 定义块和普通块
      const defBlocks = [];
      const normalBlocks = [];
      for (const b of parsed) {
        if (b.actionId === '__entry__') defBlocks.push(b);
        else normalBlocks.push(b);
      }
      if (defBlocks.length > 0) {
        state.blocks = defBlocks;
        if (normalBlocks.length > 0 && state.blocks[0]) {
          state.blocks[0].thenBlocks.push(...normalBlocks);
        }
      } else {
        // 保留已有入口，将解析出的积木放入第一个入口
        var entry = state.blocks.find(function (b) { return b.actionId === '__entry__'; });
        if (!entry) { entry = createEntryBlock('normal'); state.blocks.unshift(entry); }
        entry.thenBlocks = normalBlocks;
      }
      state.mode = 'visual';
      switchMode(overlay, state);
      updatePreview(overlay, state);
    };
  }

  // ============================================
  // 公开入口
  // ============================================
  async function openEditor(initialCode, onConfirm, onCancel) {
    await loadActions();
    loadPersistentData();
    const overlay = createOverlay();
    const state = {
      blocks: [],
      mode: 'visual',
      activeCategory: null,
      autoSync: _savedSettings.autoSync || false,
      settings: {
        colorMode: _savedSettings.colorMode || 'provider',
        nameMode: _savedSettings.nameMode || 'cn-en',
        showQuoteBtn: _savedSettings.showQuoteBtn === true,
        semanticMode: _savedSettings.semanticMode !== false,
      },
      onConfirm: onConfirm || (() => {}),
      onCancel: onCancel || (() => {}),
    };

    if (initialCode && initialCode.trim()) {
      const parsed = parseCodeToBlocks(initialCode);
      // 检查是否包含 def 定义
      const defBlocks = [];
      const normalBlocks = [];
      for (const b of parsed) {
        if (b.actionId === '__entry__') {
          defBlocks.push(b);
        } else {
          normalBlocks.push(b);
        }
      }
      if (defBlocks.length > 0) {
        state.blocks = defBlocks;
        // 把未包裹的块放入第一个定义入口
        if (normalBlocks.length > 0 && state.blocks[0]) {
          state.blocks[0].thenBlocks.push(...normalBlocks);
        }
      } else {
        // 没有 def 定义，全部放入一个普通入口
        const entry = createEntryBlock('normal');
        entry.thenBlocks = normalBlocks;
        state.blocks = [entry];
      }
      if (state.blocks.length === 0) {
        const entry = createEntryBlock('normal');
        if (parsed.length > 0) entry.thenBlocks = parsed;
        else entry.thenBlocks = [createCustomBlock(initialCode)];
        state.blocks = [entry];
      }
    } else {
      // 空编辑器，自动创建一个普通入口
      state.blocks = [createEntryBlock('normal')];
    }

    _state = state;
    document.body.appendChild(overlay);
    // 应用背景图（与主编辑器一致）
    applyBackgroundToOverlay(overlay);
    // 应用积木字体大小
    const editorCfg = _savedSettings._editorConfig;
    if (editorCfg && editorCfg.blockFontSize) {
      overlay.style.setProperty('--ke-font-size', editorCfg.blockFontSize + 'px');
    }
    renderHeader(overlay, state);

    const body = document.createElement('div');
    body.className = 'ke-body';
    overlay.appendChild(body);
    if (state.mode === 'visual') renderVisualMode(overlay, body, state);
    else renderCodeMode(overlay, body, state);
    updatePreview(overlay, state);

    // 捕获输入框聚焦以保存撤销快照
    overlay.addEventListener('focus', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (!e.target.classList.contains('ke-b-input') && !e.target.classList.contains('ke-b-select') && !e.target.classList.contains('ke-branch-input') && !e.target.classList.contains('ke-entry-name') && !e.target.closest('.ke-code-editor') && !e.target.closest('.ke-sidebar-search') && !e.target.closest('.ke-toolbox')) return;
        _pushUndo(state);
      }
    }, true);

    // 输入框自动宽度
    overlay.addEventListener('input', (e) => {
      if (e.target.classList.contains('ke-b-input') || e.target.classList.contains('ke-branch-input')) {
        e.target.style.width = '1px';
        e.target.style.width = Math.max(40, e.target.scrollWidth) + 'px';
      }
    }, true);

    // 追踪鼠标位置，用于粘贴定位
    overlay.addEventListener('mousemove', (e) => {
      _keMouseX = e.clientX;
      _keMouseY = e.clientY;
    });

    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+V 快捷键（仅在可视模式下）
    overlay.addEventListener('keydown', (e) => {
      if (state.mode !== 'visual') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) { _redo(state, overlay); e.preventDefault(); }
        else { _undo(state, overlay); e.preventDefault(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        _redo(state, overlay); e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (!_clipboard) { console.log('[KE] Ctrl+V: _clipboard 为空'); return; }
        console.log('[KE] Ctrl+V: type=', _clipboard._type, _clipboard._type === 'act' ? _clipboard.action.id : 'block');
        e.preventDefault();
        const el = document.elementFromPoint(_keMouseX, _keMouseY);
        const slotEl2 = el ? el.closest('.ke-b-slot, .ke-entry-slot') : null;
        const pid2 = slotEl2 ? slotEl2.dataset.bid : null;
        const stp2 = slotEl2 ? slotEl2.dataset.slotType : null;
        console.log('[KE] Ctrl+V 槽位:', !!slotEl2, 'pid:', pid2 ? pid2.slice(-8) : null, 'stp:', stp2);
        _pushUndo(state);
        if (_clipboard._type === 'act') {
          console.log('[KE] Ctrl+V 粘贴动作:', _clipboard.action.id);
          addBlock(overlay, state, _clipboard.action, pid2, stp2, null);
        } else if (_clipboard._type === 'block') {
          const copy = cloneBlock(_clipboard.block);
          resetBlockIds(copy);
          if (pid2 && stp2) {
            const parentBlock = findBlock(state.blocks, pid2);
            if (parentBlock) {
              pasteIntoSlot(copy, parentBlock, stp2);
              refreshCanvas(overlay, state);
              updatePreview(overlay, state);
              return;
            }
          }
          const entry = state.blocks.find(b => b.isEntry);
          if (entry) {
            entry.thenBlocks.push(copy);
            refreshCanvas(overlay, state);
            updatePreview(overlay, state);
          }
        }
      }
    });
  }

  // ============================================
  // 自动 Hook：给 Kether 文本框加按钮
  // ============================================
  function hookKetherInputs() {
    function tryHook(el) {
      if (el.dataset.keHooked) return;
      const ph = (el.placeholder || '').toLowerCase();
      const f = (el.dataset.qteField || '').toLowerCase();
      const parent = el.closest('.cv-field, .cv-option-then');
      const label = parent ? parent.querySelector('label') : null;
      const lt = label ? label.textContent.toLowerCase() : '';

      if (!ph.includes('kether') && !lt.includes('kether') && !lt.includes('脚本') && !f.includes('kether') && !f.includes('script')) return;

      el.dataset.keHooked = '1';
      if (parent && !parent.querySelector('.ke-open-btn')) {
        const btn = mk('button', '', '🧊');
        btn.className = 'ke-open-btn';
        bindTooltip(btn, 'Kether 积木编辑器');
        btn.style.cssText = 'padding:2px 8px;font-size:13px;cursor:pointer;border:1px solid var(--color-border);border-radius:4px;background:var(--color-bg-tertiary);color:var(--color-text-primary);flex-shrink:0;';
        btn.onclick = async (e) => {
          e.preventDefault();
          playSound("click");
          await openEditor(el.value, (code) => {
            el.value = code;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        };
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:flex-start;gap:4px;';
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
        wrap.appendChild(btn);
      }
    }

    var _keObserver = null;
    document.querySelectorAll('textarea').forEach(tryHook);
    if (_keObserver) _keObserver.disconnect();
    _keObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type !== 'childList') return;
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === 1 && n.tagName === 'TEXTAREA') tryHook(n);
          else if (n.nodeType === 1) n.querySelectorAll('textarea:not([data-ke-hooked])').forEach(tryHook);
        });
      });
    });
    _keObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookKetherInputs);
  else hookKetherInputs();

  // ============================================
  // 导出
  // ============================================
  window.KetherEditor = { open: openEditor, loadActions: loadActions };

})();
