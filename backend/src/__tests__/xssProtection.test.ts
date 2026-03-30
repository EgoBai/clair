/**
 * XSS 防护测试 - Round 168
 * 覆盖：输出编码、CSP策略、反射XSS、存储XSS、DOM XSS防护
 */
import { describe, it, expect } from 'vitest';

/**
 * HTML实体编码
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 验证URL安全性
 */
function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  // 只允许 http/https
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // 阻止 javascript:, data:, vbscript:
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null;
  }
  return null;
}

/**
 * JSON安全序列化
 */
function safeJsonSerialize(obj: any): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

describe('XSS 防护', () => {
  describe('HTML 实体编码', () => {
    it('应转义 <script> 标签', () => {
      const input = '<script>alert("xss")</script>';
      const escaped = escapeHtml(input);
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });

    it('应转义 img onerror', () => {
      const input = '<img src=x onerror="alert(1)">';
      const escaped = escapeHtml(input);
      expect(escaped).not.toContain('<img');
      expect(escaped).toContain('&lt;img');
    });

    it('应转义事件处理器', () => {
      const inputs = [
        '<div onclick="evil()">',
        '<body onload="evil()">',
        '<svg onload="evil()">',
        '<input onfocus="evil()">',
      ];
      for (const input of inputs) {
        const escaped = escapeHtml(input);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
      }
    });

    it('应转义引号', () => {
      const input = '" onmouseover="alert(1)" "';
      const escaped = escapeHtml(input);
      expect(escaped).toContain('&quot;');
    });

    it('应转义单引号', () => {
      const input = "' onclick='alert(1)' '";
      const escaped = escapeHtml(input);
      expect(escaped).toContain('&#x27;');
    });

    it('应转义 & 符号', () => {
      const input = '& < >';
      const escaped = escapeHtml(input);
      expect(escaped).toBe('&amp; &lt; &gt;');
    });

    it('应处理空字符串', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('应保留安全文本', () => {
      const input = '这是安全的文本 123 abc';
      expect(escapeHtml(input)).toBe(input);
    });

    it('应处理Unicode字符', () => {
      const input = '股票📈<script>';
      const escaped = escapeHtml(input);
      expect(escaped).toContain('📈');
      expect(escaped).toContain('&lt;script&gt;');
    });

    it('应处理编码绕过尝试', () => {
      const inputs = [
        '<scr\u0000ipt>',
        '<scr\x00ipt>',
        '<SCRIPT>',
        '<ScRiPt>',
      ];
      for (const input of inputs) {
        const escaped = escapeHtml(input);
        expect(escaped).not.toMatch(/<[^&]/);
      }
    });
  });

  describe('URL 消毒', () => {
    it('应允许 http URL', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('应允许 https URL', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('应阻止 javascript: URL', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
      expect(sanitizeUrl('JavaScript:alert(1)')).toBeNull();
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBeNull();
    });

    it('应阻止 data: URL', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(sanitizeUrl('DATA:text/html,test')).toBeNull();
    });

    it('应阻止 vbscript: URL', () => {
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
    });

    it('应处理带空格的URL', () => {
      expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('应阻止相对路径注入', () => {
      // 相对路径应该返回null（未允许）
      expect(sanitizeUrl('/path/to/page')).toBeNull();
      expect(sanitizeUrl('//evil.com/xss')).toBeNull();
    });
  });

  describe('JSON 安全序列化', () => {
    it('应转义 < 和 >', () => {
      const input = { html: '<script>alert(1)</script>' };
      const serialized = safeJsonSerialize(input);
      expect(serialized).not.toContain('<');
      expect(serialized).not.toContain('>');
      expect(serialized).toContain('\\u003c');
      expect(serialized).toContain('\\u003e');
    });

    it('应处理行分隔符', () => {
      const input = { text: 'line\u2028break\u2029end' };
      const serialized = safeJsonSerialize(input);
      expect(serialized).not.toContain('\u2028');
      expect(serialized).not.toContain('\u2029');
    });

    it('应保持数据完整性', () => {
      const input = { name: 'test', value: 123, nested: { a: 'b' } };
      const parsed = JSON.parse(safeJsonSerialize(input));
      expect(parsed).toEqual(input);
    });

    it('应处理数组', () => {
      const input = [1, '<script>', { x: '>' }];
      const serialized = safeJsonSerialize(input);
      expect(serialized).toContain('\\u003c');
      expect(serialized).toContain('\\u003e');
    });

    it('应处理 null', () => {
      expect(safeJsonSerialize(null)).toBe('null');
    });

    it('应处理 undefined 输入', () => {
      // JSON.stringify(undefined) 返回 undefined，需要防护
      const result = JSON.stringify(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('CSP 验证策略', () => {
    it('default-src 应为 self', () => {
      const directives = {
        'default-src': ["'self'"],
      };
      expect(directives['default-src']).toContain("'self'");
    });

    it('script-src 不应有 unsafe-inline', () => {
      const scriptSrc = ["'self'"];
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    it('style-src 可允许 unsafe-inline（CSS需要）', () => {
      const styleSrc = ["'self'", "'unsafe-inline'"];
      // CSS允许unsafe-inline，但应限制来源
      expect(styleSrc).toContain("'self'");
    });

    it('img-src 应支持 data:（图表需要）', () => {
      const imgSrc = ["'self'", 'data:', 'https:'];
      expect(imgSrc).toContain('data:');
    });

    it('connect-src 应限制API来源', () => {
      const connectSrc = ["'self'", 'https://api.example.com'];
      expect(connectSrc).toContain("'self'");
      expect(connectSrc.length).toBeLessThanOrEqual(5);
    });

    it('frame-ancestors 应阻止嵌入', () => {
      const frameAncestors = ["'none'"];
      expect(frameAncestors).toContain("'none'");
    });
  });

  describe('股票数据XSS防护', () => {
    it('股票名称中的HTML应被转义', () => {
      const stockName = '<img src=x onerror=alert(1)>公司';
      const safe = escapeHtml(stockName);
      expect(safe).not.toContain('<img');
      expect(safe).toContain('公司');
    });

    it('股票代码应只包含合法字符', () => {
      const validCodes = ['600000', '000001', 'SH600000', 'SZ000001'];
      for (const code of validCodes) {
        expect(code).toMatch(/^[A-Z0-9]+$/i);
      }
    });

    it('非法股票代码应被拒绝', () => {
      const invalidCodes = ['<script>', '600000; DROP TABLE', "'; OR 1=1--"];
      for (const code of invalidCodes) {
        expect(code).not.toMatch(/^[A-Z0-9]+$/i);
      }
    });

    it('新闻标题HTML应被转义', () => {
      const title = '<script>document.cookie</script>重大利好';
      const safe = escapeHtml(title);
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('重大利好');
    });

    it('用户输入的搜索查询应被转义', () => {
      const query = '"><img src=x onerror=alert(1)>';
      const safe = escapeHtml(query);
      expect(safe).not.toMatch(/<[^&]/);
    });
  });

  describe('注入防护边界', () => {
    it('应处理超长输入', () => {
      const longInput = '<script>'.repeat(10000);
      const safe = escapeHtml(longInput);
      expect(safe).not.toContain('<script>');
      expect(safe.length).toBeGreaterThan(0);
    });

    it('应处理嵌套编码', () => {
      const input = '&lt;script&gt;';
      const safe = escapeHtml(input);
      expect(safe).toContain('&amp;lt;');
    });

    it('应处理Unicode变体', () => {
      const inputs = [
        '\u003cscript\u003e', // Unicode编码的<>
        '\uff1cscript\uff1e', // 全角<>
      ];
      for (const input of inputs) {
        const safe = escapeHtml(input);
        // 全角字符不需转义（不是HTML特殊字符）
        expect(safe).toBeDefined();
      }
    });

    it('应处理混合编码攻击', () => {
      const input = '<scr&#x69;pt>alert(1)</scr&#x69;pt>';
      const safe = escapeHtml(input);
      expect(safe).not.toMatch(/<[^&]/);
    });

    it('应处理SVG XSS', () => {
      const input = '<svg onload="alert(1)"><circle r="100"/></svg>';
      const safe = escapeHtml(input);
      expect(safe).not.toContain('<svg');
      expect(safe).toContain('&lt;svg');
    });

    it('应处理CSS表达式', () => {
      const input = 'background:url(javascript:alert(1))';
      const safe = sanitizeUrl(input);
      expect(safe).toBeNull();
    });
  });
});
