/**
 * 套餐对比与升级引导 - Round 178
 * 覆盖：套餐对比表、升级推荐、降级警告、优惠计算
 */
import { describe, it, expect } from 'vitest';

interface PlanFeature {
  name: string;
  free: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

interface UpgradeRecommendation {
  reason: string;
  currentPlan: string;
  suggestedPlan: string;
  benefit: string;
  urgency: 'low' | 'medium' | 'high';
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: '实时行情', free: '延迟15分钟', pro: true, enterprise: true },
  { name: '自选股数量', free: '20只', pro: '200只', enterprise: '2000只' },
  { name: 'K线周期', free: '日线', pro: '全部', enterprise: '全部' },
  { name: '技术指标', free: '基础5个', pro: '全部50+', enterprise: '全部50+' },
  { name: 'AI分析', free: false, pro: true, enterprise: true },
  { name: '数据导出', free: '3次/天 CSV', pro: '50次/天 全格式', enterprise: '500次/天 全格式' },
  { name: 'API访问', free: false, pro: false, enterprise: true },
  { name: '回测引擎', free: false, pro: '基础', enterprise: '高级' },
  { name: '客服支持', free: '社区', pro: '工单', enterprise: '专属+电话' },
  { name: '告警数量', free: '5个', pro: '50个', enterprise: '500个' },
];

function generateUpgradeRecommendations(usage: {
  watchlistCount: number;
  dailyExports: number;
  alertsCount: number;
  usesAI: boolean;
}): UpgradeRecommendation[] {
  const recs: UpgradeRecommendation[] = [];

  if (usage.watchlistCount >= 18) {
    recs.push({
      reason: `自选股已达${usage.watchlistCount}只，接近20只上限`,
      currentPlan: 'free',
      suggestedPlan: 'pro',
      benefit: '升级后可添加200只自选股',
      urgency: 'high',
    });
  }

  if (usage.dailyExports >= 2) {
    recs.push({
      reason: `今日已导出${usage.dailyExports}次，接近3次上限`,
      currentPlan: 'free',
      suggestedPlan: 'pro',
      benefit: '升级后每天可导出50次，支持全部格式',
      urgency: 'medium',
    });
  }

  if (usage.alertsCount >= 4) {
    recs.push({
      reason: `告警已达${usage.alertsCount}个，接近5个上限`,
      currentPlan: 'free',
      suggestedPlan: 'pro',
      benefit: '升级后可设置50个告警',
      urgency: 'medium',
    });
  }

  if (usage.usesAI) {
    recs.push({
      reason: 'AI分析是专业版功能',
      currentPlan: 'free',
      suggestedPlan: 'pro',
      benefit: '解锁AI智能分析和选股建议',
      urgency: 'low',
    });
  }

  return recs;
}

function calculateSavings(monthly: number, yearly: number): { amount: number; percent: number } {
  const annualMonthly = monthly * 12;
  const saved = annualMonthly - yearly;
  return {
    amount: saved,
    percent: Math.round((saved / annualMonthly) * 100),
  };
}

describe('套餐对比与升级', () => {
  describe('功能对比表', () => {
    it('应包含所有功能行', () => {
      expect(PLAN_FEATURES.length).toBeGreaterThanOrEqual(10);
    });

    it('每行应有三个套餐列', () => {
      for (const feature of PLAN_FEATURES) {
        expect(feature).toHaveProperty('free');
        expect(feature).toHaveProperty('pro');
        expect(feature).toHaveProperty('enterprise');
      }
    });

    it('付费功能应标记为false或具体值', () => {
      for (const f of PLAN_FEATURES) {
        if (typeof f.free === 'boolean' && f.free === false) {
          // 免费版不支持的功能，pro或enterprise应支持
          expect(f.pro || f.enterprise).toBeTruthy();
        }
      }
    });

    it('AI分析应为专业版功能', () => {
      const ai = PLAN_FEATURES.find(f => f.name === 'AI分析');
      expect(ai!.free).toBe(false);
      expect(ai!.pro).toBe(true);
    });

    it('API访问应为企业版功能', () => {
      const api = PLAN_FEATURES.find(f => f.name === 'API访问');
      expect(api!.free).toBe(false);
      expect(api!.pro).toBe(false);
      expect(api!.enterprise).toBe(true);
    });
  });

  describe('升级推荐', () => {
    it('自选股接近上限应推荐升级', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 19, dailyExports: 0, alertsCount: 0, usesAI: false,
      });
      expect(recs.length).toBeGreaterThanOrEqual(1);
      expect(recs[0].suggestedPlan).toBe('pro');
      expect(recs[0].urgency).toBe('high');
    });

    it('导出接近上限应推荐升级', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 5, dailyExports: 2, alertsCount: 0, usesAI: false,
      });
      expect(recs.some(r => r.reason.includes('导出'))).toBe(true);
    });

    it('告警接近上限应推荐升级', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 5, dailyExports: 0, alertsCount: 4, usesAI: false,
      });
      expect(recs.some(r => r.reason.includes('告警'))).toBe(true);
    });

    it('使用AI应推荐升级', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 5, dailyExports: 0, alertsCount: 0, usesAI: true,
      });
      expect(recs.some(r => r.reason.includes('AI'))).toBe(true);
    });

    it('正常使用不应有推荐', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 5, dailyExports: 0, alertsCount: 0, usesAI: false,
      });
      expect(recs.length).toBe(0);
    });

    it('多维度触发应有多条推荐', () => {
      const recs = generateUpgradeRecommendations({
        watchlistCount: 19, dailyExports: 2, alertsCount: 4, usesAI: true,
      });
      expect(recs.length).toBe(4);
    });
  });

  describe('年付优惠', () => {
    it('专业版年付应节省约16%', () => {
      const savings = calculateSavings(9900, 99900);
      expect(savings.percent).toBe(16);
    });

    it('企业版年付应节省约17%', () => {
      const savings = calculateSavings(99900, 999900);
      expect(savings.percent).toBe(17);
    });

    it('节省金额应为正数', () => {
      const pro = calculateSavings(9900, 99900);
      expect(pro.amount).toBeGreaterThan(0);
    });
  });

  describe('降级警告', () => {
    function getDowngradeWarnings(fromPlan: string, toPlan: string, usage: {
      watchlistCount: number; exportsToday: number; alertsCount: number;
    }): string[] {
      const warnings: string[] = [];

      const limits: Record<string, { watchlist: number; exports: number; alerts: number }> = {
        pro: { watchlist: 200, exports: 50, alerts: 50 },
        free: { watchlist: 20, exports: 3, alerts: 5 },
      };

      const target = limits[toPlan];
      if (!target) return warnings;

      if (usage.watchlistCount > target.watchlist) {
        warnings.push(`您有${usage.watchlistCount}只自选股，降级后仅保留${target.watchlist}只`);
      }
      if (usage.exportsToday > target.exports) {
        warnings.push(`导出限额将降至${target.exports}次/天`);
      }
      if (usage.alertsCount > target.alerts) {
        warnings.push(`您有${usage.alertsCount}个告警，降级后仅保留${target.alerts}个`);
      }

      return warnings;
    }

    it('超出限额应有降级警告', () => {
      const warnings = getDowngradeWarnings('pro', 'free', {
        watchlistCount: 50, exportsToday: 10, alertsCount: 20,
      });
      expect(warnings.length).toBe(3);
    });

    it('未超出限额不应有警告', () => {
      const warnings = getDowngradeWarnings('pro', 'free', {
        watchlistCount: 10, exportsToday: 1, alertsCount: 3,
      });
      expect(warnings.length).toBe(0);
    });
  });
});
