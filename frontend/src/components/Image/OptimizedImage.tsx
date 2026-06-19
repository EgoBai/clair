import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LazyImage, LazyImageProps } from './LazyImage';
import { ResponsiveImage, ResponsiveImageProps, ImageOptimizationConfig } from './ResponsiveImage';

interface OptimizedImageProps extends Omit<LazyImageProps, 'src' | 'alt'>, Omit<ResponsiveImageProps, 'src' | 'alt'> {
  src: string;
  alt: string;
  optimization?: ImageOptimizationConfig;
  webpFallback?: boolean; // 是否提供WebP回退
  avifFallback?: boolean; // 是否提供AVIF回退
  placeholderType?: 'blur' | 'color' | 'gradient' | 'lqip'; // 占位符类型
  placeholderColor?: string; // 占位符颜色
  placeholderBlur?: number; // 模糊程度
  onLoadStart?: () => void; // 开始加载回调
  onLoadEnd?: () => void; // 加载结束回调
  onProgressiveLoad?: (progress: number) => void; // 渐进加载进度
}

/**
 * 高级图片优化组件
 * 集成懒加载、响应式图片、格式优化、渐进加载等功能
 * 
 * @example
 * ```tsx
 * <OptimizedImage
 *   src="/images/stock-chart.jpg"
 *   alt="股票图表"
 *   optimization={{
 *     quality: 80,
 *     format: 'webp',
 *     width: 800,
 *     height: 600,
 *     fit: 'cover'
 *   }}
 *   breakpoints={{
 *     sm: "/images/stock-640w.jpg",
 *     md: "/images/stock-768w.jpg",
 *     lg: "/images/stock-1024w.jpg"
 *   }}
 *   placeholderType="blur"
 *   placeholderBlur={10}
 *   aspectRatio="16/9"
 * />
 * ```
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  optimization,
  webpFallback = true,
  avifFallback = false,
  placeholderType = 'blur',
  placeholderColor = '#f5f5f5',
  placeholderBlur = 5,
  onLoadStart,
  onLoadEnd,
  onProgressiveLoad,
  style,
  className = '',
  ...props
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasWebPSupport, setHasWebPSupport] = useState(false);
  const [hasAVIFSupport, setHasAVIFSupport] = useState(false);
  const _imgRef = useRef<HTMLImageElement>(null);

  // 检测浏览器支持的图片格式
  useEffect(() => {
    const checkFormatSupport = async () => {
      const webpSupport = await checkWebPSupport();
      const avifSupport = await checkAVIFSupport();
      setHasWebPSupport(webpSupport);
      setHasAVIFSupport(avifSupport);
    };
    
    checkFormatSupport();
  }, []);

  // 生成优化后的图片URL
  const generateOptimizedUrl = useCallback((
    originalUrl: string,
    config?: ImageOptimizationConfig,
    format?: 'webp' | 'avif' | 'jpg' | 'png'
  ): string => {
    if (!config && !format) return originalUrl;

    const params = new URLSearchParams();
    
    // 添加优化参数
    if (config?.quality) params.set('q', config.quality.toString());
    if (config?.width) params.set('w', config.width.toString());
    if (config?.height) params.set('h', config.height.toString());
    if (config?.fit) params.set('fit', config.fit);
    
    // 添加格式参数
    const finalFormat = format || config?.format;
    if (finalFormat) params.set('fm', finalFormat);
    
    // 这里假设有一个图片处理服务端点
    // 实际项目中需要根据你的图片服务调整
    if (params.toString()) {
      return `${originalUrl}?${params.toString()}`;
    }
    
    return originalUrl;
  }, []);

  // 生成占位符
  const generatePlaceholder = useCallback((): string => {
    switch (placeholderType) {
      case 'color':
        return `data:image/svg+xml;base64,${btoa(`
          <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="${placeholderColor}"/>
          </svg>
        `)}`;
      
      case 'gradient':
        return `data:image/svg+xml;base64,${btoa(`
          <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f5f5f5" />
                <stop offset="100%" stop-color="#e0e0e0" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill="url(#grad)"/>
          </svg>
        `)}`;
      
      case 'blur':
      default:
        return `data:image/svg+xml;base64,${btoa(`
          <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="#f5f5f5"/>
            <filter id="blur">
              <feGaussianBlur stdDeviation="${placeholderBlur}" />
            </filter>
            <rect width="100" height="100" filter="url(#blur)" opacity="0.5"/>
          </svg>
        `)}`;
    }
  }, [placeholderType, placeholderColor, placeholderBlur]);

  // 处理图片加载
  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setLoadProgress(0);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleLoadProgress = useCallback((event: ProgressEvent) => {
    if (event.lengthComputable) {
      const progress = Math.round((event.loaded / event.total) * 100);
      setLoadProgress(progress);
      onProgressiveLoad?.(progress);
    }
  }, [onProgressiveLoad]);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
    setLoadProgress(100);
    onLoadEnd?.();
  }, [onLoadEnd]);

  // 根据浏览器支持选择最佳格式
  useEffect(() => {
    if (!optimization) return;

    let format: 'webp' | 'avif' | 'jpg' | 'png' | undefined;
    
    if (avifFallback && hasAVIFSupport) {
      format = 'avif';
    } else if (webpFallback && hasWebPSupport) {
      format = 'webp';
    } else {
      format = optimization.format;
    }

    const optimizedUrl = generateOptimizedUrl(src, optimization, format);
    setCurrentSrc(optimizedUrl);
  }, [src, optimization, webpFallback, avifFallback, hasWebPSupport, hasAVIFSupport, generateOptimizedUrl]);

  // 计算最终样式
  const mergedStyle: React.CSSProperties = {
    ...style,
    position: 'relative',
    overflow: 'hidden'
  };

  // 添加加载状态类名
  const mergedClassName = [
    className,
    'optimized-image',
    isLoading ? 'optimized-image-loading' : 'optimized-image-loaded',
    `optimized-image-placeholder-${placeholderType}`
  ].filter(Boolean).join(' ');

  return (
    <div className="optimized-image-container" style={mergedStyle}>
      {/* 加载进度指示器 */}
      {isLoading && loadProgress > 0 && loadProgress < 100 && (
        <div className="optimized-image-progress">
          <div 
            className="optimized-image-progress-bar"
            style={{ width: `${loadProgress}%` }}
          />
          <span className="optimized-image-progress-text">
            {loadProgress}%
          </span>
        </div>
      )}

      {/* 图片组件 */}
      <ResponsiveImage
        src={currentSrc}
        alt={alt}
        placeholder={generatePlaceholder()}
        onLoad={handleLoadEnd}
        onError={handleLoadEnd}
        style={{ width: '100%', height: 'auto' }}
        className={mergedClassName}
        {...props as Record<string, unknown>}
      />

      {/* 加载遮罩 */}
      {isLoading && (
        <div className="optimized-image-loading-overlay">
          <div className="optimized-image-loading-spinner" />
        </div>
      )}

      <style>{`
        .optimized-image-container {
          position: relative;
        }

        .optimized-image-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(0, 0, 0, 0.1);
          z-index: 10;
          overflow: hidden;
        }

        .optimized-image-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          transition: width 0.3s ease;
        }

        .optimized-image-progress-text {
          position: absolute;
          top: -20px;
          right: 0;
          font-size: 10px;
          color: #666;
          background: 'var(--bg-base, #fff)';
          padding: 2px 4px;
          border-radius: 2px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .optimized-image-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }

        .optimized-image-loading-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          animation: optimized-image-spin 1s linear infinite;
        }

        @keyframes optimized-image-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .optimized-image {
          transition: opacity 0.3s ease, filter 0.3s ease;
        }

        .optimized-image-loading {
          opacity: 0.5;
          filter: blur(${placeholderBlur}px);
        }

        .optimized-image-loaded {
          opacity: 1;
          filter: blur(0);
        }
      `}</style>
    </div>
  );
};

/**
 * 检测WebP支持
 */
async function checkWebPSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  return new Promise((resolve) => {
    const webp = new Image();
    webp.onload = webp.onerror = () => {
      resolve(webp.height === 2);
    };
    webp.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
}

/**
 * 检测AVIF支持
 */
async function checkAVIFSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  return new Promise((resolve) => {
    const avif = new Image();
    avif.onload = avif.onerror = () => {
      resolve(avif.height === 2);
    };
    avif.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  });
}

/**
 * 预加载优化图片
 * 
 * @param urls 图片URL数组
 * @param optimization 优化配置
 * @returns Promise，所有图片加载完成后resolve
 */
export const preloadOptimizedImages = async (
  urls: string[],
  optimization?: ImageOptimizationConfig
): Promise<void[]> => {
  const promises = urls.map(url => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      
      // 生成优化URL
      const optimizedUrl = optimization 
        ? `${url}?${new URLSearchParams({
            q: optimization.quality?.toString() || '80',
            w: optimization.width?.toString() || '',
            h: optimization.height?.toString() || '',
            fit: optimization.fit || 'cover',
            fm: optimization.format || 'webp'
          }).toString()}`
        : url;
      
      img.src = optimizedUrl;
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
    });
  });
  
  return Promise.all(promises);
};

/**
 * 批量优化图片URL
 * 
 * @param urls 原始图片URL数组
 * @param optimization 优化配置
 * @returns 优化后的URL数组
 */
export const batchOptimizeUrls = (
  urls: string[],
  optimization: ImageOptimizationConfig
): string[] => {
  return urls.map(url => {
    const params = new URLSearchParams();
    
    if (optimization.quality) params.set('q', optimization.quality.toString());
    if (optimization.format) params.set('fm', optimization.format);
    if (optimization.width) params.set('w', optimization.width.toString());
    if (optimization.height) params.set('h', optimization.height.toString());
    if (optimization.fit) params.set('fit', optimization.fit);
    
    return params.toString() ? `${url}?${params.toString()}` : url;
  });
};

/**
 * 图片优化HOC（高阶组件）
 */
export function withOptimizedImage<P extends { src: string; alt: string }>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<OptimizedImageProps, 'src' | 'alt'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const ComponentWithOptimizedImage: React.FC<P> = (props) => {
    return (
      <OptimizedImage
        src={props.src}
        alt={props.alt}
        {...options}
        {...props as Record<string, unknown>}
      />
    );
  };
  
  ComponentWithOptimizedImage.displayName = `withOptimizedImage(${displayName})`;
  
  return ComponentWithOptimizedImage;
}

// 默认导出
export default React.memo(OptimizedImage);