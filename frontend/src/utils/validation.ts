/**
 * Data Validation Utilities
 * 数据校验工具 - 股票数据输入验证
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationRule<T> {
  name: string;
  validate: (value: T) => boolean;
  message: string;
}

export function validate(value: unknown, rules: ValidationRule<unknown>[]): ValidationResult {
  const errors: string[] = [];
  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Stock code validation
export function isValidStockCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export function validateStockCode(code: string): ValidationResult {
  if (!code) return { valid: false, errors: ['股票代码不能为空'] };
  if (!isValidStockCode(code)) return { valid: false, errors: ['股票代码必须是6位数字'] };
  return { valid: true, errors: [] };
}

// Price validation
export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && !isNaN(price) && price >= 0 && price <= 100000;
}

export function validatePrice(price: unknown): ValidationResult {
  if (price === null || price === undefined) return { valid: false, errors: ['价格不能为空'] };
  const num = Number(price);
  if (isNaN(num)) return { valid: false, errors: ['价格必须是数字'] };
  if (num < 0) return { valid: false, errors: ['价格不能为负数'] };
  if (num > 100000) return { valid: false, errors: ['价格超出范围'] };
  return { valid: true, errors: [] };
}

// Quantity validation
export function isValidQuantity(qty: number): boolean {
  return Number.isInteger(qty) && qty > 0 && qty <= 1000000 && qty % 100 === 0;
}

export function validateQuantity(qty: unknown): ValidationResult {
  if (qty === null || qty === undefined) return { valid: false, errors: ['数量不能为空'] };
  const num = Number(qty);
  if (isNaN(num)) return { valid: false, errors: ['数量必须是数字'] };
  if (!Number.isInteger(num)) return { valid: false, errors: ['数量必须是整数'] };
  if (num <= 0) return { valid: false, errors: ['数量必须大于0'] };
  if (num > 1000000) return { valid: false, errors: ['数量超出范围'] };
  // Must be multiple of 100 for A-shares
  if (num % 100 !== 0) return { valid: false, errors: ['A股数量必须是100的整数倍'] };
  return { valid: true, errors: [] };
}

// Percentage validation
export function isValidPercent(value: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= -100 && value <= 100;
}

// Date validation
export function isValidTradeDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parts = date.split('-').map(Number);
  const [year, month, day] = parts;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

// Order validation
export interface OrderInput {
  stockCode: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
}

export function validateOrder(order: Partial<OrderInput>): ValidationResult {
  const errors: string[] = [];

  const codeResult = validateStockCode(order.stockCode ?? '');
  errors.push(...codeResult.errors);

  const priceResult = validatePrice(order.price);
  errors.push(...priceResult.errors);

  const qtyResult = validateQuantity(order.quantity);
  errors.push(...qtyResult.errors);

  if (order.side !== 'buy' && order.side !== 'sell') {
    errors.push('交易方向必须是买入或卖出');
  }

  return { valid: errors.length === 0, errors };
}

// Range validation
export function isInRange(value: number, min: number, max: number): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
}

// Sanitization
export function sanitizeStockCode(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[^0-9]/g, '').slice(0, 6);
}

export function sanitizePrice(input: string): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[^\d.]/g, '');
  // Reject multiple dots (e.g. "10.5.3")
  if ((cleaned.match(/\./g) || []).length > 1) return null;
  // Reject empty or just a dot
  if (!cleaned || cleaned === '.') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

export function sanitizeQuantity(input: string): number | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return null;
  // Round down to nearest 100
  return Math.floor(num / 100) * 100;
}

/**
 * 清理自由文本输入（股票名、备注等），防XSS
 * Strips HTML tags and dangerous patterns from free-text input
 */
export function sanitizeText(input: string, maxLength: number = 200): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // remove script tags + content
    .replace(/<[^>]*>/g, '')           // strip remaining HTML tags
    .replace(/javascript:/gi, '')      // remove javascript: protocol
    .replace(/on\w+\s*=/gi, '')        // remove event handlers
    .replace(/[<>]/g, '')              // remove remaining angle brackets
    .trim()
    .slice(0, maxLength);
}

/**
 * 验证自由文本输入（含长度和XSS检测）
 */
export function validateText(
  input: string,
  opts: { minLength?: number; maxLength?: number; required?: boolean } = {}
): ValidationResult {
  const { minLength = 0, maxLength = 200, required = false } = opts;
  const errors: string[] = [];

  if (typeof input !== 'string') {
    return { valid: false, errors: ['输入必须是字符串'] };
  }

  const trimmed = input.trim();

  if (required && trimmed.length === 0) {
    errors.push('不能为空');
  }

  if (trimmed.length < minLength) {
    errors.push(`长度不能少于${minLength}个字符`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`长度不能超过${maxLength}个字符`);
  }

  // XSS pattern detection
  const xssPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i, /<iframe/i, /<object/i];
  if (xssPatterns.some(p => p.test(input))) {
    errors.push('输入包含不安全内容');
  }

  return { valid: errors.length === 0, errors };
}
