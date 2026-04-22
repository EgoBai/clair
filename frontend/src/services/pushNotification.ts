/**
 * 推送通知服务
 * 支持浏览器原生通知 + Service Worker 推送
 */

import logger from '../utils/logger';
interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  requireInteraction?: boolean;
}

class PushNotificationService {
  private permission: NotificationPermission = 'default';
  private swRegistration: ServiceWorkerRegistration | null = null;

  /**
   * 初始化并请求通知权限
   */
  async init(): Promise<boolean> {
    if (!('Notification' in window)) {
      logger.warn('此浏览器不支持通知');
      return false;
    }

    // 获取 Service Worker 注册
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.ready;
      } catch (e) {
        logger.warn('Service Worker 未就绪:', e);
      }
    }

    // 如果已授权
    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return true;
    }

    // 如果被拒绝
    if (Notification.permission === 'denied') {
      this.permission = 'denied';
      return false;
    }

    // 请求权限
    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * 发送通知
   */
  async notify(payload: NotificationPayload): Promise<boolean> {
    if (this.permission !== 'granted') {
      logger.warn('通知权限未授予');
      return false;
    }

    const options = {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      tag: payload.tag || 'stock-alert',
      data: payload.data,
      requireInteraction: payload.requireInteraction || false,
      vibrate: [200, 100, 200],
    };

    try {
      if (this.swRegistration) {
        // 使用 Service Worker 显示通知（支持后台推送）
        await this.swRegistration.showNotification(payload.title, options);
      } else {
        // 使用原生 Notification API
        new Notification(payload.title, options);
      }
      return true;
    } catch (e) {
      logger.error('通知发送失败:', e);
      return false;
    }
  }

  /**
   * 股价预警通知
   */
  async notifyStockAlert(
    symbol: string,
    name: string,
    alertType: string,
    message: string
  ): Promise<boolean> {
    const typeLabels: Record<string, string> = {
      price_above: '价格突破',
      price_below: '价格跌破',
      change_above: '涨幅超限',
      change_below: '跌幅超限',
      volume_surge: '放量异动',
      limit_up: '涨停',
      limit_down: '跌停',
    };

    return this.notify({
      title: `🔔 ${name} (${symbol})`,
      body: `${typeLabels[alertType] || alertType}: ${message}`,
      tag: `alert-${symbol}`,
      data: { url: `/stock/${symbol}` },
      requireInteraction: true,
    });
  }

  /**
   * 系统通知
   */
  async notifySystem(title: string, message: string): Promise<boolean> {
    return this.notify({
      title,
      body: message,
      tag: 'system',
    });
  }

  /**
   * 检查通知支持
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * 获取当前权限状态
   */
  getPermission(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * 是否已授权
   */
  isGranted(): boolean {
    return Notification.permission === 'granted';
  }
}

export const pushNotification = new PushNotificationService();
export default PushNotificationService;
