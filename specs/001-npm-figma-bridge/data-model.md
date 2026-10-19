# Phase 1 Data Model

No database. These are the in-memory and on-disk shapes the package owns. Field names are the
ones that appear on the wire or on disk; anything marked *existing* is already produced today
and must not change shape (FR-013).

## PluginSession (relay memory)

The relay's view of the Figma plugin.

| Field | Type | Notes |
| --- | --- | --- |
| `seen` | boolean | ever polled since relay start |
| `lastSeen` | epoch ms | updated on every `/pull` |
| `file` | string \| null | Figma file name, sent by the plugin |
| `page` | string \| null | current page name |
| `protocol` | integer \| null | **new** — `v` query param on `/pull` (R9) |

- **Derived** `connected = now - lastSeen < 45 000 ms` (existing STALE window).
- **Derived** `compatible = protocol === PROTOCOL`.
- When the plugin is open in several files, the last poller overwrites `file`/`page` (documented limit).

## Job (relay memory)

One command in flight.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | monotonically increasing per relay process |
| `cmd` | string | must be a `where: 'plugin'` command name |
| `args` | object | already normalised by the client |
| `sentAt` | epoch ms \| undefined | set when handed to a poll |
| `chunks` | string[] | indexed by `seq`; holes → 502 |

State transitions:

```
queued ──(poll arrives)──► sent ──(final chunk, no holes)──► done 200
   │                         ├──(plugin reports error)─────► failed 500
   │                         ├──(final chunk, holes)───────► failed 502
   └──────────(timeout)──────┴──(timeout)──────────────────► timed-out 504
rpc with no connected plugin ─────────────────────────────► rejected 503
rpc with incompatible plugin ─────────────────────────────► rejected 409 (new)
```

## CommandSpec (`bridge/lib/commands.mjs`)

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | CLI subcommand; MCP tool is `figma_<name>` |
| `where` | `'plugin' \| 'client' \| 'local'` | `local` (**new**) = never talks to Figma (`plugin`, `setup`) and is not exposed via MCP |
| `summary` | string | CLI help and MCP description; must not mention private-repo names |
| `args` | `Record<string, Arg>` | `{ type, desc, positional?, required?, default? }` |
| `big` | boolean? | 300 s timeout instead of 120 s |
| `artifact` | `'svg' \| 'png'`? | `-o` with matching extension writes the artefact itself |
| `mcp` | `'text' \| 'image'`? | **new** — `image` makes the MCP result an image content block |

Validation: `normalise()` applies defaults, coerces numbers/booleans, rejects missing required
args, drops unknown keys (existing behaviour, now unit-tested).

## Screen (new, plugin → client)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Figma node id `123:456` |
| `name` | string | |
| `type` | `FRAME \| COMPONENT \| COMPONENT_SET \| INSTANCE` | |
| `page` | string | page name |
| `section` | string? | name of the parent top-level SECTION, if any |
| `width`, `height` | integer | rounded `absoluteBoundingBox` |

Rule (R7): parent is a `PAGE`, or a `SECTION` whose parent is a `PAGE`.

## ImageExport (new fields on the existing `png` answer)

Existing: `{ id, name, scale, bytes, base64 }`. Added: `width`, `height` (exported pixel size),
`requestedScale`, `maxEdge?`. Rule: `scale = min(requestedScale, maxEdge / max(w, h))`,
clamped to `[0.01, 4]`.

## OutputRoot

| Field | Source | Notes |
| --- | --- | --- |
| `root` | `FIGMA_BRIDGE_ROOT` ?? `process.cwd()` | resolved to absolute once at start |
| `defaultOut` | `<root>/figma-bridge-out` | |

Validation: target `t` is allowed iff `rel = path.relative(root, resolve(root, t))` is `''` or
(not absolute and does not start with `..`). Otherwise `Refusing to write outside <root>: <t>`.

## CaptureFolder (on disk, extends existing `dump`)

```
<out>/
├── capture.json          # NEW manifest: { file, page, createdAt, packageVersion, protocol, counts }
├── variables.json        # existing
├── styles.json           # existing
├── index.json            # existing (omitted for page "*")
├── sets.json             # existing
├── <slug>-set.json       # existing, one per component set
├── screens.json          # NEW — Screen[]
└── previews/
    └── <page-slug>/<screen-slug>--<id-slug>.png   # NEW — one per screen, maxEdge 1568
```

`--previews false` skips the PNGs; `--depth` applies to set dumps as today.

## InstalledPlugin (on disk)

```
~/.figma-bridge/plugin/      # or --dir
├── manifest.json            # devAllowedDomains rewritten if --port given
├── code.js
└── ui.html                  # BRIDGE constant rewritten if --port given
```

Installing overwrites these three files only; any other file in the directory is left alone.
