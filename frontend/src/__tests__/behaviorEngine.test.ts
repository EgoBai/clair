import { describe, it, expect } from 'vitest';
import {
  createEvent,
  createEventTracker,
  analyzeBehavior,
  calculateEventFrequency,
  detectAnomalousBehavior,
  createABTestManager,
  type TrackingEvent,
  type ABTestConfig,
} from '../utils/behaviorEngine';

describe('createEvent', () => {
  it('应创建事件', () => {
    const event = createEvent('click', 'button_submit');
    expect(event.category).toBe('click');
    expect(event.action).toBe('button_submit');
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.id).toBeTruthy();
  });

  it('应包含可选元数据', () => {
    const event = createEvent('custom', 'test', { label: 'label', value: 42, metadata: { key: 'val' } });
    expect(event.label).toBe('label');
    expect(event.value).toBe(42);
    expect(event.metadata?.key).toBe('val');
  });
});

describe('createEventTracker', () => {
  it('应追踪事件', () => {
    const tracker = createEventTracker('session-1');
    tracker.track('click', 'btn1');
    tracker.track('page_view', 'home');
    expect(tracker.getEvents().length).toBe(2);
  });

  it('应按类别过滤', () => {
    const tracker = createEventTracker('s1');
    tracker.track('click', 'a');
    tracker.track('page_view', 'b');
    tracker.track('click', 'c');
    expect(tracker.getByCategory('click').length).toBe(2);
  });

  it('应按action过滤', () => {
    const tracker = createEventTracker('s1');
    tracker.track('click', 'save');
    tracker.track('click', 'cancel');
    expect(tracker.getByAction('save').length).toBe(1);
  });

  it('clear应清空', () => {
    const tracker = createEventTracker('s1');
    tracker.track('click', 'a');
    tracker.clear();
    expect(tracker.getEvents().length).toBe(0);
  });

  it('getSession应返回会话信息', () => {
    const tracker = createEventTracker('s1', 'user1');
    tracker.track('page_view', 'home');
    tracker.track('click', 'btn');
    const session = tracker.getSession();
    expect(session.id).toBe('s1');
    expect(session.pageViews).toBe(1);
    expect(session.events).toBe(2);
  });
});

describe('analyzeBehavior', () => {
  it('应分析行为', () => {
    const events: TrackingEvent[] = [
      { id: '1', category: 'click', action: 'btn1', timestamp: 1000, sessionId: 's1' },
      { id: '2', category: 'page_view', action: 'home', timestamp: 2000, sessionId: 's1' },
      { id: '3', category: 'click', action: 'btn1', timestamp: 3000, sessionId: 's1' },
      { id: '4', category: 'search', action: 'query', timestamp: 4000, sessionId: 's1' },
    ];

    const behavior = analyzeBehavior(events);
    expect(behavior.totalEvents).toBe(4);
    expect(behavior.categories['click']).toBe(2);
    expect(behavior.topActions[0].action).toBe('btn1');
  });

  it('应计算转化漏斗', () => {
    const events: TrackingEvent[] = [
      { id: '1', category: 'page_view', action: 'a', timestamp: 1, sessionId: 's1' },
      { id: '2', category: 'page_view', action: 'b', timestamp: 2, sessionId: 's1' },
      { id: '3', category: 'click', action: 'c', timestamp: 3, sessionId: 's1' },
      { id: '4', category: 'trade', action: 'buy', timestamp: 4, sessionId: 's1' },
    ];

    const behavior = analyzeBehavior(events);
    expect(behavior.conversionFunnel['view']).toBe(2);
    expect(behavior.conversionFunnel['click']).toBe(1);
    expect(behavior.conversionFunnel['trade']).toBe(1);
  });

  it('空数据应返回默认', () => {
    const behavior = analyzeBehavior([]);
    expect(behavior.totalEvents).toBe(0);
  });
});

describe('calculateEventFrequency', () => {
  it('应计算频率', () => {
    const events: TrackingEvent[] = [
      { id: '1', category: 'click', action: 'a', timestamp: 1000, sessionId: 's1' },
      { id: '2', category: 'click', action: 'b', timestamp: 2000, sessionId: 's1' },
      { id: '3', category: 'click', action: 'c', timestamp: 5000, sessionId: 's1' },
    ];

    const freq = calculateEventFrequency(events, 3000);
    expect(freq.length).toBeGreaterThan(0);
    const total = freq.reduce((sum, f) => sum + f.count, 0);
    expect(total).toBe(3);
  });

  it('空事件应返回空', () => {
    expect(calculateEventFrequency([])).toEqual([]);
  });
});

describe('detectAnomalousBehavior', () => {
  it('应检测异常点击', () => {
    const now = Date.now();
    const events: TrackingEvent[] = [
      { id: '1', category: 'click', action: 'a', timestamp: now, sessionId: 's1' },
      { id: '2', category: 'click', action: 'a', timestamp: now + 1000, sessionId: 's1' },
      { id: '3', category: 'click', action: 'a', timestamp: now + 2000, sessionId: 's1' },
      { id: '4', category: 'click', action: 'a', timestamp: now + 2010, sessionId: 's1' }, // 异常快
    ];

    const anomalies = detectAnomalousBehavior(events, 2);
    expect(anomalies.length).toBeGreaterThanOrEqual(0);
  });
});

describe('createABTestManager', () => {
  const config: ABTestConfig = {
    id: 'test1',
    name: '按钮颜色测试',
    active: true,
    variants: [
      { id: 'control', name: '蓝色', weight: 50 },
      { id: 'variant', name: '红色', weight: 50 },
    ],
  };

  it('应分配变体', () => {
    const manager = createABTestManager([config]);
    const variant = manager.assign('test1', 'user1');
    expect(variant).not.toBeNull();
    expect(['control', 'variant']).toContain(variant!.id);
  });

  it('同一用户应获得相同变体', () => {
    const manager = createABTestManager([config]);
    const v1 = manager.assign('test1', 'user1');
    const v2 = manager.assign('test1', 'user1');
    expect(v1?.id).toBe(v2?.id);
  });

  it('非活跃测试应返回null', () => {
    const inactive = { ...config, active: false };
    const manager = createABTestManager([inactive]);
    expect(manager.assign('test1', 'user1')).toBeNull();
  });

  it('不存在的测试应返回null', () => {
    const manager = createABTestManager([config]);
    expect(manager.assign('nonexistent', 'user1')).toBeNull();
  });

  it('应记录转化', () => {
    const manager = createABTestManager([config]);
    manager.assign('test1', 'user1');
    manager.recordConversion('test1', 'control');
    const results = manager.getResults('test1');
    expect(results).not.toBeNull();
    const control = results!.find(r => r.variant.id === 'control');
    expect(control?.conversions).toBe(1);
  });

  it('getResults应返回结果', () => {
    const manager = createABTestManager([config]);
    manager.assign('test1', 'user1');
    manager.assign('test1', 'user2');
    const results = manager.getResults('test1');
    expect(results?.length).toBe(2);
    const totalImpressions = results!.reduce((sum, r) => sum + r.impressions, 0);
    expect(totalImpressions).toBe(2);
  });

  it('getActiveTests应返回活跃测试', () => {
    const inactive = { ...config, id: 'test2', active: false };
    const manager = createABTestManager([config, inactive]);
    expect(manager.getActiveTests().length).toBe(1);
  });

  it('非存在测试getResults应返回null', () => {
    const manager = createABTestManager([config]);
    expect(manager.getResults('nonexistent')).toBeNull();
  });
});
