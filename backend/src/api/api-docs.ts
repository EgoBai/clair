/**
 * API 文档端点
 * 提供 OpenAPI 3.0 JSON/YAML 规范 + Swagger UI + ReDoc
 * 无需额外依赖，使用 CDN 加载前端 UI
 */

import { Router, Request, Response } from 'express';
import { generateOpenAPISpec, generateOpenAPIJson, generateOpenAPIYaml } from '../docs/openApiGenerator';
import { initApiDocs } from '../docs/routeAutoRegistry';
import { asyncHandler } from '../utils/apiResponse';

// 初始化所有路由文档注册
initApiDocs();

const apiDocsRouter = Router();

/** OpenAPI JSON 规范 */
apiDocsRouter.get('/api-docs/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(generateOpenAPIJson());
});

/** OpenAPI YAML 规范 */
apiDocsRouter.get('/api-docs/openapi.yaml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(generateOpenAPIYaml());
});

/** OpenAPI 规范信息摘要 */
apiDocsRouter.get('/api-docs/info', (_req: Request, res: Response) => {
  const spec = generateOpenAPISpec();
  const pathCount = Object.keys(spec.paths).length;
  const schemaCount = Object.keys(spec.components.schemas).length;
  const methodCounts: Record<string, number> = {};

  for (const path of Object.values(spec.paths)) {
    for (const method of Object.keys(path)) {
      methodCounts[method.toUpperCase()] = (methodCounts[method.toUpperCase()] || 0) + 1;
    }
  }

  res.json({
    title: spec.info.title,
    version: spec.info.version,
    description: spec.info.description,
    openapi: spec.openapi,
    paths: pathCount,
    schemas: schemaCount,
    tags: spec.tags.map(t => t.name),
    methods: methodCounts,
    endpoints: {
      json: '/api-docs/openapi.json',
      yaml: '/api-docs/openapi.yaml',
      swaggerUI: '/api-docs',
      redoc: '/api-docs/redoc',
    },
  });
});

/** Swagger UI 页面 (CDN) */
apiDocsRouter.get('/api-docs', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A股行情分析网站 - API 文档</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .topbar { display: none; }
    .information-container { background: #fafafa; }
    .info .title { font-size: 1.5rem; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api-docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
      docExpansion: 'list',
      filter: true,
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        // 自动添加 CSRF token（如有）
        const token = document.querySelector('meta[name="csrf-token"]');
        if (token) req.headers['X-CSRF-Token'] = token.getAttribute('content');
        return req;
      }
    });
  </script>
</body>
</html>`);
});

/** ReDoc 页面 (CDN) */
apiDocsRouter.get('/api-docs/redoc', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A股行情分析网站 - ReDoc API 文档</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body>
  <redoc spec-url='/api-docs/openapi.json' 
    theme='{
      "colors": { "primary": { "main": "#1a73e8" } },
      "typography": { "fontSize": "15px", "fontFamily": "Inter, sans-serif" },
      "sidebar": { "width": "280px" },
      "rightPanel": { "backgroundColor": "#1a1a2e" }
    }'
    hide-download-button
    native-scrollbars
    expand-responses="200"
  ></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`);
});

/** API 端点清单（JSON 列表，便于程序化消费） */
apiDocsRouter.get('/api-docs/endpoints', (_req: Request, res: Response) => {
  const spec = generateOpenAPISpec();
  const endpoints: Array<{
    method: string;
    path: string;
    tag: string;
    summary: string;
    deprecated: boolean;
  }> = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods as Record<string, any>)) {
      endpoints.push({
        method: method.toUpperCase(),
        path,
        tag: op.tags?.[0] || '未分类',
        summary: op.summary || '',
        deprecated: op.deprecated || false,
      });
    }
  }

  res.json({
    total: endpoints.length,
    endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path)),
  });
});

export default apiDocsRouter;
