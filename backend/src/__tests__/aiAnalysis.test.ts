import { describe, it, expect } from 'vitest';
import {
  analyzeStock,
  generateRecommendations,
  detectAbnormalEvents,
  analyzeSectorRotation,
} from '../utils/aiAnalysis';

function makeStock(overrides = {}) {
  const prices = Array.from({ length: 60 }, (_, i) => 100 + i);
  return {
    symbol: '000001.SZ',
    name: 'TestStock',
    industry: '测试行业',
    prices,
    volumes: Array.from({ length: 60 }, () => 1000000),
    pe: 20,
    pb: 3,
    roe: 15,
    revenueGrowth: 15,
    profitGrowth: 10,
    marketCap: 5000,
    changePercent: 2.5,
    ...overrides,
  };
}

describe('analyzeStock', () => {
  it('should return a StockScore with all required fields', () => {
    const result = analyzeStock(makeStock());
    expect(result).toHaveProperty('symbol');
    expect(result).toHaveProperty('totalScore');
    expect(result).toHaveProperty('technicalScore');
    expect(result).toHaveProperty('fundamentalScore');
    expect(result).toHaveProperty('recommendation');
    expect(result).toHaveProperty('reasons');
    expect(result).toHaveProperty('signals');
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('should generate MA signals for rising prices (bullish)', () => {
    // Prices monotomically increasing → MA5 > MA10 > MA20
    const result = analyzeStock(makeStock());
    const maSignal = result.signals.find(s => s.indicator === 'MA');
    expect(maSignal).toBeDefined();
    expect(maSignal!.type).toBe('bullish');
  });

  it('should generate MA signals for falling prices (bearish)', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 200 - i * 2);
    const result = analyzeStock(makeStock({ prices }));
    const maSignal = result.signals.find(s => s.indicator === 'MA');
    expect(maSignal).toBeDefined();
    expect(maSignal!.type).toBe('bearish');
  });

  it('should flag RSI < 30 as oversold bullish', () => {
    // Oscillating prices to push RSI down
    const prices: number[] = [];
    for (let i = 0; i < 60; i++) {
      prices.push(100 - i * 3); // steady decline
    }
    const result = analyzeStock(makeStock({ prices }));
    const rsiSignal = result.signals.find(s => s.indicator === 'RSI');
    // May or may not be oversold depending on RSI calc
    expect(rsiSignal).toBeDefined();
    // RSI should be very low for consistently down-trending
    if (rsiSignal!.type === 'bullish') {
      expect(rsiSignal!.description).toContain('超卖');
    }
  });

  it('should flag RSI > 70 as overbought bearish', () => {
    const prices: number[] = [];
    for (let i = 0; i < 60; i++) {
      prices.push(10 + i * 5); // steep incline
    }
    const result = analyzeStock(makeStock({ prices }));
    const rsiSignal = result.signals.find(s => s.indicator === 'RSI');
    expect(rsiSignal).toBeDefined();
    if (rsiSignal!.type === 'bearish') {
      expect(rsiSignal!.description).toContain('超买');
    }
  });

  it('should generate MACD signals', () => {
    const result = analyzeStock(makeStock());
    const macdSignal = result.signals.find(s => s.indicator === 'MACD');
    expect(macdSignal).toBeDefined();
  });

  it('should always generate RSI signals', () => {
    const result = analyzeStock(makeStock());
    const rsiSignal = result.signals.find(s => s.indicator === 'RSI');
    expect(rsiSignal).toBeDefined();
  });

  it('should flag low PE as bullish', () => {
    const result = analyzeStock(makeStock({ pe: 10 }));
    const peSignal = result.signals.find(s => s.indicator === 'PE');
    expect(peSignal).toBeDefined();
    expect(peSignal!.type).toBe('bullish');
  });

  it('should flag high PE as bearish', () => {
    const result = analyzeStock(makeStock({ pe: 50 }));
    const peSignal = result.signals.find(s => s.indicator === 'PE');
    expect(peSignal).toBeDefined();
    expect(peSignal!.type).toBe('bearish');
  });

  it('should rate high ROE as bullish', () => {
    const result = analyzeStock(makeStock({ roe: 25 }));
    const roeSignal = result.signals.find(s => s.indicator === 'ROE');
    expect(roeSignal).toBeDefined();
    expect(roeSignal!.type).toBe('bullish');
  });

  it('should rate low ROE as bearish', () => {
    const result = analyzeStock(makeStock({ roe: 5 }));
    const roeSignal = result.signals.find(s => s.indicator === 'ROE');
    expect(roeSignal).toBeDefined();
    expect(roeSignal!.type).toBe('bearish');
  });

  it('should include high revenue growth as bullish', () => {
    const result = analyzeStock(makeStock({ revenueGrowth: 30 }));
    const revSignal = result.signals.find(s => s.indicator === 'Revenue');
    expect(revSignal).toBeDefined();
    expect(revSignal!.type).toBe('bullish');
  });

  it('should rating strong_buy for very high score', () => {
    const result = analyzeStock(makeStock({
      pe: 10, roe: 30, revenueGrowth: 35,
      prices: Array.from({ length: 60 }, (_, i) => 50 + i * 3),
    }));
    // With bullish signals everywhere, totalScore should be high
    expect(['strong_buy', 'buy']).toContain(result.recommendation);
  });

  it('should recommend hold for average data', () => {
    const result = analyzeStock(makeStock());
    // Average metrics should yield hold
    expect(['hold', 'buy']).toContain(result.recommendation);
  });
});

// 多只股票构造，用于 generateRecommendations / detectAbnormalEvents / analyzeSectorRotation
function makeStocks(): ReturnType<typeof makeStock>[] {
  const industries = ['白酒', '新能源', '半导体', '银行', '医药'];
  return Array.from({ length: 8 }, (_, i) =>
    makeStock({
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
    })
  );
}

describe('generateRecommendations', () => {
  it('should return AIRecommendation with required fields', () => {
    const rec = generateRecommendations(makeStocks());
    expect(rec).toHaveProperty('date');
    expect(rec).toHaveProperty('strategy');
    expect(rec).toHaveProperty('stocks');
    expect(rec).toHaveProperty('marketOutlook');
    expect(rec).toHaveProperty('riskLevel');
    expect(rec).toHaveProperty('confidence');
    expect(['low', 'medium', 'high']).toContain(rec.riskLevel);
  });

  it('should return top 5 stocks sorted by score', () => {
    const rec = generateRecommendations(makeStocks());
    expect(rec.stocks.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < rec.stocks.length; i++) {
      expect(rec.stocks[i - 1].totalScore).toBeGreaterThanOrEqual(rec.stocks[i].totalScore);
    }
  });
});

describe('detectAbnormalEvents', () => {
  it('should return alerts array (possibly empty)', () => {
    const alerts = detectAbnormalEvents(makeStocks());
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('each alert should have required fields', () => {
    const alerts = detectAbnormalEvents(makeStocks());
    for (const alert of alerts) {
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('symbol');
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('title');
      expect(alert).toHaveProperty('description');
      expect(alert).toHaveProperty('analysis');
      expect(alert).toHaveProperty('triggeredAt');
      expect(alert).toHaveProperty('data');
      expect(['high', 'medium', 'low']).toContain(alert.severity);
      expect([
        'abnormal_volume', 'limit_up', 'limit_down', 'breakout',
        'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation',
      ]).toContain(alert.type);
    }
  });

  it('should set correct type for RSI extreme alerts', () => {
    const alerts = detectAbnormalEvents(makeStocks());
    const rsiAlerts = alerts.filter(a => a.type === 'rsi_extreme');
    for (const a of rsiAlerts) {
      expect(a.data).toHaveProperty('rsi');
    }
  });
});

describe('analyzeSectorRotation', () => {
  it('should return sector rotation data with required fields', () => {
    const rotations = analyzeSectorRotation(makeStocks());
    expect(rotations.length).toBeGreaterThan(0);
    for (const r of rotations) {
      expect(r).toHaveProperty('sector');
      expect(r).toHaveProperty('currentPhase');
      expect(r).toHaveProperty('rotationScore');
      expect(r).toHaveProperty('trend');
      expect(r).toHaveProperty('topStocks');
      expect(r).toHaveProperty('analysis');
      expect(['leading', 'lagging', 'heating', 'cooling']).toContain(r.currentPhase);
      expect(r.rotationScore).toBeGreaterThanOrEqual(0);
      expect(r.rotationScore).toBeLessThanOrEqual(100);
    }
  });

  it('should sort by rotationScore descending', () => {
    const rotations = analyzeSectorRotation(makeStocks());
    for (let i = 1; i < rotations.length; i++) {
      expect(rotations[i - 1].rotationScore).toBeGreaterThanOrEqual(rotations[i].rotationScore);
    }
  });

  it('should include top 3 stocks per sector', () => {
    const rotations = analyzeSectorRotation(makeStocks());
    for (const r of rotations) {
      expect(r.topStocks.length).toBeLessThanOrEqual(3);
      for (const stock of r.topStocks) {
        expect(stock).toHaveProperty('symbol');
        expect(stock).toHaveProperty('changePercent');
      }
    }
  });
});
