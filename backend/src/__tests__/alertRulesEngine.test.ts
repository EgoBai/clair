import { describe, it, expect } from 'vitest';

describe('AlertRulesEngine', () => {
  type AlertType = 'price_above' | 'price_below' | 'change_percent' | 'volume_spike' | 'ma_cross' | 'rsi_signal' | 'macd_signal';

  interface AlertRule {
    id: string;
    symbol: string;
    type: AlertType;
    value: number;
    enabled: boolean;
    triggered: boolean;
    triggeredAt?: string;
    message?: string;
  }

  interface Quote {
    symbol: string;
    price: number;
    changePercent: number;
    volume: number;
    ma5: number;
    ma20: number;
    rsi: number;
    macd: { dif: number; dea: number };
  }

  function evaluateAlert(rule: AlertRule, quote: Quote): AlertRule {
    if (!rule.enabled || rule.triggered) return rule;
    if (rule.symbol !== quote.symbol) return rule;
    let triggered = false;
    let message = '';
    switch (rule.type) {
      case 'price_above':
        triggered = quote.price >= rule.value;
        message = triggered ? `${quote.symbol} 价格 ${quote.price} 突破 ${rule.value}` : '';
        break;
      case 'price_below':
        triggered = quote.price <= rule.value;
        message = triggered ? `${quote.symbol} 价格 ${quote.price} 跌破 ${rule.value}` : '';
        break;
      case 'change_percent':
        triggered = Math.abs(quote.changePercent) >= rule.value;
        message = triggered ? `${quote.symbol} 涨跌幅 ${quote.changePercent.toFixed(2)}% 达到阈值` : '';
        break;
      case 'volume_spike':
        triggered = quote.volume >= rule.value;
        message = triggered ? `${quote.symbol} 成交量 ${quote.volume} 异常放大` : '';
        break;
      case 'ma_cross':
        triggered = rule.value > 0 ? quote.ma5 > quote.ma20 : quote.ma5 < quote.ma20;
        message = triggered ? `${quote.symbol} ${rule.value > 0 ? '金叉' : '死叉'}` : '';
        break;
      case 'rsi_signal':
        triggered = rule.value > 0 ? quote.rsi >= rule.value : quote.rsi <= Math.abs(rule.value);
        message = triggered ? `${quote.symbol} RSI ${quote.rsi.toFixed(1)} ${rule.value > 0 ? '超买' : '超卖'}` : '';
        break;
      case 'macd_signal':
        triggered = rule.value > 0 ? quote.macd.dif > quote.macd.dea : quote.macd.dif < quote.macd.dea;
        message = triggered ? `${quote.symbol} MACD ${rule.value > 0 ? '金叉' : '死叉'}` : '';
        break;
    }
    return triggered ? { ...rule, triggered: true, triggeredAt: new Date().toISOString(), message } : rule;
  }

  function batchEvaluate(rules: AlertRule[], quotes: Quote[]): AlertRule[] {
    const quoteMap = new Map(quotes.map(q => [q.symbol, q]));
    return rules.map(rule => {
      const quote = quoteMap.get(rule.symbol);
      if (!quote) return rule;
      return evaluateAlert(rule, quote);
    });
  }

  const quote600519: Quote = { symbol: '600519', price: 1800, changePercent: 2.86, volume: 30000, ma5: 1780, ma20: 1750, rsi: 65, macd: { dif: 15, dea: 10 } };
  const quote300750: Quote = { symbol: '300750', price: 210, changePercent: -3.67, volume: 500000, ma5: 215, ma20: 225, rsi: 28, macd: { dif: -5, dea: -2 } };

  it('should trigger price above rule', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1790, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(true);
  });

  it('should not trigger price above when below threshold', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1850, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(false);
  });

  it('should trigger price below rule', () => {
    const rule: AlertRule = { id: '1', symbol: '300750', type: 'price_below', value: 215, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote300750);
    expect(result.triggered).toBe(true);
  });

  it('should trigger change percent rule', () => {
    const rule: AlertRule = { id: '1', symbol: '300750', type: 'change_percent', value: 3, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote300750);
    expect(result.triggered).toBe(true);
  });

  it('should trigger volume spike rule', () => {
    const rule: AlertRule = { id: '1', symbol: '300750', type: 'volume_spike', value: 400000, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote300750);
    expect(result.triggered).toBe(true);
  });

  it('should trigger ma cross (golden cross)', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'ma_cross', value: 1, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(true);
  });

  it('should trigger ma cross (death cross)', () => {
    const rule: AlertRule = { id: '1', symbol: '300750', type: 'ma_cross', value: -1, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote300750);
    expect(result.triggered).toBe(true);
  });

  it('should trigger RSI overbought', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'rsi_signal', value: 60, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(true);
  });

  it('should trigger RSI oversold', () => {
    const rule: AlertRule = { id: '1', symbol: '300750', type: 'rsi_signal', value: -30, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote300750);
    expect(result.triggered).toBe(true);
  });

  it('should trigger MACD golden cross', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'macd_signal', value: 1, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(true);
  });

  it('should not trigger disabled rule', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 100, enabled: false, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(false);
  });

  it('should not re-trigger already triggered rule', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 100, enabled: true, triggered: true };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(true);
    expect(result.triggeredAt).toBeUndefined();
  });

  it('should skip rule for non-matching symbol', () => {
    const rule: AlertRule = { id: '1', symbol: '000001', type: 'price_above', value: 100, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.triggered).toBe(false);
  });

  it('should set message on trigger', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1790, enabled: true, triggered: false };
    const result = evaluateAlert(rule, quote600519);
    expect(result.message).toContain('600519');
    expect(result.message).toContain('1800');
  });

  it('should batch evaluate multiple rules', () => {
    const rules: AlertRule[] = [
      { id: '1', symbol: '600519', type: 'price_above', value: 1790, enabled: true, triggered: false },
      { id: '2', symbol: '300750', type: 'rsi_signal', value: -30, enabled: true, triggered: false },
      { id: '3', symbol: '000001', type: 'price_above', value: 10, enabled: true, triggered: false },
    ];
    const results = batchEvaluate(rules, [quote600519, quote300750]);
    expect(results[0].triggered).toBe(true);
    expect(results[1].triggered).toBe(true);
    expect(results[2].triggered).toBe(false);
  });

  it('should count triggered alerts', () => {
    const rules: AlertRule[] = [
      { id: '1', symbol: '600519', type: 'price_above', value: 1790, enabled: true, triggered: false },
      { id: '2', symbol: '600519', type: 'price_below', value: 1900, enabled: true, triggered: false },
      { id: '3', symbol: '600519', type: 'price_above', value: 2000, enabled: true, triggered: false },
    ];
    const results = batchEvaluate(rules, [quote600519]);
    const triggered = results.filter(r => r.triggered);
    expect(triggered).toHaveLength(2);
  });
});
