// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// YAML loader for mcpdesc and data files
import { readFile } from 'node:fs/promises';
import { McpDescLoadError } from './types.js';
import yaml from 'yaml';

export async function loadYamlOrJson(filePath: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    throw new McpDescLoadError(
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
  // Try JSON first
  try {
    return JSON.parse(content);
  } catch {}
  // Try YAML
  try {
    return yaml.parse(content);
  } catch (error) {
    throw new McpDescLoadError(
      `Failed to parse file as JSON or YAML: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
}
