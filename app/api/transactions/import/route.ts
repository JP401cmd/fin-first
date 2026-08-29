import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { computeHash } from '@/lib/parsers/shared'
import {
  dedupKey,
  loadCrossSourceCandidates,
  loadExistingDedupKeys,
  loadHouseholdSharedDedupKeys,
} from '@/lib/truelayer/existing-hashes'
import {
  countCrossSourceDecisions,
  partitionCrossSourceDuplicates,
  type CrossSourceCandidate,
} from '@/lib/parsers/cross-source-dedup'

/**
 * POST /api/transactions/import — het serverpad van de bestandsimport (B7).
 *
 * ## Waarom deze route bestaat
 *
 * Op een GEKOPPELDE rekening schrijven twee partijen in dezelfde rijruimte: de
 * bank-sync (`app/api/bank-connect/sync`) en de bestandsimport. Tot nu toe
 * besliste browsercode over de idempotentie van de import — met een ándere
 * sleutel dan de sync gebruikt. Twee schrijvers, één rijruimte, verschillende
 * regels. Deze route maakt "één schrijver per gekoppelde rekening" waar: parsen
 * blijft client-side (bestandsformaten, kolomherkenning, voorvertoning), maar
 * opslaan + dedup gebeuren hier, met exact dezelfde modules als de sync-route.
 *
 * Zie ADR 0073 (importpad via een server-route) en ADR 0058 (datapad-conventie:
 * muteren gaat via een API-route, nooit met een directe `.insert()` uit de
 * browser).
 *
 * ## De drie dedup-lagen, in deze volgorde
 *
 * 1. **Laag 1 — de indexsleutel** `import_hash | coalesce(bank_seq,'')`, gescoped
 *    op `(user_id, account_id)`. Spiegelt de unieke index exact. Niet
 *    overrulebaar: dit is geen oordeel maar natuurkunde — de database zou de rij
 *    hoe dan ook weigeren, en dan sneuvelt de hele batch.
 * 1b. **Laag 1b — de partner op een GEDEELDE rekening.** Dezelfde exacte
 *    sleutel, maar dan van de ándere huishoudpartner. Draait ALLEEN op een
 *    rekening met `ownership = 'shared'`; op een persoonlijke rekening wordt de
 *    query niet eens gesteld.
 *
 *    Waarom deze laag nodig is: op een gedeelde rekening mogen beide partners
 *    importeren (de rekeningcontrole hieronder gaat bewust via RLS), de trigger
 *    `trg_stamp_household_id` stempelt beide reeksen op hetzelfde huishouden en
 *    de SELECT-policy op `transactions` is huishoud-verbreed. Laag 1 filtert
 *    echter op `.eq('user_id', …)` en de unieke index droeg `user_id` in de
 *    sleutel — dus vóór deze laag ving NIETS de tweede reeks af, en zagen én
 *    telden beide partners elke transactie dubbel.
 *
 *    Niet overrulebaar, net als laag 1 en anders dan laag 2: dit is een EXACTE
 *    match op dezelfde rekening, geen fuzzy oordeel. Twee écht verschillende
 *    boekingen met gelijke datum/bedrag/omschrijving worden al onderscheiden
 *    door `bank_seq`, en dat zit in de sleutel. Er is dus bewust géén
 *    `allow_*`-vlag voor.
 * 2. **Laag 2 — cross-bron** (`lib/parsers/cross-source-dedup.ts`): dezelfde
 *    boeking uit een andere bron, waar de bank een andere omschrijvingstekst
 *    levert dan het CSV-bestand. Dít is wél een oordeel, dus **wél overrulebaar**:
 *    de gebruiker is bij een import aanwezig, ziet de treffer mét reden
 *    voorgedeselecteerd staan en kan 'm alsnog aanvinken (`allow_cross_source`).
 *    Bij de sync gebeurt hetzelfde stil — daar is niemand om iets te vragen.
 *
 * Alle drie de lagen verhinderen uitsluitend INSERTs. Nooit een update, merge of delete:
 * de oudste rij wint en houdt haar budget-toewijzing. Er komt ook geen "mogelijk
 * duplicaat"-status in `transactions` — dat zou een derde waarheid worden die
 * élke lezer correct zou moeten negeren.
 *
 * ## Vertrouwensgrens
 *
 * De client levert geparste rijen aan, niet de waarheid over wie ze mag
 * wegschrijven. Deze route zet zelf `user_id`, `account_id`, `source: 'import'`
 * en `is_income`, en **herberekent `import_hash`** uit `(date, amount,
 * description)` in plaats van de client-waarde te geloven: een verzonnen hash
 * zou de unieke index omzeilen en de dedup van élke volgende import vervuilen.
 * Onbekende velden in de body worden door zod weggestript (whitelist), dus een
 * client kan geen kolom zetten die hier niet expliciet is toegestaan.
 */

/**
 * Eén request kan tot 1.000 rijen dragen; de import-pagina stuurt er 500 per
 * batch. Een CSV van ~3.000 rijen wordt dus zes verzoeken — dat past ruim binnen
 * de timeout en houdt de bestaande batch-/hervattingslogica van de pagina
 * (localStorage-sessie, per-batch voortgang, retry) ongewijzigd overeind.
 */
export const MAX_ROWS_PER_REQUEST = 1000

/**
 * Insert-chunk binnen één verzoek. Gelijk aan de sync-route: 200 rijen per
 * round-trip is het gemeten compromis tussen aantal round-trips en de kans dat
 * één botsing een grote batch meesleurt.
 */
const INSERT_CHUNK_SIZE = 200

/** Een import van 1.000 rijen doet meerdere sequentiële inserts; 60s is het
 *  huispatroon voor de langere routes (sync, holdings/refresh-prices). */
export const maxDuration = 60

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Eén te importeren rij. Bewust een expliciete whitelist en geen doorgeefluik:
 * alles wat hier niet staat (`user_id`, `account_id`, `source`, `is_income`,
 * `import_hash`, `id`, …) wordt gestript en server-side bepaald.
 */
const ImportRowSchema = z.object({
  date: z.string().regex(ISO_DATE, 'verwacht formaat YYYY-MM-DD'),
  amount: z.number().finite(),
  description: z.string().min(1).max(2000),
  counterparty_name: z.string().max(500).nullish(),
  counterparty_iban: z.string().max(64).nullish(),
  reference: z.string().max(1000).nullish(),
  transaction_type: z.string().max(50).nullish(),
  bank_code: z.string().max(50).nullish(),
  bank_seq: z.string().max(100).nullish(),
  running_balance: z.number().finite().nullish(),
  creditor_id: z.string().max(100).nullish(),
  fx_amount: z.number().finite().nullish(),
  fx_currency: z.string().max(10).nullish(),
  fx_rate: z.number().finite().nullish(),
  budget_id: z.string().uuid().nullish(),
  category_source: z.string().max(50).nullish(),
  /** Eigendom volgt de rekening, tenzij een gedeeld budget of een handmatige
   *  correctie de rij naar 'shared' tilt — die afweging staat in de import-UI. */
  ownership: z.enum(['personal', 'shared']).optional(),
  /**
   * De gebruiker heeft een laag-2-treffer gezien en 'm bewust alsnog aangevinkt.
   * Overruled ALLEEN laag 2 — laag 1 blijft onverbiddelijk.
   */
  allow_cross_source: z.boolean().optional(),
})

const ImportBodySchema = z.object({
  account_id: z.string().uuid('ongeldige rekening'),
  rows: z.array(ImportRowSchema).min(1, 'geen rijen om te importeren').max(MAX_ROWS_PER_REQUEST),
})

type ImportRowInput = z.infer<typeof ImportRowSchema>

/** Wat er met een niet-ingevoegde rij gebeurde — de import-UI vinkt 'm hierop uit. */
type SkippedRow = {
  import_hash: string
  bank_seq: string | null
  layer: 'exact' | 'household_partner' | 'cross_source'
  reason?: 'iban' | 'name'
}

/**
 * GET /api/transactions/import — welke rekeningen MOETEN via deze route.
 *
 * De regel leeft hier, op de server, en niet als tweede interpretatie in de
 * browser. De import-pagina vraagt de lijst op en kiest daarop haar schrijfpad.
 *
 * ## De regel is een UNIE van twee gevallen
 *
 * Eén motivatie, twee verschijningsvormen: zodra er MEER DAN ÉÉN schrijver in
 * dezelfde rijruimte kan zitten, moeten alle schrijvers dezelfde dedup-regels
 * volgen — anders levert dat gegarandeerd een dubbele reeks op.
 *
 * 1. **Actieve bankkoppeling.** De tweede schrijver is de bank-sync.
 *    Signaal is `bank_connection_accounts.is_active` — dezelfde bron als het
 *    herkomst-symbool op de rekeningkaart. Een verlopen token telt bewust mee:
 *    de koppeling bestaat nog en de sync-route schrijft er na herautorisatie
 *    gewoon weer in.
 * 2. **`bank_accounts.ownership = 'shared'`.** De tweede schrijver is de
 *    huishoudpartner. Op een gedeelde rekening mogen beide partners importeren
 *    (de SELECT-policy is huishoud-verbreed), en alleen het serverpad draait
 *    laag 1b — het clientpad filtert op `.eq('user_id', …)` en ziet de rijen van
 *    de partner dus nooit. Een gedeelde rekening hoeft NIET gekoppeld te zijn;
 *    dit geval staat volledig los van (1) en is waarschijnlijk het gewone geval.
 *
 * De gedeelde rekeningen komen via de RLS-client uit `bank_accounts` zelf —
 * geen tweede, stil uiteenlopende eigendomsregel hier. RLS levert eigen rijen
 * plus huishoud-gedeelde rijen, wat precies de verzameling is waar deze
 * gebruiker op mag importeren.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const [linked, shared] = await Promise.all([
    supabase
      .from('bank_connection_accounts')
      .select('bank_account_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('bank_account_id', 'is', null),
    supabase
      .from('bank_accounts')
      .select('id')
      .eq('ownership', 'shared')
      .eq('is_active', true),
  ])

  if (linked.error) return serverError(linked.error, 'transactions-import:GET')
  if (shared.error) return serverError(shared.error, 'transactions-import:GET')

  const ids = new Set<string>()
  for (const row of (linked.data ?? []) as { bank_account_id: string | null }[]) {
    if (row.bank_account_id) ids.add(row.bank_account_id)
  }
  for (const row of (shared.data ?? []) as { id: string }[]) {
    ids.add(row.id)
  }

  // Bewust NIET `linked_account_ids`: het veld draagt sinds de gedeelde-rekening-
  // uitbreiding twee gronden, en een veld dat "linked" heet maar ook "shared"
  // betekent is precies de stille betekeniswissel die dit dossier elders
  // verbiedt. De naam zegt nu wat het is: hier hoort het serverpad gebruikt.
  return NextResponse.json({ server_path_account_ids: [...ids] })
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(ImportBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { account_id: accountId, rows } = parsed.data

  try {
    // ── Mag deze gebruiker op deze rekening schrijven? ────────────────────────
    // Via RLS, niet via een eigen `.eq('user_id', …)`: een huishouden-gedeelde
    // rekening hoort importeerbaar te blijven, en de eigendomsregel hoort in de
    // policy te leven en niet in een tweede, stil uiteenlopende kopie hier. Ziet
    // de gebruiker de rij niet, dan bestaat ze voor hem niet.
    //
    // `ownership` komt mee omdat het precies dát verbrede schrijfrecht is dat
    // laag 1b nodig maakt: op een gedeelde rekening kan de partner al dezelfde
    // reeks hebben weggeschreven.
    const { data: account, error: accountError } = await supabase
      .from('bank_accounts')
      .select('id, ownership, partner_visibility, user_id')
      .eq('id', accountId)
      .eq('is_active', true)
      .maybeSingle()

    if (accountError) return serverError(accountError, 'transactions-import:POST')
    if (!account) return forbidden('Deze rekening bestaat niet of is niet van jou')

    // ── Mag de PARTNER hier importeren? ───────────────────────────────────────
    // Op een gedeelde rekening die niet op 'full' staat, ziet de partner de
    // boekingen van de eigenaar niet meer (ADR 0118, lees-tijd-gate). Daarmee
    // breekt dedup-laag 1b: `loadHouseholdSharedDedupKeys` leest via RLS en
    // krijgt een lege set terug, waarna dezelfde bankregel stil dubbel wordt
    // weggeschreven — en beide reeksen tellen mee in uitgaven en spaarquote.
    //
    // Dit NIET repareren met een SECURITY DEFINER-hashfunctie: `import_hash` is
    // zelf een correlatiesleutel (juist daarom is 'ie in 20260802190000 uit de
    // partnerprojectie gehaald) en over een bekend formaat te brute-forceren.
    // Op 'balance' is de rekeninghouder daarom de enige importeur. Eerlijk en
    // uitlegbaar in plaats van stil verdubbeld.
    const accountRow = account as {
      ownership?: string | null
      partner_visibility?: string | null
      user_id?: string | null
    }
    if (
      accountRow.ownership === 'shared' &&
      accountRow.partner_visibility !== 'full' &&
      accountRow.user_id !== user.id
    ) {
      return forbidden(
        'Op deze gedeelde rekening deelt de eigenaar alleen het saldo, niet de boekingen. Alleen de rekeninghouder kan hier importeren.',
      )
    }

    // ── Zijn de meegestuurde budgetten van deze gebruiker? ────────────────────
    // Zelfde redenering: RLS bepaalt wat zichtbaar is. Zonder deze controle kan
    // een client een transactie op een vreemd budget hangen.
    const budgetIds = [...new Set(rows.map((r) => r.budget_id).filter((b): b is string => !!b))]
    if (budgetIds.length > 0) {
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('id')
        .in('id', budgetIds)

      if (budgetError) return serverError(budgetError, 'transactions-import:POST')
      if ((budgets ?? []).length !== budgetIds.length) {
        return badRequest('Eén of meer budgetten bestaan niet of zijn niet van jou')
      }
    }

    // ── Hash server-side herberekenen ────────────────────────────────────────
    // Zelfde functie als de parsers gebruiken (`lib/parsers/shared.ts`), dus voor
    // een eerlijke client verandert er niets. Het punt is dat de hash niet
    // afhangt van wat de client zegt, maar van wat er wordt weggeschreven.
    const hashes = await Promise.all(
      rows.map((r) => computeHash(r.date, r.amount, r.description)),
    )

    const dates = rows.map((r) => r.date).sort()
    const scope = {
      userId: user.id,
      accountId,
      minDate: dates[0],
      maxDate: dates[dates.length - 1],
    }

    // Alleen op een GEDEELDE rekening kan een tweede schrijver bestaan. Op een
    // persoonlijke rekening wordt de partner-query dus niet eens gesteld — geen
    // extra round-trip, en geen leesronde over rijen van een ander waar geen
    // enkele aanleiding voor is.
    const isSharedAccount = accountRow.ownership === 'shared'

    // De leesronden zijn onafhankelijk en delen de scope-regel uit
    // `lib/truelayer/existing-hashes.ts` (rekening + datumvenster, gepagineerd).
    // Eén parallelle ronde in plaats van een waterval.
    const [existingKeys, crossSourceCandidates, householdPartnerKeys] = await Promise.all([
      loadExistingDedupKeys(supabase, scope),
      loadCrossSourceCandidates(supabase, scope),
      isSharedAccount ? loadHouseholdSharedDedupKeys(supabase, scope) : Promise.resolve(new Set<string>()),
    ])

    // ── Laag 1 ────────────────────────────────────────────────────────────────
    // Ook binnen de batch: twee identieke sleutels in één insert botsen op de
    // unieke index en nemen de hele chunk mee.
    const seenInBatch = new Set<string>()
    const skipped: SkippedRow[] = []
    const afterLayer1: { row: ImportRowInput; import_hash: string }[] = []
    let duplicatesExact = 0
    let duplicatesHouseholdPartner = 0

    rows.forEach((row, i) => {
      const key = dedupKey({ import_hash: hashes[i], bank_seq: row.bank_seq ?? null })
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        skipped.push({ import_hash: hashes[i], bank_seq: row.bank_seq ?? null, layer: 'exact' })
        duplicatesExact++
        return
      }
      // ── Laag 1b ────────────────────────────────────────────────────────────
      // Ná de eigen-rij-controle, zodat een rij die óók zelf al bestaat de
      // directere laag-1-reden houdt en niet twee keer geteld wordt. Op een
      // persoonlijke rekening is deze set altijd leeg en is dit een no-op.
      if (householdPartnerKeys.has(key)) {
        skipped.push({ import_hash: hashes[i], bank_seq: row.bank_seq ?? null, layer: 'household_partner' })
        duplicatesHouseholdPartner++
        return
      }
      seenInBatch.add(key)
      afterLayer1.push({ row, import_hash: hashes[i] })
    })

    // ── Laag 2 ────────────────────────────────────────────────────────────────
    // Draait ALTIJD ná laag 1, nooit ervoor: een rij die laag 1 al heeft
    // afgevangen telt niet nóg eens mee (en toont anders de zwakkere reden).
    //
    // De partitionering draait óók over de geforceerde rijen. Dat is bewust: een
    // bestaande rij die door een geforceerde kandidaat is "verklaard" mag niet
    // ook nog een tweede kandidaat afvangen. Het gevolg — twee kandidaten, één
    // bestaande rij, de geforceerde pakt 'm — laat de tweede gewoon binnen. Dat
    // is de fout-negatieve kant, en dat is de kant waar deze module consequent
    // naar leunt.
    const decisions = partitionCrossSourceDuplicates(
      afterLayer1.map((e) => ({
        date: e.row.date,
        amount: e.row.amount,
        counterparty_iban: e.row.counterparty_iban ?? null,
        counterparty_name: e.row.counterparty_name ?? null,
        entry: e,
      })),
      crossSourceCandidates as CrossSourceCandidate[],
    )

    const crossSourceCounts = countCrossSourceDecisions(
      // Een geforceerde rij is geen overgeslagen duplicaat en telt dus ook niet
      // als er één — anders zou de teller "hoeveel hebben we tegengehouden"
      // stilletjes "hoeveel hebben we herkend" gaan betekenen.
      decisions.map((d) => ({
        candidate: d.candidate,
        reason: d.candidate.entry.row.allow_cross_source ? null : d.reason,
      })),
    )

    const toInsert: { row: ImportRowInput; import_hash: string }[] = []
    for (const decision of decisions) {
      const entry = decision.candidate.entry
      if (decision.reason && !entry.row.allow_cross_source) {
        skipped.push({
          import_hash: entry.import_hash,
          bank_seq: entry.row.bank_seq ?? null,
          layer: 'cross_source',
          reason: decision.reason,
        })
        continue
      }
      toInsert.push(entry)
    }

    // ── Wegschrijven ──────────────────────────────────────────────────────────
    const insertRows = toInsert.map(({ row, import_hash }) => ({
      user_id: user.id,
      account_id: accountId,
      ownership: row.ownership ?? 'personal',
      date: row.date,
      amount: row.amount,
      description: row.description,
      counterparty_name: row.counterparty_name ?? null,
      counterparty_iban: row.counterparty_iban ?? null,
      budget_id: row.budget_id ?? null,
      is_income: row.amount > 0,
      category_source: row.category_source ?? (row.budget_id ? 'rule' : 'import'),
      // Herkomst (B5). `category_source` beschrijft hóé het budget bepaald is,
      // `source` wáár de transactie vandaan komt. Staat op élke via deze route
      // weggeschreven rij — ook op een bewust overrulede duplicaat.
      source: 'import' as const,
      import_hash,
      reference: row.reference ?? null,
      transaction_type: row.transaction_type ?? null,
      bank_code: row.bank_code ?? null,
      bank_seq: row.bank_seq ?? null,
      running_balance: row.running_balance ?? null,
      creditor_id: row.creditor_id ?? null,
      fx_amount: row.fx_amount ?? null,
      fx_currency: row.fx_currency ?? null,
      fx_rate: row.fx_rate ?? null,
    }))

    let insertedCount = 0
    let failedCount = 0
    /** Teruggegeven aan de client voor het post-import categoriseerscherm — het
     *  spiegelt exact de `.select()` die de pagina vóór deze route zelf deed. */
    const inserted: Record<string, unknown>[] = []

    for (let i = 0; i < insertRows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = insertRows.slice(i, i + INSERT_CHUNK_SIZE)
      const { data, error } = await supabase
        .from('transactions')
        .insert(chunk)
        .select('id, date, description, counterparty_name, counterparty_iban, amount, import_hash, budget_id, reference, transaction_type')

      if (error) {
        // Niet-fataal, net als bij de sync: al weggeschreven chunks mogen niet
        // verdampen in een 500. Wél geteld en gerapporteerd — een stil
        // weggevallen batch die als "geslaagd" terugkomt is precies het gat dat
        // fase 1 aan de synckant dichtte.
        console.error('[transactions-import:POST] insert-chunk mislukt:', error)
        failedCount += chunk.length
        continue
      }

      const returned = (data ?? []) as Record<string, unknown>[]
      insertedCount += returned.length
      inserted.push(...returned)
    }

    return NextResponse.json({
      inserted: insertedCount,
      failed: failedCount,
      /** Laag 1 — al aanwezig of dubbel binnen deze batch. */
      duplicates: duplicatesExact,
      /**
       * Laag 1b — stond al op deze GEDEELDE rekening, weggeschreven door de
       * andere huishoudpartner. Bewust een apart veld naast `duplicates`: die
       * betekent "van jezelf" en wordt elders zo gelezen; ze samenvoegen zou een
       * bestaande betekenis stil verschuiven. Op een persoonlijke rekening is
       * dit altijd 0.
       */
      duplicates_household_partner: duplicatesHouseholdPartner,
      /** Laag 2, gesplitst naar reden; `total` is de som. De naam-terugval staat
       *  apart omdat dat de zwakste grond voor een treffer is. */
      duplicates_cross_source: crossSourceCounts,
      skipped,
      rows: inserted,
    })
  } catch (err) {
    return serverError(err, 'transactions-import:POST')
  }
}
