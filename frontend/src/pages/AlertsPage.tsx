/**
 * 行情预警管理页面
 * 支持创建/查看/删除预警，预警历史记录
 * 参考同花顺预警功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, InputNumber,
  Tag, Space, Popconfirm, message, Tabs, Statistic, Row, Col,
  Empty, Switch, Tooltip, Badge, Typography, Divider,
} from 'antd';
import {
  BellOutlined, PlusOutlined, DeleteOutlined, HistoryOutlined,
  WarningOutlined, CheckCircleOutlined, RiseOutlined, FallOutlined,
  BarChartOutlined, FireOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ==================== 类型 ====================

interface AlertItem {
  id: number;
  userId: number;
  symbol: string;
  alertType: AlertType;
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  message?: string;
  createdAt: string;
}

type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_surge';

interface AlertHistoryItem {
  id: number;
  alertId: number;
  symbol: string;
  alertType: string;
  threshold: number;
  actualValue: number;
  triggeredAt: string;
  message: string;
}

interface AlertStats {
  total: number;
  active: number;
  triggered: number;
  byType: Record<string, number>;
  historyCount: number;
}

const ALERT_TYPE_LABELS: Record<AlertType, { label: string; icon: React.ReactNode; color: string }> = {
  price_above: { label: '价格突破', icon: <RiseOutlined />, color: '#f5222d' },
  price_below: { label: '价格跌破', icon: <FallOutlined />, color: '#52c41a' },
  change_above: { label: '涨幅超限', icon: <RiseOutlined />, color: '#f5222d' },
  change_below: { label: '跌幅超限', icon: <FallOutlined />, color: '#52c41a' },
  volume_surge: { label: '成交量异动', icon: <ThunderboltOutlined />, color: '#faad14' },
};

// ==================== API ====================

const API_BASE = '/api';

async function fetchAlerts(params: Record<string, any> = {}): Promise<{ alerts: AlertItem[]; pagination: any }> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/alerts?${query}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchAlertStats(): Promise<AlertStats> {
  const res = await fetch(`${API_BASE}/alerts/stats`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchAlertHistory(params: Record<string, any> = {}): Promise<{ history: AlertHistoryItem[]; pagination: any }> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/alerts/history?${query}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function createAlert(data: any): Promise<AlertItem> {
  const res = await fetch(`${API_BASE}/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function updateAlert(id: number, data: any): Promise<AlertItem> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function deleteAlert(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

// ==================== 主组件 ====================

export default function AlertsPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalCount: 0 });
  const [activeTab, setActiveTab] = useState('active');

  // 加载数据
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsData, statsData] = await Promise.all([
        fetchAlerts({ page: pagination.page, pageSize: pagination.pageSize }),
        fetchAlertStats(),
      ]);
      setAlerts(alertsData.alerts);
      setPagination((prev) => ({ ...prev, totalCount: alertsData.pagination.totalCount }));
      setStats(statsData);
    } catch (err: any) {
      message.error(err.message || '加载预警数据失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAlertHistory({ page: 1, pageSize: 50 });
      setHistory(data.history);
    } catch (err: any) {
      message.error(err.message || '加载预警历史失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'active') {
      loadAlerts();
    } else {
      loadHistory();
    }
  }, [activeTab, loadAlerts, loadHistory]);

  // 创建预警
  const handleCreate = async (values: any) => {
    try {
      await createAlert({
        symbol: values.symbol.toUpperCase(),
        alertType: values.alertType,
        threshold: values.threshold,
        message: values.message,
      });
      message.success('预警创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      loadAlerts();
    } catch (err: any) {
      message.error(err.message || '创建预警失败');
    }
  };

  // 切换激活状态
  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateAlert(id, { isActive });
      message.success(isActive ? '预警已启用' : '预警已暂停');
      loadAlerts();
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  // 删除预警
  const handleDelete = async (id: number) => {
    try {
      await deleteAlert(id);
      message.success('预警已删除');
      loadAlerts();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  // 预警表格列
  const alertColumns = [
    {
      title: '股票',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (symbol: string) => (
        <Button
          type="link"
          onClick={() => navigate(`/stock/${symbol}`)}
          style={{ padding: 0, fontWeight: 600 }}
        >
          {symbol}
        </Button>
      ),
    },
    {
      title: '预警类型',
      dataIndex: 'alertType',
      key: 'alertType',
      width: 130,
      render: (type: AlertType) => {
        const info = ALERT_TYPE_LABELS[type];
        return (
          <Tag icon={info.icon} color={info.color}>
            {info.label}
          </Tag>
        );
      },
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 100,
      render: (val: number, record: AlertItem) => {
        const unit = record.alertType.includes('price') ? '元' :
          record.alertType.includes('change') ? '%' : '';
        return <Text strong>{val}{unit}</Text>;
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_: any, record: AlertItem) => {
        if (record.isTriggered) {
          return (
            <Tooltip title={`触发值: ${record.triggeredValue}`}>
              <Badge status="error" text={<Text type="danger">已触发</Text>} />
            </Tooltip>
          );
        }
        return record.isActive
          ? <Badge status="processing" text="监控中" />
          : <Badge status="default" text="已暂停" />;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (d: string) => new Date(d).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: AlertItem) => (
        <Space size="small">
          <Switch
            size="small"
            checked={record.isActive}
            onChange={(checked) => handleToggleActive(record.id, checked)}
          />
          <Popconfirm
            title="确定删除此预警？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 历史表格列
  const historyColumns = [
    {
      title: '触发时间',
      dataIndex: 'triggeredAt',
      key: 'triggeredAt',
      width: 160,
      render: (d: string) => new Date(d).toLocaleString('zh-CN'),
    },
    {
      title: '股票',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 100,
    },
    {
      title: '预警类型',
      dataIndex: 'alertType',
      key: 'alertType',
      width: 120,
      render: (type: string) => {
        const info = ALERT_TYPE_LABELS[type as AlertType];
        return info ? <Tag color={info.color}>{info.label}</Tag> : type;
      },
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 80,
    },
    {
      title: '实际值',
      dataIndex: 'actualValue',
      key: 'actualValue',
      width: 100,
      render: (val: number) => <Text strong>{val}</Text>,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  return (
    <div className="alerts-page">
      {/* 统计概览 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="预警总数" value={stats.total} prefix={<BellOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="监控中" value={stats.active} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#1890ff' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="已触发" value={stats.triggered} prefix={<WarningOutlined />} valueStyle={{ color: '#f5222d' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="历史记录" value={stats.historyCount} prefix={<HistoryOutlined />} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 主内容 */}
      <Card
        title={
          <Space>
            <BellOutlined />
            <span>行情预警</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            新建预警
          </Button>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="活跃预警" key="active">
            <Table
              columns={alertColumns}
              dataSource={alerts}
              rowKey="id"
              loading={loading}
              pagination={{
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.totalCount,
                onChange: (page, pageSize) => setPagination((p) => ({ ...p, page, pageSize: pageSize || 20 })),
              }}
              locale={{ emptyText: <Empty description="暂无预警规则" /> }}
            />
          </TabPane>
          <TabPane tab="触发历史" key="history">
            <Table
              columns={historyColumns}
              dataSource={history}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: <Empty description="暂无触发记录" /> }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* 创建预警弹窗 */}
      <Modal
        title="新建预警"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="symbol"
            label="股票代码"
            rules={[
              { required: true, message: '请输入股票代码' },
              { pattern: /^(sh|sz|bj)?\d{6}$/i, message: '格式：6位数字代码' },
            ]}
          >
            <Input placeholder="例：600519" maxLength={9} />
          </Form.Item>

          <Form.Item
            name="alertType"
            label="预警类型"
            rules={[{ required: true, message: '请选择预警类型' }]}
          >
            <Select placeholder="选择预警类型">
              <Option value="price_above">
                <RiseOutlined style={{ color: '#f5222d' }} /> 价格突破
              </Option>
              <Option value="price_below">
                <FallOutlined style={{ color: '#52c41a' }} /> 价格跌破
              </Option>
              <Option value="change_above">
                <RiseOutlined style={{ color: '#f5222d' }} /> 涨幅超过
              </Option>
              <Option value="change_below">
                <FallOutlined style={{ color: '#52c41a' }} /> 跌幅超过
              </Option>
              <Option value="volume_surge">
                <ThunderboltOutlined style={{ color: '#faad14' }} /> 成交量异动
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.alertType !== cur.alertType}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('alertType');
              const unit = type?.includes('price') ? '元' :
                type?.includes('change') ? '%' : '手';
              return (
                <Form.Item
                  name="threshold"
                  label={`阈值 (${unit})`}
                  rules={[{ required: true, message: '请输入阈值' }]}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder={`请输入${unit}数`}
                    precision={2}
                    min={0}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item name="message" label="备注（可选）">
            <Input.TextArea rows={2} placeholder="自定义预警消息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
