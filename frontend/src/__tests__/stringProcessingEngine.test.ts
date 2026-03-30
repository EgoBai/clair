import { describe, it, expect } from 'vitest';

// ===== 字符串处理引擎 =====
describe('String Processing Engine', () => {
  // 驼峰转下划线
  const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

  // 下划线转驼峰
  const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // 驼峰转短横线
  const camelToKebab = (s: string): string => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

  // 首字母大写
  const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  // 每个单词首字母大写
  const titleCase = (s: string): string => s.replace(/\b\w/g, c => c.toUpperCase());

  // 截断字符串
  const truncate = (s: string, maxLen: number, suffix: string = '...'): string => {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - suffix.length) + suffix;
  };

  // 模板替换
  const template = (str: string, vars: Record<string, any>): string => {
    return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
  };

  // 高亮匹配
  const highlight = (text: string, query: string, tag: string = 'mark'): string => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), `<${tag}>$&</${tag}>`);
  };

  // 生成slug
  const slugify = (s: string): string => {
    return s.toLowerCase().replace(/[^\w\u4e00-\u9fff\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  // 计算编辑距离
  const levenshtein = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };

  // 模糊匹配
  const fuzzyMatch = (text: string, pattern: string): boolean => {
    let pi = 0;
    for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
      if (text[ti].toLowerCase() === pattern[pi].toLowerCase()) pi++;
    }
    return pi === pattern.length;
  };

  // 密码强度
  const passwordStrength = (pwd: string): { score: number; level: string } => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;
    const levels = ['极弱', '弱', '一般', '较强', '强', '很强', '极强'];
    return { score, level: levels[Math.min(score, 6)] };
  };

  // HTML转义
  const escapeHtml = (s: string): string => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return s.replace(/[&<>"']/g, c => map[c]);
  };

  // HTML反转义
  const unescapeHtml = (s: string): string => {
    const map: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
    return s.replace(/&(?:amp|lt|gt|quot|#39);/g, c => map[c]);
  };

  // 生成随机字符串
  const randomString = (length: number, charset: string = 'abcdefghijklmnopqrstuvwxyz0123456789'): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }
    return result;
  };

  // 遮蔽敏感信息
  const maskString = (s: string, visibleStart: number = 2, visibleEnd: number = 2, maskChar: string = '*'): string => {
    if (s.length <= visibleStart + visibleEnd) return s;
    return s.slice(0, visibleStart) + maskChar.repeat(s.length - visibleStart - visibleEnd) + s.slice(-visibleEnd);
  };

  // 词频统计
  const wordFrequency = (text: string): Record<string, number> => {
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    return words.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {} as Record<string, number>);
  };

  describe('驼峰转下划线', () => {
    it('简单转换', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
    });

    it('多个大写', () => {
      expect(camelToSnake('getHTTPResponse')).toBe('get_h_t_t_p_response');
    });

    it('全小写不变', () => {
      expect(camelToSnake('hello')).toBe('hello');
    });

    it('空字符串', () => {
      expect(camelToSnake('')).toBe('');
    });
  });

  describe('下划线转驼峰', () => {
    it('简单转换', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
    });

    it('无下划线不变', () => {
      expect(snakeToCamel('hello')).toBe('hello');
    });

    it('空字符串', () => {
      expect(snakeToCamel('')).toBe('');
    });
  });

  describe('驼峰转短横线', () => {
    it('简单转换', () => {
      expect(camelToKebab('backgroundColor')).toBe('background-color');
    });
  });

  describe('首字母大写', () => {
    it('小写开头', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('已大写不变', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    it('空字符串', () => {
      expect(capitalize('')).toBe('');
    });

    it('单字符', () => {
      expect(capitalize('a')).toBe('A');
    });
  });

  describe('标题大小写', () => {
    it('多单词', () => {
      expect(titleCase('hello world')).toBe('Hello World');
    });

    it('单单词', () => {
      expect(titleCase('hello')).toBe('Hello');
    });
  });

  describe('截断字符串', () => {
    it('不需要截断', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('截断加后缀', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('自定义后缀', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });

    it('正好长度', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });

  describe('模板替换', () => {
    it('替换变量', () => {
      expect(template('Hello {name}', { name: 'World' })).toBe('Hello World');
    });

    it('多个变量', () => {
      expect(template('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
    });

    it('缺失变量', () => {
      expect(template('Hello {name}', {})).toBe('Hello {name}');
    });

    it('无变量', () => {
      expect(template('Hello', { a: 1 })).toBe('Hello');
    });
  });

  describe('高亮匹配', () => {
    it('匹配高亮', () => {
      expect(highlight('Hello World', 'World')).toBe('Hello <mark>World</mark>');
    });

    it('忽略大小写', () => {
      expect(highlight('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
    });

    it('空查询', () => {
      expect(highlight('Hello', '')).toBe('Hello');
    });

    it('自定义标签', () => {
      expect(highlight('Hello', 'He', 'b')).toBe('<b>He</b>llo');
    });
  });

  describe('Slug生成', () => {
    it('英文', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('特殊字符移除', () => {
      expect(slugify('Hello! @World#')).toBe('hello-world');
    });

    it('连续空格', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });
  });

  describe('编辑距离', () => {
    it('相同字符串', () => {
      expect(levenshtein('abc', 'abc')).toBe(0);
    });

    it('单字符差异', () => {
      expect(levenshtein('abc', 'abd')).toBe(1);
    });

    it('插入', () => {
      expect(levenshtein('ab', 'abc')).toBe(1);
    });

    it('删除', () => {
      expect(levenshtein('abc', 'ab')).toBe(1);
    });

    it('完全不同', () => {
      expect(levenshtein('abc', 'xyz')).toBe(3);
    });

    it('空字符串', () => {
      expect(levenshtein('', 'abc')).toBe(3);
    });
  });

  describe('模糊匹配', () => {
    it('连续匹配', () => {
      expect(fuzzyMatch('Hello World', 'hewo')).toBe(true);
    });

    it('不匹配', () => {
      expect(fuzzyMatch('Hello', 'xyz')).toBe(false);
    });

    it('忽略大小写', () => {
      expect(fuzzyMatch('ABC', 'abc')).toBe(true);
    });

    it('空模式', () => {
      expect(fuzzyMatch('Hello', '')).toBe(true);
    });
  });

  describe('密码强度', () => {
    it('极弱密码', () => {
      expect(passwordStrength('a').level).toBe('弱');
    });

    it('强密码', () => {
      const result = passwordStrength('Abc123!@#Long');
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it('纯数字弱', () => {
      expect(passwordStrength('12345678').score).toBeLessThan(4);
    });
  });

  describe('HTML转义', () => {
    it('转义特殊字符', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('无特殊字符不变', () => {
      expect(escapeHtml('hello')).toBe('hello');
    });

    it('单引号', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });
  });

  describe('HTML反转义', () => {
    it('反转义', () => {
      expect(unescapeHtml('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>');
    });

    it('转义后反转义还原', () => {
      const original = '<div class="test">Hello & World</div>';
      expect(unescapeHtml(escapeHtml(original))).toBe(original);
    });
  });

  describe('随机字符串', () => {
    it('指定长度', () => {
      expect(randomString(10).length).toBe(10);
    });

    it('空长度', () => {
      expect(randomString(0)).toBe('');
    });

    it('自定义字符集', () => {
      const s = randomString(100, '01');
      expect(/^[01]+$/.test(s)).toBe(true);
    });
  });

  describe('遮蔽字符串', () => {
    it('手机号遮蔽', () => {
      expect(maskString('13812345678', 3, 4)).toBe('138****5678');
    });

    it('邮箱遮蔽', () => {
      expect(maskString('test@example.com', 2, 4)).toBe('te**********.com');
    });

    it('太短不遮蔽', () => {
      expect(maskString('abc', 2, 2)).toBe('abc');
    });

    it('自定义遮蔽字符', () => {
      expect(maskString('12345678', 2, 2, '#')).toBe('12####78');
    });
  });

  describe('词频统计', () => {
    it('基本统计', () => {
      const freq = wordFrequency('hello world hello');
      expect(freq['hello']).toBe(2);
      expect(freq['world']).toBe(1);
    });

    it('忽略标点', () => {
      const freq = wordFrequency('Hello, World!');
      expect(freq['hello']).toBe(1);
    });

    it('空文本', () => {
      expect(wordFrequency('')).toEqual({});
    });
  });
});
