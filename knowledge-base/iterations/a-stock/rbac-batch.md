# RBAC权限系统迭代记录 (Rounds 114-123)

## 概述
实现完整的RBAC（基于角色的访问控制）权限系统，包含角色管理、权限检查、审计日志、中间件和API。

## 新增文件
- `backend/src/utils/rbacEngine.ts` (768行) - RBAC核心引擎
- `backend/src/__tests__/rbacEngine.test.ts` - 基础权限测试 (71 tests)
- `backend/src/__tests__/rbacAdvanced.test.ts` - ABAC高级功能 (30 tests)
- `backend/src/__tests__/rbacMiddleware.test.ts` - 中间件集成 (21 tests)
- `backend/src/__tests__/rbacCompliance.test.ts` - 审计合规 (23 tests)
- `backend/src/__tests__/rbacStress.test.ts` - 压力测试 (17 tests)
- `backend/src/__tests__/rbacHierarchy.test.ts` - 层级导出 (23 tests)
- `backend/src/__tests__/rbacIntegration.test.ts` - 系统集成 (12 tests)
- `backend/src/__tests__/rbacSecurity.test.ts` - 安全测试 (20 tests)
- `backend/src/__tests__/rbacApi.test.ts` - API模拟 (22 tests)
- `backend/src/__tests__/rbacBusiness.test.ts` - 业务场景 (14 tests)

## 核心功能
1. **RBACEngine** - 角色/权限管理、继承解析、条件评估、审计日志
2. **6个系统角色** - superadmin > admin > analyst > trader > viewer > guest
3. **中间件** - requirePermission, requireRole, requireOwnerOrAdmin
4. **ABAC** - 属性条件 (eq/ne/in/nin/gt/lt/contains/startsWith/regex)
5. **审计** - 完整操作日志、统计、分页、过滤

## 测试统计
- 新增: +253 tests (253个新测试)
- 文件: +11 test files, +1 source file
- 总计: 18436 passed / 14 skipped

## 设计决策
- Deny优先: 同优先级下deny覆盖allow
- 默认拒绝: 无匹配权限时拒绝访问
- 角色继承: 支持多级继承和循环检测
- 审计日志: 自动淘汰旧记录，支持分页查询
- 系统角色: 不可删除/不可修改权限

## 下一步
Round 124-133: 通知系统（WebSocket/邮件/站内信/订阅/限频）
