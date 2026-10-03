import type { Config } from "./config.ts"

export type SearchResult = {
  url: string
  title: string
  content: string
  time: Record<string, never>
}

const TIMEOUT_MS = 30_000

const str = (value: unknown) => (typeof value === "string" ? value : "")
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

function hint(status: number, code: string | undefined): string {
  if (status === 401) return " (check apiKey or CRW_API_KEY)"
  if (code === "search_disabled") return " (the server has no search backend configured)"
  return ""
}

// Hosted fastCRW returns `data` as an array, self-hosted as `{ results: [...] }`.
function items(data: unknown): unknown[] {
  const list = isObject(data) && !Array.isArray(data) ? data.results : data
  if (!Array.isArray(list)) throw new Error("fastCRW: unexpected response shape")
  return list
}

export async function search(
  config: Config,
  query: string,
  signal: AbortSignal,
  fetchFn: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<SearchResult[]> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  let res: Response
  let text: string
  try {
    res = await fetchFn(`${config.baseURL}/v1/search`, {
      method: "POST",
      signal: AbortSignal.any([signal, timeout]),
      headers,
      body: JSON.stringify({
        query,
        limit: config.limit,
        ...(config.lang && { lang: config.lang }),
        ...(config.tbs && { tbs: config.tbs }),
      }),
    })
    text = await res.text()
  } catch (cause) {
    if (signal.aborted) throw cause
    if (timeout.aborted) throw new Error(`fastCRW: timed out after ${timeoutMs / 1000}s`, { cause })
    throw new Error(`fastCRW: cannot reach ${config.baseURL}`, { cause })
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`fastCRW ${res.status}: non-JSON response: ${text.slice(0, 200)}`)
  }
  const parsed = isObject(body) ? body : {}

  if (!res.ok || parsed.success === false) {
    const code = str(parsed.error_code) || undefined
    const message = str(parsed.error) || res.statusText || "request failed"
    throw new Error(
      `fastCRW ${res.status}${code ? ` ${code}` : ""}: ${message}${hint(res.status, code)}`,
    )
  }

  return items(parsed.data).flatMap((item) => {
    if (!isObject(item) || !str(item.url)) return []
    const url = str(item.url)
    return [
      {
        url,
        title: str(item.title) || url,
        content: str(item.snippet) || str(item.description),
        time: {},
      },
    ]
  })
}
