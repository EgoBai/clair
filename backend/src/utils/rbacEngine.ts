/**
 * RBAC 权限引擎
 * 支持：角色继承、资源层级、操作粒度、条件权限、审计日志
 */

// ===== 类型定义 =====

export type Action = 'create' | 'read' | 'update' | 'delete' | 'export' | 'import' | 'approve' | 'execute' | 'admin';

export interface Resource {
  type: string;        // 资源类型: stock, portfolio, user, system, report 等
  id?: string;         // 资源实例ID (可选，空则表示该类型所有资源)
  attributes?: Record<string, unknown>; // 资源属性，用于条件判断
}

export interface Permission {
  id: string;
  resource: string;    // 资源类型，支持通配符 * 和层级 a:b
  action: Action | '*';
  effect: 'allow' | 'deny';
  conditions?: PermissionCondition[];
  priority?: number;   // 优先级，越高越优先，默认0
}

export interface PermissionCondition {
  field: string;       // 路径表达式，如 'resource.attributes.ownerId'
  operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'regex';
  value: unknown;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  inherits?: string[];  // 继承的角色ID列表
  isSystem?: boolean;   // 系统角色不可删除
  metadata?: Record<string, unknown>;
}

export interface RBACContext {
  userId: string;
  roles: string[];
  attributes?: Record<string, unknown>; // 用户属性
  ip?: string;
  timestamp?: number;
  userAgent?: string;
  sessionId?: string;
  scope?: string[];         // OAuth-style scope constraints
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: 'allow' | 'deny';
  reason?: string;
  context?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  duration?: number;        // 请求处理时长(ms)
  riskScore?: number;       // 风险评分 0-100
  tags?: string[];          // 审计标签，便于分类检索
}

export interface PermissionCheckResult {
  allowed: boolean;
  matchedPermission?: Permission;
  reason: string;
  evaluatedAt: number;
  riskScore?: number;
}

// ===== 权限组（对标Notion/Linear权限模板）=====

export interface PermissionGroup {
  id: string;
  name: string;
  description?: string;
  permissionIds: string[];   // 包含的权限ID
  isSystem?: boolean;
}

// ===== 时间条件（营业时间限制等）=====

export interface TimeCondition {
  daysOfWeek?: number[];     // 0=Sunday, 6=Saturday
  startTime?: string;        // HH:mm format
  endTime?: string;          // HH:mm format
  timezone?: string;         // default Asia/Shanghai
}

// ===== RBAC 引擎 =====

export class RBACEngine {
  private roles = new Map<string, Role>();
  private permissionGroups = new Map<string, PermissionGroup>();
  private auditLog: AuditEntry[] = [];
  private auditMaxSize: number;

  constructor(options?: { auditMaxSize?: number }) {
    this.auditMaxSize = options?.auditMaxSize ?? 10000;
    this.initializeSystemRoles();
    this.initializePermissionGroups();
  }

  /**
   * 初始化系统默认角色
   */
  private initializeSystemRoles(): void {
    // 超级管理员 - 拥有所有权限
    this.addRole({
      id: 'superadmin',
      name: '超级管理员',
      description: '系统最高权限，可执行所有操作',
      isSystem: true,
      permissions: [{
        id: 'superadmin-all',
        resource: '*',
        action: '*',
        effect: 'allow',
        priority: 100,
      }],
    });

    // 管理员
    this.addRole({
      id: 'admin',
      name: '管理员',
      description: '系统管理员，管理用户和系统配置',
      isSystem: true,
      inherits: ['analyst'],
      permissions: [
        { id: 'admin-user-mgmt', resource: 'user', action: '*', effect: 'allow' },
        { id: 'admin-system', resource: 'system', action: '*', effect: 'allow' },
        { id: 'admin-report', resource: 'report', action: '*', effect: 'allow' },
        { id: 'admin-audit', resource: 'audit', action: 'read', effect: 'allow' },
      ],
    });

    // 分析师
    this.addRole({
      id: 'analyst',
      name: '分析师',
      description: '数据分析师，可查看和分析所有数据',
      isSystem: true,
      inherits: ['trader'],
      permissions: [
        { id: 'analyst-export', resource: 'stock', action: 'export', effect: 'allow' },
        { id: 'analyst-report-create', resource: 'report', action: 'create', effect: 'allow' },
        { id: 'analyst-report-read', resource: 'report', action: 'read', effect: 'allow' },
        { id: 'analyst-bulk-read', resource: 'stock:bulk', action: 'read', effect: 'allow' },
      ],
    });

    // 交易员
    this.addRole({
      id: 'trader',
      name: '交易员',
      description: '可管理投资组合和执行交易',
      isSystem: true,
      inherits: ['viewer'],
      permissions: [
        { id: 'trader-portfolio-crud', resource: 'portfolio', action: 'create', effect: 'allow' },
        { id: 'trader-portfolio-update', resource: 'portfolio', action: 'update', effect: 'allow' },
        { id: 'trader-portfolio-delete', resource: 'portfolio', action: 'delete', effect: 'allow' },
        { id: 'trader-trade-execute', resource: 'trade', action: 'execute', effect: 'allow' },
        { id: 'trader-watchlist', resource: 'watchlist', action: '*', effect: 'allow' },
      ],
    });

    // 查看者
    this.addRole({
      id: 'viewer',
      name: '查看者',
      description: '只读权限，可查看股票和市场数据',
      isSystem: true,
      permissions: [
        { id: 'viewer-stock-read', resource: 'stock', action: 'read', effect: 'allow' },
        { id: 'viewer-market-read', resource: 'market', action: 'read', effect: 'allow' },
        { id: 'viewer-portfolio-read', resource: 'portfolio', action: 'read', effect: 'allow' },
        { id: 'viewer-index-read', resource: 'index', action: 'read', effect: 'allow' },
      ],
    });

    // 访客 (最低权限)
    this.addRole({
      id: 'guest',
      name: '访客',
      description: '仅可查看公开市场数据',
      isSystem: true,
      permissions: [
        { id: 'guest-market-public', resource: 'market', action: 'read', effect: 'allow',
          conditions: [{ field: 'resource.attributes.public', operator: 'eq', value: true }] },
      ],
    });
  }

  /**
   * 初始化权限组（对标Linear/Notion权限模板）
   */
  private initializePermissionGroups(): void {
    this.permissionGroups.set('stock-read', {
      id: 'stock-read',
      name: '股票只读',
      description: '查看股票行情和基本信息',
      permissionIds: ['viewer-stock-read'],
      isSystem: true,
    });
    this.permissionGroups.set('portfolio-manage', {
      id: 'portfolio-manage',
      name: '投资组合管理',
      description: '创建、修改和删除投资组合',
      permissionIds: ['trader-portfolio-crud', 'trader-portfolio-update', 'trader-portfolio-delete'],
      isSystem: true,
    });
    this.permissionGroups.set('trade-execute', {
      id: 'trade-execute',
      name: '交易执行',
      description: '执行买卖交易操作',
      permissionIds: ['trader-trade-execute'],
      isSystem: true,
    });
    this.permissionGroups.set('user-admin', {
      id: 'user-admin',
      name: '用户管理',
      description: '管理用户账户和角色分配',
      permissionIds: ['admin-user-mgmt'],
      isSystem: true,
    });
    this.permissionGroups.set('system-admin', {
      id: 'system-admin',
      name: '系统管理',
      description: '系统配置和运维管理',
      permissionIds: ['admin-system'],
      isSystem: true,
    });
  }

  // ===== 角色管理 =====

  addRole(role: Role): void {
    this.roles.set(role.id, { ...role, permissions: [...role.permissions] });
  }

  removeRole(roleId: string): boolean {
    const role = this.roles.get(roleId);
    if (!role) return false;
    if (role.isSystem) return false; // 不能删除系统角色

    // 检查是否有其他角色继承此角色
    for (const [, r] of this.roles) {
      if (r.inherits?.includes(roleId)) return false;
    }

    this.roles.delete(roleId);
    return true;
  }

  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  // ===== 权限组管理 =====

  addPermissionGroup(group: PermissionGroup): void {
    this.permissionGroups.set(group.id, { ...group, permissionIds: [...group.permissionIds] });
  }

  removePermissionGroup(groupId: string): boolean {
    const group = this.permissionGroups.get(groupId);
    if (!group || group.isSystem) return false;
    this.permissionGroups.delete(groupId);
    return true;
  }

  getPermissionGroup(groupId: string): PermissionGroup | undefined {
    return this.permissionGroups.get(groupId);
  }

  getAllPermissionGroups(): PermissionGroup[] {
    return Array.from(this.permissionGroups.values());
  }

  /**
   * 将权限组应用到角色
   */
  applyGroupToRole(roleId: string, groupId: string): boolean {
    const role = this.roles.get(roleId);
    const group = this.permissionGroups.get(groupId);
    if (!role || !group) return false;
    if (role.isSystem) return false;

    const groupPerms: Permission[] = group.permissionIds.map(permId => ({
      id: `${roleId}-${permId}`,
      resource: '*',
      action: '*' as const,
      effect: 'allow' as const,
    }));

    // 实际应用中需要从权限ID解析出具体的resource和action
    // 这里简化处理
    role.permissions = [...role.permissions, ...groupPerms];
    return true;
  }

  // ===== 风险评分 =====

  /**
   * 计算操作风险评分 (0-100)
   */
  calculateRiskScore(context: RBACContext, action: string, resource: Resource): number {
    let score = 0;

    // 删除操作风险更高
    if (action === 'delete') score += 30;
    else if (action === 'admin') score += 40;
    else if (action === 'execute') score += 25;

    // 系统资源更敏感
    if (resource.type === 'system' || resource.type === 'user') score += 20;

    // 非工作时间操作增加风险
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) score += 15;

    // 非常规IP增加风险（简化判断）
    if (!context.ip || context.ip === '127.0.0.1') score += 5;

    return Math.min(100, score);
  }

  // ===== 时间条件检查 =====

  /**
   * 检查时间条件是否满足
   */
  checkTimeCondition(condition: TimeCondition): boolean {
    const now = new Date();

    if (condition.daysOfWeek && condition.daysOfWeek.length > 0) {
      if (!condition.daysOfWeek.includes(now.getDay())) return false;
    }

    if (condition.startTime && condition.endTime) {
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentTime < condition.startTime || currentTime > condition.endTime) return false;
    }

    return true;
  }

  updateRole(roleId: string, updates: Partial<Role>): boolean {
    const role = this.roles.get(roleId);
    if (!role) return false;
    if (role.isSystem && updates.permissions) return false; // 不能修改系统角色权限

    const updated = { ...role, ...updates };
    if (updates.permissions) {
      updated.permissions = [...updates.permissions];
    }
    this.roles.set(roleId, updated);
    return true;
  }

  // ===== 权限继承解析 =====

  /**
   * 获取角色的所有权限（包括继承的）
   */
  getEffectivePermissions(roleId: string, visited = new Set<string>()): Permission[] {
    if (visited.has(roleId)) return []; // 防止循环继承
    visited.add(roleId);

    const role = this.roles.get(roleId);
    if (!role) return [];

    let permissions = [...role.permissions];

    // 递归获取继承角色的权限
    if (role.inherits) {
      for (const inheritedId of role.inherits) {
        const inheritedPerms = this.getEffectivePermissions(inheritedId, visited);
        permissions = [...permissions, ...inheritedPerms];
      }
    }

    return permissions;
  }

  /**
   * 获取用户所有有效权限
   */
  getUserEffectivePermissions(context: RBACContext): Permission[] {
    const allPerms: Permission[] = [];
    for (const roleId of context.roles) {
      allPerms.push(...this.getEffectivePermissions(roleId));
    }
    return allPerms;
  }

  // ===== 权限检查 =====

  /**
   * 检查权限
   */
  checkPermission(
    context: RBACContext,
    action: Action | string,
    resource: Resource
  ): PermissionCheckResult {
    const startTime = Date.now();
    const permissions = this.getUserEffectivePermissions(context);

    // 按优先级排序 (高优先级在前)
    const sortedPerms = [...permissions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    let bestAllow: PermissionCheckResult | null = null;
    let bestDeny: PermissionCheckResult | null = null;

    for (const perm of sortedPerms) {
      // 检查资源匹配
      if (!this.matchResource(perm.resource, resource.type)) continue;

      // 检查操作匹配
      if (perm.action !== '*' && perm.action !== action) continue;

      // 检查条件
      if (perm.conditions && perm.conditions.length > 0) {
        const condResult = this.evaluateConditions(perm.conditions, resource, context);
        if (!condResult) continue;
      }

      const result: PermissionCheckResult = {
        allowed: perm.effect === 'allow',
        matchedPermission: perm,
        reason: perm.effect === 'allow' ? `权限通过: ${perm.id}` : `权限被拒绝: ${perm.id}`,
        evaluatedAt: startTime,
      };

      if (perm.effect === 'deny') {
        if (!bestDeny) bestDeny = result;
      } else {
        if (!bestAllow) bestAllow = result;
      }

      // 如果已经找到最高优先级的allow和deny，停止搜索
      if (bestAllow && bestDeny) break;
    }

    // 计算风险评分
    const riskScore = this.calculateRiskScore(context, String(action), resource);

    // Deny 优先：如果有同优先级或更高优先级的deny，拒绝
    if (bestDeny && bestAllow) {
      const denyPriority = bestDeny.matchedPermission?.priority ?? 0;
      const allowPriority = bestAllow.matchedPermission?.priority ?? 0;
      if (denyPriority >= allowPriority) {
        this.recordAudit({
          userId: context.userId,
          action: String(action),
          resource: resource.type,
          resourceId: resource.id,
          result: 'deny',
          reason: bestDeny.reason,
          ip: context.ip,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          riskScore,
        });
        return { ...bestDeny, riskScore };
      }
    }

    if (bestDeny && !bestAllow) {
      this.recordAudit({
        userId: context.userId,
        action: String(action),
        resource: resource.type,
        resourceId: resource.id,
        result: 'deny',
        reason: bestDeny.reason,
        ip: context.ip,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        riskScore,
      });
      return { ...bestDeny, riskScore };
    }

    if (bestAllow) {
      this.recordAudit({
        userId: context.userId,
        action: String(action),
        resource: resource.type,
        resourceId: resource.id,
        result: 'allow',
        reason: bestAllow.reason,
        ip: context.ip,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        riskScore,
      });
      return { ...bestAllow, riskScore };
    }

    // 没有匹配的权限 → 默认拒绝
    const result: PermissionCheckResult = {
      allowed: false,
      reason: '无匹配权限，默认拒绝',
      evaluatedAt: startTime,
      riskScore,
    };

    this.recordAudit({
      userId: context.userId,
      action: String(action),
      resource: resource.type,
      resourceId: resource.id,
      result: 'deny',
      reason: result.reason,
      ip: context.ip,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      riskScore,
    });

    return result;
  }

  /**
   * 检查是否拥有任一权限
   */
  hasAnyPermission(context: RBACContext, checks: Array<{ action: Action | string; resource: string }>): boolean {
    return checks.some(({ action, resource }) =>
      this.checkPermission(context, action, { type: resource }).allowed
    );
  }

  /**
   * 检查是否拥有所有权限
   */
  hasAllPermissions(context: RBACContext, checks: Array<{ action: Action | string; resource: string }>): boolean {
    return checks.every(({ action, resource }) =>
      this.checkPermission(context, action, { type: resource }).allowed
    );
  }

  // ===== 资源匹配 =====

  /**
   * 匹配资源类型（支持通配符和层级）
   */
  matchResource(pattern: string, resourceType: string): boolean {
    // 通配符
    if (pattern === '*') return true;

    // 精确匹配
    if (pattern === resourceType) return true;

    // 层级匹配: stock:* 匹配 stock:sh600000
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return resourceType.startsWith(prefix + ':') || resourceType === prefix;
    }

    // 前缀匹配: stock 匹配 stock:sh600000
    if (!pattern.includes('*') && !pattern.includes(':')) {
      return resourceType === pattern || resourceType.startsWith(pattern + ':');
    }

    // 通用通配符匹配
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/:/g, '\\:') + '$');
    return regex.test(resourceType);
  }

  // ===== 条件评估 =====

  private evaluateConditions(
    conditions: PermissionCondition[],
    resource: Resource,
    context: RBACContext
  ): boolean {
    return conditions.every(cond => {
      const actualValue = this.resolveField(cond.field, resource, context);
      return this.compareValues(actualValue, cond.operator, cond.value);
    });
  }

  private resolveField(field: string, resource: Resource, context: RBACContext): unknown {
    const parts = field.split('.');
    let current: Record<string, unknown> = {
      resource: { ...resource },
      context: { ...context },
    };

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part] as Record<string, unknown>;
      } else {
        return undefined;
      }
    }
    return current;
  }

  private compareValues(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'nin': return Array.isArray(expected) && !expected.includes(actual);
      case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'contains': return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'startsWith': return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
      case 'regex': return typeof actual === 'string' && typeof expected === 'string' && new RegExp(expected).test(actual);
      default: return false;
    }
  }

  // ===== 审计日志 =====

  private recordAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const auditEntry: AuditEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    // 自动计算风险评分（如果未提供）
    if (auditEntry.riskScore === undefined && auditEntry.result === 'deny') {
      auditEntry.riskScore = 60; // 拒绝操作基础风险分
    }

    this.auditLog.push(auditEntry);

    // 超出限制时清理旧记录
    if (this.auditLog.length > this.auditMaxSize) {
      this.auditLog = this.auditLog.slice(-this.auditMaxSize);
    }
  }

  getAuditLog(filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    result?: 'allow' | 'deny';
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): AuditEntry[] {
    let results = [...this.auditLog];

    if (filters) {
      if (filters.userId) results = results.filter(e => e.userId === filters.userId);
      if (filters.action) results = results.filter(e => e.action === filters.action);
      if (filters.resource) results = results.filter(e => e.resource === filters.resource);
      if (filters.result) results = results.filter(e => e.result === filters.result);
      if (filters.startTime !== undefined) {
        const startTime = filters.startTime;
        results = results.filter(e => e.timestamp >= startTime);
      }
      if (filters.endTime !== undefined) {
        const endTime = filters.endTime;
        results = results.filter(e => e.timestamp <= endTime);
      }
    }

    // 默认按时间倒序
    results.sort((a, b) => b.timestamp - a.timestamp);

    const offset = (filters && filters.offset !== undefined) ? filters.offset : 0;
    const limit = (filters && filters.limit !== undefined) ? filters.limit : 100;
    return results.slice(offset, offset + limit);
  }

  getAuditStats(): {
    total: number;
    allowed: number;
    denied: number;
    byResource: Record<string, number>;
    byAction: Record<string, number>;
    byUser: Record<string, number>;
  } {
    const stats = {
      total: this.auditLog.length,
      allowed: 0,
      denied: 0,
      byResource: {} as Record<string, number>,
      byAction: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
    };

    for (const entry of this.auditLog) {
      if (entry.result === 'allow') stats.allowed++;
      else stats.denied++;

      stats.byResource[entry.resource] = (stats.byResource[entry.resource] || 0) + 1;
      stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
      stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
    }

    return stats;
  }

  clearAuditLog(): void {
    this.auditLog = [];
  }

  // ===== 权限验证工具 =====

  /**
   * 验证角色定义是否合法
   */
  validateRole(role: Role): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!role.id || role.id.trim() === '') {
      errors.push('角色ID不能为空');
    }

    if (!role.name || role.name.trim() === '') {
      errors.push('角色名称不能为空');
    }

    if (!Array.isArray(role.permissions)) {
      errors.push('权限列表必须是数组');
    } else {
      for (let i = 0; i < role.permissions.length; i++) {
        const perm = role.permissions[i];
        if (!perm.id) errors.push(`权限[${i}]缺少ID`);
        if (!perm.resource) errors.push(`权限[${i}]缺少资源类型`);
        if (!perm.action) errors.push(`权限[${i}]缺少操作类型`);
        if (!['allow', 'deny'].includes(perm.effect)) {
          errors.push(`权限[${i}]效果必须为allow或deny`);
        }
      }
    }

    // 检查继承链是否循环
    if (role.inherits) {
      const visited = new Set<string>([role.id]);
      const checkCycle = (id: string): boolean => {
        const r = this.roles.get(id);
        if (!r?.inherits) return true;
        for (const inherited of r.inherits) {
          if (visited.has(inherited)) return false;
          visited.add(inherited);
          if (!checkCycle(inherited)) return false;
        }
        return true;
      };
      for (const inherited of role.inherits) {
        if (visited.has(inherited)) {
          errors.push(`继承链存在循环: ${role.id} -> ${inherited}`);
          break;
        }
        visited.add(inherited);
        if (!checkCycle(inherited)) {
          errors.push(`继承链存在循环`);
          break;
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取继承树
   */
  getInheritanceTree(roleId: string): { roleId: string; depth: number; children: string[] }[] {
    const tree: { roleId: string; depth: number; children: string[] }[] = [];
    const visited = new Set<string>();

    const traverse = (id: string, depth: number) => {
      if (visited.has(id)) return;
      visited.add(id);

      const role = this.roles.get(id);
      if (!role) return;

      tree.push({
        roleId: id,
        depth,
        children: role.inherits || [],
      });

      if (role.inherits) {
        for (const child of role.inherits) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(roleId, 0);
    return tree;
  }

  /**
   * 批量检查权限
   */
  batchCheck(
    context: RBACContext,
    checks: Array<{ action: Action | string; resource: Resource }>
  ): PermissionCheckResult[] {
    return checks.map(({ action, resource }) =>
      this.checkPermission(context, action, resource)
    );
  }
}

// ===== Express 中间件 =====

import { Request, Response, NextFunction } from 'express';

/**
 * RBAC 权限检查中间件工厂
 */
export function requirePermission(
  engine: RBACEngine,
  action: Action | string,
  resourceType: string,
  getResourceId?: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 从请求中提取用户上下文
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: '未认证', code: 'UNAUTHENTICATED' });
      return;
    }

    const context: RBACContext = {
      userId: String(user.userId || user.id),
      roles: user.roles || [user.role || 'viewer'],
      attributes: user.attributes,
      ip: req.ip,
      timestamp: Date.now(),
    };

    const resource: Resource = {
      type: resourceType,
      id: getResourceId?.(req),
    };

    const result = engine.checkPermission(context, action, resource);

    if (!result.allowed) {
      res.status(403).json({
        error: '权限不足',
        code: 'FORBIDDEN',
        reason: result.reason,
        required: { action, resource: resourceType },
      });
      return;
    }

    next();
  };
}

/**
 * 角色要求中间件
 */
export function requireRole(engine: RBACEngine, ...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: '未认证', code: 'UNAUTHENTICATED' });
      return;
    }

    const userRoles: string[] = user.roles || [user.role || 'viewer'];

    // 获取所有有效角色（包括继承的）
    const effectiveRoles = new Set<string>();
    for (const roleId of userRoles) {
      effectiveRoles.add(roleId);
      const tree = engine.getInheritanceTree(roleId);
      for (const node of tree) {
        effectiveRoles.add(node.roleId);
      }
    }

    const hasRole = requiredRoles.some(r => effectiveRoles.has(r));
    if (!hasRole) {
      res.status(403).json({
        error: '角色权限不足',
        code: 'INSUFFICIENT_ROLE',
        required: requiredRoles,
        current: userRoles,
      });
      return;
    }

    next();
  };
}

/**
 * 资源所有者检查中间件
 */
export function requireOwnerOrAdmin(
  engine: RBACEngine,
  resourceType: string,
  getOwnerId: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: '未认证', code: 'UNAUTHENTICATED' });
      return;
    }

    const userId = String(user.userId || user.id);
    const ownerId = getOwnerId(req);

    // 是资源所有者
    if (userId === ownerId) {
      next();
      return;
    }

    // 检查是否有管理员权限
    const context: RBACContext = {
      userId,
      roles: user.roles || [user.role || 'viewer'],
      ip: req.ip,
    };

    const result = engine.checkPermission(context, 'admin', { type: resourceType });
    if (result.allowed) {
      next();
      return;
    }

    res.status(403).json({
      error: '需要资源所有者或管理员权限',
      code: 'OWNER_OR_ADMIN_REQUIRED',
    });
  };
}
