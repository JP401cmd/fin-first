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
 *
 * ## Waarom elke UPDATE hier een `.select()` heeft
 *
 * Deze acties draaien op de anon RLS-client mét de sessie van de beheerder —
 * de `isSuperAdmin()`-check hierboven is een applicatiecontrole, geen
 * databaserecht. Tot migratie `20260903110000` bestond er helemaal geen
 * UPDATE-policy op `calculator_reports`, en was die op `custom_calculators`
 * strikt eigen-rij. Beide updates raakten dus 0 rijen op andermans content —
 * en een Supabase-`.update()` die 0 rijen raakt geeft `error: null`. De actie
 * meldde daardoor succes terwijl er niets gebeurde, en de lijst ververste
 * netjes naar dezelfde inhoud.
 *
 * De `.select('id')` maakt het aantal geraakte rijen zichtbaar, zodat een
 * ontbrekend of ingetrokken databaserecht een ZICHTBARE fout wordt in plaats
 * van een stille no-op. Zelfde redenering als stap 5 in
 * `app/api/assets/[id]/route.ts`. Haal deze `.select()`s dus niet weg als
 * "overbodig" omdat de policies er nu zijn — ze zijn juist het vangnet voor
 * de dag dat dat niet meer klopt.
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

  const { data, error } = await supabase
    .from('calculator_reports')
    .update({ status: 'reviewed' })
    .eq('id', reportId)
    .eq('status', 'open')
    .select('id')

  if (error) {
    return { ok: false, error: error.message }
  }
  // 0 rijen = de melding bestond niet meer, stond al op 'reviewed', of het
  // UPDATE-recht ontbreekt. Bewust géén succes: zie de docblock.
  if (!data || data.length === 0) {
    return { ok: false, error: 'Melding niet gevonden of al beoordeeld.' }
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

  // Stap 1: verberg de calculator. De `.select()` is hier de belangrijkste van
  // de twee: dit is de stap die de rekenhulp daadwerkelijk uit de bibliotheek
  // haalt. Zonder harde bevestiging zou een ontbrekend recht betekenen dat de
  // gemelde rekenhulp gewoon publiek blijft staan terwijl de melding als
  // afgehandeld verdwijnt.
  const { data: hidden, error: calcErr } = await supabase
    .from('custom_calculators')
    .update({ is_public: false, published_at: null })
    .eq('id', calculatorId)
    .select('id')

  if (calcErr) {
    return { ok: false, error: calcErr.message }
  }
  if (!hidden || hidden.length === 0) {
    return { ok: false, error: 'Rekenhulp niet gevonden of niet te verbergen.' }
  }

  // Stap 2: markeer alle open meldingen op deze calculator als beoordeeld.
  // (Inclusief de oorspronkelijke `reportId` — die zit in dezelfde set.)
  //
  // Hier is 0 rijen géén fout: stap 1 is geslaagd, dus de rekenhulp staat niet
  // meer publiek. Dat er geen open melding meer over was (parallelle beheerder,
  // dubbele submit) verandert die uitkomst niet.
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
