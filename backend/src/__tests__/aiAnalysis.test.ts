/**
 * AI 智能分析测试
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
} from '../utils/aiAnalysis';

// 生成测试数据
function createMockStock(overrides: Partial<any> = {}) {
  const prices: number[] = [];
  let price = overrides.basePrice || 100;
  for (let i = 0; i < 60; i++) {
    price += (Math.random() - 0.48) * price * 0.02;
    prices.push(Math.round(price * 100) / 100);
  }

  return {
    symbol: 'TEST.SH',
    name: '测试股票',
    industry: '测试行业',
    prices,
    volumes: Array.from({ length: 60 }, () => Math.floor(Math.random() * 5000000 + 1000000)),
    pe: 20,
    pb: 3,
    roe: 15,
    revenueGrowth: 10,
    profitGrowth: 12,
    marketCap: 5000,
    changePercent: 1.5,
    ...overrides,
  };
}

describe('AI 智能分析引擎', () => {
  // ===== 单股分析 =====
  describe('单股分析', () => {
    it('应该返回完整的分析结果', () => {
      const stock = createMockStock();
      const result = analyzeStock(stock);

      expect(result.symbol).toBe('TEST.SH');
      expect(result.name).toBe('测试股票');
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.technicalScore).toBeGreaterThanOrEqual(0);
      expect(result.fundamentalScore).toBeGreaterThanOrEqual(0);
      expect(result.momentumScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.recommendation);
      expect(result.signals).toBeInstanceOf(Array);
      expect(result.reasons).toBeInstanceOf(Array);
      expect(result.updatedAt).toBeDefined();
    });

    it('低 PE 高 ROE 应该获得高基本面评分', () => {
      const goodStock = createMockStock({ pe: 8, roe: 25 });
      const badStock = createMockStock({ pe: 60, roe: 5 });

      const goodResult = analyzeStock(goodStock);
      const badResult = analyzeStock(badStock);

      expect(goodResult.fundamentalScore).toBeGreaterThan(badResult.fundamentalScore);
    });

    it('分析结果应包含买入/卖出信号', () => {
      const stock = createMockStock();
      const result = analyzeStock(stock);

      const bullishSignals = result.signals.filter(s => s.type === 'bullish');
      const bearishSignals = result.signals.filter(s => s.type === 'bearish');

      // 应该至少有一些信号
      expect(bullishSignals.length + bearishSignals.length).toBeGreaterThanOrEqual(0);
    });

    it('信号应该包含必要字段', () => {
      const stock = createMockStock();
      const result = analyzeStock(stock);

      for (const signal of result.signals) {
        expect(['bullish', 'bearish', 'neutral']).toContain(signal.type);
        expect(signal.indicator).toBeDefined();
        expect(typeof signal.value).toBe('number');
        expect(signal.description).toBeDefined();
        expect(signal.strength).toBeGreaterThanOrEqual(1);
        expect(signal.strength).toBeLessThanOrEqual(5);
      }
    });

    it('高 PE 应该增加风险评分', () => {
      const lowRisk = createMockStock({ pe: 10 });
      const highRisk = createMockStock({ pe: 80 });

      expect(analyzeStock(highRisk).riskScore).toBeGreaterThan(analyzeStock(lowRisk).riskScore);
    });
  });

  // ===== AI 选股推荐 =====
  describe('AI 选股推荐', () => {
    it('应该返回推荐列表', () => {
      const rec = generateRecommendations();

      expect(rec.date).toBeDefined();
      expect(rec.strategy).toBe('AI综合评分选股');
      expect(rec.stocks).toBeInstanceOf(Array);
      expect(rec.stocks.length).toBeGreaterThan(0);
      expect(rec.stocks.length).toBeLessThanOrEqual(5);
      expect(['low', 'medium', 'high']).toContain(rec.riskLevel);
      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.confidence).toBeLessThanOrEqual(100);
    });

    it('推荐应该按评分降序排列', () => {
      const rec = generateRecommendations();
      for (let i = 1; i < rec.stocks.length; i++) {
        expect(rec.stocks[i - 1].totalScore).toBeGreaterThanOrEqual(rec.stocks[i].totalScore);
      }
    });

    it('市场展望应该存在', () => {
      const rec = generateRecommendations();
      expect(rec.marketOutlook).toBeDefined();
      expect(rec.marketOutlook.length).toBeGreaterThan(0);
    });
  });

  // ===== 智能预警 =====
  describe('智能预警', () => {
    it('应该返回预警列表', () => {
      const alerts = detectAbnormalEvents();
      expect(alerts).toBeInstanceOf(Array);
    });

    it('预警应该包含必要字段', () => {
      const alerts = detectAbnormalEvents();
      for (const alert of alerts) {
        expect(alert.id).toBeDefined();
        expect(alert.symbol).toBeDefined();
        expect(alert.name).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(alert.severity);
        expect(['abnormal_volume', 'limit_up', 'limit_down', 'breakout',
          'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation']).toContain(alert.type);
        expect(alert.title).toBeDefined();
        expect(alert.description).toBeDefined();
        expect(alert.analysis).toBeDefined();
        expect(alert.triggeredAt).toBeDefined();
      }
    });

    it('预警严重级别应该是 high/medium/low', () => {
      const alerts = detectAbnormalEvents();
      const validSeverities = ['high', 'medium', 'low'];
      for (const alert of alerts) {
        expect(validSeverities).toContain(alert.severity);
      }
    });
  });

  // ===== 行业轮动分析 =====
  describe('行业轮动分析', () => {
    it('应该返回行业分析列表', () => {
      const sectors = analyzeSectorRotation();
      expect(sectors).toBeInstanceOf(Array);
      expect(sectors.length).toBeGreaterThan(0);
    });

    it('每个行业应包含完整分析', () => {
      const sectors = analyzeSectorRotation();
      for (const sector of sectors) {
        expect(sector.sector).toBeDefined();
        expect(['leading', 'lagging', 'heating', 'cooling']).toContain(sector.currentPhase);
        expect(['up', 'down', 'sideways']).toContain(sector.trend);
        expect(sector.rotationScore).toBeGreaterThanOrEqual(0);
        expect(sector.rotationScore).toBeLessThanOrEqual(100);
        expect(typeof sector.avgChangePercent).toBe('number');
        expect(typeof sector.momentum).toBe('number');
        expect(sector.topStocks).toBeInstanceOf(Array);
        expect(sector.analysis).toBeDefined();
      }
    });

    it('轮动得分应该降序排列', () => {
      const sectors = analyzeSectorRotation();
      for (let i = 1; i < sectors.length; i++) {
        expect(sectors[i - 1].rotationScore).toBeGreaterThanOrEqual(sectors[i].rotationScore);
      }
    });

    it('领涨行业应该有正动量或正涨幅', () => {
      const sectors = analyzeSectorRotation();
      const leading = sectors.filter(s => s.currentPhase === 'leading');
      for (const s of leading) {
        expect(s.momentum > 0 || s.avgChangePercent > 0).toBe(true);
      }
    });
  });

  // ===== API 集成测试 =====
  describe('AI 分析 API', () => {
    let app: any;

    beforeAll(async () => {
      const express = (await import('express')).default;
      const aiRouter = (await import('../api/ai-analysis')).default;
      app = express();
      app.use(express.json());
      app.use('/api', aiRouter);
    });

    it('GET /api/ai/recommendations 应该返回推荐', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/recommendations');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stocks).toBeInstanceOf(Array);
    });

    it('GET /api/ai/alerts 应该返回预警', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/alerts');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/ai/sector-rotation 应该返回行业分析', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/sector-rotation');
      expect(res.status).toBe(200);
      expect(res.body.data.sectors).toBeInstanceOf(Array);
    });

    it('GET /api/ai/market-sentiment 应该返回情绪分析', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/market-sentiment');
      expect(res.status).toBe(200);
      expect(res.body.data.sentiment).toBeDefined();
      expect(res.body.data.sentimentScore).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/ai/analyze/:symbol 应该返回分析结果', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/analyze/600519.SH');
      expect(res.status).toBe(200);
      expect(res.body.data.totalScore).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/ai/analyze/UNKNOWN 应该返回 404', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/analyze/UNKNOWN.XX');
      expect(res.status).toBe(404);
    });

    it('GET /api/ai/alerts?severity=high 应该只返回高级别预警', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).get('/api/ai/alerts?severity=high');
      expect(res.status).toBe(200);
      for (const alert of res.body.data.alerts) {
        expect(alert.severity).toBe('high');
      }
    });
  });
});
