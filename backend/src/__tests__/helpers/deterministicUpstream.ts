/**
 * 确定性上游桩（test-only）
 *
 * 存在理由：本目录下的路由/契约测试要验证的是「路由是否注册 + HTTP 方法 +
 * 状态码 + dataSource 诚实契约」，**不是**「东财此刻返回了什么」。
 * 真实上游会随网络环境漂移——`push2.eastmoney.com` 在部分网络下直接
 * 不可达（HTTP 000 / 连接失败），于是同一份断言在 CI 上随机红。
 * 上游数据的正确性由各自的 service 层测试负责（那些已mock）。
 *
 * 三条纪律：
 * 1. **任何 URL 都必须在本桩登记**；未登记 → 立即抛错，绝不静默打真实网络。
 *    新增上游依赖时，测试会立刻炸响，而不是悄悄变成联网测试。
 * 2. **返回值完全确定**：固定基准日 + 种子化 PRNG（mulberry32，种子取自
 *    股票代码）+ 每股显式 profile。同一 symbol 每次运行结果逐字节一致，
 *    不含 Date.now() / Math.random()。
 * 3. **三源自洽**：quote 的最新价与涨跌幅直接取自该股 K 线末根，
 *    财务 ROE/增速取自同一 profile —— 不会互相矛盾。
 */

import { vi } from 'vitest';

// ==================== 确定性伪随机（种子化，非 Math.random） ====================

/** mulberry32：32 位种子 → [0,1) 均匀分布。同一 seed 序列恒定。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由 6 位代码生成稳定种子。 */
function seedOf(code: string): number {
  let h = 2166136261;
  for (const ch of code) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ==================== 每股画像 ====================

export interface StubProfile {
  /** 6 位代码，作为 profile 主键 */
  code: string;
  /** 基准价（元） */
  basePrice: number;
  /** 日均漂移（%），正=上行趋势 */
  trendPct: number;
  /** 最后一根 K 线的跳空涨幅（%）；0=无跳空 */
  lastJumpPct: number;
  /** 末根成交量相对基准的倍数；用于触发/不触发放量突破 */
  volMultiplier: number;
  /** 基准成交量（手） */
  baseVolume: number;
  /** 市盈率 */
  pe: number;
  /** 市净率 */
  pb: number;
  /** 总市值（元） */
  marketCap: number;
  /** 加权 ROE（%） */
  roe: number;
  /** 营收同比（%） */
  revenueGrowth: number;
  /** 归母净利同比（%） */
  profitGrowth: number;
}

/**
 * AI 观察池（api/ai-analysis.ts:AI_WATCHLIST）15 只龙头的显式画像。
 *
 * 画像意图（断言直接引用这些事实，故**不得随意改动数值**）：
 * - 绝大多数标的呈「震荡上行」→ RSI 落在中性区，预警列表干净，
 *   这样 `severity=high` 过滤结果才可预期（而非被 rsi_extreme 淹没）。
 * - `600900`(6xxxxx，涨停阈值 10%) 末根 +10.20% 且放量 3.2 倍
 *   → limit_up(**high**) + breakout(medium)，是 high 过滤的唯一命中项。
 * - `601012` 单边连续下跌 → RSI(14) 进入超卖区 → rsi_extreme(medium)。
 */
export const PROFILES: StubProfile[] = [
  { code: '600519', basePrice: 1500, trendPct: 0.35, lastJumpPct: 0, volMultiplier: 1, baseVolume: 32000, pe: 28.4, pb: 8.1, marketCap: 1.88e12, roe: 31.5, revenueGrowth: 15.2, profitGrowth: 14.8 },
  { code: '000858', basePrice: 140, trendPct: 0.28, lastJumpPct: 0, volMultiplier: 1, baseVolume: 28000, pe: 18.6, pb: 3.9, marketCap: 5.44e11, roe: 24.8, revenueGrowth: 11.4, profitGrowth: 12.1 },
  { code: '300750', basePrice: 210, trendPct: 0.42, lastJumpPct: 0, volMultiplier: 1, baseVolume: 26000, pe: 22.1, pb: 4.2, marketCap: 9.24e11, roe: 22.3, revenueGrowth: 18.6, profitGrowth: 20.4 },
  { code: '002594', basePrice: 260, trendPct: 0.18, lastJumpPct: 0, volMultiplier: 1, baseVolume: 24000, pe: 19.3, pb: 3.4, marketCap: 7.58e11, roe: 18.9, revenueGrowth: 9.7, profitGrowth: 8.2 },
  { code: '601318', basePrice: 48, trendPct: 0.08, lastJumpPct: 0, volMultiplier: 1, baseVolume: 88000, pe: 8.2, pb: 0.9, marketCap: 8.74e11, roe: 11.2, revenueGrowth: 6.3, profitGrowth: 28.9 },
  { code: '600036', basePrice: 35, trendPct: 0.22, lastJumpPct: 0, volMultiplier: 1, baseVolume: 76000, pe: 6.4, pb: 0.8, marketCap: 8.83e11, roe: 13.7, revenueGrowth: 4.8, profitGrowth: 1.9 },
  { code: '000333', basePrice: 68, trendPct: 0.25, lastJumpPct: 0, volMultiplier: 1, baseVolume: 31000, pe: 13.7, pb: 2.6, marketCap: 4.85e11, roe: 23.4, revenueGrowth: 7.6, profitGrowth: 9.1 },
  { code: '002415', basePrice: 31, trendPct: -0.05, lastJumpPct: 0, volMultiplier: 1, baseVolume: 42000, pe: 21.5, pb: 3.1, marketCap: 2.87e11, roe: 14.6, revenueGrowth: 3.1, profitGrowth: -2.4 },
  { code: '688981', basePrice: 88, trendPct: 0.48, lastJumpPct: 0, volMultiplier: 1, baseVolume: 29000, pe: 82.4, pb: 5.2, marketCap: 6.96e11, roe: 6.8, revenueGrowth: 22.7, profitGrowth: 16.4 },
  { code: '601012', basePrice: 18, trendPct: -0.55, lastJumpPct: 0, volMultiplier: 1, baseVolume: 68000, pe: 35.2, pb: 1.9, marketCap: 1.28e12, roe: 3.1, revenueGrowth: -21.5, profitGrowth: -46.8 },
  { code: '002475', basePrice: 42, trendPct: 0.3, lastJumpPct: 0, volMultiplier: 1, baseVolume: 36000, pe: 24.8, pb: 3.3, marketCap: 3.06e11, roe: 16.4, revenueGrowth: 13.2, profitGrowth: 15.7 },
  { code: '603259', basePrice: 55, trendPct: 0.02, lastJumpPct: 0, volMultiplier: 1, baseVolume: 27000, pe: 26.1, pb: 3.7, marketCap: 1.58e12, roe: 12.7, revenueGrowth: -3.4, profitGrowth: -9.6 },
  { code: '601888', basePrice: 72, trendPct: -0.12, lastJumpPct: 0, volMultiplier: 1, baseVolume: 22000, pe: 31.5, pb: 3.0, marketCap: 1.37e12, roe: 8.9, revenueGrowth: -8.2, profitGrowth: -14.3 },
  { code: '300059', basePrice: 22, trendPct: 0.12, lastJumpPct: 0, volMultiplier: 1, baseVolume: 120000, pe: 38.9, pb: 2.8, marketCap: 1.66e12, roe: 9.4, revenueGrowth: 5.2, profitGrowth: 7.8 },
  { code: '600900', basePrice: 28, trendPct: 0.2, lastJumpPct: 10.2, volMultiplier: 3.2, baseVolume: 54000, pe: 21.3, pb: 2.7, marketCap: 6.87e11, roe: 14.2, revenueGrowth: 6.9, profitGrowth: 8.8 },
];

/** 未登记代码的兜底画像（确定性，仍非随机）。 */
function fallbackProfile(code: string): StubProfile {
  const rnd = mulberry32(seedOf(code));
  const basePrice = +(10 + rnd() * 90).toFixed(2);
  return {
    code,
    basePrice,
    trendPct: +((rnd() - 0.4) * 0.8).toFixed(4),
    lastJumpPct: 0,
    volMultiplier: 1,
    baseVolume: 20000 + Math.floor(rnd() * 60000),
    pe: +(6 + rnd() * 40).toFixed(2),
    pb: +(0.5 + rnd() * 5).toFixed(2),
    marketCap: Math.floor((1e10 + rnd() * 1e12) / 1e8) * 1e8,
    roe: +(2 + rnd() * 25).toFixed(2),
    revenueGrowth: +((rnd() - 0.45) * 40).toFixed(2),
    profitGrowth: +((rnd() - 0.45) * 50).toFixed(2),
  };
}

export function profileOf(code: string): StubProfile {
  return PROFILES.find((p) => p.code === code) ?? fallbackProfile(code);
}

// ==================== K 线序列（K 线为源，行情由它派生） ====================

/** 固定基准日：2026-01-05T00:00:00Z。用常量而非 new Date()，避免跨日漂移。 */
const BASE_DAY_MS = Date.UTC(2026, 0, 5, 0, 0, 0);
const KLINE_DAYS = 60; // ≥26，满足 MACD；≥21，满足 MA20 / 20 日均量

/**
 * 叠加在漂移之上的确定性波段：振幅 1.1%、周期 8 个交易日。
 *
 * 为什么需要它：RSI(14) 只看最近 15 根 K 线的涨跌。若一条**单调上行**的序列，
 * 14 连涨 → avgLoss≈0 → RSI=100 → 触发 rsi_extreme 超买预警，
 * 于是「稳定上行」的样本反而全被预警淹没，alerts 的 high 过滤结果不可预期。
 * 叠加一个短周期波段后，上涨趋势中每 8 天有一次回撤，
 * RSI 稳定落在中性区（约 40~60），预警列表只反映真正的异动。
 * 用sin 而非随机数，保证逐次运行完全一致。
 */
const WAVE_AMPLITUDE_PCT = 1.1;
const WAVE_PERIOD_DAYS = 8;

export interface StubKline {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  changePercent: number;
}

function dateAt(i: number): string {
  const d = new Date(BASE_DAY_MS + i * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 生成一只股票确定性的 60 日日K。末根按 profile 的 jump / 放量规则收尾。 */
export function klineOf(profile: StubProfile): StubKline[] {
  const rnd = mulberry32(seedOf(profile.code));
  const rows: StubKline[] = [];
  let prevClose = profile.basePrice;

  for (let i = 0; i < KLINE_DAYS; i++) {
    const isLast = i === KLINE_DAYS - 1;
    // 噪声 ±0.15%（种子化）+ 8 日周期波段；末根改用 profile.lastJumpPct
    const noise = (rnd() - 0.5) * 0.3;
    const wave = WAVE_AMPLITUDE_PCT * Math.sin((2 * Math.PI * i) / WAVE_PERIOD_DAYS);
    const pct = isLast ? profile.lastJumpPct : profile.trendPct + noise + wave;
    const open = prevClose;
    const close = +(open * (1 + pct / 100)).toFixed(2);
    const high = +(Math.max(open, close) * (1 + rnd() * 0.004)).toFixed(2);
    const low = +(Math.min(open, close) * (1 - rnd() * 0.004)).toFixed(2);
    const volume = Math.round(
      profile.baseVolume * (0.75 + rnd() * 0.5) * (isLast ? profile.volMultiplier : 1)
    );
    rows.push({ date: dateAt(i), open, close, high, low, volume, changePercent: +pct.toFixed(2) });
    prevClose = close;
  }
  return rows;
}

/** 东财 klines 行格式：日期,开,收,高,低,成交量(手),成交额(元),振幅,涨跌幅,涨跌额,换手率 */
function toEastmoneyKlineRows(rows: StubKline[]): string[] {
  return rows.map((r) => {
    const amplitude = +(((r.high - r.low) / r.open) * 100).toFixed(2);
    const changeAmount = +(r.close - r.open).toFixed(2);
    const turnover = 0.5;
    return [
      r.date, r.open, r.close, r.high, r.low, r.volume,
      +(r.volume * r.close).toFixed(2), amplitude, r.changePercent, changeAmount, turnover,
    ].join(',');
  });
}

// ==================== URL → 应答 ====================

/** 从 push2 secid（1.600519 / 0.000858）或东财 filter 里的 SECUCODE="600519.SH" 提取 6 位代码。 */
function extractCode(url: string): string | null {
  const secid = /[?&]secid=([01])\.(\d{6})/.exec(url);
  if (secid) return secid[2];
  const secucode = /SECUCODE="?(\d{6})\./i.exec(url) || /SECUCODE="?(\d{6})"?/i.exec(url);
  if (secucode) return secucode[1];
  return null;
}

/** push2 stock/get：f2=最新价×1000, f3=涨跌幅×100, f5=成交量, f6=成交额, f9=PE×100, f23=PB×100, f20=总市值 */
function stockGetPayload(code: string) {
  const p = profileOf(code);
  const last = klineOf(p).slice(-1)[0];
  return {
    rc: 0,
    data: {
      f12: code,
      f14: `TEST-${code}`, // 桩数据自带标记，杜绝与真实行情混淆
      f2: Math.round(last.close * 1000),
      f3: Math.round(last.changePercent * 100),
      f5: last.volume,
      f6: Math.round(last.volume * last.close),
      f9: Math.round(p.pe * 100),
      f23: Math.round(p.pb * 100),
      f20: p.marketCap,
    },
  };
}

/** datacenter-web RPT_LICO_FN_CPD：主要财务指标（本桩只需年报行，service侧 type='annual' 会过滤）。 */
function financialsPayload(code: string) {
  const p = profileOf(code);
  return {
    version: 'test-stub',
    result: {
      pages: 1,
      data: [
        {
          SECURITY_CODE: code,
          SECURITY_NAME_ABBR: `TEST-${code}`,
          REPORTDATE: '2025-12-31 00:00:00',
          DATEMMDD: '年报',
          DATATYPE: '2025年年报',
          DATAYEAR: '2025',
          TOTAL_OPERATE_INCOME: Math.round(p.marketCap / Math.max(p.pe, 1)),
          PARENT_NETPROFIT: Math.round((p.marketCap / Math.max(p.pe, 1)) * (p.profitGrowth + 20) / 100),
          BASIC_EPS: 2.5,
          DEDUCT_BASIC_EPS: 2.4,
          WEIGHTAVG_ROE: p.roe,
          BPS: +(p.basePrice / Math.max(p.pb, 0.01)).toFixed(2),
          MGJYXJJE: 1.8,
          XSMLL: 45.6,
          YSTZ: p.revenueGrowth,
          SJLTZ: p.profitGrowth,
          ZXGXL: 2.1,
        },
      ],
    },
  };
}

function jsonResponse(payload: unknown) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

/** 本 stub 已应答过的 URL（用于「零未登记上游」自证）。 */
export const servedUrls: string[] = [];
/** 试图打到本 stub 但未登记的 URL —— 非空即说明有新的外部依赖。 */
export const unstubbedUrls: string[] = [];

/**
 * 构造 fetch 桩。命中已登记端点 → 确定性应答；
 * 未登记 → 记入 unstubbedUrls 并抛错（绝不回落真实网络）。
 */
export function makeStubFetch(): typeof fetch {
  return vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input);

    if (url.includes('push2his.eastmoney.com/api/qt/stock/kline/get')) {
      const code = extractCode(url);
      if (!code) { unstubbedUrls.push(url); throw new Error(`[stub] 无法解析 secid: ${url}`); }
      servedUrls.push(url);
      return jsonResponse({ rc: 0, data: { code, name: `TEST-${code}`, klines: toEastmoneyKlineRows(klineOf(profileOf(code))) } });
    }

    if (url.includes('push2.eastmoney.com/api/qt/stock/get')) {
      const code = extractCode(url);
      if (!code) { unstubbedUrls.push(url); throw new Error(`[stub] 无法解析 secid: ${url}`); }
      servedUrls.push(url);
      return jsonResponse(stockGetPayload(code));
    }

    if (url.includes('datacenter-web.eastmoney.com/api/data/v1/get')) {
      if (!url.includes('reportName=RPT_LICO_FN_CPD')) {
        unstubbedUrls.push(url);
        throw new Error(`[stub] 未登记的 reportName: ${url}`);
      }
      const code = extractCode(url);
      if (!code) { unstubbedUrls.push(url); throw new Error(`[stub] 无法解析 SECUCODE: ${url}`); }
      servedUrls.push(url);
      return jsonResponse(financialsPayload(code));
    }

    unstubbedUrls.push(url);
    throw new Error(`[stub] 拒绝未登记的上游调用（防止测试偷偷联网）: ${url}`);
  }) as unknown as typeof fetch;
}

/** 安装 fetch 桩（整个文件生效）。 */
export function installUpstreamStub(): void {
  vi.stubGlobal('fetch', makeStubFetch());
}

/** 卸载 fetch 桩。 */
export function uninstallUpstreamStub(): void {
  vi.unstubAllGlobals();
}

/** @returns 未登记上游调用列表（应为空数组）。 */
export function unstubbedUpstreamCalls(): string[] {
  return [...unstubbedUrls];
}

/** @returns 本 stub 已应答的调用数（用于证明 mock 确实被走到，而非绕开）。 */
export function servedCallCount(): number {
  return servedUrls.length;
}

export function resetStubCounters(): void {
  servedUrls.length = 0;
  unstubbedUrls.length = 0;
}