/* 标签命名空间分离 + MiniMessage 装饰标签验证
 * 用法: node_modules\.bin\electron.cmd _ce_tags_test.js
 *
 * 重点:
 *   - <i>/<b>/<u>/<st>/<obf> 短名必须真的生效 (过去写到 style.i 上, 静默失效)
 *   - <!i> / </i> / <!italic> / </italic> 都要能去掉样式
 *   - 关掉 MiniMessage 时 MM 标签原样显示, 但 CE 标签仍生效 (反之亦然)
 *   - <click>/<hover>/<key>/<lang>/<selector>/<score>/<nbt> 不再当普通文字漏出来
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const CE_YML = 'E:/craft-engine/common-files/src/main/resources/resources/internal/configuration/gui.yml';

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }

ipcMain.handle('app:getPath', async () => APP_DIR);
ipcMain.handle('fs:readFile', async (e, p) => { try { return { success: true, content: await fs.promises.readFile(p, 'utf-8') }; } catch (x) { return { success: false }; } });
ipcMain.handle('fs:readdir', async (e, p) => { try { const es = await fs.promises.readdir(p, { withFileTypes: true }); return { success: true, files: es.map(x => ({ name: x.name, isDirectory: x.isDirectory(), path: path.join(p, x.name) })) }; } catch (x) { return { success: false }; } });
ipcMain.handle('ce:resolveProjectRoot', async (e, p) => { try { return await ceProject.resolveProjectRoot(p); } catch (x) { return { found: false }; } });
ipcMain.handle('mc:scanAssets', async (e, r) => mcAssets.scanAssets(r));
ipcMain.handle('mc:scanNamespace', async (e, d, n) => ({ ok: true, registry: await mcAssets.scanNamespace(d, n) }));
ipcMain.handle('mc:readSoundEvents', async (e, d, l) => ({ ok: true, events: await mcAssets.readSoundEvents(d, l) }));
ipcMain.handle('mc:readBinary', async (e, p) => mcAssets.readBinaryDataUrl(p));
ipcMain.handle('mc:readText', async (e, p) => mcAssets.readTextFile(p));
ipcMain.handle('mc:detectRoots', async () => ({ ok: true, roots: await mcAssets.detectRoots() }));
ipcMain.handle('fonts:list', async () => ({ success: true, fonts: [] }));
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'tags'; });

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await new Promise(r => setTimeout(r, 700));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)}, Y = ${JSON.stringify(CE_YML)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, filePath: Y, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    await window.CEPreview.setActiveFile(Y);
    await window.CEPreview.collectProjectData(true);
    await window.CEPreview.preloadImages();

    // 取一段文本里「可见字形」的样式序列 (跳过 shift/image/break)
    function styleSeq(text, opts) {
      const p = window.CEPreview.parseText(text, Object.assign({ resolveTags: true }, opts || {}));
      const out = [];
      for (const it of p.items) {
        if (it.kind !== 'glyph') continue;
        const st = it.style || {};
        out.push({
          ch: it.ch,
          bold: !!st.bold, italic: !!st.italic, u: !!st.underlined,
          st: !!st.strikethrough, obf: !!st.obfuscated,
          shadow: !!st.shadow,
        });
      }
      return out;
    }
    // 文本里所有 glyph 拼起来 (看标签有没有被当字面量渲染出来)
    function rendered(text, opts) {
      const p = window.CEPreview.parseText(text, Object.assign({ resolveTags: true }, opts || {}));
      return p.items.map(it => it.kind === 'glyph' ? it.ch : (it.kind === 'break' ? '\\n' : '')).join('');
    }
    function kinds(text, opts) {
      const p = window.CEPreview.parseText(text, Object.assign({ resolveTags: true }, opts || {}));
      return p.items.map(it => it.kind).join(',');
    }
    // 详细: 每个 item 的 kind + 是否灰色占位 (#7F7F7F) —— 用来区分「占位符」和「原样漏出的标签」
    function detailed(text, opts) {
      const p = window.CEPreview.parseText(text, Object.assign({ resolveTags: true }, opts || {}));
      return p.items.map(it => {
        if (it.kind === 'glyph') {
          const c = (it.style && it.style.color) || {};
          const gray = Math.abs(c.r - 127) < 3 && Math.abs(c.g - 127) < 3 && Math.abs(c.b - 127) < 3;
          return { k: 'g', ch: it.ch, gray: gray };
        }
        if (it.kind === 'image') return { k: 'img', shadow: !!(it.style && it.style.shadow) };
        if (it.kind === 'shift') return { k: 'shift', dx: it.dx };
        return { k: it.kind };
      });
    }
    function allGray(det) {
      const gs = det.filter(d => d.k === 'g');
      return gs.length > 0 && gs.every(d => d.gray);
    }

    const res = {};
    // 1) 短名装饰
    res.shortI = styleSeq('<i>a');
    res.shortB = styleSeq('<b>a');
    res.shortU = styleSeq('<u>a');
    res.shortST = styleSeq('<st>a');
    res.shortOBF = styleSeq('<obf>a');
    res.longEm = styleSeq('<em>a');
    // 2) 长名
    res.longItalic = styleSeq('<italic>a');
    // 3) 用户的例子: <i>斜体<!i>正常
    res.userExample = styleSeq('<i>斜<!i>正');
    // 4) 关闭的几种写法
    res.closeSlash = styleSeq('<i>a</i>b');
    res.closeBangLong = styleSeq('<italic>a<!italic>b');
    res.closeSlashBang = styleSeq('<i>a<!/i>b');
    // 5) reset
    res.reset = styleSeq('<bold><italic><reset>a');
    // 6) 两个命名空间分开开关
    //    关掉 MiniMessage: MM 标签原样显示成普通文字 (不是灰色占位)
    res.mmOff = { det: detailed('<i><red>hi', { resolveMiniMessage: false }),
                  seq: styleSeq('<i>hi', { resolveMiniMessage: false }) };
    res.ceOffShift = kinds('<shift:10>x', { resolveCeTags: false });
    res.ceOnShift = kinds('<shift:10>x', { resolveCeTags: true });
    res.mmOffCeOn = detailed('<i><shift:5>x', { resolveMiniMessage: false, resolveCeTags: true });
    res.ceOffMmOn = styleSeq('<i>x', { resolveMiniMessage: true, resolveCeTags: false });
    // 7) 不该漏出字面量的 MiniMessage 标签 (应变成灰色占位)
    res.click = rendered("<click:open_url:'https://a.b'>hi");
    res.hover = rendered("<hover:show_text:'tip'>hi");
    res.key = detailed('<key:key.jump>');
    res.langKnown = detailed('<lang:item.chinese_lantern>');
    res.langUnknown = detailed('<lang:no.such.key>');
    res.score = detailed('<score:abc:obj>');
    res.nbt = detailed('<nbt:abc>');
    res.selector = detailed('<selector:@e>');
    res.newline = kinds('a<newline>b');
    // 8) CE 侧 i18n / papi 默认值
    res.i18nKnown = detailed('<i18n:item.chinese_lantern>');
    res.papiDefault = rendered('<papi:player_name:Steve>');
    // 9) image 的 format 参数里用 <!shadow>
    res.imgFmt = detailed("<image:internal:smelting:'<!shadow><white>'>");
    // 10) 注册表导出
    res.reg = { deco: Object.keys(window.CEPreview.tags.decorations).length,
                ce: Object.keys(window.CEPreview.tags.ce).length,
                mmOpaque: Object.keys(window.CEPreview.tags.mmOpaque),
                mmPlaceholder: Object.keys(window.CEPreview.tags.mmPlaceholder) };
    res.allGray = { key: allGray(res.key), langUnknown: allGray(res.langUnknown),
                    score: allGray(res.score), nbt: allGray(res.nbt), selector: allGray(res.selector),
                    langKnown: allGray(res.langKnown), i18n: allGray(res.i18nKnown) };
    res.escaped = { mmOff: allGray(res.mmOff.det), ceOff: allGray(detailed('<shift:10>x', { resolveCeTags: false })) };
    return res;
  })()`, true);

  const s = (seq) => JSON.stringify(seq);

  // --- 短名装饰必须生效 (回归: 曾经写到 style.i 上) ---
  check(out.shortI[0] && out.shortI[0].italic === true, '<i> 生效 (italic=true): ' + s(out.shortI));
  check(out.shortB[0] && out.shortB[0].bold === true, '<b> 生效 (bold=true)');
  check(out.shortU[0] && out.shortU[0].u === true, '<u> 生效 (underlined=true)');
  check(out.shortST[0] && out.shortST[0].st === true, '<st> 生效 (strikethrough=true)');
  check(out.shortOBF[0] && out.shortOBF[0].obf === true, '<obf> 生效 (obfuscated=true)');
  check(out.longEm[0] && out.longEm[0].italic === true, '<em> 生效 (italic=true)');
  check(out.longItalic[0] && out.longItalic[0].italic === true, '<italic> 生效');

  // --- 用户的例子 ---
  check(out.userExample.length === 2, '<i>斜<!i>正 产出 2 个字形 (' + out.userExample.length + ')');
  check(out.userExample[0] && out.userExample[0].italic === true, '  「斜」是斜体');
  check(out.userExample[1] && out.userExample[1].italic === false, '  「正」已恢复正常 (italic=false)');

  // --- 三种关闭写法 ---
  check(out.closeSlash[1] && out.closeSlash[1].italic === false, '</i> 关闭生效');
  check(out.closeBangLong[1] && out.closeBangLong[1].italic === false, '<!italic> 关闭生效');
  check(out.closeSlashBang[1] && out.closeSlashBang[1].italic === false, '<!/i> 关闭生效');

  // --- reset ---
  check(out.reset[0] && !out.reset[0].bold && !out.reset[0].italic, '<reset> 清掉 bold/italic');

  // --- 命名空间分离 ---
  check(out.escaped.mmOff === false && out.mmOff.det.filter(d => d.ch === '<').length === 2,
    '关掉 MiniMessage 后 <i>/<red> 原样显示成普通文字 (非灰色占位): ' +
    JSON.stringify(out.mmOff.det.map(d => d.ch).join('')));
  check(out.mmOff.seq[0] && out.mmOff.seq[0].italic === false, '  且不再应用样式');
  check(out.ceOffShift.indexOf('shift') === -1 && out.escaped.ceOff === false,
    '关掉 CE 后 <shift:10> 原样显示, 不再变成位移 (' + out.ceOffShift + ')');
  check(out.ceOnShift === 'shift,glyph', 'CE 开启时 <shift:10> 变成位移项 (' + out.ceOnShift + ')');
  check(out.mmOffCeOn[0] && out.mmOffCeOn[0].ch === '<' &&
        out.mmOffCeOn.some(d => d.k === 'shift') && out.mmOffCeOn.some(d => d.ch === 'x'),
    'MiniMessage 关 + CE 开: MM 原样显示, CE 仍生效 (' +
    JSON.stringify(out.mmOffCeOn.map(d => d.k === 'shift' ? 'shift' : d.ch).join('')) + ')');
  check(out.ceOffMmOn[0] && out.ceOffMmOn[0].italic === true, 'CE 关 + MM 开: MM 仍生效');

  // --- 不该漏字面量 ---
  check(out.click === 'hi', "<click:...> 被吃掉不显示 (" + JSON.stringify(out.click) + ")");
  check(out.hover === 'hi', "<hover:...> 被吃掉不显示 (" + JSON.stringify(out.hover) + ")");
  check(out.allGray.key, '<key:...> 渲染成灰色占位符');
  check(out.allGray.score, '<score:...> 渲染成灰色占位符');
  check(out.allGray.nbt, '<nbt:...> 渲染成灰色占位符');
  check(out.allGray.selector, '<selector:...> 渲染成灰色占位符');
  check(out.newline === 'glyph,break,glyph', '<newline> 变成换行 (' + out.newline + ')');

  console.log('lang已知 →', JSON.stringify(out.langKnown.map(d => d.ch).join('')),
    '| 是否灰色占位:', out.allGray.langKnown);
  console.log('i18n →', JSON.stringify(out.i18nKnown.map(d => d.ch).join('')),
    '| 是否灰色占位:', out.allGray.i18n, '| papi默认值 →', JSON.stringify(out.papiDefault));
  check(out.allGray.langUnknown, '<lang:未知键> 用灰色占位符而不是漏出标签');
  check(!out.allGray.i18n || out.i18nKnown.length > 0, '<i18n:...> 被消费 (走译文或占位)');
  check(out.papiDefault === 'Steve', '<papi:name:default> 显示默认值 (' + out.papiDefault + ')');

  check(out.imgFmt[0] && out.imgFmt[0].k === 'img' && out.imgFmt[0].shadow === false,
    '<image:...:<!shadow>> 的 format 参数生效 (shadow=false)');

  console.log('注册表:', JSON.stringify(out.reg));
  check(out.reg.ce >= 15, 'CE 标签注册表完整 (' + out.reg.ce + ' 个)');
  check(out.reg.deco >= 11, '装饰别名表完整 (' + out.reg.deco + ' 个)');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
