// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for resources support
 * 
 * Tests resources/list, resources/templates/list, and resources/read functionality
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTestClient } from '../helpers/mcp-client.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Resources Support - integration tests', () => {
  let client: MCPTestClient;
  const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/resources-server.mcpdesc.json');

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.connect({ mcpdescPath });
  });

  afterAll(async () => {
    await client.close();
  });

  it('should respond to initialize with resources capability', async () => {
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
    expect(result.capabilities).toHaveProperty('resources');
  });

  it('should respond to resources/list request', async () => {
    const response = await client.send('resources/list');

    expect(response.result).toBeDefined();
    expect(response.result).toHaveProperty('resources');
    
    const result = response.result as any;
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources.length).toBe(3);
    
    // Verify resource structure
    const resource = result.resources[0];
    expect(resource).toHaveProperty('uri');
    expect(resource).toHaveProperty('name');
    expect(resource).toHaveProperty('description');
    expect(resource).toHaveProperty('mimeType');
    expect(resource.uri).toBe('config://app');
  });

  it('should respond to resources/templates/list request', async () => {
    const response = await client.send('resources/templates/list');

    expect(response.result).toBeDefined();
    expect(response.result).toHaveProperty('resourceTemplates');
    
    const result = response.result as any;
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
    expect(result.resourceTemplates.length).toBe(2);
    
    // Verify template structure
    const template = result.resourceTemplates[0];
    expect(template).toHaveProperty('uriTemplate');
    expect(template).toHaveProperty('name');
    expect(template).toHaveProperty('description');
    expect(template).toHaveProperty('mimeType');
    expect(template.uriTemplate).toBe('file:///{path}');
  });

  it('should respond to resources/read with static JSON resource', async () => {
    const response = await client.send('resources/read', {
      uri: 'config://app'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result).toHaveProperty('contents');
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents.length).toBe(1);
    
    // Verify content structure
    const content = result.contents[0];
    expect(content).toHaveProperty('uri');
    expect(content).toHaveProperty('mimeType');
    expect(content).toHaveProperty('text');
    expect(content.uri).toBe('config://app');
    expect(content.mimeType).toBe('application/json');
    
    // Verify content is valid JSON
    expect(() => JSON.parse(content.text)).not.toThrow();
    const parsedContent = JSON.parse(content.text);
    expect(parsedContent).toHaveProperty('uri');
    expect(parsedContent.uri).toBe('config://app');
  });

  it('should respond to resources/read with static text resource', async () => {
    const response = await client.send('resources/read', {
      uri: 'docs://readme'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result.contents[0].uri).toBe('docs://readme');
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(typeof result.contents[0].text).toBe('string');
    expect(result.contents[0].text).toContain('docs://readme');
  });

  it('should respond to resources/read with templated resource', async () => {
    const response = await client.send('resources/read', {
      uri: 'data:///user-123'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result).toHaveProperty('contents');
    expect(result.contents.length).toBe(1);
    
    const content = result.contents[0];
    expect(content.uri).toBe('data:///user-123');
    expect(content.mimeType).toBe('application/json');
    
    // Verify content is valid JSON
    expect(() => JSON.parse(content.text)).not.toThrow();
    const parsedContent = JSON.parse(content.text);
    expect(parsedContent).toHaveProperty('id');
    expect(parsedContent.id).toBe('user-123');
  });

  it('should respond to resources/read with file path template', async () => {
    const response = await client.send('resources/read', {
      uri: 'file:///config/settings.json'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result.contents[0].uri).toBe('file:///config/settings.json');
    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(typeof result.contents[0].text).toBe('string');
  });

  it('should return error for non-existent resource', async () => {
    const response = await client.send('resources/read', {
      uri: 'non-existent://resource'
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('Resource not found');
    expect(response.error?.data).toHaveProperty('availableResources');
    expect(response.error?.data).toHaveProperty('availableTemplates');
    
    const data = response.error?.data as any;
    expect(Array.isArray(data.availableResources)).toBe(true);
    expect(data.availableResources).toContain('config://app');
    expect(data.availableResources).toContain('docs://readme');
    expect(data.availableResources).toContain('schema://user');
    
    expect(Array.isArray(data.availableTemplates)).toBe(true);
    expect(data.availableTemplates).toContain('file:///{path}');
    expect(data.availableTemplates).toContain('data:///{id}');
  });

  it('should handle resources/read with schema+json MIME type', async () => {
    const response = await client.send('resources/read', {
      uri: 'schema://user'
    });

    expect(response.result).toBeDefined();
    
    const result = response.result as any;
    expect(result.contents[0].uri).toBe('schema://user');
    expect(result.contents[0].mimeType).toBe('application/schema+json');
    
    // Verify content is valid JSON
    expect(() => JSON.parse(result.contents[0].text)).not.toThrow();
  });

  it('should extract variables from URI templates correctly', async () => {
    // Test with multiple path segments
    const response1 = await client.send('resources/read', {
      uri: 'file:///path/to/file.txt'
    });
    
    expect(response1.result).toBeDefined();
    const result1 = response1.result as any;
    expect(result1.contents[0].uri).toBe('file:///path/to/file.txt');

    // Test with numeric ID
    const response2 = await client.send('resources/read', {
      uri: 'data:///42'
    });
    
    expect(response2.result).toBeDefined();
    const result2 = response2.result as any;
    expect(result2.contents[0].uri).toBe('data:///42');
    const parsedContent = JSON.parse(result2.contents[0].text);
    expect(parsedContent.id).toBe('42');
  });
});
