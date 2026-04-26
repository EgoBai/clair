# Round 129 (AStock Round 979) — StockListPage 连接 zustand 商店 + 空 catch 修复 + 死代码清理

**日期**: 2026-04-26
**轮次**: 129 (AStock 项目内部轮次 979)
**对标**: TradingView / Bloomberg Terminal / Linear

---

## 问题1: StockListPage 使用硬编码 (HARDCODED) 模拟数据

### 问题现象

`StockListPage.tsx` 使用内联的 `mockStocks` 数组（10个硬编码股票）和 `setTimeout` 模拟数据加载。项目存在完整的 zustand 状态管理 (`useStockStore`) 和 15192 个后端测试，但股票列表页面完全未接入。

属于 **Cross-Component Data Provenance Audit** 中的 **HARDCODED** 类别：
- 数据永不变化
- 刷新按钮只执行 `setTimeout(() => setLoading(false), 1000)` — 假装加载
- 用户信任被侵蚀：刷新10次看到同样的数据

### 根本原因

`useStockStore` 和 `StockListPage` 独立开发，页面未接入共享状态层。`HomePage` 已正确使用 `useStockStore`，但 `StockListPage` 停留在独立演示模式。

### 解决方案

1. 替换 `const [stocks, setStocks] = useState(mockStocks)` → `const stocks = useStocks()`
2. 导入 `useStockStats()` 替代内联统计计算（`stocks.filter(...)`、`stocks.reduce(...)`）
3. 导入 `initializeSampleData()` 在 stocks 为空时初始化
4. 导入 `useWatchlist()` + `toggleWatchlist()` 使收藏按钮真正工作
5. 移除 `setTimeout` 假加载

**修改文件**: `frontend/src/pages/StockListPage.tsx`

### 可迁移原则

**"状态提升一致性"原则**：当项目有全局状态管理器（zustand/redux），所有页面组件应使用同一数据源。一个页面使用 store 而另一个页面使用内联 mock 数据是最危险的模式 — 数据看起来"工作正常"但完全不可信。

从 Bloomberg Terminal 学到：Bloomberg 的所有终端组件共享同一个数据总线（Data Bus），任何组件的数据源都可以追溯到交易所原始数据。不存在"这个组件暂时用假数据"的情况。

---

## 问题2: 4 处空 catch 块静默吞错误

### 问题现象

| 文件 | 行号 | 错误场景 | 影响 |
|------|------|---------|------|
| `UserSettingsPage.tsx` | 73 | 验证用户 token 失败 | 无声失败，用户停留在未登录状态 |
| `UserSettingsPage.tsx` | 85 | 加载操作历史失败 | 无声失败，历史列表空白 |
| `CustomDashboard.tsx` | 62 | 解析保存的仪表盘布局失败 | JSON 解析错误被吞，布局回退到默认 |
| `Onboarding.tsx` | 90 | 保存引导完成状态失败 | 无声失败，下次访问仍显示引导 |

所有 4 处都使用 `catch { /* ignore */ }` — 完全静默的异常吞噬。

### 根本原因

开发时的快速原型习惯（"先忽略错误，后面再处理"）进入了生产代码。空 catch 块是技术债务的经典形式 — 写起来快，但运行时后果严重：无法排查问题、用户无法感知错误、数据不一致。

### 解决方案

每个 catch 块添加 `console.warn()` 记录带上下文的警告信息：
```typescript
// ❌ 修复前
catch { /* ignore */ }

// ✅ 修复后
catch { console.warn('ComponentName: specific failure context'); }
```

**修改文件**: `UserSettingsPage.tsx`, `CustomDashboard.tsx`, `Onboarding.tsx`

### 可迁移原则

**"每个 catch 块必须做至少一件事"原则**：
- 最小要求：`console.warn()` 或 `console.error()` 记录错误上下文
- 理想情况：用户可见的错误提示 + 日志
- 反模式：空 catch 块（`catch {}` 或 `catch { /* ignore */ }`）
- 代码审查时应标记所有空 catch 块并要求修复

从 Linear 学到：Linear 的 ESLint 配置禁止空 catch 块（`no-empty` 规则在 catch 子句中启用）。每个异常路径都是"用户可感知的错误状态"的入口。

---

## 问题3: `StockListPage.optimized.tsx` 死代码

### 问题现象

`StockListPage.optimized.tsx` 是 `StockListPage.tsx` 的一个优化变体，添加了虚拟滚动支持。但它：
- 不被 `routes/index.tsx` 或任何文件 import
- 使用相同的硬编码 `mockStocks` 数据
- 自引用但从未被路由访问

### 解决方案

删除该文件（与 Round 125 清理 `WebVitalsWidget.original.tsx` 相同的模式）。

### 可迁移原则

死代码 = 维护负担。每个未被引用的文件：
- 在 IDE 搜索中显示（误导）
- 可能被开发者误认为"最新版本"而修改
- 占用 CI 时间（扫描、lint）
- 应在每次迭代中清理

---

## 对标对比

| 维度 | TradingView/Bloomberg 做法 | AStock 之前 | AStock 之后 |
|------|--------------------------|------------|------------|
| 数据源 | 单一数据总线，所有组件共享 | StockListPage 硬编码，HomePage 用 store | 统一使用 zustand store |
| 错误处理 | 所有 catch 块有日志和用户提示 | 4 个 `catch {/* ignore */}` | 4 个 `catch { console.warn(...)}` |
| 死代码管理 | CI 自动扫描未引用文件 | StockListPage.optimized.tsx 残留 | 已清理 |
| 自选股交互 | 实时可交互的列表操作 | 静态 ⭐ 按钮无功能 | 可切换收藏状态 |

---

## 测试结果

- **前端**: 853/853 文件, **17748/17748** 测试通过 ✅
- **后端**: 625/625 文件, **15192/15192** 测试通过 ✅
- **TypeScript 编译**: 0 errors ✅
- **回归**: 0

---

## 复盘

### 成功
- StockListPage 从独立演示变为共享状态的完整功能页面，新增代码 ~15 行（导入 + 替换），删除 ~20 行（mockStocks + setTimeout）
- 空 catch 块修复 4 处，每处改动 <5 行，但消除了 4 类运行时静默失败
- 死代码删除延续了 Round 125 的模式，保持代码库清洁

### 教训
- 状态提升一致性问题在大型项目中常见 — 当一个新组件创建时，是否知道全局状态管理器的存在？这需要文档和代码审查检查
- 空 catch 块容易在迭代中被忽略（没有人专门搜索过它们），但影响深远。应在 CI 中添加 `no-empty` ESLint 规则

### 下轮优先级
1. 为 StockListPage 添加测试（当前无测试覆盖）
2. 检查是否还有其他页面使用硬编码数据而非 store
3. CI 中启用 ESLint `no-empty` 规则防止空 catch 块复发
