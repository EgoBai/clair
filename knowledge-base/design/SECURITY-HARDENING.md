# 安全加固设计文档

## 概述

A股行情分析网站安全架构基于 OWASP Top 10 标准设计，面向金融级安全需求。

## 安全架构层次

```
请求 → IP黑名单检查 → UA检查 → 路径遍历检测 → SQL注入检测 → XSS检测 → 限流 → 业务逻辑
```

## OWASP Top 10 覆盖

### A01: 失效的访问控制
- **措施**: CORS 严格配置、IP白名单（可选）、请求签名验证
- **实现**: `securityEnhanced.ts` - CORS中间件 + IP白名单

### A02: 加密机制失效
- **措施**: HTTPS强制（HSTS）、敏感数据脱敏
- **实现**: HSTS头 + `sanitizeSensitiveData()` 函数

### A03: 注入
- **措施**: SQL注入检测、XSS检测、路径遍历检测
- **实现**: 正则模式匹配，8种SQL注入模式、7种XSS模式
- **注意**: 检测是防御层，核心防护依赖参数化查询（Knex.js）

### A04: 不安全设计
- **措施**: 速率限制、请求大小限制、输入验证白名单
- **实现**: `rateLimit.ts` + `validation.ts` + Joi Schema

### A05: 安全配置错误
- **措施**: 安全响应头完整配置、移除服务端信息
- **实现**: `securityHeaders.ts` + helmet

### A06: 易受攻击和过时的组件
- **措施**: 定期依赖审计、最小权限原则
- **工具**: `npm audit`

### A07: 身份认证和鉴别失败
- **措施**: Token管理、请求签名验证
- **实现**: `tokenManager.ts` + `verifyRequestSignature()`

### A08: 软件和数据完整性失效
- **措施**: 请求签名验证（HMAC-SHA256）、时间戳验证
- **实现**: `verifyRequestSignature()`

### A09: 安全日志和监控失效
- **措施**: 安全事件审计日志、分级告警
- **实现**: `SecurityAuditLogger` 类

### A10: 服务端请求伪造 (SSRF)
- **措施**: 出站请求限制、URL白名单
- **Note**: 本项目后端作为API服务器，不主动发起外部请求

## 安全中间件链

```typescript
// app.ts 中的中间件顺序
app.use(helmet());                    // 安全头
app.use(enhancedSecurityHeaders());   // 增强安全头
app.use(cors());                      // CORS
app.use(compression());               // 响应压缩
app.use(express.json({ limit: '1mb' }));  // 请求体限制
app.use(apiRateLimit);                // 全局限流
app.use(inputSecurityScan());         // 输入安全扫描
```

## 限流策略

| API类型 | 窗口 | 最大请求数 | 封禁时长 |
|---------|------|-----------|---------|
| 普通API | 1分钟 | 120次 | 5分钟 |
| 同步API | 1分钟 | 5次 | 10分钟 |
| 搜索API | 1分钟 | 60次 | 3分钟 |

## 安全事件分类

| 严重程度 | 类型 | 处理 |
|----------|------|------|
| critical | SQL注入、路径遍历 | 立即封禁IP，记录日志 |
| high | XSS、签名失败、超限 | 封禁IP，记录日志 |
| medium | 速率接近、可疑UA | 记录日志 |
| low | 正常安全检查 | 记录日志 |

## 前端安全

### Content Security Policy
```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
connect-src 'self' ws: wss:
object-src 'none'
frame-ancestors 'none'
```

### Service Worker 安全
- 仅缓存GET请求
- 跳过WebSocket连接
- 定期清理过期缓存
- 缓存版本控制

## 敏感数据处理

### 脱敏规则
- 密码/Token/Secret: 保留前4位和后4位
- API Key: 保留前4位
- 日志中不记录完整敏感信息

### 加密存储
- 环境变量存储密钥（非代码）
- 数据库密码加密
- JWT Token 签名

## 安全审计端点

```
GET /api/security/monitor
返回: 安全事件统计、黑名单IP、最近事件
```

## 改进建议

1. 集成 Redis 实现分布式限流
2. 添加 WAF (Web Application Firewall)
3. 实现完整的 JWT 认证系统
4. 添加 API 密钥管理系统
5. 集成安全扫描工具 (Snyk, Snyk)
6. 实现请求签名验证（所有API）
7. 添加 IP 信誉评分系统
