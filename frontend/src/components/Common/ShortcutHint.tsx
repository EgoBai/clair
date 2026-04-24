import React, { useEffect } from 'react';

type ShortcutKey = string | string[];

interface ShortcutHintProps {
  shortcut: ShortcutKey;
  description?: string;
  className?: string;
}

// Convert shortcut to display string
export function shortcutToString(shortcut: ShortcutKey | null | undefined, isMac?: boolean): string {
  if (!shortcut) return '';
  if (typeof shortcut === 'string') return shortcut;
  
  const isMacOS = isMac ?? (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'));
  
  return shortcut.map(key => {
    switch (key) {
      case 'mod': return isMacOS ? '⌘' : 'Ctrl';
      case 'shift': return '⇧';
      case 'alt': return isMacOS ? '⌥' : 'Alt';
      case 'ctrl': return '⌃';
      default: return key.toUpperCase();
    }
  }).join('');
}

// Hook to listen for keyboard shortcuts
export function useShortcut(keys: ShortcutKey, handler: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const keyArray = typeof keys === 'string' ? [keys] : keys;
      const allMatch = keyArray.every(k => {
        switch (k) {
          case 'mod': return e.metaKey || e.ctrlKey;
          case 'ctrl': return e.ctrlKey;
          case 'shift': return e.shiftKey;
          case 'alt': return e.altKey;
          default: return e.key.toLowerCase() === k.toLowerCase();
        }
      });
      if (allMatch) {
        e.preventDefault();
        handler();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [keys, handler]);
}

export const ShortcutHint: React.FC<ShortcutHintProps> = ({ shortcut, description, className }) => {
  if (!shortcut) return null;
  
  return (
    <span className={className} data-testid="shortcut-hint">
      <kbd>{shortcutToString(shortcut)}</kbd>
      {description && <span className="shortcut-desc">{description}</span>}
    </span>
  );
};

export default ShortcutHint;
