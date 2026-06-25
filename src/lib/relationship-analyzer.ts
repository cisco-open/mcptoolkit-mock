// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Relationship Analyzer - Detects common parameters across MCP tools
 * 
 * Helps generate consistent mock data by identifying shared parameters
 * (e.g., "city" used in multiple weather tools)
 */

import type { McpDescFile } from './types.js';

export interface ParameterRelationship {
  name: string;
  type: string;
  tools: string[];
  description?: string;
  format?: string;
  enum?: string[];
  suggestedValues?: string[];
}

export interface RelationshipAnalysis {
  relationships: ParameterRelationship[];
  totalTools: number;
  totalParameters: number;
}

/**
 * Analyze mcpdesc file to find common parameters across tools
 */
export function analyzeRelationships(desc: McpDescFile): RelationshipAnalysis {
  const parameterMap = new Map<string, ParameterRelationship>();
  
  const tools = desc.tools || [];
  
  // Extract all parameters from all tool input schemas
  for (const tool of tools) {
    const properties = tool.inputSchema.properties || {};
    
    for (const [paramName, paramSchema] of Object.entries(properties)) {
      const schema = paramSchema as any;
      
      if (!parameterMap.has(paramName)) {
        // First time seeing this parameter
        parameterMap.set(paramName, {
          name: paramName,
          type: schema.type || 'any',
          tools: [tool.name],
          description: schema.description,
          format: schema.format,
          enum: schema.enum
        });
      } else {
        // Parameter exists in another tool
        const existing = parameterMap.get(paramName)!;
        existing.tools.push(tool.name);
        
        // If descriptions differ, keep the more detailed one
        if (schema.description && schema.description.length > (existing.description?.length || 0)) {
          existing.description = schema.description;
        }
      }
    }
  }
  
  // Convert map to array and sort by number of tools (most shared first)
  const relationships = Array.from(parameterMap.values())
    .sort((a, b) => b.tools.length - a.tools.length);
  
  // Add suggested values for common string parameters
  for (const rel of relationships) {
    if (rel.type === 'string' && rel.tools.length > 1) {
      rel.suggestedValues = generateSuggestedValues(rel);
    }
  }
  
  const totalParameters = relationships.length;
  
  return {
    relationships,
    totalTools: tools.length,
    totalParameters
  };
}

/**
 * Generate suggested values for a parameter based on its characteristics
 */
function generateSuggestedValues(param: ParameterRelationship): string[] {
  // If enum is specified, use those values
  if (param.enum && param.enum.length > 0) {
    return param.enum.slice(0, 3); // Use first 3 enum values
  }
  
  const name = param.name.toLowerCase();
  const description = param.description?.toLowerCase() || '';
  
  // City/location parameters
  if (name.includes('city') || name.includes('location') || description.includes('city')) {
    return ['London', 'Paris', 'Tokyo'];
  }
  
  // Country parameters
  if (name.includes('country') || description.includes('country')) {
    return ['United States', 'United Kingdom', 'Japan'];
  }
  
  // Email parameters
  if (name.includes('email') || description.includes('email')) {
    return ['user@example.com', 'test@example.com', 'demo@example.com'];
  }
  
  // Name parameters
  if (name.includes('name') || name.includes('username')) {
    return ['Alice', 'Bob', 'Charlie'];
  }
  
  // ID parameters
  if (name.includes('id') || name.includes('identifier')) {
    return ['id-001', 'id-002', 'id-003'];
  }
  
  // Default: generic values
  return [`${param.name}-1`, `${param.name}-2`, `${param.name}-3`];
}

/**
 * Get shared parameters (used in 2+ tools)
 */
export function getSharedParameters(analysis: RelationshipAnalysis): ParameterRelationship[] {
  return analysis.relationships.filter(rel => rel.tools.length > 1);
}

/**
 * Format relationships for display in logs or prompts
 */
export function formatRelationships(analysis: RelationshipAnalysis): string {
  const shared = getSharedParameters(analysis);
  
  if (shared.length === 0) {
    return 'No shared parameters detected across tools.';
  }
  
  const lines: string[] = [
    `Found ${shared.length} shared parameter(s):\n`
  ];
  
  for (const rel of shared) {
    lines.push(`- **${rel.name}** (${rel.type}): Used in ${rel.tools.length} tools`);
    lines.push(`  Tools: ${rel.tools.join(', ')}`);
    if (rel.description) {
      lines.push(`  Description: ${rel.description}`);
    }
    if (rel.suggestedValues && rel.suggestedValues.length > 0) {
      lines.push(`  Suggested values: ${rel.suggestedValues.join(', ')}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}
