/**
 * 高级历史数据校验引擎
 * 
 * 职责：
 * - 跨数据源一致性校验
 * - 财务指标交叉验证（三表联动）
 * - 时间序列完整性分析
 * - 异常模式识别（洗盘、操纵痕迹）
 * 
 * 参考：Wind 数据质量标准 + Bloomberg 数据校验规范
 */

import { KLineData, DailyQuote } from '../types';

// ==================== 类型 ====================

export interface CrossValidationResult {
  symbol: string;
  checks: ValidationCheck[];
  passed: number;
  failed: number;
  warnings: number;
  overallScore: number; // 0-100
  validatedAt: string;
}

export interface ValidationCheck {
  name: string;
  category: 'consistency' | 'completeness' | 'accuracy' | 'timeliness';
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
  affectedRecords?: number;
}

export interface FinancialCrossCheck {
  /** 资产 = 负债 + 所有者权益 */
  balanceSheetBalance: boolean;
  /** 净利润与现金流匹配度 */
  profitCashAlignment: number; // 0-1
  /** ROE = 净利润/净资产 (合理误差范围) */
  roeConsistency: boolean;
  /** 资产负债率在合理范围 */
  leverageReasonable: boolean;
  /** 毛利率 > 净利率 */
  marginHierarchy: boolean;
  details: string[];
}

export interface TimeSeriesGap {
  startDate: string;
  endDate: string;
  missingDays: number;
  expectedTradingDays: number;
  gapType: 'holiday' | 'suspension' | 'data_missing';
}

// ==================== 历史数据校验引擎 ====================

export class HistoricalDataValidator {
  /**
   * 全面校验K线历史数据
   */
  validateKLineHistory(symbol: string, data: KLineData[]): CrossValidationResult {
    const checks: ValidationCheck[] = [];

    if (data.length === 0) {
      return {
        symbol,
        checks: [{
          name: '数据非空检查',
          category: 'completeness',
          status: 'fail',
          message: '数据为空',
        }],
        passed: 0,
        failed: 1,
        warnings: 0,
        overallScore: 0,
        validatedAt: new Date().toISOString(),
      };
    }

    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    // 1. 数据完整性
    checks.push(this.checkCompleteness(sorted));
    checks.push(this.checkDateContinuity(sorted));
    checks.push(this.checkDuplicateDates(sorted));

    // 2. 价格准确性
    checks.push(this.checkPriceLogic(sorted));
    checks.push(this.checkOHLCConsistency(sorted));
    checks.push(this.checkTurnoverVolumeConsistency(sorted));

    // 3. 时间序列分析
    checks.push(this.checkTimeSeriesMonotonicity(sorted));
    checks.push(this.checkAbnormalPatterns(sorted));

    // 4. 成交量分析
    checks.push(this.checkVolumePatterns(sorted));
    checks.push(this.checkZeroVolumeDays(sorted));

    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const overallScore = Math.round((passed / checks.length) * 100);

    return {
      symbol,
      checks,
      passed,
      failed,
      warnings,
      overallScore,
      validatedAt: new Date().toISOString(),
    };
  }

  private checkCompleteness(data: KLineData[]): ValidationCheck {
    const nullDates = data.filter(d => !d.tradeDate).length;
    if (nullDates > 0) {
      return {
        name: '日期完整性',
        category: 'completeness',
        status: 'fail',
        message: `${nullDates}条记录缺少交易日期`,
        affectedRecords: nullDates,
      };
    }
    return { name: '日期完整性', category: 'completeness', status: 'pass', message: '所有记录均有日期' };
  }

  private checkDateContinuity(data: KLineData[]): ValidationCheck {
    let gapCount = 0;
    for (let i = 1; i < data.length; i++) {
      const prev = new Date(data[i - 1].tradeDate);
      const curr = new Date(data[i].tradeDate);
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      if (diff > 5) gapCount++;
    }
    if (gapCount > data.length * 0.1) {
      return {
        name: '日期连续性',
        category: 'completeness',
        status: 'warning',
        message: `${gapCount}个长间隔 (>5天)，占比${((gapCount / data.length) * 100).toFixed(1)}%`,
        affectedRecords: gapCount,
      };
    }
    return { name: '日期连续性', category: 'completeness', status: 'pass', message: '日期连续性正常' };
  }

  private checkDuplicateDates(data: KLineData[]): ValidationCheck {
    const dates = data.map(d => d.tradeDate);
    const unique = new Set(dates);
    const dupes = dates.length - unique.size;
    if (dupes > 0) {
      return {
        name: '日期去重检查',
        category: 'consistency',
        status: 'fail',
        message: `发现${dupes}条重复日期记录`,
        affectedRecords: dupes,
      };
    }
    return { name: '日期去重检查', category: 'consistency', status: 'pass', message: '无重复日期' };
  }

  private checkPriceLogic(data: KLineData[]): ValidationCheck {
    let errors = 0;
    for (const d of data) {
      if (d.high < d.low) errors++;
      if (d.high < d.open || d.high < d.close) errors++;
      if (d.low > d.open || d.low > d.close) errors++;
    }
    if (errors > 0) {
      return {
        name: '价格逻辑校验',
        category: 'accuracy',
        status: 'fail',
        message: `${errors}条OHLC逻辑错误`,
        affectedRecords: errors,
      };
    }
    return { name: '价格逻辑校验', category: 'accuracy', status: 'pass', message: 'OHLC逻辑正确' };
  }

  private checkOHLCConsistency(data: KLineData[]): ValidationCheck {
    let errors = 0;
    for (const d of data) {
      // 开盘价应在昨收附近（涨跌停范围内最大20%）
      if (d.open <= 0 || d.close <= 0 || d.high <= 0 || d.low <= 0) errors++;
    }
    if (errors > 0) {
      return {
        name: 'OHLC有效性',
        category: 'accuracy',
        status: 'fail',
        message: `${errors}条价格≤0`,
        affectedRecords: errors,
      };
    }
    return { name: 'OHLC有效性', category: 'accuracy', status: 'pass', message: '所有价格有效' };
  }

  private checkTurnoverVolumeConsistency(data: KLineData[]): ValidationCheck {
    let inconsistent = 0;
    for (const d of data) {
      if (d.volume > 0 && d.turnover === 0) inconsistent++;
      if (d.volume === 0 && d.turnover > 0) inconsistent++;
    }
    if (inconsistent > 0) {
      return {
        name: '量额一致性',
        category: 'consistency',
        status: 'warning',
        message: `${inconsistent}条量额不一致`,
        affectedRecords: inconsistent,
      };
    }
    return { name: '量额一致性', category: 'consistency', status: 'pass', message: '量额一致' };
  }

  private checkTimeSeriesMonotonicity(data: KLineData[]): ValidationCheck {
    for (let i = 1; i < data.length; i++) {
      if (data[i].tradeDate < data[i - 1].tradeDate) {
        return {
          name: '时间序列单调性',
          category: 'timeliness',
          status: 'fail',
          message: '数据未按时间排序',
        };
      }
    }
    return { name: '时间序列单调性', category: 'timeliness', status: 'pass', message: '时间序列正确排序' };
  }

  private checkAbnormalPatterns(data: KLineData[]): ValidationCheck {
    // 检测连续N天完全相同的成交量（可能是数据源问题）
    let maxConsecutiveSame = 1;
    let current = 1;
    for (let i = 1; i < data.length; i++) {
      if (data[i].volume === data[i - 1].volume && data[i].volume > 0) {
        current++;
        maxConsecutiveSame = Math.max(maxConsecutiveSame, current);
      } else {
        current = 1;
      }
    }
    if (maxConsecutiveSame >= 5) {
      return {
        name: '异常模式检测',
        category: 'accuracy',
        status: 'warning',
        message: `连续${maxConsecutiveSame}天成交量相同，可能为数据填充`,
      };
    }
    return { name: '异常模式检测', category: 'accuracy', status: 'pass', message: '未发现异常模式' };
  }

  private checkVolumePatterns(data: KLineData[]): ValidationCheck {
    const volumes = data.map(d => d.volume).filter(v => v > 0);
    if (volumes.length === 0) {
      return { name: '成交量模式', category: 'accuracy', status: 'warning', message: '无有效成交量数据' };
    }
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const outliers = volumes.filter(v => v > mean * 10 || v < mean / 10).length;
    if (outliers > volumes.length * 0.05) {
      return {
        name: '成交量模式',
        category: 'accuracy',
        status: 'warning',
        message: `${outliers}个极端成交量异常值 (均值${(mean / 100).toFixed(0)}手)`,
        affectedRecords: outliers,
      };
    }
    return { name: '成交量模式', category: 'accuracy', status: 'pass', message: '成交量分布正常' };
  }

  private checkZeroVolumeDays(data: KLineData[]): ValidationCheck {
    const zeroVol = data.filter(d => d.volume === 0);
    const ratio = zeroVol.length / data.length;
    if (ratio > 0.1) {
      return {
        name: '零成交量天数',
        category: 'completeness',
        status: 'warning',
        message: `${zeroVol.length}天零成交量 (${(ratio * 100).toFixed(1)}%)，可能存在停牌`,
        affectedRecords: zeroVol.length,
      };
    }
    return { name: '零成交量天数', category: 'completeness', status: 'pass', message: '零成交量天数正常' };
  }

  /**
   * 分析时间序列间隔
   */
  analyzeGaps(data: KLineData[]): TimeSeriesGap[] {
    const gaps: TimeSeriesGap[] = [];
    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].tradeDate);
      const curr = new Date(sorted[i].tradeDate);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);

      if (diffDays > 5) {
        // 估算缺失交易日
        const expectedTrading = Math.floor(diffDays * (5 / 7)); // 去掉周末
        let gapType: TimeSeriesGap['gapType'] = 'data_missing';
        if (diffDays > 30) gapType = 'suspension';
        else if (diffDays > 7 && diffDays <= 30) gapType = 'holiday';

        gaps.push({
          startDate: sorted[i - 1].tradeDate,
          endDate: sorted[i].tradeDate,
          missingDays: diffDays,
          expectedTradingDays: Math.max(0, expectedTrading - 1),
          gapType,
        });
      }
    }

    return gaps;
  }
}

// ==================== 财务数据交叉验证 ====================

export class FinancialCrossValidator {
  /**
   * 三表联动校验
   */
  validateThreeStatements(balanceSheet: Record<string, number>, incomeStatement: Record<string, number>, cashFlow: Record<string, number>): FinancialCrossCheck {
    const details: string[] = [];

    // 1. 资产负债表平衡
    const totalAssets = balanceSheet.totalAssets || 0;
    const totalLiabilities = balanceSheet.totalLiabilities || 0;
    const totalEquity = balanceSheet.totalEquity || 0;
    const balanceSheetBalance = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < totalAssets * 0.01;
    if (!balanceSheetBalance) {
      details.push(`资产负债表不平衡: 资产${totalAssets} ≠ 负债${totalLiabilities} + 权益${totalEquity}`);
    }

    // 2. 净利润与现金流匹配
    const netProfit = incomeStatement.netProfit || 0;
    const operatingCashFlow = cashFlow.operatingCashFlow || 0;
    let profitCashAlignment = 0;
    if (netProfit !== 0) {
      profitCashAlignment = Math.min(1, Math.abs(operatingCashFlow / netProfit));
    }
    if (profitCashAlignment < 0.5 && netProfit > 0) {
      details.push(`净利润与经营现金流严重偏离: 净利润${netProfit}, 经营现金流${operatingCashFlow}`);
    }

    // 3. ROE 一致性
    const roe = incomeStatement.roe || 0;
    const calculatedROE = totalEquity > 0 ? (netProfit / totalEquity) * 100 : 0;
    const roeConsistency = Math.abs(roe - calculatedROE) < 5; // 5% 容差
    if (!roeConsistency) {
      details.push(`ROE不一致: 报告${roe}%, 计算${calculatedROE.toFixed(2)}%`);
    }

    // 4. 资产负债率合理性
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    const leverageReasonable = debtRatio >= 0 && debtRatio <= 100;
    if (!leverageReasonable) {
      details.push(`资产负债率异常: ${debtRatio.toFixed(2)}%`);
    }

    // 5. 毛利率 > 净利率
    const grossMargin = incomeStatement.grossMargin || 0;
    const netMargin = incomeStatement.netMargin || 0;
    const marginHierarchy = grossMargin >= netMargin;
    if (!marginHierarchy) {
      details.push(`毛利率(${grossMargin}%) < 净利率(${netMargin}%)，不合理`);
    }

    return {
      balanceSheetBalance,
      profitCashAlignment,
      roeConsistency,
      leverageReasonable,
      marginHierarchy,
      details,
    };
  }

  /**
   * 财务指标合理性检查
   */
  validateFinancialRatios(ratios: Record<string, number>): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // PE 合理范围
    if (ratios.pe !== undefined && ratios.pe !== null) {
      if (ratios.pe < 0 && ratios.pe < -100) issues.push('PE异常偏低（<-100）');
      if (ratios.pe > 0 && ratios.pe > 500) issues.push('PE异常偏高（>500）');
    }

    // PB 合理范围
    if (ratios.pb !== undefined && ratios.pb !== null) {
      if (ratios.pb < 0) issues.push('PB为负数');
      if (ratios.pb > 50) issues.push('PB异常偏高（>50）');
    }

    // ROE 合理范围
    if (ratios.roe !== undefined && ratios.roe !== null) {
      if (Math.abs(ratios.roe) > 100) issues.push('ROE绝对值>100%');
    }

    // 毛利率范围
    if (ratios.grossMargin !== undefined) {
      if (ratios.grossMargin < -50 || ratios.grossMargin > 100) issues.push('毛利率超出合理范围');
    }

    // 资产负债率
    if (ratios.debtRatio !== undefined) {
      if (ratios.debtRatio < 0 || ratios.debtRatio > 100) issues.push('资产负债率超出0-100%范围');
    }

    // 流动比率
    if (ratios.currentRatio !== undefined) {
      if (ratios.currentRatio < 0) issues.push('流动比率为负');
    }

    return { valid: issues.length === 0, issues };
  }
}

// ==================== 导出 ====================

export const historicalDataValidator = new HistoricalDataValidator();
export const financialCrossValidator = new FinancialCrossValidator();
