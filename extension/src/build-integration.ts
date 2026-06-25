// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Build Integration
 * 
 * Integrates mcpmock build logic with VS Code extension host.
 * This provides access to AI capabilities via runSubagent.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

// Type definitions from mcpmock
interface McpDescFile {
  mcpdesc: string;
  info: {
    name: string;
    version: string;
    description?: string;
  };
  transports: Array<{ type: string; [key: string]: unknown }>;
  tools?: Tool[];
}

interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface BuildOptions {
  mcpdesc: string;
  output: string;
  ai?: boolean;
  verbose: boolean;
}

interface BuildResult {
  toolCount: number;
  generationMode: 'ai' | 'faker';
  files: string[];
}

interface RelationshipAnalysis {
  sharedParameters: Array<{
    name: string;
    type: string;
    tools: string[];
    suggestedValues?: string[];
  }>;
}

/**
 * Execute build with AI assistance
 */
export async function executeBuild(options: BuildOptions): Promise<BuildResult> {
  // Load mcpdesc file
  const descContent = await readFile(options.mcpdesc, 'utf-8');
  const desc: McpDescFile = JSON.parse(descContent);
  const tools = desc.tools || [];

  // Analyze relationships
  const analysis = analyzeRelationships(desc);

  // Generate mocks
  let mocks: Map<string, unknown>;
  let generationMode: 'ai' | 'faker' = 'faker';

  if (options.ai !== false) {
    try {
      // Try AI generation via runSubagent
      const prompt = buildAIPrompt(desc, analysis);
      
      // Access runSubagent via global context (available in VS Code extension host)
      const runSubagent = (globalThis as any).runSubagent;
      
      if (typeof runSubagent === 'function') {
        const result = await runSubagent('Generate mock data for MCP server', prompt);
        mocks = parseAIOutput(result);
        
        if (mocks.size === tools.length) {
          generationMode = 'ai';
        } else {
          throw new Error(`AI generated ${mocks.size}/${tools.length} tools`);
        }
      } else {
        throw new Error('runSubagent not available');
      }
    } catch (error: any) {
      console.warn(`AI generation failed: ${error.message}, falling back to faker`);
      mocks = await generateWithFaker(desc, analysis);
    }
  } else {
    mocks = await generateWithFaker(desc, analysis);
  }

  // Write mock files
  await mkdir(options.output, { recursive: true });
  const files: string[] = [];

  for (const [toolName, mockData] of mocks) {
    const filePath = join(options.output, `${toolName}.json`);
    const content = JSON.stringify(mockData, null, 2) + '\n';
    await writeFile(filePath, content, 'utf-8');
    files.push(filePath);
  }

  return {
    toolCount: mocks.size,
    generationMode,
    files
  };
}

/**
 * Analyze parameter relationships across tools
 */
function analyzeRelationships(desc: McpDescFile): RelationshipAnalysis {
  const parameterMap = new Map<string, Set<string>>();
  const tools = desc.tools || [];

  // Collect all parameters and which tools use them
  for (const tool of tools) {
    const properties = tool.inputSchema.properties || {};
    
    for (const paramName of Object.keys(properties)) {
      if (!parameterMap.has(paramName)) {
        parameterMap.set(paramName, new Set());
      }
      parameterMap.get(paramName)!.add(tool.name);
    }
  }

  // Find shared parameters (used in 2+ tools)
  const sharedParameters: RelationshipAnalysis['sharedParameters'] = [];

  for (const [paramName, tools] of parameterMap) {
    if (tools.size >= 2) {
      // Get param details from first tool that has it
      const firstTool = tools.find(t => 
        Object.keys(t.inputSchema.properties || {}).includes(paramName)
      );
      
      const paramSchema = firstTool?.inputSchema.properties?.[paramName];
      
      sharedParameters.push({
        name: paramName,
        type: paramSchema?.type || 'string',
        tools: Array.from(tools),
        suggestedValues: getSuggestedValues(paramName, paramSchema)
      });
    }
  }

  return { sharedParameters };
}

/**
 * Get suggested values for a parameter based on its name/schema
 */
function getSuggestedValues(paramName: string, schema: any): string[] | undefined {
  // Common parameter patterns
  const suggestions: Record<string, string[]> = {
    'city': ['London', 'Paris', 'Tokyo', 'New York', 'San Francisco'],
    'country': ['US', 'UK', 'FR', 'DE', 'JP'],
    'lang': ['en', 'es', 'fr', 'de', 'ja'],
    'language': ['en', 'es', 'fr', 'de', 'ja'],
    'region': ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
    'environment': ['development', 'staging', 'production'],
    'status': ['active', 'inactive', 'pending']
  };

  const lowerName = paramName.toLowerCase();
  
  for (const [pattern, values] of Object.entries(suggestions)) {
    if (lowerName.includes(pattern)) {
      return values;
    }
  }

  return undefined;
}

/**
 * Build AI prompt for mock generation
 */
function buildAIPrompt(desc: McpDescFile, analysis: RelationshipAnalysis): string {
  const tools = desc.tools || [];
  let prompt = `Generate realistic mock data for MCP server tools.\n\n`;
  prompt += `**Server**: ${desc.info.name} v${desc.info.version}\n`;
  prompt += `**Tools**: ${tools.length} tool(s)\n\n`;

  // Add relationship context
  if (analysis.sharedParameters.length > 0) {
    prompt += `**Important**: The following parameters are shared across multiple tools.\n`;
    prompt += `Use consistent values to make the mocks realistic:\n\n`;

    for (const param of analysis.sharedParameters) {
      prompt += `- **${param.name}**: Used in ${param.tools.join(', ')}\n`;
      if (param.suggestedValues) {
        prompt += `  Suggested values: ${param.suggestedValues.join(', ')}\n`;
      }
    }
    prompt += `\n`;
  }

  // Add tool details
  prompt += `**Tools to generate mocks for**:\n\n`;

  for (const tool of tools) {
    prompt += `### ${tool.name}\n`;
    prompt += `${tool.description || 'No description'}\n\n`;
    prompt += `Input Schema:\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n`;
  }

  // Instructions
  prompt += `\n**Instructions**:\n`;
  prompt += `1. Generate realistic mock response data for each tool\n`;
  prompt += `2. Use consistent values for shared parameters\n`;
  prompt += `3. Return JSON output for each tool in the following format:\n\n`;
  prompt += `\`\`\`xml\n`;
  prompt += `<tool name="tool-name">\n`;
  prompt += `{ "your": "mock", "data": "here" }\n`;
  prompt += `</tool>\n`;
  prompt += `\`\`\`\n\n`;
  prompt += `Generate all ${tools.length} tool mocks now.`;

  return prompt;
}

/**
 * Parse AI output to extract tool mocks
 */
function parseAIOutput(output: string): Map<string, unknown> {
  const mocks = new Map<string, unknown>();

  // Extract JSON from XML-style tags
  const toolRegex = /<tool name="([^"]+)">\s*([\s\S]*?)\s*<\/tool>/g;
  let match;

  while ((match = toolRegex.exec(output)) !== null) {
    const toolName = match[1];
    const jsonContent = match[2].trim();

    try {
      const mockData = JSON.parse(jsonContent);
      mocks.set(toolName, mockData);
    } catch (error) {
      console.warn(`Failed to parse mock data for tool: ${toolName}`);
    }
  }

  return mocks;
}

/**
 * Generate mocks using faker (fallback)
 */
async function generateWithFaker(
  desc: McpDescFile,
  analysis: RelationshipAnalysis
): Promise<Map<string, unknown>> {
  const mocks = new Map<string, unknown>();
  const tools = desc.tools || [];

  // Simple faker-like generation (minimal implementation)
  // In production, this would use @faker-js/faker
  const sharedValues = new Map<string, unknown>();

  // Pre-generate shared values
  for (const param of analysis.sharedParameters) {
    if (param.suggestedValues && param.suggestedValues.length > 0) {
      sharedValues.set(param.name, param.suggestedValues[0]);
    }
  }

  // Generate mock for each tool
  for (const tool of tools) {
    const mockData: Record<string, unknown> = {
      success: true,
      data: {},
      timestamp: new Date().toISOString()
    };

    const properties = tool.inputSchema.properties || {};

    for (const paramName of Object.keys(properties)) {
      if (sharedValues.has(paramName)) {
        (mockData.data as any)[paramName] = sharedValues.get(paramName);
      } else {
        // Generate simple mock value based on type
        const paramSchema = properties[paramName];
        (mockData.data as any)[paramName] = generateMockValue(paramSchema);
      }
    }

    mocks.set(tool.name, mockData);
  }

  return mocks;
}

/**
 * Generate simple mock value based on schema type
 */
function generateMockValue(schema: any): unknown {
  switch (schema.type) {
    case 'string':
      return 'mock-value';
    case 'number':
    case 'integer':
      return 42;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}
