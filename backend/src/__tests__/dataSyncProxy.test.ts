/**
 * P0-TXPROXY 回归测试：腾讯行情请求的「代理劫持」与「降级死锁」两个缺陷。
 *
 * ## 被测缺陷（2026-10-21 实测定位，不是推测）
 *
 * ### 缺陷一：axios 走环境代理 → 上游 HTTP 400
 * axios 1.x 自动读 `HTTP_PROXY`/`HTTPS_PROXY`。本机代理 `127.0.0.1:62897`
 * 对 `qt.gtimg.cn` 返回 400，导致 `fetchTencentQuotes` 连续失败并触发降级，
 * 定时同步彻底停摆（日志无限刷「定时同步完成: 0 条」）。
 *
 * ### 缺陷二：降级态是死锁
 * 原实现在函数开头 `if (degraded) return 缓存`，在任何网络请求之前返回，
 * 于是降级后**永远不再发出请求**，永远触发不到「退出降级模式」分支——
 * 即使上游早已恢复也不会自愈，只能重启进程。
 *
 * ## 本测试的桩设计
 * axios 桩按 `config.proxy === false` 分派：
 * - 带 `proxy: false` → 返回 200 + 真实形态的 GBK 行情
 * - 否则 → 抛 `status code 400`
 * 这样若有人回退掉 `proxy: false`，用例 1 会直接失败（而不是仍然绿）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock 掉会触发副作用的依赖（连库 / 加载 5541 只股票 / 起 WebSocket） ──
vi.mock('../db/dbFactory', () => ({ db: {} }));
vi.mock('../db/InMemoryDatabase', () => ({ getInMemoryDb: () => ({ stocks: [] }) }));
vi.mock('../websocket/server', () => ({
  wsService: { pushQuoteUpdate: vi.fn() },
}));

/** 记录 axios.get 的每次调用参数，供断言 */
const axiosGetMock = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => axiosGetMock(...args),
  },
}));

import iconv from 'iconv-lite';
import { DataSyncService } from '../data-sync/DataSyncService';

/**
 * 构造一条真实形态的腾讯行情响应行。
 *
 * 字段索引依据 `parseTencentResponse` 的实际读取位置：
 * [1]名称 [2]代码 [3]现价 [4]昨收 [5]开 [6]量 [30]session时间戳
 * [32]涨跌幅 [33]高 [34]低 [37]成交额(万元) [38]换手 [39]PE [43]振幅
 * [44]流通市值(万) [45]总市值(万) [46]PB
 */
function buildTencentLine(): string {
  const parts: string[] = new Array(50).fill('');
  parts[0] = '1';
  parts[1] = '浦发银行';
  parts[2] = '600000';
  parts[3] = '9.65'; // 现价
  parts[4] = '9.76'; // 昨收
  parts[5] = '9.72'; // 开（非 0，否则被 P0-STALEPX 守卫跳过）
  parts[6] = '359243'; // 成交量（非 0）
  parts[30] = '20261021142418'; // session 时间戳，必须可解析
  parts[32] = '-1.13'; // 涨跌幅%
  parts[33] = '9.76'; // 高
  parts[34] = '9.61'; // 低
  parts[37] = '34720'; // 成交额（万元）→ 应存为 347,200,000 元
  parts[38] = '0.11'; // 换手率
  parts[39] = '6.27'; // PE
  parts[43] = '1.54'; // 振幅
  parts[44] = '3214.01'; // 流通市值（万）
  parts[45] = '3214.01'; // 总市值（万）
  parts[46] = '0.63'; // PB
  return `v_sh600000="${parts.join('~')}"`;
}

/** 把上游文本按 GBK 编码成 Buffer，模拟真实网络字节 */
function gbkBody(text: string): Buffer {
  return iconv.encode(text, 'gbk');
}

describe('fetchTencentQuotes：代理劫持与降级死锁', () => {
  let service: DataSyncService;

  beforeEach(() => {
    axiosGetMock.mockReset();
    service = new DataSyncService();
  });

  it('请求必须带 proxy:false（否则被环境代理打成 HTTP 400）', async () => {
    // 只有 proxy===false 才放行；其余一律 400，模拟本机失效代理的行为
    axiosGetMock.mockImplementation(async (_url: string, config: { proxy?: unknown }) => {
      if (config?.proxy !== false) {
        throw new Error('Request failed with status code 400');
      }
      return { data: gbkBody(buildTencentLine()), status: 200 };
    });

    const quotes = await (service as any).fetchTencentQuotes(['sh600000']);

    // 行为断言：拿到真实行情
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('600000.SH');

    // 配置断言：这就是防回归的核心
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    const config = axiosGetMock.mock.calls[0][1];
    expect(config.proxy).toBe(false);
  });

  it('降级态下间隔内直接返回缓存，不再打网络', async () => {
    axiosGetMock.mockRejectedValue(new Error('Request failed with status code 400'));

    // 连续失败 3 次 → 进入降级（无缓存时第 3 次会 throw）
    for (let i = 0; i < 3; i++) {
      await (service as any).fetchTencentQuotes(['sh600000']).catch(() => undefined);
    }
    expect((service as any).syncState.degraded).toBe(true);
    const callsBefore = axiosGetMock.mock.calls.length;

    // 降级态、间隔内再调 → 不应发出新请求
    await (service as any).fetchTencentQuotes(['sh600000']);
    expect(axiosGetMock.mock.calls.length).toBe(callsBefore);
  });

  it('降级态超过重试间隔会重新探测（打破死锁）', async () => {
    axiosGetMock.mockRejectedValue(new Error('Request failed with status code 400'));

    for (let i = 0; i < 3; i++) {
      await (service as any).fetchTencentQuotes(['sh600000']).catch(() => undefined);
    }
    expect((service as any).syncState.degraded).toBe(true);
    const callsBefore = axiosGetMock.mock.calls.length;

    // 把「上次真实请求时间」改老到超过重试间隔
    (service as any).lastTencentAttemptAt = Date.now() - 120 * 1000;

    await (service as any).fetchTencentQuotes(['sh600000']).catch(() => undefined);

    // 关键：确实又发出了一次真实请求（旧实现在这里会直接 return 缓存）
    expect(axiosGetMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it('降级态探测成功 → 自动退出降级并恢复同步', async () => {
    // 前 3 次失败进降级，之后成功
    let call = 0;
    axiosGetMock.mockImplementation(async (_url: string, config: { proxy?: unknown }) => {
      call++;
      if (call <= 3 || config?.proxy !== false) {
        throw new Error('Request failed with status code 400');
      }
      return { data: gbkBody(buildTencentLine()), status: 200 };
    });

    for (let i = 0; i < 3; i++) {
      await (service as any).fetchTencentQuotes(['sh600000']).catch(() => undefined);
    }
    expect((service as any).syncState.degraded).toBe(true);

    // 越过重试间隔再调一次 → 成功 → 应退出降级
    (service as any).lastTencentAttemptAt = Date.now() - 120 * 1000;
    const quotes = await (service as any).fetchTencentQuotes(['sh600000']);

    expect(quotes).toHaveLength(1);
    expect((service as any).syncState.degraded).toBe(false);
    expect((service as any).tencentFailureCount).toBe(0);
  });

  it('clearDegradation() 后下一次调用立即放行真实请求', async () => {
    // 注意：这里必须让前 3 次**无条件**失败才能进入降级。
    // 若写成「proxy!==false 才失败」，则因为修复已生效（请求带 proxy:false），
    // 前 3 次会全部成功、根本进不了降级态——那反而证明修复是好的。
    let call = 0;
    axiosGetMock.mockImplementation(async (_url: string, config: { proxy?: unknown }) => {
      call++;
      if (call <= 3) throw new Error('Request failed with status code 400');
      if (config?.proxy !== false) throw new Error('Request failed with status code 400');
      return { data: gbkBody(buildTencentLine()), status: 200 };
    });

    for (let i = 0; i < 3; i++) {
      await (service as any).fetchTencentQuotes(['sh600000']).catch(() => undefined);
    }
    expect((service as any).syncState.degraded).toBe(true);

    service.clearDegradation();
    const callsBefore = axiosGetMock.mock.calls.length;

    // 不修改 lastTencentAttemptAt（保持「刚刚才探测过」的状态），
    // 验证 clearDegradation 确实把重试窗口也清零了
    const quotes = await (service as any).fetchTencentQuotes(['sh600000']);

    expect(quotes).toHaveLength(1);
    expect(axiosGetMock.mock.calls.length).toBe(callsBefore + 1);
    expect((service as any).syncState.degraded).toBe(false);
  });

  it('parse 侧 turnover 必须是上游原值（万元），不得在此处乘 1e4', async () => {
    // 这条是**防双乘回归**：万元→元只允许在持久化侧乘一次。
    // 若有人给 parseTencentResponse 的 turnover 加上 * WAN_TO_YUAN，
    // 持久化侧会再乘一次 → 入库值放大 1e4 倍，本条立刻失败。
    axiosGetMock.mockImplementation(async (_url: string, config: { proxy?: unknown }) => {
      if (config?.proxy !== false) throw new Error('Request failed with status code 400');
      return { data: gbkBody(buildTencentLine()), status: 200 };
    });

    const quotes = await (service as any).fetchTencentQuotes(['sh600000']);
    // 上游 parts[37] = 34720（万元），parse 侧应原样返回
    expect(quotes[0].turnover).toBe(34720);
  });
});
