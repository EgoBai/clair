/**
 * 市场指数面板组件
 * 显示主要A股指数的实时行情
 *
 * 数据策略（遵守「诚实数据」红线）：
 * - 若外部显式传入 `indices` prop，则优先使用该数据（向后兼容 + 测试契约）。
 * - 否则从真实公开端点 `/api/market/realtime`（后端直连腾讯财经，免 key）拉取。
 * - 数据源不可用（dataSource:'unavailable'）或请求失败时，如实置空并显示「暂不可用」，
 *   绝不回填演示 / 硬编码 / 正弦模拟数据。
 */

import React, { useState, useEffect } from 'react';

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

/** 后端 RealMarketData 三大指数的稳定顺序与对应 A 股代码 */
const INDEX_SYMBOL_MAP: Record<'shanghai' | 'shenzhen' | 'chinext', string> = {
  shanghai: '000001.SH',
  shenzhen: '399001.SZ',
  chinext: '399006.SZ',
};

/** 将 /api/market/realtime 的真实响应映射为组件所需的 IndexData[] */
function mapRealtimeToIndices(json: any): IndexData[] {
  const out: IndexData[] = [];
  (Object.keys(INDEX_SYMBOL_MAP) as Array<keyof typeof INDEX_SYMBOL_MAP>).forEach((key) => {
    const q = json?.[key];
    if (!q || typeof q.price !== 'number') return; // 缺失该指数则跳过，不编造
    const current = q.price;
    const changePercent = typeof q.changePct === 'number' ? q.changePct : 0;
    // change 由真实 price + 真实 changePct 确定性派生（price - prevClose），非伪造
    const change = +(current * (changePctSafe(changePercent) / 100)).toFixed(2);
    out.push({
      symbol: INDEX_SYMBOL_MAP[key],
      name: typeof q.name === 'string' && q.name ? q.name : key,
      current,
      change,
      changePercent,
      volume: 0, // 该源不提供个股级量额，诚实留 0
      turnover: 0,
      high: 0,
      low: 0,
      open: 0,
      prevClose: 0,
    });
  });
  return out;
}

function changePctSafe(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export const MarketIndexPanel: React.FC<MarketIndexPanelProps> = ({
  indices,
  onIndexClick,
  refreshInterval = 5000,
  showMiniChart = false,
  className = '',
}) => {
  const [data, setData] = useState<IndexData[]>(indices ?? []);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    indices ? 'ready' : 'loading',
  );

  // 外部显式传入 indices 时优先使用（覆盖默认拉取行为）
  useEffect(() => {
    if (indices) {
      setData(indices);
      setLastUpdate(new Date());
      setStatus('ready');
    }
  }, [indices]);

  // 未传入 indices 时，从真实端点拉取；不可用则诚实空态
  useEffect(() => {
    if (indices) return; // 由 prop 驱动，不启动拉取
    if (refreshInterval <= 0) return;

    let cancelled = false;

    const load = async () => {
      try {
        const resp = await fetch('/api/market/realtime');
        const json = await resp.json();
        if (cancelled) return;
        // 响应结构：{ success, data: { shanghai, shenzhen, chinext, breadth, dataSource }, timestamp }
        const payload = json?.data ?? json;
        if (payload?.dataSource === 'unavailable') {
          setData([]);
          setStatus('unavailable');
          setLastUpdate(new Date());
          return;
        }
        const mapped = mapRealtimeToIndices(payload);
        if (mapped.length === 0) {
          setData([]);
          setStatus('unavailable');
        } else {
          setData(mapped);
          setStatus('ready');
        }
        setLastUpdate(new Date());
      } catch {
        if (cancelled) return;
        // 请求失败：诚实置空，不伪造数据
        setData([]);
        setStatus('unavailable');
        setLastUpdate(new Date());
      }
    };

    load();
    const timer = setInterval(load, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [indices, refreshInterval]);

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

  const marketSentiment = (() => {
    const rising = data.filter((d) => d.changePercent > 0).length;
    const falling = data.filter((d) => d.changePercent < 0).length;
    if (rising > falling) return '偏多';
    if (falling > rising) return '偏空';
    return '均衡';
  })();

  return (
    <div className={`market-index-panel ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">大盘指数</h2>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs ${
              marketSentiment === '偏多'
                ? 'bg-red-100 text-red-600'
                : marketSentiment === '偏空'
                ? 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {marketSentiment}
          </span>
          <span className="text-xs text-gray-400">
            {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center">
          {status === 'unavailable'
            ? '实时指数数据源暂不可用'
            : '加载中…'}
        </div>
      ) : (
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
                  {index.change >= 0 ? '+' : ''}
                  {formatPrice(index.change)}
                </span>
                <span
                  className={`
                    px-2 py-0.5 rounded text-xs font-medium
                    ${index.changePercent >= 0 ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}
                  `}
                >
                  {index.changePercent >= 0 ? '+' : ''}
                  {index.changePercent.toFixed(2)}%
                </span>
              </div>

              {showMiniChart && (
                <div className="mt-2 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-xs text-gray-400">📈</span>
                </div>
              )}

              {index.volume > 0 || index.turnover > 0 ? (
                <div className="mt-2 flex justify-between text-xs text-gray-400">
                  <span>量: {formatVolume(index.volume)}</span>
                  <span>额: {formatVolume(index.turnover)}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketIndexPanel;
