/**
 * 选股器静态目录契约（真实绑定 backend/src/api/screener.ts）
 *
 * 为什么测这四个端点：screener.ts（975 行）在可达性工具里是「用户可达、零测试绑定」；
 * 其中 /screener/templates、/screener/fields、自定义模板增删不碰数据库，可纯内存测。
 * 诚实契约（sendHonest，screener.ts:23）：静态配置目录必须 dataSource 'unavailable'
 * 且 message 说明「不含行情数据」，避免前端把模板目录当成真实选股产出。
 *
 * 挂载点与生产一致：app.use('/api', router)。
 * 数据库用桩替换（这些端点在内存里跑，不触库）。
 *
 * 已知口径差异（未在本文件断言，留待产品决定）：模板保存的字段白名单有两份——
 * middleware/validation.ts:246 的 Joi `field.valid(...)`（32 个，含 rsi/macd/kdj/boll/ma）
 * 与 screener.ts:305 的 ALLOWED_FIELDS（23 个，即 /screener/fields 公布的那份）。
 * 结果：带技术指标的模板请求能过 Joi、却被 handler 以「不支持的筛选字段」拒掉。
 * 今天 UI 只从 /screener/fields 取字段，故用户碰不到；一旦开放技术指标建模板就会 400。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db/dbFactory', () => ({
  db: {},
  isMemoryMode: () => true,
}));

import screenerRouter from '../api/screener';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', screenerRouter);
  return app;
}

const VALID_TEMPLATE = {
  name: '我的低估值',
  description: '测试用',
  conditions: [{ field: 'pe_ratio', operator: 'lt', value: 15 }],
};

describe('GET /api/screener/templates（静态模板目录）', () => {
  let app: express.Express;
  beforeEach(() => { app = makeApp(); });

  it('顶层与 data 内都是 dataSource unavailable，并说明是静态配置', async () => {
    const res = await request(app).get('/api/screener/templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.message).toContain('静态策略模板目录');
    expect(res.body.data.message).toContain('不含任何行情数据');
  });

  it('预设模板齐全：total 等于 presets 数，五个分类都在', async () => {
    const res = await request(app).get('/api/screener/templates');
    const { presets, customs, categories, total } = res.body.data;
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThanOrEqual(10);
    expect(total).toBe(presets.length + customs.length);
    expect(categories).toEqual(['value', 'growth', 'momentum', 'technical', 'income']);
    expect(presets.map((t: any) => t.id)).toContain('value_stocks');
  });

  it('category 过滤只保留该分类；未知分类不过滤（返回全部）', async () => {
    const all = await request(app).get('/api/screener/templates');
    const value = await request(app).get('/api/screener/templates?category=value');
    expect(value.body.data.presets.length).toBeGreaterThan(0);
    expect(value.body.data.presets.every((t: any) => t.category === 'value')).toBe(true);
    expect(value.body.data.total).toBeLessThanOrEqual(all.body.data.total);

    const bogus = await request(app).get('/api/screener/templates?category=not-a-category');
    expect(bogus.body.data.presets.length).toBe(all.body.data.presets.length);
  });
});

describe('GET /api/screener/fields（字段元数据目录）', () => {
  it('字段与运算符齐备，分类去重，同样标 unavailable', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/screener/fields');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.fields.length).toBeGreaterThanOrEqual(20);
    expect(res.body.data.operators.map((o: any) => o.operator)).toEqual([
      'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'in', 'not_in',
    ]);
    expect(new Set(res.body.data.categories).size).toBe(res.body.data.categories.length);
    const price = res.body.data.fields.find((f: any) => f.field === 'price');
    expect(price).toMatchObject({ name: '最新价', unit: '元', type: 'number' });
  });
});

describe('自定义模板增删（内存态）', () => {
  it('创建 → 出现在列表 → 删除 → 从列表消失', async () => {
    const app = makeApp();
    const before = await request(app).get('/api/screener/templates');

    const created = await request(app).post('/api/screener/templates').send(VALID_TEMPLATE);
    expect(created.status).toBe(201);
    expect(created.body.data.id).toMatch(/^custom_\d+$/);
    expect(created.body.data).toMatchObject({
      name: '我的低估值',
      category: 'custom',
      sortBy: 'change_percent',
      sortOrder: 'desc',
    });

    const afterCreate = await request(app).get('/api/screener/templates');
    expect(afterCreate.body.data.customs.length).toBe(before.body.data.customs.length + 1);
    expect(afterCreate.body.data.total).toBe(before.body.data.total + 1);

    const removed = await request(app).delete(`/api/screener/templates/${created.body.data.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual({ deleted: true, id: created.body.data.id });

    const afterDelete = await request(app).get('/api/screener/templates');
    expect(afterDelete.body.data.customs.length).toBe(before.body.data.customs.length);
  });

  it('不支持的筛选字段 → 400（由 Joi 白名单拦截，并给出字段名）', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/screener/templates')
      .send({ ...VALID_TEMPLATE, conditions: [{ field: 'hacker_field', operator: 'gt', value: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('请求体验证失败');
    expect(res.body.details).toContain('field');
  });

  it('缺少 name → 400 请求体验证失败（不落库、不创建）', async () => {
    const app = makeApp();
    const before = await request(app).get('/api/screener/templates');
    const res = await request(app).post('/api/screener/templates').send({ conditions: VALID_TEMPLATE.conditions });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请求体验证失败');
    const after = await request(app).get('/api/screener/templates');
    expect(after.body.data.customs.length).toBe(before.body.data.customs.length);
  });

  it('删除不存在的模板 → 404，且不误删预设模板', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/screener/templates/value_stocks');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('模板不存在');
    const list = await request(app).get('/api/screener/templates');
    expect(list.body.data.presets.map((t: any) => t.id)).toContain('value_stocks');
  });
});
