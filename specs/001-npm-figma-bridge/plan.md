# Implementation Plan: Publish figma-bridge as `@ubuligan/figma-bridge`

**Branch**: `001-npm-figma-bridge` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-npm-figma-bridge/spec.md`

## Summary

Turn the private-repo tool in `figma-bridge/` into a public, zero-dependency npm package
`@ubuligan/figma-bridge` with one `figma-bridge` executable. The repository root becomes the
package root and the source moves to `bridge/`. All "CBAR" naming and private-repo coupling is
removed. Three real defects are fixed on the way: writes are guarded against the wrong directory
(R4), the imported Figma plugin would break under `npx` (R5), and the port is configurable on
one side only (R8). New capabilities: `screens`, `figma_view` (Claude receives the screen as an
image), `capture` (whole file with previews), `plugin install|path`, `setup`, and a
plugin/server protocol handshake. Behaviour stays strictly read-only towards the document.
Quality is enforced by `node:test` suites, a pack audit and a 3-OS × 2-Node CI matrix.

## Technical Context

**Language/Version**: JavaScript (ES2022, ESM), JSDoc-typed with `// @ts-check`; Node.js `>=22.12.0`

**Primary Dependencies**: none at runtime, none at dev time — Node built-ins only (`node:http`, `node:fs`, `node:path`, `node:os`, `node:test`, `node:vm`, global `fetch`)

**Storage**: local files only — output root (`FIGMA_BRIDGE_ROOT` or cwd) for answers/captures; `~/.figma-bridge/plugin/` for the installed plugin copy

**Testing**: `node --test` (unit, relay integration with a simulated plugin, MCP stdio contract, plugin code in `node:vm` with a stubbed `figma` global, pack audit)

**Target Platform**: Windows, macOS, Linux with Figma **desktop**; MCP client = Claude Code (other stdio MCP clients untested)

**Project Type**: CLI + MCP stdio server + Figma development plugin, distributed as one npm package

**Performance Goals**: health answer < 2 s; `figma_view` of a typical screen < 5 s; `capture` of 50 screens < 5 min (SC-005)

**Constraints**: loopback-only networking; zero dependencies; read-only towards the Figma document; every write confined to the output root; MCP stdout carries protocol frames only

**Scale/Scope**: ~1,500 LOC existing + ~600 new; 20 commands; files up to hundreds of pages / thousands of frames (existing 256 MB body limit, 3 MB chunking kept)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template, so there are no ratified gates.
Until `/speckit-constitution` is run, this plan holds itself to the "senior library architect"
bar the user asked for, written as explicit gates:

| # | Gate | Pre-design | Post-design |
| --- | --- | --- | --- |
| G1 | **Minimal public surface** — only documented interfaces are reachable; everything else private | PASS (R2: `exports` closes deep imports) | PASS — `contracts/package-surface.md` |
| G2 | **Every public interface has a written contract and a test that pins it** | PASS (planned) | PASS — 4 contracts, each mapped to a test file below |
| G3 | **Zero runtime dependencies; no install scripts** | PASS (R3) | PASS |
| G4 | **Secure by default** — loopback only, no writes outside the output root, read-only towards the document | PASS (R4 fixes an existing hole) | PASS — `relay-http.md`, `cli.md` §Output root |
| G5 | **Semver discipline** — CHANGELOG, `engines` matches CI matrix, protocol version between halves | PASS (R9, R14) | PASS |
| G6 | **Shipped contents are audited** — allow-list, forbidden-word scan | PASS (R14) | PASS |
| G7 | **Cross-platform** — tested on Windows, macOS, Linux | PASS (R14 matrix; R12 Windows registration) | PASS |
| G8 | **No unverified claims** — anything not checked in-session has a check in quickstart | PASS | PASS — V4, V5, V6 |

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-npm-figma-bridge/
├── spec.md
├── plan.md                 # this file
├── research.md             # Phase 0
├── data-model.md           # Phase 1
├── quickstart.md           # Phase 1 — validation scenarios V1–V9
├── contracts/
│   ├── package-surface.md  # name, bin, exports, files, engines
│   ├── cli.md              # subcommands, flags, exit codes, output root
│   ├── mcp-tools.md        # tool names, input schemas, result shapes
│   └── relay-http.md       # /pull /result /rpc /health + protocol version
├── checklists/requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root = package root)

```text
package.json                 # @ubuligan/figma-bridge — bin, exports, files, engines, publishConfig
README.md                    # rewritten for external users
LICENSE                      # MIT
CHANGELOG.md
bin/
└── figma-bridge.mjs         # single entry: dispatch to mcp | serve | plugin | setup | <read cmd>
bridge/                      # renamed from figma-bridge/  (FR-004)
├── relay.mjs                # was bridge.mjs — HTTP hub, startRelay({ port, log })
├── cli.mjs                  # argv → command, printing; auto-hosts relay (R10)
├── mcp.mjs                  # stdio JSON-RPC; image results (R6); version negotiation (R11)
├── lib/
│   ├── commands.mjs         # registry (+ screens, view, capture, plugin, setup)
│   ├── rpc.mjs              # relay client: call, ensureRelay, waitForPlugin
│   ├── tasks.mjs            # dump → capture, icons, saveAnswer, healthReport
│   ├── output.mjs           # NEW — output root + confined writeOut (R4)
│   ├── plugin-files.mjs     # NEW — plugin install/path, port rewrite (R5, R8)
│   └── protocol.mjs         # NEW — PROTOCOL constant, MCP revisions, default port
└── plugin/
    ├── manifest.json        # name "figma-bridge"; id 1691348482941559806 kept (Q1)
    ├── code.js              # + screens, png maxEdge, PROTOCOL
    └── ui.html              # sends v=PROTOCOL on /pull
scripts/
└── check-pack.mjs           # allow-list + forbidden-word audit (R14)
test/
├── helpers/fake-plugin.mjs  # simulates ui.html against a relay
├── commands.test.mjs        # registry, normalise, inputSchema
├── output.test.mjs          # confinement incl. Windows case, .., absolute
├── relay.test.mjs           # 200/204/500/502/503/504, chunk reassembly, version mismatch
├── mcp.test.mjs             # spawn bin mcp: initialize, tools/list snapshot, image result
├── cli.test.mjs             # usage, --help, unknown flag, exit codes
├── plugin.test.mjs          # code.js in node:vm: serializer, screens, scale maths
├── plugin-files.test.mjs    # install to temp dir, port rewrite
├── capture.test.mjs         # capture folder layout, previews toggle, client-side time bound
├── fixtures/node-snapshot.json  # serializer regression fixture (FR-013)
└── pack.test.mjs            # runs scripts/check-pack.mjs
.github/workflows/ci.yml     # {ubuntu,windows,macos} × {22,24}: npm test
.gitattributes               # * text=auto eol=lf — keeps the bin shebang LF on Windows checkouts
.gitignore                   # + figma-bridge-out/
```

**Removed**: `figma-bridge/package.json` (placeholder), `figma-bridge/.gitignore` (folded into
root `.gitignore` as `figma-bridge-out/`), `figma-bridge/plugin/coin-banner-dark 1 1.png`, every
README/comment reference to `template5`, `figma-cbar`, `redesign-figma`, `.husky`, `spec.js`,
`extract-*`, `gen-icons.js`, `fetch-rest.sh`, `tools/…` paths.

**Kept out of the tarball by the `files` allow-list**: `.claude/`, `.specify/`, `specs/`, `test/`,
`scripts/`, `.github/`.

**Structure Decision**: single package at the repository root; `bridge/` holds all runtime source
as the user requested; `bin/` holds only the thin entry so the shebang file stays tiny and the
public executable path never moves.

## Phase sequencing (input for `/speckit-tasks`)

1. **Move & rename** — `git mv figma-bridge bridge`, `bridge.mjs → relay.mjs`, delete removed files, root `package.json`. Run existing behaviour unchanged. *(US4)*
2. **Safety fixes** — `output.mjs` (R4), injectable port, test harness + fake plugin, relay/commands/output tests. *(FR-019–FR-022)*
3. **De-CBAR** — every user-facing string, manifest name, comments, README rewrite. *(FR-003, FR-005)*
4. **Single bin + setup path** — `bin/figma-bridge.mjs`, `plugin install|path`, `setup`, CLI auto-host (R10), protocol handshake (R9). *(US1, US3)*
5. **New read capabilities** — `screens`, `png maxEdge`, `figma_view` image result, `capture`. *(US2)*
6. **MCP hardening** — version negotiation (R11), MCP contract test.
7. **Release hygiene** — LICENSE, CHANGELOG, `check-pack`, CI workflow, `prepublishOnly`, quickstart run.

Each phase leaves `npm test` green and the tool usable.

## Complexity Tracking

No constitution violations to justify.
