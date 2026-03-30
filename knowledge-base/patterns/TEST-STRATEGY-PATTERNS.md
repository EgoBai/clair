# 测试策略模式

## 概述
A股行情分析网站的测试策略和模式总结，覆盖1800+测试用例。

## 测试金字塔

```
        E2E (Playwright)
       /              \
    集成测试 (API路由)
   /                    \
  单元测试 (工具/组件/Hook)
```

## 测试分类

### 后端测试 (993用例, 57文件)

| 类别 | 文件 | 用例数 |
|------|------|--------|
| 技术指标 | indicators.test.ts, technicalIndicatorsExtended.test.ts | 50+ |
| 数据校验 | dataValidation.test.ts, historicalDataValidator.test.ts | 63+ |
| 安全 | security*.test.ts, csrf.test.ts, securityUtils.test.ts | 50+ |
| API | api-integration.test.ts, apiEndpointsExtended.test.ts, apiValidation.test.ts | 59+ |
| 数据模型 | apiDataModels.test.ts, databaseModels.test.ts | 35+ |
| 业务逻辑 | backtest.test.ts, portfolio.test.ts, watchlist.test.ts | 50+ |
| 中间件 | middlewareComprehensive.test.ts, rateLimit.test.ts | 30+ |
| 高级功能 | advancedFeatures.test.ts, integrationLogic.test.ts | 44+ |
| 边界条件 | edgeCases.test.ts | 21+ |

### 前端测试 (812用例, 38文件)

| 类别 | 文件 | 用例数 |
|------|------|--------|
| 格式化 | formatters.test.ts, sharedFormatters.test.ts, dataTransform.test.ts | 108+ |
| 组件 | components.test.tsx, snapshots.test.tsx, componentLogic.test.ts | 59+ |
| Hooks | hookLogic.test.ts, shortcuts*.test.ts, gestureHooks.test.ts | 69+ |
| 状态 | storeExtended.test.ts, components.test.tsx | 28+ |
| 图表 | chartSystem.test.ts, chartComponents.test.ts, chartThemeExt.test.ts | 68+ |
| UI模式 | uiPatterns.test.ts, emptyStates.test.tsx | 44+ |
| 工具 | dataExport.test.ts, codeAudit.test.ts, swRegister.test.ts | 31+ |
| 性能/无障碍 | performance.test.ts, accessibility.test.ts, a11yCss.test.ts | 38+ |
| i18n | i18n.test.ts | 14+ |

## 测试模式

### 1. 数据模型验证模式
```typescript
// 验证数据结构完整性
it('应该包含必要字段', () => {
  const data = { symbol, name, price, ... };
  expect(data.symbol).toMatch(/^\d{6}$/);
  expect(data.price).toBeGreaterThan(0);
});
```

### 2. 边界条件模式
```typescript
// 测试零值、负值、极值、NaN
it('Infinity 和 NaN 应该被过滤', () => {
  const safe = (v: number) => Number.isFinite(v) ? v : 0;
  expect(safe(Infinity)).toBe(0);
  expect(safe(NaN)).toBe(0);
});
```

### 3. 浮点精度模式
```typescript
// 使用 toBeCloseTo 避免浮点误差
expect(100 * 1.1).toBeCloseTo(110, 5);
```

### 4. 异步模块导入模式
```typescript
it('应该导出函数', async () => {
  const mod = await import('../utils/module');
  expect(typeof mod.functionName).toBe('function');
});
```

### 5. 状态管理模式
```typescript
// 测试状态流转
it('应该正确管理状态', () => {
  let state = { loading: false, error: null, data: null };
  state = { ...state, loading: true };  // loading
  state = { ...state, loading: false, data: result };  // success
  expect(state.data).toBeTruthy();
});
```

## 最佳实践

1. **浮点数比较**: 始终用 `toBeCloseTo` 而非 `toBe`
2. **模块导入**: 用 `async import()` 避免 jsdom 环境问题
3. **Mock对象**: 确保 mock 包含所有被访问的属性
4. **边界值**: 零值、负值、NaN、Infinity、空数组、空字符串
5. **排序/筛选**: 验证边界条件和排序稳定性
6. **并发**: 测试 Set/Map 的去重和覆盖行为
