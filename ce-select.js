/* ce-select.js — 自研下拉选择组件 (替代原生 select) + 字体补全输入框 (ce-combo)
 * 兼容设计: 包装原生 select (隐藏但保留 id/value/change), 外部代码读写与原来完全一致。
 * 用法: 页面内所有 <select> 自动升级 (含动态插入的, MutationObserver 监听);
 *       字体输入框用 <input data-font-combo> 标记。
 * 尺寸: 不在 .select-wrapper 内的 select (如可视化编辑器动态控件) 自动使用紧凑模式;
 *       带 cv-select-lg / ce-select-lg 类使用大号紧凑模式。 */
(function () {
  'use strict';

  var SEARCH_MAX = 8; // options 超过该数量显示搜索框

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === 'function') {
      try {
        var v = window.I18N.t(key);
        if (v && v !== key) return v;
      } catch (e) {}
    }
    return fallback;
  }

  function closeAll(e) {
    document.querySelectorAll('.ce-select-panel.open, .ce-combo-panel.open').forEach(function (p) {
      // 点击落在该面板归属控件内部 (select trigger / 字体输入框 / 面板自身) 时保留打开,
      // 否则字体输入框 click 冒泡到 document 会把 focus 刚打开的面板立即关闭
      if (e && p.parentNode && p.parentNode.contains(e.target)) return;
      p.classList.remove('open');
    });
  }

  /* ─────────────── 下拉选择组件 ─────────────── */

  // 外部用 JS 直接赋值 (el.value = x / el.selectedIndex = n) 时, 原生 select
  // 既不派发 change 也不改属性, 上面的 MutationObserver 收不到,
  // 自研控件的显示就会停在旧值 (设置页 loadSettings 回填、语言回显都会踩到)。
  // 这里给原型 setter 挂一个同步钩子, 补齐 "外部读写与原来完全一致" 的兼容承诺。
  function patchNativeSetters() {
    var proto = window.HTMLSelectElement && window.HTMLSelectElement.prototype;
    if (!proto || proto.__ceSetterPatched) return;
    ['value', 'selectedIndex'].forEach(function (prop) {
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || typeof desc.get !== 'function' || typeof desc.set !== 'function') return;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () { return desc.get.call(this); },
        set: function (v) {
          desc.set.call(this, v);
          if (this.__ceSyncValue) this.__ceSyncValue();
        },
      });
    });
    proto.__ceSetterPatched = true;
  }

  // 主动同步某个被升级过的 select 的显示 (被替换掉原生元素后仍可调用)
  function syncSelect(sel) {
    if (sel && typeof sel.__ceSyncValue === 'function') sel.__ceSyncValue();
  }

  function buildSelect(sel) {
    if (!sel || sel.dataset.ceBuilt) return;
    sel.dataset.ceBuilt = '1';

    var wrap = document.createElement('div');
    wrap.className = 'ce-select';
    if (sel.id) wrap.dataset.ceFor = sel.id;
    var wrapper = sel.closest('.select-wrapper');
    // 原生 select 已被自研控件取代: 隐藏配套的 ▼ 图标,
    // 否则它会脱离文档流浮在控件上方/与控件自带箭头重叠
    if (wrapper) {
      var legacyIcon = wrapper.querySelector('.select-icon');
      if (legacyIcon) legacyIcon.style.display = 'none';
    }
    // 不在 .select-wrapper 内 = 编辑器/紧凑场景
    if (!wrapper) {
      wrap.classList.add('ce-select-sm');
      if (sel.classList.contains('cv-select-lg') || sel.classList.contains('ce-select-lg')) {
        wrap.classList.remove('ce-select-sm');
        wrap.classList.add('ce-select-lg');
      }
    }
    // 继承内联布局样式 (编辑器动态 select 常用 width/flex-shrink/margin)
    ['width', 'minWidth', 'maxWidth', 'flexShrink', 'flexGrow', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'].forEach(function (p) {
      var v = sel.style[p];
      if (v) wrap.style[p] = v;
    });
    sel.__ceWrap = wrap;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ce-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    var valueSpan = document.createElement('span');
    valueSpan.className = 'ce-select-value';
    var arrow = document.createElement('span');
    arrow.className = 'ce-select-arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    trigger.appendChild(valueSpan);
    trigger.appendChild(arrow);
    wrap.appendChild(trigger);

    var panel = document.createElement('div');
    panel.className = 'ce-select-panel';
    var searchBox = null;
    if (sel.options.length > SEARCH_MAX) {
      searchBox = document.createElement('input');
      searchBox.type = 'text';
      searchBox.className = 'ce-select-search';
      searchBox.placeholder = tr('settings.ceSearch', '搜索…');
      panel.appendChild(searchBox);
    }
    var list = document.createElement('div');
    list.className = 'ce-select-options';
    panel.appendChild(list);
    wrap.appendChild(panel);

    // 原生 select 隐藏但保留 (外部代码继续用 .value / change / options)
    sel.classList.add('ce-select-native');
    sel.style.display = 'none';
    (wrapper || sel).parentNode.insertBefore(wrap, (wrapper || sel).nextSibling);

    function renderOptions(filter) {
      list.innerHTML = '';
      var shown = 0;
      var q = (filter || '').toLowerCase();
      Array.prototype.forEach.call(sel.options, function (opt, idx) {
        var optText = opt.textContent || opt.text || '';
        if (opt.disabled) return;
        if (q && optText.toLowerCase().indexOf(q) === -1) return;
        var item = document.createElement('div');
        item.className = 'ce-select-option' + (idx === sel.selectedIndex ? ' selected' : '');
        item.dataset.index = String(idx);
        if (idx === sel.selectedIndex) {
          var check = document.createElement('span');
          check.className = 'ce-select-check';
          check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
          item.appendChild(check);
        }
        var labelSpan = document.createElement('span');
        labelSpan.className = 'ce-select-label';
        labelSpan.textContent = optText;
        item.appendChild(labelSpan);
        item.addEventListener('click', function () {
          sel.selectedIndex = idx;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          closePanel();
          trigger.focus();
        });
        list.appendChild(item);
        shown++;
      });
      if (!shown) {
        var empty = document.createElement('div');
        empty.className = 'ce-select-empty';
        empty.textContent = tr('settings.ceNoMatch', '无匹配项');
        list.appendChild(empty);
      }
      return shown;
    }

    function updateValue() {
      var opt = sel.options[sel.selectedIndex];
      valueSpan.textContent = opt ? (opt.textContent || '') : '';
      if (panel.classList.contains('open')) {
        renderOptions(searchBox ? searchBox.value.trim() : '');
      }
    }

    function openPanel() {
      closeAll();
      panel.classList.add('open');
      renderOptions('');
      if (searchBox) {
        searchBox.value = '';
        searchBox.focus();
      }
    }
    function closePanel() {
      panel.classList.remove('open');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('open')) closePanel();
      else openPanel();
    });

    // 键盘导航: ↑↓ 移动, Enter 选择, Esc 关闭
    trigger.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('open')) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPanel();
        }
        return;
      }
      var items = Array.prototype.slice.call(list.querySelectorAll('.ce-select-option'));
      var cur = items.indexOf(list.querySelector('.ce-select-option.active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        if (items[cur]) items[cur].classList.remove('active');
        if (items[next]) items[next].classList.add('active');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var active = list.querySelector('.ce-select-option.active');
        if (active) active.click();
        else closePanel();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    });
    if (searchBox) {
      searchBox.addEventListener('input', function () { renderOptions(searchBox.value); });
      searchBox.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closePanel(); }
        if (e.key === 'Enter') e.preventDefault();
      });
    }

    // 外部修改原生 select (动态 options / value) 时同步显示
    sel.addEventListener('change', updateValue);
    var observer = new MutationObserver(function () { updateValue(); });
    observer.observe(sel, { childList: true, attributes: true, subtree: true });
    sel.__ceObserver = observer;
    // 供原型 setter 钩子 / CESelect.sync() 调用
    sel.__ceSyncValue = updateValue;

    updateValue();
  }

  /* ─────────────── 字体补全输入框 ─────────────── */

  function buildFontCombo(input) {
    if (!input || input.dataset.ceComboBuilt) return;
    input.dataset.ceComboBuilt = '1';
    input.setAttribute('autocomplete', 'off');
    input.classList.add('ce-input');

    var wrap = document.createElement('div');
    wrap.className = 'ce-combo';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.__ceComboWrap = wrap;

    var panel = document.createElement('div');
    panel.className = 'ce-combo-panel';
    var list = document.createElement('div');
    list.className = 'ce-combo-options';
    panel.appendChild(list);
    wrap.appendChild(panel);

    var allFonts = [];
    var extraFonts = [];

    function fontName(name) {
      var n = String(name).trim();
      if (!n) return '';
      // 已是 CSS 字体列表 (含逗号) 取第一个 family
      if (n.indexOf(',') !== -1) n = n.split(',')[0];
      return n.replace(/^['"]|['"]$/g, '').trim();
    }

    function render(filter) {
      list.innerHTML = '';
      var q = (filter || '').toLowerCase();
      var merged = [];
      extraFonts.forEach(function (f) { merged.push(f); });
      allFonts.forEach(function (f) { if (merged.indexOf(f) === -1) merged.push(f); });
      if (q) merged = merged.filter(function (f) { return f.toLowerCase().indexOf(q) !== -1; });
      else merged = merged.slice(0, 80);
      merged.forEach(function (name) {
        var item = document.createElement('div');
        item.className = 'ce-combo-option';
        item.textContent = name;
        item.style.fontFamily = "'" + name.replace(/'/g, '') + "', sans-serif"; // 字体预览
        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          input.value = name;
          hidePanel();
          // 只发 change (input 会重新打开面板; 外部监听也用 change)
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        list.appendChild(item);
      });
      if (!merged.length) {
        var empty = document.createElement('div');
        empty.className = 'ce-select-empty';
        // 字体列表尚未从主进程返回时显示加载态, 避免误报"无匹配项"
        empty.textContent = (allFonts.length === 0 && extraFonts.length === 0) ? tr('settings.loading', '加载中…') : tr('settings.ceNoMatch', '无匹配项');
        list.appendChild(empty);
      }
    }

    function showPanel() { closeAll(); panel.classList.add('open'); }
    function hidePanel() { panel.classList.remove('open'); }

    input.addEventListener('input', function () { showPanel(); render(input.value); });
    input.addEventListener('focus', function () { showPanel(); render(input.value); });
    input.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(list.querySelectorAll('.ce-combo-option'));
      var cur = items.indexOf(list.querySelector('.ce-combo-option.active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!panel.classList.contains('open')) { showPanel(); render(input.value); return; }
        var next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        if (items[cur]) items[cur].classList.remove('active');
        if (items[next]) items[next].classList.add('active');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var active = list.querySelector('.ce-combo-option.active');
        if (active) {
          input.value = active.textContent;
          hidePanel();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        hidePanel();
      }
    });

    // 系统字体加载 (IPC)
    if (window.electronAPI && window.electronAPI.listFonts) {
      window.electronAPI.listFonts().then(function (res) {
        if (res && res.success && Array.isArray(res.fonts)) {
          allFonts = res.fonts;
          render(input.value);
        }
      }).catch(function () {});
    }
  }

  /* ─────────────── 初始化 ─────────────── */

  // 动态插入的 select (可视化编辑器渲染) 自动升级; 移除时清理对应 wrap
  var upgradeObserver = null;

  function collect(root, selector) {
    var found = [];
    if (root.matches && root.matches(selector)) found.push(root);
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach(function (s) { found.push(s); });
    }
    return found;
  }

  function startObserver() {
    if (upgradeObserver || !document.body) return;
    if (upgradeObserver) upgradeObserver.disconnect();
    upgradeObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type !== 'childList') return;
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          collect(node, 'select').forEach(buildSelect);
          collect(node, 'input[data-font-combo]').forEach(buildFontCombo);
        });
        m.removedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          collect(node, 'select').forEach(function (sel) {
            if (sel.__ceWrap) {
              sel.__ceWrap.remove();
              delete sel.__ceWrap;
            }
            if (sel.__ceObserver) { sel.__ceObserver.disconnect(); delete sel.__ceObserver; }
            delete sel.dataset.ceBuilt;
          });
          collect(node, 'input[data-font-combo]').forEach(function (i) {
            if (i.__ceComboWrap) {
              i.__ceComboWrap.remove();
              delete i.__ceComboWrap;
            }
            delete i.dataset.ceComboBuilt;
          });
        });
      });
    });
    upgradeObserver.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    patchNativeSetters();
    document.querySelectorAll('select').forEach(buildSelect);
    document.querySelectorAll('input[data-font-combo]').forEach(buildFontCombo);
    startObserver();
  }

  document.removeEventListener('click', closeAll);
  document.addEventListener('click', closeAll);
  function closeKeydown(e) {
    if (e.key === 'Escape') closeAll();
  }
  document.removeEventListener('keydown', closeKeydown);
  document.addEventListener('keydown', closeKeydown);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CESelect = {
    init: init,
    buildSelect: buildSelect,
    buildFontCombo: buildFontCombo,
    sync: syncSelect,
    patchNativeSetters: patchNativeSetters,
  };
})();
