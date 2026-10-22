/**
 * P2-③ backtest 初始本金透传契约（回归测试）
 *
 * ## 缺陷（qa 蜂群追踪 ~12 日）
 * 前端回测页「初始本金」输入框发 **顶层** `initialCapital: 500000`，
 * 但后端只展开 `params`，顶层字段被静默丢弃 → 引擎回退默认 1000000。
 * 用户输入 50 万，系统按 100 万算：收益率、最终资产、最大回撤、夏普比率
 * **全部基于错误本金计算**，属**事实性错误**（不是显示问题，是算错了）。
 *
 * ## 根因
 * `validation.ts:417/437` 的 Joi schema 把 initialCapital 定义在**顶层**
 * （与 strategy/symbol/startDate 平级），而 `backtest-routes.ts` 的 handler
 * 只 `const { params = {} } = req.body` 后 `...params` 展开，从不读顶层字段。
 *
 * ## 本测试锁定的契约
 * 1. 顶层 initialCapital 必须被透传（发 500000 引擎就得用 500000）
 * 2. 不传时才允许用引擎默认值（不破坏既有调用方）
 * 3. 响应回显 requestedInitialCapital，前端可自校验
 * 4. /backtest/compare 同修（它漏的是同一处）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── mock：隔离真实库与外网，只验证参数透传 ──
const capturedCalls: Array<Record<string, unknown>> = [];

vi.mock('../utils/backtestEngine', () => ({
  STRATEGY_PRESETS: {},
  /**
   * 桩必须**复现引擎的默认值语义**（`backtestEngine.ts:317`
   * `const initialCapital = params.initialCapital || 1000000;`），
   * 否则「未显式传本金」的用例会拿到 undefined 而非 1000000，
   * 测的就不是真实链路了。
   */
  runBacktest: (_kline: unknown, params: Record<string, unknown>) => {
    capturedCalls.push(params);
    return {
      strategy: params.type,
      initialCapital: params.initialCapital || 1000000,
      finalValue: 1234567,
      totalReturn: 23.45,
      trades: [],
      equityCurve: [],
    };
  },
}));

/** knex 桩：返回足以通过「K 线条数 >= 20」门槛的假 K 线 */
vi.mock('../db/dbFactory', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    trade_date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    open_price: '10.00',
    high_price: '10.50',
    low_price: '9.80',
    close_price: '10.20',
    volume: '100000',
    turnover: '1020000',
  }));
  const makeChain = (): any =>
    new Proxy(
      { then: (res: (r: unknown[]) => void) => Promise.resolve(rows).then(res) },
      {
        get(target: any, prop: string) {
          if (prop === 'then') return target.then;
          if (prop === 'raw') return (sql: string) => sql;
          return () => makeChain();
        },
      },
    );
  const dbObj = { connection: () => makeChain() };
  return { db: dbObj, getDb: () => dbObj };
});

import backtestRouter from '../api/backtest-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', backtestRouter);
  return app;
}

const BASE = {
  strategy: 'ma_cross',
  symbol: '600519.SH',
  startDate: '2026-08-01',
  endDate: '2026-09-30',
};

describe('P2-③ backtest 初始本金透传', () => {
  beforeEach(() => {
    capturedCalls.length = 0;
  });

  it('顶层 initialCapital=500000 → 引擎收到的就是 500000（不是默认 1000000）', async () => {
    const res = await request(buildApp())
      .post('/api/backtest/run')
      .send({ ...BASE, initialCapital: 500000 });

    expect(res.status).toBe(200);
    expect(capturedCalls).toHaveLength(1);
    // 核心断言：引擎参数里的本金必须等于用户输入
    expect(capturedCalls[0].initialCapital).toBe(500000);
    // 且响应里回显，前端可自校验
    expect(res.body.data.initialCapital).toBe(500000);
    expect(res.body.data.requestedInitialCapital).toBe(500000);
  });

  it('不传 initialCapital → 落到引擎默认值 1000000（不破坏既有调用方）', async () => {
    const res = await request(buildApp()).post('/api/backtest/run').send({ ...BASE });

    expect(res.status).toBe(200);
    // 注意：Joi schema 的 .default(1000000) 会**主动填入**顶层 initialCapital，
    // 所以 handler 收到的是 1000000 而非 undefined。这是正确行为——
    // 显式传入的值与引擎默认值一致，不改变任何计算结果。
    expect(capturedCalls[0].initialCapital).toBe(1000000);
    expect(res.body.data.initialCapital).toBe(1000000);
  });

  /**
   * 本条验证的是**本次 schema 修复**的价值：params 不再被 stripUnknown 静默剥离。
   *
   * 注意本金取值以顶层为准：Joi 的 `.default(1000000)` 总会把顶层
   * initialCapital 填上，所以 params.initialCapital 兜底分支在当前 schema 下
   * 不可达（这是有意设计——顶层是权威形态，与 validation.ts:417 一致）。
   * 断言的是 params 里的**引擎参数**（shortPeriod 等）能透传到引擎，
   * 这在修复前是做不到的（整个 params 对象被剥掉）。
   */
  it('params 不再被 stripUnknown 剥离：引擎参数可透传（schema 修复验证）', async () => {
    const res = await request(buildApp())
      .post('/api/backtest/run')
      .send({ ...BASE, params: { shortPeriod: 5, longPeriod: 20 } });

    expect(res.status).toBe(200);
    expect(capturedCalls[0].shortPeriod).toBe(5);
    expect(capturedCalls[0].longPeriod).toBe(20);
    // 本金仍以顶层（Joi 默认）为准
    expect(capturedCalls[0].initialCapital).toBe(1000000);
  });

  it('顶层优先于 params（两者都给时以顶层为准，与 schema 语义一致）', async () => {
    const res = await request(buildApp())
      .post('/api/backtest/run')
      .send({ ...BASE, initialCapital: 800000, params: { initialCapital: 250000 } });

    expect(res.status).toBe(200);
    expect(capturedCalls[0].initialCapital).toBe(800000);
  });

  it('/backtest/compare 顶层 initialCapital 同样透传', async () => {
    const res = await request(buildApp())
      .post('/api/backtest/compare')
      .send({
        ...BASE,
        initialCapital: 500000,
        strategies: [
          { strategy: 'ma_cross', parameters: {} },
          { strategy: 'rsi_reversal', parameters: {} },
        ],
      });

    expect(res.status).toBe(200);
    // 两个策略都应拿到 500000
    const used = capturedCalls.map((c) => c.initialCapital);
    expect(used).toEqual([500000, 500000]);
    expect(res.body.data.initialCapital).toBe(500000);
  });
});
