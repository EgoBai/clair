/**
 * API文档系统深度测试
 * 覆盖文档生成、接口分类、参数描述、响应示例、版本管理
 */

import { describe, it, expect } from 'vitest';

// API文档类型
interface APIDoc {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  summary: string;
  description: string;
  tags: string[];
  parameters: ParameterDoc[];
  requestBody?: RequestBodyDoc;
  responses: ResponseDoc[];
  deprecated: boolean;
  version: string;
}

interface ParameterDoc {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  example?: any;
  enum?: string[];
  min?: number;
  max?: number;
}

interface RequestBodyDoc {
  contentType: string;
  schema: Record<string, any>;
  example?: any;
}

interface ResponseDoc {
  statusCode: number;
  description: string;
  schema?: Record<string, any>;
  example?: any;
}

// 生成OpenAPI文档
function generateOpenAPISpec(docs: APIDoc[], info: { title: string; version: string; description: string }): Record<string, any> {
  const paths: Record<string, any> = {};

  for (const doc of docs) {
    if (!paths[doc.path]) paths[doc.path] = {};
    const operation: Record<string, any> = {
      summary: doc.summary,
      description: doc.description,
      tags: doc.tags,
      deprecated: doc.deprecated || undefined,
      parameters: doc.parameters.map(p => ({
        name: p.name,
        in: p.in,
        required: p.required,
        schema: { type: p.type, ...(p.enum && { enum: p.enum }), ...(p.min !== undefined && { minimum: p.min }), ...(p.max !== undefined && { maximum: p.max }) },
        description: p.description,
        ...(p.example !== undefined && { example: p.example }),
      })),
      responses: {},
    };

    if (doc.requestBody) {
      operation.requestBody = {
        required: true,
        content: { [doc.requestBody.contentType]: { schema: doc.requestBody.schema, ...(doc.requestBody.example && { example: doc.requestBody.example }) } },
      };
    }

    for (const resp of doc.responses) {
      operation.responses[resp.statusCode] = {
        description: resp.description,
        ...(resp.schema && { content: { 'application/json': { schema: resp.schema } } }),
      };
    }

    paths[doc.path][doc.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.0.3',
    info,
    paths,
  };
}

// 按标签分类
function groupByTag(docs: APIDoc[]): Map<string, APIDoc[]> {
  const groups = new Map<string, APIDoc[]>();
  for (const doc of docs) {
    for (const tag of doc.tags) {
      const existing = groups.get(tag) || [];
      existing.push(doc);
      groups.set(tag, existing);
    }
  }
  return groups;
}

// 统计信息
function calculateDocStats(docs: APIDoc[]): {
  total: number;
  byMethod: Map<string, number>;
  byTag: Map<string, number>;
  deprecatedCount: number;
  withParameters: number;
  withRequestBody: number;
  avgParametersPerEndpoint: number;
} {
  const byMethod = new Map<string, number>();
  const byTag = new Map<string, number>();
  let deprecatedCount = 0;
  let withParameters = 0;
  let withRequestBody = 0;
  let totalParams = 0;

  for (const doc of docs) {
    byMethod.set(doc.method, (byMethod.get(doc.method) || 0) + 1);
    for (const tag of doc.tags) {
      byTag.set(tag, (byTag.get(tag) || 0) + 1);
    }
    if (doc.deprecated) deprecatedCount++;
    if (doc.parameters.length > 0) withParameters++;
    if (doc.requestBody) withRequestBody++;
    totalParams += doc.parameters.length;
  }

  return {
    total: docs.length,
    byMethod,
    byTag,
    deprecatedCount,
    withParameters,
    withRequestBody,
    avgParametersPerEndpoint: docs.length > 0 ? totalParams / docs.length : 0,
  };
}

// 验证文档完整性
function validateDoc(doc: APIDoc): string[] {
  const errors: string[] = [];
  if (!doc.path) errors.push('路径不能为空');
  if (!doc.method) errors.push('HTTP方法不能为空');
  if (!doc.summary) errors.push('摘要不能为空');
  if (!doc.tags || doc.tags.length === 0) errors.push('至少需要一个标签');
  if (!doc.responses || doc.responses.length === 0) errors.push('至少需要一个响应定义');
  if (doc.path && !doc.path.startsWith('/')) errors.push('路径应以/开头');

  for (const p of doc.parameters) {
    if (!p.name) errors.push('参数名不能为空');
    if (!p.description) errors.push(`参数 ${p.name} 缺少描述`);
    if (p.required && p.example === undefined) errors.push(`必需参数 ${p.name} 应有示例值`);
  }

  if (doc.responses.length > 0 && !doc.responses.some(r => r.statusCode >= 200 && r.statusCode < 300)) {
    errors.push('应至少有一个成功响应(2xx)');
  }

  return errors;
}

// 查找端点
function findEndpoint(docs: APIDoc[], path: string, method: string): APIDoc | undefined {
  return docs.find(d => d.path === path && d.method === method);
}

// 搜索文档
function searchDocs(docs: APIDoc[], keyword: string): APIDoc[] {
  const kw = keyword.toLowerCase();
  return docs.filter(d =>
    d.path.toLowerCase().includes(kw) ||
    d.summary.toLowerCase().includes(kw) ||
    d.description.toLowerCase().includes(kw) ||
    d.tags.some(t => t.toLowerCase().includes(kw))
  );
}

// 测试数据
const sampleDocs: APIDoc[] = [
  {
    path: '/api/stocks',
    method: 'GET',
    summary: '获取股票列表',
    description: '分页获取所有股票列表，支持筛选和排序',
    tags: ['股票'],
    parameters: [
      { name: 'page', in: 'query', required: false, type: 'number', description: '页码', example: 1, min: 1 },
      { name: 'pageSize', in: 'query', required: false, type: 'number', description: '每页数量', example: 20, min: 1, max: 100 },
      { name: 'keyword', in: 'query', required: false, type: 'string', description: '搜索关键词' },
    ],
    responses: [
      { statusCode: 200, description: '成功', schema: { type: 'array' } },
      { statusCode: 400, description: '参数错误' },
    ],
    deprecated: false,
    version: '1.0',
  },
  {
    path: '/api/stocks/:symbol',
    method: 'GET',
    summary: '获取单只股票详情',
    description: '根据股票代码获取详细信息',
    tags: ['股票'],
    parameters: [
      { name: 'symbol', in: 'path', required: true, type: 'string', description: '股票代码', example: '600519' },
    ],
    responses: [
      { statusCode: 200, description: '成功' },
      { statusCode: 404, description: '股票不存在' },
    ],
    deprecated: false,
    version: '1.0',
  },
  {
    path: '/api/stocks/:symbol/kline',
    method: 'GET',
    summary: '获取K线数据',
    description: '获取股票的历史K线数据',
    tags: ['行情'],
    parameters: [
      { name: 'symbol', in: 'path', required: true, type: 'string', description: '股票代码' },
      { name: 'period', in: 'query', required: true, type: 'string', description: '周期', enum: ['daily', 'weekly', 'monthly'] },
      { name: 'startDate', in: 'query', required: false, type: 'string', description: '开始日期' },
      { name: 'endDate', in: 'query', required: false, type: 'string', description: '结束日期' },
    ],
    responses: [
      { statusCode: 200, description: '成功' },
    ],
    deprecated: false,
    version: '1.0',
  },
  {
    path: '/api/watchlist',
    method: 'POST',
    summary: '添加自选股',
    description: '将股票添加到自选列表',
    tags: ['自选'],
    parameters: [],
    requestBody: {
      contentType: 'application/json',
      schema: { type: 'object', properties: { symbol: { type: 'string' } } },
      example: { symbol: '600519' },
    },
    responses: [
      { statusCode: 201, description: '添加成功' },
      { statusCode: 409, description: '已在自选列表中' },
    ],
    deprecated: false,
    version: '1.0',
  },
  {
    path: '/api/old-endpoint',
    method: 'GET',
    summary: '旧版接口',
    description: '已废弃的接口',
    tags: ['废弃'],
    parameters: [],
    responses: [
      { statusCode: 200, description: '成功' },
    ],
    deprecated: true,
    version: '0.9',
  },
];

// ==================== OpenAPI生成 ====================

describe('generateOpenAPISpec OpenAPI文档生成', () => {
  it('应生成符合OpenAPI 3.0的结构', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: 'A股API', version: '1.0', description: '测试' });
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('A股API');
  });

  it('应包含所有路径', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: '', version: '', description: '' });
    expect(spec.paths).toHaveProperty('/api/stocks');
    expect(spec.paths).toHaveProperty('/api/stocks/:symbol');
  });

  it('每个路径应包含正确的HTTP方法', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: '', version: '', description: '' });
    expect(spec.paths['/api/stocks']).toHaveProperty('get');
    expect(spec.paths['/api/watchlist']).toHaveProperty('post');
  });

  it('参数应正确映射到schema', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: '', version: '', description: '' });
    const params = spec.paths['/api/stocks'].get.parameters;
    expect(params).toHaveLength(3);
    expect(params[0].name).toBe('page');
  });

  it('废弃接口应标记deprecated', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: '', version: '', description: '' });
    expect(spec.paths['/api/old-endpoint'].get.deprecated).toBe(true);
  });

  it('空文档应生成空paths', () => {
    const spec = generateOpenAPISpec([], { title: '', version: '', description: '' });
    expect(Object.keys(spec.paths)).toHaveLength(0);
  });

  it('requestBody应正确映射', () => {
    const spec = generateOpenAPISpec(sampleDocs, { title: '', version: '', description: '' });
    const watchlist = spec.paths['/api/watchlist'].post;
    expect(watchlist.requestBody).toBeDefined();
    expect(watchlist.requestBody.required).toBe(true);
  });
});

// ==================== 标签分类 ====================

describe('groupByTag 标签分类', () => {
  it('应按标签分组', () => {
    const groups = groupByTag(sampleDocs);
    expect(groups.has('股票')).toBe(true);
    expect(groups.get('股票')).toHaveLength(2);
  });

  it('多个标签的文档应出现在多个组', () => {
    const doc: APIDoc = {
      path: '/test', method: 'GET', summary: '', description: '',
      tags: ['A', 'B'], parameters: [], responses: [{ statusCode: 200, description: '' }],
      deprecated: false, version: '1.0',
    };
    const groups = groupByTag([doc]);
    expect(groups.has('A')).toBe(true);
    expect(groups.has('B')).toBe(true);
  });

  it('空文档应返回空map', () => {
    expect(groupByTag([]).size).toBe(0);
  });
});

// ==================== 统计信息 ====================

describe('calculateDocStats 文档统计', () => {
  it('应正确计算总数', () => {
    const stats = calculateDocStats(sampleDocs);
    expect(stats.total).toBe(5);
  });

  it('应按方法统计', () => {
    const stats = calculateDocStats(sampleDocs);
    expect(stats.byMethod.get('GET')).toBe(4);
    expect(stats.byMethod.get('POST')).toBe(1);
  });

  it('应统计废弃接口数量', () => {
    const stats = calculateDocStats(sampleDocs);
    expect(stats.deprecatedCount).toBe(1);
  });

  it('应统计有参数的接口数量', () => {
    const stats = calculateDocStats(sampleDocs);
    expect(stats.withParameters).toBe(3);
  });

  it('应统计有请求体的接口数量', () => {
    const stats = calculateDocStats(sampleDocs);
    expect(stats.withRequestBody).toBe(1);
  });

  it('avgParametersPerEndpoint应正确计算', () => {
    const stats = calculateDocStats(sampleDocs);
    const totalParams = sampleDocs.reduce((s, d) => s + d.parameters.length, 0);
    expect(stats.avgParametersPerEndpoint).toBeCloseTo(totalParams / sampleDocs.length);
  });
});

// ==================== 文档验证 ====================

describe('validateDoc 文档验证', () => {
  it('完整文档应通过验证', () => {
    expect(validateDoc(sampleDocs[0])).toHaveLength(0);
  });

  it('空路径应报错', () => {
    const doc = { ...sampleDocs[0], path: '' };
    expect(validateDoc(doc)).toContain('路径不能为空');
  });

  it('无标签应报错', () => {
    const doc = { ...sampleDocs[0], tags: [] };
    expect(validateDoc(doc)).toContain('至少需要一个标签');
  });

  it('无响应应报错', () => {
    const doc = { ...sampleDocs[0], responses: [] };
    expect(validateDoc(doc)).toContain('至少需要一个响应定义');
  });

  it('路径不以/开头应报错', () => {
    const doc = { ...sampleDocs[0], path: 'api/test' };
    expect(validateDoc(doc)).toContain('路径应以/开头');
  });

  it('无2xx响应应报错', () => {
    const doc = { ...sampleDocs[0], responses: [{ statusCode: 400, description: 'err' }] };
    expect(validateDoc(doc)).toContain('应至少有一个成功响应(2xx)');
  });

  it('必需参数无示例应报错', () => {
    const doc = { ...sampleDocs[1] };
    doc.parameters = [{ name: 'id', in: 'path', required: true, type: 'string', description: 'ID' }];
    expect(validateDoc(doc)).toContain('必需参数 id 应有示例值');
  });
});

// ==================== 端点查找 ====================

describe('findEndpoint 端点查找', () => {
  it('应找到存在的端点', () => {
    const doc = findEndpoint(sampleDocs, '/api/stocks', 'GET');
    expect(doc?.summary).toBe('获取股票列表');
  });

  it('不存在的端点应返回undefined', () => {
    expect(findEndpoint(sampleDocs, '/api/unknown', 'GET')).toBeUndefined();
  });

  it('方法不同应返回undefined', () => {
    expect(findEndpoint(sampleDocs, '/api/stocks', 'POST')).toBeUndefined();
  });
});

// ==================== 文档搜索 ====================

describe('searchDocs 文档搜索', () => {
  it('应匹配路径关键词', () => {
    const result = searchDocs(sampleDocs, 'watchlist');
    expect(result).toHaveLength(1);
  });

  it('应匹配摘要关键词', () => {
    const result = searchDocs(sampleDocs, 'K线');
    expect(result).toHaveLength(1);
  });

  it('应匹配标签', () => {
    const result = searchDocs(sampleDocs, '行情');
    expect(result).toHaveLength(1);
  });

  it('应不区分大小写', () => {
    const result = searchDocs(sampleDocs, 'STOCKS');
    expect(result.length).toBeGreaterThan(0);
  });

  it('无匹配应返回空', () => {
    expect(searchDocs(sampleDocs, 'notfound')).toEqual([]);
  });

  it('空关键词应返回全部', () => {
    expect(searchDocs(sampleDocs, '')).toHaveLength(sampleDocs.length);
  });
});
