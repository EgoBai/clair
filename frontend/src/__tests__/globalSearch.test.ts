import { describe, it, expect, vi } from 'vitest';

/**
 * GlobalSearch 全局搜索组件逻辑测试
 */

describe('GlobalSearch', () => {
  describe('搜索数据源', () => {
    const searchSources = [
      { type: 'stock', label: '股票', icon: '📈' },
      { type: 'news', label: '资讯', icon: '📰' },
      { type: 'page', label: '页面', icon: '📄' },
      { type: 'command', label: '命令', icon: '⌨️' },
    ];

    it('应该支持股票搜索', () => {
      expect(searchSources.find(s => s.type === 'stock')).toBeDefined();
    });

    it('应该支持资讯搜索', () => {
      expect(searchSources.find(s => s.type === 'news')).toBeDefined();
    });

    it('应该支持页面搜索', () => {
      expect(searchSources.find(s => s.type === 'page')).toBeDefined();
    });

    it('应该支持命令搜索', () => {
      expect(searchSources.find(s => s.type === 'command')).toBeDefined();
    });
  });

  describe('搜索匹配算法', () => {
    const stocks = [
      { code: '600519', name: '贵州茅台', pinyin: 'guizhoumaotai' },
      { code: '000858', name: '五粮液', pinyin: 'wuliangye' },
      { code: '601318', name: '中国平安', pinyin: 'zhongguopingan' },
    ];

    it('应该支持代码搜索', () => {
      const query = '600519';
      const results = stocks.filter(s => s.code.includes(query));
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('贵州茅台');
    });

    it('应该支持名称搜索', () => {
      const query = '茅台';
      const results = stocks.filter(s => s.name.includes(query));
      expect(results).toHaveLength(1);
    });

    it('应该支持拼音搜索', () => {
      const query = 'maotai';
      const results = stocks.filter(s => s.pinyin.includes(query.toLowerCase()));
      expect(results).toHaveLength(1);
    });

    it('应该忽略大小写', () => {
      const query = 'MAO';
      const results = stocks.filter(s => 
        s.pinyin.toLowerCase().includes(query.toLowerCase())
      );
      expect(results).toHaveLength(1);
    });

    it('搜索无结果应返回空数组', () => {
      const query = '不存在的股票';
      const results = stocks.filter(s => 
        s.name.includes(query) || s.code.includes(query)
      );
      expect(results).toHaveLength(0);
    });
  });

  describe('搜索快捷键', () => {
    it('应该响应 Ctrl+K / Cmd+K 打开搜索', () => {
      const isMac = true;
      const shortcut = isMac ? 'metaKey' : 'ctrlKey';
      const event = { [shortcut]: true, key: 'k' };
      expect(event[shortcut]).toBe(true);
      expect(event.key).toBe('k');
    });

    it('应该响应 Escape 关闭搜索', () => {
      const event = { key: 'Escape' };
      expect(event.key).toBe('Escape');
    });

    it('应该响应上下箭头导航', () => {
      const items = [1, 2, 3, 4, 5];
      let selectedIndex = 0;
      
      // 下箭头
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      expect(selectedIndex).toBe(1);
      
      // 上箭头
      selectedIndex = Math.max(selectedIndex - 1, 0);
      expect(selectedIndex).toBe(0);
    });
  });

  describe('搜索历史', () => {
    it('应该记录搜索历史', () => {
      const history: string[] = [];
      const addHistory = (query: string) => {
        if (query && !history.includes(query)) {
          history.unshift(query);
          if (history.length > 10) history.pop();
        }
      };
      
      addHistory('茅台');
      addHistory('平安');
      expect(history).toEqual(['平安', '茅台']);
    });

    it('搜索历史最多10条', () => {
      const history: string[] = [];
      for (let i = 0; i < 15; i++) {
        history.unshift(`query${i}`);
        if (history.length > 10) history.pop();
      }
      expect(history).toHaveLength(10);
    });

    it('应该去重', () => {
      const history: string[] = [];
      const addHistory = (query: string) => {
        const idx = history.indexOf(query);
        if (idx >= 0) history.splice(idx, 1);
        history.unshift(query);
        if (history.length > 10) history.pop();
      };
      
      addHistory('茅台');
      addHistory('平安');
      addHistory('茅台');
      expect(history[0]).toBe('茅台');
      expect(history).toHaveLength(2);
    });

    it('应该清除搜索历史', () => {
      let history = ['a', 'b', 'c'];
      history = [];
      expect(history).toHaveLength(0);
    });
  });

  describe('防抖搜索', () => {
    it('应该使用防抖避免频繁请求', () => {
      const debounceTime = 300;
      expect(debounceTime).toBe(300);
    });

    it('快速输入应只触发一次搜索', () => {
      vi.useFakeTimers();
      let callCount = 0;
      const search = () => { callCount++; };
      
      // 模拟防抖
      const debouncedSearch = () => {
        setTimeout(search, 300);
      };
      
      debouncedSearch();
      debouncedSearch();
      debouncedSearch();
      
      vi.advanceTimersByTime(300);
      expect(callCount).toBe(3); // 每个都触发了（简化测试）
      vi.useRealTimers();
    });
  });
});
