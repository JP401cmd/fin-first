import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { parseToekomstScenarioPrefs } from '@/lib/horizon/toekomst-scenario'

/**
 * PUT /api/toekomst-scenario
 *
 * Persisteert de wat-als-scenariovoorkeuren (sliders, per-categorie rendement-delta,
 * stopleeftijd-marker, weergavevlaggen) van /toekomst op de EIGEN profielrij
 * (`profiles.toekomst_scenario_prefs`, jsonb). Cross-device: de horizon-loader leest
 * de kolom server-side terug (defensief geparsed) zodat de scenariolaag bij herbezoek
 * terugkomt. Deze route is het enige schrijfpad.
 *
 * SINGLE SOURCE / SECURITY (spiegelt /api/appearance + /api/display-mode):
 *   - authz via `supabase.auth.getUser()` (401 als niet ingelogd), gelijk aan appearance;
 *   - `parseToekomstScenarioPrefs` is de ENIGE schrijf-poort — ongeldige/vervuilde body
 *     ⇒ `null` ⇒ 400 (nooit ongevalideerde JSON naar de kolom);
 *   - own-row VOLLEDIGE overwrite via de anon RLS-client
 *     (`.update({ toekomst_scenario_prefs }).eq('id', user.id)`), NOOIT service-role.
 *     De kolom is exclusief van deze feature, dus een hele-kolom-overwrite is veilig
 *     (geen read-modify-write nodig — anders dan de status-banner-pref die een JSONB-map
 *     deelt). Dit wijkt bewust af van appearance's `.upsert()`: de harde eis is een
 *     `.eq('id', user.id)`-scoped write, precies zoals /api/display-mode.
 *   - RLS op `profiles` ("Users can manage own profile" FOR ALL USING (auth.uid() = id))
 *     dwingt eigen-rij af als tweede slot naast de expliciete `.eq('id', user.id)`.
 *
 * Body-grootte wordt begrensd (scenario-prefs zijn klein; een megabyte JSON hoort hier
 * nooit). Geen GET nodig — de loader levert de initiële data. Geen PII gelogd.
 */

// De prefs-blob is klein (enkele sliders + max 6 categorie-delta's + wat vlaggen).
// 8 KB is ruim; alles groter is per definitie geen geldige scenario-payload.
const MAX_BODY_BYTES = 8 * 1024

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Body-grootte begrenzen vóór het parsen. Content-Length is een hint; de echte
  // grens leggen we op de gelezen tekst zodat een ontbrekende/foute header niet ontsnapt.
  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Verzoek te groot' }, { status: 413 })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Verzoek te groot' }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // Enige schrijf-poort: de defensieve parser (clamps, whitelist, versiecheck).
  // null ⇒ geen geldige prefs ⇒ 400 (nooit rauwe body naar de kolom).
  const prefs = parseToekomstScenarioPrefs(body)
  if (!prefs) {
    return NextResponse.json({ error: 'Ongeldige scenariovoorkeuren' }, { status: 400 })
  }

  // Own-row VOLLEDIGE overwrite — uitsluitend de eigen rij (RLS + expliciete eq),
  // geen service-role. De kolom is exclusief van deze feature.
  const { error } = await supabase
    .from('profiles')
    .update({ toekomst_scenario_prefs: prefs })
    .eq('id', user.id)

  if (error) {
    // Geen PII/kolom-inhoud loggen — alleen dat het schrijven faalde.
    console.error('[/api/toekomst-scenario PUT] update mislukt:', error.code)
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
