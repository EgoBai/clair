/**
 * 错误处理统一导出
 * 第17轮迭代优化：统一错误处理架构
 */

export { 
  UnifiedErrorBoundary,
  ChartErrorBoundary,
  FormErrorBoundary,
  TableErrorBoundary,
  SimpleErrorBoundary,
  type ErrorBoundaryProps 
} from '../UnifiedErrorBoundary';

// 重新导出工具函数
export * as errorBoundary from '../../../utils/errorBoundary';
export * as errorRecovery from '../../../utils/errorRecovery';

// 导出错误处理工具
export * from './errorUtils';