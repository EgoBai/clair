/**
 * 安全数值转换
 * PostgreSQL numeric字段通过knex返回字符串，需要转为number
 */

/** 安全转数字，失败返回默认值 */
export function toNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '' || v === '-') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** 安全toFixed */
export function safeFixed(v: unknown, digits = 2, fallback = '—'): string {
  const n = toNum(v);
  if (n === 0 && fallback !== '0') return fallback;
  return n.toFixed(digits);
}

/** 安全百分比格式化 */
export function safePercent(v: unknown, digits = 2): string {
  const n = toNum(v);
  return (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';
}

/** 安全金额格式化（亿/万） */
export function safeMoney(v: unknown, digits = 2): string {
  const n = toNum(v);
  if (n >= 1e8) return (n / 1e8).toFixed(digits) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(digits) + '万';
  return n.toFixed(digits);
}
