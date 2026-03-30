/**
 * 支付与试用系统 - Round 176-177
 * Stripe集成模拟、试用期管理、订阅状态机
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============ 类型 ============

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
type PlanType = 'free' | 'pro_monthly' | 'pro_yearly' | 'enterprise_monthly' | 'enterprise_yearly';

interface Subscription {
  id: string;
  userId: string;
  plan: PlanType;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  amount: number; // 分
  currency: string;
  paymentMethod?: {
    type: 'card' | 'alipay' | 'wechat';
    last4?: string;
    brand?: string;
  };
}

interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueDate: Date;
  paidAt?: Date;
}

// ============ 定价 ============

const PRICING: Record<PlanType, { amount: number; interval: 'month' | 'year'; trialDays: number }> = {
  free: { amount: 0, interval: 'month', trialDays: 0 },
  pro_monthly: { amount: 9900, interval: 'month', trialDays: 7 },
  pro_yearly: { amount: 99900, interval: 'year', trialDays: 14 },
  enterprise_monthly: { amount: 99900, interval: 'month', trialDays: 14 },
  enterprise_yearly: { amount: 999900, interval: 'year', trialDays: 30 },
};

// ============ 订阅管理器 ============

class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();
  private invoices: Invoice[] = [];
  private idCounter = 1;

  createSubscription(userId: string, plan: PlanType): Subscription {
    const pricing = PRICING[plan];
    const now = new Date();
    const periodEnd = new Date(now);

    if (pricing.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const trialEnd = pricing.trialDays > 0
      ? new Date(now.getTime() + pricing.trialDays * 24 * 60 * 60 * 1000)
      : undefined;

    const sub: Subscription = {
      id: `sub_${this.idCounter++}`,
      userId,
      plan,
      status: pricing.trialDays > 0 ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEnd,
      cancelAtPeriodEnd: false,
      amount: pricing.amount,
      currency: 'cny',
    };

    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  getSubscription(subId: string): Subscription | undefined {
    return this.subscriptions.get(subId);
  }

  cancelSubscription(subId: string, atPeriodEnd: boolean = true): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub) return null;

    if (atPeriodEnd) {
      sub.cancelAtPeriodEnd = true;
    } else {
      sub.status = 'canceled';
      sub.canceledAt = new Date();
    }

    return sub;
  }

  reactivateSubscription(subId: string): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub || sub.status === 'canceled') return null;
    sub.cancelAtPeriodEnd = false;
    return sub;
  }

  changePlan(subId: string, newPlan: PlanType): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub || sub.status === 'canceled') return null;

    const newPricing = PRICING[newPlan];
    sub.plan = newPlan;
    sub.amount = newPricing.amount;
    return sub;
  }

  processTrialEnd(subId: string): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub || sub.status !== 'trialing') return null;

    sub.status = sub.paymentMethod ? 'active' : 'incomplete';
    sub.trialEnd = undefined;
    return sub;
  }

  handlePaymentFailed(subId: string): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub) return null;

    sub.status = 'past_due';
    return sub;
  }

  handlePaymentSuccess(subId: string): Subscription | null {
    const sub = this.subscriptions.get(subId);
    if (!sub) return null;

    if (sub.status === 'past_due' || sub.status === 'incomplete') {
      sub.status = 'active';
    }
    return sub;
  }

  getUserSubscriptions(userId: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(s => s.userId === userId);
  }

  hasActiveAccess(userId: string): boolean {
    const subs = this.getUserSubscriptions(userId);
    return subs.some(s => ['trialing', 'active'].includes(s.status) && !s.canceledAt);
  }

  calculateProrate(oldAmount: number, newAmount: number, daysRemaining: number, totalDays: number): number {
    const credit = Math.round((oldAmount * daysRemaining) / totalDays);
    const charge = Math.round((newAmount * daysRemaining) / totalDays);
    return charge - credit;
  }
}

describe('支付与订阅系统', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  describe('定价配置', () => {
    it('应有所有套餐定价', () => {
      expect(PRICING.free.amount).toBe(0);
      expect(PRICING.pro_monthly.amount).toBe(9900);
      expect(PRICING.pro_yearly.amount).toBe(99900);
      expect(PRICING.enterprise_monthly.amount).toBe(99900);
      expect(PRICING.enterprise_yearly.amount).toBe(999900);
    });

    it('年付应比月付优惠', () => {
      // pro年付 99900 vs 月付*12 = 118800
      expect(PRICING.pro_yearly.amount).toBeLessThan(PRICING.pro_monthly.amount * 12);
      expect(PRICING.enterprise_yearly.amount).toBeLessThan(PRICING.enterprise_monthly.amount * 12);
    });

    it('付费套餐应有试用期', () => {
      expect(PRICING.pro_monthly.trialDays).toBe(7);
      expect(PRICING.pro_yearly.trialDays).toBe(14);
      expect(PRICING.enterprise_monthly.trialDays).toBe(14);
      expect(PRICING.enterprise_yearly.trialDays).toBe(30);
    });
  });

  describe('创建订阅', () => {
    it('月付订阅周期应为1个月', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      const days = (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThanOrEqual(28);
      expect(days).toBeLessThanOrEqual(31);
    });

    it('年付订阅周期应为1年', () => {
      const sub = manager.createSubscription('user1', 'pro_yearly');
      const days = (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(days).toBeGreaterThanOrEqual(365);
      expect(days).toBeLessThanOrEqual(366);
    });

    it('试用期订阅状态应为trialing', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      expect(sub.status).toBe('trialing');
      expect(sub.trialEnd).toBeDefined();
    });

    it('免费订阅应直接激活', () => {
      const sub = manager.createSubscription('user1', 'free');
      expect(sub.status).toBe('active');
      expect(sub.trialEnd).toBeUndefined();
    });
  });

  describe('取消订阅', () => {
    it('期末取消应标记cancelAtPeriodEnd', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      const canceled = manager.cancelSubscription(sub.id, true);
      expect(canceled!.cancelAtPeriodEnd).toBe(true);
      expect(canceled!.status).toBe('trialing'); // 仍然有效
    });

    it('立即取消应设为canceled', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      const canceled = manager.cancelSubscription(sub.id, false);
      expect(canceled!.status).toBe('canceled');
      expect(canceled!.canceledAt).toBeDefined();
    });

    it('不存在的订阅应返回null', () => {
      expect(manager.cancelSubscription('nonexistent')).toBeNull();
    });

    it('可重新激活未到期的取消', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      manager.cancelSubscription(sub.id, true);
      const reactivated = manager.reactivateSubscription(sub.id);
      expect(reactivated!.cancelAtPeriodEnd).toBe(false);
    });

    it('已取消的订阅不能重新激活', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      manager.cancelSubscription(sub.id, false);
      expect(manager.reactivateSubscription(sub.id)).toBeNull();
    });
  });

  describe('套餐变更', () => {
    it('应能升级套餐', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      const upgraded = manager.changePlan(sub.id, 'enterprise_monthly');
      expect(upgraded!.plan).toBe('enterprise_monthly');
      expect(upgraded!.amount).toBe(99900);
    });

    it('应能降级套餐', () => {
      const sub = manager.createSubscription('user1', 'enterprise_monthly');
      const downgraded = manager.changePlan(sub.id, 'pro_monthly');
      expect(downgraded!.plan).toBe('pro_monthly');
      expect(downgraded!.amount).toBe(9900);
    });

    it('已取消的订阅不能变更', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      manager.cancelSubscription(sub.id, false);
      expect(manager.changePlan(sub.id, 'enterprise_monthly')).toBeNull();
    });
  });

  describe('试用期管理', () => {
    it('试用结束有支付方式应激活', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      sub.paymentMethod = { type: 'card', last4: '4242', brand: 'visa' };
      const processed = manager.processTrialEnd(sub.id);
      expect(processed!.status).toBe('active');
    });

    it('试用结束无支付方式应incomplete', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      const processed = manager.processTrialEnd(sub.id);
      expect(processed!.status).toBe('incomplete');
    });

    it('非试用状态不能处理试用结束', () => {
      const sub = manager.createSubscription('user1', 'free');
      expect(manager.processTrialEnd(sub.id)).toBeNull();
    });
  });

  describe('支付失败处理', () => {
    it('支付失败应设为past_due', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      sub.paymentMethod = { type: 'card', last4: '4242' };
      manager.processTrialEnd(sub.id);
      const failed = manager.handlePaymentFailed(sub.id);
      expect(failed!.status).toBe('past_due');
    });

    it('支付成功应恢复active', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      sub.paymentMethod = { type: 'card', last4: '4242' };
      manager.processTrialEnd(sub.id);
      manager.handlePaymentFailed(sub.id);
      const restored = manager.handlePaymentSuccess(sub.id);
      expect(restored!.status).toBe('active');
    });
  });

  describe('用户访问控制', () => {
    it('有活跃订阅应有访问权', () => {
      manager.createSubscription('user1', 'pro_monthly');
      expect(manager.hasActiveAccess('user1')).toBe(true);
    });

    it('无订阅应无访问权', () => {
      expect(manager.hasActiveAccess('user_nosub')).toBe(false);
    });

    it('已取消订阅应无访问权', () => {
      const sub = manager.createSubscription('user1', 'pro_monthly');
      manager.cancelSubscription(sub.id, false);
      expect(manager.hasActiveAccess('user1')).toBe(false);
    });

    it('试用期应有访问权', () => {
      manager.createSubscription('user1', 'pro_monthly');
      expect(manager.hasActiveAccess('user1')).toBe(true);
    });
  });

  describe('费用计算', () => {
    it('应正确计算按比例费用', () => {
      const prorate = manager.calculateProrate(9900, 99900, 15, 30);
      // 退还: 9900 * 15/30 = 4950
      // 收取: 99900 * 15/30 = 49950
      // 差额: 49950 - 4950 = 45000
      expect(prorate).toBe(45000);
    });

    it('降级应为负差额', () => {
      const prorate = manager.calculateProrate(99900, 9900, 15, 30);
      expect(prorate).toBeLessThan(0);
    });
  });
});
