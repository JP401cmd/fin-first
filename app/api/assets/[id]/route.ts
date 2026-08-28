import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'

/**
 * Vorm-controle op het pad-segment, gedeeld door DELETE en PATCH.
 *
 * Bewust één constante: twee handmatig overgetypte regexes op hetzelfde
 * segment is precies het soort stille divergentie waarmee de ene handler een
 * malformed id afvangt en de andere 'm doorlaat naar Postgres (500).
 */
const ASSET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
 * `toggle-woonbalans`). Next.js resolvet statische segmenten vóór dynamische,
 * dus `[id]` vangt die routes niet af. Dit is hetzelfde patroon als
 * `app/api/budgets/[id]` en `app/api/holdings/[id]`. Geen reden om hier iets aan
 * te "repareren".
 *
 * Sinds bevindingen H8/H9 bestaat er óók een `route.ts` op MAPNIVEAU
 * (`app/api/assets/route.ts`, `POST` = aanmaken met zod-validatie). Die vangt
 * uitsluitend het pad `/api/assets` zonder segment en botst dus niet met `[id]`.
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
    if (!ASSET_ID_RE.test(id)) {
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

/**
 * Body-contract van PATCH. Bewust een gesloten `action`-literal en géén vrije
 * kolomset: dit endpoint bestaat om precies één ding te doen — de soft delete
 * hierboven terugdraaien. Een generieke `{ is_active: boolean }` zou hetzelfde
 * werk doen maar meteen een tweede verwijderpad openen dat langs de
 * bevestigingsdialoog van `asset-pane.tsx` heen loopt; een literal maakt de
 * intentie leesbaar in de call-site én in de log.
 */
const AssetRestoreSchema = z
  .object({
    action: z.literal('restore'),
  })
  // `.strict()` is hier geen ceremonie. Vandaag is de update-payload een
  // hardgecodeerde literal, dus extra sleutels zijn inert — maar zodra iemand
  // ooit `parsed.data` in de `.update()` spreidt, wordt een tolerant schema
  // stilzwijgend een open kolom-update-pad. Strict maakt dat een 400 in plaats
  // van een stilte.
  .strict()

/**
 * PATCH /api/assets/[id] — de soft delete van DELETE terugdraaien.
 *
 * Bestaat voor bevinding M7: de bevestigingsdialoog én de succes-toast beloven
 * "je kunt deze bezitting later weer toevoegen", maar er was geen weg terug
 * vanaf die toast. `components/app/core/assets/asset-pane.tsx` hangt hier nu
 * een "Ongedaan maken"-actie aan.
 *
 * ## Waarom in ditzelfde bestand en niet op `[id]/restore`
 *
 * De autorisatie van een restore MOET letterlijk gelijk zijn aan die van de
 * delete — zelfde anon RLS-client, zelfde `.eq('user_id', user.id)`, zelfde
 * 404 op 0 geraakte rijen. Naast elkaar in één bestand is die gelijkheid bij
 * elke latere wijziging in één blik te controleren; in een aparte map drift 't.
 * Een restore die één guard mist, haalt een rij van iemand anders terug.
 *
 * ## Waarom géén `.eq('is_active', false)`
 *
 * Zelfde afweging als bij DELETE (zie hierboven): de update filtert niet op de
 * huidige waarde, dus een dubbele klik of een stale scherm schrijft dezelfde
 * waarde en levert gewoon 200. Idempotent, geen verwarrende 404 op een actie
 * die al geslaagd was.
 *
 * ## Wat dit NIET herstelt
 *
 * Alleen de `is_active`-vlag. Waarderingshistorie, holdings en koppelingen
 * bleven bij de soft delete sowieso staan (dát is de reden dat het een soft
 * delete is), dus er valt niets terug te zetten. Een hard verwijderde
 * crypto-holding — eigen pad, eigen type-to-confirm — is bewust niet
 * herstelbaar en loopt niet via deze route.
 *
 * ## Bekende asymmetrie: dit is NIET de tegenhanger van élke deactivatie
 *
 * `is_active = false` heeft een tweede schrijver: de RPC
 * `public.delete_bank_account`
 * (`supabase/migrations/20260804102500_delete_bank_account_rpc.sql`) zet in
 * dezelfde ondeelbare transactie `is_active = false` én
 * `has_budget_tracking = false` op het gekoppelde cash-bezit, nádat de
 * `bank_accounts`-rij weg is en transacties verhuisd zijn. Deze route is
 * id-geadresseerd en flipt uitsluitend de vlag, dus wie het
 * `deactivated_asset_id` uit die RPC-respons hier indient, reactiveert een
 * cash-bezit met een stale waarde, zonder bankrekening en met
 * budget-tracking uit — de helft van een alles-of-niets-besluit.
 *
 * Bewust niet dichtgezet in deze wijziging: het treft uitsluitend eigen data
 * (de eigenaarsfilter blijft onverkort gelden), er is géén UI-pad naartoe (de
 * undo-knop wordt pas gearmeerd ná een geslaagde `DELETE` op dít endpoint), en
 * het resultaat is met een gewone verwijderactie weer op te ruimen. De echte
 * oplossing is een kortlevend, server-gebonden undo-token dat `DELETE`
 * teruggeeft en `PATCH` eist; dat is een aparte kaart waard. Hier staat het
 * zodat de volgende lezer dit niet als gedekt leest.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Anon RLS-client mét de sessie van de aanroeper — nooit service-role.
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    if (!ASSET_ID_RE.test(id)) {
      return notFound('Bezitting niet gevonden')
    }

    const parsed = await parseBody(AssetRestoreSchema, req)
    if (!parsed.ok) return parsed.response

    const { data, error } = await supabase
      .from('assets')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()

    if (error) return serverError(error, 'assets:PATCH')
    // 0 geraakte rijen = niet van deze gebruiker. De SELECT-policy op `assets`
    // is huishoud-verbreed, de UPDATE-policy strikt eigen-rij: zonder deze
    // check zou een restore op de rij van de partner een stille "succes"
    // opleveren (`.update()` zonder geraakte rijen geeft `error: null`).
    if (!data) return notFound('Bezitting niet gevonden')

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return serverError(err, 'assets:PATCH')
  }
}
