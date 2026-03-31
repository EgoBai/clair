import { describe, it, expect } from 'vitest';
import { blackLitterman, BlackLittermanInput, InvestorView } from '../utils/blackLittermanEngine';

describe('Black-Litterman模型引擎', () => {
  const n = 4;
  const covMatrix = [
    [0.04, 0.01, 0.02, 0.005],
    [0.01, 0.09, 0.015, 0.01],
    [0.02, 0.015, 0.06, 0.008],
    [0.005, 0.01, 0.008, 0.03],
  ];

  const baseInput: BlackLittermanInput = {
    marketCaps: [
      { code: 'A', marketCap: 5e11, weight: 0.4 },
      { code: 'B', marketCap: 3e11, weight: 0.3 },
      { code: 'C', marketCap: 1.5e11, weight: 0.2 },
      { code: 'D', marketCap: 5e10, weight: 0.1 },
    ],
    covMatrix,
    riskFreeRate: 0.03,
    views: [],
    tau: 0.05,
  };

  it('应该计算先验收益', () => {
    const result = blackLitterman(baseInput);
    expect(result.priorReturns.length).toBe(n);
    for (const r of result.priorReturns) {
      expect(typeof r).toBe('number');
    }
  });

  it('无观点时后验等于先验', () => {
    const result = blackLitterman(baseInput);
    for (let i = 0; i < n; i++) {
      expect(result.posteriorReturns[i]).toBeCloseTo(result.priorReturns[i], 5);
    }
  });

  it('应该融合投资者观点', () => {
    const views: InvestorView[] = [
      { assets: [1, 0, 0, 0], expectedReturn: 0.15, confidence: 0.8 },
    ];
    const result = blackLitterman({ ...baseInput, views });
    // 后验收益应该不等于先验(已融合观点)
    expect(result.posteriorReturns.length).toBe(n);
    expect(result.posteriorReturns.some((r, i) => r !== result.priorReturns[i])).toBe(true);
  });

  it('应该计算调整后权重', () => {
    const views: InvestorView[] = [
      { assets: [1, -1, 0, 0], expectedReturn: 0.05, confidence: 0.7 },
    ];
    const result = blackLitterman({ ...baseInput, views });
    expect(result.adjustedWeights.length).toBe(n);
    const totalWeight = result.adjustedWeights.reduce((s, w) => s + w.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 1);
  });

  it('应该计算视点影响', () => {
    const views: InvestorView[] = [
      { assets: [1, 0, 0, 0], expectedReturn: 0.2, confidence: 0.9 },
      { assets: [0, 1, 0, 0], expectedReturn: -0.05, confidence: 0.6 },
    ];
    const result = blackLitterman({ ...baseInput, views });
    expect(result.viewImpact.length).toBe(2);
  });

  it('应该计算不确定性', () => {
    const result = blackLitterman(baseInput);
    expect(result.uncertainty.length).toBe(n);
    for (const u of result.uncertainty) {
      expect(u).toBeGreaterThanOrEqual(0);
    }
  });

  it('应该计算夏普比率', () => {
    const result = blackLitterman(baseInput);
    expect(typeof result.sharpeRatio).toBe('number');
  });

  it('高信心观点应该有更大影响', () => {
    const highConf: InvestorView[] = [{ assets: [1, 0, 0, 0], expectedReturn: 0.2, confidence: 0.95 }];
    const lowConf: InvestorView[] = [{ assets: [1, 0, 0, 0], expectedReturn: 0.2, confidence: 0.1 }];
    const rHigh = blackLitterman({ ...baseInput, views: highConf });
    const rLow = blackLitterman({ ...baseInput, views: lowConf });
    const impactHigh = Math.abs(rHigh.posteriorReturns[0] - rHigh.priorReturns[0]);
    const impactLow = Math.abs(rLow.posteriorReturns[0] - rLow.priorReturns[0]);
    expect(impactHigh).toBeGreaterThan(impactLow);
  });

  it('应该处理多观点', () => {
    const views: InvestorView[] = [
      { assets: [1, -1, 0, 0], expectedReturn: 0.03, confidence: 0.8 },
      { assets: [0, 0, 1, -1], expectedReturn: 0.02, confidence: 0.7 },
      { assets: [0.5, 0.5, 0, 0], expectedReturn: 0.1, confidence: 0.6 },
    ];
    const result = blackLitterman({ ...baseInput, views });
    expect(result.posteriorReturns.length).toBe(n);
  });

  it('应保留超额收益计算', () => {
    const result = blackLitterman(baseInput);
    for (const w of result.adjustedWeights) {
      expect(typeof w.excessReturn).toBe('number');
    }
  });
});
