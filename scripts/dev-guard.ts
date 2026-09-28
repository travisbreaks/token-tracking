import path from 'node:path'

// The local dev server serves any file under the repo root by URL (plain, ?import and
// /@fs/ forms). Keeping private files out of git and out of publicDir does not stop that,
// so requests for them are refused before Vite sees them. Private data is read only
// through the origin-checked /api/private endpoints.

const PRIVATE = [
  /^data\/private(\/|$)/, // collected private data
  /(^|\/)[^/]*\.local\.[^/]*$/, // tracking.local.json and any *.local.* file
  /^\./, // hidden top-level entries: session state, git, env files
  /^astra(\/|$)/, // the local review exchange
  /(^|\/)\.env/, // env files anywhere
]

/** True when the request URL resolves to a private file under `root`. */
export function isPrivateRequest(url: string, root: string): boolean {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(url, 'http://x').pathname)
  } catch {
    return true // unparseable: refuse
  }
  // /@fs/<absolute path> and /@id/<absolute path> address the file system directly.
  const direct = pathname.match(/^\/@(?:fs|id)(\/.*)$/)
  const abs = direct ? direct[1] : path.join(root, pathname)
  // Compare case-insensitively: on macOS (and Windows) /Data/Private/usage.json is the same
  // file as /data/private/usage.json.
  const rel = path.relative(root.toLowerCase(), path.normalize(abs).toLowerCase()).split(path.sep).join('/')
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false // outside the repo: Vite's own fs.allow decides
  return PRIVATE.some((re) => re.test(rel))
}
