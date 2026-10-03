---
name: fastcrw-search-api
description: Contract of the fastCRW `POST /v1/search` REST endpoint (auth, request, response shapes, errors, env vars). Use when writing or testing the plugin's search call or its response/error mapping.
---

# fastCRW `/v1/search`

Researched from docs.fastcrw.com and github.com/us/crw source; not tested against a live instance. Full detail: `docs/research/fastcrw-search-api.md`.

## Call

`POST {baseURL}/v1/search`, `Content-Type: application/json`, body `{ "query": string, "limit": number }`.

- `query` required, max 2000 chars. `limit` default 5, clamped server-side to 1..20.
- Optional extras worth exposing: `lang`, `tbs` (`qdr:h|d|w|m|y`). Do not send `sources` (switches the response to a grouped shape).

## Auth

`Authorization: Bearer <key>`. Send it only when a key is configured; self-hosted needs none unless the operator set `CRW_AUTH__API_KEYS`. 401 messages: "Missing Authorization header", "Invalid API key".

## Env vars (match upstream names)

`CRW_API_URL` (base URL; hosted default `https://api.fastcrw.com`, self-hosted `http://localhost:3000`), `CRW_API_KEY` (token).

## Response: parse both shapes

```json
{ "success": true, "data": [ ... ] }
{ "success": true, "data": { "results": [ ... ] } }
```

Result: `url`, `title`, `description`, `snippet` (always-populated alias of `description`), `position`, optional `score`, `publishedDate`, `category`. Map to opencode as `{ url, title, content: snippet || description || "", time: {} }`.

## Errors

Body `{ "success": false, "error": string, "error_code": string }`.

| HTTP | error_code                            |
| ---- | ------------------------------------- |
| 400  | `invalid_request`                     |
| 401  | auth middleware message               |
| 422  | `target_unreachable`                  |
| 429  | `rate_limited`                        |
| 500  | `internal_error`                      |
| 502  | `http_error`                          |
| 503  | `search_disabled` / `search_degraded` |
| 504  | `timeout`                             |

Self-hosted search needs a SearXNG-style backend (`CRW_SEARCH__SEARCH_BACKEND_URL`); without one expect 503 `search_disabled`.

## Limits

Server defaults: 10 req/s, 60 s request timeout, 15 s search timeout. A plain `fetch` suffices; `crw-mcp` is unnecessary for search only.
