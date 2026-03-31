import { describe, it, expect } from 'vitest';
import { generateOpenAPI, APIRegistry } from '../services/apiDocGenerator';

describe('generateOpenAPI', () => {
  it('should generate valid OpenAPI spec', () => {
    const spec = generateOpenAPI({
      title: 'Test API',
      version: '1.0.0',
      endpoints: [{
        path: '/stocks',
        method: 'GET',
        summary: 'Get stocks',
        responses: { '200': { description: 'OK' } },
      }],
    });
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Test API');
    expect(spec.paths['/stocks']).toBeDefined();
    expect(spec.paths['/stocks'].get).toBeDefined();
  });

  it('should include parameters', () => {
    const spec = generateOpenAPI({
      title: 'T', version: '1', endpoints: [{
        path: '/stocks/{id}',
        method: 'GET',
        summary: 'Get by ID',
        parameters: [{ name: 'id', in: 'path', required: true, type: 'number' }],
        responses: { '200': { description: 'OK' } },
      }],
    });
    expect(spec.paths['/stocks/{id}'].get.parameters[0].name).toBe('id');
  });

  it('should include request body', () => {
    const spec = generateOpenAPI({
      title: 'T', version: '1', endpoints: [{
        path: '/stocks',
        method: 'POST',
        summary: 'Create stock',
        requestBody: { type: 'object', properties: { name: { type: 'string' } } },
        responses: { '201': { description: 'Created' } },
      }],
    });
    expect(spec.paths['/stocks'].post.requestBody).toBeDefined();
  });

  it('should mark deprecated endpoints', () => {
    const spec = generateOpenAPI({
      title: 'T', version: '1', endpoints: [{
        path: '/old',
        method: 'GET',
        summary: 'Old endpoint',
        deprecated: true,
        responses: { '200': { description: 'OK' } },
      }],
    });
    expect(spec.paths['/old'].get.deprecated).toBe(true);
  });

  it('should group multiple methods on same path', () => {
    const spec = generateOpenAPI({
      title: 'T', version: '1', endpoints: [
        { path: '/stocks', method: 'GET', summary: 'List', responses: { '200': { description: 'OK' } } },
        { path: '/stocks', method: 'POST', summary: 'Create', responses: { '201': { description: 'Created' } } },
      ],
    });
    expect(spec.paths['/stocks'].get).toBeDefined();
    expect(spec.paths['/stocks'].post).toBeDefined();
  });

  it('should include server URL', () => {
    const spec = generateOpenAPI({
      title: 'T', version: '1', baseUrl: 'https://api.example.com',
      endpoints: [],
    });
    expect(spec.servers[0].url).toBe('https://api.example.com');
  });
});

describe('APIRegistry', () => {
  it('should register endpoints', () => {
    const reg = new APIRegistry();
    reg.register({
      path: '/stocks', method: 'GET', summary: 'List',
      responses: { '200': { description: 'OK' } },
    });
    expect(reg.getAll()).toHaveLength(1);
  });

  it('should filter by tag', () => {
    const reg = new APIRegistry();
    reg.register({ path: '/a', method: 'GET', summary: '', tags: ['stock'], responses: { '200': { description: '' } } });
    reg.register({ path: '/b', method: 'GET', summary: '', tags: ['user'], responses: { '200': { description: '' } } });
    expect(reg.getByTag('stock')).toHaveLength(1);
  });

  it('should filter by path', () => {
    const reg = new APIRegistry();
    reg.register({ path: '/stocks', method: 'GET', summary: '', responses: { '200': { description: '' } } });
    reg.register({ path: '/stocks', method: 'POST', summary: '', responses: { '201': { description: '' } } });
    expect(reg.getByPath('/stocks')).toHaveLength(2);
  });

  it('should generate doc', () => {
    const reg = new APIRegistry();
    reg.register({ path: '/x', method: 'GET', summary: 'test', responses: { '200': { description: '' } } });
    const doc = reg.generateDoc({ title: 'API', version: '1.0' });
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('API');
  });

  it('should get stats', () => {
    const reg = new APIRegistry();
    reg.register({ path: '/a', method: 'GET', summary: '', responses: { '200': { description: '' } } });
    reg.register({ path: '/b', method: 'POST', summary: '', deprecated: true, responses: { '200': { description: '' } } });
    const stats = reg.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byMethod['GET']).toBe(1);
    expect(stats.deprecated).toBe(1);
  });
});
