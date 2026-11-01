/**
 * 事件日历页响应契约测试（回归：线上「接口 200 却显示数据格式异常」）
 *
 * 线上事实（2026-11-01 实测）：
 *   GET https://clair-api.pages.dev/api/event-calendar/events → 200
 *   body = { success:false, dataSource:'unavailable', code:'DATA_UNAVAILABLE',
 *            message:'财经事件日历…本 Worker 版未接入任何真实日历源…',
 *            data:{ raw:[], events:[], dataSource:'unavailable', message:'…' } }
 * 页面却渲染「事件日历：数据不可用（数据格式异常）」——
 * 根因是页面把 `!json.success` 与「结构读不出来」合并成同一个异常分支。
 *
 * 本文件锁死三件事：
 *   1. success:false + unavailable 不得被判成 format（否则「没数据源」冒充「接口坏了」）
 *   2. 只有 data.raw 不是数组才算 format
 *   3. 四种空态文案两两互不冒充
 */
import { describe, it, expect } from 'vitest';
import {
  resolveEventCalendarView,
  resolveEventCalendarEmptyView,
} from '../pages/EventCalendarPage';

/** Worker 线上真实响应（原文结构，文案未改写） */
const WORKER_UNAVAILABLE = {
  success: false,
  dataSource: 'unavailable',
  code: 'DATA_UNAVAILABLE',
  error: '财经事件日历（宏观数据发布/议息/解禁等）需要官方发布日历或第三方日历 API，本 Worker 版未接入任何真实日历源；后端对应实现依赖本地经济数据库，Worker 无此库。本次返回空事件表而非编造事件与日期。',
  message: '财经事件日历（宏观数据发布/议息/解禁等）需要官方发布日历或第三方日历 API，本 Worker 版未接入任何真实日历源；后端对应实现依赖本地经济数据库，Worker 无此库。本次返回空事件表而非编造事件与日期。',
  data: {
    raw: [] as unknown[],
    events: [] as unknown[],
    dataSource: 'unavailable',
    message: '财经事件日历（宏观数据发布/议息/解禁等）需要官方发布日历或第三方日历 API，本 Worker 版未接入任何真实日历源；后端对应实现依赖本地经济数据库，Worker 无此库。本次返回空事件表而非编造事件与日期。',
  },
  timestamp: '2026-11-01T11:41:07.328Z',
};

/** 本地 Express 后端形状（backend/src/api/eventCalendar.ts:111-135） */
const BACKEND_UNAVAILABLE = {
  success: true,
  data: {
    raw: [] as unknown[],
    meta: { source: 'unavailable', updatedAt: null, error: '事件日历真实数据源尚未接入' },
  },
  dataSource: 'unavailable',
  notes: { integrated: [], pending: { economic: '…' }, message: '事件日历真实数据源尚未接入…' },
  timestamp: '2026-11-01T11:41:07.328Z',
};

const TWO_EVENTS = {
  success: true,
  data: {
    raw: [
      { date: '2026-11-03', type: 'earnings', symbol: '600519', title: '贵州茅台三季报' },
      { date: '2026-11-05', type: 'economic', title: 'CPI 发布' },
    ],
    meta: { source: 'live', updatedAt: null },
  },
  dataSource: 'live',
  timestamp: '2026-11-01T11:41:07.328Z',
};

describe('resolveEventCalendarView —— 三态判定', () => {
  it('Worker 真实 200 响应（success:false + unavailable + 空 raw）判为 empty，不是 format', () => {
    const view = resolveEventCalendarView(WORKER_UNAVAILABLE);
    expect(view.kind).toBe('empty');
    expect(view.kind).not.toBe('format');
  });

  it('Worker 不可用态把中文原因透传到 state.error（Banner 能说人话）', () => {
    const view = resolveEventCalendarView(WORKER_UNAVAILABLE);
    expect(view.state.kind).toBe('unavailable');
    expect(view.state.error).toContain('未接入任何真实日历源');
  });

  it('后端形状（data.meta）同样判为 empty，且沿用 meta.error', () => {
    const view = resolveEventCalendarView(BACKEND_UNAVAILABLE);
    expect(view.kind).toBe('empty');
    expect(view.state.kind).toBe('unavailable');
    expect(view.state.error).toBe('事件日历真实数据源尚未接入');
  });

  it('有事件时判为 events，原始事件透传不丢字段', () => {
    const view = resolveEventCalendarView(TWO_EVENTS);
    expect(view.kind).toBe('events');
    if (view.kind !== 'events') throw new Error('unreachable');
    expect(view.raw).toHaveLength(2);
    expect(view.raw[0]).toMatchObject({ date: '2026-11-03', type: 'earnings', symbol: '600519' });
    expect(view.state.kind).toBe('live');
  });

  it('data.raw 缺失 → format（真·结构异常）', () => {
    const view = resolveEventCalendarView({ success: true, data: { events: [] } });
    expect(view.kind).toBe('format');
    if (view.kind !== 'format') throw new Error('unreachable');
    expect(view.reason).toContain('data.raw');
  });

  it('data.raw 不是数组（对象/null）→ format', () => {
    expect(resolveEventCalendarView({ data: { raw: { a: 1 } } }).kind).toBe('format');
    expect(resolveEventCalendarView({ data: { raw: null } }).kind).toBe('format');
  });

  it('缺 data 对象 → format，且说明缺的是什么', () => {
    const view = resolveEventCalendarView({ success: false, error: 'boom' });
    expect(view.kind).toBe('format');
    if (view.kind !== 'format') throw new Error('unreachable');
    expect(view.reason).toContain('data');
    expect(view.state.error).toContain('数据格式异常');
  });

  it('body 完全为空（null/undefined）不抛异常，判为 format', () => {
    expect(resolveEventCalendarView(null).kind).toBe('format');
    expect(resolveEventCalendarView(undefined).kind).toBe('format');
  });
});

describe('resolveEventCalendarEmptyView —— 四种文案互不冒充', () => {
  const formatView = resolveEventCalendarView({ data: { raw: null } });
  const workerView = resolveEventCalendarView(WORKER_UNAVAILABLE);

  const formatText = resolveEventCalendarEmptyView({
    hasEvents: false, problem: 'format', state: formatView.state,
  });
  const httpText = resolveEventCalendarEmptyView({
    hasEvents: false, problem: 'http', state: { kind: 'unavailable', updatedAt: null, error: 'HTTP 502' },
  });
  const unavailableText = resolveEventCalendarEmptyView({
    hasEvents: false, problem: null, state: workerView.state,
  });
  const reallyEmptyText = resolveEventCalendarEmptyView({
    hasEvents: false, problem: null, state: { kind: 'live', updatedAt: null },
  });
  const filteredText = resolveEventCalendarEmptyView({
    hasEvents: true, problem: null, state: { kind: 'live', updatedAt: null },
  });

  it('结构异常说「格式异常」，绝不说「暂无事件」', () => {
    expect(formatText.title).toContain('格式异常');
    expect(formatText.title).not.toContain('暂无事件');
    expect(formatText.description).toContain('不是「当前没有事件」');
  });

  it('接口失败说「请求失败」，不说「格式异常」也不说「暂无事件」', () => {
    expect(httpText.title).toContain('请求失败');
    expect(httpText.title).not.toContain('格式异常');
    expect(httpText.title).not.toContain('暂无事件');
  });

  it('无真实数据源时摊开后端中文原因，不说「格式异常」', () => {
    expect(unavailableText.title).toBe('事件日历暂无可用数据');
    expect(unavailableText.description).toContain('未接入任何真实日历源');
    expect(unavailableText.title).not.toContain('格式异常');
  });

  it('接口正常且确实 0 条时才是「当前筛选条件下暂无事件」', () => {
    expect(reallyEmptyText.title).toBe('当前筛选条件下暂无事件');
    expect(reallyEmptyText.description).toContain('确实没有');
  });

  it('四类空态标题两两不同（互不冒充）', () => {
    const titles = [
      formatText.title, httpText.title, unavailableText.title, reallyEmptyText.title,
    ];
    expect(new Set(titles).size).toBe(4);
  });

  it('已有事件但筛选后为空时，文案指向筛选而不是数据缺失', () => {
    expect(filteredText.title).toBe('当前筛选条件下暂无事件');
    expect(filteredText.description).toContain('筛选');
    // 与「确实 0 条」措辞不同：一个说的是数据本身，一个说的是筛选条件
    expect(filteredText.description).not.toBe(reallyEmptyText.description);
  });
});
