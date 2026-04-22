/**
 * 优化后的React组件
 * 使用React.memo和useMemo进行性能优化
 */

import React, { useMemo } from 'react';
import {
  formatNumber,
  formatMarketCap,
  formatVolume,
  formatTurnover
} from './formatters';
import { MarketSummaryCamel, StockWithQuoteCamel } from '../types/api';

/**
 * 骨架屏组件 - 使用React.memo优化
 */
export const Skeleton = React.memo<{ width?: string; height?: string }>(({ 
  width = '100%', 
  height = '20px' 
}) => (
  <div className="skeleton" style={{ width, height }} />
));

/**
 * 市场概况卡片 - 使用React.memo和useMemo优化
 */
export const MarketSummaryCard = React.memo<{ summary: MarketSummaryCamel }>(({ summary }) => {
  const upRatio = useMemo(() => {
    return summary.totalStocks > 0 
      ? ((summary.risingStocks / summary.totalStocks) * 100).toFixed(1) 
      : '0';
  }, [summary.totalStocks, summary.risingStocks]);
  
  const summaryCards = useMemo(() => [
    { label: '总股票数', value: formatNumber(summary.totalStocks, 0), className: '' },
    { label: '总市值', value: formatMarketCap(summary.totalMarketCap), className: '' },
    { label: '上涨', value: summary.risingStocks.toString(), className: 'positive' },
    { label: '下跌', value: summary.fallingStocks.toString(), className: 'negative' },
    { label: '上涨占比', value: `${upRatio}%`, className: '' },
    { label: '总成交额', value: formatTurnover(summary.totalTurnover), className: '' },
  ], [summary, upRatio]);
  
  return (
    <section className="market-summary">
      <h2>📊 市场概况</h2>
      <div className="summary-grid">
        {summaryCards.map((card, index) => (
          <div key={index} className="summary-card">
            <div className="summary-label">{card.label}</div>
            <div className={`summary-value ${card.className}`}>{card.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
});

/**
 * 股票卡片 - 使用React.memo和useMemo优化
 */
export const StockCard = React.memo<{
  stock: StockWithQuoteCamel;
  isSelected: boolean;
  onClick: () => void;
}>(({ stock, isSelected, onClick }) => {
  const formattedPrice = useMemo(() => 
    stock.latestQuote ? `¥${formatNumber(stock.latestQuote.closePrice)}` : '暂无行情数据',
    [stock.latestQuote]
  );
  
  const formattedChange = useMemo(() => {
    if (!stock.latestQuote) return '';
    const change = stock.latestQuote.changePercent;
    return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  }, [stock.latestQuote]);
  
  const formattedVolume = useMemo(() => 
    stock.latestQuote ? `成交量: ${formatVolume(stock.latestQuote.volume)}` : '',
    [stock.latestQuote]
  );
  
  const changeClass = useMemo(() => {
    if (!stock.latestQuote) return '';
    return stock.latestQuote.changePercent >= 0 ? 'positive' : 'negative';
  }, [stock.latestQuote]);
  
  return (
    <div
      className={`stock-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="stock-header">
        <span className="stock-symbol">{stock.symbol}</span>
        <span className="stock-name">{stock.name}</span>
      </div>
      {stock.latestQuote ? (
        <div className="stock-quote">
          <div className="price">
            <span className="current-price">
              {formattedPrice}
            </span>
            <span className={`change ${changeClass}`}>
              {formattedChange}
            </span>
          </div>
          <div className="volume">
            <span>{formattedVolume}</span>
          </div>
        </div>
      ) : (
        <div className="stock-quote">
          <div className="price">{formattedPrice}</div>
        </div>
      )}
    </div>
  );
});

/**
 * 加载状态组件
 */
export const LoadingState = React.memo(() => (
  <div className="loading-state">
    <div className="loading-spinner"></div>
    <p>加载中...</p>
  </div>
));

/**
 * 错误状态组件
 */
export const ErrorState = React.memo<{ message: string; onRetry?: () => void }>(({ message, onRetry }) => (
  <div className="error-state">
    <div className="error-icon">❌</div>
    <p className="error-message">{message}</p>
    {onRetry && (
      <button className="retry-button" onClick={onRetry}>
        重试
      </button>
    )}
  </div>
));

/**
 * 空状态组件
 */
export const EmptyState = React.memo<{ message: string }>(({ message }) => (
  <div className="empty-state">
    <div className="empty-icon">📭</div>
    <p className="empty-message">{message}</p>
  </div>
));