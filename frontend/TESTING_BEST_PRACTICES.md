# 测试最佳实践

## 概述

本文档记录了A股行情分析网站项目的测试最佳实践、工具配置和测试策略。

## 测试框架

### Vitest
- 使用Vitest作为测试运行器
- 配置见 `vitest.config.ts`
- 支持TypeScript、ESM、JSX

### 测试结构
```
src/
├── __tests__/          # 测试文件目录
│   ├── formatters.test.ts
│   ├── requestUtils-typed.test.ts
│   └── ...
├── utils/              # 工具函数
│   ├── formatters.ts
│   └── requestUtils-typed.ts
└── ...
```

## 测试编写指南

### 1. 测试文件命名
- 使用 `.test.ts` 或 `.spec.ts` 后缀
- 测试文件与被测文件同名或描述其功能

### 2. 测试结构
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { functionToTest } from '../path/to/module';

describe('模块名称', () => {
  beforeEach(() => {
    // 测试前准备
  });

  afterEach(() => {
    // 测试后清理
    vi.restoreAllMocks();
  });

  describe('功能子集', () => {
    it('应该完成某个功能', () => {
      // 准备
      const input = 'test';
      
      // 执行
      const result = functionToTest(input);
      
      // 断言
      expect(result).toBe('expected');
    });
  });
});
```

### 3. 测试用例命名
- 使用描述性名称
- 遵循 "should [行为] when [条件]" 模式
- 示例：
  - `should format price with 2 decimals`
  - `should handle null input gracefully`
  - `should throw error when invalid argument provided`

### 4. 断言最佳实践
- 使用明确的断言
- 避免过度断言
- 优先使用特定断言而非通用断言

```typescript
// 好
expect(result).toBe('expected');
expect(array).toHaveLength(3);
expect(object).toHaveProperty('key', 'value');

// 不好
expect(!!result).toBe(true);
expect(array.length > 0).toBe(true);
```

### 5. Mocking最佳实践
- 只在必要时使用mock
- 使用 `vi.fn()` 创建模拟函数
- 使用 `vi.spyOn()` 监视现有方法
- 测试后清理mock

```typescript
// 创建mock函数
const mockFn = vi.fn();

// 监视对象方法
const spy = vi.spyOn(console, 'log');

// 模拟模块
vi.mock('../path/to/module', () => ({
  default: vi.fn(),
  namedExport: 'mockValue',
}));
```

### 6. 异步测试
- 使用 `async/await` 处理异步代码
- 使用 `vi.useFakeTimers()` 测试定时器

```typescript
describe('异步函数', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该处理异步操作', async () => {
    const promise = asyncFunction();
    vi.advanceTimersByTime(100);
    const result = await promise;
    expect(result).toBe('expected');
  });
});
```

## 测试覆盖率

### 覆盖率目标
- 语句覆盖率: ≥ 80%
- 分支覆盖率: ≥ 70%
- 函数覆盖率: ≥ 85%
- 行覆盖率: ≥ 80%

### 运行覆盖率报告
```bash
# 运行测试并生成覆盖率报告
npm test -- --coverage

# 查看HTML报告
open coverage/index.html
```

## 工具函数测试模式

### 1. 格式化函数测试
```typescript
describe('formatNumber', () => {
  it('应该格式化带2位小数的价格', () => {
    expect(formatNumber(99.567)).toBe('99.57');
  });

  it('应该处理自定义小数位数', () => {
    expect(formatNumber(99.567, 3)).toBe('99.567');
  });

  it('应该处理零值', () => {
    expect(formatNumber(0)).toBe('0.00');
  });

  it('应该处理null输入', () => {
    expect(formatNumber(null)).toBe('--');
  });
});
```

### 2. 工具类测试
```typescript
describe('RequestBatcher', () => {
  let batcher: RequestBatcher<string, string>;
  let batchFn: Mock;

  beforeEach(() => {
    batchFn = vi.fn(async (args: string[]) => args.map(arg => `processed:${arg}`));
    batcher = new RequestBatcher(batchFn, 100);
  });

  it('应该批量处理请求', async () => {
    const promise1 = batcher.request('request1');
    const promise2 = batcher.request('request2');
    
    vi.advanceTimersByTime(100);
    
    const results = await Promise.all([promise1, promise2]);
    expect(results).toEqual(['processed:request1', 'processed:request2']);
  });
});
```

### 3. 边界条件测试
```typescript
describe('边界条件', () => {
  it('应该处理空数组', () => {
    expect(processArray([])).toEqual([]);
  });

  it('应该处理null或undefined输入', () => {
    expect(processValue(null)).toBe('default');
    expect(processValue(undefined)).toBe('default');
  });

  it('应该处理极大值', () => {
    expect(formatLargeNumber(Number.MAX_SAFE_INTEGER)).toBe('9.01e+15');
  });

  it('应该处理极小值', () => {
    expect(formatSmallNumber(0.0000001)).toBe('1e-7');
  });
});
```

## CI/CD集成

### GitHub Actions配置
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - run: npm run lint
```

### 预提交钩子
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run lint && npm test"
    }
  }
}
```

## 常见问题解决

### 1. 测试失败：类型错误
**问题**：TypeScript类型错误导致测试失败
**解决**：
- 确保测试文件导入正确的类型
- 使用类型断言处理测试数据
- 更新类型定义以匹配实现

### 2. 测试失败：异步超时
**问题**：异步测试超时
**解决**：
- 增加测试超时时间
- 确保所有Promise都被正确处理
- 使用 `vi.advanceTimersByTime()` 控制定时器

### 3. 测试失败：Mock不工作
**问题**：Mock函数没有被正确调用
**解决**：
- 检查mock作用域
- 确保在测试前设置mock
- 使用 `vi.clearAllMocks()` 清理状态

### 4. 测试不稳定（Flaky Tests）
**问题**：测试有时通过有时失败
**解决**：
- 避免依赖外部服务
- 使用固定的测试数据
- 控制随机性（使用固定种子）
- 隔离测试环境

## 性能优化

### 1. 测试分组
```typescript
// 将相关测试分组，减少setup/teardown开销
describe('formatters', () => {
  describe('formatNumber', () => { /* tests */ });
  describe('formatDate', () => { /* tests */ });
});
```

### 2. 共享fixture
```typescript
const createTestData = () => ({
  user: { id: 1, name: 'Test User' },
  stock: { code: '600036', name: '招商银行' },
});

describe('使用共享fixture', () => {
  const testData = createTestData();
  
  it('应该处理用户数据', () => {
    expect(processUser(testData.user)).toBeDefined();
  });
  
  it('应该处理股票数据', () => {
    expect(processStock(testData.stock)).toBeDefined();
  });
});
```

### 3. 并行测试
- Vitest默认并行运行测试
- 使用 `describe.concurrent` 并行运行测试套件
- 注意测试隔离，避免状态共享

## 代码审查检查清单

### 测试代码审查
- [ ] 测试覆盖所有主要功能
- [ ] 测试包含边界条件
- [ ] 测试包含错误处理
- [ ] 测试命名清晰描述性
- [ ] 测试独立且可重复
- [ ] 没有冗余或重复测试
- [ ] Mock使用恰当
- [ ] 异步测试正确处理
- [ ] 测试代码遵循项目规范

### 新功能测试要求
- [ ] 为新功能编写测试
- [ ] 测试覆盖正常流程
- [ ] 测试覆盖错误流程
- [ ] 测试包含类型检查
- [ ] 更新相关现有测试
- [ ] 测试通过CI流水线

## 参考资料

- [Vitest文档](https://vitest.dev/)
- [Testing Library最佳实践](https://testing-library.com/docs/)
- [Jest文档](https://jestjs.io/)（Vitest兼容API）
- [TypeScript测试指南](https://www.typescriptlang.org/docs/handbook/testing.html)