# Contract: Package surface

Pinned by `test/pack.test.mjs` (via `scripts/check-pack.mjs`). Changing anything here is a
semver event: removing or renaming = major, adding = minor.

## package.json (normative fields)

```json
{
  "name": "@ubuligan/figma-bridge",
  "version": "1.0.0",
  "description": "Read a live Figma file from Claude or the terminal — local MCP server + Figma plugin, no API token.",
  "type": "module",
  "bin": { "figma-bridge": "bin/figma-bridge.mjs" },
  "exports": { "./package.json": "./package.json" },
  "files": ["bin/", "bridge/", "CHANGELOG.md"],
  "engines": { "node": ">=22.12.0" },
  "publishConfig": { "access": "public" },
  "license": "MIT",
  "author": "Javid Salimov",
  "repository": { "type": "git", "url": "git+https://github.com/javidselimov/figma-bridge.git" },
  "bugs": "https://github.com/javidselimov/figma-bridge/issues",
  "homepage": "https://github.com/javidselimov/figma-bridge#readme",
  "keywords": ["figma", "mcp", "claude", "design-tokens", "figma-plugin", "model-context-protocol"],
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\"",
    "check:pack": "node scripts/check-pack.mjs",
    "prepublishOnly": "npm test"
  }
}
```

- No `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.
- No `preinstall` / `install` / `postinstall` scripts.
- `version` 1.0.0 and `engines` `>=22.12.0` confirmed by the user (2026-10-19).

## Tarball allow-list

Exactly these paths (npm adds `package.json`, `README.md`, `LICENSE` automatically):

```
package.json
README.md
LICENSE
CHANGELOG.md
bin/figma-bridge.mjs
bridge/relay.mjs
bridge/cli.mjs
bridge/mcp.mjs
bridge/lib/commands.mjs
bridge/lib/errors.mjs
bridge/lib/rpc.mjs
bridge/lib/tasks.mjs
bridge/lib/output.mjs
bridge/lib/plugin-files.mjs
bridge/lib/protocol.mjs
bridge/plugin/manifest.json
bridge/plugin/code.js
bridge/plugin/ui.html
```

## Forbidden content in any shipped file

Case-insensitive: `CBAR`, `template5`, `figma-cbar`, `redesign-figma`, `tools/figma-bridge`,
`spec.js`, `gen-icons`, `fetch-rest.sh`, `extract-colors`, `extract-semantic`.

## Executable

`bin/figma-bridge.mjs` starts with `#!/usr/bin/env node`, has LF line endings (enforced by
`.gitattributes` so a Windows checkout cannot ship CRLF and break the shebang on POSIX).
