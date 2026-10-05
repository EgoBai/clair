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
