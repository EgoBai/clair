/**
 * 多因子实验室 — 确定性演示数据兜底（LCG 种子 20260726）
 *
 * 输出 factorICEngine 所需的 FactorData[]（每因子一组），用于 IC / 分层 / 衰减 / 合成分析。
 * 因子构造时注入不同「真实 IC 强度」：估值/质量因子较强、波动率为负向、换手率弱，
 * 使 IC 分析有明显区分度且完全可复现。
 */

import type { FactorData } from './factorICEngine';

const SEED = 20260726;
const N_STOCKS = 60;
const N_PERIODS = 24;

/** 线性同余发生器（与 northboundDemo 同款 LCG），保证可复现 */
function createLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const rng = createLCG(SEED);

/** Box-Muller 生成标准正态，用于构造连续型因子与噪声 */
function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 标准化为均值 0、方差 1，保证 IC 解释一致 */
function standardize(arr: number[]): number[] {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length) || 1;
  return arr.map((x) => (x - m) / sd);
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

export interface FactorMeta {
  key: string;
  cn: string;
  intensity: number; // 真实 IC 强度（含符号）
}

/** 8 个经典因子，intensity 决定其对实现收益的边际贡献 */
export const FACTORS: FactorMeta[] = [
  { key: 'EP', cn: '估值-EP', intensity: 0.050 },
  { key: 'BP', cn: '估值-BP', intensity: 0.045 },
  { key: 'GROWTH', cn: '成长-净利增速', intensity: 0.040 },
  { key: 'ROE', cn: '质量-ROE', intensity: 0.050 },
  { key: 'REV1M', cn: '动量-1月反转', intensity: 0.035 },
  { key: 'MOM3M', cn: '动量-3月', intensity: 0.030 },
  { key: 'VOL', cn: '波动率', intensity: -0.040 },
  { key: 'TURN', cn: '换手率', intensity: 0.012 },
];

const FACTOR_KEYS = FACTORS.map((f) => f.key);
const INTENSITY: Record<string, number> = Object.fromEntries(
  FACTORS.map((f) => [f.key, f.intensity]),
);

const DATES: string[] = Array.from(
  { length: N_PERIODS },
  (_, t) => `${2024 + Math.floor(t / 12)}-${pad((t % 12) + 1, 2)}`,
);
const TICKERS: string[] = Array.from(
  { length: N_STOCKS },
  (_, i) => `A${pad(i + 1, 3)}`,
);

// ── Pass 1：原始因子暴露（部分因子共享潜在维度以制造共线性） ──
const N = N_STOCKS * N_PERIODS;
const raw: Record<string, number[]> = {};
FACTOR_KEYS.forEach((k) => (raw[k] = new Array(N)));

let idx = 0;
for (let t = 0; t < N_PERIODS; t++) {
  for (let i = 0; i < N_STOCKS; i++) {
    const value = gauss();
    const qual = gauss();
    const mom = gauss();
    const vol = gauss();
    raw.EP[idx] = 0.9 * value + 0.45 * gauss();
    raw.BP[idx] = 0.8 * value + 0.55 * gauss(); // 与 EP 共享价值维度 → 高相关
    raw.ROE[idx] = 0.85 * qual + 0.5 * gauss();
    raw.GROWTH[idx] = 0.7 * qual + 0.6 * gauss(); // 与 ROE 共享质量维度
    raw.REV1M[idx] = -mom + 0.5 * gauss(); // 反转
    raw.MOM3M[idx] = 0.7 * mom + 0.6 * gauss(); // 与反转负相关
    raw.VOL[idx] = vol + 0.4 * gauss();
    raw.TURN[idx] = 0.5 * vol + 0.7 * gauss(); // 与波动率正相关
    idx++;
  }
}

// 标准化后叠加实现收益：R = Σ intensity·z + 噪声(σ=1)
const z: Record<string, number[]> = {};
FACTOR_KEYS.forEach((k) => (z[k] = standardize(raw[k])));
const returns: number[] = new Array(N);
for (let j = 0; j < N; j++) {
  let r = gauss(); // 噪声项
  for (let f = 0; f < FACTOR_KEYS.length; f++) r += INTENSITY[FACTOR_KEYS[f]] * z[FACTOR_KEYS[f]][j];
  returns[j] = r;
}

// ── 组装 FactorData：每因子一组，nextReturn 跨因子共享为同一实现收益 ──
// 诚实数据契约：因子时序数据由后端提供，当前未接入，保留空集合，页面自动展示空态。
export const factorLabData: Record<string, FactorData[]> = {};

// ── 因子衰减数据：lag 1-6 的 nextReturn 为未来 L 期累计收益 ──
// 同上，后端未接入，空集合。
export const factorDecayData: Record<string, Map<number, FactorData[]>> = {};
