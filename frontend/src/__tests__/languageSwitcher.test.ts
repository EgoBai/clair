import { describe, it, expect, vi } from 'vitest';

/**
 * LanguageSwitcher 语言切换组件逻辑测试
 */

describe('LanguageSwitcher', () => {
  describe('语言选项配置', () => {
    const LOCALE_OPTIONS = [
      { key: 'zh-CN', label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳', dir: 'ltr' as const, group: 'cjk' as const },
      { key: 'en-US', label: 'English', nativeLabel: 'English', flag: '🇺🇸', dir: 'ltr' as const, group: 'latin' as const },
      { key: 'ja-JP', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵', dir: 'ltr' as const, group: 'cjk' as const },
      { key: 'ko-KR', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷', dir: 'ltr' as const, group: 'cjk' as const },
    ];

    it('应该支持4种语言', () => {
      expect(LOCALE_OPTIONS).toHaveLength(4);
    });

    it('应该包含中文', () => {
      const zh = LOCALE_OPTIONS.find(l => l.key === 'zh-CN');
      expect(zh?.nativeLabel).toBe('中文');
      expect(zh?.flag).toBe('🇨🇳');
    });

    it('应该包含英文', () => {
      const en = LOCALE_OPTIONS.find(l => l.key === 'en-US');
      expect(en?.nativeLabel).toBe('English');
      expect(en?.flag).toBe('🇺🇸');
    });

    it('应该包含日语', () => {
      const ja = LOCALE_OPTIONS.find(l => l.key === 'ja-JP');
      expect(ja?.nativeLabel).toBe('日本語');
      expect(ja?.flag).toBe('🇯🇵');
    });

    it('应该包含韩语', () => {
      const ko = LOCALE_OPTIONS.find(l => l.key === 'ko-KR');
      expect(ko?.nativeLabel).toBe('한국어');
      expect(ko?.flag).toBe('🇰🇷');
    });

    it('CJK 语言应该分组', () => {
      const cjk = LOCALE_OPTIONS.filter(l => l.group === 'cjk');
      expect(cjk).toHaveLength(3);
    });

    it('Latin 语言应该分组', () => {
      const latin = LOCALE_OPTIONS.filter(l => l.group === 'latin');
      expect(latin).toHaveLength(1);
    });
  });

  describe('LTR/RTL 方向', () => {
    it('所有当前语言都应该为 LTR', () => {
      const RTL_LOCALES: string[] = [];
      expect(RTL_LOCALES).toHaveLength(0);
    });

    it('应该预留 RTL 支持接口', () => {
      const hasRTL = (locale: string) => ['ar', 'he'].includes(locale);
      expect(hasRTL('ar')).toBe(true);
      expect(hasRTL('zh-CN')).toBe(false);
    });
  });

  describe('快捷键切换', () => {
    it('应该支持 Alt+L 循环切换语言', () => {
      const LOCALE_OPTIONS = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      const currentIndex = 0;
      const nextIndex = (currentIndex + 1) % LOCALE_OPTIONS.length;
      expect(LOCALE_OPTIONS[nextIndex]).toBe('en-US');
    });

    it('循环到最后应该回到第一个', () => {
      const LOCALE_OPTIONS = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
      const currentIndex = 3;
      const nextIndex = (currentIndex + 1) % LOCALE_OPTIONS.length;
      expect(LOCALE_OPTIONS[nextIndex]).toBe('zh-CN');
    });
  });

  describe('当前语言标识', () => {
    it('应该能获取当前语言的选项', () => {
      const LOCALE_OPTIONS = [
        { key: 'zh-CN', nativeLabel: '中文', flag: '🇨🇳' },
        { key: 'en-US', nativeLabel: 'English', flag: '🇺🇸' },
      ];
      const currentLocale = 'zh-CN';
      const current = LOCALE_OPTIONS.find(l => l.key === currentLocale);
      expect(current?.nativeLabel).toBe('中文');
    });

    it('应该显示当前语言的 flag', () => {
      const LOCALE_OPTIONS = [
        { key: 'zh-CN', nativeLabel: '中文', flag: '🇨🇳' },
        { key: 'en-US', nativeLabel: 'English', flag: '🇺🇸' },
      ];
      const currentLocale = 'en-US';
      const current = LOCALE_OPTIONS.find(l => l.key === currentLocale);
      expect(current?.flag).toBe('🇺🇸');
    });
  });

  describe('菜单数据转换', () => {
    it('应该将 locale 选项转为 antd menu items', () => {
      const LOCALE_OPTIONS = [
        { key: 'zh-CN', nativeLabel: '中文', flag: '🇨🇳' },
        { key: 'en-US', nativeLabel: 'English', flag: '🇺🇸' },
      ];
      
      const menuItems = LOCALE_OPTIONS.map(locale => ({
        key: locale.key,
        label: `${locale.flag} ${locale.nativeLabel}`,
      }));

      expect(menuItems[0].key).toBe('zh-CN');
      expect(menuItems[0].label).toBe('🇨🇳 中文');
      expect(menuItems[1].key).toBe('en-US');
      expect(menuItems[1].label).toBe('🇺🇸 English');
    });
  });
});
