// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for prompts support
 * 
 * Tests prompts/list and prompts/get functionality
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTestClient } from '../helpers/mcp-client.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Prompts Support - integration tests', () => {
  let client: MCPTestClient;
  const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/prompts-server.mcpdesc.json');

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.connect({ mcpdescPath });
  });

  afterAll(async () => {
    await client.close();
  });

  it('should respond to initialize with prompts capability', async () => {
    const response = await client.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'mcpmock-test',
        version: '1.0.0'
      }
    });

    expect(response.result).toBeDefined();
    const result = response.result as any;
    expect(result.capabilities).toHaveProperty('prompts');
  });

  it('should respond to prompts/list request', async () => {
    const response = await client.send('prompts/list');

    expect(response.result).toBeDefined();
    expect(response.result).toHaveProperty('prompts');
    
    const result = response.result as any;
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts.length).toBe(2);
    
    // Verify prompt structure
    const prompt = result.prompts[0];
    expect(prompt).toHaveProperty('name');
    expect(prompt).toHaveProperty('description');
    expect(prompt.name).toBe('review-code');
  });

  it('should respond to prompts/get with valid prompt name', async () => {
    const response = await client.send('prompts/get', {
      name: 'review-code',
      arguments: {
        code: 'console.log("hello")',
        language: 'javascript'
      }
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result).toHaveProperty('messages');
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
    
    // Verify message structure
    const message = result.messages[0];
    expect(message).toHaveProperty('role');
    expect(message).toHaveProperty('content');
    expect(message.content).toHaveProperty('type');
    expect(message.content).toHaveProperty('text');
  });

  it('should respond to prompts/get without arguments', async () => {
    const response = await client.send('prompts/get', {
      name: 'summarize-text'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result).toHaveProperty('messages');
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('should return error for non-existent prompt', async () => {
    const response = await client.send('prompts/get', {
      name: 'non-existent-prompt',
      arguments: {}
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('Prompt not found');
    expect(response.error?.data).toHaveProperty('availablePrompts');
    
    const availablePrompts = (response.error?.data as any).availablePrompts;
    expect(Array.isArray(availablePrompts)).toBe(true);
    expect(availablePrompts).toContain('review-code');
    expect(availablePrompts).toContain('summarize-text');
  });

  it('should handle prompts/get with description in response', async () => {
    const response = await client.send('prompts/get', {
      name: 'review-code',
      arguments: {
        code: 'console.log("test")' // Provide required argument
      }
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result).toHaveProperty('description');
    expect(result.description).toBe('Review code for best practices and potential issues');
  });

  it('should validate required arguments for prompts/get', async () => {
    const response = await client.send('prompts/get', {
      name: 'review-code',
      arguments: {} // Missing required 'code' argument
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('Missing required arguments');
    expect(response.error?.message).toContain('code');
    
    const data = response.error?.data as any;
    expect(data).toHaveProperty('missingArguments');
    expect(data.missingArguments).toContain('code');
    expect(data).toHaveProperty('requiredArguments');
  });

  it('should accept prompts/get with all required arguments provided', async () => {
    const response = await client.send('prompts/get', {
      name: 'review-code',
      arguments: {
        code: 'console.log("hello")',
        language: 'javascript' // optional
      }
    });

    expect(response.result).toBeDefined();
    expect(response.error).toBeUndefined();
  });
});
