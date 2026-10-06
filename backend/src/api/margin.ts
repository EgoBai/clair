/**
 * 融资融券（两融）API —— **诚实不可用版**
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 结论（2026-10-06 本机实测复验）：**两融无任何可用的真实数据源。**
 * 这不是「待修的 bug」，也不是网络问题，而是上游报表已下线 + 无公开替代源。
 * 故本文件所有端点统一返回 `dataSource: 'unavailable'` + 准确中文原因，
 * 所有数值字段一律 **null**、所有列表一律 **[]**，绝不返回 0 顶替空态。
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 【复验证据 · 东方财富数据中心】8 个候选报表名全部返回 `code 9501 报表配置不存在`：
 *   RPT_MARGIN_TREND          → {"success":false,"code":9501,"message":"报表配置不存在,RPT_MARGIN_TREND"}
 *   RPT_MARGIN_DAILY_SUMMARY  → code 9501
 *   RPT_MARGIN_DETAIL         → code 9501
 *   RPT_MARGIN_DAILY          → code 9501
 *   RPT_RZRQ_LSHJ             → code 9501
 *   RPTA_WEB_RZRQ_LSHJ        → code 9501
 *   RPT_MUTUAL_MARGIN_RANK    → code 9501
 *   RPT_RZRQ_LSHJMX           → code 9501
 *   `code 9501` 与 `code 9701（服务器繁忙）` 不同：9701 是临时故障（重试可好），
 *   9501 是**报表配置在服务端已不存在**，重试无用 —— 即东财两融报表已下线。
 *   对比：同期 `RPT_MUTUAL_DEAL_HISTORY` 返回 `success:true`、1684 页真实数据，
 *   证明本机到东财的网络链路正常，9501 不是网络问题。
 *
 * 【其它源实测】
 *   - 腾讯财经 qt.gtimg.cn / web.ifzq.gtimg.cn：无融资融券接口（枚举无匹配）
 *   - 新浪 vip.stock.finance.sina.com.cn Rzrq.getRzrqInfo
 *       → {"__ERROR":3,"__ERRORMSG":"Service not valid"}（服务已下线）
 *
 * 【历史沿革】本文件原实现为 100% `Math.random` 伪数据（红线违规），已被整体移除；
 * 随后一版接了上述已下线报表并写有 `Number(r.X ?? 0)` 形式的**零值顶替**逻辑，
 * 本次一并清除 —— 见下方 `ZERO_FILL_REMOVED` 说明。
 *
 * 【本次修复要点 · ZERO_FILL_REMOVED】
 *   旧 `fetchMarginTrendReal` / `fetchMarginDetailReal` / `fetchMarginRankReal` 中：
 *     - `Number(r.RZYE ?? 0)` 等：上游字段缺失时被填成 **0**，而 0 是一个合法余额
 *       （真实「融资余额为 0」），填 0 会让空态**看起来像真实数据** —— 红线违规；
 *     - `financingBuyAmount` 与 `financingRepayAmount` 同取 `RZMAE`、
 *       `securitiesSellAmount` 与 `securitiesRepayAmount` 同取 `RQMCL`
 *       —— 同一字段被同时当作两个不同口径，属**口径造假**；
 *     - `fetchMarginOverviewReal` 中 `if (!fin && !sec) return null` 会把
 *       「真实为 0」与「上游无数据」混为一谈。
 *   现改为：**不再保留任何不可达报表的取数代码**，端点只做诚实降级。
 *   （保留不可达代码只会留下 0 值顶替的复发隐患，且会被后续维护者误以为「已接通」。）
 *
 * 【恢复条件】若东财恢复两融报表（探测命令见下方 PROBE_HINT），届时的正确做法是
 * 新建取数函数并使用 `numOrNull()`（缺失→null），**禁止** `?? 0`。
 */

import { Request, Response, Router } from 'express';
import { validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

/**
 * 不可用原因（用户与后续维护者一眼可辨，非「待修 bug」）。
 * 措辞刻意包含「已下线 / 无公开接口 / 非网络问题」三要素，避免被误派单。
 */
const UNAVAILABLE_MESSAGE =
  '融资融券（两融）数据当前不可用，且**不是待修的 bug**：东方财富数据中心的全部两融报表接口' +
  '（RPT_MARGIN_TREND / RPT_MARGIN_DAILY_SUMMARY / RPT_MARGIN_DETAIL / RPT_RZRQ_LSHJ /' +
  ' RPTA_WEB_RZRQ_LSHJ 等 8 个）均返回 code 9501「报表配置不存在」，即上游报表已下线；' +
  '腾讯财经无融资融券接口，新浪 Rzrq.getRzrqInfo 返回 __ERROR「Service not valid」亦已下线。' +
  '已排除网络原因：同期东方财富北向报表 RPT_MUTUAL_DEAL_HISTORY 在本机可正常返回 1684 页真实数据。' +
  '因此本端点按诚实数据契约返回 null / 空数组，不提供任何估算、兜底或替代口径数据。';

/** 数据源清单，供前端/文档展示「已排除哪些源」 */
const UNAVAILABLE_SOURCES = {
  eastmoney: {
    status: '已下线',
    detail: '8 个两融报表名全部返回 code 9501「报表配置不存在」（服务端报表配置已删除，重试无效）',
    probedReports: [
      'RPT_MARGIN_TREND',
      'RPT_MARGIN_DAILY_SUMMARY',
      'RPT_MARGIN_DETAIL',
      'RPT_MARGIN_DAILY',
      'RPT_RZRQ_LSHJ',
      'RPTA_WEB_RZRQ_LSHJ',
      'RPT_MUTUAL_MARGIN_RANK',
      'RPT_RZRQ_LSHJMX',
    ],
  },
  tencent: { status: '无接口', detail: '腾讯财经 qt.gtimg.cn / web.ifzq.gtimg.cn 未提供融资融券接口' },
  sina: { status: '已下线', detail: 'Rzrq.getRzrqInfo 返回 {"__ERROR":3,"__ERRORMSG":"Service not valid"}' },
  network: {
    status: '正常（已排除）',
    detail: '同期 RPT_MUTUAL_DEAL_HISTORY 在本机返回 success:true / 1684 页，证明链路可用，9501 非网络问题',
  },
} as const;

/** 恢复接入时的探测提示（留档，避免后人重复摸索） */
const PROBE_HINT =
  '恢复条件：先探测 https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=<两融报表名>&columns=ALL&source=WEB&client=WEB，' +
  '若 code 仍为 9501 即上游仍未恢复；恢复后新增取数函数时缺失字段一律用 numOrNull() 转 null，禁止 `?? 0`。';

// ────────────────────────────────────────────────────────────────────────────
// 统一诚实降级响应
//
// 所有端点数值字段一律 null、列表一律 []，绝无 0 值顶替、绝无 Math.random。
// ────────────────────────────────────────────────────────────────────────────

/** /api/margin/overview —— 全市场融资融券概览 */
router.get(
  '/margin/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, {
      // 全部 null（非 0）：0 是合法真实余额，填 0 会让空态看起来像真实数据
      totalFinancingBalance: null,
      totalSecuritiesBalance: null,
      totalMarginBalance: null,
      financingStockCount: null,
      securitiesStockCount: null,
      topFinancingIncrease: [],
      topSecuritiesIncrease: [],
      dataSource: 'unavailable',
      unavailableReason: 'no-public-source',
      message: UNAVAILABLE_MESSAGE,
      sources: UNAVAILABLE_SOURCES,
      probeHint: PROBE_HINT,
    });
  }),
);

/** /api/margin/trend —— 全市场融资融券余额趋势 */
router.get(
  '/margin/trend',
  asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, {
      records: [],
      dataSource: 'unavailable',
      unavailableReason: 'no-public-source',
      message: UNAVAILABLE_MESSAGE,
      sources: UNAVAILABLE_SOURCES,
      probeHint: PROBE_HINT,
    });
  }),
);

/** /api/margin/rank/:type —— 融资融券排行 */
router.get(
  '/margin/rank/:type',
  validateParams(schemas.marginRank),
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.params.type === 'securities' ? 'securities' : 'financing';
    sendSuccess(res, {
      type,
      rank: [],
      dataSource: 'unavailable',
      unavailableReason: 'no-public-source',
      message: UNAVAILABLE_MESSAGE,
      sources: UNAVAILABLE_SOURCES,
      probeHint: PROBE_HINT,
    });
  }),
);

/**
 * /api/margin/:symbol —— 个股融资融券明细
 *
 * 注意：本路由为通配，必须注册在 /margin/overview 与 /margin/trend 之后
 * （Express 按注册顺序匹配），否则会吞掉那两个具体路径。
 */
router.get(
  '/margin/:symbol',
  validateParams(schemas.marginSymbol),
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = String(req.params.symbol);
    sendSuccess(res, {
      symbol,
      name: null,
      records: [],
      dataSource: 'unavailable',
      unavailableReason: 'no-public-source',
      message: UNAVAILABLE_MESSAGE,
      sources: UNAVAILABLE_SOURCES,
      probeHint: PROBE_HINT,
    });
  }),
);

export default router;