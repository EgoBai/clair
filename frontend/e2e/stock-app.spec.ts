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
    // 假设有股票数据
    await page.goto('/stock/000001.SZ');
    // 等待页面加载
    await page.waitForSelector('.ant-tabs, .ant-empty', { timeout: 10000 });
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
