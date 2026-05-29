import { createClient } from '@/lib/supabase/server'
import { CalculatorDefinitionSchema } from '@/lib/calculator/types'

/**
 * POST /api/calculators/duplicate
 *
 * Kopieer een publieke rekenhulp naar de eigen werkruimte. Een deep
 * clone, geen live link naar de bron — de gebruiker kan het kopie
 * vrij aanpassen zonder dat de originele auteur er last van heeft (en
 * andersom).
 *
 * Server-bijwerkingen:
 *  - Insert in custom_calculators voor `auth.uid()`, is_public=false,
 *    forked_from=sourceId, created_by_ai=false.
 *  - UPDATE source SET duplicate_count = duplicate_count + 1.
 *
 * Body: { sourceId: string }
 * Resp: 200 { ok: true, id } | 401 | 404
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let body: { sourceId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige request-body.' }, { status: 400 })
  }

  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!sourceId) {
    return Response.json({ ok: false, error: 'sourceId ontbreekt.' }, { status: 400 })
  }

  // Laad de publieke bron-rij. RLS staat SELECT toe op is_public=true OR
  // user_id=auth.uid(); we filteren expliciet op is_public=true zodat een
  // gebruiker geen DML doet op een private rij van een andere user via
  // deze route.
  const { data: source, error: loadErr } = await supabase
    .from('custom_calculators')
    .select('id, name, description, definition, duplicate_count, is_public')
    .eq('id', sourceId)
    .eq('is_public', true)
    .maybeSingle()
  if (loadErr || !source) {
    return Response.json(
      { ok: false, error: 'Publieke rekenhulp niet gevonden.' },
      { status: 404 },
    )
  }

  // Definitie valideren — een corrupte JSONB-rij willen we niet in een
  // andere user-account dumpen.
  const parsed = CalculatorDefinitionSchema.safeParse(source.definition)
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'De bron-definitie is ongeldig en kan niet worden gekopieerd.' },
      { status: 422 },
    )
  }

  // Deep clone via JSON-serialisatie. Voldoet voor onze JSON-only-shape
  // (geen Date/Map/Set in CalculatorDefinition).
  const clonedDef = JSON.parse(JSON.stringify(parsed.data))

  const newName = `${source.name ?? parsed.data.name} (kopie)`

  const { data: inserted, error: insErr } = await supabase
    .from('custom_calculators')
    .insert({
      user_id: user.id,
      name: newName,
      description: source.description ?? parsed.data.description ?? null,
      definition: clonedDef,
      created_by_ai: false,
      is_public: false,
      forked_from: sourceId,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.error('[calculators/duplicate] insert mislukt:', insErr)
    return Response.json(
      { ok: false, error: 'Kopiëren mislukt. Probeer het opnieuw.' },
      { status: 500 },
    )
  }

  // Counter ophogen op de bron. We doen dit ná de insert zodat een
  // mislukte clone-insert niet de teller alvast verhoogt. Als deze update
  // faalt is dat niet-fataal voor de gebruiker — we loggen alleen.
  const { error: counterErr } = await supabase
    .from('custom_calculators')
    .update({ duplicate_count: (source.duplicate_count ?? 0) + 1 })
    .eq('id', sourceId)
  if (counterErr) {
    console.error('[calculators/duplicate] counter-update mislukt:', counterErr)
  }

  return Response.json({ ok: true, id: inserted.id }, { status: 200 })
}
