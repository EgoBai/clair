# 澄观 Clair 小程序 POC · ② 接口契约

> 文档性质：锁定小程序侧 `Taro.request` 封装的输入/输出，避免联调返工。
> 核验原则：**所有端点均来自真实 `backend/src/api/*` + `backend/src/app.ts` 路由挂载**，未编造。
> 阶段标记：`[阶段0]` 本次 POC 直接接入；`[阶段1]` 契约已核验、阶段 1 接入（占位）。

---

## 0. 通用约定

### 0.1 统一响应包（两种真实形态）

后端存在两种成功响应形态，小程序侧拦截器须同时兼容：

**形态 A（`sendSuccess`，多数端点）**：
```json
{ "success": true, "data": { ... }, "timestamp": "2026-08-14T00:00:00.000Z" }
```

**形态 B（手写 `res.json`，watchlist / notifications / user / ai market-insight 等）**：
```json
{ "success": true, "data": { ... } }          // 无 timestamp，部分带 total 字段
```

错误响应（`sendError` / 手写）：
```json
{ "success": false, "error": "...", "code": "UNAUTHORIZED", "timestamp": "..." }
```
> 401 统一 `code` 取值：`UNAUTHORIZED`（未认证）/ `TOKEN_EXPIRED`（令牌过期）/ `REFRESH_TOKEN_INVALID`（刷新失效）。

### 0.2 `dataSource` 字段语义（诚实降级红线）

| 取值 | 含义 | 小程序侧处理 |
|---|---|---|
| `real` | 真实源可达 | 正常渲染 |
| `realtime` | 真实源可达（block-trades 专用同义标记） | 正常渲染 |
| `unavailable` | 源不可达 / 参数非法 | **展示诚实空态，绝不回填演示数据** |
| `demo` | 确定性演示兜底（仅 `ai-chat.ts` 内部 `resolveStockData` 使用，标注「演示」） | 展示时注明「演示数据」 |

> 判断顺序：先看 `data.dataSource === 'unavailable'` → 空态；再看 `success === false` → 错误态；最后渲染 `data`。

### 0.3 鉴权

- **Bearer JWT（HS256）**：`Authorization: Bearer <accessToken>`。
  - access 有效期 **15min**，refresh **7d**，issuer `a-stock-api`（`middleware/auth.ts`）。
- 公开端点（无需 token）：`/api/market/*`、`/api/sectors/*`、`/api/etf/*`、`/api/ai/*`、`/api/hk-connect/*`、`/api/financials/*`、`/api/block-trades`、`/api/notifications/*`、`/api/user/login|register`。
- 需鉴权端点：`/api/watchlist*`（JWT）、`/api/user/profile`（JWT）。
- 401 流程：拦截器捕获 401 → `POST /api/auth/refresh` → 重放原请求；refresh 也失败 → 跳登录。

### 0.4 符号格式

后端接受多种 symbol 格式（`600519` / `600519.SH` / `SH600519`），内部归一为东财 `secid`。小程序统一用 `XXXXXX.SH|SZ` 带后缀格式。

---

## 1. 行情 / 市场（公开）

### 1.1 市场实时总览 `[阶段0]`
- **方法/路径**：`GET /api/market/realtime`（`market.ts:18`，挂 `/api/market`）
- **鉴权**：公开
- **缓存**：`apiCache` TTL 30s（`app.ts:105`）
- **query**：无
- **成功响应**（形态 A，`data` 内）：
```json
{
  "success": true,
  "data": {
    "dataSource": "real",
    "shanghai":  { "name": "上证指数", "price": 3241.0, "changePct": 0.42 },
    "shenzhen":  { "name": "深证成指", "price": 10542.0, "changePct": -0.18 },
    "chinext":   { "name": "创业板指", "price": 2100.0, "changePct": 0.61 },
    "breadth": {
      "up": 2210, "down": 2590, "limitUp": 42, "limitDown": 8,
      "turnoverYi": 9123.4, "upVolume": 0, "downVolume": 0, "volumeRatio": 0
    }
  },
  "timestamp": "..."
}
```
- **降级**：源不可达 → `data.dataSource: 'unavailable'`，`data.error` 为错误信息，**无指数/涨跌字段**。
- **小程序用途**：行情简化页三大指数卡 + 涨跌分布条；5–10s 轮询。

### 1.2 历史日 K 线 `[阶段0]`
- **方法/路径**：`GET /api/market/kline`（`market.ts:38`，挂 `/api/market`）
- **鉴权**：公开；缓存 TTL 10min（`queryCache`）
- **query**：
  - `symbol`：`600519` | `600519.SH` | `SH600519`
  - `days`：可选，非法/缺省回落 `DEFAULT_KLINE_DAYS`
- **成功响应**（形态 A）：
```json
{
  "success": true,
  "data": {
    "dataSource": "real",
    "symbol": "600519.SH",
    "dates": ["2026-02-01", ...],
    "opens": [...], "highs": [...], "lows": [...], "prices": [...],
    "volumes": [...], "amounts": [...]
  },
  "timestamp": "..."
}
```
- **降级**：`dataSource: 'unavailable'` + 七个空数组 + `message`（HTTP 200）。
- **小程序用途**：行情简化页 1 张 echarts K 线 + 成交量图（数据来自真实源 `push2his`，前复权日线）。

### 1.3 市场摘要 / 指数 / 板块景气度 `[阶段0·参考]`
| 端点 | 文件 | query | 说明 |
|---|---|---|---|
| `GET /api/market/summary` | `stock.ts:191` | `schemas.marketQuery` | 涨跌家数 / 成交额汇总 |
| `GET /api/market/indices` | `stock.ts:202` | 无 | 指数列表 |
| `GET /api/sectors/momentum` | `sectors.ts:110` | 无 | 31 行业景气度评分（`data.sectors[]` + `data.meta`） |

> 说明：`/market/summary|indices|industries|top-*` 实由 `stock.ts`（挂 `/api`）提供，非 `market.ts`。

---

## 2. AI（公开，`aiTiming` 中间件计时）

### 2.1 AI 流式对话（SSE）`[阶段0]`
- **方法/路径**：`POST /api/ai/chat`（`ai-chat.ts:25`，挂 `/api`）
- **鉴权**：公开
- **传输**：`Content-Type: text/event-stream`（**SSE 流式**）
- **body**：
  - `message`：string，**必填**（缺省返回 400 `{error:'Message is required'}`）
  - `context`：可选，`[{role, content}]` 消息历史
  - `stream`：可选，默认 `true`；`false` 时返回非流式 JSON
  - `symbol`：可选，注入个股上下文
  - `symbols`：可选 `string[]`，注入自选股上下文
- **流式响应**（逐 token）：每帧 `data: {"content":"..."}\n\n`，结束帧 `data: [DONE]\n\n`。
- **非流式响应**（`stream:false`）：`{ content, model, usage }`（无 `success` 包装）。
- **错误帧**（服务不可用）：`data: {"content":"\n\n⚠️ AI服务暂时不可用"}\n\n` + `data: [DONE]\n\n`。
- **小程序消费**：`wx.request({ enableChunked: true })` + `onChunkReceived` 累积字节，按 `\n\n` 切分、解析 `data:` 行 → 逐字渲染。**后端零改造**。
- **小程序用途**：AI 流式对话页。

### 2.2 单股 AI 分析 `[阶段1]`
- **方法/路径**：`GET /api/ai/analyze/:symbol`（`ai-analysis.ts:290`）
- **鉴权**：公开；**query**：`symbol`（path 参数）
- **成功响应**（形态 A）：`{ ...analysis, dataSource:'real', knowledgeReferences[], knowledgeConfidence }`
- **降级**：`dataSource:'unavailable'` + `message` + `data:null`（含知识溯源 `knowledgeReferences` 尽力返回）。
- **用途**：个股详情 AI 分析卡（阶段 1），标注「研究参考，非投资建议」。

### 2.3 知识库检索（RAG）`[阶段1]`
- **方法/路径**：`GET /api/ai/knowledge-search`（`ai-analysis.ts:469`）
- **query**（`validateQuery`）：
  - `q`：string，**必填**，1–200 字
  - `symbol`：可选，联动真实行情（提升置信度上限）
  - `limit`：可选，1–20，默认 5
- **成功响应**：`{ ...payload, dataSource:'real' }`；知识库缺失 → `dataSource:'unavailable'` + `message:'知识库暂不可用'`。

### 2.4 其他 AI 端点 `[阶段1·参考]`
| 端点 | 文件 | 说明 |
|---|---|---|
| `GET /api/ai/diagnose/:symbol` | `ai-chat.ts:266` | 个股诊断（`{diagnosis, dataSource}`，`dataSource` 可能为 `demo`） |
| `GET /api/ai/market-insight` | `ai-chat.ts:334` | 市场洞察（`{success, data: insight}` 形态 B） |
| `GET /api/ai/recommendations` | `ai-analysis.ts:268` | AI 选股推荐（观察池龙头） |
| `GET /api/ai/sector-rotation` | `ai-analysis.ts:364` | 行业轮动 |

---

## 3. 自选股（JWT 鉴权）`[阶段1]`

> 全部路由挂 `/api`，`router.use('/watchlist', authMiddleware)`（`watchlist.ts:20`）。
> 越权防护（F05）：从 JWT `sub` 解析 DB 用户 ID，**不信任** `query/body` 里的 `userId`；身份无法映射 → 403 `IDENTITY_UNMAPPED`。

### 3.1 自选列表
- **方法/路径**：`GET /api/watchlist`（`watchlist.ts:69`）
- **query**：`groupId`（可选）；缓存 10s
- **成功响应**（形态 B）：
```json
{ "success": true, "data": { "watchlist": [ { "id", "symbol", "name", "market", "industry", "addedAt", "notes", "closePrice", "changePercent", "volume", "turnover", "marketCap" } ], "groups": [ { "id", "name", "sortIndex" } ] } }
```
- **DB 缺失降级**（内存模式）：返回空 `watchlist:[]` + 默认分组。

### 3.2 增 / 删 / 改
| 方法/路径 | 文件 | body/params | 成功 |
|---|---|---|---|
| `POST /api/watchlist` | `watchlist.ts:141` | `{symbol, notes?, groupId?}` | 201 `{data:{stockId,symbol,name,groupId}}` |
| `DELETE /api/watchlist/:symbol` | `watchlist.ts:202` | path `symbol` | `{success, message:'已从自选股移除'}` |
| `PATCH /api/watchlist/:symbol` | `watchlist.ts:237` | `{notes?}` | `{success, message:'已更新'}` |

---

## 4. 通知中心（站内通知，公开）`[阶段0·入口]`

> 挂 `/api/notifications`（`notifications.ts`），以 `userId` 定位（阶段 0 仅用未读数角标入口）。
> 数据源为 `notificationService`（内存实现，重启即清）。

| 方法/路径 | 文件 | 参数 | 说明 |
|---|---|---|---|
| `GET /api/notifications/user/:userId` | `notifications.ts:13` | query `limit/offset/unreadOnly/type/priority/sortBy` | 列表（形态 B + `total`） |
| `GET /api/notifications/user/:userId/unread-count` | `notifications.ts:176` | path `userId` | `{success, data:{count}}` |
| `PATCH /api/notifications/:notificationId/read` | `notifications.ts:100` | path `notificationId` | 标记已读 |
| `PATCH /api/notifications/user/:userId/read-all` | `notifications.ts:117` | path `userId` | 批量已读 |
| `POST /api/notifications` | `notifications.ts:62` | body `{userId,type,title,body,...}` | 创建通知 |
| `DELETE /api/notifications/:notificationId` | `notifications.ts:131` | path | 删除单条 |

---

## 5. 港股通 / 财务 / 大宗交易（公开，阶段 1+ 参考）

### 5.1 港股通 `[阶段1+·参考]`
| 端点 | 文件 | 说明 |
|---|---|---|
| `GET /api/hk-connect/ah-premium` | `hkConnect.ts:130` | A-H 溢价排行（`data.data[]` + `exchangeRate` + `dataSource`） |
| `GET /api/hk-connect/summary` | `hkConnect.ts:190` | 今日沪深港通额度/净买（`data.data` 或 `dataSource:'unavailable'`） |

### 5.2 财务 `[阶段1·参考]`
| 端点 | 文件 | query | 降级 |
|---|---|---|---|
| `GET /api/financials/summary` | `financials.ts:80` | `symbol`（默认 600519） | `dataSource:'unavailable'` + 各表 `null` |
| `GET /api/financials/trends` | `financials.ts:102` | `symbol, metric, periods`（metric ∈ roe/roa/netMargin/grossMargin/currentRatio/debtToAssetRatio/eps/revenueGrowth/profitGrowth） | `values:[]` + unavailable |
| `GET /api/financials/balance-sheet` | `financials.ts:35` | `symbol, periods`(≤10) | `periods:[]` + unavailable |
| `GET /api/financials/income-statement` | `financials.ts:50` | 同上 | 同上 |
| `GET /api/financials/cash-flow` | `financials.ts:65` | 同上 | 同上 |

### 5.3 大宗交易 `[阶段1+·参考]`
| 端点 | 文件 | query | 说明 |
|---|---|---|---|
| `GET /api/block-trades` | `block-trades.ts:40` | `date?, symbol?, page?, pageSize?` | 列表 + `pagination` + `summary`，`dataSource:'realtime'` |
| `GET /api/block-trades/overview` | `block-trades.ts:107` | 无 | 概览（`industryDistribution` 恒为空，诚实不编造） |
| `GET /api/block-trades/:symbol` | `block-trades.ts:170` | `days`(≤365) | 个股历史 |

---

## 6. 用户 / 鉴权

### 6.1 登录 `[阶段0]`
- **方法/路径**：`POST /api/user/login`（`user.ts:263`）
- **body**：`{ email? | phone?, password }`（email/phone 二选一 + password 必填）
- **成功响应**（形态 B）：
```json
{
  "success": true,
  "data": {
    "user": { "id", "email": "脱敏", "nickname", "avatar", "roles", "status", "settings", "mfaEnabled", "createdAt", "lastLoginAt" },
    "token": "<旧格式兼容 token>",
    "accessToken": "<JWT>",
    "refreshToken": "<刷新令牌>",
    "expiresIn": 900
  }
}
```
- **失败**：401 `{success:false, message:'用户不存在或密码错误'}`。

### 6.2 注册 / 信息 / 刷新 / 登出
| 方法/路径 | 文件 | 鉴权 | 说明 |
|---|---|---|---|
| `POST /api/user/register` | `user.ts:186` | 公开 | body `{email?|phone?, password, nickname}`；201 返回同登录结构 |
| `GET /api/user/profile` | `user.ts:326` | Bearer JWT | 返回 `{success, data: user}` |
| `POST /api/auth/refresh` | `app.ts:165` | 公开 | body `{refreshToken}` → `{data:{accessToken, refreshToken, expiresIn}}` |
| `POST /api/auth/logout` | `app.ts:166` | Bearer JWT | 撤销当前 token |

---

## 7. 个股详情数据源 `[阶段1·参考]`

| 端点 | 文件 | 说明 |
|---|---|---|
| `GET /api/stocks/:symbol` | `stock.ts:89` | 个股基本信息 |
| `GET /api/stocks/:symbol/kline` | `stock.ts:103` | 个股日 K |
| `GET /api/stocks/:symbol/latest` | `stock.ts:81` | 最新行情 |
| `POST /api/stocks/batch/quotes` | `stock.ts:183` | body `{symbols[]}` 批量行情（自选列表批量刷新用） |
| `GET /api/indicators/:symbol` | `indicators.ts:18` | 技术指标（MA/MACD/KDJ/RSI/BOLL 另有独立子端点） |

---

## 8. 小程序侧 `Taro.request` 封装契约（落地结论）

1. **BaseURL**：POC 本地/局域网调试，配置为 `http://<局域网IP>:3001`（开发期微信工具勾选「不校验合法域名」）；生产须 HTTPS 合法域名（备案，用户届时办理）。
2. **拦截器**：
   - 请求：注入 `Authorization: Bearer <accessToken>`（存在时）；`Content-Type: application/json`。
   - 响应：先判 `data.dataSource === 'unavailable'` → 返回带标记的诚实空；再判 `success === false`；401 触发 refresh 重放。
3. **SSE 例外**：`/api/ai/chat` 不走 JSON 拦截器，走 `enableChunked` 分块解析（见 2.1）。
4. **Token 存储**：`Taro.getStorageSync/setStorageSync`，键 `clair_access_token` / `clair_refresh_token`。
