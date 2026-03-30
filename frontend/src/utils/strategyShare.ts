/**
 * 策略分享工具
 * 策略组合推荐、分享模板、社交分享格式
 */

export interface ShareTemplate {
  id: string;
  name: string;
  description: string;
  format: 'text' | 'markdown' | 'html';
  template: string;
}

export interface StrategyPortfolio {
  id: string;
  name: string;
  strategies: { strategy: string; weight: number }[];
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  rebalanceCycle: string;
  description: string;
}

export interface ShareRecord {
  id: string;
  strategy: string;
  sharedAt: Date;
  platform: string;
  views: number;
  likes: number;
}

/**
 * 预设策略组合
 */
export const STRATEGY_PORTFOLIOS: StrategyPortfolio[] = [
  {
    id: 'balanced',
    name: '均衡稳健组合',
    strategies: [
      { strategy: 'value', weight: 40 },
      { strategy: 'contrarian', weight: 30 },
      { strategy: 'technical', weight: 30 },
    ],
    expectedReturn: 18.5,
    riskLevel: 'low',
    rebalanceCycle: '季度',
    description: '以价值投资为核心，辅以逆向布局和技术分析，追求稳健收益',
  },
  {
    id: 'aggressive',
    name: '积极成长组合',
    strategies: [
      { strategy: 'growth', weight: 40 },
      { strategy: 'momentum', weight: 35 },
      { strategy: 'technical', weight: 25 },
    ],
    expectedReturn: 32.0,
    riskLevel: 'high',
    rebalanceCycle: '月度',
    description: '聚焦高成长和强动量标的，追求超额收益',
  },
  {
    id: 'defensive',
    name: '防御型组合',
    strategies: [
      { strategy: 'value', weight: 50 },
      { strategy: 'contrarian', weight: 40 },
      { strategy: 'growth', weight: 10 },
    ],
    expectedReturn: 12.0,
    riskLevel: 'low',
    rebalanceCycle: '半年',
    description: '以低估蓝筹为主，逆向布局为辅，追求低回撤稳定增长',
  },
  {
    id: 'rotation',
    name: '行业轮动组合',
    strategies: [
      { strategy: 'momentum', weight: 35 },
      { strategy: 'growth', weight: 35 },
      { strategy: 'value', weight: 30 },
    ],
    expectedReturn: 25.0,
    riskLevel: 'medium',
    rebalanceCycle: '月度',
    description: '根据行业景气度轮动配置，兼顾成长和价值',
  },
];

/**
 * 分享模板
 */
export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'simple',
    name: '简洁版',
    description: '简要信息，适合快速分享',
    format: 'text',
    template: `📊 {{strategyName}} 策略推荐

🏆 推荐股票:
{{stockList}}

💡 策略胜率: {{winRate}}% | 平均收益: {{avgReturn}}%
⚠️ 风险等级: {{riskLevel}}
📅 {{date}}`,
  },
  {
    id: 'detailed',
    name: '详细版',
    description: '包含完整分析数据',
    format: 'markdown',
    template: `# {{strategyName}} 策略分析报告

## 策略概况
- **胜率**: {{winRate}}%
- **平均收益**: {{avgReturn}}%
- **最大回撤**: {{maxDrawdown}}%
- **夏普比率**: {{sharpeRatio}}

## 推荐股票

| 排名 | 股票 | 评分 | 推荐理由 |
|------|------|------|----------|
{{stockTable}}

## 策略说明
{{strategyDescription}}

## 适用人群
{{suitableFor}}

---
*AI智能选股系统 | {{date}}*`,
  },
  {
    id: 'social',
    name: '社交分享',
    description: '适合微博/朋友圈',
    format: 'text',
    template: `🔥 AI选股策略分享

{{strategyName}} | 胜率{{winRate}}% | 夏普{{sharpeRatio}}

Top3推荐:
{{top3Stocks}}

📊 点击查看详情 #A股 #AI选股 #智能投顾`,
  },
  {
    id: 'portfolio',
    name: '组合推荐',
    description: '策略组合分享',
    format: 'markdown',
    template: `# 🎯 {{portfolioName}}

{{portfolioDescription}}

## 组合配置
{{strategyWeights}}

## 预期表现
- **预期收益**: {{expectedReturn}}%
- **风险等级**: {{riskLevel}}
- **再平衡周期**: {{rebalanceCycle}}

---
*AI策略组合推荐 | {{date}}*`,
  },
];

/**
 * 根据模板生成分享内容
 */
export function renderShareTemplate(
  templateId: string,
  data: Record<string, any>
): string {
  const template = SHARE_TEMPLATES.find(t => t.id === templateId);
  if (!template) return '';

  let result = template.template;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });
  return result;
}

/**
 * 生成组合推荐分享内容
 */
export function generatePortfolioShare(portfolio: StrategyPortfolio): string {
  const strategyNames: Record<string, string> = {
    value: '价值投资', growth: '成长突破', technical: '技术形态',
    momentum: '动量追踪', contrarian: '逆向布局',
  };

  const weights = portfolio.strategies
    .map(s => `${strategyNames[s.strategy] || s.strategy}: ${s.weight}%`)
    .join('\n');

  const riskLabels: Record<string, string> = {
    low: '🟢 低风险', medium: '🟡 中风险', high: '🔴 高风险',
  };

  return renderShareTemplate('portfolio', {
    portfolioName: portfolio.name,
    portfolioDescription: portfolio.description,
    strategyWeights: weights,
    expectedReturn: portfolio.expectedReturn,
    riskLevel: riskLabels[portfolio.riskLevel],
    rebalanceCycle: portfolio.rebalanceCycle,
    date: new Date().toLocaleDateString('zh-CN'),
  });
}

/**
 * 生成社交分享摘要
 */
export function generateSocialSummary(
  strategyName: string,
  stocks: { name: string; score: number }[],
  winRate: number,
  sharpeRatio: number
): string {
  const top3 = stocks.slice(0, 3)
    .map((s, i) => `${i + 1}. ${s.name} (${s.score}分)`)
    .join('\n');

  return renderShareTemplate('social', {
    strategyName,
    winRate,
    sharpeRatio,
    top3Stocks: top3,
    date: new Date().toLocaleDateString('zh-CN'),
  });
}

/**
 * 获取平台分享URL
 */
export function getShareUrl(platform: string, content: string, url?: string): string {
  const encodedContent = encodeURIComponent(content);
  const encodedUrl = encodeURIComponent(url || window.location.href);

  const urls: Record<string, string> = {
    weibo: `https://service.weibo.com/share/share.php?title=${encodedContent}&url=${encodedUrl}`,
    wechat: '#', // 需要二维码
    qq: `https://connect.qq.com/widget/shareqq/index.html?title=${encodedContent}&url=${encodedUrl}`,
    copy: '#', // 复制到剪贴板
  };

  return urls[platform] || '#';
}

/**
 * 根据风险偏好推荐组合
 */
export function recommendPortfolio(riskTolerance: 'conservative' | 'moderate' | 'aggressive'): StrategyPortfolio {
  switch (riskTolerance) {
    case 'conservative':
      return STRATEGY_PORTFOLIOS.find(p => p.id === 'defensive')!;
    case 'aggressive':
      return STRATEGY_PORTFOLIOS.find(p => p.id === 'aggressive')!;
    default:
      return STRATEGY_PORTFOLIOS.find(p => p.id === 'balanced')!;
  }
}

/**
 * 计算组合风险评分
 */
export function calculatePortfolioRisk(portfolio: StrategyPortfolio): number {
  const riskScores: Record<string, number> = {
    value: 20, growth: 60, technical: 45, momentum: 75, contrarian: 35,
  };

  return portfolio.strategies.reduce((score, s) => {
    return score + (riskScores[s.strategy] || 50) * (s.weight / 100);
  }, 0);
}
