/* 误报审计: 用官方 Wiki 里全部 ```yaml 示例跑一遍诊断, 统计报告的问题
 * 目的: 找出「官方文档里合法写法却被编辑器报错」的误报
 * 用法: node _ce_tmp/audit_wiki.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const mcAssets = require(path.join(ROOT, 'mc-assets.js'));

const MC_ROOT = 'E:\\MC\\Windose\\.minecraft\\versions\\26.3\\26.3\\assets';
const WIKI = 'E:\\craft-engine-WIKI\\docs';

const electronAPI = {
  readdir: async (p) => { try { const es = await fs.promises.readdir(p, { withFileTypes: true }); return { success: true, files: es.map(e => ({ name: e.name, isDirectory: e.isDirectory(), path: path.join(p, e.name) })) }; } catch (e) { return { success: false }; } },
  readFile: async (p) => { try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; } catch (e) { return { success: false }; } },
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
const sb = {
  console, Promise, setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
  jsyaml: require('js-yaml'), require, electronAPI,
  document: { createElement: () => ({ style: {} }), body: { classList: { contains: () => true, add() {}, remove() {}, toggle() {} } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem() {}, removeItem() {} },
  I18N: { lang: 'zh_cn', t: (k) => k },
  playSound() {}, Image: function () {}, navigator: {},
};
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
for (const f of ['ce-mcassets.js', 'ce-cekeys.js', 'ce-diag.js', 'craftengine-schemas.js', 'craftengine-interpreter.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
}

function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else if (/\.mdx?$/.test(e.name)) cb(p);
  }
}

(async () => {
  await sb.CEMCAssets.init({ mcRoot: MC_ROOT });
  sb.CraftEngineInterpreter.refreshAssetLists();

  const SECTIONS = sb.CraftEngineInterpreter.SECTION_KEYS;
  const blocks = [];
  walk(WIKI, (p) => {
    const txt = fs.readFileSync(p, 'utf8');
    const re = /```ya?ml\r?\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(txt)) !== null) blocks.push({ file: path.relative(WIKI, p).replace(/\\/g, '/'), code: m[1] });
  });
  console.log('Wiki YAML 代码块:', blocks.length);

  const byCode = new Map();
  let analysed = 0, skipped = 0;
  const samples = [];

  for (const b of blocks) {
    let doc;
    try { doc = sb.jsyaml.load(b.code); } catch (e) { skipped++; continue; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { skipped++; continue; }
    const roots = Object.keys(doc).map(k => k.replace(/#.*$/, ''));
    const isCE = roots.some(r => SECTIONS.indexOf(r) !== -1)
      || roots.some(r => /^(items|blocks|furniture|recipes|equipments|images|emoji|categories|global_variables|jukebox_songs|sounds|paintings|templates|lang|translations|loot_sources)$/.test(r));
    if (!isCE) { skipped++; continue; }
    analysed++;
    let issues = [];
    try { issues = sb.CraftEngineInterpreter.validate(sb.CraftEngineInterpreter.parse(b.code), { file: b.file }); } catch (e) { continue; }
    for (const i of issues) {
      if (i.severity === 'INFO' && i.code === 'unknownNamespace') continue;
      if (!byCode.has(i.code)) byCode.set(i.code, { severity: i.severity, count: 0, examples: [] });
      const rec = byCode.get(i.code);
      rec.count++;
      if (rec.examples.length < 4) rec.examples.push({ file: b.file, path: i.path, key: i.key, msg: i.message });
    }
  }

  console.log('参与检查的代码块:', analysed, ' 跳过:', skipped);
  const rows = [...byCode.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log('\n=== 报告统计 ===');
  if (!rows.length) console.log('  (没有任何问题)');
  for (const [code, rec] of rows) {
    console.log('\n[' + rec.severity + '] ' + code + '  ×' + rec.count);
    rec.examples.forEach(e => console.log('    ' + e.file + '  ' + (e.path || '') + '  → ' + e.msg));
  }
})();
