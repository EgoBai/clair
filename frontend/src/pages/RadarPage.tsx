/**
 * 潜力股雷达 🏆
 * AI多因子雷达图 + Top50排行榜 + 综合评分
 * 默认展示优质池(≥80分) + 分布标签
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Empty, Row, Col, Statistic, Button, Card, message, type Breakpoint } from 'antd';
import { LoadingState } from '../components/Common/StateComponents';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import echarts from '@/utils/echarts';
const ReactECharts = React.lazy(() => import('echarts-for-react'));
import { apiFetch } from '../utils/api';
import { THEME, GOLD } from '../styles/theme-constants';
import { TOOLTIP_DARK, RADAR_CONFIG, CHART_COLORS } from '../styles/chart-theme';

const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;
const PURPLE = '#a855f7';   // 优质池紫色
const PURPLE_BG = 'rgba(168,85,247,0.08)';  // 优质行背景
const PURPLE_HOVER = 'rgba(168,85,247,0.14)';

interface GemStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  marketCap: number;
  peRatio: number | null;
  industry: string;
  score: number;
  momentumScore: number;
  volumeScore: number;
  valuationScore: number;
  sizeScore: number;
  industryScore: number;
  qualityScore: number;
  reasons: string[];
}

interface GemsResponse {
  success: boolean;
  data: {
    gems: GemStock[];
    total: number;
    model: string;
    aiSummary: string;
    factors: Record<string, string>;
    scoring: string;
  };
}

const RADAR_INDICATORS = [
  { name: '动量', max: 25 },
  { name: '成交', max: 25 },
  { name: '估值', max: 20 },
  { name: '规模', max: 20 },
  { name: '行业', max: 15 },
  { name: '质量', max: 15 },
];

const PREMIUM_THRESHOLD = 80;
const ALL_THRESHOLD = 40;

type ScoreFilter = 'premium' | 'all';

const RadarPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [gems, setGems] = useState<GemStock[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [model, setModel] = useState('');
  const [selectedStock, setSelectedStock] = useState<GemStock | null>(null);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);        // 全部(≥40)的总数
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('premium');

  const fetchData = useCallback(async (filter: ScoreFilter) => {
    setLoading(true);
    try {
      const minScore = filter === 'premium' ? PREMIUM_THRESHOLD : ALL_THRESHOLD;
      const resp = await apiFetch('/api/ai/gems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 50, minScore }),
      });
      const data: GemsResponse = await resp.json();
      if (data?.success && data.data) {
        setGems(data.data.gems || []);
        setAiSummary(data.data.aiSummary || '');
        setModel(data.data.model || '');
        setTotal(data.data.total || 0);
        if (data.data.gems?.length > 0) {
          setSelectedStock(data.data.gems[0]);
        }
      } else {
        message.error('数据加载失败');
      }
    } catch {
      message.error('潜力股数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载：优质池 + 获取全部总数
  useEffect(() => {
    fetchData('premium');
    // 同时获取 ≥40 的总数（轻量请求，仅为了展示标签）
    (async () => {
      try {
        const resp = await apiFetch('/api/ai/gems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topN: 1, minScore: ALL_THRESHOLD }),
        });
        const data: GemsResponse = await resp.json();
        if (data?.success && data.data) {
          setTotalAll(data.data.total || 0);
        }
      } catch {
        // 静默失败，不影响主流程
      }
    })();
  }, [fetchData]);


  const premiumCount = useMemo(() => {
    if (scoreFilter === 'premium') return total;
    // 在"全部"模式下，从当前数据中统计 ≥80 的数量
    return gems.filter((g) => g.score >= PREMIUM_THRESHOLD).length;
  }, [gems, total, scoreFilter]);

  const avgScore = useMemo(() => {
    if (!gems.length) return 0;
    return (gems.reduce((sum, g) => sum + g.score, 0) / gems.length).toFixed(1);
  }, [gems]);

  const avgChange = useMemo(() => {
    if (!gems.length) return 0;
    return (gems.reduce((sum, g) => sum + g.changePercent, 0) / gems.length).toFixed(2);
  }, [gems]);

  const radarOption = useMemo(() => {
    const stock = selectedStock;
    const isPremium = stock && stock.score >= PREMIUM_THRESHOLD;
    const mainColor = isPremium ? PURPLE : CHART_COLORS.accent;

    if (!stock) {
      return {
        radar: {
          indicator: RADAR_INDICATORS,
          ...RADAR_CONFIG,
        },
        series: [{ type: 'radar', data: [] }],
      };
    }

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: TOOLTIP_DARK.backgroundColor,
        borderColor: TOOLTIP_DARK.borderColor,
        textStyle: { color: TOOLTIP_DARK.textStyle.color, fontSize: TOOLTIP_DARK.textStyle.fontSize },
      },
      radar: {
        indicator: RADAR_INDICATORS,
        ...RADAR_CONFIG,
        center: ['50%', '52%'],
        radius: '65%',
        axisName: {
          ...RADAR_CONFIG.axisName,
          fontSize: 13,
          fontWeight: 500,
        },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        splitArea: {
          areaStyle: {
            color: isPremium
              ? ['rgba(168,85,247,0.02)', 'rgba(168,85,247,0.04)', 'rgba(168,85,247,0.06)', 'rgba(168,85,247,0.08)', 'rgba(168,85,247,0.10)']
              : ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.04)', 'rgba(59,130,246,0.06)', 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.10)'],
          },
        },
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
      },
      series: [
        {
          type: 'radar',
          symbol: 'circle',
          symbolSize: 6,
          data: [
            {
              value: [
                stock.momentumScore,
                stock.volumeScore,
                stock.valuationScore,
                stock.sizeScore,
                stock.industryScore,
                stock.qualityScore,
              ],
              name: `${stock.name} (${stock.symbol})`,
              areaStyle: {
                color: {
                  type: 'linear',
                  x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: isPremium ? 'rgba(168,85,247,0.35)' : 'rgba(59,130,246,0.35)' },
                    { offset: 1, color: isPremium ? 'rgba(168,85,247,0.05)' : 'rgba(59,130,246,0.05)' },
                  ],
                },
              },
              lineStyle: { color: mainColor, width: 2 },
              itemStyle: { color: mainColor, borderColor: '#1e293b', borderWidth: 2 },
            },
          ],
        },
      ],
    };
  }, [selectedStock]);

  const columns = useMemo(
    () => [
      {
        title: '#',
        key: 'rank',
        width: 48,
        render: (_: unknown, __: GemStock, index: number) => (
          <span
            style={{
              color: index < 3 ? GOLD : TEXT_SEC,
              fontWeight: index < 3 ? 700 : 400,
              fontSize: index < 3 ? 15 : 13,
            }}
          >
            {index + 1}
          </span>
        ),
      },
      {
        title: '股票',
        key: 'stock',
        width: 140,
        render: (_: unknown, record: GemStock) => (
          <div>
            <div style={{ color: TEXT, fontWeight: 500, fontSize: 13 }}>{record.name}</div>
            <div style={{ color: TEXT_SEC, fontSize: 11, fontFamily: 'monospace' }}>{record.symbol}</div>
          </div>
        ),
      },
      {
        title: '综合分',
        dataIndex: 'score',
        key: 'score',
        width: 80,
        sorter: (a: GemStock, b: GemStock) => a.score - b.score,
        defaultSortOrder: 'descend' as const,
        render: (score: number) => (
          <span
            style={{
              color: score >= PREMIUM_THRESHOLD ? PURPLE : score >= 60 ? GOLD : ACCENT,
              fontWeight: 700,
              fontSize: 15,
              fontFamily: 'monospace',
            }}
          >
            {score}
          </span>
        ),
      },
      {
        title: '涨跌%',
        dataIndex: 'changePercent',
        key: 'changePercent',
        width: 80,
        sorter: (a: GemStock, b: GemStock) => a.changePercent - b.changePercent,
        render: (val: number) => (
          <span
            style={{
              color: val >= 0 ? COLOR_UP : COLOR_DOWN,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </span>
        ),
      },
      {
        title: '行业',
        dataIndex: 'industry',
        key: 'industry',
        width: 100,
        responsive: ['lg'] as Breakpoint[],
        render: (industry: string) => (
          <Tag
            style={{
              background: 'rgba(59,130,246,0.1)',
              color: ACCENT,
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            {industry}
          </Tag>
        ),
      },
      {
        title: '上榜理由',
        dataIndex: 'reasons',
        key: 'reasons',
        ellipsis: true,
        render: (reasons: string[]) => (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(reasons || []).slice(0, 3).map((r, i) => (
              <Tag
                key={i}
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  color: '#93c5fd',
                  border: '1px solid rgba(59,130,246,0.15)',
                  borderRadius: 4,
                  fontSize: 11,
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r}
              </Tag>
            ))}
          </div>
        ),
      },
      {
        title: '市值(亿)',
        dataIndex: 'marketCap',
        key: 'marketCap',
        width: 90,
        responsive: ['lg'] as Breakpoint[],
        render: (val: number) => (
          <span style={{ color: TEXT_SEC, fontFamily: 'monospace', fontSize: 12 }}>
            {val > 0 ? val.toFixed(1) : '—'}
          </span>
        ),
      },
    ],
    [COLOR_UP, COLOR_DOWN, GOLD, ACCENT, TEXT, TEXT_SEC, PURPLE]
  );

  const handleRowClick = useCallback((record: GemStock) => {
    setSelectedStock(record);
  }, []);

  const handleStockClick = useCallback(
    (symbol: string) => {
      navigate(`/stocks/${symbol}`);
    },
    [navigate]
  );

  if (loading && gems.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <LoadingState />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto', overflowX: 'hidden' }}>
      <style>{`
        .radar-page .ant-table { background: transparent !important; }
        .radar-page .ant-table-thead > tr > th { 
          background: rgba(30,41,59,0.8) !important; 
          color: ${TEXT_SEC} !important; 
          border-bottom: 1px solid rgba(148,163,184,0.1) !important;
          font-size: 12px;
          font-weight: 500;
        }
        .radar-page .ant-table-tbody > tr > td {
          border-bottom: 1px solid rgba(148,163,184,0.06) !important;
          padding: 10px 12px !important;
        }
        .radar-page .ant-table-tbody > tr:hover > td {
          background: rgba(59,130,246,0.06) !important;
        }
        .radar-page .ant-table-tbody > tr.row-premium > td {
          background: ${PURPLE_BG} !important;
        }
        .radar-page .ant-table-tbody > tr.row-premium:hover > td {
          background: ${PURPLE_HOVER} !important;
        }
        .radar-page .ant-table-tbody > tr.selected-row > td {
          background: rgba(59,130,246,0.12) !important;
        }
        .radar-page .ant-table-tbody > tr.row-premium.selected-row > td {
          background: rgba(168,85,247,0.18) !important;
        }
        .radar-page .ant-table-wrapper .ant-table { border-radius: 8px; overflow: hidden; }
        .radar-page .ant-table-wrapper .ant-table-container { border: 1px solid rgba(148,163,184,0.1); border-radius: 8px; }
        .radar-page .ant-card { background: ${CARD_BG} !important; border: 1px solid rgba(148,163,184,0.1) !important; border-radius: 10px; }
        .radar-page .ant-statistic-title { color: ${TEXT_SEC} !important; font-size: 12px; }
        .radar-page .ant-statistic-content { color: ${TEXT} !important; }
        .radar-page .ant-pagination .ant-pagination-item-active a { color: ${ACCENT} !important; }
        .radar-page .ant-pagination .ant-pagination-item-active { border-color: ${ACCENT} !important; }
        .radar-page .ant-switch-checked { background-color: ${PURPLE} !important; }
      `}</style>

      <div className="radar-page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: TEXT, fontSize: 22, fontWeight: 700 }}>
            <ThunderboltOutlined style={{ color: GOLD, marginRight: 8 }} />
            潜力股雷达
          </h2>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchData(scoreFilter)}
            loading={loading}
            style={{ borderColor: 'rgba(148,163,184,0.2)', color: TEXT_SEC }}
          >
            刷新
          </Button>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={
                  <span>
                    入选数
                    {totalAll > 0 && scoreFilter === 'premium' && (
                      <Tag
                        style={{
                          marginLeft: 8,
                          background: 'rgba(168,85,247,0.12)',
                          color: PURPLE,
                          border: `1px solid rgba(168,85,247,0.25)`,
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        优质(≥80): {premiumCount}只
                      </Tag>
                    )}
                    {totalAll > 0 && scoreFilter === 'all' && (
                      <Tag
                        style={{
                          marginLeft: 8,
                          background: 'rgba(168,85,247,0.12)',
                          color: PURPLE,
                          border: `1px solid rgba(168,85,247,0.25)`,
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        优质(≥80): {premiumCount}只
                      </Tag>
                    )}
                  </span>
                }
                value={scoreFilter === 'premium' ? premiumCount : total}
                suffix="只"
                valueStyle={{ color: ACCENT, fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="平均分" value={avgScore} valueStyle={{ color: GOLD, fontSize: 20 }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="平均涨幅"
                value={avgChange}
                suffix="%"
                valueStyle={{ color: Number(avgChange) >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: 20 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="模型版本" value={model || '—'} valueStyle={{ color: TEXT_SEC, fontSize: 14 }} />
            </Card>
          </Col>
        </Row>

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: TEXT_SEC, fontSize: 13 }}>筛选：</span>
          <Tag
            color={scoreFilter === 'premium' ? 'purple' : 'default'}
            style={{
              cursor: 'pointer',
              fontWeight: scoreFilter === 'premium' ? 700 : 400,
              opacity: scoreFilter === 'premium' ? 1 : 0.6,
              borderColor: scoreFilter === 'premium' ? PURPLE : 'rgba(148,163,184,0.25)',
              background: scoreFilter === 'premium' ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: scoreFilter === 'premium' ? PURPLE : TEXT_SEC,
              padding: '4px 14px',
              fontSize: 13,
            }}
            onClick={() => { setScoreFilter('premium'); fetchData('premium'); }}
          >
            优质 (≥{PREMIUM_THRESHOLD}分)
          </Tag>
          <Tag
            color={scoreFilter === 'all' ? 'blue' : 'default'}
            style={{
              cursor: 'pointer',
              fontWeight: scoreFilter === 'all' ? 700 : 400,
              opacity: scoreFilter === 'all' ? 1 : 0.6,
              borderColor: scoreFilter === 'all' ? ACCENT : 'rgba(148,163,184,0.25)',
              background: scoreFilter === 'all' ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: scoreFilter === 'all' ? ACCENT : TEXT_SEC,
              padding: '4px 14px',
              fontSize: 13,
            }}
            onClick={() => { setScoreFilter('all'); fetchData('all'); }}
          >
            全部 (≥{ALL_THRESHOLD}分)
          </Tag>
        </div>

        {aiSummary && (
          <Card
            title={
              <span style={{ color: TEXT, fontSize: 14 }}>
                <span style={{ marginRight: 6 }}>🤖</span>
                AI 整体解读
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <div
              style={{
                color: TEXT,
                lineHeight: 1.8,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {aiSummary}
            </div>
          </Card>
        )}

        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col lg={12} xs={24}>
            <Card
              title={
                <span style={{ color: TEXT, fontSize: 14 }}>
                  因子雷达
                  {selectedStock && (
                    <span style={{ color: TEXT_SEC, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                      {selectedStock.name} · {selectedStock.score}分
                    </span>
                  )}
                </span>
              }
              style={{ height: '100%' }}
              bodyStyle={{ padding: '8px 12px' }}
            >
              <Suspense fallback={<div style={{ height: typeof window !== 'undefined' && window.innerWidth < 768 ? 250 : 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingState /></div>}>
                <ReactECharts echarts={echarts}
                  option={radarOption}
                  style={{ height: typeof window !== 'undefined' && window.innerWidth < 768 ? 250 : 350 }}
                  opts={{ renderer: 'svg' }}
                />
              </Suspense>
            </Card>
          </Col>
          <Col lg={12} xs={24}>
            <Card
              title={
                <span style={{ color: TEXT, fontSize: 14 }}>
                  {scoreFilter === 'premium' ? '优质推荐' : 'Top50'} 排行榜
                </span>
              }
              style={{ height: '100%' }}
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <Table
                  dataSource={gems}
                  columns={columns}
                  rowKey="symbol"
                  size="small"
                  pagination={{ pageSize: 10, showSizeChanger: false, simple: true }}
                  rowClassName={(record) => {
                    const classes = [];
                    if (record.score >= PREMIUM_THRESHOLD) classes.push('row-premium');
                    if (selectedStock?.symbol === record.symbol) classes.push('selected-row');
                    return classes.join(' ');
                  }}
                  onRow={(record) => ({
                    onClick: () => handleRowClick(record),
                    onDoubleClick: () => handleStockClick(record.symbol),
                    style: { cursor: 'pointer' },
                  })}
                  locale={{ emptyText: <Empty description="暂无数据" /> }}
                  scroll={{ x: 'max-content' }}
                />
              </div>
            </Card>
          </Col>
        </Row>


      </div>
    </div>
  );
};

export default RadarPage;
