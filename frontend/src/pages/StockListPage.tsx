/**
 * 股票列表页
 * 支持搜索、筛选、排序、分页、键盘导航
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Table, Input, Select, Card, Tag, Pagination, Row, Col, Tooltip, Typography } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { apiService, StockWithQuote } from '../services/api';
import { useDebounce } from '../hooks/useHooks';

const { Text } = Typography;

const StockListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState(searchParams.get('search') || '');
  const [market, setMarket] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedRowIdx, setSelectedRowIdx] = useState(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchText, 300);

  useEffect(() => {
    loadStocks();
  }, [page, pageSize, market, industry, debouncedSearch]);

  // 键盘导航: 上下箭头选择行，Enter进入详情
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 仅在搜索框未聚焦时生效
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === 'INPUT') return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIdx(prev => Math.min(prev + 1, stocks.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIdx(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && selectedRowIdx >= 0 && selectedRowIdx < stocks.length) {
        e.preventDefault();
        navigate(`/stock/${stocks[selectedRowIdx]!.symbol}`);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [stocks, selectedRowIdx, navigate]);

  const loadStocks = async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'symbol',
        sortOrder: 'asc',
      };
      if (debouncedSearch) {
        params.symbol = debouncedSearch;
        params.name = debouncedSearch;
      }
      if (market) params.market = market;
      if (industry) params.industry = industry;

      const res = await apiService.getStocks(params);
      if (res.success) {
        setStocks(res.data.stocks);
        setTotal(res.data.pagination.totalCount);
      }
    } catch (error) {
      console.error('加载股票列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 格式化函数
  const formatTurnover = (val?: number) => {
    if (!val) return '-';
    if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
    if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
    return val.toString();
  };

  const formatVolume = (val?: number) => {
    if (!val) return '-';
    if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
    if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
    return val.toString();
  };

  const formatMarketCap = (val?: number) => {
    if (!val) return '-';
    if (val >= 1e12) return `${(val / 1e12).toFixed(2)}万亿`;
    if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
    return val.toString();
  };

  const marketColorMap: Record<string, string> = { SH: 'blue', SZ: 'green', BJ: 'orange' };
  const marketLabelMap: Record<string, string> = { SH: '沪', SZ: '深', BJ: '北' };

  const columns: ColumnsType<StockWithQuote> = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 110,
      fixed: 'left',
      render: (val: string) => (
        <Text strong style={{ color: '#1890ff', fontSize: 13 }}>{val}</Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
      render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text>,
    },
    {
      title: '市场',
      dataIndex: 'market',
      width: 60,
      render: (val: string) => (
        <Tag color={marketColorMap[val] || 'default'} style={{ fontSize: 11 }}>
          {marketLabelMap[val] || val}
        </Tag>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      width: 90,
      ellipsis: { showTitle: false },
      render: (val: string) => val ? (
        <Tooltip title={val}>
          <Text style={{ fontSize: 12 }}>{val}</Text>
        </Tooltip>
      ) : '-',
    },
    {
      title: '最新价',
      dataIndex: ['latestQuote', 'closePrice'],
      width: 90,
      align: 'right',
      render: (val: number, record) => {
        if (!val) return '-';
        const changePercent = record.latestQuote?.changePercent ?? 0;
        const color = changePercent >= 0 ? '#EF4444' : '#22C55E';
        return <Text style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{val.toFixed(2)}</Text>;
      },
    },
    {
      title: '涨跌幅',
      dataIndex: ['latestQuote', 'changePercent'],
      width: 90,
      align: 'right',
      sorter: (a, b) =>
        (a.latestQuote?.changePercent ?? 0) - (b.latestQuote?.changePercent ?? 0),
      render: (val: number) => {
        if (val === undefined || val === null) return '-';
        return (
          <Tag color={val >= 0 ? 'red' : 'green'} style={{ fontFamily: 'monospace' }}>
            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </Tag>
        );
      },
    },
    {
      title: '成交量',
      dataIndex: ['latestQuote', 'volume'],
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatVolume(val)}</Text>
      ),
    },
    {
      title: '成交额',
      dataIndex: ['latestQuote', 'turnover'],
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatTurnover(val)}</Text>
      ),
    },
    {
      title: '市值',
      dataIndex: ['latestQuote', 'marketCap'],
      width: 100,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatMarketCap(val)}</Text>
      ),
    },
  ];

  const industries = [
    { label: '银行', value: '银行' },
    { label: '食品饮料', value: '食品饮料' },
    { label: '电子', value: '电子' },
    { label: '医药生物', value: '医药生物' },
    { label: '电力设备', value: '电力设备' },
    { label: '非银金融', value: '非银金融' },
    { label: '计算机', value: '计算机' },
    { label: '汽车', value: '汽车' },
    { label: '家用电器', value: '家用电器' },
    { label: '通信', value: '通信' },
    { label: '国防军工', value: '国防军工' },
    { label: '机械设备', value: '机械设备' },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={<span style={{ fontWeight: 600 }}>📋 股票列表</span>}
        size="small"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {total} 只</Text>}
      >
        {/* 搜索和筛选 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="搜索股票代码或名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1);
              }}
              allowClear
              size="middle"
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="市场"
              value={market || undefined}
              onChange={(val) => { setMarket(val || ''); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
              suffixIcon={<FilterOutlined />}
              options={[
                { label: '上海', value: 'SH' },
                { label: '深圳', value: 'SZ' },
                { label: '北京', value: 'BJ' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="行业"
              value={industry || undefined}
              onChange={(val) => { setIndustry(val || ''); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
              suffixIcon={<FilterOutlined />}
              options={industries}
              showSearch
              optionFilterProp="label"
            />
          </Col>
        </Row>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={stocks}
          rowKey={(r) => r.id || r.symbol}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          onRow={(record, index) => ({
            onClick: () => {
              setSelectedRowIdx(index ?? -1);
              navigate(`/stock/${record.symbol}`);
            },
            onMouseEnter: () => setSelectedRowIdx(index ?? -1),
            style: {
              cursor: 'pointer',
              transition: 'background 0.2s',
              background: index === selectedRowIdx ? '#e6f4ff' : undefined,
            },
          })}
          rowClassName={() => 'stock-table-row'}
        />
        {/* 键盘导航提示 */}
        <div style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            ⌨️ 快捷键: ↑↓ 选择行 | Enter 进入详情 | ⌘K 搜索
          </Text>
        </div>

        {/* 分页 */}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showQuickJumper
            showTotal={(t) => `共 ${t} 只股票`}
            onChange={(p, ps) => {
              setPage(p);
              setPageSize(ps);
            }}
            size="small"
            pageSizeOptions={['10', '20', '50', '100']}
          />
        </div>
      </Card>
    </div>
  );
};

export default StockListPage;
