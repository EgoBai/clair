/**
 * 共享工具与类型 —— 澄观 Clair 前端 UI 质量守卫（轻量静态层 / S6-1 / D6）
 *
 * 此模块被 ast-scan.mts 与 baseline-scan.mts 复用，提供：
 *  - 类型定义（Finding / ScanResult / Severity）
 *  - 全局 JS/TS/React 运行时白名单（减少「引用未声明标识符」误报）
 *  - 文件过滤、路径拼接、是否是主模块等通用工具
 *  - JSX 相关辅助（取标签名、属性值、子元素、最近 Route 祖先）
 *  - 报告 Markdown 生成
 *
 * 该层为 best-effort 静态检查，不修改应用源码（src/）。
 */
import { SyntaxKind, Node, type SourceFile } from 'ts-morph';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  message: string;
  file?: string;
  line?: number;
  snippet?: string;
  fix?: string;
}

export interface ScanResult {
  name: string;
  findings: Finding[];
  filesScanned: number;
}

// scripts/ui-guard/lib.mts -> ../../../ = frontend
export const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
export const TSCONFIG = path.join(ROOT, 'tsconfig.json');
export const REPORT_PATH = path.join(ROOT, 'ui-guard-report.md');
export const CACHE_PATH = path.join(ROOT, 'scripts', 'ui-guard', '.ast-findings.json');

/**
 * 全局 / 内置标识符白名单。引用这些名称不会被判为「未声明」。
 * 覆盖浏览器、Node、ES2020、React 18 常用 hook / 组件、antd 风格工具等。
 */
export const GLOBALS: Set<string> = new Set([
  'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Boolean', 'Symbol', 'BigInt',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error', 'TypeError',
  'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError', 'AggregateError',
  'console', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'location', 'history', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'setImmediate', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'Event', 'CustomEvent', 'EventTarget',
  'Node', 'Element', 'HTMLElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLInputElement',
  'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLSelectElement', 'HTMLOptionElement',
  'HTMLTableElement', 'HTMLFormElement', 'HTMLParagraphElement', 'HTMLUListElement',
  'HTMLLIElement', 'HTMLImageElement', 'HTMLCanvasElement', 'HTMLLabelElement', 'HTMLHeadingElement',
  'DocumentFragment', 'Text', 'Comment', 'MutationObserver', 'IntersectionObserver',
  'ResizeObserver', 'PerformanceObserver', 'performance', 'process', 'globalThis', 'Reflect',
  'Proxy', 'Intl', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData',
  'Headers', 'Request', 'Response', 'AbortController', 'AbortSignal', 'structuredClone',
  'btoa', 'atob', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'escape', 'unescape', 'undefined', 'NaN',
  'Infinity', 'exports', 'module', 'require', '__dirname', '__filename', 'global', 'self',
  'Fragment', 'createElement', 'createContext', 'createRef', 'cloneElement', 'isValidElement',
  'createPortal', 'Component', 'PureComponent', 'Suspense', 'lazy', 'memo', 'forwardRef',
  'startTransition',
  'useMemo', 'useCallback', 'useEffect', 'useState', 'useRef', 'useReducer', 'useContext',
  'useLayoutEffect', 'useImperativeHandle', 'useDebugValue', 'useDeferredValue',
  'useTransition', 'useId', 'useSyncExternalStore', 'useInsertionEffect',
]);

/** 是否应被扫描（排除测试、归档、备份、声明、service worker）。 */
export function shouldScanFile(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/');
  if (p.includes('/__tests__/')) return false;
  if (p.includes('/_archived/')) return false;
  if (/\.bak(-\d+)?\.[cm]?[jt]sx?$/.test(p)) return false;
  if (p.endsWith('.d.ts')) return false;
  if (p.endsWith('/sw.ts')) return false;
  return true;
}

/** 拼接路由路径（处理绝对路径与相对路径）。 */
export function joinPaths(a: string, b: string): string {
  if (!b || b === '') return a;
  if (b.startsWith('/')) return b;
  if (a === '' || a === '/') return '/' + b;
  return a.replace(/\/$/, '') + '/' + b;
}

/** 判断当前模块是否作为入口直接运行（用于支持独立执行 ast-scan / baseline-scan）。 */
export function isMain(url: string): boolean {
  if (!url) return false;
  try {
    const f = fileURLToPath(url);
    const arg = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return path.resolve(f) === arg;
  } catch {
    return false;
  }
}

/** 取某行的片段（用于报告展示）。 */
export function getLineSnippet(sf: SourceFile, line: number): string {
  const lines = sf.getFullText().split('\n');
  return (lines[line - 1] || '').trim().slice(0, 220);
}

// ====================== JSX 辅助 ======================

/** 取得 JSX 元素标签名文本（如 'Route'、'Navigate'、'Foo.Bar'）。 */
export function getJsxTagNameText(node: Node): string | undefined {
  if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode().getText();
  if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode().getText();
  return undefined;
}

/** 取得某个 JSX 属性节点（不关心是否有值）。 */
export function getJsxAttr(node: Node, name: string) {
  if (!(Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node))) return undefined;
  return node.getAttributes().find((a) => a.getName() === name);
}

/** 取得 JSX 字符串属性值（支持 `to="..."` 与 `to={'...'}`）。 */
export function getJsxAttrString(node: Node, name: string): string | undefined {
  const a = getJsxAttr(node, name);
  if (!a) return undefined;
  const init = a.getInitializer();
  if (!init) return undefined;
  if (Node.isStringLiteral(init)) return init.getLiteralValue();
  if (Node.isJsxExpression(init)) {
    const e = init.getExpression();
    if (e && Node.isStringLiteral(e)) return e.getLiteralValue();
  }
  return undefined;
}

/** 判断是否存在「无值的布尔属性」（如 `<Route index .../>`）。 */
export function hasJsxAttr(node: Node, name: string): boolean {
  const a = getJsxAttr(node, name);
  return !!a && !a.getInitializer();
}

/** 取得 JSX 元素直接的子 JSX 元素（用于递归遍历路由树）。 */
export function getJsxChildren(node: Node): Node[] {
  if (!Node.isJsxElement(node)) return [];
  const out: Node[] = [];
  for (const c of node.getChildren()) {
    if (Node.isJsxElement(c) || Node.isJsxSelfClosingElement(c)) out.push(c);
  }
  return out;
}

/** 向上查找最近的 Route 祖先 JSX 元素。 */
export function nearestRouteAncestor(node: Node): Node | undefined {
  let p = node.getParent();
  while (p) {
    const tag = getJsxTagNameText(p);
    if (tag === 'Route') return p;
    p = p.getParent();
  }
  return undefined;
}

// ====================== 报告生成 ======================

function fmtFinding(f: Finding): string {
  const rel = f.file ? f.file.replace(ROOT, '.').replace(/\\/g, '/') : '';
  const loc = f.file ? ` \`${rel}:${f.line ?? '?'}\`` : '';
  const fix = f.fix ? `\n  - 建议: ${f.fix}` : '';
  const snip = f.snippet ? `\n  - 代码: \`${f.snippet.replace(/`/g, "'")}\`` : '';
  return `- **[${f.severity.toUpperCase()}]** (${f.category}) ${f.message}${loc}${snip}${fix}`;
}

function relPath(p: string): string {
  return p.replace(ROOT, '.').replace(/\\/g, '/');
}

/** 生成完整 Markdown 报告（由 baseline-scan 在最后一步写出）。 */
export function buildReport(astResult: ScanResult, baselineResult: ScanResult): string {
  const now = new Date().toISOString();
  const all = [...astResult.findings, ...baselineResult.findings];
  const count = (sev: Severity) => all.filter((f) => f.severity === sev).length;
  const err = count('error');
  const warn = count('warn');
  const info = count('info');
  const verdict = err === 0 ? '✅ PASS（无 ERROR 级问题）' : '❌ FAIL（存在 ERROR 级问题，需修复）';

  const section = (res: ScanResult) => {
    const sev = (s: Severity) => res.findings.filter((f) => f.severity === s).length;
    const head =
      `### ${res.name}（扫描 ${res.filesScanned} 个文件）\n\n` +
      `错误: ${sev('error')} · 警告: ${sev('warn')} · 提示: ${sev('info')}\n`;
    if (res.findings.length === 0) return head + '\n_未发现该层相关的问题。_\n';
    const order = { error: 0, warn: 1, info: 2 };
    const sorted = [...res.findings].sort((a, b) => order[a.severity] - order[b.severity]);
    return head + '\n' + sorted.map(fmtFinding).join('\n') + '\n';
  };

  return `# 澄观 Clair 前端 UI 质量守卫 · 扫描报告

> 生成时间: ${now}
> 层级: **轻量静态层（S6-1 / D6 决策）** —— 仅静态 AST + 正则/数据基线，**不含** Playwright 运行时截图（属第二阶段）。

## 1. 守卫设计概览

本守卫是 D6 决策确认的「轻量静态层」，目标是在不改变应用源码（\`src/\`）的前提下，以低成本静态检查捕获此前真实出现过的 UI 质量缺陷：

- **AST 扫描（ast-scan.mts / ts-morph）**
  - 死 \`useState\`：声明但从未被读取的状态（历史 bug：\`showHeatmap\` / \`heatmapMode\` 死状态）。
  - 引用未声明标识符：组件/函数内被使用但文件作用域未声明的变量（历史 bug：\`displayMode\` 被使用 4 次却从未声明），best-effort。
  - 路由重定向环路（A→B→A）与未定义路径引用。
  - 重复 state key（同一函数内同名 \`useState\`）。
- **基线扫描（baseline-scan.mts / 正则 + ts-morph）**
  - 重复符号 \`++\`（如模板字面量拼接导致渲染出 \`++2.95%\`）。
  - \`NaN\` / \`undefined\` 直接渲染到界面。
  - 硬编码空兜底 \`|| ''\` / \`?? ''\`（提示级）。
  - 数据基线：维度键数组（\`ALL_DIM_KEYS\`）数量与接口声明（\`DemoMultidimData.dimensions\`）属性数量一致性（历史 bug：11 vs 14）。

## 2. 如何运行

\`\`\`bash
cd ${relPath(ROOT)}
npm run guard          # 依次运行 ast-scan 与 baseline-scan，并生成本报告
npx tsc --noEmit       # 应用类型检查（守卫脚本自身不在该 tsconfig 的 include 内，不破坏既有检查）
\`\`\`

退出码策略：存在 ERROR 级问题时进程返回非 0（可作为 CI 门禁）；WARN / INFO 不阻断。

## 3. AST 扫描结果

${section(astResult)}

## 4. 基线扫描结果

${section(baselineResult)}

## 5. 汇总

- 错误(ERROR): ${err}
- 警告(WARN): ${warn}
- 提示(INFO): ${info}
- 总文件扫描: AST ${astResult.filesScanned} + 基线 ${baselineResult.filesScanned}

**结论: ${verdict}**

> 说明：本层为 best-effort 静态检查，可能存在少量误报（尤其「引用未声明标识符」与「死 useState」为启发式）。
> 发现的问题优先**报告**而非静默修复；仅当确认为琐碎、隔离、明显安全的源码 bug 时才直接修复，并在报告中显式标注。
`;
}
