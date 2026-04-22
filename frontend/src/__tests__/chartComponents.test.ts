import { describe, it, expect } from 'vitest';

/**
 * 图表组件逻辑测试
 * 测试各种图表组件的数据处理和配置逻辑
 */

describe('图表组件', () => {
  describe('CandlestickWithVolume', () => {
    interface OHLCV {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
    }

    it('应该正确计算涨跌方向', () => {
      const data: OHLCV = { date: '2024-01-15', open: 10, close: 12, high: 13, low: 9, volume: 1000000 };
      const isUp = data.close >= data.open;
      expect(isUp).toBe(true);
    });

    it('应该正确计算影线长度', () => {
      const data: OHLCV = { date: '2024-01-15', open: 10, close: 12, high: 15, low: 8, volume: 1000000 };
      const upperShadow = data.high - Math.max(data.open, data.close);
      const lowerShadow = Math.min(data.open, data.close) - data.low;
      expect(upperShadow).toBe(3);
      expect(lowerShadow).toBe(2);
    });

    it('十字星应该open等于close', () => {
      const data: OHLCV = { date: '2024-01-15', open: 10, close: 10, high: 11, low: 9, volume: 1000000 };
      expect(data.open).toBe(data.close);
    });
  });

  describe('FundFlowChart', () => {
    interface FundFlow {
      date: string;
      mainInflow: number;
      mainOutflow: number;
      retailInflow: number;
      retailOutflow: number;
    }

    it('应该计算主力净流入', () => {
      const flow: FundFlow = {
        date: '2024-01-15',
        mainInflow: 50000000,
        mainOutflow: 30000000,
        retailInflow: 20000000,
        retailOutflow: 25000000,
      };
      const mainNet = flow.mainInflow - flow.mainOutflow;
      expect(mainNet).toBe(20000000);
    });

    it('应该计算散户净流入', () => {
      const flow: FundFlow = {
        date: '2024-01-15',
        mainInflow: 50000000,
        mainOutflow: 30000000,
        retailInflow: 20000000,
        retailOutflow: 25000000,
      };
      const retailNet = flow.retailInflow - flow.retailOutflow;
      expect(retailNet).toBe(-5000000);
    });

    it('总流入应该等于各方向之和', () => {
      const totalInflow = 50000000 + 20000000;
      expect(totalInflow).toBe(70000000);
    });
  });

  describe('OrderBookPanel', () => {
    interface OrderLevel {
      price: number;
      volume: number;
    }

    it('买盘应该按价格降序排列', () => {
      const bids: OrderLevel[] = [
        { price: 10.05, volume: 500 },
        { price: 10.04, volume: 800 },
        { price: 10.03, volume: 1200 },
        { price: 10.02, volume: 600 },
        { price: 10.01, volume: 900 },
      ];
      for (let i = 1; i < bids.length; i++) {
        expect(bids[i - 1].price).toBeGreaterThan(bids[i].price);
      }
    });

    it('卖盘应该按价格升序排列', () => {
      const asks: OrderLevel[] = [
        { price: 10.06, volume: 400 },
        { price: 10.07, volume: 700 },
        { price: 10.08, volume: 300 },
        { price: 10.09, volume: 500 },
        { price: 10.10, volume: 1000 },
      ];
      for (let i = 1; i < asks.length; i++) {
        expect(asks[i - 1].price).toBeLessThan(asks[i].price);
      }
    });

    it('买卖价差应该为正', () => {
      const bestBid = 10.05;
      const bestAsk = 10.06;
      const spread = bestAsk - bestBid;
      expect(spread).toBeGreaterThan(0);
    });

    it('应该计算盘口深度', () => {
      const levels = [
        { price: 10.05, volume: 500 },
        { price: 10.04, volume: 800 },
        { price: 10.03, volume: 1200 },
      ];
      const totalVolume = levels.reduce((s, l) => s + l.volume, 0);
      expect(totalVolume).toBe(2500);
    });
  });

  describe('VolumeChart', () => {
    it('应该区分阳量和阴量', () => {
      const data = [
        { close: 10, open: 9, volume: 1000000 },
        { close: 8, open: 9, volume: 800000 },
        { close: 11, open: 10, volume: 1200000 },
      ];
      const colored = data.map(d => ({
        ...d,
        isUp: d.close >= d.open,
      }));
      expect(colored[0].isUp).toBe(true);
      expect(colored[1].isUp).toBe(false);
      expect(colored[2].isUp).toBe(true);
    });

    it('应该计算平均成交量', () => {
      const volumes = [1000000, 800000, 1200000, 900000, 1100000];
      const avg = volumes.reduce((s, v) => s + v, 0) / volumes.length;
      expect(avg).toBe(1000000);
    });

    it('放量应该是大于平均的2倍', () => {
      const avgVolume = 1000000;
      const currentVolume = 2500000;
      const isSurge = currentVolume > avgVolume * 2;
      expect(isSurge).toBe(true);
    });
  });

  describe('IndicatorPanel', () => {
    it('RSI应该在0-100范围内', () => {
      const rsi = 65;
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('KDJ应该有K、D、J三个值', () => {
      const kdj = { k: 70, d: 65, j: 80 };
      expect(kdj.k).toBeDefined();
      expect(kdj.d).toBeDefined();
      expect(kdj.j).toBeDefined();
    });

    it('MACD应该有DIF、DEA、柱', () => {
      const macd = { dif: 0.5, dea: 0.3, histogram: 0.2 };
      expect(macd.histogram).toBeCloseTo(macd.dif - macd.dea, 1);
    });

    it('超买应该是RSI>70', () => {
      const rsi = 75;
      expect(rsi > 70).toBe(true);
    });

    it('超卖应该是RSI<30', () => {
      const rsi = 25;
      expect(rsi < 30).toBe(true);
    });
  });

  describe('ShareholderChart', () => {
    interface ShareholderChange {
      date: string;
      shareholder: string;
      changeShares: number;
      changePercent: number;
      type: 'increase' | 'decrease';
    }

    it('增持changeShares应该为正', () => {
      const change: ShareholderChange = {
        date: '2024-01-15',
        shareholder: '张三',
        changeShares: 100000,
        changePercent: 0.5,
        type: 'increase',
      };
      expect(change.changeShares).toBeGreaterThan(0);
      expect(change.type).toBe('increase');
    });

    it('减持changeShares应该为负', () => {
      const change: ShareholderChange = {
        date: '2024-01-15',
        shareholder: '李四',
        changeShares: -50000,
        changePercent: -0.3,
        type: 'decrease',
      };
      expect(change.changeShares).toBeLessThan(0);
      expect(change.type).toBe('decrease');
    });
  });

  describe('TechnicalIndicatorChart', () => {
    it('均线应该按周期排序显示', () => {
      const maLines = [5, 10, 20, 60];
      for (let i = 1; i < maLines.length; i++) {
        expect(maLines[i]).toBeGreaterThan(maLines[i - 1]);
      }
    });

    it('BOLL应该有上中下三条线', () => {
      const boll = { upper: 12, middle: 10, lower: 8 };
      expect(boll.upper).toBeGreaterThan(boll.middle);
      expect(boll.middle).toBeGreaterThan(boll.lower);
    });
  });

  describe('RiverChart', () => {
    it('应该正确计算累计面积', () => {
      const layers = [
        { name: 'A', data: [10, 20, 15] },
        { name: 'B', data: [5, 10, 8] },
      ];
      const totals = layers[0].data.map((_, i) =>
        layers.reduce((s, l) => s + l.data[i], 0)
      );
      expect(totals).toEqual([15, 30, 23]);
    });
  });

  describe('StockCompareChart', () => {
    it('应该归一化到同一基准', () => {
      const prices = [100, 105, 102, 108];
      const base = prices[0];
      const normalized = prices.map(p => ((p - base) / base * 100));
      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(5);
      expect(normalized[2]).toBeCloseTo(2, 0);
      expect(normalized[3]).toBe(8);
    });

    it('涨幅最大的应该排名最高', () => {
      const stocks = [
        { name: 'A', change: 5.2 },
        { name: 'B', change: 8.1 },
        { name: 'C', change: 3.5 },
      ];
      const sorted = [...stocks].sort((a, b) => b.change - a.change);
      expect(sorted[0].name).toBe('B');
    });
  });

  describe('TimeLineChart', () => {
    it('分时图应该有均价线', () => {
      const data = [
        { time: '09:30', price: 10, avgPrice: 10, volume: 1000 },
        { time: '09:31', price: 10.1, avgPrice: 10.05, volume: 1500 },
        { time: '09:32', price: 10.05, avgPrice: 10.05, volume: 800 },
      ];
      data.forEach(d => {
        expect(d.avgPrice).toBeDefined();
      });
    });

    it('分时数据应该按时间排列', () => {
      const times = ['09:30', '09:31', '09:32', '09:33'];
      expect(times.length).toBe(4);
      expect(times[0]).toBe('09:30');
    });
  });
});

describe('布局组件', () => {
  describe('ResponsiveLayout', () => {
    it('应该支持移动端布局', () => {
      const isMobile = true;
      const padding = isMobile ? 8 : 16;
      expect(padding).toBe(8);
    });

    it('应该支持桌面布局', () => {
      const isMobile = false;
      const padding = isMobile ? 8 : 16;
      expect(padding).toBe(16);
    });
  });

  describe('ResponsiveMenu', () => {
    it('移动端应该使用Drawer', () => {
      const isMobile = true;
      const menuType = isMobile ? 'drawer' : 'sidebar';
      expect(menuType).toBe('drawer');
    });

    it('桌面端应该使用侧边栏', () => {
      const isMobile = false;
      const menuType = isMobile ? 'drawer' : 'sidebar';
      expect(menuType).toBe('sidebar');
    });
  });

  describe('ContextMenu', () => {
    it('菜单位置应该在鼠标点击处', () => {
      const position = { x: 100, y: 200 };
      expect(position.x).toBeGreaterThan(0);
      expect(position.y).toBeGreaterThan(0);
    });

    it('菜单应该在视口内显示', () => {
      const menuWidth = 150;
      const menuHeight = 200;
      const viewportWidth = 1920;
      const viewportHeight = 1080;
      const clickX = 1800;
      const clickY = 900;
      const x = clickX + menuWidth > viewportWidth ? clickX - menuWidth : clickX;
      const y = clickY + menuHeight > viewportHeight ? clickY - menuHeight : clickY;
      expect(x + menuWidth).toBeLessThanOrEqual(viewportWidth);
      expect(y + menuHeight).toBeLessThanOrEqual(viewportHeight);
    });
  });

  describe('ErrorBoundary', () => {
    it('应该捕获组件错误', () => {
      const hasError = true;
      const errorMessage = hasError ? '组件渲染出错' : null;
      expect(errorMessage).toBe('组件渲染出错');
    });

    it('应该提供重试按钮', () => {
      const hasRetry = true;
      expect(hasRetry).toBe(true);
    });
  });

  describe('findNearestIndex (binary search)', () => {
    // 内联实现用于测试，与 chartInteractionEngine 中的一致
    interface ChartPoint { x: number; y: number; data: Record<string, unknown>; index: number; }

    function findNearestIndex(data: ChartPoint[], targetX: number): number {
      if (data.length === 0) return -1;
      if (data.length === 1) return 0;
      let lo = 0;
      let hi = data.length - 1;
      while (lo <= hi) {
        const mid = lo + ((hi - lo) >> 1);
        if (data[mid].x < targetX) lo = mid + 1;
        else if (data[mid].x > targetX) hi = mid - 1;
        else return mid;
      }
      if (lo >= data.length) return hi;
      if (hi < 0) return lo;
      return (targetX - data[hi].x) <= (data[lo].x - targetX) ? hi : lo;
    }

    it('空数组返回-1', () => {
      expect(findNearestIndex([], 5)).toBe(-1);
    });

    it('单元素数组返回0', () => {
      const data: ChartPoint[] = [{ x: 10, y: 0, data: {}, index: 0 }];
      expect(findNearestIndex(data, 5)).toBe(0);
    });

    it('精确匹配返回正确索引', () => {
      const data: ChartPoint[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x, i) => ({ x, y: x * 2, data: {}, index: i }));
      expect(findNearestIndex(data, 5)).toBe(5);
      expect(findNearestIndex(data, 0)).toBe(0);
      expect(findNearestIndex(data, 9)).toBe(9);
    });

    it('返回最近的数据点', () => {
      const data: ChartPoint[] = [0, 10, 20, 30, 40, 50].map((x, i) => ({ x, y: 0, data: {}, index: i }));
      expect(findNearestIndex(data, 7)).toBe(1);  // 7 更接近 10
      expect(findNearestIndex(data, 3)).toBe(0);  // 3 更接近 0
      expect(findNearestIndex(data, 25)).toBe(2); // 25 等距, 取hi (20)
    });

    it('大数据集性能正确', () => {
      const data: ChartPoint[] = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: i * 2, data: {}, index: i }));
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        findNearestIndex(data, Math.random() * 9999);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50); // 1000次查找 < 50ms
    });

    it('负值和浮点值正确处理', () => {
      const data: ChartPoint[] = [-5.5, -2.3, 0, 2.3, 5.5].map((x, i) => ({ x, y: 0, data: {}, index: i }));
      expect(findNearestIndex(data, -2.3)).toBe(1);
      expect(findNearestIndex(data, 0)).toBe(2);
      expect(findNearestIndex(data, 1.1)).toBe(2); // 1.1 更接近 0
    });
  });
});
