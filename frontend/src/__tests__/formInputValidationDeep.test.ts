/**
 * 前端表单与输入验证深度测试 — 批次 28b 影子迁移
 *
 * 生产真源（已 import 绑定）：
 * - securityEngine.validateStockCode（frontend/src/utils/securityEngine.ts:177-187）
 *   返回 { valid, errors, sanitized }，允许 SH/SZ/BJ 前缀，不校验代码前缀白名单
 * - validation.isValidStockCode（frontend/src/utils/validation.ts:28-30）纯 6 位数字，与 securityEngine 口径不同
 * - validation.sanitizePrice（validation.ts:123-132）+ formatters.formatNumber（formatters.ts:12-17）
 *   组合为金额解析与格式化（生产无单一 formatAmountInput 导出）
 * - validation.sanitizeText（validation.ts:147-157）负责标签/脚本清理；连续空白折叠与 isEmpty 由测试侧组合
 * - validation.isValidTradeDate（validation.ts:75-83）负责单日合法性；起止先后与 365 天上限为测试侧区间规则
 * - validation.validateQuantity（validation.ts:57-67）、sanitizeQuantity（validation.ts:134-141）
 *
 * 未迁移（生产无对应导出，测试侧保留）：
 * - formatAmountInput：生产拆为 sanitizePrice + formatNumber
 * - processSearchInput：生产 sanitizeText 只 trim、不折叠连续空白、无 isEmpty 结构
 * - validateDateRange 的 365 天上限与起止先后：生产只有单日 isValidTradeDate
 * - 表单状态机 transition：生产无表单状态机导出
 * - 数量 market/lots 口径：生产 A 股统一 100 股整数倍，无科创板 1 股分支
 *
 * 旧断言订正（旧值 -> 生产值，依据）：
 * 1. validateStockCode('999999').valid 旧 false -> true（securityEngine.ts:180-181 仅校验 6 位数字）
 * 2. validateQuantity('1', 'star').valid 旧 true -> false（validation.ts:57-67 无 market 参数）
 * 3. 手数 lots 旧 5 -> 生产无 lots 字段；sanitizeQuantity('500')=500 股（validation.ts:134-141）
 * 4. 手数 lots 旧 200 -> 生产无 lots 字段；sanitizeQuantity('200')=200 股（validation.ts:134-141）
 * 5. 搜索 '<script>alert(1)</script>' 旧 processed 'scriptalert(1)/script'
 *    -> sanitizeText 整段删除为 ''（validation.ts:150-151）
 *
 * 新增覆盖（非旧断言订正）：
 * - 股票代码错误文案 -> '股票代码格式不正确（应为6位数字）'（securityEngine.ts:184）
 * - 数量错误文案 -> 'A股数量必须是100的整数倍'（validation.ts:66）/'数量超出范围'（validation.ts:65）
 * - '2024-02-30' -> isValidTradeDate false（validation.ts:75-83）
 * - '100.5' -> '数量必须是整数'（validation.ts:59-61）
 *
 * 原文件头注释写 55 用例，但迁移前实际 it 计数为 42（注释失真）；本文件保留全部旧用例标题并新增至 55。
 */
import { describe, it, expect } from 'vitest';
import {
  isValidQuantity,
  isValidStockCode,
  isValidTradeDate,
  sanitizePrice,
  sanitizeQuantity,
  sanitizeText,
  validateQuantity,
} from '../utils/validation';
import { formatNumber } from '../utils/formatters';
import { validateStockCode } from '../utils/securityEngine';

describe('表单与输入验证深度', () => {

  // 股票代码验证 — 绑定 securityEngine.validateStockCode（返回 { valid, errors, sanitized }）
  describe('股票代码验证', () => {
    it('上证主板代码有效', () => {
      expect(validateStockCode('600519').valid).toBe(true);
    });

    it('深证主板代码有效', () => {
      expect(validateStockCode('000001').valid).toBe(true);
    });

    it('创业板代码有效', () => {
      expect(validateStockCode('300750').valid).toBe(true);
    });

    it('科创板代码有效', () => {
      expect(validateStockCode('688001').valid).toBe(true);
    });

    it('空代码应无效', () => {
      const result = validateStockCode('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('股票代码格式不正确（应为6位数字）');
    });

    it('非数字代码应无效', () => {
      expect(validateStockCode('abcdef').valid).toBe(false);
    });

    it('5位代码应无效', () => {
      expect(validateStockCode('60051').valid).toBe(false);
    });

    it('7位代码应无效', () => {
      expect(validateStockCode('6005190').valid).toBe(false);
    });

    it('未知前缀应无效（订正：生产不校验前缀，999999 有效）', () => {
      expect(validateStockCode('999999').valid).toBe(true);
      expect(validateStockCode('999999').sanitized).toBe('999999');
    });

    it('带交易所前缀的代码有效并转为大写（新增：securityEngine.ts:177-187）', () => {
      const result = validateStockCode(' sh600519 ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('SH600519');
    });

    it('北交所代码有效（新增：生产允许任意6位数字）', () => {
      expect(validateStockCode('830799').valid).toBe(true);
    });

    it('基础校验与 securityEngine 口径差异（新增：validation.ts:28-30）', () => {
      expect(isValidStockCode('600519')).toBe(true);
      expect(isValidStockCode('999999')).toBe(true);
      expect(isValidStockCode('SH600519')).toBe(false);
      expect(validateStockCode('999999').valid).toBe(true);
      expect(validateStockCode('SH600519').valid).toBe(true);
    });
  });

  // 金额输入格式化 — sanitizePrice 解析 + formatNumber 格式化（生产无单一导出）
  describe('金额输入格式化', () => {
    function formatAmountInput(value: string): string {
      const amount = sanitizePrice(value);
      return amount === null ? '' : formatNumber(amount);
    }

    it('应添加千分位', () => {
      expect(formatAmountInput('1000000')).toContain(',');
    });

    it('应保留2位小数', () => {
      const result = formatAmountInput('100');
      expect(result).toContain('.');
      expect(result.split('.')[1]?.length).toBe(2);
    });

    it('非数字输入应返回空', () => {
      expect(formatAmountInput('abc')).toBe('');
    });

    it('空输入返回空', () => {
      expect(formatAmountInput('')).toBe('');
    });

    it('小数应正确格式化', () => {
      const result = formatAmountInput('1234.567');
      expect(parseFloat(result.replace(/,/g, ''))).toBeCloseTo(1234.57, 1);
    });

    it('百万金额应精确格式化（新增）', () => {
      expect(formatAmountInput('1000000')).toBe('1,000,000.00');
    });

    it('应拒绝多个小数点（新增：sanitizePrice 返回 null）', () => {
      expect(sanitizePrice('10.5.3')).toBeNull();
      expect(formatAmountInput('10.5.3')).toBe('');
    });

    it('应去除非数字字符并四舍五入（新增）', () => {
      expect(sanitizePrice('￥1,234.56')).toBe(1234.56);
      expect(formatNumber(1234.567)).toBe('1,234.57');
    });
  });

  // 搜索输入处理 — sanitizeText 负责标签/脚本清理，空白折叠与 isEmpty 为测试侧组合
  describe('搜索输入处理', () => {
    function processSearchInput(value: string) {
      const processed = sanitizeText(value).replace(/\s+/g, ' ');
      return {
        original: value,
        processed,
        isEmpty: processed.length === 0,
        length: processed.length,
      };
    }

    it('应去除首尾空格', () => {
      expect(processSearchInput('  hello  ').processed).toBe('hello');
    });

    it('应合并连续空格', () => {
      expect(processSearchInput('hello   world').processed).toBe('hello world');
    });

    it('应去除HTML特殊字符（订正：脚本段整体删除为空串）', () => {
      const result = processSearchInput('<script>alert(1)</script>');
      expect(result.processed).not.toContain('<');
      expect(result.processed).toBe('');
    });

    it('空字符串isEmpty应为true', () => {
      expect(processSearchInput('').isEmpty).toBe(true);
    });

    it('纯空格isEmpty应为true', () => {
      expect(processSearchInput('   ').isEmpty).toBe(true);
    });

    it('正常输入应不变', () => {
      expect(processSearchInput('贵州茅台').processed).toBe('贵州茅台');
    });

    it('应移除标签并保留文本（新增：绑定 sanitizeText）', () => {
      expect(sanitizeText('<b>贵州茅台</b>')).toBe('贵州茅台');
    });

    it('应移除事件处理器标签（新增：sanitizeText 标签清理）', () => {
      expect(processSearchInput('<img src=x onerror=alert(1)>茅台').processed).toBe('茅台');
    });
  });

  // 日期选择器验证 — isValidTradeDate 判单日合法，区间先后/365 天为测试侧规则
  describe('日期选择器验证', () => {
    // 未迁移：生产只有单日 isValidTradeDate，无日期区间规则
    function validateDateRange(start: string, end: string) {
      if (!isValidTradeDate(start)) return { valid: false, error: '开始日期无效' };
      if (!isValidTradeDate(end)) return { valid: false, error: '结束日期无效' };
      const [sy, sm, sd] = start.split('-').map(Number);
      const [ey, em, ed] = end.split('-').map(Number);
      const diffDays = (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return { valid: false, error: '开始日期不能晚于结束日期' };
      if (diffDays > 365) return { valid: false, error: '日期范围不能超过1年' };
      return { valid: true, error: null, days: diffDays };
    }

    it('有效日期范围', () => {
      expect(validateDateRange('2024-01-01', '2024-12-31').valid).toBe(true);
    });

    it('开始晚于结束应无效', () => {
      expect(validateDateRange('2024-12-31', '2024-01-01').valid).toBe(false);
    });

    it('超一年范围应无效', () => {
      expect(validateDateRange('2023-01-01', '2024-12-31').valid).toBe(false);
    });

    it('无效日期格式', () => {
      expect(validateDateRange('invalid', '2024-01-01').valid).toBe(false);
    });

    it('同一天有效', () => {
      expect(validateDateRange('2024-06-15', '2024-06-15').valid).toBe(true);
    });

    it('天数计算正确', () => {
      const result = validateDateRange('2024-01-01', '2024-01-11');
      expect(result.days).toBeCloseTo(10, 0);
    });

    it('不存在的日期应无效（新增：isValidTradeDate 严格回读）', () => {
      expect(validateDateRange('2024-02-30', '2024-03-01').valid).toBe(false);
      expect(isValidTradeDate('2024-02-30')).toBe(false);
    });

    it('闰年2月29日应有效（新增）', () => {
      expect(isValidTradeDate('2024-02-29')).toBe(true);
      expect(validateDateRange('2024-02-29', '2024-03-01').valid).toBe(true);
    });
  });

  // 数量输入验证 — validateQuantity 统一 A 股 100 股整数倍，无 market/lots
  describe('数量输入验证', () => {
    it('100股有效（主板）', () => {
      expect(validateQuantity('100').valid).toBe(true);
      expect(isValidQuantity(100)).toBe(true);
    });

    it('50股无效（主板）', () => {
      const result = validateQuantity('50');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A股数量必须是100的整数倍');
      expect(isValidQuantity(50)).toBe(false);
    });

    it('1股有效（科创板）（订正：生产无 market 参数，1 股同样无效）', () => {
      const result = validateQuantity('1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A股数量必须是100的整数倍');
    });

    it('零数量无效', () => {
      expect(validateQuantity('0').valid).toBe(false);
    });

    it('负数无效', () => {
      expect(validateQuantity('-100').valid).toBe(false);
    });

    it('非数字无效', () => {
      expect(validateQuantity('abc').valid).toBe(false);
    });

    it('手数计算正确（订正：生产无 lots，sanitizeQuantity 返回股数 500）', () => {
      expect(validateQuantity('500').valid).toBe(true);
      expect(sanitizeQuantity('500')).toBe(500);
    });

    it('科创板手数等于股数（订正：生产无 lots/market，sanitizeQuantity 返回 200 股）', () => {
      expect(validateQuantity('200').valid).toBe(true);
      expect(sanitizeQuantity('200')).toBe(200);
    });

    it('非整数应无效（新增：旧 parseInt 会截断为 100）', () => {
      const result = validateQuantity('100.5');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('数量必须是整数');
    });

    it('100万股有效，超过上限无效（新增）', () => {
      expect(validateQuantity('1000000').valid).toBe(true);
      const over = validateQuantity('1000100');
      expect(over.valid).toBe(false);
      expect(over.errors).toContain('数量超出范围');
    });
  });

  // 表单状态机 — 未迁移：生产无表单状态机导出
  describe('表单状态机', () => {
    type FormState = 'idle' | 'editing' | 'submitting' | 'success' | 'error';
    function transition(current: FormState, action: string): FormState {
      const transitions: Record<string, Record<string, FormState>> = {
        idle: { edit: 'editing' },
        editing: { submit: 'submitting', cancel: 'idle' },
        submitting: { success: 'success', error: 'error' },
        success: { reset: 'idle' },
        error: { retry: 'submitting', reset: 'idle' },
      };
      return transitions[current]?.[action] ?? current;
    }

    it('idle→edit→editing', () => {
      expect(transition('idle', 'edit')).toBe('editing');
    });

    it('editing→submit→submitting', () => {
      expect(transition('editing', 'submit')).toBe('submitting');
    });

    it('submitting→success→success', () => {
      expect(transition('submitting', 'success')).toBe('success');
    });

    it('submitting→error→error', () => {
      expect(transition('submitting', 'error')).toBe('error');
    });

    it('error→retry→submitting', () => {
      expect(transition('error', 'retry')).toBe('submitting');
    });

    it('error→reset→idle', () => {
      expect(transition('error', 'reset')).toBe('idle');
    });

    it('无效转换应保持状态', () => {
      expect(transition('idle', 'submit')).toBe('idle');
    });

    it('success→reset→idle', () => {
      expect(transition('success', 'reset')).toBe('idle');
    });

    it('editing→cancel→idle（新增：状态表已有 cancel，旧用例未覆盖）', () => {
      expect(transition('editing', 'cancel')).toBe('idle');
    });
  });
});
