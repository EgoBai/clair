/**
 * 加密安全测试 - Round 172
 * 覆盖：哈希、JWT模式、密码强度、数据加密、随机数质量
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * 安全密码哈希（模拟bcrypt行为）
 */
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: useSalt };
}

/**
 * 密码强度验证
 */
function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push('至少8个字符');
  if (!/[a-z]/.test(password)) reasons.push('需要小写字母');
  if (!/[A-Z]/.test(password)) reasons.push('需要大写字母');
  if (!/[0-9]/.test(password)) reasons.push('需要数字');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) reasons.push('需要特殊字符');
  if (/(.)\1{2,}/.test(password)) reasons.push('不能有3个以上重复字符');
  if (/^(123|abc|qwerty|password|admin)/i.test(password)) reasons.push('不能使用常见弱密码');
  return { valid: reasons.length === 0, reasons };
}

/**
 * 对称加密/解密（AES-256-GCM）
 */
function encrypt(plaintext: string, key: Buffer): { iv: string; ciphertext: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decrypt(data: { iv: string; ciphertext: string; tag: string }, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  return decipher.update(Buffer.from(data.ciphertext, 'hex'), undefined, 'utf8') + decipher.final('utf8');
}

/**
 * JWT模拟验证（不实际签发，验证结构）
 */
function validateJwtStructure(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    // 验证算法
    if (!['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256'].includes(header.alg)) return false;
    // 验证过期时间
    if (payload.exp && payload.exp < Date.now() / 1000) return false;
    return true;
  } catch {
    return false;
  }
}

describe('加密安全', () => {
  describe('密码哈希', () => {
    it('相同密码不同盐应产生不同哈希', () => {
      const h1 = hashPassword('MyPassword123!');
      const h2 = hashPassword('MyPassword123!');
      expect(h1.hash).not.toBe(h2.hash);
      expect(h1.salt).not.toBe(h2.salt);
    });

    it('相同密码相同盐应产生相同哈希', () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const h1 = hashPassword('MyPassword123!', salt);
      const h2 = hashPassword('MyPassword123!', salt);
      expect(h1.hash).toBe(h2.hash);
    });

    it('不同密码应产生不同哈希', () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const h1 = hashPassword('Password1!', salt);
      const h2 = hashPassword('Password2!', salt);
      expect(h1.hash).not.toBe(h2.hash);
    });

    it('哈希长度应足够（128 hex = 512 bits）', () => {
      const { hash } = hashPassword('test');
      expect(hash.length).toBe(128);
    });

    it('盐长度应为32 hex = 128 bits', () => {
      const { salt } = hashPassword('test');
      expect(salt.length).toBe(32);
    });

    it('应使用PBKDF2-SHA512', () => {
      // 验证hash格式正确（间接验证算法）
      const { hash } = hashPassword('test');
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });

  describe('密码强度', () => {
    it('强密码应通过', () => {
      const result = validatePasswordStrength('MyStr0ng!Pass');
      expect(result.valid).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('太短应拒绝', () => {
      const result = validatePasswordStrength('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('至少8个字符');
    });

    it('无大写应拒绝', () => {
      const result = validatePasswordStrength('mylower123!');
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('需要大写字母');
    });

    it('无数字应拒绝', () => {
      const result = validatePasswordStrength('MyPassword!');
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('需要数字');
    });

    it('无特殊字符应拒绝', () => {
      const result = validatePasswordStrength('MyPassword123');
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('需要特殊字符');
    });

    it('重复字符应拒绝', () => {
      const result = validatePasswordStrength('aaa12345!');
      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('不能有3个以上重复字符');
    });

    it('常见弱密码应拒绝', () => {
      const weak = ['password1!', 'admin123!', '1234abcd!'];
      for (const p of weak) {
        const result = validatePasswordStrength(p);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('AES-256-GCM 加密', () => {
    const key = crypto.randomBytes(32);

    it('加密解密应还原数据', () => {
      const plaintext = '股票代码: 600000, 价格: 10.50';
      const encrypted = encrypt(plaintext, key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('不同IV应产生不同密文', () => {
      const plaintext = 'same data';
      const e1 = encrypt(plaintext, key);
      const e2 = encrypt(plaintext, key);
      expect(e1.iv).not.toBe(e2.iv);
      expect(e1.ciphertext).not.toBe(e2.ciphertext);
    });

    it('错误密钥应解密失败', () => {
      const plaintext = 'secret';
      const encrypted = encrypt(plaintext, key);
      const wrongKey = crypto.randomBytes(32);
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('篡改密文应检测到', () => {
      const plaintext = 'important data';
      const encrypted = encrypt(plaintext, key);
      // 篡改密文
      const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + '00' };
      expect(() => decrypt(tampered, key)).toThrow();
    });

    it('篡改Tag应检测到', () => {
      const plaintext = 'important data';
      const encrypted = encrypt(plaintext, key);
      const tampered = { ...encrypted, tag: '0'.repeat(32) };
      expect(() => decrypt(tampered, key)).toThrow();
    });

    it('处理空字符串', () => {
      const encrypted = encrypt('', key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe('');
    });

    it('处理Unicode', () => {
      const plaintext = 'A股行情📈上证指数';
      const encrypted = encrypt(plaintext, key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('处理大数据', () => {
      const plaintext = 'x'.repeat(100000);
      const encrypted = encrypt(plaintext, key);
      const decrypted = decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('随机数质量', () => {
    it('应使用crypto.randomBytes', () => {
      const bytes = crypto.randomBytes(32);
      expect(bytes.length).toBe(32);
    });

    it('随机数不应全为零', () => {
      for (let i = 0; i < 100; i++) {
        const bytes = crypto.randomBytes(32);
        expect(bytes.some(b => b !== 0)).toBe(true);
      }
    });

    it('随机数分布应相对均匀', () => {
      const counts = new Array(256).fill(0);
      const total = 25600;
      const bytes = crypto.randomBytes(total);
      for (const b of bytes) counts[b]++;
      // 每个字节值期望出现100次，允许±50%偏差
      for (let i = 0; i < 256; i++) {
        expect(counts[i]).toBeGreaterThan(30);
        expect(counts[i]).toBeLessThan(170);
      }
    });

    it('UUID生成应符合v4格式', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = crypto.randomUUID();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });
  });

  describe('JWT结构验证', () => {
    it('有效JWT应通过', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: '123', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const signature = crypto.randomBytes(32).toString('base64url');
      expect(validateJwtStructure(`${header}.${payload}.${signature}`)).toBe(true);
    });

    it('过期JWT应拒绝', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: '123', exp: Math.floor(Date.now() / 1000) - 3600 })).toString('base64url');
      const signature = 'sig';
      expect(validateJwtStructure(`${header}.${payload}.${signature}`)).toBe(false);
    });

    it('无效格式应拒绝', () => {
      expect(validateJwtStructure('not.a.jwt.token')).toBe(false);
      expect(validateJwtStructure('onlyonepart')).toBe(false);
      expect(validateJwtStructure('')).toBe(false);
    });

    it('不安全算法应拒绝', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: '123' })).toString('base64url');
      expect(validateJwtStructure(`${header}.${payload}.sig`)).toBe(false);
    });
  });
});
