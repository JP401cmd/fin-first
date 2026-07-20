// lib/version-status/types.ts
//
// Gedeeld contract voor het /beheer/versie-dashboard: de vorm die de
// superadmin-route (app/api/admin/version-status/route.ts) teruggeeft en die de
// client-component (app/(app)/beheer/versie/versie-client.tsx) consumeert.
// Eén bron — beide kanten importeren hier vandaan, nooit een eigen shape.

/** Eén commit uit `git log`. */
export interface GitCommit {
  /** Volledige 40-char SHA. */
  sha: string
  /** Afgekorte SHA (%h). */
  short: string
  author: string
  /** ISO-8601 committer-datum (%cI). */
  date: string
  subject: string
}

/** Eén werkboom uit `git worktree list --porcelain`. */
export interface GitWorktree {
  path: string
  /** Branch-naam zonder `refs/heads/`, of null bij detached HEAD. */
  branch: string | null
  /** Afgekorte HEAD-SHA. */
  head: string
  /** Is dit de werkboom van het draaiende proces (process.cwd())? */
  isCurrent: boolean
  /** Bare repo (heeft geen working tree). */
  bare: boolean
}

/** Eén gewijzigd bestand uit `git status --porcelain`. */
export interface GitStatusFile {
  /** Ruwe 2-char XY-porcelain-code (bv. " M", "??", "A ", "MM"). */
  status: string
  path: string
}

export interface UncommittedStatus {
  /** Totaal aantal gewijzigde bestanden (vóór capping). */
  count: number
  /** Gecapte lijst (zie `truncated`). */
  files: GitStatusFile[]
  /** True als de lijst is ingekort t.o.v. `count`. */
  truncated: boolean
}

/** Ahead/behind t.o.v. een base-ref, geteld met `rev-list --left-right --count base...HEAD`. */
export interface AheadBehind {
  /** Commits in HEAD die niet in de base zitten. */
  ahead: number
  /** Commits in de base die niet in HEAD zitten. */
  behind: number
}

export interface GitStateAvailable {
  available: true
  /** `git rev-parse --abbrev-ref HEAD` — "HEAD" bij detached. */
  branch: string
  detached: boolean
  /** Volledige HEAD-SHA (voor de prod-vergelijking). */
  headSha: string | null
  headShort: string | null
  worktrees: GitWorktree[]
  commits: GitCommit[]
  uncommitted: UncommittedStatus
  /** Null als de lokale `master`-ref ontbreekt. */
  vsMaster: AheadBehind | null
  /** Null als `origin/master` ontbreekt (nooit gefetcht). */
  vsOriginMaster: AheadBehind | null
  /** Upstream-ref (`@{u}`) of null als er geen upstream is. */
  upstream: string | null
  /** Aantal commits vóór de upstream, of null zonder upstream. */
  unpushed: number | null
}

export interface GitStateUnavailable {
  available: false
  /** Waarom git niet beschikbaar is (bv. op Vercel/prod). */
  reason: string
}

export type GitState = GitStateAvailable | GitStateUnavailable

export interface MigrationStatus {
  /** Migratie-versies (timestamp-prefix) uit supabase/migrations/*.sql, gesorteerd. */
  files: string[]
  /** Toegepaste versies uit de RPC, of null als de RPC faalde. */
  applied: string[] | null
  /** Lexicografisch grootste toegepaste versie, of null. */
  maxApplied: string | null
  /** Bestandsversies STRIKT nieuwer dan maxApplied en niet toegepast — het echte
   *  "moet nog toegepast worden"-signaal (dít escaleert de banner). */
  pendingNewer: string[]
  /** Bestandsversies ≤ maxApplied die niet toegepast zijn — lineage-divergentie
   *  (de map is hernummerd t.o.v. de DB). Informatief, escaleert NIET. */
  driftOlder: string[]
  /** Toegepast, maar geen bestand — onbekende/vreemde migratie. Informatief. */
  unknownApplied: string[]
  /** True als de bestanden niet gelezen konden worden (bv. niet in de prod-bundle). */
  filesUnavailable: boolean
  /** True als de RPC-call mislukte. */
  rpcError: boolean
}

export interface VersionStatusResponse {
  generatedAt: string
  cwd: string
  git: GitState
  migrations: MigrationStatus
}
