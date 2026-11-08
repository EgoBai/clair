/**
 * 防复发断言：评级变动卡片在源不提供 prevRating 时必须显示「源未提供 / 不可判定」，
 * 不得回落到「暂无数据」这类把「无法判断」说成「没有变化」的假空态。
 * 背景：43fe90f78 —— 东方财富研报源字段无 prevRating，前端按 prevRating 比对恒得 0 条，
 * 曾落 AntD Table 默认空态，线上表现等同于「无评级变动」。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../pages/ReportCenterPage.tsx'),
  'utf8',
);

describe('ReportCenterPage 评级变动空态诚实性', () => {
  it('0 条变动时标签声明源未提供，表空态声明不可判定', () => {
    expect(SRC).toContain('源未提供');
    expect(SRC).toContain('不提供前次评级');
    expect(SRC).toContain('不可判定');
  });

  it('不得回落到「暂无数据」假空态', () => {
    expect(SRC).not.toContain('暂无数据');
  });

  it('空态分支由 ratingChanges.length 判定，而不是默认渲染', () => {
    expect(SRC).toMatch(/ratingChanges\.length > 0/);
    expect(SRC).toMatch(/: <Tag color="default">源未提供<\/Tag>/);
  });
});
