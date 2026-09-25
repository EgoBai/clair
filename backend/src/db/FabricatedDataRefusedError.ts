/**
 * 生产环境「伪造行情拒供」错误 —— 诚实红线根治
 *
 * 背景：
 *   内存库 (InMemoryDatabase) 曾用 `Math.random()` 伪造 OHLCV / 涨跌幅 / 成交额 /
 *   换手率 / PE / PB / 市值（原 generateQuotes/generatePrice）。
 *   此前 PostgreSQL 不可用时后端会静默降级到内存库，把伪行情当真实行情对外供给。
 *
 *   **R0′-9 已删除该伪造生成器**：内存库如今不生成任何行情/估值，读取方只会得到诚实空态。
 *   本错误因此从「拦截伪造数字」转为「在生产环境把静默空态升级为显式失败」——
 *   「静默返回空 K 线 / 全 0 汇总」会被上层读成「当日无波动」，本身也是一种失真。
 *
 * ⚠️ 不受影响的真实数据：
 *   内存库中的股票清单（symbol / name / market / industry / subIndustry）
 *   来自 `clair-worker/all_stocks_compact.json`（5541 条真实数据），
 *   必须继续正常供给（getStocks / getStockCount / searchStocks / getStockById 等）。
 *
 * 机器可读信息：
 * - `code`       : 'FABRICATED_DATA_REFUSED'
 * - `dataSource` : 'unavailable'（与项目 API 层既有 dataSource 契约语义一致）
 * - `statusCode` : 503
 * - `method`     : 触发拒绝的 InMemoryDatabase 方法名
 *
 * 设计说明（为什么继承 AppError）：
 *   统一错误中间件 `middleware/errorHandler.ts` 只对 `AppError` 实例使用其自带的
 *   statusCode/code；其它 Error 走 `classifyUnknownError()` 的**消息关键字猜测**
 *   （含 'database'/'connection' → 503「数据库服务异常」，否则 500「服务器内部错误」）。
 *   若本错误只是普通 Error，「拒供」在不同端点上会因措辞差异随机得到 500 或 503，
 *   且文案会被误报成「数据库服务异常」（并非事实）。继承 AppError 后，所有拒供路径
 *   统一得到 503 + `code=FABRICATED_DATA_REFUSED`，机器可读且措辞如实。
 */

import { AppError } from '../middleware/errorHandler';

export const FABRICATED_DATA_REFUSED_CODE = 'FABRICATED_DATA_REFUSED';

export class FabricatedDataRefusedError extends AppError {
  /** 与 API 层 dataSource 契约对齐：本错误对应「无数据」而非「真实数据」 */
  readonly dataSource = 'unavailable' as const;
  /** 触发拒绝的 InMemoryDatabase 方法名 */
  readonly method: string;
  /** 人类可读的拒绝原因 */
  readonly reason: string;

  constructor(
    method: string,
    reason = '生产环境处于内存库降级态，且内存库无真实行情/估值来源（伪造生成器已随 R0′-9 移除），拒绝以空态冒充行情',
  ) {
    super(
      503,
      FABRICATED_DATA_REFUSED_CODE,
      `行情数据不可用（dataSource=unavailable）：${reason} [method: ${method}]`,
      `方法 ${method} 在内存库降级态下无真实行情来源。真实股票清单仍可用；如需让行情类读取改回返回诚实空态（而非抛错，应急用）请设置 ALLOW_FABRICATED_MARKET_DATA=true`,
    );
    this.name = 'FabricatedDataRefusedError';
    this.method = method;
    this.reason = reason;
  }
}

/**
 * 是否启用「伪造行情拒供」。
 *
 * - 默认：仅 `NODE_ENV === 'production'` 时启用；本地开发 / 测试下行情类读取返回诚实空态。
 * - 逃生开关：`ALLOW_FABRICATED_MARKET_DATA='true'` 时关闭本拒供（生产应急用；会打出显式告警日志，
 *   避免这把开关被静默使用）。注意：R0′-9 之后该开关**不再放行任何伪造行情**——内存库已无伪造
 *   生成器，它只影响「行情类读取是返回诚实空态、还是抛本错误」。
 */
export function isFabricatedQuoteRefusalActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_FABRICATED_MARKET_DATA === 'true') return false;
  return env.NODE_ENV === 'production';
}
