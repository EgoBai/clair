import { describe, it, expect } from 'vitest';

/**
 * 研究报告分析引擎测试
 */

interface ResearchReport {
  id: string;
  title: string;
  author: string;
  institution: string;
  publishDate: string;
  stockCode: string;
  stockName: string;
  rating: 'buy' | 'hold' | 'sell' | 'strong_buy' | 'strong_sell';
  targetPrice: number;
  currentPrice: number;
  summary: string;
}

interface ReportAnalysis {
  consensusRating: string;
  avgTargetPrice: number;
  targetUpside: number;
  ratingDistribution: Record<string, number>;
  mostCitedAuthor: string;
  reportCount: number;
  bullishPct: number;
  recommendation: string;
}

function analyzeReports(reports: ResearchReport[]): ReportAnalysis {
  if (reports.length === 0) {
    return { consensusRating: 'neutral', avgTargetPrice: 0, targetUpside: 0, ratingDistribution: {}, mostCitedAuthor: '', reportCount: 0, bullishPct: 0, recommendation: '无数据' };
  }
  const dist: Record<string, number> = {};
  reports.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });
  const avgTarget = reports.reduce((s, r) => s + r.targetPrice, 0) / reports.length;
  const avgCurrent = reports.reduce((s, r) => s + r.currentPrice, 0) / reports.length;
  const upside = avgCurrent > 0 ? ((avgTarget - avgCurrent) / avgCurrent) * 100 : 0;
  const bullish = (dist['buy'] || 0) + (dist['strong_buy'] || 0);
  const bullishPct = (bullish / reports.length) * 100;
  const authorCount = new Map<string, number>();
  reports.forEach(r => authorCount.set(r.author, (authorCount.get(r.author) || 0) + 1));
  const mostCited = Array.from(authorCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const consensusRating = bullishPct > 60 ? 'bullish' : bullishPct < 40 ? 'bearish' : 'neutral';
  const recommendation = upside > 20 && bullishPct > 60 ? '强烈推荐关注' : upside > 10 ? '可适当关注' : '观望为主';
  return {
    consensusRating,
    avgTargetPrice: parseFloat(avgTarget.toFixed(2)),
    targetUpside: parseFloat(upside.toFixed(2)),
    ratingDistribution: dist,
    mostCitedAuthor: mostCited,
    reportCount: reports.length,
    bullishPct: parseFloat(bullishPct.toFixed(2)),
    recommendation,
  };
}

function calculateConsensusAccuracy(reports: ResearchReport[]): { accuracy: number; avgBias: number; overestimatePct: number } {
  if (reports.length === 0) return { accuracy: 0, avgBias: 0, overestimatePct: 0 };
  const biases = reports.map(r => r.targetPrice - r.currentPrice);
  const avgBias = biases.reduce((a, b) => a + b, 0) / biases.length;
  const overestimate = biases.filter(b => b > 0).length;
  return {
    accuracy: parseFloat((100 - Math.abs(avgBias / (reports[0].currentPrice || 1)) * 10).toFixed(2)),
    avgBias: parseFloat(avgBias.toFixed(2)),
    overestimatePct: parseFloat(((overestimate / reports.length) * 100).toFixed(2)),
  };
}

describe('研究报告分析引擎', () => {
  const makeReport = (rating: ResearchReport['rating'], target = 100, current = 80, author = 'A'): ResearchReport => ({
    id: '1', title: 'Report', author, institution: 'CICC', publishDate: '2024-01-01',
    stockCode: '600519', stockName: '茅台', rating, targetPrice: target, currentPrice: current, summary: '',
  });

  describe('analyzeReports', () => {
    it('should calculate consensus', () => {
      const reports = [makeReport('buy'), makeReport('buy'), makeReport('hold')];
      const analysis = analyzeReports(reports);
      expect(analysis.consensusRating).toBe('bullish');
      expect(analysis.reportCount).toBe(3);
    });

    it('should calculate upside', () => {
      const analysis = analyzeReports([makeReport('buy', 100, 80)]);
      expect(analysis.targetUpside).toBeCloseTo(25, 0);
    });

    it('should handle empty reports', () => {
      const analysis = analyzeReports([]);
      expect(analysis.reportCount).toBe(0);
    });

    it('should count rating distribution', () => {
      const reports = [makeReport('buy'), makeReport('buy'), makeReport('sell')];
      const analysis = analyzeReports(reports);
      expect(analysis.ratingDistribution['buy']).toBe(2);
      expect(analysis.ratingDistribution['sell']).toBe(1);
    });

    it('bullishPct should be 0-100', () => {
      const analysis = analyzeReports([makeReport('buy'), makeReport('sell')]);
      expect(analysis.bullishPct).toBe(50);
    });
  });

  describe('calculateConsensusAccuracy', () => {
    it('should return accuracy metrics', () => {
      const reports = [makeReport('buy', 100, 80), makeReport('buy', 110, 80)];
      const acc = calculateConsensusAccuracy(reports);
      expect(acc.overestimatePct).toBe(100);
      expect(acc.avgBias).toBeGreaterThan(0);
    });
  });
});
