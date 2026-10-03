# fastCRW websearch plugin for opencode

An opencode v2 plugin that makes a self-hosted fastCRW server opencode's websearch.

## Language

**Plugin**:
The opencode v2 module this repo builds and ships.
_Avoid_: extension, integration

**Search provider**:
A named websearch backend that opencode can select. This plugin registers one, `fastcrw`, and makes it the only one.
_Avoid_: engine, backend (a fastCRW server's own search backend is a different thing)

**Endpoint**:
The base URL of the fastCRW server the plugin talks to. Set by the `baseURL` option or `CRW_API_URL`; defaults to `http://localhost:3000`.
_Avoid_: host, server URL

**Token**:
The optional Bearer key sent to the fastCRW server. Set by the `apiKey` option or `CRW_API_KEY`. Absent means no auth header.
_Avoid_: secret, password

**Plugin options**:
The values opencode passes to the plugin from `opencode.json`: `baseURL`, `apiKey`, `limit`, `lang`, `tbs`.
_Avoid_: settings, config (config means `opencode.json` as a whole)
