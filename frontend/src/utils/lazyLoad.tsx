/**
 * Component Lazy Loading Utilities
 * 组件懒加载工具 - 按需加载优化
 */
import React, { Suspense, lazy, ComponentType } from 'react';

export interface LazyLoadOptions {
  fallback?: React.ReactNode;
  retryCount?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
  prefetch?: boolean;
}

// Default loading fallback
const DefaultFallback: React.FC = () => null;

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  options: LazyLoadOptions = {}
): React.LazyExoticComponent<T> {
  const { retryCount = 3, retryDelay = 1000 } = options;

  return lazy(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        return await factory();
      } catch (error) {
        lastError = error as Error;
        options.onError?.(lastError);

        if (attempt < retryCount - 1) {
          await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
        }
      }
    }

    throw lastError;
  });
}

export function withSuspense<P extends object>(
  Component: React.LazyExoticComponent<React.ComponentType<P>>,
  fallback: React.ReactNode = React.createElement(DefaultFallback)
): React.FC<P> {
  return (props: P) => {
    return React.createElement(
      Suspense,
      { fallback },
      React.createElement(Component, props)
    );
  };
}

// Preload utility
export function preloadComponent<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): { component: React.LazyExoticComponent<T>; preload: () => void } {
  let preloaded: Promise<{ default: T }> | null = null;

  const component = lazy(() => {
    if (!preloaded) {
      preloaded = factory();
    }
    return preloaded;
  });

  const preload = () => {
    if (!preloaded) {
      preloaded = factory();
    }
  };

  return { component, preload };
}

// Intersection Observer based lazy mount
export interface LazyMountProps {
  children: React.ReactNode;
  rootMargin?: string;
  threshold?: number;
  placeholder?: React.ReactNode;
}

export function createLazyMount(): {
  LazyMount: React.FC<LazyMountProps>;
  useInView: (options?: IntersectionObserverInit) => {
    ref: React.RefObject<HTMLDivElement | null>;
    inView: boolean;
  };
} {
  const useInView = (options: IntersectionObserverInit = {}) => {
    const [inView, setInView] = React.useState(false);
    const ref = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      const el = ref.current;
      if (!el || inView) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px', threshold: 0, ...options }
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, [inView]);

    return { ref, inView };
  };

  const LazyMount: React.FC<LazyMountProps> = ({
    children,
    placeholder = null,
    ...observerOptions
  }) => {
    const { ref, inView } = useInView(observerOptions);

    return React.createElement(
      'div',
      { ref },
      inView ? children : placeholder
    );
  };

  return { LazyMount, useInView };
}

// Route-based code splitting helpers
export const routeComponents = {
  Dashboard: lazyWithRetry(() => import('../pages/DashboardPage')),
  StockDetail: lazyWithRetry(() => import('../pages/StockDetailPage')),
  Portfolio: lazyWithRetry(() => import('../pages/PortfolioPage')),
  Screener: lazyWithRetry(() => import('../pages/ScreenerPage')),
  Watchlist: lazyWithRetry(() => import('../pages/WatchlistPage')),
  News: lazyWithRetry(() => import('../pages/NewsPage')),
  Settings: lazyWithRetry(() => import('../pages/UserSettingsPage')),
} as const;
