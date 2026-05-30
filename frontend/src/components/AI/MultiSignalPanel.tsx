/**
 * 多信号融合面板
 * 显示股票的多维度信号分析结果 + AI叙事报告
 */

import React, { useState, useEffect } from 'react';

interface Signal {
  name: string;
  source: string;
  value: number | string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: 'short' | 'medium' | 'long';
  detail?: string;
}

interface MultiSignalData {
  symbol: string;
  signals: Signal[];
  summary: {
    bullish: number;
    bearish: number;
    neutral: number;
    overall: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  narrative: string;
  timestamp: string;
}

interface MultiSignalPanelProps {
  symbol: string;
}

const DIRECTION_COLORS = {
  bullish: 'text-green-500 bg-green-500/10',
  bearish: 'text-red-500 bg-red-500/10',
  neutral: 'text-yellow-500 bg-yellow-500/10',
};

const DIRECTION_LABELS = {
  bullish: '看多',
  bearish: '看空',
  neutral: '中性',
};

const TIMEFRAME_LABELS = {
  short: '短期',
  medium: '中期',
  long: '长期',
};

export default function MultiSignalPanel({ symbol }: MultiSignalPanelProps) {
  const [data, setData] = useState<MultiSignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNarrative, setShowNarrative] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    
    const fetchSignals = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/ai/multi-signal/${symbol}`);
        if (!res.ok) throw new Error('Failed to fetch signals');
        
        const result = await res.json();
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Unknown error');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSignals();
  }, [symbol]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-800 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-lg p-6">
        <div className="text-red-400">加载失败: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { signals, summary, narrative } = data;

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* 头部: 整体方向 */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">多信号分析</h3>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            summary.overall === 'bullish' ? 'bg-green-500/20 text-green-400' :
            summary.overall === 'bearish' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {DIRECTION_LABELS[summary.overall]} · 置信度 {(summary.confidence * 100).toFixed(0)}%
          </div>
        </div>
        
        {/* 信号统计条 */}
        <div className="mt-3 flex gap-2">
          <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${(summary.bullish / (summary.bullish + summary.bearish + summary.neutral)) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">
            {signals.filter(s => s.direction === 'bullish').length} 看多 · {signals.filter(s => s.direction === 'bearish').length} 看空
          </span>
        </div>
      </div>

      {/* 信号列表 */}
      <div className="p-4 space-y-3">
        {signals.map((signal, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
            {/* 方向指示器 */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
              DIRECTION_COLORS[signal.direction]
            }`}>
              {signal.direction === 'bullish' ? '↑' : signal.direction === 'bearish' ? '↓' : '→'}
            </div>
            
            {/* 信号信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{signal.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
                  {TIMEFRAME_LABELS[signal.timeframe]}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {signal.detail || signal.source}
              </div>
            </div>
            
            {/* 值和置信度 */}
            <div className="text-right">
              <div className="text-white font-mono">{signal.value}</div>
              <div className="text-xs text-gray-500">{(signal.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI叙事报告 */}
      <div className="border-t border-gray-800">
        <button
          onClick={() => setShowNarrative(!showNarrative)}
          className="w-full px-4 py-3 flex items-center justify-between text-gray-400 hover:text-white transition-colors"
        >
          <span className="text-sm font-medium">AI 分析报告</span>
          <span>{showNarrative ? '▼' : '▶'}</span>
        </button>
        
        {showNarrative && (
          <div className="px-4 pb-4">
            <div className="prose prose-invert prose-sm max-w-none">
              {narrative.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2">{line.slice(2)}</h2>;
                if (line.startsWith('## ')) return <h3 key={i} className="text-base font-semibold text-gray-200 mt-3 mb-1">{line.slice(3)}</h3>;
                if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-medium text-gray-300 mt-2 mb-1">{line.slice(4)}</h4>;
                if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-blue-500 pl-3 text-gray-300 italic my-2">{line.slice(2)}</blockquote>;
                if (line.startsWith('| ')) {
                  const cells = line.split('|').filter(Boolean).map(c => c.trim());
                  return (
                    <div key={i} className="flex gap-2 text-xs font-mono text-gray-400 my-1">
                      {cells.map((cell, j) => (
                        <span key={j} className="flex-1">{cell}</span>
                      ))}
                    </div>
                  );
                }
                if (line.startsWith('- ')) return <li key={i} className="text-gray-300 ml-4">{line.slice(2)}</li>;
                if (line.trim() === '') return <br key={i} />;
                return <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* 底部: 数据源和时间 */}
      <div className="px-4 py-2 bg-gray-800/30 text-xs text-gray-500 flex justify-between">
        <span>数据来源: {signals.map(s => s.source).join(', ')}</span>
        <span>{new Date(data.timestamp).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  );
}
