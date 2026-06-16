/**
 * AI 产业地图页面
 * 
 * 核心功能：
 * 1. 产业链可视化图谱（React Flow）
 * 2. AI 产业链解读
 * 3. 相关标的推荐
 * 4. 智能问答
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Tag,
  Space,
  Button,
  Select,
  Spin,
  Tabs,
  List,
  Badge,
  Tooltip,
  Input,
  message,
  Divider,
  Empty,
} from 'antd';
import {
  ApartmentOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  FundOutlined,
  QuestionCircleOutlined,
  StarOutlined,
  RiseOutlined,
  FallOutlined,
  SwapOutlined,
  InfoCircleOutlined,
  SendOutlined,
} from '@ant-design/icons';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useNavigate } from 'react-router-dom';
import {
  IndustryChain,
  ChainSegment,
  ChainCompany,
  LayerType,
  CompanyPosition,
  LAYER_COLORS,
  LAYER_NAMES,
  POSITION_COLORS,
  POSITION_NAMES,
  AI_COMPUTING_CHAIN,
  HOT_CHAINS,
  ChainNodeData,
  IndustryChainSummary,
} from '../types/industryChain';
import { renderMarkdown } from '../utils/markdown';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Search } = Input;
const { Option } = Select;

// API 基础 URL
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
// ============= 自定义节点组件 =============

/** 产业链环节节点 */
const SegmentNode: React.FC<NodeProps<ChainNodeData>> = ({ data, selected }) => {
  const segment = data.segment;
  const layerType = data.layerType;
  const color = LAYER_COLORS[layerType] || '#1890ff';
  const navigate = useNavigate();
  
  const leaderCount = segment.companies.filter(c => c.position === 'leader').length;
  const topChange = Math.max(...segment.companies.map(c => c.changePercent || 0));
  
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        border: `2px solid ${selected ? 'var(--accent-solid)' : color}`,
        background: selected ? 'var(--accent-light)' : 'var(--bg-card)',
        minWidth: 180,
        cursor: 'pointer',
        transition: 'all 0.3s',
        boxShadow: selected ? 'var(--glow-accent)' : 'var(--shadow-sm)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      
      <div style={{ marginBottom: 8 }}>
        <Tag color={color} style={{ margin: 0 }}>
          {LAYER_NAMES[layerType]}
        </Tag>
        {leaderCount > 0 && (
          <Tag color="red" style={{ marginLeft: 4 }}>
            {leaderCount}家龙头
          </Tag>
        )}
      </div>
      
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, color: 'var(--text-primary)' }}>
        {segment.name}
      </div>
      
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 8 }}>
        {segment.description.slice(0, 30)}...
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {segment.companies.length}家公司
        </Text>
        <Text
          style={{
            color: topChange >= 0 ? 'var(--color-up)' : 'var(--color-down)',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {topChange >= 0 ? '+' : ''}{topChange.toFixed(2)}%
        </Text>
      </div>
      
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  );
};

// 节点类型映射
const nodeTypes = {
  segment: SegmentNode,
};

// ============= 图谱布局算法 =============

/** 将产业链转换为 React Flow 节点和边 */
const chainToGraph = (chain: IndustryChain) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // 层级位置计算
  const layerPositions: Record<LayerType, number> = {
    upstream: 0,
    midstream: 400,
    downstream: 800,
    support: 600,
  };
  
  // 按层级分组
  const layers = chain.layers.sort((a, b) => a.order - b.order);
  
  layers.forEach((layer) => {
    const x = layerPositions[layer.type as LayerType] || 0;
    const segments = layer.segments;
    
    segments.forEach((segment, index) => {
      const y = index * 180 + 50;
      
      nodes.push({
        id: segment.id,
        type: 'segment',
        position: { x, y },
        data: {
          segment,
          layerType: layer.type,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      
      // 添加边
      segment.downstreamTo.forEach((targetId) => {
        edges.push({
          id: `${segment.id}-${targetId}`,
          source: segment.id,
          target: targetId,
          type: 'smoothstep',
          animated: true,
          style: {
            stroke: LAYER_COLORS[layer.type],
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: LAYER_COLORS[layer.type],
          },
        });
      });
    });
  });
  
  return { nodes, edges };
};

// ============= 主页面组件 =============

const IndustryMapPage: React.FC = () => {
  const [selectedChain, setSelectedChain] = useState<IndustryChain>(AI_COMPUTING_CHAIN);
  const [selectedSegment, setSelectedSegment] = useState<ChainSegment | null>(null);
  const [chains, setChains] = useState<IndustryChainSummary[]>(HOT_CHAINS);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  
  // 获取产业链列表
  useEffect(() => {
    const fetchChains = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/industry-chains`);
        const data = await response.json();
        if (data.success) {
          setChains(data.data.chains);
        }
      } catch (error) {
        console.error('获取产业链列表失败:', error);
      }
    };
    fetchChains();
  }, []);
  
  // 获取产业链详情
  useEffect(() => {
    const fetchChainDetail = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/industry-chains/ai-computing`);
        const data = await response.json();
        if (data.success) {
          setSelectedChain(data.data.chain);
        }
      } catch (error) {
        console.error('获取产业链详情失败:', error);
        // 使用默认数据
        setSelectedChain(AI_COMPUTING_CHAIN);
      } finally {
        setLoading(false);
      }
    };
    fetchChainDetail();
  }, []);
  
  // React Flow 状态
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => chainToGraph(selectedChain),
    [selectedChain]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // 更新图谱
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = chainToGraph(selectedChain);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [selectedChain, setNodes, setEdges]);
  
  // 节点点击
  const onNodeClick = useCallback((_: any, node: Node) => {
    const segment = node.data.segment as ChainSegment;
    setSelectedSegment(segment);
  }, []);
  
  // 计算统计信息
  const stats = useMemo(() => {
    const allCompanies = selectedChain.layers.flatMap(l => l.segments.flatMap(s => s.companies));
    const totalCompanies = allCompanies.length;
    const leaders = allCompanies.filter(c => c.position === 'leader').length;
    const avgChange = allCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / totalCompanies;
    const totalMarketCap = allCompanies.reduce((sum, c) => sum + (c.marketCap || 0), 0);
    
    return { totalCompanies, leaders, avgChange, totalMarketCap };
  }, [selectedChain]);
  
  // AI 问答 — 调用真实后端 API
  const handleAsk = async () => {
    if (!question.trim() || !selectedChain) return;
    
    setAsking(true);
    setAiAnswer('');
    
    // 构建产业链上下文
    const chainContext = {
      name: selectedChain.name,
      description: selectedChain.description,
      layers: selectedChain.layers.map(l => ({
        name: l.name,
        segments: l.segments.map(s => ({
          name: s.name,
          companies: s.companies.slice(0, 5).map(c => ({
            name: c.name,
            symbol: c.symbol,
            position: c.position,
          })),
        })),
      })),
      aiAnalysis: selectedChain.aiAnalysis,
    };
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `你是专业的产业链研究分析师。请基于以下产业链信息回答用户问题。

产业链信息：
${JSON.stringify(chainContext, null, 2)}

用户问题：${question}

请用专业但易懂的语言回答，包含具体数据和公司名称。如果涉及投资建议，请注明风险提示。`,
          context: [
            { role: 'system', content: '你是澄观AI产业链研究助手，专注于A股产业链分析。请基于真实数据回答，不要编造信息。' },
          ],
          stream: false,
        }),
      });
      
      const data = await response.json();
      if (data?.content) {
        setAiAnswer(data.content);
      } else {
        setAiAnswer('抱歉，暂时无法回答该问题。请稍后重试。');
      }
    } catch (error) {
      setAiAnswer('网络错误，请检查后重试。');
    } finally {
      setAsking(false);
    }
  };
  
  // 渲染公司列表
  const renderCompanyList = (companies: ChainCompany[], title: string) => (
    <Card
      title={
        <Space>
          <FundOutlined />
          {title}
        </Space>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      <List
        size="small"
        dataSource={companies}
        renderItem={(company) => (
          <List.Item
            style={{ cursor: 'pointer', padding: '8px 0' }}
            onClick={() => window.open(`/stock/${company.symbol}`, '_blank')}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{company.name}</Text>
                  <Text type="secondary">{company.symbol}</Text>
                  <Tag color={POSITION_COLORS[company.position]}>
                    {POSITION_NAMES[company.position]}
                  </Tag>
                </Space>
              }
              description={
                <Space>
                  {company.marketCap && (
                    <Text type="secondary">市值: {company.marketCap}亿</Text>
                  )}
                  <Text
                    style={{
                      color: (company.changePercent || 0) >= 0 ? 'var(--color-up)' : 'var(--color-down)',
                      fontWeight: 600,
                    }}
                  >
                    {(company.changePercent || 0) >= 0 ? '+' : ''}
                    {(company.changePercent || 0).toFixed(2)}%
                  </Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
  
  return (
    <div className="industry-map-page" style={{ padding: 24, background: 'var(--bg-base)', minHeight: '100vh' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
          <ApartmentOutlined style={{ marginRight: 8 }} />
          AI 产业地图
        </Title>
        <Text type="secondary">
          快速了解产业链结构、投资逻辑，发现核心标的
        </Text>
      </div>
      
      {/* 热门产业链选择 */}
      <Card style={{ marginBottom: 24, background: 'var(--card-bg)' }}>
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ color: 'var(--text-primary)', marginRight: 16 }}>
            <ThunderboltOutlined style={{ color: 'var(--color-warning)' }} /> 热门产业链
          </Text>
          <Select
            value={selectedChain.id}
            onChange={(value) => {
              // 实际应从 API 获取
              if (value === 'ai-computing') {
                setSelectedChain(AI_COMPUTING_CHAIN);
              }
            }}
            style={{ width: 200 }}
          >
            {HOT_CHAINS.map((chain) => (
              <Option key={chain.id} value={chain.id}>
                <Space>
                  {chain.name}
                  <Badge count={chain.hotLevel} style={{ backgroundColor: '#ff4d4f' }} />
                </Space>
              </Option>
            ))}
          </Select>
        </div>
        
        {/* 产业链标签 */}
        <Space wrap>
          {selectedChain.relatedConcepts.map((concept) => (
            <Tag key={concept} color="blue">
              {concept}
            </Tag>
          ))}
        </Space>
      </Card>
      
      {/* 统计概览 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">涉及公司</Text>}
              value={stats.totalCompanies}
              suffix="家"
              valueStyle={{ color: 'var(--accent-solid)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">龙头企业</Text>}
              value={stats.leaders}
              suffix="家"
              valueStyle={{ color: 'var(--color-up)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">平均涨幅</Text>}
              value={stats.avgChange}
              precision={2}
              suffix="%"
              valueStyle={{ color: stats.avgChange >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}
              prefix={stats.avgChange >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">总市值</Text>}
              value={stats.totalMarketCap}
              suffix="亿"
              valueStyle={{ color: 'var(--color-warning)' }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 主体内容 */}
      <Row gutter={24}>
        {/* 左侧：产业链图谱 */}
        <Col span={16}>
          <Card
            title={
              <Space>
                <ApartmentOutlined />
                产业链图谱
                <Tooltip title="点击节点查看详情，拖拽平移，滚轮缩放">
                  <InfoCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
                </Tooltip>
              </Space>
            }
            style={{ background: 'var(--card-bg)' }}
            bodyStyle={{ padding: 0, height: 600 }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              connectionLineType={ConnectionLineType.SmoothStep}
              fitView
              attributionPosition="bottom-left"
            >
              <Controls />
              <Background color="var(--border-subtle)" gap={16} />
            </ReactFlow>
          </Card>
        </Col>
        
        {/* 右侧：详情面板 */}
        <Col span={8}>
          {/* 环节详情 */}
          {selectedSegment ? (
            <Card
              title={
                <Space>
                  <Tag color={LAYER_COLORS[selectedSegment.layerId === 'upstream' ? 'upstream' : 'midstream']}>
                    {selectedSegment.name}
                  </Tag>
                </Space>
              }
              style={{ background: 'var(--card-bg)', marginBottom: 16 }}
              extra={
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelectedSegment(null)}
                >
                  关闭
                </Button>
              }
            >
              <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                {selectedSegment.description}
              </Paragraph>
              
              {/* 环节特征 */}
              {selectedSegment.characteristics && (
                <Card
                  type="inner"
                  title="环节特征"
                  size="small"
                  style={{ marginBottom: 16, background: 'var(--bg-secondary)' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {selectedSegment.characteristics.marketSize && (
                      <div>
                        <Text type="secondary">市场规模: </Text>
                        <Text style={{ color: 'var(--text-primary)' }}>
                          {selectedSegment.characteristics.marketSize}
                        </Text>
                      </div>
                    )}
                    {selectedSegment.characteristics.growthRate && (
                      <div>
                        <Text type="secondary">增速: </Text>
                        <Text style={{ color: 'var(--color-down)' }}>
                          {selectedSegment.characteristics.growthRate}
                        </Text>
                      </div>
                    )}
                    {selectedSegment.characteristics.competitiveLandscape && (
                      <div>
                        <Text type="secondary">竞争格局: </Text>
                        <Text style={{ color: 'var(--text-primary)' }}>
                          {selectedSegment.characteristics.competitiveLandscape}
                        </Text>
                      </div>
                    )}
                    {selectedSegment.characteristics.barriers && (
                      <div>
                        <Text type="secondary">进入壁垒: </Text>
                        <Space wrap>
                          {selectedSegment.characteristics.barriers.map((barrier) => (
                            <Tag key={barrier}>{barrier}</Tag>
                          ))}
                        </Space>
                      </div>
                    )}
                  </Space>
                </Card>
              )}
              
              {/* 公司列表 */}
              {renderCompanyList(selectedSegment.companies, `${selectedSegment.name}公司`)}
            </Card>
          ) : (
            <Card
              title={
                <Space>
                  <RocketOutlined />
                  AI 产业链解读
                </Space>
              }
              style={{ background: 'var(--card-bg)', marginBottom: 16 }}
            >
              {selectedChain.aiAnalysis ? (
                <Tabs defaultActiveKey="overview" size="small">
                  <TabPane tab="概述" key="overview">
                    <Paragraph style={{ color: 'var(--text-secondary)' }}>
                      {selectedChain.aiAnalysis.overview}
                    </Paragraph>
                  </TabPane>
                  <TabPane tab="投资逻辑" key="logic">
                    <Paragraph style={{ color: 'var(--text-secondary)' }}>
                      {selectedChain.aiAnalysis.investmentLogic}
                    </Paragraph>
                    <Divider />
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary">受益顺序: </Text>
                      <Text style={{ color: 'var(--color-warning)' }}>
                        {selectedChain.aiAnalysis.benefitOrder}
                      </Text>
                    </div>
                    <div>
                      <Text type="secondary">弹性排序: </Text>
                      <Text style={{ color: 'var(--color-up)' }}>
                        {selectedChain.aiAnalysis.elasticityRank}
                      </Text>
                    </div>
                  </TabPane>
                  <TabPane tab="风险提示" key="risk">
                    <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20 }}>
                      {selectedChain.aiAnalysis.riskFactors.map((risk, index) => (
                        <li key={index} style={{ marginBottom: 8 }}>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </TabPane>
                  <TabPane tab="核心洞察" key="insights">
                    <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20 }}>
                      {selectedChain.aiAnalysis.keyInsights.map((insight, index) => (
                        <li key={index} style={{ marginBottom: 8 }}>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </TabPane>
                </Tabs>
              ) : (
                <Empty description="暂无AI分析" />
              )}
            </Card>
          )}
          
          {/* AI 问答 */}
          <Card
            title={
              <Space>
                <QuestionCircleOutlined />
                AI 问答
              </Space>
            }
            style={{ background: 'var(--card-bg)' }}
          >
            <div style={{ marginBottom: 16 }}>
              <Input.Group compact>
                <Input
                  style={{ width: 'calc(100% - 80px)' }}
                  placeholder="询问产业链相关问题..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onPressEnter={handleAsk}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleAsk}
                  loading={asking}
                >
                  提问
                </Button>
              </Input.Group>
            </div>
            
            {/* 快捷问题 */}
            <Space wrap style={{ marginBottom: 16 }}>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => { setQuestion('产业链的核心壁垒是什么？'); handleAsk(); }}
              >
                核心壁垒
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => { setQuestion('龙头企业有哪些？'); handleAsk(); }}
              >
                龙头企业
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => { setQuestion('投资逻辑是什么？'); handleAsk(); }}
              >
                投资逻辑
              </Tag>
            </Space>
            
            {/* AI 回答 */}
            {aiAnswer && (
              <Card
                type="inner"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <div
                  style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnswer) }}
                />
              </Card>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// 统计数字组件
const Statistic: React.FC<{
  title: React.ReactNode;
  value: number;
  suffix?: string;
  prefix?: React.ReactNode;
  precision?: number;
  valueStyle?: React.CSSProperties;
}> = ({ title, value, suffix, prefix, precision = 0, valueStyle }) => (
  <div>
    <div style={{ marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 24, fontWeight: 600, ...valueStyle }}>
      {prefix}
      {value.toFixed(precision)}
      {suffix && <span style={{ fontSize: 14, marginLeft: 4 }}>{suffix}</span>}
    </div>
  </div>
);

export default IndustryMapPage;
