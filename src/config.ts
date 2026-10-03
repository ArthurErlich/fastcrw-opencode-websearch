export type Config = {
  baseURL: string
  apiKey: string | undefined
  limit: number
  lang: string | undefined
  tbs: string | undefined
}

const DEFAULT_BASE_URL = "http://localhost:3000"
const DEFAULT_LIMIT = 8
const TBS_VALUES = ["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"]

// Blank strings count as unset so an empty env var does not shadow the default.
function str(value: unknown, name: string, secret = false): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") {
    throw new Error(
      `fastCRW: option ${name} must be a string${secret ? "" : `, got ${JSON.stringify(value)}`}`,
    )
  }
  return value.trim() || undefined
}

function baseURL(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`fastCRW: invalid baseURL ${JSON.stringify(value)} (expected an http(s) URL)`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`fastCRW: invalid baseURL ${JSON.stringify(value)} (expected an http(s) URL)`)
  }
  return value.replace(/\/+$/, "")
}

function limit(value: unknown): number {
  const n = typeof value === "string" && value.trim() ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(20, Math.max(1, Math.trunc(n)))
}

export function resolveConfig(
  options: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
): Config {
  const opts = options ?? {}
  const tbs = str(opts.tbs, "tbs")
  if (tbs !== undefined && !TBS_VALUES.includes(tbs)) {
    throw new Error(
      `fastCRW: invalid tbs ${JSON.stringify(tbs)} (expected one of ${TBS_VALUES.join(", ")})`,
    )
  }
  return {
    baseURL: baseURL(
      str(opts.baseURL, "baseURL") ?? str(env.CRW_API_URL, "CRW_API_URL") ?? DEFAULT_BASE_URL,
    ),
    apiKey: str(opts.apiKey, "apiKey", true) ?? str(env.CRW_API_KEY, "CRW_API_KEY", true),
    limit: limit(opts.limit),
    lang: str(opts.lang, "lang"),
    tbs,
  }
}
