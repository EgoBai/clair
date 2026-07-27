/**
 * 技术指标计算工具
 * 纯函数 / 无外部依赖 / 数据不足时返回 undefined 字段
 * 计算全部 11 个指标: MACD / KDJ / RSI / BOLL / VWAP / OBV / ADX(DMI) / CCI / W%R / BIAS / ATR
 *
 * 返回类型复用 components/Charts/IndicatorPanel 的 IndicatorPoint (type-only import, 零运行时成本)
 */

import type { IndicatorPoint } from '../components/Charts/IndicatorPanel';

export interface IndicatorInput {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ===================== 通用工具函数 =====================

/** 简单移动平均, 数据不足返回 null */
function sma(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const res: (number | null)[] = new Array(n).fill(null);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period - 1) {
      res[i] = sum / period;
      sum -= values[i - period + 1];
    }
  }
  return res;
}

/** 指数移动平均 (EMA), 前 period-1 个返回 null */
function ema(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const res: (number | null)[] = new Array(n).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      res[i] = null;
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[i - j];
      prev = sum / period;
      res[i] = prev;
    } else {
      prev = (values[i] - prev!) * k + prev!;
      res[i] = prev;
    }
  }
  return res;
}

/** Wilder 平滑 (RMA): 先取首个 period 窗口均值, 之后递归 (period-1)*prev + cur)/period */
function wilder(arr: (number | null)[], period: number): (number | null)[] {
  const n = arr.length;
  const res: (number | null)[] = new Array(n).fill(null);
  let sum = 0;
  let count = 0;
  let i = 0;
  for (; i < n; i++) {
    const v = arr[i];
    if (v === null || v === undefined) { count = 0; sum = 0; continue; }
    sum += v;
    count++;
    if (count === period) {
      res[i] = sum / period;
      break;
    }
  }
  let prev = res[i] as number | null;
  if (prev === null) return res;
  for (let j = i + 1; j < n; j++) {
    const v = arr[j];
    if (v === null || v === undefined) {
      res[j] = prev;
      continue;
    }
    prev = (prev! * (period - 1) + v) / period;
    res[j] = prev;
  }
  return res;
}

// ===================== 各指标计算 =====================

/** MACD 12/26/9 */
function calcMACD(closes: number[]): { dif: (number | null)[]; dea: (number | null)[]; macd: (number | null)[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const n = closes.length;
  const dif: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      dif[i] = +(ema12[i]! - ema26[i]!).toFixed(4);
    }
  }
  const dea = ema(dif.map(v => v ?? 0), 9).map((v, i) => (dif[i] === null ? null : v));
  const macd: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dif[i] !== null && dea[i] !== null) {
      macd[i] = +((dif[i]! - dea[i]!) * 2).toFixed(4);
    }
  }
  return { dif, dea, macd };
}

/** KDJ 9 */
function calcKDJ(highs: number[], lows: number[], closes: number[]): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const n = closes.length;
  const K: (number | null)[] = new Array(n).fill(null);
  const D: (number | null)[] = new Array(n).fill(null);
  const J: (number | null)[] = new Array(n).fill(null);
  let prevK = 50;
  let prevD = 50;
  const period = 9;
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    let hh = highs[i];
    let ll = lows[i];
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    const j = 3 * k - 2 * d;
    prevK = k; prevD = d;
    K[i] = +k.toFixed(4);
    D[i] = +d.toFixed(4);
    J[i] = +j.toFixed(4);
  }
  return { k: K, d: D, j: J };
}

/** RSI (Wilder), 支持多周期 */
function calcRSI(closes: number[], period: number): (number | null)[] {
  const n = closes.length;
  const res: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return res;
  let gain = 0;
  let loss = 0;
  for (let j = 1; j <= period; j++) {
    const ch = closes[j] - closes[j - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  res[period] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(4);
  for (let j = period + 1; j < n; j++) {
    const ch = closes[j] - closes[j - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    res[j] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(4);
  }
  return res;
}

/** BOLL 20/2 */
function calcBOLL(closes: number[]): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const n = closes.length;
  const period = 20;
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (middle[i] === null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(closes[j] - middle[i]!, 2);
    }
    const std = Math.sqrt(sumSq / period);
    upper[i] = +(middle[i]! + 2 * std).toFixed(4);
    lower[i] = +(middle[i]! - 2 * std).toFixed(4);
  }
  return { upper, middle, lower };
}

/** VWAP 累计 (典型价 = (H+L+C)/3) */
function calcVWAP(highs: number[], lows: number[], closes: number[], vols: number[]): (number | null)[] {
  const n = closes.length;
  const res: (number | null)[] = new Array(n).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumPV += tp * vols[i];
    cumV += vols[i];
    res[i] = cumV > 0 ? +(cumPV / cumV).toFixed(4) : null;
  }
  return res;
}

/** OBV 能量潮 */
function calcOBV(closes: number[], vols: number[]): (number | null)[] {
  const n = closes.length;
  const res: (number | null)[] = new Array(n).fill(null);
  let obv = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      if (closes[i] > closes[i - 1]) obv += vols[i];
      else if (closes[i] < closes[i - 1]) obv -= vols[i];
    }
    res[i] = obv;
  }
  return res;
}

/** ADX / +DI / -DI (DMI, 14) */
function calcADX(highs: number[], lows: number[], closes: number[]): { adx: (number | null)[]; pdi: (number | null)[]; mdi: (number | null)[] } {
  const n = highs.length;
  const period = 14;
  const tr: (number | null)[] = new Array(n).fill(null);
  const pdm = new Array(n).fill(0);
  const mdm = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
    } else {
      const up = highs[i] - highs[i - 1];
      const down = lows[i - 1] - lows[i];
      pdm[i] = up > down && up > 0 ? up : 0;
      mdm[i] = down > up && down > 0 ? down : 0;
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(highs[i] - lows[i], hc, lc);
    }
  }
  const atr14 = wilder(tr, period);
  const pdm14 = wilder(pdm, period);
  const mdm14 = wilder(mdm, period);
  const pdi: (number | null)[] = new Array(n).fill(null);
  const mdi: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (atr14[i] !== null && atr14[i]! > 0 && pdm14[i] !== null && mdm14[i] !== null) {
      const p = (100 * pdm14[i]!) / atr14[i]!;
      const m = (100 * mdm14[i]!) / atr14[i]!;
      pdi[i] = +p.toFixed(4);
      mdi[i] = +m.toFixed(4);
      dx[i] = +((100 * Math.abs(p - m)) / (p + m)).toFixed(4);
    }
  }
  const adx = wilder(dx, period);
  return { adx, pdi, mdi };
}

/** CCI 14 (典型价) */
function calcCCI(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const res: (number | null)[] = new Array(n).fill(null);
  const tp = closes.map((_, i) => (highs[i] + lows[i] + closes[i]) / 3);
  for (let i = period - 1; i < n; i++) {
    let ma = 0;
    for (let j = i - period + 1; j <= i; j++) ma += tp[j];
    ma /= period;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j] - ma);
    md /= period;
    res[i] = md === 0 ? 0 : +((tp[i] - ma) / (0.015 * md)).toFixed(4);
  }
  return res;
}

/** W%R 14 (威廉指标, 取值 -100~0) */
function calcWR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const res: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hh = highs[i];
    let ll = lows[i];
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    res[i] = hh === ll ? 0 : +(-100 * (hh - closes[i]) / (hh - ll)).toFixed(4);
  }
  return res;
}

/** BIAS 乖离率 (多周期) */
function calcBIAS(closes: number[], period: number): (number | null)[] {
  const n = closes.length;
  const middle = sma(closes, period);
  const res: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (middle[i] !== null && middle[i] !== 0) {
      res[i] = +(((closes[i] - middle[i]!) / middle[i]!) * 100).toFixed(4);
    }
  }
  return res;
}

/** ATR 14 (Wilder) */
function calcATR(highs: number[], lows: number[], closes: number[]): (number | null)[] {
  const n = highs.length;
  const period = 14;
  const tr: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = highs[i] - lows[i];
    } else {
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(highs[i] - lows[i], hc, lc);
    }
  }
  return wilder(tr, period).map(v => (v === null ? null : +v.toFixed(4)));
}

// ===================== 主入口 =====================

export function computeIndicatorSeries(kline: IndicatorInput[]): IndicatorPoint[] {
  const n = kline.length;
  const opens = kline.map(k => k.open);
  const highs = kline.map(k => k.high);
  const lows = kline.map(k => k.low);
  const closes = kline.map(k => k.close);
  const vols = kline.map(k => k.volume);

  const macd = calcMACD(closes);
  const kdj = calcKDJ(highs, lows, closes);
  const rsi6 = calcRSI(closes, 6);
  const rsi12 = calcRSI(closes, 12);
  const rsi24 = calcRSI(closes, 24);
  const boll = calcBOLL(closes);
  const vwap = calcVWAP(highs, lows, closes, vols);
  const obv = calcOBV(closes, vols);
  const adx = calcADX(highs, lows, closes);
  const cci = calcCCI(highs, lows, closes, 14);
  const wr = calcWR(highs, lows, closes, 14);
  const bias6 = calcBIAS(closes, 6);
  const bias12 = calcBIAS(closes, 12);
  const bias24 = calcBIAS(closes, 24);
  const atr = calcATR(highs, lows, closes);

  const result: IndicatorPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = {
      date: kline[i].date,
      // MACD
      dif: macd.dif[i] ?? undefined,
      dea: macd.dea[i] ?? undefined,
      macd: macd.macd[i] ?? undefined,
      // KDJ
      k: kdj.k[i] ?? undefined,
      d: kdj.d[i] ?? undefined,
      j: kdj.j[i] ?? undefined,
      // RSI
      rsi6: rsi6[i] ?? undefined,
      rsi12: rsi12[i] ?? undefined,
      rsi24: rsi24[i] ?? undefined,
      // BOLL
      bollUpper: boll.upper[i] ?? undefined,
      bollMiddle: boll.middle[i] ?? undefined,
      bollLower: boll.lower[i] ?? undefined,
      // 新增 7 指标
      vwap: vwap[i] ?? undefined,
      obv: obv[i] ?? undefined,
      adx: adx.adx[i] ?? undefined,
      pdi: adx.pdi[i] ?? undefined,
      mdi: adx.mdi[i] ?? undefined,
      cci: cci[i] ?? undefined,
      wr: wr[i] ?? undefined,
      bias6: bias6[i] ?? undefined,
      bias12: bias12[i] ?? undefined,
      bias24: bias24[i] ?? undefined,
      atr: atr[i] ?? undefined,
    };
  }
  return result;
}

export default computeIndicatorSeries;
