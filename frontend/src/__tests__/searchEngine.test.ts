import { describe, it, expect, beforeEach } from 'vitest';

// Advanced Search Engine
interface SearchDocument {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  text: string;
  tags: string[];
  score?: number;
  timestamp: Date;
}

interface SearchQuery {
  text?: string;
  filters?: { field: string; operator: string; value: unknown }[];
  sort?: { field: string; order: 'asc' | 'desc' };
  page: number;
  pageSize: number;
  facets?: string[];
  highlight?: boolean;
}

interface SearchResult {
  documents: SearchDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: Record<string, { value: string; count: number }[]>;
  suggestions: string[];
  queryTime: number;
}

interface IndexStats {
  totalDocuments: number;
  totalTerms: number;
  avgFieldLength: number;
  documentTypes: Record<string, number>;
}

class SearchEngine {
  private documents: Map<string, SearchDocument> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private fieldIndex: Map<string, Map<string, Set<string>>> = new Map();

  index(doc: Omit<SearchDocument, 'timestamp'>): void {
    const full: SearchDocument = { ...doc, timestamp: new Date() };
    this.documents.set(doc.id, full);

    // Build inverted index from text
    const terms = this.tokenize(full.text);
    for (const term of terms) {
      if (!this.invertedIndex.has(term)) this.invertedIndex.set(term, new Set());
      this.invertedIndex.get(term)!.add(doc.id);
    }

    // Build field index
    for (const [field, value] of Object.entries(full.fields)) {
      const key = `${field}:${String(value)}`;
      if (!this.fieldIndex.has(key)) this.fieldIndex.set(key, new Set());
      this.fieldIndex.get(key)!.add(doc.id);
    }
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  }

  search(query: SearchQuery): SearchResult {
    const start = Date.now();
    let results: SearchDocument[] = [];

    if (query.text) {
      const terms = this.tokenize(query.text);
      const scores = new Map<string, number>();

      for (const term of terms) {
        // Prefix matching
        for (const [indexTerm, docIds] of this.invertedIndex) {
          if (indexTerm.startsWith(term)) {
            for (const id of docIds) {
              scores.set(id, (scores.get(id) ?? 0) + 1);
            }
          }
        }
      }

      results = Array.from(scores.entries())
        .map(([id, score]) => {
          const doc = this.documents.get(id)!;
          return { ...doc, score };
        })
        .filter(d => d.score! > 0);
    } else {
      results = Array.from(this.documents.values()).map(d => ({ ...d, score: 1 }));
    }

    // Apply filters
    if (query.filters) {
      for (const filter of query.filters) {
        results = results.filter(doc => {
          const value = doc.fields[filter.field];
          switch (filter.operator) {
            case 'eq': return value === filter.value;
            case 'neq': return value !== filter.value;
            case 'gt': return (value as number) > (filter.value as number);
            case 'lt': return (value as number) < (filter.value as number);
            case 'in': return (filter.value as unknown[]).includes(value);
            case 'contains': return String(value).includes(String(filter.value));
            default: return true;
          }
        });
      }
    }

    // Sort
    if (query.sort) {
      results.sort((a, b) => {
        const va = a.fields[query.sort!.field] as number;
        const vb = b.fields[query.sort!.field] as number;
        return query.sort!.order === 'asc' ? va - vb : vb - va;
      });
    } else {
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    const total = results.length;
    const totalPages = Math.ceil(total / query.pageSize);
    const paged = results.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    // Calculate facets
    const facets: Record<string, { value: string; count: number }[]> = {};
    if (query.facets) {
      for (const facet of query.facets) {
        const counts: Record<string, number> = {};
        for (const doc of results) {
          const val = String(doc.fields[facet] ?? 'unknown');
          counts[val] = (counts[val] ?? 0) + 1;
        }
        facets[facet] = Object.entries(counts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    // Suggestions
    const suggestions = this.getSuggestions(query.text ?? '');

    return {
      documents: paged,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
      facets,
      suggestions,
      queryTime: Date.now() - start,
    };
  }

  private getSuggestions(text: string): string[] {
    if (!text) return [];
    const terms = Array.from(this.invertedIndex.keys());
    return terms.filter(t => t.startsWith(text.toLowerCase()) && t !== text.toLowerCase()).slice(0, 5);
  }

  suggest(prefix: string, limit = 5): string[] {
    const allTerms = Array.from(this.invertedIndex.keys());
    return allTerms
      .filter(t => t.startsWith(prefix.toLowerCase()))
      .slice(0, limit);
  }

  deleteDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Remove from inverted index
    const terms = this.tokenize(doc.text);
    for (const term of terms) {
      this.invertedIndex.get(term)?.delete(id);
    }

    // Remove from field index
    for (const [field, value] of Object.entries(doc.fields)) {
      const key = `${field}:${String(value)}`;
      this.fieldIndex.get(key)?.delete(id);
    }

    this.documents.delete(id);
    return true;
  }

  reindex(): void {
    this.invertedIndex.clear();
    this.fieldIndex.clear();
    for (const doc of this.documents.values()) {
      this.index(doc);
    }
  }

  getStats(): IndexStats {
    const types: Record<string, number> = {};
    let totalTerms = 0;
    let totalFieldLength = 0;

    for (const doc of this.documents.values()) {
      types[doc.type] = (types[doc.type] ?? 0) + 1;
      totalTerms += this.tokenize(doc.text).length;
      totalFieldLength += Object.keys(doc.fields).length;
    }

    return {
      totalDocuments: this.documents.size,
      totalTerms,
      avgFieldLength: this.documents.size > 0 ? totalFieldLength / this.documents.size : 0,
      documentTypes: types,
    };
  }

  getDocument(id: string): SearchDocument | undefined {
    return this.documents.get(id);
  }
}

describe('Search Engine', () => {
  let engine: SearchEngine;

  beforeEach(() => {
    engine = new SearchEngine();
  });

  it('should index document', () => {
    engine.index({
      id: 'd1', type: 'stock',
      fields: { symbol: 'AAPL', sector: 'Tech' },
      text: 'Apple Inc technology company',
      tags: ['tech', 'large-cap'],
    });
    expect(engine.getDocument('d1')).toBeTruthy();
  });

  it('should search by text', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { symbol: 'AAPL' }, text: 'Apple technology company', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: { symbol: 'JPM' }, text: 'JP Morgan bank finance', tags: [] });
    const result = engine.search({ text: 'Apple', page: 1, pageSize: 10 });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('d1');
  });

  it('should search with filters', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { sector: 'Tech' }, text: 'a', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: { sector: 'Finance' }, text: 'b', tags: [] });
    const result = engine.search({
      filters: [{ field: 'sector', operator: 'eq', value: 'Tech' }],
      page: 1, pageSize: 10,
    });
    expect(result.documents).toHaveLength(1);
  });

  it('should paginate results', () => {
    for (let i = 0; i < 10; i++) {
      engine.index({ id: `d${i}`, type: 'stock', fields: {}, text: 'stock market', tags: [] });
    }
    const result = engine.search({ text: 'stock', page: 2, pageSize: 3 });
    expect(result.documents).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.totalPages).toBe(4);
  });

  it('should sort results', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { price: 100 }, text: 'stock', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: { price: 200 }, text: 'stock', tags: [] });
    const result = engine.search({
      text: 'stock',
      sort: { field: 'price', order: 'desc' },
      page: 1, pageSize: 10,
    });
    expect(result.documents[0].fields.price).toBe(200);
  });

  it('should calculate facets', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { sector: 'Tech' }, text: 'a', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: { sector: 'Tech' }, text: 'b', tags: [] });
    engine.index({ id: 'd3', type: 'stock', fields: { sector: 'Finance' }, text: 'c', tags: [] });
    const result = engine.search({ facets: ['sector'], page: 1, pageSize: 10 });
    expect(result.facets['sector']).toHaveLength(2);
    expect(result.facets['sector'][0].value).toBe('Tech');
    expect(result.facets['sector'][0].count).toBe(2);
  });

  it('should provide suggestions', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'apple technology', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: {}, text: 'amazon commerce', tags: [] });
    const suggestions = engine.suggest('app');
    expect(suggestions).toContain('apple');
  });

  it('should delete document', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'test', tags: [] });
    expect(engine.deleteDocument('d1')).toBe(true);
    expect(engine.getDocument('d1')).toBeUndefined();
  });

  it('should get index stats', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { a: 1 }, text: 'hello world', tags: [] });
    engine.index({ id: 'd2', type: 'etf', fields: { b: 2 }, text: 'market fund', tags: [] });
    const stats = engine.getStats();
    expect(stats.totalDocuments).toBe(2);
    expect(stats.documentTypes['stock']).toBe(1);
    expect(stats.documentTypes['etf']).toBe(1);
  });

  it('should prefix match search', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'bitcoin cryptocurrency', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: {}, text: 'ethereum blockchain', tags: [] });
    const result = engine.search({ text: 'bit', page: 1, pageSize: 10 });
    expect(result.documents).toHaveLength(1);
  });

  it('should handle multiple search terms', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'apple technology innovation', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: {}, text: 'apple fruit food', tags: [] });
    const result = engine.search({ text: 'apple technology', page: 1, pageSize: 10 });
    expect(result.documents.length).toBeGreaterThan(0);
  });

  it('should return empty results for no match', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'hello world', tags: [] });
    const result = engine.search({ text: 'xyznonexistent', page: 1, pageSize: 10 });
    expect(result.documents).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should handle all fields filter', () => {
    engine.index({ id: 'd1', type: 'stock', fields: { price: 100 }, text: 'a', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: { price: 200 }, text: 'b', tags: [] });
    const result = engine.search({
      filters: [{ field: 'price', operator: 'gt', value: 150 }],
      page: 1, pageSize: 10,
    });
    expect(result.documents).toHaveLength(1);
  });

  it('should search without text returns all', () => {
    engine.index({ id: 'd1', type: 'stock', fields: {}, text: 'a', tags: [] });
    engine.index({ id: 'd2', type: 'stock', fields: {}, text: 'b', tags: [] });
    const result = engine.search({ page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
  });
});
