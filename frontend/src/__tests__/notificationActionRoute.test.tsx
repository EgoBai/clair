/**
 * 通知跳转：站内白名单 + 软跳行为
 * @vitest-environment jsdom
 *
 * 背景（线上实测）：旧实现 `window.location.href = notification.actionUrl`，
 * 而后端模板下发的是根绝对路径 '/stock/{{symbol}}'。整页跳转会绕过 Router 的 basename
 * （生产为 '/clair/'），请求落到 https://egobai.github.io/stock/600519 —— 站点根没有
 * Pages 站点，浏览器显示 GitHub 通用 404「There isn't a GitHub Pages site here.」。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

/** 从 cwd 逐级向上找后端模板文件（vitest 的 import.meta.url 在 jsdom 下不是 file: 协议） */
function findBackendTemplates(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'backend/src/services/notification/templates.ts');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('找不到 backend/src/services/notification/templates.ts');
}
import React from 'react';

import { ROUTE_PATHS } from '../routes/paths';

// 每次用例可替换的通知列表
const state = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));

vi.mock('../services/notificationService', () => ({
  notificationApi: {
    getUnreadCount: vi.fn().mockResolvedValue(1),
    getUserNotifications: vi.fn(() => Promise.resolve(state.list)),
    getStats: vi.fn().mockResolvedValue({ total: 1, unread: 1, read: 0, byType: {} }),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
  },
  NOTIFICATION_ICONS: { info: 'i', price_alert: '📈' },
  PRIORITY_COLORS: { low: '#ccc', medium: '#1890ff', high: '#faad14', urgent: '#ff4d4f' },
  formatNotificationTime: vi.fn(() => '刚刚'),
}));

import { NotificationBell, resolveNotificationActionUrl } from '../components/NotificationBell';
import { notificationApi } from '../services/notificationService';

const makeNotification = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  type: 'price_alert',
  priority: 'high',
  title: '贵州茅台突破价格线',
  body: '当前 1850',
  read: false,
  createdAt: Date.now(),
  ...over,
});

describe('resolveNotificationActionUrl', () => {
  it('接受站内相对路径且命中真实路由', () => {
    expect(resolveNotificationActionUrl('stocks/600519')).toBe('stocks/600519');
    expect(resolveNotificationActionUrl('report-center')).toBe('report-center');
    expect(resolveNotificationActionUrl('stocks')).toBe('stocks');
    expect(resolveNotificationActionUrl('')).toBeNull();
    expect(resolveNotificationActionUrl(undefined)).toBeNull();
  });

  it('拒绝根绝对路径（本次事故成因）', () => {
    expect(resolveNotificationActionUrl('/stock/600519')).toBeNull();
    expect(resolveNotificationActionUrl('/stocks/600519')).toBeNull();
    expect(resolveNotificationActionUrl('/')).toBeNull();
    expect(resolveNotificationActionUrl('//evil.example.com/x')).toBeNull();
  });

  it('拒绝外部协议（含 javascript:）', () => {
    expect(resolveNotificationActionUrl('https://evil.example.com/a')).toBeNull();
    expect(resolveNotificationActionUrl('javascript:alert(1)')).toBeNull();
    expect(resolveNotificationActionUrl('data:text/html,<script>1</script>')).toBeNull();
  });

  it('拒绝路由不存在的相对路径', () => {
    expect(resolveNotificationActionUrl('stock/600519')).toBeNull(); // 少个 s
    expect(resolveNotificationActionUrl('news/123')).toBeNull(); // 无新闻详情路由
    expect(resolveNotificationActionUrl('report/daily')).toBeNull(); // 无此路由
    // 'stocks/' 去掉尾斜杠后是列表页 'stocks'，属可接受的归一化（不是坏链接）
    expect(resolveNotificationActionUrl('stocks/')).toBe('stocks');
  });
});

describe('白名单与路由表不漂移', () => {
  it('ROUTE_PATHS 里每条路由都能被白名单匹配', () => {
    for (const p of Object.values(ROUTE_PATHS)) {
      // 首页('/') 不作为通知落点：通知指"回首页"没有语义，白名单里也无需覆盖
      if (p === '/') continue;
      const concrete = p.replace(/^\//, '').replace(/:[A-Za-z_]\w*/g, 'TESTVALUE');
      expect(resolveNotificationActionUrl(concrete), `路由 ${p} 未被白名单覆盖`).not.toBeNull();
    }
  });

  it('后端通知模板下发的路径全部能被前端白名单匹配（跨包一致性）', () => {
    const source = fs.readFileSync(findBackendTemplates(), 'utf8');
    const templates = [...source.matchAll(/actionUrlTemplate:\s*'([^']+)'/g)].map((m) => m[1]);

    expect(templates.length).toBeGreaterThan(0);
    for (const raw of templates) {
      // 用占位符补齐参数，模拟真实渲染结果
      const rendered = raw.replace(/\{\{\w+\}\}/g, '600519');
      expect(rendered.startsWith('/'), `模板 "${raw}" 带前导斜杠，会丢 base`).toBe(false);
      expect(resolveNotificationActionUrl(rendered), `模板 "${raw}" 渲染为 "${rendered}" 后不被前端路由匹配`).not.toBeNull();
    }
  });
});

describe('NotificationBell 点击行为（软跳）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.list = [];
  });

  const renderBell = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotificationBell userId="u1" />} />
          <Route path="/stocks/:symbol" element={<div data-testid="detail">股票详情</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('合法路径：走 Router 软跳，不整页刷新（location 未被赋值）', async () => {
    state.list = [makeNotification({ actionUrl: 'stocks/600519' })];
    const hrefBefore = window.location.href;

    renderBell();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('通知'));
    });
    await waitFor(() => expect(screen.getByText('贵州茅台突破价格线')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText('贵州茅台突破价格线'));
    });

    await waitFor(() => expect(screen.getByTestId('detail')).toBeTruthy());
    // 软跳的必要条件：没有任何 location 赋值（真赋值会让地址栏跳出 basename 并整页重载）
    expect(window.location.href).toBe(hrefBefore);
    expect(notificationApi.markAsRead).toHaveBeenCalledWith('n1');
  });

  it('非法路径（根绝对）：不跳转、仅标记已读，并给出可见提示', async () => {
    state.list = [makeNotification({ actionUrl: '/stock/600519' })];
    const hrefBefore = window.location.href;

    renderBell();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('通知'));
    });
    await waitFor(() => expect(screen.getByText('贵州茅台突破价格线')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText('贵州茅台突破价格线'));
    });

    expect(screen.queryByTestId('detail')).toBeNull();
    expect(window.location.href).toBe(hrefBefore);
    expect(notificationApi.markAsRead).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('status').textContent).toContain('未跳转');
  });
});
