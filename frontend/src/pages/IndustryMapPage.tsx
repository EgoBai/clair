/**
 * AI 产业地图页面
 * 
 * 核心功能：
 * 1. 产业链可视化图谱（React Flow）
 * 2. AI 产业链解读
 * 3. 相关标的推荐
 * 4. 智能问答
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  StarFilled,
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
  SendOutlined,
  FilterOutlined,
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IndustryChain,
  ChainSegment,
  ChainCompany,
  LayerType,
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
import { useWatchlistStore } from '../hooks/useWatchlistStore';

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
  
  // 如果没有 layers 数据，返回空图
  if (!chain.layers || !Array.isArray(chain.layers)) {
    return { nodes, edges };
  }
  
  // 层级位置计算
  const layerPositions: Record<LayerType, number> = {
    upstream: 0,
    midstream: 450,
    downstream: 900,
    support: 650,
  };
  
  // 按层级分组
  const layers = chain.layers.sort((a, b) => (a.order || 0) - (b.order || 0));
  
  layers.forEach((layer) => {
    const x = layerPositions[layer.type as LayerType] || 0;
    const segments = layer.segments;
    const totalSegments = segments.length;
    // 动态间距：段数多时缩小间距，避免超出画布
    const spacing = Math.min(180, Math.max(100, 700 / Math.max(totalSegments, 1)));
    
    segments.forEach((segment, index) => {
      const y = index * spacing + 50;
      
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const industryParam = searchParams.get('industry');
  
  const [selectedChain, setSelectedChain] = useState<IndustryChain | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<ChainSegment | null>(null);
  const [chains, setChains] = useState<IndustryChainSummary[]>(HOT_CHAINS);
  const [loading, setLoading] = useState(true);
  const [hotSectors, setHotSectors] = useState<any[]>([]); // 实时热门板块
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const watchlistStore = useWatchlistStore();
  
  // 获取产业链列表
  useEffect(() => {
    const fetchChains = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/industry-chains`);
        const data = await response.json();
        if (data.success) setChains(data.data.chains);
      } catch { /* fallback to HOT_CHAINS */ }
    };
    fetchChains();
  }, []);

  // 获取实时板块景气度 → 动态热门产业链
  useEffect(() => {
    const fetchHotSectors = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/sectors/momentum`);
        const data = await resp.json();
        if (data.success) {
          // 按score排序取Top5
          const sorted = (data.data || []).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
          setHotSectors(sorted.slice(0, 5));
        }
      } catch { /* fallback to empty */ }
    };
    fetchHotSectors();
  }, []);
  
  // 获取产业链详情 - 根据 industry 参数自动选择
  useEffect(() => {
    const fetchChainDetail = async () => {
      setLoading(true);
      try {
        // 如果有 industry 参数，尝试找到对应的产业链
        let chainId = 'ai-computing'; // 默认
        if (industryParam) {
          // 根据行业名称映射到产业链 ID
          const industryChainMap: Record<string, string> = {
            '电子': 'semiconductor',
            '计算机': 'ai-computing',
            '通信': 'ai-computing',
            '半导体': 'semiconductor',
            '芯片': 'semiconductor',
            '电力设备': 'photovoltaic',
            '光伏': 'photovoltaic',
            '新能源': 'new-energy-vehicle',
            '汽车': 'new-energy-vehicle',
            '机器人': 'ai-robot',
            '自动化': 'ai-robot',
          };
          chainId = industryChainMap[industryParam] || 'ai-computing';
        }
        
        const response = await fetch(`${API_BASE}/api/industry-chains/${chainId}`);
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
  }, [industryParam]);
  
  // React Flow 状态
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => selectedChain ? chainToGraph(selectedChain as IndustryChain) : { nodes: [], edges: [] },
    [selectedChain]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // 更新图谱
  useEffect(() => {
    if (!selectedChain) return;
    const { nodes: newNodes, edges: newEdges } = chainToGraph(selectedChain as IndustryChain);
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
    if (!selectedChain || !selectedChain.layers) return { totalCompanies: 0, leaders: 0, avgChange: 0, totalMarketCap: 0 };
    const allCompanies = selectedChain.layers.flatMap(l => l.segments?.flatMap(s => s.companies || []) || []);
    const totalCompanies = allCompanies.length;
    const leaders = allCompanies.filter(c => c.position === 'leader').length;
    const avgChange = allCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / (totalCompanies || 1);
    const totalMarketCap = allCompanies.reduce((sum, c) => sum + (c.marketCap || 0), 0);
    
    return { totalCompanies, leaders, avgChange, totalMarketCap };
  }, [selectedChain]);
  
  // AI 问答 — 增强版
  const handleAsk = async (presetQuestion?: string) => {
    const q = presetQuestion || question;
    if (!q.trim() || !chain) return;
    
    if (!presetQuestion) setQuestion('');
    setAsking(true);
    setAiAnswer('');
    
    // 构建完整的产业链实时上下文
    const allCompanies = chain.layers?.flatMap(l => 
      l.segments?.flatMap(s => s.companies || []) || []
    ) || [];
    
    const leaders = allCompanies.filter(c => c.position === 'leader');
    const upCount = allCompanies.filter(c => (c.changePercent || 0) > 0).length;
    const downCount = allCompanies.filter(c => (c.changePercent || 0) < 0).length;
    const avgChange = allCompanies.length > 0 
      ? (allCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / allCompanies.length).toFixed(2)
      : '0';
    const totalMc = allCompanies.reduce((sum, c) => sum + (c.marketCap || 0), 0);
    
    const marketContext = `
【实时市场数据】
- 总计 ${allCompanies.length} 家公司，其中龙头 ${leaders.length} 家
- 今日上涨 ${upCount} 家，下跌 ${downCount} 家
- 平均涨跌幅: ${avgChange}%
- 总市值: ${(totalMc / 10000).toFixed(0)}万亿元
- 龙头公司: ${leaders.map(c => `${c.name}(${c.symbol}) 涨${c.changePercent}%`).join('、')}

【产业链环节分布】
${chain.layers?.map(l => 
  `\n${l.name}(${l.type}): ${l.segments?.map(s => 
    `${s.name}[${s.companies?.length || 0}家, 龙头:${s.companies?.filter(c => c.position === 'leader').map(c => c.name).join(',') || '无'}]`
  ).join(', ')}`
).join('') || ''}`;
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `你是澄观AI产业链研究助手。请基于以下产业链实时数据回答用户问题，给出专业、有数据支撑的分析。

产业链: ${chain.name}
描述: ${chain.description}
${marketContext}

用户问题: ${q}

要求:
1. 引用具体公司名称和实时涨跌数据
2. 分析产业链各环节的强弱分布
3. 如果涉及投资，必须加风险提示
4. 回答简洁专业，300字以内`,
          context: [
            { role: 'system', content: '你是澄观AI产业链研究助手，专注于A股产业链实时分析。请基于提供的实时市场数据回答，不要编造信息。回答风格：专业、数据驱动、简洁。' },
          ],
          stream: true,  // SSE流式响应
        }),
      });
      
      // 流式读取SSE响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // 解析SSE data行
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const chunk = JSON.parse(payload);
                if (chunk.content) {
                  setAiAnswer(prev => prev + chunk.content);
                }
              } catch { /* 忽略无法解析的 SSE 数据块 */ }
            }
          }
        }
      }
    } catch (error) {
      setAiAnswer('网络错误，请检查后重试。');
    } finally {
      setAsking(false);
    }
  };
  
  // 渲染公司列表
  const renderCompanyList = (companies: ChainCompany[], title: string) => {
    const handleToggleWatchlist = (symbol: string, name: string) => {
      watchlistStore.toggle({ symbol, name });
      message.success(watchlistStore.has(symbol) ? '已加入自选' : '已取消自选');
    };
    
    return (
    <Card
      title={
        <Space>
          <FundOutlined />
          {title}
        </Space>
      }
      size="small"
      style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}
    >
      <List
        size="small"
        dataSource={companies}
        renderItem={(company) => (
          <List.Item
            style={{ cursor: 'pointer', padding: '8px 0' }}
            onClick={() => navigate(`/stocks/${company.symbol}.${company.symbol.startsWith('6') ? 'SH' : 'SZ'}`)}
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
            <Space>
              <Button
                type="text"
                size="small"
                icon={watchlistStore.has(company.symbol) ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleWatchlist(company.symbol, company.name);
                }}
                title="加入自选"
              />
              <Button
                type="text"
                size="small"
                icon={<FilterOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/screener?metric=hot_industry&search=${encodeURIComponent(company.symbol)}`);
                }}
                title="加入筛选"
              />
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
};
  
  if (loading || !selectedChain) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <Spin size="large">
          <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>加载产业链数据中...</div>
        </Spin>
      </div>
    );
  }
  
  const chain = selectedChain as IndustryChain; // 类型断言，确保非 null
  
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
        <div style={{ marginTop: 8 }}>
          <Space>
            <Button size="small" icon={<FilterOutlined />} onClick={() => navigate('/screener')}>
              策略选股
            </Button>
            <Button size="small" icon={<StarOutlined />} onClick={() => navigate('/watchlist')}>
              自选追踪
            </Button>
            <Button size="small" icon={<RiseOutlined />} onClick={() => navigate('/')}>
              市场洞察
            </Button>
          </Space>
        </div>
      </div>
      
      {/* 热门产业链 — 实时板块景气度Top5 */}
      <Card style={{ marginBottom: 24, background: 'var(--card-bg)' }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: 'var(--text-primary)' }}>
            <ThunderboltOutlined style={{ color: 'var(--color-warning)' }} /> 实时热门板块
          </Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            景气度 × 资金流向 Top5
          </Text>
        </div>
        <Space wrap size={[8, 8]}>
          {hotSectors.length > 0 ? hotSectors.map((sector: any) => (
            <Tag
              key={sector.industry}
              color="blue"
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
              onClick={() => navigate(`/industry-map?industry=${encodeURIComponent(sector.industry)}`)}
            >
              {sector.industry}
              <span style={{ marginLeft: 6, fontWeight: 600, color: Number(sector.avg_change_percent) >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                {Number(sector.avg_change_percent) >= 0 ? '+' : ''}{Number(sector.avg_change_percent).toFixed(1)}%
              </span>
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>景气{sector.score}分</span>
            </Tag>
          )) : chains.slice(0, 5).map((chain: any) => (
            <Tag
              key={chain.id}
              color="blue"
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
              onClick={() => {
                setSelectedChain(null);
                navigate(`/industry-map?industry=${encodeURIComponent(chain.name)}`);
              }}
            >
              {chain.name}
              <Badge count={chain.hotLevel} style={{ marginLeft: 4, backgroundColor: '#ff4d4f' }} />
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
        <Col xs={24} md={16}>
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
            {nodes.length > 0 ? (
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
            ) : (
              <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <ApartmentOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)', marginBottom: 16 }} />
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    暂无详细产业链图谱数据
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    以下为该产业链的摘要信息
                  </div>
                </div>
                
                {/* 摘要信息 */}
                <Card size="small" style={{ background: 'var(--bg-elevated)', marginBottom: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ color: 'var(--text-primary)' }}>产业描述</Text>
                    <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                      {chain.description}
                    </div>
                  </div>
                  
                  {chain.marketDrivers && chain.marketDrivers.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Text strong style={{ color: 'var(--text-primary)' }}>市场驱动</Text>
                      <div style={{ marginTop: 4 }}>
                        {chain.marketDrivers.map((driver, i) => (
                          <Tag key={i} color="blue" style={{ marginBottom: 4 }}>{driver}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {chain.relatedPolicies && chain.relatedPolicies.length > 0 && (
                    <div>
                      <Text strong style={{ color: 'var(--text-primary)' }}>相关政策</Text>
                      <div style={{ marginTop: 4 }}>
                        {chain.relatedPolicies.map((policy, i) => (
                          <Tag key={i} color="green" style={{ marginBottom: 4 }}>{policy}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </Card>
        </Col>
        
        {/* 右侧：详情面板 */}
        <Col xs={24} md={8}>
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
              {selectedChain?.aiAnalysis ? (
                <Tabs defaultActiveKey="overview" size="small">
                  <TabPane tab="概述" key="overview">
                    <Paragraph style={{ color: 'var(--text-secondary)' }}>
                      {selectedChain?.aiAnalysis.overview}
                    </Paragraph>
                  </TabPane>
                  <TabPane tab="投资逻辑" key="logic">
                    <Paragraph style={{ color: 'var(--text-secondary)' }}>
                      {selectedChain?.aiAnalysis.investmentLogic}
                    </Paragraph>
                    <Divider />
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary">受益顺序: </Text>
                      <Text style={{ color: 'var(--color-warning)' }}>
                        {selectedChain?.aiAnalysis.benefitOrder}
                      </Text>
                    </div>
                    <div>
                      <Text type="secondary">弹性排序: </Text>
                      <Text style={{ color: 'var(--color-up)' }}>
                        {selectedChain?.aiAnalysis.elasticityRank}
                      </Text>
                    </div>
                  </TabPane>
                  <TabPane tab="风险提示" key="risk">
                    <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20 }}>
                      {selectedChain?.aiAnalysis.riskFactors.map((risk, index) => (
                        <li key={index} style={{ marginBottom: 8 }}>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </TabPane>
                  <TabPane tab="核心洞察" key="insights">
                    <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20 }}>
                      {selectedChain?.aiAnalysis.keyInsights.map((insight, index) => (
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
                  onPressEnter={() => handleAsk()}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => handleAsk()}
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
                onClick={() => handleAsk('这个产业链的核心壁垒是什么？')}
              >
                核心壁垒
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => handleAsk('龙头企业有哪些？各自优势是什么？')}
              >
                龙头企业
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => handleAsk('这个产业链的投资逻辑和风险是什么？')}
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
