# 测试策略设计文档

## 概述

A股行情分析网站采用多层测试策略，确保代码质量和系统稳定性。

## 测试金字塔

```
         ╱╲
        ╱ E2E ╲         (少量, Playwright)
       ╱────────╲
      ╱ 集成测试  ╲      (中等, API测试)
     ╱──────────────╲
    ╱   单元测试     ╲    (大量, Vitest)
   ╱────────────────────╲
```

## 测试覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| 后端工具函数 | 90%+ |
| 后端API路由 | 80%+ |
| 前端组件 | 70%+ |
| 前端Hooks | 85%+ |
| 前端工具函数 | 90%+ |
| **总体目标** | **80%+** |

## 后端测试

### 工具函数测试
- `indicators.test.ts` - 技术指标计算 (25+ 用例)
- `search.test.ts` - 搜索匹配算法 (8种模式)
- `queryCache.test.ts` - 缓存命中/过期
- `dataValidation.test.ts` - 数据异常检测
- `exRights.test.ts` - 复权计算 (25+ 用例)
- `backtest.test.ts` - 回测引擎
- `aiMarketAnalysis.test.ts` - AI分析
- `portfolio.test.ts` - 投资组合
- `news.test.ts` - 新闻分析

### API集成测试
- `api-integration.test.ts` - 端到端API测试
- 股票搜索/行情/选股器/限流验证

### 安全测试
- `security.test.ts` - 安全中间件
- `securityEnhanced.test.ts` - 增强安全检测
  - SQL注入检测
  - XSS攻击检测
  - 路径遍历检测
  - 速率限制
  - 安全响应头

## 前端测试

### 组件测试
- `components.test.tsx` - Zustand Store + 自选股 + URL同步
- `snapshots.test.tsx` - 快照测试 (格式化/空状态/骨架屏)

### 工具函数测试
- `formatters.test.ts` - 格式化函数全覆盖
- `shortcuts.test.ts` - 快捷键映射完整性
- `webVitals.test.ts` - 性能指标阈值
- `performance.test.ts` - 虚拟列表/防抖/批量更新
- `accessibility.test.ts` - ARIA/焦点/色彩对比度
- `offline.test.ts` - 离线缓存/队列
- `pwa.test.ts` - PWA功能

### E2E测试
- `stock-app.spec.ts` - Playwright端到端测试
  - 首页加载
  - 搜索功能
  - 股票详情
  - 自选股
  - 选股器
  - 暗色主题
  - 移动端适配

## 测试配置

### 后端 Vitest
```typescript
// backend/src/vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

### 前端 Vitest
```typescript
// frontend/vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.test.ts(x)?'],
  },
});
```

### Playwright
```typescript
// frontend/playwright.config.ts
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
],
```

## 测试编写规范

### 命名规范
- 测试文件: `*.test.ts` / `*.test.tsx`
- 测试套件: `describe('模块名', () => {})`
- 测试用例: `it('应xxx', () => {})`

### 断言风格
```typescript
// 好的
expect(result).toBe(expected);
expect(array).toContain(item);
expect(value).toBeCloseTo(1.23, 2);

// 避免
expect(result == expected).toBe(true);
```

### 边界条件
每个函数测试应包含:
- 正常输入
- 边界值 (0, 负数, 最大值)
- 空值 (null, undefined, 空数组)
- 异常输入 (超长字符串, 特殊字符)

## CI/CD 测试集成

GitHub Actions 自动运行:
1. `npm run lint` - 代码检查
2. `npm run typecheck` - 类型检查
3. `npm run test` - 单元测试
4. `npm run build` - 构建验证
5. `npx playwright test` - E2E测试 (仅main分支)

## 测试维护

- 新功能必须包含测试
- Bug修复必须包含回归测试
- 定期审查测试覆盖率
- 清理过时/无用测试
- 保持测试运行时间 < 60秒
