#!/usr/bin/env node
/* 组装分片翻译为完整 locale: node scripts/assemble-locale.js <lang>
 * 例: node scripts/assemble-locale.js es_es  → 合并 locales/<lang>.part1..N.yml → locales/<lang>.yml
 * 分片数自适应: 扫描 locales/<lang>.part<N>.yml, 按 N 升序拼接（分片必须各自是合法 YAML）。
 * 分片边界取 en_us.yml 的顶层块边界 (如 app..perm / settings,ai / kether,chemdah,craftengine /
 * content:* / tips,checks,diagnostics,preview)，拼接后与 en_us.yml 结构等价。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require(path.join(__dirname, '..', 'node_modules', 'js-yaml'));

const lang = process.argv[2];
if (!lang || !/^[a-z]{2}_[a-z]{2}$/.test(lang)) { console.error('用法: node scripts/assemble-locale.js <lang>  例: es_es'); process.exit(1); }
const DIR = path.join(__dirname, '..', 'locales');
// 扫描 <lang>.part<N>.yml, 按 N 升序排列 (分片数不固定)
const partNums = fs.readdirSync(DIR)
  .map(f => { const m = new RegExp('^' + lang + '\\.part(\\d+)\\.yml$').exec(f); return m ? parseInt(m[1], 10) : null; })
  .filter(n => n !== null)
  .sort((a, b) => a - b);
if (!partNums.length) { console.error('未找到分片: locales/' + lang + '.part<N>.yml'); process.exit(1); }
const parts = partNums.map(n => lang + '.part' + n + '.yml');

let chunks = [];
for (const p of parts) {
  const file = path.join(DIR, p);
  if (!fs.existsSync(file)) { console.error('缺少分片: ' + p); process.exit(1); }
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  if (/__CHUNK_END__|__PART_END__/.test(text)) { console.error('分片含哨兵未清理: ' + p); process.exit(1); }
  chunks.push(text);
}
// 逐片先独立解析, 定位语法错误
for (let i = 0; i < chunks.length; i++) {
  try { yaml.load(chunks[i]); } catch (e) { console.error('分片 ' + (i + 1) + ' (' + parts[i] + ') YAML 错误: ' + e.message.split('\n')[0]); process.exit(1); }
}
const merged = chunks.join('\n\n') + '\n';
try { yaml.load(merged); } catch (e) {
  console.error('合并后 YAML 错误: ' + e.message.split('\n')[0]);
  const m = /line (\d+)/.exec(e.message);
  if (m) {
    const ln = parseInt(m[1], 10);
    const lines = merged.split('\n');
    for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 3); i++) console.error((i + 1) + ': ' + lines[i]);
  }
  process.exit(1);
}
fs.writeFileSync(path.join(DIR, lang + '.yml'), merged, 'utf8');
const dict = yaml.load(merged);
console.log(lang + '.yml 已生成, 顶层: ' + Object.keys(dict).join(','));
