/**
 * P0-QFQ：K 线同步口径回归测试
 *
 * ## 这个测试要锁住什么
 * 1. **不复权口径**：`fetchTencentKLine` 必须取「不复权」价，与本库 `daily_quotes`
 *    既有口径一致。旧实现请求 `...,qfq`（前复权），会把除权除息日之前的整段历史
 *    写成前复权价，导致同一只股票的历史序列在除权日「跳变」、收益率算错。
 * 2. **端点降级**：主端点失败必须降级到备用端点，且**不能静默失败**（不能返回空数组）。
 * 3. **日期真源**：K 线路径的日期真源是响应数组 `item[0]`（上游给的真实交易日），
 *    **不是** `parts[30]`（那是腾讯「实时行情」接口的字段，K 线响应里根本没有）。
 * 4. **非法日期不兜底**：上游给了坏日期就丢弃该行，绝不退回本地时钟。
 * 5. **非交易日不落库**：必须过 `isTradingDay()`，且跳过要计数上报。
 * 6. **日期本地化**：写库用 `sessionDateToLocalNoon()`，避免 `new Date('YYYY-MM-DD')`
 *    的 UTC 解析在负时区退化成前一天。
 * 7. **成交额口径**：腾讯 `newfqkline` 的 index 6 是**除权信息对象**（`{}`），不是数字。
 *    旧实现 `parseFloat(item[6])` → NaN → 成交额恒为 0。真实成交额在 index 8（万元）。
 *
 * ## 实测口径基准（601390.SH，2026-10-08 除权 10派0.6374）
 * 见 `P0-QFQ 实测` 用例注释里的逐日对照，数据取自腾讯 newfqkline 真实响应。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mock 依赖：db / axios ────────────────────────────────────────────────
const createDailyQuote = vi.fn(async () => ({ id: 1 }));
const getStockBySymbol = vi.fn(async (symbol: string) => ({
  id: 7,
  symbol,
  name: '中国中铁',
  market: 'SH',
  isActive: true,
}));

vi.mock('../db/dbFactory', () => ({
  db: {
    createDailyQuote: (...a: unknown[]) => createDailyQuote(...(a as [])),
    getStockBySymbol: (...a: unknown[]) => getStockBySymbol(...(a as [])),
    createStock: vi.fn(),
    updateStock: vi.fn(),
    getStockById: vi.fn(),
  },
  getDb: vi.fn(),
  getDbType: vi.fn(() => 'postgres'),
}));

vi.mock('../db/InMemoryDatabase', () => ({ getInMemoryDb: vi.fn() }));
vi.mock('../websocket/server', () => ({ wsService: { broadcast: vi.fn() } }));

const axiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { get: (...a: unknown[]) => axiosGet(...(a as [])) },
}));

import { DataSyncService } from '../data-sync/DataSyncService';

/** 真实上游响应的字段布局（腾讯 newfqkline，实测 601390不复权 40 日）：
 *  0=日期 1=开 2=收 3=高 4=低 5=成交量(手) 6=除权信息对象 7=换手率% 8=成交额(万元)
 * 末两轮为 9/10 占位。注意 index 6 是**对象**，parseFloat 会得到 NaN。
 */
type Row = [string, string, string, string, string, string, Record<string, unknown> | string, string, string];

/** 构造腾讯 K 线响应体 */
function tencentResp(sym: string, rows: Row[]) {
  return { code: 0, msg: '', data: { [sym]: { day: rows, qt: {}, version: '1' } } };
}

/**
 * 601390.SH 真实实测数据（不复权 vs 前复权）。
 * 除权日 2026-10-08（10派0.6374），除权日之前 qfq 与不复权**逐日不同**。
 * 数据来源：web.ifzq.gtimg.cn/appstock/app/newfqkline/get
 */
const RAW_601390: Row[] = [
  ['2026-09-29', '4.22', '4.25', '4.26', '4.20', '593115.00', {}, '0.29', '25311.51'],
  ['2026-09-30', '4.25', '4.33', '4.34', '4.24', '640447.00', {}, '0.32', '27362.10'],
  ['2026-10-08', '4.28', '4.28', '4.31', '4.26', '809988.00', {}, '0.40', '34697.20'],
];
const QFQ_601390: Row[] = [
  ['2026-09-29', '4.16', '4.19', '4.20', '4.14', '593115.00', {}, '0.29', '25311.51'],
  ['2026-09-30', '4.19', '4.27', '4.28', '4.18', '640447.00', {}, '0.32', '27362.10'],
  ['2026-10-08', '4.28', '4.28', '4.31', '4.26', '809988.00', {}, '0.40', '34697.20'],
];

/** 取出 axios 调用参数里的 param 字符串 */
function paramOf(callIdx: number): string {
  const [, opts] = axiosGet.mock.calls[callIdx] as [string, { params: { param: string } }];
  return opts.params.param;
}
function urlOf(callIdx: number): string {
  return (axiosGet.mock.calls[callIdx] as [string])[0];
}

const svc = new DataSyncService();
/** 私有方法访问口（测试白名单内，仅本文件使用） */
const priv = svc as unknown as {
  fetchTencentKLine(sym: string, days: number): Promise<
    { symbol: string; tradeDate: string; openPrice: number; closePrice: number; highPrice: number; lowPrice: number; volume: number; turnover: number; turnoverRate: number }[]
  >;
};

beforeEach(() => {
  axiosGet.mockReset();
  createDailyQuote.mockClear();
  getStockBySymbol.mockClear();
  createDailyQuote.mockImplementation(async () => ({ id: 1 }));
  getStockBySymbol.mockImplementation(async (symbol: string) => ({
    id: 7, symbol, name: '中国中铁', market: 'SH', isActive: true,
  }));
});

afterEach(() => vi.restoreAllMocks());

describe('P0-QFQ · K线不复权口径', () => {
  it('P0-QFQ 实测：601390 除权前区间必须返回不复权价（qfq≠不复权，真能区分）', async () => {
    // 上游按请求参数返回不同口径：只要 param 里带 qfq 就给前复权数据。
    axiosGet.mockImplementation(async () => {
      const p = paramOf(axiosGet.mock.calls.length - 1);
      return { data: tencentResp('sh601390', p.includes('qfq') ? QFQ_601390 : RAW_601390) };
    });

    const rows = await priv.fetchTencentKLine('601390.SH', 10);

    expect(rows).toHaveLength(3);
    // 2026-09-30：不复权收4.33，前复权收 4.27 —— 断言拿到不复权那组
    const r0930 = rows.find((r) => r.tradeDate === '2026-09-30')!;
    expect(r0930.closePrice).toBe(4.33);
    expect(r0930.openPrice).toBe(4.25);
    expect(r0930.closePrice).not.toBe(4.27);

    // 2026-09-29：不复权 4.25 vs qfq 4.19
    expect(rows.find((r) => r.tradeDate === '2026-09-29')!.closePrice).toBe(4.25);
    // 除权日当天两者一致，但整段序列必须全部是不复权口径
    expect(rows.every((r) => r.closePrice !== 4.19 && r.closePrice !== 4.27)).toBe(true);
  });

  it('请求参数不得带 qfq（显式锁死复权口径开关）', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    await priv.fetchTencentKLine('601390.SH', 10);
    const p = paramOf(0);
    expect(p).not.toContain('qfq');
    expect(p).not.toContain('hfq');
  });

  it('成交额取 index 8（万元→元），不取 index 6 的除权对象', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    const rows = await priv.fetchTencentKLine('601390.SH', 10);
    // 2026-10-08 实测成交额 34697.20 万元 → 346972000 元
    expect(rows.find((r) => r.tradeDate === '2026-10-08')!.turnover).toBe(346972000);
    // 旧实现把 index 6 的 {} 喂给 parseFloat → NaN → 0
    expect(rows.every((r) => r.turnover > 0)).toBe(true);
  });

  it('换手率取 index 7（不再硬编码 0）', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    const rows = await priv.fetchTencentKLine('601390.SH', 10);
    expect(rows.find((r) => r.tradeDate === '2026-10-08')!.turnoverRate).toBeCloseTo(0.4, 4);
  });
});

describe('P0-QFQ · 端点降级', () => {
  it('上游若返回 qfqday（前复权）必须拒绝，不得混入不复权库', async () => {
    // 构造上游违约：给了前复权数据，但数组 key 是 qfqday
    axiosGet.mockResolvedValue({
      data: { code: 0, msg: '', data: { sh601390: { qfqday: QFQ_601390 } } },
    });

    // 该端点视为解析失败 → 降级到下一个；两个端点都如此 → 抛错（绝不静默接受前复权）
    await expect(priv.fetchTencentKLine('601390.SH', 10)).rejects.toThrow(/端点/);
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('主端点失败时降级到备用端点，且不静默返回空', async () => {
    let n = 0;
    axiosGet.mockImplementation(async (url: string) => {
      n++;
      if (n === 1) throw new Error('connect ECONNRESET');
      return { data: tencentResp('sh601390', RAW_601390) };
    });

    const rows = await priv.fetchTencentKLine('601390.SH', 10);

    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(urlOf(1)).not.toBe(urlOf(0));
    expect(rows).toHaveLength(3);
    expect(rows[0].closePrice).toBe(4.25);
  });

  it('主端点返回 WAF 拦截页（HTML/501）时也要降级', async () => {
    let n = 0;
    axiosGet.mockImplementation(async () => {
      n++;
      // 实测 web.ifzq.gtimg.cn 老 fqkline 路径返回 HTTP 501 + WAF HTML
      if (n === 1) return { status: 501, data: '<!DOCTYPE html><html>waf.tencent.com/501page.html</html>' };
      return { data: tencentResp('sh601390', RAW_601390) };
    });

    const rows = await priv.fetchTencentKLine('601390.SH', 10);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.tradeDate === '2026-09-30')!.closePrice).toBe(4.33);
  });

  it('全部端点失败时抛错，不返回空数组冒充成功', async () => {
    axiosGet.mockRejectedValue(new Error('all endpoints down'));
    await expect(priv.fetchTencentKLine('601390.SH', 10)).rejects.toThrow();
  });
});

describe('P0-QFQ · 日期真源与不兜底', () => {
  it('非法日期的行被丢弃，绝不退回本地时钟', async () => {
    const bad: Row[] = [
      ['2026-10-08', '4.28', '4.28', '4.31', '4.26', '809988.00', {}, '0.40', '34697.20'],
      ['not-a-date', '1', '2', '3', '4', '5', {}, '1', '1'],
      ['2026-13-45', '1', '2', '3', '4', '5', {}, '1', '1'],
    ];
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', bad) });

    const rows = await priv.fetchTencentKLine('601390.SH', 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].tradeDate).toBe('2026-10-08');
    // 绝不能出现今天（本地时钟）伪造成的数据行。
    // ⚠️ 此处**刻意不断言「结果里不含今天」**：该断言只在「今天 ≠ 上游给定日期」时成立，
    // 而 CI 跑在 UTC、本地是 UTC+8，同一时刻算出的localToday 可能恰好等于
    // 测试数据里的合法日期 2026-10-08 ⟹ 那时两条断言会自相矛盾而必红。
    // 反例已实测：`2026-13-45` / `not-a-date` 若被本地时钟兜底成今天，
    // 就会产生 rows.length > 1 —— 下面这行已能在任何时区下抓住它。
    expect(rows).toHaveLength(1);
    // 且返回的日期必须全部来自上游给定的合法日期集合（非法日期行已被丢弃）
    expect(rows.every((r) => r.tradeDate === '2026-10-08')).toBe(true);
  });
});

describe('P0-QFQ · syncKLineData 写入路径', () => {
  it('非交易日跳过并计数上报，不落库', async () => {
    const rows: Row[] = [
      ['2026-09-30', '4.25', '4.33', '4.34', '4.24', '640447.00', {}, '0.32', '27362.10'],
      ['2026-10-01', '4.30', '4.35', '4.36', '4.29', '100.00', {}, '0.01', '43.50'],
      ['2026-10-05', '4.30', '4.35', '4.36', '4.29', '100.00', {}, '0.01', '43.50'],
    ];
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', rows) });

    const res = await svc.syncKLineData('601390.SH', 10);

    expect(createDailyQuote).toHaveBeenCalledTimes(1);
    expect(res.quotesSaved).toBe(1);
    expect(res.errors.join('|')).toMatch(/非交易日|跳过/);
  });

  it('tradeDate 用本地正午，不受 UTC 解析影响（负时区不退化前一天）', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    await svc.syncKLineData('601390.SH', 10);

    const dates = createDailyQuote.mock.calls.map(
      (c) => (c[0] as { tradeDate: Date }).tradeDate,
    );
    expect(dates).toHaveLength(3);
    // 每一行都必须是本地正午 12 点，且日历日与上游给的日期逐日相同
    expect(dates.every((d) => d instanceof Date && d.getHours() === 12)).toBe(true);
    expect(dates.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`))
      .toEqual(['2026-09-29', '2026-09-30', '2026-10-08']);
  });

  it('change_amount = 收 − 前收盘（不是收 − 开）', async () => {
    // 2026-09-30：不复权收 4.33，前一交易日（09-29）收 4.25，当日开盘 4.25
    // → 正确口径 4.33−4.25=0.08；错误口径（收−开）恰好也是 0.08，故**改用 09-29 行做区分**：
    // 09-29 收 4.25、开 4.22，前收盘是更早一日，故用10-08 行验证「首行无前收盘 → null」。
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    await svc.syncKLineData('601390.SH', 10);

    const args = createDailyQuote.mock.calls.map((c) => c[0] as Record<string, number | Date | null>);
    const byDay = (day: number) =>
      args.find((a) => (a.tradeDate as Date).getDate() === day)!;

    // 首行（09-29）无前收盘基准 → 涨跌留 NULL，不拿开盘价顶替
    expect(byDay(29).change).toBeNull();
    expect(byDay(29).changePercent).toBeNull();

    // 09-30：前收盘 = 09-29 收盘 4.25 → 4.33 − 4.25 = 0.08
    expect(byDay(30).change).toBeCloseTo(0.08, 4);
    expect(byDay(30).changePercent).toBeCloseTo((0.08 / 4.25) * 100, 3);
    // 收−开 = 4.33−4.25 = 0.08（本例两值巧合相同），故用 10-08 行做真正区分：
    // 前收盘 09-30 收 4.33，当日开 4.28 收 4.28 → 收−开 = 0，但 收−前收盘 = −0.05
    expect(byDay(8).change).toBeCloseTo(-0.05, 4);
    expect(byDay(8).change).not.toBe(0);
    expect(byDay(8).changePercent).toBeCloseTo((-0.05 / 4.33) * 100, 3);
  });

  it('amplitude = (高−低)/开 × 100', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    await svc.syncKLineData('601390.SH', 10);
    const arg = createDailyQuote.mock.calls
      .map((c) => c[0] as Record<string, number | Date>)
      .find((a) => (a.tradeDate as Date).getDate() === 30)!;
    expect(arg.amplitude).toBeCloseTo(((4.34 - 4.24) / 4.25) * 100, 3);
  });

  it('不编造 market_cap / pe / pb', async () => {
    axiosGet.mockResolvedValue({ data: tencentResp('sh601390', RAW_601390) });
    await svc.syncKLineData('601390.SH', 10);
    for (const c of createDailyQuote.mock.calls) {
      const a = c[0] as Record<string, unknown>;
      expect(a.marketCap ?? null).toBeNull();
      expect(a.peRatio ?? null).toBeNull();
      expect(a.pbRatio ?? null).toBeNull();
    }
  });
});
