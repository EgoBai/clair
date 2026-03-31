import { describe, it, expect } from 'vitest';

/**
 * 股东变动分析测试
 */

interface ShareholderChange {
  code: string;
  date: string;
  holder: string;
  type: 'increase' | 'decrease' | 'new' | 'exit';
  shares: number;
  percent: number;
  avgPrice?: number;
}

interface ShareholderAnalysis {
  code: string;
  totalChanges: number;
  netChange: number;
  insiderSentiment: 'bullish' | 'bearish' | 'neutral';
  largeChanges: ShareholderChange[];
  topBuyers: Array<{ holder: string; shares: number }>;
  topSellers: Array<{ holder: string; shares: number }>;
}

function analyzeShareholderChanges(code: string, changes: ShareholderChange[]): ShareholderAnalysis {
  const codeChanges = changes.filter(c => c.code === code);
  let netChange = 0;
  const buyers: Map<string, number> = new Map();
  const sellers: Map<string, number> = new Map();

  for (const change of codeChanges) {
    if (change.type === 'increase' || change.type === 'new') {
      netChange += change.shares;
      buyers.set(change.holder, (buyers.get(change.holder) || 0) + change.shares);
    } else {
      netChange -= change.shares;
      sellers.set(change.holder, (sellers.get(change.holder) || 0) + change.shares);
    }
  }

  const largeChanges = codeChanges.filter(c => c.percent > 1);
  const topBuyers = [...buyers.entries()]
    .map(([holder, shares]) => ({ holder, shares }))
    .sort((a, b) => b.shares - a.shares)
    .slice(0, 5);
  const topSellers = [...sellers.entries()]
    .map(([holder, shares]) => ({ holder, shares }))
    .sort((a, b) => b.shares - a.shares)
    .slice(0, 5);

  let insiderSentiment: ShareholderAnalysis['insiderSentiment'] = 'neutral';
  if (netChange > 0) insiderSentiment = 'bullish';
  else if (netChange < 0) insiderSentiment = 'bearish';

  return {
    code,
    totalChanges: codeChanges.length,
    netChange,
    insiderSentiment,
    largeChanges,
    topBuyers,
    topSellers,
  };
}

function detectAbnormalChanges(changes: ShareholderChange[], threshold: number = 5): ShareholderChange[] {
  return changes.filter(c => Math.abs(c.percent) > threshold);
}

function calcInsiderScore(changes: ShareholderChange[]): number {
  let score = 50;
  for (const change of changes) {
    if (change.type === 'increase' || change.type === 'new') {
      score += change.percent * 2;
    } else {
      score -= change.percent * 2;
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

describe('Shareholder Changes', () => {
  const changes: ShareholderChange[] = [
    { code: '000001', date: '2024-01-15', holder: '大股东A', type: 'increase', shares: 10000000, percent: 2.5 },
    { code: '000001', date: '2024-01-20', holder: '机构B', type: 'decrease', shares: 5000000, percent: 1.2 },
    { code: '000001', date: '2024-02-01', holder: '高管C', type: 'new', shares: 2000000, percent: 0.5 },
    { code: '000001', date: '2024-02-10', holder: '大股东A', type: 'increase', shares: 8000000, percent: 2.0 },
    { code: '000001', date: '2024-02-15', holder: '散户D', type: 'exit', shares: 1000000, percent: 0.25 },
  ];

  describe('股东变动分析', () => {
    it('应该计算净变动', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.netChange).toBe(14000000); // 10M + 2M + 8M - 5M - 1M
    });

    it('应该判断内部人情绪', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.insiderSentiment).toBe('bullish');
    });

    it('应该统计变动次数', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.totalChanges).toBe(5);
    });

    it('应该找出大额变动', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.largeChanges.length).toBeGreaterThanOrEqual(3); // > 1%
    });

    it('应该列出主要买家', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.topBuyers[0].holder).toBe('大股东A'); // 18M total
    });

    it('应该列出主要卖家', () => {
      const analysis = analyzeShareholderChanges('000001', changes);
      expect(analysis.topSellers[0].holder).toBe('机构B');
    });
  });

  describe('异常变动检测', () => {
    it('应该检测大额变动', () => {
      const abnormal = detectAbnormalChanges(changes, 2);
      expect(abnormal.length).toBeGreaterThanOrEqual(1); // At least 2.5%
    });

    it('应该按阈值过滤', () => {
      const abnormal = detectAbnormalChanges(changes, 5);
      expect(abnormal.length).toBe(0);
    });
  });

  describe('内部人评分', () => {
    it('应该计算评分', () => {
      const score = calcInsiderScore(changes);
      expect(score).toBeGreaterThan(50); // 净增持
    });

    it('空变动应该返回50', () => {
      expect(calcInsiderScore([])).toBe(50);
    });

    it('评分应该在0-100之间', () => {
      const score = calcInsiderScore(changes);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('边界条件', () => {
    it('无记录股票应该返回空结果', () => {
      const analysis = analyzeShareholderChanges('999999', changes);
      expect(analysis.totalChanges).toBe(0);
      expect(analysis.netChange).toBe(0);
    });
  });
});
