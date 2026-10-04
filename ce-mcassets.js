/* ChoTenEditor Minecraft 资源注册表（渲染进程）
 * 依赖: 无（使用 window.electronAPI.mc / .readdir，缺失时全部降级为空数据）
 * 提供: CraftEngine 补全 (picker) 与预览 (preview) 所需的原版 + 工程资源索引。
 *
 * 数据来源:
 *   1) 原版资源目录   <设置 mcAssetsPath>/<命名空间>            （如 .../assets/minecraft）
 *   2) CE 资源包       <工程 resources>/<包名>/resourcepack/assets/<命名空间>
 * 二者按 namespace 合并；同一个 namespace 可能存在多个根，全部保留
 * （解析顺序: 当前工程包 → 其它工程包 → 原版），避免「某个包的贴图被另一个包挤掉」。
 *
 * 对外 API:
 *   CEMCAssets.init(opts) -> Promise<状态>
 *   CEMCAssets.ready                       Promise
 *   CEMCAssets.onReady(cb)                 扫描完成后回调（可多次注册）
 *   CEMCAssets.rescan()                    清缓存重扫
 *   CEMCAssets.lists                       { kind: string[] } 已合并的候选值（带命名空间前缀）
 *   CEMCAssets.listFor(kind)               -> string[]
 *   CEMCAssets.namespaces()                -> string[]
 *   CEMCAssets.nsDir(ns)                   -> string | null     （首选根）
 *   CEMCAssets.nsDirs(ns)                  -> string[]          （全部根，工程优先）
 *   CEMCAssets.resolve(kind, id)           -> 绝对路径 | null   （首选根，kind: texture/model/font/item/blockstate/lang/sound）
 *   CEMCAssets.resolveCandidates(kind, id) -> string[]          （所有根的候选路径，按优先级）
 *   CEMCAssets.loadImage(kind, id)         -> Promise<HTMLImageElement|null>
 *   CEMCAssets.loadJson(kind, id)          -> Promise<Object|null>
 *   CEMCAssets.langName(id, lang)          -> string  （原版显示名，找不到返回 id 的 path 部分）
 *   CEMCAssets.projectResourcesRoot()      -> 当前工程 resources 根（绝对路径，posix 分隔）
 *   CEMCAssets.setActiveFile(filePath)     切换当前文件 → 重新定位工程
 *   CEMCAssets.status()                    -> { state, mcRoot, projectRoot, counts, error }
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (root.CEMCAssets) return;

  // ---------------- 状态 ----------------
  var STATE = {
    state: 'idle',        // idle | loading | ready | error
    mcRoot: null,         // 原版 assets 根
    projectRoot: null,    // CE resources 根
    error: null,
    counts: {},
    scannedAt: 0,
  };

  var REG = Object.create(null);   // ns -> registry（见 mc-assets.js scanNamespace 输出）+ { root }
  var ROOTS = Object.create(null); // ns -> [{ dir, fromProject, pack }] 同名命名空间的全部根（工程优先，原版兜底）
  var LISTS = Object.create(null); // kind -> string[]（带 ns 前缀，已排序去重）
  var LANG = Object.create(null);  // lang -> { key: value }（原版 en_us / zh_cn）
  var LANG_NORM = Object.create(null); // ns -> { lang -> {key:value} }（工程语言文件）
  var _readyResolve = null;
  var readyPromise = new Promise(function (res) { _readyResolve = res; });
  var _listeners = [];
  var _scanToken = 0;
  var _imgCache = Object.create(null);   // 'path' -> Promise<Image>
  var _jsonCache = Object.create(null);  // 'path' -> Promise<Object|null>
  var _activeFile = null;
  var _inflight = null;                  // 在途扫描 Promise (并发 init 共享)

  function t(key, fb, params) {
    try {
      if (root.I18N && typeof root.I18N.t === 'function') {
        var v = root.I18N.t(key, params);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fb;
  }
  function api() { return root.electronAPI; }
  function mcApi() { var a = api(); return a && a.mc ? a.mc : null; }
  function readdir(p) {
    var a = api();
    if (!a || !a.readdir) return Promise.resolve({ success: false });
    return a.readdir(p).catch(function () { return { success: false }; });
  }
  function norm(p) { return String(p || '').replace(/\\/g, '/'); }
  function splitId(id) {
    var s = String(id || '');
    var i = s.indexOf(':');
    if (i === -1) return { ns: '', path: s };
    return { ns: s.slice(0, i), path: s.slice(i + 1) };
  }

  function getConfig() {
    try { return JSON.parse(localStorage.getItem('editorConfig') || '{}'); } catch (e) { return {}; }
  }
  // 设置里配置的原版资源目录；未配置时尝试常见位置
  function configuredRoot() {
    var cfg = getConfig();
    var p = cfg.mcAssetsPath;
    return (typeof p === 'string' && p.trim()) ? p.trim() : null;
  }

  // ---------------- 路径推导 ----------------
  // 从当前文件路径定位 CE 工程 resources 根（与 craftengine-interpreter 的 _ceElemResourcesRoot 同构）
  function resourcesRootFromFile(filePath) {
    var parts = norm(filePath).split('/');
    for (var i = parts.length - 2; i >= 1; i--) {
      if (parts[i] === 'configuration' || parts[i] === 'configurations') {
        // <resources>/<pack>/configuration/...
        if (i < 2) return null;
        return { resourcesRoot: parts.slice(0, i - 1).join('/'), packName: parts[i - 1] };
      }
    }
    return null;
  }

  // ---------------- 扫描 ----------------
  function addList(kind, values) {
    if (!LISTS[kind]) LISTS[kind] = [];
    for (var i = 0; i < values.length; i++) LISTS[kind].push(values[i]);
  }

  function computeLists() {
    LISTS = Object.create(null);
    Object.keys(REG).forEach(function (ns) {
      var r = REG[ns];
      var pfx = ns + ':';
      var add = function (kind, arr) {
        if (!arr || !arr.length) return;
        var out = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) out[i] = pfx + arr[i];
        addList(kind, out);
      };
      add('items', r.itemIds);
      add('blocks', r.blockIds);
      add('textures', r.textureIds);
      add('blockTextures', r.blockTextureIds);
      add('itemTextures', r.itemTextureIds);
      add('guiTextures', r.guiTextureIds);
      add('models', r.modelIds);
      add('particles', r.particleIds);
      add('fonts', r.fontIds);
      add('equipments', r.equipmentIds);
      add('atlases', r.atlasIds);
      add('soundFiles', r.soundFiles);
      // 语言派生注册表 (由 harvestFromLang 写入注册表字段)
      add('enchantments', r.enchantmentIds);
      add('potionEffects', r.potionEffectIds);
      add('entities', r.entityIds);
      add('biomes', r.biomeIds);
      add('attributes', r.attributeIds);
      add('paintings', r.paintingIds);
      add('jukeboxSongs', r.jukeboxSongIds);
      add('soundEvents', r.soundEventIds);
      // block/item 模型子集（按目录前缀切分）
      addList('blockModels', (r.modelIds || []).filter(isBlockModel).map(function (v) { return pfx + v; }));
      addList('itemModels', (r.modelIds || []).filter(function (v) { return v.indexOf('item/') === 0; }).map(function (v) { return pfx + v; }));
    });
    // 去重 + 排序
    Object.keys(LISTS).forEach(function (k) {
      var seen = Object.create(null);
      var out = [];
      for (var i = 0; i < LISTS[k].length; i++) {
        var v = LISTS[k][i];
        if (!seen[v]) { seen[v] = 1; out.push(v); }
      }
      out.sort();
      LISTS[k] = out;
    });
    STATE.counts = {};
    Object.keys(LISTS).forEach(function (k) { STATE.counts[k] = LISTS[k].length; });
  }
  function isBlockModel(v) {
    return v.indexOf('block/') === 0 || v.indexOf('block_') === 0;
  }

  // 语言键扫描: 从 en_us.json 抽取实体/魔咒/药水/群系/属性/画/唱片等注册表
  // 结果写回注册表字段 (而不是直接改 LISTS), 这样 computeLists() 可以幂等重建
  var LANG_BUCKETS = {
    enchantments: ['enchantmentIds', 'enchantment.minecraft.'],
    potionEffects: ['potionEffectIds', 'effect.minecraft.'],
    entities: ['entityIds', 'entity.minecraft.'],
    biomes: ['biomeIds', 'biome.minecraft.'],
    attributes: ['attributeIds', 'attribute.minecraft.'],
    paintings: ['paintingIds', 'painting.minecraft.'],
    jukeboxSongs: ['jukeboxSongIds', 'jukebox_song.minecraft.'],
  };
  function harvestFromLang(ns, langObj) {
    var r = REG[ns];
    if (!r || !langObj) return;
    Object.keys(LANG_BUCKETS).forEach(function (kind) {
      var field = LANG_BUCKETS[kind][0];
      var prefix = LANG_BUCKETS[kind][1];
      var out = [];
      Object.keys(langObj).forEach(function (k) {
        if (k.indexOf(prefix) !== 0) return;
        var id = k.slice(prefix.length);
        if (id.indexOf('.') !== -1) return; // 只取一级（排除 .desc 之类）
        out.push(id);
      });
      out.sort();
      r[field] = out;
    });
    // 字幕 → 音效事件
    var snd = [];
    Object.keys(langObj).forEach(function (k) {
      if (k.indexOf('subtitles.') !== 0) return;
      snd.push(k.slice('subtitles.'.length));
    });
    snd.sort();
    r.soundEventIds = snd;
  }

  async function fetchLang(nsRoot, lang) {
    var m = mcApi();
    if (!m) return null;
    var res = await m.readText(norm(nsRoot) + '/lang/' + lang + '.json');
    if (!res || !res.success) return null;
    try { return JSON.parse(res.content); } catch (e) { return null; }
  }

  async function scanVanillaRoot(mcRoot) {
    var m = mcApi();
    if (!m) return;
    var res = await m.scanAssets(mcRoot);
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'scan failed');
    Object.keys(res.namespaces || {}).forEach(function (ns) {
      var r = res.namespaces[ns];
      r.root = norm(r.dir);
      REG[ns] = Object.assign(REG[ns] || {}, r);
      addRoot(ns, r.dir, false, null);
    });
  }

  // 扫描 CE 工程: resources/<pack>/resourcepack/assets/<ns>
  async function scanProject(resourcesRoot) {
    var m = mcApi();
    if (!m || !resourcesRoot) return;
    var listing = await readdir(resourcesRoot);
    if (!listing || !listing.success) return;
    var packs = (listing.files || []).filter(function (f) { return f.isDirectory && f.name.charAt(0) !== '.'; });
    for (var i = 0; i < packs.length; i++) {
      var packDir = norm(packs[i].path);
      var assetsDir = packDir + '/resourcepack/assets';
      var sub = await readdir(assetsDir);
      if (!sub || !sub.success) continue;
      var res = await m.scanAssets(assetsDir);
      if (!res || !res.ok) continue;
      Object.keys(res.namespaces || {}).forEach(function (ns) {
        var r = res.namespaces[ns];
        r.root = norm(r.dir);
        r.fromProject = true;
        r.pack = packs[i].name;
        // 工程资源优先: 合并到已有条目（同名覆盖）+ 记录独立的根
        addRoot(ns, r.dir, true, packs[i].name);
        var prev = REG[ns];
        if (prev) {
          REG[ns] = mergeRegistry(prev, r);
        } else {
          REG[ns] = r;
        }
      });
      // 工程语言文件（lang/*.json 覆盖原版）
      Object.keys(res.namespaces || {}).forEach(function (ns) {
        var r = REG[ns];
        if (!r || !r.langFiles || !r.langFiles.length) return;
        LANG_NORM[ns] = LANG_NORM[ns] || {};
      });
    }
  }

  // ---------------- 多根解析 ----------------
  // 同一个命名空间可能同时存在于原版 assets 与多个工程资源包
  // (resources/<pack>/resourcepack/assets/<ns>)。若只保留一个 root,
  // 某个包里的贴图/字体就会在另一个包被扫描后失效 (字体回退成点阵、字体图像变成小红块)。
  // 这里保留全部根, 并把「当前工程包」排到最前, 原版排到最后。
  function addRoot(ns, dir, fromProject, pack) {
    var d = norm(dir);
    if (!d) return;
    var arr = ROOTS[ns] || (ROOTS[ns] = []);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].dir !== d) continue;
      if (fromProject) { arr[i].fromProject = true; arr[i].pack = pack || arr[i].pack; }
      return;
    }
    arr.push({ dir: d, fromProject: !!fromProject, pack: pack || null });
  }
  function sortRoots() {
    var rr = _activeFile ? resourcesRootFromFile(_activeFile) : null;
    var pack = rr ? rr.packName : null;
    var rank = function (r) { return (r.fromProject ? 0 : 2) + (pack && r.pack === pack ? -1 : 0); };
    Object.keys(ROOTS).forEach(function (ns) {
      ROOTS[ns].sort(function (a, b) { return rank(a) - rank(b); });
    });
  }
  function rootsOf(ns) {
    var arr = ROOTS[ns];
    if (arr && arr.length) return arr.map(function (r) { return r.dir; });
    var reg = REG[ns];
    return reg && reg.root ? [reg.root] : [];
  }

  function mergeRegistry(a, b) {
    var out = Object.assign({}, a);
    ['itemIds', 'blockIds', 'modelIds', 'textureIds', 'blockTextureIds', 'itemTextureIds',
      'guiTextureIds', 'particleIds', 'fontIds', 'equipmentIds', 'atlasIds',
      'soundEventIds', 'soundFiles', 'langFiles',
      'enchantmentIds', 'potionEffectIds', 'entityIds', 'biomeIds',
      'attributeIds', 'paintingIds', 'jukeboxSongIds'].forEach(function (k) {
      var merged = (a[k] || []).concat(b[k] || []);
      var seen = Object.create(null);
      var res = [];
      for (var i = 0; i < merged.length; i++) {
        if (!seen[merged[i]]) { seen[merged[i]] = 1; res.push(merged[i]); }
      }
      out[k] = res;
    });
    out.root = b.root || a.root;
    out.fromProject = true;
    return out;
  }

  async function doScan(opts) {
    var token = ++_scanToken;
    STATE.state = 'loading';
    STATE.error = null;
    REG = Object.create(null);
    ROOTS = Object.create(null);
    LISTS = Object.create(null);

    try {
      var mcRoot = (opts && opts.mcRoot) || configuredRoot();
      if (!mcRoot) {
        // 自动探测
        var m = mcApi();
        if (m && m.detectRoots) {
          var det = await m.detectRoots();
          if (det && det.ok && det.roots && det.roots.length) mcRoot = det.roots[0];
        }
      }
      STATE.mcRoot = mcRoot || null;
      if (mcRoot) {
        try { await scanVanillaRoot(mcRoot); } catch (e) { STATE.error = String(e && e.message || e); }
      } else {
        STATE.error = 'mcAssetsNotFound';
      }
      if (token !== _scanToken) return STATE;

      // 工程资源包
      var file = (opts && opts.filePath) || _activeFile;
      var rr = file ? resourcesRootFromFile(file) : null;
      var resRoot = rr ? rr.resourcesRoot : null;
      if (!resRoot && mcRoot) {
        // 兜底: 通过主进程的工程根回溯拿 resources 目录
        var a = api();
        if (a && a.ce && file) {
          try {
            var pr = await a.ce.resolveProjectRoot(file);
            if (pr && pr.found) {
              var base = pr.pluginRoot || pr.packRoot;
              if (base) {
                var cand = norm(base) + '/resources';
                var chk = await readdir(cand);
                if (chk && chk.success) resRoot = cand;
                else resRoot = norm(base);
              }
            }
          } catch (e) { /* 忽略 */ }
        }
      }
      STATE.projectRoot = resRoot || null;
      if (resRoot) await scanProject(resRoot);
      sortRoots();
      if (token !== _scanToken) return STATE;

      computeLists();

      // 原版语言（用于预览显示名 + 注册表补充）
      // en_us 恒加载 (Minecraft 回退语言); zh_cn 恒加载 (源语言兜底);
      // 再加载当前界面语言对应的原版语言文件, 让预览名跟随语言设置。
      if (mcRoot) {
        // 扫描阶段已顺带读出的语言内容优先（覆盖资源包内所有语言、所有命名空间）；
        // 只有本地没扫到、或要的是扫描范围外的语言时才回落到按需读取。
        var langNs = REG['minecraft'] && REG['minecraft'].langs;
        if (langNs) {
          Object.keys(langNs).forEach(function (lg) {
            if (!LANG[lg]) LANG[lg] = langNs[lg];
          });
        }
        var en = LANG.en_us || await fetchLang(norm(mcRoot) + '/minecraft', 'en_us');
        if (en) {
          LANG.en_us = en;
          harvestFromLang('minecraft', en);
          var zh = LANG.zh_cn || await fetchLang(norm(mcRoot) + '/minecraft', 'zh_cn');
          if (zh) LANG.zh_cn = zh;
          computeLists();
        }
        var uiLang = (typeof I18N !== 'undefined' && I18N.lang) ? I18N.lang : 'zh_cn';
        if (uiLang !== 'en_us' && uiLang !== 'zh_cn' && !LANG[uiLang]) {
          var ui = await fetchLang(norm(mcRoot) + '/minecraft', uiLang);
          if (ui) LANG[uiLang] = ui;
        }
      }
      // 工程语言文件（覆盖原版同 ns）
      Object.keys(REG).forEach(function (ns) {
        var r = REG[ns];
        if (!r || !r.fromProject || !r.langFiles || !r.langFiles.length) return;
        LANG_NORM[ns] = LANG_NORM[ns] || {};
      });

      STATE.state = 'ready';
      STATE.scannedAt = Date.now();
    } catch (e) {
      STATE.state = 'error';
      STATE.error = String(e && e.message || e);
    }
    try { _readyResolve(STATE); } catch (e) {}
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](STATE); } catch (e) {}
    }
    return STATE;
  }

  // ---------------- 路径解析 ----------------
  var KIND_DIR = {
    texture: 'textures', model: 'models', font: 'font',
    item: 'items', blockstate: 'blockstates', particle: 'particles',
    atlas: 'atlases', equipment: 'equipment', sound: 'sounds',
  };
  var KIND_EXT = {
    texture: '.png', model: '.json', font: '.json', item: '.json',
    blockstate: '.json', particle: '.json', atlas: '.json', equipment: '.json',
  };

  function pathOf(kind, root, p) {
    if (!root) return null;
    if (kind === 'lang') return root + '/lang/' + (p || 'en_us') + '.json';
    var dir = KIND_DIR[kind];
    if (!dir) return null;
    return root + '/' + dir + '/' + p + (KIND_EXT[kind] || '');
  }

  // 所有根的候选路径（工程优先）。调用方按顺序尝试，第一个能读到的即命中。
  function resolveCandidates(kind, id) {
    var s = splitId(id);
    var ns = s.ns || 'minecraft';
    var reg = REG[ns];
    // 无命名空间且不是 minecraft 时，优先当前工程命名空间
    if (!s.ns) {
      var cur = currentNamespace();
      if (cur && REG[cur]) { ns = cur; reg = REG[cur]; }
    }
    if (!reg || !reg.root) return [];
    var roots = rootsOf(ns);
    var out = [];
    var seen = Object.create(null);
    var push = function (p) { if (p && !seen[p]) { seen[p] = 1; out.push(p); } };
    if (kind === 'sound') {
      var exts = ['.ogg', '.wav', '.mp3', '.fsb', ''];
      for (var r = 0; r < roots.length; r++) {
        for (var i = 0; i < exts.length; i++) {
          if (_pathKnown(reg, 'soundFiles', s.path + exts[i]) || i === exts.length - 1) {
            push(roots[r] + '/sounds/' + s.path + exts[i]);
          }
        }
      }
      return out;
    }
    if (!KIND_DIR[kind]) return [];
    for (var k = 0; k < roots.length; k++) push(pathOf(kind, roots[k], s.path));
    return out;
  }

  // 首选路径（兼容旧调用: picker/诊断只需要一个「最可能的」路径）
  function resolve(kind, id) {
    var list = resolveCandidates(kind, id);
    return list.length ? list[0] : null;
  }

  function _pathKnown(reg, key, value) {
    var arr = reg[key];
    if (!arr) return false;
    return arr.indexOf(value) !== -1;
  }

  function currentNamespace() {
    if (!_activeFile) return null;
    var rr = resourcesRootFromFile(_activeFile);
    if (rr && rr.packName) {
      // 包名未必等于命名空间; 从注册表里找 fromProject 且 root 含该包名的
      var found = null;
      Object.keys(REG).forEach(function (ns) {
        if (found) return;
        var r = REG[ns];
        if (r && r.fromProject && r.root && r.root.indexOf('/' + rr.packName + '/') !== -1) found = ns;
      });
      if (found) return found;
    }
    return null;
  }

  // ---------------- 资源加载 ----------------
  function loadImage(kind, id) {
    var p = resolve(kind, id);
    if (!p) return Promise.resolve(null);
    return loadImagePath(p);
  }
  function loadImagePath(p) {
    if (_imgCache[p]) return _imgCache[p];
    var m = mcApi();
    if (!m) return Promise.resolve(null);
    _imgCache[p] = m.readBinary(p).then(function (res) {
      if (!res || !res.success || !res.dataUrl) return null;
      return new Promise(function (res2) {
        var img = new Image();
        img.onload = function () { res2(img); };
        img.onerror = function () { res2(null); };
        img.src = res.dataUrl;
      });
    }).catch(function () { return null; });
    return _imgCache[p];
  }
  function loadJson(kind, id) {
    var p = resolve(kind, id);
    if (!p) return Promise.resolve(null);
    return loadJsonPath(p);
  }
  function loadJsonPath(p) {
    if (_jsonCache[p]) return _jsonCache[p];
    var m = mcApi();
    if (!m) return Promise.resolve(null);
    _jsonCache[p] = m.readText(p).then(function (res) {
      if (!res || !res.success) return null;
      try { return JSON.parse(res.content); } catch (e) { return null; }
    }).catch(function () { return null; });
    return _jsonCache[p];
  }

  function langName(id, lang) {
    var s = splitId(id);
    var l = lang
      || ((typeof I18N !== 'undefined' && I18N.lang) ? I18N.lang : 'zh_cn');
    // 回退链: 当前语言 → (zh_tw 走 en) → zh_cn → en_us
    var chain;
    if (l === 'zh_cn') chain = ['zh_cn', 'en_us'];
    else if (l === 'zh_tw') chain = ['zh_tw', 'en_us', 'zh_cn'];
    else chain = [l, 'en_us', 'zh_cn'];
    var objs = [];
    for (var c = 0; c < chain.length; c++) {
      var cl = chain[c];
      if (LANG_NORM[s.ns] && LANG_NORM[s.ns][cl]) objs.push(LANG_NORM[s.ns][cl]);
      if (LANG[cl]) objs.push(LANG[cl]);
    }
    var keys = ['item.minecraft.', 'block.minecraft.', 'entity.minecraft.', 'enchantment.minecraft.',
      'effect.minecraft.', 'biome.minecraft.', 'attribute.minecraft.', 'painting.minecraft.',
      'jukebox_song.minecraft.'];
    for (var i = 0; i < objs.length; i++) {
      for (var j = 0; j < keys.length; j++) {
        var v = objs[i][keys[j] + s.path];
        if (typeof v === 'string' && v) return v;
      }
      // 工程自定义翻译（无前缀）
      var direct = objs[i][s.path];
      if (typeof direct === 'string' && direct) return direct;
    }
    return null;
  }

  // ---------------- 对外 ----------------
  function listFor(kind) { return (LISTS[kind] || []).slice(); }
  function namespaces() { return Object.keys(REG); }
  function nsDir(ns) { return REG[ns] ? (rootsOf(ns)[0] || REG[ns].root) : null; }
  function nsDirs(ns) { return REG[ns] ? rootsOf(ns).slice() : []; }
  function registryOf(ns) { return REG[ns] || null; }

  function init(opts) {
    // 已有结果直接复用; 正在扫描则共享同一个 Promise (避免并发扫描互相作废)
    if (STATE.state === 'ready' && !(opts && opts.force)) return Promise.resolve(STATE);
    if (_inflight) return _inflight;
    return startScan(opts);
  }
  function startScan(opts) {
    var p = doScan(opts || {});
    _inflight = p;
    var clear = function () { if (_inflight === p) _inflight = null; };
    p.then(clear, clear);
    return p;
  }
  function rescan(opts) {
    _imgCache = Object.create(null);
    _jsonCache = Object.create(null);
    LANG = Object.create(null);
    LANG_NORM = Object.create(null);
    _inflight = null;   // 丢弃在途扫描, 启动新的 (旧扫描会因 token 变化自行放弃)
    return startScan(opts);
  }
  function setActiveFile(filePath) {
    if (filePath === _activeFile) return Promise.resolve(STATE);
    _activeFile = filePath || null;
    // 当前包变了 → 重新排序多根（工程包优先），保证同命名空间下优先读本包资源
    sortRoots();
    // 工程切换才会影响结果（原版资源不变），仅当 resources 根变化时重扫
    var prev = STATE.projectRoot;
    var rr = _activeFile ? resourcesRootFromFile(_activeFile) : null;
    var next = rr ? rr.resourcesRoot : null;
    if (norm(prev) === norm(next)) return Promise.resolve(STATE);
    return rescan({ filePath: _activeFile });
  }
  function onReady(cb) {
    if (typeof cb !== 'function') return;
    if (STATE.state === 'ready' || STATE.state === 'error') { try { cb(STATE); } catch (e) {} return; }
    _listeners.push(cb);
  }
  function status() {
    return {
      state: STATE.state, mcRoot: STATE.mcRoot, projectRoot: STATE.projectRoot,
      error: STATE.error, counts: STATE.counts, scannedAt: STATE.scannedAt,
      namespaces: namespaces(),
    };
  }

  root.CEMCAssets = {
    get ready() { return readyPromise; },
    init: init,
    rescan: rescan,
    setActiveFile: setActiveFile,
    onReady: onReady,
    status: status,
    listFor: listFor,
    namespaces: namespaces,
    nsDir: nsDir,
    nsDirs: nsDirs,
    rootsOf: rootsOf,
    registryOf: registryOf,
    resolve: resolve,
    resolveCandidates: resolveCandidates,
    loadImage: loadImage,
    loadImagePath: loadImagePath,
    loadJson: loadJson,
    loadJsonPath: loadJsonPath,
    langName: langName,
    resourcesRootFromFile: resourcesRootFromFile,
    projectResourcesRoot: function () { return STATE.projectRoot; },
    mcRoot: function () { return STATE.mcRoot; },
    currentNamespace: currentNamespace,
    // 供预览使用: 直接取出语言对象
    langObject: function (lang) { return LANG[lang] || LANG.en_us || null; },
  };
})();
