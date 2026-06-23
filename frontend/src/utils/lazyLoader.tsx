/**
 * Intersection Observer 懒加载系统
 * 支持：图片懒加载 / 组件懒加载 / 预加载控制
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ==================== Observer 单例管理 ====================

class IntersectionObserverManager {
  private observers: Map<string, IntersectionObserver> = new Map();
  private callbacks: Map<Element, Set<IntersectionObserverCallback>> = new Map();

  private getKey(options: IntersectionObserverInit): string {
    return JSON.stringify({
      root: options.root instanceof Element ? '__element__' : options.root,
      rootMargin: options.rootMargin || '0px',
      threshold: options.threshold || 0,
    });
  }

  observe(element: Element, options: IntersectionObserverInit, callback: IntersectionObserverCallback): void {
    const key = this.getKey(options);
    let observer = this.observers.get(key);

    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const cbs = this.callbacks.get(entry.target);
          if (cbs) {
            cbs.forEach(cb => cb([entry], observer!));
          }
        });
      }, options);
      this.observers.set(key, observer);
    }

    if (!this.callbacks.has(element)) {
      this.callbacks.set(element, new Set());
    }
    this.callbacks.get(element)!.add(callback);
    observer.observe(element);
  }

  unobserve(element: Element, options: IntersectionObserverInit, callback: IntersectionObserverCallback): void {
    const key = this.getKey(options);
    const observer = this.observers.get(key);
    const cbs = this.callbacks.get(element);

    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) {
        this.callbacks.delete(element);
        observer?.unobserve(element);
      }
    }
  }

  disconnect(): void {
    this.observers.forEach(o => o.disconnect());
    this.observers.clear();
    this.callbacks.clear();
  }
}

const manager = new IntersectionObserverManager();

// ==================== useInView Hook ====================

interface UseInViewOptions extends IntersectionObserverInit {
  triggerOnce?: boolean;
  skip?: boolean;
  delay?: number;
}

interface UseInViewReturn {
  ref: (node: Element | null) => void;
  inView: boolean;
  entry: IntersectionObserverEntry | null;
}

export function useInView(options: UseInViewOptions = {}): UseInViewReturn {
  const { triggerOnce = false, skip = false, delay = 0, ...observerOptions } = options;
  const [inView, setInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const nodeRef = useRef<Element | null>(null);
  const triggeredRef = useRef(false);
  const callbackRef = useRef<IntersectionObserverCallback | null>(null);

  const callback: IntersectionObserverCallback = useCallback((entries, obs) => {
    const [entry] = entries;
    setEntry(entry);

    if (delay > 0) {
      setTimeout(() => {
        if (entry.isIntersecting) {
          setInView(true);
          if (triggerOnce && nodeRef.current) {
            obs.unobserve(nodeRef.current);
            triggeredRef.current = true;
          }
        } else if (!triggerOnce) {
          setInView(false);
        }
      }, delay);
    } else {
      if (entry.isIntersecting) {
        setInView(true);
        if (triggerOnce && nodeRef.current) {
          obs.unobserve(nodeRef.current);
          triggeredRef.current = true;
        }
      } else if (!triggerOnce) {
        setInView(false);
      }
    }
  }, [triggerOnce, delay]);

  callbackRef.current = callback;

  const ref = useCallback((node: Element | null) => {
    if (skip || triggeredRef.current) return;

    if (nodeRef.current) {
      manager.unobserve(nodeRef.current, observerOptions, callback);
    }

    nodeRef.current = node;

    if (node) {
      manager.observe(node, observerOptions, callback);
    }
  }, [skip]);

  return { ref, inView, entry };
}

// ==================== LazyImage 懒加载图片组件 ====================

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  threshold?: number;
  rootMargin?: string;
  fadeIn?: boolean;
  skeleton?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"%3E%3Crect fill="%23f0f0f0" width="1" height="1"/%3E%3C/svg%3E',
  threshold = 0.1,
  rootMargin = '100px',
  fadeIn = true,
  skeleton = true,
  onLoad,
  onError,
  style,
  className,
  ...imgProps
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder);

  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: true,
  });

  useEffect(() => {
    if (!inView || loaded) return;

    const img = new Image();
    img.onload = () => {
      setCurrentSrc(src);
      setLoaded(true);
      onLoad?.();
    };
    img.onerror = () => {
      setError(true);
      onError?.();
    };
    img.src = src;
  }, [inView, src, loaded, onLoad, onError]);

  const imageStyle: React.CSSProperties = {
    ...style,
    transition: fadeIn ? 'opacity 0.3s ease-in-out' : undefined,
    opacity: loaded ? 1 : fadeIn ? 0 : 1,
  };

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} style={{ position: 'relative', overflow: 'hidden' }}>
      {skeleton && !loaded && !error && (
        <div className="lazy-image-skeleton" style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-shimmer 1.5s infinite',
        }} />
      )}
      <img
        {...imgProps}
        src={error ? placeholder : currentSrc}
        alt={alt}
        style={imageStyle}
        className={className}
      />
    </div>
  );
};

// ==================== LazyComponent 懒加载容器 ====================

interface LazyComponentProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
  minHeight?: number;
  onVisible?: () => void;
}

export const LazyComponent: React.FC<LazyComponentProps> = ({
  children,
  fallback = null,
  threshold = 0.1,
  rootMargin = '200px',
  minHeight = 100,
  onVisible,
}) => {
  const [visible, setVisible] = useState(false);
  const calledRef = useRef(false);

  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: true,
  });

  useEffect(() => {
    if (inView && !visible) {
      setVisible(true);
      if (!calledRef.current) {
        calledRef.current = true;
        onVisible?.();
      }
    }
  }, [inView, visible, onVisible]);

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? children : fallback}
    </div>
  );
};

// ==================== 预加载管理 ====================

interface PreloadOptions {
  priority?: 'high' | 'low';
  type?: 'image' | 'script' | 'style' | 'font';
}

const preloadedUrls = new Set<string>();

export function preloadResource(url: string, options: PreloadOptions = {}): void {
  if (preloadedUrls.has(url)) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = options.type || 'image';

  if (options.priority) {
    link.setAttribute('fetchpriority', options.priority);
  }

  if (options.type === 'font') {
    link.crossOrigin = 'anonymous';
  }

  document.head.appendChild(link);
  preloadedUrls.add(url);
}

export function prefetchRoute(routeUrl: string): void {
  if (preloadedUrls.has(routeUrl)) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = routeUrl;
  document.head.appendChild(link);
  preloadedUrls.add(routeUrl);
}

// ==================== 批量预加载 ====================

export function preloadImages(urls: string[], batchSize = 3): Promise<void[]> {
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }

  return batches.reduce<Promise<void[]>>(async (acc, batch) => {
    const results = await acc;
    const batchResults = await Promise.all(
      batch.map(url => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      }))
    );
    return [...results, ...batchResults];
  }, Promise.resolve([]));
}
