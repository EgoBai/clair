/**
 * 通知系统 API 测试
 * Round 124
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import notificationRouter from '../api/notifications';
import { notificationService } from '../services/notification/service';

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRouter);

describe('通知系统 API', () => {
  beforeEach(() => {
    notificationService.clear();
  });

  it('GET /user/:userId 应返回空列表', async () => {
    const res = await request(app).get('/api/notifications/user/testuser');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('POST / 应创建通知', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .send({
        userId: 'user1',
        type: 'system',
        title: '测试通知',
        body: '测试内容',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toMatch(/^notif_/);
    expect(res.body.data.title).toBe('测试通知');
  });

  it('POST / 缺少必填字段应返回400', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /:notificationId 应获取单个通知', async () => {
    const createRes = await request(app)
      .post('/api/notifications')
      .send({
        userId: 'user1',
        type: 'system',
        title: 'Test',
        body: 'Body',
      });

    const id = createRes.body.data.id;
    const res = await request(app).get(`/api/notifications/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('GET /:notificationId 不存在应返回404', async () => {
    const res = await request(app).get('/api/notifications/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /:id/read 应标记已读', async () => {
    const createRes = await request(app)
      .post('/api/notifications')
      .send({
        userId: 'user1',
        type: 'system',
        title: 'Test',
        body: 'Body',
      });

    const id = createRes.body.data.id;
    const res = await request(app).patch(`/api/notifications/${id}/read`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 验证已读
    const getRes = await request(app).get(`/api/notifications/${id}`);
    expect(getRes.body.data.read).toBe(true);
  });

  it('PATCH /user/:userId/read-all 应批量标记已读', async () => {
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N1', body: 'B1' });
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N2', body: 'B2' });

    const res = await request(app).patch('/api/notifications/user/user1/read-all');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('2');
  });

  it('DELETE /:notificationId 应删除通知', async () => {
    const createRes = await request(app)
      .post('/api/notifications')
      .send({
        userId: 'user1',
        type: 'system',
        title: 'Test',
        body: 'Body',
      });

    const id = createRes.body.data.id;
    const res = await request(app).delete(`/api/notifications/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 验证已删除
    const getRes = await request(app).get(`/api/notifications/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /user/:userId/clear 应清空通知', async () => {
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N1', body: 'B1' });
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N2', body: 'B2' });

    const res = await request(app).delete('/api/notifications/user/user1/clear');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('2');

    const listRes = await request(app).get('/api/notifications/user/user1');
    expect(listRes.body.data.length).toBe(0);
  });

  it('GET /user/:userId/stats 应返回统计', async () => {
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N1', body: 'B1' });
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'price_alert', title: 'N2', body: 'B2' });

    const res = await request(app).get('/api/notifications/user/user1/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.unread).toBe(2);
  });

  it('GET /user/:userId/unread-count 应返回未读数', async () => {
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'N1', body: 'B1' });

    const res = await request(app).get('/api/notifications/user/user1/unread-count');
    expect(res.body.data.count).toBe(1);
  });

  it('GET /user/:userId/preferences 应返回偏好', async () => {
    const res = await request(app).get('/api/notifications/user/user1/preferences');
    expect(res.status).toBe(200);
    expect(res.body.data.globalEnabled).toBe(true);
  });

  it('PUT /user/:userId/preferences 应更新偏好', async () => {
    const res = await request(app)
      .put('/api/notifications/user/user1/preferences')
      .send({
        globalEnabled: true,
        pushEnabled: false,
        emailEnabled: true,
        smsEnabled: false,
        subscriptions: [],
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        dailyDigest: false,
        maxDailyNotifications: 50,
        createdAt: Date.now(),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.pushEnabled).toBe(false);
    expect(res.body.data.emailEnabled).toBe(true);
  });

  it('GET /templates/list 应返回模板列表', async () => {
    const res = await request(app).get('/api/notifications/templates/list');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /batch 应批量创建通知', async () => {
    const res = await request(app)
      .post('/api/notifications/batch')
      .send({
        userIds: ['u1', 'u2', 'u3'],
        type: 'system',
        title: '批量通知',
        body: '内容',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.length).toBe(3);
  });

  it('POST /batch 缺少必填字段应返回400', async () => {
    const res = await request(app)
      .post('/api/notifications/batch')
      .send({ userIds: ['u1'] });

    expect(res.status).toBe(400);
  });

  it('GET /user/:userId 应支持查询参数过滤', async () => {
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'system', title: 'Sys', body: 'B', priority: 'low' });
    await request(app)
      .post('/api/notifications')
      .send({ userId: 'user1', type: 'price_alert', title: 'Alert', body: 'B', priority: 'high' });

    const res = await request(app)
      .get('/api/notifications/user/user1?type=price_alert&priority=high');

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].type).toBe('price_alert');
  });

  it('完整工作流 - 创建->阅读->标记已读->删除', async () => {
    // 创建
    const createRes = await request(app)
      .post('/api/notifications')
      .send({
        userId: 'user1',
        type: 'price_alert',
        title: '价格突破',
        body: '茅台突破1800',
        priority: 'high',
        channels: ['in_app'],
      });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id;

    // 查看
    const getRes = await request(app).get(`/api/notifications/${id}`);
    expect(getRes.body.data.read).toBe(false);

    // 标记已读
    await request(app).patch(`/api/notifications/${id}/read`);
    const readRes = await request(app).get(`/api/notifications/${id}`);
    expect(readRes.body.data.read).toBe(true);

    // 删除
    await request(app).delete(`/api/notifications/${id}`);
    const deletedRes = await request(app).get(`/api/notifications/${id}`);
    expect(deletedRes.status).toBe(404);
  });
});
