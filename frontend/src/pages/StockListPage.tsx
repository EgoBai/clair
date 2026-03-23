/**
 * 股票列表页
 */

import React, { useEffect, useState } from 'react';
import { Table, Input, Select, Card, Tag, Space, Pagination, Spin, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { apiService, StockWithQuote } from '../services/api';

const StockListPage: React.FC = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [market, setMarket] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadStocks();
  }, [page, pageSize, market, industry]);

  const loadStocks = async (keyword?: string) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize,
        sortBy: 'symbol',
        sortOrder: 'asc',
      };
      if (keyword || searchText) params.symbol = keyword || searchText;
      if (keyword || searchText) params.name = keyword || searchText;
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

  const handleSearch = () => {
    setPage(1);
    loadStocks(searchText);
  };

  const columns: ColumnsType<StockWithQuote> = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 110,
      fixed: 'left',
      render: (val: string) => (
        <a style={{ fontWeight: 500, color: '#1890ff' }}>{val}</a>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
      render: (val: string) => <span style={{ fontWeight: 500 }}>{val}</span>,
    },
    {
      title: '市场',
      dataIndex: 'market',
      width: 70,
      render: (val: string) => (
        <Tag color={val === 'SH' ? 'blue' : val === 'SZ' ? 'green' : 'orange'}>
          {val === 'SH' ? '沪' : val === 'SZ' ? '深' : '北'}
        </Tag>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      width: 100,
      ellipsis: true,
    },
    {
      title: '最新价',
      dataIndex: ['latestQuote', 'closePrice'],
      width: 90,
      align: 'right',
      render: (val: number) => val?.toFixed(2) ?? '-',
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
          <Tag color={val >= 0 ? 'red' : 'green'}>
            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </Tag>
        );
      },
    },
    {
      title: '成交量',
      dataIndex: ['latestQuote', 'volume'],
      width: 100,
      align: 'right',
      render: (val: number) => {
        if (!val) return '-';
        if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
        if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
        return val.toString();
      },
    },
    {
      title: '成交额',
      dataIndex: ['latestQuote', 'turnover'],
      width: 100,
      align: 'right',
      render: (val: number) => {
        if (!val) return '-';
        if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
        if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
        return val.toString();
      },
    },
    {
      title: '市值',
      dataIndex: ['latestQuote', 'marketCap'],
      width: 100,
      align: 'right',
      render: (val: number) => {
        if (!val) return '-';
        if (val >= 1e12) return `${(val / 1e12).toFixed(2)}万亿`;
        if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
        return val.toString();
      },
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card title="股票列表" size="small">
        {/* 搜索和筛选 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="搜索股票代码或名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="市场"
              value={market || undefined}
              onChange={(val) => { setMarket(val || ''); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
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
              options={[
                { label: '银行', value: '银行' },
                { label: '食品饮料', value: '食品饮料' },
                { label: '电子', value: '电子' },
                { label: '医药生物', value: '医药生物' },
                { label: '电力设备', value: '电力设备' },
                { label: '非银金融', value: '非银金融' },
                { label: '计算机', value: '计算机' },
                { label: '汽车', value: '汽车' },
                { label: '家用电器', value: '家用电器' },
              ]}
            />
          </Col>
        </Row>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={stocks}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => navigate(`/stock/${record.symbol}`),
            style: { cursor: 'pointer' },
          })}
        />

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
          />
        </div>
      </Card>
    </div>
  );
};

export default StockListPage;
