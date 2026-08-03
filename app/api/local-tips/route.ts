import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { checkTierGate } from '@/lib/require-tier'
import {
  buildLocalTipCandidates,
  tipGenerationId,
  tipTypeForSource,
  type LocalTipCandidate,
} from '@/lib/ai/local/local-tips-context'
import { distributeFreedomDays } from '@/lib/ai/local/parse-tip'

/**
 * Opslag-route voor tips die ON-DEVICE gemaakt zijn (Golden Nuggets, lokaal pad).
 *
 * WAAROM DEZE ROUTE BESTAAT: het lokale pad genereert wél, maar schrijft niet —
 * de browser mag niet direct in `recommendations` schrijven (datapad-conventie,
 * ADR 0058: muteren gaat via een API-route). Deze route is de schrijfkant, en
 * bewust NIETS meer: hij roept géén `getModel` aan, doet géén AI-call en heeft
 * dus geen kill-switch/privacy-gate op modelniveau nodig. Hij verschijnt daarom
 * ook niet in de privacy-gate-scan (die verzamelt `getModel`-consumenten).
 *
 * GEMODELLEERD OP `app/api/ai/actions/route.ts`: zod-body via `parseBody`, RLS
 * (own-row, anon-client, nooit service-role) en idempotentie-dedupe zodat twee
 * keer dezelfde kans nooit twee kaarten oplevert.
 *
 * ── HET HART: DE CLIENT LEVERT ALLEEN TAAL ──────────────────────────────────
 * De body bevat per tip UITSLUITEND `candidateId`, `title`, `description` en
 * `actions[]`. Er staat geen enkel bedrag in. Deze route bouwt de kandidatenlijst
 * server-side OPNIEUW op (`buildLocalTipCandidates` — dezelfde canonieke motoren
 * als de hydratie-route) en haalt élk cijfer daaruit: euro-impact, vrijheidsdagen,
 * `recommendation_type`, `related_budget_slug` en `priority_score`. Een client die
 * andere getallen zou willen opslaan heeft er domweg geen veld voor.
 *
 * FAIL-CLOSED: een `candidateId` die niet (meer) in de canonieke lijst voorkomt
 * wordt overgeslagen — geen kaart. Dat spiegelt `resolveFinActionIntent`, waar een
 * titel zonder canonieke match ook geen kaart oplevert.
 *
 * COMPLIANCE BLIJFT SERVER-SIDE: de vrijheidsdagen-regel (alleen bij een
 * essentieel budget én `retirement_expense_method = 'essential_budgets'`) zit in
 * `resolveTipFreedomDays` en is al toegepast op `candidate.vrijheidsdagen`; de
 * 1-5-klem op `priority_score` blijft hier staan, gelijk aan de cloudroute.
 *
 * NIET VAN TOEPASSING: `maskPIIInOutput` — er is geen egress geweest. De tekst is
 * op het eigen toestel van de gebruiker gemaakt uit diens eigen gegevens en gaat
 * naar diens eigen rij (ADR 0043 §5). Ook `checkCreditBudget` vervalt: er is geen
 * betaalde model-call om te budgetteren.
 */
const localTipsSchema = z.object({
  tips: z
    .array(
      z.object({
        /** Stabiele kandidaat-id; de sleutel waarmee de server de cijfers her-afleidt. */
        candidateId: z.string().min(1, 'candidateId is verplicht'),
        title: z.string().min(1, 'title is verplicht').max(120),
        description: z.string().min(1, 'description is verplicht').max(400),
        actions: z.array(z.string().min(1).max(120)).max(3).default([]),
      }),
    )
    .min(1, 'tips mag niet leeg zijn')
    // Ruim boven MAX_TIP_CANDIDATES (5): een bovengrens is er om een absurde body
    // te weren, niet om het normale pad te knijpen.
    .max(10),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // Kill-switch: per-gebruiker AI-toggle (/mijn/privacy). Staat AI uit, dan hoort
  // er ook geen AI-uitkomst meer opgeslagen te worden.
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', user.id)
    .single()
  if (profile?.ai_enabled === false) {
    return forbidden('AI-features staan uit')
  }

  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) return forbidden(gate.error)

  const parsed = await parseBody(localTipsSchema, req)
  if (!parsed.ok) return parsed.response

  let canonical: Map<string, LocalTipCandidate>
  try {
    const { candidates } = await buildLocalTipCandidates(supabase)
    canonical = new Map(candidates.map((c) => [c.id, c]))
  } catch (err) {
    return serverError(err, 'local-tips:POST-candidates')
  }

  const inserted: unknown[] = []
  let overgeslagen = 0

  for (const tip of parsed.data.tips) {
    const candidate = canonical.get(tip.candidateId)
    // FAIL-CLOSED: onbekende kans → geen kaart. Dit is óók de normale uitkomst
    // wanneer de gebruiker tussendoor iets veranderde (budget aangepast, actie
    // aangemaakt) waardoor de kans uit de canonieke lijst verdween.
    if (!candidate) {
      overgeslagen++
      continue
    }

    const generationId = tipGenerationId(candidate.id)

    // Idempotentie (spiegelt de aandachtspunt-dedupe in /api/ai/actions): bestaat
    // er al een openstaande aanbeveling voor precies deze kans, hergebruik die
    // i.p.v. te dupliceren. Dubbel indrukken of een herhaalde POST na een
    // netwerkhapering levert zo nooit twee kaarten op.
    const { data: existing } = await supabase
      .from('recommendations')
      .select()
      .eq('user_id', user.id)
      .eq('ai_generation_id', generationId)
      .in('status', ['pending', 'postponed'])
      .limit(1)
      .maybeSingle()
    if (existing) {
      inserted.push(existing)
      continue
    }

    // ELK CIJFER UIT DE KANDIDAAT — nooit uit de body. `vrijheidsdagen` is al door
    // de compliance-regel gehaald (0 zodra die niet geldt); `type` is deterministisch
    // uit de bron afgeleid, niet door het model gekozen.
    const freedomDays = candidate.vrijheidsdagen
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: user.id,
        title: tip.title,
        description: tip.description,
        recommendation_type: tipTypeForSource(candidate.bron),
        euro_impact_monthly: candidate.euroImpactMonthly,
        euro_impact_yearly: candidate.besparingPerJaar,
        freedom_days_per_year: freedomDays,
        related_budget_slug: candidate.budgetSlug,
        priority_score: Math.max(1, Math.min(5, Math.round(candidate.priority))),
        suggested_actions: distributeFreedomDays(
          tip.actions.length > 0 ? tip.actions : [tip.title],
          freedomDays,
        ),
        ai_generation_id: generationId,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      // Eén mislukte insert mag de rest van de ronde niet slopen — de gebruiker
      // heeft er al een minuut rekenwerk in zitten. Alleen code + message loggen:
      // `error.details` echoot bij een CHECK-schending de falende rij, en die
      // draagt financiële tekst.
      console.error('[local-tips] opslaan van tip mislukt:', error.code, error.message)
      overgeslagen++
      continue
    }

    inserted.push(data)
  }

  return Response.json({ recommendations: inserted, overgeslagen })
}
