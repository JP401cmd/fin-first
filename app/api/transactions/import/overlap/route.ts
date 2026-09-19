import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { loadOtherOwnAccountCandidates } from '@/lib/truelayer/existing-hashes'
import {
  countOtherAccountOverlaps,
  groupRowsByAccount,
  type OtherAccountOverlap,
} from '@/lib/parsers/other-account-overlap'
import { MAX_ROWS_PER_REQUEST } from '../route'

/**
 * POST /api/transactions/import/overlap — "staan deze regels al op een ANDERE
 * eigen rekening?" De voorcontrole vóór het wegschrijven, zodat de import-
 * pagina kan waarschuwen: "X regels staan al op rekening Y — toch importeren?"
 *
 * ## Wat deze route bewust NIET is
 *
 * Geen vierde dedup-laag. Ze schrijft niets, blokkeert niets en levert geen
 * per-rij-vlaggen: alleen een telling per andere rekening. De beslissing is
 * van de gebruiker (eigenaarsbesluit 11-09-2026), en `POST /api/transactions/
 * import` importeert daarna gewoon wat er aangevinkt staat — dedup blijft
 * alleen INSERTs verhinderen binnen de eigen rekening.
 *
 * ## Vijf importtoetsen
 *
 *  - Expliciet doel: de doelrekening (`account_id`) is verplicht en moet voor
 *    deze gebruiker zichtbaar zijn (RLS); "andere rekeningen" is relatief aan
 *    dát doel.
 *  - Sleutel server-bepaald: de matchsleutel is die van laag 2
 *    (`cross-source-dedup.ts`), de client stuurt alleen de vier matchvelden.
 *  - Afgeleid, niet opgehoogd: elke aanroep telt opnieuw tegen de database;
 *    er wordt geen teller bewaard.
 *  - Scoping volgt eigenaarschap: de vergelijking loopt uitsluitend over
 *    rijen met `user_id = ik` — nooit partnerrijen, ook niet op een gedeelde
 *    rekening. "Andere EIGEN rekening" is letterlijk.
 *  - Zichtbare terugkoppeling: de teller per rekening mét rekeningnaam gaat
 *    terug naar het scherm; de pagina toont 'm vóór het importeren.
 *
 * Eén verzoek draagt maximaal `MAX_ROWS_PER_REQUEST` rijen (zelfde grens als de
 * import zelf); de pagina knipt en telt de uitkomsten per rekening op.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Alleen de velden waarop laag 2 matcht — niets anders is hier nodig. */
const OverlapRowSchema = z.object({
  date: z.string().regex(ISO_DATE, 'verwacht formaat YYYY-MM-DD'),
  amount: z.number().finite(),
  counterparty_name: z.string().max(500).nullish(),
  counterparty_iban: z.string().max(64).nullish(),
})

const OverlapBodySchema = z.object({
  account_id: z.string().uuid('ongeldige rekening'),
  rows: z.array(OverlapRowSchema).min(1, 'geen rijen om te controleren').max(MAX_ROWS_PER_REQUEST),
})

export type OverlapResponse = {
  /** Per andere eigen rekening met ≥1 treffer, aflopend op aantal. */
  overlaps: (OtherAccountOverlap & { account_name: string })[]
  /** Hoeveel rijen er in deze aanroep zijn beoordeeld. */
  checked: number
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(OverlapBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { account_id: accountId, rows } = parsed.data

  try {
    // Zelfde poort als de import zelf: ziet de gebruiker de doelrekening niet
    // (RLS), dan bestaat ze voor hem niet.
    const { data: account, error: accountError } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('is_active', true)
      .maybeSingle()
    if (accountError) return serverError(accountError, 'transactions-import-overlap:POST')
    if (!account) return forbidden('Deze rekening bestaat niet of is niet van jou')

    const dates = rows.map((r) => r.date).sort()
    const others = await loadOtherOwnAccountCandidates(supabase, {
      userId: user.id,
      accountId,
      minDate: dates[0],
      maxDate: dates[dates.length - 1],
    })

    const overlaps = countOtherAccountOverlaps(rows, groupRowsByAccount(others))
    if (overlaps.length === 0) {
      return NextResponse.json({ overlaps: [], checked: rows.length } satisfies OverlapResponse)
    }

    // Namen alleen van rekeningen die de gebruiker zelf heeft aangemaakt
    // (`bank_accounts.user_id = ik`). De overlap-set is gescoped op
    // `transactions.user_id = ik`; op een gedeelde rekening die de PARTNER heeft
    // aangemaakt kan de gebruiker zelf ook boekingen hebben — die rekening valt
    // hier dan terug op "Onbekende rekening". Bewust fail-closed: liever een
    // naamloze telling dan een naam-lookup die partnerrekeningen bevraagt.
    const { data: named, error: namesError } = await supabase
      .from('bank_accounts')
      .select('id, name')
      .eq('user_id', user.id)
      .in('id', overlaps.map((o) => o.account_id))
    if (namesError) return serverError(namesError, 'transactions-import-overlap:POST')

    const nameById = new Map((named ?? []).map((a) => [a.id as string, (a.name as string) || 'Onbekende rekening']))
    return NextResponse.json({
      overlaps: overlaps.map((o) => ({ ...o, account_name: nameById.get(o.account_id) ?? 'Onbekende rekening' })),
      checked: rows.length,
    } satisfies OverlapResponse)
  } catch (err) {
    return serverError(err, 'transactions-import-overlap:POST')
  }
}
