/* ChoTenEditor 本地化核心模块
 * 依赖: js-yaml (全局 jsyaml)。在 index.html / settings.html 中紧随 js-yaml 加载。
 * 字典: locales/<lang>.yml (zh_cn 为源语言)。语言持久化: localStorage.editorConfig.language
 * 支持语言: zh_cn / zh_tw / en_us / de_de / es_es / fr_fr / ko_kr / ru_ru
 * 默认语言: en_us (未选择过语言时)
 * 回退链: 新语言缺失词条 → en_us → zh_cn (源语言); zh_tw 同样 → en_us → zh_cn
 */
(function () {
  var SUPPORTED = ['zh_cn', 'zh_tw', 'en_us', 'de_de', 'es_es', 'fr_fr', 'ko_kr', 'ru_ru'];
  // 查值回退链 (不含 zh_cn; zh_cn 作为最终兜底在 init 时总是加载)
  var FALLBACK = {
    zh_cn: [],
    zh_tw: ['en_us'],
    en_us: [],
    de_de: ['en_us'],
    es_es: ['en_us'],
    fr_fr: ['en_us'],
    ko_kr: ['en_us'],
    ru_ru: ['en_us'],
  };
  // <html lang> 属性映射
  var HTML_LANG = {
    zh_cn: 'zh-CN', zh_tw: 'zh-TW',
    en_us: 'en', de_de: 'de', es_es: 'es', fr_fr: 'fr', ko_kr: 'ko', ru_ru: 'ru',
  };

  var DEFAULT_LANG = 'en_us'; // 默认语言 (未选择过语言时)
  var SOURCE_LANG = 'zh_cn';  // 源语言, 所有字典的最后兜底

  var current = DEFAULT_LANG;
  var dicts = {}; // lang -> dict object
  var initPromise = null;

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  function getConfig() {
    try { return JSON.parse(localStorage.getItem('editorConfig') || '{}'); } catch (e) { return {}; }
  }

  function saveLang(lang) {
    var cfg = getConfig();
    cfg.language = lang;
    localStorage.setItem('editorConfig', JSON.stringify(cfg));
  }

  function getLang() {
    var cfg = getConfig();
    return isSupported(cfg.language) ? cfg.language : DEFAULT_LANG;
  }

  // 当前语言的完整回退链 (自身优先, 最终总是落到 zh_cn 源语言)
  function fallbackChain(lang) {
    var chain = (FALLBACK[lang] || []).slice();
    chain.unshift(lang);
    if (chain.indexOf(SOURCE_LANG) === -1) chain.push(SOURCE_LANG);
    return chain;
  }

  function lookup(dict, key) {
    var parts = key.split('.');
    var o = dict;
    for (var i = 0; i < parts.length; i++) {
      if (o == null || typeof o !== 'object') return undefined;
      o = o[parts[i]];
    }
    return o;
  }

  // 按回退链取词条: 当前语言 → 回退语言 → zh_cn → 原样返回 key
  function t(key, params) {
    var v;
    var chain = fallbackChain(current);
    for (var i = 0; i < chain.length && v == null; i++) {
      v = lookup(dicts[chain[i]], key);
    }
    if (v == null) v = key;
    if (params) {
      v = String(v).replace(/\{(\w+)\}/g, function (m, name) {
        return params[name] != null ? params[name] : m;
      });
    }
    return v;
  }

  // 双语字段取值: {zh, en} / {zh_cn, en_us} 对象按当前语言与回退链挑选。
  // zh_tw 时简中字段排在英文之后 (繁中用户宁可看英文也不看简中)。
  function pick(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    if (typeof obj !== 'object') return String(obj);
    var chain = fallbackChain(current);
    for (var i = 0; i < chain.length; i++) {
      var lang = chain[i];
      var v = obj[lang];
      // 泛化短键: zh 覆盖 zh_cn/zh_tw, en 覆盖 en_us
      if (v == null || v === '') {
        if (lang === 'zh_cn' || lang === 'zh_tw') v = obj.zh;
        else if (lang === 'en_us') v = obj.en;
      }
      if (v != null && v !== '') return v;
    }
    // 兜底: 任意一个非空值
    for (var k in obj) {
      var v2 = obj[k];
      if (typeof v2 === 'string' && v2) return v2;
    }
    return '';
  }

  // 扫描 [data-i18n](textContent) / [data-i18n-placeholder] / [data-i18n-title] / [data-i18n-tip]
  // data-i18n-tip: 本应用自定义 tooltip (tooltip.js 读 data-tip, 替代原生 title) ——
  // HTML 里的 data-tip 是源语言兜底, 应用时按 key 覆盖, 让悬浮提示跟随语言设置。
  function applyDOM(root) {
    root = root || document;
    var els = root.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-tip]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
      key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
      key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
      key = el.getAttribute('data-i18n-tip');
      if (key) {
        // 键未收录时保留 HTML 里的源语言兜底, 不用 key 本身覆盖
        var tv = t(key);
        if (tv && tv !== key) el.setAttribute('data-tip', tv);
      }
    }
    document.documentElement.lang = HTML_LANG[current] || 'en';
    var titleKey = (document.body && document.body.getAttribute('data-title-key'));
    document.title = titleKey ? t(titleKey) : t('app.title');
  }

  function load(lang) {
    if (dicts[lang]) return Promise.resolve();
    return fetch('locales/' + lang + '.yml')
      .then(function (r) { if (!r.ok) throw new Error('load failed: ' + lang); return r.text(); })
      .then(function (text) {
        var parsed = jsyaml.load(text);
        dicts[lang] = (parsed && typeof parsed === 'object') ? parsed : {};
      })
      .catch(function(err) { console.warn('I18N load failed:', err); return {}; });
  }

  // 语言更改"重启后生效"：会话内已生效的界面语言由主窗口决定。
  // 主窗口打开设置页时带上 ?lang=<当前生效语言>，设置页据此继续用当前生效语言渲染，
  // 而不是刚保存但尚未生效的语言（否则设置面板会和编辑器界面语言不一致）。
  function getForcedLang() {
    try {
      var m = /[?&]lang=(zh_cn|zh_tw|en_us|de_de|es_es|fr_fr|ko_kr|ru_ru)(?:&|$)/.exec(window.location.search || '');
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function init(lang) {
    if (!isSupported(lang)) lang = DEFAULT_LANG;
    current = lang;
    // 回退链上的所有字典 + 源语言 zh_cn 都要加载
    var langs = fallbackChain(lang);
    var chain = Promise.resolve();
    for (var i = 0; i < langs.length; i++) {
      (function (l) {
        chain = chain.then(function () { return load(l); });
      })(langs[i]);
    }
    return chain.then(function () {
      applyDOM();
      return current;
    });
  }

  // 立即以已保存语言（或默认）开始加载；ready 永远指向最新的 init
  initPromise = init(getForcedLang() || getLang());

  function setLang(lang) {
    saveLang(lang);
    initPromise = init(lang);
    return initPromise;
  }

  // 仅持久化语言选择，不切换当前界面语言。
  // 语言热切换会让已生成的界面文本、提示/补全缓存与其它窗口状态不一致
  // (混合语言、旧缓存失效)，因此设置页统一改为"保存 + 重启后生效"。
  function persistLang(lang) {
    saveLang(isSupported(lang) ? lang : DEFAULT_LANG);
  }

  // 启动加载提示列表（替代 loadingtips.txt）
  function tips() {
    var arr;
    var chain = fallbackChain(current);
    for (var i = 0; i < chain.length && (!Array.isArray(arr) || !arr.length); i++) {
      arr = lookup(dicts[chain[i]], 'tips');
    }
    return Array.isArray(arr) ? arr : [];
  }

  // 内容描述覆盖: content.<section>.<id>，无翻译则返回 fallback（zh 原文）
  function desc(section, id, fallback) {
    var key = 'content.' + section + '.' + id;
    var v;
    var chain = fallbackChain(current);
    for (var i = 0; i < chain.length && v == null; i++) {
      v = lookup(dicts[chain[i]], key);
    }
    return v != null ? v : (fallback != null ? fallback : '');
  }

  // 远程消息: 有 errorKey 且译文与原文不同 → "原文 (译文)"；否则显示原文（兼容旧端）
  function localizeRemote(text, errorKey, params) {
    if (!errorKey) return text;
    var local = params ? t(errorKey, params) : t(errorKey);
    if (local === errorKey || local === text) return text;
    return text + ' (' + local + ')';
  }

  window.I18N = {
    get lang() { return current; },
    get ready() { return initPromise; },
    SUPPORTED: SUPPORTED,
    isSupported: isSupported,
    t: t,
    pick: pick,
    applyDOM: applyDOM,
    setLang: setLang,
    saveLang: persistLang,
    tips: tips,
    desc: desc,
    localizeRemote: localizeRemote,
  };
})();
