/**
 * API文档生成器
 * API Documentation Generator
 *
 * 从路由定义自动生成OpenAPI规范文档
 */

export interface APIEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: APIParameter[];
  requestBody?: APISchema;
  responses: Record<string, APIResponse>;
  deprecated?: boolean;
}

export interface APIParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  type: 'string' | 'number' | 'boolean';
  description?: string;
  example?: any;
}

export interface APISchema {
  type: 'object' | 'array' | 'string' | 'number';
  properties?: Record<string, { type: string; description?: string; example?: any }>;
  items?: APISchema;
  required?: string[];
}

export interface APIResponse {
  description: string;
  schema?: APISchema;
}

export interface APIDocConfig {
  title: string;
  version: string;
  description?: string;
  baseUrl?: string;
  endpoints: APIEndpoint[];
}

/**
 * 生成OpenAPI 3.0规范
 */
export function generateOpenAPI(config: APIDocConfig): Record<string, any> {
  const paths: Record<string, any> = {};

  for (const ep of config.endpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};

    const operation: Record<string, any> = {
      summary: ep.summary,
      tags: ep.tags || [],
      responses: {},
    };

    if (ep.description) operation.description = ep.description;
    if (ep.deprecated) operation.deprecated = true;

    if (ep.parameters?.length) {
      operation.parameters = ep.parameters.map(p => ({
        name: p.name,
        in: p.in,
        required: p.required,
        schema: { type: p.type },
        description: p.description,
        example: p.example,
      }));
    }

    if (ep.requestBody) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: ep.requestBody },
        },
      };
    }

    for (const [code, resp] of Object.entries(ep.responses)) {
      operation.responses[code] = {
        description: resp.description,
        content: resp.schema ? {
          'application/json': { schema: resp.schema },
        } : undefined,
      };
    }

    paths[ep.path][ep.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: config.title,
      version: config.version,
      description: config.description,
    },
    servers: config.baseUrl ? [{ url: config.baseUrl }] : [],
    paths,
  };
}

/**
 * API端点注册器
 */
export class APIRegistry {
  private endpoints: APIEndpoint[] = [];

  register(endpoint: APIEndpoint): this {
    this.endpoints.push(endpoint);
    return this;
  }

  getByTag(tag: string): APIEndpoint[] {
    return this.endpoints.filter(ep => ep.tags?.includes(tag));
  }

  getByPath(path: string): APIEndpoint[] {
    return this.endpoints.filter(ep => ep.path === path);
  }

  getAll(): APIEndpoint[] {
    return [...this.endpoints];
  }

  generateDoc(config: Omit<APIDocConfig, 'endpoints'>): Record<string, any> {
    return generateOpenAPI({ ...config, endpoints: this.endpoints });
  }

  getStats(): { total: number; byMethod: Record<string, number>; deprecated: number } {
    const byMethod: Record<string, number> = {};
    let deprecated = 0;
    for (const ep of this.endpoints) {
      byMethod[ep.method] = (byMethod[ep.method] || 0) + 1;
      if (ep.deprecated) deprecated++;
    }
    return { total: this.endpoints.length, byMethod, deprecated };
  }
}
