/**
 * 大宗交易页面 (BlockTradesPage)
 *
 * 数据来源：后端 `/api/block-trades`（真实源=东方财富大宗交易接口），已实测返回真实成交记录。
 *
 * ## 从 `_archived/BlockTradesPage.tsx` 迁移时修正的失效契约
 *
 * 归档版不能照抄，它有 4 处与现役后端/工程约定不符（缺任何一处都会编译失败或静默空表）：
 *
 * 1. **logger 相对路径**（归档版 :7 `import logger from '../utils/logger'`）
 *    归档版位于 `pages/_archived/`，`../utils` 解析到 `pages/utils`（不存在）。
 *    移出到 `pages/` 后必须写成 `'../utils/logger'`。
 *
 * 2. **`id` 类型 number → string**（归档版 :21 `id: number`）
 *    后端 `withStableId`（backend/src/api/block-trades.ts:29-34）产出的是**字符串**
 *    `` `${symbol}-${tradeDate}-${i+1}` ``。用 number 声明会让 rowKey 与实际数据不符。
 *
 * 3. **「今日」视图不能传 `date=今天`**（归档版 :66）
 *    休市日按今天查真实源必然返回空数组，会被用户误读成「当天零成交」。
 *    后端已支持**不传 date 自动回退到最近一个有成交的交易日**（`getLatestBlockTrades`），
 *    所以本页默认视图**不传 date**，并展示后端返回的 `dataDateNote` 说明数据实际截至哪天。
 *
 * 4. **必须消费诚实契约字段**（归档版完全没有）
 *    后端会返回 `dataSource` / `dataDateNote` / `message`：
 *    - `dataSource:'unavailable'` → 上游真实源不可达。此时**渲染可解释文案，绝不渲染空表**
 *      （空表会被读成「今天没有大宗交易」，是失真）。
 *    - `dataSource:'realtime'` + `message` → 源可达但当日无成交，两者含义完全不同，不能混为一谈。
 *
 * ## 为什么不用 `services/api.ts` 的 `fetchBlockTrades*`
 *
 * 那三个封装（api.ts:623-638）内部是 `rawGet('/api/block-trades?...')`，而 `rawGet` 走
 * axios 实例，其 baseURL 来自 `config/apiBase.ts`，dev 下**已经是 `/api`** —— 拼出来是
 * `/api/api/block-trades`，实测 404（`{"code":"NOT_FOUND"}`）。
 * 正确写法是**不带 `/api` 前缀**（对齐 `breadthService` 的 `apiService.get('/breadth/current')`）。
 * 由于 `services/api.ts` 不在本工单的允许改动范围内，这里复用**同一个 axios 实例**
 * （`apiService.get`），继承其重试/缓存/拦截器，不另建第二套数据层、也不是裸写 fetch。
 * 待 `api.ts` 的 `rawGet('/api/...')` 前缀被修正后，可一行切回 `fetchBlockTrades`。
 *
 * ## 本单不展示 industryDistribution
 *
 * 后端诚实返回 `[]`（真实大宗交易接口不含行业字段，且无可靠 symbol→行业映射），
 * 绝不用随机行业填充，故本页不渲染该模块。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Table, Tag, Space, Typography, Button, Tooltip, Progress, Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SwapOutlined, RiseOutlined, FallOutlined, DollarOutlined,
  ReloadOutlined, InfoCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { apiService } from '../services/api';
import logger from '../utils/logger';

// ===== 类型（与 backend/src/api/block-trades.ts 的响应契约对齐） =====

interface BlockTrade {
  /** 后端 withStableId 产出的稳定 id，**字符串**形如 `601088-2026-09-30-1` */
  id: string;
  symbol: string;
  name: string;
  tradeDate: string;
  price: number;
  closePrice: number;
  volume: number;
  amount: number;
  /** 折溢价率，单位 %。>0 溢价、<0 折价 */
  discount: number;
  buyer: string;
  seller: string;
}

interface BlockTradeSummary {
  totalAmount: number;
  totalVolume: number;
  avgDiscount: number;
  premiumCount: number;
  discountCount: number;
  tradeCount: number;
}

interface BlockTradesResp {
  /** 'realtime' = 真实源可达（可能含 0 条）；'unavailable' = 上游不可达 */
  dataSource: 'realtime' | 'unavailable' | string;
  date?: string;
  /** 休市日/无成交时说明数据实际截至哪个交易日 */
  dataDateNote?: string;
  /** 诚实降级说明（中文），可直接展示 */
  message?: string;
  trades: BlockTrade[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: BlockTradeSummary;
}

// ===== 主题（深色） =====

const BG = '#0f172a';
const CARD_BG = '#1a2332';
const BORDER = '#2a3547';
const TEXT = '#e2e8f0';
const TEXT_SEC = '#94a3b8';
/** 涨红跌绿（A 股口径） */
const COLOR_UP = '#ef4444';
const COLOR_DOWN = '#22c55e';
const WARN = '#f59e0b';

const PAGE_SIZE = 20;

const formatAmount = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)} 亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)} 万`;
  return val.toFixed(0);
};

const formatVolume = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)} 亿股`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(0)} 万股`;
  return `${val} 股`;
};

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: '14px 16px',
};

/** 诚实契约提示条：dataDateNote（休市说明）/ message（降级原因） */
const NoticeBar: React.FC<{ tone: 'info' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    data-testid={tone === 'warn' ? 'block-trades-degraded' : 'block-trades-datanote'}
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', marginBottom: 16,
      borderRadius: 8,
      background: tone === 'warn' ? 'rgba(245,158,11,0.10)' : 'rgba(56,132,255,0.10)',
      border: `1px solid ${tone === 'warn' ? 'rgba(245,158,11,0.35)' : 'rgba(56,132,255,0.30)'}`,
      color: tone === 'warn' ? WARN : TEXT_SEC,
      fontSize: 13, lineHeight: 1.6,
    }}
  >
    {tone === 'warn'
      ? <WarningOutlined style={{ marginTop: 3, flexShrink: 0 }} />
      : <InfoCircleOutlined style={{ marginTop: 3, flexShrink: 0 }} />}
    <span>{children}</span>
  </div>
);

const BlockTradesPage: React.FC = () => {
  const [resp, setResp] = useState<BlockTradesResp | null>(null);
  /** 网络/请求异常（非「上游不可用」）—— 与 dataSource='unavailable' 是不同事实，分开呈现 */
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // 关键：**不传 date**，由后端回退到最近一个有成交的交易日（休市日传今天必然空）。
      const res = await apiService.get<BlockTradesResp>('/block-trades', {
        page,
        pageSize: PAGE_SIZE,
      });
      setResp(res.data);
    } catch (err) {
      logger.error('加载大宗交易失败:', err);
      setResp(null);
      setFetchError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const summary = resp?.summary ?? null;
  const pagination = resp?.pagination ?? null;
  const trades = resp?.trades ?? [];

  /** dataSource='unavailable' → 上游真实源不可达，这是「拿不到数据」，必须出文案而非空表 */
  const isUnavailable = resp?.dataSource === 'unavailable';
  const isEmptyButReal = !isUnavailable && trades.length === 0;

  const columns: ColumnsType<BlockTrade> = [
    {
      title: '排名',
      key: 'rank',
      width: 64,
      render: (_: unknown, __: unknown, index: number) => {
        const rank = (page - 1) * PAGE_SIZE + index + 1;
        if (rank <= 3) {
          const color = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
          return <Tag color={color} style={{ fontWeight: 700 }}>{rank}</Tag>;
        }
        return <span style={{ color: TEXT_SEC }}>{rank}</span>;
      },
    },
    {
      title: '股票',
      key: 'stock',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          {/* 行内可点进个股详情（用 Link 而非归档版的 <a href>，避免整页刷新） */}
          <Link to={`/stocks/${record.symbol}`} style={{ fontWeight: 600 }}>{record.name}</Link>
          <span style={{ color: TEXT_SEC, fontSize: 12 }}>{record.symbol}</span>
        </Space>
      ),
    },
    {
      title: '成交价',
      dataIndex: 'price',
      width: 96,
      sorter: (a, b) => a.price - b.price,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: TEXT }}>{v.toFixed(2)}</span>,
    },
    {
      title: '收盘价',
      dataIndex: 'closePrice',
      width: 96,
      render: (v: number) => <span style={{ fontFamily: 'monospace', color: TEXT_SEC }}>{v.toFixed(3)}</span>,
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      width: 108,
      sorter: (a, b) => a.volume - b.volume,
      render: (v: number) => <span style={{ color: TEXT }}>{formatVolume(v)}</span>,
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      width: 112,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.amount - b.amount,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: COLOR_UP }}>{formatAmount(v)}</span>,
    },
    {
      title: '折溢价率',
      dataIndex: 'discount',
      width: 104,
      sorter: (a, b) => a.discount - b.discount,
      render: (v: number) => {
        const color = v > 0 ? COLOR_UP : v < 0 ? COLOR_DOWN : TEXT_SEC;
        return (
          <Tag color={v > 0 ? 'red' : v < 0 ? 'green' : 'default'} style={{ color, fontFamily: 'monospace' }}>
            {v > 0 ? '+' : ''}{v.toFixed(2)}%
          </Tag>
        );
      },
    },
    {
      title: '买方营业部',
      dataIndex: 'buyer',
      width: 180,
      ellipsis: true,
      render: (v: string) => (v ? <Tooltip title={v}><span style={{ color: TEXT }}>{v}</span></Tooltip> : <span style={{ color: TEXT_SEC }}>—</span>),
    },
    {
      title: '卖方营业部',
      dataIndex: 'seller',
      width: 180,
      ellipsis: true,
      render: (v: string) => (v ? <Tooltip title={v}><span style={{ color: TEXT }}>{v}</span></Tooltip> : <span style={{ color: TEXT_SEC }}>—</span>),
    },
  ];

  const statCards = summary && summary.tradeCount > 0 ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}>成交笔数</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>{summary.tradeCount}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}><DollarOutlined /> 总成交额</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: COLOR_UP, fontFamily: 'monospace' }}>{formatAmount(summary.totalAmount)}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}>总成交量</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>{formatVolume(summary.totalVolume)}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}>
          平均折溢价{summary.avgDiscount !== 0 && (summary.avgDiscount > 0 ? <RiseOutlined /> : <FallOutlined />)}
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
          color: summary.avgDiscount > 0 ? COLOR_UP : summary.avgDiscount < 0 ? COLOR_DOWN : TEXT_SEC,
        }}>
          {summary.avgDiscount > 0 ? '+' : ''}{summary.avgDiscount.toFixed(2)}%
        </div>
      </div>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}>溢价成交</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: COLOR_UP, fontFamily: 'monospace' }}>{summary.premiumCount}</div>
      </div>
      <div style={cardStyle}>
        <div style={{ color: TEXT_SEC, fontSize: 12 }}>折价成交</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: COLOR_DOWN, fontFamily: 'monospace' }}>{summary.discountCount}</div>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT, padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Typography.Title level={3} style={{ color: TEXT, margin: 0 }}>
              <SwapOutlined /> 大宗交易
            </Typography.Title>
            <div style={{ color: TEXT_SEC, fontSize: 12, marginTop: 4 }}>
              真实源：东方财富大宗交易接口 · 默认展示最近一个有成交的交易日
            </div>
          </div>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
        </div>

        {/* ---- 诚实契约消费区 ---- */}

        {/* (a) 请求异常 */}
        {fetchError && (
          <NoticeBar tone="warn">
            大宗交易接口请求失败：{fetchError}。这表示未能取到数据，不代表当天没有大宗交易。
          </NoticeBar>
        )}

        {/* (b) dataSource='unavailable' —— 上游真实源不可达 */}
        {isUnavailable && (
          <NoticeBar tone="warn">
            上游大宗交易数据源暂不可用
            {resp?.message ? `：${resp.message}` : '。'}
            <br />
            下方不展示交易表格——空表会被误读为「当天零成交」。
          </NoticeBar>
        )}

        {/* (c) dataDateNote —— 休市日/当日无成交时，明确告知数据截至哪天 */}
        {!isUnavailable && resp?.dataDateNote && (
          <NoticeBar tone="info">{resp.dataDateNote}</NoticeBar>
        )}

        {/* (d) 源可达但当日无成交（realtime + message）：与 unavailable 语义不同 */}
        {isEmptyButReal && (
          <NoticeBar tone="info">
            {resp?.message || '真实源在最近交易日无大宗交易记录。'}
          </NoticeBar>
        )}

        {/* 统计卡：仅在真实拿到数据时展示 */}
        {!isUnavailable && statCards}

        {/* 溢价/折价分布 */}
        {!isUnavailable && summary && summary.tradeCount > 0 && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ color: TEXT_SEC, fontSize: 13, whiteSpace: 'nowrap' }}>溢价/折价分布</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Progress
                  percent={Math.round((summary.premiumCount / summary.tradeCount) * 100)}
                  success={{ percent: Math.round((summary.discountCount / summary.tradeCount) * 100) }}
                  strokeColor={COLOR_UP}
                  format={() => `溢价 ${summary.premiumCount} 笔 / 折价 ${summary.discountCount} 笔`}
                />
              </div>
            </div>
          </div>
        )}

        {/* 交易表格：unavailable 时不渲染 */}
        {!fetchError && !isUnavailable && (
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <Spin spinning={loading}>
              <Table<BlockTrade>
                columns={columns}
                dataSource={trades}
                rowKey="id"
                size="small"
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total: pagination?.total ?? 0,
                  onChange: setPage,
                  showSizeChanger: false,
                  showTotal: (t) => `共 ${t} 笔`,
                  style: { background: CARD_BG },
                }}
                scroll={{ x: 1200 }}
                locale={{ emptyText: '暂无真实大宗交易记录' }}
              />
            </Spin>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockTradesPage;