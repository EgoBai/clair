/**
 * 财务因子序列服务（真实源版）
 *
 * 时序化四因子（每期年报）：
 *   - EP     = 每股收益(EPS) / 报告期收盘价
 *   - BP     = 每股净资产(BPS) / 报告期收盘价
 *   - ROE    = 净利润 / 净资产（东财主要指标 WEIGHTAVG_ROE，%口径）
 *   - growth = 营收同比 / 归母净利同比（东财主要指标 YSTZ / SJLTZ，%口径）
 *
 * 数据来源（东方财富，免 key）：
 *   - 财务侧：financialsDataService.getFinancialIndicators（RPT_LICO_FN_CPD，年报口径）
 *     直接披露 EPS / BPS / ROE / 营收 / 归母净利 / 营收同比 / 净利同比，均为三大报表汇总后的真实披露值。
 *   - 行情侧：klineDataService.getKline（push2his 日线收盘价，前复权），取各报告期对应的收盘价。
 *
 * 诚实红线：任一源不可达 / 无年报期 / 报告期无对应收盘价 → 抛 FactorSeriesUnavailableError，
 * 由路由层降级为 dataSource:'unavailable'，绝不回填随机 / 伪造因子值。
 */

import { getFinancialIndicators, FinancialsUnavailableError } from './financialsDataService';
import { getKline, KlineUnavailableError } from './klineDataService';

/** 真实财务因子序列源不可用时抛出，供路由层降级为「诚实空」。 */
export class FactorSeriesUnavailableError extends Error {
  constructor(msg = '财务因子序列真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'FactorSeriesUnavailableError';
  }
}

export interface FactorSeriesPeriod {
  /** 报告期（YYYY-MM-DD，升序） */
  date: string;
  /** EP = EPS / 报告期收盘价 */
  ep: number;
  /** BP = BPS / 报告期收盘价 */
  bp: number;
  /** ROE = 净利润 / 净资产（%） */
  roe: number;
  /** 营收同比（%） */
  revenueGrowth: number;
  /** 归母净利同比（%） */
  profitGrowth: number;
}

export interface FactorSeriesResult {
  symbol: string;
  /** 因子时序（升序） */
  periods: FactorSeriesPeriod[];
}

/** 有限数四舍五入；非有限数一律归 0（真实映射，非伪造） */
function fmt(v: number, digits: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? +n.toFixed(digits) : 0;
}

/**
 * 在升序收盘价序列中定位某报告期的收盘价：
 * 返回日期 <= reportDate 的最后一个交易日收盘价（报告期末前最近交易日收盘）。
 * 找不到（报告期早于 K 线覆盖范围）返回 null，由调用方诚实跳过该期。
 */
function closeAtOrBefore(dates: string[], prices: number[], reportDate: string): number | null {
  let best: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= reportDate) {
      best = prices[i];
    } else {
      break;
    }
  }
  return best;
}

/**
 * 获取个股财务因子序列（EP/BP/ROE/成长率）。
 * @param symbol 个股代码（600519 / 600519.SH / SH600519 等）
 * @param periods 年报期数（默认 8）
 * 任一真实源失败 / 无数据 → 抛 FactorSeriesUnavailableError（不伪造）。
 */
export async function getFactorSeries(symbol: string, periods: number = 8): Promise<FactorSeriesResult> {
  // 1. 财务指标（年报口径，报告期倒序）
  let indicators;
  try {
    indicators = await getFinancialIndicators(symbol, periods, 'annual');
  } catch (e) {
    if (e instanceof FinancialsUnavailableError) {
      throw new FactorSeriesUnavailableError(e.message);
    }
    throw new FactorSeriesUnavailableError(e instanceof Error ? e.message : '财务指标源不可用');
  }
  if (!Array.isArray(indicators) || indicators.length === 0) {
    throw new FactorSeriesUnavailableError(`未获取到 ${symbol} 的年报财务指标`);
  }

  // 2. 历史收盘价（尽量取最大窗口以覆盖更多年报期）
  let kline;
  try {
    kline = await getKline(symbol, 800);
  } catch (e) {
    if (e instanceof KlineUnavailableError) {
      throw new FactorSeriesUnavailableError(e.message);
    }
    throw new FactorSeriesUnavailableError(e instanceof Error ? e.message : 'K线源不可用');
  }

  const { dates, prices } = kline;

  // 3. 逐期推导（indicators 为倒序，先按倒序产出再翻转为升序）
  const out: FactorSeriesPeriod[] = [];
  for (const ind of indicators) {
    const close = closeAtOrBefore(dates, prices, ind.reportDate);
    if (close === null || close <= 0) continue; // 该期无对应收盘价 → 诚实跳过
    out.push({
      date: ind.reportDate,
      ep: fmt(ind.eps / close, 6),
      bp: fmt(ind.bps / close, 6),
      roe: fmt(ind.roe, 2),
      revenueGrowth: fmt(ind.revenueGrowth, 2),
      profitGrowth: fmt(ind.profitGrowth, 2),
    });
  }
  out.reverse(); // 升序

  if (out.length === 0) {
    throw new FactorSeriesUnavailableError(`未获取到 ${symbol} 可用的财务因子序列（报告期无对应收盘价）`);
  }

  return { symbol, periods: out };
}
