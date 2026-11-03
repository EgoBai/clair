# 澄观 Clair 微信小程序 POC — 预备设计与实施预案（D2）

> 文档性质：**纯预案文档**，**不修改任何 `src/` 源码**，只新建本文件。
> 目标：在最小投入下，产出小程序 POC 的"预备设计 + 实施预案"，供用户拍板是否进入 MVP。
> 核验原则：所有接口路径均来自真实 `backend/src/api/` 与 `backend/src/app.ts` 路由挂载，未编造接口。
> 前置材料：本预案继承 `design/miniprogram-migration-assessment.md`（Taro 4 评估已完成），在其结论上补全 **POC 四件套** 与 **待拍板项**，不重写其技术结论。

---

## 一、背景与目标

### 1.1 为什么做小程序 POC

- 现有 Clair 是 **Web 端单形态**（React18 + Vite + Ant Design5），投研闭环（发掘→筛选→自选→复盘）绑定桌面/移动浏览器。
- 高频投研场景（通勤看盘、自选异动、AI 闲聊诊断）天然适合"随手打开"的小程序入口；但金融类小程序**审核合规风险高**，且技术栈迁移存在 Web 特有依赖（antd5 / recharts / SSE fetch 流）。
- 因此先做 **POC（概念验证）**：用最小页面验证 3 个最大技术未知，再决定是否投入 MVP，避免合规+重写成本打水漂。

### 1.2 与网页端的关系

- **同源后端**：小程序直接复用现有 Express 后端（端口 3001，生产 `clair-api.pages.dev` / Dockerfile.prod 端口 4000），不新建 BFF。
- **复用"大脑"**：纯逻辑层（引擎 / 类型 / Zustand Store / API 业务逻辑）可复用约 40–45%（见第四节）；**UI 层 0% 复用**，需重写外壳。
- **定位为 Web 的"轻量伴随端"**：首发只做高频只读闭环（洞察→个股→自选→AI 对话），复杂深度页（回测/因子/研报/风险）留在 Web 端，降低合规暴露面。

### 1.3 MVP 范围（继承自评估，作为 POC 上游目标）

| 优先级 | 页面 | 现有对应 | 取舍理由 |
|---|---|---|---|
| P0 | 市场洞察（简化） | `DiscoverPage.tsx` | 产品核心循环入口，含 AI 解读，差异化所在 |
| P0 | 个股详情 | `StockDetailPage.tsx` | 用户"深挖"刚需，转化关键页 |
| P0 | 自选股 | `WatchlistPage/WatchlistHubPage` | 个人留存核心，轻量价值高 |
| P0 | AI 对话（流式） | 现内嵌于 Discover / 独立 tab | 澄观最大卖点，须验证 SSE 流式可行性 |
| P1 | 选股（模板） | `ScreenerPage.tsx` | 先做"模板选股"而非全自定义筛选器 |
| P1 | 资讯/快讯 | `api.getNews` 接口已存在 | 轻量列表，补齐"看盘→决策"链路 |

> 本预案的 **POC 范围仅取阶段 0**（见第八节四件套），不做上述 6 页全量。

### 1.4 POC 要消灭的 3 个技术未知

1. Taro 4 React 工程能否编译为微信小程序并跑通 React18 + Zustand。
2. 后端现有 SSE（`/api/ai/chat`）能否在小程序内**零后端改造**消费（wx.request enableChunked）。
3. 纯逻辑层真实复用率（校准 40% 估算）。

---

## 二、信息架构（核心页面树）

> 路径前缀统一为 `/api`。下列端点均经 `app.ts` 路由挂载 + `api/*.ts` 真实定义核对。
> `stock.ts` 挂载于 `/api`，因此 `/market/*` 实际由 `stock.ts` 提供；`market.ts` 提供 `/market/realtime`。

### 2.1 MVP 页面树（TabBar 结构建议）

```
Clair 小程序
├─ 行情 (tab)            市场洞察简化版
├─ 自选 (tab)            自选股列表 + 批量行情
├─ AI (tab)              AI 流式对话 + 诊断入口
├─ 资讯 (tab)            快讯/新闻列表
└─ 我的 (tab)            登录态 / 订阅消息开关 / 通知中心
```

下钻页（非 Tab，navigateTo）：
- 个股详情 `/stocks/:code`
- 板块详情 `/sectors/:code/multidim-v3`
- 资讯详情 `/news/:id`
- 大宗交易（P1 可选）`/block-trades`

### 2.2 各页面对应的真实后端接口

| 页面 | 调用端点（真实存在） | 来源文件 |
|---|---|---|
| 行情首页 | `GET /api/market/realtime`（真实指数+涨跌分布）<br>`GET /api/market/summary`<br>`GET /api/market/industries`<br>`GET /api/sectors/momentum`（31 行业景气）<br>`GET /api/sectors/concept` | `market.ts` `stock.ts` `sectors.ts` |
| 自选 | `GET /api/watchlist`<br>`POST /api/stocks/batch/quotes`（批量行情） | `watchlist.ts` `stock.ts` |
| 个股详情 | `GET /api/stocks/:symbol`<br>`GET /api/stocks/:symbol/kline`<br>`GET /api/indicators/:symbol`（MA/MACD/KDJ/RSI/BOLL）<br>`GET /api/ai/diagnose/:symbol`<br>`GET /api/fund-flow/:symbol`<br>`GET /api/news/stock/:symbol` | `stock.ts` `indicators.ts` `ai-analysis.ts` `fund-flow.ts` `news.ts` |
| AI 对话 | `POST /api/ai/chat`（SSE 流式）<br>`GET /api/ai/market-insight`<br>`GET /api/ai/sector-rotation` | `ai-chat.ts` `ai-analysis.ts` |
| 资讯 | `GET /api/news`（支持分页/分类）<br>`GET /api/news/:id`<br>`GET /api/news/stats/overview` | `news.ts` |
| 我的 / 通知 | `POST /api/user/login` `GET /api/user/profile`（Bearer）<br>`GET /api/notifications/user/:userId`<br>`POST /api/notifications` `PATCH /api/notifications/:id/read` | `user.ts` `notifications.ts` |
| （P1 可选）大宗交易 | `GET /api/block-trades` `GET /api/block-trades/overview` `GET /api/block-trades/:symbol` | `block-trades.ts` |
| （P1 可选）ETF | `GET /api/etf/list` `GET /api/etf/:symbol` `GET /api/etf/:symbol/nav-history` | `etf.ts` |
| （P1 可选）港股通 | `GET /api/hk-connect/*` | `hkConnect.ts` |

> 注：列表类端点（watchlist / news / alerts / screener 等）普遍带 `validateQuery` 分页与鉴权中间件；小程序侧按相同 query 契约调用即可，接口层几乎免改，仅换 transport（见第三节）。

---

## 三、与现有后端 API 对接方式

### 3.1 直接复用 REST，不引入 BFF

- POC 阶段**直接调用后端 REST**，无需网关/BFF。后端已是标准 Express + `sendSuccess` 统一响应包（`{ success, data, ... }`）。
- 接口契约稳定：Web 端 `api.ts` 的 REST 路径与后端一致，小程序只需把 axios transport 换成 `Taro.request`（axios 依赖 `XMLHttpRequest`，小程序无）。

### 3.2 HTTPS + 域名白名单（硬要求）

- 小程序 `wx.request` 只能访问**微信公众平台已配置的 HTTPS 合法域名**。
- 后端须部署到公网 HTTPS 域名（候选：`clair-api.pages.dev` 复用，或 Dockerfile.prod 端口 4000 新部署）。开发期可勾选"不校验合法域名"调试。
- **无需 CORS 改造**：小程序请求不带浏览器跨域头，后端现有 CORS 配置对其无意义（保留无害）。

### 3.3 鉴权（JWT Bearer）

- 后端 `middleware/auth.ts` 已实现 HS256 JWT：
  - `ACCESS_TOKEN_EXPIRY = 15min`，`REFRESH_TOKEN_EXPIRY = 7d`，`issuer = 'a-stock-api'`。
  - 登录：`POST /api/user/login`；受保护：`GET /api/user/profile`（`authMiddleware`）、`GET /api/watchlist` 等。
  - 刷新：`POST /api/auth/refresh`（后端已挂载）。
- 小程序侧实现：
  - token 存于 `Taro.getStorageSync/setStorageSync`（替代 localStorage）。
  - 在 `Taro.request` 拦截器注入 `Authorization: Bearer <token>`（与 Web `api.ts:176` 一致）。
  - 响应拦截器捕获 401 → 静默 `refresh` → 重放；refresh 失败则跳转登录。

### 3.4 诚实降级契约（必须继承）

- 后端真实源不可达时返回 `dataSource: 'unavailable'`（如 `market.ts` `/realtime`、`etf.ts`）。小程序 UI **必须**识别该字段并展示"后端未接入/数据不可达"空态，**绝不回填演示数据**（红线）。

---

## 四、前端复用可行性

> 本节结论直接继承自 `design/miniprogram-migration-assessment.md`，仅做落地口径确认。

### 4.1 技术栈推荐：**Taro 4.x（React）**

| 方案 | 评估 | 结论 |
|---|---|---|
| **Taro 4.x (React)** | 与项目 React18+TS+Zustand 同栈；用户已有 Taro H5 原型经验；逻辑/类型/Store 可直拷 | **强烈推荐** |
| 原生小程序 (WXML) | 放弃 React/TS/Zustand 全部资产，200+ 引擎重写，团队无 WXML 积累 | 不推荐 |
| uni-app (Vue) | Vue 栈与现有 React/TS 投资全部背离，复用率极低 | 不推荐 |

> 注意：历史 Taro H5 原型是 **H5 渲染**，与本次"微信小程序原生渲染"编译目标不同，只能作逻辑参考，不能当作可用代码。

### 4.2 必须重写的 Web 依赖（兼容性审计）

| Web 依赖 | 小程序问题 | 替代方案 |
|---|---|---|
| antd5（CSS-in-JS + DOM） | 无 `document/window`，编译失败 | **NutUI React Taro**（`@nutui/nutui-react-taro`）+ Taro 内置组件 |
| recharts（SVG/DOM） | 不可用 | 统一切 **echarts-for-weixin**（`ec-canvas`）；Web 端 echarts `option` 纯 JSON 可直接复用 |
| react-router-dom | 无浏览器路由 | Taro 路由（`app.config.ts` pages + `Taro.navigateTo`/`useRouter`） |
| CSS 变量深色主题 | WXSS 支持 CSS 自定义属性 | `theme-constants.ts` 色板原样复用，`global-dark.css` → 小程序全局 `app.wxss` |
| localStorage | 小程序无 | `Taro.storage` 封装；Zustand `persist` 换 storage 适配器 |
| SSE（fetch+ReadableStream） | 无 fetch/ReadableStream/EventSource | `wx.request({enableChunked:true})` + `onChunkReceived` 手动解析（见第五节） |

### 4.3 复用率结论

- **逻辑/类型/Store 层 ≈ 40–45%**（避免重写的工作量）：`shared/types`、`src/utils` 纯计算引擎（约 70–80% 可直拷，剔除 `performanceMonitor`/`webVitals`/`swRegister` 等 DOM 相关）、Zustand Store（仅换 persist 适配器）。
- **UI 层 ≈ 0%**：全部 pages/components 重写。
- 净效果：整体工作量约为从零开发的 **55–60%**，且 POC 必须实测校准该数字（见第八节四件套④）。

---

## 五、实时 / 离线数据策略

### 5.1 WebSocket vs 轮询

- **POC 采用轮询，不接 WebSocket。**
  - 后端实时行情由 `data-sync` 每 5 分钟同步（PROJECT-BRIEF），本身非秒级；小程序对"盘中异动"用 **5–10s 轮询** `POST /api/stocks/batch/quotes` 足够。
  - 后端 WS 是 **socket.io**（`websocket/server.ts`），微信小程序**无 socket.io 客户端**，需改用原生 `wx.connectSocket`（原生 WS）。POC 阶段不引入该复杂度。
- **若 MVP 确需实时盘口**：后端需新增一个**原生 WS 端点**（非 socket.io 协议）或 socket.io 的微信适配层，并在微信后台配置 `wss://` 合法域名。列为待拍板项（见第九节）。

### 5.2 AI 流式（关键，后端零改造）

- 后端 `/api/ai/chat` 返回 `text/event-stream`，逐 token 写 `data: {json}\n\n`（已核 `ai-chat.ts`）。
- 小程序用 `wx.request({ enableChunked: true })`，在 `onChunkReceived` 中手动累积字节流、按 `\n\n` 切分、解析 `data:` 行，即可逐字渲染。**后端无需任何改动。**
- 风险：`enableChunked` 在 iOS/Android/开发者工具表现有差异，个别基础库版本有截断 —— **POC 必须真机验证**（验收项）。

### 5.3 分包与体积

- 主包 **< 2MB** 硬限制；echarts 体积大，必须：
  - echarts 拆**独立分包** + 按需引入模块（仅引 line/bar/candle/kline 等所需 chart/component）。
  - 图表**懒加载**（进入个股详情再加载 ec-canvas）。
- 行情/自选/AI 三个主 Tab 放主包；资讯/我的及个股详情等可分包。

### 5.4 离线缓存

- `Taro.storage` 缓存：自选列表、最近浏览个股、市场 summary / 板块 momentum（低频、5min 级）。
- 缓存策略照搬 Web `api.ts` 的 cache + retry 逻辑（纯函数，可复用）。
- 启动先渲染缓存 → 再后台拉取刷新；识别 `dataSource:'unavailable'` 时回退展示缓存或诚实空态。

---

## 六、与 D1 微信推送的联动

> D1（微信推送渠道）在 MERGED-REPORT §4.2 已结论：**优先 WorkBuddy 自有渠道**，外部方案仅兜底。小程序侧有三种通知通道可组合。

### 6.1 微信订阅消息（subscribeMessage）

- 适用：自选异动、价格预警、复盘提醒等**低频、需用户主动触发授权**的场景。
- 限制：每次下发需用户曾点击触发（一次性模板），不能无限制主动推。
- 需后端配合：调用微信 `subscribeMessage.send` 需要 **access_token + 模板 ID**，需新增一个小程序服务端凭据管理（目前后端无微信小程序 AppSecret 配置）。

### 6.2 WorkBuddy 自有站内通知（原生优先）

- 后端已有通知中心：`GET /api/notifications/user/:userId`、`POST /api/notifications`、`PATCH /api/notifications/:id/read`、`GET /api/notifications/user/:userId/unread-count`（`notifications.ts`）。
- 这是小程序**站内通知中心**的数据源，可直接拉取 + 轮询未读。
- MERGED-REPORT §4.2 指出：WorkBuddy 项目留言 `@提及`（`mcp__wb-issues__project_message_add_or_reply`）可作为**零外部依赖的原生推送渠道**，触达 WorkBuddy 移动端/小程序用户。小程序内通知中心与 WorkBuddy 自有渠道互为补充。

### 6.3 现有 Web 推送资产可镜像

- 前端 `services/pushNotification.ts`、`services/notificationService.ts` 是 Web 端实现；小程序侧可参考其逻辑，但需改写为 `wx.request` + `Taro.storage` 版（无 Web Push API）。

### 6.4 联动建议（写入待拍板）

- POC 阶段：**只做站内通知中心**（拉取 `/api/notifications/*` + 未读角标），不接订阅消息。
- MVP 阶段：按业务优先级选 ①订阅消息 ②WorkBuddy 自有 @通知 ③站内中心，组合方案待用户拍板（见第九节）。

---

## 七、技术栈选型（汇总推荐）

| 层级 | 选型 | 理由 |
|---|---|---|
| 框架 | **Taro 4.x (React)** | 同栈 React18+TS+Zustand，复用"大脑"，风险最低 |
| UI 组件 | **NutUI React Taro** | React+Taro 适配完整，金融场景组件丰富，替代 antd5 |
| 图表 | **echarts-for-weixin（ec-canvas）** | 复用 Web echarts `option`；recharts 不可用 |
| 状态 | **Zustand**（换 `persist` 适配器为 `Taro.storage`） | 直接复用现有 Store 逻辑 |
| 请求 | **Taro.request**（封装缓存/重试/拦截器） | 替代 axios（无 XMLHttpRequest） |
| 流式 | **wx.request enableChunked + onChunkReceived** | 后端 SSE 零改造 |
| 存储 | **Taro.storage** | 替代 localStorage |

> 不推荐原生小程序 / uni-app 的理由见第四节 4.1。Taro 额外优势：可同一套代码**多端输出**（微信小程序 + H5 + 支付宝），是否要顺带出 H5 列为待拍板项。

---

## 八、实施里程碑与风险（POC 四件套）

### 8.1 POC 四件套（本预案核心交付物清单）

POC 的验收 = 以下四件套齐备，且 3 个技术未知被消灭。

#### ① 设计稿（Design）
- 交付：`Figma / 草图` 形式的小程序 **信息架构 + 关键页视觉稿**：
  - 行情首页（简化：大盘指数卡 + 板块景气评分表 + 1 张 echarts 图）
  - 个股详情（K线 + AI 诊断卡 + 资金流）
  - 自选列表
  - AI 对话页（流式气泡）
  - TabBar / 我的（登录 + 通知中心入口）
- 约束：沿用 Web 端深色色板（`theme-constants.ts`：金融蓝 `#2962FF`、红涨 `#ef4444`、绿跌 `#22c55e`、紫强调 `#667eea/#ec4899`），375px 无水平滚动。

#### ② 接口契约（Contract）
- 交付：**POC 接口清单文档**，逐端点列出：
  - 方法 + 路径（取自第二节表格，全部真实）
  - query / params / body（取自对应 `validateQuery/validateBody` schema）
  - 响应结构（`sendSuccess` 包 + `dataSource` 字段语义）
  - 鉴权要求（Bearer / 游客公开，如 `/api/market/realtime`、`/api/sectors/momentum` 为公开）
- 目的：锁定小程序侧 `Taro.request` 封装的输入输出，避免联调返工。

#### ③ 最小可跑 Demo（Minimal Runnable Demo）
- 交付：**可导入微信开发者工具的 Taro 4 工程预览包**，含：
  - Taro 4 + TS 脚手架，深色主题 token 落地，验证 React18+Zustand 跑通。
  - 行情首页简化版：从真实后端 `/api/market/realtime`、`/api/sectors/momentum` 取数渲染。
  - AI 流式对话：用 `wx.request enableChunked` 解析 SSE，逐字输出（验证后端零改造）。
  - 至少 1 张 echarts-for-weixin 图正常渲染。
- **验收标准**：
  1. Taro 工程编译为微信小程序开发者工具预览 ✅
  2. 洞察页从真实后端取数渲染（非 mock）✅
  3. AI 对话逐字流式输出 ✅
  4. echarts 至少 1 图正常 ✅

#### ④ 联调（Integration）
- 交付：**联调报告**，覆盖：
  - 真机（iOS + Android）验证 `enableChunked` SSE 分块无截断。
  - 鉴权全流程：登录 → token 存储 → 拦截器注入 → 401 刷新重放。
  - **复用率实测**：将 1–2 个纯函数引擎 + 1 个 Zustand Store 直接拷入 Taro 工程编译，实测真实复用率，校准第四节 40% 估算。
  - 主包体积 / 分包拆分验证（< 2MB）。

### 8.2 阶段路线（POC → MVP → 全量）

| 阶段 | 范围 | 验收 |
|---|---|---|
| 阶段 0（POC） | 脚手架 + 行情简化页 + AI 流式 + 复用率实测 | 本节四件套齐备，3 未知消灭 |
| 阶段 1（MVP） | 行情/个股/自选/AI对话/选股(模板)/资讯 6 页 | 6 页真实取数；自选持久化；AI 流式；主包<2MB；体验版走通 |
| 阶段 2（全量） | 剩余 ~25 页 + recharts 转 echarts + 分包优化 + 合规自查 | 功能对齐 Web 核心路径；性能达标；审核前自查通过 |

### 8.3 风险登记

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 审核合规（金融类目） | **最高** | 含 AI 选股/诊断易被认定"证券投资咨询"，需企业主体+资质 | MVP 即请法务确认类目与文案边界，优先"行情/资讯展示"定位；POC 阶段即评估，优先于技术排期 |
| 双端维护成本 | 高 | Web + 小程序两套 UI，UI 分叉 | 把"大脑"（引擎/Store/类型/API 逻辑）抽到独立 npm 包，两端共依赖 |
| 图表性能 | 中 | 小程序 canvas 渲染 echarts 易掉帧、包体膨胀 | 图表懒加载 + 分包 + echarts 按需引入 |
| SSE 分块兼容 | 中 | `enableChunked` 跨端差异/截断 | POC 真机验证（联调验收项） |
| 分包体积 | 中 | 主包 2MB 限制，echarts 大 | 分包 + 按需引入 |

---

## 九、待拍板项（需用户决策）

1. **技术栈最终确认**：是否采纳 Taro 4.x (React)？（评估已强烈推荐，需用户签字）
2. **合规类目定位**：小程序走「行情/资讯展示」定位（合规风险低）还是保留「AI 选股/诊断/推荐」（需证券投资咨询资质，风险高）？—— 决定审核策略与文案边界，影响 POC 范围。
3. **后端部署形态**：复用 `clair-api.pages.dev`（Cloudflare，但 PROJECT-BRIEF 标注其无 DB，部分端点生产不可用）还是用 Dockerfile.prod 端口 4000 新部署公网 HTTPS？小程序域名白名单需备案HTTPS域名，由谁提供？
4. **实时方案**：POC 轮询即可，还是要上原生 `wss`？（若上，后端需新增原生 WS 端点 + 微信 `wss` 域名配置，增加工作量）
5. **推送渠道组合**：站内通知中心 / 微信订阅消息 / WorkBuddy 自有 @通知，三选一或组合？是否接受 POC 仅做站内中心、MVP 再接订阅消息？
6. **POC 页面范围确认**：阶段 0 是否即「行情简化页 + AI 流式」（与评估一致），还是追加自选/个股其一？
7. **UI 组件库**：是否接受 NutUI React Taro，还是自研基础组件？（影响开发速度）
8. **多端输出**：Taro 是否顺带输出 H5（一套代码多端），还是仅微信小程序？
9. **后端新增能力边界**：订阅消息/原生 WS 如需，是否允许本轮在后端新增对应服务端凭据与端点（仍属源码改动，需单独授权，不在本预案 POC 纯文档范围内）？

---

## 九·补、决策锁定（2026-08-14，用户授权代决）

> 用户指示：六项无需逐项确认，依既有评估默认执行，统一排入后续开发计划；仅「公网域名备案」需用户届时亲自办理。

| # | 事项 | 锁定决策 | 备注 |
|---|------|---------|------|
| 1 | 技术栈 | ✅ **Taro 4.x (React)** | 继承 `design/miniprogram-migration-assessment.md` 结论 |
| 2 | 合规类目定位 | ✅ POC 走**「行情/资讯展示」**定位 | AI 结论一律标注「研究参考，非投资建议」；不做荐股话术，规避投顾资质风险 |
| 3 | 后端部署形态 | ✅ POC 阶段**本地/局域网调试**，不碰公网 | 正式公网部署需**域名备案——唯一需用户本人办理事项**，届时提醒 |
| 4 | 实时方案 | ✅ POC 用**轮询**（复用现有 REST 30/60s 缓存） | 原生 wss 后置到 MVP 之后 |
| 5 | 推送渠道组合 | ✅ **站内通知中心 + WorkBuddy 自有 @通知**（对齐 D1） | 微信订阅消息仅作正式版低频兜底 |
| 6 | POC 页面范围 | ✅ 阶段 0 = **行情简化页 + AI 流式** | 自选/个股详情进阶段 1 |
| 7 | UI 组件库 | ✅ **NutUI React Taro** | POC 速度优先，不自研 |
| 8 | 多端输出 | ✅ 仅微信小程序（POC 不顺带 H5） | H5 复用 Web 端即可 |
| 9 | 后端新增能力 | ✅ 本轮新增 `/api/market/kline`（历史回测依赖，属现有东财源延伸，无需第三方授权） | 订阅消息/wss 凭据端点待 MVP 阶段另行评估 |

### 排入后续开发计划（执行顺序）
1. **后端真实数据层补测**（消除 services 0% 覆盖，本轮进行中）；
2. **历史 K 线接口 + 约 40 个因子引擎真实回测接入**（本轮进行中）；
3. **小程序 POC 四件套**（设计稿/接口契约/最小可跑 Demo/联调，待上述数据层收口后启动）。

---

## 附：调研事实清单（来自真实 Read）

- 路由挂载：`backend/src/app.ts` 将各 `api/*.ts` 挂于 `/api`；`market.ts` 挂 `/api/market` 仅含 `/realtime`；`/market/summary|indices|industries|top-*` 实由 `stock.ts`（挂 `/api`）提供。
- 鉴权：`middleware/auth.ts` HS256 JWT，access 15min / refresh 7d，`/api/auth/refresh`、`/api/user/login`、`/api/user/profile`(authMiddleware)。
- AI 流式：`ai-chat.ts` 为 `text/event-stream` SSE；前端 `aiClient.ts` 用 fetch+ReadableStream（Web 专用，小程序需重写）。
- WS：后端 `websocket/server.ts` 为 socket.io（quote_update/market_summary/index_update 等），小程序无 socket.io 客户端。
- 通知：`notifications.ts` 提供 `GET /api/notifications/user/:userId`、`POST /api/notifications`、`PATCH /api/notifications/:id/read` 等站内通知中心接口。
- 真实数据源端点（已落地）：`/api/market/realtime`(腾讯gtimg)、`/api/etf/list`(东财)、`/api/hk-connect/*`(东财)、`/api/breadth/current`(东财push2，游客公开)。
- 诚实降级：市场/ETF 等端点源不可达返回 `dataSource:'unavailable'`，小程序须识别并空态展示，不回填。
- 前置评估：`design/miniprogram-migration-assessment.md`（Taro 4 评估已完成，本预案继承其技术结论）。
