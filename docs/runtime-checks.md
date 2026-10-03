# Runtime checks

Results of the verification list in `docs/spec.md`. Run on 2026-10-03 against opencode v2.0.22 (Windows), in an isolated profile (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` pointed at a temp folder, private `opencode serve` on a local port, mock fastCRW server on another), so the real opencode config was never touched.

## Summary

| #   | Check                                               | Result                              |
| --- | --------------------------------------------------- | ----------------------------------- |
| 1   | Built-in providers removable or disableable         | Not run (plugin did not load)       |
| 2   | Throwing `setup` disables only this plugin          | Not run (plugin did not load)       |
| 3   | Config `websearch.provider` vs `editor.default.set` | Not run (plugin did not load)       |
| 4   | Install by name from the Gitea registry             | Not run (needs a published release) |
| 5   | Release job token has package-write rights          | Not run (needs a release run)       |
| 6   | `@opencode/plugin` install weight                   | Done                                |
| 7   | `npm run smoke` against the real fastCRW server     | Done                                |
| 8   | Typings, `time` shape, 429 cooldown                 | Typings done; 429 not run           |

## Findings

### Plugin did not load locally (blocks checks 1 to 3)

I tried three ways to load the built plugin (`dist/index.js`) into a private `opencode serve`, and checked `GET /api/plugin` and `GET /api/websearch/provider` after a restart and after `POST /api/location/reload`:

1. `plugins: [{ "package": "G:/_DEV/repos/fastcrw-opencode-websarch", "options": {...} }]` in the global `opencode.jsonc`.
2. The same with `"package": "file:///G:/_DEV/repos/fastcrw-opencode-websarch"`.
3. Auto-discovery: `plugins/fastcrw.mjs` in the config directory re-exporting the built file, with the endpoint taken from `CRW_API_URL`.

In every case opencode parsed the config (`GET /api/config` showed the `plugins` entry), but the plugin never appeared in `GET /api/plugin` (88 built-in entries only), `fastcrw` never appeared in the websearch provider list (exa, firecrawl, parallel, tavily, tinyfish), no request reached the mock server, and the debug log contained no plugin-related message or error. The cause is undetermined. Candidates: Windows path handling, plugins only loading per session rather than per location, or a problem in the built output. Next step: reproduce on Linux or macOS, or load a trivial hello-world plugin the same way to separate a loader problem from a problem in this plugin.

### 6. `@opencode/plugin` install weight

`npm install` of `@opencode/plugin@2.0.22` adds about 100 MB of transitive dependencies (mainly `effect`, OpenTelemetry, `@redis`). Its peers `solid-js`, `@opentui/core`, `@opentui/solid` and `@opencode/theme` are marked optional and are not installed. Decision for the first release: keep it in `dependencies` as the docs say; revisit if install size matters.

### 8. Typings

From `@opencode/schema` 2.0.22: a websearch result is `{ url: string, title?: string, content?: string, time: { published?: number } }`, so `time: {}` is valid. `execute` receives `({ query }, { signal })`. `editor.default.set(selection: string | false)`. Whether a 429 status in an error message triggers opencode's provider cooldown is not verified.

### Useful for later runs

- `opencode serve --hostname 127.0.0.1 --port <p>` prints a generated server password; HTTP Basic auth with user `opencode` works. `GET /openapi.json` lists the API.
- Relevant operations: `GET /api/plugin`, `GET /api/websearch/provider`, `POST /api/websearch` (body needs `query` and `providerID`), `POST /api/location/reload`.
- `opencode debug config` hung in an empty profile; `opencode plugin add` writes to the global config, so avoid it on a real machine.

### 7. Smoke test

Run on 2026-10-03 against `http://crw.home` and `http://192.168.2.15:8013` (the same server; earlier attempts that day failed on DNS, a refused connection and an upstream 502 until the service came up). No token was needed (no `CRW_API_KEY` set). Findings:

- The response envelope is `{ success, data }` and `data` is an object, so this server returns the self-hosted shape `data.results`, not a flat array. The plugin's dual-shape parser is needed, and the self-hosted shape is the one in use here.
- Each result has `url`, `title`, `description`, `snippet`, `position`, `score` and `category`.
- A search for "opencode" with `limit` 8 returned mapped results with `url`, `title`, `content` and `time: {}` as designed.
