/* 家具预览面板控件验证
 * 用法: node_modules\.bin\electron.cmd _ce_furniture_panel_test.js
 *
 * 覆盖面板侧的新家具功能:
 *   - 家具场景下显示「旋转 / 缩放 / 碰撞箱开关」控件, 其它场景隐藏
 *   - 旋转按钮 (±45°) 与重置真的改变渲染结果
 *   - 缩放按钮改变画布尺寸并回写百分比
 *   - 碰撞箱/填充/标注/座位/网格 开关生效
 *   - 点击画布命中碰撞箱 → 状态栏给出彩色图例 + 选中详情
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mcAssets = require('./mc-assets.js');
const ceProject = require('./ce-project.js');

const APP_DIR = __dirname;
const MC_ROOT = 'E:/MC/Windose/.minecraft/versions/26.3/26.3/assets';
const SHOT_DIR = path.join(APP_DIR, '_ce_shots');

let fails = 0;
function check(ok, label) { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fails++; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
ipcMain.on('app:getVersionSync', (e) => { e.returnValue = 'fpanel'; });

// 一个带座位与两种碰撞箱的家具, 便于点击拾取
const CHAIR = {
  variants: {
    ground: {
      elements: [
        { type: 'block_display', block: 'minecraft:stone', translation: '-0.5,0,0' },
        { type: 'block_display', block: 'minecraft:oak_planks', translation: '0.5,0,0' },
      ],
      hitboxes: [
        { type: 'interaction', width: 1, height: 2, seats: ['0.5,0.3,0.5 90'] },
        { type: 'shulker', position: '1,0,0', scale: 1, peek: 50 },
      ],
    },
  },
};

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true },
  });
  await win.loadFile(path.join(APP_DIR, 'index.html'));
  await sleep(700);

  await win.webContents.executeJavaScript(`(async () => {
    const R = ${JSON.stringify(MC_ROOT)};
    for (let i = 0; i < 300 && window.CEMCAssets.status().state !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
    await window.CEMCAssets.init({ mcRoot: R, force: true });
    await window.CEPreview.init({ mcRoot: R });
    await window.CEPreview.fontReady();
    const b = document.getElementById('welcome-btn'); if (b) b.click();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    window.CEPreviewPanel.open({
      section: 'furniture', sectionBase: 'furniture', entryKey: 'demo:panel_chair',
      data: ${JSON.stringify(CHAIR)},
    });
    return true;
  })()`, true);
  await sleep(900);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  async function ui() {
    return await js(`(function(){
      const c = document.querySelector('#pv-canvas');
      const g = c && c.getContext('2d');
      let blue = 0, grey = 0;
      if (c) {
        const px = g.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i+3] <= 40) continue;
          if (Math.abs(px[i]-79) <= 14 && Math.abs(px[i+1]-195) <= 14 && Math.abs(px[i+2]-247) <= 14) blue++;
          if (Math.abs(px[i]-px[i+1]) <= 12 && Math.abs(px[i+1]-px[i+2]) <= 12 && px[i] > 50 && px[i] < 215) grey++;
        }
      }
      const st = window.CEPreviewPanel.getState();
      return {
        canvas: c ? c.width + 'x' + c.height : null,
        guiScale: c ? parseInt(c.getAttribute('data-gui-scale'), 10) : 0,
        blue: blue, grey: grey,
        furnGroup: (document.querySelector('#pv-furn-group') || {}).style ? document.querySelector('#pv-furn-group').style.display : null,
        furnChecks: document.querySelector('#pv-furn-checks') ? document.querySelector('#pv-furn-checks').style.display : null,
        zoomLabel: (document.querySelector('#pv-furn-zoomval') || {}).textContent || '',
        dots: document.querySelectorAll('#pv-status .pv-dot').length,
        status: (document.querySelector('#pv-status') || {}).textContent || '',
        yaw: st.furnYaw, zoom: st.furnZoom, pick: st.furnPick,
        hb: st.furnHitboxes, fill: st.furnFill, seats: st.furnSeats, labels: st.furnLabels, grid: st.furnGrid,
      };
    })()`, true);
  }

  const initial = await ui();
  console.log('初始:', JSON.stringify(initial));
  check(initial.furnGroup === '' || initial.furnGroup === null ? initial.furnGroup !== 'none' : false,
    '家具场景显示视图控制组 (' + JSON.stringify(initial.furnGroup) + ')');
  check(initial.furnChecks !== 'none', '家具场景显示碰撞箱开关组');
  check(initial.zoomLabel === '100%', '缩放显示 100% (' + initial.zoomLabel + ')');
  check(initial.yaw === 0 && initial.zoom === 1, '初始视角 0° / 100%');
  check(initial.blue > 50, '初始画出了碰撞箱线框 (蓝 ' + initial.blue + ')');
  check(initial.dots >= 2, '状态栏有碰撞箱彩色图例 (' + initial.dots + ' 个)');
  // 夹具: 1 个交互箱 + 1 条潜影贝 (peek 50 → 本体 + 壳两个箱体) = 画出 3 个, 配置 2 条
  check(initial.status.indexOf('碰撞箱 3') !== -1, '碰撞箱计数按实际箱体算 (潜影贝打开算两个)');
  check(initial.status.indexOf('配置 2') !== -1, '同时标出配置条数 (' + initial.status.slice(0, 90) + ')');

  // 旋转 45°
  await js(`document.querySelector('[data-furn-yaw="45"]').click()`);
  await sleep(500);
  const rotated = await ui();
  console.log('旋转后:', JSON.stringify({ yaw: rotated.yaw, canvas: rotated.canvas, blue: rotated.blue }));
  check(rotated.yaw === 45, '右转按钮把 yaw 设为 45 (' + rotated.yaw + ')');
  check(rotated.status.indexOf('45°') !== -1, '状态栏显示当前视角 (' + rotated.status.slice(0, 60) + ')');
  await js(`document.querySelector('[data-furn-yaw="-45"]').click()`);
  await sleep(500);
  const back = await ui();
  check(back.yaw === 0, '左转按钮转回 0 (' + back.yaw + ')');

  // 键盘快捷键: E 右转 / Q 左转 / R 重置
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`);
  await sleep(450);
  const kbE = await ui();
  check(kbE.yaw === 45, 'E 键右转 45° (' + kbE.yaw + ')');
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))`);
  await sleep(450);
  const kbQ = await ui();
  check(kbQ.yaw === 0, 'Q 键左转回 0° (' + kbQ.yaw + ')');
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))`);
  await sleep(400);
  await js(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))`);
  await sleep(450);
  const kbR = await ui();
  check(kbR.yaw === 0 && kbR.zoom === 1 && kbR.pick === -1, 'R 键重置视角/缩放/选中');

  // 拖拽旋转视角: 左右拖动指针即可自由旋转 (不需要点按钮)
  const dragInfo = await js(`(function(){
    const c = document.querySelector('#pv-canvas');
    const r = c.getBoundingClientRect();
    const id = 7;
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, button: 0, buttons: 1, clientX: r.left + 40, clientY: r.top + 40, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, buttons: 1, clientX: r.left + 140, clientY: r.top + 40, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, button: 0, clientX: r.left + 140, clientY: r.top + 40, bubbles: true }));
    return true;
  })()`, true);
  await sleep(600);
  const dragged = await ui();
  console.log('拖拽后:', JSON.stringify({ yaw: dragged.yaw, label: dragged.status.slice(0, 40) }));
  check(dragInfo && dragged.yaw > 40 && dragged.yaw < 120, '左右拖动指针可以自由旋转视角 (yaw ' + dragged.yaw + '°)');
  check(Math.abs((dragged.yaw || 0) % 45) > 1, '拖动得到的是自由角度, 不吸附到 45° (' + dragged.yaw + '°)');
  // Shift 拖动吸附到 15°
  await js(`(function(){
    const c = document.querySelector('#pv-canvas');
    const r = c.getBoundingClientRect();
    const id = 8;
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, button: 0, buttons: 1, clientX: r.left + 40, clientY: r.top + 40, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, buttons: 1, shiftKey: true, clientX: r.left + 141, clientY: r.top + 40, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, button: 0, clientX: r.left + 141, clientY: r.top + 40, bubbles: true }));
    return true;
  })()`, true);
  await sleep(600);
  const snapped = await ui();
  const snappedYaw = snapped.yaw || 0;
  check(Math.abs(snappedYaw % 15) < 0.001, 'Shift 拖动吸附到 15° 的整数倍 (' + snappedYaw + '°)');
  const yawLabel = snapped.status.indexOf(Math.round(snappedYaw) + '°') !== -1;
  check(yawLabel, '状态栏角度跟着拖动更新 (' + snappedYaw + '°)');
  // 拖完的那次 click 不应该被当成「选碰撞箱」
  await js(`(function(){
    const c = document.querySelector('#pv-canvas');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 60, clientY: r.top + 60, bubbles: true }));
  })()`);
  await sleep(400);
  const afterDragClick = await ui();
  check(afterDragClick.pick === -1, '刚拖过视角的那次点击不会误选碰撞箱 (' + afterDragClick.pick + ')');
  // 复位, 后面的用例从干净状态开始
  await js(`document.querySelector('.pv-furn-reset').click()`);
  await sleep(450);
  check((await ui()).yaw === 0, '拖动后也能用重置按钮回到 0°');

  // 缩放: 连点三次到 300%, 画布应明显变大 (100% 时内容还没撑满最小画布)
  await js(`document.querySelector('[data-furn-zoom="1"]').click()`);
  await sleep(450);
  const zoomed = await ui();
  check(zoomed.zoom === 1.5, '放大按钮切到 150% (' + zoomed.zoom + ')');
  check(zoomed.zoomLabel === '150%', '缩放百分比回写 (' + zoomed.zoomLabel + ')');
  await js(`document.querySelector('[data-furn-zoom="1"]').click()`);
  await sleep(450);
  await js(`document.querySelector('[data-furn-zoom="1"]').click()`);
  await sleep(600);
  const zoomed3 = await ui();
  console.log('缩放 300%:', JSON.stringify({ zoom: zoomed3.zoom, canvas: zoomed3.canvas, label: zoomed3.zoomLabel }));
  check(zoomed3.zoom === 3 && zoomed3.zoomLabel === '300%', '继续放大到 300% (' + zoomed3.zoom + ' / ' + zoomed3.zoomLabel + ')');
  // 画布要按「逻辑像素」比 (自动界面尺寸在高缩放下会从 2x 掉到 1x 以放进预览区)
  const logical = (u) => Math.round(parseInt(u.canvas, 10) / (u.guiScale || 1));
  check(logical(zoomed3) > logical(initial), '放大后逻辑画布更大 (' + logical(initial) + ' → ' + logical(zoomed3) + ')');

  // 碰撞箱开关
  await js(`(function(){ const el = document.querySelector('#pv-furn-hb'); el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  const off = await ui();
  check(off.blue === 0, '关掉碰撞箱后画布上没有线框 (' + off.blue + ')');
  check(off.grey > 500, '关掉碰撞箱后家具元素仍在渲染 (灰 ' + off.grey + ')');
  await js(`(function(){ const el = document.querySelector('#pv-furn-hb'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  const on = await ui();
  check(on.blue > 50, '重新打开碰撞箱后线框回来了 (' + on.blue + ')');

  // 悬停/点击拾取: 用拾取数据里第一个箱子的多边形重心
  const pickInfo = await js(`(function(){
    const c = document.querySelector('#pv-canvas');
    const data = window.CEPreview.furniturePickData();
    if (!c || !data || !data.boxes.length) return null;
    const poly = data.boxes[0].poly;
    let cx = 0, cy = 0;
    poly.forEach(p => { cx += p.x / poly.length; cy += p.y / poly.length; });
    const gs = parseInt(c.getAttribute('data-gui-scale'), 10) || 1;
    const r = c.getBoundingClientRect();
    return { clientX: r.left + cx * gs, clientY: r.top + cy * gs, index: data.boxes[0].index,
             type: data.boxes[0].type, w: data.boxes[0].w, h: data.boxes[0].h, d: data.boxes[0].d };
  })()`, true);
  console.log('拾取点:', JSON.stringify(pickInfo));
  check(!!pickInfo, '拿到了碰撞箱拾取多边形');
  if (pickInfo) {
    await js(`(function(){
      const c = document.querySelector('#pv-canvas');
      c.dispatchEvent(new MouseEvent('click', { clientX: ${pickInfo.clientX}, clientY: ${pickInfo.clientY}, bubbles: true }));
    })()`);
    await sleep(500);
    const picked = await ui();
    console.log('点击后:', JSON.stringify({ pick: picked.pick, status: picked.status.slice(0, 120) }));
    check(picked.pick === pickInfo.index, '点击画布选中了碰撞箱 #' + pickInfo.index + ' (' + picked.pick + ')');
    check(picked.status.indexOf('已选碰撞箱') !== -1, '状态栏显示选中详情');
    check(picked.status.indexOf('交互') !== -1, '状态下显示碰撞箱类型 (中文名 交互)');
  }

  // 重置
  await js(`document.querySelector('.pv-furn-reset').click()`);
  await sleep(500);
  const reset = await ui();
  check(reset.yaw === 0 && reset.zoom === 1 && reset.pick === -1,
    '重置按钮恢复视角/缩放/选中 (' + JSON.stringify({ yaw: reset.yaw, zoom: reset.zoom, pick: reset.pick }) + ')');

  // 切到其它场景 → 家具控件隐藏
  await js(`(function(){ const b = document.querySelector('[data-pv-scene="lore"]'); if (b) b.click(); })()`);
  await sleep(600);
  const lore = await ui();
  check(lore.furnGroup === 'none' && lore.furnChecks === 'none', '切到物品提示场景后家具控件隐藏');

  // 截图留档
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const url = await js(`document.querySelector('#pv-canvas').toDataURL('image/png')`, true);
  const ts = Date.now();
  fs.writeFileSync(path.join(SHOT_DIR, 'furniture-panel-' + ts + '.png'), Buffer.from(String(url).replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log('截图 → _ce_shots\\furniture-panel-' + ts + '.png');

  console.log('');
  console.log(fails === 0 ? '全部通过 ✔' : (fails + ' 项失败 ✘'));
  app.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); app.exit(1); });
