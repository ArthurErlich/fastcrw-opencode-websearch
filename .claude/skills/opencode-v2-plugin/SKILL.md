---
name: opencode-v2-plugin
description: How to write, configure and register an opencode v2 plugin, including adding a websearch provider. Use when writing or editing plugin code, opencode.json `plugins`/`websearch` config, or plugin packaging in this repo.
---

# opencode v2 plugin

Verified against opencode.ai/v2 docs (build/plugins, plugins, config, websearch). Full evidence and open items: `docs/research/opencode-v2-plugin-api.md`. The v1 package `@opencode-ai/plugin` does NOT run in v2.

## Entry point

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "home.fastcrw", // required, stable; used for storage scoping and diagnostics
  async setup(ctx) {
    // ctx.options (plugin options), ctx.storage, ctx.location, ctx.websearch, ...
    // may return a cleanup function
  },
})
```

Options are read from `ctx.options` inside `setup`, not passed as an argument. They are untyped key/value: validate them yourself.

## Websearch provider

```ts
await ctx.websearch.transform((editor) => {
  editor.add({
    id: "fastcrw",
    name: "fastCRW (self-hosted)",
    execute: async ({ query }, { signal }) => [{ url, title, content, time: {} }],
  })
  editor.default.set("fastcrw") // make it active; set(false) disables
})
```

- `execute` returns `{ url, title, content, time }[]`. Pass `signal` to `fetch`.
- `await ctx.websearch.reload()` re-evaluates providers.

## Config (`opencode.json`)

```jsonc
{
  "plugins": [{ "package": "~/.config/opencode/plugins/fastcrw", "options": { "baseURL": "http://crw.home:3000", "limit": 8 } }],
  "websearch": { "provider": "fastcrw" }
}
```

- Key is plural `plugins` (v1: `plugin`). Entries are a string or `{ package, options }`.
- `package` may be an npm name (`name`, `name@1.2.0`, `@scope/name`), `./local`, an absolute path or `file://`.
- Auto-discovered: `.ts`/`.js` files and packages in `.opencode/plugins/` and `~/.config/opencode/plugins/`.
- `websearch.provider` is a provider id or `"random"`; `"websearch": false` disables search. Built-in ids: exa, firecrawl, parallel, tavily, tinyfish.
- CLI: `opencode plugin add|list|check|update|remove`.

## Packaging (npm)

`"type": "module"`, `exports["."]` pointing at the entry, dependency on `@opencode/plugin`.

## Unverified: check at runtime, do not assume

- Exact TypeScript types for the editor, `time` and `execute` args (read `@opencode/plugin` typings after install).
- Inner shape of `time`, and whether extra result fields are allowed.
- Precedence between config `websearch.provider` and `editor.default.set(id)`.
