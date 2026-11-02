/**
 * 通知 actionUrl 与前端真实路由的一致性校验（测的是真模块，不是影子副本）
 *
 * 回归背景（线上真实故障）：
 * 模板曾下发 '/stock/{{symbol}}'、'/report/daily' —— 既带前导斜杠（整页跳转会绕过
 * Router 的 basename，生产为 '/clair/'，请求落到 https://egobai.github.io/ 根，
 * 浏览器显示 GitHub 通用 404「There isn't a GitHub Pages site here.」），
 * 路由名也是错的（前端是 stocks/:symbol、report-center）。
 *
 * 注意：同目录的 notification-templates.test.ts 里自己重抄了一份 DEFAULT_TEMPLATES
 * （不 import 本模块），所以模板真值改了它也不会红——这正是坏链接长期没被发现的原因。
 * 本文件直接 import 真模块，并用前端 routes/index.tsx 的真实 <Route path> 反校。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TEMPLATES,
  TemplateManager,
  isAllowedActionUrl,
} from '../services/notification/templates';

/** 从 cwd 逐级向上找前端路由文件 */
function findFrontendRoutes(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'frontend/src/routes/index.tsx');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('找不到 frontend/src/routes/index.tsx');
}

/** 解析前端真实路由表：<Route path="stocks/:symbol"> → /^stocks\/[^/]+$/ */
function frontendRouteMatchers(): RegExp[] {
  const source = fs.readFileSync(findFrontendRoutes(), 'utf8');
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  return paths
    .filter((p) => p !== '*') // 404 通配不算可跳目标
    .map((p) => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('^' + escaped.replace(/:[A-Za-z_]\w*/g, '[^/]+') + '$');
    });
}

const renderWithPlaceholders = (template: string) => template.replace(/\{\{\w+\}\}/g, '600519');

describe('通知模板 actionUrl 与前端路由一致', () => {
  it('前端路由表能被解析出来（防止测试本身空转）', () => {
    expect(frontendRouteMatchers().length).toBeGreaterThan(20);
  });

  it('每个模板下发的 actionUrl 都能被前端真实路由匹配', () => {
    const matchers = frontendRouteMatchers();
    const withUrl = DEFAULT_TEMPLATES.filter((t) => t.actionUrlTemplate);

    expect(withUrl.length).toBeGreaterThan(0);
    for (const t of withUrl) {
      const rendered = renderWithPlaceholders(t.actionUrlTemplate!);
      expect(
        matchers.some((re) => re.test(rendered)),
        `模板 ${t.id} 的 actionUrl "${rendered}" 匹配不到任何前端路由`
      ).toBe(true);
    }
  });

  it('模板 actionUrl 一律为站内相对路径（不带前导斜杠、不含协议）', () => {
    for (const t of DEFAULT_TEMPLATES) {
      if (!t.actionUrlTemplate) continue;
      expect(t.actionUrlTemplate.startsWith('/'), `模板 ${t.id} 带前导斜杠`).toBe(false);
      expect(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t.actionUrlTemplate), `模板 ${t.id} 含协议`).toBe(false);
    }
  });

  it('新闻通知明确不设 actionUrl（前端无新闻详情路由）', () => {
    const news = DEFAULT_TEMPLATES.find((t) => t.id === 'news_alert');
    expect(news).toBeDefined();
    expect(news!.actionUrlTemplate).toBeUndefined();
    const rendered = new TemplateManager().renderNotification('news_alert', { title: 'x', summary: 'y' });
    expect(rendered!.actionUrl).toBeUndefined();
  });
});

describe('isAllowedActionUrl 边界', () => {
  it('接受站内相对路径', () => {
    expect(isAllowedActionUrl('stocks/600519')).toBe(true);
    expect(isAllowedActionUrl('stocks')).toBe(true);
    expect(isAllowedActionUrl('report-center')).toBe(true);
    expect(isAllowedActionUrl('stocks/600519?tab=k')).toBe(true);
    expect(isAllowedActionUrl('stocks/600519#chart')).toBe(true);
  });

  it('拒绝根绝对 / 协议相对 / 带协议 / 未知路由', () => {
    expect(isAllowedActionUrl('/stock/600519')).toBe(false);
    expect(isAllowedActionUrl('/')).toBe(false);
    expect(isAllowedActionUrl('//evil.example.com/x')).toBe(false);
    expect(isAllowedActionUrl('https://evil.example.com/x')).toBe(false);
    expect(isAllowedActionUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedActionUrl('stock/600519')).toBe(false);
    expect(isAllowedActionUrl('news/123')).toBe(false);
    expect(isAllowedActionUrl('report/daily')).toBe(false);
    expect(isAllowedActionUrl(undefined)).toBe(false);
    expect(isAllowedActionUrl('')).toBe(false);
  });
});

describe('renderNotification 对坏链接的兜底', () => {
  it('自定义模板下发根绝对路径时被丢弃，不下发给前端', () => {
    const tm = new TemplateManager();
    tm.addTemplate({
      id: 'bad_tmpl',
      type: 'system',
      titleTemplate: 't',
      bodyTemplate: 'b',
      defaultChannels: ['in_app'],
      defaultPriority: 'low',
      actionUrlTemplate: '/stock/{{symbol}}',
      enabled: true,
    });
    expect(tm.renderNotification('bad_tmpl', { symbol: '600519' })!.actionUrl).toBeUndefined();
  });

  it('正常模板渲染出站内相对路径', () => {
    const tm = new TemplateManager();
    const r = tm.renderNotification('price_alert_above', {
      name: '贵州茅台',
      symbol: '600519',
      price: 1850,
      targetPrice: 1800,
      changePercent: 2.78,
    });
    expect(r!.actionUrl).toBe('stocks/600519');
  });
});
