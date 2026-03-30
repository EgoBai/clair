/**
 * JWT Token 管理器
 * 支持 Access Token + Refresh Token 双 token 机制
 * 支持 token 黑名单（用于登出）
 */

import crypto from 'crypto';

interface TokenPayload {
  userId: number;
  username: string;
  role: 'user' | 'admin';
  [key: string]: any;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

interface StoredToken {
  payload: TokenPayload;
  expiresAt: number;
  createdAt: number;
}

/**
 * 基于 HMAC-SHA256 的 JWT 实现
 * 不依赖第三方 JWT 库，减少攻击面
 */
class TokenManager {
  private secret: string;
  private accessExpiresIn: number;   // 秒
  private refreshExpiresIn: number;  // 秒
  private blacklist = new Set<string>();
  private refreshTokens = new Map<string, StoredToken>();

  constructor(options: {
    secret?: string;
    accessExpiresIn?: number;
    refreshExpiresIn?: number;
  } = {}) {
    this.secret = options.secret || process.env.JWT_SECRET || this.generateSecret();
    this.accessExpiresIn = options.accessExpiresIn || 3600;       // 1小时
    this.refreshExpiresIn = options.refreshExpiresIn || 604800;   // 7天
  }

  private generateSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Base64URL 编码
   */
  private base64UrlEncode(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64url');
  }

  /**
   * Base64URL 解码
   */
  private base64UrlDecode(str: string): Buffer {
    return Buffer.from(str, 'base64url');
  }

  /**
   * 创建签名
   */
  private sign(data: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
  }

  /**
   * 生成 Access Token
   */
  generateAccessToken(payload: TokenPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      exp: now + this.accessExpiresIn,
      jti: crypto.randomUUID(),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(claims));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * 生成 Refresh Token
   */
  generateRefreshToken(payload: TokenPayload): string {
    const token = crypto.randomBytes(48).toString('hex');
    const now = Date.now();

    this.refreshTokens.set(token, {
      payload,
      expiresAt: now + this.refreshExpiresIn * 1000,
      createdAt: now,
    });

    return token;
  }

  /**
   * 生成 Token 对
   */
  generateTokenPair(payload: TokenPayload): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      expiresIn: this.accessExpiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * 验证 Access Token
   */
  verifyAccessToken(token: string): { valid: boolean; payload?: TokenPayload; error?: string } {
    try {
      // 检查黑名单
      if (this.blacklist.has(token)) {
        return { valid: false, error: 'Token 已被撤销' };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Token 格式无效' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // 验证签名
      const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return { valid: false, error: 'Token 签名无效' };
      }

      // 解析 payload
      const claims = JSON.parse(this.base64UrlDecode(encodedPayload).toString());

      // 检查过期
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp && claims.exp < now) {
        return { valid: false, error: 'Token 已过期' };
      }

      // 检查 nbf (Not Before)
      if (claims.nbf && claims.nbf > now) {
        return { valid: false, error: 'Token 尚未生效' };
      }

      return {
        valid: true,
        payload: {
          userId: claims.userId,
          username: claims.username,
          role: claims.role,
        },
      };
    } catch (error) {
      return { valid: false, error: 'Token 验证失败' };
    }
  }

  /**
   * 验证 Refresh Token 并生成新 Token 对
   */
  refreshAccessToken(refreshToken: string): TokenPair | null {
    const stored = this.refreshTokens.get(refreshToken);

    if (!stored) {
      return null;
    }

    // 检查过期
    if (Date.now() > stored.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      return null;
    }

    // 删除旧 refresh token（一次性使用）
    this.refreshTokens.delete(refreshToken);

    // 生成新 token 对
    return this.generateTokenPair(stored.payload);
  }

  /**
   * 撤销 Access Token（加入黑名单）
   */
  revokeAccessToken(token: string): void {
    this.blacklist.add(token);
  }

  /**
   * 撤销 Refresh Token
   */
  revokeRefreshToken(token: string): boolean {
    return this.refreshTokens.delete(token);
  }

  /**
   * 撤销用户所有 Token
   */
  revokeAllUserTokens(userId: number): number {
    let count = 0;
    for (const [token, stored] of this.refreshTokens) {
      if (stored.payload.userId === userId) {
        this.refreshTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * 清理过期 Token
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    // 清理过期 refresh tokens
    for (const [token, stored] of this.refreshTokens) {
      if (now > stored.expiresAt) {
        this.refreshTokens.delete(token);
        cleaned++;
      }
    }

    // 限制黑名单大小
    if (this.blacklist.size > 10000) {
      const arr = Array.from(this.blacklist);
      arr.splice(0, arr.length - 5000);
      this.blacklist = new Set(arr);
    }

    return cleaned;
  }

  /**
   * 获取 Token 统计
   */
  getStats() {
    return {
      activeRefreshTokens: this.refreshTokens.size,
      blacklistedTokens: this.blacklist.size,
    };
  }
}

// 单例
export const tokenManager = new TokenManager();

// 定期清理（每小时）
setInterval(() => {
  const cleaned = tokenManager.cleanup();
  if (cleaned > 0) {
    console.log(`🧹 清理了 ${cleaned} 个过期 token`);
  }
}, 60 * 60 * 1000);

export { TokenManager, TokenPayload, TokenPair };
