import { describe, it, expect } from 'vitest';
import { analyzeMarketProfile, MarketProfileData, PriceLevel } from '../utils/marketProfileEngine';

describe('市场画像引擎', () => {
  const priceLevels: PriceLevel[] = [
    { price: 10.0, volume: 500, tpoCount: 10, buyVolume: 200, sellVolume: 300 },
    { price: 10.1, volume: 800, tpoCount: 15, buyVolume: 400, sellVolume: 400 },
    { price: 10.2, volume: 2000, tpoCount: 20, buyVolume: 1100, sellVolume: 900 },
    { price: 10.3, volume: 3000, tpoCount: 25, buyVolume: 1600, sellVolume: 1400 },
    { price: 10.4, volume: 5000, tpoCount: 30, buyVolume: 2800, sellVolume: 2200 }, // POC
    { price: 10.5, volume: 3500, tpoCount: 28, buyVolume: 1900, sellVolume: 1600 },
    { price: 10.6, volume: 2500, tpoCount: 22, buyVolume: 1200, sellVolume: 1300 },
    { price: 10.7, volume: 1500, tpoCount: 15, buyVolume: 700, sellVolume: 800 },
    { price: 10.8, volume: 800, tpoCount: 10, buyVolume: 300, sellVolume: 500 },
    { price: 10.9, volume: 400, tpoCount: 5, buyVolume: 150, sellVolume: 250 },
  ];

  const data: MarketProfileData = {
    symbol: 'TEST',
    date: '2024-03-15',
    priceLevels,
    open: 10.3,
    high: 10.9,
    low: 10.0,
    close: 10.5,
  };

  it('应该计算POC', () => {
    const result = analyzeMarketProfile(data);
    expect(result.valueArea.poc).toBe(10.4);
  });

  it('应该计算价值区域', () => {
    const result = analyzeMarketProfile(data);
    expect(result.valueArea.vah).toBeGreaterThan(result.valueArea.poc);
    expect(result.valueArea.val).toBeLessThan(result.valueArea.poc);
  });

  it('应该判断开盘类型', () => {
    const result = analyzeMarketProfile(data);
    expect(['open_drive', 'open_test_drive', 'open_rejection', 'open_auction', 'unknown']).toContain(result.openType.type);
  });

  it('应该分类轮廓类型', () => {
    const result = analyzeMarketProfile(data);
    expect(['b', 'b_shape', 'p_shape', 'd_shape', 'poor', 'neutral']).toContain(result.profileType);
  });

  it('应该计算过剩', () => {
    const result = analyzeMarketProfile(data);
    expect(result.excessHigh).toBeGreaterThanOrEqual(0);
    expect(result.excessLow).toBeGreaterThanOrEqual(0);
  });

  it('应该分类成交量分布', () => {
    const result = analyzeMarketProfile(data);
    expect(['balanced', 'skewed_high', 'skewed_low', 'double_distribution']).toContain(result.volumeDistribution);
  });

  it('应该识别关键价位', () => {
    const result = analyzeMarketProfile(data);
    expect(result.keyLevels.length).toBeGreaterThan(0);
    expect(result.keyLevels).toContain(10.4); // POC
  });

  it('应该生成警报', () => {
    const extremeData: MarketProfileData = { ...data, close: 11.0 };
    const result = analyzeMarketProfile(extremeData);
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('空数据应抛出错误', () => {
    const emptyData: MarketProfileData = { ...data, priceLevels: [] };
    expect(() => analyzeMarketProfile(emptyData)).toThrow();
  });

  it('价值区域占比应接近70%', () => {
    const result = analyzeMarketProfile(data);
    expect(result.valueArea.valueAreaPct).toBeGreaterThan(0.5);
  });
});
