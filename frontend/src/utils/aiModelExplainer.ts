/**
 * AI 模型解释工具
 * 提供特征重要性分析、因子贡献度、决策路径解释
 */

export interface FeatureImportance {
  feature: string;
  importance: number;
  direction: 'positive' | 'negative';
  description: string;
  category: 'fundamental' | 'technical' | 'sentiment' | 'macro';
}

export interface FactorContribution {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface DecisionPath {
  step: number;
  condition: string;
  result: boolean;
  impact: number;
}

export interface ModelExplanation {
  symbol: string;
  modelName: string;
  modelVersion: string;
  confidence: number;
  features: FeatureImportance[];
  factors: FactorContribution[];
  decisionPath: DecisionPath[];
  riskFactors: string[];
  summary: string;
}

export interface StrategyInsight {
  strategy: string;
  performance: {
    winRate: number;
    avgReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    calmarRatio: number;
  };
  marketCondition: string;
  bestPeriod: string;
  riskLevel: 'low' | 'medium' | 'high';
  suitableFor: string[];
}

/**
 * 生成模型解释数据
 */
export function generateModelExplanation(symbol: string, name: string): ModelExplanation {
  const features: FeatureImportance[] = [
    { feature: 'PE分位数', importance: 0.18, direction: 'positive', description: '市盈率处于历史低位，估值具有安全边际', category: 'fundamental' },
    { feature: 'ROE趋势', importance: 0.15, direction: 'positive', description: '净资产收益率连续3年上升，盈利能力增强', category: 'fundamental' },
    { feature: '营收增速', importance: 0.14, direction: 'positive', description: '近两季度营收增速超预期', category: 'fundamental' },
    { feature: 'MACD金叉', importance: 0.12, direction: 'positive', description: 'MACD指标出现金叉，短期趋势向上', category: 'technical' },
    { feature: '成交量异动', importance: 0.10, direction: 'positive', description: '近期成交量放大，资金关注度提升', category: 'technical' },
    { feature: '北向资金', importance: 0.09, direction: 'positive', description: '北向资金连续5日净流入', category: 'sentiment' },
    { feature: '负债率', importance: 0.08, direction: 'negative', description: '资产负债率偏高，需关注偿债风险', category: 'fundamental' },
    { feature: '行业景气度', importance: 0.07, direction: 'positive', description: '所属行业处于上行周期', category: 'macro' },
    { feature: '机构持仓', importance: 0.04, direction: 'positive', description: '机构持仓比例上升', category: 'sentiment' },
    { feature: '政策利好', importance: 0.03, direction: 'positive', description: '近期行业政策偏利好', category: 'macro' },
  ];

  const factors: FactorContribution[] = [
    { factor: '价值因子', score: 82, weight: 0.25, contribution: 20.5, explanation: 'PE/PB/PS估值偏低，具备安全边际' },
    { factor: '成长因子', score: 78, weight: 0.25, contribution: 19.5, explanation: '营收和利润增速高于行业平均' },
    { factor: '质量因子', score: 85, weight: 0.20, contribution: 17.0, explanation: 'ROE、毛利率等质量指标优秀' },
    { factor: '动量因子', score: 72, weight: 0.15, contribution: 10.8, explanation: '近期价格走势强于大盘' },
    { factor: '情绪因子', score: 68, weight: 0.10, contribution: 6.8, explanation: '市场情绪偏乐观，研报评级上调' },
    { factor: '流动性因子', score: 75, weight: 0.05, contribution: 3.75, explanation: '日均成交额充足，流动性良好' },
  ];

  const decisionPath: DecisionPath[] = [
    { step: 1, condition: '市值 > 50亿', result: true, impact: 0.05 },
    { step: 2, condition: 'PE < 行业中位数 × 1.2', result: true, impact: 0.15 },
    { step: 3, condition: 'ROE > 10%', result: true, impact: 0.20 },
    { step: 4, condition: '近3月营收增速 > 15%', result: true, impact: 0.18 },
    { step: 5, condition: '近20日涨幅 < 30%', result: true, impact: 0.10 },
    { step: 6, condition: '北向资金净流入 > 0', result: true, impact: 0.12 },
    { step: 7, condition: '机构评级 >= 增持', result: true, impact: 0.08 },
    { step: 8, condition: '非ST/*ST', result: true, impact: 0.12 },
  ];

  const riskFactors = [
    '行业竞争加剧可能导致市场份额下降',
    '原材料价格上涨影响毛利率',
    '宏观政策变化存在不确定性',
  ];

  return {
    symbol,
    modelName: 'MultiFactorAlpha V3',
    modelVersion: '3.2.1',
    confidence: 0.87,
    features,
    factors,
    decisionPath,
    riskFactors,
    summary: `${name}(${symbol}) 综合评分较高，主要受益于估值安全边际和盈利改善。模型综合价值、成长、质量等6大因子，给出买入推荐。关键风险在于行业竞争和宏观环境变化。`,
  };
}

/**
 * 生成策略洞察数据
 */
export function generateStrategyInsight(strategy: string): StrategyInsight {
  const insights: Record<string, StrategyInsight> = {
    value: {
      strategy: '价值投资',
      performance: { winRate: 68.5, avgReturn: 15.2, maxDrawdown: -12.3, sharpeRatio: 1.45, calmarRatio: 1.24 },
      marketCondition: '震荡市和熊市后期表现最佳',
      bestPeriod: '持有6-12个月',
      riskLevel: 'low',
      suitableFor: ['稳健型投资者', '长线持有者', '追求稳定收益'],
    },
    growth: {
      strategy: '成长突破',
      performance: { winRate: 58.3, avgReturn: 28.7, maxDrawdown: -22.5, sharpeRatio: 1.28, calmarRatio: 1.28 },
      marketCondition: '牛市中期和成长风格占优时',
      bestPeriod: '持有3-6个月',
      riskLevel: 'medium',
      suitableFor: ['积极型投资者', '能承受较大波动', '追求超额收益'],
    },
    technical: {
      strategy: '技术形态',
      performance: { winRate: 62.1, avgReturn: 18.5, maxDrawdown: -15.8, sharpeRatio: 1.17, calmarRatio: 1.17 },
      marketCondition: '趋势行情中表现最佳',
      bestPeriod: '持有1-3个月',
      riskLevel: 'medium',
      suitableFor: ['技术分析爱好者', '短线交易者', '趋势跟踪者'],
    },
    momentum: {
      strategy: '动量追踪',
      performance: { winRate: 55.8, avgReturn: 32.4, maxDrawdown: -28.1, sharpeRatio: 1.15, calmarRatio: 1.15 },
      marketCondition: '强势行情和板块轮动期',
      bestPeriod: '持有1-2个月',
      riskLevel: 'high',
      suitableFor: ['激进型投资者', '关注市场热点', '追求高弹性'],
    },
    contrarian: {
      strategy: '逆向布局',
      performance: { winRate: 71.2, avgReturn: 22.3, maxDrawdown: -18.5, sharpeRatio: 1.21, calmarRatio: 1.21 },
      marketCondition: '市场恐慌和过度悲观时',
      bestPeriod: '持有3-9个月',
      riskLevel: 'medium',
      suitableFor: ['逆向思维者', '有耐心的投资者', '寻找错杀机会'],
    },
  };

  return insights[strategy] || insights.value;
}

/**
 * 导出AI报告为CSV格式
 */
export function exportReportToCSV(
  recommendations: { strategy: string; name: string; stocks: { symbol: string; name: string; score: number; reason: string; price: number; changePercent: number }[] }[],
  explanations: Map<string, ModelExplanation>
): string {
  const headers = ['策略', '股票代码', '股票名称', '评分', '现价', '涨跌幅', '推荐理由', '模型置信度', '关键因子', '风险提示'];
  const rows: string[][] = [headers];

  for (const rec of recommendations) {
    for (const stock of rec.stocks) {
      const exp = explanations.get(stock.symbol);
      const topFactors = exp?.factors
        ? exp.factors.slice(0, 3).map(f => `${f.factor}(${f.score}分)`).join('; ')
        : '';
      const risks = exp?.riskFactors.join('; ') || '';
      rows.push([
        rec.name,
        stock.symbol,
        stock.name,
        String(stock.score),
        String(stock.price),
        `${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`,
        stock.reason,
        exp ? `${(exp.confidence * 100).toFixed(0)}%` : '',
        topFactors,
        risks,
      ]);
    }
  }

  return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

/**
 * 生成分享摘要文本
 */
export function generateShareSummary(
  strategy: string,
  stocks: { symbol: string; name: string; score: number }[],
  insight: StrategyInsight
): string {
  const stockList = stocks.slice(0, 5).map((s, i) => `${i + 1}. ${s.name}(${s.symbol}) 评分${s.score}`).join('\n');
  return `📊 AI选股策略分享 - ${insight.strategy}

🏆 策略表现
• 胜率: ${insight.performance.winRate}%
• 平均收益: ${insight.performance.avgReturn}%
• 最大回撤: ${insight.performance.maxDrawdown}%
• 夏普比率: ${insight.performance.sharpeRatio}

📋 推荐股票
${stockList}

💡 适用场景: ${insight.suitableFor.join('、')}
⏱ 建议持有: ${insight.bestPeriod}
⚠️ 风险等级: ${insight.riskLevel === 'low' ? '低' : insight.riskLevel === 'medium' ? '中' : '高'}

数据来源: AI智能选股系统 | ${new Date().toLocaleDateString('zh-CN')}`;
}
