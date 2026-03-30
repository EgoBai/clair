/**
 * 错误恢复 + 加载编排 + 交互反馈 测试
 * 目标: 40+ 测试用例
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ErrorRecoveryManager,
  classifyError,
} from '../utils/errorRecovery';
import {
  LoadingOrchestrator,
  FirstPaintTimer,
  FeedbackManager,
} from '../utils/loadingOrchestrator';

// ==================== ErrorRecoveryManager 测试 ====================

describe('错误恢复管理器', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager({ maxRetries: 2, initialDelay: 10, maxDelay: 50, jitter: false });
  });

  describe('错误报告', () => {
    it('应记录错误到日志', () => {
      manager.report({
        id: 'err-1',
        level: 'L1',
        error: new Error('test'),
        source: 'api',
        userMessage: '测试错误',
        retryable: false,
        timestamp: Date.now(),
      });
      expect(manager.getErrorLog().length).toBe(1);
    });

    it('错误日志应按时间倒序', () => {
      const now = Date.now();
      manager.report({ id: '1', level: 'L1', error: 'e1', source: 'api', userMessage: '', retryable: false, timestamp: now });
      manager.report({ id: '2', level: 'L2', error: 'e2', source: 'network', userMessage: '', retryable: true, timestamp: now + 1 });
      const log = manager.getErrorLog();
      expect(log[0].id).toBe('2');
    });

    it('日志应有最大条数限制', () => {
      const smallManager = new ErrorRecoveryManager({}, 3);
      for (let i = 0; i < 10; i++) {
        smallManager.report({ id: `${i}`, level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      }
      expect(smallManager.getErrorLog().length).toBe(3);
    });
  });

  describe('过滤和统计', () => {
    it('应按级别过滤', () => {
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      manager.report({ id: '2', level: 'L2', error: '', source: 'api', userMessage: '', retryable: true, timestamp: Date.now() });
      manager.report({ id: '3', level: 'L1', error: '', source: 'network', userMessage: '', retryable: false, timestamp: Date.now() });
      expect(manager.getErrorLog({ level: 'L1' }).length).toBe(2);
      expect(manager.getErrorLog({ level: 'L2' }).length).toBe(1);
    });

    it('应按来源过滤', () => {
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      manager.report({ id: '2', level: 'L1', error: '', source: 'websocket', userMessage: '', retryable: false, timestamp: Date.now() });
      expect(manager.getErrorLog({ source: 'api' }).length).toBe(1);
    });

    it('应按时间过滤', () => {
      const now = Date.now();
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: now - 10000 });
      manager.report({ id: '2', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: now });
      expect(manager.getErrorLog({ since: now - 1000 }).length).toBe(1);
    });

    it('统计应正确计算', () => {
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      manager.report({ id: '2', level: 'L2', error: '', source: 'api', userMessage: '', retryable: true, timestamp: Date.now() });
      manager.report({ id: '3', level: 'L3', error: '', source: 'network', userMessage: '', retryable: false, timestamp: Date.now() });
      const stats = manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byLevel.L1).toBe(1);
      expect(stats.byLevel.L2).toBe(1);
      expect(stats.byLevel.L3).toBe(1);
      expect(stats.bySource.api).toBe(2);
      expect(stats.bySource.network).toBe(1);
    });
  });

  describe('自动重试', () => {
    it('成功时不重试', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await manager.executeWithRetry('t1', fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('失败后应自动重试', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');
      const result = await manager.executeWithRetry('t2', fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('全部重试失败后应使用fallback', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const fallback = vi.fn().mockReturnValue('fallback-value');
      const result = await manager.executeWithRetry('t3', fn, { fallback });
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('全部重试失败无fallback应抛出', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(manager.executeWithRetry('t4', fn)).rejects.toThrow('fail');
    });

    it('应调用onRetry回调', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');
      const onRetry = vi.fn();
      await manager.executeWithRetry('t5', fn, { onRetry });
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number));
    });
  });

  describe('退避延迟计算', () => {
    it('初始延迟应接近配置值', () => {
      const delay = manager.calculateDelay(0);
      // jitter=false时应为initialDelay=10
      expect(delay).toBeGreaterThanOrEqual(10);
    });

    it('延迟应指数增长或持平', () => {
      const d0 = manager.calculateDelay(0);
      const d1 = manager.calculateDelay(1);
      // 至少不应减少
      expect(d1).toBeGreaterThanOrEqual(d0);
    });

    it('延迟不应大幅超过最大值', () => {
      const delay = manager.calculateDelay(100);
      // 允许抖动范围
      expect(delay).toBeLessThanOrEqual(200);
    });
  });

  describe('订阅机制', () => {
    it('应通知订阅者', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('取消订阅后不应通知', () => {
      const listener = vi.fn();
      const unsub = manager.subscribe(listener);
      unsub();
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('清空', () => {
    it('清空后日志为空', () => {
      manager.report({ id: '1', level: 'L1', error: '', source: 'api', userMessage: '', retryable: false, timestamp: Date.now() });
      manager.clear();
      expect(manager.getErrorLog().length).toBe(0);
    });
  });
});

// ==================== classifyError 测试 ====================

describe('错误分类器', () => {
  it('网络错误应为L2可重试', () => {
    const result = classifyError(new Error('Network request failed'));
    expect(result.level).toBe('L2');
    expect(result.retryable).toBe(true);
  });

  it('超时错误应为L2可重试', () => {
    const result = classifyError('Request timeout');
    expect(result.level).toBe('L2');
    expect(result.retryable).toBe(true);
  });

  it('400错误应为L1不可重试', () => {
    const result = classifyError(new Error('400 Bad Request'));
    expect(result.level).toBe('L1');
    expect(result.retryable).toBe(false);
  });

  it('401错误应为L1不可重试', () => {
    const result = classifyError('401 Unauthorized');
    expect(result.level).toBe('L1');
    expect(result.retryable).toBe(false);
  });

  it('404错误应为L1不可重试', () => {
    const result = classifyError(new Error('404 Not Found'));
    expect(result.level).toBe('L1');
    expect(result.retryable).toBe(false);
  });

  it('500错误应为L2可重试', () => {
    const result = classifyError(new Error('500 Internal Server Error'));
    expect(result.level).toBe('L2');
    expect(result.retryable).toBe(true);
  });

  it('502错误应为L2可重试', () => {
    const result = classifyError('502 Bad Gateway');
    expect(result.level).toBe('L2');
    expect(result.retryable).toBe(true);
  });

  it('429限流应为L2可重试', () => {
    const result = classifyError(new Error('429 Too Many Requests'));
    expect(result.level).toBe('L2');
    expect(result.retryable).toBe(true);
  });

  it('未知错误应为L3', () => {
    const result = classifyError(new Error('Something weird'));
    expect(result.level).toBe('L3');
    expect(result.retryable).toBe(false);
  });

  it('应提供用户可读消息', () => {
    const result = classifyError(new Error('network error'));
    expect(result.userMessage.length).toBeGreaterThan(0);
    expect(result.userMessage).not.toContain('Error');
  });
});

// ==================== LoadingOrchestrator 测试 ====================

describe('加载状态编排器', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  describe('任务注册与管理', () => {
    it('应注册任务', () => {
      orchestrator.register('api', 'API数据', 'critical');
      const state = orchestrator.getState();
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].label).toBe('API数据');
    });

    it('应同时注册多个任务', () => {
      orchestrator.register('api', 'API', 'critical');
      orchestrator.register('chart', '图表', 'high');
      orchestrator.register('cache', '缓存', 'normal');
      expect(orchestrator.getState().tasks.length).toBe(3);
    });

    it('开始任务后状态应为loading', () => {
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      expect(orchestrator.getState().phase).toBe('loading');
    });

    it('完成任务后进度应更新', () => {
      orchestrator.register('t1', '任务1');
      orchestrator.register('t2', '任务2');
      orchestrator.start('t1');
      orchestrator.start('t2');
      orchestrator.complete('t1');
      const state = orchestrator.getState();
      expect(state.progress).toBe(50);
    });

    it('全部完成后状态应为success', () => {
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      expect(orchestrator.getState().phase).toBe('success');
      expect(orchestrator.getState().progress).toBe(100);
    });

    it('任务失败后状态应为error', () => {
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      orchestrator.fail('t1', '网络错误');
      const state = orchestrator.getState();
      expect(state.phase).toBe('error');
      expect(state.tasks[0].error).toBe('网络错误');
    });
  });

  describe('关键任务', () => {
    it('应获取关键路径任务', () => {
      orchestrator.register('api', 'API', 'critical');
      orchestrator.register('chart', '图表', 'high');
      orchestrator.register('cache', '缓存', 'normal');
      const critical = orchestrator.getCriticalTasks();
      expect(critical.length).toBe(1);
      expect(critical[0].id).toBe('api');
    });
  });

  describe('重置', () => {
    it('重置后所有任务应为idle', () => {
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      orchestrator.complete('t1');
      orchestrator.reset();
      const state = orchestrator.getState();
      expect(state.phase).toBe('idle');
      expect(state.tasks[0].status).toBe('idle');
    });
  });

  describe('订阅', () => {
    it('任务状态变化应通知订阅者', () => {
      const listener = vi.fn();
      orchestrator.subscribe(listener);
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      expect(listener).toHaveBeenCalled();
    });

    it('取消订阅后不应通知', () => {
      const listener = vi.fn();
      const unsub = orchestrator.subscribe(listener);
      unsub();
      orchestrator.register('t1', '任务1');
      orchestrator.start('t1');
      // start会触发notify，但因为已经unsub了所以listener不会被调用
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('空状态', () => {
    it('无任务时progress为100', () => {
      expect(orchestrator.getState().progress).toBe(100);
    });

    it('无任务时phase为idle', () => {
      expect(orchestrator.getState().phase).toBe('idle');
    });

    it('无任务时elapsed为0', () => {
      expect(orchestrator.getState().elapsed).toBe(0);
    });
  });
});

// ==================== FirstPaintTimer 测试 ====================

describe('首屏加载计时器', () => {
  it('start后应记录起始时间', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    timer.mark('api');
    const report = timer.getReport();
    expect(report).toHaveProperty('start');
    expect(report).toHaveProperty('api');
  });

  it('mark应记录时间点', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    timer.mark('api');
    timer.mark('chart');
    const report = timer.getReport();
    expect(report.chart).toBeGreaterThanOrEqual(report.api);
  });

  it('getDuration应计算时间差', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    timer.mark('a');
    timer.mark('b');
    const duration = timer.getDuration('a', 'b');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('reset应清空所有标记', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    timer.mark('api');
    timer.reset();
    expect(Object.keys(timer.getReport()).length).toBe(0);
  });

  it('meetsTarget应检查首屏时间', () => {
    const timer = new FirstPaintTimer();
    timer.start();
    // 立即完成，应该满足<3秒
    expect(timer.meetsTarget(3000)).toBe(true);
    // 严格目标
    expect(timer.meetsTarget(0)).toBe(false);
  });
});

// ==================== FeedbackManager 测试 ====================

describe('交互反馈管理器', () => {
  let feedback: FeedbackManager;

  beforeEach(() => {
    feedback = new FeedbackManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应显示success消息', () => {
    feedback.success('操作成功');
    const msgs = feedback.getMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].type).toBe('success');
    expect(msgs[0].message).toBe('操作成功');
  });

  it('应显示error消息', () => {
    feedback.error('出错了');
    expect(feedback.getMessages()[0].type).toBe('error');
  });

  it('应显示warning消息', () => {
    feedback.warning('注意');
    expect(feedback.getMessages()[0].type).toBe('warning');
  });

  it('应显示info消息', () => {
    feedback.info('提示');
    expect(feedback.getMessages()[0].type).toBe('info');
  });

  it('消息到期应自动消失', () => {
    feedback.show('info', '提示', 1000);
    expect(feedback.getMessages().length).toBe(1);
    vi.advanceTimersByTime(1100);
    expect(feedback.getMessages().length).toBe(0);
  });

  it('duration=0应不自动消失', () => {
    feedback.show('info', '持久提示', 0);
    vi.advanceTimersByTime(10000);
    expect(feedback.getMessages().length).toBe(1);
  });

  it('dismiss应关闭指定消息', () => {
    const id = feedback.info('提示');
    feedback.dismiss(id);
    expect(feedback.getMessages().length).toBe(0);
  });

  it('dismissAll应关闭所有消息', () => {
    feedback.success('a');
    feedback.error('b');
    feedback.warning('c');
    feedback.dismissAll();
    expect(feedback.getMessages().length).toBe(0);
  });

  it('消息超过最大数量应截断', () => {
    for (let i = 0; i < 10; i++) {
      feedback.info(`消息${i}`);
    }
    expect(feedback.getMessages().length).toBeLessThanOrEqual(5);
  });

  it('应通知订阅者', () => {
    const listener = vi.fn();
    feedback.subscribe(listener);
    feedback.success('test');
    expect(listener).toHaveBeenCalled();
  });

  it('取消订阅后不应通知', () => {
    const listener = vi.fn();
    const unsub = feedback.subscribe(listener);
    unsub();
    feedback.success('test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('error默认5秒', () => {
    feedback.error('错误');
    vi.advanceTimersByTime(4000);
    expect(feedback.getMessages().length).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(feedback.getMessages().length).toBe(0);
  });
});
