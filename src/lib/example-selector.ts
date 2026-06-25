// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Example selector - Select and return example responses from mcpdesc file
 */

import type { McpDescFile } from './types.js';

/**
 * Response example structure from dump schema 0.3.4+
 */
export interface ResponseExample {
  description: string;
  input: Record<string, unknown>;
  output: unknown;
}

/**
 * Select example responses from mcpdesc file with intelligent matching
 */
export class ExampleSelector {
  private desc: McpDescFile;
  private cache: Map<string, unknown>;
  private roundRobinCounters: Map<string, number>;

  constructor(desc: McpDescFile, _similarityThreshold: number = 0.7) {
    this.desc = desc;
    this.cache = new Map();
    this.roundRobinCounters = new Map();
  }

  /**
   * Select an example response for a tool call
   * 
   * Strategy:
   * 1. Check cache for (toolName, args) - return if found
   * 2. Find tool in dump
   * 3. If tool has responseExamples:
   *    a. Try to find similar example based on input parameters
   *    b. If no good match, use round-robin selection
   * 4. If no examples available, return null (caller should use faker)
   * 
   * @param toolName - Name of the tool being called
   * @param args - Arguments passed to the tool
   * @returns Example response or null if no examples available
   */
  select(toolName: string, args: Record<string, unknown>): unknown | null {
    // Check cache first
    const cacheKey = this.getCacheKey(toolName, args);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Find tool
    const tools = this.desc.tools || [];
    if (!tools.find(t => t.name === toolName)) {
      return null; // Tool not found
    }
    // responseExamples not part of mcpdesc schema - always return null
    return null;
  }

  /**
   * Calculate similarity score between two input parameter sets
   * 
   * Similarity is based on:
   * - Keys present in both (weighted by value match)
   * - Value equality (exact match = 1.0, type match = 0.5)
   * 
   * @param exampleInput - Example input parameters
   * @param actualInput - Actual input parameters
   * @returns Similarity score from 0 to 1
   */
  calculateSimilarity(
    exampleInput: Record<string, unknown>,
    actualInput: Record<string, unknown>
  ): number {
    // Get all unique keys from both inputs
    const allKeys = new Set([
      ...Object.keys(exampleInput),
      ...Object.keys(actualInput)
    ]);

    if (allKeys.size === 0) {
      return 1.0; // Both empty = perfect match
    }

    let totalScore = 0;
    let maxScore = allKeys.size;

    for (const key of allKeys) {
      const exampleValue = exampleInput[key];
      const actualValue = actualInput[key];

      // Key present in both
      if (key in exampleInput && key in actualInput) {
        if (this.valuesEqual(exampleValue, actualValue)) {
          // Exact value match
          totalScore += 1.0;
        } else if (typeof exampleValue === typeof actualValue) {
          // Type match but value different
          totalScore += 0.5;
        }
        // else: Key exists but types don't match = 0 score
      }
      // else: Key only in one input = 0 score
    }

    return totalScore / maxScore;
  }

  /**
   * Check if two values are equal (deep comparison for objects/arrays)
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    // Simple equality for primitives
    if (a === b) return true;

    // null/undefined handling
    if (a == null || b == null) return a === b;

    // Type mismatch
    if (typeof a !== typeof b) return false;

    // Deep comparison for objects and arrays
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    return false;
  }

  /**
   * Generate cache key from tool name and arguments
   * 
   * @param toolName - Tool name
   * @param args - Tool arguments
   * @returns Cache key string
   */
  private getCacheKey(toolName: string, args: Record<string, unknown>): string {
    // Sort keys for consistent cache keys regardless of argument order
    const sortedArgs = Object.keys(args)
      .sort()
      .reduce((acc, key) => {
        acc[key] = args[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    return `${toolName}:${JSON.stringify(sortedArgs)}`;
  }

  /**
   * Get statistics about example selection
   * 
   * @returns Statistics object
   */
  getStats(): { 
    toolsWithExamples: number;
    totalExamples: number;
    cacheSize: number;
    cacheKeys: string[];
  } {
    const toolsWithExamples: any[] = []; // responseExamples not in mcpdesc schema

    const totalExamples = toolsWithExamples.reduce(
      (sum, t) => sum + (t.responseExamples?.length || 0),
      0
    );

    return {
      toolsWithExamples: toolsWithExamples.length,
      totalExamples,
      cacheSize: this.cache.size,
      cacheKeys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
    this.roundRobinCounters.clear();
  }

  /**
   * Get debug information for a specific tool call
   * 
   * @param toolName - Tool name
   * @param args - Tool arguments
   * @returns Debug information
   */
  getDebugInfo(toolName: string, args: Record<string, unknown>): {
    hasExamples: boolean;
    exampleCount: number;
    cached: boolean;
    similarityScores?: Array<{ description: string; score: number }>;
  } {
    const tools = this.desc.tools || [];
    tools.find(t => t.name === toolName); // Check tool exists
    const cacheKey = this.getCacheKey(toolName, args);
    
    // responseExamples not in mcpdesc schema
    return {
      hasExamples: false,
      exampleCount: 0,
      cached: this.cache.has(cacheKey)
    };
  }
}
