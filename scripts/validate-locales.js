#!/usr/bin/env node
/* locale 校验脚本: node scripts/validate-locales.js [--strict] [lang ...]
 * 默认校验全部语言 (zh_cn, zh_tw, en_us, de_de, es_es, fr_fr, ko_kr, ru_ru)。
 * --strict: 用于新增语言文件 —— 强制要求完整键覆盖 (en_us ∪ zh_cn 并集) 与 18 条 tips;
 *           不加 --strict 时 (存量文件) 缺键/缺 tip 只警告 (存量文件本来就互补回退)。
 * 检查项:
 *   1. YAML 可解析 (js-yaml)
 *   2. 键覆盖: 与 en_us.yml (超集参考) + zh_cn.yml (源语言) 的并集比对
 *   3. tips 数组存在、条目为非空字符串; strict 下要求 >= 源条目数 (18)
 *   4. 占位符一致性: 每个键的 {placeholder} 集合与参考来源一致 (缺失/多出均报错)
 *   5. <br> 标签数量与参考一致 (仅警告)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yaml = require(path.join(__dirname, '..', 'node_modules', 'js-yaml'));

const ROOT = path.join(__dirname, '..');
const REFERENCE = 'en_us'; // 键超集参考
const SOURCE = 'zh_cn';    // 源语言
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const langs = argv.filter(a => !a.startsWith('--'));
const ALL = ['zh_cn', 'zh_tw', 'en_us', 'de_de', 'es_es', 'fr_fr', 'ko_kr', 'ru_ru'];
const targets = langs.length ? langs : ALL;

function flatten(o, prefix) {
  prefix = prefix || '';
  const out = {};
  for (const k of Object.keys(o || {})) {
    const v = o[k];
    const p = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) out[p] = v;
    else if (v && typeof v === 'object') Object.assign(out, flatten(v, p));
    else out[p] = v;
  }
  return out;
}

function placeholders(s) {
  const m = String(s).match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || [];
  return m.slice().sort().join(',');
}

// content.kether.* 的高亮标记 {术语} 内部允许翻译 (如 {player}→{jugador})，
// 只比较花括号组的数量; {{...}} 转义括号不算组。
function braceGroups(s) {
  return (String(s).replace(/\{\{[^{}]*\}\}/g, '').match(/\{[^{}]+\}/g) || []).length;
}

function brCount(s) {
  return (String(s).match(/<br\s*\/?>/g) || []).length;
}

function loadLang(code) {
  const file = path.join(ROOT, 'locales', code + '.yml');
  const dict = yaml.load(fs.readFileSync(file, 'utf8'));
  return { code, file, dict, flat: flatten(dict) };
}

let totalErrors = 0;
function fail(msg) { console.error('  FAIL  ' + msg); totalErrors++; }
function warn(msg) { console.warn('  warn  ' + msg); }

const ref = loadLang(REFERENCE);
const src = loadLang(SOURCE);
// 并集参考
const union = Object.assign({}, ref.flat);
for (const k of Object.keys(src.flat)) if (!(k in union)) union[k] = src.flat[k];

for (const code of targets) {
  console.log('== ' + code);
  let flat;
  try {
    flat = loadLang(code).flat;
  } catch (e) {
    fail('YAML 解析失败: ' + e.message.split('\n')[0]);
    continue;
  }

  // 2. 键覆盖
  const missing = Object.keys(union).filter(k => !(k in flat));
  if (missing.length) {
    const msg = '缺少 ' + missing.length + ' 个键: ' + missing.slice(0, 12).join(', ') + (missing.length > 12 ? ' ...' : '');
    (STRICT ? fail : warn)(msg);
  }
  const extra = Object.keys(flat).filter(k => !(k in union));
  if (extra.length) fail('多出 ' + extra.length + ' 个键: ' + extra.slice(0, 12).join(', ') + (extra.length > 12 ? ' ...' : ''));

  // 3. tips
  const tipsRef = src.flat['tips'];
  const tips = flat['tips'];
  if (!Array.isArray(tips)) {
    fail('tips 不是数组');
  } else {
    const nonStr = tips.filter(t => typeof t !== 'string' || !t.trim());
    if (nonStr.length) fail('tips 含非字符串/空条目 ' + nonStr.length + ' 个');
    if (Array.isArray(tipsRef) && tips.length < tipsRef.length) {
      const msg = 'tips 条目数 ' + tips.length + ' < 源 ' + tipsRef.length;
      (STRICT ? fail : warn)(msg);
    }
  }

  // 4/5. 占位符与 <br> (只比对两边都存在的键)
  for (const k of Object.keys(flat)) {
    if (k === 'tips') continue;
    const v = flat[k];
    const refV = union[k];
    if (typeof v !== 'string' || typeof refV !== 'string') continue;
    if (k.startsWith('content.kether.')) {
      // 高亮标记 {术语} 内部可翻译, 仅要求花括号组数量一致
      if (braceGroups(v) !== braceGroups(refV)) fail('高亮标记数不一致 ' + k + ': 期望 ' + braceGroups(refV) + ' 实际 ' + braceGroups(v));
      continue;
    }
    const pv = placeholders(v), pr = placeholders(refV);
    if (pv !== pr) fail('占位符不一致 ' + k + ': 期望[' + pr + '] 实际[' + pv + ']');
    if (brCount(v) !== brCount(refV)) warn('<br> 数量不同 ' + k + ' (' + brCount(refV) + ' → ' + brCount(v) + ')');
  }

  if (totalErrors === 0) console.log('  OK    ' + code);
}

console.log(totalErrors ? ('✗ ' + totalErrors + ' 处错误') : '✓ 全部通过');
process.exit(totalErrors ? 1 : 0);
