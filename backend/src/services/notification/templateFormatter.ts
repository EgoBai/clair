/**
 * 通知模板变量格式化器
 * 支持数字格式化、日期格式化、条件格式化、股票数据格式化
 */

/** 数字格式化选项 */
export interface NumberFormatOptions {
  decimals?: number;
  thousandsSeparator?: string;
  decimalSeparator?: string;
  prefix?: string;
  suffix?: string;
  percentageMode?: boolean;
  chineseUnit?: boolean;  // 万/亿
}

/** 日期格式化选项 */
export interface DateFormatOptions {
  format?: string;
  timezone?: string;
  relative?: boolean;   // 相对时间（3分钟前）
}

/** 条件格式规则 */
export interface ConditionalFormatRule {
  condition: string;     // e.g., ">0", "<0", "==true"
  positiveValue: string;
  negativeValue: string;
  neutralValue?: string;
}

/** 格式化函数类型 */
export type FormatterFn = (value: unknown, options?: Record<string, unknown>) => string;

export class TemplateFormatter {
  private formatters: Map<string, FormatterFn> = new Map();

  constructor() {
    this.registerDefaultFormatters();
  }

  /** 注册格式化函数 */
  register(name: string, fn: FormatterFn): void {
    this.formatters.set(name, fn);
  }

  /** 执行格式化 */
  format(name: string, value: unknown, options?: Record<string, unknown>): string {
    const fn = this.formatters.get(name);
    if (!fn) return String(value ?? '');
    return fn(value, options);
  }

  /** 渲染模板字符串 */
  render(template: string, data: Record<string, unknown>): string {
    // 支持 {{var | formatter:option}} 语法
    return template.replace(/\{\{(\w+)(?:\s*\|\s*(\w+)(?::([^}]*))?)?\}\}/g, (_match, varName, formatterName, optionsStr) => {
      const value = data[varName];
      if (value === undefined || value === null) return '';

      if (formatterName) {
        let options: Record<string, unknown> = {};
        if (optionsStr) {
          try {
            options = JSON.parse(`{${optionsStr}}`);
          } catch {
            // 解析为key=value格式
            optionsStr.split(',').forEach((pair: string) => {
              const [k, v] = pair.trim().split('=');
              if (k) options[k.trim()] = v?.trim();
            });
          }
        }
        return this.format(formatterName, value, options);
      }

      return String(value);
    });
  }

  /** 注册默认格式化器 */
  private registerDefaultFormatters(): void {
    // 数字格式化
    this.register('number', (value, opts) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const o = (opts || {}) as NumberFormatOptions;
      const decimals = o.decimals ?? 2;
      const formatted = num.toFixed(decimals);
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, o.thousandsSeparator ?? ',');
      let result = parts.join(o.decimalSeparator ?? '.');
      if (o.prefix) result = o.prefix + result;
      if (o.suffix) result = result + o.suffix;
      return result;
    });

    // 百分比
    this.register('percent', (value, opts) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const o = (opts || {}) as NumberFormatOptions;
      const decimals = o.decimals ?? 2;
      const sign = num > 0 ? '+' : '';
      return `${sign}${num.toFixed(decimals)}%`;
    });

    // 中文单位（万/亿）
    this.register('chineseUnit', (value) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      if (Math.abs(num) >= 100000000) return `${(num / 100000000).toFixed(2)}亿`;
      if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(2)}万`;
      return num.toFixed(2);
    });

    // 金额
    this.register('currency', (value, opts) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const o = (opts || {}) as Record<string, string>;
      const symbol = o.symbol ?? '¥';
      return `${symbol}${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });

    // 条件格式化
    this.register('conditional', (value, opts) => {
      const num = Number(value);
      const o = (opts || {}) as Record<string, string>;
      if (num > 0) return o.positive || `+${num}`;
      if (num < 0) return o.negative || String(num);
      return o.neutral || '0';
    });

    // 股票涨跌颜色
    this.register('changeColor', (value) => {
      const num = Number(value);
      if (isNaN(num)) return '#888';
      if (num > 0) return '#ff4d4f';  // 红
      if (num < 0) return '#52c41a';  // 绿
      return '#888';
    });

    // 股票涨跌标签
    this.register('changeLabel', (value) => {
      const num = Number(value);
      if (isNaN(num)) return '';
      if (num > 0) return `📈 +${num}%`;
      if (num < 0) return `📉 ${num}%`;
      return '➡️ 0%';
    });

    // 相对时间
    this.register('relativeTime', (value) => {
      const ts = Number(value);
      if (isNaN(ts)) return String(value);
      const diff = Date.now() - ts;
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return '刚刚';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
      if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;
      return new Date(ts).toLocaleDateString('zh-CN');
    });

    // 股票代码格式化
    this.register('stockCode', (value) => {
      const code = String(value);
      if (code.startsWith('6')) return `SH.${code}`;
      if (code.startsWith('0') || code.startsWith('3')) return `SZ.${code}`;
      if (code.startsWith('8') || code.startsWith('4')) return `BJ.${code}`;
      return code;
    });

    // 大数字简写
    this.register('compact', (value) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      if (Math.abs(num) >= 1e8) return `${(num / 1e8).toFixed(1)}亿`;
      if (Math.abs(num) >= 1e4) return `${(num / 1e4).toFixed(1)}万`;
      if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}k`;
      return String(Math.round(num));
    });

    // 截断文本
    this.register('truncate', (value, opts) => {
      const str = String(value);
      const maxLen = Number((opts as Record<string, unknown>)?.length) || 50;
      if (str.length <= maxLen) return str;
      return str.slice(0, maxLen) + '...';
    });

    // 大写金额
    this.register('chineseAmount', (value) => {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const chars = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
      const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];
      const intPart = Math.floor(Math.abs(num));
      const str = String(intPart);
      let result = '';
      for (let i = 0; i < str.length; i++) {
        const digit = parseInt(str[i]);
        const unitIdx = str.length - 1 - i;
        result += chars[digit] + (units[unitIdx] || '');
      }
      return result || '零';
    });
  }

  /** 获取所有格式化器名称 */
  getFormatterNames(): string[] {
    return Array.from(this.formatters.keys());
  }

  /** 清空 */
  clear(): void {
    this.formatters.clear();
    this.registerDefaultFormatters();
  }
}

export const templateFormatter = new TemplateFormatter();
