/**
 * A 股交易所涨跌停价 + 「是否触及涨跌停」的**唯一**判定实现。
 *
 * 背景（P0 缺陷 2）：同一天同一后端存在两套涨跌停算法，给出两套值——
 *   - `services/marketBreadth.ts`：现价 vs 腾讯行情 f47/f48 的交易所涨跌停价（正确）
 *   - `db/Database.ts`：`change_percent >= 9.5% / <= -9.5%` 阈值近似（错误）
 * 在大跌日（2026-10-30 均涨幅 -2.83%）「接近但未触及」的创业板/科创板标的多，
 * 近似口径把 49/93 虚报成 58/207（跌停 +122.6%）。
 *
 * 本模块把两处收敛成一份实现：
 *   1. `exchangeLimitPrices()` 由前收盘价按**交易所板块制度**推出涨跌停价；
 *   2. `isAtLimitUp()/isAtLimitDown()` 用固定容差比较现价与涨跌停价。
 * `marketBreadth` 的腾讯路径（直接拿 f47/f48）与 PG 路径（由 `close - change_amount`
 * 还原前收盘后按制度推算）共用后者，故两端口径必然一致。
 *
 * 制度口径（2026-11 现价）：科创板 688/689 ±20%、创业板 300/301 ±20%、
 * 北交所 4/8 开头 ±30%、其余主板 ±10%。
 * **ST 不单独收窄**：2026-10-30 全市场用腾讯 f47/f48 逐只核对，ST/*ST 标的一律
 * ±10%（21 只 ST 只有按 10% 才对得上真实涨跌停价），若按旧文档「ST ±5%」推算
 * 会额外虚报 20 只跌停。故此处以真实源实测为准，不写死 5%。
 *
 * 还原前收盘价的可靠性：`daily_quotes.change_amount` 与 `change_percent` 在
 * 2026-10-30 全 5184 行完全自洽（`change_amount/(close-change_amount)*100`
 * 与 `change_percent` 偏差 ≤0.02pp），故 `close_price - change_amount` 即真实前收盘。
 */

/** 容差（元）：吸收最小报价单位 0.01 与浮点误差，与 marketBreadth 历史取值一致 */
export const LIMIT_TOLERANCE_YUAN = 0.005;

/** 浮点补偿：`17.15 * 0.9 = 15.434999...` 直接 Math.round 会少 1 分 */
const CENT_EPSILON = 1e-6;

/** 归一为 6 位裸代码（去掉 SH./.SH/SH 前缀后缀） */
function bareDigits(symbol: string): string {
  return (symbol || '').toUpperCase().replace(/^(SH|SZ|BJ)\.?/, '').replace(/\.(SH|SZ|BJ)$/, '');
}

/**
 * 按板块返回涨跌幅限制比例。
 * 无法识别的代码按主板 ±10%（A 股绝对多数），不做其他猜测。
 */
export function boardLimitRatio(symbol: string): number {
  const bare = bareDigits(symbol);
  if (/^(688|689)/.test(bare)) return 0.2; // 科创板
  if (/^(300|301)/.test(bare)) return 0.2; // 创业板
  if (/^(4|8)/.test(bare)) return 0.3; // 北交所
  return 0.1; // 沪深主板
}

function roundCent(v: number): number {
  return Math.round(v * 100 + CENT_EPSILON) / 100;
}

/**
 * 由前收盘价推算交易所涨跌停价（保留 2 位小数，与交易所四舍五入口径一致）。
 * 前收盘价缺失/非正 → 返回 null（调用方必须按「不可判定」处理，不得回退近似）。
 */
export function exchangeLimitPrices(
  prevClose: number,
  symbol: string,
): { limitUpPrice: number; limitDownPrice: number } | null {
  if (!Number.isFinite(prevClose) || prevClose <= 0) return null;
  const ratio = boardLimitRatio(symbol);
  return {
    limitUpPrice: roundCent(prevClose * (1 + ratio)),
    limitDownPrice: roundCent(prevClose * (1 - ratio)),
  };
}

/** 现价是否触及涨停价（涨停价缺失/为 0 → 不可判定，返回 false 且由调用方计入未判定） */
export function isAtLimitUp(price: number, limitUpPrice: number): boolean {
  return limitUpPrice > 0 && price >= limitUpPrice - LIMIT_TOLERANCE_YUAN;
}

/** 现价是否触及跌停价 */
export function isAtLimitDown(price: number, limitDownPrice: number): boolean {
  return limitDownPrice > 0 && price <= limitDownPrice + LIMIT_TOLERANCE_YUAN;
}
