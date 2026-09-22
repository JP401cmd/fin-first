import { createClient } from '@/lib/supabase/server'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { leverToLeverageStatus } from '@/lib/page-status/resolve'
import { hefboomOordeelzin, HEFBOOM_ONDERWERP } from '@/lib/hefboom-oordeelzin'
import { PageVerdictSentence } from '@/components/editorial'
import type { Perspective } from '@/lib/household-data'

/**
 * De rest van de kop-zin van /overzicht/budget, als eigen async server-child
 * achter een `<Suspense>` ín de kop (ADR 0174 D6).
 *
 * De kop staat met het onderwerp "Je budget" al in de eerste byte; dit
 * component levert de rest ("is *op koers*."). Zo groeit de kop tot
 * een zin in plaats van te verspringen, en blijft de LCP-kandidaat dataloos.
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
 * BIJ `neutral`: "is *nog niet te beoordelen*", niet "nog niet in beeld". Deze
 * pagina toont altijd een cijferblok ("Nog te besteden €1.850"), en de
 * cashflow-hefboom staat op `neutral` zodra er nog geen spaarquote én geen
 * budget is — een nieuwe gebruiker met een profielinschatting dus. "Nog niet in
 * beeld" bóven zijn eigen bedragen is de tegenspraak die UR3-17 #8 opleverde
 * (zie `HEFBOOM_OORDEELZIN.cashflow.neutral`).
 */
export async function BudgetVerdict({ perspective }: { perspective: Perspective }) {
  const supabase = await createClient()
  const { scores } = await loadLeverScores(supabase, perspective)

  const status = leverToLeverageStatus(scores.cashflow.status)

  return (
    <PageVerdictSentence
      sentence={hefboomOordeelzin('cashflow', status)}
      tone={status}
      subject={HEFBOOM_ONDERWERP.cashflow}
    />
  )
}
