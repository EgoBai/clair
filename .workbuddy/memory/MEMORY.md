# 澄观 Clair 项目记忆（a-stock-website）

> 仓库：~/.openclaw/workspace/a-stock-website/ （GitHub: EgoBai/clair）
> 主理人：WorkBuddy。自动化：automation-1784829898221（HOURLY;INTERVAL=6，**PAUSED**——2026-10-08 00:2x 经 automation 列表实查；末次 run 10-05T18:53Z。状态三次反复：09-21 PAUSED → 10-04 ACTIVE → 10-06 起再 PAUSED，**每次取用前必须重查 list，勿沿用任何旧判**）。看板 automation-1786816465504 仍 **PAUSED**（其 `reset → checkout origin/main → cherry-pick` 破坏性逻辑仍在，恢复前必须先改 git 策略）。排查自动化缺席的正确顺序：**先查 `automation_update mode=list` 看 status，再查调度日志**；若日志整段空白（如 09-27~10-03 七天零条目），则是**宿主应用未运行**，既非 PAUSED 也非失败。
> **tsc 必须用项目本地二进制**：`cd frontend|backend && ./node_modules/.bin/tsc --noEmit`。用根 `npx tsc` 会解析到别的 TS 版本，只报 `TS5101 baseUrl 已废弃` 这类配置错而漏扫源码 → 产出「假绿」（2026-10-04 实测踩到：npx 报 1 错 exit 2，本地 tsc 才暴露后端 3 个真实源码错）。

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

## 自动化可靠性诊断（2026-09-02 实测新增）

- **调度日志是唯一真相源**：`/Users/ego_bai/.workbuddy/logs/automation.log`（**UTC 时间，+8=CST**）。查法：`grep "run start|run finished|success=false" automation.log`。
- **「仓库无新提交」≠ 自动化没跑**。2026-09-02 初判「09-01 12:21 后 11h40m 静默」即误判——日志证实自动化全部正常触发，但**中途失败**，统一报错 `[UNKNOWN] Conversation ended before automation request completed`。近 7 天 9 次失败，横跨主循环/日报/每日总结/测评蜂群 4 条自动化，属系统性中断（疑似会话超时、应用退出或并发上限），非单条配置问题。
- 排查顺序：先查日志确认「失败 vs 未触发」，再定位根因；不要只看 git log。
- 各自动化产物落点：主循环总结 → `/Users/ego_bai/WorkBuddy/20260318120110/summaries/`；看板 → `docs/dashboard-data.json`；日报 → `.workbuddy/memory/<日期>.md`。
- **微信推送仍不可用**（第六次复核 2026-09-05）：无 `.wechat_push.json`；agent-mail connector 仅暴露附件上传/下载，无 send_mail。只能「对话输出 + 落盘 + present_files」三通道触达。
- **推送阻塞根因已于 2026-10-15 第 30 次复核实证更正**：`mcp__agent-mail__SendMessage` 工具早已可用（含 `skip_confirmation` 参数），此前多轮「CONFIRMATION_REQUIRED 闸门拦截」判断不准确——本轮按用户 2026-08-27 书面授权（DECISION_LOG：循环总结推送走 agent-mail 邮件 374070139@qq.com）实投，返回「**Agent 邮箱尚未开通**」（`status=not_bound`），指引不重试。**真正阻塞 = 邮箱未激活**，用户在上方开通面板或「更多 - 我的邮箱」激活后即可按授权自动投递。企业微信连接器当前会话未启用。
- **破局候选（未安装）**：连接器市场 `search_plugins` 返回 `wecom`（企业微信：机器人主动通知 + 邮件收发）与 `qq-mail`（QQ 邮箱收发，可直发 374070139@qq.com）。**排查工具缺口须先查 `search_plugins`（连接器层）再查 ToolSearch（能力层）**。截至 2026-09-05 两者仍未 connected。

## 进度

- D14 ✅（2026-08-10）：真实数据源全面接入。A 行业 demo 兜底→诚实空态；B 北向真实化+离岸诚实空。`fundFlow 155 测试全绿`，commit `f7f7539a7` 已 push。
- 下一步：POC 四件套（小程序迁移）、微信推送渠道评估（WorkBuddy 自有 vs 外部）、多 agent 蜂群分工（依据 clair后续执行计划_20260731.md）。

## 2026-10-12 新增（日报第 28 次实测）

- **`/api/data/freshness` 正确路径是 `/api/data/freshness`**（挂 `app.use('/api', stockRouter)` 下，非 `/api/stock/...`）。该端点 500 的根因（`stock.ts:540` 闭包内声明的 `latestTradeDate/stockCount` 在闭包外引用）已于 10-11 `405ab636d` 修复，实测转 200。
- **后端 tsc 10 错已于 10-11 清零**（新增 `DailyQuoteInput` 只放宽写入侧类型，读取侧 `DailyQuote` 不变）。截至 10-12 实测前后端 tsc 均 exit 0。
- **诚实红线新增一类**：`quote.change || 0` 式「`|| 0` 兜底」会把显式传入的 `null`（口径不可算）静默变成 0，属**零值顶替空态的隐蔽谎报**，应一律改 `?? null`。排查时除 `Math.random` 外应一并 grep `|| 0`。
- **GBK 乱码仍未修**（第 24 天）：`realMarketData.ts:78`、`stock.ts:253` 用 `resp.text()` 解 GBK；正确写法见 `DataSyncService.ts:409`。

## 2026-09-18 新增两条硬教训（独立核实）

- **禁止 reset 到 origin/main（会销毁未推送成果）**：09-17 03:00 reflog 实证 `reset → checkout origin/main → cherry-pick`，把 09-16 的第117/118/119轮（`230f1593c`/`11b539ae2`/`3cc868127`）整体摘除为悬空提交，连带的 `backend/src/__tests__/{fundFlowHonestData,honestDataStaticGuard}.test.ts` 从磁盘消失。同步恢复：`git checkout 3cc868127 -- backend/src/__tests__/`。后续同步用 `git fetch` + rebase/merge，**标配 `git merge-base --is-ancestor` 校验成果是否仍在主干**。
- **腾讯 `qt.gtimg.cn` 返回 GBK 编码，禁用 `resp.text()`**：undici 的 `.text()` 恒按 UTF-8 解码 → 中文产出 U+FFFD + GBK 残字节（`\xef\xbf\xbd...\xd6\xa4\xd6\xb8`），响应头还谎称 `charset=utf-8`。已知缺陷点 `services/realMarketData.ts:78`、`api/stock.ts:253`；正确写法见 `data-sync/DataSyncService.ts:409` `iconv.decode(Buffer.from(response.data),'gbk')`。**检测须用 python 字节级**（看 `\xef\xbf\xbd` 与 `\xd6\xa4` 类原始字节），只看渲染结果会漏（往期日报长期把乱码读作「上证」）。
- 由此：**判断「成果存在」须同时校验当前 HEAD + 磁盘**，历史 commit 存在 ≠ 成果还在（这三天的反复说明同一问题）。
- **该事故 09-19 03:01 第二次发生（已定位元凶=看板自动化 automation-1786816465504）**：reflog 同一模式 `reset → checkout origin/main → cherry-pick`，抹掉 09-18 第117/118/120轮（`299c4b4b7`/`ce27cc935`/`31328ace5`/`fab2d2e3d`）。实证丢失：`FactorLabPage.tsx` 的 IP-21「演示数据（教学样本）」Tag grep 零命中（前一天刚验证在 HEAD 内）、`frontend/src/__tests__/shortcutEngineContract.test.ts`(217行) 磁盘缺失。**规律：看板自动化每天 03:00 跑，凡前一天有循环提交未 push 到 origin 的，都会被这一模式抹掉**。恢复命令：`git checkout 31328ace5 -- frontend/src/pages/FactorLabPage.tsx`、`git checkout fab2d2e3d -- frontend/src/__tests__/shortcutEngineContract.test.ts`、`git checkout 3cc868127 -- backend/src/__tests__/`。根治须改看板自动化为 `git fetch` + rebase/merge。
- **主循环 09-18 14:31 起 33.5h 零触发**（调度日志无 run start，非 `success=false` 失败）——与既往「中途失败」不同，属未触发，需查应用是否退出/自动化是否被暂停。

## 2026-09-19 新增硬教训（口径造假识别）

- **警惕「全仓零命中」式概括结论（继 D23 curl 假绿之后的第二类自欺型验收）**：09-18 第118轮总结自报「全仓 `grep Math.random` 生产源码零命中」，本轮独立复扫实测 **frontend/src 47 行 + backend/src 76 行 = 123 行**（已排除 `_archived`/`__tests__`/`node_modules`/`.bak`/纯注释行）。凡「全仓/全部/零」类绝对表述，**必须自己重跑一遍再采信**，尤其是循环自身的验收段落。
- **但反向也要防夸大**：123 行 ≠ 123 个用户可见伪造。须做**三层分层判定**——① 合法数值方法（蒙特卡洛、`correlationEngine:225` bootstrap 重采样、`:276` PCA 随机初始向量）；② 良性工具（session/perf ID、重试 jitter）；③ 真疑似伪金融指标（`smartBetaEngine.ts:134` turnover、`earningsCallSentimentEngine.ts:71-72` sentiment/mentions）。第三类多数经 `grep pages/` 证实**零引用 = 死代码候选**（落在 IP-7 utils 93K 拆分同域）。**结论要分层给，不要一句「零命中」也不要一句「全是伪造」**。
- **zsh 坑**：`grep --include=*.ts` 不加引号会因 glob 报 `no matches found` 并静默跳过前端部分 → 必须写 `--include='*.ts'`。

## 单通道红线

- automation PAUSED 期间主理人独占写入权。工作树有其 08-04~08-07 在途文件（PLAN.md / frontend/.workbuddy/automations/.../memory.md / playwright-report / ui-guard-report / memory/2026-08-0x-summary.md）**保持未提交，不碰**。
- 重启用 automation 须在所有 commit/push 之后（避免 immediate-fire 并行写库）。

## 2026-10-20 新增（日报第 35 次实测）

- **ROADMAP-2026Q4（10-19 team-lead 制定，`docs/harness/ROADMAP-2026Q4.md`，未跟踪）是当前最高层战略文档**：241 端点审计矩阵 = A 真实 45 / B 诚实空 32 / C 假数据·契约缺失 ≈78 / D 错误 79（其中 401×22 为认证未启用）；**算术编造端点实证 = 0**。三大结构性差距：① 数据层残账（盘中快照/载体日/零 turnover 1,257 行/科创板 3 行）② **交易日历 0 接入**（7 核心端点当日未同步即全空 → 周期性首屏空屏）③ **Express 无生产部署路径，线上 Cloudflare Worker 与本地是两套后端，本地修复线上 0 生效**。
- **10-19 晚已派发 4 个零交集文件域批次**（批A fix-turnover-unit 第三批 41,931 行 / 批B backfill-kline 21 缺失交易日 + 10-19 / 批C build-trading-calendar resolveQueryDate 接入 7 端点 / 批D fix-real-claim API key 泄露 + ETF 静态字段）。截至 10-20 00:00 **零产物落盘**——后续会话接手须先查四证验收，勿直接采信「已派发=已完成」。
- 当前待用户拍板 5 项：托管平台选型（Railway/Render/Fly.io，卡上线路径）/ IP-7 utils 拆分 / RAG 二期 / D2 POC 四件套 / 真机验证清单。
- **后端 tsc 4 错（sector-analysis.ts 222/224/226 + 328）零修复第 7 天 + 服务双停第 7 天**（10-13 起 5173/3001 无监听）；PLAN/DECISION_LOG 记账断档第 14 天（停 10-06），ROADMAP 尚未回账中枢文档。
- **connector-status 显示 connected ≠ agent-mail 可发信**：邮箱开通是独立一层，必须以 `GetMe` 实查（仍 `not_bound`）为准，勿因连接器状态显示变化误判。
