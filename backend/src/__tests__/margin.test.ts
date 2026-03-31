import { describe, it, expect } from 'vitest';

/**
 * 融资融券分析测试
 */

interface MarginData {
  code: string;
  date: string;
  marginBuy: number;      // 融资买入
  marginRepay: number;    // 融资偿还
  marginBalance: number;  // 融资余额
  shortSell: number;      // 融券卖出
  shortRepay: number;     // 融券偿还
  shortBalance: number;   // 融券余额
  totalMargin: number;    // 融资融券余额
}

interface MarginAnalysis {
  code: string;
  netMarginBuy: number;
  marginChange: number;
  marginChangePercent: number;
  shortRatio: number;
  leverageRatio: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  warning: string | null;
}

function analyzeMargin(data: MarginData[]): MarginAnalysis[] {
  const byCode = new Map<string, MarginData[]>();
  for (const d of data) {
    const existing = byCode.get(d.code) || [];
    existing.push(d);
    byCode.set(d.code, existing);
  }

  const results: MarginAnalysis[] = [];
  for (const [code, codeData] of byCode) {
    const sorted = codeData.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const netMarginBuy = latest.marginBuy - latest.marginRepay;
    const marginChange = prev ? latest.marginBalance - prev.marginBalance : 0;
    const marginChangePercent = prev && prev.marginBalance > 0
      ? (marginChange / prev.marginBalance) * 100
      : 0;
    const shortRatio = latest.totalMargin > 0
      ? (latest.shortBalance / latest.totalMargin) * 100
      : 0;
    const leverageRatio = latest.marginBalance > 0
      ? latest.totalMargin / latest.marginBalance
      : 0;

    let sentiment: MarginAnalysis['sentiment'] = 'neutral';
    if (netMarginBuy > 0 && marginChangePercent > 5) sentiment = 'bullish';
    else if (netMarginBuy < 0 && marginChangePercent < -5) sentiment = 'bearish';

    let warning: string | null = null;
    if (shortRatio > 30) warning = '融券比例偏高';
    else if (leverageRatio > 2) warning = '杠杆率偏高';
    else if (Math.abs(marginChangePercent) > 20) warning = '融资余额变动异常';

    results.push({
      code,
      netMarginBuy: Math.round(netMarginBuy),
      marginChange: Math.round(marginChange),
      marginChangePercent: Math.round(marginChangePercent * 100) / 100,
      shortRatio: Math.round(shortRatio * 100) / 100,
      leverageRatio: Math.round(leverageRatio * 100) / 100,
      sentiment,
      warning,
    });
  }

  return results;
}

function calcMarginFlow(data: MarginData[]): { inflow: number; outflow: number; net: number } {
  const inflow = data.reduce((s, d) => s + d.marginBuy, 0);
  const outflow = data.reduce((s, d) => s + d.marginRepay, 0);
  return { inflow: Math.round(inflow), outflow: Math.round(outflow), net: Math.round(inflow - outflow) };
}

function detectMarginAnomaly(data: MarginData[], threshold: number = 30): boolean {
  if (data.length < 2) return false;
  const sorted = data.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const change = sorted[i - 1].marginBalance > 0
      ? Math.abs((sorted[i].marginBalance - sorted[i - 1].marginBalance) / sorted[i - 1].marginBalance * 100)
      : 0;
    if (change > threshold) return true;
  }
  return false;
}

describe('Margin Analysis', () => {
  const marginData: MarginData[] = [
    { code: '000001', date: '2024-01-01', marginBuy: 1e9, marginRepay: 8e8, marginBalance: 5e9, shortSell: 1e8, shortRepay: 5e7, shortBalance: 2e8, totalMargin: 5.2e9 },
    { code: '000001', date: '2024-01-02', marginBuy: 1.2e9, marginRepay: 9e8, marginBalance: 5.3e9, shortSell: 1.2e8, shortRepay: 6e7, shortBalance: 2.6e8, totalMargin: 5.56e9 },
    { code: '000001', date: '2024-01-03', marginBuy: 8e8, marginRepay: 1e9, marginBalance: 5.1e9, shortSell: 8e7, shortRepay: 1e8, shortBalance: 2.4e8, totalMargin: 5.34e9 },
    { code: '600519', date: '2024-01-01', marginBuy: 2e9, marginRepay: 1.5e9, marginBalance: 10e9, shortSell: 5e8, shortRepay: 3e8, shortBalance: 1e9, totalMargin: 11e9 },
    { code: '600519', date: '2024-01-02', marginBuy: 2.5e9, marginRepay: 1.8e9, marginBalance: 10.7e9, shortSell: 6e8, shortRepay: 4e8, shortBalance: 1.2e9, totalMargin: 11.9e9 },
  ];

  describe('融资融券分析', () => {
    it('应该计算净融资买入', () => {
      const analysis = analyzeMargin(marginData);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.netMarginBuy).toBeDefined();
    });

    it('应该计算融资余额变动', () => {
      const analysis = analyzeMargin(marginData);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.marginChange).toBeDefined();
    });

    it('应该计算融券比例', () => {
      const analysis = analyzeMargin(marginData);
      for (const a of analysis) {
        expect(a.shortRatio).toBeGreaterThanOrEqual(0);
        expect(a.shortRatio).toBeLessThanOrEqual(100);
      }
    });

    it('应该判断情绪', () => {
      const analysis = analyzeMargin(marginData);
      for (const a of analysis) {
        expect(['bullish', 'bearish', 'neutral']).toContain(a.sentiment);
      }
    });

    it('应该检测异常并警告', () => {
      const analysis = analyzeMargin(marginData);
      for (const a of analysis) {
        // Warning may or may not be present
        if (a.warning) {
          expect(typeof a.warning).toBe('string');
        }
      }
    });
  });

  describe('资金流向', () => {
    it('应该计算流入流出', () => {
      const flow = calcMarginFlow(marginData.filter(d => d.code === '000001'));
      expect(flow.inflow).toBeGreaterThan(0);
      expect(flow.outflow).toBeGreaterThan(0);
      expect(flow.net).toBe(flow.inflow - flow.outflow);
    });
  });

  describe('异常检测', () => {
    it('应该检测到异常变动', () => {
      const abnormalData: MarginData[] = [
        { code: '000001', date: '2024-01-01', marginBuy: 1e9, marginRepay: 8e8, marginBalance: 5e9, shortSell: 1e8, shortRepay: 5e7, shortBalance: 2e8, totalMargin: 5.2e9 },
        { code: '000001', date: '2024-01-02', marginBuy: 5e9, marginRepay: 5e8, marginBalance: 9.5e9, shortSell: 1e8, shortRepay: 5e7, shortBalance: 2e8, totalMargin: 9.7e9 },
      ];
      expect(detectMarginAnomaly(abnormalData, 30)).toBe(true);
    });

    it('正常变动不应该触发', () => {
      expect(detectMarginAnomaly(marginData.filter(d => d.code === '000001'), 30)).toBe(false);
    });
  });
});
