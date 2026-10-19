// MCP contract: specs/001-npm-figma-bridge/contracts/mcp-tools.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mcpCommands } from '../bridge/lib/commands.mjs';
import { PACKAGE } from '../bridge/lib/protocol.mjs';
import { PNG_1PX, freePort, startFakePlugin, untilConnected } from './helpers/fake-plugin.mjs';
import { startMcp } from './helpers/spawn.mjs';

/** A fresh server on a fresh port with a fresh output root. */
async function session(fn) {
  const port = await freePort();
  const root = await mkdtemp(path.join(os.tmpdir(), 'fb-mcp-'));
  const mcp = startMcp({ port, root });
  try {
    await fn({ mcp, port, root });
  } finally {
    await mcp.stop();
    await rm(root, { recursive: true, force: true });
  }
}

const call = (mcp, name, args = {}) => mcp.request('tools/call', { name, arguments: args });

test('initialize negotiates the revision and names the server', async () => {
  await session(async ({ mcp }) => {
    const known = await mcp.request('initialize', { protocolVersion: '2025-03-26', capabilities: {} });
    assert.equal(known.result.protocolVersion, '2025-03-26');
    assert.deepEqual(known.result.serverInfo, { name: 'figma-bridge', version: PACKAGE.version });
    assert.deepEqual(known.result.capabilities, { tools: {} });
    assert.doesNotMatch(known.result.instructions, /CBAR/i);

    const unknown = await mcp.request('initialize', { protocolVersion: '1999-01-01' });
    assert.equal(unknown.result.protocolVersion, '2025-06-18');
  });
});

test('tools/list is exactly the non-local commands', async () => {
  await session(async ({ mcp }) => {
    const { result } = await mcp.request('tools/list', {});
    assert.deepEqual(
      result.tools.map((t) => t.name).sort(),
      mcpCommands().map((c) => `figma_${c.name}`).sort()
    );
    const view = result.tools.find((t) => t.name === 'figma_view');
    assert.deepEqual(view.inputSchema.required, ['id']);
    assert.equal(view.inputSchema.properties.maxEdge.default, 1568);
    const node = result.tools.find((t) => t.name === 'figma_node');
    assert.match(node.inputSchema.properties.out.description, /output root/);
  });
});

test('health without a plugin says how to connect; unknown methods are -32601', async () => {
  await session(async ({ mcp }) => {
    await mcp.request('initialize', {});
    const health = await call(mcp, 'figma_health');
    assert.match(health.result.content[0].text, /NOT connected/);
    const missing = await mcp.request('nope/nope', {});
    assert.equal(missing.error.code, -32601);
    mcp.notify('notifications/initialized', {});
    assert.deepEqual((await mcp.request('ping', {})).result, {});
  });
});

test('figma_view returns an image block plus a description', async () => {
  await session(async ({ mcp, port }) => {
    await mcp.request('initialize', {});
    const plugin = startFakePlugin({
      port,
      handlers: {
        png: (args) => ({
          id: args.id,
          name: 'Login',
          type: 'FRAME',
          scale: 0.49,
          requestedScale: 2,
          maxEdge: args.maxEdge,
          width: 706,
          height: 1568,
          sourceWidth: 1440,
          sourceHeight: 3200,
          children: [{ id: '1:7', name: 'Form', type: 'FRAME' }],
          bytes: 68,
          base64: PNG_1PX,
        }),
      },
    });
    try {
      await untilConnected(port);
      const { result } = await call(mcp, 'figma_view', { id: '1:2' });
      assert.equal(result.isError, undefined, JSON.stringify(result));
      assert.deepEqual(result.content[0], { type: 'image', mimeType: 'image/png', data: PNG_1PX });
      assert.equal(result.content[1].type, 'text');
      assert.match(result.content[1].text, /Login \(FRAME\) — 1440×3200 → exported 706×1568 at scale 0\.49/);
      assert.match(result.content[1].text, /Form 1:7/);
    } finally {
      await plugin.stop();
    }
  });
});

test('a large answer spills to the output root, not the package', async () => {
  await session(async ({ mcp, port, root }) => {
    await mcp.request('initialize', {});
    const plugin = startFakePlugin({ port, handlers: { variables: () => ({ blob: 'v'.repeat(80_000) }) } });
    try {
      await untilConnected(port);
      const { result } = await call(mcp, 'figma_variables');
      const text = result.content[0].text;
      assert.match(text, /too large to return inline/);
      assert.ok(text.includes(path.join(root, 'figma-bridge-out', 'variables.json')), text);
    } finally {
      await plugin.stop();
    }
  });
});

test('writing outside the project is refused as a tool error', async () => {
  await session(async ({ mcp, port }) => {
    await mcp.request('initialize', {});
    const plugin = startFakePlugin({ port, handlers: { ping: () => ({ ok: 1 }) } });
    try {
      await untilConnected(port);
      const { result } = await call(mcp, 'figma_ping', { out: '../escape.json' });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /Refusing to write outside/);
    } finally {
      await plugin.stop();
    }
  });
});

test('a plugin that appears shortly after a fresh relay is waited for', async () => {
  await session(async ({ mcp, port }) => {
    await mcp.request('initialize', {});
    const plugin = startFakePlugin({ port, startDelayMs: 1000, handlers: { ping: () => ({ file: 'Late' }) } });
    try {
      const { result } = await call(mcp, 'figma_ping');
      assert.equal(result.isError, undefined, result.content[0].text);
      assert.deepEqual(JSON.parse(result.content[0].text), { file: 'Late' });
    } finally {
      await plugin.stop();
    }
  });
});

test('stdout carries JSON-RPC frames only', async () => {
  await session(async ({ mcp }) => {
    await mcp.request('initialize', {});
    await mcp.request('tools/list', {});
    await call(mcp, 'figma_health');
    assert.ok(mcp.lines.length >= 3);
    for (const line of mcp.lines) {
      const msg = JSON.parse(line);
      assert.equal(msg.jsonrpc, '2.0');
    }
  });
});
