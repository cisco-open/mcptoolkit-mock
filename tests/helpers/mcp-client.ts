// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * MCP Test Client - Helper for integration testing
 * 
 * Spawns mcpmock server as subprocess and communicates via stdio.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../../src/lib/types.js';

export interface MCPClientOptions {
  mcpdescPath: string;
  dataPath?: string;
  verbose?: boolean;
}

export class MCPTestClient {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pendingRequests: Map<number, { resolve: (value: JSONRPCResponse) => void; reject: (error: Error) => void }> = new Map();
  private nextId = 1;
  private connectionError: Error | null = null;

  /**
   * Start mock server subprocess
   */
  async connect(options: MCPClientOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['build/index.js', 'run', options.mcpdescPath];
      
      if (options.dataPath) {
        args.push('--data', options.dataPath);
      }
      
      if (options.verbose) {
        args.push('--verbose');
      }

      this.process = spawn('node', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      // Handle stderr (logs, errors)
      this.process.stderr?.on('data', (data) => {
        const message = data.toString();
        if (message.includes('ERROR')) {
          this.connectionError = new Error(message);
        }
      });

      // Handle stdout (JSON-RPC responses)
      this.readline = createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity
      });

      this.readline.on('line', (line) => {
        try {
          const message = JSON.parse(line) as JSONRPCResponse | JSONRPCNotification;
          
          // Handle responses (have 'id')
          if ('id' in message && message.id !== null) {
            const pending = this.pendingRequests.get(message.id as number);
            if (pending) {
              this.pendingRequests.delete(message.id as number);
              pending.resolve(message);
            }
          }
          // Notifications (no 'id' or id is null) are ignored for now
        } catch (error) {
          // Ignore invalid JSON (shouldn't happen in normal operation)
        }
      });

      // Handle process errors
      this.process.on('error', (error) => {
        this.connectionError = error;
        reject(error);
      });

      // Handle unexpected exit
      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          const error = new Error(`Server exited with code ${code}`);
          this.connectionError = error;
          
          // Reject all pending requests
          for (const pending of this.pendingRequests.values()) {
            pending.reject(error);
          }
          this.pendingRequests.clear();
        }
      });

      // Give server time to start
      setTimeout(() => {
        if (this.connectionError) {
          reject(this.connectionError);
        } else {
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  async send(method: string, params?: Record<string, unknown> | unknown[]): Promise<JSONRPCResponse> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Not connected - call connect() first');
    }

    const id = this.nextId++;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params: params ?? {}
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout for response
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 5000);

      // Send request
      this.process!.stdin!.write(JSON.stringify(request) + '\n', (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Clear timeout when response arrives
      const originalResolve = this.pendingRequests.get(id)?.resolve;
      if (originalResolve) {
        this.pendingRequests.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            originalResolve(value);
          },
          reject
        });
      }
    });
  }

  /**
   * Close connection and kill subprocess
   */
  async close(): Promise<void> {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.pendingRequests.clear();
  }
}
