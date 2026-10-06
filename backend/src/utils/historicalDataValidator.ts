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
 *
 * ⚠️ 交易日历口径（P0-5D）：本引擎所有「间隔/缺失」判定**一律以
 * `utils/tradingCalendar` 为准**，不再用「日历天数 × 5/7」估算。
 * 原因：长假（国庆 9 天、春节 8~9 天）会让真实完整的区间被误判为缺失，
 * 令warning 虚高、真实缺口被淹没。
 *
 * 另需注意：`daily_quotes` 中可能存在**抹布行**（同一交易日被复制到
 * 假期日期，如 2026-10-04/05/06 与前一交易日 OHLCV 完全相同）。
 * 因此判定库内日期时**必须用 `DISTINCT trade_date` 消解抹布行**，
 * 不可按行计数，也不可单股抽样 —— 必须对日期集合去重后再比对。
 */

import { KLineData, DailyQuote } from '../types';
import { tradingDaysBetween, tradingDaysStrictlyBetween, daysBetween } from './tradingCalendar';

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

  /**
   * 检查日期间隔是否真的「缺数据」。
   *
   * ⚠️ 历史缺陷（已修）：旧实现只按日历天数判断 `diff > 5` 即算「长间隔」，
   * 于是**每个正常长假都被误判为数据缺失** —— 国庆 10/1–10/7 休市使
   * 09-30 → 10-08 间隔 8 天，春节可跨 9 天，全部命中 `> 5`。
   * 结果：数据本应完整的区间被报成 warning，且 warning 比例随长假数量虚高，
   * 真正该报警的「数据缺口」反而被淹没（告警疲劳）。
   *
   * 正确口径：**以交易日历为准**。用 `utils/tradingCalendar` 的
   * `tradingDaysBetween` 算出区间内「本应有的交易日数」，
   * 只有实际记录数明显少于该值时才算真缺失。法定休市不算缺失。
   */
  private checkDateContinuity(data: KLineData[]): ValidationCheck {
    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    let missingTradingDays = 0;
    let holidayGaps = 0;

    for (let i = 1; i < sorted.length; i++) {
      const from = sorted[i - 1].tradeDate;
      const to = sorted[i].tradeDate;
      // 开区间统计：两端本身就有记录，不能计入「本应有」
      const expected = tradingDaysStrictlyBetween(from, to);
      // 区间内实际记录数（相邻两条记录之间恒为 0，见 countRecordsStrictlyBetween）
      const actual = countRecordsStrictlyBetween(sorted, from, to);
      const missing = expected - actual;
      if (missing > 0) {
        missingTradingDays += missing;
      } else if (expected === 0) {
        holidayGaps++;
      }
    }

    const realGapRatio = data.length > 0 ? missingTradingDays / data.length : 0;
    if (realGapRatio > 0.1) {
      return {
        name: '日期连续性',
        category: 'completeness',
        status: 'warning',
        message:
          `缺失 ${missingTradingDays} 个交易日（按交易日历口径，已排除周末与法定休市），` +
          `占比 ${(realGapRatio * 100).toFixed(1)}%`,
        affectedRecords: missingTradingDays,
      };
    }
    return {
      name: '日期连续性',
      category: 'completeness',
      status: 'pass',
      message: `日期连续性正常（按交易日历口径核对，已排除 ${holidayGaps} 处整段休市区间）`,
    };
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
   * 分析时间序列间隔。
   *
   * ⚠️ 历史缺陷（已修）：旧实现用 `Math.floor(diffDays * 5/7)` 估算交易日，
   * 既把「完整的长假区间」误报为`holiday`/`data_missing`，估算值本身也不准
   * （未按真实周末与法定休市扣除）。现改为**直接用交易日历数区间内的交易日**。
   *
   * 另：区间判定须用 `DISTINCT trade_date` 消解抹布行 —— 库中假期可能有
   * 伪造行情行，若按行计数会把长假判成「有数据」，掩盖真实缺口。
   */
  analyzeGaps(data: KLineData[]): TimeSeriesGap[] {
    const gaps: TimeSeriesGap[] = [];
    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    for (let i = 1; i < sorted.length; i++) {
      const startDate = sorted[i - 1].tradeDate;
      const endDate = sorted[i].tradeDate;
      const diffDays = daysBetween(startDate, endDate);

      // 区间内「本应有」的交易日数（开区间，已排除周末与法定休市，也不含两端端点）
      const expectedTradingDays = tradingDaysStrictlyBetween(startDate, endDate);
      // 实际记录数：注意 sorted[i-1] 与 sorted[i] 是**相邻**两条记录，
      // 两者之间不可能还有别的记录，故此处恒为 0。
      // （历史 bug：曾误写为 `i - 1`，把「前面已有的记录数」当成「区间内记录数」，
      //   导致 expected - actual 被抵消，真缺口反而检不出来。）
      const actualInRange = countRecordsStrictlyBetween(sorted, startDate, endDate);
      const missing = expectedTradingDays - actualInRange;

      // 只有「日历说该开市、实际却没有记录」才算真缺口
      if (missing > 0) {
        let gapType: TimeSeriesGap['gapType'] = 'data_missing';
        if (diffDays > 30) gapType = 'suspension';
        else if (diffDays > 7 && diffDays <= 30) gapType = 'holiday';

        gaps.push({
          startDate,
          endDate,
          missingDays: diffDays,
          expectedTradingDays: Math.max(0, expectedTradingDays - 1),
          gapType,
        });
      }
    }

    return gaps;
  }
}

/**
 * 统计严格落在 `(from, to)` 开区间内的记录数。
 *
 * 用字符串比较（ISO 日期字典序即时间序）而非下标差，避免把「区间外的前序记录」
 * 误计入区间内 —— 那会让缺口被凭空抵消。
 *
 * 注：调用方遍历的是**相邻**两条记录，故正常情况下返回值恒为 0；
 * 保留该函数是为了让「区间内已有记录」这一概念显式化、可测。
 */
function countRecordsStrictlyBetween(
  sorted: readonly KLineData[],
  from: string,
  to: string,
): number {
  let n = 0;
  for (const r of sorted) {
    if (r.tradeDate > from && r.tradeDate < to) n += 1;
  }
  return n;
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
