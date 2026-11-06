# 澄观 Clair 设计系统基线 v1

状态：已批准 v1（2026-11-05）；P0 三项代码已实施（2026-11-05，commit 0bb898ef4）；三页试点完成（2026-11-06，commit 8b7ce0567，远端 92fdbeeed8b7），P0a 的亮色与 768 响应式验收在试点三页内通过，全站其余页面仍按 P2 逐批收敛。编制时间：2026-11-05。适用仓库：a-stock-website。

本文只定义基线、页面责任与验收口径，不改变现有导航与用户可见交互。文中标注“待批准”的条目，须确认后才能进入实现。

## 一、结论与边界

一、现有产品不是没有设计，而是设计分散在 385 行全局 CSS、31 个路由页面和 1882 处生产十六进制色值里；状态组件有 4 套空态、4 套加载、4 套骨架、3 套错误。基线要解决的是“同一件事有几种做法”，不是再做一套皮肤。

二、v1 不推翻现有暗色金融终端风格，不做全站字号、颜色、导航的同步替换。先把 token、状态、数据可信度写成可执行契约，再用首页、个股详情、股票列表三页试点。

三、涨跌色的事实是 8 套并存，不是 2 套。基线保留两种用途：UI 文字与角标用 `--color-up/down`，图表线柱用 `CHART_COLORS`；其余 6 套（`#ef4444/#22c55e` 等）列为待收敛，不允许新代码再引入。

四、设计基线必须服务产品方向。本文按“研究工作台优先、行情监控作为上下文”编写；是否正式转向，见配套文档 `design/research-first-reframe.md`，同样先评审后实施。

## 二、设计原则

| 编号 | 原则 | 可执行含义 | 反例 |
| --- | --- | --- | --- |
| 1 | 数据先于装饰 | 每个数字有来源、时间、状态；没有数据就说明原因，不用 0、占位图或演示数据补齐 | 估值面板整块“暂无数据”，但页面没有说明是接口未部署还是标的没有财报 |
| 2 | 研究优先 | 阅读与结论区域优先于指标堆叠；默认一屏回答“这是什么公司、现在发生了什么、我该看什么” | 个股页首屏是 6 个指标卡，研究结论在第三屏 |
| 3 | 一处一义 | 同一语义只有一个 token、一个格式化函数、一个状态组件 | 三套 `formatChangePercent`、两套 `LoadingState`、两套涨跌色混用 |
| 4 | 状态即内容 | 加载、空、错误、部分可用、过期都是页面内容的一部分，不是异常分支 | 接口失败后显示 0.00，或只弹一个 toast 后留空白 |
| 5 | 密度分层 | 概览页高密度，研究页中密度，笔记页低密度；不同密度使用不同字号与行高 | 全站 13px，长文阅读与表格共用一套排版 |
| 6 | 渐进迁移 | 新代码只准用 canonical 组件；旧页面按批次替换，不做一次性全站重写 | 为了统一，把 30 个页面同时改版，回归面失控 |

## 三、视觉 token

### 3.1 颜色

名义真源：`frontend/src/styles/design-system.css`。以下为当前值，v1 冻结，不在试点中全站替换。

但必须承认事实：`#ef4444` 与 `#22c55e` 在生产代码出现 106 次与 99 次，而 token 值 `#f87171` 与 `#34d399` 只出现 4 次与 2 次；1882 处十六进制分布在 137 个文件，29/33 个页面含 hex。改 token 目前不会改页面，这是 v1 要解决的第一件事，不是配色偏好问题。

| 语义 | 暗色 | 亮色 | 用途 |
| --- | --- | --- | --- |
| 页面底色 | `--bg-base #080b14` | `#f8f9fc` | 最外层背景 |
| 主面板 | `--bg-primary #0d1117` | `#ffffff` | 页面主区域 |
| 次级面板 | `--bg-secondary #161b26` | `#f1f3f7` | 分区、表头 |
| 三级面板 | `--bg-tertiary #1c2333` | `#e8ebf0` | 选中、悬浮 |
| 抬升面板 | `--bg-elevated #21293a` | 同主面板 | 弹层、浮卡 |
| 卡片底 | `--card-bg rgba(22,27,38,.8)` | `rgba(255,255,255,.9)` | 内容卡 |
| 卡片边 | `--card-border rgba(255,255,255,.06)` | `rgba(0,0,0,.06)` | 1px 分隔 |
| 主文字 | `#e8edf5` | `#1a1d26` | 标题、关键数字 |
| 次文字 | `#8b95a8` | `#5a6070` | 说明、单位 |
| 弱文字 | `#5a6478` | `#8b90a0` | 时间、脚注 |
| 强调 | `#3b82f6` | `#3b82f6` | 主按钮、链接、选中 |
| 渐变 | `#3b82f6 → #6366f1` | 同左 | 品牌标题、主行动 |
| UI 涨 | `--color-up #f87171` | `#dc2626` | 涨幅文字、涨 badge |
| UI 跌 | `--color-down #34d399` | `#16a34a` | 跌幅文字、跌 badge |
| 警示 | `#fbbf24` | `#d97706` | 部分可用、过期、风险提示 |
| 危险 | `--color-error`（当前未定义） | 同左 | 请求失败、阻断错误；v1 补 `#f43f5e` |

图表色真源：`frontend/src/styles/chart-theme.ts`。

| 语义 | 值 | 用途 |
| --- | --- | --- |
| 图表涨 | `#cf2a2a` | K 线阳线、上涨柱 |
| 图表跌 | `#1db468` | K 线阴线、下跌柱 |
| 平盘 | `#64748b` | 0 涨跌、无方向 |
| 强调 | `#3b82f6` | 主指标线 |
| MA5/10/20/60 | `#f59e0b` / `#3b82f6` / `#8b5cf6` / `#ec4899` | 均线 |
| 图表底 | `#0f172a` | 画布 |
| 图表卡片 | `#1e293b` | tooltip、图例底 |

规则一：UI 涨跌色用于文字、角标、边框；图表涨跌色用于线、柱、面积。两者不得互换。

规则二：A 股口径固定红涨绿跌。`ThemeProvider.tsx:57-58` 把 antd `colorSuccess` 映射为跌、`colorError` 映射为涨，这是价格语义，不得用于“成功/失败”提示；两个语义必须拆槽。

规则三：新代码颜色只允许三个来源：`var(--*)`、`styles/theme-constants.ts` 的 `THEME`、ECharts 主题对象。页面与组件禁止直接写未登记 hex；`#ef4444`、`#22c55e` 为存量，新增即拒。

规则四：现有 8 套涨跌色视为 8 条技术债，收敛顺序见第八节；不在 v1 一次性全站替换。

### 3.2 字号、间距、圆角、动效

| 类别 | 当前 token | 用途 |
| --- | --- | --- |
| 字号 | 11 / 12 / 13 / 14 / 16 / 18 / 22 / 28 | 脚注 / 辅助 / 正文 / 强调正文 / 小标题 / 标题 / 页面标题 / 大标题 |
| 字重 | 400 / 500 / 600 / 700 | 正文 / 标签 / 小标题 / 数字与标题 |
| 行高 | 1.25 / 1.5 / 1.75 | 标题 / UI / 长文 |
| 间距 | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 | 8 的倍数为主，4 用于紧凑表格 |
| 圆角 | 6 / 10 / 14 / 20 / 9999 | 标签 / 输入 / 卡片 / 大卡 / 胶囊 |
| 阴影 | xs / sm / md / lg / xl | 层级由低到高，暗色下以边框为主 |
| 动效 | 120 / 200 / 300ms | 悬浮 / 展开 / 页面过渡 |

### 3.3 v1 新增语义 token（待试点验证）

| token | 建议值 | 用途 |
| --- | --- | --- |
| `--text-reading` | 15px | 研究结论、笔记、AI 解读正文 |
| `--leading-reading` | 1.75 | 长文行高 |
| `--measure-reading` | 68ch | 长文最大宽度 |
| `--measure-page` | 1400px | 内容区最大宽度，沿用 AppLayout |
| `--space-section` | 32px | 页面一级分区间距 |
| `--focus-ring` | `0 0 0 2px #3b82f6, 0 0 0 4px rgba(59,130,246,.3)` | 键盘焦点 |
| `--data-live` | `#34d399` | 实时、完整 |
| `--data-partial` | `#fbbf24` | 部分字段可用 |
| `--data-stale` | `#f59e0b` | 有数据但过期 |
| `--data-unavailable` | `#8b95a8` | 无数据、不可用 |
| `--chart-up` / `--chart-down` | 同图表色 | 供新图表代码引用，逐步替代硬编码 |

新增 token 只在新代码和三页试点中使用；旧页面继续读现有变量，避免一次改色引发全站回归。

P0 缺口：代码里已使用但从未定义的变量有 12 个：`--accent`、`--bg-card`、`--bg-page`、`--bg-surface`、`--border`、`--color-bg-secondary`、`--color-error`、`--color-error-bg`、`--color-highlight`、`--text-disabled`、`--text-muted`、`--theme-primary`。其中 `StateComponents.tsx:67/70/74/124`、`MobileStockCard.tsx:77/78/90/93/120/129/151/172`、`DiscoverPage.tsx:1402/1436/1451`、`WatchlistPage.tsx:377/477`、`IndustryMapPage.tsx:126/166` 无 fallback，暗色下靠继承碰巧正确，亮色必错。试点前必须在 `design-system.css` 补齐或改用真 token。

### 3.4 数字与单位

| 场景 | 规则 | 示例 |
| --- | --- | --- |
| 金额 | 元为底层单位，展示按“亿 / 万亿”分层；同一页只用一个量级 | 1,808,168,000,000 → 1.81 万亿 |
| 百分比 | 接口给比率时乘 100；接口已给百分数时不再乘 | 0.0227 → 2.27% |
| 涨跌 | 涨带 `+`，跌带 `-`，平盘 `0.00%`；不用“红涨绿跌”以外的符号表达 | +2.16% / -2.27% |
| 缺失 | 统一 `—`（U+2014），不用 `-`、`--`、`N/A`、`0.00` | 市值缺失 → `—` |
| 非有限数 | `NaN`、`Infinity`、`-Infinity` 一律格式化为 `—`，同时上报一次客户端错误 | PE 为 NaN → `—` |
| 数字对齐 | 表格与指标使用 `font-variant-numeric: tabular-nums` | 价格、涨跌幅、市值 |
| 精度 | 价格 2 位；百分比 2 位；估值倍数 2 位；大额金额按展示单位 2 位 | 1446.44 / 22.01 / 1.81 万亿 |

### 3.5 事实底稿（只读审计，2026-11-05）

| 指标 | 实测 | 含义 |
| --- | --- | --- |
| 生产 hex | 1882 个 / 137 文件 | 29/33 页面、64/102 组件含硬编码色 |
| 内联样式 | `fontSize` 1155 / 98 文件；`padding:` 563 / 109；`borderRadius` 363 / 84；`style={{` 2760 / 131 | token 在页面层被大面积绕过 |
| 未定义 CSS 变量 | 12 个，其中 6 个无 fallback | 暗色靠继承碰巧正确，亮色必错 |
| 涨跌色 | 8 套并存 | `#ef4444` 106 次、`#22c55e` 99 次；token 值仅 4/2 次 |
| 状态组件 | Empty 4 套、Loading 4 套、Error 4 套、Skeleton 4 套 | 自研 Skeleton/Error 三套空转 |
| 死文件 | `optimizedComponents.tsx`、`components/Skeletons/index.tsx`、`Common/Skeletons.tsx`、`ChartSkeleton.tsx`、`chartTheme.ts`、`customThemes.ts` 等 | 0 生产消费者，维护成本与误导风险 |
| 暗色失效 | `StockTable.tsx:224-276` 浅色表头/斑马纹；`IndicatorPanel.tsx:135/178` `#f0f0f0` 网格 | 暗色主题下刺眼或网格消失 |
| 语义冲突 | `ThemeProvider.tsx:57-58` success=跌、error=涨；`adaptiveChartTheme.ts:39/45` 美股口径绿涨红跌 | 同一红绿承担相反语义 |

结论：`design-system.css` 是名义真相源，字面量与 antd 原语是事实真相源。v1 不假装改 token 就能改视觉；先补缺口、再试点、最后才做全站收敛。

审计底稿：`/Users/ego_bai/Documents/deepseek-harness/default-workspace/handover/audit-design-system-2026-11-05.md`。

## 四、布局与响应式

| 项 | 基线 |
| --- | --- |
| 桌面内容宽 | 最大 1400px，左右留白随视口增长 |
| 阅读宽 | 长文、AI 解读、笔记最大 68ch，不铺满 1400px |
| 侧栏 | 现有侧栏保留；分组标题可折叠；移动端 768px 以下抽屉 |
| 断点 | 640 / 768 / 1024 / 1280 / 1536，命名 sm / md / lg / xl / 2xl |
| 栅格 | 1 / 1 / 2 / 3 / 4 / 4 列，卡片最小宽 280px |
| 页面骨架 | 页头（标题、说明、行动）→ 数据状态条 → 主内容 → 次内容 |
| 卡片解剖 | 标题行（标题、来源角标、操作）→ 主体 → 脚注（时间、口径、样本数） |
| 首屏 | 概览页首屏至少一个真实结论；研究页首屏至少一个公司身份与一个当前判断 |

## 五、组件契约

### 5.1 canonical 组件

| 能力 | 唯一实现 | 说明 |
| --- | --- | --- |
| 加载 | `components/Common/StateComponents.tsx` 的 `LoadingState` | 页面级用 `fullPage`；区块级用 `variant` 指定骨架形状（试点补）。antd `<Skeleton>` 53 处、`<Spin>` 13 处逐步收敛 |
| 空态 | 同文件 `EmptyState` 与预设 `EmptyX` | 必须回答“为什么空、能做什么”，不能只写“暂无数据” |
| 错误 | 同文件 `ErrorState` | 显示人话原因与重试；技术细节仅开发环境展开。事实：该组件目前生产 0 处使用，唯一 1 处在未挂路由的 `App.optimized.tsx`；试点必须真正接入 |
| 骨架 | 暂不指定独立文件 | `components/Skeletons/index.tsx`（334 行）0 消费者、`Common/Skeletons.tsx` 仅测试引用、`Charts/ChartSkeleton.tsx` 0 JSX。v1 统一用 antd `Skeleton` 并封进 `LoadingState`，不再新增骨架文件 |
| 数据来源 | `components/discover/DataSourceIndicator.tsx` | `DataSourceBadge` 用于区块，`DataSourceBanner` 用于页面 |
| 指标 | 新增 `Metric`（试点实现） | 标签、值、单位、环比、来源、缺失态一次定义 |
| 分区标题 | 新增 `SectionHeader`（试点实现） | 标题、说明、右侧行动、来源角标 |
| 异步区块 | 新增 `AsyncBlock`（试点实现） | 统一 loading / empty / error / partial / stale 五态，减少每页手写分支 |

`frontend/src/utils/optimizedComponents.tsx` 与 `App.optimized.tsx` 均为死代码：前者唯一消费者是未挂路由的后者，`.empty-state/.error-state/.retry-button` 在全部 CSS 中零定义。标记为删除候选，新代码禁止引用。

`components/Common/StateComponents.tsx` 是接口规范，但内部实现未达标：`EmptyState` 的三个颜色变量未定义，`ErrorState` 无人使用，`PageTitle` 用硬编码 22/13px。v1 的做法是修它、用它，而不是再写一套。

### 5.2 状态矩阵

| 状态 | 触发 | 页面级 | 区块级 | 文案要求 | 重试 |
| --- | --- | --- | --- | --- | --- |
| loading | 首次请求未返回 | 骨架或整页加载 | 区块骨架 | 说明正在取什么，不显示 0 | 不需要 |
| empty | 请求成功但确实没有记录 | 空态插画 + 原因 + 下一步 | 空态行 | “今日无解禁”“该标的无北向持股” | 可选 |
| error | 网络失败、5xx、解析失败 | 错误态 + 重试 | 区块错误行 | 人话原因，不暴露堆栈 | 必须 |
| partial | 部分字段或部分子接口不可用 | 页面横幅 + 区块角标 | 缺字段显示 `—` | 说明缺哪一块、其余仍可用 | 必须 |
| stale | 有数据但超过时效 | 横幅 + 数据时间 | 角标“截至 …” | 不写“实时” | 必须 |
| unavailable | 接口未部署、无权限、数据源不提供 | 空态 + 原因 | `—` + 角标 | 区分“未部署”“无数据”“请求失败” | 视情况 |
| demo | 仅演示模式 | 顶部横幅 | demo 角标 | 不得进入研究结论 | 不需要 |

判定顺序：loading → error → unavailable → stale → partial → empty → ready。任一状态不得用 0、空字符串、`false` 冒充。

### 5.3 数据诚实规则

一、每个数据区块必须能回答三件事：来源（`dataSource`）、时间（`asOf` 或请求时间）、完整度（是否 partial）。三者不全时，角标至少显示“来源未知”或“时间未知”，不得默认 live。

二、`real` 与 `live` 的映射只在 `normalizeSourceKind` 一处做；新接口统一返回 `dataSource: 'real' | 'partial' | 'unavailable' | 'stale'`，不要新增同义词。

三、缺失值不是 0。可空列缺数写 `null`，前端显示 `—`；统计口径若因缺失不完整，合计值显示 `—`，不显示部分合计。

四、百分比与比率必须在字段名或注释中写清口径。`formatPercent` 只接受比率，`formatChangePercent` 只接受百分数；新代码优先使用带单位的字段名。

五、AI 结论必须带数据截止时间、引用区块和“不构成投资建议”；无数据时输出不可用说明，不生成看似完整的诊断。

六、演示数据只能存在于测试、Storybook 或显式 `demo` 模式。生产构建中不得因接口失败回退到 demo 数据集。

### 5.4 文案

| 场景 | 推荐 | 禁止 |
| --- | --- | --- |
| 空态 | “该标的暂无北向持股记录” | “暂无数据” |
| 错误 | “行情服务暂时不可用，已保留上次数据” | “系统错误” |
| 未部署 | “估值接口尚未部署，当前无法计算” | “加载失败” |
| 部分 | “财务因子未返回，价格因子仍可用” | “数据异常” |
| 过期 | “数据截至 11 月 3 日收盘” | “实时数据” |

### 5.5 可访问性

一、正文对比度不低于 4.5:1，大字不低于 3:1；图表线不低于 3:1。

二、所有可交互元素有可见焦点环；键盘可达；弹层焦点 trapped 并可 Esc 关闭。

三、不仅用颜色表达涨跌：同时有 `+/-` 符号与文字标签。

四、尊重 `prefers-reduced-motion`，关闭非必要动画。

## 六、信息架构与页面清单

### 6.1 当前导航

| 分组 | 项数 | 条目 | 问题 |
| --- | --- | --- | --- |
| 市场总览 | 3 | 市场洞察、产业地图、潜力雷达 | 尚可，但缺“事件/日历”入口 |
| 个股研究 | 7 | 投资笔记、策略选股、股票列表、同业对比、研报 AI 摘要、龙虎榜、解禁日历 | 偏多；研究动作与数据查询混在一起 |
| 宏观资金 | 10 | 宏观资金全景、宏观仪表盘、资金流向、大宗交易、北向资金、融资融券、ETF 中心、事件日历、港股通、组合风控 | 明显过载；组合风控放错组 |
| 组合与风控 | 2 | 自选组合、投资组合 | 与上一组的“组合风控”割裂 |
| 量化实验 | 3 | 回测、策略模板、多因子实验室 | 合理 |
| 成长旅程 | 1 | 成长中心 | 与投研主线关系弱 |

### 6.2 路由与页面清单

共 31 个路由页面，另有 `/review`、`/market` 两条占位重定向。下表按用户任务分组；现状列只描述当前实现，不代表验收通过。

| 页面 | 路由 | 用户任务 | 主要数据依赖 | 现状 |
| --- | --- | --- | --- | --- |
| 市场洞察（首页） | `/` | 今天市场发生了什么、该看什么 | `/api/market/summary`、`/api/market/indices`、`/api/breadth/current`、`/api/sectors/momentum|concept`、`/api/news?limit=6`、`/api/ai/market-insight`、`/api/ai/market-pulse`、`/api/industries?level=2` | 真实，AI 区块部分依赖上游；首屏信息密度高 |
| 宏观资金全景 | `/macro-hub` | 跨市场资金一张图 | `/api/macro/overview`、`/api/fund-flow/market`、`/api/north-bound/overview`、`/api/margin/overview`、`/api/risk-center/portfolio`、`/api/etf/list`、`/api/event-calendar/events` | 真实聚合，单块失败影响整页 |
| 宏观仪表盘 | `/macro` | 宏观周期与流动性 | `/api/macro/overview` | 真实 |
| 产业地图 | `/industry-map` | 产业链定位与公司归属 | `/api/industry-chains`、`/api/industry-chains/:id`、`/api/sectors/momentum`、`/api/ai/chat` | 真实图数据，AI 解读为可选 |
| 潜力雷达 | `/radar` | 从全市场找候选 | `/api/ai/gems` | 真实，结果依赖 AI 服务 |
| 资金流向 | `/fund-flow` | 主力、行业、市场资金 | `/api/fund-flow/global|industry|market|meta` | 真实，部分响应缺 `dataSource` |
| 事件日历 | `/event-calendar` | 未来催化与风险 | `/api/event-calendar/events` | 真实，三态已判定 |
| 股票列表 | `/stocks` | 浏览、筛选、进入研究 | `/api/stocks?pageSize=6000` | 真实；市值缺失显示 `—`，全量齐全才合计 |
| 个股详情 | `/stocks/:symbol` | 把一只股票看懂 | `/api/stocks/:symbol`、`/kline`、`/strategy`、`/api/valuation/:symbol`、`/api/fund-flow/:symbol`、`/api/ai/diagnose/:symbol` | 真实为主；估值/策略已接通；AI 诊断依赖上游 Key |
| 财务报表 | `/financials/:symbol` | 财务质量与变化 | `/financials/summary`、`/balance-sheet`、`/income-statement`、`/cash-flow` | 真实，四表各自加载 |
| 同业对比 | `/compare` | 同行业相对位置 | `/compare`、`/compare/radar` | 真实，指标定义需统一 |
| 指数详情 | `/index/:symbol` | 指数结构与强弱 | `/api/market/indices`、`/api/market/top-gainers`、`/api/market/top-losers` | 真实 |
| 板块详情 | `/sectors/:symbol` | 板块成分与资金 | `/api/sectors/momentum` | 真实，板块口径依赖后端 |
| 策略选股 | `/screener` | 按条件找股票 | `/api/stocks`、`/api/market/top-gainers|losers`、`/api/tech/batch`、`/api/ai/filter`、`/api/ai/gems` | 真实；AI 筛选依赖上游 |
| 研报 AI 摘要 | `/report-center` | 读研报与快讯 | `/api/news/research/reports?limit=50`、`/api/news?pageSize=50` | 真实抓取，摘要为本地抽取 |
| 龙虎榜 | `/top-traders` | 看游资与席位 | `/api/top-traders/overview`、`/api/top-traders/seat/rank` | 真实 |
| 解禁日历 | `/lockup-calendar` | 规避解禁冲击 | `/api/lockup/calendar` | 真实 |
| 北向资金 | `/north-bound` | 外资流向 | `/api/north-bound/overview` | 真实 |
| 融资融券 | `/margin-trading` | 杠杆资金 | `/api/margin/overview`、`/api/margin/rank/financing`、`/api/margin/trend` | 真实 |
| ETF 中心 | `/etf` | ETF 选择与溢价 | `/api/etf/list` | 真实 |
| 港股通 | `/hk-connect` | A/H 溢价与额度 | `/api/hk-connect/ah-premium`、`/api/hk-connect/summary` | 真实 |
| 大宗交易 | `/block-trades` | 大额成交与折价 | `/api/block-trades` | 真实，负净值守卫有缺口（已记录） |
| 自选组合 | `/watchlist` | 跟踪持仓与自选 | 本地 watchlist、`/api/stocks/batch/quotes`、`/api/tech/batch`、`/api/ai/watchlist-summary` | 真实 + 本地；复盘页嵌在 tab |
| 投资组合 | `/portfolio` | 记账与盈亏 | `/portfolios` 系列 | 真实，CRUD 可用 |
| 组合风控 | `/risk-center` | 组合风险与压力 | `/api/risk-center/portfolio`，本地风险引擎 | 真实；当前导航归在“宏观资金” |
| 回测 | `/backtest` | 验证策略 | `/api/backtest/run` | 真实，结果口径需固定 |
| 策略模板 | `/strategies` | 选策略并执行 | `/api/strategy-templates`、`/api/ai/strategy-recommend` | 模板接口曾返回 `static`，需标来源 |
| 多因子实验室 | `/factor-lab` | 因子有效性 | `/api/stocks/:symbol/kline`、`/api/financials/factor-series`，本地因子引擎 | 真实；首次 60–80 秒，已分阶段 |
| 投资笔记 | `/knowledge` | 记录研究结论 | 本地 knowledgeStore、markdown、可选 AI 润色 | 本地为主，未与个股打通 |
| 成长中心 | `/journey` | 习惯与激励 | 本地 gamification | 本地，与投研主线弱相关 |
| 404 | `*` | 错误路径兜底 | 无 | 系统页 |

另有 `/review`、`/market`、`/home`、`/index` 为别名或重定向，不单独计入页面。

### 6.3 页面级数据诚实缺口（P0，来自只读审计）

| 编号 | 位置 | 事实 | 影响 |
| --- | --- | --- | --- |
| H1 | `IndustryMapPage.tsx:391` | 链路详情请求失败后 `setSelectedChain(AI_COMPUTING_CHAIN)` 硬编码回退 | 用户看到的是演示链路，不是真实数据 |
| H2 | `PortfolioPage.tsx:105-107` | `catch` 内 `setError(null)` 吞掉异常 | 组合加载失败看起来像空组合 |
| H3 | `FinancialsPage.tsx:148-150` | 四表失败只 `logger.error`，页面只剩一句 Alert，无 dataSource | 无法区分“无财报”和“请求失败” |
| H4 | `DiscoverPage.tsx:1320`、`WatchlistPage.tsx:567-569`、`IndexDetailPage.tsx:213-217` | 仍存在 0 值兜底 | 空数据被显示成 0 |
| H5 | 33 个页面组件 | 只有 12 个真正读 `dataSource` 并改变渲染；`NorthBound/Screener/Watchlist/Review` 注释声称判定、实现未读 | 诚实角标形同虚设 |
| H6 | `ReportCenterPage`、`StockDetailPage`、`KnowledgeBase.tsx:523` | 研报不链个股；个股无研报/公告 tab；笔记“去 AI 对话”实际跳回首页 | 研究闭环断裂 |
| H7 | `FloatingChat.tsx:48-72`、`:307`；`ChatPanel.tsx:334-341` | AI 上下文只覆盖 7 类，不含 dataSource；数据 unavailable 时仍分析；失败走离线演示文案 | AI 可能在没有数据时给出结论 |

H1–H4 是诚实红线，不进入“以后再说”；H5–H7 与研究工作台方向直接相关，列入产品重构而非本次视觉试点。

### 6.4 IA 判断

一、导航的问题不是“页面太多”，而是分组按数据来源而不是按用户任务。用户想“研究一家公司”，却要跨个股研究、宏观资金、组合三个组。

二、“宏观资金”10 项超出单组可扫读上限；其中事件日历属于市场总览，组合风控属于组合与风控。

三、“投资笔记”是 featured，但与个股详情、研报、自选没有形成回路；这是研究型产品最该补的断点。

四、详情页（个股、财务、指数、板块）不做一级导航是对的，保持上下文进入。

### 6.5 建议调整（待批准，不在试点中实施）

| 调整 | 内容 | 影响 |
| --- | --- | --- |
| 组合风控归位 | 从“宏观资金”移到“组合与风控” | 仅导航位置，不改路由 |
| 事件日历归位 | 移到“市场总览” | 仅导航位置 |
| 拆分宏观资金 | 拆为“宏观”“资金与多资产”两组，各不超过 6 项 | 导航结构变化，需确认 |
| 研究入口合并 | 长期把“投资笔记 + 自选 + 个股”组织成研究工作台 | 涉及新页面与路由，属于产品重构 |

## 七、三页试点

### 7.1 范围

| 页面 | 试点目标 | 必须真实的区块 | 明确不做 |
| --- | --- | --- | --- |
| 首页 | 首屏三秒回答“今天什么状态” | 指数、涨跌家数、成交额、领涨板块、AI 市场解读 | 不重做全部首页，不改信息架构；先修 `DiscoverPage.tsx:1320` 的 0 值兜底 |
| 个股详情 | 研究结论与数据可信度同屏 | 现价、K 线、估值、策略、资金流、AI 诊断状态 | 不新增指标，不改路由；AI 诊断 unavailable 必须明示，不能显示演示结论 |
| 股票列表 | 缺失数据不伪装 | 全市场列表、市值列、统计条、筛选 | 不改表格交互契约；`dataSource` 目前仅标签，试点补真实判定 |

### 7.2 验收口径

| 项 | 通过标准 | 证据 |
| --- | --- | --- |
| 真实数据 | 关键区块有真实值，且显示 `dataSource` 与时间 | Playwright 截图 + 响应体 |
| 无空块 | 不允许出现只有标题没有内容、且无说明的区块 | DOM 扫描 + 截图 |
| 无 NaN | 页面文本不含 `NaN`、`Infinity`、`undefined`、`null` | Playwright `body.innerText` 断言 |
| 三态 | 断网/404/空数据三种注入下都有可读状态 | 路由拦截 + 截图 |
| 控制台 | 0 个未处理 error，已知 404 除外且需在文档列明 | Playwright console |
| 响应式 | 1280 与 768 两个宽度无横向滚动、无遮挡 | 截图 |
| 可访问性 | 键盘可 Tab 到主操作，焦点可见 | 手动 + 截图 |
| 无新增硬编码 | 试点新增/改动行不含未登记 hex；新增颜色只走 token | diff 审查 + `rg` |
| 诚实红线 | 试点页面无 0 值顶替、无静默失败、无硬编码回退 | 路由拦截注入空/失败响应 + DOM 断言 |

### 7.3 试点交付物

一、`DESIGN.md` 本文件评审通过。

二、三页改造 diff，动页面、`StateComponents` 与 `design-system.css` 的缺失变量补齐；不动全局导航，不做全站配色替换。

三、每页一张 1280 截图、一张 768 截图、一份状态注入记录。

四、`handover/` 下新增一页试点报告，列改动文件、验证命令、剩余缺口。

## 八、已知漂移与技术债

| 编号 | 现象 | 影响 | 处置 |
| --- | --- | --- | --- |
| D1 | 涨跌色 8 套并存，旧字面量 `#ef4444/#22c55e` 205 次 | 同页多种红绿，改 token 无效 | 保留 UI/图表两种用途；其余逐批换 token；新增 hex 即拒 |
| D2 | 状态组件 4 套空态、4 套加载、4 套错误、4 套骨架 | 页面状态不一致，自研组件空转 | `StateComponents` 为唯一接口；antd 原语收敛；死文件删除 |
| D3 | 多处 `formatChangePercent`、`formatPercent` 口径不同 | 0.15 可能显示 0.15% 或 15% | 新代码只用 shared 版本；旧调用逐页替换 |
| D4 | `dataSource` 有 `real/live/static/partial` 多种写法 | 角标误判 | 新接口统一四值；`static` 视为非实时 |
| D5 | 个股页直接 `fetch`，列表用 store/apiService | 错误处理不统一 | 试点引入 `AsyncBlock` 与统一请求封装 |
| D6 | 因子实验室首次 60–80 秒 | 用户以为页面坏了 | 已分阶段；文案改为“价格因子先出，财务因子随后” |
| D7 | 市值单位“亿元”与展示“亿/万亿”转换分散 | 易重复换算 | `formatMarketCapYi` 与 `parseMarketCapToYi` 单点 |
| D8 | 组合风控在宏观资金组 | 找不到 | 待批准后移动 |
| D9 | 投资笔记与个股未打通 | 研究无法沉淀 | 产品重构阶段处理 |
| D10 | 图表默认指标过多 | 首屏噪声 | 试点只保留价格、成交量、MA5/20，其余折叠 |
| D11 | 12 个 CSS 变量未定义，6 个无 fallback | 亮色错误、暗色靠继承 | 试点前补齐或改真 token；`used - defined` 归零 |
| D12 | `ThemeProvider` 把 antd success 映射为跌、error 映射为涨 | 成功/失败提示颜色语义倒置 | 价格涨跌与操作成败分槽，禁止复用 |
| D13 | 1882 个 hex / 137 文件；内联 fontSize 1155 处 | token 形同虚设 | 新代码只准 token；旧代码按页面批次替换 |
| D14 | `MarketIndexPanel` 返回 Tailwind 类名但项目未装 Tailwind | 7 处颜色无 CSS | 删组件或改内联/token |
| D15 | `optimizedComponents`、`Skeletons/index`、`Common/Skeletons`、`ChartSkeleton` 等 0 消费者 | 误导入即踩坑 | 删除或归档，禁止新增引用 |
| D16 | 页面级诚实缺口 H1–H4：硬编码回退、吞异常、只 logger、0 值兜底 | 用户看到假数据 | P0b 修复；H5 的 12/33 dataSource 判定列入 P2 |

## 九、迁移顺序

| 阶段 | 内容 | 退出条件 |
| --- | --- | --- |
| P0a 试点阻塞 | 补齐 12 个未定义变量；修 `StateComponents` 的 `EmptyState` 颜色；三页范围内替换旧涨跌字面量 | 三页亮/暗均正确，`used - defined` 为 0 |
| P0b 诚实缺陷 | 修 H1–H3：产业链失败不硬编码、组合失败不吞异常、财务失败有 dataSource；清理 H4 的 0 值兜底 | 注入失败响应后页面不显示假数据，三处均有可读错误态 |
| P0c 基线 | 本文评审；确定 canonical 组件与两套涨跌色语义 | 用户确认 |
| P1 试点 | 首页、个股、列表三页；新增 `AsyncBlock/Metric/SectionHeader`，真正接入 `ErrorState` | 三页验收全过，回归不红 |
| P2 收敛 | 全站替换 legacy 三态；205 处旧涨跌字面量换 token；统一格式化函数；导航归位 | `#ef4444/#22c55e` 生产归零（主题定义除外） |
| P3 重构 | 研究工作台、笔记回路、图表简化 | 按产品路线图另行立项 |

## 十、待批准

一、是否接受本基线作为 v1，并按三页试点推进。

二、是否批准导航归位（组合风控、事件日历）与后续拆分“宏观资金”。这属于用户可见交互契约变更。

三、是否接受“UI 涨跌色 / 图表涨跌色”双语义，而不是全站统一成一套红绿。

四、是否同意新增 `AsyncBlock/Metric/SectionHeader` 三个组件，先在试点使用。

五、产品方向是否按 `design/research-first-reframe.md` 的“研究工作台优先”推进。

六、是否同意先做 P0a（补齐变量、修复状态组件、试点范围换色）与 P0b（H1–H4 诚实缺陷），再做三页试点；还是只做三页试点、把全站 token 收敛留到之后。

七、是否接受“31 个页面中只有 12 个真正读 dataSource”这一事实，并把 H5 的判定补齐列入 P2；这会改变部分页面在接口失败时的表现。

## 附录、事实底稿

| 报告 | 路径 | 用途 |
| --- | --- | --- |
| 设计系统审计 | `/Users/ego_bai/Documents/deepseek-harness/default-workspace/handover/audit-design-system-2026-11-05.md` | token、状态组件、硬编码、涨跌色 8 套 |
| IA 与页面审计 | `/Users/ego_bai/Documents/deepseek-harness/default-workspace/handover/audit-ia-pages-2026-11-05.md` | 31 页路由、dataSource 诚实度、H1–H7 |

两份报告均为只读审计，产品仓 `frontend/src` 在审计期间无改动。

## 附录 C、P0 实施记录（2026-11-05）

| 项 | 状态 | 证据 |
| --- | --- | --- |
| P0a 12 个未定义变量 | 已完成 | `frontend/src/styles/design-system.css` 兼容别名块；`cssAndVisualization.test.ts` 断言 12 个 token 均已定义且无 `var(--text)` |
| P0a 状态组件颜色 | 已完成 | `StateComponents.tsx` 全部改用真 token，`#faad14/#f5222d/#1890ff` 已清零 |
| P0b H1 产业链失败 | 已完成 | 失败显示错误态与重试，不再回退 AI 算力链；失败注入截图 `handover/p0-industry-error.png` |
| P0b H2 组合失败 | 已完成 | 失败显示原因与重试，不再吞异常或伪装「未接入」；截图 `handover/p0-portfolio-error.png` |
| P0b H3 财务四表失败 | 已完成 | `Promise.allSettled` 逐表记录失败、`dataSource` 置 unavailable/partial，缺失项显示「—」；截图 `handover/p0-financials-error.png` |
| P0b H4 0 值兜底 | 已完成 | 行情/指数 K 线/情绪均值改「—」或剔除无效行，新增 3 个失败态测试文件与 14 个断言 |
| 三页对比度审计 | 已完成（真实项清零） | WCAG 4.5/3.0 脚本实测：亮色首页 28→5、个股 11→6、列表 3→3；暗色首页 7→3、个股 2→4、列表 2→1。剩余条目均为脚本对渐变背景、侧栏「澄观」渐变标题与 16px 主题图标的误报（图标按 3:1 已过），无真实正文/数值不达 AA |
| 768 平板横向溢出 | 已完成 | 根因是 `.app-content/.content-wrapper` 为 flex 子项但缺 `min-width:0`，另有 MultiSignalPanel 来源 Tag `nowrap`；修后个股 1164→768、列表 906→768，两页六档 docW=winW |
| P0a 三页亮/暗均正确 | 已完成（试点三页） | 2026-11-06 commit 8b7ce0567；首页/个股/列表 × 亮/暗 × 1440/768 共 12 组合 Playwright 实测：NaN 0、undefined 0、console error 0、pageerror 0、失败请求 0、docW=winW 无横向溢出；证据 `handover/evidence-pilot-final-report.json` 与 `handover/evidence-pilot-*.png` |
| P0a 三页旧涨跌字面量 | 已完成（涨跌语义范围） | `MarketSentiment`、`StockListPage`、`CapitalFlowPanel`、`MultiSignalPanel`、`MarketBreadthSection` 的涨跌/资金流/评分色已换令牌；DiscoverPage 的 ECharts canvas 热力色、固定深底 tooltip 与市场温度仪表盘保留独立 hex，原因是不解析 CSS 变量的 canvas 与「健康度」语义，不属涨跌色，已在源码注释与 `cssAndVisualization.test.ts` 的三页试点段 说明 |

验证：`npx tsc --noEmit` exit 0；6 个测试文件 138 passed；本地 Vite 生产构建成功；Playwright 注入 H1/H2/H3 失败响应均显示可读错误态。
