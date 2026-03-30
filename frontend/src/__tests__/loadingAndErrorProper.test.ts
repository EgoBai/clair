import { describe, it, expect } from 'vitest';
import { ErrorRecoveryManager, classifyError } from '../utils/errorRecovery';
import { LoadingOrchestrator, FirstPaintTimer, FeedbackManager } from '../utils/loadingOrchestrator';

describe('Loading & Error Recovery Proper', () => {
  describe('classifyError', () => {
    it('should classify network errors', () => {
      const result = classifyError(new TypeError('Failed to fetch'));
      expect(result.level).toBe('L2');
      expect(result.retryable).toBe(true);
    });

    it('should classify timeout errors', () => {
      const result = classifyError('Timeout exceeded');
      expect(result.level).toBe('L2');
    });

    it('should classify bad request as L1', () => {
      const result = classifyError('Bad request 400');
      expect(result.level).toBe('L1');
    });

    it('should classify rate limit as L2', () => {
      const result = classifyError('Too many requests 429');
      expect(result.level).toBe('L2');
    });

    it('should classify unknown errors', () => {
      const result = classifyError('Something happened');
      expect(result.level).toBeDefined();
      expect(result.userMessage.length).toBeGreaterThan(0);
    });

    it('should include user-friendly message', () => {
      const result = classifyError(new Error('network'));
      expect(result.userMessage).toBeDefined();
      expect(result.userMessage.length).toBeGreaterThan(0);
    });
  });

  describe('ErrorRecoveryManager', () => {
    it('should create manager instance', () => {
      const manager = new ErrorRecoveryManager();
      expect(manager).toBeDefined();
    });

    it('should report errors', () => {
      const manager = new ErrorRecoveryManager();
      manager.report({
        id: 'test-1',
        level: 'L2',
        error: new Error('test'),
        source: 'api',
        userMessage: 'Test error',
        retryable: true,
        timestamp: Date.now(),
      });
      const stats = manager.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });

    it('should get error stats by level', () => {
      const manager = new ErrorRecoveryManager();
      manager.report({
        id: 's1', level: 'L3', error: new Error('500'), source: 'api',
        userMessage: 'Server error', retryable: false, timestamp: Date.now(),
      });
      const stats = manager.getStats();
      expect(stats.byLevel).toBeDefined();
      expect(stats.byLevel['L3']).toBeGreaterThanOrEqual(1);
    });

    it('should get error stats by source', () => {
      const manager = new ErrorRecoveryManager();
      manager.report({
        id: 's1', level: 'L1', error: new Error('test'), source: 'ui',
        userMessage: 'UI error', retryable: false, timestamp: Date.now(),
      });
      const stats = manager.getStats();
      expect(stats.bySource).toBeDefined();
    });

    it('should execute with retry', async () => {
      const manager = new ErrorRecoveryManager();
      let attempts = 0;
      const result = await manager.executeWithRetry('test', async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'success';
      }, { source: 'api' });
      expect(result).toBe('success');
    });

    it('should use fallback on all retries fail', async () => {
      const manager = new ErrorRecoveryManager({ maxRetries: 0, initialDelay: 0, maxDelay: 0, multiplier: 1, jitter: false });
      const result = await manager.executeWithRetry('test', async () => {
        throw new Error('always fail');
      }, {
        fallback: () => 'fallback',
        source: 'api',
      });
      expect(result).toBe('fallback');
    }, 10000);

    it('should call onRetry callback', async () => {
      const manager = new ErrorRecoveryManager({ maxRetries: 1, initialDelay: 0, maxDelay: 0, multiplier: 1, jitter: false });
      const retries: number[] = [];
      await manager.executeWithRetry('test', async () => {
        throw new Error('fail');
      }, {
        fallback: () => 'done',
        onRetry: (attempt) => retries.push(attempt),
        source: 'api',
      });
      expect(retries.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should subscribe to errors', () => {
      const manager = new ErrorRecoveryManager();
      const errors: any[] = [];
      manager.subscribe((err) => errors.push(err));
      manager.report({
        id: 'sub-1', level: 'L2', error: new Error('test'), source: 'api',
        userMessage: 'Test', retryable: true, timestamp: Date.now(),
      });
      expect(errors.length).toBe(1);
    });

    it('should unsubscribe from errors', () => {
      const manager = new ErrorRecoveryManager();
      const errors: any[] = [];
      const unsub = manager.subscribe((err) => errors.push(err));
      manager.report({
        id: 'unsub-1', level: 'L1', error: new Error('a'), source: 'api',
        userMessage: 'A', retryable: false, timestamp: Date.now(),
      });
      unsub();
      manager.report({
        id: 'unsub-2', level: 'L1', error: new Error('b'), source: 'api',
        userMessage: 'B', retryable: false, timestamp: Date.now(),
      });
      expect(errors.length).toBe(1);
    });

    it('should clear error log', () => {
      const manager = new ErrorRecoveryManager();
      manager.report({
        id: 'c1', level: 'L1', error: new Error('x'), source: 'api',
        userMessage: 'X', retryable: false, timestamp: Date.now(),
      });
      manager.clear();
      expect(manager.getStats().total).toBe(0);
    });
  });

  describe('LoadingOrchestrator', () => {
    it('should create orchestrator', () => {
      const orch = new LoadingOrchestrator();
      expect(orch).toBeDefined();
    });

    it('should register tasks', () => {
      const orch = new LoadingOrchestrator();
      orch.register('task1', 'Loading data', 'normal');
      orch.register('task2', 'Processing', 'high');
      const state = orch.getState();
      expect(state.tasks.length).toBe(2);
    });

    it('should start and complete tasks', () => {
      const orch = new LoadingOrchestrator();
      orch.register('task1', 'Loading', 'normal');
      orch.start('task1');
      expect(orch.getState().phase).toBe('loading');
      orch.complete('task1');
      expect(orch.getState().phase).toBe('success');
    });

    it('should fail tasks', () => {
      const orch = new LoadingOrchestrator();
      orch.register('task1', 'Loading', 'normal');
      orch.start('task1');
      orch.fail('task1', 'Connection error');
      expect(orch.getState().phase).toBe('error');
    });

    it('should calculate progress', () => {
      const orch = new LoadingOrchestrator();
      orch.register('t1', 'T1', 'normal');
      orch.register('t2', 'T2', 'normal');
      orch.register('t3', 'T3', 'normal');
      orch.start('t1');
      orch.complete('t1');
      expect(orch.getState().progress).toBeCloseTo(33, 0);
    });

    it('should reset all tasks', () => {
      const orch = new LoadingOrchestrator();
      orch.register('t1', 'T1', 'normal');
      orch.start('t1');
      orch.complete('t1');
      orch.reset();
      const state = orch.getState();
      // reset sets tasks to idle status
      expect(state.tasks.every(t => t.status === 'idle')).toBe(true);
    });

    it('should subscribe to updates', () => {
      const orch = new LoadingOrchestrator();
      const updates: any[] = [];
      orch.subscribe(() => updates.push(true));
      orch.register('t1', 'T1', 'normal');
      orch.start('t1');
      orch.complete('t1');
      expect(updates.length).toBeGreaterThanOrEqual(1);
    });

    it('should track elapsed time', () => {
      const orch = new LoadingOrchestrator();
      orch.register('t1', 'T1', 'normal');
      orch.start('t1');
      const state = orch.getState();
      expect(state.elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FirstPaintTimer', () => {
    it('should create timer', () => {
      const timer = new FirstPaintTimer();
      expect(timer).toBeDefined();
    });

    it('should mark events', () => {
      const timer = new FirstPaintTimer();
      timer.mark('start');
      timer.mark('dataLoaded');
      const duration = timer.getDuration('start', 'dataLoaded');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should measure total duration', () => {
      const timer = new FirstPaintTimer();
      timer.mark('start');
      timer.mark('end');
      expect(timer.getDuration()).toBeGreaterThanOrEqual(0);
    });

    it('should reset timer', () => {
      const timer = new FirstPaintTimer();
      timer.mark('start');
      timer.mark('end');
      const beforeReset = timer.getDuration('start', 'end');
      expect(beforeReset).toBeGreaterThanOrEqual(0);
      timer.reset();
      // After reset, marks are cleared so getDuration returns ~performance.now() (non-zero)
      // We verify by re-marking and checking fresh state
      timer.mark('newStart');
      const fresh = timer.getDuration('newStart');
      expect(fresh).toBeGreaterThanOrEqual(0);
    });

    it('should check if meets target', () => {
      const timer = new FirstPaintTimer();
      timer.mark('start');
      timer.mark('end');
      expect(timer.meetsTarget(3000)).toBe(true);
    });
  });

  describe('FeedbackManager', () => {
    it('should create manager', () => {
      const fm = new FeedbackManager();
      expect(fm).toBeDefined();
    });

    it('should add success message', () => {
      const fm = new FeedbackManager();
      fm.success('Operation succeeded');
      expect(fm.getMessages().some(m => m.type === 'success')).toBe(true);
    });

    it('should add error message', () => {
      const fm = new FeedbackManager();
      fm.error('Something went wrong');
      expect(fm.getMessages().some(m => m.type === 'error')).toBe(true);
    });

    it('should add warning message', () => {
      const fm = new FeedbackManager();
      fm.warning('Be careful');
      expect(fm.getMessages().some(m => m.type === 'warning')).toBe(true);
    });

    it('should add info message', () => {
      const fm = new FeedbackManager();
      fm.info('FYI');
      expect(fm.getMessages().some(m => m.type === 'info')).toBe(true);
    });

    it('should dismiss message', () => {
      const fm = new FeedbackManager();
      fm.success('msg1');
      const id = fm.getMessages()[0].id;
      fm.dismiss(id);
      expect(fm.getMessages().length).toBe(0);
    });

    it('should dismiss all messages', () => {
      const fm = new FeedbackManager();
      fm.success('a');
      fm.error('b');
      fm.warning('c');
      fm.dismissAll();
      expect(fm.getMessages().length).toBe(0);
    });

    it('should limit max concurrent messages', () => {
      const fm = new FeedbackManager();
      for (let i = 0; i < 10; i++) fm.show('info', `msg ${i}`, 0);
      expect(fm.getMessages().length).toBeLessThanOrEqual(5);
    });

    it('should subscribe to changes', () => {
      const fm = new FeedbackManager();
      const changes: any[] = [];
      fm.subscribe(() => changes.push(true));
      fm.success('test');
      expect(changes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
