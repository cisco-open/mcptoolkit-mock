// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema version registry and support policy
 * 
 * Since v0.10.0, mcpmock uses the mcpdesc schema format (replacing the deprecated dump schema).
 * The mcpdesc schema uses simple semver version strings (e.g., "0.7.0") instead of URLs.
 */

export interface SchemaVersionInfo {
  version: string; // Semver version string (e.g., '0.7.0')
  schemaFile: string; // Filename in schemas/ directory
  supported: boolean; // Whether this version is currently supported
  deprecated: boolean; // Whether this version is deprecated (but still supported)
  features: string[]; // List of features available in this version
}

/**
 * Registry of all supported mcpdesc schema versions
 * 
 * Support Policy:
 * - Current version: Fully supported
 * - N-1 version: Fully supported
 * - Older versions: Deprecated with 6-month sunset period
 * - After sunset: Removed from registry
 */
export const SUPPORTED_SCHEMA_VERSIONS: Record<string, SchemaVersionInfo> = {
  '0.7.0': {
    version: '0.7.0',
    schemaFile: 'mcpdesc-schema-v0.7.0.json',
    supported: true,
    deprecated: false,
    features: ['basic', 'transports', 'security', 'capabilities', 'tags', 'icons', 'annotations', 'flatTags']
  }
} as const;

export type SchemaVersion = keyof typeof SUPPORTED_SCHEMA_VERSIONS;

/**
 * Parse version string (e.g., "0.7.0")
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Get list of all supported mcpdesc schema versions
 */
export function getSupportedVersions(): string[] {
  return Object.values(SUPPORTED_SCHEMA_VERSIONS)
    .filter(v => v.supported)
    .map(v => v.version);
}

/**
 * Get schema filename for a given version with semantic versioning support
 * 
 * Follows semantic versioning principles:
 * - Exact match: Returns exact schema if available
 * - Patch compatibility: For newer patch versions (e.g., 0.7.1 when only 0.7.0 known),
 *   returns the highest known patch version with same major.minor
 * - Major/minor mismatch: Returns null (not compatible)
 * 
 * @param version - Semver version string (e.g., '0.7.0')
 * @returns Object with schema filename and whether it's an exact match, or null if incompatible
 */
export function getSchemaFileForVersion(version: string): { schemaFile: string; exactMatch: boolean } | null {
  // Try exact match first
  const exactEntry = SUPPORTED_SCHEMA_VERSIONS[version];
  
  if (exactEntry && exactEntry.supported) {
    return { schemaFile: exactEntry.schemaFile, exactMatch: true };
  }

  // Parse requested version
  const requestedVersion = parseVersion(version);
  if (!requestedVersion) {
    return null; // Invalid version format
  }

  // Find highest known patch version with same major.minor
  let bestMatch: { schemaFile: string; patch: number } | null = null;

  for (const entry of Object.values(SUPPORTED_SCHEMA_VERSIONS)) {
    if (!entry.supported) continue;

    const knownVersion = parseVersion(entry.version);
    if (!knownVersion) continue;

    // Check major.minor match
    if (knownVersion.major === requestedVersion.major && 
        knownVersion.minor === requestedVersion.minor) {
      
      // Only use if patch is <= requested (backward compatible)
      if (knownVersion.patch <= requestedVersion.patch) {
        if (!bestMatch || knownVersion.patch > bestMatch.patch) {
          bestMatch = { schemaFile: entry.schemaFile, patch: knownVersion.patch };
        }
      }
    }
  }

  return bestMatch ? { schemaFile: bestMatch.schemaFile, exactMatch: false } : null;
}

/**
 * Check if a version is deprecated
 * 
 * @param version - Semver version string
 * @returns true if version is deprecated (but still supported)
 */
export function isVersionDeprecated(version: string): boolean {
  const entry = SUPPORTED_SCHEMA_VERSIONS[version];
  return entry?.deprecated ?? false;
}

/**
 * Get features available in a specific version
 * 
 * @param version - Semver version string
 * @returns Array of feature names, or empty array if version unknown
 */
export function getVersionFeatures(version: string): string[] {
  const entry = SUPPORTED_SCHEMA_VERSIONS[version];
  return entry?.features ?? [];
}
