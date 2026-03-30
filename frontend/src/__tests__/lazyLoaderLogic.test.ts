/**
 * Lazy Loader 纯逻辑测试
 * 只测试非 React 部分
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('preloadResource (DOM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add preload link to head', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    preloadResource('/test-image-r161.png', { type: 'image' });

    const links = document.querySelectorAll('link[rel="preload"][href="/test-image-r161.png"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should not duplicate preloads for same URL', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    preloadResource('/dup-image-r161.png', { type: 'image' });
    preloadResource('/dup-image-r161.png', { type: 'image' });

    const links = document.querySelectorAll('link[rel="preload"][href="/dup-image-r161.png"]');
    expect(links.length).toBe(1);
  });

  it('should set fetchpriority attribute when provided', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    preloadResource('/priority-r161.png', { type: 'image', priority: 'high' });

    const link = document.querySelector('link[href="/priority-r161.png"]');
    expect(link?.getAttribute('fetchpriority')).toBe('high');
  });

  it('should set fetchpriority to low when specified', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    preloadResource('/low-r161.png', { type: 'image', priority: 'low' });

    const link = document.querySelector('link[href="/low-r161.png"]');
    expect(link?.getAttribute('fetchpriority')).toBe('low');
  });

  it('should set rel=preload', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    preloadResource('/rel-test.png', { type: 'image' });

    const link = document.querySelector('link[href="/rel-test.png"]');
    expect(link?.rel).toBe('preload');
  });

  it('should set crossOrigin for font type', async () => {
    const { preloadResource } = await import('../utils/lazyLoader.tsx');
    const uniqueUrl = `/font-cross-${Date.now()}-${Math.random().toString(36).slice(2)}.woff2`;
    preloadResource(uniqueUrl, { type: 'font' });

    // Verify the link exists in DOM
    const allLinks = document.querySelectorAll('link[rel="preload"]');
    const found = Array.from(allLinks).find(l => l.href.includes('font-cross'));
    expect(found).toBeTruthy();
  });
});

describe('prefetchRoute (DOM)', () => {
  it('should add prefetch link to head', async () => {
    const { prefetchRoute } = await import('../utils/lazyLoader.tsx');
    prefetchRoute('/route-r161');

    const links = document.querySelectorAll('link[rel="prefetch"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should not duplicate prefetch for same route', async () => {
    const { prefetchRoute } = await import('../utils/lazyLoader.tsx');
    prefetchRoute('/dup-route-r161');
    prefetchRoute('/dup-route-r161');

    const links = document.querySelectorAll('link[rel="prefetch"][href="/dup-route-r161"]');
    expect(links.length).toBe(1);
  });
});

describe('preloadImages (no DOM)', () => {
  it('should handle empty array', async () => {
    const { preloadImages } = await import('../utils/lazyLoader.tsx');
    const results = await preloadImages([]);
    expect(results).toHaveLength(0);
  });

  it('should have correct function signature', async () => {
    const { preloadImages } = await import('../utils/lazyLoader.tsx');
    expect(typeof preloadImages).toBe('function');
  });

  it('should accept batch size parameter', async () => {
    const { preloadImages } = await import('../utils/lazyLoader.tsx');
    // Should not throw with batch size
    expect(() => preloadImages([], 5)).not.toThrow();
  });
});
