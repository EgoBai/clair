/**
 * 语言切换组件
 */

import React from 'react';
import { Dropdown, Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useI18n, Locale } from '../i18n';

const LOCALE_OPTIONS: Array<{ key: Locale; label: string; flag: string }> = [
  { key: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { key: 'en-US', label: 'English', flag: '🇺🇸' },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  const current = LOCALE_OPTIONS.find((o) => o.key === locale) || LOCALE_OPTIONS[0];

  return (
    <Dropdown
      menu={{
        items: LOCALE_OPTIONS.map((opt) => ({
          key: opt.key,
          label: (
            <span>
              {opt.flag} {opt.label}
            </span>
          ),
          onClick: () => setLocale(opt.key),
        })),
        selectedKeys: [locale],
      }}
      placement="bottomRight"
    >
      <Button type="text" icon={<GlobalOutlined />} size="small">
        {current.flag}
      </Button>
    </Dropdown>
  );
}
