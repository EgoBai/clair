/**
 * 市场指数面板组件
 * 显示主要A股指数的实时行情
 */

import React, { useState, useEffect, useMemo } from 'react';

export interface IndexData {
  symbol: string;
  name: string;
  current: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

export interface MarketIndexPanelProps {
  indices?: IndexData[];
  onIndexClick?: (symbol: string) => void;
  refreshInterval?: number;
  showMiniChart?: boolean;
  className?: string;
}

const defaultIndices: IndexData[] = [
  {
    symbol: '000001.SH',
    name: '上证综指',
    current: 3050.25,
    change: 25.30,
    changePercent: 0.84,
    volume: 350000000000,
    turnover: 450000000000,
    high: 3065.80,
    low: 3020.15,
    open: 3025.00,
    prevClose: 3024.95,
  },
  {
    symbol: '399001.SZ',
    name: '深证成指',
    current: 9850.60,
    change: -45.20,
    changePercent: -0.46,
    volume: 480000000000,
    turnover: 520000000000,
    high: 9920.30,
    low: 9810.45,
    open: 9895.80,
    prevClose: 9895.80,
  },
  {
    symbol: '399006.SZ',
    name: '创业板指',
    current: 1920.15,
    change: 18.75,
    changePercent: 0.99,
    volume: 180000000000,
    turnover: 280000000000,
    high: 1935.20,
    low: 1895.30,
    open: 1901.40,
    prevClose: 1901.40,
  },
  {
    symbol: '000300.SH',
    name: '沪深300',
    current: 3580.45,
    change: 32.15,
    changePercent: 0.91,
    volume: 280000000000,
    turnover: 380000000000,
    high: 3595.80,
    low: 3545.20,
    open: 3548.30,
    prevClose: 3548.30,
  },
];

export const MarketIndexPanel: React.FC<MarketIndexPanelProps> = ({
  indices = defaultIndices,
  onIndexClick,
  refreshInterval = 5000,
  showMiniChart = false,
  className = '',
}) => {
  const [data, setData] = useState<IndexData[]>(indices);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    setData(indices);
    setLastUpdate(new Date());
  }, [indices]);

  useEffect(() => {
    if (refreshInterval <= 0) return;

    const timer = setInterval(() => {
      // 模拟数据更新
      setData(prev => prev.map(idx => ({
        ...idx,
        current: idx.current + (Math.random() - 0.5) * 2,
        change: idx.change + (Math.random() - 0.5) * 1,
      })));
      setLastUpdate(new Date());
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  const formatVolume = (volume: number): string => {
    if (volume >= 1e12) return `${(volume / 1e12).toFixed(2)}万亿`;
    if (volume >= 1e8) return `${(volume / 1e8).toFixed(2)}亿`;
    if (volume >= 1e4) return `${(volume / 1e4).toFixed(2)}万`;
    return volume.toFixed(0);
  };

  const formatPrice = (price: number): string => {
    return price.toFixed(2);
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-red-600';
    if (change < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getChangeBgColor = (change: number): string => {
    if (change > 0) return 'bg-red-50';
    if (change < 0) return 'bg-green-50';
    return 'bg-gray-50';
  };

  const marketSentiment = useMemo(() => {
    const rising = data.filter(d => d.changePercent > 0).length;
    const falling = data.filter(d => d.changePercent < 0).length;
    if (rising > falling) return '偏多';
    if (falling > rising) return '偏空';
    return '均衡';
  }, [data]);

  return (
    <div className={`market-index-panel ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">大盘指数</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs ${
            marketSentiment === '偏多' ? 'bg-red-100 text-red-600' :
            marketSentiment === '偏空' ? 'bg-green-100 text-green-600' :
            'bg-gray-100 text-gray-600'
          }`}>
            {marketSentiment}
          </span>
          <span className="text-xs text-gray-400">
            {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.map((index) => (
          <div
            key={index.symbol}
            onClick={() => onIndexClick?.(index.symbol)}
            className={`
              p-3 rounded-lg border cursor-pointer transition-all
              hover:shadow-md ${getChangeBgColor(index.change)}
            `}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-medium text-gray-700">
                {index.name}
              </span>
              <span className="text-xs text-gray-400">
                {index.symbol.split('.')[1]}
              </span>
            </div>

            <div className={`text-xl font-bold ${getChangeColor(index.change)}`}>
              {formatPrice(index.current)}
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className={`text-sm ${getChangeColor(index.change)}`}>
                {index.change >= 0 ? '+' : ''}{formatPrice(index.change)}
              </span>
              <span className={`
                px-2 py-0.5 rounded text-xs font-medium
                ${index.changePercent >= 0 ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}
              `}>
                {index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%
              </span>
            </div>

            {showMiniChart && (
              <div className="mt-2 h-8 bg-gray-100 rounded flex items-center justify-center">
                <span className="text-xs text-gray-400">📈</span>
              </div>
            )}

            <div className="mt-2 flex justify-between text-xs text-gray-400">
              <span>量: {formatVolume(index.volume)}</span>
              <span>额: {formatVolume(index.turnover)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketIndexPanel;
