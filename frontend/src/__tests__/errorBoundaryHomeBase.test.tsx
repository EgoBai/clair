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
 *   B. 源码层：现存错误边界里必须是 `location.href = import.meta.env.BASE_URL`，
 *      不允许再出现 `location.href = '/'` 这种写死站点根的写法。
 *      （为什么需要 B：测试环境 BASE_URL 恒为 '/'，光靠 A 无法证伪「写死 /」。）
 *   C. 防复发：src 下不得存在「同名只差大小写 / 扩展名」的模块文件
 *      （大小写不敏感文件系统上 import 解析歧义，见下方 utils 案例）。
 *
 * 说明：`frontend/src/utils/ErrorBoundary.tsx` 已于本轮回合删除——它与
 * `utils/errorBoundary.ts` 仅大小写不同，macOS 上 `../utils/ErrorBoundary` 会解析到
 * 小写那个「错误分类工具」模块（组件拿到 undefined），CI 上则相反，属跨平台地雷；
 * 且全仓无人 import，与 `components/ErrorBoundary.tsx`(SafePage)、
 * `UnifiedErrorBoundary` 三套职责重叠。故断言 C 覆盖该类冲突，不再对已删文件做校验。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import CommonErrorBoundary from '../components/Common/ErrorBoundary';
import EnhancedErrorBoundary from '../components/Common/EnhancedErrorBoundary';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');

/** 现存、且真实带「返回首页」的错误边界（utils/ErrorBoundary.tsx 已删除，见文件头说明） */
const BOUNDARY_SOURCES = [
  'components/Common/ErrorBoundary.tsx',
  'components/Common/EnhancedErrorBoundary.tsx',
];

/**
 * 找出「同一目录下模块名（去扩展名后）仅大小写不同」的文件对。
 * 这类文件在大小写不敏感文件系统（macOS/Windows）上，`import './Foo'` 的解析结果
 * 与大小写敏感的 Linux/CI 不一致 —— 典型症状是「本地能跑 CI 挂」或「两边都能跑但
 * 拿到不同的东西」。utils/ErrorBoundary.tsx vs utils/errorBoundary.ts 就是实例。
 *
 * 【断言边界 —— 显式声明，勿误以为覆盖全仓】
 * 刻意**跳过** `node_modules`、`__tests__` 目录与 `*.test.*` 文件。原因：
 * `frontend/src/__tests__/` 下已存在 11 组同类大小写同名测试文件（如
 * ErrorBoundary.test.tsx + errorBoundary.test.ts），它们不被任何生产代码 import，
 * vitest 按完整路径各自收集、两边都会跑，**没有模块解析歧义风险**，属维护性债务
 * （已在 P2-5 待办），不纳入本断言。因此本断言的实际覆盖范围是：
 * `frontend/src/**` 中 `__tests__` 之外的所有 .ts/.tsx/.js/.jsx —— 当前 0 冲突。
 */
function findStemCollisions(root: string): string[] {
  const EXT = /\.(ts|tsx|js|jsx)$/;
  const collisions: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!EXT.test(entry.name) || /\.test\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;

      // 同目录内找同名不同大小写的兄弟
      const siblings = readdirSync(dir).filter(
        (n) => EXT.test(n) && n.replace(EXT, '').toLowerCase() === entry.name.replace(EXT, '').toLowerCase() && n !== entry.name,
      );
      if (siblings.length > 0) {
        const desc = `${full} ↔ ${siblings.map((s) => join(dir, s)).join(' , ')}`;
        if (!collisions.includes(desc)) collisions.push(desc);
      }
    }
  };

  walk(root);
  return collisions;
}

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
    // 错误边界捕获后会尝试上报（fetch 相对路径），jsdom 下会抛 ERR_INVALID_URL，
    // 桩掉以免日志噪音 / 偶发失败
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

  it('源码层：现存错误边界的「返回首页」必须用 import.meta.env.BASE_URL，禁止写死 /', () => {
    // 防止「文件被挪走」导致本断言空转
    expect(BOUNDARY_SOURCES.length).toBeGreaterThanOrEqual(2);
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

  it('防复发：src 下不得存在「同名只差大小写/扩展名」的模块文件（解析歧义地雷）', () => {
    // 覆盖范围：frontend/src/** 中 __tests__ 之外的所有脚本文件（不含 *.test.*），
    // 详见 findStemCollisions() 上方「断言边界」说明
    const collisions = findStemCollisions(SRC);
    expect(
      collisions,
      `以下文件在同一目录内仅大小写不同，会导致 import 解析在 macOS 与 Linux/CI 上指向不同模块：\n${collisions.join('\n')}`,
    ).toEqual([]);
  });

  it('utils/ErrorBoundary.tsx（大小写冲突死代码）已删除，且保留小写的错误分类工具', () => {
    const utilsDir = resolve(SRC, 'utils');
    const names = readdirSync(utilsDir);
    expect(
      names.filter((n) => n.toLowerCase() === 'errorboundary.tsx'),
      'utils/ErrorBoundary.tsx 应已删除（与 errorBoundary.ts 仅大小写不同，跨平台解析歧义）',
    ).toEqual([]);
    expect(names, 'utils/errorBoundary.ts（错误分类工具）必须保留').toContain('errorBoundary.ts');
  });
});
