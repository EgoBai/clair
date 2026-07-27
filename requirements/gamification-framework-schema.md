# 澄观 Clair — 游戏化内容框架配置 Schema（冻结）

> 角色：产品经理（许清楚）｜消费方：架构阶段 P2（游戏化叠加）
> 用途：旅程 / 任务 / 成就 / 伴生全部由 JSON 配置描述；Journey Engine 解释配置 → 写 `useGamificationStore` → 广播 `achievement_unlocked` 事件。
> **结构冻结**：字段 / 类型冻结，避免 P2 返工；产品侧保留对文案 / 阈值 / 奖励的迭代权。本文件为规范（TS 接口 + JSON Schema），不含实现代码。

> **战略决策依据（D9–D13，已决，非开放问题）**：本 Schema 服务于以下已拍板结论——
> - **D11 核心循环（顶层产品哲学）**：游戏化不止表象系统，须从用户**首次进入**起铺设完整**核心循环**——监控 / 监测 → 筛选 → 追踪 → 回测 / 复盘 → 策略搭建 → 指标 / 特征 / 方法沉淀。下方 `JourneyStage`（discover / research / decide / review / levelup）是体验层封装，须承载这条真实投研行为链；`Quest` / `Achievement` 的 `trigger` / `completion` 钩子须对齐核心功能行为路径，使成长体系服务于核心能力建设。
> - **D12 D6 UI 守卫**：维持"轻量静态层先行"不变；本框架不受 D6 守卫影响，二者独立。
> - **D13 知识库 RAG 进 P1**：知识库 RAG 在阶段1 接通；本框架的成就 / 旁白（`narrativeCopy`、`linkedAiAction`）可在 P1 起与 RAG 检索增强打通（如旁白引用知识库内容）。
> - **D9 LLM 供应商（DeepSeek 默认）** / **D10 国际资金本期纳入**：与本框架无结构耦合，架构侧按对应决策落地即可。

## 1. 总览与实体关系

| 实体 | 性质 | 说明 |
|---|---|---|
| ConditionExpr | 共享类型 | 指标 + 算子 + 值，可 and / or 复合 |
| JourneyStage | 配置 | 投研循环 5 阶段，含叙事与 AI 角色 |
| Quest | 配置 | 任务 / 日常挑战，含完成条件与 XP |
| Achievement | 配置 | 成就徽章，可复合条件，解锁触发 AI 旁白 |
| LevelCurve | 配置 | 等级阈值与每级解锁的能力 / 称号 |
| CompanionState | 配置 + 运行 | 伴生关系指标与语气映射 |

**组合关系**：`JourneyStage` 定义阶段 → `Quest` 挂在某 `stage` → `Achievement.condition` 引用埋点 metric（由 Quest / 行为累积）→ `LevelCurve` 按 XP 解锁 → `CompanionState` 随 bond / rapport 演化反向注入对话语气。

## 2. TypeScript 接口（规范定义）

```ts
// 埋点指标键
export type MetricKey =
  | 'app_open' | 'explore_new' | 'analyze_count' | 'note_count'
  | 'review_count' | 'streak' | 'decision_logged' | 'watch_added'
  | 'weekly_review_streak' | 'level' | 'level_up';

export type CompareOp = '>=' | '<=' | '>' | '<' | '==';

// 条件表达式：原子（metric+op+value）或 and/or 复合
export interface ConditionExpr {
  metric?: MetricKey;
  op?: CompareOp;
  value?: number;
  and?: ConditionExpr[];
  or?: ConditionExpr[];
}

export type StageKey = 'discover' | 'research' | 'decide' | 'review' | 'levelup';

export interface JourneyStage {
  id: string;
  key: StageKey;
  title: string;
  narrative: string;
  aiRole: string;
  entryCondition?: ConditionExpr;
  exitCondition?: ConditionExpr;
  xpReward: number;
  companionBondDelta: number;
}

export type QuestType = 'daily' | 'weekly' | 'onboarding' | 'exploration' | 'review' | 'milestone';
export type CompletionWindow = 'day' | 'week' | 'alltime';
export type Recurrence = 'none' | 'daily' | 'weekly';

export interface Quest {
  id: string;
  stage: StageKey;
  type: QuestType;
  title: string;
  description: string;
  trigger: string;                 // EventRef 或 cron 表达式，如 "cron:daily"
  completion: { metric: MetricKey; threshold: number; window: CompletionWindow };
  xpReward: number;
  linkedAiAction?: string;         // 完成时触发的 AI 生成（如 weekly_growth_report）
  recurrence: Recurrence;
}

export type AchievementCategory = 'exploration' | 'research' | 'discipline' | 'growth' | 'mastery';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export interface Achievement {
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  title: string;
  description: string;
  condition: { allOf?: ConditionExpr[]; anyOf?: ConditionExpr[] };
  reward: { badge: string; titleUnlock?: string; unlockFeature?: string };
  narrativeCopy: string;           // 解锁时 AI 旁白文案
}

export interface LevelCurveEntry {
  level: number;
  xpRequired: number;
  title: string;
  unlock: string[];
}
export interface LevelCurve { levels: LevelCurveEntry[]; }

export type CompanionPersona = 'mentor' | 'peer' | 'analyst' | 'coach';
export type BondTier = 'low' | 'mid' | 'high';

export interface CompanionState {
  persona: CompanionPersona;
  bond: number;                    // 0-100 关系亲密度
  rapport: number;                 // 0-100 默契度
  toneByBond: Record<BondTier, string>;
  memoryHooks: string[];
  // 运行时派生（非配置，由 store 维护）：mood / loopPhase / activeQuest / level
}
```

## 3. JSON Schema（校验用）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ClairGamificationConfig",
  "type": "object",
  "required": ["stages", "quests", "achievements", "levelCurve", "companion"],
  "properties": {
    "stages": { "type": "array", "items": { "$ref": "#/$defs/JourneyStage" } },
    "quests": { "type": "array", "items": { "$ref": "#/$defs/Quest" } },
    "achievements": { "type": "array", "items": { "$ref": "#/$defs/Achievement" } },
    "levelCurve": { "$ref": "#/$defs/LevelCurve" },
    "companion": { "$ref": "#/$defs/CompanionState" }
  },
  "$defs": {
    "ConditionExpr": {
      "type": "object",
      "properties": {
        "metric": { "type": "string" },
        "op": { "enum": [">=", "<=", ">", "<", "=="] },
        "value": { "type": "number" },
        "and": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpr" } },
        "or": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpr" } }
      }
    },
    "JourneyStage": {
      "type": "object",
      "required": ["id", "key", "title", "narrative", "aiRole", "xpReward", "companionBondDelta"],
      "properties": {
        "id": { "type": "string" },
        "key": { "enum": ["discover", "research", "decide", "review", "levelup"] },
        "title": { "type": "string" },
        "narrative": { "type": "string" },
        "aiRole": { "type": "string" },
        "entryCondition": { "$ref": "#/$defs/ConditionExpr" },
        "exitCondition": { "$ref": "#/$defs/ConditionExpr" },
        "xpReward": { "type": "number" },
        "companionBondDelta": { "type": "number" }
      }
    },
    "Quest": {
      "type": "object",
      "required": ["id", "stage", "type", "title", "description", "trigger", "completion", "xpReward", "recurrence"],
      "properties": {
        "id": { "type": "string" },
        "stage": { "enum": ["discover", "research", "decide", "review", "levelup"] },
        "type": { "enum": ["daily", "weekly", "onboarding", "exploration", "review", "milestone"] },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "trigger": { "type": "string" },
        "completion": {
          "type": "object",
          "required": ["metric", "threshold", "window"],
          "properties": {
            "metric": { "type": "string" },
            "threshold": { "type": "number" },
            "window": { "enum": ["day", "week", "alltime"] }
          }
        },
        "xpReward": { "type": "number" },
        "linkedAiAction": { "type": "string" },
        "recurrence": { "enum": ["none", "daily", "weekly"] }
      }
    },
    "Achievement": {
      "type": "object",
      "required": ["id", "category", "tier", "title", "description", "condition", "reward", "narrativeCopy"],
      "properties": {
        "id": { "type": "string" },
        "category": { "enum": ["exploration", "research", "discipline", "growth", "mastery"] },
        "tier": { "enum": ["bronze", "silver", "gold", "legendary"] },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "condition": {
          "type": "object",
          "properties": {
            "allOf": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpr" } },
            "anyOf": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpr" } }
          }
        },
        "reward": {
          "type": "object",
          "required": ["badge"],
          "properties": {
            "badge": { "type": "string" },
            "titleUnlock": { "type": "string" },
            "unlockFeature": { "type": "string" }
          }
        },
        "narrativeCopy": { "type": "string" }
      }
    },
    "LevelCurve": {
      "type": "object",
      "required": ["levels"],
      "properties": {
        "levels": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["level", "xpRequired", "title", "unlock"],
            "properties": {
              "level": { "type": "number" },
              "xpRequired": { "type": "number" },
              "title": { "type": "string" },
              "unlock": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    },
    "CompanionState": {
      "type": "object",
      "required": ["persona", "bond", "rapport", "toneByBond", "memoryHooks"],
      "properties": {
        "persona": { "enum": ["mentor", "peer", "analyst", "coach"] },
        "bond": { "type": "number", "minimum": 0, "maximum": 100 },
        "rapport": { "type": "number", "minimum": 0, "maximum": 100 },
        "toneByBond": {
          "type": "object",
          "required": ["low", "mid", "high"],
          "properties": {
            "low": { "type": "string" },
            "mid": { "type": "string" },
            "high": { "type": "string" }
          }
        },
        "memoryHooks": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## 4. 示例实例（最小可落地集）

### 4.1 阶段 → 任务 → 成就 链

```json
{
  "stages": [
    { "id": "st_discover", "key": "discover", "title": "探索未知的疆域",
      "narrative": "优秀的投资者从好奇开始。", "aiRole": "伙伴：推荐值得关注的标的与逻辑",
      "entryCondition": { "metric": "app_open", "op": ">=", "value": 1 },
      "exitCondition": { "metric": "explore_new", "op": ">=", "value": 1 },
      "xpReward": 10, "companionBondDelta": 2 }
  ],
  "quests": [
    { "id": "q_daily_explore", "stage": "discover", "type": "daily",
      "title": "今日新发现", "description": "今天探索 1 个新标的或新概念",
      "trigger": "cron:daily", "completion": { "metric": "explore_new", "threshold": 1, "window": "day" },
      "xpReward": 10, "linkedAiAction": "daily_insight_card", "recurrence": "daily" }
  ],
  "achievements": [
    { "id": "a_explorer", "category": "exploration", "tier": "bronze",
      "title": "探路者", "description": "累计探索 10 个新标的",
      "condition": { "allOf": [ { "metric": "explore_new", "op": ">=", "value": 10 } ] },
      "reward": { "badge": "🧭", "titleUnlock": "探路者" },
      "narrativeCopy": "你已完成 10 次探索，解锁「探路者」——好奇心是你最好的分析师。" }
  ]
}
```

### 4.2 CompanionState（默认）

```json
{
  "persona": "coach", "bond": 0, "rapport": 0,
  "toneByBond": { "low": "温和引导，多给背景", "mid": "平等探讨，敢于挑战", "high": "默契搭档，直击要害" },
  "memoryHooks": []
}
```

## 5. 消费契约（给架构 P2）

1. **指标采集**：各模块埋点 → 写入 `useGamificationStore` 的 `ProgressionProfile` 指标字段（analyze_count / note_count / review_count / explore_new / streak / decision_logged / level 等）。
2. **条件求值**：Journey Engine 周期性 / 事件驱动地对 `Quest.completion` 与 `Achievement.condition` 求值。
3. **奖励派发**：Quest 完成 → 加 XP → 比对 `LevelCurve` 触发 `level_up`；Achievement 解锁 → 写入 `unlockedAchievements` 并广播 `achievement_unlocked` 事件。
4. **AI 旁白**：`achievement_unlocked` 事件携带 `narrativeCopy` → 触发 AI 旁白气泡；`linkedAiAction` 触发对应 AI 生成（如周报）。
5. **伴生注入**：`companion.bond / rapport` 随交互演化 → 映射 `toneByBond` → 反向注入 `ChatPanel` 系统提示，实现"越用越懂你"。
6. **持久化**：`useGamificationStore`（persist 至 localStorage，沿用既有模式），与 `useAIStore` 解耦但可联动。

---

*— 文档结束 · 产品经理（许清楚）产出。结构冻结，供 P2 直接消费；不含实现代码。*
