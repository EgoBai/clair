/**
 * AI 智能选股页面
 * 参考同花顺i问财智能选股
 * 增强: 模型解释 / 报告导出 / 策略分享
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Typography, Tag, Space, Button, Segmented, Table,
  Progress, Tooltip, Statistic, Divider, Badge, Spin, Modal, Drawer,
  Descriptions, List, Steps, Collapse, message, Dropdown, Input,
} from 'antd';
import {
  RobotOutlined, ThunderboltOutlined, RiseOutlined, FallOutlined,
  LineChartOutlined, FireOutlined, BulbOutlined, WarningOutlined,
  ReloadOutlined, CheckCircleOutlined, DownloadOutlined, ShareAltOutlined,
  InfoCircleOutlined, BranchesOutlined, ExperimentOutlined,
  FileTextOutlined, CopyOutlined, LinkOutlined, SafetyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  generateModelExplanation, generateStrategyInsight,
  exportReportToCSV, generateShareSummary,
} from '../utils/aiModelExplainer';
import type { ModelExplanation, StrategyInsight, FeatureImportance } from '../utils/aiModelExplainer';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

interface StockRecommendation {
  symbol: string;
  name: string;
  score: number;
  reason: string;
  price: number;
  changePercent: number;
}

interface StrategyRecommendation {
  strategy: string;
  name: string;
  description: string;
  stocks: StockRecommendation[];
}

interface SectorRotation {
  name: string;
  code: string;
  phase: string;
  momentum: number;
  trend: string;
}

const AIStockSelectionPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [sectorRotation, setSectorRotation] = useState<{
    sectors: SectorRotation[];
    hotSectors: string[];
    watchSectors: string[];
    avoidSectors: string[];
    rotationSignal: string;
  } | null>(null);
  const [alertSuggestions, setAlertSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<string>('all');

  // 模型解释状态
  const [explainModal, setExplainModal] = useState<{ visible: boolean; explanation: ModelExplanation | null }>({
    visible: false, explanation: null,
  });

  // 策略洞察抽屉
  const [insightDrawer, setInsightDrawer] = useState<{ visible: boolean; insight: StrategyInsight | null }>({
    visible: false, insight: null,
  });

  // 分享模态框
  const [shareModal, setShareModal] = useState<{ visible: boolean; content: string; strategy: string }>({
    visible: false, content: '', strategy: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, rotRes, alertRes] = await Promise.all([
        fetch('/api/ai/recommendations'),
        fetch('/api/ai/sector-rotation'),
        fetch('/api/ai/alert-suggestions'),
      ]);

      const [recJson, rotJson, alertJson] = await Promise.all([
        recRes.json(),
        rotRes.json(),
        alertRes.json(),
      ]);

      if (recJson.success) setRecommendations(recJson.data.recommendations);
      if (rotJson.success) setSectorRotation(rotJson.data);
      if (alertJson.success) setAlertSuggestions(alertJson.data.suggestions);
    } catch (err) {
      logger.error('加载AI选股数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 打开模型解释
  const handleExplain = useCallback((stock: StockRecommendation) => {
    const explanation = generateModelExplanation(stock.symbol, stock.name);
    setExplainModal({ visible: true, explanation });
  }, []);

  // 打开策略洞察
  const handleStrategyInsight = useCallback((strategy: string) => {
    const insight = generateStrategyInsight(strategy);
    setInsightDrawer({ visible: true, insight });
  }, []);

  // 导出报告
  const handleExport = useCallback((format: 'csv' | 'json') => {
    const explanations = new Map<string, ModelExplanation>();
    recommendations.forEach(rec => {
      rec.stocks.forEach(s => explanations.set(s.symbol, generateModelExplanation(s.symbol, s.name)));
    });

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'csv') {
      content = exportReportToCSV(recommendations, explanations);
      filename = `AI选股报告_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv;charset=utf-8;\uFEFF';
    } else {
      const jsonData = recommendations.map(rec => ({
        strategy: rec.name,
        description: rec.description,
        stocks: rec.stocks.map(s => ({
          ...s,
          explanation: explanations.get(s.symbol),
        })),
      }));
      content = JSON.stringify(jsonData, null, 2);
      filename = `AI选股报告_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`报告已导出为 ${format.toUpperCase()} 格式`);
  }, [recommendations]);

  // 分享策略
  const handleShare = useCallback((strategyRec: StrategyRecommendation) => {
    const insight = generateStrategyInsight(strategyRec.strategy);
    const summary = generateShareSummary(strategyRec.strategy, strategyRec.stocks, insight);
    setShareModal({ visible: true, content: summary, strategy: strategyRec.name });
  }, []);

  // 复制分享内容
  const handleCopyShare = useCallback(() => {
    navigator.clipboard.writeText(shareModal.content).then(() => {
      message.success('已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  }, [shareModal.content]);

  const strategyIcons: Record<string, React.ReactNode> = {
    value: <BulbOutlined />,
    growth: <RiseOutlined />,
    technical: <LineChartOutlined />,
    momentum: <ThunderboltOutlined />,
    contrarian: <FallOutlined />,
  };

  const strategyColors: Record<string, string> = {
    value: '#52c41a',
    growth: '#1890ff',
    technical: '#722ed1',
    momentum: '#fa8c16',
    contrarian: '#13c2c2',
  };

  const phaseConfig: Record<string, { color: string; label: string }> = {
    '主升': { color: '#cf1322', label: '🔥 主升' },
    '吸筹': { color: '#1890ff', label: '💎 吸筹' },
    '派发': { color: '#fa8c16', label: '⚠️ 派发' },
    '下跌': { color: '#999', label: '📉 下跌' },
  };

  const featureCategoryColors: Record<string, string> = {
    fundamental: '#52c41a',
    technical: '#1890ff',
    sentiment: '#fa8c16',
    macro: '#722ed1',
  };

  const featureCategoryLabels: Record<string, string> = {
    fundamental: '基本面',
    technical: '技术面',
    sentiment: '市场情绪',
    macro: '宏观环境',
  };

  const stockColumns: ColumnsType<StockRecommendation> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) => (
        <Tag color={['#FFD700', '#C0C0C0', '#CD7F32'][idx] || 'default'}>{idx + 1}</Tag>
      ),
    },
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <a href={`/stock/${r.symbol}`} style={{ fontWeight: 600 }}>{r.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '推荐评分',
      dataIndex: 'score',
      width: 140,
      render: (val: number) => (
        <Space>
          <Progress
            percent={val}
            size="small"
            strokeColor={val >= 90 ? '#52c41a' : val >= 80 ? '#1890ff' : '#fa8c16'}
            style={{ width: 80 }}
          />
          <Text strong>{val}</Text>
        </Space>
      ),
      sorter: (a, b) => b.score - a.score,
    },
    {
      title: '现价',
      dataIndex: 'price',
      width: 80,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      render: (val: number) => {
        const color = val > 0 ? '#cf1322' : val < 0 ? '#3f8600' : '#999';
        const prefix = val > 0 ? '+' : '';
        return <Text style={{ color }}>{prefix}{val.toFixed(2)}%</Text>;
      },
    },
    {
      title: '推荐理由',
      dataIndex: 'reason',
      ellipsis: { showTitle: false },
      render: (val: string) => <Tooltip title={val}><Text>{val}</Text></Tooltip>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => handleExplain(record)}
        >
          解释
        </Button>
      ),
    },
  ];

  const filteredRecs = activeStrategy === 'all'
    ? recommendations
    : recommendations.filter(r => r.strategy === activeStrategy);

  // 导出菜单
  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'csv',
      icon: <FileTextOutlined />,
      label: '导出 CSV',
      onClick: () => handleExport('csv'),
    },
    {
      key: 'json',
      icon: <FileTextOutlined />,
      label: '导出 JSON',
      onClick: () => handleExport('json'),
    },
  ];

  // 渲染特征重要性条形图
  const renderFeatureBar = (f: FeatureImportance) => (
    <div key={f.feature} style={{ marginBottom: 8 }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Space size={4}>
            <Tag color={featureCategoryColors[f.category]} style={{ marginRight: 4 }}>
              {featureCategoryLabels[f.category]}
            </Tag>
            <Text style={{ fontSize: 12 }}>{f.feature}</Text>
          </Space>
        </Col>
        <Col>
          <Text strong style={{ color: f.direction === 'positive' ? '#52c41a' : '#cf1322' }}>
            {f.direction === 'positive' ? '↑' : '↓'} {(f.importance * 100).toFixed(0)}%
          </Text>
        </Col>
      </Row>
      <Progress
        percent={f.importance * 100}
        showInfo={false}
        strokeColor={f.direction === 'positive' ? '#52c41a' : '#cf1322'}
        size="small"
      />
      <Text type="secondary" style={{ fontSize: 11 }}>{f.description}</Text>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined /> AI 智能选股
          </Title>
        </Col>
        <Col>
          <Space>
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
              <Button icon={<DownloadOutlined />}>导出报告</Button>
            </Dropdown>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          </Space>
        </Col>
      </Row>

      {/* 行业轮动信号 */}
      {sectorRotation && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderColor: '#1890ff' }}
          title={<><FireOutlined /> 行业轮动信号</>}
        >
          <Paragraph style={{ marginBottom: 8, color: '#1890ff', fontWeight: 600 }}>
            {sectorRotation.rotationSignal}
          </Paragraph>
          <Row gutter={16}>
            <Col>
              <Text type="secondary">🔥 热门板块：</Text>
              {sectorRotation.hotSectors.map(s => (
                <Tag key={s} color="red">{s}</Tag>
              ))}
            </Col>
            <Col>
              <Text type="secondary">💎 关注板块：</Text>
              {sectorRotation.watchSectors.map(s => (
                <Tag key={s} color="blue">{s}</Tag>
              ))}
            </Col>
            <Col>
              <Text type="secondary">⚠️ 回避板块：</Text>
              {sectorRotation.avoidSectors.map(s => (
                <Tag key={s} color="default">{s}</Tag>
              ))}
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={[8, 8]}>
            {sectorRotation.sectors.slice(0, 10).map(s => (
              <Col key={s.code} xs={12} sm={8} md={6} lg={4}>
                <Card size="small" hoverable style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                  <Tag color={phaseConfig[s.phase]?.color}>{phaseConfig[s.phase]?.label}</Tag>
                  <div style={{ marginTop: 4 }}>
                    <Progress
                      percent={s.momentum}
                      size="small"
                      strokeColor={s.momentum > 80 ? '#cf1322' : s.momentum > 60 ? '#1890ff' : '#999'}
                      format={() => `动量${s.momentum}`}
                    />
                  </div>
                  <Tag color={s.trend === '流入' ? 'green' : s.trend === '流出' ? 'red' : 'default'}>
                    {s.trend}
                  </Tag>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 策略选择 */}
      <Segmented
        options={[
          { label: '全部策略', value: 'all' },
          { label: '💰 价值投资', value: 'value' },
          { label: '📈 成长突破', value: 'growth' },
          { label: '📊 技术形态', value: 'technical' },
          { label: '🚀 动量追踪', value: 'momentum' },
          { label: '🔄 逆向布局', value: 'contrarian' },
        ]}
        value={activeStrategy}
        onChange={(val) => setActiveStrategy(val as string)}
        style={{ marginBottom: 16 }}
      />

      {/* 选股推荐 */}
      <Spin spinning={loading}>
        {filteredRecs.map(rec => (
          <Card
            key={rec.strategy}
            title={
              <Space>
                <Tag color={strategyColors[rec.strategy]} icon={strategyIcons[rec.strategy]}>
                  {rec.name}
                </Tag>
                <Text type="secondary">{rec.description}</Text>
              </Space>
            }
            extra={
              <Space>
                <Button
                  type="link"
                  size="small"
                  icon={<ExperimentOutlined />}
                  onClick={() => handleStrategyInsight(rec.strategy)}
                >
                  策略详情
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<ShareAltOutlined />}
                  onClick={() => handleShare(rec)}
                >
                  分享
                </Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Table
              columns={stockColumns}
              dataSource={rec.stocks}
              rowKey="symbol"
              size="small"
              pagination={false}
            />
          </Card>
        ))}
      </Spin>

      {/* 智能预警建议 */}
      {alertSuggestions.length > 0 && (
        <Card
          title={<><WarningOutlined /> 智能预警建议</>}
          size="small"
        >
          <Row gutter={[16, 16]}>
            {alertSuggestions.map((s, i) => (
              <Col key={i} xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space>
                      <Badge
                        color={s.priority === 'high' ? '#cf1322' : s.priority === 'medium' ? '#fa8c16' : '#999'}
                      />
                      <Text strong>{s.title}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text>
                    <Text code style={{ fontSize: 11 }}>{s.condition}</Text>
                    {s.stocks.length > 0 && (
                      <Space wrap>
                        {s.stocks.map((st: string) => (
                          <Tag key={st} color="blue">{st}</Tag>
                        ))}
                      </Space>
                    )}
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* ========== 模型解释弹窗 ========== */}
      <Modal
        title={
          <Space>
            <BranchesOutlined />
            <span>AI 模型解释</span>
            {explainModal.explanation && (
              <Tag color="blue">{explainModal.explanation.modelName} v{explainModal.explanation.modelVersion}</Tag>
            )}
          </Space>
        }
        open={explainModal.visible}
        onCancel={() => setExplainModal({ visible: false, explanation: null })}
        footer={null}
        width={800}
      >
        {explainModal.explanation && (
          <div>
            {/* 置信度 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="模型置信度"
                    value={explainModal.explanation.confidence * 100}
                    precision={1}
                    suffix="%"
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="分析特征数"
                    value={explainModal.explanation.features.length}
                    suffix="个"
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="决策步骤"
                    value={explainModal.explanation.decisionPath.filter(d => d.result).length}
                    suffix={`/${explainModal.explanation.decisionPath.length}`}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 摘要 */}
            <Paragraph style={{ background: '#f6f8fa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <SafetyOutlined style={{ color: '#1890ff', marginRight: 8 }} />
              {explainModal.explanation.summary}
            </Paragraph>

            <Collapse
              defaultActiveKey={['features', 'factors']}
              items={[
                {
                  key: 'features',
                  label: <><InfoCircleOutlined /> 特征重要性分析</>,
                  children: (
                    <div>
                      {explainModal.explanation.features
                        .sort((a, b) => b.importance - a.importance)
                        .map(renderFeatureBar)}
                    </div>
                  ),
                },
                {
                  key: 'factors',
                  label: <><ExperimentOutlined /> 多因子贡献度</>,
                  children: (
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={explainModal.explanation.factors}
                      rowKey="factor"
                      columns={[
                        { title: '因子', dataIndex: 'factor', key: 'factor' },
                        {
                          title: '评分', dataIndex: 'score', key: 'score',
                          render: (v: number) => (
                            <Progress percent={v} size="small" style={{ width: 80 }}
                              strokeColor={v >= 80 ? '#52c41a' : v >= 70 ? '#1890ff' : '#fa8c16'} />
                          ),
                        },
                        { title: '权重', dataIndex: 'weight', key: 'weight', render: (v: number) => `${(v * 100).toFixed(0)}%` },
                        {
                          title: '贡献度', dataIndex: 'contribution', key: 'contribution',
                          render: (v: number) => <Text strong style={{ color: '#1890ff' }}>{v.toFixed(1)}</Text>,
                        },
                        { title: '说明', dataIndex: 'explanation', key: 'explanation', ellipsis: true },
                      ]}
                    />
                  ),
                },
                {
                  key: 'path',
                  label: <><BranchesOutlined /> 决策路径</>,
                  children: (
                    <Steps direction="vertical" size="small" current={explainModal.explanation.decisionPath.length}>
                      {explainModal.explanation.decisionPath.map(step => (
                        <Step
                          key={step.step}
                          title={step.condition}
                          status={step.result ? 'finish' : 'error'}
                          description={
                            <Space>
                              <Tag color={step.result ? 'green' : 'red'}>
                                {step.result ? '通过' : '未通过'}
                              </Tag>
                              <Text type="secondary">影响权重: {(step.impact * 100).toFixed(0)}%</Text>
                            </Space>
                          }
                        />
                      ))}
                    </Steps>
                  ),
                },
                {
                  key: 'risk',
                  label: <><WarningOutlined /> 风险因素</>,
                  children: (
                    <List
                      size="small"
                      dataSource={explainModal.explanation.riskFactors}
                      renderItem={item => (
                        <List.Item>
                          <WarningOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
                          {item}
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* ========== 策略洞察抽屉 ========== */}
      <Drawer
        title="策略详情与历史表现"
        open={insightDrawer.visible}
        onClose={() => setInsightDrawer({ visible: false, insight: null })}
        width={480}
      >
        {insightDrawer.insight && (
          <div>
            <Title level={5}>{insightDrawer.insight.strategy}</Title>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="胜率">
                <Text strong style={{ color: '#52c41a' }}>{insightDrawer.insight.performance.winRate}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="平均收益">
                <Text strong style={{ color: '#cf1322' }}>{insightDrawer.insight.performance.avgReturn}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="最大回撤">
                <Text strong style={{ color: '#3f8600' }}>{insightDrawer.insight.performance.maxDrawdown}%</Text>
              </Descriptions.Item>
              <Descriptions.Item label="夏普比率">
                <Text strong>{insightDrawer.insight.performance.sharpeRatio}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Calmar比率">
                <Text strong>{insightDrawer.insight.performance.calmarRatio}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider>策略特征</Divider>

            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="最佳市场环境">
                {insightDrawer.insight.marketCondition}
              </Descriptions.Item>
              <Descriptions.Item label="建议持有周期">
                {insightDrawer.insight.bestPeriod}
              </Descriptions.Item>
              <Descriptions.Item label="风险等级">
                <Tag color={insightDrawer.insight.riskLevel === 'low' ? 'green' : insightDrawer.insight.riskLevel === 'medium' ? 'orange' : 'red'}>
                  {insightDrawer.insight.riskLevel === 'low' ? '低风险' : insightDrawer.insight.riskLevel === 'medium' ? '中风险' : '高风险'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Paragraph type="secondary">
              <strong>适合人群:</strong> {insightDrawer.insight.suitableFor.join('、')}
            </Paragraph>
          </div>
        )}
      </Drawer>

      {/* ========== 分享模态框 ========== */}
      <Modal
        title={<><ShareAltOutlined /> 分享策略: {shareModal.strategy}</>}
        open={shareModal.visible}
        onCancel={() => setShareModal({ visible: false, content: '', strategy: '' })}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyShare}>
            复制到剪贴板
          </Button>,
          <Button key="close" onClick={() => setShareModal({ visible: false, content: '', strategy: '' })}>
            关闭
          </Button>,
        ]}
        width={520}
      >
        <Input.TextArea
          value={shareModal.content}
          rows={16}
          readOnly
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>
    </div>
  );
};

export default AIStockSelectionPage;
