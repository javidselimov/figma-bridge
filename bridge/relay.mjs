// @ts-check
// The hub. Figma plugins can only talk outwards, so the plugin *pulls* work from
// here (long-poll) and posts the answer back; the CLI and the MCP server push
// work in and block until that answer arrives. Nothing here touches the
// filesystem or the network beyond loopback.
//
// | endpoint       | caller | does                                              |
// | -------------- | ------ | ------------------------------------------------- |
// | GET  /pull     | plugin | hands over one job, or holds 25 s and answers 204 |
// | POST /result   | plugin | one chunk of an answer; the last one closes it    |
// | POST /rpc      | client | enqueue a command, wait for the answer            |
// | GET  /health   | client | is the plugin there, what is queued               |
//
// Started by `figma-bridge serve`, or in-process by the MCP server / CLI.

import { createServer } from 'node:http';
import { PORT, PROTOCOL, NPX } from './lib/protocol.mjs';

const HOLD = 25_000; // how long a poll waits before answering 204
const STALE = 45_000; // no poll for this long → the plugin is gone
const RPC_TIMEOUT = 120_000;
const LIMIT = 256 * 1024 * 1024; // an 8-deep page dump is tens of MB

const cors = {
  'Access-Control-Allow-Origin': '*', // the plugin iframe's origin is `null`
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/** @param {import('node:http').ServerResponse} res */
const json = (res, code, obj) =>
  res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(obj));

/** @param {import('node:http').IncomingMessage} req */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const reinstall = `Run \`${NPX} plugin install\`, then close and re-run the plugin in Figma.`;

/**
 * One relay's state and request handler. State lives in this closure rather
 * than at module level so a process (or a test) can run relays side by side.
 * @param {number} port
 * @param {(line: string) => void} log
 */
function createHub(port, log) {
  const queue = []; // jobs waiting for a poll
  const waiters = []; // polls waiting for a job
  const inflight = new Map(); // job id → the client response held open for it
  const plugin = { lastSeen: 0, file: null, page: null, protocol: null, seen: false };
  let seq = 0;

  const connected = () => Date.now() - plugin.lastSeen < STALE;

  const health = () => ({
    ok: true,
    port,
    plugin: {
      connected: connected(),
      lastSeen: plugin.lastSeen || null,
      idleMs: plugin.lastSeen ? Date.now() - plugin.lastSeen : null,
      file: plugin.file,
      page: plugin.page,
      protocol: plugin.protocol,
    },
    expectedProtocol: PROTOCOL,
    queued: queue.length,
    inflight: inflight.size,
  });

  function handOff(res, job) {
    job.sentAt = Date.now();
    json(res, 200, { id: job.id, cmd: job.cmd, args: job.args });
  }

  function dropWaiter(waiter) {
    const i = waiters.indexOf(waiter);
    if (i >= 0) waiters.splice(i, 1);
  }

  /** Closes out a client request, whether it succeeded, failed or timed out. */
  function finish(id, code, body, contentType) {
    const entry = inflight.get(id);
    if (!entry) return;
    inflight.delete(id);
    clearTimeout(entry.timer);
    const ms = Date.now() - entry.started;
    entry.res
      .writeHead(code, { ...cors, 'Content-Type': contentType, 'X-Figma-Ms': String(ms) })
      .end(body);
    log(`${code === 200 ? '✓' : '✗'} ${entry.cmd} — ${ms} ms, ${(body.length / 1024).toFixed(1)} kB`);
  }

  const fail = (id, code, error) => finish(id, code, JSON.stringify({ error }), 'application/json');

  function pull(req, res, url) {
    if (!plugin.seen || !connected()) log('+ plugin connected');
    plugin.seen = true;
    plugin.lastSeen = Date.now();
    plugin.file = url.searchParams.get('file') || plugin.file;
    plugin.page = url.searchParams.get('page') || plugin.page;
    // A plugin from before the handshake sends no `v` at all.
    const v = url.searchParams.get('v');
    plugin.protocol = v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

    const job = queue.shift();
    if (job) return handOff(res, job);

    const waiter = {
      res,
      timer: setTimeout(() => {
        dropWaiter(waiter);
        res.writeHead(204, cors).end();
      }, HOLD),
    };
    waiters.push(waiter);
    req.on('close', () => {
      clearTimeout(waiter.timer);
      dropWaiter(waiter);
    });
  }

  async function result(req, res) {
    const msg = JSON.parse(await readBody(req));
    const id = String(msg.id);
    const entry = inflight.get(id);
    // A late chunk for a job the client already gave up on: acknowledge and drop.
    if (!entry) return json(res, 200, { ok: true, note: 'no longer waiting' });

    if (msg.ok === false) {
      const error = String(msg.error || 'plugin error');
      // A command added without a PROTOCOL bump reaches an older plugin copy as
      // "Unknown command" — that is a stale install, not a plugin bug.
      if (/^Unknown command/.test(error)) {
        fail(id, 409, `The figma-bridge plugin in Figma does not know \`${entry.cmd}\` — it is older than this server. ${reinstall}`);
      } else {
        fail(id, 500, error);
      }
      return json(res, 200, { ok: true });
    }

    entry.chunks[Number(msg.seq) || 0] = String(msg.chunk ?? '');
    if (msg.final) {
      const holes = [...entry.chunks].some((c) => c === undefined);
      if (holes) fail(id, 502, 'answer arrived incomplete');
      // The body IS the answer — wrapping it in an envelope would mean escaping
      // a multi-MB JSON string into another JSON string.
      else finish(id, 200, entry.chunks.join(''), 'application/json');
    }
    return json(res, 200, { ok: true });
  }

  async function rpc(req, res) {
    const msg = JSON.parse(await readBody(req));
    if (!msg.cmd) return json(res, 400, { error: 'missing `cmd`' });

    if (!connected()) {
      return json(res, 503, {
        error:
          'The figma-bridge plugin is not connected. In Figma desktop: Plugins → Development → figma-bridge.' +
          (plugin.seen ? ' It was connected earlier — the plugin window was probably closed.' : ''),
      });
    }

    if (plugin.protocol !== PROTOCOL) {
      return json(res, 409, {
        error: `The figma-bridge plugin in Figma is protocol v${plugin.protocol ?? '0'}, this server expects v${PROTOCOL}. ${reinstall}`,
      });
    }

    const id = String(++seq);
    const job = { id, cmd: msg.cmd, args: msg.args || {}, sentAt: 0 };
    const timeout = Math.min(Number(msg.timeout) || RPC_TIMEOUT, 15 * 60_000);

    inflight.set(id, {
      res,
      chunks: [],
      cmd: msg.cmd,
      started: Date.now(),
      timer: setTimeout(() => {
        const i = queue.indexOf(job);
        if (i >= 0) queue.splice(i, 1);
        fail(
          id,
          504,
          `\`${job.cmd}\` did not answer within ${Math.round(timeout / 1000)}s. ${
            job.sentAt ? 'The plugin took the job — the node may be very large; try a smaller depth.' : 'The plugin never took the job.'
          }`
        );
      }, timeout),
    });

    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      handOff(waiter.res, job);
    } else {
      queue.push(job);
    }
  }

  /** @type {import('node:http').RequestListener} */
  const handler = async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/health') return json(res, 200, health());
      if (url.pathname === '/pull' && req.method === 'GET') return pull(req, res, url);
      if (url.pathname === '/result' && req.method === 'POST') return await result(req, res);
      if (url.pathname === '/rpc' && req.method === 'POST') return await rpc(req, res);
      return json(res, 404, { error: 'unknown endpoint — /pull, /result, /rpc, /health' });
    } catch (err) {
      if (!res.headersSent) json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  };

  /** Releases held polls and pending clients so the servers can close at once. */
  function drain() {
    for (const w of waiters.splice(0)) {
      clearTimeout(w.timer);
      w.res.writeHead(204, cors).end();
    }
    for (const id of [...inflight.keys()]) fail(id, 503, 'The relay is shutting down.');
    queue.length = 0;
  }

  return { handler, drain };
}

/**
 * Listens on both loopback stacks, never a wildcard: the plugin reaches the
 * relay as `localhost`, which Windows resolves to `::1` before `127.0.0.1`.
 *
 * IPv4 is required (clients dial 127.0.0.1). IPv6 is optional on a host without
 * it, but if *something else* holds `[::1]:<port>` the plugin would talk to that
 * instead — so that case fails the whole start rather than half-working.
 *
 * @param {{ port?: number, log?: (line: string) => void }} [options]
 * @returns {Promise<{ servers: import('node:http').Server[], port: number, close: () => Promise<void> }>}
 */
export async function startRelay({ port = PORT, log = (line) => console.log(line) } = {}) {
  const hub = createHub(port, log);

  /** @param {string} host */
  const listen = (host) =>
    new Promise((resolve) => {
      const server = createServer(hub.handler);
      server.once('error', (err) => resolve({ host, server: null, code: /** @type {any} */ (err).code }));
      server.listen(port, host, () => resolve({ host, server, code: null }));
    });

  const [v4, v6] = await Promise.all([listen('127.0.0.1'), listen('::1')]);
  const servers = [v4, v6].filter((r) => r.server).map((r) => r.server);

  const close = async () => {
    hub.drain();
    await Promise.all(
      servers.map(
        (s) =>
          new Promise((resolve) => {
            s.close(() => resolve(undefined));
            s.closeAllConnections();
          })
      )
    );
  };

  const v6Taken = v6.code === 'EADDRINUSE';
  if (!v4.server || v6Taken) {
    await close();
    const which = !v4.server ? `127.0.0.1:${port} (${v4.code})` : `[::1]:${port}`;
    throw new Error(`port ${port} is not available on ${which} — another program is using it. Set FIGMA_BRIDGE_PORT to use a different port.`);
  }
  if (!v6.server) log(`· ::1 unavailable (${v6.code}) — IPv4 only`);
  for (const r of [v4, v6]) if (r.server) log(`listening on ${r.host}:${port}`);

  return { servers, port, close };
}
