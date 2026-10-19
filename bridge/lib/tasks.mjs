// @ts-check
// The work that is neither protocol nor argument parsing: saving an answer,
// the composite commands that are several plugin calls in a trench coat, and
// the plain-text status reports.
//
// Both front doors use these — the CLI prints the lines, the MCP server
// collects them into a tool result — so `capture` behaves identically whether
// a human or a model asked for it. Nothing here writes to the console itself.

import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BridgeError } from './errors.mjs';
import { shown, writeOut } from './output.mjs';
import { FIGMA_IMPORT, FIGMA_RUN, installedManifest, defaultPluginDir } from './plugin-files.mjs';
import { NPX, PACKAGE, PROTOCOL } from './protocol.mjs';
import { call, callJSON, currentPort, health, kb, slug } from './rpc.mjs';

const PREVIEW_EDGE = 1568;

/**
 * Writes an answer to `outFile`. Artifact commands (`svg`, `png`) write the
 * thing itself when the extension asks for it, the JSON envelope otherwise.
 * @returns {Promise<{file: string, bytes: number}>}
 */
export async function saveAnswer(cmd, text, outFile) {
  const lower = outFile.toLowerCase();

  if (cmd.artifact === 'svg' && lower.endsWith('.svg')) {
    const { svg } = JSON.parse(text);
    return { file: await writeOut(outFile, svg), bytes: Buffer.byteLength(svg) };
  }
  if ((cmd.artifact === 'png' || cmd.mcp === 'image') && lower.endsWith('.png')) {
    const buf = Buffer.from(JSON.parse(text).base64, 'base64');
    return { file: await writeOut(outFile, buf), bytes: buf.length };
  }

  return { file: await writeOut(outFile, text), bytes: Buffer.byteLength(text) };
}

/** `foo` is a substring match; `/foo/i` is a regular expression. */
function matcher(pattern) {
  if (!pattern) return () => true;
  const re = /^\/(.*)\/([a-z]*)$/.exec(pattern);
  if (re) {
    const rx = new RegExp(re[1], re[2]);
    return (name) => rx.test(name);
  }
  const needle = pattern.toLowerCase();
  return (name) => name.toLowerCase().includes(needle);
}

/**
 * One node as an image, sized for a vision model. Returns the PNG answer text
 * (for `-o`) plus the parsed metadata and base64.
 */
export async function view(args) {
  const { text } = await call('png', { id: args.id, scale: 2, maxEdge: args.maxEdge }, { timeout: 300_000 });
  const data = JSON.parse(text);
  const children = (data.children || []).map((c) => `${c.name} ${c.id}`).join(', ');
  const line =
    `${data.name} (${data.type}) — ${data.sourceWidth}×${data.sourceHeight} → exported ` +
    `${data.width}×${data.height} at scale ${Number(data.scale.toFixed(3))}` +
    (children ? `. Children: ${children}` : '');
  return { text, line, base64: data.base64, data };
}

/**
 * Everything about a page (or the file) in one folder: the data files `dump`
 * always wrote, plus the screen list and one preview PNG per screen.
 * Ends with `capture.json`, so a folder that has one is a finished capture.
 */
export async function capture(args, log) {
  const dir = args.out;
  let files = 0;
  let total = 0;

  const save = async (name, data) => {
    const file = await writeOut(path.join(dir, name), data);
    const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    files++;
    total += bytes;
    log(`✓ ${shown(file)} — ${kb(bytes)}`);
    return file;
  };

  const { data: ping } = await callJSON('ping');
  const scope = args.page === '*' ? 'whole document' : args.page || ping.page.name;
  log(`${ping.file} · ${scope}`);

  await save('variables.json', (await call('variables', {}, { timeout: 300_000 })).text);
  await save('styles.json', (await call('styles')).text);
  if (args.page !== '*') await save('index.json', (await call('index', { page: args.page })).text);

  const setsText = (await call('sets', { page: args.page }, { timeout: 300_000 })).text;
  await save('sets.json', setsText);

  const { sets } = JSON.parse(setsText);
  log(`${sets.length} component set${sets.length === 1 ? '' : 's'} at depth ${args.depth}`);

  const seen = new Set();
  for (const set of sets) {
    let name = slug(set.name);
    while (seen.has(name)) name += '-2'; // two pages may hold sets with one name
    seen.add(name);
    const { text } = await call('node', { id: set.id, depth: args.depth }, { timeout: 300_000 });
    await save(`${name}-set.json`, text);
  }

  const screensText = (await call('screens', { page: args.page }, { timeout: 300_000 })).text;
  await save('screens.json', screensText);
  const { screens } = JSON.parse(screensText);

  const failures = [];
  let previews = 0;
  if (args.previews) {
    log(`${screens.length} screen preview${screens.length === 1 ? '' : 's'} at ≤ ${PREVIEW_EDGE} px`);
    for (const screen of screens) {
      try {
        const { text } = await call('png', { id: screen.id, scale: 2, maxEdge: PREVIEW_EDGE }, { timeout: 300_000 });
        const png = Buffer.from(JSON.parse(text).base64, 'base64');
        await save(path.join('previews', slug(screen.page), `${slug(screen.name)}--${slug(screen.id)}.png`), png);
        previews++;
      } catch (err) {
        failures.push(`✗ ${screen.name} (${screen.id}): ${err.message}`);
      }
    }
    failures.forEach(log);
  }

  const manifest = {
    file: ping.file,
    page: args.page || ping.page.name,
    createdAt: new Date().toISOString(),
    package: PACKAGE.version,
    protocol: PROTOCOL,
    counts: { sets: sets.length, screens: screens.length, previews, failed: failures.length },
  };
  const last = await save('capture.json', `${JSON.stringify(manifest, null, 2)}\n`);

  const folder = path.dirname(last);
  log(`${files} files, ${kb(total)} → ${folder}`);
  return { files, bytes: total, dir: folder, ...manifest.counts };
}

/**
 * One .svg per icon. With `--map` the names come from an icon-map.json
 * ({ "Outline/General/Calendar": {id, kit} }); without one, every component on
 * the page is exported under its own name.
 */
export async function icons(args, log) {
  const targets = [];

  if (args.map) {
    const map = JSON.parse(await readFile(path.resolve(args.map), 'utf8'));
    for (const [figmaName, entry] of Object.entries(map)) {
      if (!entry || !entry.id) continue;
      // `?` shows up in hand-made maps wherever the mapping was still a guess.
      const stem = String(entry.kit || figmaName).replace(/[^A-Za-z0-9._-]/g, '_');
      targets.push({ id: entry.id, stem });
    }
  } else {
    const match = matcher(args.match);
    const { data } = await callJSON('components', { page: args.page }, { timeout: 300_000 });
    for (const component of data.components) {
      if (match(component.name)) {
        targets.push({ id: component.id, stem: component.name.replace(/[^A-Za-z0-9._-]/g, '_') });
      }
    }
  }

  if (!targets.length) throw new BridgeError('Nothing matched — check --page/--match, or pass --map.', 'bad');
  log(`${targets.length} icons → ${args.out}`);

  const failures = [];
  for (const target of targets) {
    try {
      const { svg } = JSON.parse((await call('svg', { id: target.id })).text);
      const file = await writeOut(path.join(args.out, `${target.stem}.svg`), svg);
      log(`✓ ${shown(file)} — ${kb(Buffer.byteLength(svg))}`);
    } catch (err) {
      failures.push(`✗ ${target.stem} (${target.id}): ${err.message}`);
    }
  }
  failures.forEach(log);
  if (failures.length) log(`${failures.length} of ${targets.length} failed.`);
  return { written: targets.length - failures.length, failed: failures.length };
}

/** How to get the plugin running, given whether it has been installed yet. */
function pluginHint() {
  const manifest = installedManifest();
  return manifest
    ? `in ${FIGMA_RUN} (if it is not listed: ${FIGMA_IMPORT} → ${manifest})`
    : `run \`${NPX} plugin install\`, then ${FIGMA_IMPORT}`;
}

/** Plain-text state of the relay — the first thing to check when nothing works. */
export async function healthReport() {
  const state = await health(2000);
  if (!state) {
    return `relay:   not running on port ${currentPort()} — it starts with Claude Code or any CLI command (or \`${NPX} serve\`)`;
  }
  const p = state.plugin;
  const lines = [
    `relay:   up on 127.0.0.1:${state.port}`,
    p.connected ? `plugin:  connected · ${p.file} · ${p.page}` : `plugin:  NOT connected — ${pluginHint()}`,
  ];
  if (p.connected && p.protocol !== state.expectedProtocol) {
    lines.push(
      `warning: plugin is protocol v${p.protocol ?? 0}, server expects v${state.expectedProtocol} — run \`${NPX} plugin install\` and re-run the plugin`
    );
  }
  lines.push(`queued:  ${state.queued} waiting, ${state.inflight} in flight`);
  return lines.join('\n');
}

/** Is `port` free, ours, or someone else's? */
async function portStatus(port) {
  const state = await health(1000);
  if (state) return `in use by a figma-bridge relay (plugin ${state.plugin.connected ? 'connected' : 'not connected'})`;
  const free = await new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
  return free ? 'free' : 'HELD BY ANOTHER PROGRAM — set FIGMA_BRIDGE_PORT and reinstall the plugin with --port';
}

/** First-time checklist. Reads only; changes nothing on disk. */
export async function setupReport() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 12);
  const manifest = installedManifest();
  const port = currentPort();
  const add =
    process.platform === 'win32'
      ? `claude mcp add figma-bridge -s user -- cmd /c npx -y ${PACKAGE.name} mcp`
      : `claude mcp add figma-bridge -s user -- npx -y ${PACKAGE.name} mcp`;

  return [
    `figma-bridge ${PACKAGE.version} setup`,
    '',
    `node:    ${process.versions.node} ${nodeOk ? '✓' : '✗ needs 22.12 or newer'}`,
    `port:    ${port} — ${await portStatus(port)}`,
    `plugin:  ${manifest ? `installed → ${manifest}` : `not installed in ${defaultPluginDir()}`}`,
    '',
    'Steps:',
    `  1. ${manifest ? '(done) ' : ''}${NPX} plugin install`,
    `  2. ${FIGMA_IMPORT}${manifest ? ` → ${manifest}` : ''}`,
    `  3. ${add}`,
    `  4. ${FIGMA_RUN}, then ask Claude: "is Figma connected?"`,
  ].join('\n');
}
