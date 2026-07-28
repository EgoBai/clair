/**
 * 游戏化配置层 — 纯配置 + 类型，配置驱动核心。
 *
 * 设计原则：旅程/任务/成就/伴生情绪全部在此以 const 数组声明，
 * 后续新增内容只改本文件，不触碰 useGamificationStore 逻辑。
 *
 * 计数器语义化 key（track 的全局埋点入口统一使用）：
 *   stock_viewed / note_created / backtest_run / ai_chat /
 *   page_visited_distinct / watchlist_added / report_generated /
 *   factor_run / risk_checked
 */

// ==================== 通用类型 ====================

export type CompanionMood = 'excited' | 'happy' | 'calm' | 'sleepy';

// ==================== 等级成长曲线 ====================

export interface LevelConfig {
  /** 等级序号，从 1 开始 */
  level: number;
  /** 投研叙事等级名 */
  name: string;
  /** 达到该等级所需的累计 XP（含阈值，>= 即视为该级） */
  xpRequired: number;
}

export const LevelConfig: LevelConfig[] = [
  { level: 1, name: '见习研究员', xpRequired: 0 },
  { level: 2, name: '初级分析师', xpRequired: 100 },
  { level: 3, name: '助理投资顾问', xpRequired: 300 },
  { level: 4, name: '投资顾问', xpRequired: 600 },
  { level: 5, name: '高级分析师', xpRequired: 1000 },
  { level: 6, name: '资深分析师', xpRequired: 1600 },
  { level: 7, name: '投资经理', xpRequired: 2400 },
  { level: 8, name: '高级投资经理', xpRequired: 3500 },
  { level: 9, name: '研究总监', xpRequired: 5000 },
  { level: 10, name: '首席投资官', xpRequired: 7000 },
];

// ==================== 成就 ====================

export type AchievementConditionType = 'counter' | 'event';

export interface AchievementCondition {
  type: AchievementConditionType;
  /** 语义化计数器 key（counter 累加 / event 触发） */
  key: string;
  /** 解锁阈值 */
  threshold: number;
}

export interface AchievementConfig {
  id: string;
  title: string;
  desc: string;
  /** emoji 图标 */
  icon: string;
  condition: AchievementCondition;
}

export const AchievementConfig: AchievementConfig[] = [
  { id: 'first_stock', title: '初识市场', desc: '查看你的第一只股票', icon: '👁️',
    condition: { type: 'counter', key: 'stock_viewed', threshold: 1 } },
  { id: 'curious_mind', title: '求知若渴', desc: '累计查看 20 只股票', icon: '🔍',
    condition: { type: 'counter', key: 'stock_viewed', threshold: 20 } },
  { id: 'note_taker', title: '记录者', desc: '创建第一条研究笔记', icon: '📝',
    condition: { type: 'counter', key: 'note_created', threshold: 1 } },
  { id: 'prolific_writer', title: '笔耕不辍', desc: '创建 10 条研究笔记', icon: '✍️',
    condition: { type: 'counter', key: 'note_created', threshold: 10 } },
  { id: 'backtest_pioneer', title: '回测先锋', desc: '完成第一次策略回测', icon: '📈',
    condition: { type: 'counter', key: 'backtest_run', threshold: 1 } },
  { id: 'quant_apprentice', title: '量化学徒', desc: '完成 5 次策略回测', icon: '⚙️',
    condition: { type: 'counter', key: 'backtest_run', threshold: 5 } },
  { id: 'ai_confidant', title: 'AI 挚友', desc: '与澄观进行一次对话', icon: '🤖',
    condition: { type: 'event', key: 'ai_chat', threshold: 1 } },
  { id: 'ai_power_user', title: '深度对话', desc: '与 AI 完成 20 次对话', icon: '💬',
    condition: { type: 'counter', key: 'ai_chat', threshold: 20 } },
  { id: 'explorer', title: '探索者', desc: '访问 5 个不同页面', icon: '🧭',
    condition: { type: 'counter', key: 'page_visited_distinct', threshold: 5 } },
  { id: 'wide_reader', title: '博观约取', desc: '访问 10 个不同页面', icon: '🌐',
    condition: { type: 'counter', key: 'page_visited_distinct', threshold: 10 } },
  { id: 'watchlist_builder', title: '自选构筑', desc: '添加 5 只自选股', icon: '⭐',
    condition: { type: 'counter', key: 'watchlist_added', threshold: 5 } },
  { id: 'report_author', title: '研报作者', desc: '生成第一份研报', icon: '📑',
    condition: { type: 'counter', key: 'report_generated', threshold: 1 } },
  { id: 'factor_explorer', title: '因子探秘', desc: '运行一次因子分析', icon: '🧮',
    condition: { type: 'counter', key: 'factor_run', threshold: 1 } },
  { id: 'risk_aware', title: '风控意识', desc: '查看一次风险中心', icon: '🛡️',
    condition: { type: 'counter', key: 'risk_checked', threshold: 1 } },
];

// ==================== 任务 ====================

export type QuestType = 'daily' | 'weekly' | 'onboarding';

export interface QuestStep {
  /** 语义化计数器 key */
  key: string;
  /** 目标次数 */
  target: number;
}

export interface QuestConfig {
  id: string;
  type: QuestType;
  title: string;
  steps: QuestStep[];
  xpReward: number;
}

export const QuestConfig: QuestConfig[] = [
  { id: 'onboarding_start', type: 'onboarding', title: '初入澄观',
    steps: [
      { key: 'stock_viewed', target: 1 },
      { key: 'note_created', target: 1 },
      { key: 'backtest_run', target: 1 },
    ], xpReward: 50 },
  { id: 'onboarding_watchlist', type: 'onboarding', title: '自选启航',
    steps: [{ key: 'watchlist_added', target: 3 }], xpReward: 30 },
  { id: 'daily_patrol', type: 'daily', title: '每日巡检',
    steps: [
      { key: 'stock_viewed', target: 3 },
      { key: 'ai_chat', target: 1 },
    ], xpReward: 20 },
  { id: 'daily_note', type: 'daily', title: '笔记打卡',
    steps: [{ key: 'note_created', target: 1 }], xpReward: 10 },
  { id: 'daily_backtest', type: 'daily', title: '回测一练',
    steps: [{ key: 'backtest_run', target: 1 }], xpReward: 15 },
  { id: 'weekly_deep', type: 'weekly', title: '周度深研',
    steps: [
      { key: 'stock_viewed', target: 10 },
      { key: 'note_created', target: 3 },
      { key: 'backtest_run', target: 2 },
    ], xpReward: 80 },
  { id: 'weekly_ai', type: 'weekly', title: 'AI 共研',
    steps: [{ key: 'ai_chat', target: 5 }], xpReward: 40 },
];

// ==================== 伴生角色情绪 ====================

/**
 * 按「连续登录天数」映射情绪与语气文案。
 * minStreak 升序排列；取 <= 生效连续天数 的最高一档。
 * 生效连续天数规则：当日活跃时用真实 streakDays，否则视为 -1 档（任务未延续当天）。
 */
export interface CompanionMoodThreshold {
  mood: CompanionMood;
  minStreak: number;
  message: string;
}

export const CompanionMoodConfig: CompanionMoodThreshold[] = [
  { mood: 'sleepy', minStreak: 0, message: '好久没见啦，回来陪我做研究吧～' },
  { mood: 'calm', minStreak: 1, message: '今天也来一起看看市场吧。' },
  { mood: 'happy', minStreak: 3, message: '状态不错，继续保持研究节奏！' },
  { mood: 'excited', minStreak: 7, message: '连续打卡一周啦！今天也要一起挖掘超额收益～' },
];
