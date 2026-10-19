// @ts-check
// Plays the part of `bridge/plugin/ui.html` + `code.js` against a real relay:
// long-polls /pull, runs a handler per command, posts the answer to /result in
// chunks. Lets the relay, CLI and MCP server be tested without Figma.

import { createServer } from 'node:net';
import { PROTOCOL } from '../../bridge/lib/protocol.mjs';

/** A port nobody is using right now. Never 7332 — a real relay may live there. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * @param {{
 *   port: number,
 *   file?: string,
 *   page?: string,
 *   protocol?: number | null,
 *   chunkSize?: number,
 *   handlers?: Record<string, (args: any) => any>,
 *   startDelayMs?: number,
 * }} options
 */
export function startFakePlugin({
  port,
  file = 'Fake file',
  page = 'Fake page',
  protocol = PROTOCOL,
  chunkSize = 3 * 1024 * 1024,
  handlers = {},
  startDelayMs = 0,
}) {
  const base = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  let running = true;
  /** @type {string[]} */
  const seen = [];

  const post = (body) =>
    fetch(`${base}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

  async function loop() {
    if (startDelayMs) await new Promise((r) => setTimeout(r, startDelayMs));
    while (running) {
      try {
        const v = protocol === null ? '' : `&v=${protocol}`;
        const res = await fetch(
          `${base}/pull?file=${encodeURIComponent(file)}&page=${encodeURIComponent(page)}${v}`,
          { signal: controller.signal }
        );
        if (res.status === 204) continue;
        const job = await res.json();
        seen.push(job.cmd);
        const handler = handlers[job.cmd];
        try {
          if (!handler) throw new Error(`Unknown command \`${job.cmd}\`.`);
          const text = JSON.stringify(await handler(job.args || {}));
          const total = Math.max(1, Math.ceil(text.length / chunkSize));
          for (let i = 0; i < total; i++) {
            await post({
              id: job.id,
              seq: i,
              final: i === total - 1,
              ok: true,
              chunk: text.slice(i * chunkSize, (i + 1) * chunkSize),
            });
          }
        } catch (err) {
          await post({ id: job.id, final: true, ok: false, error: err.message });
        }
      } catch {
        if (!running) return;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  const done = loop();

  return {
    seen,
    async stop() {
      running = false;
      controller.abort();
      await done;
    },
  };
}

/** Resolves once the relay's /health says the plugin is connected. */
export async function untilConnected(port, timeoutMs = 3000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const state = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      if (state.plugin.connected) return state;
    } catch {
      /* relay not up yet */
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('fake plugin never connected');
}

/** A 1×1 transparent PNG, for handlers that answer `png`. */
export const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
