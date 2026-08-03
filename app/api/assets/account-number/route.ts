import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { accountNumberWriteColumns } from '@/lib/asset-account-number'
import { unauthorized, notFound, serverError } from '@/lib/api/respond'
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
  id: z.string().min(1, 'id is vereist'),
  iban: z.string().nullable(),
})

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
