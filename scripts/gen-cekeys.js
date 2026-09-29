/* 从 CraftEngine 源码的 ConfigKeys.of("...") 提取「合法键名 + 别名组」
 * ConfigKeys 的迷你 DSL:  image(s) → image|images ;  entit(y | ies) → entity|entities
 * 输出: E:/ChoTenEditor/ce-cekeys.js  (window.CECeKeys)
 * 用法: node _ce_tmp/gen_cekeys.js
 */
const fs = require('fs');
const path = require('path');

const ROOTS = [
  'E:/craft-engine/core/src/main/java',
  'E:/craft-engine/bukkit/src/main/java',
  'E:/craft-engine/common-files/src/main/java',
];

function walk(dir, cb) {
  let es;
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else if (e.name.endsWith('.java')) cb(p);
  }
}

/** 按顶层分隔符切分 (忽略括号内) */
function splitTop(str, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** 展开 ConfigKeys DSL: "char(s) | unicode" → ['char','chars','unicode'] */
function expand(str) {
  const s = String(str);
  let open = -1, depth = 0, close = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') { if (depth === 0 && open < 0) open = i; depth++; }
    else if (s[i] === ')') { depth--; if (depth === 0 && open >= 0) { close = i; break; } }
  }
  if (open < 0 || close < 0) return [s];
  const prefix = s.slice(0, open);
  const inner = s.slice(open + 1, close);
  const suffix = s.slice(close + 1);
  const alts = inner.indexOf('|') >= 0
    ? splitTop(inner, '|').map(x => x.trim())
    : ['', inner.trim()];   // (s) 视为可选后缀
  const out = [];
  for (const a of alts) {
    for (const rest of expand(suffix)) out.push(prefix + a + rest);
  }
  return out;
}

function expandGroup(raw) {
  const set = new Set();
  for (const part of splitTop(raw, '|')) {
    for (const v of expand(part.trim())) {
      const t = v.trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

const norm = (s) => String(s).toLowerCase().replace(/-/g, '_');

const files = [];
for (const r of ROOTS) walk(r, (p) => files.push(p));

const groups = [];
const names = new Set();
const aliasOf = Object.create(null);
const re = /ConfigKeys\.of\(\s*"([^"]+)"\s*\)/g;

// 2) 字面量键名读取: section.getString("x") / getValue("x", ..) / getSection("x") / contains("x") ...
//    这类键不在 ConfigKeys 注册表里, 但 CE 确实会读取 (例如 state.properties)
const RE_LITERAL = /\.(?:getNonNull|get)(?:Section|String|StringList|Boolean|Int|Long|Double|Float|Value|List|Map|Enum|Key|Color|NamespacedKey|Number|Byte|Short)\s*\(\s*"([^"]{1,48})"/g;
const RE_CONTAINS = /\.(?:contains|has|isSet)\s*\(\s*"([^"]{1,48})"\s*\)/g;
const LITERAL_OK = /^[a-z][a-z0-9_]{0,40}$/;

for (const f of files) {
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  const rel = path.relative('E:/craft-engine', f).replace(/\\/g, '/');
  let m;
  while ((m = re.exec(s)) !== null) {
    const keys = expandGroup(m[1]);
    if (!keys.length) continue;
    groups.push({ raw: m[1], keys: keys, file: rel });
    const normed = keys.map(norm);
    normed.forEach(k => names.add(k));
    if (normed.length > 1) {
      for (const k of normed) {
        const prev = aliasOf[k] || [];
        for (const other of normed) if (prev.indexOf(other) === -1) prev.push(other);
        aliasOf[k] = prev;
      }
    }
  }
  let lit = 0;
  for (const rx of [RE_LITERAL, RE_CONTAINS]) {
    rx.lastIndex = 0;
    while ((m = rx.exec(s)) !== null) {
      const k = m[1];
      if (!LITERAL_OK.test(k)) continue;
      names.add(k);
      lit++;
    }
  }
  if (lit) groups.push({ raw: '(literal)', keys: ['<literal reads>'], file: rel, literalCount: lit });
}

// 3) 注册表键名: register(Key.ce("xxx"), ...) / register(Key.withDefaultNamespace("xxx", ...), ...)
//    这些是行为/设置/渲染器等「类型标识」, 用于判断 type 是否真的存在
const RE_REG = /Key\.(?:ce|withDefaultNamespace|minecraft|of)\(\s*"([a-z0-9_./-]{1,48})"/g;
const typeIds = new Set();
for (const f of files) {
  let s;
  try { s = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  RE_REG.lastIndex = 0;
  let m;
  while ((m = RE_REG.exec(s)) !== null) {
    const k = m[1];
    if (!/^[a-z][a-z0-9_./-]{0,47}$/.test(k)) continue;
    names.add(norm(k));
    names.add(k);
    typeIds.add(k.replace(/^craftengine:/, '').replace(/^minecraft:/, ''));
  }
}
// ConfigKeys 里出现的键名本身就是设置键, 全部进 names (上面已做)
typeIds.forEach(t => names.add(t));

// 手动补充几个源码里用字面量而不是 ConfigKeys 读取的关键键 (已核对源码)
const EXTRA = {
  type: ['type'],
  behavior: ['behavior', 'behaviors'],
  behaviors: ['behavior', 'behaviors'],
  events: ['events', 'event'],
  merges: ['merges'],
  overrides: ['overrides'],
  arguments: ['arguments', 'args'],
  template: ['template', 'templates'],
  item_model: ['item_model', 'model'],
  custom_model_data: ['custom_model_data', 'custom-model-data'],
  blocks: ['block', 'blocks'],
  items: ['item', 'items'],
  id: ['id', 'item', 'items'],
};
Object.keys(EXTRA).forEach(k => {
  names.add(k);
  EXTRA[k].forEach(v => names.add(v));
  const merged = EXTRA[k].slice();
  merged.forEach(v => {
    const prev = aliasOf[v] || [v];
    merged.forEach(o => { if (prev.indexOf(o) === -1) prev.push(o); });
    if (prev.indexOf(v) === -1) prev.push(v);
    aliasOf[v] = prev;
  });
});

const out = {
  source: 'CraftEngine source: ConfigKeys.of(...) / Key.ce(...) / literal section reads in core/, bukkit/, common-files/',
  generatedFrom: 'E:/craft-engine',
  groupCount: groups.length,
  nameCount: names.size,
  names: [...names].sort(),
  typeIds: [...typeIds].sort(),
  aliasOf: aliasOf,
  groups: groups,
};

const header = '/* 由 _ce_tmp/gen_cekeys.js 从 CraftEngine 源码生成, 请勿手改\n' +
  ' * 数据源: ' + out.source + '\n' +
  ' * 别名组 ' + groups.length + ' 个, 合法键名 ' + names.size + ' 个, 类型标识 ' + typeIds.size + ' 个\n' +
  ' * 用途: 诊断引擎据此判断「某个键名 / 类型 CraftEngine 是否真的读取」, 避免误报。\n */\n';
const body = '(function () {\n  var root = typeof window !== \'undefined\' ? window : globalThis;\n  if (root.CECeKeys) return;\n  root.CECeKeys = ' +
  JSON.stringify({ source: out.source, groupCount: out.groupCount, nameCount: out.nameCount, names: out.names, typeIds: out.typeIds, aliasOf: out.aliasOf }, null, 0) +
  ';\n})();\n';

const target = path.join(__dirname, '..', 'ce-cekeys.js');
fs.writeFileSync(target, header + body, 'utf8');
console.log('写出:', target);
console.log('别名组:', groups.length, ' 合法键名:', names.size);
console.log('\n展开检查(抽样):');
[['char(s) | unicode'], ['entit(y | ies)'], ['image(s)'], ['categor(y | ies)'], ['model(s) | texture(s) | blueprint | legacy_model'], ['variant(s) | placement'], ['display_(context | transform)'], ['loot_source(s) | vanilla_loot(s)'], ['ingredient(s) | reagent']]
  .forEach(([r]) => console.log('  ' + r + '  =>  ' + expandGroup(r).join(', ')));
console.log('\nbehavior 相关:', (aliasOf['behavior'] || []).join(', '));
console.log('type 是否在合法键名中:', names.has('type'));
