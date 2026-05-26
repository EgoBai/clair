/**
 * 仪表板页面
 * 市场概览 + 自选股 + 涨跌榜 + 最近新闻
 * 深色背景卡片，清晰区块划分，支持拖拽编辑提示
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Tag, Space, Spin, Button, List, Empty, Tooltip, Badge, message,
} from 'antd';
import {
  RiseOutlined, FallOutlined, StockOutlined, StarOutlined,
  StarFilled, ReloadOutlined, DragOutlined, ThunderboltOutlined,
  FileTextOutlined, TrophyOutlined, DashboardOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import {
  useStocks, useWatchlist, useStockActions,
  Stock,
} from '../store/useStockStore';

const COLOR_UP = '#ef4444';
const COLOR_DOWN = '#22c555';

// 深色卡片样式
const cardStyle: React.CSSProperties = {
  background: 'rgba(15,23,42,0.8)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
};

const cardTitleStyle: React.CSSProperties = {
  color: '#e5e7eb',
  fontWeight: 600,
  fontSize: 15,
};

interface MarketIndex {
  name: string;
  symbol: string;
  closePrice: number;
  changePercent: number;
  change?: number;
}

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  publishTime: string;
  sentiment?: string;
  tags?: string[];
}

const DashboardPage: React.FC = () => {
  const stocks = useStocks();
  const watchlist = useWatchlist();
  const { toggleWatchlist } = useStockActions();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [risingCount, setRisingCount] = useState(0);
  const [fallingCount, setFallingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // 获取市场概览数据
  const fetchMarketData = useCallback(async () => {
    try {
      const resp = await fetch('/api/market/summary');
      const data = await resp.json();
      if (data.success && data.data) {
        setIndices(data.data.indices || []);
        setRisingCount(data.data.risingStocks || 0);
        setFallingCount(data.data.fallingStocks || 0);
        setTotalCount(data.data.totalStocks || 0);
      }
    } catch (e) {
      console.error('获取市场数据失败:', e);
    }
  }, []);

  // 获取新闻数据
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const resp = await fetch('/api/news?limit=8');
      const data = await resp.json();
      if (data.success && data.data?.items) {
        setNews(data.data.items);
      }
    } catch (e) {
      console.error('获取新闻失败:', e);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchMarketData(), fetchNews()]);
      setLoading(false);
    };
    init();
  }, []);

  // 涨幅榜 / 跌幅榜
  const topGainers = [...stocks]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5);
  const topLosers = [...stocks]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5);

  // 自选股
  const watchlistStocks = stocks.filter(s => watchlist.includes(s.symbol));

  // 渲染单只股票行
  const renderStockRow = (stock: Stock, showStar = true) => (
    <div
      key={stock.symbol}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/stocks/${stock.symbol}`)}
    >
      <div style={{ flex: 1 }}>
        <Link
          to={`/stocks/${stock.symbol}`}
          style={{ color: '#e5e7eb', fontWeight: 500, fontSize: 13 }}
          onClick={(e) => e.stopPropagation()}
        >
          {stock.name}
        </Link>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{stock.symbol}</div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 80 }}>
        <div style={{
          fontFamily: '"DIN Alternate", monospace',
          fontWeight: 600, fontSize: 14,
          color: stock.changePercent >= 0 ? COLOR_UP : COLOR_DOWN,
        }}>
          {stock.price.toFixed(2)}
        </div>
        <Tag
          color={stock.changePercent >= 0 ? 'red' : 'green'}
          style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}
        >
          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
        </Tag>
      </div>
      {showStar && (
        <Button
          type="text"
          size="small"
          icon={watchlist.includes(stock.symbol) ?
            <StarFilled style={{ color: '#f59e0b', fontSize: 12 }} /> :
            <StarOutlined style={{ color: '#6b7280', fontSize: 12 }} />
          }
          onClick={(e) => { e.stopPropagation(); toggleWatchlist(stock.symbol); }}
          style={{ marginLeft: 4, padding: '0 4px' }}
        />
      )}
    </div>
  );

  return (
    <Spin spinning={loading}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* 顶部标题栏 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
        }}>
          <Space>
            <DashboardOutlined style={{ fontSize: 24, color: '#3b82f6' }} />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#e5e7eb' }}>
              市场仪表板
            </h2>
          </Space>
          <Space>
            <Tooltip title="拖拽编辑: 点击编辑模式后可拖拽区块调整布局">
              <Button icon={<DragOutlined />} size="small" type="dashed" style={{ color: '#6b7280' }}>
                可拖拽编辑
              </Button>
            </Tooltip>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { fetchMarketData(); fetchNews(); }}
              size="small"
            >
              刷新
            </Button>
          </Space>
        </div>

        <Row gutter={[16, 16]}>
          {/* ===== 市场概览: 三大指数 ===== */}
          <Col span={24}>
            <Card style={cardStyle} bodyStyle={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 12, ...cardTitleStyle }}>
                📊 市场概览
              </div>
              <Row gutter={16}>
                {indices.map((idx) => (
                  <Col xs={24} sm={8} key={idx.symbol}>
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
                        {idx.name}
                      </div>
                      <div style={{
                        fontSize: 22, fontWeight: 700,
                        fontFamily: '"DIN Alternate", monospace',
                        color: idx.changePercent >= 0 ? COLOR_UP : COLOR_DOWN,
                      }}>
                        {idx.closePrice?.toFixed(2) ?? '-'}
                      </div>
                      <Tag
                        color={idx.changePercent >= 0 ? 'red' : 'green'}
                        style={{ marginTop: 4, fontWeight: 600 }}
                      >
                        {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent?.toFixed(2) ?? 0}%
                      </Tag>
                    </div>
                  </Col>
                ))}
                {indices.length === 0 && !loading && (
                  <Col span={24}>
                    <Empty description="暂无指数数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </Col>
                )}
              </Row>
              {/* 涨跌家数 */}
              <div style={{
                marginTop: 16, display: 'flex', justifyContent: 'center', gap: 32,
                padding: '12px 0',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: COLOR_UP }}>
                    {risingCount}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>上涨</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#e5e7eb' }}>
                    {totalCount}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>总计</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: COLOR_DOWN }}>
                    {fallingCount}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>下跌</div>
                </div>
              </div>
            </Card>
          </Col>

          {/* ===== 涨幅榜 ===== */}
          <Col xs={24} md={12}>
            <Card
              style={cardStyle}
              bodyStyle={{ padding: '12px 16px' }}
              title={
                <span style={cardTitleStyle}>
                  <TrophyOutlined style={{ color: COLOR_UP, marginRight: 8 }} />
                  涨幅榜 TOP 5
                </span>
              }
              size="small"
            >
              {topGainers.map(stock => renderStockRow(stock, false))}
              {topGainers.length === 0 && <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>
          </Col>

          {/* ===== 跌幅榜 ===== */}
          <Col xs={24} md={12}>
            <Card
              style={cardStyle}
              bodyStyle={{ padding: '12px 16px' }}
              title={
                <span style={cardTitleStyle}>
                  <FallOutlined style={{ color: COLOR_DOWN, marginRight: 8 }} />
                  跌幅榜 TOP 5
                </span>
              }
              size="small"
            >
              {topLosers.map(stock => renderStockRow(stock, false))}
              {topLosers.length === 0 && <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            </Card>
          </Col>

          {/* ===== 自选股快速查看 ===== */}
          <Col xs={24} md={12}>
            <Card
              style={cardStyle}
              bodyStyle={{ padding: '12px 16px' }}
              title={
                <span style={cardTitleStyle}>
                  <StarFilled style={{ color: '#f59e0b', marginRight: 8 }} />
                  我的自选 ({watchlistStocks.length})
                </span>
              }
              size="small"
              extra={
                <Link to="/watchlist" style={{ color: '#3b82f6', fontSize: 12 }}>
                  查看全部 →
                </Link>
              }
            >
              {watchlistStocks.length > 0 ? (
                watchlistStocks.slice(0, 6).map(stock => renderStockRow(stock, true))
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <StarOutlined style={{ fontSize: 32, color: '#4b5563', marginBottom: 8 }} />
                  <div style={{ color: '#6b7280', fontSize: 13 }}>
                    暂无自选股，点击 <StarOutlined /> 添加
                  </div>
                </div>
              )}
            </Card>
          </Col>

          {/* ===== 最近新闻 ===== */}
          <Col xs={24} md={12}>
            <Card
              style={cardStyle}
              bodyStyle={{ padding: '12px 16px' }}
              title={
                <span style={cardTitleStyle}>
                  <FileTextOutlined style={{ color: '#3b82f6', marginRight: 8 }} />
                  最近新闻
                </span>
              }
              size="small"
              extra={
                <Link to="/news" style={{ color: '#3b82f6', fontSize: 12 }}>
                  更多 →
                </Link>
              }
            >
              {newsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <Spin size="small" />
                </div>
              ) : news.length > 0 ? (
                news.slice(0, 5).map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: i < news.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      color: '#e5e7eb', fontSize: 13, fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.title}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <Space size={4}>
                        <span style={{ color: '#6b7280', fontSize: 11 }}>{item.source}</span>
                        {item.sentiment === 'positive' && <Tag color="red" style={{ fontSize: 10, padding: '0 3px', lineHeight: '14px' }}>利好</Tag>}
                        {item.sentiment === 'negative' && <Tag color="green" style={{ fontSize: 10, padding: '0 3px', lineHeight: '14px' }}>利空</Tag>}
                      </Space>
                      <span style={{ color: '#4b5563', fontSize: 11 }}>
                        {item.publishTime ? new Date(item.publishTime).toLocaleDateString('zh-CN') : ''}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <FileTextOutlined style={{ fontSize: 32, color: '#4b5563', marginBottom: 8 }} />
                  <div style={{ color: '#6b7280', fontSize: 13 }}>暂无新闻</div>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 底部提示 */}
        <div style={{
          marginTop: 20, padding: '12px 16px',
          background: 'rgba(59,130,246,0.05)',
          border: '1px solid rgba(59,130,246,0.15)',
          borderRadius: 8,
          fontSize: 12, color: '#6b7280', lineHeight: 1.8,
        }}>
          <strong style={{ color: '#3b82f6' }}>💡 提示</strong>
          <span style={{ marginLeft: 8 }}>
            数据来自后端API实时获取 | 点击股票名称查看详情 | <StarOutlined /> 添加/取消自选 | 可进入
            <Link to="/dashboard" style={{ color: '#3b82f6', margin: '0 2px' }}>自定义仪表板</Link>
            进行拖拽编辑布局
          </span>
        </div>
      </div>
    </Spin>
  );
};

export default DashboardPage;
