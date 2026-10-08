/**
 * P0-REALCLAIM：/api/ai/market-insight 不得在无数据时声称 dataSource:'real'
 *
 * 缺陷（已实测坐实，非推演）：
 *   `api/ai-chat.ts` 的 buildRuleInsight 用 `summary?.risingStocks ?? 0`——
 *   db.getMarketSummary() 在**当日无行情时返回 null**（Database.ts:483 `if
 *   (dailyQuotes.length === 0) return null`；InMemoryDatabase.getMarketSummaryInternal
 *   同样在无行情时 return null）。null 被 `?? 0` 吞成全 0，于是 upPct=0 落进
 *   最差分支，凭空生成：
 *     mood:'弱势调整'、overview:'市场情绪偏谨慎，0只个股下跌，防御策略为主。'
 *   而路由层原写死 `sendHonest(res, 'real', insight)`，给这段编造解读盖上真实背书。
 *   这是「编造一段市场解读交给用户」，不是「接口挂了」。
 *
 * 本测试锁定的契约：
 *   1. DB 返回 null → dataSource 绝不为 'real'，且响应里**不含**由 0 反推的结论
 *      （「弱势调整」/「0只个股」/ 任何 mood 判定文案）；
 *   2. DB 返回 null → 所有数值字段必须是 null（= 查不到），**不是 0**
 *      （「真的是 0 只涨」与「查不到」语义完全不同，前者会变成假业务结论）；
 *   3. DB 返回真实数据 → 仍必须是 'real'，且数值与 DB 一致（防过度修复）；
 *   4. 回归锁定：market-insight 路由体内不得再出现硬编码 'real' 字面量。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---- mock 上游：LLM / 真实行情源本测试不涉及，但 ai-chat 模块会 import ----
vi.mock('../services/aiService', () => ({
  default: {
    chat: vi.fn(),
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
}));

vi.mock('../services/realMarketData', () => ({
  getRealMarketData: vi.fn(),
}));

// 稳定单例：各用例需替换其方法，故不能每次 getDb() 都新建对象
const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
  getSectorPerformanceEnhanced: vi.fn(),
  getStockWithLatestQuote: vi.fn(async () => null as unknown),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

import aiChatRouter from '../api/ai-chat';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', aiChatRouter);
  return app;
}

/** 响应体里所有字符串拼起来，用于「不得出现某段文案」的反向断言 */
function allText(res: { body: any }): string {
  return JSON.stringify(res.body);
}

describe('P0-REALCLAIM · /api/ai/market-insight：dataSource 必须由数据可用性推导', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：板块与涨停数据可用（隔离出「只有 breadth 缺失」这一变量）
    dbMock.getSectorMomentumScore.mockResolvedValue([
      { industry: '半导体', score: 78, avg_change_percent: 2.3, limit_up_count: 3, stock_count: 120 },
      { industry: '白酒', score: 61, avg_change_percent: -0.4, limit_up_count: 0, stock_count: 40 },
    ]);
    dbMock.getSectorPerformanceEnhanced.mockResolvedValue([
      { industry: '半导体', limit_up_count: 3 },
      { industry: '白酒', limit_up_count: 0 },
    ]);
  });

  // ==================== 场景 B：DB 返回 null（缺陷复现场景） ====================
  describe('场景 B｜db.getMarketSummary() 返回 null', () => {
    beforeEach(() => {
      // 这正是 Database.ts:483 / InMemoryDatabase 的无行情契约
      dbMock.getMarketSummary.mockResolvedValue(null);
    });

    it('dataSource 不得是 real', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(res.status).toBe(200);
      expect(res.body.dataSource).toBe('unavailable');
      // 顶层与 data 内必须一致（sendHonest 保证），杜绝两级矛盾
      expect(res.body.data.dataSource).toBe('unavailable');
    });

    it('绝不得出现由 0 反推出来的市场解读（核心断言）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');
      const text = allText(res);

      // 「弱势调整」正是 upPct=0 落进 else 分支的产物
      expect(text).not.toContain('弱势调整');
      expect(res.body.data.mood).toBeNull();
      expect(res.body.data.overview).toBeNull();
      // 「0只个股下跌」= fallingStocks 被 ?? 0 吞成 0 后插值出来的
      expect(text).not.toContain('0只个股');
      expect(text).not.toMatch(/\d+\s*只(上涨|下跌|个股下跌)/);
      // 也不该出现其它任何情绪判定词
      for (const fabricated of ['强势上攻', '温和上行', '震荡整理']) {
        expect(text).not.toContain(fabricated);
      }
    });

    it('数值字段必须是 null（查不到），绝不能是 0（真的是 0）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');
      const d = res.body.data;

      for (const f of ['risingStocks', 'fallingStocks', 'unchangedStocks', 'upPct']) {
        expect(d[f], `${f} 必须是 null`).toBeNull();
        expect(d[f], `${f} 绝不能是 0`).not.toBe(0);
      }
      expect(d._rawTotalTurnover).toBeNull();
      expect(d.totalTurnover).toBeNull();
      // metrics 里的展示值必须是「不可用」而非 "0"
      expect(d.metrics['上涨家数']).toBe('不可用');
      expect(d.metrics['下跌家数']).toBe('不可用');
      expect(d.metrics['上涨占比']).toBe('不可用');
      expect(d.metrics['成交额']).toBe('不可用');
      expect(Object.values(d.metrics)).not.toContain('0');
    });

    it('摘要必须如实说明「未生成」，不得留空或糊弄', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(res.body.data.summary).toMatch(/不可用|未生成/);
      expect(res.body.data.summary.length).toBeGreaterThan(0);
      expect(res.body.data.source).toBe('unavailable');
      // points 不得为空数组（前端 DiscoverPage 依赖 points 渲染）
      expect(Array.isArray(res.body.data.points)).toBe(true);
      expect(res.body.data.points.length).toBeGreaterThan(0);
    });

    it('板块数据独立可用时应如实保留（不因 breadth 缺失而丢弃真实数据）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(res.body.data.topSectors).toContain('半导体');
      expect(res.body.data.limitUpCount).toBe(3);
    });
  });

  // ==================== 场景 A：DB 返回真实数据（防过度修复） ====================
  describe('场景 A｜db.getMarketSummary() 返回真实数据', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue({
        date: new Date('2026-10-09'),
        totalStocks: 5000,
        totalTurnover: 8.2e11,
        risingStocks: 3000,
        fallingStocks: 1800,
        unchangedStocks: 200,
      });
    });

    it('仍必须是 dataSource:real，且数值与 DB 完全一致', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(res.status).toBe(200);
      expect(res.body.dataSource).toBe('real');
      expect(res.body.data.dataSource).toBe('real');

      const d = res.body.data;
      expect(d.risingStocks).toBe(3000);
      expect(d.fallingStocks).toBe(1800);
      expect(d.unchangedStocks).toBe(200);
      // 3000 / 5000 = 60% → 温和上行分支
      expect(d.upPct).toBe(60);
      expect(d.mood).toBe('温和上行');
      expect(d.overview).toContain('3000只上涨');
      expect(d.source).toBe('rule');
    });

    it('成交额按真实值格式化（非 0）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      // 8.2e11 元 → 8200亿
      expect(res.body.data.totalTurnover).toBe('8200亿');
      expect(res.body.data._rawTotalTurnover).toBe(8.2e11);
    });

    it('真实为 0 时才写 0（0 与 null 的语义分界不能被反向修复掉）', async () => {
      // 非交易日/全平盘的真实场景：确实 0 只涨。此时 0 是**事实**，必须保留
      dbMock.getMarketSummary.mockResolvedValue({
        totalStocks: 5000,
        totalTurnover: 3e11,
        risingStocks: 0,
        fallingStocks: 0,
        unchangedStocks: 5000,
      });

      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(res.body.dataSource).toBe('real');
      expect(res.body.data.risingStocks).toBe(0);
      expect(res.body.data.upPct).toBe(0);
      expect(res.body.data.metrics['上涨家数']).toBe('0');
    });

    it('summary 非空（前端 DiscoverPage 直接渲染该字段）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');

      expect(typeof res.body.data.summary).toBe('string');
      expect(res.body.data.summary.length).toBeGreaterThan(0);
      expect(res.body.data.points.length).toBeGreaterThan(0);
      expect(res.body.data.sections.length).toBe(3);
    });
  });

  // ==================== 板块数据也缺失 ====================
  describe('板块/涨停数据同时缺失', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue(null);
      dbMock.getSectorMomentumScore.mockResolvedValue([]);
      dbMock.getSectorPerformanceEnhanced.mockResolvedValue([]);
    });

    it('全链路缺失 → 仍不得出现任何编造数值', async () => {
      const res = await request(buildApp()).get('/api/ai/market-insight');
      const d = res.body.data;

      expect(res.body.dataSource).toBe('unavailable');
      expect(d.limitUpCount).toBeNull();
      expect(d.topSectors).toBeNull();
      expect(d.hotSectors).toBeNull();
      expect(d.metrics['涨停']).toBe('不可用');
      expect(allText(res)).not.toContain('涨停0家');
    });
  });

  // ==================== 源码级回归锁定 ====================
  describe('源码级回归：market-insight 不得再硬编码 real', () => {
    it('路由体内无 sendHardcoded-real，且 buildRuleInsight 回传可用性', async () => {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, '../api/ai-chat.ts'), 'utf-8');

      const start = src.indexOf("router.get('/ai/market-insight'");
      expect(start, '未找到 market-insight 路由').toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\nrouter.', start + 10));

      // dataSource 必须由 hasMarketData 推导，而不是字面量
      expect(body).toContain('hasMarketData ?');
      expect(body).not.toContain("sendHonest(res, 'real'");
    });

    it('buildRuleInsight 不再使用 ?? 0 吞掉可空的 getMarketSummary', async () => {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(join(here, '../api/ai-chat.ts'), 'utf-8');

      const start = src.indexOf('async function buildRuleInsight');
      expect(start, '未找到 buildRuleInsight').toBeGreaterThan(-1);
      const end = src.indexOf("\nrouter.get('/ai/market-insight'", start);
      const fn = src.slice(start, end === -1 ? undefined : end);
      // 注释里会引用旧代码（`?? 0` 等）作为对比说明，扫描前先剥掉注释，只查真实代码
      const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      // 曾经的 `summary?.risingStocks ?? 0`
      expect(code).not.toMatch(/marketSummary\?\./);
      expect(code).not.toMatch(/\?\?\s*0/);
      // 回传可用性判据
      expect(code).toContain('hasMarketData');
      expect(fn).toContain('hasMarketData');
    });
  });
});