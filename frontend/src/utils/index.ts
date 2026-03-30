/**
 * 统一导出入口 - Utils 模块
 */

export * from '../../shared/formatters';
export { chartThemeManager, LIGHT_THEME, DARK_THEME, getEChartsThemeOption, getKLineChartTheme, getMAColor } from './chartTheme';
export { sampleData, sampleLTTB, sampleUniform, sampleAdaptive, processInChunks, calculateVirtualRange, renderProfiler } from './chartPerformance';
export { initWebVitals, getMetrics, getPerformanceScore, getFormattedReport } from './webVitals';
export * from './accessibility';
export * from './reactOptimize';
export * from './offlineMode';
export * from './dataExport';
export * from './codeAudit';
export { calculateVirtualScroll, useBatchedUpdates, useThrottledRender, useStableObject, useStableArray, useLazyImage, RenderProfiler, chunkedRender, DataCache, globalDataCache } from './renderOptimize';
export { ErrorRecoveryManager, classifyError, defaultErrorManager } from './errorRecovery';
export { LoadingOrchestrator, FirstPaintTimer, FeedbackManager, defaultOrchestrator, defaultFeedback } from './loadingOrchestrator';
export * from './pageTransitions';
export { DataPrefetchManager, globalPrefetcher, RoutePrefetchMap, useHoverPrefetch, useViewportPrefetch, useIdlePrefetch } from './dataPrefetch';
export * from './uiPolish';
export * from './responsiveUtils';
export { getWorkerPool, terminateWorkerPool, workerSort, workerFilter, workerComputeIndicators, workerCorrelationMatrix, workerBacktest } from './workerManager';
export { preloadResource, prefetchRoute, preloadImages, LazyImage, LazyComponent, useInView } from './lazyLoader.tsx';
export { PerformanceBudgetChecker, DEFAULT_BUDGET, getBudgetChecker, setResourcePriority, prioritizeCriticalResources } from './performanceBudget';
export { IdleScheduler, getIdleScheduler, whenIdle, nextFrame, deferredBatch } from './idleScheduler';
