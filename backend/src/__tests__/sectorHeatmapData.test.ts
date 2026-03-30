import { describe, it, expect } from 'vitest';

// 行业热力图数据处理测试
describe('Sector Heatmap Data Processing', () => {
  const sectors = [
    { name: '白酒', change: 3.5, stocks: 20, up: 15, down: 5, volume: 50000000000 },
    { name: '新能源', change: -2.1, stocks: 35, up: 8, down: 27, volume: 80000000000 },
    { name: '半导体', change: 1.2, stocks: 25, up: 18, down: 7, volume: 60000000000 },
    { name: '银行', change: -0.5, stocks: 30, up: 12, down: 18, volume: 40000000000 },
    { name: '医药', change: 0.8, stocks: 40, up: 22, down: 18, volume: 55000000000 },
    { name: '消费电子', change: -1.5, stocks: 18, up: 5, down: 13, volume: 30000000000 },
    { name: '光伏', change: 4.2, stocks: 15, up: 14, down: 1, volume: 45000000000 },
    { name: '地产', change: -3.8, stocks: 22, up: 2, down: 20, volume: 25000000000 },
    { name: '汽车', change: 2.0, stocks: 28, up: 20, down: 8, volume: 70000000000 },
    { name: '军工', change: 0.3, stocks: 16, up: 9, down: 7, volume: 35000000000 },
  ];

  // 排序逻辑
  describe('Sector Sorting', () => {
    it('should sort sectors by change descending', () => {
      const sorted = [...sectors].sort((a, b) => b.change - a.change);
      expect(sorted[0].name).toBe('光伏');
      expect(sorted[sorted.length - 1].name).toBe('地产');
    });

    it('should sort sectors by change ascending', () => {
      const sorted = [...sectors].sort((a, b) => a.change - b.change);
      expect(sorted[0].name).toBe('地产');
    });

    it('should sort sectors by volume descending', () => {
      const sorted = [...sectors].sort((a, b) => b.volume - a.volume);
      expect(sorted[0].name).toBe('新能源');
    });
  });

  // 涨跌家数统计
  describe('Up/Down Count Statistics', () => {
    it('should calculate total up stocks', () => {
      const totalUp = sectors.reduce((sum, s) => sum + s.up, 0);
      expect(totalUp).toBe(125);
    });

    it('should calculate total down stocks', () => {
      const totalDown = sectors.reduce((sum, s) => sum + s.down, 0);
      expect(totalDown).toBe(124);
    });

    it('should calculate up ratio', () => {
      const totalUp = sectors.reduce((sum, s) => sum + s.up, 0);
      const totalDown = sectors.reduce((sum, s) => sum + s.down, 0);
      const ratio = totalUp / (totalUp + totalDown);
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(0.6);
    });

    it('should identify sector with most up stocks', () => {
      const maxUp = sectors.reduce((max, s) => s.up > max.up ? s : max);
      expect(maxUp.name).toBe('医药');
    });
  });

  // 热力图颜色映射
  describe('Heatmap Color Mapping', () => {
    const getColor = (change: number): string => {
      if (change > 3) return '#ff0000';
      if (change > 1) return '#ff4444';
      if (change > 0) return '#ff8888';
      if (change > -1) return '#88cc88';
      if (change > -3) return '#44aa44';
      return '#008800';
    };

    it('should return red for large positive change', () => {
      expect(getColor(5)).toBe('#ff0000');
    });

    it('should return medium red for moderate positive change', () => {
      expect(getColor(2)).toBe('#ff4444');
    });

    it('should return light red for small positive change', () => {
      expect(getColor(0.5)).toBe('#ff8888');
    });

    it('should return light green for small negative change', () => {
      expect(getColor(-0.5)).toBe('#88cc88');
    });

    it('should return dark green for large negative change', () => {
      expect(getColor(-5)).toBe('#008800');
    });
  });

  // 成交额格式化
  describe('Volume Formatting', () => {
    const formatVolume = (vol: number): string => {
      if (vol >= 1e12) return `${(vol / 1e12).toFixed(1)}万亿`;
      if (vol >= 1e8) return `${(vol / 1e8).toFixed(1)}亿`;
      if (vol >= 1e4) return `${(vol / 1e4).toFixed(0)}万`;
      return vol.toString();
    };

    it('should format large volume in 万亿', () => {
      expect(formatVolume(1.5e12)).toBe('1.5万亿');
    });

    it('should format medium volume in 亿', () => {
      expect(formatVolume(5e10)).toBe('500.0亿');
    });

    it('should format small volume in 万', () => {
      expect(formatVolume(50000)).toBe('5万');
    });

    it('should format tiny volume as is', () => {
      expect(formatVolume(500)).toBe('500');
    });
  });

  // 板块分类
  describe('Sector Classification', () => {
    const growthSectors = sectors.filter(s => s.change > 0);
    const declineSectors = sectors.filter(s => s.change < 0);

    it('should count growth sectors', () => {
      expect(growthSectors.length).toBe(6);
    });

    it('should count decline sectors', () => {
      expect(declineSectors.length).toBe(4);
    });

    it('should calculate average growth change', () => {
      const avgChange = growthSectors.reduce((sum, s) => sum + s.change, 0) / growthSectors.length;
      expect(avgChange).toBeGreaterThan(0);
    });
  });

  // 板块联动分析
  describe('Sector Correlation', () => {
    it('should detect correlated sectors (tech)', () => {
      const techRelated = ['半导体', '消费电子'];
      const techSectors = sectors.filter(s => techRelated.includes(s.name));
      const allPositive = techSectors.every(s => s.change > 0);
      expect(allPositive).toBe(false); // 消费电子下跌
    });

    it('should detect consumer sectors', () => {
      const consumerSectors = sectors.filter(s => ['白酒', '医药'].includes(s.name));
      expect(consumerSectors).toHaveLength(2);
      expect(consumerSectors.every(s => s.change > 0)).toBe(true);
    });
  });
});
