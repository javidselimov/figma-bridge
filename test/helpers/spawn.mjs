// @ts-check
// Spawns the real executable, so tests cover the same path a user runs.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../../bin/figma-bridge.mjs', import.meta.url));

/**
 * Runs `figma-bridge <args>` to completion.
 * @param {string[]} args
 * @param {{ port: number, root: string, env?: Record<string, string>, timeoutMs?: number }} options
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function runCli(args, { port, root, env = {}, timeoutMs = 20_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: root,
      env: { ...process.env, FIGMA_BRIDGE_PORT: String(port), FIGMA_BRIDGE_ROOT: root, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`figma-bridge ${args.join(' ')} did not exit within ${timeoutMs} ms\n${stderr}`));
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Starts `figma-bridge mcp` and speaks newline-delimited JSON-RPC to it.
 * @param {{ port: number, root: string }} options
 */
export function startMcp({ port, root }) {
  const child = spawn(process.execPath, [BIN, 'mcp'], {
    cwd: root,
    env: { ...process.env, FIGMA_BRIDGE_PORT: String(port), FIGMA_BRIDGE_ROOT: root },
  });
  /** Every stdout line, raw — the protocol test checks each one parses. */
  const lines = [];
  const waiting = new Map();
  let buffer = '';
  let stderr = '';
  let nextId = 1;

  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      lines.push(line);
      try {
        const msg = JSON.parse(line);
        const done = waiting.get(msg.id);
        if (done) {
          waiting.delete(msg.id);
          done(msg);
        }
      } catch {
        /* recorded in `lines`; the test asserts on it */
      }
    }
  });

  /** @returns {Promise<any>} the whole JSON-RPC response */
  function request(method, params, timeoutMs = 20_000) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out\n${stderr}`)), timeoutMs);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

  async function stop() {
    child.stdin.end();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve(undefined);
      const t = setTimeout(() => child.kill(), 3000);
      child.on('close', () => {
        clearTimeout(t);
        resolve(undefined);
      });
    });
  }

  return { request, notify, stop, lines, stderr: () => stderr };
}
