import assert from "node:assert/strict"
import { test } from "node:test"
import { encodeName, isPublished, latestVersion, publishBody } from "../scripts/release.ts"

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
