/**
 * 图表导出工具
 * 支持PNG/SVG/PDF/CSV格式导出
 */

export type ExportFormat = 'png' | 'svg' | 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  width?: number;
  height?: number;
  quality?: number; // 0-1 for PNG
  backgroundColor?: string;
  includeTitle?: boolean;
  includeTimestamp?: boolean;
}

export interface ChartExportData {
  title: string;
  labels: string[];
  datasets: {
    name: string;
    values: number[];
    color?: string;
  }[];
  metadata?: Record<string, any>;
}

/**
 * 将SVG元素导出为PNG
 */
export async function exportSvgToPng(
  svgElement: SVGElement,
  options: ExportOptions
): Promise<Blob> {
  const width = options.width || svgElement.clientWidth || 800;
  const height = options.height || svgElement.clientHeight || 400;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; // 2x for retina
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);

      if (options.backgroundColor) {
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create PNG blob'));
        },
        'image/png',
        options.quality || 1
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };
    img.src = url;
  });
}

/**
 * 导出SVG字符串
 */
export function exportSvg(svgElement: SVGElement): string {
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgElement);

  // 添加XML声明
  if (!svgString.startsWith('<?xml')) {
    svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
  }

  return svgString;
}

/**
 * 图表数据导出为CSV
 */
export function exportDataToCsv(data: ChartExportData): string {
  const lines: string[][] = [];

  // 标题行
  if (data.title) {
    lines.push([`# ${data.title}`]);
    lines.push([]);
  }

  // 表头
  const headers = ['标签', ...data.datasets.map(d => d.name)];
  lines.push(headers);

  // 数据行
  for (let i = 0; i < data.labels.length; i++) {
    const row = [
      data.labels[i],
      ...data.datasets.map(d => String(d.values[i] ?? '')),
    ];
    lines.push(row);
  }

  // 元数据
  if (data.metadata) {
    lines.push([]);
    lines.push(['# 元数据']);
    Object.entries(data.metadata).forEach(([key, val]) => {
      lines.push([key, String(val)]);
    });
  }

  return lines.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/**
 * 图表数据导出为JSON
 */
export function exportDataToJson(data: ChartExportData): string {
  const exportObj = {
    title: data.title,
    exportedAt: new Date().toISOString(),
    labels: data.labels,
    datasets: data.datasets.map(d => ({
      name: d.name,
      data: d.values,
      color: d.color,
    })),
    metadata: data.metadata,
  };
  return JSON.stringify(exportObj, null, 2);
}

/**
 * 下载文件
 */
export function downloadFile(content: string | Blob, filename: string, mimeType?: string): void {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;\uFEFF' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成带时间戳的文件名
 */
export function generateFilename(baseName: string, format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  return `${baseName}_${timestamp}.${format}`;
}

/**
 * 通用图表导出函数
 */
export async function exportChart(
  svgElement: SVGElement | null,
  data: ChartExportData,
  options: ExportOptions
): Promise<void> {
  const filename = options.filename || generateFilename(data.title || 'chart', options.format);

  switch (options.format) {
    case 'png': {
      if (!svgElement) throw new Error('SVG element required for PNG export');
      const blob = await exportSvgToPng(svgElement, options);
      downloadFile(blob, filename);
      break;
    }
    case 'svg': {
      if (!svgElement) throw new Error('SVG element required for SVG export');
      const svgString = exportSvg(svgElement);
      downloadFile(svgString, filename, 'image/svg+xml');
      break;
    }
    case 'csv': {
      const csv = exportDataToCsv(data);
      downloadFile(csv, filename, 'text/csv');
      break;
    }
    case 'json': {
      const json = exportDataToJson(data);
      downloadFile(json, filename, 'application/json');
      break;
    }
  }
}

/**
 * 批量导出多个图表
 */
export async function exportMultipleCharts(
  charts: { svgElement?: SVGElement; data: ChartExportData; options: ExportOptions }[]
): Promise<void> {
  for (const chart of charts) {
    await exportChart(chart.svgElement || null, chart.data, chart.options);
    // 延迟以避免浏览器阻止连续下载
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/**
 * 复制图表到剪贴板
 */
export async function copyChartToClipboard(svgElement: SVGElement): Promise<void> {
  const blob = await exportSvgToPng(svgElement, { format: 'png', quality: 1 });
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
  } catch {
    throw new Error('剪贴板写入失败，可能需要用户授权');
  }
}
