// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * MCP Mock VS Code Extension
 * 
 * Provides AI-assisted mock data generation for MCP servers via Command Palette.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { executeBuild } from './build-integration';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('MCP Mock extension activated');

  // Register "Build Mock Data with AI" command
  const buildCommand = vscode.commands.registerCommand(
    'mcpmock.buildWithAI',
    async () => {
      await handleBuildCommand();
    }
  );

  context.subscriptions.push(buildCommand);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('MCP Mock extension deactivated');
}

/**
 * Handle build command execution
 */
async function handleBuildCommand() {
  try {
    // Step 1: Select mcpdesc file
    const mcpdescUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'MCP Description Files': ['json', 'mcpdesc.json', 'yaml', 'yml'],
        'All Files': ['*']
      },
      title: 'Select MCP Description File (from mcpcontract)'
    });

    if (!mcpdescUri || mcpdescUri.length === 0) {
      return; // User cancelled
    }

    const mcpdescPath = mcpdescUri[0].fsPath;

    // Step 2: Select output directory
    const outputUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select Output Directory for Mock Data Files'
    });

    if (!outputUri || outputUri.length === 0) {
      return; // User cancelled
    }

    const outputPath = outputUri[0].fsPath;

    // Step 3: Ask for AI assistance
    const useAI = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Use AI to generate realistic mock data?',
      title: 'AI-Assisted Generation'
    });

    if (useAI === undefined) {
      return; // User cancelled
    }

    const noAi = useAI === 'No';

    // Step 4: Execute build with progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MCP Mock Builder',
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: 'Analyzing mcpdesc file...' });

        try {
          const result = await executeBuild({
            mcpdesc: mcpdescPath,
            output: outputPath,
            ai: !noAi,
            verbose: true
          });

          progress.report({ message: `Generated ${result.toolCount} mock file(s)` });

          // Show success message
          const selection = await vscode.window.showInformationMessage(
            `✓ Generated ${result.toolCount} mock file(s) in ${path.basename(outputPath)}`,
            'Open Folder',
            'Run Test'
          );

          if (selection === 'Open Folder') {
            // Reveal output directory in explorer
            const uri = vscode.Uri.file(outputPath);
            await vscode.commands.executeCommand('revealInExplorer', uri);
          } else if (selection === 'Run Test') {
            // Open terminal and run mcpmock run command
            const terminal = vscode.window.createTerminal('MCP Mock Test');
            terminal.sendText(`mcpmock run "${mcpdescPath}" --data "${outputPath}"`);
            terminal.show();
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(`MCP Mock Build Failed: ${error.message}`);
          throw error;
        }
      }
    );
  } catch (error: any) {
    console.error('Build command failed:', error);
    vscode.window.showErrorMessage(`Build failed: ${error.message}`);
  }
}
