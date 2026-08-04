import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'

/**
 * DELETE /api/debts/[id] — een schuld definitief verwijderen, mét zijn
 * waardehistorie.
 *
 * Vorm en redenering zijn gespiegeld op `app/api/bank-accounts/[id]/route.ts`;
 * de opruim-volgorde (kinderen eerst, dan de entiteit) op de DELETE-handler van
 * `app/api/onboarding/aangifte-import/route.ts`.
 *
 * ## Waarom dit een route werd en geen client-delete bleef
 *
 * `components/app/core/debts/debt-pane.tsx` deed `createClient()` +
 * `.from('debts').delete().eq('id', …)` vanuit de browser — zonder
 * `user_id`-filter en zonder `.select()`. Naast de conventie-overtreding
 * (ADR 0058: muteren gaat via een API-route) was dat stil kapot: een gedeelde
 * schuld van de partner wordt door de huishoud-verbrede SELECT-policy gewoon
 * als klikbare kaart getoond, terwijl de DELETE-policy strikt eigen-rij is
 * (`auth.uid() = user_id`). RLS blokkeerde de verwijdering, maar `.delete()`
 * zónder `.select()` geeft bij 0 geraakte rijen `error: null`: succes-toast,
 * pane dicht, niets gebeurd. Stap 2 en 5 hieronder maken daar een eerlijke 404
 * van.
 *
 * ## Waarom HARD delete en geen `is_active = false`
 *
 * Op `debts` is `is_active = false` al bezet voor een héél andere betekenis:
 * "afgelost". Zie `components/app/core/debts/debt-form.tsx:313-319` en
 * `debt-valuation-modal.tsx:81-84`, die de vlag op false zetten zodra het saldo
 * op nul staat. Zou verwijderen óók op die vlag mappen, dan zijn "afgelost" en
 * "weggegooid" niet meer te onderscheiden — en toont
 * `loadCategoryHistory(..., includeInactive: true)` een weggegooide schuld
 * alsnog als grijze reeks in de categoriegrafiek. Precies het spook-item waar
 * `lib/load-category-history.ts:343-350` tegen beschermt. Bezittingen gaan om
 * de omgekeerde reden juist wél soft weg (zes CASCADE-kinderen); zie de
 * docblock van `app/api/assets/[id]/route.ts`.
 *
 * ## Waarom de snapshots en waarderingen hier expliciet mee weg gaan
 *
 * De bevestigingstekst in de pane belooft dat "alle bijbehorende
 * waardehistorie en koppelingen definitief worden verwijderd". Dat was tot nu
 * toe onwaar: `valuations` en `balance_snapshots` verwijzen polymorf
 * (`entity_type` + `entity_id`) en hebben dus GEEN foreign key naar `debts` —
 * er is niets dat cascadeert, de rijen bleven als zwerfrijen achter. Deze route
 * maakt de belofte waar, en zet daarmee het beleid voort van migratie
 * `supabase/migrations/20260505000001_cleanup_orphan_balance_snapshots.sql`:
 * bewust géén FK-CASCADE toevoegen (de tijdreeks moet een eigen levensvorm
 * houden voor afgesloten items), maar zwerfrijen van fysiek verwijderde
 * entiteiten wél opruimen. De copy hoefde daarvoor niet te wijzigen.
 *
 * RLS dekt beide opruim-queries: `Users can delete own balance snapshots` en
 * `Users can delete own valuations` zijn eigen-rij DELETE-policies voor
 * `authenticated`. De anon RLS-client volstaat; service-role is nergens nodig.
 * Beide draaien op geïndexeerde kolommen (`idx_balance_snapshots_entity` op
 * `(entity_type, entity_id)`; op `valuations` de unieke index op
 * `(entity_id, valuation_date)`).
 *
 * ## Padresolutie
 *
 * `app/api/debts/` bevat verder alleen het statische segment
 * `toggle-hypotheekplanner` en geen `route.ts` op mapniveau. Next.js resolvet
 * statische segmenten vóór dynamische, dus `[id]` vangt die route niet af —
 * zelfde patroon als `app/api/budgets/[id]` en `app/api/holdings/[id]`. Geen
 * reden om hier iets aan te "repareren".
 *
 * ## Bekend restrisico (NIET gedekt door deze route)
 *
 * `app/api/onboarding/save-own-data/route.ts:1056-1108` hard-delete't assets en
 * debts in bulk zónder deze opruiming. De garantie hierboven geldt dus voor de
 * gebruikersactie "verwijder deze schuld", niet app-breed.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Anon RLS-client mét de sessie van de aanroeper — nooit service-role.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    // Vorm-controle vóór de query. Bewust `notFound` en niet `badRequest`: een
    // malformed id gaf anders een 500 (Postgres weigert de uuid-cast) waar 404
    // hoort, en 404 lekt niets — het antwoord is identiek aan dat voor een
    // bestaand id van iemand anders.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return notFound('Schuld niet gevonden')
    }

    // 1. Eigenaarscontrole VÓÓR de opruiming. Anders zou een verzoek op een
    //    gedeelde schuld van de partner wél de (eigen-rij) snapshots proberen
    //    te wissen terwijl de schuld zelf blijft staan.
    const { data: owned, error: ownerError } = await supabase
      .from('debts')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    // Niet `throw`: een Supabase `PostgrestError` is een plain object en zou
    // via `err instanceof Error` als "[object Object]" gelogd worden.
    if (ownerError) return serverError(ownerError, 'debts:DELETE')
    if (!owned) return notFound('Schuld niet gevonden')

    // 2. De schuld zelf gaat EERST, en dat is een bewuste keuze over de
    //    faalrichting.
    //
    //    Dit zijn drie losse PostgREST-calls; supabase-js heeft geen
    //    transactie-API, dus een onderbreking halverwege (statement timeout op
    //    een lange waardehistorie, connection reset, lambda-timeout) laat altijd
    //    een halve toestand achter. De vraag is niet óf dat kan, maar welke
    //    halve toestand je dan wilt.
    //
    //    Kinderen eerst — de voor de hand liggende volgorde — laat bij een
    //    onderbreking de schuld staan terwijl de complete waardehistorie weg is.
    //    Onherstelbaar, en de gebruiker ziet alleen "Verwijderen mislukt".
    //    Andersom laat een onderbreking zwerfrijen achter in `valuations` en
    //    `balance_snapshots`: onzichtbaar (`lib/load-category-history.ts`
    //    filtert ze al weg) en opruimbaar — er bestaat zelfs beleid voor,
    //    `supabase/migrations/20260505000001_cleanup_orphan_balance_snapshots.sql`.
    //    Verwijderbare rommel is beter dan vernietigde historie.
    //
    //    (Waarom hier geen RPC zoals bij `bank_accounts`: daar dwong de
    //    CASCADE-cascade op `transactions` atomiciteit af omdat een half pad
    //    andermans data raakt. Hier hangen alleen eigen, polymorf gekoppelde
    //    rijen aan de schuld, zonder FK en dus zonder cascade. Een RPC zou hier
    //    netter zijn maar lost niets op wat deze volgorde niet al afdekt.)
    const { data, error } = await supabase
      .from('debts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()

    if (error) return serverError(error, 'debts:DELETE')
    // 0 geraakte rijen ná een geslaagde eigenaarscontrole = race (parallel
    // verwijderd). Eerlijke 404 i.p.v. een valse succesmelding.
    if (!data) return notFound('Schuld niet gevonden')

    // 3. Opruimen van de polymorf gekoppelde historie. Beide tabellen hangen aan
    //    de schuld via `entity_type`/`entity_id` zónder foreign key, dus er
    //    cascadeert niets — expliciet dus. Volgorde van deze twee onderling doet
    //    er niet toe.
    //
    //    BEST-EFFORT, met opzet: de schuld is hierboven al weg, dus de opdracht
    //    van de gebruiker is uitgevoerd. Zou een mislukte opruiming hier een
    //    500 geven, dan meldt de UI "Verwijderen mislukt" over iets dat wél is
    //    gelukt — en een tweede poging levert een 404. Loggen en doorgaan is
    //    eerlijker; wat blijft staan is onzichtbare rommel, geen fout.
    const { error: snapshotError } = await supabase
      .from('balance_snapshots')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'debt')
      .eq('entity_id', id)
    if (snapshotError) {
      console.error('[debts:DELETE] balance_snapshots niet opgeruimd (schuld is wél verwijderd):', snapshotError)
    }

    const { error: valuationError } = await supabase
      .from('valuations')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'debt')
      .eq('entity_id', id)
    if (valuationError) {
      console.error('[debts:DELETE] valuations niet opgeruimd (schuld is wél verwijderd):', valuationError)
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return serverError(err, 'debts:DELETE')
  }
}
