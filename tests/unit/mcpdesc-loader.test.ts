// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for McpDescLoader
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { McpDescLoader } from '../../src/lib/mcpdesc-loader.js';
import {
  McpDescLoadError,
  UnsupportedSchemaVersionError,
  SchemaValidationError
} from '../../src/lib/types.js';

describe('McpDescLoader', () => {
  const testDir = join(process.cwd(), 'tests', 'fixtures', 'test-mcpdesc');
  const validMcpDescPath = join(process.cwd(), 'tests', 'fixtures', 'mcpdesc', 'api-inventory.mcpdesc.json');

  beforeAll(async () => {
    // Create test directory for temporary test files
    await mkdir(testDir, { recursive: true });
  });

  describe('load()', () => {
    it('should load a valid mcpdesc file', async () => {
      const loader = new McpDescLoader();
      const desc = await loader.load(validMcpDescPath);

      expect(desc).toBeDefined();
      expect(desc.mcpdesc).toBe('0.7.0');
      expect(desc.info).toBeDefined();
      expect(desc.info.name).toBeDefined();
      expect(desc.tools).toBeInstanceOf(Array);
      expect(desc.resources).toBeInstanceOf(Array);
      expect(desc.prompts).toBeInstanceOf(Array);
    });

    it('should throw McpDescLoadError when file does not exist', async () => {
      const loader = new McpDescLoader();
      const nonExistentPath = join(testDir, 'non-existent.mcpdesc.json');

      await expect(loader.load(nonExistentPath)).rejects.toThrow(McpDescLoadError);
      await expect(loader.load(nonExistentPath)).rejects.toThrow(/Failed to read/);
    });

    it('should throw McpDescLoadError when file is not valid JSON', async () => {
      const loader = new McpDescLoader();
      const invalidJsonPath = join(testDir, 'invalid.mcpdesc.json');
      
      // Create invalid JSON file
      await writeFile(invalidJsonPath, 'this is not valid JSON {]', 'utf-8');

      await expect(loader.load(invalidJsonPath)).rejects.toThrow(McpDescLoadError);
    });

    it('should throw McpDescLoadError when JSON is not an object', async () => {
      const loader = new McpDescLoader();
      const arrayJsonPath = join(testDir, 'array.mcpdesc.json');
      
      // Create JSON array (not object)
      await writeFile(arrayJsonPath, '["this", "is", "an", "array"]', 'utf-8');

      await expect(loader.load(arrayJsonPath)).rejects.toThrow(McpDescLoadError);
      await expect(loader.load(arrayJsonPath)).rejects.toThrow(/missing or invalid "mcpdesc" field/);
    });

    it('should throw McpDescLoadError when mcpdesc field is missing', async () => {
      const loader = new McpDescLoader();
      const noVersionPath = join(testDir, 'no-version.mcpdesc.json');
      
      // Create file without mcpdesc field
      await writeFile(noVersionPath, JSON.stringify({
        info: { name: 'test', version: '1.0.0' },
        transports: [{ type: 'stdio', command: 'node' }],
        tools: []
      }), 'utf-8');

      await expect(loader.load(noVersionPath)).rejects.toThrow(McpDescLoadError);
      await expect(loader.load(noVersionPath)).rejects.toThrow(/missing or invalid "mcpdesc" field/);
    });

    it('should throw UnsupportedSchemaVersionError for unsupported version', async () => {
      const loader = new McpDescLoader();
      const unsupportedVersionPath = join(testDir, 'unsupported-version.mcpdesc.json');
      
      // Create file with unsupported version
      await writeFile(unsupportedVersionPath, JSON.stringify({
        mcpdesc: '99.99.99',
        info: { name: 'test', version: '1.0.0' },
        transports: [{ type: 'stdio', command: 'node' }],
        tools: []
      }), 'utf-8');

      await expect(loader.load(unsupportedVersionPath)).rejects.toThrow(UnsupportedSchemaVersionError);
      
      try {
        await loader.load(unsupportedVersionPath);
      } catch (error) {
        if (error instanceof UnsupportedSchemaVersionError) {
          expect(error.receivedVersion).toBe('99.99.99');
          expect(error.supportedVersions).toContain('0.7.0');
        }
      }
    });

    it('should throw SchemaValidationError when file fails schema validation', async () => {
      const loader = new McpDescLoader();
      const invalidSchemaPath = join(testDir, 'invalid-schema.mcpdesc.json');
      
      // Create file with correct version but invalid structure (missing required fields)
      await writeFile(invalidSchemaPath, JSON.stringify({
        mcpdesc: '0.7.0'
        // Missing required fields: info, transports, and at least one of tools/resources/prompts
      }), 'utf-8');

      await expect(loader.load(invalidSchemaPath)).rejects.toThrow(SchemaValidationError);
      
      try {
        await loader.load(invalidSchemaPath);
      } catch (error) {
        if (error instanceof SchemaValidationError) {
          expect(error.errors).toBeDefined();
          expect(Array.isArray(error.errors)).toBe(true);
          expect(error.errors!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should validate all required fields according to schema', async () => {
      const loader = new McpDescLoader();
      const desc = await loader.load(validMcpDescPath);

      // Verify required top-level fields
      expect(desc.mcpdesc).toBeDefined();
      expect(desc.info).toBeDefined();
      expect(desc.transports).toBeDefined();

      // Verify info structure
      expect(desc.info.name).toBeDefined();
      expect(desc.info.version).toBeDefined();

      // Verify transports structure
      expect(desc.transports.length).toBeGreaterThan(0);
      expect(desc.transports[0].type).toBeDefined();

      // Verify optional capability arrays
      expect(desc.capabilities).toBeDefined();
    });
  });

  describe('getSupportedVersions()', () => {
    it('should return array of supported versions', () => {
      const versions = McpDescLoader.getSupportedVersions();
      
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions).toContain('0.7.0');
    });

    it('should return a copy of the versions array', () => {
      const versions1 = McpDescLoader.getSupportedVersions();
      const versions2 = McpDescLoader.getSupportedVersions();
      
      expect(versions1).not.toBe(versions2); // Different array instances
      expect(versions1).toEqual(versions2); // But same contents
    });
  });
});
