import { describe, it, expect } from 'vitest';

/**
 * SEO 多语言元标签管理逻辑测试
 */

describe('SEOI18n', () => {
  describe('HREFLANG_MAP', () => {
    const HREFLANG_MAP: Record<string, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'ja-JP': 'ja-JP',
      'ko-KR': 'ko-KR',
    };

    it('应该包含所有支持的语言', () => {
      expect(Object.keys(HREFLANG_MAP)).toHaveLength(4);
      expect(HREFLANG_MAP).toHaveProperty('zh-CN');
      expect(HREFLANG_MAP).toHaveProperty('en-US');
      expect(HREFLANG_MAP).toHaveProperty('ja-JP');
      expect(HREFLANG_MAP).toHaveProperty('ko-KR');
    });

    it('hreflang值应正确映射', () => {
      expect(HREFLANG_MAP['zh-CN']).toBe('zh-CN');
      expect(HREFLANG_MAP['en-US']).toBe('en-US');
      expect(HREFLANG_MAP['ja-JP']).toBe('ja-JP');
      expect(HREFLANG_MAP['ko-KR']).toBe('ko-KR');
    });
  });

  describe('OG_LOCALE_MAP', () => {
    const OG_LOCALE_MAP: Record<string, string> = {
      'zh-CN': 'zh_CN',
      'en-US': 'en_US',
      'ja-JP': 'ja_JP',
      'ko-KR': 'ko_KR',
    };

    it('OG locale应该用下划线分隔', () => {
      Object.values(OG_LOCALE_MAP).forEach(locale => {
        expect(locale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      });
    });

    it('应该正确映射到OG格式', () => {
      expect(OG_LOCALE_MAP['zh-CN']).toBe('zh_CN');
      expect(OG_LOCALE_MAP['en-US']).toBe('en_US');
    });
  });

  describe('generateHreflangTags', () => {
    const generateHreflangTags = (alternateUrls: Record<string, string>): string => {
      const HREFLANG_MAP: Record<string, string> = {
        'zh-CN': 'zh-CN', 'en-US': 'en-US', 'ja-JP': 'ja-JP', 'ko-KR': 'ko-KR',
      };
      const tags: string[] = [];
      Object.entries(alternateUrls).forEach(([loc, url]) => {
        tags.push(`<link rel="alternate" hreflang="${HREFLANG_MAP[loc] || loc}" href="${url}" />`);
      });
      const defaultUrl = alternateUrls['en-US'] || Object.values(alternateUrls)[0] || '';
      tags.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);
      return tags.join('\n');
    };

    it('应该为每个语言生成link标签', () => {
      const urls = {
        'zh-CN': 'https://example.com/zh',
        'en-US': 'https://example.com/en',
      };
      const result = generateHreflangTags(urls);
      expect(result).toContain('hreflang="zh-CN"');
      expect(result).toContain('hreflang="en-US"');
      expect(result).toContain('href="https://example.com/zh"');
      expect(result).toContain('href="https://example.com/en"');
    });

    it('应该包含x-default标签', () => {
      const urls = { 'en-US': 'https://example.com/en' };
      const result = generateHreflangTags(urls);
      expect(result).toContain('hreflang="x-default"');
      expect(result).toContain('https://example.com/en');
    });

    it('没有en-US时x-default应使用第一个URL', () => {
      const urls = { 'zh-CN': 'https://example.com/zh' };
      const result = generateHreflangTags(urls);
      expect(result).toContain('hreflang="x-default"');
      expect(result).toContain('https://example.com/zh');
    });

    it('空URLs应只返回x-default', () => {
      const result = generateHreflangTags({});
      expect(result).toContain('hreflang="x-default"');
      expect(result).toContain('href=""');
    });

    it('输出应为有效的HTML link标签', () => {
      const urls = { 'zh-CN': 'https://example.com/zh', 'en-US': 'https://example.com/en' };
      const result = generateHreflangTags(urls);
      const lines = result.split('\n');
      lines.forEach(line => {
        expect(line).toMatch(/^<link\s+rel="alternate"\s+hreflang="[^"]+"\s+href="[^"]*"\s*\/>$/);
      });
    });
  });

  describe('SEOConfig 类型验证', () => {
    interface SEOConfig {
      title: string;
      description: string;
      keywords?: string[];
      canonicalUrl?: string;
      locale: string;
      alternateUrls?: Record<string, string>;
      ogImage?: string;
      ogType?: string;
    }

    it('应该接受最小配置', () => {
      const config: SEOConfig = {
        title: 'A股行情分析',
        description: '实时A股行情数据',
        locale: 'zh-CN',
      };
      expect(config.title).toBe('A股行情分析');
      expect(config.locale).toBe('zh-CN');
    });

    it('应该接受完整配置', () => {
      const config: SEOConfig = {
        title: 'Stock Analysis',
        description: 'Real-time stock data',
        keywords: ['stock', 'analysis', 'A-share'],
        canonicalUrl: 'https://example.com',
        locale: 'en-US',
        alternateUrls: { 'zh-CN': 'https://example.com/zh', 'en-US': 'https://example.com/en' },
        ogImage: 'https://example.com/og.png',
        ogType: 'website',
      };
      expect(config.keywords).toHaveLength(3);
      expect(config.ogType).toBe('website');
    });
  });

  describe('generateLanguageStructuredData', () => {
    const generateLanguageStructuredData = (
      locale: string,
      pageTitle: string,
      pageUrl: string,
      origin: string = 'https://example.com'
    ): string => {
      const data = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: pageTitle,
        url: pageUrl,
        inLanguage: locale,
        isPartOf: {
          '@type': 'WebSite',
          name: 'A股行情分析',
          url: origin,
        },
      };
      return JSON.stringify(data);
    };

    it('应该生成有效的JSON', () => {
      const result = generateLanguageStructuredData('zh-CN', '首页', 'https://example.com');
      const parsed = JSON.parse(result);
      expect(parsed).toBeDefined();
    });

    it('应该包含正确的schema.org上下文', () => {
      const result = generateLanguageStructuredData('zh-CN', '首页', 'https://example.com');
      const parsed = JSON.parse(result);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('WebPage');
    });

    it('应该包含语言信息', () => {
      const result = generateLanguageStructuredData('ja-JP', 'ホーム', 'https://example.com/ja');
      const parsed = JSON.parse(result);
      expect(parsed.inLanguage).toBe('ja-JP');
    });

    it('应该包含页面标题和URL', () => {
      const result = generateLanguageStructuredData('en-US', 'Dashboard', 'https://example.com/dashboard');
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('Dashboard');
      expect(parsed.url).toBe('https://example.com/dashboard');
    });

    it('应该包含父级网站信息', () => {
      const result = generateLanguageStructuredData('zh-CN', '首页', 'https://example.com');
      const parsed = JSON.parse(result);
      expect(parsed.isPartOf['@type']).toBe('WebSite');
      expect(parsed.isPartOf.name).toBe('A股行情分析');
    });
  });
});
