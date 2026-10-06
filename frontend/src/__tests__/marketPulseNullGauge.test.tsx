// @vitest-environment jsdom
/**
 * P0-TEMPGAUGE —— 市场温度仪表盘的「诚实渲染」契约测试
 *
 * 缺陷背景：后端 ai-market-pulse 已在降级态诚实返回
 *   temperature: { score: null, label: '未知' }, dataSource: 'unavailable'
 * 但前端写 `percent={pulse.temperature?.score ?? 0}` 且
 * `score >= 60 ? 绿 : score >= 45 ? 橙 : 红`，
 * 于是 null → 「0/100」+ 红色。后端 computeTemperature 里 0 分对应的真实 label
 * 就是「弱势」，所以这等于凭空造出一个「市场极度弱势」的真实结论。
 *
 * 本测试把三条红线钉死：
 *   1. score 为 null 时不得渲染任何像真实温度的数字（尤其不是 0）
 *   2. score 为 null 时不得使用红/绿/橙任何一档档位色
 *   3. score 为真实值时仍必须按档位着色（防止修复把真实语义也一起抹平）
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  resolveTemperatureGauge,
  temperatureGaugeColor,
  MarketTemperatureGauge,
  GAUGE_UNAVAILABLE_COLOR,
} from '../pages/DiscoverPage';

const RED = '#ef4444';
const GREEN = '#22c55e';
// 中间档用的是项目主题色 ACCENT = THEME.accent = 'var(--accent-solid)'（design-system.css 里解析为 #3b82f6），
// 不是字面量 #667eea —— 断言必须跟真实渲染出的值对齐，否则测试会假失败。
const ORANGE = 'var(--accent-solid)';

/**
 * jsdom 会把内联 style 里的十六进制色归一化成 `rgb(r, g, b)`，
 * 所以在 DOM 断言里不能直接 `toContain('#ef4444')`（会假失败）。
 * 这里统一按 rgb 形态断言，这才是 DOM 里真实存在的字符串。
 */
const RED_RGB = 'rgb(239, 68, 68)';   // #ef4444
const GREEN_RGB = 'rgb(34, 197, 94)'; // #22c55e
const NEUTRAL_RGB = 'rgb(148, 163, 184)'; // #94a3b8

describe('P0-TEMPGAUGE · 市场温度仪表盘诚实契约', () => {
  describe('场景 B：后端降级态 score: null（核心回归）', () => {
    it('score 为 null 时 available 必须为 false，且 score 不得被替换成 0', () => {
      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect(g.available).toBe(false);
      // 最关键的一条：null 绝不能退化成 0
      expect(g.score).toBeNull();
      expect(g.score).not.toBe(0);
    });

    it('score 为 null 时不得使用红色（红色 = 弱势的真实语义）', () => {
      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect(g.color).not.toBe(RED);
    });

    it('score 为 null 时不得使用任何档位色（红/绿/橙）', () => {
      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect([RED, GREEN, ORANGE]).not.toContain(g.color);
      expect(g.color).toBe(GAUGE_UNAVAILABLE_COLOR);
    });

    it('score 为 null 时文案不含任何数字，不含 0/100 形态', () => {
      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect(g.text).not.toMatch(/\d/);
      expect(g.text).not.toMatch(/0/);
      expect(`${g.text}${g.subText}`).not.toMatch(/0\s*\/\s*100/);
    });

    it('score 为 null 时文案说明是「数据源不可得」而非市场弱势', () => {
      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect(g.text).toBe('暂不可用');
      expect(g.subText).toContain('数据源不可得');
    });

    it('复现原始缺陷条件：null >= 60 与 null >= 45 都是 false，说明原写法必然落到红色', () => {
      // 这条断言是在给「为什么必须改颜色」留证据：单纯把 ?? 0 去掉但保留原三元表达式，
      // 会让不可得态继承 #ef4444，形成「无数字 + 红色」的半修复，比原状更具误导性。
      const score: number | null = null;
      const legacyColor = score! >= 60 ? GREEN : score! >= 45 ? ORANGE : RED;
      expect(legacyColor).toBe(RED);

      const g = resolveTemperatureGauge({ score: null, label: '未知' });
      expect(g.color).not.toBe(legacyColor);
    });
  });

  describe('temperature 字段整体缺失 / 非法值的兜底', () => {
    it.each([
      ['undefined 对象', undefined],
      ['null 对象', null],
      ['空对象', {}],
      ['score 为 undefined', { score: undefined, label: '未知' }],
      ['score 为 NaN', { score: NaN, label: '未知' }],
      ['score 为字符串 "56"', { score: '56', label: '偏暖' }],
    ])('%s 一律走不可得分支，绝不退化成 0', (_label, input) => {
      const g = resolveTemperatureGauge(input);
      expect(g.available).toBe(false);
      expect(g.score).toBeNull();
      expect(g.color).not.toBe(RED);
      expect(g.color).not.toBe(GREEN);
    });
  });

  describe('场景 A：后端返回真实温度（防止修复把真实语义一起抹平）', () => {
    it('score=56 → 显示 56/100', () => {
      const g = resolveTemperatureGauge({ score: 56, label: '中性' });
      expect(g.available).toBe(true);
      expect(g.score).toBe(56);
      expect(g.text).toBe('56/100');
      expect(g.subText).toBe('中性');
    });

    it.each([
      [75, '强势', GREEN],
      [60, '偏暖', GREEN],
      [45, '中性', ORANGE],
      [44, '偏冷', RED],
      [0, '弱势', RED],
    ])('score=%i (%s) 着色为 %s', (score, _label, color) => {
      const g = resolveTemperatureGauge({ score, label: _label });
      expect(g.available).toBe(true);
      expect(g.color).toBe(color);
      expect(g.text).toBe(`${score}/100`);
    });

    it('score=0 是「真实测得的弱势」，与 score=null 的「不可得」必须可区分', () => {
      const real = resolveTemperatureGauge({ score: 0, label: '弱势' });
      const missing = resolveTemperatureGauge({ score: null, label: '未知' });
      // 两者都可能是红色，但文案/可用性/副文案必须完全不同
      expect(real.available).toBe(true);
      expect(missing.available).toBe(false);
      expect(real.text).toBe('0/100');
      expect(missing.text).not.toBe('0/100');
      expect(missing.subText).not.toBe('弱势');
    });
  });

  describe('档位色函数与后端 computeTemperature 阈值一致', () => {
    it.each([
      [100, GREEN], [60, GREEN], [59, ORANGE], [45, ORANGE],
      [44, RED], [30, RED], [0, RED],
    ])('score=%i → %s', (score, color) => {
      expect(temperatureGaugeColor(score)).toBe(color);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 以下为真实 DOM 断言（jsdom + @testing-library/react）
  // ─────────────────────────────────────────────────────────────
  describe('DOM 渲染 · 场景 B：score=null 降级态', () => {
    const domOf = (c: React.ReactElement) => {
      const { container, unmount } = render(c);
      const html = container.innerHTML;
      unmount();
      return html;
    };

    it('不渲染 Progress 仪表盘，改为中性灰「暂不可用」占位', () => {
      render(<MarketTemperatureGauge temperature={{ score: null, label: '未知' }} />);
      expect(screen.queryByTestId('market-temperature-gauge')).toBeNull();
      expect(screen.getByTestId('market-temperature-unavailable')).toBeTruthy();
      expect(screen.getByText('暂不可用')).toBeTruthy();
      expect(screen.getByText(/数据源不可得/)).toBeTruthy();
    });

    it('DOM 中不含 `>0</` 这类「0 值 + 百分比」形态', () => {
      const html = domOf(<MarketTemperatureGauge temperature={{ score: null, label: '未知' }} />);
      expect(html).not.toMatch(/>\s*0\s*</);
      expect(html).not.toMatch(/>\s*0\s*%/);
      expect(html).not.toContain('0/100');
    });

    it('DOM 中不出现任何档位色（strokeColor 不是 #ef4444）', () => {
      const { container } = render(<MarketTemperatureGauge temperature={{ score: null, label: '未知' }} />);
      const html = container.innerHTML;
      expect(html).not.toContain(RED_RGB);
      expect(html).not.toContain(GREEN_RGB);
      expect(html).toContain(NEUTRAL_RGB);
      // aria 层面也必须可读出「不可得」
      expect(screen.getByLabelText('市场温度暂不可用')).toBeTruthy();
    });

    it('accessibility：不可得态带 role=status，屏幕阅读器不会读出一个假温度值', () => {
      render(<MarketTemperatureGauge temperature={{ score: null, label: '未知' }} />);
      const el = screen.getByRole('status');
      expect(el.textContent).not.toMatch(/\d+\s*\/\s*100/);
    });
  });

  describe('DOM 渲染 · 场景 A：真实温度', () => {
    it('score=56 → DOM 显示 56/100 且颜色为中性档（ACCENT）', () => {
      const { container } = render(<MarketTemperatureGauge temperature={{ score: 56, label: '中性' }} />);
      expect(screen.getByTestId('market-temperature-gauge')).toBeTruthy();
      expect(screen.queryByTestId('market-temperature-unavailable')).toBeNull();
      expect(screen.getByTestId('gauge-text').textContent).toContain('56/100');
      expect(screen.getByTestId('gauge-text').textContent).toContain('中性');
      // 56 落在 [45,60) 档 → 橙色，且必须不是不可得态的中性灰
      const html = container.innerHTML;
      expect(html).toContain(ORANGE);
      expect(html).not.toContain(GAUGE_UNAVAILABLE_COLOR);
    });

    it('score=72 → DOM 颜色为绿色档', () => {
      const { container } = render(<MarketTemperatureGauge temperature={{ score: 72, label: '偏暖' }} />);
      expect(container.innerHTML).toContain(GREEN_RGB);
      expect(screen.getByTestId('gauge-text').textContent).toContain('72/100');
    });

    it('真实 score=0（弱势）渲染为 0/100 + 红色，与不可得态 DOM 完全不同', () => {
      const { container: realC, unmount } = render(<MarketTemperatureGauge temperature={{ score: 0, label: '弱势' }} />);
      const realHtml = realC.innerHTML;
      expect(screen.getByTestId('gauge-text').textContent).toContain('0/100');
      expect(realHtml).toContain(RED_RGB);
      unmount();

      render(<MarketTemperatureGauge temperature={{ score: null, label: '未知' }} />);
      const missingHtml = document.body.innerHTML;
      expect(missingHtml).not.toContain(RED_RGB);
      expect(missingHtml).not.toContain('0/100');
      expect(missingHtml).not.toBe(realHtml);
    });
  });
});