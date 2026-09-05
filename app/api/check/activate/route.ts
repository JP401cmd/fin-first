/**
 * POST /api/check/activate — conversie-overdracht van een Vrijheidscheck-lead
 * naar het zojuist aangemaakte account (ADR 0022).
 *
 * Least-privilege (bewust gesplitst):
 *   - de lead-rij wordt via de SERVICE-ROLE gelezen (RLS op lead_intakes is dicht);
 *   - het seeden gebeurt met de RLS-USER-client (de ingelogde gebruiker schrijft
 *     z'n eigen rijen, auth.uid() === userId).
 *
 * Idempotent + dataveilig: `seedPersonaData` doet eerst een delete-all, dus we
 * seeden uitsluitend in een nog leeg account. Een al-geconverteerde of niet-leeg
 * account wordt overgeslagen (geen wipe).
 */

import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { decryptField, blindIndex } from '@/lib/crypto/field-encryption'
import { seedPersonaData } from '@/lib/seed-persona'
import { intakeToPersona } from '@/lib/check/intake-to-persona'
import { withRondleidingPending } from '@/lib/rondleiding/seed'
import type { CheckIntake } from '@/lib/check/types'

export const runtime = 'nodejs'

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'Ongeldige aanvraag.')
  }
  const token =
    body && typeof body === 'object' && typeof (body as { token?: unknown }).token === 'string'
      ? (body as { token: string }).token
      : null
  if (!token) {
    return fail(400, 'Check-token ontbreekt.')
  }

  // Ingelogde gebruiker (RLS-scoped client).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return fail(401, 'Niet ingelogd.')
  }

  // Lead lezen via service-role (RLS dicht op lead_intakes).
  const service = getServiceClient()
  const { data: lead, error: leadErr } = await service
    .from('lead_intakes')
    .select('id, intake_encrypted, expires_at, converted_user_id, email_blind_index')
    .eq('token', token)
    .maybeSingle()
  if (leadErr) {
    return fail(500, 'Er ging iets mis bij het overzetten.')
  }
  if (!lead) {
    return fail(404, 'Deze check is niet (meer) gevonden.')
  }
  // E-mailbinding (IDOR-bescherming): het token is slechts een routerings-id. De
  // intake mag alléén worden overgezet naar een account met HETZELFDE e-mailadres
  // als waarmee de check is ingediend — anders kan een gelekt token (URL delen,
  // referrer) andermans financiële intake in een vreemd account seeden. Vergelijken
  // via de blind-index (genormaliseerd, hoofdletter-/spatie-tolerant).
  if (!user.email || blindIndex(user.email) !== lead.email_blind_index) {
    return fail(403, 'Deze check hoort niet bij dit account.')
  }
  if (lead.converted_user_id) {
    // Al geconverteerd — idempotent succes (geen tweede seed/wipe).
    return Response.json({ success: true, alreadyConverted: true })
  }
  if (lead.expires_at && new Date(lead.expires_at) < new Date()) {
    return fail(410, 'Deze check is verlopen.')
  }

  // Dataveiligheid: alleen seeden in een leeg account (seedPersonaData wist eerst
  // alles). Heeft het account al bezittingen, dan niet overschrijven.
  const { data: existingAssets } = await supabase
    .from('assets')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
  if (existingAssets && existingAssets.length > 0) {
    return Response.json({ success: true, skipped: 'account_not_empty' })
  }

  // Intake ontsleutelen + naar PersonaData mappen.
  let intake: CheckIntake
  try {
    const plain = decryptField(lead.intake_encrypted)
    if (!plain) {
      return fail(500, 'Je gegevens konden niet worden gelezen.')
    }
    intake = JSON.parse(plain) as CheckIntake
  } catch {
    return fail(500, 'Je gegevens konden niet worden gelezen.')
  }

  const persona = intakeToPersona(intake)
  const noop = () => {}
  await seedPersonaData(supabase, user.id, persona, noop)

  // Velden die niet in PersonaProfile zitten (zie intake-to-persona): handmatige
  // bronnen + jaarinkomen + onboarding markeren als klaar zodat het account
  // direct gevuld is.
  //
  // In dezelfde update gaat de rondleiding-vlag mee (ADR 0130): een via de
  // Vrijheidscheck geconverteerd account is net zo goed een verse gebruiker en
  // landt via /dashboard op zijn homescherm. `module_guide_state` wordt eerst
  // gelezen en gemerged — de map draagt ook `welcome:guide`, de coachmarks en
  // de coach-staat, en blind overschrijven zou die wissen. Faalt de lees, dan
  // blijft de kolom onaangeraakt (geen merge op een lege basis).
  const { data: guideStateRow, error: guideStateReadErr } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', user.id)
    .maybeSingle()
  if (guideStateReadErr) {
    console.warn('[check/activate] module_guide_state niet leesbaar — rondleiding-vlag overgeslagen', guideStateReadErr.code)
  }

  await supabase
    .from('profiles')
    .update({
      income_source: 'manual',
      expenses_source: 'manual',
      estimated_yearly_income: intake.yearlyIncomeGross ?? null,
      onboarding_completed: true,
      ...(guideStateReadErr
        ? {}
        : { module_guide_state: withRondleidingPending(guideStateRow?.module_guide_state) }),
    })
    .eq('id', user.id)

  // Lead markeren als geconverteerd (service-role). De seed is al gebeurd, dus we
  // laten de request niet falen als deze markering misgaat — maar we loggen 'm wél:
  // zonder converted_user_id zou de dedupe-/purge-invariant (één lead per e-mail,
  // 90-dagen-opruiming van niet-geconverteerde leads) stil scheef komen te staan.
  const { error: markErr } = await service
    .from('lead_intakes')
    .update({ converted_user_id: user.id, converted_at: new Date().toISOString() })
    .eq('id', lead.id)
  if (markErr) {
    console.error(
      `[check/activate] lead ${lead.id} geseed voor user ${user.id} maar markeren als geconverteerd faalde:`,
      markErr,
    )
  }

  return Response.json({ success: true })
}
