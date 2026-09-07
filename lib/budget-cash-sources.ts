// lib/budget-cash-sources.ts
//
// Server-loader voor de rekeningkeuze op /overzicht/budget/instellingen (W-002):
// welke cash- en spaarrekeningen lopen mee in budgetteren?
//
// ── Waarom een loader en geen client-read ────────────────────────────────────
// ADR 0058: weergavedata komt server-side binnen en gaat als prop naar het
// client-component. De bestaande checkbox-lijst in de inrichtwizard
// (`components/app/app-setup/configs/budgetteren.config.tsx`) doet dit nog met
// een directe `.from('assets').select(...)` uit de browser-client; die staat op
// de grandfather-allowlist van `scripts/check-client-data-reads.mjs`. Nieuwe
// oppervlakken horen niet op die lijst — vandaar deze loader.
//
// ── Waarom een EXPLICIETE user_id-filter ─────────────────────────────────────
// De SELECT-policy op `assets` is HUISHOUD-GEDEELD. Zonder `.eq('user_id', …)`
// levert deze query dus ook de cash-rekeningen van de partner, en die zou de
// gebruiker hier kunnen aan- of uitzetten. De keuze "loopt mee in mijn budget"
// is persoonlijk; RLS doet die scoping hier níét.
//
// ── Waarom een expliciete kolomlijst ─────────────────────────────────────────
// `assets` draagt `*_encrypted` (ciphertext) en `*_hash` (blind index onder een
// server-only sleutel). `select('*')` zou dat materiaal — van de gebruiker én,
// zonder de filter hierboven, van de partner — via de RSC-payload naar de client
// serialiseren. Vier kolommen is alles wat dit scherm nodig heeft.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ASSET_SUBTYPE_LABELS } from '@/lib/asset-data'

/** Precies de kolommen die het instellingenscherm toont. Nooit `*`. */
export const BUDGET_CASH_SOURCE_COLUMNS = 'id, name, subtype, has_budget_tracking'

export interface BudgetCashSource {
  id: string
  name: string
  /** Gelabeld subtype ("Betaalrekening", "Spaarrekening", …) — nooit de rauwe waarde. */
  typeLabel: string
  /** Loopt deze rekening mee in budgetteren? (`assets.has_budget_tracking`) */
  tracked: boolean
}

/**
 * Het label bij een cash-subtype. Onbekend/leeg → "Rekening": het scherm hoeft
 * geen rauwe enum-waarde te tonen, en een lege regel leest als een fout.
 */
export function cashSubtypeLabel(subtype: string | null | undefined): string {
  if (!subtype) return 'Rekening'
  return ASSET_SUBTYPE_LABELS.cash?.[subtype] ?? 'Rekening'
}

/**
 * Alle ACTIEVE cash-bezittingen van de gebruiker zelf, met hun budget-vlag.
 *
 * Gesorteerd op naam en niet op saldo: dit scherm toont bewust géén bedragen
 * (een kaal significant bedrag zonder zijn vrijheidstijd-equivalent hoort
 * nergens in de app, en het saldo is voor deze keuze ook niet relevant), dus een
 * saldo-sortering zou een ordening zijn die de gebruiker niet kan zien.
 */
export async function loadBudgetCashSources(
  supabase: SupabaseClient,
  userId: string,
): Promise<BudgetCashSource[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(BUDGET_CASH_SOURCE_COLUMNS)
    .eq('user_id', userId)
    .eq('asset_type', 'cash')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !data) return []

  return (data as Array<{
    id: string
    name: string | null
    subtype: string | null
    has_budget_tracking: boolean | null
  }>).map((row) => ({
    id: row.id,
    name: row.name ?? 'Naamloze rekening',
    typeLabel: cashSubtypeLabel(row.subtype),
    tracked: row.has_budget_tracking === true,
  }))
}
