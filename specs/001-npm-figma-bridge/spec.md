# Feature Specification: Publish figma-bridge as a standalone npm package

**Feature Branch**: `001-npm-figma-bridge`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "men bu reponu ona gore acmihsam ki isteyirem ki figma bridgeni bir npm paketi kimi istifadeye buraxim buna gore plugin adini cbar figma bridge etmeyek figma-bridge edek ve hazirda C:\Users\cavid\Downloads\jspace\npmpackages\figma-bridge\figma-bridge bu folderin adini bridge deyishek. bundan bashqa lazimsiz fayllari silek sadece istifadeciye elave imkanlar yaradaq firgma appdan istifade ederek plugini aktivleshdirdikden sonra claude ile mcp serverin qalxdiginia emin olduqdan sonra rahat shekilde figmadaki butun silleri vizuallari oxuya bilsin. bu vasite ile figmanin odenishli mcp sindense bunu lokal qaldiraraq rahat istifade ede bilisin. elave suallin varsa onlari da ver."

(Summary in English: release the existing figma-bridge as a public npm package; rename the Figma plugin from "CBAR Figma bridge" to "figma-bridge"; rename the source folder `figma-bridge/` to `bridge/`; remove files that only made sense in the original private repo; let any user activate the plugin in the Figma app, confirm the MCP server is up in Claude, and then read every page, screen and visual of their Figma file locally — a free, local alternative to Figma's paid MCP offering.)

## Context

The bridge already works inside a private project: a Figma plugin waits for commands, a local relay passes them along, and both a terminal tool and an MCP server for Claude send the commands. It is tied to that project by its name ("CBAR"), by paths it assumes exist (`tools/figma-bridge/`, `template5`, `figma-cbar`, `spec.js`, `gen-icons.js`), by a rule that decides where it may write files, and by an unused image in the plugin folder. This feature turns it into something a stranger can install and use without knowing that project existed.

## Clarifications

### Session 2026-10-19

- Q: npm package name? → A: `@ubuligan/figma-bridge`
- Q: Plugin distribution in v1? → A: Development-plugin import from the installed package only; no Figma Community publish.
- Q: Read-only or editing? → A: Strictly read-only in v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install and connect Claude to Figma in minutes (Priority: P1)

A designer or developer who has Figma desktop and Claude Code installs the package, registers its MCP server with Claude, imports the plugin into Figma once, runs it, and asks Claude whether Figma is reachable. Claude answers with the open file's name, current page and selection.

**Why this priority**: Nothing else in the package has value until a new user can get from "never heard of it" to "Claude can see my file". This is the whole product promise against the paid alternative.

**Independent Test**: On a clean machine with no prior setup, follow only the package README; measure time and count of steps until Claude's health check reports the plugin as connected.

**Acceptance Scenarios**:

1. **Given** a machine with Node and Claude Code but no figma-bridge, **When** the user follows the README install steps, **Then** Claude lists the figma-bridge tools without the user editing any file by hand.
2. **Given** the package is installed, **When** the user asks the package where the plugin manifest is, **Then** it prints the absolute path to a manifest the user can pick in Figma's "Import plugin from manifest" dialog.
3. **Given** the plugin is imported, **When** the user opens Plugins → Development in Figma, **Then** the plugin is listed as "figma-bridge" — the word "CBAR" appears nowhere in Figma, Claude or terminal output.
4. **Given** the plugin window is open and Claude is running, **When** the user asks Claude to check the connection, **Then** Claude reports "connected" plus file name and current page within 5 seconds.
5. **Given** Claude is running but the plugin window is closed, **When** the user asks Claude to check the connection, **Then** Claude reports "not connected" with the exact menu path to open the plugin, rather than hanging.

---

### User Story 2 - Read every page, screen and visual of a file (Priority: P1)

Once connected, the user asks Claude things like "list all pages", "show me every screen on the Checkout page", "what does the Login screen look like", "give me the colours and text styles", and Claude answers from the live file — including actually seeing the screens as images, not only reading their structure.

**Why this priority**: This is what the user asked for in so many words ("figmadaki bütün səhifələri, vizualları oxuya bilsin"). Structure-only answers already exist; seeing the visuals is the gap against the paid alternative.

**Independent Test**: With a sample file of at least 3 pages and 10 top-level frames, ask Claude to describe a named screen; verify Claude received an image of it and its description matches what is on the canvas.

**Acceptance Scenarios**:

1. **Given** a connected file, **When** Claude asks for the list of pages, **Then** every page in the file is returned with its id and name.
2. **Given** a connected file, **When** Claude asks for the screens (top-level frames) of a page or of the whole document, **Then** each screen is returned with name, id, page and size.
3. **Given** a screen id, **When** Claude asks to see it, **Then** Claude receives a viewable image of that screen it can describe, not only a file path or encoded text.
4. **Given** a screen whose longest edge exceeds 1568 px at the requested scale, **When** Claude asks to see it, **Then** the image is scaled down to fit and the response says the scale used.
5. **Given** a connected file, **When** Claude asks for design tokens (variables, colour/text/effect styles), **Then** they are returned with their real names and resolved values.
6. **Given** a connected file, **When** Claude asks to capture the whole file, **Then** structure, tokens, component sets and a preview image of every screen are saved to a folder in the user's current project, and Claude gets a short summary with the folder path.

---

### User Story 3 - Use the same capabilities from a terminal (Priority: P2)

A developer who does not use Claude (or wants to script exports) runs the package's command-line tool to check health, find nodes, dump a node, export SVG/PNG or capture the whole file to disk.

**Why this priority**: Already exists and costs little to keep; it is also the fastest way to debug a broken setup. Secondary to the Claude path.

**Independent Test**: With the plugin open, run the health, pages, find and png commands from any directory; each succeeds and any written file lands in the directory the user ran it from.

**Acceptance Scenarios**:

1. **Given** the package is installed, **When** the user runs the CLI with no arguments, **Then** a usage screen lists every command, and no line mentions the original private project.
2. **Given** the user runs the CLI from any project folder, **When** they export with an output path, **Then** the file is written relative to that folder and the default output folder is inside that folder.
3. **Given** Claude is already running the MCP server, **When** the user runs a CLI command at the same time, **Then** it uses the already-running relay instead of failing on a busy port.

---

### User Story 4 - Clean package that contains only what users need (Priority: P2)

A user who installs the package receives only the files needed to run it: relay, CLI, MCP server, plugin, docs and licence. No leftover images, private-project references, spec-kit or Claude config folders.

**Why this priority**: A public package that ships stray files or another company's name looks abandoned and undermines trust; the user explicitly asked to remove unneeded files.

**Independent Test**: Inspect the packed package contents list; compare against an allow-list.

**Acceptance Scenarios**:

1. **Given** the source tree, **When** the package is packed, **Then** its contents are limited to the runtime files, plugin files, README, LICENSE and package manifest.
2. **Given** the packed contents, **When** searched for "CBAR", "template5", "figma-cbar", "spec.js", "gen-icons" or "tools/figma-bridge", **Then** there are zero matches.
3. **Given** the repository, **When** listed, **Then** the source lives in a folder named `bridge/` and the old `figma-bridge/figma-bridge/` folder no longer exists.

---

### Edge Cases

- **Port already taken by something else** (not a bridge): user gets a message naming the port and how to choose another, and both plugin and server agree on the alternative.
- **Two Claude sessions at once**: the second reuses the first session's relay; when the first exits, the second keeps working or reports clearly that it lost the relay.
- **Plugin open in two Figma files**: the user can tell which file answered (file name is in every response's context) [assumption: last-polling file wins; documented as a limit].
- **Very large file** (hundreds of pages / thousands of frames): listing and capture finish or fail with a clear "too big, narrow with page/depth" message; nothing hangs the plugin.
- **Screen with images that have not loaded yet / missing fonts**: image export still returns whatever Figma renders. Reporting missing fonts is out of scope for v1, because the plugin API signal for it has not been verified.
- **Output path pointing outside the user's project folder** (e.g. requested by the model): refused with a clear message.
- **Figma browser version instead of desktop**: README states desktop is required for importing development plugins; health check message hints at it.
- **Node/Claude not installed or too old**: install instructions state minimum versions; the server prints a readable error instead of a stack trace.

## Requirements *(mandatory)*

### Functional Requirements

**Packaging & naming**

- **FR-001**: The project MUST be installable from the public npm registry under the scoped name `@ubuligan/figma-bridge`, published with public access.
- **FR-002**: The package MUST expose runnable commands for the MCP server and the CLI so a user can start either without knowing the install location (e.g. via a one-shot runner or a global install).
- **FR-003**: The Figma plugin's display name MUST be "figma-bridge"; every user-facing message (plugin UI, relay logs, CLI, MCP tool descriptions and errors) MUST use that name and MUST NOT mention "CBAR".
- **FR-004**: The source folder currently at `figma-bridge/figma-bridge/` MUST be renamed to `bridge/`, and all internal references MUST keep working after the move.
- **FR-005**: Files with no use for an external user MUST be removed: the unused image in the plugin folder, README sections about the original private repo (`template5`, `figma-cbar`, `redesign-figma`, `.husky`, `spec.js`, `extract-*`, `gen-icons.js`, `tools/...` paths), and the placeholder package manifest inside the source folder.
- **FR-006**: The published package MUST NOT contain spec-kit, Claude configuration, specs, or test fixtures.
- **FR-007**: The package MUST keep zero runtime dependencies.
- **FR-008**: The package MUST include a licence file and a README written for a first-time external user.

**Setup & connection**

- **FR-009**: The package MUST provide a way to register its MCP server with Claude Code with a single command documented in the README.
- **FR-010**: The package MUST provide a command that prints the absolute path of the plugin manifest to import into Figma.
- **FR-011**: The health check (CLI and MCP) MUST report relay status, plugin connection status, connected file and page, and — when not connected — the exact steps to fix it.
- **FR-012**: The plugin window MUST show whether it is connected, which file/page it serves, and a running log, as it does today.

**Reading the file**

- **FR-013**: All existing read commands MUST keep working with unchanged output shape: ping, pages, index, find, node, selection, sets, components, variables, styles, css, text, svg, png, select, dump, icons, health.
- **FR-014**: Users MUST be able to list every screen (top-level frame) of one page or of the whole document with name, id, page and size.
- **FR-015**: Users MUST be able to request a visual of any node/screen and have Claude receive it as a viewable image, with automatic down-scaling for large screens and the applied scale reported.
- **FR-016**: Users MUST be able to capture the whole file (or one page) in one request: structure, tokens, component sets and one preview image per screen, written to a folder; Claude receives only a short summary and the folder path.
- **FR-017**: Large text answers MUST continue to be written to disk with an outline returned instead of flooding Claude's context.
- **FR-018**: The tool MUST remain read-only towards the Figma document; the only permitted change is moving the current page/selection/viewport (`select`).

**Safety & location**

- **FR-019**: The relay MUST listen on loopback addresses only.
- **FR-020**: File writes MUST be confined to the directory the user started the tool from (the user's project), not to a path derived from where the package is installed; attempts to write elsewhere MUST be refused with a clear message.
- **FR-021**: Default output folders MUST be inside the user's current directory (e.g. `./figma-bridge-out/`), never inside the installed package.
- **FR-022**: The relay port MUST be configurable, and the README MUST explain what else must change when it is (the plugin's allowed address).

**Distribution of the plugin**

- **FR-023**: The plugin MUST be usable by importing its manifest from the installed package as a Figma development plugin. Publishing to the Figma Community is out of scope for v1, because a published plugin cannot reach a localhost relay the way a development plugin can.

**Scope of "extra capabilities"**

- **FR-024**: Extra capabilities beyond today's set are limited to: screens listing (FR-014), visual viewing (FR-015), full-file capture with previews (FR-016) and setup helpers (FR-009, FR-010). v1 stays strictly read-only: creating or modifying nodes in the Figma document is out of scope (see FR-018).

### Key Entities

- **Figma file**: the document open in Figma where the plugin runs; has a name and pages.
- **Page**: a top-level division of the file; has id, name and child nodes.
- **Screen**: a top-level frame on a page; what a user thinks of as one design screen.
- **Node**: any element in the file, addressed by id; can be serialized, rendered as image/SVG, or have its CSS/text read.
- **Design tokens**: variables (with collections and modes) and local styles (paint, text, effect, grid).
- **Job**: one command sent from Claude/CLI through the relay to the plugin, and its answer.
- **Capture folder**: the on-disk output of a full-file capture in the user's project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user following only the README goes from nothing installed to Claude reporting "connected" in under 10 minutes and at most 5 documented steps.
- **SC-002**: After setup, reconnecting in a later session takes no more than 2 user actions (start Claude, run the plugin).
- **SC-003**: For a file with 3+ pages, Claude can list 100% of pages and top-level screens.
- **SC-004**: Claude can view and correctly describe any requested screen on the first request in at least 9 of 10 tries on a sample file.
- **SC-005**: A full-file capture of a file with up to 50 screens completes in under 5 minutes and produces one preview image per screen.
- **SC-006**: The packed package contains zero occurrences of the original private-project names and zero files outside the allow-list.
- **SC-007**: Every error a user can trigger (plugin closed, port busy, unknown node, writing outside project) produces a message that names the problem and the next step — no raw stack traces.
- **SC-008**: Using the tool requires no Figma API token, no paid Figma plan and no network access beyond the local machine.

## Assumptions

- Target users have Figma **desktop** (development plugins cannot be imported in the browser) and Claude Code; other MCP clients may work but are not tested in v1.
- Minimum Node version is the one that ships built-in `fetch` and stable ESM (Node 18+).
- The package stays dependency-free, keeping today's hand-written MCP protocol handling.
- "The user's project" means the working directory where Claude or the CLI is started.
- Documentation language is English (npm audience); Azerbaijani translation is out of scope for v1.
- The existing output shape of `node` (matching Figma's REST format) is kept, since external users may build on it.
- The repository root (`npmpackages/figma-bridge/`) becomes the package root; `bridge/` holds the source.
- Spec-kit and Claude config stay in the repo for development but are excluded from the published package.
- When the plugin is open in several files at once, the most recently polling one serves requests; this is documented rather than solved in v1.
