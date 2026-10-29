/**
 * 机构资金流后端代理 · 适配器骨架层 (Ticket D4-a)
 * 统一接入 Tushare(A股主源) / AkShare(兜底) / Alpha Vantage(国际/外资主源)，
 * 并保留确定性演示兜底 Demo。统一经后端代理，前端不直连。
 * 当前(D14 未到位)仅搭骨架：env key 切换开关 + 无 key 时确定性兜底，真 key 到位一键切换。
 * 参考先例：src/services/llmGateway.ts
 */

import axios from 'axios';

// ============ 统一类型 ============

export type FundFlowProviderName = 'tushare' | 'akshare' | 'alphavantage' | 'eastmoney' | 'demo';

/** 个股资金流结果（与 api/fund-flow.ts 的 FundFlowData 兼容，name 可选） */
export interface StockFlowResult {
  symbol: string;
  name?: string;
  mainNet: number;
  superLargeNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
  tradeDate: string;
}

export interface GlobalIndicatorPoint {
  date: string;
  value: number;
}

export interface GlobalIndicator {
  key: string;
  label: string;
  unit: string;
  latest: number;
  series: GlobalIndicatorPoint[];
  /** 口径说明（可选）：如实披露指标含义与上游口径，供前端展示 */
  note?: string;
}

/** 统一适配器接口；fetchGlobalIndicators 仅国际视角相关适配器实现（可选） */
export interface FundFlowProvider {
  name: FundFlowProviderName;
  isAvailable(): boolean;
  fetchStockFlow(symbol: string): Promise<StockFlowResult | null>;
  fetchFlowHistory(symbol: string, days: number): Promise<StockFlowResult[]>;
  fetchGlobalIndicators?(): Promise<GlobalIndicator[]>;
}

// ============ 确定性随机：FNV-1a + LCG（禁用 Math.random） ============

function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** LCG：种子固定则序列固定，返回 [0,1) */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 由 symbol（必要时含日期/salt）派生确定性种子；基线魔力数 20260728 便于整体偏移 */
function seedOf(symbol: string, salt = 0): number {
  return (fnv1a(symbol) ^ 20260728 ^ salt) >>> 0;
}

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

// ============ DemoProvider —— 已拆除引信的演示兜底 ============
//
// 🔴 诚实红线（2026-10-23 处置，qa 蜂群 P2-⑧）
//
// 这个类用 **LCG 线性同余伪随机**生成「主力/超大单/大单/中单/小单净流入」，
// 数值与真实资金流毫无关系。它原本是两个隐患的叠加：
//   1. `isAvailable()` 恒返回 true → 作为链尾恒被选中；
//   2. `EastmoneyProvider.fetchFlowHistory` 直接委托它 → 东财这条
//      「真实源」实际上从不抓数，永远吐伪数据。
// 一旦 `resolveProviderChain()` 被接到任何端点，用户就会看到**看起来专业
// 的假数字**，且因为链尾恒可用，永远不会降级、永远发现不了。
//
// 处置方式（拆除引信，保留实体）：
//   - `isAvailable()` 改为 **false**：即使将来有人接线，链路解析也不会选它；
//   - `resolveProviderChain()` 不再把它 push 进链；
//   - `EastmoneyProvider.fetchFlowHistory` 改为诚实返回空数组。
// 类本身保留（不删 export），避免破坏潜在 import；但新增调用会立刻发现
// 它永远不被选中——这正是想要的效果。
//
// ⚠️ 若未来确需「演示模式」，必须满足：响应显式带 `dataSource:'demo'`
// 且 UI 有不可忽略的「演示数据」水印；不得复用这个类的恒可用语义。

class DemoProvider implements FundFlowProvider {
  name = 'demo' as const;
  /**
   * 恒 false：演示数据**不得**参与真实供数链路。
   * 见上方🔴红线说明。
   */
  isAvailable(): boolean {
    return false;
  }

  async fetchStockFlow(symbol: string): Promise<StockFlowResult | null> {
    const rnd = makeLcg(seedOf(symbol));
    const scale = 20000;
    return {
      symbol,
      name: '',
      mainNet: (rnd() - 0.5) * scale,
      superLargeNet: (rnd() - 0.5) * scale * 0.3,
      largeNet: (rnd() - 0.5) * scale * 0.4,
      mediumNet: (rnd() - 0.5) * scale * 0.2,
      smallNet: (rnd() - 0.5) * scale * 0.1,
      tradeDate: new Date().toISOString().split('T')[0],
    };
  }

  async fetchFlowHistory(symbol: string, days: number): Promise<StockFlowResult[]> {
    const result: StockFlowResult[] = [];
    const today = new Date();
    // 以 symbol+日期 派生种子：同一 symbol 每次结果一致，且不同交易日曲线不同
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;
      const ds = date.toISOString().split('T')[0];
      const rnd = makeLcg(seedOf(symbol + ds));
      const scale = 20000;
      result.push({
        symbol,
        name: '',
        mainNet: (rnd() - 0.5) * scale,
        superLargeNet: (rnd() - 0.5) * scale * 0.3,
        largeNet: (rnd() - 0.5) * scale * 0.4,
        mediumNet: (rnd() - 0.5) * scale * 0.2,
        smallNet: (rnd() - 0.5) * scale * 0.1,
        tradeDate: ds,
      });
    }
    return result;
  }

  /** 国际资金视角确定性演示：4 个指标序列（随机游走但确定性） */
  async fetchGlobalIndicators(): Promise<GlobalIndicator[]> {
    const defs = [
      { key: 'northbound_proxied', label: '北向资金(代理)', unit: '亿元' },
      { key: 'usd_index', label: '美元指数关联', unit: 'pt' },
      { key: 'risk_appetite', label: '全球风险偏好', unit: 'index' },
      { key: 'offshore_rmb', label: '离岸人民币 USD/CNH', unit: 'USD/CNH' },
    ];
    const today = new Date();
    return defs.map((d, idx) => {
      const rnd = makeLcg(seedOf(d.key, idx + 1));
      const series: GlobalIndicatorPoint[] = [];
      let v = (rnd() - 0.5) * 100;
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue;
        v += (rnd() - 0.5) * 20;
        series.push({ date: date.toISOString().split('T')[0], value: Number(v.toFixed(2)) });
      }
      return {
        key: d.key,
        label: d.label,
        unit: d.unit,
        latest: series.length ? series[series.length - 1].value : 0,
        series,
      };
    });
  }
}

// ============ TushareProvider —— A股主源（需 TUSHARE_TOKEN） ============

function toTsCode(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(SZ|SH|BJ)$/, (m) => m.toUpperCase());
}
function tushareDate(s: unknown): string {
  const str = String(s ?? '');
  if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  return str;
}
/** Tushare moneyflow 一行 → 统一结果（金额单位保持上游原值：千元） */
function mapTushareRow(symbol: string, row: Array<string | number>): StockFlowResult {
  const num = (i: number): number => toNum(row[i]);
  const superLarge = num(24) - num(26); // buy_elg - sell_elg
  const large = num(20) - num(22); // buy_lg - sell_lg
  const medium = num(16) - num(18); // buy_md - sell_md
  const small = num(12) - num(14); // buy_sm - sell_sm
  const main = num(28) !== 0 ? num(28) : superLarge + large; // net_mf_amount
  return {
    symbol,
    name: '',
    mainNet: main,
    superLargeNet: superLarge,
    largeNet: large,
    mediumNet: medium,
    smallNet: small,
    tradeDate: tushareDate(row[1]),
  };
}

class TushareProvider implements FundFlowProvider {
  name = 'tushare' as const;
  private readonly endpoint = 'https://api.tushare.pro';
  isAvailable(): boolean {
    return !!process.env.TUSHARE_TOKEN;
  }

  private async call(apiName: string, params: Record<string, unknown>): Promise<Array<Array<string | number>> | null> {
    if (!this.isAvailable()) return null;
    try {
      const resp = await axios.post(
        this.endpoint,
        { api_name: apiName, token: process.env.TUSHARE_TOKEN, params, fields: '' },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } },
      );
      const items = resp.data?.data?.items;
      if (!Array.isArray(items)) return null;
      return items as Array<Array<string | number>>;
    } catch (e) {
      console.error('[tushare] moneyflow 调用失败:', e);
      return null;
    }
  }

  async fetchStockFlow(symbol: string): Promise<StockFlowResult | null> {
    const tsCode = toTsCode(symbol);
    if (!tsCode) return null;
    const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const items = await this.call('moneyflow', { ts_code: tsCode, start_date: endDate, end_date: endDate });
    if (!items || items.length === 0) return null;
    return mapTushareRow(symbol, items[0]);
  }

  async fetchFlowHistory(symbol: string, days: number): Promise<StockFlowResult[]> {
    const tsCode = toTsCode(symbol);
    if (!tsCode) return [];
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days - 5);
    const items = await this.call('moneyflow', {
      ts_code: tsCode,
      start_date: start.toISOString().slice(0, 10).replace(/-/g, ''),
      end_date: end.toISOString().slice(0, 10).replace(/-/g, ''),
    });
    if (!items) return [];
    return items.slice(0, days).map((r) => mapTushareRow(symbol, r));
  }
}

// ============ AkShareProvider —— 兜底（需自建 HTTP 代理 AKSHARE_PROXY_URL） ============

class AkShareProvider implements FundFlowProvider {
  name = 'akshare' as const;
  isAvailable(): boolean {
    return !!process.env.AKSHARE_PROXY_URL;
  }
  private get base(): string {
    return (process.env.AKSHARE_PROXY_URL || '').replace(/\/$/, '');
  }
  private marketOf(symbol: string): string {
    const s = symbol.toUpperCase();
    if (s.endsWith('.SH')) return 'SH';
    if (s.endsWith('.BJ')) return 'BJ';
    return 'SZ';
  }
  private mapRow(symbol: string, row: Record<string, unknown>): StockFlowResult | null {
    const tradeDate = String(row['日期'] ?? row['trade_date'] ?? new Date().toISOString().split('T')[0]);
    return {
      symbol,
      name: '',
      mainNet: toNum(row['主力净流入-净额']),
      superLargeNet: toNum(row['超大单净流入-净额']),
      largeNet: toNum(row['大单净流入-净额']),
      mediumNet: toNum(row['中单净流入-净额']),
      smallNet: toNum(row['小单净流入-净额']),
      tradeDate,
    };
  }

  async fetchStockFlow(symbol: string): Promise<StockFlowResult | null> {
    if (!this.isAvailable()) return null;
    try {
      const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
      const resp = await axios.get(`${this.base}/stock_individual_fund_flow`, {
        params: { symbol: code, market: this.marketOf(symbol), indicator: '即时' },
        timeout: 10000,
      });
      const row = Array.isArray(resp.data) ? resp.data[0] : resp.data;
      if (!row || typeof row !== 'object') return null;
      return this.mapRow(symbol, row as Record<string, unknown>);
    } catch (e) {
      console.error('[akshare] 个股资金流调用失败:', e);
      return null;
    }
  }

  async fetchFlowHistory(symbol: string, days: number): Promise<StockFlowResult[]> {
    if (!this.isAvailable()) return [];
    try {
      const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
      const resp = await axios.get(`${this.base}/stock_individual_fund_flow`, {
        params: { symbol: code, market: this.marketOf(symbol), indicator: '历史' },
        timeout: 10000,
      });
      const arr = Array.isArray(resp.data) ? resp.data : [];
      return arr
        .slice(0, days)
        .map((row: Record<string, unknown>) => this.mapRow(symbol, row))
        .filter((x: StockFlowResult | null): x is StockFlowResult => x !== null);
    } catch (e) {
      console.error('[akshare] 历史资金流调用失败:', e);
      return [];
    }
  }
}

// ============ AlphaVantageProvider —— 国际/外资主源（需 ALPHAVANTAGE_KEY） ============

class AlphaVantageProvider implements FundFlowProvider {
  name = 'alphavantage' as const;
  private readonly endpoint = 'https://www.alphavantage.co/query';
  isAvailable(): boolean {
    return !!process.env.ALPHAVANTAGE_KEY;
  }
  // A股个股资金流在 Alpha Vantage 无对应接口，不为此路径提供实时值
  async fetchStockFlow(): Promise<StockFlowResult | null> {
    return null;
  }
  async fetchFlowHistory(): Promise<StockFlowResult[]> {
    return [];
  }
  /** 国际资金视角：抓真实离岸人民币(USD/CNH)日线；失败/无 key 返回空，由路由降级 Demo */
  async fetchGlobalIndicators(): Promise<GlobalIndicator[]> {
    if (!this.isAvailable()) return [];
    try {
      const key = process.env.ALPHAVANTAGE_KEY as string;
      const resp = await axios.get(this.endpoint, {
        params: { function: 'FX_DAILY', from_symbol: 'USD', to_symbol: 'CNH', outputsize: 'compact', apikey: key },
        timeout: 10000,
      });
      const ts = resp.data?.['Time Series FX (Daily)'] as Record<string, Record<string, string>> | undefined;
      if (!ts) return [];
      const series: GlobalIndicatorPoint[] = Object.entries(ts)
        .slice(0, 30)
        .map(([date, v]) => ({ date, value: Number(v['4. close']) }))
        .reverse();
      return [
        {
          key: 'offshore_rmb',
          label: '离岸人民币 USD/CNH（实时）',
          unit: 'USD/CNH',
          latest: series.length ? series[series.length - 1].value : 0,
          series,
        },
      ];
    } catch (e) {
      console.error('[alphavantage] 国际资金视角调用失败:', e);
      return [];
    }
  }
}

// ============ EastmoneyProvider —— 既有直连逻辑封装（无需 key，实时兜底） ============
// 说明：既有个股实时抓取逻辑见 api/fund-flow.ts 的 fetchFundFlow，本适配器仅用于
// 将"东方财富"纳入统一 provider 链与诊断元信息；链中它排在 tushare/akshare 之后、demo 之前。

class EastmoneyProvider implements FundFlowProvider {
  name = 'eastmoney' as const;
  isAvailable(): boolean {
    return true;
  }
  async fetchStockFlow(): Promise<StockFlowResult | null> {
    return null; // 实时抓取由 api/fund-flow.ts 的 fetchFundFlow 负责
  }
  /**
   * 历史资金流：东财无免 key 的历史资金流接口，**诚实返回空**。
   *
   * 此前这里 `return new DemoProvider().fetchFlowHistory(...)` —— 把 LCG
   * 伪数据当东财真实历史返回，是「真实源从不抓数、永远吐假数」的隐蔽形态
   * （qa 蜂群 P2-⑧）。缺数据就缺数据，返回空数组让上层标 unavailable，
   * 绝不能拿伪数据顶替。
   */
  async fetchFlowHistory(): Promise<StockFlowResult[]> {
    return [];
  }
}

// ============ 链路解析与诊断 ============

/**
 * 按优先级解析可用链：tushare → akshare → eastmoney。
 *
 * ⚠️ 链尾**不再**放 DemoProvider（2026-10-23，qa P2-⑧）：
 * 演示数据的 `isAvailable()` 已恒为 false，且它本就不该进真实供数链——
 * 链尾恒可用会让「上游全失败」被伪装成「成功返回数据」。
 * 真实源全部不可用时，上层应走 dataSource:'unavailable' 诚实空态。
 */
export function resolveProviderChain(): FundFlowProvider[] {
  const chain: FundFlowProvider[] = [];
  const t = new TushareProvider();
  if (t.isAvailable()) chain.push(t);
  const a = new AkShareProvider();
  if (a.isAvailable()) chain.push(a);
  const e = new EastmoneyProvider();
  if (e.isAvailable()) chain.push(e);
  return chain;
}

/** 诊断元信息：当前生效链 + 各 key 配置状态 */
export function getFundFlowMeta() {
  return {
    activeProviders: resolveProviderChain().map((p) => p.name),
    keysConfigured: {
      tushare: !!process.env.TUSHARE_TOKEN,
      akshare: !!process.env.AKSHARE_PROXY_URL,
      alphavantage: !!process.env.ALPHAVANTAGE_KEY,
      eastmoney: true,
      // 演示 provider 已不参与供数链，恒定 false（见🔴红线说明）
      demo: false,
    },
  };
}

/** 国际资金视角（离岸人民币 + 沪深股通成交额）：真实源优先，无实时源时诚实置空，不编造 demo */
/**
 * 沪深股通成交额（真实，免 key）—— 国际资金视角下唯一可核验的北向维度。
 *
 * 🔴 诚实红线（2026-10-29，工单 R4）：
 * 此前本函数调用 push2 `api/qt/kamt/get`，把 `sh2hk + sz2hk`（港股通南向腿）的
 * `dayNetAmtIn` 冠以「北向资金(沪深港通)净买入」返回 —— 腿映射与字段语义双重错误。
 * 更根本的是：**北向资金净买入自 2024-08-19 起交易所已停止披露**（沪深交易所调整
 * 沪深股通信息披露机制，日频只公布成交总额/笔数；实测见 api/northBound.ts 顶部记录，
 * RPT_MUTUAL_DEAL_HISTORY 的 NET_DEAL_AMT 等七字段自该日起恒为 null）。
 * 任何来源都不存在「北向净买入」的真实日频值 —— 严禁倒算、严禁用其它口径冒充。
 *
 * 故本函数只提供**可核验的成交额口径**，数据源与 /api/north-bound/overview 的
 * dealFlows 完全同源（东方财富数据中心 RPT_MUTUAL_DEAL_HISTORY 的 DEAL_AMT，
 * 单位万元，沪股通 001 + 深股通 003 两腿逐日合计），数值可交叉核验一致。
 * 失败/空数据返回 null，由调用方诚实置空，绝不编造。
 */
async function fetchNorthBoundTurnoverReal(): Promise<GlobalIndicator | null> {
  try {
    // 与 api/northBound.ts 的 emGet 同款实现：AbortController + 超时 + 任何失败返回 null。
    // 用 fetch（undici）而非 axios：axios 会吃 HTTP(S)_PROXY 环境变量，在代理沙箱下
    // 对 datacenter-web.eastmoney.com 不可达；undici 默认不走环境代理（同源已实测可达）。
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      '?reportName=RPT_MUTUAL_DEAL_HISTORY' +
      '&columns=MUTUAL_TYPE,TRADE_DATE,DEAL_AMT' +
      `&filter=${encodeURIComponent('(MUTUAL_TYPE in ("001","003"))')}` +
      '&sortColumns=TRADE_DATE&sortTypes=-1&pageSize=60&pageNumber=1' + // 60 行 = 30 个交易日 × 沪深两腿
      '&source=WEB&client=WEB';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let rows: unknown;
    try {
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { result?: { data?: unknown } };
      rows = json?.result?.data;
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(rows) || rows.length === 0) return null;
    // 按交易日合计两腿成交额（万元，上游原值）；单腿缺失则该腿不贡献（绝不补 0 冒充完整）
    const byDate = new Map<string, number>();
    for (const r of rows) {
      const amt = Number(r?.DEAL_AMT);
      const date = String(r?.TRADE_DATE ?? '').slice(0, 10);
      if (!Number.isFinite(amt) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + amt);
    }
    const series = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, amt]) => ({ date, value: Number(amt.toFixed(2)) }));
    if (!series.length) return null;
    return {
      key: 'hk_stock_connect_turnover',
      label: '沪深股通成交额',
      unit: '万元',
      latest: series[series.length - 1].value,
      series,
      note:
        '北向资金净买入自 2024-08-19 起交易所停止披露，已如实下线；本指标为可核验的沪深股通成交总额' +
        '（沪股通+深股通合计，RPT_MUTUAL_DEAL_HISTORY.DEAL_AMT，单位万元），与 /api/north-bound/overview 同源。',
    };
  } catch (e) {
    console.error('[eastmoney] 沪深股通成交额调用失败:', e);
    return null;
  }
}

export async function getGlobalIndicators(): Promise<{
  dataSource: FundFlowProviderName | 'real' | 'unavailable';
  indicators: GlobalIndicator[];
}> {
  const indicators: GlobalIndicator[] = [];
  // 离岸人民币：优先 Alpha Vantage 真实国际源（需 ALPHAVANTAGE_KEY）
  const alpha = new AlphaVantageProvider();
  if (alpha.isAvailable()) {
    const offshore = await alpha.fetchGlobalIndicators();
    if (offshore.length) indicators.push(...offshore);
  }
  // 沪深股通成交额：东方财富数据中心真实（免 key，与 north-bound/overview 同源）
  const north = await fetchNorthBoundTurnoverReal();
  if (north) indicators.push(north);
  // 诚实红线：无任何真实指标时返回空（不编造 demo）
  return {
    dataSource: indicators.length ? 'real' : 'unavailable',
    indicators,
  };
}

/** 导出 DemoProvider 实例工厂，供 api 层复用其确定性历史生成（替代 Math.random mock） */
export function getDemoProvider(): DemoProvider {
  return new DemoProvider();
}
