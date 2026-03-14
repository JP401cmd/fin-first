import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'

const CHILD_SLUGS = [
  'salaris-uitkering',
  'toeslagen-kinderbijslag',
  'teruggave-belasting',
  'overige-inkomsten',
  'huur-hypotheek',
  'gas-water-licht',
  'verzekeringen-wonen',
  'gemeentelijke-lasten',
  'boodschappen',
  'huishouden-verzorging',
  'kinderen-school',
  'medische-kosten',
  'brandstof-ov',
  'auto-vaste-lasten',
  'auto-onderhoud',
  'fiets-deelvervoer',
  'uit-eten-horeca',
  'vrije-tijd-sport',
  'vakantie',
  'kleding-overige',
  'sparen-noodbuffer',
  'investeren-fire',
  'schulden-aflossingen',
  'extra-aflossing-hypotheek',
] as const

type BudgetSlug = typeof CHILD_SLUGS[number]

const categorizationSchema = z.object({
  categorizations: z.array(z.object({
    budget_slug: z.string().nullable(),
    confidence: z.number(),
    reasoning: z.string(),
  })),
})

const VALID_SLUGS = new Set<string>(CHILD_SLUGS)

type RequestTransaction = {
  import_hash: string
  description: string
  counterparty_name?: string | null
  amount: number
  reference?: string | null
}

const SYSTEM_PROMPT = `Je bent een Nederlandse financiële assistent die banktransacties categoriseert.

Wijs elke transactie toe aan één van de volgende budgetcategorieën (of null als je het niet weet):

INKOMSTEN:
- salaris-uitkering: Salaris, loon, uitkering, AOW, WW
- toeslagen-kinderbijslag: Toeslagen, kinderbijslag, huurtoeslag, zorgtoeslag
- teruggave-belasting: Belastingteruggave, toeslagen Belastingdienst
- overige-inkomsten: Freelance, bijbaantje, dividenden, rente, verkopen

VASTE LASTEN:
- huur-hypotheek: Huur, hypotheek, pacht
- gas-water-licht: Energie (Vattenfall, Eneco, Nuon, Greenchoice, budget-thuis, essent, energie)
- verzekeringen-wonen: Inboedel, opstal, aansprakelijkheidsverzekering, woonverzekering
- gemeentelijke-lasten: Gemeentebelasting, rioolheffing, OZB, afvalstoffen

DAGELIJKSE UITGAVEN:
- boodschappen: Albert Heijn, Jumbo, Lidl, Aldi, Plus, Dirk, Spar, supermarkt, bezorging (Picnic, Crisp)
- huishouden-verzorging: Drogist (Etos, Kruidvat, DA), schoonmaakmiddelen, persoonlijke verzorging
- kinderen-school: School, kinderopvang, KDV, BSO, sportclub kinderen, schoolspullen
- medische-kosten: Apotheek, tandarts, huisarts, ziekenhuis, eigen risico, brillen/lenzen

VERVOER:
- brandstof-ov: Tankstation (Shell, BP, Esso, Tango), OV-chipkaart, NS, connexxion, arriva
- auto-vaste-lasten: Wegenbelasting, autoverzekering, lease
- auto-onderhoud: Garage, APK, banden, ANWB, autoparking
- fiets-deelvervoer: Swapfiets, OV-fiets, Donkey Republic, Bolt, Tier, deelscooter

LEUKE DINGEN:
- uit-eten-horeca: Restaurants, cafés, bezorging (Thuisbezorgd, Uber Eats, Deliveroo), snackbar, fastfood
- vrije-tijd-sport: Netflix, Spotify, Disney+, sportschool, cinema, theater, Bol.com (niet essentieel), games
- vakantie: Hotels, vliegtickets (KLM, Transavia, Ryanair), Booking.com, Airbnb, vakantieparken
- kleding-overige: Kleding (H&M, Zara, Nike, Zalando), schoenen, accessoires, cadeaus, overige

SPAREN & SCHULDEN:
- sparen-noodbuffer: Spaarrekening, noodbuffer overboeking
- investeren-fire: Beleggingen, DEGIRO, Fidelity, Brand New Day, pensioenstorting
- schulden-aflossingen: Lening aflossing, creditcard, studieschuld, persoonlijke lening
- extra-aflossing-hypotheek: Extra hypotheekaflossing, hypotheek extra storting

REGELS:
1. Geef alleen een budget_slug terug als je confidence ≥ 0.5 is, anders null.
2. Positieve bedragen zijn inkomsten (gebruik inkomen-categorieën). Negatieve bedragen zijn uitgaven.
3. Geef je redenering in het Nederlands, max 1 zin.
4. Baseer je categorisatie op de beschrijving, tegenpartij, en bedragrichting.
5. Retourneer een array van exact N items in DEZELFDE VOLGORDE als de invoer. Geen extra velden.`

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

  let body: { transactions: RequestTransaction[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }

  const { transactions } = body
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return Response.json({ error: 'Geen transacties meegegeven.' }, { status: 400 })
  }

  // Max 20 per batch to avoid model timeouts and hash mangling
  const batch = transactions.slice(0, 20)

  let model
  try {
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const prompt = `Categoriseer de volgende ${batch.length} transacties.\nRetourneer een array van exact ${batch.length} items in dezelfde volgorde.\n\n${batch.map((tx, i) => {
    const parts = [
      `beschrijving: ${tx.description}`,
      tx.counterparty_name ? `tegenpartij: ${tx.counterparty_name}` : null,
      `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
      tx.reference ? `referentie: ${tx.reference}` : null,
    ].filter(Boolean)
    return `${i + 1}. ${parts.join('\n   ')}`
  }).join('\n\n')}`

  let object: z.infer<typeof categorizationSchema>
  try {
    const result = await generateObject({
      model,
      schema: categorizationSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxRetries: 0,
    })
    object = result.object
  } catch (err) {
    console.error('AI categorization failed:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json(
      { error: `AI-categorisatie mislukt: ${message}` },
      { status: 500 },
    )
  }

  // Build a lookup map from slug → budget_id
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, slug')
    .in('slug', [...CHILD_SLUGS])

  const slugToId = new Map<BudgetSlug, string>()
  for (const b of budgets ?? []) {
    if (b.slug) slugToId.set(b.slug as BudgetSlug, b.id)
  }

  // Positional mapping: result[i] corresponds to batch[i]
  const results = batch.map((tx, i) => {
    const cat = object.categorizations[i]
    if (!cat) return { import_hash: tx.import_hash, budget_slug: null, budget_id: null, confidence: 0, reasoning: '' }
    const slug = cat.budget_slug?.toLowerCase().trim() ?? null
    const validSlug = slug && VALID_SLUGS.has(slug) ? (slug as BudgetSlug) : null
    return {
      import_hash: tx.import_hash,
      budget_slug: validSlug,
      budget_id: validSlug ? (slugToId.get(validSlug) ?? null) : null,
      confidence: Math.min(1, Math.max(0, cat.confidence)),
      reasoning: cat.reasoning,
    }
  })

  return Response.json({ results })
}
