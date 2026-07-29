# 澄观 Clair 微信小程序迁移评估文档（D2 / S5-3）

> 文档性质：纯评估，仅用于拍板，**不修改任何 `src/` 代码**。
> 调研依据：真实 Read 了 `frontend/package.json`、`src/services/api.ts`、`src/services/sseClient.ts`、`src/services/aiClient.ts`、`src/store/useStockStore.ts`、`src/pages/DiscoverPage.tsx`、`backend/src/utils/sse.ts`、`backend/src/api/ai-chat.ts`、目录结构扫描。

---

## 一、迁移目标与范围建议

**目标**：用微信小程序实现"快速上线"的高频投研闭环，复用现有后端（Express + DeepSeek LLM 网关 + SSE）与绝大部分纯逻辑层，把 Web 端 31 个页面中最高频的 5–6 个先行落地。

**MVP 第一期建议页面（6 个，按优先级）**

| 优先级 | 页面 | 现有对应 | 取舍理由 |
|---|---|---|---|
| P0 | 市场洞察 DiscoverPage | `DiscoverPage.tsx` | 产品核心循环入口（大盘→板块景气→个股），含 AI 解读，是差异化所在，必须首发 |
| P0 | 个股详情 StockDetailPage | `StockDetailPage.tsx` | 用户"深挖"刚需，承接洞察页跳转，转化关键页 |
| P0 | 自选股 WatchlistPage | `WatchlistPage/WatchlistHubPage` | 个人留存核心，轻量、价值高 |
| P0 | AI 对话（流式） | 现内嵌于 DiscoverPage / 独立 tab | 澄观最大卖点，验证 SSE 流式在小程序可行性即应首发 |
| P1 | 选股 ScreenerPage | `ScreenerPage.tsx` | AI 选股是核心能力，但其筛选器 UI 复杂，建议 MVP 先做"模板选股"而非全自定义 |
| P1 | 资讯/快讯 News | `api.getNews` 已有接口 | 轻量列表页，补齐"看盘→决策"链路，成本低 |

**明确不放入 MVP（二期/三期）**：回测 Backtest、因子实验室 FactorLab、研报中心、风险中心、龙虎榜/融资融券/限售解禁等深度页（共约 25 个）。理由：依赖 recharts/复杂图表/重型引擎，单位迁移成本高、使用频次低，应在链路验证后再铺。

**结论立场**：MVP 必须"窄而深"——先做通"洞察→个股→自选→AI对话"闭环，而非广铺。金融小程序审核对功能广度敏感，窄 MVP 也降低合规暴露面。

---

## 二、技术选型对比（明确推荐：Taro 4.x React）

| 方案 | 评估 | 结论 |
|---|---|---|
| **Taro 4.x (React)** | 与本项目 React18+TS+Zustand 完全同栈；用户已用 Taro H5 验证过 13 个页面，踩坑已清；逻辑层/类型/Store 可直接复用 | **强烈推荐** |
| 原生小程序 (WXML/WXSS/JS) | 需彻底放弃 React/TS/Zustand 资产，所有 200+ 引擎、Store、API 层全部重写，团队无 WXML 积累 | **不推荐** |
| uni-app (Vue) | Vue 技术栈，与现有 React/TS 投资全部背离，复用率极低，且需重新验证 LLM/SSE 链路 | **不推荐** |

**推荐理由（有立场）**：选型唯一合理解是 Taro 4 React。原因有三：(1) 团队资产护城河在 React+TS，原生/uni-app 会让前端逻辑层报废；(2) 用户已有 Taro H5 原型经验，POC 风险已被压低；(3) Taro 4 对 React 18 + 函数组件 + hooks 支持成熟，Zustand 可在 Taro 运行时直接使用。

**关于"沿用 Taro"的再评估**：沿用而非另起炉灶。但需注意——历史 Taro H5 原型（`20260318120110/research-assistant-react/`）是 **H5 渲染**，而本次目标是**微信小程序原生渲染**，二者编译目标不同。原型验证的是"业务逻辑可跑"，不是"小程序 API 适配"，因此原型可作参考但**不能视为小程序可用代码**，仍需按本文档重写 UI 层。

---

## 三、兼容性审计（关键，逐条带落地方案）

### 3.1 antd5 → 不可用，须替换
- 事实：`package.json` 中 `antd@^5.12.2` + `@ant-design/icons`。antd5 基于 CSS-in-JS + 浏览器 DOM API，小程序运行时无 `document`/`window`，**直接编译失败**。
- 方案：UI 组件层全面重写。React 栈下首选 **NutUI React Taro（`@nutui/nutui-react-taro`）**（京东出品，React+Taro 适配完整，金融场景组件丰富），基础组件辅以 Taro 内置组件。放弃 antd5 全量迁移幻想。

### 3.2 recharts → 不可用，echarts 才是主路径
- 事实：依赖同时含 `recharts@^3.8.1`（10 个页面直接使用）与 `echarts@^5.4.3`+`echarts-for-react`（DiscoverPage 等主图使用）。**recharts 基于 SVG/DOM，小程序不可用**。
- 方案：图表统一切到 **echarts-for-weixin（`ec-canvas` 原生组件）**。好消息：项目 Web 端 echarts 的 `option` 配置对象是纯 JSON，**可直接复用到小程序 echarts**，仅需换渲染容器。recharts 专属的 10 个页面（FundFlow/MarginTrading/Portfolio/FactorLab 等）需将 recharts 声明重写为 echarts option——这是 MVP 外的主要工作量。

### 3.3 react-router-dom → Taro 路由
- 事实：`react-router-dom@^6.20`，页面用 `useNavigate`/`<Route>`。
- 方案：改用 Taro 路由（`app.config.ts` 声明 `pages` + `Taro.navigateTo`/`useRouter`）。导航语义需重写，但"页面→页面"业务流可 1:1 映射。

### 3.4 CSS 变量 / 深色主题
- 事实：`src/styles/theme-constants.ts` 定义 `THEME`（金融蓝 `#2962FF` 等），13 个页面使用 `var(--color-highlight)` 等 CSS 变量，`global-dark.css` 落地深色。
- 方案：**WXSS 支持 CSS 自定义属性**，主题 token（`theme-constants.ts` 的颜色常量）可原样复用；需把 `global-dark.css` 转为小程序全局 `app.wxss`（或 Taro 的 `global.scss`）。深色主题在小程序无系统级强制，建议默认深色 + 提供切换，沿用现有色板。

### 3.5 localStorage → Taro.storage
- 事实：`useStockStore.ts` 用 `zustand/persist`（底层 localStorage）；`pages/` 与 `services/` 多处直接 `localStorage`。
- 方案：persist 的 `storage` 适配器改为 Taro 实现（`Taro.getStorageSync/setStorageSync`）；散落的 `localStorage` 调用统一收口到封装。注意小程序单 key 上限与同步 API 性能，避免大对象。

### 3.6 SSE 流式（最关键限制，已查清后端）
- 事实（已 Read 后端）：`backend/src/api/ai-chat.ts` 的 `/api/ai/chat` 返回 `text/event-stream`，逐 token 写 `data: {json}\n\n`；前端 `aiClient.ts` 用 **`fetch` + `response.body.getReader()`（ReadableStream）** 消费。
- 小程序限制：微信小程序**无 `fetch`、无 `ReadableStream`、无 `EventSource`**，Web 端 `sseClient.ts`（EventSource）与 `aiClient.ts`（fetch 流）**均不可用**。
- **方案（重要，无需改后端）**：微信 `wx.request` 支持 `enableChunked: true` + `onChunkReceived` 回调，可在小程序内**原生接收 HTTP 分块/SSE 流**。客户端只需在 `onChunkReceived` 中手动累积并解析 `data: ...\n\n` 行，即可复用后端现有 SSE 协议，**后端零改造**。作为备选，若需双向/长连接（如实时盘口），再为后端加 WebSocket（`wss`）端点。
- **结论立场**：AI 流式对话在小程序**可行且几乎零后端成本**，这是 MVP 纳入 AI 对话页的底气；POC 必须优先验证此链路。

---

## 四、可复用层分析（含复用率估算）

### 4.1 可直接复用（逻辑层，≈40% 代码量价值）
- **`shared/types` + `src/types`**：纯 TS 类型，100% 复用。
- **`src/utils` 引擎（200+ 文件）**：绝大多数为纯计算函数（评分/因子/财务/信号引擎），无 DOM 依赖，**约 70–80% 可直拷复用**。需剔除 DOM 相关：`performanceMonitor`、`webVitals`、`swRegister`、`pwaManifest`、`ImageLazyLoader`、`gestureRecognition`、`workerManager`、`lazyLoad`、`routePerformance` 等（建议逐文件 grep 确认）。
- **Zustand Store（`useStockStore`/`useAppStore`/`useGamificationStore`）**：状态逻辑、selector、action 复用；仅 `persist` 的 storage 适配器替换。
- **API 业务逻辑**：`api.ts` 的缓存策略、重试、拦截器、函数签名可保留；**传输层 axios 须替换为 Taro.request/taro-axios**（axios 依赖 `XMLHttpRequest`，小程序无）。

### 4.2 必须重写（UI 层，≈60% 代码量但价值低）
- 全部 `src/pages/*`（31 页）：JSX 含 antd + DOM，0% 复用，重写。
- 全部 `src/components/*`：antd 组件封装，0% 复用，重写。
- `sseClient.ts`：EventSource 实现，重写（见 3.6）。
- `aiClient.ts`：fetch 流实现，重写（见 3.6）。
- 图表：recharts 页全重写；echarts 页保留 option、换容器。

### 4.3 复用率结论
- **逻辑/类型/Store 层可复用率 ≈ 40–45%**（按"避免重写的工作量"计）。
- **UI 层复用率 ≈ 0%**。
- 净效果：小程序并非"重做"，而是"重写外壳、搬运大脑"，整体工作量约为从零开发的 55–60%。

---

## 五、后端适配

1. **HTTPS + 域名白名单（硬要求）**：小程序 `wx.request` 只能访问**已在微信公众平台配置的 HTTPS 合法域名**。后端须部署到公网 HTTPS 域名（现有 `Dockerfile.prod` 端口 4000 可作部署基底）。开发期可勾选"不校验合法域名"调试。
2. **无需 CORS 改造**：小程序请求直接发往配置域名，不带浏览器跨域，后端现有 CORS 配置对小程序无意义（但保留无害）。
3. **SSE 无需改造**：沿用 `enableChunked` 消费（见 3.6），后端 `/api/ai/chat` 原样可用。
4. **若引入 WebSocket**：需额外配置"socket 合法域名"（wss），并在后端新增 WS 端点（当前后端已含 `socket.io` 依赖，可复用）。
5. **接口契约稳定**：前端 `api.ts` 的 REST 路径（`/stocks`、`/market/summary`、`/screener/filter` 等）与后端一致，接口层几乎免改，仅换 transport。
6. **鉴权**：`api.ts` 用 `Bearer` token，小程序侧需在 Taro.request 拦截器注入，逻辑一致。

---

## 六、分阶段路线

### 阶段 0 — POC（验证 3 大未知，1–2 页）
- 范围：Taro 4 React + TS 脚手架；深色主题 token 落地；**市场洞察页（简化版：大盘指数 + 板块景气评分表）**；API 适配层（Taro.request 封装复用缓存/重试）；**AI 流式对话打通**（wx.request enableChunked 解析 SSE）。
- 验收：① Taro 工程可编译为微信小程序开发者工具预览；② 洞察页从真实后端取数渲染；③ AI 对话能逐字流式输出（验证 SSE 在小程序可行）；④ echarts-for-weixin 至少 1 张图正常渲染。

### 阶段 1 — MVP（核心循环，6 页）
- 范围：市场洞察 / 个股详情 / 自选股 / AI对话 / 选股(模板) / 资讯快讯。
- 验收：6 页均可从真实后端取数；自选持久化（Taro.storage）；AI 流式可用；主包体积 < 2MB（必要时分包）；通过微信**体验版**内部全流程走通。

### 阶段 2 — 全量（剩余 25 页 + 进阶）
- 范围：回测、因子实验室、研报/风险中心、龙虎榜/融资融券/限售解禁等；recharts 页转 echarts；分包优化；性能压测。
- 验收：功能对齐 Web 端核心路径；小程序性能（首屏、图表帧率）达标；提交审核前合规自查通过。

---

## 七、风险与成本

1. **双端维护成本（高）**：Web 与小程序两套 UI 代码，逻辑层可共享但 UI 分叉，长期需双倍维护。缓解：把"大脑"（引擎/Store/类型/API 逻辑）抽到独立 npm 包，两端共同依赖。
2. **审核合规风险（最高，金融类目）**：微信对"金融"类目要求**企业主体 + 相关类目资质**。澄观含 AI 选股/诊断/推荐，易被认定为"证券投资咨询"，须具备《证券投资咨询业务资格证书》或仅做"行情/资讯展示"定位规避。MVP 阶段即应请法务/运营确认类目与文案边界，**这是项目最大不确定性，优先于技术排期**。
3. **图表性能（中）**：小程序 canvas 渲染 echarts，多图同屏（如个股详情）易掉帧、包体膨胀；须做图表懒加载、分包、降级。
4. **SSE 分块兼容性（中）**：`enableChunked` 在 iOS/Android 与开发者工具表现有差异，个别基础库版本有截断；POC 必须真机验证。
5. **分包体积（中）**：主包 2MB 限制，echarts 体积大，必须分包 + 按需引入 echarts 模块。

---

## 八、POC 范围建议（下一轮拍板依据）

**明确建议 POC 做以下 4 件事**，目标是在最小投入下消除 3 个最大技术未知：

1. **Taro 4 React + TS 工程脚手架**：配置深色主题 token 落地（复用 `theme-constants.ts` 色板），验证 React18+Zustand 在 Taro 小程序跑通。
2. **市场洞察页（简化版）**：板块景气评分表 + 大盘指数卡片 + 1 张 echarts-for-weixin 图，从真实后端 `/market/summary`、`/market/industries` 取数，验证"API 适配层 + 图表"链路。
3. **AI 流式对话验证**：用 `wx.request({enableChunked:true})` + `onChunkReceived` 解析后端 SSE，实现逐字输出，**证明后端零改造即可流式**。
4. **复用率实测**：将 1–2 个纯函数引擎 + 一个 Zustand Store 直接拷入 Taro 工程编译，实测复用率，校准第四节估算。

**POC 不做的**：不选股器复杂筛选、不接 recharts 页、不碰合规提交。POC 产出 = 可运行的微信开发者工具预览包 + 3 个验收结论 + 真实复用率数据，供下一轮拍板是否进入阶段 1。

---

## 附：调研事实清单（来自真实 Read）
- 前端依赖：antd@5.12、recharts@3.8、echarts@5.4+echarts-for-react@3.0、react-router-dom@6.20、zustand@4.4、axios@1.6、dayjs、socket.io-client。
- 页面数：31 个活动页（`src/pages/`，含 `_archived` 除外）；recharts 直接用于 10 页；echarts wrapper 用于 DiscoverPage 等；13 页使用 CSS 变量。
- Store：`useStockStore/useAppStore/useGamificationStore`，均用 `zustand/persist`。
- AI 流式：前端 `aiClient.ts` 用 `fetch`+`ReadableStream`；后端 `ai-chat.ts` 为 `text/event-stream` SSE（`data: {json}\n\n`）。
- 后端部署：Express，现有 `Dockerfile.prod` 端口 4000，SSE 工具 `src/utils/sse.ts` 无需为小程序改动。
