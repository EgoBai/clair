import { describe, it, expect } from 'vitest';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
  StockScore,
  AIRecommendation,
  StockData,
} from '../utils/aiAnalysis';

// 构造一批真实风格的测试股票数据（无 Math.random），供批量分析函数使用
function makeTestStocks(): StockData[] {
  const industries = ['白酒', '新能源', '半导体', '银行', '医药', '汽车', '电子', '保险'];
  return Array.from({ length: 8 }, (_, i) => ({
    symbol: `${600000 + i * 7}.SH`,
    name: `测试股${i}`,
    industry: industries[i % industries.length],
    prices: Array.from({ length: 60 }, (_, j) => 100 + i * 5 + j),
    volumes: Array.from({ length: 60 }, () => 1000000 + i * 10000),
    pe: 12 + i * 3,
    pb: 2 + i * 0.5,
    roe: 12 + i * 2,
    revenueGrowth: 10 + i * 3,
    profitGrowth: 8 + i * 2,
    marketCap: 5000 + i * 1000,
    changePercent: (i - 4) * 1.5,
  }));
}

describe('aiAnalysis - generateRecommendations', () => {
  it('should return AIRecommendation with required fields', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('strategy');
    expect(result).toHaveProperty('stocks');
    expect(result).toHaveProperty('marketOutlook');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('confidence');
  });

  it('should return up to 5 top stocks sorted by score descending', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(result.stocks.length).toBeLessThanOrEqual(5);
    expect(result.stocks.length).toBeGreaterThan(0);
    for (let i = 1; i < result.stocks.length; i++) {
      expect(result.stocks[i - 1].totalScore).toBeGreaterThanOrEqual(result.stocks[i].totalScore);
    }
  });

  it('should have valid riskLevel', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(['low', 'medium', 'high']).toContain(result.riskLevel);
  });

  it('should have confidence between 40 and 85', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.confidence).toBeLessThanOrEqual(85);
  });

  it('should have date in YYYY-MM-DD format', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should include strategy text', () => {
    const result = generateRecommendations(makeTestStocks());
    expect(result.strategy.length).toBeGreaterThan(0);
  });

  it('should have stocks with valid stock score structure', () => {
    const result = generateRecommendations(makeTestStocks());
    for (const stock of result.stocks) {
      expect(stock).toHaveProperty('symbol');
      expect(stock).toHaveProperty('name');
      expect(stock).toHaveProperty('totalScore');
      expect(stock).toHaveProperty('recommendation');
      expect(stock).toHaveProperty('reasons');
      expect(stock).toHaveProperty('signals');
      expect(stock.totalScore).toBeGreaterThanOrEqual(0);
      expect(stock.totalScore).toBeLessThanOrEqual(100);
    }
  });

  it('should always provide at least one reason per stock', () => {
    const result = generateRecommendations(makeTestStocks());
    for (const stock of result.stocks) {
      expect(stock.reasons.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('aiAnalysis - detectAbnormalEvents', () => {
  it('should return an array of SmartAlerts', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('each alert should have required fields', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('symbol');
      expect(alert).toHaveProperty('name');
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('title');
      expect(alert).toHaveProperty('description');
      expect(alert).toHaveProperty('analysis');
      expect(alert).toHaveProperty('triggeredAt');
      expect(alert).toHaveProperty('data');
    }
  });

  it('should have valid alert types', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    const validTypes = ['abnormal_volume', 'limit_up', 'limit_down', 'breakout', 'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation'];
    for (const alert of alerts) {
      expect(validTypes).toContain(alert.type);
    }
  });

  it('should have valid severity levels', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(['high', 'medium', 'low']).toContain(alert.severity);
    }
  });

  it('should include data payload with relevant info', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(Object.keys(alert.data).length).toBeGreaterThan(0);
    }
  });

  it('should have unique alert ids', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    const ids = alerts.map(a => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have ISO date strings for triggeredAt', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(() => new Date(alert.triggeredAt)).not.toThrow();
      expect(new Date(alert.triggeredAt).toISOString()).toBeTruthy();
    }
  });

  it('should have non-empty analysis per alert', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(alert.analysis.length).toBeGreaterThan(10);
    }
  });

  it('should include asset symbol in description', () => {
    const alerts = detectAbnormalEvents(makeTestStocks());
    for (const alert of alerts) {
      expect(alert.description).toContain(alert.symbol);
    }
  });
});

describe('aiAnalysis - analyzeSectorRotation', () => {
  it('should return an array of sector rotations', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    expect(Array.isArray(rotations)).toBe(true);
    expect(rotations.length).toBeGreaterThan(0);
  });

  it('each sector rotation should have required fields', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(r).toHaveProperty('sector');
      expect(r).toHaveProperty('currentPhase');
      expect(r).toHaveProperty('rotationScore');
      expect(r).toHaveProperty('trend');
      expect(r).toHaveProperty('avgChangePercent');
      expect(r).toHaveProperty('momentum');
      expect(r).toHaveProperty('capitalInflow');
      expect(r).toHaveProperty('topStocks');
      expect(r).toHaveProperty('analysis');
    }
  });

  it('should sort by rotationScore descending', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (let i = 1; i < rotations.length; i++) {
      expect(rotations[i - 1].rotationScore).toBeGreaterThanOrEqual(rotations[i].rotationScore);
    }
  });

  it('should have valid phases', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    const validPhases = ['leading', 'lagging', 'heating', 'cooling'];
    for (const r of rotations) {
      expect(validPhases).toContain(r.currentPhase);
    }
  });

  it('should have valid trends', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(['up', 'down', 'sideways']).toContain(r.trend);
    }
  });

  it('should have rotationScore in 0-100 range', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(r.rotationScore).toBeGreaterThanOrEqual(0);
      expect(r.rotationScore).toBeLessThanOrEqual(100);
    }
  });

  it('should have topStocks with up to 3 stocks each', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(r.topStocks.length).toBeLessThanOrEqual(3);
      for (const stock of r.topStocks) {
        expect(stock).toHaveProperty('symbol');
        expect(stock).toHaveProperty('name');
        expect(stock).toHaveProperty('changePercent');
      }
    }
  });

  it('should have meaningful analysis text', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(r.analysis.length).toBeGreaterThan(10);
      expect(r.analysis).toContain(r.sector);
    }
  });

  it('should have numeric avgChangePercent and momentum', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(typeof r.avgChangePercent).toBe('number');
      expect(typeof r.momentum).toBe('number');
      expect(typeof r.capitalInflow).toBe('number');
    }
  });

  it('capitalInflow 应诚实为 0（无真实资金流源，不 Math.random 伪造）', () => {
    const rotations = analyzeSectorRotation(makeTestStocks());
    for (const r of rotations) {
      expect(r.capitalInflow).toBe(0);
    }
  });
});

describe('aiAnalysis - analyzeStock', () => {
  it('should return StockScore with valid structure', () => {
    const result = analyzeStock({
      symbol: '000001',
      name: '平安银行',
      prices: [10, 10.5, 11, 10.8, 11.2, 11.5, 11.3, 11.8],
      volumes: [10000, 12000, 15000, 11000, 13000, 14000, 12500, 16000],
      pe: 15,
      pb: 1.5,
      roe: 12,
      revenueGrowth: 15,
      profitGrowth: 10,
      marketCap: 250000000000,
      industry: '银行',
      changePercent: 3.5,
    });
    expect(result).toHaveProperty('symbol', '000001');
    expect(result).toHaveProperty('totalScore');
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('should handle symbols prefixed with 3 for GEM stocks', () => {
    const result = analyzeStock({
      symbol: '300750',
      name: '宁德时代',
      prices: [100, 105, 110, 108, 115, 120],
      volumes: [50000, 55000, 60000, 52000, 65000, 70000],
      pe: 50,
      pb: 8,
      roe: 18,
      revenueGrowth: 30,
      profitGrowth: 10,
      marketCap: 250000000000,
      industry: '新能源',
      changePercent: 5.2,
    });
    expect(result.symbol).toBe('300750');
  });

  it('should handle symbols prefixed with 68 for STAR market stocks', () => {
    const result = analyzeStock({
      symbol: '688981',
      name: '中芯国际',
      prices: [50, 52, 54, 53, 55, 56],
      volumes: [20000, 22000, 25000, 21000, 26000, 28000],
      pe: 80,
      pb: 5,
      roe: 8,
      revenueGrowth: 20,
      profitGrowth: 10,
      marketCap: 250000000000,
      industry: '半导体',
      changePercent: 4.5,
    });
    expect(result.symbol).toBe('688981');
  });

  it('should generate signals from price analysis', () => {
    const result = analyzeStock({
      symbol: '600519',
      name: '贵州茅台',
      prices: [100, 102, 104, 106, 108, 110, 112, 114, 116, 118],
      volumes: [1000, 1200, 1100, 1300, 1400, 1200, 1500, 1300, 1400, 1500],
      pe: 30,
      pb: 10,
      roe: 25,
      revenueGrowth: 10,
      profitGrowth: 10,
      marketCap: 250000000000,
      industry: '白酒',
      changePercent: 2.0,
    });
    expect(result.signals.length).toBeGreaterThan(0);
    // Should have MA, RSI, and MACD signals
    const signalTypes = new Set(result.signals.map(s => s.indicator));
    expect(signalTypes.size).toBeGreaterThanOrEqual(3);
  });

  it('should include recommendation field', () => {
    const result = analyzeStock({
      symbol: '000002',
      name: '万科A',
      prices: [15, 14.5, 14, 13.5, 13],
      volumes: [8000, 9000, 8500, 9500, 10000],
      pe: 8,
      pb: 0.8,
      roe: 10,
      revenueGrowth: -5,
      profitGrowth: 10,
      marketCap: 250000000000,
      industry: '房地产',
      changePercent: -2.0,
    });
    expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(result.recommendation);
  });
});
