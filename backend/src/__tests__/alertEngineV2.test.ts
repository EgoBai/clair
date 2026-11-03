/**
 * 影子测试迁移（批次 30b）
 *
 * 迁移前：本文件只 import vitest，条件评估 / 规则评估 / 批量评估 / 消息生成 / 频率控制五套实现全部自抄，
 * 断言对象是副本而不是产品代码。迁移后：能对上生产导出的符号一律 import 真源，生产没有的 helper 保留并注明。
 * 用例数：22 → 22（describe/it 名称与数量 1:1 保留，只订正绑定与断言）。
 *
 * 已绑定生产实现（frontend/src/utils/alertRuleEngine.ts，235 行，无任何 import 的纯函数模块，
 * 跨包 import 先例见 backend/src/__tests__/movingAverageSystem.test.ts:38）：
 * - evaluateCondition(currentValue, previousValue, operator, threshold, secondaryThreshold?) → :46
 * - evaluateRule(rule, data, previousData?) → :75（返回 AlertTrigger | null）
 * - evaluateRules(rules, stockData: Map, previousData?: Map, lastTriggerTimes?: Map) → :106
 * - AlertRule 类型 → :8-21；AlertTrigger 类型 → :23-33
 *
 * 旧断言错在哪（旧值 → 生产值 + 依据行号）：
 * - evaluateCondition 签名：旧 (current, previous, condition 对象) → 生产 5 参
 *   (currentValue, previousValue, operator, threshold, secondaryThreshold?)（:46-52）。
 * - eq 容差：旧 0.001（10.0005 → true）→ 生产 0.0001（:58），10.0005 → false；
 *   补 10.00005 → true 作为容差内证据；10.01 → false 不变。
 * - 穿越运算符名：旧 crosses_above / crosses_below → 生产 cross_above / cross_below（:60-61）；
 *   且生产要求 previousValue !== undefined，previous 缺失时 false（:60-61）。
 * - 禁用语义：旧 condition.enabled → 生产 rule.enabled（AlertRule:18）；禁用规则由 evaluateRule 直接返回 null（:80），
 *   生产 evaluateCondition 没有 enabled 参数。
 * - 旧 AlertRule 有 conditions[] / logic / triggered；生产 AlertRule 是单字段单条件
 *   （field + operator + threshold，:8-21），没有 conditions、logic、triggered。
 *   因此旧「AND/OR 条件组合」在生产不存在：AND 用例映射为「单条件满足即触发 / 不满足不触发」，
 *   OR 用例映射为 evaluateRules「多条规则任一触发即返回」。
 * - evaluateRule 返回值：旧 { triggered, matchedConditions } → 生产 AlertTrigger | null（:91-101）；
 *   生产无 matchedConditions，改为断言 ruleId / currentValue。
 * - batchEvaluateRules：旧 (rules, 普通对象) → AlertRule[]（带 triggered 标记）；生产
 *   evaluateRules(rules, Map, previousData?, lastTriggerTimes?) → AlertTrigger[]（只含触发项，:106-137），
 *   多规则用例改为断言长度 1 + ruleId。
 * - 消息：旧 generateAlertMessage 产出「[600519] price gt 100」→ 生产 generateMessage 私有（:225-235），
 *   格式为「<rule.name>: 当前值<toFixed(2)> ≥ 阈值<threshold>」（gt/gte；lt/lte 用 ≤），不含字段名与 operator；
 *   改为断言 rule.name 中的代码、当前值文本、阈值文本。
 * - 多条件消息：旧断言含 'OR' → 生产无 conditions/logic，消息里没有逻辑连接词；
 *   改为断言消息同时包含当前值与阈值这两项条件信息。
 * - 频率控制：旧 AlertThrottle.shouldAlert / recordAlert / getRemainingCooldown → 生产用 evaluateRules 第 4 参
 *   lastTriggerTimes 做冷却判断（:119-123，cooldown = rule.cooldownMinutes * 60000）；
 *   用 vi.useFakeTimers + vi.setSystemTime 固定时钟，保证确定性（不依赖真实时间）。
 *
 * 未迁移（生产无对应导出，保留本地 helper）：
 * - getRemainingCooldown：生产只在 evaluateRules 内部判断是否冷却（:119-123），不导出剩余冷却毫秒数；
 *   本地 helper 与 :122 同式（cooldownMinutes*60000-(now-last)），仅服务「剩余冷却时间 / 无记录返回0冷却」两条旧用例。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  evaluateCondition,
  evaluateRule,
  evaluateRules,
} from '../../../frontend/src/utils/alertRuleEngine';
import type { AlertRule } from '../../../frontend/src/utils/alertRuleEngine';

// 生产 AlertRule 是单字段单条件（frontend/src/utils/alertRuleEngine.ts:8-21），
// 旧副本的 conditions[]/logic/triggered 在生产不存在；工厂只补齐生产必填字段。
const makeRule = (overrides: Partial<AlertRule> = {}): AlertRule => ({
  id: '1',
  name: '600519 价格突破',
  stockCode: '600519',
  field: 'price',
  operator: 'gt',
  threshold: 100,
  level: 'warning',
  cooldownMinutes: 5,
  enabled: true,
  notificationChannels: ['push'],
  description: '测试规则',
  ...overrides,
});

const stockMap = (
  entries: Array<[string, Record<string, number>]>,
): Map<string, Record<string, number>> => new Map(entries);

// 未迁移：生产无对应导出（生产只在 evaluateRules 内部判断冷却，alertRuleEngine.ts:119-123，
// 不暴露剩余冷却毫秒数）；本地 helper 与 :122 同式。
const getRemainingCooldown = (
  cooldownMinutes: number,
  lastAlertAt: number | undefined,
  now: number,
): number => {
  if (lastAlertAt === undefined) return 0;
  return Math.max(0, cooldownMinutes * 60_000 - (now - lastAlertAt));
};

// 固定时钟：测试内不取当前系统时间，统一用带参 Date 构造确定性时间戳。
const NOW = new Date('2026-01-05T09:30:00+08:00').getTime();

describe('预警系统引擎', () => {
  describe('条件评估', () => {
    it('大于条件', () => {
      expect(evaluateCondition(11, 10, 'gt', 10)).toBe(true);
      expect(evaluateCondition(9, 10, 'gt', 10)).toBe(false);
    });

    it('小于条件', () => {
      expect(evaluateCondition(9, 10, 'lt', 10)).toBe(true);
      expect(evaluateCondition(11, 10, 'lt', 10)).toBe(false);
    });

    it('大于等于条件', () => {
      expect(evaluateCondition(10, 9, 'gte', 10)).toBe(true);
      expect(evaluateCondition(11, 9, 'gte', 10)).toBe(true);
    });

    it('等于条件(容差)', () => {
      // 生产容差 0.0001（alertRuleEngine.ts:58）：旧副本 0.001 下 10.0005 为 true，生产为 false。
      expect(evaluateCondition(10.0005, 9, 'eq', 10)).toBe(false);
      expect(evaluateCondition(10.00005, 9, 'eq', 10)).toBe(true);
      expect(evaluateCondition(10.01, 9, 'eq', 10)).toBe(false);
    });

    it('向上穿越条件', () => {
      expect(evaluateCondition(11, 9, 'cross_above', 10)).toBe(true);
      expect(evaluateCondition(11, 11, 'cross_above', 10)).toBe(false);
      // 生产要求 previousValue 存在（:60）。
      expect(evaluateCondition(11, undefined, 'cross_above', 10)).toBe(false);
    });

    it('向下穿越条件', () => {
      expect(evaluateCondition(9, 11, 'cross_below', 10)).toBe(true);
      expect(evaluateCondition(9, 9, 'cross_below', 10)).toBe(false);
      expect(evaluateCondition(9, undefined, 'cross_below', 10)).toBe(false);
    });

    it('禁用条件返回false', () => {
      // 生产把启用开关放在规则级（AlertRule.enabled，:18）；evaluateCondition 无 enabled 参数，
      // 禁用规则由 evaluateRule 直接返回 null（:80）。
      expect(
        evaluateRule(makeRule({ threshold: 10, enabled: false }), { price: 100 }, { price: 50 }),
      ).toBeNull();
      expect(
        evaluateRule(makeRule({ threshold: 10, enabled: true }), { price: 100 }, { price: 50 }),
      ).not.toBeNull();
    });
  });

  describe('规则评估', () => {
    it('AND逻辑全部满足', () => {
      // 生产单规则只有一个条件（alertRuleEngine.ts:8-21），无 conditions[]/logic；
      // 旧「多条件全部满足」映射为「该条件满足即触发」。
      const trigger = evaluateRule(
        makeRule({ id: '1', operator: 'gt', threshold: 100 }),
        { price: 150 },
        { price: 140 },
      );
      expect(trigger).not.toBeNull();
      expect(trigger?.ruleId).toBe('1');
      expect(trigger?.currentValue).toBe(150);
      expect(trigger?.threshold).toBe(100);
    });

    it('AND逻辑部分满足不触发', () => {
      // 生产无「部分满足」概念；映射为单条件未满足 → null。
      const trigger = evaluateRule(
        makeRule({ id: '1', field: 'volume', operator: 'gt', threshold: 5000 }),
        { price: 150, volume: 2000 },
        { price: 140, volume: 1500 },
      );
      expect(trigger).toBeNull();
    });

    it('OR逻辑任一满足', () => {
      // 生产无 rule.logic='or'；OR 语义落在 evaluateRules 多规则层面：任一规则触发即返回（:106-137）。
      const rules = [
        makeRule({ id: 'price', operator: 'gt', threshold: 200 }),
        makeRule({ id: 'volume', field: 'volume', operator: 'gt', threshold: 1000 }),
      ];
      const triggers = evaluateRules(
        rules,
        stockMap([['600519', { price: 150, volume: 2000 }]]),
        stockMap([['600519', { price: 140, volume: 1500 }]]),
      );
      expect(triggers).toHaveLength(1);
      expect(triggers[0].ruleId).toBe('volume');
    });

    it('OR逻辑全部不满足', () => {
      const rules = [
        makeRule({ id: 'price', operator: 'gt', threshold: 200 }),
        makeRule({ id: 'volume', field: 'volume', operator: 'gt', threshold: 5000 }),
      ];
      const triggers = evaluateRules(
        rules,
        stockMap([['600519', { price: 150, volume: 2000 }]]),
        stockMap([['600519', { price: 140, volume: 1500 }]]),
      );
      expect(triggers).toHaveLength(0);
    });

    it('返回匹配字段列表', () => {
      // 生产 AlertTrigger 无 matchedConditions（:23-33）；匹配结果体现在 ruleId 与 currentValue（命中字段的值）。
      const trigger = evaluateRule(
        makeRule({ id: 'price-rule', field: 'price' }),
        { price: 150 },
        { price: 140 },
      );
      expect(trigger?.ruleId).toBe('price-rule');
      expect(trigger?.currentValue).toBe(150);
    });
  });

  describe('批量评估', () => {
    it('多规则批量触发', () => {
      // 生产 evaluateRules 只返回触发项（:127-131），冷却/未触发规则被过滤，不再返回带 triggered 标记的全量规则。
      const rules = [
        makeRule({ id: '1', stockCode: '600519', field: 'price', operator: 'gt', threshold: 100 }),
        makeRule({ id: '2', stockCode: '000858', field: 'price', operator: 'gt', threshold: 100 }),
      ];
      const triggers = evaluateRules(
        rules,
        stockMap([
          ['600519', { price: 150 }],
          ['000858', { price: 50 }],
        ]),
      );
      expect(triggers).toHaveLength(1);
      expect(triggers[0].ruleId).toBe('1');
      expect(triggers[0].currentValue).toBe(150);
    });

    it('缺失数据不触发', () => {
      // 生产 stockData.get(rule.stockCode) 取不到直接 continue（:116-117）。
      const rules = [makeRule({ id: '1', stockCode: '999999', operator: 'gt', threshold: 1 })];
      expect(evaluateRules(rules, stockMap([]))).toHaveLength(0);
    });
  });

  describe('预警消息生成', () => {
    it('生成正确消息', () => {
      // 生产 generateMessage（:225-235）格式：<name>: 当前值<toFixed(2)> ≥ 阈值<threshold>。
      const trigger = evaluateRule(
        makeRule({ name: '600519 价格突破', operator: 'gt', threshold: 100 }),
        { price: 150 },
        { price: 140 },
      );
      const message = trigger?.message ?? '';
      expect(message).toContain('600519');
      expect(message).toContain('当前值150.00');
      expect(message).toContain('阈值100');
    });

    it('包含多个条件', () => {
      // 生产无 conditions/logic，消息不含 OR 连接词（:225-235）；
      // 改为断言消息同时包含当前值与阈值这两项条件信息。
      const trigger = evaluateRule(
        makeRule({
          name: '000858 放量',
          stockCode: '000858',
          field: 'volume',
          operator: 'gte',
          threshold: 1000,
        }),
        { volume: 2000 },
        { volume: 1500 },
      );
      const message = trigger?.message ?? '';
      expect(message).toContain('2000.00');
      expect(message).toContain('阈值1000');
    });
  });

  describe('频率控制', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(NOW));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('首次允许', () => {
      expect(
        evaluateRules([makeRule({ cooldownMinutes: 5 })], stockMap([['600519', { price: 150 }]])),
      ).toHaveLength(1);
    });

    it('冷却期内拒绝', () => {
      // 上一次触发在 1 分钟前，规则冷却 5 分钟 → 生产 :122 判断 now-last < cooldown 时 continue。
      const lastTriggerTimes = new Map<string, number>([['1', NOW - 60_000]]);
      expect(
        evaluateRules(
          [makeRule({ cooldownMinutes: 5 })],
          stockMap([['600519', { price: 150 }]]),
          undefined,
          lastTriggerTimes,
        ),
      ).toHaveLength(0);
    });

    it('冷却期后允许', () => {
      // 上一次触发在 61 秒前，规则冷却 1 分钟 → 已过冷却，允许触发。
      const lastTriggerTimes = new Map<string, number>([['1', NOW - 61_000]]);
      expect(
        evaluateRules(
          [makeRule({ cooldownMinutes: 1 })],
          stockMap([['600519', { price: 150 }]]),
          undefined,
          lastTriggerTimes,
        ),
      ).toHaveLength(1);
    });

    it('不同规则独立', () => {
      // 生产按 rule.id 记录上次触发（:121），id=2 不受 id=1 的冷却影响。
      const lastTriggerTimes = new Map<string, number>([['1', NOW]]);
      expect(
        evaluateRules(
          [makeRule({ id: '2', cooldownMinutes: 5 })],
          stockMap([['600519', { price: 150 }]]),
          undefined,
          lastTriggerTimes,
        ),
      ).toHaveLength(1);
    });

    it('剩余冷却时间', () => {
      // 未迁移：生产不导出剩余冷却毫秒数，本地 helper 见文件头。
      expect(getRemainingCooldown(5, NOW, NOW + 120_000)).toBe(180_000);
    });

    it('无记录返回0冷却', () => {
      expect(getRemainingCooldown(5, undefined, NOW)).toBe(0);
    });
  });
});
