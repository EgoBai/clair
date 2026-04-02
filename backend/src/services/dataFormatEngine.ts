/**
 * DataFormatEngine - 数据格式化引擎
 * 金额/百分比/大数字格式化，颜色映射等前端展示逻辑
 */

export function formatNumber(n: number, decimals: number = 2): string {
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(decimals) + '万亿';
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(decimals) + '亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(decimals) + '万';
  return n.toFixed(decimals);
}

export function formatPercent(n: number, decimals: number = 2): string {
  const sign = n > 0 ? '+' : '';
  return sign + (n * 100).toFixed(decimals) + '%';
}

export function changeColor(value: number): string {
  if (value > 0) return '#ef4444';
  if (value < 0) return '#22c55e';
  return '#9ca3af';
}

export function formatVolume(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + '亿手';
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + '万手';
  return vol + '手';
}

export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function debounceValue<T>(getValue: () => T, delay: number): () => T {
  let lastValue: T;
  let lastCall = 0;
  return () => {
    const now = Date.now();
    if (now - lastCall > delay) {
      lastValue = getValue();
      lastCall = now;
    }
    return lastValue;
  };
}
