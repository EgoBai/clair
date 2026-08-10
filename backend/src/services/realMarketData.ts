/**
 * 真实市场行情数据源（后端直连实时接口）
 * - 指数：腾讯财经 qt.gtimg.cn（已在沙箱与生产的同源 client 验证可用）
 * - 涨跌分布/成交额/涨跌停：东方财富 push2（标准行情源，需 egress 至 push2.eastmoney.com）
 *
 * 设计原则：只返回真实数据。指数源失败直接抛出；涨跌分布源失败则降级为 null
 * （绝不回填演示/硬编码数据，遵守项目「诚实数据」红线）。
 */

const FETCH_TIMEOUT_MS = 8000;
const RETRY_MAX = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface IndexQuote {
  name: string;
  price: number;
  changePct: number;
}

export interface MarketBreadth {
  up: number;
  down: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  turnoverYi: number;
  /** 上涨成交额（元），由个股 f6 累加（真实） */
  upVolume: number;
  /** 下跌成交额（元），由个股 f6 累加（真实） */
  downVolume: number;
  /** 量能比 = 上涨成交额 / 下跌成交额（真实派生） */
  volumeRatio: number;
}

export interface RealMarketData {
  shanghai: IndexQuote;
  shenzhen: IndexQuote;
  chinext: IndexQuote;
  breadth: MarketBreadth | null;
}

async function fetchWithRetry(url: string, retries = RETRY_MAX): Promise<Response> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' },
      });
      clearTimeout(timer);
      if (resp.ok) return resp;
      // 5xx / 429 视为瞬时故障可重试；其余抛出不重试
      if (resp.status >= 500 || resp.status === 429) {
        last = new Error(`HTTP ${resp.status}`);
        if (i < retries) await sleep(300 * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (e) {
      clearTimeout(timer);
      last = e;
      if (i < retries) await sleep(300 * (i + 1));
    }
  }
  throw last instanceof Error ? last : new Error('fetch failed');
}

async function fetchIndices(): Promise<Record<string, IndexQuote>> {
  const url = 'https://qt.gtimg.cn/q=sh000001,sz399001,sz399006';
  const resp = await fetchWithRetry(url);
  const txt = await resp.text();
  const out: Record<string, IndexQuote> = {};
  for (const line of txt.split(';')) {
    const m = line.match(/v_(\w+)="([^"]*)"/);
    if (!m) continue;
    const f = m[2].split('~');
    const price = toNum(f[3]);
    const prev = toNum(f[4]);
    const changePct = prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
    out[m[1]] = { name: f[1] ?? '', price, changePct };
  }
  if (!out.sh000001 || !out.sz399001 || !out.sz399006) {
    throw new Error('指数行情解析失败或缺失三大指数');
  }
  return out;
}

async function fetchBreadth(): Promise<MarketBreadth> {
  const url =
    'https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f3,f6,f12' +
    '&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fid=f3&pn=1&pz=10000&po=1&np=1&fltt=2&invt=2';
  const resp = await fetchWithRetry(url);
  const j = (await resp.json()) as { data?: { diff?: any[]; list?: any[] } };
  const list = j?.data?.diff || j?.data?.list || [];
  if (!Array.isArray(list) || list.length < 1000) {
    throw new Error(`涨跌分布数据不完整(total=${list?.length ?? 0})`);
  }
  let up = 0,
    down = 0,
    flat = 0,
    limitUp = 0,
    limitDown = 0,
    turnover = 0,
    upVolume = 0,
    downVolume = 0;
  for (const it of list) {
    const chg = toNum(it.f3);
    const amt = toNum(it.f6); // 元
    const code = String(it.f12 ?? '');
    const board20 = code.startsWith('30') || code.startsWith('68'); // 创业板/科创板 ±20%
    if (chg > 0) {
      up++;
      upVolume += amt;
    } else if (chg < 0) {
      down++;
      downVolume += amt;
    } else {
      flat++;
    }
    if (board20 ? chg >= 19.8 : chg >= 9.8) limitUp++;
    if (board20 ? chg <= -19.8 : chg <= -9.8) limitDown++;
    turnover += amt; // 元
  }
  const volumeRatio = downVolume > 0 ? +(upVolume / downVolume).toFixed(3) : upVolume > 0 ? 999 : 0;
  return {
    up,
    down,
    flat,
    limitUp,
    limitDown,
    turnoverYi: +(turnover / 1e8).toFixed(1),
    upVolume,
    downVolume,
    volumeRatio,
  };
}

/** 拉取真实市场数据：三大指数（必返回）+ 全市场涨跌分布（可选，失败为 null） */
export async function getRealMarketData(): Promise<RealMarketData> {
  const indices = await fetchIndices();
  let breadth: MarketBreadth | null = null;
  try {
    breadth = await fetchBreadth();
  } catch (e) {
    console.error(
      '[realMarketData] 涨跌分布获取失败（仅影响涨跌家数/成交额字段，指数仍为真实）:',
      (e as Error).message
    );
  }
  return {
    shanghai: indices.sh000001,
    shenzhen: indices.sz399001,
    chinext: indices.sz399006,
    breadth,
  };
}
