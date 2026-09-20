import { createClient } from '@/lib/supabase/server'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { leverToLeverageStatus } from '@/lib/page-status/resolve'
import { hefboomVerdict, HEFBOOM_VERDICT_NEUTRAL_MET_CIJFER } from '@/lib/hefboom-status-copy'
import { PageVerdictSuffix } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * Het oordeel in de paginatitel van /overzicht/budget, als eigen async
 * server-child achter een `<Suspense>` ín de kop.
 *
 * DEZELFDE BRON ALS HET STATUSPUNT ERNAAST. De stip op deze route komt uit
 * `resolvePageStatusMap` → `leverInfo('/overzicht/budget', scores.cashflow)`,
 * dus uit de cashflow-HEFBOOM — niet uit de Budget-kaart. Zou de titel de
 * kaartstatus gebruiken (die is client-side goedkoper beschikbaar via
 * `CashflowStatusProvider`), dan kunnen titel en stip op hetzelfde scherm
 * verschillende dingen zeggen. Vandaar deze loader, en niet de goedkopere.
 *
 * `loadLeverScores` is React-`cache()`-gewrapt en draait op deze route toch al
 * — dit kost dus geen extra queries.
 *
 * De ZIN komt uit `hefboomVerdict('cashflow', …)`, dezelfde bron als de
 * hefboomtegel op /overzicht.
 *
 * BIJ `neutral`: "Nog geen OORDEEL", niet "Nog geen gegevens". Deze pagina toont
 * altijd een cijferblok ("Nog te besteden €1.850"), en de cashflow-hefboom staat
 * op `neutral` zodra er nog geen spaarquote én geen budget is — een nieuwe
 * gebruiker met een profielinschatting dus. "Nog geen gegevens" bóven zijn eigen
 * bedragen is de tegenspraak die UR3-17 #8 opleverde; `HEFBOOM_VERDICT_NEUTRAL`
 * hoort bij een tegel zónder getal.
 */
export async function BudgetVerdict({ perspective }: { perspective: Perspective }) {
  const supabase = await createClient()
  const { scores } = await loadLeverScores(supabase, perspective)

  const status = leverToLeverageStatus(scores.cashflow.status)
  const label = hefboomVerdict('cashflow', status) ?? HEFBOOM_VERDICT_NEUTRAL_MET_CIJFER

  return <PageVerdictSuffix verdict={label} tone={status} />
}
