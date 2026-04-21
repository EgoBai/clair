/**
 * 统一导出入口 - Common 模块
 */

export { default as ErrorBoundary } from './ErrorBoundary';
export { default as EnhancedErrorBoundary, withErrorBoundary, getErrorReports, clearErrorReports } from './EnhancedErrorBoundary';
export { default as ThemeProvider } from './ThemeProvider';
export { default as Onboarding, resetOnboarding, shouldShowOnboarding } from './Onboarding';
export { default as LanguageSwitcher } from './LanguageSwitcher';
export * from './EmptyStates';
export * from './Skeletons';

// 虚拟列表（懒加载导出）
export { default as VirtualList } from './VirtualList';

// 新增组件
export { ScrollReveal, StaggerList } from './ScrollReveal';
export { CollapsibleSection } from './CollapsibleSection';
export { MicroFeedback, SuccessCheck, ErrorShake, LoadingDots, NumberFlip } from './MicroFeedback';
export { FocusRing, KeyboardHint } from './FocusRing';
export * from './MotionTokens';

// 图表错误边界
export { default as ChartErrorBoundary } from './ChartErrorBoundary';
export { default as WebVitalsWidget } from './WebVitalsWidget';
export { default as LazyPage } from './LazyPage';
export { default as SearchHighlight } from './SearchHighlight';
export { default as GlobalSearch } from './GlobalSearch';
export { default as ExportButton } from './ExportButton';
