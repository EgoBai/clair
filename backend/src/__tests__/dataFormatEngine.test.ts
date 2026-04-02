import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent, changeColor, formatVolume, truncateText, debounceValue } from '../services/dataFormatEngine';

describe('dataFormatEngine', () => {
  it('formatNumber 万亿', () => {
    expect(formatNumber(1.5e12)).toContain('万亿');
  });
  it('formatNumber 亿', () => {
    expect(formatNumber(5e8)).toContain('亿');
  });
  it('formatNumber 万', () => {
    expect(formatNumber(3e4)).toContain('万');
  });
  it('formatNumber small number', () => {
    expect(formatNumber(123.456)).toBe('123.46');
  });
  it('formatNumber negative', () => {
    expect(formatNumber(-5e8)).toContain('亿');
  });
  it('formatPercent positive', () => {
    expect(formatPercent(0.0523)).toBe('+5.23%');
  });
  it('formatPercent negative', () => {
    expect(formatPercent(-0.03)).toBe('-3.00%');
  });
  it('formatPercent zero', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });
  it('formatPercent custom decimals', () => {
    expect(formatPercent(0.1234, 3)).toBe('+12.340%');
  });
  it('changeColor positive is red', () => {
    expect(changeColor(1)).toBe('#ef4444');
  });
  it('changeColor negative is green', () => {
    expect(changeColor(-1)).toBe('#22c55e');
  });
  it('changeColor zero is gray', () => {
    expect(changeColor(0)).toBe('#9ca3af');
  });
  it('formatVolume 亿手', () => {
    expect(formatVolume(2e8)).toContain('亿手');
  });
  it('formatVolume 万手', () => {
    expect(formatVolume(5e4)).toContain('万手');
  });
  it('formatVolume small', () => {
    expect(formatVolume(500)).toContain('手');
  });
  it('truncateText short', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });
  it('truncateText long', () => {
    expect(truncateText('hello world this is long', 10)).toBe('hello w...');
  });
  it('truncateText exact length', () => {
    expect(truncateText('1234567890', 10)).toBe('1234567890');
  });
  it('debounceValue returns value', () => {
    let count = 0;
    const debounced = debounceValue(() => ++count, 100);
    const v = debounced();
    expect(typeof v).toBe('number');
  });
  it('formatNumber with custom decimals', () => {
    expect(formatNumber(1234, 0)).toBe('1234');
  });
});
