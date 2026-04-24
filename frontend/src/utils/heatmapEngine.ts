/**
 * Heatmap Rendering Engine
 *
 * 板块热力图、资金流向热力图、市场情绪热力图
 */

export type HeatmapMetric = 'change' | 'volume' | 'capital' | 'sentiment' | 'turnover';
export type HeatmapColorScheme = 'redGreen' | 'blueRed' | 'greenYellow' | 'monochrome';

export interface HeatmapCell {
  id: string;
  label: string;
  value: number;
  size: number; // relative weight for area
  metadata?: Record<string, unknown>;
}

export interface HeatmapGroup {
  id: string;
  label: string;
  cells: HeatmapCell[];
}

export interface HeatmapConfig {
  metric: HeatmapMetric;
  colorScheme: HeatmapColorScheme;
  minValue: number;
  maxValue: number;
  cellPadding: number;
  borderRadius: number;
  showLabels: boolean;
  showValues: boolean;
  animationDuration: number;
}

export interface HeatmapRenderResult {
  groups: Array<{
    id: string;
    label: string;
    cells: Array<{
      id: string;
      label: string;
      value: number;
      color: string;
      x: number;
      y: number;
      width: number;
      height: number;
      fontSize: number;
    }>;
  }>;
  totalWidth: number;
  totalHeight: number;
  legend: Array<{ value: number; color: string }>;
}

/**
 * 从值获取颜色
 */
export function getColorForValue(
  value: number,
  config: Pick<HeatmapConfig, 'colorScheme' | 'minValue' | 'maxValue'>
): string {
  const { colorScheme, minValue, maxValue } = config;
  const range = maxValue - minValue || 1;
  const t = Math.max(0, Math.min(1, (value - minValue) / range));

  switch (colorScheme) {
    case 'redGreen':
      // Red (negative) → Gray (zero) → Green (positive)
      if (t < 0.5) {
        const intensity = t * 2;
        return rgbToHex(
          Math.round(200 + 55 * (1 - intensity)),
          Math.round(60 + 40 * intensity),
          60
        );
      } else {
        const intensity = (t - 0.5) * 2;
        return rgbToHex(
          Math.round(60 + 40 * (1 - intensity)),
          Math.round(180 + 75 * intensity),
          Math.round(60 + 40 * (1 - intensity))
        );
      }

    case 'blueRed':
      return rgbToHex(
        Math.round(t * 255),
        Math.round((1 - t) * 100),
        Math.round((1 - t) * 255)
      );

    case 'greenYellow':
      return rgbToHex(
        Math.round(50 + t * 205),
        Math.round(200 - t * 50),
        50
      );

    case 'monochrome': {
      const shade = Math.round(255 - t * 180);
      return rgbToHex(shade, shade, shade);
    }

    default:
      return '#888888';
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 布局算法：Squarified Treemap
 * 优化矩形长宽比，使色块尽可能接近正方形
 */
export function squarify(
  cells: HeatmapCell[],
  x: number,
  y: number,
  width: number,
  height: number,
  padding: number
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (cells.length === 0) return [];

  const totalSize = cells.reduce((s, c) => s + c.size, 0);
  if (totalSize === 0) return [];

  const sorted = [...cells].sort((a, b) => b.size - a.size);
  const result: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

  let remaining = [...sorted];
  let cx = x;
  let cy = y;
  let cw = width;
  let ch = height;
  let remainingTotal = totalSize;

  while (remaining.length > 0) {
    const isHorizontal = cw >= ch;
    const side = isHorizontal ? ch : cw;
    const area = isHorizontal ? cw * ch : ch * cw;

    // Lay out a row/column
    const row: HeatmapCell[] = [remaining[0]];
    let rowSize = remaining[0].size;
    let remainingAfter = remaining.slice(1);

    const worstRatio = (cells: HeatmapCell[], side: number, total: number, area: number) => {
      const rowArea = cells.reduce((s, c) => s + c.size, 0) / total * area;
      const rowWidth = rowArea / side;
      return Math.max(
        ...cells.map(c => {
          const cellH = (c.size / total) * area / rowWidth;
          return Math.max(rowWidth / cellH, cellH / rowWidth);
        })
      );
    };

    for (let i = 1; i < remaining.length; i++) {
      const candidate = [...row, remaining[i]];
      if (worstRatio(candidate, side, remainingTotal, area) <= worstRatio(row, side, remainingTotal, area)) {
        row.push(remaining[i]);
        rowSize += remaining[i].size;
        remainingAfter = remaining.slice(i + 1);
      } else {
        remainingAfter = remaining.slice(i);
        break;
      }
    }

    // Position cells in the row
    const rowArea = rowSize / remainingTotal * (isHorizontal ? cw * ch : ch * cw);
    const rowWidth = rowArea / side;
    let offset = 0;

    for (const cell of row) {
      const cellHeight = (cell.size / rowSize) * side;
      result.push({
        id: cell.id,
        x: isHorizontal ? cx : cx + offset,
        y: isHorizontal ? cy + offset : cy,
        width: isHorizontal ? rowWidth : cellHeight,
        height: isHorizontal ? cellHeight : rowWidth,
      });
      offset += cellHeight;
    }

    // Update remaining area
    if (isHorizontal) {
      cx += rowWidth;
      cw -= rowWidth;
    } else {
      cy += rowWidth;
      ch -= rowWidth;
    }

    remainingTotal -= rowSize;
    remaining = remainingAfter;
  }

  // Apply padding
  return result.map(r => ({
    ...r,
    x: r.x + padding,
    y: r.y + padding,
    width: Math.max(0, r.width - padding * 2),
    height: Math.max(0, r.height - padding * 2),
  }));
}

/**
 * 渲染热力图
 */
export function renderHeatmap(
  groups: HeatmapGroup[],
  config: HeatmapConfig,
  width: number,
  height: number
): HeatmapRenderResult {
  const totalCells = groups.flatMap(g => g.cells);
  const allValues = totalCells.map(c => c.value);

  const effectiveMin = config.minValue ?? Math.min(...allValues);
  const effectiveMax = config.maxValue ?? Math.max(...allValues);

  const colorConfig = { colorScheme: config.colorScheme, minValue: effectiveMin, maxValue: effectiveMax };
  const groupHeight = height / groups.length;
  const renderedGroups: HeatmapRenderResult['groups'] = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const layouts = squarify(group.cells, 0, gi * groupHeight, width, groupHeight, config.cellPadding);

    const renderedCells = group.cells.map(cell => {
      const layout = layouts.find(l => l.id === cell.id) || { x: 0, y: 0, width: 0, height: 0 };
      const minDim = Math.min(layout.width, layout.height);
      const fontSize = Math.max(8, Math.min(14, minDim * 0.3));

      return {
        id: cell.id,
        label: cell.label,
        value: cell.value,
        color: getColorForValue(cell.value, colorConfig),
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        fontSize,
      };
    });

    renderedGroups.push({
      id: group.id,
      label: group.label,
      cells: renderedCells,
    });
  }

  // Generate legend
  const steps = 10;
  const legend: Array<{ value: number; color: string }> = [];
  for (let i = 0; i <= steps; i++) {
    const value = effectiveMin + (effectiveMax - effectiveMin) * (i / steps);
    legend.push({ value: Math.round(value * 100) / 100, color: getColorForValue(value, colorConfig) });
  }

  return {
    groups: renderedGroups,
    totalWidth: width,
    totalHeight: height,
    legend,
  };
}

/**
 * 计算市场情绪值
 */
export function calculateSentiment(
  upCount: number,
  downCount: number,
  flatCount: number
): number {
  const total = upCount + downCount + flatCount;
  if (total === 0) return 0;
  return (upCount - downCount) / total;
}

/**
 * 生成板块数据分组
 */
export function groupBySector(
  items: Array<{ id: string; name: string; sector: string; value: number; weight: number }>
): HeatmapGroup[] {
  const sectorMap = new Map<string, HeatmapCell[]>();

  for (const item of items) {
    if (!sectorMap.has(item.sector)) {
      sectorMap.set(item.sector, []);
    }
    sectorMap.get(item.sector)!.push({
      id: item.id,
      label: item.name,
      value: item.value,
      size: item.weight,
    });
  }

  return [...sectorMap.entries()].map(([sector, cells]) => ({
    id: sector.toLowerCase().replace(/\s+/g, '-'),
    label: sector,
    cells,
  }));
}
