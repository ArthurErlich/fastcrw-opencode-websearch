import assert from "node:assert/strict"
import { test } from "node:test"
import {
  encodeName,
  ensureLinked,
  ensureTag,
  isPublished,
  latestVersion,
  publishBody,
} from "../scripts/release.ts"

const changelog = (body: string) => `# Changelog\n\n${body}\n`

test("latestVersion picks the first released heading and skips Unreleased", () => {
  const text = changelog(
    "## [Unreleased]\n\n- wip\n\n## [1.2.0] - 2026-10-10\n\n## [1.1.0] - 2026-10-01\n",
  )
  assert.equal(latestVersion(text), "1.2.0")
})

test("latestVersion accepts prerelease versions", () => {
  assert.equal(latestVersion(changelog("## [2.0.0-beta.1] - 2026-10-10")), "2.0.0-beta.1")
})

test("latestVersion throws when there is no release", () => {
  assert.throws(() => latestVersion(changelog("## [Unreleased]\n\n- wip")), /no release/)
})

test("encodeName escapes the scope slash", () => {
  assert.equal(encodeName("@haylan/opencode-fastcrw"), "@haylan%2Fopencode-fastcrw")
})

test("isPublished checks the versions map of a packument", () => {
  assert.equal(isPublished({ versions: { "1.0.0": {} } }, "1.0.0"), true)
  assert.equal(isPublished({ versions: { "1.0.0": {} } }, "1.1.0"), false)
  assert.equal(isPublished({}, "1.0.0"), false)
})

test("publishBody builds the npm publish payload with the tarball attached", () => {
  const pkg = { name: "@haylan/opencode-fastcrw", version: "1.0.0", description: "d" }
  const tarball = Buffer.from("tarball-bytes")
  const body = publishBody(pkg, tarball) as any
  const file = "@haylan/opencode-fastcrw-1.0.0.tgz"
  assert.equal(body._id, "@haylan/opencode-fastcrw")
  assert.deepEqual(body["dist-tags"], { latest: "1.0.0" })
  assert.equal(body.versions["1.0.0"]._id, "@haylan/opencode-fastcrw@1.0.0")
  assert.match(body.versions["1.0.0"].dist.shasum, /^[0-9a-f]{40}$/)
  assert.match(body.versions["1.0.0"].dist.integrity, /^sha512-/)
  assert.equal(body._attachments[file].data, tarball.toString("base64"))
  assert.equal(body._attachments[file].length, tarball.length)
})

// Fake Gitea API: each route answers with a status and optional JSON body; calls are recorded.
function fakeApi(routes: Record<string, [number, unknown?]>) {
  const calls: string[] = []
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace("https://git.test/api/v1", "")}`
    calls.push(key + (init?.body ? ` ${init.body}` : ""))
    const [status, body] = routes[key] ?? [500, { message: `unexpected ${key}` }]
    return new Response(JSON.stringify(body ?? {}), { status })
  }) as typeof fetch
  return {
    calls,
    api: { base: "https://git.test/api/v1", headers: { Authorization: "Bearer t" }, fetchFn },
  }
}

test("ensureTag creates the tag when it does not exist", async () => {
  const { calls, api } = fakeApi({
    "GET /repos/haylan/r/tags/v1.0.0": [404],
    "POST /repos/haylan/r/tags": [201],
  })
  assert.equal(await ensureTag(api, "haylan/r", "1.0.0", "abc123"), "created")
  assert.deepEqual(JSON.parse(calls[1].replace("POST /repos/haylan/r/tags ", "")), {
    tag_name: "v1.0.0",
    target: "abc123",
    message: "Release 1.0.0",
  })
})

test("ensureTag leaves an existing tag alone", async () => {
  const { calls, api } = fakeApi({ "GET /repos/haylan/r/tags/v1.0.0": [200, { name: "v1.0.0" }] })
  assert.equal(await ensureTag(api, "haylan/r", "1.0.0", "abc123"), "exists")
  assert.equal(calls.length, 1)
})

test("ensureTag throws on an unexpected API answer", async () => {
  const { api } = fakeApi({ "GET /repos/haylan/r/tags/v1.0.0": [403, { message: "no" }] })
  await assert.rejects(ensureTag(api, "haylan/r", "1.0.0", "abc"), /403/)
})

const pkgPath = "/packages/haylan/npm/%40haylan%2Fopencode-fastcrw"

test("ensureLinked links an unlinked package to the repository", async () => {
  const { calls, api } = fakeApi({
    [`GET ${pkgPath}/1.0.0`]: [200, { repository: null }],
    [`POST ${pkgPath}/-/link/r`]: [201],
  })
  assert.equal(
    await ensureLinked(api, "haylan", "@haylan/opencode-fastcrw", "1.0.0", "r"),
    "linked",
  )
  assert.equal(calls.length, 2)
})

test("ensureLinked skips a package that already has a repository", async () => {
  const { calls, api } = fakeApi({
    [`GET ${pkgPath}/1.0.0`]: [200, { repository: { full_name: "haylan/r" } }],
  })
  assert.equal(
    await ensureLinked(api, "haylan", "@haylan/opencode-fastcrw", "1.0.0", "r"),
    "already linked",
  )
  assert.equal(calls.length, 1)
})

test("ensureLinked throws when the package lookup or link fails", async () => {
  const lookup = fakeApi({ [`GET ${pkgPath}/1.0.0`]: [404] })
  await assert.rejects(
    ensureLinked(lookup.api, "haylan", "@haylan/opencode-fastcrw", "1.0.0", "r"),
    /404/,
  )
  const link = fakeApi({
    [`GET ${pkgPath}/1.0.0`]: [200, {}],
    [`POST ${pkgPath}/-/link/r`]: [403],
  })
  await assert.rejects(
    ensureLinked(link.api, "haylan", "@haylan/opencode-fastcrw", "1.0.0", "r"),
    /403/,
  )
})
