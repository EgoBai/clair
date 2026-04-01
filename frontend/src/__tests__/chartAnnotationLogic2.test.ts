import { describe, it, expect } from 'vitest';

/**
 * 图表标注逻辑测试
 * ChartAnnotation 标注/覆盖/数据点逻辑
 */

type AnnotationType = 'line' | 'band' | 'point' | 'label' | 'arrow';

interface Annotation {
  id: string;
  type: AnnotationType;
  value: number | { start: number; end: number };
  label?: string;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  visible: boolean;
}

interface DataPoint {
  x: number;
  y: number;
  timestamp?: number;
}

function filterVisibleAnnotations(annotations: Annotation[]): Annotation[] {
  return annotations.filter(a => a.visible);
}

function findAnnotationsAtValue(
  annotations: Annotation[],
  value: number,
  tolerance = 0
): Annotation[] {
  return annotations.filter(a => {
    if (typeof a.value === 'number') {
      return Math.abs(a.value - value) <= tolerance;
    }
    return value >= a.value.start && value <= a.value.end;
  });
}

function buildAnnotationSVGPath(
  annotation: Annotation,
  chartWidth: number,
  chartHeight: number,
  yScale: (value: number) => number
): string {
  switch (annotation.type) {
    case 'line': {
      const y = yScale(annotation.value as number);
      return `M 0 ${y} L ${chartWidth} ${y}`;
    }
    case 'band': {
      const { start, end } = annotation.value as { start: number; end: number };
      const y1 = yScale(start);
      const y2 = yScale(end);
      return `M 0 ${y1} L ${chartWidth} ${y1} L ${chartWidth} ${y2} L 0 ${y2} Z`;
    }
    case 'point': {
      return ''; // Points use circle elements
    }
    default:
      return '';
  }
}

function sortAnnotationsByValue(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((a, b) => {
    const va = typeof a.value === 'number' ? a.value : a.value.start;
    const vb = typeof b.value === 'number' ? b.value : b.value.start;
    return va - vb;
  });
}

function snapToNearestPoint(
  x: number,
  points: DataPoint[],
  xScale: (value: number) => number
): DataPoint | null {
  if (points.length === 0) return null;
  let nearest = points[0];
  let minDist = Math.abs(xScale(points[0].x) - x);

  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(xScale(points[i].x) - x);
    if (dist < minDist) {
      minDist = dist;
      nearest = points[i];
    }
  }

  return nearest;
}

function calcAnnotationLabelPosition(
  annotation: Annotation,
  chartWidth: number,
  yScale: (value: number) => number
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const y = typeof annotation.value === 'number'
    ? yScale(annotation.value)
    : yScale((annotation.value.start + annotation.value.end) / 2);

  return {
    x: chartWidth - 10,
    y: y - 8,
    anchor: 'end',
  };
}

function mergeOverlappingBands(
  annotations: Annotation[],
  tolerance: number
): Annotation[] {
  const bands = annotations.filter(a => a.type === 'band');
  const others = annotations.filter(a => a.type !== 'band');

  if (bands.length <= 1) return annotations;

  const sorted = sortAnnotationsByValue(bands) as Annotation[];
  const merged: Annotation[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    const prevEnd = (prev.value as { start: number; end: number }).end;
    const currStart = (curr.value as { start: number; end: number }).start;

    if (currStart <= prevEnd + tolerance) {
      // Merge
      merged[merged.length - 1] = {
        ...prev,
        value: {
          start: (prev.value as { start: number; end: number }).start,
          end: Math.max(prevEnd, (curr.value as { start: number; end: number }).end),
        },
      };
    } else {
      merged.push(curr);
    }
  }

  return [...others, ...merged];
}

function validateAnnotation(annotation: Annotation): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!annotation.id) errors.push('id is required');
  if (!annotation.color) errors.push('color is required');

  if (annotation.type === 'line' && typeof annotation.value !== 'number') {
    errors.push('line annotation requires numeric value');
  }

  if (annotation.type === 'band') {
    if (typeof annotation.value === 'number') {
      errors.push('band annotation requires {start, end} value');
    } else {
      if (annotation.value.start >= annotation.value.end) {
        errors.push('band start must be less than end');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function calcAnnotationOpacity(style: 'solid' | 'dashed' | 'dotted'): number {
  return style === 'dotted' ? 0.6 : 1;
}

describe('图表标注逻辑', () => {
  const mockAnnotations: Annotation[] = [
    { id: 'a1', type: 'line', value: 100, label: 'Support', color: 'green', style: 'solid', visible: true },
    { id: 'a2', type: 'line', value: 200, label: 'Resistance', color: 'red', style: 'dashed', visible: true },
    { id: 'a3', type: 'band', value: { start: 150, end: 160 }, color: 'blue', style: 'solid', visible: true },
    { id: 'a4', type: 'point', value: 180, color: 'orange', style: 'solid', visible: false },
  ];

  const mockScale = (v: number) => 300 - v * 1.5;

  describe('filterVisibleAnnotations', () => {
    it('should filter visible', () => {
      expect(filterVisibleAnnotations(mockAnnotations)).toHaveLength(3);
    });
  });

  describe('findAnnotationsAtValue', () => {
    it('should find line at exact value', () => {
      expect(findAnnotationsAtValue(mockAnnotations, 100)).toHaveLength(1);
    });

    it('should find with tolerance', () => {
      expect(findAnnotationsAtValue(mockAnnotations, 102, 5)).toHaveLength(1);
    });

    it('should find band containing value', () => {
      expect(findAnnotationsAtValue(mockAnnotations, 155)).toHaveLength(1);
    });
  });

  describe('buildAnnotationSVGPath', () => {
    it('should build line path', () => {
      const path = buildAnnotationSVGPath(mockAnnotations[0], 600, 300, mockScale);
      expect(path).toContain('M 0');
      expect(path).toContain('L 600');
    });

    it('should build band path', () => {
      const path = buildAnnotationSVGPath(mockAnnotations[2], 600, 300, mockScale);
      expect(path).toContain('Z');
    });
  });

  describe('sortAnnotationsByValue', () => {
    it('should sort by value', () => {
      const sorted = sortAnnotationsByValue(mockAnnotations);
      expect(sorted[0].id).toBe('a1'); // 100
    });
  });

  describe('snapToNearestPoint', () => {
    const points: DataPoint[] = [
      { x: 0, y: 100 },
      { x: 50, y: 150 },
      { x: 100, y: 120 },
    ];
    const scale = (v: number) => v;

    it('should snap to nearest', () => {
      expect(snapToNearestPoint(48, points, scale)?.x).toBe(50);
    });

    it('should return null for empty', () => {
      expect(snapToNearestPoint(0, [], scale)).toBeNull();
    });
  });

  describe('calcAnnotationLabelPosition', () => {
    it('should position label at right edge', () => {
      const pos = calcAnnotationLabelPosition(mockAnnotations[0], 600, mockScale);
      expect(pos.x).toBe(590);
      expect(pos.anchor).toBe('end');
    });
  });

  describe('mergeOverlappingBands', () => {
    it('should merge overlapping bands', () => {
      const bands: Annotation[] = [
        { id: 'b1', type: 'band', value: { start: 100, end: 120 }, color: 'blue', style: 'solid', visible: true },
        { id: 'b2', type: 'band', value: { start: 115, end: 140 }, color: 'blue', style: 'solid', visible: true },
      ];
      const merged = mergeOverlappingBands(bands, 0);
      const bandCount = merged.filter(a => a.type === 'band').length;
      expect(bandCount).toBe(1);
    });

    it('should not merge distant bands', () => {
      const bands: Annotation[] = [
        { id: 'b1', type: 'band', value: { start: 100, end: 110 }, color: 'blue', style: 'solid', visible: true },
        { id: 'b2', type: 'band', value: { start: 200, end: 210 }, color: 'blue', style: 'solid', visible: true },
      ];
      const merged = mergeOverlappingBands(bands, 0);
      expect(merged.filter(a => a.type === 'band')).toHaveLength(2);
    });
  });

  describe('validateAnnotation', () => {
    it('should validate line', () => {
      expect(validateAnnotation(mockAnnotations[0]).valid).toBe(true);
    });

    it('should reject line with non-numeric value', () => {
      const ann: Annotation = { id: 'x', type: 'line', value: { start: 1, end: 2 }, color: 'red', style: 'solid', visible: true };
      expect(validateAnnotation(ann).valid).toBe(false);
    });

    it('should reject band with start >= end', () => {
      const ann: Annotation = { id: 'x', type: 'band', value: { start: 10, end: 5 }, color: 'red', style: 'solid', visible: true };
      expect(validateAnnotation(ann).valid).toBe(false);
    });
  });

  describe('calcAnnotationOpacity', () => {
    it('should return opacity by style', () => {
      expect(calcAnnotationOpacity('solid')).toBe(1);
      expect(calcAnnotationOpacity('dashed')).toBe(1);
      expect(calcAnnotationOpacity('dotted')).toBe(0.6);
    });
  });
});
