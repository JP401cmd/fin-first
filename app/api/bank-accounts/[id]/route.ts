import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'
import { ibanWriteColumns } from '@/lib/bank-account-iban'
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

const PatchSchema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht').max(120),
  // Leeg mag: dan wordt de IBAN gewist (alle drie de kolommen op null).
  iban: z.string().trim().max(64).nullable().optional(),
  bank_name: z.string().trim().max(120).nullable().optional(),
  account_type: z.enum(AccountTypeValues).optional(),
  balance: z.number().finite().optional(),
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
    // Vorm-controle vóór de query: een malformed id gaf anders een 500 (Postgres
    // weigert de cast) waar 404 hoort — ruis in de log, verwarrend voor de client.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return notFound('Rekening niet gevonden')
    }

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
