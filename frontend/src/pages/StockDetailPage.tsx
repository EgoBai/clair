/**
 * 股票详情页（增强版）
 * 集成：统一K线图(K+成交量+指标)、WebSocket实时行情、骨架屏
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Statistic, Tag, Space, Tabs,
  Button, message, Breadcrumb, Tooltip, Radio, Badge
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
  StarOutlined, StarFilled, HomeOutlined, WifiOutlined, DisconnectOutlined
} from '@ant-design/icons';
import KLineChart, { KLineData } from '../components/Charts/KLineChart';
import TechnicalIndicatorChart from '../components/Charts/TechnicalIndicatorChart';
import { StockDetailSkeleton } from '../components/Common/Skeletons';
import { apiService } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { useRealtimeQuote, useConnectionStatus } from '../hooks/useWebSocket';

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useAppStore();

  const [stock, setStock] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [indicators, setIndicators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subIndicator, setSubIndicator] = useState<'volume' | 'macd' | 'kdj' | 'rsi' | 'none'>('volume');

  // WebSocket 实时行情
  const { quote: wsQuote, stale: wsStale } = useRealtimeQuote(symbol);
  const wsStatus = useConnectionStatus();

  const isInWatchlist = watchlist.some((s) => s.symbol === symbol);

  useEffect(() => {
    if (symbol) loadStockData();
  }, [symbol]);

  // WS行情覆盖静态数据
  useEffect(() => {
    if (wsQuote) {
      setQuote((prev: any) => prev ? {
        ...prev,
        closePrice: wsQuote.currentPrice,
        change: wsQuote.change,
        changePercent: wsQuote.changePercent,
        volume: wsQuote.volume ?? prev.volume,
        turnover: wsQuote.turnover ?? prev.turnover,
      } : prev);
    }
  }, [wsQuote]);

  const loadStockData = async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const [stockRes, quotesRes, indicatorRes] = await Promise.all([
        apiService.getStock(symbol).catch(() => null),
        apiService.getStockQuotes(symbol, { limit: 120 }).catch(() => null),
        apiService.get(`/indicators/${symbol}`).catch(() => null),
      ]);

      if (stockRes?.success) {
        setStock(stockRes.data);
        setQuote(stockRes.data.latestQuote);
      }
      if (quotesRes?.success) {
        const klines: KLineData[] = quotesRes.data.quotes.map((q: any) => ({
          tradeDate: q.tradeDate?.split('T')[0] || q.trade_date?.split('T')[0],
          open: q.openPrice ?? q.open_price,
          close: q.closePrice ?? q.close_price,
          high: q.highPrice ?? q.high_price,
          low: q.lowPrice ?? q.low_price,
          volume: q.volume,
          turnover: q.turnover,
        })).reverse();
        setKlineData(klines);
      }
      if (indicatorRes?.success) {
        setIndicators(indicatorRes.data.indicators || []);
      }
    } catch (error) {
      console.error('加载股票详情失败:', error);
      message.error('加载股票详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWatchlist = useCallback(() => {
    if (!stock) return;
    if (isInWatchlist) {
      removeFromWatchlist(symbol!);
      message.success('已从自选股移除');
    } else {
      addToWatchlist({ ...stock, latestQuote: quote });
      message.success('已添加到自选股');
    }
  }, [stock, isInWatchlist, symbol, quote]);

  const formatMarketCap = (cap?: number) => {
    if (!cap) return '-';
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
    if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
    return cap.toString();
  };

  const formatVolume = (vol?: number) => {
    if (!vol) return '-';
    if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿股`;
    if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万股`;
    return `${vol}股`;
  };

  const formatTurnover = (turnover?: number) => {
    if (!turnover) return '-';
    if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
    if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
    return turnover.toString();
  };

  const changePercent = quote?.changePercent ?? 0;
  const changeColor = changePercent >= 0 ? '#ef4444' : '#22c55e';

  if (loading && !stock) {
    return <StockDetailSkeleton />;
  }

  return (
    <div style={{ padding: '16px' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/')}><HomeOutlined /> 首页</a> },
          { title: <a onClick={() => navigate('/stocks')}>股票列表</a> },
          { title: symbol },
        ]}
      />

      {/* 股票基本信息 */}
      <Card
        title={
          <Space>
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              {stock?.name || symbol}
            </span>
            {stock && <Tag color="blue">{stock.symbol}</Tag>}
            {stock?.industry && <Tag>{stock.industry}</Tag>}
            {/* WS状态 */}
            {wsStatus === 'connected' ? (
              <Tooltip title="实时推送中">
                <Badge status={wsStale ? 'warning' : 'success'} text={
                  <WifiOutlined style={{ fontSize: 12, color: wsStale ? '#faad14' : '#52c41a' }} />
                } />
              </Tooltip>
            ) : (
              <Tooltip title="未连接">
                <DisconnectOutlined style={{ fontSize: 12, color: '#ccc' }} />
              </Tooltip>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={isInWatchlist ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              onClick={handleToggleWatchlist}
              size="small"
            >
              {isInWatchlist ? '已自选' : '加自选'}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadStockData} size="small" loading={loading}>
              刷新
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {quote && (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic
                title="当前价格"
                value={quote.closePrice}
                precision={2}
                valueStyle={{ fontSize: 28, color: changeColor }}
                prefix={changePercent >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              />
              <Space style={{ marginTop: 8 }}>
                <Tag color={changePercent >= 0 ? 'red' : 'green'}>
                  {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)}
                </Tag>
                <Tag color={changePercent >= 0 ? 'red' : 'green'}>
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                </Tag>
                {wsQuote && (
                  <Tag color="processing" style={{ fontSize: 10 }}>实时</Tag>
                )}
              </Space>
            </Col>
            <Col xs={24} md={16}>
              <Descriptions column={{ xs: 2, sm: 3, md: 4 }} size="small">
                <Descriptions.Item label="今开">
                  <span style={{ color: changeColor }}>{quote.openPrice?.toFixed(2)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="最高">
                  <span style={{ color: '#ef4444' }}>{quote.highPrice?.toFixed(2)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="最低">
                  <span style={{ color: '#22c55e' }}>{quote.lowPrice?.toFixed(2)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="成交量">{formatVolume(quote.volume)}</Descriptions.Item>
                <Descriptions.Item label="成交额">{formatTurnover(quote.turnover)}</Descriptions.Item>
                <Descriptions.Item label="换手率">{quote.turnoverRate?.toFixed(2) ?? '-'}%</Descriptions.Item>
                <Descriptions.Item label="市盈率">{quote.peRatio?.toFixed(2) ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="市净率">{quote.pbRatio?.toFixed(2) ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="总市值">{formatMarketCap(quote.marketCap)}</Descriptions.Item>
                <Descriptions.Item label="流通市值">{formatMarketCap(quote.circulatingMarketCap)}</Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        )}
        {!quote && !loading && (
          <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无行情数据</div>
        )}
      </Card>

      {/* 统一K线图：K+成交量/指标 */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <Radio.Group
            value={subIndicator}
            onChange={(e) => setSubIndicator(e.target.value)}
            size="small"
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="volume">成交量</Radio.Button>
            <Radio.Button value="macd">MACD</Radio.Button>
            <Radio.Button value="kdj">KDJ</Radio.Button>
            <Radio.Button value="rsi">RSI</Radio.Button>
            <Radio.Button value="none">仅K线</Radio.Button>
          </Radio.Group>
        }
      >
        <KLineChart
          data={klineData}
          title={stock ? `${stock.name} (${stock.symbol})` : 'K线图'}
          height={500}
          showMA
          showEMA
          subIndicator={subIndicator}
          indicatorData={indicators}
          loading={loading}
        />
      </Card>

      {/* 独立指标图（详细视图） */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Tabs
          size="small"
          items={[
            {
              key: 'macd',
              label: 'MACD 详情',
              children: (
                <TechnicalIndicatorChart
                  data={indicators} type="macd" title="MACD" height={300} loading={loading}
                />
              ),
            },
            {
              key: 'kdj',
              label: 'KDJ 详情',
              children: (
                <TechnicalIndicatorChart
                  data={indicators} type="kdj" title="KDJ" height={300} loading={loading}
                />
              ),
            },
            {
              key: 'rsi',
              label: 'RSI 详情',
              children: (
                <TechnicalIndicatorChart
                  data={indicators} type="rsi" title="RSI" height={300} loading={loading}
                />
              ),
            },
            {
              key: 'boll',
              label: '布林带 详情',
              children: (
                <TechnicalIndicatorChart
                  data={indicators} type="boll" title="布林带" height={300} loading={loading}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 基本信息 */}
      {stock && (
        <Card title="基本信息" size="small">
          <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
            <Descriptions.Item label="股票代码">{stock.symbol}</Descriptions.Item>
            <Descriptions.Item label="股票名称">{stock.name}</Descriptions.Item>
            <Descriptions.Item label="交易所">
              {stock.market === 'SH' ? '上海证券交易所' : stock.market === 'SZ' ? '深圳证券交易所' : stock.market}
            </Descriptions.Item>
            <Descriptions.Item label="行业">{stock.industry || '-'}</Descriptions.Item>
            <Descriptions.Item label="上市日期">{stock.listingDate || '-'}</Descriptions.Item>
            <Descriptions.Item label="总股本">{stock.totalShares ? formatVolume(stock.totalShares) : '-'}</Descriptions.Item>
            <Descriptions.Item label="流通股本">{stock.circulatingShares ? formatVolume(stock.circulatingShares) : '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
};

export default StockDetailPage;
