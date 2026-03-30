import { describe, it, expect } from 'vitest';
import {
  calculateBreadthScore,
  calculateCapitalFlowScore,
  calculateNorthboundScore,
  calculateSectorMomentumScore,
  calculateSentimentScore,
  calculateValuationScore,
  calculateCompositeScore,
  generateMarketSignal,
  generateSectorRecommendations,
  calculateRiskLevel,
  determineMarketTrend,
  generateDiversificationAdvice,
  analyzeMarket,
  detectSectorRotation,
  calculateMarketConcentration,
  calculateMomentumAcceleration,
  detectMarketAnomalies,
  type BreadthData,
  type CapitalFlowData,
  type NorthboundData,
  type SectorMomentumData,
  type SentimentData,
  type ValuationData,
} from '../utils/marketAnalytics';

// ==================== 测试数据 ====================

const mockBreadth: BreadthData = {
  advanceCount: 2500,
  declineCount: 1500,
  unchangedCount: 500,
  newHighs: 200,
  newLows: 50,
  advanceDeclineRatio: 1.67,
  aboveMA50Percent: 65,
  aboveMA200Percent: 55,
};

const mockCapitalFlow: CapitalFlowData = {
  mainNetInflow: 5e10,
  retailNetInflow: -2e10,
  largeOrderNetInflow: 3e10,
  sectorFlows: { '科技': 5e9, '金融': 3e9, '消费': -2e9, '医药': 1e9 },
  trend: 'inflow',
};

const mockNorthbound: NorthboundData = {
  totalNetBuy: 1e11,
  dailyNetBuy: 5e9,
  topHolds: [
    { code: '600519', name: '贵州茅台', change: 2.5 },
    { code: '000858', name: '五粮液', change: 1.8 },
    { code: '000333', name: '美的集团', change: -0.5 },
  ],
  sectorExposure: { '白酒': 5e10, '家电': 3e10, '银行': 2e10 },
  trend: 'accumulating',
};

const mockSectors: SectorMomentumData[] = [
  { sector: '科技', momentum: 45, priceChange5d: 5.2, priceChange20d: 12.5, volumeRatio: 1.5, relativeStrength: 8 },
  { sector: '金融', momentum: 20, priceChange5d: 2.1, priceChange20d: 6.3, volumeRatio: 1.2, relativeStrength: 3 },
  { sector: '消费', momentum: -15, priceChange5d: -1.5, priceChange20d: -3.2, volumeRatio: 0.8, relativeStrength: -4 },
  { sector: '医药', momentum: 10, priceChange5d: 1.2, priceChange20d: 4.1, volumeRatio: 1.0, relativeStrength: 1 },
  { sector: '能源', momentum: -30, priceChange5d: -3.5, priceChange20d: -8.7, volumeRatio: 0.6, relativeStrength: -7 },
];

const mockSentiment: SentimentData = {
  limitUpCount: 80,
  limitDownCount: 20,
  consecutiveLimitUp: 3,
  marketSentimentIndex: 65,
  fearGreedIndex: 55,
  putCallRatio: 0.9,
};

const mockValuations: ValuationData[] = [
  { sector: '科技', peRatio: 35, pbRatio: 4.5, pePercentile: 60, pbPercentile: 55, dividendYield: 0.8 },
  { sector: '金融', peRatio: 8, pbRatio: 0.9, pePercentile: 25, pbPercentile: 20, dividendYield: 4.5 },
  { sector: '消费', peRatio: 28, pbRatio: 5.2, pePercentile: 45, pbPercentile: 50, dividendYield: 1.5 },
];

// ==================== 市场广度测试 ====================

describe('calculateBreadthScore', () => {
  it('应计算健康的市场广度评分', () => {
    const score = calculateBreadthScore(mockBreadth);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('空数据应返回中性分数', () => {
    const empty: BreadthData = {
      advanceCount: 0, declineCount: 0, unchangedCount: 0,
      newHighs: 0, newLows: 0, advanceDeclineRatio: 1,
      aboveMA50Percent: 0, aboveMA200Percent: 0,
    };
    expect(calculateBreadthScore(empty)).toBe(50);
  });

  it('全线上涨应返回高分', () => {
    const bullish: BreadthData = {
      advanceCount: 4000, declineCount: 0, unchangedCount: 500,
      newHighs: 500, newLows: 0, advanceDeclineRatio: 10,
      aboveMA50Percent: 90, aboveMA200Percent: 85,
    };
    const score = calculateBreadthScore(bullish);
    expect(score).toBeGreaterThan(70);
  });

  it('全线下跌应返回低分', () => {
    const bearish: BreadthData = {
      advanceCount: 0, declineCount: 4000, unchangedCount: 500,
      newHighs: 0, newLows: 500, advanceDeclineRatio: 0,
      aboveMA50Percent: 10, aboveMA200Percent: 5,
    };
    const score = calculateBreadthScore(bearish);
    expect(score).toBeLessThan(40);
  });

  it('应限制分数在0-100范围内', () => {
    const extreme: BreadthData = {
      advanceCount: 10000, declineCount: 0, unchangedCount: 0,
      newHighs: 5000, newLows: 0, advanceDeclineRatio: 100,
      aboveMA50Percent: 100, aboveMA200Percent: 100,
    };
    const score = calculateBreadthScore(extreme);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 资金流向测试 ====================

describe('calculateCapitalFlowScore', () => {
  it('应计算资金流入评分', () => {
    const score = calculateCapitalFlowScore(mockCapitalFlow);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('资金净流出应降低评分', () => {
    const outflow: CapitalFlowData = {
      ...mockCapitalFlow,
      mainNetInflow: -5e10,
      largeOrderNetInflow: -3e10,
      trend: 'outflow',
    };
    const score = calculateCapitalFlowScore(outflow);
    expect(score).toBeLessThan(calculateCapitalFlowScore(mockCapitalFlow));
  });

  it('板块全面流入应加分', () => {
    const allInflow: CapitalFlowData = {
      ...mockCapitalFlow,
      sectorFlows: { 'A': 1e9, 'B': 1e9, 'C': 1e9, 'D': 1e9 },
    };
    const score = calculateCapitalFlowScore(allInflow);
    expect(score).toBeGreaterThan(50);
  });

  it('空板块数据应正常处理', () => {
    const empty: CapitalFlowData = {
      mainNetInflow: 0, retailNetInflow: 0, largeOrderNetInflow: 0,
      sectorFlows: {}, trend: 'neutral',
    };
    const score = calculateCapitalFlowScore(empty);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ==================== 北向资金测试 ====================

describe('calculateNorthboundScore', () => {
  it('应计算北向资金评分', () => {
    const score = calculateNorthboundScore(mockNorthbound);
    expect(score).toBeGreaterThan(40);
  });

  it('净流出应降低评分', () => {
    const outflow: NorthboundData = {
      ...mockNorthbound,
      totalNetBuy: -1e11,
      dailyNetBuy: -5e9,
      trend: 'reducing',
    };
    const score = calculateNorthboundScore(outflow);
    expect(score).toBeLessThan(calculateNorthboundScore(mockNorthbound));
  });

  it('持仓全跌应影响评分', () => {
    const allDown: NorthboundData = {
      ...mockNorthbound,
      totalNetBuy: -1e11,
      dailyNetBuy: -5e9,
      topHolds: [
        { code: '1', name: 'A', change: -2 },
        { code: '2', name: 'B', change: -3 },
        { code: '3', name: 'C', change: -1 },
      ],
      trend: 'reducing',
    };
    const score = calculateNorthboundScore(allDown);
    expect(score).toBeLessThan(60);
  });

  it('空持仓应正常处理', () => {
    const empty: NorthboundData = {
      totalNetBuy: 0, dailyNetBuy: 0, topHolds: [],
      sectorExposure: {}, trend: 'stable',
    };
    const score = calculateNorthboundScore(empty);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 板块动量测试 ====================

describe('calculateSectorMomentumScore', () => {
  it('应计算板块动量评分', () => {
    const score = calculateSectorMomentumScore(mockSectors);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('空数据返回中性分', () => {
    expect(calculateSectorMomentumScore([])).toBe(50);
  });

  it('全强势板块应得高分', () => {
    const strong: SectorMomentumData[] = [
      { sector: 'A', momentum: 50, priceChange5d: 8, priceChange20d: 15, volumeRatio: 2, relativeStrength: 10 },
      { sector: 'B', momentum: 40, priceChange5d: 6, priceChange20d: 12, volumeRatio: 1.8, relativeStrength: 8 },
    ];
    const score = calculateSectorMomentumScore(strong);
    expect(score).toBeGreaterThan(60);
  });

  it('全弱势板块应得低分', () => {
    const weak: SectorMomentumData[] = [
      { sector: 'A', momentum: -50, priceChange5d: -8, priceChange20d: -20, volumeRatio: 0.3, relativeStrength: -10 },
      { sector: 'B', momentum: -40, priceChange5d: -6, priceChange20d: -15, volumeRatio: 0.4, relativeStrength: -8 },
    ];
    const score = calculateSectorMomentumScore(weak);
    expect(score).toBeLessThan(50);
  });
});

// ==================== 市场情绪测试 ====================

describe('calculateSentimentScore', () => {
  it('应计算市场情绪评分', () => {
    const score = calculateSentimentScore(mockSentiment);
    expect(score).toBeGreaterThan(40);
  });

  it('涨停远多于跌停应得高分', () => {
    const bullish: SentimentData = {
      limitUpCount: 200, limitDownCount: 10, consecutiveLimitUp: 5,
      marketSentimentIndex: 80, fearGreedIndex: 75, putCallRatio: 0.7,
    };
    const score = calculateSentimentScore(bullish);
    expect(score).toBeGreaterThan(60);
  });

  it('跌停远多于涨停应得低分', () => {
    const bearish: SentimentData = {
      limitUpCount: 5, limitDownCount: 200, consecutiveLimitUp: 0,
      marketSentimentIndex: 20, fearGreedIndex: 15, putCallRatio: 1.5,
    };
    const score = calculateSentimentScore(bearish);
    expect(score).toBeLessThan(40);
  });

  it('零涨跌停应正常处理', () => {
    const neutral: SentimentData = {
      limitUpCount: 0, limitDownCount: 0, consecutiveLimitUp: 0,
      marketSentimentIndex: 50, fearGreedIndex: 50, putCallRatio: 1.0,
    };
    const score = calculateSentimentScore(neutral);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ==================== 估值测试 ====================

describe('calculateValuationScore', () => {
  it('应计算估值评分', () => {
    const score = calculateValuationScore(mockValuations);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('空数据返回中性分', () => {
    expect(calculateValuationScore([])).toBe(50);
  });

  it('低估值应得高分', () => {
    const cheap: ValuationData[] = [
      { sector: 'A', peRatio: 5, pbRatio: 0.5, pePercentile: 10, pbPercentile: 10, dividendYield: 5 },
    ];
    const score = calculateValuationScore(cheap);
    expect(score).toBeGreaterThan(60);
  });

  it('高估值应得低分', () => {
    const expensive: ValuationData[] = [
      { sector: 'A', peRatio: 100, pbRatio: 15, pePercentile: 95, pbPercentile: 90, dividendYield: 0.2 },
    ];
    const score = calculateValuationScore(expensive);
    expect(score).toBeLessThan(40);
  });
});

// ==================== 综合评分测试 ====================

describe('calculateCompositeScore', () => {
  it('应计算综合市场评分', () => {
    const score = calculateCompositeScore(
      mockBreadth, mockCapitalFlow, mockNorthbound, mockSectors, mockSentiment, mockValuations,
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('自定义权重应影响评分', () => {
    const breadthOnly = {
      weights: { breadth: 1, capitalFlow: 0, northbound: 0, sectorMomentum: 0, sentiment: 0, valuation: 0 },
      thresholds: { bullish: 65, bearish: 35, volatility: 30 },
      lookbackDays: 20,
    };
    const score = calculateCompositeScore(
      mockBreadth, mockCapitalFlow, mockNorthbound, mockSectors, mockSentiment, mockValuations, breadthOnly,
    );
    expect(score).toBe(calculateBreadthScore(mockBreadth));
  });
});

// ==================== 市场信号测试 ====================

describe('generateMarketSignal', () => {
  it('高分应生成牛市信号', () => {
    const signal = generateMarketSignal(75);
    expect(signal.type).toBe('bullish');
    expect(signal.confidence).toBeGreaterThan(0.5);
  });

  it('低分应生成熊市信号', () => {
    const signal = generateMarketSignal(25);
    expect(signal.type).toBe('bearish');
  });

  it('中间分应生成中性信号', () => {
    const signal = generateMarketSignal(50);
    expect(signal.type).toBe('neutral');
  });

  it('信号应包含来源信息', () => {
    const signal = generateMarketSignal(75);
    expect(Array.isArray(signal.sources)).toBe(true);
  });

  it('信号应有时间戳', () => {
    const signal = generateMarketSignal(50);
    expect(signal.timestamp).toBeGreaterThan(0);
  });
});

// ==================== 板块推荐测试 ====================

describe('generateSectorRecommendations', () => {
  it('应生成排序的板块推荐', () => {
    const recs = generateSectorRecommendations(
      mockSectors, mockCapitalFlow.sectorFlows, mockNorthbound.sectorExposure, mockValuations,
    );
    expect(recs.length).toBe(mockSectors.length);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });

  it('高动量板块应获得buy评级', () => {
    const recs = generateSectorRecommendations(
      mockSectors, mockCapitalFlow.sectorFlows, mockNorthbound.sectorExposure, mockValuations,
    );
    const tech = recs.find(r => r.sector === '科技');
    if (tech) {
      expect(['strong_buy', 'buy', 'hold']).toContain(tech.recommendation);
    }
  });

  it('空数据应返回空数组', () => {
    const recs = generateSectorRecommendations([], {}, {}, []);
    expect(recs).toEqual([]);
  });

  it('推荐应包含原因', () => {
    const recs = generateSectorRecommendations(
      mockSectors, mockCapitalFlow.sectorFlows, mockNorthbound.sectorExposure, mockValuations,
    );
    recs.forEach(r => {
      expect(Array.isArray(r.reasons)).toBe(true);
    });
  });
});

// ==================== 风险等级测试 ====================

describe('calculateRiskLevel', () => {
  it('稳定市场应返回低风险', () => {
    const risk = calculateRiskLevel(mockBreadth, mockSentiment, 15);
    expect(risk).toBe('low');
  });

  it('高波动+恐慌应返回高风险', () => {
    const panicSentiment: SentimentData = {
      ...mockSentiment,
      fearGreedIndex: 10,
      putCallRatio: 1.6,
    };
    const bearishBreadth: BreadthData = {
      ...mockBreadth,
      advanceCount: 500,
      declineCount: 3500,
      newHighs: 10,
      newLows: 300,
    };
    const risk = calculateRiskLevel(bearishBreadth, panicSentiment, 40);
    expect(risk).toBe('high');
  });
});

// ==================== 市场趋势测试 ====================

describe('determineMarketTrend', () => {
  it('强势上涨应返回up', () => {
    const bullishBreadth: BreadthData = {
      ...mockBreadth,
      advanceCount: 3500,
      declineCount: 500,
      advanceDeclineRatio: 7,
    };
    const strongSectors: SectorMomentumData[] = mockSectors.map(s => ({ ...s, momentum: 25 }));
    const trend = determineMarketTrend(bullishBreadth, strongSectors);
    expect(trend).toBe('up');
  });

  it('弱势下跌应返回down', () => {
    const bearishBreadth: BreadthData = {
      ...mockBreadth,
      advanceCount: 500,
      declineCount: 3500,
      advanceDeclineRatio: 0.14,
    };
    const weakSectors: SectorMomentumData[] = mockSectors.map(s => ({ ...s, momentum: -30 }));
    const trend = determineMarketTrend(bearishBreadth, weakSectors);
    expect(trend).toBe('down');
  });

  it('分歧信号应返回sideways', () => {
    const mixed: BreadthData = {
      ...mockBreadth,
      advanceCount: 2200,
      declineCount: 2000,
      advanceDeclineRatio: 1.1,
    };
    const trend = determineMarketTrend(mixed, mockSectors);
    expect(trend).toBe('sideways');
  });
});

// ==================== 配置建议测试 ====================

describe('generateDiversificationAdvice', () => {
  it('应根据风险等级给出建议', () => {
    const highRisk = generateDiversificationAdvice([], 'high');
    expect(highRisk.some(a => a.includes('降低仓位'))).toBe(true);

    const lowRisk = generateDiversificationAdvice([], 'low');
    expect(lowRisk.some(a => a.includes('稳定'))).toBe(true);
  });

  it('有买入板块应推荐关注', () => {
    const sectors = [
      { sector: '科技', score: 80, momentum: 40, capitalInflow: 5e9, northboundChange: 1e7, recommendation: 'strong_buy' as const, reasons: [] },
      { sector: '金融', score: 65, momentum: 20, capitalInflow: 3e9, northboundChange: 5e6, recommendation: 'buy' as const, reasons: [] },
    ];
    const advice = generateDiversificationAdvice(sectors, 'low');
    expect(advice.length).toBeGreaterThan(0);
  });
});

// ==================== 完整分析测试 ====================

describe('analyzeMarket', () => {
  it('应返回完整的市场分析结果', () => {
    const result = analyzeMarket(
      mockBreadth, mockCapitalFlow, mockNorthbound, mockSectors, mockSentiment, mockValuations,
    );

    expect(result.compositeScore).toBeGreaterThan(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.signal.type);
    expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    expect(['up', 'down', 'sideways']).toContain(result.trend);
    expect(Array.isArray(result.topSectors)).toBe(true);
    expect(Array.isArray(result.diversificationAdvice)).toBe(true);
  });

  it('顶部板块应不超过10个', () => {
    const manySectors: SectorMomentumData[] = Array.from({ length: 20 }, (_, i) => ({
      sector: `板块${i}`, momentum: Math.random() * 100 - 50,
      priceChange5d: Math.random() * 10 - 5, priceChange20d: Math.random() * 20 - 10,
      volumeRatio: Math.random() * 2 + 0.5, relativeStrength: Math.random() * 20 - 10,
    }));
    const result = analyzeMarket(
      mockBreadth, mockCapitalFlow, mockNorthbound, manySectors, mockSentiment, mockValuations,
    );
    expect(result.topSectors.length).toBeLessThanOrEqual(10);
  });
});

// ==================== 板块轮动测试 ====================

describe('detectSectorRotation', () => {
  it('应检测板块动量变化', () => {
    const previous: SectorMomentumData[] = [
      { sector: '科技', momentum: 20, priceChange5d: 2, priceChange20d: 5, volumeRatio: 1, relativeStrength: 3 },
      { sector: '金融', momentum: 30, priceChange5d: 3, priceChange20d: 8, volumeRatio: 1.2, relativeStrength: 5 },
    ];
    const current: SectorMomentumData[] = [
      { sector: '科技', momentum: 55, priceChange5d: 6, priceChange20d: 12, volumeRatio: 1.8, relativeStrength: 10 },
      { sector: '金融', momentum: 5, priceChange5d: 1, priceChange20d: 3, volumeRatio: 0.8, relativeStrength: 1 },
    ];

    const rotation = detectSectorRotation(current, previous);
    expect(rotation.length).toBe(2);
    expect(rotation[0].sector).toBe('科技'); // 最大变化在前
    expect(rotation[0].signal).toBe('in');
    expect(rotation[1].signal).toBe('out');
  });

  it('无变化应返回stable', () => {
    const same: SectorMomentumData[] = [
      { sector: 'A', momentum: 20, priceChange5d: 2, priceChange20d: 5, volumeRatio: 1, relativeStrength: 3 },
    ];
    const rotation = detectSectorRotation(same, same);
    expect(rotation[0].signal).toBe('stable');
  });
});

// ==================== 市场集中度测试 ====================

describe('calculateMarketConcentration', () => {
  it('应计算HHI指数', () => {
    const result = calculateMarketConcentration(mockSectors, mockCapitalFlow.sectorFlows);
    expect(result.herfindahlIndex).toBeGreaterThan(0);
    expect(result.herfindahlIndex).toBeLessThanOrEqual(1);
  });

  it('单一板块应有高集中度', () => {
    const single: SectorMomentumData[] = [
      { sector: 'A', momentum: 10, priceChange5d: 1, priceChange20d: 3, volumeRatio: 1, relativeStrength: 0 },
    ];
    const result = calculateMarketConcentration(single, { 'A': 1e10 });
    expect(result.top3Concentration).toBe(1);
    expect(result.herfindahlIndex).toBe(1);
  });

  it('均匀分布应有低集中度', () => {
    const even: SectorMomentumData[] = Array.from({ length: 10 }, (_, i) => ({
      sector: `S${i}`, momentum: 0, priceChange5d: 0, priceChange20d: 0, volumeRatio: 1, relativeStrength: 0,
    }));
    const flows: Record<string, number> = {};
    even.forEach(s => flows[s.sector] = 1e9);
    const result = calculateMarketConcentration(even, flows);
    expect(result.herfindahlIndex).toBeCloseTo(0.1, 1);
  });

  it('零流量应使用默认值', () => {
    const result = calculateMarketConcentration(mockSectors, {});
    expect(result.top3Concentration).toBeGreaterThan(0);
    expect(result.top3Concentration).toBeLessThanOrEqual(1);
  });
});

// ==================== 动量加速度测试 ====================

describe('calculateMomentumAcceleration', () => {
  it('应计算动量加速度', () => {
    const result = calculateMomentumAcceleration(mockSectors);
    expect(result.length).toBe(mockSectors.length);
    result.forEach(r => {
      expect(['accelerating', 'decelerating', 'stable']).toContain(r.direction);
      expect(typeof r.acceleration).toBe('number');
    });
  });

  it('5日涨幅大于20日/4应标记加速', () => {
    const accelerating: SectorMomentumData[] = [
      { sector: 'A', momentum: 30, priceChange5d: 5, priceChange20d: 8, volumeRatio: 1.5, relativeStrength: 5 },
    ];
    const result = calculateMomentumAcceleration(accelerating);
    expect(result[0].direction).toBe('accelerating');
  });

  it('5日跌幅大于20日/4应标记减速', () => {
    const decelerating: SectorMomentumData[] = [
      { sector: 'A', momentum: -30, priceChange5d: -5, priceChange20d: -8, volumeRatio: 0.5, relativeStrength: -5 },
    ];
    const result = calculateMomentumAcceleration(decelerating);
    expect(result[0].direction).toBe('decelerating');
  });
});

// ==================== 异常检测测试 ====================

describe('detectMarketAnomalies', () => {
  it('正常市场应无严重异常', () => {
    const anomalies = detectMarketAnomalies(mockBreadth, mockSentiment, mockCapitalFlow);
    const critical = anomalies.filter(a => a.severity === 'critical');
    expect(critical.length).toBe(0);
  });

  it('极度下跌应触发广度异常', () => {
    const crash: BreadthData = {
      advanceCount: 200, declineCount: 4000, unchangedCount: 100,
      newHighs: 5, newLows: 800, advanceDeclineRatio: 0.05,
      aboveMA50Percent: 5, aboveMA200Percent: 2,
    };
    const anomalies = detectMarketAnomalies(crash, mockSentiment, mockCapitalFlow);
    expect(anomalies.some(a => a.type === 'breadth_extreme')).toBe(true);
  });

  it('极度恐慌应触发异常', () => {
    const panic: SentimentData = { ...mockSentiment, fearGreedIndex: 10, putCallRatio: 1.6 };
    const anomalies = detectMarketAnomalies(mockBreadth, panic, mockCapitalFlow);
    expect(anomalies.some(a => a.type === 'extreme_fear')).toBe(true);
  });

  it('巨额资金流动应触发信息通知', () => {
    const massive: CapitalFlowData = {
      ...mockCapitalFlow,
      mainNetInflow: 1e11,
    };
    const anomalies = detectMarketAnomalies(mockBreadth, mockSentiment, massive);
    expect(anomalies.some(a => a.type === 'massive_flow')).toBe(true);
  });

  it('创新低激增应触发critical', () => {
    const lowsBreadth: BreadthData = {
      advanceCount: 1000, declineCount: 2000, unchangedCount: 500,
      newHighs: 20, newLows: 200, advanceDeclineRatio: 0.5,
      aboveMA50Percent: 30, aboveMA200Percent: 20,
    };
    const anomalies = detectMarketAnomalies(lowsBreadth, mockSentiment, mockCapitalFlow);
    expect(anomalies.some(a => a.type === 'new_lows_surge')).toBe(true);
  });

  it('返回异常应有正确的结构', () => {
    const anomalies = detectMarketAnomalies(mockBreadth, mockSentiment, mockCapitalFlow);
    anomalies.forEach(a => {
      expect(typeof a.type).toBe('string');
      expect(['info', 'warning', 'critical']).toContain(a.severity);
      expect(typeof a.message).toBe('string');
    });
  });
});
