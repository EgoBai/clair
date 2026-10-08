/**
 * AI 行情诊脉 / 策略洞察（原生高浓度 AI 能力）
 *
 * 设计原则（守诚实数据红线 + 高浓度原生 AI）：
 *   1. 诊断的「骨架」由真实信号实时计算：市场广度(breadth)、行业景气度(sector momentum)、
 *      宏观概览(macro)。这些信号在沙箱内均为 real 源，无需 LLM 即可给出结构化结论。
 *   2. LLM 只负责把结构化结论「转述成有温度的投研观点」，属于锦上添花——
 *      当 DeepSeek 不可用（余额不足/超时）时，自动降级为规则引擎结论，绝不 500、绝不伪造。
 *   3. 候选标的来自真实数据库（按当前主线行业 pull 实时涨跌幅前排个股），可点击下钻。
 *
 * 验收：/api/ai/market-pulse → { success, data: { temperature, themes, risks, candidates, narrative, llmUsed, dataSource }, timestamp }
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import aiService from '../services/aiService';
import { createLogger } from '../utils/logger';
import { aiTiming } from '../middleware/aiTiming';

const log = createLogger('AIMarketPulse');
const router = Router();
router.use(aiTiming);

interface ThemeHit {
  industry: string;
  score: number;
  avgChangePercent: number;
  limitUpCount: number;
  turnover: number;
  leaderSymbols: { symbol: string; name: string; changePercent: number }[];
}

interface RiskSignal {
  level: 'high' | 'medium' | 'low';
  label: string;
  detail: string;
}

interface Candidate {
  symbol: string;
  name: string;
  industry: string;
  changePercent: number;
  turnoverRate: number;
  peRatio: number | null;
}

/**
 * 「上涨占比」是否**可计算**——本单最核心的红线判据（P0-PULSE）。
 *
 * 两种「上涨占比为 0」必须严格区分：
 *   1. **真的是 0%**  → rising=0 且 falling>0（今天全市场只有跌的）→ 可计算，是**真实结论**
 *   2. **0/0 不可计算** → rising=0 且 falling=0（当日全部平盘/ 无涨跌样本）
 *      或广度数据整体缺失（getMarketSummary 返回 null）→ 不可计算
 *
 * 第2 种若被当成第 1 种（旧代码 `rising + falling || 1` 就是这么干的），
 * 会凭空生成「普跌/恐慌：上涨个股占比仅 0.0%」——把「查不到」谎报成「市场极弱」。
 */
function risingRatioAvailable(hasMarketData: boolean, denominator: number): boolean {
  return hasMarketData && denominator > 0;
}

/**
 * 市场温度：由广度 + 主线行业强度综合打分。
 *
 * 两个入参任一不可得 → score 为 null（不可用），**绝不**用 0顶替。
 * 原因：0 分在下面恰好对应 label「弱势」，是个**真实但完全错误**的市场结论；
 * 前端 P0-TEMPGAUGE 已把 null 渲染为中性灰「不可用」，不会误读。
 *
 * risingRatio 为 null 表示「上涨占比**不可计算**」——最典型的是 0/0：
 * rising 与 falling 都是 0（当日全部平盘）。此时若把 0/0 当成 0，
 * 会凭空造出「普跌/恐慌：上涨个股占比仅 0.0%」（详见 buildRisks）。
 * 「查不到」与「真的是 0%」语义完全不同，绝不可互换。
 */
function computeTemperature(
  risingRatio: number | null,
  topThemeScore: number | null,
): { score: number | null; label: string } {
  if (risingRatio === null || topThemeScore === null) {
    return { score: null, label: '未知' };
  }
  const score = Math.round(risingRatio * 60 + Math.min(topThemeScore, 100) * 0.4);
  let label = '中性';
  if (score >= 75) label = '强势';
  else if (score >= 60) label = '偏暖';
  else if (score >= 45) label = '中性';
  else if (score >= 30) label = '偏冷';
  else label = '弱势';
  return { score: Math.max(0, Math.min(100, score)), label };
}

/**
 * 风险信号：**只从真实拿到的数据推导**。
 *
 * P0-PULSE 缺陷③：旧实现无条件执行 `if (risingRatio < 0.4)`，而 risingRatio 在
 * `getMarketSummary()` 返回 null（Database.ts:483 `if (dailyQuotes.length === 0)
 * return null`）时被 `?? 0` 吞成 0，0 < 0.4 成立 → 凭空生成
 * 「普跌/恐慌：上涨个股占比仅 0.0%」。空库不是「市场极弱」，它是**查不到**。
 *
 * 因此每个信号都各自带可用性前置条件：
 *   - 广度类信号（普跌/分化）→ 仅当 risingRatio !== null，即真的算出了占比
 *   - 板块类信号（弱势板块拖累）→ 仅当真有板块数据且该板块均跌幅 <= -2%
 *   - 「结构平稳」这个**否定性结论**同样需要数据支撑：没有数据时
 *     「未见显著风险信号」是另一种谎报（它断言了「确实查过了且没查到」）
 */
function buildRisks(
  risingRatio: number | null,
  sortedSectors: Array<{ industry: string; avg_change_percent: number }>,
): RiskSignal[] {
  const risks: RiskSignal[] = [];

  // 广度类信号：只在上涨占比**真的算出来**时才判断
  if (risingRatio !== null) {
    if (risingRatio < 0.4) {
      risks.push({ level: 'high', label: '普跌/恐慌', detail: `上涨个股占比仅 ${(risingRatio * 100).toFixed(1)}%，市场情绪偏弱` });
    } else if (risingRatio < 0.5) {
      risks.push({ level: 'medium', label: '分化加剧', detail: `上涨占比 ${(risingRatio * 100).toFixed(1)}%，涨跌接近均衡` });
    }
  }

  // 板块类信号：只在真有板块数据时判断
  const weakest = sortedSectors[sortedSectors.length - 1];
  if (weakest && Number(weakest.avg_change_percent) <= -2) {
    risks.push({ level: 'medium', label: '弱势板块拖累', detail: `${weakest.industry} 平均跌幅 ${Number(weakest.avg_change_percent).toFixed(2)}%` });
  }

  if (risks.length === 0) {
    // 「未见显著风险」是一个**需要证据支撑的否定结论**。
    // 广度与板块都拿不到时，不能宣称「确实没有风险」——那是在编造一个市场判断。
    if (risingRatio === null && sortedSectors.length === 0) {
      risks.push({ level: 'low', label: '数据暂不可用', detail: '市场广度与板块数据均不可得，未生成风险判定' });
    } else {
      risks.push({ level: 'low', label: '结构平稳', detail: '当前未见显著系统性风险信号' });
    }
  }
  return risks;
}

function buildRuleNarrative(
  // score 可为 null：数据不可得时诚实返回 null 而非 0（见 computeTemperature 注释）。
  // 类型必须跟随运行时，否则调用方会被 TS 骗到以为它一定是 number。
  temperature: { score: number | null; label: string },
  themes: ThemeHit[],
  risks: RiskSignal[],
  // 板块数据是否真的拿到。false 时不能写「暂无清晰主线」——
  // 那是在把「查不到」说成「没有主线」。
  hasSectorData: boolean,
): string {
  const themeLine = themes.length
    ? themes.slice(0, 3).map((t) => `${t.industry}(${t.avgChangePercent >= 0 ? '+' : ''}${t.avgChangePercent.toFixed(2)}%)`).join('、')
    : (hasSectorData ? '暂无清晰主线' : '板块数据不可用');
  const riskLine = risks.length
    ? risks.map((r) => r.label).join('、')
    : '未见显著风险信号';
  // score 为 null 时不渲染 "/100"，否则会输出「(null/100)」这种既不像数据也不像文案的串
  const scoreText = temperature.score === null ? '' : `(${temperature.score}/100)`;
  return [
    `当前市场温度「${temperature.label}」${scoreText}。`,
    `资金主线集中在：${themeLine}。`,
    `需关注的风险：${riskLine}。`,
    `（规则引擎结论 · LLM 观点生成暂不可用）`,
  ].join('');
}

/** 从真实数据库按行业拉取实时涨跌幅前排个股作为候选（仅取最新交易日行情） */
async function fetchCandidatesByIndustry(industry: string, limit = 3): Promise<ThemeHit['leaderSymbols']> {
  try {
    const db = getDb();
    const latest = db.connection.raw('(SELECT stock_id, MAX(trade_date) AS d FROM daily_quotes GROUP BY stock_id) AS lq');
    const rows = await (db.connection('stocks as s') as any)
      .join('daily_quotes as dq', 'dq.stock_id', 's.id')
      .join(latest, function (this: any) {
        this.on('dq.stock_id', '=', 'lq.stock_id').andOn('dq.trade_date', '=', 'lq.d');
      })
      .where('s.industry', industry)
      .whereNotNull('dq.change_percent')
      .select('s.symbol', 's.name', 'dq.change_percent')
      .orderBy('dq.change_percent', 'desc')
      .limit(limit);
    const seen = new Set<string>();
    const out: ThemeHit['leaderSymbols'] = [];
    for (const r of rows || []) {
      if (seen.has(r.symbol)) continue;
      seen.add(r.symbol);
      out.push({ symbol: r.symbol, name: r.name, changePercent: Number(r.change_percent) });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchCandidateCards(symbols: string[]): Promise<Candidate[]> {
  if (!symbols.length) return [];
  try {
    const db = getDb();
    const latest = db.connection.raw('(SELECT stock_id, MAX(trade_date) AS d FROM daily_quotes GROUP BY stock_id) AS lq');
    const rows = await (db.connection('stocks as s') as any)
      .join('daily_quotes as dq', 'dq.stock_id', 's.id')
      .join(latest, function (this: any) {
        this.on('dq.stock_id', '=', 'lq.stock_id').andOn('dq.trade_date', '=', 'lq.d');
      })
      .whereIn('s.symbol', symbols)
      .select('s.symbol', 's.name', 's.industry', 'dq.change_percent', 'dq.turnover_rate', 'dq.pe_ratio');
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const r of rows || []) {
      if (seen.has(r.symbol)) continue;
      seen.add(r.symbol);
      out.push({
        symbol: r.symbol,
        name: r.name,
        industry: r.industry,
        changePercent: Number(r.change_percent ?? 0),
        turnoverRate: Number(r.turnover_rate ?? 0),
        peRatio: r.pe_ratio == null ? null : Number(r.pe_ratio),
      });
    }
    return out;
  } catch {
    return [];
  }
}

router.get('/market-pulse', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // 1) 真实信号源
    //    getMarketSummary() 在当日无行情时返回 **null**（Database.ts:483
    //    `if (dailyQuotes.length === 0) return null`；InMemoryDatabase
    //    getMarketSummaryInternal 同契约）。P0-PULSE 缺陷①：旧代码写
    //    `summary.risingStocks`（裸访问）→ null 时抛 TypeError，只能靠 catch
    //    兜底成 unavailable，等于每次请求白跑一趟 + log.error 刷屏，
    //    且走的是降级分支而非正常路径。
    const [summaryRaw, sectorRowsRaw] = await Promise.all([
      db.getMarketSummary(new Date()),
      db.getSectorMomentumScore(),
    ]);
    const summary: any = summaryRaw;
    const sectorRows: any[] = Array.isArray(sectorRowsRaw) ? sectorRowsRaw : [];

    // ---- 先判可用，再取值；「查不到」一律 null，绝不 ?? 0 ----
    // breadthSum 与 totalStocks 两个判据任一为正即认为广度**真的**拿到了
    // （与 ai-chat.ts buildRuleInsight 的 hasMarketData 口径一致）。
    const breadthSum = summary
      ? Number(summary.risingStocks) + Number(summary.fallingStocks) + Number(summary.unchangedStocks)
      : 0;
    const hasMarketData = !!summary && (Number(summary.totalStocks) > 0 || breadthSum > 0);
    const hasSectorData = sectorRows.length > 0;

    const rising = hasMarketData ? Number(summary.risingStocks) || 0 : null;
    const falling = hasMarketData ? Number(summary.fallingStocks) || 0 : null;
    const limitUp = hasMarketData ? Number(summary.limitUpCount) || 0 : null;

    // 上涨占比。**分母为 0 时是 0/0 = 不可计算**，不是「真的是 0%」。
    // 旧代码 `rising + falling || 1` 把它强行变成 0，直接导致缺陷③的假「普跌」。
    const breadthDenominator = rising !== null && falling !== null ? rising + falling : 0;
    const risingRatio: number | null =
      risingRatioAvailable(hasMarketData, breadthDenominator)
        ? (rising as number) / breadthDenominator
        : null;

    // 2) 主线行业（取景气度前 3）
    const sorted = [...sectorRows].sort((a, b) => Number(b.score) - Number(a.score));
    const topThemes = sorted.slice(0, 3);
    const themes: ThemeHit[] = await Promise.all(
      topThemes.map(async (t) => ({
        industry: t.industry,
        score: Number(t.score),
        avgChangePercent: Number(t.avg_change_percent ?? 0),
        limitUpCount: Number(t.limit_up_count ?? 0),
        turnover: Number(t.total_turnover ?? 0),
        leaderSymbols: await fetchCandidatesByIndustry(t.industry, 3),
      })),
    );

    const temperature = computeTemperature(risingRatio, hasSectorData ? Number(topThemes[0].score) : null);

    // 3) 风险信号（只在真实数据支撑下才生成，见 buildRisks注释）
    const risks = buildRisks(risingRatio, sorted);

    // 4) 候选标的（主线行业领涨股，去重）
    const leaderSymbols = Array.from(new Set(themes.flatMap((t) => t.leaderSymbols.map((l) => l.symbol))));
    const candidates = await fetchCandidateCards(leaderSymbols.slice(0, 8));

    // 5) LLM 撰写观点（可用时）；不可用则规则结论
    let narrative = buildRuleNarrative(temperature, themes, risks, hasSectorData);
    let llmUsed = false;
    // 诚实红线（P0-PULSE 缺陷④）：广度不可得时**不调用 LLM**。
    // 否则等于把编造的「上涨/下跌 0/0（占比 0.0%）」喂给 LLM，
    // 让它照着编出一篇市场解读，再由 dataSource:'real' 背书交给用户。
    if (hasMarketData) {
      try {
        const themeSummary = themes.length
          ? themes.map((t) =>
              `${t.industry} 景气度${t.score}，平均涨跌${t.avgChangePercent.toFixed(2)}%，涨停${t.limitUpCount}只`,
            ).join('；')
          : '板块数据不可用';
        const riskSummary = risks.map((r) => `${r.label}：${r.detail}`).join('；');
        const ai = await aiService.chat({
          messages: [{
            role: 'user' as const,
            content: `基于以下实时市场信号，用 3-4 句中文给出今日 A 股「诊脉」观点，先结论后依据，专业克制，结尾必须带 ⚠️ 风险提示。不要荐股、不预测点位。

市场温度：${temperature.label}${temperature.score === null ? '' : `(${temperature.score}/100)`}
上涨/下跌家数：${rising}/${falling}（占比 ${risingRatio === null ? '不可用' : `${(risingRatio * 100).toFixed(1)}%`}）
涨停：${limitUp === null ? '不可用' : `${limitUp} 只`}
主线行业：${themeSummary}
风险信号：${riskSummary}`,
          }],
          temperature: 0.5,
          maxTokens: 400,
        });
        if (ai?.content) { narrative = ai.content; llmUsed = true; }
      } catch (e) {
        log.warn('LLM 观点生成不可用，降级为规则结论:', { error: (e as Error).message });
      }
    }

    // dataSource 由**实际可用性**推导，禁止硬编码 'real'（P0-PULSE 缺陷②）
    const dataSource = hasMarketData ? 'real' : 'unavailable';

    sendSuccess(res, {
      data: {
        temperature,
        // breadth 三字段均为业务量：不可得时是 null（=查不到），不是 0
        breadth: risingRatio === null
          ? null
          : { rising, falling, risingRatio: Number((risingRatio * 100).toFixed(1)) },
        limitUp,
        themes,
        risks,
        candidates,
        narrative,
        llmUsed,
        dataSource,
        // 分块可用性：让前端/下游能区分「广度缺失」与「板块缺失」，
        // 而不是只看到一个笼统的 unavailable
        availability: { breadth: hasMarketData && risingRatio !== null, sectors: hasSectorData },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    log.error('market-pulse 计算失败:', e as Error);
    res.status(200).json({
      success: true,
      data: {
        // 诚实红线（P0-HONESTY2）：score 是 0-100 的**业务量**（市场温度评分），
        // 0 会被下游/前端当成「市场极度弱势」这个真实结论（computeTemperature
        // 里 0 分对应 label '弱势'）。计算失败时必须为 null，
        // 由前端显示「不可用」，绝不用 0 冒充一个真实评分。
        temperature: { score: null, label: '未知' },
        // breadth / limitUp 同样是业务量（上涨家数 / 涨停家数）。旧实现在降级分支
        // **整个省略**这两个字段，前端 `pulse.breadth?.rising` 拿到 undefined，
        // React 渲染成空串→ 显示「上涨/下跌（占比%）」「涨停只」，
        // 用户看到的是残缺文案而非明确的「不可用」。
        // 显式声明为 null（而非省略）：既让契约形状完整、前端能区分
        // 「不可用」与「字段不存在」，也避免将来有人误用 ?? 0 再造一个假 0。
        breadth: null,
        limitUp: null,
        themes: [],
        risks: [{ level: 'low', label: '数据暂不可用', detail: '市场信号计算失败' }],
        candidates: [],
        narrative: '市场信号暂不可用，请稍后重试。',
        llmUsed: false,
        dataSource: 'unavailable',
        availability: { breadth: false, sectors: false },
      },
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;
