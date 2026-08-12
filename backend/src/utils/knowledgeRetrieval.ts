/**
 * 本地知识库检索（RAG 二期 · 答案溯源 + 置信度标注）
 * ----------------------------------------------------------------
 * 设计原则（遵守「诚实数据」红线）：
 * - 纯本地、确定性检索，不依赖任何外部 embedding / LLM 服务，不引入随机数；
 * - 知识源 = 仓库内 knowledge-base/ 下的 Markdown 文档（设计/模式/轮次沉淀）；
 * - 检索失败或语料为空 → 返回空结果 + dataSource:'unavailable'，绝不回填伪造片段；
 * - 每条命中都携带溯源信息（来源文件、章节、起始行、片段、相关度），便于答案溯源；
 * - 置信度由检索相关度与真实行情可得性共同推导，不夸大、不编造。
 *
 * 检索算法：BM25（词频-逆文档频率），对中文做 unigram + bigram 分词，对英文/数字做
 * 词元切分。无额外依赖，离线可跑，便于单元测试。
 */

import * as fs from 'fs';
import * as path from 'path';

// ==================== 类型定义 ====================

/** 原始知识文档（由 loadKnowledgeBase 从磁盘读取） */
export interface RawKnowledgeDoc {
  /** 相对知识库根目录的来源路径，如 "design/AI-ANALYSIS.md" —— 溯源主键 */
  source: string;
  /** 文档标题（首行 H1） */
  title: string;
  /** 全文内容 */
  content: string;
}

/** 经分块后的检索单元（携带溯源元数据） */
export interface KnowledgeChunk {
  source: string;
  title: string;
  /** 所属章节标题（最近一级 # / ## / ###） */
  section: string;
  /** 该块在原文中的起始行号（1-based），用于精准溯源 */
  line: number;
  /** 块正文 */
  text: string;
}

/** 检索命中结果（对外暴露的溯源结构） */
export interface RetrievedChunk {
  source: string;
  title: string;
  section: string;
  line: number;
  /** 命中文摘（可能截断），直接可展示给前端做溯源 */
  snippet: string;
  /** BM25 原始得分（>=0） */
  score: number;
  /** 归一化相关度 0-1（sigmoid 式，绝对量纲，便于置信度标注） */
  relevance: number;
}

/** 构建好的语料（分块 + 倒排所需的文档频率） */
export interface KnowledgeCorpus {
  chunks: KnowledgeChunk[];
  /** term -> 包含该 term 的块数（文档频率，块级） */
  docFreq: Map<string, number>;
  /** 全部块的平均 token 数，BM25 归一化用 */
  avgChunkLen: number;
  /** 语料是否真实可用（false = 知识库缺失/为空，应诚实降级） */
  available: boolean;
}

export interface RetrieveOptions {
  limit?: number;
  /** 最小归一化相关度阈值，低于此值不计入结果（默认 0.05，过滤噪声） */
  minRelevance?: number;
  /** 片段最大长度（字符），默认 200 */
  snippetLength?: number;
}

// ==================== 分词 ====================

const CJK_RE = /[一-鿿㐀-䶿]/;
const WORD_RE = /[a-zA-Z0-9]+/g;

/** 将文本切分为检索词元：英文/数字词 + 中文 unigram/bigram */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];

  // 英文 / 数字词元（小写）
  const wordMatches = text.toLowerCase().match(WORD_RE);
  if (wordMatches) {
    for (const w of wordMatches) {
      if (w.length >= 2) tokens.push(w); // 丢弃单字符数字/字母噪声
    }
  }

  // 中文：unigram + bigram（提升中文召回）
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (CJK_RE.test(c)) {
      tokens.push(c);
      if (i + 1 < chars.length && CJK_RE.test(chars[i + 1])) {
        tokens.push(c + chars[i + 1]);
      }
    }
  }

  return tokens;
}

// ==================== 语料构建（分块 + 倒排） ====================

const MAX_CHUNK_CHARS = 600;

/**
 * 将单个原始文档切分为带溯源元数据的块。
 * 分块策略：沿 Markdown 标题层级与空行边界切分，单块不超过 MAX_CHUNK_CHARS。
 */
export function chunkDoc(doc: RawKnowledgeDoc): KnowledgeChunk[] {
  const lines = doc.content.split(/\r?\n/);
  const chunks: KnowledgeChunk[] = [];
  let section = doc.title || '正文';
  let buffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    const text = buffer.join('\n').trim();
    if (text.length === 0) {
      buffer = [];
      return;
    }
    chunks.push({
      source: doc.source,
      title: doc.title,
      section,
      line: startLine,
      text,
    });
    // 重置 buffer（保留当前 section）
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      // 标题行自身作为新块的起点，先 flush 旧缓冲
      flush(i + 1);
      section = heading[1].trim();
      startLine = i + 1;
      buffer = [line];
      flush(i + 1);
      continue;
    }
    if (line.trim() === '' && buffer.length > 0) {
      flush(i + 1);
      startLine = i + 2;
      continue;
    }
    buffer.push(line);
    if (buffer.join('\n').length >= MAX_CHUNK_CHARS) {
      flush(i + 1);
      startLine = i + 2;
    }
  }
  flush(lines.length);

  return chunks;
}

/**
 * 由原始文档构建检索语料（分块 + 文档频率统计）。
 * 空输入 → available:false，调用方据此诚实降级。
 */
export function buildCorpus(docs: RawKnowledgeDoc[]): KnowledgeCorpus {
  const chunks: KnowledgeChunk[] = [];
  for (const d of docs) {
    if (!d || !d.content) continue;
    chunks.push(...chunkDoc(d));
  }

  const docFreq = new Map<string, number>();
  let totalLen = 0;
  for (const c of chunks) {
    const toks = tokenize(c.text);
    totalLen += toks.length;
    const seen = new Set(toks);
    for (const t of seen) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
  }

  const avgChunkLen = chunks.length > 0 ? totalLen / chunks.length : 0;

  return {
    chunks,
    docFreq,
    avgChunkLen,
    available: chunks.length > 0,
  };
}

// ==================== BM25 检索 ====================

const BM25_K = 1.5;
const BM25_B = 0.75;
/** 相关度 sigmoid 归一化的尺度参数：relevance = score/(score+CONF_K) */
const CONF_K = 2.0;

function bm25Score(queryTokens: string[], chunk: KnowledgeChunk, corpus: KnowledgeCorpus): number {
  if (queryTokens.length === 0) return 0;
  const N = corpus.chunks.length;
  const tfMap = new Map<string, number>();
  for (const t of tokenize(chunk.text)) {
    tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
  }
  const chunkLen = Array.from(tfMap.values()).reduce((a, b) => a + b, 0);
  const avgdl = corpus.avgChunkLen || 1;

  let score = 0;
  for (const t of queryTokens) {
    const df = corpus.docFreq.get(t);
    if (!df) continue; // 该词在全库未出现 → 不贡献
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const f = tfMap.get(t) ?? 0;
    if (f === 0) continue;
    const denom = f + BM25_K * (1 - BM25_B + BM25_B * (chunkLen / avgdl));
    score += idf * ((f * (BM25_K + 1)) / denom);
  }
  return score;
}

function makeSnippet(text: string, snippetLength: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= snippetLength) return clean;
  return clean.slice(0, snippetLength) + '…';
}

/**
 * 核心检索：对给定语料执行 BM25 检索，返回按相关度降序排列、携带溯源的结果。
 * - query 为空 → 返回 []（不编造）；
 * - corpus 不可用 / 空 → 返回 []（由调用方诚实降级）。
 */
export function retrieveKnowledge(
  query: string,
  corpus: KnowledgeCorpus,
  opts: RetrieveOptions = {},
): RetrievedChunk[] {
  const limit = opts.limit ?? 5;
  const minRelevance = opts.minRelevance ?? 0.05;
  const snippetLength = opts.snippetLength ?? 200;

  if (!query || !query.trim() || !corpus.available || corpus.chunks.length === 0) {
    return [];
  }

  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) return [];

  const scored = corpus.chunks.map((c) => ({
    chunk: c,
    score: bm25Score(queryTokens, c, corpus),
  }));

  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const results: RetrievedChunk[] = [];
  for (const s of ranked) {
    const relevance = s.score / (s.score + CONF_K);
    if (relevance < minRelevance) continue;
    results.push({
      source: s.chunk.source,
      title: s.chunk.title,
      section: s.chunk.section,
      line: s.chunk.line,
      snippet: makeSnippet(s.chunk.text, snippetLength),
      score: Math.round(s.score * 1000) / 1000,
      relevance: Math.round(relevance * 1000) / 1000,
    });
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * 置信度标注：综合「最佳检索相关度」与「真实行情可得性」推导 0-100 置信度。
 * - 无命中 → 0（诚实：知识库未提供支撑）；
 * - 有命中但无真实行情 → 上限 70（仅知识支撑，缺乏行情交叉验证）；
 * - 有命中且有真实行情 → 上限 90。
 * 绝不返回 100（避免伪确定性），契合诚实红线。
 */
export function deriveKnowledgeConfidence(
  results: RetrievedChunk[],
  hasRealMarketData: boolean,
): number {
  if (results.length === 0) return 0;
  const bestRelevance = results[0].relevance; // 0-1
  const base = bestRelevance * (hasRealMarketData ? 90 : 70);
  return Math.max(0, Math.min(90, Math.round(base)));
}

// ==================== 知识库加载（磁盘 → 语料） ====================

/**
 * 从目录递归读取所有 .md 文件，构造成原始文档。
 * 目录缺失或不可读 → 返回 []（不抛异常，交由调用方诚实降级）。
 */
export function readMarkdownDocs(baseDir: string): RawKnowledgeDoc[] {
  const docs: RawKnowledgeDoc[] = [];
  if (!baseDir || !fs.existsSync(baseDir)) return docs;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const rel = path.relative(baseDir, full).split(path.sep).join('/');
          const firstLine = content.split(/\r?\n/)[0] || '';
          const titleMatch = firstLine.match(/^#\s+(.*)$/);
          docs.push({
            source: rel,
            title: titleMatch ? titleMatch[1].trim() : rel,
            content,
          });
        } catch {
          // 单文件读取失败跳过，不阻断整体
        }
      }
    }
  };

  walk(baseDir);
  return docs;
}

/**
 * 候选知识库根目录（按运行环境向上搜索名为 knowledge-base 的子目录）。
 * 优先使用环境变量 KNOWLEDGE_BASE_DIR；否则从 cwd 与模块位置向上至多 6 层探测，
 * 兼容「仓库根运行」「backend/ 运行」「backend/src 运行」「打包 dist 运行」等多种部署形态。
 */
export function resolveKnowledgeBaseDir(): string {
  const fromEnv = process.env.KNOWLEDGE_BASE_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const roots = [process.cwd(), __dirname];
  for (const root of roots) {
    let dir = path.resolve(root);
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'knowledge-base');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // 全部不存在时返回 cwd 下的默认路径（readMarkdownDocs 会安全返回 []）
  return path.resolve(process.cwd(), 'knowledge-base');
}

/** 一次性加载并构建语料（供 API 层缓存调用） */
export function loadKnowledgeBase(baseDir?: string): KnowledgeCorpus {
  const dir = baseDir ?? resolveKnowledgeBaseDir();
  const docs = readMarkdownDocs(dir);
  return buildCorpus(docs);
}

// ==================== 对外响应构造（纯函数，便于单测） ====================

export interface KnowledgeSearchPayload {
  query: string;
  results: RetrievedChunk[];
  confidence: number;
  /** 知识库是否可用 */
  knowledgeBaseAvailable: boolean;
  /** 真实行情可得性：'real' | 'unavailable' | 'not_requested' */
  marketData: 'real' | 'unavailable' | 'not_requested';
}

export interface BuildSearchOptions {
  corpus: KnowledgeCorpus;
  limit?: number;
  /** 可选的真实行情上下文（来自实时源）；undefined 表示未请求行情 */
  marketContext?: { available: boolean };
}

/**
 * 构造知识检索响应负载（纯函数）。
 * 诚实降级：语料不可用 → knowledgeBaseAvailable:false、results:[]、confidence:0。
 */
export function buildKnowledgeSearchPayload(
  query: string,
  opts: BuildSearchOptions,
): KnowledgeSearchPayload {
  if (!opts.corpus.available) {
    return {
      query,
      results: [],
      confidence: 0,
      knowledgeBaseAvailable: false,
      marketData: opts.marketContext ? (opts.marketContext.available ? 'real' : 'unavailable') : 'not_requested',
    };
  }

  const results = retrieveKnowledge(query, opts.corpus, { limit: opts.limit ?? 5 });
  const hasMarket = opts.marketContext ? opts.marketContext.available : false;
  const confidence = deriveKnowledgeConfidence(results, hasMarket);

  return {
    query,
    results,
    confidence,
    knowledgeBaseAvailable: true,
    marketData: opts.marketContext ? (opts.marketContext.available ? 'real' : 'unavailable') : 'not_requested',
  };
}
