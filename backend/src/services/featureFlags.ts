/**
 * 功能开关(Feature Flags)服务
 * 支持百分比发布、用户分组、时间窗口、条件组合
 */

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  // 发布策略
  strategy: 'boolean' | 'percentage' | 'user_list' | 'group' | 'time_window' | 'composite';
  // 百分比策略 (0-100)
  percentage?: number;
  // 用户白名单
  allowedUsers?: string[];
  // 用户分组
  groups?: string[];
  // 时间窗口
  startTime?: string;  // ISO 8601
  endTime?: string;
  // 组合策略
  rules?: FeatureFlagRule[];
  // 元数据
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface FeatureFlagRule {
  type: 'percentage' | 'user_list' | 'group' | 'time_window' | 'attribute';
  operator: 'and' | 'or';
  value: number | string[] | string;
  attribute?: string;
  attributeValue?: string;
}

export interface FlagEvaluationContext {
  userId?: string;
  userGroups?: string[];
  attributes?: Record<string, string>;
  timestamp?: string;
}

export interface FlagEvaluationResult {
  key: string;
  enabled: boolean;
  variant?: string;
  reason: string;
}

class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, { result: boolean; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1分钟缓存

  constructor() {
    this.loadDefaultFlags();
  }

  private loadDefaultFlags(): void {
    const defaults: FeatureFlag[] = [
      {
        key: 'dark_mode',
        name: '深色模式',
        description: '启用深色主题',
        enabled: true,
        strategy: 'boolean',
        tags: ['ui'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'advanced_charts',
        name: '高级图表',
        description: '启用K线高级分析图表',
        enabled: true,
        strategy: 'percentage',
        percentage: 50,
        tags: ['feature', 'charts'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'realtime_quotes',
        name: '实时行情',
        description: 'WebSocket实时行情推送',
        enabled: true,
        strategy: 'boolean',
        tags: ['data', 'realtime'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'ai_analysis',
        name: 'AI分析',
        description: 'AI驱动的股票分析建议',
        enabled: true,
        strategy: 'user_list',
        allowedUsers: ['admin', 'beta_user_1'],
        tags: ['ai', 'beta'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'portfolio_backtest',
        name: '组合回测',
        description: '投资组合历史回测功能',
        enabled: true,
        strategy: 'percentage',
        percentage: 30,
        tags: ['feature', 'portfolio'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'market_heatmap',
        name: '市场热力图',
        description: '板块热力图可视化',
        enabled: true,
        strategy: 'boolean',
        tags: ['visualization'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'options_analyzer',
        name: '期权分析器',
        description: '期权链分析和定价工具',
        enabled: false,
        strategy: 'group',
        groups: ['premium', 'institutional'],
        tags: ['options', 'premium'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        key: 'webhook_notifications',
        name: 'Webhook通知',
        description: '通过Webhook推送交易信号',
        enabled: true,
        strategy: 'time_window',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-12-31T23:59:59Z',
        tags: ['notifications'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const flag of defaults) {
      this.flags.set(flag.key, flag);
    }
  }

  // 获取所有开关
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  // 获取单个开关
  getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  // 创建/更新开关
  upsertFlag(flag: FeatureFlag): FeatureFlag {
    flag.updatedAt = new Date().toISOString();
    this.flags.set(flag.key, flag);
    this.invalidateCache(flag.key);
    return flag;
  }

  // 删除开关
  deleteFlag(key: string): boolean {
    this.invalidateCache(key);
    return this.flags.delete(key);
  }

  // 评估开关状态
  evaluate(key: string, context: FlagEvaluationContext = {}): FlagEvaluationResult {
    const flag = this.flags.get(key);
    
    if (!flag) {
      return { key, enabled: false, reason: 'flag_not_found' };
    }

    if (!flag.enabled) {
      return { key, enabled: false, reason: 'flag_disabled' };
    }

    // 检查缓存
    const cacheKey = `${key}:${JSON.stringify(context)}`;
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { key, enabled: cached.result, reason: 'cached' };
    }

    let enabled = false;
    let reason = '';

    switch (flag.strategy) {
      case 'boolean':
        enabled = true;
        reason = 'boolean_enabled';
        break;

      case 'percentage':
        enabled = this.evaluatePercentage(flag.percentage ?? 0, context.userId);
        reason = enabled ? 'percentage_match' : 'percentage_skip';
        break;

      case 'user_list':
        enabled = this.evaluateUserList(flag.allowedUsers ?? [], context.userId);
        reason = enabled ? 'user_allowed' : 'user_not_allowed';
        break;

      case 'group':
        enabled = this.evaluateGroup(flag.groups ?? [], context.userGroups ?? []);
        reason = enabled ? 'group_match' : 'group_no_match';
        break;

      case 'time_window':
        enabled = this.evaluateTimeWindow(flag.startTime, flag.endTime);
        reason = enabled ? 'time_in_window' : 'time_outside_window';
        break;

      case 'composite':
        enabled = this.evaluateComposite(flag.rules ?? [], context);
        reason = enabled ? 'composite_match' : 'composite_no_match';
        break;
    }

    // 缓存结果
    this.evaluationCache.set(cacheKey, {
      result: enabled,
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    return { key, enabled, reason };
  }

  // 批量评估
  evaluateAll(context: FlagEvaluationContext = {}): FlagEvaluationResult[] {
    return Array.from(this.flags.keys()).map(key => this.evaluate(key, context));
  }

  private evaluatePercentage(percentage: number, userId?: string): boolean {
    // 使用用户ID的哈希确保一致性
    const hash = userId ? this.hashString(userId) % 100 : Math.floor(Math.random() * 100);
    return hash < percentage;
  }

  private evaluateUserList(allowedUsers: string[], userId?: string): boolean {
    return userId ? allowedUsers.includes(userId) : false;
  }

  private evaluateGroup(requiredGroups: string[], userGroups: string[]): boolean {
    return requiredGroups.some(g => userGroups.includes(g));
  }

  private evaluateTimeWindow(startTime?: string, endTime?: boolean): boolean {
    if (!startTime || !endTime) return true;
    const now = Date.now();
    return now >= new Date(startTime).getTime() && now <= new Date(endTime as string).getTime();
  }

  private evaluateComposite(rules: FeatureFlagRule[], context: FlagEvaluationContext): boolean {
    if (rules.length === 0) return false;
    
    return rules.every(rule => {
      const result = this.evaluateRule(rule, context);
      return rule.operator === 'or' ? result : result;
    });
  }

  private evaluateRule(rule: FeatureFlagRule, context: FlagEvaluationContext): boolean {
    switch (rule.type) {
      case 'percentage':
        return this.evaluatePercentage(rule.value as number, context.userId);
      case 'user_list':
        return this.evaluateUserList(rule.value as string[], context.userId);
      case 'group':
        return this.evaluateGroup([rule.value as string], context.userGroups ?? []);
      case 'time_window':
        return true; // 简化实现
      case 'attribute':
        return context.attributes?.[rule.attribute!] === rule.attributeValue;
      default:
        return false;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private invalidateCache(key: string): void {
    for (const [cacheKey] of this.evaluationCache) {
      if (cacheKey.startsWith(key + ':')) {
        this.evaluationCache.delete(cacheKey);
      }
    }
  }

  // 获取开关统计
  getStats(): { total: number; enabled: number; byStrategy: Record<string, number>; byTag: Record<string, number> } {
    const flags = this.getAllFlags();
    const byStrategy: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    
    let enabled = 0;
    for (const flag of flags) {
      if (flag.enabled) enabled++;
      byStrategy[flag.strategy] = (byStrategy[flag.strategy] || 0) + 1;
      for (const tag of flag.tags ?? []) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }
    
    return { total: flags.length, enabled, byStrategy, byTag };
  }

  // 导出配置
  exportFlags(): string {
    return JSON.stringify(Array.from(this.flags.values()), null, 2);
  }

  // 导入配置
  importFlags(json: string): number {
    const flags: FeatureFlag[] = JSON.parse(json);
    for (const flag of flags) {
      this.upsertFlag(flag);
    }
    return flags.length;
  }
}

export const featureFlagService = new FeatureFlagService();
