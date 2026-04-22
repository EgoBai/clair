/**
 * 语言切换组件 - 增强版
 * 支持4种语言 + RTL感知 + 分组展示 + 快捷键切换
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { Dropdown, Button, Badge, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useI18n, Locale } from '../../i18n';

export interface LocaleOption {
  key: Locale;
  label: string;
  nativeLabel: string;
  flag: string;
  dir: 'ltr' | 'rtl';
  group: 'cjk' | 'latin';
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { key: 'zh-CN', label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳', dir: 'ltr', group: 'cjk' },
  { key: 'en-US', label: 'English', nativeLabel: 'English', flag: '🇺🇸', dir: 'ltr', group: 'latin' },
  { key: 'ja-JP', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵', dir: 'ltr', group: 'cjk' },
  { key: 'ko-KR', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷', dir: 'ltr', group: 'cjk' },
];

/** RTL语言列表（预留阿拉伯语/希伯来语支持） */
export const RTL_LOCALES: Locale[] = [];

/** 获取locale方向 */
export function getLocaleDir(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/** 检测是否为CJK locale */
export function isCJKLocale(locale: Locale): boolean {
  return ['zh-CN', 'ja-JP', 'ko-KR'].includes(locale);
}

/** 获取locale的display name */
export function getLocaleDisplayName(locale: Locale, displayLocale?: Locale): string {
  const option = LOCALE_OPTIONS.find(o => o.key === locale);
  if (!option) return locale;
  // 在目标语言中显示原生名称，在其他语言中显示英文名
  if (displayLocale === locale) return option.nativeLabel;
  return option.label;
}

interface LanguageSwitcherProps {
  /** 显示模式 */
  variant?: 'dropdown' | 'segmented' | 'minimal';
  /** 大小 */
  size?: 'small' | 'middle' | 'large';
  /** 切换后的回调 */
  onChange?: (locale: Locale) => void;
  /** 是否显示语言代码 */
  showCode?: boolean;
  /** CSS class */
  className?: string;
}

export default function LanguageSwitcher({
  variant = 'dropdown',
  size = 'small',
  onChange,
  showCode = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();

  const current = useMemo(
    () => LOCALE_OPTIONS.find(o => o.key === locale) || LOCALE_OPTIONS[0],
    [locale]
  );

  const handleLocaleChange = useCallback(
    (newLocale: Locale) => {
      const option = LOCALE_OPTIONS.find(o => o.key === newLocale);
      if (!option) return;

      setLocale(newLocale);

      // 应用RTL方向
      document.documentElement.dir = option.dir;
      document.documentElement.lang = newLocale;

      // 设置CJK字体类名
      if (isCJKLocale(newLocale)) {
        document.documentElement.classList.add('cjk-locale');
      } else {
        document.documentElement.classList.remove('cjk-locale');
      }

      onChange?.(newLocale);
    },
    [setLocale, onChange]
  );

  // 快捷键 Ctrl+Shift+L 循环切换语言
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const currentIndex = LOCALE_OPTIONS.findIndex(o => o.key === locale);
        const nextIndex = (currentIndex + 1) % LOCALE_OPTIONS.length;
        handleLocaleChange(LOCALE_OPTIONS[nextIndex].key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [locale, handleLocaleChange]);

  // 构建菜单项（按组分类）
  const menuItems: MenuProps['items'] = useMemo(() => {
    const cjkItems = LOCALE_OPTIONS.filter(o => o.group === 'cjk');
    const latinItems = LOCALE_OPTIONS.filter(o => o.group === 'latin');

    const toItem = (opt: LocaleOption) => ({
      key: opt.key,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{opt.flag}</span>
          <span>{opt.nativeLabel}</span>
          {showCode && (
            <span style={{ opacity: 0.5, fontSize: 12 }}>{opt.key}</span>
          )}
          {locale === opt.key && <Badge status="processing" />}
        </span>
      ),
      onClick: () => handleLocaleChange(opt.key),
    });

    const items: MenuProps['items'] = [];

    if (latinItems.length > 0) {
      items.push({ type: 'group', label: 'Western', key: 'group-latin' });
      latinItems.forEach(o => items.push(toItem(o)));
    }
    if (cjkItems.length > 0) {
      items.push({ type: 'group', label: 'CJK', key: 'group-cjk' });
      cjkItems.forEach(o => items.push(toItem(o)));
    }

    return items;
  }, [locale, showCode, handleLocaleChange]);

  if (variant === 'minimal') {
    return (
      <div className={className} style={{ display: 'flex', gap: 4 }}>
        {LOCALE_OPTIONS.map(opt => (
          <Tooltip key={opt.key} title={`${opt.label} (${opt.nativeLabel})`}>
            <Button
              type={locale === opt.key ? 'primary' : 'text'}
              size={size}
              onClick={() => handleLocaleChange(opt.key)}
              aria-label={`Switch to ${opt.label}`}
              style={{ padding: '0 8px' }}
            >
              {opt.flag}
            </Button>
          </Tooltip>
        ))}
      </div>
    );
  }

  if (variant === 'segmented') {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid #d9d9d9',
        }}
      >
        {LOCALE_OPTIONS.map(opt => (
          <Button
            key={opt.key}
            type={locale === opt.key ? 'primary' : 'default'}
            size={size}
            onClick={() => handleLocaleChange(opt.key)}
            style={{
              borderRadius: 0,
              borderLeft: LOCALE_OPTIONS.indexOf(opt) > 0 ? '1px solid #d9d9d9' : undefined,
            }}
          >
            {opt.flag} {opt.nativeLabel}
          </Button>
        ))}
      </div>
    );
  }

  // 默认 dropdown
  return (
    <Dropdown
      menu={{ items: menuItems, selectedKeys: [locale] }}
      placement="bottomRight"
      trigger={['click']}
    >
      <Button type="text" icon={<GlobalOutlined />} size={size} className={className}>
        {current.flag} {current.nativeLabel}
        {showCode && <span style={{ marginLeft: 4, opacity: 0.5 }}>({current.key})</span>}
      </Button>
    </Dropdown>
  );
}

export { LanguageSwitcher };
