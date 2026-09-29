/* Checks (Debug) 窗口冒烟测试
 * 用法: node_modules\.bin\electron.cmd _ce_checks_test.js
 *
 * 走真实链路: 载入 main.js 注册的 checks:* IPC → 打开真实工程目录 →
 * 触发 openChecksDebug() → 断言独立窗口 checks.html 渲染出问题列表, 且
 * 严重级别筛选 / 搜索 / 分组均生效。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_DIR = __dirname;
const FIXTURE = path.join(APP_DIR, '_ce_tmp', 'checks_project');
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';

// 载入 main.js (只注册 IPC; 非入口时不会建窗 / 不占单实例锁)
require(path.join(APP_DIR, 'main.js'));

let fails = 0;
function check(ok, label) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) fails++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeFixture() {
  const put = (rel, content) => {
    const p = path.join(FIXTURE, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  };
  fs.rmSync(FIXTURE, { recursive: true, force: true });

  // pack.yml: 让 CEMCAssets 能识别这些资源包命名空间
  put('resources/demo/pack.yml', 'namespace: demo\n');
  put('resources/internal/pack.yml', 'namespace: internal\n');
  put('resources/mypack/pack.yml', 'namespace: mypack\n');

  // 1) 合法条目: 无问题
  put('resources/demo/configuration/items/ok.yml', [
    'items:',
    '  demo:ok_item:',
    '    material: diamond_sword',
    '    data:',
    '      item_name: "OK"',
    '',
  ].join('\n'));

  // 2) 付费版专属字段 (INFO premium) + 未知键 (WARN)
  put('resources/demo/configuration/items/premium.yml', [
    'items:',
    '  demo:mythic_sword:',
    '    material: diamond_sword',
    '    client_bound_data:',
    '      item_name: "Mythic"',
    '    totally_not_a_key: 1',
    '',
  ].join('\n'));

  // 3) 内部资源包 + 未注册的 craftengine 命名空间 (豁免, 不应报 unknownNamespace)
  put('resources/internal/configuration/items/gen.yml', [
    'items:',
    '  craftengine:generated_item:',
    '    material: paper',
    '',
  ].join('\n'));

  // 4) 普通资源包 + 未知命名空间 (应报 unknownNamespace)
  put('resources/mypack/configuration/items/other.yml', [
    'items:',
    '  nosuchpack:whatever_item:',
    '    material: paper',
    '',
  ].join('\n'));

  // 5) 非法条目 ID (ERROR)
  put('resources/demo/configuration/blocks/bad.yml', [
    'blocks:',
    '  "not a valid id":',
    '    state:',
    '      model:',
    '        path: minecraft:block/stone',
    '',
  ].join('\n'));

  // 6) 非 CE 文件 + YAML 语法错误 (仅语法检查 → ERROR)
  put('misc/broken.yml', [
    'foo:',
    '  bar: [1, 2',
    '',
  ].join('\n'));
}

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    let v = null;
    try { v = await fn(); } catch (e) { v = null; }
    if (v) return v;
    await sleep(150);
  }
  throw new Error('timeout waiting for ' + label);
}

async function main() {
  await app.whenReady();
  writeFixture();

  const win = new BrowserWindow({
    width: 1200, height: 820, show: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true,
    },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  // 先落配置 (真实 MC 资源目录) 再重载, 让 CEMCAssets 直接可用, 不去猜路径
  await win.webContents.executeJavaScript(
    `localStorage.setItem('editorConfig', JSON.stringify(${JSON.stringify({
      mcAssetsPath: MC_ROOT, ceDiagnostics: true, cePreview: true, language: 'zh_cn',
    })}))`
  );
  await win.webContents.reload();

  // 等渲染进程真正就绪: _electronAPI 由 DOMContentLoaded 后的 setTimeout(300) 注入
  await waitFor(async () => win.webContents.executeJavaScript(
    'document.readyState === "complete" && !!window.appState && !!window.I18N' +
    ' && typeof openChecksDebug === "function" && typeof _electronAPI !== "undefined" && !!_electronAPI'
  ), 25000, 'renderer boot');

  // 打开测试工程 (走真实 openProjectPath)
  const opened = await win.webContents.executeJavaScript(
    `(async () => { await window.openProjectPath(${JSON.stringify(FIXTURE)}); return window.appState.currentProjectPath; })()`
  );
  check(opened === FIXTURE, '渲染进程已打开测试工程: ' + opened);

  // 走真实用户路径: 顶部栏「检查」菜单 → Debug 条目
  const menuState = await win.webContents.executeJavaScript(`(function () {
    var wrap = document.querySelector('.menu-item-wrap[data-menu="checks"]');
    if (!wrap) return 'no-menu';
    var trigger = wrap.querySelector('.menu-trigger');
    var entry = wrap.querySelector('[data-action="checks-debug"]');
    if (!trigger || !entry) return 'no-entry';
    var label = (trigger.textContent || '').trim() + ' / ' + (entry.textContent || '').trim();
    trigger.click();
    var opened = wrap.classList.contains('open');
    entry.click();
    return 'clicked: ' + label + ' open=' + opened;
  })()`);
  check(menuState.indexOf('clicked:') === 0, '顶部栏「检查」菜单与 Debug 条目可用 (' + menuState + ')');

  // 等窗口真正导航到 checks.html (刚创建时 getURL() 还是空的)
  const checksWin = await waitFor(() => {
    const ws = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== win);
    if (!ws.length) return null;
    return ws[0].webContents.getURL().indexOf('checks.html') !== -1 ? ws[0] : null;
  }, 30000, 'checks window');
  check(!!checksWin, 'Checks 独立窗口已创建并加载 checks.html');

  const info = await waitFor(async () => {
    const r = await checksWin.webContents.executeJavaScript(`(function () {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.chk-row'));
      var st = document.getElementById('chk-status');
      return {
        ready: rows.length > 0 && st && st.textContent.indexOf('扫描中') === -1,
        title: document.title,
        chips: Array.prototype.slice.call(document.querySelectorAll('.chk-chip')).map(function (b) { return b.textContent.trim(); }),
        rows: rows.map(function (r) {
          return { cls: r.className, msg: (r.querySelector('.chk-msg') || {}).textContent || '', loc: (r.querySelector('.chk-loc') || {}).textContent || '' };
        }),
        groups: Array.prototype.slice.call(document.querySelectorAll('.chk-group-head .chk-file')).map(function (e) { return e.textContent; }),
        status: st ? st.textContent : '',
      };
    })()`);
    return r && r.ready ? r : null;
  }, 30000, 'checks window data');

  console.log('\n--- 窗口内容 ---');
  console.log('title : ' + info.title);
  console.log('chips : ' + info.chips.join(' | '));
  console.log('status: ' + info.status);
  console.log('groups: ' + info.groups.join(', '));
  info.rows.forEach((r) => console.log('  [' + r.cls.replace('chk-row ', '') + '] ' + r.msg + '  @' + r.loc.replace(/\s+/g, ' ').trim()));

  check(info.rows.some((r) => r.cls.indexOf('chk-row-error') !== -1), '列表含 ERROR 行');
  check(info.rows.some((r) => r.cls.indexOf('chk-row-weak') !== -1), '列表含 WEAK 行');
  check(info.rows.some((r) => r.cls.indexOf('chk-row-info') !== -1), '列表含 INFO 行');
  check(info.rows.some((r) => r.msg.indexOf('client_bound_data') !== -1 || r.msg.indexOf('client-bound-data') !== -1),
    '付费版专属字段的 INFO 出现在列表中');
  check(info.rows.some((r) => r.msg.indexOf('internal') !== -1 && r.msg.indexOf('命名空间') !== -1) === false,
    'internal 命名空间未被报告为未知资源包');
  check(info.rows.some((r) => r.msg.indexOf('nosuchpack') !== -1), '普通目录下的 unknownNamespace 仍然报告');
  check(info.groups.length >= 3, '按文件分组生效 (组数 ' + info.groups.length + ')');

  // ---- 严重级别筛选 ----
  const filtered = await checksWin.webContents.executeJavaScript(`(function () {
    var chips = document.querySelectorAll('.chk-chip');
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].dataset.sev === 'ERROR') { chips[i].click(); break; }
    }
    var rows = Array.prototype.slice.call(document.querySelectorAll('.chk-row'));
    return { total: rows.length, errors: rows.filter(function (r) { return r.className.indexOf('chk-row-error') !== -1; }).length };
  })()`);
  check(filtered.errors === 0 && filtered.total > 0, '关闭 ERROR 筛选后列表不含 ERROR 行 (剩余 ' + filtered.total + ')');

  // 恢复
  await checksWin.webContents.executeJavaScript(`(function () {
    var chips = document.querySelectorAll('.chk-chip');
    for (var i = 0; i < chips.length; i++) { if (chips[i].dataset.sev === 'ERROR') { chips[i].click(); break; } }
  })()`);

  // ---- 搜索 ----
  const searched = await checksWin.webContents.executeJavaScript(`(function () {
    var s = document.getElementById('chk-search');
    s.value = 'client_bound_data';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    var rows = Array.prototype.slice.call(document.querySelectorAll('.chk-row'));
    return { total: rows.length, msgs: rows.map(function (r) { return (r.querySelector('.chk-msg') || {}).textContent || ''; }) };
  })()`);
  check(searched.total > 0 && searched.msgs.every((m) => m.indexOf('client_bound_data') !== -1),
    '搜索 client_bound_data 只保留匹配行 (命中 ' + searched.total + ')');

  const noHit = await checksWin.webContents.executeJavaScript(`(function () {
    var s = document.getElementById('chk-search');
    s.value = 'zzz-no-such-thing-zzz';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return { rows: document.querySelectorAll('.chk-row').length, empty: !!document.querySelector('.chk-empty') };
  })()`);
  check(noHit.rows === 0 && noHit.empty, '无匹配时显示空状态');

  // 截图留档 (人工/视觉模型核对布局)
  try {
    await checksWin.webContents.executeJavaScript(`(function () {
      var s = document.getElementById('chk-search');
      s.value = '';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    checksWin.setSize(1100, 780);
    await sleep(300);
    const img = await checksWin.webContents.capturePage();
    const outDir = path.join(APP_DIR, '_ce_shots');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'checks-window.png'), img.toPNG());
    console.log('shot → ' + path.join(outDir, 'checks-window.png'));
  } catch (e) { console.log('shot failed: ' + (e && e.message)); }

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); app.exit(1); });
