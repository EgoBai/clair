/**
 * 搜索高亮组件
 * 支持多关键词高亮、正则安全转义、自定义样式
 */

import React, { useMemo } from 'react';

interface HighlightProps {
  text: string;
  query: string;
  highlightStyle?: React.CSSProperties;
  caseSensitive?: boolean;
}

// 安全转义正则特殊字符
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function SearchHighlight({
  text,
  query,
  highlightStyle = {
    background: 'rgba(250, 173, 20, 0.3)',
    color: 'inherit',
    borderRadius: 2,
    padding: '0 1px',
  },
  caseSensitive = false,
}: HighlightProps) {
  const parts = useMemo(() => {
    if (!query.trim()) return [{ text, isHighlight: false }];

    // 分词支持（空格分隔的多关键词）
    const keywords = query.trim().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return [{ text, isHighlight: false }];

    const pattern = keywords.map(escapeRegex).join('|');
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(`(${pattern})`, flags);

    const result: { text: string; isHighlight: boolean }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, match.index), isHighlight: false });
      }
      result.push({ text: match[0], isHighlight: true });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), isHighlight: false });
    }

    return result;
  }, [text, query, caseSensitive]);

  return (
    <>
      {parts.map((part, i) =>
        part.isHighlight ? (
          <mark key={i} style={highlightStyle}>{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export default React.memo(SearchHighlight);
