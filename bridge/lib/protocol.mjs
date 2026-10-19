// @ts-check
// Constants both halves and every front door agree on.

import { readFileSync } from 'node:fs';

export const DEFAULT_PORT = 7332;

/** The relay port. The plugin must be installed with the same one (`plugin install --port`). */
export const PORT = Number(process.env.FIGMA_BRIDGE_PORT) || DEFAULT_PORT;

/**
 * Wire version between the plugin and the relay. The installed plugin is a copy
 * that can be older than the package, so a mismatch is refused with a hint
 * instead of surfacing as a confusing "Unknown command". `plugin/code.js` and
 * `plugin/ui.html` carry the same number; a test keeps the three in step.
 */
export const PROTOCOL = 1;

/** MCP revisions this server speaks, newest first. */
export const MCP_REVISIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** @type {{ name: string, version: string }} */
export const PACKAGE = { name: manifest.name, version: manifest.version };

/** The command a user types; keeps hints correct if the package is ever renamed. */
export const NPX = `npx ${manifest.name}`;
