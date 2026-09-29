// ── De twee keuzes van de lezer over zijn Krant (1C fase 2) ──────────────────
//
// 1. VARIANT (B40 + besluit 28-09 "terugweg = direct wissen"): een
//    Geheel-account met AI kan de AI-Krant kiezen in plaats van de tijdlijn.
//    Dan wordt de tijdlijn DIRECT gewist (`wisTijdlijn`). Terug naar de
//    tijdlijn = de variant leeg (de standaard, B40); de volgende verversing
//    begint opnieuw. `krant_variant` schrijft alleen de service-role
//    (kolomgrant, migratie 20261004120000), dus deze functie is het enige
//    schrijfpad — altijd met de id uit de sessie.
//
// 2. BEZWAAR tegen verwerking op de achtergrond (grondslag gerechtvaardigd
//    belang, art. 6 lid 1 sub f; art. 21 AVG — besluit 28-09, grondslag B).
//    Het bezwaar staat op profiles.krant_schaduw_bezwaar_at, zodat een reset
//    het niet opheft (security Y1 fase 1). Bij bezwaar:
//      · de weekcron (schaduwedities) én de dagelijkse tijdlijncron slaan de
//        lezer over — geen automatische profilering meer;
//      · de bestaande schaduwedities worden gewist;
//      · leest de lezer de tijdlijn niet (AI-Krant, of de tijdlijn is voor
//        hem nog dicht), dan heeft het nieuwsprofiel geen doel meer en gaan
//        de banden weg (`wisBandenZonderDoel`, ook na een latere variantkeuze);
//        de keuze `krant_variant` blijft staan (anders sprong hij stil terug
//        naar de tijdlijn). Leest hij de tijdlijn wél, dan blijft het profiel:
//        de vernieuwknop (zijn eigen verzoek) gebruikt het.
//    Intrekken zet de kolom op null; de volgende weekrun leidt weer af.
//
// Service-role omdat het wissen over krant_edities loopt (geen sessie-policy
// op schrijven, wel op delete — maar de variant-kolom moet toch via de
// service). Elke query draagt `.eq('user_id'|'id', userId)`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { wisTijdlijn } from './tijdlijn-run'
import { aiKrantToegestaan, bepaalKrantBron } from './tijdlijn-bron'
import { inTijdlijnBeta } from './tijdlijn-beta'

export type GekozenVariant = 'ai' | 'tijdlijn'

export interface VariantUitkomst {
  variant: 'ai' | null
  /** Aantal gewiste verversingen van de tijdlijn (bij 'ai'). */
  gewist: number
  /** De banden gingen weg: bezwaar staat en de lezer leest nu geen tijdlijn meer. */
  profielGewist: boolean
}

export async function zetKrantVariant(service: SupabaseClient, userId: string, gekozen: GekozenVariant): Promise<VariantUitkomst> {
  const variant = gekozen === 'ai' ? 'ai' : null
  const { error } = await service
    .from('nieuwsprofiel')
    .upsert({ user_id: userId, krant_variant: variant, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw new Error(`[krant/tijdlijn-keuzes] variant schrijven mislukt: ${error.message}`)
  const gewist = variant === 'ai' ? await wisTijdlijn(service, userId) : 0
  // Bezwaar en daarna de AI-Krant kiezen = de banden hebben geen doel meer
  // (security Y2, 29-09): dezelfde toets als na een bezwaar.
  const profielGewist = await wisBandenZonderDoel(service, userId)
  return { variant, gewist, profielGewist }
}

/** De bandvelden van het nieuwsprofiel — wat de afleiding schrijft (profiel-afleiding.ts). */
const BANDVELDEN = [
  'geboortejaar',
  'huishouden',
  'kinderen',
  'werk',
  'inkomen',
  'wonen',
  'hypotheek_restschuld',
  'hypotheek_rentevast',
  'woonplan',
  'spaargeld',
  'beleggingen',
  'beleggingen_vorm',
  'schulden',
  'pensioen_werkgever',
  'pensioen_lijfrente',
] as const

export interface BezwaarUitkomst {
  bezwaar: boolean
  schaduwGewist: number
  profielGewist: boolean
}

export async function zetSchaduwBezwaar(service: SupabaseClient, userId: string, bezwaar: boolean, now = new Date()): Promise<BezwaarUitkomst> {
  const { error } = await service
    .from('profiles')
    .update({ krant_schaduw_bezwaar_at: bezwaar ? now.toISOString() : null })
    .eq('id', userId)
  if (error) throw new Error(`[krant/tijdlijn-keuzes] bezwaar schrijven mislukt: ${error.message}`)
  if (!bezwaar) return { bezwaar, schaduwGewist: 0, profielGewist: false }

  const { count, error: wisFout } = await service.from('krant_edities').delete({ count: 'exact' }).eq('user_id', userId).eq('bron', 'schaduw')
  if (wisFout) throw new Error(`[krant/tijdlijn-keuzes] schaduwedities wissen mislukt: ${wisFout.message}`)

  const profielGewist = await wisBandenZonderDoel(service, userId, now)
  return { bezwaar, schaduwGewist: count ?? 0, profielGewist }
}

/**
 * Wist de banden van het nieuwsprofiel als ze geen doel meer hebben: er staat
 * een bezwaar (geen proefedities meer) EN /nieuws is voor deze lezer niet de
 * tijdlijn — AI-Krant, of 'wacht' / dichte vlag. Toetst de WERKELIJKE bron via
 * bepaalKrantBron, niet de opgeslagen variant, en draait na beide keuzes,
 * zodat de klikvolgorde (eerst bezwaar, dan AI-Krant) de invariant niet breekt
 * (security Y2, 29-09). Ook zelf ingevulde velden gaan mee (herkomst leeg):
 * /privacy 2.4 sectie 6 belooft "dan ook je nieuwsprofiel". krant_variant en
 * tijdlijn_gelezen_tot blijven: dat zijn keuzes, geen afgeleide gegevens.
 */
export async function wisBandenZonderDoel(service: SupabaseClient, userId: string, now = new Date()): Promise<boolean> {
  const [pr, np] = await Promise.all([
    service.from('profiles').select('role, active_modules, active_subscriptions, ai_enabled, krant_schaduw_bezwaar_at').eq('id', userId).maybeSingle(),
    service.from('nieuwsprofiel').select('krant_variant').eq('user_id', userId).maybeSingle(),
  ])
  if (pr.error) throw new Error(`[krant/tijdlijn-keuzes] profiel lezen mislukt: ${pr.error.message}`)
  if (np.error) throw new Error(`[krant/tijdlijn-keuzes] variant lezen mislukt: ${np.error.message}`)
  if (!pr.data || !np.data || pr.data.krant_schaduw_bezwaar_at == null) return false
  const bron = bepaalKrantBron({
    krantAccount: isNewsOnly(resolveActiveModules(pr.data)),
    variant: np.data.krant_variant === 'ai' ? 'ai' : null,
    inBeta: inTijdlijnBeta(pr.data.role as string | null),
    aiToegestaan: aiKrantToegestaan(pr.data),
  })
  if (bron === 'tijdlijn') return false
  const leeg = Object.fromEntries(BANDVELDEN.map((v) => [v, null]))
  const { error } = await service
    .from('nieuwsprofiel')
    .update({ ...leeg, rubrieken: null, herkomst: {}, afgeleid_at: null, updated_at: now.toISOString() })
    .eq('user_id', userId)
  if (error) throw new Error(`[krant/tijdlijn-keuzes] profiel wissen mislukt: ${error.message}`)
  return true
}
