/**
 * 前端版本信息渲染测试（P0-VER）
 * ============================================================================
 * 守护的东西：
 *   1. 版本指示器**必须真的渲染到DOM 里**（不是「加了代码」就算完）。
 *      本单要解决的是「用户无法判断线上是不是最新版本」，
 *      而 AppLayout 的「关于」弹窗需要点开齿轮才能看到 —— 所以必须验证页脚常驻那一份。
 *   2. 诚实红线：取不到 commit 时必须显示「未知」，
 *      **不得**显示空白字符串，也**不得**显示看起来真实的假 sha。
 *      假 sha 会让「页面版本 vs 后端版本」的比对永远显示一致，等于把门禁焊死。
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// AppLayout 依赖大量全局环境（IntersectionObserver / matchMedia / fetch / WebSocket…）。
// 这里只关心「版本指示器有没有渲染出来」，故对无关依赖做最小 stub，
// 避免测试被与本单无关的浏览器 API 缺失打断。
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
  global.fetch = vi.fn(async () => {
    throw new Error('offline in test');
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 只渲染 AppLayout 的版本相关部分：整棵树太重，故直接渲染其内部组件不合适，
 *  这里退一步渲染真实 AppLayout（它才是版本信息的真实宿主）。 */
async function renderLayout() {
  const { AppLayout } = await import('../components/Layout/AppLayout');
  return render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
}

describe('buildInfo — 诚实降级', () => {
  it('构建期无 VITE_* 时，commitLabel 显示「未知」而非空白或假 sha', async () => {
    const { getBuildTimeInfo } = await import('../config/buildInfo');
    const info = getBuildTimeInfo();
    // 本地 dev / 未配置 CI 下 VITE_GIT_COMMIT_SHA 不存在
    expect(info.commitKnown === undefined || info.commit === null).toBe(true);
    expect(info.commitLabel).toBe('未知');
    expect(info.commitLabel).not.toMatch(/[0-9a-f]{7}/);
    expect(info.commitLabel.trim()).not.toBe('');
  });

  it('formatBuildInfoLabel 在 info 为 null 时仍输出可读文案，不返回空白', async () => {
    const { formatBuildInfoLabel } = await import('../config/buildInfo');
    const label = formatBuildInfoLabel(null);
    expect(label).toBe('版本未知');
    expect(label.trim()).not.toBe('');
  });

  it('commit 为脏值时不透传（不显示形似 sha 的垃圾字符串）', async () => {
    const { fetchBackendBuildInfo } = await import('../config/buildInfo');
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ commit: 'zzzzzzz', appVersion: '1.7.0' }),
    })) as unknown as typeof fetch;

    const info = await fetchBackendBuildInfo('');
    // commit 脏 → commitKnown 为 false 的等价表现：commit 为 null
    expect(info!.commit).toBeNull();
    expect(info!.commitLabel).toBe('未知');
    // 但 appVersion 是合法的，仍应被采用
    expect(info!.appVersion).toBe('1.7.0');
  });

  it('后端不可达时 fetchBackendBuildInfo 返回 null（不抛给调用方）', async () => {
    const { fetchBackendBuildInfo } = await import('../config/buildInfo');
    global.fetch = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    expect(await fetchBackendBuildInfo('')).toBeNull();
  });

  it('后端返回非 200 时返回 null', async () => {
    const { fetchBackendBuildInfo } = await import('../config/buildInfo');
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchBackendBuildInfo('')).toBeNull();
  });
});

describe('AppLayout — 版本信息真的渲染到 DOM', () => {
  // AppLayout 的依赖树很重（导航菜单 + AI 浮窗 + 全局搜索），jsdom 下单次渲染约数十秒。
  // 故把三处 DOM 断言合并到**一次**渲染里：重复渲染只会让这个文件慢三倍，
  // 而三处断言验的是同一份数据的三个出口。
  it('页脚常驻指示器 + 关于弹窗三项，均渲染出非空白且诚实的内容', async () => {
    await renderLayout();

    // --- 出口1：页脚常驻指示器（无需交互，这是本单的核心诉求）---
    const footer = await screen.findByTestId(
      'global-version-indicator',
      {},
      { timeout: 60_000 },
    );
    const footerText = footer.textContent ?? '';
    expect(footerText.trim()).not.toBe('');
    expect(footerText).not.toBe('undefined');
    expect(footerText).not.toBe('null');
    // 本地 dev 无 VITE_* 且后端不可达 → 必须显式显示「未知」
    expect(footerText).toContain('未知');
    // 绝不能是形似 sha 的字符串（诚实红线：没有就是没有）
    expect(footerText).not.toMatch(/\b[0-9a-f]{7,40}\b/);

    // --- 出口2：关于弹窗（antd Modal 懒渲染，必须先打开）---
    // 指示器自身的 onClick 即 setSettingsOpen(true)（见 AppLayout），直接点它。
    fireEvent.click(footer);
    const version = await screen.findByTestId('app-version', {}, { timeout: 60_000 });
    const commit = screen.getByTestId('app-commit');
    const buildTime = screen.getByTestId('app-build-time');

    for (const el of [version, commit, buildTime]) {
      expect((el.textContent ?? '').trim()).not.toBe('');
    }
    expect(commit.textContent).toBe('未知');
    expect(buildTime.textContent).toBe('未知');

    // 本单移除的版本双真源：「关于」弹窗里曾有字面量 v2.0.0，与后端 APP_VERSION 无关
    expect(version.textContent).not.toBe('v2.0.0');
  }, 120_000);
});