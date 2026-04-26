import { describe, it, expect } from 'vitest';

// 搜索与推荐引擎测试
describe('搜索与推荐引擎', () => {
  describe('股票搜索', () => {
    const searchStocks = (
      query: string,
      stocks: { code: string; name: string; pinyin: string; sector: string }[]
    ) => {
      if (!query) return [];
      const q = query.toLowerCase();
      return stocks.filter(s =>
        s.code.includes(q) ||
        s.name.includes(q) ||
        s.pinyin.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
      ).map(s => ({
        ...s,
        score: s.code.startsWith(query) ? 3 :
               s.name.startsWith(query) ? 2 :
               s.pinyin.toLowerCase().startsWith(q) ? 1 : 0,
      })).sort((a, b) => b.score - a.score);
    };

    const stocks = [
      { code: '600000', name: '浦发银行', pinyin: 'PFYH', sector: 'bank' },
      { code: '601318', name: '中国平安', pinyin: 'ZGPA', sector: 'insurance' },
      { code: '000001', name: '平安银行', pinyin: 'PAYH', sector: 'bank' },
      { code: '300750', name: '宁德时代', pinyin: 'NDSD', sector: 'new_energy' },
    ];

    it('按代码搜索', () => {
      const result = searchStocks('600000', stocks);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('600000');
    });

    it('按名称搜索', () => {
      const result = searchStocks('平安', stocks);
      expect(result).toHaveLength(2);
    });

    it('按拼音搜索', () => {
      const result = searchStocks('pfyh', stocks);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('600000');
    });

    it('前缀匹配优先', () => {
      const result = searchStocks('平安', stocks);
      // "平安银行" 以 "平安" 开头
      expect(result[0].name).toBe('平安银行');
    });

    it('无结果返回空', () => {
      expect(searchStocks('zzzzz', stocks)).toHaveLength(0);
    });

    it('空查询返回空', () => {
      expect(searchStocks('', stocks)).toHaveLength(0);
    });
  });

  describe('相关股票推荐', () => {
    const recommendRelated = (
      targetCode: string,
      stocks: { code: string; sector: string; marketCap: number; corr: Record<string, number> }[]
    ) => {
      const target = stocks.find(s => s.code === targetCode);
      if (!target) return [];

      return stocks
        .filter(s => s.code !== targetCode)
        .map(s => ({
          code: s.code,
          score: (s.sector === target.sector ? 0.3 : 0) +
                 (target.corr[s.code] || 0) * 0.5 +
                 (1 - Math.abs(s.marketCap - target.marketCap) / Math.max(s.marketCap, target.marketCap)) * 0.2,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    };

    it('同行业得分高', () => {
      const stocks: ({ code: string; sector: string; marketCap: number; corr: Record<string, number> })[] = [
        { code: 'A', sector: 'bank', marketCap: 100, corr: { B: 0.8, C: 0.3 } as Record<string, number> },
        { code: 'B', sector: 'bank', marketCap: 90, corr: { A: 0.8, C: 0.2 } as Record<string, number> },
        { code: 'C', sector: 'tech', marketCap: 200, corr: { A: 0.3, B: 0.2 } as Record<string, number> },
      ];
      const result = recommendRelated('A', stocks);
      expect(result[0].code).toBe('B');
    });

    it('未知股票返回空', () => {
      expect(recommendRelated('UNKNOWN', []).length).toBe(0);
    });

    it('只推荐5只', () => {
      const stocks = Array.from({ length: 10 }, (_, i) => ({
        code: `S${i}`,
        sector: 'test',
        marketCap: 100,
        corr: { S0: 0.5 } as Record<string, number>,
      }));
      expect(recommendRelated('S0', stocks)).toHaveLength(5);
    });
  });

  describe('热门股票检测', () => {
    const detectHotStocks = (
      stocks: { code: string; volumeChange: number; priceChange: number; newsCount: number }[]
    ) => {
      return stocks
        .map(s => ({
          code: s.code,
          hotScore: s.volumeChange * 0.4 +
                    Math.abs(s.priceChange) * 0.3 +
                    Math.min(s.newsCount / 10, 1) * 0.3,
        }))
        .filter(s => s.hotScore > 0.5)
        .sort((a, b) => b.hotScore - a.hotScore);
    };

    it('高成交量变化是热门', () => {
      const stocks = [
        { code: 'A', volumeChange: 2.0, priceChange: 0.02, newsCount: 5 },
        { code: 'B', volumeChange: 0.1, priceChange: 0.01, newsCount: 1 },
      ];
      const result = detectHotStocks(stocks);
      expect(result[0].code).toBe('A');
    });

    it('低热度不选入', () => {
      const stocks = [
        { code: 'A', volumeChange: 0.1, priceChange: 0.01, newsCount: 0 },
      ];
      expect(detectHotStocks(stocks)).toHaveLength(0);
    });

    it('大涨大跌都是热门', () => {
      const stocks = [
        { code: 'UP', volumeChange: 1, priceChange: 0.10, newsCount: 5 },
        { code: 'DOWN', volumeChange: 1, priceChange: -0.10, newsCount: 5 },
      ];
      const result = detectHotStocks(stocks);
      expect(result).toHaveLength(2);
    });
  });

  describe('搜索历史', () => {
    const createSearchHistory = (maxSize: number) => {
      const history: string[] = [];

      return {
        add(query: string) {
          if (!query.trim()) return;
          const idx = history.indexOf(query);
          if (idx >= 0) history.splice(idx, 1);
          history.unshift(query);
          if (history.length > maxSize) history.pop();
        },
        get: () => [...history],
        remove(query: string) {
          const idx = history.indexOf(query);
          if (idx >= 0) history.splice(idx, 1);
        },
        clear() { history.length = 0; },
        size: () => history.length,
      };
    };

    it('添加搜索记录', () => {
      const h = createSearchHistory(10);
      h.add('平安银行');
      expect(h.get()).toContain('平安银行');
    });

    it('最新搜索在前面', () => {
      const h = createSearchHistory(10);
      h.add('first');
      h.add('second');
      expect(h.get()[0]).toBe('second');
    });

    it('重复搜索移到最前', () => {
      const h = createSearchHistory(10);
      h.add('A');
      h.add('B');
      h.add('A');
      expect(h.get()[0]).toBe('A');
      expect(h.size()).toBe(2);
    });

    it('超出容量丢弃最旧', () => {
      const h = createSearchHistory(2);
      h.add('A');
      h.add('B');
      h.add('C');
      expect(h.get()).not.toContain('A');
      expect(h.size()).toBe(2);
    });

    it('空查询不添加', () => {
      const h = createSearchHistory(10);
      h.add('');
      h.add('  ');
      expect(h.size()).toBe(0);
    });

    it('清除历史', () => {
      const h = createSearchHistory(10);
      h.add('A');
      h.clear();
      expect(h.size()).toBe(0);
    });

    it('移除单项', () => {
      const h = createSearchHistory(10);
      h.add('A');
      h.add('B');
      h.remove('A');
      expect(h.get()).not.toContain('A');
      expect(h.size()).toBe(1);
    });
  });

  describe('搜索建议', () => {
    const generateSuggestions = (
      query: string,
      stocks: { code: string; name: string }[],
      history: string[]
    ) => {
      const q = query.toLowerCase();
      const matches = stocks
        .filter(s => s.code.includes(q) || s.name.includes(q))
        .map(s => ({ text: `${s.name}(${s.code})`, type: 'stock' as const }));
      const histMatches = history
        .filter(h => h.toLowerCase().includes(q))
        .map(h => ({ text: h, type: 'history' as const }));
      return [...histMatches.slice(0, 3), ...matches.slice(0, 7)];
    };

    it('混合搜索和历史建议', () => {
      const stocks = [{ code: '600000', name: '浦发银行' }];
      const history = ['浦发银行分析', '银行板块'];
      const result = generateSuggestions('浦发', stocks, history);
      const types = result.map(r => r.type);
      expect(types).toContain('history');
      expect(types).toContain('stock');
    });

    it('历史优先', () => {
      const stocks = [{ code: '600000', name: '测试' }];
      const history = ['测试搜索'];
      const result = generateSuggestions('测试', stocks, history);
      expect(result[0].type).toBe('history');
    });

    it('无匹配返回空', () => {
      expect(generateSuggestions('zzz', [], [])).toEqual([]);
    });

    it('历史最多3条', () => {
      const history = Array.from({ length: 10 }, (_, i) => `搜索${i}`);
      const result = generateSuggestions('搜索', [], history);
      expect(result.filter(r => r.type === 'history')).toHaveLength(3);
    });
  });
});
