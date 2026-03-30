/**
 * AI 智能市场解读生成器
 * 参考同花顺 i问财、东方财富 Level-2
 * 
 * 功能:
 * - 自然语言生成市场行情解读
 * - 智能止盈止损建议
 * - 板块轮动预测分析
 * - 个股 AI 点评
 */

import { KLineData } from '../../shared/types';

// ==================== 类型定义 ====================

export interface MarketCommentary {
  id: string;
  date: string;
  type: 'daily_summary' | 'sector_analysis' | 'stock_comment' | 'market_outlook';
  title: string;
  summary: string;
  sections: CommentarySection[];
  keywords: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  generatedAt: string;
}

export interface CommentarySection {
  heading: string;
  content: string;
  dataPoints: DataPoint[];
}

export interface DataPoint {
  label: string;
  value: number | string;
  change?: number;
  unit?: string;
}

export interface StopLossRecommendation {
  symbol: string;
  currentPrice: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  method: 'atr' | 'support_resistance' | 'moving_average' | 'percent';
  reasoning: string;
  confidence: number;
}

export interface SectorRotationPrediction {
  sector: string;
  currentPhase: 'accumulation' | 'markup' | 'distribution' | 'decline';
  predictedDirection: 'rotate_in' | 'rotate_out' | 'hold';
  strength: number; // 0-100
  timeframe: string;
  catalysts: string[];
  risks: string[];
  topPicks: { symbol: string; reason: string }[];
  analysis: string;
}

// ==================== 市场解读生成器 ====================

export class MarketCommentaryGenerator {
  /**
   * 生成每日市场行情解读
   */
  generateDailySummary(data: {
    indexChange: number;
    indexPrice: number;
    riseCount: number;
    fallCount: number;
    flatCount: number;
    limitUpCount: number;
    limitDownCount: number;
    totalTurnover: number;
    northboundFlow: number;
    hotSectors: { name: string; changePercent: number }[];
    topGainers: { symbol: string; name: string; changePercent: number }[];
    topLosers: { symbol: string; name: string; changePercent: number }[];
    avgChangePercent: number;
  }): MarketCommentary {
    const sentiment = this.analyzeSentiment(data);
    const sections: CommentarySection[] = [];

    // 1. 大势研判
    sections.push(this.generateMarketOverview(data, sentiment));

    // 2. 涨跌分布
    sections.push(this.generateBreadthAnalysis(data));

    // 3. 热点板块
    sections.push(this.generateSectorAnalysis(data));

    // 4. 资金动向
    sections.push(this.generateCapitalFlow(data));

    // 5. 后市展望
    sections.push(this.generateOutlook(data, sentiment));

    const summary = this.generateSummary(data, sentiment);

    return {
      id: `commentary-${data.indexPrice}-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      type: 'daily_summary',
      title: this.generateTitle(data, sentiment),
      summary,
      sections,
      keywords: this.extractKeywords(data),
      sentiment,
      confidence: this.calculateConfidence(data),
      generatedAt: new Date().toISOString(),
    };
  }

  private analyzeSentiment(data: {
    indexChange: number;
    riseCount: number;
    fallCount: number;
  }): 'bullish' | 'bearish' | 'neutral' {
    const total = data.riseCount + data.fallCount;
    const riseRatio = total > 0 ? data.riseCount / total : 0.5;

    if (data.indexChange > 1 && riseRatio > 0.6) return 'bullish';
    if (data.indexChange < -1 && riseRatio < 0.4) return 'bearish';
    if (data.indexChange > 0.3 && riseRatio > 0.55) return 'bullish';
    if (data.indexChange < -0.3 && riseRatio < 0.45) return 'bearish';
    return 'neutral';
  }

  private generateTitle(
    data: { indexChange: number },
    sentiment: 'bullish' | 'bearish' | 'neutral'
  ): string {
    const changeStr = data.indexChange >= 0 ? `涨${data.indexChange.toFixed(2)}%` : `跌${Math.abs(data.indexChange).toFixed(2)}%`;
    const sentimentWord = sentiment === 'bullish' ? '市场情绪回暖' :
      sentiment === 'bearish' ? '市场承压调整' : '市场震荡整理';
    return `${sentimentWord}，大盘${changeStr}`;
  }

  private generateSummary(
    data: {
      indexChange: number;
      riseCount: number;
      fallCount: number;
      limitUpCount: number;
      totalTurnover: number;
    },
    sentiment: 'bullish' | 'bearish' | 'neutral'
  ): string {
    const total = data.riseCount + data.fallCount;
    const parts: string[] = [];

    if (sentiment === 'bullish') {
      parts.push(
        `今日大盘表现强势，上涨家数${data.riseCount}家，下跌家数${data.fallCount}家，` +
        `涨停${data.limitUpCount}家，市场赚钱效应良好。`
      );
    } else if (sentiment === 'bearish') {
      parts.push(
        `今日大盘表现疲弱，下跌家数${data.fallCount}家，上涨家数${data.riseCount}家，` +
        `市场调整压力较大，建议控制仓位。`
      );
    } else {
      parts.push(
        `今日大盘窄幅震荡，涨跌家数基本持平，` +
        `市场方向不明确，建议观望为主。`
      );
    }

    if (data.totalTurnover > 0) {
      const turnoverStr = data.totalTurnover > 1e12
        ? `${(data.totalTurnover / 1e12).toFixed(2)}万亿`
        : `${(data.totalTurnover / 1e8).toFixed(0)}亿`;
      parts.push(`全天成交${turnoverStr}，`);
      parts.push(data.totalTurnover > 1e12 ? '量能充沛。' : '量能一般。');
    }

    return parts.join('');
  }

  private generateMarketOverview(
    data: { indexChange: number; indexPrice: number },
    sentiment: 'bullish' | 'bearish' | 'neutral'
  ): CommentarySection {
    const direction = data.indexChange >= 0 ? '上涨' : '下跌';
    const absChange = Math.abs(data.indexChange);
    let trendDesc = '';

    if (absChange > 2) {
      trendDesc = `大幅${direction}`;
    } else if (absChange > 1) {
      trendDesc = `${direction}`;
    } else if (absChange > 0.3) {
      trendDesc = `小幅${direction}`;
    } else {
      trendDesc = '窄幅震荡';
    }

    return {
      heading: '大势研判',
      content: `大盘今日${trendDesc}，收盘报${data.indexPrice.toFixed(2)}点，` +
        `涨跌幅${data.indexChange >= 0 ? '+' : ''}${data.indexChange.toFixed(2)}%。` +
        (sentiment === 'bullish' ? '市场多头氛围浓厚，建议适当参与。' :
          sentiment === 'bearish' ? '市场空头力量较强，建议控制风险。' :
            '多空胶着，建议等待方向明确。'),
      dataPoints: [
        { label: '大盘点位', value: data.indexPrice.toFixed(2), unit: '点' },
        { label: '涨跌幅', value: `${data.indexChange >= 0 ? '+' : ''}${data.indexChange.toFixed(2)}`, unit: '%' },
      ],
    };
  }

  private generateBreadthAnalysis(data: {
    riseCount: number;
    fallCount: number;
    flatCount: number;
    limitUpCount: number;
    limitDownCount: number;
  }): CommentarySection {
    const total = data.riseCount + data.fallCount + data.flatCount;
    const riseRatio = total > 0 ? ((data.riseCount / total) * 100).toFixed(1) : '0';
    const breadthDesc = data.riseCount > data.fallCount * 1.5
      ? '涨多跌少，赚钱效应明显'
      : data.fallCount > data.riseCount * 1.5
        ? '跌多涨少，亏钱效应扩大'
        : '涨跌互现，市场分化';

    return {
      heading: '涨跌分布',
      content: `今日两市共${total}只个股交易，其中上涨${data.riseCount}家（占比${riseRatio}%），` +
        `下跌${data.fallCount}家，平盘${data.flatCount}家。${breadthDesc}。` +
        `涨停${data.limitUpCount}家，跌停${data.limitDownCount}家。`,
      dataPoints: [
        { label: '上涨', value: data.riseCount, change: 1 },
        { label: '下跌', value: data.fallCount, change: -1 },
        { label: '涨停', value: data.limitUpCount, change: 1 },
        { label: '跌停', value: data.limitDownCount, change: -1 },
      ],
    };
  }

  private generateSectorAnalysis(data: {
    hotSectors: { name: string; changePercent: number }[];
  }): CommentarySection {
    const top3 = data.hotSectors.slice(0, 3);
    const sectorDesc = top3.length > 0
      ? `领涨板块为${top3.map(s => `${s.name}（${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%）`).join('、')}。`
      : '无明显热点板块。';

    return {
      heading: '板块热点',
      content: sectorDesc + (data.hotSectors.length > 3
        ? `其余活跃板块包括${data.hotSectors.slice(3, 6).map(s => s.name).join('、')}等。`
        : ''),
      dataPoints: data.hotSectors.slice(0, 5).map(s => ({
        label: s.name,
        value: `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}`,
        change: s.changePercent,
        unit: '%',
      })),
    };
  }

  private generateCapitalFlow(data: {
    northboundFlow: number;
    totalTurnover: number;
  }): CommentarySection {
    const nbDirection = data.northboundFlow >= 0 ? '净流入' : '净流出';
    const nbAmount = Math.abs(data.northboundFlow);
    const nbStr = nbAmount > 1e10 ? `${(nbAmount / 1e10).toFixed(1)}亿` : `${(nbAmount / 1e8).toFixed(0)}万`;

    return {
      heading: '资金动向',
      content: `北向资金今日${nbDirection}${nbStr}，` +
        (data.northboundFlow > 0
          ? '外资持续买入，对A股信心增强。'
          : data.northboundFlow < -5e9
            ? '外资大幅流出，需关注后续变化。'
            : '外资小幅调整，整体态度偏中性。'),
      dataPoints: [
        {
          label: '北向资金',
          value: `${data.northboundFlow >= 0 ? '+' : ''}${(data.northboundFlow / 1e8).toFixed(0)}`,
          change: data.northboundFlow,
          unit: '万',
        },
      ],
    };
  }

  private generateOutlook(
    data: { indexChange: number; riseCount: number; fallCount: number },
    sentiment: 'bullish' | 'bearish' | 'neutral'
  ): CommentarySection {
    let outlook = '';
    if (sentiment === 'bullish') {
      outlook = '短期大盘延续反弹势头，建议关注领涨板块的持续性，' +
        '可适当加仓优质标的，但需注意追高风险。关注成交量能否持续放大。';
    } else if (sentiment === 'bearish') {
      outlook = '短期大盘面临调整压力，建议降低仓位，等待市场企稳。' +
        '关注下方支撑位的有效性，防御性板块可适当配置。';
    } else {
      outlook = '短期大盘维持震荡格局，建议轻仓观望，等待方向明确。' +
        '可逢低布局基本面优良的个股，控制好仓位。';
    }

    return {
      heading: '后市展望',
      content: outlook,
      dataPoints: [],
    };
  }

  private extractKeywords(data: {
    indexChange: number;
    hotSectors: { name: string }[];
  }): string[] {
    const keywords: string[] = [];
    if (data.indexChange > 0) keywords.push('上涨', '反弹');
    if (data.indexChange < 0) keywords.push('下跌', '调整');
    if (Math.abs(data.indexChange) < 0.3) keywords.push('震荡', '盘整');
    keywords.push(...data.hotSectors.slice(0, 3).map(s => s.name));
    return keywords;
  }

  private calculateConfidence(data: {
    indexChange: number;
    riseCount: number;
    fallCount: number;
  }): number {
    const total = data.riseCount + data.fallCount;
    const ratio = total > 0 ? Math.max(data.riseCount, data.fallCount) / total : 0.5;
    const absChange = Math.abs(data.indexChange);
    // 涨跌越分明，置信度越高
    return Math.min(95, Math.round(ratio * 60 + absChange * 10 + 30));
  }
}

// ==================== 智能止盈止损 ====================

export class StopLossCalculator {
  /**
   * 基于ATR的止盈止损计算
   */
  calculateByATR(
    symbol: string,
    currentPrice: number,
    klineData: KLineData[],
    multiplier: number = 2
  ): StopLossRecommendation {
    const atr = this.calculateATR(klineData, 14);
    const stopLoss = currentPrice - atr * multiplier;
    const takeProfit = currentPrice + atr * multiplier * 1.5; // 1.5倍风险回报比

    return {
      symbol,
      currentPrice,
      suggestedStopLoss: Math.max(0, parseFloat(stopLoss.toFixed(2))),
      suggestedTakeProfit: parseFloat(takeProfit.toFixed(2)),
      stopLossPercent: parseFloat(((atr * multiplier / currentPrice) * 100).toFixed(2)),
      takeProfitPercent: parseFloat(((atr * multiplier * 1.5 / currentPrice) * 100).toFixed(2)),
      riskRewardRatio: 1.5,
      method: 'atr',
      reasoning: `基于14日ATR（${atr.toFixed(2)}）计算，设置${multiplier}倍ATR作为止损幅度，` +
        `${multiplier * 1.5}倍ATR作为止盈幅度。ATR反映近期波动性，可动态适应市场变化。`,
      confidence: 75,
    };
  }

  /**
   * 基于均线的止盈止损
   */
  calculateByMA(
    symbol: string,
    currentPrice: number,
    klineData: KLineData[],
    period: number = 20
  ): StopLossRecommendation {
    const closes = klineData.map(d => d.close);
    const ma = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
    const stopLoss = ma * 0.98; // 均线下方2%
    const takeProfit = currentPrice + (currentPrice - stopLoss) * 2; // 2倍风险回报比

    return {
      symbol,
      currentPrice,
      suggestedStopLoss: parseFloat(stopLoss.toFixed(2)),
      suggestedTakeProfit: parseFloat(takeProfit.toFixed(2)),
      stopLossPercent: parseFloat((((currentPrice - stopLoss) / currentPrice) * 100).toFixed(2)),
      takeProfitPercent: parseFloat((((takeProfit - currentPrice) / currentPrice) * 100).toFixed(2)),
      riskRewardRatio: 2,
      method: 'moving_average',
      reasoning: `以${period}日均线（${ma.toFixed(2)}）下方2%作为止损位，` +
        `均线作为动态支撑，跌破说明趋势可能反转。止盈设在2倍风险回报比。`,
      confidence: 70,
    };
  }

  /**
   * 基于百分比的简单止盈止损
   */
  calculateByPercent(
    symbol: string,
    currentPrice: number,
    stopLossPercent: number = 5,
    takeProfitPercent: number = 10
  ): StopLossRecommendation {
    const stopLoss = currentPrice * (1 - stopLossPercent / 100);
    const takeProfit = currentPrice * (1 + takeProfitPercent / 100);

    return {
      symbol,
      currentPrice,
      suggestedStopLoss: parseFloat(stopLoss.toFixed(2)),
      suggestedTakeProfit: parseFloat(takeProfit.toFixed(2)),
      stopLossPercent,
      takeProfitPercent,
      riskRewardRatio: takeProfitPercent / stopLossPercent,
      method: 'percent',
      reasoning: `固定${stopLossPercent}%止损、${takeProfitPercent}%止盈策略，` +
        `适合趋势不明确的市场环境。`,
      confidence: 60,
    };
  }

  private calculateATR(data: KLineData[], period: number): number {
    if (data.length < period + 1) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRanges.push(tr);
    }

    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / period;
  }
}

// ==================== 板块轮动预测 ====================

export class SectorRotationPredictor {
  /**
   * 基于动量和资金流的板块轮动分析
   */
  analyze(data: {
    sector: string;
    changePercent5d: number;
    changePercent20d: number;
    volumeRatio: number; // 量比
    capitalInflow: number;
    avgPE: number;
    constituentCount: number;
  }[]): SectorRotationPrediction[] {
    return data.map(sector => {
      const momentum = this.calculateMomentum(sector);
      const phase = this.determinePhase(sector);
      const direction = this.predictDirection(sector, momentum);
      const strength = this.calculateStrength(sector, momentum);

      return {
        sector: sector.sector,
        currentPhase: phase,
        predictedDirection: direction,
        strength,
        timeframe: this.getTimeframe(phase),
        catalysts: this.identifyCatalysts(sector),
        risks: this.identifyRisks(sector),
        topPicks: [],
        analysis: this.generateSectorAnalysis(sector, phase, direction, momentum),
      };
    });
  }

  private calculateMomentum(data: {
    changePercent5d: number;
    changePercent20d: number;
    volumeRatio: number;
    capitalInflow: number;
  }): number {
    // 动量得分 = 短期涨跌幅权重 + 中期涨跌幅权重 + 量能权重 + 资金流权重
    const shortMomentum = data.changePercent5d * 0.4;
    const midMomentum = data.changePercent20d * 0.3;
    const volumeScore = (data.volumeRatio - 1) * 10; // 量比>1为正
    const flowScore = data.capitalInflow > 0 ? 10 : -10;

    return shortMomentum + midMomentum + volumeScore * 0.15 + flowScore * 0.15;
  }

  private determinePhase(data: {
    changePercent5d: number;
    changePercent20d: number;
    volumeRatio: number;
  }): 'accumulation' | 'markup' | 'distribution' | 'decline' {
    if (data.changePercent5d > 3 && data.changePercent20d > 5 && data.volumeRatio > 1.2) {
      return 'markup'; // 上涨阶段
    }
    if (data.changePercent5d < -3 && data.changePercent20d < -5) {
      return 'decline'; // 下跌阶段
    }
    if (data.changePercent5d > 0 && data.changePercent20d < 0 && data.volumeRatio > 1) {
      return 'accumulation'; // 吸筹阶段
    }
    if (data.changePercent5d < 0 && data.changePercent20d > 5) {
      return 'distribution'; // 派发阶段
    }
    return 'accumulation';
  }

  private predictDirection(
    data: { changePercent5d: number; capitalInflow: number },
    momentum: number
  ): 'rotate_in' | 'rotate_out' | 'hold' {
    if (momentum > 5) return 'rotate_in';
    if (momentum < -5) return 'rotate_out';
    return 'hold';
  }

  private calculateStrength(
    data: { volumeRatio: number; capitalInflow: number },
    momentum: number
  ): number {
    const absMomentum = Math.abs(momentum);
    const volumeBonus = data.volumeRatio > 1.5 ? 10 : 0;
    const flowBonus = Math.abs(data.capitalInflow) > 1e9 ? 10 : 0;
    return Math.min(100, Math.round(absMomentum * 3 + volumeBonus + flowBonus + 30));
  }

  private getTimeframe(phase: string): string {
    switch (phase) {
      case 'accumulation': return '中长期（1-3个月）';
      case 'markup': return '短期（1-2周）';
      case 'distribution': return '短期（1-2周）';
      case 'decline': return '中期（2-4周）';
      default: return '不确定';
    }
  }

  private identifyCatalysts(data: {
    changePercent5d: number;
    volumeRatio: number;
    capitalInflow: number;
  }): string[] {
    const catalysts: string[] = [];
    if (data.volumeRatio > 1.5) catalysts.push('量能放大，市场关注度提升');
    if (data.capitalInflow > 1e9) catalysts.push('资金持续流入');
    if (data.changePercent5d > 5) catalysts.push('短期涨幅明显，赚钱效应吸引增量资金');
    return catalysts;
  }

  private identifyRisks(data: {
    changePercent5d: number;
    changePercent20d: number;
    volumeRatio: number;
  }): string[] {
    const risks: string[] = [];
    if (data.changePercent5d > 10) risks.push('短期涨幅过大，存在获利回吐压力');
    if (data.changePercent20d < -10) risks.push('中期趋势偏弱');
    if (data.volumeRatio < 0.5) risks.push('量能萎缩，缺乏持续性');
    return risks;
  }

  private generateSectorAnalysis(
    data: { changePercent5d: number; capitalInflow: number },
    phase: string,
    direction: string,
    momentum: number
  ): string {
    const phaseDesc: Record<string, string> = {
      accumulation: '处于底部吸筹阶段',
      markup: '处于主升浪阶段',
      distribution: '处于高位派发阶段',
      decline: '处于调整下跌阶段',
    };

    const dirDesc = direction === 'rotate_in' ? '资金有望持续流入，值得关注'
      : direction === 'rotate_out' ? '资金流出压力较大，建议回避'
        : '方向不明，建议观望';

    return `该板块${phaseDesc[phase] || '方向不明'}，动量得分为${momentum.toFixed(1)}。${dirDesc}。`;
  }
}

// ==================== 导出默认实例 ====================

export const defaultCommentaryGenerator = new MarketCommentaryGenerator();
export const defaultStopLossCalculator = new StopLossCalculator();
export const defaultSectorPredictor = new SectorRotationPredictor();
