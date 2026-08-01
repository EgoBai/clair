/**
 * TabBar 组件测试（移动端底部导航，T12-a 补齐零覆盖）
 *
 * 被测组件：src/components/Layout/TabBar.tsx（v3.8「4 主入口 + 更多 Sheet」形态）
 * 数据源：src/config/navGroups.ts 的 NAV_GROUPS —— 本文件的期望值一律从 NAV_GROUPS
 * 派生，不硬编码中文字面量，配置调整时测试跟随而非误伤。
 *
 * 环境说明：
 * - 全局 setup（vitest.config.ts → src/__tests__/setup.ts）已提供 window.matchMedia
 *   与 ResizeObserver mock，antd Drawer 在 jsdom 下可直接渲染，本文件无需再本地 mock。
 * - Drawer 内容渲染在 portal（document.body）中，故一律用 screen / within(dialog) 查询，
 *   不使用 render 返回的 container。
 * - Drawer 有开合动画，打开后用 findBy* 异步查询等待面板挂载。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TabBar from '../../components/Layout/TabBar';
import { NAV_GROUPS } from '../../config/navGroups';

// ---------------------------------------------------------------------------
// 期望值派生（与 TabBar.tsx 的 MAIN_TAB_DEFS 保持同一组 id，不复制 label/path 字面量）
// ---------------------------------------------------------------------------

const MAIN_TAB_IDS = ['home', 'screener', 'watchlist', 'industry-map'] as const;

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const findItem = (id: string) => {
  const item = ALL_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`NAV_GROUPS 中不存在 id=${id} 的导航项`);
  return item;
};

const MAIN_TABS = MAIN_TAB_IDS.map(findItem);
const MAIN_PATHS = new Set(MAIN_TABS.map((t) => t.path));

// 「更多」Sheet 的期望内容：NAV_GROUPS 去掉 4 个主入口后剩余的分组/条目
const MORE_GROUPS = NAV_GROUPS.map((g) => ({
  ...g,
  items: g.items.filter((i) => !MAIN_PATHS.has(i.path)),
})).filter((g) => g.items.length > 0);

const MORE_ITEMS = MORE_GROUPS.flatMap((g) => g.items);

// ---------------------------------------------------------------------------
// 渲染工具：附带一个只读探针，用于断言 MemoryRouter 内的真实 location.pathname
// （不 mock useNavigate，验证的是「点击 → 路由真的变了」的端到端行为）
// ---------------------------------------------------------------------------

const LocationProbe = () => {
  const location = useLocation();
  return <span role="status">{location.pathname}</span>;
};

const renderTabBar = (initialEntries: string[] = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TabBar />
      <LocationProbe />
    </MemoryRouter>
  );

const currentPath = () => screen.getByRole('status').textContent;

/** 打开「更多」抽屉并返回其 dialog 容器（antd Drawer 面板 role="dialog"） */
const openMoreSheet = async () => {
  fireEvent.click(screen.getByRole('tab', { name: '更多' }));
  return screen.findByRole('dialog');
};

// ---------------------------------------------------------------------------

describe('TabBar（骨架渲染）', () => {
  it('根节点是带「主导航」标签的 tablist', () => {
    renderTabBar();
    const nav = screen.getByRole('tablist');
    expect(nav.getAttribute('aria-label')).toBe('主导航');
    expect(nav.tagName).toBe('NAV');
  });

  it('渲染 4 个主入口 + 「更多」共 5 个 tab', () => {
    // 此处的全量计数是本组件的明确契约（源码固定 4 主 Tab + 1 个「更多」入口，
    // 第 5 个入口正是为「不再增长」而设计的溢出口），并非「未来可能增长的集合」，
    // 故允许计数断言；其余任何集合仍按配置逐项定位。
    renderTabBar();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });
});

describe('TabBar（配置驱动一致性）', () => {
  it('4 个主 Tab 的名称与 NAV_GROUPS 中对应 id 的 label 一致', () => {
    renderTabBar();
    for (const item of MAIN_TABS) {
      expect(screen.getByRole('tab', { name: item.label })).toBeDefined();
    }
  });

  it('「更多」tab 默认处于折叠态且声明为 dialog 触发器', () => {
    renderTabBar();
    const more = screen.getByRole('tab', { name: '更多' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
  });
});

describe('TabBar（激活态）', () => {
  it('初始路由为某主 Tab 路径时，仅该 tab aria-selected=true', () => {
    const target = findItem('screener');
    renderTabBar([target.path]);

    for (const item of MAIN_TABS) {
      expect(screen.getByRole('tab', { name: item.label }).getAttribute('aria-selected')).toBe(
        String(item.id === target.id)
      );
    }
    expect(screen.getByRole('tab', { name: '更多' }).getAttribute('aria-selected')).toBe('false');
  });

  it('首页走精确匹配：路由 "/" 时首页 tab 选中', () => {
    const home = findItem('home');
    renderTabBar([home.path]);
    expect(screen.getByRole('tab', { name: home.label }).getAttribute('aria-selected')).toBe('true');
  });

  it('非首页路由不高亮首页 tab', () => {
    renderTabBar([findItem('watchlist').path]);
    expect(
      screen.getByRole('tab', { name: findItem('home').label }).getAttribute('aria-selected')
    ).toBe('false');
  });

  it('初始路由落在「更多」内某项（宏观仪表盘）时，「更多」tab 选中且主 tab 全未选中', () => {
    renderTabBar([findItem('macro').path]);

    expect(screen.getByRole('tab', { name: '更多' }).getAttribute('aria-selected')).toBe('true');
    for (const item of MAIN_TABS) {
      expect(screen.getByRole('tab', { name: item.label }).getAttribute('aria-selected')).toBe(
        'false'
      );
    }
  });

  it('详情级路由前缀匹配父级（/stocks/:symbol → 「更多」tab 选中）', () => {
    renderTabBar([`${findItem('stocks').path}/600519`]);
    expect(screen.getByRole('tab', { name: '更多' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('TabBar（更多 Sheet）', () => {
  it('点击「更多」后展开抽屉并显示「全部功能」标题', async () => {
    renderTabBar();
    const dialog = await openMoreSheet();

    expect(screen.getByRole('tab', { name: '更多' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getByText('全部功能')).toBeDefined();
  });

  it('抽屉内渲染全部剩余分组标题', async () => {
    renderTabBar();
    const dialog = await openMoreSheet();

    for (const group of MORE_GROUPS) {
      expect(within(dialog).getByText(group.label)).toBeDefined();
    }
  });

  it('抽屉内渲染全部未被主 Tab 覆盖的条目', async () => {
    renderTabBar();
    const dialog = await openMoreSheet();

    for (const item of MORE_ITEMS) {
      expect(within(dialog).getByText(item.label)).toBeDefined();
    }
  });

  it('抽屉内不出现 4 个主 Tab 已覆盖的条目（moreGroups 过滤逻辑）', async () => {
    renderTabBar();
    const dialog = await openMoreSheet();

    for (const item of MAIN_TABS) {
      expect(within(dialog).queryByText(item.label)).toBeNull();
    }
  });
});

describe('TabBar（导航行为）', () => {
  it('点击主 Tab 跳转到配置中的对应路径', () => {
    const target = findItem('industry-map');
    renderTabBar(['/']);
    expect(currentPath()).toBe('/');

    fireEvent.click(screen.getByRole('tab', { name: target.label }));

    expect(currentPath()).toBe(target.path);
    expect(screen.getByRole('tab', { name: target.label }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('点击抽屉内条目跳转到该条目路径并收起抽屉', async () => {
    const target = findItem('backtest');
    renderTabBar(['/']);
    const dialog = await openMoreSheet();

    const entry = within(dialog).getByText(target.label).closest('button');
    expect(entry).not.toBeNull();
    fireEvent.click(entry!);

    expect(currentPath()).toBe(target.path);
    expect(screen.getByRole('tab', { name: '更多' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('跳转后抽屉内该条目标记为 aria-current=page', async () => {
    const target = findItem('etf');
    renderTabBar([target.path]);
    const dialog = await openMoreSheet();

    const entry = within(dialog).getByText(target.label).closest('button');
    expect(entry?.getAttribute('aria-current')).toBe('page');
  });
});
