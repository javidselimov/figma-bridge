// @ts-check
// Where answers may be written.
//
// The MCP server takes paths from a model, so every write goes through
// `writeOut`, which refuses anything outside the output root. The root is the
// user's project — `FIGMA_BRIDGE_ROOT`, or the directory the tool was started
// from — never a path derived from where the package happens to be installed.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BridgeError } from './errors.mjs';

export const OUT_DIR = 'figma-bridge-out';

/** Read on every call so a test (or a long-lived host) can change it. */
export function outputRoot() {
  return path.resolve(process.env.FIGMA_BRIDGE_ROOT || process.cwd());
}

/** @param {...string} parts */
export function defaultOut(...parts) {
  return path.join(outputRoot(), OUT_DIR, ...parts);
}

/**
 * `path.relative` rather than a string prefix: it is case-insensitive on
 * Windows volumes, it sees through `..`, and `/proj-evil` is not inside `/proj`.
 * @param {string} target
 */
export function resolveInside(target) {
  const root = outputRoot();
  const abs = path.resolve(root, target);
  const rel = path.relative(root, abs);
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
    throw new BridgeError(`Refusing to write outside ${root}: ${abs}`, 'bad');
  }
  return abs;
}

/**
 * @param {string} target relative to the output root, or absolute inside it
 * @param {string | Uint8Array} data
 * @returns {Promise<string>} the absolute path written
 */
export async function writeOut(target, data) {
  const abs = resolveInside(target);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return abs;
}

/** For log lines: short when inside the root, which is every time. */
export const shown = (abs) => path.relative(outputRoot(), abs) || abs;
