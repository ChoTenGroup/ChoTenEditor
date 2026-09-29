/* ChoTenEditor — 配置检查 (Checks → Debug) 窗口渲染层
 *
 * 数据由主窗口扫描整个工程后经 IPC 推送 (electronAPI.checks):
 *   { phase: 'scanning' | 'ready' | 'error', root, files, issues[], assets, truncated, error }
 * issue: { severity: ERROR|WARN|WEAK_WARN|INFO, code, message, file, line, entry, path, key }
 *
 * 功能: 严重级别筛选 (ERROR / WARN / WEAK / INFO) + 全文搜索 + 按文件分组 + 点击跳转主编辑器
 */
(function () {
  'use strict';

  var SEVS = ['ERROR', 'WARN', 'WEAK_WARN', 'INFO'];
  var SEV_CLASS = { ERROR: 'error', WARN: 'warn', WEAK_WARN: 'weak', INFO: 'info' };
  var SEV_SHORT = { ERROR: 'ERROR', WARN: 'WARN', WEAK_WARN: 'WEAK', INFO: 'INFO' };

  var state = {
    data: null,
    active: { ERROR: true, WARN: true, WEAK_WARN: true, INFO: true },
    query: '',
    group: true,
    collapsed: Object.create(null),
  };

  var els = {};

  // ---------------- 工具 ----------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function t(key, params) {
    if (window.I18N && I18N.t) return I18N.t(key, params);
    return key;
  }

  function baseName(p) {
    var s = String(p || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i === -1 ? s : s.slice(i + 1);
  }

  function dirName(p) {
    var s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
    var i = s.lastIndexOf('/');
    return i <= 0 ? '' : s.slice(0, i);
  }

  // ---------------- 主题 ----------------
  function applyTheme() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('editorConfig') || '{}') || {}; } catch (e) { cfg = {}; }
    var theme = cfg.theme || 'dark';
    if (theme === 'auto') {
      try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
      catch (e) { theme = 'dark'; }
    }
    document.body.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    if (cfg.colors && typeof cfg.colors === 'object') {
      Object.keys(cfg.colors).forEach(function (key) {
        var name = '--color-' + String(key).replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
        try { document.documentElement.style.setProperty(name, cfg.colors[key]); } catch (e) {}
      });
    }
    // auto 模式: 跟随系统主题切换
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        var c = {};
        try { c = JSON.parse(localStorage.getItem('editorConfig') || '{}') || {}; } catch (e) { c = {}; }
        if ((c.theme || 'dark') === 'auto') applyTheme();
      });
    } catch (e) {}
  }

  // ---------------- 数据整理 ----------------
  function issueFile(i) { return i && i.file ? String(i.file) : ''; }

  function matchesQuery(i, q) {
    if (!q) return true;
    var hay = [i.message, i.code, i.file, i.entry, i.key, i.path, i.section, i.group]
      .filter(Boolean).join('\n').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function filtered() {
    var issues = (state.data && state.data.issues) || [];
    var q = state.query.trim().toLowerCase();
    return issues.filter(function (i) {
      if (!state.active[i.severity]) return false;
      return matchesQuery(i, q);
    });
  }

  function severityCounts(issues) {
    var c = { ERROR: 0, WARN: 0, WEAK_WARN: 0, INFO: 0 };
    (issues || []).forEach(function (i) { if (c[i.severity] != null) c[i.severity]++; });
    return c;
  }

  // ---------------- 绘制 ----------------
  function renderChips() {
    var all = (state.data && state.data.issues) || [];
    var c = severityCounts(all);
    var html = '';
    SEVS.forEach(function (s) {
      html += '<button class="chk-chip chk-chip-' + SEV_CLASS[s] + (state.active[s] ? ' active' : '') +
        '" data-sev="' + s + '" title="' + SEV_SHORT[s] + '">' +
        SEV_SHORT[s] + ' <b>' + c[s] + '</b></button>';
    });
    els.chips.innerHTML = html;
  }

  function renderStatus() {
    var d = state.data;
    if (!d) { els.status.textContent = ''; els.status.classList.remove('has-error'); return; }
    if (d.phase === 'error') {
      els.status.classList.add('has-error');
      els.status.textContent = '⚠ ' + (d.error || 'error');
      return;
    }
    els.status.classList.remove('has-error');
    var parts = [];
    if (d.phase === 'scanning' && d.progress) {
      parts.push('<span class="chk-spinner"></span>' +
        esc(t('checks.statsProgress', { done: d.progress.done || 0, files: d.progress.files || 0 })));
    } else if (d.phase === 'scanning') {
      parts.push('<span class="chk-spinner"></span>' + esc(t('checks.scanning')));
    } else {
      var shown = filtered().length;
      var total = (d.issues || []).length;
      parts.push(esc(t('checks.stats', { files: d.files || 0, total: total })));
      if (shown !== total) parts.push('· ' + shown + '/' + total);
    }
    if (d.truncated) parts.push('· ⚠ >' + (d.files || 0) + ' files');
    if (d.assets) {
      parts.push('· ' + esc(t('checks.assetsIndex', {
        state: d.assets.state === 'ready'
          ? t('checks.assetsReady', { ns: d.assets.namespaces || 0 })
          : (d.assets.state || t('checks.assetsOff')),
      })));
    }
    if (d.root) parts.push('· ' + esc(d.root));
    els.status.innerHTML = parts.join(' ');
  }

  function rowHtml(i, opts) {
    var cls = SEV_CLASS[i.severity] || 'info';
    var loc = '';
    if (opts && opts.flat) {
      loc += '<span class="chk-flatfile" title="' + esc(issueFile(i)) + '">' + esc(baseName(issueFile(i))) + '</span>';
    }
    var detail = [];
    if (i.entry) detail.push(i.entry);
    if (i.path) detail.push(i.path);
    else if (i.key) detail.push(i.key);
    if (detail.length) loc += '<span class="chk-path">' + esc(detail.join(' · ')) + '</span>';
    if (i.line) loc += '<span class="chk-line">' + esc(t('checks.line', { n: i.line })) + '</span>';
    if (i.code) loc += '<span class="chk-code">' + esc(i.code) + '</span>';
    loc += '<span class="chk-open" title="' + esc(t('checks.openInEditor')) + '">↗</span>';
    return '<div class="chk-row chk-row-' + cls + (opts && opts.flat ? ' chk-row-flat' : '') +
      '" data-id="' + esc(i.id) + '">' +
      '<span class="chk-sev">' + SEV_SHORT[i.severity] + '</span>' +
      '<span class="chk-msg">' + esc(i.message) + '</span>' +
      '<span class="chk-loc">' + loc + '</span>' +
      '</div>';
  }

  function renderList() {
    var d = state.data;
    if (!d || (d.phase === 'scanning' && !(d.issues || []).length)) {
      els.body.innerHTML = '<div class="chk-empty"><span class="chk-empty-icon">⏳</span>' +
        esc(t('checks.scanning')) + '</div>';
      return;
    }
    var list = filtered();
    if (!list.length) {
      var anyIssue = (d.issues || []).length > 0;
      els.body.innerHTML = '<div class="chk-empty"><span class="chk-empty-icon">' +
        (anyIssue ? '🔍' : '✅') + '</span>' +
        esc(anyIssue ? t('checks.emptyFiltered') : t('checks.empty')) + '</div>';
      return;
    }
    if (!state.group) {
      els.body.innerHTML = list.map(function (i) { return rowHtml(i, { flat: true }); }).join('');
      return;
    }
    // 按文件分组
    var order = [];
    var byFile = Object.create(null);
    list.forEach(function (i) {
      var f = issueFile(i) || '?';
      if (!byFile[f]) { byFile[f] = []; order.push(f); }
      byFile[f].push(i);
    });
    var html = '';
    order.forEach(function (f) {
      var arr = byFile[f];
      var c = severityCounts(arr);
      var collapsed = state.collapsed[f] === true;
      var counts = '';
      SEVS.forEach(function (s) {
        if (c[s]) counts += '<span class="chk-mini chk-mini-' + SEV_CLASS[s] + '">' + c[s] + '</span>';
      });
      html += '<section class="chk-group">';
      html += '<div class="chk-group-head" data-file="' + esc(f) + '">' +
        '<span class="chk-caret">' + (collapsed ? '▶' : '▼') + '</span>' +
        '<span class="chk-file">' + esc(baseName(f)) + '</span>' +
        '<span class="chk-file-dir">' + esc(dirName(f)) + '</span>' +
        '<span class="chk-group-counts">' + counts + '</span>' +
        '</div>';
      if (!collapsed) html += arr.map(function (i) { return rowHtml(i, {}); }).join('');
      html += '</section>';
    });
    els.body.innerHTML = html;
  }

  function render() {
    if (!window.I18N || !I18N.t) return;
    renderChips();
    renderStatus();
    renderList();
  }

  // ---------------- 交互 ----------------
  function bind() {
    var api = window.electronAPI || {};

    els.search.addEventListener('input', function () {
      state.query = this.value || '';
      renderStatus();
      renderList();
    });

    els.chips.addEventListener('click', function (e) {
      var btn = e.target.closest('.chk-chip');
      if (!btn) return;
      var s = btn.dataset.sev;
      if (!s) return;
      state.active[s] = !state.active[s];
      render();
    });

    els.group.addEventListener('change', function () {
      state.group = this.checked;
      renderList();
    });

    els.body.addEventListener('click', function (e) {
      var head = e.target.closest('.chk-group-head');
      if (head) {
        var f = head.dataset.file;
        state.collapsed[f] = !state.collapsed[f];
        renderList();
        return;
      }
      var row = e.target.closest('.chk-row');
      if (!row) return;
      var id = row.dataset.id;
      var issue = null;
      var all = (state.data && state.data.issues) || [];
      for (var i = 0; i < all.length; i++) { if (all[i].id === id) { issue = all[i]; break; } }
      if (!issue) return;
      if (api.checks && api.checks.gotoIssue) api.checks.gotoIssue(issue);
    });

    els.rescan.addEventListener('click', function () {
      if (!api.checks) return;
      els.rescan.disabled = true;
      Promise.resolve(api.checks.requestRescan()).then(function () {
        setTimeout(function () { els.rescan.disabled = false; }, 600);
      }, function () { els.rescan.disabled = false; });
    });

    els.copy.addEventListener('click', function () {
      var lines = filtered().map(function (i) {
        var loc = [issueFile(i), i.entry || '', i.path || i.key || '', i.line ? ('line ' + i.line) : '']
          .filter(Boolean).join(':');
        return '[' + i.severity + '] ' + loc + ' ' + i.message;
      });
      var text = lines.join('\n');
      var done = function () {
        var old = els.copy.innerHTML;
        els.copy.textContent = '✓ ' + t('checks.copied');
        setTimeout(function () { els.copy.innerHTML = old; }, 1200);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          done();
        }
      } catch (e) {}
    });

    els.close.addEventListener('click', function () {
      if (api.close) api.close();
      else window.close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (api.close) api.close(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        els.search.focus();
        els.search.select();
      }
    });

    if (api.checks && api.checks.onUpdate) {
      api.checks.onUpdate(function (payload) {
        if (!payload) return;
        state.data = payload;
        render();
      });
    }
  }

  // 兜底轮询: 推送可能在窗口加载完成前就发出 (丢失), 或扫描仍在进行中
  var pollTimer = null;
  var pollLeft = 0;
  function startScanPoller() {
    if (pollTimer) return;
    pollLeft = 300; // 最多 ~4 分钟
    pollTimer = setInterval(function () {
      if (pollLeft-- <= 0) { clearInterval(pollTimer); pollTimer = null; return; }
      if (!state.data || state.data.phase !== 'scanning') return;
      var api = window.electronAPI || {};
      if (!api.checks || !api.checks.getData) return;
      api.checks.getData().then(function (payload) {
        if (payload && payload.phase && payload.phase !== 'scanning') {
          state.data = payload;
          render();
        }
      }, function () {});
    }, 800);
  }

  // ---------------- 启动 ----------------
  document.addEventListener('DOMContentLoaded', function () {
    els.search = document.getElementById('chk-search');
    els.chips = document.getElementById('chk-chips');
    els.status = document.getElementById('chk-status');
    els.body = document.getElementById('chk-body');
    els.rescan = document.getElementById('chk-rescan');
    els.copy = document.getElementById('chk-copy');
    els.close = document.getElementById('chk-close');
    els.group = document.getElementById('chk-group');

    applyTheme();

    var ready = (window.I18N && I18N.ready) ? I18N.ready : Promise.resolve();
    Promise.resolve(ready).then(function () {
      bind();
      var api = window.electronAPI || {};
      if (api.checks && api.checks.getData) {
        api.checks.getData().then(function (payload) {
          state.data = payload || { phase: 'ready', files: 0, issues: [] };
          render();
          startScanPoller();
        }, function () {
          state.data = { phase: 'ready', files: 0, issues: [] };
          render();
        });
      } else {
        state.data = { phase: 'error', error: 'electronAPI.checks unavailable' };
        render();
      }
    });
  });
})();
