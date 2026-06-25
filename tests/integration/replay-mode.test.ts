// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for replay mode
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPLAY_PORT = 3003;
const REPLAY_FILE = '/tmp/test-replay-mode.jsonl';
const MCPDESC_PATH = resolve(__dirname, '../fixtures/mcpdesc/weather-server.mcpdesc.json');

// Sample recorded traffic
const RECORDED_TRAFFIC = [
  {
    timestamp: '2025-12-10T00:00:00.000Z',
    direction: 'request',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    }
  },
  {
    timestamp: '2025-12-10T00:00:00.100Z',
    direction: 'response',
    id: 1,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'recorded-server', version: '2.0.0' }
    }
  },
  {
    timestamp: '2025-12-10T00:00:01.000Z',
    direction: 'request',
    id: 2,
    method: 'tools/call',
    params: { name: 'get-current', arguments: { city: 'Tokyo' } }
  },
  {
    timestamp: '2025-12-10T00:00:01.100Z',
    direction: 'response',
    id: 2,
    result: {
      content: [
        {
          type: 'text',
          text: 'RECORDED: Tokyo weather data'
        }
      ]
    }
  }
];

describe('Replay Mode Integration Tests', () => {
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    // Create replay file
    const jsonl = RECORDED_TRAFFIC.map(entry => JSON.stringify(entry)).join('\n');
    await writeFile(REPLAY_FILE, jsonl);

    // Start server in replay mode
    serverProcess = spawn(
      'node',
      [
        'build/index.js',
        'run',
        MCPDESC_PATH,
        '--replay',
        REPLAY_FILE,
        '--transport',
        'streamable-http',
        '--port',
        REPLAY_PORT.toString()
      ],
      {
        cwd: resolve(__dirname, '../../'),
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const checkServer = setInterval(async () => {
        try {
          const response = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 999,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test', version: '1.0.0' }
              }
            })
          });

          if (response.ok) {
            clearInterval(checkServer);
            resolve();
          }
        } catch {
          // Server not ready yet
        }
      }, 100);
    });
  });

  afterAll(async () => {
    // Stop server
    serverProcess.kill();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up replay file
    try {
      await unlink(REPLAY_FILE);
    } catch {
      // Ignore errors
    }
  });

  it('should replay recorded initialize response', async () => {
    const response = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 123,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(123);
    expect(data.result.serverInfo.name).toBe('recorded-server'); // From recording
    expect(data.result.serverInfo.version).toBe('2.0.0'); // From recording
  });

  it('should replay recorded tools/call response', async () => {
    const response = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 456,
        method: 'tools/call',
        params: { name: 'get-current', arguments: { city: 'Tokyo' } } // Match recording exactly
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(456);
    expect(data.result.content).toHaveLength(1);
    expect(data.result.content[0].text).toBe('RECORDED: Tokyo weather data'); // From recording
  });

  it('should fall back to mock generation for non-recorded methods', async () => {
    const response = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 789,
        method: 'tools/list',
        params: {}
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(789);
    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBeGreaterThan(0);
  });

  it('should preserve request ID in replayed responses', async () => {
    const testId = 'test-string-id';
    const response = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: testId,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.id).toBe(testId); // Preserve string ID
  });

  it('should handle multiple calls to same method with exact match', async () => {
    // First call with exact match
    const response1 = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1001,
        method: 'tools/call',
        params: { name: 'get-current', arguments: { city: 'Tokyo' } } // Exact match
      })
    });

    const data1 = await response1.json();
    expect(data1.result.content[0].text).toBe('RECORDED: Tokyo weather data');

    // Second call with exact match should get same recording
    const response2 = await fetch(`http://localhost:${REPLAY_PORT}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1002,
        method: 'tools/call',
        params: { name: 'get-current', arguments: { city: 'Tokyo' } } // Exact match again
      })
    });

    const data2 = await response2.json();
    expect(data2.result.content[0].text).toBe('RECORDED: Tokyo weather data');
  });
});
