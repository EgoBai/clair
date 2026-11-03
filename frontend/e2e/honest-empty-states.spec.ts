/**
 * 诚实空态 e2e 守卫（honest-empty-states）
 *
 * 守的是什么：**数据取不到时，页面必须说「取不到」**——
 *   - 不能把「请求失败」写成「本期确实没有解禁记录」；
 *   - 不能拿后端 unavailable 响应里常带的 0 值 summary 当统计卡展示；
 *   - 不能把「结构解析失败」混成「暂无数据」。
 * 三类事实互不冒充，是本仓库诚实红线（AGENTS.md 红线 1）的页面级验收。
 *
 * 做法：用 Playwright 路由拦截把 /api/lockup/calendar 固定成三种「数据缺失」形态，
 * 断言每种形态渲染的降级文案，同时断言**另一形态的文案不出现**、统计卡不出现、
 * 表格无数据行——「没有拿 0 / 假数据顶替」由这几条反证。
 *
 * 为什么选 /lockup-calendar：该页的降级路径是**既有实现**
 * （frontend/src/pages/LockupCalendarPage.tsx 的 resolveLockupEmptyView 四档文案
 * + apiStatus.ts 的三类判定），本文件只验证它，不新增任何页面逻辑、不改前端源码。
 *
 * 注意：本文件不依赖后端是否启动/是否有真实数据 —— 请求被路由拦截接管，
 * 因此在 CI（无后端）与本地（有后端）跑出的结果一致。
 */

import { test, expect, type Page } from '@playwright/test';

/** 解禁日历的唯一取数端点（见 LockupCalendarPage.tsx:279） */
const LOCKUP_API = /\/api\/lockup\/calendar(\?|$)/;

/**
 * 在导航前接管取数端点，返回指定的 HTTP 状态与响应体。
 *
 * 用 context 级 route（而非 page.route）：本机实测 Playwright 1.61.1 + 当前
 * Chromium 构建下 page.route 注册的 handler 一次都不触发（hits=0，请求直连后端），
 * context.route 正常（hits=2）。context 是 test fixture 每用例独立创建的，隔离性不受影响。
 */
async function stubLockupApi(
  page: Page,
  response: { status: number; body: string },
): Promise<void> {
  await page.context().route(LOCKUP_API, (route) =>
    route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: response.body,
    }),
  );
}

test.describe('诚实空态：解禁日历的数据缺失降级', () => {
  test('请求失败（HTTP 503）→ 显示「请求失败」，不冒充「本期没有解禁记录」，不显示 0 值统计卡', async ({
    page,
  }) => {
    await stubLockupApi(page, {
      status: 503,
      body: JSON.stringify({ success: false, error: '上游报表服务不可用' }),
    });

    await page.goto('/lockup-calendar');

    // 页面级状态提示：三类形态经 ApiStatusNotice 统一出口渲染，kind=failed
    await expect(page.locator('[data-testid="api-status-notice"]')).toHaveAttribute(
      'data-status',
      'failed',
    );

    const placeholder = page.locator('.ant-table-placeholder');
    await expect(placeholder).toContainText('解禁数据请求失败');
    await expect(placeholder).toContainText('不代表本月没有解禁记录');
    // 反证：不得把「请求失败」冒充成「确实没有」
    await expect(placeholder).not.toContainText('本期确实没有解禁记录');
    await expect(placeholder).not.toContainText('暂无可用数据');

    // 反证：取不到数时不得出现统计卡（后端 unavailable 的 summary 常带 0 值，
    // 拿 0 顶替「取不到」即造假）
    await expect(page.locator('.ant-statistic')).toHaveCount(0);
    await expect(page.locator('.ant-table-tbody .ant-table-row')).toHaveCount(0);
  });

  test('接口已连通但取不到（dataSource=unavailable）→ 显示「暂无可用数据」并透出服务端原文', async ({
    page,
  }) => {
    await stubLockupApi(page, {
      status: 200,
      body: JSON.stringify({
        success: false,
        dataSource: 'unavailable',
        message: '报表不可达：上游超时',
        // 刻意带上 0 值 summary：后端 emptyCalendar 会给 totalStocks:0 等，
        // 页面必须不展示它（LockupCalendarPage.tsx 的 visibleSummary 守卫）。
        data: {
          expiries: [],
          summary: {
            totalStocks: 0,
            totalEvents: 0,
            totalMarketValue: 0,
            totalShares: 0,
            avgUnlockRatio: 0,
          },
        },
      }),
    });

    await page.goto('/lockup-calendar');

    await expect(page.locator('[data-testid="api-status-notice"]')).toHaveAttribute(
      'data-status',
      'unavailable',
    );

    const placeholder = page.locator('.ant-table-placeholder');
    await expect(placeholder).toContainText('暂无可用数据');
    // 服务端原文必须透出，不能由前端代拟原因
    await expect(placeholder).toContainText('报表不可达：上游超时');
    await expect(placeholder).toContainText('未使用任何模拟值或 0 值填充');
    // 反证：「接口连通但取不到」不得被写成「确实没有」
    await expect(placeholder).not.toContainText('本期确实没有解禁记录');

    await expect(page.locator('.ant-statistic')).toHaveCount(0);
  });

  test('响应结构异常 → 显示「数据格式异常」，不混成「暂无解禁记录」', async ({ page }) => {
    await stubLockupApi(page, {
      status: 200,
      body: JSON.stringify({ success: true, dataSource: 'real', data: {} }),
    });

    await page.goto('/lockup-calendar');

    const placeholder = page.locator('.ant-table-placeholder');
    await expect(placeholder).toContainText('数据格式异常');
    await expect(placeholder).toContainText('这不是「暂无解禁记录」');
    // 反证：结构坏了 ≠ 没有记录
    await expect(placeholder).not.toContainText('本期确实没有解禁记录');
    await expect(placeholder).not.toContainText('暂无可用数据');

    await expect(page.locator('.ant-statistic')).toHaveCount(0);
  });
});
