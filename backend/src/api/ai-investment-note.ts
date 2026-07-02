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

const router = Router();

router.post('/ai/investment-note', asyncHandler(async (req: Request, res: Response) => {
  const { symbols = [] } = req.body;

  if (symbols.length === 0) {
    res.json({ success: true, data: { note: '请先添加自选股以生成投资笔记。' } });
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

  if (stocks.length === 0) {
    res.json({ success: true, data: { note: '暂无行情数据' } });
    return;
  }

  // 构建市场数据摘要
  const stockSummary = stocks.map((s: any) => {
    const change = Number(s.change_percent) || 0;
    const cap = Number(s.market_cap) || 0;
    return `${s.name}(${s.industry}) 价格${s.price} ${change >= 0 ? '+' : ''}${change.toFixed(2)}% 市值${(cap / 1e4).toFixed(0)}亿`;
  }).join('\n');

  const upCount = stocks.filter((s: any) => Number(s.change_percent) > 0).length;
  const downCount = stocks.filter((s: any) => Number(s.change_percent) < 0).length;

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

    res.json({
      success: true,
      data: {
        note: aiResponse?.content || '复盘笔记生成中...',
        summary: {
          total: stocks.length,
          up: upCount,
          down: downCount,
          avgChange: (stocks.reduce((sum: number, s: any) => sum + (Number(s.change_percent) || 0), 0) / stocks.length).toFixed(2),
        },
      },
    });
  } catch (e) {
    console.warn('[AIInvestmentNote] 生成投资笔记失败:', e);
    res.json({
      success: true,
      data: {
        note: `今日自选股共${stocks.length}只，${upCount}涨${downCount}跌。AI服务暂时不可用，请稍后重试生成笔记。`,
        summary: { total: stocks.length, up: upCount, down: downCount },
      },
    });
  }
}));

export default router;
