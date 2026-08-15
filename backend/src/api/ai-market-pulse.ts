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

/** 市场温度：由广度 + 主线行业强度综合打分 */
function computeTemperature(risingRatio: number, topThemeScore: number, limitUp: number): {
  score: number;
  label: string;
} {
  const score = Math.round(risingRatio * 60 + Math.min(topThemeScore, 100) * 0.4);
  let label = '中性';
  if (score >= 75) label = '强势';
  else if (score >= 60) label = '偏暖';
  else if (score >= 45) label = '中性';
  else if (score >= 30) label = '偏冷';
  else label = '弱势';
  return { score: Math.max(0, Math.min(100, score)), label };
}

function buildRuleNarrative(
  temperature: { score: number; label: string },
  themes: ThemeHit[],
  risks: RiskSignal[],
): string {
  const themeLine = themes.length
    ? themes.slice(0, 3).map((t) => `${t.industry}(${t.avgChangePercent >= 0 ? '+' : ''}${t.avgChangePercent.toFixed(2)}%)`).join('、')
    : '暂无清晰主线';
  const riskLine = risks.length
    ? risks.map((r) => r.label).join('、')
    : '未见显著风险信号';
  return [
    `当前市场温度「${temperature.label}」(${temperature.score}/100)。`,
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
    const [summary, sectorRows] = await Promise.all([
      db.getMarketSummary(new Date()),
      db.getSectorMomentumScore(),
    ]);

    const rising = Number(summary.risingStocks ?? 0);
    const falling = Number(summary.fallingStocks ?? 0);
    const total = rising + falling || 1;
    const risingRatio = rising / total;
    const limitUp = Number(summary.limitUpCount ?? 0);

    // 2) 主线行业（取景气度前 3）
    const sorted = [...(sectorRows || [])].sort((a, b) => Number(b.score) - Number(a.score));
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

    const temperature = computeTemperature(risingRatio, topThemes[0]?.score ?? 0, limitUp);

    // 3) 风险信号（由真实数据判定）
    const risks: RiskSignal[] = [];
    if (risingRatio < 0.4) {
      risks.push({ level: 'high', label: '普跌/恐慌', detail: `上涨个股占比仅 ${(risingRatio * 100).toFixed(1)}%，市场情绪偏弱` });
    } else if (risingRatio < 0.5) {
      risks.push({ level: 'medium', label: '分化加剧', detail: `上涨占比 ${(risingRatio * 100).toFixed(1)}%，涨跌接近均衡` });
    }
    const weakest = sorted[sorted.length - 1];
    if (weakest && Number(weakest.avg_change_percent) <= -2) {
      risks.push({ level: 'medium', label: '弱势板块拖累', detail: `${weakest.industry} 平均跌幅 ${weakest.avg_change_percent.toFixed(2)}%` });
    }
    if (risks.length === 0) {
      risks.push({ level: 'low', label: '结构平稳', detail: '当前未见显著系统性风险信号' });
    }

    // 4) 候选标的（主线行业领涨股，去重）
    const leaderSymbols = Array.from(new Set(themes.flatMap((t) => t.leaderSymbols.map((l) => l.symbol))));
    const candidates = await fetchCandidateCards(leaderSymbols.slice(0, 8));

    // 5) LLM 撰写观点（可用时）；不可用则规则结论
    let narrative = buildRuleNarrative(temperature, themes, risks);
    let llmUsed = false;
    try {
      const themeSummary = themes.map((t) =>
        `${t.industry} 景气度${t.score}，平均涨跌${t.avgChangePercent.toFixed(2)}%，涨停${t.limitUpCount}只`,
      ).join('；');
      const riskSummary = risks.map((r) => `${r.label}：${r.detail}`).join('；');
      const ai = await aiService.chat({
        messages: [{
          role: 'user' as const,
          content: `基于以下实时市场信号，用 3-4 句中文给出今日 A 股「诊脉」观点，先结论后依据，专业克制，结尾必须带 ⚠️ 风险提示。不要荐股、不预测点位。

市场温度：${temperature.label}(${temperature.score}/100)
上涨/下跌家数：${rising}/${falling}（占比 ${(risingRatio * 100).toFixed(1)}%）
涨停：${limitUp} 只
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

    sendSuccess(res, {
      data: {
        temperature,
        breadth: { rising, falling, risingRatio: Number((risingRatio * 100).toFixed(1)) },
        limitUp,
        themes,
        risks,
        candidates,
        narrative,
        llmUsed,
        dataSource: 'real',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    log.error('market-pulse 计算失败:', e as Error);
    res.status(200).json({
      success: true,
      data: {
        temperature: { score: 0, label: '未知' },
        themes: [],
        risks: [{ level: 'low', label: '数据暂不可用', detail: '市场信号计算失败' }],
        candidates: [],
        narrative: '市场信号暂不可用，请稍后重试。',
        llmUsed: false,
        dataSource: 'unavailable',
      },
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;
