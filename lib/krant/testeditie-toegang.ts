// ── Wie mag de testsectie op /nieuws zien ────────────────────────────────────
//
// Keuze 12 op kaart 1B: de itemcontrole van de schaduweditie loopt via een
// testsectie op /nieuws. GEEN uitzondering op ADR 0146. De schaduweditie zelf
// blijft tot 1C onzichtbaar voor gewone lezers.
//
// 22 sep 2026 — restrictie tot SUPERADMIN, `is_demo_user` bewust NIET meer
// als signaal: de security- en code-eindreview van fase 3 (bevindingen Y1/H1)
// toonden dat `profiles.is_demo_user` géén betrouwbaar testaccount-predicaat
// is — elke ingelogde gebruiker kan hem op zichzelf zetten via
// `POST /api/onboarding/seed` (vereist alleen `onboarding_completed === false`,
// geen rol-check) gevolgd door `POST /api/onboarding/reset`. Dat brak zowel de
// belofte "geen gewone lezer ziet dit" als de k=5/ongedrukte-scheiding die de
// weekcron (`app/api/krant/cron/route.ts`) op dezelfde vlag baseert. Tot er een
// echt testaccount-predicaat is (bv. e-maildomein, of een vlag die alleen
// beheer kan zetten) is superadmin-only de veilige ondergrens — geen datalek
// in de vorige versie (own-row-RLS hield al stand), wel een requirement-gat.
//
// Server-page beslist of de sectie überhaupt rendert, de API-route beslist of
// hij data teruggeeft. Eén helper voor twee plekken; twee losse checks zouden
// uit elkaar lopen.
//
// `role` staat op de toegestane kolomlijst van de ADR 0146-gate
// (PROFIEL_KOLOMMEN) — hier wordt geen inhoud gelezen, alleen de vraag "mag
// jij dit zien".

import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPERADMIN_ROLE } from '@/lib/admin'

/**
 * `true` voor een superadmin. Faalt de lezing, dan `false` (fail-closed):
 * liever geen testsectie dan een testsectie bij twijfel.
 *
 * Bewust niet `isSuperAdmin()` erbovenop: deze helper draait op elke
 * /nieuws-render, ook voor gewone lezers die het antwoord altijd "nee"
 * krijgen. Eén profiel-roundtrip (plus een tweede `auth.getUser()`) op die
 * route is al prijzig voor een vraag die één rij beantwoordt. De
 * rolvergelijking deelt de constante met `isSuperAdmin`, dus er staat geen
 * tweede definitie van "wie is beheerder".
 */
export async function magTesteditieZien(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error || !data) return false
  return data.role === SUPERADMIN_ROLE
}
