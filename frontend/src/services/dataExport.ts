/**
 * Data Export Service
 * 数据导出服务 - CSV/JSON/Excel格式导出
 */

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export interface ExportOptions {
  filename: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  dateFormat?: string;
}

export function exportToCSV(options: ExportOptions): string {
  const { columns, data } = options;

  // Header
  const header = columns.map(c => escapeCSV(c.label)).join(',');

  // Rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key];
      if (col.format) {
        value = col.format(value);
      }
      return escapeCSV(String(value ?? ''));
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportToJSON(data: Record<string, unknown>[], columns?: ExportColumn[]): string {
  if (columns) {
    const mapped = data.map(row => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        obj[col.label] = col.format ? col.format(row[col.key]) : row[col.key];
      }
      return obj;
    });
    return JSON.stringify(mapped, null, 2);
  }
  return JSON.stringify(data, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
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

export function exportAndDownload(options: ExportOptions, format: 'csv' | 'json' = 'csv'): void {
  const content = format === 'csv'
    ? exportToCSV(options)
    : exportToJSON(options.data, options.columns);

  const mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json';
  const extension = format === 'csv' ? '.csv' : '.json';
  const filename = options.filename.endsWith(extension)
    ? options.filename
    : options.filename + extension;

  downloadFile(content, filename, mimeType);
}

/**
 * Import data from CSV
 */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    result.push(row);
  }

  return result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

/**
 * Copy to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
