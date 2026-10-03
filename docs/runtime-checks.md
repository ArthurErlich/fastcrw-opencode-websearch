# Runtime checks

Results of the verification list in `docs/spec.md`. Run on 2026-10-03 against opencode v2.0.22 (Windows), in an isolated profile (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` pointed at a temp folder, a private `opencode serve` on a local port, a mock fastCRW server on another), so the real opencode config was never touched.

## Summary

| #   | Check                                               | Result                                                        |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Built-in providers removable or disableable         | Done: not removable by a plugin, but never used as a fallback |
| 2   | Throwing `setup` disables only this plugin          | Done: yes, loudly                                             |
| 3   | Config `websearch.provider` vs `editor.default.set` | Done: config wins                                             |
| 4   | Install by name from the Gitea registry             | Not run (needs a published release)                           |
| 5   | Release job token has package-write rights          | Not run (needs a release run)                                 |
| 6   | `@opencode/plugin` install weight                   | Done                                                          |
| 7   | `npm run smoke` against the real fastCRW server     | Done                                                          |
| 8   | Typings, `time` shape, 429 cooldown                 | Done: a 429 from our plugin triggers no cooldown              |

## How plugins load (read this first)

Read from the opencode binary and confirmed with hello-world plugins:

- A `plugins` entry in `opencode.json` that points at a **file** is ignored with the warning "configured plugin path must be a directory". It must be a directory, or an npm package name.
- A local directory is resolved **by file path**: `<dir>/server` then `<dir>/index`. The directory's `package.json` `exports` are not used. This repo has no root `index.js` (the entry is `dist/index.js`), so pointing a config entry at the repo or an unpacked package directory loads nothing and logs nothing. My first three attempts failed for this reason.
- An npm package name resolves through `exports` (`<name>/server`, then `<name>`), so `exports["."]` works for registry installs (still unverified end to end, check 4).
- Auto-discovery in `plugins/` folders (global config dir or project `.opencode/`) accepts only `.ts` and `.js` files and directories. `.mjs` files are ignored.
- `~` paths are not expanded; use `./relative`, an absolute path or `file://`. The `~/.config/opencode/plugins/fastcrw` example in the original sketch does not work.
- Loading is lazy: the plugin list is empty for several seconds after startup or `POST /api/location/reload`.

With a one-line directory shim (`index.js`: `export { default } from "file:///.../dist/index.js"`) the real plugin loaded, registered provider `fastcrw`, honoured `baseURL` and `limit` from the plugin options, and returned the mapped result for `POST /api/websearch`.

## Findings

### 1. Built-in providers

The plugin API has no way to remove a provider (`WebSearchEditor` only has `add` and `default`), so the built-ins (exa, firecrawl, parallel, tavily, tinyfish) stay registered. In practice fastCRW is still the only one used:

- With no `websearch` config, the plugin's `editor.default.set("fastcrw")` makes it the default.
- When fastCRW was unreachable or returned 429, opencode answered 503 "Web search request failed: fastcrw". It did **not** fall back to a built-in.
- If no default is set (for example the plugin failed to load), a query without a provider id is rejected with 400 "Web search provider is required".

### 2. Throwing `setup`

With `baseURL: "nope"`, only this plugin ended up in state `failed`, with our message and stack (`fastCRW: invalid baseURL "nope" (expected an http(s) URL)`), and a `WARN failed to load plugin` line was logged. The other plugins stayed `active` and the server kept running. The provider is then not registered. The plan holds: fail loudly, no silent search elsewhere.

### 3. Precedence

Config `websearch.provider` wins over the plugin's `editor.default.set`: with the config set to `exa`, a query without a provider id went to Exa (and worked without a key, so the query left the machine). With the config unset or set to `fastcrw`, the plugin's provider was used. Consequence: do not set `websearch.provider` to anything else; setting it to `fastcrw` is harmless and explicit.

### 6. `@opencode/plugin` install weight

`npm install` of `@opencode/plugin@2.0.22` adds about 100 MB of transitive dependencies (mainly `effect`, OpenTelemetry, `@redis`). Its peers `solid-js`, `@opentui/core`, `@opentui/solid` and `@opencode/theme` are optional and not installed. Decision for the first release: keep it in `dependencies` as the docs say; revisit if install size matters.

### 7. Smoke test

Run against `http://crw.home` and `http://192.168.2.15:8013` (the same server; earlier attempts failed on DNS, a refused connection and an upstream 502 until the service came up). No token was needed. The envelope is `{ success, data }` and `data` is an object, so this server returns the self-hosted shape `data.results`, not a flat array; the plugin's dual-shape parser handles it. Each result has `url`, `title`, `description`, `snippet`, `position`, `score` and `category`.

### 8. Typings, `time`, 429

From `@opencode/schema` 2.0.22: a result is `{ url: string, title?: string, content?: string, time: { published?: number } }`, so `time: {}` is valid; `execute` receives `({ query }, { signal })`; `editor.default.set(selection: string | false)`. A 429 from fastCRW surfaced as a plain failure: three queries in a row all reached the server, so no provider cooldown was triggered. opencode also shows only the generic "Web search request failed: fastcrw" through the API; our detailed message was not visible there or in the debug log.

## Follow-ups this implies

- **Local installs need a root `index.js`.** Add `index.js` (`export { default } from "./dist/index.js"`) to the package and `files`, so a config entry pointing at an unpacked package directory works as well as an npm-name install. The release script stages `package.json` and `dist/` only and would need to include it.
- Update the README and spec examples: no `~` paths, and a directory (not a file) for local `plugins` entries.
- Optional: decide whether the generic user-facing error is acceptable, since our detailed messages are not surfaced.
- Still to verify after the first release: check 4 (install by name with a scoped `.npmrc`) and check 5 (job token package-write rights).

## Useful for later runs

- `opencode serve --hostname 127.0.0.1 --port <p>` prints a generated server password; HTTP Basic auth with user `opencode` works. `GET /openapi.json` lists the API.
- Relevant operations: `GET /api/plugin` (shows `state`, including load errors), `GET /api/websearch/provider`, `POST /api/websearch` (body `query`, optional `providerID`), `POST /api/location/reload`.
- `opencode debug config` hung in an empty profile; `opencode plugin add` writes to the global config, so avoid it on a real machine.
