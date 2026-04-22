import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../utils/logger';

describe('结构化日志工具', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('应该创建带模块名的logger实例', () => {
      const logger = createLogger('TestModule');
      expect(logger).toBeDefined();
    });
  });

  describe('info', () => {
    it('应该输出info级别日志', () => {
      const logger = createLogger('Test');
      logger.info('测试消息');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('[Test]');
      expect(logSpy.mock.calls[0][0]).toContain('测试消息');
    });

    it('应该包含上下文对象', () => {
      const logger = createLogger('Test');
      logger.info('测试', { key: 'value' });
      expect(logSpy.mock.calls[0][0]).toContain('"key":"value"');
    });
  });

  describe('debug', () => {
    it('应该输出debug级别日志', () => {
      const logger = createLogger('Test');
      logger.debug('调试消息');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('调试消息');
    });
  });

  describe('warn', () => {
    it('应该使用console.warn输出', () => {
      const logger = createLogger('Test');
      logger.warn('警告消息');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('警告消息');
    });
  });

  describe('error', () => {
    it('应该使用console.error输出', () => {
      const logger = createLogger('Test');
      logger.error('错误消息');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('错误消息');
    });

    it('应该提取Error对象的message和stack', () => {
      const logger = createLogger('Test');
      const err = new Error('测试错误');
      logger.error('出错了', err);
      const output = errorSpy.mock.calls[0][0];
      expect(output).toContain('测试错误');
      expect(output).toContain('stack');
    });

    it('应该处理非Error对象', () => {
      const logger = createLogger('Test');
      logger.error('出错了', '字符串错误');
      const output = errorSpy.mock.calls[0][0];
      expect(output).toContain('字符串错误');
    });

    it('应该合并额外上下文', () => {
      const logger = createLogger('Test');
      logger.error('出错了', new Error('boom'), { userId: 42 });
      const output = errorSpy.mock.calls[0][0];
      expect(output).toContain('"userId":42');
    });
  });

  describe('日志格式', () => {
    it('应该包含ISO时间戳', () => {
      const logger = createLogger('Test');
      logger.info('消息');
      const output = logSpy.mock.calls[0][0];
      // ISO format: 2026-04-22T...
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('应该包含模块名', () => {
      const logger = createLogger('MyModule');
      logger.info('消息');
      expect(logSpy.mock.calls[0][0]).toContain('[MyModule]');
    });
  });
});
