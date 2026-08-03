import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden, errorResponse } from '@/lib/api/respond'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'

// ── Validation Schema ──────────────────────────────────────────────

const bodySchema = z.object({
  text: z.string().min(1).max(500),
  age: z.number().int().min(18).max(120).optional(),
  householdType: z.string().optional(),
  monthlyIncome: z.number().positive().optional(),
  monthlyExpenses: z.number().positive().optional(),
})

// ── POST — Run extraction for onboarding review ────────────────────
// Authenticated (not admin-only) so the onboarding flow can call it
// before saving. Returns structured extraction results for user review.

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'documenten' op lokaal, dan leest de browser de vrije tekst over de
  // eigen financiële situatie zelf uit en hoort deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits kosten; (3) er mag geen letter van die tekst richting promptopbouw
  // gaan — dit is iemands inkomen, schulden en spaargeld in eigen woorden.
  // De model-call zit hier niet in de route maar in extractFinancialData
  // (lib/ai/extract-financial-data.ts); de gate hoort dus vóór die aanroep.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'documenten')
  if (privacyGate) return privacyGate

  // TIER-GATE — het comment hierboven beloofde 'm al ("vóór de tier-gate, de
  // credit-gate"), maar hij stond er niet. Deze route bereikt het model
  // INDIRECT, via extractFinancialData → getModel(); precies daarom viel hij
  // buiten elke scan die op `getModel` in de route zelf zoekt. Zonder abonnement
  // kon iedere ingelogde gebruiker hier een externe LLM aanroepen op onze
  // rekening. Spiegel van de zuster-route onboarding/aangifte-extract.
  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) return forbidden(tierGate.error)

  // CREDIT-GATE — direct ná de tier-gate en vóór getModel(), zoals
  // lib/ai/credit-gate.ts voorschrijft. Sleutel 'extraction' (kosten 2): dit is
  // dezelfde handeling als de aangifte- en pensioen-extractie, uit dezelfde
  // gedeelde maandbucket.
  const creditGate = await checkCreditBudget(supabase, user.id, 'extraction')
  if (!creditGate.allowed) {
    const res = errorResponse(creditLimitMessage(creditGate), 429)
    res.headers.set('Retry-After', String(creditGate.retryAfterSeconds))
    return res
  }

  const raw = await req.json()
  const parsed = bodySchema.safeParse(raw)

  if (!parsed.success) {
    return Response.json({ error: 'Ongeldige invoer' }, { status: 400 })
  }

  try {
    const result = await extractFinancialData(supabase, parsed.data.text, {
      age: parsed.data.age,
      householdType: parsed.data.householdType,
      monthlyIncome: parsed.data.monthlyIncome,
      monthlyExpenses: parsed.data.monthlyExpenses,
    })

    // Registreren ná een geslaagde call, in dezelfde bucket die de gate leest.
    // Bij een fout tellen we niets: de gebruiker kreeg geen resultaat.
    await recordAiUsage(supabase, user.id, 'extraction')
    return Response.json(result)
  } catch (err) {
    console.error('[onboarding/extract] Extraction error:', err)
    return Response.json({ error: 'Extractie mislukt' }, { status: 500 })
  }
}
