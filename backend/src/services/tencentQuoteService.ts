/**
 * 腾讯行情（qt.gtimg.cn）批量报价 + 港币汇率封装 —— 单一真源
 *
 * 为什么必须存在：
 *   本机与生产均实测 `push2.eastmoney.com` 不可达（curl exit 52 / fetch failed），
 *   而 `qt.gtimg.cn` 稳定 200。`/api/ai/*`（逐只打 push2）与
 *   `/api/hk-connect/ah-premium`（批量打 push2 ulist）都因此长期不可用。
 *   把「腾讯报价解析 + GBK 解码 + 汇率」收敛到这里，避免两处各写一份拼接逻辑。
 *
 * 接口事实（2026-11-03 实测）：
 *   GET https://qt.gtimg.cn/q=sh601398,hk01398,whHKDCNY
 *   - 响应 **Content-Type: text/html; charset=GBK**，必须按 GBK 解码，否则中文全乱码；
 *   - 每行形如 `v_sh601398="1~工商银行~601398~8.59~...";`，字段以 `~` 分隔；
 *   - 未知代码返回 `v_pv_none_match="1";`（不是 HTTP 错误），必须跳过而不是当成行情。
 *
 * 字段索引（0 基，均为实测标定，改动前请重新用真实响应校准）：
 *   A 股 `v_sh`/`v_sz`：
 *     1=名称 2=代码 3=最新价 4=昨收 6=成交量(手) 30=时间 32=涨跌幅(%)
 *     37=成交额(万元) 39=PE(TTM) 44=流通市值(亿) 45=总市值(亿) 46=PB 82=币种
 *   港股 `v_hk`：
 *     3=最新价 4=昨收 32=涨跌幅(%) 37=成交额 39=PE 45=总市值(亿) 75=币种
 *   汇率 `v_whHKDCNY`：
 *     3=最新价(=1 HKD 兑 CNY) 5=行情时间 21=日期
 *
 * 诚实数据红线：
 *   - 单个字段缺失一律返回 `null`，绝不用 0 顶替（0 是合法价格/成交量）；
 *   - 整批不可达 → 抛 TencentQuoteUnavailableError，由调用方诚实降级；
 *   - 本文件不含任何随机数与硬编码行情值。
 */

/** 腾讯行情源不可用时抛出，供路由层降级为「诚实空」。 */
export class TencentQuoteUnavailableError extends Error {
  constructor(msg = '腾讯行情源暂不可用') {
    super(msg);
    this.name = 'TencentQuoteUnavailableError';
  }
}

const FETCH_TIMEOUT_MS = 8000;

/** qt.gtimg.cn 单请求实测可承载 60+ 个代码；取 50 留余量，避免 URL 过长被截断 */
export const TENCNET_BATCH_SIZE = 50;

/** 单位换算：腾讯市值字段单位为「亿元」 */
const YI = 1e8;

export interface TencentQuote {
  /** 请求用的腾讯代码，如 sh601398 / hk01398 */
  code: string;
  /** 不带市场前缀的原始代码，如 601398 / 01398 */
  bareCode: string;
  name: string;
  currency: string | null;
  /** 最新价（原币种） */
  price: number | null;
  prevClose: number | null;
  changePercent: number | null;
  /** A 股成交量单位为「手」；港股为「股」。跨市场消费方注意区分。 */
  volume: number | null;
  /** 成交额（原币种，元 / 港元） */
  turnover: number | null;
  pe: number | null;
  pb: number | null;
  /** 总市值（原币种，元 / 港元） */
  marketCap: number | null;
  /** 行情时间原文，如 20261103161453 / 2026/11/03 16:08:09 */
  asOf: string | null;
}

/** 缺失/空串/非有限值一律 null —— 绝不返回 0 冒充缺失 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 把库内/接口常见的 A 股符号归一化为腾讯代码。
 *   600519 / 600519.SH / SH600519 → sh600519
 *   000001.SZ / sz000001        → sz000001
 * 指数与个股共用同一套前缀规则（sh000001 上证指数 / sz399006 创业板指）。
 * 非 6 位数字（如港股代码）返回 null，由调用方显式给出 hk 前缀。
 */
export function toTencentCode(symbol: string): string | null {
  const trimmed = (symbol || '').trim().toUpperCase();
  if (!trimmed) return null;
  const digits = trimmed.replace(/^(SH|SZ|BJ)\.?/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const isSh =
    trimmed.startsWith('SH') || trimmed.endsWith('.SH') || digits.startsWith('6');
  return `${isSh ? 'sh' : 'sz'}${digits}`;
}

/**
 * 港股代码：1~5 位数字（939 / 01398）或已带 hk 前缀（hk01398）→ hk01398。
 * 允许 3 位短码是因为港股习惯写法常省略前导 0（939 = 建设银行 = 00939）。
 */
export function toTencentHkCode(code: string): string | null {
  const trimmed = (code || '').trim().toLowerCase().replace(/^hk/, '');
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  return `hk${trimmed.padStart(5, '0')}`;
}

/** 解析单行 `v_sh601398="a~b~c";` → { key, fields }；不是行情行返回 null */
export function parseQuoteLine(line: string): { key: string; fields: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('v_')) return null;
  const eq = trimmed.indexOf('="');
  if (eq < 0) return null;
  const key = trimmed.slice(2, eq);
  // 未知代码：v_pv_none_match="1";
  if (key === 'pv_none_match') return null;
  const body = trimmed.slice(eq + 2).replace(/";?$/, '');
  if (!body) return null;
  return { key, fields: body.split('~') };
}

/**
 * 把一行报价字段映射为 TencentQuote。
 * A 股与港股字段位不同（见文件头注释），按 key 前缀分派。
 */
export function mapQuoteFields(key: string, f: string[]): TencentQuote {
  const isHk = key.startsWith('hk');
  const get = (i: number) => (i < f.length ? f[i] : undefined);
  const marketCapYi = numOrNull(get(45));
  return {
    code: key,
    bareCode: String(get(2) ?? key.replace(/^(sh|sz|hk)/, '')),
    name: String(get(1) ?? ''),
    currency: get(isHk ? 75 : 82) ? String(get(isHk ? 75 : 82)) : null,
    price: numOrNull(get(3)),
    prevClose: numOrNull(get(4)),
    changePercent: numOrNull(get(32)),
    volume: numOrNull(get(6)),
    // 成交额：A 股字段 37 单位为万元，港股字段 37 单位为原币种元
    turnover: (() => {
      const raw = numOrNull(get(37));
      if (raw === null) return null;
      return isHk ? raw : raw * 1e4;
    })(),
    pe: numOrNull(get(39)),
    // PB 仅 A 股有明确字段位；港股 PB 位未标定 → null（不猜）
    pb: isHk ? null : numOrNull(get(46)),
    marketCap: marketCapYi === null ? null : marketCapYi * YI,
    asOf: get(30) ? String(get(30)) : null,
  };
}

/** 带超时的原始抓取（响应体为 GBK 字节流，故不用 resp.json()） */
async function fetchGbkText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://gu.qq.com/',
      },
    });
    if (!resp.ok) throw new TencentQuoteUnavailableError(`腾讯行情源 HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    // qt.gtimg.cn 返回 charset=GBK；用 TextDecoder('gbk') 解码，避免中文名乱码
    return new TextDecoder('gbk').decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

/** 把一批腾讯代码抓成 Map；空数组直接返回空 Map（不发请求） */
async function fetchQuoteChunk(codes: string[]): Promise<Map<string, TencentQuote>> {
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  const text = await fetchGbkText(url);
  const map = new Map<string, TencentQuote>();
  for (const line of text.split('\n')) {
    const parsed = parseQuoteLine(line);
    if (!parsed) continue;
    map.set(parsed.key, mapQuoteFields(parsed.key, parsed.fields));
  }
  return map;
}

/**
 * 批量取腾讯实时报价（自动分片）。
 * 全部失败才抛错；部分代码无数据只是不出现在 Map 里（调用方按缺失处理）。
 */
export async function fetchTencentQuotes(codes: string[]): Promise<Map<string, TencentQuote>> {
  const uniq = Array.from(new Set(codes.filter(Boolean)));
  if (uniq.length === 0) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += TENCNET_BATCH_SIZE) {
    chunks.push(uniq.slice(i, i + TENCNET_BATCH_SIZE));
  }

  const results = await Promise.allSettled(chunks.map(fetchQuoteChunk));
  const merged = new Map<string, TencentQuote>();
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const [k, v] of r.value) merged.set(k, v);
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  if (merged.size === 0 && errors.length > 0) {
    throw new TencentQuoteUnavailableError(`腾讯行情源均不可用（${errors.join('; ')}）`);
  }
  return merged;
}

export interface HkdCnyRate {
  /** 1 HKD 兑 CNY */
  rate: number;
  /** 行情日期 YYYY-MM-DD（源提供才有） */
  asOf: string | null;
  /** 数据来源标识，供响应中透明标注 */
  source: string;
}

/**
 * 取真实港币兑人民币汇率（腾讯外汇 whHKDCNY）。
 *
 * 为什么不能再用常数：原实现硬编码 `HKD_TO_CNY = 0.92`，而 2026-11-03 三源交叉实测为
 * 0.8499（腾讯 whHKDCNY 0.8499 / 新浪 hq.sinajs.cn 0.8499 / open.er-api.com 0.849562）。
 * 用 0.92 计算会让每一只 A+H 标的的溢价率系统性偏低约 8 个百分点 —— 这就是
 * 「用常量冒充真实汇率」。取不到时返回 null，由调用方诚实置空。
 */
export async function fetchHkdCnyRate(): Promise<HkdCnyRate | null> {
  let text: string;
  try {
    text = await fetchGbkText('https://qt.gtimg.cn/q=whHKDCNY');
  } catch {
    return null;
  }
  for (const line of text.split('\n')) {
    const parsed = parseQuoteLine(line);
    if (!parsed || parsed.key !== 'whHKDCNY') continue;
    const rate = numOrNull(parsed.fields[3]);
    // 汇率必须落在合理的正数区间，否则视为脏值（不做任何推断修补）
    if (rate === null || rate <= 0 || rate > 10) return null;
    const dateRaw = parsed.fields[21];
    return {
      rate,
      asOf: dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
      source: 'tencent(qt.gtimg.cn whHKDCNY)',
    };
  }
  return null;
}
