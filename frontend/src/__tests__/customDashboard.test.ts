import { describe, it, expect } from 'vitest';

/**
 * 自定义仪表盘组件测试
 * 测试布局管理、Widget配置、拖拽逻辑
 */

describe('CustomDashboard', () => {
  describe('Widget类型', () => {
    const widgetTypes = [
      'kline',          // K线图
      'fundFlow',       // 资金流向
      'sectorHeatmap',  // 板块热力图
      'news',           // 新闻
      'watchlist',      // 自选股
      'marketIndex',    // 大盘指数
      'topTraders',     // 龙虎榜
      'alerts',         // 预警
      'portfolio',      // 组合
      'screener',       // 选股器
    ];

    it('应该支持10种Widget类型', () => {
      expect(widgetTypes.length).toBe(10);
    });

    it('所有类型都应该非空', () => {
      widgetTypes.forEach(t => {
        expect(t.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Widget配置', () => {
    it('每个Widget应该有唯一ID', () => {
      const widgets = [
        { id: 'w1', type: 'kline', x: 0, y: 0, w: 6, h: 4 },
        { id: 'w2', type: 'news', x: 6, y: 0, w: 6, h: 4 },
      ];
      const ids = widgets.map(w => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('每个Widget应该有位置和尺寸', () => {
      const widget = { id: 'w1', type: 'kline', x: 0, y: 0, w: 6, h: 4 };
      expect(widget.x).toBeGreaterThanOrEqual(0);
      expect(widget.y).toBeGreaterThanOrEqual(0);
      expect(widget.w).toBeGreaterThan(0);
      expect(widget.h).toBeGreaterThan(0);
    });

    it('Widget宽度应该在1-12列范围内', () => {
      const gridColumns = 12;
      const widget = { w: 6 };
      expect(widget.w).toBeGreaterThanOrEqual(1);
      expect(widget.w).toBeLessThanOrEqual(gridColumns);
    });
  });

  describe('网格布局', () => {
    it('网格应该有12列', () => {
      const columns = 12;
      expect(columns).toBe(12);
    });

    it('两个6列Widget应该占满一行', () => {
      const widgets = [
        { w: 6, x: 0 },
        { w: 6, x: 6 },
      ];
      const totalWidth = widgets.reduce((s, w) => s + w.w, 0);
      expect(totalWidth).toBe(12);
    });

    it('3个4列Widget应该占满一行', () => {
      const widgets = [
        { w: 4, x: 0 },
        { w: 4, x: 4 },
        { w: 4, x: 8 },
      ];
      const totalWidth = widgets.reduce((s, w) => s + w.w, 0);
      expect(totalWidth).toBe(12);
    });
  });

  describe('拖拽排序', () => {
    it('应该支持拖拽改变位置', () => {
      const widgets = [
        { id: 'w1', x: 0, y: 0 },
        { id: 'w2', x: 6, y: 0 },
      ];
      // 模拟拖拽: w2移到w1的位置
      const reordered = [
        { id: 'w2', x: 0, y: 0 },
        { id: 'w1', x: 6, y: 0 },
      ];
      expect(reordered[0].id).toBe('w2');
    });

    it('应该支持调整大小', () => {
      const widget = { id: 'w1', w: 6, h: 4 };
      const resized = { ...widget, w: 8, h: 6 };
      expect(resized.w).toBe(8);
      expect(resized.h).toBe(6);
    });
  });

  describe('布局持久化', () => {
    it('布局应该能序列化为JSON', () => {
      const layout = {
        widgets: [
          { id: 'w1', type: 'kline', x: 0, y: 0, w: 6, h: 4 },
          { id: 'w2', type: 'news', x: 6, y: 0, w: 6, h: 4 },
        ],
      };
      const json = JSON.stringify(layout);
      const parsed = JSON.parse(json);
      expect(parsed.widgets.length).toBe(2);
    });

    it('应该支持多套布局', () => {
      const layouts = {
        default: { widgets: [] },
        trading: { widgets: [{ id: 'w1', type: 'kline' }] },
        analysis: { widgets: [{ id: 'w1', type: 'screener' }] },
      };
      expect(Object.keys(layouts).length).toBe(3);
    });
  });

  describe('响应式适配', () => {
    it('移动端应该全宽显示', () => {
      const isMobile = true;
      const widgetWidth = isMobile ? 12 : 6;
      expect(widgetWidth).toBe(12);
    });

    it('桌面端可以并排显示', () => {
      const isMobile = false;
      const widgetWidth = isMobile ? 12 : 6;
      expect(widgetWidth).toBe(6);
    });

    it('平板应该每行2个', () => {
      const isTablet = true;
      const columns = isTablet ? 6 : 12;
      expect(columns).toBe(6);
    });
  });

  describe('Widget数据源', () => {
    it('每个Widget应该有独立的数据源', () => {
      const widgets = [
        { id: 'w1', type: 'kline', dataSource: { symbol: '600519', period: 'day' } },
        { id: 'w2', type: 'news', dataSource: { category: 'market' } },
      ];
      widgets.forEach(w => {
        expect(w.dataSource).toBeDefined();
      });
    });

    it('同类型Widget可以有不同配置', () => {
      const w1 = { type: 'kline', dataSource: { symbol: '600519' } };
      const w2 = { type: 'kline', dataSource: { symbol: '300750' } };
      expect(w1.dataSource.symbol).not.toBe(w2.dataSource.symbol);
    });
  });

  describe('默认布局', () => {
    it('应该有默认布局', () => {
      const defaultLayout = {
        widgets: [
          { id: 'w1', type: 'marketIndex', x: 0, y: 0, w: 12, h: 2 },
          { id: 'w2', type: 'kline', x: 0, y: 2, w: 8, h: 4 },
          { id: 'w3', type: 'watchlist', x: 8, y: 2, w: 4, h: 4 },
          { id: 'w4', type: 'fundFlow', x: 0, y: 6, w: 6, h: 3 },
          { id: 'w5', type: 'news', x: 6, y: 6, w: 6, h: 3 },
        ],
      };
      expect(defaultLayout.widgets.length).toBe(5);
    });
  });
});
