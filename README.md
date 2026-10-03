# @haylan/opencode-fastcrw

An [opencode](https://opencode.ai) v2 plugin that makes a self-hosted [fastCRW](https://docs.fastcrw.com) server opencode's websearch. It calls `POST {baseURL}/v1/search` directly; it does not use the `crw-mcp` MCP server.

The plugin registers a search provider with id `fastcrw` and makes it the default. If fastCRW fails, searches fail; they never fall back to the built-in providers (Exa, Firecrawl, Parallel, Tavily, TinyFish).

## Install

The package is published to the Gitea npm registry. Map the scope to it in your `.npmrc`:

```
@haylan:registry=https://git.arthurerlich.de/api/packages/haylan/npm/
```

Then add the plugin to your `opencode.json`:

```jsonc
{
  "plugins": [
    {
      "package": "@haylan/opencode-fastcrw",
      "options": { "baseURL": "http://crw.home:3000" },
    },
  ],
}
```

Installing by name from the Gitea registry has not been verified end to end yet; see [docs/runtime-checks.md](docs/runtime-checks.md).

### Local build

To try the plugin without a registry:

```bash
npm ci
npm run build
```

opencode loads local plugins as directories, resolved by file path (`<dir>/server`, then `<dir>/index`), and ignores `package.json` `exports`, so this package cannot be pointed at directly. Use a small shim instead. Create `~/.config/opencode/plugins/fastcrw.js` (a `.js` or `.ts` file; `.mjs` is ignored) with:

```js
export { default } from "file:///ABSOLUTE/PATH/TO/fastcrw-opencode-websarch/dist/index.js"
```

A drop-in file cannot receive plugin options, so configure the plugin with the environment variables below (`CRW_API_URL`, `CRW_API_KEY`). To use options instead, put the same line in an `index.js` inside a directory and reference that directory as `"package": "./that-dir"` (a relative path is resolved from the config file; `~` is not expanded).

## Configuration

Plugin options come from `opencode.json`. Precedence is option, then environment variable, then default.

| Option    | Environment variable | Default                 | Notes                                                                                   |
| --------- | -------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `baseURL` | `CRW_API_URL`        | `http://localhost:3000` | Base URL of the fastCRW server, `http` or `https`. Trailing slashes are removed.        |
| `apiKey`  | `CRW_API_KEY`        | none                    | Optional. Sent as a Bearer token. Prefer the environment variable over `opencode.json`. |
| `limit`   | none                 | `8`                     | Results per search, clamped to 1 to 20. An invalid value falls back to 8.               |
| `lang`    | none                 | unset                   | Search language, for example `en` or `de`. Omitted from the request when unset.         |
| `tbs`     | none                 | unset                   | Time range: `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m` or `qdr:y`.                              |

A bad `baseURL`, `tbs`, `lang` or `apiKey` makes the plugin fail to load, with a message naming the option. opencode keeps running and shows the plugin as failed.

### Choosing the provider

Do not set `websearch.provider` to another provider. In opencode, a provider named in `opencode.json` wins over the one a plugin sets as default, so `"websearch": { "provider": "exa" }` would send your searches to Exa. Leaving it unset, or setting it to `"fastcrw"`, uses this plugin.

## Errors

Failures are thrown as `fastCRW <status> <error_code>: <message>`, with a hint for a missing or invalid key (401) and for a server without a search backend (503 `search_disabled`). A server that is unreachable, times out (30 s) or returns something that is not JSON gets its own message. opencode currently shows only a generic "Web search request failed: fastcrw", so check the server when searches fail.

A self-hosted fastCRW server needs a SearXNG-style search backend (`CRW_SEARCH__SEARCH_BACKEND_URL`); without one, searches return 503.

## Development

```bash
npm ci
npm run check   # Prettier and type check
npm test        # node --test, needs Node 22.18 or later
npm run build   # compile to dist/
npm run smoke -- "query"   # one real search against CRW_API_URL (manual)
```

`docs/spec.md` is the build spec, `docs/runtime-checks.md` records what was verified against a real opencode, and `CONTEXT.md` defines the vocabulary.

### Releasing

Releases are published by the manually started `release` workflow on Gitea Actions. It reads the latest version heading in `CHANGELOG.md` (the repository keeps the dev version `0.0.0-dev` in `package.json`) and then:

1. publishes that version to the Gitea npm registry, unless it already exists;
2. tags the workflow's commit `v<version>`, unless the tag already exists;
3. links the package to this repository, unless it is already linked.

Every step skips itself when done, so starting the workflow again completes a release that only partly succeeded.

To release: add a dated `## [x.y.z]` entry to `CHANGELOG.md`, merge it to `main`, then start the workflow. It needs a token with `write:package` and `write:repository` rights: the job token if it has them, otherwise a `PACKAGE_TOKEN` secret.
