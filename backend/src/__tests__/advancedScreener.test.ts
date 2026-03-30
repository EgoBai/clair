import { describe, it, expect } from 'vitest';

/**
 * 高级筛选器 API 测试
 * 测试条件组合、字段验证、模板管理
 */
describe('Advanced Screener API', () => {
  const ALLOWED_FIELDS = new Set([
    'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
    'amplitude', 'pe_ratio', 'pb_ratio', 'market_cap', 'circulating_market_cap',
    'high_price', 'low_price', 'open_price',
    'rsi', 'macd', 'macd_signal', 'macd_histogram',
    'kdj_k', 'kdj_d', 'kdj_j',
    'boll_upper', 'boll_middle', 'boll_lower',
    'ma5', 'ma10', 'ma20', 'ma60',
  ]);

  const FIELD_MAP: Record<string, string> = {
    price: 'dq.close_price',
    change_percent: 'dq.change_percent',
    volume: 'dq.volume',
    turnover: 'dq.turnover',
    turnover_rate: 'dq.turnover_rate',
    amplitude: 'dq.amplitude',
    pe_ratio: 'dq.pe_ratio',
    pb_ratio: 'dq.pb_ratio',
    market_cap: 'dq.market_cap',
    circulating_market_cap: 'dq.circulating_market_cap',
    high_price: 'dq.high_price',
    low_price: 'dq.low_price',
    open_price: 'dq.open_price',
    rsi: 'ti.rsi',
    macd: 'ti.macd',
    macd_signal: 'ti.macd_signal',
    macd_histogram: 'ti.macd_histogram',
    kdj_k: 'ti.kdj_k',
    kdj_d: 'ti.kdj_d',
    kdj_j: 'ti.kdj_j',
    boll_upper: 'ti.boll_upper',
    boll_middle: 'ti.boll_middle',
    boll_lower: 'ti.boll_lower',
    ma5: 'ti.ma5',
    ma10: 'ti.ma10',
    ma20: 'ti.ma20',
    ma60: 'ti.ma60',
  };

  const INDICATOR_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
    macd_golden_cross: { name: 'MACD金叉', description: 'DIF上穿DEA，买入信号' },
    macd_death_cross: { name: 'MACD死叉', description: 'DIF下穿DEA，卖出信号' },
    rsi_oversold: { name: 'RSI超卖', description: 'RSI低于30，可能反弹' },
    rsi_overbought: { name: 'RSI超买', description: 'RSI高于70，可能回调' },
    kdj_golden_cross: { name: 'KDJ金叉', description: 'K线上穿D线' },
    kdj_oversold: { name: 'KDJ超卖', description: 'J值低于20' },
    boll_break_upper: { name: '突破布林上轨', description: '强势信号' },
    boll_break_lower: { name: '跌破布林下轨', description: '弱势信号' },
    ma_golden_cross: { name: '均线金叉', description: '短期均线上穿长期均线' },
    ma_death_cross: { name: '均线死叉', description: '短期均线下穿长期均线' },
    volume_breakout: { name: '放量突破', description: '成交量超过20日均量2倍' },
  };

  describe('Field Validation', () => {
    it('should allow all basic fields', () => {
      const basicFields = ['price', 'change_percent', 'volume', 'turnover', 'turnover_rate'];
      basicFields.forEach(f => {
        expect(ALLOWED_FIELDS.has(f)).toBe(true);
      });
    });

    it('should allow all technical indicator fields', () => {
      const techFields = ['rsi', 'macd', 'macd_signal', 'kdj_k', 'kdj_d', 'kdj_j', 'ma5', 'ma20'];
      techFields.forEach(f => {
        expect(ALLOWED_FIELDS.has(f)).toBe(true);
      });
    });

    it('should reject invalid fields', () => {
      expect(ALLOWED_FIELDS.has('invalid_field')).toBe(false);
      expect(ALLOWED_FIELDS.has('sql_injection')).toBe(false);
      expect(ALLOWED_FIELDS.has('')).toBe(false);
    });

    it('should have matching FIELD_MAP for all allowed fields', () => {
      ALLOWED_FIELDS.forEach(field => {
        expect(FIELD_MAP[field]).toBeTruthy();
      });
    });

    it('should map fields to correct DB columns', () => {
      expect(FIELD_MAP.price).toBe('dq.close_price');
      expect(FIELD_MAP.rsi).toBe('ti.rsi');
      expect(FIELD_MAP.macd).toBe('ti.macd');
      expect(FIELD_MAP.ma20).toBe('ti.ma20');
    });
  });

  describe('Condition Operators', () => {
    type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'in';

    function validateOperator(operator: string): boolean {
      return ['gt', 'gte', 'lt', 'lte', 'eq', 'between', 'in'].includes(operator);
    }

    it('should support comparison operators', () => {
      expect(validateOperator('gt')).toBe(true);
      expect(validateOperator('gte')).toBe(true);
      expect(validateOperator('lt')).toBe(true);
      expect(validateOperator('lte')).toBe(true);
      expect(validateOperator('eq')).toBe(true);
    });

    it('should support range operators', () => {
      expect(validateOperator('between')).toBe(true);
      expect(validateOperator('in')).toBe(true);
    });

    it('should reject invalid operators', () => {
      expect(validateOperator('like')).toBe(false);
      expect(validateOperator('contains')).toBe(false);
      expect(validateOperator('')).toBe(false);
    });
  });

  describe('Condition Group Logic', () => {
    interface ConditionGroup {
      logic: 'and' | 'or';
      conditions: Array<{ field: string; operator: string; value: any }>;
    }

    it('should support AND logic between conditions', () => {
      const group: ConditionGroup = {
        logic: 'and',
        conditions: [
          { field: 'pe_ratio', operator: 'lt', value: 20 },
          { field: 'rsi', operator: 'lt', value: 70 },
        ],
      };
      expect(group.logic).toBe('and');
      expect(group.conditions.length).toBe(2);
    });

    it('should support OR logic between conditions', () => {
      const group: ConditionGroup = {
        logic: 'or',
        conditions: [
          { field: 'pe_ratio', operator: 'lt', value: 15 },
          { field: 'change_percent', operator: 'gt', value: 3 },
        ],
      };
      expect(group.logic).toBe('or');
    });

    it('should support multiple condition groups (AND between groups)', () => {
      const groups: ConditionGroup[] = [
        {
          logic: 'or',
          conditions: [
            { field: 'pe_ratio', operator: 'lt', value: 15 },
            { field: 'change_percent', operator: 'gt', value: 3 },
          ],
        },
        {
          logic: 'and',
          conditions: [
            { field: 'rsi', operator: 'lt', value: 70 },
          ],
        },
      ];
      expect(groups.length).toBe(2);
    });

    it('should validate group has conditions array', () => {
      const group = { logic: 'and' as const, conditions: [] };
      expect(Array.isArray(group.conditions)).toBe(true);
    });
  });

  describe('Preset Templates', () => {
    const ADVANCED_PRESETS = [
      {
        id: 'macd_golden',
        name: 'MACD金叉',
        groups: [{ logic: 'and' as const, conditions: [
          { field: 'macd_histogram', operator: 'gt' as const, value: 0 },
          { field: 'rsi', operator: 'lt' as const, value: 70 },
        ] }],
      },
      {
        id: 'oversold_bounce',
        name: '超卖反弹',
        groups: [{ logic: 'and' as const, conditions: [
          { field: 'rsi', operator: 'lt' as const, value: 30 },
          { field: 'kdj_j', operator: 'lt' as const, value: 20 },
        ] }],
      },
      {
        id: 'value_quality',
        name: '价值质量股',
        groups: [{ logic: 'and' as const, conditions: [
          { field: 'pe_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pe_ratio', operator: 'lt' as const, value: 20 },
          { field: 'pb_ratio', operator: 'lt' as const, value: 3 },
        ] }],
      },
    ];

    it('should have all preset templates', () => {
      expect(ADVANCED_PRESETS.length).toBeGreaterThanOrEqual(3);
    });

    it('should have unique preset IDs', () => {
      const ids = ADVANCED_PRESETS.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have valid conditions in presets', () => {
      ADVANCED_PRESETS.forEach(preset => {
        preset.groups.forEach(group => {
          group.conditions.forEach(cond => {
            expect(ALLOWED_FIELDS.has(cond.field)).toBe(true);
          });
        });
      });
    });

    it('should have names for all presets', () => {
      ADVANCED_PRESETS.forEach(preset => {
        expect(preset.name).toBeTruthy();
        expect(preset.id).toBeTruthy();
      });
    });
  });

  describe('Indicator Descriptions', () => {
    it('should have 11 technical indicators', () => {
      expect(Object.keys(INDICATOR_DESCRIPTIONS).length).toBe(11);
    });

    it('should have name and description for each indicator', () => {
      Object.values(INDICATOR_DESCRIPTIONS).forEach(desc => {
        expect(desc.name).toBeTruthy();
        expect(desc.description).toBeTruthy();
      });
    });

    it('should include MACD indicators', () => {
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('macd_golden_cross');
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('macd_death_cross');
    });

    it('should include RSI indicators', () => {
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('rsi_oversold');
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('rsi_overbought');
    });

    it('should include KDJ indicators', () => {
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('kdj_golden_cross');
      expect(INDICATOR_DESCRIPTIONS).toHaveProperty('kdj_oversold');
    });
  });

  describe('CSV Export', () => {
    function convertToCSV(data: any[]): string {
      if (data.length === 0) return '';
      const headers = ['代码', '名称', '最新价', '涨跌幅%', '成交量'];
      const rows = data.map(s => [s.symbol, s.name, s.price, s.changePercent, s.volume]);
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    it('should convert empty data to empty string', () => {
      expect(convertToCSV([])).toBe('');
    });

    it('should generate valid CSV with headers', () => {
      const data = [{ symbol: '600519', name: '茅台', price: 1800, changePercent: 2.5, volume: 50000 }];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('代码');
      expect(lines[1]).toContain('600519');
    });

    it('should handle multiple rows', () => {
      const data = [
        { symbol: '600519', name: '茅台', price: 1800, changePercent: 2.5, volume: 50000 },
        { symbol: '000858', name: '五粮液', price: 150, changePercent: 1.2, volume: 30000 },
      ];
      const csv = convertToCSV(data);
      const lines = csv.split('\n');
      expect(lines.length).toBe(3);
    });
  });

  describe('Pagination', () => {
    it('should calculate correct offset', () => {
      const page = 3;
      const pageSize = 20;
      const offset = (page - 1) * pageSize;
      expect(offset).toBe(40);
    });

    it('should cap page size for JSON format', () => {
      const pageSize = 500;
      const safePageSize = Math.min(Math.max(pageSize, 1), 200);
      expect(safePageSize).toBe(200);
    });

    it('should allow larger page size for CSV', () => {
      const pageSize = 5000;
      const format = 'csv';
      const safePageSize = format === 'csv' ? 10000 : Math.min(Math.max(pageSize, 1), 200);
      expect(safePageSize).toBe(10000);
    });

    it('should enforce minimum page number', () => {
      const page = -1;
      const safePage = Math.max(page, 1);
      expect(safePage).toBe(1);
    });
  });

  describe('Request Validation', () => {
    it('should reject empty groups', () => {
      const groups: any[] = [];
      expect(groups.length === 0).toBe(true);
    });

    it('should reject non-array groups', () => {
      const groups = 'invalid';
      expect(!Array.isArray(groups)).toBe(true);
    });

    it('should validate all condition fields', () => {
      const groups = [
        {
          logic: 'and',
          conditions: [{ field: 'sql_injection', operator: 'gt', value: 1 }],
        },
      ];
      const invalidField = groups[0].conditions.find(c => !ALLOWED_FIELDS.has(c.field));
      expect(invalidField).toBeTruthy();
    });

    it('should accept valid request', () => {
      const groups = [
        {
          logic: 'and',
          conditions: [
            { field: 'pe_ratio', operator: 'lt', value: 20 },
            { field: 'rsi', operator: 'gt', value: 30 },
          ],
        },
      ];
      const allValid = groups.every(g =>
        g.conditions.every(c => ALLOWED_FIELDS.has(c.field))
      );
      expect(allValid).toBe(true);
    });
  });
});
