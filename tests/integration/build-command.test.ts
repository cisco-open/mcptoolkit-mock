// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for build command
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

describe('Build Command Integration', () => {
  const CLI_PATH = join(process.cwd(), 'build', 'index.js');
  const MCPDESC_PATH = join(process.cwd(), 'tests', 'fixtures', 'mcpdesc', 'weather-server.mcpdesc.json');
  const OUTPUT_DIR = join(process.cwd(), 'tests', 'tmp', 'build-test-output');

  beforeAll(async () => {
    // Clean output directory before tests
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    // Clean up after tests
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  });

  describe('Basic Functionality', () => {
    it('should generate mock files with faker mode', async () => {
      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai'
      ]);

      // Check output messages (note: non-verbose mode, so only stdout messages)
      expect(stdout).toContain('Generated 2 tool mock');

      // Verify files exist
      const forecastFile = join(OUTPUT_DIR, 'get-forecast.json');
      const currentFile = join(OUTPUT_DIR, 'get-current.json');

      const forecast = await readFile(forecastFile, 'utf-8');
      const current = await readFile(currentFile, 'utf-8');

      expect(forecast).toBeTruthy();
      expect(current).toBeTruthy();

      // Parse and validate JSON
      const forecastData = JSON.parse(forecast);
      const currentData = JSON.parse(current);

      expect(forecastData).toHaveProperty('success');
      expect(currentData).toHaveProperty('success');
    }, 10000);

    it('should detect shared parameters', async () => {
      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai'
      ]);

      expect(stdout).toContain('city');
      expect(stdout).toContain('Detected relationships');
    }, 10000);

    it('should create consistent values for shared parameters', async () => {
      await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai'
      ]);

      // Read generated files
      const forecastFile = join(OUTPUT_DIR, 'get-forecast.json');
      const currentFile = join(OUTPUT_DIR, 'get-current.json');

      const forecast = JSON.parse(await readFile(forecastFile, 'utf-8'));
      const current = JSON.parse(await readFile(currentFile, 'utf-8'));

      // Both should have the same 'city' value
      expect(forecast.data).toHaveProperty('city');
      expect(current.data).toHaveProperty('city');
      expect(forecast.data.city).toBe(current.data.city);
    }, 10000);
  });

  describe('CLI Options', () => {
    it('should show help', async () => {
      const { stdout } = await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--help'
      ]);

      expect(stdout).toContain('Generate mock data files');
      expect(stdout).toContain('--mcpdesc');
      expect(stdout).toContain('--output');
      expect(stdout).toContain('--no-ai');
    });

    it('should support verbose mode', async () => {
      const { stderr } = await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai',
        '--verbose'
      ]);

      expect(stderr).toContain('[MCPMOCK]');
      expect(stderr).toContain('Loading mcpdesc file');
    }, 10000);

    it('should error on missing mcpdesc file', async () => {
      try {
        await execFileAsync('node', [
          CLI_PATH,
          'build',
          '--mcpdesc', 'nonexistent.json',
          '--output', OUTPUT_DIR
        ]);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('Error');
      }
    });

    it('should error on missing required options', async () => {
      try {
        await execFileAsync('node', [
          CLI_PATH,
          'build'
        ]);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr).toContain('required');
      }
    });
  });

  describe('Output Format', () => {
    it('should generate valid JSON files', async () => {
      await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai'
      ]);

      const forecastFile = join(OUTPUT_DIR, 'get-forecast.json');
      const forecast = await readFile(forecastFile, 'utf-8');

      // Should parse without error
      const data = JSON.parse(forecast);
      expect(data).toBeDefined();
    }, 10000);

    it('should include timestamp in mock data', async () => {
      await execFileAsync('node', [
        CLI_PATH,
        'build',
        '--mcpdesc', MCPDESC_PATH,
        '--output', OUTPUT_DIR,
        '--no-ai'
      ]);

      const forecastFile = join(OUTPUT_DIR, 'get-forecast.json');
      const data = JSON.parse(await readFile(forecastFile, 'utf-8'));

      expect(data).toHaveProperty('timestamp');
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    }, 10000);
  });
});
