/**
 * 路由真实渲染冒烟测试（route-render-smoke）
 *
 * 目的：补上「curl 200」无法覆盖的真实渲染守卫。
 *
 * 背景：本项目是 Vite SPA，任意路径都会命中 index.html fallback，
 * 因此 `curl -s -o /dev/null -w "%{http_code}"` 对 28 条路由恒返回 200，
 * 即便页面白屏、组件抛错、路由根本没注册，curl 依然全绿。
 * 本文件用真实浏览器渲染 + 可重试断言，验证每条路由「真的渲染出来了」。
 *
 * 每条路由断言（比 curl 更强）：
 *   1) `.app-content`（真实主内容容器，非 antd 的 .ant-layout-content）可见 —— 证明 AppLayout 与路由组件挂载成功
 *   2) `.content-wrapper` 非空 —— 排除路由组件渲染 null 导致的白屏漏网
 *   3) 页面无未捕获运行时异常 —— 监听 page.on('pageerror') 收集，断言为空
 *   4) 未落入 React 错误边界 —— 检查页面不含「X 渲染失败 / 组件渲染异常」兜底文案
 *      （项目错误边界组件为 src/components/Common/UnifiedErrorBoundary.tsx，
 *       崩溃时渲染 antd Result，title = `${name} 渲染失败`）
 *
 * 反向用例：访问不存在的路由 /definitely-not-a-route-xyz123，
 * 断言它渲染出 404 兜底页（.not-found-page），而非正常业务内容。
 * 这正是 curl 的盲区：curl 对该 URL 同样返回 200，本测试却能证伪「假绿」。
 */

import { test, expect } from '@playwright/test';

// 真实存在的标的，用于替换参数化路由 :symbol
const SAMPLE = {
  STOCK: '600519',   // 贵州茅台
  INDEX: '000001',   // 上证指数
  SECTOR: '801010',  // 申万一级行业
};

// 28 条目标路由（取自 src/routes/paths.ts 的 ROUTE_PATHS；参数化路由以真实标的替换）
// 静态路由（27 条）
const STATIC_ROUTES = [
  '/',
  '/market',
  '/screener',
  '/watchlist',
  '/review',
  '/stocks',
  '/backtest',
  '/strategies',
  '/industry-map',
  '/compare',
  '/lockup-calendar',
  '/top-traders',
  '/margin-trading',
  '/portfolio',
  '/macro',
  '/event-calendar',
  '/risk-center',
  '/report-center',
  '/north-bound',
  '/factor-lab',
  '/hk-connect',
  '/etf',
  '/fund-flow',
  '/macro-hub',
  '/journey',
  '/radar',
  '/knowledge',
];

// 参数化路由（4 条），以真实标的替换 :symbol
const PARAM_ROUTES = [
  `/stocks/${SAMPLE.STOCK}`,
  `/financials/${SAMPLE.STOCK}`,
  `/index/${SAMPLE.INDEX}`,
  `/sectors/${SAMPLE.SECTOR}`,
];

const ALL_ROUTES = [...STATIC_ROUTES, ...PARAM_ROUTES];

// 单条路由的「真实渲染」守卫。失败时能精确定位到具体路由。
for (const route of ALL_ROUTES) {
  test(`路由真实渲染：${route}`, async ({ page }) => {
    // 3) 收集未捕获运行时异常（页面级 pageerror，非 console 警告）
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 进入路由（SPA，baseURL 已在 playwright.config 设为 http://localhost:5173）
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // 1) 布局与路由容器已挂载（.app-content 是 src/components/Layout/AppLayout 的 <main>，非 .ant-layout-content）
    await expect(page.locator('.app-content'), '布局主容器 .app-content 可见').toBeVisible({
      timeout: 20000,
    });

    // 等待懒加载 chunk + 首屏渲染完成：外层 Suspense 骨架（antd Skeleton）卸载即代表组件已挂载。
    // 注意：必须用可重试等待，不能用一次性 count()——异步加载时 count() 会拿到 0（见 stock-app.spec.ts 注释坑）。
    await page
      .waitForSelector('.app-content .ant-skeleton', { state: 'detached', timeout: 20000 })
      .catch(() => {
        // 若骨架未出现（部分页面无 Suspense 骨架或极快渲染）也不阻塞，交给后续断言判断
      });

    // 2) 非空白守卫：路由组件渲染后 .content-wrapper 内应有真实内容，排除「组件返回 null 白屏」
    await expect(page.locator('.content-wrapper'), '路由内容容器非空（排除白屏）').not.toBeEmpty({
      timeout: 10000,
    });

    // 2b) 反 404 退化守卫（第101轮主理人探针补强）：
    // 实测证明 404 兜底页同样满足「content-wrapper 非空 + 无错误边界文案」，
    // 若某条路由因未注册/被摘除而静默落到 NotFoundPage，仅靠上面两条断言会漏网判为「真实渲染」。
    // 故显式断言当前页不是 404 兜底页——这是本守卫真正能捕获「路由死链」的关键。
    await expect(
      page.locator('.not-found-page'),
      `路由 ${route} 不应退化为 404 兜底页（路由死链守卫）`,
    ).toHaveCount(0);

    // 4) 未落入 React 错误边界（组件崩溃时兜底文案为「X 渲染失败」/「组件渲染异常」）
    await expect(page.locator('.app-content'), '未触发页面级错误边界').not.toContainText(
      /渲染失败|组件渲染异常/,
      { timeout: 5000 },
    );

    // 3) 断言无未捕获运行时异常
    expect(pageErrors, '页面无未捕获运行时异常').toEqual([]);
  });
}

// 反向用例（整个测试的价值证明）：不存在的路由应渲染 404 兜底页，而非被当作「真实渲染」通过。
test('反向用例：不存在的路由渲染 404 兜底页（curl 对此同样返回 200，本测试能证伪）', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/definitely-not-a-route-xyz123', { waitUntil: 'domcontentloaded' });

  // 布局仍挂载（SPA fallback 会渲染 AppLayout）
  await expect(page.locator('.app-content')).toBeVisible({ timeout: 20000 });

  // 关键：必须渲染出 404 兜底页，证明该路由不是「真实业务页面」
  // NotFoundPage 渲染 .not-found-page（含「404」「页面未找到」）
  await expect(
    page.locator('.not-found-page'),
    '不存在路由应渲染 404 兜底页，而非正常业务内容',
  ).toBeVisible({ timeout: 20000 });

  // 兜底 404 文案存在
  await expect(page.locator('.app-content')).toContainText(/404|页面未找到/);

  // 不应含页面级错误边界崩溃文案
  await expect(page.locator('.app-content')).not.toContainText(/渲染失败|组件渲染异常/);

  expect(pageErrors, '页面无未捕获运行时异常').toEqual([]);
});
