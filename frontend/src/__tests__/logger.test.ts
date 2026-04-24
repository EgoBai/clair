import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock import.meta.env before importing logger
vi.stubGlobal('import', {
  meta: { env: { DEV: false } },
});

const originalConsole = { ...console };
const env = import.meta.env as Record<string, boolean>;

describe('logger (production)', () => {
  beforeEach(() => {
    env.DEV = false;
    vi.clearAllMocks();
  });

  it('should suppress debug in production', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logger: prodLogger } = await import('../utils/logger');
    prodLogger.debug('test debug');
    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('should suppress log in production', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger: prodLogger } = await import('../utils/logger');
    prodLogger.log('test log');
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should emit warn in production', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logger: prodLogger } = await import('../utils/logger');
    prodLogger.warn('test warn');
    expect(warnSpy).toHaveBeenCalledWith('test warn');
    warnSpy.mockRestore();
  });

  it('should emit error in production', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger: prodLogger } = await import('../utils/logger');
    prodLogger.error('test error');
    expect(errorSpy).toHaveBeenCalledWith('test error');
    errorSpy.mockRestore();
  });

  it('should not emit perf warning in production', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: false } } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logger: prodLogger } = await import('../utils/logger');
    prodLogger.perf('test perf', 100, 16);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('logger (development)', () => {
  beforeEach(() => {
    env.DEV = true;
    vi.clearAllMocks();
  });

  it('should emit debug in dev', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: true } } });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logger: devLogger } = await import('../utils/logger');
    devLogger.debug('dev debug msg');
    expect(debugSpy).toHaveBeenCalledWith('dev debug msg');
    debugSpy.mockRestore();
  });

  it('should emit log in dev', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: true } } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger: devLogger } = await import('../utils/logger');
    devLogger.log('dev log msg');
    expect(logSpy).toHaveBeenCalledWith('dev log msg');
    logSpy.mockRestore();
  });

  it('should emit perf warning when over threshold in dev', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: true } } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logger: devLogger } = await import('../utils/logger');
    devLogger.perf('slow-op', 100, 16);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Perf] slow-op: 100.0ms (>16ms)')
    );
    warnSpy.mockRestore();
  });

  it('should not emit perf warning when under threshold in dev', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: true } } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { logger: devLogger } = await import('../utils/logger');
    devLogger.perf('fast-op', 5, 16);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should handle multiple arguments', async () => {
    vi.resetModules();
    vi.stubGlobal('import', { meta: { env: { DEV: true } } });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger: devLogger } = await import('../utils/logger');
    devLogger.log('msg', 42, { key: 'val' });
    expect(logSpy).toHaveBeenCalledWith('msg', 42, { key: 'val' });
    logSpy.mockRestore();
  });
});
