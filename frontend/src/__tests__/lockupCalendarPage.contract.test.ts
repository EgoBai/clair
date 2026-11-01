/**
 * 限售股解禁页响应契约测试（回归：线上「接口 200 却显示接口返回数据格式异常」）
 *
 * 线上实测（2026-11-01，`GET https://clair-api.pages.dev/api/lockup/calendar`）三种形态：
 *   ① ?year=2026&month=11 → 200 {success:true, dataSource:'real', data.expiries 150 条}
 *   ② ?year=2099&month=6  → 200 {success:false, dataSource:'unavailable',
 *        message:'2099-06 东财解禁报表（RPT_LIFT_STAGE）无解禁记录（源可达，属正常空）'}
 *   ③ ?year=2000&month=1  → 200 {success:false, dataSource:'unavailable',
 *        message:'2000-01 东财解禁报表不可达：The operation was aborted；未用任何兜底/随机数据填充'}
 * ②③ 的 data 里 expiries/byDate/summary 形状都齐全（[] / {} / null），结构并不坏。
 * 页面原写法 `if (!json.success || !json.data) throw new Error('接口返回数据格式异常')`
 * 把 ②③ 一律渲染成「接口返回数据格式异常」——把「确实没有 / 取不到」冒充成「接口坏了」。
 *
 * 本文件锁死四件事：
 *   1. ②③ 判为 empty，绝不判为 format（Worker 真实 200/unavailable 响应）
 *   2. 结构真坏（缺 data / data.expiries 不是数组）才是 format
 *   3. 「确实没有」与「取不到」按服务端语义分档，且两者都不写成「格式异常」
 *   4. 四种空态标题两两不同，谁也不冒充谁
 */
import { describe, it, expect } from 'vitest';
import {
  resolveLockupView,
  resolveLockupEmptyView,
  type LockupProblem,
} from '../pages/LockupCalendarPage';
import type { ApiStatus } from '../utils/apiStatus';

/** ① Worker 真实 200 响应（2026-11，150 条里取前 2 条原文，字段值未改写） */
const WORKER_REAL = {
  success: true,
  dataSource: 'real',
  data: {
    year: 2026,
    month: 11,
    expiries: [
      {
        id: 1, symbol: '300395', name: '菲利华', expiryDate: '2026-11-02',
        lockupType: '股权激励限售股份', shareholder: '', totalShares: 548800,
        circulatingBefore: 512296100, unlockRatio: 0.1071, marketValue: 34497568, price: 62.86,
      },
      {
        id: 2, symbol: '301555', name: '惠柏新材', expiryDate: '2026-11-02',
        lockupType: '首发原股东限售股份', shareholder: '', totalShares: 42560075,
        circulatingBefore: 48347250, unlockRatio: 88.03, marketValue: 1147419622, price: 26.96,
      },
    ],
    byDate: { '2026-11-02': [{}, {}] },
    summary: {
      totalStocks: 145, totalEvents: 150,
      totalMarketValue: 111893707622.64001, totalShares: 7537535933, avgUnlockRatio: 46.14,
    },
    dataSource: 'real',
    notes: '东方财富数据中心 RPT_LIFT_STAGE 真实解禁批次；股数为「股」、市值为「元」、解禁比例为百分数。',
  },
  timestamp: '2026-11-01T18:29:34.488Z',
};

/** ② Worker 真实 200 响应（2099-06，源可达、确实 0 条）—— 原文未改写 */
const WORKER_NORMAL_EMPTY = {
  success: false,
  dataSource: 'unavailable',
  code: 'DATA_UNAVAILABLE',
  error: '2099-06 东财解禁报表（RPT_LIFT_STAGE）无解禁记录（源可达，属正常空）',
  message: '2099-06 东财解禁报表（RPT_LIFT_STAGE）无解禁记录（源可达，属正常空）',
  data: {
    year: 2099,
    month: 6,
    expiries: [],
    byDate: {},
    summary: null,
    dataSource: 'unavailable',
    message: '2099-06 东财解禁报表（RPT_LIFT_STAGE）无解禁记录（源可达，属正常空）',
  },
  timestamp: '2026-11-01T18:29:34.488Z',
};

/** ③ Worker 真实 200 响应（2000-01，上游取不到）—— 原文未改写 */
const WORKER_UNREACHABLE = {
  success: false,
  dataSource: 'unavailable',
  code: 'DATA_UNAVAILABLE',
  error: '2000-01 东财解禁报表不可达：The operation was aborted；未用任何兜底/随机数据填充',
  message: '2000-01 东财解禁报表不可达：The operation was aborted；未用任何兜底/随机数据填充',
  data: {
    year: 2000,
    month: 1,
    expiries: [],
    byDate: {},
    summary: null,
    dataSource: 'unavailable',
    message: '2000-01 东财解禁报表不可达：The operation was aborted；未用任何兜底/随机数据填充',
  },
  timestamp: '2026-11-01T18:29:34.488Z',
};

/** backend/src/api/lockup-shares.ts 的 emptyCalendar + sendSuccess 形状（0 值 summary 也是真实形态） */
const BACKEND_EMPTY = {
  success: true,
  data: {
    year: 2026,
    month: 11,
    expiries: [],
    byDate: {},
    summary: {
      totalStocks: 0, totalEvents: 0, totalMarketValue: 0, totalShares: 0, avgUnlockRatio: 0,
    },
    dataSource: 'unavailable',
    notes: '限售股解禁：东方财富解禁报表（RPT_LIFT_STAGE）本次不可达或该月无解禁记录；后端未接入任何兜底/随机数据',
  },
};

/** Worker/后端都可能给的「接口正常 + 确实 0 条」（如东财返回行但全部被字段过滤掉） */
const OK_EMPTY = {
  success: true,
  dataSource: 'real',
  data: {
    year: 2026,
    month: 11,
    expiries: [],
    byDate: {},
    summary: {
      totalStocks: 0, totalEvents: 0, totalMarketValue: 0, totalShares: 0, avgUnlockRatio: 0,
    },
    dataSource: 'real',
  },
};

const empty = (problem: LockupProblem, status?: ApiStatus | null, extra: Partial<{
  hasRecords: boolean; filteredEmpty: boolean; period: string;
}> = {}) => resolveLockupEmptyView({
  problem,
  status,
  hasRecords: extra.hasRecords ?? false,
  filteredEmpty: extra.filteredEmpty ?? false,
  period: extra.period,
});

describe('resolveLockupView —— 三态判定', () => {
  it('① Worker 真实 200 + 150 条 → records，不是 format', () => {
    const view = resolveLockupView(WORKER_REAL, 200);
    expect(view.kind).toBe('records');
    if (view.kind !== 'records') throw new Error('unreachable');
    expect(view.expiries).toHaveLength(2);
    expect(view.expiries[0]).toMatchObject({ symbol: '300395', name: '菲利华', expiryDate: '2026-11-02' });
    expect(view.byDate['2026-11-02']).toHaveLength(2);
    expect(view.summary?.totalEvents).toBe(150);
    expect(view.status.kind).toBe('ok');
  });

  it('② Worker 真实 200「源可达属正常空」→ empty，绝不判 format', () => {
    const view = resolveLockupView(WORKER_NORMAL_EMPTY, 200);
    expect(view.kind).toBe('empty');
    expect(view.kind).not.toBe('format');
    expect(view.status.kind).toBe('unavailable');
  });

  it('③ Worker 真实 200「上游不可达」→ empty，绝不判 format', () => {
    const view = resolveLockupView(WORKER_UNREACHABLE, 200);
    expect(view.kind).toBe('empty');
    expect(view.kind).not.toBe('format');
    expect(view.status.kind).toBe('unavailable');
  });

  it('后端 emptyCalendar（0 值 summary + dataSource:unavailable）→ empty，不是 format', () => {
    const view = resolveLockupView(BACKEND_EMPTY, 200);
    expect(view.kind).toBe('empty');
    expect(view.status.kind).toBe('unavailable');
  });

  it('接口正常且确实 0 条（dataSource:real + expiries:[]）→ empty，status 保持 ok', () => {
    const view = resolveLockupView(OK_EMPTY, 200);
    expect(view.kind).toBe('empty');
    expect(view.status.kind).toBe('ok');
  });

  it('success:false 但无 dataSource（业务性失败）→ empty + failed，不是 format', () => {
    const view = resolveLockupView({ success: false, error: 'boom' }, 200);
    expect(view.kind).toBe('empty');
    expect(view.status.kind).toBe('failed');
  });

  it('404 路由未命中 → empty + not-deployed，不是 format', () => {
    const view = resolveLockupView({ success: false, error: 'Not found' }, 404);
    expect(view.kind).toBe('empty');
    expect(view.status.kind).toBe('not-deployed');
  });

  it('data.expiries 不是数组 → format（真·结构异常）', () => {
    const view = resolveLockupView({ success: true, dataSource: 'real', data: { expiries: {} } }, 200);
    expect(view.kind).toBe('format');
    if (view.kind !== 'format') throw new Error('unreachable');
    expect(view.reason).toContain('data.expiries');
  });

  it('缺 data 对象 → format，且说清缺的是什么', () => {
    const view = resolveLockupView({ success: true }, 200);
    expect(view.kind).toBe('format');
    if (view.kind !== 'format') throw new Error('unreachable');
    expect(view.reason).toContain('data');
    expect(view.status.reason).toContain('数据格式异常');
  });

  it('body 为 null/undefined 不抛异常，判为 format', () => {
    expect(resolveLockupView(null, 200).kind).toBe('format');
    expect(resolveLockupView(undefined, 200).kind).toBe('format');
  });

  it('byDate/summary 形状不对时收敛为空，不影响 records 判定', () => {
    const view = resolveLockupView({
      success: true,
      dataSource: 'real',
      data: {
        expiries: [{ id: 1, symbol: '300395', name: '菲利华', expiryDate: '2026-11-02' }],
        byDate: 'bad',
        summary: 'bad',
      },
    }, 200);
    expect(view.kind).toBe('records');
    if (view.kind !== 'records') throw new Error('unreachable');
    expect(view.byDate).toEqual({});
    expect(view.summary).toBeNull();
  });
});

describe('resolveLockupEmptyView —— 空态文案两两不冒充', () => {
  it('「源可达属正常空」→ 明确说「本期确实没有解禁记录」，不说格式异常', () => {
    const v = empty(null, resolveLockupView(WORKER_NORMAL_EMPTY, 200).status, { period: '2099-06' });
    expect(v.title).toBe('本期确实没有解禁记录');
    expect(v.description).toContain('属正常空');
    expect(v.title).not.toContain('格式异常');
  });

  it('「上游不可达」→ 「暂无可用数据」+ 后端中文原文，不说「确实没有」也不说格式异常', () => {
    const v = empty(null, resolveLockupView(WORKER_UNREACHABLE, 200).status, { period: '2000-01' });
    expect(v.title).toBe('暂无可用数据');
    expect(v.description).toContain('东财解禁报表不可达');
    expect(v.description).toContain('未用任何兜底/随机数据填充');
    expect(v.title).not.toContain('确实没有');
    expect(v.title).not.toContain('格式异常');
  });

  it('后端合并文案（无法判定正常空还是不可达）→ 保守落回「暂无可用数据」+ 原文', () => {
    const v = empty(null, resolveLockupView(BACKEND_EMPTY, 200).status, { period: '2026-11' });
    expect(v.title).toBe('暂无可用数据');
    expect(v.description).toContain('不可达或该月无解禁记录');
  });

  it('接口正常且确实 0 条 → 明确说「确实没有」', () => {
    const v = empty(null, resolveLockupView(OK_EMPTY, 200).status, { period: '2026-11' });
    expect(v.title).toBe('本期确实没有解禁记录');
    expect(v.description).toContain('确实没有任何解禁记录');
    expect(v.description).toContain('2026-11');
  });

  it('结构真坏 → 「数据格式异常」，标题不得写成「暂无」', () => {
    const view = resolveLockupView({ success: true, data: { expiries: 'x' } }, 200);
    const v = empty('format', view.status, { period: '2026-11' });
    expect(v.title).toBe('数据格式异常');
    expect(v.title).not.toContain('暂无');
    expect(v.description).toContain('这不是「暂无解禁记录」');
  });

  it('请求层失败 → 「解禁数据请求失败」，不写「暂无」也不写「格式异常」', () => {
    const v = empty('http', { kind: 'failed', reason: 'HTTP 502' });
    expect(v.title).toBe('解禁数据请求失败');
    expect(v.title).not.toContain('暂无');
    expect(v.title).not.toContain('格式异常');
    expect(v.description).toContain('不代表本月没有解禁记录');
  });

  it('端点未挂载 → 「该接口未挂载」，不冒充成「暂无记录」', () => {
    const v = empty(null, { kind: 'not-deployed', httpStatus: 404, reason: 'Not found' });
    expect(v.title).toBe('该接口未挂载');
    expect(v.description).toContain('不是「暂无解禁记录」');
  });

  it('登记表判出未挂载时，不因来自 catch 就说成「请求失败」', () => {
    const v = empty('http', { kind: 'not-deployed', httpStatus: 404, reason: 'Not found' });
    expect(v.title).toBe('该接口未挂载');
    expect(v.title).not.toContain('请求失败');
  });

  it('有数据但筛选后为空 → 「当前条件下暂无解禁记录」，且与「确实没有」措辞不同', () => {
    const v = empty(null, { kind: 'ok' }, { hasRecords: true, filteredEmpty: true, period: '2026-11' });
    expect(v.title).toBe('当前条件下暂无解禁记录');
    expect(v.description).toContain('筛选');
  });

  it('四种空态标题两两不同（谁也不冒充谁）', () => {
    const format = empty('format', resolveLockupView({ data: {} }, 200).status);
    const unavailable = empty(null, resolveLockupView(WORKER_UNREACHABLE, 200).status);
    const reallyNone = empty(null, resolveLockupView(OK_EMPTY, 200).status);
    const filtered = empty(null, { kind: 'ok' }, { hasRecords: true, filteredEmpty: true });
    const titles = [format.title, unavailable.title, reallyNone.title, filtered.title];
    expect(new Set(titles).size).toBe(4);
  });

  it('回归：三类真实响应的文案里都不出现「接口返回数据格式异常」', () => {
    for (const body of [WORKER_NORMAL_EMPTY, WORKER_UNREACHABLE, BACKEND_EMPTY]) {
      const view = resolveLockupView(body, 200);
      const v = empty(view.kind === 'format' ? 'format' : null, view.status);
      expect(v.title + v.description).not.toContain('接口返回数据格式异常');
    }
  });
});
