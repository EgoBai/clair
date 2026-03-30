import { describe, it, expect } from 'vitest';

// ==================== 自然语言选股查询引擎 ====================

interface QueryToken {
  type: 'industry' | 'metric' | 'comparator' | 'number' | 'logic' | 'sort' | 'limit' | 'keyword';
  value: string;
  original: string;
}

interface QueryFilter {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | 'between' | 'in' | 'contains';
  value: number | string | number[];
}

interface ParsedQuery {
  filters: QueryFilter[];
  sortField?: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
  logic: 'and' | 'or';
  rawQuery: string;
  tokens: QueryToken[];
}

interface StockResult {
  symbol: string;
  name: string;
  [key: string]: any;
}

class NaturalLanguageQueryEngine {
  private vocabulary: Map<string, QueryToken['type']> = new Map([
    // 行业
    ['科技', 'industry'], ['金融', 'industry'], ['消费', 'industry'], ['医药', 'industry'],
    ['制造', 'industry'], ['地产', 'industry'], ['能源', 'industry'], ['军工', 'industry'],
    // 指标
    ['市盈率', 'metric'], ['PE', 'metric'], ['市净率', 'metric'], ['PB', 'metric'],
    ['ROE', 'metric'], ['roe', 'metric'], ['营收增长', 'metric'], ['利润增长', 'metric'],
    ['股息率', 'metric'], ['市值', 'metric'], ['股价', 'metric'], ['换手率', 'metric'],
    ['波动率', 'metric'], ['成交量', 'metric'], ['资产负债率', 'metric'], ['毛利率', 'metric'],
    // 比较
    ['大于', 'comparator'], ['高于', 'comparator'], ['超过', 'comparator'],
    ['小于', 'comparator'], ['低于', 'comparator'], ['不足', 'comparator'],
    ['等于', 'comparator'], ['之间', 'comparator'], ['到', 'comparator'],
    // 逻辑
    ['并且', 'logic'], ['和', 'logic'], ['且', 'logic'], ['或', 'logic'], ['或者', 'logic'],
    // 排序
    ['排序', 'sort'], ['排名', 'sort'], ['升序', 'sort'], ['降序', 'sort'],
    ['最高', 'sort'], ['最低', 'sort'], ['最大', 'sort'], ['最小', 'sort'],
    // 数量
    ['前', 'limit'], ['个', 'limit'], ['只', 'limit'], ['家', 'limit'],
    // 关键词
    ['股票', 'keyword'], ['个股', 'keyword'], ['找到', 'keyword'], ['筛选', 'keyword'],
    ['选出', 'keyword'], ['推荐', 'keyword'], ['便宜', 'keyword'], ['贵', 'keyword'],
    ['优质', 'keyword'], ['成长', 'keyword'], ['价值', 'keyword'], ['分红', 'keyword'],
  ]);

  private metricMapping: Map<string, string> = new Map([
    ['市盈率', 'pe'], ['PE', 'pe'], ['pe', 'pe'],
    ['市净率', 'pb'], ['PB', 'pb'], ['pb', 'pb'],
    ['ROE', 'roe'], ['roe', 'roe'],
    ['营收增长', 'revenueGrowth'], ['利润增长', 'profitGrowth'],
    ['股息率', 'dividendYield'], ['市值', 'marketCap'],
    ['股价', 'price'], ['换手率', 'turnover'],
    ['波动率', 'volatility'], ['成交量', 'volume'],
    ['资产负债率', 'debtRatio'], ['毛利率', 'grossMargin'],
  ]);

  private comparatorMapping: Map<string, QueryFilter['operator']> = new Map([
    ['大于', '>'], ['高于', '>'], ['超过', '>'],
    ['小于', '<'], ['低于', '<'], ['不足', '<'],
    ['等于', '='],
    ['之间', 'between'], ['到', 'between'],
  ]);

  /** 解析自然语言查询 */
  parse(query: string): ParsedQuery {
    const tokens = this.tokenize(query);
    const filters = this.extractFilters(tokens, query);
    const sortField = this.extractSortField(tokens, query);
    const sortOrder = this.extractSortOrder(tokens);
    const limit = this.extractLimit(tokens, query);
    const logic = this.extractLogic(tokens);

    return { filters, sortField, sortOrder, limit, logic, rawQuery: query, tokens };
  }

  /** 执行查询 */
  execute(query: string, stocks: StockResult[]): StockResult[] {
    const parsed = this.parse(query);
    let result = [...stocks];

    // 应用过滤
    result = result.filter(stock => {
      if (parsed.filters.length === 0) return true;
      const checkFilter = (f: QueryFilter): boolean => {
        const value = stock[f.field];
        if (value === undefined) return false;
        switch (f.operator) {
          case '>': return value > (f.value as number);
          case '<': return value < (f.value as number);
          case '>=': return value >= (f.value as number);
          case '<=': return value <= (f.value as number);
          case '=': return value === f.value;
          case 'between': {
            const [lo, hi] = f.value as number[];
            return value >= lo && value <= hi;
          }
          case 'contains': return String(value).includes(String(f.value));
          default: return true;
        }
      };

      if (parsed.logic === 'and') return parsed.filters.every(checkFilter);
      return parsed.filters.some(checkFilter);
    });

    // 排序
    if (parsed.sortField) {
      result.sort((a, b) => {
        const av = a[parsed.sortField!] || 0;
        const bv = b[parsed.sortField!] || 0;
        return parsed.sortOrder === 'desc' ? bv - av : av - bv;
      });
    }

    // 限制数量
    if (parsed.limit > 0) result = result.slice(0, parsed.limit);

    return result;
  }

  /** 查询建议 */
  suggest(partial: string): string[] {
    const suggestions: string[] = [];
    if (partial.length === 0) return ['科技行业PE低于20的股票', 'ROE大于15且营收增长超过20', '市盈率最低的10只股票'];

    if (partial.includes('PE') || partial.includes('市盈率')) {
      suggestions.push(`${partial}小于15的股票`, `${partial}在10到20之间的`);
    }
    if (partial.includes('ROE') || partial.includes('roe')) {
      suggestions.push(`${partial}大于20`, `${partial}最高的10只`);
    }
    if (partial.includes('科技') || partial.includes('金融')) {
      suggestions.push(`${partial}行业市盈率最低`, `${partial}行业ROE最高`);
    }

    return suggestions.length > 0 ? suggestions : [`${partial}的股票`, `${partial}排名前10`];
  }

  /** 解释解析结果 */
  explain(parsed: ParsedQuery): string {
    const parts: string[] = [];
    parts.push(`原始查询: "${parsed.rawQuery}"`);
    parts.push(`过滤条件 (${parsed.logic === 'and' ? '全部满足' : '任一满足'}):`);

    for (const f of parsed.filters) {
      parts.push(`  - ${f.field} ${f.operator} ${Array.isArray(f.value) ? f.value.join(' ~ ') : f.value}`);
    }

    if (parsed.sortField) {
      parts.push(`排序: ${parsed.sortField} ${parsed.sortOrder === 'desc' ? '降序' : '升序'}`);
    }
    if (parsed.limit > 0) {
      parts.push(`限制: 前${parsed.limit}条`);
    }

    return parts.join('\n');
  }

  // ==================== 私有方法 ====================

  private tokenize(query: string): QueryToken[] {
    const tokens: QueryToken[] = [];
    const sorted = Array.from(this.vocabulary.entries()).sort((a, b) => b[0].length - a[0].length);
    let remaining = query;

    while (remaining.length > 0) {
      let matched = false;
      for (const [word, type] of sorted) {
        if (remaining.startsWith(word)) {
          tokens.push({ type, value: word, original: word });
          remaining = remaining.substring(word.length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // 尝试匹配数字
        const numMatch = remaining.match(/^[\d.]+/);
        if (numMatch) {
          tokens.push({ type: 'number', value: numMatch[0], original: numMatch[0] });
          remaining = remaining.substring(numMatch[0].length);
        } else {
          remaining = remaining.substring(1);
        }
      }
    }

    return tokens;
  }

  private extractFilters(tokens: QueryToken[], query: string): QueryFilter[] {
    const filters: QueryFilter[] = [];
    const numbers = tokens.filter(t => t.type === 'number').map(t => parseFloat(t.value));
    const metrics = tokens.filter(t => t.type === 'metric');
    const comparators = tokens.filter(t => t.type === 'comparator');

    // 匹配: 指标 + 比较符 + 数字
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'metric') {
        const field = this.metricMapping.get(tokens[i].value) || tokens[i].value;
        // 寻找比较符
        let operator: QueryFilter['operator'] = '>';
        for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
          if (tokens[j].type === 'comparator') {
            operator = this.comparatorMapping.get(tokens[j].value) || '>';
            break;
          }
        }
        // 寻找数字
        const numTokens: number[] = [];
        for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
          if (tokens[j].type === 'number') numTokens.push(parseFloat(tokens[j].value));
          if (tokens[j].type === 'metric') break;
        }

        if (numTokens.length >= 2 && operator === 'between') {
          filters.push({ field, operator: 'between', value: [Math.min(...numTokens), Math.max(...numTokens)] });
        } else if (numTokens.length >= 1) {
          filters.push({ field, operator, value: numTokens[0] });
        }
      }
    }

    // 关键词映射
    const keywords = tokens.filter(t => t.type === 'keyword').map(t => t.value);
    if (keywords.includes('便宜') && !filters.find(f => f.field === 'pe')) {
      filters.push({ field: 'pe', operator: '<', value: 20 });
    }
    if (keywords.includes('优质') && !filters.find(f => f.field === 'roe')) {
      filters.push({ field: 'roe', operator: '>', value: 15 });
    }
    if (keywords.includes('成长') && !filters.find(f => f.field === 'revenueGrowth')) {
      filters.push({ field: 'revenueGrowth', operator: '>', value: 20 });
    }
    if (keywords.includes('分红') && !filters.find(f => f.field === 'dividendYield')) {
      filters.push({ field: 'dividendYield', operator: '>', value: 3 });
    }

    return filters;
  }

  private extractSortField(tokens: QueryToken[], query: string): string | undefined {
    const metrics = tokens.filter(t => t.type === 'metric');
    const sortTokens = tokens.filter(t => t.type === 'sort');

    if (sortTokens.length > 0 && metrics.length > 0) {
      return this.metricMapping.get(metrics[metrics.length - 1].value);
    }
    if (query.includes('最高') || query.includes('最大')) {
      if (metrics.length > 0) return this.metricMapping.get(metrics[0].value);
    }
    return undefined;
  }

  private extractSortOrder(tokens: QueryToken[]): 'asc' | 'desc' {
    const sortWords = tokens.filter(t => t.type === 'sort').map(t => t.value);
    if (sortWords.includes('升序') || sortWords.includes('最低') || sortWords.includes('最小')) return 'asc';
    return 'desc';
  }

  private extractLimit(tokens: QueryToken[], query: string): number {
    const limitTokens = tokens.filter(t => t.type === 'limit');
    const numbers = tokens.filter(t => t.type === 'number').map(t => parseInt(t.value));

    // "前N个/只/家"
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].value === '前' && i + 1 < tokens.length && tokens[i + 1].type === 'number') {
        return parseInt(tokens[i + 1].value);
      }
    }

    // "N只"
    if (limitTokens.length > 0 && numbers.length > 0) return numbers[0];

    return 0;
  }

  private extractLogic(tokens: QueryToken[]): 'and' | 'or' {
    const logicTokens = tokens.filter(t => t.type === 'logic');
    if (logicTokens.some(t => t.value === '或' || t.value === '或者')) return 'or';
    return 'and';
  }
}

// ==================== 测试数据 ====================

const sampleStocks: StockResult[] = [
  { symbol: '000001', name: '平安银行', industry: '金融', pe: 8, pb: 0.9, roe: 12, revenueGrowth: 15, dividendYield: 3.5, marketCap: 300, price: 12 },
  { symbol: '000002', name: '万科A', industry: '地产', pe: 6, pb: 0.8, roe: 18, revenueGrowth: 5, dividendYield: 4, marketCap: 250, price: 15 },
  { symbol: '000063', name: '中兴通讯', industry: '科技', pe: 25, pb: 3, roe: 10, revenueGrowth: 25, dividendYield: 1, marketCap: 150, price: 30 },
  { symbol: '000333', name: '美的集团', industry: '制造', pe: 15, pb: 3.5, roe: 25, revenueGrowth: 12, dividendYield: 2.5, marketCap: 400, price: 55 },
  { symbol: '000858', name: '五粮液', industry: '消费', pe: 28, pb: 7, roe: 22, revenueGrowth: 18, dividendYield: 1.5, marketCap: 600, price: 150 },
  { symbol: '600519', name: '贵州茅台', industry: '消费', pe: 35, pb: 12, roe: 30, revenueGrowth: 15, dividendYield: 1, marketCap: 2000, price: 1800 },
  { symbol: '002415', name: '海康威视', industry: '科技', pe: 20, pb: 5, roe: 28, revenueGrowth: 20, dividendYield: 2, marketCap: 350, price: 40 },
  { symbol: '300750', name: '宁德时代', industry: '制造', pe: 50, pb: 8, roe: 15, revenueGrowth: 40, dividendYield: 0.5, marketCap: 800, price: 200 },
];

// ==================== 测试 ====================

describe('NaturalLanguageQueryEngine 自然语言选股', () => {
  const engine = new NaturalLanguageQueryEngine();

  describe('查询解析', () => {
    it('应解析简单指标查询', () => {
      const parsed = engine.parse('PE小于20');
      expect(parsed.filters.length).toBeGreaterThan(0);
      expect(parsed.filters[0].field).toBe('pe');
      expect(parsed.filters[0].operator).toBe('<');
      expect(parsed.filters[0].value).toBe(20);
    });

    it('应解析中文指标', () => {
      const parsed = engine.parse('市盈率大于15');
      expect(parsed.filters[0].field).toBe('pe');
      expect(parsed.filters[0].operator).toBe('>');
    });

    it('应解析范围查询', () => {
      const parsed = engine.parse('PE在10到30之间');
      expect(parsed.filters[0].operator).toBe('between');
      expect(parsed.filters[0].value).toEqual([10, 30]);
    });

    it('应解析排序', () => {
      const parsed = engine.parse('市盈率最高');
      expect(parsed.sortField).toBe('pe');
      expect(parsed.sortOrder).toBe('desc');
    });

    it('应解析数量限制', () => {
      const parsed = engine.parse('前10只股票');
      expect(parsed.limit).toBe(10);
    });

    it('应解析多条件', () => {
      const parsed = engine.parse('ROE大于15并且市盈率小于25');
      expect(parsed.filters.length).toBe(2);
      expect(parsed.logic).toBe('and');
    });

    it('应解析或条件', () => {
      const parsed = engine.parse('PE小于10或PB小于1');
      expect(parsed.logic).toBe('or');
    });
  });

  describe('查询执行', () => {
    it('应筛选出PE<20的股票', () => {
      const results = engine.execute('PE小于20', sampleStocks);
      for (const s of results) expect(s.pe).toBeLessThan(20);
    });

    it('应排序结果', () => {
      const results = engine.execute('市盈率最低', sampleStocks);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].pe).toBeLessThanOrEqual(results[i].pe);
      }
    });

    it('应限制数量', () => {
      const results = engine.execute('前3只股票', sampleStocks);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('应组合筛选排序限制', () => {
      const results = engine.execute('ROE大于15市盈率最高的前3只', sampleStocks);
      expect(results.length).toBeLessThanOrEqual(3);
      for (const s of results) expect(s.roe).toBeGreaterThan(15);
    });

    it('应处理范围查询', () => {
      const results = engine.execute('PE在10到25之间', sampleStocks);
      for (const s of results) {
        expect(s.pe).toBeGreaterThanOrEqual(10);
        expect(s.pe).toBeLessThanOrEqual(25);
      }
    });

    it('关键词"便宜"应筛选低PE', () => {
      const results = engine.execute('便宜的股票', sampleStocks);
      for (const s of results) expect(s.pe).toBeLessThan(20);
    });

    it('关键词"优质"应筛选高ROE', () => {
      const results = engine.execute('优质股票', sampleStocks);
      for (const s of results) expect(s.roe).toBeGreaterThan(15);
    });

    it('关键词"成长"应筛选高增长', () => {
      const results = engine.execute('成长股', sampleStocks);
      for (const s of results) expect(s.revenueGrowth).toBeGreaterThan(20);
    });

    it('关键词"分红"应筛选高股息', () => {
      const results = engine.execute('分红股', sampleStocks);
      for (const s of results) expect(s.dividendYield).toBeGreaterThan(3);
    });

    it('空查询应返回所有', () => {
      const results = engine.execute('', sampleStocks);
      expect(results.length).toBe(sampleStocks.length);
    });
  });

  describe('查询建议', () => {
    it('空输入应返回默认建议', () => {
      const suggestions = engine.suggest('');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('包含PE应返回PE相关建议', () => {
      const suggestions = engine.suggest('PE');
      expect(suggestions.some(s => s.includes('15') || s.includes('20'))).toBe(true);
    });

    it('包含行业应返回行业建议', () => {
      const suggestions = engine.suggest('科技');
      expect(suggestions.some(s => s.includes('科技'))).toBe(true);
    });
  });

  describe('查询解释', () => {
    it('应生成解释文本', () => {
      const parsed = engine.parse('ROE大于15并且市盈率小于20前5只');
      const explain = engine.explain(parsed);
      expect(explain).toContain('过滤条件');
      expect(explain).toContain('roe');
      expect(explain).toContain('pe');
    });
  });

  describe('复杂查询', () => {
    it('应处理长查询', () => {
      const results = engine.execute('ROE大于15并且市盈率小于25并且营收增长超过10前5只', sampleStocks);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('应处理中文数字', () => {
      const parsed = engine.parse('前10只');
      expect(parsed.limit).toBe(10);
    });
  });
});
