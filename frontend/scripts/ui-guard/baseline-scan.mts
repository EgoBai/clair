/**
 * 基线扫描（正则 + ts-morph）—— 澄观 Clair 前端 UI 质量守卫（轻量静态层 / S6-1 / D6）
 *
 * 检查项：
 *  1. 重复符号 "++"（如模板字面量拼接导致渲染出 "++2.95%"）。
 *  2. NaN / undefined 直接渲染到界面（字符串/模板字面量与 JSX 文本）。
 *  3. 硬编码空兜底 || '' / ?? ''（提示级）。
 *  4. 数据基线：维度键数组 ALL_DIM_KEYS 数量与接口 DemoMultidimData.dimensions 属性数量一致性（历史 bug：11 vs 14）。
 *
 * 入口：可由 `npm run guard` 直接执行（`tsx scripts/ui-guard/baseline-scan.mts`）。
 * 直接运行时读取 ast-scan 写入的缓存，汇总生成完整 ui-guard-report.md。
 */
import { Project, SyntaxKind, Node, type SourceFile } from 'ts-morph';
import * as path from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import {
  ROOT, TSCONFIG, REPORT_PATH, CACHE_PATH, shouldScanFile,
  isMain, buildReport, type Finding, type ScanResult,
} from './lib.mts';

export function scanBaseline(root: string = ROOT): ScanResult {
  const project = new Project({ tsConfigFilePath: TSCONFIG, skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(path.join(root, 'src', '**', '*.{ts,tsx}'));
  const files = project.getSourceFiles().filter((f) => shouldScanFile(f.getFilePath()));
  const findings: Finding[] = [];

  for (const sf of files) scanFileBaseline(sf, findings);
  checkDimensionKeys(project, findings);

  return { name: 'baseline-scan', findings, filesScanned: files.length };
}

function scanFileBaseline(sf: SourceFile, findings: Finding[]) {
  const filePath = sf.getFilePath();
  const lines = sf.getFullText().split('\n');
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const trimmed = line.trim();

    // 1. 重复符号 ++（先去掉 ${...} 插值，避免把 ++i 之类的自增误报）
    const cleaned = line.replace(/\$\{.*?\}/g, '');
    const strMatches = cleaned.match(/`[^`]*`|'[^']*'|"[^"]*"/g) || [];
    for (const s of strMatches) {
      if (s.includes('++')) {
        findings.push({
          id: 'dup-sign',
          severity: 'error',
          category: 'duplicate-sign',
          message: '字符串/模板字面量中出现连续 "++"（可能导致渲染出 "++2.95%" 之类的重复符号）。',
          file: filePath,
          line: lineNo,
          snippet: trimmed.slice(0, 200),
          fix: '检查正负号拼接逻辑，避免重复添加 "+"。',
        });
      }
    }

    // 2. NaN / undefined 出现在「静态」模板字面量文本中（先去掉 ${...} 插值，
    //    避免把 `${x ?? undefined}` 这类比较/兜底误报为已渲染）。
    const tplMatches = cleaned.match(/`[^`]*`/g) || [];
    for (const s of tplMatches) {
      if (/\b(?:NaN|undefined)\b/.test(s)) {
        findings.push({
          id: 'nan-render',
          severity: 'warn',
          category: 'nan-undefined-render',
          message: '模板字面量静态文本包含字面量 "NaN" 或 "undefined"（可能直接渲染到界面）。',
          file: filePath,
          line: lineNo,
          snippet: trimmed.slice(0, 200),
          fix: '渲染前对数值做格式化/兜底，避免把 NaN/undefined 透出到 UI。',
        });
      }
    }

    // 3. 硬编码空兜底（提示级）—— 仅关注渲染上下文（模板字面量内），降低噪声
    if (/(?:\?\?|\|\|)\s*(''|"")/.test(line) && line.includes('`')) {
      findings.push({
        id: 'empty-fallback',
        severity: 'info',
        category: 'hardcoded-empty-fallback',
        message: "检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。",
        file: filePath,
        line: lineNo,
        snippet: trimmed.slice(0, 200),
        fix: '确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。',
      });
    }
  });

  // 4. NaN / undefined 出现在 JSX 文本节点
  for (const jt of sf.getDescendantsOfKind(SyntaxKind.JsxText)) {
    const t = jt.getText().trim();
    if (t && /\b(?:NaN|undefined)\b/.test(t)) {
      findings.push({
        id: 'nan-render-jsx',
        severity: 'warn',
        category: 'nan-undefined-render',
        message: 'JSX 文本节点包含字面量 "NaN" 或 "undefined"。',
        file: filePath,
        line: jt.getStartLineNumber(),
        snippet: t.slice(0, 200),
        fix: '渲染前对数值做格式化/兜底。',
      });
    }
  }
}

/** 统计数组字面量中的字符串元素个数（递归解析 spread 引用的另一数组常量）。 */
function countArrayElements(sf: SourceFile, node: Node): number {
  // 解开 `as const` / 类型断言包裹
  const k = node.getKind();
  if (k === SyntaxKind.AsExpression || k === SyntaxKind.TypeAssertionExpression) {
    return countArrayElements(sf, (node as { getExpression: () => Node }).getExpression());
  }
  if (Node.isArrayLiteralExpression(node)) {
    let n = 0;
    for (const el of node.getElements()) {
      if (Node.isSpreadElement(el)) {
        const expr = el.getExpression();
        if (Node.isIdentifier(expr)) {
          const decl = sf.getVariableDeclaration(expr.getText());
          if (decl && decl.getInitializer()) n += countArrayElements(sf, decl.getInitializer()!);
        }
      } else if (Node.isStringLiteral(el)) {
        n++;
      }
    }
    return n;
  }
  return 0;
}

/** 数据基线：ALL_DIM_KEYS 数量 vs DemoMultidimData.dimensions 属性数量。 */
function checkDimensionKeys(project: Project, findings: Finding[]) {
  const sf = project
    .getSourceFiles()
    .find((f) => f.getFilePath().replace(/\\/g, '/').endsWith('/utils/demoData.ts'));
  if (!sf) return;
  const allDim = sf.getVariableDeclaration('ALL_DIM_KEYS');
  if (!allDim) return;
  const init = allDim.getInitializer();
  if (!init) return;
  const count = countArrayElements(sf, init);

  const iface = sf.getInterface('DemoMultidimData');
  let ifaceCount: number | undefined;
  if (iface) {
    const dims = iface.getProperty('dimensions');
    if (dims) {
      const tn = dims.getTypeNode();
      if (tn && Node.isTypeLiteral(tn)) ifaceCount = tn.getProperties().length;
    }
  }

  if (ifaceCount !== undefined && count !== ifaceCount) {
    findings.push({
      id: 'dim-key-mismatch',
      severity: 'error',
      category: 'dimension-key-baseline',
      message: `维度键数量不一致: ALL_DIM_KEYS 含 ${count} 个键，而 DemoMultidimData.dimensions 接口声明 ${ifaceCount} 个属性（历史 bug：11 vs 14）。`,
      file: sf.getFilePath(),
      line: allDim.getStartLineNumber(),
      fix: '同步 ALL_DIM_KEYS 与 DemoMultidimData.dimensions，确保维度键完全对应。',
    });
  }
}

// ====================== 入口 ======================
if (isMain(import.meta.url)) {
  const result = scanBaseline();
  console.log(`\n=== baseline-scan ===`);
  console.log(`扫描文件: ${result.filesScanned}`);
  const bySev = (s: string) => result.findings.filter((f) => f.severity === s).length;
  console.log(`错误: ${bySev('error')} · 警告: ${bySev('warn')} · 提示: ${bySev('info')}`);
  for (const f of result.findings) {
    const loc = f.file ? ` (${f.file.replace(ROOT, '.').replace(/\\/g, '/')}:${f.line})` : '';
    console.log(`  [${f.severity.toUpperCase()}] ${f.category}${loc}: ${f.message}`);
  }

  // 汇总完整报告（读取 ast-scan 缓存）
  let astResult: ScanResult = { name: 'ast-scan', findings: [], filesScanned: 0 };
  try {
    const raw = readFileSync(CACHE_PATH, 'utf8');
    if (raw) astResult = JSON.parse(raw) as ScanResult;
  } catch {
    /* ast 未运行则使用空结果 */
  }
  try {
    writeFileSync(REPORT_PATH, buildReport(astResult, result));
    console.log(`\n报告已写入: ${REPORT_PATH}`);
  } catch (e) {
    console.error('写入报告失败:', e);
  }
  process.exitCode = bySev('error') > 0 ? 1 : 0;
}
