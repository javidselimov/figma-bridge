#!/usr/bin/env node
// @ts-check
// The one executable. Kept tiny and free of modern syntax so an old Node
// reaches the version check instead of failing to parse something newer.

var parts = process.versions.node.split('.').map(Number);
if (parts[0] < 22 || (parts[0] === 22 && parts[1] < 12)) {
  process.stderr.write(
    'figma-bridge needs Node.js 22.12 or newer (found ' +
      process.versions.node +
      '). Install a current LTS from https://nodejs.org\n'
  );
  process.exit(1);
}

var command = process.argv[2];

var started =
  command === 'mcp'
    ? import('../bridge/mcp.mjs')
    : import('../bridge/cli.mjs').then(function (cli) {
        return cli.main(process.argv.slice(2));
      });

started.catch(function (err) {
  process.stderr.write('figma-bridge: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 1;
});
