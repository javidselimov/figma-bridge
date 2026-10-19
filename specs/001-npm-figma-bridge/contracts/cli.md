# Contract: CLI `figma-bridge`

Pinned by `test/cli.test.mjs`. Invocations shown with the bin name; `npx @ubuligan/figma-bridge`
is equivalent.

## Synopsis

```
figma-bridge <command> [positionals] [--flag value | --flag=value | --bool] [-o <file>]
figma-bridge --version | -v
figma-bridge --help | -h | help
figma-bridge <command> --help
```

## Commands

### Process / setup (`where: local`, not exposed via MCP)

| Command | Behaviour |
| --- | --- |
| `mcp` | Run the MCP stdio server (what `claude mcp add` launches). Never prints to stdout except JSON-RPC frames. |
| `serve` | Run the relay in the foreground until Ctrl+C. Exit 1 if the port is held by something that is not a figma-bridge relay. |
| `plugin install [--dir <path>] [--port <n>]` | Copy plugin files to `--dir` (default `~/.figma-bridge/plugin`), rewrite port if given, print the manifest path. Idempotent. |
| `plugin path [--dir <path>]` | Print the manifest path that `install` would use; exit 1 with a hint if not installed yet. |
| `setup` | Print-only checklist: Node version check, port check, plugin install state, the exact `claude mcp add …` line for this OS. Changes nothing. |

### Read commands (`where: plugin` / `client`, also MCP tools)

Unchanged from today unless marked: `health`, `ping`, `pages`, `index`, `find`, `node`,
`selection`, `sets`, `components`, `variables`, `styles`, `css`, `text`, `svg`, `png`, `select`,
`icons`; **new** `screens [--page]`, `view <id> [--maxEdge 1568]` (writes PNG with `-o`, else prints a summary), `capture [--page] [--out] [--depth] [--previews]` (supersedes and aliases `dump`).

Argument syntax, defaults and help text come from `bridge/lib/commands.mjs`, the single source of
truth shared with the MCP tool schemas.

## Output root

- Root = `$FIGMA_BRIDGE_ROOT` or the current directory.
- `-o`/`--out` relative paths resolve against the root; any target outside the root is refused
  (exit 1, message `Refusing to write outside <root>: <target>`).
- Defaults: `capture` → `figma-bridge-out/`, `icons` → `figma-bridge-out/svg/`.

## Relay hosting

A read command reuses a relay already listening on the port, or hosts one in-process.

- **Hosted by this process**: the plugin has not polled it yet, so the command waits up to 8 s for the plugin before sending.
- **Relay was already running**: its plugin state is current, so a disconnected plugin fails immediately.

Either way, a missing plugin means exit 1 with the Figma menu path.

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `FIGMA_BRIDGE_PORT` | `7332` | relay port (plugin must be installed with the same `--port`) |
| `FIGMA_BRIDGE_ROOT` | cwd | output root |
| `NO_COLOR` | unset | disables ANSI colour |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | runtime failure: plugin not connected, timeout, plugin error, write refused, port busy |
| 2 | usage error: unknown command, unknown flag, missing required argument |

## Streams

Answers → stdout. Progress, timings, warnings, errors → stderr. So `figma-bridge pages > pages.json` always yields valid JSON.
