/**
 * NavigationMenu 组件测试（第23轮重写，匹配 v3.8.0 两级折叠分组侧栏）
 *
 * 变更背景：第22轮 D15 导航 IA 落地，NavigationMenu 重构为
 * NAV_GROUPS 驱动的 6 组两级可折叠侧栏（antd icon / aria / localStorage 持久化），
 * 旧实现（emoji 图标、移动端 ☰/✕ 抽屉、overlay、.nav-tooltip）已移除——
 * 移动端导航由底部 TabBar 承载，本组件在 <=768px 直接隐藏。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavigationMenu from '../../components/Layout/NavigationMenu';
import { NAV_GROUPS } from '../../config/navGroups';

const COLLAPSED_STORAGE_KEY = 'clair-nav-collapsed-groups';
// 平板 icon-rail「固定展开」持久化 key，存 '1' / '0' 字符串（见 NavigationMenu.tsx）
const RAIL_PINNED_STORAGE_KEY = 'clair-nav-rail-pinned';

const renderWithRouter = (initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationMenu />
    </MemoryRouter>
  );
};

beforeEach(() => {
  localStorage.clear();
});

describe('NavigationMenu（品牌与骨架）', () => {
  it('渲染品牌标题', () => {
    renderWithRouter();
    expect(screen.getByText('澄观')).toBeDefined();
  });

  it('渲染副标题', () => {
    renderWithRouter();
    expect(screen.getByText('Clair · 水静则明')).toBeDefined();
  });

  it('渲染底部服务状态与版本号', () => {
    renderWithRouter();
    expect(screen.getByText('服务正常')).toBeDefined();
    expect(screen.getByText('v1.0.0')).toBeDefined();
  });

  it('nav 根节点带主导航 aria-label', () => {
    renderWithRouter();
    expect(screen.getByLabelText('主导航')).toBeDefined();
  });
});

describe('NavigationMenu（分组渲染）', () => {
  it('渲染全部 6 个分组标题', () => {
    renderWithRouter();
    for (const group of NAV_GROUPS) {
      expect(screen.getByText(group.label)).toBeDefined();
    }
  });

  it('渲染全部子项（24 页面全覆盖）', () => {
    renderWithRouter();
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(screen.getByText(item.label)).toBeDefined();
      }
    }
  });

  it('子项链接 href 与配置路径一致', () => {
    renderWithRouter();
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(hrefs).toContain(item.path);
      }
    }
  });

  it('每个分组标题都是 button 且默认 aria-expanded=true', () => {
    // 只针对 NAV_GROUPS 各自的标题按钮做断言，不统计侧栏 button 总数——
    // 侧栏未来新增任何按钮都不应影响本用例（T10）。
    renderWithRouter();
    for (const group of NAV_GROUPS) {
      const header = screen.getByText(group.label).closest('button');
      expect(header).not.toBeNull();
      expect(header!.getAttribute('aria-expanded')).toBe('true');
    }
  });
});

describe('NavigationMenu（折叠交互）', () => {
  it('点击非激活分组标题可折叠该组', () => {
    // 当前路由 '/' 属于 market-overview 组，选一个非激活组测试折叠
    const { container } = renderWithRouter(['/']);
    const quantHeader = screen.getByText('量化实验').closest('button')!;

    fireEvent.click(quantHeader);

    expect(quantHeader.getAttribute('aria-expanded')).toBe('false');
    const list = container.querySelector('#nav-group-quant');
    expect(list?.classList.contains('is-collapsed')).toBe(true);
  });

  it('再次点击已折叠分组可重新展开', () => {
    const { container } = renderWithRouter(['/']);
    const header = screen.getByText('资金面').closest('button')!;

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    const list = container.querySelector('#nav-group-capital');
    expect(list?.classList.contains('is-collapsed')).toBe(false);
  });

  it('当前路由所在分组强制展开（即使被标记折叠）', () => {
    // 预置：market-overview 已被持久化为折叠
    localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      JSON.stringify({ 'market-overview': true })
    );
    renderWithRouter(['/']); // '/' 属于 market-overview

    const header = screen.getByText('市场总览').closest('button')!;
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('折叠状态持久化到 localStorage', () => {
    renderWithRouter(['/']);
    const header = screen.getByText('量化实验').closest('button')!;

    fireEvent.click(header);

    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '{}');
    expect(stored['quant']).toBe(true);
  });

  it('从 localStorage 恢复折叠状态（非激活组）', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify({ quant: true }));
    renderWithRouter(['/']); // '/' 不属于 quant 组

    const header = screen.getByText('量化实验').closest('button')!;
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('NavigationMenu（激活态）', () => {
  it('首页精确匹配高亮「市场洞察」', () => {
    const { container } = renderWithRouter(['/']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toContain('市场洞察');
  });

  it('激活项带 aria-current=page', () => {
    const { container } = renderWithRouter(['/']);
    const current = container.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current?.textContent).toContain('市场洞察');
  });

  it('详情级路由前缀匹配高亮父级（/stocks/600519 → 股票列表）', () => {
    const { container } = renderWithRouter(['/stocks/600519']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toContain('股票列表');
  });

  it('非首页路由不高亮「市场洞察」（首页需精确匹配）', () => {
    const { container } = renderWithRouter(['/backtest']);
    const activeLinks = Array.from(container.querySelectorAll('.nav-link.active'));
    const labels = activeLinks.map((l) => l.textContent ?? '');
    expect(labels.some((t) => t.includes('市场洞察'))).toBe(false);
    expect(labels.some((t) => t.includes('回测'))).toBe(true);
  });
});

describe('NavigationMenu（平板 rail 固定开关）', () => {
  /**
   * 开关基础样式为 display:none，仅在 769–1024px 媒体查询内变为 inline-flex。
   * jsdom 会套用组件内联 <style> 的基础规则却不解析媒体查询，故该节点在
   * 无障碍树中恒为 hidden——查询必须显式带 { hidden: true }。
   */
  const getRailToggle = () => screen.getByRole('switch', { hidden: true });

  it('渲染「固定导航栏」开关且默认 aria-checked=false', () => {
    renderWithRouter();
    const toggle = getRailToggle();
    expect(toggle.getAttribute('aria-label')).toBe('固定导航栏');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('点击开关后 aria-checked 变为 true', () => {
    renderWithRouter();
    const toggle = getRailToggle();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('固定状态持久化到 localStorage（存 "1"）', () => {
    renderWithRouter();

    fireEvent.click(getRailToggle());

    expect(localStorage.getItem(RAIL_PINNED_STORAGE_KEY)).toBe('1');
  });

  it('从 localStorage 恢复已固定状态（初始即 aria-checked=true）', () => {
    localStorage.setItem(RAIL_PINNED_STORAGE_KEY, '1');
    renderWithRouter();

    expect(getRailToggle().getAttribute('aria-checked')).toBe('true');
  });
});
