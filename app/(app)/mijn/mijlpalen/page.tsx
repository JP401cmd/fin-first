import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { MijlpalenTijdlijn } from '@/components/mijn/mijlpalen-tijdlijn'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import {
  buildMilestoneTimeline,
  type MilestoneGoalRef,
  type MilestoneTimelineYear,
} from '@/lib/milestones/timeline'
import type { AchievedMilestoneRow } from '@/lib/milestones/types'

export const metadata: Metadata = {
  title: 'Mijlpalen — TriFinity',
  description:
    'Dit heb je bereikt: elke gepasseerde drempel als gebeurtenis, met datum, chronologisch per jaar.',
}

/**
 * /mijn/mijlpalen — "Dit heb je bereikt".
 *
 * Server-shell conform het /mijn-subpagina-patroon (spiegel van
 * `/mijn/jaaroverzicht`): `NavStackMeta` levert de mobiele TopBar-titel én de
 * bottom-bar-kind; de titel staat óók in `EXTRA_ROUTE_TITLES`
 * (lib/nav-config.ts) zodat `resolveRouteTitle()` de bovenbalk al vult vóór de
 * boom gemount is.
 *
 * ── Datapad (ADR 0058) ─────────────────────────────────────────────────────
 * Lezen voor weergave = server-side. Twee smalle queries via de cookie-server-
 * client (anon, RLS afgedwongen — nooit service-role), met een expliciete
 * kolomlijst; géén API-route en géén client-fetch. De ordening gebeurt daarna
 * puur in `buildMilestoneTimeline`.
 *
 * `achieved_milestones` draagt eigen-rij RLS, maar de `.eq('user_id', ...)`
 * staat er expliciet bij: RLS is de vangrail, niet de scoping-verklaring van
 * dit scherm. Voor `goals` is die filter hard nodig — die tabel is
 * huishoud-gescoopt, en een partner-doelnaam mag nooit aan een eigen
 * mijlpaal-rij hangen (de naam-resolutie toetst het eigenaarschap nóg eens).
 *
 * ── Ontbrekende tabel is geen crash ────────────────────────────────────────
 * De migratie `20260831160000_add_achieved_milestones.sql` staat in de repo
 * maar draait pas bij de release. Tot dat moment geeft élke query hier 42P01
 * ("relation does not exist"). Dat wordt hier stil opgevangen als "nog geen
 * mijlpalen": de gebruiker krijgt de waardige lege staat, de fout gaat naar de
 * serverlog. Een 500 op een informatieve pagina zou het defect alleen luider
 * maken, niet kleiner.
 *
 * ── Toekomst-kant (bewuste scope-keuze v1) ─────────────────────────────────
 * De nog niet bereikte vrijheidsmijlpalen mét geprojecteerde datum staan
 * bewust NIET op deze pagina. Er bestaat geen lichte loader voor:
 * `FreedomMilestoneResult` heeft precies één producent in productiecode —
 * `lib/dashboard-data-loader.ts`, dat ~19 queries plus de unified projection en
 * de backtest draait. Die hele bundel optuigen voor één blok naast een log van
 * twee smalle queries is onevenredig. De tijdlijn verwijst daarom naar
 * `/toekomst`, waar die projectie al canoniek woont (ook het doel van de
 * `vrijheidsmijlpalen`-widget).
 */

/**
 * Expliciete kolomlijst i.p.v. `select('*')`: de kolomregel uit CLAUDE.md geldt
 * hier niet (deze tabel draagt geen `*_encrypted`/`*_hash`), maar de vorm is de
 * norm — en `AchievedMilestoneRow` is precies deze set.
 */
const MILESTONE_COLUMNS =
  'id, user_id, milestone_key, kind, threshold_value, observed_value, achieved_at, acknowledged_at, source, created_at'

export default async function MijnMijlpalenPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  const userId = user?.id ?? null

  let years: MilestoneTimelineYear[] = []
  let laadFout = false

  if (userId) {
    const [logResult, goalsResult] = await Promise.all([
      supabase
        .from('achieved_milestones')
        .select(MILESTONE_COLUMNS)
        .eq('user_id', userId)
        .order('achieved_at', { ascending: false })
        // Tweede sleutel: het detect-pad schrijft alle rijen van één run met
        // dezelfde timestamp en PostgreSQL geeft dan geen vaste volgorde.
        .order('milestone_key', { ascending: true }),
      supabase.from('goals').select('id, name, user_id').eq('user_id', userId),
    ])

    if (logResult.error) {
      // Ontbrekende tabel (42P01) vóór de release is een VERWACHTE staat —
      // warn, geen error, anders is elke paginabezoek tot de release logruis
      // en verdrinkt een échte leesfout erná. De gebruiker ziet de eerlijke
      // fout-staat ("konden je mijlpalen nu niet ophalen"), nooit "je eerste
      // mijlpaal komt nog" tegen iemand met een gevulde historie.
      laadFout = true
      if (logResult.error.code === '42P01') {
        console.warn('[mijn/mijlpalen] tabel bestaat nog niet (migratie 20260831160000):', logResult.error.message)
      } else {
        console.error('[mijn/mijlpalen] mijlpaal-log niet gelezen:', logResult.error)
      }
    } else {
      // De doelnamen zijn versiering op `doel`-rijen; valt die query weg, dan
      // blijft de copy generiek ("Doel behaald") in plaats van dat de pagina
      // leeg blijft.
      if (goalsResult.error) {
        console.error('[mijn/mijlpalen] doelnamen niet gelezen:', goalsResult.error)
      }
      const goals: MilestoneGoalRef[] = goalsResult.error ? [] : (goalsResult.data ?? [])

      years = buildMilestoneTimeline(
        (logResult.data ?? []) as unknown as AchievedMilestoneRow[],
        goals,
        userId,
        // Geen dagtarief op dit scherm: de canonieke €/dag komt uit de
        // bundel en die laden we hier bewust niet (zie de scope-noot
        // hierboven). Een eigen som is verboden (check:freedom-basis), dus
        // `null` — `buildMilestoneCopy` valt dan terug op de feitelijke zin
        // zonder vrijheidstijd-vertaling.
        null,
      )
    }
  }

  return (
    <>
      <NavStackMeta title="Mijlpalen" bottomBar={{ kind: 'tabs' }} />
      <MijlpalenTijdlijn years={years} laadFout={laadFout} />
    </>
  )
}
