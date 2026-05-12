/**
 * 发掘页 v2 🔭 — 核心循环入口
 * 大盘 → 板块景气度评分 → 个股深挖
 * 陪伴式引导：AI解读 + 评分可视化 + 一键穿透
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Spin, Empty, Typography, Badge, Progress, Tooltip } from 'antd';
import { RiseOutlined, FallOutlined, FireOutlined, ThunderboltOutlined, CompassOutlined, RightOutlined, BulbOutlined, StarOutlined, BarChartOutlined, ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const BG = '#0f172a';
const CARD_BG = '#1e293b';
const BORDER = '#334155';
const TEXT = '#f1f5f9';
const TEXT_SEC = '#94a3b8';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const ACCENT = '#3b82f6';
const GOLD = '#f59e0b';

interface IndexData { name: string; symbol: string; closePrice: number; changePercent: number; volume: number; category?: string; }
interface SectorScore { industry: string; score: number; changeScore: number; volumeScore: number; breadthScore: number; stock_count: number; avg_change_percent: number; total_turnover: number; limit_up_count: number; }
interface StockData { symbol: string; name: string; price: number; changePercent: number; turnoverRate?: number; peRatio?: number; market: string; }

const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [scores, setScores] = useState<SectorScore[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorScore | null>(null);
  const [sectorStocks, setSectorStocks] = useState<StockData[]>([]);
  const [view, setView] = useState<'market' | 'sector'>('market');
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<any>(null);

  // Load market overview + scores + AI insight
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [iRes, sRes, aiRes] = await Promise.all([
        fetch('/api/market/indices').then(r => r.json()).catch(() => ({ data: { indices: [] } })),
        fetch('/api/sectors/momentum').then(r => r.json()).catch(() => ({ data: { sectors: [] } })),
        fetch('/api/ai/market-insight').then(r => r.json()).catch(() => null),
      ]);
      setIndices(iRes.data?.indices || []);
      setScores(sRes.data?.sectors || []);
      if (aiRes?.data) setInsight(aiRes.data);
      setLoading(false);
    })();
  }, []);

  // Load sector stocks
  const openSector = useCallback(async (s: SectorScore) => {
    setSelectedSector(s);
    setView('sector');
    try {
      const r = await fetch(`/api/sectors/${encodeURIComponent(s.industry)}/stocks?pageSize=50`);
      const d = await r.json();
      const rawStocks = d.data?.items || d.data?.stocks || [];
      setSectorStocks(rawStocks.map((st: any) => ({
        symbol: st.symbol || '', name: st.name || st.symbol,
        price: st.latestQuote?.closePrice || 0,
        changePercent: st.latestQuote?.changePercent || 0,
        turnoverRate: st.latestQuote?.turnoverRate,
        peRatio: st.latestQuote?.peRatio,
        market: st.market || '',
      })).sort((a: StockData, b: StockData) => b.changePercent - a.changePercent));
    } catch { setSectorStocks([]); }
  }, []);

  const formatBig = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

  const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 45 ? '#f59e0b' : s >= 25 ? '#f97316' : '#6b7280';
  const scoreLabel = (s: number) => s >= 70 ? '高景气' : s >= 45 ? '较活跃' : s >= 25 ? '一般' : '冷门';

  const upCount = scores.filter(s => s.avg_change_percent > 0).length;
  const downCount = scores.filter(s => s.avg_change_percent < 0).length;
  const upPct = scores.length > 0 ? Math.round((upCount / scores.length) * 100) : 0;
  const topScores = scores.slice(0, 3);

  if (loading) return <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CompassOutlined style={{ fontSize: 22, color: ACCENT }} />
              <Title level={3} style={{ margin: 0, color: TEXT, fontWeight: 700 }}>
                {view === 'market' ? '发掘' : selectedSector?.industry || ''}
              </Title>
            </div>
            <Text style={{ color: TEXT_SEC, fontSize: 13 }}>
              {view === 'market' ? '板块景气度评分 → 点击板块查看个股详情' : (
                <span style={{ cursor: 'pointer', color: ACCENT }} onClick={() => { setView('market'); setSelectedSector(null); }}>
                  <ArrowLeftOutlined /> 返回大盘总览
                </span>
              )}
            </Text>
          </div>
        </div>

        {view === 'market' ? (
          <>
            {/* AI 解读 */}
            {insight ? (
              <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2744 100%)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 24 }}>{insight.moodEmoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text strong style={{ color: TEXT, fontSize: 14 }}>AI 市场解读</Text>
                    <Tag color={insight.moodColor} style={{ margin: 0, fontSize: 11 }}>{insight.mood}</Tag>
                    <Tag style={{ margin: 0, fontSize: 11, background: '#334155', color: '#94a3b8', border: 'none' }}>
                      宽度 {Math.round(insight.marketBreadth.breadthRatio * 100)}%
                    </Tag>
                  </div>
                  <Paragraph style={{ color: TEXT_SEC, fontSize: 13, margin: '6px 0 0', maxWidth: 700, whiteSpace: 'pre-wrap' }}>
                    {insight.text}
                  </Paragraph>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>📊 {insight.marketBreadth.up}涨{insight.marketBreadth.down}跌 · 均涨跌{insight.avgIndexChange > 0 ? '+' : ''}{insight.avgIndexChange}%</span>
                    <span style={{ color: '#334155' }}>|</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>🏆 {insight.topSectors?.map((s: any) => s.industry).join('、') || '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2744 100%)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12 }}>
                <BulbOutlined style={{ fontSize: 20, color: GOLD, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ color: TEXT, fontSize: 14 }}>AI 市场解读</Text>
                  <Paragraph style={{ color: TEXT_SEC, fontSize: 13, margin: '4px 0 0', maxWidth: 700 }}>
                    {(() => {
                      const top3 = topScores.slice(0, 3);
                      const topNames = top3.map(s => `${s.industry}(${s.score}分${s.avg_change_percent >= 0 ? '+' : ''}${s.avg_change_percent.toFixed(1)}%)`).join('、');
                      const hotSectors = scores.filter(s => s.limit_up_count > 0).slice(0, 3);
                      const hotNames = hotSectors.map(s => `${s.industry}${s.limit_up_count}只涨停`).join('、');
                      if (upPct >= 60) {
                        return `市场情绪偏乐观，${upCount}/${scores.length} 板块上涨（${upPct}%）。领涨板块：${topNames}。${hotSectors.length > 0 ? `涨停集中：${hotNames}。` : ''}资金活跃度高，建议聚焦景气评分 > 50 的板块。`;
                      } else if (upPct >= 35) {
                        return `市场结构性分化，${upCount} 涨 ${downCount} 跌。强势板块：${topNames}。${hotSectors.length > 0 ? `局部热点：${hotNames}。` : ''}结构性行情下，轻指数重板块。`;
                      } else {
                        return `市场情绪偏谨慎，仅 ${upPct}% 板块上涨。抗跌板块：${topNames}。防御策略为主，关注低估值、高股息品种。`;
                      }
                    })()}
                  </Paragraph>
                </div>
              </div>
            )}

            {/* 指数 + 宽度 */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {indices.slice(0, 6).map(idx => {
                  const up = idx.changePercent >= 0;
                  return (
                    <div key={idx.symbol} onClick={() => navigate(`/stocks/${idx.symbol}`)} style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, color: TEXT_SEC }}>{idx.name}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: TEXT }}>{idx.closePrice?.toLocaleString()}</div>
                      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: up ? COLOR_UP : COLOR_DOWN }}>{up ? '+' : ''}{idx.changePercent?.toFixed(2)}%</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: TEXT_SEC, marginBottom: 8 }}>板块宽度</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: COLOR_UP }}>{upCount} 涨</span>
                  <span style={{ color: COLOR_DOWN }}>{downCount} 跌</span>
                  <span style={{ color: TEXT_SEC }}>{upPct}%</span>
                </div>
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ width: `${upPct}%`, background: COLOR_UP }} />
                  <div style={{ width: `${100 - upPct}%`, background: COLOR_DOWN }} />
                </div>
                <div style={{ fontSize: 11, color: TEXT_SEC, lineHeight: 1.6 }}>
                  {topScores.slice(0, 2).map(s => (
                    <div key={s.industry}>🏆 {s.industry} 景气度 <span style={{ color: scoreColor(s.score), fontWeight: 600 }}>{s.score}分</span></div>
                  ))}
                </div>
              </div>
            </div>

            {/* 板块景气度评分 */}
            <Text strong style={{ color: TEXT, fontSize: 15, display: 'block', marginBottom: 12 }}>🏢 板块景气度评分</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scores.map(s => (
                <div key={s.industry} onClick={() => openSector(s)}
                  style={{
                    background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 16px',
                    cursor: 'pointer', transition: 'border-color .15s', display: 'flex', alignItems: 'center', gap: 16,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                  onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
                >
                  {/* Score Badge */}
                  <div style={{ textAlign: 'center', minWidth: 50 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(s.score), fontFamily: 'monospace' }}>{s.score}</div>
                    <Tag style={{ fontSize: 10, margin: 0, borderRadius: 4, padding: '0 4px', lineHeight: '16px' }}
                      color={s.score >= 70 ? 'green' : s.score >= 45 ? 'gold' : 'default'}>{scoreLabel(s.score)}</Tag>
                  </div>

                  {/* Sector Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text strong style={{ color: TEXT, fontSize: 13 }}>{s.industry}</Text>
                      <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>{s.stock_count}只</Tag>
                      {s.limit_up_count > 0 && <Tag color="red" style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>🔥{s.limit_up_count}涨停</Tag>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: TEXT_SEC }}>
                      <Tooltip title="涨跌幅得分 (权重50%)">
                        <span>📈 {s.changeScore}</span>
                      </Tooltip>
                      <Tooltip title="成交额得分 (权重25%)">
                        <span>💰 {s.volumeScore}</span>
                      </Tooltip>
                      <Tooltip title="涨停家数得分 (权重25%)">
                        <span>🔥 {s.breadthScore}</span>
                      </Tooltip>
                      <span style={{ color: s.avg_change_percent >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
                        {s.avg_change_percent >= 0 ? '+' : ''}{s.avg_change_percent.toFixed(2)}%
                      </span>
                      <span>额{formatBig(s.total_turnover)}</span>
                    </div>
                  </div>

                  <RightOutlined style={{ color: TEXT_SEC, fontSize: 12 }} />
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Sector Detail View */
          <div>
            {selectedSector && (
              <div style={{ marginBottom: 20, background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(selectedSector.score), fontFamily: 'monospace' }}>{selectedSector.score}</div>
                    <div style={{ fontSize: 11, color: TEXT_SEC }}>景气度评分</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>涨跌幅: <span style={{ color: selectedSector.avg_change_percent >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>{selectedSector.avg_change_percent >= 0 ? '+' : ''}{selectedSector.avg_change_percent.toFixed(2)}%</span></span>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>成交额: {formatBig(selectedSector.total_turnover)}</span>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>{selectedSector.stock_count}只 · {selectedSector.limit_up_count}涨停</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: TEXT_SEC }}>
                      <span>技术面 {selectedSector.changeScore}分</span>
                      <Progress percent={selectedSector.changeScore} showInfo={false} size="small" strokeColor={COLOR_UP} style={{ width: 60 }} />
                      <span>资金面 {selectedSector.volumeScore}分</span>
                      <Progress percent={selectedSector.volumeScore} showInfo={false} size="small" strokeColor={ACCENT} style={{ width: 60 }} />
                      <span>宽度 {selectedSector.breadthScore}分</span>
                      <Progress percent={selectedSector.breadthScore} showInfo={false} size="small" strokeColor={GOLD} style={{ width: 60 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Title level={5} style={{ color: TEXT, marginBottom: 12 }}>板块内个股 <Badge count={sectorStocks.length} style={{ backgroundColor: ACCENT }} /></Title>
            <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <Table dataSource={sectorStocks} rowKey="symbol" size="middle" pagination={false}
                className="dark-table"
                locale={{ emptyText: <Empty description="暂无数据" /> }}
                columns={[
                  { title: '#', width: 45, render: (_: any, __: any, i: number) => (
                    <span style={{ color: i < 3 ? GOLD : TEXT_SEC, fontWeight: 700 }}>{i + 1}</span>
                  )},
                  { title: '代码', dataIndex: 'symbol', width: 95, render: (v: string) => (
                    <a onClick={() => navigate(`/stocks/${v}`)} style={{ color: ACCENT, fontWeight: 600, fontFamily: 'monospace', cursor: 'pointer' }}>{v.replace(/\.(SH|SZ)$/, '')}</a>
                  )},
                  { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string) => <span style={{ color: TEXT }}>{v}</span> },
                  { title: '最新价', dataIndex: 'price', align: 'right' as const, width: 85, render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: TEXT }}>{v?.toFixed(2)}</span> },
                  { title: '涨跌幅', dataIndex: 'changePercent', align: 'right' as const, width: 85, render: (v: number) => (
                    <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontFamily: 'monospace' }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span>
                  )},
                  { title: '换手率', dataIndex: 'turnoverRate', align: 'right' as const, width: 75, render: (v?: number) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v?.toFixed(2) ?? '-'}%</span> },
                  { title: 'PE', dataIndex: 'peRatio', align: 'right' as const, width: 65, render: (v?: number) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v?.toFixed(1) ?? '-'}</span> },
                  { title: '', width: 40, render: (_: any, r: StockData) => (
                    <StarOutlined style={{ color: TEXT_SEC, cursor: 'pointer', fontSize: 14 }}
                      onClick={e => { e.stopPropagation(); /* TODO: add to watchlist */ }} />
                  )},
                ]}
                onRow={r => ({ onClick: () => navigate(`/stocks/${r.symbol}`), style: { cursor: 'pointer' } })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;
