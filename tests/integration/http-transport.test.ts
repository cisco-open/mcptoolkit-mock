// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for HTTP transport (streamable-http)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('mcpmock run - HTTP transport', () => {
  let serverProcess: ChildProcess;
  const port = 3333;
  const baseUrl = `http://localhost:${port}/message`;

  beforeAll(async () => {
    const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/weather-server.mcpdesc.json');
    
    // Start server
    serverProcess = spawn('node', [
      'build/index.js',
      'run',
      mcpdescPath,
      '--transport', 'streamable-http',
      '--port', port.toString()
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 3000);
      
      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('Server ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should respond to initialize request', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);
    expect(data.result).toBeDefined();
    expect(data.result.serverInfo).toBeDefined();
    expect(data.result.serverInfo.name).toBe('weather-server');
  });

  it('should respond to tools/list request', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBe(2);
    expect(data.result.tools[0].name).toBeDefined();
  });

  it('should respond to tools/call request with auto-generated data', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get-current',
          arguments: { city: 'London' }
        }
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.result).toBeDefined();
    expect(data.result.content).toBeDefined();
    expect(Array.isArray(data.result.content)).toBe(true);
    expect(data.result.content[0].type).toBe('text');
    
    const mockData = JSON.parse(data.result.content[0].text);
    expect(mockData.success).toBe(true);
    expect(mockData.data.city).toBe('London');
  });

  it('should return error for non-existent tool', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'non-existent',
          arguments: {}
        }
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32602);
  });

  it('should respond to ping request', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 999,
        method: 'ping'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(999);
    expect(data.result).toBeDefined();
    expect(data.error).toBeUndefined();
    // Ping should return empty object per MCP spec
    expect(data.result).toEqual({});
  });

  it('should handle invalid JSON', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: 'not valid json'
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as any;
    
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32700);
  });

  it('should handle OPTIONS preflight for CORS', async () => {
    const response = await fetch(baseUrl, {
      method: 'OPTIONS',
      headers: { 
        'Origin': 'https://inspector.use-mcp.dev'
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('should include CORS headers in POST responses', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Origin': 'https://inspector.use-mcp.dev'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list'
      })
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Content-Type');
  });
});
