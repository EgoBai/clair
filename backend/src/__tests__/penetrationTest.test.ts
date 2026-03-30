/**
 * 渗透测试模拟 - Round 170
 * 覆盖：认证绕过、会话固定、目录遍历、HTTP方法篡改、Header注入
 */
import { describe, it, expect } from 'vitest';

/**
 * 验证路径是否安全（防止目录遍历）
 */
function isSafePath(requestPath: string): boolean {
  // 检测目录遍历
  if (requestPath.includes('..')) return false;
  if (requestPath.includes('%2e') || requestPath.includes('%2E')) return false;
  if (requestPath.includes('%252e')) return false; // double encode
  if (requestPath.includes('\\')) return false; // windows style
  if (requestPath.includes('\0')) return false; // null byte
  if (requestPath.includes('%00')) return false; // encoded null byte
  // 必须以 / 开头
  if (!requestPath.startsWith('/')) return false;
  // 不应访问敏感路径
  const sensitivePatterns = [
    /\/\.env/i,
    /\/\.git/i,
    /\/etc\//i,
    /\/proc\//i,
    /\/dev\//i,
    /\/passwd/i,
    /\/shadow/i,
    /\/\.ssh/i,
    /\/\.aws/i,
  ];
  return !sensitivePatterns.some(p => p.test(requestPath));
}

/**
 * 验证HTTP方法
 */
function isAllowedMethod(method: string): boolean {
  const allowed = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  return allowed.includes(method.toUpperCase());
}

/**
 * Header注入检测
 */
function isSafeHeader(value: string): boolean {
  // CRLF注入
  if (value.includes('\r') || value.includes('\n')) return false;
  // 编码的CRLF
  if (value.includes('%0d') || value.includes('%0a')) return false;
  if (value.includes('%0D') || value.includes('%0A')) return false;
  return true;
}

/**
 * 会话Token验证
 */
function isValidSessionToken(token: string): boolean {
  // 至少32字符
  if (token.length < 32) return false;
  // 不应是常见弱token
  const weakTokens = ['admin', 'test', 'password', '123456', 'token', 'session'];
  if (weakTokens.includes(token.toLowerCase())) return false;
  // 应包含足够随机性（至少有大小写和数字）
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

describe('渗透测试模拟', () => {
  describe('目录遍历防护', () => {
    it('应阻止 ../ 遍历', () => {
      expect(isSafePath('/api/../../etc/passwd')).toBe(false);
      expect(isSafePath('/api/files/../../../etc/shadow')).toBe(false);
    });

    it('应阻止URL编码遍历', () => {
      expect(isSafePath('/api/%2e%2e/etc/passwd')).toBe(false);
      expect(isSafePath('/api/%2e%2e/%2e%2e/etc/passwd')).toBe(false);
    });

    it('应阻止双重编码', () => {
      expect(isSafePath('/api/%252e%252e/etc/passwd')).toBe(false);
    });

    it('应阻止Windows风格遍历', () => {
      expect(isSafePath('/api/..\\..\\etc\\passwd')).toBe(false);
    });

    it('应阻止null字节注入', () => {
      expect(isSafePath('/api/../../etc/passwd\0.jpg')).toBe(false);
      expect(isSafePath('/api/../../etc/passwd%00.jpg')).toBe(false);
    });

    it('应阻止敏感路径访问', () => {
      expect(isSafePath('/.env')).toBe(false);
      expect(isSafePath('/.git/config')).toBe(false);
      expect(isSafePath('/etc/passwd')).toBe(false);
      expect(isSafePath('/.ssh/id_rsa')).toBe(false);
      expect(isSafePath('/.aws/credentials')).toBe(false);
    });

    it('正常API路径应通过', () => {
      expect(isSafePath('/api/stocks/600000')).toBe(true);
      expect(isSafePath('/api/users/profile')).toBe(true);
      expect(isSafePath('/')).toBe(true);
    });
  });

  describe('HTTP方法安全', () => {
    it('标准方法应允许', () => {
      for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
        expect(isAllowedMethod(m)).toBe(true);
      }
    });

    it('危险方法应拒绝', () => {
      expect(isAllowedMethod('TRACE')).toBe(false);
      expect(isAllowedMethod('CONNECT')).toBe(false);
      expect(isAllowedMethod('TRACK')).toBe(false);
    });

    it('任意方法应拒绝', () => {
      expect(isAllowedMethod('HACK')).toBe(false);
      expect(isAllowedMethod('INJECT')).toBe(false);
      expect(isAllowedMethod('')).toBe(false);
    });

    it('大小写不敏感', () => {
      expect(isAllowedMethod('get')).toBe(true);
      expect(isAllowedMethod('Get')).toBe(true);
      expect(isAllowedMethod('POST')).toBe(true);
    });
  });

  describe('Header注入防护', () => {
    it('应阻止CRLF注入', () => {
      expect(isSafeHeader('value\r\nInjected-Header: evil')).toBe(false);
      expect(isSafeHeader('value\nX-Injected: true')).toBe(false);
      expect(isSafeHeader('value\r\nevil')).toBe(false);
    });

    it('应阻止编码CRLF', () => {
      expect(isSafeHeader('value%0d%0aInjected')).toBe(false);
      expect(isSafeHeader('value%0D%0AInjected')).toBe(false);
    });

    it('正常header值应通过', () => {
      expect(isSafeHeader('Bearer eyJhbGciOiJIUzI1NiJ9')).toBe(true);
      expect(isSafeHeader('application/json')).toBe(true);
      expect(isSafeHeader('zh-CN,zh;q=0.9,en;q=0.8')).toBe(true);
    });
  });

  describe('会话安全', () => {
    it('强token应通过', () => {
      expect(isValidSessionToken('aB3kL9mN2pQ7rS5tU8vW1xY4zA0bC6dE')).toBe(true);
    });

    it('弱token应拒绝', () => {
      expect(isValidSessionToken('admin')).toBe(false);
      expect(isValidSessionToken('123456')).toBe(false);
      expect(isValidSessionToken('token')).toBe(false);
    });

    it('短token应拒绝', () => {
      expect(isValidSessionToken('abc123')).toBe(false);
      expect(isValidSessionToken('aB3')).toBe(false);
    });

    it('纯数字token应拒绝', () => {
      expect(isValidSessionToken('12345678901234567890123456789012')).toBe(false);
    });

    it('纯小写应拒绝', () => {
      expect(isValidSessionToken('abcdefghijklmnopqrstuvwxyz123456')).toBe(false);
    });
  });

  describe('认证绕过测试', () => {
    it('空凭证应拒绝', () => {
      const validateCredentials = (user: string, pass: string) => {
        if (!user || !pass) return false;
        if (user.length === 0 || pass.length === 0) return false;
        return true;
      };
      expect(validateCredentials('', '')).toBe(false);
      expect(validateCredentials('admin', '')).toBe(false);
      expect(validateCredentials('', 'pass')).toBe(false);
    });

    it('SQL注入凭证应拒绝', () => {
      const validateCredentials = (user: string, pass: string) => {
        const dangerousPatterns = [/'/, /--/, /;/, /union/i, /select/i, /or\s/i];
        return !dangerousPatterns.some(p => p.test(user) || p.test(pass));
      };
      expect(validateCredentials("admin'--", 'anything')).toBe(false);
      expect(validateCredentials("admin", "' OR '1'='1")).toBe(false);
    });

    it('超长凭证应拒绝', () => {
      const validateCredentials = (user: string, pass: string) => {
        return user.length <= 256 && pass.length <= 256;
      };
      expect(validateCredentials('a'.repeat(257), 'pass')).toBe(false);
      expect(validateCredentials('user', 'p'.repeat(257))).toBe(false);
    });
  });

  describe('API端点安全', () => {
    it('应拒绝不安全的Content-Type', () => {
      const isSafeContentType = (ct: string) => {
        const allowed = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
        return allowed.some(a => ct.startsWith(a));
      };
      expect(isSafeContentType('application/json')).toBe(true);
      expect(isSafeContentType('text/plain')).toBe(false);
      expect(isSafeContentType('application/xml')).toBe(false);
    });

    it('应验证请求体大小', () => {
      const isSafeBodySize = (size: number) => size <= 10 * 1024 * 1024; // 10MB
      expect(isSafeBodySize(1000)).toBe(true);
      expect(isSafeBodySize(10 * 1024 * 1024)).toBe(true);
      expect(isSafeBodySize(100 * 1024 * 1024)).toBe(false);
    });

    it('应验证响应Content-Type', () => {
      const validateResponse = (ct: string, body: string) => {
        if (ct.includes('application/json')) {
          try { JSON.parse(body); return true; } catch { return false; }
        }
        return true;
      };
      expect(validateResponse('application/json', '{"ok":true}')).toBe(true);
      expect(validateResponse('application/json', '<html>xss</html>')).toBe(false);
    });
  });

  describe('文件上传安全', () => {
    it('应验证文件扩展名', () => {
      const isAllowedFile = (filename: string) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.csv', '.xlsx'];
        const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
        return allowed.includes(ext);
      };
      expect(isAllowedFile('report.csv')).toBe(true);
      expect(isAllowedFile('photo.jpg')).toBe(true);
      expect(isAllowedFile('shell.php')).toBe(false);
      expect(isAllowedFile('evil.exe')).toBe(false);
      expect(isAllowedFile('script.js')).toBe(false);
    });

    it('应阻止双扩展名', () => {
      const isAllowedFile = (filename: string) => {
        // 检查双扩展名
        const parts = filename.split('.');
        if (parts.length > 2) {
          const dangerous = ['php', 'jsp', 'asp', 'exe', 'js', 'sh', 'bat'];
          for (let i = 1; i < parts.length - 1; i++) {
            if (dangerous.includes(parts[i].toLowerCase())) return false;
          }
        }
        const allowed = ['.jpg', '.png', '.csv', '.pdf'];
        const ext = '.' + parts[parts.length - 1].toLowerCase();
        return allowed.includes(ext);
      };
      expect(isAllowedFile('image.php.jpg')).toBe(false);
      expect(isAllowedFile('data.jsp.csv')).toBe(false);
      expect(isAllowedFile('photo.jpg')).toBe(true);
    });

    it('应阻止null字节文件名', () => {
      const isSafeFilename = (name: string) => {
        if (name.includes('\0')) return false;
        if (name.includes('%00')) return false;
        if (name.includes('..')) return false;
        return true;
      };
      expect(isSafeFilename('file\0.php.jpg')).toBe(false);
      expect(isSafeFilename('safe.jpg')).toBe(true);
    });
  });
});
