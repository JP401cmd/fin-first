import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'
import { SPEND_LIMIT_ALIASES } from '@/lib/spend-limits/copy'

/**
 * PUT /api/spend-limit-alias
 *
 * Slaat de profiel-brede weergavenaam voor grenzenpotten op de EIGEN profielrij
 * op. Body: `{ alias: 'grenzenpot' | 'schaamtepot' }`.
 *
 * Contract: `lib/spend-limits/copy.ts#SpendLimitAlias` is de single source van de
 * waarden (en spiegelt de CHECK-constraint op `profiles.spend_limit_alias`);
 * `lib/hooks/use-spend-limit-alias.tsx` is de enige client-schrijver en leest
 * alleen `res.ok` (optimistisch zetten, terugrollen bij een niet-ok antwoord).
 *
 * PUUR COSMETISCH: deze keuze raakt geen data, geen regel, geen berekening en
 * geen historische periode (ADR 0089 besluit 1). Meldingen die eerder zijn
 * samengesteld behouden de naam van hun generatiemoment.
 *
 * SECURITY: own-row update via de anon RLS-client (`.eq('id', user.id)`), NOOIT
 * service-role. Op `profiles` staat RLS aan met één eigen-rij ALL-policy; die
 * dekt de nieuwe kolom automatisch (RLS is row-level, niet kolom-level).
 *
 * CONVENTIE (ADR 0044): zod-validatie via `parseBody` + de respond-helpers, dus
 * één platte `{ error: string }`-envelope en nooit een rauwe `error.message`
 * naar de client. Bewust gespiegeld op `app/api/euro-view`, NIET op
 * `app/api/display-mode` — die route dateert van vóór deze conventie.
 */

// De toegestane waarden komen uit copy.ts (dezelfde lijst die de UI toont en de
// CHECK-constraint spiegelt) — nooit een tweede opsomming in deze route.
const SpendLimitAliasBodySchema = z.object({
  alias: z.enum(SPEND_LIMIT_ALIASES),
})

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCachedUser(supabase)
    if (!user) return unauthorized()

    const parsed = await parseBody(SpendLimitAliasBodySchema, request)
    if (!parsed.ok) return parsed.response
    const { alias } = parsed.data

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ spend_limit_alias: alias })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, alias })
  } catch (err) {
    return serverError(err, 'spend-limit-alias:PUT')
  }
}
