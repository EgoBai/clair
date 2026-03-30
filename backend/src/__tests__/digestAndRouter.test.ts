/**
 * 摘要引擎 & 优先级路由器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DigestEngine } from '../services/notification/digestEngine';
import { NotificationRouter } from '../services/notification/priorityRouter';
import type { NotificationPayload, NotificationType, NotificationPriority } from '../services/notification/types';

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

// ====== DigestEngine ======
describe('DigestEngine', () => {
  let engine: DigestEngine;

  beforeEach(() => {
    engine = new DigestEngine();
  });

  it('即时摘要应包含所有通知', () => {
    const notifs = [
      createNotification({ type: 'price_alert', title: 'A突破' }),
      createNotification({ type: 'news', title: 'B新闻' }),
      createNotification({ type: 'limit_up', title: 'C涨停' }),
    ];

    const digest = engine.generateImmediateDigest('u1', notifs);
    expect(digest).toBeDefined();
    expect(digest.count).toBe(3);
    expect(digest.byType['price_alert']).toBe(1);
    expect(digest.byType['news']).toBe(1);
    expect(digest.byType['limit_up']).toBe(1);
  });

  it('应生成摘要文本', () => {
    const notifs = [
      createNotification({ type: 'price_alert' }),
      createNotification({ type: 'price_alert' }),
      createNotification({ type: 'news' }),
    ];

    const digest = engine.generateImmediateDigest('u1', notifs);
    expect(digest.summary).toContain('价格预警×2');
    expect(digest.summary).toContain('新闻×1');
  });

  it('高优先级通知应成为亮点', () => {
    const notifs = [
      createNotification({ type: 'price_alert', priority: 'high', title: '重要突破' }),
      createNotification({ type: 'news', priority: 'low', title: '普通新闻' }),
      createNotification({ type: 'system', priority: 'medium', title: '一般通知' }),
    ];

    const digest = engine.generateImmediateDigest('u1', notifs);
    expect(digest.highlights).toContain('重要突破');
    expect(digest.highlights).not.toContain('普通新闻');
    expect(digest.highlights).not.toContain('一般通知');
  });

  it('应正确统计已读/未读', () => {
    const notifs = [
      createNotification({ type: 'price_alert', read: false }),
      createNotification({ type: 'price_alert', read: true }),
      createNotification({ type: 'news', read: false }),
    ];

    const digest = engine.generateImmediateDigest('u1', notifs);
    expect(digest.unreadCount).toBe(2);
  });

  it('按优先级统计', () => {
    const notifs = [
      createNotification({ priority: 'high' }),
      createNotification({ priority: 'high' }),
      createNotification({ priority: 'low' }),
    ];

    const digest = engine.generateImmediateDigest('u1', notifs);
    expect(digest.byPriority['high']).toBe(2);
    expect(digest.byPriority['low']).toBe(1);
  });

  it('空通知应返回null', () => {
    const digest = engine.generateOnDemandDigest('u1');
    expect(digest).toBeNull();
  });

  it('按需摘要支持类型筛选', () => {
    engine.addNotification(createNotification({ userId: 'u1', type: 'price_alert', createdAt: Date.now() }));
    engine.addNotification(createNotification({ userId: 'u1', type: 'news', createdAt: Date.now() }));

    const digest = engine.generateOnDemandDigest('u1', { types: ['price_alert'] });
    expect(digest).toBeDefined();
    expect(digest!.count).toBe(1);
    expect(digest!.notifications[0].type).toBe('price_alert');
  });

  it('按需摘要支持仅未读筛选', () => {
    engine.addNotification(createNotification({ userId: 'u1', read: false, createdAt: Date.now() }));
    engine.addNotification(createNotification({ userId: 'u1', read: true, createdAt: Date.now() }));

    const digest = engine.generateOnDemandDigest('u1', { unreadOnly: true });
    expect(digest!.count).toBe(1);
  });

  it('每日摘要标题包含日期', () => {
    engine.addNotification(createNotification({ userId: 'u1', createdAt: Date.now() }));
    const digest = engine.generateDailyDigest('u1');
    expect(digest!.title).toContain('每日摘要');
  });

  it('应获取用户所有摘要', () => {
    engine.addNotification(createNotification({ userId: 'u1', createdAt: Date.now() }));
    engine.generateImmediateDigest('u1', [createNotification({ userId: 'u1' })]);
    engine.generateDailyDigest('u1');

    const digests = engine.getDigests('u1');
    expect(digests.length).toBeGreaterThanOrEqual(2);
  });

  it('clear应清空所有数据', () => {
    engine.addNotification(createNotification());
    engine.clear();
    expect(engine.getDigests('u1')).toHaveLength(0);
  });
});

// ====== NotificationRouter ======
describe('NotificationRouter', () => {
  let router: NotificationRouter;

  beforeEach(() => {
    router = new NotificationRouter();
  });

  describe('基本路由', () => {
    it('紧急通知应路由到所有渠道', () => {
      const notif = createNotification({ priority: 'urgent' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('in_app');
      expect(result.channels).toContain('email');
      expect(result.channels).toContain('sms');
    });

    it('高优先级通知应路由到推送渠道', () => {
      const notif = createNotification({ priority: 'high' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('push');
      expect(result.channels).toContain('in_app');
    });

    it('交易通知应路由到邮件渠道', () => {
      const notif = createNotification({ type: 'trade' });
      const result = router.route(notif);

      expect(result.channels).toContain('email');
    });

    it('市场事件应路由到websocket和in_app', () => {
      const notif = createNotification({ type: 'limit_up' });
      const result = router.route(notif);

      expect(result.channels).toContain('websocket');
      expect(result.channels).toContain('in_app');
    });

    it('价格预警应路由到推送渠道', () => {
      const notif = createNotification({ type: 'price_alert' });
      const result = router.route(notif);

      expect(result.channels).toContain('push');
      expect(result.channels).toContain('websocket');
    });

    it('新闻应路由到in_app（聚合模式）', () => {
      const notif = createNotification({ type: 'news' });
      const result = router.route(notif);

      expect(result.channels).toContain('in_app');
      expect(result.transformed).toBe(true);
    });

    it('低优先级应延迟', () => {
      const notif = createNotification({ priority: 'low', type: 'system' });
      const result = router.route(notif);

      expect(result.delayed).toBe(true);
      expect(result.delayUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('规则管理', () => {
    it('应添加自定义规则（在默认规则前）', () => {
      // 添加到规则列表开头，使其在默认规则前被匹配
      const rules = router.getAllRules();
      const defaultIdx = rules.findIndex(r => r.id === 'default');
      
      router.addRule({
        id: 'custom_1',
        name: '自定义报告规则',
        enabled: true,
        types: ['report'],
        priorities: ['high', 'urgent'],
        channels: ['email', 'push'],
      });

      // 高优先级report应匹配自定义规则
      const notif = createNotification({ type: 'report', priority: 'high' });
      const result = router.route(notif);
      expect(result.channels).toContain('email');
    });

    it('应删除规则', () => {
      const removed = router.removeRule('urgent_all_channels');
      expect(removed).toBe(true);
      expect(router.getRule('urgent_all_channels')).toBeUndefined();
    });

    it('删除不存在的规则返回false', () => {
      expect(router.removeRule('nonexistent')).toBe(false);
    });

    it('应启用/禁用规则', () => {
      router.toggleRule('urgent_all_channels', false);
      expect(router.getRule('urgent_all_channels')!.enabled).toBe(false);
    });

    it('应返回所有规则', () => {
      expect(router.getAllRules().length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('渠道建议', () => {
    it('应根据通知返回推荐渠道', () => {
      const channels = router.suggestChannels(createNotification({ priority: 'urgent' }));
      expect(channels.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('批量路由', () => {
    it('应批量路由多个通知', () => {
      const notifs = [
        createNotification({ priority: 'urgent' }),
        createNotification({ priority: 'low' }),
        createNotification({ type: 'trade' }),
      ];

      const results = router.routeBatch(notifs);
      expect(results).toHaveLength(3);
      expect(results[0].channels.length).toBeGreaterThanOrEqual(results[1].channels.length);
    });
  });

  describe('统计', () => {
    it('应统计路由结果', () => {
      // 使用一个全新的路由器避免共享状态
      const testRouter = new NotificationRouter();
      const r1 = testRouter.route(createNotification({ priority: 'urgent' }));
      const r2 = testRouter.route(createNotification({ priority: 'low', type: 'system' }));

      expect(r1.delayed).toBe(false);
      expect(r2.delayed).toBe(true);
      expect(r2.ruleId).toBe('low_priority_delay');

      const stats = testRouter.getStats();
      expect(stats.totalRouted).toBe(2);
      expect(stats.delayed).toBe(1);
    });
  });

  describe('清空', () => {
    it('clear应重置所有状态', () => {
      router.route(createNotification());
      router.clear();
      expect(router.getAllRules()).toHaveLength(0);
      expect(router.getStats().totalRouted).toBe(0);
    });
  });
});
