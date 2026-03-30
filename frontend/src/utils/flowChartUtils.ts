/**
 * 流向图工具
 * 桑基图(Sankey)和弦图(Chord)数据处理
 */

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
  value?: number;
  depth?: number;
  category?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color?: string;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface ChordNode {
  id: string;
  name: string;
  color?: string;
}

export interface ChordLink {
  source: string;
  target: string;
  value: number;
}

export interface ChordData {
  nodes: ChordNode[];
  links: ChordLink[];
  matrix?: number[][];
}

/**
 * 从资金流向数据生成桑基图数据
 */
export function generateFundFlowSankey(
  flows: {
    from: string;
    to: string;
    amount: number;
    fromCategory?: string;
    toCategory?: string;
  }[]
): SankeyData {
  const nodeMap = new Map<string, SankeyNode>();
  const links: SankeyLink[] = [];
  const categoryColors: Record<string, string> = {
    '机构': '#1890ff',
    '散户': '#fa8c16',
    '北向': '#52c41a',
    '板块': '#722ed1',
    '行业': '#13c2c2',
    '默认': '#8c8c8c',
  };

  for (const flow of flows) {
    // 添加节点
    if (!nodeMap.has(flow.from)) {
      nodeMap.set(flow.from, {
        id: flow.from,
        name: flow.from,
        category: flow.fromCategory,
        color: categoryColors[flow.fromCategory || '默认'],
      });
    }
    if (!nodeMap.has(flow.to)) {
      nodeMap.set(flow.to, {
        id: flow.to,
        name: flow.to,
        category: flow.toCategory,
        color: categoryColors[flow.toCategory || '默认'],
      });
    }

    // 累加同方向流量
    const existingLink = links.find(
      l => l.source === flow.from && l.target === flow.to
    );
    if (existingLink) {
      existingLink.value += flow.amount;
    } else {
      links.push({
        source: flow.from,
        target: flow.to,
        value: flow.amount,
        color: categoryColors[flow.fromCategory || '默认'] + '80',
      });
    }
  }

  // 计算节点总值
  for (const node of nodeMap.values()) {
    const outValue = links.filter(l => l.source === node.id).reduce((s, l) => s + l.value, 0);
    const inValue = links.filter(l => l.target === node.id).reduce((s, l) => s + l.value, 0);
    node.value = Math.max(outValue, inValue);
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  };
}

/**
 * 生成板块轮动桑基图
 */
export function generateSectorRotationSankey(
  timeSlots: string[],
  transitions: { from: string; to: string; period: number; amount: number }[]
): SankeyData {
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const nodeSet = new Set<string>();

  for (const t of transitions) {
    const fromId = `${t.period}_${t.from}`;
    const toId = `${t.period + 1}_${t.to}`;

    if (!nodeSet.has(fromId)) {
      nodeSet.add(fromId);
      nodes.push({
        id: fromId,
        name: `${timeSlots[t.period] || `阶段${t.period}`} - ${t.from}`,
        depth: t.period,
      });
    }
    if (!nodeSet.has(toId)) {
      nodeSet.add(toId);
      nodes.push({
        id: toId,
        name: `${timeSlots[t.period + 1] || `阶段${t.period + 1}`} - ${t.to}`,
        depth: t.period + 1,
      });
    }

    links.push({
      source: fromId,
      target: toId,
      value: t.amount,
    });
  }

  return { nodes, links };
}

/**
 * 从邻接矩阵生成弦图数据
 */
export function generateChordFromMatrix(
  labels: string[],
  matrix: number[][],
  colors?: string[]
): ChordData {
  const nodes: ChordNode[] = labels.map((label, i) => ({
    id: String(i),
    name: label,
    color: colors?.[i] || `hsl(${(i * 360) / labels.length}, 70%, 50%)`,
  }));

  const links: ChordLink[] = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      if (matrix[i][j] > 0) {
        links.push({ source: String(i), target: String(j), value: matrix[i][j] });
      }
      if (matrix[j][i] > 0) {
        links.push({ source: String(j), target: String(i), value: matrix[j][i] });
      }
    }
  }

  return { nodes, links, matrix };
}

/**
 * 从关联数据生成弦图
 */
export function generateChordFromCorrelations(
  items: { id: string; name: string; color?: string }[],
  correlations: { source: string; target: string; strength: number }[]
): ChordData {
  const nodes: ChordNode[] = items.map(item => ({
    id: item.id,
    name: item.name,
    color: item.color,
  }));

  const links: ChordLink[] = correlations
    .filter(c => c.strength > 0)
    .map(c => ({
      source: c.source,
      target: c.target,
      value: c.strength,
    }));

  return { nodes, links };
}

/**
 * 计算桑基图层级布局
 */
export function calculateSankeyDepths(data: SankeyData): Map<string, number> {
  const depths = new Map<string, number>();
  const visited = new Set<string>();

  // 找到所有源节点（没有入边的节点）
  const targetIds = new Set(data.links.map(l => l.target));
  const sourceNodes = data.nodes.filter(n => !targetIds.has(n.id));

  // BFS分配深度
  const queue: { id: string; depth: number }[] = sourceNodes.map(n => ({ id: n.id, depth: 0 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depths.set(id, depth);

    // 找到从该节点出发的边
    const outLinks = data.links.filter(l => l.source === id);
    for (const link of outLinks) {
      if (!visited.has(link.target)) {
        queue.push({ id: link.target, depth: depth + 1 });
      }
    }
  }

  // 处理未访问的节点
  for (const node of data.nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, 0);
    }
  }

  return depths;
}

/**
 * 过滤桑基图数据（保留top N流量）
 */
export function filterSankeyData(
  data: SankeyData,
  topN: number = 20,
  minValue?: number
): SankeyData {
  let filteredLinks = [...data.links];

  if (minValue !== undefined) {
    filteredLinks = filteredLinks.filter(l => l.value >= minValue);
  }

  // 按流量排序取top N
  filteredLinks.sort((a, b) => b.value - a.value);
  filteredLinks = filteredLinks.slice(0, topN);

  // 保留相关节点
  const nodeIds = new Set<string>();
  filteredLinks.forEach(l => {
    nodeIds.add(l.source);
    nodeIds.add(l.target);
  });

  const filteredNodes = data.nodes.filter(n => nodeIds.has(n.id));

  return { nodes: filteredNodes, links: filteredLinks };
}

/**
 * 计算弦图统计
 */
export function calculateChordStats(data: ChordData): {
  totalFlow: number;
  maxFlow: { source: string; target: string; value: number };
  nodeStrengths: Map<string, { inFlow: number; outFlow: number; total: number }>;
} {
  let totalFlow = 0;
  let maxFlow = { source: '', target: '', value: 0 };
  const nodeStrengths = new Map<string, { inFlow: number; outFlow: number; total: number }>();

  for (const node of data.nodes) {
    nodeStrengths.set(node.id, { inFlow: 0, outFlow: 0, total: 0 });
  }

  for (const link of data.links) {
    totalFlow += link.value;
    if (link.value > maxFlow.value) {
      maxFlow = { source: link.source, target: link.target, value: link.value };
    }

    const srcStrength = nodeStrengths.get(link.source);
    if (srcStrength) srcStrength.outFlow += link.value;

    const tgtStrength = nodeStrengths.get(link.target);
    if (tgtStrength) tgtStrength.inFlow += link.value;
  }

  for (const strength of nodeStrengths.values()) {
    strength.total = strength.inFlow + strength.outFlow;
  }

  return { totalFlow, maxFlow, nodeStrengths };
}
