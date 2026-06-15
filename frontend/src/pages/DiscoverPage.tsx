/**
 * 发掘页 v2 🔭 — 核心循环入口
 * 大盘 → 板块景气度评分 → 个股深挖
 * 陪伴式引导：AI解读 + 评分可视化 + 一键穿透
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Spin, Empty, Typography, Badge, Progress, Tooltip, message, Button } from 'antd';
import { RiseOutlined, FallOutlined, FireOutlined, ThunderboltOutlined, CompassOutlined, RightOutlined, BulbOutlined, StarOutlined, BarChartOutlined, ArrowLeftOutlined, FilterOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

import { THEME, GOLD } from '../styles/theme-constants';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;

interface IndexData { name: string; symbol: string; closePrice: number; changePercent: number; volume: number; category?: string; }
interface SectorScore { industry: string; score: number; changeScore: number; volumeScore: number; breadthScore: number; momentumScore?: number; stock_count: number; avg_change_percent: number; total_turnover: number; limit_up_count: number; }
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
  const [sectorType, setSectorType] = useState<'industry' | 'concept'>('industry');
  const [news, setNews] = useState<any[]>([]);

  // Load market overview + scores (fast, show immediately)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const apiPath = sectorType === 'industry' ? '/api/sectors/momentum' : '/api/sectors/concept';
      const [iRes, sRes] = await Promise.all([
        fetch('/api/market/indices').then(r => r.json()).catch(() => ({ data: { indices: [] } })),
        fetch(apiPath).then(r => r.json()).catch(() => ({ data: { sectors: [] } })),
      ]);
      setIndices(iRes.data?.indices || []);
      setScores(sRes.data?.sectors || []);
      setLoading(false);

      // AI insight loads in background (slow, don't block page)
      fetch('/api/ai/market-insight').then(r => r.json()).then(d => {
        if (d?.data) setInsight(d.data);
      }).catch(() => {});

      // News loads in background
      fetch('/api/news?limit=6').then(r => r.json()).then(d => setNews(d.data || [])).catch(() => {});
    })();
  }, [sectorType]);

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
    <div className="discover-page" style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div className="discover-container" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>

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
            {insight?.sections ? (
              <div className="card-modern animate-fade-in" style={{ padding: 'var(--space-5)', marginBottom: 20 }}>
                {/* 顶部情绪栏 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 36, lineHeight: 1 }}>{insight.moodEmoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{insight.mood}</span>
                      <span className="badge-modern badge-accent">AI 解读</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>涨跌比</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="mono" style={{ color: 'var(--color-up)', fontWeight: 600 }}>{insight.marketBreadth.up}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--color-down-bg)', overflow: 'hidden' }}>
                          <div style={{ width: `${(insight.marketBreadth.up / (insight.marketBreadth.up + insight.marketBreadth.down)) * 100}%`, height: '100%', background: 'var(--color-up)', borderRadius: 2 }} />
                        </div>
                        <span className="mono" style={{ color: 'var(--color-down)', fontWeight: 600 }}>{insight.marketBreadth.down}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>均幅</span>
                      <span className="mono" style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: insight.avgIndexChange >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                        {insight.avgIndexChange > 0 ? '+' : ''}{Number(insight.avgIndexChange).toFixed(2)}%
                      </span>
                    </div>
                    {insight.limitUpCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>涨停</span>
                        <span className="mono" style={{ color: 'var(--color-up)', fontWeight: 700 }}>{insight.limitUpCount}</span>
                      </div>
                    )}
                    {insight.limitDownCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>跌停</span>
                        <span className="mono" style={{ color: 'var(--color-down)', fontWeight: 700 }}>{insight.limitDownCount}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* 三栏内容 */}
                <div className="insight-sections" style={{ gap: 16 }}>
                  {insight.sections.map((sec: any, i: number) => (
                    <div key={i} style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                    }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--accent-solid)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{sec.icon}</span>
                        <span>{sec.title}</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.7 }}>
                        {sec.text.split('\n').filter((l: string) => l.trim()).map((line: string, j: number) => {
                          const trimmed = line.trim();
                          const isBullet = trimmed.startsWith('·') || trimmed.startsWith('-') || trimmed.startsWith('•');
                          const isArrow = trimmed.startsWith('→') || trimmed.startsWith('▸');
                          const parts = trimmed.split(/(\*\*[^*]+\*\*)/g).map((part, idx) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <b key={idx} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part.slice(2, -2)}</b>;
                            }
                            return <span key={idx}>{part}</span>;
                          });
                          return (
                            <div key={j} style={{
                              marginBottom: 6,
                              paddingLeft: isBullet ? 14 : 0,
                              color: isArrow ? 'var(--accent-solid)' : 'var(--text-primary)',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6,
                            }}>
                              {isBullet && <span style={{ color: 'var(--accent-solid)', flexShrink: 0, marginTop: 2 }}>›</span>}
                              <span>{parts}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 领涨板块 */}
                {insight.topSectors?.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge-modern badge-accent">🏆 领涨</span>
                    {insight.topSectors.slice(0, 5).map((s: any) => (
                      <span 
                        key={s.industry} 
                        style={{ color: TEXT, cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/screener?industry=${encodeURIComponent(s.industry)}`)}
                      >
                        {s.industry} <span style={{ color: s.avgChange >= 0 ? COLOR_UP : COLOR_DOWN }}>{s.avgChange >= 0 ? '+' : ''}{s.avgChange}%</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12 }}>
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

            {/* 资讯速览 */}
            {news.length > 0 && (
              <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14 }}>📰</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>实时资讯</span>
                  <span style={{ fontSize: 10, color: TEXT_SEC, marginLeft: 'auto' }}>东方财富</span>
                </div>
                <div className="news-grid" style={{ gap: 8 }}>
                  {news.slice(0, 6).map((item, i) => (
                    <div key={i} className="news-item" style={{
                      background: 'var(--bg-surface)', border: `1px solid ${BORDER}`,
                      borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                    }} onClick={() => item.url && window.open(item.url, '_blank')}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <Tag color={item.sentiment === 'positive' ? 'red' : item.sentiment === 'negative' ? 'green' : 'default'} 
                          style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, flexShrink: 0 }}>
                          {item.sentiment === 'positive' ? '利好' : item.sentiment === 'negative' ? '利空' : '中性'}
                        </Tag>
                        <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5, flex: 1 }}>
                          {item.title?.length > 40 ? item.title.slice(0, 40) + '...' : item.title}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 4 }}>{item.time?.slice(0, 10) || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 指数 + 宽度 */}
            <div className="index-breadth-grid" style={{ gap: 12, marginBottom: 20 }}>
              <div className="index-grid" style={{ gap: 8 }}>
                {indices.map(idx => {
                  const up = idx.changePercent >= 0;
                  return (
                    <div key={idx.symbol} onClick={() => navigate(`/index/${idx.symbol}`)} style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', cursor: 'pointer' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <Text strong style={{ color: TEXT, fontSize: 15 }}>🏢 板块景气度评分</Text>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
                  综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
                {(['industry', 'concept'] as const).map(t => (
                  <div key={t} onClick={() => setSectorType(t)} style={{
                    padding: '3px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    fontWeight: sectorType === t ? 700 : 400,
                    color: sectorType === t ? TEXT : TEXT_SEC,
                    background: sectorType === t ? 'var(--border)' : 'transparent',
                    transition: 'all .15s',
                  }}>
                    {t === 'industry' ? '行业板块' : '概念板块'}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scores.slice(0, 15).map(s => (
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
                      <Tooltip title="板块热度 (50%)：平均涨跌幅的绝对值，涨得越猛得分越高，反映资金对该板块的关注程度">
                        <span>🔥 {s.changeScore}</span>
                      </Tooltip>
                      <Tooltip title="成交活跃 (30%)：总成交金额，成交越大说明市场越关注，流动性越好">
                        <span>💰 {s.volumeScore}</span>
                      </Tooltip>
                      <Tooltip title="赚钱效应 (20%)：涨停家数，涨停越多说明板块内更容易赚钱">
                        <span>🎯 {s.breadthScore}</span>
                      </Tooltip>
                      <span style={{ color: Number(s.avg_change_percent) >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
                        {Number(s.avg_change_percent) >= 0 ? '+' : ''}{Number(s.avg_change_percent).toFixed(2)}%
                      </span>
                      <span>额{formatBig(Number(s.total_turnover))}</span>
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
                <div className="sector-detail-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
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
                  <div className="sector-detail-actions">
                    <Button 
                      type="primary" 
                      icon={<FilterOutlined />}
                      onClick={() => navigate(`/screener?industry=${encodeURIComponent(selectedSector.industry)}`)}
                      style={{ background: ACCENT, borderColor: ACCENT }}
                    >
                      筛选该板块
                    </Button>
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
                    <StarOutlined style={{ color: GOLD, cursor: 'pointer', fontSize: 15, background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '2px 3px' }}
                      onClick={e => {
                        e.stopPropagation();
                        try {
                          const KEY = 'astock_watchlist_v2';
                          const saved = localStorage.getItem(KEY);
                          const groups = saved ? JSON.parse(saved) : [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
                          const def = groups.find((g: any) => g.id === 'default') || groups[0];
                          if (def.stocks.find((s: any) => s.symbol === r.symbol)) {
                            message.warning(`${r.name} 已在自选列表中`);
                            return;
                          }
                          def.stocks.push({ symbol: r.symbol, name: r.name, market: r.market || '', sortIndex: def.stocks.length, groupId: def.id });
                          localStorage.setItem(KEY, JSON.stringify(groups));
                          message.success(`已将 ${r.name} 添加到自选股`);
                        } catch { message.error('添加失败'); }
                      }} />
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
