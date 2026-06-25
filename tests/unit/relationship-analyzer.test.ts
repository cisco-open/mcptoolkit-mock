// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for relationship analyzer
 */

import { describe, it, expect } from '@jest/globals';
import { analyzeRelationships, formatRelationships, getSharedParameters } from '../../src/lib/relationship-analyzer.js';
import type { McpDescFile } from '../../src/lib/types.js';

describe('RelationshipAnalyzer', () => {
  const mockDesc: McpDescFile = {
    mcpdesc: '0.7.0',
    info: {
      name: 'test-server',
      version: '1.0.0',
      protocolVersion: '2025-06-18'
    },
    transports: [
      { type: 'stdio', command: 'node' }
    ],
    capabilities: {
      tools: {}
    },
    tools: [
      {
        name: 'get-weather',
        description: 'Get weather for a city',
        inputSchema: {
          type: 'object' as const,
          properties: {
            city: {
              type: 'string' as const,
              description: 'City name'
            },
            units: {
              type: 'string' as const,
              description: 'Temperature units'
            }
          },
          required: ['city']
        }
      },
      {
        name: 'get-forecast',
        description: 'Get forecast for a city',
        inputSchema: {
          type: 'object' as const,
          properties: {
            city: {
              type: 'string' as const,
              description: 'City name'
            },
            days: {
              type: 'number' as const,
              description: 'Number of days'
            }
          },
          required: ['city', 'days']
        }
      },
      {
        name: 'get-time',
        description: 'Get current time',
        inputSchema: {
          type: 'object' as const,
          properties: {
            timezone: {
              type: 'string' as const,
              description: 'Timezone'
            }
          }
        }
      }
    ],
    prompts: [],
    resources: [],
    resourceTemplates: []
  };

  describe('analyzeRelationships', () => {
    it('should detect shared parameters', () => {
      const analysis = analyzeRelationships(mockDesc);
      const shared = getSharedParameters(analysis);
      
      expect(shared).toHaveLength(1);
      expect(shared[0].name).toBe('city');
      expect(shared[0].tools).toEqual(['get-weather', 'get-forecast']);
      expect(shared[0].type).toBe('string');
    });

    it('should not detect non-shared parameters', () => {
      const analysis = analyzeRelationships(mockDesc);
      const paramNames = analysis.relationships.map(r => r.name);
      
      // These params appear in only one tool each, so they might be in relationships
      // but they won't be in shared parameters
      const shared = getSharedParameters(analysis);
      const sharedNames = shared.map(r => r.name);
      
      expect(sharedNames).not.toContain('units');
      expect(sharedNames).not.toContain('days');
      expect(sharedNames).not.toContain('timezone');
    });

    it('should generate suggested values for string parameters', () => {
      const analysis = analyzeRelationships(mockDesc);
      const shared = getSharedParameters(analysis);
      const cityParam = shared.find(r => r.name === 'city');
      
      expect(cityParam).toBeDefined();
      expect(cityParam?.suggestedValues).toBeDefined();
      expect(cityParam?.suggestedValues?.length).toBeGreaterThan(0);
    });

    it('should handle mcpdesc with no tools', () => {
      const emptyDesc: McpDescFile = {
        ...mockDesc,
        tools: [],
        prompts: [],
        resources: [],
        resourceTemplates: []
      };
      
      const analysis = analyzeRelationships(emptyDesc);
      expect(analysis.relationships).toHaveLength(0);
      expect(getSharedParameters(analysis)).toHaveLength(0);
    });

    it('should handle tools with no shared parameters', () => {
      const noSharedDesc: McpDescFile = {
        ...mockDesc,
        tools: [
          {
            name: 'tool1',
            description: 'Tool 1',
            inputSchema: {
              type: 'object' as const,
              properties: {
                param1: { type: 'string' as const }
              }
            }
          },
          {
            name: 'tool2',
            description: 'Tool 2',
            inputSchema: {
              type: 'object' as const,
              properties: {
                param2: { type: 'string' as const }
              }
            }
          }
        ],
        prompts: [],
        resources: [],
        resourceTemplates: []
      };
      
      const analysis = analyzeRelationships(noSharedDesc);
      expect(getSharedParameters(analysis)).toHaveLength(0);
    });
  });

  describe('getSharedParameters', () => {
    it('should return list of shared parameter objects', () => {
      const analysis = analyzeRelationships(mockDesc);
      const shared = getSharedParameters(analysis);
      
      expect(shared).toHaveLength(1);
      expect(shared[0].name).toBe('city');
      expect(shared[0].tools.length).toBeGreaterThan(1);
    });

    it('should return empty array when no shared parameters', () => {
      const emptyDesc: McpDescFile = {
        ...mockDesc,
        tools: [],
        prompts: [],
        resources: [],
        resourceTemplates: []
      };
      
      const analysis = analyzeRelationships(emptyDesc);
      const shared = getSharedParameters(analysis);
      
      expect(shared).toHaveLength(0);
    });
  });

  describe('formatRelationships', () => {
    it('should format relationships as markdown', () => {
      const analysis = analyzeRelationships(mockDesc);
      const formatted = formatRelationships(analysis);
      
      expect(formatted).toContain('**city**');
      expect(formatted).toContain('string');
      expect(formatted).toContain('get-weather');
      expect(formatted).toContain('get-forecast');
      expect(formatted).toContain('Suggested values:');
    });

    it('should return message when no shared parameters', () => {
      const emptyDesc: McpDescFile = {
        ...mockDesc,
        tools: [],
        prompts: [],
        resources: [],
        resourceTemplates: []
      };
      
      const analysis = analyzeRelationships(emptyDesc);
      const formatted = formatRelationships(analysis);
      
      expect(formatted).toContain('No shared parameters detected');
    });

    it('should include tool count', () => {
      const analysis = analyzeRelationships(mockDesc);
      const formatted = formatRelationships(analysis);
      
      expect(formatted).toMatch(/Used in \d+ tools/);
    });
  });
});
