# Round 145 知识沉淀

## 项目
AStock (奇数轮)

## 问题现象
1. **蒙特卡洛引擎接口说谎**: `MonteCarloConfig` 声明了 `randomSeed?: number` 字段，但 `simulateGBMPaths`、`simulateJumpDiffusion`、`evaluateStrategyRobustness` 的实现中完全未使用该字段。`boxMullerRandom()` 直接调用 `Math.random()`，跳跃扩散中的泊松跳跃判断也使用 `Math.random()`。
2. **统计函数 NaN/Infinity 传播**: `calculateStats` 中，当 `n <= 1` 时 `variance` 分母为 0。当 `std === 0` 时 `skewness` 和 `kurtosis` 计算中除以 0，导致 NaN。这些 NaN 会静默传播到整个分析结果。
3. **测试中使用 Math.random() 生成数据**: `monteCarloEngine.test.ts` 和 `monteCarloSimulation.test.ts` 中使用 `Math.random()` 生成 returns 数据，导致测试结果非确定性。

## 根本原因
- **接口与实现脱节**: 开发者在接口设计时预留了 `randomSeed` 字段（可能是为了未来功能），但实际实现时忘记传入 RNG。
- **统计边界条件未处理**: `calculateStats` 直接使用 `n - 1` 作为方差分母，未考虑单元素或空数组情况。也未处理所有值相同导致 `std=0` 的情况。
- **测试数据非确定性**: 开发者习惯性地使用 `Math.random()` 生成测试数据，而未考虑到测试的可复现性。

## 解决方案
1. **实现种子化 RNG**
   - 添加 `createSeededRNG(seed: number): () => number` 函数，使用线性同余生成器（LCG：`s = (s * 1664525 + 1013904223) >>> 0`）
   - 修改 `boxMullerRandom(rng?: () => number)` 以接受可选 RNG
   - 修改 `simulateGBMPaths`、`simulateJumpDiffusion`、`evaluateStrategyRobustness` 在 `randomSeed` 存在时使用种子化 RNG，否则回退到 `Math.random()`
   - 跳跃扩散使用单独的 `jumpRng = createSeededRNG(randomSeed + 1)` 以确保跳跃决定与路径步骤独立

2. **统计函数边界保护**
   - `n === 0` 时 mean 返回 0，避免 `0/0`
   - `n <= 1` 时直接返回 `std=0, skewness=0, kurtosis=0`
   - `std === 0 || !isFinite(std)` 时同样返回零，避免 `NaN` 传播

3. **测试确定性化**
   - 将 `monteCarloEngine.test.ts` 中的 `Math.random()` 替换为 `Math.sin(i * 0.3) * amplitude` 确定性波函数
   - 将 `monteCarloSimulation.test.ts` 中的相关使用替换为 `Math.sin(i * 0.5 + offset) * amplitude`
   - 新增测试：验证 `randomSeed=42` 两次运行结果完全相同，不同种子产生不同结果

## 测试验证
- 后端: 15192 passed, 0 failed
- 前端: 17750 passed, 0 failed (853 测试文件)
- TypeScript 编译: 0 错误
- 新增测试: 2 个种子化确定性测试 + 2 个修复的测试

## 可迁移原则和方法论
1. **接口必须与实现保持一致**: 如果一个接口声明了某个功能（如 `randomSeed`），实现必须兑现。未实现的接口字段是“说谎”，会误导用户和下游代码。
2. **统计函数必须有边界保护**: 任何涉及除法、平方根、对数的计算都必须检查边界条件。`n-1` 分母、`std=0` 除法、`log(0)` 都是金融计算中常见的 NaN 源头。
3. **测试数据必须确定性**: 使用 `Math.sin(i * freq) * amplitude` 等确定性波函数替代 `Math.random()` 生成测试数据。测试验证的是逻辑，不是运气。
4. **Monte Carlo 必须支持种子化**: 在金融工程中，可复现性是核心要求。同一个配置运行两次必须产生相同结果，否则无法调试、无法审计、无法比较。

## 从对标产品学到的底层原理
- **Bloomberg Terminal 的可复现性原则**: 每一个数字都有追溯路径。如果两次计算结果不同，必须能够说明原因（是数据更新了还是随机数生成器不同）。种子化是这一原则的基础。
- **TradingView 的测试哲学**: 每个测试用例对应一个精确定义的市场场景，而不是一个随机数学实验。确定性让测试在毫秒级完成，同时保证结果可信。
- **LCG 随机数生成器**: 金融行业广泛使用的简单种子化 RNG，兼顾速度和可复现性。Python的 `random` 模块、Java 的 `java.util.Random` 都基于类似原理。在实时交易系统中使用 `xorshift` 等更快的算法，但原理相通——种子决定一切。
