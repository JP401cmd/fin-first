import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { buildSharedContext } from '@/lib/ai/context/shared-context'
import { NextResponse } from 'next/server'

// ── Valid news categories ────────────────────────────────────────────

const NEWS_CATEGORIES = [
  'fiscaal',
  'rente',
  'woningmarkt',
  'beleggingen',
  'pensioen',
  'macro',
] as const

// ── Schema ───────────────────────────────────────────────────────────

const newsItemSchema = z.object({
  id: z.string().describe('Uniek ID voor het nieuwsitem (bijv. news-2026-03-07-1)'),
  headline: z.string().describe('Korte, pakkende kop in het Nederlands'),
  summary: z.string().describe('Samenvatting van het nieuws in 2-3 zinnen'),
  personalImpact: z.string().describe('Concrete impact op de gebruiker met bedragen of vrijheidstijd (bijv. "Dit kan je maandelijks €45 schelen, oftewel 1,2 vrijheidsdagen per jaar")'),
  category: z.enum(NEWS_CATEGORIES).describe('Nieuwscategorie'),
  date: z.string().describe('Datum van het nieuws in YYYY-MM-DD formaat'),
  sourceContext: z.string().optional().describe('Broncontext of toelichting (bijv. "Belastingplan 2026", "ECB persconferentie")'),
})

const newsResponseSchema = z.object({
  items: z.array(newsItemSchema).min(5).max(10),
})

// ── System prompt ────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `Je bent een persoonlijke financiele nieuwsassistent voor TriFinity, een Nederlandse personal finance app.

KERNFILOSOFIE: "Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd."

Je taak:
1. Genereer 5-10 relevante Nederlandse financiele nieuwsberichten op basis van actuele trends en wetswijzigingen.
2. Vertaal elk nieuwsitem naar de PERSOONLIJKE impact van de gebruiker — met concrete bedragen of vrijheidstijd.

CATEGORIEËN:
- fiscaal: Belastingwijzigingen, box 1/2/3, toeslagen, aftrekposten
- rente: ECB-beslissingen, spaarrente, hypotheekrentes
- woningmarkt: Huizenprijzen, NHG, huurmarkt
- beleggingen: AEX, ETF's, crypto-regulering, dividenden
- pensioen: AOW, pensioenwet, lijfrente
- macro: Inflatie, koopkracht, loongroei, werkloosheid

REGELS:
- Schrijf ALTIJD in het Nederlands
- personalImpact MOET concrete euro-bedragen OF vrijheidstijd bevatten (bijv. "€X per maand" of "X vrijheidsdagen")
- Baseer je op actuele Nederlandse financiele trends per maart 2026
- Gebruik de financiele gegevens van de gebruiker om impact te personaliseren
- Elke headline moet kort en informatief zijn (max 80 tekens)
- Sorteer op relevantie voor de gebruiker (meest relevant eerst)
- Gebruik het YYYY-MM-DD datumformaat
- Zorg voor spreiding over categorieën (minimaal 3 verschillende)
- sourceContext is optioneel maar wordt gewaardeerd voor context

VRIJHEIDSTIJD BEREKENING:
Als de gebruiker dagelijkse kosten heeft, gebruik die als basis:
- vrijheidsdagen = euro-impact / dagelijkse kosten
- Voorbeeld: "Dit bespaart je €90/maand — dat zijn 2,3 extra vrijheidsdagen per jaar"
`

// ── GET handler ──────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Build financial context for personalization
  let financialContext: string
  try {
    financialContext = await buildSharedContext(supabase)
  } catch {
    financialContext = 'Geen financiele gegevens beschikbaar.'
  }

  // Get AI model
  let model
  try {
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    const { object } = await generateObject({
      model,
      schema: newsResponseSchema,
      system: NEWS_SYSTEM_PROMPT,
      prompt: `Datum vandaag: ${today}

FINANCIEEL PROFIEL VAN DE GEBRUIKER:
${financialContext}

Genereer 5-10 gepersonaliseerde Nederlandse financiele nieuwsitems. Focus op nieuws dat relevant is voor deze specifieke gebruiker, gebaseerd op hun financiele situatie. Gebruik concrete bedragen en vrijheidstijd in de personalImpact.`,
    })

    return NextResponse.json(object.items)
  } catch (err) {
    console.error('[/api/news] AI generation failed:', err)
    return NextResponse.json(
      { error: 'Nieuws kon niet worden gegenereerd. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}
