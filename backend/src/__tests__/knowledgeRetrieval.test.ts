import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  tokenize,
  buildCorpus,
  chunkDoc,
  retrieveKnowledge,
  deriveKnowledgeConfidence,
  buildKnowledgeSearchPayload,
  readMarkdownDocs,
  KnowledgeCorpus,
  RawKnowledgeDoc,
} from '../utils/knowledgeRetrieval';

const sampleDocs: RawKnowledgeDoc[] = [
  {
    source: 'design/AI-ANALYSIS.md',
    title: 'AI 分析设计',
    content:
      '# AI 分析设计\n\n## 实时行情\n结合东方财富实时行情进行技术分析，计算 MA 与 RSI。\n\n## 估值\nPE 与 ROE 用于基本面评估，ROE 越高越好。',
  },
  {
    source: 'patterns/CACHING.md',
    title: '缓存策略',
    content: '# 缓存策略\n\n使用 LRU 缓存降低接口耗时，避免重复请求实时行情。',
  },
];

const sampleCorpus: KnowledgeCorpus = buildCorpus(sampleDocs);
const emptyCorpus: KnowledgeCorpus = buildCorpus([]);

describe('tokenize', () => {
  it('extracts English words, CJK unigrams and bigrams', () => {
    const toks = tokenize('Hello World 行情分析');
    expect(toks).toContain('hello');
    expect(toks).toContain('world');
    expect(toks).toContain('行');
    expect(toks).toContain('情');
    expect(toks).toContain('行情'); // bigram
    expect(toks).toContain('分析');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('chunkDoc (答案溯源元数据)', () => {
  it('splits by headings and records source/section/line', () => {
    const chunks = chunkDoc(sampleDocs[0]);
    expect(chunks.length).toBeGreaterThan(0);
    // 章节正文位于同 section 的块中（标题行本身可能单独成块）
    const body = chunks.find((c) => c.section.includes('实时行情') && c.text.includes('东方财富'));
    expect(body).toBeDefined();
    expect(body!.source).toBe('design/AI-ANALYSIS.md');
    expect(body!.line).toBeGreaterThan(0);
  });
});

describe('retrieveKnowledge (答案溯源 + 相关度)', () => {
  it('returns ranked results with full provenance and relevance in (0,1]', () => {
    const results = retrieveKnowledge('实时行情 东方财富', sampleCorpus, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    // 溯源字段齐全
    expect(top).toHaveProperty('source');
    expect(top).toHaveProperty('title');
    expect(top).toHaveProperty('section');
    expect(top).toHaveProperty('line');
    expect(top).toHaveProperty('snippet');
    expect(top).toHaveProperty('score');
    expect(top).toHaveProperty('relevance');
    expect(top.source).toBe('design/AI-ANALYSIS.md');
    expect(top.score).toBeGreaterThan(0);
    expect(top.relevance).toBeGreaterThan(0);
    expect(top.relevance).toBeLessThanOrEqual(1);
    // 命中摘要在语义上确实包含查询词，证明溯源有效
    expect(top.snippet).toContain('东方财富');
  });

  it('ranks the most relevant chunk first', () => {
    const results = retrieveKnowledge('实时行情 东方财富', sampleCorpus, { limit: 5 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance);
    }
  });

  it('returns [] for empty query (no fabrication)', () => {
    expect(retrieveKnowledge('', sampleCorpus)).toEqual([]);
    expect(retrieveKnowledge('   ', sampleCorpus)).toEqual([]);
  });

  it('returns [] when corpus unavailable (honest empty)', () => {
    expect(retrieveKnowledge('任意查询', emptyCorpus)).toEqual([]);
  });

  it('respects limit and minRelevance truncation', () => {
    const results = retrieveKnowledge('实时行情 东方财富 缓存 策略', sampleCorpus, { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe('deriveKnowledgeConfidence (置信度标注)', () => {
  it('is 0 when no retrieved results', () => {
    expect(deriveKnowledgeConfidence([], true)).toBe(0);
    expect(deriveKnowledgeConfidence([], false)).toBe(0);
  });

  it('caps at 90 with real market data, never 100', () => {
    const results = retrieveKnowledge('实时行情 东方财富', sampleCorpus, { limit: 5 });
    const c = deriveKnowledgeConfidence(results, true);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(90);
    expect(c).toBeLessThan(100);
  });

  it('caps at 70 without real market data', () => {
    const results = retrieveKnowledge('实时行情 东方财富', sampleCorpus, { limit: 5 });
    const c = deriveKnowledgeConfidence(results, false);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(70);
  });
});

describe('buildKnowledgeSearchPayload (响应构造 + 诚实降级)', () => {
  it('honest-empty when corpus unavailable', () => {
    const payload = buildKnowledgeSearchPayload('x', { corpus: emptyCorpus });
    expect(payload.knowledgeBaseAvailable).toBe(false);
    expect(payload.results).toEqual([]);
    expect(payload.confidence).toBe(0);
    expect(payload.marketData).toBe('not_requested');
  });

  it('returns provenance + confidence when corpus available', () => {
    const payload = buildKnowledgeSearchPayload('实时行情 东方财富', {
      corpus: sampleCorpus,
      limit: 5,
      marketContext: { available: true },
    });
    expect(payload.knowledgeBaseAvailable).toBe(true);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.confidence).toBeGreaterThan(0);
    expect(payload.marketData).toBe('real');
    // 溯源字段存在于每条结果
    for (const r of payload.results) {
      expect(r.source).toBeTruthy();
      expect(r.line).toBeGreaterThan(0);
      expect(r.relevance).toBeGreaterThan(0);
    }
  });

  it('marks marketData unavailable when market context missing', () => {
    const payload = buildKnowledgeSearchPayload('实时行情 东方财富', {
      corpus: sampleCorpus,
      marketContext: { available: false },
    });
    expect(payload.marketData).toBe('unavailable');
    expect(payload.confidence).toBeLessThanOrEqual(70);
  });
});

describe('readMarkdownDocs (磁盘加载，诚实容错)', () => {
  it('reads .md files recursively with relative source + title', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'a.md'),
        '# 主题A\n\n内容关于基本面估值。',
        'utf-8',
      );
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(
        path.join(dir, 'sub', 'b.md'),
        '# 主题B\n\n内容关于技术面指标。',
        'utf-8',
      );
      const docs = readMarkdownDocs(dir);
      expect(docs.length).toBe(2);
      const sources = docs.map((d) => d.source).sort();
      expect(sources).toEqual(['a.md', 'sub/b.md']);
      expect(docs[0].title).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns [] (no throw) for missing directory', () => {
    const docs = readMarkdownDocs('/nonexistent/knowledge/base/path/xyz');
    expect(docs).toEqual([]);
  });
});
