/**
 * 通知模板管理测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface NotificationTemplate {
  id: string; type: string; titleTemplate: string; bodyTemplate: string;
  defaultChannels: string[]; defaultPriority: string; icon?: string;
  actionUrlTemplate?: string; enabled: boolean;
}

const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  { id: 'price_alert_above', type: 'price_alert',
    titleTemplate: '📈 {{name}} ({{symbol}}) 突破价格线',
    bodyTemplate: '{{name}} 当前价格 ¥{{price}}，突破预警价 ¥{{targetPrice}}',
    defaultChannels: ['websocket', 'push', 'in_app'], defaultPriority: 'high',
    icon: '📈', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'price_alert_below', type: 'price_alert',
    titleTemplate: '📉 {{name}} ({{symbol}}) 跌破价格线',
    bodyTemplate: '{{name}} 当前价格 ¥{{price}}，跌破预警价 ¥{{targetPrice}}',
    defaultChannels: ['websocket', 'push', 'in_app'], defaultPriority: 'high',
    icon: '📉', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'limit_up', type: 'limit_up',
    titleTemplate: '🔴 {{name}} ({{symbol}}) 涨停',
    bodyTemplate: '{{name}} 已涨停，当前价 ¥{{price}}，成交额 {{turnover}}万',
    defaultChannels: ['websocket', 'in_app'], defaultPriority: 'high',
    icon: '🔴', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'limit_down', type: 'limit_down',
    titleTemplate: '🟢 {{name}} ({{symbol}}) 跌停',
    bodyTemplate: '{{name}} 已跌停，当前价 ¥{{price}}，成交额 {{turnover}}万',
    defaultChannels: ['websocket', 'in_app'], defaultPriority: 'high',
    icon: '🟢', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'volume_surge', type: 'volume_surge',
    titleTemplate: '📊 {{name}} ({{symbol}}) 放量异动',
    bodyTemplate: '{{name}} 成交量 {{volume}}，放大 {{volumeRatio}}倍',
    defaultChannels: ['websocket', 'in_app'], defaultPriority: 'medium',
    icon: '📊', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'news_alert', type: 'news',
    titleTemplate: '📰 {{title}}',
    bodyTemplate: '{{summary}}',
    defaultChannels: ['websocket', 'in_app'], defaultPriority: 'medium',
    icon: '📰', actionUrlTemplate: '/news/{{newsId}}', enabled: true },
  { id: 'system_notice', type: 'system',
    titleTemplate: '⚙️ 系统通知',
    bodyTemplate: '{{message}}',
    defaultChannels: ['in_app', 'push'], defaultPriority: 'low',
    icon: '⚙️', enabled: true },
  { id: 'trade_execution', type: 'trade',
    titleTemplate: '💰 交易执行 - {{symbol}}',
    bodyTemplate: '{{action}} {{volume}}股 {{symbol}}，成交价 ¥{{price}}',
    defaultChannels: ['websocket', 'push', 'in_app'], defaultPriority: 'urgent',
    icon: '💰', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
  { id: 'daily_report', type: 'report',
    titleTemplate: '📋 每日报告 - {{date}}',
    bodyTemplate: '您的自选股今日收益情况已生成',
    defaultChannels: ['in_app', 'push'], defaultPriority: 'low',
    icon: '📋', actionUrlTemplate: '/report/daily', enabled: true },
  { id: 'watchlist_update', type: 'watchlist_update',
    titleTemplate: '⭐ 自选股更新 - {{name}}',
    bodyTemplate: '{{name}} ({{symbol}}) 有重要变动：{{changeDescription}}',
    defaultChannels: ['websocket', 'in_app'], defaultPriority: 'medium',
    icon: '⭐', actionUrlTemplate: '/stock/{{symbol}}', enabled: true },
];

class TestTemplateManager {
  templates: Map<string, NotificationTemplate> = new Map();

  constructor(templates: NotificationTemplate[] = DEFAULT_TEMPLATES) {
    templates.forEach(t => this.templates.set(t.id, { ...t, defaultChannels: [...t.defaultChannels] }));
  }

  getTemplate(id: string) { return this.templates.get(id); }
  getTemplateByType(type: string) { return Array.from(this.templates.values()).find(t => t.type === type && t.enabled); }
  getAllTemplates() { return Array.from(this.templates.values()); }
  addTemplate(template: NotificationTemplate) { this.templates.set(template.id, template); }

  updateTemplate(id: string, updates: Partial<NotificationTemplate>): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;
    this.templates.set(id, { ...existing, ...updates });
    return true;
  }

  deleteTemplate(id: string): boolean { return this.templates.delete(id); }

  toggleTemplate(id: string, enabled: boolean): boolean {
    const template = this.templates.get(id);
    if (!template) return false;
    template.enabled = enabled;
    return true;
  }

  renderTemplate(templateStr: string, data: Record<string, unknown>): string {
    return templateStr.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = data[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  }

  renderNotification(templateId: string, data: Record<string, unknown>) {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) return null;
    return {
      title: this.renderTemplate(template.titleTemplate, data),
      body: this.renderTemplate(template.bodyTemplate, data),
      icon: template.icon,
      actionUrl: template.actionUrlTemplate ? this.renderTemplate(template.actionUrlTemplate, data) : undefined,
      channels: template.defaultChannels,
      priority: template.defaultPriority,
    };
  }
}

describe('TemplateManager', () => {
  let mgr: TestTemplateManager;

  beforeEach(() => {
    mgr = new TestTemplateManager();
  });

  describe('Initialization', () => {
    it('should load default templates', () => {
      expect(mgr.getAllTemplates().length).toBe(10);
    });

    it('should have all required template types', () => {
      const types = new Set(mgr.getAllTemplates().map(t => t.type));
      expect(types.has('price_alert')).toBe(true);
      expect(types.has('limit_up')).toBe(true);
      expect(types.has('limit_down')).toBe(true);
      expect(types.has('volume_surge')).toBe(true);
      expect(types.has('news')).toBe(true);
      expect(types.has('system')).toBe(true);
      expect(types.has('trade')).toBe(true);
      expect(types.has('report')).toBe(true);
      expect(types.has('watchlist_update')).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('should retrieve template by ID', () => {
      const tmpl = mgr.getTemplate('price_alert_above');
      expect(tmpl).toBeDefined();
      expect(tmpl!.titleTemplate).toContain('突破');
    });

    it('should return undefined for unknown ID', () => {
      expect(mgr.getTemplate('unknown')).toBeUndefined();
    });
  });

  describe('getTemplateByType', () => {
    it('should find first enabled template by type', () => {
      const tmpl = mgr.getTemplateByType('price_alert');
      expect(tmpl).toBeDefined();
      expect(tmpl!.type).toBe('price_alert');
      expect(tmpl!.enabled).toBe(true);
    });

    it('should return undefined when type has no templates', () => {
      expect(mgr.getTemplateByType('nonexistent')).toBeUndefined();
    });

    it('should skip disabled templates', () => {
      mgr.toggleTemplate('price_alert_above', false);
      mgr.toggleTemplate('price_alert_below', false);
      expect(mgr.getTemplateByType('price_alert')).toBeUndefined();
    });
  });

  describe('addTemplate & updateTemplate', () => {
    it('should add new template', () => {
      mgr.addTemplate({
        id: 'custom_alert', type: 'price_alert',
        titleTemplate: '自定义预警: {{name}}', bodyTemplate: '内容: {{detail}}',
        defaultChannels: ['in_app'], defaultPriority: 'medium', enabled: true,
      });
      expect(mgr.getTemplate('custom_alert')).toBeDefined();
    });

    it('should update existing template', () => {
      expect(mgr.updateTemplate('price_alert_above', { defaultPriority: 'low' })).toBe(true);
      expect(mgr.getTemplate('price_alert_above')!.defaultPriority).toBe('low');
    });

    it('should return false for updating non-existent template', () => {
      expect(mgr.updateTemplate('unknown', {})).toBe(false);
    });

    it('should replace when adding duplicate ID', () => {
      mgr.addTemplate({
        id: 'price_alert_above', type: 'price_alert',
        titleTemplate: '替换模板', bodyTemplate: '替换内容',
        defaultChannels: ['in_app'], defaultPriority: 'low', enabled: true,
      });
      expect(mgr.getTemplate('price_alert_above')!.titleTemplate).toBe('替换模板');
    });
  });

  describe('deleteTemplate', () => {
    it('should remove template', () => {
      expect(mgr.deleteTemplate('system_notice')).toBe(true);
      expect(mgr.getTemplate('system_notice')).toBeUndefined();
    });

    it('should return false for non-existent template', () => {
      expect(mgr.deleteTemplate('unknown')).toBe(false);
    });
  });

  describe('toggleTemplate', () => {
    it('should disable template', () => {
      expect(mgr.toggleTemplate('news_alert', false)).toBe(true);
      expect(mgr.getTemplate('news_alert')!.enabled).toBe(false);
    });

    it('should re-enable template', () => {
      mgr.toggleTemplate('news_alert', false);
      mgr.toggleTemplate('news_alert', true);
      expect(mgr.getTemplate('news_alert')!.enabled).toBe(true);
    });

    it('should return false for non-existent template', () => {
      expect(mgr.toggleTemplate('unknown', false)).toBe(false);
    });
  });

  describe('renderTemplate', () => {
    it('should replace single placeholder', () => {
      const result = mgr.renderTemplate('Hello {{name}}', { name: 'World' });
      expect(result).toBe('Hello World');
    });

    it('should replace multiple placeholders', () => {
      const result = mgr.renderTemplate('{{a}} and {{b}}', { a: 'X', b: 'Y' });
      expect(result).toBe('X and Y');
    });

    it('should handle unknown placeholders with empty string', () => {
      const result = mgr.renderTemplate('{{a}} and {{b}}', { a: 'Hello' });
      expect(result).toBe('Hello and ');
    });

    it('should handle null values', () => {
      const result = mgr.renderTemplate('{{a}}-{{b}}', { a: 'x', b: null });
      expect(result).toBe('x-');
    });

    it('should handle numeric values', () => {
      const result = mgr.renderTemplate('Price: {{price}}', { price: 15.80 });
      expect(result).toBe('Price: 15.8');
    });

    it('should handle template with no placeholders', () => {
      const result = mgr.renderTemplate('Static text', {});
      expect(result).toBe('Static text');
    });

    it('should handle nested braces (not templates)', () => {
      const result = mgr.renderTemplate('{not a template}', {});
      expect(result).toBe('{not a template}');
    });
  });

  describe('renderNotification', () => {
    it('should render price alert above template', () => {
      const result = mgr.renderNotification('price_alert_above', {
        name: '贵州茅台', symbol: '600519', price: '1899.00', targetPrice: '1880.00',
      });
      expect(result).not.toBeNull();
      expect(result!.title).toContain('600519');
      expect(result!.title).toContain('突破');
      expect(result!.body).toContain('贵州茅台');
      expect(result!.body).toContain('¥1899.00');
      expect(result!.icon).toBe('📈');
      expect(result!.priority).toBe('high');
    });

    it('should render limit_up template', () => {
      const result = mgr.renderNotification('limit_up', {
        name: '宁德时代', symbol: '300750', price: '220.50', turnover: '150000',
      });
      expect(result!.title).toContain('涨停');
      expect(result!.title).toContain('300750');
      expect(result!.priority).toBe('high');
    });

    it('should render trade execution template', () => {
      const result = mgr.renderNotification('trade_execution', {
        symbol: '000001', action: '买入', volume: '1000', price: '12.50',
      });
      expect(result!.title).toContain('000001');
      expect(result!.body).toContain('买入');
      expect(result!.body).toContain('1000股');
      expect(result!.priority).toBe('urgent');
    });

    it('should render system notice', () => {
      const result = mgr.renderNotification('system_notice', { message: '系统将于今晚维护' });
      expect(result!.title).toBe('⚙️ 系统通知');
      expect(result!.body).toBe('系统将于今晚维护');
      expect(result!.priority).toBe('low');
    });

    it('should render watchlist update', () => {
      const result = mgr.renderNotification('watchlist_update', {
        name: '腾讯控股', symbol: '00700', changeDescription: '涨幅超过5%',
      });
      expect(result!.title).toContain('腾讯控股');
      expect(result!.body).toContain('涨幅超过5%');
    });

    it('should render daily report', () => {
      const result = mgr.renderNotification('daily_report', { date: '2024-03-20' });
      expect(result!.title).toContain('2024-03-20');
      expect(result!.body).toContain('自选股');
    });

    it('should render news alert', () => {
      const result = mgr.renderNotification('news_alert', { title: '重要公告', summary: '公司发布年报' });
      expect(result!.title).toBe('📰 重要公告');
      expect(result!.body).toBe('公司发布年报');
    });

    it('should return null for disabled template', () => {
      mgr.toggleTemplate('volume_surge', false);
      const result = mgr.renderNotification('volume_surge', { name: 'test', symbol: '000001', volume: '1000', volumeRatio: '2' });
      expect(result).toBeNull();
    });

    it('should return null for non-existent template', () => {
      const result = mgr.renderNotification('nonexistent', {});
      expect(result).toBeNull();
    });
  });

  describe('price alert templates', () => {
    it('should render above alert with all fields', () => {
      const result = mgr.renderNotification('price_alert_above', {
        name: '招商银行', symbol: '600036', price: '35.60', targetPrice: '35.00', changePercent: '1.71',
      });
      expect(result!.body).toContain('招商银行');
      expect(result!.body).toContain('35.60');
      expect(result!.body).toContain('35.00');
      expect(result!.actionUrl).toBe('/stock/600036');
    });

    it('should render below alert with all fields', () => {
      const result = mgr.renderNotification('price_alert_below', {
        name: '招商银行', symbol: '600036', price: '34.50', targetPrice: '35.00', changePercent: '-1.43',
      });
      expect(result!.body).toContain('跌破');
      expect(result!.icon).toBe('📉');
    });
  });

  describe('volume and limit templates', () => {
    it('should render volume surge with ratio', () => {
      const result = mgr.renderNotification('volume_surge', {
        name: '东方财富', symbol: '300059', volume: '500万', volumeRatio: '3.5',
      });
      expect(result!.body).toContain('放大');
      expect(result!.body).toContain('3.5倍');
    });

    it('should render limit_down with turnover', () => {
      const result = mgr.renderNotification('limit_down', {
        name: '某股票', symbol: '000001', price: '8.00', turnover: '5000',
      });
      expect(result!.title).toContain('跌停');
      expect(result!.body).toContain('成交额 5000万');
    });
  });

  describe('edge cases', () => {
    it('should handle empty data gracefully', () => {
      const result = mgr.renderNotification('system_notice', {});
      expect(result!.body).toBe('');
    });

    it('should handle extra data fields', () => {
      const result = mgr.renderNotification('trade_execution', {
        symbol: '000001', action: '卖出', volume: '500', price: '10.00',
        extraField: 'should not appear',
      });
      expect(result!.body).not.toContain('extraField');
      expect(result!.body).toContain('卖出');
    });

    it('should support custom templates added at runtime', () => {
      mgr.addTemplate({
        id: 'custom_test', type: 'system',
        titleTemplate: '自定义: {{topic}}', bodyTemplate: '详情: {{detail}}',
        defaultChannels: ['in_app'], defaultPriority: 'medium', enabled: true,
      });
      const result = mgr.renderNotification('custom_test', { topic: '测试', detail: '自定义通知' });
      expect(result!.title).toBe('自定义: 测试');
      expect(result!.body).toBe('详情: 自定义通知');
    });
  });

  describe('template management lifecycle', () => {
    it('should support full CRUD cycle', () => {
      // Create
      mgr.addTemplate({
        id: 'test_lifecycle', type: 'system',
        titleTemplate: '生命周期测试', bodyTemplate: '测试 {{phase}}',
        defaultChannels: ['in_app'], defaultPriority: 'low', enabled: true,
      });
      expect(mgr.getTemplate('test_lifecycle')).toBeDefined();

      // Update
      mgr.updateTemplate('test_lifecycle', { defaultPriority: 'high' });
      expect(mgr.getTemplate('test_lifecycle')!.defaultPriority).toBe('high');

      // Toggle
      mgr.toggleTemplate('test_lifecycle', false);
      expect(mgr.getTemplate('test_lifecycle')!.enabled).toBe(false);
      expect(mgr.renderNotification('test_lifecycle', { phase: 'disabled' })).toBeNull();

      // Re-enable
      mgr.toggleTemplate('test_lifecycle', true);
      expect(mgr.renderNotification('test_lifecycle', { phase: 're-enabled' })!.body).toBe('测试 re-enabled');

      // Delete
      mgr.deleteTemplate('test_lifecycle');
      expect(mgr.getTemplate('test_lifecycle')).toBeUndefined();
    });
  });
});
