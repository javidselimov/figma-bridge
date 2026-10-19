import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { install, pluginPath } from '../bridge/lib/plugin-files.mjs';
import { PROTOCOL } from '../bridge/lib/protocol.mjs';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'fb-plugin-'));

test('install copies exactly the three plugin files and returns the manifest path', async () => {
  const dir = await tmp();
  try {
    const done = await install({ dir, port: 7332 });
    assert.equal(done.manifest, path.join(dir, 'manifest.json'));
    assert.deepEqual((await readdir(dir)).sort(), ['code.js', 'manifest.json', 'ui.html']);
    const manifest = JSON.parse(await readFile(done.manifest, 'utf8'));
    assert.equal(manifest.name, 'figma-bridge');
    assert.deepEqual(manifest.networkAccess.devAllowedDomains, ['http://localhost:7332']);
    assert.equal(pluginPath({ dir }), done.manifest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('reinstall is idempotent and leaves other files alone', async () => {
  const dir = await tmp();
  try {
    await install({ dir, port: 7332 });
    await writeFile(path.join(dir, 'notes.txt'), 'mine');
    const first = await readFile(path.join(dir, 'ui.html'), 'utf8');
    await install({ dir, port: 7332 });
    assert.equal(await readFile(path.join(dir, 'ui.html'), 'utf8'), first);
    assert.equal(await readFile(path.join(dir, 'notes.txt'), 'utf8'), 'mine');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--port rewrites both halves of the plugin, and a default reinstall undoes it', async () => {
  const dir = await tmp();
  try {
    await install({ dir, port: 7444 });
    let manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    let ui = await readFile(path.join(dir, 'ui.html'), 'utf8');
    assert.deepEqual(manifest.networkAccess.devAllowedDomains, ['http://localhost:7444']);
    assert.match(ui, /const BRIDGE = 'http:\/\/localhost:7444';/);
    assert.doesNotMatch(ui, /7332/);

    await install({ dir, port: 7332 });
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    ui = await readFile(path.join(dir, 'ui.html'), 'utf8');
    assert.deepEqual(manifest.networkAccess.devAllowedDomains, ['http://localhost:7332']);
    assert.match(ui, /const BRIDGE = 'http:\/\/localhost:7332';/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pluginPath explains how to install when nothing is there', async () => {
  const dir = await tmp();
  try {
    assert.throws(() => pluginPath({ dir }), /Plugin not installed.*plugin install/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('PROTOCOL is the same number in protocol.mjs, code.js and ui.html', async () => {
  const src = (f) => readFile(new URL(`../bridge/plugin/${f}`, import.meta.url), 'utf8');
  for (const file of ['code.js', 'ui.html']) {
    const m = /const PROTOCOL = (\d+);/.exec(await src(file));
    assert.ok(m, `${file} declares PROTOCOL`);
    assert.equal(Number(m[1]), PROTOCOL, file);
  }
});
