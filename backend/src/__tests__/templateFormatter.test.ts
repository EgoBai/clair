import { describe, it, expect } from 'vitest';
import { templateFormatter, TemplateFormatter } from '../services/notification/templateFormatter';

/**
 * 通知模板格式化器 —— 迁移自影子测试（2026-11-04，M2 批次 1）
 *
 * 旧版本在测试文件里自抄了一份 formatNumber/formatRelativeTime/applyConditionRule/formatStockChange，
 * 断言的是副本，真实实现改坏它不会红。现在全部改为直接调用 templateFormatter（生产单例）。
 * 顺带补上旧版完全没覆盖的 render() 模板语法与 stockCode/compact/truncate/chineseAmount。
 */

describe('通知模板格式化器（真实实现）', () => {
  describe('number', () => {
    it('默认两位小数 + 千分位', () => {
      expect(templateFormatter.format('number', 1234567.89)).toBe('1,234,567.89');
    });

    it('自定义小数位', () => {
      expect(templateFormatter.format('number', 1234.5678, { decimals: 1 })).toBe('1,234.6');
    });

    it('前后缀', () => {
      expect(templateFormatter.format('number', 100, { prefix: '$', suffix: ' USD' })).toBe('$100.00 USD');
    });

    it('自定义分隔符', () => {
      expect(
        templateFormatter.format('number', 1234567, { thousandsSeparator: '.', decimalSeparator: ',' }),
      ).toBe('1.234.567,00');
    });

    it('非数字原样返回，不抛错', () => {
      expect(templateFormatter.format('number', 'abc')).toBe('abc');
    });
  });

  describe('percent', () => {
    it('正数补 + 号（实参已是百分数，不再乘 100）', () => {
      expect(templateFormatter.format('percent', 12.34)).toBe('+12.34%');
    });

    it('负数保留原符号', () => {
      expect(templateFormatter.format('percent', -3.2)).toBe('-3.20%');
    });

    it('零不补 + 号', () => {
      expect(templateFormatter.format('percent', 0)).toBe('0.00%');
    });
  });

  describe('chineseUnit', () => {
    it('亿 / 万 / 原值三档', () => {
      expect(templateFormatter.format('chineseUnit', 150000000)).toBe('1.50亿');
      expect(templateFormatter.format('chineseUnit', 50000)).toBe('5.00万');
      expect(templateFormatter.format('chineseUnit', 1234)).toBe('1234.00');
    });
  });

  describe('relativeTime', () => {
    it('刚刚 / 分钟 / 小时 / 天', () => {
      expect(templateFormatter.format('relativeTime', Date.now() - 30000)).toBe('刚刚');
      expect(templateFormatter.format('relativeTime', Date.now() - 300000)).toBe('5分钟前');
      expect(templateFormatter.format('relativeTime', Date.now() - 7200000)).toBe('2小时前');
      expect(templateFormatter.format('relativeTime', Date.now() - 172800000)).toBe('2天前');
    });
  });

  describe('conditional', () => {
    it('按正负取自定义文案', () => {
      expect(
        templateFormatter.format('conditional', 5, { positive: '涨', negative: '跌' }),
      ).toBe('涨');
      expect(
        templateFormatter.format('conditional', -5, { positive: '涨', negative: '跌' }),
      ).toBe('跌');
    });

    it('零走 neutral，未配置时回退为 "0"', () => {
      expect(
        templateFormatter.format('conditional', 0, { positive: '涨', negative: '跌', neutral: '平' }),
      ).toBe('平');
      expect(templateFormatter.format('conditional', 0, { positive: '涨', negative: '跌' })).toBe('0');
    });
  });

  describe('changeColor / changeLabel', () => {
    it('红涨绿跌灰平（A 股口径）', () => {
      expect(templateFormatter.format('changeColor', 1)).toBe('#ff4d4f');
      expect(templateFormatter.format('changeColor', -1)).toBe('#52c41a');
      expect(templateFormatter.format('changeColor', 0)).toBe('#888');
      expect(templateFormatter.format('changeColor', 'abc')).toBe('#888');
    });

    it('涨跌标签', () => {
      expect(templateFormatter.format('changeLabel', 5)).toBe('📈 +5%');
      expect(templateFormatter.format('changeLabel', -3)).toBe('📉 -3%');
      expect(templateFormatter.format('changeLabel', 0)).toBe('➡️ 0%');
      expect(templateFormatter.format('changeLabel', 'abc')).toBe('');
    });
  });

  describe('stockCode', () => {
    it('沪 / 深 / 北交易所前缀', () => {
      expect(templateFormatter.format('stockCode', '600000')).toBe('SH.600000');
      expect(templateFormatter.format('stockCode', '000001')).toBe('SZ.000001');
      expect(templateFormatter.format('stockCode', '300750')).toBe('SZ.300750');
      expect(templateFormatter.format('stockCode', '830000')).toBe('BJ.830000');
      expect(templateFormatter.format('stockCode', '430000')).toBe('BJ.430000');
      expect(templateFormatter.format('stockCode', '900901')).toBe('900901');
    });
  });

  describe('compact / truncate / chineseAmount', () => {
    it('大数字简写', () => {
      expect(templateFormatter.format('compact', 150000000)).toBe('1.5亿');
      expect(templateFormatter.format('compact', 50000)).toBe('5.0万');
      expect(templateFormatter.format('compact', 1500)).toBe('1.5k');
      expect(templateFormatter.format('compact', 120)).toBe('120');
    });

    it('截断默认 50 字符，可传 length', () => {
      expect(templateFormatter.format('truncate', 'abcdef', { length: 3 })).toBe('abc...');
      expect(templateFormatter.format('truncate', 'abc')).toBe('abc');
    });

    it('大写金额', () => {
      expect(templateFormatter.format('chineseAmount', 12345)).toBe('壹万贰仟叁佰肆拾伍');
    });
  });

  describe('render() 模板语法', () => {
    it('{{var | formatter}} 走对应格式化器', () => {
      expect(templateFormatter.render('股价 {{price | number}}', { price: 1234.5 })).toBe('股价 1,234.50');
    });

    it('{{var | formatter:opt=val}} 传参', () => {
      expect(templateFormatter.render('{{v | truncate:length=3}}', { v: 'abcdef' })).toBe('abc...');
    });

    it('无格式化器时直接转字符串', () => {
      expect(templateFormatter.render('{{name}}', { name: '澄观' })).toBe('澄观');
    });

    it('未知格式化器回退为原值字符串', () => {
      expect(templateFormatter.render('{{x | nope}}', { x: 42 })).toBe('42');
    });

    it('缺失变量渲染为空串', () => {
      expect(templateFormatter.render('A{{missing}}B', {})).toBe('AB');
    });
  });

  describe('注册表', () => {
    it('默认格式化器齐全', () => {
      const names = templateFormatter.getFormatterNames();
      for (const want of ['number', 'percent', 'chineseUnit', 'currency', 'conditional', 'changeColor', 'changeLabel', 'relativeTime', 'stockCode', 'compact', 'truncate', 'chineseAmount']) {
        expect(names).toContain(want);
      }
    });

    it('可注册自定义格式化器，clear 后恢复默认', () => {
      const f = new TemplateFormatter();
      f.register('upper', (v) => String(v).toUpperCase());
      expect(f.format('upper', 'ab')).toBe('AB');
      f.clear();
      expect(f.getFormatterNames()).not.toContain('upper');
      expect(f.format('upper', 'ab')).toBe('ab');
    });
  });
});
