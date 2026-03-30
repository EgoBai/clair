/**
 * API 配额系统 - Round 174
 * 用户套餐、请求配额、速率限制、用量追踪
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============ 类型定义 ============

interface PlanConfig {
  name: string;
  price: number; // 月费(分)
  quotas: {
    requestsPerMinute: number;
    requestsPerDay: number;
    exportsPerDay: number;
    watchlistStocks: number;
    alertsCount: number;
    apiCallsPerMonth: number;
  };
  features: string[];
}

interface UsageRecord {
  userId: string;
  date: string; // YYYY-MM-DD
  requests: number;
  exports: number;
  apiCalls: number;
}

// ============ 套餐配置 ============

const PLANS: Record<string, PlanConfig> = {
  free: {
    name: '免费版',
    price: 0,
    quotas: {
      requestsPerMinute: 30,
      requestsPerDay: 1000,
      exportsPerDay: 3,
      watchlistStocks: 20,
      alertsCount: 5,
      apiCallsPerMonth: 10000,
    },
    features: ['基础行情', '自选股(20)', '日线K线'],
  },
  pro: {
    name: '专业版',
    price: 9900, // ¥99/月
    quotas: {
      requestsPerMinute: 120,
      requestsPerDay: 10000,
      exportsPerDay: 50,
      watchlistStocks: 200,
      alertsCount: 50,
      apiCallsPerMonth: 100000,
    },
    features: ['实时行情', '自选股(200)', '全周期K线', '技术指标', 'AI分析', '数据导出'],
  },
  enterprise: {
    name: '企业版',
    price: 99900, // ¥999/月
    quotas: {
      requestsPerMinute: 600,
      requestsPerDay: 100000,
      exportsPerDay: 500,
      watchlistStocks: 2000,
      alertsCount: 500,
      apiCallsPerMonth: 1000000,
    },
    features: ['全部功能', 'API访问', '专属客服', '自定义指标', '批量导出', '白标方案'],
  },
};

// ============ 配额管理器 ============

class QuotaManager {
  private usage: Map<string, UsageRecord> = new Map();
  private rateLimits: Map<string, number[]> = new Map(); // userId -> timestamps

  getUserPlan(userId: string): string {
    // 模拟：通过用户ID判断套餐
    if (userId.startsWith('ent_')) return 'enterprise';
    if (userId.startsWith('pro_')) return 'pro';
    return 'free';
  }

  getPlanConfig(plan: string): PlanConfig {
    return PLANS[plan] || PLANS.free;
  }

  private getToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getUsageKey(userId: string): string {
    return `${userId}:${this.getToday()}`;
  }

  getUsage(userId: string): UsageRecord {
    const key = this.getUsageKey(userId);
    if (!this.usage.has(key)) {
      this.usage.set(key, {
        userId,
        date: this.getToday(),
        requests: 0,
        exports: 0,
        apiCalls: 0,
      });
    }
    return this.usage.get(key)!;
  }

  checkRateLimit(userId: string, now: number = Date.now()): { allowed: boolean; retryAfter?: number } {
    const plan = this.getUserPlan(userId);
    const config = this.getPlanConfig(plan);
    const windowMs = 60000; // 1分钟窗口

    if (!this.rateLimits.has(userId)) {
      this.rateLimits.set(userId, []);
    }

    const timestamps = this.rateLimits.get(userId)!;
    // 清理窗口外的记录
    const windowStart = now - windowMs;
    const validTimestamps = timestamps.filter(t => t > windowStart);
    this.rateLimits.set(userId, validTimestamps);

    if (validTimestamps.length >= config.quotas.requestsPerMinute) {
      const oldestInWindow = Math.min(...validTimestamps);
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    validTimestamps.push(now);
    return { allowed: true };
  }

  checkDailyQuota(userId: string, type: 'requests' | 'exports'): { allowed: boolean; remaining: number } {
    const plan = this.getUserPlan(userId);
    const config = this.getPlanConfig(plan);
    const usage = this.getUsage(userId);

    const limit = type === 'requests' ? config.quotas.requestsPerDay : config.quotas.exportsPerDay;
    const current = type === 'requests' ? usage.requests : usage.exports;

    return {
      allowed: current < limit,
      remaining: Math.max(0, limit - current),
    };
  }

  recordUsage(userId: string, type: 'requests' | 'exports' | 'apiCalls') {
    const usage = this.getUsage(userId);
    if (type === 'requests') usage.requests++;
    else if (type === 'exports') usage.exports++;
    else if (type === 'apiCalls') usage.apiCalls++;
  }

  checkMonthlyQuota(userId: string): { allowed: boolean; remaining: number } {
    const plan = this.getUserPlan(userId);
    const config = this.getPlanConfig(plan);
    const usage = this.getUsage(userId);
    return {
      allowed: usage.apiCalls < config.quotas.apiCallsPerMonth,
      remaining: Math.max(0, config.quotas.apiCallsPerMonth - usage.apiCalls),
    };
  }
}

describe('API配额系统', () => {
  let manager: QuotaManager;

  beforeEach(() => {
    manager = new QuotaManager();
  });

  describe('套餐配置', () => {
    it('应有3个套餐级别', () => {
      expect(PLANS.free).toBeDefined();
      expect(PLANS.pro).toBeDefined();
      expect(PLANS.enterprise).toBeDefined();
    });

    it('免费套餐价格应为0', () => {
      expect(PLANS.free.price).toBe(0);
    });

    it('专业套餐应为¥99/月', () => {
      expect(PLANS.pro.price).toBe(9900);
    });

    it('企业套餐应为¥999/月', () => {
      expect(PLANS.enterprise.price).toBe(99900);
    });

    it('每个套餐应有完整配额配置', () => {
      for (const plan of Object.values(PLANS)) {
        expect(plan.quotas.requestsPerMinute).toBeGreaterThan(0);
        expect(plan.quotas.requestsPerDay).toBeGreaterThan(0);
        expect(plan.quotas.exportsPerDay).toBeGreaterThan(0);
        expect(plan.quotas.watchlistStocks).toBeGreaterThan(0);
        expect(plan.quotas.alertsCount).toBeGreaterThan(0);
        expect(plan.quotas.apiCallsPerMonth).toBeGreaterThan(0);
      }
    });

    it('高级套餐配额应大于低级套餐', () => {
      expect(PLANS.pro.quotas.requestsPerDay).toBeGreaterThan(PLANS.free.quotas.requestsPerDay);
      expect(PLANS.enterprise.quotas.requestsPerDay).toBeGreaterThan(PLANS.pro.quotas.requestsPerDay);
    });

    it('每个套餐应有features列表', () => {
      for (const plan of Object.values(PLANS)) {
        expect(plan.features.length).toBeGreaterThan(0);
      }
    });
  });

  describe('用户套餐识别', () => {
    it('free用户应获取免费套餐', () => {
      expect(manager.getUserPlan('user_001')).toBe('free');
    });

    it('pro用户应获取专业套餐', () => {
      expect(manager.getUserPlan('pro_001')).toBe('pro');
    });

    it('enterprise用户应获取企业套餐', () => {
      expect(manager.getUserPlan('ent_001')).toBe('enterprise');
    });
  });

  describe('速率限制', () => {
    it('免费用户每分钟应限制30次', () => {
      for (let i = 0; i < 30; i++) {
        const result = manager.checkRateLimit('free_user');
        expect(result.allowed).toBe(true);
      }
      const result = manager.checkRateLimit('free_user');
      expect(result.allowed).toBe(false);
    });

    it('超限后应返回retryAfter', () => {
      for (let i = 0; i < 30; i++) {
        manager.checkRateLimit('free_user');
      }
      const result = manager.checkRateLimit('free_user');
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('专业用户应有更高限额', () => {
      for (let i = 0; i < 30; i++) {
        const result = manager.checkRateLimit('pro_user');
        expect(result.allowed).toBe(true);
      }
      // pro还能继续
      const result = manager.checkRateLimit('pro_user');
      expect(result.allowed).toBe(true);
    });

    it('不同用户速率限制独立', () => {
      for (let i = 0; i < 30; i++) {
        manager.checkRateLimit('free_user1');
      }
      // user1超限
      expect(manager.checkRateLimit('free_user1').allowed).toBe(false);
      // user2仍可
      expect(manager.checkRateLimit('free_user2').allowed).toBe(true);
    });
  });

  describe('日配额', () => {
    it('免费用户日请求限额', () => {
      const usage = manager.getUsage('free_user');
      usage.requests = 1000; // 达到限额
      const result = manager.checkDailyQuota('free_user', 'requests');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('未达限额时应允许', () => {
      const result = manager.checkDailyQuota('free_user', 'requests');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1000);
    });

    it('导出配额独立', () => {
      manager.recordUsage('free_user', 'exports');
      manager.recordUsage('free_user', 'exports');
      manager.recordUsage('free_user', 'exports');
      const result = manager.checkDailyQuota('free_user', 'exports');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('专业用户有更高导出限额', () => {
      for (let i = 0; i < 3; i++) {
        manager.recordUsage('pro_user', 'exports');
      }
      const result = manager.checkDailyQuota('pro_user', 'exports');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(47);
    });
  });

  describe('用量追踪', () => {
    it('应正确记录请求', () => {
      manager.recordUsage('user1', 'requests');
      manager.recordUsage('user1', 'requests');
      const usage = manager.getUsage('user1');
      expect(usage.requests).toBe(2);
    });

    it('应正确记录导出', () => {
      manager.recordUsage('user1', 'exports');
      const usage = manager.getUsage('user1');
      expect(usage.exports).toBe(1);
    });

    it('应正确记录API调用', () => {
      manager.recordUsage('user1', 'apiCalls');
      manager.recordUsage('user1', 'apiCalls');
      manager.recordUsage('user1', 'apiCalls');
      const usage = manager.getUsage('user1');
      expect(usage.apiCalls).toBe(3);
    });

    it('月配额检查', () => {
      const usage = manager.getUsage('free_user');
      usage.apiCalls = 9999;
      const result = manager.checkMonthlyQuota('free_user');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      manager.recordUsage('free_user', 'apiCalls');
      const result2 = manager.checkMonthlyQuota('free_user');
      expect(result2.allowed).toBe(false);
    });
  });

  describe('套餐比较表', () => {
    it('应能生成套餐对比数据', () => {
      const comparison = Object.entries(PLANS).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: `¥${plan.price / 100}/月`,
        requestLimit: `${plan.quotas.requestsPerDay}/天`,
        exportLimit: `${plan.quotas.exportsPerDay}/天`,
        features: plan.features.length,
      }));
      expect(comparison).toHaveLength(3);
      expect(comparison[0].price).toBe('¥0/月');
      expect(comparison[1].price).toBe('¥99/月');
      expect(comparison[2].price).toBe('¥999/月');
    });

    it('各套餐导出配额应递增', () => {
      expect(PLANS.free.quotas.exportsPerDay).toBeLessThan(PLANS.pro.quotas.exportsPerDay);
      expect(PLANS.pro.quotas.exportsPerDay).toBeLessThan(PLANS.enterprise.quotas.exportsPerDay);
    });

    it('各套餐自选股限额应递增', () => {
      expect(PLANS.free.quotas.watchlistStocks).toBeLessThan(PLANS.pro.quotas.watchlistStocks);
      expect(PLANS.pro.quotas.watchlistStocks).toBeLessThan(PLANS.enterprise.quotas.watchlistStocks);
    });
  });
});
