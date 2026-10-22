/**
 * P1-② ai/filter 状态码语义回归测试
 *
 * ## 被测缺陷（qa 蜂群连续追踪 6+ 日）
 * `POST /api/ai/filter` 在「上游 LLM 不可用」时返回 **HTTP 500**，
 * 而响应体其实已诚实标注 `dataSource:'unavailable'`。
 *
 * 后果机制：前端所有 AI 调用点写的是 `if (!res.ok) throw`，
 * 5xx 让它们在**解析响应体之前**就进 catch，响应体里诚实的
 * dataSource / message 永远读不到 → 用户只看到页面报错或空白。
 *
 * ## 修复
 * 区分「业务性失败」与「真崩溃」：
 *   - LLM 调用失败 / JSON 解析失败 / DB 查询失败 → 200 + unavailable
 *     + `code:'UPSTREAM_UNAVAILABLE'`（对齐 ai-chat.ts 的 sendUnavailable）
 *   - 查询构建段代码 bug 等真正意外 → 仍 500（不得声称是数据问题）
 * 实现方式是**收窄 try 范围**：三个上游依赖各自独立 try/catch，
 * 外层 catch 只兜意外。
 *
 * ## 本测试的断言重点
 * 每条业务性路径都必须同时满足：HTTP 200 + dataSource unavailable
 * + 有中文 message。任一条退回 500 即失败。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock 掉会触发副作用的依赖 ──
vi.mock('../db/dbFactory', () => ({
  getDb: vi.fn(),
}));
vi.mock('../services/aiService', () => ({
  default: { chat: vi.fn() },
}));
vi.mock('../middleware/aiTiming', () => ({
  aiTiming: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import express from 'express';
import aiFilterRouter from '../api/ai-filter';
import { getDb } from '../db/dbFactory';
import aiService from '../services/aiService';

/** 构造一个可用的 knex 查询桩：thenable，await 得到 rows */
function makeKnexStub(rows: unknown[]) {
  const builder: any = {
    leftJoin: () => builder,
    where: () => builder,
    whereRaw: () => builder,
    whereIn: () => builder,
    whereBetween: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    select: () => builder,
    first: async () => (rows.length > 0 ? rows[0] : undefined),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  const knex: any = () => builder;
  knex.raw = () => ({ __raw: true });
  return knex;
}

/**
 * 构造一个「查询**构建**正常、但真正 await（I/O）时抛错」的 knex 桩。
 *
 * 为什么必须这样构造：ai-filter.ts 只把 `await queryBuilder` 这一行纳入
 * 业务性降级范围，查询**构建**段（leftJoin/where/拼字段名）若抛错，说明是
 * 代码 bug，按设计仍走 500。若桩在构建段就抛错，测的就不是目标路径了。
 */
function makeThrowingKnexStub() {
  const builder: any = {
    leftJoin: () => builder,
    where: () => builder,
    whereRaw: () => builder,
    whereIn: () => builder,
    whereBetween: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    select: () => builder,
    first: async () => {
      throw new Error('connection terminated');
    },
    then: (_resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.reject(new Error('connection terminated')).catch(reject ?? (() => undefined)),
  };
  const knex: any = () => builder;
  knex.raw = () => ({ __raw: true });
  return knex;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', aiFilterRouter);
  return app;
}

const VALID_LLM_JSON = JSON.stringify({
  conditions: [{ field: 'changePercent', operator: 'gt', value: 5 }],
  sortBy: 'changePercent',
  sortOrder: 'desc',
  limit: 50,
  explanation: '涨幅超过5%的股票',
});

const FAKE_ROWS = [
  { symbol: '600000.SH', name: '浦发银行', industry: '银行', price: 9.62, changePercent: 6.1, turnoverRate: 1.2, volume: 625299, marketCap: 28000000 },
];

describe('POST /api/ai/filter 状态码语义（P1-②）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LLM 不可用 → 200 + unavailable（此前是 500）', async () => {
    vi.mocked(aiService.chat).mockRejectedValue(new Error('LLM gateway 503'));

    const res = await request(makeApp())
      .post('/api/ai/filter')
      .send({ query: '低估值高分红股票' });

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(res.body.message).toBeTruthy();
    // 不得把上游 error.message 透传出去
    expect(JSON.stringify(res.body)).not.toContain('503');
  });

  it('LLM 返回非 JSON → 200 + unavailable（此前是 500）', async () => {
    vi.mocked(aiService.chat).mockResolvedValue({
      content: '抱歉，我不明白你的意思。',
    } as any);

    const res = await request(makeApp())
      .post('/api/ai/filter')
      .send({ query: '随便说说' });

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('DB 查询失败 → 200 + unavailable（业务性，不是服务端崩溃）', async () => {
    vi.mocked(aiService.chat).mockResolvedValue({ content: VALID_LLM_JSON } as any);
    vi.mocked(getDb).mockReturnValue({ connection: makeThrowingKnexStub() } as any);

    const res = await request(makeApp())
      .post('/api/ai/filter')
      .send({ query: '涨幅超过5%的股票' });

    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('全链路正常 → 200 + real + results（无回归）', async () => {
    vi.mocked(aiService.chat).mockResolvedValue({ content: VALID_LLM_JSON } as any);
    vi.mocked(getDb).mockReturnValue({ connection: makeKnexStub(FAKE_ROWS) } as any);

    const res = await request(makeApp())
      .post('/api/ai/filter')
      .send({ query: '涨幅超过5%的股票' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it('缺少 query 参数 → 400（参数校验不受本次改动影响）', async () => {
    const res = await request(makeApp()).post('/api/ai/filter').send({});
    expect(res.status).toBe(400);
  });
});
