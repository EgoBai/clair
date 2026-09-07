# HANDOFF — 会话交接文件

> **任何 Agent / 新对话接手前必读。** 本文件是最新一轮工作的交接快照（更新于 2026-09-05）。
> 基础工程规范、架构陷阱、验证标准见 `MULTI-AGENT.md`（仍然有效）；团队分工见 `TEAM-STRUCTURE.md`。

---

## 一、任务背景（用户原始诉求）

1. **五维体检**：检查技术面/市场面/资金面/基本面/舆情面的数据准确性、展示合理性、UI 适配度，深度优化并立刻执行。
2. **P1 根治**：为 14 维矩阵搭建历史数据底座（KV 每日收盘落库 + v3 移植），解决"多维矩阵只有实时快照"问题。
3. **空壳清理**：CapitalFlowPanel 等 4 个从未挂载的组件逐一评估接入或删除。
4. **协作机制**：建立标准化任务交接（本文件 + TEAM-STRUCTURE.md + wb-issues 看板）。
5. **流程重组**：以多 Agent 协作模式重组开发流程，输出团队分工方案与职责矩阵。

## 二、仓库与工作位置

- 本沙箱工作副本：`/workspace/clair/`（zip 解压，**无 .git**，需要 git init 后打包推送）
- 线上前端：https://egobai.github.io/clair/ ｜ 线上 API：https://clair-api.pages.dev
- 核心改动文件：`clair-worker/worker.js`（单文件 Worker，改完须 `node --check` 并同步 `_worker.js`）

## 三、本轮已完成的改动（全部本地验证通过）

### A. Worker 数据层（clair-worker/worker.js）

| 改动 | 说明 |
|------|------|
| K线三源降级 `fetchDailyKLine` | 腾讯→新浪→东财容错，收编 6 处直连；修复 tech/batch 单源静默退化 |
| 市值/PB 真实化 | 删除硬编码 0，live quotes 直取 |
| 新闻多源 | 东财 getNewsByColumns(column=347) 主源 + 新浪兜底；个股新闻东财定向检索 |
| **v3-lite 引擎** | 14 维矩阵生产化：`SW_BOARD_CODES`(31 申万一↔东财 BK 精确同名映射)、`fetchBoardKline`(KV 优先→push2his 4 主机容错→陈旧 KV 降级→null)、`pctile` 线性插值(与 backend 同口径)、`computeV3Lite` |
| v3-lite 路由 | `POST /api/sectors/multidim-v3/batch`、`GET /api/sectors/:code/multidim-v3`、`GET /api/sectors/:code/multidim`(v2 五维投影) |
| **资金流端点** | `GET /api/fund-flow/:code`：个股 f62/f184/f66/f72/f78/f84 + 申万 31 板块主力净额排行（push2delay→push2 容错） |
| cron 落库端点 | `GET /api/cron/collect-history`（可选 CRON_TOKEN）：刷新 31 板块 K 线 + 追加 PE 历史 KV |
| market/summary 增强 | 新增 `avgChangePercent`（全市场平均涨跌幅） |
| **概念板块端点重写**（9-07） | `GET /api/sectors/concept`：旧实现按股票名正则猜标签（虚构红线）+ O(n²) 聚合（线上超时）→ 重写为东财概念板块清单直拉（504 个真实概念，与 fund-flow 同源同构），真实涨幅/上涨家数/成交额/领涨股；涨停数东财无字段→诚实 null |

**v3-lite 14 维数据可得性（诚实降级设计）**：实时 5 维（crowding/concentration/panic/volatility/spreadDegree）恒可算；板块日 K 3 维（recovery/leverage/fundFlow）依赖 push2his 或 KV；个股历史 4 维（diffusion/retail/momIndex/momentumPosition）如实 null；zScore 需 KV PE 历史≥20 点；searchHeat 无子行业数据 null。**任何维度缺数据返回 `score:null`+原因，绝不虚构**。

### B. 前端

| 文件 | 改动 |
|------|------|
| `DiscoverPage.tsx` | 「板块宽度」卡升级为「市场情绪」卡（消费 market/summary 涨跌家数/涨跌停/成交额/平均涨跌幅，不可用时诚实空态）；舆情维度正名（概念广度/涨停扩散）+ 真实权重文案；概念板块 null 兼容（limit_up_count null 时涨停 Tag 自动隐藏）+ 概念详情显示领涨股 |
| `components/Market/MarketSentiment.tsx` | 10 处亮色残留→暗色主题修复 |
| `StockDetailPage.tsx` | 挂载 CapitalFlowPanel：fetch `/api/fund-flow/${symbol}`，data null 不挂载（诚实降级） |
| `components/Market/CapitalFlowPanel.tsx` | 双向流入流出假条 → 单条净额方向条（标注东财无买卖拆分口径） |
| `RadarPage.tsx` | 雷达轴 120→100（与百分位模型一致） |
| `SectorDetailPage` | null 安全修复 |
| backend `sector-multidim.ts` | 5 处虚构分→null |
| **删除 7 空壳文件** | ModelExplanationViz.tsx、StrategyComparison.tsx、aiModelExplainer.ts 及 4 个对应测试（唯一数据源是随机数/硬编码绩效表）；`_archived/AIStockSelectionPage.tsx` 有残留 import 但被 tsconfig exclude，不参与编译 |

### C. 基础设施

- `.github/workflows/collect-history.yml`（新建）：cron `30 7 * * 1-5`（UTC，=北京时间 15:30 收盘后）+ workflow_dispatch，curl 调 collect-history 端点，支持 CRON_TOKEN secret。

## 四、验证结果（2026-09-05/07 本地端到端）

| 验证项 | 结果 |
|--------|------|
| 前端 `npx tsc --noEmit` | **0 错误** ✅（9-05 与 9-07 各复跑一次） |
| 受影响测试 8 文件 | **136/136 pass** ✅（capitalFlowPanel/MarketSentiment×3/stockDetailPageLogic/capitalFlowDepth/capitalFlowHeatmap/marketSentimentAnalysis） |
| worker `node --check` | 通过 ✅（含 9-07 概念端点重写后） |
| `POST /api/sectors/multidim-v3/batch` | 200，meta computed:4/4，银行 crowding=20(PE 全市场最低)等实时 5 维真实；历史维诚实 null ✅ |
| `GET /api/sectors/银行/multidim` (v2 投影) | totalScore=null + availableDimCount 2/5，前端已有对应展示 ✅ |
| `GET /api/fund-flow/600519` | source=eastmoney，茅台 mainNet 真实，sectorFlows 前 3（传媒/农林牧渔/食品饮料）✅ |
| `GET /api/cron/collect-history` | 31 板块全部尝试、失败诚实降级(ok:0)、不崩溃不虚构 ✅ |
| `GET /api/sectors/concept`（9-07） | **504 个真实概念**（首位 CPO概念 score=89 涨幅6.5% 领涨共进股份），node 直驱 203ms ✅ |

**⚠️ 沙箱验证方式说明（9-07）**：wrangler pages dev 在沙箱内异常（Ready 后连静态文件都挂起，疑似其把仓库根 node_modules 当 assets 扫描 + workerd 兼容问题）。**验证改用 node 直驱**：`import worker.js` + mock env(STOCK_DATA)/ctx 后直接调 `default.fetch(request, env, ctx)`，四端点全部秒级通过。生产为 Cloudflare 原生运行时，不受沙箱 wrangler 问题影响。复现脚本：`/tmp/verify-worker.mjs`。

## 五、未完成 / 待接续（按优先级）

### P0 — 部署（最高优先，阻塞一切上线）
**改动全部就绪且已 git 提交**（`f85969f` + `9ce9dd9`，`worker.js` 已同步 `_worker.js`），但线上仍是旧版。沙箱推送通道 9-07 全量复测结论：

- ❌ GitHub 直连 / api.github.com：000（网络墙）
- ❌ gh CLI：未登录；环境无任何 git 凭据/PAT
- ❌ github-remote MCP：WaitForMcpServers 返回 failed to connect（连接器状态显示 connected 与实际不符）
- ❌ CNB（cnb.cool 网络可达但）：token 端点明确报 `Connector "cnb-apikey" is not authorized`——连接器未授权
- ✅ gitee / cnb.cool 网络可达（但无凭据且与部署链路不通）
- ✅ **最新发布包已上传项目网盘**：`clair-release-20260905.tar.gz`（6.5M，file_id `UGlINKIdvXRc`，含全部改动）

**三选一（均只需一次操作）**：

1. **WorkBuddy 连接器设置重新授权 github**（推荐）：授权后 Agent 可直接推送 + 生产回归验证，全流程闭环。
2. **自取推送**：从项目网盘下载发布包 → 解压 → `git remote add origin https://github.com/EgoBai/clair.git && git push origin main`。
3. **授权 cnb-apikey 连接器**：CNB 网络可达，但需另配 CNB→GitHub 同步才能触发部署链路，成本高于前两者。

推送后按 `DEV-PLAN-5DIM.md` 第二节回归清单验证（curl 生产 API + 浏览器验证市场情绪卡/资金流卡/概念板块 Tab/多维矩阵）。

### P1 — 历史数据全路径验证（等网络环境）
- push2his（板块历史 K 线）在当前沙箱被出口 IP 封禁，`recovery/leverage/fundFlow` 三维与 KV 落库的**真实数据全路径**未验证（引擎降级路径已验证）。
- push2his 恢复后：手动触发 `curl https://clair-api.pages.dev/api/cron/collect-history`，确认 KV 写入 → 再调 batch 端点确认 3 维出真实分。
- KV PE 历史需累计 ≥20 个交易日后 zScore 维才会出分（每日收盘自动追加）。

### P2 — 流程落地
- wb-issues 共享任务看板建卡（见 TEAM-STRUCTURE.md §五）。
- TEAM-STRUCTURE.md 分工矩阵由主 Agent 在下次任务分派时启用。

## 六、已确认的技术事实（避免重复踩坑）

1. **东财行业板块与申万一级 31 行业 1:1 精确同名**（BK1200-BK1217 系列即申万 2021 分类），无需映射维护。
2. 沙箱内 push2his/push2 间歇性 000（WAF 按出口 IP 封禁），push2delay 稳定可用；Worker 内已做 4 主机容错。
3. 新浪申万指数 K 线不可用（sw2_801780 返回 null），勿再尝试该源。
4. GitHub Pages 前端 + Cloudflare Pages Worker 架构下，资金流等新端点必须做在 Worker（生产无 Express 后端）。
5. 前端 apiFetch 生产基址 = VITE_API_BASE（默认 clair-api.pages.dev）；vite dev 走 proxy→backend:3001。
6. vitest 4 配置：`.mts` 测试不被 `src/**/*.test.{ts,tsx}` include（既有行为，非遗漏）。
7. K 线单源直连会静默退化（腾讯 WAF 时逐 symbol 返回空壳）——一律走 `fetchDailyKLine` 多源。
8. **沙箱 wrangler pages dev 不可用**（9-07 确认）：Ready 后连静态文件都挂起（疑把仓库根 node_modules 当 assets 扫描 + workerd 兼容问题）。本地验证 worker 用 **node 直驱**：`import worker.js` + mock env/ctx 调 `default.fetch`（脚本 `/tmp/verify-worker.mjs`）。
9. **pkill 自匹配陷阱**：`pkill -f "workerd"` 会杀掉自身 bash（命令行含该字面量）。用字符类 `pkill -f "worke[r]d"`，且 pkill 与含目标字符串的启动命令分开执行。
10. 旧 `handleConceptMomentum` 的教训：`generateConcepts` 按股票名正则生成的概念标签是猜测数据，只可用于个股页参考展示（`/api/stocks` 输出），**不得作为板块聚合数据源**；概念板块级数据一律走东财 clist（fs=m:90+t:3）。

## 七、蜂群模式说明（回答用户疑问的存档）

多 Agent 蜂群**没有默认自动触发机制**：主 Agent 必须显式 spawn 并行子代理（单条消息多个 Agent 调用），且子代理不跨对话存活、不共享记忆——这就是"只有一个对话框生效过"的原因（那次是显式并行调度生效）。解法：本文件 + TEAM-STRUCTURE.md 把上下文外置，任何 Agent spawn 后先读这两份即可对齐。
