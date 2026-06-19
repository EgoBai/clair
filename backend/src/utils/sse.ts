/**
 * SSE (Server-Sent Events) 流式响应工具
 * 
 * 用于AI对话、筛选等场景的实时流式输出
 * 用法:
 *   const stream = createSSEStream(res);
 *   stream.send({ type: 'token', content: '分析中...' });
 *   stream.send({ type: 'result', data: {...} });
 *   stream.end();
 */

import { Response } from 'express';

export interface SSEEvent {
  type: 'token' | 'result' | 'error' | 'done';
  content?: string;
  data?: any;
}

export class SSEStream {
  private res: Response;
  private closed = false;

  constructor(res: Response) {
    this.res = res;
    
    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // nginx buffering off
    });
    
    res.flushHeaders();
    
    // Handle client disconnect
    res.on('close', () => {
      this.closed = true;
    });
  }

  send(event: SSEEvent) {
    if (this.closed) return;
    
    const data = JSON.stringify(event);
    this.res.write(`data: ${data}\n\n`);
  }

  token(text: string) {
    this.send({ type: 'token', content: text });
  }

  result(data: any) {
    this.send({ type: 'result', data });
  }

  error(message: string) {
    this.send({ type: 'error', content: message });
    this.end();
  }

  end() {
    if (this.closed) return;
    this.send({ type: 'done' });
    this.res.end();
    this.closed = true;
  }
}

/**
 * Express中间件：快速创建SSE端点
 */
export function sseHandler(handler: (stream: SSEStream, req: any) => Promise<void>) {
  return async (req: any, res: Response) => {
    const stream = new SSEStream(res);
    try {
      await handler(stream, req);
    } catch (err: any) {
      console.error('[SSE] Error:', err.message);
      stream.error(err.message || '流式响应异常');
    }
  };
}
