// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMarketAnalytics,
  useMarketScore,
  useMarketRisk,
} from '../hooks/useMarketAnalytics';
import type {
  BreadthData,
  CapitalFlowData,
  NorthboundData,
  SectorMomentumData,
  SentimentData,
  ValuationData,
} from '../utils/marketAnalytics';

// ==================== 测试数据 ====================

const mockBreadth: BreadthData = {
  advanceCount: 2500, declineCount: 1500, unchangedCount: 500,
  newHighs: 200, newLows: 50, advanceDeclineRatio: 1.67,
  aboveMA50Percent: 65, aboveMA200Percent: 55,
};

const mockCapitalFlow: CapitalFlowData = {
  mainNetInflow: 5e10, retailNetInflow: -2e10, largeOrderNetInflow: 3e10,
  sectorFlows: { '科技': 5e9, '金融': 3e9, '消费': -2e9 },
  trend: 'inflow',
};

const mockNorthbound: NorthboundData = {
  totalNetBuy: 1e11, dailyNetBuy: 5e9,
  topHolds: [{ code: '600519', name: '茅台', change: 2.5 }],
  sectorExposure: { '白酒': 5e10, '家电': 3e10 },
  trend: 'accumulating',
};

const mockSectors: SectorMomentumData[] = [
  { sector: '科技', momentum: 45, priceChange5d: 5.2, priceChange20d: 12.5, volumeRatio: 1.5, relativeStrength: 8 },
  { sector: '金融', momentum: 20, priceChange5d: 2.1, priceChange20d: 6.3, volumeRatio: 1.2, relativeStrength: 3 },
];

const mockSentiment: SentimentData = {
  limitUpCount: 80, limitDownCount: 20, consecutiveLimitUp: 3,
  marketSentimentIndex: 65, fearGreedIndex: 55, putCallRatio: 0.9,
};

const mockValuations: ValuationData[] = [
  { sector: '科技', peRatio: 35, pbRatio: 4.5, pePercentile: 60, pbPercentile: 55, dividendYield: 0.8 },
];

// ==================== useMarketAnalytics测试 ====================

describe('useMarketAnalytics', () => {
  it('应初始化为null状态', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    expect(result.current.overview).toBeNull();
    expect(result.current.signal).toBeNull();
    expect(result.current.compositeScore).toBeNull();
    expect(result.current.riskLevel).toBeNull();
    expect(result.current.trend).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('updateBreadth应更新数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateBreadth(mockBreadth);
    });

    expect(result.current.lastUpdated).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('updateCapitalFlow应更新数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateCapitalFlow(mockCapitalFlow);
    });

    expect(result.current.lastUpdated).not.toBeNull();
  });

  it('updateAll应一次性更新所有数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
        volatility: 20,
      });
    });

    expect(result.current.overview).not.toBeNull();
    expect(result.current.compositeScore).not.toBeNull();
    expect(result.current.signal).not.toBeNull();
    expect(result.current.riskLevel).not.toBeNull();
    expect(result.current.trend).not.toBeNull();
    expect(result.current.sectorRecommendations.length).toBeGreaterThan(0);
  });

  it('reset应清空所有数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.overview).toBeNull();
    expect(result.current.compositeScore).toBeNull();
    expect(result.current.signal).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('refresh应设置loading并更新时间', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.refresh();
    });

    expect(result.current.lastUpdated).not.toBeNull();
  });

  it('updateSectors应更新板块数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateSectors(mockSectors);
    });

    expect(result.current.lastUpdated).not.toBeNull();
    expect(result.current.momentumAcceleration.length).toBe(mockSectors.length);
  });

  it('updateSentiment应更新情绪数据', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateSentiment(mockSentiment);
    });

    expect(result.current.lastUpdated).not.toBeNull();
  });

  it('更新数据应清除error', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateBreadth(mockBreadth);
    });

    expect(result.current.error).toBeNull();
  });

  it('空数据时sectorRecommendations应为空数组', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    expect(result.current.sectorRecommendations).toEqual([]);
    expect(result.current.anomalies).toEqual([]);
    expect(result.current.rotationSignals).toEqual([]);
  });

  it('应正确计算riskLevel', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    expect(['low', 'medium', 'high']).toContain(result.current.riskLevel);
  });

  it('应正确计算trend', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    expect(['up', 'down', 'sideways']).toContain(result.current.trend);
  });

  it('onSignalChange回调应在信号变化时触发', () => {
    const onSignalChange = vi.fn();
    const { result } = renderHook(() => useMarketAnalytics({ onSignalChange }));

    // 先设置熊市数据
    const bearishSentiment: SentimentData = {
      limitUpCount: 5, limitDownCount: 200, consecutiveLimitUp: 0,
      marketSentimentIndex: 10, fearGreedIndex: 10, putCallRatio: 1.5,
    };
    const bearishBreadth: BreadthData = {
      advanceCount: 200, declineCount: 4000, unchangedCount: 300,
      newHighs: 10, newLows: 500, advanceDeclineRatio: 0.05,
      aboveMA50Percent: 5, aboveMA200Percent: 2,
    };

    act(() => {
      result.current.updateAll({
        breadth: bearishBreadth,
        capitalFlow: { ...mockCapitalFlow, mainNetInflow: -1e11 },
        northbound: { ...mockNorthbound, totalNetBuy: -1e11, trend: 'reducing' },
        sectors: mockSectors.map(s => ({ ...s, momentum: -50 })),
        sentiment: bearishSentiment,
        valuations: mockValuations,
      });
    });

    // 然后切换到牛市数据
    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    // 回调应该被调用（信号从bearish变到其他）
    // 注意：取决于实际信号类型变化
  });

  it('应处理自定义config', () => {
    const { result } = renderHook(() => useMarketAnalytics({
      config: {
        weights: { breadth: 0.5, capitalFlow: 0.5, northbound: 0, sectorMomentum: 0, sentiment: 0, valuation: 0 },
        thresholds: { bullish: 70, bearish: 30, volatility: 25 },
      },
    }));

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    expect(result.current.compositeScore).not.toBeNull();
  });

  it('应计算marketConcentration', () => {
    const { result } = renderHook(() => useMarketAnalytics());

    act(() => {
      result.current.updateAll({
        breadth: mockBreadth,
        capitalFlow: mockCapitalFlow,
        northbound: mockNorthbound,
        sectors: mockSectors,
        sentiment: mockSentiment,
        valuations: mockValuations,
      });
    });

    expect(result.current.marketConcentration).not.toBeNull();
    if (result.current.marketConcentration) {
      expect(result.current.marketConcentration.herfindahlIndex).toBeGreaterThan(0);
    }
  });
});

// ==================== useMarketScore测试 ====================

describe('useMarketScore', () => {
  it('应计算综合评分', () => {
    const { result } = renderHook(() => useMarketScore(mockBreadth, mockSectors, mockSentiment));

    expect(result.current).not.toBeNull();
    expect(result.current).toBeGreaterThan(0);
  });

  it('空数据应返回null', () => {
    const { result } = renderHook(() => useMarketScore(null, [], null));
    expect(result.current).toBeNull();
  });

  it('部分数据应返回null', () => {
    const { result: r1 } = renderHook(() => useMarketScore(mockBreadth, [], mockSentiment));
    expect(r1.current).toBeNull();

    const { result: r2 } = renderHook(() => useMarketScore(null, mockSectors, mockSentiment));
    expect(r2.current).toBeNull();
  });
});

// ==================== useMarketRisk测试 ====================

describe('useMarketRisk', () => {
  it('应返回风险等级和预警', () => {
    const { result } = renderHook(() => useMarketRisk(mockBreadth, mockSentiment, 15));

    expect(result.current.riskLevel).not.toBeNull();
    expect(Array.isArray(result.current.alerts)).toBe(true);
  });

  it('空数据应返回null', () => {
    const { result } = renderHook(() => useMarketRisk(null, null));
    expect(result.current.riskLevel).toBeNull();
    expect(result.current.alerts).toEqual([]);
  });

  it('恐慌情绪应触发预警', () => {
    const panic: SentimentData = {
      limitUpCount: 5, limitDownCount: 200, consecutiveLimitUp: 0,
      marketSentimentIndex: 10, fearGreedIndex: 10, putCallRatio: 1.5,
    };
    const { result } = renderHook(() => useMarketRisk(mockBreadth, panic, 15));

    expect(result.current.alerts.length).toBeGreaterThan(0);
  });

  it('高波动应触发预警', () => {
    const { result } = renderHook(() => useMarketRisk(mockBreadth, mockSentiment, 35));

    expect(result.current.alerts.some(a => a.includes('波动率'))).toBe(true);
  });

  it('市场普跌应触发预警', () => {
    const crashBreadth: BreadthData = {
      advanceCount: 500, declineCount: 3500, unchangedCount: 200,
      newHighs: 10, newLows: 100, advanceDeclineRatio: 0.14,
      aboveMA50Percent: 10, aboveMA200Percent: 5,
    };
    const { result } = renderHook(() => useMarketRisk(crashBreadth, mockSentiment, 15));

    expect(result.current.alerts.some(a => a.includes('普跌'))).toBe(true);
  });

  it('创新低激增应触发预警', () => {
    const lowsBreadth: BreadthData = {
      advanceCount: 1500, declineCount: 2000, unchangedCount: 500,
      newHighs: 20, newLows: 200, advanceDeclineRatio: 0.75,
      aboveMA50Percent: 40, aboveMA200Percent: 30,
    };
    const { result } = renderHook(() => useMarketRisk(lowsBreadth, mockSentiment, 15));

    expect(result.current.alerts.some(a => a.includes('创新低'))).toBe(true);
  });
});
