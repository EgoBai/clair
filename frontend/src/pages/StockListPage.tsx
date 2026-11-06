/**
 * 股票列表页 v2 — 现代专业设计
 * 白底卡片 + 高对比度 + 清晰排版 + 实时搜索
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Table, Input, Button, Tag, Space, Row, Col, Tooltip, Alert } from 'antd';
import { SearchOutlined, ReloadOutlined, StarOutlined, StarFilled, RiseOutlined, FallOutlined, StockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  useStocks, useStockStats, useStockActions, useWatchlist, useStocksStatus, useStocksMeta, useError,
  Stock,
} from '../store/useStockStore';

import { THEME } from '../styles/theme-constants';
const BG = THEME.bg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;

/** 缺失数据显示「—」：绝不显示 0（0 会被读成真实的零） */
const MISSING = '—';

const Dash: React.FC<{ title?: string }> = ({ title }) => {
  const node = <span style={{ color: TEXT_SEC, fontFamily: 'monospace' }}>{MISSING}</span>;
  return title ? <Tooltip title={title}>{node}</Tooltip> : node;
};

const StockListPage: React.FC = () => {
  const stocks = useStocks();
  const stats = useStockStats();
  const watchlist = useWatchlist();
  const stocksStatus = useStocksStatus();
  const stocksMeta = useStocksMeta();
  const errorMessage = useError();
  const { toggleWatchlist, fetchAllStocks } = useStockActions();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const _searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 【缺陷修复】此前本页没有任何初次加载路径：stocks 只在搜索时被填充，
  // 于是线上恒显示「共 0 只 / 总市值 0 / 暂无数据」。
  // 现在 mount 即拉一次 GET /api/stocks?pageSize=6000（全市场 + 真实行情）。
  useEffect(() => {
    void fetchAllStocks();
  }, [fetchAllStocks]);

  const loading = stocksStatus === 'loading';
  const loadFailed = stocksStatus === 'error';

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
    // 真实重新请求（此前是 setTimeout 假装加载 500ms，没有任何网络请求）
    void fetchAllStocks();
  }, [fetchAllStocks]);

  const columns: ColumnsType<Stock> = [
    {
      title: '代码', dataIndex: 'symbol', key: 'symbol', width: 100, sorter: true,
      render: (v: string) => <Link to={`/stocks/${v}`} style={{ color: 'var(--accent-solid)', fontWeight: 600, fontFamily: 'monospace' }}>{v}</Link>,
    },
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 110, sorter: true,
      render: (v: string, r) => <Link to={`/stocks/${r.symbol}`} style={{ color: TEXT, fontWeight: 500 }}>{v}</Link>,
    },
    {
      title: '最新价', dataIndex: 'price', key: 'price', width: 100, sorter: true, align: 'right',
      render: (v: number | null) => (v === null
        ? <Dash title="上游未返回该标的行情" />
        : <span style={{ fontFamily: '"DIN Alternate",monospace', fontWeight: 600, color: TEXT }}>¥{v.toFixed(2)}</span>),
    },
    {
      title: '涨跌幅', dataIndex: 'changePercent', key: 'changePercent', width: 105, sorter: true, align: 'right',
      render: (v: number | null) => {
        if (v === null) return <Dash title="上游未返回该标的行情" />;
        // 不用 AntD preset（暗色主题下 preset 会统一变深蓝胶囊）；显式映射设计令牌，
        // 并让 0 走中性色，不再把「平盘」画成上涨红。
        const tone = v > 0
          ? { color: 'var(--color-up)', background: 'var(--color-up-bg)', borderColor: 'var(--color-up)' }
          : v < 0
            ? { color: 'var(--color-down)', background: 'var(--color-down-bg)', borderColor: 'var(--color-down)' }
            : { color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', borderColor: 'var(--border-default)' };
        return (
          <Tag style={{ ...tone, fontWeight: 700, minWidth: 72, textAlign: 'center', fontFamily: 'monospace', fontSize: 13, borderRadius: 4 }}>
            {v > 0 ? '+' : ''}{v.toFixed(2)}%
          </Tag>
        );
      },
    },
    {
      title: '涨跌额', dataIndex: 'change', key: 'change', width: 90, align: 'right',
      // /api/stocks 不提供涨跌额，且不提供昨收 → 无法推导（closePrice×changePercent 是估算不是事实）
      render: (v: number | null) => (v === null
        ? <Dash title="行情接口未提供涨跌额，且未提供昨收，无法推导（不用估算值冒充）" />
        : <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontFamily: 'monospace', fontWeight: 500 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>),
    },
    {
      title: '成交量', dataIndex: 'volume', key: 'volume', width: 90, align: 'right',
      render: (v: string | null) => (v === null
        ? <Dash title="上游未返回该标的成交量" />
        : <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v}</span>),
    },
    {
      title: '市值', dataIndex: 'marketCap', key: 'marketCap', width: 90, align: 'right',
      render: (v: string | null) => (v === null
        ? <Dash title="上游未返回该标的总市值（marketCap 缺失），未用 0 或估算值顶替" />
        : <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v}</span>),
    },
    {
      title: '自选', key: 'action', width: 60, align: 'center',
      render: (_: unknown, record: Stock) => (
        <Tooltip title={watchlist.includes(record.symbol) ? '取消自选' : '加入自选'}>
          <Button type="text" size="small"
            icon={watchlist.includes(record.symbol) ? <StarFilled style={{ color: 'var(--color-warning)' }} /> : <StarOutlined style={{ color: 'var(--text-tertiary)' }} />}
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
          <p style={{ color: TEXT_SEC, margin: '2px 0 0', fontSize: 13 }}>
            全市场 A 股行情（GET /api/stocks）· 共 {stats.totalStocks ?? MISSING} 只
            {stocksMeta.total !== null && <span> · 接口报告总数 {stocksMeta.total}</span>}
            {stocksMeta.loadedAt && (
              <span> · 本次请求完成 {new Date(stocksMeta.loadedAt).toLocaleTimeString('zh-CN', { hour12: false })}
                {stocksMeta.dataSource ? `（dataSource=${stocksMeta.dataSource}）` : ''}
              </span>
            )}
          </p>
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

      {/* 加载失败 / 空结果：如实说明，不复用「暂无数据」这种会被读成「今天真的没股票」的文案 */}
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
          message="行情数据不可用：本页不展示任何股票数据（未用 0 顶替）"
          description={<span style={{ fontSize: 13 }}>{errorMessage || '未知原因'}</span>}
        />
      )}

      {/* Stats Cards — 任何一个值算不出来就显示「—」，绝不显示 0 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: '总股票数', value: stats.totalStocks, icon: <StockOutlined />, color: 'var(--accent-solid)', tip: '已加载的股票条数' },
          { label: '上涨', value: stats.risingStocks, icon: <RiseOutlined />, color: 'var(--color-up)', tip: '涨跌幅 > 0 的只数' },
          { label: '下跌', value: stats.fallingStocks, icon: <FallOutlined />, color: 'var(--color-down)', tip: '涨跌幅 < 0 的只数' },
          {
            label: '总市值(亿)', value: stats.totalMarketCap === null ? null : stats.totalMarketCap.toFixed(0), icon: null,
            color: 'var(--text-tertiary)',
            tip: stats.totalMarketCap === null
              ? `有 ${stats.missingMarketCapCount} 只标的未取到总市值，全市场合计不是真值，故显示「—」，未用 0 或部分合计顶替`
              : '全部标的市值合计（腾讯行情总市值字段）',
          },
        ].map((item, i) => (
          <Col xs={12} sm={6} key={i}>
            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${item.color}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {item.icon && <span style={{ fontSize: 20, color: item.color }}>{item.icon}</span>}
              <div>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 2 }}>{item.label}</div>
                <Tooltip title={item.tip}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.value === null ? TEXT_SEC : item.color, fontFamily: '"DIN Alternate",monospace' }}>
                    {item.value ?? MISSING}
                  </div>
                </Tooltip>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 缺失字段的口径说明：把「为什么是 —」写在页面上，而不是让人猜 */}
      {stocksStatus === 'ready' && (
        <div style={{ marginBottom: 12, fontSize: 12, color: TEXT_SEC, lineHeight: 1.7 }}>
          · 总市值显示「—」：<code>GET /api/stocks</code> 的 <code>latestQuote.marketCap</code>（亿元）在该标的缺失，或全市场并非每只都有值；缺任何一只，合计就不是真值（不用 0 或部分合计顶替）。
          <br />
          · 涨跌额显示「—」同因：接口不含涨跌额，也不含昨收，无法推导。
        </div>
      )}

      {/* Stock Table */}
      <Card style={{ borderRadius: 10, border: `1px solid ${BORDER}` }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: TEXT, fontSize: 14 }}>
            股票列表 ({stats.totalStocks === null ? MISSING : (searchTerm ? filteredAndSortedStocks.length : stocks.length)} 只)
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
          locale={{
            emptyText: (
              <div style={{ padding: '24px 0', color: TEXT_SEC }}>
                {loadFailed
                  ? '行情接口不可用/无数据，未展示任何股票（原因见页面顶部提示）'
                  : stocksStatus === 'idle' || stocksStatus === 'loading'
                    ? '正在加载全市场行情…'
                    : '筛选条件下无匹配股票'}
              </div>
            ),
          }}
          onRow={(record) => ({ onDoubleClick: () => navigate(`/stocks/${record.symbol}`), style: { cursor: 'pointer' } })}
          rowClassName={() => 'stock-row'}
        />
      </Card>

    </div>
  );
};

export default StockListPage;
