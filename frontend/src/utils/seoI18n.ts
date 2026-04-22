/**
 * SEO 多语言元标签管理
 * 实现 hreflang、Open Graph locale、canonical URL 等
 */

import type { Locale } from '../i18n';

/** 语言对应的hreflang代码 */
const HREFLANG_MAP: Record<Locale, string> = {
  'zh-CN': 'zh-CN',
  'en-US': 'en-US',
  'ja-JP': 'ja-JP',
  'ko-KR': 'ko-KR',
};

/** Open Graph locale映射 */
const OG_LOCALE_MAP: Record<Locale, string> = {
  'zh-CN': 'zh_CN',
  'en-US': 'en_US',
  'ja-JP': 'ja_JP',
  'ko-KR': 'ko_KR',
};

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  canonicalUrl?: string;
  locale: Locale;
  alternateUrls?: Record<Locale, string>;
  ogImage?: string;
  ogType?: string;
}

/**
 * 更新页面SEO元标签
 */
export function updateSEOMetaTags(config: SEOConfig): void {
  const { title, description, keywords, canonicalUrl, locale, alternateUrls, ogImage, ogType } = config;

  // 基础meta标签
  document.title = title;
  setMetaTag('description', description);
  if (keywords?.length) {
    setMetaTag('keywords', keywords.join(', '));
  }

  // 语言
  document.documentElement.lang = locale;

  // Canonical URL
  if (canonicalUrl) {
    setLinkTag('canonical', canonicalUrl);
  }

  // hreflang替代语言链接
  if (alternateUrls) {
    // 移除旧的hreflang标签
    document.querySelectorAll('link[hreflang]').forEach(el => el.remove());

    Object.entries(alternateUrls).forEach(([loc, url]) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = HREFLANG_MAP[loc as Locale] || loc;
      link.href = url;
      document.head.appendChild(link);
    });

    // x-default
    const defaultLink = document.createElement('link');
    defaultLink.rel = 'alternate';
    defaultLink.hreflang = 'x-default';
    defaultLink.href = alternateUrls['en-US'] || alternateUrls[locale] || '';
    document.head.appendChild(defaultLink);
  }

  // Open Graph
  setMetaProperty('og:title', title);
  setMetaProperty('og:description', description);
  setMetaProperty('og:locale', OG_LOCALE_MAP[locale]);
  setMetaProperty('og:type', ogType || 'website');
  if (ogImage) setMetaProperty('og:image', ogImage);
  if (canonicalUrl) setMetaProperty('og:url', canonicalUrl);

  // Twitter Card
  setMetaName('twitter:card', 'summary_large_image');
  setMetaName('twitter:title', title);
  setMetaName('twitter:description', description);
  if (ogImage) setMetaName('twitter:image', ogImage);
}

/**
 * 生成hreflang链接标签的HTML字符串（用于SSR）
 */
export function generateHreflangTags(
  alternateUrls: Record<Locale, string>
): string {
  const tags: string[] = [];

  Object.entries(alternateUrls).forEach(([loc, url]) => {
    tags.push(`<link rel="alternate" hreflang="${HREFLANG_MAP[loc as Locale] || loc}" href="${url}" />`);
  });

  // x-default
  const defaultUrl = alternateUrls['en-US'] || Object.values(alternateUrls)[0] || '';
  tags.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}" />`);

  return tags.join('\n');
}

/**
 * 生成结构化数据的多语言标记
 */
export function generateLanguageStructuredData(
  locale: Locale,
  pageTitle: string,
  pageUrl: string
): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageTitle,
    url: pageUrl,
    inLanguage: locale,
    isPartOf: {
      '@type': 'WebSite',
      name: 'A股行情分析',
      url: window.location.origin,
    },
  };
  return JSON.stringify(data);
}

// ====== 内部工具函数 ======

function setMetaTag(name: string, content: string): void {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaProperty(property: string, content: string): void {
  let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaName(name: string, content: string): void {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setLinkTag(rel: string, href: string): void {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

export default {
  updateSEOMetaTags,
  generateHreflangTags,
  generateLanguageStructuredData,
  HREFLANG_MAP,
  OG_LOCALE_MAP,
};
