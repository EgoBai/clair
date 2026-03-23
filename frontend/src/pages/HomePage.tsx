/**
 * 首页
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Tag, Space, Divider } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  StockOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { apiService } from '../services/api';
import MarketOverview from '../components/Market/MarketOverview';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { marketSummary, setMarketSummary, stocks, setStocks, loading, setLoading } = useAppStore();
  const [topGainers, setTopGainers] = useState<any[]>([]);
  const [topLosers, setTopLosers] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, stocksRes, gainersRes, losersRes] = await Promise.all([
        apiService.getMarketSummary().catch(() => ({ success: false, data: null })),
        apiService.getStocks({ pageSize: 12 }).catch(() => ({ success: false, data: { stocks: [] } })),
        apiService.getTopGainers(undefined, 5).catch(() => ({ success: false, data: { topGainers: [] } })),
        apiService.getTopLosers(undefined, 5).catch(() => ({ success: false, data: { topLosers: [] } })),
      ]);

      if (summaryRes.success) setMarketSummary(summaryRes.data);
      if (stocksRes.success) setStocks(stocksRes.data.stocks);
      if (gainersRes.success) setTopGainers(gainersRes.data.topGainers);
      if (losersRes.success) setTopLosers(losersRes.data.topLosers);
    } catch (error) {
      console.error('加载首页数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMarketCap = (cap: number) => {
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
    if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
    return cap.toString();
  };

  return (
    <div style={{ padding: '16px' }}>
      <Spin spinning={loading}>
        {/* 欢迎区域 */}
        <Card
          style={{
            marginBottom: 16,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
          }}
        >
          <div style={{ color: '#fff', textAlign: 'center', padding: '20px 0' }}>
            <h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>
              📈 A股行情分析平台
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>
              实时行情 · 技术分析 · 智能选股
            </p>
          </div>
        </Card>

        {/* 市场概况统计 */}
        {marketSummary && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="总股票数"
                  value={marketSummary.totalStocks}
                  prefix={<StockOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="总市值"
                  value={formatMarketCap(marketSummary.totalMarketCap)}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="上涨"
                  value={marketSummary.risingStocks}
                  valueStyle={{ color: '#ef4444' }}
                  prefix={<RiseOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="下跌"
                  value={marketSummary.fallingStocks}
                  valueStyle={{ color: '#22c55e' }}
                  prefix={<FallOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 涨跌榜 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <ArrowUpOutlined style={{ color: '#ef4444' }} />
                  <span>涨幅榜 TOP5</span>
                </Space>
              }
              size="small"
              extra={<a onClick={() => navigate('/market')}>更多</a>}
            >
              {topGainers.map((stock, index) => (
                <div
                  key={stock.symbol}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < topGainers.length - 1 ? '1px solid #f0f0f0' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <Space>
                    <Tag color={index < 3 ? 'red' : 'orange'}>{index + 1}</Tag>
                    <span style={{ fontWeight: 500 }}>{stock.name}</span>
                    <span style={{ color: '#999', fontSize: 12 }}>{stock.symbol}</span>
                  </Space>
                  <Tag color="red">+{stock.changePercent?.toFixed(2)}%</Tag>
                </div>
              ))}
              {topGainers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>
              )}
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <ArrowDownOutlined style={{ color: '#22c55e' }} />
                  <span>跌幅榜 TOP5</span>
                </Space>
              }
              size="small"
              extra={<a onClick={() => navigate('/market')}>更多</a>}
            >
              {topLosers.map((stock, index) => (
                <div
                  key={stock.symbol}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < topLosers.length - 1 ? '1px solid #f0f0f0' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                >
                  <Space>
                    <Tag color={index < 3 ? 'green' : 'cyan'}>{index + 1}</Tag>
                    <span style={{ fontWeight: 500 }}>{stock.name}</span>
                    <span style={{ color: '#999', fontSize: 12 }}>{stock.symbol}</span>
                  </Space>
                  <Tag color="green">{stock.changePercent?.toFixed(2)}%</Tag>
                </div>
              ))}
              {topLosers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 热门股票 */}
        <Card
          title="热门股票"
          size="small"
          extra={<a onClick={() => navigate('/stocks')}>查看全部</a>}
        >
          <Row gutter={[12, 12]}>
            {stocks.slice(0, 12).map((stock) => (
              <Col xs={12} sm={8} md={6} lg={4} key={stock.id}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  style={{ textAlign: 'center' }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{stock.name}</div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{stock.symbol}</div>
                  {stock.latestQuote && (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 600, color: stock.latestQuote.changePercent >= 0 ? '#ef4444' : '#22c55e' }}>
                        {stock.latestQuote.closePrice?.toFixed(2)}
                      </div>
                      <Tag color={stock.latestQuote.changePercent >= 0 ? 'red' : 'green'} style={{ marginTop: 4 }}>
                        {stock.latestQuote.changePercent >= 0 ? '+' : ''}{stock.latestQuote.changePercent?.toFixed(2)}%
                      </Tag>
                    </>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
          {stocks.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
              暂无股票数据，请先执行数据同步
            </div>
          )}
        </Card>
      </Spin>
    </div>
  );
};

export default HomePage;
