import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateHreflangTags,
  generateLanguageStructuredData,
  updateSEOMetaTags,
  default as seo,
} from '../utils/seoI18n';

/**
 * SEO 多语言元标签管理测试（导入真实模块）
 */

describe('SEOI18n', () => {
  describe('HREFLANG_MAP', () => {
    it('应该包含所有支持的语言', () => {
      expect(Object.keys(seo.HREFLANG_MAP)).toHaveLength(4);
      expect(seo.HREFLANG_MAP).toHaveProperty('zh-CN');
      expect(seo.HREFLANG_MAP).toHaveProperty('en-US');
      expect(seo.HREFLANG_MAP).toHaveProperty('ja-JP');
      expect(seo.HREFLANG_MAP).toHaveProperty('ko-KR');
    });

    it('hreflang值应正确映射', () => {
      expect(seo.HREFLANG_MAP['zh-CN']).toBe('zh-CN');
      expect(seo.HREFLANG_MAP['en-US']).toBe('en-US');
      expect(seo.HREFLANG_MAP['ja-JP']).toBe('ja-JP');
      expect(seo.HREFLANG_MAP['ko-KR']).toBe('ko-KR');
    });
  });

  describe('OG_LOCALE_MAP', () => {
    it('OG locale应该用下划线分隔', () => {
      Object.values(seo.OG_LOCALE_MAP).forEach(locale => {
        expect(locale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      });
    });

    it('应该正确映射到OG格式', () => {
      expect(seo.OG_LOCALE_MAP['zh-CN']).toBe('zh_CN');
      expect(seo.OG_LOCALE_MAP['en-US']).toBe('en_US');
    });
  });

  describe('generateHreflangTags（真实模块）', () => {
    it('应该为每个语言生成link标签', () => {
      const urls = { 'zh-CN': 'https://example.com/zh', 'en-US': 'https://example.com/en' };
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

  describe('generateLanguageStructuredData（真实模块）', () => {
    it('应该生成有效的JSON', () => {
      const result = generateLanguageStructuredData('zh-CN', '首页', 'https://example.com');
      expect(JSON.parse(result)).toBeDefined();
    });

    it('应该包含正确的schema.org上下文', () => {
      const parsed = JSON.parse(generateLanguageStructuredData('zh-CN', '首页', 'https://example.com'));
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('WebPage');
    });

    it('应该包含语言信息', () => {
      const parsed = JSON.parse(generateLanguageStructuredData('ja-JP', 'ホーム', 'https://example.com/ja'));
      expect(parsed.inLanguage).toBe('ja-JP');
    });

    it('应该包含页面标题和URL', () => {
      const parsed = JSON.parse(generateLanguageStructuredData('en-US', 'Dashboard', 'https://example.com/dashboard'));
      expect(parsed.name).toBe('Dashboard');
      expect(parsed.url).toBe('https://example.com/dashboard');
    });

    it('应该包含父级网站信息', () => {
      const parsed = JSON.parse(generateLanguageStructuredData('zh-CN', '首页', 'https://example.com'));
      expect(parsed.isPartOf['@type']).toBe('WebSite');
      expect(parsed.isPartOf.name).toBe('A股行情分析');
      expect(parsed.isPartOf.url).toBe(window.location.origin);
    });
  });

  describe('updateSEOMetaTags（真实模块，操作 DOM）', () => {
    beforeEach(() => {
      document.head.innerHTML = '';
      document.title = '';
    });

    it('应更新 title、lang 与 description', () => {
      updateSEOMetaTags({
        title: 'A股行情分析',
        description: '实时A股行情数据',
        locale: 'zh-CN',
      });
      expect(document.title).toBe('A股行情分析');
      expect(document.documentElement.lang).toBe('zh-CN');
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('实时A股行情数据');
    });

    it('应生成 hreflang 与 x-default 链接', () => {
      updateSEOMetaTags({
        title: 'Stock',
        description: 'data',
        locale: 'en-US',
        alternateUrls: { 'zh-CN': 'https://example.com/zh', 'en-US': 'https://example.com/en' },
      });
      const hreflangs = Array.from(document.querySelectorAll('link[hreflang]')).map(l => l.getAttribute('hreflang'));
      expect(hreflangs).toContain('zh-CN');
      expect(hreflangs).toContain('en-US');
      expect(hreflangs).toContain('x-default');
    });
  });
});
