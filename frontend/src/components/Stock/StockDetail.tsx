/**
 * 股票详情页组件
 * 展示单只股票的详细信息、K线图、技术指标
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Descriptions,
  Statistic,
  Space,
  Tag,
  Tabs,
  Button,
  Spin,
  message,
} from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import KLineChart, { KLineData } from '../Charts/KLineChart';
import VolumeChart, { VolumeData } from '../Charts/VolumeChart';

interface StockInfo {
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  listingDate?: string;
  totalShares?: number;
  circulatingShares?: number;
}

interface StockQuote {
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
  circulatingMarketCap?: number;
}

interface StockDetailProps {
  stock?: StockInfo;
  symbol?: string;
  quote?: StockQuote;
  klineData?: KLineData[];
  loading?: boolean;
  onRefresh?: () => void;
}

const StockDetail: React.FC<StockDetailProps> = ({
  stock,
  symbol,
  quote,
  klineData = [],
  loading = false,
  onRefresh,
}) => {
  // Support both stock object and symbol string
  const stockSymbol = stock?.symbol || symbol || '';
  const stockInfo: StockInfo = stock || { symbol: stockSymbol, name: stockSymbol, market: 'SH' };
  const [activeTab, setActiveTab] = useState('kline');

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

  const changeColor = quote?.changePercent ?? 0 >= 0 ? '#ef4444' : '#22c55e';

  // 准备成交量图数据
  const volumeData: VolumeData[] = klineData.map((d) => ({
    tradeDate: d.tradeDate,
    volume: d.volume,
    turnover: d.turnover,
    changePercent:
      d.open > 0 ? ((d.close - d.open) / d.open) * 100 : 0,
  }));

  const tabItems = [
    {
      key: 'kline',
      label: '日K',
      children: (
        <KLineChart
          data={klineData}
          title={`${stockInfo.name} (${stockInfo.symbol})`}
          height={450}
          loading={loading}
        />
      ),
    },
    {
      key: 'week',
      label: '周K',
      children: (
        <KLineChart
          data={klineData} // 实际应使用周K数据
          title={`${stockInfo.name} - 周K`}
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
          title={`${stockInfo.name} - 成交量`}
          height={350}
          showTurnover={true}
          loading={loading}
        />
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        {/* 股票基本信息和行情 */}
        <Col span={24}>
          <Card
            title={
              <Space>
                <span style={{ fontSize: 18, fontWeight: 600 }}>
                  {stockInfo.name}
                </span>
                <Tag color="blue">{stockInfo.symbol}</Tag>
                {stockInfo.industry && <Tag>{stockInfo.industry}</Tag>}
              </Space>
            }
            extra={
              <Button
                icon={<ReloadOutlined />}
                onClick={onRefresh}
                size="small"
              >
                刷新
              </Button>
            }
          >
            {quote && (
              <Row gutter={24}>
                <Col xs={24} md={8}>
                  <Statistic
                    title="当前价格"
                    value={quote.closePrice}
                    precision={2}
                    valueStyle={{ fontSize: 28, color: changeColor }}
                    prefix={
                      quote.changePercent >= 0 ? (
                        <ArrowUpOutlined />
                      ) : (
                        <ArrowDownOutlined />
                      )
                    }
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Tag color={quote.changePercent >= 0 ? 'red' : 'green'}>
                      {quote.change >= 0 ? '+' : ''}
                      {quote.change.toFixed(2)}
                    </Tag>
                    <Tag color={quote.changePercent >= 0 ? 'red' : 'green'}>
                      {quote.changePercent >= 0 ? '+' : ''}
                      {quote.changePercent.toFixed(2)}%
                    </Tag>
                  </Space>
                </Col>
                <Col xs={24} md={16}>
                  <Descriptions column={{ xs: 2, sm: 3, md: 4 }} size="small">
                    <Descriptions.Item label="今开">
                      <span style={{ color: changeColor }}>
                        {quote.openPrice.toFixed(2)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="最高">
                      <span style={{ color: '#ef4444' }}>
                        {quote.highPrice.toFixed(2)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="最低">
                      <span style={{ color: '#22c55e' }}>
                        {quote.lowPrice.toFixed(2)}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="成交量">
                      {formatVolume(quote.volume)}
                    </Descriptions.Item>
                    <Descriptions.Item label="成交额">
                      {formatTurnover(quote.turnover)}
                    </Descriptions.Item>
                    <Descriptions.Item label="换手率">
                      {quote.turnoverRate?.toFixed(2) ?? '-'}%
                    </Descriptions.Item>
                    <Descriptions.Item label="市盈率">
                      {quote.peRatio?.toFixed(2) ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="市净率">
                      {quote.pbRatio?.toFixed(2) ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="总市值">
                      {formatMarketCap(quote.marketCap)}
                    </Descriptions.Item>
                    <Descriptions.Item label="流通市值">
                      {formatMarketCap(quote.circulatingMarketCap)}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            )}
          </Card>
        </Col>

        {/* K线图 */}
        <Col span={24}>
          <Card size="small">
            <Tabs
              items={tabItems}
              activeKey={activeTab}
              onChange={setActiveTab}
              size="small"
            />
          </Card>
        </Col>

        {/* 股票基本信息 */}
        <Col span={24}>
          <Card title="基本信息" size="small">
            <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small">
              <Descriptions.Item label="股票代码">
                {stockInfo.symbol}
              </Descriptions.Item>
              <Descriptions.Item label="股票名称">
                {stockInfo.name}
              </Descriptions.Item>
              <Descriptions.Item label="交易所">
                {stockInfo.market === 'SH'
                  ? '上海证券交易所'
                  : stockInfo.market === 'SZ'
                  ? '深圳证券交易所'
                  : stockInfo.market}
              </Descriptions.Item>
              <Descriptions.Item label="行业">
                {stockInfo.industry || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="上市日期">
                {stockInfo.listingDate || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="总股本">
                {stockInfo.totalShares
                  ? formatVolume(stockInfo.totalShares)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="流通股本">
                {stockInfo.circulatingShares
                  ? formatVolume(stockInfo.circulatingShares)
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default StockDetail;
