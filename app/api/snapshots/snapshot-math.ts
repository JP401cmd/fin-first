/**
 * Gedeelde, pure rekenhelpers voor de drie snapshot-schrijfpaden
 * (`app/api/snapshots`, `…/auto`, `…/cron`).
 *
 * Eén bron van waarheid voor het opgeslagen `net_worth` en de per-rij
 * `freedom_percentage`, zodat de drie routes het identiek berekenen. Vóór deze
 * module woog POST/cron `net_worth` óngewogen en zonder losse cash, terwijl
 * auto wel woog maar de losse cash niet in het opgeslagen `net_worth` opnam —
 * drie afwijkende waarden. (Audit §R2.2 S4 / §R2.4 punt 1.)
 *
 * Canoniek (spiegelt `lib/dashboard-data-loader.ts:243-255`):
 *   netWorth = Σ(assets.current_value × inclusion_pct/100, alleen is_active)
 *            + losse bank_accounts-cash
 *            − Σ(debts.current_balance × inclusion_pct/100)
 *
 * Alléén pure functies — geen Supabase, geen I/O — zodat ze triviaal testbaar
 * zijn en in zowel user- als service-role/cron-context draaien.
 */

/** Minimale assetvorm voor de inclusion-gewogen vermogenssom. */
export interface SnapshotAsset {
  current_value?: number | string | null
  net_worth_inclusion_pct?: number | string | null
}

/** Minimale debtvorm voor de inclusion-gewogen schuldensom. */
export interface SnapshotDebt {
  current_balance?: number | string | null
  net_worth_inclusion_pct?: number | string | null
}

/** Inclusion-gewogen som over actieve assets (rijen zijn al op is_active gefilterd). */
export function weightedAssetTotal(assets: ReadonlyArray<SnapshotAsset>): number {
  return assets.reduce(
    (s, a) => s + Number(a.current_value ?? 0) * (Number(a.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
}

/** Inclusion-gewogen som over actieve debts (rijen zijn al op is_active gefilterd). */
export function weightedDebtTotal(debts: ReadonlyArray<SnapshotDebt>): number {
  return debts.reduce(
    (s, d) => s + Number(d.current_balance ?? 0) * (Number(d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
}

/**
 * Het canonieke, opgeslagen `net_worth` voor een snapshot-rij:
 * inclusion-gewogen assets + losse (niet-gekoppelde) bankrekening-cash
 * − inclusion-gewogen debts. Identiek aan de live dashboard-loader.
 */
export function computeSnapshotNetWorth(
  weightedAssets: number,
  unlinkedCash: number,
  weightedDebts: number,
): number {
  return weightedAssets + unlinkedCash - weightedDebts
}

/**
 * Per-rij `freedom_percentage` (0–100). Bewust de snapshot-eigen,
 * vol-vermogen-grondslag (huis meegerekend, géén housing-/FIRE-strategie-filter,
 * géén unified-projection) — een gedocumenteerde ADR 0009-uitzondering. De input
 * `netWorth` is het canonieke, gewogen + cash net_worth van dezelfde rij, zodat
 * `net_worth` en `freedom_percentage` per rij intern consistent zijn.
 */
export function computeSnapshotFreedomPct(netWorth: number, fireTarget: number): number {
  if (fireTarget <= 0) return 0
  return Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0)
}
