# Research: verified opencode v2 plugin API (issue #2)

Researched 2026-10-03. Sources (all first-party opencode docs):

- [S1] https://opencode.ai/v2/docs/build/plugins (build a plugin)
- [S2] https://opencode.ai/v2/docs/plugins (configure plugins)
- [S3] https://opencode.ai/v2/docs/config
- [S4] https://opencode.ai/v2/docs/websearch
- [S5] https://opencode.ai/v2/docs/build/plugins/migrate-v1
- [S6] https://opencode.ai/v2/docs/api (HTTP API reference)

Caveat: pages were read through a fetch-and-summarise tool, so quotes are as returned by it, not byte-checked. The opencode GitHub source (anomalyco/opencode) was NOT inspected (code search needs login); anything needing exact TypeScript types is flagged "unverified" below.

## Verdict on the user's sketch

| Sketch element | Verdict | Evidence |
|---|---|---|
| `Plugin.define` from `"@opencode/plugin"` | RIGHT | [S1] `import { Plugin } from "@opencode/plugin"` / `export default Plugin.define({ id: "example", async setup(ctx) {...} })`. V1 package was `@opencode-ai/plugin` [S5]. |
| `ctx.websearch.transform` | RIGHT | [S1] `await ctx.websearch.transform((editor) => { ... })` |
| `editor.add` | RIGHT | [S1] `editor.add({ id: "internal", name: "Internal search", execute: async ({ query }, { signal }) => {...} })` |
| `plugins[].package` / `options` in opencode.json | RIGHT | [S2][S3] key is `"plugins"` (V1 was `"plugin"`, tuples replaced by objects [S5]); object form `{ "package": "...", "options": {...} }` |
| `websearch.provider` | RIGHT (config key) | [S3][S4] `{ "websearch": { "provider": "tavily" } }`; also `"random"`. Built-in ids: exa, firecrawl, parallel, tavily, tinyfish [S4]. |

Things the sketch likely missed / must add:
- `id` is required on `Plugin.define` (stable, used for storage scoping/diagnostics) [S5].
- A plugin-added provider is made active with `editor.default.set("<id>")` [S1]; `websearch.provider` in config selects by provider id, so `"provider": "<your-id>"` is the expected pairing (inference from [S1]+[S4]; docs do not state it explicitly -> verify at runtime).
- Options are read as `ctx.options` (not passed as a setup arg) [S1].

## Sub-questions

### 1. Plugin entry / definition shape
Each module has one default export with a unique id and `setup`:
```ts
import { Plugin } from "@opencode/plugin"
export default Plugin.define({
  id: "example",
  async setup(ctx) { /* may return a cleanup function */ },
})
```
[S1][S5]. Context: `ctx.app.version`, `ctx.location` (`directory`, optional `workspaceID`, project), `ctx.options`, `ctx.storage` (durable JSON, plugin-scoped), plus domains `ctx.session/permission/shell/tool/websearch/...` [S1][S5]. Return cleanup from `setup` for timers/sockets [S5]. V1 plugins do not run in V2; dual-support is possible via spreading `Plugin.define(...)` and adding a V1 `server()` [S1][S5].

### 2. Registration/loading (local path vs npm)
`"plugins"` array in `opencode.json(c)`; entries are strings or objects [S2]:
npm `"opencode-acme-plugin"`, `"opencode-acme-plugin@1.2.0"`, `"@acme/opencode-plugin"`; local `"./plugins/local"`, `"../shared/plugin.ts"`, `"/abs/plugin.ts"`, `"file:///..."`. Also auto-discovery of `.ts/.js` files and packages in `.opencode/plugins/` or `~/.config/opencode/plugins/` [S2]. CLI: `opencode plugin add|list|check|update|remove` [S2]. Disable via ids: `["*", "-opencode.provider.*", ...]` [S2]. Published package needs `"type":"module"`, `exports["."]` -> entry, dependency `@opencode/plugin` [S1].

### 3. Passing options
```jsonc
{ "plugins": [ { "package": "./plugins/company", "options": { "strict": true } } ] }
```
read via `ctx.options.strict` in `setup` [S1][S3]. Options type is untyped key/value (validate yourself).

### 4. Can a plugin provide/replace the websearch provider?
Yes. [S1]:
```ts
await ctx.websearch.transform((editor) => {
  editor.add({ id: "internal", name: "Internal search",
    execute: async ({ query }, { signal }) => {
      const response = await fetch(`https://search.example.com?q=${query}`, { signal })
      return [{ url: "", title: "", content: "", time: {} }]
    } })
  editor.default.set("internal")
})
```
Disable: `editor.default.set(false)`; re-evaluate: `await ctx.websearch.reload()` [S1]. The API reference lists add/default/remove operations [S6] (remove not shown in S1 example; exact editor type unverified).

### 5. How `websearch.provider` is selected
Config `{ "websearch": { "provider": "<id>" | "random" } }`; `"random"` picks an available provider; `"websearch": false` disables search entirely [S3][S4]. Provider on HTTP 429 enters cooldown and search retries another provider [S4]. Provider API keys via `/connect` or env (e.g. `TAVILY_API_KEY`) [S4]. For a plugin provider, `editor.default.set(id)` is the plugin-side selection [S1]; interplay/precedence with the config `provider` key is not documented -> verify.

### 6. Required search result shape
From [S1] the `execute` return is an array of `{ url, title, content, time }`; the example uses `time: {}` (object, inner shape undocumented). [S6] lists the same four fields. Unverified: whether `time` fields are optional, exact `time` keys (e.g. published/updated), and whether extra fields are allowed. `execute` receives `({ query }, { signal })`; `signal` is an AbortSignal and must be passed to fetch [S1].

## Open items (need source or runtime check)
- Exact TS types for editor, `time`, and execute args (read anomalyco/opencode source or `@opencode/plugin` typings after install).
- Precedence of config `websearch.provider` vs plugin `editor.default.set`.
- [S6] suggested `POST /api/websearch/query` with `{query, provider?}` -> `{results, provider}`; this came from the summariser and is lower confidence.
