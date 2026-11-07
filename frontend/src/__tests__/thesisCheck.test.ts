import { describe, expect, it } from 'vitest';
import { evaluateThesis, THESIS_STALE_DAYS } from '../utils/thesisCheck';

const now = new Date('2026-11-07T00:00:00.000Z');
const base = {
  stance: 'bullish' as const,
  valuation: { buy: 1200, fair: 1500, sell: 1800 },
  updatedAt: '2026-11-06T00:00:00.000Z',
};

describe('观点检查', () => {
  it('缺行情时必须是待验证，不得默认有效', () => {
    const result = evaluateThesis(base, null, now);
    expect(result.verdict).toBe('unknown');
    expect(result.label).toBe('待验证');
    expect(result.reasons[0]).toContain('缺少最新行情');
  });

  it('非法价格按缺行情处理', () => {
    expect(evaluateThesis(base, Number.NaN, now).verdict).toBe('unknown');
    expect(evaluateThesis(base, 0, now).verdict).toBe('unknown');
  });

  it('看多：买入区间内有效，高于合理价存疑，触及卖出价证伪', () => {
    expect(evaluateThesis(base, 1100, now).verdict).toBe('valid');
    expect(evaluateThesis(base, 1600, now).verdict).toBe('warning');
    expect(evaluateThesis(base, 1800, now).verdict).toBe('invalid');
    expect(evaluateThesis(base, 1800, now).reasons[0]).toContain('卖出价');
  });

  it('看空：跌到买入价说明赔率消失', () => {
    const result = evaluateThesis({ ...base, stance: 'bearish' }, 1100, now);
    expect(result.verdict).toBe('invalid');
  });

  it('未填估值区间时不给结论', () => {
    const result = evaluateThesis(
      { ...base, valuation: { buy: null, fair: null, sell: null } },
      1500,
      now,
    );
    expect(result.verdict).toBe('unknown');
    expect(result.reasons[0]).toContain('未填写估值区间');
  });

  it('超过 ' + THESIS_STALE_DAYS + ' 天未复核：有效降为存疑', () => {
    const stale = { ...base, updatedAt: '2026-06-01T00:00:00.000Z' };
    const result = evaluateThesis(stale, 1100, now);
    expect(result.staleDays).toBeGreaterThanOrEqual(THESIS_STALE_DAYS);
    expect(result.verdict).toBe('warning');
    expect(result.reasons.join('；')).toContain('未复核');
  });
});
