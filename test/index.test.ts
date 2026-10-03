import assert from "node:assert/strict"
import { test } from "node:test"
import plugin from "../src/index.ts"

function fakeContext(options: Record<string, unknown>) {
  const added: { id: string; name: string; execute: Function }[] = []
  const defaults: unknown[] = []
  const editor = {
    add: (definition: (typeof added)[number]) => added.push(definition),
    default: { get: () => undefined, set: (value: unknown) => defaults.push(value) },
  }
  const ctx = {
    options,
    websearch: { transform: async (fn: (e: typeof editor) => void) => fn(editor) },
  }
  return { ctx: ctx as never, added, defaults }
}

test("plugin id", () => {
  assert.equal(plugin.id, "fastcrw.websearch")
})

test("setup registers the fastcrw provider and makes it the default", async () => {
  const { ctx, added, defaults } = fakeContext({ baseURL: "http://crw.test:3000" })
  await plugin.setup(ctx)
  assert.equal(added.length, 1)
  assert.equal(added[0].id, "fastcrw")
  assert.equal(added[0].name, "fastCRW")
  assert.deepEqual(defaults, ["fastcrw"])
})

test("setup throws on bad options and registers nothing", async () => {
  const { ctx, added, defaults } = fakeContext({ baseURL: "nope" })
  await assert.rejects(Promise.resolve(plugin.setup(ctx)), /baseURL/)
  assert.equal(added.length + defaults.length, 0)
})

test("the registered provider searches the configured endpoint", async () => {
  const { ctx, added } = fakeContext({ baseURL: "http://crw.test:3000", limit: 2 })
  await plugin.setup(ctx)
  const realFetch = globalThis.fetch
  let seen = ""
  globalThis.fetch = (async (url: string) => {
    seen = url
    return new Response(
      JSON.stringify({ success: true, data: [{ url: "https://a", title: "A", snippet: "s" }] }),
    )
  }) as typeof fetch
  try {
    const results = await added[0].execute(
      { query: "cats" },
      { signal: new AbortController().signal },
    )
    assert.equal(seen, "http://crw.test:3000/v1/search")
    assert.deepEqual(results, [{ url: "https://a", title: "A", content: "s", time: {} }])
  } finally {
    globalThis.fetch = realFetch
  }
})
