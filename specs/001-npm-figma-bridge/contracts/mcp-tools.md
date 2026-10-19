# Contract: MCP server

Pinned by `test/mcp.test.mjs` (spawns `bin/figma-bridge.mjs mcp`, speaks newline-delimited
JSON-RPC 2.0 over stdio).

## Server

- `serverInfo`: `{ name: "figma-bridge", version: <package.json version> }` — version read from `package.json`, not hard-coded.
- `protocolVersion`: the client's requested revision if it is one of `2025-06-18`, `2025-03-26`, `2024-11-05`; otherwise `2025-06-18`.
- `capabilities`: `{ tools: {} }`.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list` (empty), `prompts/list` (empty); notifications `notifications/initialized`, `notifications/cancelled` ignored; anything else with an id → `-32601`.
- The relay is hosted on `initialize` (existing behaviour).

## Tools

Name = `figma_<command>` for every command with `where` ∈ {`plugin`, `client`}. Input schema is
generated from the command registry. Every plugin command except those owning `out` also accepts
`out: string` (write inside the output root instead of returning inline).

| Tool | New? | Result |
| --- | --- | --- |
| `figma_health` | | text |
| `figma_ping`, `figma_pages`, `figma_index`, `figma_find`, `figma_sets`, `figma_components`, `figma_styles`, `figma_css`, `figma_text`, `figma_select` | | text (JSON) |
| `figma_node`, `figma_selection`, `figma_variables` | | text (JSON); > 64 kB → spilled to `<root>/figma-bridge-out/…` and the text gives path + outline |
| `figma_svg` | | text (JSON with `svg`) |
| `figma_png` | | text (JSON with base64) — kept for compatibility; prefer `figma_view` |
| `figma_icons` | | text summary |
| `figma_screens` | yes | text (JSON `{ count, screens: Screen[] }`) |
| `figma_view` | yes | **image** — see below |
| `figma_capture` | yes | text summary + folder path (`figma_dump` remains as an alias) |

### `figma_view`

Input:

```json
{ "type": "object",
  "properties": {
    "id": { "type": "string", "description": "node id, e.g. 12:345" },
    "maxEdge": { "type": "number", "default": 1568, "description": "longest edge in pixels" } },
  "required": ["id"] }
```

Result:

```json
{ "content": [
    { "type": "image", "mimeType": "image/png", "data": "<base64>" },
    { "type": "text", "text": "Checkout / Payment (FRAME) — 1440×3200 → exported 705×1568 at scale 0.49. Children: Header 12:1, Form 12:7, Footer 12:40" } ] }
```

## Errors

A failing tool returns `{ content: [{ type: "text", text: "Error: <message>" }], isError: true }`,
never a JSON-RPC error. Messages name the next step (open the plugin, reinstall the plugin,
smaller depth, …).

## Stdout discipline

Nothing but JSON-RPC frames on stdout — relay logs and diagnostics go to stderr. The test fails if
any non-JSON line appears on stdout.
