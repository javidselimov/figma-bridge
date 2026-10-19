// `capture` in-process against a relay on a free port (never 7332) and a fake plugin.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startRelay } from '../bridge/relay.mjs';
import { usePort } from '../bridge/lib/rpc.mjs';
import { capture } from '../bridge/lib/tasks.mjs';
import { PNG_1PX, freePort, startFakePlugin, untilConnected } from './helpers/fake-plugin.mjs';

let port;
let relay;
let root;
const savedRoot = process.env.FIGMA_BRIDGE_ROOT;

before(async () => {
  port = await freePort();
  usePort(port);
  relay = await startRelay({ port, log: () => {} });
  root = await mkdtemp(path.join(os.tmpdir(), 'fb-capture-'));
  process.env.FIGMA_BRIDGE_ROOT = root;
});

after(async () => {
  await relay.close();
  await rm(root, { recursive: true, force: true });
  if (savedRoot === undefined) delete process.env.FIGMA_BRIDGE_ROOT;
  else process.env.FIGMA_BRIDGE_ROOT = savedRoot;
});

/** A plugin that knows `nSets` sets and `nScreens` screens on page "A". */
function handlers({ nSets = 1, nScreens = 2 } = {}) {
  const sets = Array.from({ length: nSets }, (_, i) => ({ id: `5:${i}`, name: i === 0 ? 'Button' : `Set ${i}` }));
  const screens = Array.from({ length: nScreens }, (_, i) => ({
    id: `1:${i + 1}`,
    name: `Screen ${i + 1}`,
    type: 'FRAME',
    page: 'A',
    width: 375,
    height: 812,
  }));
  return {
    ping: () => ({ file: 'Fake file', page: { id: '0:1', name: 'A' } }),
    variables: () => ({ collections: [], count: 0, variables: [] }),
    styles: () => ({ paint: [], text: [], effect: [], grid: [] }),
    index: () => ({ page: { id: '0:1', name: 'A' }, nodes: [] }),
    sets: () => ({ count: sets.length, sets }),
    node: ({ id }) => ({ name: 'Fake file', nodes: { [id]: { document: { id, name: 'set', type: 'COMPONENT_SET' } } } }),
    screens: () => ({ count: screens.length, screens }),
    png: ({ id }) => ({ id, name: 'x', type: 'FRAME', scale: 1, width: 1, height: 1, base64: PNG_1PX }),
  };
}

async function withPlugin(options, fn) {
  const plugin = startFakePlugin({ port, handlers: handlers(options) });
  try {
    await untilConnected(port);
    return await fn(plugin);
  } finally {
    await plugin.stop();
  }
}

test('capture writes the documented folder layout with previews', async () => {
  await withPlugin({}, async () => {
    const lines = [];
    const summary = await capture({ page: 'A', out: 'cap', depth: 2, previews: true }, (l) => lines.push(l));
    const dir = path.join(root, 'cap');
    assert.equal(summary.dir, dir);
    for (const f of ['capture.json', 'variables.json', 'styles.json', 'index.json', 'sets.json', 'button-set.json', 'screens.json']) {
      assert.ok(existsSync(path.join(dir, f)), f);
    }
    const manifest = JSON.parse(await readFile(path.join(dir, 'capture.json'), 'utf8'));
    assert.equal(manifest.counts.screens, 2);
    assert.equal(manifest.counts.previews, 2);
    assert.equal(manifest.protocol, 1);
    assert.equal(manifest.file, 'Fake file');
    const png = await readFile(path.join(dir, 'previews', 'a', 'screen-1--1-1.png'));
    assert.deepEqual(png, Buffer.from(PNG_1PX, 'base64'));
    assert.ok(lines.some((l) => /2 screen previews/.test(l)));
  });
});

test('previews: false skips the images', async () => {
  await withPlugin({}, async () => {
    await capture({ page: 'A', out: 'nopreview', depth: 2, previews: false }, () => {});
    const dir = path.join(root, 'nopreview');
    assert.ok(existsSync(path.join(dir, 'screens.json')));
    assert.ok(!(await readdir(dir)).includes('previews'));
  });
});

test('capture refuses an output folder outside the project', async () => {
  await withPlugin({}, async () => {
    await assert.rejects(capture({ page: 'A', out: '../outside', depth: 2, previews: false }, () => {}), /Refusing to write outside/);
  });
});

test('client-side overhead for 50 screens and 10 sets stays small (SC-005)', async () => {
  await withPlugin({ nSets: 10, nScreens: 50 }, async () => {
    const started = Date.now();
    const summary = await capture({ page: 'A', out: 'big', depth: 2, previews: true }, () => {});
    const ms = Date.now() - started;
    assert.equal(summary.previews, 50);
    assert.ok(ms < 10_000, `${ms} ms`);
  });
});
