/**
 * 游戏化状态机基础切片 — useGamificationStore
 *
 * 四切片：progression / counters / achievements / quests / companion
 * persist localStorage（key: 'clair-gamification'），partialize 只持久化数据字段。
 *
 * 本轮纯 store 层，零 UI 侵入：不在任何组件中挂载/调用。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

import {
  LevelConfig,
  AchievementConfig,
  QuestConfig,
  CompanionMoodConfig,
  CompanionMood,
  QuestType,
} from '../config/gamification';

// ==================== 工具函数 ====================

function todayStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

/** 任务周期键：daily=日期 / weekly=年周 / onboarding=永不重置 */
function cycleKeyFor(type: QuestType, d: Date = new Date()): string {
  if (type === 'daily') return todayStr(d);
  if (type === 'weekly') {
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  }
  return 'onboarding';
}

/** 由累计 XP 推导当前等级（取 <= xp 的最高 xpRequired 档） */
function computeLevel(xp: number): number {
  let lvl = LevelConfig[0].level;
  for (const cfg of LevelConfig) {
    if (xp >= cfg.xpRequired) lvl = cfg.level;
    else break;
  }
  return lvl;
}

/** 由连续登录天数推导伴生角色状态（情绪 + 语气文案） */
export function companionStateFor(
  streakDays: number,
  lastActiveDate: string,
  name = '澄观小助'
): { name: string; mood: CompanionMood; message: string } {
  const activeToday = lastActiveDate === todayStr();
  const eff = activeToday ? streakDays : Math.max(streakDays - 1, 0);
  let chosen = CompanionMoodConfig[CompanionMoodConfig.length - 1];
  for (const r of CompanionMoodConfig) {
    if (eff >= r.minStreak) chosen = r;
  }
  return { name, mood: chosen.mood, message: chosen.message };
}

// ==================== 类型 ====================

interface ProgressionState {
  xp: number;
  level: number;
  streakDays: number;
  lastActiveDate: string;
}

interface CompanionState {
  name: string;
  mood: CompanionMood;
}

interface GamificationState {
  // === progression 切片 ===
  progression: ProgressionState;
  gainXp: (amount: number, reason?: string) => void;
  touchDaily: () => void;

  // === counters 切片（全局埋点入口） ===
  counters: Record<string, number>;
  track: (key: string, delta?: number) => void;

  // === achievements 切片 ===
  achievements: { unlocked: Record<string, string> };

  // === quests 切片 ===
  quests: { progress: Record<string, Record<string, number>>; completed: Record<string, string> };

  // === companion 切片 ===
  companion: CompanionState;
  getCompanionState: () => { name: string; mood: CompanionMood; message: string };
}

// ==================== Store ====================

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      // === progression ===
      progression: { xp: 0, level: 1, streakDays: 0, lastActiveDate: '' },
      gainXp: (amount, _reason) => {
        const s = get();
        const xp = s.progression.xp + amount;
        const level = computeLevel(xp);
        const mood = companionStateFor(s.progression.streakDays, s.progression.lastActiveDate).mood;
        set({ progression: { ...s.progression, xp, level }, companion: { ...s.companion, mood } });
      },
      touchDaily: () => {
        const s = get();
        const today = todayStr();
        const last = s.progression.lastActiveDate;
        let streakDays = s.progression.streakDays;
        if (last === today) {
          // 当日已打卡，连续天数不变
        } else if (last === yesterdayStr()) {
          streakDays = streakDays + 1;
        } else {
          streakDays = 1;
        }
        const mood = companionStateFor(streakDays, today).mood;
        set({ progression: { ...s.progression, streakDays, lastActiveDate: today }, companion: { ...s.companion, mood } });
      },

      // === counters ===
      counters: {},
      track: (key, delta = 1) => {
        const s = get();

        // ① 累计计数
        const counters = { ...s.counters, [key]: (s.counters[key] ?? 0) + delta };

        // ② 检查成就解锁
        const unlocked = { ...s.achievements.unlocked };
        for (const ach of AchievementConfig) {
          if (unlocked[ach.id]) continue;
          const val = counters[ach.condition.key] ?? 0;
          if (val >= ach.condition.threshold) {
            unlocked[ach.id] = new Date().toISOString();
          }
        }

        // ③④ 推进任务步骤 + 发放完成奖励（防重复）
        const progress = { ...s.quests.progress };
        const completed = { ...s.quests.completed };
        const curCycle = { daily: cycleKeyFor('daily'), weekly: cycleKeyFor('weekly') };
        let xpGain = 0;

        for (const q of QuestConfig) {
          const key2 = q.type === 'daily' ? curCycle.daily : q.type === 'weekly' ? curCycle.weekly : 'onboarding';

          // lazy 周期重置：完成记录不在当前周期则清空进度与完成标记
          const doneDate = completed[q.id];
          if (doneDate) {
            const doneCycle = cycleKeyFor(q.type, new Date(doneDate));
            if (doneCycle !== key2) {
              delete completed[q.id];
              progress[q.id] = {};
            }
          }
          if (completed[q.id]) continue;

          const prog = { ...(progress[q.id] ?? {}) };
          let allDone = true;
          for (const step of q.steps) {
            if (step.key === key) {
              prog[step.key] = Math.min((prog[step.key] ?? 0) + delta, step.target);
            }
            if ((prog[step.key] ?? 0) < step.target) allDone = false;
          }
          progress[q.id] = prog;

          if (allDone) {
            completed[q.id] = new Date().toISOString();
            xpGain += q.xpReward;
          }
        }

        set({ counters, achievements: { unlocked }, quests: { progress, completed } });
        if (xpGain > 0) get().gainXp(xpGain, 'quest');
      },

      // === achievements ===
      achievements: { unlocked: {} },

      // === quests ===
      quests: { progress: {}, completed: {} },

      // === companion ===
      companion: { name: '澄观小助', mood: 'calm' },
      getCompanionState: () => {
        const s = get();
        return companionStateFor(s.progression.streakDays, s.progression.lastActiveDate, s.companion.name);
      },
    }),
    {
      name: 'clair-gamification',
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据字段；companion.mood 为派生值，不持久化
      partialize: (state) => ({
        progression: state.progression,
        counters: state.counters,
        achievements: state.achievements,
        quests: state.quests,
        companion: { name: state.companion.name },
      }),
    }
  )
);

// ==================== 细粒度选择器 hooks ====================

/** progression 切片：xp / level / streakDays / lastActiveDate */
export const useProgression = () =>
  useGamificationStore(useShallow((s) => s.progression));

/** achievements 切片：unlocked 记录 */
export const useAchievements = () =>
  useGamificationStore(useShallow((s) => s.achievements));

/** companion 切片：派生 name / mood / message（后续注入 ChatPanel） */
export const useCompanion = () =>
  useGamificationStore(
    useShallow((s) => {
      const cs = companionStateFor(s.progression.streakDays, s.progression.lastActiveDate, s.companion.name);
      return { name: cs.name, mood: cs.mood, message: cs.message };
    })
  );
