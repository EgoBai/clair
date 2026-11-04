/**
 * ETF 分析测试（迁移自影子实现，绑定生产实现）
 *
 * 一、原自抄实现的问题
 * 1. 溢价率自抄 nav===0 才归零；backend BlockTrade.calculatePremiumRate 同样只拦 ===0，而 frontend etfPremiumDiscountEngine.calculatePremiumRate 拦 nav<=0。
 *    负净值场景两者不一致，属生产缺陷，只在用例中记录当前行为，不修改源码。
 * 2. classifyPremium 自抄分 high_premium/moderate_premium/neutral/moderate_discount/high_discount 五档；
 *    生产 BlockTrade.classifyPremium 只有 premium/discount/flat 三档，阈值 ±0.5。
 * 3. 跟踪误差自抄返回 diff 的样本标准差；生产 analyzeDivergence 返回年化跟踪误差（总体方差 → ×√252×100，保留 2 位）。
 * 4. beta 自抄在样本不足或市场方差为 0 时返回 1；生产 correlationMatrix.calculateBeta 返回 0。
 * 5. 市场状态自抄按年化收益与波动率分 bull/bear/sideways/volatile 四态；生产 detectMarketRegime 只有 bull/bear/sideways 三态，
 *    高波动体现在 metrics.volatilityRegime==='high'，数据不足默认 sideways/confidence 0。
 * 6. 集中度自抄用归一化 HHI；生产 concentrationRisk 合同义。有效持仓数由 etfHoldingEngine.analyzeETFHoldings 内部按
 *    hhiIndex=Σ(weight×100)²、effectiveN=10000/hhiIndex 计算，权重须传小数（0.02 表示 2%）。
 * 7. NAV 历史/筛选/申赎/行业轮动等原为夹具数据断言，生产无同契约导出，未迁移（见第三节）。
 *
 * 二、绑定生产实现（file:line）
 * - calculatePremiumRate → backend/src/models/BlockTrade.ts:85（另在负净值用例中对照 frontend/src/utils/etfPremiumDiscountEngine.ts:43）
 * - classifyPremium → backend/src/models/BlockTrade.ts:90
 * - classifyPremiumStatus → frontend/src/utils/etfPremiumDiscountEngine.ts:51
 * - analyzeDivergence（年化跟踪误差）→ frontend/src/utils/etfPremiumDiscountEngine.ts:190
 * - calculateBeta → frontend/src/utils/correlationMatrix.ts:86
 * - concentrationRisk → backend/src/services/portfolioStressEngine.ts:18
 * - analyzeETFHoldings.concentration.effectiveN → frontend/src/utils/etfHoldingEngine.ts:74
 * - detectMarketRegime → frontend/src/utils/marketRegimeDetector.ts:94
 *
 * 三、未迁移清单及原因
 * - ETF Data Model：纯夹具字段断言，生产无同名 ETF 模型导出（ETFHolding 字段为 shares/marketValue/weight/changeFromPrev）。
 * - NAV History：生产无净值序列/分红事件分析导出。
 * - ETF Screening：生产无筛选排序导出（etfAnalysisEngine.compareETFs 契约不同）。
 * - Creation/Redemption：生产 etfArbitrageEngine 为类且按 iopv/price 计价，无 creationUnit/arbitrageProfit 自由函数契约。
 * - ETF Sector Rotation：生产无板块轮动排序导出。
 * - Trend strength：生产 trendFollowingEngine.calculateTrendStrength 入参 MAValues 返回 {score,level,...}，
 *   不是 -1..1 的涨跌日比率；marketRegimeDetector 内部斜率函数未导出。
 * 以上保留原自抄用例与注释，用例数与断言数不减少。
 */

import { describe, it, expect } from 'vitest';

import { calculatePremiumRate, classifyPremium } from '../models/BlockTrade';
import {
  calculatePremiumRate as calculatePremiumRateFromNav,
  classifyPremiumStatus,
  analyzeDivergence,
} from '../../../frontend/src/utils/etfPremiumDiscountEngine';
import { calculateBeta } from '../../../frontend/src/utils/correlationMatrix';
import { concentrationRisk } from '../services/portfolioStressEngine';
import { analyzeETFHoldings, type ETFHoldingSnapshot } from '../../../frontend/src/utils/etfHoldingEngine';
import { detectMarketRegime, type PriceData } from '../../../frontend/src/utils/marketRegimeDetector';

// ETF Analytics Engine Tests
describe('ETF Analytics Engine', () => {
  // ETF Data Model（未迁移：纯夹具断言）
  describe('ETF Data Model', () => {
    const mockETF = {
      symbol: '510300',
      name: '沪深300ETF',
      type: 'index',
      nav: 4.523,
      premiumRate: 0.12,
      aum: 52000000000,
      trackingError: 0.03,
      dividendYield: 2.1,
      managementFee: 0.5,
      topHoldings: [
        { symbol: '600519', name: '贵州茅台', weight: 4.8 },
        { symbol: '000858', name: '五粮液', weight: 2.3 },
      ],
    };

    it('should have required fields', () => {
      expect(mockETF).toHaveProperty('symbol');
      expect(mockETF).toHaveProperty('name');
      expect(mockETF).toHaveProperty('nav');
      expect(mockETF).toHaveProperty('type');
      expect(mockETF).toHaveProperty('aum');
    });

    it('should have positive NAV', () => {
      expect(mockETF.nav).toBe(4.523);
    });

    it('should have valid tracking error', () => {
      expect(mockETF.trackingError).toBe(0.03);
    });

    it('should have valid ETF types', () => {
      const validTypes = ['index', 'sector', 'qdii', 'commodity', 'bond', 'money_market'];
      expect(validTypes).toContain(mockETF.type);
    });

    it('should have top holdings with total weight <= 100', () => {
      const totalWeight = mockETF.topHoldings.reduce((sum, h) => sum + h.weight, 0);
      expect(totalWeight).toBeCloseTo(7.1, 10);
    });
  });

  // Premium/Discount Analysis
  describe('Premium/Discount Analysis', () => {
    it('should calculate premium correctly', () => {
      // 生产 BlockTrade 口径：百分比数值，保留原始精度
      expect(calculatePremiumRate(4.6, 4.5)).toBeCloseTo(2.222, 3);
    });

    it('should calculate discount correctly', () => {
      expect(calculatePremiumRate(4.4, 4.5)).toBeCloseTo(-2.222, 3);
    });

    it('should return 0 at par', () => {
      expect(calculatePremiumRate(4.5, 4.5)).toBe(0);
    });

    it('should handle zero NAV', () => {
      expect(calculatePremiumRate(4.5, 0)).toBe(0);
    });

    it('should classify premium zones', () => {
      // 旧自抄五档无生产对应；生产只有三档，阈值 ±0.5
      expect(classifyPremium(3)).toBe('premium');
      expect(classifyPremium(1)).toBe('premium');
      expect(classifyPremium(0)).toBe('flat');
      expect(classifyPremium(-1)).toBe('discount');
      expect(classifyPremium(-3)).toBe('discount');
      expect(classifyPremium(0.5)).toBe('flat');
      expect(classifyPremium(0.51)).toBe('premium');
      expect(classifyPremium(-0.5)).toBe('flat');
    });

    it('should classify par with frontend engine', () => {
      // 前端引擎命名不同：par 对应 BlockTrade 的 flat
      expect(classifyPremiumStatus(0.5)).toBe('par');
      expect(classifyPremiumStatus(0.51)).toBe('premium');
      expect(classifyPremiumStatus(-0.51)).toBe('discount');
    });

    it('should expose negative NAV discrepancy (生产缺陷，仅记录)', () => {
      // BlockTrade 只拦 ===0，负净值会算出 -550；前端引擎拦 <=0 返回 0
      expect(calculatePremiumRate(4.5, -1)).toBe(-550);
      expect(calculatePremiumRateFromNav(4.5, -1)).toBe(0);
    });
  });

  // ETF Performance Metrics
  describe('Performance Metrics', () => {
    it('should return 0 for identical returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.03];
      const result = analyzeDivergence(returns, returns);
      expect(result.annualizedTrackingError).toBe(0);
      expect(result.cumulativeDivergence).toBe(0);
      expect(result.beta).toBe(1);
    });

    it('should return annualized tracking error for different returns', () => {
      // 旧断言只要求 >0；生产年化口径精确值 1.94（旧自抄为未年化的 0.00129 样本标准差）
      const etf = [0.011, 0.019, -0.008, 0.032];
      const idx = [0.01, 0.02, -0.01, 0.03];
      const result = analyzeDivergence(etf, idx);
      expect(result.annualizedTrackingError).toBe(1.94);
      expect(result.cumulativeDivergence).toBe(0.42);
    });

    it('should handle mismatched lengths', () => {
      const result = analyzeDivergence([0.01], [0.01, 0.02]);
      expect(result.annualizedTrackingError).toBe(0);
      expect(result.beta).toBe(1);
    });

    it('should handle single element arrays', () => {
      expect(analyzeDivergence([0.01], [0.01]).annualizedTrackingError).toBe(0);
    });

    it('should calculate beta = 1 for identical returns', () => {
      const r = [0.01, 0.02, -0.01, 0.03, -0.02];
      expect(calculateBeta(r, r)).toBeCloseTo(1, 5);
    });

    it('should calculate beta > 1 for leveraged ETF', () => {
      const mkt = [0.01, 0.02, -0.01, 0.03];
      const etf = mkt.map(r => r * 2);
      expect(calculateBeta(etf, mkt)).toBeCloseTo(2, 5);
    });

    it('should return 0 when samples are fewer than 2 (旧返回 1)', () => {
      expect(calculateBeta([0.01], [0.01])).toBe(0);
    });

    it('should return 0 when market variance is zero (旧返回 1)', () => {
      expect(calculateBeta([0.01, 0.01, 0.01], [0.02, 0.02, 0.02])).toBe(0);
    });
  });

  // NAV History Analysis（未迁移：生产无净值序列分析导出）
  describe('NAV History', () => {
    interface NAVRecord {
      date: string;
      nav: number;
      accumulatedNav: number;
      dividend: number;
    }

    const mockNAVHistory: NAVRecord[] = [
      { date: '2026-03-01', nav: 4.50, accumulatedNav: 4.50, dividend: 0 },
      { date: '2026-03-02', nav: 4.52, accumulatedNav: 4.52, dividend: 0 },
      { date: '2026-03-03', nav: 4.48, accumulatedNav: 4.48, dividend: 0 },
      { date: '2026-03-04', nav: 4.55, accumulatedNav: 4.65, dividend: 0.10 },
      { date: '2026-03-05', nav: 4.58, accumulatedNav: 4.68, dividend: 0 },
    ];

    it('should calculate total return with dividends', () => {
      const first = mockNAVHistory[0];
      const last = mockNAVHistory[mockNAVHistory.length - 1];
      const totalReturn = ((last.accumulatedNav - first.accumulatedNav) / first.nav) * 100;
      expect(totalReturn).toBeCloseTo(4.0, 1);
    });

    it('should detect dividend events', () => {
      const dividends = mockNAVHistory.filter(r => r.dividend > 0);
      expect(dividends).toHaveLength(1);
      expect(dividends[0].date).toBe('2026-03-04');
    });

    it('should maintain chronological order', () => {
      for (let i = 1; i < mockNAVHistory.length; i++) {
        expect(mockNAVHistory[i].date > mockNAVHistory[i - 1].date).toBe(true);
      }
    });

    it('should have NAV > 0', () => {
      const expectedNav = [4.5, 4.52, 4.48, 4.55, 4.58];
      const expectedAccumulated = [4.5, 4.52, 4.48, 4.65, 4.68];
      mockNAVHistory.forEach((r, i) => {
        expect(r.nav).toBeCloseTo(expectedNav[i], 10);
        expect(r.accumulatedNav).toBeCloseTo(expectedAccumulated[i], 10);
      });
    });

    it('should calculate daily returns', () => {
      const dailyReturns = [];
      for (let i = 1; i < mockNAVHistory.length; i++) {
        const ret = (mockNAVHistory[i].nav - mockNAVHistory[i - 1].nav) / mockNAVHistory[i - 1].nav;
        dailyReturns.push(ret);
      }
      expect(dailyReturns).toHaveLength(4);
      expect(dailyReturns[0]).toBeCloseTo(0.00444, 3);
    });
  });

  // ETF Screening（未迁移：生产无筛选排序导出）
  describe('ETF Screening', () => {
    const etfs = [
      { symbol: '510300', type: 'index', aum: 52e9, trackingError: 0.03, premiumRate: 0.1 },
      { symbol: '159915', type: 'index', aum: 30e9, trackingError: 0.05, premiumRate: -0.2 },
      { symbol: '512880', type: 'sector', aum: 15e9, trackingError: 0.08, premiumRate: 0.5 },
      { symbol: '513100', type: 'qdii', aum: 8e9, trackingError: 0.12, premiumRate: 2.5 },
      { symbol: '159928', type: 'sector', aum: 25e9, trackingError: 0.04, premiumRate: -0.1 },
    ];

    it('should filter by type', () => {
      const indexETFs = etfs.filter(e => e.type === 'index');
      expect(indexETFs).toHaveLength(2);
    });

    it('should sort by AUM descending', () => {
      const sorted = [...etfs].sort((a, b) => b.aum - a.aum);
      expect(sorted[0].symbol).toBe('510300');
      expect(sorted[4].symbol).toBe('513100');
    });

    it('should filter by low tracking error', () => {
      const precise = etfs.filter(e => e.trackingError < 0.06);
      expect(precise).toHaveLength(3);
    });

    it('should filter by premium rate range', () => {
      const reasonable = etfs.filter(e => Math.abs(e.premiumRate) < 1);
      expect(reasonable).toHaveLength(4);
    });

    it('should rank by comprehensive score', () => {
      const scored = etfs.map(e => ({
        ...e,
        score: (1 - e.trackingError) * 40 + (1 / (1 + Math.abs(e.premiumRate))) * 30 + Math.min(e.aum / 50e9, 1) * 30,
      }));
      const sorted = scored.sort((a, b) => b.score - a.score);
      expect(sorted[0].symbol).toBe('510300');
    });
  });

  // ETF Creation/Redemption（未迁移：生产无自由函数契约）
  describe('Creation/Redemption Mechanics', () => {
    const calculateCreationUnit = (nav: number, minUnits: number = 1000000) => {
      return nav * minUnits;
    };

    it('should calculate creation unit cost', () => {
      expect(calculateCreationUnit(4.5)).toBe(4500000);
    });

    it('should handle different minimum units', () => {
      expect(calculateCreationUnit(4.5, 500000)).toBe(2250000);
    });

    const calculateArbitrageProfit = (marketPrice: number, nav: number, units: number, cost: number) => {
      const grossProfit = (marketPrice - nav) * units;
      return grossProfit - cost;
    };

    it('should calculate arbitrage profit for premium', () => {
      const profit = calculateArbitrageProfit(4.6, 4.5, 1000000, 5000);
      expect(profit).toBeCloseTo(95000, 0);
    });

    it('should calculate loss for discount', () => {
      const profit = calculateArbitrageProfit(4.4, 4.5, 1000000, 5000);
      expect(profit).toBeCloseTo(-105000, 0);
    });
  });
});

// Market Regime Detection Tests
describe('Market Regime Detection', () => {
  // 生产 detectMarketRegime 入参为 OHLCV；用确定性收益序列构造，避免随机夹具
  const buildBars = (returns: number[], start: number = 100): PriceData[] => {
    const closes: number[] = [start];
    for (const r of returns) {
      closes.push(closes[closes.length - 1] * (1 + r));
    }
    return closes.map(close => ({
      close,
      high: close * 1.005,
      low: close * 0.995,
      volume: 1000000,
    }));
  };

  const bullReturns = Array.from({ length: 80 }, (_, i) => [0.002, 0.004, 0.001, 0.003][i % 4]);
  const bearReturns = Array.from({ length: 80 }, (_, i) => [-0.002, -0.004, -0.001, -0.003][i % 4]);
  const sideReturns = Array.from({ length: 80 }, (_, i) => [0.0005, -0.0005, 0.0002, -0.0002][i % 4]);
  const volatileReturns = Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? 0.03 : -0.03));

  it('should detect bull market', () => {
    expect(detectMarketRegime(buildBars(bullReturns), 30).regime).toBe('bull');
  });

  it('should detect bear market', () => {
    expect(detectMarketRegime(buildBars(bearReturns), 30).regime).toBe('bear');
  });

  it('should detect sideways market', () => {
    expect(detectMarketRegime(buildBars(sideReturns), 30).regime).toBe('sideways');
  });

  it('should detect high volatility (生产无 volatile 状态，高波动在 metrics)', () => {
    const result = detectMarketRegime(buildBars(volatileReturns), 30);
    expect(result.metrics.volatilityRegime).toBe('high');
    expect(result.regime).toBe('sideways');
  });

  it('should return sideways for insufficient data', () => {
    const result = detectMarketRegime(buildBars(bullReturns).slice(0, 10), 60);
    expect(result.regime).toBe('sideways');
    expect(result.confidence).toBe(0);
  });

  // 未迁移：生产无 -1..1 涨跌日比率导出（trendFollowingEngine 契约不同，内部斜率未导出）
  const calculateTrendStrength = (prices: number[]) => {
    if (prices.length < 2) return 0;
    let upDays = 0, downDays = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) upDays++;
      else if (prices[i] < prices[i - 1]) downDays++;
    }
    return (upDays - downDays) / (prices.length - 1);
  };

  it('should return 1 for all up days', () => {
    const prices = [1, 2, 3, 4, 5];
    expect(calculateTrendStrength(prices)).toBe(1);
  });

  it('should return -1 for all down days', () => {
    const prices = [5, 4, 3, 2, 1];
    expect(calculateTrendStrength(prices)).toBe(-1);
  });

  it('should return 0 for flat', () => {
    expect(calculateTrendStrength([1, 1, 1, 1])).toBe(0);
  });

  it('should handle single element', () => {
    expect(calculateTrendStrength([1])).toBe(0);
  });
});

// ETF Sector Rotation（未迁移：生产无板块轮动排序导出）
describe('ETF Sector Rotation', () => {
  const sectorETFs = [
    { symbol: '512880', sector: '证券', momentum: 0.8, volume: 1.5 },
    { symbol: '515030', sector: '新能源', momentum: 0.3, volume: 1.2 },
    { symbol: '512010', sector: '医药', momentum: -0.2, volume: 0.8 },
    { symbol: '512480', sector: '半导体', momentum: 0.6, volume: 2.0 },
    { symbol: '512660', sector: '军工', momentum: -0.5, volume: 0.6 },
  ];

  it('should rank sectors by momentum', () => {
    const ranked = [...sectorETFs].sort((a, b) => b.momentum - a.momentum);
    expect(ranked[0].sector).toBe('证券');
    expect(ranked[4].sector).toBe('军工');
  });

  it('should identify hot sectors', () => {
    const hot = sectorETFs.filter(s => s.momentum > 0.5 && s.volume > 1);
    expect(hot).toHaveLength(2);
  });

  it('should calculate composite score', () => {
    const scored = sectorETFs.map(s => ({
      ...s,
      composite: s.momentum * 0.6 + (s.volume / 2) * 0.4,
    }));
    const best = scored.reduce((a, b) => (a.composite > b.composite ? a : b));
    expect(best.sector).toBe('证券');
  });

  it('should detect rotation signals', () => {
    const entering = sectorETFs.filter(s => s.momentum > 0.3 && s.volume > 1.3);
    const exiting = sectorETFs.filter(s => s.momentum < -0.3);
    expect(entering).toHaveLength(2);
    expect(exiting).toHaveLength(1);
  });
});

// ETF Diversification Analysis
describe('ETF Diversification', () => {
  it('should return 1 for single holding', () => {
    expect(concentrationRisk([100])).toBeCloseTo(1, 10);
  });

  it('should return low for diversified holdings', () => {
    const holdings = Array(100).fill(1);
    const hhi = concentrationRisk(holdings);
    expect(hhi).toBeCloseTo(0.01, 10);
  });

  it('should handle empty holdings', () => {
    expect(concentrationRisk([])).toBe(0);
  });

  const makeHolding = (weight: number, i: number = 0) => ({
    stockCode: '60051' + i,
    stockName: '持仓' + i,
    shares: 100,
    marketValue: weight * 100,
    weight,
    changeFromPrev: 0,
  });

  const makeSnapshot = (holdings: ReturnType<typeof makeHolding>[]): ETFHoldingSnapshot => ({
    etfCode: '510300',
    etfName: '沪深300ETF',
    date: '2026-03-01',
    totalValue: 100,
    holdings,
  });

  it('should return 1 for concentrated', () => {
    // 生产 effectiveN 由 analyzeETFHoldings 返回，权重传小数（1=100%）
    expect(analyzeETFHoldings(makeSnapshot([makeHolding(1)])).concentration.effectiveN).toBe(1);
  });

  it('should return n for equally weighted', () => {
    const holdings = Array.from({ length: 50 }, (_, i) => makeHolding(0.02, i));
    expect(analyzeETFHoldings(makeSnapshot(holdings)).concentration.effectiveN).toBe(50);
  });
});
