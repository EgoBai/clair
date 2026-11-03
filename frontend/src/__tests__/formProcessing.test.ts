/**
 * 批次 26a：影子测试迁移 —— 表单处理与输入验证
 *
 * 已绑定生产实现：
 * - validation.sanitizeStockCode（去非数字、截断 6 位、不补零）
 * - validation.validatePrice（0..100000，不限制小数位）
 * - validation.validateQuantity（正整数、A 股 100 的整数倍）
 * - validation.isValidTradeDate（严格日历回读）
 * - securityEngine.validateEmail / validatePhone / validatePassword
 * - securityEngine.encodeHTML / sanitizeHTML
 * - debounceThrottle.debounce
 *
 * 未迁移（生产无对应实现）：
 * - 债券价格 3 位小数、债券数量 10 手口径（生产 validatePrice/validateQuantity 无 market 参数）
 * - 多选组合筛选 multiSelectFilter（生产无通用导出）
 * - 下拉按 label 过滤 filterOptions（生产无通用导出；useSearchHistory.ts:65 仅针对字符串历史）
 * - 表单草稿 createFormDraft（生产无 save/discard/isDirty 对应实现）
 * - 日期区间 365 天上限/起止先后规则（生产只有 isValidTradeDate 单日校验）
 *
 * 旧断言订正（旧值 -> 生产值）：
 * - formatStockCode('1') 旧 '000001' -> sanitizeStockCode '1'（validation.ts:118-121 不补零）
 * - validatePrice('10.123') 旧 false -> true（validation.ts:43-50 不限制小数位）
 * - passwordStrength 的 score/feedback -> validatePassword 的 valid/errors
 *   （securityEngine.ts:192-216）
 * - sanitizeInput 旧不转义 '/' -> encodeHTML 转义为 '&#x2F;'（securityEngine.ts:54-65）
 * - 日期 '2026-02-30' 旧 new Date 归一化后视为合法 -> isValidTradeDate false（validation.ts:75-83）
 *
 * 生产缺口（只记录不修）：validateStockCode('999999') 返回 valid true（validation.ts:28-36 仅校验 6 位数字）；
 * validateEmail 用原始串判合法但返回 trim 后 sanitized（securityEngine.ts:150-158）。
 */
import { describe, it, expect, vi } from 'vitest'
import { isValidTradeDate, sanitizeStockCode, validatePrice, validateQuantity } from '../utils/validation'
import { encodeHTML, sanitizeHTML, validateEmail, validatePassword, validatePhone } from '../utils/securityEngine'
import { debounce } from '../utils/debounceThrottle'

// 前端表单处理与输入验证引擎测试
describe('Form Processing & Input Validation', () => {
  // 股票代码格式化（validation.sanitizeStockCode：去非数字、截断 6 位、不补零）
  it('should sanitize stock code without zero padding', () => {
    expect(sanitizeStockCode('1')).toBe('1')
    expect(sanitizeStockCode('600519')).toBe('600519')
  })

  it('should remove non-digits', () => {
    expect(sanitizeStockCode('abc600519xyz')).toBe('600519')
  })

  it('should truncate to 6 digits', () => {
    expect(sanitizeStockCode('123456789')).toBe('123456')
  })

  // 价格输入验证（validation.validatePrice：0..100000，不限小数位）
  it('should validate stock price', () => {
    expect(validatePrice('10.50').valid).toBe(true)
    expect(validatePrice('10.123').valid).toBe(true) // 生产不限制小数位
    expect(validatePrice(100001).valid).toBe(false)
  })

  // 未迁移：生产 validatePrice 无 market 参数与小数位限制，债券 3 位小数口径保留内联 helper
  function validateBondPrice(input: string): { valid: boolean } {
    const num = parseFloat(input)
    if (isNaN(num) || num <= 0) return { valid: false }
    const decimalPart = input.split('.')[1] || ''
    return { valid: decimalPart.length <= 3 }
  }

  it('should validate bond price with 3 decimals', () => {
    expect(validateBondPrice('100.123').valid).toBe(true)
    expect(validateBondPrice('100.1234').valid).toBe(false)
  })

  it('should reject negative', () => {
    const result = validatePrice('-5')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('价格不能为负数')
  })

  // 数量输入验证（validation.validateQuantity：正整数、A 股 100 整数倍）
  it('should validate 100 share lots', () => {
    expect(validateQuantity('500').valid).toBe(true)
    expect(validateQuantity('150').valid).toBe(false)
    expect(validateQuantity('150').errors).toContain('A股数量必须是100的整数倍')
  })

  // 未迁移：生产 validateQuantity 只支持 A 股 100 整数倍，无债券 10 手口径
  function validateBondQuantity(input: string): { valid: boolean } {
    const num = parseInt(input, 10)
    if (isNaN(num) || num <= 0) return { valid: false }
    return { valid: num % 10 === 0 }
  }

  it('should validate bond 10 lot', () => {
    expect(validateBondQuantity('50').valid).toBe(true)
    expect(validateBondQuantity('15').valid).toBe(false)
  })

  // 密码强度检测（securityEngine.validatePassword：长度/大小写/数字/特殊字符）
  it('should rate strong password', () => {
    const result = validatePassword('Abc123!@#$%')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should give feedback for weak password', () => {
    const result = validatePassword('abc')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors).toContain('密码长度不能少于8位')
  })

  // 手机号验证（securityEngine.validatePhone）
  it('should validate Chinese phone numbers', () => {
    expect(validatePhone('13812345678').valid).toBe(true)
    expect(validatePhone('13812345678').sanitized).toBe('13812345678')
    expect(validatePhone('12345678901').valid).toBe(false)
    expect(validatePhone('138-1234-5678').valid).toBe(true)
  })

  // 邮箱验证（securityEngine.validateEmail）
  it('should validate email format', () => {
    expect(validateEmail('user@example.com').valid).toBe(true)
    expect(validateEmail('invalid').valid).toBe(false)
    expect(validateEmail('@example.com').valid).toBe(false)
  })

  it('should normalize valid email', () => {
    const result = validateEmail('User@Example.COM')
    expect(result.valid).toBe(true)
    expect(result.sanitized).toBe('user@example.com')
  })

  // 输入消毒（securityEngine.encodeHTML 还会转义 '/' 与反引号）
  it('should escape HTML special chars', () => {
    expect(encodeHTML('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;')
  })

  it('should escape ampersand first', () => {
    expect(encodeHTML('&lt;')).toBe('&amp;lt;')
  })

  it('should strip script tags but keep allowed tags', () => {
    expect(sanitizeHTML('<b>ok</b><script>alert(1)</script>')).toBe('<b>ok</b>')
    expect(sanitizeHTML('<img src=x onerror=alert(1)>')).toBe('')
  })

  // 多选筛选器
  // 未迁移：生产无通用 multiSelectFilter 导出
  function multiSelectFilter<T>(items: T[], filters: Record<string, (item: T) => boolean>): T[] {
    return items.filter(item => Object.values(filters).every(fn => fn(item)))
  }

  it('should apply all filters', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const result = multiSelectFilter(items, {
      even: (n: number) => n % 2 === 0,
      greaterThan2: (n: number) => n > 2,
    })
    expect(result).toEqual([4, 6])
  })

  // 日期范围选择器
  // 未迁移：生产无区间校验/365 天上限，保留本地规则；日期合法性绑定 isValidTradeDate
  function validateDateRange(start: string, end: string) {
    if (!isValidTradeDate(start) || !isValidTradeDate(end)) return { valid: false, error: '日期格式无效' }
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (startDate > endDate) return { valid: false, error: '开始日期不能晚于结束日期' }
    const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000)
    if (days > 365) return { valid: false, error: '日期范围不能超过一年' }
    return { valid: true, days }
  }

  it('should validate date range', () => {
    const result = validateDateRange('2026-01-01', '2026-03-01')
    expect(result.valid).toBe(true)
    expect(result.days).toBeGreaterThan(0)
  })

  it('should reject reversed dates', () => {
    const result = validateDateRange('2026-03-01', '2026-01-01')
    expect(result.valid).toBe(false)
  })

  it('should reject too long range', () => {
    const result = validateDateRange('2024-01-01', '2026-01-01')
    expect(result.valid).toBe(false)
  })

  it('should reject impossible calendar date', () => {
    expect(isValidTradeDate('2026-02-30')).toBe(false)
    expect(validateDateRange('2026-02-30', '2026-03-01').valid).toBe(false)
  })

  // 搜索防抖（debounceThrottle.debounce：trailing 模式，delay 内重置定时器）
  it('should debounce search calls', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    try {
      const calls: string[] = []
      const search = debounce((...args: unknown[]) => {
        calls.push(args[0] as string)
      }, 50)

      search('a')
      search('ab')
      expect(calls).toHaveLength(0)

      vi.advanceTimersByTime(50)
      expect(calls).toEqual(['ab'])
    } finally {
      vi.useRealTimers()
    }
  })

  // 下拉选择器过滤
  // 未迁移：生产无通用 filterOptions 导出
  function filterOptions<T>(options: T[], query: string, getLabel: (opt: T) => string) {
    if (!query) return options
    const lower = query.toLowerCase()
    return options.filter(opt => getLabel(opt).toLowerCase().includes(lower))
  }

  it('should filter options by label', () => {
    const options = [{ label: '贵州茅台', code: '600519' }, { label: '平安银行', code: '000001' }]
    expect(filterOptions(options, '茅台', o => o.label)).toHaveLength(1)
  })

  it('should return all for empty query', () => {
    const options = ['a', 'b', 'c']
    expect(filterOptions(options, '', s => s)).toHaveLength(3)
  })

  // 表单草稿保存
  // 未迁移：生产无 createFormDraft / save / discard / isDirty 对应实现
  function createFormDraft<T>(initialValues: T) {
    let current = { ...initialValues as any }
    let saved = { ...initialValues as any }
    return {
      update: (field: string, value: any) => { current[field] = value },
      save: () => { saved = { ...current } },
      discard: () => { current = { ...saved } },
      isDirty: () => JSON.stringify(current) !== JSON.stringify(saved),
      getValues: () => ({ ...current }),
    }
  }

  it('should track dirty state', () => {
    const form = createFormDraft({ name: '', email: '' })
    expect(form.isDirty()).toBe(false)
    form.update('name', 'test')
    expect(form.isDirty()).toBe(true)
  })

  it('should discard changes', () => {
    const form = createFormDraft({ name: '' })
    form.update('name', 'test')
    form.discard()
    expect(form.getValues().name).toBe('')
  })

  it('should save changes', () => {
    const form = createFormDraft({ name: '' })
    form.update('name', 'test')
    form.save()
    expect(form.isDirty()).toBe(false)
    expect(form.getValues().name).toBe('test')
  })
})
