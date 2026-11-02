/**
 * 错误边界「返回首页」必须带 BASE_URL —— 回归守卫
 *
 * 背景（生产真实故障）：应用部署在 GitHub Pages 项目站点 `/clair/`。
 * 三个错误边界的「返回首页」曾写死 `window.location.href = '/'`，
 * 深链页面一崩、用户点「返回首页」就会被带出 `/clair/`，落到站点根
 * `https://egobai.github.io/`，浏览器拿到 GitHub 通用 404
 * （正文 “There isn't a GitHub Pages site here.”）。
 * 修复见 f0c9ee9d1，本文件负责防止回归。
 *
 * 两层断言：
 *   A. 行为层：点「返回首页」确实发生了导航，且目标 === import.meta.env.BASE_URL；
 *   B. 源码层：三个文件里必须是 `location.href = import.meta.env.BASE_URL`，
 *      不允许再出现 `location.href = '/'` 这种写死站点根的写法。
 *      （为什么需要 B：测试环境 BASE_URL 恒为 '/'，光靠 A 无法证伪「写死 /」。）
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import CommonErrorBoundary from '../components/Common/ErrorBoundary';
// 必须带 .tsx 显式扩展名：src/utils/ 下同时存在 ErrorBoundary.tsx 与 errorBoundary.ts
// （仅大小写不同）。macOS 大小写不敏感文件系统上，`../utils/ErrorBoundary` 会解析到
// 小写那个「错误分类工具」模块（导出 classifyError 等），拿不到组件；Linux 上则相反。
// 显式扩展名可让本测试在两个平台都稳定指向组件。
import UtilErrorBoundary from '../utils/ErrorBoundary.tsx';
import EnhancedErrorBoundary from '../components/Common/EnhancedErrorBoundary';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');

const BOUNDARY_SOURCES = [
  'utils/ErrorBoundary.tsx',
  'components/Common/ErrorBoundary.tsx',
  'components/Common/EnhancedErrorBoundary.tsx',
];

const Boom: React.FC = () => {
  throw new Error('渲染崩溃（测试构造）');
};

/** jsdom 的 location 不可写，替换成可写桩以捕获导航目标 */
let navigatedTo = '';
const originalLocation = window.location;

function installLocationStub() {
  navigatedTo = '';
  // @ts-expect-error 测试桩：jsdom 允许 delete window.location 后重新赋值
  delete (window as any).location;
  (window as any).location = {
    href: '',
    assign: (v: string) => { navigatedTo = v; },
    reload: vi.fn(),
  };
  Object.defineProperty((window as any).location, 'href', {
    configurable: true,
    get: () => navigatedTo,
    set: (v: string) => { navigatedTo = v; },
  });
}

describe('错误边界「返回首页」走 BASE_URL（GitHub Pages 项目站点不得跳出 /clair/）', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // utils/ErrorBoundary 的 componentDidCatch 会 POST /api/error-report，
    // jsdom 下相对 URL 会抛 ERR_INVALID_URL，桩掉以免噪音/偶发失败
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
    installLocationStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  const cases: Array<[string, React.ComponentType<any>]> = [
    ['components/Common/ErrorBoundary', CommonErrorBoundary],
    ['components/Common/EnhancedErrorBoundary', EnhancedErrorBoundary],
    ['utils/ErrorBoundary', UtilErrorBoundary],
  ];

  for (const [name, Boundary] of cases) {
    it(`${name}：点「返回首页」导航目标 === BASE_URL，而非站点根 '/'`, () => {
      const { container } = render(<Boundary><Boom /></Boundary>);
      const buttons = Array.from(container.querySelectorAll('button'));
      const homeBtn = buttons.find((b) => /返\s*回\s*首\s*页/.test(b.textContent || ''));
      expect(homeBtn, `${name} 降级 UI 应有「返回首页」按钮`).toBeDefined();

      fireEvent.click(homeBtn!);
      expect(navigatedTo).toBe(import.meta.env.BASE_URL);
      // 双保险：BASE_URL 为 '/' 时这条分支不额外约束；非 '/'（生产 /clair/）时必须带前缀
      if (import.meta.env.BASE_URL !== '/') {
        expect(navigatedTo.startsWith(import.meta.env.BASE_URL)).toBe(true);
      }
      expect(screen.getByText(/渲染崩溃（测试构造）/)).toBeDefined();
    });
  }

  it('源码层：三处「返回首页」必须用 import.meta.env.BASE_URL，禁止写死 /', () => {
    for (const rel of BOUNDARY_SOURCES) {
      const code = readFileSync(resolve(SRC, rel), 'utf8');
      expect(
        /location\.href\s*=\s*import\.meta\.env\.BASE_URL/.test(code),
        `${rel} 应使用 import.meta.env.BASE_URL 作为返回首页目标`,
      ).toBe(true);
      expect(
        /location\.href\s*=\s*['"]\/['"]/.test(code),
        `${rel} 不应再出现写死站点根的 location.href = '/'`,
      ).toBe(false);
    }
  });
});
