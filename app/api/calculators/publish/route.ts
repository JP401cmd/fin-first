import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
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

  // 2. AI pre-screen. Faalt gracieus (returns ok=true op AI-fout).
  const screen = await screenPublishMetadata(supabase, {
    name: source.name ?? sourceDef.name,
    description: source.description ?? sourceDef.description ?? null,
    assumptions: sourceDef.assumptions ?? [],
  })
  if (!screen.ok) {
    return Response.json(
      {
        ok: false,
        error: 'De naam of beschrijving is niet geschikt om publiek te delen.',
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
