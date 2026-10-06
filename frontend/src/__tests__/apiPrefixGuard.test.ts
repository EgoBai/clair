/**
 * P0-DUALPREFIX 回归守卫：axios 请求路径不得出现 `/api/api`
 *
 * ## 这个测试在防什么
 *
 * `config/apiBase.ts` 的 `API_BASE_URL`（= axios 的 `baseURL`）**已经含 `/api`**：
 *   - dev：`/api`（交给 Vite proxy 转发到 127.0.0.1:3001）
 *   - 生产：`https://<后端域名>/api`
 *
 * 因此 `services/api.ts` 里每个调用点的路径必须是**相对 baseURL** 的形态
 * （`/top-traders/overview`），而不是**完整后端路径**（`/api/top-traders/overview`）。
 *
 * 后者会拼出 `/api/api/top-traders/overview` —— dev 与生产**双双必然 404**。
 * 这不是理论风险：龙虎榜、大宗交易、限售解禁、盘口/分时、AI 推荐等真实用户页面
 * 曾经整体挂掉，且**不报任何错**（axios 只看到一个 404 JSON）。
 *
 * 正确写法已在仓内形成既有约定，本测试把它固化成不可回退的断言：
 *   - `services/breadthService.ts` → `apiService.get('/breadth/current')`
 *   - `services/aiClient.ts`→ 用 `API_ORIGIN`（根地址，自己拼 `/api/xxx`）
 *
 * 与 `apiCacheStrategy.test.ts` 那种用字符串当缓存 key 的测试不同，本测试
 * 真的走 axios 实例、真的捕获最终发出的 URL —— 断言的是**行为**而非字面量。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 捕获到的 axios 请求：baseURL + 调用点传入的 path。 */
interface CapturedRequest {
  baseURL: string;
  url: string;
  /** axios 实际会发出的完整 URL（复刻其拼接语义：baseURL + url）。 */
  resolved: string;
}

const captured: CapturedRequest[] = [];

/** 复刻 axios 的 baseURL + url 拼接语义。 */
function resolveUrl(baseURL: string | undefined, url: string): string {
  if (!baseURL) return url;
  if (/^https?:\/\//i.test(url)) return url; // 绝对 URL 覆盖 baseURL
  return `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

const fakeClient = {
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
  get: vi.fn(async (url: string, config?: { baseURL?: string; params?: object }) => {
    // `healthCheck` 显式传 baseURL: '' —— 那是有意绕过 baseURL 直连相对路径，
    // 必须原样保留，故这里取 config.baseURL ?? 实例默认 baseURL。
    const baseURL = config && 'baseURL' in config ? config.baseURL : defaultBaseURL;
    captured.push({ baseURL: baseURL ?? '', url, resolved: resolveUrl(baseURL, url) });
    return { data: { success: true, data: {}, status: 'healthy' } };
  }),
  post: vi.fn(async () => ({ data: { success: true, data: {} } })),
  put: vi.fn(async () => ({ data: { success: true, data: {} } })),
  delete: vi.fn(async () => ({ data: { success: true, data: {} } })),
};

/** axios.create 时捕获到的实例级baseURL。 */
let defaultBaseURL = '';

vi.mock('axios', () => {
  const isAxiosError = () => false;
  return {
    default: {
      create: vi.fn((cfg: { baseURL?: string }) => {
        defaultBaseURL = cfg?.baseURL ?? '';
        return fakeClient;
      }),
      isAxiosError,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
    isAxiosError,
  };
});

// apiBase 在测试环境下 import.meta.env.DEV 为 true → API_BASE_URL === '/api'
import { API_BASE_URL } from '../config/apiBase';
import {
  fetchOrderBook,
  fetchTimeShare,
  fetchMarginOverview,
  fetchMarginData,
  fetchMarginRank,
  fetchMarginTrend,
  fetchTopTraderOverview,
  fetchTopTraderOverviewTyped,
  fetchTopTraderDetail,
  fetchTopTraderHistory,
  fetchTopTraderSeatRank,
  fetchBlockTrades,
  fetchBlockTradeOverview,
  fetchBlockTradeHistory,
  fetchLockupCalendar,
  fetchLockupRank,
  fetchLockupHistory,
  fetchAIRecommendations,
  fetchAIDiagnosis,
  fetchAISectorRotation,
  fetchAIAlertSuggestions,
} from '../services/api';

/** 每个导出函数 → 它应该请求的后端路径（相对 baseURL，不含 /api）。 */
const CASES: Array<{ name: string; call: () => Promise<unknown>; expected: string }> = [
  { name: 'fetchOrderBook', call: () => fetchOrderBook('600519'), expected: '/order-book/600519' },
  { name: 'fetchTimeShare', call: () => fetchTimeShare('600519'), expected: '/time-share/600519' },
  { name: 'fetchMarginOverview', call: () => fetchMarginOverview(), expected: '/margin/overview' },
  { name: 'fetchMarginData', call: () => fetchMarginData('600519'), expected: '/margin/600519' },
  { name: 'fetchMarginRank', call: () => fetchMarginRank('all'), expected: '/margin/rank/all' },
  { name: 'fetchMarginTrend', call: () => fetchMarginTrend(30), expected: '/margin/trend' },
  {
    name: 'fetchTopTraderOverview',
    call: () => fetchTopTraderOverview('2026-09-30'),
    expected: '/top-traders/overview',
  },
  {
    name: 'fetchTopTraderOverviewTyped',
    call: () => fetchTopTraderOverviewTyped('2026-09-30'),
    expected: '/top-traders/overview',
  },
  {
    name: 'fetchTopTraderDetail',
    call: () => fetchTopTraderDetail('600519'),
    expected: '/top-traders/600519',
  },
  {
    name: 'fetchTopTraderHistory',
    call: () => fetchTopTraderHistory('600519'),
    expected: '/top-traders/history/600519',
  },
  {
    name: 'fetchTopTraderSeatRank',
    call: () => fetchTopTraderSeatRank(),
    expected: '/top-traders/seat/rank',
  },
  { name: 'fetchBlockTrades', call: () => fetchBlockTrades({ date: '2026-09-30' }), expected: '/block-trades' },
  { name: 'fetchBlockTradeOverview', call: () => fetchBlockTradeOverview(), expected: '/block-trades/overview' },
  {
    name: 'fetchBlockTradeHistory',
    call: () => fetchBlockTradeHistory('600519'),
    expected: '/block-trades/600519',
  },
  { name: 'fetchLockupCalendar', call: () => fetchLockupCalendar(2026, 10), expected: '/lockup/calendar' },
  { name: 'fetchLockupRank', call: () => fetchLockupRank(2026, 10), expected: '/lockup/rank' },
  { name: 'fetchLockupHistory', call: () => fetchLockupHistory('600519'), expected: '/lockup/600519' },
  {
    name: 'fetchAIRecommendations',
    call: () => fetchAIRecommendations('balanced'),
    expected: '/ai/recommendations',
  },
  { name: 'fetchAIDiagnosis', call: () => fetchAIDiagnosis('600519'), expected: '/ai/diagnose/600519' },
  { name: 'fetchAISectorRotation', call: () => fetchAISectorRotation(), expected: '/ai/sector-rotation' },
  { name: 'fetchAIAlertSuggestions', call: () => fetchAIAlertSuggestions(), expected: '/ai/alert-suggestions' },
];

describe('P0-DUALPREFIX: axios 请求路径必须是单 /api 前缀', () => {
  beforeEach(() => {
    captured.length = 0;
    vi.clearAllMocks();
    fakeClient.get.mockImplementation(async (url: string, config?: { baseURL?: string }) => {
      const baseURL = config && 'baseURL' in config ? config.baseURL : defaultBaseURL;
      captured.push({ baseURL: baseURL ?? '', url, resolved: resolveUrl(baseURL, url) });
      return { data: { success: true, data: { rank: [] }, status: 'healthy' } };
    });
  });

  it('baseURL 本身已含 /api（守住本测试的前提）', () => {
    // 若哪天有人把 resolveApiBase 改成返回根地址，本测试必须先失败，
    // 否则下面的「不含 /api/api」断言会变成空断言、失去意义。
    expect(API_BASE_URL.endsWith('/api')).toBe(true);
  });

  it.each(CASES)('$name 的调用点路径不含 /api 前缀', async ({ call, expected }) => {
    await call();
    expect(captured).toHaveLength(1);
    // 调用点传入的必须是相对 baseURL 的路径
    expect(captured[0].url.startsWith('/api/')).toBe(false);
    expect(captured[0].url.startsWith(expected)).toBe(true);
  });

  it.each(CASES)('$name 最终请求 URL 不含 /api/api', async ({ call }) => {
    await call();
    expect(captured).toHaveLength(1);
    expect(captured[0].resolved).not.toContain('/api/api');
    // 单前缀：baseURL 的 /api + 路径自身的首段
    expect(captured[0].resolved.match(/\/api\//g)).toHaveLength(1);
    expect(captured[0].resolved.startsWith('/api/')).toBe(true);
  });

  it('双前缀形态会被本测试抓住（反向自检：/api/top-traders/overview 必须失败）', () => {
    // 这条不是形式主义断言：它证明上面的断言对「多一层 /api」真的敏感，
    // 而不是恒真。若将来 resolveUrl 的语义变了，这里会先报警。
    expect(resolveUrl('/api', '/api/top-traders/overview')).toContain('/api/api');
    expect(resolveUrl('/api', '/top-traders/overview')).not.toContain('/api/api');
  });
});