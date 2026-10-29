import { describe, it, expect } from 'vitest';
import { toDateStr } from '../api/backtest-routes';

/**
 * 回测日期日历契约（工单 R5-①）：
 * POST /api/backtest/run 曾把请求区间 2026-06-01~2026-09-30 实测报成
 * 05-31~09-29（UTC -1 天）。根因：node-pg 把 DATE 列解析为**本地零点**
 * 的 Date，旧实现用 toISOString()（UTC）取日期，东八区下整体偏移 -1 天。
 * 修复后：字符串按 YYYY-MM-DD 日历段截取、Date 按零点归属还原。
 */
const pad = (n: number) => String(n).padStart(2, '0');
const localStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcStr = (d: Date) => d.toISOString().slice(0, 10);

describe('toDateStr 日期日历契约', () => {
  it('YYYY-MM-DD 字符串直接按日历截取，不经 Date 时区往返', () => {
    expect(toDateStr('2026-06-01')).toBe('2026-06-01');
    expect(toDateStr('2026-09-30')).toBe('2026-09-30');
    expect(toDateStr(' 2026-06-01 ')).toBe('2026-06-01');
  });

  it('node-pg 形态的本地零点 Date（东八区下 UTC 分量是前一天 16:00）必须还原回本地日历日', () => {
    // 构造 2026-06-01 的本地零点（node-pg 解析 DATE 列的产物）
    const pgDate = new Date(2026, 5, 1, 0, 0, 0, 0);
    expect(toDateStr(pgDate)).toBe('2026-06-01');
    // 旧实现的失败模式：只要本机时区不是 UTC，toISOString 就会给出前一天
    if (utcStr(pgDate) !== localStr(pgDate)) {
      expect(utcStr(pgDate)).not.toBe('2026-06-01'); // 复现旧 bug 的前提成立
    }
  });

  it('date-only 字符串经 Joi 转出的 UTC 零点 Date，在任何时区都还原回同一日历日', () => {
    const joiDate = new Date('2026-06-01'); // UTC 零点
    expect(toDateStr(joiDate)).toBe('2026-06-01');
    expect(toDateStr(joiDate)).toBe(utcStr(joiDate));
  });

  it('带时刻的完整时间戳按本地分量归一化', () => {
    const ts = new Date(2026, 8, 30, 23, 59, 59);
    expect(toDateStr(ts)).toBe(localStr(ts));
  });

  it('非法/空输入返回 null，不抛异常', () => {
    expect(toDateStr(null)).toBeNull();
    expect(toDateStr(undefined)).toBeNull();
    expect(toDateStr('')).toBeNull();
    expect(toDateStr('not-a-date')).toBeNull();
    expect(toDateStr(new Date('invalid'))).toBeNull();
  });
});
