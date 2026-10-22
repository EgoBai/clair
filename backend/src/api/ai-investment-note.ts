/**
 * AI 投资笔记 API
 * 
 * 基于自选股组合自动生成复盘分析笔记
 * 利用实时行情数据 + AI分析
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import aiService from '../services/aiService';

import { aiTiming } from '../middleware/aiTiming';

const router = Router();

// F12/A-07: AI 接口耗时日志（端点/状态/耗时/首字节）
router.use(aiTiming);

/**
 * 诚实数据契约发送器：顶层 dataSource 与 data 内同源。
 * note 正文由 LLM 基于**真实行情库**的自选股数据生成，故正常路径为 real。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

router.post('/ai/investment-note', asyncHandler(async (req: Request, res: Response) => {
  const { symbols = [] } = req.body;

  // 诚实空态：无自选股 → 无真实数据可复盘，不用固定文案冒充「已生成笔记」
  if (symbols.length === 0) {
    sendHonest(res, 'unavailable', {
      note: '请先添加自选股以生成投资笔记。',
      message: '未提供任何自选股代码，本地真实行情库无标的可供复盘',
    });
    return;
  }

  const db = getDb();

  // 获取自选股实时行情
  const stocks = await (db.connection as any)('stocks as s')
    .leftJoin('daily_quotes as dq', function(this: any) {
      this.on('s.id', '=', 'dq.stock_id')
        .andOn('dq.trade_date', '=', db.connection.raw(
          '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
        ));
    })
    .whereIn('s.symbol', symbols)
    .where('s.is_active', true)
    .select(
      's.name', 's.symbol', 's.industry',
      'dq.close_price as price',
      'dq.change_percent',
      'dq.turnover_rate',
      'dq.market_cap'
    );

  // 诚实空态：真实行情库查不到这些自选股 → unavailable，不用固定文案冒充
  if (stocks.length === 0) {
    sendHonest(res, 'unavailable', {
      note: '暂无行情数据',
      message: '本地真实行情库无这些自选股的行情记录，未生成任何复盘笔记',
    });
    return;
  }

  // 有真实行情行，但其中无一行带涨跌幅 → 无法做任何统计（零值顶替即造假）
  const withQuote = stocks.filter((s: any) => s.change_percent != null);
  if (withQuote.length === 0) {
    sendHonest(res, 'unavailable', {
      note: '暂无行情数据',
      message: '自选股在真实行情库中无当日行情（change_percent 全为 null），未生成任何复盘统计',
    });
    return;
  }

  // 构建市场数据摘要
  const stockSummary = stocks.map((s: any) => {
    const change = Number(s.change_percent) || 0;
    const cap = Number(s.market_cap) || 0;
    return `${s.name}(${s.industry}) 价格${s.price} ${change >= 0 ? '+' : ''}${change.toFixed(2)}% 市值${(cap / 1e4).toFixed(0)}亿`;
  }).join('\n');

  const upCount = withQuote.filter((s: any) => Number(s.change_percent) > 0).length;
  const downCount = withQuote.filter((s: any) => Number(s.change_percent) < 0).length;

  const prompt = `你是澄观AI投资研究助手。请基于以下自选股实时数据，生成一份简洁的复盘笔记。

【自选股组合】
${stockSummary}

【市场概况】
共${stocks.length}只股票，今日${upCount}涨${downCount}跌

请按以下格式生成复盘笔记（200字以内）：
1. 📊 整体表现
2. 📈 亮点标的
3. ⚠️ 风险提示
4. 💡 明日关注`;

  try {
    const aiResponse = await aiService.chat({
      messages: [
        { role: 'system', content: '你是澄观AI复盘助手。请基于真实数据生成专业、简洁的投资复盘笔记。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 400,
    });

    sendHonest(res, 'real', {
      note: aiResponse?.content || '复盘笔记生成中...',
      summary: {
        total: stocks.length,
        up: upCount,
        down: downCount,
        avgChange: (withQuote.reduce((sum: number, s: any) => sum + (Number(s.change_percent) || 0), 0) / withQuote.length).toFixed(2),
      },
    });
  } catch (e) {
    console.warn('[AIInvestmentNote] 生成投资笔记失败:', e);
    // 诚实降级：行情统计仍是真实值，但 AI 正文未生成 → 如实说明而非静默兜底
    sendHonest(res, 'unavailable', {
      note: `今日自选股共${stocks.length}只，${upCount}涨${downCount}跌。AI服务暂时不可用，请稍后重试生成笔记。`,
      summary: { total: stocks.length, up: upCount, down: downCount },
      message: '行情统计来自真实行情库，但 LLM 不可用，AI 复盘正文未生成',
    });
  }
}));

export default router;
