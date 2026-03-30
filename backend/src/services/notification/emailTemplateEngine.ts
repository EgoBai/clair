/**
 * 邮件模板渲染引擎
 * 支持 HTML/纯文本模板、变量插值、条件块、循环、主题特定模板
 */

/** 邮件模板定义 */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;        // 支持 {{variable}} 插值
  htmlBody: string;
  textBody: string;
  category: 'alert' | 'report' | 'system' | 'trade' | 'digest';
  variables: string[];    // 模板需要的变量列表
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 邮件上下文 */
export interface EmailContext {
  variables: Record<string, unknown>;
  locale?: string;
  timezone?: string;
  unsubscribeUrl?: string;
  companyName?: string;
  companyLogoUrl?: string;
}

/** 渲染结果 */
export interface RenderedEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
  templateId: string;
  renderedAt: number;
  variables: Record<string, unknown>;
}

/** 邮件发送记录 */
export interface EmailSendRecord {
  id: string;
  templateId: string;
  to: string;
  subject: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'bounced';
  sentAt?: number;
  error?: string;
  retryCount: number;
}

/** 内置模板 */
const BUILT_IN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'price_alert_above',
    name: '价格突破预警',
    subject: '📈 {{stockName}} ({{stockCode}}) 突破 ¥{{targetPrice}}',
    htmlBody: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1890ff; color: white; padding: 20px; text-align: center;">
    <h1>📈 价格突破预警</h1>
  </div>
  <div style="padding: 20px; background: #fff;">
    <h2>{{stockName}} ({{stockCode}})</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">当前价格</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #ff4d4f; font-weight: bold;">¥{{currentPrice}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">预警价格</td><td style="padding: 8px; border-bottom: 1px solid #eee;">¥{{targetPrice}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">涨跌幅</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: {{#if isPositive}}#ff4d4f{{else}}#52c41a{{/if}};">{{changePercent}}%</td></tr>
      <tr><td style="padding: 8px;">触发时间</td><td style="padding: 8px;">{{triggerTime}}</td></tr>
    </table>
    <div style="margin-top: 20px; text-align: center;">
      <a href="{{stockUrl}}" style="background: #1890ff; color: white; padding: 10px 30px; text-decoration: none; border-radius: 4px;">查看详情</a>
    </div>
  </div>
  {{#if unsubscribeUrl}}
  <div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">
    <a href="{{unsubscribeUrl}}" style="color: #999;">取消订阅</a>
  </div>
  {{/if}}
</div>`,
    textBody: `价格突破预警
{{stockName}} ({{stockCode}})
当前价格: ¥{{currentPrice}}
预警价格: ¥{{targetPrice}}
涨跌幅: {{changePercent}}%
触发时间: {{triggerTime}}
查看详情: {{stockUrl}}`,
    category: 'alert',
    variables: ['stockName', 'stockCode', 'currentPrice', 'targetPrice', 'changePercent', 'triggerTime', 'stockUrl', 'isPositive', 'unsubscribeUrl'],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'daily_digest',
    name: '每日摘要',
    subject: '📋 每日市场摘要 - {{date}}',
    htmlBody: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #722ed1; color: white; padding: 20px; text-align: center;">
    <h1>📋 每日市场摘要</h1>
    <p>{{date}}</p>
  </div>
  <div style="padding: 20px;">
    <h3>市场概况</h3>
    <p>上证指数: {{shanghaiIndex}} ({{shanghaiChange}})</p>
    <p>深证成指: {{shenzhenIndex}} ({{shenzhenChange}})</p>
    <p>创业板指: {{gemIndex}} ({{gemChange}})</p>
    <h3>自选股表现</h3>
    {{#each watchlistItems}}
    <div style="padding: 8px; border-bottom: 1px solid #eee;">
      <strong>{{name}}</strong> ({{code}}): ¥{{price}} {{changePercent}}%
    </div>
    {{/each}}
  </div>
</div>`,
    textBody: `每日市场摘要 - {{date}}
上证指数: {{shanghaiIndex}} ({{shanghaiChange}})
深证成指: {{shenzhenIndex}} ({{shenzhenChange}})
创业板指: {{gemIndex}} ({{gemChange}})`,
    category: 'digest',
    variables: ['date', 'shanghaiIndex', 'shanghaiChange', 'shenzhenIndex', 'shenzhenChange', 'gemIndex', 'gemChange', 'watchlistItems'],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'trade_notification',
    name: '交易通知',
    subject: '💰 交易执行: {{action}} {{stockCode}}',
    htmlBody: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: {{#if isBuy}}#52c41a{{else}}#ff4d4f{{/if}}; color: white; padding: 20px; text-align: center;">
    <h1>💰 交易执行通知</h1>
  </div>
  <div style="padding: 20px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">操作</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">{{action}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">股票</td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{stockName}} ({{stockCode}})</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">数量</td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{volume}}股</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;">成交价</td><td style="padding: 8px; border-bottom: 1px solid #eee;">¥{{price}}</td></tr>
      <tr><td style="padding: 8px;">总额</td><td style="padding: 8px; font-weight: bold;">¥{{totalAmount}}</td></tr>
    </table>
  </div>
</div>`,
    textBody: `交易执行通知
操作: {{action}}
股票: {{stockName}} ({{stockCode}})
数量: {{volume}}股
成交价: ¥{{price}}
总额: ¥{{totalAmount}}`,
    category: 'trade',
    variables: ['action', 'stockName', 'stockCode', 'volume', 'price', 'totalAmount', 'isBuy'],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'system_notice',
    name: '系统通知',
    subject: '⚙️ 系统通知: {{title}}',
    htmlBody: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #faad14; color: white; padding: 20px; text-align: center;">
    <h1>⚙️ 系统通知</h1>
  </div>
  <div style="padding: 20px;">
    <h2>{{title}}</h2>
    <p>{{message}}</p>
    <p style="color: #999; font-size: 12px;">{{timestamp}}</p>
  </div>
</div>`,
    textBody: `系统通知
{{title}}
{{message}}
{{timestamp}}`,
    category: 'system',
    variables: ['title', 'message', 'timestamp'],
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export class EmailTemplateEngine {
  private templates: Map<string, EmailTemplate> = new Map();
  private sendQueue: EmailSendRecord[] = [];
  private sentEmails: EmailSendRecord[] = [];

  constructor(templates: EmailTemplate[] = BUILT_IN_TEMPLATES) {
    templates.forEach(t => this.templates.set(t.id, { ...t }));
  }

  /** 获取模板 */
  getTemplate(id: string): EmailTemplate | undefined {
    return this.templates.get(id);
  }

  /** 获取所有模板 */
  getAllTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /** 按类别获取模板 */
  getTemplatesByCategory(category: EmailTemplate['category']): EmailTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  /** 添加自定义模板 */
  addTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, { ...template, createdAt: Date.now(), updatedAt: Date.now() });
  }

  /** 更新模板 */
  updateTemplate(id: string, updates: Partial<EmailTemplate>): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;
    this.templates.set(id, { ...existing, ...updates, updatedAt: Date.now() });
    return true;
  }

  /** 删除模板 */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /** 启用/禁用模板 */
  toggleTemplate(id: string, enabled: boolean): boolean {
    const t = this.templates.get(id);
    if (!t) return false;
    t.enabled = enabled;
    return true;
  }

  // ========== 渲染 ==========

  /** 渲染邮件 */
  render(templateId: string, context: EmailContext): RenderedEmail | null {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) return null;

    const allVars = {
      ...context.variables,
      unsubscribeUrl: context.unsubscribeUrl || '',
      companyName: context.companyName || 'A股行情分析',
      companyLogoUrl: context.companyLogoUrl || '',
    };

    return {
      subject: this.interpolate(template.subject, allVars),
      htmlBody: this.renderHtml(template.htmlBody, allVars),
      textBody: this.interpolate(template.textBody, allVars),
      templateId,
      renderedAt: Date.now(),
      variables: allVars,
    };
  }

  /** 变量插值 */
  private interpolate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = vars[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  }

  /** HTML 渲染（支持条件块和循环） */
  private renderHtml(html: string, vars: Record<string, unknown>): string {
    let result = html;

    // 处理 {{#if var}}...{{else}}...{{/if}}
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, ifBlock, elseBlock) => {
      return vars[varName] ? this.renderHtml(ifBlock, vars) : this.renderHtml(elseBlock, vars);
    });

    // 处理 {{#if var}}...{{/if}}（无else）
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, block) => {
      return vars[varName] ? this.renderHtml(block, vars) : '';
    });

    // 处理 {{#each items}}...{{/each}}
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_match, varName, block) => {
      const items = vars[varName];
      if (!Array.isArray(items)) return '';
      return items.map(item => {
        if (typeof item === 'object' && item !== null) {
          return this.renderHtml(block, { ...vars, ...(item as Record<string, unknown>) });
        }
        return this.renderHtml(block, { ...vars, item });
      }).join('');
    });

    // 基础变量插值
    result = this.interpolate(result, vars);

    return result;
  }

  // ========== 发送队列 ==========

  /** 排队发送 */
  queueSend(to: string, templateId: string, context: EmailContext): EmailSendRecord | null {
    const rendered = this.render(templateId, context);
    if (!rendered) return null;

    const record: EmailSendRecord = {
      id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      templateId,
      to,
      subject: rendered.subject,
      status: 'queued',
      retryCount: 0,
    };

    this.sendQueue.push(record);
    return record;
  }

  /** 批量排队 */
  batchQueue(recipients: string[], templateId: string, context: EmailContext): EmailSendRecord[] {
    return recipients
      .map(to => this.queueSend(to, templateId, context))
      .filter((r): r is EmailSendRecord => r !== null);
  }

  /** 模拟发送队列处理 */
  processQueue(): { sent: number; failed: number } {
    let sent = 0;
    let failed = 0;

    while (this.sendQueue.length > 0) {
      const record = this.sendQueue.shift()!;
      // 模拟90%成功率
      if (Math.random() > 0.1) {
        record.status = 'sent';
        record.sentAt = Date.now();
        sent++;
      } else {
        if (record.retryCount < 3) {
          record.retryCount++;
          record.status = 'queued';
          this.sendQueue.push(record); // 重试
        } else {
          record.status = 'failed';
          record.error = 'Max retries exceeded';
          failed++;
        }
      }
      this.sentEmails.push(record);
    }

    return { sent, failed };
  }

  /** 获取发送队列 */
  getQueue(): EmailSendRecord[] {
    return [...this.sendQueue];
  }

  /** 获取已发送记录 */
  getSentEmails(): EmailSendRecord[] {
    return [...this.sentEmails];
  }

  /** 清空 */
  clear(): void {
    this.templates.clear();
    this.sendQueue = [];
    this.sentEmails = [];
  }
}

export const emailTemplateEngine = new EmailTemplateEngine();
