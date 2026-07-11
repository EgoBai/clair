import { describe, it, expect } from 'vitest';

describe('WebSocket Server', () => {
  it('should export server module', async () => {
    const mod = await import('../websocket/server');
    expect(mod).toBeDefined();
  });

  it('should have WebSocketService class', async () => {
    const { WebSocketService } = await import('../websocket/server');
    expect(WebSocketService).toBeDefined();
  });

  it('should export wsService singleton', async () => {
    const { wsService } = await import('../websocket/server');
    expect(wsService).toBeDefined();
  });
});
