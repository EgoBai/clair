/**
 * 行业资金流追踪引擎
 * - 行业资金净流入/流出
 * - 主力/散户资金分离
 * - 资金流强度指标
 * - 行业轮动资金信号
 * - 资金集中度分析
 */

export interface FundFlowRecord {
  timestamp: number;
  sector: string;
  mainInflow: number;      // 主力资金流入
  mainOutflow: number;     // 主力资金流出
  retailInflow: number;    // 散户资金流入
  retailOutflow: number;   // 散户资金流出
  volume: number;
  turnover: number;
}

export interface SectorFundFlow {
  sector: string;
  netMainFlow: number;
  netRetailFlow: number;
  totalNetFlow: number;
  mainFlowRatio: number;       // 主力资金净流/总成交
  flowIntensity: number;       // 资金流强度 0-1
  trend: 'inflow' | 'outflow' | 'neutral';
  consecutiveDays: number;     // 连续流入/流出天数
  rank: number;
}

export interface FlowMomentum {
  sector: string;
  shortTerm: number;    // 5日资金流
  mediumTerm: number;   // 20日资金流
  longTerm: number;     // 60日资金流
  acceleration: number; // 资金流加速
  signal: 'accumulating' | 'distributing' | 'rotating' | 'neutral';
}

export interface FlowConcentration {
  topSectorShare: number;     // TOP3行业资金占比
  concentrationIndex: number; // HHI指数
  divergence: number;         // 资金流分化度
  hotSectors: string[];
  coldSectors: string[];
}

export interface FlowRotationSignal {
  fromSector: string;
  toSector: string;
  strength: number;
  duration: number; // 天数
  confidence: number;
}

export interface SectorFlowSummary {
  timestamp: number;
  sectors: SectorFundFlow[];
  rotation: FlowRotationSignal[];
  concentration: FlowConcentration;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  totalNetFlow: number;
}

export class SectorFundFlowEngine {
  private records: Map<string, FundFlowRecord[]> = new Map();

  /**
   * 添加资金流记录
   */
  addRecord(record: FundFlowRecord): void {
    const existing = this.records.get(record.sector) || [];
    existing.push(record);
    existing.sort((a, b) => a.timestamp - b.timestamp);
    this.records.set(record.sector, existing);
  }

  /**
   * 批量添加
   */
  addRecords(records: FundFlowRecord[]): void {
    for (const record of records) {
      this.addRecord(record);
    }
  }

  /**
   * 获取行业资金流汇总
   */
  getSectorFlow(sector: string, lookback: number = 1): SectorFundFlow | null {
    const records = this.records.get(sector);
    if (!records || records.length === 0) return null;

    const recent = records.slice(-lookback);

    const netMainFlow = recent.reduce((sum, r) => sum + (r.mainInflow - r.mainOutflow), 0);
    const netRetailFlow = recent.reduce((sum, r) => sum + (r.retailInflow - r.retailOutflow), 0);
    const totalNetFlow = netMainFlow + netRetailFlow;
    const totalVolume = recent.reduce((sum, r) => sum + r.turnover, 0);

    const mainFlowRatio = totalVolume === 0 ? 0 : netMainFlow / totalVolume;
    const flowIntensity = this.calculateFlowIntensity(recent);

    let trend: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    if (totalNetFlow > 0) trend = 'inflow';
    else if (totalNetFlow < 0) trend = 'outflow';

    const consecutiveDays = this.countConsecutiveDays(sector, trend);

    return {
      sector,
      netMainFlow,
      netRetailFlow,
      totalNetFlow,
      mainFlowRatio,
      flowIntensity,
      trend,
      consecutiveDays,
      rank: 0 // will be set during summary
    };
  }

  /**
   * 资金流动量分析
   */
  getFlowMomentum(sector: string): FlowMomentum | null {
    const records = this.records.get(sector);
    if (!records || records.length < 5) return null;

    const calcNetFlow = (n: number) => {
      const recent = records.slice(-n);
      return recent.reduce((sum, r) => sum + (r.mainInflow - r.mainOutflow + r.retailInflow - r.retailOutflow), 0);
    };

    const shortTerm = calcNetFlow(Math.min(5, records.length));
    const mediumTerm = calcNetFlow(Math.min(20, records.length));
    const longTerm = calcNetFlow(Math.min(60, records.length));

    // Acceleration: change in momentum
    const recent5 = calcNetFlow(5);
    const prior5 = records.length >= 10
      ? records.slice(-10, -5).reduce((sum, r) => sum + (r.mainInflow - r.mainOutflow + r.retailInflow - r.retailOutflow), 0)
      : 0;
    const acceleration = recent5 - prior5;

    let signal: 'accumulating' | 'distributing' | 'rotating' | 'neutral' = 'neutral';
    if (shortTerm > 0 && mediumTerm > 0 && acceleration > 0) signal = 'accumulating';
    else if (shortTerm < 0 && mediumTerm < 0 && acceleration < 0) signal = 'distributing';
    else if (Math.sign(shortTerm) !== Math.sign(mediumTerm)) signal = 'rotating';

    return { sector, shortTerm, mediumTerm, longTerm, acceleration, signal };
  }

  /**
   * 资金集中度分析
   */
  getFlowConcentration(): FlowConcentration | null {
    if (this.records.size === 0) return null;

    const flows: Array<{ sector: string; flow: number }> = [];

    for (const [sector] of this.records) {
      const sf = this.getSectorFlow(sector, 1);
      if (sf) flows.push({ sector, flow: sf.totalNetFlow });
    }

    if (flows.length === 0) return null;

    flows.sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow));

    const totalAbsFlow = flows.reduce((sum, f) => sum + Math.abs(f.flow), 0);
    const topSectorShare = totalAbsFlow === 0
      ? 0
      : flows.slice(0, 3).reduce((sum, f) => sum + Math.abs(f.flow), 0) / totalAbsFlow;

    // HHI concentration index
    const hhi = totalAbsFlow === 0
      ? 0
      : flows.reduce((sum, f) => sum + (Math.abs(f.flow) / totalAbsFlow) ** 2, 0);

    // Divergence
    const netFlows = flows.map(f => f.flow);
    const meanFlow = netFlows.reduce((a, b) => a + b, 0) / netFlows.length;
    const variance = netFlows.reduce((sum, f) => sum + (f - meanFlow) ** 2, 0) / netFlows.length;
    const divergence = Math.sqrt(variance);

    const hotSectors = flows.filter(f => f.flow > 0).slice(0, 3).map(f => f.sector);
    const coldSectors = flows.filter(f => f.flow < 0).slice(0, 3).map(f => f.sector);

    return {
      topSectorShare,
      concentrationIndex: hhi,
      divergence,
      hotSectors,
      coldSectors
    };
  }

  /**
   * 行业轮动信号检测
   */
  detectRotationSignals(lookback: number = 10): FlowRotationSignal[] {
    const signals: FlowRotationSignal[] = [];
    const sectors = Array.from(this.records.keys());

    for (let i = 0; i < sectors.length; i++) {
      for (let j = i + 1; j < sectors.length; j++) {
        const flowI = this.getFlowMomentum(sectors[i]);
        const flowJ = this.getFlowMomentum(sectors[j]);

        if (!flowI || !flowJ) continue;

        // Detect rotation: one sector losing momentum while another gains
        if (flowI.signal === 'distributing' && flowJ.signal === 'accumulating') {
          signals.push({
            fromSector: sectors[i],
            toSector: sectors[j],
            strength: Math.abs(flowJ.acceleration - flowI.acceleration),
            duration: lookback,
            confidence: Math.min(1, (Math.abs(flowI.shortTerm) + Math.abs(flowJ.shortTerm)) / 1e9)
          });
        } else if (flowJ.signal === 'distributing' && flowI.signal === 'accumulating') {
          signals.push({
            fromSector: sectors[j],
            toSector: sectors[i],
            strength: Math.abs(flowI.acceleration - flowJ.acceleration),
            duration: lookback,
            confidence: Math.min(1, (Math.abs(flowI.shortTerm) + Math.abs(flowJ.shortTerm)) / 1e9)
          });
        }
      }
    }

    return signals.sort((a, b) => b.strength - a.strength);
  }

  /**
   * 全市场资金流汇总
   */
  getMarketSummary(lookback: number = 1): SectorFlowSummary | null {
    const sectors: SectorFundFlow[] = [];

    for (const [sector] of this.records) {
      const sf = this.getSectorFlow(sector, lookback);
      if (sf) sectors.push(sf);
    }

    if (sectors.length === 0) return null;

    // Rank by net flow
    sectors.sort((a, b) => b.totalNetFlow - a.totalNetFlow);
    sectors.forEach((s, i) => s.rank = i + 1);

    const rotation = this.detectRotationSignals(lookback);
    const concentration = this.getFlowConcentration() || {
      topSectorShare: 0, concentrationIndex: 0, divergence: 0, hotSectors: [], coldSectors: []
    };

    const totalNetFlow = sectors.reduce((sum, s) => sum + s.totalNetFlow, 0);
    const inflowCount = sectors.filter(s => s.trend === 'inflow').length;
    const outflowCount = sectors.filter(s => s.trend === 'outflow').length;

    let marketSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (inflowCount > outflowCount * 1.5 && totalNetFlow > 0) marketSentiment = 'bullish';
    else if (outflowCount > inflowCount * 1.5 && totalNetFlow < 0) marketSentiment = 'bearish';

    const timestamp = Date.now();

    return {
      timestamp,
      sectors,
      rotation,
      concentration,
      marketSentiment,
      totalNetFlow
    };
  }

  /**
   * 资金流异常检测
   */
  detectAnomalies(sector: string, zThreshold: number = 2): Array<{
    timestamp: number;
    type: 'surge' | 'drain';
    netFlow: number;
    zScore: number;
  }> {
    const records = this.records.get(sector);
    if (!records || records.length < 10) return [];

    const netFlows = records.map(r => r.mainInflow - r.mainOutflow + r.retailInflow - r.retailOutflow);
    const mean = netFlows.reduce((a, b) => a + b, 0) / netFlows.length;
    const std = Math.sqrt(netFlows.reduce((sum, f) => sum + (f - mean) ** 2, 0) / netFlows.length);

    if (std === 0) return [];

    const anomalies: Array<{ timestamp: number; type: 'surge' | 'drain'; netFlow: number; zScore: number }> = [];

    for (let i = 0; i < records.length; i++) {
      const zScore = (netFlows[i] - mean) / std;
      if (Math.abs(zScore) >= zThreshold) {
        anomalies.push({
          timestamp: records[i].timestamp,
          type: zScore > 0 ? 'surge' : 'drain',
          netFlow: netFlows[i],
          zScore
        });
      }
    }

    return anomalies;
  }

  // --- Private Helpers ---

  private calculateFlowIntensity(records: FundFlowRecord[]): number {
    if (records.length === 0) return 0;

    const totalMainFlow = records.reduce((sum, r) => sum + Math.abs(r.mainInflow - r.mainOutflow), 0);
    const totalVolume = records.reduce((sum, r) => sum + r.turnover, 0);

    if (totalVolume === 0) return 0;

    const ratio = totalMainFlow / totalVolume;
    return Math.min(1, ratio * 2); // Normalize to 0-1
  }

  private countConsecutiveDays(sector: string, trend: 'inflow' | 'outflow' | 'neutral'): number {
    const records = this.records.get(sector);
    if (!records || records.length === 0) return 0;

    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      const netFlow = records[i].mainInflow - records[i].mainOutflow + records[i].retailInflow - records[i].retailOutflow;
      const dayTrend = netFlow > 0 ? 'inflow' : netFlow < 0 ? 'outflow' : 'neutral';

      if (dayTrend === trend || trend === 'neutral') {
        count++;
      } else {
        break;
      }
    }

    return count;
  }
}

export default new SectorFundFlowEngine();
