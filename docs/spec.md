# Spec: fastCRW websearch plugin for opencode v2

Compiled from the closed tickets on the map ([Wayfinder map: fastCRW websearch plugin for opencode v2](https://git.arthurerlich.de/haylan/fastcrw-opencode-websarch/issues/1)). Detail lives in each ticket and in `docs/research/`. Vocabulary is defined in `CONTEXT.md`. Reference skills: `.claude/skills/opencode-v2-plugin`, `.claude/skills/fastcrw-search-api`.

## Goal

An opencode v2 plugin that makes a self-hosted fastCRW server opencode's only websearch **search provider**, via `POST {baseURL}/v1/search`. It is a native plugin, not the `crw-mcp` MCP server.

## Identifiers

| What | Value |
|---|---|
| npm package | `@haylan/opencode-fastcrw` |
| Plugin id (`Plugin.define`) | `fastcrw.websearch` |
| Provider id / display name | `fastcrw` / "fastCRW" |
| Registry | `https://git.arthurerlich.de/api/packages/haylan/npm/` |

## Plugin behaviour

`src/index.ts` only wires things together:

```ts
export default Plugin.define({
  id: "fastcrw.websearch",
  async setup(ctx) {
    const config = resolveConfig(ctx.options, process.env) // throws on bad values
    await ctx.websearch.transform((editor) => {
      editor.add({ id: "fastcrw", name: "fastCRW", execute: ({ query }, { signal }) => search(config, query, signal, fetch) })
      editor.default.set("fastcrw")
    })
  },
})
```

fastCRW is the default and only provider; there is no fallback to built-ins.

### Config (`src/config.ts`)

Precedence: plugin option > env var > default.

| Option | Env var | Default | Rules |
|---|---|---|---|
| `baseURL` | `CRW_API_URL` | `http://localhost:3000` | trim, strip trailing `/`, must be `http(s)` URL |
| `apiKey` | `CRW_API_KEY` | none | optional; Bearer header only when set; never logged or echoed |
| `limit` | none | `8` | clamp to 1..20; invalid falls back to 8, never throws |
| `lang` | none | unset | string; omitted from request when unset |
| `tbs` | none | unset | one of `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m`, `qdr:y`; omitted when unset |

Validation runs in `setup`. A malformed `baseURL`, bad `tbs` or non-string `lang` makes `setup` throw, with a message naming the option and the bad value. Example `opencode.json`:

```jsonc
{
  "plugins": [{ "package": "@haylan/opencode-fastcrw", "options": { "baseURL": "http://crw.home:3000", "limit": 8 } }],
  "websearch": { "provider": "fastcrw" }
}
```

### Search (`src/search.ts`)

- Request: `POST {baseURL}/v1/search`, JSON `{ query, limit, lang?, tbs? }`, `Authorization: Bearer <apiKey>` only when a key exists. Query sent as-is (server rejects over 2000 chars with 400).
- Response: accept `data` as an array or `data.results` as an array; any other shape throws "unexpected response shape".
- Mapping: `{ url, title, content: snippet || description || "", time: {} }`. Entries without a string `url` are dropped; a missing `title` falls back to `url`. Empty list returns `[]`.
- Errors: throw `Error("fastCRW <status> <error_code>: <error>")`; HTTP 200 with `success:false` is handled the same (status 200). Fixed hints only for 401 ("check apiKey or CRW_API_KEY") and 503 `search_disabled` ("the server has no search backend configured"). Non-JSON body: `fastCRW <status>: non-JSON response` plus the first 200 chars. Network failure: `fastCRW: cannot reach <baseURL>` with the original error as `cause`. The token never appears in any message.
- Abort: an abort via opencode's `signal` is rethrown untouched.
- Timeout: fixed 30 s, combined with `signal` via `AbortSignal.any`; not configurable. No retries; a 429 keeps its status in the message.

## Repository

- Layout: `src/{config,search,index}.ts`, `test/*.test.ts`, `scripts/` (release and smoke), `docs/`, `CHANGELOG.md` (Keep a Changelog 1.1.0), `.gitea/workflows/`.
- `package.json`: `"type": "module"`, `exports["."]` → `dist/index.js`, `engines.node >=20`, `version` `0.0.0-dev`, `@opencode/plugin` in `dependencies`. Scripts: `build` (`tsc`), `format` (`prettier --write .`), `check` (`prettier --check . && tsc --noEmit`), `test` (`node --test`), `smoke`.
- TypeScript: `strict`, target ES2022, module `NodeNext`, plain `tsc` to `dist/` (ESM plus `.d.ts`). No bundler, no linter.
- Prettier: `semi: false`, `printWidth: 100`. No pre-commit hooks.
- Git: `main` is protected (PR required, 0 approvals, no force-push or deletion; already set up). Commits use Conventional Commits.

## Tests (`node --test`, Node 24, `fetch` mocked)

Cover: option/env/default precedence; each validation throw; `limit` clamp and fallback; request body and headers (Bearer only with a key; `lang`/`tbs` omitted when unset); both response shapes; every error path above; abort passthrough; the 30 s timeout.

## Workflows (Gitea Actions, runner `ubuntu-latest`)

1. `check.yml`, on `pull_request` to `main`: Node 24, `npm ci`, `npm run check`, `npm test`, `npm run build`. Once it exists, add its status as a required check on `main`.
2. `release.yml`, `workflow_dispatch` only, run on `main`:
   - read the latest `## [x.y.z]` heading in `CHANGELOG.md` (ignore `[Unreleased]`);
   - set `package.json` `version` to it in the CI workspace only (never committed back);
   - `npm ci`, `npm run build`;
   - a dependency-free Node script in `scripts/` builds the tarball, `GET`s the registry to check the version, exits 0 with "already published" if it exists, else `PUT`s it to the registry API;
   - no `npm publish`. Auth via a Gitea Actions secret.

## Verification (manual, recorded in `docs/runtime-checks.md`)

Run once on a real opencode v2 install; a failed check reopens the design as a new ticket on the map.

1. Can built-in providers be removed or disabled? Fallback: `"websearch": false` plus an explicit `fastcrw`.
2. Does a throwing `setup` disable only this plugin, not opencode startup?
3. Precedence of config `websearch.provider` vs `editor.default.set`.
4. Does install-by-name from the Gitea registry work with a scoped `.npmrc` (`@haylan:registry=...`)? Fallback: tarball or local path.
5. Does the release workflow's job token have package-write rights? Fallback: a `write:package` secret.
6. Does `npm install` of `@opencode/plugin` drag in `solid-js` and the OpenTUI peers? If heavy, move it to `peerDependencies` plus `devDependencies`.
7. `npm run smoke` against the real fastCRW server (`CRW_API_URL`/`CRW_API_KEY`): record the real response shape (`data[]` vs `data.results`).
8. Confirm the exact `@opencode/plugin` TypeScript types, the shape of `time`, and that a 429 status in an error message triggers opencode's provider cooldown.

## Build order

1. Open a PR with the pending `CONTEXT.md` change plus scaffold: `package.json`, `tsconfig.json`, Prettier config, `CHANGELOG.md` with `[Unreleased]`.
2. `src/config.ts` and `src/search.ts` test-first, then `src/index.ts`.
3. `check.yml`; make it a required check on `main`.
4. `scripts/` release and smoke scripts, then `release.yml`.
5. Run the verification list; write `docs/runtime-checks.md`.
6. First release: add a changelog entry, run the release workflow.

## Out of scope

The `crw-mcp` MCP-server approach, pre-commit hooks, a bundler or linter, a configurable timeout, retries, and a fallback to built-in providers.
