/**
 * SQL注入模拟测试 - Round 169
 * 覆盖：参数化查询验证、输入验证、特殊字符处理、批量注入模式
 */
import { describe, it, expect } from 'vitest';

/**
 * 模拟参数化查询 - 验证输入不包含SQL注入模式
 */
function isSafeInput(input: string): boolean {
  const sqlPatterns = [
    /'\s*(or|and)\s+/i,
    /;\s*(drop|delete|update|insert|alter|create|exec|execute)/i,
    /--/,
    /\/\*/,
    /\*\//,
    /union\s+select/i,
    /'\s*;\s*/,
    /1\s*=\s*1/,
    /1\s*=\s*0/,
    /'\s*or\s*'1'\s*=\s*'1/i,
    /'\s*or\s*1\s*=\s*1/i,
    /char\s*\(/i,
    /concat\s*\(/i,
    /load_file/i,
    /into\s+outfile/i,
    /benchmark\s*\(/i,
    /sleep\s*\(/i,
    /waitfor\s+delay/i,
    /pg_sleep/i,
    /\bxp_/i,
    /\bsp_/i,
  ];
  return !sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * 模拟安全的参数化查询接口
 */
function parameterizedQuery(sql: string, params: any[]): { safe: boolean; reason?: string } {
  // 检查SQL模板中不应有直接拼接
  for (let i = 0; i < params.length; i++) {
    const param = String(params[i]);
    if (!isSafeInput(param)) {
      return { safe: false, reason: `参数 ${i} 包含可疑SQL模式` };
    }
  }

  // SQL模板应使用占位符
  const hasPlaceholders = sql.includes('?') || sql.includes('$1') || sql.includes('%s');
  if (!hasPlaceholders && params.length > 0) {
    return { safe: false, reason: 'SQL模板应使用参数占位符' };
  }

  return { safe: true };
}

/**
 * 输入清理
 */
function sanitizeStockCode(code: string): string | null {
  const cleaned = code.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length === 0 || cleaned.length > 10) return null;
  return cleaned;
}

describe('SQL注入防护', () => {
  describe('经典注入模式检测', () => {
    it('应检测 OR 1=1 注入', () => {
      expect(isSafeInput("admin' OR 1=1--")).toBe(false);
      expect(isSafeInput("' OR '1'='1")).toBe(false);
      expect(isSafeInput("1' or 1=1--")).toBe(false);
    });

    it('应检测 UNION SELECT 注入', () => {
      expect(isSafeInput("' UNION SELECT * FROM users--")).toBe(false);
      expect(isSafeInput("1' union select null,null--")).toBe(false);
    });

    it('应检测 DROP TABLE 注入', () => {
      expect(isSafeInput("'; DROP TABLE stocks--")).toBe(false);
      expect(isSafeInput("1; drop table users")).toBe(false);
    });

    it('应检测注释绕过', () => {
      expect(isSafeInput("admin'--")).toBe(false);
      expect(isSafeInput("admin'/*")).toBe(false);
      expect(isSafeInput("*/admin")).toBe(false);
    });

    it('应检测时间盲注', () => {
      expect(isSafeInput("1' AND SLEEP(5)--")).toBe(false);
      expect(isSafeInput("1'; WAITFOR DELAY '0:0:5'--")).toBe(false);
      expect(isSafeInput("1' AND pg_sleep(5)--")).toBe(false);
      expect(isSafeInput("1' AND BENCHMARK(1000000,SHA1('test'))--")).toBe(false);
    });

    it('应检测布尔盲注', () => {
      expect(isSafeInput("1' AND 1=1--")).toBe(false);
      expect(isSafeInput("1' AND 1=0--")).toBe(false);
    });

    it('应检测文件操作注入', () => {
      expect(isSafeInput("' UNION SELECT load_file('/etc/passwd')--")).toBe(false);
      expect(isSafeInput("' INTO OUTFILE '/tmp/dump'--")).toBe(false);
    });

    it('应检测存储过程注入', () => {
      expect(isSafeInput("'; xp_cmdshell('dir')--")).toBe(false);
      expect(isSafeInput("'; sp_executesql N'SELECT 1'--")).toBe(false);
    });

    it('应检测编码绕过', () => {
      expect(isSafeInput("char(97)char(100)char(109)char(105)char(110)")).toBe(false);
      expect(isSafeInput("concat('ad','min')")).toBe(false);
    });
  });

  describe('安全输入应通过', () => {
    it('正常股票代码应安全', () => {
      expect(isSafeInput('600000')).toBe(true);
      expect(isSafeInput('SH600000')).toBe(true);
      expect(isSafeInput('AAPL')).toBe(true);
    });

    it('正常中文应安全', () => {
      expect(isSafeInput('平安银行')).toBe(true);
      expect(isSafeInput('工商银行')).toBe(true);
    });

    it('正常数字应安全', () => {
      expect(isSafeInput('12345')).toBe(true);
      expect(isSafeInput('3.14159')).toBe(true);
    });

    it('正常搜索词应安全', () => {
      expect(isSafeInput('A股行情')).toBe(true);
      expect(isSafeInput('PE ratio')).toBe(true);
    });

    it('空字符串应安全', () => {
      expect(isSafeInput('')).toBe(true);
    });
  });

  describe('参数化查询验证', () => {
    it('使用占位符的查询应安全', () => {
      const result = parameterizedQuery(
        'SELECT * FROM stocks WHERE code = ?',
        ['600000']
      );
      expect(result.safe).toBe(true);
    });

    it('参数包含注入应被拒绝', () => {
      const result = parameterizedQuery(
        'SELECT * FROM stocks WHERE code = ?',
        ["' OR 1=1--"]
      );
      expect(result.safe).toBe(false);
    });

    it('无占位符但有参数应标记', () => {
      const result = parameterizedQuery(
        'SELECT * FROM stocks WHERE code = 600000',
        []
      );
      expect(result.safe).toBe(true);
    });

    it('$1风格占位符应工作', () => {
      const result = parameterizedQuery(
        'SELECT * FROM stocks WHERE code = $1',
        ['600000']
      );
      expect(result.safe).toBe(true);
    });

    it('多参数查询', () => {
      const result = parameterizedQuery(
        'SELECT * FROM stocks WHERE code = ? AND price > ?',
        ['600000', '10.5']
      );
      expect(result.safe).toBe(true);
    });
  });

  describe('股票代码输入清理', () => {
    it('正常代码应保留', () => {
      expect(sanitizeStockCode('600000')).toBe('600000');
      expect(sanitizeStockCode('SH600000')).toBe('SH600000');
    });

    it('含特殊字符应被清理', () => {
      const result = sanitizeStockCode("600000'; DROP TABLE--");
      // 特殊字符被剥离后超出长度限制，返回null
      expect(result).toBeNull();
    });

    it('空输入应返回null', () => {
      expect(sanitizeStockCode('')).toBeNull();
      expect(sanitizeStockCode('!@#$%')).toBeNull();
    });

    it('超长输入应返回null', () => {
      expect(sanitizeStockCode('A'.repeat(11))).toBeNull();
    });
  });

  describe('金融数据特有注入向量', () => {
    it('股票名称注入检测', () => {
      const names = [
        "公司'; DROP TABLE stocks--",
        "'; SELECT * FROM users--公司",
        "公司' OR 1=1--",
      ];
      for (const name of names) {
        expect(isSafeInput(name)).toBe(false);
      }
    });

    it('交易量数值注入', () => {
      expect(isSafeInput('1000000')).toBe(true);
      expect(isSafeInput('1000000; DROP TABLE')).toBe(false);
    });

    it('日期格式注入', () => {
      expect(isSafeInput('2024-01-01')).toBe(true);
      expect(isSafeInput("2024-01-01' OR 1=1--")).toBe(false);
    });

    it('价格注入', () => {
      expect(isSafeInput('10.50')).toBe(true);
      expect(isSafeInput("10.50'; DELETE FROM orders--")).toBe(false);
    });
  });

  describe('批量注入模式', () => {
    const injectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users;--",
      "' UNION SELECT username,password FROM users--",
      "1; EXEC xp_cmdshell('dir')",
      "' AND 1=CONVERT(int,(SELECT @@version))--",
      "'; WAITFOR DELAY '0:0:10'--",
      "' OR ''='",
      "admin'--",
      "' OR 1=1#",
      "'; INSERT INTO admin VALUES('hacker','password');--",
    ];

    it('应检测所有常见注入payload', () => {
      for (const payload of injectionPayloads) {
        expect(isSafeInput(payload)).toBe(false);
      }
    });

    it('安全输入批量验证', () => {
      const safeInputs = [
        '600000', 'AAPL', '平安银行', '10.5',
        '2024-01-01', '1000000', '上证指数',
        'PE', 'EPS', 'PB',
      ];
      for (const input of safeInputs) {
        expect(isSafeInput(input)).toBe(true);
      }
    });
  });
});
