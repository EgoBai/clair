/**
 * P0-ALERTSCOPE：`/api/alerts` 静默扩大查询范围。
 *
 * 缺陷：`validateQuery` 用 `stripUnknown: true`，schema 未声明的键被**静默剥离且不报错**
 * （HTTP 200）。`schemas.alertQuery` 只声明了单数 `symbol`，而三处前端调用都在拼复数
 * `?symbols=a,b,c`：
 *   - frontend/src/hooks/useWatchlistData.ts:199
 *   - frontend/src/pages/WatchlistPage.tsx:568
 *   - frontend/src/components/Stock/WatchlistPanel.tsx:85
 *
 * 于是 handler 读到的 `symbol` 恒为 undefined → symbol 过滤条件整个消失 →
 * 端点退化成「返回该 user 的全量预警」。实测（2026-10-07，内存态60 条预警）：
 *   ?symbols=000001.SZ,000002.SZ → 200/ 60 条（全表，用户只想看 2 只）
 *   ?symbols=000001.SZ           → 200 / 60 条（全表，用户只想看 1 只）
 *   ?symbol=000001.SZ            → 200 /  1 条（正确）
 *
 * 危害等级高于同根因的 P0-SCHEMA：不是「参数失效恒走默认值」，而是**静默返回了
 * 不该返回的数据**——用户和前端都无从察觉，会把全表当成 N 只股票的结果在用。
 *
 * 本测试锁死的行为：
 *  1. 三种复数形态（逗号串/ 单值 / qs 数组形态）必须 400，且带明确可读的 message；
 *  2. handler 侧**绝不能**因为传了symbols 就退化成「无过滤条件」；
 *  3. 合法的单数 `symbol` 查询不受影响（不回归 P0-SCHEMA 已修好的既有能力）。
 *
 * 与 P0-SCHEMA 的区别：那次是「补声明让参数生效」，这次是「显式禁掉错误形态」。
 * 之所以不在后端实现多标的合并查询：本工单文件域不含 backend/src/api/alerts.ts
 * （该文件正由另一 worker 在改），且静默兼容（取第一个 / 当全表）本身就是缺陷。
 * 前端逐个请求的改造已上报主理人协调。
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { validateQuery, schemas } from '../middleware/validation';

/**
 * 复刻 /api/alerts 的 GET handler 语义（backend/src/api/alerts.ts:170-214）：
 * 先按 userId 过滤，再按 `symbol` 精确等值过滤，最后分页。
 *
 * 关键点在于 `if (symbol)` 这个分支——symbol 为 undefined 时过滤条件整个不生效，
 * 这正是缺陷放大成「返回全表」的机制。
 */
function alertsHandler(alerts: Array<{ userId: number; symbol: string }>) {
  return (req: express.Request, res: express.Response) => {
    const userId = parseInt(req.query.userId as string) || 1;
    const symbol = req.query.symbol as string | undefined;

    let filtered = alerts.filter((a) => a.userId === userId);
    if (symbol) {
      filtered = filtered.filter((a) => a.symbol === symbol);
    }

    res.json({ success: true, data: { alerts: filtered, totalCount: filtered.length } });
  };
}

/** 60 条预警，跨 60 个不同标的——足以让「静默当全表」与「正确过滤」产生可区分的条数 */
const SEED_ALERTS: Array<{ userId: number; symbol: string }> = Array.from(
  { length: 60 },
  (_, i) => ({
    userId: 1,
    symbol: `${String(i).padStart(6, '0')}.SZ`,
  }),
);

function mountAlerts() {
  const app = express();
  app.get('/api/alerts', validateQuery(schemas.alertQuery), alertsHandler(SEED_ALERTS));
  return request(app);
}

describe('P0-ALERTSCOPE · 多标的查询绝不返回全表数据', () => {
  // === 核心断言：多标的查询不返回全表数据 ===

  it('前端实际形态 ?symbols=a,b 返回 400，而不是全表 60 条', async () => {
    const res = await mountAlerts().get('/api/alerts?symbols=000001.SZ,000002.SZ&pageSize=100');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // 关键：不能出现 60 条全表数据
    expect(res.body.data?.alerts).toBeUndefined();
  });

  it('单值复数形态 ?symbols=a 也返回 400（同样会静默退化成全表）', async () => {
    const res = await mountAlerts().get('/api/alerts?symbols=000001.SZ');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('qs 数组形态 symbols[]=a,b 也返回 400', async () => {
    const res = await mountAlerts().get('/api/alerts?symbols[]=000001.SZ&symbols[]=000002.SZ');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 的 message 必须明确指出不支持多标的，并给出正确用法', async () => {
    const res = await mountAlerts().get('/api/alerts?symbols=000001.SZ,000002.SZ');

    expect(res.status).toBe(400);
    // details 是 validateQuery 的错误字段；必须真的在讲这件事，而不是笼统的「参数验证失败」
    expect(res.body.details).toContain('symbols');
    expect(res.body.details).toContain('symbol=');
  });

  it('传 symbols 时 handler 拿不到 symbol → 绝不会走到「无过滤」分支返回全表', async () => {
    // 直接断言中间件层：400 意味着 handler 根本不会被执行。
    // 这条是防回归的核心——若有人日后把 symbols 改回 optional()，此用例立刻失败。
    const res = await mountAlerts().get('/api/alerts?symbols=000001.SZ,000002.SZ');

    expect(res.status).not.toBe(200);
    // 若真的返回了 200，body 里绝不能是 60 条
    if (res.status === 200) {
      expect(res.body.data.totalCount).not.toBe(SEED_ALERTS.length);
    }
  });

  it('误用单数字段传多标的 ?symbol=a,b 同样 400（否则精确匹配恒 0 条会被读成「无预警」）', async () => {
    const res = await mountAlerts().get('/api/alerts?symbol=000001.SZ,000002.SZ');

    expect(res.status).toBe(400);
    expect(res.body.details).toContain('symbol');
  });
});

describe('P0-ALERTSCOPE · 合法的单标的查询不受影响（防回归）', () => {
  it('?symbol=000001.SZ 返回该标的的预警，且条数小于全表', async () => {
    const res = await mountAlerts().get('/api/alerts?symbol=000001.SZ');

    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.alerts[0].symbol).toBe('000001.SZ');
    // 显式确认没有被静默放大成全表
    expect(res.body.data.totalCount).not.toBe(SEED_ALERTS.length);
  });

  it('无参数 = 显式查看全量，仍是合法 200（看全量本身不是缺陷，缺陷是「静默」全量）', async () => {
    const res = await mountAlerts().get('/api/alerts');

    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(SEED_ALERTS.length);
  });

  it('symbol 与 isActive / page / pageSize 可同时使用', async () => {
    const res = await mountAlerts().get('/api/alerts?symbol=000001.SZ&isActive=true&page=1&pageSize=50');

    expect(res.status).toBe(200);
    expect(res.body.data.totalCount).toBe(1);
  });

  it('未知参数仍按既有约定静默剥离，不引入新的 400 回归', async () => {
    // P0-SCHEMA 确立的约定：stripUnknown 只剥离未知键，不因此报错。
    // 本次只针对 symbols 这一个具体键加禁，不能顺手把整体行为改成「未知键一律 400」。
    const res = await mountAlerts().get('/api/alerts?symbol=000001.SZ&year=2020');

    expect(res.status).toBe(200);
    expect(res.body.query?.year).toBeUndefined();
  });
});

describe('P0-ALERTSCOPE · /api/alerts/history 同构同处理', () => {
  it('history 也不接受复数 symbols', async () => {
    const app = express();
    app.get(
      '/api/alerts/history',
      validateQuery(schemas.alertHistory),
      (req: express.Request, res: express.Response) => {
        const symbol = req.query.symbol as string | undefined;
        const all = SEED_ALERTS;
        const filtered = symbol ? all.filter((a) => a.symbol === symbol) : all;
        res.json({ success: true, data: { history: filtered, totalCount: filtered.length } });
      },
    );

    const res = await request(app).get('/api/alerts/history?symbols=000001.SZ,000002.SZ');
    expect(res.status).toBe(400);

    const ok = await request(app).get('/api/alerts/history?symbol=000001.SZ');
    expect(ok.status).toBe(200);
    expect(ok.body.data.totalCount).toBe(1);
  });
});

describe('P0-ALERTSCOPE · 不回退 P0-SCHEMA(28d334930) 已补的声明', () => {
  it('lockupCalendar 仍接受 year/month 且强制成对（本次改动不得影响它）', async () => {
    const app = express();
    app.get('/probe', validateQuery(schemas.lockupCalendar), (req, res) => {
      res.json({ query: req.query });
    });

    const ok = await request(app).get('/probe?year=2020&month=3');
    expect(ok.status).toBe(200);
    expect(ok.body.query.year).toBe(2020);
    expect(ok.body.query.month).toBe(3);

    const paired = await request(app).get('/probe?year=2020');
    expect(paired.status).toBe(400);
  });

  it('sectorQuery 的 type/limit 与 newsQuery 的 sortBy 仍在（防误删他人成果）', async () => {
    const mk = (schema: Parameters<typeof validateQuery>[0]) => {
      const app = express();
      app.get('/probe', validateQuery(schema), (req, res) => {
        res.json({ query: req.query });
      });
      return request(app);
    };

    const sector = await mk(schemas.sectorQuery).get('/probe?type=gainers&limit=3');
    expect(sector.status).toBe(200);
    expect(sector.body.query.type).toBe('gainers');
    expect(sector.body.query.limit).toBe(3);

    const news = await mk(schemas.newsQuery).get('/probe?sortBy=time');
    expect(news.status).toBe(200);
    expect(news.body.query.sortBy).toBe('time');
  });

  it('indicatorQuery 的 period 仍在', async () => {
    const app = express();
    app.get('/probe', validateQuery(schemas.indicatorQuery), (req, res) => {
      res.json({ query: req.query });
    });
    const res = await request(app).get('/probe?period=20');
    expect(res.status).toBe(200);
    expect(res.body.query.period).toBe(20);
  });
});