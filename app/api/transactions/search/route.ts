import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, serverError } from '@/lib/api/respond'
import { TransactionSearchRequestSchema } from '@/lib/transactions/bulk-schemas'
import {
  applyTransactionSearchCriteria,
  loadBankLinkedAccountIds,
  SEARCH_ROW_COLUMNS,
} from '@/lib/transactions/search-query'
import type {
  TransactionSearchResponse,
  TransactionSearchRow,
} from '@/lib/transactions/bulk-contract'

/**
 * `POST /api/transactions/search` — gepagineerd zoeken over de VOLLEDIGE
 * transactiehistorie (F2/F3/F5, AC1/AC2).
 *
 * ## Waarom POST voor een leesactie
 *
 * Het criterium is een object met drie lijsten en een vrije tekst, en het moet
 * BYTE-VOOR-BYTE hetzelfde zijn als wat de manifest-route krijgt — anders
 * bevriest het manifest een andere verzameling dan de gebruiker beoordeelde
 * (ADR 0104). Eén gedeeld zod-schema op één gedeelde body is daarvoor de
 * eenvoudigste borging; hetzelfde criterium twee keer serialiseren naar
 * query-parameters (arrays, nulls, negatieve bedragen) is dat niet. De route
 * muteert niets en is idempotent.
 *
 * ## Scope
 *
 * `.eq('user_id')` staat in `applyTransactionSearchCriteria` en is bewust géén
 * optie: de RLS op `transactions` is huishoud-verbreed bij SELECT maar strikt
 * own-row bij UPDATE/DELETE. Partnerrijen tonen die de gebruiker niet kán
 * muteren zou een scherm opleveren dat liegt (ADR 0104, besluit 6).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims?.sub) return unauthorized()
    const userId = claims.sub as string

    const parsed = await parseBody(TransactionSearchRequestSchema, request)
    if (!parsed.ok) return parsed.response
    const { page, pageSize, ...criteria } = parsed.data

    const from = (page - 1) * pageSize
    const startedAt = Date.now()

    // `count: 'exact'` en niet `rows.length`: F3 eist dat het TOTAAL bekend is
    // zodra de eerste pagina staat — dat getal voedt de "selecteer alle N"-knop.
    const base = supabase.from('transactions').select(SEARCH_ROW_COLUMNS, { count: 'exact' })
    const { data, count, error } = await applyTransactionSearchCriteria(base, criteria, userId)
      // Tweede sorteersleutel: zonder stabiele tiebreak kan dezelfde rij op twee
      // pagina's opduiken (of op geen enkele) wanneer meerdere transacties
      // dezelfde datum delen — en dan klopt de selectie over pagina's heen niet.
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) return serverError(error, 'transactions-search:POST')

    const bankLinked = await loadBankLinkedAccountIds(supabase, userId)

    type Row = Omit<TransactionSearchRow, 'is_bank_linked'>
    const rows: TransactionSearchRow[] = ((data ?? []) as unknown as Row[]).map((row) => ({
      ...row,
      is_bank_linked: row.account_id ? bankLinked.has(row.account_id) : false,
    }))

    // Duur-logging is de TREKKER uit ADR 0104 besluit 9: er is bewust geen
    // trigram-index gebouwd, en dit is de meting die bepaalt wanneer die er
    // alsnog moet komen (p95 > 800 ms).
    console.log(
      `[transactions:search] ${Date.now() - startedAt}ms total=${count ?? 0} page=${page} q=${criteria.q ? 'ja' : 'nee'}`,
    )

    const body: TransactionSearchResponse = {
      rows,
      total: count ?? 0,
      page,
      pageSize,
    }
    return NextResponse.json(body)
  } catch (err) {
    return serverError(err, 'transactions-search:POST')
  }
}
