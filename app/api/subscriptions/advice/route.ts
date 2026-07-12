import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'

const TEMPORAL_HINTS: Record<number, string> = {
  1: 'De gebruiker is een Levensgenieter (level 1). Wees zacht — adviseer alleen eliminatie bij echte overlappen, niet bij comfortdiensten.',
  2: 'De gebruiker is een Reiziger (level 2). Wees mild — stel consolidatie voor bij duidelijke duplicaten, maar respecteer ervaringsdiensten.',
  3: 'De gebruiker is een Architect (level 3). Gebalanceerd advies — stel consolidatie voor bij 2+ diensten in dezelfde categorie.',
  4: 'De gebruiker is een Stoïcijn (level 4). Wees streng — alles wat overlap vertoont of weinig waarde heeft moet weg. Bereken vrijheidsdagen-winst expliciet.',
  5: 'De gebruiker is een Essentialist (level 5). Maximale optimalisatie — behoud alleen de meest-gebruikte dienst per categorie, elimineer de rest.',
}

const adviceSchema = z.object({
  intro: z.string().describe('Korte opening (1-2 zinnen) over het abonnementenportfolio als geheel — zet direct de toon'),
  items: z.array(z.object({
    name: z.string().describe('Naam van het abonnement, exact zoals in de lijst'),
    verdict: z.enum(['nuttig', 'overlap', 'niet_relevant']).describe(
      'nuttig = behoud aanbevolen; overlap = vergelijkbare dienst bestaat al; niet_relevant = weinig waarde of niet passend bij financieel doel'
    ),
    toelichting: z.string().describe('Maximaal 2 zinnen toelichting op het verdict — concreet en empowerend'),
    savingsMonthly: z.number().describe(
      'Maandelijkse besparing in EUR als dit abonnement opgezegd wordt. Geef 0 bij behoud-advies.'
    ),
  })),
  conclusion: z.string().describe(
    'Afsluitende samenvatting (2-3 zinnen) met totale besparingspotentieel in euro en vrijheidsdagen per jaar'
  ),
  totalSavingsPotential: z.number().describe(
    'Totale maandelijkse besparing in EUR als alle overlap/niet_relevant abonnementen worden opgezegd'
  ),
  suggestedActions: z.array(z.object({
    title: z.string().describe(
      'Concrete actietitel in gebiedende wijs, bijv. "Zeg Netflix op" of "Kies één streaming-dienst en zeg de anderen op"'
    ),
    description: z.string().describe(
      'Eén zin hoe de gebruiker dit uitvoert — zo specifiek mogelijk (bijv. "Ga naar netflix.com/account en kies Abonnement beëindigen")'
    ),
    euroSavingMonthly: z.number().describe('Maandelijkse besparing in EUR bij het uitvoeren van deze actie'),
    freedomDaysPerYear: z.number().describe('Vrijheidsdagen per jaar die deze actie oplevert'),
    suggestedWeekOffset: z.number().describe(
      'Aanbevolen week-offset: 0 = deze week (hoge urgentie), 1 = volgende week, 2 of hoger = later. Gebruik een waarde tussen 0 en 4.'
    ),
  })).describe(
    'Concrete, direct inplanbare acties voor abonnementen met verdict "overlap" of "niet_relevant". Geef maximaal 3 acties.'
  ),
})

export type SubscriptionAdvice = z.infer<typeof adviceSchema>

type SubscriptionInput = {
  name: string
  monthlyAmount: number
  frequency: string
  confidence: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return new Response(JSON.stringify({ error: tierGate.error }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  const body = await req.json() as {
    subscriptions: SubscriptionInput[]
    totalMonthly: number
  }

  const { subscriptions, totalMonthly } = body

  if (!subscriptions || subscriptions.length === 0) {
    return Response.json({ error: 'Geen abonnementen om te analyseren' }, { status: 400 })
  }

  // Fetch user profile for Temporal Balance personalisation + PII sanitize opts
  const { data: profile } = await supabase
    .from('profiles')
    .select('temporal_balance, full_name, date_of_birth')
    .eq('id', user.id)
    .single()

  const sanitizeOpts: SanitizeOptions = {}
  if (profile?.full_name) sanitizeOpts.names = [profile.full_name]
  if (profile?.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth

  const temporalBalance = profile?.temporal_balance ?? 3
  const temporalHint = TEMPORAL_HINTS[temporalBalance] ?? TEMPORAL_HINTS[3]

  // Fetch 3-month spending to compute daily expense for freedom-day conversion
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 3)
  const { data: txs } = await supabase
    .from('transactions')
    .select('amount')
    .gte('date', startDate.toISOString().split('T')[0])
    .eq('is_income', false)

  const totalSpent3m = (txs ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const dailyExpense = totalSpent3m > 0 ? (totalSpent3m / 3 * 12) / 365 : 30

  let model
  try {
    model = await getModel(supabase, 'abonnementen_advies')
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  // Sanitize subscription names before they reach the AI provider (own name +
  // generic PII stripped; merchant names kept — needed for the advice).
  const subList = subscriptions
    .map(s => `- ${sanitizeForAI(s.name, sanitizeOpts)}: €${s.monthlyAmount.toFixed(2)}/maand (${s.frequency}, zekerheid: ${s.confidence})`)
    .join('\n')

  const systemPrompt = `Je bent Will, de financiële vrijheidsassistent van TriFinity. Je filosofie: "Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd."

Je taak: geef abonnementen-advies. Beoordeel elk abonnement als:
- "nuttig": duidelijke waarde, geen overlap met andere abonnementen, behoud aanbevolen
- "overlap": vergelijkbare of identieke dienst bestaat al in de lijst, consolidatie aanbevolen
- "niet_relevant": weinig toegevoegde waarde of niet passend bij het financiële vrijheidsdoel

${temporalHint}

Rekenregels:
- Dagelijkse uitgaven van gebruiker: €${dailyExpense.toFixed(2)}/dag
- Vrijheidsdagen per jaar = (maandelijkse besparing × 12) / dagelijkse uitgaven
- Vermeld altijd zowel het euro-bedrag als de vrijheidsdagen bij besparingen

Toon: direct, empowerend, nooit veroordelend. Spreek de gebruiker aan als "je/jij".
Schrijf maximaal 2 zinnen per abonnement-toelichting.
Vermeld in de conclusie het totale besparingspotentieel én de bijbehorende vrijheidsdagen per jaar.

Stel ook maximaal 3 concrete, direct inplanbare acties voor (suggestedActions):
- Alleen voor abonnementen met verdict "overlap" of "niet_relevant"
- Actietitel in gebiedende wijs: "Zeg X op", "Kies één streaming-dienst", "Vergelijk alternatieven voor X"
- Geef een uitvoerbare beschrijving: precies wat de gebruiker moet doen (bijv. website, instellingenmenu)
- Bereken vrijheidsdagen per jaar voor elke actie
- Urgentie via suggestedWeekOffset: overlap = 0–1 (snel handelen), niet_relevant = 1–2`

  const userMessage = `Analyseer mijn ${subscriptions.length} abonnementen:\n\n${subList}\n\nTotaal: €${totalMonthly.toFixed(2)}/maand`

  try {
    const { object } = await generateObject({
      model,
      schema: adviceSchema,
      system: systemPrompt,
      prompt: userMessage,
      maxRetries: 1,
    })

    // Ensure suggestedWeekOffset is always a whole number (Claude may return floats)
    const normalized = {
      ...object,
      suggestedActions: object.suggestedActions.map(a => ({
        ...a,
        suggestedWeekOffset: Math.min(4, Math.max(0, Math.round(a.suggestedWeekOffset))),
      })),
    }

    // Output-masking (defence-in-depth): mask any IBAN/BSN that slipped into
    // the free AI text before it reaches the user (recommendations does the same).
    return Response.json(maskPIIInObject(normalized))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/subscriptions/advice] generateObject failed:', message)
    return Response.json(
      { error: `Will kon de abonnementen niet analyseren: ${message}` },
      { status: 500 },
    )
  }
}
