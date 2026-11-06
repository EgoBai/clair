/**
 * NavigationMenu 组件测试（第23轮重写，匹配 v3.8.0 两级折叠分组侧栏）
 *
 * 变更背景：第22轮 D15 导航 IA 落地，NavigationMenu 重构为
 * NAV_GROUPS 驱动的 5 组两级可折叠侧栏（antd icon / aria / localStorage 持久化），
 * 旧实现（emoji 图标、移动端 ☰/✕ 抽屉、overlay、.nav-tooltip）已移除——
 * 移动端导航由底部 TabBar 承载，本组件在 <=768px 直接隐藏。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavigationMenu from '../../components/Layout/NavigationMenu';
import { NAV_GROUPS } from '../../config/navGroups';

const COLLAPSED_STORAGE_KEY = 'clair-nav-collapsed-groups';
// 平板 icon-rail「固定展开」持久化 key，存 '1' / '0' 字符串（见 NavigationMenu.tsx）
const RAIL_PINNED_STORAGE_KEY = 'clair-nav-rail-pinned';

/**
 * 底部状态灯自 2026-11-03 起是**真实探测**（/api/version + /health），
 * 不再是字面量，故所有用例都必须给出 fetch 桩，否则渲染结果取决于运行环境的网络。
 * 桩只用 ok/status/json 三个成员（组件不读 response 其它字段），不依赖 Response 构造器。
 */
type FetchStub = { ok: boolean; status: number; json: () => Promise<unknown> };

const jsonResponse = (body: unknown, status = 200): FetchStub => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** 让 /api/version 与 /health 的返回可控；未匹配路径按 404 处理 */
const stubBackend = (opts: {
  version?: () => FetchStub | Promise<FetchStub>;
  health?: () => FetchStub | Promise<FetchStub>;
}) => {
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/api/version')) {
      return opts.version ? await opts.version() : jsonResponse({ appVersion: '1.7.0' });
    }
    if (url.includes('/health')) {
      return opts.health ? await opts.health() : jsonResponse({ status: 'healthy', degraded: false });
    }
    return jsonResponse({ error: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

const renderWithRouter = (initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationMenu />
    </MemoryRouter>
  );
};

beforeEach(() => {
  localStorage.clear();
  // 默认桩：永不返回。让不关心状态灯的用例停在「检测中」，避免异步 setState 触发 act 警告。
  // 需要具体三态的用例各自用 stubBackend / vi.stubGlobal 覆盖。
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it('底部状态灯显示真实探测结论与后端版本号', async () => {
    stubBackend({});
    renderWithRouter();

    // 初态先「检测中」，探测返回后转「服务正常」——绝不以「正常」当默认值
    expect(screen.getByText('检测中')).toBeDefined();
    await waitFor(() => expect(screen.getByText('服务正常')).toBeDefined());
    // 版本号来自 /api/version 的 appVersion，不是硬编码
    expect(screen.getByText('v1.7.0')).toBeDefined();
    expect(screen.queryByText('v1.0.0')).toBeNull();
  });

  it('nav 根节点带主导航 aria-label', () => {
    renderWithRouter();
    expect(screen.getByLabelText('主导航')).toBeDefined();
  });
});

describe('NavigationMenu（分组渲染）', () => {
  it('渲染全部 5 个分组标题', () => {
    renderWithRouter();
    for (const group of NAV_GROUPS) {
      expect(screen.getByText(group.label)).toBeDefined();
    }
  });

  it('渲染全部子项（26 页面全覆盖）', () => {
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
    // 当前路由 '/' 属于 today 组，选一个非激活组测试折叠
    const { container } = renderWithRouter(['/']);
    const toolsHeader = screen.getByText('工具').closest('button')!;

    fireEvent.click(toolsHeader);

    expect(toolsHeader.getAttribute('aria-expanded')).toBe('false');
    const list = container.querySelector('#nav-group-tools');
    expect(list?.classList.contains('is-collapsed')).toBe(true);
  });

  it('再次点击已折叠分组可重新展开', () => {
    const { container } = renderWithRouter(['/']);
    // 分组「公司」在 navGroups 中 id = companies
    const header = screen.getByText('公司').closest('button')!;

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    const list = container.querySelector('#nav-group-companies');
    expect(list?.classList.contains('is-collapsed')).toBe(false);
  });

  it('当前路由所在分组强制展开（即使被标记折叠）', () => {
    // 预置：today 已被持久化为折叠
    localStorage.setItem(
      COLLAPSED_STORAGE_KEY,
      JSON.stringify({ today: true })
    );
    renderWithRouter(['/']); // '/' 属于 today

    const header = screen.getByText('今日').closest('button')!;
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('折叠状态持久化到 localStorage', () => {
    renderWithRouter(['/']);
    const header = screen.getByText('工具').closest('button')!;

    fireEvent.click(header);

    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '{}');
    expect(stored['tools']).toBe(true);
  });

  it('从 localStorage 恢复折叠状态（非激活组）', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify({ tools: true }));
    renderWithRouter(['/']); // '/' 不属于 tools 组

    const header = screen.getByText('工具').closest('button')!;
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('NavigationMenu（激活态）', () => {
  it('首页精确匹配高亮「今日简报」', () => {
    const { container } = renderWithRouter(['/']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toContain('今日简报');
  });

  it('激活项带 aria-current=page', () => {
    const { container } = renderWithRouter(['/']);
    const current = container.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current?.textContent).toContain('今日简报');
  });

  it('详情级路由前缀匹配高亮父级（/stocks/600519 → 股票列表）', () => {
    const { container } = renderWithRouter(['/stocks/600519']);
    const activeLink = container.querySelector('.nav-link.active');
    expect(activeLink).not.toBeNull();
    expect(activeLink?.textContent).toContain('股票列表');
  });

  it('非首页路由不高亮「今日简报」（首页需精确匹配）', () => {
    const { container } = renderWithRouter(['/backtest']);
    const activeLinks = Array.from(container.querySelectorAll('.nav-link.active'));
    const labels = activeLinks.map((l) => l.textContent ?? '');
    expect(labels.some((t) => t.includes('今日简报'))).toBe(false);
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

/**
 * 侧栏状态灯三态（2026-11-03 假状态灯缺陷回归）
 *
 * 改前：`服务正常` 与 `v1.0.0` 是字面量，后端关掉/拦截接口后侧栏照样亮绿灯，
 * 与同屏右下角的 "v1.7.0 · 未知" 自相矛盾。以下用例把"拔线"场景钉死：
 * 请求失败 / 4xx-5xx / 200 但不是 JSON（静态托管兜 index.html）都必须是「服务异常」。
 */
describe('NavigationMenu（底部状态灯：真实探测三态）', () => {
  it('degraded=true 时显示「服务降级」而非「服务正常」', async () => {
    stubBackend({ health: () => jsonResponse({ status: 'degraded', degraded: true }) });
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务降级')).toBeDefined());
    expect(screen.queryByText('服务正常')).toBeNull();
    // 降级时后端仍可达，版本号照常显示（不因为降级就不敢显示版本）
    expect(screen.getByText('v1.7.0')).toBeDefined();
  });

  it('后端不可达（网络层失败）时显示「服务异常」，版本显示「—」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务异常')).toBeDefined());
    expect(screen.queryByText('服务正常')).toBeNull();
    expect(screen.getByText('—')).toBeDefined();
  });

  it('/api/version 返回 500 时显示「服务异常」', async () => {
    stubBackend({ version: () => jsonResponse({ error: 'boom' }, 500) });
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务异常')).toBeDefined());
    expect(screen.queryByText('服务正常')).toBeNull();
  });

  it('/api/version 返回 200 但不是 JSON（SPA 兜底页）时也判「服务异常」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务异常')).toBeDefined());
    expect(screen.queryByText('服务正常')).toBeNull();
  });

  it('appVersion 缺失时版本渲染「—」，不回退硬编码字符串', async () => {
    stubBackend({ version: () => jsonResponse({ commit: 'abc1234' }) });
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务正常')).toBeDefined());
    expect(screen.getByText('—')).toBeDefined();
    expect(screen.queryByText('v1.0.0')).toBeNull();
  });

  it('挂载即探一次即止：60s 轮询不缩成毫秒级刷接口', async () => {
    const fn = stubBackend({});
    renderWithRouter();

    await waitFor(() => expect(screen.getByText('服务正常')).toBeDefined());
    expect(fn.mock.calls.some(([u]) => String(u).includes('/api/version'))).toBe(true);
    // 只做一次挂载探测 + 60s 定时器，不应在毫秒级内自我轮询刷接口
    const versionCalls = fn.mock.calls.filter(([u]) => String(u).includes('/api/version')).length;
    expect(versionCalls).toBe(1);
  });
});
