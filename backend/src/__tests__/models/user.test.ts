/**
 * User 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  validateEmail,
  validatePhone,
  getDefaultPreferences,
  type User,
  type UserPreferences,
  type Watchlist,
  type WatchlistItem,
  type UserAlert,
  type AlertType,
  type UserSession,
  type UserRole,
  type UserStatus,
} from '../../models/User';

describe('User Model', () => {
  describe('validateUsername', () => {
    it('should validate correct usernames', () => {
      expect(validateUsername('user123')).toBe(true);
      expect(validateUsername('trader_01')).toBe(true);
      expect(validateUsername('abc')).toBe(true);
      expect(validateUsername('a'.repeat(20))).toBe(true);
    });

    it('should reject invalid usernames', () => {
      expect(validateUsername('ab')).toBe(false); // too short
      expect(validateUsername('a'.repeat(21))).toBe(false); // too long
      expect(validateUsername('user@name')).toBe(false); // special chars
      expect(validateUsername('user name')).toBe(false); // space
      expect(validateUsername('')).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@domain.org')).toBe(true);
      expect(validateEmail('a@b.c')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should validate correct Chinese phone numbers', () => {
      expect(validatePhone('13812345678')).toBe(true);
      expect(validatePhone('15912345678')).toBe(true);
      expect(validatePhone('18612345678')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('12345678901')).toBe(false); // doesn't start with 13-19
      expect(validatePhone('1381234567')).toBe(false); // too short
      expect(validatePhone('138123456789')).toBe(false); // too long
      expect(validatePhone('')).toBe(false);
    });
  });

  describe('getDefaultPreferences', () => {
    it('should return default preferences with userId', () => {
      const prefs = getDefaultPreferences(123);
      expect(prefs.userId).toBe(123);
      expect(prefs.theme).toBe('auto');
      expect(prefs.language).toBe('zh-CN');
      expect(prefs.timezone).toBe('Asia/Shanghai');
      expect(prefs.refreshInterval).toBe(5);
      expect(prefs.chartType).toBe('candlestick');
      expect(prefs.chartPeriod).toBe('1d');
    });

    it('should include major indices in favorites', () => {
      const prefs = getDefaultPreferences(1);
      expect(prefs.favoriteIndices).toContain('000001.SH');
      expect(prefs.favoriteIndices).toContain('399001.SZ');
      expect(prefs.favoriteIndices).toContain('399006.SZ');
    });
  });

  describe('Type interfaces', () => {
    it('should allow User creation', () => {
      const user: User = {
        id: 1,
        username: 'trader01',
        email: 'trader@example.com',
        role: 'user',
        status: 'active',
        loginCount: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(user.username).toBe('trader01');
    });

    it('should allow UserPreferences creation', () => {
      const prefs: UserPreferences = {
        id: 1,
        ...getDefaultPreferences(1),
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(prefs.theme).toBe('auto');
    });

    it('should allow Watchlist creation', () => {
      const watchlist: Watchlist = {
        id: 1,
        userId: 1,
        name: '自选股',
        isDefault: true,
        sortOrder: 0,
        stockCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(watchlist.name).toBe('自选股');
    });

    it('should allow UserAlert creation', () => {
      const alert: UserAlert = {
        id: 1,
        userId: 1,
        stockId: 1,
        stockSymbol: '000001.SZ',
        alertType: 'price_above',
        condition: { operator: '>', value: 15 },
        value: 15,
        isActive: true,
        createdAt: new Date(),
      };
      expect(alert.alertType).toBe('price_above');
    });
  });

  describe('Alert types', () => {
    it('should support all alert types', () => {
      const alertTypes: AlertType[] = [
        'price_above',
        'price_below',
        'change_percent',
        'volume_surge',
        'turnover_surge',
        'macd_golden_cross',
        'macd_death_cross',
        'rsi_overbought',
        'rsi_oversold',
        'limit_up',
        'limit_down',
      ];
      alertTypes.forEach(type => {
        const alert: UserAlert = {
          id: 1,
          userId: 1,
          stockId: 1,
          stockSymbol: '000001.SZ',
          alertType: type,
          condition: { operator: '>', value: 0 },
          value: 0,
          isActive: true,
          createdAt: new Date(),
        };
        expect(alert.alertType).toBe(type);
      });
    });
  });

  describe('User roles and status', () => {
    it('should support all user roles', () => {
      const roles: UserRole[] = ['guest', 'user', 'vip', 'admin'];
      roles.forEach(role => {
        const user: User = {
          id: 1,
          username: 'test',
          role,
          status: 'active',
          loginCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(user.role).toBe(role);
      });
    });

    it('should support all user statuses', () => {
      const statuses: UserStatus[] = ['active', 'inactive', 'banned', 'pending'];
      statuses.forEach(status => {
        const user: User = {
          id: 1,
          username: 'test',
          role: 'user',
          status,
          loginCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(user.status).toBe(status);
      });
    });
  });
});
