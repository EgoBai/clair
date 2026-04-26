/**
 * 通用工具函数
 */

/**
 * 安全转换数值，解决 parseFloat(x) || fallback 的 falsy-zero 陷阱
 * 当 parseFloat 返回 NaN/Infinity 时使用 fallback
 * 当 parseFloat 返回 0 时保留 0（合法数值，不是缺失）
 *
 * 参考: Bloomberg Terminal 数据规范 - 所有数值字段必须区分 "缺失" 和 "零值"
 * 零是合法市场数据（价格=0、成交量=0、市值=0），不能与缺失混淆
 *
 * @param value parseFloat 的结果
 * @param fallback 当值为 NaN/Infinity 时返回的默认值（不传则返回 undefined）
 */
export function toValidNumber(value: number, fallback: number): number;
export function toValidNumber(value: number, fallback?: undefined): number | undefined;
export function toValidNumber(value: number, fallback?: number): number | undefined {
  if (Number.isFinite(value)) return value;
  return arguments.length >= 2 ? fallback : undefined;
}
