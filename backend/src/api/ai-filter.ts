/**
 * 对话式筛选 API
 * 自然语言 → 筛选条件 → 股票结果
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import aiService from '../services/aiService';

import { aiTiming } from '../middleware/aiTiming';

const router = Router();

// F12/A-07: AI 接口耗时日志（端点/状态/耗时/首字节）
router.use(aiTiming);

// ============================================================
// 秘密脱敏（P0-LEAK C-2：安全红线）
// ============================================================
/**
 * 错误文案脱敏：清除一切 API key 指纹/后缀（**连掩码都不留**）。
 *
 * 泄露链路（audit 实测 "****0a09" 出街）：
 *   gatewayFetch 上游 401 时把响应体前 500 字符塞进 HttpStatusError.message
 *   （llmGateway.ts:21），而 DeepSeek/OpenAI 的 401 body 恰好携带掩码 key：
 *   `Incorrect API key provided: sk-xxxx...****0a09. You can find your API key at ...`
 *   此前本文件 catch 层把 error.message 原样放 `details` 返回给客户端。
 *
 * 覆盖形态：
 *   - sk-/rk-/dk-/fk- 前缀的全量 key（OpenAI/DeepSeek/自建网关惯例）
 *   - `****0a09` 这类掩码后缀（上游 401 body 的默认格式）
 *   - Authorization: Bearer xxx
 *   - 32+ 位连续 hex（自建网关/第三方平台常见的无前缀 key）
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/\b(?:sk|rk|dk|fk)-[A-Za-z0-9_-]{4,}/g, '[REDACTED]')
    .replace(/\*{2,}[0-9a-zA-Z]{2,}/g, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED]');
}

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
  const { query, watchlistSymbols } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ success: false, error: '请提供筛选条件描述' });
    return;
  }

  try {
    // 用AI解析自然语言为筛选条件
    const industries = ['交通运输','传媒','公用事业','农林牧渔','化工','医药生物','商贸零售','国防军工','基础化工','家用电器','建筑材料','建筑装饰','房地产','有色金属','机械设备','汽车','煤炭','环保','电力设备','电子','石油石化','社会服务','纺织服饰','综合','美容护理','计算机','轻工制造','通信','钢铁','银行','非银金融','食品饮料'];

    // 判断是否为自选股查询
    const isWatchlistQuery = Array.isArray(watchlistSymbols) && watchlistSymbols.length > 0;
    
    // 空自选股直接返回
    if (Array.isArray(watchlistSymbols) && watchlistSymbols.length === 0 && /自选|我的股票|我的持仓/.test(query)) {
      res.json({
        success: true,
        data: { query, filter: { conditions: [], explanation: '自选股列表为空' }, results: [], total: 0, isWatchlistQuery: true, watchlistCount: 0 }
      });
      return;
    }
    
    const watchlistContext = isWatchlistQuery
      ? `\n重要：用户查询的是自己的自选股（共${watchlistSymbols.length}只）。请返回的conditions中不要包含通用筛选条件，只需返回空conditions数组，系统会自动限定在用户自选股范围内。explanation中说明这是自选股分析。`
      : '';

    const prompt = `你是A股筛选助手。用户用自然语言描述筛选需求，你需要将其准确转换为JSON筛选条件。

用户描述: "${query}"
${watchlistContext}

可筛选的字段和单位:
- changePercent: 涨跌幅(%) 
- turnoverRate: 换手率(%)
- marketCap: 市值(万元，1亿=10000万)
- volume: 成交量(手)
- price: 股价(元)
- industry: 行业(必须是以下之一: ${industries.join('、')})

行业名称理解（用户口语→标准名称）:
- "科技/TMT" → ["电子", "计算机", "通信"]
- "消费" → ["食品饮料", "商贸零售", "家用电器", "纺织服饰", "轻工制造", "汽车"]
- "金融" → ["银行", "非银金融"]
- "医药/医疗" → ["医药生物"]
- "新能源" → ["电力设备", "汽车"]
- "制造/工业" → ["机械设备", "基础化工", "有色金属", "钢铁"]
- "基建" → ["建筑装饰", "建筑材料"]
- "农业" → ["农林牧渔"]
- "军工/国防" → ["国防军工"]
- "传媒/互联网" → ["传媒", "计算机"]
- "资源/周期" → ["煤炭", "石油石化", "有色金属", "钢铁"]
- "地产" → ["房地产"]
- "电力/能源" → ["公用事业", "电力设备", "煤炭"]
- "交通/物流" → ["交通运输"]

数字理解:
- "涨超5%" → changePercent > 5
- "跌超3%" → changePercent < -3
- "换手超过8%" → turnoverRate > 8
- "市值超100亿" → marketCap > 1000000
- "市盈率低于20" → pe < 20
- "股价低于10元" → price < 10

如果用户没有指定行业，conditions数组中不要包含industry条件。
如果用户描述模糊无法解析为具体筛选条件，返回空的conditions数组并解释原因。

返回纯JSON格式（不要markdown代码块）:
{"conditions": [{...}], "sortBy": "changePercent", "sortOrder": "desc", "limit": 50, "explanation": "一句话解释筛选逻辑"}`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 200,
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
      const jsonStr = jsonMatch[0]
        .replace(/,\s*}/g, '}')  // 移除尾逗号
        .replace(/,\s*]/g, ']'); // 移除数组尾逗号
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // details 是「AI 返回内容前 100 字 / JSON.parse 报错」，正常不含 key；
      // 但防御性统一过 redactSecrets，保证任何路径都不可能带出 key 指纹。
      res.status(500).json({
        success: false,
        error: 'AI解析失败，请换个说法试试',
        details: redactSecrets((e as Error).message),
      });
      return;
    }

    // 构建数据库查询
    const dbInstance = getDb();
    const knex = dbInstance.connection;
    let queryBuilder = (knex as any)('stocks as s')
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

    // 如果是自选股查询，限定范围
    if (isWatchlistQuery) {
      queryBuilder = queryBuilder.whereIn('s.symbol', watchlistSymbols);
    }

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
        isWatchlistQuery,
        watchlistCount: isWatchlistQuery ? watchlistSymbols.length : undefined,
      },
    });
  } catch (error) {
    // 【P0-LEAK C-2 安全红线】此前这里把 error.message 原样放 `details` 出街，
    // 而 message 可能是 HttpStatusError 的「上游 401 body 前 500 字符」，
    // 内含掩码 key（实测 "****0a09"）。修复：
    //   1. 响应体**完全不透传**上游错误 message——响应里连掩码指纹都不留，
    //      比任何正则脱敏更稳（正则总有形态漏网：非 sk- 前缀的自建 key、
    //      DB 连接串里的密码等都可能进 message）；
    //   2. 服务端日志同样脱敏后再落盘，避免 stdout 里留全量/半量 key。
    console.error('对话式筛选失败:', redactSecrets((error as Error).message));
    res.status(500).json({
      success: false,
      error: '筛选失败，请稍后重试',
    });
  }
}));

export default router;
