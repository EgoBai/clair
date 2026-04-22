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

const FlowBar: React.FC<{ inflow: number; outflow: number; max: number }> = ({ inflow, outflow, max }) => {
  const inWidth = max > 0 ? (inflow / max) * 100 : 0;
  const outWidth = max > 0 ? (outflow / max) * 100 : 0;
  return (
    <div className="flow-bar" style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1a1a2e' }}>
      <div style={{ width: `${inWidth}%`, background: '#e74c3c', transition: 'width 0.3s' }} />
      <div style={{ width: `${outWidth}%`, background: '#2ecc71', transition: 'width 0.3s' }} />
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

  const scoreColor = fundFlowScore != null
    ? fundFlowScore >= 70 ? '#e74c3c' : fundFlowScore >= 40 ? '#f39c12' : '#2ecc71'
    : '#666';

  return (
    <div className={`capital-flow-panel ${className || ''}`} data-testid="capital-flow-panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>💰 资金流向</h3>
        {fundFlowScore != null && (
          <div className="flow-score" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#888' }}>资金面评分</span>
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
              background: selectedTab === tab ? '#3498db' : '#2d2d44',
              color: '#fff',
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
            <div style={{ background: '#1a1a2e', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#888' }}>主力净流入</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: latest.netMainFlow >= 0 ? '#e74c3c' : '#2ecc71' }}>
                {latest.netMainFlow >= 0 ? '+' : ''}{formatAmount(latest.netMainFlow)}
              </div>
            </div>
            <div style={{ background: '#1a1a2e', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#888' }}>散户净流入</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#f39c12' }}>
                {formatAmount(latest.retailInflow - latest.retailOutflow)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>主力资金流入</div>
            <FlowBar inflow={latest.mainInflow} outflow={0} max={maxAmount} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>主力资金流出</div>
            <FlowBar inflow={0} outflow={latest.mainOutflow} max={maxAmount} />
          </div>

          <div style={{ background: '#1a1a2e', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>累计主力净流入</div>
            <div style={{ fontSize: 16, color: netMainTotal >= 0 ? '#e74c3c' : '#2ecc71' }}>
              {netMainTotal >= 0 ? '+' : ''}{formatAmount(netMainTotal)}
            </div>
          </div>
        </div>
      )}

      {selectedTab === 'sectors' && (
        <div className="sectors" data-testid="flow-sectors">
          {sectorFlows.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>暂无板块数据</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectorFlows.map((s, i) => (
                <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#1a1a2e', borderRadius: 8 }}>
                  <span style={{ width: 20, textAlign: 'center', color: '#888', fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{s.sector}</span>
                  <TrendIcon trend={s.flowTrend} />
                  <span style={{ color: s.netFlow >= 0 ? '#e74c3c' : '#2ecc71', fontWeight: 'bold', minWidth: 80, textAlign: 'right' }}>
                    {s.netFlow >= 0 ? '+' : ''}{formatAmount(s.netFlow)}
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
