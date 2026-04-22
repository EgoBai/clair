/**
 * 金融数据格式化工具函数
 * 统一管理所有数字、金额、成交量的显示格式
 */
/**
 * 格式化数字（带千分位）
 */
export declare const formatNumber: (num: number, decimals?: number) => string;
/**
 * 格式化市值
 * 万亿 → 亿 → 万
 */
export declare const formatMarketCap: (cap?: number | null) => string;
/**
 * 格式化成交量
 */
export declare const formatVolume: (vol?: number | null) => string;
/**
 * 格式化成交额
 */
export declare const formatTurnover: (turnover?: number | null) => string;
/**
 * 格式化涨跌幅（带符号）
 */
export declare const formatChangePercent: (percent?: number | null) => string;
/**
 * 格式化涨跌额（带符号）
 */
export declare const formatChange: (change?: number | null) => string;
/**
 * 格式化换手率
 */
export declare const formatTurnoverRate: (rate?: number | null) => string;
/**
 * 格式化价格
 */
export declare const formatPrice: (price?: number | null) => string;
/**
 * 获取涨跌颜色类名
 */
export declare const getChangeColor: (value?: number | null) => "positive" | "negative" | "neutral";
/**
 * 获取涨跌颜色（hex）
 */
export declare const getChangeHexColor: (value?: number | null) => string;
/**
 * 格式化股票代码显示
 * 000001.SZ → 000001
 */
export declare const formatSymbol: (symbol: string) => string;
/**
 * 判断市场
 */
export declare const getMarketLabel: (market: string) => string;
/**
 * 格式化日期
 */
export declare const formatDate: (date: Date | string | number) => string;
/**
 * 格式化日期时间
 */
export declare const formatDateTime: (date: Date | string | number) => string;
/**
 * 格式化大数字（千分位）
 */
export declare const formatLargeNumber: (num: number) => string;
/**
 * 获取涨跌颜色（hex）
 * A股红涨绿跌
 */
export declare const getColorByChange: (value?: number | null) => string;
/**
 * 获取涨跌文字（带符号，2位小数）
 * @deprecated 使用 formatChange 替代
 */
export declare const getChangeText: (change?: number | null) => string;
/**
 * 判断市场颜色
 */
export declare const getMarketColor: (market: string) => string;
/**
 * 格式化百分比（通用）
 */
export declare const formatPercent: (value?: number | null, decimals?: number) => string;
/**
 * 格式化PE/PB等估值指标
 */
export declare const formatRatio: (value?: number | null) => string;
/**
 * 计算相对时间
 * 5分钟内显示 "刚刚"，1小时内显示 "x分钟前"，否则显示日期
 */
export declare const formatRelativeTime: (date: Date | string | number) => string;
/**
 * 判断涨跌方向
 * @returns 1 = 涨, -1 = 跌, 0 = 平
 */
export declare const getChangeDirection: (value?: number | null) => 1 | -1 | 0;
