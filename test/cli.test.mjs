// CLI contract: specs/001-npm-figma-bridge/contracts/cli.md

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { startRelay } from '../bridge/relay.mjs';
import { COMMANDS } from '../bridge/lib/commands.mjs';
import { PACKAGE } from '../bridge/lib/protocol.mjs';
import { freePort, startFakePlugin, untilConnected } from './helpers/fake-plugin.mjs';
import { runCli } from './helpers/spawn.mjs';

let root;
let port;

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'fb-cli-'));
  port = await freePort();
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const cli = (args, extra = {}) => runCli(args, { port, root, ...extra });

test('no arguments: usage on stderr, exit 2', async () => {
  const r = await cli([]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /figma-bridge <command>/);
  assert.equal(r.stdout, '');
});

test('--help lists every command and nothing private', async () => {
  const r = await cli(['--help']);
  assert.equal(r.code, 0);
  for (const c of COMMANDS) assert.match(r.stdout, new RegExp(`\\b${c.name}\\b`), c.name);
  assert.doesNotMatch(r.stdout, /cbar/i);
});

test('--version prints the package version', async () => {
  const r = await cli(['--version']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), PACKAGE.version);
});

test('usage errors exit 2 with a message', async () => {
  const unknown = await cli(['nope']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command `nope`/);

  const missing = await cli(['find']);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /missing required argument `query`/);

  const flag = await cli(['node', '1:1', '--bogus']);
  assert.equal(flag.code, 2);
  assert.match(flag.stderr, /Unknown flag `--bogus`/);
});

test('<command> --help shows its flags', async () => {
  const r = await cli(['view', '--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /figma-bridge view <id>/);
  assert.match(r.stdout, /--maxEdge/);
});

test('NO_COLOR keeps escape codes out', async () => {
  const r = await cli(['nope'], { env: { NO_COLOR: '1' } });
  assert.doesNotMatch(r.stdout + r.stderr, /\x1b\[/);
});

test('with no plugin, a read command fails within the wait budget and says what to open', async () => {
  const started = Date.now();
  const r = await cli(['ping']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Plugins → Development → figma-bridge/);
  assert.ok(Date.now() - started < 12_000);
});

test('with a plugin: JSON on stdout, writes confined to the project', async () => {
  const relay = await startRelay({ port, log: () => {} });
  const plugin = startFakePlugin({
    port,
    handlers: {
      pages: () => ({ file: 'Fake file', pages: [{ id: '0:1', name: 'A' }] }),
      node: ({ id }) => ({ name: 'Fake file', nodes: { [id]: { document: { id, name: 'n', type: 'FRAME' } } } }),
    },
  });
  try {
    await untilConnected(port);
    const pages = await cli(['pages']);
    assert.equal(pages.code, 0, pages.stderr);
    assert.deepEqual(JSON.parse(pages.stdout).pages, [{ id: '0:1', name: 'A' }]);

    const saved = await cli(['node', '1:2', '-o', 'out/n.json']);
    assert.equal(saved.code, 0, saved.stderr);
    assert.ok(existsSync(path.join(root, 'out', 'n.json')));

    const escaped = await cli(['node', '1:2', '-o', '../escape.json']);
    assert.equal(escaped.code, 1);
    assert.match(escaped.stderr, /Refusing to write outside/);
  } finally {
    await plugin.stop();
    await relay.close();
  }
});

test('plugin install / path', async () => {
  const dir = path.join(root, 'p');
  const installed = await cli(['plugin', 'install', '--dir', dir]);
  assert.equal(installed.code, 0, installed.stderr);
  const manifest = installed.stdout.trim();
  assert.equal(manifest, path.join(dir, 'manifest.json'));
  assert.ok(existsSync(manifest));
  assert.match(installed.stderr, /Import plugin from manifest/);

  const shown = await cli(['plugin', 'path', '--dir', dir]);
  assert.equal(shown.stdout.trim(), manifest);

  const missing = await cli(['plugin', 'path', '--dir', path.join(root, 'empty')]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /plugin install/);

  const bad = await cli(['plugin', 'wobble']);
  assert.equal(bad.code, 2);
});

test('setup prints the claude mcp add line for this OS', async () => {
  const r = await cli(['setup']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /claude mcp add figma-bridge -s user -- /);
  if (process.platform === 'win32') assert.match(r.stdout, /cmd \/c npx -y @ubuligan\/figma-bridge mcp/);
  else assert.doesNotMatch(r.stdout, /cmd \/c/);
});

test('serve: a running relay is reported, a foreign port holder is an error', async () => {
  const relay = await startRelay({ port, log: () => {} });
  try {
    const r = await cli(['serve']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /already running/);
  } finally {
    await relay.close();
  }

  // Accepts connections and never answers, like an unrelated program would.
  const sockets = new Set();
  const foreign = createServer((s) => {
    sockets.add(s);
    s.on('error', () => {});
  });
  await new Promise((resolve) => foreign.listen(port, '127.0.0.1', () => resolve(undefined)));
  try {
    const r = await cli(['serve']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, new RegExp(`port ${port}`));
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => foreign.close(() => resolve(undefined)));
  }
});
