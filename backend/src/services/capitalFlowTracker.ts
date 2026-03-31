/**
 * 资金流向追踪引擎
 * 追踪主力资金、北向资金、融资融券等资金流向
 */

export type FlowType = 'main' | 'northbound' | 'margin' | 'institutional' | 'retail';
export type FlowDirection = 'inflow' | 'outflow' | 'neutral';

export interface CapitalFlow {
  stockCode: string;
  stockName: string;
  timestamp: string;
  flowType: FlowType;
  amount: number; // 万元
  direction: FlowDirection;
  percentage: number; // 占比
}

export interface FlowSummary {
  stockCode: string;
  period: string;
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  mainInflow: number;
  mainOutflow: number;
  mainNetFlow: number;
  northboundNet: number;
  flowTrend: 'accumulating' | 'distributing' | 'neutral';
  strength: number; // 0-100
}

export interface SectorFlow {
  sectorName: string;
  sectorCode: string;
  netFlow: number;
  stockCount: number;
  avgNetFlow: number;
  topInflow: { code: string; name: string; amount: number }[];
  topOutflow: { code: string; name: string; amount: number }[];
}

export class CapitalFlowEngine {
  private flows: Map<string, CapitalFlow[]> = new Map();
  private sectorFlows: Map<string, SectorFlow> = new Map();

  addFlow(flow: CapitalFlow): void {
    const flows = this.flows.get(flow.stockCode) || [];
    flows.push(flow);
    this.flows.set(flow.stockCode, flows);
  }

  addFlows(flows: CapitalFlow[]): void {
    for (const flow of flows) {
      this.addFlow(flow);
    }
  }

  getStockFlows(stockCode: string, flowType?: FlowType): CapitalFlow[] {
    const flows = this.flows.get(stockCode) || [];
    return flowType ? flows.filter(f => f.flowType === flowType) : flows;
  }

  calculateSummary(stockCode: string, period: string): FlowSummary {
    const flows = this.getStockFlows(stockCode);
    const periodFlows = flows.filter(f => {
      const ts = new Date(f.timestamp).getTime();
      const now = Date.now();
      const periodMs = this.parsePeriod(period);
      return now - ts <= periodMs;
    });

    const totalInflow = periodFlows
      .filter(f => f.direction === 'inflow')
      .reduce((sum, f) => sum + f.amount, 0);
    
    const totalOutflow = periodFlows
      .filter(f => f.direction === 'outflow')
      .reduce((sum, f) => sum + f.amount, 0);

    const mainFlows = periodFlows.filter(f => f.flowType === 'main');
    const mainInflow = mainFlows
      .filter(f => f.direction === 'inflow')
      .reduce((sum, f) => sum + f.amount, 0);
    const mainOutflow = mainFlows
      .filter(f => f.direction === 'outflow')
      .reduce((sum, f) => sum + f.amount, 0);

    const northboundFlows = periodFlows.filter(f => f.flowType === 'northbound');
    const northboundIn = northboundFlows
      .filter(f => f.direction === 'inflow')
      .reduce((sum, f) => sum + f.amount, 0);
    const northboundOut = northboundFlows
      .filter(f => f.direction === 'outflow')
      .reduce((sum, f) => sum + f.amount, 0);

    const netFlow = totalInflow - totalOutflow;
    const mainNetFlow = mainInflow - mainOutflow;
    const northboundNet = northboundIn - northboundOut;

    let flowTrend: 'accumulating' | 'distributing' | 'neutral' = 'neutral';
    if (mainNetFlow > 0 && netFlow > 0) flowTrend = 'accumulating';
    else if (mainNetFlow < 0 && netFlow < 0) flowTrend = 'distributing';

    const maxFlow = Math.max(Math.abs(totalInflow), Math.abs(totalOutflow), 1);
    const strength = Math.min(100, Math.round((Math.abs(netFlow) / maxFlow) * 100));

    return {
      stockCode,
      period,
      totalInflow,
      totalOutflow,
      netFlow,
      mainInflow,
      mainOutflow,
      mainNetFlow,
      northboundNet,
      flowTrend,
      strength
    };
  }

  updateSectorFlow(sectorCode: string, sectorName: string, stockFlows: FlowSummary[]): void {
    const netFlow = stockFlows.reduce((sum, f) => sum + f.netFlow, 0);
    const sorted = [...stockFlows].sort((a, b) => b.netFlow - a.netFlow);
    
    this.sectorFlows.set(sectorCode, {
      sectorName,
      sectorCode,
      netFlow,
      stockCount: stockFlows.length,
      avgNetFlow: stockFlows.length > 0 ? netFlow / stockFlows.length : 0,
      topInflow: sorted.slice(0, 5).map(f => ({
        code: f.stockCode,
        name: f.stockCode,
        amount: f.netFlow
      })),
      topOutflow: sorted.slice(-5).reverse().map(f => ({
        code: f.stockCode,
        name: f.stockCode,
        amount: f.netFlow
      }))
    });
  }

  getSectorFlow(sectorCode: string): SectorFlow | undefined {
    return this.sectorFlows.get(sectorCode);
  }

  getAllSectorFlows(): SectorFlow[] {
    return Array.from(this.sectorFlows.values())
      .sort((a, b) => b.netFlow - a.netFlow);
  }

  detectAnomaly(stockCode: string, threshold: number = 3): boolean {
    const flows = this.getStockFlows(stockCode);
    if (flows.length < 10) return false;

    const amounts = flows.map(f => f.amount);
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    
    const latest = amounts[amounts.length - 1];
    return Math.abs(latest - mean) > threshold * stdDev;
  }

  private parsePeriod(period: string): number {
    const match = period.match(/^(\d+)([hdwm])$/);
    if (!match) return 24 * 60 * 60 * 1000;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      case 'm': return value * 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }
}

export default new CapitalFlowEngine();
