# fastCRW `POST /v1/search` contract

Resolves issue #3. Researched 2026-10-03 against `main` of github.com/us/crw (`fastcrw/crw`), docs.fastcrw.com and npm `crw-mcp` 0.37.2.

## TL;DR for the plugin

- Endpoint: `POST {CRW_API_URL}/v1/search`, JSON body `{"query": "...", "limit": N}`.
- Auth: `Authorization: Bearer $CRW_API_KEY` for hosted. Self-hosted sends no header unless the operator set `CRW_AUTH__API_KEYS`; then it is the same Bearer scheme.
- **Parse defensively: `data` is a flat array on hosted, but `{"data": {"results": [...]}}` on self-hosted.** The official CLI accepts both. When `sources` is set, results are grouped as `{web:[],news:[],images:[]}` instead of an array.
- Every result has both `description` and `snippet` (snippet is an always-populated alias of description).
- Errors: `{"success": false, "error": "...", "error_code": "..."}` with HTTP 4xx/5xx.

## Auth

- Hosted (`https://api.fastcrw.com`): `Authorization: Bearer <key>` required. [docs.fastcrw.com REST API]
- Self-hosted (`http://localhost:3000`): no header needed by default. Middleware bypasses auth when `api_keys` is empty; otherwise checks the `Bearer ` token with constant-time compare. 401 messages: `Missing Authorization header`, `Invalid API key`. [crates/crw-server/src/middleware.rs]
- Server-side keys are set via `CRW_AUTH__API_KEYS` (comma-separated or JSON array). [crates/crw-core/src/config.rs `AuthConfig`]

## Env var names

| Var                  | Used by          | Meaning                                                                                             |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `CRW_API_URL`        | crw-mcp, crw CLI | Remote server base URL. Default `https://api.fastcrw.com`; `http://localhost:3000` for self-hosted. |
| `CRW_API_KEY`        | crw-mcp, crw CLI | Bearer token for the remote server.                                                                 |
| `CRW_LOCAL`          | crw-mcp          | Truthy forces embedded mode, ignoring `CRW_API_URL`.                                                |
| `CRW_AUTH__API_KEYS` | server           | Accepted keys (server side).                                                                        |
| `CRW_SEARCH__*`      | server           | Search config (`enabled`, `search_backend_url`, `timeout_ms`, `default_limit`, `max_limit`).        |
| `CRW_SEARXNG_URL`    | CLI              | Legacy local search backend URL.                                                                    |

Sources: docs.fastcrw.com (REST API section), crates/crw-core/src/config.rs, crw-mcp README.
Plugin should use `CRW_API_URL` / `CRW_API_KEY` to match upstream naming.

## Request body

Source: `SearchRequest` in crates/crw-core/src/types.rs (camelCase serde); blog/crw-search-api-release.md.

| Field                                                                                                   | Type             | Notes                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `query`                                                                                                 | string, required | Max 2000 chars (handler validation).                                                   |
| `limit`                                                                                                 | int, optional    | Default 5 (`default_limit`); clamped server-side to `1..=max_limit` (max 20).          |
| `lang`                                                                                                  | string           | SearXNG language, e.g. `en`, `de`, `auto`; validated as a language tag.                |
| `tbs`                                                                                                   | enum             | `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m`, `qdr:y`.                                           |
| `sources`                                                                                               | array            | `web`, `news`, `images`. Presence switches response to grouped form.                   |
| `categories`                                                                                            | array, max 5     | `github`, `research`, `pdf`, or passthrough string.                                    |
| `scrapeOptions`                                                                                         | object           | Scrapes each web result (timeout bounds 1..60000 ms). Adds `markdown` etc. to results. |
| `answer`, `answerTopN`, `summarizeResults`, `maxCharsPerSource`, `llmApiKey`, `llmProvider`, `llmModel` |                  | LLM synthesis; need `scrapeOptions`. Not needed by this plugin.                        |

Minimal request is `{"query","limit"}`; `lang`/`tbs` are the only extras worth exposing.

## Response

Envelope `ApiResponse` (camelCase, absent fields omitted): `success`, `data`, `error`, `error_code`, `code` (v2 compat only), `warning`.

`data` is `SearchResponseData` = `{results, answer?, citations?, llmUsage?, warnings?}`. `results` is untagged: flat `SearchResult[]` or grouped `{web,news,images}`.

Hosted example (flat, per docs):

```json
{
  "success": true,
  "data": [
    {
      "url": "https://...",
      "title": "...",
      "description": "...",
      "snippet": "...",
      "position": 1,
      "score": 9.5
    }
  ]
}
```

Self-hosted (CLI parser handles `{"success": true, "data": {"results": [ ... ]}}`).

`SearchResult`: `url`, `title`, `description`, `snippet` (alias of description, always populated), `position` (u32), optional `score`, `publishedDate`, `category`, and (with scrapeOptions) `markdown`, `html`, `rawHtml`, `links`.

Conflict note: the docs example and CLI show flat `data[]` for hosted; the struct and CLI show `data.results` for the server. I did not call a live instance, so verify against the target server and keep the dual-shape parser.

## Errors

JSON body `{"success": false, "error": "<message>", "error_code": "<code>"}` (crates/crw-server/src/error.rs).

| HTTP | error_code                            | Cause                            |
| ---- | ------------------------------------- | -------------------------------- |
| 400  | `invalid_request`                     | bad query/limit/lang             |
| 401  | (auth middleware message)             | missing/invalid key              |
| 429  | `rate_limited`                        | rate limit                       |
| 502  | `http_error`                          | search backend HTTP/JSON failure |
| 504  | `timeout`                             | search timeout (default 15 s)    |
| 503  | `search_disabled` / `search_degraded` | search off or backend unhealthy  |
| 422  | `target_unreachable`                  | backend unreachable              |
| 500  | `internal_error`                      | other                            |

Backend hostnames/credentials are never leaked in errors.

## Limits

- `limit` max 20 (default 5); `query` max 2000 chars; `categories` max 5.
- Server defaults: `rate_limit_rps` 10 (0 = unlimited), `request_timeout_secs` 60, search `timeout_ms` 15000.
- Hosted credits: 1 per search, +1 per scraped result. Rate/size limits of hosted plan are not documented in sources found.
- Self-hosted: search only works when a SearXNG-style backend is configured (`CRW_SEARCH__SEARCH_BACKEND_URL`); Docker Compose ships a search sidecar, the bare single binary does not. If unconfigured, expect 503 `search_disabled`. (An older blog post claimed self-hosted had no search; the current config.rs/self-hosting docs contradict it.)

## crw-mcp vs REST

crw-mcp 0.37.2 exposes 9 tools (`crw_scrape`, `crw_crawl`, `crw_check_crawl_status`, `crw_map`, `crw_extract`, `crw_check_extract_status`, `crw_cancel_extract`, `crw_search`, `crw_parse_file`). In proxy mode (`CRW_API_URL` set) it just forwards to the REST API with the Bearer key; in embedded mode `crw_search` only appears if a backend is configured. The REST call makes the MCP layer, its Node/binary install and the other 8 tools unnecessary for a search-only plugin; a plain `fetch` to `/v1/search` suffices.

## Sources

- https://docs.fastcrw.com/ (REST API), /self-hosting/, /mcp-clients/
- https://github.com/us/crw: crates/crw-core/src/{types.rs,config.rs,error.rs}, crates/crw-server/src/{middleware.rs,error.rs,routes/search.rs}, crates/crw-cli/src/commands/search.rs, crates/crw-mcp README, blog/crw-search-api-release.md
- https://registry.npmjs.org/crw-mcp
