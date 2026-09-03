import { createClient } from '@/lib/supabase/server'
import { unauthorized, errorResponse } from '@/lib/api/respond'
import { assertAiEnabled, isCloudAllowed, PRIVACY_GATE_CODE } from '@/lib/ai/privacy-gate'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import { StoredCalculatorDefinitionSchema } from '@/lib/calculator/types'
import { screenPublishMetadata } from '@/lib/ai/screen-publish-metadata'

/**
 * POST /api/calculators/publish
 *
 * Publiceert een rekenhulp uit de eigen werkkopie als een NIEUWE rij
 * (publieke template). De eigen werkkopie blijft ongewijzigd; de
 * publieke rij is een snapshot met door de auteur gecureerde defaults
 * en bewust verwijderde prefills.
 *
 * Workflow:
 *  1. Authenticeer + verifieer eigenaarschap van bron-rij.
 *  2. AI pre-screen op naam/beschrijving (educatief vs. advies, geen
 *     persoonlijke bedragen of leverancier-namen).
 *  3. Bouw `published_definition` door de bron-definitie te klonen,
 *     `curated_defaults` toe te passen, en `prefill` te strippen waar
 *     `prefill_overrides[key] === false`.
 *  4. INSERT nieuwe rij met is_public=true, forked_from=null (dit is
 *     de oorspronkelijke publicatie, geen fork).
 *
 * Body:
 *   {
 *     calculatorId: string,
 *     curated_defaults: Record<inputKey, number>,
 *     prefill_overrides: Record<inputKey, boolean>
 *       // true = behoud prefill, false = verwijder prefill uit publieke versie
 *   }
 *
 * Response:
 *   200 { ok: true, publishedId }
 *   401 { error: 'Niet ingelogd' }
 *   404 niet gevonden / geen eigenaar
 *   422 { ok: false, error, issue?, suggestion? }  (screening of validatie)
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // PRIVÉ-MODUS — hier blokkeren we bewust wél volledig, anders dan bij /api/report.
  //
  // Deze screening is geen assistieve hulp maar een POORTWACHTER vóór een publieke
  // insert: hij bewaakt de Wft-grens (educatieve rekenhulp mag, concreet financieel
  // advies niet) en houdt persoonlijke bedragen en leveranciersnamen uit een
  // template die straks voor iedereen zichtbaar is. Twee dingen volgen daaruit:
  //
  //   1. Het oordeel moet op de SERVER vallen. Een browser-oordeel is niet
  //      afdwingbaar — wie de client omzeilt, publiceert ongescreend. "De client
  //      zegt dat het goed is" mag hier dus nooit volstaan.
  //   2. De inhoudelijke helft (advies-vs-educatie) is een taaloordeel dat het
  //      lokale model niet betrouwbaar velt. Half screenen is voor een publieke,
  //      vergunning-gevoelige pagina geen optie.
  //
  // Daarom: staat 'rapporten' op lokaal, dan kan er niet gepubliceerd worden en
  // zeggen we dat eerlijk, mét de uitweg. De rekenhulp zelf blijft gewoon werken
  // en blijft privé bewaard — alleen het DELEN vraagt de cloud-controle.
  // KILL-SWITCH EERST (M26). Staat AI uit, dan geeft `isCloudAllowed` ook false —
  // maar de melding hieronder zou dan een uitweg adviseren die niet werkt ("zet
  // 'm op cloud-AI"): de kill-switch blokkeert cloud én lokaal. Eerst de echte
  // oorzaak melden, met de knop die er wél toe doet.
  const aiGate = await assertAiEnabled(supabase, user.id)
  if (aiGate) return aiGate

  if (!(await isCloudAllowed(supabase, user.id, 'rapporten'))) {
    return errorResponse(
      'Privé-modus actief: publiceren vraagt een inhoudelijke controle op onze server. ' +
        'Zet "Rapporten & rekenhulpen" op cloud-AI via Mijn → Privacy als je deze rekenhulp wilt delen. ' +
        'Je rekenhulp blijft gewoon voor jezelf bewaard.',
      403,
      PRIVACY_GATE_CODE,
    )
  }

  // TIER-GATE — de gemotiveerde keuze: PUBLICEREN VEREIST HET AI-ABONNEMENT.
  //
  // Publiceren is op zichzelf geen AI-functie; de AI zit alleen in de screening.
  // Toch gate-t hier de hele route, en niet alleen de screening, om één reden:
  // `screenPublishMetadata` is een POORTWACHTER die FAIL-CLOSED is (zie die
  // module). Hem overslaan voor wie geen abonnement heeft, betekent publiceren
  // zónder de controle die de Wft-grens bewaakt en persoonlijke bedragen en
  // leveranciersnamen uit een publieke template houdt. Dat is precies het
  // tweede, minder bewaakte pad dat we nergens willen.
  //
  // Waarom niet terugvallen op `screenPublishDeterministic`
  // (lib/ai/screen-publish-deterministic.ts)? Die functie zegt het zelf: hij is
  // GEEN poortwachter. Het onderscheid educatieve rekenhulp vs. concreet
  // financieel advies is een taaloordeel dat geen regex velt. Een non-AI
  // publiceerpad op alleen die check zou de lat verlagen voor precies de rijen
  // die daarna voor iedereen zichtbaar zijn.
  //
  // Wat dat kost, eerlijk benoemd: wie geen AI-abonnement heeft kan zijn
  // rekenhulp niet DELEN. Hij kan hem wel gewoon maken, gebruiken en bewaren —
  // dat blijft ongemoeid. Consistent met /api/ai/build-calculator, dat het
  // maken van een AI-rekenhulp al achter hetzelfde abonnement zet, en met de
  // privé-modus-melding hierboven: zelfde vorm (`{ ok: false, error }`), zodat
  // de curatie-sheet de échte reden toont in plaats van "Publiceren mislukt".
  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return Response.json(
      {
        ok: false,
        error:
          'Publiceren vraagt een inhoudelijke controle door onze AI-screening, en die hoort bij het AI-abonnement. ' +
          'Je rekenhulp blijft gewoon van jou: je kunt hem blijven gebruiken en bewerken, alleen delen kan nu niet.',
      },
      { status: 403 },
    )
  }

  // CREDIT-GATE — direct ná de tier-gate en vóór getModel(), conform
  // lib/ai/credit-gate.ts. Sleutel 'report' (kosten 5): er is geen aparte
  // publicatie-sleutel en we voegen er bewust geen toe; 'report' hoort bij
  // dezelfde uitvoergroep ('rapporten' = Rapporten & rekenhulpen) die deze route
  // hierboven al voor de privé-gate gebruikt, dus de /beheer-uitsplitsing zet
  // dit verbruik waar de gebruiker het verwacht. De screening is goedkoper dan
  // een heel rapport, dus we rekenen aan de veilige kant te hoog — bij een
  // rate-limit is dat de juiste richting, en 'categorize' (kosten 1) zou de
  // transactie-categorisatie in de verbruiksgrafiek vervuilen.
  const creditGate = await checkCreditBudget(supabase, user.id, 'report')
  if (!creditGate.allowed) {
    const res = Response.json(
      { ok: false, error: creditLimitMessage(creditGate) },
      { status: 429 },
    )
    res.headers.set('Retry-After', String(creditGate.retryAfterSeconds))
    return res
  }

  let body: {
    calculatorId?: unknown
    curated_defaults?: unknown
    prefill_overrides?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige request-body.' }, { status: 400 })
  }

  const calculatorId = typeof body.calculatorId === 'string' ? body.calculatorId : ''
  if (!calculatorId) {
    return Response.json(
      { ok: false, error: 'calculatorId ontbreekt.' },
      { status: 400 },
    )
  }

  // Curated defaults: per input-key een numerieke waarde. We accepteren
  // alleen finite numbers; al het andere wordt genegeerd (de eigen
  // default uit de definitie blijft dan staan).
  const curatedDefaults: Record<string, number> = {}
  if (body.curated_defaults && typeof body.curated_defaults === 'object') {
    for (const [k, v] of Object.entries(body.curated_defaults as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        curatedDefaults[k] = v
      }
    }
  }

  // Prefill overrides: true = behoud prefill, false = strip. Onbekende
  // keys worden als true (behoud) behandeld zodat we niet stilletjes data
  // weggooien.
  const prefillOverrides: Record<string, boolean> = {}
  if (body.prefill_overrides && typeof body.prefill_overrides === 'object') {
    for (const [k, v] of Object.entries(body.prefill_overrides as Record<string, unknown>)) {
      if (typeof v === 'boolean') prefillOverrides[k] = v
    }
  }

  // 1. Bron-calculator ophalen. RLS dwingt eigenaarschap af, maar we
  //    valideren expliciet zodat we een nette 404 kunnen retourneren.
  const { data: source, error: loadErr } = await supabase
    .from('custom_calculators')
    .select('id, user_id, name, description, definition')
    .eq('id', calculatorId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (loadErr || !source) {
    return Response.json(
      { ok: false, error: 'Rekenhulp niet gevonden of niet van jou.' },
      { status: 404 },
    )
  }

  // Definitie valideren zodat we niet op corrupte JSONB werken.
  // Soepelere caps voor stored data — oude calculators kunnen ruimer zijn
  // dan de huidige strikte AI-output-caps.
  const parsed = StoredCalculatorDefinitionSchema.safeParse(source.definition)
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'De rekenhulp-definitie is ongeldig en kan niet gepubliceerd worden.' },
      { status: 422 },
    )
  }
  const sourceDef = parsed.data

  // 2. AI pre-screen. Faalt CLOSED: kon de screening niet draaien, dan komt
  //    `ok=false` met `reason: 'unavailable'` terug (zie die module).
  const screen = await screenPublishMetadata(supabase, {
    name: source.name ?? sourceDef.name,
    description: source.description ?? sourceDef.description ?? null,
    assumptions: sourceDef.assumptions ?? [],
  })

  // Registreren zodra de screening geDRAAID heeft — óók wanneer ze afkeurt.
  // Een afgekeurde publicatie heeft het model net zo goed gekost, en zonder deze
  // regel zou een reeks afgekeurde pogingen gratis zijn: dan is de credit-gate
  // hierboven te omzeilen door steeds tekst aan te bieden die wordt geweigerd.
  await recordAiUsage(supabase, user.id, 'report')

  if (!screen.ok) {
    // Eén responsvorm, twee eerlijke boodschappen. De curatie-sheet toont
    // uitsluitend `error` (`issue`/`suggestion` reizen mee). Bij 'unavailable'
    // heeft de screening níets over de inhoud gezegd — dan is "niet geschikt
    // om publiek te delen" een onterecht verwijt en hoort de gebruiker de
    // fail-closed-tekst zelf te zien (UAT WF-REKEN-04-bug2). Fail-closed blijft:
    // in beide gevallen 422 en geen publieke rij.
    const error =
      screen.reason === 'unavailable'
        ? screen.issue
        : 'De naam of beschrijving is niet geschikt om publiek te delen.'
    return Response.json(
      {
        ok: false,
        error,
        issue: screen.issue,
        suggestion: screen.suggestion,
      },
      { status: 422 },
    )
  }

  // 3. Bouw de gecureerde publieke definitie. Deep clone via JSON zodat
  //    we de bron-rij niet muteren.
  const publishedDef: typeof sourceDef = JSON.parse(JSON.stringify(sourceDef))
  publishedDef.inputs = publishedDef.inputs.map((input) => {
    const next = { ...input }
    // Curated default overschrijft de auteur-waarde.
    if (Object.prototype.hasOwnProperty.call(curatedDefaults, input.key)) {
      next.default = curatedDefaults[input.key]
    }
    // Prefill-strip: alleen wanneer expliciet override=false.
    if (prefillOverrides[input.key] === false) {
      delete next.prefill
    }
    return next
  })

  // 4. Nieuwe rij inserten. Bestaande forks/likes raken we niet aan; dit
  //    is een independent snapshot. forked_from=null = "originele
  //    publicatie van deze auteur" (vs. een fork uit iemand anders'
  //    werk). created_by_ai=false omdat deze rij door de curatie-flow is
  //    gemaakt, niet door de AI-generator.
  const { data: inserted, error: insErr } = await supabase
    .from('custom_calculators')
    .insert({
      user_id: user.id,
      name: source.name ?? sourceDef.name,
      description: source.description ?? sourceDef.description ?? null,
      definition: publishedDef,
      created_by_ai: false,
      is_public: true,
      published_at: new Date().toISOString(),
      forked_from: null,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.error('[calculators/publish] insert mislukt:', insErr)
    return Response.json(
      { ok: false, error: 'Publiceren mislukt. Probeer het opnieuw.' },
      { status: 500 },
    )
  }

  return Response.json({ ok: true, publishedId: inserted.id }, { status: 200 })
}
