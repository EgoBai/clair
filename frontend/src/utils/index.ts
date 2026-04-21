/**
 * 工具库统一导出
 * 集中管理所有工具函数，方便导入和使用
 */

// 格式化工具
export * from './formatters';

// 性能优化工具
export * from './performanceOptimizer';

// 优化组件
export * from './optimizedComponents';

// 错误处理
export * from './errorBoundary';

// 其他工具函数
export { debounce, throttle } from './debounceThrottle';

// 缓存引擎
export * from './cacheEngine';

// 验证工具
export * from './validation';

// 时间序列引擎
export * from './timeSeriesEngine';

// 风险管理系统
export * from './riskManagementEngine';

// 市场广度引擎
export * from './marketBreadthEngine';

// 技术分析引擎
export * from './technicalCompositeEngine';

// 因子挖掘引擎
export * from './factorMiningEngine';

// 情绪分析引擎
export * from './sentimentAnalysisEngine';

// 趋势跟踪引擎
export * from './trendFollowingEngine';

// 波动率曲面引擎
export * from './volSurfaceEngine';

// 希腊字母引擎
export * from './greeksEngine';

// 板块轮动引擎 (commented out - exports conflict with multiple rotation engines)
// export * from './sectorRotationTimingEngine';

// 业绩归因引擎
export * from './performanceAttributionEngine';

// 内幕交易集群引擎
export * from './insiderClusterEngine';

// 日历异常引擎
export * from './calendarAnomalyEngine';

// 仓位管理引擎
export * from './positionSizingEngine';

// 做空兴趣引擎
export * from './shortInterestEngine';

// 行业轮动预测引擎
export * from './industryRotationPredictEngine';

// 行业景气度引擎
export * from './industryProsperityEngine';

// 流动性评分引擎
export * from './liquidityScoreEngine';

// 风险场景引擎
export * from './riskScenarioEngine';

// 股票比较引擎
export * from './stockComparisonEngine';

// 艾略特波浪引擎
export * from './elliottWaveEngine';

// 可转债引擎
export * from './convertibleBondEngine';

// 数据质量引擎
export * from './dataQualityEngine';

// 数据预取引擎
// export * from './dataPrefetchEngine'; // module not found

// 动画引擎
// export * from './animationEngine'; // module not found

// PWA相关工具
export * from './pwaManifest';
// export * from './sw'; // module not found, sw.ts is service worker

// 国际化引擎
// export * from './i18nEngine'; // module not found

// 性能监控
export * from './performanceMonitorEnhanced';

// 策略分享 (commented out - calculatePortfolioRisk conflicts with riskManagementEngine)
// export * from './strategyShare';

// 工作管理器
export * from './workerManager';

// 相对价值引擎
export * from './relativeValueEngine';

// 财报电话情绪引擎
export * from './earningsCallSentimentEngine';

// 数据转换工具 (commented out - exports formatChange/formatVolume etc conflict with formatters)
// export * from './dataTransformUtils';

// 代码审计工具
export * from './codeAudit';

// PWA离线模式 (disabled - module has many type issues)
// export * from './offlineMode';

// React优化工具 (explicit exports to avoid conflicts with renderOptimize/performanceOptimizer)
export { useBatchedUpdates as useBatchedUpdatesOptimized } from './reactOptimize';
export { useLazyImage as useLazyImageOptimized } from './reactOptimize';

// 动态本地化加载器
export * from './dynamicLocaleLoader';

// 事件驱动引擎
export * from './eventDrivenEngine';

// 基金持仓引擎
export * from './fundHoldingsEngine';

// 指标叠加引擎
export * from './indicatorOverlayEngine';

// 向前走引擎
export * from './walkForwardEngine';

// 请求工具
export * from './requestUtils';

// 情绪聚合引擎 (commented out - SentimentScore conflicts with sentimentAnalysisEngine)
// export * from './sentimentAggregationEngine';

// 可访问性工具
export * from './accessibility';

// 懒加载器
export * from './lazyLoader';

// 数据预取
export * from './dataPrefetch';

// 渲染优化 (explicit exports to avoid conflicts with reactOptimize/performanceOptimizer)
export { useBatchedUpdates as useBatchedUpdatesRender } from './renderOptimize';
export { useLazyImage as useLazyImageRender } from './renderOptimize';

// 图表工具提示格式化
export * from './chartTooltipFormatter';

// 增强格式化器 (only re-export names that actually exist in enhancedFormatters)
export {
  formatRelativeTime as formatRelativeTimeEnhanced,
  formatDate as formatDateEnhanced,
  formatDateTime as formatDateTimeEnhanced,
  getChangeColor as getChangeColorEnhanced,
  formatLargeNumber as formatLargeNumberEnhanced,
} from './enhancedFormatters';

/**
 * 工具库版本信息
 */
export const UTILS_VERSION = '1.0.0';

/**
 * 初始化工具库
 */
export function initializeUtils(): void {
  console.log(`📦 工具库 v${UTILS_VERSION} 已初始化`);
  
  // 这里可以添加工具库的初始化逻辑
  if (typeof window !== 'undefined') {
    // 浏览器环境初始化
    console.log('🌐 运行在浏览器环境');
  }
  
  // 检查性能API支持
  if ('performance' in window) {
    console.log('⚡ 性能API可用');
  }
  
  // 检查内存API支持
  if ('memory' in performance) {
    console.log('💾 内存API可用');
  }
}

/**
 * 工具库配置
 */
export interface UtilsConfig {
  enablePerformanceMonitoring: boolean;
  enableErrorReporting: boolean;
  enableCaching: boolean;
  cacheTTL: number;
}

/**
 * 默认配置
 */
export const defaultUtilsConfig: UtilsConfig = {
  enablePerformanceMonitoring: true,
  enableErrorReporting: true,
  enableCaching: true,
  cacheTTL: 5 * 60 * 1000, // 5分钟
};

/**
 * 配置工具库
 */
export function configureUtils(config: Partial<UtilsConfig>): void {
  const mergedConfig = { ...defaultUtilsConfig, ...config };
  console.log('🔧 工具库配置已更新:', mergedConfig);
  
  // 这里可以根据配置启用/禁用特定功能
  if (!mergedConfig.enablePerformanceMonitoring) {
    console.log('⚠️  性能监控已禁用');
  }
  
  if (!mergedConfig.enableErrorReporting) {
    console.log('⚠️  错误报告已禁用');
  }
  
  if (!mergedConfig.enableCaching) {
    console.log('⚠️  缓存已禁用');
  }
}