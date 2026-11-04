# 死测试归档（2026-11）

> 归档时间：2026-11-04 13:40（Asia/Shanghai）
> 批准：用户 2026-11-04 13:24 拍板（D 类 13 个归档、M2 收口走归档路径）
> 上游复核：DSH `handover/14-D类归档复核.md`（20 个候选：D 成立 13、改判 R 7）

## 一、为什么归档

这 13 个文件是「影子测试」中的死链：断言的核心生产符号在 `backend/src` + `frontend/src` + `shared` 全仓 **rg -w 命中为 0**，
文件内自抄了一份实现或数据结构，产品代码怎么改它都不会红。它们占着测试体量与 CI 时间，却不提供任何回归保护。

判定口径与证据见 `handover/14` 第三节；本节只记录处置。

## 二、归档清单（13 个 / 4,113 行）

| # | 原路径 | 现路径 | 主符号（rg 0 命中） |
|---|--------|--------|--------------------|
| 1 | backend/src/__tests__/healthCheck.test.ts | backend/healthCheck.test.ts | HealthChecker |
| 2 | backend/src/__tests__/taskSchedulerEngine.test.ts | backend/taskSchedulerEngine.test.ts | TaskQueue、parseCronField、getNextRunTime、validateCronExpression |
| 3 | backend/src/__tests__/rollbackManagerLogic.test.ts | backend/rollbackManagerLogic.test.ts | RollbackPlan、canRollback、createRollbackPlan、compareVersions |
| 4 | frontend/src/__tests__/contextMenuLogic.test.ts | frontend/contextMenuLogic.test.ts | filterVisibleItems、buildMenuGroups、calcMenuPosition、formatShortcut |
| 5 | frontend/src/__tests__/marketOverviewLogic.test.ts | frontend/marketOverviewLogic.test.ts | 无符号锚点（内联数据 + Math.random） |
| 6 | frontend/src/__tests__/onboardingLogic.test.ts | frontend/onboardingLogic.test.ts | OnboardingStep、getNextStep、completeStep、calcProgress |
| 7 | frontend/src/__tests__/microFeedbackLogic.test.ts | frontend/microFeedbackLogic.test.ts | FEEDBACK_ICONS、createFeedback、buildFeedbackQueue |
| 8 | frontend/src/__tests__/codeAuditDeep.test.ts | frontend/codeAuditDeep.test.ts | calculateCyclomaticComplexity |
| 9 | frontend/src/__tests__/virtualScrollDataLogic.test.ts | frontend/virtualScrollDataLogic.test.ts | calcChunkIndex、buildChunkMap、getLoadedItemRange |
| 10 | frontend/src/__tests__/emptyStatesLogic.test.ts | frontend/emptyStatesLogic.test.ts | EMPTY_STATE_CONFIGS、getEmptyStateConfig |
| 11 | frontend/src/__tests__/virtualListLogic.test.ts | frontend/virtualListLogic.test.ts | calcVisibleRange、calcTotalHeight、calcScrollToIndex |
| 12 | frontend/src/__tests__/stockTableLogic.test.ts | frontend/stockTableLogic.test.ts | 无符号锚点（内联股票数组排序） |
| 13 | frontend/src/__tests__/accessibilityEngine.test.ts | frontend/accessibilityEngine.test.ts | tableAccessibilityConfig、browserReserved |

## 三、关联事实（未归档，别误删）

- `marketOverviewLogic.test.ts` 归档不代表 `MarketOverview.tsx:53` 有覆盖：该组件本身目前 0 测试，属未覆盖缺口。
- `contextMenuLogic.test.ts` 归档不代表 ContextMenu 无实现：生产 `ContextMenu.tsx:25/:120` 是组件化实现，只是没有这几个纯函数。
- `accessibilityEngine.test.ts` 归档后，`accessibility.ts` 的 20+ 工具函数仍由 `userDeepDive.test.ts` 等真实导入测试覆盖。

## 四、影响与复验

- 影子测试 700 → 687（45.6% → 45.2%），shadowLoc 177,485 → 173,372，测试总数 1,534 → 1,521；真实导入数不变（834）。
- 13 个文件移出 `src` 后自动脱离 frontend/backend 的 vitest include 与 tsconfig include，不需要改任何配置。
- 归档**不计入迁移数**：只有把断言绑到生产实现的文件才算迁移。
- 复验：`node scripts/guard/shadow-test-census.mjs --check` 与 `node scripts/guard/honesty-scan.mjs --strict` 均 exit 0。

## 五、如何恢复

单文件恢复（不破坏当前目录结构）：

```bash
git mv docs/_archive/dead-tests/2026-11/backend/healthCheck.test.ts backend/src/__tests__/healthCheck.test.ts
```

批量撤销本批 ARCHIVE 提交：

```bash
git revert <archive-commit-sha>
```

恢复前先确认三件事：生产里是否新增了同名符号、是否有新测试引用该文件、census 基线是否需要同步上调（上调需说明理由，基线只许因归档/迁移而下调）。
