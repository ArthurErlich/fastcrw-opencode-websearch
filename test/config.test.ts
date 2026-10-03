import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveConfig } from "../src/config.ts"

test("defaults", () => {
  assert.deepEqual(resolveConfig({}, {}), {
    baseURL: "http://localhost:3000",
    apiKey: undefined,
    limit: 8,
    lang: undefined,
    tbs: undefined,
  })
})

test("undefined options use defaults", () => {
  assert.equal(resolveConfig(undefined, {}).baseURL, "http://localhost:3000")
})

test("baseURL precedence: option > env > default", () => {
  const env = { CRW_API_URL: "http://env:1" }
  assert.equal(resolveConfig({ baseURL: "http://opt:2" }, env).baseURL, "http://opt:2")
  assert.equal(resolveConfig({}, env).baseURL, "http://env:1")
})

test("baseURL is trimmed and loses trailing slashes", () => {
  assert.equal(
    resolveConfig({ baseURL: "  http://crw.home:3000//  " }, {}).baseURL,
    "http://crw.home:3000",
  )
})

test("blank baseURL option falls through to env", () => {
  assert.equal(
    resolveConfig({ baseURL: " " }, { CRW_API_URL: "http://env:1" }).baseURL,
    "http://env:1",
  )
})

test("invalid baseURL throws and names option and value", () => {
  for (const bad of ["not a url", "ftp://host", 42]) {
    assert.throws(() => resolveConfig({ baseURL: bad }, {}), /baseURL/)
  }
  assert.throws(() => resolveConfig({}, { CRW_API_URL: "nope" }), /baseURL.*nope/)
})

test("apiKey precedence: option > env; unset when absent or blank", () => {
  assert.equal(resolveConfig({ apiKey: "a" }, { CRW_API_KEY: "b" }).apiKey, "a")
  assert.equal(resolveConfig({}, { CRW_API_KEY: "b" }).apiKey, "b")
  assert.equal(resolveConfig({}, { CRW_API_KEY: "" }).apiKey, undefined)
  assert.equal(resolveConfig({ apiKey: " " }, {}).apiKey, undefined)
})

test("non-string apiKey throws without echoing the value", () => {
  assert.throws(
    () => resolveConfig({ apiKey: 12345 }, {}),
    (err: Error) => /apiKey/.test(err.message) && !err.message.includes("12345"),
  )
})

test("limit: clamps to 1..20, invalid falls back to 8, never throws", () => {
  assert.equal(resolveConfig({ limit: 5 }, {}).limit, 5)
  assert.equal(resolveConfig({ limit: 99 }, {}).limit, 20)
  assert.equal(resolveConfig({ limit: 0 }, {}).limit, 1)
  assert.equal(resolveConfig({ limit: -3 }, {}).limit, 1)
  assert.equal(resolveConfig({ limit: "12" }, {}).limit, 12)
  assert.equal(resolveConfig({ limit: 3.9 }, {}).limit, 3)
  for (const bad of ["abc", NaN, null, {}, [], true]) {
    assert.equal(resolveConfig({ limit: bad }, {}).limit, 8)
  }
})

test("lang: string passes through, blank is unset, non-string throws", () => {
  assert.equal(resolveConfig({ lang: "de" }, {}).lang, "de")
  assert.equal(resolveConfig({ lang: "" }, {}).lang, undefined)
  assert.throws(() => resolveConfig({ lang: 1 }, {}), /lang/)
})

test("tbs: allowed values pass, others throw", () => {
  for (const ok of ["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"]) {
    assert.equal(resolveConfig({ tbs: ok }, {}).tbs, ok)
  }
  assert.equal(resolveConfig({ tbs: "" }, {}).tbs, undefined)
  assert.throws(() => resolveConfig({ tbs: "qdr:x" }, {}), /tbs.*qdr:x/)
  assert.throws(() => resolveConfig({ tbs: 1 }, {}), /tbs/)
})
