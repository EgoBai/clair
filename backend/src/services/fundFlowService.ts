/**
 * 资金流向服务
 * 处理资金流向相关的业务逻辑
 */

import {
  FundFlow,
  SectorFundFlow,
  MarketFundFlow,
  FlowSummary,
  FlowRanking,
  FlowAlert,
  FLOW_THRESHOLDS,
  validateFlowTimeframe,
  classifyFlowDirection,
  calculateFlowIntensity,
  formatFlowAmount,
} from '../models/FundFlow';

export class FundFlowService {
  private stockFlows: Map<string, FundFlow[]> = new Map();
  private sectorFlows: Map<number, SectorFundFlow> = new Map();
  private marketFlows: MarketFundFlow[] = [];
  private alerts: FlowAlert[] = [];

  // 添加股票资金流向
  addStockFlow(flow: Omit<FundFlow, 'id' | 'createdAt'>): FundFlow {
    const newFlow: FundFlow = {
      ...flow,
      id: Date.now(),
      createdAt: new Date(),
    };

    const existing = this.stockFlows.get(flow.stockSymbol) || [];
    existing.push(newFlow);
    this.stockFlows.set(flow.stockSymbol, existing);

    // 检查是否触发告警
    this.checkAlerts(newFlow);

    return newFlow;
  }

  // 获取股票最新资金流向
  getLatestStockFlow(symbol: string): FundFlow | undefined {
    const flows = this.stockFlows.get(symbol);
    if (!flows || flows.length === 0) return undefined;
    return flows[flows.length - 1];
  }

  // 获取股票资金流向历史
  getStockFlowHistory(symbol: string, limit: number = 30): FundFlow[] {
    const flows = this.stockFlows.get(symbol) || [];
    return flows.slice(-limit);
  }

  // 计算资金流向汇总
  calculateFlowSummary(symbol: string, name: string): FlowSummary | null {
    const flows = this.stockFlows.get(symbol);
    if (!flows || flows.length === 0) return null;

    const latest = flows[flows.length - 1];
    const totalTurnover = latest.mainInflow + latest.mainOutflow + 
                         latest.retailInflow + latest.retailOutflow;
    
    const mainNetFlowPercent = totalTurnover > 0 
      ? (latest.mainNetFlow / totalTurnover) * 100 
      : 0;

    // 计算连续流入/流出天数
    let consecutiveDays = 0;
    const trend = classifyFlowDirection(latest.mainNetFlow);
    
    for (let i = flows.length - 1; i >= 0; i--) {
      const dayTrend = classifyFlowDirection(flows[i].mainNetFlow);
      if (dayTrend === trend) {
        consecutiveDays++;
      } else {
        break;
      }
    }

    return {
      symbol,
      name,
      mainNetFlow: latest.mainNetFlow,
      mainNetFlowPercent,
      changePercent: 0, // 需要从其他服务获取
      trend,
      consecutiveDays,
    };
  }

  // 获取资金流向排行
  getFlowRanking(limit: number = 20): FlowRanking {
    const summaries: FlowSummary[] = [];

    this.stockFlows.forEach((flows, symbol) => {
      if (flows.length === 0) return;
      const latest = flows[flows.length - 1];
      const summary = this.calculateFlowSummary(symbol, '');
      if (summary) summaries.push(summary);
    });

    const topInflow = summaries
      .filter(s => s.trend === 'inflow')
      .sort((a, b) => b.mainNetFlow - a.mainNetFlow)
      .slice(0, limit);

    const topOutflow = summaries
      .filter(s => s.trend === 'outflow')
      .sort((a, b) => a.mainNetFlow - b.mainNetFlow)
      .slice(0, limit);

    return {
      date: new Date(),
      topInflow,
      topOutflow,
      bySector: [],
    };
  }

  // 添加市场资金流向
  addMarketFlow(flow: Omit<MarketFundFlow, 'id' | 'createdAt'>): MarketFundFlow {
    const newFlow: MarketFundFlow = {
      ...flow,
      id: Date.now(),
      createdAt: new Date(),
    };
    this.marketFlows.push(newFlow);
    return newFlow;
  }

  // 获取最新市场资金流向
  getLatestMarketFlow(): MarketFundFlow | undefined {
    if (this.marketFlows.length === 0) return undefined;
    return this.marketFlows[this.marketFlows.length - 1];
  }

  // 获取北向资金历史
  getNorthBoundFlowHistory(limit: number = 30): MarketFundFlow[] {
    return this.marketFlows.slice(-limit);
  }

  // 添加板块资金流向
  addSectorFlow(flow: Omit<SectorFundFlow, 'id' | 'createdAt'>): SectorFundFlow {
    const newFlow: SectorFundFlow = {
      ...flow,
      id: Date.now(),
      createdAt: new Date(),
    };
    this.sectorFlows.set(flow.sectorId, newFlow);
    return newFlow;
  }

  // 获取板块资金流向排行
  getSectorFlowRanking(limit: number = 10): SectorFundFlow[] {
    return Array.from(this.sectorFlows.values())
      .sort((a, b) => b.mainNetFlow - a.mainNetFlow)
      .slice(0, limit);
  }

  // 添加资金告警规则
  addAlert(alert: Omit<FlowAlert, 'id' | 'triggeredAt' | 'isRead'>): FlowAlert {
    const newAlert: FlowAlert = {
      ...alert,
      id: Date.now(),
      triggeredAt: new Date(),
      isRead: false,
    };
    this.alerts.push(newAlert);
    return newAlert;
  }

  // 获取未读告警
  getUnreadAlerts(): FlowAlert[] {
    return this.alerts.filter(a => !a.isRead);
  }

  // 标记告警已读
  markAlertRead(alertId: number): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) alert.isRead = true;
  }

  // 检查资金异动
  detectAbnormalFlows(): {
    massiveInflow: string[];
    massiveOutflow: string[];
    consecutiveInflow: string[];
    consecutiveOutflow: string[];
  } {
    const result = {
      massiveInflow: [] as string[],
      massiveOutflow: [] as string[],
      consecutiveInflow: [] as string[],
      consecutiveOutflow: [] as string[],
    };

    this.stockFlows.forEach((flows, symbol) => {
      if (flows.length === 0) return;
      const latest = flows[flows.length - 1];

      // 大幅流入/流出
      if (latest.mainNetFlow > FLOW_THRESHOLDS.superLarge) {
        result.massiveInflow.push(symbol);
      } else if (latest.mainNetFlow < -FLOW_THRESHOLDS.superLarge) {
        result.massiveOutflow.push(symbol);
      }

      // 连续流入/流出
      const summary = this.calculateFlowSummary(symbol, '');
      if (summary && summary.consecutiveDays >= 5) {
        if (summary.trend === 'inflow') {
          result.consecutiveInflow.push(symbol);
        } else if (summary.trend === 'outflow') {
          result.consecutiveOutflow.push(symbol);
        }
      }
    });

    return result;
  }

  // 计算资金强度指标
  calculateFlowStrength(symbol: string): {
    strength: 'strong_inflow' | 'moderate_inflow' | 'neutral' | 'moderate_outflow' | 'strong_outflow';
    score: number;
  } | null {
    const flows = this.stockFlows.get(symbol);
    if (!flows || flows.length === 0) return null;

    const latest = flows[flows.length - 1];
    const totalFlow = latest.mainInflow + latest.mainOutflow;
    if (totalFlow === 0) return { strength: 'neutral', score: 0 };

    const netRatio = latest.mainNetFlow / totalFlow;
    const score = netRatio * 100;

    let strength: 'strong_inflow' | 'moderate_inflow' | 'neutral' | 'moderate_outflow' | 'strong_outflow';
    if (score > 20) strength = 'strong_inflow';
    else if (score > 5) strength = 'moderate_inflow';
    else if (score > -5) strength = 'neutral';
    else if (score > -20) strength = 'moderate_outflow';
    else strength = 'strong_outflow';

    return { strength, score };
  }

  // 内部方法：检查告警
  private checkAlerts(flow: FundFlow): void {
    this.alerts.forEach(alert => {
      if (!alert.isActive || alert.stockSymbol !== flow.stockSymbol) return;

      let triggered = false;
      switch (alert.alertType) {
        case 'main_inflow_surge':
          triggered = flow.mainNetFlow >= alert.threshold;
          break;
        case 'main_outflow_surge':
          triggered = flow.mainNetFlow <= -alert.threshold;
          break;
        case 'consecutive_inflow': {
          // 检查连续流入天数
          const flows = this.stockFlows.get(flow.stockSymbol) || [];
          let consecutiveDays = 0;
          for (let i = flows.length - 1; i >= 0; i--) {
            if (flows[i].mainNetFlow > 0) consecutiveDays++;
            else break;
          }
          triggered = consecutiveDays >= alert.threshold;
          break;
        }
      }

      if (triggered) {
        alert.triggeredAt = new Date();
        alert.isRead = false;
        alert.currentValue = flow.mainNetFlow;
      }
    });
  }
}

export default new FundFlowService();
