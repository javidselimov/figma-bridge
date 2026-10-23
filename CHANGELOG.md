# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1]

### Fixed

- An MCP tool call sent right after `initialize` no longer fails with "plugin is not connected" instead of waiting for the plugin: overlapping relay starts now share one attempt.

## [1.0.0]

First public release as `@ubuligan/figma-bridge`.

### Added

- `figma_view` / `figma-bridge view`: a screen or node as an image, scaled so its longest edge fits `maxEdge` (default 1568 px). Over MCP the result is an image block, so Claude sees the design.
- `screens`: every frame, component or instance placed on a page or directly inside a section.
- `capture`: variables, styles, component sets, the screen list and one preview PNG per screen, written to one folder with a `capture.json` manifest.
- `plugin install` / `plugin path`: copies the Figma plugin to `~/.figma-bridge/plugin`, so the imported plugin survives `npx` cache changes. `--port` rewrites both plugin files.
- `setup`: a read-only first-time checklist that prints the exact `claude mcp add` line for your OS.
- `serve`: runs the relay in the foreground.
- Protocol handshake between the plugin and the server. An outdated plugin gets a "run `plugin install`" message instead of a confusing error.
- `FIGMA_BRIDGE_ROOT` chooses where answers are written.
- `png --maxEdge`.

### Changed

- One `figma-bridge` executable with subcommands. The MCP server is `figma-bridge mcp`.
- The plugin is named **figma-bridge** in Figma.
- Output defaults to `./figma-bridge-out/` in the folder you run from.
- CLI read commands start the relay themselves and wait briefly for the plugin. Exit codes are 0 (ok), 1 (runtime failure) and 2 (usage error). Answers go to stdout and everything else to stderr.
- The MCP server negotiates the protocol revision and reports the package version.
- `dump` is now an alias of `capture`.

### Security

- Writes are confined to the output root. A path outside it, including one supplied by a model, is refused.
- When `[::1]` is held by another program, the relay refuses to start, so the plugin can never end up talking to someone else's server.
