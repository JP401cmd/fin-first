// lib/box1-income.ts
// Bepaalt het bruto-jaarinkomen voor de Box 1-pagina.
//
// Twee bronnen, in volgorde:
//  1. Handmatig opgeslagen `profiles.box1_gross_income` (alleen Box 1) — wint.
//  2. Automatische schatting: het netto geschatte jaarinkomen van de
//     cashflow-pagina, via de Box 1-motor omgerekend naar bruto.
//
// De netto-bron is BEWUST exact dezelfde waarde als de "Geschat jaarinkomen"-
// kaart op /overzicht/cashflow: het EFFECTIEVE jaarinkomen op de gekozen
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
import { grossFromNet, type Box1TaxYear } from '@/lib/box1-tax'
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
