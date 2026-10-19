# Phase 0 Research: Publish figma-bridge as `@ubuligan/figma-bridge`

Every decision below is either verified in this session (marked **verified**) or
flagged as an assumption with a concrete check in [quickstart.md](./quickstart.md)
(marked **to verify**). Nothing is taken on faith.

## Facts gathered in this session

| Fact | Source | Status |
| --- | --- | --- |
| `@ubuligan/figma-bridge` does not exist on npm | `npm view` → E404 | verified |
| `ubuligan` is an existing npm account (maintainer of `create-reactivite`, email matches the user) | npm search API | verified |
| Not logged in to npm on this machine | `npm whoami` → E401 | verified |
| Local toolchain: Node 22.21.1, npm 11.7.0, Claude Code 2.1.303 | CLI | verified |
| Git remote is `https://github.com/javidselimov/figma-bridge.git` | `git remote -v` | verified |
| User's existing package conventions: MIT, ESM (`type: module`), `author: Javid Salimov`, `bin` entry, husky hooks | `create-reactivite@latest` manifest | verified |
| `claude mcp add [-s local\|user\|project] <name> -- <command> [args...]` | `claude mcp add --help` | verified |
| Constitution is still the unfilled template | `.specify/memory/constitution.md` | verified |

## R1 — Package shape: one bin, subcommands

- **Decision**: A single executable `figma-bridge` (`bin/figma-bridge.mjs`) dispatching subcommands: `mcp`, `serve`, `plugin`, `setup`, plus every read command (`health`, `ping`, `pages`, …).
- **Rationale**: `npx @ubuligan/figma-bridge <sub>` resolves the bin whose name matches the unscoped package name, so one bin named `figma-bridge` is the only shape that works identically under `npx`, a global install and a local install. One entry also means one place for version/help/error formatting.
- **Alternatives**: separate `figma-bridge-mcp` / `figma-bridge-cli` bins — rejected: `npx` cannot pick the second one without `-p`/`--package` gymnastics, and the README gets two install stories.
- **To verify**: `npx ./ubuligan-figma-bridge-*.tgz health` runs the bin (quickstart V2).

## R2 — No public JavaScript API in v1

- **Decision**: `exports` is `{ "./package.json": "./package.json" }` only. The supported interfaces are the CLI, the MCP tools and the relay HTTP protocol (see `contracts/`).
- **Rationale**: Every symbol exported is a semver promise. Nobody asked for programmatic use; closing deep imports now keeps the internal layout (`bridge/lib/*`) free to change in minor releases. Opening an API later is additive (minor); closing one is breaking (major).
- **Alternatives**: export `call()`/`startRelay()` — rejected until a real consumer exists.

## R3 — Language, runtime, dependencies

- **Decision**: Plain ESM JavaScript with JSDoc types, **zero runtime dependencies**, **zero devDependencies**. Tests use `node:test` + `node:assert`. `engines.node: ">=22.12.0"` (Q2).
- **Rationale**: The code is already dependency-free and hand-rolls MCP on purpose; a published CLI that pulls nothing has no supply-chain surface and starts fast under `npx`. Node 20 reached end-of-life on 2026-04-30, so the supported LTS lines today are 22 and 24 — the CI matrix tests exactly what `engines` claims.
- **Alternatives**: TypeScript build step — rejected: adds a compile step and a `dist/` for ~1,500 lines; JSDoc + `// @ts-check` gives editor checking without shipping a build. `@modelcontextprotocol/sdk` — rejected: brings a dependency tree (zod etc.) for a protocol that is three methods wide here.

## R4 — Where output goes (fixes a real bug)

- **Finding**: `lib/rpc.mjs` computes `REPO = resolve(HERE, '..', '..')` — two levels above the install directory. Installed from npm that is `node_modules/@ubuligan` or the npx cache; today in this repo it resolves to `npmpackages/`. `writeOut()`'s "inside the repo" guard is therefore guarding the wrong directory, and the MCP server's large-answer fallback writes into `HERE/out`, i.e. inside the installed package.
- **Finding**: the guard uses `target.startsWith(REPO + sep)` — on Windows a path differing only in drive-letter case (`c:\` vs `C:\`) is wrongly refused, and on any OS a sibling such as `/proj-evil` vs `/proj` is handled only because of the `sep` suffix.
- **Decision**: An **output root** = `FIGMA_BRIDGE_ROOT` env var if set, otherwise `process.cwd()`. All writes go through one function that resolves the target, computes `path.relative(root, target)`, and refuses when the result is absolute or starts with `..`. Default output directory: `<root>/figma-bridge-out/`.
- **Rationale**: "the user's project" in the spec = where Claude or the CLI was started. `path.relative` handles case-insensitive Windows volumes and `..` segments correctly.
- **To verify**: that Claude Code starts a stdio MCP server with `cwd` = the project directory (quickstart V5). If it does not, the documented fallback is `-e FIGMA_BRIDGE_ROOT=<dir>` on `claude mcp add`.

## R5 — Stable plugin location (npx cache is not stable)

- **Finding**: A Figma development plugin is imported **by manifest path** and loaded from disk each run. Under `npx`, the package lives in `~/.npm/_npx/<hash>/…`, which `npm cache clean` or a version bump replaces — the imported plugin would silently break.
- **Decision**: `figma-bridge plugin install [--dir <path>] [--port <n>]` copies `manifest.json`, `code.js`, `ui.html` to a stable directory (default `~/.figma-bridge/plugin/`) and prints the manifest path. `figma-bridge plugin path` prints the path without copying. Re-running `install` after an upgrade updates the files in place, so Figma keeps working without re-import.
- **Rationale**: one import in Figma, ever. It is also the hook for port changes (R8).
- **Alternatives**: tell users to import from `node_modules` — rejected (breaks with npx, differs per project).

## R6 — Claude must *see* screens: MCP image content

- **Decision**: New MCP tool `figma_view { id, maxEdge = 1568 }` returns `content: [ { type: "image", mimeType: "image/png", data: <base64> }, { type: "text", text: "<name> — <w>×<h> exported at scale <s>" } ]`. Image results bypass the 64 kB text spill-to-disk rule.
- **Plugin side**: the `png` command gains an optional `maxEdge`; the plugin computes `scale = min(requestedScale, maxEdge / longestEdge)` from `absoluteBoundingBox` and reports the applied scale.
- **Rationale**: Image content is part of the MCP tool-result schema (protocol revisions 2024-11-05 onward). 1568 px on the long edge is Anthropic's documented sweet spot for vision input; larger images are downscaled by the model API anyway, costing tokens for no detail.
- **Known limit (documented, not solved)**: a very tall screen (e.g. 375×6000) at 1568 px long edge becomes ~98 px wide. Tiling would require creating temporary nodes in the document, which v1's read-only rule forbids. Mitigation: the text part names the screen's direct children so Claude can view sections by id.
- **To verify**: that Claude Code renders an MCP image result to the model and does not count it against `MAX_MCP_OUTPUT_TOKENS` as text (quickstart V6).

## R7 — "Screens" definition

- **Decision**: A screen is a `FRAME`, `COMPONENT`, `COMPONENT_SET` or `INSTANCE` whose parent is a `PAGE` or a top-level `SECTION`. New plugin command `screens [--page]` returns `{ id, name, type, page, section?, width, height }`.
- **Rationale**: matches what designers call "a screen", including the now-common practice of grouping screens in sections. Groups and loose shapes on the canvas are excluded.

## R8 — Port configuration end-to-end

- **Finding**: the port lives in three places: relay (`FIGMA_BRIDGE_PORT`), `ui.html` (`BRIDGE` constant), `manifest.json` (`devAllowedDomains`). Changing only the env var breaks the plugin.
- **Decision**: `plugin install --port <n>` rewrites both plugin files in the copied directory; relay/CLI/MCP read `FIGMA_BRIDGE_PORT`. README documents both halves together. Default stays **7332**.

## R9 — Protocol version handshake between plugin and relay

- **Decision**: a shared integer `PROTOCOL = 1`. `ui.html` sends `&v=1` on every `/pull`; the relay records it; `health` reports `plugin.protocol` and a mismatch warning; `/rpc` refuses with "plugin is version X, server expects Y — run `figma-bridge plugin install` and re-run the plugin" when they differ. A test asserts the constant is identical in `bridge/lib/protocol.mjs`, `plugin/ui.html` and `plugin/code.js`.
- **Rationale**: after R5, plugin files and the npm package can drift apart. Without a handshake that shows up as "Unknown command `screens`" — confusing. The plugin cannot `import` (Figma loads a single script), hence the duplicated constant guarded by a test.

## R10 — CLI auto-hosts the relay

- **Decision**: every CLI read command calls `ensureRelay()` (reuse a running relay or host one in-process), then waits up to 8 s for the plugin's next poll before sending. `figma-bridge serve` remains for long sessions.
- **Rationale**: today the CLI fails with "No bridge" unless `bridge.mjs` was started separately; the plugin already retries with back-off ≤ 5 s, so a one-shot host connects within one cycle. Removes a setup step (SC-001).

## R11 — MCP protocol version negotiation

- **Finding**: `mcp.mjs` echoes back whatever `protocolVersion` the client sends — incorrect per spec when the server does not support it.
- **Decision**: keep a list of revisions this server implements (`2025-06-18`, `2025-03-26`, `2024-11-05`); answer with the client's version if listed, otherwise the newest listed.

## R12 — Windows registration

- **Decision**: README gives the Windows form `claude mcp add figma-bridge -s user -- cmd /c npx -y @ubuligan/figma-bridge mcp` next to the POSIX form without `cmd /c`.
- **Rationale**: on native Windows `npx` is a `.cmd` shim, which a stdio server spawn cannot start directly; Claude Code's own MCP documentation prescribes the `cmd /c` wrapper.
- **To verify**: on this Windows machine (quickstart V4).

## R13 — Plugin manifest `id`

- **Finding**: `manifest.json` carries `"id": "1691348482941559806"`, an id Figma issued to the original "CBAR Figma bridge" plugin.
- **Decision** (Q1): keep the existing id. Development-plugin import works with it; replacing it is only required before a Figma Community publish, which is out of scope for v1.

## R14 — Quality gates and release

- **Decision**:
  - `npm test` = `node --test` over `test/**/*.test.mjs` (unit + relay integration + MCP contract + plugin-in-`vm` + pack audit).
  - `scripts/check-pack.mjs`: runs `npm pack --dry-run --json`, asserts the file list equals an allow-list and that no shipped file contains `CBAR`, `template5`, `figma-cbar`, `tools/figma-bridge`, `spec.js`, `gen-icons`.
  - GitHub Actions CI: `{ubuntu, windows, macos} × {22, 24}` runs `npm test`.
  - `prepublishOnly`: `npm test`. `publishConfig: { access: "public" }`.
  - `CHANGELOG.md` (Keep a Changelog), semver from **1.0.0** (Q3).
- **Alternatives**: ESLint/Prettier/husky as devDependencies — rejected for v1 (Q4); CI is the only gate.

## Resolved questions (2026-10-19)

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Plugin `id` | Keep the existing id `1691348482941559806`. Revisit before any Figma Community publish. |
| Q2 | Node range | `>=22.12.0` |
| Q3 | First version | `1.0.0` |
| Q4 | Husky hooks | None in v1; CI only. The repo stays free of devDependencies. |
