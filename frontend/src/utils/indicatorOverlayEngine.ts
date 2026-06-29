/**
 * Technical Indicator Overlay Engine
 *
 * Manages overlay layers for K-line charts:
 * - Combines multiple indicators into renderable overlay groups
 * - Handles indicator scaling (price-scale vs separate-pane)
 * - Calculates overlay intersections and conflicts
 * - Supports custom indicator stacking order
 */

export type IndicatorScale = 'price' | 'volume' | 'separate' | 'percentage';

export interface IndicatorPoint {
  timestamp: number;
  value: number | null;
  label?: string;
}

export interface IndicatorSeries {
  id: string;
  name: string;
  type: 'line' | 'area' | 'bar' | 'band';
  scale: IndicatorScale;
  color: string;
  lineWidth: number;
  opacity: number;
  data: IndicatorPoint[];
  bandData?: { upper: IndicatorPoint[]; lower: IndicatorPoint[] };
  zIndex: number;
  visible: boolean;
}

export interface OverlayGroup {
  id: string;
  scale: IndicatorScale;
  series: IndicatorSeries[];
  yAxisRange: { min: number; max: number };
  height: number; // 0-1 fraction of chart area
}

export interface ChartOverlayConfig {
  groups: OverlayGroup[];
  candleOpacity: number;
  gridLines: number;
  animationDuration: number;
}

/**
 * Create an indicator series from raw OHLCV + indicator values
 */
export function createIndicatorSeries(
  id: string,
  name: string,
  timestamps: number[],
  values: (number | null)[],
  options: Partial<Pick<IndicatorSeries, 'type' | 'scale' | 'color' | 'lineWidth' | 'opacity' | 'zIndex' | 'visible'>> = {}
): IndicatorSeries {
  const data: IndicatorPoint[] = timestamps.map((ts, i) => ({
    timestamp: ts,
    value: values[i] ?? null,
  }));

  return {
    id,
    name,
    type: options.type ?? 'line',
    scale: options.scale ?? 'price',
    color: options.color ?? '#2196F3',
    lineWidth: options.lineWidth ?? 1.5,
    opacity: options.opacity ?? 1,
    data,
    zIndex: options.zIndex ?? 1,
    visible: options.visible ?? true,
  };
}

/**
 * Create a band indicator (e.g., Bollinger Bands)
 */
export function createBandSeries(
  id: string,
  name: string,
  timestamps: number[],
  upperValues: (number | null)[],
  lowerValues: (number | null)[],
  middleValues: (number | null)[],
  options: Partial<Pick<IndicatorSeries, 'scale' | 'color' | 'opacity' | 'zIndex'>> = {}
): IndicatorSeries {
  const line = createIndicatorSeries(id, name, timestamps, middleValues, {
    ...options,
    type: 'line',
  });

  line.bandData = {
    upper: timestamps.map((ts, i) => ({ timestamp: ts, value: upperValues[i] ?? null })),
    lower: timestamps.map((ts, i) => ({ timestamp: ts, value: lowerValues[i] ?? null })),
  };

  return line;
}

/**
 * Group indicators by their scale to form overlay groups
 */
export function groupIndicatorsByScale(series: IndicatorSeries[]): OverlayGroup[] {
  const scaleOrder: IndicatorScale[] = ['price', 'volume', 'separate', 'percentage'];
  const groupMap = new Map<IndicatorScale, IndicatorSeries[]>();

  for (const s of series) {
    if (!s.visible) continue;
    if (!groupMap.has(s.scale)) groupMap.set(s.scale, []);
    groupMap.get(s.scale)!.push(s);
  }

  const groups: OverlayGroup[] = [];
  const visibleScales = scaleOrder.filter(s => groupMap.has(s));

  const heightMap: Record<IndicatorScale, number> = {
    price: 0.6,
    volume: 0.15,
    separate: 0.25,
    percentage: 0.6,
  };

  for (const scale of visibleScales) {
    const items = groupMap.get(scale)!;
    const range = computeYAxisRange(items);
    groups.push({
      id: `group-${scale}`,
      scale,
      series: items.sort((a, b) => a.zIndex - b.zIndex),
      yAxisRange: range,
      height: heightMap[scale],
    });
  }

  return groups;
}

/**
 * Compute Y-axis range for a set of indicator series
 */
export function computeYAxisRange(series: IndicatorSeries[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const s of series) {
    for (const p of s.data) {
      if (p.value === null) continue;
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
    if (s.bandData) {
      for (const p of s.bandData.upper) {
        if (p.value !== null && p.value > max) max = p.value;
      }
      for (const p of s.bandData.lower) {
        if (p.value !== null && p.value < min) min = p.value;
      }
    }
  }

  if (min === Infinity) return { min: 0, max: 100 };

  // Add 5% padding
  const padding = (max - min) * 0.05 || 1;
  return { min: min - padding, max: max + padding };
}

/**
 * Detect overlapping indicators that might visually conflict
 */
export function detectOverlayConflicts(series: IndicatorSeries[]): Array<{
  a: string;
  b: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}> {
  const conflicts: Array<{ a: string; b: string; reason: string; severity: 'low' | 'medium' | 'high' }> = [];
  const visible = series.filter(s => s.visible);

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i];
      const b = visible[j];

      // Same color conflict
      if (a.color === b.color && a.scale === b.scale) {
        conflicts.push({ a: a.id, b: b.id, reason: 'same_color_same_scale', severity: 'high' });
      }

      // Low opacity on high zIndex
      if (a.zIndex > b.zIndex && a.opacity < 0.3 && a.scale === b.scale) {
        conflicts.push({ a: a.id, b: b.id, reason: 'transparent_overlay_hidden', severity: 'medium' });
      }

      // Too many indicators on same scale
      const sameScale = visible.filter(s => s.scale === a.scale);
      if (sameScale.length > 6) {
        conflicts.push({ a: a.id, b: b.id, reason: 'too_many_overlays', severity: 'low' });
        break;
      }
    }
  }

  return conflicts;
}

/**
 * Build full chart overlay config from a set of indicators
 */
export function buildOverlayConfig(
  series: IndicatorSeries[],
  options: Partial<ChartOverlayConfig> = {}
): ChartOverlayConfig {
  const groups = groupIndicatorsByScale(series);
  const _conflicts = detectOverlayConflicts(series);

  // Auto-resolve conflicts by adjusting colors
  const colorPalette = ['#2196F3', '#FF5722', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#795548'];
  let colorIdx = 0;
  const usedColors = new Set<string>();

  for (const g of groups) {
    for (const s of g.series) {
      if (usedColors.has(s.color)) {
        s.color = colorPalette[colorIdx % colorPalette.length];
        colorIdx++;
      }
      usedColors.add(s.color);
    }
  }

  return {
    groups,
    candleOpacity: options.candleOpacity ?? (series.filter(s => s.visible).length > 3 ? 0.6 : 0.9),
    gridLines: options.gridLines ?? 5,
    animationDuration: options.animationDuration ?? 300,
  };
}

/**
 * Interpolate indicator values at a specific timestamp
 */
export function interpolateAtTimestamp(
  series: IndicatorSeries,
  targetTs: number
): number | null {
  const data = series.data;
  if (data.length === 0) return null;

  // Exact match
  const exact = data.find(d => d.timestamp === targetTs);
  if (exact) return exact.value;

  // Find surrounding points
  let before: IndicatorPoint | null = null;
  let after: IndicatorPoint | null = null;

  for (const d of data) {
    if (d.timestamp < targetTs) before = d;
    if (d.timestamp > targetTs) { after = d; break; }
  }

  if (!before || !after) return (before ?? after)?.value ?? null;
  if (before.value === null || after.value === null) return null;

  // Linear interpolation
  const ratio = (targetTs - before.timestamp) / (after.timestamp - before.timestamp);
  return before.value + ratio * (after.value - before.value);
}

/**
 * Calculate percentage overlay (normalized to 0-100 based on first value)
 */
export function createPercentageOverlay(
  series: IndicatorSeries,
  baseValue?: number
): IndicatorSeries {
  const firstNonNull = series.data.find(d => d.value !== null);
  const base = baseValue ?? firstNonNull?.value ?? 1;

  return {
    ...series,
    id: `${series.id}-pct`,
    name: `${series.name} (%)`,
    scale: 'percentage',
    data: series.data.map(d => ({
      timestamp: d.timestamp,
      value: d.value !== null ? ((d.value - base) / base) * 100 : null,
    })),
  };
}

/**
 * Merge two indicator series (take non-null from either)
 */
export function mergeSeries(a: IndicatorSeries, b: IndicatorSeries): IndicatorSeries {
  const tsSet = new Set<number>();
  a.data.forEach(d => tsSet.add(d.timestamp));
  b.data.forEach(d => tsSet.add(d.timestamp));

  const aMap = new Map(a.data.map(d => [d.timestamp, d.value]));
  const bMap = new Map(b.data.map(d => [d.timestamp, d.value]));

  const timestamps = [...tsSet].sort((x, y) => x - y);
  const merged = timestamps.map(ts => ({
    timestamp: ts,
    value: aMap.get(ts) ?? bMap.get(ts) ?? null,
  }));

  return {
    ...a,
    id: `${a.id}+${b.id}`,
    name: `${a.name} + ${b.name}`,
    data: merged,
  };
}

/**
 * Get visible data range for time window
 */
export function getWindowedSeries(
  series: IndicatorSeries,
  startTs: number,
  endTs: number
): IndicatorSeries {
  const filtered = series.data.filter(d => d.timestamp >= startTs && d.timestamp <= endTs);

  const result = { ...series, data: filtered };

  if (series.bandData) {
    result.bandData = {
      upper: series.bandData.upper.filter(d => d.timestamp >= startTs && d.timestamp <= endTs),
      lower: series.bandData.lower.filter(d => d.timestamp >= startTs && d.timestamp <= endTs),
    };
  }

  return result;
}
