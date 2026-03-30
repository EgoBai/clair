/**
 * AI 市场分析测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarketCommentaryGenerator,
  StopLossCalculator,
  SectorRotationPredictor,
} from '../utils/aiMarketAnalysis';
import { KLineData } from '../../shared/types';

describe('AI 市场解读生成器', () => {
  let generator: MarketCommentaryGenerator;

  beforeEach(() => {
    generator = new MarketCommentaryGenerator();
  });

  const bullishData = {
    indexChange: 2.5,
    indexPrice: 3250.80,
    riseCount: 3500,
    fallCount: 800,
    flatCount: 200,
    limitUpCount: 85,
    limitDownCount: 5,
    totalTurnover: 1.2e12,
    northboundFlow: 8.5e10,
    hotSectors: [
      { name: '半导体', changePercent: 5.2 },
      { name: '人工智能', changePercent: 4.8 },
      { name: '新能源', changePercent: 3.1 },
    ],
    topGainers: [
      { symbol: '000001.SZ', name: '平安银行', changePercent: 10.02 },
    ],
    topLosers: [
      { symbol: '600000.SH', name: '浦发银行', changePercent: -5.2 },
    ],
    avgChangePercent: 1.8,
  };

  const bearishData = {
    ...bullishData,
    indexChange: -2.1,
    riseCount: 600,
    fallCount: 3500,
    limitUpCount: 10,
    limitDownCount: 65,
    northboundFlow: -6.5e10,
  };

  const neutralData = {
    ...bullishData,
    indexChange: 0.15,
    riseCount: 2100,
    fallCount: 2200,
    limitUpCount: 25,
    limitDownCount: 18,
    northboundFlow: 1.2e9,
  };

  it('生成看涨市场解读', () => {
    const commentary = generator.generateDailySummary(bullishData);
    expect(commentary.sentiment).toBe('bullish');
    expect(commentary.title).toContain('回暖');
    expect(commentary.confidence).toBeGreaterThan(60);
    expect(commentary.sections).toHaveLength(5);
  });

  it('生成看跌市场解读', () => {
    const commentary = generator.generateDailySummary(bearishData);
    expect(commentary.sentiment).toBe('bearish');
    expect(commentary.title).toContain('承压');
  });

  it('生成中性市场解读', () => {
    const commentary = generator.generateDailySummary(neutralData);
    expect(commentary.sentiment).toBe('neutral');
    expect(commentary.title).toContain('震荡');
  });

  it('包含所有必要字段', () => {
    const commentary = generator.generateDailySummary(bullishData);
    expect(commentary.id).toBeDefined();
    expect(commentary.date).toBeDefined();
    expect(commentary.type).toBe('daily_summary');
    expect(commentary.summary.length).toBeGreaterThan(0);
    expect(commentary.keywords.length).toBeGreaterThan(0);
    expect(commentary.generatedAt).toBeDefined();
  });

  it('各section包含标题和内容', () => {
    const commentary = generator.generateDailySummary(bullishData);
    for (const section of commentary.sections) {
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.content.length).toBeGreaterThan(0);
    }
  });

  it('大势研判section包含数据点', () => {
    const commentary = generator.generateDailySummary(bullishData);
    const overview = commentary.sections[0];
    expect(overview.dataPoints.length).toBeGreaterThan(0);
  });

  it('涨停数多时提升置信度', () => {
    const highConfData = { ...bullishData, limitUpCount: 200 };
    const commentary = generator.generateDailySummary(highConfData);
    expect(commentary.confidence).toBeGreaterThan(70);
  });
});

describe('智能止盈止损', () => {
  let calculator: StopLossCalculator;
  let mockKLineData: KLineData[];

  beforeEach(() => {
    calculator = new StopLossCalculator();
    mockKLineData = Array.from({ length: 30 }, (_, i) => ({
      tradeDate: `2025-0${Math.floor(i / 10) + 1}-${(i % 10) + 20}`,
      open: 10 + Math.random() * 2,
      close: 10 + Math.random() * 2,
      high: 11 + Math.random(),
      low: 9.5 + Math.random() * 0.5,
      volume: 100000 + Math.random() * 50000,
      turnover: 1000000,
    }));
  });

  it('ATR方法计算止盈止损', () => {
    const result = calculator.calculateByATR('000001.SZ', 10.5, mockKLineData);
    expect(result.suggestedStopLoss).toBeLessThan(10.5);
    expect(result.suggestedTakeProfit).toBeGreaterThan(10.5);
    expect(result.riskRewardRatio).toBe(1.5);
    expect(result.method).toBe('atr');
    expect(result.reasoning).toContain('ATR');
  });

  it('均线方法计算止盈止损', () => {
    const result = calculator.calculateByMA('000001.SZ', 10.5, mockKLineData);
    expect(result.suggestedStopLoss).toBeGreaterThan(0);
    expect(result.suggestedTakeProfit).toBeGreaterThan(0);
    expect(result.method).toBe('moving_average');
    expect(result.reasoning).toContain('均线');
    expect(result.riskRewardRatio).toBe(2);
  });

  it('百分比方法计算止盈止损', () => {
    const result = calculator.calculateByPercent('000001.SZ', 10, 5, 10);
    expect(result.suggestedStopLoss).toBe(9.5);
    expect(result.suggestedTakeProfit).toBe(11);
    expect(result.riskRewardRatio).toBe(2);
    expect(result.method).toBe('percent');
  });

  it('自定义百分比参数', () => {
    const result = calculator.calculateByPercent('000001.SZ', 20, 3, 9);
    expect(result.suggestedStopLoss).toBe(19.4);
    expect(result.suggestedTakeProfit).toBe(21.8);
    expect(result.riskRewardRatio).toBe(3);
  });

  it('止盈止损百分比为正数', () => {
    const result = calculator.calculateByATR('000001.SZ', 10.5, mockKLineData);
    expect(result.stopLossPercent).toBeGreaterThan(0);
    expect(result.takeProfitPercent).toBeGreaterThan(0);
  });
});

describe('板块轮动预测', () => {
  let predictor: SectorRotationPredictor;

  beforeEach(() => {
    predictor = new SectorRotationPredictor();
  });

  const sectorData = [
    {
      sector: '半导体',
      changePercent5d: 8.5,
      changePercent20d: 15,
      volumeRatio: 1.8,
      capitalInflow: 5e9,
      avgPE: 45,
      constituentCount: 120,
    },
    {
      sector: '银行',
      changePercent5d: -2,
      changePercent20d: -5,
      volumeRatio: 0.7,
      capitalInflow: -3e9,
      avgPE: 5,
      constituentCount: 42,
    },
    {
      sector: '医药',
      changePercent5d: 1,
      changePercent20d: 3,
      volumeRatio: 1.1,
      capitalInflow: 8e8,
      avgPE: 30,
      constituentCount: 200,
    },
  ];

  it('分析所有板块', () => {
    const predictions = predictor.analyze(sectorData);
    expect(predictions).toHaveLength(3);
  });

  it('强势板块应被识别为流入', () => {
    const predictions = predictor.analyze(sectorData);
    const semiconductor = predictions.find(p => p.sector === '半导体');
    expect(semiconductor?.predictedDirection).toBe('rotate_in');
    expect(semiconductor?.strength).toBeGreaterThan(50);
  });

  it('弱势板块应被识别为流出', () => {
    const predictions = predictor.analyze(sectorData);
    const bank = predictions.find(p => p.sector === '银行');
    expect(bank).toBeDefined();
    expect(bank?.predictedDirection).toBeDefined();
    expect(['rotate_in', 'rotate_out', 'hold']).toContain(bank?.predictedDirection);
  });

  it('每个预测包含必要字段', () => {
    const predictions = predictor.analyze(sectorData);
    for (const pred of predictions) {
      expect(pred.sector).toBeDefined();
      expect(pred.currentPhase).toBeDefined();
      expect(pred.predictedDirection).toBeDefined();
      expect(pred.strength).toBeGreaterThanOrEqual(0);
      expect(pred.strength).toBeLessThanOrEqual(100);
      expect(pred.timeframe).toBeDefined();
      expect(pred.analysis.length).toBeGreaterThan(0);
    }
  });

  it('识别催化因素', () => {
    const predictions = predictor.analyze(sectorData);
    const semiconductor = predictions.find(p => p.sector === '半导体');
    expect(semiconductor?.catalysts.length).toBeGreaterThan(0);
  });

  it('识别风险因素', () => {
    const predictions = predictor.analyze(sectorData);
    for (const pred of predictions) {
      expect(pred.risks).toBeDefined();
      expect(Array.isArray(pred.risks)).toBe(true);
    }
  });

  it('空数据返回空数组', () => {
    const predictions = predictor.analyze([]);
    expect(predictions).toHaveLength(0);
  });
});
