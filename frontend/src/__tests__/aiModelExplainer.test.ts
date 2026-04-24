import { describe, it, expect } from 'vitest';
import {
  generateModelExplanation,
  generateStrategyInsight,
  exportReportToCSV,
  generateShareSummary,
} from '../utils/aiModelExplainer';
import type { ModelExplanation } from '../utils/aiModelExplainer';

describe('AI模型解释工具', () => {
  describe('generateModelExplanation', () => {
    it('应返回完整的模型解释', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.symbol).toBe('000001');
      expect(exp.modelName).toBeTruthy();
      expect(exp.modelVersion).toBeTruthy();
      expect(exp.confidence).toBeGreaterThan(0);
      expect(exp.confidence).toBeLessThanOrEqual(1);
    });

    it('应包含特征重要性列表', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.features.length).toBeGreaterThan(0);
      expect(exp.features[0].feature).toBeTruthy();
      expect(exp.features[0].importance).toBeGreaterThan(0);
      expect(['positive', 'negative']).toContain(exp.features[0].direction);
    });

    it('特征重要性应按类别分类', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      const categories = new Set(exp.features.map(f => f.category));
      expect(categories.size).toBeGreaterThan(1);
      expect(categories).toContain('fundamental');
      expect(categories).toContain('technical');
    });

    it('特征重要性之和应合理', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      const totalImportance = exp.features.reduce((s, f) => s + f.importance, 0);
      expect(totalImportance).toBeGreaterThan(0.5);
      expect(totalImportance).toBeLessThanOrEqual(1.5);
    });

    it('应包含因子贡献度', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.factors.length).toBeGreaterThan(0);
      expect(exp.factors[0].factor).toBeTruthy();
      expect(exp.factors[0].score).toBeGreaterThanOrEqual(0);
      expect(exp.factors[0].score).toBeLessThanOrEqual(100);
      expect(exp.factors[0].weight).toBeGreaterThan(0);
    });

    it('因子权重之和应接近1', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      const totalWeight = exp.factors.reduce((s, f) => s + f.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 1);
    });

    it('应包含决策路径', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.decisionPath.length).toBeGreaterThan(0);
      expect(exp.decisionPath[0].step).toBe(1);
      expect(exp.decisionPath[0].condition).toBeTruthy();
      expect(typeof exp.decisionPath[0].result).toBe('boolean');
    });

    it('决策步骤应按顺序排列', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      for (let i = 1; i < exp.decisionPath.length; i++) {
        expect(exp.decisionPath[i].step).toBe(exp.decisionPath[i - 1].step + 1);
      }
    });

    it('应包含风险因素', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.riskFactors.length).toBeGreaterThan(0);
      exp.riskFactors.forEach(r => expect(r).toBeTruthy());
    });

    it('应包含摘要', () => {
      const exp = generateModelExplanation('000001', '平安银行');
      expect(exp.summary).toBeTruthy();
      expect(exp.summary.length).toBeGreaterThan(10);
    });
  });

  describe('generateStrategyInsight', () => {
    const strategies = ['value', 'growth', 'technical', 'momentum', 'contrarian'];

    it.each(strategies)('应为 %s 策略返回洞察', (strategy) => {
      const insight = generateStrategyInsight(strategy);
      expect(insight.strategy).toBeTruthy();
      expect(insight.performance.winRate).toBeGreaterThan(0);
      expect(insight.performance.avgReturn).toBeGreaterThan(0);
      expect(insight.performance.maxDrawdown).toBeLessThan(0);
      expect(insight.performance.sharpeRatio).toBeGreaterThan(0);
    });

    it('应包含市场环境描述', () => {
      const insight = generateStrategyInsight('value');
      expect(insight.marketCondition).toBeTruthy();
      expect(insight.bestPeriod).toBeTruthy();
    });

    it('应包含适用人群', () => {
      const insight = generateStrategyInsight('value');
      expect(insight.suitableFor.length).toBeGreaterThan(0);
    });

    it('风险等级应在预定义范围内', () => {
      strategies.forEach(s => {
        const insight = generateStrategyInsight(s);
        expect(['low', 'medium', 'high']).toContain(insight.riskLevel);
      });
    });

    it('未知策略应返回默认值', () => {
      const insight = generateStrategyInsight('unknown');
      expect(insight).toBeDefined();
      expect(insight.strategy).toBeTruthy();
    });
  });

  describe('exportReportToCSV', () => {
    const mockRecs = [
      {
        strategy: 'value',
        name: '价值投资',
        stocks: [
          { symbol: '000001', name: '平安银行', score: 85, reason: '估值偏低', price: 12.5, changePercent: 1.2 },
          { symbol: '000002', name: '万科A', score: 80, reason: '行业龙头', price: 18.3, changePercent: -0.5 },
        ],
      },
    ];

    it('应生成有效的CSV', () => {
      const csv = exportReportToCSV(mockRecs, new Map());
      expect(csv).toBeTruthy();
      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // header + 2 rows
    });

    it('应包含表头', () => {
      const csv = exportReportToCSV(mockRecs, new Map());
      expect(csv).toContain('策略');
      expect(csv).toContain('股票代码');
      expect(csv).toContain('评分');
    });

    it('应包含数据行', () => {
      const csv = exportReportToCSV(mockRecs, new Map());
      expect(csv).toContain('000001');
      expect(csv).toContain('平安银行');
      expect(csv).toContain('价值投资');
    });

    it('应包含模型解释数据', () => {
      const explanations = new Map<string, ModelExplanation>();
      explanations.set('000001', generateModelExplanation('000001', '平安银行'));
      const csv = exportReportToCSV(mockRecs, explanations);
      expect(csv).toContain('87%'); // confidence
    });

    it('应正确处理空数据', () => {
      const csv = exportReportToCSV([], new Map());
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // only header
    });

    it('应处理引号转义', () => {
      const recs = [{
        strategy: 'test',
        name: '测试',
        stocks: [{ symbol: '001', name: '带"引号"的', score: 80, reason: '理由', price: 10, changePercent: 0 }],
      }];
      const csv = exportReportToCSV(recs, new Map());
      expect(csv).toContain('""引号""');
    });
  });

  describe('generateShareSummary', () => {
    it('应生成包含策略名的摘要', () => {
      const summary = generateShareSummary('value', [
        { symbol: '000001', name: '平安银行', score: 85 },
      ], generateStrategyInsight('value'));
      expect(summary).toContain('价值投资');
    });

    it('应包含推荐股票列表', () => {
      const summary = generateShareSummary('value', [
        { symbol: '000001', name: '平安银行', score: 85 },
        { symbol: '000002', name: '万科A', score: 80 },
      ], generateStrategyInsight('value'));
      expect(summary).toContain('平安银行');
      expect(summary).toContain('000001');
    });

    it('应限制展示前5只股票', () => {
      const stocks = Array.from({ length: 8 }, (_, i) => ({
        symbol: `00000${i}`,
        name: `股票${i}`,
        score: 80 + i,
      }));
      const summary = generateShareSummary('value', stocks, generateStrategyInsight('value'));
      expect(summary).toContain('股票4');
      expect(summary).not.toContain('股票5');
    });

    it('应包含策略表现数据', () => {
      const insight = generateStrategyInsight('growth');
      const summary = generateShareSummary('growth', [], insight);
      expect(summary).toContain(`${insight.performance.winRate}%`);
      expect(summary).toContain(`${insight.performance.avgReturn}%`);
    });

    it('应包含日期', () => {
      const summary = generateShareSummary('value', [], generateStrategyInsight('value'));
      expect(summary).toContain(new Date().getFullYear().toString());
    });
  });
});
