# Contract: Relay HTTP protocol

Between the Figma plugin UI, the relay and its clients. Pinned by `test/relay.test.mjs` using
`test/helpers/fake-plugin.mjs`. Internal to the package (plugin and relay always ship together),
but versioned by `PROTOCOL` because an installed plugin copy can be older than the package (R9).

## Binding

`127.0.0.1:<port>` and `[::1]:<port>`, never a wildcard. Default port 7332. CORS `*` (the
plugin iframe origin is `null`).

## Endpoints

| Method & path | Caller | Request | Responses |
| --- | --- | --- | --- |
| `GET /pull?file=&page=&v=` | plugin | `v` = plugin PROTOCOL (**new**) | `200 {id, cmd, args}` job; `204` after 25 s hold |
| `POST /result` | plugin | `text/plain` JSON `{id, seq, final, ok, chunk?, error?}` | `200 {ok:true}` (also for late chunks) |
| `POST /rpc` | client | JSON `{cmd, args, timeout?}` | `200` raw answer body + `X-Figma-Ms`; `400` bad request; `409` plugin protocol mismatch or plugin too old for the command (**new**); `500` plugin threw; `502` chunks missing; `503` no plugin; `504` timeout |
| `GET /health` | client | — | `200 {ok, port, plugin:{connected, lastSeen, idleMs, file, page, protocol}, expectedProtocol, queued, inflight}` |
| `OPTIONS *` | any | — | `204` |

Error bodies are `{ "error": "<human-readable message with next step>" }`.

## Limits

Request body ≤ 256 MB; answer chunks 3 MB; RPC timeout default 120 s, max 15 min; plugin stale
after 45 s without a poll.

## Versioning

`PROTOCOL = 1` for this release. Bump when a command's argument or answer shape changes in a way
an older plugin cannot serve. Adding a new command does **not** bump it. When an older plugin
reports `Unknown command`, the relay turns that into a **409** response telling the user to run
`plugin install` and re-run the plugin, instead of a 500 carrying the raw message.
