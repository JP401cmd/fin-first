/**
 * Auto-afsluiten van doelen die hun doelwaarde LIVE hebben gehaald.
 *
 * ## Het gat dat dit dicht
 * Sinds de doelen-uitbreiding kan de `current_value` van een doel live meelopen
 * met een canonieke motor: metric-doelen (`metadata.sync === 'auto'`) en doelen
 * met koppelingen (`goal_links`, of de legacy-kolommen). `syncActiveGoalValues`
 * (lib/goal-current-value.ts) berekent die waarde IN-MEMORY bij elke pageload en
 * schrijft niets terug. Er bestond daarnaast geen enkel server-pad dat
 * `goals.is_completed` AFLEIDT — de enige schrijvers zijn de bewerk-sheet
 * (gebruikersactie) en `app/api/goals` (alleen als de client de vlag expliciet
 * meestuurt).
 *
 * Gevolg: een auto-syncend doel dat zijn doel HAALT bleef eeuwig
 * `is_completed = false`. De mijlpalenmotor consumeert `finData.completedGoals`
 * (= `is_completed`), dus er kwam geen `doel-behaald`-rij, geen tijdlijnregel op
 * `/mijn/mijlpalen`, geen briefing-item en geen viering. De belofte "je doel
 * loopt mee" eindigde in stilte.
 *
 * ## De harde grens: alleen machine-bijgehouden doelen
 * Een doel waarvan de gebruiker de waarde ZELF bijhoudt wordt hier NOOIT
 * aangeraakt. Dat afsluiten is een gebruikersactie in de bewerk-sheet en blijft
 * dat. Deze module sluit uitsluitend doelen af waarvan de waarde per constructie
 * uit een motor of uit gekoppelde bezittingen/schulden komt — zie
 * `isMachineTrackedGoal`.
 *
 * ## Bereikt-toets: uitsluitend `isGoalReached`
 * Nooit een eigen `>=`. Bij de omlaag-doelen (`fire_age`, `debt_free_date`,
 * `tax_burden`) betekent behalen juist ONDER de doelwaarde zakken; een kale
 * vergelijking levert daar twee tegengestelde fouten tegelijk (ADR 0125).
 * `isGoalReached` (lib/goal-data.ts) is de ene richting-bewuste toets, en die
 * toets is ook wat het scherm gebruikt om "100%" te tonen.
 *
 * ## Waarom GEEN marge tegen marktschommelingen (bewuste keuze)
 * Een netto-gemengd doel (Σ bezittingen − Σ schuldsaldi) kan door een
 * marktbeweging éénmalig over de streep komen en daarna weer zakken. De
 * verleiding is dan een drempel ("pas afsluiten bij 100,5 %"). Dat doen we niet:
 *
 *  1. Een marge maakt een TWEEDE waarheid. Het scherm toont het doel al als
 *     behaald zodra `isGoalReached` waar is; sluit de server pas bij 100,5 %,
 *     dan staat er een doel op "behaald" dat niet afsluit — precies de stille
 *     afloop die deze module moet opheffen, alleen 0,5 % verderop.
 *  2. Een marge is niet uit te drukken. Wat is 0,5 % op een schuldenvrij-DATUM
 *     in decimale jaren, op maanden noodfonds, op een belastingdruk in
 *     procentpunten? Elke keuze zou per doeltype anders en dus arbitrair zijn.
 *  3. De kosten zijn asymmetrisch. Te vroeg afsluiten kost: het doel verhuist
 *     naar het Bereikt-archief (de bewerk-sheet kan het heropenen — hij kent een
 *     `justReopened`-tak die `completed_at` weer wist) en er komt één rij in het
 *     append-only mijlpalenlogboek die er een maand later toch was gekomen. Niet
 *     afsluiten kost: de belofte van de hele functionaliteit.
 *
 * ## Idempotent, zuinig en veilig tegen races
 * Eén UPDATE-statement over de te sluiten ids, met `.eq('user_id', userId)` én
 * `.eq('is_completed', false)` erop. Die tweede filter is niet decoratief: bij
 * twee parallelle renders wint er precies één, en de verliezer krijgt NUL rijen
 * terug. De teruggegeven rijen zijn dus letterlijk "wat DEZE render heeft
 * afgesloten" — geen dubbele mijlpaal, geen dubbele viering. Valt er niets af te
 * sluiten, dan draait er geen enkele query.
 *
 * Nooit service-role: alles loopt via de meegegeven anon-RLS-client, die op
 * `auth.uid() = user_id` scopet. De expliciete `user_id`-filter is
 * defence-in-depth (de doelenlijst is huishoud-gescoopt, dus er kunnen
 * partner-rijen in zitten die hier nooit geraakt mogen worden).
 *
 * Nooit fataal: elke fout wordt zacht gelogd en levert `[]`. Een mislukte
 * afsluiting is een gemiste viering, geen kapotte pagina — zelfde regel als
 * `lib/milestones/run.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isGoalReached, type GoalType } from '@/lib/goal-data'
import {
  isAutoSyncMetricGoal,
  isParameterGoal,
  type GoalLinkRow,
} from '@/lib/goal-current-value'

/**
 * Minimale velden die deze module leest. `Goal`/`GoalWithBudget` voldoen
 * hieraan; `user_id` is bewust VERPLICHT — zonder eigenaar kan de own-row-grens
 * niet worden getoetst en mag er niets geschreven worden.
 */
export type ReconcilableGoal = {
  id: string
  user_id: string
  name: string
  goal_type: GoalType
  current_value: number
  target_value: number
  is_completed?: boolean
  completed_at?: string | null
  metadata?: Record<string, unknown> | null
  linked_asset_id?: string | null
  linked_debt_id?: string | null
}

/** Eén door de server afgesloten doel, plat en serialiseerbaar (RSC-prop). */
export interface AutoCompletedGoal {
  id: string
  name: string
  goalType: GoalType
  /** ISO-tijdstip van afsluiten; `null` alleen als de DB het niet teruggaf. */
  completedAt: string | null
}

/**
 * Hoe lang een server-afgesloten doel nog als "nog te vieren" wordt aangeboden
 * aan het doelen-scherm. Bewust een WEERGAVE-venster (geen financiële aanname):
 * de viering hoort bij het moment, en een doel dat drie maanden geleden
 * automatisch sloot hoort in het Bereikt-archief en op de mijlpalen-tijdlijn,
 * niet in een confetti-overlay.
 */
export const AUTO_COMPLETED_NOTICE_WINDOW_DAYS = 14

/**
 * De goal-ids met ≥1 BRUIKBARE koppelrij. Spiegelt de defensieve lezing van
 * `autolinkGoalCurrentValues`: de DB-CHECK garandeert precies één van
 * `asset_id`/`debt_id`, maar een rij die daar niet aan voldoet is onbruikbaar en
 * telt hier dus niet mee.
 */
export function linkedGoalIdSet(links: readonly GoalLinkRow[] | undefined): Set<string> {
  const set = new Set<string>()
  for (const row of links ?? []) {
    if (!row?.goal_id) continue
    const isAsset = row.asset_id != null && row.debt_id == null
    const isDebt = row.debt_id != null && row.asset_id == null
    if (isAsset || isDebt) set.add(row.goal_id)
  }
  return set
}

/**
 * Wordt de waarde van dit doel door een MACHINE bijgehouden (en dus niet door de
 * gebruiker)? Alleen dán mag de server het doel afsluiten.
 *
 * Drie bronnen tellen mee, in oplopende ouderdom:
 *  - `metadata.sync === 'auto'` — een metric-doel op een canonieke motor.
 *  - een rij in `goal_links` — één of meer bezittingen/schulden.
 *  - de legacy-kolommen `linked_asset_id`/`linked_debt_id`. Die worden niet meer
 *    geschreven maar staan nog gevuld op niet-gemigreerde rijen, en
 *    `autolinkGoalCurrentValues` overschrijft hun `current_value` net zo goed.
 *    Ze overslaan zou een hele klasse live-getrackte doelen eeuwig open laten —
 *    dezelfde bug, andere kolom.
 *
 * PARAMETER-DOELEN VALLEN ER EXPLICIET BUITEN. Een lab-gegenereerd doel
 * (`metadata.bron === 'parameter'`) is een read-only doelSITUATIE uit
 * /toekomst — een scenario-instelling, geen persoonlijk doel dat je "haalt".
 * Het afsluiten ervan zou de doelsituatie stilletjes uit het lab halen. Zelfde
 * uitsluiting als de checkpoint-guard op /overzicht hanteert.
 */
export function isMachineTrackedGoal(
  goal: ReconcilableGoal,
  linkedGoalIds: ReadonlySet<string>,
): boolean {
  if (isParameterGoal(goal)) return false
  return (
    isAutoSyncMetricGoal(goal) ||
    linkedGoalIds.has(goal.id) ||
    goal.linked_asset_id != null ||
    goal.linked_debt_id != null
  )
}

/**
 * Welke van deze (reeds gesynchroniseerde) doelen zijn feitelijk bereikt en nog
 * niet afgesloten? Pure selectie — geen IO, apart testbaar.
 *
 * De `user_id`-filter is geen formaliteit: de doelenlijst uit `loadFinData` is
 * huishoud-gescoopt (own-or-shared), dus er kunnen doelen van de partner in
 * zitten. Die sluiten we nooit af, ook niet als ze bereikt zijn — dat is aan de
 * eigenaar zelf.
 */
export function selectReachedAutoGoals<T extends ReconcilableGoal>(
  goals: readonly T[],
  userId: string,
  linkedGoalIds: ReadonlySet<string>,
): T[] {
  return goals.filter(
    (g) =>
      !!g?.id &&
      g.user_id === userId &&
      !g.is_completed &&
      isMachineTrackedGoal(g, linkedGoalIds) &&
      isGoalReached(g.goal_type, Number(g.current_value), Number(g.target_value)),
  )
}

/**
 * Doelen die de SERVER heeft afgesloten en die het doelen-scherm nog één keer
 * mag vieren.
 *
 * Waarom afgeleid en niet "wat deze render sloot": de reconcile draait op één
 * plek (/overzicht), maar de viering hoort op het doelen-scherm. Zou de lijst
 * alleen de rijen van DEZE render bevatten, dan verdween de viering zodra een
 * ander oppervlak het doel als eerste sloot — opnieuw een stille afloop. Het
 * criterium is daarom een stand, geen gebeurtenis: machine-bijgehouden + recent
 * afgesloten.
 *
 * Dubbel vieren wordt aan de clientkant afgevangen: `MilestoneCelebration`
 * draagt een localStorage-once-guard op `goal-reached:<id>`, en dat is dezelfde
 * sleutel die de bewerk-sheet-viering zet. Een doel dat de gebruiker zélf
 * afsloot is dus al gemarkeerd tegen de tijd dat deze lijst het aanbiedt.
 */
export function selectAutoCompletedNotices<T extends ReconcilableGoal>(
  goals: readonly T[],
  userId: string | null,
  linkedGoalIds: ReadonlySet<string>,
  now: Date = new Date(),
): AutoCompletedGoal[] {
  if (!userId) return []
  const floor = now.getTime() - AUTO_COMPLETED_NOTICE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return goals
    .filter((g) => {
      if (!g?.id || g.user_id !== userId || !g.is_completed) return false
      if (!isMachineTrackedGoal(g, linkedGoalIds)) return false
      const at = g.completed_at ? Date.parse(g.completed_at) : NaN
      // Geen (of onleesbare) datum ⇒ we weten niet of het vers is en vieren dus
      // niet. Een gemiste viering is beter dan een viering voor iets van vorig
      // jaar.
      return Number.isFinite(at) && at >= floor
    })
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .map((g) => ({
      id: g.id,
      name: g.name,
      goalType: g.goal_type,
      completedAt: g.completed_at ?? null,
    }))
}

/**
 * Sluit de doelen af die hun doelwaarde live hebben gehaald, en geef terug wat
 * DEZE aanroep heeft afgesloten (id + naam + type + tijdstip), zodat de
 * aanroeper ze in dezelfde render aan de mijlpalenmotor kan doorgeven.
 *
 * Muteert de meegegeven doel-objecten in-place (`is_completed`/`completed_at`) —
 * hetzelfde idioom als `autolinkGoalCurrentValues`. Zonder die mutatie zou de
 * lopende render een doel nog als actief behandelen terwijl de DB het al gesloten
 * heeft; op /overzicht zou het dan bijvoorbeeld nog een voortgangs-checkpoint
 * kunnen oplopen.
 *
 * @param supabase      anon-RLS-client (server), NOOIT service-role
 * @param userId        eigenaar; alleen zijn eigen doelen worden geraakt
 * @param goals         de REEDS gesynchroniseerde actieve doelen
 * @param linkedGoalIds goal-ids met ≥1 `goal_links`-rij (`linkedGoalIdSet`)
 */
export async function reconcileAutoCompletedGoals<T extends ReconcilableGoal>(
  supabase: SupabaseClient,
  userId: string | null,
  goals: readonly T[],
  linkedGoalIds: ReadonlySet<string> = new Set<string>(),
  now: Date = new Date(),
): Promise<AutoCompletedGoal[]> {
  if (!userId) return []
  try {
    const reached = selectReachedAutoGoals(goals, userId, linkedGoalIds)
    // Zuinigheid + idempotentie: niets te markeren ⇒ geen query. Dit is het
    // normale geval bij vrijwel elke pageload.
    if (reached.length === 0) return []

    const completedAt = now.toISOString()
    const { data, error } = await supabase
      .from('goals')
      .update({ is_completed: true, completed_at: completedAt })
      .in(
        'id',
        reached.map((g) => g.id),
      )
      // Own-row (defence-in-depth naast RLS) + race-guard: bij twee parallelle
      // renders raakt precies één de rij, de ander krijgt niets terug.
      .eq('user_id', userId)
      .eq('is_completed', false)
      .select('id, name, goal_type, completed_at')

    if (error) {
      console.error('[goals:auto-complete] afsluiten mislukt', error)
      return []
    }

    const rows = (data ?? []) as {
      id: string
      name: string
      goal_type: GoalType
      completed_at: string | null
    }[]
    const closed = new Map(rows.map((r) => [r.id, r]))
    for (const goal of reached) {
      const row = closed.get(goal.id)
      if (!row) continue
      goal.is_completed = true
      goal.completed_at = row.completed_at ?? completedAt
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      goalType: r.goal_type,
      completedAt: r.completed_at ?? completedAt,
    }))
  } catch (err) {
    console.error('[goals:auto-complete] onverwachte fout', err)
    return []
  }
}
