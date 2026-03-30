/**
 * 模板格式化器 & 多通道协调器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateFormatter } from '../services/notification/templateFormatter';
import { NotificationCoordinator } from '../services/notification/coordinator';
import type { NotificationPayload } from '../services/notification/types';

function createNotification(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type: 'price_alert',
    priority: 'medium',
    title: 'Test',
    body: 'Body',
    channels: ['websocket'],
    userId: 'user_001',
    read: false,
    status: 'pending',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ====== TemplateFormatter ======
describe('TemplateFormatter', () => {
  let formatter: TemplateFormatter;

  beforeEach(() => {
    formatter = new TemplateFormatter();
  });

  describe('数字格式化', () => {
    it('应正确格式化数字', () => {
      expect(formatter.format('number', 1234567.891)).toBe('1,234,567.89');
    });

    it('应支持自定义小数位数', () => {
      expect(formatter.format('number', 3.14159, { decimals: 3 })).toBe('3.142');
    });

    it('百分比格式化带正号', () => {
      expect(formatter.format('percent', 3.5)).toBe('+3.50%');
    });

    it('百分比格式化负数', () => {
      expect(formatter.format('percent', -2.1)).toBe('-2.10%');
    });

    it('中文单位 - 亿', () => {
      expect(formatter.format('chineseUnit', 500000000)).toBe('5.00亿');
    });

    it('中文单位 - 万', () => {
      expect(formatter.format('chineseUnit', 123456)).toBe('12.35万');
    });

    it('中文单位 - 小数', () => {
      expect(formatter.format('chineseUnit', 500)).toBe('500.00');
    });

    it('金额格式化', () => {
      expect(formatter.format('currency', 12345.5)).toContain('12,345.50');
    });

    it('紧凑格式 - 亿', () => {
      expect(formatter.format('compact', 500000000)).toBe('5.0亿');
    });

    it('紧凑格式 - 万', () => {
      expect(formatter.format('compact', 123456)).toBe('12.3万');
    });
  });

  describe('条件格式化', () => {
    it('正数格式化', () => {
      expect(formatter.format('conditional', 5, { positive: '涨', negative: '跌' })).toBe('涨');
    });

    it('负数格式化', () => {
      expect(formatter.format('conditional', -3, { positive: '涨', negative: '跌' })).toBe('跌');
    });

    it('零值格式化', () => {
      expect(formatter.format('conditional', 0, { positive: '+', negative: '-', neutral: '=' })).toBe('=');
    });
  });

  describe('股票相关', () => {
    it('涨跌颜色 - 红涨', () => {
      expect(formatter.format('changeColor', 3)).toBe('#ff4d4f');
    });

    it('涨跌颜色 - 绿跌', () => {
      expect(formatter.format('changeColor', -2)).toBe('#52c41a');
    });

    it('涨跌颜色 - 平', () => {
      expect(formatter.format('changeColor', 0)).toBe('#888');
    });

    it('涨跌标签', () => {
      expect(formatter.format('changeLabel', 5)).toContain('+5');
      expect(formatter.format('changeLabel', -3)).toContain('-3');
    });

    it('股票代码格式化 - 上海', () => {
      expect(formatter.format('stockCode', '600519')).toBe('SH.600519');
    });

    it('股票代码格式化 - 深圳', () => {
      expect(formatter.format('stockCode', '000001')).toBe('SZ.000001');
    });

    it('股票代码格式化 - 创业板', () => {
      expect(formatter.format('stockCode', '300750')).toBe('SZ.300750');
    });
  });

  describe('时间格式化', () => {
    it('相对时间 - 刚刚', () => {
      expect(formatter.format('relativeTime', Date.now() - 10000)).toBe('刚刚');
    });

    it('相对时间 - 分钟', () => {
      expect(formatter.format('relativeTime', Date.now() - 300000)).toBe('5分钟前');
    });

    it('相对时间 - 小时', () => {
      expect(formatter.format('relativeTime', Date.now() - 7200000)).toBe('2小时前');
    });
  });

  describe('文本处理', () => {
    it('截断长文本', () => {
      const longText = '这是一段很长的文本内容需要被截断处理';
      expect(formatter.format('truncate', longText, { length: 10 })).toBe('这是一段很长的文本内...');
    });

    it('短文本不截断', () => {
      expect(formatter.format('truncate', '短文本', { length: 10 })).toBe('短文本');
    });
  });

  describe('模板渲染', () => {
    it('应渲染带格式化的模板', () => {
      const result = formatter.render(
        '价格: {{price | currency}}, 涨跌: {{change | percent}}',
        { price: 1850.5, change: 3.5 }
      );
      expect(result).toContain('1,850.50');
      expect(result).toContain('+3.50%');
    });

    it('应处理无格式化变量', () => {
      const result = formatter.render('{{name}} 的价格是 {{price}}', { name: '茅台', price: 1850 });
      expect(result).toBe('茅台 的价格是 1850');
    });

    it('缺失变量替换为空', () => {
      const result = formatter.render('{{name}} {{missing}}', { name: 'Test' });
      expect(result).toBe('Test ');
    });
  });

  describe('自定义格式化器', () => {
    it('应能注册自定义格式化器', () => {
      formatter.register('stars', (value) => '⭐'.repeat(Number(value)));
      expect(formatter.format('stars', 3)).toBe('⭐⭐⭐');
    });

    it('未知格式化器返回原值', () => {
      expect(formatter.format('nonexistent', 'hello')).toBe('hello');
    });
  });

  describe('格式化器列表', () => {
    it('应返回所有注册的格式化器', () => {
      const names = formatter.getFormatterNames();
      expect(names).toContain('number');
      expect(names).toContain('percent');
      expect(names).toContain('currency');
      expect(names).toContain('conditional');
      expect(names).toContain('changeColor');
      expect(names).toContain('relativeTime');
    });
  });
});

// ====== NotificationCoordinator ======
describe('NotificationCoordinator', () => {
  let coordinator: NotificationCoordinator;

  beforeEach(() => {
    coordinator = new NotificationCoordinator({ maxRetries: 2, retryDelayMs: 10, timeoutMs: 1000 });
    coordinator.registerChannel('websocket', async () => true);
    coordinator.registerChannel('push', async () => true);
    coordinator.registerChannel('email', async () => true);
    coordinator.registerChannel('in_app', async () => true);
  });

  describe('基本发送', () => {
    it('应发送到指定渠道', async () => {
      const notif = createNotification({ channels: ['websocket'] });
      const tasks = await coordinator.send(notif, ['websocket']);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('sent');
      expect(tasks[0].channel).toBe('websocket');
    });

    it('应并行发送到多个渠道', async () => {
      const notif = createNotification();
      const tasks = await coordinator.send(notif, ['websocket', 'push', 'email']);

      expect(tasks).toHaveLength(3);
      expect(tasks.every(t => t.status === 'sent')).toBe(true);
    });

    it('未注册渠道应失败', async () => {
      const notif = createNotification();
      const tasks = await coordinator.send(notif, ['sms']);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('failed');
    });
  });

  describe('重试', () => {
    it('失败后应重试', async () => {
      let attempts = 0;
      coordinator.registerChannel('push', async () => {
        attempts++;
        return attempts >= 2; // 
      });

      const notif = createNotification({ channels: ['push'] });
      const tasks = await coordinator.send(notif, ['push']);

      expect(tasks[0].status).toBe('sent');
      expect(tasks[0].attempts).toBe(2);
    });

    it('exceeding retries should fail', async () => {
      const testCoord = new NotificationCoordinator({ maxRetries: 1, retryDelayMs: 10, timeoutMs: 1000, fallbackOrder: [] });
      testCoord.registerChannel('push', async () => false);

      const notif = createNotification({ channels: ['push'] });
      const tasks = await testCoord.send(notif, ['push']);

      expect(tasks[0].status).toBe('failed');
      expect(tasks[0].attempts).toBe(1);
    });
  });

  describe('批量发送', () => {
    it('应批量发送多个通知', async () => {
      const notifs = [
        createNotification({ channels: ['websocket'] }),
        createNotification({ channels: ['push'] }),
      ];

      const tasks = await coordinator.sendBatch(notifs);
      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.status === 'sent')).toBe(true);
    });
  });

  describe('查询', () => {
    it('应获取已注册渠道', () => {
      const channels = coordinator.getRegisteredChannels();
      expect(channels).toContain('websocket');
      expect(channels).toContain('push');
      expect(channels).toContain('email');
    });

    it('应按状态获取任务', async () => {
      await coordinator.send(createNotification({ channels: ['websocket'] }));
      await coordinator.send(createNotification({ channels: ["sms"] }));

      const sent = coordinator.getTasksByStatus('sent');
      const failed = coordinator.getTasksByStatus('failed');

      expect(sent.length).toBeGreaterThanOrEqual(1);
      expect(failed.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('统计', () => {
    it('应正确统计发送结果', async () => {
      await coordinator.send(createNotification(), ['websocket', 'push']);

      const stats = coordinator.getStats();
      expect(stats.totalSent).toBe(2);
      expect(stats.byChannel['websocket'].sent).toBe(1);
      expect(stats.byChannel['push'].sent).toBe(1);
    });

    it('应记录延迟', async () => {
      await coordinator.send(createNotification(), ['websocket']);

      const stats = coordinator.getStats();
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('清空', () => {
    it('clear应重置状态', async () => {
      await coordinator.send(createNotification(), ['websocket']);
      coordinator.clear();

      expect(coordinator.getAllTasks()).toHaveLength(0);
      expect(coordinator.getStats().totalSent).toBe(0);
    });
  });
});
