/**
 * 首页 v3 — 暗色仪表盘
 * 市场概览：指数行情 + AI 解读 + 热门板块 + 涨跌分布
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spin, Tag } from 'antd';
import { CompassOutlined } from '@ant-design/icons';

const BG = '#0f172a';
const CARD_BG = '#1e293b';
const BORDER = '#334155';
const TEXT = '#f1f5f9';
const TEXT_SEC = '#94a3b8';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const ACCENT = '#3b82f6';
const GOLD = '#f59e0b';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [indices, setIndices] = useState<any[]>([]);
  const [insight, setInsight] = useState<any>(null);
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [iRes, aiRes, sRes] = await Promise.all([
        fetch('/api/market/indices').then(r => r.json()).catch(() => ({ data: { indices: [] } })),
        fetch('/api/ai/market-insight').then(r => r.json()).catch(() => null),
        fetch('/api/sectors/momentum').then(r => r.json()).catch(() => ({ data: { sectors: [] } })),
      ]);
      setIndices(iRes.data?.indices || []);
      if (aiRes?.data) setInsight(aiRes.data);
      setSectors((sRes.data?.sectors || []).slice(0, 5));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;

  const upCount = indices.filter(i => i.changePercent > 0).length;
  const topSectors = sectors.slice(0, 3);

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <CompassOutlined style={{ fontSize: 22, color: ACCENT }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>市场概览</span>
          {insight && (
            <Tag color={insight.mood === '强势上攻' ? 'red' : 'blue'} style={{ margin: 0 }}>
              {insight.moodEmoji} {insight.mood}
            </Tag>
          )}
        </div>

        {/* 指数卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 20 }}>
          {indices.slice(0, 9).map(idx => {
            const up = idx.changePercent >= 0;
            return (
              <div key={idx.symbol} onClick={() => navigate(`/stocks/${idx.symbol}`)}
                style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px', cursor: 'pointer', transition: 'border-color .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 4 }}>{idx.name}</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: TEXT, marginBottom: 2 }}>
                  {idx.closePrice?.toLocaleString()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: up ? COLOR_UP : COLOR_DOWN }}>
                  {up ? '+' : ''}{idx.changePercent?.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* 两栏布局 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          
          {/* AI 解读 */}
          {insight?.sections && (
            <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 12 }}>
                {insight.moodEmoji} AI 市场解读 · {insight.mood}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insight.sections.slice(0, 2).map((sec: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: TEXT_SEC, lineHeight: 1.6 }}>
                    <span style={{ color: ACCENT, fontWeight: 600 }}>{sec.icon} {sec.title}</span>
                    <div style={{ marginTop: 2 }}>
                      {sec.text.split('\n').filter((l: string) => l.trim() && !l.startsWith('**')).slice(0, 4).map((line: string, j: number) => (
                        <div key={j}>{line.trim()}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div onClick={() => navigate('/discover')} style={{ marginTop: 10, fontSize: 11, color: ACCENT, cursor: 'pointer' }}>
                查看完整分析 →
              </div>
            </div>
          )}

          {/* 右侧：市场宽度 + 热门板块 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 市场宽度 */}
            <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: TEXT_SEC, marginBottom: 8 }}>市场宽度</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: COLOR_UP, fontWeight: 600 }}>{upCount} ↑</span>
                <span style={{ color: COLOR_DOWN, fontWeight: 600 }}>{indices.length - upCount} ↓</span>
                <span style={{ color: TEXT }}>{Math.round(upCount / indices.length * 100)}%</span>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(upCount / indices.length * 100)}%`, background: COLOR_UP }} />
                <div style={{ width: `${((indices.length - upCount) / indices.length * 100)}%`, background: COLOR_DOWN }} />
              </div>
            </div>

            {/* 热门板块 */}
            <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: TEXT_SEC, marginBottom: 10 }}>🏆 热门板块</div>
              {topSectors.map(s => (
                <div key={s.industry} onClick={() => navigate(`/discover`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', fontSize: 12 }}>
                  <span style={{ color: TEXT }}>{s.industry}</span>
                  <span style={{ color: s.avg_change_percent >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
                    {s.avg_change_percent >= 0 ? '+' : ''}{s.avg_change_percent}%
                  </span>
                </div>
              ))}
              <div onClick={() => navigate('/discover')} style={{ marginTop: 8, fontSize: 11, color: ACCENT, cursor: 'pointer' }}>
                发掘更多 →
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
