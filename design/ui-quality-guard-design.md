# 澄观 Clair 前端低级错误自动化排查机制 — 架构设计

> 设计人：高见远（架构师）｜技术栈：React 18 + TS + Vite + antd 5 + Zustand + react-router v6

## 1. 总体架构（检测层 → 规则引擎 → 报告层）

- **检测层（Detector Layer）**：分静态、动态两路采集。
  - 静态：扫描 `src/**/*.{ts,tsx}`，忽略 `**/__tests__/**`、`**/_archived/**`、`node_modules`、`dist`、`.eslintrc.*`。
  - 动态：Playwright 启动 `vite preview`，遍历关键路由，抓取渲染文本 / DOM / 截图。
- **规则引擎（Rule Engine）**：统一 `Rule` 契约 `{ id, category, severity, check(ctx), fixHint }`。内置 6+ 类规则，可插拔；静态规则走 ESLint 自定义规则或 `ts-morph` AST 脚本，动态规则走 Playwright 断言。
- **报告层（Reporter）**：聚合所有 finding（file, line, col, message, suggestion, severity），产出①人类可读 Markdown 报告、②机器可读 JSON（供 CI 判 exit code 与趋势看板）。

## 2. 检测范围与规则分类（≥6 类）

1. **符号重复**：涨跌/百分比出现 `++`、`--`、`%%`、`+%`、`% %`、全角符号；价格前缀多余符号。
2. **数据异常**：渲染文本含 `undefined`/`NaN`/`[object Object]`/`null`/`Infinity`；空数组/空对象渲染成 `0`/`NaN`；列表项（key 或内容）重复。
3. **死状态/未声明变量**：Zustand store 字段无任何 selector 订阅；`useState` 声明后从未读取；作用域内未声明却被使用（绕过 TS 检查的场景）。
4. **布局/样式冲突**：antd 5 与全局 `App.css` 选择器冲突；硬编码 `position/width/float` 致错位；暗色 token 未生效；z-index 层级打架。
5. **类型断言风险**：渲染路径数据使用 `as any`/`as unknown as`/非空 `!`；`JSON.parse` 无 try-catch 后直接渲染。
6. **路由/导航异常**：`<Navigate>` 重定向成环（A→B→A）；菜单/快捷键/预渲染引用的路径未在 `ROUTE_PATHS`/`AppRoutes` 定义（如历史遗留 `/market`）；懒加载页 404；`LazyPage` 缺 Suspense/ErrorBoundary 致整页白屏。
7. *（扩展位）可访问性/对比度*：文本背景对比度、aria 缺失——预留未来规则。

## 3. 技术方案选型（组合建议）

- **ESLint 自定义规则 + `@typescript-eslint` parser（静态主力）**：项目已有 `.eslintrc.json` 与完整插件链，规则随 `npm run lint` 运行，给出精确 file/line。符号重复、未声明变量、类型断言风险最直接。
- **`ts-morph` AST 跨文件脚本（静态补充）**：单文件 ESLint 难做跨文件分析（store 字段与 selector 引用关系、重定向环、路径未定义），用独立 `scripts/ui-guard/scan-ast.mts` 补充，复用现有 `tsx` 执行方式（同 `demoData.regression.test.mts`）。
- **正则/字符串扫描（轻量兜底）**：对 JSX 文本字面量、模板字符串做快速正则扫描，命中即报行号；作为 ESLint 规则的快速通道。
- **Playwright 运行时检测（动态）**：`playwright.config.ts` 已存在。新增 `e2e/ui-guard.spec.ts`，逐路由加载并断言文本不含 `++/NaN/undefined`、重定向不回环、关键节点截图（基线对比后期启用）。

**推荐组合**：ESLint 规则（静态主力）＋ ts-morph 脚本（跨文件补充）＋ Playwright E2E（运行时）三层；正则扫描为轻量兜底。新增规则只需在 `rules/` 注册，机制可扩展。

## 4. 关键渲染节点清单

- **重点页面**（基于 `src/routes/index.tsx` 与 `src/pages`）：
  - `DiscoverPage`（65KB，二级板块涨幅 `++` 出处）→ 板块卡片、涨幅列、雷达维度标签
  - `StockDetailPage`、`WatchlistPage`（含 review tab 空数据态）、`IndustryMapPage`、`RadarPage`
  - 数值密集页：`ScreenerPage`、`SectorDetailPage`、`IndexDetailPage`、`ETFPage`、`HKConnectPage`、`MacroPage`、`ReportCenterPage`
- **公共组件**：`Layout/AppLayout`、`NavigationMenu`（菜单路径源）、`Common/LazyPage`（Suspense/ErrorBoundary）、`MarketIndexPanel`、`ValuationPanel`、`Pagination`
- **数据入口**：`src/utils/demoData.ts`（`DEMO_*` 数据，被 `demoData.regression.test.mts` 覆盖，机制复用其"数据形状校验"思路）
- **路由配置**：`src/routes/index.tsx`（重定向环/未定义路径）、`src/routes/paths.ts`（`ROUTE_PATHS`）

## 5. 实施任务分解（有序，含依赖）

- **T1 脚手架与配置**：新建 `scripts/ui-guard/`、`.eslintrc.ui-guard.json`、`ui-guard.yml`。（依赖：无）
- **T2 ESLint 规则集**：符号重复 / 类型断言风险 / 未声明变量规则。（依赖：T1）
- **T3 ts-morph AST 脚本**：死状态(store 未订阅)、重定向环、路径未定义。（依赖：T1）
- **T4 正则快速扫描器**：兜底符号重复与 `NaN/undefined`。（依赖：T1）
- **T5 Playwright 运行时 spec**：关键路由遍历 + 文本断言 + 截图。（依赖：T2/T3 产出的节点清单）
- **T6 报告聚合器 + CI 接入**：合并 T2–T5 输出，控制 exit code。（依赖：T2/T3/T4/T5）
- **T7 兼容与扩展**：将 `demoData.regression` 数据形状校验纳入 guard 基线，建立规则注册表。（依赖：T6）

## 6. 文件结构建议

```
frontend/
├─ .eslintrc.ui-guard.json        # 仅启用 ui-guard 规则集
├─ scripts/ui-guard/
│  ├─ index.mts                   # 总入口：编排各检测器
│  ├─ config.ts                   # 扫描范围/严重级/忽略项
│  ├─ rules/                      # 可插拔规则（symbol-dup/data-anomaly/dead-state/unsafe-assert/routing）
│  ├─ scan-ast.mts                # ts-morph 跨文件分析
│  ├─ scan-regex.mts              # 正则快速扫描
│  └─ reporter.ts                 # Markdown + JSON 生成
├─ e2e/ui-guard.spec.ts           # Playwright 运行时检测
└─ .github/workflows/ui-guard.yml # 定时 / PR 触发
```
复用：`src/utils/__tests__/demoData.regression.test.mts`（数据形状基线）。

## 7. 与现有 CI/自动化集成

- **入口复用**：`package.json` 增 `"guard": "tsx scripts/ui-guard/index.mts"`、`"guard:eslint": "eslint . --ext ts,tsx -c .eslintrc.ui-guard.json"`。
- **串联顺序**：`tsc --noEmit`（build 内含）→ `lint`（含 ui-guard 规则集）→ `npm run build` → `guard`（AST+正则+数据基线）→ E2E（`stock-app.spec.ts` + `ui-guard.spec.ts`）。
- **CI 触发**：`ui-guard.yml` 用 `cron`（建议每日 03:00）定时 + PR/push 到 main 触发；产物上传 `ui-guard-report.md` 与 `.json` 为 artifact。
- **门禁策略**：P0（符号重复 / `NaN`/`undefined` / 重定向环）exit 1 阻断；P1/P2 仅告警不阻断，与 `lint:strict --max-warnings 0` 区分。
- **与 demoData 回归兼容**：data-anomaly 规则复用 demoData 形状断言思路，二者并行、共用同一 JSON 汇总。

## 8. 待确认问题

1. **运行时检测成本**：Playwright 逐路由截图对比是否纳入默认定时？还是仅 PR 触发控时长？基线截图如何管理（首次生成 vs 人工审核）？
2. **门禁严格度**：`guard` 发现 P0 是否直接阻断 CI/合并？还是仅出报告、人工周会评审？与 `lint:strict --max-warnings 0` 的边界如何划分？
3. **死状态判定边界**：Zustand 字段"未被 selector 订阅"是否一律报错？是否存在"预留接口"字段需白名单？
4. **符号重复扫描对象（✅ 已解决）**：经 engineer 在 `demoData.regression.test.mts` 落地基线验证——数据契约[5]仅认"带符号字符串为正确契约"（1144 行依赖），双重符号校验[6]只看"渲染/拼接输出不得 `++`"。两路解耦：数据本身带 `+` 不会误报；源码层查 bug 模式、渲染层查输出。该区分已可作 guard rule 判据参考。（可选增强：统一格式化函数"正数强制 + / 负数强制 -"契约校验，待定。）
