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
 * zijn en in zowel user- als service-role/cron-context draaien. Constanten
 * (BOX3_DRAG / CURRENT_TAX_YEAR) worden geconsumeerd uit hun canonieke home,
 * nooit hier gehercodeerd.
 */
import { BOX3_DRAG } from '@/lib/constants'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'

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

// ── Snapshot-provenance ([Arch F6], bevinding #27) ────────────────────────
//
// De parameterset/aannames die de AFGELEIDEN van een snapshot produceerden
// (freedom_percentage, fire_age, savings_rate, sovereignty_level,
// resilience_score), zodat een historisch getal later herleidbaar is. Landt in
// de nullable `params jsonb`-kolom (migr. 20260721170000). Bewust een compacte
// WAARDE-snapshot (spiegelt lead_intakes.report_snapshot), colocatie met de rij,
// geen join.

/**
 * Provenance-parameterset van één snapshot-rij. Bewust ENGINE-ONAFHANKELIJK:
 * de motor die fire_age schreef staat in de `engine_bron`-kolom, de score-
 * methode in `score_version` — die worden hier NIET gedupliceerd (dat zou
 * params↔fire_age laten driften zodra de /toekomst-hook fire_age naar de kernel
 * patcht). De hier vastgelegde aannames (SWR/rendement/inflatie/Box 3-drag/
 * belastingjaar/grondslag) blijven geldig ongeacht welke motor ze consumeerde.
 */
export interface SnapshotParams {
  /** Schema-versie van deze payload (nu 1). */
  v: 1
  /** Effectieve onttrekkingsvoet (grossReturn − box3Drag − inflation). */
  swr: number
  /** Bruto verwacht rendement (profiel-instelling of default). */
  grossReturn: number
  /** Verwachte inflatie (profiel-instelling of default). */
  inflation: number
  /** Box 3-belastingdruk op rendement (forfait × tarief), jaargebonden. */
  box3Drag: number
  /** Belastingjaar dat box3Drag bepaalt — verschuift effectiveSwr bij een jaarwissel. */
  taxYear: number
  /** Vermogensgrondslag van freedom_percentage: snapshots gebruiken VOLLEDIG netto vermogen (huis mee). */
  grondslag: 'full-networth'
  /** Bron van de spaarquote-invoer: snapshots leiden 'm af uit transacties (income/expenses). */
  savingsSource: 'transactions'
}

/** Trimt float-ruis af op 5 decimalen (basispunt-precisie) zonder betekenisverlies. */
function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5
}

/**
 * Bouw de compacte provenance-parameterset voor een snapshot-rij. Consumeert de
 * reeds-geresolvede FIRE-parameters (resolveFireParams) plus de canonieke Box 3-
 * constanten (BOX3_DRAG / CURRENT_TAX_YEAR) — geen herberekening, geen inline
 * getallen. Aangeroepen door alle drie de schrijfpaden (POST/auto/cron) zodat de
 * parameterset identiek en op één plek gevormd wordt.
 */
export function buildSnapshotParams(fire: {
  grossReturn: number
  inflationRate: number
  effectiveSwr: number
}): SnapshotParams {
  return {
    v: 1,
    swr: round5(fire.effectiveSwr),
    grossReturn: round5(fire.grossReturn),
    inflation: round5(fire.inflationRate),
    box3Drag: round5(BOX3_DRAG),
    taxYear: CURRENT_TAX_YEAR,
    grondslag: 'full-networth',
    savingsSource: 'transactions',
  }
}
