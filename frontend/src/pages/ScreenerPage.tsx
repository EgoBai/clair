/**
 * 股票筛选器 v4 — 策略驱动 + 核心指标 + 发掘页关联
 * 
 * 设计理念：
 * - 删除重复的指数显示（与发掘页重复）
 * - 添加核心筛选指标卡片（资金面、基本面、技术面、行业景气度）
 * - 推荐策略模板（价值投资、成长股、动量策略等）
 * - 支持从发掘页传入筛选条件
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { Card, Button, Tag, Table, Spin, Empty, Typography, message, Space, Tooltip } from 'antd';
import {
  RiseOutlined, FireOutlined, ThunderboltOutlined,
  ReloadOutlined, SearchOutlined, FilterOutlined,
  FundOutlined, LineChartOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

// 颜色常量
const BG = '#0f172a';
const CARD_BG = '#1e293b';
const BORDER = '#334155';
const TEXT = '#f1f5f9';
const TEXT_SEC = '#94a3b8';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const ACCENT = '#3b82f6';
const GOLD = '#f59e0b';

// 股票数据接口
interface StockData {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  industry?: string;
  change: number;
  pe?: number;
  pb?: number;
  roe?: number;
  turnoverRate?: number;
}

// 筛选指标接口
interface FilterMetric {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  category: 'capital' | 'fundamental' | 'technical' | 'industry';
  description: string;
  filter: (s: StockData) => boolean;
}

// 策略模板接口
interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  metrics: string[]; // 使用的指标ID
  filter: (s: StockData) => boolean;
}

// 核心筛选指标 — 精简为4个最实用的
const FILTER_METRICS: FilterMetric[] = [
  {
    id: 'strong_momentum',
    name: '强势动量',
    icon: <RiseOutlined />,
    color: '#f59e0b',
    category: 'technical',
    description: '涨幅超过3%的强势股',
    filter: (s) => s.changePercent > 3,
  },
  {
    id: 'low_pe',
    name: '低估值',
    icon: <FundOutlined />,
    color: '#22c55e',
    category: 'fundamental',
    description: 'PE低于20倍的价值股',
    filter: (s) => s.pe ? s.pe > 0 && s.pe < 20 : false,
  },
  {
    id: 'high_turnover',
    name: '高换手率',
    icon: <FireOutlined />,
    color: '#ef4444',
    category: 'capital',
    description: '换手率超过5%的活跃股',
    filter: (s) => s.turnoverRate ? s.turnoverRate > 5 : false,
  },
  {
    id: 'hot_industry',
    name: '热门行业',
    icon: <ThunderboltOutlined />,
    color: '#f97316',
    category: 'industry',
    description: '当前热门行业的股票',
    filter: (s) => {
      const hotIndustries = ['新能源', '半导体', '人工智能', '光模块', '存储'];
      return hotIndustries.some(ind => s.industry?.includes(ind));
    },
  },
];

// 策略模板 — 精简为2个核心策略
const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'value_investing',
    name: '价值投资',
    description: '低估值 + 稳定盈利',
    icon: <FundOutlined />,
    color: '#22c55e',
    metrics: ['low_pe'],
    filter: (s) => {
      const peOk = s.pe ? s.pe > 0 && s.pe < 20 : false;
      return peOk;
    },
  },
  {
    id: 'momentum_strategy',
    name: '动量策略',
    description: '强势上涨 + 高成交',
    icon: <LineChartOutlined />,
    color: '#f59e0b',
    metrics: ['strong_momentum', 'high_turnover'],
    filter: (s) => {
      const momentumOk = s.changePercent > 3;
      const turnoverOk = s.turnoverRate ? s.turnoverRate > 3 : false;
      return momentumOk && turnoverOk;
    },
  },
];

const ScreenerPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // 状态
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMetrics, setActiveMetrics] = useState<string[]>([]);
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 从URL参数读取初始筛选条件
  useEffect(() => {
    const metric = searchParams.get('metric');
    const strategy = searchParams.get('strategy');
    const industry = searchParams.get('industry');
    
    if (metric) {
      setActiveMetrics([metric]);
    } else if (strategy) {
      setActiveStrategy(strategy);
    } else if (industry) {
      // 根据行业设置筛选
      setActiveMetrics(['hot_industry']);
    }
  }, [searchParams]);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listResp, quotesResp] = await Promise.all([
        apiFetch('/api/stocks?limit=200').then(r => r.json()),
        apiFetch('/api/stocks/batch/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [] }),
        }).then(r => r.json()),
      ]);

      const apiStocks = listResp?.data?.stocks || [];
      const quotesData = quotesResp?.data?.stocks || [];
      const quoteMap: Record<string, any> = {};
      for (const q of quotesData) quoteMap[q.symbol] = q;

      const merged: StockData[] = apiStocks.map((s: any) => {
        const q = quoteMap[s.symbol]?.latestQuote || {};
        return {
          symbol: s.symbol,
          name: s.name,
          price: q.closePrice ?? q.price ?? s.price ?? 0,
          change: q.change ?? 0,
          changePercent: q.changePercent ?? 0,
          volume: q.volume ? (q.volume / 1e8).toFixed(1) + '亿' : (s.volume || '—'),
          marketCap: q.marketCap ? (q.marketCap / 1e8).toFixed(0) + '亿' : (s.marketCap || '—'),
          industry: s.industry || '—',
          pe: s.pe || q.pe,
          pb: s.pb || q.pb,
          roe: s.roe || q.roe,
          turnoverRate: q.turnoverRate,
        };
      });
      setStocks(merged);
    } catch (e) {
      console.warn('筛选器数据加载失败:', e);
      message.warning('数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 筛选逻辑
  const filtered = useMemo(() => {
    let result = [...stocks];

    // 应用策略筛选
    if (activeStrategy) {
      const strategy = STRATEGY_TEMPLATES.find(s => s.id === activeStrategy);
      if (strategy) {
        result = result.filter(strategy.filter);
      }
    }
    // 应用指标筛选（如果没有策略）
    else if (activeMetrics.length > 0) {
      result = result.filter(s => {
        return activeMetrics.every(metricId => {
          const metric = FILTER_METRICS.find(m => m.id === metricId);
          return metric ? metric.filter(s) : true;
        });
      });
    }

    // 搜索过滤
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(s => 
        s.symbol.toLowerCase().includes(q) || 
        s.name.includes(q) ||
        s.industry?.includes(q)
      );
    }

    return result;
  }, [stocks, activeMetrics, activeStrategy, searchText]);

  // 分页
  const paged = useMemo(() => {
    return filtered.slice((page - 1) * pageSize, page * pageSize);
  }, [filtered, page]);

  // 切换指标
  const toggleMetric = (metricId: string) => {
    setActiveStrategy(null); // 清除策略
    setActiveMetrics(prev => 
      prev.includes(metricId) 
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
    setPage(1);
  };

  // 选择策略
  const selectStrategy = (strategyId: string) => {
    setActiveMetrics([]); // 清除指标
    setActiveStrategy(prev => prev === strategyId ? null : strategyId);
    setPage(1);
  };

  // 表格列定义
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 95,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: ACCENT }}>{v.replace(/\.(SH|SZ)$/, '')}</span>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string, r: StockData) => (
        <span style={{ color: TEXT }}>{v}</span>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      width: 80,
      render: (v: string) => (
        <Tag style={{ fontSize: 11 }}>{v}</Tag>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      width: 85,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT }}>{v.toFixed(2)}</span>
      ),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 85,
      align: 'right' as const,
      sorter: (a: StockData, b: StockData) => a.changePercent - b.changePercent,
      render: (v: number) => (
        <span style={{ 
          fontFamily: 'monospace', 
          fontWeight: 600,
          color: v >= 0 ? COLOR_UP : COLOR_DOWN 
        }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      width: 75,
      align: 'right' as const,
      render: (v?: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT_SEC }}>
          {v ? v.toFixed(1) + '%' : '—'}
        </span>
      ),
    },
    {
      title: 'PE',
      dataIndex: 'pe',
      width: 65,
      align: 'right' as const,
      render: (v?: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT_SEC }}>
          {v ? v.toFixed(1) : '—'}
        </span>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, r: StockData) => (
        <Button 
          type="link" 
          size="small"
          onClick={() => navigate(`/stocks/${r.symbol}`)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* 页面标题 */}
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ color: TEXT, marginBottom: 8 }}>
            <FilterOutlined style={{ marginRight: 8 }} />
            股票筛选
          </Title>
          <Text style={{ color: TEXT_SEC }}>
            选择核心指标或策略模板，快速筛选符合条件的股票
          </Text>
        </div>

        {/* 策略模板 */}
        <Card 
          title={<span style={{ color: TEXT }}>🎯 推荐策略</span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {STRATEGY_TEMPLATES.map(strategy => (
              <div
                key={strategy.id}
                onClick={() => selectStrategy(strategy.id)}
                style={{
                  background: activeStrategy === strategy.id ? strategy.color + '20' : BG,
                  border: `1px solid ${activeStrategy === strategy.id ? strategy.color : BORDER}`,
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: strategy.color, fontSize: 18 }}>{strategy.icon}</span>
                  <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{strategy.name}</span>
                </div>
                <div style={{ color: TEXT_SEC, fontSize: 12 }}>{strategy.description}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 核心筛选指标 */}
        <Card 
          title={<span style={{ color: TEXT }}>🔍 核心指标</span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {FILTER_METRICS.map(metric => (
              <Tooltip key={metric.id} title={metric.description}>
                <div
                  onClick={() => toggleMetric(metric.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: activeMetrics.includes(metric.id) ? metric.color + '20' : BG,
                    border: `1px solid ${activeMetrics.includes(metric.id) ? metric.color : BORDER}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ color: metric.color, fontSize: 18 }}>{metric.icon}</span>
                  <span style={{ 
                    color: activeMetrics.includes(metric.id) ? metric.color : TEXT,
                    fontSize: 14,
                    fontWeight: activeMetrics.includes(metric.id) ? 600 : 400,
                  }}>
                    {metric.name}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </Card>

        {/* 搜索和统计 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ color: TEXT_SEC }}>
              筛选结果: <b style={{ color: ACCENT }}>{filtered.length}</b> 只股票
            </span>
            {activeStrategy && (
              <Tag color={STRATEGY_TEMPLATES.find(s => s.id === activeStrategy)?.color}>
                {STRATEGY_TEMPLATES.find(s => s.id === activeStrategy)?.name}
              </Tag>
            )}
            {activeMetrics.map(mId => {
              const m = FILTER_METRICS.find(fm => fm.id === mId);
              return m ? <Tag key={mId} color={m.color}>{m.name}</Tag> : null;
            })}
          </div>
          <Space>
            <input
              type="text"
              placeholder="搜索代码/名称/行业"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                padding: '6px 12px',
                color: TEXT,
                fontSize: 13,
                width: 200,
              }}
            />
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchData}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        {/* 股票列表 */}
        <Card 
          style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
          bodyStyle={{ padding: 0 }}
        >
          <Table
            dataSource={paged}
            columns={columns}
            loading={loading}
            rowKey="symbol"
            pagination={{
              current: page,
              pageSize,
              total: filtered.length,
              onChange: setPage,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 只`,
            }}
            locale={{
              emptyText: <Empty description="暂无符合条件的股票" />,
            }}
            size="small"
            style={{ background: 'transparent' }}
          />
        </Card>
      </div>
    </div>
  );
};

export default ScreenerPage;
