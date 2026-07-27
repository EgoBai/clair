/**
 * 研报 AI 摘要中心页（Ticket S3-4）
 * 接入已有引擎：researchReportEngine（trackRatingChanges / analyzeConsensus /
 *   analyzeReportSentiment / findMostDivided）与 newsEventEngine（runNewsAnalysis /
 *   analyzeSentiment / analyzeNewsHeat）。
 * 后端 API 缺失（技术债 T6）：数据用确定性演示数据兜底（reportDemoData，种子 20260725）。
 * 所有结论均从引擎输出动态生成，不写死文案。
 */
import { useMemo, useState } from 'react';
import {
  Card, Row, Col, Table, Tag, Statistic, Typography, Alert, Select, Space, Tooltip,
  type TableColumnsType,
} from 'antd';
import {
  FileTextOutlined, FundOutlined, RiseOutlined, FallOutlined,
  ApartmentOutlined, AlertOutlined, RadarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts-for-react';
import echarts from '../utils/echarts';
import { getReportDemoData } from '../utils/reportDemoData';
import {
  trackRatingChanges, analyzeConsensus, analyzeReportSentiment, findMostDivided,
  type ConsensusAnalysis, type RatingChange,
} from '../utils/researchReportEngine';
import {
  runNewsAnalysis, analyzeSentiment,
  type NewsEvent, type NewsHeatmap,
} from '../utils/newsEventEngine';
import { getColorByChange } from '../utils/formatters';

const { Title, Text } = Typography;
const ACCENT = '#3B82F6';

// ── 评级 / 共识 / 趋势 的中文标签与配色 ──
const RATING_LABEL: Record<string, string> = {
  buy: '买入', overweight: '增持', hold: '中性', underweight: '减持', sell: '卖出', none: '—',
};
const RATING_COLOR: Record<string, string> = {
  buy: '#ef4444', overweight: '#f97316', hold: '#6b7280', underweight: '#10b981', sell: '#22c55e', none: '#6b7280',
};
const STRENGTH_LABEL: Record<ConsensusAnalysis['consensusStrength'], string> = {
  strong: '高度一致看多', moderate: '偏多', weak: '偏空', divided: '明显分歧',
};
const STRENGTH_COLOR: Record<ConsensusAnalysis['consensusStrength'], string> = {
  strong: 'red', moderate: 'orange', weak: 'blue', divided: 'purple',
};
const TREND_LABEL: Record<ConsensusAnalysis['recentTrend'], string> = {
  improving: '评级上修', stable: '维持', deteriorating: '评级下修',
};
const CHANGE_LABEL: Record<RatingChange['direction'], string> = {
  upgrade: '上调', downgrade: '下调', maintain: '维持',
};
const CHANGE_COLOR: Record<RatingChange['direction'], string> = {
  upgrade: '#ef4444', downgrade: '#22c55e', maintain: '#6b7280',
};
const CAT_LABEL: Record<string, string> = {
  policy: '政策', earnings: '财报', ma: '并购', product: '产品技术', governance: '公司治理',
  industry: '行业', macro: '宏观', regulatory: '监管', legal: '法律', personnel: '人事',
};
const SENTI_LABEL: Record<string, string> = {
  very_positive: '强烈正面', positive: '正面', neutral: '中性', negative: '负面', very_negative: '强烈负面',
};

function ReportCenterPage() {
  // ── 演示数据（确定性，可复现）──
  const { reports, news, currentPrices, stockNameMap } = useMemo(() => getReportDemoData(), []);

  // ── 按股票聚合研报 ──
  const reportsByTicker = useMemo(() => {
    const m = new Map<string, typeof reports>();
    reports.forEach((r) => {
      const arr = m.get(r.ticker) ?? [];
      arr.push(r);
      m.set(r.ticker, arr);
    });
    return m;
  }, [reports]);

  // ── 机构共识（逐股票 analyzeConsensus，按上行空间降序）──
  const consensusList = useMemo<ConsensusAnalysis[]>(() => {
    const list: ConsensusAnalysis[] = [];
    reportsByTicker.forEach((rs) => {
      const c = analyzeConsensus(rs);
      if (c) list.push(c);
    });
    return list.sort((a, b) => b.avgUpside - a.avgUpside);
  }, [reportsByTicker]);

  // ── 分歧最大股票（高亮）──
  const dividedTickers = useMemo(() => {
    const div = findMostDivided(consensusList);
    return new Set(div.map((d) => d.ticker));
  }, [consensusList]);

  // ── 评级变动追踪 ──
  const ratingChanges = useMemo<RatingChange[]>(() => trackRatingChanges(reports), [reports]);

  // ── 新闻综合分析 ──
  const newsAnalysis = useMemo(() => runNewsAnalysis(news, currentPrices), [news, currentPrices]);
  const sentimentDist = useMemo(() => {
    const dist = { positive: 0, neutral: 0, negative: 0 };
    news.forEach((n) => {
      const s = analyzeSentiment(n).sentiment;
      if (s === 'very_positive' || s === 'positive') dist.positive++;
      else if (s === 'negative' || s === 'very_negative') dist.negative++;
      else dist.neutral++;
    });
    return dist;
  }, [news]);

  // ── 顶部概览指标 ──
  const totalReports = reports.length;
  const covered = reportsByTicker.size;
  const buyPct = useMemo(() => {
    const rated = reports.filter((r) => r.rating !== 'none');
    const buy = rated.filter((r) => r.rating === 'buy' || r.rating === 'overweight').length;
    return rated.length ? buy / rated.length : 0;
  }, [reports]);
  const topUpside = consensusList[0];

  // ── 选中股票（默认第一只）──
  const [selectedTicker, setSelectedTicker] = useState<string>(() => consensusList[0]?.ticker ?? '');
  const selectedReports = reportsByTicker.get(selectedTicker) ?? [];
  const selectedConsensus = consensusList.find((c) => c.ticker === selectedTicker);

  // ── AI 研报摘要：逐报告 analyzeReportSentiment 后聚合 ──
  const sentimentAgg = useMemo(() => {
    if (selectedReports.length === 0) return null;
    const sents = selectedReports.map((r) => analyzeReportSentiment(r));
    const avg = sents.reduce((s, x) => s + x.score, 0) / sents.length;
    const bull = new Set<string>();
    const bear = new Set<string>();
    sents.forEach((s) => {
      s.bullishKeywords.forEach((k) => bull.add(k));
      s.bearishKeywords.forEach((k) => bear.add(k));
    });
    const latest = selectedReports[selectedReports.length - 1];
    return { avg, bull: [...bull], bear: [...bear], count: sents.length, latest };
  }, [selectedReports]);

  const sign = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';

  // ── 图表：选中股票综合情绪分仪表 ──
  const gaugeOption: EChartsOption = {
    series: [{
      type: 'gauge', min: -1, max: 1, splitNumber: 4,
      axisLine: { lineStyle: { width: 10, color: [[0.5, '#22c55e'], [1, '#ef4444']] } },
      axisLabel: { color: '#94a3b8', fontSize: 10, distance: 12 },
      pointer: { itemStyle: { color: 'auto' } },
      detail: { formatter: (v: number) => v.toFixed(2), color: '#e2e8f0', fontSize: 18 },
      title: { color: '#94a3b8', fontSize: 11, offsetCenter: [0, '70%'] },
      data: [{ value: sentimentAgg ? sentimentAgg.avg : 0, name: '情绪分 (-1 ~ 1)' }],
    }],
  };

  // ── 图表：新闻情绪分布饼图 ──
  const pieOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#cbd5e1' } },
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '42%'],
      label: { color: '#cbd5e1' },
      data: [
        { name: '正面', value: sentimentDist.positive, itemStyle: { color: '#ef4444' } },
        { name: '中性', value: sentimentDist.neutral, itemStyle: { color: '#6b7280' } },
        { name: '负面', value: sentimentDist.negative, itemStyle: { color: '#22c55e' } },
      ],
    }],
  };

  // ── 图表：新闻热度榜（按热度降序）──
  const heatmaps: NewsHeatmap[] = newsAnalysis.heatmaps;
  const heatOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 72, right: 28, top: 16, bottom: 24 },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2a2a2a' } } },
    yAxis: {
      type: 'category',
      data: heatmaps.map((h) => CAT_LABEL[h.category] ?? h.category),
      axisLabel: { color: '#cbd5e1' },
    },
    series: [{
      type: 'bar',
      data: heatmaps.map((h) => h.heatScore),
      itemStyle: { color: ACCENT, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: '#94a3b8' },
    }],
  };

  // ── 共识表列 ──
  const consensusColumns: TableColumnsType<ConsensusAnalysis> = [
    {
      title: '股票', dataIndex: 'ticker', key: 'ticker', fixed: 'left', width: 130,
      render: (_: unknown, r) => (
        <span>
          <Text strong>{stockNameMap[r.ticker] ?? r.ticker}</Text>
          <br /><Text type="secondary" style={{ fontSize: 12 }}>{r.ticker}</Text>
        </span>
      ),
    },
    {
      title: '评级分布', key: 'dist', width: 180,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tag color={RATING_COLOR.buy}>买 {r.buyCount}</Tag>
          <Tag color={RATING_COLOR.hold}>中 {r.holdCount}</Tag>
          <Tag color={RATING_COLOR.sell}>卖 {r.sellCount}</Tag>
        </Space>
      ),
    },
    {
      title: '一致目标价', dataIndex: 'avgTargetPrice', key: 'avgTargetPrice', width: 120, align: 'right',
      render: (v: number) => <Text style={{ fontFamily: 'var(--font-mono)' }}>{v.toFixed(2)}</Text>,
    },
    {
      title: '上行空间', dataIndex: 'avgUpside', key: 'avgUpside', width: 110, align: 'right',
      render: (v: number) => <Text style={{ color: getColorByChange(v), fontFamily: 'var(--font-mono)' }}>{sign(v)}</Text>,
    },
    {
      title: '分歧度', dataIndex: 'consensusStrength', key: 'consensusStrength', width: 120,
      render: (_: unknown, r) => (
        <Tag color={STRENGTH_COLOR[r.consensusStrength]} style={dividedTickers.has(r.ticker) ? { fontWeight: 700, border: '1px solid currentColor' } : undefined}>
          {STRENGTH_LABEL[r.consensusStrength]}
        </Tag>
      ),
    },
    {
      title: '近期趋势', dataIndex: 'recentTrend', key: 'recentTrend', width: 110,
      render: (_: unknown, r) => <Tag color={r.recentTrend === 'improving' ? 'red' : r.recentTrend === 'deteriorating' ? 'green' : 'default'}>{TREND_LABEL[r.recentTrend]}</Tag>,
    },
    {
      title: '研报数', dataIndex: 'totalReports', key: 'totalReports', width: 80, align: 'right',
      render: (v: number) => <Text type="secondary">{v}</Text>,
    },
  ];

  // ── 评级变动表列 ──
  const changeColumns: TableColumnsType<RatingChange> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '股票', dataIndex: 'ticker', key: 'ticker', width: 130,
      render: (_: unknown, r) => <span><Text strong>{stockNameMap[r.ticker] ?? r.ticker}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.ticker}</Text></span>,
    },
    { title: '机构', dataIndex: 'broker', key: 'broker', width: 110 },
    {
      title: '变动', dataIndex: 'direction', key: 'direction', width: 90,
      render: (_: unknown, r) => <Tag color={CHANGE_COLOR[r.direction]} style={{ fontWeight: 600 }}>{CHANGE_LABEL[r.direction]}</Tag>,
    },
    {
      title: '评级', key: 'rating', width: 150,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tag color={RATING_COLOR[r.from]}>{RATING_LABEL[r.from] ?? r.from}</Tag>
          <Text type="secondary">→</Text>
          <Tag color={RATING_COLOR[r.to]}>{RATING_LABEL[r.to] ?? r.to}</Tag>
        </Space>
      ),
    },
    {
      title: '目标价', dataIndex: 'targetPrice', key: 'targetPrice', width: 100, align: 'right',
      render: (v: number) => <Text style={{ fontFamily: 'var(--font-mono)' }}>{v.toFixed(2)}</Text>,
    },
    {
      title: '上行空间', dataIndex: 'upside', key: 'upside', width: 100, align: 'right',
      render: (v: number) => <Text style={{ color: getColorByChange(v), fontFamily: 'var(--font-mono)' }}>{sign(v)}</Text>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <FileTextOutlined style={{ marginRight: 8, color: ACCENT }} />
        研报 AI 摘要中心
      </Title>

      <Alert
        type="info"
        showIcon
        message="演示数据兜底（LCG 种子 20260725，结果可复现）；结论均来自研报/新闻分析引擎动态输出"
        style={{ marginBottom: 16 }}
      />

      {/* 顶部概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="研报总数" value={totalReports} prefix={<FileTextOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="覆盖股票" value={covered} prefix={<ApartmentOutlined />} suffix="只" /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="买入评级占比"
              value={(buyPct * 100).toFixed(1)}
              suffix="%"
              valueStyle={{ color: '#ef4444' }}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <div style={{ marginBottom: 4 }}><Text type="secondary">一致目标价上行空间最大</Text></div>
            {topUpside ? (
              <Tooltip title={`一致目标价 ${topUpside.avgTargetPrice.toFixed(2)} · 现价 ${topUpside.currentPrice.toFixed(2)}`}>
                <div>
                  <Text strong style={{ fontSize: 16 }}>{stockNameMap[topUpside.ticker]}</Text>
                  <Text style={{ color: '#ef4444', marginLeft: 8, fontWeight: 600 }}>{sign(topUpside.avgUpside)}</Text>
                </div>
              </Tooltip>
            ) : <Text type="secondary">—</Text>}
          </Card>
        </Col>
      </Row>

      {/* 机构共识 */}
      <Card
        title={<><FundOutlined style={{ marginRight: 6, color: ACCENT }} />机构共识（逐股票聚合）</>}
        extra={<Tag color="blue">{consensusList.length} 只股票</Tag>}
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={consensusColumns}
          dataSource={consensusList}
          rowKey="ticker"
          size="small"
          pagination={false}
          rowClassName={(r) => (dividedTickers.has(r.ticker) ? 'row-divided' : '')}
          scroll={{ x: 860 }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          边框高亮为分歧最大个股（findMostDivided 输出）；上行空间 =（一致目标价 − 现价）/ 现价。
        </Text>
      </Card>

      {/* 评级变动追踪 */}
      <Card
        title={<><AlertOutlined style={{ marginRight: 6, color: ACCENT }} />评级变动追踪</>}
        extra={<Tag color={ratingChanges.length ? 'blue' : 'default'}>{ratingChanges.length} 条变动</Tag>}
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={changeColumns}
          dataSource={ratingChanges}
          rowKey={(r) => `${r.ticker}-${r.broker}-${r.date}`}
          size="small"
          pagination={{ pageSize: 6, size: 'small' }}
          scroll={{ x: 760 }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          上调（红）/ 下调（绿）由 trackRatingChanges 依据同一机构前后评级变化推导。
        </Text>
      </Card>

      {/* AI 研报摘要 */}
      <Card
        title={<><RadarChartOutlined style={{ marginRight: 6, color: ACCENT }} />AI 研报摘要</>}
        style={{ marginBottom: 16 }}
        extra={
          <Select
            value={selectedTicker}
            onChange={setSelectedTicker}
            style={{ width: 180 }}
            options={consensusList.map((c) => ({ value: c.ticker, label: `${stockNameMap[c.ticker] ?? c.ticker} ${c.ticker}` }))}
          />
        }
      >
        {sentimentAgg && selectedConsensus ? (
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <ReactECharts echarts={echarts} option={gaugeOption} style={{ height: 200 }} />
            </Col>
            <Col xs={24} md={16}>
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col span={8}>
                  <Statistic title="综合情绪分" value={sentimentAgg.avg.toFixed(2)} valueStyle={{ color: getColorByChange(sentimentAgg.avg) }} />
                </Col>
                <Col span={8}>
                  <Statistic title="一致目标价" value={selectedConsensus.avgTargetPrice.toFixed(2)} />
                </Col>
                <Col span={8}>
                  <Statistic title="上行空间" value={sign(selectedConsensus.avgUpside)} valueStyle={{ color: getColorByChange(selectedConsensus.avgUpside) }} />
                </Col>
              </Row>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>看多关键词（{sentimentAgg.bull.length}）</Text>
                  <div style={{ marginTop: 4 }}>
                    {sentimentAgg.bull.length ? sentimentAgg.bull.map((k) => <Tag key={k} color="red" style={{ marginBottom: 4 }}>{k}</Tag>) : <Text type="secondary">—</Text>}
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>看空关键词（{sentimentAgg.bear.length}）</Text>
                  <div style={{ marginTop: 4 }}>
                    {sentimentAgg.bear.length ? sentimentAgg.bear.map((k) => <Tag key={k} color="green" style={{ marginBottom: 4 }}>{k}</Tag>) : <Text type="secondary">—</Text>}
                  </div>
                </div>
                <div style={{ background: '#1a1a1a', border: '1px solid #303030', borderRadius: 6, padding: '8px 12px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>最新研报论点（{sentimentAgg.latest.broker} · {sentimentAgg.latest.date}）</Text>
                  <div style={{ marginTop: 4 }}><Text>{sentimentAgg.latest.summary}</Text></div>
                </div>
              </Space>
            </Col>
          </Row>
        ) : (
          <Text type="secondary">暂无该股票研报数据</Text>
        )}
      </Card>

      {/* 新闻事件情绪 */}
      <Card title={<><AlertOutlined style={{ marginRight: 6, color: ACCENT }} />新闻事件情绪</>}>
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Text type="secondary" style={{ fontSize: 12 }}>情绪分布（{news.length} 条新闻 · analyzeSentiment）</Text>
            <ReactECharts echarts={echarts} option={pieOption} style={{ height: 240 }} />
          </Col>
          <Col xs={24} md={14}>
            <Text type="secondary" style={{ fontSize: 12 }}>新闻热度榜（analyzeNewsHeat · 按热度降序）</Text>
            <ReactECharts echarts={echarts} option={heatOption} style={{ height: 240 }} />
          </Col>
        </Row>
        <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            买入机会信号 <Text style={{ color: '#ef4444' }}>{newsAnalysis.summary.buyOpportunities}</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            卖出预警 <Text style={{ color: '#22c55e' }}>{newsAnalysis.summary.sellWarnings}</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            最热类别 <Text strong>{CAT_LABEL[newsAnalysis.summary.hottestCategory ?? ''] ?? newsAnalysis.summary.hottestCategory ?? '—'}</Text>
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default ReportCenterPage;
