/**
 * 行情数据验证引擎
 * 验证股票行情数据的完整性和合理性
 * 用于数据采集后的质量检查
 */

/** 验证结果 */
export interface ValidationResult {
  valid: boolean;
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  value?: any;
  expected?: any;
}

/** 行情数据 */
export interface QuoteData {
  symbol: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  preClose?: number;
  change?: number;
  changePercent?: number;
}

/** 验证配置 */
export interface ValidationConfig {
  /** 最大涨跌幅 (百分比) */
  maxChangePercent: number;
  /** ST股最大涨跌幅 */
  stMaxChangePercent: number;
  /** 最小成交量 */
  minVolume: number;
  /** 最大成交量 (亿股) */
  maxVolume: number;
  /** 是否检查价格关系 */
  checkPriceRelation: boolean;
  /** 是否检查量价配合 */
  checkVolumePrice: boolean;
}

/** 默认配置 (A股) */
export const DEFAULT_CONFIG: ValidationConfig = {
  maxChangePercent: 20,
  stMaxChangePercent: 5,
  minVolume: 0,
  maxVolume: 10000000000,
  checkPriceRelation: true,
  checkVolumePrice: true,
};

/**
 * 验证价格合理性 (OHLC关系)
 */
export function validatePriceRelation(data: QuoteData): ValidationResult[] {
  const results: ValidationResult[] = [];
  const { open, close, high, low } = data;

  // 最高价应 >= 开盘价和收盘价
  if (high < open) {
    results.push({
      valid: false,
      field: 'high',
      message: '最高价低于开盘价',
      severity: 'error',
      value: high,
      expected: `>= ${open}`,
    });
  }

  if (high < close) {
    results.push({
      valid: false,
      field: 'high',
      message: '最高价低于收盘价',
      severity: 'error',
      value: high,
      expected: `>= ${close}`,
    });
  }

  // 最低价应 <= 开盘价和收盘价
  if (low > open) {
    results.push({
      valid: false,
      field: 'low',
      message: '最低价高于开盘价',
      severity: 'error',
      value: low,
      expected: `<= ${open}`,
    });
  }

  if (low > close) {
    results.push({
      valid: false,
      field: 'low',
      message: '最低价高于收盘价',
      severity: 'error',
      value: low,
      expected: `<= ${close}`,
    });
  }

  // 最高价应 >= 最低价
  if (high < low) {
    results.push({
      valid: false,
      field: 'high',
      message: '最高价低于最低价',
      severity: 'error',
      value: high,
      expected: `>= ${low}`,
    });
  }

  if (results.length === 0) {
    results.push({ valid: true, field: 'priceRelation', message: '价格关系正确', severity: 'info' });
  }

  return results;
}

/**
 * 验证涨跌幅合理性
 */
export function validateChangePercent(data: QuoteData, config: ValidationConfig = DEFAULT_CONFIG): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (data.preClose && data.close) {
    const actualChange = ((data.close - data.preClose) / data.preClose) * 100;
    const maxPct = data.symbol.includes('ST') ? config.stMaxChangePercent : config.maxChangePercent;

    if (Math.abs(actualChange) > maxPct + 0.01) { // 允许0.01%的浮点误差
      results.push({
        valid: false,
        field: 'changePercent',
        message: `涨跌幅超出限制: ${actualChange.toFixed(2)}%`,
        severity: 'error',
        value: actualChange.toFixed(2) + '%',
        expected: `±${maxPct}%`,
      });
    }

    // 检查change字段
    if (data.change !== undefined) {
      const expectedChange = data.close - data.preClose;
      if (Math.abs(data.change - expectedChange) > 0.001) {
        results.push({
          valid: false,
          field: 'change',
          message: '涨跌额与收盘价/昨收不一致',
          severity: 'warning',
          value: data.change,
          expected: expectedChange,
        });
      }
    }

    if (results.length === 0) {
      results.push({ valid: true, field: 'changePercent', message: '涨跌幅合理', severity: 'info' });
    }
  }

  return results;
}

/**
 * 验证成交量合理性
 */
export function validateVolume(data: QuoteData, config: ValidationConfig = DEFAULT_CONFIG): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (data.volume < config.minVolume) {
    results.push({
      valid: false,
      field: 'volume',
      message: '成交量低于最小值',
      severity: 'warning',
      value: data.volume,
      expected: `>= ${config.minVolume}`,
    });
  }

  if (data.volume > config.maxVolume) {
    results.push({
      valid: false,
      field: 'volume',
      message: '成交量超过最大值',
      severity: 'error',
      value: data.volume,
      expected: `<= ${config.maxVolume}`,
    });
  }

  // 成交量应为整数 (手)
  if (data.volume !== Math.floor(data.volume)) {
    results.push({
      valid: false,
      field: 'volume',
      message: '成交量不是整数',
      severity: 'warning',
      value: data.volume,
    });
  }

  if (results.length === 0) {
    results.push({ valid: true, field: 'volume', message: '成交量合理', severity: 'info' });
  }

  return results;
}

/**
 * 验证成交额与成交量的一致性
 */
export function validateTurnover(data: QuoteData): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (data.volume > 0 && data.turnover > 0) {
    // volume单位为股，turnover单位为元，avgPrice = turnover / volume
    const avgPrice = data.turnover / data.volume;
    const priceRange = [data.low, data.high];

    if (avgPrice < priceRange[0] * 0.9 || avgPrice > priceRange[1] * 1.1) {
      results.push({
        valid: false,
        field: 'turnover',
        message: '成交额与价格不匹配',
        severity: 'warning',
        value: avgPrice.toFixed(2),
        expected: `${priceRange[0].toFixed(2)} ~ ${priceRange[1].toFixed(2)}`,
      });
    }
  }

  if (data.turnover < 0) {
    results.push({
      valid: false,
      field: 'turnover',
      message: '成交额为负数',
      severity: 'error',
      value: data.turnover,
    });
  }

  if (results.length === 0) {
    results.push({ valid: true, field: 'turnover', message: '成交额合理', severity: 'info' });
  }

  return results;
}

/**
 * 完整验证行情数据
 */
export function validateQuote(data: QuoteData, config: ValidationConfig = DEFAULT_CONFIG): {
  valid: boolean;
  errors: ValidationResult[];
  warnings: ValidationResult[];
  all: ValidationResult[];
} {
  const all: ValidationResult[] = [
    ...validatePriceRelation(data),
    ...validateChangePercent(data, config),
    ...validateVolume(data, config),
    ...validateTurnover(data),
  ];

  // 移除 info 类的valid=true条目，只保留实际问题
  const issues = all.filter(r => !r.valid || r.severity !== 'info');
  const errors = issues.filter(r => r.severity === 'error');
  const warnings = issues.filter(r => r.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    all,
  };
}

/**
 * 批量验证行情数据
 */
export function validateQuotes(
  dataArray: QuoteData[],
  config: ValidationConfig = DEFAULT_CONFIG
): { validCount: number; invalidCount: number; results: Array<{ symbol: string; result: ReturnType<typeof validateQuote> }> } {
  const results = dataArray.map(data => ({
    symbol: data.symbol,
    result: validateQuote(data, config),
  }));

  return {
    validCount: results.filter(r => r.result.valid).length,
    invalidCount: results.filter(r => !r.result.valid).length,
    results,
  };
}

export default {
  validatePriceRelation,
  validateChangePercent,
  validateVolume,
  validateTurnover,
  validateQuote,
  validateQuotes,
  DEFAULT_CONFIG,
};
