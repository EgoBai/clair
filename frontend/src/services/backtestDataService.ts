/**
 * 回测真实历史数据服务
 *
 * 消费后端 GET /api/market/kline（history-agent 契约）：
 *   { symbol, dataSource:'real'|'unavailable', dates, opens, highs, lows, prices, volumes, amounts }
 *
 * 职责：
 * - getHistorySeries / getBatchHistory：真实 K 线 → { dates, prices, returns, volumes } 序列
 * - 5 分钟内存缓存、受限并发批量取数
 * - 一组适配器，把序列映射为 utils/ 下各因子/轮动引擎的输入形状
 *
 * 诚实性约束：
 * - dataSource='unavailable'、空数组或请求失败 → 返回 dataSource:'unavailable' 的空序列，绝不伪造；
 * - 适配器只使用价格/成交量可真实推导的字段；需要财务因子（PE/盈利修正等）的字段
 *   一律置中性占位并在注释中声明，不虚构数值。
 */

import { apiService } from './api';
import logger from '../utils/logger';
import type { SectorData as RotationSectorData } from '../utils/sectorRotationEngine';
import type { SectorData as RotationV2SectorData } from '../utils/sectorRotationV2Engine';
import type { IndustryData } from '../utils/industryRotationEngine2';
import type { SectorData as MomentumSectorData } from '../utils/sectorMomentumRotationEngine';
import type { FactorData as QuantFactorData } from '../utils/quantFactorBacktestEngine';
import type { FactorData as ICFactorData } from '../utils/factorICEngine';
import type { FactorData as MiningFactorData } from '../utils/factorMiningEngine';
import type { StockFactors } from '../utils/multiFactorEngine';

// ==================== 类型 ====================

export type KlineDataSource = 'real' | 'unavailable';

/** 后端 /api/market/kline 数据体（sendSuccess 包装内的 data） */
interface KlinePayload {
  symbol: string;
  dataSource: KlineDataSource;
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  prices: number[];
  volumes: number[];
  amounts: number[];
}

/** 供因子/轮动引擎消费的历史序列 */
export interface HistorySeries {
  symbol: string;
  dataSource: KlineDataSource;
  dates: string[];    // YYYY-MM-DD 升序
  prices: number[];   // 收盘价
  returns: number[];  // returns[i] = prices[i]/prices[i-1]-1，returns[0] = 0
  volumes: number[];
}

/** 横截面因子样本（引擎无关的中间形状） */
export interface CrossSectionalRow {
  date: string;
  symbol: string;
  factorValue: number;
  forwardReturn: number;
}

/** 价格/成交量可真实推导的因子种类 */
export type PriceDerivedFactorKind = 'momentum' | 'reversal' | 'volatility' | 'volumeRatio';

export interface CrossSectionalOptions {
  lookback?: number;  // 因子回看窗口（交易日），默认 20
  horizon?: number;   // 前向收益窗口（交易日），默认 10
  step?: number;      // 采样间隔（交易日），默认 10
  kind?: PriceDerivedFactorKind; // 默认 'momentum'
}

// ==================== 缓存（TTL 5 分钟） ====================

const CACHE_TTL_MS = 5 * 60 * 1000;

interface SeriesCacheEntry {
  series: HistorySeries;
  timestamp: number;
}

const seriesCache = new Map<string, SeriesCacheEntry>();

function cacheKey(symbol: string, days: number): string {
  return `${symbol}:${days}`;
}

/** 清空历史序列缓存（测试/调试使用） */
export function clearHistoryCache(): void {
  seriesCache.clear();
}

// ==================== 取数 ====================

function emptySeries(symbol: string): HistorySeries {
  return { symbol, dataSource: 'unavailable', dates: [], prices: [], returns: [], volumes: [] };
}

/**
 * 获取单标的真实历史序列。
 * 任何不可用情形（接口失败 / dataSource='unavailable' / 空数组）均诚实降级为空序列。
 */
export async function getHistorySeries(symbol: string, days: number = 250): Promise<HistorySeries> {
  const key = cacheKey(symbol, days);
  const cached = seriesCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.series;
  }

  let series: HistorySeries;
  try {
    const resp = await apiService.get<KlinePayload>('/market/kline', { symbol, days });
    const payload = resp.data;
    if (
      !payload ||
      payload.dataSource !== 'real' ||
      !Array.isArray(payload.dates) ||
      payload.dates.length === 0 ||
      !Array.isArray(payload.prices) ||
      payload.prices.length !== payload.dates.length
    ) {
      series = emptySeries(symbol);
    } else {
      const prices = payload.prices;
      const returns: number[] = prices.map((p, i) => {
        if (i === 0) return 0;
        const prev = prices[i - 1];
        return prev !== 0 ? p / prev - 1 : 0;
      });
      series = {
        symbol: payload.symbol || symbol,
        dataSource: 'real',
        dates: payload.dates,
        prices,
        returns,
        volumes: Array.isArray(payload.volumes) && payload.volumes.length === payload.dates.length
          ? payload.volumes
          : new Array(payload.dates.length).fill(0),
      };
    }
  } catch (e) {
    logger.warn(`[backtestDataService] kline 不可用，诚实降级: ${symbol}`, e);
    series = emptySeries(symbol);
  }

  seriesCache.set(key, { series, timestamp: Date.now() });
  return series;
}

/**
 * 受限并发批量取数。返回 symbol → HistorySeries（不可用的标的为诚实空序列）。
 */
export async function getBatchHistory(
  symbols: string[],
  days: number = 250,
  concurrency: number = 4,
): Promise<Record<string, HistorySeries>> {
  const result: Record<string, HistorySeries> = {};
  const queue = [...symbols];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const symbol = queue.shift()!;
      result[symbol] = await getHistorySeries(symbol, days);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, symbols.length)) }, () => worker());
  await Promise.all(workers);
  return result;
}

// ==================== 通用序列统计 ====================

/** 最近 n 个交易日累计收益；数据不足时用全部可用数据，空序列返回 0 */
export function trailingReturn(prices: number[], n: number): number {
  if (prices.length < 2) return 0;
  const end = prices[prices.length - 1];
  const startIdx = Math.max(0, prices.length - 1 - n);
  const start = prices[startIdx];
  return start !== 0 ? end / start - 1 : 0;
}

/** 日收益年化波动率；数据不足返回 0 */
export function annualizedVolatility(returns: number[]): number {
  const valid = returns.slice(1); // 跳过首日 0
  if (valid.length < 2) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((s, r) => s + (r - mean) ** 2, 0) / (valid.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

// ==================== 轮动引擎适配器 ====================

/** sectorRotationEngine.SectorData：{ name, returns, prices, volume }，全部来自真实序列 */
export function toSectorRotationInput(name: string, series: HistorySeries): RotationSectorData {
  return {
    name,
    returns: series.returns,
    prices: series.prices,
    volume: series.volumes,
  };
}

/**
 * sectorRotationV2Engine.SectorData。
 * momentum1M/3M/6M、volatility 由真实序列推导；
 * pe / dividendYield 非行情数据、当前无真实来源 → 置 0（引擎对 pe<=0 不给估值加分，属中性处理）。
 */
export function toSectorV2Input(name: string, series: HistorySeries): RotationV2SectorData {
  return {
    name,
    returns: series.returns,
    pe: 0,            // 占位：无真实估值来源，置 0 表示中性（不加分/不减分）
    dividendYield: 0, // 占位：同上
    momentum1M: trailingReturn(series.prices, 21),
    momentum3M: trailingReturn(series.prices, 63),
    momentum6M: trailingReturn(series.prices, 126),
    volatility: annualizedVolatility(series.returns),
  };
}

/**
 * industryRotationEngine2.IndustryData。
 * returns1m/3m/6m/12m、volatility、momentum、meanReversion 由真实序列推导；
 * pePercentile / earningsRevision / fundFlow 无真实来源 → 中性占位（0.5 / 0 / 0），
 * 对所有行业一致，不影响相对排名的方向性结论。
 */
export function toIndustryRotationInput(name: string, series: HistorySeries): IndustryData {
  const r1m = trailingReturn(series.prices, 21);
  const r3m = trailingReturn(series.prices, 63);
  const r6m = trailingReturn(series.prices, 126);
  const r12m = trailingReturn(series.prices, 252);
  return {
    name,
    returns1m: r1m,
    returns3m: r3m,
    returns6m: r6m,
    returns12m: r12m,
    volatility: annualizedVolatility(series.returns),
    pePercentile: 0.5,     // 占位：无估值来源，中性
    earningsRevision: 0,   // 占位：无盈利预测来源，中性
    fundFlow: 0,           // 占位：无资金流向来源，中性
    momentum: (r1m * 0.4 + r3m * 0.3 + r6m * 0.2 + r12m * 0.1) * 100,
    meanReversion: -r1m * 100, // 短期反转得分，由真实收益推导
  };
}

/**
 * sectorMomentumRotationEngine.SectorData。
 * returns（d1/d5/d10/d20/d60，单位 %）与 volume 由真实序列推导；
 * breadth 用近 20 日上涨天数占比（真实推导的宽度代理）；
 * constituents / advancing / declining 单序列无法得知 → 置 0。
 */
export function toMomentumSectorInput(name: string, code: string, series: HistorySeries): MomentumSectorData {
  const { prices, volumes, returns } = series;
  const lastVol = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
  const recent20Vol = volumes.slice(-20);
  const avg20 = recent20Vol.length > 0
    ? recent20Vol.reduce((a, b) => a + b, 0) / recent20Vol.length
    : 0;
  const upDays = returns.slice(-20).filter((r) => r > 0).length;
  const breadthWindow = Math.min(returns.length - 1, 20);

  return {
    name,
    code,
    returns: {
      d1: trailingReturn(prices, 1) * 100,
      d5: trailingReturn(prices, 5) * 100,
      d10: trailingReturn(prices, 10) * 100,
      d20: trailingReturn(prices, 20) * 100,
      d60: trailingReturn(prices, 60) * 100,
    },
    volume: {
      current: lastVol,
      avg20,
      change: avg20 > 0 ? (lastVol / avg20 - 1) * 100 : 0,
    },
    breadth: breadthWindow > 0 ? upDays / breadthWindow : 0,
    constituents: 0, // 占位：成分股数量无真实来源
    advancing: 0,    // 占位：同上
    declining: 0,    // 占位：同上
  };
}

// ==================== 横截面因子数据集构建 ====================

function computeFactorValue(kind: PriceDerivedFactorKind, prices: number[], volumes: number[], idx: number, lookback: number): number | null {
  if (idx < lookback) return null;
  const start = prices[idx - lookback];
  const end = prices[idx];
  if (start === 0) return null;
  const mom = end / start - 1;

  switch (kind) {
    case 'momentum':
      return mom;
    case 'reversal':
      return -mom;
    case 'volatility': {
      let sum = 0;
      let sumSq = 0;
      let cnt = 0;
      for (let i = idx - lookback + 1; i <= idx; i++) {
        const prev = prices[i - 1];
        if (prev === 0) continue;
        const r = prices[i] / prev - 1;
        sum += r;
        sumSq += r * r;
        cnt++;
      }
      if (cnt < 2) return null;
      const mean = sum / cnt;
      return Math.sqrt(Math.max(0, sumSq / cnt - mean * mean));
    }
    case 'volumeRatio': {
      const recent = volumes.slice(idx - lookback + 1, idx + 1);
      const earlier = volumes.slice(Math.max(0, idx - lookback * 2 + 1), idx - lookback + 1);
      if (recent.length === 0 || earlier.length === 0) return null;
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgEarlier = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      return avgEarlier > 0 ? avgRecent / avgEarlier : null;
    }
    default:
      return null;
  }
}

/**
 * 由批量真实序列构建横截面因子样本（引擎无关中间形状）。
 * 仅使用 dataSource='real' 的序列；每隔 step 个交易日采样一次，
 * factorValue 由 kind 决定（全部为价格/成交量真实推导），forwardReturn 为未来 horizon 日收益。
 */
export function buildCrossSectionalRows(
  batch: Record<string, HistorySeries>,
  options: CrossSectionalOptions = {},
): CrossSectionalRow[] {
  const { lookback = 20, horizon = 10, step = 10, kind = 'momentum' } = options;
  const rows: CrossSectionalRow[] = [];

  for (const series of Object.values(batch)) {
    if (series.dataSource !== 'real') continue;
    const { dates, prices, volumes } = series;
    for (let idx = lookback; idx + horizon < prices.length; idx += step) {
      const factorValue = computeFactorValue(kind, prices, volumes, idx, lookback);
      if (factorValue === null || !Number.isFinite(factorValue)) continue;
      const base = prices[idx];
      if (base === 0) continue;
      rows.push({
        date: dates[idx],
        symbol: series.symbol,
        factorValue,
        forwardReturn: prices[idx + horizon] / base - 1,
      });
    }
  }

  return rows;
}

/** quantFactorBacktestEngine.FactorData：{ date, stock, factorValue, forwardReturn } */
export function buildQuantFactorData(
  batch: Record<string, HistorySeries>,
  options: CrossSectionalOptions = {},
): QuantFactorData[] {
  return buildCrossSectionalRows(batch, options).map((r) => ({
    date: r.date,
    stock: r.symbol,
    factorValue: r.factorValue,
    forwardReturn: r.forwardReturn,
  }));
}

/** factorICEngine.FactorData：{ date, ticker, factorValue, nextReturn } */
export function buildICFactorData(
  batch: Record<string, HistorySeries>,
  options: CrossSectionalOptions = {},
): ICFactorData[] {
  return buildCrossSectionalRows(batch, options).map((r) => ({
    date: r.date,
    ticker: r.symbol,
    factorValue: r.factorValue,
    nextReturn: r.forwardReturn,
  }));
}

/**
 * factorMiningEngine 横截面快照：最近一个可计算截面的因子暴露 + 下一期实现收益。
 * 返回 null 表示真实数据不足（诚实降级）。
 */
export function buildFactorMiningSnapshot(
  batch: Record<string, HistorySeries>,
  factorName: string = 'momentum20',
  lookback: number = 20,
  horizon: number = 10,
): { factor: MiningFactorData; returns: { stockCode: string; return: number }[] } | null {
  const values: { stockCode: string; value: number }[] = [];
  const returns: { stockCode: string; return: number }[] = [];
  let latestDate = '';

  for (const series of Object.values(batch)) {
    if (series.dataSource !== 'real') continue;
    const { prices, volumes, dates } = series;
    const idx = prices.length - 1 - horizon;
    if (idx < lookback) continue;
    const factorValue = computeFactorValue('momentum', prices, volumes, idx, lookback);
    if (factorValue === null || !Number.isFinite(factorValue)) continue;
    const base = prices[idx];
    if (base === 0) continue;
    values.push({ stockCode: series.symbol, value: factorValue });
    returns.push({ stockCode: series.symbol, return: prices[idx + horizon] / base - 1 });
    if (dates[idx] > latestDate) latestDate = dates[idx];
  }

  if (values.length < 3) return null;

  return {
    factor: {
      name: factorName,
      values,
      date: latestDate,
      category: 'momentum',
    },
    returns,
  };
}

// ==================== 多因子选股 / 归因适配器 ====================

/**
 * multiFactorEngine.StockFactors：因子值全部由真实序列推导
 * （mom20/mom60/rev5/vol20/liq20=近20日均量）。
 */
export function toMultiFactorStocks(
  batch: Record<string, HistorySeries>,
  names: Record<string, string> = {},
): StockFactors[] {
  const stocks: StockFactors[] = [];
  for (const series of Object.values(batch)) {
    if (series.dataSource !== 'real' || series.prices.length < 2) continue;
    const recent20Vol = series.volumes.slice(-20);
    stocks.push({
      symbol: series.symbol,
      name: names[series.symbol] || series.symbol,
      factors: {
        mom20: trailingReturn(series.prices, 20),
        mom60: trailingReturn(series.prices, 60),
        rev5: -trailingReturn(series.prices, 5),
        vol20: annualizedVolatility(series.returns.slice(-21)),
        liq20: recent20Vol.length > 0
          ? recent20Vol.reduce((a, b) => a + b, 0) / recent20Vol.length
          : 0,
      },
      timestamp: Date.now(),
    });
  }
  return stocks;
}

/**
 * factorAttributionEngine 输入：个股收益序列 + 由真实序列构成的因子收益集。
 * factorSeries 的键即因子名（如 Market / SizeProxy），值为该因子组合的收益序列。
 */
export function toAttributionInput(
  stockSeries: HistorySeries,
  factorSeries: Record<string, HistorySeries>,
): { stockReturns: number[]; factors: Record<string, number[]> } {
  const factors: Record<string, number[]> = {};
  for (const [name, s] of Object.entries(factorSeries)) {
    factors[name] = s.returns;
  }
  return { stockReturns: stockSeries.returns, factors };
}

// ==================== 默认股票池 ====================

/**
 * 因子横截面默认股票池（流动性较好的 A 股样本，仅作为取数清单，不含任何行情数值）。
 */
export const DEFAULT_FACTOR_UNIVERSE: string[] = [
  '600519', '601318', '600036', '000858', '601899',
  '600900', '600030', '000333', '600276', '601012',
  '600585', '000063', '601857', '600028', '601088',
  '600050', '601601', '600887', '000001', '600000',
];
