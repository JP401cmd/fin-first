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
  loadHouseholdSharedHashes,
  loadHouseholdSiblingAccountIds,
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
import {
  categorizeTransaction,
  buildFrequencyMap,
  isOwnAccountTransfer,
  type CategoryCorrection,
} from '@/lib/parsers/categorize'
import { loadOwnAccountIdentifiers } from '@/lib/own-accounts-server'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'
import { resolveEigenRekeningBudgetId, type Budget } from '@/lib/budget-data'

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

    // ── De rem vastzetten: atomair, vóór élk verzoek aan de bank ──────────────
    // Eén RPC in plaats van lezen → controleren → ophogen. Die drie losse
    // stappen waren een TOCTOU (restrisico SC-26): twee gelijktijdige syncs
    // lazen dezelfde stand, zagen allebei ruimte en schreven allebei `n + 1` —
    // twee syncs voor de prijs van één tik. Sinds één sync tot vijf
    // provider-verzoeken kost, en de bank ons ná een handvol verzoeken voor
    // langere tijd blokkeert (`provider_request_limit_exceeded`), was dat gat de
    // duurste van de twee remmen. `reserve_bank_sync_slot` doet de controle en
    // de ophoging in één UPDATE, zodat een tweede verzoek wacht op de
    // rijvergrendeling en dáárna pas de limiet toetst.
    //
    // Bewust hier, vóór het ververs-pad van het token: een geblokkeerde
    // gebruiker mag ook het token-endpoint van de provider niet blijven
    // bestoken. Prijs daarvan: een sync die op het ververs-pad of in de timeout
    // stukloopt kost tóch een tik. Dat is dezelfde keuze als de reservering
    // vóór de blok-lus altijd al maakte — een mislukte poging hoort niet gratis
    // te zijn, anders is herhalen kosteloos terwijl de verzoeken wél gedaan zijn.
    //
    // De dagsleutel wordt in de database in Europe/Amsterdam bepaald. Hier
    // stond `new Date().toISOString()` — UTC — waardoor de teller voor een
    // Nederlandse gebruiker pas om 01:00/02:00 omrolde in plaats van om
    // middernacht.
    const { data: slotRows, error: slotError } = await supabase.rpc('reserve_bank_sync_slot', {
      p_connection_account_id: connection_account_id,
    })
    if (slotError) {
      return serverError(slotError, 'bankconnect-sync:POST')
    }
    const slot = (Array.isArray(slotRows) ? slotRows[0] : slotRows) as {
      slot_found: boolean
      slot_allowed: boolean
      slot_daily_requests: number
      slot_limit: number
    } | undefined | null

    if (!slot || !slot.slot_found) {
      // Dezelfde 404 als hierboven: de RPC scope't op `auth.uid()` + `is_active`
      // en geeft "bestaat niet" en "niet van jou" hetzelfde antwoord.
      return NextResponse.json({ error: 'Account niet gevonden' }, { status: 404 })
    }

    /** Stand ná deze reservering (of de huidige stand als er geweigerd is). */
    const dailyRequests = slot.slot_daily_requests ?? 0
    const dailyLimit = slot.slot_limit ?? 10

    if (!slot.slot_allowed) {
      await supabase.from('bank_sync_log').insert({
        user_id: user.id,
        connection_account_id,
        sync_type: 'transactions',
        status: 'rate_limited',
        error_message: `Daglimiet van ${dailyLimit} verzoeken bereikt`,
      })

      return NextResponse.json({
        error: `Daglimiet bereikt (${dailyLimit} verzoeken per dag per account)`,
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
    //
    // `today` is hier de bovengrens van het OPHAALVENSTER, niet de dagsleutel
    // van de rem — die woont sinds de atomaire reservering in de database
    // (Europe/Amsterdam). UTC is voor een venstergrens de veilige kant: hooguit
    // twee uur conservatief, en het nieuwste blok gaat sowieso zónder `to` naar
    // de provider (zie toProviderRange).
    const today = new Date().toISOString().split('T')[0]

    // De cursor alléén is geen betrouwbaar antwoord op "is dit de eerste
    // ophaal". De koppelrij wordt bij een herkoppeling hergebruikt op identiteit
    // (`external_account_id`, bewust zonder `is_active`-filter — zie de
    // precedentieketen in de callback) en neemt haar `sync_cursor` dan mee, óók
    // wanneer de gebruiker de rekening tussendoor heeft verwijderd. De cursor
    // beschrijft in dat geval historie die niet meer bestaat, en de volle
    // terugblik (B8) draaide daardoor nooit: de gebruiker koppelt opnieuw juist
    // om zijn historie op te halen en houdt één venster vanaf de oude cursor
    // over. Waargenomen op 4 aug 2026.
    //
    // De DRAGER is de waarheid: staat er geen enkele transactie op de rekening,
    // dan is dit per definitie een eerste ophaal, wat de cursor ook beweert.
    // Daarom wordt het startpunt altijd gelezen — één goedkope query op
    // `(user_id, account_id)` met `limit(1)` — in plaats van alleen op het
    // cursor-loze pad.
    const newestExistingDate = date_from
      ? null
      : await loadNewestTransactionDate(supabase, {
          userId: user.id,
          accountId: connAccount.bank_account_id,
        })
    const isFirstFetch = !date_from && (!connAccount.sync_cursor || newestExistingDate === null)
    let blocks: FetchBlock[]
    let fetchMode: 'incremental' | 'historical' | 'cursor' = 'cursor'

    if (isFirstFetch) {
      const plan = planInitialFetch({ today, newestExistingDate })
      blocks = plan.blocks
      fetchMode = plan.mode
    } else {
      blocks = [{ from: date_from || connAccount.sync_cursor, to: date_to || today }]
    }

    // ── Ophalen, blok voor blok ───────────────────────────────────────────────
    // De tik op de rem is hierboven al atomair gereserveerd (één sync-tik voor
    // de hele eerste ophaal — eigenaarsbesluit, zie de log-insert onderaan).
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
      ownAccounts,
      { data: carrierAccount },
      householdPartnerHashes,
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
      // Eigen-rekening-identifiers: ÉÉN keer per sync-run, vóór de rijlus. Twee
      // queries voor de hele run in plaats van twee per transactie.
      loadOwnAccountIdentifiers(supabase, user.id),
      // Het eigenaarschap van de DRAGENDE rekening. Expliciete kolomlijst, nooit
      // `*`: deze tabel draagt `*_encrypted` en `*_hash` (CLAUDE.md-kolomregel).
      // Zie de stempel-noot bij de rijopbouw hieronder voor waaróm dit meekomt.
      supabase
        .from('bank_accounts')
        .select('ownership')
        .eq('id', connAccount.bank_account_id)
        .eq('user_id', user.id)
        .maybeSingle(),
      // ── Laag 1b: wat de PARTNER al op deze rekening heeft staan ─────────────
      // Twee stappen, bewust achter elkaar: eerst welke dragende rijen dezelfde
      // échte rekening beschrijven (de en/of-rekening die beide partners
      // koppelen levert er twee, met verschillende `account_id`), dán hun hashes.
      // De eigen doelrekening zit er altijd bij — dat dekt het geval waarin de
      // partner via het BESTANDSPAD op dezelfde dragende rij heeft geschreven.
      dates.length === 0
        ? Promise.resolve(new Set<string>())
        : loadHouseholdSiblingAccountIds(supabase, {
            userId: user.id,
            accountId: connAccount.bank_account_id,
          }).then((siblingIds) =>
            loadHouseholdSharedHashes(supabase, {
              userId: user.id,
              accountIds: [connAccount.bank_account_id, ...siblingIds],
              minDate: dates[0],
              maxDate: dates[dates.length - 1],
            }),
          ),
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
    /**
     * Laag 1b: de partner heeft deze boeking al weggeschreven op dezelfde échte
     * rekening. Apart geteld van laag 1, want het is een andere reden en een
     * andere schrijver — en zonder eigen teller is "we hebben niets ingevoegd"
     * niet te onderscheiden van "er was niets nieuws".
     */
    let householdPartnerCount = 0
    const afterLayer1 = parsed.filter((p) => {
      if (existingHashSet.has(p.import_hash) || batchHashes.has(p.import_hash)) return false
      // Ná de eigen-rij-controle, zodat een rij die óók zelf al bestaat de
      // directere laag-1-reden houdt en niet twee keer geteld wordt. Zonder
      // partner (of zonder gedeelde rekening) is deze set leeg en is dit een
      // no-op. Spiegelt laag 1b op `/api/transactions/import`.
      if (householdPartnerHashes.has(p.import_hash)) {
        householdPartnerCount++
        return false
      }
      batchHashes.add(p.import_hash)
      return true
    })
    const duplicateCount = parsed.length - afterLayer1.length - householdPartnerCount

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

    // ── Eigen-rekening-verschuivingen (het doel van de rij) ───────────────────
    // De post waar een herkende verschuiving op landt is een `archive`-budget en
    // telt dus niet mee als uitgave. Bewust gefilterd op de EIGEN budgetten: de
    // SELECT-policy op `budgets` is huishoud-verbreed ("own or shared"), en het
    // doel van een eigen rij hoort van de schrijvende gebruiker te zijn — niet
    // per ongeluk de gedeelde emmer van de partner. Spiegelt
    // `/api/own-accounts/reclassify`, dat de budgetten met `.eq('user_id', …)`
    // leest. `null` als de post niet bestaat: dan blijft de rij zonder budget
    // maar wél als `transfer` staan, precies zoals de bestandsimport doet.
    const eigenRekeningBudgetId = resolveEigenRekeningBudgetId(
      ((budgets ?? []) as Budget[]).filter((b) => b.user_id === user.id),
    )

    // Categorize and batch insert.
    // 200 in plaats van 50: sinds B8 kan één eerste ophaal ~3.000 rijen leveren,
    // en 60 sequentiële round-trips passen niet comfortabel binnen de
    // functie-timeout.
    const BATCH_SIZE = 200
    /**
     * De rijen die daadwerkelijk zijn weggeschreven. De tellers hieronder worden
     * hiéruit HERLEID — nooit naast de insert opgehoogd. Anders telt een batch
     * die sneuvelde stil mee in "zoveel nieuw", en dat is exact de fout die
     * dedup nutteloos maakt: de rij wordt geweigerd, het getal niet.
     */
    const insertedRows: { category_source: string }[] = []
    let failedCount = 0

    /**
     * Het eigenaarschap van een gesynchroniseerde boeking VOLGT dat van de
     * dragende rekening. Hier stond niets, en `transactions.ownership` heeft
     * kolomdefault `'personal'` — dus élke boeking op een en/of-rekening werd
     * als persoonlijk weggeschreven.
     *
     * Dat was geen cosmetisch verschil maar de reden dat laag 1b structureel
     * blind was: de SELECT-policy toont een partnerrij alléén bij
     * `ownership = 'shared'`, dus de partner kon de reeks niet zien en niet
     * ontdubbelen — terwijl beide reeksen wél in het huishoudbeeld meetellen.
     * Een dedup-laag die alleen rijen kan zien die per default onzichtbaar zijn,
     * is geen laag.
     *
     * De rekeninghouder houdt de regie: `partner_visibility` (ADR 0118) gaat
     * over de LEES-poort en wordt in de RLS-policy afgedwongen, niet hier. Op
     * een persoonlijke rekening blijft dit letterlijk het oude gedrag.
     * `null`-terugval op `'personal'`: kan de dragende rij niet gelezen worden,
     * dan raden we niet gedeeld — de conservatieve kant is de persoonlijke.
     */
    const accountOwnership =
      (carrierAccount as { ownership?: string | null } | null)?.ownership === 'shared'
        ? 'shared'
        : 'personal'

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

        // Eigen-rekening-detectie op de server, uit een set die deze route zelf
        // heeft gebouwd — nooit uit iets dat de provider of een client aanlevert.
        const isOwnTransfer = isOwnAccountTransfer(
          tx.counterparty_iban,
          ownAccounts.ids.ibans,
          tx.counterparty_name,
          ownAccounts.ids.namePatterns,
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
          // Onze detectie kan een verschuiving alleen BEVESTIGEN, niet ontkennen:
          // een tegenpartij die wij niet kennen bewijst niet dat het géén eigen
          // rekening is. Vandaar de eenzijdige upgrade — matcht onze set, dan
          // zetten wij het trio, óók als de categorisatie al een budget had
          // gekozen. Reden: een verschuiving is per definitie geen uitgave, dus
          // élk gewoon budget is hier de verkeerde bak; hem laten staan is precies
          // de dubbeltelling die de spaarquote vertekent en die `reclassify`
          // achteraf moet repareren.
          //
          // Wat hier NIET staat, en waarom niet: er is geen "de provider wint als
          // die al transfer zegt"-tak. `lib/truelayer/mapper.ts:47` zet
          // `transaction_type` altijd op `null` (rauwe categorieën gaan naar
          // `bank_code`), dus zo'n tak zou dood zijn. Levert een toekomstige
          // provider hier wél een waarde — met name `'joint_transfer'` — dan
          // overschrijft deze regel die. Dat is dan een bewuste heroverweging
          // waard, geen stilzwijgende aanname.
          transaction_type: isOwnTransfer ? 'transfer' : tx.transaction_type,
          bank_code: tx.bank_code,
          import_hash: tx.import_hash,
          is_income: tx.amount > 0,
          budget_id: isOwnTransfer ? eigenRekeningBudgetId : cat.budget_id,
          category_source: isOwnTransfer
            ? 'transfer'
            : cat.category_source ?? (cat.budget_id ? 'rule' : 'import'),
          // Herkomst (B5): deze rijen komen uit de bankkoppeling. `category_source`
          // beschrijft hóé het budget is bepaald — `source` beschrijft wáár de
          // transactie vandaan komt. Bestaande rijen blijven bewust NULL
          // ("onbekend"); die worden niet met een gok gevuld.
          source: 'bank',
          // Volgt het eigenaarschap van de dragende rekening — zie de noot bij
          // `accountOwnership` hierboven.
          ownership: accountOwnership,
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
        insertedRows.push(...rows)
      }
    }

    // Beide getallen HERLEID uit de weggeschreven verzameling, niet opgehoogd.
    // Deze route raakt uitsluitend NIEUWE rijen: bestaande transacties worden
    // door dedup-laag 1 en 2 overgeslagen en nooit bijgewerkt, dus een handmatig
    // gecategoriseerde boeking kan hier niet worden overschreven.
    const insertedCount = insertedRows.length
    // `category_source === 'transfer'` is hier een exacte maat voor "door onze
    // detectie herkend": deze route geeft `categorizeTransaction` bewust géén
    // identifier-set mee (die prioriteit-0-tak kan dus niet vuren), dus de enige
    // schrijver van die waarde is de tak hierboven.
    const ownTransferCount = insertedRows.filter((r) => r.category_source === 'transfer').length

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
      // Laag 1b, additief naast `duplicates`: de partner had deze boeking al op
      // dezelfde échte rekening staan. Bewust NIET in `bank_sync_log` — daar zou
      // een kolom (en dus een migratie) voor nodig zijn, en dat is dezelfde
      // afweging die `own_account_transfers` hieronder al maakte. De
      // terugkoppeling hoort in eerste instantie bij de gebruiker die net op
      // "Synchroniseer" drukte.
      duplicates_household_partner: householdPartnerCount,
      // Additief: hoeveel van de nieuwe rijen zijn als eigen-rekening-verschuiving
      // geboekt in plaats van als uitgave/inkomst. Zonder deze teller is "het is
      // gelukt" niet te onderscheiden van "er is niets herkend", terwijl juist
      // deze rijen de spaarquote beïnvloeden. Bewust NIET in `bank_sync_log`:
      // daar zou een kolom (en dus een migratie) voor nodig zijn, en de
      // terugkoppeling hoort in eerste instantie bij de gebruiker die net op
      // "Synchroniseer" drukte.
      own_account_transfers: ownTransferCount,
      // Stand ná deze sync, zoals de database hem atomair heeft vastgesteld —
      // geen `gelezen waarde + 1` meer, die kon onder gelijktijdigheid liegen.
      daily_requests: dailyRequests,
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
