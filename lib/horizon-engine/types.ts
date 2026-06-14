/**
 * Horizon grootboek-engine — types.
 *
 * Tabel-georiënteerde FIRE-rekenmotor (zie docs/horizon-tabel-rekenmotor-plan.md).
 * Eén forward-pass bouwt het grootboek (V_op), één backward-pass bouwt V_nodig,
 * het snijpunt is FIRE. Alle weergaves (lijn/bar/in-uit) en de beheer-tabellen
 * A–G zijn pure views op `LedgerRow[]`.
 *
 * Granulariteit: **per individueel asset en per individuele schuld** — zodat
 * interventies en volgordelijkheid later op assetniveau toegepast kunnen worden.
 * Views/adapter rollen op naar asset-type waar de bestaande front-end dat vraagt.
 *
 * Fase 1–2: reële termen, Box 3-drag per asset, vereenvoudigde Box 1 (placeholder
 * voor tabel D). Pure functions, geen Supabase.
 */

import type { AssetType } from '@/lib/asset-data'
import type { FireEndStrategy } from '@/lib/fire-strategy'

export type Fase = 'opbouw' | 'overbrugging' | 'onttrekking'

/** Per-asset beweging in één projectiejaar (audit-decompositie). */
export interface AssetBeweging {
  id: string
  naam: string
  type: AssetType
  begin: number
  rendement: number
  instroom: number
  uitstroom: number
  box3: number
  eind: number
}

/** Per-schuld beweging in één projectiejaar. */
export interface SchuldBeweging {
  id: string
  naam: string
  begin: number
  rente: number
  aflossing: number
  extraAflossing: number
  eind: number
}

/** Opgeloste gebeurtenis die dit jaar de cashflow/asset-mix raakte. */
export interface LedgerEvent {
  id: string
  naam: string
  bedrag: number
  richting: 'income' | 'expense'
}

/**
 * Eén rij per projectiejaar — de canonieke bron. Alle tabellen (A–G) en de
 * front-end-adapter lezen hieruit.
 */
export interface LedgerRow {
  jaar: number
  leeftijd: number
  fase: Fase
  werkt: boolean

  // ── Inkomen (reëel) ──
  salaris: number
  aowEnPensioen: number
  overigInkomen: number

  // ── Belasting (tabel D) — uitsluitend Box 3. HRA + loonheffing zitten al in
  //    de spaarquote (accumulatie) resp. de netto AOW/pensioen-cashflows. ──
  box3Grondslag: number
  box3: number

  // ── Wonen & uitgaven (tabel A) ──
  woonkosten: number
  leefuitgaven: number
  eventsUitgave: number
  totaleUitgaven: number
  cashflowNetto: number

  // ── Per individueel asset / schuld (tabel B/C) ──
  assets: AssetBeweging[]
  schulden: SchuldBeweging[]

  // ── Totalen + bracketing ──
  totaalAssets: number
  totaalSchuld: number
  nettoVermogen: number
  /** Liquide (niet-eigen-huis/voertuig/fysiek) vermogen — de V_op-lijn. */
  liquideVermogen: number
  vNodig: number
  /** dekking = liquideVermogen − vNodig (≥ 0 betekent: FIRE haalbaar dit jaar). */
  dekking: number

  // ── Events ──
  events: LedgerEvent[]
}

/** Per-asset-type rollup van een rij (voor composition-bar + adapter). */
export interface TypeRollup {
  type: AssetType
  begin: number
  rendement: number
  instroom: number
  uitstroom: number
  box3: number
  eind: number
}

/**
 * Resultaat van de grootboek-engine. Bevat de volledige ledger plus de
 * afgeleide FIRE-uitkomsten (compatibel te maken met `UnifiedProjectionResult`
 * via `lib/horizon-engine/adapter.ts`).
 */
export interface HorizonLedgerResult {
  rows: LedgerRow[]
  /** V_nodig per jaar (zelfde index als `rows`). */
  vNodig: number[]
  fireAge: number | null
  fireAgeFractional: number | null
  fireReachable: boolean
  /** V_nodig op het snijpunt (benodigd liquide vermogen). */
  requiredFirePortfolioAtFire: number
  /** Liquide vermogen op het snijpunt. */
  liquideAtFire: number
  displayEndAge: number
  strategy: FireEndStrategy
  /** Inflatie waarmee gerekend is — nodig voor reëel→nominaal in de adapter. */
  inflationRate: number
  /**
   * Legacy alléén: zelfs de vroegst mogelijke FIRE-leeftijd (stoppen = nu)
   * eindigt al ≥ nalatenschapsbedrag, dus de afbouw-lijn schiet onvermijdelijk
   * over het doel — "je kunt nu al stoppen". GEEN onbereikbaarheid (fireReachable
   * blijft true). Voor andere strategieën altijd false. Zie ADR 0017.
   */
  legacyTargetUnavoidablyExceeded: boolean
}
