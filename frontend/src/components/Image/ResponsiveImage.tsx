import React from 'react';
import { LazyImage, LazyImageProps } from './LazyImage';

export interface ResponsiveImageProps extends LazyImageProps {
  breakpoints?: {
    sm?: string; // 640px
    md?: string; // 768px
    lg?: string; // 1024px
    xl?: string; // 1280px
    '2xl'?: string; // 1536px
  };
  aspectRatio?: string; // 例如 "16/9", "4/3", "1/1"
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

/**
 * 响应式图片组件
 * 支持懒加载、响应式图片、自动生成srcSet
 * 
 * @example
 * ```tsx
 * <ResponsiveImage
 *   src="/images/stock-default.jpg"
 *   alt="股票图表"
 *   breakpoints={{
 *     sm: "/images/stock-640w.jpg",
 *     md: "/images/stock-768w.jpg",
 *     lg: "/images/stock-1024w.jpg",
 *     xl: "/images/stock-1280w.jpg"
 *   }}
 *   sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
 *   aspectRatio="16/9"
 * />
 * ```
 */
export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  sizes = '(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw',
  srcSet,
  breakpoints,
  aspectRatio,
  objectFit = 'cover',
  style,
  className = '',
  ...props
}) => {
  // 自动生成srcSet如果提供了breakpoints
  const generatedSrcSet = srcSet || (breakpoints ? Object.entries(breakpoints)
    .filter(([, url]) => url) // 过滤掉undefined
    .map(([breakpoint, url]) => {
      const width = {
        sm: '640w',
        md: '768w',
        lg: '1024w',
        xl: '1280w',
        '2xl': '1536w'
      }[breakpoint];
      return width ? `${url} ${width}` : `${url}`;
    })
    .join(', ') : undefined);

  // 计算宽高比样式
  const aspectRatioStyle = aspectRatio ? {
    aspectRatio,
    width: '100%',
    height: 'auto'
  } : {};

  // 计算objectFit样式
  const objectFitStyle = {
    objectFit
  };

  // 合并样式
  const mergedStyle = {
    ...aspectRatioStyle,
    ...objectFitStyle,
    ...style
  };

  // 添加响应式图片类名
  const mergedClassName = [
    className,
    'responsive-image',
    aspectRatio ? 'responsive-image-aspect-ratio' : ''
  ].filter(Boolean).join(' ');

  return (
    <LazyImage
      src={src}
      alt={alt}
      srcSet={generatedSrcSet}
      sizes={sizes}
      style={mergedStyle}
      className={mergedClassName}
      {...props}
    />
  );
};

/**
 * 生成响应式图片配置
 * 
 * @param baseUrl 基础图片URL（可以包含{width}占位符）
 * @param widths 宽度数组
 * @returns srcSet字符串
 * 
 * @example
 * ```tsx
 * const srcSet = generateSrcSet('/images/stock-{width}w.jpg', [640, 768, 1024, 1280]);
 * // 返回: "/images/stock-640w.jpg 640w, /images/stock-768w.jpg 768w, ..."
 * ```
 */
export function generateSrcSet(baseUrl: string, widths: number[]): string {
  return widths
    .map(width => `${baseUrl.replace('{width}', width.toString())} ${width}w`)
    .join(', ');
}

/**
 * 生成响应式sizes配置
 * 
 * @param breakpoints 断点配置
 * @returns sizes字符串
 * 
 * @example
 * ```tsx
 * const sizes = generateSizes({
 *   sm: '100vw',
 *   md: '50vw',
 *   lg: '33vw'
 * });
 * // 返回: "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
 * ```
 */
export function generateSizes(breakpoints: Record<string, string>): string {
  const breakpointMap = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  };

  return Object.entries(breakpoints)
    .map(([breakpoint, size]) => {
      const maxWidth = breakpointMap[breakpoint as keyof typeof breakpointMap];
      return maxWidth ? `(max-width: ${maxWidth}) ${size}` : size;
    })
    .join(', ');
}

/**
 * 图片优化配置接口
 */
export interface ImageOptimizationConfig {
  quality?: number; // 图片质量 1-100
  format?: 'webp' | 'jpg' | 'png' | 'avif'; // 图片格式
  width?: number; // 目标宽度
  height?: number; // 目标高度
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'; // 调整方式
}

/**
 * 生成优化后的图片URL（需要后端图片处理服务支持）
 * 
 * @param originalUrl 原始图片URL
 * @param config 优化配置
 * @returns 优化后的图片URL
 */
export function generateOptimizedUrl(
  originalUrl: string,
  config: ImageOptimizationConfig
): string {
  const params = new URLSearchParams();
  
  if (config.quality) params.set('q', config.quality.toString());
  if (config.format) params.set('fm', config.format);
  if (config.width) params.set('w', config.width.toString());
  if (config.height) params.set('h', config.height.toString());
  if (config.fit) params.set('fit', config.fit);
  
  // 这里假设有一个图片处理服务端点
  // 实际项目中需要根据你的图片服务调整
  if (params.toString()) {
    return `${originalUrl}?${params.toString()}`;
  }
  
  return originalUrl;
}

/**
 * 响应式图片HOC（高阶组件）
 */
export function withResponsiveImage<P extends { src: string; alt: string }>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<ResponsiveImageProps, 'src' | 'alt'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const ComponentWithResponsiveImage: React.FC<P> = (props) => {
    return (
      <ResponsiveImage
        src={props.src}
        alt={props.alt}
        {...options}
        {...props as Partial<LazyImageProps>}
      />
    );
  };
  
  ComponentWithResponsiveImage.displayName = `withResponsiveImage(${displayName})`;
  
  return ComponentWithResponsiveImage;
}

// 默认导出
export default ResponsiveImage;