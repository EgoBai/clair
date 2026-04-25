/**
 * 选股器/筛选器页面
 * 多条件组合筛选 + 预设模板
 * 参考通达信选股器
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { apiService } from '../services/api';
import {
  Card, Table, Button, Select, InputNumber, Space, Tag, Row, Col,
  message, Tabs, Empty, Typography, Divider, Tooltip, Popconfirm,
  Form, Input, List, Badge, Modal,
} from 'antd';
import {
  FilterOutlined, PlayCircleOutlined, SaveOutlined, DeleteOutlined,
  PlusOutlined, RiseOutlined, FallOutlined, FireOutlined,
  ThunderboltOutlined, BankOutlined, StarOutlined, AimOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ==================== 类型 ====================

interface ScreenerCondition {
  field: string;
  operator: string;
  value: number | string | [number, number];
}

interface ScreenerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: ScreenerCondition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface ScreenerStock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  price: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio?: number | null;
  pbRatio?: number | null;
  marketCap?: number | null;
  circulatingMarketCap?: number | null;
}

interface FieldInfo {
  field: string;
  name: string;
  type: string;
  unit: string;
}

interface OperatorInfo {
  operator: string;
  name: string;
  symbol: string;
}

// ==================== 常量 ====================

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  '💎': <StarOutlined />,
  '🚀': <RiseOutlined />,
  '🔥': <FireOutlined />,
  '📈': <RiseOutlined />,
  '📉': <FallOutlined />,
  '📊': <ThunderboltOutlined />,
  '🎯': <AimOutlined />,
  '🏛️': <BankOutlined />,
  '🏆': <TrophyOutlined />,
  '📋': <FilterOutlined />,
};

const DEFAULT_FIELDS: FieldInfo[] = [
  { field: 'price', name: '最新价', type: 'number', unit: '元' },
  { field: 'change_percent', name: '涨跌幅', type: 'number', unit: '%' },
  { field: 'volume', name: '成交量', type: 'number', unit: '手' },
  { field: 'turnover', name: '成交额', type: 'number', unit: '元' },
  { field: 'turnover_rate', name: '换手率', type: 'number', unit: '%' },
  { field: 'pe_ratio', name: '市盈率', type: 'number', unit: '倍' },
  { field: 'pb_ratio', name: '市净率', type: 'number', unit: '倍' },
  { field: 'market_cap', name: '总市值', type: 'number', unit: '元' },
  { field: 'circulating_market_cap', name: '流通市值', type: 'number', unit: '元' },
];

const DEFAULT_OPERATORS: OperatorInfo[] = [
  { operator: 'gt', name: '大于', symbol: '>' },
  { operator: 'gte', name: '大于等于', symbol: '≥' },
  { operator: 'lt', name: '小于', symbol: '<' },
  { operator: 'lte', name: '小于等于', symbol: '≤' },
  { operator: 'between', name: '介于', symbol: '~' },
];

// ==================== API ====================

async function fetchTemplates(): Promise<{ presets: ScreenerTemplate[]; customs: ScreenerTemplate[] }> {
  const res = await apiService.get<{ presets: ScreenerTemplate[]; customs: ScreenerTemplate[] }>('/screener/templates');
  if (!res.success) throw new Error(res.error);
  return res.data;
}

async function runScreener(data: any): Promise<{ stocks: ScreenerStock[]; pagination: any }> {
  const res = await apiService.runScreener(data);
  if (!res.success) throw new Error(res.error);
  return res.data as any;
}

async function saveTemplate(data: any): Promise<ScreenerTemplate> {
  const res = await apiService.saveScreenerTemplate(data);
  if (!res.success) throw new Error(res.error);
  return res.data as ScreenerTemplate;
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await apiService.deleteScreenerTemplate(id);
  if (!res.success) throw new Error(res.error);
}

// ==================== 主组件 ====================

export default function ScreenerPage() {
  const navigate = useNavigate();
  const [conditions, setConditions] = useState<ScreenerCondition[]>([
    { field: 'change_percent', operator: 'gt', value: 0 },
  ]);
  const [sortBy, setSortBy] = useState('change_percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [results, setResults] = useState<ScreenerStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalCount: 0, totalPages: 0 });
  const [presets, setPresets] = useState<ScreenerTemplate[]>([]);
  const [customs, setCustoms] = useState<ScreenerTemplate[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('custom');
  const [fields] = useState<FieldInfo[]>(DEFAULT_FIELDS);
  const [operators] = useState<OperatorInfo[]>(DEFAULT_OPERATORS);

  // 加载模板
  useEffect(() => {
    fetchTemplates()
      .then((data) => {
        setPresets(data.presets);
        setCustoms(data.customs);
      })
      .catch((err) => logger.error('加载选股器模板失败:', err));
  }, []);

  // 添加条件
  const addCondition = () => {
    setConditions([...conditions, { field: 'price', operator: 'gt', value: 0 }]);
  };

  // 删除条件
  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  // 更新条件
  const updateCondition = (index: number, key: keyof ScreenerCondition, value: ScreenerCondition[keyof ScreenerCondition]) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [key]: value };
    setConditions(newConditions);
  };

  // 执行筛选
  const runFilter = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await runScreener({
        conditions,
        sortBy,
        sortOrder,
        page,
        pageSize: pagination.pageSize,
      });
      setResults(result.stocks);
      setPagination(result.pagination);
    } catch (err: any) {
      message.error(err.message || '筛选失败');
    } finally {
      setLoading(false);
    }
  }, [conditions, sortBy, sortOrder, pagination.pageSize]);

  // 运行模板
  const runTemplate = async (template: ScreenerTemplate) => {
    setConditions(template.conditions);
    setSortBy(template.sortBy);
    setSortOrder(template.sortOrder);
    setLoading(true);
    try {
      const result = await runScreener({
        conditions: template.conditions,
        sortBy: template.sortBy,
        sortOrder: template.sortOrder,
        page: 1,
        pageSize: 50,
      });
      setResults(result.stocks);
      setPagination(result.pagination);
      setActiveTab('custom');
      message.success(`"${template.name}" 筛选完成`);
    } catch (err: any) {
      message.error(err.message || '筛选失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存模板
  const handleSave = async (values: any) => {
    try {
      const template = await saveTemplate({
        name: values.name,
        description: values.description,
        conditions,
        sortBy,
        sortOrder,
      });
      setCustoms([...customs, template]);
      setSaveModalOpen(false);
      saveForm.resetFields();
      message.success('模板保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  // 删除自定义模板
  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      setCustoms(customs.filter((t) => t.id !== id));
      message.success('模板已删除');
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  // 格式化金额
  const formatMoney = (val?: number | null) => {
    if (val == null) return '-';
    if (val >= 1e12) return (val / 1e12).toFixed(2) + '万亿';
    if (val >= 1e8) return (val / 1e8).toFixed(2) + '亿';
    if (val >= 1e4) return (val / 1e4).toFixed(0) + '万';
    return val.toFixed(2);
  };

  // 结果表格列
  const resultColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, index: number) => {
        const rank = (pagination.page - 1) * pagination.pageSize + index + 1;
        const color = rank <= 3 ? ['#f5222d', '#fa8c16', '#faad14'][rank - 1] : undefined;
        return <Text strong style={{ color }}>{rank}</Text>;
      },
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 100,
      render: (symbol: string) => (
        <Button type="link" onClick={() => navigate(`/stock/${symbol}`)} style={{ padding: 0 }}>
          {symbol}
        </Button>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      ellipsis: true,
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (val: number) => val?.toFixed(2) || '-',
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 90,
      sorter: true,
      render: (val: number) => {
        const color = val > 0 ? '#f5222d' : val < 0 ? '#52c41a' : undefined;
        return <Text style={{ color }}>{val > 0 ? '+' : ''}{val?.toFixed(2)}%</Text>;
      },
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      key: 'turnover',
      width: 100,
      render: (val: number) => formatMoney(val),
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 80,
      render: (val: number) => val?.toFixed(2) + '%',
    },
    {
      title: '市盈率',
      dataIndex: 'peRatio',
      key: 'peRatio',
      width: 80,
      render: (val?: number | null) => val != null ? val.toFixed(2) : '-',
    },
    {
      title: '市净率',
      dataIndex: 'pbRatio',
      key: 'pbRatio',
      width: 80,
      render: (val?: number | null) => val != null ? val.toFixed(2) : '-',
    },
    {
      title: '流通市值',
      dataIndex: 'circulatingMarketCap',
      key: 'circulatingMarketCap',
      width: 100,
      render: (val?: number | null) => formatMoney(val),
    },
  ];

  return (
    <div className="screener-page">
      <Row gutter={16}>
        {/* 左侧：条件面板 */}
        <Col xs={24} lg={8}>
          <Card
            title={<Space><FilterOutlined />筛选条件</Space>}
            extra={
              <Space>
                <Button size="small" icon={<PlusOutlined />} onClick={addCondition}>添加</Button>
                <Button size="small" icon={<SaveOutlined />} onClick={() => setSaveModalOpen(true)}>保存</Button>
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => runFilter(1)} loading={loading}>
                  执行
                </Button>
              </Space>
            }
            size="small"
          >
            {/* 条件列表 */}
            {conditions.map((cond, index) => (
              <Row key={index} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col flex="120px">
                  <Select
                    value={cond.field}
                    onChange={(v) => updateCondition(index, 'field', v)}
                    size="small"
                    style={{ width: '100%' }}
                  >
                    {fields.map((f) => (
                      <Option key={f.field} value={f.field}>{f.name}</Option>
                    ))}
                  </Select>
                </Col>
                <Col flex="90px">
                  <Select
                    value={cond.operator}
                    onChange={(v) => updateCondition(index, 'operator', v)}
                    size="small"
                    style={{ width: '100%' }}
                  >
                    {operators.map((o) => (
                      <Option key={o.operator} value={o.operator}>{o.symbol} {o.name}</Option>
                    ))}
                  </Select>
                </Col>
                <Col flex="auto">
                  {cond.operator === 'between' ? (
                    <Space size={4}>
                      <InputNumber
                        size="small"
                        value={Array.isArray(cond.value) ? cond.value[0] : 0}
                        onChange={(v) => updateCondition(index, 'value', [v || 0, Array.isArray(cond.value) ? cond.value[1] : 0])}
                        style={{ width: 80 }}
                      />
                      <Text type="secondary">~</Text>
                      <InputNumber
                        size="small"
                        value={Array.isArray(cond.value) ? cond.value[1] : 0}
                        onChange={(v) => updateCondition(index, 'value', [Array.isArray(cond.value) ? cond.value[0] : 0, v || 0])}
                        style={{ width: 80 }}
                      />
                    </Space>
                  ) : (
                    <InputNumber
                      size="small"
                      value={cond.value as number}
                      onChange={(v) => updateCondition(index, 'value', v || 0)}
                      style={{ width: '100%' }}
                      precision={2}
                    />
                  )}
                </Col>
                <Col>
                  {conditions.length > 1 && (
                    <Button size="small" type="text" danger onClick={() => removeCondition(index)}>×</Button>
                  )}
                </Col>
              </Row>
            ))}

            <Divider style={{ margin: '12px 0' }} />

            {/* 排序设置 */}
            <Row gutter={8}>
              <Col flex="auto">
                <Text type="secondary" style={{ fontSize: 12 }}>排序字段</Text>
                <Select value={sortBy} onChange={setSortBy} size="small" style={{ width: '100%' }}>
                  {fields.map((f) => (
                    <Option key={f.field} value={f.field}>{f.name}</Option>
                  ))}
                </Select>
              </Col>
              <Col flex="80px">
                <Text type="secondary" style={{ fontSize: 12 }}>方向</Text>
                <Select value={sortOrder} onChange={setSortOrder} size="small" style={{ width: '100%' }}>
                  <Option value="desc">降序 ↓</Option>
                  <Option value="asc">升序 ↑</Option>
                </Select>
              </Col>
            </Row>
          </Card>

          {/* 预设模板 */}
          <Card
            title="预设模板"
            size="small"
            style={{ marginTop: 16 }}
          >
            <List
              size="small"
              dataSource={presets}
              renderItem={(tpl) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '8px 12px' }}
                  onClick={() => runTemplate(tpl)}
                >
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 18 }}>{tpl.icon}</span>}
                    title={<Text strong>{tpl.name}</Text>}
                    description={<Text type="secondary" style={{ fontSize: 12 }}>{tpl.description}</Text>}
                  />
                  <PlayCircleOutlined style={{ color: '#1890ff' }} />
                </List.Item>
              )}
            />

            {customs.length > 0 && (
              <>
                <Divider orientation="left" style={{ fontSize: 12 }}>自定义模板</Divider>
                <List
                  size="small"
                  dataSource={customs}
                  renderItem={(tpl) => (
                    <List.Item
                      actions={[
                        <Tooltip title="运行" key="run">
                          <PlayCircleOutlined onClick={() => runTemplate(tpl)} style={{ color: '#1890ff' }} />
                        </Tooltip>,
                        <Popconfirm title="删除？" key="del" onConfirm={() => handleDeleteTemplate(tpl.id)}>
                          <DeleteOutlined style={{ color: '#f5222d' }} />
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        title={<Text>{tpl.name}</Text>}
                        description={<Text type="secondary" style={{ fontSize: 12 }}>{tpl.conditions.length} 个条件</Text>}
                      />
                    </List.Item>
                  )}
                />
              </>
            )}
          </Card>
        </Col>

        {/* 右侧：结果 */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <span>筛选结果</span>
                {pagination.totalCount > 0 && (
                  <Badge count={pagination.totalCount} style={{ backgroundColor: '#52c41a' }} />
                )}
              </Space>
            }
            size="small"
          >
            <Table
              columns={resultColumns}
              dataSource={results}
              rowKey="id"
              loading={loading}
              size="small"
              scroll={{ x: 900 }}
              pagination={{
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.totalCount,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 只`,
                onChange: (page) => runFilter(page),
              }}
              locale={{ emptyText: <Empty description="点击执行开始筛选" /> }}
            />
          </Card>
        </Col>
      </Row>

      {/* 保存模板弹窗 */}
      <Modal
        title="保存筛选模板"
        open={saveModalOpen}
        onCancel={() => { setSaveModalOpen(false); saveForm.resetFields(); }}
        onOk={() => saveForm.submit()}
      >
        <Form form={saveForm} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="例：我的价值股策略" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
