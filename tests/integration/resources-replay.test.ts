// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for resources/read replay matching
 *
 * Verifies URI-aware matching in replay mode and error replay for resources/read.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MCPTestClient } from '../helpers/mcp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPLAY_FILE = '/tmp/test-resources-replay.jsonl';
const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/resources-server.mcpdesc.json');

const RECORDED_TRAFFIC = [
  {
    timestamp: '2026-07-30T00:00:00.000Z',
    direction: 'request',
    id: 1,
    method: 'resources/read',
    params: { uri: 'config://app' }
  },
  {
    timestamp: '2026-07-30T00:00:00.010Z',
    direction: 'response',
    id: 1,
    result: {
      contents: [
        {
          uri: 'config://app',
          mimeType: 'application/json',
          text: '{"source":"replay","resource":"config://app"}'
        }
      ]
    }
  },
  {
    timestamp: '2026-07-30T00:00:01.000Z',
    direction: 'request',
    id: 2,
    method: 'resources/read',
    params: { uri: 'docs://readme' }
  },
  {
    timestamp: '2026-07-30T00:00:01.010Z',
    direction: 'response',
    id: 2,
    result: {
      contents: [
        {
          uri: 'docs://readme',
          mimeType: 'text/plain',
          text: 'RECORDED README CONTENT'
        }
      ]
    }
  },
  {
    timestamp: '2026-07-30T00:00:02.000Z',
    direction: 'request',
    id: 3,
    method: 'resources/read',
    params: { uri: 'data:///user-101' }
  },
  {
    timestamp: '2026-07-30T00:00:02.010Z',
    direction: 'response',
    id: 3,
    result: {
      contents: [
        {
          uri: 'data:///user-101',
          mimeType: 'application/json',
          text: '{"id":"user-101","mode":"recorded"}'
        }
      ]
    }
  },
  {
    timestamp: '2026-07-30T00:00:03.000Z',
    direction: 'request',
    id: 4,
    method: 'resources/read',
    params: { uri: 'data:///user-999' }
  },
  {
    timestamp: '2026-07-30T00:00:03.010Z',
    direction: 'response',
    id: 4,
    error: {
      code: -32602,
      message: 'Resource access denied for data:///user-999',
      data: { reason: 'forbidden-test-case' }
    }
  }
];

describe('Resources Replay - integration tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    const jsonl = RECORDED_TRAFFIC.map((entry) => JSON.stringify(entry)).join('\n');
    await writeFile(REPLAY_FILE, jsonl);

    client = new MCPTestClient();
    await client.connect({ mcpdescPath, replayPath: REPLAY_FILE });
  });

  afterAll(async () => {
    await client.close();
    try {
      await unlink(REPLAY_FILE);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return distinct recorded content for each static resource URI', async () => {
    const configResp = await client.send('resources/read', { uri: 'config://app' });
    const docsResp = await client.send('resources/read', { uri: 'docs://readme' });

    expect(configResp.result).toBeDefined();
    expect(docsResp.result).toBeDefined();

    const configText = (configResp.result as any).contents[0].text;
    const docsText = (docsResp.result as any).contents[0].text;

    expect(configText).toContain('"resource":"config://app"');
    expect(docsText).toBe('RECORDED README CONTENT');
    expect(configText).not.toBe(docsText);
  });

  it('should match a concrete resource template instance by URI', async () => {
    const response = await client.send('resources/read', { uri: 'data:///user-101' });

    expect(response.result).toBeDefined();
    const result = response.result as any;

    expect(result.contents[0].uri).toBe('data:///user-101');
    expect(result.contents[0].text).toContain('"mode":"recorded"');
  });

  it('should surface recorded error for matched resources/read entry', async () => {
    const response = await client.send('resources/read', { uri: 'data:///user-999' });

    expect(response.error).toBeDefined();
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe('Resource access denied for data:///user-999');
    expect((response.error?.data as any).reason).toBe('forbidden-test-case');
  });
});
