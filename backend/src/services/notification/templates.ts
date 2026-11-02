/**
 * 通知系统 - 模板管理
 */

import { NotificationTemplate, NotificationType } from './types';

/**
 * 通知可跳转的站内路由白名单。
 *
 * 真源：frontend/src/routes/index.tsx 的 `<Route path>`（逐条核对过，含参数路由）。
 * 测试 notification-templates.test.ts 会解析该文件做双向校验，路由增删而这里没跟上就会红。
 *
 * 两条硬规则（违反其一，用户点通知就会掉出应用）：
 *  1) **不得带前导斜杠**。前端 BrowserRouter 的 basename 是 import.meta.env.BASE_URL
 *     （GitHub Pages 项目站点为 '/clair/'）。根绝对路径（如 '/stock/600519'）绕过 basename，
 *     整页请求落到站点根 https://egobai.github.io/ ，那里没有 Pages 站点
 *     → 浏览器显示 GitHub 通用 404「There isn't a GitHub Pages site here.」。
 *  2) **必须是真实存在的路由**。/stock/{{symbol}}（少个 s）、/report/daily（无此路由）
 *     这类历史取值都是错的：即便补上 base 也只会渲染应用内 404。
 *
 * 重定向路由（review / market / home / index）不收：它们是 `<Navigate>`，
 * 通知指过去等于多一跳，没有意义。
 */
export const ALLOWED_ACTION_PATH_TEMPLATES = [
  '',                       // 首页（index）
  'screener',
  'watchlist',
  'stocks',
  'stocks/:symbol',
  'financials/:symbol',
  'index/:symbol',
  'sectors/:symbol',
  'backtest',
  'industry-map',
  'radar',
  'compare',
  'lockup-calendar',
  'top-traders',
  'margin-trading',
  'portfolio',
  'macro',
  'event-calendar',
  'risk-center',
  'report-center',
  'north-bound',
  'factor-lab',
  'hk-connect',
  'etf',
  'fund-flow',
  'macro-hub',
  'journey',
  'block-trades',
  'knowledge',
  'strategies',
] as const;

/** 把路由模板（':symbol' 形式）编译成正则；先转义再替换参数，避免 ':' 被误转义 */
const toActionMatcher = (pathTemplate: string): RegExp => {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/:[A-Za-z_]\w*/g, '[^/]+') + '$');
};

export const ACTION_URL_MATCHERS: readonly RegExp[] = ALLOWED_ACTION_PATH_TEMPLATES.map(toActionMatcher);

/**
 * actionUrl 是否安全可跳：站内相对路径 + 命中真实路由。
 * 拒绝：根绝对路径（'/x'）、协议相对（'//x'）、任何带协议的值（https: / javascript: …）、
 * 未匹配路由的相对路径。
 */
export function isAllowedActionUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return false;
  const path = url.split('#')[0].split('?')[0].replace(/\/+$/, '');
  return ACTION_URL_MATCHERS.some((re) => re.test(path));
}

export const DEFAULT_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'price_alert_above',
    type: 'price_alert',
    titleTemplate: '📈 {{name}} ({{symbol}}) 突破价格线',
    bodyTemplate: '{{name}} 当前价格 ¥{{price}}，已突破预警价 ¥{{targetPrice}}，涨幅 {{changePercent}}%',
    defaultChannels: ['websocket', 'push', 'in_app'],
    defaultPriority: 'high',
    icon: '📈',
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    // 前端没有新闻详情路由（pages/_archived/NewsPage.tsx 未挂载），
    // 因此**故意不设置** actionUrlTemplate：点击只标记已读、不跳转，
    // 好过指向一个不存在的路径让用户撞 404。
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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
    actionUrlTemplate: 'report-center',
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
    actionUrlTemplate: 'stocks/{{symbol}}',
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

    const renderedActionUrl = template.actionUrlTemplate
      ? this.renderTemplate(template.actionUrlTemplate, data)
      : undefined;

    // 渲染后必须过一遍白名单：占位符缺数据时会渲染成 'stocks/'（末尾空参数），
    // 这种坏链接一旦下发到前端，用户点一次就掉出站点/撞 404。宁可不下发。
    let actionUrl: string | undefined;
    if (renderedActionUrl) {
      if (isAllowedActionUrl(renderedActionUrl)) {
        actionUrl = renderedActionUrl;
      } else {
        console.warn(
          `[Notification] 模板 ${template.id} 渲染出非法 actionUrl "${renderedActionUrl}"，已丢弃（详见 templates.ts 白名单）`
        );
      }
    }

    return {
      title: this.renderTemplate(template.titleTemplate, data),
      body: this.renderTemplate(template.bodyTemplate, data),
      icon: template.icon,
      actionUrl,
      channels: template.defaultChannels,
      priority: template.defaultPriority,
    };
  }
}

export const templateManager = new TemplateManager();
