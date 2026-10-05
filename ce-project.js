/* CraftEngine 工程根回溯模块（纯 Node，无 electron 依赖，可独立 require 测试）
 * 从配置文件路径向上回溯目录树：
 *   pack 根   = 最近的、形如 CE 资源包目录的祖先目录 —— 命中任一特征即可：
 *               a) 含 pack.yml（带 namespace: 字段）
 *               b) 含 configuration/ 或 configurations/ 子目录
 *               c) 含 resourcepack/ 子目录
 *               d) 自身位于 <resources>/<pack> 两级布局下（即父目录名为 resources）
 *               pack.yml 是**可选**文件（CE 会为每个包生成，但手写/精简包常见缺失），
 *               因此 b/c/d 让没有 pack.yml 的包也能被正确定位。
 *   plugin 根 = 含 config.yml（带 config-version: 且存在 mappings.yml/commands.yml/translations/ 任一）的祖先目录
 * 内容目录名可自定义（如"工程内容"），不硬编码。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LEVELS = 8;
const PACK_NS_RE = /^namespace:\s*(\S+)/m;
// config.yml 版本键: 旧版 config-version:, 新版 (0.1.x+) ___version___: '92'
const PLUGIN_VER_RE = /^[\t ]*(config-version|___version___)\s*:/m;
// CE 特有配置键 (与 craftengine-interpreter 的 CE_CONFIG_KEYS_RE 同源): 出现 ≥2 个即视为 CE config.yml
const CE_CONFIG_KEYS_RE = /^[\t ]*(resource-pack|light-system|chunk-system|client-optimization|forced-locale|metrics)\s*:/gm;
// CE 资源包目录的特征子目录名 (pack.yml 之外的判定依据)
const PACK_DESCENDANT_DIRS = ['configuration', 'configurations', 'resourcepack', 'resourcepack_'];

async function fileExists(p) {
  try { return (await fs.promises.stat(p)).isFile(); } catch (e) { return false; }
}

async function dirExists(p) {
  try { return (await fs.promises.stat(p)).isDirectory(); } catch (e) { return false; }
}

async function readHead(p, bytes) {
  try {
    const fd = await fs.promises.open(p, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fd.read(buf, 0, bytes, 0);
      return buf.toString('utf8', 0, bytesRead);
    } finally { await fd.close(); }
  } catch (e) { return ''; }
}

/**
 * 判断 dir 是否像一个 CE 资源包目录 (pack 根)，并尽可能取出 namespace。
 * pack.yml 可选: 只有它时才读 namespace；否则回退到目录结构特征。
 * @returns {Promise<{isPack:boolean, namespace:string|null}>}
 */
async function _matchPackDir(dir, names) {
  // a) pack.yml + namespace: 字段 (最权威)
  if (names.includes('pack.yml')) {
    const head = await readHead(path.join(dir, 'pack.yml'), 4096);
    const m = head.match(PACK_NS_RE);
    if (m) return { isPack: true, namespace: m[1] };
    // pack.yml 存在但没解析出 namespace: 仍按结构特征判定 (不阻断)
  }
  // b) configuration/ configurations/ resourcepack/ 子目录
  for (const d of PACK_DESCENDANT_DIRS) {
    if (names.includes(d)) {
      try {
        if ((await fs.promises.stat(path.join(dir, d))).isDirectory()) {
          return { isPack: true, namespace: _builtinNamespace(dir) };
        }
      } catch (e) { /* ignore */ }
    }
  }
  // c) 位于 <resources>/<pack> 两级布局下 (父目录名为 resources)
  if (path.basename(path.dirname(dir)) === 'resources') {
    return { isPack: true, namespace: _builtinNamespace(dir) };
  }
  return { isPack: false, namespace: null };
}

// 无 pack.yml 时的 namespace 兜底: CE 约定包目录名即命名空间 (internal / craftengine 为内置包)
function _builtinNamespace(dir) {
  return path.basename(dir);
}

/**
 * 从 filePath 向上回溯，定位 CE 工程根与所属 pack。
 * @param {string} filePath 打开的配置文件绝对路径
 * @returns {Promise<{found:boolean, pluginRoot?:string, packRoot?:string, namespace?:string, contentDirName?:string}>}
 */
async function resolveProjectRoot(filePath) {
  let dir = path.dirname(filePath);
  let packRoot = null;
  let namespace = null;
  let pluginRoot = null;

  for (let i = 0; i < MAX_LEVELS; i++) {
    // NOTE: Sequential async reads (readdir, readHead) across iterations are not atomic;
    // the filesystem could change between calls, producing inconsistent results.
    // This is acceptable for CE project root detection as it's a best-effort heuristic.
    let names = null;
    try { names = await fs.promises.readdir(dir); } catch (e) { break; }

    if (!packRoot) {
      const pack = await _matchPackDir(dir, names);
      if (pack.isPack) { packRoot = dir; namespace = pack.namespace; }
    }

    if (!pluginRoot && names.includes('config.yml')) {
      const head = await readHead(path.join(dir, 'config.yml'), 4096);
      const ceKeys = head.match(CE_CONFIG_KEYS_RE);
      const isCe = PLUGIN_VER_RE.test(head) || (ceKeys && ceKeys.length >= 2);
      if (isCe) {
        const hasBrother = names.includes('mappings.yml') ||
          names.includes('commands.yml') ||
          names.includes('translations');
        if (hasBrother) pluginRoot = dir;
      }
    }

    if (packRoot && pluginRoot) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!packRoot && !pluginRoot) return { found: false };

  let contentDirName = null;
  if (packRoot && pluginRoot && path.dirname(packRoot) !== pluginRoot) {
    contentDirName = path.basename(path.dirname(packRoot));
  }

  return {
    found: true,
    pluginRoot,
    packRoot,
    namespace,
    contentDirName,
  };
}

module.exports = { resolveProjectRoot, MAX_LEVELS, _matchPackDir };

