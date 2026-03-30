/**
 * OpenAPI 3.0 规范自动生成器
 * 从 apiDocRegistry 中的元数据生成完整 OpenAPI 规范
 */

import { RouteDoc, apiDocRegistry } from './apiDocRegistry';

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; description: string; version: string; contact?: any };
  servers: { url: string; description: string }[];
  paths: Record<string, any>;
  components: { schemas: Record<string, any>; securitySchemes?: Record<string, any> };
  tags: { name: string; description: string }[];
}

function paramTypeToSchema(type?: string): any {
  switch (type) {
    case 'integer': return { type: 'integer' };
    case 'number': return { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'array': return { type: 'array', items: { type: 'string' } };
    default: return { type: 'string' };
  }
}

function buildParameterDoc(param: any): any {
  const schema = paramTypeToSchema(param.type);
  if (param.enum) schema.enum = param.enum;
  if (param.default !== undefined) schema.default = param.default;
  if (param.minimum !== undefined) schema.minimum = param.minimum;
  if (param.maximum !== undefined) schema.maximum = param.maximum;
  if (param.minLength !== undefined) schema.minLength = param.minLength;
  if (param.maxLength !== undefined) schema.maxLength = param.maxLength;

  const doc: any = {
    name: param.name,
    in: param.in,
    required: param.required || param.in === 'path',
    schema,
  };
  if (param.description) doc.description = param.description;
  if (param.example !== undefined) doc.example = param.example;
  return doc;
}

function buildOperationDoc(route: RouteDoc): any {
  const operation: any = {
    tags: [route.tag],
    summary: route.summary,
    operationId: `${route.method}_${route.path.replace(/[/:]/g, '_').replace(/_+/g, '_')}`,
    responses: {},
  };

  if (route.description) operation.description = route.description;
  if (route.deprecated) operation.deprecated = true;

  // Parameters
  if (route.params && route.params.length > 0) {
    operation.parameters = route.params.map(buildParameterDoc);
  }

  // Request body
  if (route.requestBody) {
    operation.requestBody = {
      required: route.requestBody.required !== false,
      content: {
        [route.requestBody.contentType || 'application/json']: {
          schema: route.requestBody.schema || { type: 'object' },
        },
      },
    };
    if (route.requestBody.description) {
      operation.requestBody.description = route.requestBody.description;
    }
    if (route.requestBody.example) {
      operation.requestBody.content[route.requestBody.contentType || 'application/json'].example = route.requestBody.example;
    }
  }

  // Responses
  const responses = route.responses || [{ status: 200, description: '成功' }];
  for (const resp of responses) {
    const respDoc: any = { description: resp.description };
    if (resp.schema) {
      respDoc.content = {
        'application/json': { schema: resp.schema },
      };
      if (resp.example) {
        respDoc.content['application/json'].example = resp.example;
      }
    }
    operation.responses[resp.status.toString()] = respDoc;
  }

  // Auth
  if (route.auth) {
    operation.security = [{ BearerAuth: [] }];
  }

  // Rate limit info in description
  if (route.rateLimit) {
    operation.description = (operation.description || '') + `\n\n限流: ${route.rateLimit}`;
  }

  return operation;
}

export function generateOpenAPISpec(options?: {
  title?: string;
  description?: string;
  version?: string;
  servers?: { url: string; description: string }[];
}): OpenAPISpec {
  const routes = apiDocRegistry.getRoutes();
  const tags = apiDocRegistry.getTags();

  const paths: Record<string, any> = {};

  for (const route of routes) {
    // Express路径转OpenAPI路径 (:param -> {param})
    const openApiPath = route.path.replace(/:(\w+)/g, '{$1}');
    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }
    paths[openApiPath][route.method] = buildOperationDoc(route);
  }

  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: options?.title || 'A股行情分析网站 API',
      description: options?.description || '提供A股实时行情、K线数据、技术分析、选股器、回测等服务',
      version: options?.version || '2.1.0',
      contact: { name: 'ego_bai' },
    },
    servers: options?.servers || [
      { url: 'http://localhost:3001', description: '开发环境' },
      { url: 'https://api.a-stock.example.com', description: '生产环境' },
    ],
    paths,
    components: {
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'string' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: {} },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                totalCount: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        Stock: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            symbol: { type: 'string', example: '600519.SH' },
            name: { type: 'string', example: '贵州茅台' },
            market: { type: 'string', enum: ['SH', 'SZ', 'BJ'] },
            industry: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
        DailyQuote: {
          type: 'object',
          properties: {
            tradeDate: { type: 'string', format: 'date' },
            openPrice: { type: 'number' },
            closePrice: { type: 'number' },
            highPrice: { type: 'number' },
            lowPrice: { type: 'number' },
            volume: { type: 'number' },
            turnover: { type: 'number' },
            change: { type: 'number' },
            changePercent: { type: 'number' },
            turnoverRate: { type: 'number' },
            peRatio: { type: 'number' },
            pbRatio: { type: 'number' },
          },
        },
        KLineData: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            open: { type: 'number' },
            close: { type: 'number' },
            high: { type: 'number' },
            low: { type: 'number' },
            volume: { type: 'number' },
            amount: { type: 'number' },
          },
        },
        TechnicalIndicator: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            ma5: { type: 'number' },
            ma10: { type: 'number' },
            ma20: { type: 'number' },
            ma60: { type: 'number' },
            macd: { type: 'object' },
            kdj: { type: 'object' },
            rsi: { type: 'object' },
            bollinger: { type: 'object' },
          },
        },
        Sector: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            changePercent: { type: 'number' },
            stockCount: { type: 'integer' },
            leadingStock: { type: 'string' },
          },
        },
        FundFlow: {
          type: 'object',
          properties: {
            mainInflow: { type: 'number' },
            retailInflow: { type: 'number' },
            superLargeInflow: { type: 'number' },
            largeInflow: { type: 'number' },
            mediumInflow: { type: 'number' },
            smallInflow: { type: 'number' },
          },
        },
        NewsItem: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            summary: { type: 'string' },
            source: { type: 'string' },
            category: { type: 'string' },
            sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
            publishedAt: { type: 'string', format: 'date-time' },
            url: { type: 'string' },
          },
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            symbol: { type: 'string' },
            type: { type: 'string' },
            condition: { type: 'object' },
            isActive: { type: 'boolean' },
            triggeredAt: { type: 'string', format: 'date-time' },
          },
        },
        BacktestResult: {
          type: 'object',
          properties: {
            totalReturn: { type: 'number' },
            annualizedReturn: { type: 'number' },
            maxDrawdown: { type: 'number' },
            sharpeRatio: { type: 'number' },
            winRate: { type: 'number' },
            trades: { type: 'array', items: {} },
            equityCurve: { type: 'array', items: { type: 'object' } },
          },
        },
        WatchlistItem: {
          type: 'object',
          required: ['symbol'],
          properties: {
            symbol: { type: 'string', example: '600519.SH' },
            groupId: { type: 'string' },
            notes: { type: 'string' },
            addedAt: { type: 'string', format: 'date-time' },
          },
        },
        Portfolio: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            totalValue: { type: 'number' },
            totalCost: { type: 'number' },
            totalPnl: { type: 'number' },
            totalPnlPercent: { type: 'number' },
            holdings: { type: 'array', items: {} },
          },
        },
        ScreenerRequest: {
          type: 'object',
          properties: {
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  logic: { type: 'string', enum: ['AND', 'OR'] },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        operator: { type: 'string', enum: ['>', '<', '>=', '<=', '==', 'between', 'in'] },
                        value: {},
                      },
                    },
                  },
                },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
      },
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags,
  };

  return spec;
}

/** 导出 JSON 格式的 OpenAPI 文档 */
export function generateOpenAPIJson(options?: any): string {
  return JSON.stringify(generateOpenAPISpec(options), null, 2);
}

/** 导出 YAML 格式 (简单实现) */
export function generateOpenAPIYaml(options?: any): string {
  const spec = generateOpenAPISpec(options);
  return jsonToSimpleYaml(spec);
}

function jsonToSimpleYaml(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  let result = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `${pad}-\n${jsonToSimpleYaml(item, indent + 1)}`;
      } else {
        result += `${pad}- ${formatYamlValue(item)}\n`;
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        result += `${pad}${key}:\n${jsonToSimpleYaml(value, indent + 1)}`;
      } else {
        result += `${pad}${key}: ${formatYamlValue(value)}\n`;
      }
    }
  }

  return result;
}

function formatYamlValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    if (val.includes('\n') || val.includes(':') || val.includes('#')) {
      return `"${val.replace(/"/g, '\\"')}"`;
    }
    return val;
  }
  return String(val);
}
