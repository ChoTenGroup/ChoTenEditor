/* 统计 CE 工程里 images 条目的「源 PNG 分辨率 vs 配置 height」
 * 源 > height 的条目, 旧实现会先缩小到 height 再放大 → 丢细节 (这次的 bug)。
 * 用法: node _ce_srcsize_probe.js [resourcesRoot]
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = process.argv[2] || 'E:/craft-engine/common-files/src/main/resources/resources';

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function walk(dir, out, depth) {
  if ((depth || 0) > 14) return out;
  let es = [];
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, (depth || 0) + 1);
    else if (/\.(png|yml|yaml)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function norm(s) { return String(s).replace(/\\/g, '/'); }

const files = walk(ROOT, [], 0);
const pngs = new Map();
for (const f of files) {
  if (!/\.png$/i.test(f)) continue;
  const m = norm(f).match(/assets\/([^/]+)\/textures\/(.+)\.png$/i);
  if (!m) continue;
  const key = m[1] + ':' + m[2];
  if (!pngs.has(key)) pngs.set(key, pngSize(fs.readFileSync(f)));
}

let entries = 0, bigger = 0, equal = 0, smaller = 0, unresolved = 0;
const samples = [];
for (const f of files) {
  if (!/\.(yml|yaml)$/i.test(f)) continue;
  let doc;
  try { doc = yaml.load(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
  const imgs = doc && doc.images;
  if (!imgs || typeof imgs !== 'object') continue;
  for (const [id, raw] of Object.entries(imgs)) {
    const e = raw || {};
    if (e.ref || !e.file) continue;
    const h = e.height != null ? e.height : (e.scale != null ? e.scale : e.scale_ratio);
    if (h == null) continue;
    let key = String(e.file).replace(/^textures\//, '').replace(/\.png$/i, '');
    if (key.indexOf(':') === -1) key = 'minecraft:' + key;
    const size = pngs.get(key);
    if (!size) { unresolved++; continue; }
    // 精灵图: 按 grid_size / chars 取格子
    let rows = 1, cols = 1;
    if (e.grid_size != null) {
      const g = String(Array.isArray(e.grid_size) ? e.grid_size.join(',') : e.grid_size).split(/[,x×\s]+/).map(Number);
      if (g.length >= 2 && g[0] > 0 && g[1] > 0) { rows = g[0]; cols = g[1]; }
    } else if (e.chars) {
      const rowsArr = Array.isArray(e.chars) ? e.chars : String(e.chars).split('\n');
      rows = rowsArr.length; cols = 0;
      for (const r of rowsArr) cols = Math.max(cols, Array.from(String(r)).length);
      if (!cols) cols = 1;
    }
    const cellH = size.h / rows;
    entries++;
    const d = cellH / Number(h);
    if (d > 1.05) { bigger++; if (samples.length < 14) samples.push({ id, cfg: Number(h), png: size.w + 'x' + size.h, cell: cellH, ratio: d.toFixed(2) }); }
    else if (d < 0.95) smaller++;
    else equal++;
  }
}

console.log('CE 工程:', ROOT);
console.log('可解析的 images 条目:', entries);
console.log('  源分辨率 > height (旧实现会先缩小丢细节):', bigger);
console.log('  源分辨率 ≈ height (1:1, 无影响):        ', equal);
console.log('  源分辨率 < height (本来就是放大):        ', smaller);
console.log('  引用的 PNG 未找到:', unresolved);
if (samples.length) {
  console.log('');
  console.log('源 > height 的例子 (id | height | PNG | 格子高 | 倍数):');
  for (const s of samples) console.log('  ' + s.id + ' | ' + s.cfg + ' | ' + s.png + ' | ' + s.cell + ' | ' + s.ratio + 'x');
}
