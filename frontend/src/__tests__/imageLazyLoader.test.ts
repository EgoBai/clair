import { describe, it, expect } from 'vitest';
import { generatePlaceholder } from '../utils/imageLazyLoader';

describe('generatePlaceholder', () => {
  it('should generate SVG data URI', () => {
    const placeholder = generatePlaceholder(100, 50);
    expect(placeholder).toContain('data:image/svg+xml');
    expect(placeholder).toContain('100');
    expect(placeholder).toContain('50');
  });

  it('should use custom color', () => {
    const placeholder = generatePlaceholder(100, 50, '#ff0000');
    expect(placeholder).toContain('ff0000');
  });

  it('should handle different dimensions', () => {
    const p1 = generatePlaceholder(1, 1);
    const p2 = generatePlaceholder(1920, 1080);
    expect(p1).toContain('1');
    expect(p2).toContain('1920');
    expect(p2).toContain('1080');
  });
});
