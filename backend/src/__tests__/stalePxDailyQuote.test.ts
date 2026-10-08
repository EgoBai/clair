/**
 * 陈旧价伪行回归测试（P0-STALEPX）
 *
 * ## 缺陷
 * 退市 / 长期停牌标的，腾讯实时接口（`qt.gtimg.cn`）**仍会返回一行数据**，
 * 且这行数据里：
 *   - `parts[5]`（开盘价）= 0
 *   - `parts[6]`（成交量）= 0
 *   - `parts[3]`（现价）  = **最后一次已知收盘价**（陈旧价）
 *   - `parts[30]`（session 时间戳）= **当天**，形如 `20261008090000`
 *
 * 最后一条是关键：P0-SMEARED 的「交易日守卫」只校验 session 日期能不能解析，
 * 而退市标的的 session 日期**确实是当天**，于是守卫放行，
 * 于是「开盘价 0 + 陈旧收盘价」被当成当天行情写进 `daily_quotes`。
 *
 * ## 实测危害（本地 PG 实测 + 腾讯线上交叉验证，非推测）
 * `daily_quotes` 中 `open_price = 0 AND volume = 0` 的行共 **21558 行**，
 * 跨 **476 只标的 / 68 个交易日**。全量证伪（476/476 只标的逐行核对上游
 * 日K）确认：**这些行在其日期上，上游没有任何真实 K 线**，即全部是伪造的。
 * 典型：600005 武钢股份真实最后一根 K 线是 2017-01-23 收 3.71，
 * 库里 2026-10-08/ 10-09 各有一行 close=3.71、high=low=3.71、volume=0。
 *
 * 现状复现：此刻对 476 只标的拉实时快照，其中 **362 只**的开盘价与成交量
 * 均为 0 且 session 可解析 —— 修复前跑一次采集就会再造 362 行伪数据
 *（与实测「每日约 358~362 行」完全吻合）。
 *
 * ## 修法
 * 当日零成交（开盘价或成交量为 0）的标的**不写这一行**。
 * 缺行= 数据缺失，是诚实的；写陈旧价 + 0 开盘价则会让「最新价」变成假数据。
 *
 * ## 测试数据
 * 全部是**真实抓取**的腾讯线上报文（已 iconv 转 UTF-8，逐字保留），不是手编构造。
 */
import { describe, it, expect } from 'vitest';
import { DataSyncService } from '../data-sync/DataSyncService';

/**
 * 真实抓取：000003 PT金田A（已退市，最后成交 2002-04-26 收 2.71）。
 *
 * 这是**最关键的一个样本** —— session 时间戳正好落在 `parts[30]`、
 * 值是当天（2026-10-08），因此现有 P0-SMEARED 交易日守卫会**放行**，
 * 修复前必然写出一行伪数据。
 *
 * 注意：退市股报文长度随字段数而变，600005 的 session 落在 `parts[32]`，
 * 反而会被守卫拦下 —— 所以这里用 PT金田A 验证「守卫放行」这条路径。
 */
const REAL_DELISTED_PAYLOAD =
  'v_sz000003="51~PT金田A~000003~2.71~2.71~0.00~0~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261008090000~0.00~0.00~0.00~0.00~2.71/0/0~0~0~0.00~78.43~D~0.00~0.00~0.00~5.20~9.04~-0.27~-1~-1~0.00~0~0.00~-51.21~78.43~~~~0.0000~0.0000~0~ ~GP-A~0.00~0.00~0.00~-1.15~0.95~~~0.00~0.00~0.00~191808910~333433584~~0.00~191808910~~~0.00~0.00~~CNY~0~~0.00~0~";';

/** 真实抓取：600005 武钢股份（已退市，最后成交 2017-01-23 收 3.71），session 落在 parts[32] */
const REAL_DELISTED_600005 =
  'v_sh600005="1~武钢股份~600005~3.71~3.71~0.00~0~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20261008090000~0.00~0.00~0.00~0.00~3.71/0/0~0~0~0.00~339.16~D~0.00~0.00~0.00~374.48~374.48~1.30~-1~-1~0.00~0~0.00~339.16~339.16~~~~0.0000~0.0000~0~ ~GP-A~0.00~0.00~0.00~0.39~0.15~~~0.00~0.00~0.00~10093779823~10093779823~~0.00~10093779823~~~0.00~0.00~~CNY~0~~0.00~0~";';

/** 真实抓取：600000 浦发银行（正常交易），对照组 —— 字段结构与退市股完全一致 */
const REAL_LIVE_PAYLOAD =
  'v_sh600000="1~浦发银行~600000~9.70~9.48~9.45~1150269~695633~454636~9.69~1671~9.68~4457~9.67~5040~9.66~1631~9.65~5243~9.70~15599~9.71~13880~9.72~20266~9.73~9457~9.74~9159~~20261008161457~0.22~2.32~9.71~9.41~9.70/1150269/1106982193~1150269~110698~0.35~6.31~~9.71~9.41~3.16~3230.67~3230.67~0.43~10.43~8.53~1.28~-50319~9.62~5.22~6.46~~~0.01~110698.2193~13.7740~142~   A~GP-A~-19.30~8.02~4.33~6.14~0.50~13.11~8.07~6.59~4.53~13.05~33305838300~33305838300~-58.24~-16.23~33305838300~~~-15.51~0.10~~CNY~0~___D__F__N~9.75~-11603~";';

type Parsed = Array<{
  symbol: string;
  name: string;
  currentPrice: number;
  openPrice: number;
  volume: number;
  sessionDate: string;
}>;

/**
 * 直接打在**真实生产方法**上（经类型断言取 private 方法），
 * 避免「复制一份逻辑自己测自己」——那种测试在缺陷发生时也会跟着一起错。
 */
function parseQuotes(raw: string): Parsed {
  const svc = new DataSyncService();
  const fn = (svc as unknown as {
    parseTencentResponse: (r: string) => Parsed;
  }).parseTencentResponse;
  return fn.call(svc, raw);
}

/** 取报文 `~` 分隔后的字段数组（与生产 `match[2].split('~')` 口径一致） */
const fields = (raw: string) => raw.split('"')[1].split('~');

describe('P0-STALEPX 陈旧价伪行回归', () => {
  it('前提：退市标的的 session 时间戳落在 parts[30] 且是「当天」——这正是交易日守卫放行的原因', () => {
    const p = fields(REAL_DELISTED_PAYLOAD);
    expect(p[30]).toBe('20261008090000');
    // session 日期 = 2026-10-08，是一个真实交易日 → 交易日守卫必然放行
    const sessionDate = `${p[30].slice(0, 4)}-${p[30].slice(4, 6)}-${p[30].slice(6, 8)}`;
    expect(sessionDate).toBe('2026-10-08');
  });

  it('前提：退市标的的开盘价与成交量确为 0，而价格是陈旧收盘价', () => {
    const p = fields(REAL_DELISTED_PAYLOAD);
    expect(Number(p[5])).toBe(0); // 开盘价
    expect(Number(p[6])).toBe(0); // 成交量
    expect(Number(p[3])).toBe(2.71); // 陈旧收盘价（= 2002-04-26 真实最后收盘）
  });

  it('退市标的：解析结果为空 —— 不产出任何行情行', () => {
    expect(parseQuotes(REAL_DELISTED_PAYLOAD)).toEqual([]);
  });

  it('另一只退市股 600005：同样不产出行情行', () => {
    expect(parseQuotes(REAL_DELISTED_600005)).toEqual([]);
  });

  it('正常交易标的：照常解析，不被守卫误伤', () => {
    const q = parseQuotes(REAL_LIVE_PAYLOAD);
    expect(q).toHaveLength(1);
    expect(q[0].symbol).toBe('600000.SH');
    expect(q[0].openPrice).toBeGreaterThan(0);
    expect(q[0].volume).toBeGreaterThan(0);
    expect(q[0].sessionDate).toBe('2026-10-08');
  });

  it('混合批次：只保留有真实成交的那些，退市股被剔除', () => {
    const q = parseQuotes(
      `${REAL_DELISTED_PAYLOAD}\n${REAL_DELISTED_600005}\n${REAL_LIVE_PAYLOAD}`,
    );
    expect(q.map((x) => x.symbol)).toEqual(['600000.SH']);
  });

  it('任一字段为 0 都算当日无成交（开盘价 0 或成交量 0 都必须剔除）', () => {
    const p = fields(REAL_LIVE_PAYLOAD);
    const withZeroOpen = [...p];
    withZeroOpen[5] = '0.00';
    expect(parseQuotes(`v_sh600000="${withZeroOpen.join('~')}";`)).toEqual([]);

    const withZeroVol = [...p];
    withZeroVol[6] = '0';
    expect(parseQuotes(`v_sh600000="${withZeroVol.join('~')}";`)).toEqual([]);
  });

  it('盘后快照仍带非零开盘价/成交量，故活股不会被误剔除', () => {
    // 采集每 300s 跑一次、无交易时段门禁，必须确认盘后不会把活股全滤掉
    const q = parseQuotes(REAL_LIVE_PAYLOAD);
    expect(q[0].openPrice).toBe(9.45);
    expect(q[0].volume).toBe(1150269);
  });
});
