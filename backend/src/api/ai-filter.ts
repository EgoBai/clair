/**
 * 对话式筛选 API
 * 自然语言 → 筛选条件 → 股票结果
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import aiService from '../services/aiService';

const router = Router();

interface FilterCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'in';
  value: number | number[] | string[];
}

interface ParsedFilter {
  conditions: FilterCondition[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  explanation: string;
}

/**
 * POST /api/ai/filter
 * 自然语言筛选
 */
router.post('/ai/filter', asyncHandler(async (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ success: false, error: '请提供筛选条件描述' });
    return;
  }

  try {
    // 用AI解析自然语言为筛选条件
    const industries = ['交通运输','传媒','公用事业','农林牧渔','化工','医药生物','商贸零售','国防军工','基础化工','家用电器','建筑材料','建筑装饰','房地产','有色金属','机械设备','汽车','煤炭','环保','电力设备','电子','石油石化','社会服务','纺织服饰','综合','美容护理','计算机','轻工制造','通信','钢铁','银行','非银金融','食品饮料'];

    const prompt = `你是A股筛选助手。用户想筛选股票，请将用户的自然语言描述转换为JSON格式的筛选条件。

用户描述: "${query}"

可用的筛选字段:
- pe: 市盈率
- pb: 市净率
- changePercent: 涨跌幅(%)
- turnoverRate: 换手率(%)
- marketCap: 市值(万元)
- volume: 成交量
- industry: 行业(必须是以下之一: ${industries.join('、')})
- price: 股价

可用的操作符:
- gt: 大于
- gte: 大于等于
- lt: 小于
- lte: 小于等于
- eq: 等于
- between: 区间 [min, max]
- in: 包含在列表中

注意:
1. 如果用户提到"科技"，对应"计算机"或"电子"
2. 如果用户提到"金融"，对应"银行"或"非银金融"
3. 如果用户提到"消费"，对应"食品饮料"或"商贸零售"
4. 如果用户提到"制造"，对应"机械设备"或"汽车"
5. 如果用户提到"医药"，对应"医药生物"
6. 如果用户提到"能源"，对应"电力设备"或"煤炭"或"石油石化"

请返回JSON格式:
{
  "conditions": [
    {"field": "changePercent", "operator": "gt", "value": 3},
    {"field": "industry", "operator": "in", "value": ["计算机", "电子"]}
  ],
  "sortBy": "changePercent",
  "sortOrder": "desc",
  "limit": 50,
  "explanation": "筛选涨跌幅大于3%的科技行业股票"
}

只返回JSON，不要其他内容。`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 500,
    });

    // 解析AI返回的JSON
    let parsed: ParsedFilter;
    try {
      // 提取JSON部分
      const content = aiResponse?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI返回格式错误: ' + content.substring(0, 100));
      }
      // 清理JSON字符串
      let jsonStr = jsonMatch[0]
        .replace(/,\s*}/g, '}')  // 移除尾逗号
        .replace(/,\s*]/g, ']'); // 移除数组尾逗号
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      res.status(500).json({
        success: false,
        error: 'AI解析失败，请换个说法试试',
        details: (e as Error).message,
      });
      return;
    }

    // 构建数据库查询
    const dbInstance = getDb();
    const knex = dbInstance.connection;
    let queryBuilder = knex('stocks as s')
      .leftJoin('daily_quotes as dq', function(this: any) {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', knex.raw(
            '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
          ));
      })
      .where('s.is_active', true)
      .select(
        's.symbol',
        's.name',
        's.industry',
        'dq.close_price as price',
        'dq.change_percent as changePercent',
        'dq.turnover_rate as turnoverRate',
        'dq.volume',
        'dq.market_cap as marketCap'
      );

    // 应用筛选条件
    for (const cond of parsed.conditions || []) {
      const field = cond.field === 'industry' ? 's.industry' :
                    cond.field === 'price' ? 'dq.close_price' :
                    cond.field === 'changePercent' ? 'dq.change_percent' :
                    cond.field === 'turnoverRate' ? 'dq.turnover_rate' :
                    cond.field === 'marketCap' ? 'dq.market_cap' :
                    cond.field === 'volume' ? 'dq.volume' :
                    `dq.${cond.field}`;

      switch (cond.operator) {
        case 'gt':
          queryBuilder = queryBuilder.where(field, '>', cond.value);
          break;
        case 'gte':
          queryBuilder = queryBuilder.where(field, '>=', cond.value);
          break;
        case 'lt':
          queryBuilder = queryBuilder.where(field, '<', cond.value);
          break;
        case 'lte':
          queryBuilder = queryBuilder.where(field, '<=', cond.value);
          break;
        case 'eq':
          queryBuilder = queryBuilder.where(field, cond.value);
          break;
        case 'between':
          if (Array.isArray(cond.value) && cond.value.length === 2) {
            queryBuilder = queryBuilder.whereBetween(field, cond.value as [number, number]);
          }
          break;
        case 'in':
          if (Array.isArray(cond.value)) {
            queryBuilder = queryBuilder.whereIn(field, cond.value as string[]);
          }
          break;
      }
    }

    // 排序
    const sortField = parsed.sortBy === 'changePercent' ? 'dq.change_percent' :
                      parsed.sortBy === 'turnoverRate' ? 'dq.turnover_rate' :
                      parsed.sortBy === 'marketCap' ? 'dq.market_cap' :
                      parsed.sortBy === 'volume' ? 'dq.volume' :
                      'dq.change_percent';

    queryBuilder = queryBuilder.orderBy(sortField, parsed.sortOrder || 'desc');

    // 限制结果数
    queryBuilder = queryBuilder.limit(parsed.limit || 50);

    const results = await queryBuilder;

    res.json({
      success: true,
      data: {
        query,
        filter: parsed,
        results,
        total: results.length,
      },
    });
  } catch (error) {
    console.error('对话式筛选失败:', (error as Error).message);
    res.status(500).json({
      success: false,
      error: '筛选失败，请稍后重试',
      details: (error as Error).message,
    });
  }
}));

export default router;
