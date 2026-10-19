// @ts-check
// The command registry — the single place a command is described.
//
// `mcp.mjs` turns each entry into an MCP tool (`figma_<name>` + a JSON Schema
// built from `args`), `cli.mjs` turns the same entry into an argv parser and a
// help screen. A new plugin command means one entry here plus one `case` in
// `plugin/code.js`.
//
// `where` says who does the work:
//   'plugin' — runs inside Figma, one round trip.
//   'client' — composed on this side out of several plugin calls (lib/tasks.mjs).
//   'local'  — never talks to Figma (setup, serving). CLI only, not an MCP tool.
//
// `mcp: 'image'` makes the MCP result an image content block instead of text.

import { UsageError } from './errors.mjs';
import { OUT_DIR } from './output.mjs';

/**
 * @typedef {object} Arg
 * @property {'string'|'number'|'boolean'} type
 * @property {string} desc
 * @property {boolean} [positional] consumed by position on the CLI, in declaration order
 * @property {boolean} [required]
 * @property {*} [default]
 *
 * @typedef {object} Command
 * @property {string} name
 * @property {'plugin'|'client'|'local'} where
 * @property {string} summary
 * @property {Record<string, Arg>} args
 * @property {boolean} [big] 300 s timeout instead of 120 s
 * @property {'svg'|'png'} [artifact] `-o` with that extension writes the artefact itself
 * @property {'text'|'image'} [mcp]
 */

const page = (what = 'page name or id; "*" for the whole document') => ({ type: 'string', desc: what });

/** @type {Command[]} */
export const COMMANDS = [
  {
    name: 'ping',
    where: 'plugin',
    summary: 'Which file and page the plugin is looking at, and what is selected.',
    args: {},
  },
  {
    name: 'pages',
    where: 'plugin',
    summary: 'Every page in the file with its id.',
    args: {},
  },
  {
    name: 'index',
    where: 'plugin',
    summary: 'Top-level nodes of a page — the cheap way to find a node id before dumping it.',
    args: { page: page('page name or id (default: the current page)') },
  },
  {
    name: 'screens',
    where: 'plugin',
    summary:
      'Every screen (a frame, component or instance placed on the page or directly in a section) with its id, page and size.',
    args: { page: page('page name or id; "*" for the whole document (default: the current page)') },
  },
  {
    name: 'find',
    where: 'plugin',
    summary: 'Search nodes by name and type. Query is a substring, or /regex/ for a pattern.',
    args: {
      query: { type: 'string', positional: true, required: true, desc: 'substring, or /regex/i' },
      type: { type: 'string', desc: 'node type filter, comma separated (COMPONENT_SET,FRAME,TEXT…)' },
      page: page('page name or id; "*" searches the whole document'),
      limit: { type: 'number', default: 200, desc: 'stop after this many hits' },
    },
  },
  {
    name: 'node',
    where: 'plugin',
    summary:
      'Serialize a node into the exact shape GET /v1/files/:key/nodes returns, so tools written for the REST API read it unchanged.',
    args: {
      id: { type: 'string', positional: true, required: true, desc: 'node id ("2446:316"), comma separated for several' },
      depth: { type: 'number', default: 5, desc: 'REST semantics: 1 is the node with no children' },
    },
    big: true,
  },
  {
    name: 'selection',
    where: 'plugin',
    summary: 'Same output as `node`, for whatever is selected in Figma right now.',
    args: { depth: { type: 'number', default: 5, desc: 'REST semantics: 1 is the node with no children' } },
    big: true,
  },
  {
    name: 'sets',
    where: 'plugin',
    summary: 'Every component set with its variant axes and variant ids.',
    args: { page: page() },
  },
  {
    name: 'components',
    where: 'plugin',
    summary: 'Every component with its publish key and parent set.',
    args: { page: page() },
  },
  {
    name: 'variables',
    where: 'plugin',
    summary:
      'Figma Variables: collections, modes and values, with aliases resolved. This is the layer the REST API refuses (403, Enterprise-only).',
    args: {},
    big: true,
  },
  {
    name: 'styles',
    where: 'plugin',
    summary: 'Local paint, text, effect and grid styles with their values.',
    args: {},
  },
  {
    name: 'css',
    where: 'plugin',
    summary: "Figma's own computed CSS for a node (getCSSAsync) — padding, radius, type, colour.",
    args: { id: { type: 'string', positional: true, required: true, desc: 'node id' } },
  },
  {
    name: 'text',
    where: 'plugin',
    summary: 'Every TEXT descendant of a node: characters plus type style.',
    args: { id: { type: 'string', positional: true, required: true, desc: 'node id' } },
  },
  {
    name: 'svg',
    where: 'plugin',
    summary: 'Export a node as an SVG string. With -o ending in .svg the markup is written on its own.',
    args: {
      id: { type: 'string', positional: true, required: true, desc: 'node id' },
      outlineText: { type: 'boolean', default: false, desc: 'convert text to paths' },
    },
    artifact: 'svg',
  },
  {
    name: 'png',
    where: 'plugin',
    summary: 'Export a node as PNG (base64 in JSON). With -o ending in .png the decoded image is written.',
    args: {
      id: { type: 'string', positional: true, required: true, desc: 'node id' },
      scale: { type: 'number', default: 2, desc: 'export scale' },
      maxEdge: { type: 'number', desc: 'shrink the scale until the longest edge fits this many pixels' },
    },
    artifact: 'png',
  },
  {
    name: 'view',
    where: 'client',
    summary:
      'See a screen or node as an image, scaled so its longest edge fits maxEdge. Use this to look at a design.',
    args: {
      id: { type: 'string', positional: true, required: true, desc: 'node id' },
      maxEdge: { type: 'number', default: 1568, desc: 'longest edge in pixels' },
    },
    mcp: 'image',
  },
  {
    name: 'select',
    where: 'plugin',
    summary: "Move Figma itself: switch to the node's page, select it and zoom to it. Changes nothing in the file.",
    args: { id: { type: 'string', positional: true, required: true, desc: 'node id' } },
  },

  {
    name: 'capture',
    where: 'client',
    summary:
      'Everything at once into a folder: variables, styles, component sets, the screen list and one preview PNG per screen.',
    args: {
      page: page(),
      out: { type: 'string', default: OUT_DIR, desc: 'target directory, inside the project' },
      depth: { type: 'number', default: 5, desc: 'depth for each component set' },
      previews: { type: 'boolean', default: true, desc: 'export one PNG per screen' },
    },
    big: true,
  },
  {
    name: 'dump',
    where: 'client',
    summary: 'Alias of capture.',
    args: {
      page: page(),
      out: { type: 'string', default: OUT_DIR, desc: 'target directory, inside the project' },
      depth: { type: 'number', default: 5, desc: 'depth for each component set' },
      previews: { type: 'boolean', default: true, desc: 'export one PNG per screen' },
    },
    big: true,
  },
  {
    name: 'icons',
    where: 'client',
    summary: 'Write one .svg per icon, named from an icon map or from the component name.',
    args: {
      map: {
        type: 'string',
        desc: 'an icon-map.json ({ "Outline/General/Calendar": { id, kit } }); each entry is exported as <kit>.svg',
      },
      page: page('without --map: export the components on this page'),
      match: { type: 'string', desc: 'without --map: only components whose name matches (substring or /regex/)' },
      out: { type: 'string', default: `${OUT_DIR}/svg`, desc: 'target directory, inside the project' },
    },
  },
  {
    name: 'health',
    where: 'client',
    summary: 'Is the relay up, is the plugin connected, what is queued. Never touches Figma.',
    args: {},
  },

  {
    name: 'setup',
    where: 'local',
    summary: 'First-time checklist: Node version, port, plugin install state and the exact `claude mcp add` line. Changes nothing.',
    args: {},
  },
  {
    name: 'plugin',
    where: 'local',
    summary: 'install: copy the Figma plugin to a stable folder and print its manifest path. path: print that path.',
    args: {
      action: { type: 'string', positional: true, required: true, desc: 'install | path' },
      dir: { type: 'string', desc: 'plugin folder (default: ~/.figma-bridge/plugin)' },
      port: { type: 'number', desc: 'relay port the plugin should call (default: 7332 or FIGMA_BRIDGE_PORT)' },
    },
  },
  {
    name: 'serve',
    where: 'local',
    summary: 'Run the relay in the foreground. Only needed for CLI use without Claude Code running.',
    args: {},
  },
  {
    name: 'mcp',
    where: 'local',
    summary: 'Run the MCP server on stdio. This is what `claude mcp add` launches.',
    args: {},
  },
];

/** @param {string} name */
export const byName = (name) => COMMANDS.find((c) => c.name === name);

/** The commands exposed as MCP tools. */
export const mcpCommands = () => COMMANDS.filter((c) => c.where !== 'local');

/** Positional args, in declaration order — the order the CLI consumes them. */
export const positionals = (cmd) =>
  Object.entries(cmd.args).filter(([, a]) => a.positional).map(([k]) => k);

/**
 * Applies declared defaults, coerces types and drops keys the command does not
 * know about.
 * @param {Command} cmd
 * @param {Record<string, any>} args
 */
export function normalise(cmd, args) {
  const out = {};
  for (const [key, spec] of Object.entries(cmd.args)) {
    let value = args[key];
    if (value === undefined || value === '') {
      if (spec.default !== undefined) out[key] = spec.default;
      else if (spec.required) throw new UsageError(`${cmd.name}: missing required argument \`${key}\``);
      continue;
    }
    if (spec.type === 'number') {
      value = Number(value);
      if (!Number.isFinite(value)) throw new UsageError(`${cmd.name}: \`${key}\` must be a number`);
    }
    if (spec.type === 'boolean') value = value !== false && value !== 'false' && value !== '0';
    out[key] = value;
  }
  return out;
}

/** MCP `tools/list` input schema for one command. */
export function inputSchema(cmd, extra = {}) {
  const properties = {};
  const required = [];
  for (const [key, spec] of Object.entries(cmd.args)) {
    properties[key] = { type: spec.type, description: spec.desc };
    if (spec.default !== undefined) properties[key].default = spec.default;
    if (spec.required) required.push(key);
  }
  Object.assign(properties, extra);
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}
