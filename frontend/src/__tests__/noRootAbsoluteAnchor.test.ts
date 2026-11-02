/**
 * 防复发：全仓不得出现「根绝对路径」的原生 <a href>
 *
 * 背景（线上真实故障，2026-11-03）：LockupCalendarPage.tsx:377 用了
 * `<a href={`/stocks/${record.symbol}`}>`。裸 <a> 是**整页导航**，绕过 React Router 的
 * basename（生产 '/clair/'），浏览器会把 '/stocks/xxx' 解析成站点根
 * https://egobai.github.io/stocks/xxx —— 那里没有 Pages 站点，于是拿到 GitHub 通用 404
 * 「There isn't a GitHub Pages site here.」。该页当月有 154 条真实解禁记录，属"正在发生"。
 *
 * 为什么需要这个测试：这类缺陷靠肉眼 review 抓不住，而且**搜索形态有盲区**——
 * 上一轮排查只搜静态串 `href="/"`，漏掉了模板字面量 `href={`/...`}`，于是得出
 * "没有可达路径"的错误结论。所以本文件把搜索形态**显式建模**并自测覆盖：
 *
 *   ① 静态双引号      <a href="/stocks/1">
 *   ② 静态单引号      <a href='/stocks/1'>
 *   ③ 模板字面量      <a href={`/stocks/${x}`}>
 *   ④ 单/双引号表达式 <a href={'/stocks/1'}>
 *   ⑤ 跨行 JSX 属性   <a\n  className="x"\n  href="/stocks/1"\n>
 *   ⑥ 纯表达式        <a href={someVar}>   ← 静态不可判定，出现即报（要求显式列入白名单并说明）
 *
 * 排除目录（显式声明）：_archived（未挂载的历史页）、__tests__、node_modules、dist。
 * 注意：_archived 里的同类写法是**已知且故意不修**的（页面不挂载），若哪天恢复它们，
 * 必须同时把它们从排除名单移除，否则这里会被绕过。
 *
 * 合法的站内跳转写法：react-router 的 `<Link to="/stocks/1">`（basename 由 Router 处理），
 * 或 `href={import.meta.env.BASE_URL + 'xxx'}`（独立入口、不在 Router 内时）。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 从 cwd 逐级向上找 frontend/src */
function findSrcDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'frontend/src');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('找不到 frontend/src');
}

const EXCLUDED_DIRS = ['_archived', '__tests__', 'node_modules', 'dist'];

/**
 * 已知例外：文件相对路径 → 理由。
 * 只允许"确认不可达"的条目；可达的一律不允许挂在这里。
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: 'PerformanceApp.tsx',
    reason:
      '独立入口 index-performance.html（frontend 根，不在 vite rollupOptions.input 里，不进 dist；' +
      '线上 /clair/index-performance.html 实测 404），故该 <a href="/"> 不可达。' +
      '若将来把它接进构建，需改成 href={import.meta.env.BASE_URL} 并从此处移除。',
  },
];

/**
 * 把块注释（含 JSX 的 {/* ... *\/}）替换成等长空白，保留换行与下标，行号才不会漂。
 *
 * 为什么必须剥离：注释里经常出现示例代码。实测踩过——LockupCalendarPage.tsx 里那段
 * "必须用 Link 软跳，裸 <a href=\"/stocks/…\"> 会…" 的解释性注释，会被当成真实代码误报。
 *
 * 未剥离 `//` 行注释：`//` 在字符串里（如 "https://…"）极常见，粗暴剥离会破坏源码；
 * 代价是"行注释里写 <a href=\"/x\">"会误报 —— 可接受，改注释措辞即可。
 */
export function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

type AnchorForm = 'static-double' | 'static-single' | 'template' | 'expr-string' | 'expression';

interface AnchorHit {
  form: AnchorForm;
  value: string;
  /** 匹配起点在源码中的下标，用于换算行号 */
  index: number;
}

/**
 * 扫描源码里所有原生 <a ... href=...>。
 * 用 /s 让 [^>]*? 能跨行（覆盖 ⑤ 跨行 JSX 属性）。
 */
export function scanAnchorHrefs(src: string): AnchorHit[] {
  const hits: AnchorHit[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const rest = src.slice(start);
    let form: AnchorForm = 'expression';
    let value = '';

    if (rest.startsWith('"')) {
      form = 'static-double';
      value = rest.slice(1, rest.indexOf('"', 1));
    } else if (rest.startsWith("'")) {
      form = 'static-single';
      value = rest.slice(1, rest.indexOf("'", 1));
    } else if (rest.startsWith('{')) {
      const inner = rest.slice(1);
      if (inner.startsWith('`')) {
        form = 'template';
        value = inner.slice(1, inner.indexOf('`', 1));
      } else if (inner.startsWith('"')) {
        form = 'expr-string';
        value = inner.slice(1, inner.indexOf('"', 1));
      } else if (inner.startsWith("'")) {
        form = 'expr-string';
        value = inner.slice(1, inner.indexOf("'", 1));
      } else {
        form = 'expression';
        const end = inner.indexOf('}');
        value = end >= 0 ? inner.slice(0, end) : inner;
      }
    }

    hits.push({ form, value, index: m.index });
  }
  return hits;
}

const isRootAbsolute = (value: string) => value.trim().startsWith('/');

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

describe('扫描器自身的形态覆盖（防空转变绿）', () => {
  it('六种写法都必须被识别，且根绝对路径都要被判为违规', () => {
    const samples = [
      '<a href="/stocks/1">x</a>',                    // ①
      "<a href='/stocks/1'>x</a>",                    // ②
      '<a href={`/stocks/${symbol}`}>x</a>',          // ③
      "<a href={'/stocks/1'}>x</a>",                  // ④
      '<a\n  className="c"\n  href="/stocks/1"\n>x</a>', // ⑤ 跨行
    ];
    for (const s of samples) {
      const hits = scanAnchorHrefs(s);
      expect(hits.length, `未识别：${s}`).toBe(1);
      expect(isRootAbsolute(hits[0].value), `未判违规：${s} → ${hits[0].value}`).toBe(true);
    }

    // ⑥ 纯表达式：识别为 expression 形态（静态不可判定，由用例要求显式白名单）
    const expr = scanAnchorHrefs('<a href={someVar}>x</a>');
    expect(expr.length).toBe(1);
    expect(expr[0].form).toBe('expression');

    // 注释里的示例代码不得误报
    expect(scanAnchorHrefs(stripBlockComments('{/* 裸 <a href="/x"> 是整页导航 */}')).length).toBe(0);
    expect(scanAnchorHrefs(stripBlockComments('/* <a href="/x"> */')).length).toBe(0);

    // 合法写法不得误报
    expect(scanAnchorHrefs('<Link to="/stocks/1">x</Link>').length).toBe(0);
    expect(scanAnchorHrefs('<a href={import.meta.env.BASE_URL}>x</a>').every((h) => !isRootAbsolute(h.value))).toBe(true);
  });
});

describe('全仓原生 <a href> 不得使用根绝对路径', () => {
  it('扫描范围足够大（防止路径找不到导致空转）', () => {
    const files = walk(findSrcDir());
    expect(files.length).toBeGreaterThan(50);
  });

  it('无根绝对路径的 <a href>（除显式白名单）', () => {
    const srcDir = findSrcDir();
    const files = walk(srcDir);
    const violations: string[] = [];
    const expressions: string[] = [];

    for (const file of files) {
      const rel = path.relative(srcDir, file);
      const src = stripBlockComments(fs.readFileSync(file, 'utf8'));
      for (const hit of scanAnchorHrefs(src)) {
        const where = `${rel}:${lineOf(src, hit.index)}`;
        if (hit.form === 'expression') {
          // 纯表达式无法静态判定：要求零出现，逼调用方写成可判定的形式
          expressions.push(`${where} href={${hit.value}}`);
          continue;
        }
        if (!isRootAbsolute(hit.value)) continue;
        if (ALLOWLIST.some((a) => a.file === rel)) continue;
        violations.push(`${where} [${hit.form}] href=${JSON.stringify(hit.value)}`);
      }
    }

    expect(expressions, `存在无法静态判定的 <a href={表达式}>，请改为静态串或 <Link>：\n${expressions.join('\n')}`).toEqual([]);
    expect(
      violations,
      `以下原生 <a href> 使用根绝对路径，会整页跳转并丢掉 Router 的 basename（生产 /clair/），` +
        `在 GitHub Pages 上命中通用 404：\n${violations.join('\n')}`
    ).toEqual([]);
  });

  it('白名单只允许"不可达"条目，且条目必须仍然存在（防止名单腐烂）', () => {
    const srcDir = findSrcDir();
    for (const entry of ALLOWLIST) {
      const p = path.join(srcDir, entry.file);
      expect(fs.existsSync(p), `白名单条目 ${entry.file} 已不存在，请删除`).toBe(true);
      expect(entry.reason.length, `白名单条目 ${entry.file} 缺少理由`).toBeGreaterThan(20);
    }
  });
});
