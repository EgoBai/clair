/**
 * 真实历史回测数据验证 harness
 *
 * mock /api/market/kline 返回真实形态的 220 日 K 线样例（LCG 确定性，无 Math.random），
 * 经 backtestDataService 产出序列后驱动 9 个核心因子/轮动引擎公共 API，断言：
 * - 输出为有限数（无 NaN/Infinity）、结构完整；
 * - 空数据 / dataSource='unavailable' 时诚实降级（返回 null / 空 / 明确错误），不崩。
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../services/api', () => ({
  apiService: { get: vi.fn() },
}));

import { apiService } from '../services/api';
import {
  getHistorySeries,
  getBatchHistory,
  clearHistoryCache,
  toSectorRotationInput,
  toSectorV2Input,
  toIndustryRotationInput,
  toMomentumSectorInput,
  buildQuantFactorData,
  buildICFactorData,
  buildFactorMiningSnapshot,
  toMultiFactorStocks,
  toAttributionInput,
  type HistorySeries,
} from '../services/backtestDataService';
import {
  generateRotationSignals as genRotationSignalsV1,
  rankSectorMomentum,
} from '../utils/sectorRotationEngine';
import { generateRotationSignals as genRotationSignalsV2 } from '../utils/sectorRotationV2Engine';
import { analyzeIndustryRotation } from '../utils/industryRotationEngine2';
import { analyzeSectorRotation } from '../utils/sectorMomentumRotationEngine';
import {
  calculateFactorIC,
  quantileBacktest,
} from '../utils/quantFactorBacktestEngine';
import {
  calculateIC,
  calculateTimeSeriesIC,
  calculateQuintileReturns,
  type FactorData as ICFactorData,
} from '../utils/factorICEngine';
import { FactorMiningEngine } from '../utils/factorMiningEngine';
import { scoreStocks, type ScoringConfig } from '../utils/multiFactorEngine';
import {
  customFactorAttribution,
  factorPerformanceSummary,
  factorCorrelationMatrix,
} from '../utils/factorAttributionEngine';

const apiGet = apiService.get as Mock;

// ==================== 确定性 mock K 线（LCG，无 Math.random） ====================

function createLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const N_DAYS = 220;

function makeKlinePayload(symbol: string, seed: number, drift: number) {
  const rng = createLCG(seed);
  const dates: string[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const prices: number[] = [];
  const volumes: number[] = [];
  const amounts: number[] = [];

  const base = Date.UTC(2025, 0, 2);
  let price = 10 + seed % 50;
  for (let i = 0; i < N_DAYS; i++) {
    const r = drift + (rng() - 0.5) * 0.04;
    price = Math.max(1, price * (1 + r));
    const vol = Math.floor(1_000_000 + rng() * 900_000);
    const d = new Date(base + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
    opens.push(price * (1 - r / 2));
    highs.push(price * 1.01);
    lows.push(price * 0.99);
    prices.push(price);
    volumes.push(vol);
    amounts.push(vol * price);
  }

  return {
    symbol,
    dataSource: 'real' as const,
    dates,
    opens,
    highs,
    lows,
    prices,
    volumes,
    amounts,
  };
}

const SYMBOLS = [
  '600519', '601318', '600036', '000858', '601899', '600900',
  '600030', '000333', '600276', '601012', '600585', '000063',
];

function setupMockKlines(symbols: string[] = SYMBOLS) {
  apiGet.mockImplementation((_path: string, params?: { symbol?: string }) => {
    const symbol = params?.symbol ?? '';
    const idx = symbols.indexOf(symbol);
    if (idx < 0) {
      return Promise.resolve({
        success: true,
        data: { symbol, dataSource: 'unavailable', dates: [], opens: [], highs: [], lows: [], prices: [], volumes: [], amounts: [] },
      });
    }
    const drift = 0.0005 * ((idx % 5) - 2); // 不同标的不同漂移
    return Promise.resolve({ success: true, data: makeKlinePayload(symbol, 1234 + idx * 77, drift) });
  });
}

async function fetchBatch(symbols: string[] = SYMBOLS): Promise<Record<string, HistorySeries>> {
  return getBatchHistory(symbols, N_DAYS, 4);
}

function expectAllFinite(values: number[], label: string) {
  for (const v of values) {
    expect(Number.isFinite(v), `${label} 应全为有限数`).toBe(true);
  }
}

beforeEach(() => {
  clearHistoryCache();
  apiGet.mockReset();
  setupMockKlines();
});

// ==================== 数据服务本身 ====================

describe('backtestDataService 取数', () => {
  it('getHistorySeries 返回等长序列，returns[0]=0 且收益率计算正确', async () => {
    const s = await getHistorySeries('600519', N_DAYS);
    expect(s.dataSource).toBe('real');
    expect(s.dates.length).toBe(N_DAYS);
    expect(s.prices.length).toBe(N_DAYS);
    expect(s.returns.length).toBe(N_DAYS);
    expect(s.volumes.length).toBe(N_DAYS);
    expect(s.returns[0]).toBe(0);
    expect(s.returns[1]).toBeCloseTo(s.prices[1] / s.prices[0] - 1, 10);
    expectAllFinite(s.prices, 'prices');
    expectAllFinite(s.returns, 'returns');
  });

  it('dataSource=unavailable 时诚实降级为空序列，不伪造', async () => {
    const s = await getHistorySeries('999999', N_DAYS);
    expect(s.dataSource).toBe('unavailable');
    expect(s.dates).toEqual([]);
    expect(s.prices).toEqual([]);
    expect(s.returns).toEqual([]);
    expect(s.volumes).toEqual([]);
  });

  it('接口抛错时同样诚实降级为空序列', async () => {
    apiGet.mockRejectedValueOnce(new Error('network down'));
    const s = await getHistorySeries('600519', N_DAYS);
    expect(s.dataSource).toBe('unavailable');
    expect(s.prices).toEqual([]);
  });

  it('5 分钟缓存：同一标的二次取数不重复请求', async () => {
    await getHistorySeries('600519', N_DAYS);
    await getHistorySeries('600519', N_DAYS);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('getBatchHistory 并发批量取数，全部标的返回', async () => {
    const batch = await fetchBatch(SYMBOLS.slice(0, 5));
    expect(Object.keys(batch).sort()).toEqual(SYMBOLS.slice(0, 5).sort());
    for (const s of Object.values(batch)) {
      expect(s.dataSource).toBe('real');
    }
  });
});

// ==================== 轮动引擎（真实序列驱动） ====================

describe('轮动引擎 × 真实序列', () => {
  it('sectorRotationEngine：信号与动量排名全为有限数', async () => {
    const batch = await fetchBatch(SYMBOLS.slice(0, 4));
    const sectors = SYMBOLS.slice(0, 3).map((sym) => toSectorRotationInput(sym, batch[sym]));
    const benchmark = batch[SYMBOLS[3]].returns;

    const signals = genRotationSignalsV1(sectors, benchmark);
    expect(signals.length).toBe(3);
    expectAllFinite(signals.map((s) => s.compositeScore), 'compositeScore');
    expectAllFinite(signals.map((s) => s.momentum), 'momentum');
    expectAllFinite(signals.map((s) => s.trend), 'trend');
    expectAllFinite(signals.map((s) => s.volumeConfirmation), 'volumeConfirmation');
    for (const s of signals) {
      expect(['overweight', 'neutral', 'underweight']).toContain(s.recommendation);
    }

    const ranks = rankSectorMomentum(sectors);
    expect(ranks.map((r) => r.rank)).toEqual([1, 2, 3]);
    expectAllFinite(ranks.map((r) => r.score), 'rankScore');
  });

  it('sectorRotationV2Engine：真实动量/波动率驱动完整报告', async () => {
    const batch = await fetchBatch(SYMBOLS.slice(0, 4));
    const sectors = SYMBOLS.slice(0, 4).map((sym) => toSectorV2Input(sym, batch[sym]));
    const report = genRotationSignalsV2(sectors);

    expect(['early', 'mid', 'late', 'recession']).toContain(report.cycle);
    expect(report.signals.length).toBe(4);
    expect(report.momentum.length).toBe(4);
    expectAllFinite(report.signals.map((s) => s.score), 'v2.score');
    expectAllFinite(report.momentum.map((m) => m.score), 'v2.momentumScore');
    expect(report.signals.map((s) => s.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it('industryRotationEngine2：≥3 个行业真实输入产出完整轮动结果', async () => {
    const batch = await fetchBatch(SYMBOLS.slice(0, 4));
    const industries = SYMBOLS.slice(0, 4).map((sym) => toIndustryRotationInput(sym, batch[sym]));
    const result = analyzeIndustryRotation(industries);

    expect(result.signals.length).toBe(4);
    expectAllFinite(result.signals.map((s) => s.compositeScore), 'ind.compositeScore');
    expectAllFinite(result.signals.map((s) => s.riskAdjustedReturn), 'ind.riskAdjustedReturn');
    expect(['early_momentum', 'mid_momentum', 'late_momentum', 'reversal']).toContain(result.rotationPhase);
    expect(['risk_on', 'risk_off', 'transition']).toContain(result.marketRegime);
  });

  it('sectorMomentumRotationEngine：真实序列驱动综合分析', async () => {
    const batch = await fetchBatch(SYMBOLS.slice(0, 6));
    const sectors = SYMBOLS.slice(0, 6).map((sym) => toMomentumSectorInput(sym, sym, batch[sym]));
    const result = analyzeSectorRotation(sectors);

    expect(result.ranks.length).toBe(6);
    expectAllFinite(result.ranks.map((r) => r.composite), 'momRank.composite');
    expectAllFinite(result.clusters.map((c) => c.avgMomentum), 'cluster.avgMomentum');
    expect(Number.isFinite(result.summary.rotationIntensity)).toBe(true);
    expect(['risk_on', 'risk_off', 'transition']).toContain(result.summary.marketPhase);
  });
});

// ==================== 因子引擎（真实横截面数据集驱动） ====================

describe('因子引擎 × 真实横截面数据', () => {
  it('quantFactorBacktestEngine：IC 与分层回测有限且结构完整', async () => {
    const batch = await fetchBatch();
    const data = buildQuantFactorData(batch, { kind: 'momentum', lookback: 20, horizon: 10, step: 10 });
    expect(data.length).toBeGreaterThan(0);

    const ic = calculateFactorIC(data);
    expect(ic.periods).toBeGreaterThan(0);
    expectAllFinite([ic.ic, ic.icStd, ic.ir, ic.rankIC, ic.icWinRate], 'quantIC');

    const quantiles = quantileBacktest(data, 5);
    expect(quantiles.length).toBe(5);
    expectAllFinite(quantiles.map((q) => q.avgReturn), 'quantile.avgReturn');
    expectAllFinite(quantiles.map((q) => q.sharpe), 'quantile.sharpe');
    expectAllFinite(quantiles.map((q) => q.maxDrawdown), 'quantile.maxDrawdown');
  });

  it('factorICEngine：横截面 IC / 时序 ICIR / 五分位分层均可用', async () => {
    const batch = await fetchBatch();
    const data = buildICFactorData(batch, { kind: 'momentum', lookback: 20, horizon: 10, step: 10 });
    expect(data.length).toBeGreaterThanOrEqual(20);

    const ic = calculateIC(data);
    expect(ic).not.toBeNull();
    expectAllFinite([ic!.ic, ic!.rankIC], 'icEngine.ic');

    const byDate = new Map<string, ICFactorData[]>();
    for (const d of data) {
      const arr = byDate.get(d.date);
      if (arr) arr.push(d);
      else byDate.set(d.date, [d]);
    }
    const ts = calculateTimeSeriesIC(byDate);
    expect(ts).not.toBeNull();
    expectAllFinite([ts!.ic, ts!.icir, ts!.icStd, ts!.positiveRate], 'icEngine.tsIC');

    const q = calculateQuintileReturns(data, 'momentum20');
    expect(q).not.toBeNull();
    expect(q!.quintiles.length).toBe(5);
    expectAllFinite(q!.quintiles.map((x) => x.avgReturn), 'icEngine.quintile');
    expect(Number.isFinite(q!.longShortReturn)).toBe(true);
  });

  it('factorMiningEngine：真实快照的 IC / 有效性检验有限', async () => {
    const batch = await fetchBatch();
    const snapshot = buildFactorMiningSnapshot(batch);
    expect(snapshot).not.toBeNull();

    const engine = new FactorMiningEngine();
    const ic = engine.calculateIC(snapshot!.factor, snapshot!.returns);
    expectAllFinite([ic.ic, ic.icIR, ic.rankIC, ic.tStat], 'mining.ic');

    const validation = engine.validateFactor(snapshot!.factor, snapshot!.returns, 3);
    expectAllFinite([validation.longShortReturn, validation.monotonicity], 'mining.validate');
  });

  it('multiFactorEngine：真实因子暴露评分有限', async () => {
    const batch = await fetchBatch();
    const stocks = toMultiFactorStocks(batch);
    expect(stocks.length).toBe(SYMBOLS.length);

    const config: ScoringConfig = {
      factors: [
        { id: 'mom20', name: '20日动量', category: 'momentum', weight: 0.4, direction: 'higher_better', minRange: -1, maxRange: 1 },
        { id: 'mom60', name: '60日动量', category: 'momentum', weight: 0.3, direction: 'higher_better', minRange: -1, maxRange: 1 },
        { id: 'vol20', name: '20日波动', category: 'volatility', weight: 0.3, direction: 'lower_better', minRange: 0, maxRange: 2 },
      ],
      normalization: 'zscore',
      outlierHandling: 'clip',
      minDataPoints: 10,
    };
    const result = scoreStocks(stocks, config);
    expect(result.scores.length).toBe(SYMBOLS.length);
    expectAllFinite(result.scores.map((s) => s.totalScore), 'multiFactor.totalScore');
    expect(Number.isFinite(result.stats.avgScore)).toBe(true);
  });

  it('factorAttributionEngine：真实收益序列归因结果有限', async () => {
    const batch = await fetchBatch();
    const stock = batch['600519'];
    const { stockReturns, factors } = toAttributionInput(stock, {
      Market: batch['600030'],
      SizeProxy: batch['000063'],
    });

    const attr = customFactorAttribution(stockReturns, factors);
    expectAllFinite(
      [attr.totalReturn, attr.alpha, attr.rSquared, attr.trackingError, attr.informationRatio],
      'attr.summary',
    );
    expect(attr.factorReturns.length).toBe(2);
    expectAllFinite(attr.factorReturns.map((f) => f.contribution), 'attr.contribution');

    const perf = factorPerformanceSummary(stock.returns);
    expectAllFinite(
      [perf.annualizedReturn, perf.annualizedVolatility, perf.sharpeRatio, perf.maxDrawdown, perf.hitRate],
      'attr.factorPerf',
    );

    const corr = factorCorrelationMatrix(factors);
    expect(corr.matrix.length).toBe(2);
    for (const row of corr.matrix) expectAllFinite(row, 'attr.corrMatrix');
  });
});

// ==================== 空数据诚实降级 ====================

describe('空数据 / 不可用时的诚实降级', () => {
  it('空批量 → 横截面数据集为空，各引擎返回 null/零值而不崩', () => {
    const emptyQuant = buildQuantFactorData({});
    const emptyIC = buildICFactorData({});
    expect(emptyQuant).toEqual([]);
    expect(emptyIC).toEqual([]);

    expect(calculateFactorIC([]).periods).toBe(0);
    expect(quantileBacktest([])).toEqual([]);
    expect(calculateIC([])).toBeNull();
    expect(calculateQuintileReturns([], 'x')).toBeNull();
    expect(calculateTimeSeriesIC(new Map())).toBeNull();
    expect(buildFactorMiningSnapshot({})).toBeNull();
    expect(genRotationSignalsV1([], [])).toEqual([]);
    expect(scoreStocks([], {
      factors: [], normalization: 'zscore', outlierHandling: 'ignore', minDataPoints: 0,
    }).stats.total).toBe(0);
  });

  it('industryRotationEngine2 空输入抛出明确错误（诚实拒绝而非静默伪造）', () => {
    expect(() => analyzeIndustryRotation([])).toThrow('至少需要3个行业数据');
  });

  it('unavailable 序列经适配器不产生 NaN，仅给出零值/空结构', async () => {
    const unavailable: HistorySeries = {
      symbol: 'X', dataSource: 'unavailable', dates: [], prices: [], returns: [], volumes: [],
    };
    const v1 = toSectorRotationInput('X', unavailable);
    expect(v1.returns).toEqual([]);
    const v2 = toSectorV2Input('X', unavailable);
    expectAllFinite([v2.momentum1M, v2.momentum3M, v2.momentum6M, v2.volatility], 'v2.empty');
    const ind = toIndustryRotationInput('X', unavailable);
    expectAllFinite([ind.returns1m, ind.returns3m, ind.volatility, ind.momentum], 'ind.empty');
    const mom = toMomentumSectorInput('X', 'X', unavailable);
    expectAllFinite([mom.returns.d1, mom.returns.d60, mom.volume.change, mom.breadth], 'mom.empty');

    const stocks = toMultiFactorStocks({ X: unavailable });
    expect(stocks).toEqual([]);
  });
});
