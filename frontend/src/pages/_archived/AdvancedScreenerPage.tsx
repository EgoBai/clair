/**
 * 高级选股器页面
 * - AND/OR 组合逻辑
 * - 技术指标筛选条件
 * - CSV/JSON 导出
 */

import { useState, useCallback } from 'react';
import {
  Card, Table, Button, Select, InputNumber, Space, Tag, Row, Col,
  message, Typography, Divider, Dropdown,
  Form, Input, List, Badge, Modal, Radio,
} from 'antd';
import { PlayCircleOutlined, SaveOutlined,
  PlusOutlined, DownloadOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

// ==================== 类型 ====================

type LogicType = 'and' | 'or';
type OperatorType = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between';

interface Condition {
  field: string;
  operator: OperatorType;
  value: number | [number, number];
}

interface ConditionGroup {
  logic: LogicType;
  conditions: Condition[];
}

interface FieldInfo {
  field: string;
  name: string;
  category: 'basic' | 'technical' | 'financial';
  unit: string;
}

interface AdvancedFilterRequest {
  groups: ConditionGroup[];
  logic?: LogicType;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

interface AdvancedPreset {
  name: string;
  icon?: string;
  description?: string;
  groups: ConditionGroup[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// ==================== 常量 ====================

const FIELDS: FieldInfo[] = [
  // 基础行情
  { field: 'price', name: '最新价', category: 'basic', unit: '元' },
  { field: 'change_percent', name: '涨跌幅', category: 'basic', unit: '%' },
  { field: 'volume', name: '成交量', category: 'basic', unit: '手' },
  { field: 'turnover', name: '成交额', category: 'basic', unit: '元' },
  { field: 'turnover_rate', name: '换手率', category: 'basic', unit: '%' },
  { field: 'amplitude', name: '振幅', category: 'basic', unit: '%' },
  // 技术指标
  { field: 'rsi', name: 'RSI', category: 'technical', unit: '' },
  { field: 'macd', name: 'MACD', category: 'technical', unit: '' },
  { field: 'macd_histogram', name: 'MACD柱', category: 'technical', unit: '' },
  { field: 'kdj_k', name: 'KDJ-K', category: 'technical', unit: '' },
  { field: 'kdj_d', name: 'KDJ-D', category: 'technical', unit: '' },
  { field: 'kdj_j', name: 'KDJ-J', category: 'technical', unit: '' },
  { field: 'ma5', name: 'MA5', category: 'technical', unit: '元' },
  { field: 'ma10', name: 'MA10', category: 'technical', unit: '元' },
  { field: 'ma20', name: 'MA20', category: 'technical', unit: '元' },
  { field: 'ma60', name: 'MA60', category: 'technical', unit: '元' },
  // 财务指标
  { field: 'pe_ratio', name: '市盈率', category: 'financial', unit: '倍' },
  { field: 'pb_ratio', name: '市净率', category: 'financial', unit: '倍' },
  { field: 'market_cap', name: '总市值', category: 'financial', unit: '元' },
  { field: 'circulating_market_cap', name: '流通市值', category: 'financial', unit: '元' },
];

const OPERATORS = [
  { operator: 'gt', name: '大于', symbol: '>' },
  { operator: 'gte', name: '大于等于', symbol: '≥' },
  { operator: 'lt', name: '小于', symbol: '<' },
  { operator: 'lte', name: '小于等于', symbol: '≤' },
  { operator: 'between', name: '介于', symbol: '~' },
];

const QUICK_CONDITIONS: Array<{ name: string; condition: Condition; description: string }> = [
  { name: 'RSI超卖', condition: { field: 'rsi', operator: 'lt', value: 30 }, description: 'RSI < 30' },
  { name: 'RSI超买', condition: { field: 'rsi', operator: 'gt', value: 70 }, description: 'RSI > 70' },
  { name: '低市盈率', condition: { field: 'pe_ratio', operator: 'lt', value: 20 }, description: 'PE < 20' },
  { name: '高换手率', condition: { field: 'turnover_rate', operator: 'gt', value: 5 }, description: '换手率 > 5%' },
  { name: '涨停', condition: { field: 'change_percent', operator: 'gte', value: 9.9 }, description: '涨幅 >= 9.9%' },
  { name: '跌停', condition: { field: 'change_percent', operator: 'lte', value: -9.9 }, description: '跌幅 <= -9.9%' },
  { name: 'KDJ-J超卖', condition: { field: 'kdj_j', operator: 'lt', value: 20 }, description: 'J < 20' },
  { name: '小盘股', condition: { field: 'circulating_market_cap', operator: 'lt', value: 5000000000 }, description: '流通市值 < 50亿' },
];

// ==================== API ====================

const API_BASE = '/api';

interface FilterResult {
  stocks: StockResult[];
  pagination: { page: number; pageSize: number; total: number; totalCount: number };
}

interface StockResult {
  ts_code: string;
  name: string;
  close: number;
  pct_chg: number;
  [key: string]: unknown;
}

async function runAdvancedFilter(data: AdvancedFilterRequest): Promise<FilterResult> {
  const res = await fetch(`${API_BASE}/screener/advanced-filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json() as { success: boolean; error?: string; data: FilterResult };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchPresets(): Promise<AdvancedPreset[]> {
  const res = await fetch(`${API_BASE}/screener/advanced-presets`);
  const json = await res.json() as { success: boolean; error?: string; data: AdvancedPreset[] };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ==================== 主组件 ====================

export default function AdvancedScreenerPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ConditionGroup[]>([
    { logic: 'and', conditions: [{ field: 'change_percent', operator: 'gt', value: 0 }] },
  ]);
  const [sortBy, setSortBy] = useState('change_percent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalCount: 0 });
  const [presets, setPresets] = useState<any[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveForm] = Form.useForm();

  // 条件组操作
  const addGroup = () => {
    setGroups([...groups, { logic: 'and', conditions: [{ field: 'price', operator: 'gt', value: 0 }] }]);
  };

  const removeGroup = (groupIndex: number) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter((_, i) => i !== groupIndex));
  };

  const updateGroupLogic = (groupIndex: number, logic: LogicType) => {
    const newGroups = [...groups];
    newGroups[groupIndex].logic = logic;
    setGroups(newGroups);
  };

  // 条件操作
  const addCondition = (groupIndex: number) => {
    const newGroups = [...groups];
    newGroups[groupIndex].conditions.push({ field: 'price', operator: 'gt', value: 0 });
    setGroups(newGroups);
  };

  const removeCondition = (groupIndex: number, condIndex: number) => {
    const newGroups = [...groups];
    if (newGroups[groupIndex].conditions.length <= 1) return;
    newGroups[groupIndex].conditions = newGroups[groupIndex].conditions.filter((_, i) => i !== condIndex);
    setGroups(newGroups);
  };

  const updateCondition = (groupIndex: number, condIndex: number, key: string, value: string | number | OperatorType | [number, number]) => {
    const newGroups = [...groups];
    const cond = newGroups[groupIndex].conditions[condIndex];
    if (key === 'field') cond.field = value as string;
    else if (key === 'operator') cond.operator = value as OperatorType;
    else if (key === 'value') cond.value = value as number | [number, number];
    setGroups(newGroups);
  };

  // 快速添加条件
  const addQuickCondition = (groupIndex: number, condition: Condition) => {
    const newGroups = [...groups];
    newGroups[groupIndex].conditions.push({ ...condition });
    setGroups(newGroups);
  };

  // 执行筛选
  const runFilter = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await runAdvancedFilter({
        groups,
        sortBy,
        sortOrder,
        page,
        pageSize: pagination.pageSize,
      });
      setResults(result.stocks);
      setPagination(result.pagination);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '筛选失败');
    } finally {
      setLoading(false);
    }
  }, [groups, sortBy, sortOrder, pagination.pageSize]);

  // 导出 CSV
  const exportCSV = async () => {
    try {
      const res = await fetch(`${API_BASE}/screener/advanced-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, sortBy, sortOrder, page: 1, pageSize: 10000, format: 'csv' }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `screener_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  // 从预设加载
  const loadPreset = async (preset: AdvancedPreset) => {
    setGroups(preset.groups);
    setSortBy(preset.sortBy);
    setSortOrder(preset.sortOrder);
    setLoading(true);
    try {
      const result = await runAdvancedFilter({
        groups: preset.groups,
        sortBy: preset.sortBy,
        sortOrder: preset.sortOrder,
        page: 1,
        pageSize: 50,
      });
      setResults(result.stocks);
      setPagination(result.pagination);
      message.success(`"${preset.name}" 执行完成`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '执行失败');
    } finally {
      setLoading(false);
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

  // 表格列
  const columns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: StockResult, index: number) => {
        const rank = (pagination.page - 1) * pagination.pageSize + index + 1;
        const color = rank <= 3 ? ['#f5222d', '#fa8c16', '#faad14'][rank - 1] : undefined;
        return <Text strong style={{ color }}>{rank}</Text>;
      },
    },
    {
      title: '代码', dataIndex: 'symbol', key: 'symbol', width: 100,
      render: (s: string) => (
        <Button type="link" onClick={() => navigate(`/stock/${s}`)} style={{ padding: 0 }}>{s}</Button>
      ),
    },
    { title: '名称', dataIndex: 'name', key: 'name', width: 100, ellipsis: true },
    { title: '最新价', dataIndex: 'price', key: 'price', width: 80, render: (v: number) => v?.toFixed(2) || '-' },
    {
      title: '涨跌幅', dataIndex: 'changePercent', key: 'changePercent', width: 90, sorter: true,
      render: (v: number) => {
        const color = v > 0 ? '#f5222d' : v < 0 ? '#52c41a' : undefined;
        return <Text style={{ color }}>{v > 0 ? '+' : ''}{v?.toFixed(2)}%</Text>;
      },
    },
    { title: 'RSI', dataIndex: 'rsi', key: 'rsi', width: 70, render: (v?: number | null) => v?.toFixed(1) || '-' },
    { title: 'MACD', dataIndex: 'macdHistogram', key: 'macdHistogram', width: 80,
      render: (v?: number | null) => {
        if (v == null) return '-';
        const color = v > 0 ? '#f5222d' : '#52c41a';
        return <Text style={{ color }}>{v.toFixed(3)}</Text>;
      },
    },
    { title: 'KDJ-J', dataIndex: 'kdjJ', key: 'kdjJ', width: 70, render: (v?: number | null) => v?.toFixed(1) || '-' },
    { title: '换手率', dataIndex: 'turnoverRate', key: 'turnoverRate', width: 80,
      render: (v: number) => v?.toFixed(2) + '%',
    },
    { title: '成交额', dataIndex: 'turnover', key: 'turnover', width: 100, render: (v: number) => formatMoney(v) },
    { title: '市盈率', dataIndex: 'peRatio', key: 'peRatio', width: 80,
      render: (v?: number | null) => v != null ? v.toFixed(2) : '-',
    },
    { title: '流通市值', dataIndex: 'circulatingMarketCap', key: 'circulatingMarketCap', width: 100,
      render: (v?: number | null) => formatMoney(v),
    },
  ];

  // 条件组分组显示
  const renderGroup = (group: ConditionGroup, groupIndex: number) => (
    <Card
      key={groupIndex}
      size="small"
      style={{ marginBottom: 12, borderLeft: group.logic === 'or' ? '3px solid #fa8c16' : '3px solid #1890ff' }}
      title={
        <Space>
          <Tag color={group.logic === 'and' ? 'blue' : 'orange'}>
            {group.logic === 'and' ? '且 (AND)' : '或 (OR)'}
          </Tag>
          <Radio.Group
            size="small"
            value={group.logic}
            onChange={(e) => updateGroupLogic(groupIndex, e.target.value)}
          >
            <Radio.Button value="and">AND</Radio.Button>
            <Radio.Button value="or">OR</Radio.Button>
          </Radio.Group>
          <Text type="secondary">组 {groupIndex + 1}</Text>
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<PlusOutlined />} onClick={() => addCondition(groupIndex)}>条件</Button>
          {groups.length > 1 && (
            <Button size="small" type="text" danger onClick={() => removeGroup(groupIndex)}>删除组</Button>
          )}
        </Space>
      }
    >
      {group.conditions.map((cond, condIndex) => (
        <Row key={condIndex} gutter={8} style={{ marginBottom: 8 }} align="middle">
          <Col flex="130px">
            <Select
              value={cond.field}
              onChange={(v) => updateCondition(groupIndex, condIndex, 'field', v)}
              size="small"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="children"
            >
              <Select.OptGroup label="📊 基础行情">
                {FIELDS.filter(f => f.category === 'basic').map(f => (
                  <Option key={f.field} value={f.field}>{f.name}</Option>
                ))}
              </Select.OptGroup>
              <Select.OptGroup label="📈 技术指标">
                {FIELDS.filter(f => f.category === 'technical').map(f => (
                  <Option key={f.field} value={f.field}>{f.name}</Option>
                ))}
              </Select.OptGroup>
              <Select.OptGroup label="💰 财务指标">
                {FIELDS.filter(f => f.category === 'financial').map(f => (
                  <Option key={f.field} value={f.field}>{f.name}</Option>
                ))}
              </Select.OptGroup>
            </Select>
          </Col>
          <Col flex="90px">
            <Select
              value={cond.operator}
              onChange={(v) => updateCondition(groupIndex, condIndex, 'operator', v)}
              size="small"
              style={{ width: '100%' }}
            >
              {OPERATORS.map(o => (
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
                  onChange={(v) => updateCondition(groupIndex, condIndex, 'value', [v || 0, Array.isArray(cond.value) ? cond.value[1] : 0])}
                  style={{ width: 80 }}
                />
                <Text type="secondary">~</Text>
                <InputNumber
                  size="small"
                  value={Array.isArray(cond.value) ? cond.value[1] : 0}
                  onChange={(v) => updateCondition(groupIndex, condIndex, 'value', [Array.isArray(cond.value) ? cond.value[0] : 0, v || 0])}
                  style={{ width: 80 }}
                />
              </Space>
            ) : (
              <InputNumber
                size="small"
                value={cond.value as number}
                onChange={(v) => updateCondition(groupIndex, condIndex, 'value', v || 0)}
                style={{ width: '100%' }}
                precision={2}
              />
            )}
          </Col>
          <Col>
            {group.conditions.length > 1 && (
              <Button size="small" type="text" danger onClick={() => removeCondition(groupIndex, condIndex)}>×</Button>
            )}
          </Col>
        </Row>
      ))}

      {/* 快捷条件 */}
      <Divider style={{ margin: '8px 0' }} orientation="left">
        <Text type="secondary" style={{ fontSize: 11 }}>快捷添加</Text>
      </Divider>
      <Space wrap size={4}>
        {QUICK_CONDITIONS.map((qc) => (
          <Tag
            key={qc.name}
            style={{ cursor: 'pointer', fontSize: 11 }}
            onClick={() => addQuickCondition(groupIndex, qc.condition)}
          >
            {qc.name}
          </Tag>
        ))}
      </Space>
    </Card>
  );

  return (
    <div className="advanced-screener-page" style={{ padding: 16 }}>
      <Row gutter={16}>
        {/* 左侧：条件面板 */}
        <Col xs={24} lg={9}>
          <Card
            title={<Space><ApartmentOutlined />高级筛选条件</Space>}
            size="small"
            extra={
              <Space>
                <Button size="small" icon={<PlusOutlined />} onClick={addGroup}>添加组</Button>
                <Button size="small" icon={<SaveOutlined />} onClick={() => setSaveModalOpen(true)}>保存</Button>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'json', label: '导出 JSON', icon: <DownloadOutlined /> },
                      { key: 'csv', label: '导出 CSV', icon: <DownloadOutlined />, onClick: exportCSV },
                    ],
                  }}
                >
                  <Button size="small" icon={<DownloadOutlined />}>导出</Button>
                </Dropdown>
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => runFilter(1)} loading={loading}>
                  执行
                </Button>
              </Space>
            }
          >
            {/* 条件组列表 */}
            {groups.map((group, i) => renderGroup(group, i))}

            <Divider style={{ margin: '12px 0' }} />

            {/* 排序 */}
            <Row gutter={8}>
              <Col flex="auto">
                <Text type="secondary" style={{ fontSize: 12 }}>排序</Text>
                <Select value={sortBy} onChange={setSortBy} size="small" style={{ width: '100%' }}>
                  {FIELDS.map(f => (
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
          <Card title="预设策略" size="small" style={{ marginTop: 16 }}>
            <List
              size="small"
              dataSource={presets}
              renderItem={(tpl: AdvancedPreset) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '8px 12px' }}
                  onClick={() => loadPreset(tpl)}
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
          </Card>
        </Col>

        {/* 右侧：结果 */}
        <Col xs={24} lg={15}>
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
              columns={columns}
              dataSource={results}
              rowKey="id"
              loading={loading}
              size="small"
              scroll={{ x: 1100 }}
              pagination={{
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.totalCount,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 只`,
                onChange: (page) => runFilter(page),
              }}
              locale={{ emptyText: '点击执行开始高级筛选，支持AND/OR组合逻辑' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 保存模板 */}
      <Modal title="保存筛选策略" open={saveModalOpen} onCancel={() => setSaveModalOpen(false)} onOk={() => saveForm.submit()}>
        <Form form={saveForm} layout="vertical" onFinish={(v) => { message.success('已保存'); setSaveModalOpen(false); }}>
          <Form.Item name="name" label="策略名称" rules={[{ required: true }]}>
            <Input placeholder="例：低估值成长策略" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
