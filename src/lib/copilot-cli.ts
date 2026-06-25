// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Copilot CLI integration for AI-assisted mock data generation
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Detect Copilot CLI in known locations
 */
export async function findCopilotCLI(): Promise<string | null> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  
  const copilotPaths = [
    join(homeDir, '.vscode-server/data/User/globalStorage/github.copilot-chat/copilotCli/copilot'),
    join(homeDir, '.vscode/extensions/github.copilot-chat-*/copilotCli/copilot'),
    join(homeDir, 'AppData/Local/Programs/Microsoft VS Code/resources/app/extensions/github.copilot-chat-*/copilotCli/copilot'),
    'copilot' // Try PATH
  ];
  
  // Wrap in timeout to avoid hanging tests
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 1000); // 1 second timeout for detection
  });
  
  const detectionPromise = (async () => {
    for (const path of copilotPaths) {
      try {
        await access(path, constants.X_OK);
        return path;
      } catch {
        // Try next path
      }
    }
    return null;
  })();
  
  return Promise.race([detectionPromise, timeoutPromise]);
}

/**
 * Generate mocks using Copilot CLI
 */
export async function generateWithCopilotCLI(
  prompt: string,
  copilotPath: string
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(copilotPath, [
      '--prompt', prompt,
      '--no-color'
    ], {
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    return stdout;
  } catch (error: any) {
    throw new Error(`Copilot CLI failed: ${error.message}`);
  }
}
