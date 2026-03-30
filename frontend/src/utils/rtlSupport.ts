/**
 * RTL (Right-to-Left) 支持工具
 * 为未来阿拉伯语/希伯来语支持做准备
 */

import { Locale } from '../i18n';

/** RTL语言列表 */
export const RTL_LOCALES: Locale[] = [
  // 预留: 'ar-SA', 'he-IL' 等
];

/** 是否为RTL语言 */
export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** 获取文本方向 */
export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

/** 应用RTL方向到DOM */
export function applyDirection(locale: Locale): void {
  const dir = getDirection(locale);
  document.documentElement.dir = dir;
  document.documentElement.setAttribute('dir', dir);
  document.body.classList.toggle('rtl', dir === 'rtl');
}

/** RTL适配的CSS属性映射 */
export const RTL_PROPERTIES = {
  marginStart: (locale: Locale) => isRTL(locale) ? 'marginRight' : 'marginLeft',
  marginEnd: (locale: Locale) => isRTL(locale) ? 'marginLeft' : 'marginRight',
  paddingStart: (locale: Locale) => isRTL(locale) ? 'paddingRight' : 'paddingLeft',
  paddingEnd: (locale: Locale) => isRTL(locale) ? 'paddingLeft' : 'paddingRight',
  borderStart: (locale: Locale) => isRTL(locale) ? 'borderRight' : 'borderLeft',
  borderEnd: (locale: Locale) => isRTL(locale) ? 'borderLeft' : 'borderRight',
  textAlign: (locale: Locale) => isRTL(locale) ? 'right' : 'left',
  float: (locale: Locale, side: 'start' | 'end') => {
    if (side === 'start') return isRTL(locale) ? 'right' : 'left';
    return isRTL(locale) ? 'left' : 'right';
  },
} as const;

/** 生成RTL适配的内联样式 */
export function rtlStyle(locale: Locale, base: React.CSSProperties = {}): React.CSSProperties {
  const dir = getDirection(locale);
  return {
    ...base,
    direction: dir,
    textAlign: dir === 'rtl' ? 'right' : base.textAlign,
  };
}

/** 获取Flex方向的RTL适配值 */
export function getFlexDirection(
  locale: Locale,
  baseDirection: 'row' | 'row-reverse' | 'column' | 'column-reverse' = 'row'
): React.CSSProperties['flexDirection'] {
  if (baseDirection === 'column' || baseDirection === 'column-reverse') {
    return baseDirection;
  }
  if (isRTL(locale)) {
    return baseDirection === 'row' ? 'row-reverse' : 'row';
  }
  return baseDirection;
}

export default {
  isRTL,
  getDirection,
  applyDirection,
  RTL_PROPERTIES,
  rtlStyle,
  getFlexDirection,
};
