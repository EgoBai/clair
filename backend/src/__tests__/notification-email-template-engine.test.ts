/**
 * 邮件模板渲染引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface EmailTemplate {
  id: string; name: string; subject: string; htmlBody: string; textBody: string;
  category: 'alert' | 'report' | 'system' | 'trade' | 'digest';
  variables: string[]; enabled: boolean; createdAt: number; updatedAt: number;
}

interface EmailContext {
  variables: Record<string, unknown>;
  locale?: string; timezone?: string; unsubscribeUrl?: string;
  companyName?: string; companyLogoUrl?: string;
}

interface RenderedEmail {
  subject: string; htmlBody: string; textBody: string;
  templateId: string; renderedAt: number; variables: Record<string, unknown>;
}

interface EmailSendRecord {
  id: string; templateId: string; to: string; subject: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'bounced';
  sentAt?: number; error?: string; retryCount: number;
}

const BUILT_IN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'price_alert_above', name: '价格突破预警',
    subject: '📈 {{stockName}} ({{stockCode}}) 突破 ¥{{targetPrice}}',
    htmlBody: `<div><h1>📈 价格突破预警</h1><p>{{stockName}} ({{stockCode}}): ¥{{currentPrice}}</p>{{#if unsubscribeUrl}}<a href="{{unsubscribeUrl}}">取消</a>{{/if}}</div>`,
    textBody: '价格突破预警\n{{stockName}} ({{stockCode}})\n当前价格: ¥{{currentPrice}}',
    category: 'alert', variables: ['stockName', 'stockCode', 'currentPrice', 'targetPrice', 'unsubscribeUrl'],
    enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
  },
  {
    id: 'daily_digest', name: '每日摘要',
    subject: '📋 每日市场摘要 - {{date}}',
    htmlBody: `<div><h1>摘要 {{date}}</h1>{{#each watchlistItems}}<p>{{name}} ({{code}}): ¥{{price}} {{changePercent}}%</p>{{/each}}</div>`,
    textBody: '摘要 {{date}}',
    category: 'digest', variables: ['date', 'watchlistItems'],
    enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
  },
  {
    id: 'trade_notification', name: '交易通知',
    subject: '💰 交易: {{action}} {{stockCode}}',
    htmlBody: `<div style="background: {{#if isBuy}}#52c41a{{else}}#ff4d4f{{/if}};"><h1>交易</h1></div>`,
    textBody: '交易: {{action}} {{stockCode}}\n数量: {{volume}}',
    category: 'trade', variables: ['action', 'stockCode', 'isBuy', 'volume'],
    enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
  },
  {
    id: 'system_notice', name: '系统通知',
    subject: '⚙️ 系统: {{title}}',
    htmlBody: `<div><h2>{{title}}</h2><p>{{message}}</p></div>`,
    textBody: '系统: {{title}}\n{{message}}',
    category: 'system', variables: ['title', 'message'],
    enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
  },
];

class TestEmailTemplateEngine {
  templates: Map<string, EmailTemplate> = new Map();
  sendQueue: EmailSendRecord[] = [];
  sentEmails: EmailSendRecord[] = [];

  constructor(templates: EmailTemplate[] = BUILT_IN_TEMPLATES) {
    templates.forEach(t => this.templates.set(t.id, { ...t }));
  }

  getTemplate(id: string) { return this.templates.get(id); }
  getAllTemplates() { return Array.from(this.templates.values()); }
  getTemplatesByCategory(cat: string) { return this.getAllTemplates().filter(t => t.category === cat); }

  addTemplate(t: EmailTemplate) { this.templates.set(t.id, { ...t, createdAt: Date.now(), updatedAt: Date.now() }); }
  updateTemplate(id: string, updates: Partial<EmailTemplate>): boolean {
    const existing = this.templates.get(id);
    if (!existing) return false;
    this.templates.set(id, { ...existing, ...updates, updatedAt: Date.now() });
    return true;
  }
  deleteTemplate(id: string): boolean { return this.templates.delete(id); }
  toggleTemplate(id: string, enabled: boolean): boolean {
    const t = this.templates.get(id);
    if (!t) return false;
    t.enabled = enabled;
    return true;
  }

  interpolate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = vars[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  }

  private parseIf(content: string, vars: Record<string, unknown>): string {
    // Find innermost {{#if}} blocks first (process from inside out)
    // Match: {{#if var}}...{{/if}} where ... does NOT contain another {{#if}}
    const innerIfRe = /\{\{#if\s+(\w+)\}\}((?:.(?!\{\{#if))*?)\{\{\/if\}\}/gs;
    content = content.replace(innerIfRe, (_m, varName, innerBlock) => {
      const elsePos = innerBlock.indexOf('{{else}}');
      let ifBlock: string, elseBlock: string;
      if (elsePos === -1) {
        ifBlock = this.interpolate(innerBlock, vars);
        elseBlock = '';
      } else {
        ifBlock = this.interpolate(innerBlock.slice(0, elsePos), vars);
        elseBlock = this.interpolate(innerBlock.slice(elsePos + 8), vars);
      }
      return vars[varName] ? ifBlock : elseBlock;
    });
    // Handle remaining {{#if}} blocks after inner ones are processed
    const outerIfRe = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    content = content.replace(outerIfRe, (_m, varName, block) => {
      const elsePos = block.indexOf('{{else}}');
      let ifBlock: string, elseBlock: string;
      if (elsePos === -1) {
        ifBlock = this.interpolate(block, vars);
        elseBlock = '';
      } else {
        ifBlock = this.interpolate(block.slice(0, elsePos), vars);
        elseBlock = this.interpolate(block.slice(elsePos + 8), vars);
      }
      return vars[varName] ? ifBlock : elseBlock;
    });
    return content;
  }

  renderHtml(html: string, vars: Record<string, unknown>): string {
    let result = html;
    // Process {{#if}} blocks from inside out
    result = this.parseIf(result, vars);
    // {{#each items}}...{{/each}}
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, varName, block) => {
      const items = vars[varName];
      if (!Array.isArray(items)) return '';
      return items.map(item => {
        if (typeof item === 'object' && item !== null) return this.renderHtml(block, { ...vars, ...(item as Record<string, unknown>) });
        return this.renderHtml(block, { ...vars, item });
      }).join('');
    });
    return this.interpolate(result, vars);
  }

  render(templateId: string, context: EmailContext): RenderedEmail | null {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) return null;
    const allVars = { ...context.variables, unsubscribeUrl: context.unsubscribeUrl || '', companyName: context.companyName || 'A股行情分析', companyLogoUrl: context.companyLogoUrl || '' };
    return {
      subject: this.interpolate(template.subject, allVars),
      htmlBody: this.renderHtml(template.htmlBody, allVars),
      textBody: this.interpolate(template.textBody, allVars),
      templateId, renderedAt: Date.now(), variables: allVars,
    };
  }

  queueSend(to: string, templateId: string, context: EmailContext): EmailSendRecord | null {
    const rendered = this.render(templateId, context);
    if (!rendered) return null;
    const record: EmailSendRecord = { id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, templateId, to, subject: rendered.subject, status: 'queued', retryCount: 0 };
    this.sendQueue.push(record);
    return record;
  }

  batchQueue(recipients: string[], templateId: string, context: EmailContext): EmailSendRecord[] {
    return recipients.map(to => this.queueSend(to, templateId, context)).filter((r): r is EmailSendRecord => r !== null);
  }

  getQueue() { return [...this.sendQueue]; }
  getSentEmails() { return [...this.sentEmails]; }
  clear() { this.templates.clear(); this.sendQueue = []; this.sentEmails = []; }
}

describe('EmailTemplateEngine', () => {
  let engine: TestEmailTemplateEngine;

  beforeEach(() => {
    engine = new TestEmailTemplateEngine();
  });

  describe('Initialization', () => {
    it('should load built-in templates', () => {
      expect(engine.getAllTemplates().length).toBe(4);
    });

    it('should have templates for all categories', () => {
      const templates = engine.getAllTemplates();
      const cats = new Set(templates.map(t => t.category));
      expect(cats.has('alert')).toBe(true);
      expect(cats.has('digest')).toBe(true);
      expect(cats.has('trade')).toBe(true);
      expect(cats.has('system')).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('should retrieve by ID', () => {
      expect(engine.getTemplate('price_alert_above')).toBeDefined();
    });

    it('should return undefined for unknown ID', () => {
      expect(engine.getTemplate('unknown')).toBeUndefined();
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should filter by category', () => {
      const alerts = engine.getTemplatesByCategory('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('price_alert_above');
    });
  });

  describe('addTemplate & updateTemplate', () => {
    it('should add new template', () => {
      engine.addTemplate({
        id: 'test', name: 'Test', subject: 'Test {{x}}',
        htmlBody: '<p>{{x}}</p>', textBody: '{{x}}',
        category: 'system', variables: ['x'], enabled: true, createdAt: 0, updatedAt: 0,
      });
      expect(engine.getTemplate('test')).toBeDefined();
    });

    it('should update existing template', () => {
      engine.updateTemplate('system_notice', { subject: '更新: {{title}}' });
      expect(engine.getTemplate('system_notice')!.subject).toBe('更新: {{title}}');
    });

    it('should return false for non-existent update', () => {
      expect(engine.updateTemplate('unknown', {})).toBe(false);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template', () => {
      expect(engine.deleteTemplate('system_notice')).toBe(true);
      expect(engine.getTemplate('system_notice')).toBeUndefined();
    });

    it('should return false for non-existent', () => {
      expect(engine.deleteTemplate('unknown')).toBe(false);
    });
  });

  describe('toggleTemplate', () => {
    it('should disable template', () => {
      engine.toggleTemplate('system_notice', false);
      expect(engine.getTemplate('system_notice')!.enabled).toBe(false);
    });
  });

  describe('interpolate', () => {
    it('should replace variables', () => {
      expect(engine.interpolate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
    });

    it('should handle missing variable with empty', () => {
      expect(engine.interpolate('{{a}} {{b}}', { a: 'x' })).toBe('x ');
    });

    it('should handle null values', () => {
      expect(engine.interpolate('{{a}}', { a: null })).toBe('');
    });

    it('should handle numeric values', () => {
      expect(engine.interpolate('{{price}}', { price: 15.80 })).toBe('15.8');
    });
  });

  describe('renderHtml - conditionals', () => {
    it('should render if-true block', () => {
      const result = engine.renderHtml('{{#if show}}visible{{/if}}', { show: true });
      expect(result).toBe('visible');
    });

    it('should skip if-false block', () => {
      const result = engine.renderHtml('{{#if show}}visible{{/if}}', { show: false });
      expect(result).toBe('');
    });

    it('should support if-else', () => {
      const result = engine.renderHtml('{{#if ok}}yes{{else}}no{{/if}}', { ok: true });
      expect(result).toBe('yes');
    });

    it('should show else-block when false', () => {
      const result = engine.renderHtml('{{#if ok}}yes{{else}}no{{/if}}', { ok: false });
      expect(result).toBe('no');
    });

    it('should handle missing variable as false', () => {
      const result = engine.renderHtml('{{#if missing}}yes{{else}}no{{/if}}', {});
      expect(result).toBe('no');
    });
  });

  describe('renderHtml - each loops', () => {
    it('should iterate array', () => {
      const result = engine.renderHtml('{{#each items}}<p>{{name}}</p>{{/each}}', {
        items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      });
      expect(result).toBe('<p>A</p><p>B</p><p>C</p>');
    });

    it('should handle empty array', () => {
      const result = engine.renderHtml('{{#each items}}<p>{{name}}</p>{{/each}}', { items: [] });
      expect(result).toBe('');
    });

    it('should handle non-array gracefully', () => {
      const result = engine.renderHtml('{{#each items}}x{{/each}}', { items: 'not array' });
      expect(result).toBe('');
    });

    it('should handle items as primitive values', () => {
      const result = engine.renderHtml('{{#each items}}<p>{{item}}</p>{{/each}}', { items: ['a', 'b'] });
      expect(result).toBe('<p>a</p><p>b</p>');
    });
  });

  describe('render - full email', () => {
    it('should render price alert email', () => {
      const result = engine.render('price_alert_above', {
        variables: { stockName: '贵州茅台', stockCode: '600519', currentPrice: '1899.00', targetPrice: '1880.00' },
      });
      expect(result).not.toBeNull();
      expect(result!.subject).toContain('贵州茅台');
      expect(result!.subject).toContain('1880.00');
      expect(result!.textBody).toContain('1899.00');
    });

    it('should render system notice', () => {
      const result = engine.render('system_notice', {
        variables: { title: '维护通知', message: '系统将于今晚2点维护' },
      });
      expect(result!.subject).toBe('⚙️ 系统: 维护通知');
      expect(result!.htmlBody).toContain('系统将于今晚2点维护');
    });

    it('should render trade notification with buy styling', () => {
      const result = engine.render('trade_notification', {
        variables: { action: '买入', stockCode: '000001', isBuy: true, volume: '1000' },
      });
      expect(result!.subject).toContain('买入');
      // Verify buy color applied (if-true block)
      expect(result!.htmlBody).not.toContain('#ff4d4f'); // sell color
    });

    it('should render daily digest with each loop', () => {
      const result = engine.render('daily_digest', {
        variables: {
          date: '2024-03-20',
          watchlistItems: [
            { name: '茅台', code: '600519', price: '1899', changePercent: '+1.5' },
            { name: '平安', code: '601318', price: '45.6', changePercent: '-0.3' },
          ],
        },
      });
      expect(result!.htmlBody).toContain('茅台');
      expect(result!.htmlBody).toContain('平安');
      expect(result!.htmlBody).toContain('1899');
    });

    it('should return null for disabled template', () => {
      engine.toggleTemplate('system_notice', false);
      expect(engine.render('system_notice', { variables: {} })).toBeNull();
    });

    it('should return null for non-existent template', () => {
      expect(engine.render('nonexistent', { variables: {} })).toBeNull();
    });
  });

  describe('queueSend', () => {
    it('should queue email for sending', () => {
      const record = engine.queueSend('user@test.com', 'system_notice', { variables: { title: '测试', message: 'test' } });
      expect(record).not.toBeNull();
      expect(record!.to).toBe('user@test.com');
      expect(record!.status).toBe('queued');
      expect(engine.getQueue()).toHaveLength(1);
    });

    it('should return null for invalid template', () => {
      expect(engine.queueSend('a@b.com', 'nonexistent', { variables: {} })).toBeNull();
    });
  });

  describe('batchQueue', () => {
    it('should queue emails for multiple recipients', () => {
      const records = engine.batchQueue(
        ['a@a.com', 'b@b.com', 'c@c.com'],
        'system_notice',
        { variables: { title: '批量', message: 'batch' } },
      );
      expect(records).toHaveLength(3);
      expect(engine.getQueue()).toHaveLength(3);
    });

    it('should handle empty recipient list', () => {
      expect(engine.batchQueue([], 'system_notice', { variables: {} })).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should reset all state', () => {
      engine.queueSend('a@b.com', 'system_notice', { variables: { title: 't', message: 'm' } });
      engine.clear();
      expect(engine.getAllTemplates()).toHaveLength(0);
      expect(engine.getQueue()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle nested conditionals', () => {
      const result = engine.renderHtml('{{#if a}}{{#if b}}both{{else}}only a{{/if}}{{else}}none{{/if}}', { a: true, b: true });
      expect(result).toBe('both');
    });

    it('should handle empty html templates', () => {
      engine.addTemplate({ id: 'empty', name: '', subject: 'empty', htmlBody: '', textBody: '', category: 'system', variables: [], enabled: true, createdAt: 0, updatedAt: 0 });
      const result = engine.render('empty', { variables: {} });
      expect(result!.htmlBody).toBe('');
      expect(result!.textBody).toBe('');
    });

    it('should include default company name', () => {
      const result = engine.render('system_notice', { variables: { title: 'test', message: 'test' } });
      expect(result!.variables.companyName).toBe('A股行情分析');
    });
  });
});
