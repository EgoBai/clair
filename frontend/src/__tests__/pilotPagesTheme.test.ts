// @vitest-environment node
/**
 * 三页试点（首页/个股详情/股票列表）主题收口回归。
 *
 * 这组断言只锁「已经修掉的硬编码」与「必须使用设计令牌的关键位置」，
 * 不做全仓 hex 禁令：ECharts canvas、固定深色 tooltip 等仍有合法 hex。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relative: string): string =>
  readFileSync(resolve(process.cwd(), 'src', relative), 'utf8');

const designSystemCss = readFileSync(
  resolve(process.cwd(), 'src/styles/design-system.css'),
  'utf8',
);

describe('三页试点主题收口', () => {
  it('股票列表：统计卡、表头、涨跌胶囊不再硬编码浅色', () => {
    const src = read('pages/StockListPage.tsx');
    expect(src).toContain("background: 'var(--bg-primary)'");
    expect(src).toContain('var(--color-up-bg)');
    expect(src).toContain('var(--color-down-bg)');
    expect(src).toContain("v > 0 ? '+' : ''");
    expect(src).not.toContain('#fafafa');
    expect(src).not.toContain('#eff6ff');
    expect(src).not.toContain("color={v >= 0 ? 'red' : 'green'}");
  });

  it('资金流向：暗色卡片改为令牌，0 值走中性色', () => {
    const src = read('components/Market/CapitalFlowPanel.tsx');
    expect(src).toContain("background: 'var(--bg-secondary)'");
    expect(src).toContain('flowColor');
    expect(src).toContain('flowColor(retailNetFlow)');
    expect(src).toContain("value > 0 ? 'var(--color-up)' : value < 0 ? 'var(--color-down)' : 'var(--text-secondary)'");
    for (const legacy of ['#1a1a2e', '#e74c3c', '#2ecc71', '#94a3b8', '#3498db', '#2d2d44']) {
      expect(src).not.toContain(legacy);
    }
  });

  it('市场宽度：红涨绿跌与警示色改为令牌', () => {
    const src = read('components/Market/MarketBreadthSection.tsx');
    expect(src).toContain("const COLOR_UP = 'var(--color-up)'");
    expect(src).toContain("const COLOR_DOWN = 'var(--color-down)'");
    expect(src).toContain("const WARN = 'var(--color-warning)'");
  });

  it('数据源角标：不再拼接 hex 透明度', () => {
    const src = read('components/discover/DataSourceIndicator.tsx');
    expect(src).toContain("background: cfg.bg");
    expect(src).not.toContain("cfg.color + '1f'");
    expect(src).not.toContain("accent + '1a'");
  });

  it('antd：Alert 的 preset 背景显式映射到主题令牌', () => {
    const src = read('components/Common/ThemeProvider.tsx');
    expect(src).toContain('colorWarningBg: warningBg');
    expect(src).toContain('colorErrorBg: errorBg');
    expect(src).toContain('colorSuccessBg: downBg');
    expect(src).toContain('colorInfoBg: accentLight');
  });

  it('三级文字与警示色不再使用低对比度值', () => {
    const lightAt = designSystemCss.indexOf('[data-theme="light"]');
    const darkBlock = designSystemCss.slice(0, lightAt);
    const lightBlock = designSystemCss.slice(lightAt);
    // 暗色 #5a6478 在 #161b26 卡片上仅 2.90:1；#7b8598 为 4.64:1。
    expect(darkBlock).toContain('--text-tertiary: #7b8598');
    // 亮色 #8b90a0 在 #f8f9fc 上仅 3.02:1；#6b7280 为 4.83:1。
    expect(lightBlock).toContain('--text-tertiary: #6b7280');
    // 亮色 #d97706 在近白底上约 3.3:1；#b45309 约 4.9:1。
    expect(lightBlock).toContain('--color-warning: #b45309');
    // 亮色正文/按钮底 #3b82f6 仅 3.49–3.68:1；#2563eb 为 5.17:1。
    expect(lightBlock).toContain('--accent-solid: #2563eb');
    // 亮色 #16a34a 在近白底仅 3.13:1；#15803d 为 5.02:1。
    expect(lightBlock).toContain('--color-down: #15803d');
    // AI 解读强调文字旧 #60a5fa 仅 2.41:1。
    expect(lightBlock).toContain('--color-highlight: #2563eb');
    // 亮色错误红 #f43f5e 仅 3.49:1；#be123c 为 6.4:1。
    expect(lightBlock).toContain('--color-error: #be123c');
    // 暗色 #3b82f6 配白字仅 3.68:1，实心主色按钮改用深色字（5.15:1）。
    expect(designSystemCss.slice(0, lightAt)).toContain('--text-on-accent: #0d1117');
    expect(lightBlock).toContain('--text-on-accent: #ffffff');
    // antd preset 绿/金/橙标签在亮色下文字加深
    expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-green');
    expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-gold');
    expect(designSystemCss).toContain('[data-theme="light"] .ant-tag-orange');
  });

  it('多信号面板与首页维度角标：颜色全部走令牌', () => {
    const panel = read('components/AI/MultiSignalPanel.tsx');
    expect(panel).toContain("color: 'var(--color-down)'");
    expect(panel).toContain("color: 'var(--color-up)'");
    expect(panel).toContain("color: 'var(--color-warning)'");
    expect(panel).not.toMatch(/#(22c55e|ef4444|f59e0b|3b82f6)/);
    expect(panel).not.toContain('rgba(255,255,255,0.06)');
    const discover = read('pages/DiscoverPage.tsx');
    expect(discover).toContain('getDimTone');
    expect(discover).not.toContain('getDimBg');
    expect(discover).not.toContain('getDimBorder');
  });

  it('情绪标签与估值分位标签：实心底/浅灰底不再造成低对比', () => {
    const sentiment = read('components/Market/MarketSentiment.tsx');
    expect(sentiment).not.toContain("color: '#1890ff'");
    expect(sentiment).not.toContain('color={sentiment.color}');
    expect(sentiment).toContain('borderColor: sentiment.color');
    const valuation = read('components/valuation/ValuationPanel.tsx');
    expect(valuation).toContain("color: 'var(--color-up)'");
    expect(valuation).toContain("color: 'var(--color-down)'");
    expect(valuation).not.toContain('#1db468');
    const breadth = read('components/Market/MarketBreadthSection.tsx');
    expect(breadth).toContain("color: 'var(--text-inverse)'");
    const provider = read('components/Common/ThemeProvider.tsx');
    expect(provider).toContain('colorTextLightSolid: textOnAccent');
  });

  it('平板 768：布局子项与信号来源标签不会把页面撑出视口', () => {
    const layout = read('components/Layout/AppLayout.tsx');
    expect(layout).toContain('min-width: 0;');
    const detail = read('pages/StockDetailPage.tsx');
    // md 断点下三列并排会挤爆 768；改为 992 以下堆叠
    expect(detail).not.toContain('<Col xs={24} md={6}>');
    expect(detail).toContain('<Col xs={24} lg={6}>');
    expect(detail).toContain('<Col xs={24} lg={9}>');
    const panel = read('components/AI/MultiSignalPanel.tsx');
    expect(panel).toContain("maxWidth: '64%'");
    expect(panel).toContain("overflowWrap: 'anywhere'");
  });

  it('个股详情：AI 评分与维度卡不再写死涨跌色/暗色底', () => {
    const src = read('pages/StockDetailPage.tsx');
    expect(src).toContain('scoreTone');
    expect(src).toContain("background: 'var(--bg-secondary)'");
    expect(src).not.toContain('#22c55e');
    expect(src).not.toContain("rgba(15,23,42,0.5)");
  });
});
