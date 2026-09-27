import { createClient } from '@/lib/supabase/server'
import { badRequest, errorResponse, serverError, unauthorized } from '@/lib/api/respond'
import { checkTierGate } from '@/lib/require-tier'
import { aiCreditLimitReached, aiSubscriptionRequired } from '@/lib/ai/gate-responses'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import { buildCalculator } from '@/lib/ai/build-calculator'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { StoredCalculatorDefinitionSchema } from '@/lib/calculator/types'
import { checkAndIncrement, getUsage, type UsageKind } from '@/lib/calculator/rate-limit'

const MAX_PROMPT_LENGTH = 500

/**
 * POST /api/ai/build-calculator
 *
 * Genereert een CalculatorDefinition uit een vrije gebruikersvraag via
 * Fin (generateObject). Optioneel `refineFrom` om een bestaande
 * definitie te verfijnen. Tier-gated op 'ai' (zelfde als chat). Bovendien
 * geldt een vlakke weeklimiet van 10 generaties + 5 verfijningen per
 * gebruiker — atomair gehandhaafd in de database
 * (`reserve_ai_calculator_slot`), doorgegeven via
 * `lib/calculator/rate-limit.ts`. Een mislukte generatie kost geen slot
 * (ADR 0181): de route leest vooraf alleen de stand en reserveert pas ná een
 * geslaagde generatie.
 *
 * Body: { prompt: string, refineFrom?: CalculatorDefinition }
 * Resp:
 *   200 { ok: true, definition }
 *   400 { error }                  — vraag leeg/te lang (ADR 0044-envelope)
 *   401 { error: 'Niet ingelogd' } — geen sessie
 *   403 { error, code }            — tier-gate (geen AI-abonnement) / privé-modus
 *   422 { error, code? }           — generatie-fout (gebruikerstekst uit buildCalculator)
 *   429 { error, code }            — weeklimiet of maand-creditbudget bereikt
 *   500 { error }                  — stand of reservering niet vast te stellen
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de weeklimiet en élke dataophaling.
  // Staat 'rapporten' op lokaal, dan bouwt de browser de rekenhulp zelf (een
  // eenvoudiger scenario) en hoort deze route niets te leveren.
  // Waarom in deze volgorde: (1) privé-modus is de meest fundamentele keuze van
  // de gebruiker en gaat vóór commerciële gating — anders krijgt iemand een
  // tier-fout die de echte reden maskeert; (2) een geblokkeerde call mag niets
  // kosten — geen LLM-aanroep en geen slot uit de weeklimiet; (3) er mag geen
  // gebruikersinput richting promptopbouw gaan — de model-call zit niet in deze
  // route maar in buildCalculator (lib/ai/build-calculator.ts), dat de vraag én
  // een eventuele refineFrom-definitie in de prompt zet. Nooit een stille
  // terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'rapporten')
  if (privacyGate) return privacyGate

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) return aiSubscriptionRequired()

  // Kostenrem naast de weeklimiet (security-gate 0.92.12): sinds ADR 0181 kost
  // een mislukte generatie geen weekslot meer, dus moet elke LLM-poging wél
  // tegen het gedeelde maand-creditbudget tellen — anders is een prompt die
  // structureel faalt een onbegrensde kostenpost. Boeken gebeurt ná de aanroep,
  // ook bij falen (zie recordAiUsage hieronder).
  const creditGate = await checkCreditBudget(supabase, user.id, 'report')
  if (!creditGate.allowed) {
    return aiCreditLimitReached(creditLimitMessage(creditGate), creditGate.retryAfterSeconds)
  }

  let body: { prompt?: unknown; refineFrom?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest('Ongeldige request-body.')
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) return badRequest('Geef een vraag op.')
  // Cap prompt-lengte. We meten op de ongetrimde lengte (consistent met
  // wat de UI in een textarea telt).
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return badRequest(`Vraag is te lang (max ${MAX_PROMPT_LENGTH} tekens).`)
  }

  // Valideer een eventuele refineFrom-definitie zodat we geen rommel
  // doorgeven aan de LLM-prompt. Soepelere caps zodat verfijning van
  // oude calculators (pre-MVP-limieten) niet stilzwijgend wordt geweigerd
  // — de AI-output wordt alsnog gecapd op de strikte limieten.
  let refineFrom = undefined
  if (body.refineFrom != null) {
    const parsed = StoredCalculatorDefinitionSchema.safeParse(body.refineFrom)
    if (parsed.success) refineFrom = parsed.data
  }
  const kind: UsageKind = refineFrom ? 'refinement' : 'generation'

  // Weeklimiet in twee stappen rond de dure call (ADR 0181, eigenaarsbesluit
  // R6): een mislukte generatie telt NIET mee.
  //
  // Stap 1 — vooraf alleen LEZEN (geen tik): wie al aan zijn limiet zit krijgt
  // een 429 zónder dat er een LLM-aanroep vertrekt. Dit is een pure lezing via
  // dezelfde weekgrens en plafonds als de reservering (`ai_calculator_week_usage`).
  const usage = await getUsage(supabase)
  if (usage.error) {
    // Stand onbekend = niet genereren. Een 429 zou hier liegen en een 200 zou
    // de rem gratis omzeilbaar maken voor wie de database weet te laten hikken.
    return serverError(usage.error, 'build-calculator:POST')
  }
  const used = kind === 'refinement' ? usage.refinements : usage.generations
  const limit = kind === 'refinement' ? usage.maxRefinements : usage.maxGenerations
  if (used >= limit) return weekLimitReached(kind, limit)

  const result = await buildCalculator(supabase, prompt, refineFrom, { userId: user.id })
  // Elke poging kost credits, geslaagd of niet: het weekslot is gratis bij
  // falen (ADR 0181), het creditbudget niet.
  await recordAiUsage(supabase, user.id, 'report')
  if (!result.ok) {
    // De gebruikerstekst komt uit buildCalculator en is daar al client-veilig
    // gemaakt (nooit err.message; provider-/config-details alleen in het
    // serverlog). Hier alleen de grep-bare tag, zodat een generatiefout ook
    // zonder exception (bv. onbekende formule-namen na een retry) zichtbaar is.
    console.warn(`[build-calculator:POST] generatie mislukt (${kind}, code=${result.code ?? 'geen'}): ${result.error}`)
    return errorResponse(result.error, 422, result.code)
  }

  // Stap 2 — pas nu de tik, atomair in de database (ADR 0076). De reservering
  // blijft de enige die de limiet hard maakt: tussen stap 1 en hier past een
  // tweede verzoek van dezelfde gebruiker (twee generaties op 9 van 10), en
  // dan weigert de database de tweede. Die uitkomst nemen we onveranderd over
  // — de definitie wordt dan NIET uitgeleverd, ook al is hij gegenereerd. Dat
  // kost ons in dat zeldzame geval één LLM-aanroep; de rem zelf blijft
  // onaantastbaar. Deze route velt géén eigen oordeel: ze vergelijkt niets
  // met een limiet en schrijft de teller nergens.
  const rate = await checkAndIncrement(supabase, kind)
  if (rate.error) {
    // Geen geldige reservering = niet uitleveren, om dezelfde reden als bij
    // stap 1. De generatie is dan verloren; dat is de fail-closed kant.
    return serverError(rate.error, 'build-calculator:POST')
  }
  if (!rate.allowed) return weekLimitReached(kind, rate.limit)

  return Response.json({ ok: true, definition: result.definition })
}

/** 429 met de limiet uit het databaseantwoord — nooit uit een TypeScript-constante. */
function weekLimitReached(kind: UsageKind, limit: number) {
  const usedLabel = kind === 'refinement' ? 'verfijningen' : 'generaties'
  return errorResponse(
    `Je hebt je weeklimiet voor ${usedLabel} bereikt (${limit} van ${limit}). Resets maandag.`,
    429,
    'week_limit',
  )
}
