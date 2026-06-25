// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Traffic recorder - Record JSON-RPC traffic to JSONL format
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import type { JSONRPCRequest, JSONRPCResponse, TrafficEntry } from './types.js';

/**
 * Records JSON-RPC traffic to JSONL file
 */
export class TrafficRecorder {
  private output: WriteStream;
  private closed: boolean = false;

  constructor(outputPath: string) {
    this.output = createWriteStream(outputPath, { flags: 'a', encoding: 'utf-8' });
  }

  /**
   * Record a JSON-RPC request
   */
  recordRequest(request: JSONRPCRequest): void {
    if (this.closed) {
      throw new Error('TrafficRecorder is closed');
    }

    const entry: TrafficEntry = {
      timestamp: new Date().toISOString(),
      direction: 'request',
      id: request.id ?? null,
      method: request.method,
      params: request.params
    };

    this.write(entry);
  }

  /**
   * Record a JSON-RPC response
   */
  recordResponse(response: JSONRPCResponse): void {
    if (this.closed) {
      throw new Error('TrafficRecorder is closed');
    }

    const entry: TrafficEntry = {
      timestamp: new Date().toISOString(),
      direction: 'response',
      id: response.id,
      result: response.result,
      error: response.error
    };

    this.write(entry);
  }

  /**
   * Write entry to JSONL file
   */
  private write(entry: TrafficEntry): void {
    this.output.write(JSON.stringify(entry) + '\n');
  }

  /**
   * Close the output stream
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        resolve();
        return;
      }

      this.closed = true;
      this.output.end((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
