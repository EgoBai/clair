/**
 * Image Lazy Loader
 * 图片懒加载工具 - 使用IntersectionObserver
 */

export interface ImageLazyLoadOptions {
  rootMargin?: string;
  threshold?: number;
  placeholder?: string;
  errorImage?: string;
  onLoad?: (img: HTMLImageElement) => void;
  onError?: (img: HTMLImageElement) => void;
}

export class ImageLazyLoader {
  private observer: IntersectionObserver | null = null;
  private images: Set<HTMLImageElement> = new Set();
  private options: Required<ImageLazyLoadOptions>;

  constructor(options: ImageLazyLoadOptions = {}) {
    this.options = {
      rootMargin: '200px',
      threshold: 0,
      placeholder: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      errorImage: '',
      onLoad: () => {},
      onError: () => {},
      ...options,
    };

    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        this.handleIntersection.bind(this),
        {
          rootMargin: this.options.rootMargin,
          threshold: this.options.threshold,
        }
      );
    }
  }

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        this.loadImage(img);
        this.observer?.unobserve(img);
        this.images.delete(img);
      }
    }
  }

  private loadImage(img: HTMLImageElement): void {
    const src = img.dataset.src;
    if (!src) return;

    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = src;
      img.classList.add('loaded');
      this.options.onLoad(img);
    };
    tempImg.onerror = () => {
      if (this.options.errorImage) {
        img.src = this.options.errorImage;
      }
      img.classList.add('error');
      this.options.onError(img);
    };
    tempImg.src = src;
  }

  observe(img: HTMLImageElement): void {
    if (!img.dataset.src && img.src) {
      img.dataset.src = img.src;
      img.src = this.options.placeholder;
    }

    if (this.observer) {
      this.observer.observe(img);
      this.images.add(img);
    } else {
      // Fallback: load immediately
      this.loadImage(img);
    }
  }

  unobserve(img: HTMLImageElement): void {
    this.observer?.unobserve(img);
    this.images.delete(img);
  }

  observeAll(selector: string = 'img[data-src]'): void {
    document.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
      this.observe(img);
    });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.images.clear();
  }

  getPendingCount(): number {
    return this.images.size;
  }
}

export const imageLoader = new ImageLazyLoader();

// Preload critical images
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload: ${src}`));
    img.src = src;
  });
}

export function preloadImages(srcs: string[]): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(srcs.map(preloadImage));
}

// Generate placeholder SVG
export function generatePlaceholder(width: number, height: number, color: string = '#f0f0f0'): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect fill="${color}" width="100%" height="100%"/></svg>`
  )}`;
}
