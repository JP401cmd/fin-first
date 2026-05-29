'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

/**
 * Server-actions voor de calculator-reports admin-inbox.
 *
 * Beide acties zijn idempotent en defensief: ze halen eerst de admin-
 * check op, daarna een gerichte UPDATE met expliciete eigenaar-/status-
 * filters. Bij elke geslaagde mutatie revalidaten we de admin-pagina
 * zodat de lijst direct ververst.
 *
 * Reden voor server-actions (i.p.v. een nieuwe REST-route): de UI is
 * tightly-coupled aan deze pagina; er is geen externe consument. Een
 * losse `/api/admin/calculator-reports/[id]`-route zou meer ceremonie
 * geven zonder een breder hergebruik.
 */

const REPORTS_PATH = '/beheer/calculator-reports'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Markeer een melding als 'reviewed'. Geen wijziging aan de calculator
 * zelf — alleen aan de melding. Gebruikt na een handmatige check waarbij
 * de admin concludeert dat de melding niet leidt tot een ingreep.
 */
export async function markReviewedAction(reportId: string): Promise<ActionResult> {
  if (!reportId || typeof reportId !== 'string') {
    return { ok: false, error: 'reportId ontbreekt.' }
  }

  const supabase = await createClient()
  const admin = await isSuperAdmin(supabase)
  if (!admin) {
    return { ok: false, error: 'Geen rechten.' }
  }

  const { error } = await supabase
    .from('calculator_reports')
    .update({ status: 'reviewed' })
    .eq('id', reportId)
    .eq('status', 'open')

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(REPORTS_PATH)
  return { ok: true }
}

/**
 * Verberg de calculator én markeer de melding als beoordeeld in één
 * geheel. We doen geen DELETE — de rij blijft staan zodat bestaande
 * forks (duplicates) hun FK behouden; alleen `is_public` gaat naar
 * `false`. Tegelijk zetten we `published_at` op NULL zodat een latere
 * 're-publish' een verse datum krijgt.
 *
 * NB: deze actie zet *alle* open meldingen op deze calculator op
 * 'reviewed' — niet alleen de aanleiding-melding — want zodra de
 * calculator verborgen is, zijn de andere openstaande meldingen
 * daarop dubbel werk.
 */
export async function hideCalculatorAction(
  reportId: string,
  calculatorId: string,
): Promise<ActionResult> {
  if (!reportId || typeof reportId !== 'string') {
    return { ok: false, error: 'reportId ontbreekt.' }
  }
  if (!calculatorId || typeof calculatorId !== 'string') {
    return { ok: false, error: 'calculatorId ontbreekt.' }
  }

  const supabase = await createClient()
  const admin = await isSuperAdmin(supabase)
  if (!admin) {
    return { ok: false, error: 'Geen rechten.' }
  }

  // Stap 1: verberg de calculator.
  const { error: calcErr } = await supabase
    .from('custom_calculators')
    .update({ is_public: false, published_at: null })
    .eq('id', calculatorId)

  if (calcErr) {
    return { ok: false, error: calcErr.message }
  }

  // Stap 2: markeer alle open meldingen op deze calculator als beoordeeld.
  // (Inclusief de oorspronkelijke `reportId` — die zit in dezelfde set.)
  const { error: reportErr } = await supabase
    .from('calculator_reports')
    .update({ status: 'reviewed' })
    .eq('calculator_id', calculatorId)
    .eq('status', 'open')

  if (reportErr) {
    return { ok: false, error: reportErr.message }
  }

  revalidatePath(REPORTS_PATH)
  return { ok: true }
}
