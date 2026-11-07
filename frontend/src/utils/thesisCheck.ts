import type { ThesisCard, ThesisStance, ThesisValuation } from '../store/useThesisStore';

/**
 * 观点检查：用当前价格对照观点卡自己写下的估值区间，给出「有效 / 存疑 / 已证伪 / 待验证」。
 *
 * 三条纪律：
 * 1. 只用卡上真实填写的数字与真实行情，缺行情就是「待验证」，绝不默认「有效」。
 * 2. 不落库、不伪造历史：结论每次渲染按当下数据重算，避免把旧结论当新事实。
 * 3. 判据写在这里，谁都能复核；不引入模型打分或黑箱。
 */

export type ThesisCheckVerdict = 'valid' | 'warning' | 'invalid' | 'unknown';

export interface ThesisCheckResult {
  verdict: ThesisCheckVerdict;
  label: string;
  reasons: string[];
  price: number | null;
  staleDays: number | null;
}

export const THESIS_CHECK_LABEL: Record<ThesisCheckVerdict, string> = {
  valid: '有效',
  warning: '存疑',
  invalid: '已证伪',
  unknown: '待验证',
};

export const THESIS_CHECK_COLOR: Record<ThesisCheckVerdict, string> = {
  valid: 'var(--color-up)',
  warning: 'var(--color-warning)',
  invalid: 'var(--color-down)',
  unknown: 'var(--text-tertiary)',
};

/** 超过这个天数未复核，即使价格仍支持观点也降为「存疑」。 */
export const THESIS_STALE_DAYS = 90;

export const THESIS_STANCE_RULE: Record<ThesisStance, string> = {
  bullish: '看多：触及卖出价即证伪；高于合理价存疑；其余有效',
  bearish: '看空：触及买入价即失去赔率；低于合理价空间收窄',
  neutral: '中性：只在价格越过区间两端时提示',
  watch: '观察：只在价格越过区间两端时提示',
};

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function daysBetween(fromIso: string, now: Date): number | null {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const diff = now.getTime() - from.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000);
}

const money = (value: number): string => '¥' + value.toFixed(2);

interface Judgement {
  verdict: Exclude<ThesisCheckVerdict, 'unknown'>;
  reasons: string[];
}

function judgeByStance(stance: ThesisStance, valuation: ThesisValuation, price: number): Judgement | null {
  const buy = num(valuation.buy);
  const fair = num(valuation.fair);
  const sell = num(valuation.sell);

  if (buy === null && fair === null && sell === null) return null;

  if (stance === 'bullish') {
    if (sell !== null && price >= sell) {
      return { verdict: 'invalid', reasons: ['现价 ' + money(price) + ' 已触及卖出价 ' + money(sell)] };
    }
    if (fair !== null && price > fair) {
      return { verdict: 'warning', reasons: ['现价 ' + money(price) + ' 高于合理价 ' + money(fair)] };
    }
    if (buy !== null && price <= buy) {
      return { verdict: 'valid', reasons: ['现价 ' + money(price) + ' 仍在买入区间（≤ ' + money(buy) + '）'] };
    }
    if (fair !== null) {
      return { verdict: 'valid', reasons: ['现价 ' + money(price) + ' 低于合理价 ' + money(fair)] };
    }
    return null;
  }

  if (stance === 'bearish') {
    if (buy !== null && price <= buy) {
      return { verdict: 'invalid', reasons: ['现价 ' + money(price) + ' 已跌至买入价 ' + money(buy) + '，看空赔率消失'] };
    }
    if (fair !== null && price < fair) {
      return { verdict: 'warning', reasons: ['现价 ' + money(price) + ' 低于合理价 ' + money(fair) + '，下行空间收窄'] };
    }
    return { verdict: 'valid', reasons: ['现价 ' + money(price) + ' 仍高于合理价'] };
  }

  // neutral / watch：不做方向判断，只提示越过区间两端
  if (sell !== null && price > sell) {
    return { verdict: 'warning', reasons: ['现价 ' + money(price) + ' 高于卖出价 ' + money(sell)] };
  }
  if (buy !== null && price < buy) {
    return { verdict: 'warning', reasons: ['现价 ' + money(price) + ' 低于买入价 ' + money(buy)] };
  }
  return { verdict: 'valid', reasons: ['现价 ' + money(price) + ' 位于估值区间内'] };
}

export function evaluateThesis(
  card: Pick<ThesisCard, 'stance' | 'valuation' | 'updatedAt'>,
  price: number | null | undefined,
  now: Date = new Date(),
): ThesisCheckResult {
  const current = num(price);
  const staleDays = daysBetween(card.updatedAt, now);
  const stale = staleDays !== null && staleDays >= THESIS_STALE_DAYS;
  const staleReasons = stale && staleDays !== null ? ['观点已 ' + staleDays + ' 天未复核'] : [];

  if (current === null) {
    return {
      verdict: 'unknown',
      label: THESIS_CHECK_LABEL.unknown,
      reasons: ['缺少最新行情，未做判断', ...staleReasons],
      price: null,
      staleDays,
    };
  }

  const judged = judgeByStance(card.stance, card.valuation, current);
  if (!judged) {
    return {
      verdict: 'unknown',
      label: THESIS_CHECK_LABEL.unknown,
      reasons: ['未填写估值区间，无法对照价格', ...staleReasons],
      price: current,
      staleDays,
    };
  }

  // 报价支持观点但观点太久没更新时，不直接给「有效」，降为存疑等人复核。
  const verdict: ThesisCheckVerdict = stale && judged.verdict === 'valid' ? 'warning' : judged.verdict;

  return {
    verdict,
    label: THESIS_CHECK_LABEL[verdict],
    reasons: [...judged.reasons, ...staleReasons],
    price: current,
    staleDays,
  };
}
