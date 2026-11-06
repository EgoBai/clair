import React, { useState, useMemo } from 'react';

interface FlowData {
  timestamp: number;
  mainInflow: number;
  mainOutflow: number;
  retailInflow: number;
  retailOutflow: number;
  netMainFlow: number;
}

interface SectorFlow {
  sector: string;
  netFlow: number;
  flowTrend: 'accelerating' | 'steady' | 'decelerating';
}

interface CapitalFlowPanelProps {
  flowData?: FlowData[];
  sectorFlows?: SectorFlow[];
  fundFlowScore?: number;
  className?: string;
}

const formatAmount = (value: number): string => {
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return value.toFixed(0);
};

/** 涨跌/资金流语义统一走设计令牌：红=流入，绿=流出，0 走中性色 */
const flowColor = (value: number): string =>
  value > 0 ? 'var(--color-up)' : value < 0 ? 'var(--color-down)' : 'var(--text-secondary)';

const FlowBar: React.FC<{ inflow: number; outflow: number; max: number }> = ({ inflow, outflow, max }) => {
  const inWidth = max > 0 ? (inflow / max) * 100 : 0;
  const outWidth = max > 0 ? (outflow / max) * 100 : 0;
  return (
    <div className="flow-bar" style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
      <div style={{ width: `${inWidth}%`, background: 'var(--color-up)', transition: 'width 0.3s' }} />
      <div style={{ width: `${outWidth}%`, background: 'var(--color-down)', transition: 'width 0.3s' }} />
    </div>
  );
};

const TrendIcon: React.FC<{ trend: string }> = ({ trend }) => {
  const icons: Record<string, string> = { accelerating: '📈', steady: '➡️', decelerating: '📉' };
  return <span role="img" aria-label={trend}>{icons[trend] || '❓'}</span>;
};

export const CapitalFlowPanel: React.FC<CapitalFlowPanelProps> = ({
  flowData = [],
  sectorFlows = [],
  fundFlowScore,
  className,
}) => {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'sectors'>('overview');

  const latest = flowData.length > 0 ? flowData[flowData.length - 1] : null;
  const maxAmount = useMemo(() => {
    return Math.max(...flowData.map(d => Math.max(d.mainInflow, d.mainOutflow, d.retailInflow, d.retailOutflow)), 1);
  }, [flowData]);

  const netMainTotal = useMemo(() => flowData.reduce((s, d) => s + d.netMainFlow, 0), [flowData]);
  const retailNetFlow = latest ? latest.retailInflow - latest.retailOutflow : 0;

  const scoreColor = fundFlowScore != null
    ? fundFlowScore >= 70 ? 'var(--color-up)' : fundFlowScore >= 40 ? 'var(--color-warning)' : 'var(--color-down)'
    : 'var(--text-secondary)';

  return (
    <div className={['capital-flow-panel', className].filter(Boolean).join(' ')} data-testid="capital-flow-panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>💰 资金流向</h3>
        {fundFlowScore != null && (
          <div className="flow-score" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>资金面评分</span>
            <span style={{ fontSize: 24, fontWeight: 'bold', color: scoreColor }}>{fundFlowScore}</span>
          </div>
        )}
      </div>

      <div className="tab-bar" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['overview', 'sectors'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            style={{
              padding: '6px 16px',
              borderRadius: 16,
              border: 'none',
              background: selectedTab === tab ? 'var(--accent-solid)' : 'var(--bg-tertiary)',
              color: selectedTab === tab ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {tab === 'overview' ? '资金总览' : '板块流向'}
          </button>
        ))}
      </div>

      {selectedTab === 'overview' && latest && (
        <div className="overview" data-testid="flow-overview">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>主力净流入</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: flowColor(latest.netMainFlow) }}>
                {latest.netMainFlow > 0 ? '+' : ''}{formatAmount(latest.netMainFlow)}
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>散户净流入</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: flowColor(retailNetFlow) }}>
                {retailNetFlow > 0 ? '+' : ''}{formatAmount(retailNetFlow)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>主力净额方向（红=净流入 / 绿=净流出，按净额绝对值渲染，东财无买卖拆分口径）</div>
            <FlowBar inflow={latest.mainInflow} outflow={latest.mainOutflow} max={maxAmount} />
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>累计主力净流入</div>
            <div style={{ fontSize: 16, color: flowColor(netMainTotal) }}>
              {netMainTotal > 0 ? '+' : ''}{formatAmount(netMainTotal)}
            </div>
          </div>
        </div>
      )}

      {selectedTab === 'sectors' && (
        <div className="sectors" data-testid="flow-sectors">
          {sectorFlows.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 20 }}>暂无板块数据</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectorFlows.map((s, i) => (
                <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <span style={{ width: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary)' }}>{s.sector}</span>
                  <TrendIcon trend={s.flowTrend} />
                  <span style={{ color: flowColor(s.netFlow), fontWeight: 'bold', minWidth: 80, textAlign: 'right' }}>
                    {s.netFlow > 0 ? '+' : ''}{formatAmount(s.netFlow)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CapitalFlowPanel;
