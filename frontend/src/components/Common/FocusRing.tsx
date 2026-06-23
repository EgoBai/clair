/**
 * FocusRing 焦点环组件 v2
 * 提供统一的键盘焦点指示、快捷键提示、焦点管理
 */
import React, { useState, useEffect, useRef } from 'react';

// 焦点环组件
export const FocusRing: React.FC<{
  children: React.ReactNode;
  color?: string;
  offset?: number;
  width?: number;
  className?: string;
}> = ({ children, color = 'rgba(59, 130, 246, 0.6)', offset = 2, width = 3, className = '' }) => (
  <div
    className={`focus-ring-container ${className}`}
    style={{ position: 'relative', outline: 'none' }}
  >
    {children}
    <style>{`
      .focus-ring-container:focus-visible {
        outline: ${width}px solid ${color};
        outline-offset: ${offset}px;
        border-radius: 6px;
      }
    `}</style>
  </div>
);

// 键盘快捷键提示
export const KeyboardHint: React.FC<{
  keys: string[];
  className?: string;
  size?: 'sm' | 'md';
}> = ({ keys, className = '', size = 'sm' }) => {
  const fontSize = size === 'sm' ? 11 : 13;
  const padding = size === 'sm' ? '1px 5px' : '2px 8px';

  return (
    <span
      className={`keyboard-hint ${className}`}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        gap: 3,
        alignItems: 'center',
        fontSize,
        color: '#999',
      }}
    >
      {keys.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: '#ccc' }}>+</span>}
          <kbd
            style={{
              display: 'inline-block',
              padding,
              fontSize,
              fontFamily: 'inherit',
              lineHeight: size === 'sm' ? '18px' : '22px',
              color: '#555',
              backgroundColor: '#f7f7f7',
              border: '1px solid #ccc',
              borderRadius: 3,
              boxShadow: '0 1px 0 rgba(0,0,0,0.1)',
              minWidth: size === 'sm' ? 20 : 24,
              textAlign: 'center',
            }}
          >
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
};

// 焦点可见性指示器
export const FocusIndicator: React.FC<{
  children: React.ReactNode;
  showOnlyForKeyboard?: boolean;
}> = ({ children, showOnlyForKeyboard = true }) => {
  const [isKeyboardUser, setIsKeyboardUser] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) setIsKeyboardUser(true);
    };
    const onMouse = () => setIsKeyboardUser(false);

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, []);

  const showFocus = !showOnlyForKeyboard || isKeyboardUser;

  return (
    <div
      className="focus-indicator-wrapper"
      style={{
        outline: showFocus ? undefined : 'none',
      }}
    >
      {children}
      <style>{`
        .focus-indicator-wrapper:focus-within {
          outline: 3px solid rgba(59, 130, 246, 0.6);
          outline-offset: 2px;
          border-radius: 6px;
        }
        .focus-indicator-wrapper:not(.keyboard-user):focus-within {
          outline: none;
        }
      `}</style>
    </div>
  );
};

// 快捷键面板
export const ShortcutPanel: React.FC<{
  shortcuts: Array<{ keys: string[]; label: string }>;
  visible: boolean;
  onClose: () => void;
}> = ({ shortcuts, visible, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEsc);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="键盘快捷键"
      aria-modal="false"
      tabIndex={-1}
      className="shortcut-panel"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 999,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        maxWidth: 320,
        maxHeight: 400,
        overflow: 'auto',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>⌨️ 快捷键</h3>
        <button
          onClick={onClose}
          aria-label="关闭快捷键面板"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: '#999',
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shortcuts.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#333' }}>{s.label}</span>
            <KeyboardHint keys={s.keys} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FocusRing;
