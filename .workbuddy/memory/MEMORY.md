# 澄观 Clair 项目记忆（a-stock-website）

> 仓库：~/.openclaw/workspace/a-stock-website/ （GitHub: EgoBai/clair）
> 主理人：WorkBuddy。自动化：automation-1784829898221（HOURLY;INTERVAL=6，当前 PAUSED）。

## 真实数据源架构（关键结论，2026-08-10 实测）

- **东方财富（免 key 直连）是后端资金流主真实源**：
  - 个股 `/api/fund-flow/:symbol` 与 `/batch` → `fetchFundFlow()` 直连 `push2.eastmoney.com/api/qt/stock/get`（fund-flow.ts:41），**不走 Tushare provider 链**。
  - 行业 `/api/fund-flow/industry` → `fetchIndustryFlow()` 直连 `push2.eastmoney.com/api/qt/clist/get`（正常路径真实；东财失败时诚实空态 `source:'unavailable'`，不再 demo 编造）。
  - 北向 `/api/fund-flow/global` → `fetchNorthBoundReal()` 直连 `push2.eastmoney.com/api/qt/kamt/get`，读 `sh2hk`(沪股通)+`sz2hk`(深股通) 当日净买入（亿元）。**注意：北向=外资买A股=sh2hk+sz2hk；hk2sh/hk2sz 是南向，易读错**。
- **Tushare**：token 已写入 backend/.env，但账号积分<120 且路由未实际调用它；**非资金流真实化阻塞**。
- **AlphaVantage**：用户未拿到 key；`/global` 离岸人民币无 key 时诚实空（`dataSource:'unavailable'`），不 demo。
- **腾讯自选股(westock)/通达信(tdx) MCP 已连（免 key）**：供 AI/前端侧真实消费（`data_fund_flow`/`data_north_holding` 等）。后端 Node **无法直接 import MCP**，若要后端接需走公开 HTTP 网关（稳定性待评估）。
- **诚实红线**（DESIGN-KB 硬约束）：接口空/失败如实置空（Empty + "后端未接入"），禁止 `catch{setData(buildDemoXxx())}` 编造。

## 验证方法论（沙箱环境）

- 后端 TS 验证：`backend/node_modules/.bin/esbuild entry.ts --bundle --packages=external --format=esm --outfile=_x.mjs` → `node _x.mjs`（输出到 backend/ 内以解析 node_modules）。
- **沙箱有本地代理**：node/axios 调公网会 400（host→127.0.0.1）。验证真实可达性需 `env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy HTTPS_PROXY= HTTP_PROXY= node ...`（curl 不受影响，可直接验证接口）。
- vitest 配置坑：`vitest.config.ts` 的 `include:['src/**/*.test.ts']` + root=backend/src 会双重 `src/` 扫描不到。临时解决：在 `backend/src/` 内建临时 config（`include:['__tests__/**/*.test.ts']`），`npx vitest run --config <tmp>.config.ts <filter>`，跑完即删（/tmp 放 config 解析不到 vitest/config）。
- 沙箱全量 `tsc --noEmit` 偶发 OOM 假错，用 esbuild 转译 + 定向验证替代。

## 进度

- D14 ✅（2026-08-10）：真实数据源全面接入。A 行业 demo 兜底→诚实空态；B 北向真实化+离岸诚实空。`fundFlow 155 测试全绿`，commit `f7f7539a7` 已 push。
- 下一步：POC 四件套（小程序迁移）、微信推送渠道评估（WorkBuddy 自有 vs 外部）、多 agent 蜂群分工（依据 clair后续执行计划_20260731.md）。

## 单通道红线

- automation PAUSED 期间主理人独占写入权。工作树有其 08-04~08-07 在途文件（PLAN.md / frontend/.workbuddy/automations/.../memory.md / playwright-report / ui-guard-report / memory/2026-08-0x-summary.md）**保持未提交，不碰**。
- 重启用 automation 须在所有 commit/push 之后（避免 immediate-fire 并行写库）。
