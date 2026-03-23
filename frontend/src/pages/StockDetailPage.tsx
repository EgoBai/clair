/**
 * 股票详情页
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Descriptions, Statistic, Tag, Space, Tabs,
  Button, Spin, message, Breadcrumb
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
  StarOutlined, StarFilled, HomeOutlined
} from '@ant-design/icons';
import KLineChart, { KLineData } from '../components/Charts/KLineChart';
import VolumeChart, { VolumeData } from '../components/Charts/VolumeChart';
import TechnicalIndicatorChart from '../components/Charts/TechnicalIndicatorChart';
import { apiService } from '../services/api';
import { useAppStore } from '../store/useAppStore';

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useAppStore();

  const [stock, setStock] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [indicators, setIndicators] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('kline');

  const isInWatchlist = watchlist.some((s) => s.symbol === symbol);

  useEffect(() => {
    if (symbol) {
      loadStockData();
    }
  }, [symbol]);

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

  const handleToggleWatchlist = async () => {
    if (!stock) return;
    if (isInWatchlist) {
      removeFromWatchlist(symbol!);
      message.success('已从自选股移除');
    } else {
      addToWatchlist({
        ...stock,
        latestQuote: quote,
      });
      message.success('已添加到自选股');
    }
  };

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

  // 成交量数据
  const volumeData: VolumeData[] = klineData.map((d) => ({
    tradeDate: d.tradeDate,
    volume: d.volume,
    turnover: d.turnover,
    changePercent: d.open > 0 ? ((d.close - d.open) / d.open) * 100 : 0,
  }));

  const tabItems = [
    {
      key: 'kline',
      label: '日K',
      children: (
        <KLineChart
          data={klineData}
          title={stock ? `${stock.name} (${stock.symbol})` : 'K线图'}
          height={450}
          loading={loading}
        />
      ),
    },
    {
      key: 'volume',
      label: '成交量',
      children: (
        <VolumeChart
          data={volumeData}
          title={stock ? `${stock.name} - 成交量` : '成交量'}
          height={350}
          showTurnover
          loading={loading}
        />
      ),
    },
    {
      key: 'macd',
      label: 'MACD',
      children: (
        <TechnicalIndicatorChart
          data={indicators}
          type="macd"
          title="MACD"
          height={350}
          loading={loading}
        />
      ),
    },
    {
      key: 'kdj',
      label: 'KDJ',
      children: (
        <TechnicalIndicatorChart
          data={indicators}
          type="kdj"
          title="KDJ"
          height={350}
          loading={loading}
        />
      ),
    },
    {
      key: 'rsi',
      label: 'RSI',
      children: (
        <TechnicalIndicatorChart
          data={indicators}
          type="rsi"
          title="RSI"
          height={350}
          loading={loading}
        />
      ),
    },
    {
      key: 'boll',
      label: '布林带',
      children: (
        <TechnicalIndicatorChart
          data={indicators}
          type="boll"
          title="布林带"
          height={350}
          loading={loading}
        />
      ),
    },
  ];

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

      <Spin spinning={loading}>
        {/* 股票基本信息 */}
        <Card
          title={
            <Space>
              <span style={{ fontSize: 18, fontWeight: 600 }}>
                {stock?.name || symbol}
              </span>
              {stock && <Tag color="blue">{stock.symbol}</Tag>}
              {stock?.industry && <Tag>{stock.industry}</Tag>}
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
              <Button icon={<ReloadOutlined />} onClick={loadStockData} size="small">
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

        {/* K线和技术指标图表 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} size="small" />
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
      </Spin>
    </div>
  );
};

export default StockDetailPage;
