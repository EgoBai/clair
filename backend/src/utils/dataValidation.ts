/**
 * 行情数据异常检测引擎
 * 参考 Wind 数据质量标准
 * 
 * 检测维度:
 * - 价格跳变 (Price Jump): 相邻K线收盘价变动超过阈值
 * - 成交量异常 (Volume Anomaly): 成交量偏离均值超过N个标准差
 * - 价格倒挂 (Price Inversion): 最高/最低价逻辑错误
 * - 缺失数据 (Missing Data): 日期不连续
 * - 精度异常 (Precision Anomaly): 数值精度不符合规范
 */

import { KLineData, DailyQuote } from '../types';

// ==================== 异常类型 ====================

export type AnomalyType =
  | 'price_jump'          // 价格跳变
  | 'volume_anomaly'      // 成交量异常
  | 'price_inversion'     // 价格倒挂
  | 'missing_data'        // 数据缺失
  | 'precision_error'     // 精度错误
  | 'zero_volume'         // 零成交量
  | 'negative_price'      // 负价格
  | 'amplitude_exceeded'; // 涨跌幅超限

export interface DataAnomaly {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  tradeDate: string;
  field?: string;
  expected?: number | string;
  actual?: number | string;
  threshold?: number;
}

export interface AnomalyReport {
  symbol: string;
  anomalies: DataAnomaly[];
  checkedAt: string;
  totalRecords: number;
  anomalyCount: number;
  qualityScore: number; // 0-100
}

// ==================== 配置 ====================

export interface AnomalyDetectionConfig {
  // 价格跳变阈值 (百分比)
  priceJumpThreshold: number;
  // 成交量标准差倍数
  volumeStdMultiplier: number;
  // 成交量均值计算窗口
  volumeWindow: number;
  // A股涨跌停限制
  limitUpPercent: number;
  limitDownPercent: number;
  // 最小成交量 (手)
  minVolume: number;
  // 数值精度
  priceDecimals: number;
  volumeDecimals: number;
}

const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  priceJumpThreshold: 15,       // 15% 为价格跳变
  volumeStdMultiplier: 3,       // 3个标准差
  volumeWindow: 20,             // 20日均量
  limitUpPercent: 20,           // 注册制 20% 涨停
  limitDownPercent: 20,         // 注册制 20% 跌停
  minVolume: 0,
  priceDecimals: 2,
  volumeDecimals: 0,
};

// ==================== 检测器 ====================

export class DataAnomalyDetector {
  private config: AnomalyDetectionConfig;

  constructor(config: Partial<AnomalyDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 检测单只股票的K线数据异常
   */
  detect(symbol: string, data: KLineData[]): AnomalyReport {
    const anomalies: DataAnomaly[] = [];

    if (data.length === 0) {
      return {
        symbol,
        anomalies: [],
        checkedAt: new Date().toISOString(),
        totalRecords: 0,
        anomalyCount: 0,
        qualityScore: 100,
      };
    }

    // 按日期排序
    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    // 1. 基础校验
    anomalies.push(...this.checkBasicValidation(sorted));

    // 2. 价格跳变检测
    anomalies.push(...this.checkPriceJumps(sorted));

    // 3. 成交量异常检测
    anomalies.push(...this.checkVolumeAnomalies(sorted));

    // 4. 价格逻辑校验
    anomalies.push(...this.checkPriceLogic(sorted));

    // 5. 数据连续性检查
    anomalies.push(...this.checkDataContinuity(sorted));

    // 6. 涨跌幅校验
    anomalies.push(...this.checkAmplitudeLimit(sorted));

    // 7. 集合竞价/跳空异常检测
    anomalies.push(...this.checkOpeningPrice(sorted));

    // 计算质量评分
    const qualityScore = this.calculateQualityScore(sorted.length, anomalies);

    return {
      symbol,
      anomalies,
      checkedAt: new Date().toISOString(),
      totalRecords: sorted.length,
      anomalyCount: anomalies.length,
      qualityScore,
    };
  }

  /**
   * 基础校验：负价格、负成交量、精度
   */
  private checkBasicValidation(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];

    for (const record of data) {
      // 负价格
      if (record.open < 0 || record.close < 0 || record.high < 0 || record.low < 0) {
        anomalies.push({
          type: 'negative_price',
          severity: 'critical',
          message: '价格为负数',
          tradeDate: record.tradeDate,
          field: 'price',
          actual: Math.min(record.open, record.close, record.high, record.low),
          expected: '>= 0',
        });
      }

      // 零成交量 (可能为停牌)
      if (record.volume === 0 && record.turnover !== 0) {
        anomalies.push({
          type: 'zero_volume',
          severity: 'high',
          message: '成交量为0但成交额非0，数据不一致',
          tradeDate: record.tradeDate,
          field: 'volume',
          actual: 0,
        });
      }

      // 精度校验: 价格应为2位小数
      const checkPrecision = (val: number, field: string) => {
        const str = val.toString();
        const decimalIndex = str.indexOf('.');
        if (decimalIndex !== -1 && str.length - decimalIndex - 1 > this.config.priceDecimals + 1) {
          anomalies.push({
            type: 'precision_error',
            severity: 'low',
            message: `${field}精度过高`,
            tradeDate: record.tradeDate,
            field,
            actual: str,
            expected: `${this.config.priceDecimals}位小数`,
          });
        }
      };

      checkPrecision(record.open, 'open');
      checkPrecision(record.close, 'close');
      checkPrecision(record.high, 'high');
      checkPrecision(record.low, 'low');
    }

    return anomalies;
  }

  /**
   * 价格跳变检测
   */
  private checkPriceJumps(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const threshold = this.config.priceJumpThreshold;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      if (prev.close <= 0) continue;

      const changePercent = Math.abs((curr.close - prev.close) / prev.close) * 100;

      if (changePercent > threshold) {
        anomalies.push({
          type: 'price_jump',
          severity: changePercent > 30 ? 'critical' : 'high',
          message: `收盘价跳变 ${changePercent.toFixed(2)}%`,
          tradeDate: curr.tradeDate,
          field: 'close',
          actual: curr.close,
          expected: prev.close,
          threshold,
        });
      }
    }

    return anomalies;
  }

  /**
   * 成交量异常检测 (基于滑动窗口标准差)
   */
  private checkVolumeAnomalies(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const window = this.config.volumeWindow;
    const multiplier = this.config.volumeStdMultiplier;

    if (data.length < window) return anomalies;

    for (let i = window; i < data.length; i++) {
      const windowData = data.slice(i - window, i);
      const volumes = windowData.map(d => d.volume);
      const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const variance = volumes.reduce((a, v) => a + (v - mean) ** 2, 0) / volumes.length;
      const std = Math.sqrt(variance);

      if (std === 0) continue;

      const curr = data[i];
      const zScore = (curr.volume - mean) / std;

      if (Math.abs(zScore) > multiplier) {
        anomalies.push({
          type: 'volume_anomaly',
          severity: Math.abs(zScore) > 5 ? 'high' : 'medium',
          message: `成交量偏离 ${zScore.toFixed(1)} 个标准差 (日均: ${(mean / 100).toFixed(0)}手)`,
          tradeDate: curr.tradeDate,
          field: 'volume',
          actual: curr.volume,
          expected: mean,
          threshold: multiplier,
        });
      }
    }

    return anomalies;
  }

  /**
   * 价格逻辑校验: high >= max(open, close), low <= min(open, close)
   */
  private checkPriceLogic(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];

    for (const record of data) {
      const maxOC = Math.max(record.open, record.close);
      const minOC = Math.min(record.open, record.close);

      if (record.high < maxOC) {
        anomalies.push({
          type: 'price_inversion',
          severity: 'critical',
          message: `最高价(${record.high})低于开盘/收盘价(${maxOC})`,
          tradeDate: record.tradeDate,
          field: 'high',
          actual: record.high,
          expected: `>= ${maxOC}`,
        });
      }

      if (record.low > minOC) {
        anomalies.push({
          type: 'price_inversion',
          severity: 'critical',
          message: `最低价(${record.low})高于开盘/收盘价(${minOC})`,
          tradeDate: record.tradeDate,
          field: 'low',
          actual: record.low,
          expected: `<= ${minOC}`,
        });
      }

      if (record.high < record.low) {
        anomalies.push({
          type: 'price_inversion',
          severity: 'critical',
          message: `最高价(${record.high})低于最低价(${record.low})`,
          tradeDate: record.tradeDate,
          field: 'high/low',
          actual: `H:${record.high} L:${record.low}`,
        });
      }
    }

    return anomalies;
  }

  /**
   * 数据连续性检查 (检测缺失交易日)
   */
  private checkDataContinuity(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];

    for (let i = 1; i < data.length; i++) {
      const prevDate = new Date(data[i - 1].tradeDate);
      const currDate = new Date(data[i].tradeDate);
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      // 超过4天可能是缺失数据 (周末+节假日最多3-4天)
      if (diffDays > 5) {
        anomalies.push({
          type: 'missing_data',
          severity: 'medium',
          message: `${data[i - 1].tradeDate} 和 ${data[i].tradeDate} 之间间隔 ${Math.floor(diffDays)} 天`,
          tradeDate: data[i].tradeDate,
          field: 'tradeDate',
          actual: `${diffDays}天`,
          expected: '1-4天 (交易日)',
        });
      }
    }

    return anomalies;
  }

  /**
   * 涨跌幅限制校验 (A股涨跌停)
   */
  private checkAmplitudeLimit(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];
    const limitUp = this.config.limitUpPercent;
    const limitDown = -this.config.limitDownPercent;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      if (prev.close <= 0) continue;

      const changePercent = ((curr.close - prev.close) / prev.close) * 100;

      // ST 股为 5%，这里简单检测，实际需要查股票属性
      if (changePercent > limitUp + 0.5 || changePercent < limitDown - 0.5) {
        anomalies.push({
          type: 'amplitude_exceeded',
          severity: 'high',
          message: `涨跌幅 ${changePercent.toFixed(2)}% 超过涨跌停限制 ±${limitUp}%`,
          tradeDate: curr.tradeDate,
          field: 'changePercent',
          actual: changePercent,
          expected: `±${limitUp}%`,
          threshold: limitUp,
        });
      }
    }

    return anomalies;
  }

  /**
   * 集合竞价异常检测
   * A股开盘前有集合竞价(9:15-9:25)，首笔K线的开盘价应为集合竞价产生
   */
  private checkOpeningPrice(data: KLineData[]): DataAnomaly[] {
    const anomalies: DataAnomaly[] = [];

    // 检查每天的开盘价与前一日收盘价的跳空
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (prev.close <= 0) continue;

      const gapPercent = ((curr.open - prev.close) / prev.close) * 100;

      // 跳空超过10%且非涨跌停，可能是数据异常
      if (Math.abs(gapPercent) > 10 && Math.abs(gapPercent) < this.config.limitUpPercent) {
        anomalies.push({
          type: 'price_jump',
          severity: 'medium',
          message: `开盘跳空 ${gapPercent.toFixed(2)}%`,
          tradeDate: curr.tradeDate,
          field: 'open',
          actual: curr.open,
          expected: prev.close,
          threshold: 10,
        });
      }
    }

    return anomalies;
  }

  /**
   * 计算数据质量评分
   */
  private calculateQualityScore(totalRecords: number, anomalies: DataAnomaly[]): number {
    if (totalRecords === 0) return 100;

    const severityWeights: Record<string, number> = {
      critical: 10,
      high: 5,
      medium: 2,
      low: 0.5,
    };

    const totalPenalty = anomalies.reduce(
      (sum, a) => sum + severityWeights[a.severity],
      0
    );

    const maxPenalty = totalRecords * 2; // 每条记录最大扣2分
    const score = Math.max(0, 100 - (totalPenalty / maxPenalty) * 100);

    return Math.round(score * 10) / 10;
  }
}

// ==================== 财务数据精度处理 ====================

/**
 * 财务数据精度处理器
 * 统一处理各类财务数据的精度
 */
export class FinancialDataPrecision {
  /**
   * 处理市盈率 (保留2位小数，处理负值和异常值)
   */
  static normalizePE(pe?: number | null): number | null {
    if (pe === null || pe === undefined) return null;
    if (!isFinite(pe)) return null;
    // PE 通常在 -500 到 500 之间
    if (pe < -500 || pe > 500) return null;
    return Math.round(pe * 100) / 100;
  }

  /**
   * 处理市净率
   */
  static normalizePB(pb?: number | null): number | null {
    if (pb === null || pb === undefined) return null;
    if (!isFinite(pb)) return null;
    if (pb < -50 || pb > 100) return null;
    return Math.round(pb * 100) / 100;
  }

  /**
   * 处理ROE (百分比)
   */
  static normalizeROE(roe?: number | null): number | null {
    if (roe === null || roe === undefined) return null;
    if (!isFinite(roe)) return null;
    // ROE 通常在 -100% 到 100% 之间
    if (roe < -100 || roe > 100) return null;
    return Math.round(roe * 100) / 100;
  }

  /**
   * 处理金额 (统一到元)
   */
  static normalizeAmount(amount?: number | null): number | null {
    if (amount === null || amount === undefined) return null;
    if (!isFinite(amount) || amount < 0) return null;
    return Math.round(amount * 100) / 100;
  }

  /**
   * 处理成交量 (整数)
   */
  static normalizeVolume(vol?: number | null): number | null {
    if (vol === null || vol === undefined) return null;
    if (!isFinite(vol) || vol < 0) return null;
    return Math.round(vol);
  }

  /**
   * 处理涨跌幅 (百分比，2位小数)
   */
  static normalizeChangePercent(pct?: number | null): number | null {
    if (pct === null || pct === undefined) return null;
    if (!isFinite(pct)) return null;
    return Math.round(pct * 100) / 100;
  }
}

// ==================== 数据一致性校验 ====================

/**
 * 前后端数据一致性校验器
 */
export class DataConsistencyChecker {
  /**
   * 校验行情数据完整性
   */
  static validateQuoteRecord(record: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 必填字段
    const requiredFields = ['trade_date', 'open_price', 'close_price', 'high_price', 'low_price', 'volume'];
    for (const field of requiredFields) {
      if (record[field] === null || record[field] === undefined) {
        errors.push(`缺少必填字段: ${field}`);
      }
    }

    // 类型校验
    if (typeof record.volume !== 'number' || record.volume < 0) {
      errors.push('volume 必须为非负数');
    }

    if (typeof record.open_price !== 'number' || record.open_price < 0) {
      errors.push('open_price 必须为非负数');
    }

    // 逻辑校验
    if (record.high_price < record.low_price) {
      errors.push('high_price 不能小于 low_price');
    }

    // 成交额与成交量一致性 (粗略检查)
    if (record.volume > 0 && record.turnover === 0) {
      errors.push('成交量大于0时成交额不应为0');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 对比前后端数据
   */
  static compareData(
    frontend: Record<string, any>,
    backend: Record<string, any>,
    fields: string[]
  ): { match: boolean; mismatches: Array<{ field: string; frontend: any; backend: any }> } {
    const mismatches: Array<{ field: string; frontend: any; backend: any }> = [];

    for (const field of fields) {
      const fv = frontend[field];
      const bv = backend[field];

      // 数值类型允许微小误差
      if (typeof fv === 'number' && typeof bv === 'number') {
        if (Math.abs(fv - bv) > 0.01) {
          mismatches.push({ field, frontend: fv, backend: bv });
        }
      } else if (fv !== bv) {
        mismatches.push({ field, frontend: fv, backend: bv });
      }
    }

    return { match: mismatches.length === 0, mismatches };
  }
}

export default DataAnomalyDetector;
