# 诚实红线门禁基线报告（honesty-scan）

> **门禁模式**：脚本默认非阻断（exit 0）；传 `--strict` 时，存在未豁免 RED 或过期豁免则 exit 1。
> 本报告措辞与调用方式无关，且不含生成时间戳 / 「剩余天数」等随运行漂移的字段，故可幂等提交；
> 台账「状态」列仅在条目真正到期（或代码变更致未命中）时变化，属真实状态变更。

- 运行命令：`node scripts/guard/honesty-scan.mjs`（默认，非阻断）/ `node scripts/guard/honesty-scan.mjs --strict`（未豁免 RED 或过期豁免 → exit 1）；均在仓库根执行
- 扫描根：`backend/src`、`frontend/src`（仅 `*.ts` / `*.tsx`）
- 规则 A 判据：`Math.random` 按路径分域（RED=供数路径 / YELLOW=其它 / 豁免域=归档·测试·种子）；**注释与字符串文本内提及**单列、不计违规（模板 `${}` 插值仍算代码）。
- 规则 B 判据：`backend/src/api/*.ts` 一层内 路由数 N>0 且 `dataSource` 次数 M==0 → `CONTRACT-MISSING`。
- 豁免匹配：`allowlist.json` 以 **path + match（源行片段）** 匹配，**行号仅提示不作判据**；每条必须有 `expiresAt`，到期自动转计为 RED。

## 摘要

| 域 / 指标 | 判据 | 命中数 |
|---|---|---|
| **RED**（供数路径，原始命中） | 路径含 `backend/src/api/` / `backend/src/services/` / `backend/src/db/` | **23** |
| ├ 其中已豁免 | 命中 allowlist 且类别合法、未过期 | 23 |
| ├ **未豁免 RED（阻断项）** | 无豁免条目 / 类别越界 / 无 expiresAt / **已过期** | **0** |
| └ 其中过期豁免 | 豁免已到期，自动转计为 RED | 0（0 条条目） |
| **YELLOW**（其它） | 其余前端/后端代码 | **53** |
| 豁免域 | `_archived` / `.bak` / `.test.` / `.spec.` / `__tests__` / `seeds/` | 1024 行 / 287 文件（仅计数） |
| 注释/字符串中提及（非违规） | 位于注释或字符串文本内，不产生运行期伪数据 | 57 |
| **规则 B 命中文件数** | 有路由但全文无 `dataSource` | **31** |
| 豁免台账规模 | allowlist 条目数（未命中 0 条） | 23 |

## 规则 A 明细

### RED 域（供数路径）

| 路径:行 | 行内容（截断 120 字符） | 豁免状态 |
|---|---|---|
| `backend/src/api/user.ts:210` | `const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;` | 豁免 `AL-001` |
| `backend/src/api/user.ts:368` | `id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,` | 豁免 `AL-002` |
| `backend/src/db/InMemoryDatabase.ts:233` | `const change = (Math.random() - 0.5) * 2 * volatility;` | 豁免 `AL-014` |
| `backend/src/db/InMemoryDatabase.ts:246` | `const basePrice = 10 + Math.random() * 200;` | 豁免 `AL-015` |
| `backend/src/db/InMemoryDatabase.ts:260` | `const high = Math.max(open, close) * (1 + Math.random() * 0.02);` | 豁免 `AL-016` |
| `backend/src/db/InMemoryDatabase.ts:261` | `const low = Math.min(open, close) * (1 - Math.random() * 0.02);` | 豁免 `AL-017` |
| `backend/src/db/InMemoryDatabase.ts:265` | `const volume = Math.floor(5000000 + Math.random() * 50000000);` | 豁免 `AL-018` |
| `backend/src/db/InMemoryDatabase.ts:281` | `turnoverRate: Math.round(Math.random() * 10 * 100) / 100,` | 豁免 `AL-019` |
| `backend/src/db/InMemoryDatabase.ts:282` | `peRatio: Math.round((10 + Math.random() * 50) * 100) / 100,` | 豁免 `AL-020` |
| `backend/src/db/InMemoryDatabase.ts:283` | `pbRatio: Math.round((1 + Math.random() * 10) * 100) / 100,` | 豁免 `AL-021` |
| `backend/src/db/InMemoryDatabase.ts:284` | `marketCap: Math.floor(close * (1e8 + Math.random() * 1e10)),` | 豁免 `AL-022` |
| `backend/src/db/InMemoryDatabase.ts:285` | `circulatingMarketCap: Math.floor(close * (5e7 + Math.random() * 5e9)),` | 豁免 `AL-023` |
| `backend/src/services/alertEngine.ts:101` | `id: `alert_${now}_${Math.random().toString(36).substr(2, 9)}`,` | 豁免 `AL-003` |
| `backend/src/services/crossAssetCorrelationEngine.ts:341` | `let v = Array(n).fill(0).map(() => Math.random());` | 豁免 `AL-011` |
| `backend/src/services/logger.ts:242` | `const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;` | 豁免 `AL-004` |
| `backend/src/services/notification/coordinator.ts:103` | `id: `task_${channel}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,` | 豁免 `AL-005` |
| `backend/src/services/notification/emailTemplateEngine.ts:308` | `id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,` | 豁免 `AL-006` |
| `backend/src/services/notification/emailTemplateEngine.ts:335` | `if (Math.random() > 0.1) {` | 豁免 `AL-012` |
| `backend/src/services/notification/rateLimitEngine.ts:136` | `if (priority === 'low' && Math.random() < this.adaptiveConfig.reductionFactor) {` | 豁免 `AL-013` |
| `backend/src/services/notification/service.ts:353` | `return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;` | 豁免 `AL-007` |
| `backend/src/services/notification/subscriptionManager.ts:87` | `id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,` | 豁免 `AL-008` |
| `backend/src/services/riskBudgetEngine.ts:114` | `const u1 = Math.random();` | 豁免 `AL-009` |
| `backend/src/services/riskBudgetEngine.ts:115` | `const u2 = Math.random();` | 豁免 `AL-010` |

### YELLOW 域（非供数路径，待评估）

| 路径:行 | 行内容（截断 120 字符） |
|---|---|
| `backend/src/middleware/securityHeaders.ts:144` | `return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;` |
| `backend/src/utils/errorTracker.ts:179` | `return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;` |
| `backend/src/utils/rbacEngine.ts:637` | `id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,` |
| `frontend/src/components/Common/EnhancedErrorBoundary.tsx:89` | `errorId: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,` |
| `frontend/src/components/Common/UnifiedErrorBoundary.tsx:263` | `return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:36` | `const price = 10 + Math.random() * 90;` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:37` | `const change = (Math.random() - 0.5) * 10;` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:38` | `const volume = Math.floor(Math.random() * 10000000) + 1000000;` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:40` | `const peRatio = 5 + Math.random() * 40;` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:51` | `sector: sectors[Math.floor(Math.random() * sectors.length)],` |
| `frontend/src/components/Performance/ComplexTableDemo.tsx:52` | `lastUpdated: new Date(Date.now() - Math.random() * 86400000).toISOString()` |
| `frontend/src/components/Performance/HeavyChartDemo.tsx:15` | `Math.sin(i * 0.1) * 50 + Math.cos(i * 0.05) * 30 + Math.random() * 20` |
| `frontend/src/services/enhancedWebsocket.ts:426` | `const jitter = delay * (0.8 + Math.random() * 0.4);` |
| `frontend/src/services/offlineQueue.ts:94` | `return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;` |
| `frontend/src/services/resilientWebSocket.ts:159` | `const jitter = exponentialDelay * 0.3 * Math.random();` |
| `frontend/src/services/retryUtility.ts:68` | `return capped * (0.5 + Math.random() * 0.5);` |
| `frontend/src/services/shortcutManager.ts:79` | `const id = `shortcut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;` |
| `frontend/src/services/wsConnectionManager.ts:232` | `const jitter = exponentialDelay * 0.3 * Math.random(); // ±30% 抖动` |
| `frontend/src/utils/algoTradingEngine.ts:113` | `displayQty = Math.floor(displayQty + (Math.random() - 0.5) * variance);` |
| `frontend/src/utils/analytics.ts:240` | `return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;` |
| `frontend/src/utils/correlationEngine.ts:225` | `const start = Math.floor(Math.random() * (n - windowSize));` |
| `frontend/src/utils/correlationEngine.ts:276` | `let v = Array.from({ length: n }, () => Math.random());` |
| `frontend/src/utils/dashboardLayoutEngine.ts:100` | `const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;` |
| `frontend/src/utils/dashboardLayoutEngine.ts:245` | `id: `widget-${now}-${Math.random().toString(36).slice(2, 6)}`,` |
| `frontend/src/utils/dataFlowEngine.ts:166` | `const shuffled = [...data].sort(() => Math.random() - 0.5);` |
| `frontend/src/utils/demoData.ts:130` | `const volume = opts.volume ?? Math.floor(50_000_000 + Math.random() * 200_000_000);` |
| `frontend/src/utils/demoData.ts:145` | `peRatio: opts.peRatio ?? +(15 + Math.random() * 30).toFixed(2),` |
| `frontend/src/utils/demoData.ts:146` | `pbRatio: opts.pbRatio ?? +(1.5 + Math.random() * 4).toFixed(2),` |
| `frontend/src/utils/earningsCallSentimentEngine.ts:71` | `sentiment: latest.sentimentScore + (Math.random() - 0.5) * 0.2,` |
| `frontend/src/utils/earningsCallSentimentEngine.ts:72` | `mentions: Math.floor(5 + Math.random() * 15),` |
| `frontend/src/utils/errorRecovery.ts:162` | `const jitter = delay * 0.2 * (Math.random() * 2 - 1);` |
| `frontend/src/utils/idleScheduler.ts:84` | `const id = options.id || `idle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;` |
| `frontend/src/utils/knowledgeStore.ts:84` | `id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),` |
| `frontend/src/utils/loadingOrchestrator.ts:252` | `const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;` |
| `frontend/src/utils/monteCarloEngine.ts:155` | `const jump = (jumpRng || Math.random)() < jumpIntensity * dt` |
| `frontend/src/utils/monteCarloEngine.ts:269` | `const r = rng || Math.random;` |
| `frontend/src/utils/monteCarloEngine.ts:318` | `const r = rng || Math.random;` |
| `frontend/src/utils/offlineMode.ts:239` | `id: `${action.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,` |
| `frontend/src/utils/performanceMonitor.ts:82` | `: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;` |
| `frontend/src/utils/performanceMonitorEnhanced.ts:123` | `return `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;` |
| `frontend/src/utils/riskScenarioEngine.ts:211` | `const z = (Math.random() + Math.random() + Math.random() - 1.5) * 2 / Math.sqrt(3); // approx normal` |
| `frontend/src/utils/riskScenarioEngine.ts:211` | `const z = (Math.random() + Math.random() + Math.random() - 1.5) * 2 / Math.sqrt(3); // approx normal` |
| `frontend/src/utils/riskScenarioEngine.ts:211` | `const z = (Math.random() + Math.random() + Math.random() - 1.5) * 2 / Math.sqrt(3); // approx normal` |
| `frontend/src/utils/securityEngine.ts:368` | `array[i] = Math.floor(Math.random() * chars.length);` |
| `frontend/src/utils/smartBetaEngine.ts:134` | `turnover: Math.random() * 0.3,` |
| `frontend/src/utils/tradeCostEngineV3.ts:202` | `const avgLatency = 50 + Math.random() * 200; // 模拟延迟` |
| `frontend/src/utils/tradeCostEngineV3.ts:218` | `toxicityScore: Math.round(Math.random() * 30) / 100` |
| `frontend/src/utils/tradeCostEngineV3.ts:245` | `const timingScore = 75 + Math.random() * 20;` |
| `frontend/src/utils/walkForwardEngine.ts:233` | `const splitPoint = trainSize + Math.floor(Math.random() * (totalPeriods - trainSize - 1));` |
| `frontend/src/utils/webVitals.ts:63` | `return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;` |
| `frontend/src/utils/workerManager.ts:308` | `const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;` |
| `frontend/src/utils/wsConnectionPool.ts:55` | `const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;` |
| `frontend/src/utils/wsConnectionPool.ts:77` | `const jitter = Math.random() * this.baseReconnectDelay * 0.5;` |

### 豁免域（仅计数，不逐行列出）

| 文件 | 命中行数 |
|---|---|
| `backend/src/__tests__/abnormalTradeEngine.test.ts` | 5 |
| `backend/src/__tests__/abTesting.test.ts` | 1 |
| `backend/src/__tests__/adaptiveStopLossEngine.test.ts` | 1 |
| `backend/src/__tests__/advancedFinancialEngine.test.ts` | 4 |
| `backend/src/__tests__/advancedIndicatorsV2.test.ts` | 3 |
| `backend/src/__tests__/aiAnalysisProper.test.ts` | 4 |
| `backend/src/__tests__/alternativeDataEngine.test.ts` | 2 |
| `backend/src/__tests__/apiEndpointComprehensive.test.ts` | 1 |
| `backend/src/__tests__/apiGateway.test.ts` | 1 |
| `backend/src/__tests__/apiResponseFormatLogic.test.ts` | 1 |
| `backend/src/__tests__/apiSecurityComprehensive.test.ts` | 4 |
| `backend/src/__tests__/backtestCombinations.test.ts` | 7 |
| `backend/src/__tests__/backtestEngineLogic.test.ts` | 4 |
| `backend/src/__tests__/backtestProper.test.ts` | 8 |
| `backend/src/__tests__/backtestRoutes.test.ts` | 4 |
| `backend/src/__tests__/backtestStrategies.test.ts` | 6 |
| `backend/src/__tests__/benchmark.test.ts` | 1 |
| `backend/src/__tests__/blockTradesAndAI.test.ts` | 14 |
| `backend/src/__tests__/businessLogicExtended.test.ts` | 6 |
| `backend/src/__tests__/cacheIntegration.test.ts` | 1 |
| `backend/src/__tests__/candlestickPatterns.test.ts` | 4 |
| `backend/src/__tests__/complianceEngine.test.ts` | 2 |
| `backend/src/__tests__/crossAssetCorrelationEngine.test.ts` | 1 |
| `backend/src/__tests__/darkPoolEngine.test.ts` | 4 |
| `backend/src/__tests__/databaseExtended.test.ts` | 1 |
| `backend/src/__tests__/dataPipeline.test.ts` | 1 |
| `backend/src/__tests__/dataPipelineDeep.test.ts` | 1 |
| `backend/src/__tests__/dataSourceManager.test.ts` | 1 |
| `backend/src/__tests__/dataStorageEngine.test.ts` | 1 |
| `backend/src/__tests__/dataSyncService.test.ts` | 2 |
| `backend/src/__tests__/digestAndRouter.test.ts` | 1 |
| `backend/src/__tests__/digestEngine.test.ts` | 1 |
| `backend/src/__tests__/edgeCases.test.ts` | 1 |
| `backend/src/__tests__/emailAndGrouping.test.ts` | 1 |
| `backend/src/__tests__/errorHandlingLogic.test.ts` | 1 |
| `backend/src/__tests__/etfAnalysis.test.ts` | 10 |
| `backend/src/__tests__/eventBusEngine.test.ts` | 2 |
| `backend/src/__tests__/eventStudyEngine.test.ts` | 2 |
| `backend/src/__tests__/eventSystem.test.ts` | 1 |
| `backend/src/__tests__/factorDecayEngine.test.ts` | 2 |
| `backend/src/__tests__/factorRankingEngine.test.ts` | 2 |
| `backend/src/__tests__/formatterAndCoordinator.test.ts` | 1 |
| `backend/src/__tests__/fundFlow.test.ts` | 5 |
| `backend/src/__tests__/fundFlowAnalysis.test.ts` | 3 |
| `backend/src/__tests__/fundFlowApi.test.ts` | 2 |
| `backend/src/__tests__/futureValueEngine.test.ts` | 1 |
| `backend/src/__tests__/garchVolatilityEngine.test.ts` | 1 |
| `backend/src/__tests__/groupingEngine.test.ts` | 1 |
| `backend/src/__tests__/historicalDataValidator.test.ts` | 6 |
| `backend/src/__tests__/hmmRegimeEngine.test.ts` | 1 |
| `backend/src/__tests__/icAnalysisEngine.test.ts` | 1 |
| `backend/src/__tests__/ichimokuEngine.test.ts` | 3 |
| `backend/src/__tests__/indicators.test.ts` | 4 |
| `backend/src/__tests__/indicatorsAPI.test.ts` | 11 |
| `backend/src/__tests__/inMemoryDatabase.test.ts` | 10 |
| `backend/src/__tests__/klineAndOrderBook.test.ts` | 5 |
| `backend/src/__tests__/liquidityEngine.test.ts` | 10 |
| `backend/src/__tests__/marketRegimeV2.test.ts` | 1 |
| `backend/src/__tests__/matchingEngine.test.ts` | 1 |
| `backend/src/__tests__/microstructure.test.ts` | 2 |
| `backend/src/__tests__/microstructureEngine.test.ts` | 1 |
| `backend/src/__tests__/migration.test.ts` | 1 |
| `backend/src/__tests__/momentumDivergenceEngine.test.ts` | 2 |
| `backend/src/__tests__/northboundFlow.test.ts` | 6 |
| `backend/src/__tests__/notification-coordinator.test.ts` | 1 |
| `backend/src/__tests__/notification-email-template-engine.test.ts` | 1 |
| `backend/src/__tests__/notification-rate-limit-engine.test.ts` | 1 |
| `backend/src/__tests__/notification-service.test.ts` | 1 |
| `backend/src/__tests__/notificationDeep.test.ts` | 1 |
| `backend/src/__tests__/notificationSystem.test.ts` | 1 |
| `backend/src/__tests__/notificationSystemIntegration.test.ts` | 1 |
| `backend/src/__tests__/optionsChainAnalyticsEngine.test.ts` | 4 |
| `backend/src/__tests__/orderBook.test.ts` | 1 |
| `backend/src/__tests__/orderFlowAnalysis.test.ts` | 3 |
| `backend/src/__tests__/patternRecognitionEngine.test.ts` | 6 |
| `backend/src/__tests__/portfolioAnalytics.test.ts` | 2 |
| `backend/src/__tests__/portfolioRiskEngine.test.ts` | 5 |
| `backend/src/__tests__/priorityRouter.test.ts` | 1 |
| `backend/src/__tests__/quantFactorEngine.test.ts` | 2 |
| `backend/src/__tests__/quantitativeAnalysis.test.ts` | 2 |
| `backend/src/__tests__/quantitativeStrategies.test.ts` | 1 |
| `backend/src/__tests__/quantStrategy.test.ts` | 1 |
| `backend/src/__tests__/reportGenerator.test.ts` | 1 |
| `backend/src/__tests__/requestLogger.test.ts` | 1 |
| `backend/src/__tests__/returnAttributionEngine.test.ts` | 5 |
| `backend/src/__tests__/returnDistributionEngine.test.ts` | 2 |
| `backend/src/__tests__/riskAnalyticsV2.test.ts` | 1 |
| `backend/src/__tests__/riskBudgetEngine.test.ts` | 3 |
| `backend/src/__tests__/riskManagement.test.ts` | 1 |
| `backend/src/__tests__/riskManagementEngine.test.ts` | 1 |
| `backend/src/__tests__/riskMetrics.test.ts` | 22 |
| `backend/src/__tests__/sectorAnalysisEngine.test.ts` | 2 |
| `backend/src/__tests__/sectorRotation.test.ts` | 5 |
| `backend/src/__tests__/securityAuthSystem.test.ts` | 2 |
| `backend/src/__tests__/securityMiddleware.test.ts` | 1 |
| `backend/src/__tests__/services/sectorService.test.ts` | 1 |
| `backend/src/__tests__/smartMoneyEngine.test.ts` | 5 |
| `backend/src/__tests__/stockScreenerEngine.test.ts` | 12 |
| `backend/src/__tests__/tailRiskHedgeEngine.test.ts` | 2 |
| `backend/src/__tests__/taskSchedulerEngine.test.ts` | 1 |
| `backend/src/__tests__/taskSchedulerLogic.test.ts` | 1 |
| `backend/src/__tests__/technicalAnalysis.test.ts` | 3 |
| `backend/src/__tests__/technicalIndicatorsAdvanced.test.ts` | 4 |
| `backend/src/__tests__/timeSeriesAnalysis.test.ts` | 9 |
| `backend/src/__tests__/timeSeriesEngineV2.test.ts` | 1 |
| `backend/src/__tests__/topTraders.test.ts` | 18 |
| `backend/src/__tests__/tradeExecution.test.ts` | 1 |
| `backend/src/__tests__/tradingEngine.test.ts` | 2 |
| `backend/src/__tests__/tradingRulesAStock.test.ts` | 1 |
| `backend/src/__tests__/tradingSignals.test.ts` | 1 |
| `backend/src/__tests__/tradingSimulation.test.ts` | 4 |
| `backend/src/__tests__/userSystemEnhanced.test.ts` | 2 |
| `backend/src/__tests__/volatilityEngine.test.ts` | 4 |
| `backend/src/__tests__/volatilityModeling.test.ts` | 16 |
| `backend/src/__tests__/volumeProfileEngine.test.ts` | 2 |
| `backend/src/__tests__/walkForwardOptimizationEngine.test.ts` | 1 |
| `backend/src/__tests__/websocketIntegration.test.ts` | 1 |
| `backend/src/__tests__/websocketLogic.test.ts` | 2 |
| `backend/src/__tests__/websocketPool.test.ts` | 3 |
| `backend/src/__tests__/wsPushEngine.test.ts` | 1 |
| `backend/src/__tests__/wyckoffEngine.test.ts` | 3 |
| `backend/src/.dead-code/market-stats.ts` | 31 |
| `backend/src/api/_archived/order-book.ts` | 12 |
| `backend/src/api/_archived/shareholder-changes.ts` | 8 |
| `backend/src/api/_archived/top-traders.ts` | 21 |
| `backend/src/seeds/seed-stocks-v2.ts` | 13 |
| `frontend/src/__tests__/advancedChartUtils.test.ts` | 2 |
| `frontend/src/__tests__/aiSignalEngine.test.ts` | 3 |
| `frontend/src/__tests__/alphaDecayEngine.test.ts` | 2 |
| `frontend/src/__tests__/apiUtils.test.ts` | 1 |
| `frontend/src/__tests__/backtestPageLogic.test.ts` | 1 |
| `frontend/src/__tests__/backtestValidationEngine.test.ts` | 2 |
| `frontend/src/__tests__/backtestVisualizer.test.ts` | 7 |
| `frontend/src/__tests__/bondEquityEngine.test.ts` | 4 |
| `frontend/src/__tests__/chartCalculations.test.ts` | 1 |
| `frontend/src/__tests__/chartComponents.test.ts` | 1 |
| `frontend/src/__tests__/chartEngine.test.ts` | 2 |
| `frontend/src/__tests__/chartInteractionEngine.test.ts` | 1 |
| `frontend/src/__tests__/chartPerformanceUtil.test.ts` | 1 |
| `frontend/src/__tests__/chartSystem.test.ts` | 6 |
| `frontend/src/__tests__/chipDistribution.test.ts` | 1 |
| `frontend/src/__tests__/componentHelpers.test.ts` | 1 |
| `frontend/src/__tests__/correlationEngine.test.ts` | 3 |
| `frontend/src/__tests__/correlationRegimeEngine.test.ts` | 9 |
| `frontend/src/__tests__/creditRiskEngine.test.ts` | 1 |
| `frontend/src/__tests__/crossAssetCorrelationEngine.test.ts` | 14 |
| `frontend/src/__tests__/crossMarketEngine.test.ts` | 2 |
| `frontend/src/__tests__/crossMarketLinkageEngine.test.ts` | 3 |
| `frontend/src/__tests__/darkPoolEngine.test.ts` | 5 |
| `frontend/src/__tests__/dashboardBuilder.test.ts` | 2 |
| `frontend/src/__tests__/dashboardWidgets.test.ts` | 2 |
| `frontend/src/__tests__/dataManager.test.ts` | 11 |
| `frontend/src/__tests__/dataProcessingEngine.test.ts` | 1 |
| `frontend/src/__tests__/dataQualityEngine.test.ts` | 5 |
| `frontend/src/__tests__/dataStreamProcessing.test.ts` | 2 |
| `frontend/src/__tests__/dataViz.test.ts` | 4 |
| `frontend/src/__tests__/debounceThrottleTyped.test.ts` | 1 |
| `frontend/src/__tests__/domUtilities.test.ts` | 1 |
| `frontend/src/__tests__/earningsDriftEngine.test.ts` | 4 |
| `frontend/src/__tests__/earningsSurpriseEngine.test.ts` | 9 |
| `frontend/src/__tests__/enhancedWSLogic.test.ts` | 1 |
| `frontend/src/__tests__/eodAnomalyEngine.test.ts` | 3 |
| `frontend/src/__tests__/esgImpactEngine.test.ts` | 2 |
| `frontend/src/__tests__/eventCalendarEngine.test.ts` | 1 |
| `frontend/src/__tests__/eventDrivenEngine.test.ts` | 2 |
| `frontend/src/__tests__/eventDrivenStrategyEngine2.test.ts` | 1 |
| `frontend/src/__tests__/ExportButton.test.tsx` | 1 |
| `frontend/src/__tests__/factorAnalysis.test.ts` | 10 |
| `frontend/src/__tests__/factorAttributionEngine.test.ts` | 3 |
| `frontend/src/__tests__/factorAttributionEngineV2.test.ts` | 1 |
| `frontend/src/__tests__/factorExposureEngine.test.ts` | 6 |
| `frontend/src/__tests__/factorICEngine.test.ts` | 1 |
| `frontend/src/__tests__/factorMiningEngine.test.ts` | 4 |
| `frontend/src/__tests__/featureEngineeringEngine.test.ts` | 3 |
| `frontend/src/__tests__/financialCalcsAndPipelines.test.ts` | 4 |
| `frontend/src/__tests__/frontendConfig.test.ts` | 1 |
| `frontend/src/__tests__/fundingRateEngine.test.ts` | 6 |
| `frontend/src/__tests__/garchVolatilityEngine.test.ts` | 1 |
| `frontend/src/__tests__/highFrequencyEngine.test.ts` | 3 |
| `frontend/src/__tests__/hookLogic.test.ts` | 1 |
| `frontend/src/__tests__/industryCorrelationEngine.test.ts` | 4 |
| `frontend/src/__tests__/industryRotationPredictEngine.test.ts` | 6 |
| `frontend/src/__tests__/intermarketDivergenceEngine.test.ts` | 4 |
| `frontend/src/__tests__/intradayPatternEngine.test.ts` | 4 |
| `frontend/src/__tests__/intradaySeasonalityEngine.test.ts` | 6 |
| `frontend/src/__tests__/keyboardNavAdvanced.test.ts` | 1 |
| `frontend/src/__tests__/lazyLoaderLogic.test.ts` | 1 |
| `frontend/src/__tests__/liquidityRiskEngine.test.ts` | 5 |
| `frontend/src/__tests__/macroCalendarEngine.test.ts` | 1 |
| `frontend/src/__tests__/mainForceEngine.test.ts` | 5 |
| `frontend/src/__tests__/marketAnalytics.test.ts` | 5 |
| `frontend/src/__tests__/marketBreadthIndicators.test.ts` | 6 |
| `frontend/src/__tests__/marketMakerEngine.test.ts` | 19 |
| `frontend/src/__tests__/marketMicrostructureV2Engine.test.ts` | 5 |
| `frontend/src/__tests__/marketOverviewLogic.test.ts` | 2 |
| `frontend/src/__tests__/marketRegimeDetector.test.ts` | 12 |
| `frontend/src/__tests__/marketRegimeEngine.test.ts` | 11 |
| `frontend/src/__tests__/marketSentimentUI2.test.ts` | 2 |
| `frontend/src/__tests__/marketTimingEngine.test.ts` | 11 |
| `frontend/src/__tests__/meanReversionEngine.test.ts` | 11 |
| `frontend/src/__tests__/meanVarianceEngine.test.ts` | 2 |
| `frontend/src/__tests__/microstructureEngine.test.ts` | 4 |
| `frontend/src/__tests__/minutePatternEngine.test.ts` | 2 |
| `frontend/src/__tests__/momentumOscillatorEngine.test.ts` | 3 |
| `frontend/src/__tests__/monteCarloSimulation.test.ts` | 5 |
| `frontend/src/__tests__/multiFactorModel.test.ts` | 10 |
| `frontend/src/__tests__/multiTimeFrameEngine.test.ts` | 7 |
| `frontend/src/__tests__/notificationEngine.test.ts` | 1 |
| `frontend/src/__tests__/notificationEngine2.test.ts` | 1 |
| `frontend/src/__tests__/notificationManager.test.ts` | 1 |
| `frontend/src/__tests__/notificationsAlerts.test.ts` | 1 |
| `frontend/src/__tests__/notificationsDeep.test.ts` | 1 |
| `frontend/src/__tests__/notificationSystem.test.ts` | 1 |
| `frontend/src/__tests__/numberFormatEngine.test.ts` | 1 |
| `frontend/src/__tests__/offlineModeUtil.test.ts` | 1 |
| `frontend/src/__tests__/optionImpliedDistEngine.test.ts` | 2 |
| `frontend/src/__tests__/optionsChainEngine.test.ts` | 12 |
| `frontend/src/__tests__/orderFlowImbalanceEngine.test.ts` | 3 |
| `frontend/src/__tests__/pairsTradingEngine.test.ts` | 1 |
| `frontend/src/__tests__/pairsTradingEngine2.test.ts` | 2 |
| `frontend/src/__tests__/parameterOptimizer.test.ts` | 4 |
| `frontend/src/__tests__/patentAnalysisEngine.test.ts` | 1 |
| `frontend/src/__tests__/performanceAnalytics.test.ts` | 1 |
| `frontend/src/__tests__/performanceAnalyzer.test.ts` | 2 |
| `frontend/src/__tests__/portfolioAttributionEngine.test.ts` | 4 |
| `frontend/src/__tests__/portfolioEngine.test.ts` | 1 |
| `frontend/src/__tests__/portfolioOptimization.test.ts` | 1 |
| `frontend/src/__tests__/portfolioRisk.test.ts` | 4 |
| `frontend/src/__tests__/portfolioStrategyManager.test.ts` | 1 |
| `frontend/src/__tests__/portfolioStressEngine.test.ts` | 3 |
| `frontend/src/__tests__/pwa.test.ts` | 1 |
| `frontend/src/__tests__/pwaExtended.test.ts` | 1 |
| `frontend/src/__tests__/quantFactorBacktestEngine.test.ts` | 2 |
| `frontend/src/__tests__/quantFactorModel.test.ts` | 13 |
| `frontend/src/__tests__/rebalancingEngine.test.ts` | 2 |
| `frontend/src/__tests__/regimeTransitionEngine.test.ts` | 2 |
| `frontend/src/__tests__/relativeStrengthEngine.test.ts` | 1 |
| `frontend/src/__tests__/riskAdjustedReturnEngine.test.ts` | 2 |
| `frontend/src/__tests__/riskManagementEngine.test.ts` | 1 |
| `frontend/src/__tests__/riskParityV2Engine.test.ts` | 3 |
| `frontend/src/__tests__/sectorAnalysis.test.ts` | 5 |
| `frontend/src/__tests__/sectorMomentumRotationEngine.test.ts` | 5 |
| `frontend/src/__tests__/sectorRotationEngine.test.ts` | 2 |
| `frontend/src/__tests__/sectorRotationPredictEngine.test.ts` | 1 |
| `frontend/src/__tests__/sectorRotationV2Engine.test.ts` | 4 |
| `frontend/src/__tests__/securityLogic.test.ts` | 1 |
| `frontend/src/__tests__/selectionBacktest.test.ts` | 6 |
| `frontend/src/__tests__/sentimentEngine.test.ts` | 4 |
| `frontend/src/__tests__/serviceWorkerEnhanced.test.ts` | 2 |
| `frontend/src/__tests__/shortSqueezeEngine.test.ts` | 1 |
| `frontend/src/__tests__/signalProcessingEngine.test.ts` | 1 |
| `frontend/src/__tests__/smartBetaEngine.test.ts` | 8 |
| `frontend/src/__tests__/smartMoneyEngine.test.ts` | 6 |
| `frontend/src/__tests__/socialSentimentEngine.test.ts` | 1 |
| `frontend/src/__tests__/spreadAnalysisEngine.test.ts` | 2 |
| `frontend/src/__tests__/statArbEngine.test.ts` | 1 |
| `frontend/src/__tests__/stateManagementFlow.test.ts` | 1 |
| `frontend/src/__tests__/statisticalArbEngine.test.ts` | 7 |
| `frontend/src/__tests__/stockConnectEngine.test.ts` | 4 |
| `frontend/src/__tests__/strategyComparator.test.ts` | 11 |
| `frontend/src/__tests__/strategyPerformanceEngine.test.ts` | 2 |
| `frontend/src/__tests__/streamProcessingEngine.test.ts` | 9 |
| `frontend/src/__tests__/stringProcessingEngine.test.ts` | 1 |
| `frontend/src/__tests__/tailRiskEngine.test.ts` | 2 |
| `frontend/src/__tests__/tailRiskHedgingEngine.test.ts` | 1 |
| `frontend/src/__tests__/tickDataEngine.test.ts` | 3 |
| `frontend/src/__tests__/timeSeriesEngine.test.ts` | 9 |
| `frontend/src/__tests__/tradeCostEngineV3.test.ts` | 5 |
| `frontend/src/__tests__/tradingStrategyEngine.test.ts` | 2 |
| `frontend/src/__tests__/twapEngine.test.ts` | 1 |
| `frontend/src/__tests__/useWSNotification.test.ts` | 3 |
| `frontend/src/__tests__/volatilityEngine.test.ts` | 3 |
| `frontend/src/__tests__/volSurfaceEngine2.test.ts` | 9 |
| `frontend/src/__tests__/volTermStructureEngine.test.ts` | 6 |
| `frontend/src/__tests__/volumeAnomalyDetector.test.ts` | 3 |
| `frontend/src/__tests__/volumePatternEngine.test.ts` | 4 |
| `frontend/src/__tests__/volumePriceEngine.test.ts` | 3 |
| `frontend/src/__tests__/vwapEngine.test.ts` | 1 |
| `frontend/src/__tests__/walkForwardEngine.test.ts` | 3 |
| `frontend/src/__tests__/websocketLogic.test.ts` | 1 |
| `frontend/src/__tests__/webSocketProtocol3.test.ts` | 1 |
| `frontend/src/__tests__/websocketProtocolV2.test.ts` | 1 |
| `frontend/src/__tests__/webVitals.test.ts` | 1 |
| `frontend/src/__tests__/webVitalsLogic.test.ts` | 1 |
| `frontend/src/__tests__/wsNotificationPush.test.ts` | 2 |
| `frontend/src/__tests__/wsReconnectionLogic.test.ts` | 1 |
| `frontend/src/pages/_archived/PerformanceDemoPage.tsx` | 4 |

### 注释 / 字符串文本中提及（非违规，仅供参考）

| 路径:行 | 类型 | 行内容（截断 120 字符） |
|---|---|---|
| `backend/src/__tests__/ai-analysis.test.ts:9` | 注释 | `* - 严禁任何路径出现 Math.random 伪造（路由文件已去除此类逻辑）。` |
| `backend/src/__tests__/ai-analysis.test.ts:314` | 字符串 | `it('api/ai-analysis.ts 文件零 Math.random 残留', async () => {` |
| `backend/src/__tests__/ai-analysis.test.ts:321` | 字符串 | `expect(file).not.toContain('Math.random');` |
| `backend/src/__tests__/ai-analysis.test.ts:324` | 字符串 | `it('utils/aiAnalysis.ts 文件零 Math.random 残留', async () => {` |
| `backend/src/__tests__/ai-analysis.test.ts:331` | 字符串 | `expect(file).not.toContain('Math.random');` |
| `backend/src/__tests__/aiAnalysisExtended.test.ts:12` | 注释 | `// 构造一批真实风格的测试股票数据（无 Math.random），供批量分析函数使用` |
| `backend/src/__tests__/aiAnalysisExtended.test.ts:249` | 字符串 | `it('capitalInflow 应诚实为 0（无真实资金流源，不 Math.random 伪造）', () => {` |
| `backend/src/__tests__/blockTradesDataService.test.ts:4` | 注释 | `* 约定：大宗交易不再包含任何硬编码种子 / Math.random 伪造数据。` |
| `backend/src/__tests__/etf.test.ts:8` | 注释 | `* - 全程不调用 Math.random（避免回归到旧版净值模拟）。` |
| `backend/src/__tests__/etf.test.ts:88` | 注释 | `// 不含 Math.random 伪造字段` |
| `backend/src/__tests__/etf.test.ts:185` | 字符串 | `it('真实源可用时返回真实净值历史（非 Math.random 模拟）', async () => {` |
| `backend/src/__tests__/etf.test.ts:198` | 注释 | `// 净值应为固定真实值，不应每次调用都变化（即非 Math.random）` |
| `backend/src/__tests__/etf.test.ts:223` | 字符串 | `describe('Math.random 回归守卫', () => {` |
| `backend/src/__tests__/etf.test.ts:224` | 字符串 | `it('整个 ETF 路由响应中不应出现 Math.random 伪造的随机净值', async () => {` |
| `backend/src/__tests__/etf.test.ts:225` | 注释 | `// 监视 Math.random，确保路由处理过程中未被调用` |
| `backend/src/__tests__/financialsHonestData.test.ts:5` | 注释 | `* - financials 路由与服务不得使用 Math.random / 硬编码伪造财务数据；` |
| `backend/src/__tests__/financialsHonestData.test.ts:20` | 注释 | `// ==================== 诚实数据红线：源文件不得包含 Math.random ====================` |
| `backend/src/__tests__/financialsHonestData.test.ts:28` | 字符串 | `it(`${f.split('/').pop()} 不含 Math.random 伪造`, () => {` |
| `backend/src/__tests__/financialsHonestData.test.ts:30` | 字符串 | `expect(src).not.toContain('Math.random');` |
| `backend/src/__tests__/financialsHonestData.test.ts:136` | 字符串 | `it('真实源可用时返回汇总 + indicators（含真实 revenueGrowth/profitGrowth，非 Math.random）', async () => {` |
| `backend/src/__tests__/financialsHonestData.test.ts:191` | 字符串 | `it('metric=roa 时结合资产负债表真实计算（不调用 Math.random）', async () => {` |
| `backend/src/__tests__/healthHonestDegradation.test.ts:10` | 注释 | `* `dbType`，致使「PG 不可用 → 后端静默供给 5541 只 Math.random 伪造行情」` |
| `backend/src/__tests__/klineDataService.test.ts:5` | 注释 | `* 绝不包含任何 Math.random / 硬编码假 K 线。` |
| `backend/src/__tests__/rotationEngine.test.ts:7` | 注释 | `/** Deterministic return generator — avoids flaky Math.random() tests */` |
| `backend/src/api/etf.ts:4` | 注释 | `* - 单位净值(NAV) 与净值历史：东方财富 fundf10 lsjz（免 key），替换原 Math.random 模拟` |
| `backend/src/api/etf.ts:111` | 注释 | `* 获取 ETF 净值历史（真实源，替换原 Math.random 模拟）` |
| `backend/src/api/eventCalendar.ts:18` | 注释 | `* - 现有 lockup-shares 接口为 Math.random 伪数据，按红线剔除，真实解禁源待接入。` |
| `backend/src/api/lockup-shares.ts:4` | 注释 | `* 红线：原实现全量 Math.random 伪数据（解禁日期/股数/市值/比例/股东/个股历史），` |
| `backend/src/api/margin.ts:4` | 注释 | `* 红线：原实现全量 Math.random 伪数据，违反「诚实数据」要求，已彻底移除。` |
| `backend/src/app.ts:297` | 注释 | `// fabricationAllowed=true → 逃生开关已打开，正在对外供给 Math.random 伪造行情（违反诚实红线）` |
| `backend/src/db/FabricatedDataRefusedError.ts:6` | 注释 | `* 全部由 `Math.random()` 伪造（见该文件 generateQuotes/generatePrice 的 JSDoc）。` |
| `backend/src/db/FabricatedDataRefusedError.ts:46` | 字符串 | `reason = '生产环境处于内存库降级态，行情/估值为 Math.random 伪造数据，拒绝供给',` |
| `backend/src/db/InMemoryDatabase.ts:240` | 注释 | `* 用 `Math.random()` 全量伪造 open/close/high/low/volume/turnover/` |
| `backend/src/db/InMemoryDatabase.ts:309` | 注释 | `* 本类中的 OHLCV / 涨跌幅 / 成交额 / 换手率 / PE / PB / 市值全部由 Math.random() 伪造` |
| `backend/src/db/InMemoryDatabase.ts:355` | 注释 | `// 但下面的行情/估值全部由 Math.random() 伪造，调用方不得当作真实行情。` |
| `backend/src/db/InMemoryDatabase.ts:358` | 字符串 | ``(Math.random 伪造 120 日 K 线 + 估值)，仅供本地开发/降级降噪，禁止视为真实行情`,` |
| `backend/src/db/InMemoryDatabase.ts:392` | 字符串 | `'🚨 ALLOW_FABRICATED_MARKET_DATA=true 已显式放行：生产环境正在以 Math.random 伪造行情对外供给，' +` |
| `backend/src/db/dbFactory.ts:19` | 注释 | `* ⚠️ 内存库中的行情/估值为 Math.random 伪造数据（真实数据只有股票清单）：` |
| `backend/src/db/dbFactory.ts:78` | 字符串 | `'内存库的行情/估值为 Math.random 伪造数据，生产环境已拒供（相关端点将返回错误/无数据，' +` |
| `backend/src/db/dbFactory.ts:81` | 字符串 | `'ALLOW_FABRICATED_MARKET_DATA=true 正在使生产 API 以 Math.random 伪造行情对外供给，' +` |
| `backend/src/services/aiDiagnosisEngine.ts:4` | 注释 | `* 替换原 ai-stock-selection.ts 中基于 Math.random 的伪随机评分。` |
| `backend/src/services/etfDataService.ts:229` | 注释 | `* 获取 ETF 净值历史（真实源，替换原 Math.random 模拟）` |
| `backend/src/services/fundFlowProviders.ts:49` | 注释 | `// ============ 确定性随机：FNV-1a + LCG（禁用 Math.random） ============` |
| `backend/src/services/fundFlowProviders.ts:452` | 注释 | `/** 导出 DemoProvider 实例工厂，供 api 层复用其确定性历史生成（替代 Math.random mock） */` |
| `backend/src/services/healthCheck.ts:140` | 注释 | `// 数据库降级可观测性：内存模式即降级态（行情为 Math.random 伪造数据）` |
| `backend/src/services/klineDataService.ts:17` | 注释 | `* - 不使用任何 Math.random / 硬编码假 K 线。` |
| `frontend/src/__tests__/backtestRealData.test.ts:4` | 注释 | `* mock /api/market/kline 返回真实形态的 220 日 K 线样例（LCG 确定性，无 Math.random），` |
| `frontend/src/__tests__/backtestRealData.test.ts:59` | 注释 | `// ==================== 确定性 mock K 线（LCG，无 Math.random） ====================` |
| `frontend/src/__tests__/calendarAnomalyEngine.test.ts:15` | 注释 | `* (Rewritten to import the real module functions; deterministic data, no Math.random.)` |
| `frontend/src/__tests__/debounceThrottleTyped.test.ts:169` | 注释 | `// Mock requestAnimationFrame to use Math.random for unique IDs` |
| `frontend/src/__tests__/factorSeries.test.ts:35` | 注释 | `/** 生成 2024 年起的确定性日线（无 Math.random） */` |
| `frontend/src/__tests__/regimeDetectionEngine.test.ts:5` | 注释 | `* calculateVolatilityRegime 旧测试用 Math.random 喂数据, 改为确定性数据。` |
| `frontend/src/__tests__/seasonalPatternEngine.test.ts:19` | 注释 | `* 使用确定性数据驱动真实逻辑，不依赖 Math.random 假数据。` |
| `frontend/src/services/reviewSnapshot.ts:14` | 注释 | `* 3. 不使用 Math.random()。快照 id 用 crypto.randomUUID()，不可用时退化为` |
| `frontend/src/utils/deterministic.ts:4` | 注释 | `* Unlike Math.random(), these produce consistent, repeatable outputs` |
| `frontend/src/utils/deterministic.ts:10` | 注释 | `* Wave functions (sin/cos) are used instead of Math.random()` |
| `frontend/src/utils/fundFlowPageDemo.ts:43` | 注释 | `// ==================== 确定性随机（FNV-1a + LCG，禁用 Math.random） ====================` |

## 豁免台账（allowlist）

- version：1　updatedAt：2026-09-21
- 共 23 条；未命中 0 条。

### 按类别分组计数

| category | 条目数 |
|---|---:|
| `id-generation` | 8 |
| `stochastic-algorithm` | 3 |
| `behavioral-random` | 0 |
| `unwired-module` | 2 |
| `acknowledged-debt` | 10 |

### 明细

| 豁免ID | category | 路径 | match | 到期日期(expiresAt) | clearingTicket | 状态 |
|---|---|---|---|---|---|---|
| `AL-001` | `id-generation` | `backend/src/api/user.ts` | `user_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-002` | `id-generation` | `backend/src/api/user.ts` | `action_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-003` | `id-generation` | `backend/src/services/alertEngine.ts` | `alert_${now}_` | 2027-03-20 | — | 生效中 |
| `AL-004` | `id-generation` | `backend/src/services/logger.ts` | `req_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-005` | `id-generation` | `backend/src/services/notification/coordinator.ts` | `task_${channel}_` | 2027-03-20 | — | 生效中 |
| `AL-006` | `id-generation` | `backend/src/services/notification/emailTemplateEngine.ts` | `email_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-007` | `id-generation` | `backend/src/services/notification/service.ts` | `notif_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-008` | `id-generation` | `backend/src/services/notification/subscriptionManager.ts` | `rule_${Date.now()}_` | 2027-03-20 | — | 生效中 |
| `AL-009` | `stochastic-algorithm` | `backend/src/services/riskBudgetEngine.ts` | `const u1 = Math.random();` | 2027-03-20 | — | 生效中 |
| `AL-010` | `stochastic-algorithm` | `backend/src/services/riskBudgetEngine.ts` | `const u2 = Math.random();` | 2027-03-20 | — | 生效中 |
| `AL-011` | `stochastic-algorithm` | `backend/src/services/crossAssetCorrelationEngine.ts` | `Array(n).fill(0).map(() => Math.random())` | 2027-03-20 | — | 生效中 |
| `AL-012` | `unwired-module` | `backend/src/services/notification/emailTemplateEngine.ts` | `if (Math.random() > 0.1)` | 2027-03-20 | — | 生效中 |
| `AL-013` | `unwired-module` | `backend/src/services/notification/rateLimitEngine.ts` | `priority === 'low' && Math.random()` | 2027-03-20 | — | 生效中 |
| `AL-014` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `(Math.random() - 0.5) * 2 * volatility` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-015` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `const basePrice = 10 + Math.random() * 200` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-016` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `const high = Math.max(open, close)` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-017` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `const low = Math.min(open, close)` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-018` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `const volume = Math.floor(5000000` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-019` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `turnoverRate: Math.round(Math.random()` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-020` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `peRatio: Math.round((10 + Math.random()` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-021` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `pbRatio: Math.round((1 + Math.random()` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-022` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `marketCap: Math.floor(close * (1e8` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |
| `AL-023` | `acknowledged-debt` | `backend/src/db/InMemoryDatabase.ts` | `circulatingMarketCap: Math.floor(close * (5e7` | 2026-10-05 | R0'-1b 内存库降级暴露 | 生效中 |

## 规则 B 明细（backend/src/api/*.ts）

| 文件 | 路由数 N | dataSource 次数 M | 标记 |
|---|---:|---:|---|
| `backend/src/api/advanced-screener.ts` | 5 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/ai-analysis.ts` | 6 | 11 |  |
| `backend/src/api/ai-chat.ts` | 10 | 9 |  |
| `backend/src/api/ai-filter.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/ai-gems.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/ai-investment-note.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/ai-market-pulse.ts` | 1 | 3 |  |
| `backend/src/api/ai-stock-selection.ts` | 4 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/ai-strategy.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/alerts.ts` | 9 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/analytics.ts` | 5 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/api-docs.ts` | 0 | 0 |  |
| `backend/src/api/backtest-routes.ts` | 3 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/block-trades.ts` | 3 | 5 |  |
| `backend/src/api/breadth.ts` | 5 | 3 |  |
| `backend/src/api/daily-briefing.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/divergence.ts` | 4 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/etf.ts` | 4 | 9 |  |
| `backend/src/api/eventCalendar.ts` | 1 | 5 |  |
| `backend/src/api/factors.ts` | 1 | 2 |  |
| `backend/src/api/financials.ts` | 6 | 12 |  |
| `backend/src/api/fund-flow.ts` | 6 | 7 |  |
| `backend/src/api/health.ts` | 4 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/history.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/hkConnect.ts` | 2 | 7 |  |
| `backend/src/api/indicators.ts` | 6 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/industries.ts` | 6 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/industry-alerts.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/industryChain.ts` | 8 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/industryChainConcepts.ts` | 0 | 0 |  |
| `backend/src/api/industryChainFilters.ts` | 0 | 0 |  |
| `backend/src/api/lockup-shares.ts` | 3 | 7 |  |
| `backend/src/api/macro.ts` | 1 | 4 |  |
| `backend/src/api/margin.ts` | 4 | 10 |  |
| `backend/src/api/market.ts` | 2 | 7 |  |
| `backend/src/api/multi-signal.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/news.ts` | 5 | 12 |  |
| `backend/src/api/northBound.ts` | 1 | 2 |  |
| `backend/src/api/notifications.ts` | 11 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/performance.ts` | 7 | 3 |  |
| `backend/src/api/portfolio.ts` | 7 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/risk-center.ts` | 1 | 4 |  |
| `backend/src/api/screener.ts` | 7 | 2 |  |
| `backend/src/api/sector-analysis.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/sector-multidim-v2.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/sector-multidim-v3.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/sector-multidim.ts` | 1 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/sectors.ts` | 6 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/social.ts` | 10 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/stock-compare.ts` | 2 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/stock.ts` | 14 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/strategy-templates.ts` | 8 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/user.ts` | 7 | 0 | `CONTRACT-MISSING` |
| `backend/src/api/watchlist.ts` | 7 | 0 | `CONTRACT-MISSING` |

> 注意：规则 B 必有误报（纯鉴权 / 健康检查 / meta / docs 端点本就不供数），第一版**只列不判死**，供主理人建白名单。
> 已知覆盖边界：本规则仅统计 `router.(get|post|put|delete)(` 前缀，**不涵盖** `app.get` / `router.use` / `router.route` 等其它挂载写法（可能漏计）。

---

**门禁模式**：脚本默认非阻断（exit 0）；传 `--strict` 时，存在未豁免 RED 或过期豁免则 exit 1。
