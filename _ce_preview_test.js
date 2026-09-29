/* ce-preview.js 冒烟测试 (无浏览器: 假 canvas 2D 上下文)
 * 覆盖: 文本解析 / MiniMessage / CE 标签 / 换行 / 三种场景的尺寸与调用
 * 运行: node _ce_preview_test.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

let fails = 0;
function check(cond, msg) {
  if (cond) console.log('PASS  ' + msg);
  else { console.log('FAIL  ' + msg); fails++; }
}

// ---------------- 假 canvas ----------------
function makeCtx() {
  const calls = { drawImage: 0, fillRect: 0, fillText: 0, transform: 0, strokeRect: 0 };
  return {
    calls,
    imageSmoothingEnabled: true,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '',
    fillRect() { calls.fillRect++; },
    strokeRect() { calls.strokeRect++; },
    clearRect() {}, save() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    transform() { calls.transform++; },
    setTransform() {}, translate() {}, scale() {}, rotate() {},
    drawImage() { calls.drawImage++; },
    fillText() { calls.fillText++; },
    measureText() { return { width: 6 }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
}
function makeCanvas() {
  const cv = { width: 1, height: 1, style: {} };
  cv.getContext = () => makeCtx();
  return cv;
}
const documentStub = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return { style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {} };
  },
  body: { classList: { contains() { return false; }, add() {}, remove() {}, toggle() {} } },
  getElementById() { return null; },
  addEventListener() {}, removeEventListener() {},
};

const sandbox = {
  console, Promise, setTimeout, clearTimeout, JSON, Math, Date, Object, Array, String, Number,
  Boolean, RegExp, Error, Map, Set, Uint8ClampedArray, isFinite, parseInt, parseFloat,
  document: documentStub,
  I18N: { lang: 'zh_cn', t: (k) => k },
  Image: function () { this.onload = null; this.onerror = null; },
  window: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('ce-preview.js', 'utf8'), sandbox, { filename: 'ce-preview.js' });

const P = sandbox.CEPreview;
check(!!P, 'CEPreview 已加载');
check(typeof P.renderScene === 'function', 'renderScene 存在');
check(typeof P.parseText === 'function', 'parseText 导出');
check(typeof P.drawItem === 'function', 'drawItem 导出');
check(typeof P.collectProjectData === 'function', 'collectProjectData 导出');

(async () => {
  await P.init({});

  // ---------- 文本解析 ----------
  let p = P.parseText('Hello', {});
  check(p.items.length === 5, '解析 5 个字形 (' + p.items.length + ')');
  check(p.width > 0, '宽度 > 0 (' + p.width + ')');

  p = P.parseText('<red>Red</red> <bold>B</bold>', {});
  const colors = p.items.filter(i => i.style && i.style.color).map(i => i.style.color);
  check(colors.some(c => c && c.r === 255 && c.g === 85 && c.b === 85), 'MiniMessage <red> 解析为 #FF5555');
  check(p.items.some(i => i.style && i.style.bold), 'MiniMessage <bold> 解析为粗体');

  p = P.parseText('<!italic><#00FF00>X', {});
  check(p.items[0].style.italic === false, '<!italic> 关闭斜体');
  check(p.items[0].style.color.g === 255, '十六进制颜色解析');

  p = P.parseText('\u00a7cLegacy', {});
  check(p.items[0].style.color.r === 255 && p.items[0].style.color.g === 85, '§c 旧版颜色码解析');

  p = P.parseText('A\nB', {});
  check(p.items.some(i => i.kind === 'break'), '换行生成 break');
  check(p.lines === 2, '行数统计 = 2 (' + p.lines + ')');

  // <shift:N>
  p = P.parseText('A<shift:-10>B', {});
  const sh = p.items.find(i => i.kind === 'shift');
  check(sh && sh.dx === -10, '<shift:-10> 解析为位移 -10');

  // <global:>
  P.setGlobals({ tag: '<red>[RARE]</red>' });
  p = P.parseText('<global:tag> X', {});
  check(p.items.some(i => i.style && i.style.color && i.style.color.r === 255 && i.style.color.g === 85),
    '<global:tag> 展开并继承颜色');

  // <i18n:>
  P.setLangs({ 'item.test': '<gold>Gold Item</gold>' });
  p = P.parseText('<i18n:item.test>', {});
  check(p.items.length > 5, '<i18n:item.test> 展开为文本 (' + p.items.length + ' 字形)');

  // 未解析标签原样保留
  p = P.parseText('<unknown_tag>x', {});
  check(p.items.length >= 12, '未知标签原样输出为文本');

  // <expr:>
  p = P.parseText("<expr:0.##:'70 / 8'>", {});
  const exprText = p.items.map(i => i.ch || '').join('');
  check(exprText.indexOf('8.75') === 0, '<expr> 计算 70/8 = 8.75 (得到 "' + exprText + '")');

  // <random:> 同 id 只 roll 一次
  p = P.parseText("<random:atk:5~10>", {});
  const t1 = p.items.map(i => i.ch || '').join('');
  p = P.parseText("<random:atk:5~10>", {});
  const t2 = p.items.map(i => i.ch || '').join('');
  check(t1 === t2 && t1.length > 0, '<random> 同 id 结果稳定 (' + t1 + ')');

  // <image:> 未定义 → 占位
  p = P.parseText('<image:default:icons>', {});
  const imgItem = p.items.find(i => i.kind === 'image');
  check(imgItem && !imgItem.info, '未定义的 <image:> 记为占位');
  check(imgItem && typeof imgItem.tag === 'string', '<image:> 保留原始标签文本');

  // 关闭 resolveTags 时标签原样
  const saved = P.getOptions();
  P.setOptions({ resolveTags: false });
  p = P.parseText('<red>x', {});
  P.setOptions(saved);
  check(p.items.map(i => i.ch || '').join('').indexOf('<red>') === 0, 'resolveTags=false 时不解析标签');

  // ---------- 换行 ----------
  const wrapped = P.wrapText('the quick brown fox jumps over the lazy dog again and again', 60, {});
  check(wrapped.length > 1, 'wrapText 产生多行 (' + wrapped.length + ')');
  check(wrapped.every(l => P.measureText(l, {}).width <= 60 * 1.2), 'wrapText 各行宽度接近限制');

  // ---------- 场景: chat ----------
  let cv = makeCanvas();
  let res = await P.renderScene(cv, { type: 'chat', lines: ['<red>Hello</red> world', 'second line'], scale: 2, chatWidth: 120 });
  check(res && cv.width > 0 && cv.height > 0, 'chat 场景渲染尺寸 ' + cv.width + 'x' + cv.height);
  check(Array.isArray(res.warnings), 'chat 场景返回 warnings 数组');
  check(cv.height >= 9 * 2 * 2, 'chat 高度 >= 两行文本');

  // ---------- 场景: lore ----------
  await P.setGlobals({});
  cv = makeCanvas();
  res = await P.renderScene(cv, {
    type: 'lore', scale: 3, name: '<gold>Test Sword</gold>',
    lore: ['<gray>Line one</gray>', '<gray>Line two</gray>'], showItem: false,
  });
  check(cv.width > 0 && cv.height > 0, 'lore 场景渲染尺寸 ' + cv.width + 'x' + cv.height);
  check(cv.height >= (5 * 2 + 2 * 9) * 3, 'lore 高度包含标题与两行描述');

  // ---------- 场景: gui 9xN ----------
  for (const rows of [1, 3, 6]) {
    cv = makeCanvas();
    res = await P.renderScene(cv, { type: 'gui', rows, scale: 2, title: 'Container', fillPlayerInventory: true });
    const expW = 176 * 2;
    const expH = (114 + 18 * rows) * 2;
    check(cv.width === expW && cv.height === expH,
      'gui 9x' + rows + ' 尺寸 ' + cv.width + 'x' + cv.height + ' (期望 ' + expW + 'x' + expH + ')');
  }

  // ---------- 场景: 物品栏 (item) ----------
  cv = makeCanvas();
  res = await P.renderScene(cv, {
    type: 'item', scale: 3, name: '<gold>Sword</gold>', lore: ['<gray>lore'], item: 'minecraft:diamond_sword', count: 16,
  });
  check(cv.width > 0 && cv.height > 0, 'item 场景渲染尺寸 ' + cv.width + 'x' + cv.height);
  check(cv.height > 9 * 3, 'item 场景包含工具提示 + 快捷栏');

  // ---------- 场景: 图像总览 ----------
  cv = makeCanvas();
  res = await P.renderScene(cv, { type: 'image', scale: 2 });
  check(cv.width > 0 && cv.height > 0, 'image 画廊场景在无 images 时仍可渲染 ' + cv.width + 'x' + cv.height);

  // ---------- 带前缀的方块 id 解析 (需要真实资源, 见 _ce_font_test.js) ----------

  // ---------- drawItem / resolveItemModel (无资源时安全降级) ----------
  const model = await P.resolveItemModel('minecraft:diamond_sword');
  check(model && typeof model.kind === 'string', 'resolveItemModel 返回 kind=' + (model && model.kind));
  const model2 = await P.resolveItemModel({ texture: 'minecraft:item/apple' });
  check(model2.kind === 'flat' && model2.texture === 'minecraft:item/apple', '显式 texture 直接作为平面图标');
  const ctx = makeCtx();
  const dres = await P.drawItem(ctx, 'minecraft:diamond_sword', 0, 0, 16);
  check(dres && typeof dres.kind === 'string', 'drawItem 无资源时不抛异常 (kind=' + dres.kind + ')');

  // ---------- 异常输入 ----------
  res = await P.renderScene(cv, null);
  check(res && typeof res.width === 'number', 'renderScene(null) 不抛异常');
  res = await P.renderScene(null, { type: 'lore' });
  check(res && res.warnings.length > 0, 'renderScene(无 canvas) 返回 warning');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
