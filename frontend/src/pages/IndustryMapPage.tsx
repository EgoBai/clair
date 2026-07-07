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
  Skeleton,
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
  const _navigate = useNavigate();
  
  const leaderCount = segment.companies.filter(c => c.position === 'leader').length;
  const hasCompanies = segment.companies.length > 0;
  const topChange = hasCompanies
    ? Math.max(...segment.companies.map(c => c.changePercent || 0))
    : 0;
  
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
          {hasCompanies ? `${segment.companies.length}家公司` : '暂无数据'}
        </Text>
        {hasCompanies ? (
          <Text
            style={{
              color: topChange >= 0 ? 'var(--color-up)' : 'var(--color-down)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {topChange >= 0 ? '+' : ''}{topChange.toFixed(2)}%
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        )}
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
  
  if (!chain.layers || !Array.isArray(chain.layers)) {
    return { nodes, edges };
  }
  
  const layerPositions: Record<LayerType, number> = {
    upstream: 0,
    midstream: 450,
    downstream: 900,
    support: 650,
  };
  
  const layers = chain.layers.sort((a, b) => (a.order || 0) - (b.order || 0));
  
  // 统一多层渲染: 上游(左)/中游(中)/下游(右), 按连线绘制边
  layers.forEach((layer) => {
    const x = layerPositions[layer.type as LayerType] || 0;
    const segments = layer.segments;
    const totalSegments = segments.length;
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
  const [initialLoading, setInitialLoading] = useState(true);    // 首次加载
  const [chainLoading, setChainLoading] = useState(false);       // 切换链加载（不遮挡整体）
  const [hotSectors, setHotSectors] = useState<any[]>([]);
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

  // 获取实时板块景气度
  useEffect(() => {
    const fetchHotSectors = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/sectors/momentum`);
        const data = await resp.json();
        if (data.success) {
          const sorted = (data.data || []).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
          setHotSectors(sorted.slice(0, 5));
        }
      } catch { /* fallback to empty */ }
    };
    fetchHotSectors();
  }, []);
  
  // 根据 industry 参数匹配产业链 ID
  const matchChainId = useCallback((industryName: string): string => {
    const name = industryName.toLowerCase();
    const exact = chains.find(c => c.name === industryName);
    if (exact) return exact.id;
    const fuzzy = chains.find(c => c.name.includes(industryName) || industryName.includes(c.name));
    if (fuzzy) return fuzzy.id;
    const keywords: Record<string, string> = {
      "电子": "semiconductor", "计算机": "ai-computing", "通信": "ai-computing",
      "半导体": "semiconductor", "芯片": "semiconductor",
      "电力设备": "photovoltaic", "光伏": "photovoltaic",
      "新能源": "new-energy-vehicle", "汽车": "new-energy-vehicle",
      "机器人": "ai-robot", "自动化": "ai-robot",
      "ai算力": "ai-computing", "新能源汽车": "new-energy-vehicle",
    };
    for (const [kw, id] of Object.entries(keywords)) {
      if (name.includes(kw)) return id;
    }
    return "ai-computing";
  }, [chains]);
  
  // 获取产业链详情
  const fetchChainDetail = useCallback(async (chainId: string) => {
    setChainLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/industry-chains/${chainId}`);
      const data = await response.json();
      if (data.success) {
        setSelectedChain(data.data.chain);
      }
    } catch (error) {
      console.error('获取产业链详情失败:', error);
      setSelectedChain(AI_COMPUTING_CHAIN);
    } finally {
      setChainLoading(false);
    }
  }, []);
  
  // 初始加载 + industry 参数变化时拉取
  useEffect(() => {
    const chainId = industryParam ? matchChainId(industryParam) : 'ai-computing';
    fetchChainDetail(chainId).finally(() => setInitialLoading(false));
  }, [industryParam, chains]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // React Flow 状态
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => selectedChain ? chainToGraph(selectedChain as IndustryChain) : { nodes: [], edges: [] },
    [selectedChain]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  useEffect(() => {
    if (!selectedChain) return;
    const { nodes: newNodes, edges: newEdges } = chainToGraph(selectedChain as IndustryChain);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [selectedChain, setNodes, setEdges]);
  
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
    const avgChange = totalCompanies > 0
      ? allCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / totalCompanies
      : 0;
    const totalMarketCap = allCompanies.reduce((sum, c) => sum + (c.marketCap || 0), 0);
    
    return { totalCompanies, leaders, avgChange, totalMarketCap };
  }, [selectedChain]);
  
  // AI 问答
  const handleAsk = async (presetQuestion?: string) => {
    const q = presetQuestion || question;
    if (!q.trim() || !chain) return;
    
    if (!presetQuestion) setQuestion('');
    setAsking(true);
    setAiAnswer('');
    
    const allCompanies = chain.layers?.flatMap(l => 
      l.segments?.flatMap(s => s.companies || []) || []
    ) || [];
    
    const leaders = allCompanies.filter(c => c.position === 'leader');
    const upCount = allCompanies.filter(c => (c.changePercent || 0) > 0).length;
    const downCount = allCompanies.filter(c => (c.changePercent || 0) < 0).length;
    const avgChangeVal = allCompanies.length > 0 
      ? (allCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / allCompanies.length).toFixed(2)
      : '0';
    const totalMc = allCompanies.reduce((sum, c) => sum + (c.marketCap || 0), 0);

    // 产业链位置分析: 计算每个segment的详情（用于热度排序）
    const segmentDetails = chain.layers?.flatMap(l =>
      l.segments?.map(s => {
        const segCompanies = s.companies || [];
        const segAvgChange = segCompanies.length > 0
          ? (segCompanies.reduce((sum, c) => sum + (c.changePercent || 0), 0) / segCompanies.length).toFixed(2)
          : '0';
        return `${s.name}[${segCompanies.length}家,均涨${segAvgChange}%]`;
      }) || []
    ) || [];
    
    const marketContext = `
【实时市场数据】
- 总计 ${allCompanies.length} 家公司，其中龙头 ${leaders.length} 家
- 今日上涨 ${upCount} 家，下跌 ${downCount} 家
- 平均涨跌幅: ${avgChangeVal}%
- 总市值: ${(totalMc / 10000).toFixed(0)}万亿元
- 龙头公司: ${leaders.map(c => `${c.name}(${c.symbol}) 涨${c.changePercent}%`).join('、')}

【产业链环节分布】
${chain.layers?.map(l => 
  `\n${l.name}(${l.type}): ${l.segments?.map(s => 
    `${s.name}[${s.companies?.length || 0}家, 龙头:${s.companies?.filter(c => c.position === 'leader').map(c => c.name).join(',') || '无'}]`
  ).join(', ')}`
).join('') || ''}

【各环节涨跌明细】${segmentDetails.join(' ｜ ')}
【产业链位置与投资时间窗口】请根据以上数据判断当前产业链处于景气周期的哪个阶段（早期/中期/后期），并给出对应的投资时间窗口建议。`;

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
1. 引用具体公司名称和实时涨跌数据，标注产业链位置
2. 分析产业链各环节的强弱分布和景气阶段
3. 给出投资时间窗口判断（短期/中期/长期视角）
4. 如果涉及投资，必须加风险提示
5. 回答简洁专业，400字以内`,
          context: [
            { role: 'system', content: '你是澄观AI产业链研究助手，专注于A股产业链实时分析。请基于提供的实时市场数据回答，不要编造信息。回答风格：专业、数据驱动、简洁。' },
          ],
          stream: true,
        }),
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
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
      {companies.length === 0 ? (
        <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
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
      )}
    </Card>
  );
};
  
  // 首次全页加载
  if (initialLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <Spin size="large">
          <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>加载产业链数据中...</div>
        </Spin>
      </div>
    );
  }
  
  const chain = selectedChain as IndustryChain;
  
  // 响应式图表高度
  const graphHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? 380 : 600;
  
  return (
    <div className="industry-map-page" style={{ padding: 'clamp(12px, 2vw, 24px)', background: 'var(--bg-base)', minHeight: '100vh' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 8, fontSize: 'clamp(18px, 4vw, 30px)' }}>
          <ApartmentOutlined style={{ marginRight: 8 }} />
          AI 产业地图
        </Title>
        <Text type="secondary">
          快速了解产业链结构、投资逻辑，发现核心标的
        </Text>
        <div style={{ marginTop: 8 }}>
          <Space wrap>
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
      
      {/* 热门产业链 */}
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
          )) : chains.slice(0, 5).map((chainItem: any) => (
            <Tag
              key={chainItem.id}
              color="blue"
              style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }}
              onClick={() => navigate(`/industry-map?industry=${encodeURIComponent(chainItem.name)}`)}
            >
              {chainItem.name}
              <Badge count={chainItem.hotLevel} style={{ marginLeft: 4, backgroundColor: '#ff4d4f' }} />
            </Tag>
          ))}
        </Space>
      </Card>
      
      {/* 统计概览 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">涉及公司</Text>}
              value={stats.totalCompanies}
              suffix="家"
              valueStyle={{ color: 'var(--accent-solid)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ background: 'var(--card-bg)', textAlign: 'center' }}>
            <Statistic
              title={<Text type="secondary">龙头企业</Text>}
              value={stats.leaders}
              suffix="家"
              valueStyle={{ color: 'var(--color-up)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
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
        <Col xs={12} sm={6}>
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
      <Row gutter={[24, 24]}>
        {/* 左侧：产业链图谱 */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <ApartmentOutlined />
                产业链图谱
                {chainLoading && <Spin size="small" style={{ marginLeft: 8 }} />}
                <Tooltip title="点击节点查看详情，拖拽平移，滚轮缩放">
                  <InfoCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
                </Tooltip>
              </Space>
            }
            style={{ background: 'var(--card-bg)' }}
            bodyStyle={{ padding: 0, height: graphHeight }}
          >
            {chainLoading ? (
              <div style={{ padding: 24, height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Skeleton active paragraph={{ rows: 4 }} />
              </div>
            ) : nodes.length > 0 ? (
              <ReactFlow
                key={chain.id}
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
        <Col xs={24} lg={8}>
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
                (() => {
                  // 基于segment数据生成分析
                  const layers = chain.layers || [];
                  const allSegments = layers.flatMap((l: any) =>
                    (l.segments || []).map((s: any) => ({
                      ...s,
                      layerName: l.name,
                      layerType: l.type,
                      companyCount: (s.companies || []).length,
                      avgChange: (s.companies || []).length > 0
                        ? (s.companies || []).reduce((sum: number, c: any) => sum + (c.changePercent || 0), 0) / (s.companies || []).length
                        : 0,
                      leaderCount: (s.companies || []).filter((c: any) => c.position === 'leader').length,
                    }))
                  );
                  const hotSegment = allSegments.length > 0
                    ? allSegments.reduce((a: any, b: any) => (a.avgChange > b.avgChange ? a : b))
                    : null;
                  const coldSegment = allSegments.length > 0
                    ? allSegments.reduce((a: any, b: any) => (a.avgChange < b.avgChange ? a : b))
                    : null;

                  return (
                    <Tabs defaultActiveKey="segments" size="small">
                      <TabPane tab="环节分析" key="segments">
                        <Paragraph style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                          {chain.description}
                        </Paragraph>
                        {allSegments.length > 0 ? (
                          <div>
                            {allSegments.map((seg: any) => (
                              <div key={seg.id} style={{
                                padding: '8px 12px',
                                marginBottom: 8,
                                borderRadius: 6,
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Space>
                                    <Tag color={LAYER_COLORS[seg.layerType as LayerType] || '#1890ff'}>
                                      {seg.layerName}
                                    </Tag>
                                    <Text strong style={{ color: 'var(--text-primary)' }}>{seg.name}</Text>
                                  </Space>
                                  <Text style={{
                                    color: seg.avgChange >= 0 ? 'var(--color-up)' : 'var(--color-down)',
                                    fontWeight: 600,
                                  }}>
                                    {seg.avgChange >= 0 ? '+' : ''}{seg.avgChange.toFixed(2)}%
                                  </Text>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                  {seg.companyCount}家公司 · 龙头{seg.leaderCount}家
                                  {seg.companyCount > 0 && seg.leaderCount > 0 && (
                                    <span>：{(seg.companies || []).filter((c: any) => c.position === 'leader').map((c: any) => c.name).join('、')}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Text type="secondary">暂无环节数据，加载中...</Text>
                        )}
                      </TabPane>
                      <TabPane tab="热度排行" key="heat">
                        {hotSegment && coldSegment ? (
                          <div>
                            <div style={{
                              padding: '10px 14px',
                              marginBottom: 12,
                              borderRadius: 6,
                              background: 'rgba(255, 77, 79, 0.08)',
                              border: '1px solid rgba(255, 77, 79, 0.2)',
                            }}>
                              <Text strong style={{ color: 'var(--color-up)' }}>
                                🔥 最热环节：{hotSegment.name}
                              </Text>
                              <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 13 }}>
                                均涨 +{hotSegment.avgChange.toFixed(2)}% · {hotSegment.companyCount}家公司
                              </div>
                            </div>
                            <div style={{
                              padding: '10px 14px',
                              marginBottom: 12,
                              borderRadius: 6,
                              background: 'rgba(82, 196, 26, 0.06)',
                              border: '1px solid rgba(82, 196, 26, 0.2)',
                            }}>
                              <Text strong style={{ color: 'var(--color-down)' }}>
                                ❄️ 最冷环节：{coldSegment.name}
                              </Text>
                              <div style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 13 }}>
                                均涨 {coldSegment.avgChange.toFixed(2)}% · {coldSegment.companyCount}家公司
                              </div>
                            </div>
                            <Divider style={{ margin: '8px 0' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              热度差：{(hotSegment.avgChange - coldSegment.avgChange).toFixed(2)}%，表明产业链内部分化
                              {(hotSegment.avgChange - coldSegment.avgChange) > 3 ? '显著' : '一般'}。
                            </Text>
                          </div>
                        ) : (
                          <Text type="secondary">暂无热度数据</Text>
                        )}
                      </TabPane>
                      <TabPane tab="投资关注" key="focus">
                        <ul style={{ color: 'var(--text-secondary)', paddingLeft: 20, fontSize: 13 }}>
                          <li style={{ marginBottom: 8 }}>关注{chain.name}各环节景气度变化，优先布局景气上行环节</li>
                          <li style={{ marginBottom: 8 }}>龙头企业具备护城河优势，是长期配置的核心选择</li>
                          <li style={{ marginBottom: 8 }}>注意产业链上下游传导时滞，上游先行、下游跟进</li>
                          <li style={{ marginBottom: 8 }}>结合政策面和资金面变化，动态调整配置权重</li>
                        </ul>
                      </TabPane>
                    </Tabs>
                  );
                })()
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
            
            <Space wrap style={{ marginBottom: 16 }}>
              <Tag
                style={{ cursor: 'pointer' }}
                color="blue"
                onClick={() => handleAsk('这条链的投资逻辑是什么？当前处于什么景气阶段？')}
              >
                投资逻辑
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                color="purple"
                onClick={() => handleAsk('哪个环节弹性最大？为什么？')}
              >
                弹性最大
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                color="cyan"
                onClick={() => handleAsk('龙头企业有哪些？各自优势是什么？')}
              >
                龙头企业
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                color="orange"
                onClick={() => handleAsk('当前投资时间窗口如何？短期/中期/长期分别怎么看？')}
              >
                时间窗口
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                onClick={() => handleAsk('这个产业链的核心壁垒是什么？')}
              >
                核心壁垒
              </Tag>
              <Tag
                style={{ cursor: 'pointer' }}
                color="red"
                onClick={() => handleAsk('主要风险因素有哪些？如何应对？')}
              >
                风险提示
              </Tag>
            </Space>
            
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
    <div style={{ fontSize: 'clamp(16px, 4vw, 24px)', fontWeight: 600, ...valueStyle }}>
      {prefix}
      {value.toFixed(precision)}
      {suffix && <span style={{ fontSize: 'clamp(12px, 2vw, 14px)', marginLeft: 4 }}>{suffix}</span>}
    </div>
  </div>
);

export default IndustryMapPage;
