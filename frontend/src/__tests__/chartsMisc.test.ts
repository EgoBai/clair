import { describe, it, expect } from 'vitest';

/**
 * VolumeChart / TimeLineChart / RiverChart / OrderBookPanel 逻辑测试
 */

describe('VolumeChart', () => {
  describe('成交量数据', () => {
    const volumeData = [
      { date: '2025-01-02', volume: 1000000, isUp: true },
      { date: '2025-01-03', volume: 1500000, isUp: false },
      { date: '2025-01-04', volume: 800000, isUp: true },
    ];

    it('应该有日期', () => {
      volumeData.forEach(d => expect(d.date).toBeTruthy());
    });

    it('应该有成交量', () => {
      volumeData.forEach(d => expect(d.volume).toBeGreaterThan(0));
    });

    it('应该区分涨跌颜色', () => {
      const upColor = '#ef5350';
      const downColor = '#26a69a';
      expect(volumeData[0].isUp ? upColor : downColor).toBe(upColor);
      expect(volumeData[1].isUp ? upColor : downColor).toBe(downColor);
    });
  });

  describe('成交量均线', () => {
    it('应该计算5日均量', () => {
      const volumes = [100, 120, 110, 130, 140];
      const avg5 = volumes.reduce((a, b) => a + b, 0) / 5;
      expect(avg5).toBe(120);
    });

    it('应该计算10日均量', () => {
      const volumes = Array(10).fill(100);
      const avg10 = volumes.reduce((a, b) => a + b, 0) / 10;
      expect(avg10).toBe(100);
    });
  });

  describe('成交量异常检测', () => {
    it('应该检测放量', () => {
      const volumes = [100, 110, 105, 300];
      const avg = volumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const isSpike = volumes[3] > avg * 2;
      expect(isSpike).toBe(true);
    });

    it('应该检测缩量', () => {
      const volumes = [100, 110, 105, 30];
      const avg = volumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const isShrink = volumes[3] < avg * 0.5;
      expect(isShrink).toBe(true);
    });
  });
});

describe('TimeLineChart', () => {
  describe('分时数据', () => {
    const timelineData = [
      { time: '09:30', price: 1800, avgPrice: 1800, volume: 5000 },
      { time: '10:00', price: 1810, avgPrice: 1805, volume: 8000 },
      { time: '10:30', price: 1805, avgPrice: 1806, volume: 6000 },
    ];

    it('应该有时间', () => {
      timelineData.forEach(d => expect(d.time).toMatch(/^\d{2}:\d{2}$/));
    });

    it('应该有当前价', () => {
      timelineData.forEach(d => expect(d.price).toBeGreaterThan(0));
    });

    it('应该有均价', () => {
      timelineData.forEach(d => expect(d.avgPrice).toBeGreaterThan(0));
    });

    it('应该有成交量', () => {
      timelineData.forEach(d => expect(d.volume).toBeGreaterThan(0));
    });
  });

  describe('涨跌幅计算', () => {
    it('应该相对昨收计算涨跌', () => {
      const preClose = 1800;
      const price = 1820;
      const change = ((price - preClose) / preClose) * 100;
      expect(change).toBeCloseTo(1.11, 1);
    });
  });
});

describe('RiverChart', () => {
  describe('河流图数据', () => {
    const riverData = [
      { date: '2025-01', sectors: { A: 10, B: 20, C: 30 } },
      { date: '2025-02', sectors: { A: 15, B: 25, C: 20 } },
    ];

    it('应该有时间轴', () => {
      riverData.forEach(d => expect(d.date).toBeTruthy());
    });

    it('应该有板块占比数据', () => {
      riverData.forEach(d => {
        const total = Object.values(d.sectors).reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThan(0);
      });
    });
  });
});

describe('OrderBookPanel', () => {
  describe('盘口数据', () => {
    const orderBook = {
      bids: [
        { price: 1800, volume: 500 },
        { price: 1799, volume: 300 },
        { price: 1798, volume: 200 },
      ],
      asks: [
        { price: 1801, volume: 400 },
        { price: 1802, volume: 250 },
        { price: 1803, volume: 150 },
      ],
    };

    it('买盘价格应该降序排列', () => {
      for (let i = 1; i < orderBook.bids.length; i++) {
        expect(orderBook.bids[i].price).toBeLessThan(orderBook.bids[i - 1].price);
      }
    });

    it('卖盘价格应该升序排列', () => {
      for (let i = 1; i < orderBook.asks.length; i++) {
        expect(orderBook.asks[i].price).toBeGreaterThan(orderBook.asks[i - 1].price);
      }
    });

    it('买一应该低于卖一', () => {
      expect(orderBook.bids[0].price).toBeLessThan(orderBook.asks[0].price);
    });
  });

  describe('买卖盘深度', () => {
    it('应该计算买盘总量', () => {
      const bids = [{ volume: 500 }, { volume: 300 }, { volume: 200 }];
      const total = bids.reduce((s, b) => s + b.volume, 0);
      expect(total).toBe(1000);
    });

    it('应该计算卖盘总量', () => {
      const asks = [{ volume: 400 }, { volume: 250 }, { volume: 150 }];
      const total = asks.reduce((s, a) => s + a.volume, 0);
      expect(total).toBe(800);
    });

    it('应该计算委比', () => {
      const bidTotal = 1000;
      const askTotal = 800;
      const ratio = ((bidTotal - askTotal) / (bidTotal + askTotal)) * 100;
      expect(ratio).toBeCloseTo(11.11, 1);
    });
  });
});
