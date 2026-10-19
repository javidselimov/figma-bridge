---

description: "Task list for publishing figma-bridge as @ubuligan/figma-bridge"
---

# Tasks: Publish figma-bridge as `@ubuligan/figma-bridge`

**Input**: Design documents from `specs/001-npm-figma-bridge/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. Plan gate G2 requires every public interface to have a test that pins its contract. All tests use `node:test` + `node:assert/strict`, with no dependencies. `npm test` runs `node --test "test/**/*.test.mjs"` (explicit glob so helpers are never collected as tests).

**Organization**: Tasks are grouped by user story. Paths are relative to the repository root, which is also the package root.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

## Ground rules for every task

- ESM only, `node:` prefix on built-ins, no new dependencies, `// @ts-check` + JSDoc on new modules.
- Match the existing code style: comments explain *why*, 2-space indent, single quotes, trailing commas.
- `bridge/plugin/code.js` runs inside Figma's sandbox. It must stay a single classic script with no `import`, no `export` and no Node APIs.
- MCP stdout carries JSON-RPC frames only. Logs go to stderr.
- Keep `npm test` green at the end of every phase.
- Tests MUST NOT touch port 7332. A developer's Claude session may be relaying to a real Figma file there. Every test gets its port from `freePort()` and passes it explicitly (`startRelay({ port })`, `usePort(port)`, or `FIGMA_BRIDGE_PORT` for spawned children).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Move to the published layout without changing behaviour.

- [X] T001 Run `git mv figma-bridge bridge` from the repo root, so `figma-bridge/figma-bridge/` becomes `bridge/` and history is kept
- [X] T002 Run `git mv bridge/bridge.mjs bridge/relay.mjs`. Update the dynamic import `'../bridge.mjs'` in `bridge/lib/rpc.mjs` to `'../relay.mjs'`. Rename the exported `startBridge` to `startRelay` in `bridge/relay.mjs` and at its single call site in `bridge/lib/rpc.mjs`
- [X] T003 Delete `bridge/package.json` (placeholder), `bridge/.gitignore`, and `bridge/plugin/coin-banner-dark 1 1.png` with `git rm`
- [X] T004 Create root `package.json` exactly as specified in `specs/001-npm-figma-bridge/contracts/package-surface.md`: name `@ubuligan/figma-bridge`, version `1.0.0`, `type: module`, `bin`, `exports`, `files`, `engines >=22.12.0`, `publishConfig`, MIT, author, repository/bugs/homepage, keywords, scripts `test` (`node --test "test/**/*.test.mjs"`), `check:pack`, `prepublishOnly`. Do not add any dependencies. Confirm on Node 22 that the `test` script finds the smoke test from T007
- [X] T005 [P] Create `.gitattributes` with `* text=auto eol=lf` and `*.png binary`
- [X] T006 [P] Append `figma-bridge-out/` to root `.gitignore`. Leave the existing `out` line in place
- [X] T007 [P] Create `test/` and `scripts/` directories, each holding a placeholder `test/smoke.test.mjs` that imports `node:test` and asserts `true`. The smoke test is removed in T019

**Checkpoint**: `node bridge/cli.mjs --help` and `npm test` both run.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared modules, safety fixes and the test harness that every story builds on.

**⚠️ CRITICAL**: No user-story work starts before this phase is complete.

- [X] T008 Create `bridge/lib/protocol.mjs` exporting:
  - `DEFAULT_PORT = 7332`
  - `PORT = Number(process.env.FIGMA_BRIDGE_PORT) || DEFAULT_PORT`
  - `PROTOCOL = 1`
  - `MCP_REVISIONS = ['2025-06-18', '2025-03-26', '2024-11-05']`
  - `PACKAGE`: `name` and `version` read once from the root `package.json` via `fs.readFileSync` + `new URL('../../package.json', import.meta.url)`
- [X] T009 Refactor `bridge/relay.mjs`:
  - Remove its own `PORT` const.
  - `startRelay({ port = PORT, log } = {})` takes the port as a parameter and stores it for `health()`.
  - Move the module-level state (`queue`, `waiters`, `inflight`, `plugin`, `seq`) into a closure created per `startRelay` call, so tests can start isolated relays on random ports.
  - Return `{ servers, port, close() }`, where `close()` closes both servers and clears timers.
  - Keep the `import.meta.url === argv[1]` direct-run block working until T033 removes it.
- [X] T010 Create `bridge/lib/output.mjs`, following research R4 and the OutputRoot entry in data-model.md:
  - `outputRoot()` returns the resolved `FIGMA_BRIDGE_ROOT`, or `process.cwd()` if it is not set.
  - `defaultOut(...parts)` returns `path.join(outputRoot(), 'figma-bridge-out', ...parts)`.
  - `writeOut(target, data)` resolves `target` against the root and refuses when `path.relative(root, abs)` is absolute or starts with `..`. It throws `BridgeError('Refusing to write outside <root>: <abs>', 'bad')`, then runs `mkdir -p` and writes.
- [X] T011 Update `bridge/lib/rpc.mjs`:
  - Delete `HERE`, `REPO` and `writeOut`, and move `BridgeError` to the top of the file.
  - Import `PORT` from `protocol.mjs`.
  - Rename `ensureBridge` to `ensureRelay`.
  - Replace the `BASE` const with a module-level `let port = PORT`, plus `export function usePort(p)` that sets it. `health`, `call` and `ensureRelay` (which passes `{ port }` to `startRelay`) read the current value. The CLI and MCP never call `usePort`, so they keep the env/default. Tests call it with a free port.
  - Add `waitForPlugin(timeoutMs = 8000)`. It polls `health()` every 250 ms until `plugin.connected` is true, and otherwise throws `BridgeError('The figma-bridge plugin is not connected. In Figma desktop: Plugins → Development → figma-bridge.', 'no-plugin')`.
  - Make `ensureRelay()` return `{ hosted: boolean, state }`, so callers know whether this process just started the relay.
  - Re-export `writeOut` from `output.mjs` only if something still imports it from `rpc.mjs`; otherwise update the importers.
- [X] T012 Update `bridge/lib/tasks.mjs` and `bridge/mcp.mjs` to import `writeOut` and `defaultOut` from `output.mjs`:
  - In `bridge/mcp.mjs`, replace the large-answer path `path.join(HERE, 'out', …)` with `defaultOut(...)`, and make the reported path relative to `outputRoot()`.
  - In `bridge/lib/commands.mjs`, change the defaults `tools/figma-bridge/out` → `figma-bridge-out` and `tools/figma-bridge/out/svg` → `figma-bridge-out/svg`.
- [X] T013 Extend the command registry in `bridge/lib/commands.mjs`:
  - Allow `where: 'local'`.
  - Add an optional `mcp: 'text' | 'image'` field.
  - Export `mcpCommands()`, which returns the commands whose `where` is not `local`.
  - Document the `where` values in the header comment, and fix its stale reference: the composites live in `lib/tasks.mjs`, not `cli.mjs`.
- [X] T014 Create `bin/figma-bridge.mjs` with the shebang `#!/usr/bin/env node`:
  - Read `argv[2]`.
  - `mcp` → `await import('../bridge/mcp.mjs')`.
  - `--version` / `-v` → print `PACKAGE.version`.
  - Anything else → `await import('../bridge/cli.mjs')`, passing the remaining argv. Refactor `bridge/cli.mjs` to export `main(argv)` instead of reading `process.argv` at import time; `bin` calls `main(process.argv.slice(2))`.
  - Before any dynamic import, guard the Node version. Parse `process.versions.node`; if it is below 22.12.0, write `figma-bridge needs Node.js 22.12 or newer (found <v>). Install a current LTS from https://nodejs.org` to stderr and exit 1. Keep this guard free of syntax newer than ES2020, so an old Node reaches it instead of failing at parse time.
- [X] T015 [P] Create `test/helpers/fake-plugin.mjs` that simulates `bridge/plugin/ui.html` against a relay URL:
  - `startFakePlugin({ port, file, page, protocol = PROTOCOL, handlers })` loops on `GET /pull?file=&page=&v=`.
  - For each job it calls `handlers[cmd](args)`. Each handler returns a value, or throws to report `ok:false`.
  - The result is posted to `/result` in chunks of a configurable size.
  - It returns `{ stop() }`.
- [X] T016 [P] Create `test/output.test.mjs`. Cases:
  - Relative path inside the root is allowed.
  - Nested directories are created.
  - `../x` is refused.
  - An absolute path outside the root is refused.
  - A sibling directory with the same prefix (`<root>-evil`) is refused.
  - `FIGMA_BRIDGE_ROOT` overrides cwd.
  - On win32 only, a drive-letter case difference is allowed.

  Use `fs.mkdtemp` for the roots.
- [X] T017 [P] Create `test/commands.test.mjs`. Cases:
  - Every command has `name`, `where` and `summary`.
  - Names are unique.
  - `normalise` applies defaults, coerces number and boolean, throws on a missing required argument, and drops unknown keys.
  - `inputSchema` lists required fields and defaults.
  - `mcpCommands()` excludes `local`.
- [X] T018 Create `test/relay.test.mjs` using `startRelay({ port, log: () => {} })` and the fake plugin. Do not use port 0, because the relay binds two hosts and each would get a different port. Instead, add `freePort()` to `test/helpers/fake-plugin.mjs`: listen on `127.0.0.1:0` with `node:net`, read the port, close. Cases:
  - Health shows the plugin as disconnected, then connected.
  - An rpc with no plugin returns 503.
  - Round trip returns 200 and the body equals the handler output.
  - A multi-chunk answer is reassembled byte for byte (use a 1 kB chunk size with a 10 kB answer).
  - A handler throw returns 500 with its message.
  - A short-timeout rpc to a plugin that never answers returns 504.
  - OPTIONS returns 204.
  - An unknown path returns 404.
  - Loopback only (FR-019): every entry in the returned `servers` reports `address()` of `127.0.0.1` or `::1`. When `::1` is unavailable on the CI host, the IPv4 server alone is acceptable, but no server may report `0.0.0.0` or `::`.
  - `close()` releases the port: a second `startRelay` on the same port succeeds.

  Close the relay in `after()`.
- [X] T019 Delete `test/smoke.test.mjs` once T016–T018 exist, and run `npm test`. Everything must pass on the local OS

**Checkpoint**: Writes are confined to the output root, the relay can be tested in isolation, and one `bin` dispatches everything.

---

## Phase 3: User Story 1 – Install and connect Claude to Figma (Priority: P1) 🎯 MVP

**Goal**: A new user runs `plugin install`, registers the MCP server, opens the plugin, and Claude reports "connected". "CBAR" appears nowhere.

**Independent Test**: quickstart V3, V4, V7 + `test/plugin-files.test.mjs`, `test/mcp.test.mjs`, relay protocol cases.

### Tests for User Story 1

- [X] T020 [P] [US1] Create `test/plugin-files.test.mjs`. Cases:
  - `install({ dir: tmp })` writes exactly `manifest.json`, `code.js` and `ui.html`, and returns the absolute manifest path.
  - A second install is idempotent and leaves an extra file in the directory untouched.
  - `install({ dir, port: 7444 })` writes a `devAllowedDomains` entry of `http://localhost:7444` and a `ui.html` BRIDGE constant of `'http://localhost:7444'`.
  - `pluginPath({ dir })` throws a hint when the plugin is not installed.
  - The installed `manifest.json` has `name === 'figma-bridge'`.
- [X] T021 [P] [US1] Add protocol cases to `test/relay.test.mjs`:
  - The fake plugin polls with `v=0`. `/health` then reports `plugin.protocol: 0` and `expectedProtocol: 1`, and `/rpc` returns 409 with a message containing `plugin install`.
  - With `v=1` the round trip works.
- [X] T022 [P] [US1] Create `test/mcp.test.mjs`:
  - Spawn `node bin/figma-bridge.mjs mcp` with `FIGMA_BRIDGE_PORT` set to a free port and `FIGMA_BRIDGE_ROOT` set to a temp dir.
  - Write newline-delimited JSON-RPC frames and collect stdout lines.
  - Cases:
    - `initialize` with `2025-06-18` echoes that version.
    - `initialize` with `1999-01-01` gets `2025-06-18`.
    - `serverInfo` is `{ name: 'figma-bridge', version: <package.json version> }`.
    - `tools/list` names exactly match `mcpCommands().map(c => 'figma_' + c.name)`.
    - `tools/call figma_health` returns text containing `NOT connected`.
    - An unknown method with an id returns `-32601`.
    - Every stdout line is valid JSON.

  Kill the child in `after()`.

### Implementation for User Story 1

- [X] T023 [US1] In `bridge/plugin/manifest.json`, set `"name": "figma-bridge"`. Keep `id`. Rewrite `networkAccess.reasoning` so it no longer mentions bridge.mjs and reads: "Polls the local figma-bridge relay on localhost for read-only commands and posts the answers back. Loopback only, development plugin only — nothing leaves the machine and the document is never modified except the current selection."
- [X] T024 [US1] In `bridge/plugin/ui.html`:
  - Add `const PROTOCOL = 1;` next to `BRIDGE`, and append `'&v=' + PROTOCOL` to the `/pull` query.
  - Change the hint text to "Keep this window open — closing it disconnects Claude and the CLI from Figma."
  - Change the `<h1>` initial text to stay "connecting…".
- [X] T025 [US1] In `bridge/plugin/code.js`:
  - Add `const PROTOCOL = 1;` near the top.
  - Include `protocol: PROTOCOL` in the `ping` answer.
  - Rewrite the file header comment so it no longer references `tools/figma-cbar`, `spec.js` or `extract-*`. Describe it as "the Figma half of figma-bridge: a read-only command interpreter".
- [X] T026 [US1] In `bridge/relay.mjs`:
  - Record `plugin.protocol = Number(url.searchParams.get('v'))` (or `null`) on each `/pull`.
  - Add `plugin.protocol` and `expectedProtocol: PROTOCOL` to `health()`.
  - In `rpc()`, after the connected check, return `409 { error: 'The figma-bridge plugin in Figma is protocol v<X>, this server expects v<Y>. Run `npx @ubuligan/figma-bridge plugin install`, then close and re-run the plugin in Figma.' }` when the protocol differs.
  - Replace the 503 text with: "The figma-bridge plugin is not connected. In Figma desktop: Plugins → Development → figma-bridge." Keep the "was connected earlier" suffix.
  - In `result()`, when the plugin reports `ok:false` with an error starting `Unknown command`, finish with 409 instead of 500, using the message "The figma-bridge plugin in Figma does not know `<cmd>` — it is older than this server. Run `npx @ubuligan/figma-bridge plugin install`, then close and re-run the plugin in Figma." This covers commands added without a PROTOCOL bump.
  - Add a case to `test/relay.test.mjs`: a fake plugin handler that throws `Unknown command \`x\`.` produces 409 with `plugin install` in the message.
- [X] T027 [US1] Create `bridge/lib/plugin-files.mjs`:
  - `defaultPluginDir()` returns `path.join(os.homedir(), '.figma-bridge', 'plugin')`.
  - `install({ dir = defaultPluginDir(), port = PORT })` copies the three files from `new URL('../plugin/', import.meta.url)`. When `port !== DEFAULT_PORT` it rewrites `http://localhost:7332` in `manifest.json` (as JSON: `networkAccess.devAllowedDomains`) and in `ui.html` (string replace of the `BRIDGE` constant). It fails loudly if the replace matched 0 times, and returns `{ dir, manifest }`.
  - `pluginPath({ dir })` returns the manifest path if it exists, or throws `BridgeError('Plugin not installed in <dir>. Run: npx @ubuligan/figma-bridge plugin install', 'bad')`.
- [X] T028 [US1] Add `local` commands to `bridge/lib/commands.mjs`:
  - `plugin`: positional `action` (`install` | `path`), plus `dir` and `port`.
  - `setup`: no args.
  - `serve`: `port`.
  - `mcp`: no args. It is listed for help only, because `bin` routes it before the CLI.
- [X] T029 [US1] In `bridge/lib/tasks.mjs`, add `setupReport()`, which returns plain text listing:
  - Node version, and whether it satisfies `>=22.12.0`.
  - Port status, via `health()` (free / figma-bridge relay / held by something else).
  - Plugin install state at the default dir, with the manifest path.
  - The exact `claude mcp add` line for `process.platform`: win32 → `claude mcp add figma-bridge -s user -- cmd /c npx -y @ubuligan/figma-bridge mcp`, others → the same without `cmd /c`.
  - The Figma import menu path.

  It changes nothing on disk.
- [X] T030 [US1] In `bridge/lib/tasks.mjs`, update `healthReport()`:
  - Show `plugin: connected · <file> · <page>`.
  - When disconnected, show `NOT connected — in Figma desktop: Plugins → Development → figma-bridge (import <manifest path> first if it is not listed)`, using `pluginPath()` when the plugin is installed and otherwise the `plugin install` command.
  - Show a protocol mismatch line when `plugin.protocol !== expectedProtocol`.
  - Replace every "start it with `node tools/figma-bridge/bridge.mjs`" with `npx @ubuligan/figma-bridge serve`.
- [X] T031 [US1] In `bridge/mcp.mjs`:
  - Take `name`/`version` from `PACKAGE` in `protocol.mjs` (drop the hard-coded `'1.0.0'`).
  - Negotiate `protocolVersion` against `MCP_REVISIONS`, per research R11.
  - Build `tools` from `mcpCommands()`.
  - Rewrite `instructions` to: "Reads the Figma file open in Figma desktop through the local figma-bridge plugin — no API token, read-only. If a tool says the plugin is not connected, ask the user to run Plugins → Development → figma-bridge in Figma. Start with figma_pages / figma_screens / figma_find to locate ids, figma_view to see a screen, figma_node for structure."
  - Rewrite the header comment to drop "repo's .mcp.json".
  - Reword `OUT_ARG.description` to "Write the answer to this path inside the output root (the project folder) instead of returning it inline."
  - In `runTool`, when `ensureRelay()` reports `hosted: true` (another session's relay went away, or this is the first call), `await waitForPlugin()` before the plugin call. This covers the spec edge case of two Claude sessions where the first exits. When the relay was already running, keep failing fast on 503.
  - Add a case to `test/mcp.test.mjs`: start the MCP child with no relay running, start the fake plugin 1 s later on the same port, and assert that `tools/call figma_ping` succeeds instead of returning a 503 error.
- [X] T032 [US1] In `bridge/cli.mjs`:
  - Route `local` commands: `plugin install|path` → `plugin-files.mjs`, printing the manifest path and the Figma menu path. `setup` → `setupReport()`. `serve` → `startRelay({ port })` with console logging, waiting until SIGINT.
  - Port busy: if `/health` answers on the port, print "a figma-bridge relay is already running on <port>" and exit 0. Otherwise exit 1 naming the port and `FIGMA_BRIDGE_PORT`.
  - Usage header becomes `figma-bridge <command> [args] [-o <file>]`. The footer line becomes "Needs the figma-bridge plugin running in Figma desktop. Run `figma-bridge setup` for first-time setup."
- [X] T033 [US1] Remove the direct-run block at the bottom of `bridge/relay.mjs` (now `figma-bridge serve`), along with any remaining "CBAR" string in `bridge/relay.mjs`, `bridge/cli.mjs`, `bridge/mcp.mjs` and `bridge/lib/*.mjs`. Verify with `grep -ri cbar bridge bin`, which must find nothing
- [X] T034 [US1] Run `npm test`. T020–T022 must pass

**Checkpoint**: US1 is done. `figma-bridge setup` → `plugin install` → `claude mcp add` → Claude's `figma_health` shows connected (quickstart V3, V4, V7).

---

## Phase 4: User Story 2 – Read every page, screen and visual (Priority: P1)

**Goal**: Claude can list screens, *see* any screen as an image, and capture the whole file with previews.

**Independent Test**: quickstart V6, V8 + `test/plugin.test.mjs` + the `figma_view` case in `test/mcp.test.mjs`.

### Tests for User Story 2

- [X] T035 [P] [US2] Create `test/plugin.test.mjs`. It loads `bridge/plugin/code.js` source into a `node:vm` context with a stub global `figma`:
  - The root has 2 pages. Page A has a FRAME, a SECTION containing a FRAME and an INSTANCE, a GROUP, and a RECTANGLE.
  - `figma.ui.onmessage` is captured, `figma.ui.postMessage` is recorded, `figma.mixed` is a Symbol, and `exportAsync` resolves to a `Uint8Array` with a recorded `constraint`.
  - Stub `__html__` as `''`, and stub `figma.showUI`, `figma.on`, `figma.base64Encode` and `figma.loadAllPagesAsync`.

  Helper: `run(cmd, args)` sends `{type:'run', id, cmd, args}` and joins the chunks. Cases:
  - `ping` includes `protocol: 1`.
  - `screens` on page A returns the FRAME and the two section children, each with `section` set, and excludes GROUP and RECTANGLE.
  - `screens` with page `*` covers both pages.
  - `png` with `{scale: 2, maxEdge: 1568}` on a 1440×3200 node exports at scale 0.49 (±0.001) and reports `width`, `height`, `requestedScale` and `maxEdge`.
  - `png` without `maxEdge` keeps scale 2.
  - `node` output for a TEXT node with a mixed `fontSize` omits `fontSize`. This guards the existing serializer.
  - Serializer snapshot (FR-013): `node` at depth 3 on a FRAME with auto layout (padding, itemSpacing), a SOLID fill with opacity, a GRADIENT_LINEAR fill, a one-sided stroke (mixed `strokeWeight`), a DROP_SHADOW effect, per-corner radii, and a TEXT child. Compare it with `assert.deepStrictEqual` against a hand-written expected object in `test/fixtures/node-snapshot.json`, written from the current serializer's output before any plugin edits in Phase 3/4.
  - Read-only guard (FR-018): every stub node exposes mutating members (`remove`, `appendChild`, `insertChild`, `resize`, `setPluginData`, `setSharedPluginData`, and setters on `name`, `x`, `y`, `fills`, `characters`), and the stub `figma` exposes `createFrame`, `createRectangle`, `createText`, `createComponent` and `group`. All of them throw `new Error('mutation: <member>')`. Run every `where: 'plugin'` command except `select` against the stub and assert none throws a `mutation:` error. For `select`, assert that the only writes are `figma.currentPage.selection` and the `setCurrentPageAsync` / `scrollAndZoomIntoView` calls.
- [X] T036 [P] [US2] Add to `test/mcp.test.mjs` a case where the fake plugin answers `png` with a 1×1 PNG base64 and `width/height/scale` metadata plus `children`. Calling `tools/call figma_view {id:'1:2'}` returns `content[0]` of `{type:'image', mimeType:'image/png', data:<same base64>}` and a `content[1]` text containing the exported size and the child names
- [X] T037 [P] [US2] Create `test/capture.test.mjs`. Against a relay plus a fake plugin that answers `ping`, `variables`, `styles`, `index`, `sets` (1 set), `node`, `screens` (2 screens on 1 page) and `png`, first call `usePort(<free port>)` from `bridge/lib/rpc.mjs` and set `process.env.FIGMA_BRIDGE_ROOT` to a temp dir, then call `capture({ page: 'A', out: <tmp>/cap, depth: 2, previews: true }, log)`.
  - Assert that the files listed in data-model.md "CaptureFolder" exist, that `capture.json.counts.screens === 2`, and that `previews/a/<slug>--<id>.png` decodes to the stub bytes.
  - A second case with `previews: false` checks that there is no `previews/` directory.
  - A third case (SC-005, client-side cost) uses a fake plugin answering 50 screens and 10 sets instantly and asserts that `capture` finishes in under 10 s. This bounds the package's own overhead; Figma's export time is measured by hand in quickstart V8.

### Implementation for User Story 2

- [X] T038 [US2] In `bridge/plugin/code.js`, add `cmdScreens(args)` per research R7:
  - Use `getPages(args.page)`.
  - For each page, iterate `page.children`. Take the types FRAME, COMPONENT, COMPONENT_SET and INSTANCE directly, and descend one level into `SECTION` children for the same types, setting `section: <section name>`.
  - Return `{ count, screens: [{ id, name, type, page, section?, width, height }] }`, with rounded sizes from `absoluteBoundingBox`.
  - Add `case 'screens'` to `run()`.
- [X] T039 [US2] In the `png` case of `bridge/plugin/code.js`:
  - Accept `args.maxEdge`. Compute `requestedScale = clamp(Number(args.scale) || 2, 0.01, 4)`, and when `maxEdge` is given, `scale = min(requestedScale, maxEdge / max(w, h))`, clamped the same way.
  - Export with `{ type: 'SCALE', value: scale }`.
  - Return `{ id, name, type, scale, requestedScale, maxEdge, width: round(w*scale), height: round(h*scale), sourceWidth, sourceHeight, children: (node.children || []).slice(0, 40).map(brief), bytes, base64 }`.
- [X] T040 [US2] In `bridge/lib/commands.mjs`:
  - Add `screens` (`where: plugin`, arg `page`).
  - Add `maxEdge` (number, optional) to `png`.
  - Add `view` (`where: client`, `mcp: 'image'`, positional `id`, `maxEdge` default 1568, summary "See a screen or node as an image (scaled so its longest edge ≤ maxEdge). Use this to look at a design.").
  - Rename `dump` to `capture`, with args `page`, `out` (default `figma-bridge-out`), `depth` (default 5) and `previews` (boolean, default true), and a summary covering variables, styles, component sets, screens and one preview PNG per screen.
  - Keep a `dump` entry with the same args, whose summary is "Alias of capture.".
- [X] T041 [US2] In `bridge/lib/tasks.mjs`:
  - Rename `dump` to `capture`.
  - After the existing variables/styles/index/sets/set dumps, call `screens` → `screens.json`.
  - If `args.previews`, then for each screen call `png { id, maxEdge: 1568 }` and write `previews/<slug(page)>/<slug(name)>--<slug(id)>.png`. Continue on per-screen failure, collecting the failures as `icons()` does.
  - Write `capture.json` last: `{ file, page, createdAt: ISO, package: PACKAGE.version, protocol: PROTOCOL, counts: { sets, screens, previews, failed } }`.
  - Export `view(args)`, which calls `png` with `{ id, scale: 2, maxEdge }` and returns `{ meta, base64 }`.
- [X] T042 [US2] In `bridge/mcp.mjs`:
  - When `cmd.mcp === 'image'`, call `view()` and return `{ content: [ { type: 'image', mimeType: 'image/png', data: base64 }, { type: 'text', text: '<name> (<type>) — <sourceW>×<sourceH> → exported <w>×<h> at scale <s>. Children: <name id, …>' } ] }`. The 64 kB inline rule does not apply to images.
  - Route `capture` and `dump` to `capture()`.
- [X] T043 [US2] In `bridge/cli.mjs`:
  - `view <id> [--max-edge]`: with `-o file.png`, write the decoded PNG through `writeOut`. Without it, print the metadata line to stdout and the hint "add -o <file>.png to save" to stderr.
  - Route `capture` and `dump` to `capture()`.
- [X] T044 [US2] Update `data-model.md` "ImageExport" in `specs/001-npm-figma-bridge/data-model.md` to list the final `png` answer fields from T039 (adds `type`, `sourceWidth`, `sourceHeight` and `children`)
- [X] T045 [US2] Run `npm test`. T035–T037 must pass

**Checkpoint**: US1 and US2 are done. Claude can list screens, view them and capture a file (quickstart V6, V8).

---

## Phase 5: User Story 3 – Same capabilities from a terminal (Priority: P2)

**Goal**: The CLI works from any folder without a separately started relay, and follows the exit-code and stream contract.

**Independent Test**: quickstart V9 + `test/cli.test.mjs`.

### Tests for User Story 3

- [X] T046 [P] [US3] Create `test/cli.test.mjs`. Spawn `node bin/figma-bridge.mjs` with `FIGMA_BRIDGE_PORT` set to a free port and `cwd`/`FIGMA_BRIDGE_ROOT` set to a temp dir. Cases:
  - No args → exit 2, usage on stderr.
  - `--help` → exit 0, usage on stdout containing every command name and not containing `CBAR`.
  - `--version` → prints the package.json version.
  - `nope` → exit 2.
  - `find` → exit 2 with "missing required argument `query`".
  - `node 1:1 --bogus` → exit 2 with "Unknown flag".
  - With a fake plugin running on that port: `pages` → exit 0, and stdout parses as JSON.
  - `node 1:2 -o ../escape.json` → exit 1 with "Refusing to write outside".
  - With no plugin: `ping` exits 1 within 12 s with the Figma menu path on stderr.
  - `NO_COLOR=1` → no `\x1b[` in the output.
  - Local commands (G2): `plugin install --dir <tmp>/p` → exit 0, stdout contains the absolute `manifest.json` path, and the file exists. `plugin path --dir <tmp>/empty` → exit 1 with `plugin install` in stderr. `setup` → exit 0, stdout contains `claude mcp add figma-bridge`, and on win32 it also contains `cmd /c`. With a relay already started by the test on the port, `serve` → exit 0 with "already running". With a plain `net` server holding the port, `serve` → exit 1 naming the port.

### Implementation for User Story 3

- [X] T047 [US3] In `bridge/lib/rpc.mjs`, make `call()` map HTTP 409 to kind `'protocol'`. `waitForPlugin` already exists from T011
- [X] T048 [US3] In `bridge/cli.mjs`, before any `plugin`/`client` command:
  - `await ensureRelay({ log: line => process.stderr.write(line + '\n') })`, then `await waitForPlugin()`. This applies only when the relay was hosted by this process; when an existing relay answered, check `connected` once and fail fast.
  - Exit codes: usage errors (unknown command, unknown flag, missing required argument, unexpected positional) → 2, runtime `BridgeError` → 1.
  - Progress and timings go to stderr, answers to stdout.
  - Honour `NO_COLOR` (and a non-TTY stderr) by blanking the ANSI constants.
  - After the answer, close the in-process relay so the process exits.
- [X] T049 [US3] In `bridge/cli.mjs`, make `printAnswer` keep its 200 kB guard but print the hint to stderr and exit 0. Make `commandHelp` use `figma-bridge <name>` instead of `node cli.mjs <name>`
- [X] T050 [US3] Run `npm test`. T046 must pass

**Checkpoint**: `npx @ubuligan/figma-bridge pages > pages.json` works from any folder with only the Figma plugin open.

---

## Phase 6: User Story 4 – Clean package with only what users need (Priority: P2)

**Goal**: The tarball matches the allow-list, contains no private-repo names, and ships a first-time-user README.

**Independent Test**: `npm run check:pack` + quickstart V2.

### Tests for User Story 4

- [X] T051 [P] [US4] Create `scripts/check-pack.mjs`:
  - Run `npm pack --dry-run --json` via `child_process.execFileSync`. On win32 run `npm.cmd` with `shell: true`.
  - Parse `files[].path`.
  - Assert set-equality with the allow-list in `specs/001-npm-figma-bridge/contracts/package-surface.md`, kept in sync as a const array in the script.
  - Read each listed file from disk and assert no case-insensitive match for the forbidden words listed in that contract.
  - Assert that `bin/figma-bridge.mjs` starts with `#!/usr/bin/env node\n` and contains no `\r`.
  - Assert that `package.json` has no dependency fields and no install scripts.
  - Print a diff, exit 1 on failure, and exit 0 printing "pack OK (<n> files)".
- [X] T052 [P] [US4] Create `test/pack.test.mjs`, which runs `node scripts/check-pack.mjs` and asserts exit 0

### Implementation for User Story 4

- [X] T053 [P] [US4] Clean up the comments in `bridge/plugin/code.js` (serializer comments that mention `spec.js`), `bridge/lib/commands.mjs` (the `node` summary mentions `spec.js and the extract-* scripts`; reword to "the exact shape GET /v1/files/:key/nodes returns, so tools written for the REST API read it unchanged"), `bridge/lib/tasks.mjs` (the `icons` docs mention `gen-icons.js`; reword to "one .svg per icon, named from an icon map or the component name"), and `bridge/cli.mjs` (the header examples use `tools/figma-bridge/...`). Keep every comment explaining *why*
- [X] T054 [P] [US4] Create `LICENSE` with the MIT text, `Copyright (c) 2026 Javid Salimov`
- [X] T055 [P] [US4] Create `CHANGELOG.md` in Keep a Changelog format. Under `## [1.0.0] - <release date>`:
  - **Added**: `screens`, `view`/`figma_view` image results, `capture` with previews, `plugin install|path`, `setup`, `serve`, protocol handshake, `FIGMA_BRIDGE_ROOT`.
  - **Changed**: single `figma-bridge` bin; plugin renamed to figma-bridge; outputs default to `./figma-bridge-out`; `dump` is now an alias of `capture`.
  - **Security**: writes confined to the output root.
- [X] T056 [US4] Rewrite `README.md` for external users, moving the current `bridge/README.md` into the root with `git mv` first. Sections:
  - One-line pitch (local, free, read-only Figma access for Claude; no token, no paid plan).
  - Requirements (Figma desktop, Node ≥ 22.12, Claude Code).
  - Quick start in exactly 4 steps: `npx @ubuligan/figma-bridge plugin install`, the Figma import menu path, `claude mcp add` (with a Windows/macOS/Linux tab-style pair), and running the plugin and asking Claude "is Figma connected?".
  - What you can ask Claude (examples).
  - Commands table, generated from `COMMANDS` by hand and matching `--help`.
  - CLI usage.
  - Output folder & `FIGMA_BRIDGE_ROOT`.
  - Changing the port (both halves).
  - Updating (`plugin install` again).
  - How it works (keep the existing diagram, retitled).
  - Security (loopback only, read-only, write confinement, `devAllowedDomains` explanation kept).
  - Limits (keep the existing list, plus tall screens downscale, plus the multi-file last-poller rule).
  - Troubleshooting (health states, 409, port busy).
  - License.

  It must not mention CBAR, template5, figma-cbar, redesign-figma, husky, spec.js, extract-*, gen-icons or tools/ paths.
- [X] T057 [US4] Run `npm run check:pack` and `npm test`. Both must pass

**Checkpoint**: The tarball is publishable as far as content goes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T058 [P] Create `.github/workflows/ci.yml`:
  - Triggers: `push` and `pull_request`.
  - Matrix: `os: [ubuntu-latest, windows-latest, macos-latest]`, `node: [22, 24]`.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: ${{ matrix.node }}`, `npm test`.
  - No `npm install` step (there are no dependencies), and no publish job.
- [X] T059 [P] Add `// @ts-check` plus JSDoc types for exported functions in `bridge/relay.mjs`, `bridge/cli.mjs`, `bridge/mcp.mjs`, `bridge/lib/*.mjs` and `bin/figma-bridge.mjs`, where they are missing. Do not add it to `bridge/plugin/code.js`, because its `figma` global has no types without the dev dependency
- [X] T060 Search the repo for leftovers: `grep -rniE "cbar|template5|figma-cbar|tools/figma-bridge|bridge\.mjs|startBridge|ensureBridge" bin bridge test scripts README.md CHANGELOG.md package.json` must return nothing. Confirm that `test/smoke.test.mjs` is gone
- [X] T061 Run quickstart V1–V3 locally (`npm test`, `npm run check:pack`, `npm pack`, then `npx <tgz> --version|--help|plugin install --dir … [--port 7444]` from a temp directory outside the repo). Record the results in `specs/001-npm-figma-bridge/quickstart.md` under a new `## Results` section
- [ ] T062 Ask the user to run quickstart V4–V9 with Figma desktop open, because they need Figma and Claude interactively. Fold the outcomes of the unverified items (R4 cwd, R6 image limits, R12 `cmd /c`) into `README.md` and `research.md`, changing "to verify" to verified or corrected
- [ ] T063 Publishing is done by the user and is not automated: `npm login` as `ubuligan`, then `npm publish`. Put this step in the final report only; do not run it

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: starts immediately.
- **Foundational (Phase 2)**: depends on Setup and blocks every story.
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Foundational. They touch some of the same files (`code.js`, `commands.mjs`, `mcp.mjs`, `tasks.mjs`, `cli.mjs`), so run them sequentially, US1 first.
- **US3 (Phase 5)**: depends on Foundational. It edits `cli.mjs`/`rpc.mjs` after US1 and US2 to avoid conflicts.
- **US4 (Phase 6)**: depends on US1–US3, because the README and pack audit describe and scan their final output.
- **Polish (Phase 7)**: depends on all stories.

### Task-level dependencies worth noting

- T002 → T009, T011 (renamed module and symbol)
- T008 → T009, T011, T014, T026, T031
- T011 (`usePort`, `waitForPlugin`, `ensureRelay().hosted`) → T031, T037, T047, T048
- T035's serializer snapshot fixture is written before T038 and T039 touch `code.js`. T025 only adds `PROTOCOL` to `ping` and rewrites the header comment; it must not change `serialize()`
- T010 → T012, T016, T043
- T014 → T022, T046 (tests spawn the bin)
- T015 → T018, T021, T022, T036, T037, T046
- T027 → T020, T029, T030, T032
- T038, T039 → T041 → T042, T043
- T047 → T048
- T051 → T052, T057
- T056 depends on the command set being final (T040)

### Within each story

Tests are written first and fail. Then plugin side (`code.js`), registry (`commands.mjs`), composites (`tasks.mjs`), front doors (`mcp.mjs`, `cli.mjs`), and finally the full `npm test`.

---

## Parallel Examples

### Phase 2

```text
T015 test/helpers/fake-plugin.mjs
T016 test/output.test.mjs
T017 test/commands.test.mjs
```

### User Story 1 tests

```text
T020 test/plugin-files.test.mjs
T021 test/relay.test.mjs (protocol cases)
T022 test/mcp.test.mjs
```

### User Story 2 tests

```text
T035 test/plugin.test.mjs
T036 test/mcp.test.mjs (figma_view case)   # same file as T022 → only after T022 is merged
T037 test/capture.test.mjs
```

### User Story 4

```text
T051 scripts/check-pack.mjs
T053 comment cleanup (bridge/plugin/code.js, lib/commands.mjs, lib/tasks.mjs, cli.mjs)
T054 LICENSE
T055 CHANGELOG.md
```

---

## Implementation Strategy

### MVP (User Story 1)

1. Phase 1 → Phase 2 → Phase 3.
2. **Stop and validate**: quickstart V3, V4, V7. Claude connects to Figma through the renamed plugin. The existing read tools already work at this point.

### Incremental delivery

1. MVP: install and connect.
2. Add US2: screens, view and capture. This is the headline value against the paid MCP.
3. Add US3: the CLI auto-hosts the relay and uses consistent exit codes.
4. Add US4: README, LICENSE, CHANGELOG and pack audit → publishable.
5. Polish: CI, types, quickstart results → `npm publish` by the user.

---

## Notes

- 63 tasks. Commit after each phase checkpoint with a Conventional Commit message (e.g. `refactor: move figma-bridge to bridge/`, `feat(mcp): figma_view returns an image`).
- Never weaken a test to make it pass. If a contract has to change, update the matching file in `contracts/` in the same commit.
- Anything marked "to verify" in research.md stays unverified until T062.
