# 安全性深化设计

## 参考标准
- OWASP Top 10
- OWASP CSRF Prevention Cheat Sheet
- OWASP JWT Best Practices

## 已实现安全措施

### 1. CSRF 防护 (Double Submit Cookie)
```
流程:
1. GET 请求 → 服务端在 cookie 设置 CSRF token
2. 前端读取 cookie 中的 token
3. POST/PUT/DELETE → 前端将 token 放入 X-CSRF-Token header
4. 服务端对比 cookie token 和 header token
```
- 使用 `crypto.timingSafeEqual` 防止时序攻击
- token 长度 32字节 (64 hex chars)
- cookie 设置 `SameSite=Lax`

### 2. 安全头部
| Header | 值 | 作用 |
|--------|-----|------|
| Content-Security-Policy | 严格策略 | 防XSS |
| Strict-Transport-Security | max-age=1y | 强制HTTPS |
| X-Content-Type-Options | nosniff | 防MIME嗅探 |
| X-Frame-Options | DENY | 防点击劫持 |
| Referrer-Policy | strict-origin-when-cross-origin | 限制referrer |
| Permissions-Policy | 禁用敏感API | 最小权限 |
| Cache-Control | no-store (API) | 防敏感数据缓存 |

### 3. JWT Token 管理
- **双 Token 机制**: Access Token (1h) + Refresh Token (7d)
- **自实现 JWT**: HMAC-SHA256 签名，不依赖第三方库
- **Token 黑名单**: 支持主动撤销
- **一次性 Refresh Token**: 使用后立即失效
- **定期清理**: 自动清理过期 token

### 4. 限流策略
| 类型 | 窗口 | 限制 |
|------|------|------|
| 普通API | 1分钟 | 120次 |
| 数据同步 | 1分钟 | 5次 |
| 社交操作 | 1分钟 | 30次 |

### 5. 输入验证
- Joi schema 验证所有请求参数
- 股票代码格式白名单 (`/^[a-zA-Z0-9.]+$/`)
- 分页上限 100条
- 批量查询上限 100只

### 6. 审计日志
- 敏感操作记录 IP、User-Agent、时间戳
- 失败操作额外警告日志
- 请求 ID 追踪

## 防护矩阵
| 攻击类型 | 防护措施 |
|----------|----------|
| SQL注入 | 参数化查询 + Joi验证 |
| XSS | CSP + HTML转义 |
| CSRF | Double Submit Cookie |
| 点击劫持 | X-Frame-Options: DENY |
| DoS | 滑动窗口限流 |
| 信息泄露 | 安全头部 + 移除Server头 |
| 时序攻击 | timingSafeEqual |
| Token窃取 | HTTPS + HttpOnly + 短有效期 |

## 待实现
- [ ] Redis 替代内存限流（分布式支持）
- [ ] 二次验证（TOTP/SMS）
- [ ] IP 黑名单
- [ ] 异常登录检测
- [ ] 数据加密存储
