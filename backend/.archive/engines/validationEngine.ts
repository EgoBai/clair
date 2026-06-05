/**
 * 输入验证引擎
 * Input Validation Engine
 *
 * 通用数据验证、类型转换、A股专用规则
 */

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export type ValidationError = {
  field: string;
  rule: string;
  message: string;
  value?: any;
};

export type ValidationRule = {
  name: string;
  validate: (value: any) => boolean;
  message: string;
};

/**
 * 验证器构建器
 */
export class Validator {
  private rules: Map<string, ValidationRule[]> = new Map();

  /**
   * 添加字段规则
   */
  field(name: string, rules: ValidationRule[]): this {
    const existing = this.rules.get(name) || [];
    this.rules.set(name, [...existing, ...rules]);
    return this;
  }

  /**
   * 验证数据
   */
  validate(data: Record<string, any>): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [fieldName, fieldRules] of this.rules) {
      const value = data[fieldName];

      for (const rule of fieldRules) {
        if (!rule.validate(value)) {
          errors.push({ field: fieldName, rule: rule.name, message: rule.message, value });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ====== 内置规则 ======

export function required(message = '必填字段'): ValidationRule {
  return {
    name: 'required',
    validate: (v) => v !== undefined && v !== null && v !== '',
    message,
  };
}

export function isNumber(message = '必须是数字'): ValidationRule {
  return {
    name: 'number',
    validate: (v) => typeof v === 'number' && !isNaN(v),
    message,
  };
}

export function isString(message = '必须是字符串'): ValidationRule {
  return {
    name: 'string',
    validate: (v) => typeof v === 'string',
    message,
  };
}

export function min(num: number, message?: string): ValidationRule {
  return {
    name: 'min',
    validate: (v) => typeof v === 'number' && v >= num,
    message: message ?? `最小值为 ${num}`,
  };
}

export function max(num: number, message?: string): ValidationRule {
  return {
    name: 'max',
    validate: (v) => typeof v === 'number' && v <= num,
    message: message ?? `最大值为 ${num}`,
  };
}

export function minLength(len: number, message?: string): ValidationRule {
  return {
    name: 'minLength',
    validate: (v) => typeof v === 'string' && v.length >= len,
    message: message ?? `最少 ${len} 个字符`,
  };
}

export function maxLength(len: number, message?: string): ValidationRule {
  return {
    name: 'maxLength',
    validate: (v) => typeof v === 'string' && v.length <= len,
    message: message ?? `最多 ${len} 个字符`,
  };
}

export function pattern(regex: RegExp, message = '格式不正确'): ValidationRule {
  return {
    name: 'pattern',
    validate: (v) => typeof v === 'string' && regex.test(v),
    message,
  };
}

export function isEmail(message = '邮箱格式不正确'): ValidationRule {
  return pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message);
}

export function oneOf(values: any[], message?: string): ValidationRule {
  return {
    name: 'oneOf',
    validate: (v) => values.includes(v),
    message: message ?? `必须是以下之一: ${values.join(', ')}`,
  };
}

export function arrayMinLength(len: number, message?: string): ValidationRule {
  return {
    name: 'arrayMinLength',
    validate: (v) => Array.isArray(v) && v.length >= len,
    message: message ?? `至少需要 ${len} 项`,
  };
}

// ====== A股专用规则 ======

export function stockCode(message = '股票代码格式不正确'): ValidationRule {
  return {
    name: 'stockCode',
    validate: (v) => typeof v === 'string' && /^(sh|sz|bj)\d{6}$/.test(v),
    message,
  };
}

export function stockCodeLoose(message = '股票代码格式不正确'): ValidationRule {
  return {
    name: 'stockCodeLoose',
    validate: (v) => typeof v === 'string' && /^[0-9]{6}$/.test(v),
    message,
  };
}

export function price(message = '价格格式不正确'): ValidationRule {
  return {
    name: 'price',
    validate: (v) => typeof v === 'number' && v > 0 && Number.isFinite(v) && Number(v.toFixed(2)) === v,
    message,
  };
}

export function volume(message = '成交量必须为正整数'): ValidationRule {
  return {
    name: 'volume',
    validate: (v) => typeof v === 'number' && Number.isInteger(v) && v > 0,
    message,
  };
}

export function tradingDate(message = '交易日期格式不正确'): ValidationRule {
  return {
    name: 'tradingDate',
    validate: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)),
    message,
  };
}

export function marketType(message = '市场类型不正确'): ValidationRule {
  return oneOf(['sh', 'sz', 'bj'], message);
}

// ====== 快捷验证函数 ======

/**
 * 快速验证股票代码
 */
export function validateStockCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

/**
 * 快速验证邮箱
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 安全数值解析
 */
export function safeParseNumber(value: any, fallback: number = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 安全整数解析
 */
export function safeParseInt(value: any, fallback: number = 0): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}
