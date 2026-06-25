// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for mcpmock run command
 * 
 * Tests full workflow: subprocess spawn → stdio communication → protocol handling
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTestClient } from '../helpers/mcp-client.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('mcpmock run - integration tests', () => {
  describe('Weather Server (auto-generated data)', () => {
    let client: MCPTestClient;
    const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/weather-server.mcpdesc.json');

    beforeAll(async () => {
      client = new MCPTestClient();
      await client.connect({ mcpdescPath });
    });

    afterAll(async () => {
      await client.close();
    });

    it('should respond to initialize request', async () => {
      const response = await client.send('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'mcpmock-test',
          version: '1.0.0'
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('serverInfo');
      expect((response.result as any).serverInfo).toHaveProperty('name');
      expect((response.result as any).serverInfo).toHaveProperty('version');
    });

    it('should respond to tools/list request', async () => {
      const response = await client.send('tools/list');

      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('tools');
      expect(Array.isArray((response.result as any).tools)).toBe(true);
      expect((response.result as any).tools.length).toBeGreaterThan(0);
      
      // Verify tool structure
      const tool = (response.result as any).tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
    });

    it('should respond to tools/call with auto-generated data', async () => {
      const response = await client.send('tools/call', {
        name: 'get-current',
        arguments: {
          city: 'London'
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty('content');
      expect(Array.isArray((response.result as any).content)).toBe(true);
      expect((response.result as any).content.length).toBeGreaterThan(0);
      
      // Verify MCP content format
      const content = (response.result as any).content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');
      
      // Verify response is valid JSON
      const data = JSON.parse(content.text);
      expect(data).toBeDefined();
    });

    it('should respond to ping request', async () => {
      const response = await client.send('ping');

      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
      // Ping should return empty object per MCP spec
      expect(response.result).toEqual({});
    });

    it('should return error for non-existent tool', async () => {
      const response = await client.send('tools/call', {
        name: 'non-existent-tool',
        arguments: {}
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602);
      expect(response.error?.message).toContain('not found');
    });

    it('should validate required arguments for tools/call', async () => {
      const response = await client.send('tools/call', {
        name: 'get-current',
        arguments: {} // Missing required 'city' argument
      });

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32602);
      expect(response.error?.message).toContain('Missing required arguments');
      expect(response.error?.message).toContain('city');
      
      const data = response.error?.data as any;
      expect(data).toHaveProperty('missingArguments');
      expect(data.missingArguments).toContain('city');
      expect(data).toHaveProperty('requiredArguments');
    });

    it('should accept tools/call with all required arguments', async () => {
      const response = await client.send('tools/call', {
        name: 'get-forecast',
        arguments: {
          city: 'Paris' // Required argument provided
          // days is optional with default
        }
      });

      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });
  });

  describe('Weather Server (with custom mock data)', () => {
    let client: MCPTestClient;
    const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/weather-server.mcpdesc.json');
    const dataPath = join(__dirname, '../../examples/weather');

    beforeAll(async () => {
      client = new MCPTestClient();
      await client.connect({ mcpdescPath, dataPath });
    });

    afterAll(async () => {
      await client.close();
    });

    it('should use custom mock data for get-forecast', async () => {
      const response = await client.send('tools/call', {
        name: 'get-forecast',
        arguments: {
          city: 'London',
          days: 3
        }
      });

      expect(response.result).toBeDefined();
      const content = (response.result as any).content[0];
      const data = JSON.parse(content.text);
      
      // Verify it's our custom data (forecast from examples/weather/get-forecast.json)
      expect(data.forecast).toBeDefined();
      expect(Array.isArray(data.forecast)).toBe(true);
      expect(data.forecast.length).toBeGreaterThan(0);
      expect(data.forecast[0]).toHaveProperty('date');
      expect(data.forecast[0]).toHaveProperty('temperature');
    });

    it('should use custom mock data for get-current', async () => {
      const response = await client.send('tools/call', {
        name: 'get-current',
        arguments: {
          city: 'London'
        }
      });

      expect(response.result).toBeDefined();
      const content = (response.result as any).content[0];
      const data = JSON.parse(content.text);
      
      // Verify it's our custom data (weather from examples/weather/get-current.json)
      expect(data.temperature).toBeDefined();
      expect(data.conditions).toBeDefined();
      expect(data.location).toBeDefined();
      expect(data.location.city).toBe('San Francisco');
    });
  });

  describe('API Inventory Server', () => {
    let client: MCPTestClient;
    const mcpdescPath = join(__dirname, '../fixtures/mcpdesc/api-inventory.mcpdesc.json');

    beforeAll(async () => {
      client = new MCPTestClient();
      await client.connect({ mcpdescPath });
    });

    afterAll(async () => {
      await client.close();
    });

    it('should respond to initialize request', async () => {
      const response = await client.send('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'mcpmock-test',
          version: '1.0.0'
        }
      });

      expect(response.result).toBeDefined();
      expect((response.result as any).serverInfo).toHaveProperty('name');
    });

    it('should list all API inventory tools', async () => {
      const response = await client.send('tools/list');

      expect(response.result).toBeDefined();
      expect((response.result as any).tools.length).toBe(5);
      
      const toolNames = (response.result as any).tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain('list-organizations');
      expect(toolNames).toContain('search');
      expect(toolNames).toContain('stats');
      expect(toolNames).toContain('refresh-cache');
      expect(toolNames).toContain('schema-version');
    });

    it('should call search tool with auto-generated data', async () => {
      const response = await client.send('tools/call', {
        name: 'search',
        arguments: {
          name: 'Webex',
          partial: true
        }
      });

      expect(response.result).toBeDefined();
      const content = (response.result as any).content[0];
      const data = JSON.parse(content.text);
      
      // Verify response structure
      expect(data).toBeDefined();
    });
  });
});
