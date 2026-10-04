/* ChoTenEditor Minecraft 资源索引模块（纯 Node，无 electron 依赖，可独立 require 测试）
 *
 * 用途: 为 CraftEngine 编辑器的补全 (picker) 与预览 (preview) 提供原版资源索引。
 * 输入是一个「资源命名空间目录」，即形如 <assets>/minecraft 或
 * CE 资源包里面的 <resources>/<namespace>；只要该目录下存在以下任意子目录即视为有效:
 *   items/ blockstates/ models/ textures/ lang/ font/ particles/ equipment/ atlases/
 *
 * 输出是「名字索引」而非文件内容: 模型 JSON / 语言 JSON 体积大，按需通过
 * readJsonFile() / readBinaryDataUrl() 单独读取，避免一次 IPC 传输数 MB 数据。
 *
 * 约定:
 *   item id      = items/*.json 文件名            → minecraft:diamond_sword
 *   block id     = blockstates/*.json 文件名      → minecraft:stone
 *   model id     = models 下的 *.json 相对路径    → minecraft:block/stone
 *   texture id   = textures 下的 *.png 相对路径   → minecraft:block/stone
 *   particle id  = particles/*.json 文件名        → minecraft:ash
 *   font id      = font/*.json 文件名             → minecraft:default
 *   equipment id = equipment/*.json 文件名        → minecraft:leather
 *   sound event  = lang 里 subtitles.* 键名       → block.stone.break
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 目录扫描上限（防御性）: 单个命名空间最多收集多少个文件名
const MAX_ENTRIES = 60000;
const MAX_DEPTH = 8;

// 有效命名空间目录的特征子目录
const NS_MARKERS = [
  'items', 'blockstates', 'models', 'textures', 'lang', 'font',
  'particles', 'equipment', 'atlases', 'sounds',
];

async function dirExists(p) {
  try { return (await fs.promises.stat(p)).isDirectory(); } catch (e) { return false; }
}

async function fileExists(p) {
  try { return (await fs.promises.stat(p)).isFile(); } catch (e) { return false; }
}

async function readDirSafe(dir) {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const dirs = [];
    const files = [];
    for (const e of entries) {
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) {
        try { isDir = (await fs.promises.stat(path.join(dir, e.name))).isDirectory(); } catch (err) { /* 断链忽略 */ }
      }
      if (isDir) dirs.push(e.name); else files.push(e.name);
    }
    dirs.sort();
    files.sort();
    return { dirs, files };
  } catch (e) {
    return null;
  }
}

/**
 * 递归收集相对路径（posix 分隔符，不含扩展名）
 * @param {string} base 命名空间根目录
 * @param {string} rel  当前相对目录（'' 表示根）
 * @param {number} depth
 * @param {object} opts { ext: RegExp, dirsOnly?: boolean, out: string[], cap: number }
 */
async function walk(base, rel, depth, opts) {
  if (depth > MAX_DEPTH || opts.out.length >= opts.cap) return;
  const abs = rel ? path.join(base, rel) : base;
  const listing = await readDirSafe(abs);
  if (!listing) return;
  for (const d of listing.dirs) {
    const next = rel ? rel + '/' + d : d;
    await walk(base, next, depth + 1, opts);
    if (opts.out.length >= opts.cap) return;
  }
  for (const f of listing.files) {
    if (opts.out.length >= opts.cap) return;
    if (!opts.ext.test(f)) continue;
    const noExt = f.replace(opts.ext, '');
    opts.out.push(rel ? rel + '/' + noExt : noExt);
  }
}

function stripPng(f) { return f.replace(/\.png$/i, ''); }
function stripJson(f) { return f.replace(/\.json$/i, ''); }

/**
 * 扫描单个命名空间目录，返回名字索引
 * @param {string} nsDir 命名空间目录绝对路径
 * @param {string} namespace 命名空间名（如 minecraft）
 */
async function scanNamespace(nsDir, namespace) {
  const out = {
    namespace: namespace,
    dir: nsDir.replace(/\\/g, '/'),
    itemIds: [],
    blockIds: [],
    modelIds: [],
    textureIds: [],
    blockTextureIds: [],
    itemTextureIds: [],
    guiTextureIds: [],
    particleIds: [],
    fontIds: [],
    equipmentIds: [],
    atlasIds: [],
    soundEventIds: [],
    soundFiles: [],
    langFiles: [],
    truncated: false,
  };

  // items/*.json —— 1.21.4+ 的物品模型定义（等同物品注册表）
  if (await dirExists(path.join(nsDir, 'items'))) {
    out.itemIds = (await readDirSafe(path.join(nsDir, 'items')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // blockstates/*.json —— 方块注册表
  if (await dirExists(path.join(nsDir, 'blockstates'))) {
    out.blockIds = (await readDirSafe(path.join(nsDir, 'blockstates')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // particles/*.json
  if (await dirExists(path.join(nsDir, 'particles'))) {
    out.particleIds = (await readDirSafe(path.join(nsDir, 'particles')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // font/*.json
  if (await dirExists(path.join(nsDir, 'font'))) {
    out.fontIds = (await readDirSafe(path.join(nsDir, 'font')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // equipment/*.json（1.21.5+ 装备资产）
  if (await dirExists(path.join(nsDir, 'equipment'))) {
    out.equipmentIds = (await readDirSafe(path.join(nsDir, 'equipment')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // atlases/*.json
  if (await dirExists(path.join(nsDir, 'atlases'))) {
    out.atlasIds = (await readDirSafe(path.join(nsDir, 'atlases')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // lang/*.json
  if (await dirExists(path.join(nsDir, 'lang'))) {
    out.langFiles = (await readDirSafe(path.join(nsDir, 'lang')) || { files: [] }).files
      .filter(f => /\.json$/i.test(f)).map(stripJson).sort();
  }
  // sounds（资源包里可能有 sounds/ 目录，或根下 sounds.json）
  if (await dirExists(path.join(nsDir, 'sounds'))) {
    const o = { ext: /\.(ogg|wav|fsb|mp3)$/i, out: [], cap: MAX_ENTRIES };
    await walk(path.join(nsDir, 'sounds'), '', 0, o);
    out.soundFiles = o.out;
  }

  // models/**/*.json
  if (await dirExists(path.join(nsDir, 'models'))) {
    const o = { ext: /\.json$/i, out: [], cap: MAX_ENTRIES };
    await walk(path.join(nsDir, 'models'), '', 0, o);
    out.modelIds = o.out;
    out.truncated = out.truncated || o.out.length >= MAX_ENTRIES;
  }
  // textures/**/*.png
  if (await dirExists(path.join(nsDir, 'textures'))) {
    const o = { ext: /\.png$/i, out: [], cap: MAX_ENTRIES };
    await walk(path.join(nsDir, 'textures'), '', 0, o);
    out.textureIds = o.out;
    out.truncated = out.truncated || o.out.length >= MAX_ENTRIES;
    for (const t of o.out) {
      if (t.indexOf('block/') === 0) out.blockTextureIds.push(t);
      else if (t.indexOf('item/') === 0) out.itemTextureIds.push(t);
      else if (t.indexOf('gui/') === 0) out.guiTextureIds.push(t);
    }
  }
  return out;
}

/**
 * 扫描整个 assets 根目录（其下每个子目录视为一个命名空间）
 * @param {string} root 形如 .../assets 或 CE 的 .../resources
 * @returns {Promise<{ok:boolean, root?:string, namespaces?:object, error?:string}>}
 */
async function scanAssets(root) {
  if (typeof root !== 'string' || !root) return { ok: false, error: 'empty root' };
  if (!(await dirExists(root))) return { ok: false, error: 'not a directory' };
  const listing = await readDirSafe(root);
  if (!listing) return { ok: false, error: 'cannot read directory' };

  const namespaces = {};
  const roots = [];

  // root 自身可能就是命名空间目录（如 <resources>/<namespace>）
  let selfIsNs = false;
  for (const marker of NS_MARKERS) {
    if (listing.dirs.indexOf(marker) !== -1) { selfIsNs = true; break; }
  }
  if (selfIsNs) {
    const ns = path.basename(root);
    namespaces[ns] = await scanNamespace(root, ns);
    roots.push(ns);
  } else {
    for (const d of listing.dirs) {
      if (d === '.mcassetsroot' || d.startsWith('.')) continue;
      const nsDir = path.join(root, d);
      const sub = await readDirSafe(nsDir);
      if (!sub) continue;
      let isNs = false;
      for (const marker of NS_MARKERS) {
        if (sub.dirs.indexOf(marker) !== -1) { isNs = true; break; }
      }
      if (!isNs) continue;
      namespaces[d] = await scanNamespace(nsDir, d);
      roots.push(d);
    }
  }

  if (!roots.length) return { ok: false, error: 'no asset namespace found' };
  await loadNamespaceLangs(namespaces);
  return { ok: true, root: root.replace(/\\/g, '/'), namespaces: namespaces, order: roots };
}

/** 语言文件内容上限：原版 zh_cn.json 约 400KB，留足余量 */
const MAX_LANG_BYTES = 4 * 1024 * 1024;

/**
 * 把每个命名空间下 lang/*.json 的内容读出来，供渲染进程离线查表。
 * 原版物品/方块/附魔/属性名都靠这些键解析，之前只读了文件名列表，
 * 预览只能拿到 en_us/zh_cn 两份（还是渲染进程另行 fetch 的），
 * 其它语言、以及被 scanNamespace 漏掉的情况就查不到名字了。
 * @param {object} namespaces scanNamespace 的结果表
 */
async function loadNamespaceLangs(namespaces) {
  for (const ns of Object.keys(namespaces || {})) {
    const rec = namespaces[ns];
    const files = rec.langFiles || [];
    if (!files.length) continue;
    const dir = path.join(rec.dir, 'lang');
    const langs = {};
    for (const name of files) {
      const file = path.join(dir, name + '.json');
      try {
        const st = await fs.promises.stat(file);
        if (!st.isFile() || st.size > MAX_LANG_BYTES) continue;
        langs[name] = JSON.parse(await fs.promises.readFile(file, 'utf-8'));
      } catch (e) { /* 单个语言文件坏掉不影响整体扫描 */ }
    }
    if (Object.keys(langs).length) rec.langs = langs;
  }
}

/**
 * 从 lang/en_us.json 之类的语言文件里提取音效事件名（subtitles.* 键）
 * 原版 sounds.json 不在 assets 内，字幕键是资源目录里唯一可靠的音效事件来源。
 */
async function readSoundEvents(nsDir, langName) {
  const file = path.join(nsDir, 'lang', (langName || 'en_us') + '.json');
  if (!(await fileExists(file))) return null;
  try {
    const txt = await fs.promises.readFile(file, 'utf-8');
    const parts = JSON.parse(txt);
    const out = [];
    for (const k of Object.keys(parts)) {
      if (k.indexOf('subtitles.') !== 0) continue;
      out.push(k.slice('subtitles.'.length));
    }
    out.sort();
    return out;
  } catch (e) {
    return null;
  }
}

/** 读取 JSON 文本（原样返回，交由渲染进程解析） */
async function readTextFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return { success: false, error: 'invalid path' };
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content: content };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};
const MAX_BINARY = 32 * 1024 * 1024; // 单文件 32MB 上限（避免把巨型文件塞进 IPC）

// 二进制读取缓存: key = path|mtimeMs|size
const _binaryCache = new Map();
const _BINARY_CACHE_MAX = 600;

/** 读取二进制文件并转成 data URL（供 <img>/canvas 直接使用） */
async function readBinaryDataUrl(filePath) {
  if (typeof filePath !== 'string' || !filePath) return { success: false, error: 'invalid path' };
  let st;
  try { st = await fs.promises.stat(filePath); } catch (e) { return { success: false, error: e.message }; }
  if (!st.isFile()) return { success: false, error: 'not a file' };
  if (st.size > MAX_BINARY) return { success: false, error: 'file too large', size: st.size };

  const key = filePath + '|' + st.mtimeMs + '|' + st.size;
  const hit = _binaryCache.get(key);
  if (hit) return hit;

  try {
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const res = { success: true, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'), mime: mime, size: st.size };
    if (_binaryCache.size >= _BINARY_CACHE_MAX) {
      // 简单 FIFO 淘汰
      const first = _binaryCache.keys().next();
      if (!first.done) _binaryCache.delete(first.value);
    }
    _binaryCache.set(key, res);
    return res;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** 常见 Minecraft 资源目录候选（按存在性过滤；供设置页一键检测） */
async function detectRoots() {
  const cands = [];
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const push = (p) => { if (p) cands.push(path.normalize(p)); };

  push('E:\\MC\\Windose\\.minecraft\\versions');
  if (home) {
    push(path.join(home, 'AppData', 'Roaming', '.minecraft', 'versions'));
    push(path.join(home, '.minecraft', 'versions'));
    push(path.join(home, 'AppData', 'Roaming', '.minecraft', 'assets'));
    push(path.join(home, '.minecraft', 'assets'));
  }
  push('C:\\MC\\.minecraft\\assets');

  const found = [];
  const seen = new Set();
  // 版本目录: 展开到 <version>/<version>/assets 或 <version>/assets
  for (const c of cands) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (!(await dirExists(c))) continue;
    if (path.basename(c) === 'assets') { found.push(c); continue; }
    const versions = await readDirSafe(c);
    if (!versions) continue;
    if (versions.dirs.indexOf('assets') !== -1) { found.push(c); continue; }
    for (const v of versions.dirs) {
      const v1 = path.join(c, v);
      const l1 = await readDirSafe(v1);
      if (!l1) continue;
      if (l1.dirs.indexOf('assets') !== -1) { found.push(path.join(v1, 'assets')); continue; }
      for (const v2 of l1.dirs) {
        const v2p = path.join(v1, v2);
        const l2 = await readDirSafe(v2p);
        if (l2 && l2.dirs.indexOf('assets') !== -1) found.push(path.join(v2p, 'assets'));
      }
    }
  }

  // 打分排序: 优先「真正包含原版 minecraft 命名空间」的目录,
  // 排除模组/脚本自带的 assets (kubejs / customnpcs 等)
  const scored = [];
  for (const f of found) {
    let score = 0;
    const mcNs = path.join(f, 'minecraft');
    if (await fileExists(path.join(mcNs, 'lang', 'en_us.json'))) score += 10;
    if (await dirExists(path.join(mcNs, 'items'))) score += 6;
    if (await dirExists(path.join(mcNs, 'blockstates'))) score += 4;
    if (await dirExists(path.join(mcNs, 'textures'))) score += 2;
    if (/[\\/](kubejs|mods|customnpcs|config)[\\/]/i.test(f)) score -= 20;
    if (score <= 0) continue;
    scored.push({ root: f, score: score });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.root.length - b.root.length));
  return scored.map(s => s.root);
}

module.exports = {
  scanAssets,
  scanNamespace,
  readSoundEvents,
  readTextFile,
  readBinaryDataUrl,
  detectRoots,
  NS_MARKERS,
};
