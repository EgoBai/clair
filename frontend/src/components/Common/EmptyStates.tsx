/**
 * 空状态组件 — 向后兼容 re-export
 * 所有实现已统一到 StateComponents.tsx
 */

export {
  EmptyState,
  EmptySearch,
  EmptyStocks,
  EmptyWatchlist,
  EmptyAlerts,
  EmptyScreener,
  EmptyChart,
  EmptyKLine,
  EmptyHistory,
  EmptyBacktest,
  EmptyPortfolio,
  EmptyNews,
  EmptyScreenerResult,
  EmptySocial,
  LoadingStateDetail as LoadingState,
  DisconnectedState,
  PermissionDeniedState,
} from './StateComponents';

export { ErrorStateDetail as ErrorState } from './StateComponents';
