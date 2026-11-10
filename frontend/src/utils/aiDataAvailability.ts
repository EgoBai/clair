/**
 * AI 数据可用性边界 —— 单一真源
 *
 * 背景（D75/D76）：页面 dataSource 从未进入 AI 对话上下文，导致 AI 在
 * dataSource=unavailable 的页面上仍能给出「看起来有理」的结论，属无源断言。
 *
 * 本模块只做一件事：把页面的 dataSource 归一化，并产出**可上屏/可入 prompt**
 * 的边界声明。纯函数，无副作用，便于单测。
 */

/** 归一化后的数据可用性 */
export type DataAvailability = 'real' | 'partial' | 'unavailable' | 'unknown';

/**
 * 把任意来源的 dataSource 归一化为四态。
 * - 'real' / 'live' / 'ok' → real
 * - 'partial' / 'degraded' → partial
 * - 'unavailable' / 'mock' / 'demo' → unavailable
 * - 其余（含 null/undefined/空串/无法识别）→ unknown
 */
export function normalizeDataSource(value: unknown): DataAvailability {
  if (typeof value !== 'string') return 'unknown';
  const v = value.trim().toLowerCase();
  if (v === 'real' || v === 'live' || v === 'ok') return 'real';
  if (v === 'partial' || v === 'degraded') return 'partial';
  if (v === 'unavailable' || v === 'mock' || v === 'demo' || v === 'placeholder') return 'unavailable';
  return 'unknown';
}

/**
 * 产出注入 system prompt 的数据可用性边界声明。
 * real 返回空串（不打扰正常回答）；其余三态都必须显式约束。
 */
export function buildDataAvailabilityClause(value: unknown): string {
  const state = normalizeDataSource(value);
  switch (state) {
    case 'real':
      return '';
    case 'partial':
      return '【数据可用性】当前页面只有部分数据可用（dataSource=partial）。回答只能基于已确认可用的部分，缺失部分必须明确说“该项数据当前不可用”，禁止推测或补零。';
    case 'unavailable':
      return '【数据可用性】当前页面数据源不可用（dataSource=unavailable）。你看不到本页的行情、研报或财务数据。回答必须首先明确说明“无法基于本页数据判断”，禁止给出基于本页数据的任何结论、数值或评级。';
    case 'unknown':
    default:
      return '【数据可用性】当前页面未声明数据来源（unknown）。回答不得假设页面已有数据；若用户问题依赖本页数值，先说明无法确认数据来源，再给出与页面无关的一般性说明。';
  }
}
