// @ts-check
// Runs `bridge/plugin/code.js` in a `node:vm` context against a hand-built
// `figma` global, so the plugin half is testable without Figma.
//
// Every node is a Proxy that throws on writes and on the mutating methods the
// plugin API offers. That is how the read-only promise (FR-018) is pinned: a
// command that edits the document fails its test instead of passing quietly.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../bridge/plugin/code.js', import.meta.url), 'utf8');

/** Shared with sample docs so `figma.mixed` comparisons hold. */
export const MIXED = Symbol('mixed');

const MUTATORS = [
  'remove',
  'appendChild',
  'insertChild',
  'resize',
  'resizeWithoutConstraints',
  'setPluginData',
  'setSharedPluginData',
  'setRelaunchData',
];

/**
 * @typedef {Record<string, any> & { id: string, name: string, type: string, children?: Spec[] }} Spec
 */

/**
 * @param {{ file?: string, pages: Spec[], currentPage?: number }} doc
 */
export function loadPlugin(doc) {
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {{ member: string, id: string }[]} */
  const writes = [];
  /** @type {any[]} */
  const exports = [];
  const calls = { setCurrentPage: [], scrollAndZoom: [] };
  /** @type {any[]} */
  const posted = [];

  /** Turns a spec into a read-only node; `allow` names the props a test may see written. */
  function build(spec, parent, allow = []) {
    const { children, ...props } = spec;
    const target = {
      ...props,
      parent,
      exportAsync: async (opts) => {
        // Copied into this realm: objects made inside the vm fail deepStrictEqual.
        exports.push({ id: spec.id, opts: JSON.parse(JSON.stringify(opts)) });
        return new Uint8Array([137, 80, 78, 71]);
      },
      getCSSAsync: async () => ({ width: `${props.absoluteBoundingBox?.width ?? 0}px` }),
      loadAsync: async () => {},
      findAllWithCriteria: ({ types }) => {
        const out = [];
        const visit = (n) => {
          for (const c of n.children || []) {
            if (types.includes(c.type)) out.push(c);
            visit(c);
          }
        };
        visit(proxy);
        return out;
      },
    };
    for (const m of MUTATORS) {
      target[m] = () => {
        throw new Error(`mutation: ${m}`);
      };
    }
    const proxy = new Proxy(target, {
      set(t, key, value) {
        if (allow.includes(String(key))) {
          writes.push({ member: String(key), id: spec.id });
          t[key] = value;
          return true;
        }
        throw new Error(`mutation: ${String(key)}`);
      },
    });
    if (children) target.children = children.map((c) => build(c, proxy));
    byId.set(spec.id, proxy);
    return proxy;
  }

  const root = { name: doc.file || 'Stub file', type: 'DOCUMENT', children: [] };
  root.children = doc.pages.map((p) => build({ selection: [], ...p, type: 'PAGE' }, root, ['selection']));

  const creator = (name) => () => {
    throw new Error(`mutation: ${name}`);
  };

  const figma = {
    mixed: MIXED,
    editorType: 'figma',
    root,
    currentPage: root.children[doc.currentPage || 0],
    showUI() {},
    on() {},
    ui: {
      onmessage: null,
      postMessage: (msg) => posted.push(msg),
    },
    viewport: { scrollAndZoomIntoView: (nodes) => calls.scrollAndZoom.push(Array.from(nodes, (n) => n.id)) },
    async setCurrentPageAsync(page) {
      calls.setCurrentPage.push(page.id);
      figma.currentPage = page;
    },
    async loadAllPagesAsync() {},
    async getNodeByIdAsync(id) {
      return byId.get(id) || null;
    },
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => [],
      getVariableByIdAsync: async () => null,
    },
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    getLocalGridStylesAsync: async () => [],
    createFrame: creator('createFrame'),
    createRectangle: creator('createRectangle'),
    createText: creator('createText'),
    createComponent: creator('createComponent'),
    group: creator('group'),
  };

  vm.runInNewContext(SOURCE, { figma, __html__: '', console });

  let seq = 0;

  /** Sends one job the way ui.html does and reassembles the chunked answer. */
  async function run(cmd, args = {}) {
    const id = String(++seq);
    const before = posted.length;
    await figma.ui.onmessage({ type: 'run', id, cmd, args });
    const mine = posted.slice(before).filter((m) => m.id === id);
    const failed = mine.find((m) => m.type === 'failed');
    if (failed) throw new Error(failed.error);
    return JSON.parse(mine.filter((m) => m.type === 'chunk').map((m) => m.chunk).join(''));
  }

  return { run, figma, exports, writes, calls };
}

/** A bounding box helper, because every visible node needs one. */
export const bbox = (x, y, width, height) => ({ absoluteBoundingBox: { x, y, width, height } });
