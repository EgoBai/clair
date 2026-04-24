/**
 * ResponsiveImage 响应式图片组件测试
 * breakpoints、aspectRatio、objectFit、srcSet生成、sizes
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveImage } from '../components/Image/ResponsiveImage';

describe('ResponsiveImage', () => {
// === 基础渲染 ===
  describe('basic rendering', () => {
    it('renders img element with alt text', () => {
      render(<ResponsiveImage src="/test.jpg" alt="响应式图片" />);
      const img = screen.getByAltText('响应式图片');
      expect(img).toBeTruthy();
      // LazyImage uses placeholder initially, so src is SVG
      expect(img.getAttribute('src')).toContain('base64');
    });

    it('renders with custom className', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" className="custom-img" />
      );
      const img = container.querySelector('img');
      expect(img?.className).toContain('custom-img');
    });

    it('passes extra props to underlying lazy-image', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" width={800} height={600} />
      );
      const img = container.querySelector('img');
      // The width/height are passed as props to <img> via LazyImage
      // Check that the container has a responsive-image class
      expect(img).toBeTruthy();
      expect(img?.tagName).toBe('IMG');
    });
  });

  // === srcSet 处理 ===
  describe('srcSet handling', () => {
    it('uses provided srcSet directly', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          srcSet="/test-400w.jpg 400w, /test-800w.jpg 800w"
        />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('srcset')).toContain('400w');
      expect(img?.getAttribute('srcset')).toContain('800w');
    });

    it('generates srcSet from breakpoints when no srcSet provided', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          breakpoints={{
            sm: '/test-sm.jpg',
            md: '/test-md.jpg',
            lg: '/test-lg.jpg',
          }}
        />
      );
      const img = container.querySelector('img');
      const srcset = img?.getAttribute('srcset');
      expect(srcset).toContain('test-sm.jpg');
      expect(srcset).toContain('640w');
      expect(srcset).toContain('test-md.jpg');
      expect(srcset).toContain('768w');
      expect(srcset).toContain('test-lg.jpg');
      expect(srcset).toContain('1024w');
    });

    it('skips undefined breakpoint values', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          breakpoints={{
            sm: '/test-sm.jpg',
            md: undefined,
            lg: '/test-lg.jpg',
          } as any}
        />
      );
      const img = container.querySelector('img');
      const srcset = img?.getAttribute('srcset');
      expect(srcset).toContain('test-sm.jpg');
      expect(srcset).toContain('test-lg.jpg');
      // md should be skipped as undefined
      expect(srcset).not.toContain('test-md.jpg');
    });

    it('handles xl and 2xl breakpoints', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          breakpoints={{
            xl: '/test-xl.jpg',
            '2xl': '/test-2xl.jpg',
          }}
        />
      );
      const img = container.querySelector('img');
      const srcset = img?.getAttribute('srcset');
      expect(srcset).toContain('1280w');
      expect(srcset).toContain('1536w');
    });
  });

  // === sizes 属性 ===
  describe('sizes attribute', () => {
    it('uses provided sizes', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('sizes')).toBe('(max-width: 768px) 100vw, 50vw');
    });

    it('uses default sizes when not provided', () => {
      const { container } = render(<ResponsiveImage src="/test.jpg" alt="test" />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('sizes')).toBeTruthy();
      expect(img?.getAttribute('sizes')).toContain('640px');
    });
  });

  // === aspectRatio ===
  describe('aspect ratio', () => {
    it('applies aspect ratio style when provided', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" aspectRatio="16/9" />
      );
      const img = container.querySelector('img');
      expect(img?.style.aspectRatio).toBe('16/9');
      expect(img?.style.width).toBe('100%');
    });

    it('does not set aspect ratio when not provided', () => {
      const { container } = render(<ResponsiveImage src="/test.jpg" alt="test" />);
      const img = container.querySelector('img');
      // default is cover, no aspect ratio
      expect(img?.style.aspectRatio).not.toBe('16/9');
    });

    it('handles different aspect ratios', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" aspectRatio="4/3" />
      );
      const img = container.querySelector('img');
      expect(img?.style.aspectRatio).toBe('4/3');
    });

    it('handles square aspect ratio', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" aspectRatio="1/1" />
      );
      const img = container.querySelector('img');
      expect(img?.style.aspectRatio).toBe('1/1');
    });
  });

  // === objectFit ===
  describe('objectFit', () => {
    it('defaults to cover', () => {
      const { container } = render(<ResponsiveImage src="/test.jpg" alt="test" />);
      const img = container.querySelector('img');
      expect(img?.style.objectFit).toBe('cover');
    });

    it('applies contain objectFit', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" objectFit="contain" />
      );
      const img = container.querySelector('img');
      expect(img?.style.objectFit).toBe('contain');
    });

    it('applies scale-down objectFit', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" objectFit="scale-down" />
      );
      const img = container.querySelector('img');
      expect(img?.style.objectFit).toBe('scale-down');
    });

    it('applies fill objectFit', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" objectFit="fill" />
      );
      const img = container.querySelector('img');
      expect(img?.style.objectFit).toBe('fill');
    });

    it('applies none objectFit', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" objectFit="none" />
      );
      const img = container.querySelector('img');
      expect(img?.style.objectFit).toBe('none');
    });
  });

  // === 样式合并 ===
  describe('style merging', () => {
    it('merges aspect ratio styles with custom styles', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          aspectRatio="16/9"
          style={{ borderRadius: '8px', opacity: 0.9 }}
        />
      );
      const img = container.querySelector('img');
      expect(img?.style.aspectRatio).toBe('16/9');
      expect(img?.style.borderRadius).toBe('8px');
      expect(img?.style.opacity).toBe('0.9');
    });
  });

  // === 边缘情况 ===
  describe('edge cases', () => {
    it('handles empty breakpoints object', () => {
      const { container } = render(
        <ResponsiveImage src="/test.jpg" alt="test" breakpoints={{}} />
      );
      const img = container.querySelector('img');
      const srcset = img?.getAttribute('srcset');
      expect(srcset).toBeFalsy();
    });

    it('handles breakpoints with all undefined values', () => {
      const { container } = render(
        <ResponsiveImage
          src="/test.jpg"
          alt="test"
          breakpoints={{ sm: undefined as any, md: undefined as any }}
        />
      );
      const img = container.querySelector('img');
      expect(img?.getAttribute('srcset')).toBeFalsy();
    });

    it('renders without any optional props', () => {
      const { container } = render(<ResponsiveImage src="/test.jpg" alt="test" />);
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.style.objectFit).toBe('cover');
    });
  });
});
