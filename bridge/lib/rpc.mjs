// @ts-check
// Thin client for the relay, shared by the CLI and the MCP server.
//
// `call()` returns the answer as **text**, not as a parsed object: most answers
// go straight to a file, and parsing a 20 MB dump only to re-stringify it is
// pure waste. Parse it yourself when you actually need to look inside.

import { BridgeError } from './errors.mjs';
import { NPX, PORT } from './protocol.mjs';

export { BridgeError };

let port = PORT;

/** Points this process's client at another port. Tests use it; front doors keep the env/default. */
export function usePort(p) {
  port = p;
}

export const currentPort = () => port;

const base = () => `http://127.0.0.1:${port}`;

/** The relay this process is hosting, if any — kept so it can be closed. */
let hosted = null;

const NOT_CONNECTED =
  'The figma-bridge plugin is not connected. In Figma desktop: Plugins → Development → figma-bridge.';

/** @returns {Promise<any | null>} the relay's /health body, or null if nothing answers */
export async function health(timeout = 1500) {
  try {
    const res = await fetch(`${base()}/health`, { signal: AbortSignal.timeout(timeout) });
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Uses the relay already on the port, or hosts one right here.
 *
 * In-process rather than a detached child on purpose: a long-lived host (the
 * MCP server) then owns the relay's lifetime, there is no orphan left behind
 * when it exits, and Windows is spared the libuv abort that `spawn(detached)`
 * followed by a quick exit triggers. `log` matters — the MCP server's stdout is
 * a protocol channel, so relay chatter has to go to stderr.
 *
 * @returns {Promise<{ hosted: boolean, state: any }>} `hosted` = this process runs the relay
 */
export async function ensureRelay({ log } = {}) {
  const running = await health();
  if (running) return { hosted: !!hosted, state: running };

  const { startRelay } = await import('../relay.mjs');
  try {
    hosted = await startRelay({ port, log: log || ((line) => process.stderr.write(`${line}\n`)) });
  } catch (err) {
    // Lost a race with another host — fine, as long as a relay is listening.
    const late = await health();
    if (!late) throw new BridgeError(`Could not start the relay: ${err.message}`, 'offline');
    return { hosted: false, state: late };
  }
  return { hosted: true, state: (await health()) || { plugin: { connected: false, lastSeen: null } } };
}

/** Closes the relay this process hosts, so a one-shot CLI can exit. */
export async function stopHostedRelay() {
  if (!hosted) return;
  const relay = hosted;
  hosted = null;
  await relay.close();
}

/** Polls until the plugin's next long-poll arrives. */
export async function waitForPlugin(timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const state = await health();
    if (state?.plugin?.connected) return state;
    if (Date.now() >= until) throw new BridgeError(NOT_CONNECTED, 'no-plugin');
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * The relay, plus the plugin if it can be expected soon. A relay this process
 * just started has never been polled; the plugin retries with back-off of at
 * most 5 s, so it is worth waiting for. A plugin that *was* seen and went quiet
 * was closed — waiting would only delay the same error.
 */
export async function ensurePlugin({ log, timeoutMs = 8000 } = {}) {
  const relay = await ensureRelay({ log });
  const plugin = relay.state?.plugin;
  if (!plugin?.connected && relay.hosted && !plugin?.lastSeen) await waitForPlugin(timeoutMs);
  return relay;
}

/**
 * @param {string} cmd
 * @param {object} [args]
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ text: string, ms: number }>}
 */
export async function call(cmd, args = {}, { timeout = 120_000 } = {}) {
  let res;
  try {
    res = await fetch(`${base()}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, args, timeout }),
      signal: AbortSignal.timeout(timeout + 10_000),
    });
  } catch (err) {
    throw new BridgeError(
      `No figma-bridge relay on ${base()} — run \`${NPX} serve\`, or start Claude Code. (${err.message})`,
      'offline'
    );
  }

  const text = await res.text();
  if (res.ok) return { text, ms: Number(res.headers.get('X-Figma-Ms')) || 0 };

  let message = text;
  try {
    message = JSON.parse(text).error || text;
  } catch {
    /* the body was not JSON — show it raw */
  }
  const kinds = { 409: 'protocol', 503: 'no-plugin', 504: 'timeout', 500: 'plugin' };
  throw new BridgeError(message, kinds[res.status] || 'bad');
}

/** `call()` plus JSON.parse, for the commands whose answers are small. */
export async function callJSON(cmd, args = {}, opts) {
  const { text, ms } = await call(cmd, args, opts);
  return { data: JSON.parse(text), ms };
}

/** @param {number} n */
export const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 1024 * 100 ? 1 : 0)} kB`);

/** Filesystem-safe stem for a Figma node name. */
export const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'node';
