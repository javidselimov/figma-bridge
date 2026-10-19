import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultOut, outputRoot, resolveInside, writeOut } from '../bridge/lib/output.mjs';

let root;
const saved = process.env.FIGMA_BRIDGE_ROOT;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'fb-out-'));
  process.env.FIGMA_BRIDGE_ROOT = root;
});

afterEach(async () => {
  if (saved === undefined) delete process.env.FIGMA_BRIDGE_ROOT;
  else process.env.FIGMA_BRIDGE_ROOT = saved;
  await rm(root, { recursive: true, force: true });
});

test('FIGMA_BRIDGE_ROOT overrides the working directory', () => {
  assert.equal(outputRoot(), path.resolve(root));
  delete process.env.FIGMA_BRIDGE_ROOT;
  assert.equal(outputRoot(), process.cwd());
});

test('default output folder sits inside the root', () => {
  assert.equal(defaultOut('a.json'), path.join(root, 'figma-bridge-out', 'a.json'));
});

test('a relative path inside the root is written, parents created', async () => {
  const file = await writeOut('deep/er/x.json', '{}');
  assert.equal(file, path.join(root, 'deep', 'er', 'x.json'));
  assert.equal(await readFile(file, 'utf8'), '{}');
});

test('an absolute path inside the root is allowed', async () => {
  const file = await writeOut(path.join(root, 'abs.txt'), 'ok');
  assert.equal(await readFile(file, 'utf8'), 'ok');
});

test('../ escaping the root is refused', async () => {
  await assert.rejects(writeOut('../escape.json', 'x'), /Refusing to write outside/);
  await assert.rejects(writeOut('a/../../escape.json', 'x'), /Refusing to write outside/);
});

test('an absolute path elsewhere is refused', () => {
  assert.throws(() => resolveInside(path.join(os.tmpdir(), 'elsewhere.json')), /Refusing to write outside/);
});

test('a sibling sharing the prefix is not inside', () => {
  assert.throws(() => resolveInside(`${root}-evil${path.sep}x.json`), /Refusing to write outside/);
});

test('a name that merely starts with dots stays inside', () => {
  assert.equal(resolveInside('..hidden'), path.join(root, '..hidden'));
});

test('drive-letter case does not matter on Windows', { skip: process.platform !== 'win32' }, () => {
  const flipped = root[0] === root[0].toUpperCase() ? root[0].toLowerCase() + root.slice(1) : root[0].toUpperCase() + root.slice(1);
  assert.doesNotThrow(() => resolveInside(path.join(flipped, 'x.json')));
});
