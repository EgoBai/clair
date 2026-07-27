/**
 * AST 扫描（ts-morph）—— 澄观 Clair 前端 UI 质量守卫（轻量静态层 / S6-1 / D6）
 *
 * 检查项：
 *  1. 死 useState：状态被声明但从未被读取（历史 bug：showHeatmap / heatmapMode）。
 *  2. 引用未声明标识符：组件/函数内被使用但文件作用域未声明的变量（best-effort）。
 *  3. 路由重定向环路（A→B→A）与未定义路径引用。
 *  4. 重复 state key（同一函数内同名 useState）。
 *
 * 入口：可由 `npm run guard` 直接执行（`tsx scripts/ui-guard/ast-scan.mts`）。
 * 直接运行时把本层结果写入 .ast-findings.json 缓存，供 baseline-scan 汇总报告。
 */
import { Project, SyntaxKind, Node, type SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  ROOT, TSCONFIG, CACHE_PATH, GLOBALS, shouldScanFile,
  joinPaths, isMain, getLineSnippet, getJsxTagNameText, getJsxAttrString,
  hasJsxAttr, getJsxChildren, nearestRouteAncestor, type Finding, type ScanResult,
} from './lib.mts';

export function scanAst(root: string = ROOT): ScanResult {
  const project = new Project({ tsConfigFilePath: TSCONFIG, skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(path.join(root, 'src', '**', '*.{ts,tsx}'));
  const files = project.getSourceFiles().filter((f) => shouldScanFile(f.getFilePath()));
  const findings: Finding[] = [];

  for (const sf of files) {
    const filePath = sf.getFilePath();
    const bindings = collectBindings(sf);
    for (const n of sf.getDescendants()) {
      const k = n.getKind();
      if (k === SyntaxKind.FunctionDeclaration || k === SyntaxKind.FunctionExpression || k === SyntaxKind.ArrowFunction) {
        detectUseStateIssues(sf, n, filePath, findings);
      }
    }
    detectUndeclared(sf, bindings, filePath, findings);
  }

  detectRouteIssues(files, findings);
  return { name: 'ast-scan', findings, filesScanned: files.length };
}

/** 收集文件内所有「绑定名」（声明/导入/函数/类/接口/类型/枚举），用于未声明标识符判定。 */
function collectBindings(sf: SourceFile): Set<string> {
  const s = new Set<string>();
  const addNameNode = (nn: Node) => {
    if (Node.isIdentifier(nn)) s.add(nn.getText());
    else if (Node.isArrayBindingPattern(nn)) nn.getElements().forEach((el) => { if (Node.isBindingElement(el)) addNameNode(el.getNameNode()); });
    else if (Node.isObjectBindingPattern(nn)) nn.getElements().forEach((el) => { if (Node.isBindingElement(el)) { const pn = el.getPropertyNameNode(); if (pn) s.add(pn.getText()); else addNameNode(el.getNameNode()); } });
  };
  for (const vd of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) addNameNode(vd.getNameNode());
  for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) { const n = fn.getNameNode(); if (n) s.add(n.getText()); }
  for (const cl of sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) { const n = cl.getNameNode(); if (n) s.add(n.getText()); }
  for (const en of sf.getDescendantsOfKind(SyntaxKind.EnumDeclaration)) s.add(en.getName());
  for (const id of sf.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)) s.add(id.getName());
  for (const ta of sf.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)) s.add(ta.getName());
  for (const imp of sf.getDescendantsOfKind(SyntaxKind.ImportDeclaration)) {
    const ic = imp.getImportClause();
    if (!ic) continue;
    const def = ic.getDefaultImport();
    if (def) s.add(def.getText());
    const ns = ic.getNamespaceImport();
    if (ns) s.add(ns.getText());
    const nb = ic.getNamedBindings();
    if (nb && Node.isNamedImports(nb)) for (const spec of nb.getElements()) s.add(spec.getName());
  }
  return s;
}

function isUseStateCall(call: Node): boolean {
  const expr = (call as { getExpression?: () => Node }).getExpression?.();
  if (!expr) return false;
  if (Node.isIdentifier(expr)) return expr.getText() === 'useState';
  if (Node.isPropertyAccessExpression(expr)) return expr.getName() === 'useState';
  return false;
}

/** 死 useState + 重复 state key。 */
function detectUseStateIssues(sf: SourceFile, fn: Node, filePath: string, findings: Finding[]) {
  const calls = fn.getDescendantsOfKind(SyntaxKind.CallExpression).filter(isUseStateCall);
  const seen: Record<string, number> = {};
  const firstLine: Record<string, number> = {};
  for (const call of calls) {
    const vd = call.getParent();
    if (!vd || !Node.isVariableDeclaration(vd)) continue;
    const nameNode = vd.getNameNode();
    if (!Node.isArrayBindingPattern(nameNode)) continue;
    const elems = nameNode.getElements();
    const first = elems[0];
    if (!first || Node.isOmittedExpression(first)) continue;
    const stateNameNode = first.getNameNode();
    if (!Node.isIdentifier(stateNameNode)) continue;
    const stateName = stateNameNode.getText();
    // 统计函数体内对 stateName 的引用（排除声明本身）
    const refs = fn
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((r) => r.getText() === stateName && r !== stateNameNode);
    if (refs.length === 0) {
      findings.push({
        id: 'dead-useState',
        severity: 'warn',
        category: 'dead-useState',
        message: `useState 状态 "${stateName}" 被声明但从未被读取（疑似死状态；历史 bug：showHeatmap / heatmapMode）。`,
        file: filePath,
        line: stateNameNode.getStartLineNumber(),
        snippet: getLineSnippet(sf, stateNameNode.getStartLineNumber()),
        fix: `若 "${stateName}" 确实无用请删除该 useState；若应驱动 UI，请补充读取/使用。`,
      });
    }
    if (!(stateName in seen)) firstLine[stateName] = stateNameNode.getStartLineNumber();
    seen[stateName] = (seen[stateName] || 0) + 1;
  }
  for (const [name, count] of Object.entries(seen)) {
    if (count > 1) {
      findings.push({
        id: 'duplicate-state-key',
        severity: 'error',
        category: 'duplicate-state-key',
        message: `同一函数内重复声明了同名 useState 状态 "${name}"（${count} 次）。`,
        file: filePath,
        line: firstLine[name],
        snippet: getLineSnippet(sf, firstLine[name]),
        fix: '重命名以避免状态键冲突。',
      });
    }
  }
}

/** 标识符是否位于 JSDoc 注释内（@returns / @example / @deprecated 等的标签名）。 */
function isInJsDoc(id: Node): boolean {
  let p = id.getParent();
  while (p) {
    if (Node.isJSDoc(p) || Node.isJSDocTag(p)) return true;
    p = p.getParent();
  }
  return false;
}

/** 跳过非「值引用」位置的标识符。 */
function isSkippedIdentifier(id: Node): boolean {
  const parent = id.getParent();
  if (!parent) return true;
  if (isInJsDoc(id)) return true;
  const pk = parent.getKind();
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return true;
  if (Node.isQualifiedName(parent) && parent.getRight() === id) return true;
  if (pk === SyntaxKind.JsxOpeningElement || pk === SyntaxKind.JsxClosingElement || pk === SyntaxKind.JsxSelfClosingElement) return true;
  if (pk === SyntaxKind.JsxMemberExpression && parent.getNameNode() === id) return true;
  if (pk === SyntaxKind.JsxAttribute && parent.getNameNode() === id) return true;
  if (
    (pk === SyntaxKind.PropertyAssignment || pk === SyntaxKind.PropertySignature || pk === SyntaxKind.MethodSignature ||
      pk === SyntaxKind.MethodDeclaration || pk === SyntaxKind.GetAccessor || pk === SyntaxKind.SetAccessor) &&
    parent.getNameNode() === id
  ) return true;
  if (pk === SyntaxKind.LabeledStatement && parent.getLabel() === id) return true;
  if (pk === SyntaxKind.Decorator) return true;
  if (Node.isBindingElement(parent) && parent.getPropertyNameNode() === id) return true;
  if (
    Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isNamespaceImport(parent) ||
    Node.isExportSpecifier(parent) || Node.isExportAssignment(parent)
  ) return true;
  return false;
}

/** 引用未声明标识符（best-effort）。 */
function detectUndeclared(sf: SourceFile, bindings: Set<string>, filePath: string, findings: Finding[]) {
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isSkippedIdentifier(id)) continue;
    const text = id.getText();
    if (bindings.has(text) || GLOBALS.has(text)) continue;
    let sym: unknown;
    try {
      sym = (id as { getSymbol?: () => unknown }).getSymbol?.();
    } catch {
      sym = undefined;
    }
    if (sym) continue;
    findings.push({
      id: 'undeclared-identifier',
      severity: 'warn',
      category: 'undeclared-identifier',
      message: `标识符 "${text}" 被引用但文件作用域内未声明（疑似引用未声明变量；历史 bug：displayMode 被使用但未声明）。`,
      file: filePath,
      line: id.getStartLineNumber(),
      snippet: getLineSnippet(sf, id.getStartLineNumber()),
      fix: `确认 "${text}" 应来自 props/state/import，或是否为拼写错误。`,
    });
  }
}

function isNavigate(node: Node): boolean {
  return getJsxTagNameText(node) === 'Navigate';
}

/** 路由重定向环路 + 未定义路径引用。 */
function detectRouteIssues(files: SourceFile[], findings: Finding[]) {
  const routeFiles = files.filter((f) => f.getFilePath().replace(/\\/g, '/').includes('/routes/'));
  const redirects: Record<string, { to: string; node: Node }> = {};
  const definedPaths = new Set<string>();

  for (const sf of routeFiles) {
    const allJsx = [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    // 仅从「顶层」JSX 树根开始遍历，避免重复处理嵌套 Route
    const roots = allJsx.filter((el) => {
      let p = el.getParent();
      while (p) {
        if (Node.isJsxElement(p) || Node.isJsxSelfClosingElement(p)) return false;
        p = p.getParent();
      }
      return true;
    });
    for (const r of roots) walkRoutes(r, '', redirects, definedPaths);
  }

  for (const [from, redir] of Object.entries(redirects)) {
    const targetPath = redir.to.split('?')[0].split('#')[0];
    // 跟随重定向链，检测环路
    const chain: string[] = [from];
    let cur = targetPath;
    let loop = false;
    let hops = 0;
    while (redirects[cur] !== undefined) {
      if (chain.includes(cur)) { loop = true; break; }
      chain.push(cur);
      const nextPath = redirects[cur].to.split('?')[0].split('#')[0];
      if (nextPath === from) { loop = true; break; }
      cur = nextPath;
      hops++;
      if (hops > 50) break;
    }
    if (loop) {
      findings.push({
        id: 'route-redirect-loop',
        severity: 'error',
        category: 'route-redirect-loop',
        message: `路由重定向环路: ${from} -> ... -> ${from}（链: ${chain.join(' -> ')} -> ${targetPath}）。`,
        file: redir.node.getSourceFile().getFilePath(),
        line: redir.node.getStartLineNumber(),
        fix: '打破重定向环路，确保最终落到真实页面或 404。',
      });
    }
    const isSplat = targetPath.endsWith('*');
    if (!loop && !definedPaths.has(targetPath) && targetPath !== '/' && !isSplat) {
      findings.push({
        id: 'route-undefined-path',
        severity: 'error',
        category: 'route-undefined-path',
        message: `路由重定向目标 "${targetPath}"（来自 "${from}"）未在任何 Route 中定义（疑似未定义路径引用）。`,
        file: redir.node.getSourceFile().getFilePath(),
        line: redir.node.getStartLineNumber(),
        fix: '确认目标路径已配置对应 <Route>，或改用 ROUTE_PATHS 常量避免拼写错误。',
      });
    }
  }
}

function walkRoutes(
  node: Node,
  parentPath: string,
  redirects: Record<string, { to: string; node: Node }>,
  definedPaths: Set<string>,
) {
  const tag = getJsxTagNameText(node);
  if (tag === 'Route') {
    const pathAttr = getJsxAttrString(node, 'path');
    const isIndex = hasJsxAttr(node, 'index');
    const full = isIndex ? parentPath : joinPaths(parentPath, pathAttr ?? '');
    definedPaths.add(full);
    // 找到「最近 Route 祖先就是本节点」的 Navigate（避免误取深层嵌套 Route 的重定向）
    const navs = [
      ...node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...node.getDescendantsOfKind(SyntaxKind.JsxElement),
    ].filter(isNavigate);
    for (const nav of navs) {
      if (nearestRouteAncestor(nav) === node) {
        const to = getJsxAttrString(nav, 'to');
        if (to !== undefined) redirects[full] = { to, node: nav };
        break;
      }
    }
    for (const child of getJsxChildren(node)) walkRoutes(child, full, redirects, definedPaths);
    return;
  }
  for (const child of getJsxChildren(node)) walkRoutes(child, parentPath, redirects, definedPaths);
}

// ====================== 入口 ======================
if (isMain(import.meta.url)) {
  const result = scanAst();
  console.log(`\n=== ast-scan ===`);
  console.log(`扫描文件: ${result.filesScanned}`);
  const bySev = (s: string) => result.findings.filter((f) => f.severity === s).length;
  console.log(`错误: ${bySev('error')} · 警告: ${bySev('warn')} · 提示: ${bySev('info')}`);
  for (const f of result.findings) {
    const loc = f.file ? ` (${f.file.replace(ROOT, '.').replace(/\\/g, '/')}:${f.line})` : '';
    console.log(`  [${f.severity.toUpperCase()}] ${f.category}${loc}: ${f.message}`);
  }
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(result));
  } catch (e) {
    console.error('写入缓存失败:', e);
  }
  process.exitCode = bySev('error') > 0 ? 1 : 0;
}
