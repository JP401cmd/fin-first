import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'

/**
 * DELETE /api/assets/[id] — een bezitting uit het actieve overzicht halen.
 *
 * Vorm en redenering zijn gespiegeld op `app/api/bank-accounts/[id]/route.ts`
 * (het canonieke voorbeeld voor een eigen-rij-mutatie op een huishoud-gedeelde
 * tabel).
 *
 * ## Waarom dit een route werd en geen client-update bleef
 *
 * `components/app/core/assets/asset-pane.tsx` deed dit rechtstreeks vanuit de
 * browser: `createClient()` + `.from('assets').update({ is_active: false })
 * .eq('id', …)` — zónder `user_id`-filter en zónder `.select()`. Dat is in
 * strijd met de datapad-conventie (ADR 0058: muteren gaat via een API-route),
 * maar het was bovendien stil kapot: de SELECT-policy op `assets` is
 * huishoud-verbreed, dus een gedeelde rij van de partner wordt gewoon als
 * klikbare kaart getoond. De UPDATE-policy is strikt eigen-rij
 * (`auth.uid() = user_id`), dus RLS blokkeerde de schrijfactie — maar een
 * `.update()` zónder `.select()` geeft bij 0 geraakte rijen `error: null`. De
 * gebruiker kreeg een succes-toast, de pane sloot, en er was niets gebeurd.
 * Stap 5 hieronder (`if (!data) return notFound(...)`) is precies die fix.
 *
 * ## Waarom SOFT delete (`is_active = false`) en geen hard delete
 *
 * Dit is een bewuste keuze, geen toeval. Zes tabellen hangen met
 * `ON DELETE CASCADE` aan `assets`:
 *
 *   - `crypto_holdings.asset_id`
 *   - `investment_holdings.asset_id`
 *   - `broker_connections.linked_asset_id`
 *   - `exchange_connections.linked_asset_id`
 *   - `wallet_addresses.linked_asset_id`
 *   - `_legacy_holdings.asset_id`
 *
 * Eén hard delete op een beleggings- of crypto-bezitting wist daarmee het
 * complete holdings-grootboek van dat bezit — posities, koppelingen en
 * wallet-adressen — zonder weg terug. De bevestigingstekst in de pane belooft
 * bovendien uitdrukkelijk dat de bezitting later weer toegevoegd kan worden.
 * Soft delete maakt die belofte waar. Schulden gaan om de omgekeerde reden
 * juist wél hard weg; zie de docblock van `app/api/debts/[id]/route.ts`.
 *
 * ## Waarom géén `.eq('is_active', true)` in de update
 *
 * De update filtert bewust NIET op de huidige waarde. Een tweede klik (dubbele
 * submit, herhaalde actie op een stale scherm) schrijft dan dezelfde waarde en
 * levert gewoon 200 — idempotent. Met die filter zou een herhaling een 404
 * geven op een actie die al geslaagd wás, en dat is een verwarrende fout op een
 * geslaagde uitkomst. Dit wijkt af van `app/api/budgets/[id]`, dat op "al
 * gearchiveerd" een 409 teruggeeft; daar is archiveren een expliciete
 * statuswissel met een samenvatting in de respons, hier is het een
 * verdwijn-actie waarvan alleen de einduitkomst telt. Bewust twee keuzes, niet
 * één inconsistentie — patch ze niet naar elkaar toe zonder die afweging.
 *
 * ## Padresolutie
 *
 * `app/api/assets/` bevat verder alleen statische segmenten (`account-number`,
 * `has-holdings`, `toggle-budget`, `toggle-holdings`, `toggle-rental`,
 * `toggle-woonbalans`) en geen `route.ts` op mapniveau. Next.js resolvet
 * statische segmenten vóór dynamische, dus `[id]` vangt die routes niet af. Dit
 * is hetzelfde patroon als `app/api/budgets/[id]` en `app/api/holdings/[id]`.
 * Geen reden om hier iets aan te "repareren".
 *
 * ## Bekend restrisico (NIET gedekt door deze route)
 *
 * Een soft-deleted bezitting kan door een achtergrond-sync ongevraagd
 * terugkomen: `lib/integrations/wallet-sync.ts:133-137` schrijft
 * `.update({ current_value, is_active: true })` op het gekoppelde bezit, dus de
 * eerstvolgende wallet-sync zet de vlag weer aan. `lib/holdings-sync.ts:132-136`
 * en `:176-180` blijven `current_value` schrijven zonder `is_active`-check.
 * Hier bewust benoemd zodat dit niet gedekt lijkt; het oplossen hoort bij de
 * sync-paden, niet bij deze route.
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
    // hoort — ruis in de log, verwarrend voor de client. En 404 lekt niets: het
    // antwoord is identiek aan dat voor een bestaand id van iemand anders.
    // `app/api/budgets/[id]` kiest hier `badRequest`; dat is een bewuste
    // divergentie (dat endpoint wordt door een testsuite op die 400 vastgezet),
    // geen slordigheid — patch de twee niet heen en weer.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return notFound('Bezitting niet gevonden')
    }

    const { data, error } = await supabase
      .from('assets')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()

    // Niet `throw error`: een Supabase `PostgrestError` is een plain object, dus
    // `serverError`'s `err instanceof Error`-tak logt 'm server-side als
    // "[object Object]". Direct doorgeven behoudt de echte melding in de log; de
    // client krijgt hoe dan ook de generieke tekst.
    if (error) return serverError(error, 'assets:DELETE')
    // 0 geraakte rijen = niet van deze gebruiker (of al weg). Eerlijke 404 i.p.v.
    // de valse succesmelding die de client-update gaf.
    if (!data) return notFound('Bezitting niet gevonden')

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return serverError(err, 'assets:DELETE')
  }
}
