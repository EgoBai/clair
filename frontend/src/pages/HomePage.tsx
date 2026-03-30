/**
 * 首页
 * 市场全景概览 - 参考同花顺/富途首页信息密度设计
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Row, Col, Statistic, Spin, Tag, Space, Divider, Tooltip, Typography, Progress } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  StockOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
  FireOutlined,
  FieldTimeOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useAppStore } from '../store/useAppStore';
import { apiService } from '../services/api';

const { Title, Text } = Typography;

/** 判断当前是否为A股交易时间 */
function isMarketOpen(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();
  if (day === 0 || day === 6) return false; // 周末
  const totalMinutes = hours * 60 + minutes;
  const morningStart = 9 * 60 + 15;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;
  return (totalMinutes >= morningStart && totalMinutes <= morningEnd) ||
         (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd);
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { marketSummary, setMarketSummary, stocks, setStocks, loading, setLoading } = useAppStore();
  const [topGainers, setTopGainers] = useState<any[]>([]);
  const [topLosers, setTopLosers] = useState<any[]>([]);
  const [topTurnover, setTopTurnover] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadData();
    // 每30秒更新市场状态
    const statusTimer = setInterval(() => setMarketOpen(isMarketOpen()), 30000);
    // 交易时段自动刷新数据
    if (isMarketOpen()) {
      autoRefreshRef.current = setInterval(loadData, 60000);
    }
    return () => {
      clearInterval(statusTimer);
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, []);

  // 交易状态变化时启动/停止自动刷新
  useEffect(() => {
    if (marketOpen) {
      autoRefreshRef.current = setInterval(loadData, 60000);
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [marketOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, stocksRes, gainersRes, losersRes, turnoverRes] = await Promise.all([
        apiService.getMarketSummary().catch(() => ({ success: false, data: null })),
        apiService.getStocks({ pageSize: 12 }).catch(() => ({ success: false, data: { stocks: [] } })),
        apiService.getTopGainers(undefined, 5).catch(() => ({ success: false, data: { topGainers: [] } })),
        apiService.getTopLosers(undefined, 5).catch(() => ({ success: false, data: { topLosers: [] } })),
        apiService.getTopTurnover(undefined, 5).catch(() => ({ success: false, data: { topTurnover: [] } })),
      ]);

      if (summaryRes.success) setMarketSummary(summaryRes.data);
      if (stocksRes.success) setStocks(stocksRes.data.stocks);
      if (gainersRes.success) setTopGainers(gainersRes.data.topGainers);
      if (losersRes.success) setTopLosers(losersRes.data.topLosers);
      if (turnoverRes.success) setTopTurnover(turnoverRes.data.topTurnover);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('加载首页数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMarketCap = (cap: number) => {
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
    return cap.toString();
  };

  const formatTurnover = (turnover: number) => {
    if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
    if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
    return turnover.toString();
  };

  // 涨跌分布数据
  const riseFallRatio = marketSummary ? {
    rising: marketSummary.risingStocks,
    falling: marketSummary.fallingStocks,
    unchanged: marketSummary.unchangedStocks,
    total: marketSummary.totalStocks,
    risePercent: marketSummary.totalStocks > 0
      ? ((marketSummary.risingStocks / marketSummary.totalStocks) * 100).toFixed(1)
      : '0',
    fallPercent: marketSummary.totalStocks > 0
      ? ((marketSummary.fallingStocks / marketSummary.totalStocks) * 100).toFixed(1)
      : '0',
  } : null;

  // 涨跌分布环形图
  const pieOption = marketSummary ? {
    tooltip: { trigger: 'item', formatter: '{b}: {c}只 ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'],
      center: ['50%', '50%'],
      label: { show: false },
      data: [
        { value: marketSummary.risingStocks, name: '上涨', itemStyle: { color: '#EF4444' } },
        { value: marketSummary.fallingStocks, name: '下跌', itemStyle: { color: '#22C55E' } },
        { value: marketSummary.unchangedStocks, name: '平盘', itemStyle: { color: '#94A3B8' } },
      ],
    }],
  } : {};

  return (
    <div style={{ padding: '16px' }}>
      <Spin spinning={loading}>
        {/* 顶部标题区 */}
        <div style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>📊 市场总览</Title>
            <Space size="small" style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {lastUpdate ? `数据更新于 ${lastUpdate.toLocaleTimeString('zh-CN')}` : '加载中...'}
              </Text>
              {/* 市场交易状态指示 */}
              <Tag
                icon={marketOpen ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                color={marketOpen ? 'green' : 'default'}
                style={{ fontSize: 11, padding: '0 6px', lineHeight: '18px' }}
              >
                {marketOpen ? '交易中' : '已休市'}
              </Tag>
              {marketOpen && (
                <Tag color="blue" style={{ fontSize: 11, padding: '0 6px', lineHeight: '18px' }}>
                  自动刷新 60s
                </Tag>
              )}
            </Space>
          </div>
          <Tooltip title="刷新数据">
            <SyncOutlined
              spin={loading}
              onClick={loadData}
              style={{ fontSize: 16, cursor: 'pointer', color: '#1890ff' }}
            />
          </Tooltip>
        </div>

        {/* 核心指标区 - 第一行 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          {/* 涨跌分布卡片 */}
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, height: 80 }}>
                  {marketSummary && (
                    <ReactECharts
                      option={pieOption}
                      style={{ height: '80px', width: '80px' }}
                      notMerge
                    />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>涨跌分布</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                    <span style={{ color: '#EF4444' }}>
                      <ArrowUpOutlined /> {riseFallRatio?.rising || 0}
                    </span>
                    <span style={{ color: '#22C55E' }}>
                      <ArrowDownOutlined /> {riseFallRatio?.falling || 0}
                    </span>
                  </div>
                  {riseFallRatio && (
                    <Progress
                      percent={parseFloat(riseFallRatio.risePercent)}
                      size="small"
                      strokeColor="#EF4444"
                      trailColor="#22C55E"
                      showInfo={false}
                      style={{ marginTop: 4 }}
                    />
                  )}
                </div>
              </div>
            </Card>
          </Col>

          {/* 总市值 */}
          <Col xs={12} sm={6} md={4.5}>
            <Card size="small" style={{ height: '100%' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>总市值</span>}
                value={marketSummary ? formatMarketCap(marketSummary.totalMarketCap) : '-'}
                prefix={<DollarOutlined style={{ color: '#3B82F6' }} />}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>

          {/* 总成交额 */}
          <Col xs={12} sm={6} md={4.5}>
            <Card size="small" style={{ height: '100%' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>总成交额</span>}
                value={marketSummary ? formatTurnover(marketSummary.totalTurnover) : '-'}
                prefix={<FieldTimeOutlined style={{ color: '#8B5CF6' }} />}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>

          {/* 总股票数 */}
          <Col xs={12} sm={6} md={4.5}>
            <Card size="small" style={{ height: '100%' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>上市股票</span>}
                value={marketSummary?.totalStocks || '-'}
                prefix={<StockOutlined style={{ color: '#F59E0B' }} />}
                suffix="只"
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>

          {/* 涨跌比 */}
          <Col xs={12} sm={6} md={4.5}>
            <Card size="small" style={{ height: '100%' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>涨跌比</span>}
                value={marketSummary
                  ? `${marketSummary.risingStocks}:${marketSummary.fallingStocks}`
                  : '-'}
                prefix={<FireOutlined style={{ color: '#EF4444' }} />}
                valueStyle={{
                  fontSize: 18,
                  color: marketSummary && marketSummary.risingStocks > marketSummary.fallingStocks
                    ? '#EF4444'
                    : '#22C55E',
                }}
              />
            </Card>
          </Col>
        </Row>

        {/* 榜单区域 - 第二行 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          {/* 涨幅榜 */}
          <Col xs={24} md={8}>
            <Card
              size="small"
              title={
                <Space>
                  <ArrowUpOutlined style={{ color: '#EF4444' }} />
                  <span style={{ fontWeight: 600 }}>涨幅榜 TOP5</span>
                </Space>
              }
              extra={<a onClick={() => navigate('/market')} style={{ fontSize: 12 }}>更多 →</a>}
            >
              {topGainers.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 4px',
                    borderBottom: i < topGainers.length - 1 ? '1px solid #f5f5f5' : 'none',
                    cursor: 'pointer',
                    borderRadius: 4,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Space>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: i < 3 ? '#fff' : '#999',
                      background: i === 0 ? '#EF4444' : i === 1 ? '#F97316' : i === 2 ? '#F59E0B' : '#f0f0f0',
                    }}>
                      {i + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{stock.name}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{stock.symbol}</div>
                    </div>
                  </Space>
                  <Tag color="red" style={{ margin: 0 }}>
                    +{stock.changePercent?.toFixed(2)}%
                  </Tag>
                </div>
              ))}
              {topGainers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#ccc', padding: 20, fontSize: 13 }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>

          {/* 跌幅榜 */}
          <Col xs={24} md={8}>
            <Card
              size="small"
              title={
                <Space>
                  <ArrowDownOutlined style={{ color: '#22C55E' }} />
                  <span style={{ fontWeight: 600 }}>跌幅榜 TOP5</span>
                </Space>
              }
              extra={<a onClick={() => navigate('/market')} style={{ fontSize: 12 }}>更多 →</a>}
            >
              {topLosers.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 4px',
                    borderBottom: i < topLosers.length - 1 ? '1px solid #f5f5f5' : 'none',
                    cursor: 'pointer',
                    borderRadius: 4,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Space>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: i < 3 ? '#fff' : '#999',
                      background: i === 0 ? '#22C55E' : i === 1 ? '#10B981' : i === 2 ? '#14B8A6' : '#f0f0f0',
                    }}>
                      {i + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{stock.name}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{stock.symbol}</div>
                    </div>
                  </Space>
                  <Tag color="green" style={{ margin: 0 }}>
                    {stock.changePercent?.toFixed(2)}%
                  </Tag>
                </div>
              ))}
              {topLosers.length === 0 && (
                <div style={{ textAlign: 'center', color: '#ccc', padding: 20, fontSize: 13 }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>

          {/* 成交额榜 */}
          <Col xs={24} md={8}>
            <Card
              size="small"
              title={
                <Space>
                  <FieldTimeOutlined style={{ color: '#8B5CF6' }} />
                  <span style={{ fontWeight: 600 }}>成交额榜 TOP5</span>
                </Space>
              }
              extra={<a onClick={() => navigate('/market')} style={{ fontSize: 12 }}>更多 →</a>}
            >
              {topTurnover.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 4px',
                    borderBottom: i < topTurnover.length - 1 ? '1px solid #f5f5f5' : 'none',
                    cursor: 'pointer',
                    borderRadius: 4,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Space>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: i < 3 ? '#fff' : '#999',
                      background: i === 0 ? '#8B5CF6' : i === 1 ? '#A78BFA' : i === 2 ? '#C4B5FD' : '#f0f0f0',
                    }}>
                      {i + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{stock.name}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{stock.symbol}</div>
                    </div>
                  </Space>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#8B5CF6',
                  }}>
                    {formatTurnover(stock.turnover)}
                  </span>
                </div>
              ))}
              {topTurnover.length === 0 && (
                <div style={{ textAlign: 'center', color: '#ccc', padding: 20, fontSize: 13 }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 热门股票网格 - Bloomberg Terminal 风格信息密度 */}
        <Card
          size="small"
          title={<span style={{ fontWeight: 600 }}>🔥 热门股票</span>}
          extra={<a onClick={() => navigate('/stocks')} style={{ fontSize: 12 }}>查看全部 →</a>}
        >
          <Row gutter={[10, 10]}>
            {stocks.slice(0, 12).map((stock) => (
              <Col xs={12} sm={8} md={6} lg={4} key={stock.id}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => navigate(`/stock/${stock.symbol}`)}
                  style={{ textAlign: 'center' }}
                  bodyStyle={{ padding: '12px 8px' }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 14 }}>{stock.name}</div>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{stock.symbol}</div>
                  {stock.latestQuote ? (
                    <>
                      <div style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: stock.latestQuote.changePercent >= 0 ? '#EF4444' : '#22C55E',
                      }}>
                        {stock.latestQuote.closePrice?.toFixed(2)}
                      </div>
                      <Tag
                        color={stock.latestQuote.changePercent >= 0 ? 'red' : 'green'}
                        style={{ marginTop: 4 }}
                      >
                        {stock.latestQuote.changePercent >= 0 ? '+' : ''}
                        {stock.latestQuote.changePercent?.toFixed(2)}%
                      </Tag>
                      {/* 新增：成交量和换手率信息 */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid #f0f0f0',
                        fontSize: 11,
                        color: '#999',
                      }}>
                        <Tooltip title="成交量">
                          <span>
                            📊 {stock.latestQuote.volume >= 1e8
                              ? `${(stock.latestQuote.volume / 1e8).toFixed(1)}亿手`
                              : stock.latestQuote.volume >= 1e4
                                ? `${(stock.latestQuote.volume / 1e4).toFixed(0)}万手`
                                : `${stock.latestQuote.volume}手`}
                          </span>
                        </Tooltip>
                        {stock.latestQuote.turnoverRate !== undefined && (
                          <Tooltip title="换手率">
                            <span>🔄 {stock.latestQuote.turnoverRate?.toFixed(2)}%</span>
                          </Tooltip>
                        )}
                      </div>
                      {/* 新增：振幅指示 */}
                      {stock.latestQuote.amplitude !== undefined && (
                        <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
                          振幅 {stock.latestQuote.amplitude?.toFixed(2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#ccc', fontSize: 13, padding: '12px 0' }}>暂无行情</div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
          {stocks.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#ccc', padding: 40 }}>
              暂无股票数据，请先执行数据同步
            </div>
          )}
        </Card>
      </Spin>
    </div>
  );
};

export default HomePage;
