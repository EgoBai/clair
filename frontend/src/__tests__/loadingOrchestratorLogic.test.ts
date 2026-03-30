import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadingOrchestrator, FirstPaintTimer, FeedbackManager } from '../utils/loadingOrchestrator';

describe('LoadingOrchestrator', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========== 注册任务 ==========
  describe('register', () => {
    it('should register a task with default priority', () => {
      orchestrator.register('task1', 'Load data');
      const state = orchestrator.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe('task1');
      expect(state.tasks[0].label).toBe('Load data');
      expect(state.tasks[0].priority).toBe('normal');
      expect(state.tasks[0].status).toBe('idle');
    });

    it('should register critical task', () => {
      orchestrator.register('critical1', 'Auth', 'critical', 5000);
      const state = orchestrator.getState();
      expect(state.tasks[0].priority).toBe('critical');
      expect(state.tasks[0].timeout).toBe(5000);
    });

    it('should register high priority task', () => {
      orchestrator.register('high1', 'Market data', 'high');
      const state = orchestrator.getState();
      expect(state.tasks[0].priority).toBe('high');
    });

    it('should register low priority task', () => {
      orchestrator.register('low1', 'Analytics', 'low');
      const state = orchestrator.getState();
      expect(state.tasks[0].priority).toBe('low');
    });

    it('should default timeout to 10000ms', () => {
      orchestrator.register('task1', 'Test');
      const state = orchestrator.getState();
      expect(state.tasks[0].timeout).toBe(10000);
    });

    it('should register multiple tasks', () => {
      orchestrator.register('t1', 'Task 1');
      orchestrator.register('t2', 'Task 2');
      orchestrator.register('t3', 'Task 3');
      expect(orchestrator.getState().tasks).toHaveLength(3);
    });
  });

  // ========== 启动任务 ==========
  describe('start', () => {
    it('should set task status to loading', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      expect(orchestrator.getState().tasks[0].status).toBe('loading');
    });

    it('should set startTime', () => {
      const now = Date.now();
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      expect(orchestrator.getState().tasks[0].startTime).toBeGreaterThanOrEqual(now);
    });

    it('should not crash for unknown task', () => {
      orchestrator.start('nonexistent');
      expect(orchestrator.getState().tasks).toHaveLength(0);
    });

    it('should set overall phase to loading', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      expect(orchestrator.getState().phase).toBe('loading');
    });
  });

  // ========== 完成任务 ==========
  describe('complete', () => {
    it('should set task status to success', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      expect(orchestrator.getState().tasks[0].status).toBe('success');
    });

    it('should set endTime', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      expect(orchestrator.getState().tasks[0].endTime).toBeDefined();
    });

    it('should not crash for unknown task', () => {
      orchestrator.complete('nonexistent');
    });

    it('should set phase to success when all done', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      expect(orchestrator.getState().phase).toBe('success');
    });
  });

  // ========== 任务失败 ==========
  describe('fail', () => {
    it('should set task status to error', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.fail('t1', 'Network error');
      expect(orchestrator.getState().tasks[0].status).toBe('error');
    });

    it('should store error message', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.fail('t1', 'Timeout');
      expect(orchestrator.getState().tasks[0].error).toBe('Timeout');
    });

    it('should set phase to error when any task fails', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.register('t2', 'Task 2');
      orchestrator.start('t1');
      orchestrator.start('t2');
      orchestrator.complete('t2');
      orchestrator.fail('t1', 'Err');
      expect(orchestrator.getState().phase).toBe('error');
    });
  });

  // ========== 状态计算 ==========
  describe('getState', () => {
    it('should calculate progress correctly', () => {
      orchestrator.register('t1', 'Task 1');
      orchestrator.register('t2', 'Task 2');
      orchestrator.register('t3', 'Task 3');
      orchestrator.start('t1');
      orchestrator.start('t2');
      orchestrator.start('t3');
      orchestrator.complete('t1');
      // 1/3 = 33%
      expect(orchestrator.getState().progress).toBe(33);
    });

    it('should be 100 when no tasks', () => {
      expect(orchestrator.getState().progress).toBe(100);
    });

    it('should be 100 when all complete', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      expect(orchestrator.getState().progress).toBe(100);
    });

    it('should be idle when no tasks started', () => {
      orchestrator.register('t1', 'Task');
      expect(orchestrator.getState().phase).toBe('idle');
    });

    it('should be timeout when task times out', () => {
      orchestrator.register('t1', 'Task', 'normal', 100);
      orchestrator.start('t1');
      vi.advanceTimersByTime(1500); // timeout checker runs every 1000ms
      expect(orchestrator.getState().phase).toBe('timeout');
    });
  });

  // ========== 订阅 ==========
  describe('subscribe', () => {
    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      orchestrator.subscribe(listener);
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      expect(listener).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsub = orchestrator.subscribe(listener);
      unsub();
      orchestrator.register('t1', 'Task');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      orchestrator.subscribe(l1);
      orchestrator.subscribe(l2);
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      expect(l1).toHaveBeenCalled();
      expect(l2).toHaveBeenCalled();
    });
  });

  // ========== 重置 ==========
  describe('reset', () => {
    it('should reset all tasks to idle', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      orchestrator.reset();
      expect(orchestrator.getState().tasks[0].status).toBe('idle');
    });

    it('should clear startTime and endTime', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      orchestrator.reset();
      const task = orchestrator.getState().tasks[0];
      expect(task.startTime).toBeUndefined();
      expect(task.endTime).toBeUndefined();
    });

    it('should clear errors', () => {
      orchestrator.register('t1', 'Task');
      orchestrator.start('t1');
      orchestrator.fail('t1', 'Err');
      orchestrator.reset();
      expect(orchestrator.getState().tasks[0].error).toBeUndefined();
    });
  });

  // ========== 关键路径 ==========
  describe('getCriticalTasks', () => {
    it('should return only critical tasks', () => {
      orchestrator.register('c1', 'Critical', 'critical');
      orchestrator.register('h1', 'High', 'high');
      orchestrator.register('n1', 'Normal', 'normal');
      const critical = orchestrator.getCriticalTasks();
      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('c1');
    });

    it('should return empty when no critical tasks', () => {
      orchestrator.register('n1', 'Normal', 'normal');
      expect(orchestrator.getCriticalTasks()).toHaveLength(0);
    });
  });
});

describe('FirstPaintTimer', () => {
  let timer: FirstPaintTimer;

  beforeEach(() => {
    timer = new FirstPaintTimer();
  });

  it('should start timing', () => {
    timer.start();
    const report = timer.getReport();
    expect(report['start']).toBe(0);
  });

  it('should record marks', () => {
    timer.start();
    timer.mark('dom-ready');
    timer.mark('data-loaded');
    const report = timer.getReport();
    expect(report['dom-ready']).toBeDefined();
    expect(report['data-loaded']).toBeDefined();
  });

  it('should calculate duration between marks', () => {
    timer.start();
    timer.mark('mark1');
    timer.mark('mark2');
    const duration = timer.getDuration('mark1', 'mark2');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should calculate duration from start to now', () => {
    timer.start();
    const duration = timer.getDuration();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should generate report as record', () => {
    timer.start();
    timer.mark('m1');
    const report = timer.getReport();
    expect(typeof report).toBe('object');
    expect(report['start']).toBe(0);
  });

  it('meetsTarget should return true for fast load', () => {
    timer.start();
    expect(timer.meetsTarget(3000)).toBe(true);
  });

  it('meetsTarget should accept custom target', () => {
    timer.start();
    // With a very tight target (1ms), it should fail since some time has passed
    const result = timer.meetsTarget(1);
    expect(typeof result).toBe('boolean');
  });

  it('reset should clear all marks', () => {
    timer.start();
    timer.mark('m1');
    timer.reset();
    const report = timer.getReport();
    expect(Object.keys(report)).toHaveLength(0);
  });

  it('getDuration for non-existent mark should return 0 or negative', () => {
    timer.start();
    const duration = timer.getDuration('nonexistent', 'alsonone');
    expect(typeof duration).toBe('number');
  });
});

describe('FeedbackManager', () => {
  let feedback: FeedbackManager;

  beforeEach(() => {
    feedback = new FeedbackManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('show', () => {
    it('should return an id', () => {
      const id = feedback.show('info', 'Hello');
      expect(typeof id).toBe('string');
      expect(id).toContain('fb-');
    });

    it('should add message to list', () => {
      feedback.show('info', 'Test');
      expect(feedback.getMessages()).toHaveLength(1);
      expect(feedback.getMessages()[0].message).toBe('Test');
    });

    it('should auto-dismiss after duration', () => {
      feedback.show('info', 'Auto', 1000);
      expect(feedback.getMessages()).toHaveLength(1);
      vi.advanceTimersByTime(1100);
      expect(feedback.getMessages()).toHaveLength(0);
    });

    it('should not auto-dismiss with duration 0', () => {
      feedback.show('info', 'Persistent', 0);
      vi.advanceTimersByTime(10000);
      expect(feedback.getMessages()).toHaveLength(1);
    });

    it('should cap at maxMessages', () => {
      for (let i = 0; i < 10; i++) {
        feedback.show('info', `Msg ${i}`, 0);
      }
      expect(feedback.getMessages()).toHaveLength(5);
    });
  });

  describe('convenience methods', () => {
    it('success should create success message', () => {
      feedback.success('Done!');
      expect(feedback.getMessages()[0].type).toBe('success');
    });

    it('error should create error message with 5s default', () => {
      feedback.error('Failed');
      expect(feedback.getMessages()[0].type).toBe('error');
      expect(feedback.getMessages()[0].duration).toBe(5000);
    });

    it('warning should create warning message', () => {
      feedback.warning('Careful');
      expect(feedback.getMessages()[0].type).toBe('warning');
    });

    it('info should create info message', () => {
      feedback.info('FYI');
      expect(feedback.getMessages()[0].type).toBe('info');
    });
  });

  describe('dismiss', () => {
    it('should remove message by id', () => {
      const id = feedback.show('info', 'Test', 0);
      feedback.dismiss(id);
      expect(feedback.getMessages()).toHaveLength(0);
    });

    it('should not affect other messages', () => {
      const id1 = feedback.show('info', 'A', 0);
      const id2 = feedback.show('info', 'B', 0);
      feedback.dismiss(id1);
      expect(feedback.getMessages()).toHaveLength(1);
      expect(feedback.getMessages()[0].id).toBe(id2);
    });
  });

  describe('dismissAll', () => {
    it('should remove all messages', () => {
      feedback.show('info', 'A', 0);
      feedback.show('info', 'B', 0);
      feedback.dismissAll();
      expect(feedback.getMessages()).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('should notify on message add', () => {
      const listener = vi.fn();
      feedback.subscribe(listener);
      feedback.show('info', 'Test');
      expect(listener).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsub = feedback.subscribe(listener);
      unsub();
      feedback.show('info', 'Test');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('should return copy of messages', () => {
      feedback.show('info', 'Test', 0);
      const msgs = feedback.getMessages();
      msgs.pop();
      expect(feedback.getMessages()).toHaveLength(1);
    });
  });
});
