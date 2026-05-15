/**
 * 指数详情页 — 富途/同花顺风格
 * 显示指数K线图、技术指标、成分股涨跌榜
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Tag, Typography, Empty, Card, Statistic, Segmented } from 'antd';
import { ArrowLeftOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';

const { Title, Text } = Typography;

const BG = '#f5f5f5';
const CARD_BG = '#ffffff';
const TEXT = '#1e293b';
const TEXT_SEC = '#64748b';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const ACCENT = '#3b82f6';

interface IndexDetail {
  symbol: string; name: string; displaySymbol: string;
  closePrice: number; changePercent: number; volume: number; turnover: number;
  highPrice: number; lowPrice: number; openPrice: number;
  topGainers: any[]; topLosers: any[];
}

interface KLineQuote {
  tradeDate: string; openPrice: number; closePrice: number;
  highPrice: number; lowPrice: number; volume: number;
}

interface StrategyData {
  symbol: string; name?: string; currentPrice: number; changePercent: number;
  score?: number; position?: string; positionPct?: number;
  stopLoss?: number; takeProfit?: number;
  maAlignment?: string; crossover?: string; macdSignal?: string;
  rsi?: number; supportLevel?: number; resistanceLevel?: number;
  summary?: string; note?: string;
}

const IndexDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<IndexDetail | null>(null);
  const [kline, setKline] = useState<KLineQuote[]>([]);
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<string>('candlestick');

  useEffect(() => {
    if (!symbol) return;
    (async () => {
      setLoading(true);
      const apiBase = '/api/index';
      const [dRes, kRes, sRes] = await Promise.all([
        fetch(`${apiBase}/${symbol}`).then(r => r.json()).catch(() => null),
        fetch(`${apiBase}/${symbol}/kline`).then(r => r.json()).catch(() => null),
        fetch(`${apiBase}/${symbol}/strategy`).then(r => r.json()).catch(() => null),
      ]);
      if (dRes?.data) setDetail(dRes.data);
      if (kRes?.data?.quotes) setKline(kRes.data.quotes);
      if (sRes?.data) setStrategy(sRes.data);
      setLoading(false);
    })();
  }, [symbol]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!detail) return <div style={{ padding: 40, textAlign: 'center' }}><Empty description="指数数据不可用" /></div>;

  const up = detail.changePercent >= 0;
  const changeColor = up ? COLOR_UP : COLOR_DOWN;

  // K-line chart option
  const klineDates = kline.map(q => q.tradeDate);
  const klineValues = kline.map(q => [q.openPrice, q.closePrice, q.lowPrice, q.highPrice]);

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: { left: '3%', right: '3%', top: 20, bottom: 40 },
    xAxis: { type: 'category', data: klineDates, axisLabel: { fontSize: 10, color: '#94a3b8' }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{
      type: 'candlestick',
      data: klineValues,
      itemStyle: { color: COLOR_UP, color0: COLOR_DOWN, borderColor: COLOR_UP, borderColor0: COLOR_DOWN },
      markLine: {
        silent: true,
        symbol: 'none',
        label: { fontSize: 10 },
        data: strategy?.supportLevel && strategy?.resistanceLevel ? [
          { yAxis: strategy.supportLevel, lineStyle: { color: '#22c55e', type: 'dashed', width: 1 }, label: { formatter: `支撑 ${strategy.supportLevel.toFixed(1)}` } },
          { yAxis: strategy.resistanceLevel, lineStyle: { color: '#ef4444', type: 'dashed', width: 1 }, label: { formatter: `压力 ${strategy.resistanceLevel.toFixed(1)}` } },
        ] : [],
      },
    }],
  };

  const formatBig = (n: number) => n >= 1e12 ? (n / 1e12).toFixed(2) + '万亿' : n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <ArrowLeftOutlined style={{ cursor: 'pointer', color: TEXT_SEC, fontSize: 18 }} onClick={() => navigate(-1)} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <Title level={3} style={{ margin: 0, color: TEXT, fontWeight: 700 }}>{detail.name}</Title>
              <Text style={{ color: TEXT_SEC, fontSize: 13, fontFamily: 'monospace' }}>{detail.displaySymbol}</Text>
            </div>
          </div>
        </div>

        {/* Price Card */}
        <Card style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: TEXT, fontFamily: 'monospace', lineHeight: 1.1 }}>
                {detail.closePrice.toFixed(2)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: changeColor, marginTop: 4, fontFamily: 'monospace' }}>
                {up ? '+' : ''}{detail.changePercent.toFixed(2)}%
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: TEXT_SEC }}>
              <div>开盘 <span style={{ color: TEXT, fontWeight: 600 }}>{detail.openPrice.toFixed(2)}</span></div>
              <div>最高 <span style={{ color: COLOR_UP, fontWeight: 600 }}>{detail.highPrice.toFixed(2)}</span></div>
              <div>最低 <span style={{ color: COLOR_DOWN, fontWeight: 600 }}>{detail.lowPrice.toFixed(2)}</span></div>
              <div>成交额 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBig(detail.turnover)}</span></div>
              <div>成交量 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBig(detail.volume)}手</span></div>
            </div>
          </div>
        </Card>

        {/* K-line Chart */}
        {kline.length > 0 && (
          <Card
            title={<span style={{ fontWeight: 600 }}>K线图</span>}
            style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <ReactECharts option={chartOption} style={{ height: 400 }} />
          </Card>
        )}

        {/* Strategy Card */}
        {strategy && strategy.score !== undefined && (
          <Card
            title={<span style={{ fontWeight: 600 }}>技术分析</span>}
            style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
              <Statistic title="综合评分" value={strategy.score} suffix="/100"
                valueStyle={{ color: strategy.score >= 60 ? COLOR_UP : strategy.score >= 40 ? '#f59e0b' : COLOR_DOWN, fontSize: 24 }} />
              <Statistic title="仓位建议" value={strategy.position || '-'}
                valueStyle={{ fontSize: 20 }} />
              <Statistic title="建议仓位" value={strategy.positionPct !== undefined ? `${strategy.positionPct}%` : '-'}
                valueStyle={{ fontSize: 20 }} />
              {strategy.rsi !== null && strategy.rsi !== undefined && (
                <Statistic title="RSI(14)" value={strategy.rsi.toFixed(1)}
                  valueStyle={{ color: strategy.rsi > 70 ? COLOR_UP : strategy.rsi < 30 ? COLOR_DOWN : TEXT, fontSize: 20 }} />
              )}
            </div>
            {(strategy.supportLevel || strategy.resistanceLevel) && (
              <div style={{ marginTop: 12, display: 'flex', gap: 24 }}>
                {strategy.supportLevel && <Tag color="green">支撑位 {strategy.supportLevel.toFixed(2)}</Tag>}
                {strategy.resistanceLevel && <Tag color="red">压力位 {strategy.resistanceLevel.toFixed(2)}</Tag>}
                {strategy.stopLoss && <Tag color="orange">止损 {strategy.stopLoss.toFixed(2)}</Tag>}
                {strategy.takeProfit && <Tag color="blue">止盈 {strategy.takeProfit.toFixed(2)}</Tag>}
              </div>
            )}
            {strategy.summary && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: TEXT, lineHeight: 1.7 }}>
                {strategy.summary}
              </div>
            )}
          </Card>
        )}

        {/* Top Gainers / Losers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {detail.topGainers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_UP }}><RiseOutlined /> 领涨成分股</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topGainers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 9 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT }}>{s.name}</span>
                  <span style={{ color: COLOR_UP, fontWeight: 600, fontFamily: 'monospace' }}>+{s.changePercent.toFixed(2)}%</span>
                </div>
              ))}
            </Card>
          )}
          {detail.topLosers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_DOWN }}><FallOutlined /> 领跌成分股</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topLosers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 9 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT }}>{s.name}</span>
                  <span style={{ color: COLOR_DOWN, fontWeight: 600, fontFamily: 'monospace' }}>{s.changePercent.toFixed(2)}%</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndexDetailPage;
