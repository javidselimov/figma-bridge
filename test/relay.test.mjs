import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startRelay } from '../bridge/relay.mjs';
import { freePort, startFakePlugin, untilConnected } from './helpers/fake-plugin.mjs';

const quiet = () => {};

/** One relay per test file run; tests that need no plugin use their own. */
let port;
let relay;

before(async () => {
  port = await freePort();
  relay = await startRelay({ port, log: quiet });
});

after(async () => {
  await relay.close();
});

const url = (p) => `http://127.0.0.1:${port}${p}`;
const rpc = (cmd, args = {}, timeout) =>
  fetch(url('/rpc'), { method: 'POST', body: JSON.stringify({ cmd, args, timeout }) });

/** Runs `fn` with a fake plugin attached, detaching it afterwards. */
async function withPlugin(options, fn) {
  const plugin = startFakePlugin({ port, ...options });
  try {
    await untilConnected(port);
    return await fn(plugin);
  } finally {
    await plugin.stop();
  }
}

test('health before any plugin: up, not connected', async () => {
  const fresh = await freePort();
  const r = await startRelay({ port: fresh, log: quiet });
  try {
    const state = await (await fetch(`http://127.0.0.1:${fresh}/health`)).json();
    assert.equal(state.ok, true);
    assert.equal(state.port, fresh);
    assert.equal(state.plugin.connected, false);
    assert.equal(state.plugin.lastSeen, null);
    assert.equal(state.expectedProtocol, 1);
    const res = await fetch(`http://127.0.0.1:${fresh}/rpc`, { method: 'POST', body: JSON.stringify({ cmd: 'ping' }) });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /Plugins → Development → figma-bridge/);
  } finally {
    await r.close();
  }
});

test('round trip returns the handler output as the body', async () => {
  await withPlugin({ handlers: { ping: () => ({ file: 'F', n: 1 }) } }, async () => {
    const res = await rpc('ping');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { file: 'F', n: 1 });
    assert.ok(res.headers.get('x-figma-ms') !== null);
    const state = await (await fetch(url('/health'))).json();
    assert.equal(state.plugin.connected, true);
    assert.equal(state.plugin.file, 'Fake file');
    assert.equal(state.plugin.protocol, 1);
  });
});

test('a multi-chunk answer is reassembled byte for byte', async () => {
  const big = { blob: 'x'.repeat(10_000) + 'ğ✓' };
  await withPlugin({ chunkSize: 1024, handlers: { node: () => big } }, async () => {
    const res = await rpc('node', { id: '1:1' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), big);
  });
});

test('a plugin error becomes 500 with its message', async () => {
  await withPlugin({ handlers: { css: () => { throw new Error('GROUP nodes have no CSS.'); } } }, async () => {
    const res = await rpc('css', { id: '1:1' });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, 'GROUP nodes have no CSS.');
  });
});

test('an older plugin that does not know a command gives 409 with the fix', async () => {
  await withPlugin({ handlers: {} }, async () => {
    const res = await rpc('screens');
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /plugin install/);
  });
});

test('protocol mismatch: 409 on rpc, reported by health', async () => {
  await withPlugin({ protocol: 0, handlers: { ping: () => ({}) } }, async () => {
    const state = await (await fetch(url('/health'))).json();
    assert.equal(state.plugin.protocol, 0);
    assert.equal(state.expectedProtocol, 1);
    const res = await rpc('ping');
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /protocol v0.*expects v1.*plugin install/);
  });
});

test('a plugin from before the handshake (no v) is refused too', async () => {
  await withPlugin({ protocol: null, handlers: { ping: () => ({}) } }, async () => {
    const res = await rpc('ping');
    assert.equal(res.status, 409);
  });
});

test('a job the plugin never answers times out with 504', async () => {
  await withPlugin({ handlers: { slow: () => new Promise((r) => setTimeout(() => r({}), 2000)) } }, async () => {
    const res = await rpc('slow', {}, 300);
    assert.equal(res.status, 504);
    assert.match((await res.json()).error, /did not answer within/);
  });
});

test('OPTIONS is 204, unknown paths are 404, bad JSON is 400', async () => {
  assert.equal((await fetch(url('/rpc'), { method: 'OPTIONS' })).status, 204);
  assert.equal((await fetch(url('/nope'))).status, 404);
  assert.equal((await fetch(url('/rpc'), { method: 'POST', body: '{nope' })).status, 400);
  assert.equal((await fetch(url('/rpc'), { method: 'POST', body: '{}' })).status, 400);
});

test('binds loopback only (FR-019)', () => {
  assert.ok(relay.servers.length >= 1);
  for (const server of relay.servers) {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    assert.ok(['127.0.0.1', '::1'].includes(address.address), address.address);
  }
});

test('close() releases the port', async () => {
  const p = await freePort();
  const first = await startRelay({ port: p, log: quiet });
  await first.close();
  const second = await startRelay({ port: p, log: quiet });
  await second.close();
});

test('a port held by another relay fails to start, naming the port', async () => {
  const p = await freePort();
  const first = await startRelay({ port: p, log: quiet });
  try {
    await assert.rejects(startRelay({ port: p, log: quiet }), new RegExp(`port ${p}.*FIGMA_BRIDGE_PORT`));
  } finally {
    await first.close();
  }
});
