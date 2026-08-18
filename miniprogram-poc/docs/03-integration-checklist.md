# 澄观 Clair 小程序 POC · ④ 联调清单（真机验证）

> 用途：POC 阶段 0 交付后，在微信开发者工具 + 真机（iOS/Android）逐项勾选验收。
> 覆盖 3 个技术未知 + 体积/域名/鉴权，逐条可勾选 `- [ ]`。

---

## A. SSE 分块（`enableChunked`）——最高优先级未知

- [ ] **A1 开发者工具**：AI 对话页发消息，`onChunkReceived` 能持续收到分块，逐字渲染无一次性倾倒。
- [ ] **A2 iOS 真机**：`enableChunked: true` 分块完整、无截断、无首帧丢失。
- [ ] **A3 Android 真机**：同上；特别验证「最后一帧 `data: [DONE]`」是否到达（个别基础库版本有截断）。
- [ ] **A4 分块边界**：按 `\n\n` 切分时，跨 chunk 的半包（半个 JSON 帧）能被正确累积拼接，不丢 token。
- [ ] **A5 基础库版本**：记录真机微信基础库版本，与后端 SSE `data: {json}\n\n` 协议兼容；若截断，记录是否需后端加心跳/换行垫。
- [ ] **A6 错误帧**：后端返回 `{"content":"\n\n⚠️ AI服务暂时不可用"}` 时，页面原样渲染该文案，不伪造内容、不卡死。

## B. 鉴权全流程

- [ ] **B1 登录**：`POST /api/user/login` 返回 `accessToken` / `refreshToken` / `expiresIn:900`。
- [ ] **B2 token 存储**：`Taro.setStorageSync` 写入 `clair_access_token` / `clair_refresh_token`，重启后可读取。
- [ ] **B3 拦截器注入**：受保护请求（`GET /api/watchlist`、`GET /api/user/profile`）自动携带 `Authorization: Bearer`。
- [ ] **B4 401 静默刷新**：access 过期（15min）后，拦截器捕获 401 → `POST /api/auth/refresh` → 重放原请求成功。
- [ ] **B5 刷新失败跳登录**：refresh 也失败（`REFRESH_TOKEN_INVALID`）→ 清 token → 跳登录页，无死循环。
- [ ] **B6 越权防护**：伪造/缺失 token 访问 `/api/watchlist` → 401 或 403 `IDENTITY_UNMAPPED`，前端展示登录引导。

## C. 复用率实测（校准 40% 估算）

- [ ] **C1 纯函数引擎**：拷入 1–2 个无 DOM 依赖的 `src/utils` 引擎（如评分/格式化）到 Taro 工程，编译通过且单测结果与 Web 一致。
- [ ] **C2 Zustand Store**：拷入 1 个 Store（仅换 `persist` storage 为 `Taro.storage`），状态逻辑跑通。
- [ ] **C3 复用率计数**：统计「直接拷贝 + 仅改 transport 的代码行数 / 总代码行数」，产出真实复用率数据，对照 40–45% 估算写偏差结论。
- [ ] **C4 DOM 依赖剔除清单**：`performanceMonitor`/`webVitals`/`swRegister` 等 DOM 工具确认未被打包进小程序。

## D. 主包体积 / 分包

- [ ] **D1 主包 < 2MB**：`npm run build:weapp` 后查看 `dist/` 主包体积，确认 < 2MB（硬限制）。
- [ ] **D2 echarts 体积**：echarts 使用**按需构建**（仅 line/candlestick/bar + 必要 component），`echarts.js` 单文件记录体积。
- [ ] **D3 echarts 懒加载**：K 线图在进入行情页时按需加载 `ec-canvas`，不在 app 启动即加载。
- [ ] **D4 分包策略**：若主包超限，把图表 / 个股详情拆分包，主包只保留行情/AI/我的三 Tab。

## E. 域名白名单（生产前置，POC 本地可暂缓）

- [ ] **E1 合法域名**：微信公众平台「request 合法域名」配置 HTTPS 后端域名（生产须备案，**用户届时办理**）。
- [ ] **E2 开发期调试**：勾选开发者工具「不校验合法域名」用于局域网 `http://<IP>:3001` 调试。
- [ ] **E3 生产 HTTPS**：后端部署公网 HTTPS（复用 `clair-api.pages.dev` 或 `Dockerfile.prod` 4000 端口），`Taro.request` 仅走 HTTPS。
- [ ] **E4 备案记录**：记录域名备案办理状态与负责人，避免上线阻塞。

## F. 页面验收（阶段 0）

- [ ] **F1 行情简化页**：三大指数卡 + 涨跌分布条 + 1 张 K 线图从真实 `/api/market/realtime` + `/api/market/kline` 取数渲染（**非 mock**）。
- [ ] **F2 诚实空态**：断网 / 后端源不可达时，页面展示「数据源暂不可达」空态，**无任何假数据**。
- [ ] **F3 轮询启停**：进入行情页启动轮询，`onHide` 停止、`onShow` 恢复，后台不空转。
- [ ] **F4 AI 流式页**：逐字流式输出 + `data: [DONE]` 结束态 + 页脚「研究参考，非投资建议」。
- [ ] **F5 涨跌色**：涨红 `#ef4444` / 跌绿 `#22c55e` / 平 `#6b7280`，与 Web 端一致。

## G. 运行前提记录（沙箱无法验证项，真机环境补齐）

- [ ] **G1 微信开发者工具**：本地已安装并导入 `miniprogram-poc/demo`（`npm run build:weapp` 产物）。
- [ ] **G2 npm 依赖**：`npm install` 全量成功（沙箱 npm 外网受限，需真实网络环境重装）。
- [ ] **G3 后端可达**：`http://<局域网IP>:3001` 可被真机访问（同一局域网），后端已 `npm run dev` 启动。
- [ ] **G4 Taro 编译**：`npm run build:weapp` 无报错，产出 `dist/` 可被开发者工具预览。

> 验收口径：A1–A6、B1–B6、F1–F5 全部勾选，且 C3 产出真实复用率、D1 主包 < 2MB，即判定「3 个技术未知」已被消灭。

---

## H. 后端契约独立复核（2026-08-14，team-lead 复核）

> 结论：**阶段 0 全部端点后端真实存在、路径/方法/契约与 `02-api-contract.md` 一致，无需后端改造**。下列证据来自 `backend/src` 真实源码 Grep，非编造。

| # | 端点 | 后端真实位置 | 复核 |
|---|---|---|---|
| H1 | `GET /api/market/realtime` | `api/market.ts:18`（`router.get('/realtime')`，挂 `/api/market`） | ✅ 一致 |
| H2 | `GET /api/market/kline` | `api/market.ts:38`（`router.get('/kline')`，queryCache TTL 10min） | ✅ 一致 |
| H3 | `POST /api/ai/chat`（SSE） | `api/ai-chat.ts:25`（`router.post('/ai/chat')`，`text/event-stream` 流式，`stream` 默认 true） | ✅ 一致 |
| H4 | `GET /api/notifications/user/:userId/unread-count` | `api/notifications.ts:176` | ✅ 一致 |
| H5 | `POST /api/user/login` | `api/user.ts:263`（返回 accessToken/refreshToken/expiresIn:900） | ✅ 一致 |
| H6 | `POST /api/auth/refresh` / `POST /api/auth/logout` | `app.ts:173` / `app.ts:174` | ✅ 一致 |
| H7 | `GET /api/financials/factor-series`（swarm-4 新增） | `api/financials.ts:102` | ✅ 一致（阶段 1 可用） |

**前端 Demo 侧调用一致性（Grep `miniprogram-poc/demo/src`）**：
- `services/api.ts` → `/api/market/realtime` `:36`、 `/api/market/kline` `:56`、 `/api/notifications/user/:userId/unread-count` `:70`、 `/api/user/login` `:98` —— 与 H1/H2/H4/H5 一一对应。
- `services/sse.ts` → `Taro.request({ enableChunked:true })` 至 `/api/ai/chat` + `onChunkReceived` 累积解析 `:62–73` —— 与 H3 一致，后端零改造。
- `services/request.ts` → 401 静默刷新 `/api/auth/refresh` 重放 `:42–53` —— 与 H6 一致。

**诚实结论**：沙箱无法运行微信开发者工具/模拟器，A1–A6、B1–B6、F1–F5、C1–C4、D1–D4 的真机勾选须用户本地执行（见 §I）。后端契约层面已无阻塞。

---

## I. 联调启动步骤（用户本地执行，沙箱无法代跑）

完成下列前置后，按 §A–§F 真机逐项勾选：

1. **I1 装依赖**：`cd miniprogram-poc/demo && npm install`（需真实网络；沙箱 npm 外网受限，已中断未同步，务必本地完整安装）。
2. **I2 起后端**：`cd backend && npm run dev`，确认 `http://<本机LAN_IP>:3001` 在局域网内可达（手机与电脑同网）。
3. **I3 改 BASE_URL**：`miniprogram-poc/demo/src/services/request.ts:10` 默认 `http://127.0.0.1:3001`；**真机调试须改为电脑局域网 IP**（如 `http://192.168.x.x:3001`），开发者工具勾选「不校验合法域名」（联调清单 E2）。
4. **I4 编译预览**：微信开发者工具导入 `miniprogram-poc/demo`，`npm run build:weapp` 产出 `dist/`，预览/真机扫码。
5. **I5 走查**：依次勾选 §A（SSE 分块）、§B（鉴权）、§F（页面）、§C（复用率）、§D（体积）。
6. **I6 诚实红线**：源不可达时页面须展示「数据源暂不可达」空态（F2），**绝不回填演示数据**。

> 备注：`miniprogram-poc/demo/package.json` 已声明 Taro 4 + NutUI + echarts + Zustand（2026-08-14 状态）；`package-lock` 未随 swarm-4 提交同步，I1 会由 npm 重新解析。

---

## J. 沙箱构建验证（2026-08-16，team-lead 实测）

为消除用户本地联调的安装/编译阻断，在沙箱实际跑通了 demo 依赖安装 + 微信小程序构建：

| 步骤 | 命令 | 结果 |
|------|------|------|
| J1 装依赖 | `cd miniprogram-poc/demo && npm install` | ✅ `added 1202 packages`（约 2 分钟，npm registry 可达） |
| J2 类型检查 | `tsc --noEmit`（scope=src，skipLibCheck） | ✅ **demo 自有 `src/` 0 类型错误**（node_modules/@tarojs 的 .d.ts 警告与 demo 无关，skipLibCheck 后归零） |
| J3 weapp 构建 | `taro build --type weapp` | ✅ `✔ Webpack: Compiled successfully`（3.65s），`dist/` 产出 |
| J4 依赖修复 | 缺失 `@babel/preset-react` 导致 J3 初始失败 | 🔧 已加入 `demo/package.json` devDependencies 并 commit+push（`840be8563`），用户本地 `npm install` 不再踩坑 |

**已知警告（非阻断）**：
- `AssetsOverSizeLimitWarning`：`pages/market/index.js` ≈ 546 KiB > 244 KiB 单资源建议值。总主包仍 < 2MB（联调项 **D1**），但 `market` 页体积偏大，建议后续按需分包/懒加载优化。
- `../../package.json` 重复 `description` 键的 webpack 警告（根仓库 package.json 小瑕疵，不影响构建）。

**结论**：demo 在沙箱已验证「可安装 + 可编译 + 可产出 dist」，I1/I4 的程序性阻断已消除。剩余仅真机勾选（§A–§F）、后端 LLM key 配置（使 `/api/ai/chat` 流出真实 token）、以及将 `BASE_URL` 改为局域网 IP（I3）。

---

## K. market 页体积优化（2026-08-19，team-lead 实测）

联调项 **D2** 体积优化落地：`src/components/EcChart/index.tsx` 改为仅注册市场页 K 线真正用到的模块。

| 版本 | `pages/market/index.js` | 说明 |
|------|------------------------|------|
| 初版（7 模块 + 含未用 LineChart/DataZoom/Legend） | ≈ 546 KiB | J4 实测基线 |
| **优化后**（仅 CandlestickChart/BarChart/Grid/Tooltip/CanvasRenderer） | **≈ 470 KiB** | ✅ 删 3 个未用模块，省 ~76 KiB |
| 误试：动态 `import('echarts/core')` | ≈ 1.05 MiB（恶化） | ❌ Taro weapp 把动态 import 降级为同步 `require`，破坏 tree-shaking，整包 echarts 内联 |

**关键结论（避坑）**：
- Taro/weapp 目标**不支持异步分包 chunk**（构建报 `NoAsyncChunksWarning`），动态 `import()` 反而让 webpack 内联完整 echarts（~1MiB）。故**静态 `echarts/core` 按需引入 + 保持 tree-shaking 是唯一正确杠杆**。
- `market` 是 **tabBar 页，必须留在主包，无法分包**；candlestick 自身较重，470 KiB 已接近该特性在「主包内」的体积下限。
- 244 KiB 仅是 webpack **软建议**；WeChat 主包**硬上限 2MiB** 仍满足（D1 通过）。若要进一步压到 <244KiB，需放弃 candlestick（UX 损失）或将图表移出 tab 页（架构改动），非单纯优化范畴。
