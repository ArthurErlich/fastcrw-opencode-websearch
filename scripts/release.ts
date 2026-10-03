// Publishes the latest CHANGELOG.md version to a Gitea npm registry without `npm publish`.
// Env: REGISTRY_URL (e.g. https://host/api/packages/<owner>/npm), TOKEN (needs write:package).
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

async function main() {
  const registry = process.env.REGISTRY_URL?.replace(/\/+$/, "")
  const token = process.env.TOKEN
  if (!registry || !token) throw new Error("REGISTRY_URL and TOKEN must be set")

  const version = latestVersion(readFileSync("CHANGELOG.md", "utf8"))
  // The version is rewritten in the staged copy only; the repo keeps its dev version.
  const pkg = { ...JSON.parse(readFileSync("package.json", "utf8")), version }
  const url = `${registry}/${encodeName(pkg.name)}`
  const headers = { Authorization: `Bearer ${token}` }

  const existing = await fetch(url, { headers })
  if (existing.ok && isPublished(await existing.json(), version)) {
    console.log(`${pkg.name}@${version} is already published, skipping`)
    return
  }
  if (!existing.ok && existing.status !== 404) {
    throw new Error(`registry lookup failed: ${existing.status} ${await existing.text()}`)
  }

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
