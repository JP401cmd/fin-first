// lib/box1-income.ts
// Bepaalt het bruto-jaarinkomen voor de Box 1-pagina.
//
// Twee bronnen, in volgorde:
//  1. Handmatig opgeslagen `profiles.box1_gross_income` (alleen Box 1) — wint.
//  2. Automatische schatting: het netto geschatte jaarinkomen van de
//     cashflow-pagina, via de Box 1-motor omgerekend naar bruto.
//
// De netto-bron is BEWUST exact dezelfde waarde als de "Geschat jaarinkomen"-
// kaart op /overzicht/budget: het EFFECTIEVE jaarinkomen op de gekozen
// grondslag (`CashflowSettingsData.effectiveAnnualIncome`). Zo zitten Box 1 en
// cashflow gegarandeerd op hetzelfde getal.
//
// ADR 0103 — WAT HIER VERDWEEN: dit bestand droeg een PRIVATE kopie van de
// grondslagbeslissing (`cashflowNetYearly`: income_source === 'manual'
// ? net_monthly_income × 12 : estimatedAnnualIncome). Die kopie kende alleen
// `manual` versus "berekend"; een derde grondslag zou er stilzwijgend in de
// else-tak vallen en de transactiewaarde opleveren terwijl de rest van de app het
// budgetgetal toont. En dit is niet zomaar een kaartje: deze waarde voedt via
// `grossFromNet` het bruto Box 1-inkomen, en daarmee de jaarruimte, de
// jaarruimte-besparing en de fiscale kansen. Het "bekende restverschil bij
// income_source='auto'" uit ADR 0086 is hiermee voor DIT pad opgeheven — de
// resterende twee afleidingen (box1JaarruimteStatus, estimateGrossYearly) staan
// er nog, zie het aandachtspunt 'bruto-box1-grondslag-meervoudig'.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { estimateMortgageRenteJaar, grossFromNet, type Box1TaxYear } from '@/lib/box1-tax'
import type { ResolvedBasis } from '@/lib/budget-basis'

export interface Box1IncomeResolution {
  /** Bruto-jaarinkomen dat de pagina gebruikt (handmatig of schatting). */
  grossYearly: number
  /** Automatische bruto-schatting (cashflow-netto → bruto via de Box 1-motor). */
  estimateGross: number
  /** Het netto geschatte jaarinkomen uit de cashflow-pagina (de bron). */
  estimateNetYearly: number
  /** Grondslag van dat netto jaarinkomen (ADR 0103) — nooit 'auto'. */
  estimateNetBasis: ResolvedBasis
  /** True wanneer `grossYearly` een handmatig opgeslagen waarde is. */
  isManual: boolean
}

/**
 * Resolve het bruto-jaarinkomen voor de Box 1-pagina van de ingelogde gebruiker.
 * `supabase` is RLS-gescoped; `userId` selecteert de profielrij voor de override.
 */
export async function resolveBox1GrossIncome(
  supabase: SupabaseClient,
  userId: string,
  year: Box1TaxYear = 2026,
): Promise<Box1IncomeResolution> {
  // Netto geschatte jaarinkomen uit de cashflow-bron (eigen inkomen) — CONSUME,
  // don't recompute: de grondslagbeslissing is al genomen in de core-bundel.
  const cf = await loadCashflowSettingsData(supabase)
  const estimateNetYearly = cf ? Math.max(0, Math.round(cf.effectiveAnnualIncome)) : 0
  // `incomeBasis` op DIT type is per contract de grondslag van
  // `effectiveAnnualIncome` (beide 12-maands) — zie CashflowSettingsData. Label en
  // bedrag komen dus uit dezelfde resolutie; ze kunnen niet uiteenlopen.
  const estimateNetBasis: ResolvedBasis = cf?.incomeBasis ?? 'profile'
  const estimateGross = estimateNetYearly > 0 ? grossFromNet(estimateNetYearly, year) : 0

  // Handmatige override (alleen Box 1). Kolom kan vóór migratie ontbreken →
  // defensief: bij een query-fout vallen we stil terug op de schatting.
  let manual: number | null = null
  const { data, error } = await supabase
    .from('profiles')
    .select('box1_gross_income')
    .eq('id', userId)
    .maybeSingle()
  if (!error && data) {
    const raw = (data as { box1_gross_income?: number | string | null }).box1_gross_income
    const n = Number(raw)
    if (raw != null && Number.isFinite(n) && n > 0) manual = n
  }

  return {
    grossYearly: manual ?? estimateGross,
    estimateGross,
    estimateNetYearly,
    estimateNetBasis,
    isManual: manual != null,
  }
}

// ── Eigen woning: de TWEEDE helft van de Box 1-invoer ──────────────────────
//
// Bevinding C8 (26-08-2026). `computeBox1Tax` is één motor, maar hij kreeg op
// twee oppervlakken VERSCHILLENDE invoer: de Box 1-subpagina deed zelf de
// eigen_huis/mortgage-lookup en gaf `wozValue`/`hypotheekRente` mee, de
// belasting-hub (via `loadFiscaleKansen`) niet. Zelfde motor, zelfde bruto,
// twee heffingen — €4.357 uit elkaar bij een aftrekpost van €8.803. Dat is geen
// afrondingsverschil maar een ontbrekende invoer, en het was er vanaf dag één
// (de lookup heeft nooit in de loader gestaan).
//
// Naast `resolveBox1GrossIncome` gezet omdat het exact hetzelfde soort ding is:
// niet de rekenregel (die woont in `lib/box1-tax.ts`) maar de RESOLUTIE van één
// motor-invoerveld uit de database. Bruto en eigen woning zijn samen de
// volledige Box 1-invoer; ze horen op dezelfde plek te worden opgehaald zodat
// een nieuw oppervlak er niet één van kan vergeten.

/**
 * De eigen-woning-invoer voor `computeBox1Tax`, al gegateerd: zonder eigen
 * woning zijn beide velden `undefined`, precies zoals `Box1Input` ze dan
 * verwacht. Spreid ze in de motor-aanroep — dan kan een oppervlak de gating
 * niet zelf verkeerd overschrijven.
 */
export interface EigenWoningBox1Input {
  /** `Box1Input.wozValue` — `undefined` zodra er geen eigen woning met WOZ is. */
  wozValue: number | undefined
  /** `Box1Input.hypotheekRente` — `undefined` zodra er geen eigen woning met WOZ is. */
  hypotheekRente: number | undefined
  /** True zodra er een actieve `eigen_huis`-asset met WOZ-waarde > 0 is. */
  hasEigenWoning: boolean
}

/** De inerte uitkomst: geen eigen woning → de motor rekent zuiver over het bruto. */
export const GEEN_EIGEN_WONING: EigenWoningBox1Input = {
  wozValue: undefined,
  hypotheekRente: undefined,
  hasEigenWoning: false,
}

interface EigenHuisRow {
  id: string
  woz_value: number | string | null
}

interface MortgageRow {
  linked_asset_id: string | null
  current_balance: number | string | null
  interest_rate: number | string | null
}

/**
 * De pure mapping van de twee query-uitkomsten naar de motor-invoer. Apart
 * exporteerbaar zodat de randgevallen (geen woning, WOZ 0, hypotheek aan een
 * ándere asset, meerdere hypotheken, NUMERIC-als-string) zonder DB testbaar
 * zijn.
 *
 * REGELS (byte-identiek aan wat de Box 1-subpagina deed):
 *  · de eerste rij is de woning — de query sorteert op WOZ aflopend;
 *  · WOZ ≤ 0 → géén eigen woning, óók als er hypotheken zijn (zonder
 *    forfait-grondslag is de renteaftrek niet te plaatsen);
 *  · alleen hypotheken die aan DEZE woning gekoppeld zijn tellen mee, en ze
 *    worden gesommeerd (meerdere leningdelen op één huis is normaal).
 */
export function buildEigenWoningBox1Input(
  eigenHuisRows: EigenHuisRow[] | null | undefined,
  mortgageRows: MortgageRow[] | null | undefined,
): EigenWoningBox1Input {
  const eigenHuis = eigenHuisRows?.[0] ?? null
  const wozValue = eigenHuis ? Number(eigenHuis.woz_value) || 0 : 0
  if (!eigenHuis || wozValue <= 0) return GEEN_EIGEN_WONING

  const hypotheekRente = (mortgageRows ?? [])
    .filter((d) => d.linked_asset_id === eigenHuis.id)
    .reduce((sum, d) => sum + estimateMortgageRenteJaar(d.current_balance, d.interest_rate), 0)

  return { wozValue, hypotheekRente, hasEigenWoning: true }
}

/**
 * Haal de eigen-woning-invoer voor de Box 1-motor op. `supabase` is
 * RLS-gescoped; we vragen expliciete kolommen (nooit `select('*')` op `assets`
 * — die tabel draagt ciphertext- en blind-index-kolommen).
 *
 * AANTEKENING — EIGENAARSCHAP (bestaand gedrag, bewust ongewijzigd
 * meeverhuisd). De SELECT-policy op `assets` en `debts` is huishoud-gedeeld
 * voor rijen met `ownership = 'shared'`. Deze lookup filtert daar NIET op, dus
 * bij een gedeelde woning telt de volle WOZ mee in de Box 1-som van beide
 * partners, terwijl Box 1 per persoon is. Dat is precies wat de subpagina al
 * deed en wat deze kaart moest gelijktrekken; het apart beoordelen (halveren
 * bij gedeeld eigendom? eigendomsaandeel als veld?) is een eigen besluit en een
 * eigen kaart — het hier stilletjes veranderen zou de referentie verschuiven
 * waartegen de hub is gelijkgetrokken.
 */
export async function resolveEigenWoningBox1Input(
  supabase: SupabaseClient,
): Promise<EigenWoningBox1Input> {
  const [eigenHuisRes, mortgageRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id, woz_value')
      .eq('is_active', true)
      .eq('asset_type', 'eigen_huis')
      .order('woz_value', { ascending: false, nullsFirst: false })
      .limit(1),
    supabase
      .from('debts')
      .select('linked_asset_id, current_balance, interest_rate')
      .eq('is_active', true)
      .eq('debt_type', 'mortgage'),
  ])

  return buildEigenWoningBox1Input(
    eigenHuisRes.data as EigenHuisRow[] | null,
    mortgageRes.data as MortgageRow[] | null,
  )
}
