// Manual check against a real fastCRW server: prints the raw response shape and mapped results.
// Usage: CRW_API_URL=http://crw.home:3000 [CRW_API_KEY=...] npm run smoke -- "query"
import { resolveConfig } from "../src/config.ts"
import { search } from "../src/search.ts"

const config = resolveConfig({}, process.env)
const query = process.argv[2] ?? "opencode"

const headers: Record<string, string> = { "Content-Type": "application/json" }
if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
const raw = await fetch(`${config.baseURL}/v1/search`, {
  method: "POST",
  headers,
  body: JSON.stringify({ query, limit: config.limit }),
})
const body: any = await raw.json().catch(() => undefined)
console.log(
  `HTTP ${raw.status}; data shape:`,
  Array.isArray(body?.data) ? "data[]" : body?.data?.results ? "data.results" : "other",
)

console.log(await search(config, query, new AbortController().signal))
