# TICKET-LEDGER · 任务台账（监工维护）

> 团队共享状态唯一真源（协议见 AGENT-TEAM-PROTOCOL.md §2.3）。
> 状态值：待派工 / 已派工 / 待复验 / 复验通过 / 已收口 / 打回 / 主循环在途 / 关闭

| 编号 | 目标 | 验收标准(摘要) | 文件域 | 执行者 | 状态 | 复验证据 / 关联 commit |
|---|---|---|---|---|---|---|
| T-2604-01 | 摘除 app.ts API 索引死端点宣传 | 索引无未实现端点；apiDocsEndpoint 25/25；esbuild 过 | backend/src/app.ts | 主理人 | 待派工 | — |
| T-2604-02 | shared/formatters/env 影子产物审计 | 语义比对有据；keep/delete 有理；build+定向测试过 | shared/formatters.{js,d.ts} shared/env.{js,d.ts} | wave1-worker | 已收口·d93b7d4fd+ac6876c2a | 监工四证：①读证 .gitignore:9/10 双规则在；git status 五文件正确（formatters.js/.d.ts 为 staged D，env.js/.d.ts 为 worktree D 待收口）；②测试证 frontend sharedFormatters.test.ts 空载复跑 56/56 绿（37s）；③行为证 git check-ignore -v 命中 .gitignore:9/10（exit 0）、rg 全仓显式 shared/*.js 扩展引用=0、磁盘保留 formatters.js 5662B/.d.ts 2777B；④逻辑证 消费方经 @shared 别名（vite.config.ts:21、vitest.config.ts:54）无扩展名导入，extensions .ts 先于 .js（vite.config.ts:24、vitest.config.ts:50），backend moduleResolution=bundler，env 零引用 → 磁盘 .js 无影子化通道 |
| T-2604-03 | allowlist 死豁免清偿+基线重生成 | —（主循环 2026-10-04 已执行） | scripts/guard/ | 主循环 | 已收口·b298ac2d5·主循环 | allowlist 23→13、baseline 13 条，第117轮自行收口 |
| T-2604-04 | deriveIndustryFromName 最长命中优先 | 20+ 样本回归；5541 三名单 diff 说明；6/6 绿 | shared/industryClassification.ts | wave1-worker | 复验通过·已收口·63bae0666 | 监工独立四证：①实现存在 industryClassification.ts:329-353（DERIVE_KEYWORD_ENTRIES 模块加载时按 kw 长度降序稳定排序）；②逻辑=最长命中优先/同长声明序/命中返回一级；③定向测试 backend subIndustryPerformance.test.ts 复跑 6/6 绿（58s）；④行为探针 7/7 PASS（平安银行→银行/比亚迪→汽车/招商银行→银行/宁德时代→电力设备/长城汽车→汽车/药明康德→医药生物/xyz→未分类） |
| T-2604-05 | D26-9 合规三件套评估 | 评估报告产出，不落地 | docs/ | 暂缓 | 待派工 | 待合规输入（留存期限） |
| T-2604-06 | route 层 dataSource 传播补全（#33/#39） | 拒供显式 dataSource；定向测试绿 | backend/src/api/ 逐文件 | wave2 | 待派工 | — |
| T-2604-07 | vitest 版本漂移收敛 | 版本对齐后 CI 仍绿 | frontend/package*.json | 主理人 | 待派工 | 择窗口 |
| T-2604-08 | D26-5 剩余欠账池 #37/#40/#41/#42 | 逐条核销 | 逐条声明 | 改进池 | 待派工 | —；其中 **#41 已实锤为代码 bug**（app.ts:295 /health version 硬编码 1.4.0 vs 启动横幅 :368 的 1.7.0，监工「陈旧进程」误判根因，2026-10-05 主理人确认），核销时改硬编码为单一版本源 |
| T-2604-09 | shared/env.ts 本体零引用死代码评估（validateBackendEnv/getEnv/isDev 全仓无调用点） | 评估删或留有据，报告级，不动手 | 只读 | 待派工 | 待派工 | 来源：wave1-shadow-audit 报告 |
| T-2604-10 | snapshots.test.tsx「EmptyStocks 应该渲染」10s 超时 flake 排查 | 定位定时器/异步渲染挂起根因；修复后该用例定向复跑稳定通过 | frontend/src/__tests__/snapshots.test.tsx 及组件域 | 待派工 | 待派工 | 来源：wave1-shadow-audit 报告（已双证与本删改无关） |
| T-2610-01 | IP-16 screener 选股恒空 | filter 返回 dataSource!='unavailable' 或 stocks>0；「底层数据库暂不支持复杂联合查询」清零；定向测试绿 | backend/src/api/screener.ts+advanced-screener.ts | fix-screener | 已派工 | 来源：qa-report-2026-10-05+用户指令 |
| T-2610-02 | IP-20 fund-flow 两级矛盾/五档空 | 两级 dataSource 一致；mainNet/smallNet 非空或显式一致 unavailable（附腾讯/东财源实测证据） | backend/src/api/fund-flow.ts | fix-fundflow | 已派工 | 来源同上 |
| T-2610-03 | FIX-ETF nav-history 符号格式 | 600519.SH 与 600519 一致非空 NAV 或一致 unavailable | backend/src/api/etf.ts | fix-etf-nav | 已收口·0c4cea97d | 监工四证：①读证 symbolUtils.ts:30 toBareCode（trim+upper+去前后缀）、etf.ts:91/120 调用点、middleware/validation.ts:108-109 pattern `/^\d{6}(\.(SH|SZ|BJ))?$/i`；②测试证 三文件空载复跑 41/41 绿（43s）——首跑 etf.test.ts:243 实锤 1 败（整包 body toEqual 含 timestamp 跨毫秒必然不等，同毫秒才过的隐 flake，worker 41/41 系幸运同毫秒）；监工按小额修正权改断言为剥离 timestamp 后比对业务负载，复跑 41/41 绿；③行为证 现存 :3001 为陈旧 v1.4.0 进程（suffixed 被旧 pattern `/^[0-9]+$/` 拒，且 banner v1.4.0≠磁盘 v1.7.0）——监工以当前磁盘代码起临时实例 :3099 实测：600519/600519.SH 一致 unavailable（同 symbol/message/空 history），510300/510300.SH 一致 real（history 首日 2026-09-30 nav 4.4312 完全相同），验证毕已关闭 3099；④逻辑证 ai-analysis.ts:31 import symbolUtils 的 toBareCode（:299-300 使用），rg 确认无本地 function/const toBareCode 定义，删本地副本无行为变化 |
| T-2610-04 | IP-19 factors IC 失效滞后 | EP/BP/SIZE valid=true+asOf≤30日，或 valid=false+如实 reason；禁 ic=0 假值 | backend/src/api/factors.ts | fix-factors | 已派工 | 来源同上 |
| T-2610-05 | 生产 vs 本地可用性矩阵 | ≥20 端点矩阵 + TOP 缺口排序（代码缺陷型/上游网络型/环境型）+ 新发现明细 | 只读 | audit-availability | 已派工 | 来源同上；只读审计不改码 |
| T-2610-06 | META-DS 诚实门禁固化（middleware+CI） | — | middleware+CI 域 | 主理人 | 暂缓 | 主理人择期 |
| T-2610-07 | P2 unavailable 集群备用数据源（腾讯通道）评估 | — | 评估报告级 | 主理人 | 暂缓 | 待 T-2610-05 矩阵出来后排期 |

## 在途保护清单（禁止触碰，单通道红线）
- 主循环 automation-1784829898221 记账在途：PLAN.md、.workbuddy/memory/*
- 报告/产物：frontend/playwright-report/、frontend/scripts/ui-guard/.ast-findings.json、frontend/ui-guard-report.md
- （2026-10-04 起 scripts/guard/allowlist.json、scripts/guard/honesty-baseline.md 已随 b298ac2d5 收口，移出保护清单）

## 变更日志
- 2026-10-04 台账建立（主理人），wave-1 派工 2 项；T-2604-03 记主循环在途。
- 2026-10-04 T-2604-04 监工独立四证复验通过，记已收口 63bae0666；T-2604-03 记已收口 b298ac2d5（主循环第117轮），guard 两文件移出保护清单。在途剩 T-2604-02（wave1-shadow-audit 运行中）、T-2604-01（主理人域择期）。
- 2026-10-04 登记 T-2604-09（env.ts 死代码评估）、T-2604-10（snapshots flake 排查）入待派工池（来源 wave1-shadow-audit 报告）；T-2604-02 复验暂缓，待 worker 根治扩展项（.gitignore + git rm --cached）回报后做整体四证（含 git check-ignore 命中验证）。
- 2026-10-04 T-2604-02 监工四证终验通过（56/56、check-ignore 命中、无 .js 显式引用、解析优先级 .ts 先），记复验通过·待收口，待主理人 commit（chore/fix 各一）。
- 2026-10-04 T-2604-02 已收口两笔：d93b7d4fd（fix: 删 env.js/env.d.ts）+ ac6876c2a（chore: gitignore 禁令）；监工核 origin/main 已追上、shared/ 与 .gitignore 索引全净。wave-1（T-2604-02/04）全部闭环，台账在途清零，余单均待主理人排期。
- 2026-10-05 数据可用性专项（P0 波次）登记 7 单：T-2610-01~04 已派 4 个 fix worker（文件域零交集并行）+ T-2610-05 派 audit-availability（只读）；T-2610-06/07 暂缓。worker 回报后逐单四证复验，全波收口后出里程碑汇总。来源：qa-report-2026-10-05 + 用户指令。
- 2026-10-05 T-2610-03 监工四证终验通过（待收口）。两个附带发现：①etf.test.ts:243 隐 flake 已修（timestamp 竞态断言）；②长期挂跑的 :3001 后端为陈旧 v1.4.0 进程，验证行为须以当前代码新起实例为准，重启归属主理人/进程所有人决策。
- 2026-10-05 T-2610-03 已收口 0c4cea97d（含监工隐 flake 修复）；:3001 已重启为工作树代码+PG 真实连接；#41 实锤代码 bug（health 版本硬编码）记 T-2604-08；此后行为实测基准=新进程，fix-screener/fix-fundflow 落盘后主理人将再重启。

## 2026-10-06 上午 · 主理人四证收口 + 生产架构 A 打通（用户三项拍板落地）
- **用户拍板（已登记 DECISION_LOG.md）**：① 生产架构 **A**（Express 241 端点部署到托管平台）；② 看板自动化 `automation-1786816465504` **永久停用**（保持 PAUSED，禁止再启用，刷新改手动跑 gen_dashboard.py）；③ D26-9 合规留存期限 **1 年**（外推 T-2604-05 合规三件套：留存 1 年 / 导出权 / 授权同意）。
- **T-2610-01 已收口 fe137850a**：dbFactory Proxy 对 `connection` 原样返回（bind 会剥离 knex 属性，曾致 screener 在 PG 模式恒伪降级）+ advanced-screener 真实库 schema 探测。四证：esbuild 5/5 转译过、定向测试 234/234 绿（12 文件空载）、e2e 实测 `/api/screener/filter` 返回真实个股（善水科技 301190.SZ +20.01%）、advanced-filter 同。**IP-16 选股恒空根治。**
- **T-2610-02 已收口 661ce1c4e**：东财 push2 主源 + 新浪备源、8s 超时、缺档即废该源、normalizeSymbol 三格式归一、修 f184（主力净占比%）被当 mainNet 净额的**数值失真**。四证含 e2e：`/api/fund-flow/600519` 返回真实主力净额 7.44 亿、`dataSource:"sina"`。
- **T-2610-04 已收口 2a4b31029**：日频快照 + horizon [1,5,10] + 单因子 available/reason 诚实降级 + 时区 bug。四证含 e2e：`/api/factors/overview` → `coverage:5541`、`observations:639108`、EP `ic=-0.0154` 真实且 `reason` 如实说明未达阈值、**无 ic=0 占位假值**。
- **#41 已核销 df19cb002**：`/health` 硬编码 1.4.0 vs 根路径 1.7.0 → 提取 `APP_VERSION` 单一真源；实测 health 与根路径均返回 1.7.0。
- **T-2610-11 立项并已交付前段（6e47eba2f）**：生产架构 A 打通「源码 → 可运行容器」。实测踩三堵墙：① tsconfig 未设 rootDir 致产物在 `dist/backend/src/index.js` 而 start 指向不存在的 `dist/index.js`（生产 npm start 必崩，被长期 tsx dev 掩盖）；② ESM 无扩展名 ERR_MODULE_NOT_FOUND；③ `@shared/*` 运行期不存在。⟹ 生产产物改 **esbuild bundle**（CJS 单文件 `dist/server.cjs`，实测 `node dist/server.cjs` 起得来且 health 1.7.0+PG）；Dockerfile 重写（原版从未被验证过）。方案见 `docs/deploy/EXPRESS-DEPLOY-PLAN.md`。
- **⚠️ 新登记硬前置（未做则部署=更差）**：生产数据只在**本机** PG，托管平台须配托管 PG 并用 pg_dump 迁移。**只搬容器不搬数据 → 退回内存库全站诚实空态，比现在更差**，故列 T-2610-11 的第一优先级子项。
- **平台选型待用户拍板**：Railway / Render / Fly.io（对比见方案 §四）；主理人建议 Railway 但**国内可达性必须先实测**（面向国内用户，平台打不开等于把 404 换成超时）。
- **单通道**：本轮开工前 `automation-1784829898221` 已置 PAUSED（在途生产源码在途防并行改库），收口 + push 干净后可恢复 ACTIVE。

## 2026-10-06 下午 · P0「数据不可用」根治波次（7 单并行 · 主理人四证在握）
- **诊断方法（非逐页打补丁）**：`/tmp/scan-availability.mjs` 交叉比对「后端 241 登记端点 × 前端 44 条静态调用路径」，逐条真实请求并**按响应体判定**（不看状态码）→ 产出 `/tmp/availability-matrix.json`。**抓出隐性缺陷：响应体已诚实标`dataSource:'unavailable'` 但 HTTP 仍 500，前端走 catch 根本不解析 → 页面报错而非空态。**
- **6 类根因**：A 生产供给面缺位（14 端点生产 404，Express 从未上生产）/ **B 状态码语义错（3 端点 500）** / C 前后端契约断裂（5 条前端死链 + 1 处上游错误码透传）/ D 上游源不可达（13 端点）/ E 薄响应无契约（17 端点）/ F 限流（**主理人自查排除**：429 系扫描并发所致，限流 120/min，低并发复测全200 → 降 P2 观察）。
- **已收口**：`b9b0564e2`（T-2604-06，8 端点补 dataSource + 2 真 bug：500 分支硬写 `real` 的红线矛盾、`NaN%` 伪统计）101 测试绿、门禁 exit 0、已 push；`a9d79ad30`（P0-4 阶段：9501/9201 区分 + 概览日期取真实 tradeDate + 12 条契约断言 8绿4红，4 红待service 修复）。
- **⚠️ 三次根因纠偏（工单前提被实测推翻，已逐条独立复验）**：
  ① 「unavailable 集群接腾讯备源」方向对 4 端点**物理不可行**——腾讯公开接口只有板块排行 + qt.gtimg.cn 逐标行情两类，无龙虎榜/北向/两融/解禁/ETF 清单/净值。真因是**报表名写错/日期窗口太窄**：解禁 `RPT_LCX_XFXJMX`(9501 不存在)→正确 `RPT_LIFT_STADE`（71 页真实）；龙虎榜 `RPT_DAILYBILLBOARD_DETAILSNEW` 9/30 有 84 页但回溯 6 天错过；两融报表整体下线（抽查 3 个全 9501）。
  ② 北向 `RPT_MUTUAL_DEAL_HISTORY`（2525 页）里 `NET_DEAL_AMT`/`FUND_INFLOW`/`BUY_AMT`/`SELL_AMT`/`QUOTA_BALANCE`/`ACCUM_DEAL_AMT` **全为 null**（交易所已停止披露全部资金流口径）→ 只有成交额+领涨股可得，**禁止用成交额倒算净买额**。
  ③ 大宗交易「返回字段参数不能为空」**是我方代码零命中的文案**，是东财 9501被 `blockTradesDataService.ts:146` 透传；真因是该 service 用了**全仓唯一**的废弃端点 `/api/data/get?type=`（另 6 处已迁 v1），v1 `RPT_DATA_BLOCKTRADE` 实测 34 万页真实数据 + 字段名全变 + `PREMIUM_RATIO` 为无量纲小数（需核对契约单位决定 ×100）。
- **新发现·测试假象**：`__tests__/tradingCalendar.test.ts` 与 `tradingCalendarEngine.test.ts` 是**在测试文件内自己定义 isWeekend 再测自己**，生产代码**无交易日历模块**；而约 20 个文件各用「今天」作默认查询日期 ⟹ 节假日/长假必空（每年复发）。已派 `build-trading-calendar`：从 PG `daily_quotes` DISTINCT trade_date **反推真实交易日**（优于硬编码节假日表）+ `resolveQueryDate()` 返回 `isFallback` 供上层如实告知"数据截至 09-30"。
- **在跑 7 单（文件域零交集）**：P0-2 `fix-5xx-semantics`(ai-chat.ts 状态码语义) / P0-3 `fix-fe-deadlinks`(前端 5 死链，含 useNetworkStatus 调错 `/api/health` → 或整站显示"离线") / P0-4 `fix-blocktrades`(service 迁 v1，已批扩域) / P0-5A `fix-breadth-etf`(腾讯 gtimg 全市场 5544 只算涨跌家数) / P0-5B `fix-lockup-toptraders`(报表名+日期窗口) / P0-5C `fix-northbound-margin`(北向换源+两融诚实降级) / P0-5D `build-trading-calendar`(交易日历基础设施)。
- **纪律**：worker 自报一律独立复验（本轮已 3 次推翻工单前提、1 次推翻自研429 判断）；tsx 无热重载，改后端必重启才有效测；沙箱 `grep` 用 `rg`、全量 tsc/vitest OOM 出假错须用 esbuild + 空载单跑；`git add` 只写明确路径，严禁 `git add -A`；worker 一律不 push，由主理人统一收口。

## 2026-10-07 凌晨 · 「本地 vs 线上不一致」最高优先级波次（用户拍板）
- **用户将「本地开发环境与线上部署版本不一致」定为最高优先级**，要求系统性定位 + 建立同步机制 + 核对昨日需求落地状态。
- **根因（读 CI 配置即坐实，非猜测）**：`deploy.yml` 触发条件 `push→main`（每次都发前端），`deploy-worker.yml` 触发条件 `push→paths:['clair-worker/**']`（几乎不发）⟹ **`backend/src/` 的 241 个 Express 端点从无部署路径**，前端每天自动上线、后端永不上线，两端版本必然错配且**随每次迭代恶化**。已推 `f0c…`（见提交链），生产 `/health` 实测 `service:clair-worker`、`/api/industries` 等 6 端点 404。
- **诊断方法（可复用）**：`/tmp/scan-availability.mjs` 交叉比对「后端 240 条pathMetadata × 前端 44 条静态调用路径」，**按响应体而非状态码判定**（`OK/DEGRADED/NOT_FOUND/ERROR/MALFORMED`），产出 `/tmp/availability-matrix.json`。**6 类根因**：A 生产供给面缺位 / **B 状态码语义错（响应体已诚实标 unavailable 但 HTTP 500，前端走 catch 不解析 dataSource）** / C 前后端契约断裂 / D 上游源不可达 / E薄响应无契约 / F 限流（**已自查排除**：429 系扫描并发所致，限流 120/min，低并发复测全 200）。
- **三项「机制级」修复**（用户要求的「同步机制」落地）：
  1. `302988c80` 移除 `deploy.yml` 的 `VITE_API_BASE || pages.dev` **静默兜底**——variable 缺失时会静默回落 Worker（连错后端且零报错）；缺失改由构建期守卫拦。
  2. `2a2debcf0` 建版本一致性机器保障：后端 `/api/version`（commit 仅接受 7–40 位 hex，其余 `null`，**绝无假 sha**）、前端页脚常驻版本指示器（`AppLayout.tsx`，拿不到显示「版本未知」）、`scripts/smoke/production-smoke.mjs`（11 端点按响应体分级+ 比对目标实例 commit，**实测把「线上跑旧代码」判为 VERSION_MISMATCH**）、`.github/workflows/deploy-backend.yml` 占位。
  3. `f6c6ed772` 部署烟测 job 未配置时从 `exit 0`（绿）改为 **job 级 if → skipped（灰）**，杜绝 CI 制造不存在的保证。
- **配置单一真源**：`5157486a6`（`main.tsx` 移除硬编码 fallback + `.env.example` 216 行契约）、`21a9ab217`（`vite-env.d.ts` 补 `VITE_*` 声明修 TS2339×8）、`ff24526ce`+`75d9968f8`+`ec96406ab`（`config/apiBase.ts` 统一前端地址解析，清除 `VITE_API_BASE_URL`/`apiClient`/`IndustryMapPage`/`FundFlowPage` 独立解析点）。**`VITE_API_BASE` 已配入GitHub variable（带过渡说明）**——代码无兜底、配置可见可运维，后端上线后只改 variable 即可切换。
- **⚠️ 三次自我纠错 + 六次被worker 证伪**（详见下方「教训」段）。
- **昨日需求核对结论**：CI 红已根治；数据不可用波次代码全部收口**但线上 0 生效**（根因=无部署路径）；团队机制/记忆沉淀已完成。**唯一硬阻塞：托管平台选型（等用户）+ 托管 PG 迁移**（只搬容器不搬数据→退回内存库=全站空态，比现状更差）。
- **新增待办（可达性审计发现）**：`/api/watchlist` 实测 401（认证未启用）连带 `PortfolioPage` 不可用——属「功能模块缺失」，不在本波范围。

## 2026-10-07 上午 · 待办与防误删清单（收口期沉淀）
- **🔴 防误删警告（worker 主动提出、已复验，务必遵守）**：`frontend/src/services/api.ts:371` 的 `healthCheck()` 传 `{ baseURL: '' }` **是必需的、绝不可清理**。后端 `app.ts:358` 是 `app.get('/health')` **挂在根路径、不在 `/api` 下**；实测 `/health`=200、`/api/health`=404。若让 healthCheck 走 baseURL，或把 `baseURL:''` 当冗余清掉，健康检查将**永久 404**。
  - 待办 #38「清除 healthCheck/api.health 死代码」的正确做法：**保留** `api.ts` 侧 `healthCheck` + `baseURL:''`，只清理后端确实不存在的 `/api/health` 引用。
  - **但注意**：`/api/health` 在 `backend/src/docs/apiDocs.ts:241` 与 `__tests__/apiGateway.test.ts:301,309` 有声明/断言——**清理时这三处需一并处理**，否则 CI 会红（不是简单删一条路由）。
- **命名陷阱（双前缀 17 处的认知源头）**：`config/apiBase.ts` 的 `resolveApiBase()` 返回**含 `/api`** 的值却叫 "Base"，而 `API_ORIGIN`（`resolveApiOrigin()`）叫 "Origin" 却**不含**后缀——**命名与语义相反**。worker 建议「统一为 API_ORIGIN + 调用处带 /api」以根除复发，**主理人已否决**（牵动全仓 17 处 + 全部消费方 + 全部测试，风险远超收益）。改为**结构不动 + 护栏防复发**：`frontend/src/__tests__/apiPrefixGuard.test.ts` 含「守住前提」用例（断言 `API_BASE_URL` 必须以 `/api` 结尾，否则整组断言退化为空断言）。命名陷阱登记为技术债。
- **`BlockTradesPage.tsx` 绕过可撤销**：`api.ts` 双前缀根因已修（`bdcdf6fcc`），该页为躲 404 而自行调 `apiService.get('/block-trades')` 的绕行前提已消失，可切回 `fetchBlockTrades`（待激活单处理）。
- **vitest 沙箱跑不动 —— ✅ 已闭环，非「未验证」**（更正本行旧表述）：根因是沙箱注入 `NODE_OPTIONS` shim（见上「沙箱 NODE_OPTIONS 量化结论」），**不是代码问题**。正确姿势 `env -u NODE_OPTIONS <vitest 命令>`（**单变量即充分**）。已用它真实跑通并验证：`apiPrefixGuard` 44/44、`hkConnectNullAdapt` 19/19、`nullAdapt` 25/25、`aiEndpointsFinal` 21/21、`halfHonestZeroToNull` 15/15、`blockTradesContract` 19、`alertsQueryScopeContract` 14。⟹ **这些用例均已真跑通过，不再是「未经 CI 验证」的挂账项**。
- **⚠️ 不得再引用「58s 优化目标」**（旧台账曾用其作为「有性能问题」的例证，该前提**已失效**）：`honesty-scan` 无 shim 基线为 **0.14~0.46s**（三方独立复现），「58s」是 shim 环境下测出的**放大值**。`fix-blocktrades` 已撤回「加 shim 自检 / exit 2」的提议，理由正确：**CI 上永不触发，等于把沙箱问题写进产品代码**。
- **两类静默降级须区分**：`risk-center.ts:41-42` / `fund-flow.ts:228-230` / `ai-market-pulse.ts:106,138` 的 `catch → []` **不能批量改unavailable**——须区分「上游失败」与「本来就空」，否则会把「真的没有」也标成「拿不到」，**诚实红线是双向的**。留待下一批逐个实测。
- **`getMarketSummary` 可空契约（方向已确认，待只读核查结论）**：`Database.ts:483-485` 明确 `if (dailyQuotes.length === 0) return null;`（**有意契约**），而 `ai-market-pulse.ts:153` 直接属性访问**未判空** ⟹ 根因是**类型契约未兑现**，非降级写法不当。已派 `audit-null-contract` 全量普查调用方。

## 2026-10-07 03:00 · 沙箱 NODE_OPTIONS 量化结论（主理人实测，三方独立复现后收敛）
- **机制（我实测的硬数据）**：30 次 `fs.readFileSync`，带 shim **7678ms** vs 无 shim **0ms** ⟹ shim 给**每次 fs 调用**加约 **256ms**。凡是需要读大量文件的进程（`honesty-scan` 读数百文件、vitest 模块加载）会被放大到分钟级并最终被 SIGTERM。
  - ⚠️ **量级不是固定倍数**（`fix-lockup-toptraders` 补充，我采纳）：惩罚强度**与 fs 调用次数正相关、且随机器负载放大**。同一 `honesty-scan` 低负载时 53s、高负载（多worker 并发）实测 **10 分钟仍未结束**。所以「53s」「50倍」只在特定负载下成立，**不要把它当固定常数用于排期或阈值设定**。
- **最小充分条件**：只需 `env -u NODE_OPTIONS`（`PYTHONPATH` / `CODEBUDDY_SANDBOX_PROGRAM_POLICY_COMMAND` 无需unset）。
- **⚠️ 重要澄清（`fix-blocktrades` 的建议我采纳但需修正其范围）**：它建议「给 CI 门禁加 `env -u NODE_OPTIONS`」，理由是「CI 若同样注入 shim 会假红」。**但 shim 的路径是 `/Applications/WorkBuddy.app/.../node-language-shim.cjs`——这是 WorkBuddy 沙箱注入的，GitHub Actions runner 上不存在该文件与该环境变量。**⟹ **CI 门禁不受此影响，无需改 workflow**。仅本地/沙箱复跑需要 unset。
- **`honesty-scan` 本体无性能问题**：717 行纯本地扫描、无网络调用，去掉 shim 后 **0~1s**。历史上多次把它归因为「脚本内存占用」是**错误结论**（`fix-schema-gap`、`fix-half-honest-zero`、`fix-fe-deadlinks` 三方均独立更正过），已在本单留档。
- **另一条独立事实（`fix-hkconnect-page` 实测）**：vitest 的 `Duration` 在带 shim 时被放大约 400倍（105s vs 245ms；155s vs 0.34s），**慢的锅不归被改的文件**（其 13 例纯 mock 用例 `tests` 仅 25ms，耗时全在 `collect`/`prepare`）。⟹ **排期不得用 Duration 判断某 worker 的测试「写得慢」**。
- **判据表（已广播全员）**：换命令形态就好 → 命令写法（`nohup &` 被回收 / `| tail` 吞日志 / 固定 sleep）；只有 unset 好且仅 fork 子进程 → NODE_OPTIONS；vite 在 run_in_background 下仍复现 → 才是真环境问题。
- **⚠️ 纠正一处越界建议（`fix-blocktrades`/`audit-reachability` 均提过）**：他们建议「给 CI 门禁加 `env -u NODE_OPTIONS`，否则 CI unit-tests 会无端变红」。**范围过宽，不采纳**——shim 路径是 `/Applications/WorkBuddy.app/.../node-language-shim.cjs`，属 **WorkBuddy 沙箱注入**，GitHub Actions runner 上不存在该文件与该环境变量。⟹ **CI 不受影响、不得为此改 workflow**，仅本地/沙箱复跑需 unset。
- **诚实门禁双计数器语义（`fix-hkconnect-page` 实测 + 主理人复核规则原文，已留档）**：
  - `SCAN_ROOTS = ['backend/src','frontend/src']` —— **前端全量在扫描面内**
  - `SUPPLY_MARKERS = ['backend/src/api/','backend/src/services/','backend/src/db/']` ⟹ 只有**供数路径**升 **RED**（`--strict` 下真阻断、exit 1）；`frontend/src/**` 全部落 **YELLOW**（只计数、不阻断）。
  - ⟹ **做阳性对照时必须盯 YELLOW 计数变化**（前后差 1 即命中），盯 RED 永远是 0 会误判成「门禁没生效」。`fix-fe-null-adapt` 曾因此差点白跑一轮。
  - 当前基线（主理人实测）：未豁免 RED **0** / YELLOW **53** / 规则B CONTRACT-MISSING **24 文件** / allowlist 13 未命中 0 ⟹ `--strict` **exit 0**。
- **⚠️ 防误杀（`fix-hkconnect-page` 实测，当前仍有 11 个门禁进程在跑）**：`pkill -f honesty-scan` 会打断他人运行，且 `ps eww` **读不到别session 的 `CODEBUDDY_SESSION_ID`**（返回空）⟹「先 pgrep 再按 session 挑着 kill」在本环境**不可行**（不是顺序问题）。**唯一安全做法：用任务停止接口按 task_id 停自己启动的后台任务**；若只能用 pkill，则 `pgrep` 数量不为 1 就**放弃 kill**。
- **协作纪律（源自今晚多次自我纠错）**：跑对照实验时**必须记录当次的「是否带 shim / 是否带 env -u / 是否并发 / 负载如何」**，与结果一起记（一行即可）。否则事后只能靠残缺信息重建现场 ⟹ 每次都在重新猜。今晚三次环境误判（单次观察当因果/拿污染值定优化目标/计时脚本本身写错）全部源于此。

## 2026-10-09 03:20 · Git 推送通道故障与 Git Data API 推送机制（重要，后续必读）
- **症状**：用户 VPN 使 `api.github.com` 可达但 `github.com:443` 的 CONNECT 隧道 502 ⟹ `git push` 全失败。
- **方案**：`/tmp/push-via-api.mjs` 用 GitHub Git Data API（blob→tree→commit→ref）逐层重建提交推送。
- **⚠️ 必知副作用（经 fix-macro-cards 纠正后修订）**：API 推送会让**sha 与 tree 都变化**，不只是「同名不同 sha」：
  ① commit 对象被重建 → sha 变；
  ② **提交顺序可能重排** → 父节点不同 → 快照基准不同 → **tree hash 必然不同**。
  例：本地 `b177ce691`(父=`f16ab5110`) ⟶ 远端 `5a74992e`(父=`1c41e73f`)。
- **⚠️ 因此校验改动是否落地，必须用内容比对（文件级 shasum / diff）**：
  **不能用 commit sha**（本地对象库根本没有远端重建的对象，搜不到属正常）
  **也不能用 tree hash**（因顺序重排必然不同，会误判成"内容不一致"）。
  我曾把「单文件 shasum 相同」表述为「内容逐字节一致」，属**过度外推**，已更正。
- **⚠️ 因此每次API 推送后必须**：`git update-ref refs/remotes/origin/main $(git rev-parse HEAD)`（对齐到本地等价 commit）。
  否则本地 origin/main 会持续落后，后续任何 `git push` / `git status` 判断都会错位。
- **远端历史链完整性已验证**：连续 6 个 commit 父子关系连续无断裂。

### ⚠️ 补充：已产生一个空提交 `a166db9c`（无文件变更，仅污染历史）
- **成因**：`git push` 因VPN 不可用，改用 API 推送。首次推送后 `git update-ref refs/remotes/origin/main <远端sha>`
  **失败**（远端对象不在本地库）⟹ 本地 ref 仍指向旧 commit⟹ 下次推送把已推内容重复计入 ⟹ 产生空提交。
- **影响**：`files` 列表为空 ⟹ **代码内容完全无影响**，仅历史多一个节点。
- **正确纪律（后续必守）**：
  1. 推送前先把 `origin/main` 对齐到「远端已含的最后一个**本地** commit」：
     `git update-ref refs/remotes/origin/main <那个本地 commit>`
  2. 推送后**立刻校验**（⚠️ 必须用commit 详情 API，**不能**用列表 API——
     `commits?per_page=1` 的返回项里**没有** `files` 字段，jq 取值恒为 0，
     我曾据此误判一个正常提交为空提交）：
     `gh api repos/EgoBai/clair/commits/<sha> --jq '.files | length'`
     返回 0 才是空提交。
  3. `git update-ref` 指向「本地不存在的 sha」必然失败 ⟹ 不要用它指向远端 sha，只能指向本地 commit。

## 2026-10-09 03:55 · 两条纪律（今晚代价最大的一类错误）
- **⚠️ 比对前先确认口径一致**（价格口径 / 单位 / **复权方式** / 时区）。
  今晚两次实例：① `close>100` + `000xxx/399xxx` 筛可疑行 ⟹ `300308 中际旭创` 29 行真实行情（783~927元）**全部误报**；
  ② 用**前复权 qfq** 比对载体日 ⟹ 得出「72 行不匹配」的假警报，实际 **DB 存不复权价**（day），改口径后大多数精确吻合。
  **假警报的代价不是浪费时间，是会去「修」本来正确的数据。**
- **⚠️ 裁决要用显式常量兜底，不能靠计算值间接保障**。
  「保留 5 个唯一载体日」是主理人裁决，但脚本原仅靠「载荷指纹唯一」间接保障；
  而指纹会随补数变化 ⟹ 裁决会被变量左右。已要求加**显式白名单**（`--force-unique` 也不得覆盖）。
  触发场景：载体日 `05-30`/`06-06` 各有 2 行指数串位 ⟹ 「可疑日」与「受保护日」重叠，
  补数时**顺手整日删除会连带丢掉 105/59 行真实行情**——两个缺陷叠加反而让原损失更易发生。
- **⚠️ 追加（又犯一次）**：批量推送多个 commit 时，若在**循环内**每次都把 `origin/main` 设到同一个
  「未推基准」，第二次推送会把已推内容重复计入 ⟹ 产生空提交（如 `844b7c0b`，files=0）。
  正确做法：**每次推送成功后，立刻把 `origin/main` 更新为刚推上去的那个本地 commit**，
  下一次循环的 base 才是对的。或干脆逐个手工推送，不要写成循环。

## 2026-10-09 04:40 · 补数收口时挖出两个新缺陷（待派单，均属「半诚实零值」同族）
###① 入库层伪零值：全库 **21,558 行** `open_price=0`，横跨 **68 个日期**（backfill-kline 实测）
- 典型：`600001.SH|10-04|open=0.00|close=5.29|vol=0` —— **OHLCV 残缺但 close 有值**。
- 成因：停牌/无成交日腾讯返回空快照，被原样入库。
- **与载体日的关联**：`10-04` 的 358 行正是其中一部分 ⟹ 若当初按「5183 行 OHLCV 100% 一致」就转正载体日，
  **等于把这批伪零值固化到正确日期上**。「不一致就停下来报告」这条规则救了它。
- 待派单：清洗这 21,558 行（判据需用 `open=0 AND volume=0` 组合，**不可只判 `close>0`**）。

### ② 派生字段基数错误：`change_amount` 应为 `close −前收盘`，代码用的是 `close − open`
- 实测 601390（09-24）：`4.25 − 4.29(前收) = −0.04` = **库内既有值**；用 open(4.28) 会得 −0.03（错）。
- 影响面待评估：若历史行的 change/change_percent 均按 open 算，**全部涨跌幅字段都偏**。
- 与 P0-HONESTY2 同族：不是造假，是**算错**——但同样让用户看到错的数字。

## 2026-10-09 05:10 · 两条硬口径（后续任何人比对数据前必读）
### ① 本库 `daily_quotes` 存的是**不复权价**（`day`），不是前复权（`qfqday`）
- 实测：600519 库内 1237.00 = 腾讯 `day` 序列值；若用 `qfqday`（1297.976）比对会判成「口径错误」。
- **任何拿腾讯/东财数据与本库比对的人，必须先确认取的是 `day` 还是 `qfqday`。**
  否则会「修」本来正确的数据——这已实际发生4 次（qfq 误判、高价股误报、qfq 差价、"19 行污染"结论）。
- ✅ **同日可比，可作污染判据**：实测 6 只 × 4 日共 20 组，**DB 与上游 `day` 全部吻合（20/20）**；
  与 `qfqday` 吻合仅 17/20。⟹ **「与上游 `day` 同日不符」是判定污染的可靠判据。**
- ⚠️ **两类误判会造出虚假警报（今晚各发生一次）**：
  ① **取错字段**：用 `qfqday` 代替 `day` 比对⟹ 虚假差额 14.24（我曾据此误判"5.5% 标的价错"）；
  ② **日期错位**：拿 A 日库内值比 B 日上游值⟹ 虚假差额（我曾把09-23 的上游值当成 09-24 的，写进台账当证据）。
  **正确做法：`rg` 确认取的是 `day` 分支，且逐条核对日期字符串完全相等后再比较。**
- ⚠️ 补充：茅台每年分红除息，**不可假设「从未除权」**——判定 qfq/raw 是否相等才是可靠自证。

### ② `open_price=0` 的 21,558 行是**退市标的陈旧价**（不是抹布行，我的抹布修复拦不住）
- 实测构成：`open=0` 21,558 行 **100% 同时满足 `volume=0` 且 `high=low=close`**（判据完美闭合）。
- 成因：腾讯对已退市标的返回 `open=0` + 陈旧收盘价，且这些日期**是正常交易日** ⟹ `isTradingDay()` 放行。
- 铁证：`created_at=2026-10-09 04:31` 的 5,541 行里 362 行零价，而抹布修复 03:25 已提交 ⟹ **修复后仍在新增**。
- **待决**：A 采集端过滤 / B 加 `is_delisted` 字段 / C 清理 stocks 表（涉 `seeds/**`）。

## 2026-10-09 05:50 · 🔴 载体日删除禁令（差点造成永久数据丢失）
**在补齐真身之前，5 个载体日一行都不能删。** `fix-qfq-caliber` 拦住了这个删除计划。

### 关键事实（主理人已独立复核）
```
05-30 的 109 行里，只有 4 行在真身 05-29 中存在⟹ **105 行是唯一副本**
06-05 真身只有 114 行 / 07-10 与 09-04 真身各 0 行
```
### 更严重的问题：2026-01-05~ 06-08 区间有 **103 个真实交易日每天仅 11 行**（正常应 5541）
⟹ 该长区间的历史数据**大面积缺失**，载体日是那几天仅存的完整记录。
**这与载体日是两个独立问题，但都必须先补数再谈删除。**

### 禁令
1. 载体日 `05-30 / 06-06 / 07-11 / 09-06 / 10-04` 在真身补齐并逐值覆盖前**一行都不能删**；
2. **禁止用载体日的行去「转正」真实日期**——那是把别天的数据挂到错日期上；
3. 解封条件：真身补齐 → 逐日逐值比对确认覆盖 → 才可删载体日。

### 附带修正：`scrub-stale-px` 的退市股字段下标判断有误（已改对）
腾讯 K 线数组**尾部会随标的追加退市/板块等元数据**，导致字段位置整体后移。
`603389`（2 行）→ `[日期,开,收,高,低,量,额,{fqt:0},{},{代码:'SH510300'},...,{退市:true}]`
⟹ 成交额是 **index 7** 而非 8，换手率是**无对应字段**（置 NULL）。
**任何按固定下标取值的解析，都必须先验证数组长度**，否则对退市/带元数据的标的会取错位。
