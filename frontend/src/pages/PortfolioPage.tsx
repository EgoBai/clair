/**
 * 投资组合管理页面
 * 持仓管理、收益计算、资产配置饼图
 * 参考雪球投资组合功能
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Card, Row, Col, Table, Tag, Button, Statistic, Space, Typography,
  Modal, Form, Input, InputNumber, Select, Popconfirm, Tooltip,
  Empty, Spin, Alert, Divider,
} from 'antd';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, WalletOutlined,
  RiseOutlined, FallOutlined, PieChartOutlined,
} from '@ant-design/icons';
import { apiService } from '../services/api';
import { formatNumber, formatChangePercent, formatTurnover } from '../utils/formatters';

const { Title, Text } = Typography;
const { Option } = Select;

// ==================== 类型 ====================

interface Position {
  id: number;
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  costTotal: number;
  profit: number;
  profitPercent: number;
  weight: number;
  buyDate: string;
  notes: string;
}

interface Portfolio {
  id: number;
  name: string;
  description: string;
  totalCost: number;
  totalMarketValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  cashBalance: number;
  totalValue: number;
  positions: Position[];
  allocation: { name: string; value: number; weight: number }[];
  createdAt: string;
}

// ==================== 颜色 ====================

const PIE_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280'];

// 行业归类（用于资产配置聚合）
const INDUSTRY: Record<string, string> = {
  '600519': '白酒',
  '000858': '白酒',
  '300750': '动力电池',
  '600036': '银行',
  '000001': '银行',
};

// ==================== 演示数据兜底 ====================
// 后端持仓接口当前未接入（技术债 T6），返回一个可复现的固定演示组合。

function buildDemoPortfolio(): Portfolio {
  const cashBalance = 50000;
  const base: Omit<Position, 'marketValue' | 'costTotal' | 'profit' | 'profitPercent' | 'weight'>[] = [
    { id: 1, symbol: '600519', name: '贵州茅台', quantity: 100, costPrice: 1600, currentPrice: 1700, buyDate: '2024-03-12', notes: '白酒龙头，长期持有' },
    { id: 2, symbol: '000858', name: '五粮液', quantity: 200, costPrice: 150, currentPrice: 145, buyDate: '2024-05-20', notes: '次高端补仓' },
    { id: 3, symbol: '300750', name: '宁德时代', quantity: 300, costPrice: 200, currentPrice: 220, buyDate: '2024-06-01', notes: '新能源电池龙头' },
    { id: 4, symbol: '600036', name: '招商银行', quantity: 500, costPrice: 35, currentPrice: 38, buyDate: '2024-07-15', notes: '高股息银行' },
    { id: 5, symbol: '000001', name: '平安银行', quantity: 1000, costPrice: 12, currentPrice: 11, buyDate: '2024-08-02', notes: '零售转型标的' },
  ];

  const positions: Position[] = base.map((p) => {
    const costTotal = p.quantity * p.costPrice;
    const marketValue = p.quantity * p.currentPrice;
    const profit = marketValue - costTotal;
    return {
      ...p,
      costTotal,
      marketValue,
      profit,
      profitPercent: (profit / costTotal) * 100,
      weight: 0,
    };
  });

  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.costTotal, 0);
  const totalValue = totalMarketValue + cashBalance;
  const totalProfit = totalMarketValue - totalCost;

  positions.forEach((p) => {
    p.weight = (p.marketValue / totalValue) * 100;
  });

  // 按行业归类聚合资产配置
  const industryMap: Record<string, number> = {};
  base.forEach((p, i) => {
    const ind = INDUSTRY[p.symbol] ?? '其他';
    industryMap[ind] = (industryMap[ind] ?? 0) + positions[i].marketValue;
  });
  const allocation = Object.entries(industryMap).map(([name, value]) => ({
    name,
    value,
    weight: (value / totalMarketValue) * 100,
  }));

  return {
    id: 1,
    name: '演示组合',
    description: 'A股核心资产演示组合',
    totalCost,
    totalMarketValue,
    totalProfit,
    totalProfitPercent: (totalProfit / totalCost) * 100,
    cashBalance,
    totalValue,
    positions,
    allocation,
    createdAt: '2024-03-12',
  };
}

// ==================== 组件 ====================

function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  // 加载投资组合
  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    try {
      // 先获取列表
      const listRes = await apiService.getPortfolios();
      if (listRes.success) {
        const listData = listRes.data as { portfolios: Portfolio[] };
        if (listData.portfolios && listData.portfolios.length > 0) {
          const firstId = listData.portfolios[0].id;
          const detailRes = await apiService.getPortfolio(firstId);
          if (detailRes.success) {
            setPortfolio(detailRes.data as Portfolio);
            setUsingDemo(false);
            return;
          }
        }
        // 列表成功但组合为空 → 回退演示数据
        setPortfolio(buildDemoPortfolio());
        setUsingDemo(true);
        return;
      }
    } catch (err: unknown) {
      // 后端接口未接入（技术债 T6）→ 回退演示数据
      setError(null);
      setPortfolio(buildDemoPortfolio());
      setUsingDemo(true);
      return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  // 添加持仓
  const handleAdd = useCallback(async () => {
    try {
      const values = await form.validateFields();
      if (!portfolio) return;
      await apiService.addPosition(portfolio.id, values);
      setAddModalOpen(false);
      form.resetFields();
      await loadPortfolio();
    } catch (err) {
      // form validation error
    }
  }, [portfolio, form, loadPortfolio]);

  // 删除持仓
  const handleDelete = useCallback(async (symbol: string) => {
    if (!portfolio) return;
    await apiService.deletePosition(portfolio.id, symbol);
    await loadPortfolio();
  }, [portfolio, loadPortfolio]);

  // 编辑持仓
  const handleEdit = useCallback(async () => {
    try {
      const values = await editForm.validateFields();
      if (!portfolio || !editingPosition) return;
      await apiService.updatePosition(portfolio.id, editingPosition.symbol, values);
      setEditModalOpen(false);
      setEditingPosition(null);
      editForm.resetFields();
      await loadPortfolio();
    } catch (err) {
      // form validation error
    }
  }, [portfolio, editingPosition, editForm, loadPortfolio]);

  // 持仓表格列
  const columns = [
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_: unknown, r: Position) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '持仓量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '成本价',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 80,
      render: (v: number) => formatNumber(v),
    },
    {
      title: '现价',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 80,
      render: (v: number) => formatNumber(v),
    },
    {
      title: '市值',
      dataIndex: 'marketValue',
      key: 'marketValue',
      width: 100,
      render: (v: number) => formatTurnover(v),
    },
    {
      title: '盈亏',
      key: 'profit',
      width: 120,
      render: (_: unknown, r: Position) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: r.profit >= 0 ? '#EF4444' : '#22C55E' }}>
            {r.profit >= 0 ? '+' : ''}{r.profit.toFixed(2)}
          </Text>
          <Tag color={r.profitPercent >= 0 ? 'red' : 'green'} style={{ fontSize: 11 }}>
            {formatChangePercent(r.profitPercent)}
          </Tag>
        </Space>
      ),
    },
    {
      title: '仓位占比',
      dataIndex: 'weight',
      key: 'weight',
      width: 80,
      render: (v: number) => `${v}%`,
    },
    {
      title: '买入日期',
      dataIndex: 'buyDate',
      key: 'buyDate',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, r: Position) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingPosition(r);
                editForm.setFieldsValue(r);
                setEditModalOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm title="确定删除该持仓？" onConfirm={() => handleDelete(r.symbol)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 资产配置数据
  const pieData = useMemo(() => {
    if (!portfolio?.allocation) return [];
    return portfolio.allocation.map((a) => ({
      name: a.name,
      value: a.weight,
      amount: a.value,
    }));
  }, [portfolio?.allocation]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <WalletOutlined style={{ marginRight: 8 }} />
        投资组合
      </Title>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} closable />
      )}

      {usingDemo && (
        <Alert
          type="info"
          showIcon
          message="当前展示演示数据（持仓后端接口待接入）"
          style={{ marginBottom: 16 }}
        />
      )}

      {!portfolio ? (
        <Card>
          <Empty description="暂无投资组合">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPortfolio(buildDemoPortfolio()); setUsingDemo(true); }}>
              加载示例组合
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {/* 组合概览 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card>
                <Statistic
                  title="总资产"
                  value={portfolio.totalValue}
                  prefix="¥"
                  formatter={(v) => String(Number(v).toLocaleString())}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="持仓市值"
                  value={portfolio.totalMarketValue}
                  prefix="¥"
                  formatter={(v) => String(Number(v).toLocaleString())}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="现金余额"
                  value={portfolio.cashBalance}
                  prefix="¥"
                  formatter={(v) => String(Number(v).toLocaleString())}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="总盈亏"
                  value={portfolio.totalProfit}
                  prefix={portfolio.totalProfit >= 0 ? '+' : ''}
                  formatter={(v) => String(Number(v).toLocaleString())}
                  valueStyle={{ color: portfolio.totalProfit >= 0 ? '#EF4444' : '#22C55E' }}
                  suffix="元"
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="收益率"
                  value={portfolio.totalProfitPercent}
                  precision={2}
                  suffix="%"
                  prefix={portfolio.totalProfitPercent >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  valueStyle={{ color: portfolio.totalProfitPercent >= 0 ? '#EF4444' : '#22C55E' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic title="持仓数" value={portfolio.positions.length} suffix="只" />
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            {/* 持仓列表 */}
            <Col span={17}>
              <Card
                title={`${portfolio.name} - 持仓明细`}
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
                    添加持仓
                  </Button>
                }
              >
                <Table
                  columns={columns}
                  dataSource={portfolio.positions}
                  rowKey="symbol"
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无持仓" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                />
              </Card>
            </Col>

            {/* 资产配置饼图 */}
            <Col span={7}>
              <Card title={<><PieChartOutlined style={{ marginRight: 6 }} />资产配置</>}>
                {pieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, value }) => `${name} ${value}%`}
                          labelLine={{ strokeWidth: 1 }}
                        >
                          {pieData.map((_, index) => (
                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RTooltip
                          formatter={(value, name, props) => [
                            `${value ?? 0}% (¥${(props as { payload?: { amount?: number } })?.payload?.amount?.toLocaleString()})`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <Divider style={{ margin: '8px 0' }} />
                    {pieData.map((item, i) => (
                      <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <Space>
                          <div style={{
                            width: 10, height: 10, borderRadius: 2,
                            backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                          }} />
                          <Text style={{ fontSize: 12 }}>{item.name}</Text>
                        </Space>
                        <Text style={{ fontSize: 12 }} type="secondary">
                          {item.value}%
                        </Text>
                      </div>
                    ))}
                  </>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无配置数据" />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* 添加持仓弹窗 */}
      <Modal
        title="添加持仓"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); form.resetFields(); }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="symbol" label="股票代码" rules={[{ required: true, message: '请输入股票代码' }]}>
            <Input placeholder="如 000001.SZ" />
          </Form.Item>
          <Form.Item name="name" label="股票名称" rules={[{ required: true, message: '请输入股票名称' }]}>
            <Input placeholder="如 平安银行" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="quantity" label="持有数量" rules={[{ required: true, message: '请输入数量' }]}>
                <InputNumber min={100} step={100} style={{ width: '100%' }} placeholder="100的倍数" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="costPrice" label="成本价" rules={[{ required: true, message: '请输入成本价' }]}>
                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="buyDate" label="买入日期">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="投资逻辑..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑持仓弹窗 */}
      <Modal
        title="编辑持仓"
        open={editModalOpen}
        onOk={handleEdit}
        onCancel={() => { setEditModalOpen(false); setEditingPosition(null); editForm.resetFields(); }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="股票">
            <Input value={editingPosition?.name} disabled />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="quantity" label="持有数量">
                <InputNumber min={100} step={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="costPrice" label="成本价">
                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PortfolioPage;
