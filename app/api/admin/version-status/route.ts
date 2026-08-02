import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import {
  parseGitLog,
  parseWorktreeList,
  parseStatusPorcelain,
  parseLeftRightCount,
} from '@/lib/version-status/parse-git'
import {
  computeMigrationDrift,
  migrationVersionFromFilename,
} from '@/lib/version-status/migrations'
import type {
  GitState,
  MigrationStatus,
  VersionStatusResponse,
} from '@/lib/version-status/types'

/**
 * GET /api/admin/version-status — read-only versie/git/migratie-staat voor
 * /beheer/versie. Superadmin-only (spiegelt app/api/admin/uat/rounds).
 *
 * Alle git-toegang is server-side via child_process, gewrapt zodat een fout
 * NOOIT 500't — git ontbreekt op Vercel/prod en dan degradeert dit naar
 * { git: { available: false, reason } }. Geen mutaties, geen `git fetch`
 * (te traag/netwerk): origin-refs zijn zo vers als de laatste fetch.
 *
 * Geen ruwe error-stacks naar de client (ADR 0044) — server-side loggen,
 * gecontroleerde shape terug.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type GitResult = { ok: true; out: string } | { ok: false; err: string }

function git(args: string[]): GitResult {
  try {
    const out = execFileSync('git', args, {
      cwd: process.cwd(),
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : 'git-fout' }
  }
}

/** Verifieer of een ref bestaat zonder te falen. */
function refExists(ref: string): boolean {
  return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok
}

function gatherGitState(): GitState {
  // Eerste, goedkope call bepaalt of git überhaupt bruikbaar is.
  const inside = git(['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || inside.out.trim() !== 'true') {
    return {
      available: false,
      reason: inside.ok
        ? 'Geen git-werkboom op deze host.'
        : 'git niet beschikbaar op deze host (verwacht op Vercel/prod).',
    }
  }

  const branchRes = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRes.ok ? branchRes.out.trim() : 'onbekend'
  const detached = branch === 'HEAD'

  const headShaRes = git(['rev-parse', 'HEAD'])
  const headSha = headShaRes.ok ? headShaRes.out.trim() : null
  const headShortRes = git(['rev-parse', '--short', 'HEAD'])
  const headShort = headShortRes.ok ? headShortRes.out.trim() : null

  const wtRes = git(['worktree', 'list', '--porcelain'])
  const worktrees = wtRes.ok ? parseWorktreeList(wtRes.out, process.cwd()) : []

  const logRes = git(['log', '-15', '--pretty=format:%H%x1f%h%x1f%an%x1f%cI%x1f%s'])
  const commits = logRes.ok ? parseGitLog(logRes.out) : []

  const statusRes = git(['status', '--porcelain'])
  const uncommitted = parseStatusPorcelain(statusRes.ok ? statusRes.out : '')

  // vs master (lokaal) — guard als de ref ontbreekt.
  let vsMaster = null
  if (refExists('master')) {
    const r = git(['rev-list', '--left-right', '--count', 'master...HEAD'])
    if (r.ok) vsMaster = parseLeftRightCount(r.out)
  }

  // vs origin/master — guard; geen fetch, dus zo vers als de laatste fetch.
  let vsOriginMaster = null
  if (refExists('origin/master')) {
    const r = git(['rev-list', '--left-right', '--count', 'origin/master...HEAD'])
    if (r.ok) vsOriginMaster = parseLeftRightCount(r.out)
  }

  // Upstream + unpushed.
  let upstream: string | null = null
  let unpushed: number | null = null
  const upstreamRes = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstreamRes.ok) {
    upstream = upstreamRes.out.trim()
    const r = git(['rev-list', '--count', '@{u}..HEAD'])
    if (r.ok) {
      const n = Number(r.out.trim())
      unpushed = Number.isFinite(n) ? n : null
    }
  }

  return {
    available: true,
    branch,
    detached,
    headSha,
    headShort,
    worktrees,
    commits,
    uncommitted,
    vsMaster,
    vsOriginMaster,
    upstream,
    unpushed,
  }
}

/** Lees de migratie-bestandsversies uit supabase/migrations/*.sql. */
function readMigrationFileVersions(): { versions: string[]; unavailable: boolean } {
  try {
    const dir = path.join(process.cwd(), 'supabase', 'migrations')
    const versions = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map(migrationVersionFromFilename)
      .filter((v): v is string => v !== null)
      .sort()
    return { versions, unavailable: false }
  } catch {
    // Map niet in de (serverless) bundle → degradeer.
    return { versions: [], unavailable: true }
  }
}

async function gatherMigrations(): Promise<MigrationStatus> {
  const { versions: files, unavailable: filesUnavailable } = readMigrationFileVersions()

  let applied: string[] | null = null
  let rpcError = false
  try {
    const svc = getServiceClient()
    const { data, error } = await svc.rpc('applied_migration_versions')
    if (error) {
      rpcError = true
      console.error('[api/admin/version-status] applied_migration_versions RPC', error.message)
    } else if (Array.isArray(data)) {
      // setof text → array van strings; robuust ook als PostgREST objecten teruggeeft.
      applied = data
        .map((row: unknown) =>
          typeof row === 'string'
            ? row
            : row && typeof row === 'object'
              ? String(Object.values(row as Record<string, unknown>)[0] ?? '')
              : '',
        )
        .filter((v: string) => v.length > 0)
        .sort()
    }
  } catch (e) {
    rpcError = true
    console.error(
      '[api/admin/version-status] service-client/RPC faalde',
      e instanceof Error ? e.message : e,
    )
  }

  const { maxApplied, pendingNewer, driftOlder, unknownApplied } = computeMigrationDrift(
    files,
    applied ?? [],
  )

  return {
    files,
    applied,
    // Zonder toegepaste lijst kunnen we drift niet betrouwbaar bepalen.
    maxApplied: applied ? maxApplied : null,
    pendingNewer: applied ? pendingNewer : [],
    driftOlder: applied ? driftOlder : [],
    unknownApplied: applied ? unknownApplied : [],
    filesUnavailable,
    rpcError,
  }
}

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  try {
    const [git, migrations] = await Promise.all([
      Promise.resolve(gatherGitState()),
      gatherMigrations(),
    ])

    const body: VersionStatusResponse = {
      generatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      git,
      migrations,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return serverError(e, 'admin-version-status:GET', 'Serverfout')
  }
}
