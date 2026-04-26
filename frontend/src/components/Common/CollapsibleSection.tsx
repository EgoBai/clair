/**
 * CollapsibleSection 折叠面板组件
 * 支持动画展开/收起，常用于移动端筛选器
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  badge?: number | string;
  onToggle?: (open: boolean) => void;
  className?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = React.memo(({
  title,
  children,
  defaultOpen = false,
  icon,
  badge,
  onToggle,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | 'auto'>(defaultOpen ? 'auto' : 0);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  }, [onToggle]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (isOpen) {
      const contentHeight = content.scrollHeight;
      setHeight(contentHeight);
      // After transition, set to auto for dynamic content
      const timer = setTimeout(() => setHeight('auto'), 300);
      return () => clearTimeout(timer);
    } else {
      // First set explicit height, then animate to 0
      setHeight(content.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
      return;
    }
  }, [isOpen]);

  return (
    <div className={`collapsible-section ${className}`}>
      <button
        className="collapsible-header"
        onClick={toggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          color: 'inherit',
          transition: 'background-color 0.15s ease',
        }}
      >
        {icon && <span style={{ marginRight: 8, display: 'flex' }}>{icon}</span>}
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        {badge !== undefined && (
          <span
            style={{
              marginRight: 8,
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 12,
              background: '#f0f0f0',
            }}
          >
            {badge}
          </span>
        )}
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
            display: 'inline-flex',
          }}
        >
          ▼
        </span>
      </button>
      <div
        ref={contentRef}
        style={{
          height: height === 'auto' ? 'auto' : `${height}px`,
          overflow: 'hidden',
          transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ padding: '0 16px 16px' }}>{children}</div>
      </div>
    </div>
  );
});

export default CollapsibleSection;
