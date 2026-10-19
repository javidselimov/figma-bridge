import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, byName, inputSchema, mcpCommands, normalise, positionals } from '../bridge/lib/commands.mjs';
import { UsageError } from '../bridge/lib/errors.mjs';

test('every command is fully described and uniquely named', () => {
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const c of COMMANDS) {
    assert.ok(c.name && c.summary, c.name);
    assert.ok(['plugin', 'client', 'local'].includes(c.where), c.name);
    assert.equal(typeof c.args, 'object', c.name);
  }
});

test('no command text mentions the private project it came from', () => {
  const text = JSON.stringify(COMMANDS).toLowerCase();
  for (const word of ['cbar', 'template5', 'figma-cbar', 'spec.js', 'gen-icons', 'tools/figma-bridge']) {
    assert.ok(!text.includes(word), word);
  }
});

test('normalise applies defaults and coerces types', () => {
  assert.deepEqual(normalise(byName('find'), { query: 'Btn', limit: '5', bogus: 1 }), { query: 'Btn', limit: 5 });
  assert.deepEqual(normalise(byName('view'), { id: '1:2' }), { id: '1:2', maxEdge: 1568 });
  assert.equal(normalise(byName('svg'), { id: '1', outlineText: 'false' }).outlineText, false);
  assert.equal(normalise(byName('svg'), { id: '1', outlineText: true }).outlineText, true);
  assert.equal(normalise(byName('capture'), { previews: '0' }).previews, false);
});

test('normalise reports usage errors', () => {
  assert.throws(() => normalise(byName('find'), {}), (e) => e instanceof UsageError && /missing required argument `query`/.test(e.message));
  assert.throws(() => normalise(byName('node'), { id: '1', depth: 'deep' }), UsageError);
});

test('inputSchema lists required fields and defaults', () => {
  const schema = inputSchema(byName('find'));
  assert.deepEqual(schema.required, ['query']);
  assert.equal(schema.properties.limit.default, 200);
  assert.equal(inputSchema(byName('ping')).required, undefined);
});

test('local commands are not MCP tools; image commands are', () => {
  const names = mcpCommands().map((c) => c.name);
  for (const local of ['setup', 'plugin', 'serve', 'mcp']) assert.ok(!names.includes(local), local);
  for (const tool of ['screens', 'view', 'capture', 'dump', 'health']) assert.ok(names.includes(tool), tool);
  assert.equal(byName('view').mcp, 'image');
});

test('positionals keep declaration order', () => {
  assert.deepEqual(positionals(byName('plugin')), ['action']);
  assert.deepEqual(positionals(byName('node')), ['id']);
});
