# TICKET-LEDGER · 任务台账（监工维护）

> 团队共享状态唯一真源（协议见 AGENT-TEAM-PROTOCOL.md §2.3）。
> 状态值：待派工 / 已派工 / 待复验 / 复验通过 / 已收口 / 打回 / 主循环在途 / 关闭

| 编号 | 目标 | 验收标准(摘要) | 文件域 | 执行者 | 状态 | 复验证据 / 关联 commit |
|---|---|---|---|---|---|---|
| T-2604-01 | 摘除 app.ts API 索引死端点宣传 | 索引无未实现端点；apiDocsEndpoint 25/25；esbuild 过 | backend/src/app.ts | 主理人 | 待派工 | — |
| T-2604-02 | shared/formatters/env 影子产物审计 | 语义比对有据；keep/delete 有理；build+定向测试过 | shared/formatters.{js,d.ts} shared/env.{js,d.ts} | wave1-worker | 已派工 | — |
| T-2604-03 | allowlist 死豁免清偿+基线重生成 | —（主循环 2026-10-04 已执行） | scripts/guard/ | 主循环 | 主循环在途 | allowlist 23→13、baseline 13 条，待主循环收口 |
| T-2604-04 | deriveIndustryFromName 最长命中优先 | 20+ 样本回归；5541 三名单 diff 说明；6/6 绿 | shared/industryClassification.ts | wave1-worker | 已派工 | — |
| T-2604-05 | D26-9 合规三件套评估 | 评估报告产出，不落地 | docs/ | 暂缓 | 待派工 | 待合规输入（留存期限） |
| T-2604-06 | route 层 dataSource 传播补全（#33/#39） | 拒供显式 dataSource；定向测试绿 | backend/src/api/ 逐文件 | wave2 | 待派工 | — |
| T-2604-07 | vitest 版本漂移收敛 | 版本对齐后 CI 仍绿 | frontend/package*.json | 主理人 | 待派工 | 择窗口 |
| T-2604-08 | D26-5 剩余欠账池 #37/#40/#41/#42 | 逐条核销 | 逐条声明 | 改进池 | 待派工 | — |

## 在途保护清单（禁止触碰，单通道红线）
- 主循环 automation-1784829898221 本轮产物：scripts/guard/allowlist.json、scripts/guard/honesty-baseline.md、PLAN.md、.workbuddy/memory/*
- 报告/产物：frontend/playwright-report/、frontend/scripts/ui-guard/.ast-findings.json、frontend/ui-guard-report.md

## 变更日志
- 2026-10-04 台账建立（主理人），wave-1 派工 2 项；T-2604-03 记主循环在途。
