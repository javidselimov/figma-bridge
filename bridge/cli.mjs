// @ts-check
// Shell front door.
//
//   figma-bridge setup
//   figma-bridge screens --page "*"
//   figma-bridge view 12:345 -o login.png
//   figma-bridge node 2446:316 --depth 5 -o alert-set.json
//   figma-bridge capture --page "Design System"
//
// The command list comes from lib/commands.mjs and the actual work from
// lib/tasks.mjs — this file turns argv into arguments and an answer into
// something worth looking at in a terminal.
//
// Streams: answers on stdout, everything else on stderr, so
// `figma-bridge pages > pages.json` always yields valid JSON.
// Exit codes: 0 ok · 1 runtime failure · 2 usage error.

import { COMMANDS, byName, normalise, positionals } from './lib/commands.mjs';
import { BridgeError, UsageError } from './lib/errors.mjs';
import { shown } from './lib/output.mjs';
import { FIGMA_IMPORT, FIGMA_RUN, install, pluginPath } from './lib/plugin-files.mjs';
import { PACKAGE, PORT } from './lib/protocol.mjs';
import { call, ensurePlugin, health, kb, stopHostedRelay } from './lib/rpc.mjs';
import { capture, healthReport, icons, saveAnswer, setupReport, view } from './lib/tasks.mjs';

const colour = !process.env.NO_COLOR && process.stderr.isTTY;
const RED = colour ? '\x1b[31m' : '';
const DIM = colour ? '\x1b[2m' : '';
const OFF = colour ? '\x1b[0m' : '';

const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);

function usage() {
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  return [
    `figma-bridge ${PACKAGE.version} — read a live Figma file from the terminal or Claude`,
    '',
    'figma-bridge <command> [args] [-o <file>]',
    '',
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    '',
    `${DIM}Needs the figma-bridge plugin running in Figma desktop. Run \`figma-bridge setup\` for first-time setup.${OFF}`,
    `${DIM}\`figma-bridge <command> --help\` shows that command's arguments.${OFF}`,
  ].join('\n');
}

function commandHelp(cmd) {
  const pos = positionals(cmd);
  const flags = Object.entries(cmd.args)
    .filter(([key]) => !pos.includes(key))
    .map(
      ([key, spec]) =>
        `  --${key.padEnd(12)} ${spec.desc}${spec.default !== undefined ? ` (default: ${spec.default})` : ''}`
    );
  return [
    `figma-bridge ${cmd.name}${pos.map((p) => ` <${p}>`).join('')} [flags]`,
    '',
    cmd.summary,
    ...(flags.length ? ['', 'Flags:', ...flags] : []),
  ].join('\n');
}

/** argv → { args, outFile }. `-o` is the output file unless the command owns `out`. */
function parseArgv(cmd, argv) {
  const pos = positionals(cmd);
  const args = {};
  let outFile = null;
  let next = 0;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === '-o' || (token === '--out' && !cmd.args.out)) {
      outFile = argv[++i];
      if (!outFile) throw new UsageError(`\`${token}\` needs a file path.`);
      continue;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const key = eq >= 0 ? token.slice(2, eq) : token.slice(2);
      const spec = cmd.args[key];
      if (!spec) {
        throw new UsageError(`Unknown flag \`--${key}\`. Known: ${Object.keys(cmd.args).join(', ') || '(none)'}`);
      }
      if (eq >= 0) args[key] = token.slice(eq + 1);
      else if (spec.type === 'boolean' && (i + 1 >= argv.length || argv[i + 1].startsWith('--'))) args[key] = true;
      else args[key] = argv[++i];
      continue;
    }

    if (next < pos.length) args[pos[next++]] = token;
    else throw new UsageError(`Unexpected argument \`${token}\`.`);
  }

  return { args: normalise(cmd, args), outFile };
}

function printAnswer(text) {
  const bytes = Buffer.byteLength(text);
  if (bytes > 200 * 1024) {
    err(`${DIM}(${kb(bytes)} — too big to print. Re-run with \`-o <file>\`.)${OFF}`);
    return;
  }
  out(JSON.stringify(JSON.parse(text), null, 2));
}

/** `serve`: foreground relay until Ctrl+C. */
async function serve() {
  const running = await health();
  if (running) {
    out(`A figma-bridge relay is already running on port ${running.port}.`);
    return;
  }
  const { startRelay } = await import('./relay.mjs');
  let relay;
  try {
    relay = await startRelay({ port: PORT, log: (line) => err(line) });
  } catch (e) {
    throw new BridgeError(e.message, 'offline');
  }
  out(`figma-bridge relay on port ${relay.port} — waiting for the plugin (Ctrl+C to stop)`);
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await relay.close();
}

async function local(cmd, args) {
  if (cmd.name === 'setup') return out(await setupReport());
  if (cmd.name === 'serve') return serve();
  if (cmd.name === 'mcp') return void (await import('./mcp.mjs'));

  // plugin install | path
  if (args.action === 'install') {
    const done = await install({ dir: args.dir, port: args.port });
    out(done.manifest);
    err(`✓ plugin files in ${done.dir} (relay port ${done.port})`);
    err(`  Next: ${FIGMA_IMPORT} → pick the file above. Then run it from ${FIGMA_RUN}.`);
    return;
  }
  if (args.action === 'path') return out(pluginPath({ dir: args.dir }));
  throw new UsageError(`plugin: unknown action \`${args.action}\` — use \`install\` or \`path\`.`);
}

async function remote(cmd, args, outFile) {
  // A relay this process starts has never been polled; give the plugin one
  // retry cycle to find it. Relay chatter stays out of a one-shot command.
  await ensurePlugin({ log: () => {} });

  if (cmd.name === 'capture' || cmd.name === 'dump' || cmd.name === 'icons') {
    const summary = await (cmd.name === 'icons' ? icons : capture)(args, err);
    return out(JSON.stringify(summary));
  }

  if (cmd.name === 'view') {
    const shot = await view(args);
    if (outFile) {
      const saved = await saveAnswer(cmd, shot.text, outFile);
      err(`✓ ${shown(saved.file)} — ${kb(saved.bytes)}`);
    } else {
      out(shot.line);
      err(`${DIM}add -o <file>.png to save the image${OFF}`);
    }
    return;
  }

  const { text, ms } = await call(cmd.name, args, { timeout: cmd.big ? 300_000 : 120_000 });
  if (outFile) {
    const { file, bytes } = await saveAnswer(cmd, text, outFile);
    err(`✓ ${shown(file)} — ${kb(bytes)}`);
  } else if (cmd.artifact === 'svg') {
    out(JSON.parse(text).svg);
  } else {
    printAnswer(text);
  }
  err(`${DIM}${ms} ms${OFF}`);
}

/**
 * @param {string[]} argv arguments after the executable
 * @returns {Promise<number>} exit code (also set on process.exitCode)
 */
export async function main(argv) {
  const [name, ...rest] = argv;
  let code = 0;

  try {
    if (name === '--help' || name === '-h' || name === 'help') {
      out(usage());
    } else if (name === '--version' || name === '-v') {
      out(PACKAGE.version);
    } else if (!name) {
      err(usage());
      code = 2;
    } else {
      const cmd = byName(name);
      if (!cmd) throw new UsageError(`Unknown command \`${name}\`.\n\n${usage()}`);

      if (rest.includes('--help') || rest.includes('-h')) {
        out(commandHelp(cmd));
      } else {
        const { args, outFile } = parseArgv(cmd, rest);
        if (cmd.name === 'health') out(await healthReport());
        else if (cmd.where === 'local') await local(cmd, args);
        else await remote(cmd, args, outFile);
      }
    }
  } catch (e) {
    err(`${RED}${e.message}${OFF}`);
    code = e instanceof UsageError ? 2 : 1;
  } finally {
    await stopHostedRelay();
  }

  process.exitCode = code;
  return code;
}
