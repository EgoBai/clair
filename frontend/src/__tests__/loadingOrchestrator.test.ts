import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LoadingOrchestrator,
  FirstPaintTimer,
  FeedbackManager,
} from '../utils/loadingOrchestrator';

/**
 * 加载编排器测试（导入真实模块）
 */

describe('Loading Orchestrator（真实模块）', () => {
  let orch: LoadingOrchestrator;

  beforeEach(() => {
    orch = new LoadingOrchestrator();
  });

  describe('任务生命周期', () => {
    it('register 后应处于 idle', () => {
      orch.register('t1', '加载股票数据', 'high');
      const state = orch.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].label).toBe('加载股票数据');
      expect(state.tasks[0].status).toBe('idle');
      expect(state.phase).toBe('idle');
    });

    it('start 后应处于 loading', () => {
      orch.register('t1', 'Task 1');
      orch.start('t1');
      const state = orch.getState();
      expect(state.tasks[0].status).toBe('loading');
      expect(state.phase).toBe('loading');
    });

    it('complete 后状态为 success 且进度 100', () => {
      orch.register('t1', 'Task 1');
      orch.start('t1');
      orch.complete('t1');
      const state = orch.getState();
      expect(state.tasks[0].status).toBe('success');
      expect(state.phase).toBe('success');
      expect(state.progress).toBe(100);
    });

    it('fail 后状态为 error', () => {
      orch.register('t1', 'Task 1');
      orch.start('t1');
      orch.fail('t1', 'Network error');
      const state = orch.getState();
      expect(state.tasks[0].status).toBe('error');
      expect(state.tasks[0].error).toBe('Network error');
      expect(state.phase).toBe('error');
    });
  });

  describe('subscribe', () => {
    it('start 时应通知订阅者', () => {
      orch.register('t1', 'Task 1');
      const seen: string[] = [];
      orch.subscribe(state => seen.push(state.phase));
      orch.start('t1');
      expect(seen).toContain('loading');
    });
  });

  describe('reset', () => {
    it('应清空任务状态', () => {
      orch.register('t1', 'Task 1');
      orch.start('t1');
      orch.reset();
      const state = orch.getState();
      expect(state.phase).toBe('idle');
      expect(state.tasks[0].status).toBe('idle');
    });
  });

  describe('critical tasks', () => {
    it('getCriticalTasks 返回 priority=critical 的任务', () => {
      orch.register('c1', '关键任务', 'critical');
      orch.register('n1', '普通任务', 'normal');
      const critical = orch.getCriticalTasks();
      expect(critical).toHaveLength(1);
      expect(critical[0].id).toBe('c1');
    });
  });
});

describe('FirstPaintTimer（真实模块）', () => {
  it('start/mark/getDuration 应记录耗时', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    timer.mark('dataReady');
    expect(timer.getDuration()).toBeGreaterThanOrEqual(0);
    expect(timer.getDuration('start', 'dataReady')).toBeGreaterThanOrEqual(0);
    expect(typeof timer.meetsTarget()).toBe('boolean');
    expect(timer.getReport()).toHaveProperty('dataReady');
  });
});

describe('FeedbackManager（真实模块）', () => {
  let fm: FeedbackManager;
  beforeEach(() => {
    fm = new FeedbackManager();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('show 应返回 id 并加入消息列表', () => {
    const id = fm.show('success', '完成');
    expect(typeof id).toBe('string');
    expect(fm.getMessages()).toHaveLength(1);
    expect(fm.getMessages()[0].type).toBe('success');
  });

  it('success/error/warning/info 便捷方法', () => {
    fm.success('ok');
    fm.error('err');
    fm.warning('warn');
    fm.info('info');
    expect(fm.getMessages()).toHaveLength(4);
  });

  it('dismiss / dismissAll', () => {
    const id = fm.show('info', '临时');
    expect(fm.getMessages()).toHaveLength(1);
    fm.dismiss(id);
    expect(fm.getMessages()).toHaveLength(0);
    fm.show('info', 'a');
    fm.show('info', 'b');
    fm.dismissAll();
    expect(fm.getMessages()).toHaveLength(0);
  });
});
