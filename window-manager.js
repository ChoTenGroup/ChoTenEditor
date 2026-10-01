/* WindowManager: 无遮罩可拖动可关闭窗口系统
 * 与全屏 overlay 不同: 窗口直接挂 body (position:fixed), 不铺背景/不锁滚动/无点击背景关闭;
 * 支持拖标题栏自由移动、右下角拖动改大小、⛶ 最大化/还原、标题栏 ✕ 关闭、点击窗口聚焦置顶。
 * 层级: 窗口层在 990000~998000 的有界区间内轮转 (绝不能冲过应用标题栏的 1000000, 否则
 * 右上角的关闭按钮会被窗口盖住点不到); 顶部还会让开标题栏/菜单栏, 保证窗口自己的 ✕ 可点。
 * 用法:
 *   var win = WindowManager.open({ title, content, width, height, x, y, className, onClose,
 *                                  minWidth, minHeight, resizable, maximizable });
 *   可选 maxTitle/closeTitle/resizeTitle: 控件提示文案 (缺省走 windowManager.* 语言包)。
 *   win.close(); win.setTitle('...'); win.el; win.body;
 *   win.setSize(w, h); win.getSize(); win.toggleMax(); win.isMaximized(); win.onResize(fn);
 * 内容需要跟着窗口大小变化时, 用 win.onResize(fn) (窗口元素上也会派发 'cw:resize' 事件)。
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.WindowManager) return;

  var _windows = [];      // 打开的窗口控制对象
  // z-index 分层: 应用标题栏 1000000 / 菜单栏 1000001 (它们必须在窗口之上, 否则右上角的
  // 关闭按钮会被窗口盖住点不到), 富文本提示 999600, 弹窗遮罩 999997~999999。
  // 所以窗口层用一个有上限、可回收的区间, 绝不能无限递增冲进 1000000 以上。
  var _zBase = 990000;
  var _zMax = 998000;
  var _zTop = _zBase;
  var DEF_MIN_W = 320, DEF_MIN_H = 200;

  function allocZ() {
    if (_zTop >= _zMax) repackZ();   // 到顶就按当前前后顺序重新紧凑分配
    _zTop += 1;
    return _zTop;
  }
  function repackZ() {
    var ws = _windows.slice().sort(function (a, b) {
      return (parseInt(a.el.style.zIndex, 10) || 0) - (parseInt(b.el.style.zIndex, 10) || 0);
    });
    _zTop = _zBase;
    for (var i = 0; i < ws.length; i++) {
      _zTop += 1;
      ws[i].el.style.zIndex = _zTop;
    }
  }
  function frontmostZ() {
    var m = 0;
    for (var i = 0; i < _windows.length; i++) {
      var z = parseInt(_windows[i].el.style.zIndex, 10) || 0;
      if (z > m) m = z;
    }
    return m;
  }
  function bringToFront(win) {
    if (win._closed) return;
    // 只用有界计数器: 不能混用 frontmostZ()+1 —— 计数器回收时那个值会在回收前算出来,
    // 于是「越大越回收、回收完又更大」, 最终冲破 1000000 盖住应用标题栏
    win.el.style.zIndex = allocZ();
  }
  // 应用顶部 chrome (标题栏 + 菜单栏) 的高度: 窗口不能钻到它下面 ——
  // 否则窗口自己的标题栏/✕ 会被盖住, 关不掉窗口; 应用右上角的关闭键也可能受影响
  function chromeTop() {
    if (typeof document === 'undefined' || !document.querySelector) return 0;
    var h = 0;
    var tb = document.querySelector('.title-bar');
    if (tb && tb.offsetHeight) h += tb.offsetHeight;
    var mb = document.querySelector('.menu-bar');
    if (mb && mb.offsetHeight && mb.offsetParent !== null) h += mb.offsetHeight;
    return h;
  }

  function open(opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'cw-window' + (opts.className ? ' ' + opts.className : '');
    var width = opts.width || 640;
    var height = opts.height || 480;
    var minW = opts.minWidth || DEF_MIN_W;
    var minH = opts.minHeight || DEF_MIN_H;
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.minWidth = minW + 'px';
    el.style.minHeight = minH + 'px';
    var defTitle = defaultTitles();
    var maxBtnHtml = (opts.maximizable === false) ? ''
      : '<button type="button" class="cw-max" title="' + esc(opts.maxTitle || defTitle.max) + '">⛶</button>';
    el.innerHTML =
      '<div class="cw-titlebar">' +
        '<span class="cw-title"></span>' +
        maxBtnHtml +
        '<button type="button" class="cw-close" data-tip="' + esc(opts.closeTitle || defTitle.close) + '" title="' + esc(opts.closeTitle || defTitle.close) + '">✕</button>' +
      '</div>' +
      '<div class="cw-body"></div>' +
      (opts.resizable === false ? '' : '<div class="cw-resize" data-tip="' + esc(opts.resizeTitle || defTitle.resize) + '" title="' + esc(opts.resizeTitle || defTitle.resize) + '"></div>');
    var titleEl = el.querySelector('.cw-title');
    var bodyEl = el.querySelector('.cw-body');
    var closeBtn = el.querySelector('.cw-close');
    var maxBtn = el.querySelector('.cw-max');
    var resizeEl = el.querySelector('.cw-resize');
    titleEl.textContent = opts.title || '';

    // 内容: HTMLElement 或 HTML 字符串
    if (typeof opts.content === 'string') bodyEl.innerHTML = opts.content;
    else if (opts.content && opts.content.nodeType === 1) bodyEl.appendChild(opts.content);

    // 定位: 显式 x/y, 否则居中 (多窗口级联偏移)
    var x = opts.x;
    var y = opts.y;
    if (x == null || y == null) {
      var n = _windows.length;
      var off = (n % 5) * 28;
      if (x == null) x = Math.max(8, Math.round((window.innerWidth - width) / 2) + off);
      if (y == null) y = Math.max(8, Math.round((window.innerHeight - height) / 2) + off);
    }
    clampPos(el, x, y);

    var _restoreRect = null;     // 最大化前的尺寸/位置
    var _resizeCbs = [];         // onResize 回调
    var _resizeRAF = 0;

    var win = {
      el: el,
      body: bodyEl,
      opts: opts,
      _closed: false,
      setTitle: function (s) { titleEl.textContent = s; },
      close: function () { close(win); },
      getSize: function () { return { w: el.offsetWidth, h: el.offsetHeight }; },
      setSize: function (w, h) {
        el.style.width = Math.max(minW, Math.round(w)) + 'px';
        el.style.height = Math.max(minH, Math.round(h)) + 'px';
        clampPos(el, el.offsetLeft, el.offsetTop);
        notifyResize(win, true);
      },
      isMaximized: function () { return !!_restoreRect; },
      toggleMax: function () { toggleMax(win); },
      onResize: function (fn) { if (typeof fn === 'function') _resizeCbs.push(fn); return win; },
      _notifyResize: function (immediate) { notifyResize(win, immediate); },
      _refit: function () { refit(win); },
      _resizeCbs: _resizeCbs,
      _getRestoreRect: function () { return _restoreRect; },
      _setRestoreRect: function (r) { _restoreRect = r; },
      _minW: minW,
      _minH: minH,
    };

    function toggleMax(w) {
      var cur = w._getRestoreRect();
      if (cur) {   // 还原
        w._setRestoreRect(null);
        el.style.width = cur.w + 'px';
        el.style.height = cur.h + 'px';
        clampPos(el, cur.x, cur.y);
        if (maxBtn) { maxBtn.textContent = '⛶'; maxBtn.classList.remove('is-max'); }
      } else {     // 最大化: 铺到视口内, 顶部让开应用标题栏/菜单栏
        w._setRestoreRect({ w: el.offsetWidth, h: el.offsetHeight, x: el.offsetLeft, y: el.offsetTop });
        var m = 8;
        var top = chromeTop() + m;
        el.style.width = Math.max(w._minW, window.innerWidth - m * 2) + 'px';
        el.style.height = Math.max(w._minH, window.innerHeight - top - m) + 'px';
        el.style.left = m + 'px';
        el.style.top = top + 'px';
        if (maxBtn) { maxBtn.textContent = '❐'; maxBtn.classList.add('is-max'); }
      }
      notifyResize(win, true);
    }

    // 关闭按钮
    if (opts.closable === false) {
      closeBtn.style.display = 'none';
    } else {
      closeBtn.addEventListener('click', function () { close(win); });
    }
    if (maxBtn) maxBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMax(win); });

    // 拖动: 标题栏 mousedown → 全局 mousemove/mouseup; 排除按钮
    var titlebar = el.querySelector('.cw-titlebar');
    titlebar.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target === closeBtn || e.target === maxBtn) return;
      startDrag(win, e);
    });
    // 双击标题栏 = 最大化/还原
    titlebar.addEventListener('dblclick', function (e) {
      if (e.target === closeBtn || e.target === maxBtn) return;
      toggleMax(win);
    });

    // 右下角拖动改大小 (拖动过程节流, 松手时再补一次)
    if (resizeEl) {
      resizeEl.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        startResize(win, e);
      });
    }

    // 聚焦置顶
    el.addEventListener('mousedown', function () { bringToFront(win); });

    document.body.appendChild(el);
    el.style.zIndex = allocZ();
    _windows.push(win);
    return win;
  }

  // 尺寸变化通知: rAF 节流 (拖动时不必每像素都重绘), immediate = 立刻发
  function notifyResize(win, immediate) {
    var fire = function () {
      win._resizeRAF = 0;
      try {
        win.el.dispatchEvent(new CustomEvent('cw:resize', { detail: { w: win.el.offsetWidth, h: win.el.offsetHeight } }));
      } catch (e) { /* ignore */ }
      for (var i = 0; i < win._resizeCbs.length; i++) {
        try { win._resizeCbs[i](win.el.offsetWidth, win.el.offsetHeight); } catch (err) { /* ignore */ }
      }
    };
    if (win._resizeRAF) { if (!immediate) return; cancelAnimationFrame(win._resizeRAF); win._resizeRAF = 0; }
    if (immediate) fire();
    else win._resizeRAF = requestAnimationFrame(fire);
  }

  function startResize(win, e) {
    var el = win.el;
    var startX = e.clientX, startY = e.clientY;
    var origW = el.offsetWidth, origH = el.offsetHeight;
    el.classList.add('is-resizing');
    // 一旦手动改大小就退出「最大化」状态
    win._setRestoreRect(null);
    var maxBtn = el.querySelector('.cw-max');
    if (maxBtn) { maxBtn.textContent = '⛶'; maxBtn.classList.remove('is-max'); }
    function onMove(ev) {
      var w = Math.max(win._minW, Math.min(origW + (ev.clientX - startX), window.innerWidth - el.offsetLeft - 4));
      var h = Math.max(win._minH, Math.min(origH + (ev.clientY - startY), window.innerHeight - el.offsetTop - 4));
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      win._notifyResize(false);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('is-resizing');
      win._notifyResize(true);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  }

  function startDrag(win, e) {
    var el = win.el;
    var startX = e.clientX;
    var startY = e.clientY;
    var origLeft = el.offsetLeft;
    var origTop = el.offsetTop;
    el.classList.add('is-dragging');
    function onMove(ev) {
      clampPos(el, origLeft + (ev.clientX - startX), origTop + (ev.clientY - startY));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      el.classList.remove('is-dragging');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }

  // 约束窗口位置: 标题栏至少 28px 留在视口内, 左侧留 32px 可抓回;
  // 顶部不越过应用标题栏/菜单栏, 否则窗口自己的 ✕ 会被它们盖住点不到
  function clampPos(el, x, y) {
    var w = el.offsetWidth, h = el.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top = chromeTop();
    x = Math.min(Math.max(x, 40 - w), vw - 40);
    y = Math.min(Math.max(y, top), vh - 28);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  // 视口变化 (应用窗口被拉大/缩小) 时: 最大化中的窗口跟着铺满新视口,
  // 普通窗口收回视口内 —— 否则右上角的 ✕ 可能跑到屏幕外, 窗口就关不掉了
  function refitAll() {
    for (var i = 0; i < _windows.length; i++) refit(_windows[i]);
  }
  function refit(win) {
    if (!win || win._closed) return;
    var el = win.el;
    var m = 8, top = chromeTop() + m;
    if (win._getRestoreRect()) {
      el.style.width = Math.max(win._minW, window.innerWidth - m * 2) + 'px';
      el.style.height = Math.max(win._minH, window.innerHeight - top - m) + 'px';
      el.style.left = m + 'px';
      el.style.top = top + 'px';
    } else {
      var w = Math.min(el.offsetWidth, window.innerWidth - 8);
      var h = Math.min(el.offsetHeight, window.innerHeight - top - 8);
      if (w !== el.offsetWidth) el.style.width = Math.max(win._minW, w) + 'px';
      if (h !== el.offsetHeight) el.style.height = Math.max(win._minH, h) + 'px';
      // 位置严格收进视口 (不能用 clampPos 的「留 40px」宽松规则, 那样 ✕ 会在屏幕外)
      var x = Math.min(Math.max(el.offsetLeft, 0), Math.max(0, window.innerWidth - el.offsetWidth));
      var y = Math.min(Math.max(el.offsetTop, top), Math.max(top, window.innerHeight - el.offsetHeight));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    notifyResize(win, true);
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', refitAll);
  }

  function close(win) {
    if (win._closed) return;
    win._closed = true;
    win.el.remove();
    var i = _windows.indexOf(win);
    if (i >= 0) _windows.splice(i, 1);
    var fn = win.opts.onClose;
    if (fn) try { fn(); } catch (err) { console.error('WindowManager onClose error:', err); }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 默认控件提示 (跟随语言设置; I18N 未就绪/不存在时回退中文源文案)
  function tr(key, fb) {
    try {
      var T = root.I18N && root.I18N.t;
      if (T) { var v = T(key); if (v && v !== key) return v; }
    } catch (e) { /* ignore */ }
    return fb;
  }
  function defaultTitles() {
    return {
      max: tr('windowManager.maxRestore', '最大化 / 还原'),
      close: tr('windowManager.close', '关闭'),
      resize: tr('windowManager.resize', '拖动改大小'),
    };
  }

  root.WindowManager = {
    open: open,
    close: close,
    refitAll: refitAll,
    chromeTop: chromeTop,
    // 诊断: 窗口层的 z-index 区间 (上限必须低于应用标题栏的 1000000)
    debugZ: function () {
      return {
        base: _zBase, max: _zMax, top: _zTop,
        windows: _windows.map(function (w) { return parseInt(w.el.style.zIndex, 10) || 0; })
      };
    },
    get windows() { return _windows.slice(); },
  };
})();
