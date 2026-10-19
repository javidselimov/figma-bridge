# Quickstart: validation scenarios

Run after implementation, before publishing. V1–V3 are automated or need no Figma; V4–V9 need
Figma desktop with any file of ≥ 3 pages and ≥ 10 top-level frames. Each scenario lists its
expected outcome; a mismatch is a release blocker.

## Prerequisites

- Node per `engines` (see [package-surface](./contracts/package-surface.md)), npm, Claude Code, Figma desktop.
- Repository root as current directory.

## V1 — Automated suite

```sh
npm test
```

Expected: all suites pass on the local OS; CI shows green on the 3-OS × 2-Node matrix.

## V2 — Packed tarball behaves like the published package

```sh
npm run check:pack
npm pack
cd "$(mktemp -d)"          # any empty directory outside the repo
npx /path/to/ubuligan-figma-bridge-<version>.tgz --version
npx /path/to/ubuligan-figma-bridge-<version>.tgz --help
```

Expected: allow-list matches exactly, zero forbidden words; `--version` prints the package
version; help lists every command and never mentions CBAR.

## V3 — Plugin install is stable and port-aware

```sh
npx <tgz> plugin install --dir ./p1
npx <tgz> plugin install --dir ./p2 --port 7444
```

Expected: both print an absolute `manifest.json` path; in `p2`, `manifest.json` allows
`http://localhost:7444` and `ui.html` targets `http://localhost:7444`; re-running is idempotent.

## V4 — Register with Claude Code (verifies R12)

```sh
npx <tgz> plugin install
# Windows
claude mcp add figma-bridge -s user -- cmd /c npx -y <tgz> mcp
# macOS / Linux
claude mcp add figma-bridge -s user -- npx -y <tgz> mcp
claude mcp list
```

Expected: `figma-bridge` listed as connected. On Windows also try without `cmd /c` and record
whether it fails — README states whichever is true.

## V5 — Output root is the project (verifies R4 / FR-020)

In Figma: Plugins → Development → Import plugin from manifest… → the path from V4 → run
**figma-bridge**. Start Claude Code in a scratch project folder and ask it to call
`figma_variables` (large → spilled to disk).

Expected: the file lands in `<scratch>/figma-bridge-out/`, not in the npx cache. If it lands
elsewhere, Claude Code does not start MCP servers in the project cwd → README must document
`-e FIGMA_BRIDGE_ROOT=…` and this scenario is re-run with it.

Also ask Claude to write with `out: "../escape.json"` → expected refusal message, no file.

## V6 — Claude sees a screen (verifies R6 / US2)

Ask Claude: "List the screens on page <X>, then show me <screen name> and describe it."

Expected: `figma_screens` then `figma_view` are called; Claude's description matches the canvas
(colours, headings, layout). Repeat on 10 screens: ≥ 9 correct (SC-004). Record image size and
whether Claude Code warned about output size.

## V7 — Connection states (US1 scenarios 4–5)

1. Plugin open → ask Claude "is Figma connected?" → `connected`, file and page named, < 5 s.
2. Close plugin window, wait 50 s → ask again → `NOT connected` + menu path, no hang.
3. Install plugin from an older build (`PROTOCOL` edited to 0) → any command → protocol mismatch message telling the user to run `plugin install`.

## V8 — Full capture (US2 scenario 6, SC-005)

```sh
npx <tgz> capture --page "*"
```

Expected: `figma-bridge-out/` contains `capture.json`, `variables.json`, `styles.json`,
`sets.json`, set dumps, `screens.json` and one PNG per screen under `previews/`; total time for a
≤ 50-screen file < 5 min.

## V9 — CLI edge cases

| Command | Expected |
| --- | --- |
| `figma-bridge nope` | exit 2, usage on stderr |
| `figma-bridge find` | exit 2, "missing required argument `query`" |
| `figma-bridge node 1:1 -o ../x.json` | exit 1, refused |
| `figma-bridge pages > p.json` with plugin open | `p.json` is valid JSON |
| `figma-bridge serve` twice | second exits 1 naming the port |
| Claude running + `figma-bridge ping` in a terminal | succeeds via Claude's relay |

## Release (after all scenarios pass)

```sh
npm login           # account: ubuligan
npm publish         # publishConfig.access = public; prepublishOnly runs npm test
```

## Results

Run 2026-10-20 on Windows 10, Node 22.21.1, npm 11.7.0, during `/speckit-implement`.

| Scenario | Result |
| --- | --- |
| V1 `npm test` | ✅ 68 tests, 0 failures (Windows only — macOS/Linux/Node 24 run in CI on first push) |
| V2 tarball | ✅ `npm run check:pack` → `pack OK (18 files)`. The tarball installed with `npm install <tgz>`; `figma-bridge --version` printed `1.0.0` and `--help` listed every command. ⚠️ `npx <path-to-local.tgz> …` hung twice on this machine with no output and was killed; the cause was not diagnosed. Re-check `npx @ubuligan/figma-bridge` from the registry in V4 after publishing. |
| V3 plugin install | ✅ Absolute manifest path printed; `--port 7444` rewrote both `manifest.json` and `ui.html`; reinstall is idempotent; exactly 3 files. |
| V4–V9 | ⏳ Need Figma desktop and Claude Code interactively (task T062). |
