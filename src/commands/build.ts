// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Build command - Generate mock data with AI assistance or faker fallback
 */

import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { McpDescLoader } from '../lib/mcpdesc-loader.js';
import { FakerGenerator } from '../lib/faker-generator.js';
import { findCopilotCLI, generateWithCopilotCLI } from '../lib/copilot-cli.js';
import { 
  analyzeRelationships, 
  formatRelationships,
  getSharedParameters,
  type RelationshipAnalysis 
} from '../lib/relationship-analyzer.js';
import {
  McpDescLoadError,
  UnsupportedSchemaVersionError,
  SchemaValidationError,
  ConfigurationError,
  type McpDescFile,
  type BuildOptions
} from '../lib/types.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/**
 * Log helper - respects verbose flag
 */
function log(message: string, options: BuildOptions): void {
  if (options.verbose) {
    console.error(`${GREEN}[MCPMOCK]${RESET} ${message}`);
  }
}

/**
 * Error handler
 */
function handleError(error: unknown): void {
  if (error instanceof McpDescLoadError) {
    console.error(`\n${RED}✗ McpDesc Load Error:${RESET}`);
    console.error(`  ${error.message}`);
    if (error.filePath) {
      console.error(`  File: ${error.filePath}`);
    }
  } else if (error instanceof UnsupportedSchemaVersionError) {
    console.error(`\n${RED}✗ Unsupported Schema Version:${RESET}`);
    console.error(`  Received: ${error.receivedVersion}`);
    console.error(`  Supported: ${error.supportedVersions.join(', ')}`);
  } else if (error instanceof SchemaValidationError) {
    console.error(`\n${RED}✗ Schema Validation Error:${RESET}`);
    console.error(`  ${error.message}`);
  } else if (error instanceof ConfigurationError) {
    console.error(`\n${RED}✗ Configuration Error:${RESET}`);
    console.error(`  ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`\n${RED}✗ Unexpected Error:${RESET}`);
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error(`\n  Stack: ${error.stack}`);
    }
  } else {
    console.error(`\n${RED}✗ Unknown Error:${RESET}`);
    console.error(`  ${String(error)}`);
  }
}

/**
 * Build sub-agent prompt for AI-assisted generation
 */
function buildAIPrompt(desc: McpDescFile, analysis: RelationshipAnalysis): string {
  const sharedParams = getSharedParameters(analysis);
  const tools = desc.tools || [];
  
  let prompt = `Generate realistic mock data for MCP server tools.\n\n`;
  prompt += `**Server**: ${desc.info.name} v${desc.info.version}\n`;
  prompt += `**Tools**: ${tools.length} tool(s)\n\n`;
  
  // Add relationship context
  if (sharedParams.length > 0) {
    prompt += `**Important**: The following parameters are shared across multiple tools.\n`;
    prompt += `Use consistent values to make the mocks realistic:\n\n`;
    
    for (const param of sharedParams) {
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
    
    // Include output schema if available
    if (tool.outputSchema) {
      prompt += `Output Schema:\n\`\`\`json\n${JSON.stringify(tool.outputSchema, null, 2)}\n\`\`\`\n\n`;
    }
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
 * Parse AI agent output to extract tool mocks
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
      console.error(`${YELLOW}[WARN]${RESET} Failed to parse mock data for tool: ${toolName}`);
    }
  }
  
  return mocks;
}

/**
 * Generate mocks using faker with relationship awareness
 */
async function generateWithFaker(
  desc: McpDescFile, 
  analysis: RelationshipAnalysis
): Promise<Map<string, unknown>> {
  const mocks = new Map<string, unknown>();
  const faker = new FakerGenerator();
  const sharedParams = getSharedParameters(analysis);
  
  // Pre-generate consistent values for shared parameters
  const sharedValues = new Map<string, unknown>();
  for (const param of sharedParams) {
    if (param.suggestedValues && param.suggestedValues.length > 0) {
      // Use first suggested value for consistency
      sharedValues.set(param.name, param.suggestedValues[0]);
    }
  }
  
  // Generate mock for each tool
  const tools = desc.tools || [];
  for (const tool of tools) {
    // Build arguments with shared values
    const args: Record<string, unknown> = {};
    const properties = tool.inputSchema.properties || {};
    
    for (const paramName of Object.keys(properties)) {
      if (sharedValues.has(paramName)) {
        args[paramName] = sharedValues.get(paramName);
      }
    }
    
    const mockData = await faker.generate(tool, args);
    mocks.set(tool.name, mockData);
  }
  
  return mocks;
}

/**
 * Write mock data files to output directory
 */
async function writeMockFiles(
  mocks: Map<string, unknown>,
  outputDir: string,
  options: BuildOptions
): Promise<void> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });
  
  for (const [toolName, mockData] of mocks) {
    const filePath = join(outputDir, `${toolName}.json`);
    const content = JSON.stringify(mockData, null, 2);
    
    await writeFile(filePath, content, 'utf-8');
    log(`Created: ${filePath}`, options);
  }
}

/**
 * Main execution
 */
async function executeBuild(options: BuildOptions): Promise<void> {
  log('Starting mcpmock build command...', options);

  // Validate required options
  if (!options.mcpdesc) {
    throw new ConfigurationError('--mcpdesc option is required');
  }

  if (!options.output) {
    throw new ConfigurationError('--output option is required');
  }

  // Load mcpdesc file
  log(`Loading mcpdesc file: ${options.mcpdesc}`, options);
  const loader = new McpDescLoader();
  const desc = await loader.load(options.mcpdesc);

  log(`Loaded: ${desc.info.name} v${desc.info.version}`, options);
  log(`Tools: ${(desc.tools || []).length}`, options);

  // Analyze relationships
  log('Analyzing parameter relationships...', options);
  const analysis = analyzeRelationships(desc);
  const sharedParams = getSharedParameters(analysis);
  
  if (sharedParams.length > 0) {
    log(`Detected ${sharedParams.length} shared parameter(s)`, options);
    if (options.verbose) {
      console.error(formatRelationships(analysis));
    }
  }

  // Generate mocks (try AI first, fall back to faker)
  let mocks: Map<string, unknown>;
  let generationMode = 'faker';

  // Note: Commander.js converts --no-ai to options.ai = false
  const aiEnabled = options.ai !== false;
  log(`AI generation: ${aiEnabled ? 'enabled' : 'disabled (--no-ai)'}`, options);

  const toolCount = (desc.tools || []).length;

  if (aiEnabled) {
    try {
      log('Attempting AI-assisted generation...', options);
      const prompt = buildAIPrompt(desc, analysis);
      
      // Try Copilot CLI first
      const copilotPath = await findCopilotCLI();
      
      if (copilotPath) {
        log(`Found Copilot CLI: ${copilotPath}`, options);
        const result = await generateWithCopilotCLI(prompt, copilotPath);
        mocks = parseAIOutput(result);
        
        // Check if we got mocks for all tools
        if (mocks.size === toolCount) {
          generationMode = 'ai';
          log(`✓ Generated with AI assistance (Copilot CLI)`, options);
        } else {
          throw new Error(`AI generated ${mocks.size}/${toolCount} tools`);
        }
      } else {
        // Fall back to runSubagent (only available when run by AI assistant)
        const runSubagent = (globalThis as any).runSubagent;
        
        if (typeof runSubagent === 'function') {
          const result = await runSubagent('Generate mock data', prompt);
          mocks = parseAIOutput(result);
          
          // Check if we got mocks for all tools
          if (mocks.size === toolCount) {
            generationMode = 'ai';
            log(`✓ Generated with AI assistance (runSubagent)`, options);
          } else {
            throw new Error(`AI generated ${mocks.size}/${toolCount} tools`);
          }
        } else {
          throw new Error('No AI generation method available');
        }
      }
    } catch (error: any) {
      log(`AI generation not available (${error.message}), falling back to faker...`, options);
      mocks = await generateWithFaker(desc, analysis);
      log(`✓ Generated with faker`, options);
    }
  } else {
    log('AI generation disabled (--no-ai), using faker...', options);
    mocks = await generateWithFaker(desc, analysis);
    log(`✓ Generated with faker`, options);
  }

  // Write files
  log(`Writing mock files to: ${options.output}`, options);
  await writeMockFiles(mocks, options.output, options);

  // Summary
  console.log(`\n${GREEN}✓${RESET} Generated ${mocks.size} tool mock(s) with ${generationMode} mode`);
  if (sharedParams.length > 0) {
    console.log(`${CYAN}ℹ${RESET} Detected relationships: ${sharedParams.map(p => p.name).join(', ')}`);
  }
  for (const [toolName] of mocks) {
    console.log(`${GREEN}✓${RESET} Created: ${join(options.output, toolName + '.json')}`);
  }
  console.log(`\n${CYAN}Next${RESET}: Test with: mcpmock run ${options.mcpdesc} --data ${options.output}`);
}

/**
 * Create build command
 */
export function buildCommand(): Command {
  const cmd = new Command('build');

  cmd
    .description('Generate mock data files for MCP tools')
    .requiredOption('--mcpdesc <file>', 'Path to mcpdesc file (from mcpcontract)')
    .requiredOption('--output <dir>', 'Output directory for mock data files')
    .option('--no-ai', 'Skip AI generation, use faker only')
    .option('--verbose', 'Enable detailed logging', false)
    .action(async (options: BuildOptions) => {
      try {
        await executeBuild(options);
      } catch (error) {
        handleError(error);
        process.exit(1);
      }
    });

  cmd.addHelpText('after', `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # 1. Generate mock data with AI assistance (default)
  $ mcpmock build \\
      --mcpdesc weather-server.mcpdesc.json \\
      --output mock-data/

  # 2. Then run server with generated mocks
  $ mcpmock run weather-server.mcpdesc.json --data mock-data/ --port 3000

  # 3. Skip AI, use faker only (faster, less realistic)
  $ mcpmock build \\
      --mcpdesc api-inventory.mcpdesc.json \\
      --output mock-data/ \\
      --no-ai

  # 4. Verbose mode - see relationship analysis and AI interaction
  $ mcpmock build \\
      --mcpdesc weather-server.mcpdesc.json \\
      --output mock-data/ \\
      --verbose

  # Output: Creates one JSON file per tool
  # mock-data/
  #   get-current.json      # Mock for get-current tool
  #   get-forecast.json     # Mock for get-forecast tool
  #   ...
`);

  return cmd;
}
