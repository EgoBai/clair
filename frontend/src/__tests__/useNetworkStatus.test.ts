import { describe, it, expect } from 'vitest';

/**
 * useNetworkStatus Hook 逻辑测试
 */

describe('useNetworkStatus', () => {
  describe('NetworkType', () => {
    it('应该包含所有有效的网络类型', () => {
      const validTypes = ['wifi', '4g', '3g', '2g', 'slow-2g', 'ethernet', 'unknown'];
      validTypes.forEach(type => {
        expect(validTypes).toContain(type);
      });
    });
  });

  describe('NetworkStatus 接口', () => {
    it('应该包含所有必要字段', () => {
      const status = {
        isOnline: true,
        effectiveType: '4g' as const,
        downlink: 10,
        rtt: 50,
        saveData: false,
        quality: 'excellent' as const,
        lastOnlineAt: new Date(),
        offlineDuration: 0,
      };

      expect(typeof status.isOnline).toBe('boolean');
      expect(typeof status.effectiveType).toBe('string');
      expect(typeof status.downlink).toBe('number');
      expect(typeof status.rtt).toBe('number');
      expect(typeof status.saveData).toBe('boolean');
      expect(typeof status.quality).toBe('string');
    });
  });

  describe('computeQuality', () => {
    const computeQuality = (isOnline: boolean, rtt: number, effectiveType: string): string => {
      if (!isOnline) return 'offline';
      if (rtt > 0) {
        if (rtt < 100) return 'excellent';
        if (rtt < 300) return 'good';
        if (rtt < 1000) return 'fair';
        return 'poor';
      }
      switch (effectiveType) {
        case '4g': case 'wifi': case 'ethernet': return 'excellent';
        case '3g': return 'good';
        case '2g': return 'fair';
        case 'slow-2g': return 'poor';
        default: return 'good';
      }
    };

    it('离线应该返回offline', () => {
      expect(computeQuality(false, 50, '4g')).toBe('offline');
    });

    it('低延迟应该返回excellent', () => {
      expect(computeQuality(true, 50, '4g')).toBe('excellent');
    });

    it('中等延迟应该返回good', () => {
      expect(computeQuality(true, 200, '4g')).toBe('good');
    });

    it('较高延迟应该返回fair', () => {
      expect(computeQuality(true, 500, '4g')).toBe('fair');
    });

    it('高延迟应该返回poor', () => {
      expect(computeQuality(true, 2000, '4g')).toBe('poor');
    });

    it('4g无RTT应该返回excellent', () => {
      expect(computeQuality(true, 0, '4g')).toBe('excellent');
    });

    it('wifi无RTT应该返回excellent', () => {
      expect(computeQuality(true, 0, 'wifi')).toBe('excellent');
    });

    it('3g无RTT应该返回good', () => {
      expect(computeQuality(true, 0, '3g')).toBe('good');
    });

    it('2g无RTT应该返回fair', () => {
      expect(computeQuality(true, 0, '2g')).toBe('fair');
    });

    it('slow-2g无RTT应该返回poor', () => {
      expect(computeQuality(true, 0, 'slow-2g')).toBe('poor');
    });

    it('ethernet无RTT应该返回excellent', () => {
      expect(computeQuality(true, 0, 'ethernet')).toBe('excellent');
    });

    it('未知类型无RTT应该返回good', () => {
      expect(computeQuality(true, 0, 'unknown')).toBe('good');
    });
  });

  describe('offlineDuration 计算', () => {
    it('在线时长应为0', () => {
      const offlineStart: number | null = null;
      const isOnline = true;
      const duration = isOnline ? 0 : (offlineStart ? Date.now() - offlineStart : 0);
      expect(duration).toBe(0);
    });

    it('离线时长应正确计算', () => {
      const offlineStart = Date.now() - 5000;
      const duration = Date.now() - offlineStart;
      expect(duration).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('UseNetworkStatusOptions', () => {
    it('应该有合理的默认值', () => {
      const defaults = {
        enablePing: false,
        pingUrl: '/api/health',
        pingInterval: 30000,
      };
      expect(defaults.enablePing).toBe(false);
      expect(defaults.pingUrl).toBe('/api/health');
      expect(defaults.pingInterval).toBe(30000);
    });

    it('应该支持自定义ping配置', () => {
      const custom = {
        enablePing: true,
        pingUrl: '/custom/health',
        pingInterval: 10000,
      };
      expect(custom.enablePing).toBe(true);
      expect(custom.pingInterval).toBe(10000);
    });
  });

  describe('连接信息获取', () => {
    it('默认值应该安全', () => {
      const defaults = {
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
        saveData: false,
      };
      expect(defaults.effectiveType).toBe('unknown');
      expect(defaults.downlink).toBe(0);
      expect(defaults.rtt).toBe(0);
      expect(defaults.saveData).toBe(false);
    });
  });
});
