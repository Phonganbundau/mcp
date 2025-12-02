import WebSocket from 'ws';
import type { EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string; resource?: EmbeddedResource }>;
  isError?: boolean;
  [key: string]: unknown;
}

export class McpClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private callbacks = new Map<number, (result: unknown) => void>();
  private tools: McpTool[] = [];
  private initialized = false;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', async () => {
        console.log('[MCP] Connected');
        await this.initialize();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('[MCP] Failed to parse message:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[MCP] WebSocket error:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log('[MCP] Disconnected');
        this.initialized = false;
      });
    });
  }

  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-test-client',
        version: '0.1.0',
      },
    });

    const toolsList = await this.sendRequest('tools/list', {});
    this.tools = (toolsList as { tools: McpTool[] }).tools || [];
    this.initialized = true;
    console.log(`[MCP] Initialized with ${this.tools.length} tools`);
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = ++this.requestId;
      this.callbacks.set(id, (result: unknown) => {
        const response = result as { error?: { code: number; message: string }; result?: unknown };
        if (response.error) {
          reject(new Error(`MCP error: ${response.error.message}`));
        } else {
          resolve(response.result);
        }
      });

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.ws.send(JSON.stringify(message));
    });
  }

  private handleMessage(message: { id?: number; result?: unknown; error?: unknown }): void {
    if (message.id !== undefined && this.callbacks.has(message.id)) {
      const callback = this.callbacks.get(message.id)!;
      this.callbacks.delete(message.id);
      callback(message);
    }
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    return result as McpToolResult;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

