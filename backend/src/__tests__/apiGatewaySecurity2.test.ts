/**
 * 后端 API 网关安全测试
 * 覆盖认证、授权、输入清洗、CORS
 */

import { describe, it, expect } from 'vitest';

describe('API 网关安全', () => {
  describe('JWT 令牌验证', () => {
    interface TokenPayload {
      sub: string;
      role: string;
      exp: number;
      iat: number;
    }

    function validateToken(token: string, now: number): { valid: boolean; payload?: TokenPayload; error?: string } {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return { valid: false, error: '无效格式' };

        const payload: TokenPayload = JSON.parse(atob(parts[1]));
        if (payload.exp * 1000 < now) return { valid: false, error: '令牌已过期' };
        if (!payload.sub || !payload.role) return { valid: false, error: '缺少必要字段' };

        return { valid: true, payload };
      } catch {
        return { valid: false, error: '解析失败' };
      }
    }

    it('有效令牌应通过验证', () => {
      const payload = { sub: 'user1', role: 'user', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) };
      const token = `eyJ.${btoa(JSON.stringify(payload))}.sig`;
      const result = validateToken(token, Date.now());
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe('user1');
    });

    it('过期令牌应拒绝', () => {
      const payload = { sub: 'user1', role: 'user', exp: Math.floor(Date.now() / 1000) - 3600, iat: 0 };
      const token = `eyJ.${btoa(JSON.stringify(payload))}.sig`;
      expect(validateToken(token, Date.now()).valid).toBe(false);
    });

    it('无效格式应拒绝', () => {
      expect(validateToken('invalid', Date.now()).valid).toBe(false);
    });
  });

  describe('RBAC 权限检查', () => {
    type Role = 'guest' | 'user' | 'vip' | 'admin';
    type Permission = 'read' | 'write' | 'delete' | 'manage';

    const rolePermissions: Record<Role, Permission[]> = {
      guest: ['read'],
      user: ['read', 'write'],
      vip: ['read', 'write'],
      admin: ['read', 'write', 'delete', 'manage'],
    };

    function hasPermission(role: Role, permission: Permission): boolean {
      return rolePermissions[role]?.includes(permission) ?? false;
    }

    it('admin应有所有权限', () => {
      for (const p of ['read', 'write', 'delete', 'manage'] as Permission[]) {
        expect(hasPermission('admin', p)).toBe(true);
      }
    });

    it('guest应只有读权限', () => {
      expect(hasPermission('guest', 'read')).toBe(true);
      expect(hasPermission('guest', 'write')).toBe(false);
      expect(hasPermission('guest', 'delete')).toBe(false);
    });

    it('user应有读写权限', () => {
      expect(hasPermission('user', 'read')).toBe(true);
      expect(hasPermission('user', 'write')).toBe(true);
      expect(hasPermission('user', 'delete')).toBe(false);
    });
  });

  describe('输入清洗', () => {
    function sanitizeInput(input: string): string {
      return input
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/['"`;]/g, '')
        .trim()
        .slice(0, 1000);
    }

    it('应移除HTML标签', () => {
      expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    });

    it('应移除javascript协议', () => {
      expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
    });

    it('应移除事件处理器', () => {
      expect(sanitizeInput('onclick=alert(1)')).toBe('alert(1)');
    });

    it('应限制长度', () => {
      const long = 'a'.repeat(2000);
      expect(sanitizeInput(long).length).toBe(1000);
    });
  });

  describe('CORS 验证', () => {
    function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
      return allowedOrigins.some(allowed => {
        if (allowed === '*') return true;
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return origin.endsWith(domain);
        }
        return origin === allowed;
      });
    }

    it('精确匹配应允许', () => {
      expect(isOriginAllowed('https://example.com', ['https://example.com'])).toBe(true);
    });

    it('通配符子域应匹配', () => {
      expect(isOriginAllowed('https://sub.example.com', ['*.example.com'])).toBe(true);
    });

    it('不匹配应拒绝', () => {
      expect(isOriginAllowed('https://evil.com', ['https://example.com'])).toBe(false);
    });

    it('通配符应允许所有', () => {
      expect(isOriginAllowed('https://any.com', ['*'])).toBe(true);
    });
  });
});
