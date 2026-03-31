/**
 * 板块轮动引擎
 * 监测A股板块资金轮动规律，识别热点切换
 * - 板块相对强度排序
 * - 资金流入/流出跟踪
 * - 轮动周期检测
 * - 热度衰减预警
 */

export interface SectorData {
  name: string;
  code: string;
  change: number;       // 当日涨跌幅
  volume: number;       // 成交量
  turnover: number;     // 成交额
  advancers: number;    // 上涨家数
  decliners: number;    // 下跌家数
  netInflow: number;    // 净流入（万元）
  avgPE: number;        // 平均PE
  timestamp: number;
}

export interface RotationSignal {
  type: 'rotate_in' | 'rotate_out' | 'maintain' | 'watch';
  sector: string;
  score: number;        // 0-100 轮动信号强度
  momentum: number;     // 动量 (-100 ~ 100)
  duration: number;     // 持续天数
  confidence: number;
  reason: string;
}

export interface SectorHeatmap {
  sector: string;
  heat: number;         // 热度 0-100
  trend: 'rising' | 'falling' | 'stable';
  rank: number;
  prevRank: number;
}

export class SectorRotationEngine {
  private history: Map<string, SectorData[]> = new Map();
  private readonly maxHistoryDays = 30;

  /**
   * 更新板块数据
   */
  updateData(sector: SectorData): void {
    const history = this.history.get(sector.code) || [];
    history.push(sector);
    if (history.length > this.maxHistoryDays) {
      history.shift();
    }
    this.history.set(sector.code, history);
  }

  /**
   * 批量更新板块数据
   */
  batchUpdate(sectors: SectorData[]): void {
    for (const sector of sectors) {
      this.updateData(sector);
    }
  }

  /**
   * 计算板块相对强度（RSI方法）
   */
  calculateRelativeStrength(code: string, lookback: number = 5): number {
    const history = this.history.get(code);
    if (!history || history.length < lookback) return 50;

    const recent = history.slice(-lookback);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < recent.length; i++) {
      const change = recent[i].change;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    if (gains + losses === 0) return 50;
    const rs = gains / (losses || 1);
    return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
  }

  /**
   * 计算板块动量
   */
  calculateMomentum(code: string, periods: number = 5): number {
    const history = this.history.get(code);
    if (!history || history.length < periods) return 0;

    const recent = history.slice(-periods);
    const avgChange = recent.reduce((s, d) => s + d.change, 0) / periods;
    const avgInflow = recent.reduce((s, d) => s + d.netInflow, 0) / periods;

    // 综合动量分数
    const changeScore = Math.min(100, Math.max(-100, avgChange * 20));
    const inflowScore = avgInflow > 0 ? Math.min(50, avgInflow / 10000) : Math.max(-50, avgInflow / 10000);

    return Math.round((changeScore + inflowScore) * 10) / 10;
  }

  /**
   * 检测轮动信号
   */
  detectRotation(code: string): RotationSignal {
    const history = this.history.get(code);
    if (!history || history.length < 3) {
      return {
        type: 'watch',
        sector: code,
        score: 0,
        momentum: 0,
        duration: 0,
        confidence: 0,
        reason: '数据不足，持续观察',
      };
    }

    const rs = this.calculateRelativeStrength(code);
    const momentum = this.calculateMomentum(code);
    const recent = history.slice(-5);
    const netInflow = recent.reduce((s, d) => s + d.netInflow, 0);

    // 计算连续涨跌天数
    let duration = 0;
    const lastChange = history[history.length - 1].change;
    for (let i = history.length - 1; i >= 0; i--) {
      if ((lastChange > 0 && history[i].change > 0) ||
          (lastChange < 0 && history[i].change < 0)) {
        duration++;
      } else break;
    }

    let type: RotationSignal['type'];
    let score: number;
    let reason: string;

    if (rs > 70 && momentum > 30 && netInflow > 0) {
      type = 'rotate_in';
      score = Math.min(100, (rs + momentum + Math.min(50, netInflow / 10000)) / 2);
      reason = '资金持续流入，板块轮动进入信号';
    } else if (rs < 30 && momentum < -20 && netInflow < 0) {
      type = 'rotate_out';
      score = Math.min(100, (100 - rs + Math.abs(momentum)) / 2);
      reason = '资金流出加速，热度衰减，建议回避';
    } else if (rs >= 40 && rs <= 60) {
      type = 'watch';
      score = 50;
      reason = '板块处于震荡期，等待明确方向';
    } else {
      type = 'maintain';
      score = rs;
      reason = '板块趋势维持中';
    }

    const confidence = history.length >= 10 ? 0.85 : history.length / 10 * 0.85;

    return {
      type,
      sector: code,
      score: Math.round(score),
      momentum,
      duration,
      confidence: Math.round(confidence * 100) / 100,
      reason,
    };
  }

  /**
   * 生成板块热度图
   */
  generateHeatmap(): SectorHeatmap[] {
    const results: SectorHeatmap[] = [];

    for (const [code, history] of this.history) {
      if (history.length < 2) continue;

      const latest = history[history.length - 1];
      const prev = history[history.length - 2];

      // 计算热度
      const volumeHeat = Math.min(50, latest.turnover / 100000);
      const inflowHeat = Math.min(30, Math.max(-30, latest.netInflow / 10000));
      const changeHeat = Math.min(20, Math.abs(latest.change) * 5);
      const breadthRatio = latest.advancers / (latest.advancers + latest.decliners || 1);
      const breadthHeat = breadthRatio * 20;

      const heat = Math.max(0, Math.min(100, 50 + volumeHeat + inflowHeat + changeHeat + breadthHeat - 50));

      // 判断趋势
      let trend: 'rising' | 'falling' | 'stable';
      if (latest.change > prev.change && latest.netInflow > 0) trend = 'rising';
      else if (latest.change < prev.change && latest.netInflow < 0) trend = 'falling';
      else trend = 'stable';

      results.push({
        sector: latest.name,
        heat: Math.round(heat),
        trend,
        rank: 0,
        prevRank: 0,
      });
    }

    // 排序并赋排名
    results.sort((a, b) => b.heat - a.heat);
    results.forEach((r, i) => r.rank = i + 1);

    return results;
  }

  /**
   * 获取轮动建议
   */
  getRotationAdvice(codes: string[]): {
    buy: string[];
    hold: string[];
    sell: string[];
    watch: string[];
  } {
    const buy: string[] = [];
    const hold: string[] = [];
    const sell: string[] = [];
    const watch: string[] = [];

    for (const code of codes) {
      const signal = this.detectRotation(code);
      switch (signal.type) {
        case 'rotate_in': buy.push(code); break;
        case 'maintain': hold.push(code); break;
        case 'rotate_out': sell.push(code); break;
        case 'watch': watch.push(code); break;
      }
    }

    return { buy, hold, sell, watch };
  }

  /**
   * 清除历史数据
   */
  clearHistory(): void {
    this.history.clear();
  }
}

export const sectorRotationEngine = new SectorRotationEngine();
export default SectorRotationEngine;
