/**
 * 宏观数据服务（真实源版）—— 非价格引擎「宏观」数据源落地
 *
 * 数据来源（东方财富数据中心 datacenter-web，免 key）：
 * - CPI 居民消费价格指数：reportName=RPT_ECONOMY_CPI
 *     字段 NATIONAL_SAME（全国 CPI 同比 %）、NATIONAL_SEQUENTIAL（环比 %）
 * - PPI 工业生产者出厂价格指数：reportName=RPT_ECONOMY_PPI
 *     字段 BASE_SAME（PPI 同比 %）
 * 已在本环境 egress 验证：reportName=RPT_ECONOMY_CPI/PPI 返回真实数据（code:0）。
 *
 * 遵守「诚实数据」红线：真实源不可达 / 返回错误包 / 解析无有效点 →
 * 抛出 MacroUnavailableError，由路由层降级为 dataSource:'unavailable' / 空数组，
 * 绝不回填伪造/随机的 CPI/PPI 数字。
 *
 * 注意：利率(SHIBOR/LPR/OMO)与宏观日历的 datacenter report 名在本环境尚未验证可达，
 * 故本文件只落地已验证的 CPI/PPI；rates/calendar 仍由 api/macro.ts 占位诚实返回空。
 */

/** 真实宏观源（CPI/PPI）不可用时抛出，供路由层降级为「诚实空」。 */
export class MacroUnavailableError extends Error {
  constructor(msg = '宏观 CPI/PPI 真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'MacroUnavailableError';
  }
}

/** 与 api/macro.ts buildTrend24 契约对齐：近 N 月 CPI/PPI 同比走势 */
export interface MacroTrendPoint {
  month: string; // YYYY-MM
  cpi: number; // 全国 CPI 同比 %
  ppi: number; // 工业生产者出厂价格 同比 %
}

const FETCH_TIMEOUT_MS = 8000;
const DATACENTER_BASE = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

/** 带超时的 JSON 抓取（复用 newsDataService / realMarketData 风格） */
async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com/' },
    });
    if (!resp.ok) throw new MacroUnavailableError(`HTTP ${resp.status}`);
    const json = (await resp.json()) as any;
    // 东财数据中心错误包：{ success:false, code:9501, message:'报表配置不存在' }
    if (json?.success === false) {
      throw new MacroUnavailableError(json?.message ? `源错误: ${json.message}` : '源返回错误包');
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(reportName: string, columns: string, pageSize: number): string {
  const params = new URLSearchParams({
    reportName,
    columns,
    pageNumber: '1',
    pageSize: String(pageSize),
    sortColumns: 'REPORT_DATE',
    sortTypes: '-1', // 最新在前
    source: 'WEB',
    client: 'WEB',
  });
  return `${DATACENTER_BASE}?${params.toString()}`;
}

function monthOf(reportDate: unknown): string {
  const s = String(reportDate ?? '');
  // 形如 "2026-07-01 00:00:00" → "2026-07"
  const m = s.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : '';
}

/** 从东财包解析出 { month -> 同比值 } 映射；无效行跳过 */
function toMonthMap(json: any, valueKey: string): Map<string, number> {
  const list: any[] = json?.result?.data;
  const map = new Map<string, number>();
  if (!Array.isArray(list)) return map;
  for (const it of list) {
    const month = monthOf(it?.REPORT_DATE);
    const v = Number(it?.[valueKey]);
    if (!month || !Number.isFinite(v)) continue;
    if (!map.has(month)) map.set(month, v); // 取最新一条（已按 REPORT_DATE 倒序）
  }
  return map;
}

/**
 * 获取近 limit 个月 CPI / PPI 同比走势（真实源）。
 * 任一源失败或解析不到有效点 → 抛 MacroUnavailableError。
 * 仅返回「CPI 与 PPI 同月都有值」的点，缺失月份不编造。
 */
export async function getMacroCpiPpi(limit = 24): Promise<MacroTrendPoint[]> {
  const safeLimit = Math.max(1, Math.min(limit, 60));

  const [cpiJson, ppiJson] = await Promise.all([
    fetchJson(buildUrl('RPT_ECONOMY_CPI', 'REPORT_DATE,TIME,NATIONAL_SAME', safeLimit)),
    fetchJson(buildUrl('RPT_ECONOMY_PPI', 'REPORT_DATE,TIME,BASE_SAME', safeLimit)),
  ]);

  const cpiMap = toMonthMap(cpiJson, 'NATIONAL_SAME');
  const ppiMap = toMonthMap(ppiJson, 'BASE_SAME');

  if (cpiMap.size === 0 || ppiMap.size === 0) {
    throw new MacroUnavailableError('CPI/PPI 源返回空或解析失败');
  }

  const points: MacroTrendPoint[] = [];
  // 以 CPI 月份为主，合并同月 PPI；仅保留两者齐全的月份
  for (const [month, cpi] of cpiMap) {
    const ppi = ppiMap.get(month);
    if (ppi === undefined) continue;
    points.push({ month, cpi, ppi });
  }

  if (points.length === 0) {
    throw new MacroUnavailableError('CPI/PPI 月份未对齐，无可用合并点');
  }

  // 时间序列按月份升序（旧→新），便于前端折线图直接渲染
  points.sort((a, b) => a.month.localeCompare(b.month));
  return points;
}
