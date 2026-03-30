/**
 * A股除权除息复权处理引擎
 * 参考 Wind 数据标准
 * 
 * 支持:
 * - 前复权 (Forward Adjustment): 以最新价格为基准，历史价格向前调整
 * - 后复权 (Backward Adjustment): 以首日价格为基准，后续价格向后调整
 * - 不复权 (No Adjustment): 原始价格
 * - 分红送转处理
 * 
 * 复权公式:
 * 前复权价 = (复权前价格 - 现金红利) / (1 + 流通股份变动比例)
 * 后复权价 = 复权前价格 * (1 + 流通股份变动比例) + 现金红利
 */

import { KLineData, DailyQuote } from '../../shared/types';

// ==================== 类型定义 ====================

/** 除权除息事件 */
export interface ExRightsEvent {
  id: string;
  symbol: string;
  /** 公告日期 */
  announceDate: string;
  /** 除权除息日 (股权登记日次日) */
  exRightsDate: string;
  /** 方案类型 */
  type: DividendType;
  /** 每股派息 (税前, 元) */
  cashDividendPerShare: number;
  /** 每股送股 (股) */
  bonusSharesPerShare: number;
  /** 每股转增 (股) */
  capitalReservePerShare: number;
  /** 个人所得税率 */
  taxRate: number;
  /** 方案描述 */
  description: string;
}

export type DividendType =
  | 'cash'           // 纯现金分红
  | 'bonus'          // 送股
  | 'capital_reserve' // 转增
  | 'mixed'          // 混合 (分红+送转)
  | 'rights_issue'   // 配股
  | 'split';         // 拆股

/** 复权计算结果 */
export interface AdjustedKLine extends KLineData {
  /** 原始价格 (未复权) */
  originalOpen: number;
  originalClose: number;
  originalHigh: number;
  originalLow: number;
  /** 复权因子 */
  adjustmentFactor: number;
  /** 复权类型 */
  adjustmentType: 'forward' | 'backward' | 'none';
}

/** 复权参数 */
export interface AdjustmentParams {
  /** 复权类型 */
  type: 'forward' | 'backward' | 'none';
  /** 个人持股期限 (天), 影响税率 */
  holdingDays?: number;
  /** 是否含税 */
  includeTax?: boolean;
}

// ==================== 税率计算 ====================

/**
 * A股红利税计算
 * 持股 < 1个月: 20%
 * 持股 1个月~1年: 10%
 * 持股 > 1年: 免税
 */
export function calculateDividendTaxRate(holdingDays: number): number {
  if (holdingDays <= 0) return 0.2; // 默认按最高税率
  if (holdingDays < 30) return 0.2;
  if (holdingDays < 365) return 0.1;
  return 0;
}

/**
 * 计算除权除息参考价
 * 除权参考价 = (股权登记日收盘价 - 每股派息(税后)) / (1 + 每股送股 + 每股转增)
 */
export function calculateExRightsReferencePrice(
  closePrice: number,
  cashDividend: number,
  bonusShares: number,
  capitalReserve: number,
  taxRate: number = 0.1
): number {
  const afterTaxDividend = cashDividend * (1 - taxRate);
  const totalShareChange = bonusShares + capitalReserve;
  return (closePrice - afterTaxDividend) / (1 + totalShareChange);
}

// ==================== 复权引擎 ====================

export class AdjustmentEngine {
  private events: Map<string, ExRightsEvent[]> = new Map();
  private factorCache: Map<string, Map<string, number>> = new Map();

  /**
   * 注册除权除息事件
   */
  addEvent(event: ExRightsEvent): void {
    const list = this.events.get(event.symbol) || [];
    // 避免重复
    const existing = list.find(
      e => e.exRightsDate === event.exRightsDate && e.type === event.type
    );
    if (!existing) {
      list.push(event);
      list.sort((a, b) => a.exRightsDate.localeCompare(b.exRightsDate));
      this.events.set(event.symbol, list);
      // 清除缓存
      this.factorCache.delete(event.symbol);
    }
  }

  /**
   * 批量注册事件
   */
  addEvents(events: ExRightsEvent[]): void {
    for (const event of events) {
      this.addEvent(event);
    }
  }

  /**
   * 获取复权因子列表
   * 复权因子 = 连乘(各次除权除息的调整比例)
   */
  getAdjustmentFactors(symbol: string): Map<string, number> {
    const cached = this.factorCache.get(symbol);
    if (cached) return cached;

    const events = this.events.get(symbol) || [];
    const factors = new Map<string, number>();

    if (events.length === 0) {
      this.factorCache.set(symbol, factors);
      return factors;
    }

    // 从最新事件向前累计计算复权因子
    let cumulativeFactor = 1;

    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const taxRate = event.taxRate ?? 0.1;
      const afterTaxDividend = event.cashDividendPerShare * (1 - taxRate);
      const totalShareChange = event.bonusSharesPerShare + event.capitalReservePerShare;

      // 调整比例 = 1 / (1 + 送转比例) + 派息调整
      // 前复权调整因子 = (前复权因子 * 除权前价格 + 派息) / 除权后价格
      // 简化为: factor = factor * (1 + totalShareChange) / (1 + totalShareChange - afterTaxDividend / referencePrice)
      
      // 更精确: 每次除权事件将前一因子乘以调整系数
      const adjustmentCoeff = 1 / (1 + totalShareChange);
      cumulativeFactor *= adjustmentCoeff;

      factors.set(event.exRightsDate, cumulativeFactor);

      // 派息的额外调整
      if (afterTaxDividend > 0) {
        // 现金分红会导致价格向下调整，需要补偿
        // 这个在实际价格调整时通过减去派息处理
      }
    }

    this.factorCache.set(symbol, factors);
    return factors;
  }

  /**
   * 对K线数据进行复权处理
   */
  adjustKLineData(
    symbol: string,
    data: KLineData[],
    params: AdjustmentParams
  ): AdjustedKLine[] {
    if (params.type === 'none' || data.length === 0) {
      return data.map(d => ({
        ...d,
        originalOpen: d.open,
        originalClose: d.close,
        originalHigh: d.high,
        originalLow: d.low,
        adjustmentFactor: 1,
        adjustmentType: 'none' as const,
      }));
    }

    const events = this.events.get(symbol) || [];
    if (events.length === 0) {
      return data.map(d => ({
        ...d,
        originalOpen: d.open,
        originalClose: d.close,
        originalHigh: d.high,
        originalLow: d.low,
        adjustmentFactor: 1,
        adjustmentType: params.type,
      }));
    }

    // 按日期排序
    const sorted = [...data].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    if (params.type === 'forward') {
      return this.forwardAdjust(symbol, sorted, events, params);
    } else {
      return this.backwardAdjust(symbol, sorted, events, params);
    }
  }

  /**
   * 前复权: 以最新价格为基准
   * 
   * 前复权价 = 原始价 × 复权因子 - 累计派息
   * 复权因子 = Π(1 + 送转比例[i])，从最新向前累计
   */
  private forwardAdjust(
    symbol: string,
    data: KLineData[],
    events: ExRightsEvent[],
    params: AdjustmentParams
  ): AdjustedKLine[] {
    // 计算每次除权事件的累计调整因子
    const eventFactors: { date: string; factor: number; cashAdj: number }[] = [];
    let cumulativeFactor = 1;
    let cumulativeCash = 0;

    // 从最新事件向前计算
    const sortedEvents = [...events].sort((a, b) =>
      b.exRightsDate.localeCompare(a.exRightsDate)
    );

    for (const event of sortedEvents) {
      const taxRate = params.includeTax !== false ? (event.taxRate ?? 0.1) : 0;
      const afterTaxDividend = event.cashDividendPerShare * (1 - taxRate);
      const totalShareChange = event.bonusSharesPerShare + event.capitalReservePerShare;

      cumulativeFactor *= (1 + totalShareChange);
      cumulativeCash += afterTaxDividend / cumulativeFactor;

      eventFactors.push({
        date: event.exRightsDate,
        factor: cumulativeFactor,
        cashAdj: cumulativeCash,
      });
    }

    // 创建日期到调整因子的映射
    const factorMap = new Map<string, { factor: number; cashAdj: number }>();
    for (const ef of eventFactors) {
      factorMap.set(ef.date, ef);
    }

    // 找到最后一个除权事件的累计因子
    const lastFactor = eventFactors.length > 0 ? eventFactors[eventFactors.length - 1] : null;

    return data.map(d => {
      // 找到该日期之前（含当天）最近的除权事件
      let currentFactor = 1;
      let currentCashAdj = 0;

      for (const event of sortedEvents) {
        if (d.tradeDate < event.exRightsDate) {
          // 这个事件在当前日期之后，需要调整
          const taxRate = params.includeTax !== false ? (event.taxRate ?? 0.1) : 0;
          const afterTaxDividend = event.cashDividendPerShare * (1 - taxRate);
          const totalShareChange = event.bonusSharesPerShare + event.capitalReservePerShare;
          currentFactor /= (1 + totalShareChange);
        }
      }

      // 从最新向前累计所有在当前日期之后的除权事件
      currentFactor = 1;
      let futureEvents = 0;
      for (const ef of eventFactors) {
        if (d.tradeDate < ef.date) {
          futureEvents++;
        }
      }

      // 简化计算: 直接使用前复权公式
      // 前复权价 = 原价 * 累计复权因子
      let adjFactor = 1;
      let adjCash = 0;
      for (const event of events) {
        if (d.tradeDate < event.exRightsDate) {
          const taxRate = params.includeTax !== false ? (event.taxRate ?? 0.1) : 0;
          const afterTaxDiv = event.cashDividendPerShare * (1 - taxRate);
          const shareChange = event.bonusSharesPerShare + event.capitalReservePerShare;
          adjFactor /= (1 + shareChange);
          adjCash += afterTaxDiv * adjFactor;
        }
      }

      return {
        ...d,
        open: Math.max(0, (d.open - adjCash) / adjFactor),
        close: Math.max(0, (d.close - adjCash) / adjFactor),
        high: Math.max(0, (d.high - adjCash) / adjFactor),
        low: Math.max(0, (d.low - adjCash) / adjFactor),
        originalOpen: d.open,
        originalClose: d.close,
        originalHigh: d.high,
        originalLow: d.low,
        adjustmentFactor: adjFactor,
        adjustmentType: 'forward' as const,
      };
    });
  }

  /**
   * 后复权: 以首日价格为基准
   * 
   * 后复权价 = 原始价 × 复权因子 + 累计派息
   * 复权因子 = Π(1 + 送转比例[i])，从首日向后累计
   */
  private backwardAdjust(
    symbol: string,
    data: KLineData[],
    events: ExRightsEvent[],
    params: AdjustmentParams
  ): AdjustedKLine[] {
    return data.map(d => {
      let adjFactor = 1;
      let adjCash = 0;

      for (const event of events) {
        if (d.tradeDate >= event.exRightsDate) {
          const taxRate = params.includeTax !== false ? (event.taxRate ?? 0.1) : 0;
          const afterTaxDiv = event.cashDividendPerShare * (1 - taxRate);
          const shareChange = event.bonusSharesPerShare + event.capitalReservePerShare;
          adjFactor *= (1 + shareChange);
          adjCash += afterTaxDiv * adjFactor;
        }
      }

      return {
        ...d,
        open: d.open * adjFactor + adjCash,
        close: d.close * adjFactor + adjCash,
        high: d.high * adjFactor + adjCash,
        low: d.low * adjFactor + adjCash,
        originalOpen: d.open,
        originalClose: d.close,
        originalHigh: d.high,
        originalLow: d.low,
        adjustmentFactor: adjFactor,
        adjustmentType: 'backward' as const,
      };
    });
  }

  /**
   * 计算复权后的涨跌幅
   * 复权涨跌幅 = (调整后收盘价 - 调整后昨收) / 调整后昨收 * 100
   */
  calculateAdjustedChangePercent(adjustedData: AdjustedKLine[]): number[] {
    const result: number[] = [0]; // 第一天无涨跌幅
    for (let i = 1; i < adjustedData.length; i++) {
      const prevClose = adjustedData[i - 1].close;
      if (prevClose === 0) {
        result.push(0);
      } else {
        result.push(((adjustedData[i].close - prevClose) / prevClose) * 100);
      }
    }
    return result;
  }

  /**
   * 获取指定日期范围内的除权除息事件
   */
  getEventsInRange(
    symbol: string,
    startDate: string,
    endDate: string
  ): ExRightsEvent[] {
    const events = this.events.get(symbol) || [];
    return events.filter(
      e => e.exRightsDate >= startDate && e.exRightsDate <= endDate
    );
  }

  /**
   * 获取最近的除权除息事件
   */
  getLatestEvent(symbol: string): ExRightsEvent | null {
    const events = this.events.get(symbol) || [];
    return events.length > 0 ? events[events.length - 1] : null;
  }

  /**
   * 清除指定股票的事件数据
   */
  clearEvents(symbol: string): void {
    this.events.delete(symbol);
    this.factorCache.delete(symbol);
  }

  /**
   * 获取所有已注册的股票代码
   */
  getRegisteredSymbols(): string[] {
    return Array.from(this.events.keys());
  }
}

// ==================== 工具函数 ====================

/**
 * 生成除权除息方案描述
 */
export function describeDividendEvent(event: ExRightsEvent): string {
  const parts: string[] = [];

  if (event.cashDividendPerShare > 0) {
    parts.push(`每10股派${(event.cashDividendPerShare * 10).toFixed(2)}元`);
  }
  if (event.bonusSharesPerShare > 0) {
    parts.push(`每10股送${(event.bonusSharesPerShare * 10).toFixed(0)}股`);
  }
  if (event.capitalReservePerShare > 0) {
    parts.push(`每10股转增${(event.capitalReservePerShare * 10).toFixed(0)}股`);
  }

  return parts.join('，') || '无分红方案';
}

/**
 * 计算股息率 (Dividend Yield)
 * 股息率 = 每股派息 / 股价 * 100%
 */
export function calculateDividendYield(
  cashDividendPerShare: number,
  currentPrice: number
): number {
  if (currentPrice <= 0) return 0;
  return (cashDividendPerShare / currentPrice) * 100;
}

/**
 * 计算送转比例
 * 返回每10股送转合计
 */
export function calculateTotalBonusRatio(event: ExRightsEvent): number {
  return (event.bonusSharesPerShare + event.capitalReservePerShare) * 10;
}

/**
 * 验证除权除息事件数据完整性
 */
export function validateExRightsEvent(event: ExRightsEvent): string[] {
  const errors: string[] = [];

  if (!event.symbol) errors.push('股票代码不能为空');
  if (!event.exRightsDate) errors.push('除权除息日不能为空');
  if (event.cashDividendPerShare < 0) errors.push('每股派息不能为负');
  if (event.bonusSharesPerShare < 0) errors.push('每股送股不能为负');
  if (event.capitalReservePerShare < 0) errors.push('每股转增不能为负');
  if (event.taxRate < 0 || event.taxRate > 1) errors.push('税率应在0-1之间');

  // 派息和送转至少有一项
  const hasAction =
    event.cashDividendPerShare > 0 ||
    event.bonusSharesPerShare > 0 ||
    event.capitalReservePerShare > 0;
  if (!hasAction) errors.push('派息、送股、转增至少有一项大于0');

  return errors;
}

// ==================== 导出默认实例 ====================

export const defaultAdjustmentEngine = new AdjustmentEngine();
