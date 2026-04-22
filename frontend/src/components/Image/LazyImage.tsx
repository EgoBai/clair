import React, { useState, useEffect, useRef, useCallback } from 'react';
import logger from '../../utils/logger';

export interface LazyImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  threshold?: number;
  rootMargin?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  eager?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * 图片懒加载组件
 * 
 * @example
 * ```tsx
 * <LazyImage
 *   src="/path/to/image.jpg"
 *   alt="描述文字"
 *   placeholder="/path/to/placeholder.jpg"
 *   threshold={0.1}
 *   rootMargin="100px"
 * />
 * ```
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onError,
  eager = false,
  style,
  className = '',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(eager);
  const [isInView, setIsInView] = useState(eager);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 加载图片
  const loadImage = useCallback(() => {
    if (!src || isLoaded) return;

    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      setIsLoaded(true);
      setHasError(false);
      onLoad?.();
    };
    
    img.onerror = (event) => {
      logger.error(`Failed to load image: ${src}`, event);
      setHasError(true);
      onError?.(new Error(`Failed to load image: ${src}`));
    };
  }, [src, isLoaded, onLoad, onError]);

  // 初始化Intersection Observer
  useEffect(() => {
    if (eager) {
      loadImage();
      return;
    }

    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsInView(true);
            loadImage();
            observer.unobserve(entry.target);
          }
        });
      },
      { 
        threshold,
        rootMargin 
      }
    );

    observerRef.current = observer;
    observer.observe(imgRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [eager, loadImage, threshold, rootMargin]);

  // 如果src变化，重置状态
  useEffect(() => {
    if (src && eager) {
      setIsLoaded(false);
      setIsInView(true);
      loadImage();
    }
  }, [src, eager, loadImage]);

  // 计算最终显示的图片URL
  const imageUrl = hasError 
    ? placeholder 
    : (isLoaded ? src : placeholder);

  // 计算样式
  const imageStyle: React.CSSProperties = {
    opacity: isLoaded ? 1 : 0.5,
    transition: 'opacity 0.3s ease-in-out',
    filter: isLoaded ? 'none' : 'blur(5px)',
    ...style
  };

  // 添加加载状态类名
  const imageClassName = [
    className,
    'lazy-image',
    isLoaded ? 'lazy-image-loaded' : 'lazy-image-loading',
    hasError ? 'lazy-image-error' : ''
  ].filter(Boolean).join(' ');

  return (
    <img
      ref={imgRef}
      src={imageUrl}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      style={imageStyle}
      className={imageClassName}
      data-lazy-loaded={isLoaded}
      data-lazy-in-view={isInView}
      data-lazy-error={hasError}
      {...props}
    />
  );
};

/**
 * 预加载图片
 * 
 * @param urls 图片URL数组
 * @returns Promise，所有图片加载完成后resolve
 */
export const preloadImages = (urls: string[]): Promise<void[]> => {
  const promises = urls.map(url => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
    });
  });
  
  return Promise.all(promises);
};

/**
 * 图片懒加载HOC（高阶组件）
 */
export function withLazyImage<P extends { src: string; alt: string }>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<LazyImageProps, 'src' | 'alt'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const ComponentWithLazyImage: React.FC<P> = (props) => {
    return (
      <LazyImage
        src={props.src}
        alt={props.alt}
        {...options}
        {...props as any}
      />
    );
  };
  
  ComponentWithLazyImage.displayName = `withLazyImage(${displayName})`;
  
  return ComponentWithLazyImage;
}

// 默认导出
export default LazyImage;