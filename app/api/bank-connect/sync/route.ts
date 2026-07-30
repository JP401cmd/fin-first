import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, conflict, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, getAccountTransactions, refreshAccessToken } from '@/lib/truelayer/client'
import { mapTransactions } from '@/lib/truelayer/mapper'
import {
  loadCrossSourceCandidates,
  loadExistingImportHashes,
  loadNewestTransactionDate,
} from '@/lib/truelayer/existing-hashes'
import {
  countCrossSourceDecisions,
  partitionCrossSourceDuplicates,
  type CrossSourceCandidate,
} from '@/lib/parsers/cross-source-dedup'
import { planInitialFetch, toProviderRange, type FetchBlock } from '@/lib/truelayer/initial-fetch'
import {
  isProviderLimitError,
  RELINK_REQUIRED_MESSAGE,
  TrueLayerRequestError,
} from '@/lib/truelayer/errors'
import type { TLTransaction } from '@/lib/truelayer/types'
import { syncAccountBalance } from '@/lib/truelayer/balance-sync'
import { categorizeTransaction, buildFrequencyMap, type CategoryCorrection } from '@/lib/parsers/categorize'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'
import type { Budget } from '@/lib/budget-data'

/**
 * De eerste ophaal doet tot vier provider-verzoeken (B8: 24 maanden in blokken
 * van 6) en schrijft daarna in het gemeten geval ~3.000 rijen weg. Dat past niet
 * meer met zekerheid binnen de standaard-timeout; 60s is het huispatroon voor de
 * langere routes (holdings/refresh-prices, snapshots/cron).
 */
export const maxDuration = 60

/** `YYYY-MM-DD`, het enige datumformaat dat deze route accepteert. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// De 401-tekst voor "autorisatie niet meer te verversen" woont in
// `lib/truelayer/errors.ts`: `balances` komt op dezelfde toestand uit, en dit is
// tekst die de gebruiker leest (zie de docstring daar).

/**
 * Korte, client-veilige omschrijving voor `bank_sync_log.error_message`.
 *
 * Bewust geen rauwe `err.message`: die tabel gaat mee in de AVG-data-export, en
 * een PostgREST- of fetch-melding hoort niet in een bestand dat de gebruiker
 * downloadt. Van een providerfout houden we wél status + foutcode — precies
 * genoeg om achteraf te zien wélke bank ons afknijpt.
 */
function describeSyncError(err: unknown): string {
  if (err instanceof TrueLayerRequestError) {
    return err.providerErrorCode
      ? `Providerfout ${err.status} (${err.providerErrorCode})`
      : `Providerfout ${err.status}`
  }
  return 'Onbekende fout'
}

/**
 * Body-contract. Zod komt hier bij omdat deze handler er toch al langskwam
 * (ADR 0044): `date_from`/`date_to` waren ongetypeerd en glipten ongeklemd door
 * tot in de provider-URL. Het blijven optionele velden — de UI stuurt ze niet,
 * ze bestaan voor het beheer-/testpad.
 */
const SyncBodySchema = z.object({
  connection_account_id: z.string().min(1, 'connection_account_id is vereist'),
  date_from: z.string().regex(ISO_DATE, 'verwacht formaat YYYY-MM-DD').optional(),
  date_to: z.string().regex(ISO_DATE, 'verwacht formaat YYYY-MM-DD').optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  // Eén keer lezen, buiten de try: het catch-blok hieronder heeft de
  // connection_account_id nodig om een `error`-rij te kunnen loggen. Het deed
  // dat eerder met `req.clone()` ná `req.json()` — op een al geconsumeerde body
  // gooit clone() synchroon, waardoor er in de praktijk NOOIT een foutregel in
  // bank_sync_log belandde.
  const parsed = await parseBody(SyncBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { connection_account_id, date_from, date_to } = parsed.data

  try {
    // Fetch the connection account with its parent connection
    const { data: connAccount } = await supabase
      .from('bank_connection_accounts')
      .select('*, bank_connections(*)')
      .eq('id', connection_account_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!connAccount) {
      return NextResponse.json({ error: 'Account niet gevonden' }, { status: 404 })
    }

    const connection = connAccount.bank_connections

    // Zonder gekoppelde TriFinity-rekening is er niets om op te scopen: de
    // dedup is rekening-gescoped en élke insert zou alsnog op `account_id`
    // stuklopen. Blokkeer hier expliciet in plaats van een "geslaagde" sync met
    // 0 nieuwe rijen weg te schrijven.
    if (!connAccount.bank_account_id) {
      return conflict('Deze koppeling heeft nog geen gekoppelde rekening — verbind de bank opnieuw.')
    }

    // Rate limit check
    const today = new Date().toISOString().split('T')[0]
    let dailyRequests = connAccount.daily_requests || 0

    if (connAccount.rate_limit_reset_date !== today) {
      dailyRequests = 0
    }

    if (dailyRequests >= 10) {
      await supabase.from('bank_sync_log').insert({
        user_id: user.id,
        connection_account_id,
        sync_type: 'transactions',
        status: 'rate_limited',
        error_message: 'Daglimiet van 10 verzoeken bereikt',
      })

      return NextResponse.json({
        error: 'Daglimiet bereikt (10 verzoeken per dag per account)',
        daily_requests: dailyRequests,
      }, { status: 429 })
    }

    // Encrypted-only read: decrypt the *_encrypted columns, no plaintext
    // fallback. Rows must be backfilled (scripts/encrypt-existing-bank-credentials.mjs)
    // before this deploys — see runbook.
    let accessToken: string | null = decryptField(connection.access_token_encrypted ?? null)
    const refreshToken: string | null = decryptField(connection.refresh_token_encrypted ?? null)
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null

    if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (!refreshToken) {
        return NextResponse.json({ error: RELINK_REQUIRED_MESSAGE }, { status: 401 })
      }

      try {
        const newTokens = await refreshAccessToken(supabase, refreshToken)
        accessToken = newTokens.access_token
        const nextRefreshToken = newTokens.refresh_token ?? refreshToken

        // Encrypted-only write of the refreshed tokens.
        await supabase
          .from('bank_connections')
          .update({
            access_token_encrypted: encryptField(newTokens.access_token),
            refresh_token_encrypted: encryptField(nextRefreshToken),
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id)
      } catch {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', connection.id)

        return NextResponse.json({ error: RELINK_REQUIRED_MESSAGE }, { status: 401 })
      }
    }

    if (!accessToken) {
      // Encrypted token missing/undecryptable and not refreshable — force reconnect.
      return NextResponse.json({ error: RELINK_REQUIRED_MESSAGE }, { status: 401 })
    }

    // ── Wat halen we op? (B8/B9) ──────────────────────────────────────────────
    // Drie gevallen, in deze volgorde:
    //  1. een expliciete `date_from` uit de body wint altijd (beheer-/testpad);
    //  2. een bestaande `sync_cursor` betekent "dit is niet de eerste ophaal" —
    //     ophalen vanaf de cursor, één venster, ongewijzigd gedrag;
    //  3. géén cursor = eerste ophaal. Dan bepaalt `planInitialFetch` het
    //     startpunt: staat er al historie op de doelrekening, dan start ze op de
    //     nieuwste bestaande transactie −3 dagen (B9); is de rekening leeg, dan
    //     zo ver terug als de provider geeft, in blokken (B8).
    // De helper is de enige plek waar de marge, de blokgrootte en de maximale
    // terugblik staan — fase 5 (callback) en fase 7 (herkoppelen) consumeren 'm.
    const isFirstFetch = !date_from && !connAccount.sync_cursor
    let blocks: FetchBlock[]
    let fetchMode: 'incremental' | 'historical' | 'cursor' = 'cursor'

    if (isFirstFetch) {
      const newestExistingDate = await loadNewestTransactionDate(supabase, {
        userId: user.id,
        accountId: connAccount.bank_account_id,
      })
      const plan = planInitialFetch({ today, newestExistingDate })
      blocks = plan.blocks
      fetchMode = plan.mode
    } else {
      blocks = [{ from: date_from || connAccount.sync_cursor, to: date_to || today }]
    }

    // ── De rem vastzetten vóórdat we de provider bellen ───────────────────────
    // Eerst reserveren, dan pas ophalen. De ophoging stond hiervóór ná de lus,
    // waardoor élke mislukte of afgekapte sync gratis was: een route die
    // structureel in de timeout loopt kon zo eindeloos herhaald worden terwijl
    // de teller op nul bleef. Sinds de blok-lus kost één poging tot vijf
    // provider-verzoeken, dus dat gat is nu vijf keer zo duur.
    //
    // Dit is één sync-tik voor de hele eerste ophaal (eigenaarsbesluit, zie de
    // log-insert onderaan). Wat het NIET oplost: twee gelijktijdige verzoeken
    // lezen dezelfde `dailyRequests` en schrijven allebei `n + 1`. Die
    // read-then-write is er altijd al geweest en vraagt een atomaire
    // `set daily_requests = daily_requests + 1`-RPC; dat is een eigen stap.
    await supabase
      .from('bank_connection_accounts')
      .update({
        daily_requests: dailyRequests + 1,
        rate_limit_reset_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection_account_id)

    // ── Ophalen, blok voor blok ───────────────────────────────────────────────
    // Nieuwste blok eerst (zie planInitialFetch). Loopt de bánk tegen haar eigen
    // verzoeklimiet aan (429 + provider_request_limit_exceeded — los van onze
    // 10/dag en van die van TrueLayer), dan STOPPEN we, HOUDEN we wat we hebben
    // en SCHRIJVEN we dat weg. Een afgekapte historie is een resultaat; een
    // weggegooide ophaal is dataverlies.
    const { dataUrl } = await getBaseUrls(supabase)
    const tlTransactions: TLTransaction[] = []
    const seenTransactionIds = new Set<string>()
    let transactionRequests = 0
    let truncated = false
    /** Vroegste datum die daadwerkelijk is opgehaald (`null` = niets gelukt). */
    let fetchedFrom: string | null = null

    for (const block of blocks) {
      const range = toProviderRange(block, today)
      // Vóór de call ophogen: een verzoek dat op de limiet stukloopt, ís bij de
      // bank binnengekomen en telt dus mee in de observeerbare teller.
      transactionRequests++

      try {
        const chunk = await getAccountTransactions(
          accessToken, dataUrl, connAccount.external_account_id, range.from, range.to
        )
        // Aangrenzende blokken delen hun grensdatum, dus dezelfde boeking kan in
        // twee blokken zitten. Binnen de batch ontdubbelen op de provider-id:
        // twee identieke rijen in één insert botsen op de rekening-gescopede
        // unieke index en laten dan de héle batch van 200 sneuvelen.
        for (const tx of chunk) {
          if (tx.transaction_id && seenTransactionIds.has(tx.transaction_id)) continue
          if (tx.transaction_id) seenTransactionIds.add(tx.transaction_id)
          tlTransactions.push(tx)
        }
        fetchedFrom = block.from
      } catch (fetchErr) {
        if (isProviderLimitError(fetchErr)) {
          truncated = true
          console.warn(
            `[bankconnect-sync] provider-limiet na ${transactionRequests} verzoek(en); ` +
            `historie opgehaald vanaf ${fetchedFrom ?? 'niets'}`
          )
          break
        }
        throw fetchErr
      }
    }

    // Map to ParsedTransaction
    const parsed = await mapTransactions(tlTransactions)

    // Load budgets + corrections (categorization), existing hashes (dedup) and
    // the frequency map (smart matching) — all four are independent reads, so
    // they run in one parallel batch instead of a sequential waterfall.
    //
    // De dedup-leesronde is rekening-gescoped en gepagineerd (zie
    // lib/truelayer/existing-hashes.ts) en begrensd tot het datumvenster van de
    // opgehaalde batch; bij een lege batch slaan we 'm helemaal over.
    const dates = parsed.map((p) => p.date).sort()
    const [
      { data: budgets },
      { data: corrections },
      existingHashSet,
      crossSourceCandidates,
      freqMap,
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('category_corrections')
        .select('*')
        .eq('user_id', user.id),
      dates.length === 0
        ? Promise.resolve(new Set<string>())
        : loadExistingImportHashes(supabase, {
            userId: user.id,
            accountId: connAccount.bank_account_id,
            minDate: dates[0],
            maxDate: dates[dates.length - 1],
          }),
      // Laag 2 (cross-bron). Zelfde scope-regel, eigen kolommen; de loader
      // verbreedt het venster zelf met de ±1-dagtolerantie van de matcher.
      dates.length === 0
        ? Promise.resolve([] as CrossSourceCandidate[])
        : loadCrossSourceCandidates(supabase, {
            userId: user.id,
            accountId: connAccount.bank_account_id,
            minDate: dates[0],
            maxDate: dates[dates.length - 1],
          }),
      buildFrequencyMap(user.id, supabase),
    ])

    // Vergelijking op `import_hash` alléén — niet op de volledige indexsleutel
    // `import_hash|coalesce(bank_seq,'')` zoals de import-pagina doet. Bewuste
    // keuze: TrueLayer-rijen zetten `bank_seq` altijd op null (zie mapper.ts —
    // een pending→posted id-wissel zou anders een valse "nieuwe" rij worden),
    // dus binnen dit pad is de volledige sleutel per definitie gelijk aan de
    // hash. Het enige verschil ontstaat tegenover CSV-rijen mét volgnummer op
    // dezelfde rekening: die zou de database toelaten, maar dat is dezelfde
    // boeking uit een andere bron — die willen we juist NIET nog eens
    // wegschrijven. Hash-only is daar dus bewust conservatief. (De echte
    // cross-bron-herkenning — andere omschrijving, zelfde boeking — is laag 2,
    // hieronder.)
    //
    // De `batchHashes`-set vangt daarnaast duplicaten BINNEN deze batch: de
    // blokken overlappen op hun grensdatum, en een boeking die tussen twee
    // blokken van pending naar posted ging krijgt een ander `transaction_id`
    // maar dezelfde hash. Twee gelijke rijen in één insert botsen op de unieke
    // index en nemen de hele batch mee.
    const batchHashes = new Set<string>()
    const afterLayer1 = parsed.filter((p) => {
      if (existingHashSet.has(p.import_hash) || batchHashes.has(p.import_hash)) return false
      batchHashes.add(p.import_hash)
      return true
    })
    const duplicateCount = parsed.length - afterLayer1.length

    // ── Laag 2: dezelfde boeking uit een andere bron ──────────────────────────
    // Laag 1 hasht de omschrijving mee, en TrueLayer levert een andere
    // omschrijvingstekst dan de CSV van diezelfde bank voor dezelfde boeking.
    // Laag 2 matcht daarom op datum ±1 dag + bedrag exact op de cent +
    // tegenpartij-IBAN (of, bij eenzijdig ontbrekende IBAN, de genormaliseerde
    // naam). Draait ALTIJD ná laag 1, nooit ervoor: een rij die laag 1 al heeft
    // afgevangen telt niet nóg eens mee.
    //
    // Stil overslaan. De gebruiker is er bij een sync niet bij, dus er valt niets
    // te bevestigen — en er komt géén "mogelijk duplicaat"-rij of -status in
    // `transactions`, want dat zou een derde waarheid worden die élke lezer
    // (dashboard, budgetten, AI-context, FIRE-motor) correct zou moeten negeren.
    // De uitkomst is alleen een teller, gesplitst naar reden, in bank_sync_log.
    //
    // Sinds B9 is dit op het koppelpad een smal vangnet (de eerste ophaal start
    // op de nieuwste bestaande transactie −3 dagen, dus er ontstáát nauwelijks
    // overlap). Een structureel hoge cross-bron-teller op een sync is dus een
    // signaal, geen normaal beeld; het importpad is de grote afnemer.
    const crossDecisions = partitionCrossSourceDuplicates(afterLayer1, crossSourceCandidates)
    const crossSourceCounts = countCrossSourceDecisions(crossDecisions)
    const newTransactions = crossDecisions
      .filter((d) => d.reason === null)
      .map((d) => d.candidate)

    // Categorize and batch insert.
    // 200 in plaats van 50: sinds B8 kan één eerste ophaal ~3.000 rijen leveren,
    // en 60 sequentiële round-trips passen niet comfortabel binnen de
    // functie-timeout.
    const BATCH_SIZE = 200
    let insertedCount = 0
    let failedCount = 0

    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const batch = newTransactions.slice(i, i + BATCH_SIZE)

      const rows = batch.map((tx) => {
        const cat = categorizeTransaction(
          tx.description,
          tx.counterparty_name,
          tx.amount,
          (budgets ?? []) as Budget[],
          (corrections ?? []) as CategoryCorrection[],
          undefined,
          tx.counterparty_iban,
          freqMap,
        )

        return {
          user_id: user.id,
          account_id: connAccount.bank_account_id,
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          counterparty_name: tx.counterparty_name,
          counterparty_iban: tx.counterparty_iban,
          reference: tx.reference,
          transaction_type: tx.transaction_type,
          bank_code: tx.bank_code,
          import_hash: tx.import_hash,
          is_income: tx.amount > 0,
          budget_id: cat.budget_id,
          category_source: cat.category_source ?? (cat.budget_id ? 'rule' : 'import'),
          // Herkomst (B5): deze rijen komen uit de bankkoppeling. `category_source`
          // beschrijft hóé het budget is bepaald — `source` beschrijft wáár de
          // transactie vandaan komt. Bestaande rijen blijven bewust NULL
          // ("onbekend"); die worden niet met een gok gevuld.
          source: 'bank',
        }
      })

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(rows)

      if (insertError) {
        // Blijft niet-fataal — de al weggeschreven batches mogen niet verdampen
        // in een 500 — maar wordt sinds deze fase wél geteld en gerapporteerd.
        // Een stil weggevallen batch die als `status: 'success'` in
        // bank_sync_log landde was restrisico 7 uit het plan.
        console.error('Batch insert error:', insertError)
        failedCount += rows.length
      } else {
        insertedCount += rows.length
      }
    }

    // ── Saldo meeliften op de sync ────────────────────────────────────────────
    // Een sync zonder saldo laat `bank_accounts.balance` op 0 staan (en daarmee
    // de gekoppelde cash-asset): de balances-route bestaat, maar werd door geen
    // enkel scherm aangeroepen. Hier hoort het thuis — het token is al ontsleuteld
    // en zo nodig ververst, en één "Synchroniseer" levert de gebruiker één
    // kloppend beeld (transacties én saldo) in plaats van twee losse acties.
    //
    // Rate limit: dit telt bewust als ÉÉN verzoek (de teller ging vóór de lus al
    // met 1 omhoog). De 10/dag is een app-rem op sync-spam, geen
    // per-endpoint-quotum; de gebruiker dubbel belasten voor één klik zou de rem
    // oneerlijk maken. Het is wél een écht HTTP-verzoek aan de bank en telt dus
    // mee in `provider_requests` — die teller meet de provider-limiet, niet onze
    // rem, en zou anders systematisch één te laag staan.
    //
    // Niet-fataal: de transacties staan op dit punt al in de DB. Een falende
    // saldo-call mag die winst niet omzetten in een 500 — we loggen en gaan door.
    let syncedBalance: number | null = null
    /**
     * De waarde die het cash-bezit vóór deze sync droeg, en of er een
     * herwaardering is weggeschreven (fase 8). Alleen bij een échte wijziging
     * meldt de success-pagina "saldo overgenomen van de bank: €a → €b"; een
     * sync die het saldo niet verandert schrijft geen waardering en hoort er
     * dus ook niets over te zeggen.
     */
    let previousBalance: number | null = null
    let balanceRevalued = false
    /** De saldo-call is één extra HTTP-verzoek aan dezelfde provider. */
    const balanceRequests = 1
    try {
      const { synced } = await syncAccountBalance(supabase, {
        accessToken,
        dataUrl,
        externalAccountId: connAccount.external_account_id,
        bankAccountId: connAccount.bank_account_id,
        userId: user.id,
      })
      syncedBalance = synced?.balance ?? null
      previousBalance = synced?.previous ?? null
      balanceRevalued = synced?.revalued ?? false
    } catch (balanceErr) {
      console.error('TrueLayer balance sync (non-fataal) mislukt:', balanceErr)
    }

    // Update sync cursor to latest date
    let latestDate = connAccount.sync_cursor
    for (const tx of tlTransactions) {
      const txDate = tx.timestamp.split('T')[0]
      if (!latestDate || txDate > latestDate) {
        latestDate = txDate
      }
    }

    // De uitkomst van de ophaal wegschrijven. De rate-limit-tik zelf is al vóór
    // de provider-lus gezet (zie daar) — hier staat alleen nog wat we hebben
    // opgehaald.
    await supabase
      .from('bank_connection_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_cursor: latestDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection_account_id)

    // Log sync. `partial` = er is wél weggeschreven, maar niet alles: de
    // provider kapte de historie af, of een insert-batch sneuvelde. Dat
    // onderscheid stond voorheen nergens — elke sync heette `success`.
    //
    // `provider_requests` is het werkelijke aantal HTTP-verzoeken aan de bank
    // (transactieblokken + de saldo-call) en is NIET gelijk aan de ene tik op de
    // 10/dag-rem. Dat verschil is precies de reden dat deze kolom bestaat: de
    // eigenaarskeuze "de eerste ophaal telt als één synchronisatie" mag alleen
    // als achteraf meetbaar blijft na hoeveel verzoeken een bank ons afknijpt.
    const providerRequests = transactionRequests + balanceRequests
    const partial = truncated || failedCount > 0
    const logNotes = [
      truncated
        ? `Provider-limiet na ${transactionRequests} transactieverzoek(en); historie opgehaald vanaf ${fetchedFrom ?? '—'}`
        : null,
      failedCount > 0 ? `${failedCount} rijen niet weggeschreven` : null,
    ].filter(Boolean).join(' · ')

    await supabase.from('bank_sync_log').insert({
      user_id: user.id,
      connection_account_id,
      sync_type: 'transactions',
      status: partial ? 'partial' : 'success',
      transactions_new: insertedCount,
      transactions_dup: duplicateCount,
      // Laag 2, gesplitst naar reden. `transactions_dup` houdt bewust haar
      // oorspronkelijke betekenis (laag 1) — geen betekeniswissel op een
      // bestaande kolom. De naam-terugval staat apart omdat dat de zwakste grond
      // voor een treffer is en de blinde vlek anders onmeetbaar blijft.
      transactions_dup_cross_source_iban: crossSourceCounts.iban,
      transactions_dup_cross_source_name: crossSourceCounts.name,
      provider_requests: providerRequests,
      error_message: logNotes || null,
    })

    return NextResponse.json({
      new: insertedCount,
      // Blijft de LAAG-1-teller: `connected-account-card.tsx` en de
      // success-pagina lezen dit veld al. Laag 2 komt er additief naast in
      // plaats van erin — anders verandert stil wat "al bekend" betekent.
      duplicates: duplicateCount,
      duplicates_cross_source: crossSourceCounts.total,
      daily_requests: dailyRequests + 1,
      // null als het saldo niet opgehaald/weggeschreven kon worden — additief,
      // bestaande lezers van new/duplicates/daily_requests blijven werken.
      balance: syncedBalance,
      // Fase 8: de "van"-waarde van de herwaardering, plus of er er één is
      // weggeschreven. Additief naast `balance`; de success-pagina leest deze
      // twee en herhaalt de cent-vergelijking niet zelf.
      balance_previous: previousBalance,
      balance_revalued: balanceRevalued,
      // Additief, voor de success-pagina: hoe ver terug is er opgehaald, en is
      // die historie afgekapt door de bank? De pagina leest dit uit de respons —
      // géén extra client-directe read (ADR 0058).
      fetch_mode: fetchMode,
      fetched_from: fetchedFrom,
      truncated,
      provider_requests: providerRequests,
      failed: failedCount,
    })
  } catch (err) {
    console.error('TrueLayer sync error:', err)

    // Foutregel wegschrijven. De body is hierboven al gevalideerd en in een
    // variabele gezet — een tweede `req.clone().json()` gooide op een
    // geconsumeerde body synchroon een TypeError, die de `.catch()` erachter
    // niet ving. Daardoor kwam er in de praktijk NOOIT een `error`-rij in
    // bank_sync_log; het faalpad van de enige integratie met bankcredentials
    // liet geen enkel spoor na.
    try {
      await supabase.from('bank_sync_log').insert({
        user_id: user.id,
        connection_account_id,
        sync_type: 'transactions',
        status: 'error',
        // Genormaliseerd, géén rauwe `err.message`: bank_sync_log staat in
        // lib/user-data-tables.ts en gaat dus mee in de AVG-data-export.
        // Driver-/librarymeldingen horen in de serverlog hierboven, niet in een
        // bestand dat de gebruiker downloadt.
        error_message: describeSyncError(err),
      })
    } catch {
      // Ignore logging errors
    }

    return serverError(err, 'bankconnect-sync:POST')
  }
}
