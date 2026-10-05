# 执行计划 2026-10（EP-202610）· 三份依据的落地工单

> 主理人 2026-10-04 制定。依据：① PLAN.md 当前优先级与遗留；② DECISION_LOG.md D26-1~10 及未决项；
> ③ 《Clair-RSI-方案评审报告-v1.0》+ design/rsi-framework-v2.md。
> 每张工单遵循 AGENT-TEAM-PROTOCOL.md 四元组；动态状态见 TICKET-LEDGER.md。
> 基线：HEAD=783476d24，CI 三 job 全绿（2026-09-26 以来持续）。

## 批次 A：CI 收口后暴露的诚实/工程欠账（PLAN 遗留）

### T-2604-01 摘除 app.ts API 索引中的死端点宣传（P1）
- **目标**：app.ts:401 附近 API 索引仍宣传 `/api/ai/selection/*`、`/api/shareholder-changes` 等无任何实现的端点（apiDocsEndpoint 已立反向断言 not.toContain 钉死注册表侧；本工单处理索引侧）。
- **验收**：① rg 索引段无未实现端点（逐条对照 routeAutoRegistry pathMetadata 241 条真集）；② apiDocsEndpoint 25/25 保持绿；③ app.ts esbuild 转译过；④ 若选择「实现」而非「摘除」须另行立项（超范围）。
- **文件域**：backend/src/app.ts。**执行者：主理人**（app.ts 为历史约定的主理人独占域）。

### T-2604-02 shared/ 剩余影子产物审计（formatters.js / env.js / 对应 .d.ts）（P2）
- **目标**：shared/types.js 空壳影子已于 783476d24 根除；剩余 formatters.js（04-23，晚于 .ts）、env.js、formatters.d.ts、env.d.ts 同机制风险待核查。
- **验收**：① 逐文件比对 .js 是否为 .ts 的等价编译产物（语义 diff，抽关键导出）；② 结论 keep/delete 有据，删除则全仓 rg 无显式 .js 引用；③ 定向测试 + vite build（/tmp 外目录）过；④ 结论写入工单记录。
- **文件域**：shared/formatters.{js,d.ts}、shared/env.{js,d.ts}（删除动作）+ 报告。**执行者：worker-wave1**。

### T-2604-03 ~~allowlist 10 条死豁免清偿 + 基线重生成~~（P2）→ 主循环已完成
- 2026-10-04 主循环本轮已执行：allowlist 23→13（AL-014..023 删除）、baseline 重生成，在途待主循环收口。**本条关闭，任何人不得重复执行**（单通道纪律实证案例）。

## 批次 B：DECISION_LOG 决定落地

### T-2604-04 deriveIndustryFromName 匹配策略修复（P1，D26 数据质量红线延伸）
- **目标**：「声明顺序首个命中」策略隐患实锤（平安银行先命中『平安』→非银金融，正确条目股份制银行轮不到）；ci-industry-derive 已量化「最长命中优先」修法在 5541 全量上 0 回归。
- **验收**：① 实现最长命中优先（命中长度相同再按声明顺序）；② 回归样本 ≥20 只（含平安银行→银行、比亚迪→汽车、宁德时代→电力设备、招商银行→银行、乱七八糟xyz→未分类），打印实测结果；③ 三份 5541 名单全量 classifyStock diff 输出（允许仅已知过期名单内 002594 既有差异，须说明）；④ subIndustryPerformance.test.ts 6/6 绿。
- **文件域**：shared/industryClassification.ts + backend/src/__tests__/subIndustryPerformance.test.ts（断言修改须先证实现正确）。**执行者：worker-wave1**。

### T-2604-05 D26-9 合规三件套评估（P2，待用户输入项）
- **目标**：复盘快照已落地（R0'-6）；D26-9 要求留存期限/导出权/授权同意三件套。留存期限具体值需合规输入（v2 待核验清单 #8）。
- **验收**：产出评估报告（现状 / 差距 / 建议默认值），不落地代码。
- **文件域**：docs/ 新报告文件。**执行者：暂缓，待主理人排期**（非阻塞）。

## 批次 C：RSI 方案剩余工单（v2 §10 / R0′ 后段）

### T-2604-06 route 层 dataSource 传播补全（P1，D26-5 欠账链 #33/#39）
- **目标**：DECISION_LOG 登记：多数路由异常经 globalErrorHandler 返回体不含 dataSource；ai-chat.ts:257 误标 real；indicators 空态缺标注（#39）。
- **验收**：① 逐文件核查清单逐条改或给出不改的理由；② 全局错误响应对 FABRICATED_DATA_REFUSED 显式带 dataSource:'unavailable'；③ 相关定向测试绿 + esbuild 自检。
- **文件域**：backend/src/api/（逐文件声明）。**执行者：worker-wave2（主理人派工）**。

### T-2604-07 vitest 版本漂移收敛（P2，本会话新登记）
- **目标**：本机 frontend node_modules=vitest 4.1.10，CI/package-lock=1.6.1；vitest 4 已移除 poolOptions，本地测试行为与 CI 可能分歧。
- **验收**：版本对齐后 CI 三 job 保持绿；vitest.config 中已废弃字段清理。
- **文件域**：frontend/package*.json、frontend/vitest.config.ts。**执行者：暂缓（依赖升级类，主理人择窗口）**。

### T-2604-08 D26-5 剩余欠账：#37/#40/#41/#42（P2 池）
- 内容：sectors.ts:72 零值兜底造数 + eigenAnalysis 缺 deflation；/api/market/realtime GBK 乱码；/health version 与启动横幅不一致；performance/enhanced 路由遮蔽。
- **执行者**：进自主改进池，主循环/监工按 P2 节奏消化。

### T-2604-09 / T-2604-10（wave1-shadow-audit 报告新增，台账已登记，P2）
- T-2604-09：shared/env.ts 本体零引用死代码评估（validateBackendEnv/getEnv/isDev），评估删或留，报告级。
- T-2604-10：snapshots.test.tsx「EmptyStocks 应该渲染」10s 超时 flake，排查组件内定时器/异步渲染挂起。

## 批次 D：体验与产品（PLAN P1）
- 策略回测日期选择器、产业地图节点下钻、投资笔记入口可见性 —— 维持 PLAN 排队，由主循环在改进池节奏推进，不新增并行线。

## 本轮已执行（2026-10-04）
- 监工角色建立（overseer），团队协议 v1.0 落盘（本目录 AGENT-TEAM-PROTOCOL.md）。
- T-2604-02、T-2604-04 已派 wave-1 执行者（文件域零交集）。
- T-2604-03 确认主循环在途完成，关闭。
