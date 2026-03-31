import { describe, it, expect, vi } from 'vitest';
import { EventBus, NamespacedEventBus } from '../services/eventBus';

describe('EventBus', () => {
  it('should subscribe and emit events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should support multiple subscribers', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    bus.emit('test', 'data');
    expect(h1).toHaveBeenCalledWith('data');
    expect(h2).toHaveBeenCalledWith('data');
  });

  it('should unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const sub = bus.on('test', handler);
    sub.unsubscribe();
    bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle once subscriptions', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('test', handler);
    bus.emit('test', 1);
    bus.emit('test', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('should unsubscribe once handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const sub = bus.once('test', handler);
    sub.unsubscribe();
    bus.emit('test', 'data');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove all handlers for event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    bus.off('test');
    bus.emit('test', 'data');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should remove specific handler', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    bus.off('test', h1);
    bus.emit('test', 'data');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('should record event history', () => {
    const bus = new EventBus();
    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('a', 3);
    expect(bus.getHistory()).toHaveLength(3);
    expect(bus.getHistory('a')).toHaveLength(2);
  });

  it('should limit history size', () => {
    const bus = new EventBus(3);
    for (let i = 0; i < 5; i++) bus.emit('test', i);
    expect(bus.getHistory()).toHaveLength(3);
    expect(bus.getHistory()[0].data).toBe(2);
  });

  it('should support middleware', () => {
    const bus = new EventBus();
    bus.use((event, data) => ({ ...data, modified: true }));
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test', { original: true });
    expect(handler).toHaveBeenCalledWith({ original: true, modified: true });
  });

  it('should support wildcard subscriptions', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('*', handler);
    bus.emit('event1', 'data1');
    bus.emit('event2', 'data2');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ event: 'event1', data: 'data1' });
  });

  it('should replay historical events', () => {
    const bus = new EventBus();
    bus.emit('test', 1);
    bus.emit('test', 2);
    bus.emit('other', 3);
    const replayed: number[] = [];
    bus.replay('test', (data) => replayed.push(data));
    expect(replayed).toEqual([1, 2]);
  });

  it('should wait for event', async () => {
    const bus = new EventBus();
    const promise = bus.waitFor<string>('test');
    setTimeout(() => bus.emit('test', 'hello'), 10);
    const result = await promise;
    expect(result).toBe('hello');
  });

  it('should timeout when waiting', async () => {
    const bus = new EventBus();
    await expect(bus.waitFor('test', 50)).rejects.toThrow('Timeout');
  });

  it('should get stats', () => {
    const bus = new EventBus();
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.emit('a', 1);
    bus.emit('b', 2);
    const stats = bus.getStats();
    expect(stats.totalEvents).toBe(2);
    expect(stats.uniqueEvents).toBe(2);
    expect(stats.subscriberCount).toBe(2);
  });

  it('should clear all', () => {
    const bus = new EventBus();
    bus.on('test', () => {});
    bus.emit('test', 1);
    bus.clear();
    expect(bus.getStats().totalEvents).toBe(0);
    expect(bus.getStats().subscriberCount).toBe(0);
  });
});

describe('NamespacedEventBus', () => {
  it('should create namespace buses', () => {
    const ns = new NamespacedEventBus();
    const bus = ns.getNamespace('market');
    expect(bus).toBeDefined();
    const handler = vi.fn();
    bus.on('price', handler);
    bus.emit('price', 100);
    expect(handler).toHaveBeenCalledWith(100);
  });

  it('should isolate namespaces', () => {
    const ns = new NamespacedEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ns.getNamespace('a').on('event', h1);
    ns.getNamespace('b').on('event', h2);
    ns.getNamespace('a').emit('event', 'data');
    expect(h1).toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should list namespaces', () => {
    const ns = new NamespacedEventBus();
    ns.getNamespace('a');
    ns.getNamespace('b');
    expect(ns.getNamespaces()).toEqual(['a', 'b']);
  });

  it('should remove namespace', () => {
    const ns = new NamespacedEventBus();
    ns.getNamespace('temp');
    ns.removeNamespace('temp');
    expect(ns.getNamespaces()).not.toContain('temp');
  });
});
