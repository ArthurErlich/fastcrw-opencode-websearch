// Publishes the latest CHANGELOG.md version to a Gitea npm registry without `npm publish`, tags the
// commit `v<version>` and links the package to this repository. Every step is idempotent, so a
// rerun repairs a release that is only partly done.
// Env: SERVER_URL, REPOSITORY (owner/repo), SHA (from the workflow), TOKEN (needs write:package
// and write:repository).
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export function latestVersion(changelog: string): string {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/m)
  if (!match) throw new Error("no release heading like `## [1.0.0]` found in CHANGELOG.md")
  return match[1]
}

export const encodeName = (name: string) => name.replace("/", "%2F")

export const isPublished = (packument: { versions?: Record<string, unknown> }, version: string) =>
  Boolean(packument.versions?.[version])

export function publishBody(pkg: { name: string; version: string }, tarball: Buffer): object {
  const { name, version } = pkg
  const file = `${name}-${version}.tgz`
  return {
    _id: name,
    name,
    "dist-tags": { latest: version },
    versions: {
      [version]: {
        ...pkg,
        _id: `${name}@${version}`,
        dist: {
          shasum: createHash("sha1").update(tarball).digest("hex"),
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
        },
      },
    },
    _attachments: {
      [file]: {
        content_type: "application/octet-stream",
        data: tarball.toString("base64"),
        length: tarball.length,
      },
    },
  }
}

type Api = { base: string; headers: Record<string, string>; fetchFn?: typeof fetch }

async function call(api: Api, method: string, path: string, body?: object) {
  return (api.fetchFn ?? fetch)(`${api.base}${path}`, {
    method,
    headers: { ...api.headers, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  })
}

const fail = async (what: string, res: Response) =>
  new Error(`${what} failed: ${res.status} ${await res.text()}`)

export async function ensureTag(api: Api, repo: string, version: string, sha: string) {
  const tag = `v${version}`
  const existing = await call(api, "GET", `/repos/${repo}/tags/${tag}`)
  if (existing.ok) return "exists"
  if (existing.status !== 404) throw await fail("tag lookup", existing)
  const res = await call(api, "POST", `/repos/${repo}/tags`, {
    tag_name: tag,
    target: sha,
    message: `Release ${version}`,
  })
  if (!res.ok) throw await fail("tag creation", res)
  return "created"
}

export async function ensureLinked(
  api: Api,
  owner: string,
  name: string,
  version: string,
  repoName: string,
) {
  const pkg = `/packages/${owner}/npm/${encodeURIComponent(name)}`
  const existing = await call(api, "GET", `${pkg}/${version}`)
  if (!existing.ok) throw await fail("package lookup", existing)
  if (((await existing.json()) as { repository?: unknown }).repository) return "already linked"
  const res = await call(api, "POST", `${pkg}/-/link/${repoName}`)
  if (!res.ok) throw await fail("package link", res)
  return "linked"
}

async function main() {
  const { SERVER_URL, REPOSITORY, SHA, TOKEN: token } = process.env
  if (!SERVER_URL || !REPOSITORY || !SHA || !token) {
    throw new Error("SERVER_URL, REPOSITORY, SHA and TOKEN must be set")
  }
  const [owner, repoName] = REPOSITORY.split("/")
  const server = SERVER_URL.replace(/\/+$/, "")
  const registry = `${server}/api/packages/${owner}/npm`

  const version = latestVersion(readFileSync("CHANGELOG.md", "utf8"))
  // The version is rewritten in the staged copy only; the repo keeps its dev version.
  const pkg = { ...JSON.parse(readFileSync("package.json", "utf8")), version }
  const url = `${registry}/${encodeName(pkg.name)}`
  const headers = { Authorization: `Bearer ${token}` }

  const existing = await fetch(url, { headers })
  if (existing.ok && isPublished(await existing.json(), version)) {
    console.log(`${pkg.name}@${version} is already published, skipping publish`)
  } else if (!existing.ok && existing.status !== 404) {
    throw new Error(`registry lookup failed: ${existing.status} ${await existing.text()}`)
  } else {
    await publish(pkg, url, headers)
  }

  const api = { base: `${server}/api/v1`, headers }
  console.log(`tag v${version}: ${await ensureTag(api, REPOSITORY, version, SHA)}`)
  console.log(`package link: ${await ensureLinked(api, owner, pkg.name, version, repoName)}`)
}

async function publish(
  pkg: { name: string; version: string },
  url: string,
  headers: Record<string, string>,
) {
  const { version } = pkg
  rmSync(".release", { recursive: true, force: true })
  mkdirSync(".release/package", { recursive: true })
  writeFileSync(".release/package/package.json", JSON.stringify(pkg, null, 2))
  cpSync("dist", ".release/package/dist", { recursive: true })
  execFileSync("tar", ["-czf", "package.tgz", "-C", ".release", "package"], { cwd: "." })
  const tarball = readFileSync("package.tgz")

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(publishBody(pkg, tarball)),
  })
  if (!res.ok) throw new Error(`publish failed: ${res.status} ${await res.text()}`)
  console.log(`published ${pkg.name}@${version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
