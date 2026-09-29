/* ChoTenEditor 配置检查 (Problems) 面板
 * 依赖: window.CEDiagnostics (可选), window.I18N
 * 显示 CraftEngine 配置的 ERROR / WARN / WEAK_WARN / INFO 四级问题,
 * 点击问题可跳转到对应文件 / 条目 / 字段 / 源码行。
 *
 * 对外 API:
 *   CEProblems.set(file, issues)     更新问题列表并刷新徽章
 *   CEProblems.clear()               清空
 *   CEProblems.open()/close()/toggle()
 *   CEProblems.isOpen()
 *   CEProblems.getIssues()           当前问题
 *   CEProblems.SEVERITY
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  if (root.CEProblems) return;

  var SEV = ['ERROR', 'WARN', 'WEAK_WARN', 'INFO'];
  var SEV_LABEL = { ERROR: 'ERROR', WARN: 'WARN', WEAK_WARN: 'WEAK', INFO: 'INFO' };
  var SEV_ICON = { ERROR: '✖', WARN: '⚠', WEAK_WARN: '△', INFO: 'ⓘ' };
  var SEV_CLS = { ERROR: 'error', WARN: 'warn', WEAK_WARN: 'weak', INFO: 'info' };

  var _file = null;
  var _issues = [];
  var _filter = { ERROR: true, WARN: true, WEAK_WARN: true, INFO: true };
  var _els = null;

  function t(key, fb, params) {
    var v = null;
    try {
      if (root.I18N && root.I18N.t) { v = root.I18N.t(key); if (v === key) v = null; }
    } catch (e) { v = null; }
    if (v == null) v = fb != null ? fb : key;
    if (params) v = String(v).replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; });
    return v;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fileName(p) {
    return String(p || '').replace(/\\/g, '/').split('/').pop();
  }

  function mount() {
    if (_els && _els.root && _els.root.isConnected) return _els;
    var rootEl = document.getElementById('ce-problems');
    if (!rootEl) return null;
    _els = {
      root: rootEl,
      head: rootEl.querySelector('.ce-problems-head'),
      list: rootEl.querySelector('.ce-problems-list'),
      file: rootEl.querySelector('.ce-problems-file'),
      filters: rootEl.querySelector('.ce-problems-filters'),
      close: rootEl.querySelector('#ce-problems-close'),
    };
    if (_els.close) {
      _els.close.addEventListener('click', function () { close(); });
    }
    if (_els.filters) {
      _els.filters.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('[data-sev]') : null;
        if (!chip) return;
        var s = chip.getAttribute('data-sev');
        _filter[s] = !_filter[s];
        if (!SEV.some(function (x) { return _filter[x]; })) _filter[s] = true; // 至少保留一级
        render();
      });
    }
    if (_els.list) {
      _els.list.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('[data-issue-id]') : null;
        if (!row) return;
        var id = row.getAttribute('data-issue-id');
        var issue = null;
        for (var i = 0; i < _issues.length; i++) if (_issues[i].id === id) { issue = _issues[i]; break; }
        if (!issue) return;
        try {
          document.dispatchEvent(new CustomEvent('ce-goto-issue', { detail: issue }));
        } catch (err) { /* ignore */ }
      });
    }
    return _els;
  }

  function counts() {
    var c = { ERROR: 0, WARN: 0, WEAK_WARN: 0, INFO: 0, total: _issues.length };
    _issues.forEach(function (i) { if (c[i.severity] != null) c[i.severity]++; });
    return c;
  }

  function render() {
    var e = mount();
    if (!e) return;
    var c = counts();
    // 过滤条
    if (e.filters) {
      e.filters.innerHTML = SEV.map(function (s) {
        return '<button type="button" class="ce-prob-chip ce-prob-chip-' + SEV_CLS[s] + (_filter[s] ? ' active' : '') +
          '" data-sev="' + s + '"><span class="ce-prob-chip-ico">' + SEV_ICON[s] + '</span>' +
          SEV_LABEL[s] + ' <b>' + c[s] + '</b></button>';
      }).join('');
    }
    if (e.file) {
      e.file.textContent = _file ? fileName(_file) : '';
      e.file.title = _file || '';
    }
    if (!e.list) return;
    var shown = _issues.filter(function (i) { return _filter[i.severity]; });
    if (!shown.length) {
      e.list.innerHTML = '<div class="ce-prob-empty">' +
        esc(_issues.length ? t('diagnostics.allFiltered', '当前筛选下没有问题') : t('diagnostics.noIssues', '未发现问题 ✓')) +
        '</div>';
      return;
    }
    var html = '';
    shown.forEach(function (i) {
      var loc = [];
      if (i.section) loc.push(i.section);
      if (i.entry) loc.push(i.entry);
      if (i.path) loc.push(i.path);
      html += '<div class="ce-prob-row ce-prob-' + SEV_CLS[i.severity] + '" data-issue-id="' + esc(i.id) + '" title="' +
        esc(i.message + (loc.length ? '\n' + loc.join(' › ') : '')) + '">' +
        '<span class="ce-prob-sev">' + SEV_ICON[i.severity] + ' ' + SEV_LABEL[i.severity] + '</span>' +
        '<span class="ce-prob-loc">' + esc(loc.join(' › ') || fileName(i.file)) + '</span>' +
        '<span class="ce-prob-msg">' + esc(i.message) + '</span>' +
        (i.line ? '<span class="ce-prob-line">:' + i.line + '</span>' : '') +
        '</div>';
    });
    e.list.innerHTML = html;
  }

  function set(file, issues) {
    _file = file || null;
    _issues = Array.isArray(issues) ? issues : [];
    render();
    updateStatusBar();
    if (_issues.some(function (i) { return i.severity === 'ERROR'; }) && !isOpen()) {
      // 有 ERROR 时自动展开一次 (仅当面板从未被用户关闭过)
      if (!_userClosed) open();
    }
  }
  function clear() { set(null, []); }

  function updateStatusBar() {
    var el = document.getElementById('ce-diag-status');
    if (!el) return;
    var c = counts();
    el.className = 'ce-diag-status ' + (c.ERROR ? 'has-error' : c.WARN ? 'has-warn' : c.WEAK_WARN ? 'has-weak' : c.INFO ? 'has-info' : '');
    if (!c.total) { el.textContent = '✓'; el.title = t('diagnostics.noIssues', '未发现问题 ✓'); return; }
    el.textContent = (c.ERROR ? '✖' + c.ERROR + ' ' : '') + (c.WARN ? '⚠' + c.WARN + ' ' : '') +
      (c.WEAK_WARN ? '△' + c.WEAK_WARN + ' ' : '') + (c.INFO ? 'ⓘ' + c.INFO : '');
    el.title = t('diagnostics.summary', 'ERROR {e} · WARN {w} · WEAK {k} · INFO {i}',
      { e: c.ERROR, w: c.WARN, k: c.WEAK_WARN, i: c.INFO });
  }

  var _userClosed = false;
  function open() {
    var e = mount();
    if (!e) return;
    e.root.style.display = '';
    e.root.classList.add('ce-problems-open');
    document.body.classList.add('ce-problems-visible');
    _userClosed = false;
    render();
    setTimeout(function () {
      try { if (root.codeMirrorEditor && root.codeMirrorEditor.refresh) root.codeMirrorEditor.refresh(); } catch (err) {}
    }, 60);
  }
  function close() {
    var e = mount();
    if (!e) return;
    e.root.style.display = 'none';
    e.root.classList.remove('ce-problems-open');
    document.body.classList.remove('ce-problems-visible');
    _userClosed = true;
    setTimeout(function () {
      try { if (root.codeMirrorEditor && root.codeMirrorEditor.refresh) root.codeMirrorEditor.refresh(); } catch (err) {}
    }, 60);
  }
  function isOpen() { return !!(document.body && document.body.classList.contains('ce-problems-visible')); }
  function toggle() { isOpen() ? close() : open(); }

  root.CEProblems = {
    set: set,
    clear: clear,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    render: render,
    getIssues: function () { return _issues.slice(); },
    getFile: function () { return _file; },
    SEVERITY: SEV,
  };
})();
