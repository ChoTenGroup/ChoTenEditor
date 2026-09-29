# Chemdah 任务系统参考

## 文件结构

任务文件位于 `Chemdah/core/quest/` 目录下，每个任务一个 YAML 文件。
可以为每个 NPC 创建子目录存放其相关任务（如 `quest/Trader/`）。
任务之间是扁平的，没有嵌套关系。

## 基本结构

```yaml
QuestID:                      # 全局唯一的任务 ID
  meta:                       # 任务元数据
    name: "任务名称"           #   显示名称
    type: L1                  #   任务类型（L1, L2, daily, weekly 等，支持列表）
  task:                       # 任务条目列表
    1:                        #   条目编号
      meta:                   #     条目元数据
        name: "条目名称"       #       条目显示名称
      objective: objective_type #     目标类型
      condition:              #     条件（因目标类型而异）
        ...
      goal:                   #     目标完成条件
        amount: N
      addon:                  #     可选附加配置
        depend: 前一编号       #       依赖前置任务完成
      agent:                  #     条目级代理脚本
        completed: |-         #       完成时执行
          kether script
  addon:                      # 任务级附加功能
    track:
      scoreboard: false       #   是否显示计分板追踪
    restart: player dead      #   重启条件（死亡重置）
  agent:                      # 任务级代理脚本
    accepted @ all: |-        #   接受任务时执行
      kether script
    completed @ all: |-       #   完成任务时执行
      kether script
```

## 字段详解

### meta

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 任务显示名称 |
| `type` | string/list | 任务类型。支持列表如 `[daily, weekly]`，用于分组控制和 UI 分类 |

### task（条目列表）

每个条目是一个子任务，编号从 1 开始递增。

| 字段 | 类型 | 说明 |
|------|------|------|
| `meta.name` | string | 条目标题，显示给玩家 |
| `objective` | string | 目标类型（见下方目标类型表） |
| `condition` | varies | 目标条件（因类型而异） |
| `goal` | object | 完成判定条件 |
| `addon.depend` | number | 依赖的前置条目编号，完成后才可进行本条目 |
| `agent.completed` | string | 本条目完成时执行的 Kether 脚本 |

## 目标类型（objective）详解

### 1. `trigger` — 触发事件

```yaml
objective: trigger
condition:
  value: TriggerValue          # 触发值，对话中通过 trigger 指令触发
goal:
  amount: 1
```

**说明**：在对话脚本中使用 `trigger Value` 来推进该条目进度。

### 2. `player real move` — 移动到指定区域

```yaml
objective: "player real move"
condition:
  position:to: "AreaName x1 y1 z1 > x2 y2 z2"  # 矩形区域范围
goal:
  amount: 1
```

或单点范围：
```yaml
objective: "player real move"
condition:
  position: "AreaName x y z ~ 半径"
goal:
  amount: 1
```

**说明**：支持两种格式——矩形区域（`>` 分隔两个角）和球形范围（`~ 半径`）。

### 3. `block interact` — 交互方块

```yaml
objective: block interact
condition:
  position: "AreaName x y z"   # 方块坐标
goal:
  amount: 1                    # 交互次数
```

**说明**：玩家在指定坐标处交互方块。

### 4. `player data` — 玩家数据变量

```yaml
objective: player data
goal:
  key: VariableName             # 变量名
  value: 1                      # 目标值
  amount: 1
```

**说明**：当 `profile data VariableName` 的值达到 `value` 时完成。
通常通过对话中的 `profile data key to 1` 设置。

### 5. `mythicmobs kill` — 击杀 MythicMobs 实体

```yaml
objective: mythicmobs kill
condition:
  mob: MobName                  # 实体名称（支持多个用分号隔开）
  amount: 5                     # 需要击杀的数量
goal:
  amount: 1
```

或带区域限制：
```yaml
objective: mythicmobs kill
condition:
  name: Mob1;Mob2               # 实体名列表
goal:
  amount: 10
  $: check papi "%worldguard_region_name%" == some-region  # 额外条件
```

### 6. `placeholder api` — 占位符条件

```yaml
objective: placeholder api
goal:
  key: '%some_balance%'         # 占位符
  value: '>=10000'              # 条件（支持 >=, <=, ==, >, <）
  amount: 1
```

**说明**：检查 PlaceholderAPI 占位符是否满足条件。

### 7. 其他可能的目标类型

完整的可用类型列表可通过游戏内命令查询：
```
/cha objective <name>
```

常见类型还包括：`block break`、`block place`、`entity kill`、`entity interact`、
`player craft`、`player fish`、`player enchant`、`player consume`、
`player chat`、`player command`、`player level`、`player exp` 等。

## addon（附加配置）

### 任务级 addon

| 字段 | 说明 |
|------|------|
| `track.scoreboard` | 是否在计分板显示追踪 |
| `chotenui.icon` | 物品材质名称（如 `IRON_SWORD`、`PAPER`） |
| `chotenui.index` | 简短说明，显示在任务列表 |
| `chotenui.description` | 详细描述，支持 `<red>` 等颜色标签 |
| `chotenui.reward` | 奖励描述文本 |
| `restart` | 重启条件，如 `player dead` 表示死亡后重置 |

### 条目级 addon

| 字段 | 说明 |
|------|------|
| `depend` | 依赖的前置条目编号 |

## agent（代理脚本）

### 任务级脚本

```yaml
agent:
  accepted @ all: |-       # 所有玩家接受任务时
    command papi "..." as console
    tell "任务已接受！"
  completed @ all: |-      # 所有玩家完成任务时
    command papi "money give %player_name% 5000" as console
    profile data affection_NPC add 10
```

**说明**：任务级脚本支持 `accepted @ all`（接受时）和 `completed @ all`（完成时）
两个钩子。常用于发放奖励、设置好感度、推进任务链。

### 条目级脚本

```yaml
task:
  1:
    ...
    agent:
      completed: |-        # 仅该条目完成时
        command papi "si give item_id %player_name%" as console
```

**说明**：条目级脚本仅在当前条目完成时执行，常用于在任务中间给玩家发放物品。

### 动态 goal（在 goal 中执行脚本）

```yaml
goal:
  $: inventory take some:item_id amount 1  # 每完成一次消耗一个物品
  amount: 4
```

**说明**：`$` 字段可以在完成检查时执行 Kether 脚本，
常用于在区域到达目标中消耗道具。

## 常见模式

### 顺序触发任务（对话推进）

```yaml
QuestID:
  meta:
    name: "任务名称"
    type: L1
  task:
    1:
      meta:
        name: "与 NPC_A 对话"
      objective: trigger
      condition:
        value: TalkToNPC_A
      goal:
        amount: 1
    2:
      meta:
        name: "前往指定地点"
      objective: "player real move"
      condition:
        position:to: "AreaName x1 y1 z1 > x2 y2 z2"
      goal:
        amount: 1
      addon:
        depend: 1
    3:
      meta:
        name: "向 NPC_B 报告"
      objective: trigger
      condition:
        value: ReportToNPC_B
      goal:
        amount: 1
      addon:
        depend: 2
  agent:
    completed @ all: |-
      command papi "money give %player_name% 金额" as console
      profile data affection_NPC add 好感度
```

### 探索任务（移动+交互）

```yaml
QuestID:
  meta:
    name: "任务名称"
    type: L1
  task:
    1:
      meta:
        name: "探索废墟"
      objective: "player real move"
      condition:
        position:to: "AreaName x1 y1 z1 > x2 y2 z2"
      goal:
        amount: 1
    2:
      meta:
        name: "拉动拉杆"
      objective: block interact
      condition:
        position: "AreaName x y z"
      goal:
        amount: 1
      addon:
        depend: 1
    3:
      meta:
        name: "向 NPC 汇报"
      objective: player data
      goal:
        key: ReportKey
        value: 1
        amount: 1
      addon:
        depend: 2
  agent:
    completed @ all: |-
      command papi "money give %player_name% 金额" as console
```

### 混合型任务（探索+击杀+汇报）

```yaml
QuestID:
  meta:
    name: "任务名称"
    type: L1
  task:
    1:
      meta:
        name: "探索指定区域"
      objective: "player real move"
      condition:
        position:to: "AreaName x1 y1 z1 > x2 y2 z2"
      goal:
        amount: 1
    2:
      meta:
        name: "击杀怪物"
      objective: mythicmobs kill
      condition:
        mob: SomeMob
        amount: 5
      goal:
        amount: 1
    3:
      meta:
        name: "向 NPC 汇报"
      objective: player data
      goal:
        key: ReportKey
        value: 1
        amount: 1
```

### 死亡重置任务

```yaml
addon:
  restart: player dead        # 玩家死亡后任务进度重置
```

**说明**：适用于高难度或剧情敏感的任务，防止玩家通过死亡投机取巧。

### 带接受时脚本的任务

```yaml
agent:
  accepted @ all: |-
    command papi "si give item_id %player_name% N" as console
    tell "你已获得任务道具！"
  completed @ all: |-
    command papi "money give %player_name% 金额" as console
    profile data affection_NPC add 好感度
```

## 设计规范

1. **任务 ID**：全局唯一，建议用有意义的英文驼峰命名
2. **类型标识**：`L1` 主线、`L2` 支线、`daily` 日常、`weekly` 周常
3. **条目依赖**：需要顺序完成的任务使用 `addon.depend` 指定依赖
4. **NPC 好感度**：任务奖励通常包含对应 NPC 的好感度变量 `affection_NPC`
5. **奖励发放**：通过 `agent.completed @ all` 的 Kether 脚本发放实际奖励
6. **区域坐标**：统一使用 `AreaName x y z` 格式
