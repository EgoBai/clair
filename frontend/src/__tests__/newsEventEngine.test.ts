import { describe, it, expect } from 'vitest';
import {
  classifyNews,
  analyzeSentiment,
  assessEventImpact,
  generateEventSignals,
  traceAnomaly,
  analyzeNewsHeat,
  runNewsAnalysis,
  type NewsEvent,
} from '../utils/newsEventEngine';

function makeNews(overrides: Partial<NewsEvent> = {}): NewsEvent {
  return {
    id: 'N001',
    title: '央行宣布降准0.5个百分点',
    content: '央行决定下调存款准备金率0.5个百分点，释放长期资金约1万亿元。',
    publishTime: '2025-03-15 10:00',
    source: '新华社',
    relatedStocks: ['000001.SZ'],
    ...overrides,
  };
}

describe('newsEventEngine', () => {
  describe('classifyNews', () => {
    it('should classify policy news', () => {
      const news = makeNews();
      const result = classifyNews(news);
      expect(result.category).toBe('policy');
    });

    it('should classify earnings news', () => {
      const news = makeNews({
        title: '公司业绩超预期',
        content: '净利润同比增长50%，营收大增',
      });
      const result = classifyNews(news);
      expect(result.category).toBe('earnings');
    });

    it('should classify MA news', () => {
      const news = makeNews({
        title: '公司拟收购标的',
        content: '公司计划以现金收购目标公司100%股权',
      });
      const result = classifyNews(news);
      expect(result.category).toBe('ma');
    });

    it('should identify impact scope', () => {
      const news = makeNews({ relatedStocks: ['001', '002', '003', '004'] });
      const result = classifyNews(news);
      expect(result.impactScope).toBe('sector');
    });

    it('should extract keywords', () => {
      const news = makeNews();
      const result = classifyNews(news);
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      const news = makeNews({
        title: '公司业绩大增超预期',
        content: '净利润增长80%，创新突破',
      });
      const { sentiment } = analyzeSentiment(news);
      expect(['positive', 'very_positive']).toContain(sentiment);
    });

    it('should detect negative sentiment', () => {
      const news = makeNews({
        title: '公司涉嫌违规被处罚',
        content: '因信披违规被证监会立案调查，面临退市风险',
      });
      const { sentiment } = analyzeSentiment(news);
      expect(['negative', 'very_negative']).toContain(sentiment);
    });

    it('should detect neutral sentiment', () => {
      const news = makeNews({
        title: '公司召开年度股东大会',
        content: '审议通过各项议案',
      });
      const { sentiment } = analyzeSentiment(news);
      expect(sentiment).toBe('neutral');
    });

    it('should return score -1 to 1', () => {
      const news = makeNews();
      const { score } = analyzeSentiment(news);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('assessEventImpact', () => {
    it('should assess impact magnitude', () => {
      const news = makeNews();
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      expect(impact.impactMagnitude).toBeGreaterThan(0);
    });

    it('should determine impact duration', () => {
      const news = makeNews();
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      expect(['ultra_short', 'short', 'medium', 'long']).toContain(impact.impactDuration);
    });

    it('should calculate expected price move', () => {
      const news = makeNews();
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      expect(typeof impact.expectedPriceMove).toBe('number');
    });

    it('should include reasoning', () => {
      const news = makeNews();
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      expect(impact.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('generateEventSignals', () => {
    it('should generate buy signal for positive news', () => {
      const news = makeNews({
        title: '公司业绩大增超预期创新高',
        content: '净利润增长100%，超出市场预期',
      });
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      const signals = generateEventSignals(news, impact, 10);
      expect(signals.some(s => s.signal === 'buy')).toBe(true);
    });

    it('should include stop loss', () => {
      const news = makeNews();
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      const signals = generateEventSignals(news, impact, 10);
      for (const s of signals) {
        if (s.signal === 'buy') {
          expect(s.stopLoss).toBeLessThan(s.entryPrice);
        }
      }
    });

    it('should include risk-reward ratio', () => {
      const news = makeNews({
        title: '公司业绩大增超预期',
        content: '净利润增长100%，突破新高',
      });
      const classification = classifyNews(news);
      const impact = assessEventImpact(news, classification, 10);
      const signals = generateEventSignals(news, impact, 10);
      for (const s of signals) {
        if (s.signal !== 'watch') {
          expect(s.riskReward).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('traceAnomaly', () => {
    it('should trace likely causes', () => {
      const news = [makeNews(), makeNews({ id: 'N002', title: '公司被调查' })];
      const trace = traceAnomaly('000001.SZ', '10:30', -0.05, 3, news);
      expect(trace.likelyCauses.length).toBeGreaterThan(0);
    });

    it('should confirm if confidence is high', () => {
      const news = [makeNews()];
      const trace = traceAnomaly('000001.SZ', '10:30', -0.05, 3, news);
      expect(typeof trace.isConfirmed).toBe('boolean');
    });
  });

  describe('analyzeNewsHeat', () => {
    it('should analyze news heat by category', () => {
      const news = [
        makeNews(),
        makeNews({ id: 'N002', title: '业绩增长', content: '营收净利双增' }),
        makeNews({ id: 'N003', title: '行业景气', content: '行业供需紧张' }),
      ];
      const heatmaps = analyzeNewsHeat(news);
      expect(heatmaps.length).toBeGreaterThan(0);
    });

    it('should sort by heat score', () => {
      const news = [
        makeNews(),
        makeNews({ id: 'N002', title: '政策利好', content: '央行降准降息' }),
      ];
      const heatmaps = analyzeNewsHeat(news);
      for (let i = 1; i < heatmaps.length; i++) {
        expect(heatmaps[i - 1].heatScore).toBeGreaterThanOrEqual(heatmaps[i].heatScore);
      }
    });
  });

  describe('runNewsAnalysis', () => {
    it('should return complete analysis', () => {
      const news = [makeNews()];
      const result = runNewsAnalysis(news, { '000001.SZ': 10 });
      expect(result.classifications.length).toBe(1);
      expect(result.impacts.length).toBe(1);
      expect(result.heatmaps.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
    });

    it('should summarize buy and sell opportunities', () => {
      const news = [makeNews()];
      const result = runNewsAnalysis(news, { '000001.SZ': 10 });
      expect(result.summary.totalNews).toBe(1);
    });
  });
});
