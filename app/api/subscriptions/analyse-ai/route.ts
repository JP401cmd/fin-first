import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { detectRecurringTransactions, CATEGORY_LABELS } from '@/lib/recurring-detection'
import { VASTE_KOSTEN_ANALYSE_PROMPT } from '@/lib/ai/dna/wil'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { unauthorized, badRequest, errorResponse } from '@/lib/api/respond'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import type { VasteKostenCandidate } from '@/lib/ai/local/local-vaste-kosten-resolver'
import { isRefusedProviderError } from '@/lib/ai/provider-error'
import { AI_ERROR_CODE, describeAiError } from '@/lib/ai/error-copy'

/** Maximum number of candidates to send to the AI model to avoid token waste. */
const MAX_AI_CANDIDATES = 50

/**
 * Kandidaat-cap voor het LOKALE pad (`candidatesOnly`). Bewust lager dan
 * MAX_AI_CANDIDATES: on-device draait het model op ~9-12 tok/s, dus elke extra
 * kandidaat is echte wachttijd voor de gebruiker in plaats van tokenkosten.
 *
 * SPIEGEL van `LOCAL_VASTE_KOSTEN_CANDIDATE_CAP` in
 * lib/ai/local/local-vaste-kosten-resolver.ts — bewust gespiegeld en niet
 * geïmporteerd: die module hangt aan de LiteRT/WebGPU-runtime en hoort niet in
 * de serverbundel. `local-vaste-kosten-resolver.test.ts` pint dat de twee
 * getallen gelijk blijven.
 */
const MAX_LOCAL_AI_CANDIDATES = 30

/**
 * Body van POST /api/subscriptions/analyse-ai. Beide velden optioneel: de
 * cloud-aanroep stuurt (historisch) helemaal geen body.
 */
const AnalyseBodySchema = z.object({
  /**
   * Alleen de gedetecteerde kandidaten teruggeven en stoppen vóór `getModel` —
   * de databron voor de ON-DEVICE analyse.
   */
  candidatesOnly: z.boolean().optional(),
})

/**
 * POST /api/subscriptions/analyse-ai
 *
 * Analyzes all detected recurring expense patterns using AI and classifies each as:
 * - 'subscription' (abonnement): streaming, apps, memberships, donations, phone plans
 * - 'vaste_kosten' (fixed cost): rent, mortgage, energy, insurance, taxes, childcare, loans
 * - 'skip' (not a fixed cost): groceries, fuel, restaurants, variable shopping
 *
 * Returns suggestions for the user to review and confirm.
 *
 * TWEE MODI. Deze route deed ophalen ÉN classificeren in één handeling, waardoor
 * de deterministisch voorgekauwde kandidatenlijst onbereikbaar was zonder een
 * cloud-modelcall. Met `{ candidatesOnly: true }` stopt hij vóór `getModel` en
 * geeft hij alleen die lijst terug; de browser classificeert dan zelf on-device
 * (lib/ai/local/local-vaste-kosten-resolver.ts). Bewust deze kleine ingreep en
 * geen aparte hydratie-route naast app/api/local-chat-overview: de hele
 * voorbewerking (12 maanden transacties, detectie, confidence-filter,
 * al-bevestigd-filter, `toMonthly`) is precies dezelfde en zou daar regel voor
 * regel gedupliceerd moeten worden — twee kandidatenlijsten die uit elkaar
 * kunnen lopen is een duurdere prijs dan één extra vlag.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return unauthorized()
    }

    // Body is optioneel (de cloud-aanroep stuurt er historisch geen), dus geen
    // parseBody: die geeft een 400 op een lege body. Een ontbrekende/onleesbare
    // body betekent hier "gewoon de cloud-analyse", het bestaande gedrag.
    const rawBody: unknown = await req.json().catch(() => ({}))
    const parsedBody = AnalyseBodySchema.safeParse(rawBody ?? {})
    if (!parsedBody.success) return badRequest('Ongeldige invoer')
    const candidatesOnly = parsedBody.data.candidatesOnly === true

    // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
    // Staat 'transacties' op lokaal, dan classificeert de browser de terugkerende
    // betalingen zelf en hoort deze route niets te leveren.
    // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
    // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
    // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
    // credits kosten; (3) er mag geen enkele transactie richting promptopbouw gaan.
    // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
    //
    // UITZONDERING `candidatesOnly` — zelfde redenering als
    // app/api/local-chat-overview: dit ÍS de lokale databron. Er is geen
    // `getModel`-call en geen egress; de kandidatenlijst gaat van de server naar
    // de éigen browser van de gebruiker, precies zoals elke /overzicht-pagina dat
    // doet. De gate op die tak zetten zou de lokale modus blokkeren met als reden
    // "je hebt de lokale modus aan" — de belofte breken die hij moet beschermen.
    // De gate blijft onverkort staan vóór de modelcall hieronder, en het
    // `candidatesOnly`-antwoord kan die modelcall niet bereiken (harde return).
    if (!candidatesOnly) {
      const privacyGate = await assertCloudAllowed(supabase, user.id, 'transacties')
      if (privacyGate) return privacyGate
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return NextResponse.json({ error: tierGate.error }, { status: 403 })
    }

    const now = new Date()
    const startDateStr = localMonthStartMonthsAgo(now, 11)

    const [txResult, recurringResult, budgetResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, amount, description, counterparty_name, is_income, budget_id, transaction_type')
        .gte('date', startDateStr)
        .order('date', { ascending: true }),
      supabase
        .from('recurring_transactions')
        .select('id, counterparty_name, amount, name, frequency')
        .eq('is_active', true),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])

    const transactions = txResult.data ?? []
    const existingRecurrings = recurringResult.data ?? []
    const budgets = budgetResult.data ?? []

    function toMonthly(amount: number, frequency: string): number {
      const abs = Math.abs(amount)
      switch (frequency) {
        case 'weekly': return (abs * 52) / 12
        case 'quarterly': return abs / 3
        case 'yearly': return abs / 12
        default: return abs
      }
    }

    if (transactions.length < 3) {
      // `candidates: []` staat er voor het lokale pad bij: beide modi krijgen zo
      // dezelfde "niets gevonden"-vorm terug en de client hoeft niet te raden.
      return NextResponse.json({
        suggestions: [],
        candidates: [],
        analysedCount: 0,
        skippedCount: 0,
      })
    }

    // Run detection on ALL categories — pre-filter to expenses only
    const allDetected = detectRecurringTransactions(
      transactions
        .filter(t => !(t.is_income ?? false))
        .map(t => ({
          id: t.id,
          date: t.date,
          amount: Number(t.amount),
          description: t.description ?? '',
          counterparty_name: t.counterparty_name ?? null,
          is_income: false,
          budget_id: t.budget_id ?? null,
          transaction_type: t.transaction_type ?? null,
        })),
      existingRecurrings,
      budgets,
    )

    // Filter: medium+ confidence, not already confirmed, expenses only
    const confirmedKeys = new Set(
      existingRecurrings.flatMap(r => [
        (r.counterparty_name ?? '').toLowerCase().trim(),
        (r.name ?? '').toLowerCase().trim(),
      ].filter(Boolean))
    )
    const candidates = allDetected.filter(
      d =>
        d.confidence !== 'low' &&
        !d.alreadyExists &&
        !confirmedKeys.has((d.counterpartyName ?? '').toLowerCase().trim()),
    )

    if (candidates.length === 0) {
      // `candidates: []` staat er voor het lokale pad bij: beide modi krijgen zo
      // dezelfde "niets gevonden"-vorm terug en de client hoeft niet te raden.
      return NextResponse.json({
        suggestions: [],
        candidates: [],
        analysedCount: 0,
        skippedCount: 0,
      })
    }

    // Cap candidates to avoid excessive token usage (cloud) resp. wachttijd (lokaal)
    const cappedCandidates = candidates.slice(
      0,
      candidatesOnly ? MAX_LOCAL_AI_CANDIDATES : MAX_AI_CANDIDATES,
    )

    // ── Lokaal datapad: stop hier, vóór getModel ────────────────────────────────
    // Alles hierboven is deterministisch (detectie, filters, `toMonthly`) en
    // bevat geen model-uitkomst. Vanaf hier begint de cloud-AI; het lokale pad
    // heeft alleen de kandidaten nodig en classificeert zelf on-device.
    //
    // GEEN `sanitizeForAI` op deze tak, en dat is bewust géén vergeten guardrail:
    // saniteren beschermt tegen egress naar een AI-leverancier, en die is hier
    // per definitie afwezig — deze lijst gaat naar de eigen browser van de
    // gebruiker, over dezelfde geauthenticeerde verbinding als elke andere
    // pagina. De handelsnaam van de tegenpartij ongemoeid laten is bovendien
    // precies wat de on-device classificatie bruikbaar maakt (ADR 0043 §5).
    if (candidatesOnly) {
      const localCandidates: VasteKostenCandidate[] = cappedCandidates.map((d) => ({
        id: d.key,
        name: d.counterpartyName || d.commonDescription,
        monthlyAmount: toMonthly(d.averageAmount, d.frequency),
        averageAmount: Math.abs(d.averageAmount),
        frequency: d.frequency,
        occurrences: d.occurrences,
        autoCategory: d.suggestedCategory,
        autoCategoryLabel: CATEGORY_LABELS[d.suggestedCategory],
        confidence: d.confidence,
      }))
      return NextResponse.json({ candidates: localCandidates })
    }

    // Prepare AI model
    let model
    try {
      model = await getModel(supabase, 'abonnementen_analyse')
    } catch (err) {
      if (err instanceof AIConfigError) {
        // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
        return NextResponse.json({ error: err.message }, { status: 422 })
      }
      return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
    }

    // Sanitize counterparty/description names before they reach the AI provider
    // (chat/categorize contract): own name + generic PII stripped, merchant
    // names kept (needed for classification; business identifier, not PII).
    const { data: sanitizeProfile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()
    const sanitizeOpts: SanitizeOptions = {}
    if (sanitizeProfile?.full_name) sanitizeOpts.names = [sanitizeProfile.full_name]
    if (sanitizeProfile?.date_of_birth) sanitizeOpts.dateOfBirth = sanitizeProfile.date_of_birth

    // Build the pattern list with auto-detected category as context for the AI
    const patternList = cappedCandidates
      .map((d, i) => {
        const name = sanitizeForAI(d.counterpartyName || d.commonDescription, sanitizeOpts)
        const categoryLabel = CATEGORY_LABELS[d.suggestedCategory]
        return `${i}: ${name} | ${d.frequency} | €${Math.abs(d.averageAmount).toFixed(2)}/keer | ${d.occurrences}x gezien | auto-categorie: ${categoryLabel}`
      })
      .join('\n')

    const responseSchema = z.object({
      classifications: z.array(z.object({
        index: z.number().describe('Index uit de lijst'),
        classification: z.enum(['subscription', 'vaste_kosten', 'skip']).describe(
          'subscription = abonnement (streaming, apps, lidmaatschap, donatie, telefoon), vaste_kosten = vaste kosten (huur, hypotheek, energie, verzekering, belasting, kinderopvang, lening), skip = geen vaste kost'
        ),
        reason: z.string().describe('Korte reden voor de classificatie in het Nederlands'),
      })),
    })

    const systemPrompt = VASTE_KOSTEN_ANALYSE_PROMPT

    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: systemPrompt,
      prompt: `Classificeer elk van deze terugkerende betalingen als subscription, vaste_kosten of skip:\n\n${patternList}`,
      maxRetries: 1,
    })

    // Build a lookup from AI classifications by index
    const classificationMap = new Map<number, { classification: 'subscription' | 'vaste_kosten' | 'skip'; reason: string }>()
    for (const c of object.classifications) {
      if (c.index >= 0 && c.index < cappedCandidates.length) {
        classificationMap.set(c.index, { classification: c.classification, reason: c.reason })
      }
    }

    // Build suggestion list — include all classified items (including skipped, for transparency)
    const suggestions = cappedCandidates.map((d, i) => {
      const ai = classificationMap.get(i)
      return {
        id: d.key,
        name: d.counterpartyName || d.commonDescription,
        monthlyAmount: toMonthly(d.averageAmount, d.frequency),
        frequency: d.frequency,
        occurrences: d.occurrences,
        autoCategory: d.suggestedCategory,
        autoCategoryLabel: CATEGORY_LABELS[d.suggestedCategory],
        aiClassification: ai?.classification ?? 'skip' as const,
        aiReason: ai?.reason ?? 'Geen classificatie ontvangen van AI',
        confidence: d.confidence,
      }
    })

    // Non-skipped items are the actionable suggestions; skipped items are counted separately
    const skippedCount = suggestions.filter(s => s.aiClassification === 'skip').length

    return NextResponse.json({
      suggestions,
      analysedCount: suggestions.length,
      skippedCount,
    })
  } catch (err) {
    console.error('[/api/subscriptions/analyse-ai]', err)
    // Structureel (provider weigert) vs. tijdelijk — gedrag bij een tijdelijke
    // hapering blijft ongewijzigd (UR3-09). classifyProviderError herkent
    // alleen echte providerfouten (APICallError/LoadAPIKeyError); elke andere
    // oorzaak (DB, parsing) blijft op de bestaande generieke tekst.
    if (isRefusedProviderError(err)) {
      const copy = describeAiError(AI_ERROR_CODE.providerRefused)
      return errorResponse(copy.text, 422, copy.code)
    }
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
