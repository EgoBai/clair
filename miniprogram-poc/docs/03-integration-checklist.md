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
