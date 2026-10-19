# figma-bridge

**Let Claude read the Figma file you have open — locally, for free, read-only.**

A small Figma plugin and a local MCP server. Claude can list pages and screens, *see* any screen
as an image, and read structure, variables, styles, CSS and text from the file open in Figma
desktop. You don't need an API token, a paid plan or a rate limit, and nothing leaves your machine.

```
Figma plugin ──GET /pull (long-poll)──►  relay   ◄── figma-bridge mcp  (Claude Code)
             ──POST /result (chunked)─►  localhost:7332  ◄── figma-bridge <cmd> (terminal)
```

## Requirements

- **Figma desktop** (development plugins can't be imported in the browser)
- **Node.js 22.12** or newer
- **Claude Code** for the MCP part. The CLI works without it.

## Quick start

**1. Install the plugin files**

```sh
npx @ubuligan/figma-bridge plugin install
```

This copies the plugin to `~/.figma-bridge/plugin/` and prints the path of its `manifest.json`.

**2. Import the plugin into Figma (one time only)**

In Figma desktop, open **Plugins → Development → Import plugin from manifest…** and pick the
`manifest.json` from step 1.

**3. Register the MCP server with Claude Code**

macOS / Linux:

```sh
claude mcp add figma-bridge -s user -- npx -y @ubuligan/figma-bridge mcp
```

Windows:

```sh
claude mcp add figma-bridge -s user -- cmd /c npx -y @ubuligan/figma-bridge mcp
```

**4. Run the plugin and ask Claude**

Open your file and run **Plugins → Development → figma-bridge**. Leave its window open; a green
dot means it has found the relay. Then ask Claude: *"Is Figma connected?"*

Not sure where you are? `npx @ubuligan/figma-bridge setup` checks Node, the port and the plugin,
and prints these steps with your actual paths.

## What you can ask Claude

- "List the pages and the screens on *Checkout*."
- "Show me the *Login* screen and describe its layout."
- "What colour and text variables does this file define? Give me CSS custom properties."
- "Get Figma's CSS for node 12:345 and build it as a React component."
- "Capture the *Design System* page into this project."

## Commands

The same commands are available as MCP tools (`figma_<name>`) and on the command line
(`figma-bridge <name>`). Run `figma-bridge <name> --help` to see the flags for a command.

| Command | What it answers |
| --- | --- |
| `ping` | which file and page the plugin is on, what is selected |
| `pages` | every page with its id |
| `index [--page]` | top-level nodes of a page — the cheapest way to find an id |
| `screens [--page]` | every screen (frame / component / instance on the page or in a section) with size |
| `find <query> [--type] [--page] [--limit]` | search by name (`substring` or `/regex/i`) and type |
| `node <id> [--depth]` | node dump in the exact shape of the REST `GET /v1/files/:key/nodes` |
| `selection [--depth]` | the same, for whatever is selected |
| `view <id> [--maxEdge]` | **the node as an image** (Claude sees it; the CLI saves it with `-o x.png`) |
| `sets [--page]` | component sets with their variant axes |
| `components [--page]` | components with their publish keys |
| `variables` | variable collections, modes and values, with aliases resolved |
| `styles` | local paint, text, effect and grid styles |
| `css <id>` | Figma's own computed CSS for a node |
| `text <id>` | every text layer with its type style |
| `svg <id>` / `png <id>` | exports (`-o file.svg` / `-o file.png` writes the file itself) |
| `select <id>` | moves Figma to the node: switches page, selects it, zooms in |
| `capture [--page] [--out] [--depth] [--previews]` | everything above in one folder, plus a preview PNG per screen |
| `icons [--map] [--page] [--match] [--out]` | one `.svg` per icon component |
| `health` | is the relay up, is the plugin connected |

Setup commands (CLI only): `setup`, `plugin install|path`, `serve`, `mcp`.

## Using the CLI

```sh
npx @ubuligan/figma-bridge screens --page "*"
npx @ubuligan/figma-bridge view 12:345 -o login.png
npx @ubuligan/figma-bridge node 12:345 --depth 4 -o login.json
npx @ubuligan/figma-bridge capture --page "Design System"
```

A command starts the relay itself if neither Claude Code nor `figma-bridge serve` is running, and
waits a few seconds for the plugin to find it. Answers go to stdout and progress to stderr, so
`figma-bridge pages > pages.json` always gives valid JSON. Exit codes are `0` ok, `1` failure and
`2` usage error. Set `NO_COLOR=1` to turn off colour.

## Where files are written

Everything is written inside the **output root**: the folder you start Claude or the CLI from,
or `FIGMA_BRIDGE_ROOT` if you set it. The default folder is `./figma-bridge-out/`; add it to your
`.gitignore`. A path outside the root is refused, even when Claude asks for it.

If Claude writes to an unexpected folder, pin it when registering the server:

```sh
claude mcp add figma-bridge -s user -e FIGMA_BRIDGE_ROOT=/path/to/project -- npx -y @ubuligan/figma-bridge mcp
```

## Changing the port

The default port is **7332**. The plugin calls a fixed address, so change both halves together:

```sh
npx @ubuligan/figma-bridge plugin install --port 7444
claude mcp add figma-bridge -s user -e FIGMA_BRIDGE_PORT=7444 -- npx -y @ubuligan/figma-bridge mcp
```

Then close and re-run the plugin in Figma. Set `FIGMA_BRIDGE_PORT=7444` for CLI use too.

## Updating

After a new version, run `npx @ubuligan/figma-bridge plugin install` again and re-run the plugin.
You don't need to import it into Figma again. If the plugin is out of date, Claude and the CLI
tell you to do exactly this.

## How it works

- **The plugin polls; the relay never calls Figma.** A Figma plugin can only make outgoing
  requests, so the plugin window keeps a `GET /pull` open for 25 s at a time. A command that
  arrives during that time is handed over on that request.
- **Answers are chunked end to end.** The plugin sends answers in 3 MB slices and the relay
  reassembles them, so multi-megabyte dumps survive intact.
- **Claude Code hosts the relay.** `figma-bridge mcp` starts the relay in its own process, and a
  CLI command in another terminal uses that same relay.
- **Large text answers stay out of the context window.** An answer over 64 kB is written to
  `figma-bridge-out/`, and Claude gets the path plus an outline instead. Images always go to
  Claude directly.

## Security

- The relay listens on `127.0.0.1` and `::1` only, never on a network interface. It has no
  authentication, so anything running on your machine can query it while it's up.
- It is **read-only** towards your document. The only thing that changes anything in Figma is
  `select`, and it only changes the current page, selection and zoom.
- Writes are confined to the output root (see above).
- The plugin's manifest allows exactly one address, `http://localhost:<port>`, under
  `devAllowedDomains`. Figma rejects loopback addresses in `allowedDomains`, and
  `devAllowedDomains` only applies to plugins imported from a manifest, which is how this one runs.

## Limits

- The plugin window has to stay open. If you close it, commands fail within a second with a
  message telling you to reopen it.
- `health` can report the plugin as connected for up to 45 s after its window was closed.
- If the plugin is open in two files at once, the one that polled most recently answers.
- The first command that reaches beyond the current page loads the other pages once, which can
  take a few seconds on a big library.
- A very tall screen becomes narrow when it is scaled to fit 1568 px. `view` lists the screen's
  children so you can view a section by its id instead.
- Vector geometry is not part of `node` output; use `svg` for it.

## Troubleshooting

| You see | Do this |
| --- | --- |
| `plugin: NOT connected` | Run **Plugins → Development → figma-bridge** in Figma desktop and keep the window open |
| "…protocol v0, this server expects v1" or "plugin … is older than this server" | `npx @ubuligan/figma-bridge plugin install`, then close and re-run the plugin |
| "port 7332 is not available" | Another program has the port: see [Changing the port](#changing-the-port) |
| The plugin shows "waiting for Claude or the CLI" | Start Claude Code, or run any CLI command, or `figma-bridge serve` |
| "Refusing to write outside …" | Give a path inside your project, or set `FIGMA_BRIDGE_ROOT` |

## License

[MIT](./LICENSE) © Javid Salimov
