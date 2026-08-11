import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { setSpendLimitWidgetEnabled } from '@/lib/spend-limits/widget-pref'
import type { WidgetPrefs } from '@/lib/widget-catalog'

/**
 * Grenzenpot — de dashboard-tegel aan- of uitzetten.
 *
 * ── WAAROM DEZE ROUTE BESTAAT ───────────────────────────────────────────────
 * Een weggeklikte grens-tegel had geen weg terug. De widget-picker toont
 * `spend_limit:*` bewust niet (zijn contract is de statische `WIDGET_CATALOG`,
 * ADR 0092 besluit 1), dus de enige route naar een teruggezette tegel was: de pot
 * archiveren en opnieuw aanmaken — een gedragsnorm mét historie weggooien voor
 * een tegel. Deze schakelaar is die weg terug, en hij zit in het bewerkformulier
 * van de pot: dáár hoort de vraag "wil ik dit op mijn startscherm zien?".
 *
 * ── WAAROM NIET /api/widgets ────────────────────────────────────────────────
 * Die PUT VERVANGT de hele `widget_prefs`-kolom met wat de client meestuurt. Dit
 * oppervlak (de transactiepagina) kent die indeling helemaal niet en zou hem dus
 * platslaan. Hier gebeurt daarom een read-modify-write op precies één veld —
 * spiegel van `app/api/appearance`: eigen rij, anon-RLS-client, nooit
 * service-role.
 *
 * Die read-modify-write is niet atomair. Dat is bewust en acceptabel: het
 * verliesscenario is dat iemand in hetzelfde seconde-venster op /overzicht zijn
 * indeling opslaat én hier een tegel omzet — dan wint de laatste schrijver van
 * één booleaan. Dezelfde afweging als bij /api/appearance; een lock of
 * JSONB-patch is die complexiteit hier niet waard.
 *
 * FOUTTAG: `spend-limits-widget:PATCH` — bewust niet dezelfde tag als
 * `/api/spend-limits/[id]` (`spend-limits:PATCH`), want een gedeelde tag maakt
 * een logregel onherleidbaar tot de route die hem schreef.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WidgetPrefInputSchema = z.object({
  enabled: z.boolean(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badRequest('Ongeldig ID-formaat')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(WidgetPrefInputSchema, req)
  if (!parsed.ok) return parsed.response

  // Eigenaarschap eerst: zonder deze controle zou een vreemd id een pref in de
  // EIGEN prefs schrijven voor een pot die niet van deze gebruiker is. Onschadelijk
  // qua data, maar het maakt van de kolom een prullenbak en zou bevestigen dat een
  // id bestaat. `.eq('user_id', …)` is dubbelop naast RLS — de vangrail die een
  // gemiste policy als 404 laat zien i.p.v. als stille cross-user-write. Een
  // gearchiveerde pot telt als niet-bestaand: de loader ruimt zijn pref juist op.
  const { data: limit, error: limitError } = await supabase
    .from('spend_limits')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .maybeSingle()

  if (limitError) return serverError(limitError, 'spend-limits-widget:PATCH')
  if (!limit) return notFound()

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('widget_prefs')
    .eq('id', user.id)
    .maybeSingle()

  if (readError) return serverError(readError, 'spend-limits-widget:PATCH')

  // De kolom is vrije JSONB: een oude of handmatig aangeraakte rij hoeft de
  // verwachte vorm niet te hebben. Alles wat geen array is telt als "nog niets
  // opgeslagen", zodat de helper de catalogus-standaard zaait i.p.v. te crashen.
  const saved = (profile?.widget_prefs as WidgetPrefs | null)?.widgets
  const widgets = setSpendLimitWidgetEnabled(
    Array.isArray(saved) ? saved : null,
    id,
    parsed.data.enabled,
  )

  const { data: updated, error: writeError } = await supabase
    .from('profiles')
    .update({ widget_prefs: { widgets } })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (writeError) return serverError(writeError, 'spend-limits-widget:PATCH')
  // Geen bijgewerkte rij = geen profiel (of RLS blokkeerde de write). Dat is een
  // serverfout, geen invoerfout: de gebruiker is ingelogd, dus de rij hoort er te zijn.
  if (!updated) return serverError(new Error('profielrij niet bijgewerkt'), 'spend-limits-widget:PATCH')

  // Het startscherm rendert de widget-grid server-side uit deze kolom.
  revalidatePath('/overzicht')

  return NextResponse.json({ enabled: parsed.data.enabled })
}
