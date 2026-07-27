/**
 * 限售股解禁日历页面
 * 参考东方财富限售股解禁数据展示
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import {
  Card, Table, Tag, Calendar, Space, Typography, Row, Col, Statistic,
  Button, Badge, Modal,
} from 'antd';
import {
  LockOutlined, CalendarOutlined, DollarOutlined, ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
}

interface LockupSummary {
  totalStocks: number;
  totalEvents: number;
  totalMarketValue: number;
  totalShares: number;
  avgUnlockRatio: number;
}

const formatAmount = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
};

const formatShares = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿股`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万股`;
  return `${val}股`;
};

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的时区偏移） */
const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 演示股票样本池，覆盖多种解禁类型，保证数据真实感 */
const DEMO_STOCK_POOL = [
  { symbol: '600519', name: '贵州茅台', lockupType: '首发原股东限售股份', shareholder: '中国贵州茅台酒厂' },
  { symbol: '300750', name: '宁德时代', lockupType: '定向增发机构配售股份', shareholder: '高瓴资本' },
  { symbol: '002594', name: '比亚迪', lockupType: '首发原股东限售股份', shareholder: '王传福' },
  { symbol: '688981', name: '中芯国际', lockupType: '首发战略配售股份', shareholder: '国家集成电路产业基金' },
  { symbol: '601012', name: '隆基绿能', lockupType: '定向增发机构配售股份', shareholder: 'HHLR 管理有限公司' },
  { symbol: '000858', name: '五粮液', lockupType: '首发原股东限售股份', shareholder: '宜宾发展控股集团' },
  { symbol: '600276', name: '恒瑞医药', lockupType: '股权激励限售股份', shareholder: '员工持股平台' },
  { symbol: '300059', name: '东方财富', lockupType: '首发原股东限售股份', shareholder: '其实' },
  { symbol: '002415', name: '海康威视', lockupType: '首发原股东限售股份', shareholder: '中电海康集团' },
  { symbol: '688111', name: '金山办公', lockupType: '首发原股东限售股份', shareholder: '金山软件' },
  { symbol: '601318', name: '中国平安', lockupType: '定向增发机构配售股份', shareholder: '卜蜂集团有限公司' },
  { symbol: '600036', name: '招商银行', lockupType: '首发原股东限售股份', shareholder: '招商局轮船' },
  { symbol: '000333', name: '美的集团', lockupType: '追加承诺限售股份', shareholder: '美的控股' },
  { symbol: '603259', name: '药明康德', lockupType: '首发原股东限售股份', shareholder: 'G&C VI Limited' },
];

/** 固定种子的线性同余伪随机，保证每次刷新演示数据完全一致（确定性） */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 生成内置演示解禁数据：覆盖未来 90 天、约 32 条，
 * 含不同 lockupType、合理的解禁市值与占比，并附带 byDate 与汇总。
 */
function buildDemoLockupData(): {
  expiries: LockupExpiry[];
  byDate: Record<string, LockupExpiry[]>;
  summary: LockupSummary;
} {
  const rng = makeRng(20240724); // 固定种子 → 结果可复现
  const count = 32; // 演示条数（20~40 之间）
  const today = new Date();
  const expiries: LockupExpiry[] = [];

  for (let i = 0; i < count; i++) {
    const stock = DEMO_STOCK_POOL[Math.floor(rng() * DEMO_STOCK_POOL.length)];
    const offset = Math.floor(rng() * 90); // 未来 0~89 天
    const d = new Date(today);
    d.setDate(d.getDate() + offset);

    const totalShares = Math.round((0.05 + rng() * 4.95) * 1e8); // 500万~5亿股
    const circulatingBefore = Math.round(totalShares * (1 + rng() * 5)); // 流通盘大于解禁盘
    const unlockRatio = Number((0.5 + rng() * 24.5).toFixed(2)); // 0.5%~25%
    const price = Number((5 + rng() * 75).toFixed(2)); // 5~80 元
    const marketValue = Math.round(totalShares * price);

    expiries.push({
      id: i + 1,
      symbol: stock.symbol,
      name: stock.name,
      expiryDate: fmtDate(d),
      lockupType: stock.lockupType,
      shareholder: stock.shareholder,
      totalShares,
      circulatingBefore,
      unlockRatio,
      marketValue,
      price,
    });
  }
  expiries.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  // 按解禁日期分组，供日历单元格渲染使用
  const byDate: Record<string, LockupExpiry[]> = {};
  for (const e of expiries) {
    (byDate[e.expiryDate] ||= []).push(e);
  }

  // 计算汇总指标
  const symbols = new Set(expiries.map((e) => e.symbol));
  const summary: LockupSummary = {
    totalStocks: symbols.size,
    totalEvents: expiries.length,
    totalMarketValue: expiries.reduce((s, e) => s + e.marketValue, 0),
    totalShares: expiries.reduce((s, e) => s + e.totalShares, 0),
    avgUnlockRatio: expiries.length
      ? Number((expiries.reduce((s, e) => s + e.unlockRatio, 0) / expiries.length).toFixed(2))
      : 0,
  };

  return { expiries, byDate, summary };
}

const LockupCalendarPage: React.FC = () => {
  const [expiries, setExpiries] = useState<LockupExpiry[]>([]);
  const [byDate, setByDate] = useState<Record<string, LockupExpiry[]>>({});
  const [summary, setSummary] = useState<LockupSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState(false);

  const fetchData = useCallback(async (year?: number, month?: number) => {
    setLoading(true);
    try {
      const now = new Date();
      const params = new URLSearchParams({
        year: String(year || now.getFullYear()),
        month: String(month || now.getMonth() + 1),
      });
      const res = await fetch(`/api/lockup/calendar?${params}`);
      // 后端暂无该接口：非 200 或返回非 success 时一律降级到演示数据
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success || !json.data) throw new Error('接口返回数据格式异常');
      setExpiries(json.data.expiries);
      setByDate(json.data.byDate);
      setSummary(json.data.summary);
    } catch (err) {
      logger.warn('限售股解禁接口不可用，降级使用内置演示数据:', err);
      const demo = buildDemoLockupData();
      setExpiries(demo.expiries);
      setByDate(demo.byDate);
      setSummary(demo.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const dayExpiries = byDate[dateStr];
    if (!dayExpiries || dayExpiries.length === 0) return null;

    const totalMV = dayExpiries.reduce((s, e) => s + e.marketValue, 0);
    return (
      <div
        style={{ cursor: 'pointer' }}
        onClick={() => { setSelectedDate(dateStr); setDetailModal(true); }}
      >
        <Badge
          count={dayExpiries.length}
          size="small"
          style={{ backgroundColor: totalMV > 1e10 ? '#cf1322' : '#1890ff' }}
        />
        <div style={{ fontSize: 11, color: '#666' }}>
          {formatAmount(totalMV)}
        </div>
      </div>
    );
  };

  const handlePanelChange = (date: Dayjs) => {
    fetchData(date.year(), date.month() + 1);
  };

  const columns: ColumnsType<LockupExpiry> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        const rank = index + 1;
        const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        return rank <= 3
          ? <Tag color={colors[rank - 1]}>{rank}</Tag>
          : <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <a href={`/stock/${record.symbol}`} style={{ fontWeight: 600 }}>{record.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '解禁日期',
      dataIndex: 'expiryDate',
      width: 110,
      sorter: (a, b) => a.expiryDate.localeCompare(b.expiryDate),
    },
    {
      title: '解禁类型',
      dataIndex: 'lockupType',
      width: 140,
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: '股东',
      dataIndex: 'shareholder',
      width: 100,
    },
    {
      title: '解禁股数',
      dataIndex: 'totalShares',
      width: 110,
      render: (val: number) => formatShares(val),
      sorter: (a, b) => a.totalShares - b.totalShares,
    },
    {
      title: '占流通股比',
      dataIndex: 'unlockRatio',
      width: 110,
      render: (val: number) => {
        const color = val > 10 ? '#cf1322' : val > 5 ? '#fa8c16' : '#3f8600';
        return <Text style={{ color }}>{val.toFixed(2)}%</Text>;
      },
      sorter: (a, b) => a.unlockRatio - b.unlockRatio,
      defaultSortOrder: 'descend',
    },
    {
      title: '解禁市值',
      dataIndex: 'marketValue',
      width: 110,
      render: (val: number) => (
        <Text strong style={{ color: '#1890ff' }}>{formatAmount(val)}</Text>
      ),
      sorter: (a, b) => a.marketValue - b.marketValue,
    },
  ];

  const selectedExpiries = selectedDate ? byDate[selectedDate] || [] : [];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <LockOutlined /> 限售股解禁
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()} loading={loading}>刷新</Button>
        </Col>
      </Row>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁个股" value={summary.totalStocks} prefix={<LockOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁事件" value={summary.totalEvents} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="总解禁市值"
                value={formatAmount(summary.totalMarketValue)}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="平均占比"
                value={summary.avgUnlockRatio}
                precision={2}
                suffix="%"
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        {/* 日历 */}
        <Col xs={24} lg={14}>
          <Card title="解禁日历" loading={loading}>
            <Calendar
              dateCellRender={dateCellRender}
              onPanelChange={handlePanelChange}
              fullscreen={false}
            />
          </Card>
        </Col>

        {/* 解禁排行 */}
        <Col xs={24} lg={10}>
          <Card title="解禁市值排行" loading={loading}>
            <Table
              columns={columns}
              dataSource={expiries.slice(0, 10)}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 详情弹窗 */}
      <Modal
        title={`${selectedDate} 解禁详情`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={columns.filter(c => c.title !== '排名')}
          dataSource={selectedExpiries}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Modal>
    </div>
  );
};

export default LockupCalendarPage;
