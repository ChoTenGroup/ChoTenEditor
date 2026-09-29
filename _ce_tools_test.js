/* CraftEngine 工具冒烟测试 (无浏览器: vm + 假 DOM + fs 支撑的 electronAPI)
 * 覆盖:
 *   1) mc-assets.js / ce-mcassets.js 资源索引接入 datalist
 *   2) 字段路径 → 补全数据源 自动映射 (纹理/模型/音效/物品…)
 *   3) ce-diag.js 四级诊断 (ERROR / WARN / WEAK_WARN / INFO)
 * 运行: node _ce_tools_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mcAssets = require('./mc-assets.js');

const MC_ROOT = 'E:\\MC\\Windose\\.minecraft\\versions\\26.3\\26.3\\assets';

let fails = 0;
function check(cond, msg) {
  if (cond) console.log('PASS  ' + msg);
  else { console.log('FAIL  ' + msg); fails++; }
}

// ---------- 假 DOM ----------
const bodyClasses = { 'ce-element-picker': true };
function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    innerHTML: '',
    textContent: '',
    style: {},
    className: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); },
    },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {}, removeChild() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; },
    isConnected: false, closest() { return null; }, focus() {},
  };
}
const doc = {
  body: Object.assign(makeEl('body'), {
    classList: {
      contains(c) { return bodyClasses[c] === true; },
      add() {}, remove() {}, toggle() {},
    },
  }),
  documentElement: makeEl('html'),
  createElement: makeEl,
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
  dispatchEvent() { return true; },
};

// ---------- 假 electronAPI (真实 fs 支撑) ----------
const electronAPI = {
  readdir: async (p) => {
    try {
      const entries = await fs.promises.readdir(p, { withFileTypes: true });
      const files = entries.map(e => ({
        name: e.name, isDirectory: e.isDirectory(), path: path.join(p, e.name),
      }));
      return { success: true, files };
    } catch (e) { return { success: false, error: e.message }; }
  },
  readFile: async (p) => {
    try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; }
    catch (e) { return { success: false, error: e.message }; }
  },
  ce: { resolveProjectRoot: async () => ({ found: false }) },
  mc: {
    scanAssets: (root) => mcAssets.scanAssets(root),
    scanNamespace: async (dir, ns) => ({ ok: true, registry: await mcAssets.scanNamespace(dir, ns) }),
    readSoundEvents: async (dir, lang) => ({ ok: true, events: await mcAssets.readSoundEvents(dir, lang) }),
    readBinary: (p) => mcAssets.readBinaryDataUrl(p),
    readText: (p) => mcAssets.readTextFile(p),
    detectRoots: async () => ({ ok: true, roots: await mcAssets.detectRoots() }),
  },
};

// ---------- 载入沙箱 ----------
const sandbox = {
  jsyaml: require('js-yaml'), console, require, Promise, setTimeout, clearTimeout,
  JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
  TextEncoder, TextDecoder, URL, Blob: function () {},
  Image: function () {
    var self = this;
    this.onload = null; this.onerror = null;
    Object.defineProperty(this, 'src', {
      set: function () { setTimeout(function () { if (self.onerror) self.onerror(); }, 0); },
      get: function () { return ''; },
    });
  },
  navigator: {}, localStorage: {
    _d: { editorConfig: JSON.stringify({ mcAssetsPath: MC_ROOT }) },
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  document: doc,
  electronAPI,
  playSound() {},
  I18N: { lang: 'zh_cn', t: (k) => k, applyDOM() {}, ready: Promise.resolve() },
  CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['ce-mcassets.js', 'ce-cekeys.js', 'ce-diag.js', 'craftengine-schemas.js', 'craftengine-interpreter.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}
check(!!sandbox.CEMCAssets, 'CEMCAssets 已加载');
check(!!sandbox.CEDiagnostics, 'CEDiagnostics 已加载');
check(!!sandbox.CraftEngineInterpreter, 'CraftEngineInterpreter 已加载');
check(!!sandbox.CESchemas, 'CESchemas 已加载');
check(!!sandbox.CECeKeys && sandbox.CECeKeys.nameCount > 300,
  'CECeKeys 已加载 (' + (sandbox.CECeKeys ? sandbox.CECeKeys.nameCount + ' 个 CE 合法键名' : '缺失') + ')');

(async () => {
  // ================= 1. 资源索引 =================
  const st = await sandbox.CEMCAssets.init({ mcRoot: MC_ROOT });
  check(st.state === 'ready', 'CEMCAssets.init 就绪 (state=' + st.state + (st.error ? ', err=' + st.error : '') + ')');
  if (st.state !== 'ready') { finish(); return; }
  const counts = st.counts || {};
  console.log('      资源索引计数:', JSON.stringify(counts));
  check((counts.items || 0) > 1000, 'items 列表 > 1000 (' + counts.items + ')');
  check((counts.textures || 0) > 3000, 'textures 列表 > 3000 (' + counts.textures + ')');
  check((counts.models || 0) > 3000, 'models 列表 > 3000 (' + counts.models + ')');
  check((counts.soundEvents || 0) > 500, 'soundEvents 列表 > 500 (' + counts.soundEvents + ')');
  check((counts.enchantments || 0) > 30, 'enchantments 列表 > 30 (' + counts.enchantments + ')');
  check(sandbox.CEMCAssets.langName('minecraft:diamond_sword', 'en_us') === 'Diamond Sword',
    'langName(minecraft:diamond_sword) = ' + sandbox.CEMCAssets.langName('minecraft:diamond_sword', 'en_us'));

  // 纹理/模型路径解析
  const texPath = sandbox.CEMCAssets.resolve('texture', 'minecraft:block/stone');
  check(/\/textures\/block\/stone\.png$/.test(String(texPath)), 'resolve texture → ' + texPath);
  const modelPath = sandbox.CEMCAssets.resolve('model', 'minecraft:block/stone');
  check(/\/models\/block\/stone\.json$/.test(String(modelPath)), 'resolve model → ' + modelPath);
  const model = await sandbox.CEMCAssets.loadJson('model', 'minecraft:block/stone');
  check(!!model, 'loadJson 读取 block/stone 模型');
  const img = await sandbox.CEMCAssets.loadImage('texture', 'minecraft:item/diamond_sword');
  check(!img && true, 'loadImage 在无 DOM Image 环境下安全降级');

  // ================= 2. datalist 接入 =================
  sandbox.CraftEngineInterpreter.refreshAssetLists();
  const CEI = sandbox.CraftEngineInterpreter;
  const sz = (n) => CEI.datalistSize(n);
  console.log('      datalist 尺寸:', ['items', 'blocks', 'textures', 'models', 'soundEvents', 'enchantments', 'potionEffects', 'particles'].map(k => k + '=' + sz(k)).join(' '));
  check(sz('items') > 1000, 'datalist items 已合并资源索引 (' + sz('items') + ')');
  check(sz('textures') > 3000, 'datalist textures 已建立 (' + sz('textures') + ')');
  check(sz('models') > 3000, 'datalist models 已建立 (' + sz('models') + ')');
  check(sz('soundEvents') > 500, 'datalist soundEvents 已建立 (' + sz('soundEvents') + ')');
  check(sz('particles') > 50, 'datalist particles 已建立 (' + sz('particles') + ')');
  const names = CEI.datalistNames();
  check(names.indexOf('enchantments') !== -1, 'datalistNames 含 enchantments');

  // ================= 3. 字段自动补全 (渲染 HTML) =================
  const yaml = [
    'items:',
    '  default:test_blade:',
    '    material: diamond_sword',
    '    texture: minecraft:item/diamond_sword',
    '    item_model:',
    '      type: minecraft:model',
    '      path: minecraft:item/diamond_sword',
    '    settings:',
    '      fuel_time: 100',
    '      equip_sound: minecraft:item.armor.equip_iron',
    '    data:',
    '      item_name: "<!i><white><image:default:icons> Blade"',
    '      lore:',
    '        - "<gray>A test"',
    '',
  ].join('\n');

  const el = {
    innerHTML: '', textContent: '', style: {}, className: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    _ceUi: { section: 0, entry: 0 },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, removeChild() {}, isConnected: false, closest() { return null; },
  };
  let renderErr = null;
  try { CEI.render('test.yml', yaml, el, {}); } catch (e) { renderErr = e; }
  check(!renderErr, 'CE 可视化渲染无异常' + (renderErr ? ': ' + renderErr.message : ''));
  const html = String(el.innerHTML || '');
  check(html.length > 1000, '渲染输出非空 (' + html.length + ' 字符)');
  check(html.indexOf('list="ce-dl-items"') !== -1, 'material 字段挂上 ce-dl-items');
  check(html.indexOf('list="ce-dl-textures"') !== -1, 'texture 字段挂上 ce-dl-textures');
  check(html.indexOf('list="ce-dl-models"') !== -1, 'model.path 字段挂上 ce-dl-models');
  check(html.indexOf('data-sf-picker="textures"') !== -1, 'texture 字段出现 ▾ picker 按钮');
  check(html.indexOf('data-ce-picker') === -1, '未误用 data-ce-picker');
  check(html.indexOf('ce-diag-badge') !== -1, '工具条出现配置检查徽章');

  // ================= 4. 诊断 =================
  const bad = [
    'items:',
    '  default:bad_item:',
    '    material: minecraft:diamond_swrod',
    '    texture: minecraft:item/not_a_real_texture',
    '    settings:',
    '      fuel_time: "not a number"',
    '    data:',
    '      item_name: "<global:nope> x"',
    '      lore:',
    '        - "<image:default:icons:9:9>"',
    'blocks:',
    '  default:bad_block:',
    '    state:',
    '      auto_state: not_a_group',
    '    settings:',
    '      hardness: "not a number"',
    '      not_a_real_setting: 1',
    '      destroy_stages:',
    '        brightness:',
    '          block_light: 5',
    'images:',
    '  default:bad_img:',
    '    height: 4',
    '    ascent: 9',
    'recipes:',
    '  default:bad_recipe:',
    '    type: shapeless',
    '    pattern:',
    '      - "AB"',
    '      - "ABC"',
    '',
  ].join('\n');

  const parsed = CEI.parse(bad);
  check(!parsed.error, '诊断样例 YAML 解析成功' + (parsed.error ? ': ' + parsed.error : ''));
  // 让 images 条目进入工程数据 (供 <image:..:9:9> 越界检查)
  sandbox.CEDiagnostics.setProjectData({ globals: { real: '<red>x' }, images: { 'default:icons': { grid_size: '2,2' } }, emojis: {} });
  const issues = sandbox.CEDiagnostics.analyze(parsed, { file: 'bad.yml' });
  const c = sandbox.CEDiagnostics.counts(issues);
  console.log('      诊断结果:', JSON.stringify(c));
  issues.slice(0, 40).forEach(i => console.log('        [' + i.severity + '] ' + i.code + ' @ ' + (i.section || '') + '/' + (i.entry || '') + '/' + (i.path || '') + ' — ' + i.message));
  const codes = issues.map(i => i.code);
  check(c.ERROR >= 4, '检出 ERROR >= 4 (' + c.ERROR + ')');
  check(c.WARN >= 2, '检出 WARN >= 2 (' + c.WARN + ')');
  check(c.WEAK_WARN >= 1, '检出 WEAK_WARN >= 1 (' + c.WEAK_WARN + ')');
  check(codes.indexOf('notNumber') !== -1, '类型错误 hardness 被报为 notNumber');
  check(codes.indexOf('imageHeightAscent') !== -1, 'images height < ascent 被报错');
  check(codes.indexOf('badAutoState') !== -1, '非法 auto_state 组被报错');
  check(codes.indexOf('patternRowMismatch') !== -1, '配方 pattern 行宽不一致被报错');
  check(codes.indexOf('unknownRef') !== -1, '未知原版物品 ID 被报 WARN');
  check(codes.indexOf('vanillaRefNotFound') !== -1, '未知纹理只给 INFO（资源包可自定义）');
  check(issues.some(i => i.code === 'vanillaRefNotFound' && i.severity === 'INFO'),
    'vanillaRefNotFound 的严重级别是 INFO');
  check(codes.indexOf('unknownGlobal') !== -1, '未定义全局变量被报 WARN');
  check(codes.indexOf('imageCellOutOfRange') !== -1, '图片单元格越界被报 ERROR');
  check(codes.indexOf('brightnessIncomplete') !== -1, 'brightness 缺 sky_light 被报错');
  check(codes.indexOf('emptyValue') !== -1 || codes.indexOf('unknownKey') !== -1, '存在 WEAK_WARN 级提示');

  // 正常配置应无 ERROR
  const good = [
    'items:',
    '  default:ok_item:',
    '    material: minecraft:diamond_sword',
    '    data:',
    '      item_name: "<!i>OK"',
    '',
  ].join('\n');
  const goodIssues = sandbox.CEDiagnostics.analyze(CEI.parse(good), { file: 'good.yml' });
  const gc = sandbox.CEDiagnostics.counts(goodIssues);
  check(gc.ERROR === 0, '合法配置无 ERROR (' + gc.ERROR + ')' + (gc.ERROR ? ' :: ' + goodIssues.filter(i => i.severity === 'ERROR').map(i => i.code).join(',') : ''));

  // 语法错误
  const syn = sandbox.CEDiagnostics.analyze(CEI.parse('items:\n  a:\n   b: [1,2\n'), { file: 'syn.yml' });
  check(syn.length && syn[0].severity === 'ERROR' && syn[0].code === 'yamlSyntax', 'YAML 语法错误被报为 ERROR');

  // lineOf
  const line = sandbox.CEDiagnostics.lineOf(bad, 'default:bad_item', 'material');
  check(line > 0, 'lineOf 定位到行 ' + line);

  // ================= 5. 误报回归 (behavior.type 等) =================
  const fp = [
    'items:',
    '  default:sword:',
    '    material: diamond_sword',
    '    behavior:',
    '      type: block_item',
    '      block: default:my_block',
    '  default:pickaxe:',
    '    material: golden_pickaxe',
    '    behaviors:',
    '      - type: range_mining_item',
    '        range:',
    '          - 0,1,0',
    '      - type: craftengine:block_item',
    '        block: default:my_block',
    '    settings:',
    '      fuel_time: 200',
    'blocks:',
    '  default:my_block:',
    '    state:',
    '      auto_state:',
    '        type: solid',
    '        id: shared_block',
    '      properties:',
    '        - name: facing',
    '          type: horizontal_direction',
    '    behavior:',
    '      type: crop_block',
    '      grow_speed: 1',
    '    settings:',
    '      name: "<!i>My Block"',
    '      can_occlude: true',
    '      incorrect-tool-dig-speed: 0.3',
    '',
  ].join('\n');
  const fpIssues = sandbox.CEDiagnostics.analyze(CEI.parse(fp), { file: 'fp.yml' });
  const fpCodes = fpIssues.map(i => i.code);
  console.log('      误报回归诊断:', JSON.stringify(sandbox.CEDiagnostics.counts(fpIssues)));
  fpIssues.forEach(i => console.log('        [' + i.severity + '] ' + i.code + ' @ ' + (i.path || '') + ' — ' + i.message));
  check(fpCodes.indexOf('unknownKey') === -1,
    'behavior.type / behaviors[].type 不再被误报为未知键' +
    (fpCodes.indexOf('unknownKey') !== -1 ? ' :: ' + fpIssues.filter(i => i.code === 'unknownKey').map(i => i.path).join(',') : ''));
  check(fpCodes.indexOf('unknownType') === -1, 'craftengine:block_item 这类带命名空间的类型不再被误报');
  const fpErrors = fpIssues.filter(i => i.severity === 'ERROR');
  check(fpErrors.length === 0, '误报样例没有 ERROR (' + (fpErrors.map(i => i.code).join(',') || '无') + ')');

  // 真正拼错的键仍应报出
  const typo = [
    'items:',
    '  default:x:',
    '    material: paper',
    '    settigns:',
    '      foo: 1',
    '',
  ].join('\n');
  const typoIssues = sandbox.CEDiagnostics.analyze(CEI.parse(typo), { file: 'typo.yml' });
  check(typoIssues.some(i => i.code === 'unknownKey'),
    '真正拼错的键 settigns 仍会被报出');

  // union 缺少 type 时给出 WARN
  const noType = [
    'items:',
    '  default:y:',
    '    material: paper',
    '    behavior:',
    '      block: default:b',
    '',
  ].join('\n');
  const ntIssues = sandbox.CEDiagnostics.analyze(CEI.parse(noType), { file: 'nt.yml' });
  check(ntIssues.some(i => i.code === 'typeMissing'), 'behavior 缺少 type 时给出 typeMissing');

  // noTypeKey union: 对象内部自带 type 字段时不能被当成判别键 (声音列表的 type: file/event)
  const soundUnion = [
    'sounds:',
    '  default:my_sound:',
    '    sounds:',
    '      - name: "ambient/custom_1"',
    '        volume: 0.4',
    '        type: file',
    '      - name: "minecraft:block.stone.break"',
    '        type: event',
    '',
  ].join('\n');
  const suIssues = sandbox.CEDiagnostics.analyze(CEI.parse(soundUnion), { file: 'su.yml' });
  check(!suIssues.some(i => i.code === 'unknownType'),
    '声音列表项里的 type: file/event 不被当成 union 判别键' +
    (suIssues.some(i => i.code === 'unknownType') ? ' :: ' + suIssues.filter(i => i.code === 'unknownType').map(i => i.message).join(',') : ''));

  // entity_renderer: 无 type 键的 union, 形状推断失败时才回退到内部 type
  const renderer = [
    'blocks:',
    '  default:sign_post:',
    '    states:',
    '      appearances:',
    '        north:',
    '          entity_renderer:',
    '            type: item_display',
    '            item: default:sign_post',
    '',
  ].join('\n');
  const rIssues = sandbox.CEDiagnostics.analyze(CEI.parse(renderer), { file: 'r.yml' });
  check(!rIssues.some(i => i.code === 'unknownType'), 'entity_renderer 的 item_display 不被误报');

  // kv 类型字段 (编辑器用 key: value 文本域渲染) 收到映射时不应报 expectScalar
  const kvField = [
    'blocks:',
    '  default:b:',
    '    behavior:',
    '      type: simple_particle_block',
    '      particles:',
    '        count: 3',
    '        type: minecraft:flame',
    '',
  ].join('\n');
  const kvIssues = sandbox.CEDiagnostics.analyze(CEI.parse(kvField), { file: 'kv.yml' });
  check(!kvIssues.some(i => i.code === 'expectScalar'),
    'kv 类型字段收到映射时不报 expectScalar' +
    (kvIssues.some(i => i.code === 'expectScalar') ? ' :: ' + kvIssues.filter(i => i.code === 'expectScalar').map(i => i.path).join(',') : ''));

  // config.yml 的同名分组 (emoji/item/block) 不应被当成数据段
  const cfgLike = [
    'emoji:',
    '  contexts:',
    '    chat: true',
    '    book: true',
    'item:',
    '  default-material: paper',
    'block:',
    '  serverside-blocks: 1000',
    'image:',
    '  codepoint-starting-value:',
    '    default: 19968',
    '',
  ].join('\n');
  const cfgIssues = sandbox.CEDiagnostics.analyze(CEI.parse(cfgLike), {
    file: 'E:/proj/resources/demo/configuration/config.yml',
  });
  check(!cfgIssues.some(i => i.severity === 'ERROR'),
    'config.yml 同名分组不产生 ERROR' +
    (cfgIssues.some(i => i.severity === 'ERROR') ? ' :: ' + cfgIssues.filter(i => i.severity === 'ERROR').map(i => i.code + '@' + i.path).join(',') : ''));

  // ================= 6. 别名键的表单渲染 (behaviors → behavior 字段) =================
  const aliasEl = {
    innerHTML: '', textContent: '', style: {}, className: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    _ceUi: { section: 0, entry: 0 },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, removeChild() {}, isConnected: false, closest() { return null; },
  };
  const aliasYaml = [
    'items:',
    '  default:alias_item:',
    '    material: paper',
    '    behaviors:',
    '      - type: block_item',
    '        block: default:some_block',
    '',
  ].join('\n');
  let aliasErr = null;
  try { CEI.render('alias.yml', aliasYaml, aliasEl, {}); } catch (e) { aliasErr = e; }
  const aliasHtml = String(aliasEl.innerHTML || '');
  check(!aliasErr, 'behaviors 表单渲染无异常' + (aliasErr ? ': ' + aliasErr.message : ''));
  check(aliasHtml.indexOf('data-sf-path="behaviors"') !== -1,
    'behaviors 键按 behavior 字段渲染 (路径=behaviors)，而不是落到「其他字段」');
  check(aliasHtml.indexOf('block_item') !== -1, 'behaviors 列表内容被渲染');

  // ================= 7. 付费版提示开关 (hide premium feature hints) =================
  const premiumYaml = [
    'items:',
    '  demo:mythic_sword:',
    '    material: diamond_sword',
    '    client_bound_data:',
    '      item_name: "Mythic Sword"',
    '    client_bound_material: nether_brick',
    '',
  ].join('\n');
  const premiumParsed = CEI.parse(premiumYaml);
  const premiumOn = sandbox.CEDiagnostics.analyze(premiumParsed, { file: 'E:/proj/resources/demo/configuration/items/a.yml' });
  const premiumCount = premiumOn.filter(i => i.code === 'premium').length;
  check(premiumCount >= 2, '默认报告付费版专属字段 (client_bound_data / client_bound_material)，实际 ' + premiumCount);

  sandbox.CEDiagnostics.setOptions({ hidePremiumHints: true });
  const premiumOff = sandbox.CEDiagnostics.analyze(premiumParsed, { file: 'E:/proj/resources/demo/configuration/items/a.yml' });
  check(!premiumOff.some(i => i.code === 'premium'), 'setOptions({hidePremiumHints:true}) 后不再报告付费版提示');
  sandbox.CEDiagnostics.setOptions({ hidePremiumHints: false });

  bodyClasses['ce-hide-premium-hints'] = true;
  const premiumOff2 = sandbox.CEDiagnostics.analyze(premiumParsed, { file: 'E:/proj/resources/demo/configuration/items/a.yml' });
  check(!premiumOff2.some(i => i.code === 'premium'), 'body class ce-hide-premium-hints 时不再报告付费版提示');
  delete bodyClasses['ce-hide-premium-hints'];

  // 7b. tooltip 侧的付费版提示由 body class 控制 (与设置页开关共用同一 class)。
  // 这里只验证开关生效: 关闭时表单里任何 hint 图标都不再追加 premiumHint。
  function anyPremiumHint(yamlText, fileName) {
    const el = {
      innerHTML: '', textContent: '', style: {}, className: '',
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      _ceUi: { section: 0, entry: 0 },
      addEventListener() {}, removeEventListener() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      appendChild() {}, removeChild() {}, isConnected: false, closest() { return null; },
    };
    CEI.render(fileName, yamlText, el, {});
    const html = String(el.innerHTML || '');
    return (html.match(/data-sf-hint="[^"]*premiumHint[^"]*"/g) || []).length;
  }
  const recipeYaml = [
    'recipes:',
    '  demo:mythic_recipe:',
    '    type: crafting_shaped',
    '    visual_result:',
    '      item: minecraft:diamond',
    '',
  ].join('\n');
  const recipePremiumOn = anyPremiumHint(recipeYaml, 'recipe.yml');
  check(recipePremiumOn > 0, 'visual_result 的 tooltip 带付费版提示 (命中 ' + recipePremiumOn + ')');
  bodyClasses['ce-hide-premium-hints'] = true;
  check(anyPremiumHint(recipeYaml, 'recipe.yml') === 0,
    '勾选隐藏付费版提示后 visual_result 的 tooltip 不再追加提示');
  check(anyPremiumHint(premiumYaml, 'item.yml') === 0,
    '勾选隐藏付费版提示后物品表单也不再有付费版提示');
  delete bodyClasses['ce-hide-premium-hints'];

  // 8. 内部资源包命名空间豁免 =================
  const nsYaml = [
    'items:',
    '  internal:generated_item:',
    '    material: paper',
    '',
  ].join('\n');
  const nsParsed = CEI.parse(nsYaml);
  const nsInternal = sandbox.CEDiagnostics.analyze(nsParsed, { file: 'E:/proj/resources/internal/configuration/items/a.yml' });
  check(!nsInternal.some(i => i.code === 'unknownNamespace'),
    'resources/internal 下的 internal 命名空间不再提示');

  const nsInternalPrefix = sandbox.CEDiagnostics.analyze(nsParsed, { file: 'E:/proj/resources/internal_pack/configuration/items/a.yml' });
  check(!nsInternalPrefix.some(i => i.code === 'unknownNamespace'),
    'internal_* 目录下的 internal 命名空间不再提示');

  const nsOutside = sandbox.CEDiagnostics.analyze(nsParsed, { file: 'E:/proj/resources/mypack/configuration/items/a.yml' });
  check(nsOutside.some(i => i.code === 'unknownNamespace'),
    '普通资源包目录下的未知命名空间仍然提示');

  finish();
})().catch(e => { console.error('测试异常:', e); fails++; finish(); });

function finish() {
  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  process.exit(fails === 0 ? 0 : 1);
}
