// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * McpDesc loader - Load and validate MCP description files
 * Supports multiple mcpdesc schema versions with version-specific validation
 */

import { readFile } from 'node:fs/promises';
import { loadYamlOrJson } from './yaml-loader.js';
import { Ajv, type ValidateFunction } from 'ajv';
import type { AnySchema } from 'ajv';
import addFormatsDefault from 'ajv-formats';
import type { McpDescFile } from './types.js';
import {
  getSupportedVersions,
  getSchemaFileForVersion,
  isVersionDeprecated
} from './schema-versions.js';

// Get the default export properly for ajv-formats
const addFormats = addFormatsDefault.default || addFormatsDefault;

// ANSI color codes for warnings
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/**
 * Load and validate an mcpdesc file with multi-version support
 */
export class McpDescLoader {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();

  constructor() {
    // Initialize Ajv with formats support
    // Default Ajv uses draft-07 which matches our schema
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false  // Allow union types in schema (e.g., x-* extension fields)
    });
    addFormats(this.ajv);
  }

  /**
   * Get or create validator for a specific schema version
   * Validators are compiled on first use and cached for performance
   * 
   * Supports semantic versioning: newer patch versions can be validated
   * with older known schemas (e.g., 0.7.1 validated with 0.7.0 schema)
   * 
   * @param version - Semver version string (e.g., '0.7.0')
   * @param requestedVersion - Original requested version (for fallback mode)
   * @returns Object with compiled validator and whether schema was exact match
   * @throws Error if schema file cannot be loaded
   */
  private async getValidator(version: string, requestedVersion?: string): Promise<{ validator: ValidateFunction; exactMatch: boolean }> {
    // Determine cache key (use requested version if doing fallback)
    const cacheKey = requestedVersion || version;
    const isExactMatch = !requestedVersion;
    
    // Return cached validator if available
    if (this.validators.has(cacheKey)) {
      return { validator: this.validators.get(cacheKey)!, exactMatch: isExactMatch };
    }

    // Get schema filename for this version (with semantic versioning support)
    const schemaInfo = getSchemaFileForVersion(version);
    if (!schemaInfo) {
      const { UnsupportedSchemaVersionError } = await import('./types.js');
      throw new UnsupportedSchemaVersionError(version, getSupportedVersions());
    }

    const { schemaFile, exactMatch } = schemaInfo;

    // Load schema file
    try {
      // From build/lib/mcpdesc-loader.js, schemas are at ../../schemas/
      const schemaPath = new URL(`../../schemas/${schemaFile}`, import.meta.url).pathname;
      const schemaContent = await readFile(schemaPath, 'utf-8');
      let schema = JSON.parse(schemaContent) as AnySchema;

      // For semantic versioning fallback, relax version constraint
      // Remove 'const' constraint on mcpdesc field to allow newer patch versions
      if (!exactMatch && typeof schema === 'object' && schema !== null) {
        const schemaCopy = JSON.parse(JSON.stringify(schema));
        if (schemaCopy.properties?.mcpdesc?.const) {
          delete schemaCopy.properties.mcpdesc.const;
          // Keep type: string requirement but allow any string
          schemaCopy.properties.mcpdesc = {
            type: 'string',
            description: schemaCopy.properties.mcpdesc.description || 'MCP Description specification version'
          };
        }
        schema = schemaCopy;
      }

      // Compile validator
      const validator = this.ajv.compile(schema);

      // Cache for future use
      this.validators.set(cacheKey, validator);

      return { validator, exactMatch };
    } catch (error) {
      throw new Error(
        `Failed to load mcpdesc schema ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load and validate an mcpdesc file from disk
   * Automatically detects schema version and uses appropriate validator
   * 
   * @param filePath - Path to the mcpdesc.json or mcpdesc.yaml file
   * @returns Parsed and validated mcpdesc file
   * @throws McpDescLoadError if file cannot be read or parsed
   * @throws UnsupportedSchemaVersionError if version is not supported
   * @throws SchemaValidationError if file fails schema validation
   */
  async load(filePath: string): Promise<McpDescFile> {
    // Load and parse file (JSON or YAML)
    let data: unknown;
    try {
      data = await loadYamlOrJson(filePath);
    } catch (error) {
      const { McpDescLoadError } = await import('./types.js');
      throw new McpDescLoadError(
        error instanceof Error ? error.message : String(error),
        filePath
      );
    }

    // Check if data is an object
    if (typeof data !== 'object' || data === null) {
      const { McpDescLoadError } = await import('./types.js');
      throw new McpDescLoadError(
        'Failed to parse mcpdesc file as JSON or YAML: File must be a JSON object',
        filePath
      );
    }

    // Check mcpdesc version field
    const version = (data as { mcpdesc?: unknown }).mcpdesc;
    if (typeof version !== 'string') {
      const { McpDescLoadError } = await import('./types.js');
      throw new McpDescLoadError('McpDesc file missing or invalid "mcpdesc" field', filePath);
    }

    // Warn if version is deprecated
    if (isVersionDeprecated(version)) {
      console.error(
        `${YELLOW}⚠️  Warning: McpDesc schema version ${version} is deprecated and may be removed in a future version${RESET}`
      );
      console.error(
        `${YELLOW}   Please regenerate the file with a newer version of mcpcontract${RESET}\n`
      );
    }

    // Get validator for this version (throws if unsupported)
    // For semantic versioning fallback, pass original version as second parameter
    const schemaInfo = getSchemaFileForVersion(version);
    const requestedVersion = (schemaInfo && !schemaInfo.exactMatch) ? version : undefined;
    const { validator, exactMatch } = await this.getValidator(version, requestedVersion);

    // Warn if using semantic versioning fallback (newer patch version)
    if (!exactMatch && schemaInfo) {
      // Extract version from schema filename (e.g., "0.6.0" from "mcpdesc-schema-v0.6.0.json")
      const match = schemaInfo.schemaFile.match(/v(\d+\.\d+\.\d+)/);
      const schemaVersion = match ? match[1] : 'unknown';
      console.error(
        `${YELLOW}ℹ️  Info: Validating mcpdesc schema ${version} using compatible schema ${schemaVersion}${RESET}`
      );
      console.error(
        `${YELLOW}   Semantic versioning: patch version differences are backward compatible${RESET}\n`
      );
    }

    // Validate against version-specific schema
    const valid = validator(data);

    if (!valid) {
      const { SchemaValidationError } = await import('./types.js');
      const errors = validator.errors || [];
      const errorMessages = errors
        .map((err: { instancePath?: string; message?: string }) => {
          const path = err.instancePath || 'root';
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new SchemaValidationError(
        `McpDesc file failed schema validation:\n${errorMessages}`,
        errors
      );
    }

    // Type assertion: we've validated the data matches the schema
    return data as McpDescFile;
  }

  /**
   * Get list of supported mcpdesc schema versions
   */
  static getSupportedVersions(): string[] {
    return getSupportedVersions();
  }
}

/**
 * @deprecated Use McpDescLoader instead
 */
export const DumpLoader = McpDescLoader;
