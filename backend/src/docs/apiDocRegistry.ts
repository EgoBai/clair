/**
 * API路由文档元数据注册中心
 * 路由文件通过调用 registerRoute() 声明接口文档
 */

export interface ParamDoc {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  required?: boolean;
  type?: string;
  description?: string;
  enum?: string[];
  default?: any;
  example?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ResponseDoc {
  status: number;
  description: string;
  schema?: any;
  example?: any;
}

export interface RouteDoc {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  params?: ParamDoc[];
  requestBody?: {
    required?: boolean;
    contentType?: string;
    schema?: any;
    example?: any;
    description?: string;
  };
  responses?: ResponseDoc[];
  deprecated?: boolean;
  auth?: boolean;
  rateLimit?: string;
}

class ApiDocRegistry {
  private routes: RouteDoc[] = [];
  private tagDescriptions: Map<string, string> = new Map();

  register(route: RouteDoc): void {
    // 避免重复注册
    const exists = this.routes.find(
      r => r.method === route.method && r.path === route.path
    );
    if (!exists) {
      this.routes.push(route);
    }
  }

  registerTag(tag: string, description: string): void {
    this.tagDescriptions.set(tag, description);
  }

  getRoutes(): RouteDoc[] {
    return [...this.routes];
  }

  getTags(): { name: string; description: string }[] {
    return Array.from(this.tagDescriptions.entries()).map(([name, description]) => ({
      name,
      description,
    }));
  }

  getRoutesByTag(tag: string): RouteDoc[] {
    return this.routes.filter(r => r.tag === tag);
  }

  clear(): void {
    this.routes = [];
    this.tagDescriptions.clear();
  }

  toJSON(): { routes: RouteDoc[]; tags: { name: string; description: string }[] } {
    return {
      routes: this.routes,
      tags: this.getTags(),
    };
  }
}

export const apiDocRegistry = new ApiDocRegistry();

/** 便捷注册函数 */
export function registerRoute(route: RouteDoc): void {
  apiDocRegistry.register(route);
}

export function registerTag(tag: string, description: string): void {
  apiDocRegistry.registerTag(tag, description);
}
