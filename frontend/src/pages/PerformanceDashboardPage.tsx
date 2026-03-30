/**
 * 性能监控面板
 * API 响应时间 + 错误率 + 健康评分
 * 参考 Sentry 监控方案
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Tag, Table, Spin, Select, Progress, Badge, Button, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

interface Overview {
  totalRequests: number;
  errorRequests: number;
  errorRate: number;
  slowRequests: number;
  slowRate: number;
  avgDuration: number;
  p50: number;
  p95: number;
  p99: number;
  requestsPerMinute: { time: string; count: number; errors: number; avgDuration: number }[];
  statusCodeDistribution: { code: number; count: number }[];
  health: {
    score: number;
    grade: string;
    breakdown: Record<string, number>;
  };
}

interface EndpointStat {
  endpoint: string;
  count: number;
  avgDuration: number;
  errorCount: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
}

const GRADE_COLORS: Record<string, string> = { A: '#52c41a', B: '#1890ff', C: '#faad14', D: '#ff4d4f', F: '#cf1322' };
const STATUS_COLORS = ['#52c41a', '#1890ff', '#faad14', '#ff4d4f', '#722ed1'];

export default function PerformanceDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointStat[]>([]);
  const [slowRequests, setSlowRequests] = useState<any[]>([]);
  const [errorRequests, setErrorRequests] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState(3600000);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [overviewRes, endpointsRes, slowRes, errorRes] = await Promise.all([
        fetch(`/api/performance/overview?range=${timeRange}`),
        fetch('/api/performance/endpoints'),
        fetch('/api/performance/slow?limit=10'),
        fetch('/api/performance/errors?limit=10'),
      ]);

      const overviewData = await overviewRes.json();
      const endpointsData = await endpointsRes.json();
      const slowData = await slowRes.json();
      const errorData = await errorRes.json();

      if (overviewData.success) setOverview(overviewData.data);
      if (endpointsData.success) setEndpoints(endpointsData.data);
      if (slowData.success) setSlowRequests(slowData.data);
      if (errorData.success) setErrorRequests(errorData.data);
    } catch (e) {
      console.error('加载性能数据失败:', e);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadData]);

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;

  const endpointColumns = [
    { title: '端点', dataIndex: 'endpoint', key: 'endpoint', ellipsis: true },
    { title: '请求数', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
    {
      title: '平均响应', dataIndex: 'avgDuration', key: 'avgDuration',
      render: (v: number) => <Tag color={v > 2000 ? 'red' : v > 500 ? 'orange' : 'green'}>{v}ms</Tag>,
      sorter: (a: any, b: any) => a.avgDuration - b.avgDuration,
    },
    { title: 'P50', dataIndex: 'p50', key: 'p50', render: (v: number) => `${v}ms` },
    { title: 'P95', dataIndex: 'p95', key: 'p95', render: (v: number) => `${v}ms` },
    { title: 'P99', dataIndex: 'p99', key: 'p99', render: (v: number) => `${v}ms` },
    {
      title: '错误率', dataIndex: 'errorRate', key: 'errorRate',
      render: (v: number) => <Tag color={v > 5 ? 'red' : v > 1 ? 'orange' : 'green'}>{v}%</Tag>,
      sorter: (a: any, b: any) => a.errorRate - b.errorRate,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📊 性能监控</h2>
        <Space>
          <Select value={timeRange} onChange={setTimeRange} style={{ width: 140 }}
            options={[
              { value: 300000, label: '最近5分钟' },
              { value: 900000, label: '最近15分钟' },
              { value: 3600000, label: '最近1小时' },
              { value: 86400000, label: '最近24小时' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
          <Badge status={autoRefresh ? 'processing' : 'default'} text={
            <a onClick={() => setAutoRefresh(!autoRefresh)}>{autoRefresh ? '自动刷新中' : '已暂停'}</a>
          } />
        </Space>
      </Row>

      {overview && (
        <>
          {/* 健康评分 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={6}>
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <Progress type="circle" percent={overview.health.score}
                    strokeColor={GRADE_COLORS[overview.health.grade]}
                    format={() => (
                      <div>
                        <div style={{ fontSize: 36, fontWeight: 'bold', color: GRADE_COLORS[overview.health.grade] }}>
                          {overview.health.grade}
                        </div>
                        <div style={{ fontSize: 14, color: '#999' }}>{overview.health.score}分</div>
                      </div>
                    )}
                  />
                  <div style={{ marginTop: 8, color: '#666' }}>系统健康评分</div>
                </div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="总请求数" value={overview.totalRequests} />
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue">P50: {overview.p50}ms</Tag>
                </div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="平均响应时间" value={overview.avgDuration} suffix="ms"
                  valueStyle={{ color: overview.avgDuration > 1000 ? '#ff4d4f' : '#52c41a' }} />
                <div style={{ marginTop: 8 }}>
                  <Tag color="purple">P99: {overview.p99}ms</Tag>
                </div>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="错误率" value={overview.errorRate} suffix="%"
                  prefix={overview.errorRate > 1 ? <WarningOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: overview.errorRate > 1 ? '#ff4d4f' : '#52c41a' }} />
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#999' }}>错误: {overview.errorRequests} | 慢请求: {overview.slowRequests}</span>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 请求量趋势 + 状态码分布 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={16}>
              <Card title="请求量趋势" size="small">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={overview.requestsPerMinute}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="count" name="请求数" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="errors" name="错误" stroke="#ff4d4f" fill="#ff4d4f" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="响应时间趋势" size="small">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={overview.requestsPerMinute}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="avgDuration" name="平均(ms)" stroke="#722ed1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          {/* 端点统计 + 慢请求 + 错误请求 */}
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Card title="端点性能排行" size="small">
                <Table columns={endpointColumns} dataSource={endpoints} rowKey="endpoint"
                  size="small" pagination={false} scroll={{ x: 800 }} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
