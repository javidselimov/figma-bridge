// The Figma half, run in node:vm against a stub document (helpers/figma-stub.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMMANDS } from '../bridge/lib/commands.mjs';
import { loadPlugin } from './helpers/figma-stub.mjs';
import { sampleDoc } from './helpers/sample-doc.mjs';

const fresh = () => loadPlugin(sampleDoc());

test('ping reports file, page and protocol', async () => {
  const answer = await fresh().run('ping');
  assert.equal(answer.file, 'Sample file');
  assert.equal(answer.page.name, 'Screens');
  assert.equal(answer.protocol, 1);
});

test('screens: frames on the page and inside sections, nothing else', async () => {
  const { screens, count } = await fresh().run('screens', {});
  assert.equal(count, 3);
  assert.deepEqual(screens, [
    { id: '1:1', name: 'Home', type: 'FRAME', page: 'Screens', width: 1440, height: 3200 },
    { id: '1:11', name: 'Login', type: 'FRAME', page: 'Screens', section: 'Flows', width: 375, height: 812 },
    { id: '1:12', name: 'Card', type: 'INSTANCE', page: 'Screens', section: 'Flows', width: 320, height: 200 },
  ]);
});

test('screens across the whole document includes component sets', async () => {
  const { screens } = await fresh().run('screens', { page: '*' });
  assert.deepEqual(
    screens.map((s) => `${s.page}/${s.name}`),
    ['Screens/Home', 'Screens/Login', 'Screens/Card', 'Settings page/Settings', 'Settings page/Button']
  );
});

test('png with maxEdge shrinks the scale to fit the longest edge', async () => {
  const plugin = fresh();
  const answer = await plugin.run('png', { id: '1:1', scale: 2, maxEdge: 1568 });
  assert.ok(Math.abs(answer.scale - 0.49) < 0.001, String(answer.scale));
  assert.equal(answer.requestedScale, 2);
  assert.equal(answer.maxEdge, 1568);
  assert.equal(answer.height, 1568);
  assert.equal(answer.width, 706);
  assert.equal(answer.sourceWidth, 1440);
  assert.equal(answer.sourceHeight, 3200);
  assert.deepEqual(answer.children, [
    { id: '1:2', name: 'Title', type: 'TEXT' },
    { id: '1:3', name: 'Mixed copy', type: 'TEXT' },
  ]);
  assert.equal(typeof answer.base64, 'string');
  assert.deepEqual(plugin.exports.at(-1).opts.constraint, { type: 'SCALE', value: answer.scale });
});

test('png without maxEdge keeps the requested scale; small nodes are never upscaled past it', async () => {
  assert.equal((await fresh().run('png', { id: '1:1', scale: 2 })).scale, 2);
  assert.equal((await fresh().run('png', { id: '1:12', scale: 2, maxEdge: 1568 })).scale, 2);
});

test('serializer output matches the snapshot taken before this feature (FR-013)', async () => {
  const expected = JSON.parse(await readFile(new URL('./fixtures/node-snapshot.json', import.meta.url), 'utf8'));
  assert.deepEqual(await fresh().run('node', { id: '1:1', depth: 3 }), expected);
});

test('a mixed fontSize is omitted rather than guessed', async () => {
  const { nodes } = await fresh().run('node', { id: '1:3', depth: 1 });
  assert.equal('fontSize' in nodes['1:3'].document.style, false);
});

test('unknown nodes and commands fail with a message', async () => {
  await assert.rejects(fresh().run('node', { id: '9:9' }), /Node 9:9 not found/);
  await assert.rejects(fresh().run('nope'), /Unknown command `nope`/);
});

test('read-only: no plugin command except select writes anything (FR-018)', async () => {
  const args = {
    find: { query: 'o', page: '*' },
    node: { id: '1:1', depth: 4 },
    css: { id: '1:1' },
    text: { id: '1:1' },
    svg: { id: '1:1' },
    png: { id: '1:1', maxEdge: 500 },
    index: {},
    screens: { page: '*' },
    sets: { page: '*' },
    components: { page: '*' },
  };
  const plugin = fresh();
  plugin.figma.currentPage.selection = []; // seed through the allowed setter
  const before = plugin.writes.length;

  for (const cmd of COMMANDS.filter((c) => c.where === 'plugin' && c.name !== 'select')) {
    if (cmd.name === 'selection') continue; // needs a selection; covered below
    await assert.doesNotReject(plugin.run(cmd.name, args[cmd.name] || {}), cmd.name);
  }
  assert.equal(plugin.writes.length, before, JSON.stringify(plugin.writes.slice(before)));
});

test('select only moves the page, selection and viewport', async () => {
  const plugin = fresh();
  const answer = await plugin.run('select', { id: '2:1' });
  assert.equal(answer.page, 'Settings page');
  assert.deepEqual(plugin.calls.setCurrentPage, ['2:0']);
  assert.deepEqual(plugin.calls.scrollAndZoom, [['2:1']]);
  assert.deepEqual(plugin.writes, [{ member: 'selection', id: '2:0' }]);

  const selected = await plugin.run('selection', { depth: 1 });
  assert.deepEqual(Object.keys(selected.nodes), ['2:1']);
});

test('the stub really does throw on mutation (guards the guard)', () => {
  const plugin = fresh();
  assert.throws(() => plugin.figma.createFrame(), /mutation: createFrame/);
  assert.throws(() => (plugin.figma.root.children[0].children[0].name = 'x'), /mutation: name/);
  assert.throws(() => plugin.figma.root.children[0].children[0].remove(), /mutation: remove/);
});
