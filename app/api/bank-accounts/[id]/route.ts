import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { conflict, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { ibanWriteColumns } from '@/lib/bank-account-iban'
import { ownershipWriteColumns } from '@/lib/bank-account-visibility'
import { ACCOUNT_TYPES } from '@/lib/account-types'

/**
 * PATCH /api/bank-accounts/[id] — het bewerkscherm van één bankrekening.
 *
 * ## Waarom dit een route werd en geen client-update bleef
 *
 * `components/app/cash-account-view.tsx` schreef de rekening rechtstreeks bij
 * vanuit de browser, inclusief `iban`. Dat kan niet blijven: de IBAN moet
 * voortaan als `iban_encrypted` + `iban_hash` worden weggeschreven, en die
 * sleutels zijn server-only. Een client die alleen de plaintext-kolom bijwerkt
 * laat `iban_encrypted` op de oude waarde staan — en omdat álle leespaden sinds
 * de omzetting uitsluitend die kolom lezen, zou de gebruiker zijn IBAN
 * corrigeren en er niets zien veranderen, terwijl de eigen-rekeningherkenning
 * op het óude nummer blijft matchen. Stil verkeerd, precies wat we niet willen.
 *
 * Dit past bovendien op de datapad-conventie (ADR 0058): muteren gaat via een
 * API-route met de gedeelde error-envelope (ADR 0044) en zod-validatie.
 *
 * ## Eigenaarschap
 *
 * De anon RLS-client mét de sessie van de aanroeper, nooit service-role.
 *
 * De expliciete `user_id`-filter is hier wél juist — anders dan bij
 * `GET /api/own-accounts/ibans`, waar hij bewust ontbreekt. Het verschil zit in
 * de policies (live geverifieerd tegen `pg_policies`): de **SELECT**-policy op
 * `bank_accounts` is huishoud-verbreed (`... OR ownership='shared' AND
 * household_id = user_household_id()`), maar de **UPDATE**-policy is strikt
 * eigen-rij in zowel `qual` als `with_check` (`auth.uid() = user_id`). Een
 * partner kan een gedeelde rekening dus wél zien maar niet bewerken. Zonder deze
 * filter werd zo'n poging een geslaagde respons over 0 rijen; nu is het een
 * eerlijke 404. Dat is een verbetering t.o.v. de oude client-update, die stil
 * niets deed en de UI liet doen alsof het lukte.
 */

const AccountTypeValues = ACCOUNT_TYPES.map((t) => t.value) as [string, ...string[]]

/**
 * Vorm-controle op het pad-segment, vóór élke query in dit bestand.
 *
 * Een malformed id gaf anders een 500 (Postgres weigert de cast naar uuid) waar
 * 404 hoort — ruis in de log, verwarrend voor de client. Alle drie de handlers
 * delen deze regel, dus staat hij hier één keer i.p.v. drie keer inline.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PatchSchema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht').max(120),
  // Leeg mag: dan wordt de IBAN gewist (alle drie de kolommen op null).
  iban: z.string().trim().max(64).nullable().optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  account_type: z.enum(AccountTypeValues).optional(),
  balance: z.number().finite().optional(),
  /**
   * Per-rekening zichtbaarheid in het huishouden (ADR 0118).
   *
   * Eén veld, twee kolommen: de client stuurt alléén de zichtbaarheid en de
   * server leidt `ownership` eruit af (`ownershipWriteColumns`). `ownership`
   * apart accepteren zou de twee uit de pas kunnen laten lopen — de
   * CHECK-constraint weigert dat wel, maar dan als 500 op een verzoek dat de
   * client redelijkerwijs correct dacht te doen. Beter is één veld waar de
   * invariant niet ovértreedbaar is.
   *
   * Bewust GEEN `z.enum(PARTNER_VISIBILITY_VALUES)`: die constante is
   * `readonly` en zod verlangt hier een muteerbare tuple. De waarden staan
   * daarom letterlijk; `ownershipWriteColumns` typecheckt ze alsnog tegen
   * `PartnerVisibility`.
   */
  partner_visibility: z.enum(['none', 'balance', 'full']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    if (!UUID_RE.test(id)) return notFound('Rekening niet gevonden')

    const parsed = await parseBody(PatchSchema, req)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    const updates: Record<string, unknown> = { name: body.name }
    if (body.bank_name !== undefined) updates.bank_name = body.bank_name || null
    if (body.account_type !== undefined) updates.account_type = body.account_type
    if (body.balance !== undefined) updates.balance = body.balance
    // De drie IBAN-kolommen altijd als één blok — nooit los, zie
    // `lib/bank-account-iban.ts`.
    if (body.iban !== undefined) Object.assign(updates, ibanWriteColumns(body.iban))
    // `ownership` + `partner_visibility` altijd als één blok — zie
    // `lib/bank-account-visibility.ts`. De DB-CHECK is de vangrail eronder.
    if (body.partner_visibility !== undefined) {
      Object.assign(updates, ownershipWriteColumns(body.partner_visibility))
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()

    // Niet `throw error`: een Supabase `PostgrestError` is een plain object, dus
    // `serverError`'s `err instanceof Error`-tak logt 'm server-side als
    // "[object Object]". Direct doorgeven behoudt de echte melding in de log; de
    // client krijgt hoe dan ook de generieke tekst.
    if (error) return serverError(error, 'bank-accounts:PATCH')
    if (!data) return notFound('Rekening niet gevonden')

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return serverError(err, 'bank-accounts:PATCH')
  }
}

/**
 * `count: 'exact', head: true` leidt het aantal af uit de Content-Range-header.
 * Wordt die onderweg gestript (proxy) of verandert het Prefer-gedrag, dan is
 * `error` null én `count` null — een geslaagde respons zonder getal.
 *
 * Dat mag hier NOOIT als 0 tellen: deze route voedt de tekst van een
 * destructieve bevestiging, en "0 boekingen" onder een knop die duizenden
 * transacties weggooit is de gevaarlijkste zin die we kunnen tonen. Bij twijfel
 * dus `null` — de UI laat de zin dan wég in plaats van te liegen. Dezelfde
 * fail-closed redenering (en dezelfde valkuil) staat in
 * `lib/onboarding-bank-cleanup.ts` r.133-139, waar twijfel "behouden" betekent.
 */
function safeCount(count: number | null | undefined, error: unknown): number | null {
  if (error) return null
  return count === null || count === undefined ? null : count
}

/**
 * GET /api/bank-accounts/[id] — de impact-preview vóór het verwijderen.
 *
 * ## Waarom een route en geen client-read
 *
 * De verwijderbevestiging moet eerlijk kunnen zeggen wat er op het spel staat:
 * hoeveel boekingen eraan hangen, hoeveel terugkerende regels stilvallen, of er
 * een bankkoppeling losgelaten wordt. Die cijfers passen niet in de
 * loader-bundel (ze zijn alleen nodig op het moment dát iemand op verwijderen
 * klikt), en on-demand reads die niet in de bundel passen lopen volgens de
 * datapad-conventie (ADR 0058) via een API-route — niet via een directe
 * Supabase-read uit de browser.
 *
 * ## Auth
 *
 * Pure read, dus `getAuthClaims` i.p.v. `getUser()`: die verifieert de token
 * lokaal tegen de JWKS zonder roundtrip (ADR 0052). De handler heeft alleen
 * `user.id` nodig om de RLS-gescope'te selects te scopen. De DELETE hieronder
 * gebruikt bewust wél `getUser()` — dat schrijft.
 *
 * De expliciete `user_id`-filter spiegelt PATCH: de SELECT-policy op
 * `bank_accounts` is huishoud-verbreed, dus een partner ziet een gedeelde
 * rekening wél. Verwijderen mag hij 'm niet, dus krijgt hij hier ook geen
 * preview — anders belooft het scherm een knop die daarna 404 geeft.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) return unauthorized()

    const { id } = await params
    if (!UUID_RE.test(id)) return notFound('Rekening niet gevonden')

    const { data: account, error: accountError } = await supabase
      .from('bank_accounts')
      .select('id, name, is_archive_bucket')
      .eq('id', id)
      .eq('user_id', claims.sub)
      .maybeSingle()

    if (accountError) return serverError(accountError, 'bank-accounts:GET')
    if (!account) return notFound('Rekening niet gevonden')

    // Bewust géén extra `user_id`-filter op de tellingen. Bij een gedeelde
    // rekening dragen ook de boekingen van de partner het gewicht van deze
    // beslissing; die wegfilteren zou de preview juist te laag maken. Wat de
    // teller ziet is wat RLS deze gebruiker laat zien.
    const [{ count: txCount, error: txError }, { count: recCount, error: recError }] =
      await Promise.all([
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', id),
        supabase
          .from('recurring_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', id)
          .eq('is_active', true),
      ])

    // Bestaansvraag met `.limit(1)` i.p.v. een count: het antwoord zit dan in de
    // rijen zelf en hangt niet aan de Content-Range-header.
    const { data: links, error: linkError } = await supabase
      .from('bank_connection_accounts')
      .select('id')
      .eq('bank_account_id', id)
      .eq('is_active', true)
      .limit(1)

    // Fail-closed, maar de andere kant op dan bij de tellingen: kunnen we de
    // koppeling niet lezen, dan gaan we ervan uit dát er één is. Een
    // waarschuwing te veel is onschadelijk; een gemiste waarschuwing laat de
    // gebruiker zijn bankkoppeling verliezen zonder dat hij het wist.
    const hasBankLink = linkError ? true : (links ?? []).length > 0

    return NextResponse.json({
      id: account.id,
      name: account.name,
      transactionCount: safeCount(txCount, txError),
      recurringCount: safeCount(recCount, recError),
      hasBankLink,
      isArchiveBucket: account.is_archive_bucket === true,
    })
  } catch (err) {
    return serverError(err, 'bank-accounts:GET')
  }
}

/**
 * Body van DELETE. Bewust ZONDER default op `transactions`.
 *
 * Een ontbrekende of verminkte body faalt daardoor met een 400 en kan nooit
 * stil in de destructieve tak vallen. Een default `'delete'` zou een
 * kapot-geserialiseerd verzoek in een gegevensverlies veranderen; een default
 * `'keep'` zou stilzwijgend iets anders doen dan de gebruiker aanklikte. De
 * keuze moet expliciet over de lijn komen. DELETE-met-body is uitdrukkelijk
 * voorzien in de API-conventie (CLAUDE.md / ADR 0044).
 */
const DeleteSchema = z.object({ transactions: z.enum(['keep', 'delete']) })

/** Vorm van één rij uit `public.delete_bank_account` (snake_case, uit de DB). */
interface DeleteBankAccountRow {
  archive_account_id: string | null
  moved_transactions: number | null
  deleted_transactions: number | null
  stopped_recurrings: number | null
  released_links: number | null
  deactivated_asset_id: string | null
}

/**
 * DELETE /api/bank-accounts/[id] — de rekening écht weghalen.
 *
 * ## Waarom één RPC en geen reeks losse calls
 *
 * Dit is de eerste harde delete van een identiteitsrij in de app. Er moeten
 * vijf dingen gebeuren: koppelrijen vrijgeven, transacties verplaatsen of
 * verwijderen, terugkerende regels stopzetten, het cash-bezit deactiveren en de
 * rij zelf verwijderen. Dat moet alles-of-niets zijn — supabase-js heeft geen
 * transactie-API, dus een reeks losse calls laat bij een fout halverwege een
 * half opgeruimde rekening achter: transacties zonder rekening, of een rekening
 * zonder koppeling die de gebruiker niet meer kwijtraakt. Al het databasewerk
 * zit daarom in `public.delete_bank_account`, die in één transactie draait.
 *
 * Precedent en besluit: `20260802140500_bank_sync_atomic_daily_limit_rpc.sql`,
 * `20260803090000_ai_calculator_atomic_weekly_limit_rpc.sql`, ADR 0076.
 *
 * Gevolg voor deze handler: hij doet zelf géén `.delete()` en géén `.update()`
 * op `bank_accounts` of iets eromheen. Elke schrijfactie die hier zou
 * bijkomen valt per definitie buiten de transactie en ondermijnt precies de
 * garantie waarvoor de RPC bestaat. De test bewaakt dat.
 *
 * ## Auth
 *
 * `getUser()` (niet `getAuthClaims`): dit schrijft, en een destructieve actie
 * verdient een vers geverifieerde identiteit. Eigenaarschap zelf wordt in de
 * RPC afgedwongen — die scope't op `auth.uid()` en meldt "niet van jou" als
 * TF404, zodat bestaan-of-niet-van-jou hetzelfde antwoord geeft.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return unauthorized()

    const { id } = await params
    if (!UUID_RE.test(id)) return notFound('Rekening niet gevonden')

    const parsed = await parseBody(DeleteSchema, req)
    if (!parsed.ok) return parsed.response

    const { data, error } = await supabase.rpc('delete_bank_account', {
      p_account_id: id,
      p_keep_transactions: parsed.data.transactions === 'keep',
    })

    if (error) {
      // De RPC signaleert zijn afgesproken uitkomsten met eigen SQLSTATE-codes;
      // PostgREST geeft die door op `error.code` (net als de standaardcodes,
      // vgl. de 23505-afhandelingen elders in app/api). De rauwe `error.message`
      // gaat NOOIT mee naar de client — die bevat DB-details (CLAUDE.md/AVG);
      // alleen deze vaste, uitlegbare teksten.
      const code = (error as { code?: string }).code
      switch (code) {
        case 'TF404':
          return notFound('Rekening niet gevonden')
        case 'TF409':
          return conflict('De archiefrekening kan niet verwijderd worden.')
        // De oude tekst adviseerde "zet de rekening eerst op persoonlijk". Dat
        // advies moest weg: `ownership` omzetten verplaatst geen enkele rij van
        // de partner, het maakt ze alleen onzichtbaar — en omdat
        // transactions/recurring_transactions op ON DELETE CASCADE staan en een
        // RI-cascade buiten RLS om draait, was dat precies de route naar het
        // schadegeval dat deze fout hoort te voorkomen. De guard meet sinds
        // 04-08-2026 de rijen zelf (SECURITY DEFINER, beide tabellen), dus deze
        // 409 kan ook vallen op een rekening die nu 'personal' heet.
        case 'TF410':
          return conflict(
            'Er staan boekingen of terugkerende regels van je partner op deze rekening. Laat die eerst verplaatsen of verwijderen; daarna kun je de rekening opruimen.',
          )
        // foreign_key_violation: er hangt nog iets aan de rekening waar de RPC
        // niet in voorziet. Geen 500 — dit is een toestand van de gegevens, niet
        // een storing, en de gebruiker kan er iets aan doen.
        case '23503':
          return conflict('Deze rekening is nog ergens aan gekoppeld en kon niet verwijderd worden.')
        // De archief-rekening kon niet worden aangemaakt. De RPC gooit dit in
        // stap 4, dus vóór élke destructieve stap: de rekening, de transacties en
        // de koppeling zijn op dat moment nog volledig ongemoeid. Daarom een
        // herhaalbaar advies in plaats van een kale 500 — opnieuw proberen is
        // hier veilig en lost een toevallige botsing op.
        case '55000':
          return conflict('Het archief voor je transacties kon niet worden aangemaakt. Er is niets gewijzigd — probeer het opnieuw.')
        default:
          return serverError(error, 'bank-accounts:DELETE')
      }
    }

    // De RPC is `returns table`, dus supabase-js levert een array. Geen rij
    // terwijl er ook geen fout is, betekent dat het contract niet doet wat we
    // denken — dan is de toestand van de rekening onbekend en is stilzwijgend
    // "gelukt" antwoorden het slechtste dat we kunnen doen.
    const row = (Array.isArray(data) ? data[0] : data) as DeleteBankAccountRow | undefined | null
    if (!row) {
      return serverError(
        new Error('delete_bank_account gaf geen rij terug'),
        'bank-accounts:DELETE',
      )
    }

    // camelCase naar de client; de RPC levert snake_case.
    return NextResponse.json({
      id,
      movedTransactions: row.moved_transactions ?? 0,
      deletedTransactions: row.deleted_transactions ?? 0,
      stoppedRecurrings: row.stopped_recurrings ?? 0,
    })
  } catch (err) {
    return serverError(err, 'bank-accounts:DELETE')
  }
}
