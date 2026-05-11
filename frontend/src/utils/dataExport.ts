import logger from './logger';
/**
 * 数据导出工具
 * 支持导出为 CSV / JSON / 格式化文本
 * 可扩展 Excel (xlsx) 和 PDF
 */

interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

interface ExportOptions {
  filename?: string;
  columns?: ExportColumn[];
  encoding?: string;
  includeHeader?: boolean;
  dateFormat?: 'iso' | 'locale' | 'short';
}

/**
 * 导出为 CSV
 */
export function exportToCSV(data: Record<string, any>[], options: ExportOptions = {}): void {
  const {
    filename = `export_${formatDateForFile()}`,
    columns,
    encoding = 'utf-8',
    includeHeader = true,
  } = options;

  if (!data.length) {
    logger.warn('导出数据为空');
    return;
  }

  const cols: ExportColumn[] = columns || Object.keys(data[0]).map(key => ({ key, label: key }));
  const lines: string[] = [];

  // BOM 头（Excel 中文兼容）
  const bom = encoding === 'utf-8' ? '\uFEFF' : '';

  // 表头
  if (includeHeader) {
    lines.push(cols.map(c => escapeCSV(c.label)).join(','));
  }

  // 数据行
  for (const row of data) {
    const values = cols.map(c => {
      let val = row[c.key];
      if (c.format) {
        val = c.format(val);
      } else if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'number') {
        val = String(val);
      }
      return escapeCSV(String(val));
    });
    lines.push(values.join(','));
  }

  const content = bom + lines.join('\n');
  downloadFile(content, `${filename}.csv`, 'text/csv;charset=utf-8');
}

/**
 * 导出为 JSON
 */
export function exportToJSON(data: any[], options: ExportOptions = {}): void {
  const { filename = `export_${formatDateForFile()}` } = options;
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, `${filename}.json`, 'application/json');
}

/**
 * 导出为格式化文本表格
 */
export function exportToText(data: Record<string, any>[], options: ExportOptions = {}): void {
  const { filename = `export_${formatDateForFile()}`, columns } = options;

  if (!data.length) return;

  const cols: ExportColumn[] = columns || Object.keys(data[0]).map(key => ({ key, label: key }));

  // 计算每列最大宽度
  const widths = cols.map(c => {
    const headerWidth = c.label.length;
    const dataWidth = Math.max(...data.map(row => {
      const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '');
      return val.length;
    }));
    return Math.max(headerWidth, dataWidth, 6);
  });

  const pad = (str: string, width: number) => str.padEnd(width, ' ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  const lines: string[] = [];

  // 表头
  lines.push(cols.map((c, i) => pad(c.label, widths[i])).join(' | '));
  lines.push(separator);

  // 数据
  for (const row of data) {
    const values = cols.map((c, i) => {
      const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '-');
      return pad(val, widths[i]);
    });
    lines.push(values.join(' | '));
  }

  downloadFile(lines.join('\n'), `${filename}.txt`, 'text/plain');
}

/**
 * 股票数据专用导出列定义
 */
export const STOCK_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'symbol', label: '股票代码' },
  { key: 'name', label: '股票名称' },
  { key: 'price', label: '最新价', format: v => v?.toFixed(2) ?? '' },
  { key: 'changePercent', label: '涨跌幅(%)', format: v => v !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '' },
  { key: 'change', label: '涨跌额', format: v => v?.toFixed(2) ?? '' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v) },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v) },
  { key: 'turnoverRate', label: '换手率(%)', format: v => v?.toFixed(2) ?? '' },
  { key: 'peRatio', label: '市盈率', format: v => v?.toFixed(2) ?? '-' },
  { key: 'pbRatio', label: '市净率', format: v => v?.toFixed(2) ?? '-' },
  { key: 'marketCap', label: '总市值', format: v => formatTurnover(v) },
  { key: 'industry', label: '行业' },
];

/**
 * K线数据导出列
 */
export const KLINE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'tradeDate', label: '日期' },
  { key: 'open', label: '开盘价', format: v => v?.toFixed(2) ?? '' },
  { key: 'high', label: '最高价', format: v => v?.toFixed(2) ?? '' },
  { key: 'low', label: '最低价', format: v => v?.toFixed(2) ?? '' },
  { key: 'close', label: '收盘价', format: v => v?.toFixed(2) ?? '' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v) },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v) },
];

/**
 * 回测结果导出列
 */
export const BACKTEST_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date', label: '日期' },
  { key: 'type', label: '操作', format: v => v === 'buy' ? '买入' : '卖出' },
  { key: 'price', label: '价格', format: v => v?.toFixed(2) ?? '' },
  { key: 'quantity', label: '数量' },
  { key: 'amount', label: '金额', format: v => v?.toFixed(2) ?? '' },
  { key: 'commission', label: '手续费', format: v => v?.toFixed(2) ?? '' },
  { key: 'reason', label: '原因' },
];

// ==================== 工具函数 ====================

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatDateForFile(): string {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

function formatVolume(v: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (v === 0) return '0';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
  return v.toString();
}

function formatTurnover(v: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (v === 0) return '0.00';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
  return v.toFixed(2);
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export { formatVolume, formatTurnover };

// ==================== 图片导出 ====================

/**
 * 导出图表为图片 (PNG)
 */
export async function exportToImage(
  element: HTMLElement,
  filename: string = `chart_${formatDateForFile()}`
): Promise<void> {
  try {
    // 使用 html2canvas 或原生方式
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 尝试使用 SVG foreignObject 截图
    const svgData = await elementToSVG(element);
    if (svgData) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width * 2; // 2x for retina
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        canvasToBlob(canvas, filename);
      };
      img.src = svgData;
    } else {
      // Fallback: 使用 dom-to-image 思路
      logger.warn('[Export] 图片导出需要 html2canvas 库支持');
    }
  } catch (err) {
    logger.error('[Export] 图片导出失败:', err);
  }
}

/**
 * 从 ECharts 实例导出图片
 */
export function exportChartImage(
  chartInstance: { getDataURL: (opts: { type: string; pixelRatio: number; backgroundColor: string }) => string },
  filename: string = `chart_${formatDateForFile()}`
): void {
  try {
    const dataUrl = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    logger.error('[Export] ECharts 图片导出失败:', err);
  }
}

/**
 * 从 Canvas 元素导出图片
 */
export function exportCanvasImage(
  canvas: HTMLCanvasElement,
  filename: string = `image_${formatDateForFile()}`
): void {
  canvasToBlob(canvas, filename);
}

async function elementToSVG(element: HTMLElement): Promise<string | null> {
  try {
    const serializer = new XMLSerializer();
    const clone = element.cloneNode(true) as HTMLElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const html = serializer.serializeToString(clone);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${element.offsetWidth}" height="${element.offsetHeight}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">${html}</div>
        </foreignObject>
      </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ==================== PDF 导出 ====================

/**
 * 导出数据为 PDF（简单表格样式）
 * 依赖 window.print() 实现，生成可打印视图
 */
export function exportToPrint(data: Record<string, any>[], options: ExportOptions = {}): void {
  const {
    filename = `report_${formatDateForFile()}`,
    columns,
  } = options;

  if (!data.length) return;

  const cols: ExportColumn[] = columns || Object.keys(data[0]).map(key => ({ key, label: key }));

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f5f5f5; padding: 8px 12px; text-align: left; border: 1px solid #ddd; font-weight: 600; }
    td { padding: 6px 12px; border: 1px solid #ddd; }
    .positive { color: #f5222d; }
    .negative { color: #52c41a; }
    .footer { margin-top: 20px; font-size: 11px; color: #999; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>A股行情数据</h1>
  <table>
    <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
    <tbody>
      ${data.map(row => `<tr>${cols.map(c => {
        const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '');
        const isPositive = val.startsWith('+');
        const isNegative = val.startsWith('-') && !val.startsWith('-0.00');
        return `<td class="${isPositive ? 'positive' : isNegative ? 'negative' : ''}">${val}</td>`;
      }).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <div class="footer">导出时间: ${new Date().toLocaleString('zh-CN')} | A股行情分析平台</div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  }
}
