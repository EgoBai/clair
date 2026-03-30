/**
 * 通知系统 - 模板管理
 */

import { NotificationTemplate, NotificationType } from './types';

export const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'price_alert_above',
    type: 'price_alert',
    titleTemplate: '📈 {{name}} ({{symbol}}) 突破价格线',
    bodyTemplate: '{{name}} 当前价格 ¥{{price}}，已突破预警价 ¥{{targetPrice}}，涨幅 {{changePercent}}%',
    defaultChannels: ['websocket', 'push', 'in_app'],
    defaultPriority: 'high',
    icon: '📈',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'price_alert_below',
    type: 'price_alert',
    titleTemplate: '📉 {{name}} ({{symbol}}) 跌破价格线',
    bodyTemplate: '{{name}} 当前价格 ¥{{price}}，已跌破预警价 ¥{{targetPrice}}，跌幅 {{changePercent}}%',
    defaultChannels: ['websocket', 'push', 'in_app'],
    defaultPriority: 'high',
    icon: '📉',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'limit_up',
    type: 'limit_up',
    titleTemplate: '🔴 {{name}} ({{symbol}}) 涨停',
    bodyTemplate: '{{name}} 已涨停，当前价格 ¥{{price}}，成交额 {{turnover}}万',
    defaultChannels: ['websocket', 'in_app'],
    defaultPriority: 'high',
    icon: '🔴',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'limit_down',
    type: 'limit_down',
    titleTemplate: '🟢 {{name}} ({{symbol}}) 跌停',
    bodyTemplate: '{{name}} 已跌停，当前价格 ¥{{price}}，成交额 {{turnover}}万',
    defaultChannels: ['websocket', 'in_app'],
    defaultPriority: 'high',
    icon: '🟢',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'volume_surge',
    type: 'volume_surge',
    titleTemplate: '📊 {{name}} ({{symbol}}) 放量异动',
    bodyTemplate: '{{name}} 当前成交量 {{volume}}，较昨日同期放大 {{volumeRatio}}倍',
    defaultChannels: ['websocket', 'in_app'],
    defaultPriority: 'medium',
    icon: '📊',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'news_alert',
    type: 'news',
    titleTemplate: '📰 {{title}}',
    bodyTemplate: '{{summary}}',
    defaultChannels: ['websocket', 'in_app'],
    defaultPriority: 'medium',
    icon: '📰',
    actionUrlTemplate: '/news/{{newsId}}',
    enabled: true,
  },
  {
    id: 'system_notice',
    type: 'system',
    titleTemplate: '⚙️ 系统通知',
    bodyTemplate: '{{message}}',
    defaultChannels: ['in_app', 'push'],
    defaultPriority: 'low',
    icon: '⚙️',
    enabled: true,
  },
  {
    id: 'trade_execution',
    type: 'trade',
    titleTemplate: '💰 交易执行 - {{symbol}}',
    bodyTemplate: '{{action}} {{volume}}股 {{symbol}}，成交价 ¥{{price}}，总额 ¥{{totalAmount}}',
    defaultChannels: ['websocket', 'push', 'in_app'],
    defaultPriority: 'urgent',
    icon: '💰',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
  {
    id: 'daily_report',
    type: 'report',
    titleTemplate: '📋 每日报告 - {{date}}',
    bodyTemplate: '您的自选股今日收益情况已生成，点击查看详细报告',
    defaultChannels: ['in_app', 'push'],
    defaultPriority: 'low',
    icon: '📋',
    actionUrlTemplate: '/report/daily',
    enabled: true,
  },
  {
    id: 'watchlist_update',
    type: 'watchlist_update',
    titleTemplate: '⭐ 自选股更新 - {{name}}',
    bodyTemplate: '{{name}} ({{symbol}}) 有重要变动：{{changeDescription}}',
    defaultChannels: ['websocket', 'in_app'],
    defaultPriority: 'medium',
    icon: '⭐',
    actionUrlTemplate: '/stock/{{symbol}}',
    enabled: true,
  },
];

export class TemplateManager {
  private templates: Map<string, NotificationTemplate> = new Map();

  constructor(templates: NotificationTemplate[] = DEFAULT_TEMPLATES) {
    templates.forEach(t => this.templates.set(t.id, { ...t, defaultChannels: [...t.defaultChannels] }));
  }

  getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.get(id);
  }

  getTemplateByType(type: NotificationType): NotificationTemplate | undefined {
    return Array.from(this.templates.values()).find(t => t.type === type && t.enabled);
  }

  getAllTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values());
  }

  addTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
  }

  updateTemplate(id: string, updates: Partial<NotificationTemplate>): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;
    this.templates.set(id, { ...existing, ...updates });
    return true;
  }

  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

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

  renderNotification(templateId: string, data: Record<string, unknown>): {
    title: string;
    body: string;
    icon?: string;
    actionUrl?: string;
    channels: string[];
    priority: string;
  } | null {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) return null;

    return {
      title: this.renderTemplate(template.titleTemplate, data),
      body: this.renderTemplate(template.bodyTemplate, data),
      icon: template.icon,
      actionUrl: template.actionUrlTemplate
        ? this.renderTemplate(template.actionUrlTemplate, data)
        : undefined,
      channels: template.defaultChannels,
      priority: template.defaultPriority,
    };
  }
}

export const templateManager = new TemplateManager();
