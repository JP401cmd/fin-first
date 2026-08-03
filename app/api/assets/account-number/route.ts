import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { accountNumberWriteColumns, resolveAssetAccountNumber } from '@/lib/asset-account-number'
import { unauthorized, notFound, badRequest, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'

/**
 * POST `/api/assets/account-number`
 *
 * Zet het rekeningnummer van één bezitting — de server-kant van het IBAN-veld op
 * het bewerkscherm van een cash-bezitting.
 *
 * ## Waarom dit een route is en geen client-write
 *
 * `components/core/assets-client.tsx` is `'use client'` en sloeg het
 * rekeningnummer rechtstreeks op in de kolom `assets.account_number`. Meer kón
 * die browser ook niet: `account_number_encrypted` en `account_number_hash`
 * vragen `ENCRYPTION_KEY_V1` respectievelijk `IBAN_INDEX_KEY_V1`, en die zijn
 * server-only.
 *
 * Gevolg was een langzaam uiteenlopend drieluik. Bewerkte iemand een IBAN, dan
 * kreeg de plaintext-kolom de nieuwe waarde en bleef de ciphertext op de OUDE
 * staan — zonder foutmelding, want `resolveAssetAccountNumber` geeft plaintext
 * voorrang en gaf dus keurig het juiste nummer terug. Precies daarom was die
 * voorrangsvolgorde nodig, en precies daarom kon `assets.account_number` niet
 * weg: laat je de kolom vallen zonder dit op te lossen, dan gaat de app stil het
 * VORIGE rekeningnummer tonen.
 *
 * Deze route schrijft alle drie de kolommen in één keer via
 * `accountNumberWriteColumns` (`lib/asset-account-number.ts`), dus ze kunnen niet
 * meer uiteenlopen. Daarmee is dit de laatste browser-schrijver van de
 * plaintext-kolom die verdwijnt, en wordt de DROP één regel in die helper —
 * zie ADR 0077 voor de stoplijn.
 *
 * Dezelfde vorm en dezelfde reden als `POST /api/assets/toggle-budget`, dat om
 * identieke redenen (versleuteling kan niet in de browser) al server-side staat.
 * Bewust géén tweede manier: beide gebruiken de gedeelde schrijfhelper.
 *
 * ## Aanroepvolgorde bij het opslaan
 *
 * De aanroeper roept deze route aan NA het wegschrijven van de bezitting zelf en
 * VÓÓR `toggle-budget`. Die volgorde is niet vrijblijvend: `setBudgetTracking`
 * synchroniseert de `bank_accounts`-companion en leest het rekeningnummer daarvoor
 * vers uit de database. Draai je de volgorde om, dan krijgt de companion het
 * vorige nummer mee.
 *
 * ## Eigenaarschap
 *
 * `.eq('user_id', user.id)` staat er expliciet bij, náást RLS. Dat is hier een
 * echte versmalling en geen ruis: de SELECT-policy op `assets` is
 * huishoud-verbreed (eigen rijen OF `ownership = 'shared'` binnen het huishouden),
 * dus zonder dit filter zou een gebruiker het rekeningnummer van een GEDEELDE
 * bezitting van zijn partner kunnen overschrijven. De UPDATE-policy is wél
 * eigen-rij, dus RLS vangt het af — maar dan als stille no-op in plaats van een
 * eerlijke 404, en op het verkeerde niveau.
 *
 * Body: `{ id: string, iban: string | null }` — `null` of een lege string wist
 * alle drie de kolommen. Dat is het pad voor een type-wissel weg van cash.
 * Antwoord: `{ ok: true, hasAccountNumber: boolean }`.
 */
const AccountNumberSchema = z.object({
  id: z.uuid('id moet een geldig asset-id zijn'),
  iban: z.string().nullable(),
})

/**
 * GET `/api/assets/account-number?id=<uuid>` — het rekeningnummer van één eigen
 * bezitting, leesbaar.
 *
 * De lees-tegenhanger van de POST hieronder, en de reden dat die er is: het
 * bewerkscherm las de plaintext-kolom rechtstreeks uit de browser. Twee
 * problemen tegelijk. Ten eerste privacy — die lezing was niet op de eigen rij
 * gescoopt, terwijl de SELECT-policy op `assets` huishoud-verbreed is, dus bij
 * een gedeelde bezitting kwam het rekeningnummer van de PARTNER in de browser
 * van de ander. Ten tweede houdbaarheid: zolang de browser die kolom leest, kan
 * `assets.account_number` niet gedropt worden.
 *
 * Deze route lost beide op. Hij scoopt op `auth.uid()` en gaat door
 * `resolveAssetAccountNumber`, die de ciphertext ontsleutelt wanneer de
 * plaintext-kolom leeg is — precies het geval van een bankgekoppelde
 * cash-bezitting, die sinds `20260802093000` UITSLUITEND versleuteld wordt
 * aangemaakt. Bij de DROP verdwijnt de plaintext-tak binnen die ene helper en
 * hoeft hier niets te veranderen.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id || !z.uuid().safeParse(id).success) {
    return badRequest('id ontbreekt of is geen geldig asset-id')
  }

  const { data, error } = await supabase
    .from('assets')
    .select('account_number, account_number_encrypted')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return serverError(error, 'assets-account-number:GET')
  }
  if (!data) {
    return notFound()
  }

  return NextResponse.json({ ok: true, accountNumber: resolveAssetAccountNumber(data) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const parsed = await parseBody(AccountNumberSchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  // Alle drie de kolommen in één keer; lege invoer levert drie keer `null`.
  const columns = accountNumberWriteColumns(body.iban)

  const { data, error } = await supabase
    .from('assets')
    .update(columns)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return serverError(error, 'assets-account-number:POST')
  }
  if (!data) {
    // Bestaat niet, of is niet van deze gebruiker — bewust hetzelfde antwoord,
    // zodat de route niet verklapt welke van de twee het is.
    return notFound()
  }

  return NextResponse.json({
    ok: true,
    hasAccountNumber: columns.account_number_encrypted !== null,
  })
}
