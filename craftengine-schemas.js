/* ChoTenEditor CraftEngine (CE) 配置 Schema 定义
 * 依赖: 无 (纯数据 + 小型构建助手)。在 craftengine-interpreter.js 之前加载。
 * 数据源: CraftEngine 官方 Wiki (docs/configuration + docs/reference)
 * 结构: window.CESchemas = { constants, conditions, functions, loot, sections, ... }
 * 字段类型 (由 interpreter 表单引擎消费):
 *   text / number / bool / select / textarea / miniText / lines / linesScalar / kv /
 *   listOf / mapOf / union / idRef / sound / vec3 / color / events / obj / wholeText / kvWhole
 * union 扩展项: noTypeKey(值不带 type 字段) / allowScalar(值可为标量) / negatable(生成 !type 选项)
 *   / types.{k}.widget(以其它 widget 渲染该类型体) / sharedKeys(切换类型时保留的公共键)
 */
(function () {
  'use strict';
  var ROOT = typeof window !== 'undefined' ? window : globalThis;
  var S = {};

  function l(zh, en) { return { zh: zh, en: en }; }
  function f(key, zh, en, type, extra) {
    var o = extra || {};
    o.key = key;
    o.label = l(zh, en);
    if (type) o.type = type;
    return o;
  }

  // ============ 常量 ============
  S.constants = {
    // 常用原版物品 (datalist 数据源, 不完全)
    vanillaItems: [
      'minecraft:air', 'minecraft:stone', 'minecraft:granite', 'minecraft:diorite', 'minecraft:andesite',
      'minecraft:deepslate', 'minecraft:cobblestone', 'minecraft:dirt', 'minecraft:grass_block',
      'minecraft:sand', 'minecraft:gravel', 'minecraft:oak_log', 'minecraft:spruce_log',
      'minecraft:birch_log', 'minecraft:jungle_log', 'minecraft:acacia_log', 'minecraft:dark_oak_log',
      'minecraft:mangrove_log', 'minecraft:cherry_log', 'minecraft:oak_planks', 'minecraft:spruce_planks',
      'minecraft:birch_planks', 'minecraft:jungle_planks', 'minecraft:acacia_planks',
      'minecraft:dark_oak_planks', 'minecraft:mangrove_planks', 'minecraft:cherry_planks',
      'minecraft:oak_leaves', 'minecraft:spruce_leaves', 'minecraft:birch_leaves', 'minecraft:jungle_leaves',
      'minecraft:acacia_leaves', 'minecraft:dark_oak_leaves', 'minecraft:mangrove_leaves',
      'minecraft:cherry_leaves', 'minecraft:glass', 'minecraft:obsidian', 'minecraft:bedrock',
      'minecraft:brick', 'minecraft:stone_bricks', 'minecraft:nether_brick', 'minecraft:netherrack',
      'minecraft:soul_sand', 'minecraft:end_stone', 'minecraft:purpur_block', 'minecraft:prismarine',
      'minecraft:sea_lantern', 'minecraft:glowstone', 'minecraft:redstone_lamp', 'minecraft:iron_block',
      'minecraft:gold_block', 'minecraft:diamond_block', 'minecraft:emerald_block', 'minecraft:netherite_block',
      'minecraft:redstone_block', 'minecraft:lapis_block', 'minecraft:copper_block', 'minecraft:amethyst_block',
      'minecraft:note_block', 'minecraft:mushroom_stem', 'minecraft:red_mushroom_block',
      'minecraft:brown_mushroom_block', 'minecraft:oak_sapling', 'minecraft:spruce_sapling',
      'minecraft:birch_sapling', 'minecraft:jungle_sapling', 'minecraft:acacia_sapling',
      'minecraft:dark_oak_sapling', 'minecraft:cherry_sapling', 'minecraft:cactus', 'minecraft:sugar_cane',
      'minecraft:bamboo', 'minecraft:vine', 'minecraft:lily_pad', 'minecraft:kelp', 'minecraft:seagrass',
      'minecraft:chorus_flower', 'minecraft:paper', 'minecraft:stick', 'minecraft:bone', 'minecraft:bone_meal',
      'minecraft:feather', 'minecraft:flint', 'minecraft:string', 'minecraft:leather', 'minecraft:rabbit_hide',
      'minecraft:slime_ball', 'minecraft:clay_ball', 'minecraft:gunpowder', 'minecraft:blaze_rod',
      'minecraft:blaze_powder', 'minecraft:ender_pearl', 'minecraft:ender_eye', 'minecraft:ghast_tear',
      'minecraft:magma_cream', 'minecraft:nether_star', 'minecraft:experience_bottle', 'minecraft:book',
      'minecraft:enchanted_book', 'minecraft:book_written', 'minecraft:name_tag', 'minecraft:map',
      'minecraft:compass', 'minecraft:clock', 'minecraft:recovery_compass', 'minecraft:torch',
      'minecraft:soul_torch', 'minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:sea_pickle',
      'minecraft:glass_bottle', 'minecraft:water_bucket', 'minecraft:lava_bucket', 'minecraft:milk_bucket',
      'minecraft:bowl', 'minecraft:bow', 'minecraft:arrow', 'minecraft:spectral_arrow', 'minecraft:crossbow',
      'minecraft:shield', 'minecraft:fishing_rod', 'minecraft:carrot_on_a_stick', 'minecraft:elytra',
      'minecraft:trident', 'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
      'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
      'minecraft:wooden_pickaxe', 'minecraft:stone_pickaxe', 'minecraft:iron_pickaxe',
      'minecraft:golden_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:netherite_pickaxe',
      'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe', 'minecraft:golden_axe',
      'minecraft:diamond_axe', 'minecraft:netherite_axe', 'minecraft:wooden_shovel', 'minecraft:stone_shovel',
      'minecraft:iron_shovel', 'minecraft:golden_shovel', 'minecraft:diamond_shovel', 'minecraft:netherite_shovel',
      'minecraft:wooden_hoe', 'minecraft:stone_hoe', 'minecraft:iron_hoe', 'minecraft:golden_hoe',
      'minecraft:diamond_hoe', 'minecraft:netherite_hoe', 'minecraft:shears', 'minecraft:flint_and_steel',
      'minecraft:apple', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple', 'minecraft:bread',
      'minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken',
      'minecraft:cooked_cod', 'minecraft:cooked_salmon', 'minecraft:cookie', 'minecraft:cake',
      'minecraft:pumpkin_pie', 'minecraft:sweet_berries', 'minecraft:glow_berries', 'minecraft:honey_bottle',
      'minecraft:golden_carrot', 'minecraft:carrot', 'minecraft:potato', 'minecraft:baked_potato',
      'minecraft:beetroot', 'minecraft:melon_slice', 'minecraft:chorus_fruit', 'minecraft:dried_kelp',
      'minecraft:coal', 'minecraft:charcoal', 'minecraft:iron_ingot', 'minecraft:gold_ingot',
      'minecraft:copper_ingot', 'minecraft:netherite_ingot', 'minecraft:diamond', 'minecraft:emerald',
      'minecraft:lapis_lazuli', 'minecraft:quartz', 'minecraft:amethyst_shard', 'minecraft:redstone',
      'minecraft:iron_nugget', 'minecraft:gold_nugget', 'minecraft:netherite_scrap', 'minecraft:echo_shard',
      'minecraft:leather_helmet', 'minecraft:leather_chestplate', 'minecraft:leather_leggings',
      'minecraft:leather_boots', 'minecraft:iron_helmet', 'minecraft:iron_chestplate',
      'minecraft:iron_leggings', 'minecraft:iron_boots', 'minecraft:golden_helmet', 'minecraft:golden_chestplate',
      'minecraft:golden_leggings', 'minecraft:golden_boots', 'minecraft:diamond_helmet',
      'minecraft:diamond_chestplate', 'minecraft:diamond_leggings', 'minecraft:diamond_boots',
      'minecraft:netherite_helmet', 'minecraft:netherite_chestplate', 'minecraft:netherite_leggings',
      'minecraft:netherite_boots', 'minecraft:turtle_helmet', 'minecraft:chainmail_helmet',
      'minecraft:chainmail_chestplate', 'minecraft:chainmail_leggings', 'minecraft:chainmail_boots',
      'minecraft:potion', 'minecraft:splash_potion', 'minecraft:lingering_potion', 'minecraft:spawn_egg',
      'minecraft:chest', 'minecraft:barrel', 'minecraft:furnace', 'minecraft:crafting_table', 'minecraft:anvil',
      'minecraft:enchanting_table', 'minecraft:brewing_stand', 'minecraft:beacon', 'minecraft:ender_chest',
      'minecraft:hopper', 'minecraft:dispenser', 'minecraft:dropper', 'minecraft:piston', 'minecraft:sticky_piston',
      'minecraft:lever', 'minecraft:redstone_torch', 'minecraft:redstone_lamp', 'minecraft:daylight_detector',
      'minecraft:repeater', 'minecraft:comparator', 'minecraft:target', 'minecraft:bell', 'minecraft:campfire',
      'minecraft:soul_campfire', 'minecraft:ladder', 'minecraft:oak_door', 'minecraft:iron_door',
      'minecraft:oak_trapdoor', 'minecraft:iron_trapdoor', 'minecraft:oak_fence', 'minecraft:oak_fence_gate',
      'minecraft:oak_slab', 'minecraft:oak_stairs', 'minecraft:oak_button', 'minecraft:stone_button',
      'minecraft:oak_pressure_plate', 'minecraft:stone_pressure_plate', 'minecraft:oak_sign',
      'minecraft:oak_hanging_sign', 'minecraft:item_frame', 'minecraft:painting', 'minecraft:armor_stand',
      'minecraft:minecart', 'minecraft:chest_minecart', 'minecraft:boat', 'minecraft:written_book',
      'minecraft:firework_rocket', 'minecraft:firework_star', 'minecraft:lead', 'minecraft:saddle',
      'minecraft:egg', 'minecraft:snowball', 'minecraft:ender_pearl', 'minecraft:heart_of_the_sea',
      'minecraft:nautilus_shell', 'minecraft:scute', 'minecraft:nether_wart', 'minecraft:poisonous_potato',
      'minecraft:spider_eye', 'minecraft:fermented_spider_eye', 'minecraft:blaze_cream', 'minecraft:rabbit_foot',
      'minecraft:phantom_membrane', 'minecraft:shulker_shell', 'minecraft:totem_of_undying',
      'minecraft:dragon_breath', 'minecraft:music_disc_13', 'minecraft:music_disc_cat',
      'minecraft:music_disc_pigstep', 'minecraft:goat_horn', 'minecraft:honeycomb', 'minecraft:beehive',
      'minecraft:honey_block', 'minecraft:slime_block', 'minecraft:ice', 'minecraft:packed_ice',
      'minecraft:blue_ice', 'minecraft:snow_block', 'minecraft:magma_block', 'minecraft:tnt',
      'minecraft:sponge', 'minecraft:wet_sponge', 'minecraft:bookshelf', 'minecraft:jukebox',
      'minecraft:note_block', 'minecraft:mushroom_stem', 'minecraft:shroomlight', 'minecraft:sculk',
      'minecraft:sculk_sensor', 'minecraft:sculk_shrieker', 'minecraft:sculk_catalyst', 'minecraft:sculk_vein',
      'minecraft:reinforced_deepslate', 'minecraft:echo_shard', 'minecraft:disc_fragment_5',
    ],
    equipmentSlots: ['head', 'chest', 'legs', 'feet', 'body', 'mainhand', 'offhand', 'saddle'],
    equipmentLayers: ['humanoid', 'humanoid_leggings', 'wings', 'wolf_body', 'horse_body', 'llama_body', 'pig_saddle', 'strider_saddle', 'camel_saddle', 'horse_saddle', 'donkey_saddle', 'mule_saddle', 'skeleton_horse_saddle', 'zombie_horse_saddle', 'happy_ghast_body', 'camel_husk_saddle', 'nautilus_body'],
    soundSources: ['music', 'master', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui'],
    pushReactions: ['PUSH_PULL', 'PUSH', 'POPPED', 'IMMOVEABLE', 'IGNORE_ENTITY', 'NORMAL', 'DESTROY', 'BLOCK', 'IGNORE', 'PUSH_ONLY'],
    billboards: ['fixed', 'vertical', 'horizontal', 'center'],
    displayTransforms: ['none', 'third_person_left_hand', 'third_person_right_hand', 'first_person_left_hand', 'first_person_right_hand', 'head', 'gui', 'ground', 'fixed'],
    alignments: ['any', 'center', 'half', 'quarter', 'corner', 'center_quarter'],
    rotations: ['any', 'four', 'eight', 'sixteen', 'north', 'east', 'west', 'south'],
    hitboxDirections: ['UP', 'DOWN', 'NORTH', 'WEST', 'EAST', 'SOUTH'],
    glowColors: ['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white'],
    openWindowTypes: ['anvil', 'enchantment', 'grindstone', 'loom', 'smithing', 'crafting', 'cartography'],
    eventTriggers: ['break', 'place', 'right_click', 'left_click', 'consume', 'pick_up', 'attack', 'step'],
    equipmentTypes: ['component', 'trim'],
    lootSourceTypes: ['block_break', 'block_shear', 'entity_death', 'entity_drop', 'entity_shear', 'fishing', 'piglin_barter', 'container', 'archaeology', 'harvest', 'shear_block', 'vault', 'advancement'],
    lootOverwrites: ['none', 'items', 'experience', 'all'],
    recipeTypes: ['shaped', 'shapeless', 'shaped_transform', 'shapeless_transform', 'smelting', 'blasting', 'smoking', 'campfire_cooking', 'stonecutting', 'smithing_transform', 'smithing_trim', 'brewing'],
    autoStateGroups: ['solid', 'note_block', 'mushroom_stem', 'red_mushroom_block', 'brown_mushroom_block', 'mushroom', 'tintable_leaves', 'waterlogged_tintable_leaves', 'non_tintable_leaves', 'waterlogged_non_tintable_leaves', 'leaves', 'waterlogged_leaves', 'lower_tripwire', 'higher_tripwire', 'tripwire', 'sapling', 'pressure_plate', 'cactus', 'sugar_cane', 'weeping_vine', 'twisting_vine', 'cave_vine', 'kelp', 'chorus'],
    blockPropertyTypes: ['boolean', 'int', 'string', 'direction', 'horizontal_direction', 'axis', 'single_block_half', 'double_block_half', 'hinge', 'slab_type', 'stairs_shape', 'sofa_shape', 'anchor_type'],
    // 特殊属性名 → 自动旋转等硬编码行为
    specialPropertyNames: ['axis', 'facing', 'facing_clockwise', 'rotation', 'waterlogged'],
    instruments: ['BASEDRUM', 'SNARE', 'HAT', 'BASS', 'FLUTE', 'BELL', 'GUITAR', 'CHIME', 'XYLOPHONE', 'IRON_XYLOPHONE', 'COW_BELL', 'DIDGERIDOO', 'BIT', 'BANJO', 'PLING', 'HARP'],
    fluidStates: ['empty', 'water', 'lava'],
    attributeOperations: ['add_value', 'add_multiplied_base', 'add_multiplied_total'],
    attributeSlots: ['any', 'mainhand', 'offhand', 'hand', 'feet', 'legs', 'chest', 'head', 'body', 'saddle', 'equipment'],
  };

  // ============ 条件类型 (wiki reference/conditions.mdx) ============
  var COND_TYPES = {
    any_of: { label: l('任一满足 (any_of)', 'Any Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES_REF }, label: l('子条件', 'Terms') })] },
    all_of: { label: l('全部满足 (all_of)', 'All Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES_REF }, label: l('子条件', 'Terms') })] },
    inverted: { label: l('取反 (inverted)', 'Inverted'), fields: [f('term', '条件', 'Term', 'union', { types: COND_TYPES_REF, negatable: true, label: l('条件', 'Term') })] },
    falling_block: { label: l('方块坠落掉落', 'Falling Block') },
    survives_explosion: { label: l('爆炸存活', 'Survives Explosion') },
    has_item: { label: l('手中有物品', 'Has Item') },
    match_item: { label: l('匹配手中物品', 'Match Item'), fields: [f('id', '物品 ID', 'Item ID', 'linesScalar', { hint: l('单个 ID 或每行一个 ID', 'Single ID or one ID per line'), datalist: 'items' }), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_block_property: { label: l('匹配方块属性', 'Match Block Property'), fields: [f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') })] },
    match_block: { label: l('匹配方块', 'Match Block'), fields: [f('id', '方块 ID', 'Block ID', 'text', { datalist: 'blocks' }), f('x', 'X', 'X', 'number'), f('y', 'Y', 'Y', 'number'), f('z', 'Z', 'Z', 'number'), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_entity: { label: l('匹配实体', 'Match Entity'), fields: [f('id', '实体 ID', 'Entity ID', 'text'), f('regex', '正则匹配', 'Regex', 'bool')] },
    match_furniture_variant: { label: l('匹配家具变体', 'Match Furniture Variant'), fields: [f('variants', '变体', 'Variants', 'lines', { hint: l('每行一个变体名', 'One variant per line') })] },
    enchantment: { label: l('附魔检测', 'Enchantment'), fields: [f('predicate', '谓词', 'Predicate', 'text', { hint: l('如 minecraft:silk_touch>=1 (> >= = < <=)', 'e.g. minecraft:silk_touch>=1') })] },
    table_bonus: { label: l('附魔概率表 (table_bonus)', 'Table Bonus'), fields: [f('enchantment', '附魔', 'Enchantment', 'text'), f('chances', '概率', 'Chances', 'lines', { hint: l('每行一个概率, 对应附魔等级', 'One chance per line, per enchantment level') })] },
    random: { label: l('随机概率', 'Random'), fields: [f('value', '概率', 'Value', 'number', { hint: l('0.1 = 10%', '0.1 = 10%') })] },
    permission: { label: l('权限', 'Permission'), fields: [f('permission', '权限', 'Permission', 'text')] },
    expression: { label: l('表达式', 'Expression'), fields: [f('expression', '表达式', 'Expression', 'text', { hint: l('返回 true 时满足 (EvalEx)', 'Passes when it returns true (EvalEx)') })] },
    string_equals: { label: l('字符串相等', 'String Equals'), fields: [f('value1', '值 1', 'Value 1', 'text'), f('value2', '值 2', 'Value 2', 'text')] },
    string_contains: { label: l('字符串包含', 'String Contains'), fields: [f('value1', '值 1', 'Value 1', 'text'), f('value2', '值 2', 'Value 2', 'text')] },
    regex: { label: l('正则匹配', 'Regex'), fields: [f('value', '值', 'Value', 'text'), f('regex', '正则', 'Regex', 'text')] },
    is_null: { label: l('参数为空', 'Is Null'), fields: [f('argument', '参数', 'Argument', 'text', { hint: l('如 player.main_hand_item', 'e.g. player.main_hand_item') })] },
    hand: { label: l('交互手', 'Hand'), fields: [f('hand', '手', 'Hand', 'select', { options: ['main_hand', 'off_hand'] })] },
    on_cooldown: { label: l('冷却中', 'On Cooldown'), fields: [f('id', '冷却 ID', 'Cooldown ID', 'text', { hint: l('由 set_cooldown 函数设置', 'Set by the set_cooldown function') })] },
    'worldguard:region': { label: l('WorldGuard 区域', 'WorldGuard Region'), fields: [f('mode', '模式', 'Mode', 'select', { options: [{ v: '1', l: '1 (并集)' }, { v: '2', l: '2 (交集)' }] }), f('regions', '区域', 'Regions', 'lines')] },
    distance: { label: l('距离范围', 'Distance'), fields: [f('min', '最小', 'Min', 'number'), f('max', '最大', 'Max', 'number')] },
    has_player: { label: l('有玩家', 'Has Player') },
    inventory_has_item: { label: l('背包有物品', 'Inventory Has Item'), fields: [f('id', '物品 ID', 'Item ID', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number')] },
    is_bedrock_player: { label: l('基岩版玩家', 'Is Bedrock Player') },
    test_flag: { label: l('测试交互旗标', 'Test Flag'), fields: [f('flag', '旗标', 'Flag', 'select', { options: ['break', 'place', 'interact', 'open_container'] })] },
    world: { label: l('世界', 'World'), fields: [f('world', '世界', 'World', 'text')] },
    js: { label: l('JavaScript', 'JS'), fields: [
      f('script', '脚本 ID', 'Script ID', 'text', { hint: l('namespace:path', 'namespace:path') }),
      f('function', '函数', 'Function', 'text', { hint: l('默认 main', 'Default: main') }),
      f('args', '参数', 'Args', 'union', { noTypeKey: true, label: l('参数', 'Args'), types: {
        list: { label: l('列表', 'List'), widget: { type: 'listOf', label: l('参数', 'Args'), itemType: { type: 'text' } } },
        map: { label: l('映射', 'Map'), widget: { type: 'mapOf', label: l('参数', 'Args'), valueType: { type: 'scalar' } } },
      } }),
    ]},
  };
  function COND_TYPES_REF() { return COND_TYPES; }

  // ============ 函数类型 (wiki reference/events.mdx) ============
  // 通用: 每个函数都附带 conditions 条件列表 (自动追加)
  function FN(fields) {
    var flds = fields.slice ? fields.slice() : [];
    flds.push(f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions'), hint: l('全部满足才执行该函数', 'All must pass for the function to run') }));
    return { fields: flds };
  }
  var FN_TYPES = {
    cancel_event: { label: l('取消事件', 'Cancel Event') },
    run: { label: l('依次执行 (run)', 'Run'), fields: [
      f('delay', '延迟 (tick)', 'Delay (ticks)', 'number', { hint: l('默认 0', 'Default 0') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
    ] },
    command: { label: l('执行命令', 'Command'), fields: [
      f('command', '命令', 'Command', 'linesScalar', { hint: l('支持 <arg:...> 占位符; 多行 = 多条命令', 'Supports <arg:...>; multiple lines = multiple commands') }),
      f('target', '目标', 'Target', 'text', { hint: l('all / self / 玩家选择器', 'all / self / player selector') }),
      f('as_player', '以玩家身份', 'As Player', 'bool'),
      f('as_op', '以 OP 身份', 'As OP', 'bool', { hint: l('不推荐, 有安全风险', 'Not recommended, security risk') }),
      f('as_event', '以事件执行', 'As Event', 'bool', { hint: l('部分事件式命令插件需要', 'Some event-based command plugins require this') }),
    ] },
    message: { label: l('发送消息', 'Message'), fields: [
      f('message', '消息', 'Message', 'linesScalar', { hint: l('多行 = 多条消息', 'Multiple lines = multiple messages') }),
      f('target', '目标', 'Target', 'text', { hint: l('all / self / 玩家选择器', 'all / self / player selector') }),
      f('overlay', 'Actionbar', 'Overlay', 'bool', { hint: l('true = actionbar, false = 聊天框', 'true = actionbar, false = chat') }),
    ] },
    actionbar: { label: l('Actionbar', 'Actionbar'), fields: [
      f('actionbar', '内容', 'Content', 'text'),
      f('target', '目标', 'Target', 'text'),
    ] },
    title: { label: l('Title', 'Title'), fields: [
      f('title', '标题', 'Title', 'miniText'),
      f('subtitle', '副标题', 'Subtitle', 'miniText'),
      f('fade_in', '淡入 (tick)', 'Fade In', 'number'),
      f('stay', '停留 (tick)', 'Stay', 'number'),
      f('fade_out', '淡出 (tick)', 'Fade Out', 'number'),
    ] },
    open_window: { label: l('打开界面', 'Open Window'), fields: [
      f('gui_type', '界面类型', 'GUI Type', 'select', { options: S.constants.openWindowTypes }),
      f('title', '标题', 'Title', 'text'),
      f('target', '目标', 'Target', 'text'),
    ] },
    break_block: { label: l('破坏方块', 'Break Block'), fields: [
      f('x', 'X', 'X', 'text', { hint: l('默认 <arg:position.x>', 'Default <arg:position.x>') }),
      f('y', 'Y', 'Y', 'text', { hint: l('默认 <arg:position.y>', 'Default <arg:position.y>') }),
      f('z', 'Z', 'Z', 'text', { hint: l('默认 <arg:position.z>', 'Default <arg:position.z>') }),
    ] },
    place_block: { label: l('放置方块', 'Place Block'), fields: [
      f('block_state', '方块状态', 'Block State', 'text', { hint: l('如 default:chinese_lantern', 'e.g. default:chinese_lantern'), datalist: 'blocks' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    update_block_property: { label: l('更新方块属性', 'Update Block Property'), fields: [
      f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    transform_block: { label: l('转换方块', 'Transform Block'), fields: [
      f('block', '方块', 'Block', 'text', { datalist: 'blocks' }),
      f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'scalar' }, label: l('属性', 'Properties') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
    ] },
    drop_loot: { label: l('掉落战利品', 'Drop Loot'), fields: [
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('to_inventory', '直接进背包', 'To Inventory', 'bool'),
      f('loot', '战利品表', 'Loot Table', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: 'minecraft:chests/simple_dungeon' }, label: l('战利品表', 'Loot Table'), types: LOOT_TYPES_REF() }),
    ] },
    update_interaction_tick: { label: l('更新交互计时', 'Update Interaction Tick') },
    set_count: { label: l('设置物品数量', 'Set Count'), fields: [
      f('add', '追加', 'Add', 'bool'), f('count', '数量', 'Count', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    set_food: { label: l('设置饱食度', 'Set Food'), fields: [
      f('add', '追加', 'Add', 'bool'), f('food', '饱食度 (0~20)', 'Food (0-20)', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    set_saturation: { label: l('设置饱和度', 'Set Saturation'), fields: [
      f('add', '追加', 'Add', 'bool'), f('saturation', '饱和度 (0~10)', 'Saturation (0-10)', 'number'),
      f('target', '目标', 'Target', 'text'),
    ] },
    swing_hand: { label: l('挥手', 'Swing Hand'), fields: [
      f('hand', '手', 'Hand', 'select', { options: ['main_hand', 'off_hand'], hint: l('留空 = 事件中的手', 'Empty = the hand in this context') }),
    ] },
    particle: { label: l('生成粒子', 'Particle'), fields: [
      f('particle', '粒子', 'Particle', 'text', { hint: l('如 minecraft:end_rod', 'e.g. minecraft:end_rod') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('count', '数量', 'Count', 'number'), f('offset_x', '偏移 X', 'Offset X', 'number'),
      f('offset_y', '偏移 Y', 'Offset Y', 'number'), f('offset_z', '偏移 Z', 'Offset Z', 'number'),
      f('speed', '速度', 'Speed', 'number'),
    ] },
    potion_effect: { label: l('药水效果', 'Potion Effect'), fields: [
      f('potion_effect', '效果', 'Effect', 'text', { hint: l('如 minecraft:blindness', 'e.g. minecraft:blindness') }),
      f('duration', '时长 (tick)', 'Duration', 'number'), f('amplifier', '等级', 'Amplifier', 'number'),
      f('ambient', '环境 (信标)', 'Ambient', 'bool'), f('particles', '粒子', 'Particles', 'bool'),
      f('show_icon', '显示图标', 'Show Icon', 'bool'),
    ] },
    remove_potion_effect: { label: l('移除药水效果', 'Remove Potion Effect'), fields: [
      f('potion_effect', '效果', 'Effect', 'text'), f('all', '全部', 'All', 'bool'),
    ] },
    leveler_exp: { label: l('技能经验 (leveler)', 'Leveler Exp'), fields: [
      f('plugin', '插件', 'Plugin', 'text', { hint: l('如 AuraSkills', 'e.g. AuraSkills') }),
      f('leveler', '技能/职业 ID', 'Leveler ID', 'text'), f('count', '经验', 'Exp', 'number'),
    ] },
    set_cooldown: { label: l('设置冷却', 'Set Cooldown'), fields: [
      f('time', '时长', 'Time', 'text', { hint: l('如 1m30s (t/s/m/h/d/w)', 'e.g. 1m30s (t/s/m/h/d/w)') }),
      f('id', '冷却 ID', 'Cooldown ID', 'text'), f('add', '累加', 'Add', 'bool'),
    ] },
    remove_cooldown: { label: l('移除冷却', 'Remove Cooldown'), fields: [
      f('id', '冷却 ID', 'Cooldown ID', 'text'), f('all', '全部', 'All', 'bool'),
    ] },
    play_sound: { label: l('播放音效', 'Play Sound'), fields: [
      f('sound', '音效', 'Sound', 'text', { hint: l('如 minecraft:block.xxx.xxx', 'e.g. minecraft:block.xxx.xxx') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('target', '目标', 'Target', 'text'), f('pitch', '音调', 'Pitch', 'number'),
      f('volume', '音量', 'Volume', 'number'), f('source', '来源', 'Source', 'select', { options: S.constants.soundSources }),
    ] },
    cast_mythic_skill: { label: l('释放 MythicMobs 技能', 'Cast Mythic Skill'), fields: [
      f('skill', '技能 ID', 'Skill ID', 'text'), f('power', '强度', 'Power', 'number'),
    ] },
    spawn_furniture: { label: l('生成家具', 'Spawn Furniture'), fields: [
      f('furniture_id', '家具 ID', 'Furniture ID', 'text', { datalist: 'furniture' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
      f('variant', '变体', 'Variant', 'text'), f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    remove_furniture: { label: l('移除家具', 'Remove Furniture'), fields: [
      f('drop_loot', '掉落战利品', 'Drop Loot', 'bool'), f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    replace_furniture: { label: l('替换家具', 'Replace Furniture'), fields: [
      f('furniture_id', '家具 ID', 'Furniture ID', 'text', { datalist: 'furniture' }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
      f('variant', '变体', 'Variant', 'text'), f('drop_loot', '掉落战利品', 'Drop Loot', 'bool'),
      f('play_sound', '播放音效', 'Play Sound', 'bool'),
    ] },
    rotate_furniture: { label: l('旋转家具', 'Rotate Furniture'), fields: [
      f('degree', '角度', 'Degree', 'number'),
      f('on_success', '成功时', 'On Success', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('成功时', 'On Success') }),
      f('on_failure', '失败时', 'On Failure', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('失败时', 'On Failure') }),
    ] },
    teleport: { label: l('传送', 'Teleport'), fields: [
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'), f('world', '世界', 'World', 'text'),
    ] },
    toast: { label: l('发送 Toast', 'Toast'), fields: [
      f('toast', '内容', 'Content', 'text'),
      f('advancement_type', '类型', 'Type', 'select', { options: ['goal', 'task', 'challenge'] }),
      f('icon', '图标', 'Icon', 'text', { datalist: 'items' }),
    ] },
    damage: { label: l('造成伤害', 'Damage'), fields: [
      f('target', '目标', 'Target', 'text'), f('amount', '伤害', 'Amount', 'number'),
      f('damage_type', '伤害类型', 'Damage Type', 'text', { hint: l('默认 generic', 'Default: generic') }),
    ] },
    set_variable: { label: l('设置变量', 'Set Variable'), fields: [
      f('name', '变量名', 'Name', 'text', { hint: l('用 <arg:var_[name]> 访问', 'Access via <arg:var_[name]>') }),
      f('number', '数字', 'Number', 'number'), f('as_int', '取整', 'As Int', 'bool'),
      f('text', '文本', 'Text', 'text'),
    ] },
    merchant_trade: { label: l('村民交易', 'Merchant Trade'), fields: [
      f('title', '标题', 'Title', 'text'),
      f('offers', '交易项', 'Offers', 'listOf', {
        label: l('交易项', 'Offers'),
        itemType: { type: 'object', fields: [
          f('cost_1', '花费 1', 'Cost 1', 'union', { noTypeKey: true, label: l('花费 1', 'Cost 1'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }),
              f('count', '数量', 'Count', 'number'),
              f('components', '组件', 'Components', 'kv'),
            ] } },
          } }),
          f('cost_2', '花费 2 (可选)', 'Cost 2', 'union', { noTypeKey: true, label: l('花费 2', 'Cost 2'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
            ] } },
          } }),
          f('result', '结果', 'Result', 'union', { noTypeKey: true, label: l('结果', 'Result'), types: {
            string: { label: l('物品 ID', 'Item ID'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
            ] } },
          } }),
          f('experience', '经验', 'Experience', 'number'),
        ] },
      }),
    ] },
    remove_entity: { label: l('移除实体', 'Remove Entity') },
    if_else: { label: l('条件分支 (if_else)', 'If Else'), fields: [
      f('rules', '规则', 'Rules', 'listOf', {
        label: l('规则', 'Rules'),
        itemType: { type: 'object', fields: [
          f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
          f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
        ] },
        hint: l('依次匹配, 最后一条无条件的规则作为 else', 'First match wins; a rule without conditions acts as else'),
      }),
    ] },
    when: { label: l('多路分支 (when)', 'When'), fields: [
      f('source', '源值', 'Source', 'text', { hint: l('如 <papi:player_world>', 'e.g. <papi:player_world>') }),
      f('cases', '分支', 'Cases', 'listOf', {
        label: l('分支', 'Cases'),
        itemType: { type: 'object', fields: [
          f('when', '匹配值', 'When', 'linesScalar', { hint: l('单行 = 单个值, 多行 = 多个值', 'One line = one value, multiple lines = several') }),
          f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('函数', 'Functions') }),
        ] },
      }),
      f('fallback', '兜底', 'Fallback', 'listOf', { itemType: { type: 'union', types: FN_TYPES_REF }, label: l('兜底', 'Fallback') }),
    ] },
    damage_item: { label: l('消耗耐久', 'Damage Item'), fields: [
      f('amount', '数量', 'Amount', 'number'),
      f('slot', '槽位', 'Slot', 'select', { options: ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head'] }),
    ] },
    cycle_block_property: { label: l('循环方块属性', 'Cycle Block Property'), fields: [
      f('property', '属性', 'Property', 'text', { hint: l('如 axis / facing', 'e.g. axis / facing') }),
      f('inverse', '反向', 'Inverse', 'text', { hint: l('默认 <arg:player.is_sneaking>', 'Default <arg:player.is_sneaking>') }),
      f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'), f('z', 'Z', 'Z', 'text'),
      f('rules', '自定义顺序', 'Rules', 'mapOf', { valueType: { type: 'text' }, label: l('自定义顺序', 'Rules'), hint: l('值 → 下一个值', 'value → next value') }),
    ] },
    set_exp: { label: l('设置经验值', 'Set Exp'), fields: [
      f('count', '经验', 'Exp', 'number'), f('add', '追加', 'Add', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    set_level: { label: l('设置等级', 'Set Level'), fields: [
      f('count', '等级', 'Level', 'number'), f('add', '追加', 'Add', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    play_totem_animation: { label: l('图腾动画', 'Play Totem Animation'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('sound', '音效', 'Sound', 'text'),
      f('pitch', '音调', 'Pitch', 'number'), f('volume', '音量', 'Volume', 'number'),
      f('silent', '静默', 'Silent', 'bool'), f('target', '目标', 'Target', 'text'),
    ] },
    close_inventory: { label: l('关闭背包', 'Close Inventory'), fields: [
      f('target', '目标', 'Target', 'text'),
    ] },
    clear_item: { label: l('清除物品', 'Clear Item'), fields: [
      f('id', '物品 ID', 'Item ID', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number'),
    ] },
    heal: { label: l('治疗', 'Heal'), fields: [
      f('amount', '生命值', 'Amount', 'number'), f('target', '目标', 'Target', 'text'),
    ] },
    spawn_mythic_mob: { label: l('生成 MythicMobs 生物', 'Spawn Mythic Mob'), fields: [
      f('mob', '生物 ID', 'Mob ID', 'text'), f('level', '等级', 'Level', 'number'),
      f('world', '世界', 'World', 'text'), f('x', 'X', 'X', 'text'), f('y', 'Y', 'Y', 'text'),
      f('z', 'Z', 'Z', 'text'), f('pitch', 'Pitch', 'Pitch', 'text'), f('yaw', 'Yaw', 'Yaw', 'text'),
    ] },
    set_furniture_variant: { label: l('切换家具变体', 'Set Furniture Variant'), fields: [
      f('variant', '变体', 'Variant', 'text'),
    ] },
    set_item_cooldown: { label: l('物品冷却 (1.21.2+)', 'Set Item Cooldown'), fields: [
      f('id', '物品 ID', 'Item ID', 'text', { hint: l('冷却组, 如 minecraft:ender_pearl', 'Cooldown group, e.g. minecraft:ender_pearl') }),
      f('time', '时长', 'Time', 'text', { hint: l('如 5s (t/s/m/h/d/w)', 'e.g. 5s (t/s/m/h/d/w)') }),
      f('add', '追加', 'Add', 'bool'),
    ] },
    js: { label: l('JavaScript', 'JS'), fields: [
      f('script', '脚本 ID', 'Script ID', 'text', { hint: l('namespace:path', 'namespace:path') }),
      f('function', '函数', 'Function', 'text'),
      f('args', '参数', 'Args', 'union', { noTypeKey: true, label: l('参数', 'Args'), types: {
        list: { label: l('列表', 'List'), widget: { type: 'listOf', label: l('参数', 'Args'), itemType: { type: 'text' } } },
        map: { label: l('映射', 'Map'), widget: { type: 'mapOf', label: l('参数', 'Args'), valueType: { type: 'scalar' } } },
      } }),
    ] },
  };
  function FN_TYPES_REF() { return FN_TYPES; }

  // ============ 战利品表 (wiki reference/loot_table.mdx) ============
  var LOOT_FN_TYPES = {
    apply_bonus: { label: l('附魔加成', 'Apply Bonus'), fields: [
      f('enchantment', '附魔', 'Enchantment', 'text'),
      f('formula', '公式', 'Formula', 'union', { noTypeKey: true, label: l('公式', 'Formula'), types: {
        ore_drops: { label: l('矿石掉落 (ore_drops)', 'Ore Drops') },
        binomial_with_bonus_count: { label: l('二项分布 (binomial)', 'Binomial With Bonus Count'), widget: { type: 'object', fields: [
          f('extra', '额外', 'Extra', 'number'), f('probability', '概率', 'Probability', 'number'),
        ] } },
      } }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    apply_data: { label: l('应用数据', 'Apply Data'), fields: [
      f('data', '数据', 'Data', 'kv'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    set_count: { label: l('设置数量', 'Set Count'), fields: [
      f('count', '数量', 'Count', 'text'), f('add', '追加', 'Add', 'bool'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    explosion_decay: { label: l('爆炸衰减', 'Explosion Decay'), fields: [
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    drop_exp: { label: l('掉落经验', 'Drop Exp'), fields: [
      f('count', '经验', 'Count', 'text'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    limit_count: { label: l('限制数量', 'Limit Count'), fields: [
      f('min', '最小', 'Min', 'number'), f('max', '最大', 'Max', 'number'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
  };
  var LOOT_ENTRY_TYPES = {
    item: { label: l('物品', 'Item'), fields: [
      f('item', '物品 ID', 'Item ID', 'text', { datalist: 'items' }),
      f('weight', '权重', 'Weight', 'number'),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    furniture_item: { label: l('家具物品', 'Furniture Item'), fields: [
      f('item', '物品 ID', 'Item ID', 'text', { hint: l('掉落放置时使用的物品', 'Drops the item used to place'), datalist: 'items' }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    exp: { label: l('经验', 'Exp'), fields: [
      f('count', '经验', 'Count', 'text'),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    alternatives: { label: l('备选 (alternatives)', 'Alternatives'), fields: [
      f('children', '子条目', 'Children', 'listOf', { itemType: { type: 'union', types: LOOT_ENTRY_TYPES_REF }, label: l('子条目', 'Children') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    loot_table: { label: l('引用战利品表', 'Loot Table'), fields: [
      f('id', 'ID', 'ID', 'text', { hint: l('如 minecraft:chests/simple_dungeon', 'e.g. minecraft:chests/simple_dungeon') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES_REF }, label: l('函数', 'Functions') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
  };
  function LOOT_FN_TYPES_REF() { return LOOT_FN_TYPES; }
  function LOOT_ENTRY_TYPES_REF() { return LOOT_ENTRY_TYPES; }
  var LOOT_POOL = {
    type: 'object',
    fields: [
      f('rolls', '抽取次数', 'Rolls', 'text', { hint: l('数字或表达式, 如 1~3', 'Number or expression, e.g. 1~3') }),
      f('bonus_rolls', '额外次数', 'Bonus Rolls', 'text'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
      f('entries', '条目', 'Entries', 'listOf', { itemType: { type: 'union', types: LOOT_ENTRY_TYPES }, label: l('条目', 'Entries') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES }, label: l('函数', 'Functions') }),
    ],
  };
  var LOOT_TYPES = {
    template: { label: l('模板', 'Template'), fields: [
      f('template', '模板 ID', 'Template ID', 'text', { hint: l('如 default:loot_table/furniture', 'e.g. default:loot_table/furniture') }),
      f('arguments', '参数', 'Arguments', 'mapOf', { valueType: { type: 'scalar' }, label: l('参数', 'Arguments') }),
    ] },
    pools: { label: l('内联战利品', 'Inline Loot'), fields: [
      f('pools', '战利品池', 'Pools', 'listOf', { itemType: LOOT_POOL, label: l('战利品池', 'Pools') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES }, label: l('函数', 'Functions') }),
    ] },
  };
  function LOOT_TYPES_REF() { return LOOT_TYPES; }
  // loot 对象形式: template+arguments 或 pools+functions 共存于同一对象
  // (loot 数据无 type 键, 不用 union 避免形状误判丢数据)
  var LOOT_OBJECT_FIELDS = [
    f('template', '模板', 'Template', 'text', { hint: l('如 default:loot_table/furniture', 'e.g. default:loot_table/furniture') }),
    f('arguments', '参数', 'Arguments', 'mapOf', { valueType: { type: 'scalar' }, label: l('参数', 'Arguments') }),
    f('pools', '战利品池', 'Pools', 'listOf', { itemType: LOOT_POOL, label: l('战利品池', 'Pools') }),
    f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: LOOT_FN_TYPES }, label: l('函数', 'Functions') }),
  ];
  S.loot = { types: LOOT_TYPES, pool: LOOT_POOL, entries: LOOT_ENTRY_TYPES, functions: LOOT_FN_TYPES, objectFields: LOOT_OBJECT_FIELDS };

  // ============ 共享字段构建 ============
  function conditionsList() {
    return { type: 'listOf', label: l('条件', 'Conditions'), itemType: { type: 'union', negatable: true, types: COND_TYPES }, hint: l('全部满足才生效 (可加 ! 取反)', 'All must pass (! prefix inverts)') };
  }
  function functionsList(labelZh) {
    return { type: 'listOf', label: l(labelZh || '函数', 'Functions'), itemType: { type: 'union', types: FN_TYPES } };
  }
  S.conditions = COND_TYPES;
  S.functions = FN_TYPES;
  S.conditionsList = conditionsList;
  S.functionsList = functionsList;

  // ============ Section 表单 (简单类型) ============
  // 复杂类型 (item/block/furniture/recipe) 在后续模块补充
  var SECTIONS = {};

  SECTIONS.equipment = {
    fields: [
      f('type', '类型', 'Type', 'select', { options: S.constants.equipmentTypes, hint: l('装备类型: component / trim', 'Equipment type: component / trim') }),
      f('__root__', '层', 'Layers', 'mapOf', {
        custom: 'root-map',
        label: l('层', 'Layers'),
        hint: l('键为层类型 (直接写在条目下): ' + S.constants.equipmentLayers.join(' / '), 'Key is layer type (written directly under the entry): ' + S.constants.equipmentLayers.join(' / ')),
        valueType: { type: 'union', noTypeKey: true, label: l('层', 'Layer'), types: {
          string: { label: l('纹理路径', 'Texture Path'), widget: { type: 'text' } },
          map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
            f('texture', '纹理', 'Texture', 'text', { hint: l('如 minecraft:leather', 'e.g. minecraft:leather') }),
            f('dyeable', '可染色', 'Dyeable', 'union', { noTypeKey: true, label: l('可染色', 'Dyeable'), types: {
              bool: { label: l('布尔', 'Boolean'), widget: { type: 'bool' } },
              map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
                f('color_when_undyed', '未染色颜色', 'Color When Undyed', 'number', { hint: l('十进制颜色值, 如 -6265536', 'Decimal color, e.g. -6265536') }),
              ] } },
            } }),
            f('use_player_texture', '玩家纹理 (鞘翅)', 'Use Player Texture', 'bool'),
          ] } },
          list: { label: l('多纹理组合', 'Texture List'), widget: { type: 'listOf', label: l('层', 'Layers'), itemType: { type: 'union', noTypeKey: true, types: {
            string: { label: l('纹理路径', 'Texture Path'), widget: { type: 'text' } },
            map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
              f('texture', '纹理', 'Texture', 'text'),
              f('dyeable', '可染色', 'Dyeable', 'union', { noTypeKey: true, label: l('可染色', 'Dyeable'), types: {
                bool: { label: l('布尔', 'Boolean'), widget: { type: 'bool' } },
                map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
                  f('color_when_undyed', '未染色颜色', 'Color When Undyed', 'number'),
                ] } },
              } }),
            ] } },
          } } },
        } } },
      }),
    ],
  };

  SECTIONS.image = {
    fields: [
      f('file', '文件', 'File', 'text', { hint: l('如 assets/images/xxx.png', 'e.g. assets/images/xxx.png') }),
      f('height', '高度', 'Height', 'number'),
      f('ascent', '基线偏移', 'Ascent', 'number'),
      f('font', '字体', 'Font', 'text', { hint: l('默认 namespace:default', 'Default: namespace:default') }),
      f('char', '字符', 'Char', 'text'),
      f('chars', '字符集', 'Chars', 'lines', { hint: l('每行一个字符', 'One char per line') }),
      f('grid_size', '网格大小', 'Grid Size', 'text', { hint: l('如 2,3 = 2 行 × 3 列', 'e.g. 2,3 = 2 rows × 3 columns') }),
      f('ref', '引用', 'Ref', 'text'),
      f('row', '行', 'Row', 'number'),
      f('column', '列', 'Column', 'number'),
    ],
  };

  SECTIONS.category = {
    fields: [
      f('name', '显示名', 'Name', 'miniText', { hint: l('支持 MiniMessage', 'Supports MiniMessage') }),
      f('lore', '描述', 'Lore', 'lines', { hint: l('每行一条', 'One line each') }),
      f('icon', '图标', 'Icon', 'text', { hint: l('注册的物品 ID', 'A registered item ID'), datalist: 'items' }),
      f('priority', '优先级', 'Priority', 'number', { hint: l('越小越靠前', 'Lower shows first') }),
      f('hidden', '隐藏', 'Hidden', 'bool', { hint: l('不出现在主菜单 (子分类)', 'Hidden from main menu (sub-category)') }),
      f('conditions', '显示条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('显示条件', 'Conditions'), hint: l('满足条件才在主菜单显示此分类', 'Category shows only when these are met') }),
      f('list', '成员列表', 'List', 'lines', { hint: l('物品 ID 或 #分类ID (每行一个)', 'Item IDs or #category refs (one per line)') }),
      f('all_items', '包含全部物品', 'All Items', 'bool', { hint: l('自动包含所有注册的自定义物品', 'Auto-include all registered custom items') }),
    ],
  };

  SECTIONS.sound = {
    fields: [
      f('replace', '替换原音效', 'Replace', 'bool'),
      f('subtitle', '字幕', 'Subtitle', 'text'),
      f('sounds', '音效列表', 'Sounds', 'listOf', {
        label: l('音效列表', 'Sounds'),
        itemType: { type: 'union', noTypeKey: true, types: {
          string: { label: l('路径', 'Path'), widget: { type: 'text', hint: l('如 block/custom_block_1', 'e.g. block/custom_block_1') } },
          map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
            f('name', '路径', 'Path', 'text'),
            f('volume', '音量', 'Volume', 'number'),
            f('weight', '权重', 'Weight', 'number'),
            f('stream', '流式播放', 'Stream', 'bool'),
            f('attenuation_distance', '衰减距离', 'Attenuation Distance', 'number'),
            f('preload', '预加载', 'Preload', 'bool'),
            f('type', '类型', 'Type', 'select', { options: ['file', 'event'], hint: l('file: 独立音效文件; event: 原版音效事件', 'file: standalone sound file; event: vanilla sound event') }),
          ] } },
        } },
      }),
    ],
  };

  SECTIONS.emoji = {
    fields: [
      f('keywords', '关键词', 'Keywords', 'lines', { hint: l('每行一个', 'One per line') }),
      f('content', '内容', 'Content', 'textarea'),
      f('image', '图片', 'Image', 'text', { hint: l('图片单元引用: namespace:id:row:column (单格图片可省略 :row:column), 如 default:emojis:0:0', 'Image cell reference: namespace:id:row:column (single-cell may omit :row:column), e.g. default:emojis:0:0') }),
      f('permission', '权限', 'Permission', 'text'),
      f('chat_completion', '聊天补全', 'Chat Completion', 'bool'),
      f('template', '模板', 'Template', 'text'),
      f('overrides', '覆盖', 'Overrides', 'mapOf', { valueType: { type: 'scalar' }, label: l('覆盖', 'Overrides') }),
      f('content_overrides', '按场景切换内容', 'Content Overrides', 'mapOf', { valueType: { type: 'scalar' }, label: l('按场景切换内容', 'Content Overrides'), hint: l('不同场景 (聊天/书本/铁砧/告示牌/指令) 使用不同格式, 键 = chat/book/anvil/sign/command', 'Different chat contexts (chat, book, anvil, sign, command) may need different formatting; key = chat/book/anvil/sign/command') }),
    ],
  };

  SECTIONS.jukeboxSong = {
    fields: [
      f('sound', '音效', 'Sound', 'text', { hint: l('如 minecraft:music_disc.pigstep', 'e.g. minecraft:music_disc.pigstep') }),
      f('length', '时长 (秒)', 'Length (seconds)', 'number'),
      f('description', '描述', 'Description', 'text'),
      f('comparator_output', '红石输出', 'Comparator Output', 'number'),
      f('range', '范围', 'Range', 'number'),
    ],
  };

  SECTIONS.painting = {
    fields: [
      f('width', '宽 (1~16)', 'Width', 'number'),
      f('height', '高 (1~16)', 'Height', 'number', { hint: l('画的高度, 1~16 方块', 'Painting height in blocks, 1~16') }),
      f('asset_id', '纹理', 'Asset ID', 'text', { hint: l('默认等于条目 ID', 'Defaults to the entry id') }),
      f('title', '标题', 'Title', 'miniText', { hint: l('支持 <lang:...>', 'Supports <lang:...>') }),
      f('author', '作者', 'Author', 'miniText'),
      f('show_in_op_tab', 'OP 工具选项卡显示', 'Show in OP Tab', 'bool'),
    ],
  };

  // 全局变量/翻译: 值可能为字符串或对象, 由表单引擎按值形态处理
  SECTIONS.globalVariable = { wholeValue: true };
  SECTIONS.translation = { wholeValue: true };
  SECTIONS.lang = { wholeValue: true };

  SECTIONS.lootSource = {
    fields: [
      f('type', '类型', 'Type', 'select', { options: S.constants.lootSourceTypes }),
      f('target', '目标', 'Target', 'text', { hint: l('按类型可为方块/实体/战利品表/进度 ID; fishing 与 piglin_barter 无目标', 'Block/entity/loot-table/advancement id; fishing & piglin_barter take none') }),
      f('targets', '多个目标', 'Targets', 'lines', { hint: l('每行一个', 'One per line') }),
      f('overwrite', '覆盖', 'Overwrite', 'select', { options: S.constants.lootOverwrites, hint: l('从原版掉落中移除的内容', 'What to remove from the vanilla result') }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
      f('loot', '战利品', 'Loot', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: 'minecraft:chests/simple_dungeon' }, label: l('战利品', 'Loot'), types: LOOT_TYPES }),
    ],
  };

  // 放置修饰器 (wiki 无结构文档, 按原版 placemod 建模; 未知类型 kv 兜底)
  var PLACEMENT_MODIFIER_TYPES = {
    'minecraft:rarity_filter': { label: l('稀有度过滤 (rarity_filter)', 'Rarity Filter'), fields: [f('chance', '概率', 'Chance', 'number')] },
    'minecraft:in_square': { label: l('方形内 (in_square)', 'In Square') },
    'minecraft:heightmap': { label: l('高度图 (heightmap)', 'Heightmap'), fields: [f('heightmap', '高度图', 'Heightmap', 'text')] },
    'minecraft:biome': { label: l('群系过滤 (biome)', 'Biome') },
    'minecraft:random_offset': { label: l('随机偏移 (random_offset)', 'Random Offset'), fields: [
      f('xz_spread', 'XZ 偏移', 'XZ Spread', 'number'),
      f('y_spread', 'Y 偏移', 'Y Spread', 'number'),
    ] },
    'minecraft:block_predicate_filter': { label: l('方块谓词过滤 (block_predicate_filter)', 'Block Predicate Filter'), fields: [f('predicate', '谓词', 'Predicate', 'kv')] },
    'minecraft:count': { label: l('数量 (count)', 'Count'), fields: [f('count', '数量', 'Count', 'text')] },
    'minecraft:noise_threshold_count': { label: l('噪声阈值数量 (noise_threshold_count)', 'Noise Threshold Count'), fields: [
      f('noise_level', '噪声级别', 'Noise Level', 'number'),
      f('below_noise', '低于噪声', 'Below Noise', 'number'),
      f('above_noise', '高于噪声', 'Above Noise', 'number'),
    ] },
    'minecraft:count_on_every_layer': { label: l('每层数量 (count_on_every_layer)', 'Count On Every Layer'), fields: [f('count', '数量', 'Count', 'text')] },
    'minecraft:environment_scan': { label: l('环境扫描 (environment_scan)', 'Environment Scan'), fields: [
      f('direction_of_search', '搜索方向', 'Direction', 'text'),
      f('max_steps', '最大步数', 'Max Steps', 'number'),
      f('target_condition', '目标条件', 'Target Condition', 'kv'),
      f('allowed_condition', '允许条件', 'Allowed Condition', 'kv'),
    ] },
    'minecraft:spread_32_above_top': { label: l('顶部上 32 格散布 (spread_32_above_top)', 'Spread 32 Above Top') },
    'minecraft:top_slice_height': { label: l('顶部切片高度 (top_slice_height)', 'Top Slice Height'), fields: [f('height', '高度', 'Height', 'text', { hint: l('上方截取的方块数', 'Blocks cut from the top') })] },
    'minecraft:carving_mask': { label: l('洞穴雕刻掩码 (carving_mask)', 'Carving Mask'), fields: [f('step', '步骤', 'Step', 'text')] },
    'minecraft:random_spread': { label: l('随机散布 (random_spread)', 'Random Spread'), fields: [
      f('spread_type', '散布类型', 'Spread Type', 'text'),
      f('spread', '散布', 'Spread', 'number'),
      f('horizontal_spread', '水平散布', 'Horizontal Spread', 'number'),
      f('vertical_spread', '垂直散布', 'Vertical Spread', 'number'),
    ] },
    'minecraft:block_predictions': { label: l('方块预测 (block_predictions)', 'Block Predictions'), fields: [f('predicate', '谓词', 'Predicate', 'kv')] },
    'minecraft:height_range': { label: l('高度范围 (height_range)', 'Height Range'), fields: [
      f('height', '高度', 'Height', 'object', { hint: l('生成高度范围', 'Spawn height range'), fields: [
        f('type', '类型', 'Type', 'text', { hint: l('如 minecraft:uniform', 'e.g. minecraft:uniform') }),
        f('min_inclusive', '最小高度', 'Min Inclusive', 'number'),
        f('max_inclusive', '最大高度', 'Max Inclusive', 'number'),
      ] }),
    ] },
  };
  var PLACED_FEATURE_UNION = {
    type: 'union', noTypeKey: true, allowScalar: { type: 'text', placeholder: l('minecraft:patch', 'minecraft:patch') },
    label: l('地物', 'Feature'),
    types: {
      map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
        f('type', '类型', 'Type', 'text', { hint: l('已配置地物类型, 如 minecraft:tree', 'Configured feature type, e.g. minecraft:tree') }),
        f('config', '配置', 'Config', 'kv'),
      ], label: l('地物', 'Feature') } },
    },
  };
  var PLACED_PLACEMENT_UNION = {
    type: 'union', noTypeKey: true, label: l('放置规则', 'Placement'),
    types: {
      single: { label: l('单个修饰器', 'Single Modifier'), widget: { type: 'union', types: PLACEMENT_MODIFIER_TYPES, label: l('修饰器', 'Modifier') } },
      list: { label: l('修饰器列表', 'Modifier List'), widget: { type: 'listOf', label: l('放置修饰器', 'Placement Modifiers'), itemType: { type: 'union', types: PLACEMENT_MODIFIER_TYPES, label: l('修饰器', 'Modifier') } } },
    },
  };
  SECTIONS.placedFeature = {
    fields: [
      f('feature', '地物', 'Feature', 'popup', { content: PLACED_FEATURE_UNION, label: l('地物', 'Feature'), hint: l('生成结构定义', 'Structure definition') }),
      f('placement', '放置规则', 'Placement', 'popup', { content: PLACED_PLACEMENT_UNION, label: l('放置规则', 'Placement'), hint: l('放置修饰器', 'Placement modifiers') }),
      f('world', '世界', 'World', 'lines'),
      f('dimension', '维度', 'Dimension', 'lines'),
      f('dimension_type', '维度类型', 'Dimension Type', 'lines'),
      f('biome', '生物群系', 'Biome', 'lines'),
    ],
  };

  // ============ Item 可视化编辑 ============
  // 数据源: wiki item/data.mdx, item/models.mdx + models/ 子文档, item/settings.mdx,
  //         item/behaviors.mdx + behaviors/ 子文档, item/updater.mdx

  // ---- 常量补充 (datalist) ----
  S.constants.glowColors = ['#000000', '#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00', '#00FF80',
    '#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF', '#FF0080', '#FFFFFF'];
  S.constants.equipmentSlots = ['main_hand', 'off_hand', 'head', 'chest', 'legs', 'feet', 'body', 'saddle', 'any'];
  S.constants.enchantOperations = ['ADD', 'MULTIPLY_BASE', 'MULTIPLY_TOTAL'];
  S.constants.bannerColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
    'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
  S.constants.headKinds = ['SKULL', 'PLAYER', 'BLOCK', 'CREEPER', 'DRAGON', 'PIGLIN', 'SKELETON', 'WITHER_SKELETON', 'ZOMBIE'];
  S.constants.rotations = ['NONE', 'CLOCKWISE_45', 'CLOCKWISE_90', 'CLOCKWISE_135', 'FLIPPED',
    'COUNTERCLOCKWISE_45', 'COUNTERCLOCKWISE_90', 'COUNTERCLOCKWISE_135'];
  S.constants.alignments = ['none', 'center', 'bottom'];
  S.constants.modelCondProps = ['component', 'custom_model_data', 'item_model'];
  S.constants.modelSelProps = ['component', 'custom_model_data', 'item_model'];
  S.constants.modelRangeProps = ['component', 'custom_model_data', 'item_model'];
  S.constants.bookGenerations = ['ORIGINAL', 'COPY_OF_ORIGINAL', 'COPY_OF_COPY', 'TATTERED'];

  // 音效值: 字符串 或 详细 {id, pitch, volume}
  var SOUND_REF_TYPES = {
    map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
      f('id', '音效 ID', 'Sound ID', 'text'),
      f('pitch', '音调', 'Pitch', 'number'),
      f('volume', '音量', 'Volume', 'text', { hint: l('支持 0.25~0.3 区间', 'Ranged values supported, e.g. 0.25~0.3') }),
    ], label: l('音效', 'Sound') } },
  };
  function soundRefField(key, zh, en) {
    return f(key, zh, en, 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: l('minecraft:block.deepslate.break', 'minecraft:block.deepslate.break') }, label: l('音效', 'Sound'), types: SOUND_REF_TYPES });
  }
  // 音效对象 (弹窗 content): 方块五键 / 家具三键 / 其他键位 (须在 _bh 之前, 行为字段会引用)
  function soundObject(keys) {
    return {
      type: 'object',
      fields: keys.map(function (k) {
        var zh = { break: '破坏', step: '踩踏', place: '放置', hit: '挖掘', fall: '坠落', open: '打开', close: '关闭', put: '放入', take: '取出', on: '按下', off: '松开', chime: '风铃', land: '落地', destroy: '破坏', rotate: '旋转' }[k] || k;
        var en = k.charAt(0).toUpperCase() + k.slice(1);
        return soundRefField(k, zh, en);
      }),
      label: l('音效', 'Sounds'),
    };
  }
  var BLOCK_SOUND_OBJECT = soundObject(['break', 'step', 'place', 'hit', 'fall']);
  var FURNITURE_SOUND_OBJECT = soundObject(['break', 'place', 'hit']);

  // legacy 行为字段 → 新 schema 字段 (数据源: 旧版 interpreter BEHAVIOR_FIELDS, 与 wiki behaviors 文档一致)
  // spec: [path, 'text'|'number'|'bool'|'lines'|'select'|'json']
  function _bh(list) {
    return (list || []).map(function (spec) {
      var p = spec[0], t = spec[1];
      if (p === 'conditions') return f(p, p, p, 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') });
      if (p === 'sounds' && t === 'json') {
        var skeys = spec[2] ? String(spec[2]).split(',') : null;
        return f(p, p, p, 'popup', { content: skeys ? soundObject(skeys) : BLOCK_SOUND_OBJECT, label: l('音效', 'Sounds') });
      }
      if (t === 'number') return f(p, p, p, 'number');
      if (t === 'bool') return f(p, p, p, 'bool');
      if (t === 'lines') return f(p, p, p, 'lines');
      if (t === 'select') return f(p, p, p, 'select', { options: spec[2] || [] });
      if (t === 'json') return f(p, p, p, 'kv');
      return f(p, p, p, 'text');
    });
  }

  // ---- 通用小块 ----
  var CRAFT_REMAINDER_TYPES = {
    fixed: { label: l('固定物品 (fixed)', 'Fixed Item'), fields: [f('item', '物品', 'Item', 'text', { datalist: 'items' }), f('count', '数量', 'Count', 'number')] },
    hurt_and_break: { label: l('损坏并破碎 (hurt_and_break)', 'Hurt And Break'), fields: [f('damage', '耐久消耗', 'Damage', 'number', { hint: l('消耗的耐久度', 'Durability consumed') })] },
    recipe_based: { label: l('基于配方 (recipe_based)', 'Recipe Based'), fields: [f('terms', '条款', 'Terms', 'listOf', { itemType: { type: 'object', fields: [
      f('recipes', '配方', 'Recipes', 'lines', { hint: l('每行一个配方 ID', 'One recipe ID per line') }),
      f('craft_remainder', '合成残留', 'Craft Remainder', 'union', { allowScalar: { type: 'text', datalist: 'items' }, types: CRAFT_REMAINDER_TYPES_REF, label: l('合成残留', 'Craft Remainder') }),
    ], label: l('条款', 'Term') }, label: l('条款', 'Terms') })] },
    same: { label: l('相同物品 (same)', 'Same Item') },
  };
  function CRAFT_REMAINDER_TYPES_REF() { return CRAFT_REMAINDER_TYPES; }
  var ROTATION_TYPES = {
    quaternion: { label: l('四元数 (quaternion)', 'Quaternion'), fields: [f('quaternion', '四元数', 'Quaternion', 'lines', { hint: l('4 个数, 每行一个', '4 numbers, one per line') })] },
    axis_angle: { label: l('轴角 (axis_angle)', 'Axis Angle'), fields: [f('axis', '轴', 'Axis', 'text'), f('angle', '角度', 'Angle', 'number')] },
  };
  var TRANSFORM_TYPES = {
    decomposed: { label: l('分解 (decomposed)', 'Decomposed'), fields: [
      f('rotation', '旋转', 'Rotation', 'lines', { hint: l('3 个数, 每行一个', '3 numbers, one per line') }),
      f('translation', '平移', 'Translation', 'lines', { hint: l('3 个数, 每行一个', '3 numbers, one per line') }),
      f('scale', '缩放', 'Scale', 'lines', { hint: l('3 个数, 每行一个', '3 numbers, one per line') }),
      f('left_rotation', '左旋转', 'Left Rotation', 'union', { types: ROTATION_TYPES, label: l('左旋转', 'Left Rotation') }),
      f('right_rotation', '右旋转', 'Right Rotation', 'union', { types: ROTATION_TYPES, label: l('右旋转', 'Right Rotation') }),
    ] },
    matrix: { label: l('矩阵 (matrix)', 'Matrix'), widget: { type: 'lines', label: l('矩阵', 'Matrix'), hint: l('16 个数, 每行一个', '16 numbers, one per line') } },
  };
  // 方块状态: 字符串 或 键值映射 (item data.block_state / block 相关)
  var BLOCK_STATE_WIDGET = {
    type: 'union', noTypeKey: true, allowScalar: { type: 'text', placeholder: l('default:palm_sapling[stage=0]', 'default:palm_sapling[stage=0]') },
    label: l('方块状态', 'Block State'),
    types: {
      map: { label: l('属性映射', 'Property Map'), widget: { type: 'mapOf', valueType: { type: 'string-scalar' }, label: l('属性映射', 'Property Map') } },
    },
  };

  // ---- data 组件 (wiki item/data.mdx) ----
  var LORE_LINE_TYPES = {
    advanced: { label: l('高级 (advanced)', 'Advanced'), fields: [
      f('content', '内容', 'Content', 'text', { mini: true }),
      f('priority', '优先级', 'Priority', 'number'),
      f('operation', '操作', 'Operation', 'select', { options: ['APPEND', 'PREPEND'] }),
      f('split_lines', '按行拆分', 'Split Lines', 'bool'),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
    ] },
    simple: { label: l('简单文本', 'Simple Text'), widget: { type: 'text', mini: true } },
  };
  var LORE_LINE_UNION = { type: 'union', noTypeKey: true, allowScalar: { type: 'text', mini: true }, label: l('Lore 行', 'Lore Line'), types: LORE_LINE_TYPES };
  // insert_lore (wiki): {position, pattern, lore, fallback{position, lore}}
  var INSERT_LORE_FIELDS = [
    f('position', '位置', 'Position', 'select', { options: ['HEAD', 'TAIL', 'BEFORE', 'AFTER'] }),
    f('pattern', '匹配行', 'Pattern', 'text', { hint: l('BEFORE/AFTER 时匹配的行 (正则)', 'Line matched for BEFORE/AFTER (regex)') }),
    f('lore', '插入内容', 'Insert', 'listOf', { itemType: LORE_LINE_UNION, label: l('插入内容', 'Insert') }),
    f('fallback', '未匹配回退', 'Fallback', 'object', { fields: [
      f('position', '位置', 'Position', 'select', { options: ['HEAD', 'TAIL', 'BEFORE', 'AFTER'] }),
      f('lore', '插入内容', 'Insert', 'listOf', { itemType: LORE_LINE_UNION, label: l('插入内容', 'Insert') }),
    ], label: l('未匹配回退', 'Fallback') }),
  ];
  var CUSTOM_MODEL_DATA_TYPES = {
    map: { label: l('详细 (floats/flags/strings)', 'Detailed'), widget: { type: 'object', fields: [
      f('floats', '浮点数', 'Floats', 'lines'),
      f('flags', '旗标', 'Flags', 'lines'),
      f('strings', '字符串', 'Strings', 'lines'),
    ] } },
  };
  var CUSTOM_MODEL_DATA_UNION = { type: 'union', noTypeKey: true, allowScalar: { type: 'scalar' }, label: l('Custom Model Data', 'Custom Model Data'), types: CUSTOM_MODEL_DATA_TYPES };
  var PROFILE_TYPES = {
    map: { label: l('字段', 'Fields'), widget: { type: 'object', fields: [
      f('name', '玩家名', 'Player Name', 'text'),
      f('texture', '纹理 URL', 'Texture URL', 'text'),
      f('url', '皮肤 URL', 'Skin URL', 'text'),
      f('base64', 'Base64', 'Base64', 'text'),
    ] } },
  };
  var PROFILE_UNION = { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('皮肤', 'Profile'), types: PROFILE_TYPES };
  var WRITTEN_PAGE_TYPES = {
    lines: { label: l('多行文本', 'Lines'), widget: { type: 'lines', label: l('文本', 'Text') } },
    raw_filtered: { label: l('原始过滤 (raw_filtered)', 'Raw Filtered'), widget: { type: 'object', fields: [
      f('raw', '原始文本', 'Raw', 'text'),
      f('filtered', '过滤后文本', 'Filtered', 'text'),
    ], label: l('原始过滤', 'Raw Filtered') } },
  };
  var WRITTEN_PAGE_UNION = { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('页', 'Page'), types: WRITTEN_PAGE_TYPES };
  var ATTR_MOD_FIELDS = [
    f('type', '属性', 'Attribute', 'text', { hint: l('如 minecraft:max_health', 'e.g. minecraft:max_health') }),
    f('amount', '数值', 'Amount', 'number'),
    f('operation', '操作', 'Operation', 'select', { options: S.constants.enchantOperations }),
    f('id', 'ID', 'ID', 'text'),
    f('slot', '槽位', 'Slot', 'select', { options: S.constants.equipmentSlots }),
  ];
  var FOOD_EFFECT_FIELDS = [
    f('effect', '效果', 'Effect', 'text', { hint: l('如 minecraft:speed', 'e.g. minecraft:speed') }),
    f('probability', '概率', 'Probability', 'number'),
    f('duration', '时长 (tick)', 'Duration', 'number'),
    f('amplifier', '等级', 'Amplifier', 'number'),
    f('ambient', '环境', 'Ambient', 'bool'),
    f('show_particles', '显示粒子', 'Show Particles', 'bool'),
    f('show_icon', '显示图标', 'Show Icon', 'bool'),
  ];
  var FOOD_FIELDS = [
    f('nutrition', '营养', 'Nutrition', 'number'),
    f('saturation', '饱和度', 'Saturation', 'number'),
    f('can_always_eat', '随时可吃', 'Can Always Eat', 'bool'),
    f('eat_seconds', '进食时间 (秒)', 'Eat Seconds', 'number'),
    f('using_converts_to', '食用后得到', 'Using Converts To', 'text', { datalist: 'items' }),
    f('effects', '效果', 'Effects', 'listOf', { itemType: { type: 'object', fields: FOOD_EFFECT_FIELDS, label: l('效果', 'Effect') }, label: l('效果', 'Effects') }),
  ];
  var EQUIPPABLE_FIELDS = [
    f('slot', '槽位', 'Slot', 'select', { options: S.constants.equipmentSlots }),
    f('model', '模型', 'Model', 'text', { hint: l('如 minecraft:item/elytra', 'e.g. minecraft:item/elytra') }),
    f('camera_overlay', '相机覆盖', 'Camera Overlay', 'text'),
    f('allowed_entities', '允许实体', 'Allowed Entities', 'lines'),
    f('dispensable', '可发射', 'Dispensable', 'bool'),
    f('swappable', '可替换', 'Swappable', 'bool'),
    f('equip_sound', '装备音效', 'Equip Sound', 'text', { hint: l('如 minecraft:item.armor.equip_elytra', 'e.g. minecraft:item.armor.equip_elytra') }),
    f('asset_id', '资源 ID', 'Asset ID', 'text'),
    f('damage_on_hurt', '受击损耗', 'Damage On Hurt', 'bool'),
    f('equip_on_interact', '交互穿戴', 'Equip On Interact', 'bool'),
  ];
  var WRITTEN_BOOK_FIELDS = [
    f('pages', '页', 'Pages', 'listOf', { itemType: WRITTEN_PAGE_UNION, label: l('页', 'Pages') }),
    f('author', '作者', 'Author', 'text'),
    f('title', '标题', 'Title', 'text'),
    f('resolved', '已解析', 'Resolved', 'bool'),
    f('generation', '版本', 'Generation', 'select', { options: S.constants.bookGenerations }),
  ];
  var JUKEPLAYABLE_FIELDS = [
    f('song', '歌曲', 'Song', 'text', { hint: l('如 minecraft:cat', 'e.g. minecraft:cat') }),
    f('show_in_tooltip', '显示在提示中', 'Show In Tooltip', 'bool'),
  ];
  // ---- item data 六类分组 (wiki item/data.mdx): 外观/行为/存储/外部/数据组件/客户端数据 ----
  var EXTERNAL_FIELDS = [
    f('plugin', '插件', 'Plugin', 'text', { hint: l('数据来源插件 (或 source), 如 neigeitems', 'Source plugin (or "source"), e.g. neigeitems') }),
    f('id', '物品 ID', 'Item ID', 'text'),
  ];
  var REMOVE_LORE_TYPES = {
    text: { label: l('正则', 'Regex'), widget: { type: 'text', hint: l('移除匹配的行 (正则)', 'Lines to remove (regex)') } },
    object: { label: l('详细 (pattern/count/regex)', 'Detailed'), widget: { type: 'object', fields: [
      f('pattern', '匹配行', 'Pattern', 'text'),
      f('count', '数量', 'Count', 'number', { hint: l('移除的行数, 默认 1', 'Lines to remove, default 1') }),
      f('regex', '正则匹配', 'Regex', 'bool'),
    ], label: l('移除 Lore', 'Remove Lore') } },
  };
  var REMOVE_LORE_UNION = { type: 'union', noTypeKey: true, label: l('移除 Lore', 'Remove Lore'), types: REMOVE_LORE_TYPES };
  var DYED_COLOR_TYPES = {
    text: { label: l('颜色 (r,g,b)', 'Color'), widget: { type: 'text', placeholder: l('255,128,64', '255,128,64') } },
    object: { label: l('详细 (rgb/show_in_tooltip)', 'Detailed'), widget: { type: 'object', fields: [
      f('rgb', '颜色', 'RGB', 'text', { placeholder: l('#FF0000', '#FF0000') }),
      f('show_in_tooltip', '显示在提示中', 'Show In Tooltip', 'bool'),
    ], label: l('染色', 'Dyed Color') } },
  };
  var DYED_COLOR_UNION = { type: 'union', noTypeKey: true, label: l('染色', 'Dyed Color'), types: DYED_COLOR_TYPES };
  var UNBREAKABLE_TYPES = {
    bool: { label: l('布尔', 'Boolean'), widget: { type: 'bool' } },
    object: { label: l('详细 (show_in_tooltip)', 'Detailed'), widget: { type: 'object', fields: [
      f('show_in_tooltip', '显示在提示中', 'Show In Tooltip', 'bool'),
    ], label: l('不可破坏', 'Unbreakable') } },
  };
  var UNBREAKABLE_UNION = { type: 'union', noTypeKey: true, label: l('不可破坏', 'Unbreakable'), types: UNBREAKABLE_TYPES };
  var USE_REMAINDER_TYPES = {
    text: { label: l('物品 ID', 'Item ID'), widget: { type: 'text', datalist: 'items' } },
    object: { label: l('详细 (id/count)', 'Detailed'), widget: { type: 'object', fields: [
      f('id', '物品 ID', 'Item ID', 'text', { datalist: 'items' }),
      f('count', '数量', 'Count', 'number', { hint: l('默认 1', 'Default 1') }),
    ], label: l('使用剩余', 'Use Remainder') } },
  };
  var USE_REMAINDER_UNION = { type: 'union', noTypeKey: true, label: l('使用剩余', 'Use Remainder'), types: USE_REMAINDER_TYPES };
  var JUKEBOX_TYPES = {
    text: { label: l('歌曲 ID', 'Song ID'), widget: { type: 'text', hint: l('如 default:credits_music', 'e.g. default:credits_music') } },
    object: { label: l('详细 (song/show_in_tooltip)', 'Detailed'), widget: { type: 'object', fields: JUKEPLAYABLE_FIELDS, label: l('唱片', 'Jukebox Playable') } },
  };
  var JUKEBOX_UNION = { type: 'union', noTypeKey: true, label: l('唱片', 'Jukebox Playable'), types: JUKEBOX_TYPES };
  // 外观
  var ITEM_APPEARANCE_TYPES = {
    item_name: { label: l('物品名 (item_name)', 'Item Name'), widget: { type: 'text', label: l('物品名', 'Item Name'), mini: true } },
    custom_name: { label: l('自定义名 (custom_name)', 'Custom Name'), widget: { type: 'text', label: l('自定义名', 'Custom Name'), mini: true } },
    lore: { label: l('Lore', 'Lore'), widget: { type: 'union', noTypeKey: true, defaultKey: 'simple', keepKey: true, label: l('Lore', 'Lore'), types: {
      simple: { label: l('普通定义', 'Simple'), widget: { type: 'lines', label: l('Lore', 'Lore'), mini: true, hint: l('每行一条描述文本', 'One line each') } },
      complex: { label: l('复杂定义', 'Complex'), widget: { type: 'listOf', itemType: LORE_LINE_UNION, label: l('Lore', 'Lore') } },
    } } },
    insert_lore: { label: l('插入 Lore (insert_lore)', 'Insert Lore'), widget: { type: 'object', fields: INSERT_LORE_FIELDS, label: l('插入 Lore', 'Insert Lore') } },
    remove_lore: { label: l('移除 Lore (remove_lore)', 'Remove Lore'), widget: REMOVE_LORE_UNION },
    tooltip_style: { label: l('提示样式 (tooltip_style)', 'Tooltip Style'), widget: { type: 'text', label: l('提示样式', 'Tooltip Style'), hint: l('如 minecraft:missing', 'e.g. minecraft:missing') } },
    hide_tooltip: { label: l('隐藏提示 (hide_tooltip)', 'Hide Tooltip'), widget: { type: 'lines', label: l('隐藏提示', 'Hide Tooltip'), hint: l('每行一个组件名, 如 dyed_color', 'One component name per line, e.g. dyed_color') } },
    dyed_color: { label: l('染色 (dyed_color)', 'Dyed Color'), widget: DYED_COLOR_UNION },
    trim: { label: l('饰纹 (trim)', 'Trim'), widget: { type: 'object', fields: [
      f('pattern', '图案', 'Pattern', 'text'),
      f('material', '材料', 'Material', 'text'),
    ], label: l('饰纹', 'Trim') } },
    custom_model_data: { label: l('Custom Model Data', 'Custom Model Data'), widget: { type: 'number', label: l('Custom Model Data', 'Custom Model Data'), hint: l('仅设组件值, 不绑定模型', 'Sets the component only, no model binding') } },
    item_model: { label: l('物品模型 (item_model)', 'Item Model'), widget: { type: 'text', label: l('物品模型', 'Item Model'), hint: l('仅设组件值, 不生成模型', 'Sets the component only, no model generation') } },
    profile: { label: l('皮肤 (profile)', 'Profile'), widget: PROFILE_UNION },
  };
  // 行为
  var ITEM_DATA_BEHAVIOR_TYPES = {
    food: { label: l('食物 (food)', 'Food'), widget: { type: 'object', fields: FOOD_FIELDS, label: l('食物', 'Food') } },
    equippable: { label: l('可装备 (equippable)', 'Equippable'), widget: { type: 'object', fields: EQUIPPABLE_FIELDS, label: l('可装备', 'Equippable') } },
    use_remainder: { label: l('使用剩余 (use_remainder)', 'Use Remainder'), widget: USE_REMAINDER_UNION },
    unbreakable: { label: l('不可破坏 (unbreakable)', 'Unbreakable'), widget: UNBREAKABLE_UNION },
    max_damage: { label: l('最大耐久 (max_damage)', 'Max Damage'), widget: { type: 'number', label: l('最大耐久', 'Max Damage') } },
    attribute_modifiers: { label: l('属性修饰 (attribute_modifiers)', 'Attribute Modifiers'), widget: { type: 'listOf', itemType: { type: 'object', fields: ATTR_MOD_FIELDS, label: l('修饰', 'Modifier') }, label: l('属性修饰', 'Attribute Modifiers') } },
    enchantment: { label: l('附魔 (enchantment)', 'Enchantment'), widget: { type: 'union', noTypeKey: true, label: l('附魔', 'Enchantment'), types: {
      map: { label: l('附魔映射', 'Enchantment Map'), widget: { type: 'mapOf', valueType: { type: 'scalar' }, label: l('附魔映射', 'Enchantments'), hint: l('键: 附魔 ID, 值: 等级 (如 minecraft:sharpness: 3)', 'Key: enchantment id, value: level (e.g. minecraft:sharpness: 3)') } },
      merge: { label: l('合并附魔 (merge)', 'Merge'), widget: { type: 'object', fields: [
        f('merge', '合并', 'Merge', 'bool', { hint: l('与已有附魔合并', 'Merge with existing enchantments') }),
        f('enchantments', '附魔', 'Enchantments', 'mapOf', { valueType: { type: 'scalar' }, label: l('附魔', 'Enchantments'), hint: l('键: 附魔 ID, 值: 等级', 'Key: enchantment id, value: level') }),
      ], label: l('合并附魔', 'Merge') } },
    } } },
    painting_variant: { label: l('画变体 (painting_variant)', 'Painting Variant'), widget: { type: 'text', label: l('画变体', 'Painting Variant') } },
    jukebox_playable: { label: l('唱片 (jukebox_playable)', 'Jukebox Playable'), widget: JUKEBOX_UNION },
    block_state: { label: l('方块状态 (block_state)', 'Block State'), widget: BLOCK_STATE_WIDGET },
  };
  // 存储数据
  var ITEM_STORAGE_TYPES = {
    pdc: { label: l('持久数据 (pdc)', 'PDC'), widget: { type: 'kv', label: l('持久数据', 'PDC'), hint: l('供其他插件读取的键值', 'Key-value data for other plugins') } },
    tags: { label: l('标签 (tags)', 'Tags'), widget: { type: 'kv', label: l('标签', 'Tags'), hint: l('键: 标签名, 值: 值 (@ 前缀展平嵌套)', 'Key: tag name, value: value (@ prefix flattens nesting)') } },
    nbt: { label: l('NBT', 'NBT'), widget: { type: 'kv', label: l('NBT', 'NBT') } },
    written_book_content: { label: l('成书内容 (written_book_content)', 'Written Book Content'), widget: { type: 'object', fields: WRITTEN_BOOK_FIELDS, label: l('成书内容', 'Written Book Content') } },
  };
  // 外部数据
  var ITEM_EXTERNAL_TYPES = {
    external: { label: l('外部 (external)', 'External'), widget: { type: 'object', fields: EXTERNAL_FIELDS, label: l('外部', 'External') } },
  };
  // 数据组件 (只有真实 MC 组件)
  var ITEM_COMPONENTS_TYPES = {
    components: { label: l('组件映射 (components)', 'Components'), widget: { type: 'kv', label: l('组件映射', 'Components'), hint: l('真实 MC 组件, 如 minecraft:max_damage: 128', 'Real vanilla components, e.g. minecraft:max_damage: 128') } },
    remove_components: { label: l('移除组件 (remove_components)', 'Remove Components'), widget: { type: 'lines', label: l('移除组件', 'Remove Components') } },
  };
  // 客户端数据 = 五类全部 + conditional 条件块 (函数延迟避免循环)
  function _itemClientTypes() {
    var out = {};
    var groups = [ITEM_APPEARANCE_TYPES, ITEM_DATA_BEHAVIOR_TYPES, ITEM_STORAGE_TYPES, ITEM_EXTERNAL_TYPES, ITEM_COMPONENTS_TYPES];
    for (var g = 0; g < groups.length; g++) {
      var src = groups[g];
      for (var k in src) out[k] = src[k];
    }
    out.conditional = { label: l('条件数据 (conditional)', 'Conditional'), widget: { type: 'object', fields: CONDITIONAL_FIELDS, label: l('条件数据', 'Conditional') } };
    return out;
  }
  function ITEM_CLIENT_TYPES_REF() { return _itemClientTypes(); }
  // 字典 → tabs 字段列表
  function _sfTypesToFields(types) {
    var out = [];
    for (var k in types) {
      var w = {};
      for (var kk in types[k].widget) w[kk] = types[k].widget[kk];
      w.key = k;
      w.label = types[k].label;
      out.push(w);
    }
    return out;
  }
  // 五类子选项卡 (外观/行为/存储/外部/数据组件); conditional.data 复用, 不含客户端数据防递归
  var ITEM_DATA_TABS_FIVE = [
    { key: 'appearance', label: l('外观', 'Appearance'), fields: _sfTypesToFields(ITEM_APPEARANCE_TYPES) },
    { key: 'behavior', label: l('行为', 'Behavior'), fields: _sfTypesToFields(ITEM_DATA_BEHAVIOR_TYPES) },
    { key: 'storage', label: l('存储数据', 'Stored Data'), fields: _sfTypesToFields(ITEM_STORAGE_TYPES) },
    { key: 'external', label: l('外部数据', 'External Data'), fields: _sfTypesToFields(ITEM_EXTERNAL_TYPES) },
    { key: 'components', label: l('数据组件', 'Data Components'), fields: _sfTypesToFields(ITEM_COMPONENTS_TYPES) },
  ];
  // data 六类 = 五类 + 客户端数据 (bind 根级 client_bound_data, components 直接添加 + 条件块)
  var ITEM_DATA_TABS_SIX = ITEM_DATA_TABS_FIVE.concat([
    { key: 'client', label: l('客户端数据', 'Client Data'), bind: 'client_bound_data', widget: { type: 'components', components: ITEM_CLIENT_TYPES_REF, conditionKey: 'conditional', label: l('客户端数据', 'Client Data') } },
  ]);
  var CONDITIONAL_FIELDS = [
    f('data', '数据', 'Data', 'tabs', { tabs: ITEM_DATA_TABS_FIVE, label: l('数据', 'Data'), hint: l('条件满足时应用的数据', 'Data applied when conditions pass') }),
    f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
  ];
  // item 根级键风格: snake (新版下划线) / kebab (旧版短横线), CE 两种都支持
  var ITEM_KEY_STYLE = {
    custom_model_data: { snake: 'custom_model_data', kebab: 'custom-model-data' },
    client_bound_material: { snake: 'client_bound_material', kebab: 'client-bound-material' },
    client_bound_data: { snake: 'client_bound_data', kebab: 'client-bound-data' },
  };

  // ---- 模型 (wiki item/models.mdx + models/ 子文档) ----
  // 简化模型
  var MODEL_SIMPLIFIED_FIELDS = [
    f('texture', '纹理', 'Texture', 'text', { hint: l('如 minecraft:item/custom/xxx', 'e.g. minecraft:item/custom/xxx') }),
    f('textures', '纹理映射', 'Textures', 'mapOf', { valueType: { type: 'text' }, label: l('纹理映射', 'Textures') }),
    f('models', '模型映射', 'Models', 'mapOf', { valueType: { type: 'text' }, label: l('模型映射', 'Models') }),
    f('blueprint', '蓝图', 'Blueprint', 'text'),
    f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
  ];
  // 旧版模型 (1.21.4 前兼容, 条目根级字段, wiki item/models.mdx#legacy-model)
  var LEGACY_MODEL_FIELDS = [
    f('path', '模型路径', 'Path', 'text', { hint: l('如 minecraft:item/custom/rod', 'e.g. minecraft:item/custom/rod') }),
    f('generation', '自动生成', 'Generation', 'object', { fields: [
      f('parent', '父模板', 'Parent', 'text', { hint: l('如 minecraft:item/fishing_rod', 'e.g. minecraft:item/fishing_rod') }),
      f('textures', '纹理变量', 'Textures', 'mapOf', { valueType: { type: 'text' }, label: l('纹理变量', 'Textures') }),
    ], label: l('自动生成', 'Generation') }),
    f('overrides', '覆盖', 'Overrides', 'listOf', { itemType: { type: 'object', fields: [
      f('path', '模型路径', 'Path', 'text'),
      f('predicate', '谓词', 'Predicate', 'kv', { hint: l('如 cast: 1', 'e.g. cast: 1') }),
    ], label: l('覆盖', 'Override') }, label: l('覆盖', 'Overrides') }),
  ];
  // 特殊模型 (special 类型体, wiki item/models/special.mdx)
  var SPECIAL_MODEL_TYPES = {
    'minecraft:head': { label: l('头颅 (head)', 'Head'), fields: [
      f('kind', '类型', 'Kind', 'select', { options: ['skeleton', 'wither_skeleton', 'player', 'zombie', 'creeper', 'piglin', 'dragon'], hint: l('skeleton | wither_skeleton | player | zombie | creeper | piglin | dragon', 'skeleton | wither_skeleton | player | zombie | creeper | piglin | dragon') }),
      f('texture', '纹理', 'Texture', 'text', { hint: l('可选, 默认按类型; 省略 textures/entity/ 前缀与 .png 后缀', 'Optional, defaults per kind; omits textures/entity/ prefix and .png suffix') }),
      f('animation', '动画', 'Animation', 'number', { hint: l('龙下巴: -2.5 (闭合) ~ 2.5 (张开); 猪灵耳朵摆动', 'Dragon jaw: -2.5 (closed) to 2.5 (open); piglin ear wiggle') }),
    ] },
    'minecraft:player_head': { label: l('玩家头颅 (player_head)', 'Player Head'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('1.21.6+; 使用 minecraft:profile 组件作为皮肤纹理, 无额外字段', '1.21.6+; uses the minecraft:profile component for the skin, no extra fields') }),
    ] },
    'minecraft:chest': { label: l('箱子 (chest)', 'Chest'), fields: [
      f('texture', '纹理', 'Texture', 'text', { hint: l('chests 图集中的路径, 无 .png 后缀', 'Path in the chests atlas, no .png suffix') }),
      f('chest_type', '箱子类型', 'Chest Type', 'select', { options: ['single', 'left', 'right'], hint: l('"single" | "left" | "right" (26.1+)', '"single" | "left" | "right" (26.1+)') }),
      f('openness', '开启程度', 'Openness', 'number', { hint: l('0.0 (关闭) ~ 1.0 (开启)', '0.0 (closed) to 1.0 (open)') }),
    ] },
    'minecraft:shulker_box': { label: l('潜影盒 (shulker_box)', 'Shulker Box'), fields: [
      f('texture', '纹理', 'Texture', 'text', { hint: l('shulker 图集中的路径, 无 .png 后缀', 'Path in the shulker atlas, no .png suffix') }),
      f('openness', '开启程度', 'Openness', 'number', { hint: l('0.0 (关闭) ~ 1.0 (开启)', '0.0 (closed) to 1.0 (open)') }),
    ] },
    'minecraft:shield': { label: l('盾牌 (shield)', 'Shield'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('读取 minecraft:banner_patterns 与 minecraft:base_color 组件, 无额外字段', 'Reads minecraft:banner_patterns and minecraft:base_color components, no extra fields') }),
    ] },
    'minecraft:banner': { label: l('旗帜 (banner)', 'Banner'), fields: [
      f('color', '颜色', 'Color', 'select', { options: S.constants.bannerColors, hint: l('必填, 16 色之一', 'Required, one of 16 colors') }),
      f('attachment', '附着方式', 'Attachment', 'select', { options: ['ground', 'wall'], hint: l('26.1+; 地面或墙面', '"ground" | "wall" (26.1+)') }),
    ] },
    'minecraft:trident': { label: l('三叉戟 (trident)', 'Trident'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('渲染三叉戟, 无额外字段', 'Renders a trident, no extra fields') }),
    ] },
    'minecraft:conduit': { label: l('潮涌核心 (conduit)', 'Conduit'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('渲染潮涌核心, 无额外字段', 'Renders a conduit, no extra fields') }),
    ] },
    'minecraft:decorated_pot': { label: l('饰纹陶罐 (decorated_pot)', 'Decorated Pot'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('读取 minecraft:pot_decorations 组件, 无额外字段', 'Reads the minecraft:pot_decorations component, no extra fields') }),
    ] },
    'minecraft:bell': { label: l('钟 (bell)', 'Bell'), fields: [
      f('note', '说明', 'Note', 'text', { hint: l('26.1+; 渲染动画钟的方块部分, 无额外字段', '26.1+; renders the animated bell block part, no extra fields') }),
    ] },
    'minecraft:book': { label: l('书 (book)', 'Book'), fields: [
      f('open_angle', '打开角度', 'Open Angle', 'number', { hint: l('0 = 关闭, 90 = 平铺', '0 = closed, 90 = flat') }),
      f('page1', '第 1 页进度', 'Page 1', 'number', { hint: l('翻页进度 0.0~1.0', 'Page turn progress 0.0-1.0') }),
      f('page2', '第 2 页进度', 'Page 2', 'number', { hint: l('翻页进度 0.0~1.0', 'Page turn progress 0.0-1.0') }),
    ] },
    'minecraft:end_cube': { label: l('末地立方 (end_cube)', 'End Cube'), fields: [
      f('effect', '效果', 'Effect', 'select', { options: ['portal', 'gateway'], hint: l('portal = 末地传送门, gateway = 末地折跃门', '"portal" | "gateway"') }),
    ] },
    'minecraft:copper_golem_statue': { label: l('铜傀儡雕像 (copper_golem_statue)', 'Copper Golem Statue'), fields: [
      f('pose', '姿态', 'Pose', 'select', { options: ['standing', 'sitting', 'running', 'star'], hint: l('standing | sitting | running | star', '"standing" | "sitting" | "running" | "star"') }),
      f('texture', '纹理', 'Texture', 'text', { hint: l('完整路径, 需要 .png 后缀', 'Full path, .png suffix required') }),
    ] },
  };
  // 模型树节点 (8 种, 递归引用自身 → 注册 + 函数延迟)
  // 注意: 必须先于 SPECIAL_MODEL_TYPES 定义 (其 minecraft:composite 直接引用 MODEL_TREE_REF)
  var MODEL_TREE_TYPES = {
    'minecraft:model': { label: l('模型 (minecraft:model)', 'Model'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:model'] }),
      f('path', '模型路径', 'Path', 'text', { hint: l('模型 JSON 的命名空间路径 (如 demo:item/sword); 设置 blueprint 时可省略, 作为生成模型的输出路径', 'Namespaced path to the model JSON (e.g. demo:item/sword); optional with blueprint, then used as the output path') }),
      f('generation', '自动生成', 'Generation', 'object', { hint: l('从父模板自动生成模型 JSON, 无需模型文件', 'Auto-generate the model JSON from a parent template'), fields: [
        f('parent', '父模板', 'Parent', 'text', { hint: l('必填, 如 minecraft:item/handheld', 'Required, e.g. minecraft:item/handheld') }),
        f('textures', '纹理变量', 'Textures', 'mapOf', { valueType: { type: 'text' }, label: l('纹理变量', 'Textures'), hint: l('layer0/layer1 等变量覆盖', 'Texture variable overrides (layer0, layer1, ...)') }),
        f('display', '显示变换', 'Display', 'object', { hint: l('各场景显示变换 (thirdperson_righthand/gui/ground/fixed/head...)', 'Per-context display transforms (thirdperson_righthand, gui, ground, fixed, head, ...)'), fields: [
          f('thirdperson_righthand', '第三人称右手', 'Third Person Right Hand', 'text', { hint: l('rotation/translation/scale', 'rotation/translation/scale') }),
          f('gui', 'GUI', 'GUI', 'text'),
          f('ground', '地面', 'Ground', 'text'),
          f('fixed', '固定', 'Fixed', 'text'),
          f('head', '头部', 'Head', 'text'),
          f('firstperson_righthand', '第一人称右手', 'First Person Right Hand', 'text'),
        ] }),
        f('gui_light', 'GUI 光照', 'Gui Light', 'select', { options: ['front', 'side'] }),
      ] }),
      f('blueprint', '蓝图', 'Blueprint', 'text', { hint: l('Blockbench .bbmodel 文件 (blueprint 文件夹, 相对路径, 扩展名可省略); 打包时自动转换为模型 JSON', 'Blockbench .bbmodel file converted into the model JSON (experimental)') }),
      f('tints', '色调', 'Tints', 'listOf', { itemType: { type: 'object', fields: [
        f('type', '类型', 'Type', 'select', { options: ['minecraft:constant', 'minecraft:dye', 'minecraft:firework', 'minecraft:grass', 'minecraft:map_color', 'minecraft:potion', 'minecraft:team', 'minecraft:custom_model_data'] }),
        f('value', '值', 'Value', 'text', { hint: l('十进制 (16711680) / RGB 0-255 (255,0,0) / RGB 0.0-1.0 (1.0,0.0,0.0)', 'Decimal / RGB 0-255 / RGB 0.0-1.0') }),
        f('default', '默认色', 'Default', 'text'),
        f('temperature', '温度', 'Temperature', 'number', { hint: l('minecraft:grass 类型: 0.0~1.0 气候采样', 'minecraft:grass: climate sample 0.0-1.0') }),
        f('downfall', '湿度', 'Downfall', 'number', { hint: l('minecraft:grass 类型: 0.0~1.0 气候采样', 'minecraft:grass: climate sample 0.0-1.0') }),
        f('index', '索引', 'Index', 'number', { hint: l('minecraft:custom_model_data 类型: colors 数组位置; 默认 0', 'minecraft:custom_model_data: position in colors array; default 0') }),
      ], label: l('色调', 'Tint') }, label: l('色调', 'Tints') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
    ] },
    'minecraft:composite': { label: l('复合 (minecraft:composite)', 'Composite'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:composite'] }),
      f('models', '子模型', 'Models', 'listOf', { itemType: { type: 'union', types: MODEL_TREE_REF, label: l('子模型', 'Child Model') }, label: l('子模型', 'Models'), hint: l('按顺序渲染的子模型列表', 'List of child item models to render in order') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
    ] },
    'minecraft:condition': { label: l('条件 (minecraft:condition)', 'Condition'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:condition'] }),
      f('property', '属性', 'Property', 'text', { hint: l('布尔属性类型, 如 broken / using_item / custom_model_data', 'Boolean property type, e.g. broken / using_item / custom_model_data') }),
      f('on_true', '为真时', 'On True', 'union', { types: MODEL_TREE_REF, label: l('为真时', 'On True'), hint: l('属性为 true 时使用的模型', 'Model when property is true') }),
      f('on_false', '为假时', 'On False', 'union', { types: MODEL_TREE_REF, label: l('为假时', 'On False'), hint: l('属性为 false 时使用的模型', 'Model when property is false') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
      // 以下为 property 特定附加字段 (仅对应的 property 时生效)
      f('predicate', '组件谓词', 'Component Predicate', 'text', { hint: l('property=minecraft:component (1.21.5+): 谓词类型, 如 minecraft:damage', 'For property minecraft:component (1.21.5+): predicate type, e.g. minecraft:damage') }),
      f('value', '谓词值', 'Predicate Value', 'kv', { hint: l('property=minecraft:component: 谓词值结构随谓词变化', 'For property minecraft:component: structure depends on the predicate') }),
      f('component', '组件', 'Component', 'text', { hint: l('property=minecraft:has_component: 检查存在的组件 ID, 如 minecraft:enchantments', 'For property minecraft:has_component: component ID to check, e.g. minecraft:enchantments') }),
      f('ignore_default', '忽略默认值', 'Ignore Default', 'bool', { hint: l('property=minecraft:has_component: 默认值的组件视为不存在; 默认 false', 'For property minecraft:has_component: treat default-valued components as absent; default false') }),
      f('keybind', '按键绑定', 'Keybind', 'text', { hint: l('property=minecraft:keybind_down: 按住的按键 ID, 如 key.left / key.sprint', 'For property minecraft:keybind_down: keybind ID, e.g. key.left / key.sprint') }),
      f('index', '索引', 'Index', 'number', { hint: l('property=minecraft:custom_model_data: flags 数组位置; 默认 0', 'For property minecraft:custom_model_data: position in flags array; default 0') }),
    ] },
    'minecraft:select': { label: l('选择 (minecraft:select)', 'Select'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:select'] }),
      f('property', '属性', 'Property', 'text', { hint: l('离散属性类型, 如 charge_type / display_context / item_model', 'Discrete property type, e.g. charge_type / display_context / item_model') }),
      f('cases', '分支', 'Cases', 'listOf', { itemType: { type: 'object', fields: [
        f('when', '条件', 'When', 'text', { hint: l('值或值列表 (区分大小写)', 'Value or list of values (case-sensitive)') }),
        f('model', '模型', 'Model', 'union', { types: MODEL_TREE_REF, label: l('模型', 'Model') }),
      ], label: l('分支', 'Case') }, label: l('分支', 'Cases') }),
      f('fallback', '回退', 'Fallback', 'union', { types: MODEL_TREE_REF, label: l('回退', 'Fallback'), hint: l('无分支匹配时使用; 省略渲染为空', 'Model when no case matches; omitted renders as empty') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
      // 以下为 property 特定附加字段 (仅对应的 property 时生效)
      f('block_state_property', '方块状态属性', 'Block State Property', 'text', { hint: l('property=minecraft:block_state: 读取的方块状态键, 如 facing', 'For property minecraft:block_state: block state key to read, e.g. facing') }),
      f('component', '组件', 'Component', 'text', { hint: l('property=minecraft:component (1.21.5+): 读取的组件 ID, 如 minecraft:unbreakable', 'For property minecraft:component (1.21.5+): component ID, e.g. minecraft:unbreakable') }),
      f('index', '索引', 'Index', 'number', { hint: l('property=minecraft:custom_model_data: strings 数组位置; 默认 0', 'For property minecraft:custom_model_data: position in strings array; default 0') }),
      f('pattern', '时间格式', 'Time Pattern', 'text', { hint: l('property=minecraft:local_time: ICU 日期时间格式, 如 HH:mm:ss', 'For property minecraft:local_time: ICU date/time pattern, e.g. HH:mm:ss') }),
      f('locale', '区域', 'Locale', 'text', { hint: l('property=minecraft:local_time: 格式化区域; 默认系统', 'For property minecraft:local_time: locale; default system') }),
      f('time_zone', '时区', 'Time Zone', 'text', { hint: l('property=minecraft:local_time: 时区 ID, 如 GMT+8:00; 默认客户端时区', 'For property minecraft:local_time: time zone ID, e.g. GMT+8:00; default client TZ') }),
    ] },
    'minecraft:range_dispatch': { label: l('区间分发 (minecraft:range_dispatch)', 'Range Dispatch'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:range_dispatch'] }),
      f('property', '属性', 'Property', 'text', { hint: l('数值属性类型, 如 damage / custom_model_data', 'Numeric property type, e.g. damage / custom_model_data') }),
      f('scale', '缩放系数', 'Scale', 'number', { hint: l('比较前与属性值相乘的系数; 默认 1.0', 'Multiplier applied to the property value before comparing; default 1.0') }),
      f('entries', '区间', 'Entries', 'listOf', { itemType: { type: 'object', fields: [
        f('threshold', '阈值', 'Threshold', 'number', { hint: l('该模型的最小属性值', 'Minimum property value for this model') }),
        f('model', '模型', 'Model', 'union', { types: MODEL_TREE_REF, label: l('模型', 'Model') }),
      ], label: l('区间', 'Entry') }, label: l('区间', 'Entries') }),
      f('fallback', '回退', 'Fallback', 'union', { types: MODEL_TREE_REF, label: l('回退', 'Fallback'), hint: l('属性低于所有阈值时使用; 默认空', 'Model used when property < all thresholds; default empty') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
      // 以下为 property 特定附加字段 (仅对应的 property 时生效)
      f('target', '目标', 'Target', 'select', { options: ['spawn', 'lodestone', 'recovery', 'none'], hint: l('property=minecraft:compass: 指向目标', 'For property minecraft:compass: target type') }),
      f('wobble', '摆动', 'Wobble', 'bool', { hint: l('compass/time: 指针摆动/平滑振荡; 默认 true', 'For compass/time: simulate wobble/oscillation; default true') }),
      f('normalize', '归一化', 'Normalize', 'bool', { hint: l('count/damage: 除以最大值缩放至 0.0~1.0; 默认 true', 'For count/damage: scale to 0.0-1.0; default true') }),
      f('source', '时间来源', 'Time Source', 'select', { options: ['daytime', 'moon_phase', 'random'], hint: l('property=minecraft:time: daytime (太阳角度) / moon_phase / random', 'For property minecraft:time: daytime (sun angle) / moon_phase / random') }),
      f('remaining', '剩余时间', 'Remaining', 'bool', { hint: l('property=minecraft:use_duration: 返回剩余而非已用 tick; 默认 false', 'For property minecraft:use_duration: return remaining ticks instead of elapsed; default false') }),
      f('index', '索引', 'Index', 'number', { hint: l('property=minecraft:custom_model_data: floats 数组位置; 默认 0', 'For property minecraft:custom_model_data: position in floats array; default 0') }),
    ] },
    'minecraft:special': { label: l('特殊 (minecraft:special)', 'Special'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:special'] }),
      f('base', '基础模型', 'Base', 'text', { hint: l('变换/粒子纹理/GUI 光照的基础模型路径; 设置 blueprint 时可省略, 作为生成模型的输出路径', 'Model path for transforms, particle texture, and GUI light; optional with blueprint') }),
      f('blueprint', '蓝图', 'Blueprint', 'text', { hint: l('Blockbench .bbmodel 文件转换为基础模型 JSON (实验性)', 'Blockbench .bbmodel file converted into the base model JSON (experimental)') }),
      f('model', '特殊模型', 'Special Model', 'union', { types: SPECIAL_MODEL_TYPES, label: l('特殊模型', 'Special Model') }),
      f('transformation', '变换', 'Transformation', 'union', { types: TRANSFORM_TYPES, label: l('变换', 'Transformation') }),
    ] },
    'minecraft:empty': { label: l('空 (minecraft:empty)', 'Empty'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:empty'] }),
    ] },
    'minecraft:bundle/selected_item': { label: l('收纳袋选中物品 (minecraft:bundle/selected_item)', 'Bundle Selected Item'), fields: [
      f('type', '类型', 'Type', 'select', { options: ['minecraft:bundle/selected_item'] }),
      f('note', '说明', 'Note', 'text', { hint: l('渲染收纳袋打开时选中的物品堆叠; 无选中物品则渲染为空; 不支持 transformation', 'Renders the selected item stack when the bundle is open; nothing if none selected; transformation not supported') }),
    ] },
  };
  function MODEL_TREE_REF() { return MODEL_TREE_TYPES; }
  var MODEL_TREE_UNION = { type: 'union', label: l('模型树', 'Model Tree'), types: MODEL_TREE_REF };
  S.itemModelForms = {
    simplified: { type: 'object', fields: MODEL_SIMPLIFIED_FIELDS },
    tree: MODEL_TREE_UNION,
  };

  // ---- 行为 (wiki item/behaviors.mdx + behaviors/ 子文档) ----
  var FURNITURE_RULE_TYPES = {
    map: { label: l('详细规则', 'Detailed'), widget: { type: 'object', fields: [
      f('rotation', '旋转', 'Rotation', 'select', { options: ['any', 'four', 'eight', 'sixteen', 'north', 'east', 'west', 'south'], hint: l('家具可朝向的方向数; 对墙面变体无效', 'How many directions the furniture can face; no effect on wall variants') }),
      f('alignment', '对齐', 'Alignment', 'select', { options: S.constants.alignments, hint: l('家具在方块网格上的对齐方式', 'How the furniture aligns to the block grid') }),
    ] } },
  };
  var INLINE_FURNITURE_SETTINGS = [
    f('item', '物品', 'Item', 'text'),
    f('hit_times', '击打次数', 'Hit Times', 'number'),
    f('sounds', '音效', 'Sounds', 'popup', { content: FURNITURE_SOUND_OBJECT, label: l('音效', 'Sounds') }),
    f('adventure_mode_breaking', '冒险模式可破坏', 'Adventure Mode Breaking', 'bool'),
    f('correct_tools', '正确工具', 'Correct Tools', 'lines'),
  ];
  var INLINE_FURNITURE_FIELDS = [
    f('events', '事件', 'Events', 'events', { custom: 'events' }),
    f('settings', '设置', 'Settings', 'object', { fields: INLINE_FURNITURE_SETTINGS, label: l('设置', 'Settings') }),
    f('variants', '变体', 'Variants', 'popup', { content: function () { return FURNITURE_VARIANTS_MAP; }, label: l('变体', 'Variants') }),
    f('loot', '掉落', 'Loot', 'object', { fields: LOOT_OBJECT_FIELDS, label: l('掉落', 'Loot') }),
    f('behaviors', '行为', 'Behaviors', 'listOf', { itemType: { type: 'union', types: function () { return FURNITURE_BEHAVIOR_TYPES; }, label: l('行为', 'Behavior') }, label: l('行为', 'Behaviors') }),
  ];
  var FURNITURE_ITEM_FIELDS = [
    f('furniture', '家具', 'Furniture', 'union', { noTypeKey: true, allowScalar: { type: 'text' }, label: l('家具', 'Furniture'), types: {
      inline: { label: l('内联家具', 'Inline Furniture'), widget: { type: 'object', fields: INLINE_FURNITURE_FIELDS } },
    } }),
    f('rules', '规则', 'Rules', 'mapOf', { valueType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('规则', 'Rule'), types: FURNITURE_RULE_TYPES }, label: l('规则', 'Rules'), hint: l('键: 变体名; 值: left/center 或详细规则', 'Key: variant; value: left/center or details') }),
    f('ignore_placer', '忽略放置者', 'Ignore Placer', 'bool'),
    f('ignore_entities', '忽略实体', 'Ignore Entities', 'bool'),
    f('against_blocks', '可放置方块', 'Against Blocks', 'lines'),
    f('against_block_tags', '可放置方块标签', 'Against Block Tags', 'lines'),
    f('blacklist', '黑名单', 'Blacklist', 'bool', { hint: l('true = 黑名单模式 (默认), false = 白名单模式', 'true = blacklist mode (default), false = whitelist mode') }),
  ];
  // 内联方块 (block_item.block 内直接定义): 与 block section 同构的选项卡结构 (状态/设置/行为/掉落/自定义)
  // 懒构建: 引用的字段表 (BLOCK_SETTINGS_FIELDS/BLOCK_LOOT_FIELDS/PROPERTY_TYPES/...) 在本文件后面定义
  var INLINE_BLOCK_TABS = null;
  function inlineBlockWidget() {
    if (!INLINE_BLOCK_TABS) {
      INLINE_BLOCK_TABS = {
        type: 'tabs',
        tabs: [
          { key: 'state', label: l('状态', 'State'), fields: [
            f('state', '单状态', 'State', 'popup', { content: { type: 'object', fields: blockAppearanceFields(true), label: l('单状态', 'State') }, label: l('单状态', 'State') }),
            f('states', '多状态', 'States', 'popup', { content: { type: 'object', fields: [
              f('id', '起始 ID', 'Start ID', 'number', { hint: l('固定内部 ID, 变体占用连续区间', 'Fixed internal ID; variants occupy a continuous range') }),
              f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'union', types: PROPERTY_TYPES, label: l('属性', 'Property') }, label: l('属性', 'Properties'), hint: l('属性类型与特殊名称 (axis/facing/waterlogged...) 见 Wiki', 'Property types & special names (axis/facing/waterlogged...) per Wiki') }),
              f('appearances', '外观', 'Appearances', 'mapOf', { valueType: { type: 'object', fields: blockAppearanceFields(false), label: l('外观', 'Appearance') }, label: l('外观', 'Appearances'), hint: l('第一个外观为默认回退', 'First appearance is the default fallback') }),
              f('variants', '变体映射', 'Variants', 'mapOf', { valueType: { type: 'object', fields: [
                f('appearance', '外观', 'Appearance', 'text', { hint: l('对应 appearances 中的名称', 'A name from appearances') }),
                f('settings', '设置覆盖', 'Settings Override', 'object', { fields: BLOCK_SETTINGS_FIELDS, label: l('设置覆盖', 'Settings Override') }),
              ], label: l('变体', 'Variant') }, label: l('变体映射', 'Variants'), hint: l('键: 如 waterlogged=true,facing=north (未列出属性通配)', 'Key: e.g. waterlogged=true,facing=north (unlisted = wildcard)') }),
              f('entity_renderer', '实体渲染器', 'Entity Renderer', 'union', ENTITY_RENDERER_UNION),
              f('entity_culling', '实体剔除', 'Entity Culling', 'union', { noTypeKey: true, allowScalar: { type: 'bool' }, label: l('实体剔除', 'Entity Culling'), types: ENTITY_CULLING_TYPES }),
            ], label: l('多状态', 'States') }, label: l('多状态', 'States') }),
          ]},
          { key: 'settings', label: l('设置', 'Settings'), fields: [
            f('settings', '设置', 'Settings', 'object', { fields: BLOCK_SETTINGS_FIELDS, label: l('设置', 'Settings') }),
          ]},
          { key: 'behavior', label: l('行为', 'Behavior'), fields: [
            f('behavior', '行为', 'Behavior', 'listOf', { itemType: { type: 'union', types: function () { return BLOCK_BEHAVIOR_TYPES; }, label: l('行为', 'Behavior') }, label: l('行为', 'Behavior') }),
            f('behaviors', '组合行为', 'Behaviors', 'listOf', { itemType: { type: 'union', types: function () { return BLOCK_BEHAVIOR_TYPES; }, label: l('行为', 'Behavior') }, label: l('组合行为', 'Behaviors') }),
          ]},
          { key: 'loot', label: l('掉落', 'Loot'), fields: [
            f('loot', '掉落', 'Loot', 'object', { fields: BLOCK_LOOT_FIELDS, label: l('掉落', 'Loot') }),
          ]},
          { key: 'events', label: l('事件', 'Events'), fields: [
            f('events', '事件', 'Events', 'events', { label: l('事件', 'Events') }),
            f('merges', '合并', 'Merges', 'kv'),
            f('overrides', '覆盖', 'Overrides', 'kv'),
          ]},
        ],
      };
    }
    return INLINE_BLOCK_TABS;
  }
  var BLOCK_ITEM_FIELDS = [
    f('block', '方块', 'Block', 'union', { noTypeKey: true, allowScalar: { type: 'text', datalist: 'blocks' }, label: l('方块', 'Block'), types: function () {
      return { inline: { label: l('内联方块', 'Inline Block'), widget: inlineBlockWidget() } };
    } }),
  ];
  var ITEM_BEHAVIOR_TYPES = {
    block_item: { label: l('放置方块 (block_item)', 'Block Item'), fields: BLOCK_ITEM_FIELDS },
    ceiling_block_item: { label: l('顶部方块 (ceiling_block_item)', 'Ceiling Block Item'), fields: BLOCK_ITEM_FIELDS },
    compostable_item: { label: l('可堆肥 (compostable_item)', 'Compostable'), fields: [f('chance', '概率', 'Chance', 'number', { hint: l('0.5 = 50%', '0.5 = 50%') })] },
    double_high_block_item: { label: l('双层方块 (double_high_block_item)', 'Double High Block Item'), fields: BLOCK_ITEM_FIELDS },
    furniture_item: { label: l('放置家具 (furniture_item)', 'Furniture Item'), fields: FURNITURE_ITEM_FIELDS },
    ground_block_item: { label: l('地面方块 (ground_block_item)', 'Ground Block Item'), fields: BLOCK_ITEM_FIELDS },
    liquid_collision_block_item: { label: l('液体碰撞方块 (liquid_collision_block_item)', 'Liquid Collision Block'), fields: [
      f('offset_y', '偏移 Y', 'Offset Y', 'number'),
      f('block', '方块', 'Block', 'union', { noTypeKey: true, allowScalar: { type: 'text', datalist: 'blocks' }, label: l('方块', 'Block'), types: function () {
        return { inline: { label: l('内联方块', 'Inline Block'), widget: inlineBlockWidget() } };
      } }),
    ] },
    liquid_collision_furniture_item: { label: l('液体碰撞家具 (liquid_collision_furniture_item)', 'Liquid Collision Furniture'), fields: FURNITURE_ITEM_FIELDS.concat([
      f('source_only', '仅源方块', 'Source Only', 'bool', { hint: l('仅在液体源方块上放置; 默认 true', 'Only place on liquid source blocks; default true') }),
      f('liquid_type', '液体类型', 'Liquid Type', 'lines'),
    ]) },
    multi_high_block_item: { label: l('多层方块 (multi_high_block_item)', 'Multi High Block Item'), fields: BLOCK_ITEM_FIELDS },
    range_mining_item: { label: l('连锁挖掘 (range_mining_item)', 'Range Mining'), fields: [
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions') }),
      f('range', '范围', 'Range', 'lines', { hint: l('每行一个 宽,高,深 偏移 (如 0,1,0), 自动随朝向旋转', 'One width,height,depth offset per line (e.g. 0,1,0), auto-rotates with facing') }),
    ] },
    wall_block_item: { label: l('墙上方块 (wall_block_item)', 'Wall Block Item'), fields: BLOCK_ITEM_FIELDS },
  };
  // 43+ 个方块行为 (数据源: 旧版 BEHAVIOR_FIELDS + wiki behaviors/ 文档; Phase 3 细化)
  var BLOCK_BEHAVIOR_TYPES = {
    attached_stem_block: { label: l('附着茎 (attached_stem_block)', 'Attached Stem Block'), fields: _bh([['fruit', 'text'], ['stem', 'text']]) },
    bouncing_block: { label: l('弹跳 (bouncing_block)', 'Bouncing Block'), fields: _bh([['bounce_height', 'number'], ['fall_damage_multiplier', 'number'], ['sync_player_position', 'bool']]) },
    budding_block: { label: l('芽 (budding_block)', 'Budding Block'), fields: _bh([['growth_chance', 'number'], ['blocks', 'lines']]) },
    bush_block: { label: l('灌木 (bush_block)', 'Bush Block'), fields: _bh([['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['bottom_blocks', 'lines'], ['bottom_block_tags', 'lines']]) },
    button_block: { label: l('按钮 (button_block)', 'Button Block'), fields: _bh([['ticks_to_stay_pressed', 'number'], ['can_be_activated_by_arrows', 'bool'], ['sounds', 'json', 'on,off']]) },
    change_over_time_block: { label: l('随时间变化 (change_over_time_block)', 'Change Over Time Block'), fields: _bh([['change_speed', 'number'], ['next_block', 'text'], ['excluded_properties', 'lines']]) },
    chime_block: { label: l('风铃 (chime_block)', 'Chime Block'), fields: _bh([['sounds', 'json', 'chime']]) },
    concrete_powder_block: { label: l('混凝土粉末 (concrete_powder_block)', 'Concrete Powder Block'), fields: _bh([['solid_block', 'text']]) },
    crop_block: { label: l('作物 (crop_block)', 'Crop Block'), fields: _bh([['grow_speed', 'number'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['spawn_light_requirement', 'number'], ['max_spawn_light_requirement', 'number'], ['is_bone_meal_target', 'bool'], ['bone_meal_age_bonus', 'json']]) },
    decay_block: { label: l('腐烂 (decay_block)', 'Decay Block'), fields: _bh([['decay_into', 'text'], ['delay', 'text'], ['chance', 'number'], ['required_light', 'number']]) },
    directional_attached_block: { label: l('定向附着 (directional_attached_block)', 'Directional Attached Block'), fields: _bh([['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']]) },
    double_high_block: { label: l('双层方块 (double_high_block)', 'Double High Block'), fields: _bh([['half', 'text']]) },
    display_item_block: { label: l('展示物品方块 (display_item_block)', 'Display Item Block'), fields: _bh([['position', 'text'], ['has_signal', 'bool'], ['data_key', 'text'], ['tint_source', 'bool'], ['sounds', 'json', 'put,take']]) },
    door_block: { label: l('门 (door_block)', 'Door Block'), fields: _bh([['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json', 'open,close']]) },
    drawer_block: { label: l('抽屉 (drawer_block)', 'Drawer Block'), fields: _bh([['max_stacks', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['item_position', 'text'], ['text_position', 'text'], ['item_scale', 'text'], ['text_scale', 'text'], ['data_key', 'text'], ['compatible_mode', 'bool'], ['sounds', 'json', 'put,take']]) },
    drop_exp_block: { label: l('经验掉落 (drop_exp_block)', 'Drop Exp Block'), fields: _bh([['amount', 'text'], ['conditions', 'json']]) },
    drop_experience_block: { label: l('经验掉落 (drop_experience_block)', 'Drop Experience Block'), fields: _bh([['amount', 'text'], ['conditions', 'json']]) },
    face_attached_horizontal_directional_block: { label: l('面附水平定向 (face_attached_horizontal_directional_block)', 'Face Attached Horizontal Directional'), fields: _bh([['blacklist', 'bool'], ['attached_blocks', 'lines'], ['attached_block_tags', 'lines']]) },
    falling_block: { label: l('下落方块 (falling_block)', 'Falling Block'), fields: _bh([['hurt_amount', 'number'], ['max_hurt', 'number'], ['sounds', 'json', 'land,destroy']]) },
    fence_block: { label: l('栅栏 (fence_block)', 'Fence Block'), fields: _bh([['connectable_block_tag', 'text'], ['can_leash', 'bool']]) },
    fence_gate_block: { label: l('栅栏门 (fence_gate_block)', 'Fence Gate Block'), fields: _bh([['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json', 'open,close']]) },
    grass_block: { label: l('草方块 (grass_block)', 'Grass Block'), fields: _bh([['feature', 'text']]) },
    hanging_block: { label: l('悬挂 (hanging_block)', 'Hanging Block'), fields: _bh([['blacklist', 'bool'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number'], ['above_blocks', 'lines'], ['above_block_tags', 'lines']]) },
    item_frame_block: { label: l('物品展示框 (item_frame_block)', 'Item Frame Block'), fields: _bh([['position', 'text'], ['glow', 'bool'], ['invisible', 'bool'], ['render_map_item', 'bool'], ['data_key', 'text'], ['sounds', 'json', 'put,take,rotate']]) },
    liquid_flowable_block: { label: l('液体可流经 (liquid_flowable_block)', 'Liquid Flowable Block'), fields: _bh([['drop_item', 'bool']]) },
    multi_high_block: { label: l('多层 (multi_high_block)', 'Multi High Block'), fields: _bh([['property', 'text']]) },
    near_liquid_block: { label: l('液体附近 (near_liquid_block)', 'Near Liquid Block'), fields: _bh([['liquid_type', 'lines'], ['stackable', 'bool'], ['positions', 'lines']]) },
    on_liquid_block: { label: l('液体上 (on_liquid_block)', 'On Liquid Block'), fields: _bh([['liquid_type', 'lines'], ['stackable', 'bool']]) },
    pressure_plate_block: { label: l('压力板 (pressure_plate_block)', 'Pressure Plate Block'), fields: _bh([['sensitivity', 'select', ['all', 'mob']], ['pressed_time', 'number'], ['sounds', 'json', 'on,off']]) },
    sapling_block: { label: l('树苗 (sapling_block)', 'Sapling Block'), fields: _bh([['feature', 'text'], ['structure', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['grow_speed', 'number'], ['bone_meal_success_chance', 'number']]) },
    seat_block: { label: l('座椅 (seat_block)', 'Seat Block'), fields: _bh([['seats', 'lines']]) },
    simple_particle_block: { label: l('简单粒子 (simple_particle_block)', 'Simple Particle Block'), fields: _bh([['tick_interval', 'number'], ['particles', 'json']]) },
    simple_storage_block: { label: l('简单存储 (simple_storage_block)', 'Simple Storage Block'), fields: _bh([['title', 'text'], ['rows', 'number'], ['has_signal', 'bool'], ['allow_input', 'bool'], ['allow_output', 'bool'], ['data_key', 'text'], ['sounds', 'json']]) },
    spreading_block: { label: l('蔓延 (spreading_block)', 'Spreading Block'), fields: _bh([['target_block', 'text']]) },
    stackable_block: { label: l('可堆叠 (stackable_block)', 'Stackable Block'), fields: _bh([['property', 'text'], ['items', 'lines']]) },
    stem_block: { label: l('茎 (stem_block)', 'Stem Block'), fields: _bh([['fruit', 'text'], ['attached_stem', 'text'], ['light_requirement', 'number'], ['max_light_requirement', 'number'], ['fruit_bottom_blocks', 'lines'], ['fruit_bottom_block_tags', 'lines']]) },
    strippable_block: { label: l('可去皮 (strippable_block)', 'Strippable Block'), fields: _bh([['stripped', 'text'], ['excluded_properties', 'lines'], ['tools', 'lines']]).concat([soundRefField('sound', '音效', 'Sound')]) },
    sturdy_base_block: { label: l('坚固底座 (sturdy_base_block)', 'Sturdy Base Block'), fields: _bh([['direction', 'text'], ['support_types', 'lines'], ['stackable', 'bool'], ['max_height', 'number'], ['delay', 'number']]) },
    surface_spreading_block: { label: l('表面蔓延 (surface_spreading_block)', 'Surface Spreading Block'), fields: _bh([['light_requirement', 'number'], ['max_light_requirement', 'number'], ['base_block', 'text']]) },
    tint_source_block: { label: l('色调源 (tint_source_block)', 'Tint Source Block'), fields: _bh([['drop_item', 'bool'], ['data_key', 'text']]) },
    toggleable_lamp_block: { label: l('可切换灯 (toggleable_lamp_block)', 'Toggleable Lamp Block'), fields: _bh([['can_open_with_hand', 'bool']]) },
    trapdoor_block: { label: l('活板门 (trapdoor_block)', 'Trapdoor Block'), fields: _bh([['can_open_with_hand', 'bool'], ['can_open_by_wind_charge', 'bool'], ['sounds', 'json', 'open,close']]) },
    vertical_crop_block: { label: l('垂直作物 (vertical_crop_block)', 'Vertical Crop Block'), fields: _bh([['max_height', 'number'], ['grow_speed', 'number'], ['direction', 'select', ['up', 'down']]]) },
    wall_torch_particle_block: { label: l('墙上火把粒子 (wall_torch_particle_block)', 'Wall Torch Particle Block'), fields: _bh([['tick_interval', 'number'], ['particles', 'json']]) },
    // wiki 新增 (Phase 3 细化字段)
    hangable_block: { label: l('可悬挂 (hangable_block)', 'Hangable Block'), fields: [] },
    lamp_block: { label: l('灯 (lamp_block)', 'Lamp Block'), fields: [] },
    leaves_block: { label: l('树叶 (leaves_block)', 'Leaves Block'), fields: [] },
    slab_block: { label: l('台阶 (slab_block)', 'Slab Block'), fields: [] },
    snowy_block: { label: l('积雪 (snowy_block)', 'Snowy Block'), fields: [] },
    sofa_block: { label: l('沙发 (sofa_block)', 'Sofa Block'), fields: [f('seats', '座位', 'Seats', 'lines')] },
    stairs_block: { label: l('楼梯 (stairs_block)', 'Stairs Block'), fields: [] },
  };

  // ---- settings (wiki item/settings.mdx) ----
  var ITEM_PROJECTILE_DISPLAY_FIELDS = [
    f('item', '显示物品', 'Item', 'text', { datalist: 'items' }),
    f('translation', '平移', 'Translation', 'text', { hint: l('x,y,z', 'x,y,z') }),
    f('rotation', '旋转', 'Rotation', 'text', { hint: l('四元数 w,x,y,z', 'Quaternion w,x,y,z') }),
    f('display_transform', '显示变换', 'Display Transform', 'text'),
    f('scale', '缩放', 'Scale', 'number'),
  ];
  // 弹射物音效: 命中目标时按方块/物品切换音效 (wiki item/settings.mdx)
  function projectileSoundField(key, zh, en, withTargeted) {
    var types = { map: SOUND_REF_TYPES.map };
    if (withTargeted) {
      types.targeted = { label: l('按目标切换', 'Per Target'), widget: { type: 'object', fields: [
        f('default', '默认音效', 'Default Sound', 'text'),
        f('overrides', '目标覆盖', 'Overrides', 'mapOf', { valueType: { type: 'text' }, label: l('目标覆盖', 'Overrides'), hint: l('键: 命中方块/物品 ID; 值: 音效 ID', 'Key: hit block/item id; value: sound id') }),
      ], label: l('按目标切换', 'Per Target') } };
    }
    return f(key, zh, en, 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: l('minecraft:item.trident.throw', 'minecraft:item.trident.throw') }, label: l('音效', 'Sound'), types: types });
  }
  var ITEM_PROJECTILE_FIELDS = [
    f('display', '显示', 'Display', 'object', { fields: ITEM_PROJECTILE_DISPLAY_FIELDS, label: l('显示', 'Display') }),
    f('sounds', '音效', 'Sounds', 'object', { fields: [
      projectileSoundField('throw', '投掷', 'Throw', false),
      projectileSoundField('hit_entity', '命中实体', 'Hit Entity', true),
      projectileSoundField('hit_block', '命中方块', 'Hit Block', true),
    ], label: l('音效', 'Sounds') }),
    f('ignore_infinity_enchantment', '忽略无限附魔', 'Ignore Infinity Enchantment', 'bool', { hint: l('作为弹药使用时忽略 Infinity 附魔', 'Whether to ignore the Infinity enchantment when used as ammunition') }),
    f('pickupable', '可拾取', 'Pickupable', 'bool', { hint: l('命中后是否可被拾取', 'Whether the projectile can be picked up after hitting a target') }),
    f('remove_on_hit', '命中移除', 'Remove On Hit', 'bool'),
    f('gravity', '重力', 'Gravity', 'bool'),
    f('velocity', '速度', 'Velocity', 'number'),
    f('damage', '基础伤害', 'Damage', 'number'),
    f('pierce_level', '穿透次数', 'Pierce Level', 'number', { hint: l('箭可穿透的实体数量', 'Number of entities this arrow can pierce') }),
  ];
  var ITEM_SETTINGS_FIELDS = [
    f('fuel_time', '燃料时间 (tick)', 'Fuel Time', 'number', { hint: l('>0 表示可作为燃料', '>0 = usable as fuel') }),
    f('tags', '标签', 'Tags', 'lines', { hint: l('每行一个标签, 如 minecraft:planks', 'One tag per line') }),
    f('equipment', '装备', 'Equipment', 'object', { hint: l('将装备定义应用到此物品', 'Apply the equipment to this item'), fields: [
      f('asset_id', '资源 ID', 'Asset ID', 'text', { hint: l('必填, 如 default:topaz', 'Required, e.g. default:topaz') }),
      f('client_bound_model', '客户端模型', 'Client Bound Model', 'bool', { hint: l('默认跟随 config.yml 的全局 client_bound_model 选项', 'Defaults to the global client_bound_model option in config.yml') }),
      f('slot', '槽位', 'Slot', 'select', { options: ['head', 'chest', 'legs', 'feet', 'body', 'saddle'], hint: l('1.21.2+; 后续选项需要此值', '1.21.2+; required for the options below') }),
      f('camera_overlay', '相机覆盖层', 'Camera Overlay', 'text', { hint: l('穿戴时叠加纹理的资源位置: assets/<namespace>/textures/<id>', 'Overlay texture when equipped: assets/<namespace>/textures/<id>') }),
      f('dispensable', '可发射', 'Dispensable', 'bool', { hint: l('是否可由发射器发射', 'Whether the item can be dispensed by a dispenser') }),
      f('damage_on_hurt', '受伤损坏', 'Damage On Hurt', 'bool', { hint: l('穿戴实体受伤时物品是否受损', 'Whether the item is damaged when the wearing entity is damaged') }),
      f('swappable', '可右键穿戴', 'Swappable', 'bool', { hint: l('是否可通过右键穿入对应槽位', 'Whether the item can be equipped by right-clicking') }),
      f('equip_on_interact', '可装备到生物', 'Equip On Interact', 'bool', { hint: l('>= 1.21.5: 对目标生物按下使用键是否可装备', '1.21.5+: equip onto a target mob by pressing use') }),
    ] }),
    f('repairable', '可修复', 'Repairable', 'union', { noTypeKey: true, allowScalar: { type: 'bool' }, hint: l('默认 true', 'Default: true'), label: l('可修复', 'Repairable'), types: {
      map: { label: l('详细修复场景', 'Detailed'), widget: { type: 'object', fields: [
        f('crafting_table', '工作台', 'Crafting Table', 'bool'),
        f('anvil_repair', '铁砧修复', 'Anvil Repair', 'bool'),
        f('anvil_combine', '铁砧合并', 'Anvil Combine', 'bool'),
      ], label: l('详细修复场景', 'Detailed') } },
    } }),
    f('anvil_repair_item', '铁砧修复物品', 'Anvil Repair Item', 'listOf', { itemType: { type: 'object', fields: [
      f('target', '目标', 'Target', 'union', { allowScalar: { type: 'text', hint: l('物品 ID 或标签 (如 #topaz_tools)', 'Item ID or tag (e.g. #topaz_tools)') }, label: l('目标', 'Target'), types: {
        list: { label: l('列表', 'List'), widget: { type: 'lines', label: l('列表', 'List') } },
      } }),
      f('amount', '耐久恢复量', 'Amount', 'number', { hint: l('固定耐久度', 'Restores fixed durability') }),
      f('percent', '百分比', 'Percent', 'number', { hint: l('0.25 = 恢复总耐久的 25%', '0.25 = 25% total durability') }),
    ], label: l('修复项', 'Repair Entry') }, label: l('铁砧修复物品', 'Anvil Repair Item') }),
    f('renameable', '可重命名', 'Renameable', 'union', { allowScalar: { type: 'bool' }, hint: l('默认 true', 'Default: true'), label: l('可重命名', 'Renameable'), types: {
      map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [f('anvil_requires_level', '铁砧需要等级', 'Anvil Requires Level', 'bool')] } },
    } }),
    f('prevent_break', '不可破坏', 'Prevent Break', 'bool', { hint: l('耐久耗尽时保留最后一点耐久而不是销毁; 默认 false', 'Keeps its last durability point instead of being destroyed; default false') }),
    f('can_place', '可放置方块', 'Can Place', 'bool', { hint: l('对应材质的原版方块能否被放置; 方块型材质做非方块物品时设为 false; 默认 false', 'Whether the vanilla block for this material can be placed; default false') }),
    f('allowed_projectiles', '允许弹射物', 'Allowed Projectiles', 'lines', { hint: l('可装入弩/弓的物品, 每行一个', 'Items loadable into crossbows/bows, one per line') }),
    f('projectile', '弹射物', 'Projectile', 'object', { hint: l('基于物品创建自定义弹射物实体 (支持 trident/arrow/snowball 等)', 'Creates a custom projectile entity (supports trident/arrow/snowball...)'), fields: ITEM_PROJECTILE_FIELDS }),
    f('dyeable', '可染色', 'Dyeable', 'bool', { hint: l('是否可在工作台染色', 'Decides if the item can be dyed in crafting tables') }),
    f('food', '食物', 'Food', 'object', { hint: l('基于插件的 food 组件替代实现', 'Plugin-based alternative implementation for the food component'), fields: [
      f('nutrition', '饱食度', 'Nutrition', 'number', { hint: l('0~20 整数', '0~20, integer') }),
      f('saturation', '饱和度', 'Saturation', 'number', { hint: l('0~10 小数', '0~10, float') }),
    ] }),
    f('consume_replacement', '消耗替换', 'Consume Replacement', 'text', { hint: l('消耗后返回的物品 ID, 如喝水后返还空瓶; 默认 null', 'Item returned after consuming (e.g. empty bottle); default null'), datalist: 'items' }),
    f('craft_remainder', '合成残留', 'Craft Remainder', 'union', { allowScalar: { type: 'text', datalist: 'items', hint: l('物品 ID 简写', 'Item ID shorthand') }, label: l('合成残留', 'Craft Remainder'), types: CRAFT_REMAINDER_TYPES }),
    f('fuel_remainder', '燃料残留', 'Fuel Remainder', 'union', { allowScalar: { type: 'text', datalist: 'items', hint: l('物品 ID 简写', 'Item ID shorthand') }, hint: l('作为燃料消耗后返还的物品; 仅堆叠数为 1 的物品生效', 'Returned after being consumed as fuel; only applies to stack size 1'), label: l('燃料残留', 'Fuel Remainder'), types: CRAFT_REMAINDER_TYPES }),
    f('invulnerable', '免疫伤害', 'Invulnerable', 'lines', { hint: l('不被指定伤害类型摧毁; 如 lava/fire/fire_tick/block_explosion/entity_explosion/lightning/contact', 'Not destroyed by the listed damage types: lava/fire/fire_tick/block_explosion/entity_explosion/lightning/contact') }),
    f('enchantable', '可附魔', 'Enchantable', 'bool', { hint: l('阻止某些物品在附魔台使用; 默认 true', 'Blocks items from the enchantment table; default true') }),
    f('compost_probability', '堆肥概率', 'Compost Probability', 'number', { hint: l('堆肥成功的概率; 默认 0.5', 'Chance of composting success; default 0.5') }),
    f('respect_repairable_component', '尊重 repairable 组件', 'Respect Repairable Component', 'bool', { hint: l('repairable 组件列出的物品能否在铁砧界面修复此物品; 默认 false', 'Whether repairable-component items can fix this item in anvil gui; default false') }),
    f('dye_color', '染料颜色', 'Dye Color', 'text', { hint: l('染色配方中提供的颜色, 如 255,140,0', 'Color provided in the dyeing recipe, e.g. 255,140,0') }),
    f('firework_color', '烟花颜色', 'Firework Color', 'text', { hint: l('烟花之星渐隐配方中提供的颜色, 如 255,140,0', 'Color provided in the firework star fade recipe, e.g. 255,140,0') }),
    f('ingredient_substitute', '材料替代', 'Ingredient Substitute', 'lines', { hint: l('配方系统中可替代的原版物品, 每行一个', 'Vanilla items this item can substitute for in recipes, one per line') }),
    f('hat_height', '帽子高度', 'Hat Height', 'number', { hint: l('需要 CustomNameplates; 影响名牌高度', 'Requires CustomNameplates; nametag height impact') }),
    f('keep_on_death_chance', '死亡保留概率', 'Keep On Death Chance', 'number', { hint: l('0~1', '0~1') }),
    f('destroy_on_death_chance', '死亡销毁概率', 'Destroy On Death Chance', 'number', { hint: l('0~1', '0~1') }),
    f('drop_display', '掉落显示', 'Drop Display', 'union', { allowScalar: { type: 'bool' }, hint: l('false = 关闭; true = 显示物品名; 字符串 = 自定义模板 (<arg:count> = 数量, <name> = 物品名)', 'false = off; true = item name; string = custom template (<arg:count> = amount, <name> = name)'), label: l('掉落显示', 'Drop Display'), types: {
      text: { label: l('自定义模板', 'Custom Template'), widget: { type: 'text', placeholder: l('<arg:count>x <name>', '<arg:count>x <name>') } },
    } }),
    f('glow_color', '发光颜色', 'Glow Color', 'text', { placeholder: l('white', 'white'), hint: l('black/dark_blue/.../white 等颜色名', 'black/dark_blue/.../white color names') }),
  ];

  // ---- updater (wiki item/updater.mdx) ----
  var UPDATER_STEP_TYPES = {
    apply_data: { label: l('应用数据 (apply_data)', 'Apply Data'), fields: [
      f('data', '数据', 'Data', 'kv', { hint: l('格式与物品 data 相同 (item_name/lore 等任意物品数据)', 'Same format as item data (item_name/lore etc.)') }),
    ] },
    transmute: { label: l('转换材质 (transmute)', 'Transmute'), fields: [
      f('material', '基础材质', 'Material', 'text', { hint: l('替换基础材质, 保留所有组件与 NBT', 'Replace the base material, preserving components and NBT'), datalist: 'items' }),
    ] },
    reset: { label: l('重置 (reset)', 'Reset'), fields: [
      f('keep_components', '保留组件', 'Keep Components', 'lines', { hint: l('1.20.5+: 保留的组件 (如 minecraft:enchantments); 未列出的一律丢弃', '1.20.5+: components to keep; anything not listed is discarded') }),
      f('keep_tags', '保留 NBT 路径', 'Keep Tags', 'lines', { hint: l('旧版 (< 1.20.5): 保留的 NBT 路径 (如 Enchantments)', 'Legacy (< 1.20.5): NBT paths to keep') }),
    ] },
  };
  var UPDATER_VALUE_TYPES = {
    step: { label: l('单个步骤', 'Single Step'), widget: { type: 'union', types: UPDATER_STEP_TYPES, label: l('步骤', 'Step') } },
    steps: { label: l('步骤列表', 'Steps'), widget: { type: 'listOf', itemType: { type: 'union', types: UPDATER_STEP_TYPES, label: l('步骤', 'Step') }, label: l('步骤', 'Steps') } },
  };

  // ============ Block 编辑器 ============
  // 数据源: wiki block/states.mdx + settings.mdx + states/properties.mdx + states/entity_renderer.mdx + reference/loot_table.mdx

  // ---- 通用小块 ----
  // 实体剔除: 布尔 或 详细参数
  var ENTITY_CULLING_TYPES = {
    map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
      f('aabb', '包围盒', 'AABB', 'text', { hint: l('minX,minY,minZ,maxX,maxY,maxZ', 'minX,minY,minZ,maxX,maxY,maxZ') }),
      f('view_distance', '可视距离', 'View Distance', 'number', { hint: l('-1 = 无限', '-1 = unlimited') }),
      f('aabb_expansion', '包围盒扩展', 'AABB Expansion', 'number', { hint: l('默认 0.5', 'Default 0.5') }),
      f('ray_tracing', '射线检测', 'Ray Tracing', 'bool', { hint: l('默认 true', 'Default true') }),
    ], label: l('实体剔除', 'Entity Culling') } },
  };
  // 色调源: 字符串 / 详细对象 / 组件列表 (家具 items 元素使用列表形式)
  var TINT_SOURCE_TYPES = {
    map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
      f('type', '类型', 'Type', 'select', { options: ['default'] }),
      f('components', '组件', 'Components', 'lines', { hint: l('如 minecraft:dyed_color (每行一个)', 'e.g. minecraft:dyed_color (one per line)') }),
      f('index', '索引', 'Index', 'number', { hint: l('默认 0', 'Default 0') }),
    ], label: l('色调源', 'Tint Source') } },
    list: { label: l('组件列表', 'Component List'), widget: { type: 'listOf', label: l('组件', 'Components'), itemType: { type: 'text', hint: l('如 dyed_color', 'e.g. dyed_color') } } },
  };
  function tintSourceField() {
    return f('tint_source', '色调源', 'Tint Source', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: l('minecraft:dyed_color', 'minecraft:dyed_color') }, label: l('色调源', 'Tint Source'), types: TINT_SOURCE_TYPES });
  }
  // 显示参数 (item_display/text_display/block_display 元素共用)
  var DISPLAY_PARAMS_FIELDS = [
    f('translation', '平移', 'Translation', 'text', { hint: l('相对偏移 x,y,z (推荐)', 'Offset x,y,z (recommended)') }),
    f('position', '位置', 'Position', 'text', { hint: l('绝对位置 x,y,z', 'Absolute position x,y,z') }),
    f('scale', '缩放', 'Scale', 'text', { hint: l('x,y,z 或单个数如 1.5', 'x,y,z or a single number') }),
    f('rotation', '旋转', 'Rotation', 'text', { hint: l('单个数=绕Y轴 / 3个数=欧拉角 / 4个数=四元数', 'Single=Y axis / 3=Euler angles / 4=Quaternion') }),
    f('yaw', '偏航角', 'Yaw', 'number', { hint: l('绕 Y 轴', 'Around Y axis') }),
    f('pitch', '俯仰角', 'Pitch', 'number', { hint: l('绕 X 轴', 'Around X axis') }),
    f('billboard', '朝向', 'Billboard', 'select', { options: S.constants.billboards }),
    f('glow_color', '发光颜色', 'Glow Color', 'text', { placeholder: l('255,200,100', '255,200,100') }),
    f('brightness', '亮度覆盖', 'Brightness', 'object', { fields: [
      f('block_light', '方块光', 'Block Light', 'number'),
      f('sky_light', '天空光', 'Sky Light', 'number'),
    ], label: l('亮度覆盖', 'Brightness') }),
    f('view_range', '可视系数', 'View Range', 'number'),
    f('shadow_radius', '阴影半径', 'Shadow Radius', 'number'),
    f('shadow_strength', '阴影强度', 'Shadow Strength', 'number'),
  ];
  // 实体渲染器元素 (7 种, type 键选择; 省略 type 时由 item/text/block 自动推断)
  var ENTITY_RENDERER_ELEMENT_TYPES = {
    item_display: { label: l('物品显示 (item_display)', 'Item Display'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('display_transform', '显示变换', 'Display Transform', 'select', { options: S.constants.displayTransforms }),
      tintSourceField(),
    ].concat(DISPLAY_PARAMS_FIELDS, [f('conditions', '条件', 'Conditions', 'listOf', conditionsList())]) },
    text_display: { label: l('文本显示 (text_display)', 'Text Display'), fields: [
      f('text', '文本', 'Text', 'textarea', { rows: 2, hint: l('支持 MiniMessage 与 PAPI 占位符', 'Supports MiniMessage & PAPI placeholders') }),
      f('line_width', '行宽 (像素)', 'Line Width', 'number', { hint: l('默认 200', 'Default 200') }),
      f('background_color', '背景色 (ARGB)', 'Background Color', 'text', { placeholder: l('64,0,0,0', '64,0,0,0') }),
      f('text_opacity', '文本透明度', 'Text Opacity', 'number', { hint: l('0-255, -1 = 默认', '0-255, -1 = default') }),
      f('has_shadow', '阴影', 'Has Shadow', 'bool'),
      f('is_see_through', '透视背面', 'Is See Through', 'bool'),
      f('use_default_background_color', '默认背景色', 'Use Default Background Color', 'bool'),
      f('alignment', '对齐', 'Alignment', 'select', { options: ['center', 'left', 'right'] }),
    ].concat(DISPLAY_PARAMS_FIELDS, [f('conditions', '条件', 'Conditions', 'listOf', conditionsList())]) },
    block_display: { label: l('方块显示 (block_display)', 'Block Display'), fields: [
      f('block', '方块', 'Block', 'text', { hint: l('方块 ID 或完整状态, 如 minecraft:chest[facing=north]', 'Block ID or full state, e.g. minecraft:chest[facing=north]') }),
    ].concat(DISPLAY_PARAMS_FIELDS, [f('conditions', '条件', 'Conditions', 'listOf', conditionsList())]) },
    item: { label: l('掉落物品 (item)', 'Dropped Item'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('position', '位置', 'Position', 'text', { hint: l('x,y,z (默认方块中心)', 'x,y,z (default block center)') }),
      tintSourceField(),
      f('conditions', '条件', 'Conditions', 'listOf', conditionsList()),
    ] },
    armor_stand: { label: l('盔甲架 (armor_stand)', 'Armor Stand'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('scale', '缩放', 'Scale', 'number'),
      f('small', '小型', 'Small', 'bool'),
      f('glow_color', '发光颜色', 'Glow Color', 'select', { options: S.constants.glowColors }),
      tintSourceField(),
      f('conditions', '条件', 'Conditions', 'listOf', conditionsList()),
    ] },
    better_model: { label: l('BetterModel', 'BetterModel'), fields: [
      f('model', '模型名', 'Model', 'text'),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('sight_trace', '参与射线', 'Sight Trace', 'bool', { hint: l('默认 true', 'Default true') }),
      f('conditions', '条件', 'Conditions', 'listOf', conditionsList()),
    ] },
    model_engine: { label: l('ModelEngine', 'ModelEngine'), fields: [
      f('model', '模型名', 'Model', 'text'),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('conditions', '条件', 'Conditions', 'listOf', conditionsList()),
    ] },
  };
  // entity_renderer: 单元素对象 或 元素列表
  var ENTITY_RENDERER_UNION = { type: 'union', noTypeKey: true, label: l('实体渲染器', 'Entity Renderer'), types: {
    single: { label: l('单个元素', 'Single Element'), widget: { type: 'union', types: ENTITY_RENDERER_ELEMENT_TYPES, label: l('元素', 'Element') } },
    list: { label: l('元素列表', 'Element List'), widget: { type: 'listOf', label: l('元素', 'Elements'), itemType: { type: 'union', types: ENTITY_RENDERER_ELEMENT_TYPES, label: l('元素', 'Element') } } },
  } };
  // 模型纹理: 字符串 或 列表 (^ 前缀 = 粒子纹理)
  var MODEL_TEXTURES_TYPES = {
    list: { label: l('列表', 'List'), widget: { type: 'lines', label: l('纹理', 'Textures') } },
  };
  function modelTexturesField(key) {
    return f(key, '纹理', 'Textures', 'union', { noTypeKey: true, allowScalar: { type: 'text' }, label: l('纹理', 'Textures'), types: MODEL_TEXTURES_TYPES });
  }
  // 模型: 路径字符串 或 详细对象 (7 种互斥组合)
  var BLOCK_MODEL_TYPES = {
    map: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
      f('path', '模型路径', 'Model Path', 'text', { hint: l('如 minecraft:block/custom/xxx', 'e.g. minecraft:block/custom/xxx') }),
      modelTexturesField('textures'),
      f('texture', '单纹理 (等价别名)', 'Texture (alias)', 'text', { hint: l('等价于 textures 单元素', 'Equivalent to a single-element textures list') }),
      f('generation', '模型生成', 'Generation', 'object', { fields: [
        f('parent', '父模型', 'Parent', 'text', { hint: l('如 minecraft:block/cube_column', 'e.g. minecraft:block/cube_column') }),
        f('textures', '纹理映射', 'Textures', 'mapOf', { valueType: { type: 'text' }, label: l('纹理映射', 'Textures') }),
      ], label: l('模型生成', 'Generation') }),
      f('blueprint', '蓝图', 'Blueprint', 'text', { hint: l('.bbmodel 源文件 (实验性)', '.bbmodel source (experimental)') }),
      f('x', 'X 旋转', 'X Rotation', 'number', { hint: l('90 的倍数', 'Multiple of 90') }),
      f('y', 'Y 旋转', 'Y Rotation', 'number', { hint: l('90 的倍数', 'Multiple of 90') }),
      f('z', 'Z 旋转', 'Z Rotation', 'number', { hint: l('90 的倍数 (需 1.21.11+)', 'Multiple of 90 (1.21.11+)') }),
      f('uvlock', '锁定纹理方向', 'UV Lock', 'bool'),
      f('weight', '权重', 'Weight', 'number', { hint: l('仅 models 列表中使用', 'Used in models lists only') }),
    ], label: l('模型', 'Model') } },
  };
  function stateModelField() {
    return f('model', '模型', 'Model', 'union', { noTypeKey: true, allowScalar: { type: 'text', placeholder: l('minecraft:block/custom/xxx', 'minecraft:block/custom/xxx') }, label: l('模型', 'Model'), types: BLOCK_MODEL_TYPES });
  }
  // 加权模型列表条目
  var MODELS_ENTRY_FIELDS = [
    f('path', '模型路径', 'Model Path', 'text'),
    modelTexturesField('textures'),
    f('x', 'X 旋转', 'X Rotation', 'number'),
    f('y', 'Y 旋转', 'Y Rotation', 'number'),
    f('z', 'Z 旋转', 'Z Rotation', 'number'),
    f('uvlock', '锁定纹理方向', 'UV Lock', 'bool'),
    f('weight', '权重', 'Weight', 'number', { hint: l('默认 1', 'Default 1') }),
  ];
  // 自动状态组: 组名 或 展开 {type, id}
  var AUTO_STATE_TYPES = {
    expanded: { label: l('展开 (共享状态)', 'Expanded (shared)'), widget: { type: 'object', fields: [
      f('type', '组', 'Group', 'select', { options: S.constants.autoStateGroups }),
      f('id', '共享 ID', 'Shared ID', 'text', { hint: l('相同 id 共享同一个原版方块状态', 'Same id = same shared vanilla state') }),
    ], label: l('自动状态', 'Auto State') } },
  };
  function autoStateField() {
    return f('auto_state', '自动状态', 'Auto State', 'union', { noTypeKey: true, allowScalar: { type: 'select', options: S.constants.autoStateGroups }, label: l('自动状态', 'Auto State'), types: AUTO_STATE_TYPES });
  }
  // 外观字段 (单状态 state 与 appearances 值共用; 单状态额外有 id)
  function blockAppearanceFields(withId) {
    var fields = [];
    if (withId) fields.push(f('id', '内部 ID', 'Internal ID', 'number', { hint: l('固定内部 ID (通常不需要)', 'Fixed internal ID (usually unnecessary)') }));
    return fields.concat([
      autoStateField(),
      f('state', '原版状态', 'Vanilla State', 'text', { hint: l('如 minecraft:note_block[instrument=hat,note=0,powered=false]', 'e.g. minecraft:note_block[instrument=hat,note=0,powered=false]') }),
      stateModelField(),
      f('models', '加权模型', 'Weighted Models', 'listOf', { itemType: { type: 'object', fields: MODELS_ENTRY_FIELDS, label: l('模型', 'Model') }, label: l('加权模型', 'Weighted Models'), hint: l('多模型加权随机', 'Multi-model weighted random') }),
      f('transparent', '透明', 'Transparent', 'bool', { hint: l('移除原版模型 (配合实体渲染器使用)', 'Removes the original model (use with entity_renderer)') }),
      f('blueprint', '蓝图', 'Blueprint', 'text', { hint: l('.bbmodel 源文件', '.bbmodel source') }),
      f('entity_renderer', '实体渲染器', 'Entity Renderer', 'union', ENTITY_RENDERER_UNION),
      f('entity_culling', '实体剔除', 'Entity Culling', 'union', { noTypeKey: true, allowScalar: { type: 'bool' }, label: l('实体剔除', 'Entity Culling'), types: ENTITY_CULLING_TYPES }),
    ]);
  }
  // 属性类型 (wiki block/states/properties.mdx)
  var PROPERTY_TYPES = {
    boolean: { label: l('布尔 (boolean)', 'Boolean'), fields: [f('default', '默认值', 'Default', 'bool')] },
    int: { label: l('整数 (int)', 'Int'), fields: [
      f('default', '默认值', 'Default', 'number'),
      f('range', '范围', 'Range', 'text', { hint: l('如 1~7', 'e.g. 1~7') }),
    ] },
    string: { label: l('字符串 (string)', 'String'), fields: [
      f('default', '默认值', 'Default', 'text'),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    direction: { label: l('方向 (direction)', 'Direction'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['east', 'south', 'west', 'north', 'up', 'down'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    horizontal_direction: { label: l('水平方向 (horizontal_direction)', 'Horizontal Direction'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['north', 'south', 'west', 'east'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    axis: { label: l('轴 (axis)', 'Axis'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['x', 'y', 'z'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    single_block_half: { label: l('单方块半区 (single_block_half)', 'Single Block Half'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['top', 'bottom'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    double_block_half: { label: l('双方块半区 (double_block_half)', 'Double Block Half'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['upper', 'lower'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    hinge: { label: l('铰链 (hinge)', 'Hinge'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['left', 'right'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    slab_type: { label: l('台阶类型 (slab_type)', 'Slab Type'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['top', 'bottom', 'double'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    stairs_shape: { label: l('楼梯形状 (stairs_shape)', 'Stairs Shape'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    sofa_shape: { label: l('沙发形状 (sofa_shape)', 'Sofa Shape'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['straight', 'inner_left', 'inner_right'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
    anchor_type: { label: l('锚点类型 (anchor_type)', 'Anchor Type'), fields: [
      f('default', '默认值', 'Default', 'select', { options: ['floor', 'wall', 'ceiling'] }),
      f('values', '可选值', 'Values', 'lines'),
    ] },
  };
  // 方块设置全部字段 (wiki block/settings.mdx)
  var BLOCK_SETTINGS_FIELDS = [
    f('hardness', '硬度', 'Hardness', 'number', { hint: l('默认 2.0', 'Default 2.0') }),
    f('resistance', '抗性', 'Resistance', 'number', { hint: l('默认 2.0', 'Default 2.0') }),
    f('push_reaction', '活塞反应', 'Push Reaction', 'select', { options: S.constants.pushReactions }),
    f('map_color', '地图颜色', 'Map Color', 'number', { hint: l('默认 0', 'Default 0') }),
    f('burnable', '可燃', 'Burnable', 'bool'),
    f('fire_spread_chance', '火焰蔓延概率', 'Fire Spread Chance', 'number', { hint: l('0-100', '0-100') }),
    f('burn_chance', '点燃概率', 'Burn Chance', 'number', { hint: l('0-100', '0-100') }),
    f('item', '对应物品', 'Item', 'text', { hint: l('创造模式中键拾取用', 'Used for creative middle-click'), datalist: 'items' }),
    f('replaceable', '可替换', 'Replaceable', 'bool'),
    f('is_redstone_conductor', '红石导体', 'Is Redstone Conductor', 'bool'),
    f('is_suffocating', '窒息判定', 'Is Suffocating', 'bool'),
    f('is_view_blocking', '阻挡视线', 'Is View Blocking', 'bool'),
    f('is_randomly_ticking', '接受随机刻', 'Is Randomly Ticking', 'bool', { hint: l('决定方块状态是否接受随机刻 (树木等方块利用随机刻随时间生长)', 'Whether the block state receives random ticks (e.g. trees grow over time)') }),
    f('sounds', '音效', 'Sounds', 'popup', { content: BLOCK_SOUND_OBJECT, label: l('音效', 'Sounds') }),
    f('require_correct_tools', '需要正确工具', 'Require Correct Tools', 'bool', { hint: l('设置 correct_tools 时自动为 true', 'Automatically true when correct_tools is set') }),
    f('respect_tool_component', '尊重工具组件', 'Respect Tool Component', 'bool'),
    f('correct_tools', '正确工具', 'Correct Tools', 'lines'),
    f('incorrect_tool_dig_speed', '错误工具挖掘速度', 'Incorrect Tool Dig Speed', 'number', { hint: l('0~1, 默认 0.3', '0~1, default 0.3') }),
    f('tags', '标签', 'Tags', 'lines', { hint: l('如 minecraft:mineable/axe (每行一个)', 'e.g. minecraft:mineable/axe (one per line)') }),
    f('client_bound_tags', '客户端标签', 'Client Bound Tags', 'lines', { hint: l('仅原版方块生效', 'Only works for vanilla blocks') }),
    f('instrument', '音符盒乐器', 'Instrument', 'select', { options: S.constants.instruments }),
    f('fluid_state', '流体状态', 'Fluid State', 'select', { options: S.constants.fluidStates }),
    f('support_shape', '支撑形状', 'Support Shape', 'text', { hint: l('如 minecraft:stone', 'e.g. minecraft:stone') }),
    f('destroy_stages', '破坏阶段', 'Destroy Stages', 'object', { fields: [
      f('items', '物品', 'Items', 'lines', { hint: l('如 minecraft:destroy_stage_0 (每行一个)', 'e.g. minecraft:destroy_stage_0 (one per line)') }),
      f('translation', '偏移', 'Translation', 'text', { hint: l('x,y,z', 'x,y,z') }),
      f('position', '位置', 'Position', 'text', { hint: l('x,y,z (默认方块中心)', 'x,y,z (default block center)') }),
      f('scale', '缩放', 'Scale', 'text', { hint: l('x,y,z 或单个数', 'x,y,z or single') }),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('rotation', '旋转', 'Rotation', 'text', { hint: l('单个数/欧拉角/四元数', 'Single/Euler/Quaternion') }),
      f('display_transform', '显示变换', 'Display Transform', 'select', { options: S.constants.displayTransforms }),
      f('billboard', '朝向', 'Billboard', 'select', { options: S.constants.billboards }),
      f('view_range', '可视系数', 'View Range', 'number'),
      f('brightness', '亮度', 'Brightness', 'object', { fields: [
        f('block_light', '方块光', 'Block Light', 'number'),
        f('sky_light', '天空光', 'Sky Light', 'number'),
      ], label: l('亮度', 'Brightness') }),
    ], label: l('破坏阶段', 'Destroy Stages') }),
    f('bounce_restitution', '弹跳恢复', 'Bounce Restitution', 'number', { hint: l('仅非玩家实体 (Slime: 1.0, 床: 0.75)', 'Non-player entities only (Slime: 1.0, Bed: 0.75)') }),
    f('friction', '摩擦力', 'Friction', 'number', { hint: l('冰: 0.98, 默认 0.6', 'Ice: 0.98, default 0.6') }),
    f('jump_factor', '跳跃系数', 'Jump Factor', 'number', { hint: l('默认 1.0', 'Default 1.0') }),
    f('speed_factor', '移动系数', 'Speed Factor', 'number', { hint: l('默认 1.0', 'Default 1.0') }),
    f('luminance', '亮度', 'Luminance', 'number', { hint: l('发光强度', 'Light level') }),
    f('can_occlude', '可遮光', 'Can Occlude', 'bool', { hint: l('仅影响方块光', 'Affects block-emitted light only') }),
    f('block_light', '阻挡亮度', 'Block Light', 'number'),
    f('propagate_skylight', '透射天空光', 'Propagate Skylight', 'bool'),
  ];
  var BLOCK_LOOT_FIELDS = LOOT_OBJECT_FIELDS;

  // ---- block section ----
  SECTIONS.block = {
    tabs: [
      { key: 'state', label: l('状态', 'State') },
      { key: 'settings', label: l('设置', 'Settings') },
      { key: 'behavior', label: l('行为', 'Behavior') },
      { key: 'loot', label: l('掉落', 'Loot') },
      { key: 'events', label: l('事件', 'Events') },
      { key: 'custom', label: l('自定义', 'Custom') },
    ],
    fields: [
      f('state', '单状态', 'State', 'popup', { content: { type: 'object', fields: blockAppearanceFields(true), label: l('单状态', 'State') }, label: l('单状态', 'State'), tab: 'state' }),
      f('states', '多状态', 'States', 'popup', { content: { type: 'object', fields: [
        f('id', '起始 ID', 'Start ID', 'number', { hint: l('固定内部 ID, 变体占用连续区间', 'Fixed internal ID; variants occupy a continuous range') }),
        f('properties', '属性', 'Properties', 'mapOf', { valueType: { type: 'union', types: PROPERTY_TYPES, label: l('属性', 'Property') }, label: l('属性', 'Properties'), hint: l('属性类型与特殊名称 (axis/facing/waterlogged...) 见 Wiki', 'Property types & special names (axis/facing/waterlogged...) per Wiki') }),
        f('appearances', '外观', 'Appearances', 'mapOf', { valueType: { type: 'object', fields: blockAppearanceFields(false), label: l('外观', 'Appearance') }, label: l('外观', 'Appearances'), hint: l('第一个外观为默认回退', 'First appearance is the default fallback') }),
        f('variants', '变体映射', 'Variants', 'mapOf', { valueType: { type: 'object', fields: [
          f('appearance', '外观', 'Appearance', 'text', { hint: l('对应 appearances 中的名称', 'A name from appearances') }),
          f('settings', '设置覆盖', 'Settings Override', 'object', { fields: BLOCK_SETTINGS_FIELDS, label: l('设置覆盖', 'Settings Override') }),
        ], label: l('变体', 'Variant') }, label: l('变体映射', 'Variants'), hint: l('键: 如 waterlogged=true,facing=north (未列出属性通配)', 'Key: e.g. waterlogged=true,facing=north (unlisted = wildcard)') }),
        f('entity_renderer', '实体渲染器', 'Entity Renderer', 'union', ENTITY_RENDERER_UNION),
        f('entity_culling', '实体剔除', 'Entity Culling', 'union', { noTypeKey: true, allowScalar: { type: 'bool' }, label: l('实体剔除', 'Entity Culling'), types: ENTITY_CULLING_TYPES }),
      ], label: l('多状态', 'States') }, label: l('多状态', 'States'), tab: 'state' }),
      f('settings', '设置', 'Settings', 'object', { fields: BLOCK_SETTINGS_FIELDS, label: l('设置', 'Settings'), tab: 'settings' }),
      f('behavior', '行为', 'Behavior', 'union', { types: BLOCK_BEHAVIOR_TYPES, label: l('行为', 'Behavior'), tab: 'behavior' }),
      f('behaviors', '组合行为', 'Behaviors', 'listOf', { itemType: { type: 'union', types: BLOCK_BEHAVIOR_TYPES, label: l('行为', 'Behavior') }, label: l('组合行为', 'Behaviors'), tab: 'behavior' }),
      f('loot', '掉落', 'Loot', 'object', { fields: BLOCK_LOOT_FIELDS, label: l('掉落', 'Loot'), tab: 'loot' }),
      f('events', '事件', 'Events', 'events', { tab: 'events', custom: 'events' }),
      f('merges', '合并', 'Merges', 'kv', { tab: 'events' }),
      f('overrides', '覆盖', 'Overrides', 'kv', { tab: 'events' }),
    ],
  };

  // ---- furniture section (wiki furniture.mdx + furniture/variants.mdx) ----
  // 家具显示元素 (同方块实体渲染器 7 种, 无 conditions)
  var FURNITURE_ELEMENT_TYPES = {
    item_display: { label: l('物品显示 (item_display)', 'Item Display'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('display_transform', '显示变换', 'Display Transform', 'select', { options: S.constants.displayTransforms }),
      tintSourceField(),
    ].concat(DISPLAY_PARAMS_FIELDS) },
    text_display: { label: l('文本显示 (text_display)', 'Text Display'), fields: [
      f('text', '文本', 'Text', 'textarea', { rows: 2, hint: l('支持 MiniMessage 与 PAPI 占位符', 'Supports MiniMessage & PAPI placeholders') }),
      f('line_width', '行宽 (像素)', 'Line Width', 'number', { hint: l('默认 200', 'Default 200') }),
      f('background_color', '背景色 (ARGB)', 'Background Color', 'text', { placeholder: l('64,0,0,0', '64,0,0,0') }),
      f('text_opacity', '文本透明度', 'Text Opacity', 'number', { hint: l('0-255, -1 = 默认', '0-255, -1 = default') }),
      f('has_shadow', '阴影', 'Has Shadow', 'bool'),
      f('is_see_through', '透视背面', 'Is See Through', 'bool'),
      f('use_default_background_color', '默认背景色', 'Use Default Background Color', 'bool'),
      f('alignment', '对齐', 'Alignment', 'select', { options: ['center', 'left', 'right'] }),
    ].concat(DISPLAY_PARAMS_FIELDS) },
    block_display: { label: l('方块显示 (block_display)', 'Block Display'), fields: [
      f('block', '方块', 'Block', 'text', { hint: l('方块 ID 或完整状态, 如 minecraft:chest[facing=north]', 'Block ID or full state, e.g. minecraft:chest[facing=north]') }),
    ].concat(DISPLAY_PARAMS_FIELDS) },
    item: { label: l('掉落物品 (item)', 'Dropped Item'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('position', '位置', 'Position', 'text', { hint: l('x,y,z (默认方块中心)', 'x,y,z (default block center)') }),
      tintSourceField(),
    ] },
    armor_stand: { label: l('盔甲架 (armor_stand)', 'Armor Stand'), fields: [
      f('item', '物品', 'Item', 'text', { datalist: 'items' }),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('scale', '缩放', 'Scale', 'number'),
      f('small', '小型', 'Small', 'bool'),
      f('glow_color', '发光颜色', 'Glow Color', 'select', { options: S.constants.glowColors }),
      tintSourceField(),
    ] },
    better_model: { label: l('BetterModel', 'BetterModel'), fields: [
      f('model', '模型名', 'Model', 'text'),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
      f('sight_trace', '参与射线', 'Sight Trace', 'bool', { hint: l('默认 true', 'Default true') }),
    ] },
    model_engine: { label: l('ModelEngine', 'ModelEngine'), fields: [
      f('model', '模型名', 'Model', 'text'),
      f('position', '位置', 'Position', 'text'),
      f('yaw', '偏航角', 'Yaw', 'number'),
      f('pitch', '俯仰角', 'Pitch', 'number'),
    ] },
  };
  // 家具碰撞箱 (wiki furniture/variants.mdx#hitboxes)
  var HITBOX_COMMON = [
    f('position', '位置', 'Position', 'text', { hint: l('x,y,z (默认 0,0,0)', 'x,y,z (default 0,0,0)') }),
    f('blocks_building', '阻止放置', 'Blocks Building', 'bool', { hint: l('默认 true', 'Default true') }),
    f('can_use_item_on', '物品可交互', 'Can Use Item On', 'bool', { hint: l('默认 true', 'Default true') }),
    f('can_be_hit_by_projectile', '可被弹射物击中', 'Can Be Hit By Projectile', 'bool', { hint: l('默认 true', 'Default true') }),
    f('seats', '座位', 'Seats', 'lines', { hint: l('每行一个: x,y,z [yaw], 如 0,0,-0.1 0', 'One per line: x,y,z [yaw], e.g. 0,0,-0.1 0') }),
  ];
  var FURNITURE_HITBOX_TYPES = {
    interaction: { label: l('交互 (interaction)', 'Interaction'), fields: [
      f('width', '宽度', 'Width', 'number', { hint: l('或用 scale: 1,2 简写宽×高', 'Or scale: 1,2 as width×height shorthand') }),
      f('height', '高度', 'Height', 'number', { hint: l('交互箱高度 (方块)', 'Hitbox height in blocks') }),
      f('scale', '缩放', 'Scale', 'text'),
      f('interactive', '可交互', 'Interactive', 'bool', { hint: l('玩家可点击 (默认 true)', 'Players can click (default true)') }),
      f('invisible', 'F3+B 不可见', 'Invisible (F3+B)', 'bool'),
    ].concat(HITBOX_COMMON) },
    shulker: { label: l('潜影盒 (shulker)', 'Shulker'), fields: [
      f('scale', '缩放', 'Scale', 'number', { hint: l('尺寸倍率 (默认 1)', 'Size multiplier (default 1)') }),
      f('peek', '开启程度', 'Peek', 'number', { hint: l('0~100 (默认 0)', '0~100 (default 0)') }),
      f('direction', '方向', 'Direction', 'select', { options: ['UP', 'DOWN', 'NORTH', 'WEST', 'EAST', 'SOUTH'] }),
      f('interaction_entity', '附加交互实体', 'Interaction Entity', 'bool', { hint: l('额外生成交互实体提高点击精度', 'Extra interaction entity for click accuracy') }),
      f('interactive', '可交互', 'Interactive', 'bool'),
      f('invisible', 'F3+B 不可见', 'Invisible (F3+B)', 'bool'),
    ].concat(HITBOX_COMMON) },
    happy_ghast: { label: l('悦灵 (happy_ghast)', 'Happy Ghast'), fields: [
      f('scale', '缩放', 'Scale', 'number', { hint: l('尺寸倍率 (默认 1); 基础 4×4 格', 'Size multiplier (default 1); base 4×4 blocks') }),
    ].concat(HITBOX_COMMON) },
    custom: { label: l('自定义实体 (custom)', 'Custom'), fields: [
      f('scale', '缩放', 'Scale', 'number', { hint: l('乘以实体自然大小', 'Multiplies the entity size') }),
      f('entity_type', '实体类型', 'Entity Type', 'text', { hint: l('任意原版实体 ID, 如 minecraft:creeper (默认 slime)', 'Any vanilla entity id, e.g. minecraft:creeper (default slime)') }),
    ].concat(HITBOX_COMMON) },
  };
  // 家具行为 (wiki furniture/behaviors.mdx)
  var FURNITURE_BEHAVIOR_TYPES = {
    simple_storage_furniture: { label: l('简单存储 (simple_storage_furniture)', 'Simple Storage'), fields: [
      f('title', '标题', 'Title', 'text', { hint: l('GUI 标题, 支持 MiniMessage (默认 <lang:container.chest>)', 'GUI title, MiniMessage (default <lang:container.chest>)') }),
      f('rows', '行数', 'Rows', 'number', { hint: l('1~6 (默认 1)', '1~6 (default 1)') }),
      f('data_key', '数据键', 'Data Key', 'text', { hint: l('NBT 持久化键 (默认 craftengine:simple_storage_contents)', 'NBT key (default craftengine:simple_storage_contents)') }),
      f('sounds', '音效', 'Sounds', 'object', { fields: [
        soundRefField('open', '打开', 'Open'),
        soundRefField('close', '关闭', 'Close'),
      ], label: l('音效', 'Sounds') }),
      f('variants', '变体交互箱', 'Variants', 'mapOf', { valueType: { type: 'object', fields: [
        f('hitboxes', '碰撞箱', 'Hitboxes', 'listOf', { itemType: { type: 'union', types: FURNITURE_HITBOX_TYPES, label: l('碰撞箱', 'Hitbox') }, label: l('碰撞箱', 'Hitboxes') }),
      ], label: l('变体', 'Variant') }, label: l('变体交互箱', 'Variants'), hint: l('每变体独立交互碰撞箱', 'Per-variant interaction hitboxes') }),
    ] },
    glowing_furniture: { label: l('发光 (glowing_furniture)', 'Glowing'), fields: [
      f('lights', '光源', 'Lights', 'listOf', { itemType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('光源', 'Light'), types: {
        details: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
          f('position', '位置', 'Position', 'text', { hint: l('x,y,z', 'x,y,z') }),
          f('level', '亮度等级', 'Level', 'number', { hint: l('1~15 (默认 15)', '1~15 (default 15)') }),
        ], label: l('光源', 'Light') } },
      } }, label: l('光源', 'Lights'), hint: l('简写 "x,y,z 15" 或 {position, level} 对象', 'Shorthand "x,y,z 15" or {position, level}') }),
      f('variants', '变体光源', 'Variants', 'mapOf', { valueType: { type: 'lines', label: l('光源', 'Lights') }, label: l('变体光源', 'Variants'), hint: l('键: 家具变体名, 值: 光源简写列表', 'Key: furniture variant; value: light shorthands') }),
    ] },
    display_item_furniture: { label: l('展示物品 (display_item_furniture)', 'Display Item'), fields: [
      f('data_key', '数据键', 'Data Key', 'text', { hint: l('NBT 持久化键 (默认 craftengine:display_item)', 'NBT key (default craftengine:display_item)') }),
      f('sounds', '音效', 'Sounds', 'object', { fields: [
        soundRefField('put', '放入', 'Put'),
        soundRefField('take', '取出', 'Take'),
      ], label: l('音效', 'Sounds') }),
      f('variants', '变体显示位', 'Variants', 'mapOf', { valueType: { type: 'object', fields: [
        f('item_position', '物品显示位置', 'Item Position', 'text', { hint: l('x,y,z', 'x,y,z') }),
        f('hitboxes', '碰撞箱', 'Hitboxes', 'listOf', { itemType: { type: 'union', types: FURNITURE_HITBOX_TYPES, label: l('碰撞箱', 'Hitbox') }, label: l('碰撞箱', 'Hitboxes') }),
      ], label: l('变体', 'Variant') }, label: l('变体显示位', 'Variants') }),
    ] },
  };
  var FURNITURE_SETTINGS_FIELDS = [
    f('item', '对应物品', 'Item', 'text', { hint: l('创造模式中键拾取 (默认自动为家具 ID)', 'Creative middle-click (defaults to furniture id)') }),
    f('hit_times', '破坏次数', 'Hit Times', 'number', { hint: l('默认 0 = 一击破坏; 停手 2 秒重置', 'Default 0 = instant; resets after 2s') }),
    f('sounds', '音效', 'Sounds', 'popup', { content: FURNITURE_SOUND_OBJECT, label: l('音效', 'Sounds') }),
    f('adventure_mode_breaking', '冒险模式可破坏', 'Adventure Mode Breaking', 'bool'),
    f('correct_tools', '正确工具', 'Correct Tools', 'lines', { hint: l('#minecraft:axes = 标签; minecraft:diamond_pickaxe = 物品 ID', '#tag = tag; plain id = item') }),
  ];
  var FURNITURE_VARIANT_FIELDS = [
    f('loot_spawn_offset', '掉落偏移', 'Loot Spawn Offset', 'text', { hint: l('掉落物生成偏移 (默认 0,0,0)', 'Drop spawn offset (default 0,0,0)') }),
    f('elements', '显示元素', 'Elements', 'listOf', { itemType: { type: 'union', types: FURNITURE_ELEMENT_TYPES, label: l('元素', 'Element') }, label: l('显示元素', 'Elements'), hint: l('7 种显示元素, 可多个组合', '7 display element types, combinable') }),
    f('hitboxes', '碰撞箱', 'Hitboxes', 'listOf', { itemType: { type: 'union', types: FURNITURE_HITBOX_TYPES, label: l('碰撞箱', 'Hitbox') }, label: l('碰撞箱', 'Hitboxes'), hint: l('交互/碰撞/座位定义', 'Interaction, collision, seats') }),
    f('entity_culling', '实体剔除', 'Entity Culling', 'union', { noTypeKey: true, allowScalar: { type: 'bool' }, label: l('实体剔除', 'Entity Culling'), types: ENTITY_CULLING_TYPES }),
    f('blueprint', '外部模型', 'Blueprint', 'text', { hint: l('BetterModel/ModelEngine/自定义 API 模型 ID (每变体仅一个)', 'External plugin model id (one per variant)') }),
  ];
  // 变体映射 (弹窗 content): 键=变体名, 值=标量或详细定义
  var FURNITURE_VARIANTS_MAP = {
    type: 'mapOf',
    valueType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('变体', 'Variant'), types: {
      details: { label: l('详细', 'Detailed'), widget: { type: 'object', fields: FURNITURE_VARIANT_FIELDS, label: l('变体', 'Variant') } },
    } },
    label: l('变体', 'Variants'),
    hint: l('键: 变体名 (ground/ceiling/wall/自定义)', 'Key: variant name (ground/ceiling/wall/custom)'),
  };
  SECTIONS.furniture = {
    tabs: [
      { key: 'variants', label: l('变体', 'Variants') },
      { key: 'settings', label: l('设置', 'Settings') },
      { key: 'behaviors', label: l('行为', 'Behaviors') },
      { key: 'loot', label: l('掉落', 'Loot') },
      { key: 'events', label: l('事件', 'Events') },
      { key: 'custom', label: l('自定义', 'Custom') },
    ],
    fields: [
      f('variants', '变体', 'Variants', 'popup', { content: FURNITURE_VARIANTS_MAP, label: l('变体', 'Variants'), tab: 'variants' }),
      f('settings', '设置', 'Settings', 'object', { fields: FURNITURE_SETTINGS_FIELDS, label: l('设置', 'Settings'), tab: 'settings' }),
      f('behavior', '行为', 'Behavior', 'union', { types: FURNITURE_BEHAVIOR_TYPES, label: l('行为', 'Behavior'), tab: 'behaviors' }),
      f('behaviors', '组合行为', 'Behaviors', 'listOf', { itemType: { type: 'union', types: FURNITURE_BEHAVIOR_TYPES, label: l('行为', 'Behavior') }, label: l('组合行为', 'Behaviors'), tab: 'behaviors' }),
      f('loot', '掉落', 'Loot', 'object', { fields: LOOT_OBJECT_FIELDS, label: l('掉落', 'Loot'), tab: 'loot' }),
      f('events', '事件', 'Events', 'events', { tab: 'events', custom: 'events' }),
      f('merges', '合并', 'Merges', 'kv', { tab: 'events' }),
      f('overrides', '覆盖', 'Overrides', 'kv', { tab: 'events' }),
    ],
  };

  // ---- recipe section (wiki recipe.mdx) ----
  var RECIPE_TYPE_OPTIONS = ['shaped', 'shaped_transform', 'shapeless', 'shapeless_transform', 'smelting', 'blasting', 'smoking', 'campfire_cooking', 'stonecutting', 'smithing_transform', 'smithing_trim', 'brewing'];
  var RECIPE_CATEGORY_OPTIONS = ['building', 'redstone', 'equipment', 'misc', 'food', 'blocks'];
  // 材料谓词 (额外条件)
  var RECIPE_PREDICATE_TYPES = {
    enchantment: { label: l('附魔 (enchantment)', 'Enchantment'), fields: [
      f('enchantments', '附魔映射', 'Enchantments', 'mapOf', { valueType: { type: 'scalar' }, label: l('附魔映射', 'Enchantments'), hint: l('键: 附魔 ID, 值: 等级', 'Key: enchantment id, value: level') }),
    ] },
    exact: { label: l('精确组件 (exact)', 'Exact Component'), fields: [
      f('component', '组件', 'Component', 'text', { hint: l('如 minecraft:custom_name', 'e.g. minecraft:custom_name') }),
      f('value', '值 (NBT)', 'Value', 'text', { hint: l('NBT 标签值', 'NBT tag value') }),
    ] },
  };
  // 结果后处理器 (wiki recipe.mdx: 目前只有 apply_data, 其余可经 API 注册)
  var POST_PROCESSOR_TYPES = {
    apply_data: { label: l('应用数据 (apply_data)', 'Apply Data'), fields: [
      f('data', '数据', 'Data', 'kv', { hint: l('如 enchantment: {minecraft:efficiency: 5}', 'e.g. enchantment: {minecraft:efficiency: 5}') }),
    ] },
  };
  // 变换处理器 (wiki recipe.mdx#transform-processors)
  var TRANSFORM_PROCESSOR_TYPES = {
    apply_data: { label: l('应用数据 (apply_data)', 'Apply Data'), fields: [
      f('data', '数据', 'Data', 'kv'),
    ] },
    merge_enchantments: { label: l('合并附魔 (merge_enchantments)', 'Merge Enchantments') },
    keep_custom_data: { label: l('保留自定义数据 (keep_custom_data)', 'Keep Custom Data'), fields: [
      f('paths', '路径', 'Paths', 'lines', { hint: l('如 weapon / energy.fly (每行一个)', 'e.g. weapon / energy.fly (one per line)') }),
    ] },
    keep_components: { label: l('保留组件 (keep_components)', 'Keep Components'), fields: [
      f('components', '组件', 'Components', 'lines', { hint: l('如 minecraft:enchantments (每行一个)', 'e.g. minecraft:enchantments (one per line)') }),
    ] },
    keep_tags: { label: l('保留 NBT 标签 (keep_tags)', 'Keep Tags'), fields: [
      f('tags', '标签', 'Tags', 'lines', { hint: l('如 display.Name (每行一个)', 'e.g. display.Name (one per line)') }),
    ] },
  };
  // 材料详细对象 (item/items 别名, count, source, predicate)
  var RECIPE_INGREDIENT_DETAILS = { label: l('详细', 'Detailed'), widget: { type: 'object', fields: [
    f('item', '物品 (item)', 'Item (item)', 'text', { datalist: 'items' }),
    f('items', '物品 (items)', 'Items (items)', 'text', { datalist: 'items' }),
    f('count', '数量', 'Count', 'number'),
    f('source', '源物品', 'Source', 'bool', { hint: l('标记为源物品, 其数据合并到结果', 'Mark as source; data merges into result') }),
    f('predicate', '谓词', 'Predicate', 'listOf', { itemType: { type: 'union', noTypeKey: true, types: RECIPE_PREDICATE_TYPES, label: l('谓词', 'Predicate') }, label: l('谓词', 'Predicates'), hint: l('额外条件, 如附魔等级要求', 'Extra conditions, e.g. enchantment requirements') }),
  ], label: l('材料', 'Ingredient') } };
  // 材料值: 字符串/标签 或 详细 (含嵌套列表, shapeless 条目用)
  var RECIPE_INGREDIENT_TYPES = {
    details: RECIPE_INGREDIENT_DETAILS,
    nested: { label: l('嵌套列表', 'Nested List'), widget: { type: 'listOf', label: l('材料', 'Ingredients'), itemType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('材料', 'Ingredient'), types: RECIPE_INGREDIENT_TYPES_REF } } },
  };
  function RECIPE_INGREDIENT_TYPES_REF() { return RECIPE_INGREDIENT_TYPES; }
  // 材料值: 字符串/标签 或 详细 (无嵌套, shaped 网格与单材料字段用)
  var RECIPE_INGREDIENT_TYPES_SIMPLE = { details: RECIPE_INGREDIENT_DETAILS };
  // ingredients 形状: shaped 网格 map / shapeless 列表
  var RECIPE_INGREDIENTS_SHAPE_TYPES = {
    map: { label: l('网格 (shaped)', 'Grid (shaped)'), widget: { type: 'mapOf', label: l('材料', 'Ingredients'), valueType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('材料', 'Ingredient'), types: RECIPE_INGREDIENT_TYPES_SIMPLE }, hint: l('键: 网格字符 (A/B/C...)', 'Key: grid char (A/B/C...)') } },
    list: { label: l('列表 (shapeless)', 'List (shapeless)'), widget: { type: 'listOf', label: l('材料', 'Ingredients'), itemType: { type: 'union', noTypeKey: true, allowScalar: { type: 'text' }, label: l('材料', 'Ingredient'), types: RECIPE_INGREDIENT_TYPES } } },
  };
  function recipeIngredientField(key, zh, en, opts) {
    var o = { noTypeKey: true, allowScalar: { type: 'text', placeholder: l('default:topaz 或 #minecraft:planks', 'default:topaz or #minecraft:planks') }, label: l('材料', 'Ingredient'), types: RECIPE_INGREDIENT_TYPES_SIMPLE };
    if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    return f(key, zh, en, 'union', o);
  }
  var RECIPE_RESULT_FIELDS = [
    f('id', '结果物品', 'Result Item', 'text', { datalist: 'items' }),
    f('count', '数量', 'Count', 'number'),
    f('post_processors', '结果后处理器', 'Post Processors', 'listOf', { itemType: { type: 'union', types: POST_PROCESSOR_TYPES, label: l('处理器', 'Processor') }, label: l('结果后处理器', 'Post Processors'), hint: l('对最终产物额外处理 (目前只有 apply_data 类型, 可经 API 注册新处理器)', 'Extra processing on the final product (only apply_data so far, more via API)') }),
  ];
  SECTIONS.recipe = {
    tabs: [
      { key: 'basic', label: l('基础', 'Basic') },
      { key: 'result', label: l('结果', 'Result') },
      { key: 'advanced', label: l('高级', 'Advanced') },
      { key: 'other', label: l('其他', 'Other') },
      { key: 'custom', label: l('自定义', 'Custom') },
    ],
    fields: [
      f('type', '类型', 'Type', 'select', { options: RECIPE_TYPE_OPTIONS, tab: 'basic', hint: l('配方类型, 如 shaped / shapeless / smelting / smithing_trim / brewing', 'Recipe type, e.g. shaped / shapeless / smelting / smithing_trim / brewing') }),
      f('pattern', '图案', 'Pattern', 'linesScalar', { hint: l('shaped: 每行一个网格行; smithing_trim: 修饰图案 ID', 'Shaped: one grid row per line; smithing_trim: trim pattern id'), tab: 'basic' }),
      f('ingredients', '材料', 'Ingredients', 'union', { noTypeKey: true, label: l('材料', 'Ingredients'), tab: 'basic', types: RECIPE_INGREDIENTS_SHAPE_TYPES }),
      recipeIngredientField('ingredient', '材料', 'Ingredient', { tab: 'basic', hint: l('烹饪/切石/酿造: 单个材料', 'Cooking/stonecutting/brewing: single ingredient') }),
      f('experience', '经验', 'Experience', 'number', { tab: 'basic', hint: l('烹饪配方 (smelting 系)', 'Cooking recipes (smelting family)') }),
      f('time', '时间 (tick)', 'Time', 'number', { tab: 'basic', hint: l('烹饪时间, 默认 200', 'Cooking time, default 200') }),
      f('template_type', '模板', 'Template Type', 'text', { tab: 'basic', hint: l('smithing: 槽位 1 (可选)', 'Smithing slot 1 (optional)') }),
      recipeIngredientField('base', '基底', 'Base', { tab: 'basic', hint: l('smithing: 槽位 2 (必需)', 'Smithing slot 2 (required)') }),
      recipeIngredientField('addition', '附加', 'Addition', { tab: 'basic', hint: l('smithing: 槽位 3 (可选)', 'Smithing slot 3 (optional)') }),
      recipeIngredientField('container', '容器', 'Container', { tab: 'basic', hint: l('酿造: 药水瓶/水瓶', 'Brewing: bottle') }),
      f('result', '结果', 'Result', 'object', { fields: RECIPE_RESULT_FIELDS, label: l('结果', 'Result'), tab: 'result' }),
      f('visual_result', '视觉结果', 'Visual Result', 'object', { fields: RECIPE_RESULT_FIELDS, label: l('视觉结果', 'Visual Result'), tab: 'result', hint: l('隐藏真实产物 (随机产物配方用)', 'Hides the real outcome (randomized recipes)') }),
      f('transform_processors', '变换处理器', 'Transform Processors', 'listOf', { itemType: { type: 'union', types: TRANSFORM_PROCESSOR_TYPES, label: l('处理器', 'Processor') }, label: l('变换处理器', 'Transform Processors'), tab: 'advanced', hint: l('变换配方: 控制源物品数据合并到结果', 'Transform recipes: control source data merging') }),
      f('merge_components', '合并组件', 'Merge Components', 'bool', { tab: 'advanced', hint: l('合并源物品组件 (默认 true)', 'Merge source components (default true)') }),
      f('category', '分类', 'Category', 'select', { options: RECIPE_CATEGORY_OPTIONS, tab: 'advanced', hint: l('烹饪: food/blocks/misc; 合成: building/redstone/equipment/misc', 'Cooking: food/blocks/misc; Crafting: building/redstone/equipment/misc') }),
      f('group', '组', 'Group', 'text', { tab: 'advanced', hint: l('客户端解锁后同组归并显示', 'Same group shows together after unlock') }),
      f('unlock_on_ingredient_obtained', '获得材料解锁', 'Unlock on Ingredient', 'bool', { tab: 'advanced' }),
      f('unlock_on_join', '入服解锁', 'Unlock on Join', 'bool', { tab: 'advanced' }),
      f('conditions', '条件', 'Conditions', 'listOf', { itemType: { type: 'union', negatable: true, types: COND_TYPES }, label: l('条件', 'Conditions'), tab: 'other', hint: l('不满足条件的玩家无法使用', 'Players failing these cannot use the recipe') }),
      f('functions', '函数', 'Functions', 'listOf', { itemType: { type: 'union', types: FN_TYPES }, label: l('函数', 'Functions'), tab: 'other', hint: l('成功合成/锻造时运行', 'Run when crafted/smithed successfully') }),
    ],
  };

  // ---- item section ----
  SECTIONS.item = {
    tabs: [
      { key: 'basic', label: l('基础', 'Basic') },
      { key: 'data', label: l('数据', 'Data') },
      { key: 'model', label: l('模型', 'Model') },
      { key: 'behavior', label: l('行为', 'Behavior') },
      { key: 'settings', label: l('设置', 'Settings') },
      { key: 'events', label: l('事件', 'Events') },
      { key: 'custom', label: l('自定义', 'Custom') },
    ],
    fields: [
      // 基础
      f('material', '材质', 'Material', 'text', { datalist: 'items', tab: 'basic' }),
      f('custom_model_data', 'Custom Model Data', 'Custom Model Data', 'union', { noTypeKey: true, allowScalar: { type: 'scalar' }, types: CUSTOM_MODEL_DATA_TYPES, tab: 'basic', label: l('Custom Model Data', 'Custom Model Data') }),
      f('texture', '纹理', 'Texture', 'text', { hint: l('如 minecraft:item/custom/xxx', 'e.g. minecraft:item/custom/xxx'), tab: 'basic', layout: 'stack' }),
      f('textures', '纹理列表 (模型简写)', 'Textures (model shorthand)', 'linesScalar', { hint: l('多个纹理 = 动画帧/部位 (每行一个)', 'One texture per line; multiple = animation frames/parts'), tab: 'basic' }),
      f('category', '分类', 'Category', 'linesScalar', { hint: l('多行 = 多个分类', 'Multiple lines = several categories'), picker: 'categories', tab: 'basic' }),
      f('template', '模板', 'Template', 'linesScalar', { hint: l('多行 = 多个模板', 'Multiple lines = several templates'), picker: 'templates', tab: 'basic' }),
      f('arguments', '参数', 'Arguments', 'mapOf', { valueType: { type: 'scalar' }, label: l('参数', 'Arguments'), tab: 'basic' }),
      f('client_bound_material', '客户端材质', 'Client Bound Material', 'text', { datalist: 'items', tab: 'basic' }),
      // 可覆盖变体 (仅当物品没有对应数据时生效, 允许其他插件设置自己的值)
      f('overwritable_lore', '可覆盖 Lore', 'Overwritable Lore', 'lines', { hint: l('仅当物品没有 lore 时生效', 'Only takes effect when no lore is present'), tab: 'basic' }),
      f('overwritable_item_name', '可覆盖名称', 'Overwritable Item Name', 'text', { hint: l('仅当物品没有自定义名时生效', 'Only takes effect when no custom name is present'), tab: 'basic' }),
      f('overwritable_item_model', '可覆盖模型', 'Overwritable Item Model', 'text', { hint: l('1.21.2+; 仅当物品没有模型时生效', '1.21.2+; only set if no model is present'), tab: 'basic' }),
      f('overwritable_custom_model_data', '可覆盖 CMD', 'Overwritable Custom Model Data', 'scalar', { hint: l('仅当物品没有 CMD 时生效', 'Only set if no CMD is present'), tab: 'basic' }),
      // 数据 (六类子选项卡, 客户端数据 bind 根级 client_bound_data)
      f('data', '数据', 'Data', 'tabs', { tabs: ITEM_DATA_TABS_SIX, label: l('数据', 'Data'), tab: 'data' }),
      // 模型
      f('hand_animation_on_swap', '切换时手部动画', 'Hand Animation On Swap', 'bool', { hint: l('持有物品变化时是否播放第一人称切换动画; 默认 true', 'Whether the first-person swap animation plays when the held item changes; default true'), tab: 'model' }),
      f('oversized_in_gui', 'GUI 超界渲染', 'Oversized In GUI', 'bool', { hint: l('true = 禁用 GUI 槽位裁剪, 模型可渲染得比槽位大; 默认 true', 'Disables GUI slot clipping, model can render larger than the slot; default true'), tab: 'model' }),
      f('swap_animation_scale', '切换动画速度', 'Swap Animation Scale', 'number', { hint: l('切换动画的速度倍率, 越大越快; 默认 1.0', 'Speed multiplier for the swap animation; larger = faster; default 1.0'), tab: 'model' }),
      f('item_model', '物品模型', 'Item Model', 'model', { tab: 'model' }),
      f('model', '模型 (旧键)', 'Model (legacy)', 'model', { tab: 'model' }),
      f('legacy_model', '旧版模型', 'Legacy Model', 'object', { hint: l('1.21.4 前兼容; 通常自动转换, 仅在自动转换结果错误时使用', 'Pre-1.21.4 compatibility; auto-converted automatically, only use if the conversion is incorrect'), fields: LEGACY_MODEL_FIELDS, tab: 'model' }),
      // 行为
      f('behavior', '行为', 'Behavior', 'union', { types: ITEM_BEHAVIOR_TYPES, label: l('行为', 'Behavior'), tab: 'behavior' }),
      f('behaviors', '组合行为', 'Behaviors', 'listOf', { itemType: { type: 'union', types: ITEM_BEHAVIOR_TYPES, label: l('行为', 'Behavior') }, label: l('组合行为', 'Behaviors'), tab: 'behavior' }),
      f('updater', '更新器', 'Updater', 'mapOf', { valueType: { type: 'union', noTypeKey: true, label: l('更新', 'Update'), types: UPDATER_VALUE_TYPES }, label: l('更新器', 'Updater'), hint: l('键: 版本号, 值: 步骤或步骤列表', 'Key: version, value: step or steps'), tab: 'behavior' }),
      // 设置
      f('settings', '设置', 'Settings', 'object', { fields: ITEM_SETTINGS_FIELDS, label: l('设置', 'Settings'), tab: 'settings' }),
      // 事件
      f('events', '事件', 'Events', 'events', { tab: 'events', custom: 'events' }),
      f('merges', '合并', 'Merges', 'kv', { tab: 'events' }),
      f('overrides', '覆盖', 'Overrides', 'kv', { tab: 'events' }),
    ],
  };

  // ============ 插件 config.yml (S.config) ============
  // 数据源: 插件 config.yml 实测 + wiki reference/file_conflict.mdx + getting_start/installation.mdx
  var CONFIG_TERM_TYPES = {
    all_of: { label: l('全部满足 (all_of)', 'All Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', types: CONFIG_TERM_TYPES_REF }, label: l('子条件', 'Terms') })] },
    any_of: { label: l('任一满足 (any_of)', 'Any Of'), fields: [f('terms', '子条件', 'Terms', 'listOf', { itemType: { type: 'union', types: CONFIG_TERM_TYPES_REF }, label: l('子条件', 'Terms') })] },
    inverted: { label: l('取反 (inverted)', 'Inverted'), fields: [f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') })] },
    filename: { label: l('文件名匹配', 'Filename'), fields: [f('name', '文件名', 'Name', 'text')] },
    exact: { label: l('精确路径', 'Exact Path'), fields: [f('path', '路径', 'Path', 'text')] },
    parent_path_prefix: { label: l('路径前缀', 'Path Prefix'), fields: [f('path', '路径', 'Path', 'text')] },
    parent_path_suffix: { label: l('路径后缀', 'Path Suffix'), fields: [f('path', '路径', 'Path', 'text')] },
    contains: { label: l('包含字符', 'Contains'), fields: [f('path', '路径', 'Path', 'text')] },
    pattern: { label: l('正则匹配', 'Pattern'), fields: [f('pattern', '正则', 'Pattern', 'text')] },
  };
  function CONFIG_TERM_TYPES_REF() { return CONFIG_TERM_TYPES; }
  var CONFIG_RESOLUTION_TYPES = {
    merge_json: { label: l('合并 JSON', 'Merge JSON'), fields: [f('deeply', '深度合并', 'Deeply', 'bool')] },
    retain_matching: { label: l('保留匹配项', 'Retain Matching'), fields: [f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') })] },
    conditional: { label: l('条件解决', 'Conditional'), fields: [
      f('term', '条件', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('条件', 'Term') }),
      f('resolution', '解决方式', 'Resolution', 'union', { types: CONFIG_RESOLUTION_TYPES_REF, label: l('解决方式', 'Resolution') }),
    ] },
    merge_pack_mcmeta: { label: l('合并 pack.mcmeta', 'Merge Pack Mcmeta'), fields: [f('description', '描述', 'Description', 'text')] },
    merge_atlas: { label: l('合并 Atlas', 'Merge Atlas') },
    merge_font: { label: l('合并字体', 'Merge Font') },
  };
  function CONFIG_RESOLUTION_TYPES_REF() { return CONFIG_RESOLUTION_TYPES; }
  var CONFIG_HOSTING_TYPES = {
    self: { label: l('内置 HTTP 服务器', 'Self Hosting'), fields: [
      f('ip', 'IP', 'IP', 'text', { hint: l('默认 auto', 'Default: auto') }),
      f('port', '端口', 'Port', 'text', { hint: l('默认 auto', 'Default: auto') }),
      f('protocol', '协议', 'Protocol', 'select', { options: ['http', 'https'] }),
      f('deny-non-minecraft-request', '拒绝非 MC 请求', 'Deny Non-Minecraft Request', 'bool'),
      f('one-time-token', '一次性令牌', 'One-Time Token', 'bool'),
      f('rate-limit', '限流', 'Rate Limit', 'object', { fields: [
        f('max-requests', '最大请求数', 'Max Requests', 'number'),
        f('reset-interval', '重置间隔 (秒)', 'Reset Interval (seconds)', 'number'),
      ] }),
    ] },
    external: { label: l('外部 URL', 'External'), fields: [f('url', 'URL', 'URL', 'text')] },
    lobfile: { label: l('Lobfile', 'Lobfile'), fields: [f('url', 'URL', 'URL', 'text'), f('api-key', 'API 密钥', 'API Key', 'text')] },
    s3: { label: l('S3 对象存储', 'S3'), fields: [
      f('endpoint', '端点', 'Endpoint', 'text'), f('bucket', '存储桶', 'Bucket', 'text'),
      f('region', '区域', 'Region', 'text'), f('access-key-id', 'Access Key ID', 'Access Key ID', 'text'),
      f('secret-access-key', 'Secret Access Key', 'Secret Access Key', 'text'), f('path-prefix', '路径前缀', 'Path Prefix', 'text'),
    ] },
    openlist: { label: l('OpenList', 'OpenList'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
    onedrive: { label: l('OneDrive', 'OneDrive'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
    gitlab: { label: l('GitLab', 'GitLab'), fields: [f('url', 'URL', 'URL', 'text'), f('project-id', '项目 ID', 'Project ID', 'text'), f('token', '令牌', 'Token', 'text')] },
    dropbox: { label: l('Dropbox', 'Dropbox'), fields: [f('url', 'URL', 'URL', 'text'), f('token', '令牌', 'Token', 'text')] },
  };
  function CONFIG_HOSTING_TYPES_REF() { return CONFIG_HOSTING_TYPES; }

  // 资源包导航按钮 (gui.browser.*.page-navigation) 共用
  var CFG_PAGE_NAV = [
    f('next', '下一页', 'Next', 'object', { fields: [
      f('available', '可用', 'Available', 'text'), f('not-available', '不可用', 'Not Available', 'text'),
    ] }),
    f('previous', '上一页', 'Previous', 'object', { fields: [
      f('available', '可用', 'Available', 'text'), f('not-available', '不可用', 'Not Available', 'text'),
    ] }),
  ];

  var CONFIG = {
    'config-version': { type: 'text', label: l('配置版本', 'Config Version'), hint: l('请勿修改此值', 'Do not modify this value') },
    metrics: { type: 'bool', label: l('统计 (BStats)', 'Metrics'), hint: l('启用或禁用通过 BStats 收集信息', 'Enable or disable BStats data collection') },
    'update-checker': { type: 'bool', label: l('版本检查', 'Update Checker'), hint: l('自动检查插件新版本', 'Auto-check for new plugin versions') },
    'forced-locale': { type: 'text', label: l('强制语言', 'Forced Locale'), hint: l('如 zh_cn, 留空 = 自动', 'e.g. zh_cn, empty = auto') },

    'resource-pack': { fields: [
      f('path', '生成路径', 'Path', 'text', { hint: l('资源包输出位置 (绝对或相对路径)', 'Absolute or relative output path') }),
      f('supported-version', '支持版本范围', 'Supported Version', 'object', { fields: [
        f('min', '最低版本', 'Min', 'text', { hint: l('如 SERVER / 1.20.1', 'e.g. SERVER / 1.20.1') }),
        f('max', '最高版本', 'Max', 'text', { hint: l('如 LATEST', 'e.g. LATEST') }),
      ] }),
      f('description', '描述', 'Description', 'miniText'),
      f('remove-tinted-leaves-particle', '移除落叶粒子', 'Remove Tinted Leaves Particle', 'bool', { hint: l('移除 1.21.5+ 的落叶粒子效果', 'Removes the 1.21.5+ tinted leaves particles') }),
      f('overlay-format', '覆盖层目录名', 'Overlay Format', 'text', { hint: l('如 ce_overlay_{version}', 'e.g. ce_overlay_{version}') }),
      f('override-uniform-font', '覆盖 uniform 字体', 'Override Uniform Font', 'bool', { hint: l('让 minecraft:default 字体中的图像在 minecraft:uniform 中生效', 'Applies default font images to the uniform font') }),
      f('generate-mod-assets', '生成模组资源', 'Generate Mod Assets', 'bool', { hint: l('为 CraftEngine fabric 模组 (客户端 Axiom/WorldEdit) 生成资源包', 'Generate assets for the CraftEngine fabric mod') }),
      f('exclude-core-shaders', '排除核心着色器', 'Exclude Core Shaders', 'bool'),
      f('merge-external-folders', '合并外部文件夹', 'Merge External Folders', 'lines', { hint: l('每行一个资源包文件夹', 'One pack folder per line') }),
      f('merge-external-zip-files', '合并外部 ZIP', 'Merge External Zip Files', 'lines', { hint: l('每行一个 zip 文件', 'One zip file per line') }),
      f('exclude-file-extensions', '排除扩展名', 'Exclude File Extensions', 'lines', { hint: l('如 md / psd / bbmodel (每行一个)', 'e.g. md / psd / bbmodel (one per line)') }),
      f('duplicated-files-handler', '冲突文件处理', 'Duplicated Files Handler', 'listOf', {
        label: l('冲突文件处理', 'Duplicated Files Handler'),
        hint: l('依次匹配, 使用第一个符合条件解决方式', 'First matching resolution wins'),
        itemType: { type: 'object', fields: [
          f('term', '匹配规则', 'Term', 'union', { types: CONFIG_TERM_TYPES_REF, label: l('匹配规则', 'Term') }),
          f('resolution', '解决方式', 'Resolution', 'union', { types: CONFIG_RESOLUTION_TYPES_REF, label: l('解决方式', 'Resolution') }),
        ] },
      }),
      f('validation', '校验', 'Validation', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('fix-atlas', '修复图集', 'Fix Atlas', 'bool', { hint: l('修复不在图集内的纹理', 'Fix textures not within the atlas') }),
        f('fix-missing-texture', '修复缺失纹理', 'Fix Missing Texture', 'bool', { hint: l('修复 #missing 导致的模型错误', 'Fix model errors caused by #missing') }),
      ] }),
      f('optimization', '优化', 'Optimization', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('texture', '纹理优化', 'Texture', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'),
          f('zopfli-iterations', 'Zopfli 迭代次数', 'Zopfli Iterations', 'number', { hint: l('0 = 禁用 (很慢, 4~8 一般足够)', '0 = disabled (very slow, 4-8 usually enough)') }),
          f('exclude', '排除', 'Exclude', 'lines', { hint: l('每行一个纹理路径', 'One texture path per line') }),
        ] }),
        f('json', 'JSON 优化', 'JSON', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('exclude', '排除', 'Exclude', 'lines'),
        ] }),
      ] }),
      f('protection', '资源包保护', 'Protection', 'object', { fields: [
        f('unprotected-copy', '生成未保护副本', 'Unprotected Copy', 'bool', { hint: l('完全使用标准 Java 库创建, 兼容其他程序', 'Standard-java copy, compatible with other tools') }),
        f('crash-tools', 'Crash 工具', 'Crash Tools', 'object', { fields: [
          f('method-1', '方法 1', 'Method 1', 'bool'), f('method-2', '方法 2', 'Method 2', 'bool'),
          f('method-3', '方法 3', 'Method 3', 'bool', { hint: l('体积增加约 0.67MB', 'Adds ~0.67MB to the pack') }),
          f('method-4', '方法 4', 'Method 4', 'bool'), f('method-5', '方法 5', 'Method 5', 'bool'),
          f('method-6', '方法 6', 'Method 6', 'bool'), f('method-7', '方法 7', 'Method 7', 'bool'),
        ] }),
        f('incorrect-crc', '错误 CRC', 'Incorrect CRC', 'bool'),
        f('fake-file-size', '伪造文件大小', 'Fake File Size', 'bool'),
        f('escape-json', '转义 JSON', 'Escape JSON', 'bool', { hint: l('让 JSON 不可读', 'Make JSON human-unreadable') }),
        f('fake-directory', '伪造目录', 'Fake Directory', 'bool'),
        f('break-texture', '破坏纹理文件', 'Break Texture', 'bool'),
        f('obfuscation', '混淆', 'Obfuscation', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('seed', '种子', 'Seed', 'number', { hint: l('0 = 随机', '0 = random') }),
          f('overlay', '覆盖层', 'Overlay', 'object', { fields: [f('length', '长度', 'Length', 'number', { hint: l('0 = 禁用', '0 = disabled') })] }),
          f('namespace', '命名空间', 'Namespace', 'object', { fields: [
            f('amount', '数量', 'Amount', 'number', { hint: l('0 = 禁用', '0 = disabled') }), f('length', '长度', 'Length', 'number'),
          ] }),
          f('path', '路径', 'Path', 'object', { fields: [
            f('depth', '深度', 'Depth', 'number'), f('length', '长度', 'Length', 'number'),
            f('anti-unzip', '防解压', 'Anti Unzip', 'bool'),
          ] }),
          f('atlas', '纹理图集', 'Atlas', 'object', { fields: [
            f('prefix', '前缀', 'Prefix', 'text'), f('images-per-canvas', '每画布图片数', 'Images Per Canvas', 'number', { hint: l('-1 = 禁用', '-1 = disabled') }),
          ] }),
          f('bypass-textures', '绕过纹理', 'Bypass Textures', 'lines', { hint: l('如 minecraft:block/farmland, @vanilla_textures (每行一个)', 'e.g. minecraft:block/farmland, @vanilla_textures') }),
          f('bypass-models', '绕过模型', 'Bypass Models', 'lines'),
          f('bypass-sounds', '绕过音效', 'Bypass Sounds', 'lines'),
          f('bypass-equipments', '绕过装备', 'Bypass Equipments', 'lines'),
        ] }),
      ] }),
      f('delivery', '分发', 'Delivery', 'object', { fields: [
        f('send-on-join', '进服发送', 'Send On Join', 'bool'),
        f('kick-if-declined', '拒绝则踢出', 'Kick If Declined', 'bool'),
        f('kick-if-failed-to-apply', '应用失败则踢出', 'Kick If Failed To Apply', 'bool'),
        f('prompt', '提示文本', 'Prompt', 'miniText'),
        f('strict-player-uuid-validation', '严格 UUID 校验', 'Strict Player UUID Validation', 'bool'),
        f('auto-upload', '自动上传', 'Auto Upload', 'bool', { hint: l('生成后自动上传, 禁用后需手动 /ce upload', 'Auto-upload on generation, otherwise use /ce upload') }),
        f('resend-on-upload', '上传后重发', 'Resend On Upload', 'bool'),
        f('file-to-upload', '上传文件', 'File To Upload', 'text'),
        f('hosting', '托管方式', 'Hosting', 'listOf', {
          label: l('托管方式', 'Hosting'), hint: l('更改后运行 /ce reload all', 'Run /ce reload all after changing'),
          itemType: { type: 'union', types: CONFIG_HOSTING_TYPES_REF },
        }),
      ] }),
    ] },

    item: { fields: [
      f('client-bound-model', '客户端侧模型 (Premium)', 'Client Bound Model', 'bool', { hint: l('custom-model-data 与 item-model 默认仅在客户端生效', 'Makes CMD and item-model client-side by default') }),
      f('always-use-item-model', '始终使用 item-model', 'Always Use Item Model', 'bool', { hint: l('资源包支持 1.21.1 及以下时同时添加 item-model 优化客户端渲染', 'Adds item-model for packs supporting 1.21.1 or below') }),
      f('always-use-custom-model-data', '始终使用 custom-model-data', 'Always Use Custom Model Data', 'bool'),
      f('always-generate-model-overrides', '始终生成 model overrides', 'Always Generate Model Overrides', 'bool', { hint: l('为 1.21.2+ 资源包也生成旧版 overrides, 兼容 Bedrock 转换器', 'Generate old overrides even for 1.21.2+ packs (Bedrock converters)') }),
      f('non-italic-tag', '非斜体标签', 'Non Italic Tag', 'bool', { hint: l('在物品名称和描述中添加 <!i> 标签', 'Adds the <!i> tag to item names and lore') }),
      f('default-material', '默认材质', 'Default Material', 'text', { hint: l('未指定材质时使用的原版物品', 'Vanilla material used when none is specified'), datalist: 'items' }),
      f('update-triggers', '更新触发器', 'Update Triggers', 'object', { hint: l('物品更新器的触发条件 (性能开销较大, 仅在需要时启用)', 'Item updater triggers (performance-intensive, enable only if needed)'), fields: [
        f('click-in-inventory', '背包内点击', 'Click In Inventory', 'bool', { hint: l('对创造模式玩家无效', "Won't work for players in creative mode") }),
        f('drop', '丢弃', 'Drop', 'bool'), f('pick-up', '拾取', 'Pick Up', 'bool'),
        f('attack', '攻击', 'Attack', 'bool'),
      ] }),
      f('custom-model-data-starting-value', 'CMD 起始值', 'Custom Model Data Starting Value', 'object', { fields: [
        f('default', '默认', 'Default', 'number'),
        f('overrides', '覆盖', 'Overrides', 'mapOf', { valueType: { type: 'scalar' }, label: l('覆盖', 'Overrides'), hint: l('键 = 材质名, 值 = 起始值', 'Key = material, value = start value') }),
      ] }),
      f('default-drop-display', '默认掉落显示', 'Default Drop Display', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('format', '格式', 'Format', 'text', { hint: l('如 <arg:count>x <name>', 'e.g. <arg:count>x <name>') }),
      ] }),
      f('data-fixer-upper', '数据修复', 'Data Fixer Upper', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('fallback-version', '回退数据版本', 'Fallback Version', 'number', { hint: l('数据版本号, 见 minecraft.wiki/w/Data_version', 'Data version, see minecraft.wiki/w/Data_version') }),
      ] }),
    ] },

    equipment: { fields: [
      f('sacrificed-vanilla-armor', '牺牲的原版护甲', 'Sacrificed Vanilla Armor', 'object', { hint: l('trim 类型护甲会移除指定原版护甲的全部纹饰', 'Trim-type armor removes all trims from this vanilla armor'), fields: [
        f('type', '类型', 'Type', 'select', { options: ['chainmail', 'iron', 'gold', 'diamond', 'netherite', 'leather', 'turtle'] }),
        f('asset-id', '资源 ID', 'Asset ID', 'text', { hint: l('如 minecraft:chainmail', 'e.g. minecraft:chainmail') }),
        f('humanoid', 'Humanoid 纹理', 'Humanoid', 'text', { hint: l('如 minecraft:trims/entity/humanoid/chainmail', 'e.g. minecraft:trims/entity/humanoid/chainmail') }),
        f('humanoid-leggings', '护腿纹理', 'Humanoid Leggings', 'text'),
      ] }),
    ] },

    scripting: { fields: [
      f('js', 'JS 引擎', 'JS', 'object', { hint: l('默认禁用; 启用后需重启服务器完全生效', 'Disabled by default; requires server restart to fully apply'), fields: [
        f('enable', '启用', 'Enable', 'bool', { hint: l('启用 JavaScript 脚本系统 (需重启服务器完全生效)', 'Enables the JavaScript scripting system (requires server restart to fully apply)') }),
        f('engine', '引擎', 'Engine', 'select', { options: ['graaljs', 'nashorn'], hint: l('graaljs (~68MB) 或 nashorn (~2.4MB)', 'graaljs (~68MB) or nashorn (~2.4MB)') }),
        f('strict', '严格模式', 'Strict', 'bool', { hint: l('对常见 JS 错误 (如未声明变量) 抛错', 'Throws on common JS mistakes (undeclared variables etc.)') }),
        f('nashorn-compat', 'Nashorn 兼容模式', 'Nashorn Compat', 'bool', { hint: l('仅 GraalJS: bean getter 映射 (event.block -> getBlock())', 'GraalJS only: Nashorn compatibility mode — bean getter mapping (event.block -> getBlock())') }),
      ] }),
    ] },

    block: { fields: [
      f('serverside-blocks', '服务端方块数', 'Serverside Blocks', 'number', { hint: l('需要重启生效, 建议每次增加 1000', 'Restart required; increase by 1000 at a time') }),
      f('sound-system', '音效系统', 'Sound System', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('process-cancelled-events', '处理被取消事件', 'Process Cancelled Events', 'object', { fields: [
          f('step', '踩踏', 'Step', 'bool'), f('break', '破坏', 'Break', 'bool'),
        ] }),
      ] }),
      f('simplify-adventure-break-check', '简化冒险模式挖掘检查', 'Simplify Adventure Break Check', 'bool'),
      f('simplify-adventure-place-check', '简化冒险模式放置检查', 'Simplify Adventure Place Check', 'bool'),
      f('deceive-bukkit-material', '伪装 Bukkit 材质', 'Deceive Bukkit Material', 'object', { hint: l('自定义方块 GetMaterial() 返回值', 'GetMaterial() return value for custom blocks'), fields: [
        f('default', '默认', 'Default', 'text', { datalist: 'items' }),
        f('overrides', '覆盖', 'Overrides', 'mapOf', { valueType: { type: 'scalar' }, label: l('覆盖', 'Overrides'), hint: l('键 = 内部真实 ID (如 0, 1~8)', 'Key = internal real ID (e.g. 0, 1~8)') }),
      ] }),
    ] },

    furniture: { fields: [
      f('hide-base-entity', '隐藏基础实体', 'Hide Base Entity', 'bool', { hint: l('隐藏用于存储家具数据的实体 (建议保持启用)', 'Hides the invisible furniture-tracking entity') }),
      f('collision-entity-type', '碰撞实体类型', 'Collision Entity Type', 'select', { options: ['interaction', 'boat'], hint: l('interaction = 最佳性能; boat = 兼容部分反作弊', 'interaction = best performance; boat = anti-cheat compatibility') }),
      f('light-system', '光照系统', 'Light System', 'object', { hint: l('自定义发光方块 (glowing_furniture) 的必需设置', 'Required for glowing furniture blocks'), fields: [
        f('enable', '启用', 'Enable', 'bool', { hint: l('自定义发光方块的必需设置', 'Required for glowing custom blocks') }),
        f('async-update', '异步更新', 'Async Update', 'bool'),
      ] }),
    ] },

    emoji: { fields: [
      f('contexts', '启用环境', 'Contexts', 'object', { fields: [
        f('chat', '聊天', 'Chat', 'bool'), f('book', '书本', 'Book', 'bool'),
        f('anvil', '铁砧', 'Anvil', 'bool'), f('sign', '告示牌', 'Sign', 'bool'),
      ] }),
      f('max-emojis-per-parse', '单次解析上限', 'Max Emojis Per Parse', 'number', { hint: l('防止解析表情过多的内容造成卡顿', 'Prevent lag from emoji-heavy content') }),
    ] },

    loot: { fields: [
      f('entity-sources', '实体掉落源', 'Entity Sources', 'lines', { hint: l('每行一个插件名 (如 MythicMobs), 启用其实体掉落', 'One plugin name per line (e.g. MythicMobs), enables its entity drops') }),
    ] },

    image: { fields: [
      f('illegal-characters-filter', '非法字符过滤', 'Illegal Characters Filter', 'object', { hint: l('权限绕过: craftengine.filter.bypass.xxx', 'Bypass permission: craftengine.filter.bypass.xxx'), fields: [
        f('anvil', '铁砧', 'Anvil', 'bool'), f('book', '书本', 'Book', 'bool'),
        f('chat', '聊天', 'Chat', 'bool'), f('command', '命令', 'Command', 'bool'), f('sign', '告示牌', 'Sign', 'bool'),
      ] }),
      f('codepoint-starting-value', '码点起始值', 'Codepoint Starting Value', 'object', { fields: [
        f('default', '默认', 'Default', 'number'),
        f('overrides', '覆盖', 'Overrides', 'mapOf', { valueType: { type: 'scalar' }, label: l('覆盖', 'Overrides'), hint: l('键 = 字体, 值 = 起始码点', 'Key = font, value = start codepoint') }),
      ] }),
      f('offset-characters', '偏移字符', 'Offset Characters', 'object', { hint: l('定义 <shift:xxx> 定位使用的 Unicode 字符 (与资源包字体定义匹配); 键 = 偏移量 (-256~256), 值 = 字符', 'Defines the Unicode chars used by <shift:xxx>; key = offset (-256~256), value = char'), fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('font', '字体', 'Font', 'text', { hint: l('默认 minecraft:default', 'Default: minecraft:default') }),
      ] }),
    ] },

    network: { fields: [
      f('disable-chat-report', '禁用聊天举报', 'Disable Chat Report', 'bool', { hint: l('需要重启生效', 'Restart required') }),
      f('disable-item-operations', '禁用物品网络操作', 'Disable Item Operations', 'bool', { hint: l('将禁用 client-bound-data/material 与名称 lore 标签替换', 'Disables client-bound data/material and tag replacement') }),
      f('intercept-packets', '拦截数据包', 'Intercept Packets', 'object', { hint: l('允许第三方插件通过数据包使用 <image> <shift> <global> 标签; 禁用未使用的处理器可降低 Netty 负载', 'Allow third-party plugins to use image/shift/global tags via packets'), fields: [
        f('system-chat', '系统聊天', 'System Chat', 'bool'), f('tab-list', 'Tab 列表', 'Tab List', 'bool'),
        f('player-info', '玩家列表', 'Player Info', 'bool'), f('set-score', '计分板分数', 'Set Score', 'bool'),
        f('actionbar', 'Actionbar', 'Actionbar', 'bool'), f('title', 'Title', 'Title', 'bool'),
        f('bossbar', 'Bossbar', 'Bossbar', 'bool'), f('container', '容器 GUI', 'Container', 'bool'),
        f('team', '团队', 'Team', 'bool'), f('scoreboard', '计分板', 'Scoreboard', 'bool'),
        f('entity-name', '实体名', 'Entity Name', 'bool'), f('armor-stand', '盔甲架 (旧全息)', 'Armor Stand', 'bool'),
        f('text-display', '文本显示 (新全息)', 'Text Display', 'bool'), f('item', '物品', 'Item', 'bool'),
        f('advancement', '进度 Toast', 'Advancement', 'bool'), f('player-chat', '玩家聊天', 'Player Chat', 'bool'),
      ] }),
    ] },

    recipe: { fields: [
      f('enable', '启用', 'Enable', 'bool', { hint: l('启用时插件配方将覆盖原版配方', 'Plugin recipes override vanilla when enabled') }),
      f('disable-vanilla-recipes', '禁用原版配方', 'Disable Vanilla Recipes', 'object', { fields: [
        f('all', '全部禁用', 'All', 'bool', { hint: l('⚠️ 启用时禁用所有原版配方 (与 list 冲突)', '⚠️ Disables ALL vanilla recipes (conflicts with list)') }),
        f('list', '选择性禁用', 'List', 'lines', { hint: l('如 minecraft:wooden_sword (每行一个)', 'e.g. minecraft:wooden_sword (one per line)') }),
      ] }),
      f('ingredient-sources', '额外原料来源', 'Ingredient Sources', 'lines', { hint: l('其他插件提供的原料来源, 如 ItemAdder', 'Ingredient sources from other plugins') }),
      f('unlock-on-ingredient-obtained', '获得原料自动解锁', 'Unlock On Ingredient Obtained', 'bool'),
    ] },

    gui: { fields: [
      f('browser', '物品浏览器', 'Browser', 'object', { fields: [
        f('sounds', '音效', 'Sounds', 'object', { fields: [
          f('change-page', '翻页', 'Change Page', 'text'), f('return-page', '返回', 'Return Page', 'text'),
          f('pick-item', '选择物品', 'Pick Item', 'text'), f('click-button', '点击按钮', 'Click Button', 'text'),
        ] }),
        f('main', '主界面', 'Main', 'object', { fields: [
          f('title', '标题', 'Title', 'miniText'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
        ] }),
        f('category', '分类界面', 'Category', 'object', { fields: [
          f('title', '标题', 'Title', 'miniText'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
        ] }),
        f('recipe', '配方界面', 'Recipe', 'object', { fields: [
          f('get-item-icon', '获取物品图标', 'Get Item Icon', 'text'),
          f('cooking-information-icon', '烹饪信息图标', 'Cooking Information Icon', 'text'),
          f('page-navigation', '翻页按钮', 'Page Navigation', 'object', { fields: CFG_PAGE_NAV }),
          f('none', '无配方', 'None', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('blasting', '高炉', 'Blasting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smelting', '熔炉', 'Smelting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smoking', '烟熏炉', 'Smoking', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('campfire-cooking', '篝火', 'Campfire Cooking', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('crafting', '工作台', 'Crafting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('stonecutting', '切石机', 'Stonecutting', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('smithing-transform', '锻造台', 'Smithing Transform', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
          f('brewing', '酿造台', 'Brewing', 'object', { fields: [f('title', '标题', 'Title', 'miniText')] }),
        ] }),
      ] }),
    ] },

    'chunk-system': { fields: [
      f('cache-system', '缓存系统', 'Cache System', 'bool', { hint: l('降低频繁加载/卸载区块的序列化消耗', 'Reduces serialization cost of frequent chunk loads') }),
      f('compression-method', '压缩方法', 'Compression Method', 'select', { options: [1, 2, 3, 4, 5], hint: l('1=无压缩 2=DEFLATE 3=GZIP 4=LZ4 5=ZSTD', '1=none 2=DEFLATE 3=GZIP 4=LZ4 5=ZSTD') }),
      f('injection', '注入方式', 'Injection', 'object', { fields: [
        f('target', '目标', 'Target', 'select', { options: ['PALETTE', 'SECTION'], hint: l('SECTION = 注入 LevelChunkSection (更快, 实验性); PALETTE = 注入 PalettedContainer', 'SECTION = LevelChunkSection injection (faster, experimental); PALETTE = PalettedContainer') }),
        f('use-fast-method', '快速注入', 'Use Fast Method', 'bool', { hint: l('可能不与某些修改区块类的服务端分支兼容', 'May not work with server forks that alter chunk classes') }),
      ] }),
      f('restore-vanilla-blocks-on-chunk-unload', '卸载时还原原版方块', 'Restore Vanilla Blocks On Chunk Unload', 'bool', { hint: l('防止移除插件后自定义方块变空气 (强烈建议启用)', 'Prevents custom blocks becoming air after plugin removal') }),
      f('restore-custom-blocks-on-chunk-load', '加载时还原自定义方块', 'Restore Custom Blocks On Chunk Load', 'bool', { hint: l('false = 性能模式, true = 兼容模式 (完整状态恢复)', 'false = performance, true = compatibility (full state restore)') }),
      f('sync-custom-blocks-on-chunk-load', '加载时同步自定义方块', 'Sync Custom Blocks On Chunk Load', 'bool', { hint: l('fabric 模组本地编辑地图时的数据同步', 'Syncs data when editing maps with the fabric mod') }),
      f('process-invalid-blocks', '处理无效方块', 'Process Invalid Blocks', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'), f('remove', '移除', 'Remove', 'lines'), f('convert', '转换', 'Convert', 'kv'),
      ] }),
      f('process-invalid-furniture', '处理无效家具', 'Process Invalid Furniture', 'object', { fields: [
        f('enable', '启用', 'Enable', 'bool'), f('remove', '移除', 'Remove', 'lines'), f('convert', '转换', 'Convert', 'kv'),
      ] }),
    ] },

    'client-optimization': { fields: [
      f('entity-culling', '实体剔除 (Premium)', 'Entity Culling', 'object', { hint: l('需要重启才能完全生效', 'Restart required to fully apply'), fields: [
        f('enable', '启用', 'Enable', 'bool'),
        f('ray-tracing', '服务端射线检测', 'Ray Tracing', 'bool', { hint: l('隐藏方块实体/家具, 降低客户端渲染压力', 'Hide block entities/furniture via server-side ray tracing') }),
        f('view-distance', '可视距离', 'View Distance', 'number', { hint: l('-1 = 无限', '-1 = no limit') }),
        f('threads', '线程数', 'Threads', 'number'),
        f('rate-limiting', '限速', 'Rate Limiting', 'object', { fields: [
          f('enable', '启用', 'Enable', 'bool'), f('bucket-size', '桶大小', 'Bucket Size', 'number'),
          f('restore-per-tick', '每 tick 恢复', 'Restore Per Tick', 'number'),
        ] }),
      ] }),
    ] },

    misc: { fields: [
      f('filter-configuration-phase-disconnect', '过滤配置阶段断线日志', 'Filter Configuration Phase Disconnect', 'bool'),
      f('delay-configuration-load', '延迟加载配置', 'Delay Configuration Load', 'bool', { hint: l('延迟到所有插件启动后再读取配置', 'Delays config reading until after all plugins start') }),
      f('inject-packetevents', '注入 PacketEvents', 'Inject PacketEvents', 'bool', { hint: l('解决部分依赖 packetevents 的插件问题', 'Resolves issues with plugins relying on packetevents') }),
    ] },

    debug: { fields: [
      f('common', '通用', 'Common', 'bool'), f('furniture', '家具', 'Furniture', 'bool'),
      f('item', '物品', 'Item', 'bool'), f('resource-pack', '资源包', 'Resource Pack', 'bool'),
      f('block', '方块', 'Block', 'bool'), f('entity-culling', '实体剔除', 'Entity Culling', 'bool'),
      f('packet', '数据包', 'Packet', 'bool'), f('ignored-packets', '忽略的数据包', 'Ignored Packets', 'lines'),
    ] },
  };
  S.config = CONFIG;
  S.configTypes = { term: CONFIG_TERM_TYPES, resolution: CONFIG_RESOLUTION_TYPES, hosting: CONFIG_HOSTING_TYPES };

  // 循环引用类型注册表: 表单引擎通过字符串 key 引用这些类型 (避免 JSON 化/递归问题)
  S.types = {
    conditions: COND_TYPES,
    functions: FN_TYPES,
    lootEntries: LOOT_ENTRY_TYPES,
    lootFunctions: LOOT_FN_TYPES,
    lootTypes: LOOT_TYPES,
    term: CONFIG_TERM_TYPES,
    resolution: CONFIG_RESOLUTION_TYPES,
    hosting: CONFIG_HOSTING_TYPES,
    // item 编辑器 (Phase 2)
    loreLines: LORE_LINE_TYPES,
    customModelData: CUSTOM_MODEL_DATA_TYPES,
    profile: PROFILE_TYPES,
    writtenPages: WRITTEN_PAGE_TYPES,
    itemBehaviors: ITEM_BEHAVIOR_TYPES,
    blockBehaviors: BLOCK_BEHAVIOR_TYPES,
    furnitureBehaviors: FURNITURE_BEHAVIOR_TYPES,
    craftRemainder: CRAFT_REMAINDER_TYPES,
    transforms: TRANSFORM_TYPES,
    rotations: ROTATION_TYPES,
    modelTree: MODEL_TREE_TYPES,
    specialModels: SPECIAL_MODEL_TYPES,
    updaterSteps: UPDATER_STEP_TYPES,
    updaterValues: UPDATER_VALUE_TYPES,
    // recipe (Phase 5)
    recipeIngredients: RECIPE_INGREDIENT_TYPES,
    transformProcessors: TRANSFORM_PROCESSOR_TYPES,
    recipePredicates: RECIPE_PREDICATE_TYPES,
  };

  S.sections = SECTIONS;
  S.itemKeyStyle = ITEM_KEY_STYLE;

  // 注册为全局
  ROOT.CESchemas = S;
})();
