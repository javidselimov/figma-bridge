// @ts-check
// Audits what `npm publish` would ship, against
// specs/001-npm-figma-bridge/contracts/package-surface.md:
//   · the file list equals the allow-list, no more and no less
//   · no shipped file names the private project this came from
//   · the bin keeps an LF shebang (a CRLF one breaks `npx` on macOS/Linux)
//   · no dependencies and no install scripts
//
// Exit 0 with "pack OK (<n> files)", or 1 with what differs.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOW = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'bin/figma-bridge.mjs',
  'bridge/cli.mjs',
  'bridge/lib/commands.mjs',
  'bridge/lib/errors.mjs',
  'bridge/lib/output.mjs',
  'bridge/lib/plugin-files.mjs',
  'bridge/lib/protocol.mjs',
  'bridge/lib/rpc.mjs',
  'bridge/lib/tasks.mjs',
  'bridge/mcp.mjs',
  'bridge/plugin/code.js',
  'bridge/plugin/manifest.json',
  'bridge/plugin/ui.html',
  'bridge/relay.mjs',
  'package.json',
];

const FORBIDDEN = [
  'cbar',
  'template5',
  'figma-cbar',
  'redesign-figma',
  'tools/figma-bridge',
  'spec.js',
  'gen-icons',
  'fetch-rest.sh',
  'extract-colors',
  'extract-semantic',
];

const problems = [];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const raw = execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const files = JSON.parse(raw)[0].files.map((f) => f.path.replace(/\\/g, '/')).sort();

const extra = files.filter((f) => !ALLOW.includes(f));
const missing = ALLOW.filter((f) => !files.includes(f));
if (extra.length) problems.push(`not on the allow-list:\n  + ${extra.join('\n  + ')}`);
if (missing.length) problems.push(`missing from the tarball:\n  - ${missing.join('\n  - ')}`);

for (const file of files) {
  const text = readFileSync(path.join(ROOT, file), 'utf8').toLowerCase();
  for (const word of FORBIDDEN) {
    if (text.includes(word)) problems.push(`${file} mentions "${word}"`);
  }
}

const bin = readFileSync(path.join(ROOT, 'bin/figma-bridge.mjs'), 'utf8');
if (!bin.startsWith('#!/usr/bin/env node\n')) problems.push('bin/figma-bridge.mjs must start with "#!/usr/bin/env node" + LF');
if (bin.includes('\r')) problems.push('bin/figma-bridge.mjs contains CR characters');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies']) {
  if (pkg[field] && Object.keys(pkg[field]).length) problems.push(`package.json has ${field}`);
}
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
  if (pkg.scripts?.[hook]) problems.push(`package.json has a "${hook}" script`);
}

if (problems.length) {
  console.error(`pack check failed:\n${problems.map((p) => `· ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`pack OK (${files.length} files)`);
