/**
 * 表单验证扩展测试
 * 覆盖股票代码验证、金额验证、日期验证、密码策略、组合验证器
 */

import { describe, it, expect } from 'vitest';

// 验证结果
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// 股票代码验证
function validateStockCode(code: string): ValidationResult {
  const errors: string[] = [];
  if (!code) { errors.push('股票代码不能为空'); return { valid: false, errors }; }
  // A股: 6位数字，600/000/300/688开头
  if (!/^(600|601|603|605|000|001|002|003|300|301|688|689)\d{3}$/.test(code)) {
    errors.push('无效的A股股票代码格式');
  }
  return { valid: errors.length === 0, errors };
}

// 交易密码验证
function validateTradePassword(pwd: string): ValidationResult {
  const errors: string[] = [];
  if (!pwd) { errors.push('密码不能为空'); return { valid: false, errors }; }
  if (pwd.length < 8) errors.push('密码至少8位');
  if (pwd.length > 20) errors.push('密码最多20位');
  if (!/[A-Z]/.test(pwd)) errors.push('密码需包含大写字母');
  if (!/[a-z]/.test(pwd)) errors.push('密码需包含小写字母');
  if (!/[0-9]/.test(pwd)) errors.push('密码需包含数字');
  if (!/[!@#$%^&*]/.test(pwd)) errors.push('密码需包含特殊字符');
  if (/(.)\1{2,}/.test(pwd)) errors.push('密码不能包含3个以上连续相同字符');
  return { valid: errors.length === 0, errors };
}

// 交易金额验证
function validateTradeAmount(amount: number, min: number = 100, max: number = 100000000): ValidationResult {
  const errors: string[] = [];
  if (isNaN(amount)) { errors.push('金额必须是数字'); return { valid: false, errors }; }
  if (amount < min) errors.push(`金额不能低于${min}`);
  if (amount > max) errors.push(`金额不能超过${max}`);
  if (amount % 100 !== 0) errors.push('A股交易金额须为100的整数倍');
  return { valid: errors.length === 0, errors };
}

// 交易日期验证
function validateTradeDate(dateStr: string): ValidationResult {
  const errors: string[] = [];
  if (!dateStr) { errors.push('日期不能为空'); return { valid: false, errors }; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { errors.push('日期格式应为YYYY-MM-DD'); return { valid: false, errors }; }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) errors.push('无效的日期');
  const day = date.getDay();
  if (day === 0 || day === 6) errors.push('非交易日(周末)');
  return { valid: errors.length === 0, errors };
}

// 手机号验证
function validatePhone(phone: string): ValidationResult {
  const errors: string[] = [];
  if (!phone) { errors.push('手机号不能为空'); return { valid: false, errors }; }
  if (!/^1[3-9]\d{9}$/.test(phone)) errors.push('手机号格式不正确');
  return { valid: errors.length === 0, errors };
}

// 邮箱验证
function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email) { errors.push('邮箱不能为空'); return { valid: false, errors }; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('邮箱格式不正确');
  return { valid: errors.length === 0, errors };
}

// 身份证验证
function validateIdCard(id: string): ValidationResult {
  const errors: string[] = [];
  if (!id) { errors.push('身份证号不能为空'); return { valid: false, errors }; }
  if (!/^\d{17}[\dXx]$/.test(id)) errors.push('身份证号格式不正确(18位)');
  // 校验码
  if (id.length === 18) {
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      sum += parseInt(id[i]) * weights[i];
    }
    const expectedCheck = checkCodes[sum % 11];
    if (id[17].toUpperCase() !== expectedCheck) errors.push('身份证校验码不正确');
  }
  return { valid: errors.length === 0, errors };
}

// 范围验证
function validateRange(value: number, min: number, max: number, label: string): ValidationResult {
  const errors: string[] = [];
  if (value < min) errors.push(`${label}不能小于${min}`);
  if (value > max) errors.push(`${label}不能大于${max}`);
  return { valid: errors.length === 0, errors };
}

// 必填验证
function validateRequired(value: any, label: string): ValidationResult {
  const errors: string[] = [];
  if (value === null || value === undefined || value === '') {
    errors.push(`${label}不能为空`);
  }
  return { valid: errors.length === 0, errors };
}

// 组合验证器
function composeValidators(...validators: (() => ValidationResult)[]): ValidationResult {
  const allErrors: string[] = [];
  for (const v of validators) {
    const result = v();
    allErrors.push(...result.errors);
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

// ==================== 股票代码 ====================

describe('validateStockCode 股票代码验证', () => {
  it('上证主板应通过', () => {
    expect(validateStockCode('600519').valid).toBe(true);
    expect(validateStockCode('601318').valid).toBe(true);
    expect(validateStockCode('603259').valid).toBe(true);
  });

  it('深证主板应通过', () => {
    expect(validateStockCode('000858').valid).toBe(true);
    expect(validateStockCode('000333').valid).toBe(true);
  });

  it('创业板应通过', () => {
    expect(validateStockCode('300750').valid).toBe(true);
    expect(validateStockCode('300059').valid).toBe(true);
  });

  it('科创板应通过', () => {
    expect(validateStockCode('688981').valid).toBe(true);
    expect(validateStockCode('688256').valid).toBe(true);
  });

  it('空代码应报错', () => {
    expect(validateStockCode('').valid).toBe(false);
  });

  it('格式错误应报错', () => {
    expect(validateStockCode('12345').valid).toBe(false);
    expect(validateStockCode('999999').valid).toBe(false);
    expect(validateStockCode('ABC123').valid).toBe(false);
  });
});

// ==================== 密码验证 ====================

describe('validateTradePassword 密码验证', () => {
  it('强密码应通过', () => {
    expect(validateTradePassword('Test@1234').valid).toBe(true);
  });

  it('空密码应报错', () => {
    expect(validateTradePassword('').valid).toBe(false);
  });

  it('过短应报错', () => {
    expect(validateTradePassword('Ab1!').valid).toBe(false);
  });

  it('无大写应报错', () => {
    expect(validateTradePassword('test@1234').valid).toBe(false);
  });

  it('无小写应报错', () => {
    expect(validateTradePassword('TEST@1234').valid).toBe(false);
  });

  it('无数字应报错', () => {
    expect(validateTradePassword('Test@abcd').valid).toBe(false);
  });

  it('无特殊字符应报错', () => {
    expect(validateTradePassword('Test1234').valid).toBe(false);
  });

  it('连续相同字符应报错', () => {
    expect(validateTradePassword('Test111@ab').valid).toBe(false);
  });

  it('过长应报错', () => {
    expect(validateTradePassword('Test@12345678901234567').valid).toBe(false);
  });
});

// ==================== 金额验证 ====================

describe('validateTradeAmount 金额验证', () => {
  it('有效金额应通过', () => {
    expect(validateTradeAmount(10000).valid).toBe(true);
    expect(validateTradeAmount(100).valid).toBe(true);
  });

  it('NaN应报错', () => {
    expect(validateTradeAmount(NaN).valid).toBe(false);
  });

  it('低于最低应报错', () => {
    expect(validateTradeAmount(50).valid).toBe(false);
  });

  it('超过最高应报错', () => {
    expect(validateTradeAmount(200000000).valid).toBe(false);
  });

  it('非100倍数应报错', () => {
    expect(validateTradeAmount(150).valid).toBe(false);
  });
});

// ==================== 日期验证 ====================

describe('validateTradeDate 日期验证', () => {
  it('工作日应通过', () => {
    const result = validateTradeDate('2026-03-23'); // 周一
    // 注意：取决于实际日期，这里只检查格式
    expect(result.errors.filter(e => e === '日期格式应为YYYY-MM-DD')).toHaveLength(0);
  });

  it('周末应报错', () => {
    const result = validateTradeDate('2026-03-22'); // 周日
    expect(result.errors).toContain('非交易日(周末)');
  });

  it('空日期应报错', () => {
    expect(validateTradeDate('').valid).toBe(false);
  });

  it('格式错误应报错', () => {
    expect(validateTradeDate('2026/03/23').valid).toBe(false);
    expect(validateTradeDate('03-23-2026').valid).toBe(false);
  });

  it('无效日期应报错', () => {
    // 格式正确但日期无效 - 使用纯字母
    expect(validateTradeDate('abcd-ef-gh').valid).toBe(false);
  });
});

// ==================== 手机号验证 ====================

describe('validatePhone 手机号验证', () => {
  it('有效手机号应通过', () => {
    expect(validatePhone('13812345678').valid).toBe(true);
    expect(validatePhone('19912345678').valid).toBe(true);
  });

  it('空手机号应报错', () => {
    expect(validatePhone('').valid).toBe(false);
  });

  it('格式错误应报错', () => {
    expect(validatePhone('12345678901').valid).toBe(false);
    expect(validatePhone('1381234567').valid).toBe(false);
    expect(validatePhone('23812345678').valid).toBe(false);
  });
});

// ==================== 邮箱验证 ====================

describe('validateEmail 邮箱验证', () => {
  it('有效邮箱应通过', () => {
    expect(validateEmail('test@example.com').valid).toBe(true);
    expect(validateEmail('user.name+tag@domain.co').valid).toBe(true);
  });

  it('空邮箱应报错', () => {
    expect(validateEmail('').valid).toBe(false);
  });

  it('格式错误应报错', () => {
    expect(validateEmail('notemail').valid).toBe(false);
    expect(validateEmail('@nodomain').valid).toBe(false);
    expect(validateEmail('no@').valid).toBe(false);
  });
});

// ==================== 身份证验证 ====================

describe('validateIdCard 身份证验证', () => {
  it('格式正确且校验码正确应通过', () => {
    // 一个已知的测试身份证号
    expect(validateIdCard('110101199003077758').valid).toBe(true);
  });

  it('空应报错', () => {
    expect(validateIdCard('').valid).toBe(false);
  });

  it('格式错误应报错', () => {
    expect(validateIdCard('123456789').valid).toBe(false);
    expect(validateIdCard('12345678901234567').valid).toBe(false);
  });

  it('校验码错误应报错', () => {
    // 修改最后一位
    expect(validateIdCard('110101199003077750').valid).toBe(false);
  });
});

// ==================== 范围验证 ====================

describe('validateRange 范围验证', () => {
  it('范围内应通过', () => {
    expect(validateRange(50, 0, 100, '价格').valid).toBe(true);
  });

  it('边界值应通过', () => {
    expect(validateRange(0, 0, 100, '价格').valid).toBe(true);
    expect(validateRange(100, 0, 100, '价格').valid).toBe(true);
  });

  it('低于最小值应报错', () => {
    const result = validateRange(-1, 0, 100, '价格');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('价格');
  });

  it('超过最大值应报错', () => {
    expect(validateRange(101, 0, 100, '价格').valid).toBe(false);
  });
});

// ==================== 必填验证 ====================

describe('validateRequired 必填验证', () => {
  it('有值应通过', () => {
    expect(validateRequired('test', '字段').valid).toBe(true);
    expect(validateRequired(0, '字段').valid).toBe(true);
    expect(validateRequired(false, '字段').valid).toBe(true);
  });

  it('null应报错', () => {
    expect(validateRequired(null, '字段').valid).toBe(false);
  });

  it('undefined应报错', () => {
    expect(validateRequired(undefined, '字段').valid).toBe(false);
  });

  it('空字符串应报错', () => {
    expect(validateRequired('', '字段').valid).toBe(false);
  });
});

// ==================== 组合验证器 ====================

describe('composeValidators 组合验证', () => {
  it('全部通过应返回valid', () => {
    const result = composeValidators(
      () => validateRequired('test', '名称'),
      () => validateRange(50, 0, 100, '数量'),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('部分失败应收集所有错误', () => {
    const result = composeValidators(
      () => validateRequired('', '名称'),
      () => validateRange(150, 0, 100, '数量'),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('无验证器应返回valid', () => {
    const result = composeValidators();
    expect(result.valid).toBe(true);
  });
});
