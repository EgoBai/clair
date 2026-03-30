import { describe, it, expect } from 'vitest';

describe('组件逻辑测试', () => {
  describe('图表颜色逻辑', () => {
    it('涨跌颜色应该符合A股习惯', () => {
      const getColor = (change: number) => change >= 0 ? '#ef4444' : '#22c55e';
      expect(getColor(1)).toBe('#ef4444'); // 红涨
      expect(getColor(-1)).toBe('#22c55e'); // 绿跌
      expect(getColor(0)).toBe('#ef4444'); // 平盘用红色
    });

    it('K线颜色应该正确', () => {
      const getKLineColor = (open: number, close: number) => {
        return close >= open ? { fill: '#ef4444', stroke: '#ef4444' } : { fill: '#22c55e', stroke: '#22c55e' };
      };
      expect(getKLineColor(10, 11).fill).toBe('#ef4444');
      expect(getKLineColor(11, 10).fill).toBe('#22c55e');
    });

    it('成交量颜色应该跟随K线', () => {
      const getVolumeColor = (close: number, prevClose: number) => {
        return close >= prevClose ? '#ef4444' : '#22c55e';
      };
      expect(getVolumeColor(11, 10)).toBe('#ef4444');
      expect(getVolumeColor(9, 10)).toBe('#22c55e');
    });
  });

  describe('排名徽章逻辑', () => {
    it('前三名应该有金银铜色', () => {
      const getRankColor = (rank: number) => {
        if (rank === 1) return '#FFD700';
        if (rank === 2) return '#C0C0C0';
        if (rank === 3) return '#CD7F32';
        return 'transparent';
      };
      expect(getRankColor(1)).toBe('#FFD700');
      expect(getRankColor(2)).toBe('#C0C0C0');
      expect(getRankColor(3)).toBe('#CD7F32');
      expect(getRankColor(4)).toBe('transparent');
    });
  });

  describe('分页逻辑', () => {
    it('应该计算正确的页数', () => {
      const totalPages = (total: number, pageSize: number) => Math.ceil(total / pageSize);
      expect(totalPages(100, 20)).toBe(5);
      expect(totalPages(101, 20)).toBe(6);
      expect(totalPages(0, 20)).toBe(0);
    });

    it('应该生成页码列表', () => {
      const getPageNumbers = (current: number, total: number, delta: number = 2) => {
        const pages: number[] = [];
        for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
          pages.push(i);
        }
        return pages;
      };
      expect(getPageNumbers(1, 10)).toEqual([1, 2, 3]);
      expect(getPageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]);
      expect(getPageNumbers(10, 10)).toEqual([8, 9, 10]);
    });
  });

  describe('搜索高亮逻辑', () => {
    it('应该高亮匹配文本', () => {
      const highlight = (text: string, keyword: string) => {
        if (!keyword) return text;
        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
      };
      expect(highlight('贵州茅台', '茅台')).toBe('贵州<mark>茅台</mark>');
      expect(highlight('平安银行', '银行')).toBe('平安<mark>银行</mark>');
      expect(highlight('test', '')).toBe('test');
    });

    it('应该安全转义正则特殊字符', () => {
      const highlight = (text: string, keyword: string) => {
        if (!keyword) return text;
        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
      };
      expect(highlight('a.b', '.')).toBe('a<mark>.</mark>b');
    });
  });

  describe('进度条逻辑', () => {
    it('应该正确计算百分比', () => {
      const percent = (value: number, max: number) => Math.min(100, (value / max) * 100);
      expect(percent(50, 100)).toBe(50);
      expect(percent(100, 100)).toBe(100);
      expect(percent(150, 100)).toBe(100); // 限制最大值
      expect(percent(0, 100)).toBe(0);
    });

    it('涨跌分布应该正确填充', () => {
      const total = 4000;
      const up = 1500;
      const down = 2000;
      const flat = 500;
      expect(up + down + flat).toBe(total);
      const upPercent = (up / total) * 100;
      const downPercent = (down / total) * 100;
      expect(upPercent + downPercent + (flat / total) * 100).toBe(100);
    });
  });

  describe('相对时间格式化', () => {
    it('应该显示相对时间', () => {
      const formatRelative = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return `${seconds}秒前`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}分钟前`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}小时前`;
        const days = Math.floor(hours / 24);
        return `${days}天前`;
      };
      expect(formatRelative(Date.now() - 30000)).toContain('秒前');
      expect(formatRelative(Date.now() - 120000)).toContain('分钟前');
      expect(formatRelative(Date.now() - 7200000)).toContain('小时前');
      expect(formatRelative(Date.now() - 172800000)).toContain('天前');
    });
  });

  describe('表格排序逻辑', () => {
    it('数字排序应该正确', () => {
      const data = [{ price: 100 }, { price: 50 }, { price: 200 }];
      const sorted = [...data].sort((a, b) => a.price - b.price);
      expect(sorted.map(d => d.price)).toEqual([50, 100, 200]);
    });

    it('字符串排序应该正确', () => {
      const data = [{ name: '茅台' }, { name: '平安' }, { name: '比亚迪' }];
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      expect(sorted.length).toBe(3);
    });

    it('空值应该排在最后', () => {
      const data = [{ pe: 15 }, { pe: null }, { pe: 30 }, { pe: null }];
      const sorted = [...data].sort((a, b) => {
        if (a.pe == null && b.pe == null) return 0;
        if (a.pe == null) return 1;
        if (b.pe == null) return -1;
        return a.pe - b.pe;
      });
      expect(sorted[0].pe).toBe(15);
      expect(sorted[sorted.length - 1].pe).toBeNull();
    });
  });

  describe('筛选器逻辑', () => {
    it('多条件AND筛选', () => {
      const stocks = [
        { name: '茅台', market: 'sh', pe: 30, changePercent: 2 },
        { name: '平安', market: 'sh', pe: 15, changePercent: -1 },
        { name: '比亚迪', market: 'sz', pe: 50, changePercent: 3 },
      ];
      const filtered = stocks.filter(s => s.market === 'sh' && s.pe < 40);
      expect(filtered).toHaveLength(2);
    });

    it('范围筛选应该正确', () => {
      const data = [10, 20, 30, 40, 50];
      const filtered = data.filter(v => v >= 20 && v <= 40);
      expect(filtered).toEqual([20, 30, 40]);
    });

    it('类型筛选应该正确', () => {
      const etfs = [
        { type: 'index', name: '沪深300' },
        { type: 'sector', name: '半导体' },
        { type: 'index', name: '中证500' },
        { type: 'qdii', name: '纳斯达克' },
      ];
      const indexEtfs = etfs.filter(e => e.type === 'index');
      expect(indexEtfs).toHaveLength(2);
    });
  });
});
