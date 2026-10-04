/* 独立预览窗口 (真正的 OS 窗口)
 * 主进程开窗 → 加载本页 → 通过 preload 的 preview.* 通道收 ctx, 就地挂载预览面板。
 * 面板本体复用 ce-preview-panel.js (mount/unmount), 不重复实现渲染逻辑。
 */
(function () {
  'use strict';
  var root = window;
  // 标记: 本页是「独立预览窗口」。面板的 render → pushToDetached 会把内容回推给主进程,
  // 若不拦住, 迟到的回声会把独立窗口刚收到的新条目又覆盖回旧的 (状态回退)。
  root.__cePreviewStandalone = true;

  var els = {};
  var mounted = false;
  var lastCtx = null;
  // 本窗口的渲染上下文初始化状态 (贴图注册表 + 字体表)。独立窗口是独立渲染上下文,
  // 不共享主窗口的 CEMCAssets/CEPreview, 首个 payload 到达时要用它带的 mcRoot/file 自举。
  var inited = false;
  var initedMcRoot = null;
  var initPromise = null;

  function $(id) { return document.getElementById(id); }

  function tr(key, fb) {
    try {
      if (root.I18N && root.I18N.t) { var v = root.I18N.t(key); if (v && v !== key) return v; }
    } catch (e) { /* ignore */ }
    return fb != null ? fb : key;
  }

  function setSub(ctx) {
    var bits = [];
    if (ctx && ctx.entryKey) bits.push(ctx.entryKey);
    if (ctx && ctx.section) bits.push(ctx.section);
    if (ctx && ctx.file) bits.push(String(ctx.file).split(/[\\/]/).pop());
    els.sub.textContent = bits.join('  ·  ');
    els.title.textContent = tr('preview.windowTitle', 'MC 场景预览');
    document.title = (ctx && ctx.entryKey ? ctx.entryKey + ' — ' : '') + tr('preview.windowTitle', 'MC 场景预览');
  }

  // 独立窗口自举: 用 payload 携带的 mcRoot/file 初始化本窗口自己的资源注册表与字体表。
  // 没有这一步, 方块模型/贴图解析不出 (注册表为空), 字体也会退回 canvas 合成 (顶置/粗体)。
  // mcRoot/file 都没变时复用, 避免每条 payload 都全量重扫/重置字体表。
  function ensureInited(p) {
    var mcRoot = (p && (p.mcRoot || (root.CEMCAssets && root.CEMCAssets.mcRoot && root.CEMCAssets.mcRoot()))) || null;
    var filePath = (p && p.file) || null;
    if (inited && mcRoot === initedMcRoot) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = (async function () {
      try {
        if (root.CEMCAssets && root.CEMCAssets.init) {
          // mcRoot 变化时必须 force: init 在已就绪时会直接复用旧结果, 不会自己重扫
          await root.CEMCAssets.init({ mcRoot: mcRoot, filePath: filePath, force: inited });
        }
      } catch (e) { /* 注册表失败不阻塞字体 */ }
      try {
        if (root.CEPreview && root.CEPreview.init) {
          await root.CEPreview.init({ mcRoot: mcRoot || (root.CEMCAssets && root.CEMCAssets.mcRoot ? root.CEMCAssets.mcRoot() : null) });
          if (root.CEPreview.fontReady) await root.CEPreview.fontReady();
        }
      } catch (e) { /* 面板渲染有兜底 */ }
      inited = true;
      initedMcRoot = mcRoot;
      initPromise = null;   // 复位: 之后 mcRoot 变化可再次初始化 (并发调用靠共享同一 promise 去重)
    })();
    return initPromise;
  }

  // 把宿主 payload 变成面板认识的 ctx:
  // payload = { file, section, sectionBase, entryKey, data, scene, mcRoot, options }
  async function applyPayload(p) {
    if (!p) return;
    lastCtx = p;
    els.empty.style.display = 'none';
    els.wrap.style.display = '';
    setSub(p);
    await ensureInited(p);
    if (!mounted) {
      root.CEPreviewPanel.mount(els.wrap, p);
      mounted = true;
    } else {
      // 已挂载: 走 follow 轻量换内容 (保留勾选/滚动状态)
      try { root.CEPreviewPanel.follow(p); } catch (e) {
        // follow 失败 (比如窗口被卸载过) 就重挂一次
        mounted = false;
        root.CEPreviewPanel.mount(els.wrap, p);
        mounted = true;
      }
    }
  }

  async function boot() {
    els.title = $('pvw-title');
    els.sub = $('pvw-sub');
    els.empty = $('pvw-empty');
    els.wrap = $('pvw-wrap');
    els.refresh = $('pvw-refresh');
    els.close = $('pvw-close');

    // i18n (缺语言包也要能用, 面板内部自带中文兜底)
    try { if (root.I18N && root.I18N.init) await root.I18N.init(); } catch (e) { /* ignore */ }
    try {
      if (root.I18N && root.I18N.apply) root.I18N.apply(document);
    } catch (e) { /* ignore */ }

    els.close.addEventListener('click', function () {
      if (root.electronAPI && root.electronAPI.preview) root.electronAPI.preview.closeWindow();
      else window.close();
    });
    els.refresh.addEventListener('click', function () {
      // 重新拉一次最新 payload 并重挂, 等价于面板的 ⟳ (也会重扫资源)
      if (root.electronAPI && root.electronAPI.preview) {
        root.electronAPI.preview.getPayload().then(function (p) {
          if (p) { mounted = false; root.CEPreviewPanel.unmount(); applyPayload(p); }
        });
      } else {
        root.CEPreviewPanel.refresh();
      }
    });

    // 主进程推来的内容
    if (root.electronAPI && root.electronAPI.preview) {
      root.electronAPI.preview.onFromWindow(function () { /* 预留 */ });
      // 页面就绪后主动拉一次 (可能早于主进程的 did-finish-load 推送)
      try {
        var p = await root.electronAPI.preview.getPayload();
        if (p) applyPayload(p);
      } catch (e) { /* ignore */ }
      // 之后主进程的每次 preview:updateWindow 推送都要跟上 (自动切换预览/同步面板改动)
      // 注意 preload 里 preview.onUpdate 单订阅, 重复调用会先移除旧的
      if (root.electronAPI.preview.onUpdate) {
        root.electronAPI.preview.onUpdate(function (payload) {
          if (payload) applyPayload(payload);
        });
      }
    }

    // 场景切换等交互回传主窗口 (可选)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.electronAPI && root.electronAPI.preview) {
        root.electronAPI.preview.closeWindow();
      }
    });

    // 窗口尺寸变化时重画 (画布尺寸依赖容器宽度)
    var t = null;
    window.addEventListener('resize', function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { try { root.CEPreviewPanel.refresh(); } catch (e) {} }, 120);
    });
  }

  // 供主进程通过 executeJavaScript 直接调用 (测试/调试用)
  root.__previewWinApply = applyPayload;
  root.__previewWinState = function () {
    return { mounted: mounted, hasCtx: !!lastCtx, entryKey: lastCtx && lastCtx.entryKey,
             inited: inited, mcRoot: initedMcRoot,
             unihex: (function () { try { var u = root.CEPreview && root.CEPreview._internals && root.CEPreview._internals.unihexStatus; return u ? u() : null; } catch (e) { return null; } })(),
             canvas: !!document.querySelector('#pv-canvas') };
  };

  document.addEventListener('DOMContentLoaded', boot);
})();
