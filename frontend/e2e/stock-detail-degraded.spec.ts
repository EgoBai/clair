/**
 * 个股详情降级 e2e 守卫（stock-detail-degraded）
 *
 * 守的是什么：**后端取不到数据时，页面必须说「取不到」**——
 *   - 不得抛出未捕获运行时异常；
 *   - 不得把「请求失败」写成「该股票暂无K线行情数据」；
 *   - 不得把「取不到」渲染成行情/K线正常空态。
 *
 * 做法：用 context.route 把 /api/** 统一接管成 502 + 空 body，
 * 精确复现 CI 无后端（vite proxy 502 / 网关截断）时的真实形态：
 * 浏览器报 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`，
 * 该异常此前从 useEffect 里逃逸成 pageerror，CI e2e 因此红过。
 *
 * 与 honest-empty-states.spec.ts 互补：那边守「接口连通但数据缺失」，
 * 这边守「接口本身取不到」。
 */
import { test, expect } from '@playwright/test';

test('后端不可达（502 空响应）→ 行情/K线显示「取不到」，无未捕获异常', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // 502 + 空 body：与 CI 里 vite proxy 连不上 3001 时的响应形态一致
  await page.context().route('**/api/**', (route) =>
    route.fulfill({ status: 502, contentType: 'text/plain', body: '' }),
  );

  await page.goto('/stocks/600519', { waitUntil: 'domcontentloaded' });

  // 布局仍挂载（降级不是白屏）
  await expect(page.locator('.app-content')).toBeVisible({ timeout: 20000 });

  // 行情：明确说取不到，并透出 HTTP 状态，不冒充「该股没有行情」
  const stockError = page.locator('[data-testid="stock-data-error"]');
  await expect(stockError).toBeVisible({ timeout: 20000 });
  await expect(stockError).toContainText('取不到');
  await expect(stockError).toContainText('502');

  // K线：明确说取不到
  const klineError = page.locator('[data-testid="kline-error"]');
  await expect(klineError).toBeVisible({ timeout: 20000 });
  await expect(klineError).toContainText('取不到');

  // 反证：不得把请求失败写成「该股票暂无K线行情数据」
  await expect(page.locator('.app-content')).not.toContainText('该股票暂无K线行情数据');

  // 关键：无未捕获运行时异常（JSON 解析异常曾从这里逃逸）
  expect(pageErrors, '页面无未捕获运行时异常').toEqual([]);
});
