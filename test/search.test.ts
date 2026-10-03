import assert from "node:assert/strict"
import { test } from "node:test"
import type { Config } from "../src/config.ts"
import { search } from "../src/search.ts"

const config: Config = {
  baseURL: "http://crw.test:3000",
  apiKey: undefined,
  limit: 8,
  lang: undefined,
  tbs: undefined,
}
const signal = new AbortController().signal

type Call = { url: string; init: RequestInit }
function respond(body: unknown, status = 200) {
  const calls: Call[] = []
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status })
  }) as typeof fetch
  return { calls, fetchFn }
}
const ok = (data: unknown) => ({ success: true, data })

test("sends POST /v1/search with JSON body and no auth header by default", async () => {
  const { calls, fetchFn } = respond(ok([]))
  await search(config, "cats", signal, fetchFn)
  assert.equal(calls[0].url, "http://crw.test:3000/v1/search")
  assert.equal(calls[0].init.method, "POST")
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers["Content-Type"], "application/json")
  assert.equal("Authorization" in headers, false)
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { query: "cats", limit: 8 })
})

test("sends Bearer token, lang and tbs when configured", async () => {
  const { calls, fetchFn } = respond(ok([]))
  await search({ ...config, apiKey: "k", lang: "de", tbs: "qdr:w", limit: 3 }, "q", signal, fetchFn)
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, "Bearer k")
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {
    query: "q",
    limit: 3,
    lang: "de",
    tbs: "qdr:w",
  })
})

test("maps a flat data array", async () => {
  const { fetchFn } = respond(
    ok([{ url: "https://a", title: "A", snippet: "s", description: "d" }]),
  )
  assert.deepEqual(await search(config, "q", signal, fetchFn), [
    { url: "https://a", title: "A", content: "s", time: {} },
  ])
})

test("maps data.results and falls back to description", async () => {
  const { fetchFn } = respond(ok({ results: [{ url: "https://a", title: "A", description: "d" }] }))
  const [r] = await search(config, "q", signal, fetchFn)
  assert.equal(r.content, "d")
})

test("drops entries without a url, falls back to url for title, empty content", async () => {
  const { fetchFn } = respond(ok([{ title: "no url" }, null, { url: "https://b" }]))
  assert.deepEqual(await search(config, "q", signal, fetchFn), [
    { url: "https://b", title: "https://b", content: "", time: {} },
  ])
})

test("empty results return []", async () => {
  assert.deepEqual(await search(config, "q", signal, respond(ok([])).fetchFn), [])
  assert.deepEqual(await search(config, "q", signal, respond(ok({ results: [] })).fetchFn), [])
})

test("unexpected shape throws", async () => {
  for (const data of [{ web: [] }, "x", null]) {
    await assert.rejects(
      search(config, "q", signal, respond(ok(data)).fetchFn),
      /unexpected response shape/,
    )
  }
})

test("API error keeps status and code", async () => {
  const body = { success: false, error: "slow down", error_code: "rate_limited" }
  await assert.rejects(search(config, "q", signal, respond(body, 429).fetchFn), {
    message: "fastCRW 429 rate_limited: slow down",
  })
})

test("503 search_disabled and 401 carry a hint", async () => {
  await assert.rejects(
    search(
      config,
      "q",
      signal,
      respond({ success: false, error: "off", error_code: "search_disabled" }, 503).fetchFn,
    ),
    /fastCRW 503 search_disabled: off .*no search backend configured/,
  )
  await assert.rejects(
    search(config, "q", signal, respond({ success: false, error: "Invalid API key" }, 401).fetchFn),
    /fastCRW 401: Invalid API key .*check apiKey or CRW_API_KEY/,
  )
})

test("HTTP 200 with success:false is an error with status 200", async () => {
  const body = { success: false, error: "search failed", error_code: "http_error" }
  await assert.rejects(search(config, "q", signal, respond(body, 200).fetchFn), {
    message: "fastCRW 200 http_error: search failed",
  })
})

test("errors never include the token", async () => {
  const body = { success: false, error: "bad", error_code: "invalid_request" }
  await assert.rejects(
    search({ ...config, apiKey: "SECRET" }, "q", signal, respond(body, 400).fetchFn),
    (err: Error) => !err.message.includes("SECRET"),
  )
})

test("non-JSON body reports status and the first 200 chars", async () => {
  const html = "<html>" + "x".repeat(500)
  await assert.rejects(
    search(config, "q", signal, respond(html, 502).fetchFn),
    (err: Error) =>
      err.message.startsWith("fastCRW 502: non-JSON response") && err.message.length < 260,
  )
})

test("network failure names the baseURL and keeps the cause", async () => {
  const cause = new TypeError("fetch failed")
  const fetchFn = (async () => {
    throw cause
  }) as typeof fetch
  await assert.rejects(search(config, "q", signal, fetchFn), (err: Error) => {
    assert.equal(err.message, "fastCRW: cannot reach http://crw.test:3000")
    assert.equal(err.cause, cause)
    return true
  })
})

// A fetch that never answers and rejects with the signal's reason, like the real one.
const hang = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason))
  })) as typeof fetch

test("caller abort is rethrown untouched", async () => {
  const controller = new AbortController()
  const pending = search(config, "q", controller.signal, hang)
  controller.abort()
  await assert.rejects(pending, (err) => err === controller.signal.reason)
})

test("internal timeout aborts the request", async () => {
  await assert.rejects(search(config, "q", signal, hang, 20), /timed out/)
})
