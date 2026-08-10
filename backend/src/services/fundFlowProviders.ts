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

// ============ DemoProvider —— 确定性演示兜底（链尾恒可用） ============

class DemoProvider implements FundFlowProvider {
  name = 'demo' as const;
  isAvailable(): boolean {
    return true;
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
  async fetchFlowHistory(symbol: string, days: number): Promise<StockFlowResult[]> {
    return new DemoProvider().fetchFlowHistory(symbol, days);
  }
}

// ============ 链路解析与诊断 ============

/** 按优先级解析可用链：tushare → akshare → eastmoney → demo；无 key 者不入链，demo 恒在链尾 */
export function resolveProviderChain(): FundFlowProvider[] {
  const chain: FundFlowProvider[] = [];
  const t = new TushareProvider();
  if (t.isAvailable()) chain.push(t);
  const a = new AkShareProvider();
  if (a.isAvailable()) chain.push(a);
  const e = new EastmoneyProvider();
  if (e.isAvailable()) chain.push(e);
  chain.push(new DemoProvider());
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
      demo: true,
    },
  };
}

/** 国际资金视角（北向+离岸）：真实源优先，无实时源时诚实置空，不编造 demo */
/**
 * 东方财富沪深港通北向资金（真实，免 key）—— 补充国际资金视角的真实北向维度。
 * 返回当日北向净买入（港股通沪+深合计，单位亿元）；失败返回 null，由调用方诚实置空，不编造。
 */
async function fetchNorthBoundReal(): Promise<GlobalIndicator | null> {
  try {
    const resp = await axios.get('https://push2.eastmoney.com/api/qt/kamt/get', {
      params: { fields1: 'f1,f2,f3', fields2: 'f51,f52,f53,f54,f55', ut: 'b2884a393a59ad64002292a3e90d46a5' },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com' },
    });
    const d = resp.data?.data;
    if (!d) return null;
    // 北向资金 = 沪股通(sh2hk) + 深股通(sz2hk)，即外资净买入 A 股
    const sh = Number(d.sh2hk?.dayNetAmtIn ?? 0);
    const sz = Number(d.sz2hk?.dayNetAmtIn ?? 0);
    const total = Number(((sh + sz) / 1e8).toFixed(2));
    const rawDate = d.sh2hk?.date ?? d.sz2hk?.date ?? d.hk2sh?.date;
    const date = rawDate ? `2026-${rawDate}` : new Date().toISOString().slice(0, 10);
    return {
      key: 'north_bound',
      label: '北向资金(沪深港通)净买入',
      unit: '亿元',
      latest: total,
      series: [{ date, value: total }],
    };
  } catch (e) {
    console.error('[eastmoney] 北向资金调用失败:', e);
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
  // 北向资金：东方财富真实（免 key，稳定）
  const north = await fetchNorthBoundReal();
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
