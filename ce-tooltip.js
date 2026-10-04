/*
 * ce-tooltip.js —— 原版物品提示框（ItemStack tooltip）组件化构建
 *
 * 依据（原版反编译源码, E:\MC-Source-Client\1.21.4\sources）：
 *   net/minecraft/world/item/ItemStack.java:810-948       getTooltipLines / addAttributeTooltips / addModifierTooltip
 *   net/minecraft/world/item/ItemLore.java:22-51          LORE_STYLE = DARK_PURPLE + ITALIC
 *   net/minecraft/world/item/ItemEnchantments.java:76-98  附魔行（TOOLTIP_ORDER 优先）
 *   net/minecraft/world/item/enchantment/Enchantment.java:161-174  getFullname（诅咒 RED, 否则 GRAY）
 *   net/minecraft/world/item/Unbreakable.java:17-29       item.unbreakable (BLUE)
 *   net/minecraft/world/item/DyedItemColor.java:92-99     item.dyed (GRAY+ITALIC) / item.color (GRAY, 高级)
 *   net/minecraft/world/item/ItemStack.java:895-948       属性修饰符行
 *   net/minecraft/client/gui/screens/inventory/tooltip/TooltipRenderUtil.java
 *   net/minecraft/client/gui/screens/inventory/tooltip/ClientTextTooltip.java  getHeight() = 10
 *   net/minecraft/client/gui/GuiGraphics.java:749-792     renderTooltipInternal 行高累加
 *
 * 设计原则：这里只做「按原版规则把 YAML 里的组件组装成带样式的行」，
 * 不认识的键一律忽略（不猜、不编），保证显示内容与游戏一致。
 */
(function (root) {
  'use strict';
  if (root.CETooltip) return;

  // ---------------- 原版颜色 (ChatFormatting) ----------------
  var C = {
    BLACK: '000000', DARK_BLUE: '0000AA', DARK_GREEN: '00AA00', DARK_AQUA: '00AAAA',
    DARK_RED: 'AA0000', DARK_PURPLE: 'AA00AA', GOLD: 'FFAA00', GRAY: 'AAAAAA',
    DARK_GRAY: '555555', BLUE: '5555FF', GREEN: '55FF55', AQUA: '55FFFF',
    RED: 'FF5555', LIGHT_PURPLE: 'FF55FF', YELLOW: 'FFFF55', WHITE: 'FFFFFF'
  };
  var RARITY_COLOR = {
    common: C.WHITE, uncommon: C.YELLOW, rare: C.AQUA, epic: C.LIGHT_PURPLE
  };

  var MAX_LORE_LINES = 256;   // ItemLore.MAX_LINES

  // 原版 TOOLTIP_ORDER (EnchantmentTags.TOOLTIP_ORDER, 1.21+):
  // 附魔行按此顺序排在前面, 剩下的按注册顺序跟在后面
  var ENCHANT_TOOLTIP_ORDER = [
    'minecraft:sharpness', 'minecraft:smite', 'minecraft:bane_of_arthropods',
    'minecraft:impaling', 'minecraft:density', 'minecraft:breach',
    'minecraft:protection', 'minecraft:fire_protection', 'minecraft:feather_falling',
    'minecraft:blast_protection', 'minecraft:projectile_protection',
    'minecraft:respiration', 'minecraft:aqua_affinity', 'minecraft:thorns',
    'minecraft:depth_strider', 'minecraft:frost_walker', 'minecraft:binding_curse',
    'minecraft:soul_speed', 'minecraft:swift_sneak',
    'minecraft:fortune', 'minecraft:looting', 'minecraft:silk_touch',
    'minecraft:luck_of_the_sea', 'minecraft:lure',
    'minecraft:efficiency', 'minecraft:quick_charge', 'minecraft:loyalty',
    'minecraft:unbreaking', 'minecraft:mending', 'minecraft:vanishing_curse',
    'minecraft:power', 'minecraft:punch', 'minecraft:flame', 'minecraft:infinity',
    'minecraft:multishot', 'minecraft:piercing', 'minecraft:channeling', 'minecraft:riptide',
    'minecraft:wind_burst'
  ];
  var CURSE_TAG = 'minecraft:curse';   // EnchantmentTags.CURSE

  // 原版 EquipmentSlotGroup 序列化名 → lang 键后缀 (item.modifiers.<name>)
  var SLOT_GROUP_ORDER = ['any', 'mainhand', 'offhand', 'hand', 'feet', 'legs', 'chest', 'head',
    'armor', 'body', 'saddle'];
  // 属性默认值表用不到: 属性行的数值一律取配置里的 amount (不推断玩家状态)

  // ---------------- 语言查找 ----------------
  var _langOverride = null;   // 由外部 setLang() 注入的查表函数
  function setLang(fn) { _langOverride = typeof fn === 'function' ? fn : null; }

  function t(key, fallback) {
    if (!key) return fallback != null ? fallback : '';
    var v = null;
    if (_langOverride) { try { v = _langOverride(key); } catch (e) { v = null; } }
    if (v == null && root.CEMCAssets && root.CEMCAssets.langObject) {
      var o = root.CEMCAssets.langObject(null) || null;
      if (o && o[key] != null) v = o[key];
    }
    if (v == null) return fallback != null ? fallback : key;
    return String(v);
  }
  function hasKey(key) {
    if (!key) return false;
    if (_langOverride) { try { if (_langOverride(key) != null) return true; } catch (e) {} }
    if (root.CEMCAssets && root.CEMCAssets.langObject) {
      var o = root.CEMCAssets.langObject(null);
      if (o && o[key] != null) return true;
    }
    return false;
  }

  // ---------------- 小工具 ----------------
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function asList(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
  function str(v) { return v == null ? '' : String(v); }

  // 数字格式化: 原版 ATTRIBUTE_MODIFIER_FORMAT = DecimalFormat("#.##")
  function fmtNum(n) {
    if (typeof n !== 'number' || !isFinite(n)) return str(n);
    var r = Math.round(n * 100) / 100;
    if (Number.isInteger(r)) return String(r);
    return String(r);
  }

  // 资源位置 "ns:path" → {ns, path}; 无命名空间默认 minecraft
  function resloc(id, defaultNs) {
    var s = str(id).trim();
    if (!s) return null;
    var i = s.indexOf(':');
    if (i < 0) return { ns: defaultNs || 'minecraft', path: s };
    return { ns: s.slice(0, i) || (defaultNs || 'minecraft'), path: s.slice(i + 1) };
  }

  // ---------------- 行构建 ----------------
  // 一行 = { text, color, italic, bold, underlined, strikethrough, translate? }
  // translate: 该行文本本身是「翻译键拼接」的结果, 调试时可看到来源
  function line(text, color, extra) {
    var o = { text: str(text), color: color || null };
    if (extra) {
      if (extra.italic != null) o.italic = !!extra.italic;
      if (extra.bold != null) o.bold = !!extra.bold;
      if (extra.underlined != null) o.underlined = !!extra.underlined;
      if (extra.strikethrough != null) o.strikethrough = !!extra.strikethrough;
      if (extra.raw) o.raw = true;          // 已经是 MiniMessage 原文, 不再套颜色
    }
    return o;
  }

  /**
   * 从物品数据里取组件值。CE 的 `data:` 块直接对应原版数据组件,
   * 所以先看 data.*, 再看根上的同名键 (CE 允许部分键写在根上)。
   */
  function getComp(data, key, alias) {
    if (!isObj(data)) return undefined;
    if (data[key] !== undefined) return data[key];
    if (alias && data[alias] !== undefined) return data[alias];
    var d = data.data;
    if (isObj(d)) {
      if (d[key] !== undefined) return d[key];
      if (alias && d[alias] !== undefined) return d[alias];
    }
    // settings.* 是插件侧设置, 个别键(如 equip/attribute)也可能影响显示
    var s = data.settings;
    if (isObj(s)) {
      if (s[key] !== undefined) return s[key];
      if (alias && s[alias] !== undefined) return s[alias];
    }
    return undefined;
  }

  /** 组件是否显式设置了 tooltip_display 隐藏（hide_tooltip 列表） */
  function hiddenComponents(data) {
    var out = {};
    var v = getComp(data, 'tooltip_display', 'hide_tooltip');
    if (v === true) { out.__all = true; return out; }
    if (isObj(v)) v = v.hidden_components || v.hide || v;
    asList(v).forEach(function (h) {
      var s = str(isObj(h) ? (h.type || h.id || h.name) : h).trim();
      if (!s) return;
      var r = resloc(s, 'minecraft');
      out[r.ns + ':' + r.path] = true;
      out[r.path] = true;     // 允许写短名 (enchantments 而不是 minecraft:enchantments)
    });
    return out;
  }
  function isHidden(hid, id) {
    if (hid.__all) return true;
    return !!(hid[id] || hid[resloc(id, 'minecraft').path]);
  }

  /**
   * 构建原版顺序的提示框行。
   * @param {object} ctx {name, lore, data, itemId, count, advanced, rarity}
   * @returns {{lines: Array, rarity: string, hasContent: boolean}}
   */
  function buildLines(ctx) {
    var c = ctx || {};
    var data = isObj(c.data) ? c.data : {};
    var lines = [];
    var rarity = normRarity(c.rarity || getComp(data, 'rarity'));
    var hid = hiddenComponents(data);
    var itemId = c.itemId || data.id || null;

    // ---- 1. 名称行 (ItemStack.getStyledHoverName, :794-800) ----
    //   Component.empty().append(getHoverName()).withStyle(rarity.color())
    //   if (has(CUSTOM_NAME)) withStyle(ITALIC)
    // 其中 getHoverName() = CUSTOM_NAME ?? getItemName()。
    // withStyle 作用在 empty 父组件上会向下合并, 因此:
    //   - 自定义名/物品名自带的颜色优先, 无颜色时才落到稀有度色;
    //   - custom_name 时整行斜体。
    var customName = getComp(data, 'custom_name');
    var hasCustomName = customName != null;
    var nameColor = RARITY_COLOR[rarity] || RARITY_COLOR.common;
    var nameText;
    if (hasCustomName) {
      nameText = componentToMini(customName);
    } else if (c.name != null && String(c.name) !== '') {
      // 调用方已经解析好的名字（可能是 MiniMessage 原文），原样保留
      nameText = String(c.name);
    } else {
      nameText = itemDisplayName(itemId, data);
    }
    var nameRaw = /[<§&]/.test(String(nameText));
    lines.push(line(nameText, nameRaw ? null : nameColor, {
      italic: hasCustomName,
      raw: nameRaw
    }));

    // ---- 2. HIDE_ADDITIONAL_TOOLTIP 之后的所有内容都跳过 ----
    if (hid.__all) return { lines: lines, rarity: rarity, hasContent: false };

    // ---- 3. 原版 appendHoverText (由物品自身添加, 这里无法推断 —— 不编) ----

    // ---- 4. addToTooltip 固定顺序 ----
    // 4.1 存储的附魔 (附魔书/附魔物品) —— 仅在 data 明确给出时显示
    pushStoredEnchantments(lines, getComp(data, 'stored_enchantments'), itemId, t);
    // 4.2 盔甲纹饰 trim
    pushTrim(lines, getComp(data, 'trim'), t);
    // 4.3 附魔
    if (!isHidden(hid, 'minecraft:enchantments')) {
      pushEnchantments(lines, getComp(data, 'enchantment', 'enchantments'), t);
    }
    // 4.4 染色
    if (!isHidden(hid, 'minecraft:dyed_color')) {
      pushDyedColor(lines, getComp(data, 'dyed_color'), c.advanced, t);
    }
    // 4.5 Lore (DARK_PURPLE + ITALIC)
    if (!isHidden(hid, 'minecraft:lore')) {
      pushLore(lines, c.lore != null ? c.lore : getComp(data, 'lore'));
    }
    // 4.6 属性修饰符
    if (!isHidden(hid, 'minecraft:attribute_modifiers')) {
      pushAttributeModifiers(lines, getComp(data, 'attribute_modifiers', 'attributes'), t);
    }
    // 4.7 无法破坏
    if (!isHidden(hid, 'minecraft:unbreakable')) {
      var unb = getComp(data, 'unbreakable');
      if (unb === true || (isObj(unb) && unb.show_in_tooltip !== false)) {
        lines.push(line(t('item.unbreakable', 'Unbreakable'), C.BLUE));
      }
    }
    // 4.8 不祥之瓶等级
    pushOminousBottle(lines, getComp(data, 'ominous_bottle_amplifier'), t);
    // 4.9 迷之炖菜效果 (仅在创造模式显示 —— 见函数内注释)
    pushSuspiciousStew(lines, getComp(data, 'suspicious_stew_effects'), c);

    // ---- 5. CAN_BREAK / CAN_PLACE_ON (冒险模式才显示) ----
    // 预览不假设玩家处于冒险模式, 仅在配置显式给出 can_break/can_place_on 时列出
    pushCanBreakPlace(lines, data, t);

    // ---- 6. 高级提示 (F3+H) ----
    if (c.advanced) {
      pushAdvanced(lines, data, itemId, c, t);
    }

    // hasContent: 除名称行外是否还有内容 (调用方用来判断「只有名字」的极简提示框)
    return { lines: lines, rarity: rarity, hasContent: lines.length > 1 };
  }

  function normRarity(r) {
    var s = str(r).toLowerCase().trim();
    if (isObj(r)) s = str(r.value || r.name || '').toLowerCase();
    if (s.indexOf(':') >= 0) s = s.slice(s.indexOf(':') + 1);
    return RARITY_COLOR[s] ? s : 'common';
  }

  function itemDisplayName(itemId, data) {
    if (!itemId) return '';
    var r = resloc(itemId, 'minecraft');
    var key = (r.ns === 'minecraft' ? 'item.minecraft.' : 'item.' + r.ns + '.') + r.path;
    if (hasKey(key)) return t(key);
    var bkey = (r.ns === 'minecraft' ? 'block.minecraft.' : 'block.' + r.ns + '.') + r.path;
    if (hasKey(bkey)) return t(bkey);
    return r.ns === 'minecraft' ? r.path : r.ns + ':' + r.path;
  }

  // ---------------- 各类组件 ----------------

  // 附魔行 (ItemEnchantments.addToTooltip + Enchantment.getFullname)
  function pushEnchantments(lines, v, tr) {
    var map = null;
    if (isObj(v)) map = isObj(v.enchantments) ? v.enchantments : v;
    else if (Array.isArray(v)) {
      map = {};
      v.forEach(function (e) { if (isObj(e) && e.id) map[e.id] = e.level != null ? e.level : 1; });
    }
    if (!isObj(map)) return;
    var keys = Object.keys(map);
    if (!keys.length) return;
    var norm = {};
    keys.forEach(function (k) { norm[normalizeId(k)] = map[k]; });
    var emitted = {};
    // TOOLTIP_ORDER 优先
    ENCHANT_TOOLTIP_ORDER.forEach(function (id) {
      if (norm[id] == null) return;
      emitted[id] = 1;
      pushOneEnchant(lines, id, norm[id], tr);
    });
    // 其余按配置里的出现顺序
    keys.forEach(function (k) {
      var id = normalizeId(k);
      if (emitted[id]) return;
      emitted[id] = 1;
      pushOneEnchant(lines, id, norm[id], tr);
    });
  }

  function pushOneEnchant(lines, id, level, tr) {
    var lv = typeof level === 'number' ? level : parseInt(level, 10);
    if (!isFinite(lv)) lv = 1;
    if (lv <= 0) return;
    var r = resloc(id, 'minecraft');
    var descId = 'enchantment.' + (r.ns === 'minecraft' ? 'minecraft.' : r.ns + '.') + r.path;
    var name = t(descId, r.ns === 'minecraft' ? r.path : r.ns + ':' + r.path);
    // Enchantment.getFullname: 用 ComponentUtils.mergeStyles(description, GRAY|RED) —— 
    // 注意是 mergeStyles(合并) 而非 withStyle(覆盖), 所以 lang 值里自带的 §/MiniMessage
    // 颜色会被保留, 只在没有颜色时落到 GRAY/RED。这里同样只在文本本身没带颜色时才套色。
    var color = isCurse(id) ? C.RED : C.GRAY;
    var text = name;
    // 除非 (level == 1 && maxLevel == 1), 否则追加 " " + translatable("enchantment.level." + level)
    var maxLv = maxLevelOf(id);
    if (!(lv === 1 && maxLv === 1)) {
      text = name + ' ' + t('enchantment.level.' + lv, roman(lv));
    }
    var hasOwnColor = /[<§&]/.test(name);
    lines.push(line(text, hasOwnColor ? null : color, hasOwnColor ? { raw: true } : null));
  }

  function normalizeId(k) {
    var s = str(k).trim();
    if (!s) return s;
    var r = resloc(s, 'minecraft');
    return r.ns + ':' + r.path;
  }
  // 原版 EnchantmentTags.CURSE: binding_curse / vanishing_curse
  function isCurse(id) {
    var n = normalizeId(id);
    return n === 'minecraft:binding_curse' || n === 'minecraft:vanishing_curse';
  }
  // 原版最大等级表 (Enchantments.java 定义, 只用于「1 级是否省略数字」的判断)
  var MAX_LEVEL = {
    'minecraft:protection': 4, 'minecraft:fire_protection': 4, 'minecraft:feather_falling': 4,
    'minecraft:blast_protection': 4, 'minecraft:projectile_protection': 4, 'minecraft:respiration': 3,
    'minecraft:aqua_affinity': 1, 'minecraft:thorns': 3, 'minecraft:depth_strider': 3,
    'minecraft:frost_walker': 2, 'minecraft:binding_curse': 1, 'minecraft:soul_speed': 3,
    'minecraft:swift_sneak': 3, 'minecraft:sharpness': 5, 'minecraft:smite': 5,
    'minecraft:bane_of_arthropods': 5, 'minecraft:knockback': 2, 'minecraft:fire_aspect': 2,
    'minecraft:looting': 3, 'minecraft:sweeping_edge': 3, 'minecraft:efficiency': 5,
    'minecraft:silk_touch': 1, 'minecraft:unbreaking': 3, 'minecraft:fortune': 3,
    'minecraft:power': 5, 'minecraft:punch': 2, 'minecraft:flame': 1, 'minecraft:infinity': 1,
    'minecraft:luck_of_the_sea': 3, 'minecraft:lure': 3, 'minecraft:loyalty': 3,
    'minecraft:impaling': 5, 'minecraft:riptide': 3, 'minecraft:channeling': 1,
    'minecraft:multishot': 1, 'minecraft:quick_charge': 3, 'minecraft:piercing': 4,
    'minecraft:mending': 1, 'minecraft:vanishing_curse': 1, 'minecraft:density': 5,
    'minecraft:breach': 4, 'minecraft:wind_burst': 3
  };
  function maxLevelOf(id) {
    var n = normalizeId(id);
    return MAX_LEVEL[n] != null ? MAX_LEVEL[n] : 1;
  }
  // 语言文件缺失时的罗马数字兜底 (原版由 lang 提供 enchantment.level.N)
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function roman(n) { return ROMAN[n] || String(n); }

  // 存储附魔 (附魔书): 原版同样走 ENCHANTMENTS 那套样式
  function pushStoredEnchantments(lines, v, itemId, tr) {
    if (v == null) return;
    pushEnchantments(lines, v, tr);
  }

  // 盔甲纹饰 (ArmorTrim.addToTooltip, 1.21.4) —— 三行:
  //   "item.smithing_template.upgrade"  (GRAY)
  //   " " + TrimPattern.description.copyWithStyle(material.description.style())
  //   " " + TrimMaterial.description
  // pattern 描述键 = trim_pattern.<ns>.<path>, material 描述键 = trim_material.<ns>.<path>。
  // 材质自带 Style 颜色, 由 TrimMaterials.bootstrap() 硬编码 (见下表, 与源码一一对应);
  // pattern 行继承材质的颜色。自定义材质不在表内时退回 GRAY (不编颜色)。
  var TRIM_MATERIAL_COLOR = {
    quartz: 14931140, iron: 15527148, netherite: 6445145, redstone: 9901575,
    copper: 11823181, gold: 14594349, emerald: 1155126, diamond: 7269586,
    lapis: 4288151, amethyst: 10116294, resin: 16545810
  };
  function intToHex(v) {
    return ('000000' + (v & 0xFFFFFF).toString(16).toUpperCase()).slice(-6);
  }
  function pushTrim(lines, v, tr) {
    if (!isObj(v)) return;
    var pat = v.pattern || v.trim_pattern;
    var mat = v.material || v.trim_material;
    if (!pat && !mat) return;
    lines.push(line(t('item.minecraft.smithing_template.upgrade', 'Upgrades:'), C.GRAY));
    // 原版顺序: UPGRADE_TITLE → pattern → material
    var matColor = C.GRAY;
    if (mat) {
      var mr = resloc(mat, 'minecraft');
      if (mr.ns === 'minecraft' && TRIM_MATERIAL_COLOR[mr.path] != null) matColor = intToHex(TRIM_MATERIAL_COLOR[mr.path]);
    }
    if (pat) {
      var pr = resloc(pat, 'minecraft');
      lines.push(line(' ' + t('trim_pattern.' + pr.ns + '.' + pr.path, pr.path), matColor));
    }
    if (mat) {
      var mr2 = resloc(mat, 'minecraft');
      lines.push(line(' ' + t('trim_material.' + mr2.ns + '.' + mr2.path, mr2.path), matColor));
    }
  }

  // 染色 (DyedItemColor.addToTooltip)
  function pushDyedColor(lines, v, advanced, tr) {
    if (v == null) return;
    var rgb = null;
    if (typeof v === 'number') rgb = v;
    else if (isObj(v)) rgb = v.rgb != null ? v.rgb : v.color;
    else if (typeof v === 'string') {
      var parts = v.split(',');
      if (parts.length >= 3) {
        rgb = ((parseInt(parts[0], 10) & 255) << 16) | ((parseInt(parts[1], 10) & 255) << 8) | (parseInt(parts[2], 10) & 255);
      }
    }
    if (rgb == null || typeof rgb !== 'number' || !isFinite(rgb)) return;
    if (advanced) {
      var hex = '#' + ('000000' + (rgb & 0xFFFFFF).toString(16).toUpperCase()).slice(-6);
      lines.push(line(fmt('item.color', 'Color: %s', [hex]), C.GRAY));
    } else {
      lines.push(line(t('item.dyed', 'Dyed'), C.GRAY, { italic: true }));
    }
  }

  // Lore: ItemLore.LORE_STYLE = DARK_PURPLE + ITALIC; 上限 256 行
  function pushLore(lines, v) {
    var arr = [];
    if (Array.isArray(v)) arr = v;
    else if (typeof v === 'string') arr = v.split(/\r?\n/);
    else if (isObj(v) && Array.isArray(v.lines)) arr = v.lines;
    else if (v != null && typeof v === 'object') return;
    if (!arr.length) return;
    if (arr.length > MAX_LORE_LINES) arr = arr.slice(0, MAX_LORE_LINES);
    arr.forEach(function (l) {
      var txt;
      if (typeof l === 'string') txt = l;
      else if (isObj(l)) txt = l.content != null ? l.content : (l.text != null ? l.text : '');
      else txt = str(l);
      lines.push(line(txt, C.DARK_PURPLE, { italic: true, raw: /[<§&]/.test(String(txt)) }));
    });
  }

  // 属性修饰符 (ItemStack.addAttributeTooltips / addModifierTooltip)
  function pushAttributeModifiers(lines, v, tr) {
    var list = [];
    if (Array.isArray(v)) list = v;
    else if (isObj(v) && Array.isArray(v.modifiers)) list = v.modifiers;
    else if (isObj(v)) return;
    if (!list.length) return;
    var byGroup = {};
    var order = [];
    list.forEach(function (m) {
      if (!isObj(m)) return;
      var slot = str(m.slot || m.slots || 'any').trim().toLowerCase();
      // slots 可能是列表; 原版一个 modifier 只属于一个组
      if (slot.indexOf('[') === 0 || slot.indexOf(',') >= 0) {
        slot = slot.replace(/[\[\]]/g, '').split(',')[0].trim();
      }
      if (SLOT_GROUP_ORDER.indexOf(slot) < 0) slot = 'any';
      if (!byGroup[slot]) { byGroup[slot] = []; order.push(slot); }
      byGroup[slot].push(m);
    });
    // 按原版 EquipmentSlotGroup 枚举顺序输出
    var groups = SLOT_GROUP_ORDER.filter(function (g) { return byGroup[g]; });
    if (!groups.length) return;
    groups.forEach(function (g) {
      lines.push(line(t('item.modifiers.' + g, g), C.GRAY));
      byGroup[g].forEach(function (m) { pushOneModifier(lines, m, tr); });
    });
  }

  function pushOneModifier(lines, m, tr) {
    var attr = m.type || m.attribute || m.id;
    if (!attr) return;
    var r = resloc(attr, 'minecraft');
    // 原版属性描述键: Attribute.descriptionId = "attribute.name.<path>"
    // (Attributes.java 里 RangedAttribute 的第一个参数, 与命名空间无关)
    var attrName = t('attribute.name.' + r.path, null);
    if (attrName == null || attrName === 'attribute.name.' + r.path) {
      if (hasKey('attribute.name.' + r.path)) attrName = t('attribute.name.' + r.path);
      else attrName = r.ns === 'minecraft' ? r.path : attr;
    }
    var amount = typeof m.amount === 'number' ? m.amount : parseFloat(m.amount);
    if (!isFinite(amount)) return;
    var op = str(m.operation || 'add_value').trim().toLowerCase();
    var opId = opKey(op);
    var style = attrStyle(attr, amount >= 0);
    if (op === 'add_multiplied_base' || op === 'add_multiplied_total') amount = amount * 100;
    else if (normalizeId(attr) === 'minecraft:knockback_resistance') amount = amount * 10;
    var key = amount > 0 ? ('attribute.modifier.plus.' + opId)
      : (amount < 0 ? ('attribute.modifier.take.' + opId) : ('attribute.modifier.equals.' + opId));
    // amount<0 时原版取 -v 传入 (displayValue 用绝对值)
    var val = fmtNum(Math.abs(amount));
    lines.push(line(fmt(key, EN_MOD[key], [val, attrName]), style));
  }
  // 原版英文模板 (lang 缺失时兜底)
  var EN_MOD = {
    'attribute.modifier.equals.0': '%s %s',
    'attribute.modifier.equals.1': '%s%% %s',
    'attribute.modifier.equals.2': '%s%% %s',
    'attribute.modifier.plus.0': '+%s %s',
    'attribute.modifier.plus.1': '+%s%% %s',
    'attribute.modifier.plus.2': '+%s%% %s',
    'attribute.modifier.take.0': '-%s %s',
    'attribute.modifier.take.1': '-%s%% %s',
    'attribute.modifier.take.2': '-%s%% %s'
  };

  // AttributeModifier.Operation.id (AttributeModifier.java:67-69):
  //   ADD_VALUE("add_value", 0), ADD_MULTIPLIED_BASE("add_multiplied_base", 1), ADD_MULTIPLIED_TOTAL("add_multiplied_total", 2)
  function opKey(op) {
    switch (op) {
      case 'add_multiplied_base': case 'multiply_base': return '1';
      case 'add_multiplied_total': case 'multiply_total': return '2';
      default: return '0';   // add_value
    }
  }
  // 属性颜色: Attribute.Sentiment.getStyle(boolean isPositive)
  //   POSITIVE -> 正数 BLUE / 负数 RED
  //   NEUTRAL  -> GRAY
  //   NEGATIVE -> 正数 RED  / 负数 BLUE
  // 全表默认 POSITIVE; 只有下面 4 个属性显式设过 sentiment (Attributes.java:28/38/45/76)。
  var ATTR_NEUTRAL = {
    'minecraft:gravity': 1, 'minecraft:scale': 1
  };
  var ATTR_NEGATIVE_SENTIMENT = {
    'minecraft:burning_time': 1, 'minecraft:fall_damage_multiplier': 1
  };
  function attrStyle(attr, positive) {
    var n = normalizeId(attr);
    if (ATTR_NEUTRAL[n]) return C.GRAY;
    if (ATTR_NEGATIVE_SENTIMENT[n]) return positive ? C.RED : C.BLUE;
    return positive ? C.BLUE : C.RED;
  }

  // 语言模板参数替换。
  // 原版 TranslatableContents 的 "with" 参数在 lang 文件里写作 %s / %1$s (Java String.format 语义),
  // 命中 %s 时按顺序吃参数; 命中的 %N$s 取第 N 个参数;
  // 模板里的 %% 是转义后的百分号 (attribute.modifier.plus.1 = "+%s%% %s"), 最后还原成单个 %。
  function applyArgs(template, args) {
    var s = str(template);
    var idx = 0;
    // 先处理带序号的 %N$s
    s = s.replace(/%(\d+)\$s/g, function (m, n) {
      var i = parseInt(n, 10) - 1;
      return i >= 0 && i < args.length ? args[i] : '';
    });
    // 再按顺序吃掉剩余的 %s
    s = s.replace(/%s/g, function () {
      return idx < args.length ? args[idx++] : '';
    });
    s = s.replace(/\{(\d+)\}/g, function (m, n) {
      var i = parseInt(n, 10);
      return i >= 0 && i < args.length ? args[i] : '';
    });
    // %% -> % (必须在 %s 替换之后, 否则会把 %%s 误当成参数占位)
    s = s.replace(/%%/g, '%');
    return s;
  }
  // 取语言的格式模板, 语言里没有时退回原版英文模板
  function fmt(key, enTemplate, args) {
    var tpl = t(key, null);
    if (tpl == null || tpl === key) tpl = enTemplate;
    return applyArgs(tpl, args);
  }

  // 不祥之瓶 (OminousBottleAmplifier.addToTooltip): 走 PotionContents.addPotionTooltip,
  // 即「不祥之兆 (时长)」格式 —— 与药水效果行同一套 lang 模板。
  // value 直接作为 amplifier (0..4), 时长固定 120000 tick。
  function pushOminousBottle(lines, v, tr) {
    if (v == null) return;
    var amp = typeof v === 'number' ? v : parseInt(v, 10);
    if (!isFinite(amp)) return;
    // 效果实例: BAD_OMEN, 时长 120000 tick, amplifier = value (0..4)
    lines.push(line(potionEffectLine('minecraft:bad_omen', amp, 120000), effectColor('minecraft:bad_omen')));
  }

  // PotionContents.addPotionTooltip 的单行输出 (没有 createModifiers 的属性行):
  //   eff = translatable(effect.getDescriptionId())          // effect.<ns>.<path> (Util.makeDescriptionId("effect", key))
  //   if (amplifier > 0)    eff = translatable("potion.withAmplifier", eff, translatable("potion.potency." + amplifier))
  //   if (!endsWithin(20))  eff = translatable("potion.withDuration", eff, formatDuration(instance, durationScale, tickRate))
  //   颜色 = category.getTooltipFormatting()  (BENEFICIAL→BLUE, HARMFUL→RED, NEUTRAL→BLUE)
  //   amplify==0 → 不加等级; 时长 <= 20 tick 不显示时长。
  function potionEffectLine(effectId, amplifier, durationTicks, durationScale, tickRate) {
    var r = resloc(effectId, 'minecraft');
    var nm = t('effect.' + (r.ns === 'minecraft' ? 'minecraft.' : r.ns + '.') + r.path, r.path);
    var s = nm;
    if (amplifier > 0) s = fmt('potion.withAmplifier', '%s %s', [s, t('potion.potency.' + amplifier, roman(amplifier + 1))]);
    if (durationTicks > 20) {
      var scale = durationScale == null ? 1 : durationScale;
      var rate = tickRate == null ? 20 : tickRate;
      s = fmt('potion.withDuration', '%s (%s)', [s, formatDuration(durationTicks, scale, rate)]);
    }
    return s;
  }
  // StringUtil.formatTickDuration(tick, tickRate): tick→秒, 输出 MM:SS, 超过一小时输出 HH:MM:SS
  function formatDuration(ticks, durationScale, tickRate) {
    var n = Math.floor(ticks * (durationScale == null ? 1 : durationScale) / (tickRate || 20));
    var sec = n % 60;
    var min = Math.floor(n / 60) % 60;
    var hr = Math.floor(n / 3600);
    function p2(v) { return (v < 10 ? '0' : '') + v; }
    return hr > 0 ? p2(hr) + ':' + p2(min) + ':' + p2(sec) : p2(min) + ':' + p2(sec);
  }
  // MobEffectCategory.getTooltipFormatting() (MobEffectCategory.java:9-11,19):
  //   BENEFICIAL(BLUE), HARMFUL(RED), NEUTRAL(BLUE)
  // 下面是 1.21.4 MobEffects.java 里全部 HARMFUL 效果 (共 16 个, 逐行核对:
  //   slowness/mining_fatigue/instant_damage/nausea/blindness/hunger/weakness/poison/
  //   wither/levitation/unluck/darkness/wind_charged/weaving/oozing/infested);
  // 其余效果都是 BENEFICIAL 或 NEUTRAL, 一律 BLUE。
  // 未收录 (自定义命名空间) 的效果也按 BLUE 处理 —— 与原版「不猜测」一致。
  var HARMFUL_EFFECTS = {
    'minecraft:slowness': 1, 'minecraft:mining_fatigue': 1, 'minecraft:instant_damage': 1,
    'minecraft:nausea': 1, 'minecraft:blindness': 1, 'minecraft:hunger': 1,
    'minecraft:weakness': 1, 'minecraft:poison': 1, 'minecraft:wither': 1,
    'minecraft:levitation': 1, 'minecraft:unluck': 1, 'minecraft:darkness': 1,
    'minecraft:wind_charged': 1, 'minecraft:weaving': 1, 'minecraft:oozing': 1,
    'minecraft:infested': 1
  };
  function effectColor(effectId) {
    return HARMFUL_EFFECTS[normalizeId(effectId)] ? C.RED : C.BLUE;
  }

  // 迷之炖菜 (SuspiciousStewEffects.addToTooltip): 只在创造模式 (TooltipFlag.isCreative) 显示,
  // 同样走 PotionContents.addPotionTooltip。
  function pushSuspiciousStew(lines, v, tr) {
    if (v == null) return;
    // SuspiciousStewEffects.addToTooltip: if (flag.isCreative()) { ... } —— 非创造模式整块跳过
    if (!tr.creative) return;
    var arr = Array.isArray(v) ? v : (isObj(v) && Array.isArray(v.effects) ? v.effects : null);
    if (!arr) return;
    arr.forEach(function (e) {
      if (!isObj(e)) return;
      var id = e.id || e.effect || e.type;
      if (!id) return;
      var dur = e.duration != null ? e.duration : 160;   // Entry.CODEC 默认 160
      lines.push(line(potionEffectLine(id, 0, dur), effectColor(id)));
    });
  }

  // CAN_BREAK / CAN_PLACE (ItemStack 第 5 步): 仅在 showInTooltip (冒险模式) 时显示。
  // AdventureModePredicate.java:41-42 —— 键名是 camelCase:
  //   CAN_BREAK_HEADER  = translatable("item.canBreak")  .withStyle(GRAY)
  //   CAN_PLACE_HEADER  = translatable("item.canPlace")  .withStyle(GRAY)
  // ItemStack.java:842-850: 先 accept(EMPTY), 再 header, 然后每个 predicate 一行。
  function pushCanBreakPlace(lines, data, tr) {
    pushOne('can_break', 'item.canBreak', tr);
    pushOne('can_place_on', 'item.canPlace', tr);

    function pushOne(key, headerKey, t2) {
      var v = getComp(data, key);
      if (v == null) return;
      var items = [];
      if (Array.isArray(v)) items = v;
      else if (isObj(v)) {
        if (v.predicates && Array.isArray(v.predicates)) items = v.predicates;
        else if (v.items && Array.isArray(v.items)) items = v.items;
        else return;
      } else if (typeof v === 'string') items = [v];
      if (!items.length) return;
      lines.push(line('', null));
      lines.push(line(t2(headerKey, headerKey), C.GRAY));
      items.forEach(function (it) {
        var id = isObj(it) ? (it.items ? (Array.isArray(it.items) ? it.items[0] : it.items) : (it.block || it.id)) : it;
        // 单独一个 predicate: { items: <tag#或 id> } —— tag 用 '-' 前缀标记
        var nm;
        var s = str(id);
        if (s.charAt(0) === '#') nm = s;                 // 原版 tag 直接显示 #ns:path
        else if (isObj(it) && it.nbt) nm = s;            // 带 nbt 的原版只显示 id (不显示 nbt)
        else nm = itemOrBlockName(s);
        lines.push(line('· ' + nm, C.DARK_GRAY));
      });
    }
  }
  // 物品/方块名优先 item.minecraft.<path>, 退回 block.minecraft.<path>
  function itemOrBlockName(id) {
    var r = resloc(id, 'minecraft');
    var ikey = (r.ns === 'minecraft' ? 'item.minecraft.' : 'item.' + r.ns + '.') + r.path;
    if (hasKey(ikey)) return t(ikey, r.path);
    var bkey = (r.ns === 'minecraft' ? 'block.minecraft.' : 'block.' + r.ns + '.') + r.path;
    if (hasKey(bkey)) return t(bkey, r.path);
    return r.ns === 'minecraft' ? r.path : r.ns + ':' + r.path;
  }

  // 高级提示 (F3+H) —— ItemStack.java:854-864, 逐行对应:
  //   if (isDamaged())  → translatable("item.durability", maxDamage - damageValue, maxDamage)   无样式 = WHITE
  //   always            → literal(注册名)  .withStyle(DARK_GRAY)
  //   if (components.size() > 0) → translatable("item.components", size) .withStyle(DARK_GRAY)
  function pushAdvanced(lines, data, itemId, c, tr) {
    var maxDamage = getComp(data, 'max_damage');
    var damage = getComp(data, 'damage');
    var max = typeof maxDamage === 'number' ? maxDamage : parseInt(maxDamage, 10);
    var dmg = typeof damage === 'number' ? damage : parseInt(damage, 10);
    if (!isFinite(dmg)) dmg = 0;
    // 原版只在 isDamaged() (damage > 0) 时输出耐久行
    if (isFinite(max) && max > 0 && dmg > 0) {
      lines.push(line(fmt('item.durability', 'Durability: %s / %s', [String(max - dmg), String(max)]), C.WHITE));
    }
    if (itemId) lines.push(line(str(itemId), C.DARK_GRAY));
    var n = countComponents(data);
    if (n > 0) lines.push(line(fmt('item.components', '%s Components', [String(n)]), C.DARK_GRAY));
  }

  function countComponents(data) {
    var n = 0;
    if (!isObj(data)) return 0;
    n += Object.keys(data).filter(function (k) { return k !== 'lore' && k !== 'name' && k !== 'id'; }).length;
    if (isObj(data.data)) n += Object.keys(data.data).length;
    return n;
  }

  // 把 CE 的 custom_name 值转成 MiniMessage 文本 (字符串直接用; 对象取 text/content)
  function componentToMini(v) {
    if (typeof v === 'string') return v;
    if (isObj(v)) {
      if (v.text != null) return str(v.text);
      if (v.content != null) return str(v.content);
      if (v.translate != null) {
        var args = asList(v.with).map(componentToMini);
        return applyArgs(t(str(v.translate), str(v.translate)), args);
      }
    }
    return str(v);
  }

  root.CETooltip = {
    buildLines: buildLines,
    setLang: setLang,
    COLORS: C,
    RARITY_COLOR: RARITY_COLOR,
    ENCHANT_TOOLTIP_ORDER: ENCHANT_TOOLTIP_ORDER,
    MAX_LORE_LINES: MAX_LORE_LINES
  };
})(typeof window !== 'undefined' ? window : this);
