/**
 * 北向资金引擎 —— 净流入 null 诚实性守卫（P0-NBFLOW）
 *
 * 背景：交易所自 2024-08-19 起停止披露北向净买额，`total` 恒为 null。
 * 引擎旧实现 `sorted[0]?.total ?? 0` 与 `reduce(sum)` 会把 null 静默变成 0，
 * 让页面显示「今日北向净流入 0.00 亿」——即零值顶替空态（红线）。
 * 本文件断言：null 一律传播为 null，绝不参与算术、绝不回落 0。
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeNorthboundFlow,
  generateNorthboundSignals,
  type NorthboundFlow,
} from '../utils/northboundFlow';

/** 真实后端形态：净买额停披露 → total 为 null */
const disclosed: NorthboundFlow = {
  date: '2026-09-30',
  shConnect: null,
  szConnect: null,
  total: null,
  shBuy: null,
  shSell: null,
  szBuy: null,
  szSell: null,
};

const flow = (date: string, total: number | null): NorthboundFlow => ({
  date,
  shConnect: total,
  szConnect: total,
  total,
  shBuy: 100,
  shSell: 100,
  szBuy: 100,
  szSell: 100,
});

describe('summarizeNorthboundFlow · 净流入 null 不回落 0', () => {
  it('空数组：全部为 null，netInflowDisclosed=false（不是 0）', () => {
    const s = summarizeNorthboundFlow([]);
    expect(s.todayNet).toBeNull();
    expect(s.weekNet).toBeNull();
    expect(s.monthNet).toBeNull();
    expect(s.monthDayAvg).toBeNull();
    expect(s.momentum).toBeNull();
    expect(s.trend).toBe('neutral');
    expect(s.netInflowDisclosed).toBe(false);
  });

  it('全部 total 为 null：不得出现 0，也不得宣称已披露', () => {
    const s = summarizeNorthboundFlow([
      disclosed,
      { ...disclosed, date: '2026-09-29' },
      { ...disclosed, date: '2026-09-28' },
    ]);
    expect(s.todayNet).toBeNull();
    expect(s.weekNet).toBeNull();
    expect(s.monthNet).toBeNull();
    expect(s.monthDayAvg).toBeNull();
    expect(s.netInflowDisclosed).toBe(false);
    // 显式红线断言：任何一个字段都不得等于 0
    for (const v of [s.todayNet, s.weekNet, s.monthNet, s.monthDayAvg, s.momentum]) {
      expect(v).not.toBe(0);
    }
  });

  it('窗口内任一天缺披露 → 整个窗口为 null（不做部分和）', () => {
    const s = summarizeNorthboundFlow([
      flow('2026-09-30', 100),
      disclosed,                       // 最新日有、次新日缺
      flow('2026-09-28', -50),
    ]);
    expect(s.todayNet).toBe(100);       // 最新日单独可得
    expect(s.weekNet).toBeNull();       // 窗口不完整 → null
    expect(s.monthNet).toBeNull();
  });

  it('最新一天缺披露 → todayNet 为 null（不被次日数据顶替）', () => {
    const s = summarizeNorthboundFlow([
      disclosed,
      flow('2026-09-29', 888),
    ]);
    expect(s.todayNet).toBeNull();
    expect(s.weekNet).toBeNull();
  });

  it('连续天数遇 null 即中断', () => {
    const s = summarizeNorthboundFlow([
      flow('2026-09-30', 30),
      flow('2026-09-29', 20),
      { ...disclosed, date: '2026-09-28' },  // 方向未知，断链
      flow('2026-09-27', 20),
      flow('2026-09-26', 20),
    ]);
    expect(s.consecutiveDays).toBe(2);
  });

  it('分母为 0 时 momentum 为 null（不用 1 顶替）', () => {
    const s = summarizeNorthboundFlow([
      flow('2026-09-30', 0),
      flow('2026-09-29', 0),
      flow('2026-09-28', 0),
    ]);
    expect(s.monthDayAvg).toBe(0);
    expect(s.momentum).toBeNull();
  });

  it('真实数值口径下汇总仍正确（回归守卫）', () => {
    const s = summarizeNorthboundFlow([
      flow('2026-09-30', 50),
      flow('2026-09-29', 5),
      flow('2026-09-28', 35),
    ]);
    expect(s.todayNet).toBe(50);
    expect(s.weekNet).toBe(90);
    expect(s.monthNet).toBe(90);
    expect(s.netInflowDisclosed).toBe(true);
  });
});

describe('generateNorthboundSignals · 停披露时不猜方向', () => {
  it('netInflowDisclosed=false 时只出 1 条说明性中性信号，不出方向信号', () => {
    const s = summarizeNorthboundFlow([disclosed, { ...disclosed, date: '2026-09-29' }]);
    const signals = generateNorthboundSignals(s);
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('neutral');
    expect(signals[0].message).toContain('净买额口径已停止披露');
    expect(signals.some((x) => x.type === 'bullish' || x.type === 'bearish')).toBe(false);
  });

  it('净流入缺失时信号文本不含「0亿」或「大幅净流入」', () => {
    const s = summarizeNorthboundFlow([disclosed]);
    const signals = generateNorthboundSignals(s);
    for (const sig of signals) {
      expect(sig.message).not.toMatch(/0\.00\s*亿/);
      expect(sig.message).not.toContain('大幅净流入');
    }
  });
});

describe('成交额单位换算（后端 dealAmount 单位 = 万元）', () => {
  /** 与页面同一换算规则：万元 → 亿元 = ÷10000 */
  const WAN_TO_YI = 1 / 10000;
  const wanToYi = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n * WAN_TO_YI : null;
  };

  it('800000 万元 → 80 亿', () => {
    expect(wanToYi(800000)).toBe(80);
  });
  it('500000 万元 → 50 亿', () => {
    expect(wanToYi(500000)).toBe(50);
  });
  it('1460000 万元 → 146 亿', () => {
    expect(wanToYi(1460000)).toBe(146);
  });
  it('null → null（不是 0）', () => {
    expect(wanToYi(null)).toBeNull();
    expect(wanToYi(undefined)).toBeNull();
  });
  it('0 是合法的真实成交额，不等于「缺失」', () => {
    expect(wanToYi(0)).toBe(0);
  });
});