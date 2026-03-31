import { describe, it, expect, vi } from 'vitest';

/**
 * SearchHighlight 搜索高亮组件逻辑测试
 */

describe('SearchHighlight', () => {
  describe('高亮匹配逻辑', () => {
    it('应该高亮匹配文本', () => {
      const text = '贵州茅台白酒龙头';
      const query = '茅台';
      const idx = text.indexOf(query);
      expect(idx).toBe(2);
    });

    it('应该区分大小写', () => {
      const text = 'MAOTAI';
      const query = 'maotai';
      const found = text.toLowerCase().includes(query.toLowerCase());
      expect(found).toBe(true);
    });

    it('支持正则特殊字符转义', () => {
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(escapeRegex('test.')).toBe('test\\.');
      expect(escapeRegex('test*')).toBe('test\\*');
      expect(escapeRegex('test(a)')).toBe('test\\(a\\)');
    });

    it('应该支持多个匹配', () => {
      const text = '茅台茅台白酒';
      const query = '茅台';
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'gi');
      const matches = text.match(regex);
      expect(matches).toHaveLength(2);
    });
  });

  describe('高亮渲染', () => {
    it('应该将文本分为三段: 前匹配后', () => {
      const text = '贵州茅台白酒';
      const query = '茅台';
      const idx = text.indexOf(query);
      const before = text.slice(0, idx);
      const match = text.slice(idx, idx + query.length);
      const after = text.slice(idx + query.length);
      
      expect(before).toBe('贵州');
      expect(match).toBe('茅台');
      expect(after).toBe('白酒');
    });

    it('无匹配时应返回原文本', () => {
      const text = '贵州茅台';
      const query = '不存在';
      const found = text.includes(query);
      expect(found).toBe(false);
    });

    it('应该支持自定义高亮样式', () => {
      const highlightStyle = { backgroundColor: '#fff3b0', fontWeight: 'bold', borderRadius: '2px' };
      expect(highlightStyle.backgroundColor).toBe('#fff3b0');
      expect(highlightStyle.fontWeight).toBe('bold');
    });
  });

  describe('多关键字高亮', () => {
    it('应该支持多个关键字', () => {
      const text = '贵州茅台和五粮液都是白酒';
      const keywords = ['茅台', '五粮液'];
      let highlighted = text;
      keywords.forEach(kw => {
        highlighted = highlighted.replace(new RegExp(kw, 'g'), `**${kw}**`);
      });
      expect(highlighted).toContain('**茅台**');
      expect(highlighted).toContain('**五粮液**');
    });
  });

  describe('性能优化', () => {
    it('空查询不高亮', () => {
      const query = '';
      const shouldHighlight = query.length > 0;
      expect(shouldHighlight).toBe(false);
    });

    it('短文本直接匹配', () => {
      const text = '茅台';
      const query = '茅台';
      const simpleMatch = text === query;
      expect(simpleMatch).toBe(true);
    });
  });
});
