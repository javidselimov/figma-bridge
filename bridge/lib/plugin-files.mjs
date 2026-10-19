// @ts-check
// The Figma plugin's files on disk.
//
// Figma imports a development plugin by manifest path and reloads it from that
// path on every run. Under `npx` the package lives in a cache folder that a
// version bump or `npm cache clean` replaces, so the plugin is copied to a
// stable folder once and Figma is pointed there. Re-running `install` after an
// upgrade refreshes the files in place; Figma never needs a second import.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeError } from './errors.mjs';
import { NPX, PORT } from './protocol.mjs';

const SOURCE = fileURLToPath(new URL('../plugin/', import.meta.url));
const FILES = ['manifest.json', 'code.js', 'ui.html'];
const BRIDGE_LINE = /const BRIDGE = 'http:\/\/localhost:\d+';/g;

export const defaultPluginDir = () => path.join(os.homedir(), '.figma-bridge', 'plugin');

/**
 * Copies the three plugin files into `dir` and points them at `port`. The
 * port is always written, so reinstalling with the default undoes a custom one.
 * Other files in `dir` are left alone.
 * @param {{ dir?: string, port?: number }} [options]
 * @returns {Promise<{ dir: string, manifest: string, port: number }>}
 */
export async function install({ dir = defaultPluginDir(), port = PORT } = {}) {
  const target = path.resolve(dir);
  await mkdir(target, { recursive: true });
  await copyFile(path.join(SOURCE, 'code.js'), path.join(target, 'code.js'));

  const origin = `http://localhost:${port}`;

  const manifest = JSON.parse(await readFile(path.join(SOURCE, 'manifest.json'), 'utf8'));
  manifest.networkAccess.devAllowedDomains = [origin];
  await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const ui = await readFile(path.join(SOURCE, 'ui.html'), 'utf8');
  const hits = ui.match(BRIDGE_LINE)?.length || 0;
  // Fail loudly: a silent miss would ship a plugin calling the wrong port.
  if (hits !== 1) throw new BridgeError(`ui.html should contain one BRIDGE line, found ${hits}`, 'bad');
  await writeFile(path.join(target, 'ui.html'), ui.replace(BRIDGE_LINE, `const BRIDGE = '${origin}';`));

  return { dir: target, manifest: path.join(target, 'manifest.json'), port };
}

/**
 * @param {{ dir?: string }} [options]
 * @returns {string} absolute manifest path
 */
export function pluginPath({ dir = defaultPluginDir() } = {}) {
  const manifest = path.join(path.resolve(dir), 'manifest.json');
  if (!FILES.every((f) => existsSync(path.join(path.dirname(manifest), f)))) {
    throw new BridgeError(`Plugin not installed in ${path.dirname(manifest)}. Run: ${NPX} plugin install`, 'bad');
  }
  return manifest;
}

/** Same as pluginPath, but null instead of throwing — for status reports. */
export function installedManifest(options) {
  try {
    return pluginPath(options);
  } catch {
    return null;
  }
}

export const FIGMA_IMPORT = 'Figma desktop → Plugins → Development → Import plugin from manifest…';
export const FIGMA_RUN = 'Figma desktop → Plugins → Development → figma-bridge';
