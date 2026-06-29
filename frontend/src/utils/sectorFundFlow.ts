/**
 * 行业资金流向追踪引擎
 * 追踪行业级别的资金流入流出、主力动向
 */

export interface SectorFundFlow {
  sector: string;
  netInflow: number;
  mainInflow: number;
  retailInflow: number;
  volume: number;
  changePercent: number;
  turnoverRate: number;
}

export interface FundFlowSummary {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  topInflowSectors: SectorFundFlow[];
  topOutflowSectors: SectorFundFlow[];
  mainNetInflow: number;
  retailNetInflow: number;
}

export interface FlowTrend {
  sector: string;
  consecutiveInflowDays: number;
  consecutiveOutflowDays: number;
  avgDailyFlow: number;
  flowAcceleration: number;
  trend: 'inflow' | 'outflow' | 'neutral';
}

export interface FlowRotationSignal {
  fromSector: string;
  toSector: string;
  strength: number;
  confidence: number;
  description: string;
}

export interface CrossSectorAnalysis {
  sector1: string;
  sector2: string;
  flowCorrelation: number;
  leadLag: number; // positive = sector1 leads
  spread: number;
}

export function summarizeFundFlows(flows: SectorFundFlow[]): FundFlowSummary {
  if (flows.length === 0) {
    return {
      totalInflow: 0, totalOutflow: 0, netFlow: 0,
      topInflowSectors: [], topOutflowSectors: [],
      mainNetInflow: 0, retailNetInflow: 0,
    };
  }
  
  const totalInflow = flows.filter(f => f.netInflow > 0).reduce((s, f) => s + f.netInflow, 0);
  const totalOutflow = Math.abs(flows.filter(f => f.netInflow < 0).reduce((s, f) => s + f.netInflow, 0));
  const netFlow = flows.reduce((s, f) => s + f.netInflow, 0);
  const mainNetInflow = flows.reduce((s, f) => s + f.mainInflow, 0);
  const retailNetInflow = flows.reduce((s, f) => s + f.retailInflow, 0);
  
  const sorted = [...flows].sort((a, b) => b.netInflow - a.netInflow);
  
  return {
    totalInflow,
    totalOutflow,
    netFlow,
    topInflowSectors: sorted.slice(0, 5),
    topOutflowSectors: sorted.slice(-5).reverse(),
    mainNetInflow,
    retailNetInflow,
  };
}

export function analyzeFlowTrend(
  sector: string,
  historicalFlows: { date: string; netInflow: number }[]
): FlowTrend {
  if (historicalFlows.length === 0) {
    return { sector, consecutiveInflowDays: 0, consecutiveOutflowDays: 0, avgDailyFlow: 0, flowAcceleration: 0, trend: 'neutral' };
  }
  
  let consecutiveInflowDays = 0;
  let consecutiveOutflowDays = 0;
  
  // Count from the end
  for (let i = historicalFlows.length - 1; i >= 0; i--) {
    if (historicalFlows[i].netInflow > 0) {
      consecutiveInflowDays++;
      if (consecutiveOutflowDays > 0) break;
    } else if (historicalFlows[i].netInflow < 0) {
      consecutiveOutflowDays++;
      if (consecutiveInflowDays > 0) break;
    }
  }
  
  const avgDailyFlow = historicalFlows.reduce((s, f) => s + f.netInflow, 0) / historicalFlows.length;
  
  // Calculate acceleration (change in flow rate)
  let flowAcceleration = 0;
  if (historicalFlows.length >= 3) {
    const recent = historicalFlows.slice(-3);
    const change1 = recent[2].netInflow - recent[1].netInflow;
    const change0 = recent[1].netInflow - recent[0].netInflow;
    flowAcceleration = change1 - change0;
  }
  
  const trend: FlowTrend['trend'] = consecutiveInflowDays >= 3 ? 'inflow' 
    : consecutiveOutflowDays >= 3 ? 'outflow' : 'neutral';
  
  return { sector, consecutiveInflowDays, consecutiveOutflowDays, avgDailyFlow, flowAcceleration, trend };
}

export function detectFlowRotation(
  currentFlows: SectorFundFlow[],
  previousFlows: SectorFundFlow[]
): FlowRotationSignal[] {
  const signals: FlowRotationSignal[] = [];
  
  const flowChanges = currentFlows.map(cf => {
    const prev = previousFlows.find(pf => pf.sector === cf.sector);
    return {
      sector: cf.sector,
      change: cf.netInflow - (prev?.netInflow || 0),
      currentFlow: cf.netInflow,
    };
  });
  
  const increasing = flowChanges.filter(f => f.change > 0).sort((a, b) => b.change - a.change);
  const decreasing = flowChanges.filter(f => f.change < 0).sort((a, b) => a.change - b.change);
  
  // Find rotations (money flowing from one sector to another)
  for (const outflow of decreasing.slice(0, 3)) {
    for (const inflow of increasing.slice(0, 3)) {
      if (Math.abs(outflow.change) > 0 && inflow.change > 0) {
        const strength = Math.min(Math.abs(outflow.change), inflow.change);
        const confidence = Math.min(1, strength / (Math.abs(outflow.change) + inflow.change) * 2);
        
        if (strength > 1000) {
          signals.push({
            fromSector: outflow.sector,
            toSector: inflow.sector,
            strength,
            confidence,
            description: `资金从${outflow.sector}流出，流入${inflow.sector}`,
          });
        }
      }
    }
  }
  
  return signals.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

export function calculateSectorFlowMomentum(
  flows: SectorFundFlow[],
  _lookback: number = 5
): { sector: string; momentum: number; rank: number }[] {
  const momentum = flows.map(f => ({
    sector: f.sector,
    momentum: f.netInflow * (1 + f.changePercent / 100),
    rank: 0,
  }));
  
  momentum.sort((a, b) => b.momentum - a.momentum);
  momentum.forEach((m, i) => m.rank = i + 1);
  
  return momentum;
}

export function findSectorDivergence(
  flows: SectorFundFlow[]
): { sector: string; type: 'price_up_flow_down' | 'price_down_flow_up'; magnitude: number }[] {
  const divergences: { sector: string; type: 'price_up_flow_down' | 'price_down_flow_up'; magnitude: number }[] = [];
  
  for (const flow of flows) {
    if (flow.changePercent > 2 && flow.netInflow < 0) {
      divergences.push({
        sector: flow.sector,
        type: 'price_up_flow_down',
        magnitude: Math.abs(flow.changePercent) + Math.abs(flow.netInflow) / 1e8,
      });
    }
    if (flow.changePercent < -2 && flow.netInflow > 0) {
      divergences.push({
        sector: flow.sector,
        type: 'price_down_flow_up',
        magnitude: Math.abs(flow.changePercent) + Math.abs(flow.netInflow) / 1e8,
      });
    }
  }
  
  return divergences.sort((a, b) => b.magnitude - a.magnitude);
}

export function calculateMainRetailRatio(flows: SectorFundFlow[]): {
  sector: string;
  mainRatio: number;
  retailRatio: number;
  signal: 'main_dominant' | 'retail_dominant' | 'balanced';
}[] {
  return flows.map(f => {
    const total = Math.abs(f.mainInflow) + Math.abs(f.retailInflow);
    const mainRatio = total > 0 ? Math.abs(f.mainInflow) / total : 0.5;
    const retailRatio = 1 - mainRatio;
    
    return {
      sector: f.sector,
      mainRatio,
      retailRatio,
      signal: mainRatio > 0.7 ? 'main_dominant' : mainRatio < 0.3 ? 'retail_dominant' : 'balanced',
    };
  });
}

export function generateSectorFlowReport(flows: SectorFundFlow[]): {
  summary: FundFlowSummary;
  hotSectors: string[];
  coldSectors: string[];
  mainDrivenSectors: string[];
  balanceScore: number;
} {
  const summary = summarizeFundFlows(flows);
  const mainRetail = calculateMainRetailRatio(flows);
  
  const hotSectors = flows
    .filter(f => f.netInflow > 0 && f.changePercent > 0)
    .sort((a, b) => b.netInflow - a.netInflow)
    .map(f => f.sector);
  
  const coldSectors = flows
    .filter(f => f.netInflow < 0 && f.changePercent < 0)
    .sort((a, b) => a.netInflow - b.netInflow)
    .map(f => f.sector);
  
  const mainDrivenSectors = mainRetail
    .filter(m => m.signal === 'main_dominant' && flows.find(f => f.sector === m.sector)!.netInflow > 0)
    .map(m => m.sector);
  
  // Balance score: how evenly distributed is the flow
  const inflows = flows.map(f => f.netInflow);
  const mean = inflows.reduce((s, v) => s + v, 0) / inflows.length;
  const variance = inflows.reduce((s, v) => s + (v - mean) ** 2, 0) / inflows.length;
  const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 1;
  const balanceScore = Math.max(0, Math.min(100, 100 - cv * 20));
  
  return { summary, hotSectors, coldSectors, mainDrivenSectors, balanceScore };
}
