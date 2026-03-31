import { describe, it, expect } from 'vitest';
import {
  createOrder,
  executeOrder,
  generateTWAPOrders,
  generateVAWAPOrders,
  generateIcebergOrders,
  executionQuality,
} from '../utils/algoTradingEngine';
import type { Order, ExecutionResult } from '../utils/algoTradingEngine';

describe('Algorithmic Trading Engine', () => {
  describe('createOrder', () => {
    it('should create market order', () => {
      const order = createOrder({
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
        quantity: 100,
      });

      expect(order.symbol).toBe('AAPL');
      expect(order.side).toBe('buy');
      expect(order.type).toBe('market');
      expect(order.quantity).toBe(100);
      expect(order.status).toBe('pending');
      expect(order.filledQuantity).toBe(0);
    });

    it('should create limit order', () => {
      const order = createOrder({
        symbol: 'MSFT',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        price: 300,
      });

      expect(order.price).toBe(300);
      expect(order.side).toBe('sell');
    });

    it('should create stop order', () => {
      const order = createOrder({
        symbol: 'GOOGL',
        side: 'sell',
        type: 'stop',
        quantity: 25,
        stopPrice: 140,
      });

      expect(order.stopPrice).toBe(140);
    });

    it('should default to GTC', () => {
      const order = createOrder({ symbol: 'X', side: 'buy', type: 'market', quantity: 10 });
      expect(order.timeInForce).toBe('GTC');
    });
  });

  describe('executeOrder', () => {
    it('should execute market order', () => {
      const order = createOrder({ symbol: 'AAPL', side: 'buy', type: 'market', quantity: 100 });
      const result = executeOrder(order, 150, 149.95, 150.05);

      expect(result.executed).toBe(true);
      expect(result.fillPrice).toBe(150.05); // Ask price
      expect(result.fillQuantity).toBe(100);
      expect(result.commission).toBeGreaterThan(0);
    });

    it('should execute limit order when price hits', () => {
      const order = createOrder({ symbol: 'AAPL', side: 'buy', type: 'limit', quantity: 100, price: 150 });
      const result = executeOrder(order, 149.5, 149.45, 149.55);

      expect(result.executed).toBe(true);
      expect(result.fillPrice).toBeLessThanOrEqual(150);
    });

    it('should not execute limit order when price not hit', () => {
      const order = createOrder({ symbol: 'AAPL', side: 'buy', type: 'limit', quantity: 100, price: 148 });
      const result = executeOrder(order, 150, 149.95, 150.05);

      expect(result.executed).toBe(false);
    });

    it('should execute stop order when triggered', () => {
      const order = createOrder({ symbol: 'AAPL', side: 'sell', type: 'stop', quantity: 100, stopPrice: 148 });
      const result = executeOrder(order, 147, 146.95, 147.05);

      expect(result.executed).toBe(true);
    });

    it('should not re-execute filled orders', () => {
      const order = createOrder({ symbol: 'AAPL', side: 'buy', type: 'market', quantity: 100 });
      order.status = 'filled';
      const result = executeOrder(order, 150);

      expect(result.executed).toBe(false);
    });
  });

  describe('generateTWAPOrders', () => {
    it('should generate TWAP slices', () => {
      const orders = generateTWAPOrders({
        totalQuantity: 1000,
        duration: 60,
        numSlices: 10,
        symbol: 'AAPL',
        side: 'buy',
      });

      expect(orders).toHaveLength(10);
      const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
      expect(totalQty).toBe(1000);
    });

    it('should handle uneven splits', () => {
      const orders = generateTWAPOrders({
        totalQuantity: 103,
        duration: 60,
        numSlices: 10,
        symbol: 'AAPL',
        side: 'sell',
      });

      const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
      expect(totalQty).toBe(103);
    });
  });

  describe('generateVAWAPOrders', () => {
    it('should generate VWAP slices', () => {
      const orders = generateVAWAPOrders({
        totalQuantity: 1000,
        symbol: 'AAPL',
        side: 'buy',
        volumeProfile: [100, 200, 300, 250, 150],
      });

      expect(orders.length).toBeGreaterThan(0);
      // Earlier periods with higher volume should get more shares
      const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
      expect(totalQty).toBeCloseTo(1000, -1);
    });
  });

  describe('generateIcebergOrders', () => {
    it('should generate iceberg slices', () => {
      const orders = generateIcebergOrders({
        totalQuantity: 10000,
        displayQuantity: 500,
        symbol: 'AAPL',
        side: 'buy',
        price: 150,
      });

      expect(orders.length).toBe(20); // 10000 / 500
      expect(orders.every(o => o.quantity <= 500)).toBe(true);
      const totalQty = orders.reduce((s, o) => s + o.quantity, 0);
      expect(totalQty).toBe(10000);
    });
  });

  describe('executionQuality', () => {
    it('should calculate execution quality', () => {
      const executions: ExecutionResult[] = [
        { orderId: '1', executed: true, fillPrice: 150.02, fillQuantity: 100, slippage: 0.0001, commission: 4.5, timestamp: '' },
        { orderId: '2', executed: true, fillPrice: 150.05, fillQuantity: 100, slippage: 0.0003, commission: 4.5, timestamp: '' },
      ];

      const quality = executionQuality(executions, 150);

      expect(quality.avgSlippage).toBeCloseTo(0.0002, 4);
      expect(quality.totalCommission).toBe(9);
      expect(quality.fillRate).toBe(1);
      expect(quality.implementationShortfall).toBeGreaterThan(0);
    });

    it('should handle empty executions', () => {
      const quality = executionQuality([], 150);
      expect(quality.avgSlippage).toBe(0);
      expect(quality.fillRate).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle stop_limit order', () => {
      const order = createOrder({
        symbol: 'AAPL', side: 'buy', type: 'stop_limit',
        quantity: 100, stopPrice: 155, price: 156,
      });
      // Price below stop, should not trigger
      const result = executeOrder(order, 150);
      expect(result.executed).toBe(false);

      // Price above stop but above limit
      const result2 = executeOrder(order, 157);
      expect(result2.executed).toBe(false);

      // Price above stop and at/below limit
      const result3 = executeOrder(order, 155.5);
      expect(result3.executed).toBe(true);
    });
  });
});
