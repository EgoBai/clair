import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== 代码审计工具逻辑测试 ====================

describe('codeAudit - complexity calculation', () => {
  function calculateCyclomaticComplexity(code: string): number {
    let complexity = 1;
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b\?\./g, // optional chaining
      /\b&&\b/g,
      /\b\|\|\b/g,
      /\?\?/g,
    ];
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) complexity += matches.length;
    }
    return complexity;
  }

  it('should return 1 for simple function', () => {
    const code = 'function test() { return 1; }';
    expect(calculateCyclomaticComplexity(code)).toBe(1);
  });

  it('should add 1 for each if', () => {
    const code = 'if (a) { } if (b) { }';
    expect(calculateCyclomaticComplexity(code)).toBe(3);
  });

  it('should add 1 for each for loop', () => {
    const code = 'for (let i = 0; i < 10; i++) { }';
    expect(calculateCyclomaticComplexity(code)).toBe(2);
  });

  it('should add 1 for each while loop', () => {
    const code = 'while (true) { }';
    expect(calculateCyclomaticComplexity(code)).toBe(2);
  });

  it('should add 1 for each case', () => {
    const code = 'switch(x) { case 1: break; case 2: break; }';
    expect(calculateCyclomaticComplexity(code)).toBe(3);
  });

  it('should add 1 for each catch', () => {
    const code = 'try { } catch(e) { }';
    expect(calculateCyclomaticComplexity(code)).toBe(2);
  });

  it('should add 1 for && operator', () => {
    const code = 'if (a && b) { }';
    expect(calculateCyclomaticComplexity(code)).toBeGreaterThan(1);
  });

  it('should add 1 for || operator', () => {
    const code = 'if (a || b) { }';
    expect(calculateCyclomaticComplexity(code)).toBeGreaterThan(1);
  });

  it('should rate complexity levels', () => {
    const rate = (c: number) => {
      if (c <= 5) return 'low';
      if (c <= 10) return 'moderate';
      if (c <= 20) return 'high';
      return 'very-high';
    };
    expect(rate(1)).toBe('low');
    expect(rate(5)).toBe('low');
    expect(rate(6)).toBe('moderate');
    expect(rate(10)).toBe('moderate');
    expect(rate(11)).toBe('high');
    expect(rate(20)).toBe('high');
    expect(rate(21)).toBe('very-high');
  });
});

describe('codeAudit - duplicate detection', () => {
  function findDuplicateLines(lines: string[], minLineCount: number = 3): Map<string, number> {
    const counts = new Map<string, number>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 10) continue; // skip short lines
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
    const duplicates = new Map<string, number>();
    for (const [line, count] of counts) {
      if (count >= minLineCount) {
        duplicates.set(line, count);
      }
    }
    return duplicates;
  }

  it('should find duplicate lines', () => {
    const lines = [
      'const x = getValue()',
      'const x = getValue()',
      'const x = getValue()',
      'const x = getValue()',
    ];
    const dupes = findDuplicateLines(lines);
    expect(dupes.size).toBeGreaterThan(0);
  });

  it('should skip short lines', () => {
    const lines = ['x = 1', 'x = 1', 'x = 1'];
    const dupes = findDuplicateLines(lines);
    expect(dupes.size).toBe(0);
  });

  it('should respect minLineCount', () => {
    const lines = [
      'const longVariableName = 1;',
      'const longVariableName = 1;',
    ];
    const dupes = findDuplicateLines(lines, 3);
    expect(dupes.size).toBe(0);
  });

  it('should trim whitespace', () => {
    const lines = [
      '  const x = 1;  ',
      'const x = 1;',
      '  const x = 1;',
    ];
    const dupes = findDuplicateLines(lines);
    expect(dupes.has('const x = 1;')).toBe(true);
  });

  it('should handle empty input', () => {
    const dupes = findDuplicateLines([]);
    expect(dupes.size).toBe(0);
  });
});

describe('codeAudit - import analysis', () => {
  function analyzeImports(code: string): {
    total: number;
    named: number;
    defaultImports: number;
    sideEffect: number;
  } {
    const lines = code.split('\n');
    let total = 0, named = 0, defaultImports = 0, sideEffect = 0;

    for (const line of lines) {
      if (!line.trim().startsWith('import')) continue;
      total++;
      if (line.includes('{')) named++;
      else if (line.includes("from")) defaultImports++;
      else sideEffect++;
    }

    return { total, named, defaultImports, sideEffect };
  }

  it('should count total imports', () => {
    const code = `import a from 'a';
import { b } from 'b';
import 'c';`;
    const result = analyzeImports(code);
    expect(result.total).toBe(3);
  });

  it('should identify named imports', () => {
    const code = `import { useState, useEffect } from 'react';`;
    const result = analyzeImports(code);
    expect(result.named).toBe(1);
  });

  it('should identify default imports', () => {
    const code = `import React from 'react';`;
    const result = analyzeImports(code);
    expect(result.defaultImports).toBe(1);
  });

  it('should identify side-effect imports', () => {
    const code = `import './styles.css';`;
    const result = analyzeImports(code);
    expect(result.sideEffect).toBe(1);
  });

  it('should handle no imports', () => {
    const code = `const x = 1;`;
    const result = analyzeImports(code);
    expect(result.total).toBe(0);
  });
});

describe('codeAudit - dead code patterns', () => {
  function detectDeadCodePatterns(code: string): string[] {
    const warnings: string[] = [];
    if (/if\s*\(\s*false\s*\)/.test(code)) warnings.push('if(false) block');
    if (/if\s*\(\s*true\s*\)\s*\{[^}]*return/.test(code)) warnings.push('unreachable after if(true) return');
    if (/\breturn\b[^;]*;[\s\S]*\breturn\b/.test(code)) warnings.push('possible unreachable return');
    if (/console\.log/.test(code)) warnings.push('console.log in production');
    if (/@ts-ignore/.test(code)) warnings.push('@ts-ignore usage');
    if (/any\b/.test(code)) warnings.push('any type usage');
    return warnings;
  }

  it('should detect if(false)', () => {
    const warnings = detectDeadCodePatterns('if (false) { doSomething(); }');
    expect(warnings).toContain('if(false) block');
  });

  it('should detect console.log', () => {
    const warnings = detectDeadCodePatterns('console.log("debug")');
    expect(warnings).toContain('console.log in production');
  });

  it('should detect @ts-ignore', () => {
    const warnings = detectDeadCodePatterns('// @ts-ignore\nconst x = y;');
    expect(warnings).toContain('@ts-ignore usage');
  });

  it('should detect any type', () => {
    const warnings = detectDeadCodePatterns('const x: any = getValue();');
    expect(warnings).toContain('any type usage');
  });

  it('should return empty for clean code', () => {
    const warnings = detectDeadCodePatterns('const x: string = "hello";');
    expect(warnings.length).toBe(0);
  });
});

describe('codeAudit - function length check', () => {
  function countLines(code: string): number {
    return code.split('\n').length;
  }

  function isLongFunction(code: string, maxLines: number = 50): boolean {
    return countLines(code) > maxLines;
  }

  it('should detect long functions', () => {
    const lines = ['function longFunc() {'];
    for (let i = 0; i < 60; i++) lines.push(`  const x${i} = ${i}`);
    lines.push('}');
    expect(isLongFunction(lines.join('\n'))).toBe(true);
  });

  it('should not flag short functions', () => {
    const code = `function short() {\n  return 1;\n}`;
    expect(isLongFunction(code)).toBe(false);
  });

  it('should respect custom maxLines', () => {
    const code = `function medium() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}`;
    expect(isLongFunction(code, 3)).toBe(true);
    expect(isLongFunction(code, 10)).toBe(false);
  });

  it('should count lines correctly', () => {
    expect(countLines('a\nb\nc')).toBe(3);
    expect(countLines('single')).toBe(1);
    expect(countLines('')).toBe(1);
  });
});

describe('codeAudit - magic number detection', () => {
  function detectMagicNumbers(code: string): number[] {
    const numbers: number[] = [];
    const regex = /\b(\d{2,})\b/g;
    let match;
    while ((match = regex.exec(code)) !== null) {
      const num = parseInt(match[1]);
      if ([0, 1, 2, 10, 100, 1000, 1024].includes(num)) continue;
      if (num >= 200 && num <= 599) continue;
      numbers.push(num);
    }
    return [...new Set(numbers)];
  }

  it('should detect magic numbers', () => {
    const code = 'const timeout = 3500';
    const nums = detectMagicNumbers(code);
    expect(nums).toContain(3500);
  });

  it('should skip common numbers', () => {
    const code = 'const x = 1 + 2 + 10 + 100';
    const nums = detectMagicNumbers(code);
    expect(nums.length).toBe(0);
  });

  it('should skip HTTP status codes', () => {
    const code = 'if (status === 404) return null';
    const nums = detectMagicNumbers(code);
    expect(nums).not.toContain(404);
  });

  it('should detect stock codes as magic', () => {
    const code = 'const stock = 600519';
    const nums = detectMagicNumbers(code);
    expect(nums).toContain(600519);
  });

  it('should handle no numbers', () => {
    const code = 'const name = "test"';
    const nums = detectMagicNumbers(code);
    expect(nums.length).toBe(0);
  });
});
