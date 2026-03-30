# 测试覆盖率扩展策略

## 概述

本文档总结 A股行情分析网站从 3910 测试扩展到 4200+ 测试的方法论。

## 核心原则

### 1. 源文件驱动的测试创建
- 扫描所有未被测试覆盖的源文件
- 优先覆盖 API 路由、工具函数、业务逻辑
- 每个新测试文件目标 15-30 个测试用例

### 2. 测试分类
| 类型 | 占比 | 示例 |
|------|------|------|
| API 逻辑测试 | 40% | 路由参数验证、响应格式、排序逻辑 |
| 工具函数测试 | 25% | 格式化、计算、转换 |
| 组件逻辑测试 | 20% | 虚拟滚动、热力图计算、图表渲染 |
| 中间件测试 | 15% | 安全、限流、验证 |

### 3. Vitest 测试模式

```typescript
// ✅ 好的模式：纯逻辑测试，无外部依赖
describe('Feature Logic', () => {
  it('should calculate X correctly', () => {
    const result = calculateX(input);
    expect(result).toBe(expected);
  });
});

// ✅ 数据驱动测试
it.each([
  [input1, expected1],
  [input2, expected2],
])('should handle %s → %s', (input, expected) => {
  expect(transform(input)).toBe(expected);
});
```

## 批量创建测试文件的工作流

```bash
# 1. 找到无测试覆盖的源文件
find ./backend/src -name "*.ts" | grep -v '.test.' | while read f; do
  base=$(basename "$f" .ts)
  find ./backend/src/__tests__ -name "*${base}*" -print -quit | grep -q . || echo "NO TEST: $f"
done

# 2. 为每个文件创建对应的测试文件
# 3. 运行并验证
npx vitest run src/__tests__/newFile.test.ts
```

## 测试质量指标

- **通过率目标**: ≥ 96%
- **文件覆盖率**: 每个 API 路由文件至少 1 个测试文件
- **逻辑覆盖**: 关键业务逻辑（排序、筛选、计算）必须有测试

## 相关文档
- [TESTING-STRATEGY.md](../design/TESTING-STRATEGY.md)
- [TEST-STRATEGY-PATTERNS.md](./TEST-STRATEGY-PATTERNS.md)
