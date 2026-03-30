/**
 * 支付网关集成测试 - Round 181
 * 覆盖：微信支付/支付宝模拟、支付回调、退款流程
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

type PaymentMethod = 'wechat' | 'alipay' | 'card';
type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

interface PaymentOrder {
  id: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  planId: string;
  createdAt: number;
  paidAt?: number;
  refundedAt?: number;
  transactionId?: string;
}

class PaymentGateway {
  private orders: Map<string, PaymentOrder> = new Map();
  private idCounter = 1;

  createOrder(userId: string, amount: number, method: PaymentMethod, planId: string): PaymentOrder {
    const order: PaymentOrder = {
      id: `ord_${this.idCounter++}_${Date.now()}`,
      userId,
      amount,
      method,
      status: 'pending',
      planId,
      createdAt: Date.now(),
    };
    this.orders.set(order.id, order);
    return order;
  }

  processPayment(orderId: string, success: boolean = true): PaymentOrder | null {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') return null;

    order.status = success ? 'success' : 'failed';
    if (success) {
      order.paidAt = Date.now();
      order.transactionId = `txn_${crypto.randomBytes(8).toString('hex')}`;
    }
    return order;
  }

  refund(orderId: string): { success: boolean; reason?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { success: false, reason: '订单不存在' };
    if (order.status !== 'success') return { success: false, reason: '订单状态不允许退款' };

    order.status = 'refunded';
    order.refundedAt = Date.now();
    return { success: true };
  }

  getOrder(orderId: string): PaymentOrder | undefined {
    return this.orders.get(orderId);
  }

  getUserOrders(userId: string): PaymentOrder[] {
    return Array.from(this.orders.values()).filter(o => o.userId === userId);
  }

  verifyCallback(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
  }

  generateQrCodeUrl(orderId: string, method: PaymentMethod): string {
    const base = method === 'wechat' ? 'wxpay://native' : 'https://qr.alipay.com';
    return `${base}/${orderId}`;
  }
}

describe('支付网关', () => {
  let gateway: PaymentGateway;

  beforeEach(() => {
    gateway = new PaymentGateway();
  });

  describe('创建订单', () => {
    it('应创建待支付订单', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      expect(order.status).toBe('pending');
      expect(order.amount).toBe(9900);
      expect(order.method).toBe('wechat');
    });

    it('订单ID应唯一', () => {
      const ids = new Set(Array.from({ length: 100 }, () =>
        gateway.createOrder('user1', 100, 'alipay', 'plan').id
      ));
      expect(ids.size).toBe(100);
    });
  });

  describe('支付处理', () => {
    it('支付成功应更新状态', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      const result = gateway.processPayment(order.id, true);
      expect(result!.status).toBe('success');
      expect(result!.paidAt).toBeDefined();
      expect(result!.transactionId).toBeDefined();
    });

    it('支付失败应更新状态', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      const result = gateway.processPayment(order.id, false);
      expect(result!.status).toBe('failed');
      expect(result!.transactionId).toBeUndefined();
    });

    it('已处理的订单不能重复处理', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      gateway.processPayment(order.id, true);
      expect(gateway.processPayment(order.id, true)).toBeNull();
    });
  });

  describe('退款', () => {
    it('成功支付可退款', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      gateway.processPayment(order.id, true);
      const result = gateway.refund(order.id);
      expect(result.success).toBe(true);
      expect(gateway.getOrder(order.id)!.status).toBe('refunded');
    });

    it('待支付订单不能退款', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      const result = gateway.refund(order.id);
      expect(result.success).toBe(false);
    });

    it('不存在的订单不能退款', () => {
      expect(gateway.refund('nonexistent').success).toBe(false);
    });

    it('已退款订单不能重复退款', () => {
      const order = gateway.createOrder('user1', 9900, 'wechat', 'pro_monthly');
      gateway.processPayment(order.id, true);
      gateway.refund(order.id);
      expect(gateway.refund(order.id).success).toBe(false);
    });
  });

  describe('回调验证', () => {
    it('正确的签名应通过', () => {
      const secret = 'test_secret_key';
      const payload = '{"order_id":"ord_1","status":"success"}';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(gateway.verifyCallback(payload, signature, secret)).toBe(true);
    });

    it('错误的签名应拒绝', () => {
      expect(gateway.verifyCallback('payload', 'wrong_sig', 'secret')).toBe(false);
    });

    it('篡改数据应拒绝', () => {
      const secret = 'secret';
      const payload = 'original';
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      expect(gateway.verifyCallback('tampered', sig, secret)).toBe(false);
    });
  });

  describe('用户订单查询', () => {
    it('应获取用户所有订单', () => {
      gateway.createOrder('user1', 100, 'wechat', 'plan1');
      gateway.createOrder('user1', 200, 'alipay', 'plan2');
      gateway.createOrder('user2', 300, 'wechat', 'plan1');
      expect(gateway.getUserOrders('user1')).toHaveLength(2);
    });
  });

  describe('二维码生成', () => {
    it('微信支付应生成wxpay链接', () => {
      const url = gateway.generateQrCodeUrl('ord_1', 'wechat');
      expect(url).toContain('wxpay://');
    });

    it('支付宝应生成alipay链接', () => {
      const url = gateway.generateQrCodeUrl('ord_1', 'alipay');
      expect(url).toContain('alipay.com');
    });
  });
});
