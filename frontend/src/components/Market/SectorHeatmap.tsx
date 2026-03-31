/**
 * 板块热力图组件
 * 可视化展示行业/概念板块涨跌情况
 */

import React, { useState, useMemo } from 'react';

export interface SectorData {
  id: number;
  name: string;
  changePercent: number;
  turnover: number;
  netInflow: number;
  stockCount: number;
  risingRatio: number;
  leadingStock?: {
    symbol: string;
    name: string;
    changePercent: number;
  };
}

export interface SectorHeatmapProps {
  sectors?: SectorData[];
  type?: 'industry' | 'concept';
  onSectorClick?: (sectorId: number) => void;
  showDetails?: boolean;
  className?: string;
}

const defaultSectors: SectorData[] = [
  { id: 1, name: '人工智能', changePercent: 3.25, turnover: 85000000000, netInflow: 12000000000, stockCount: 120, risingRatio: 0.75 },
  { id: 2, name: '半导体', changePercent: 2.18, turnover: 72000000000, netInflow: 8000000000, stockCount: 85, risingRatio: 0.68 },
  { id: 3, name: '新能源汽车', changePercent: 1.85, turnover: 65000000000, netInflow: 5000000000, stockCount: 95, risingRatio: 0.62 },
  { id: 4, name: '银行', changePercent: -0.52, turnover: 45000000000, netInflow: -2000000000, stockCount: 42, risingRatio: 0.35 },
  { id: 5, name: '医药生物', changePercent: 0.95, turnover: 58000000000, netInflow: 3000000000, stockCount: 280, risingRatio: 0.55 },
  { id: 6, name: '食品饮料', changePercent: -1.25, turnover: 38000000000, netInflow: -4500000000, stockCount: 120, risingRatio: 0.32 },
  { id: 7, name: '电子', changePercent: 2.45, turnover: 92000000000, netInflow: 15000000000, stockCount: 350, risingRatio: 0.72 },
  { id: 8, name: '计算机', changePercent: 1.65, turnover: 68000000000, netInflow: 6000000000, stockCount: 220, risingRatio: 0.60 },
];

export const SectorHeatmap: React.FC<SectorHeatmapProps> = ({
  sectors = defaultSectors,
  type = 'industry',
  onSectorClick,
  showDetails = false,
  className = '',
}) => {
  const [sortBy, setSortBy] = useState<'change' | 'turnover' | 'inflow'>('change');
  const [hoveredSector, setHoveredSector] = useState<number | null>(null);

  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => {
      switch (sortBy) {
        case 'change':
          return b.changePercent - a.changePercent;
        case 'turnover':
          return b.turnover - a.turnover;
        case 'inflow':
          return b.netInflow - a.netInflow;
        default:
          return 0;
      }
    });
  }, [sectors, sortBy]);

  const maxAbsChange = useMemo(() => {
    return Math.max(...sectors.map(s => Math.abs(s.changePercent)), 1);
  }, [sectors]);

  const getColor = (changePercent: number): string => {
    const intensity = Math.min(Math.abs(changePercent) / maxAbsChange, 1);
    if (changePercent > 0) {
      const r = Math.round(255 - intensity * 100);
      const g = Math.round(255 - intensity * 200);
      const b = Math.round(255 - intensity * 200);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (changePercent < 0) {
      const r = Math.round(255 - intensity * 200);
      const g = Math.round(255 - intensity * 50);
      const b = Math.round(255 - intensity * 200);
      return `rgb(${r}, ${g}, ${b})`;
    }
    return 'rgb(245, 245, 245)';
  };

  const getTextColor = (changePercent: number): string => {
    if (Math.abs(changePercent) > maxAbsChange * 0.5) {
      return 'text-white';
    }
    return changePercent >= 0 ? 'text-red-700' : 'text-green-700';
  };

  const formatTurnover = (turnover: number): string => {
    if (turnover >= 1e12) return `${(turnover / 1e12).toFixed(1)}万亿`;
    if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(1)}亿`;
    return `${(turnover / 1e4).toFixed(1)}万`;
  };

  const formatInflow = (inflow: number): string => {
    const abs = Math.abs(inflow);
    const sign = inflow >= 0 ? '+' : '-';
    if (abs >= 1e10) return `${sign}${(abs / 1e10).toFixed(1)}亿`;
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}亿`;
    return `${sign}${(abs / 1e4).toFixed(1)}万`;
  };

  return (
    <div className={`sector-heatmap ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">
          {type === 'industry' ? '行业板块' : '概念板块'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy('change')}
            className={`px-3 py-1 text-xs rounded ${
              sortBy === 'change' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            涨跌幅
          </button>
          <button
            onClick={() => setSortBy('turnover')}
            className={`px-3 py-1 text-xs rounded ${
              sortBy === 'turnover' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            成交额
          </button>
          <button
            onClick={() => setSortBy('inflow')}
            className={`px-3 py-1 text-xs rounded ${
              sortBy === 'inflow' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            资金流向
          </button>
        </div>
      </div>

      {/* 热力图网格 */}
      <div className="grid grid-cols-4 lg:grid-cols-6 gap-1">
        {sortedSectors.map((sector) => (
          <div
            key={sector.id}
            onClick={() => onSectorClick?.(sector.id)}
            onMouseEnter={() => setHoveredSector(sector.id)}
            onMouseLeave={() => setHoveredSector(null)}
            className={`
              relative p-2 rounded cursor-pointer transition-all
              ${hoveredSector === sector.id ? 'ring-2 ring-blue-400 z-10' : ''}
            `}
            style={{
              backgroundColor: getColor(sector.changePercent),
              minHeight: showDetails ? '80px' : '60px',
            }}
          >
            <div className={`text-xs font-medium truncate ${getTextColor(sector.changePercent)}`}>
              {sector.name}
            </div>
            <div className={`text-sm font-bold ${getTextColor(sector.changePercent)}`}>
              {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
            </div>

            {showDetails && (
              <div className={`mt-1 text-xs ${getTextColor(sector.changePercent)} opacity-80`}>
                <div>成交: {formatTurnover(sector.turnover)}</div>
                <div>资金: {formatInflow(sector.netInflow)}</div>
              </div>
            )}

            {/* 悬浮提示 */}
            {hoveredSector === sector.id && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                            bg-gray-900 text-white text-xs rounded p-2 whitespace-nowrap z-20">
                <div className="font-medium">{sector.name}</div>
                <div>涨跌: {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%</div>
                <div>上涨比例: {(sector.risingRatio * 100).toFixed(0)}%</div>
                <div>成交额: {formatTurnover(sector.turnover)}</div>
                <div>净流入: {formatInflow(sector.netInflow)}</div>
                <div>股票数: {sector.stockCount}</div>
                {sector.leadingStock && (
                  <div>领涨: {sector.leadingStock.name} ({sector.leadingStock.changePercent >= 0 ? '+' : ''}{sector.leadingStock.changePercent.toFixed(2)}%)</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 涨跌统计 */}
      <div className="mt-4 flex justify-between text-sm text-gray-500">
        <span>上涨: {sectors.filter(s => s.changePercent > 0).length}</span>
        <span>平盘: {sectors.filter(s => s.changePercent === 0).length}</span>
        <span>下跌: {sectors.filter(s => s.changePercent < 0).length}</span>
      </div>
    </div>
  );
};

export default SectorHeatmap;
