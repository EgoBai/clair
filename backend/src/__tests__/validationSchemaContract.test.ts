/**
 * P0-SCHEMA：validateQuery/validateBody/validateParams 开启 `stripUnknown: true`，
 * schema 未声明的键会被**静默剥离且不报错**（HTTP 200）。
 *
 * 本文件锁死的不只是 schema 形状，而是「参数真的穿过中间件到达 handler」——
 * 每条用例都把 validateQuery 挂在真实 express 路由上，断言 handler 侧
 * 实际拿到的 req.query，而不是只跑 schema.validate 看字段列表。
 *
 * 起因：`schemas.lockupCalendar` / `lockupRank` 未声明 year/month，
 * 导致 `GET /api/lockup/calendar?year=2020&month=3` 的年月被丢成当前月，
 * 解禁日历「翻月」从上线起完全失效且无任何报错。
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { validateQuery, schemas } from '../middleware/validation';

/**
 * 把某个 schema 挂到同名单测路由上，回显 handler 实际读到的 query。
 * 这是本测试的核心工具：它走的是与生产完全相同的中间件链。
 */
function mountQuery(schema: Parameters<typeof validateQuery>[0]) {
  const app = express();
  app.get('/probe', validateQuery(schema), (req, res) => {
    res.json({ query: req.query });
  });
  return request(app).get('/probe');
}

describe('P0-SCHEMA · lockup 日历 year/month 不再被静默剥离', () => {
  it('lockupCalendar：year/month 必须穿过 validateQuery 到达 handler', async () => {
    const res = await mountQuery(schemas.lockupCalendar).query({ year: '2020', month: '3' });

    expect(res.status).toBe(200);
    // 断言「参数确实生效」而非 schema 形状：handler 侧能读到且被强制转为数字
    expect(res.body.query.year).toBe(2020);
    expect(res.body.query.month).toBe(3);
  });

  it('lockupRank：year/month 必须穿过 validateQuery 到达 handler', async () => {
    const res = await mountQuery(schemas.lockupRank).query({ year: '2019', month: '12' });

    expect(res.status).toBe(200);
    expect(res.body.query.year).toBe(2019);
    expect(res.body.query.month).toBe(12);
  });

  it('lockupCalendar：year/month 缺省时不注入 default，交由端点回退当月', async () => {
    const res = await mountQuery(schemas.lockupCalendar).query({});

    expect(res.status).toBe(200);
    // 不能有 default：否则「未传」与「显式传当前月」不可区分
    expect(res.body.query).not.toHaveProperty('year');
    expect(res.body.query).not.toHaveProperty('month');
    //既有默认值不受影响
    expect(res.body.query.page).toBe(1);
    expect(res.body.query.pageSize).toBe(20);
  });

  it('lockupRank：保留 limit/sortBy 既有默认值', async () => {
    const res = await mountQuery(schemas.lockupRank).query({});

    expect(res.status).toBe(200);
    expect(res.body.query.limit).toBe(10);
    expect(res.body.query.sortBy).toBe('unlockValue');
  });

  it('非法 month=13 被 400 拒绝，而不是静默丢弃', async () => {
    const res = await mountQuery(schemas.lockupCalendar).query({ year: '2026', month: '13' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('非 4 位/越界的 year 被 400 拒绝', async () => {
    for (const year of ['20', '1990', '99999']) {
      const res = await mountQuery(schemas.lockupCalendar).query({ year, month: '5' });
      expect(res.status, `year=${year} 应被拒绝`).toBe(400);
    }
  });

  it('当前年+1 允许（需支持查未来预约解禁），当前年+2 拒绝', async () => {
    const nextYear = String(new Date().getFullYear() + 1);
    const tooFar = String(new Date().getFullYear() + 2);

    const ok = await mountQuery(schemas.lockupCalendar).query({ year: nextYear, month: '1' });
    expect(ok.status).toBe(200);
    expect(ok.body.query.year).toBe(Number(nextYear));

    const bad = await mountQuery(schemas.lockupCalendar).query({ year: tooFar, month: '1' });
    expect(bad.status).toBe(400);
  });

  // 成对校验的判断依据：单给 year 或单给 month 都无法定位「哪个月」，
  // 让端点自己猜就会退化成本次修复的同类静默错误，故显式 400。
  it('只给 year 不给 month → 400（无法定位月份，不静默猜）', async () => {
    const res = await mountQuery(schemas.lockupCalendar).query({ year: '2020' });

    expect(res.status).toBe(400);
    expect(res.body.details).toMatch(/year[\s\S]*month|month[\s\S]*year/);
  });

  it('只给 month 不给 year → 400', async () => {
    const res = await mountQuery(schemas.lockupRank).query({ month: '3' });

    expect(res.status).toBe(400);
  });

  it('两个都不给 → 200（端点回退当月是合法用法）', async () => {
    const res = await mountQuery(schemas.lockupRank).query({ limit: '5' });

    expect(res.status).toBe(200);
    expect(res.body.query.limit).toBe(5);
  });
});

describe('P0-SCHEMA · 同根因排查：其余被 stripUnknown 静默剥离的参数', () => {
  it('indicators：period（MA/RSI/BOLL 窗口）能到达 handler', async () => {
    const res = await mountQuery(schemas.indicatorQuery).query({ period: '20', limit: '200' });

    expect(res.status).toBe(200);
    // 修复前：period 被剥离，handler 恒回落默认 5/14/20
    expect(res.body.query.period).toBe(20);
    expect(res.body.query.limit).toBe(200);
  });

  it('indicators：period 缺省时不给 default（保留 handler 各自的 5/14/20）', async () => {
    const res = await mountQuery(schemas.indicatorQuery).query({});

    expect(res.status).toBe(200);
    expect(res.body.query).not.toHaveProperty('period');
    expect(res.body.query.limit).toBe(120);
  });

  it('indicators：period 越界被 400 拒绝', async () => {
    const res = await mountQuery(schemas.indicatorQuery).query({ period: '0' });
    expect(res.status).toBe(400);
  });

  it('news：sortBy能到达 handler（relevance/ time 两条排序分支）', async () => {
    const byTime = await mountQuery(schemas.newsQuery).query({ sortBy: 'time' });
    expect(byTime.status).toBe(200);
    expect(byTime.body.query.sortBy).toBe('time');

    const byRelevance = await mountQuery(schemas.newsQuery).query({ sortBy: 'relevance' });
    expect(byRelevance.status).toBe(200);
    expect(byRelevance.body.query.sortBy).toBe('relevance');
  });

  it('news：非法 sortBy 被 400 拒绝（避免落进 else 分支静默变成时间排序）', async () => {
    const res = await mountQuery(schemas.newsQuery).query({ sortBy: 'rand' });
    expect(res.status).toBe(400);
  });

  it('sectors/ranking：type/limit 能到达 handler（修复前恒为 gainers/10）', async () => {
    const res = await mountQuery(schemas.sectorQuery).query({ type: 'losers', limit: '30' });

    expect(res.status).toBe(200);
    expect(res.body.query.type).toBe('losers');
    expect(res.body.query.limit).toBe(30);
  });

  it('sectors：非法 type 被 400 拒绝', async () => {
    const res = await mountQuery(schemas.sectorQuery).query({ type: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('sectors：type/limit 缺省不注入 default，/sectors 原有默认值不变', async () => {
    const res = await mountQuery(schemas.sectorQuery).query({});

    expect(res.status).toBe(200);
    expect(res.body.query.sortBy).toBe('avgChangePercent');
    expect(res.body.query.sortOrder).toBe('desc');
    expect(res.body.query).not.toHaveProperty('type');
    expect(res.body.query).not.toHaveProperty('limit');
  });
});

describe('P0-SCHEMA · 回归：未涉及的 schema 行为不变', () => {
  it('stockSearch / marketQuery / blockTradeQuery 的既有契约保持不变', async () => {
    const stocks = await mountQuery(schemas.stockSearch).query({ symbol: '600519', page: '2' });
    expect(stocks.status).toBe(200);
    expect(stocks.body.query.symbol).toBe('600519');
    expect(stocks.body.query.page).toBe(2);
    expect(stocks.body.query.sortOrder).toBe('asc');

    const market = await mountQuery(schemas.marketQuery).query({ limit: '5' });
    expect(market.status).toBe(200);
    expect(market.body.query.limit).toBe(5);

    const block = await mountQuery(schemas.blockTradeQuery).query({ date: '2026-10-08' });
    expect(block.status).toBe(200);
    expect(block.body.query.date).toBe('2026-10-08');
    expect(block.body.query.pageSize).toBe(20);
  });

  it('compareSymbols 仍兼容逗号分隔字符串', async () => {
    const res = await mountQuery(schemas.compareSymbols).query({ symbols: 'a,b,c' });
    expect(res.status).toBe(200);
    expect(res.body.query.symbols).toBe('a,b,c');
  });

  it('真正未知的键依然被剥离（stripUnknown 语义未被削弱）', async () => {
    const res = await mountQuery(schemas.lockupCalendar).query({ totallyBogus: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.query).not.toHaveProperty('totallyBogus');
  });
});
