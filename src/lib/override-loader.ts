// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Override loader - Load custom mock data from filesystem
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';

/**
 * Load custom mock data overrides from a directory
 * 
 * Files are mapped to tool names by filename (without extension).
 * Example: search-inventory.json → "search-inventory" tool
 */
export class OverrideLoader {
  private overrides: Map<string, unknown>;

  constructor() {
    this.overrides = new Map();
  }

  /**
   * Load all mock data files from a directory
   * 
   * @param dataDir - Path to directory containing mock data JSON files
   * @returns Number of overrides loaded
   */
  async load(dataDir: string): Promise<number> {
    this.overrides.clear();

    try {
      // Check if directory exists
      const dirStat = await stat(dataDir);
      if (!dirStat.isDirectory()) {
        throw new Error(`Path is not a directory: ${dataDir}`);
      }

      // Read all files in directory
      const files = await readdir(dataDir);

      // Load each JSON file
      for (const file of files) {
        // Only process .json files
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(dataDir, file);
        const fileStats = await stat(filePath);

        // Skip directories
        if (fileStats.isDirectory()) {
          continue;
        }

        // Extract tool name from filename (without extension)
        const { name: toolName } = parse(file);

        try {
          // Read and parse JSON file
          const content = await readFile(filePath, 'utf-8');
          const mockData = JSON.parse(content);

          // Store override
          this.overrides.set(toolName, mockData);
        } catch (error) {
          // Log warning but continue loading other files
          console.error(
            `Warning: Failed to load override file "${file}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return this.overrides.size;
    } catch (error) {
      // If directory doesn't exist or can't be read, just return 0
      // This allows the server to run without overrides
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Get mock data override for a tool
   * 
   * @param toolName - Name of the tool
   * @returns Mock data if override exists, null otherwise
   */
  get(toolName: string): unknown | null {
    return this.overrides.get(toolName) ?? null;
  }

  /**
   * Check if an override exists for a tool
   */
  has(toolName: string): boolean {
    return this.overrides.has(toolName);
  }

  /**
   * Get list of all tool names with overrides
   */
  getToolNames(): string[] {
    return Array.from(this.overrides.keys());
  }

  /**
   * Get count of loaded overrides
   */
  getCount(): number {
    return this.overrides.size;
  }

  /**
   * Clear all overrides
   */
  clear(): void {
    this.overrides.clear();
  }
}
