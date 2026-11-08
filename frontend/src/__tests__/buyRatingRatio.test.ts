import { describe, it, expect } from 'vitest';
import { buyRatingRatio } from '../utils/buyRatingRatio';

describe('buyRatingRatio 买入评级占比', () => {
  it('37 买入 / 10 增持 / 3 未评级 = 78.7%，增持不计入分子', () => {
    const ratings = [
      ...Array(37).fill('buy'),
      ...Array(10).fill('overweight'),
      ...Array(3).fill('none'),
    ];
    expect(buyRatingRatio(ratings)).toBeCloseTo(37 / 47, 6);
    expect(Math.round(buyRatingRatio(ratings) * 1000) / 10).toBe(78.7);
  });

  it('全部为增持时返回 0，不得显示 100%', () => {
    expect(buyRatingRatio(['overweight', 'overweight'])).toBe(0);
  });

  it('有评级研报为空时返回 0', () => {
    expect(buyRatingRatio(['none', 'none'])).toBe(0);
    expect(buyRatingRatio([])).toBe(0);
  });

  it('全部为买入时返回 1', () => {
    expect(buyRatingRatio(['buy', 'buy'])).toBe(1);
  });
});
