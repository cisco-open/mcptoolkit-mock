#!/usr/bin/env node

// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * mcpmock - MCP Mock Server Toolkit
 * 
 * CLI entry point
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { recordCommand } from './commands/record.js';
import { completionCommand } from './commands/completion.js';
import { agentsCommand } from './commands/agents.js';
import { importCommand } from './commands/import.js';
import { buildCommand } from './commands/build.js';

// Read version from package.json
const packageJsonPath = new URL('../package.json', import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

const program = new Command();

program
  .name('mcpmock')
  .usage('[command] [options]')
  .description('MCP mock server toolkit - run, record, and build mock servers from mcpdesc files')
  .version(version)
  .addHelpText('after', '\nFor AI coding assistants (Copilot, Claude, etc.): Use "mcpmock agents" for optimized command reference')
  .configureHelp({
    // Hide the help command from help output
    visibleCommands: (cmd) => cmd.commands.filter(c => c.name() !== 'help')
  });

// Add commands
program.addCommand(runCommand());
program.addCommand(recordCommand());
program.addCommand(importCommand());
program.addCommand(buildCommand());
program.addCommand(completionCommand());
program.addCommand(agentsCommand());

// Parse command line
program.parse();
