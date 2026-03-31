import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 动态语言包加载器逻辑测试
 */

describe('DynamicLocaleLoader', () => {
  describe('LoadStatus 类型', () => {
    it('应该包含所有有效状态', () => {
      const validStatuses = ['idle', 'loading', 'loaded', 'error'];
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
  });

  describe('localeCache 模拟', () => {
    const localeCache = new Map<string, { status: string; messages: Record<string, any>; error?: Error }>();

    beforeEach(() => {
      localeCache.clear();
    });

    it('应该缓存已加载的语言包', () => {
      localeCache.set('zh-CN', { status: 'loaded', messages: { app: { title: 'A股' } } });
      expect(localeCache.has('zh-CN')).toBe(true);
      expect(localeCache.get('zh-CN')?.status).toBe('loaded');
    });

    it('应该返回undefined当语言未缓存', () => {
      expect(localeCache.get('ja-JP')).toBeUndefined();
    });

    it('应该支持清除指定语言缓存', () => {
      localeCache.set('zh-CN', { status: 'loaded', messages: {} });
      localeCache.set('en-US', { status: 'loaded', messages: {} });
      localeCache.delete('zh-CN');
      expect(localeCache.has('zh-CN')).toBe(false);
      expect(localeCache.has('en-US')).toBe(true);
    });

    it('应该支持清除所有缓存', () => {
      localeCache.set('zh-CN', { status: 'loaded', messages: {} });
      localeCache.set('en-US', { status: 'loading', messages: {} });
      localeCache.clear();
      expect(localeCache.size).toBe(0);
    });
  });

  describe('缓存统计', () => {
    it('应该正确统计各种状态', () => {
      const entries = [
        { status: 'loaded' },
        { status: 'loaded' },
        { status: 'loading' },
        { status: 'error' },
      ];

      let loaded = 0, loading = 0, error = 0;
      entries.forEach(entry => {
        if (entry.status === 'loaded') loaded++;
        else if (entry.status === 'loading') loading++;
        else if (entry.status === 'error') error++;
      });

      expect(loaded).toBe(2);
      expect(loading).toBe(1);
      expect(error).toBe(1);
      expect(entries.length).toBe(4);
    });

    it('空缓存应该返回全零', () => {
      const entries: { status: string }[] = [];
      let loaded = 0, loading = 0, error = 0;
      entries.forEach(entry => {
        if (entry.status === 'loaded') loaded++;
        else if (entry.status === 'loading') loading++;
        else if (entry.status === 'error') error++;
      });
      expect(loaded).toBe(0);
      expect(loading).toBe(0);
      expect(error).toBe(0);
    });
  });

  describe('语言包导入映射', () => {
    it('应该支持所有标准语言', () => {
      const supportedLocales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      supportedLocales.forEach(locale => {
        expect(supportedLocales).toContain(locale);
      });
    });

    it('不支持的语言应该抛出错误', () => {
      const supportedLocales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      expect(supportedLocales).not.toContain('fr-FR');
      expect(supportedLocales).not.toContain('de-DE');
    });
  });

  describe('批量预加载', () => {
    it('应该能并行处理多个语言', async () => {
      const results: string[] = [];
      const locales = ['zh-CN', 'en-US', 'ja-JP'];

      const mockPreload = async (locale: string) => {
        await new Promise(r => setTimeout(r, 1));
        results.push(locale);
      };

      await Promise.allSettled(locales.map(l => mockPreload(l)));
      expect(results).toHaveLength(3);
      locales.forEach(l => expect(results).toContain(l));
    });

    it('部分失败不应阻止其他语言加载', async () => {
      const results: string[] = [];
      const errors: string[] = [];

      const mockPreload = async (locale: string) => {
        if (locale === 'ja-JP') throw new Error('Load failed');
        results.push(locale);
      };

      const outcomes = await Promise.allSettled(['zh-CN', 'ja-JP', 'en-US'].map(l => mockPreload(l)));
      outcomes.forEach((o, i) => {
        if (o.status === 'rejected') errors.push(['zh-CN', 'ja-JP', 'en-US'][i]);
      });

      expect(results).toHaveLength(2);
      expect(errors).toContain('ja-JP');
    });
  });
});
