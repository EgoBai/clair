import { describe, it, expect } from 'vitest';
import {
  STRATEGY_PORTFOLIOS,
  SHARE_TEMPLATES,
  renderShareTemplate,
  generatePortfolioShare,
  generateSocialSummary,
  recommendPortfolio,
  calculatePortfolioRisk,
} from '../utils/strategyShare';

describe('策略分享工具', () => {
  describe('STRATEGY_PORTFOLIOS', () => {
    it('应包含预设组合', () => {
      expect(STRATEGY_PORTFOLIOS.length).toBeGreaterThan(0);
    });

    it('每个组合应有名称和策略配置', () => {
      STRATEGY_PORTFOLIOS.forEach(p => {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.strategies.length).toBeGreaterThan(0);
      });
    });

    it('组合内策略权重之和应为100', () => {
      STRATEGY_PORTFOLIOS.forEach(p => {
        const totalWeight = p.strategies.reduce((s, st) => s + st.weight, 0);
        expect(totalWeight).toBe(100);
      });
    });

    it('每个组合应有风险等级', () => {
      STRATEGY_PORTFOLIOS.forEach(p => {
        expect(['low', 'medium', 'high']).toContain(p.riskLevel);
      });
    });

    it('每个组合应有预期收益', () => {
      STRATEGY_PORTFOLIOS.forEach(p => {
        expect(p.expectedReturn).toBeGreaterThan(0);
      });
    });
  });

  describe('SHARE_TEMPLATES', () => {
    it('应包含多种模板', () => {
      expect(SHARE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    });

    it('每个模板应有id、名称和内容', () => {
      SHARE_TEMPLATES.forEach(t => {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.template).toBeTruthy();
      });
    });

    it('模板应包含占位符', () => {
      const simple = SHARE_TEMPLATES.find(t => t.id === 'simple');
      expect(simple?.template).toContain('{{strategyName}}');
      expect(simple?.template).toContain('{{stockList}}');
    });
  });

  describe('renderShareTemplate', () => {
    it('应替换模板中的占位符', () => {
      const result = renderShareTemplate('simple', {
        strategyName: '价值投资',
        stockList: '1. 平安银行',
        winRate: 68,
        avgReturn: 15,
        riskLevel: '低',
        date: '2024-01-01',
      });
      expect(result).toContain('价值投资');
      expect(result).toContain('平安银行');
      expect(result).not.toContain('{{strategyName}}');
    });

    it('不存在的模板应返回空字符串', () => {
      const result = renderShareTemplate('nonexistent', {});
      expect(result).toBe('');
    });

    it('应保留未匹配的占位符', () => {
      const result = renderShareTemplate('simple', { strategyName: '测试' });
      expect(result).toContain('{{stockList}}');
    });
  });

  describe('generatePortfolioShare', () => {
    it('应生成组合分享内容', () => {
      const portfolio = STRATEGY_PORTFOLIOS[0];
      const content = generatePortfolioShare(portfolio);
      expect(content).toContain(portfolio.name);
      expect(content).toContain(portfolio.description);
    });

    it('应包含策略权重', () => {
      const portfolio = STRATEGY_PORTFOLIOS[0];
      const content = generatePortfolioShare(portfolio);
      portfolio.strategies.forEach(s => {
        expect(content).toContain(`${s.weight}%`);
      });
    });

    it('应包含预期收益', () => {
      const portfolio = STRATEGY_PORTFOLIOS[0];
      const content = generatePortfolioShare(portfolio);
      expect(content).toContain(`${portfolio.expectedReturn}%`);
    });

    it('应包含风险等级', () => {
      const portfolio = STRATEGY_PORTFOLIOS[0];
      const content = generatePortfolioShare(portfolio);
      const riskLabels: Record<string, string> = {
        low: '低风险', medium: '中风险', high: '高风险',
      };
      expect(content).toContain(riskLabels[portfolio.riskLevel]);
    });
  });

  describe('generateSocialSummary', () => {
    it('应生成社交分享摘要', () => {
      const summary = generateSocialSummary(
        '价值投资',
        [
          { name: '平安银行', score: 88 },
          { name: '招商银行', score: 85 },
        ],
        68,
        1.45
      );
      expect(summary).toContain('价值投资');
      expect(summary).toContain('平安银行');
    });

    it('应限制展示前3只股票', () => {
      const stocks = Array.from({ length: 5 }, (_, i) => ({
        name: `股票${i}`,
        score: 80 + i,
      }));
      const summary = generateSocialSummary('test', stocks, 60, 1.0);
      expect(summary).toContain('股票0');
      expect(summary).toContain('股票2');
      expect(summary).not.toContain('股票3');
    });

    it('应包含胜率和夏普比率', () => {
      const summary = generateSocialSummary('test', [], 72, 1.5);
      expect(summary).toContain('72');
      expect(summary).toContain('1.5');
    });

    it('应包含话题标签', () => {
      const summary = generateSocialSummary('test', [], 60, 1.0);
      expect(summary).toContain('#A股');
      expect(summary).toContain('#AI选股');
    });
  });

  describe('recommendPortfolio', () => {
    it('保守型应推荐防御组合', () => {
      const portfolio = recommendPortfolio('conservative');
      expect(portfolio.id).toBe('defensive');
      expect(portfolio.riskLevel).toBe('low');
    });

    it('激进型应推荐积极组合', () => {
      const portfolio = recommendPortfolio('aggressive');
      expect(portfolio.id).toBe('aggressive');
      expect(portfolio.riskLevel).toBe('high');
    });

    it('稳健型应推荐均衡组合', () => {
      const portfolio = recommendPortfolio('moderate');
      expect(portfolio.id).toBe('balanced');
    });
  });

  describe('calculatePortfolioRisk', () => {
    it('应计算组合风险评分', () => {
      const portfolio = STRATEGY_PORTFOLIOS[0];
      const risk = calculatePortfolioRisk(portfolio);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBeLessThanOrEqual(100);
    });

    it('纯价值组合风险应较低', () => {
      const valuePortfolio = {
        id: 'test', name: 'test', description: 'test',
        strategies: [{ strategy: 'value', weight: 100 }],
        expectedReturn: 10, riskLevel: 'low' as const, rebalanceCycle: '季度',
      };
      const risk = calculatePortfolioRisk(valuePortfolio);
      expect(risk).toBeLessThan(40);
    });

    it('纯动量组合风险应较高', () => {
      const momentumPortfolio = {
        id: 'test', name: 'test', description: 'test',
        strategies: [{ strategy: 'momentum', weight: 100 }],
        expectedReturn: 30, riskLevel: 'high' as const, rebalanceCycle: '月度',
      };
      const risk = calculatePortfolioRisk(momentumPortfolio);
      expect(risk).toBeGreaterThan(60);
    });

    it('不同组合风险应有差异', () => {
      const risks = STRATEGY_PORTFOLIOS.map(p => ({
        id: p.id,
        risk: calculatePortfolioRisk(p),
      }));
      const uniqueRisks = new Set(risks.map(r => Math.round(r.risk)));
      expect(uniqueRisks.size).toBeGreaterThan(1);
    });
  });
});
