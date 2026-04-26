# Round 143 知识沉淀

## 项目
AStock (奇数轮)

## 问题现象
前端测试运行极慢，三个测试文件单独运行耗时超过 10 秒：
- `throttleEngine.test.ts`: 2.1s (其中"应该限制队列大小" 2003ms)
- `lazyLoadEngine.test.ts`: 3.0s (其中"应该支持重试" 3006ms)
- `errorBoundary.test.ts`: 5.3s (其中"应该使用fallback在重试后" 3005ms)

全量前端测试因超时无法完成 (180s timeout)。

## 根本原因
1. **生产代码中的重试/退避延迟硬编码为 1000ms**，测试未覆盖短延迟场景
2. **`LazyLoadEngine.load()`** 使用 `Math.pow(2, attempt) * 1000` 作为指数退避，但退避基数不可配置
3. **`withFallback()`** 默认 `retryDelay = 1000`，测试未传入该参数
4. **`ThrottleEngine` 测试** 中直接写入 `setTimeout(r, 2000)` 和 `setTimeout(r, 1000)`

## 解决方案
1. **LazyLoadEngine 生产代码** (`frontend/src/utils/lazyLoadEngine.ts`)
   - 在 `LazyLoadConfig` 接口中添加 `retryDelay: number` 字段
   - 在 `defaultConfig` 中设置默认值 `retryDelay: 1000`
   - 在 `load()` 方法中使用 `config.retryDelay || 1000` 替代硬编码的 `1000`

2. **测试文件优化**
   - `lazyLoadEngine.test.ts`: `engine.register('chart-retry', { delay: 0, retryCount: 2, retryDelay: 1 })`
   - `throttleEngine.test.ts`: 将 `setTimeout(r, 2000)` → `setTimeout(r, 10)`，`setTimeout(r, 1000)` → `setTimeout(r, 5)`
   - `errorBoundary.test.ts`: 给所有 `withFallback` 调用传入 `{ retries: N, retryDelay: 1 }`

## 测试验证
- 修改前：三个文件总耗时 ~10.4s
- 修改后：三个文件总耗时 **1.73s** (加速 **6 倍**)
- 59 个测试全部通过，零回归
- 后端 15192 个测试全部通过，零回归
- TypeScript 编译 0 错误

## 可迁移原则和方法论
1. **时间敏感参数必须可配置**：任何涉及延迟、超时、退避的生产代码，其时间参数必须通过构造函数或配置对象暴露，不得硬编码。这是测试性能和灵活性的基础。
2. **测试中的延迟应该是最小化的**：测试验证的是逻辑（"重试 N 次后触发 fallback"），而不是时间本身（"等待 3 秒后触发"）。尽量在测试中使用 1-10ms 的延迟。
3. **假 timers 不是唯一选择**：vitest/jest 的 `vi.useFakeTimers()` 可以解决问题，但它会增加测试复杂度。如果只需要减少延迟时间，让延迟参数可配置是更简洁的方案。
4. **每轮迭代都应运行测试并检查耗时**：慢测试是技术债务，会逐渐累积并损耗开发效率。当单个测试文件超过 2 秒时，应该立即调查。

## 从对标产品学到的底层原理
- **Bloomberg Terminal 测试哲学**: 每个测试用例对应一个精确定义的市场场景，而不是等待时间流逝。在金融系统中，测试必须在毫秒级完成，否则无法支撑每日数百次的 CI 构建。
- **TradingView 的性能优先级**: 前端工程的测试运行速度直接决定了开发迭代周期。一个 10 秒的测试套件会让开发者避免频繁运行测试，从而降低代码质量。
