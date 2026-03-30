/**
 * 邮件模板引擎 & 通知分组引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EmailTemplateEngine } from '../services/notification/emailTemplateEngine';
import { NotificationGroupingEngine } from '../services/notification/groupingEngine';
import type { NotificationPayload } from '../services/notification/types';

function createNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'price_alert',
    priority: 'medium',
    title: '测试通知',
    body: '内容',
    channels: ['websocket'],
    userId: 'user_001',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ====== 邮件模板引擎测试 ======
describe('EmailTemplateEngine', () => {
  let engine: EmailTemplateEngine;

  beforeEach(() => {
    engine = new EmailTemplateEngine();
  });

  describe('模板管理', () => {
    it('应有内置模板', () => {
      const templates = engine.getAllTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(4);
    });

    it('应能按ID获取模板', () => {
      const t = engine.getTemplate('price_alert_above');
      expect(t).toBeDefined();
      expect(t!.name).toBe('价格突破预警');
    });

    it('应能按类别获取模板', () => {
      const alerts = engine.getTemplatesByCategory('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts.every(t => t.category === 'alert')).toBe(true);
    });

    it('应能添加自定义模板', () => {
      engine.addTemplate({
        id: 'custom_1',
        name: '自定义模板',
        subject: 'Custom: {{title}}',
        htmlBody: '<p>{{content}}</p>',
        textBody: '{{content}}',
        category: 'system',
        variables: ['title', 'content'],
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      expect(engine.getTemplate('custom_1')).toBeDefined();
    });

    it('应能更新模板', () => {
      const ok = engine.updateTemplate('price_alert_above', { name: '修改后的名称' });
      expect(ok).toBe(true);
      expect(engine.getTemplate('price_alert_above')!.name).toBe('修改后的名称');
    });

    it('更新不存在的模板返回false', () => {
      expect(engine.updateTemplate('nonexistent', { name: 'x' })).toBe(false);
    });

    it('应能删除模板', () => {
      expect(engine.deleteTemplate('price_alert_above')).toBe(true);
      expect(engine.getTemplate('price_alert_above')).toBeUndefined();
    });

    it('应能启用/禁用模板', () => {
      engine.toggleTemplate('price_alert_above', false);
      expect(engine.getTemplate('price_alert_above')!.enabled).toBe(false);
      engine.toggleTemplate('price_alert_above', true);
      expect(engine.getTemplate('price_alert_above')!.enabled).toBe(true);
    });
  });

  describe('渲染', () => {
    it('应正确渲染变量插值', () => {
      const result = engine.render('price_alert_above', {
        variables: {
          stockName: '贵州茅台',
          stockCode: '600519',
          currentPrice: '1850.00',
          targetPrice: '1800.00',
          changePercent: '+3.5',
          triggerTime: '2024-01-15 10:30:00',
          stockUrl: '/stock/600519',
          isPositive: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.subject).toContain('贵州茅台');
      expect(result!.subject).toContain('600519');
      expect(result!.subject).toContain('1800.00');
      expect(result!.textBody).toContain('贵州茅台');
      expect(result!.textBody).toContain('¥1850.00');
    });

    it('禁用模板返回null', () => {
      engine.toggleTemplate('price_alert_above', false);
      const result = engine.render('price_alert_above', { variables: {} });
      expect(result).toBeNull();
    });

    it('不存在的模板返回null', () => {
      const result = engine.render('nonexistent', { variables: {} });
      expect(result).toBeNull();
    });

    it('缺失变量应替换为空字符串', () => {
      const result = engine.render('system_notice', {
        variables: { title: '测试' },
      });
      expect(result).toBeDefined();
      expect(result!.subject).toContain('测试');
      expect(result!.htmlBody).not.toContain('{{title}}');
    });

    it('应正确渲染条件块(if-else)', () => {
      const result = engine.render('trade_notification', {
        variables: {
          action: '买入',
          stockName: '宁德时代',
          stockCode: '300750',
          volume: '100',
          price: '220.00',
          totalAmount: '22000.00',
          isBuy: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.htmlBody).toContain('52c41a'); // 买入绿色
    });

    it('应正确渲染循环块', () => {
      const result = engine.render('daily_digest', {
        variables: {
          date: '2024-01-15',
          shanghaiIndex: '3200.00',
          shanghaiChange: '+0.5%',
          shenzhenIndex: '10500.00',
          shenzhenChange: '+0.8%',
          gemIndex: '2100.00',
          gemChange: '+1.2%',
          watchlistItems: [
            { name: '贵州茅台', code: '600519', price: '1850.00', changePercent: '+3.5' },
            { name: '宁德时代', code: '300750', price: '220.00', changePercent: '-1.2' },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result!.htmlBody).toContain('贵州茅台');
      expect(result!.htmlBody).toContain('宁德时代');
      expect(result!.htmlBody).toContain('600519');
      expect(result!.htmlBody).toContain('300750');
    });

    it('应包含取消订阅链接', () => {
      const result = engine.render('price_alert_above', {
        variables: {
          stockName: 'Test', stockCode: '000000',
          currentPrice: '10', targetPrice: '12',
          changePercent: '5', triggerTime: 'now',
          stockUrl: '/stock/000000', isPositive: true,
        },
        unsubscribeUrl: 'https://example.com/unsub',
      });

      expect(result!.htmlBody).toContain('https://example.com/unsub');
      expect(result!.textBody).toContain('');
    });
  });

  describe('发送队列', () => {
    it('应能排队邮件', () => {
      const record = engine.queueSend('user@test.com', 'system_notice', {
        variables: { title: '测试', message: '内容', timestamp: '2024-01-15' },
      });
      expect(record).toBeDefined();
      expect(record!.status).toBe('queued');
      expect(engine.getQueue().length).toBe(1);
    });

    it('对禁用模板返回null', () => {
      engine.toggleTemplate('system_notice', false);
      const record = engine.queueSend('user@test.com', 'system_notice', {
        variables: {},
      });
      expect(record).toBeNull();
    });

    it('批量排队', () => {
      const records = engine.batchQueue(
        ['a@test.com', 'b@test.com', 'c@test.com'],
        'system_notice',
        { variables: { title: '批量', message: '内容', timestamp: 'now' } }
      );
      expect(records).toHaveLength(3);
      expect(engine.getQueue().length).toBe(3);
    });

    it('处理队列后清空队列', () => {
      engine.queueSend('user@test.com', 'system_notice', {
        variables: { title: '测试', message: '内容', timestamp: 'now' },
      });
      engine.processQueue();
      expect(engine.getQueue().length).toBe(0);
      expect(engine.getSentEmails().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('清空', () => {
    it('clear应重置所有状态', () => {
      engine.queueSend('a@t.com', 'system_notice', { variables: { title: '', message: '', timestamp: '' } });
      engine.clear();
      expect(engine.getAllTemplates().length).toBe(0);
      expect(engine.getQueue().length).toBe(0);
    });
  });
});

// ====== 通知分组引擎测试 ======
describe('NotificationGroupingEngine', () => {
  let engine: NotificationGroupingEngine;

  beforeEach(() => {
    engine = new NotificationGroupingEngine({ autoCollapseThreshold: 10 });
  });

  describe('按类型分组', () => {
    it('同类型通知应分到一组', () => {
      engine.addNotification(createNotification({ type: 'price_alert', title: 'A' }));
      engine.addNotification(createNotification({ type: 'price_alert', title: 'B' }));
      engine.addNotification(createNotification({ type: 'news', title: 'C' }));

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(2);

      const alertGroup = groups.find(g => g.key === 'type:price_alert');
      expect(alertGroup).toBeDefined();
      expect(alertGroup!.count).toBe(2);

      const newsGroup = groups.find(g => g.key === 'type:news');
      expect(newsGroup).toBeDefined();
      expect(newsGroup!.count).toBe(1);
    });

    it('应包含所有9种通知类型', () => {
      const types = ['price_alert', 'news', 'system', 'trade', 'report',
        'watchlist_update', 'limit_up', 'limit_down', 'volume_surge'] as const;

      types.forEach(type => {
        engine.addNotification(createNotification({ type }));
      });

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(9);
    });
  });

  describe('按股票分组', () => {
    beforeEach(() => {
      engine.updateConfig({ strategy: 'by_stock' });
    });

    it('同股票通知应分到一组', () => {
      engine.addNotification(createNotification({
        type: 'price_alert',
        data: { symbol: '600519', name: '贵州茅台' },
      }));
      engine.addNotification(createNotification({
        type: 'limit_up',
        data: { symbol: '600519', name: '贵州茅台' },
      }));
      engine.addNotification(createNotification({
        type: 'price_alert',
        data: { symbol: '300750', name: '宁德时代' },
      }));

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(2);

      const maoGroup = groups.find(g => g.key === 'stock:600519');
      expect(maoGroup!.count).toBe(2);
    });

    it('无股票数据的通知归入general组', () => {
      engine.addNotification(createNotification({ type: 'system' }));
      const groups = engine.getAllGroups();
      expect(groups[0].key).toBe('stock:general');
    });
  });

  describe('按优先级分组', () => {
    beforeEach(() => {
      engine.updateConfig({ strategy: 'by_priority' });
    });

    it('同优先级通知应分到一组', () => {
      engine.addNotification(createNotification({ priority: 'high' }));
      engine.addNotification(createNotification({ priority: 'high' }));
      engine.addNotification(createNotification({ priority: 'low' }));

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(2);

      const highGroup = groups.find(g => g.key === 'priority:high');
      expect(highGroup!.count).toBe(2);
    });
  });

  describe('按时间窗口分组', () => {
    beforeEach(() => {
      engine.updateConfig({ strategy: 'by_time_window', timeWindowMs: 60000 }); // 1分钟窗口
    });

    it('同时间窗口内通知应分到一组', () => {
      const base = 1700000000000; // 固定在窗口中间
      engine.addNotification(createNotification({ createdAt: base }));
      engine.addNotification(createNotification({ createdAt: base + 10000 }));
      engine.addNotification(createNotification({ createdAt: base + 30000 }));

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].count).toBe(3);
    });

    it('不同时间窗口通知应分到不同组', () => {
      const base = 1700000000000;
      engine.addNotification(createNotification({ createdAt: base }));
      engine.addNotification(createNotification({ createdAt: base + 120000 })); // 2分钟后

      const groups = engine.getAllGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('智能分组', () => {
    beforeEach(() => {
      engine.updateConfig({ strategy: 'smart' });
    });

    it('市场事件按股票分组', () => {
      engine.addNotification(createNotification({
        type: 'price_alert',
        data: { symbol: '600519', name: '贵州茅台' },
      }));
      engine.addNotification(createNotification({
        type: 'limit_up',
        data: { symbol: '600519', name: '贵州茅台' },
      }));
      engine.addNotification(createNotification({
        type: 'news',
        title: '市场新闻',
      }));

      const groups = engine.getAllGroups();
      // 600519市场事件在一组，news在另一组
      expect(groups.length).toBeGreaterThanOrEqual(2);

      const marketGroup = groups.find(g => g.key.startsWith('smart:market:600519'));
      expect(marketGroup).toBeDefined();
      expect(marketGroup!.count).toBe(2);
    });
  });

  describe('分组管理', () => {
    it('应正确生成摘要', () => {
      engine.addNotification(createNotification({ type: 'price_alert', title: 'A突破' }));
      engine.addNotification(createNotification({ type: 'price_alert', title: 'B回调' }));

      const groups = engine.getAllGroups();
      const alertGroup = groups.find(g => g.key === 'type:price_alert');
      expect(alertGroup!.count).toBe(2);
      expect(alertGroup!.summary).toContain('价格预警');
    });

    it('标记分组已读', () => {
      engine.addNotification(createNotification({ type: 'price_alert', read: false }));
      engine.markGroupRead('type:price_alert');

      const group = engine.getGroup('type:price_alert');
      expect(group!.read).toBe(true);
      expect(group!.notifications.every(n => n.read)).toBe(true);
    });

    it('全部标记已读', () => {
      engine.addNotification(createNotification({ type: 'price_alert', read: false }));
      engine.addNotification(createNotification({ type: 'news', read: false }));

      const count = engine.markAllRead();
      expect(count).toBe(2);
      expect(engine.getUnreadGroups()).toHaveLength(0);
    });

    it('获取未读分组', () => {
      engine.addNotification(createNotification({ type: 'price_alert', read: false }));
      engine.addNotification(createNotification({ type: 'news', read: true }));

      const unread = engine.getUnreadGroups();
      expect(unread).toHaveLength(1);
      expect(unread[0].key).toBe('type:price_alert');
    });

    it('折叠/展开', () => {
      engine.addNotification(createNotification({ type: 'price_alert' }));
      const collapsed = engine.toggleCollapse('type:price_alert');
      expect(collapsed).toBe(true);
      expect(engine.getCollapsedGroups()).toHaveLength(1);

      engine.toggleCollapse('type:price_alert');
      expect(engine.getCollapsedGroups()).toHaveLength(0);
    });
  });

  describe('自动折叠', () => {
    it('达到阈值自动折叠', () => {
      engine.updateConfig({ autoCollapseThreshold: 2, strategy: 'by_type' });
      engine.addNotification(createNotification({ type: 'price_alert' }));
      expect(engine.getGroup('type:price_alert')!.collapsed).toBe(false);

      engine.addNotification(createNotification({ type: 'price_alert' }));
      expect(engine.getGroup('type:price_alert')!.collapsed).toBe(true);
    });
  });

  describe('优先级合并', () => {
    it('组优先级取最高', () => {
      engine.addNotification(createNotification({ type: 'price_alert', priority: 'low' }));
      engine.addNotification(createNotification({ type: 'price_alert', priority: 'urgent' }));

      const group = engine.getGroup('type:price_alert');
      expect(group!.priority).toBe('urgent');
    });
  });

  describe('分组统计', () => {
    it('应正确统计', () => {
      engine.addNotification(createNotification({ type: 'price_alert' }));
      engine.addNotification(createNotification({ type: 'price_alert' }));
      engine.addNotification(createNotification({ type: 'news' }));

      const stats = engine.getStats();
      expect(stats.totalGroups).toBe(2);
      expect(stats.totalNotifications).toBe(3);
      expect(stats.avgGroupSize).toBe(1.5);
      expect(stats.largestGroup).toBe(2);
    });
  });

  describe('重建', () => {
    it('更新配置后应重建分组', () => {
      engine.addNotification(createNotification({ type: 'price_alert', priority: 'high' }));
      engine.addNotification(createNotification({ type: 'price_alert', priority: 'low' }));

      expect(engine.getAllGroups()).toHaveLength(1);

      engine.updateConfig({ strategy: 'by_priority' });
      expect(engine.getAllGroups()).toHaveLength(2);
    });
  });

  describe('清空', () => {
    it('clear应清空所有分组', () => {
      engine.addNotification(createNotification());
      engine.clear();
      expect(engine.getAllGroups()).toHaveLength(0);
    });
  });
});
