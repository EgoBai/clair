/**
 * SearchHighlight 组件测试
 * 搜索高亮展示: 正则匹配、多关键词、大小写敏感、边界条件
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchHighlight } from '../components/Common/SearchHighlight';

describe('SearchHighlight', () => {
  // === 基础功能 ===
  describe('basic functionality', () => {
    it('renders plain text when query is empty', () => {
      const { container } = render(<SearchHighlight text="Hello World" query="" />);
      expect(container.textContent).toBe('Hello World');
    });

    it('renders plain text when query is whitespace only', () => {
      const { container } = render(<SearchHighlight text="Hello World" query="   " />);
      expect(container.textContent).toBe('Hello World');
    });

    it('highlights matching substring', () => {
      const { container } = render(<SearchHighlight text="600519 贵州茅台" query="茅台" />);
      expect(container.textContent).toBe('600519 贵州茅台');
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('茅台');
    });

    it('highlights case-insensitively by default', () => {
      const { container } = render(<SearchHighlight text="Hello World" query="world" />);
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('World');
    });

    it('respects caseSensitive flag', () => {
      const { container } = render(
        <SearchHighlight text="Hello World" query="world" caseSensitive />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(0);
    });

    it('renders nothing when text is empty', () => {
      const { container } = render(<SearchHighlight text="" query="test" />);
      expect(container.textContent).toBe('');
    });
  });

  // === 多关键词高亮 ===
  describe('multi-keyword highlighting', () => {
    it('highlights multiple space-separated keywords', () => {
      const { container } = render(
        <SearchHighlight text="中国平安保险集团" query="平安 保险" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(2);
      expect(marks[0].textContent).toBe('平安');
      expect(marks[1].textContent).toBe('保险');
    });

    it('handles overlapping keyword matches correctly', () => {
      const { container } = render(
        <SearchHighlight text="ABCABC" query="AB ABC" />
      );
      // "ABC" matches "ABC", "AB" also matches; both patterns participate
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });

    it('sorts marks in order of appearance', () => {
      const { container } = render(
        <SearchHighlight text="A B C" query="B C" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(2);
      expect(marks[0].textContent).toBe('B');
      expect(marks[1].textContent).toBe('C');
    });
  });

  // === 正则安全 ===
  describe('regex safety', () => {
    it('handles regex-special characters in query safely', () => {
      const { container } = render(
        <SearchHighlight text="price[0] + (a+b)*c" query="[0] (a+b)" />
      );
      // Should not throw error
      expect(container.textContent).toBe('price[0] + (a+b)*c');
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it('handles query with dots safely', () => {
      const { container } = render(
        <SearchHighlight text="file.name.txt" query="name." />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('name.');
    });

    it('handles query with dollar sign safely', () => {
      const { container } = render(
        <SearchHighlight text="cost: $100" query="$100" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
    });
  });

  // === 股票搜索场景 ===
  describe('stock search scenarios', () => {
    it('highlights stock symbol', () => {
      const { container } = render(
        <SearchHighlight text="600519" query="600519" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('600519');
    });

    it('highlights partial stock code', () => {
      const { container } = render(
        <SearchHighlight text="000858 五粮液" query="858" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('858');
    });

    it('highlights Chinese stock name', () => {
      const { container } = render(
        <SearchHighlight text="贵州茅台 600519" query="贵州" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('贵州');
    });

    it('highlights multiple occurrences in stock info', () => {
      const { container } = render(
        <SearchHighlight text="茅台 贵州茅台 茅台酒" query="茅台" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(3);
    });

    it('handles stock name with mixed Chinese and English', () => {
      const { container } = render(
        <SearchHighlight text="BABA 阿里巴巴" query="BABA" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('BABA');
    });
  });

  // === 自定义样式 ===
  describe('custom highlight style', () => {
    it('applies custom highlight style', () => {
      const customStyle = { background: 'yellow', color: 'red', fontWeight: 'bold' as const };
      const { container } = render(
        <SearchHighlight text="test string" query="string" highlightStyle={customStyle} />
      );
      const mark = container.querySelector('mark');
      expect(mark?.style.background).toBe('yellow');
      expect(mark?.style.color).toBe('red');
      expect(mark?.style.fontWeight).toBe('bold');
    });

    it('uses default style when not specified', () => {
      const { container } = render(<SearchHighlight text="test string" query="string" />);
      const mark = container.querySelector('mark');
      expect(mark).toBeTruthy();
    });
  });

  // === 边缘情况 ===
  describe('edge cases', () => {
    it('handles text with special Unicode characters', () => {
      const { container } = render(
        <SearchHighlight text="🎉 Hello 你好 Привет" query="你好" />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('你好');
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(10000) + 'target' + 'B'.repeat(10000);
      const { container } = render(<SearchHighlight text={longText} query="target" />);
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
    });

    it('handles query that matches entire text', () => {
      const { container } = render(
        <SearchHighlight text="exact match" query="exact match" />
      );
      const marks = container.querySelectorAll('mark');
      // "exact match" contains both "exact" and "match" as separate keywords
      // so two marks will be created
      expect(marks.length).toBe(2);
      expect(marks[0].textContent).toBe('exact');
      expect(marks[1].textContent).toBe('match');
    });

    it('handles query with trailing spaces', () => {
      const { container } = render(
        <SearchHighlight text="hello world" query="hello   " />
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('hello');
    });
  });
});
