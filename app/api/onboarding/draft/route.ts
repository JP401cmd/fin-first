import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { unauthorized, serverError, badRequest } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { OnboardingDraftBodySchema } from '@/app/(onboarding)/onboarding/draft-persistence'

/**
 * /api/onboarding/draft — het lopende onboarding-concept van de ingelogde
 * gebruiker.
 *
 * WAAROM (kaart UR2-01, P0): tot aug 2026 leefden naam, bedragen, bezittingen
 * en schulden tijdens de onboarding uitsluitend in de in-memory React-state.
 * Elke page-reload — refresh, crash, HMR, een tabje dat herlaadt — wiste alles
 * en liet alleen de stap-teller staan. Sinds de security-fix van jul 2026 mocht
 * die data bewust NIET meer in localStorage (gedeeld apparaat, XSS), dus het
 * concept verhuist hier naar de eigen, RLS-gescopede profielrij: dezelfde plek
 * waar dezelfde gegevens na afronding tóch al landen.
 *
 * TOEGANGSMODEL: alles loopt via de anon RLS-client op de EIGEN profielrij
 * (`.eq('id', user.id)` bovenop de bestaande policy `auth.uid() = id`). Nooit
 * service-role — een concept is per definitie eigen-rij-data.
 *
 * WAT ER NIET IN ZIT: het geparste pensioenoverzicht (`pension.parseResult`).
 * Dat blijft per ADR 0115 op het toestel; `serializeDraft` laat het veld weg en
 * het `.strict()`-zodschema weigert het actief mocht het er ooit toch bij komen.
 *
 * VALIDATIE: bewust tolerant op volledigheid (een concept is per definitie
 * halfaf) en streng op vorm — zie de toelichting in `draft-persistence.ts`.
 * Foutvorm via lib/api/respond.ts (ADR 0044); body-validatie via zod +
 * `parseBody` (ADR 0044 / API-conventie).
 */

/** Bovengrens op het concept in de profielrij — ruim boven een reëel concept. */
const MAX_DRAFT_BYTES = 64 * 1024

/**
 * Bovengrens op de RAUWE request-body, getoetst op `content-length` vóór het
 * inlezen. Ruimer dan `MAX_DRAFT_BYTES` (JSON-omhulsel + escaping) maar klein
 * genoeg om een geauthenticeerde geheugenaanval te smoren.
 */
const MAX_REQUEST_BYTES = 256 * 1024

/**
 * GET — lees het concept van de ingelogde gebruiker.
 * `{ draft: null }` wanneer er niets loopt (nieuwe gebruiker of net gewist).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_draft')
      .eq('id', user.id)
      .maybeSingle()

    if (error) return serverError(error, 'onboarding-draft:GET')

    return NextResponse.json({ draft: data?.onboarding_draft ?? null })
  } catch (err) {
    return serverError(err, 'onboarding-draft:GET')
  }
}

/**
 * PUT — schrijf het concept weg. Vervangt het vorige concept volledig; de
 * client is de enige schrijver en stuurt telkens de complete staat, dus een
 * read-modify-write zou hier alleen maar een verloren-update-venster toevoegen.
 */
// `Request` en niet `NextRequest`: deze handler leest alleen de body, dus de
// Next-specifieke velden (cookies/nextUrl) zijn hier nergens voor nodig — en
// een smaller type maakt de handler los aanroepbaar vanuit een test.
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    // Eerste grens, vóór `req.json()`: weiger een absurde body zonder 'm te
    // bufferen en zonder de zod-walk erop los te laten. Next-routehandlers
    // hebben geen eigen body-limiet, dus zonder dit kan een ingelogde gebruiker
    // honderden megabytes laten inlezen voordat de tweede grens toeslaat.
    // Ontbrekende/onleesbare header → doorlaten; de tweede grens vangt 'm.
    const declaredLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return badRequest('Concept is te groot om te bewaren', 'draft_too_large')
    }

    const parsed = await parseBody(OnboardingDraftBodySchema, request)
    if (!parsed.ok) return parsed.response

    const { draft } = parsed.data
    // Tweede grens, ná de vormcontrole: de per-veld-maxima houden losse velden
    // klein, deze grens houdt het TOTAAL klein (de arrays samen).
    if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) {
      return badRequest('Concept is te groot om te bewaren', 'draft_too_large')
    }

    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_draft: draft })
      .eq('id', user.id)

    if (error) return serverError(error, 'onboarding-draft:PUT')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError(err, 'onboarding-draft:PUT')
  }
}

/**
 * DELETE — wis het concept. Aangeroepen zodra de onboarding is afgerond, bij
 * uitloggen/afbreken, en wanneer de pagina een al voltooide onboarding aantreft.
 * Idempotent: wissen wat er niet is, is geen fout.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_draft: null })
      .eq('id', user.id)

    if (error) return serverError(error, 'onboarding-draft:DELETE')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError(err, 'onboarding-draft:DELETE')
  }
}
