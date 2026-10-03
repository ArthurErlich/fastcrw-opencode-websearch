# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.0.1] - 2026-10-03

### Added

- opencode v2 plugin `fastcrw.websearch` that registers a `fastcrw` search provider backed by a self-hosted fastCRW server (`POST /v1/search`) and makes it the default websearch provider.
- Plugin options `baseURL`, `apiKey`, `limit`, `lang` and `tbs`, with `CRW_API_URL` and `CRW_API_KEY` as environment fallbacks.
- Validation at plugin load: a bad option makes the plugin fail with a message naming the option.
- Mapping of both fastCRW response shapes (`data[]` and `data.results`) and descriptive errors for API failures, non-JSON responses, unreachable servers and timeouts.
- Gitea Actions workflows for pull request checks and for publishing releases to the Gitea npm registry.
