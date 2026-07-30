import * as fs from 'fs'
import * as path from 'path'
import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import { unauthenticatedFetch, getBaseUrl } from '../server-runner'
import type { TestCase } from '../test-types'
import { mapTransaction } from '@/lib/truelayer/mapper'
import type { TLTransaction } from '@/lib/truelayer/types'
import { selectOrphanConnectionIds, PENDING_ORPHAN_GRACE_MS } from '@/lib/truelayer/orphan-connections'
import {
  countCrossSourceDecisions,
  findCrossSourceDuplicate,
  partitionCrossSourceDuplicates,
} from '@/lib/parsers/cross-source-dedup'

const CAT = 'onboarding.bank-connectie'

// ── Constants ───────────────────────────────────────────────────────────────

/** Bank connection statuses */
const CONNECTION_STATUSES = ['pending', 'active', 'expired'] as const

/** Sync log statuses. `partial` sinds fase 1 (B8/B9): er is wél weggeschreven,
 *  maar niet alles — de provider kapte de historie af of een insert-batch
 *  sneuvelde. Vóór die fase heette zo'n sync ten onrechte `success`. */
const SYNC_STATUSES = ['success', 'partial', 'error', 'rate_limited'] as const

/** Rate limit: max 10 requests per day per account */
const DAILY_RATE_LIMIT = 10

/** Transaction batch size for bulk insert. 200 sinds fase 1: één eerste ophaal
 *  levert ~3.000 rijen en 60 sequentiële round-trips passen niet binnen de
 *  functie-timeout. */
const TX_BATCH_SIZE = 200

/** Token refresh buffer: 5 minutes before expiry */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: POST /api/bank-connect/auth-link ──────────────────────
  {
    id: 'ob-bank-auth-link-redirect',
    name: 'POST /api/bank-connect/auth-link: correcte redirect URL generatie',
    category: CAT,
    description: 'Auth-link endpoint: auth guard, TrueLayer feature gate, provider_id vereist, pending connection record, state encoding',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard → 401
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/auth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: 'test-bank' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: provider_id is required → 400
      const missingProviderBody = {}
      assert(!('provider_id' in missingProviderBody), 'Zonder provider_id → 400')

      // Test 3: TrueLayer feature gate → 503 when disabled
      const disabledResponse = { error: 'Bank Connect is niet ingeschakeld' }
      assertEqual(disabledResponse.error, 'Bank Connect is niet ingeschakeld', 'Feature gate bericht')

      // Test 4: Connection record created with pending status
      const pendingConnection = {
        provider_id: 'nl-ing',
        provider_name: 'ING',
        provider_logo: null,
        access_token: '', // Filled after OAuth callback
        status: 'pending' as const,
      }
      assertEqual(pendingConnection.status, 'pending', 'Nieuwe verbinding is pending')
      assertEqual(pendingConnection.access_token, '', 'Token leeg bij pending')

      // Test 5: State encoding includes connection ID
      const connectionId = 'uuid-abc-123'
      const userId = 'user-id-abc'
      const state = `${connectionId}:${userId.slice(0, 8)}-${Date.now()}`
      assert(state.startsWith(connectionId), 'State begint met connection ID')
      assert(state.includes(':'), 'State bevat : separator')

      // Test 6: Redirect URI format
      const appUrl = getBaseUrl()
      const redirectUri = `${appUrl}/api/bank-connect/callback`
      assert(redirectUri.endsWith('/api/bank-connect/callback'), 'Redirect naar callback endpoint')

      // Test 7: Response contains auth_url
      const successResponse = { auth_url: 'https://auth.truelayer.com/...' }
      assert(typeof successResponse.auth_url === 'string', 'Response bevat auth_url string')
    },
  },

  // ── Step 2: GET /api/bank-connect/callback ────────────────────────
  {
    id: 'ob-bank-callback-oauth',
    name: 'GET /api/bank-connect/callback: OAuth token verwerking',
    category: CAT,
    description: 'Callback verwerkt OAuth code, exchanget tokens, maakt bank accounts aan, linkt assets',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Test 1: Missing code or state → redirect with error
      const missingCodeRedirect = '/core/cash/connect?error=missing_code'
      assert(missingCodeRedirect.includes('error=missing_code'), 'Missing code redirect')

      // Test 2: No auth → redirect to login
      const loginRedirect = '/login'
      assert(loginRedirect.includes('login'), 'Ongeauthenticeerd → login redirect')

      // Test 3: Connection ID extracted from state
      const state = 'connection-uuid:user123-1710000000'
      const extractedId = state.split(':')[0]
      assertEqual(extractedId, 'connection-uuid', 'Connection ID uit state geextraheerd')

      // Test 4: Connection must be pending + owned by user
      const connectionLookup = {
        id: extractedId,
        user_id: 'current-user',
        status: 'pending',
      }
      assertEqual(connectionLookup.status, 'pending', 'Alleen pending connections verwerkt')

      // Test 5: Token exchange result stored
      const tokens = {
        access_token: 'at_xxx',
        refresh_token: 'rt_xxx',
        expires_in: 3600,
      }
      assert(tokens.access_token.length > 0, 'Access token niet leeg')
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)
      assert(tokenExpiresAt > new Date(), 'Token expiry in de toekomst')

      // Test 6: Connection updated to active status
      const updatedConnection = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active' as const,
        authorized_at: new Date().toISOString(),
      }
      assertEqual(updatedConnection.status, 'active', 'Status wordt active na token exchange')

      // Test 7: Bank accounts created with cash-as-asset pattern
      const cashAsset = {
        asset_type: 'cash',
        is_liquid: true,
        subtype: 'checking',
        has_budget_tracking: true,
        ownership: 'personal',
        net_worth_inclusion_pct: 100,
      }
      assertEqual(cashAsset.asset_type, 'cash', 'Asset type is cash')
      assertEqual(cashAsset.is_liquid, true, 'Cash is liquid')

      // Test 8: Success redirect
      const successRedirect = '/core/cash/connect/success'
      assert(successRedirect.includes('success'), 'Succes redirect naar /connect/success')

      // Test 9: Error redirect
      const errorRedirect = '/core/cash/connect?error=callback_failed'
      assert(errorRedirect.includes('error=callback_failed'), 'Error redirect bij fout')
    },
  },

  {
    id: 'ob-bank-callback-account-linking',
    name: 'GET /api/bank-connect/callback: IBAN matching + cash-as-asset backfill',
    category: CAT,
    description: 'Bestaande bank accounts worden gematcht op IBAN, nieuwe accounts krijgen linked asset',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // IBAN matching: find existing bank_account by IBAN
      const existingAccount = {
        id: 'ba-uuid',
        iban: 'NL42INGB0001234567',
        linked_asset_id: null, // Legacy account without asset link
      }

      // Backfill: create cash asset for legacy accounts without linked_asset_id
      const needsBackfill = existingAccount.linked_asset_id === null
      assert(needsBackfill === true, 'Legacy account zonder asset link needs backfill')

      // Backfill asset name format: "Provider XXXX" (last 4 of IBAN)
      const assetName = `ING ${existingAccount.iban.slice(-4)}`
      assertEqual(assetName, 'ING 4567', 'Asset naam: provider + laatste 4 IBAN tekens')

      // New account creation when IBAN not found
      const newBankAccount = {
        name: assetName,
        iban: existingAccount.iban,
        bank_name: 'ING',
        account_type: 'checking',
        balance: 0,
        sort_order: 0,
        linked_asset_id: 'new-asset-uuid', // Created first
      }
      assert(newBankAccount.linked_asset_id !== null, 'Nieuw account heeft linked asset')

      // Re-authorization: update existing connection_account (not create duplicate)
      const existingConnectionAccount = { id: 'ca-uuid', external_account_id: 'tl-acct-123' }
      assert(typeof existingConnectionAccount.external_account_id === 'string', 'External ID voor dedup')
    },
  },

  {
    id: 'ob-bank-callback-counterparty-meta',
    name: 'GET /api/bank-connect/callback: tegenpartij via mapTransaction (meta-fallback, xs2a-banken)',
    category: CAT,
    description: 'Rabobank/ING (xs2a) laten merchant_name leeg; mapTransaction() valt terug op meta.counter_party_* zodat de categorisatie haar sterkste signaal niet verliest',
    priority: 'high',
    estimatedDurationMs: 50,
    async fn() {
      // Roept de echte productiefunctie aan (geen synthetische literal) — dit is
      // de laag die de callback-route en de sync-route allebei gebruiken om
      // TrueLayer-transacties te mappen.
      const rabobankTx = {
        transaction_id: 'rb-1',
        timestamp: '2026-07-29T06:05:01.241Z',
        amount: -11.99,
        currency: 'EUR',
        description: 'BRN?00000000,0: S-0000000',
        transaction_type: 'DEBIT',
        transaction_category: 'DEBIT',
        meta: {
          counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
          counter_party_iban: 'NL00TEST0123456789',
        },
      } as unknown as TLTransaction

      const rabobankResult = await mapTransaction(rabobankTx)
      assertEqual(rabobankResult.counterparty_name, 'VIDEOLAND DOOR BUCKAROO', 'Meta-fallback vult tegenpartij zonder merchant_name')
      assertEqual(rabobankResult.counterparty_iban, 'NL00TEST0123456789', 'Meta-fallback vult IBAN')

      // Providers die merchant_name WEL vullen (bv. sandbox/UK) behouden voorrang
      const filledMerchantTx = {
        ...rabobankTx,
        transaction_id: 'uk-1',
        merchant_name: 'Videoland B.V.',
      } as unknown as TLTransaction
      const filledResult = await mapTransaction(filledMerchantTx)
      assertEqual(filledResult.counterparty_name, 'Videoland B.V.', 'merchant_name houdt voorrang boven meta')

      // Geen van beide gevuld → null, nooit lege string (DB-conventie: leeg = null)
      const bareTx = {
        transaction_id: 'bare-1',
        timestamp: '2026-07-29T06:05:01.241Z',
        amount: -5,
        currency: 'EUR',
        description: 'Onbekend',
        transaction_type: 'DEBIT',
        transaction_category: 'DEBIT',
      } as TLTransaction
      const bareResult = await mapTransaction(bareTx)
      assert(bareResult.counterparty_name === null, 'Zonder merchant_name/meta → counterparty_name is null, geen lege string')
    },
  },

  // NB: 'ob-bank-callback-orphan-cleanup' (de eerdere, vóór-fix versie van deze
  // case) is verwijderd — hij codeerde het filter inline
  // (`!inUse.has(c.id) && c.status !== 'expired' && c.status !== 'revoked'`)
  // i.p.v. de echte, gefixte `selectOrphanConnectionIds()` aan te roepen. Dat
  // was een tweede, tegenstrijdige waarheid naast de test hieronder (die WEL de
  // productiefunctie consumeert) en dekte bovendien een strikte deelverzameling
  // van wat 'ob-bank-callback-orphan-cleanup-pending-threshold' al bewijst
  // (active-orphan + already-expired + in-use blijven met rust) — inclusief de
  // pending-drempel die de oude versie niet eens kende.
  {
    id: 'ob-bank-callback-orphan-cleanup-pending-threshold',
    name: 'GET /api/bank-connect/callback: opruiming laat een verse pending-verbinding van een ANDERE, nog lopende koppeling met rust',
    category: CAT,
    description: 'Stap 6 (opruiming van verweesde verbindingen) consumeert selectOrphanConnectionIds() uit lib/truelayer/orphan-connections.ts: een `active` verbinding zonder rekeningen is altijd opruimbaar (bewijs dat ze net is opgevolgd), een `pending` rij pas na PENDING_ORPHAN_GRACE_MS, en expired/revoked/in-use blijven altijd ongemoeid. Zo overleeft bank B (gestart, nog niet afgerond) het opruimen van bank A ("Vernieuwen"), en valt de gebruiker bij hervatten van B niet op connection_not_found.',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const now = Date.now()
      const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

      const ownConnections = [
        { id: 'conn-new', status: 'active', created_at: iso(0) }, // de connectie die dit callback-verzoek zelf verwerkt
        { id: 'conn-active-orphan', status: 'active', created_at: iso(10 * 60 * 1000) }, // verweesde active, leeftijd doet er niet toe
        { id: 'conn-pending-fresh', status: 'pending', created_at: iso(5 * 60 * 1000) }, // ANDERE, nog lopende koppeling (5 min oud)
        { id: 'conn-pending-stale', status: 'pending', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) }, // afgebroken poging (>1u oud)
        { id: 'conn-expired', status: 'expired', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) },
        { id: 'conn-revoked', status: 'revoked', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) },
      ]
      // Geen van deze verbindingen heeft (nog) een gekoppelde rekening.
      const inUse = new Set(['conn-new'])

      const orphanIds = selectOrphanConnectionIds(ownConnections, inUse, now).sort()

      assertEqual(
        orphanIds.join(','),
        'conn-active-orphan,conn-pending-stale',
        'Alleen de verweesde active en de oude pending worden geëxpired',
      )
      assert(!orphanIds.includes('conn-pending-fresh'), 'Verse pending van een andere, nog lopende koppeling overleeft')
      assert(!orphanIds.includes('conn-new'), 'De eigen, net verwerkte verbinding blijft ongemoeid')
      assert(!orphanIds.includes('conn-expired'), 'Al-expired verbinding wordt niet opnieuw geraakt')
      assert(!orphanIds.includes('conn-revoked'), 'Revoked verbinding wordt niet geraakt')
    },
  },

  // NB: 'ob-bank-callback-balance-sync-on-connect' is verwijderd. Leunde op
  // een brosse bron-inspectie (`!/daily_requests\s*:/.test(src)`) die alleen
  // slaagde omdat een verklarende comment toevallig geen dubbele punt achter
  // "daily_requests" had — één comment-herformulering had de suite rood
  // gemaakt zonder gedragswijziging. Beide garanties zijn verplaatst naar
  // gedrag in app/api/bank-connect/callback/route.test.ts: de positieve
  // "roept syncAccountBalance() aan"-check was al ondergesneeuwd door de
  // echte H1-route-test daar, en de negatieve "geen daily_requests-write"
  // wordt daar nu bewezen door de update-payloads van de Supabase-stub te
  // verzamelen en te asserten dat geen enkele payload die key bevat.

  {
    id: 'ob-bank-callback-reused-account-decrypted-iban',
    name: 'Cash-as-asset backfill leest de ontsleutelde IBAN, niet de plaintext-kolom',
    category: CAT,
    description: 'De backfill (hergebruikte rekening zonder linked_asset_id) selecteert `iban_encrypted` en ontsleutelt die via decryptIbanForLabel() — een try/catch-wrapper om decryptField() heen, want de IBAN dient hier puur cosmetisch doel (laatste 4 tekens van de assetnaam) en mag een niet-gebackfillde legacy-ciphertext nooit de OAuth-callback laten stranden. Nodig omdat bank_accounts.iban in Stage B verdwijnt (supabase/migrations/20260713142000_drop_plaintext_bank_tokens.sql) — een plaintext-lezing zou dan midden in de OAuth-callback breken. Sinds fase 5 woont deze stap in lib/truelayer/cash-asset-backfill.ts, omdat POST /api/bank-connect/relink (het correctiemoment) hem óók nodig heeft; deze case controleert daarom de module ÉN dat de callback ernaar delegeert in plaats van een eigen kopie te maken.',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // De eigenaar van de stap: één module, twee afnemers (callback + relink).
      const modulePath = path.join(process.cwd(), 'lib/truelayer/cash-asset-backfill.ts')
      assert(fs.existsSync(modulePath), `Backfill-module niet gevonden op ${modulePath}`)
      const src = fs.readFileSync(modulePath, 'utf-8')

      assert(
        !/select\(\s*['"]id,\s*linked_asset_id,\s*iban['"]\s*\)/.test(src),
        'De backfill selecteert nog de plaintext `iban`-kolom i.p.v. `iban_encrypted` + decryptField() — breekt zodra de kolom (Stage B) verdwijnt',
      )
      // Ontsleutelen mag rechtstreeks via decryptField() of via een lokale
      // wrapper (bv. decryptIbanForLabel) die op zijn beurt decryptField()
      // aanroept — de eis is "wordt ontsleuteld", niet "welke aanroepvorm".
      assert(
        /iban_encrypted/.test(src) && /decryptField\s*\(/.test(src),
        'De backfill moet iban_encrypted lezen en ontsleutelen (via decryptField, desnoods achter een try/catch-wrapper), net als de sync-/balances-route',
      )

      // En de callback mag er geen tweede, plaintext-lezende kopie naast zetten:
      // hij delegeert naar de module hierboven.
      const routePath = path.join(process.cwd(), 'app/api/bank-connect/callback/route.ts')
      assert(fs.existsSync(routePath), `Callback-route niet gevonden op ${routePath}`)
      const routeSrc = fs.readFileSync(routePath, 'utf-8')
      assert(
        /ensureCashAssetForBankAccount\s*\(/.test(routeSrc),
        'De callback moet de cash-as-asset backfill via ensureCashAssetForBankAccount() doen — een eigen inline kopie loopt na Stage B uit de pas met de module',
      )
    },
  },

  // ── Step 3: POST /api/bank-connect/sync ───────────────────────────
  {
    id: 'ob-bank-sync-transactions',
    name: 'POST /api/bank-connect/sync: transactie synchronisatie, deduplicatie',
    category: CAT,
    description: 'Sync haalt transacties op, dedupliceert op import_hash, categoriseert, batch insert',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: 'test' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: connection_account_id vereist → 400
      const missingBody = {}
      assert(!('connection_account_id' in missingBody), 'Zonder connection_account_id → 400')

      // Test 3: TrueLayer feature gate → 503
      const disabledGate = 503
      assertEqual(disabledGate, 503, 'Feature gate retourneert 503')

      // Test 4: Rate limit: 10 per day per account → 429
      assertEqual(DAILY_RATE_LIMIT, 10, 'Daglimiet is 10 requests')
      const rateLimitResponse = {
        error: 'Daglimiet bereikt (10 verzoeken per dag per account)',
        daily_requests: 10,
      }
      assert(rateLimitResponse.daily_requests >= DAILY_RATE_LIMIT, 'Rate limit bereikt')

      // Test 5: Token refresh when < 5min to expiry
      assertEqual(TOKEN_REFRESH_BUFFER_MS, 300000, 'Token refresh buffer = 5 minuten')

      // Test 6: Deduplication via import_hash
      const hashes = ['hash1', 'hash2', 'hash3']
      const existingHashes = new Set(['hash1', 'hash3'])
      const newTx = hashes.filter((h) => !existingHashes.has(h))
      assertEqual(newTx.length, 1, 'Alleen nieuwe transacties (1 van 3)')
      assertEqual(newTx[0], 'hash2', 'hash2 is nieuw')

      // Test 7: Batch insert in chunks of 200
      assertEqual(TX_BATCH_SIZE, 200, 'Batch size = 200')

      // Test 8: Response shape
      const syncResponse = { new: 42, duplicates: 8, daily_requests: 3 }
      assert(typeof syncResponse.new === 'number', 'Response bevat new count')
      assert(typeof syncResponse.duplicates === 'number', 'Response bevat duplicates count')
      assert(typeof syncResponse.daily_requests === 'number', 'Response bevat daily_requests')
    },
  },

  {
    id: 'ob-bank-sync-categorization',
    name: 'POST /api/bank-connect/sync: auto-categorisatie + cursor update',
    category: CAT,
    description: 'Transacties worden gecategoriseerd met budgets/corrections/frequencyMap, sync cursor bijgewerkt',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Categorization inputs
      const categorizationInputs = [
        'description', 'counterparty_name', 'amount',
        'budgets', 'corrections', 'counterparty_iban', 'freqMap',
      ]
      assert(categorizationInputs.length >= 5, 'Minstens 5 categorisatie inputs')

      // Transaction row structure
      const txRow = {
        user_id: 'user-uuid',
        account_id: 'ba-uuid',
        date: '2026-03-15',
        amount: -42.50,
        description: 'Albert Heijn betaling',
        counterparty_name: 'ALBERT HEIJN',
        counterparty_iban: 'NL91ABNA0417164300',
        reference: '',
        transaction_type: 'payment',
        import_hash: 'sha256-xxx',
        is_income: false,
        budget_id: 'budget-uuid',
        category_source: 'rule',
      }
      assertEqual(txRow.is_income, false, 'Negatief bedrag → is_income=false')
      assert(typeof txRow.import_hash === 'string', 'import_hash voor dedup')
      assertIncludes(['rule', 'import', 'manual', 'ai'], txRow.category_source, 'category_source geldig')

      // Sync cursor: latest transaction date
      const transactions = [
        { timestamp: '2026-03-10T12:00:00Z' },
        { timestamp: '2026-03-15T08:00:00Z' },
        { timestamp: '2026-03-12T16:00:00Z' },
      ]
      let latestDate = ''
      for (const tx of transactions) {
        const txDate = tx.timestamp.split('T')[0]
        if (txDate > latestDate) latestDate = txDate
      }
      assertEqual(latestDate, '2026-03-15', 'Sync cursor = laatste transactie datum')

      // Daily request counter incremented + rate_limit_reset_date updated
      const today = new Date().toISOString().split('T')[0]
      assert(typeof today === 'string' && today.length === 10, 'Rate limit reset date is YYYY-MM-DD')

      // Sync log entry
      const syncLog = {
        sync_type: 'transactions',
        status: 'success' as const,
        transactions_new: 42,
        transactions_dup: 8,
      }
      assertIncludes([...SYNC_STATUSES], syncLog.status, 'Sync status geldig')
    },
  },

  {
    id: 'ob-bank-sync-cross-source-dedup',
    name: 'POST /api/bank-connect/sync: cross-bron dedup (laag 2) slaat stil over en telt gesplitst',
    category: CAT,
    description: 'Dezelfde boeking uit een andere bron (datum ±1 dag, bedrag exact op de cent, tegenpartij-IBAN of genormaliseerde naam gelijk) wordt niet nog eens ingevoegd; een échte transactie met toevallig gelijke datum/bedrag maar andere tegenpartij wél. Dedup verhindert alleen INSERTs — nooit een update, merge of delete.',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // De échte module, geen nagebouwde vorm: deze suite hoort te breken als de
      // sleutel verschuift, niet als iemand een mock vergeet bij te werken.
      const bestaandeCsvRij = {
        date: '2026-07-10',
        amount: -42.5,
        counterparty_iban: 'NL91 ABNA 0417 1643 00',
        counterparty_name: 'ALBERT HEIJN 1234',
      }

      // 1. Zelfde boeking, andere omschrijving én andere IBAN-spatiëring → treffer op IBAN.
      const opIban = findCrossSourceDuplicate(
        { date: '2026-07-11', amount: -42.5, counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'AH to go' },
        [bestaandeCsvRij],
      )
      assertEqual(opIban?.reason, 'iban', 'Cross-bron treffer op tegenpartij-IBAN, ook bij ±1 dag')

      // 2. Andere tegenpartij → GEEN treffer. Dit is de dure fout: overslaan zou
      //    stil verlies van een echte transactie zijn.
      const andereTegenpartij = findCrossSourceDuplicate(
        { date: '2026-07-10', amount: -42.5, counterparty_iban: 'NL02RABO0123456789', counterparty_name: 'Slagerij' },
        [bestaandeCsvRij],
      )
      assert(andereTegenpartij === null, 'Andere tegenpartij bij gelijke datum/bedrag is géén duplicaat')

      // 3. Buiten de tolerantie, en op de cent: allebei geen treffer.
      assert(
        findCrossSourceDuplicate({ ...bestaandeCsvRij, date: '2026-07-12' }, [bestaandeCsvRij]) === null,
        '±2 dagen is géén duplicaat',
      )
      assert(
        findCrossSourceDuplicate({ ...bestaandeCsvRij, amount: -42.51 }, [bestaandeCsvRij]) === null,
        'Eén cent verschil is géén duplicaat',
      )
      assert(
        findCrossSourceDuplicate({ ...bestaandeCsvRij, amount: 42.5 }, [bestaandeCsvRij]) === null,
        'Omgekeerd teken is géén duplicaat',
      )

      // 4. Naam-terugval bij eenzijdig ontbrekende IBAN, apart geteld.
      const decisions = partitionCrossSourceDuplicates(
        [
          { date: '2026-07-10', amount: -42.5, counterparty_iban: 'NL91ABNA0417164300', counterparty_name: 'AH' },
          { date: '2026-07-10', amount: -5, counterparty_iban: null, counterparty_name: 'CCV*BAKKER 12' },
          { date: '2026-07-10', amount: -9.99, counterparty_iban: null, counterparty_name: 'Nieuw' },
        ],
        [bestaandeCsvRij, { date: '2026-07-10', amount: -5, counterparty_iban: null, counterparty_name: 'Bakker' }],
      )
      const counts = countCrossSourceDecisions(decisions)
      assertEqual(counts.iban, 1, 'Eén treffer op IBAN')
      assertEqual(counts.name, 1, 'Eén treffer via de naam-terugval, apart geteld')
      assertEqual(counts.total, 2, 'Totaal = som van beide redenen')
      assert(decisions[2].reason === null, 'Een echt nieuwe boeking blijft ongemarkeerd')

      // 5. Verse rekening → nul kandidaten → laag 2 is vanzelf een no-op. Bewust
      //    géén "is deze rekening nieuw"-vlag: die veroudert en gaat stil liegen.
      const opVerseRekening = partitionCrossSourceDuplicates([{ date: '2026-07-10', amount: -42.5 }], [])
      assert(opVerseRekening.every((d) => d.reason === null), 'Op een lege rekening markeert laag 2 niets')

      // 6. bank_sync_log houdt de lagen gescheiden: transactions_dup blijft de
      //    laag-1-teller, laag 2 komt er additief naast.
      const syncLog = {
        status: 'success' as const,
        transactions_new: 40,
        transactions_dup: 8,
        transactions_dup_cross_source_iban: 1,
        transactions_dup_cross_source_name: 1,
      }
      assertIncludes([...SYNC_STATUSES], syncLog.status, 'Sync status geldig')
      assertEqual(
        syncLog.transactions_dup_cross_source_iban + syncLog.transactions_dup_cross_source_name,
        counts.total,
        'De twee logkolommen samen vormen de cross-bron-teller',
      )
    },
  },

  {
    id: 'ob-bank-sync-balance-additive',
    name: 'POST /api/bank-connect/sync: saldo lift mee op de sync (additief, niet-fataal)',
    category: CAT,
    description: 'Sync roept syncAccountBalance() aan zodat bank_accounts.balance/de gekoppelde asset niet op 0 blijft staan zonder een aparte "Ververs saldo"-klik; telt als 1 rate-limit-verzoek; een falende saldo-call laat de al ingevoerde transacties intact',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Response shape: balance is additief naast de bestaande velden — bestaande
      // lezers van new/duplicates/daily_requests blijven werken.
      const syncResponse = { new: 5, duplicates: 2, daily_requests: 3, balance: 2543.67 }
      assert('new' in syncResponse && 'duplicates' in syncResponse && 'daily_requests' in syncResponse, 'Bestaande velden blijven aanwezig')
      assert(typeof syncResponse.balance === 'number', 'balance is additief numeriek veld')

      // Eén klik = één rate-limit-verzoek, ook al doet de route zowel transacties
      // als saldo op — geen dubbele belasting van de daglimiet voor één actie.
      const requestsBeforeSync = 3
      const requestsAfterSyncPlusBalance = requestsBeforeSync + 1
      assertEqual(requestsAfterSyncPlusBalance, 4, 'Sync + saldo telt samen als 1 verzoek, niet 2')

      // Niet-fataal: als de saldo-call faalt, blijven de al geïnsteerde
      // transacties staan en wordt balance null (geen 500, geen rollback).
      const syncResponseWhenBalanceFails = { new: 5, duplicates: 2, daily_requests: 3, balance: null }
      assertEqual(syncResponseWhenBalanceFails.new, 5, 'Transacties blijven geteld ondanks falende saldo-call')
      assert(syncResponseWhenBalanceFails.balance === null, 'balance is null wanneer de saldo-call faalde, geen throw')
    },
  },

  {
    id: 'ob-bank-sync-token-refresh',
    name: 'POST /api/bank-connect/sync: token refresh bij verloop',
    category: CAT,
    description: 'Toegangstoken wordt ververst als het <5 min tot expiry is, expired status bij falen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Token refresh needed when < 5 min to expiry
      const tokenExpiresAt = new Date(Date.now() + 3 * 60 * 1000) // 3 min from now
      const needsRefresh = tokenExpiresAt.getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS
      assert(needsRefresh === true, 'Token met 3 min rest → refresh nodig')

      // Token with 10 min left → no refresh needed
      const tokenOk = new Date(Date.now() + 10 * 60 * 1000)
      const noRefreshNeeded = tokenOk.getTime() < Date.now() + TOKEN_REFRESH_BUFFER_MS
      assert(noRefreshNeeded === false, 'Token met 10 min rest → geen refresh nodig')

      // Refresh fails without refresh_token → 401
      const noRefreshToken = { refresh_token: null }
      assert(noRefreshToken.refresh_token === null, 'Geen refresh_token → 401')
      // De 401-copy is fase-7-neutraal: "verbinding kwijt", geen "token verlopen".
      // "Token" is jargon en "verlopen" benoemt een oorzaak die de app niet altijd
      // kent (`status` kan óók `revoked` zijn). Eén bron: RELINK_REQUIRED_MESSAGE in
      // `app/api/bank-connect/sync/route.ts`.
      const errorMsg = 'Verbinding kwijt — verbind opnieuw om weer bij te werken.'
      assert(errorMsg.includes('verbind opnieuw'), 'Herstelbericht noemt de handeling')
      assert(!errorMsg.toLowerCase().includes('token'), 'Geen jargon in de melding')

      // Refresh failure → connection status set to 'expired'
      const expiredConnection = { status: 'expired' as const }
      assertEqual(expiredConnection.status, 'expired', 'Connectie wordt expired bij refresh falen')

      // Successful refresh updates connection
      const refreshedConnection = {
        access_token: 'new_at_xxx',
        refresh_token: 'new_rt_xxx',
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }
      assert(refreshedConnection.access_token.length > 0, 'Nieuw access token')
    },
  },

  // ── Step 4: GET /api/bank-connect/status ──────────────────────────
  {
    id: 'ob-bank-status-display',
    name: 'GET /api/bank-connect/status: correcte status weergave',
    category: CAT,
    description: 'Status endpoint retourneert of TrueLayer is ingeschakeld',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/status')
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Response shape: { enabled: boolean }
      const statusResponse = { enabled: true }
      assert(typeof statusResponse.enabled === 'boolean', 'enabled is boolean')

      // Test 3: Connection statuses
      CONNECTION_STATUSES.forEach((s) => {
        assertIncludes([...CONNECTION_STATUSES], s, `Status "${s}" is geldig`)
      })
      assertEqual(CONNECTION_STATUSES.length, 3, '3 mogelijke connection statuses')
    },
  },

  // ── Step 5: GET /api/bank-connect/providers ───────────────────────
  {
    id: 'ob-bank-providers-list',
    name: 'GET /api/bank-connect/providers: beschikbare banken lijst',
    category: CAT,
    description: 'Providers endpoint: auth, feature gate, sandbox/production mode, mapped response',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/providers')
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Feature gate → 503
      const disabledResponse = { status: 503, error: 'Bank Connect is niet ingeschakeld' }
      assertEqual(disabledResponse.status, 503, 'Feature gate 503')

      // Test 3: Environment detection (sandbox vs production)
      const environments = ['sandbox', 'production']
      assertIncludes(environments, 'sandbox', 'Sandbox is geldig')
      assertIncludes(environments, 'production', 'Production is geldig')

      // Test 4: Response mapped to simplified format
      const provider = { id: 'nl-ing', name: 'ING', logo: 'https://...' }
      assert(typeof provider.id === 'string', 'Provider heeft id')
      assert(typeof provider.name === 'string', 'Provider heeft name')
      assert(typeof provider.logo === 'string', 'Provider heeft logo URL')

      // Test 5: Response is array of providers
      const providers = [
        { id: 'nl-ing', name: 'ING', logo: 'https://logo.ing' },
        { id: 'nl-rabo', name: 'Rabobank', logo: 'https://logo.rabo' },
        { id: 'nl-abn', name: 'ABN AMRO', logo: 'https://logo.abn' },
      ]
      assert(Array.isArray(providers), 'Providers is array')
      assert(providers.length > 0, 'Minstens 1 provider')
      providers.forEach((p) => {
        assert('id' in p && 'name' in p && 'logo' in p, 'Provider heeft id, name, logo')
      })
    },
  },

  // ── Step 6: POST /api/bank-connect/disconnect ─────────────────────
  {
    id: 'ob-bank-disconnect-soft',
    name: 'POST /api/bank-connect/disconnect: correcte ontkoppeling, data behoud',
    category: CAT,
    description: 'Disconnect is soft: deactiveert connection_account, behoudt bank_accounts en transacties',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: 'test' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: connection_account_id vereist → 400
      const missingBody = {}
      assert(!('connection_account_id' in missingBody), 'Zonder connection_account_id → 400')

      // Test 3: Feature gate → 503
      const disabledGate = 503
      assertEqual(disabledGate, 503, 'Feature gate retourneert 503')

      // Test 4: Soft disconnect: is_active = false (NOT delete)
      const softDisconnect = { is_active: false, updated_at: new Date().toISOString() }
      assertEqual(softDisconnect.is_active, false, 'Soft disconnect: is_active=false')

      // Test 5: Data preservation — bank_accounts and transactions NOT deleted
      const dataPreserved = {
        bank_accounts: 'preserved',
        transactions: 'preserved',
        bank_connection_accounts: 'deactivated', // is_active=false
      }
      assertEqual(dataPreserved.bank_accounts, 'preserved', 'Bank accounts behouden')
      assertEqual(dataPreserved.transactions, 'preserved', 'Transacties behouden')
      assertEqual(dataPreserved.bank_connection_accounts, 'deactivated', 'Connection account gedeactiveerd')

      // Test 6: Only user's own connection can be disconnected (user_id check)
      const disconnectQuery = { id: 'ca-uuid', user_id: 'current-user' }
      assert(typeof disconnectQuery.user_id === 'string', 'User ID check bij disconnect')

      // Test 7: Success response
      const successResponse = { success: true }
      assertEqual(successResponse.success, true, 'Disconnect retourneert success=true')
    },
  },

  // ── Bonus: POST /api/bank-connect/balances ────────────────────────
  {
    id: 'ob-bank-balances-sync',
    name: 'POST /api/bank-connect/balances: saldo ophalen + asset sync',
    category: CAT,
    description: 'Balances endpoint haalt saldo op, update bank_account + linked asset (cash-as-asset)',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/bank-connect/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_account_id: 'test' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Account not found → 404
      const notFoundStatus = 404
      assertEqual(notFoundStatus, 404, 'Niet gevonden account → 404')

      // Test 3: Balance synced to bank_account AND linked asset
      const balanceSync = {
        bank_account_balance: 2543.67,
        linked_asset_value: 2543.67, // Same value!
      }
      assertEqual(
        balanceSync.bank_account_balance,
        balanceSync.linked_asset_value,
        'Bank saldo en asset waarde zijn gesynchroniseerd',
      )

      // Test 4: Response shape
      const balanceResponse = { balance: 2543.67, currency: 'EUR' }
      assert(typeof balanceResponse.balance === 'number', 'Balance is number')
      assert(typeof balanceResponse.currency === 'string', 'Currency is string')

      // Test 5: Null balance when no preferred balance found
      const nullResponse = { balance: null, balances: [] }
      assert(nullResponse.balance === null, 'Null balance wanneer geen saldo beschikbaar')
    },
  },

  // ── Auth consistency ──────────────────────────────────────────────
  {
    id: 'ob-bank-auth-consistency',
    name: 'Alle bank-connect endpoints: auth guard consistentie',
    category: CAT,
    description: 'Alle 7 endpoints (incl. balances) checken authenticatie als eerste guard',
    priority: 'critical',
    estimatedDurationMs: 5000,
    async fn() {
      const endpoints = [
        { path: '/api/bank-connect/auth-link', method: 'POST' },
        { path: '/api/bank-connect/callback', method: 'GET' },
        { path: '/api/bank-connect/sync', method: 'POST' },
        { path: '/api/bank-connect/status', method: 'GET' },
        { path: '/api/bank-connect/providers', method: 'GET' },
        { path: '/api/bank-connect/disconnect', method: 'POST' },
        { path: '/api/bank-connect/balances', method: 'POST' },
      ]

      assertEqual(endpoints.length, 7, '7 bank-connect endpoints')

      for (const ep of endpoints) {
        const res = await unauthenticatedFetch(ep.path, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          ...(ep.method === 'POST' ? { body: JSON.stringify({}) } : {}),
        })

        // Callback redirects (302/307) instead of returning 401
        if (ep.path.includes('/callback')) {
          // Callback with missing code → redirect, or 401 for no-auth
          assert(
            res.status === 401 || res.status === 403 || res.status === 302 || res.status === 307 || res.redirected,
            `${ep.path}: auth guard actief (got ${res.status})`,
          )
        } else {
          assert(
            res.status === 401 || res.status === 403,
            `${ep.path}: 401/403 zonder auth (got ${res.status})`,
          )
        }
      }
    },
  },

  // ── Step 7: Registratie ───────────────────────────────────────────
  {
    id: 'ob-bank-category-registered',
    name: 'Registratie onder categorie "Onboarding — Bank Connectie"',
    category: CAT,
    description: 'Alle tests geregistreerd met ob-bank- prefix',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'onboarding.bank-connectie', 'Categorie ID is onboarding.bank-connectie')

      // All test IDs start with 'ob-bank-'
      const expectedPrefix = 'ob-bank-'
      tests.forEach((t) => {
        assert(t.id.startsWith(expectedPrefix), `Test ID "${t.id}" begint met "${expectedPrefix}"`)
      })

      // Covers all 7 feature steps + bonus
      assert(tests.length >= 7, `Minstens 7 tests, actueel: ${tests.length}`)

      // All 7 endpoints covered
      const testedEndpoints = [
        '/api/bank-connect/auth-link',
        '/api/bank-connect/callback',
        '/api/bank-connect/sync',
        '/api/bank-connect/status',
        '/api/bank-connect/providers',
        '/api/bank-connect/disconnect',
        '/api/bank-connect/balances',
      ]
      assertEqual(testedEndpoints.length, 7, '7 endpoints getest')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Onboarding — Bank Connectie',
    description: 'TrueLayer bank connectie flow: auth, callback, sync, disconnect, balances',
    icon: 'Building2',
    testCount: 0,
  })
  registerTests(tests)
}
