/**
 * 宏观仪表盘 API
 *
 * 设计目标：
 *   - 提供与前端 MacroPage 对齐的 /api/macro/overview 契约
 *   - "core" 核心指标基于本地真实行情库合成；**值不可得时如实标注「不可用」
 *     而不是用 0 顶替**（P0-MACROCARDS）
 *   - "trend24" CPI/PPI 走势（真实源：东方财富数据中心）
 *     —— "rates" 利率 / "calendar" 宏观日历数据源未接入，诚实返回空数组
 *   - dataSource 字段按块标注（real / unavailable / partial），便于前端透明展示
 *
 * 后续数据源扩展点（占位）：
 *   - rates: SHIBOR / 央行 OMO / MLF
 *   - calendar: 新浪/东方财富 财经日历
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import { getMacroCpiPpi, MacroUnavailableError } from '../services/macroDataService';

const router = Router();

/** 带超时的 fetch（与 hkConnect/etf 风格保持一致） */
async function fetchJson(url: string, timeoutMs = 6000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 核心宏观情绪卡片
 *
 * 诚实红线（P0-MACROCARDS）：
 *   判据是「**卡片里的值是否真实**」，不是「core 数组是否非空」。此前
 *   buildCoreCards 恒返回 6 张卡片、且所有数值都被 `?? 0` 吞平，于是空库时
 *   `anyReal = core.length > 0` 恒为 true → dataSource:'partial'，
 *   输出 6 张 valueText 全为 "0" 的卡片——「数组非空所以过了有无数据判据，
 *   但每张卡片的值都是编造的」，比「无数据却声称 real」更隐蔽。
 *
 *   现在每张卡片带 `available` 标记，并区分两种 0：
 *     - available=false → 值不可得 → valueText:'不可用'、series:[]（不是全 0 数组）
 *     - available=true且值确实为 0 → 照实写 "0"（真实为 0 与查不到语义不同）
 *
 * series 一律来自真实历史（getMarketSummary 逐日回溯），**不再用
 * `[v-200, v-100, v-50, v]` 这类凭空造的斜坡**。
 */

/** 值不可得时的统一占位（区别于真实的 0） */
const UNAVAILABLE = '不可用';

type CoreCard = {
  label: string;
  unit: string;
  valueText: string;
  direction: 'up' | 'down' | 'flat';
  deltaText: string;
  /** 真实历史序列；不可得时为空数组（**绝不是全 0 数组**） */
  series: number[];
  /** 该卡片的值是否来自真实数据 */
  available: boolean;
};

type CoreCardsResult = {
  cards: CoreCard[];
  /** breadth（涨跌家数/成交额）是否真实可得 */
  hasBreadth: boolean;
  /** sectors（涨停/板块占比/板块均涨）是否真实可得 */
  hasSectors: boolean;
  /** 参与历史序列回溯的真实交易日（升序），供测试核对 */
  historyDates: string[];
};

/** 构造一张「值不可得」的卡片：valueText 不可用、series 空数组 */
function unavailableCard(label: string, unit: string): CoreCard {
  return {
    label,
    unit,
    valueText: UNAVAILABLE,
    direction: 'flat',
    deltaText: '—',
    series: [],
    available: false,
  };
}

/**
 * 按**本地时区**格式化为 YYYY-MM-DD。
 *不能用 toISOString()——本地午夜在 UTC+8 下会被折算成前一天，
 * 导致 historyDates 与真实交易日错位一天（实测 10-09 被标成 10-08）。
 */
function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 回溯最近 N 个真实交易日的市场汇总，得到真实 sparkline 序列。
 * 逐日调用 getMarketSummary（无行情日返回 null，直接跳过），
 * **不再伪造 `[v-200, v-100, v-50, v]` 之类的斜坡**。
 */
async function buildRealSeries(
  db: any,
  today: Date,
  picker: (s: any) => number | null,
  maxPoints = 4,
): Promise<{ values: number[]; dates: string[] }> {
  const values: number[] = [];
  const dates: string[] = [];
  // 最多回溯 10 个自然日，覆盖长假；命中 maxPoints 个真实交易日即停
  for (let back = 0; back < 10 && values.length < maxPoints; back++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - back);
    let summary: any;
    try {
      summary = await db.getMarketSummary(d);
    } catch {
      continue; // 该日不可查 → 跳过，不中断，也不编造
    }
    if (!summary) continue;
    const v = picker(summary);
    if (v === null || !Number.isFinite(v)) continue;
    values.unshift(v);
    dates.unshift(formatLocalDate(d));
  }
  return { values, dates };
}

async function buildCoreCards(db: any): Promise<CoreCardsResult> {
  const today = new Date();
  const summary = await db.getMarketSummary(today);
  const sectors = (await db.getSectorMomentumScore()) || [];

  // ---- 可用性判据：值是否真实，而不是数组是否非空 ----
  // summary 为 null 即「当日无行情」（Database.ts:483 契约），涨跌家数/成交额全不可得。
  const breadthCounts = summary
    ? Number(summary.risingStocks) + Number(summary.fallingStocks) + Number(summary.unchangedStocks)
    : 0;
  const hasBreadth =
    !!summary && (Number(summary.totalStocks) > 0 || breadthCounts > 0);

  const hasSectors = Array.isArray(sectors) && sectors.length > 0;

  // 真实历史序列（仅在对应维度可得时才回溯，避免无谓查询）
  const risingSeries = hasBreadth
    ? await buildRealSeries(db, today, (s) => Number(s.risingStocks))
    : { values: [], dates: [] };
  const fallingSeries = hasBreadth
    ? await buildRealSeries(db, today, (s) => Number(s.fallingStocks))
    : { values: [], dates: [] };
  const turnoverSeries = hasBreadth
    ? await buildRealSeries(db, today, (s) => {
        const t = Number(s.totalTurnover);
        return Number.isFinite(t) ? t / 1e8 : null; // 亿元
      })
    : { values: [], dates: [] };

  // ---- breadth 维度（依赖 getMarketSummary）----
  // 卡片顺序与修复前保持一致（MacroPage 按数组顺序渲染）：
  // 上涨家数 / 下跌家数 / 涨停家数 / 上涨板块占比 / 板块平均涨幅 / 全市场成交额
  const breadthCards: CoreCard[] = [];
  if (hasBreadth) {
    // 真实为 0 与不可得必须区分：此处 summary 已确证有行情，0 即事实，照实写 "0"
    const rising = Number(summary.risingStocks) || 0;
    const falling = Number(summary.fallingStocks) || 0;
    const unchanged = Number(summary.unchangedStocks) || 0;
    const total = Number(summary.totalStocks) || rising + falling + unchanged;

    breadthCards.push(
      {
        label: '上涨家数',
        unit: '只',
        valueText: String(rising),
        direction: rising >= falling ? 'up' : 'down',
        deltaText: total > 0 ? `${Math.round((rising / total) * 100)}%` : '—',
        series: risingSeries.values,
        available: true,
      },
      {
        label: '下跌家数',
        unit: '只',
        valueText: String(falling),
        direction: falling > rising ? 'down' : 'up',
        deltaText: total > 0 ? `${Math.round((falling / total) * 100)}%` : '—',
        series: fallingSeries.values,
        available: true,
      },
    );
  } else {
    breadthCards.push(unavailableCard('上涨家数', '只'), unavailableCard('下跌家数', '只'));
  }

  // ---- sectors 维度（依赖 getSectorMomentumScore）----
  const sectorCards: CoreCard[] = [];
  if (hasSectors) {
    const limitUp = sectors.reduce(
      (s: number, x: any) => s + (Number(x.limit_up_count) || 0),
      0,
    );
    const avgChange =
      sectors.reduce((s: number, x: any) => s + Number(x.avg_change_percent || 0), 0) /
      sectors.length;
    const upSectorRatio =
      sectors.filter((s: any) => Number(s.avg_change_percent) > 0).length / sectors.length;
    const upSectorCount = sectors.filter((s: any) => Number(s.avg_change_percent) > 0).length;

    sectorCards.push(
      {
        label: '涨停家数',
        unit: '只',
        valueText: String(limitUp),
        direction: limitUp > 30 ? 'up' : limitUp > 10 ? 'flat' : 'down',
        deltaText: `覆盖 ${sectors.filter((s: any) => (s.limit_up_count || 0) > 0).length} 板块`,
        series: [],
        available: true,
      },
      {
        label: '上涨板块占比',
        unit: '%',
        valueText: `${Math.round(upSectorRatio * 100)}`,
        direction: upSectorRatio > 0.5 ? 'up' : upSectorRatio > 0.3 ? 'flat' : 'down',
        deltaText: `${upSectorCount}/${sectors.length} 个一级行业`,
        // 板块历史无法按日回溯（getSectorMomentumScore 固定取最新交易日，
        // 没有带日期入参的等价接口）→ 宁可空数组，也不像原先那样硬编码
        // [0.35, 0.42, ...] 造出一条不存在的曲线。
        series: [],
        available: true,
      },
      {
        label: '板块平均涨幅',
        unit: '%',
        valueText: `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}`,
        direction: avgChange > 0.3 ? 'up' : avgChange < -0.3 ? 'down' : 'flat',
        deltaText: '较昨日',
        series: [],
        available: true,
      },
    );
  } else {
    sectorCards.push(
      unavailableCard('涨停家数', '只'),
      unavailableCard('上涨板块占比', '%'),
      unavailableCard('板块平均涨幅', '%'),
    );
  }

  // ---- 成交额卡：同属 breadth 维度，但按原顺序排在最后 ----
  const turnoverCard: CoreCard[] = hasBreadth
    ? (() => {
        const turnover = Number(summary.totalTurnover) || 0;
        return [
          {
            label: '全市场成交额',
            unit: '亿元',
            valueText:
              turnover >= 1e12
                ? `${(turnover / 1e12).toFixed(2)}万亿`
                : turnover > 0
                  ? `${(turnover / 1e8).toFixed(0)}亿`
                  : '0',
            direction: 'flat' as const,
            deltaText: '总成交',
            // 序列单位为亿元，与 valueText 同量纲
            series: turnoverSeries.values,
            available: true,
          },
        ];
      })()
    : [unavailableCard('全市场成交额', '亿元')];

  // 卡片顺序与修复前一致（MacroPage 按数组顺序渲染）：
  // 上涨家数 / 下跌家数 / 涨停家数 / 上涨板块占比 / 板块平均涨幅 / 全市场成交额
  const cards = [...breadthCards, ...sectorCards, ...turnoverCard];
  const historyDates = risingSeries.dates.length ? risingSeries.dates : turnoverSeries.dates;
  return { cards, hasBreadth, hasSectors, historyDates };
}

/**
 * 趋势：CPI vs PPI 近 N 月（真实源：东方财富 datacenter-web RPT_ECONOMY_CPI / RPT_ECONOMY_PPI）
 * 已在本环境 egress 验证可达。源失败时诚实返回空（不向上抛，避免拖垮 /overview 的 core 真实数据）。
 */
async function buildTrend24(limit = 24): Promise<{ month: string; cpi: number; ppi: number }[]> {
  try {
    return await getMacroCpiPpi(limit);
  } catch (e) {
    // 数据源不可用（网络受限 / 报表名变更 / 解析失败）→ 诚实空，不编造 CPI/PPI 数字
    if (e instanceof MacroUnavailableError) return [];
    return [];
  }
}

/**
 * 利率与流动性（数据源未接入）
 */
async function buildRates(): Promise<{ name: string; current: number; change: number; unit: string }[]> {
  // 数据源占位：SHIBOR / OMO / MLF
  return [];
}

/**
 * 宏观日历（数据源未接入）
 */
async function buildCalendar(): Promise<any[]> {
  // 数据源占位：新浪/东方财富 财经日历
  return [];
}

/**
 * GET /api/macro/overview
 * 一次性返回 core / trend24 / rates / calendar 四块
 *
 * dataSource 判据（P0-MACROCARDS）：由**各块的值是否真实可得**推导，
 * 绝不是 `core.length > 0`（core 恒含 6 个卡片位置，长度永远 > 0）。
 * core 内部再按维度细分：breadth / sectors 任一可得即 core 有真实数据。
 */
router.get(
  '/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const [coreResult, trend24, rates, calendar] = await Promise.all([
        buildCoreCards(db),
        buildTrend24(),
        buildRates(),
        buildCalendar(),
      ]);

      const core = coreResult.cards;
      const hasCore = coreResult.hasBreadth || coreResult.hasSectors;
      const hasTrend = trend24.length > 0;
      const hasRates = rates.length > 0;
      const hasCal = calendar.length > 0;
      const allReal = hasCore && hasTrend && hasRates && hasCal;
      // 「有任一块真实数据」——而不是「core 数组非空」
      const anyReal = hasCore || hasTrend || hasRates || hasCal;
      const dataSource = allReal ? 'real' : anyReal ? 'partial' : 'unavailable';

      res.json({
        success: true,
        data: {
          core,
          trend24,
          rates,
          calendar,
          // 逐块标注，前端可据此对「不可用」的卡片/表块做诚实空态
          blockDataSource: {
            core: hasCore ? 'real' : 'unavailable',
            coreBreadth: coreResult.hasBreadth ? 'real' : 'unavailable',
            coreSectors: coreResult.hasSectors ? 'real' : 'unavailable',
            trend24: hasTrend ? 'real' : 'unavailable',
            rates: hasRates ? 'real' : 'unavailable',
            calendar: hasCal ? 'real' : 'unavailable',
          },
          // 参与 sparkline 的真实交易日（升序）；空数组表示无真实历史可画
          historyDates: coreResult.historyDates,
        },
        dataSource,
        notes: {
          core: hasCore
            ? '市场宏观情绪（基于本地真实行情库合成）'
            : '市场宏观情绪：本地行情库无当日数据，卡片值不可用（非 0）',
          coreBreadth: coreResult.hasBreadth ? undefined : '涨跌家数/成交额：本地行情库无当日数据',
          coreSectors: coreResult.hasSectors ? undefined : '板块维度：本地行情库无当日板块数据',
          trend24: hasTrend ? undefined : 'CPI/PPI 数据源未接入',
          rates: hasRates ? undefined : '利率与流动性数据源未接入',
          calendar: hasCal ? undefined : '宏观日历数据源未接入',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      res.json({
        success: false,
        data: { core: [], trend24: [], rates: [], calendar: [] },
        dataSource: 'unavailable',
        error: e instanceof Error ? e.message : 'unknown',
        timestamp: new Date().toISOString(),
      });
    }
  }),
);

export default router;