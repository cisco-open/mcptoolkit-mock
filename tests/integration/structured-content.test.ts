// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for structuredContent support in tools/call responses.
 *
 * Verifies that:
 * - Tools declaring an outputSchema return structuredContent alongside content
 * - Tools without outputSchema do NOT return structuredContent
 * - The content text block is always present (backward compatibility)
 * - structuredContent is populated for override (--data) responses too
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { writeFile, mkdir, unlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MCPTestClient } from '../helpers/mcp-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_MCPDESC = join(__dirname, '../fixtures/mcpdesc/structured-output-server.mcpdesc.json');

describe('structuredContent — tools/call (Faker path)', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.connect({ mcpdescPath: FIXTURE_MCPDESC });
  });

  afterAll(async () => {
    await client.close();
  });

  it('should include structuredContent for a tool that declares outputSchema', async () => {
    const response = await client.send('tools/call', {
      name: 'create-session',
      arguments: { topic: 'TypeScript' }
    });

    expect(response.result).toBeDefined();
    expect(response.error).toBeUndefined();

    const result = response.result as any;

    // Backward-compat: content text block must always be present
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(result.content[0]).toHaveProperty('text');

    // New: structuredContent must be present and be an object
    expect(result).toHaveProperty('structuredContent');
    expect(typeof result.structuredContent).toBe('object');
    expect(result.structuredContent).not.toBeNull();
  });

  it('structuredContent should match the shape declared by outputSchema', async () => {
    const response = await client.send('tools/call', {
      name: 'create-session',
      arguments: { topic: 'TypeScript' }
    });

    const sc = (response.result as any).structuredContent;

    // outputSchema requires: sessionId (string), state (enum), totalQuestions (integer), currentQuestion (integer)
    expect(sc).toHaveProperty('sessionId');
    expect(typeof sc.sessionId).toBe('string');

    expect(sc).toHaveProperty('state');
    expect(typeof sc.state).toBe('string');

    expect(sc).toHaveProperty('totalQuestions');
    expect(typeof sc.totalQuestions).toBe('number');

    expect(sc).toHaveProperty('currentQuestion');
    expect(typeof sc.currentQuestion).toBe('number');
  });

  it('content text should be the JSON-serialised structuredContent', async () => {
    const response = await client.send('tools/call', {
      name: 'create-session',
      arguments: { topic: 'TypeScript' }
    });

    const result = response.result as any;
    const parsed = JSON.parse(result.content[0].text);

    // The text representation and structuredContent should contain the same data
    expect(parsed).toEqual(result.structuredContent);
  });

  it('should NOT include structuredContent for a tool without outputSchema', async () => {
    const response = await client.send('tools/call', {
      name: 'get-status',
      arguments: { sessionId: 'sess-001' }
    });

    expect(response.result).toBeDefined();
    expect(response.error).toBeUndefined();

    const result = response.result as any;

    // content must still be present
    expect(result).toHaveProperty('content');

    // structuredContent must be absent when no outputSchema is declared
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('should include structuredContent when outputSchema returns an array type', async () => {
    const response = await client.send('tools/call', {
      name: 'list-results',
      arguments: {}
    });

    expect(response.result).toBeDefined();
    const result = response.result as any;

    // structuredContent should be present and be an array
    expect(result).toHaveProperty('structuredContent');
    expect(Array.isArray(result.structuredContent)).toBe(true);
  });
});

describe('structuredContent — tools/call (override --data path)', () => {
  let client: MCPTestClient;
  const overrideDir = '/tmp/mcpmock-test-structured-overrides';

  beforeAll(async () => {
    // Create override directory and a fixture for create-session
    await mkdir(overrideDir, { recursive: true });
    const overrideData = {
      sessionId: 'qz_sess_override',
      state: 'active',
      totalQuestions: 5,
      currentQuestion: 0
    };
    await writeFile(
      join(overrideDir, 'create-session.json'),
      JSON.stringify(overrideData, null, 2)
    );

    client = new MCPTestClient();
    await client.connect({ mcpdescPath: FIXTURE_MCPDESC, dataPath: overrideDir });
  });

  afterAll(async () => {
    await client.close();
    await rm(overrideDir, { recursive: true, force: true });
  });

  it('should include structuredContent from file override for a tool with outputSchema', async () => {
    const response = await client.send('tools/call', {
      name: 'create-session',
      arguments: { topic: 'override-test' }
    });

    expect(response.result).toBeDefined();
    expect(response.error).toBeUndefined();

    const result = response.result as any;

    // structuredContent must be present
    expect(result).toHaveProperty('structuredContent');

    // And it must match the override data
    expect(result.structuredContent).toHaveProperty('sessionId', 'qz_sess_override');
    expect(result.structuredContent).toHaveProperty('state', 'active');
    expect(result.structuredContent).toHaveProperty('totalQuestions', 5);
  });

  it('content text should reflect the same override data', async () => {
    const response = await client.send('tools/call', {
      name: 'create-session',
      arguments: { topic: 'override-test' }
    });

    const result = response.result as any;
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(result.structuredContent);
  });
});
