/**
 * 告警引擎
 * 支持自定义规则、阈值告警、频率控制、多渠道通知
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'console' | 'webhook' | 'email' | 'sms' | 'websocket';
export type AlertTriggerMode = 'once' | 'once_per_bar' | 'every_time';
export type IndicatorType = 'price' | 'volume' | 'change' | 'macd_cross' | 'rsi' | 'bollinger' | 'ma_cross';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: () => Promise<boolean>;
  channels: AlertChannel[];
  cooldownMs: number;
  enabled: boolean;
  // 高级功能 (TradingView-style)
  triggerMode?: AlertTriggerMode;
  indicatorType?: IndicatorType;
  // 统计
  triggerCount?: number;
  lastTriggeredAt?: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  channels: AlertChannel[];
  // 上下文数据
  metadata?: Record<string, unknown>;
}

export interface AlertEngineStats {
  totalRules: number;
  activeRules: number;
  totalAlerts: number;
  activeAlerts: number;
  lastCheck: string;
}

class AlertEngine {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: AlertEvent[] = [];
  private lastTriggered: Map<string, number> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private wsNotifyFn: ((alert: AlertEvent) => void) | null = null;

  /** 设置WebSocket通知回调 */
  setWebSocketNotify(fn: (alert: AlertEvent) => void): void {
    this.wsNotifyFn = fn;
  }

  /**
   * 注册告警规则
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 移除告警规则
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 启用/禁用规则
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) rule.enabled = enabled;
  }

  /**
   * 执行所有规则检查
   */
  async checkAll(): Promise<AlertEvent[]> {
    const newAlerts: AlertEvent[] = [];
    const now = Date.now();

    for (const [id, rule] of this.rules) {
      if (!rule.enabled) continue;

      const lastTrigger = this.lastTriggered.get(id) || 0;
      if (now - lastTrigger < rule.cooldownMs) continue;

      try {
        const triggered = await rule.condition();
        if (triggered) {
          const alert: AlertEvent = {
            id: `alert_${now}_${Math.random().toString(36).substr(2, 9)}`,
            ruleId: id,
            ruleName: rule.name,
            severity: rule.severity,
            message: `告警触发: ${rule.name} - ${rule.description}`,
            timestamp: new Date().toISOString(),
            resolved: false,
            channels: rule.channels,
            metadata: {
              triggerMode: rule.triggerMode || 'once',
              indicatorType: rule.indicatorType,
              triggerCount: (rule.triggerCount || 0) + 1,
            },
          };

          this.alerts.push(alert);
          this.lastTriggered.set(id, now);
          newAlerts.push(alert);

          // 更新规则统计
          rule.triggerCount = (rule.triggerCount || 0) + 1;
          rule.lastTriggeredAt = new Date().toISOString();

          this.notify(alert);

          // WebSocket实时推送
          if (this.wsNotifyFn) {
            this.wsNotifyFn(alert);
          }
        }
      } catch (error) {
        console.error(`告警规则 ${rule.name} 执行失败:`, error);
      }
    }

    return newAlerts;
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertEvent[] {
    return this.alerts.filter((a) => !a.resolved);
  }

  /**
   * 获取所有告警历史
   */
  getAllAlerts(limit = 100): AlertEvent[] {
    return this.alerts.slice(-limit);
  }

  /**
   * 获取统计信息
   */
  getStats(): AlertEngineStats {
    const activeRules = Array.from(this.rules.values()).filter((r) => r.enabled);
    const activeAlerts = this.alerts.filter((a) => !a.resolved);

    return {
      totalRules: this.rules.size,
      activeRules: activeRules.length,
      totalAlerts: this.alerts.length,
      activeAlerts: activeAlerts.length,
      lastCheck: new Date().toISOString(),
    };
  }

  /** 获取规则触发统计 */
  getRuleTriggerStats(): Array<{ ruleId: string; name: string; triggerCount: number; lastTriggeredAt?: string }> {
    return Array.from(this.rules.values()).map(r => ({
      ruleId: r.id,
      name: r.name,
      triggerCount: r.triggerCount || 0,
      lastTriggeredAt: r.lastTriggeredAt,
    }));
  }

  /**
   * 通知渠道分发
   */
  private notify(alert: AlertEvent): void {
    for (const channel of alert.channels) {
      switch (channel) {
        case 'console': {
          const prefix = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`${prefix} [ALERT] ${alert.message}`);
          break;
        }
        case 'webhook':
          // POST to webhook URL - 实际集成时实现
          break;
        case 'email':
          // Send email notification - 实际集成时实现
          break;
        case 'sms':
          // Send SMS notification - 实际集成时实现
          break;
        case 'websocket':
          // WebSocket push handled via wsNotifyFn callback
          break;
      }
    }
  }

  /**
   * 清空告警历史
   */
  clearHistory(): void {
    this.alerts = [];
  }

  /**
   * 停止自动检查
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const alertEngine = new AlertEngine();
