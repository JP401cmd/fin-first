// lib/box1-income.ts
// Bepaalt het bruto-jaarinkomen voor de Box 1-pagina.
//
// Twee bronnen, in volgorde:
//  1. Handmatig opgeslagen `profiles.box1_gross_income` (alleen Box 1) — wint.
//  2. Automatische schatting: het netto geschatte jaarinkomen van de
//     cashflow-pagina, via de Box 1-motor omgerekend naar bruto.
//
// De netto-bron is BEWUST exact dezelfde waarde als de "Geschat jaarinkomen"-
// kaart op /overzicht/cashflow (loadCashflowSettingsData): handmatig
// net_monthly_income × 12, anders het 12-maands geëxtrapoleerde transactie-
// inkomen. Zo zitten Box 1 en cashflow gegarandeerd op hetzelfde getal.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { grossFromNet, type Box1TaxYear } from '@/lib/box1-tax'

export interface Box1IncomeResolution {
  /** Bruto-jaarinkomen dat de pagina gebruikt (handmatig of schatting). */
  grossYearly: number
  /** Automatische bruto-schatting (cashflow-netto → bruto via de Box 1-motor). */
  estimateGross: number
  /** Het netto geschatte jaarinkomen uit de cashflow-pagina (de bron). */
  estimateNetYearly: number
  /** True wanneer `grossYearly` een handmatig opgeslagen waarde is. */
  isManual: boolean
}

/** Het netto geschatte jaarinkomen zoals de cashflow-"Geschat jaarinkomen"-kaart het toont. */
function cashflowNetYearly(data: {
  incomeSource: 'auto' | 'manual'
  netMonthlyIncome: number
  estimatedAnnualIncome: number
}): number {
  const net =
    data.incomeSource === 'manual' && data.netMonthlyIncome > 0
      ? data.netMonthlyIncome * 12
      : data.estimatedAnnualIncome
  return Math.max(0, Math.round(net))
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
  // Netto geschatte jaarinkomen uit de cashflow-bron (eigen inkomen).
  const cf = await loadCashflowSettingsData(supabase)
  const estimateNetYearly = cf ? cashflowNetYearly(cf) : 0
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
    isManual: manual != null,
  }
}
