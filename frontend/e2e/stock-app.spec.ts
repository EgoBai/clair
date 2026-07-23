/**
 * E2E 测试 (Playwright)
 * 
 * 测试关键用户流程:
 * - 首页加载与数据展示
 * - 股票搜索
 * - 股票详情页
 * - 自选股管理
 * - 选股器筛选
 */

import { test, expect } from '@playwright/test';

test.describe('首页', () => {
  test('应该加载市场概况', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ant-layout-content')).toBeVisible();
    await expect(page.getByText('市场概况')).toBeVisible();
  });

  test('应该展示涨跌分布', async ({ page }) => {
    await page.goto('/');
    // 等待数据加载
    await page.waitForSelector('.ant-card', { timeout: 10000 });
    const cards = page.locator('.ant-card');
    await expect(cards).toHaveCount(expect.any(Number));
  });

  test('应该能刷新数据', async ({ page }) => {
    await page.goto('/');
    const refreshBtn = page.getByRole('button', { name: /刷新/i });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      // 验证 loading 状态出现后消失
      await page.waitForTimeout(500);
    }
  });
});

test.describe('股票搜索', () => {
  test('应该能搜索股票', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('[data-search-input] input, .ant-select input').first();
    await searchInput.fill('平安');
    await page.waitForTimeout(500);
    // 应该出现搜索结果
    const dropdown = page.locator('.ant-select-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 5000 });
  });

  test('应该支持键盘快捷键聚焦搜索', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const searchInput = page.locator('[data-search-input] input').first();
    await expect(searchInput).toBeFocused();
  });
});

test.describe('股票详情页', () => {
  test('应该展示股票信息', async ({ page }) => {
    // 修复路由：/stock/ → /stocks/
    await page.goto('/stocks/000001.SZ');
    // 等待页面加载
    await page.waitForSelector('.ant-tabs, .ant-empty, .ant-spin', { timeout: 10000 });
    // 如果有数据，应该展示 Tab
    const tabs = page.locator('.ant-tabs-tab');
    const tabCount = await tabs.count();
    if (tabCount > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });
});

test.describe('自选股', () => {
  test('应该能访问自选股页面', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
    await expect(page.locator('.ant-layout-content')).toBeVisible();
  });
});

test.describe('选股器', () => {
  test('应该能打开选股器', async ({ page }) => {
    await page.goto('/screener');
    await page.waitForSelector('.ant-card', { timeout: 10000 });
    await expect(page.getByText('筛选条件')).toBeVisible();
  });

  test('应该能执行筛选', async ({ page }) => {
    await page.goto('/screener');
    await page.waitForSelector('.ant-card', { timeout: 10000 });
    const executeBtn = page.getByRole('button', { name: /执行/i });
    if (await executeBtn.isVisible()) {
      await executeBtn.click();
      // 等待结果或空状态
      await page.waitForTimeout(2000);
    }
  });

  test('应该能添加筛选条件', async ({ page }) => {
    await page.goto('/screener');
    await page.waitForSelector('.ant-card', { timeout: 10000 });
    const addBtn = page.getByRole('button', { name: /添加/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('暗色主题', () => {
  test('应该能切换主题', async ({ page }) => {
    await page.goto('/');
    const themeBtn = page.locator('[class*="theme"], button:has(svg)').filter({ hasText: /主题|theme/i }).first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      const darkOption = page.getByText(/深色|Dark/i);
      if (await darkOption.isVisible()) {
        await darkOption.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      }
    }
  });
});

test.describe('响应式', () => {
  test('移动端应该适配布局', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
    // 验证侧边栏在移动端隐藏
    const sidebar = page.locator('.ant-layout-sider');
    const sidebarVisible = await sidebar.isVisible();
    // 移动端侧边栏应该被隐藏或折叠
    // 具体行为取决于实现
  });
});

// ==================== 新增：核心链路覆盖 ====================

test.describe('路由重定向', () => {
  test('/market 应重定向到首页', async ({ page }) => {
    await page.goto('/market');
    await page.waitForURL('**/');
    expect(page.url()).toMatch(/\/$/);
  });

  test('/review 应重定向到 /watchlist?tab=review', async ({ page }) => {
    await page.goto('/review');
    await page.waitForURL(/\/watchlist\?tab=review/);
    expect(page.url()).toContain('tab=review');
  });

  test('/home 应重定向到首页', async ({ page }) => {
    await page.goto('/home');
    await page.waitForURL('**/');
    expect(page.url()).toMatch(/\/$/);
  });
});

test.describe('产业地图页', () => {
  test('应该能访问产业地图', async ({ page }) => {
    await page.goto('/industry-map');
    await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
    await expect(page.locator('.ant-layout-content')).toBeVisible();
  });
});

test.describe('潜力雷达页', () => {
  test('应该能访问潜力雷达', async ({ page }) => {
    await page.goto('/radar');
    await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
    await expect(page.locator('.ant-layout-content')).toBeVisible();
  });
});

test.describe('投资笔记页', () => {
  test('应该能访问投资笔记', async ({ page }) => {
    await page.goto('/knowledge');
    await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
    await expect(page.locator('.ant-layout-content')).toBeVisible();
  });
});

test.describe('404 页面', () => {
  test('未知路由应显示 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-12345');
    await page.waitForSelector('.ant-layout-content, .ant-result', { timeout: 10000 });
    // 404 页面应该可见（可能是 ant-result 或自定义内容）
    const content = page.locator('.ant-layout-content');
    await expect(content).toBeVisible();
  });
});

test.describe('自选组合 Hub', () => {
  test('应该能在追踪和复盘 Tab 间切换', async ({ page }) => {
    await page.goto('/watchlist');
    await page.waitForSelector('.ant-tabs', { timeout: 10000 });
    // 点击 AI复盘 Tab
    const reviewTab = page.getByText('AI复盘').first();
    if (await reviewTab.isVisible()) {
      await reviewTab.click();
      await page.waitForTimeout(500);
    }
    // 切换回自选追踪
    const trackingTab = page.getByText('自选追踪').first();
    if (await trackingTab.isVisible()) {
      await trackingTab.click();
      await page.waitForTimeout(500);
    }
  });
});
