/**
 * FocusRing 焦点环组件
 * 提供统一的键盘焦点指示和快捷键提示
 */
import React from 'react';

export const FocusRing: React.FC<{
  children: React.ReactNode;
  color?: string;
  offset?: number;
  className?: string;
}> = ({ children, color = 'rgba(24, 144, 255, 0.3)', offset = 2, className = '' }) => (
  <div
    className={className}
    style={{
      position: 'relative',
      outline: 'none',
    }}
  >
    {children}
    <style>{`
      .focus-ring-target:focus-visible {
        outline: 2px solid ${color};
        outline-offset: ${offset}px;
        border-radius: 4px;
      }
    `}</style>
  </div>
);

// 键盘快捷键提示
export const KeyboardHint: React.FC<{
  keys: string[];
  className?: string;
}> = ({ keys, className = '' }) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      gap: 2,
      alignItems: 'center',
      fontSize: 11,
      color: '#999',
    }}
  >
    {keys.map((key, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span>+</span>}
        <kbd
          style={{
            display: 'inline-block',
            padding: '1px 5px',
            fontSize: 11,
            fontFamily: 'inherit',
            lineHeight: '18px',
            color: '#555',
            backgroundColor: '#f7f7f7',
            border: '1px solid #ccc',
            borderRadius: 3,
            boxShadow: '0 1px 0 rgba(0,0,0,0.1)',
          }}
        >
          {key}
        </kbd>
      </React.Fragment>
    ))}
  </span>
);

export default FocusRing;
