/**
 * 板块联动引擎 (Sector Linkage Engine)
 * - 上下游产业链联动
 * - 板块间溢出效应
 * - 板块轮动预测
 * - 联动强度计算
 * - 传导路径分析
 */

export interface SectorRelation {
  upstream: string;
  downstream: string;
  strength: number;     // 0-1
  lagDays: number;
  correlation: number;
}

export interface SpilloverEffect {
  source: string;
  target: string;
  type: 'price' | 'volume' | 'sentiment';
  magnitude: number;
  direction: 'positive' | 'negative';
  halfLife: number;     // 半衰期（天）
}

export interface ChainPath {
  path: string[];
  totalStrength: number;
  totalLag: number;
  expectedImpact: number;
}

export interface LinkageCluster {
  sectors: string[];
  internalCorrelation: number;
  leadSector: string;
  clusterStrength: number;
}

// 预定义产业链关系
const INDUSTRY_CHAINS: SectorRelation[] = [
  { upstream: '有色金属', downstream: '新能源', strength: 0.8, lagDays: 3, correlation: 0.7 },
  { upstream: '化工', downstream: '医药', strength: 0.6, lagDays: 5, correlation: 0.5 },
  { upstream: '半导体', downstream: '消费电子', strength: 0.85, lagDays: 2, correlation: 0.75 },
  { upstream: '钢铁', downstream: '基建', strength: 0.7, lagDays: 4, correlation: 0.6 },
  { upstream: '煤炭', downstream: '电力', strength: 0.75, lagDays: 2, correlation: 0.65 },
  { upstream: '银行', downstream: '房地产', strength: 0.8, lagDays: 3, correlation: 0.7 },
  { upstream: '原油', downstream: '化工', strength: 0.85, lagDays: 1, correlation: 0.8 },
  { upstream: '芯片', downstream: '汽车', strength: 0.7, lagDays: 5, correlation: 0.55 },
  { upstream: '锂矿', downstream: '锂电池', strength: 0.9, lagDays: 2, correlation: 0.85 },
  { upstream: '光伏硅料', downstream: '光伏组件', strength: 0.85, lagDays: 3, correlation: 0.8 },
];

/**
 * 获取直接上下游关系
 */
export function getDirectRelations(sector: string): {
  upstream: SectorRelation[];
  downstream: SectorRelation[];
} {
  return {
    upstream: INDUSTRY_CHAINS.filter(r => r.downstream === sector),
    downstream: INDUSTRY_CHAINS.filter(r => r.upstream === sector),
  };
}

/**
 * 计算溢出效应
 */
export function calculateSpillover(
  source: string,
  sourceReturn: number,
  target: string,
  correlation: number
): SpilloverEffect | null {
  const relation = INDUSTRY_CHAINS.find(
    r => (r.upstream === source && r.downstream === target) ||
         (r.downstream === source && r.upstream === target)
  );

  if (!relation) return null;

  const magnitude = Math.abs(sourceReturn) * relation.strength * Math.abs(correlation);
  const direction = correlation >= 0 ? 'positive' : 'negative';

  return {
    source,
    target,
    type: 'price',
    magnitude: Math.round(magnitude * 100) / 100,
    direction,
    halfLife: relation.lagDays * 1.5,
  };
}

/**
 * 传导路径分析
 */
export function findPropagationPaths(
  start: string,
  maxDepth: number = 4
): ChainPath[] {
  const paths: ChainPath[] = [];
  const visited = new Set<string>();

  function dfs(current: string, path: string[], strength: number, lag: number) {
    if (path.length > maxDepth) return;

    if (path.length > 1) {
      paths.push({
        path: [...path],
        totalStrength: Math.round(strength * 100) / 100,
        totalLag: lag,
        expectedImpact: Math.round(strength * 100 / Math.max(lag, 1)) / 100,
      });
    }

    visited.add(current);

    for (const chain of INDUSTRY_CHAINS) {
      let next: string | null = null;
      let newStrength = strength;
      let newLag = lag;

      if (chain.upstream === current && !visited.has(chain.downstream)) {
        next = chain.downstream;
        newStrength *= chain.strength;
        newLag += chain.lagDays;
      } else if (chain.downstream === current && !visited.has(chain.upstream)) {
        next = chain.upstream;
        newStrength *= chain.strength * 0.7; // 反向传导衰减更多
        newLag += chain.lagDays + 1;
      }

      if (next) {
        dfs(next, [...path, next], newStrength, newLag);
      }
    }

    visited.delete(current);
  }

  dfs(start, [start], 1, 0);
  return paths.sort((a, b) => b.expectedImpact - a.expectedImpact).slice(0, 20);
}

/**
 * 板块联动聚类
 */
export function clusterLinkedSectors(
  sectorReturns: Map<string, number>
): LinkageCluster[] {
  const sectors = [...sectorReturns.keys()];
  const clusters: LinkageCluster[] = [];
  const assigned = new Set<string>();

  for (const sector of sectors) {
    if (assigned.has(sector)) continue;

    const related: string[] = [sector];
    const relations = INDUSTRY_CHAINS.filter(
      r => r.upstream === sector || r.downstream === sector
    );

    for (const rel of relations) {
      const other = rel.upstream === sector ? rel.downstream : rel.upstream;
      if (!assigned.has(other) && sectors.includes(other) && rel.strength > 0.6) {
        related.push(other);
      }
    }

    if (related.length >= 2) {
      // 找领先板块
      let leadSector = sector;
      let bestStrength = 0;
      for (const rel of relations) {
        if (rel.strength > bestStrength && related.includes(rel.upstream) && related.includes(rel.downstream)) {
          bestStrength = rel.strength;
          leadSector = rel.upstream;
        }
      }

      // 内部相关性
      const avgCorrelation = relations
        .filter(r => related.includes(r.upstream) && related.includes(r.downstream))
        .reduce((s, r) => s + r.correlation, 0) / Math.max(1, related.length - 1);

      const avgStrength = relations
        .filter(r => related.includes(r.upstream) && related.includes(r.downstream))
        .reduce((s, r) => s + r.strength, 0) / Math.max(1, related.length - 1);

      clusters.push({
        sectors: related,
        internalCorrelation: Math.round(avgCorrelation * 100) / 100,
        leadSector,
        clusterStrength: Math.round(avgStrength * 100) / 100,
      });

      related.forEach(s => assigned.add(s));
    }
  }

  return clusters.sort((a, b) => b.clusterStrength - a.clusterStrength);
}

/**
 * 预测受影响板块
 */
export function predictAffectedSectors(
  changedSector: string,
  changePercent: number
): { sector: string; expectedImpact: number; lagDays: number; confidence: number }[] {
  const results: { sector: string; expectedImpact: number; lagDays: number; confidence: number }[] = [];

  for (const chain of INDUSTRY_CHAINS) {
    let target: string | null = null;
    let direction = 1;

    if (chain.upstream === changedSector) {
      target = chain.downstream;
      direction = 1;
    } else if (chain.downstream === changedSector) {
      target = chain.upstream;
      direction = 0.7; // 下游对上游的反向影响较弱
    }

    if (target) {
      const impact = changePercent * chain.strength * chain.correlation * direction;
      results.push({
        sector: target,
        expectedImpact: Math.round(impact * 100) / 100,
        lagDays: chain.lagDays,
        confidence: Math.round(chain.strength * chain.correlation * 100),
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.expectedImpact) - Math.abs(a.expectedImpact));
}

/**
 * 获取所有板块关系
 */
export function getAllRelations(): SectorRelation[] {
  return [...INDUSTRY_CHAINS];
}
