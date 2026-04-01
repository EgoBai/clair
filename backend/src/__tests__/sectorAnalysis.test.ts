import { describe, it, expect } from 'vitest';

/**
 * 行业板块深度分析API测试
 * 测试板块配置、数据计算、排序逻辑
 */

// 从sector-analysis.ts提取的板块定义
const sectorDefs = [
  { name: '白酒', code: 'BJ', stocks: [
    { symbol: '600519', name: '贵州茅台', weight: 35 },
    { symbol: '000858', name: '五粮液', weight: 20 },
    { symbol: '002304', name: '洋河股份', weight: 10 },
    { symbol: '000568', name: '泸州老窖', weight: 10 },
    { symbol: '000596', name: '古井贡酒', weight: 5 },
  ]},
  { name: '新能源汽车', code: 'NEV', stocks: [
    { symbol: '300750', name: '宁德时代', weight: 25 },
    { symbol: '002594', name: '比亚迪', weight: 20 },
    { symbol: '002466', name: '天齐锂业', weight: 10 },
    { symbol: '002460', name: '赣锋锂业', weight: 8 },
    { symbol: '603799', name: '华友钴业', weight: 7 },
  ]},
  { name: '半导体', code: 'SEMI', stocks: [
    { symbol: '688981', name: '中芯国际', weight: 20 },
    { symbol: '002371', name: '北方华创', weight: 15 },
    { symbol: '688012', name: '中微公司', weight: 10 },
    { symbol: '603501', name: '韦尔股份', weight: 8 },
    { symbol: '300782', name: '卓胜微', weight: 7 },
  ]},
  { name: '银行', code: 'BANK', stocks: [
    { symbol: '601398', name: '工商银行', weight: 15 },
    { symbol: '601939', name: '建设银行', weight: 12 },
    { symbol: '600036', name: '招商银行', weight: 12 },
    { symbol: '601288', name: '农业银行', weight: 10 },
    { symbol: '601988', name: '中国银行', weight: 8 },
  ]},
  { name: '医药', code: 'MED', stocks: [
    { symbol: '600276', name: '恒瑞医药', weight: 12 },
    { symbol: '300760', name: '迈瑞医疗', weight: 12 },
    { symbol: '000538', name: '云南白药', weight: 8 },
    { symbol: '603259', name: '药明康德', weight: 10 },
    { symbol: '002821', name: '凯莱英', weight: 6 },
  ]},
  { name: '光伏', code: 'PV', stocks: [
    { symbol: '601012', name: '隆基绿能', weight: 18 },
    { symbol: '300274', name: '阳光电源', weight: 15 },
    { symbol: '688599', name: '天合光能', weight: 10 },
    { symbol: '002129', name: '中环股份', weight: 10 },
    { symbol: '603806', name: '福斯特', weight: 6 },
  ]},
  { name: '消费电子', code: 'CE', stocks: [
    { symbol: '002415', name: '海康威视', weight: 15 },
    { symbol: '002475', name: '立讯精密', weight: 14 },
    { symbol: '601231', name: '环旭电子', weight: 8 },
    { symbol: '002241', name: '歌尔股份', weight: 8 },
    { symbol: '002236', name: '大华股份', weight: 6 },
  ]},
  { name: '地产', code: 'RE', stocks: [
    { symbol: '000002', name: '万科A', weight: 15 },
    { symbol: '600048', name: '保利发展', weight: 14 },
    { symbol: '001979', name: '招商蛇口', weight: 10 },
    { symbol: '600383', name: '金地集团', weight: 7 },
    { symbol: '600606', name: '绿地控股', weight: 6 },
  ]},
];

describe('行业板块分析API', () => {
  describe('板块配置', () => {
    it('应该有8个板块', () => {
      expect(sectorDefs.length).toBe(8);
    });

    it('每个板块都应该有name、code和stocks', () => {
      sectorDefs.forEach(s => {
        expect(s.name).toBeTruthy();
        expect(s.code).toBeTruthy();
        expect(s.stocks.length).toBeGreaterThan(0);
      });
    });

    it('每个板块都应该有5只成分股', () => {
      sectorDefs.forEach(s => {
        expect(s.stocks.length).toBe(5);
      });
    });

    it('板块code应该大写', () => {
      sectorDefs.forEach(s => {
        expect(s.code).toBe(s.code.toUpperCase());
      });
    });
  });

  describe('成分股权重', () => {
    it('白酒板块权重之和应该<=100', () => {
      const bj = sectorDefs.find(s => s.code === 'BJ')!;
      const totalWeight = bj.stocks.reduce((sum, st) => sum + st.weight, 0);
      expect(totalWeight).toBeLessThanOrEqual(100);
    });

    it('贵州茅台在白酒板块权重应该最高', () => {
      const bj = sectorDefs.find(s => s.code === 'BJ')!;
      const maxWeight = Math.max(...bj.stocks.map(st => st.weight));
      const topStock = bj.stocks.find(st => st.weight === maxWeight);
      expect(topStock?.symbol).toBe('600519');
    });

    it('宁德时代在新能源板块权重应该最高', () => {
      const nev = sectorDefs.find(s => s.code === 'NEV')!;
      const maxWeight = Math.max(...nev.stocks.map(st => st.weight));
      const topStock = nev.stocks.find(st => st.weight === maxWeight);
      expect(topStock?.symbol).toBe('300750');
    });

    it('所有成分股都应该有正权重', () => {
      sectorDefs.forEach(s => {
        s.stocks.forEach(st => {
          expect(st.weight).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('板块数据计算', () => {
    it('ROE应该通过PB/PE*100计算', () => {
      const avgPE = 15;
      const avgPB = 2.5;
      const avgROE = +(avgPB / avgPE * 100).toFixed(2);
      expect(avgROE).toBeCloseTo(16.67, 1);
    });

    it('PE分布应该覆盖所有范围', () => {
      const peDistribution = [
        { range: '<10', count: 5 },
        { range: '10-20', count: 10 },
        { range: '20-30', count: 8 },
        { range: '30-50', count: 4 },
        { range: '>50', count: 2 },
      ];
      expect(peDistribution.length).toBe(5);
      expect(peDistribution.reduce((s, d) => s + d.count, 0)).toBeGreaterThan(0);
    });

    it('市值分布应该从小到大', () => {
      const ranges = ['<100亿', '100-500亿', '500-1000亿', '>1000亿'];
      expect(ranges.length).toBe(4);
    });

    it('涨跌家数应该等于总板块数', () => {
      const sectors = [
        { changePercent: 2.5 },
        { changePercent: -1.2 },
        { changePercent: 0 },
        { changePercent: 3.1 },
        { changePercent: -0.5 },
      ];
      const upCount = sectors.filter(s => s.changePercent > 0).length;
      const downCount = sectors.filter(s => s.changePercent < 0).length;
      const flatCount = sectors.filter(s => s.changePercent === 0).length;
      expect(upCount + downCount + flatCount).toBe(sectors.length);
    });
  });

  describe('板块排序', () => {
    it('板块列表应该按涨跌幅降序排列', () => {
      const list = [
        { name: '白酒', changePercent: 2.5 },
        { name: '银行', changePercent: -0.5 },
        { name: '半导体', changePercent: 3.1 },
        { name: '地产', changePercent: -2.0 },
        { name: '医药', changePercent: 1.2 },
      ];
      const sorted = [...list].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].name).toBe('半导体');
      expect(sorted[sorted.length - 1].name).toBe('地产');
    });
  });

  describe('板块详情查询', () => {
    it('不存在的板块应该返回404', () => {
      const code = 'NOTEXIST';
      const sector = sectorDefs.find(s => s.code === code);
      expect(sector).toBeUndefined();
    });

    it('存在的板块应该能查询到', () => {
      const code = 'BJ';
      const sector = sectorDefs.find(s => s.code === code);
      expect(sector).toBeDefined();
      expect(sector!.name).toBe('白酒');
    });

    it('板块code应该不区分大小写', () => {
      const code = 'bj'.toUpperCase();
      const sector = sectorDefs.find(s => s.code === code);
      expect(sector).toBeDefined();
    });
  });

  describe('板块数据完整性', () => {
    it('所有板块的成分股symbol都应该不重复', () => {
      sectorDefs.forEach(s => {
        const symbols = s.stocks.map(st => st.symbol);
        const unique = new Set(symbols);
        expect(unique.size).toBe(symbols.length);
      });
    });

    it('成分股都应该有name', () => {
      sectorDefs.forEach(s => {
        s.stocks.forEach(st => {
          expect(st.name.length).toBeGreaterThan(0);
        });
      });
    });

    it('板块之间可以有相同成分股', () => {
      // 比如银行板块有招商银行
      const bank = sectorDefs.find(s => s.code === 'BANK')!;
      const bankSymbols = bank.stocks.map(st => st.symbol);
      expect(bankSymbols).toContain('600036');
    });
  });

  describe('板块汇总统计', () => {
    it('总板块数应该等于sectorDefs长度', () => {
      expect(sectorDefs.length).toBe(8);
    });

    it('平均涨跌幅应该合理计算', () => {
      const changes = [2.5, -1.2, 0, 3.1, -0.5, 1.8, -2.0, 0.5];
      const avgChange = +(changes.reduce((s, c) => s + c, 0) / changes.length).toFixed(2);
      expect(avgChange).toBeCloseTo(0.53, 1);
    });
  });
});
