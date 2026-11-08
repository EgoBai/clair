/**
 * 买入评级占比（单一实现，页面只调用本函数）。
 * 口径：分子只计 rating==='buy'；增持（overweight）属看好但非买入，计入分子即口径倒算。
 * 分母为有评级研报（rating!=='none'），未评级研报不进分母；无有评级研报返回 0。
 */
export function buyRatingRatio(ratings: readonly string[]): number {
  const rated = ratings.filter((r) => r !== 'none');
  if (rated.length === 0) return 0;
  const buy = rated.filter((r) => r === 'buy').length;
  return buy / rated.length;
}
