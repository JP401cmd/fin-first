/**
 * Loader for the user's existing aangifte-imports.
 *
 * Used by `/identity/koppelingen` to render the "Belastingaangifte"
 * section: a list of past imports grouped by `imported_peildatum`,
 * with per-peildatum counts of imported assets and debts.
 *
 * The query relies on the partial indexes
 * `idx_assets_user_source_imported` and `idx_debts_user_source_imported`
 * (created in `<...>_add_aangifte_source.sql`) so the lookup is cheap
 * even when the user has many manual rows.
 *
 * Privacy note: this loader returns counts and dates only — no names or
 * amounts cross the boundary into the rendering layer (the koppelingen-
 * page doesn't need them, and surface-area minimisation is the rule).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One row in the "previous imports" list. The `peildatum` is the
 * grouping key — multiple imports on the same peildatum are merged
 * because the user typically imports each year's aangifte once.
 */
export interface AangifteImportSummary {
  peildatum: string // ISO yyyy-mm-dd
  taxYear: number // derived: the year part of peildatum
  assetCount: number
  debtCount: number
  /** ISO timestamp of the most recent insert in this peildatum group. */
  mostRecentImport: string
}

/**
 * Loads all aangifte-imports for the current user, grouped per
 * peildatum and sorted newest-first. Returns `[]` when the user is
 * unauthenticated or has no imports — never throws on a missing user.
 *
 * Pre-condition: the caller has already verified the auth context via
 * `supabase.auth.getUser()`. We re-check defensively to avoid leaking
 * cross-tenant data should the function ever be called from a service-
 * role context.
 */
export async function loadAangifteImports(
  supabase: SupabaseClient,
): Promise<AangifteImportSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Two queries — assets + debts — both filtered on the partial index.
  // We don't try to do this in one query via a UNION because Supabase
  // PostgREST doesn't expose UNION cleanly; two parallel calls are
  // O(2 * partial-index-size) which is trivial in practice.
  const [assetsRes, debtsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('imported_peildatum, created_at')
      .eq('user_id', user.id)
      .eq('source', 'aangifte_import')
      .not('imported_peildatum', 'is', null),
    supabase
      .from('debts')
      .select('imported_peildatum, created_at')
      .eq('user_id', user.id)
      .eq('source', 'aangifte_import')
      .not('imported_peildatum', 'is', null),
  ])

  // Errors here are non-fatal — the page still renders the rest of the
  // sections. We surface an empty list rather than throwing so a missing
  // column on a stale schema doesn't break the entire koppelingen-page.
  if (assetsRes.error || debtsRes.error) return []

  // Aggregate by peildatum.
  const groups = new Map<
    string,
    { assetCount: number; debtCount: number; mostRecentImport: string }
  >()

  function addRow(
    peildatum: string,
    createdAt: string,
    kind: 'asset' | 'debt',
  ): void {
    const existing = groups.get(peildatum)
    if (existing) {
      if (kind === 'asset') existing.assetCount += 1
      else existing.debtCount += 1
      if (createdAt > existing.mostRecentImport) {
        existing.mostRecentImport = createdAt
      }
    } else {
      groups.set(peildatum, {
        assetCount: kind === 'asset' ? 1 : 0,
        debtCount: kind === 'debt' ? 1 : 0,
        mostRecentImport: createdAt,
      })
    }
  }

  for (const row of assetsRes.data ?? []) {
    const peildatum = row.imported_peildatum as string | null
    const createdAt = row.created_at as string | null
    if (!peildatum || !createdAt) continue
    addRow(peildatum, createdAt, 'asset')
  }
  for (const row of debtsRes.data ?? []) {
    const peildatum = row.imported_peildatum as string | null
    const createdAt = row.created_at as string | null
    if (!peildatum || !createdAt) continue
    addRow(peildatum, createdAt, 'debt')
  }

  const summaries: AangifteImportSummary[] = []
  for (const [peildatum, agg] of groups.entries()) {
    // Tax-year is the year part of the peildatum (e.g. 2024 from
    // "2024-01-01"). The substring is safe because the column is
    // typed as DATE in Postgres and serialises as ISO `yyyy-mm-dd`.
    const taxYear = Number.parseInt(peildatum.slice(0, 4), 10)
    summaries.push({
      peildatum,
      taxYear: Number.isFinite(taxYear) ? taxYear : 0,
      assetCount: agg.assetCount,
      debtCount: agg.debtCount,
      mostRecentImport: agg.mostRecentImport,
    })
  }

  // Sort newest peildatum first so the list reads top-down: most
  // recent year at the top, oldest at the bottom.
  summaries.sort((a, b) => (a.peildatum < b.peildatum ? 1 : -1))
  return summaries
}
