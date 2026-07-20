// lib/version-status/parse-git.ts
//
// PURE parsers voor git-porcelain-output — geen child_process, geen fs, geen repo
// nodig. Zo zijn ze los unit-testbaar (parse-git.test.ts). De route
// (app/api/admin/version-status/route.ts) draait de git-commando's en voert de
// ruwe stdout hierin.

import type {
  AheadBehind,
  GitCommit,
  GitStatusFile,
  GitWorktree,
  UncommittedStatus,
} from './types'

/** Unit-separator die we als veld-scheiding in `git log --pretty` gebruiken. */
export const UNIT_SEP = ''

/**
 * Normaliseer een pad voor vergelijking tussen `git worktree list` (forward
 * slashes) en `process.cwd()` (backslashes op Windows). Lowercase omdat Windows
 * case-insensitief is; trailing slashes weg.
 */
export function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
    .trim()
}

/**
 * Parse `git log -N --pretty=format:%H%x1f%h%x1f%an%x1f%cI%x1f%s`.
 * Eén commit per regel, velden gescheiden door de unit-separator.
 */
export function parseGitLog(raw: string): GitCommit[] {
  if (!raw.trim()) return []
  const commits: GitCommit[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const parts = line.split(UNIT_SEP)
    const sha = parts[0] ?? ''
    if (!sha) continue
    commits.push({
      sha,
      short: parts[1] ?? '',
      author: parts[2] ?? '',
      date: parts[3] ?? '',
      // subject is het laatste veld; join beschermt tegen (theoretische) US in de tekst.
      subject: parts.slice(4).join(UNIT_SEP),
    })
  }
  return commits
}

/**
 * Parse `git worktree list --porcelain`. Blokken gescheiden door een lege regel;
 * elk blok bevat `worktree <pad>`, `HEAD <sha>` en `branch refs/heads/<naam>` of
 * `detached` (en optioneel `bare`/`locked`).
 *
 * `currentPath` (typisch process.cwd()) markeert de werkboom van het proces.
 */
export function parseWorktreeList(raw: string, currentPath?: string): GitWorktree[] {
  const result: GitWorktree[] = []
  const current = currentPath ? normalizePath(currentPath) : null

  for (const block of raw.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (!trimmed) continue

    let path = ''
    let head = ''
    let branch: string | null = null
    let bare = false

    for (const line of trimmed.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim()
      else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
      } else if (line === 'detached') branch = null
      else if (line === 'bare') bare = true
    }

    if (!path) continue
    result.push({
      path,
      branch,
      head: head ? head.slice(0, 9) : '',
      isCurrent: current !== null && normalizePath(path) === current,
      bare,
    })
  }

  return result
}

/**
 * Parse `git status --porcelain`. Elke regel is `XY <pad>` (XY = index+worktree
 * status-code). Renames (`R  oud -> nieuw`) worden teruggebracht tot het
 * nieuwe pad. De lijst wordt gecapt op `cap`; `count` blijft het totaal.
 */
export function parseStatusPorcelain(raw: string, cap = 50): UncommittedStatus {
  const lines = raw.split('\n').filter((l) => l.length > 0)
  const files: GitStatusFile[] = lines.slice(0, cap).map((line) => {
    const status = line.slice(0, 2)
    let path = line.slice(3)
    const arrow = path.indexOf(' -> ')
    if (arrow !== -1) path = path.slice(arrow + 4)
    return { status, path: path.trim() }
  })
  return { count: lines.length, files, truncated: lines.length > cap }
}

/**
 * Parse de output van `git rev-list --left-right --count base...HEAD`:
 * twee getallen gescheiden door whitespace — links = behind (in base, niet HEAD),
 * rechts = ahead (in HEAD, niet base). Null bij onparseerbare output.
 */
export function parseLeftRightCount(raw: string): AheadBehind | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 2) return null
  const behind = Number(parts[0])
  const ahead = Number(parts[1])
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return null
  return { ahead, behind }
}
