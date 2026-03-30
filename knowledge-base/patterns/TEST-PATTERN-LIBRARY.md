# 测试模式库

> 本项目中高频使用的测试模式与最佳实践

## 目录
1. [数据模型测试模式](#数据模型测试模式)
2. [算法测试模式](#算法测试模式)
3. [边界条件模式](#边界条件模式)
4. [工具函数测试模式](#工具函数测试模式)
5. [系统组件测试模式](#系统组件测试模式)

---

## 数据模型测试模式

### 字段完整性验证
```typescript
it('should have required fields', () => {
  const data = generateSample();
  expect(data).toHaveProperty('code');
  expect(data).toHaveProperty('name');
  expect(data).toHaveProperty('price');
});
```

### 类型安全验证
```typescript
it('should have correct types', () => {
  const data = generateSample();
  expect(typeof data.price).toBe('number');
  expect(Array.isArray(data.tags)).toBe(true);
  expect(Number.isFinite(data.price)).toBe(true);
});
```

### 数值范围验证
```typescript
it('should have values in valid range', () => {
  const data = generateSample();
  expect(data.changePercent).toBeGreaterThanOrEqual(-20);
  expect(data.changePercent).toBeLessThanOrEqual(20);
});
```

---

## 算法测试模式

### 已知输入输出验证
```typescript
it('should calculate correct result for known input', () => {
  expect(calculateMA([1,2,3,4,5], 3)).toEqual([2, 3, 4]);
});
```

### 对称性验证
```typescript
it('should be symmetric', () => {
  expect(getContrastRatio(c1, c2)).toBeCloseTo(getContrastRatio(c2, c1));
});
```

### 单调性验证
```typescript
it('should return results in order', () => {
  const results = fibonacci(100, 50);
  for (let i = 1; i < results.length; i++) {
    expect(results[i]).toBeLessThanOrEqual(results[i-1]);
  }
});
```

### 恒等操作验证
```typescript
it('should return input unchanged for identity operation', () => {
  expect(transform(5, 0)).toBe(5); // 加0
  expect(transform(5, 1)).toBe(5); // 乘1
});
```

---

## 边界条件模式

### 空输入处理
```typescript
it('should handle empty input', () => {
  expect(process([])).toEqual([]);
  expect(process('')).toBe('');
  expect(process(null)).toBeNull();
});
```

### 单元素处理
```typescript
it('should handle single element', () => {
  expect(process([42])).toEqual([42]);
});
```

### 极值处理
```typescript
it('should handle extreme values', () => {
  expect(process(Infinity)).toBeDefined();
  expect(process(NaN)).toBeDefined();
  expect(process(0)).toBeDefined();
  expect(process(-0)).toBeDefined();
});
```

### 溢出保护
```typescript
it('should not exceed bounds', () => {
  const result = clamp(300, 0, 255);
  expect(result).toBeLessThanOrEqual(255);
  expect(result).toBeGreaterThanOrEqual(0);
});
```

---

## 工具函数测试模式

### 格式化函数
```typescript
it('should format correctly', () => {
  expect(formatNumber(10000)).toBe('10,000');
  expect(formatNumber(0)).toBe('0');
  expect(formatNumber(null)).toBe('-');
});
```

### 解析函数往返
```typescript
it('should round-trip parse and format', () => {
  const original = { ...data };
  const formatted = format(data);
  const parsed = parse(formatted);
  expect(parsed).toEqual(original);
});
```

---

## 系统组件测试模式

### 中间件管道
```typescript
it('should execute middleware in order', () => {
  const order: string[] = [];
  const mw1 = () => { order.push('a'); };
  const mw2 = () => { order.push('b'); };
  runPipeline([mw1, mw2]);
  expect(order).toEqual(['a', 'b']);
});
```

### 状态机转换
```typescript
it('should transition states correctly', () => {
  expect(canTransition('idle', 'loading')).toBe(true);
  expect(canTransition('loading', 'idle')).toBe(true);
  expect(canTransition('idle', 'success')).toBe(false);
});
```

### 配置合并
```typescript
it('should merge configs with defaults winning for undefined', () => {
  const merged = mergeWithDefaults({ a: 1 }, { a: 0, b: 2 });
  expect(merged.a).toBe(1); // override wins
  expect(merged.b).toBe(2); // default fills
});
```

---

## 断言技巧

| 场景 | 推荐断言 |
|------|----------|
| 精确相等 | `toBe()` |
| 对象/数组 | `toEqual()` |
| 数值精度 | `toBeCloseTo(expected, digits)` |
| 包含子串 | `toContain()` |
| 存在属性 | `toHaveProperty()` |
| 大于/小于 | `toBeGreaterThan()` / `toBeLessThan()` |
| 范围 | `toBeGreaterThanOrEqual()` + `toBeLessThanOrEqual()` |
| 类型检查 | `toBeInstanceOf()` / `typeof` |
| 有限数 | `Number.isFinite()` |
| 异常 | `expect(() => fn()).toThrow()` |

---

## 项目测试统计 (截至第29轮)

- 总测试: **4549** 个
- 测试文件: **211** 个
- 后端: **2262** 测试 / 111 文件
- 前端: **2287** 测试 / 100 文件
- 覆盖领域: 数据模型/算法/中间件/系统架构/可视化/交互/无障碍
