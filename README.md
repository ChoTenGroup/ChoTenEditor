# ChoTenEditor

**Discord:** https://discord.com/invite/VHs958jJXj

A plugin editor that isn't very easy to use. Currently, supports the following features.

- [X] Source file editor
- [X] Visual editor
- [X] Editor localization in English and Chinese
- [X] Chemdah quests
- [X] Chemdah dialogues
- [X] Kether editor
- [X] CraftEngine basics
- [X] CraftEngine block editing
- [X] CraftEngine item editing
- [X] CraftEngine font image editing
- [X] MiniMessage editing
- [X] Config error inspection (ERROR / WARN / WEAK_WARN / INFO, IDE-style)
- [X] Whole-project problem list in a separate window (检查 / Checks → Debug, filter + search)
- [X] Autocomplete for CraftEngine items, blocks, textures, models, sounds, particles, enchantments…
- [X] CraftEngine item / block / equipment preview (flat icon + isometric model rendering)
- [X] CraftEngine font image preview inside simulated in-game scenes (chat, item lore, vanilla 9x1–9x6 GUI)
- [X] In-preview resolution of CraftEngine text tags and global variables
- [ ] CraftEngine script editing
- [ ] CraftEngine text parameters
- [ ] Sertraline description editing
- [ ] Sertraline other editing

## CraftEngine tooling

Set the vanilla Minecraft `assets` folder in **Settings → CraftEngine tools** (auto-detected when
possible) and the editor indexes it once (about 30 ms for version `26.3`) to power three features:

- **Autocomplete** — item / block / texture / model / sound event / particle / enchantment /
  potion effect / entity / biome / attribute / painting / jukebox song ids, merged with the ids
  harvested from your own CraftEngine packs. Look for the `▾` button on the right of an input.
- **MC scene preview** — the 👁 button at the top of an entry opens a draggable, **resizable** window that renders
  the entry the way Minecraft would. **The scene set adapts to what the entry is**, because a font
  image and an item are not previewed the same way:

  | entry | scenes (default first) |
  |---|---|
  | items / blocks / furniture / equipments / categories / paintings | **物品栏** (hotbar slot + floating tooltip) · 物品提示 · 容器 GUI · 聊天 |
  | furniture (`furniture:` entries, and items whose `behavior.type` is `furniture_item`) | **家具** (isometric scene) · 物品提示 · 容器 GUI · 聊天 |
  | images (`images:` entries) / emoji | **箱子 GUI** (the glyph inside the container title) · 聊天 · 物品 Lore · 图像总览 |

  The **家具** scene lays a furniture entry out isometrically: a ground grid with the origin
  block outlined and an `N` marker for north, then every element of the selected variant drawn at its
  configured `position` / `translation` / `scale` / `rotation`. Three CE semantics drive the placement:

  * Every furniture-relative coordinate (`position`, hitbox `position`, `seats`) is measured from the
    **bottom centre of the origin block** (`0.5, 0, 0.5`) — the convention the official default pack
    uses (`wooden_chair`'s seat `0,0,-0.1` lands on the block centre, `flower_basket`'s `ceiling`
    variant `position: 0,-0.46,0` hangs below the block).
  * A display entity renders its model **centred** on the entity position, and an element's `position`
    defaults to `0,0,0`; the usual `translation: 0,0.5,0` therefore lifts a Blockbench-style `0..16`
    model into the middle of the block — with it, the model, the hitbox and the outlined origin block
    all coincide.
  * A hitbox box is **centred horizontally** on its `position` with its **bottom at `position.y`**
    (vanilla `interaction`/`shulker` bounding boxes): `width: 0.7, height: 1.2` gives a 0.7-wide box
    centred in the block, 1.2 blocks up from its floor. `scale` multiplies the size. A **shulker**
    hitbox is the 1×1×1 body **plus a second box for the opened shell**: it slides out along
    `direction` by `peek` (100 = one full block), which is why the official `bench`
    (`direction: east, peek: 100`) shows **two boxes side by side, both on the floor**, while
    `direction: up` stacks them. Both boxes are drawn, counted and clickable — clicking either selects
    the same hitbox entry.

  `rotation` (single number = Y axis, three = Euler angles, four = `xyzw` quaternion, or
  `{angle, axis}`) uses the right-handed JOML convention of a display entity's transformation, while
  `yaw` / `pitch` are the entity angles (yaw `0` = south, increasing clockwise). Flat items (an item
  whose model has no `elements`, e.g. `item/generated`) are rendered as **vertical cards** — exactly
  how a display entity draws them — so they turn with the element's `rotation`/`yaw`/`pitch` *and*
  with the view rotation, and a card edge-on to the camera disappears the way it does in game;
  `billboard: vertical|center|horizontal` instead pins them facing the camera, and text displays
  always stay camera-facing. item_display, block_display, item, armor_stand and text_display are
  rendered by reusing the block/item model renderer (items whose model has `elements` become real
  isometric geometry); better_model / model_engine cannot be resolved locally, so they get a dashed
  placeholder and a warning.

  Hitboxes are drawn as 3D wireframes in CE's own debug colours — interaction blue, shulker orange,
  happy_ghast purple, custom green — with hidden edges dashed, `type WxHxD` labels (a shulker's
  `direction` and a lid box's `lid` marker are shown so it is clear why there are two), yellow dots for
  their `seats` (plus a short arrow showing the seat's `yaw`), and the geometry above: `position` is
  the box's horizontal centre and floor, `happy_ghast` is 4×4×4 blocks per scale unit.

  The panel adds a view row for the furniture scene: **⟲ / ⟳** rotate the view in 45° steps (also
  `Q` / `E`, `R` resets) and **dragging left/right on the canvas rotates it freely** (hold `Shift`
  while dragging to snap to 15°), **− / +** zoom 50 %–300 % (also `Ctrl`+wheel or `+` / `-`), and
  checkboxes toggle 碰撞箱 / 填充 / 标注 / 座位 / 网格. The canvas sizes itself to the content, so tall
  or multi-block furniture is never clipped. Clicking a hitbox in the canvas selects it (a click that
  ends a view drag is not treated as a selection): the wireframe highlights with a translucent fill and
  the status bar shows its type, size and seat count next to a colour legend of every hitbox in the
  variant. A **变体** dropdown appears when the entry defines more than one variant.

  The preview window is a normal WindowManager window, so it can be **enlarged**: drag the grip in its
  bottom-right corner, click **⛶** (or double-click the title bar) to maximize/restore, and the size you
  choose is remembered the next time the panel opens. Enlarging the window re-renders the scene and the
  automatic 界面尺寸 scales up with it (up to 6×), so a maximized window really shows a bigger preview.
  Empty space is only limited by the canvas' own maximum (e.g. a very wide furniture variant).

  Windows never fight with the app's own chrome: their z-index lives in a bounded, recycled band
  (990000–998000) that stays **below** the app title/menu bar (1000000/1000001), modals (999997+) and
  rich tooltips (999600) — so the top-right **✕** that closes the app always stays clickable, no matter
  how many windows were opened or clicked. Windows also refuse to slide under the app title bar, and
  when the app window shrinks every open window is pulled back inside the viewport (a maximized one
  re-fills it), so a window's own ✕ can never end up off screen.

  An **item** that carries a `furniture_item` (or `liquid_collision_furniture_item`) behaviour is
  previewed as furniture too. Its `furniture:` may be an id — resolved against the project's
  `furniture:` section as that is scanned — or a full inline definition; an unresolvable id is
  reported rather than silently showing nothing. Furniture elements usually reference the pack's own
  items, so the project's `items:` definitions are collected as well: an element item resolves to the
  `model` / `item_model` / `texture` that item declares, then to its vanilla `material`. That is what
  makes the preview render the pack's real textures instead of flat fallbacks.

  Text painted *into* the canvas is ASCII only: the vanilla assets ship an empty `unifont` provider,
  so CJK has no glyphs there — the Chinese labels live in the panel's status bar instead.

  Inside the preview, MiniMessage formatting, CraftEngine tags (`<image>`, `<global>`, `<shift>`,
  `<expr>`, `<random>`, `<i18n>`, `<arg>`, …) and global variables can each be toggled on or off.

  **MiniMessage and CraftEngine are two separate tag namespaces**, and the preview treats them as
  such — there are separate **解析 MiniMessage 标签** / **解析 CE 标签** switches, so you can turn
  one off and see those tags as literal text while the other keeps working. Decoration aliases and
  their negation follow the [MiniMessage format](https://docs.papermc.io/adventure/minimessage/format/):
  `<b> <i> <u> <st> <obf> <em>` and the long forms all map to the same style, and a style is removed
  by `<!i>` (negation), `</i>` (closing) or `<!/i>` — e.g. `<i>斜体<!i>正常`. `<reset>` clears
  everything, `<shadow>` / `<!shadow>` toggle the drop shadow, and
  `<gradient>` / `<rainbow>` / `<transition>` close with `<!gradient>` or `</gradient>`.
  `<click:…>` and `<hover:…>` change interaction rather than appearance, so they are consumed;
  `<key:…>` / `<selector:…>` / `<score:…>` / `<nbt:…>` and unresolved `<lang:…>` render as a grey
  placeholder instead of leaking the raw tag, while CE's `<i18n:…>` / `<l10n:…>` are translation
  lookups and `<papi:name:default>` falls back to its default value.

  The **界面尺寸** (GUI scale) selector mirrors Minecraft's own setting: a font image is drawn at
  exactly `height × 界面尺寸` device pixels, so a `height: 9` image is 9 px at 1x and 18 px at 2x,
  and a `height: 140` sheet is 140 / 280 / 420 / 560 px at 1x–4x. **自动** picks the largest factor
  that fits the preview area (1x is the native size, and it is never inflated beyond what fits); the
  status bar always reports the factor actually used.

  Crucially the canvas is allocated at the **final device resolution** and the scene is drawn through
  a scale transform, so every glyph and font image is sampled **once, from the original PNG, straight
  to its final size**. Sampling is nearest-neighbour with no mipmaps — the same `setFilter(FALSE,
  false)` that Minecraft's `RenderType.text` uses — so the result is pixel-exact rather than blurred,
  and a high-resolution source is never flattened by an intermediate downscale. (Drawing at the
  logical size first and upscaling afterwards is what used to make a 2x image look like doubled
  blocks.)

  A **自定义文字** box lets you type any text — MiniMessage and `<image:ns:id>` included — and see it
  rendered as chat, as a container title, or as an item name / lore. For a font image entry it is
  pre-filled with that image's own tag, so ticking the box immediately shows the glyph at full size.

  Next to it, the **偏移** (`<shift:N>`) control — on its own row — makes CE's pixel-offset tag easy
  to dial in: type a number, click **−10 / −1 / +1 / +10** to nudge it, or press **Alt+←/→** (∓1) and
  **Alt+Shift+←/→** (∓10) inside the text box. A nudge edits the `<shift:N>` under the caret in
  place; if there is none it inserts one at the caret, so a single click already adds the tag. The
  **插入 `<shift:N>`** button always adds a fresh tag at the caret, which is how you interleave
  several shifts between images to compose a custom GUI. Values are clamped to ±256, the range CE's
  generated `offset-characters` covers.

  Font images are drawn at the size the game gives them: `height` (aliases `scale` / `scale_ratio`)
  is the glyph height in pixels, `ascent` (alias `y_position`) positions it above the text baseline,
  and the width follows the PNG aspect ratio — so a `height: 140` GUI sheet really renders 140 px
  tall. `grid_size` / `chars` select one cell of a sprite sheet, and `<image:ns:id:row:col>` picks a
  specific cell. 图像总览 shows the selected entry on its own at 1:1 instead of stacking every image
  in the project into one fixed-height list.

  Resources are resolved across **all** packs that define a namespace (the current pack first, then
  the other project packs, then vanilla), so a font image stored in one pack is still found when
  another pack also ships `assets/minecraft`, and the vanilla font stays authoritative for
  `minecraft:default` instead of being shadowed by a project pack. Ascent is not reserved for:
  exactly like in-game, a font image taller than its line is clipped by whatever sits above it.

  Known limitation: block entities (chests, shulker boxes, banners, heads) are drawn by a special
  model renderer in vanilla and have no `elements` in their model JSON, so they fall back to a flat
  texture instead of an isometric cube.
- **Config inspections** — like an IDE: unknown keys, wrong types, illegal enums, out-of-range
  image cells, invalid `auto_state` groups, mismatched recipe patterns, dangling `<global:>` /
  `<image:>` / vanilla-id references and more, reported as ERROR / WARN / WEAK_WARN / INFO in a
  bottom dock and as gutter markers in the source editor.

  `ce-cekeys.js` is generated from the CraftEngine source (`ConfigKeys.of(...)`, `Key.ce(...)`
  registrations and literal section reads). It lists every key name, alias group and type id that
  CE actually accepts — the checker consults it first, so a key CE reads is never reported as
  unknown, and `type` values are validated against CE's real type registry. Regenerate it after
  updating the CE checkout with: `node scripts/gen-cekeys.js`

  Two things are deliberately kept quiet: premium-only fields (`client_bound_data`,
  `client_bound_material`, `visual_result`, …) stop being reported once **Hide premium feature
  hints** is enabled in Settings, and the `internal` / `craftengine` namespaces are not reported as
  "not present in any scanned resource pack" when the file lives under `resources/internal/` or any
  `internal_*` folder — that is where CraftEngine writes its own generated pack.
- **Checks → Debug** — the **检查 / Checks** menu in the top bar opens a separate window listing
  every configuration problem in the whole project (not just the open file). It walks the project
  for `*.yml` / `*.yaml`, runs the full CraftEngine check on CE files and the YAML syntax check on
  everything else, then groups the findings by file. Severity chips (ERROR / WARN / WEAK / INFO)
  toggle each level, the search box filters on message, file, entry, key and rule id, groups
  collapse, and clicking a row opens that file in the editor and jumps to the line.

  The window is a real Electron `BrowserWindow` (`checks.html`), not an overlay: the main window
  scans and pushes the result over IPC, and the window pulls the latest payload when it opens, so a
  window opened mid-scan still ends up with the finished list.

### Development scripts

| script | what it does |
|---|---|
| `node _ce_tools_test.js` (also `_ce_preview_test.js`, `_ce_font_test.js`, `_ce_formtest.js`) | headless regression tests for the tooling, preview renderer, MC font metrics and entry forms. `_ce_font_test.js` also builds a two-pack fixture project (both packs define `assets/minecraft`) and asserts multi-root resource resolution, `height`-driven font image sizing and per-cell sprite selection |
| `node_modules\.bin\electron.cmd _ce_checks_test.js` | end-to-end test of the Checks window: builds a small fixture project, opens it through the real project loader, triggers 检查 → Debug and asserts the separate window renders the rows, the severity filter, the search box and the grouping |
| `node _ce_glyph_probe.js [yml]` | drives the preview against a **real** CraftEngine checkout (`E:\craft-engine`) and prints, per `images:` entry, the resolved PNG, its size, and the parsed `<image:…>` geometry next to the expected values — the fastest way to check font image sizing |
| `node scripts\gen-cekeys.js` | regenerates `ce-cekeys.js` from the CraftEngine checkout |
| `node scripts\audit-ce-diagnostics.js` | replays every YAML block of the CraftEngine wiki through the checker and prints the remaining findings (used to drive false positives to zero) |
| `node scripts\render-ce-preview-shots.js` | renders one shot per scene through real Chromium into `_ce_shots\01-lore-item.png` … `06-image-gallery.png` and prints per-image pixel statistics (missing-texture magenta, applied colours, shadow pixels) |
| `node_modules\.bin\electron.cmd scripts\render-ce-glyph-shots.js` | measures font image rendering on a transparent canvas (drawn size, top offset vs the baseline, advance) and dumps the 箱子 GUI / 聊天 / 图像总览 scenes to `_ce_shots\glyph-*.png` |
| `node_modules\.bin\electron.cmd _ce_gui_scale_pixel_test.js` | proves a font image is sampled once from source to final size: `height: 9` over an 18 px-wide source renders 9 px at 1x and **18 distinct 1px columns at 2x** (the old downscale-then-upscale path produced 9 columns of 2px blocks) |
| `node_modules\.bin\electron.cmd _ce_guiscale_test.js` | asserts a font image's rendered pixel size equals its configured `height` × 界面尺寸 (182×140 at 1x … 728×560 at 4x) and that 自动 picks a factor in range |
| `node _ce_srcsize_probe.js [root]` | surveys a CraftEngine pack: how many `images:` entries have a source PNG larger than `height` (the ones an intermediate downscale would have degraded) |
| `node_modules\.bin\electron.cmd _ce_furniture_item_test.js` | builds a fixture pack and asserts an item with `behavior.type: furniture_item` is treated as furniture: the `furniture: <id>` reference resolves against the scanned `furniture:` section, an inline definition works, a dangling reference is flagged, and an element referencing a pack item renders that item's declared texture (counted in pixels) |
| `node_modules\.bin\electron.cmd _ce_furniture_test.js` | furniture preview: parses variants/elements/hitboxes, renders the isometric scene at the configured 界面尺寸, and asserts the hitbox wireframes (blue interaction, orange shulker), seat dots, the purple external-model placeholder and the no-variants message all actually appear — plus the improvements: the block element lands exactly on the `[0,16]³` origin box (centred anchor), 45° view rotation changes the picture and the projected hitboxes, the display toggles hide wireframes/seats independently, zoom enlarges the canvas, a 6-block-tall furniture grows it, element `rotation`/`yaw`/`pitch`/quaternion render without warnings, a flat item is a vertical card that turns with the view (edge-on at 45° it disappears, at 90° you see the mirrored back) and with the element's own `yaw`, shulker `direction`+`peek`, happy_ghast 4×4×4 and the Euler/quaternion rotation conventions |
| `node_modules\.bin\electron.cmd _ce_furniture_panel_test.js` | drives the real panel's furniture view row: the controls appear only in the furniture scene, ⟲/⟳ and `Q`/`E`/`R` change `yaw` and re-render, dragging the canvas rotates freely (Shift snaps to 15°, and the click that ends a drag does not select a hitbox), the zoom buttons update the canvas and the percentage, the hitbox checkbox clears the wireframes while the elements keep rendering, clicking a hitbox in the canvas selects it, and the status bar shows the colour legend plus the selected box's type/size |
| `node_modules\.bin\electron.cmd _ce_real_furniture_test.js` | renders every variant of the **real** CraftEngine default pack(s) it can find on this machine (`wooden_chair`, `bench`, `flower_basket` ground/wall/ceiling, `table_lamp`; the `E:\Downloads` copy and the installed plugin copies are all scanned) and asserts there are no warnings, no blank scenes, a pick polygon per hitbox, and — comparing the ink centroid of the model against the centroid of the hitbox projections — that the model and its hitboxes are **not misaligned** (skips itself when no CE pack is installed) |
| `node_modules\.bin\electron.cmd _ce_furn_check.js "<path to a furniture yml>"` | diagnostic for one config file: prints every variant's element anchors and model bounds (in 1/16 units), each hitbox's size/y-range in blocks, the resolved seat world positions, plus an ASCII rendering of the scene — the quickest way to check why a piece of furniture looks off |
| `node_modules\.bin\electron.cmd _ce_tags_test.js` | tag-namespace tests: every decoration alias (`<i> <b> <u> <st> <obf> <em>`) actually applies, `<i>x<!i>y` / `</i>` / `<!/i>` all clear the style, turning the MiniMessage or CE switch off leaves that namespace's tags as literal text while the other still works, and `<click>`/`<hover>`/`<key>`/`<lang>`/`<score>`/`<nbt>`/`<selector>` no longer leak as raw text |
| `node_modules\.bin\electron.cmd _ce_shift_layout_test.js` | asserts the 偏移 row breaks onto its own full-width line and that its controls stay on one line in the order −10 / −1 / value / +1 / +10 / insert |
| `node_modules\.bin\electron.cmd _ce_shift_test.js` | drives the 偏移 control in the real panel: the four ±1/±10 buttons insert `<shift:N>` at the caret, a second nudge edits that same tag in place, the number box and the ±256 clamp work, and the render actually changes |
| `node_modules\.bin\electron.cmd _ce_panel_ui_test.js` | drives the real preview panel: asserts the 界面尺寸 options, that each factor resizes the canvas, and that 自定义文字 (including a `<image:…>` tag) actually changes the render |
| `node_modules\.bin\electron.cmd _ce_window_resize_test.js` | window system: every window gets a bottom-right resize grip and a **⛶** maximize/restore button, dragging the grip resizes it (clamped to the viewport and the window's minimum), `resizable: false` / `maximizable: false` opt out, and the preview panel's window — once enlarged or maximized — re-renders its canvas at a larger automatic 界面尺寸 and keeps the chosen size when reopened. It also guards the "can't close the app/window" cases: after 12 000 window clicks the window z-index stays under the app title bar (and `elementFromPoint` on the app's ✕ still hits it), a maximized window starts below the title/menu bar so its own ✕ stays clickable, and shrinking the app window pulls open windows back into the viewport |
| `node scripts\render-ce-scene-matrix.js` | renders the content→scene matrix — item `demo:topaz_sword`, blocks `stone_bricks` / `oak_stairs` / `chest`, and the font image `demo:star` in the 箱子 GUI and 聊天 scenes — into `_ce_shots\scene-*.png` |

Visual regression scripts need Electron (they load the editor's own renderer code):

```
node_modules\.bin\electron.cmd scripts\render-ce-scene-matrix.js
```

The matrix script is the guard for the content-aware scene mapping: a glyph entry must show up as a
glyph inside the container GUI title and the chat lines, an item/block entry must show up as an icon
in the hotbar slot, and a regression in either direction is visible in the output images.


<p align="center">
  <a href="https://github.com/zzzyyylllty/ChoTenEditor/commits/main/">
    <img src="https://img.shields.io/github/last-commit/zzzyyylllty/ChoTenEditor?logo=artstation&style=for-the-badge"/>
  </a>
  <a href="https://github.com/zzzyyylllty/ChoTenEditor/issues">
    <img src="https://img.shields.io/github/issues/zzzyyylllty/ChoTenEditor?style=for-the-badge&logo=slashdot"/>
  </a>
  <a href="https://github.com/zzzyyylllty/ChoTenEditor/releases">
    <img src="https://img.shields.io/github/release/zzzyyylllty/ChoTenEditor?style=for-the-badge&color=CC66FF&logo=ionic"/>
  </a>
</p>
<p align="center">
  <a href="https://qun.qq.com/universal-share/share?ac=1&authKey=EJ%2FBIgYus1kDxqSE5WHvAMyC7EaBqcpEFN7fBGtNFRGe6ZzjX9uECORltHB1q6Um&busi_data=eyJncm91cENvZGUiOiI4NTg4Mjc1MjMiLCJ0b2tlbiI6ImpYYlV6WEJnYXJadTNUd3pnOWU1c3ZsSFh1Z3h2UjFuc3JOb3d5VVhtRWs5bm9BKzZoZzhxckNsenhydmQyQ2oiLCJ1aW4iOiIzODI0NjM2MTk0In0%3D&data=PCCbZvFVCR3De_3tA0iMGgfjVc1xN4-yJslk2O-X4rYSvNkYvAFJymCjz9Sq6cNA1PLe_zJYmCHRRRK0FwNuHw&svctype=4&tempid=h5_group_info">
    <img src="https://img.shields.io/badge/QQ_Group-858827523-blue?style=for-the-badge"/>
  </a>
  <a href="https://discord.com/invite/VHs958jJXj">
    <img src="https://img.shields.io/discord/1272636652447338561?style=for-the-badge&label=DISCORD&color=%23ff66cc"/>
  </a>
  <a href="https://afdian.com/a/liminalskyline">
    <img src="https://img.shields.io/badge/Donate-AFDIAN-dd66ff?style=for-the-badge"/>
  </a>

</p>

# Disclaimer

## Built with AI

Since I'm not very proficient in JS and similar languages, most of this project was developed with the assistance of AI, along with some basic testing.

## Compatibility

Currently compatible with Windows. Thanks to the cross-platform Electron architecture, a web-based editor, macOS, Linux, and other platforms will become available soon.
