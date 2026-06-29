/**
 * 股票列表页 v2 — 现代专业设计
 * 白底卡片 + 高对比度 + 清晰排版 + 实时搜索
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Table, Input, Button, Tag, Space, Row, Col, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, StarOutlined, StarFilled, RiseOutlined, FallOutlined, StockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  useStocks, useStockStats, useStockActions, useWatchlist,
  Stock,
} from '../store/useStockStore';

import { THEME } from '../styles/theme-constants';
const BG = THEME.bg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;

const StockListPage: React.FC = () => {
  const stocks = useStocks();
  const stats = useStockStats();
  const watchlist = useWatchlist();
  const { toggleWatchlist } = useStockActions();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const _searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  const filteredAndSortedStocks = useMemo(() => {
    let result = [...stocks];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const aV = a[sortBy as keyof Stock], bV = b[sortBy as keyof Stock];
      if (aV == null && bV == null) return 0;
      if (aV == null) return 1;
      if (bV == null) return -1;
      const aStr = typeof aV === 'string' ? aV.toLowerCase() : String(aV);
      const bStr = typeof bV === 'string' ? bV.toLowerCase() : String(bV);
      return sortOrder === 'asc' ? (aStr > bStr ? 1 : -1) : (aStr < bStr ? 1 : -1);
    });
    return result;
  }, [stocks, searchTerm, sortBy, sortOrder]);

  const handleTableChange = useCallback((_p: unknown, _f: unknown, sorter: any) => {
    if (sorter.field) { setSortBy(sorter.field); setSortOrder(sorter.order === 'descend' ? 'desc' : 'asc'); }
  }, []);

  const refreshData = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  }, []);

  const columns: ColumnsType<Stock> = [
    {
      title: '代码', dataIndex: 'symbol', key: 'symbol', width: 100, sorter: true,
      render: (v: string) => <Link to={`/stocks/${v}`} style={{ color: '#2563eb', fontWeight: 600, fontFamily: 'monospace' }}>{v}</Link>,
    },
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 110, sorter: true,
      render: (v: string, r) => <Link to={`/stocks/${r.symbol}`} style={{ color: TEXT, fontWeight: 500 }}>{v}</Link>,
    },
    {
      title: '最新价', dataIndex: 'price', key: 'price', width: 100, sorter: true, align: 'right',
      render: (v: number) => <span style={{ fontFamily: '"DIN Alternate",monospace', fontWeight: 600, color: TEXT }}>¥{v.toFixed(2)}</span>,
    },
    {
      title: '涨跌幅', dataIndex: 'changePercent', key: 'changePercent', width: 105, sorter: true, align: 'right',
      render: (v: number) => (
        <Tag color={v >= 0 ? 'red' : 'green'} style={{ fontWeight: 700, minWidth: 72, textAlign: 'center', fontFamily: 'monospace', fontSize: 13, borderRadius: 4 }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: '涨跌额', dataIndex: 'change', key: 'change', width: 90, align: 'right',
      render: (v: number) => <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontFamily: 'monospace', fontWeight: 500 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>,
    },
    {
      title: '成交量', dataIndex: 'volume', key: 'volume', width: 90, align: 'right',
      render: (v: string) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v}</span>,
    },
    {
      title: '市值', dataIndex: 'marketCap', key: 'marketCap', width: 90, align: 'right',
      render: (v: string) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v}</span>,
    },
    {
      title: '自选', key: 'action', width: 60, align: 'center',
      render: (_: unknown, record: Stock) => (
        <Tooltip title={watchlist.includes(record.symbol) ? '取消自选' : '加入自选'}>
          <Button type="text" size="small"
            icon={watchlist.includes(record.symbol) ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined style={{ color: '#d4d4d8' }} />}
            onClick={(e) => { e.stopPropagation(); toggleWatchlist(record.symbol); }} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto', background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: TEXT }}>股票列表</h1>
          <p style={{ color: TEXT_SEC, margin: '2px 0 0', fontSize: 13 }}>实时A股行情 · 共 {stats.totalStocks} 只</p>
        </div>
        <Space>
          <Input
            prefix={<SearchOutlined style={{ color: TEXT_SEC }} />}
            placeholder="搜索代码或名称..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            allowClear
            style={{ width: 260, borderRadius: 8 }}
          />
          <Button icon={<ReloadOutlined />} onClick={refreshData} loading={loading} style={{ borderRadius: 8 }}>刷新</Button>
        </Space>
      </div>

      {/* Stats Cards */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: '总股票数', value: stats.totalStocks, icon: <StockOutlined />, bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb' },
          { label: '上涨', value: stats.risingStocks, icon: <RiseOutlined />, bg: '#fef2f2', border: '#fecaca', color: COLOR_UP },
          { label: '下跌', value: stats.fallingStocks, icon: <FallOutlined />, bg: '#f0fdf4', border: '#bbf7d0', color: COLOR_DOWN },
          { label: '总市值(亿)', value: stats.totalMarketCap.toFixed(0), icon: null, bg: '#faf5ff', border: '#e9d5ff', color: '#7c3aed' },
        ].map((item, i) => (
          <Col xs={12} sm={6} key={i}>
            <div style={{ background: item.bg, border: `1px solid ${item.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {item.icon && <span style={{ fontSize: 20, color: item.color }}>{item.icon}</span>}
              <div>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color, fontFamily: '"DIN Alternate",monospace' }}>{item.value}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Stock Table */}
      <Card style={{ borderRadius: 10, border: `1px solid ${BORDER}` }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: TEXT, fontSize: 14 }}>
            股票列表 ({searchTerm ? filteredAndSortedStocks.length : stocks.length} 只)
            {searchTerm && <Tag color="blue" style={{ marginLeft: 8, borderRadius: 4 }}>筛选: {searchTerm}</Tag>}
          </span>
        </div>
        <Table
          columns={columns}
          dataSource={filteredAndSortedStocks}
          rowKey="symbol"
          loading={loading}
          onChange={handleTableChange}
          pagination={{ current: currentPage, pageSize: itemsPerPage, total: filteredAndSortedStocks.length, onChange: setCurrentPage, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
          scroll={{ x: 800 }}
          onRow={(record) => ({ onDoubleClick: () => navigate(`/stocks/${record.symbol}`), style: { cursor: 'pointer' } })}
          rowClassName={() => 'stock-row'}
        />
      </Card>

      <style>{`
        .ant-table-thead > tr > th { background: #fafafa !important; color: ${TEXT_SEC} !important; font-weight: 600 !important; font-size: 12px !important; text-transform: uppercase; letter-spacing: 0.5px; }
        .stock-row:hover { background: #f0f5ff !important; }
      `}</style>
    </div>
  );
};

export default StockListPage;
