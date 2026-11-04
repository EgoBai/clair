# REGRESSION-ASSETS · 防复发资产索引

> 来源：docs/rsi/dev-loop-v1.md §4「防复发机制」。
> 分工：docs/harness/TICKET-LEDGER.md 回答"这单走到哪一步"；本索引回答"这缺陷靠什么再也回不来"。
> 口径：一行一个「已收口」缺陷；索引行数少于已收口缺陷数 = 有单没交防复发物。
> 状态说明：E3 工具（scripts/guard/redgreen.mjs）2026-11-04 才落地，早于工具的收口单如实标注
> 「E3 未覆盖」或替代证据，不补造红→绿输出。

| 缺陷（对账台账编号） | 防复发物（文件:行 或 test 名） | 引入 commit | 红→绿证据 |
|---|---|---|---|
| T-2604-02 shared/formatters/env 影子产物 | .gitignore:9-10（shared/*.js、shared/*.d.ts 禁令）+ frontend/src/__tests__/sharedFormatters.test.ts | d93b7d4fd + ac6876c2a | 规则类无 E3：git check-ignore -v 命中 .gitignore:9/10（exit 0）+ 测试 56/56 绿（2026-10-04，早于 redgreen） |
| T-2604-03 allowlist 死豁免清偿 | scripts/guard/allowlist.json（13 条，均带 expiresAt）+ scripts/guard/honesty-baseline.md | b298ac2d5 | 规则类无 E3：honesty-scan --strict exit 0 + 台账同步校验（2026-10-04） |
| T-2604-04 deriveIndustryFromName 最长命中优先 | shared/industryClassification.ts:334（按 kw 长度降序稳定排序）+ backend/src/__tests__/subIndustryPerformance.test.ts（含 2026-11-04 补的「激光雷达 vs 激光」用例） | 63bae0666 | E3 已补跑（2026-11-04 11:14）：投毒 shared/industryClassification.ts:334 sort→(() => 0) → poisoned=FAIL(0.7s)；还原 → restored=PASS(0.6s)。工具 scripts/guard/redgreen.mjs |
| B25–B27 缓存/批量健壮性（覆盖误淘汰、空 key 与 size<=0 死循环、穿透定时器泄漏） | backend/src/services/cacheEngine.ts:36（set 先删旧 key；oldest===undefined 判定；capacityLimit 至少 1；nullTimers 随 delete/clear/destroy 清理）+ backend/src/services/batchOperations.ts:121（size 非法抛 RangeError）+ backend/src/__tests__/runtimeGuards.test.ts（11 例） | 初始实现（批次 45 定位，未回溯到单一 commit） | E3 手跑（2026-11-04 13:18）：旧文件快照探针 chunk([1,2,3],0) → V8 abort EXIT=134；LRUCache maxSize=1 先 set('') 再 set('a') → SIGALRM EXIT=142 挂死。修复后同探针 THREW RangeError / keys ["a","b"] evictions 1，EXIT=0；7 个受影响文件 238 passed |
| B24 query 脱敏大小写绕过（?Token= / ?APIKEY= 进日志） | backend/src/middleware/requestLogger.ts:82（normalizedKeys 小写比较）+ backend/src/__tests__/requestLogger.test.ts「should mask sensitive query params case-insensitively」 | 初始实现（批次 45 定位） | 规则类无 E3：旧实现 includes 大小写敏感（原用例只测小写 token）；新用例断言 ?Token=→se****56、?APIKEY=→ke****45，落库前实测红（改为 includes 即 FAIL） |
| T-2610-03 FIX-ETF nav-history 符号格式 | backend/src/utils/symbolUtils.ts:30-32 toBareCode + backend/src/__tests__/symbolNormalize.test.ts（裸码/带后缀/sh. 前缀三写法等价；etf.test.ts 只覆盖后缀，单独投毒不红） | 0c4cea97d | E3 已补跑（2026-11-04 11:13，redgreen.mjs）：投毒 symbolUtils.ts:31 去掉前缀剥离 → poisoned=FAIL(0.7s)；还原 → restored=PASS(0.7s) |

## 维护规则

1. 新单从「复验通过」转「已收口」前，必须在本表加一行；无防复发物不得收口。
2. 新增断言类防复发物必须同时附 redgreen 红→绿两次运行输出；规则/门禁类用行为探针替代并注明。
3. 本表只追加，不随台账状态回滚删除；打回重开时在「红→绿证据」列补一句重跑结果。
4. 本表行数应等于台账中「已收口」行数；不一致时先查是否漏交防复发物（metrics.mjs 只做提示，不阻断）。
