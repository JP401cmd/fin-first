'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Upload, FileText, Check, AlertTriangle,
  ChevronRight, ChevronLeft, Loader2, WifiOff, RefreshCw, Sparkles, Lightbulb,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseCSVWithWarnings, getCSVHeaders, getCSVPreview } from '@/lib/parsers/csv'
import { parseOFXWithWarnings } from '@/lib/parsers/ofx'
import { detectFormat, CSV_PRESETS, type CSVPreset } from '@/lib/parsers/index'
import type { ImportWarning } from '@/lib/parsers/shared'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { InfoTooltip } from '@/components/editorial/info-icon-tooltip'
import { categorizeTransaction, isOwnAccountTransfer, isWalletTransferType, buildFrequencyMap, type CategoryCorrection, type FrequencyMatch } from '@/lib/parsers/categorize'
import { type Budget, resolveEigenRekeningBudgetId } from '@/lib/budget-data'
import { buildOwnAccountIdentifiers } from '@/lib/own-accounts'
import { formatAmsterdamDayMonth, formatAmsterdamTime } from '@/lib/tz'
import { fetchOwnAccountIbansStrict, ibanById } from '@/lib/own-accounts-ibans'
import { linkUnmatchedTransfers } from '@/lib/transfer-matching'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { AICategorizeSheet } from '@/components/app/ai-categorize-sheet'
import { selectAllState, withAllSkip, type CrossSourceFlag } from './select-all'
import { countImportRows, selectionCounterLabel } from './import-counters'
import { rowCheckboxLabel } from './row-checkbox-label'
import {
  CROSS_SOURCE_DATE_TOLERANCE_DAYS,
  partitionCrossSourceDuplicates,
  shiftIsoDate,
  type CrossSourceCandidate,
} from '@/lib/parsers/cross-source-dedup'
import {
  POST_IMPORT_SELECT,
  pickUncategorized,
  mergeUncategorized,
  retainStillOpen,
  type InsertedTxRow,
  type PostImportTx,
} from '@/lib/post-import-categorize'

type Account = {
  id: string
  name: string
  iban: string | null
  ownership?: 'personal' | 'shared'
}

/**
 * Leidt het eigendom van een te importeren transactie af: een gedeeld budget op
 * een persoonlijke rekening maakt de transactie gezamenlijk (volgt het budget),
 * tenzij de gebruiker dat per rij handmatig heeft teruggezet. Anders volgt de
 * transactie het eigendom van de rekening.
 */
function deriveRowOwnership(
  accountOwnership: 'personal' | 'shared',
  budgetOwnership: 'personal' | 'shared' | undefined,
  manualOverride?: 'personal' | 'shared',
): 'personal' | 'shared' {
  if (manualOverride) return manualOverride
  if (budgetOwnership === 'shared' && accountOwnership === 'personal') return 'shared'
  return accountOwnership
}

type ImportRow = ParsedTransaction & {
  budget_id: string | null
  budgetName: string | null
  confidence: number
  category_source: string | null
  isDuplicate: boolean
  /**
   * Dedup-laag 2 (fase 3/B7): dezelfde boeking die al via de bankkoppeling
   * binnenkwam, met een andere omschrijvingstekst en dus een andere hash. Staat
   * voorgedeselecteerd mét reden, en is bewust overrulebaar — bij een import is
   * de gebruiker erbij, anders dan bij een sync.
   */
  crossSourceDuplicate: CrossSourceFlag | null
  /**
   * Dedup-laag 1b: stond al op deze GEDEELDE rekening omdat de huishoudpartner
   * 'm al had geïmporteerd. Komt uit het antwoord van de server-route
   * (`skipped[].layer === 'household_partner'`) en dus pas ná de importpoging —
   * anders dan `crossSourceDuplicate`, die al vóór het wegschrijven bekend is.
   * Niet overrulebaar: het is een exacte sleuteltreffer, geen oordeel.
   */
  householdPartnerDuplicate?: boolean
  skipImport: boolean
  isTransfer: boolean
  aiAccepted?: boolean
  userManuallyChanged?: boolean
  /** Handmatige eigendoms-override (klik op de gezamenlijk-badge zet 'm terug). */
  manualOwnership?: 'personal' | 'shared'
}

/**
 * Harde dedup-sleutel die de samengestelde unieke DB-index
 * `(user_id, import_hash, coalesce(bank_seq, ''))` exact spiegelt.
 *
 * Distinct-maar-identieke transacties (zelfde import_hash, ander Volgnr/bank_seq)
 * krijgen verschillende sleutels → kunnen naast elkaar bestaan. Re-imports (zelfde
 * import_hash én bank_seq) vallen samen → worden overgeslagen. Gebruik dit voor de
 * in-file dedup, de pre-insert safety-net en het filter tegen reeds-bestaande rijen,
 * zodat geen enkele insert op de unieke index stukloopt en geen distinct-rij sneuvelt.
 */
function rowDedupKey(r: { import_hash: string; bank_seq: string | null }): string {
  return `${r.import_hash}|${r.bank_seq ?? ''}`
}

// --- Import session persistence (localStorage) ---
const IMPORT_SESSION_KEY = 'fintwo_import_session'

type ImportSession = {
  id: string
  accountId: string
  fileName: string
  totalRows: number
  completedBatchIndex: number
  importedHashes: string[]
  startedAt: number
}

function saveImportSession(session: ImportSession) {
  try { localStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(session)) } catch { /* quota exceeded */ }
}

function loadImportSession(): ImportSession | null {
  try {
    const raw = localStorage.getItem(IMPORT_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as ImportSession
    // Expire sessions older than 24 hours
    if (Date.now() - session.startedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(IMPORT_SESSION_KEY)
      return null
    }
    return session
  } catch { return null }
}

function clearImportSession() {
  try { localStorage.removeItem(IMPORT_SESSION_KEY) } catch { /* ignore */ }
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError && (
    err.message.includes('Failed to fetch') ||
    err.message.includes('NetworkError') ||
    err.message.includes('Network request failed') ||
    err.message.includes('Load failed')
  )) {
    return true
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message).toLowerCase()
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      return true
    }
  }
  return false
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Bedragmaskering (per apparaat) — de rij-checkbox-labels moeten 'm volgen,
  // anders spreekt een schermlezer het bedrag alsnog voluit uit (M34).
  const { masked } = useMaskedAmounts()
  const [step, setStep] = useState(1)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetGroups, setBudgetGroups] = useState<{ parent: Budget; children: Budget[] }[]>([])
  // Eigen-rekening-post waar herkende verschuivingen op landen (archive → telt niet mee).
  const eigenRekeningBudgetId = useMemo(() => resolveEigenRekeningBudgetId(budgets), [budgets])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, failed: 0 })
  const [failedBatches, setFailedBatches] = useState<{ batchIdx: number; error: string; retries: number; rows: Record<string, unknown>[] }[]>([])
  const [showFailedDetails, setShowFailedDetails] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [importedBatchIndex, setImportedBatchIndex] = useState(0)
  const [importStartTime, setImportStartTime] = useState<number | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [error, setError] = useState('')
  // Niet-fatale parse-waarschuwingen: rijen die zijn overgeslagen omdat hun bedrag
  // onleesbaar was (bv. verkeerde kolom-toewijzing). Getoond in de controlestap zodat
  // een corrupte kolom NIET stil als €0-transactie wordt geïmporteerd.
  const [parseWarnings, setParseWarnings] = useState<ImportWarning[]>([])
  const [fileName, setFileName] = useState('')
  const [detectedFormat, setDetectedFormat] = useState<'mt940' | 'csv' | 'ofx' | 'unknown'>('mt940')
  const [fileContent, setFileContent] = useState('')
  const [csvPreset, setCsvPreset] = useState<CSVPreset>(CSV_PRESETS[0])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreview, setCsvPreview] = useState<string[][]>([])
  const [showColumnMapping, setShowColumnMapping] = useState(false)
  const [corrections, setCorrections] = useState<CategoryCorrection[]>([])
  const [freqMap, setFreqMap] = useState<Map<string, FrequencyMatch>>(new Map())
  const [ownIbans, setOwnIbans] = useState<Set<string>>(new Set())
  const [ownNamePatterns, setOwnNamePatterns] = useState<string[]>([])
  const [checkingDups, setCheckingDups] = useState(false)
  /**
   * Rekeningen die MOETEN via `POST /api/transactions/import` opslaan (B7).
   * Eén motivatie, twee gronden — beide draaien om een TWEEDE SCHRIJVER in
   * dezelfde rijruimte, want twee schrijvers met verschillende dedup-regels
   * leveren gegarandeerd een dubbele reeks op:
   *
   *  - een actieve **bankkoppeling** (tweede schrijver = de bank-sync);
   *  - **`ownership = 'shared'`** (tweede schrijver = de huishoudpartner, die op
   *    een gedeelde rekening evengoed mag importeren). Alleen het serverpad
   *    draait de huishoud-brede dedup-laag; het clientpad hieronder filtert op
   *    de eigen `user_id` en ziet partnerrijen dus nooit. Zo'n rekening hoeft
   *    NIET gekoppeld te zijn.
   *
   * Persoonlijke, ongekoppelde rekeningen houden het bestaande clientpad.
   *
   * De lijst komt van de server — "wanneer is het serverpad verplicht" hoort
   * niet als tweede interpretatie in de browser te leven.
   */
  const [serverPathAccountIds, setServerPathAccountIds] = useState<Set<string>>(() => new Set())
  /**
   * De lijst kon niet opgehaald worden. Dan kiezen we het SERVERPAD voor élke
   * rekening: dat pad is functioneel een superset (zelfde dedup, plus laag 2 en
   * server-side eigenaarschapscontrole). De enige reden dat het clientpad nog
   * bestaat is beperking van de blast radius — een mislukte lookup is geen reden
   * om de één-schrijver-regel te laten vallen.
   */
  const [serverPathLookupFailed, setServerPathLookupFailed] = useState(false)
  const [pendingSession, setPendingSession] = useState<ImportSession | null>(null)
  // Post-import categoriseren: de zojuist weggeschreven, nog ongecategoriseerde
  // rijen (budget_id null, geen overboeking) worden hier vastgehouden en aan de
  // canonieke AICategorizeSheet gevoerd — categoriseren gebeurt dus op rijen die
  // ÁL in de DB staan, zodat een onderbroken categorisatie geen import verliest.
  const [postImportRows, setPostImportRows] = useState<PostImportTx[]>([])
  const [showCategorizeSheet, setShowCategorizeSheet] = useState(false)
  /** Waar zolang we de categoriseerset opnieuw uit de database herleiden — de CTA
   *  mag in dat venster niet klikbaar zijn met een verouderd aantal. */
  const [refreshingPostImport, setRefreshingPostImport] = useState(false)
  /** Is er in deze sessie minstens één categoriseerronde afgerond? Bepaalt of een
   *  lege set "niets te doen" of "alles ingedeeld" betekent. */
  const [categorizeRoundDone, setCategorizeRoundDone] = useState(false)
  const PAGE_SIZE = 50
  const [currentPage, setCurrentPage] = useState(0)

  /**
   * Schrijft de gekozen rekening via de server-route weg (B7)? Zie de
   * toelichting bij `serverPathAccountIds` en `serverPathLookupFailed`. Op
   * component-niveau berekend omdat zowel de import-lus als de voortgangs-UI
   * (batchgrootte) hem nodig heeft.
   */
  const useServerPath = serverPathLookupFailed || serverPathAccountIds.has(selectedAccountId)
  /**
   * Clientpad: 100 rijen per insert — ongewijzigd sinds de incident-fix.
   * Serverpad: 500, want daar is elke batch één HTTP-verzoek dat zijn eigen
   * dedup-leesronde doet. Een import van 3.000 rijen kost zo zes verzoeken in
   * plaats van dertig leesronden over dezelfde historie.
   */
  const batchSize = useServerPath ? 500 : 100

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError('')
    setIsNetworkError(false)

    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()

      // `bank_accounts.iban` (plaintext) is hier vervangen door de ontsleutelde
      // IBANs uit `/api/own-accounts/ibans`: de encryptiesleutels zijn server-only,
      // dus deze `'use client'`-pagina kan `iban_encrypted` niet zelf lezen.
      //
      // Bewust de STRICTE variant, en bewust binnen deze `Promise.all` zodat een
      // fout in de `catch` van `loadInitialData` landt en de pagina zichtbaar
      // faalt. `ownIbans` bepaalt namelijk of een overboeking naar je eigen
      // rekening als verschuiving wordt geïmporteerd of als gewone inkomst/uitgave
      // wordt weggeschreven. Zou deze ophaal stil terugvallen op een lege set, dan
      // importeert de pagina vrolijk door en staat de spaarquote van de gebruiker
      // permanent verkeerd — zonder dat iets rood wordt. Liever niet importeren.
      const [accountsRes, budgetsRes, correctionsRes, ownIbansRes, ownAccountIbans] = await Promise.all([
        supabase.from('bank_accounts').select('id, name, ownership').eq('is_active', true).order('sort_order'),
        supabase.from('budgets').select('*').order('sort_order'),
        supabase.from('category_corrections').select('match_field, match_value, budget_id'),
        user ? supabase.from('user_own_ibans').select('match_type, match_value, iban').eq('user_id', user.id) : Promise.resolve({ data: [], error: null }),
        fetchOwnAccountIbansStrict(),
      ])

      const ibanByAccountId = ibanById(ownAccountIbans)

      const anyError = accountsRes.error || budgetsRes.error || correctionsRes.error
      if (anyError && isNetworkFailure(anyError)) {
        setError('Kan geen verbinding maken met de server. Controleer je internetverbinding.')
        setIsNetworkError(true)
        setLoading(false)
        return
      }

      if (accountsRes.data) {
        const accountRows = (accountsRes.data as { id: string; name: string; ownership?: 'personal' | 'shared' }[])
          .map((a) => ({ ...a, iban: ibanByAccountId.get(a.id) ?? null }))
        setAccounts(accountRows as Account[])
        if (accountRows.length > 0) {
          setSelectedAccountId(accountRows[0].id)
        }
        // Alleen de ACTIEVE rekeningen tellen mee als eigen-rekening-identifier —
        // exact de afbakening van vóór de omzetting (de select filtert al op
        // `is_active`, dus de merge hierboven levert precies die set).
        const bankIbans = accountRows.map((a) => a.iban)
        const ids = buildOwnAccountIdentifiers(
          (ownIbansRes.data ?? []) as { match_type?: string | null; match_value?: string | null; iban?: string | null }[],
          bankIbans,
        )
        setOwnIbans(ids.ibans)
        setOwnNamePatterns(ids.namePatterns)
      }

      if (budgetsRes.data) {
        const allBudgets = budgetsRes.data as Budget[]
        setBudgets(allBudgets)
        const parents = allBudgets.filter((b) => !b.parent_id)
        const children = allBudgets.filter((b) => b.parent_id && Number(b.default_limit) > 0)
        setBudgetGroups(parents.map((p) => ({
          parent: p,
          children: children.filter((c) => c.parent_id === p.id),
        })))
      }

      if (correctionsRes.data) {
        setCorrections(correctionsRes.data as CategoryCorrection[])
      }

      // Build frequency map from historical transactions (async, non-blocking)
      if (user) {
        buildFrequencyMap(user.id, supabase).then(fm => setFreqMap(fm)).catch(() => { /* non-critical */ })
      }

      // Welke rekeningen moeten via de server-route opslaan (B7)? Non-blocking:
      // de keuze is pas bij het importeren nodig, niet bij het laden.
      try {
        const res = await fetch('/api/transactions/import')
        if (!res.ok) throw new Error('lookup mislukt')
        const data = await res.json() as { server_path_account_ids?: string[] }
        setServerPathAccountIds(new Set(data.server_path_account_ids ?? []))
        setServerPathLookupFailed(false)
      } catch {
        // Zie de toelichting bij `serverPathLookupFailed`: bij twijfel het serverpad.
        setServerPathAccountIds(new Set())
        setServerPathLookupFailed(true)
      }

      setLoading(false)
    } catch (err) {
      if (isNetworkFailure(err)) {
        setError('Kan geen verbinding maken met de server. Controleer je internetverbinding.')
        setIsNetworkError(true)
      } else {
        setError('Fout bij het laden van gegevens. Probeer het opnieuw.')
      }
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Check for pending import session on mount
  useEffect(() => {
    const session = loadImportSession()
    if (session) {
      setPendingSession(session)
    }
  }, [])

  // Maximum file size: 10 MB
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
  const MAX_FILE_SIZE_LABEL = '10 MB'

  // Check for duplicates against existing transactions.
  // When called with rowsParam (after parsing), sets rows + goes to step 2.
  // When called without param (retry), re-checks current rows state.
  async function checkDuplicates(rowsParam?: ImportRow[]) {
    setError('')
    setIsNetworkError(false)
    setCheckingDups(true)

    // If called with fresh rows after parsing, set them immediately and go to step 2
    if (rowsParam) {
      setRows(rowsParam)
      setCurrentPage(0)
      setStep(2)
    }

    const supabase = createClient()

    let user: { id: string } | null = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsNetworkError(true)
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
      } else {
        setError('Fout bij het controleren van je sessie.')
      }
      setCheckingDups(false)
      return
    }
    if (!user) {
      setCheckingDups(false)
      return
    }

    // De doelrekening is vóór de upload verplicht gekozen (zie handleFileSelect),
    // en de duplicaatcontrole is rekening-gescoped — zonder rekening is er niets
    // om tegen te vergelijken.
    if (!selectedAccountId) {
      setError('Geen bankrekening geselecteerd. Ga terug en selecteer eerst een rekening.')
      setCheckingDups(false)
      return
    }

    const sourceRows = rowsParam ?? rows

    const minDate = sourceRows.reduce((min, r) => r.date < min ? r.date : min, sourceRows[0].date)
    const maxDate = sourceRows.reduce((max, r) => r.date > max ? r.date : max, sourceRows[0].date)

    try {
      // Single range-query: all transactions within the import's date range
      // Replaces the fragile .in('import_hash', hashes) approach that silently failed on large imports
      //
      // Rekening-gescoped, net als de unieke index
      // `(user_id, account_id, import_hash, coalesce(bank_seq,''))`: dezelfde
      // boeking (datum/bedrag/omschrijving) mag op twee rekeningen naast elkaar
      // bestaan, dus een gebruiker-brede vergelijking meldde hier valse
      // duplicaten die de gebruiker met de hand moest aanvinken.
      // Twee extra kolommen (`counterparty_iban`, `counterparty_name`) en een met
      // één dag verbreed venster voeden dedup-laag 2 (cross-bron): dezelfde
      // query, geen extra roundtrip. Het venster MOET meebewegen met de
      // tolerantie van de matcher — anders glipt een duplicaat op de dag vóór de
      // vroegste of ná de laatste rij er stil doorheen. De constante staat in de
      // dedup-module, niet hier.
      const { data: existing, error: queryError } = await supabase
        .from('transactions')
        .select('date, amount, description, bank_seq, counterparty_iban, counterparty_name')
        .eq('user_id', user.id)
        .eq('account_id', selectedAccountId)
        .gte('date', shiftIsoDate(minDate, -CROSS_SOURCE_DATE_TOLERANCE_DAYS))
        .lte('date', shiftIsoDate(maxDate, CROSS_SOURCE_DATE_TOLERANCE_DAYS))
        .limit(50000)

      if (queryError) {
        if (isNetworkFailure(queryError)) {
          setIsNetworkError(true)
          setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
        } else {
          // Technische (Postgres/PostgREST-)details alleen naar de log; de UI
          // krijgt een vaste NL-melding zonder rauwe database-strings.
          console.error('Duplicaatcontrole mislukt:', queryError)
          setError('Het controleren op dubbele transacties is niet gelukt — probeer het opnieuw.')
        }
        setCheckingDups(false)
        return
      }

      // Build a content-Set with normalized keys.
      // Het volgnummer (`bank_seq`) hoort in de sleutel: zonder dat veld meldde
      // deze zachte controle een rij als "duplicaat" die de harde pre-insert-
      // filter (rowDedupKey = import_hash|bank_seq) én de unieke index wél
      // toelaten — twee échte boekingen met gelijke datum/bedrag/omschrijving en
      // een verschillend Volgnr. Beide lagen kijken nu naar dezelfde sleutel.
      const contentSet = new Set<string>()
      if (existing) {
        for (const t of existing) {
          // DB returns NUMERIC as string ("8.10", "100", "-143.13")
          // parseFloat → String normalizes both sides to the same representation
          const normalizedAmount = String(parseFloat(String(t.amount)))
          const key = `${t.date}|${normalizedAmount}|${String(t.description ?? '').slice(0, 100)}|${t.bank_seq ?? ''}`
          contentSet.add(key)
        }
      }

      // Also check hashes from pending import session (crash recovery)
      const pendingHashes = new Set<string>()
      const session = loadImportSession()
      if (session?.importedHashes) {
        for (const h of session.importedHashes) pendingHashes.add(h)
      }

      const markDups = (r: ImportRow) => {
        const normalizedAmount = String(parseFloat(String(r.amount)))
        const contentKey = `${r.date}|${normalizedAmount}|${r.description.slice(0, 100)}|${r.bank_seq ?? ''}`
        const isDuplicate = contentSet.has(contentKey) || pendingHashes.has(r.import_hash)
        return {
          ...r,
          isDuplicate,
          skipImport: isDuplicate ? true : r.skipImport,
        }
      }

      // Phase 3: within-file dedup — dezelfde (import_hash, bank_seq) meer dan eens in de
      // import (echt-identieke regel). Composite-sleutel: distinct-maar-identieke transacties
      // (zelfde datum/bedrag/omschrijving, ander Volgnr) blijven beide staan.
      const seenInFile = new Set<string>()
      const applyFileDedup = (r: ImportRow) => {
        const key = rowDedupKey(r)
        if (r.isDuplicate) { seenInFile.add(key); return r }
        if (seenInFile.has(key)) return { ...r, isDuplicate: true, skipImport: true }
        seenInFile.add(key)
        return r
      }

      // Dedup-laag 2 (cross-bron): dezelfde boeking die eerder al via de
      // bankkoppeling binnenkwam. De bank levert een andere omschrijvingstekst
      // dan het CSV-bestand, dus laag 1 (hash over datum|bedrag|omschrijving)
      // kán die niet vangen. Laag 2 matcht op datum ±1 dag + bedrag exact +
      // tegenpartij-IBAN (of, bij eenzijdig ontbrekende IBAN, de genormaliseerde
      // naam) — dezelfde pure module die de sync-route gebruikt, zodat beide
      // paden op dezelfde invoer gegarandeerd hetzelfde besluiten.
      //
      // Draait ALTIJD ná laag 1 en alleen op wat die niet al heeft afgevangen:
      // een rij die al duplicaat heet, mag niet nóg eens (en met de zwakkere
      // reden) gemarkeerd worden.
      //
      // `amount` komt als NUMERIC-string uit PostgREST — coerceren, anders wordt
      // de centen-vergelijking NaN en matcht er niets.
      const crossSourceExisting: CrossSourceCandidate[] = (existing ?? []).map((t) => ({
        date: String(t.date),
        amount: Number(t.amount),
        counterparty_iban: t.counterparty_iban ?? null,
        counterparty_name: t.counterparty_name ?? null,
      }))

      const applyCrossSource = (all: ImportRow[]): ImportRow[] => {
        const openRows = all
          .map((r, index) => ({ r, index }))
          .filter(({ r }) => !r.isDuplicate)
        if (openRows.length === 0 || crossSourceExisting.length === 0) return all

        const decisions = partitionCrossSourceDuplicates(
          openRows.map(({ r, index }) => ({
            date: r.date,
            amount: r.amount,
            counterparty_iban: r.counterparty_iban,
            counterparty_name: r.counterparty_name,
            index,
          })),
          crossSourceExisting,
        )

        const flags = new Map<number, CrossSourceFlag>()
        for (const d of decisions) {
          if (d.reason) flags.set(d.candidate.index, { reason: d.reason })
        }
        if (flags.size === 0) return all

        return all.map((r, index) => {
          const flag = flags.get(index)
          // Voorgedeselecteerd, niet geblokkeerd: de checkbox blijft aanklikbaar.
          return flag ? { ...r, crossSourceDuplicate: flag, skipImport: true } : r
        })
      }

      if (rowsParam) {
        setRows(applyCrossSource(rowsParam.map(markDups).map(applyFileDedup)))
      } else {
        setRows((prev) => applyCrossSource(prev.map(markDups).map(applyFileDedup)))
      }

      setCheckingDups(false)
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsNetworkError(true)
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
      } else {
        setError('Onverwachte fout bij het controleren van duplicaten. Probeer het opnieuw.')
      }
      setCheckingDups(false)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Zonder geselecteerde rekening geen upload: elke insert zou anders falen
    // op een ongeldige account_id (productie-incident met 8000 transacties).
    if (!selectedAccountId) {
      setError('Selecteer eerst een bankrekening voordat je een bestand uploadt.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFileName(file.name)
    setError('')

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
      setError(
        `Het bestand "${file.name}" is te groot (${fileSizeMB} MB). ` +
        `De maximale bestandsgrootte is ${MAX_FILE_SIZE_LABEL}. ` +
        'Probeer een kleiner bestand te uploaden of splits het bestand op in meerdere delen.'
      )
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setParsing(true)
    setParseWarnings([])

    try {
      const content = await file.text()
      setFileContent(content)
      const format = detectFormat(content, file.name)
      setDetectedFormat(format)

      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''

      if (format === 'unknown') {
        setError(
          `Ongeldig bestandsformaat${fileExt ? ` (.${fileExt})` : ''}. ` +
          'Dit bestand wordt niet herkend als een geldig bankbestand. ' +
          'Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx).'
        )
        setParsing(false)
        return
      }

      if (format === 'csv') {
        const semiCount = (content.split('\n')[0]?.match(/;/g) || []).length
        const commaCount = (content.split('\n')[0]?.match(/,/g) || []).length
        const tabCount = (content.split('\n')[0]?.match(/\t/g) || []).length

        let bestPreset = CSV_PRESETS.find(p => p.id === 'custom')!
        if (semiCount > commaCount && semiCount > tabCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'ing') ?? bestPreset
        } else if (tabCount > commaCount) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'abn') ?? bestPreset
        }
        const firstLineLower = content.split('\n')[0]?.toLowerCase() ?? ''
        if (firstLineLower.includes('tijdzone') || firstLineLower.includes('transactie-id')) {
          bestPreset = CSV_PRESETS.find(p => p.id === 'paypal') ?? bestPreset
        }

        setCsvPreset(bestPreset)
        setCsvHeaders(getCSVHeaders(content, bestPreset.delimiter))
        setCsvPreview(getCSVPreview(content, bestPreset.delimiter, bestPreset.hasHeader))
        setShowColumnMapping(true)
        setParsing(false)
        return
      }

      let parsed: ParsedTransaction[] = []
      if (format === 'mt940') {
        try {
          parsed = await parseMT940(content)
        } catch (parseErr) {
          console.error('MT940 parse error:', parseErr)
          setError(
            'Fout bij het verwerken van het MT940-bestand. ' +
            'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
            'Controleer of het een geldig MT940-bankafschrift is.'
          )
          setParsing(false)
          return
        }
      } else if (format === 'ofx') {
        try {
          const ofxResult = await parseOFXWithWarnings(content)
          parsed = ofxResult.transactions
          setParseWarnings(ofxResult.warnings)
        } catch (parseErr) {
          console.error('OFX parse error:', parseErr)
          setError(
            'Fout bij het verwerken van het OFX-bestand. ' +
            'Het bestand lijkt beschadigd of heeft een ongeldig formaat. ' +
            'Controleer of het een geldig OFX/QFX-bankafschrift is.'
          )
          setParsing(false)
          return
        }
      }

      if (parsed.length === 0) {
        setError(`Geen transacties gevonden in dit bestand. Controleer of het een geldig ${format.toUpperCase()}-bestand is.`)
        setParsing(false)
        return
      }

      const importRows: ImportRow[] = parsed.map((tx) => {
        const isTransfer = isOwnAccountTransfer(tx.counterparty_iban, ownIbans, tx.counterparty_name, ownNamePatterns)
          || isWalletTransferType(tx.source_type, csvPreset.transferTypeValues)
        const cat = isTransfer
          ? { budget_id: eigenRekeningBudgetId, confidence: 1.0, budgetName: 'Eigen rekening', category_source: 'transfer' }
          : categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections, undefined, tx.counterparty_iban, freqMap)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          category_source: cat.category_source ?? null,
          isDuplicate: false,
          crossSourceDuplicate: null,
          skipImport: false,
          isTransfer,
          transaction_type: isTransfer ? 'transfer' : tx.transaction_type,
        }
      })

      // First check duplicates, then go to step 2
      void checkDuplicates(importRows)
    } catch (err) {
      console.error('File processing error:', err)
      setError(
        'Fout bij het verwerken van het bestand. ' +
        'Het bestand is mogelijk beschadigd of niet in een ondersteund formaat. ' +
        'Ondersteunde formaten: MT940, CSV, OFX/QFX.'
      )
    }

    setParsing(false)
  }

  async function handleCSVParse() {
    setParsing(true)
    setError('')
    setParseWarnings([])
    setShowColumnMapping(false)

    try {
      const { transactions: parsed, warnings } = await parseCSVWithWarnings(fileContent, csvPreset)
      setParseWarnings(warnings)

      if (parsed.length === 0) {
        setError(
          'Geen geldige transacties gevonden in het CSV-bestand. ' +
          'Het bestand is mogelijk beschadigd of de kolom-toewijzingen kloppen niet. ' +
          'Controleer of het bestand geldige datum- en bedragkolommen bevat.'
        )
        setParsing(false)
        return
      }

      const importRows: ImportRow[] = parsed.map((tx) => {
        const isTransfer = isOwnAccountTransfer(tx.counterparty_iban, ownIbans, tx.counterparty_name, ownNamePatterns)
          || isWalletTransferType(tx.source_type, csvPreset.transferTypeValues)
        const cat = isTransfer
          ? { budget_id: eigenRekeningBudgetId, confidence: 1.0, budgetName: 'Eigen rekening', category_source: 'transfer' }
          : categorizeTransaction(tx.description, tx.counterparty_name, tx.amount, budgets, corrections, undefined, tx.counterparty_iban, freqMap)
        return {
          ...tx,
          budget_id: cat.budget_id,
          budgetName: cat.budgetName,
          confidence: cat.confidence,
          category_source: cat.category_source ?? null,
          isDuplicate: false,
          crossSourceDuplicate: null,
          skipImport: false,
          isTransfer,
          transaction_type: isTransfer ? 'transfer' : tx.transaction_type,
        }
      })

      // First check duplicates, then go to step 2
      void checkDuplicates(importRows)
    } catch (err) {
      console.error('CSV parse error:', err)
      setError(
        'Fout bij het verwerken van het CSV-bestand. ' +
        'Het bestand lijkt beschadigd of heeft een onverwacht formaat. ' +
        'Controleer of het een geldig CSV-bestand van je bank is.'
      )
    }

    setParsing(false)
  }

  function updateCSVPreset(presetId: string) {
    const preset = CSV_PRESETS.find(p => p.id === presetId) ?? CSV_PRESETS[CSV_PRESETS.length - 1]
    setCsvPreset(preset)
    setCsvHeaders(getCSVHeaders(fileContent, preset.delimiter))
    setCsvPreview(getCSVPreview(fileContent, preset.delimiter, preset.hasHeader))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (!selectedAccountId) {
      setError('Selecteer eerst een bankrekening voordat je een bestand uploadt.')
      return
    }
    const file = e.dataTransfer.files[0]
    if (file) {
      const dt = new DataTransfer()
      dt.items.add(file)
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  }

  function toggleSkip(index: number) {
    setRows((prev) => prev.map((r, i) =>
      i === index ? { ...r, skipImport: !r.skipImport } : r
    ))
  }

  // Kop-checkbox in de duplicatenstap: markeer álle rijen als wel/niet-importeren
  // in één klik (skip=true = alles deselecteren, false = alles selecteren).
  function toggleSkipAll(skip: boolean) {
    setRows((prev) => withAllSkip(prev, skip))
  }

  async function handleImport(retryFromBatch?: number) {
    setImporting(true)
    setError('')
    setIsNetworkError(false)

    const supabase = createClient()

    let user: { id: string } | null = null
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch (err) {
      if (isNetworkFailure(err)) {
        setError('Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.')
        setIsNetworkError(true)
        setImporting(false)
        return
      }
      setError('Fout bij het controleren van je sessie. Probeer het opnieuw.')
      setImporting(false)
      return
    }

    if (!user) {
      setError('Niet ingelogd')
      setImporting(false)
      return
    }

    // Vangnet: importeren zonder geldige rekening laat elke insert-batch falen
    // op account_id. Blokkeer hier hard in plaats van 8000 mislukte inserts.
    if (!selectedAccountId || !accounts.some((a) => a.id === selectedAccountId)) {
      setError('Geen bankrekening geselecteerd. Ga terug en selecteer eerst een rekening.')
      setImporting(false)
      return
    }

    // Ga naar de import-/klaar-stap zodra de import daadwerkelijk begint (na de
    // validaties): de voortgangsbalk en straks het resultaat leven op stap 3.
    if (retryFromBatch === undefined) setStep(3)

    const toImport = rows.filter((r) => !r.skipImport)

    // Safety net: verwijder echt-identieke regels (zelfde import_hash én bank_seq) die door de
    // check zijn geglipt. Composite-sleutel houdt distinct-maar-identieke transacties intact.
    const seenHashes = new Set<string>()
    const toImportDeduped = toImport.filter((r) => {
      const key = rowDedupKey(r)
      if (seenHashes.has(key)) return false
      seenHashes.add(key)
      return true
    })

    // Filter tegen rijen die AL in de DB staan op DEZE rekening. De unieke index is
    // `transactions_import_hash_per_account_idx` op
    // (account_id, import_hash, coalesce(bank_seq, '')) (partieel WHERE
    // import_hash IS NOT NULL) — bewust ZONDER user_id, zodat twee partners
    // dezelfde boeking op een gedeelde rekening niet allebei kunnen inschrijven.
    // Eén botsing laat anders een hele batch van 100 falen
    // (ON CONFLICT kan de partiële index niet inferren). Haal de bestaande
    // (import_hash, bank_seq)-paren op en sla die rijen over — zo loopt geen enkele batch
    // op de unieke index stuk en blijven distinct-rijen (zelfde hash, ander Volgnr) wél door.
    //
    // Rekening-gescoped sinds de index dat is: gebruiker-breed filteren sloeg een
    // échte boeking op rekening B over omdat een identieke boeking op rekening A
    // al bestond. Datumvenster erbij omdat `import_hash` de datum meeneemt —
    // rijen buiten het venster van dit bestand kunnen per definitie niet botsen,
    // en dat begrenst de leesronde bij groeiende historie.
    //
    // Op het SERVERPAD slaan we deze leesronde over: de route doet exact dezelfde
    // controle (zelfde sleutel, zelfde scope, zelfde loader) vlak vóór de insert.
    // Hem hier herhalen zou een tweede, uit-de-pas-lopende interpretatie van
    // "wat staat er al" opleveren — precies wat B7 wegneemt.
    const importDates = toImportDeduped.map((r) => r.date).sort()
    const existingHashSet = new Set<string>()
    if (!useServerPath && importDates.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data: hashPage } = await supabase
          .from('transactions')
          .select('import_hash, bank_seq')
          .eq('user_id', user!.id)
          .eq('account_id', selectedAccountId)
          .not('import_hash', 'is', null)
          .gte('date', importDates[0])
          .lte('date', importDates[importDates.length - 1])
          .order('id', { ascending: true })
          .range(from, from + 999)
        const pageRows = (hashPage ?? []) as { import_hash: string; bank_seq: string | null }[]
        for (const h of pageRows) existingHashSet.add(rowDedupKey(h))
        if (pageRows.length < 1000) break
      }
    }
    const finalRows = toImportDeduped.filter((r) => !existingHashSet.has(rowDedupKey(r)))
    if (finalRows.length < toImportDeduped.length) {
      // Reflecteer de extra overslagen in de UI-tellers (hergebruikt de skipImport-telling
      // → tonen als "overgeslagen", niet als "mislukt").
      setRows((prev) => prev.map((row) => existingHashSet.has(rowDedupKey(row)) ? { ...row, skipImport: true } : row))
    }

    const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
    const accountOwnership: 'personal' | 'shared' = selectedAccount?.ownership ?? 'personal'

    const insertRows = finalRows.map((r) => {
      // Eigendom: volgt de rekening, maar een (handmatig of automatisch toegekend)
      // gedeeld budget op een persoonlijke rekening tilt de transactie naar
      // gezamenlijk — tenzij de gebruiker dat per rij heeft teruggezet.
      const budgetOwnership = budgets.find((b) => b.id === r.budget_id)?.ownership
      const ownership = deriveRowOwnership(accountOwnership, budgetOwnership, r.manualOwnership)
      return {
      user_id: user!.id,
      account_id: selectedAccountId,
      ownership,
      date: r.date,
      amount: r.amount,
      description: r.description,
      counterparty_name: r.counterparty_name,
      counterparty_iban: r.counterparty_iban,
      // Transfers landen op de "Eigen rekening"-post (archive → telt niet mee); de
      // parse-stap heeft budget_id al op die post gezet voor herkende overboekingen.
      budget_id: r.budget_id,
      is_income: r.amount > 0,
      category_source: r.isTransfer ? 'transfer' : (r.category_source ?? (r.aiAccepted ? 'ai' : r.budget_id ? 'rule' : 'import')),
      // Herkomst (B5): bestandsimport. `category_source` beschrijft hóé het budget
      // bepaald is, `source` wáár de transactie vandaan komt. Bestaande rijen
      // blijven bewust NULL ("onbekend").
      source: 'import' as const,
      import_hash: r.import_hash,
      reference: r.reference,
      transaction_type: r.isTransfer ? 'transfer' : r.transaction_type,
      bank_code: r.bank_code ?? null,
      bank_seq: r.bank_seq ?? null,
      running_balance: r.running_balance,
      creditor_id: r.creditor_id,
      fx_amount: r.fx_amount,
      fx_currency: r.fx_currency,
      fx_rate: r.fx_rate,
      }
    })

    // Sleutels van de rijen waarvan de gebruiker een cross-bron-treffer bewust
    // heeft overruled. Bewust NAAST de insert-rijen en niet erin: die rijen gaan
    // op het clientpad ongewijzigd de database in, en een niet-bestaande kolom
    // zou daar de hele batch laten sneuvelen.
    const forcedCrossSourceKeys = new Set(
      finalRows.filter((r) => r.crossSourceDuplicate).map((r) => rowDedupKey(r)),
    )

    /**
     * Schrijft één batch weg via `POST /api/transactions/import` (B7). De route
     * doet daar laag 1 + laag 2 en zet zelf `user_id`, `account_id`, `source` en
     * `import_hash` — wat we hier meesturen zijn de geparste rijen, niet de
     * waarheid over wie ze mag wegschrijven.
     */
    async function importBatchViaRoute(batch: typeof insertRows): Promise<{
      rows: InsertedTxRow[]
      skipped: { import_hash: string; bank_seq: string | null; layer?: string }[]
      failed: number
      error: string | null
    }> {
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccountId,
          rows: batch.map((r) => ({
            ...r,
            allow_cross_source: forcedCrossSourceKeys.has(rowDedupKey(r)) || undefined,
          })),
        }),
      })

      const data = await res.json().catch(() => ({})) as {
        error?: string
        failed?: number
        rows?: InsertedTxRow[]
        skipped?: { import_hash: string; bank_seq: string | null; layer?: string }[]
      }

      if (!res.ok) {
        return { rows: [], skipped: [], failed: batch.length, error: data.error || 'Importeren mislukt' }
      }
      const failed = data.failed ?? 0
      return {
        rows: data.rows ?? [],
        skipped: data.skipped ?? [],
        failed,
        // Een deels gesneuvelde batch telt als mislukt zodat "opnieuw proberen"
        // 'm oppakt; de route is idempotent, dus een herhaling voegt niets dubbel toe.
        error: failed > 0 ? `${failed} rijen niet weggeschreven` : null,
      }
    }

    const BATCH_SIZE = batchSize
    const batches: typeof insertRows[] = []
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      batches.push(insertRows.slice(i, i + BATCH_SIZE))
    }

    const startBatch = retryFromBatch ?? importedBatchIndex
    setImportProgress({ current: startBatch * BATCH_SIZE, total: insertRows.length, failed: 0 })
    setImportStartTime(Date.now())
    let failedCount = 0

    // Persist import session to localStorage for crash recovery
    const sessionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const importedHashesSoFar: string[] = []
    saveImportSession({
      id: sessionId,
      accountId: selectedAccountId,
      fileName,
      totalRows: insertRows.length,
      completedBatchIndex: startBatch,
      importedHashes: importedHashesSoFar,
      startedAt: Date.now(),
    })

    const newFailedBatches: typeof failedBatches = []
    // Zojuist weggeschreven, nog ongecategoriseerde rijen (budget_id null, geen
    // overboeking) — het werk voor het post-import categoriseer-scherm. We halen
    // de gegenereerde id's terug via `.select()` zodat de AICategorizeSheet ze per
    // id kan bijwerken.
    const importedUncategorized: PostImportTx[] = []
    /** Sleutels die de server-route heeft overgeslagen (al aanwezig of cross-bron);
     *  de UI vinkt die rijen daarop uit — zelfde behandeling als de pre-insert-
     *  filter van het clientpad. */
    const serverSkippedKeys = new Set<string>()
    /** Deelverzameling daarvan: overgeslagen omdat de partner de rij al op deze
     *  gedeelde rekening had staan (laag 1b). Apart bijgehouden zodat de
     *  statuscel de juiste reden kan tonen in plaats van een generiek
     *  "overgeslagen". */
    const householdPartnerKeys = new Set<string>()

    for (let batchIdx = startBatch; batchIdx < batches.length; batchIdx++) {
      let batchFailed = false
      let batchError = ""
      /** Aantal rijen dat écht niet is weggeschreven. Op het clientpad is dat de
       *  hele batch (alles-of-niets); de server-route rapporteert het exact. */
      let batchFailedRows = 0
      let insertedRows: InsertedTxRow[] = []

      try {
        if (useServerPath) {
          // Gekoppelde rekening: opslaan + dedup gaan server-side (B7), zodat de
          // bestandsimport en de bank-sync dezelfde regels volgen op dezelfde
          // rijruimte.
          const result = await importBatchViaRoute(batches[batchIdx])
          insertedRows = result.rows as typeof insertedRows
          for (const s of result.skipped) {
            const key = rowDedupKey({ import_hash: s.import_hash, bank_seq: s.bank_seq })
            serverSkippedKeys.add(key)
            if (s.layer === 'household_partner') householdPartnerKeys.add(key)
          }
          if (result.error) {
            batchFailed = true
            batchError = result.error
            batchFailedRows = result.failed
          }
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from("transactions")
            .insert(batches[batchIdx])
            .select(POST_IMPORT_SELECT)
          if (insertError) {
            batchFailed = true
            batchError = insertError.message
            batchFailedRows = batches[batchIdx].length
          } else if (inserted) {
            insertedRows = inserted as typeof insertedRows
          }
        }
      } catch (err) {
        batchFailed = true
        batchError = err instanceof Error ? err.message : "Onbekende fout"
        batchFailedRows = batches[batchIdx].length
      }

      if (batchFailed) {
        failedCount += batchFailedRows
        newFailedBatches.push({ batchIdx, error: batchError, retries: 0, rows: batches[batchIdx] })
      } else {
        // Track successfully imported hashes for crash recovery
        for (const row of batches[batchIdx]) {
          importedHashesSoFar.push((row as { import_hash: string }).import_hash)
        }
      }

      // Verzamel de rijen die nog géén budget hebben (en geen overboeking zijn)
      // voor het post-import categoriseer-scherm. Bewust búiten de if/else: een
      // batch die deels sneuvelde heeft wél rijen weggeschreven, en die horen
      // niet stil uit het categoriseerscherm te verdwijnen.
      importedUncategorized.push(...pickUncategorized(insertedRows, selectedAccountId))

      const progressCount = Math.min((batchIdx + 1) * BATCH_SIZE, insertRows.length)
      setImportProgress({ current: progressCount, total: insertRows.length, failed: failedCount })
      setImportedBatchIndex(batchIdx + 1)

      // Update localStorage session after each batch
      saveImportSession({
        id: sessionId,
        accountId: selectedAccountId,
        fileName,
        totalRows: insertRows.length,
        completedBatchIndex: batchIdx + 1,
        importedHashes: importedHashesSoFar,
        startedAt: Date.now(),
      })
    }

    // Wat de server-route heeft overgeslagen (al aanwezig of cross-bron) als
    // "overgeslagen" tonen in plaats van als "mislukt" — spiegelt exact wat het
    // clientpad met zijn eigen pre-insert-filter doet.
    if (serverSkippedKeys.size > 0) {
      setRows((prev) => prev.map((row) => {
        const key = rowDedupKey(row)
        if (!serverSkippedKeys.has(key)) return row
        return {
          ...row,
          skipImport: true,
          // Alleen de partner-treffer krijgt een eigen reden mee; de rest blijft
          // gewoon "overgeslagen", precies als voorheen.
          householdPartnerDuplicate: householdPartnerKeys.has(key) || undefined,
        }
      }))
    }

    // Import complete — clear session from localStorage
    clearImportSession()
    setPendingSession(null)

    setFailedBatches(newFailedBatches)
    setImportedBatchIndex(0)
    setImportStartTime(null)
    // De zojuist geïmporteerde, nog ongecategoriseerde rijen klaarzetten voor het
    // post-import categoriseer-scherm (AICategorizeSheet).
    setPostImportRows(importedUncategorized)
    setStep(3)
    setImporting(false)

    // Link transfer pairs in background (non-blocking)
    if (failedCount < insertRows.length) {
      linkUnmatchedTransfers(supabase, user!.id).catch(console.error)
    }
  }

  async function retryFailedBatches() {
    if (failedBatches.length === 0) return
    setRetrying(true)
    setError("")
    const supabase = createClient()
    const { data: { user: retryUser } } = await supabase.auth.getUser()
    const remaining: typeof failedBatches = []
    /** Rijen die pas bij deze poging zijn weggeschreven. Ze horen net zo goed in het
     *  categoriseer-scherm als de rijen uit de eerste ronde; zonder deze verzameling
     *  bleef de belofte "categoriseren direct na het importeren" voor een herstelde
     *  batch onvervuld. */
    const recoveredUncategorized: PostImportTx[] = []

    for (const fb of failedBatches) {
      if (fb.retries >= 2) {
        remaining.push(fb)
        continue
      }
      let ok = true
      let errMsg = ""
      try {
        // Serverpad: gewoon opnieuw aanbieden. De route draait haar eigen
        // dedup-lagen vlak vóór de insert en is daarmee idempotent — de rijen die
        // de eerste poging wél haalde komen als duplicaat terug in plaats van
        // dubbel in de database.
        if (useServerPath) {
          const res = await fetch('/api/transactions/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: selectedAccountId, rows: fb.rows }),
          })
          const data = await res.json().catch(() => ({})) as {
            error?: string
            failed?: number
            rows?: InsertedTxRow[]
          }
          if (!res.ok) { ok = false; errMsg = data.error || 'Importeren mislukt' }
          else if ((data.failed ?? 0) > 0) { ok = false; errMsg = `${data.failed} rijen niet weggeschreven` }
          // De route geeft de zojuist weggeschreven rijen terug (mét id's); rijen die
          // de eerste poging al haalde komen als duplicaat terug en zitten hier dus
          // niet in. Ook bij een deels geslaagde retry meenemen: wat wél landde hoort
          // in het categoriseer-scherm.
          recoveredUncategorized.push(...pickUncategorized(data.rows ?? [], selectedAccountId))
        } else {
          // Sla rijen over die al bestaan (dé reden dat de batch faalde) en importeer alleen
          // de resterende — anders faalt de retry identiek (plain insert van dezelfde batch
          // loopt opnieuw op de unieke index stuk). Match op (import_hash, bank_seq) zodat
          // distinct-rijen (zelfde hash, ander Volgnr) niet onterecht worden overgeslagen.
          // Rekening-gescoped, net als de unieke index: de account_id komt uit de
          // batchrijen zelf (alle rijen van één import dragen dezelfde rekening).
          const batchHashes = fb.rows.map((row) => (row as { import_hash: string }).import_hash)
          const batchAccountId = (fb.rows[0] as { account_id?: string } | undefined)?.account_id
          const existing = new Set<string>()
          if (retryUser && batchAccountId) {
            const { data: ex } = await supabase
              .from("transactions")
              .select("import_hash, bank_seq")
              .eq("user_id", retryUser.id)
              .eq("account_id", batchAccountId)
              .in("import_hash", batchHashes)
            for (const e of (ex ?? []) as { import_hash: string; bank_seq: string | null }[]) existing.add(rowDedupKey(e))
          }
          const survivors = fb.rows.filter((row) => !existing.has(rowDedupKey(row as { import_hash: string; bank_seq: string | null })))
          if (survivors.length > 0) {
            // `.select()` is hier niet cosmetisch: zonder de gegenereerde id's kan het
            // categoriseer-scherm de herstelde rijen niet bijwerken en verdwijnen ze
            // stil uit stap 4.
            const { data: recovered, error: insertError } = await supabase
              .from("transactions")
              .insert(survivors)
              .select(POST_IMPORT_SELECT)
            if (insertError) { ok = false; errMsg = insertError.message }
            else if (recovered) {
              recoveredUncategorized.push(
                ...pickUncategorized(recovered as InsertedTxRow[], batchAccountId ?? selectedAccountId),
              )
            }
          }
        }
      } catch (err) {
        ok = false
        errMsg = err instanceof Error ? err.message : "Onbekende fout"
      }
      if (!ok) {
        remaining.push({ ...fb, retries: fb.retries + 1, error: errMsg })
      }
    }

    const stillFailed = remaining.reduce((sum, fb) => sum + fb.rows.length, 0)
    setFailedBatches(remaining)
    setImportProgress((prev) => ({ ...prev, failed: stillFailed }))

    // Aanvullen, niet vervangen — de rijen uit de eerste ronde staan er al. Dedup op
    // id zodat een tweede "opnieuw proberen" dezelfde rij niet dubbel aanbiedt.
    if (recoveredUncategorized.length > 0) {
      setPostImportRows((prev) => mergeUncategorized(prev, recoveredUncategorized))
    }

    if (remaining.length === 0) {
      const { data } = await supabase.auth.getUser()
      if (data.user) linkUnmatchedTransfers(supabase, data.user.id).catch(console.error)
    } else if (remaining.every((fb) => fb.retries >= 2)) {
      setError(`${stillFailed} transacties konden niet worden geïmporteerd na meerdere pogingen.`)
    }
    setRetrying(false)
  }

  /**
   * Herleidt de post-import categoriseerset opnieuw uit de database.
   *
   * Waarom herleiden en niet lokaal aftrekken: het categoriseer-scherm schrijft niet
   * alleen de aangeboden rijen weg. Slaat de gebruiker een regel op, dan werkt de
   * sheet retroactief álle nog ongecategoriseerde treffers bij — ook rijen uit deze
   * import die hij nooit expliciet toonde. De database is dus de enige betrouwbare
   * bron van "wat staat er nog open"; een lokale telling zou meteen scheef staan.
   *
   * Bij een leesfout laten we de set ongemoeid: liever een te hoge teller dan rijen
   * die stil uit het scherm verdwijnen zonder dat ze zijn ingedeeld.
   */
  async function refreshPostImportRows(current: PostImportTx[]) {
    if (current.length === 0) return
    setRefreshingPostImport(true)
    try {
      const supabase = createClient()
      const ids = current.map((r) => r.id)
      const stillOpen = new Set<string>()
      // Bewuste, gedocumenteerde cap: `.in()` gaat per 200 id's de deur uit zodat een
      // grote import niet op een URL-lengtegrens stukloopt. Alle chunks worden
      // gelezen — er wordt niets afgekapt.
      const CHUNK = 200
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('transactions')
          .select('id')
          .in('id', ids.slice(i, i + CHUNK))
          .is('budget_id', null)
        if (error) return
        for (const r of (data ?? []) as { id: string }[]) stillOpen.add(r.id)
      }
      setPostImportRows((prev) => retainStillOpen(prev, stillOpen))
    } finally {
      setRefreshingPostImport(false)
    }
  }

  /** Sluit het categoriseer-scherm en herleid daarna wat er nog openstaat. */
  function closeCategorizeSheet(afterSave: boolean) {
    setShowCategorizeSheet(false)
    if (afterSave) setCategorizeRoundDone(true)
    void refreshPostImportRows(postImportRows)
  }

  // Classificatie- én selectie-tellers uit één pass; `selectionCounterLabel`
  // benoemt de selectie expliciet zodat hij niet als classificatie leest (M33).
  const counters = countImportRows(rows)
  const { crossSourceCount, newCount, dupCount, toImportCount } = counters
  const selectionLabel = selectionCounterLabel(counters)
  const totalBij = rows.filter((r) => !r.skipImport && r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalAf = rows.filter((r) => !r.skipImport && r.amount < 0).reduce((s, r) => s + r.amount, 0)

  // Compute date range from imported rows for post-import navigation and display
  const importDateRange = useMemo(() => {
    const imported = rows.filter((r) => !r.skipImport && r.date)
    if (imported.length === 0) return null
    const minDate = imported.reduce((min, r) => r.date < min ? r.date : min, imported[0].date)
    const maxDate = imported.reduce((max, r) => r.date > max ? r.date : max, imported[0].date)
    return { min: minDate, max: maxDate, minMonth: minDate.slice(0, 7), maxMonth: maxDate.slice(0, 7) }
  }, [rows])

  const importedMinMonth = importDateRange?.minMonth ?? null

  // Pagination helper for step 2 and step 3 tables
  function PaginationBar({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between border-t border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-2">
        <span className="text-xs text-[var(--ink-3)]">
          Pagina {page + 1} van {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            className="border border-[var(--border-md)] px-3 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--paper)] disabled:opacity-40"
          >
            Vorige
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            className="border border-[var(--border-md)] px-3 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--paper)] disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      </div>
    )
  }

  if (loading && !error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (loading && error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <div className={`border p-6 text-center ${
            isNetworkError
              ? 'border-orange-200 bg-orange-50'
              : 'border-red-200 bg-red-50'
          }`}>
            {isNetworkError && <WifiOff className="mx-auto mb-3 h-8 w-8 text-orange-500" />}
            <p className={`text-sm ${isNetworkError ? 'text-orange-800' : 'text-red-700'}`}>
              {error}
            </p>
            <button
              onClick={loadInitialData}
              className={`mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white ${
                isNetworkError ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Opnieuw proberen
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <NavStackMeta title="Transacties importeren" />
      <header className="mb-5 sm:mb-8 space-y-2">
        <Kicker>Cash · Importeren</Kicker>
        <EditorialHeadline level="h2" emphasis="importeren" size="lg">
          Transacties importeren
        </EditorialHeadline>
        <EditorialDeck>
          Upload een bankbestand (MT940, CSV of OFX) van je bank.
        </EditorialDeck>
      </header>

      {/* Steps indicator */}
      <div className="mb-5 sm:mb-8 flex items-center gap-2 text-sm">
        {['Upload', 'Dubbelingen', 'Importeren', 'Categoriseren'].map((label, i) => {
          const stepNum = i + 1
          const isActive = step === stepNum
          const isDone = step > stepNum

          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />}
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isActive ? 'bg-kern-100 text-kern-700' :
                isDone ? 'bg-emerald-100 text-emerald-700' :
                'bg-zinc-100 text-[var(--ink-3)]'
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : <span>{stepNum}</span>}
                <span>{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className={`mb-3 sm:mb-6 border p-4 text-sm ${
          isNetworkError
            ? 'border-orange-200 bg-orange-50 text-orange-800'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <div className="flex items-start gap-3">
            {isNetworkError && <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />}
            <div className="flex-1">
              <p>{error}</p>
              {isNetworkError && (
                <button
                  onClick={() => {
                    if (step === 3 && importedBatchIndex > 0) {
                      handleImport(importedBatchIndex)
                    } else if (step === 3) {
                      handleImport()
                    } else if (step === 2) {
                      void checkDuplicates()
                    } else {
                      setError('')
                      setIsNetworkError(false)
                    }
                  }}
                  className="mt-3 inline-flex items-center gap-2 bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Opnieuw proberen
                </button>
              )}
            </div>
          </div>
          {isNetworkError && importProgress.total > 0 && importProgress.current > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-orange-600 mb-1">
                <span>{importProgress.current} van {importProgress.total} geïmporteerd</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-orange-200">
                <div
                  className="h-2 rounded-full bg-orange-500 transition-all"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending import session banner */}
      {pendingSession && step === 1 && (
        <div className="mb-4 border border-kern-300 bg-kern-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-kern-800">
                Onafgeronde import gevonden
              </p>
              <p className="mt-1 text-xs text-kern-600">
                Bestand: <strong>{pendingSession.fileName}</strong> — {pendingSession.importedHashes.length} van {pendingSession.totalRows} transacties geïmporteerd.
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                {/* Amsterdamse tijd via lib/tz.ts — niet de runtime-tijdzone (#418-klasse). */}
                Gestart op {formatAmsterdamDayMonth(new Date(pendingSession.startedAt))} {formatAmsterdamTime(new Date(pendingSession.startedAt))}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  clearImportSession()
                  setPendingSession(null)
                }}
                className="border border-[var(--border-md)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Verwijderen
              </button>
            </div>
          </div>
          {pendingSession.importedHashes.length > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-kern-600 mb-1">
                <span>{pendingSession.importedHashes.length} van {pendingSession.totalRows} geïmporteerd</span>
                <span>{Math.round((pendingSession.importedHashes.length / pendingSession.totalRows) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-kern-200">
                <div
                  className="h-2 rounded-full bg-kern-500 transition-all"
                  style={{ width: `${(pendingSession.importedHashes.length / pendingSession.totalRows) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-kern-600">
                Upload hetzelfde bestand opnieuw om verder te gaan. Al geïmporteerde transacties worden automatisch overgeslagen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4 sm:space-y-6">
          {/* Account selector */}
          <div>
            <label htmlFor="import-account" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Bankrekening
            </label>
            <select
              id="import-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full max-w-sm border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.iban ? ` (${a.iban})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Al ingelezen bestand — verschijnt na "Terug" vanuit de duplicatenstap.
              De geparsede rijen blijven in state; hier kun je de rekening wijzigen
              en weer vooruit, of hierboven een nieuw bestand kiezen (dat vervangt
              de rijen bewust). */}
          {rows.length > 0 && !showColumnMapping && (
            <div className="flex flex-col gap-3 border border-kern-200 bg-kern-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium text-kern-800">Bestand al ingelezen</p>
                <p className="mt-0.5 text-xs text-kern-600">
                  <strong>{fileName || 'Bankbestand'}</strong> — {rows.length}{' '}
                  {rows.length === 1 ? 'transactie' : 'transacties'} klaar. Wijzig hierboven
                  eventueel de rekening en ga verder, of kies een nieuw bestand.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setError(''); setIsNetworkError(false); setStep(2) }}
                className="inline-flex shrink-0 items-center gap-1.5 bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
              >
                Verder naar dubbelingen
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Geen rekeningen: upload geblokkeerd tot er een rekening is */}
          {!loading && accounts.length === 0 && (
            <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">Eerst een bankrekening koppelen</p>
                <p className="mt-1 text-xs text-amber-700">
                  Transacties worden altijd aan een rekening gekoppeld. Heb je al een
                  betaalrekening als bezitting? Bewerk die bezitting en zet het vinkje aan
                  bij <strong>&ldquo;Budgetten &amp; transacties&rdquo;</strong> — daarna
                  kun je hier importeren. Heb je nog geen rekening, voeg er dan eerst een toe.
                </p>
                <Link
                  href="/core/cash"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                >
                  Naar rekeningen
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {/* File upload — pas actief wanneer een rekening is geselecteerd */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center border-2 border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-12 ${selectedAccountId ? 'hover:border-kern-400 hover:bg-kern-50/30' : 'opacity-60'}`}
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-kern-500" />
            ) : (
              <>
                <FileText className="h-10 w-10 text-[var(--ink-3)]" />
                <p className="mt-4 text-sm font-medium text-[var(--ink-2)]">
                  Sleep je bankbestand hierheen (MT940, CSV of OFX)
                </p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">of</p>
                <label className={`mt-3 px-4 py-2 text-sm font-medium text-white ${selectedAccountId ? 'cursor-pointer bg-kern-600 hover:bg-kern-700' : 'cursor-not-allowed bg-[var(--ink-4)]'}`}>
                  <Upload className="mr-2 inline h-4 w-4" />
                  Bestand kiezen
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sta,.txt,.mt940,.940,.csv,.ofx,.qfx"
                    onChange={handleFileSelect}
                    disabled={!selectedAccountId}
                    className="hidden"
                  />
                </label>
                {!selectedAccountId && !loading && (
                  <p className="mt-3 text-xs font-medium text-amber-700">
                    Selecteer eerst een bankrekening voordat je een bestand uploadt.
                  </p>
                )}
                <p className="mt-3 text-xs text-[var(--ink-3)]">Ondersteunde formaten: MT940 (.sta, .mt940), CSV (.csv), OFX (.ofx, .qfx)</p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">Maximale bestandsgrootte: {MAX_FILE_SIZE_LABEL}</p>
              </>
            )}
          </div>

          {/* Tip: begin klein — één maand importeren */}
          {!showColumnMapping && (
            <div className="flex items-start gap-3 border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
              <div className="text-sm">
                <p className="font-medium text-[var(--ink-2)]">Tip: begin met één maand</p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  Importeer eerst een bestand van één maand. Zo zie je snel waar je budgetten nog
                  hiaten hebben en kun je die bijstellen. Elke correctie die je tijdens het
                  toewijzen maakt wordt onthouden, zodat de automatische toekenning bij je
                  volgende import al een stuk slimmer is.
                </p>
              </div>
            </div>
          )}

          {/* CSV Column Mapping */}
          {showColumnMapping && (
            <div className="space-y-4">
              <div className="border border-kern-200 bg-kern-50 p-4">
                <p className="text-sm font-medium text-kern-800">
                  CSV-bestand gedetecteerd: <strong>{fileName}</strong>
                </p>
                <p className="mt-1 text-xs text-kern-600">Kies een preset of wijs kolommen handmatig toe.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Bank preset</label>
                <select
                  value={csvPreset.id}
                  onChange={(e) => updateCSVPreset(e.target.value)}
                  className="w-full max-w-sm border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                >
                  {CSV_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {csvPreset.id === 'paypal' && (
                <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 text-sm">
                  <p className="font-medium text-[var(--ink-2)]">Hoe exporteer je een PayPal CSV?</p>
                  <ol className="mt-2 space-y-1 text-xs text-[var(--ink-3)] list-decimal list-inside">
                    <li>Log in op paypal.com</li>
                    <li>Ga naar <strong className="text-[var(--ink-2)]">Activiteiten</strong> → <strong className="text-[var(--ink-2)]">Alle transacties</strong></li>
                    <li>Klik op <strong className="text-[var(--ink-2)]">Downloaden</strong> en kies <strong className="text-[var(--ink-2)]">CSV</strong></li>
                    <li>Upload het gedownloade bestand hierboven</li>
                  </ol>
                  <p className="mt-2 text-xs text-[var(--ink-4)]">
                    Alleen transacties met status "Voltooid" worden geïmporteerd. Bedragen zijn netto (incl. PayPal-kosten).
                  </p>
                </div>
              )}

              {csvPreset.id === 'custom' && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum kolom</label>
                      <select
                        value={csvPreset.dateColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, dateColumn: parseInt(e.target.value) }))}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Bedrag kolom</label>
                      <select
                        value={csvPreset.amountColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, amountColumn: parseInt(e.target.value) }))}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Beschrijving kolom</label>
                      <select
                        value={csvPreset.descriptionColumn}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, descriptionColumn: parseInt(e.target.value) }))}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum formaat</label>
                      <select
                        value={csvPreset.dateFormat}
                        onChange={(e) => setCsvPreset(prev => ({ ...prev, dateFormat: e.target.value }))}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="YYYYMMDD">YYYYMMDD</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Tegenpartij kolom</label>
                      <select
                        value={csvPreset.counterpartyColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, counterpartyColumn: v === -1 ? null : v }))
                        }}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">IBAN kolom</label>
                      <select
                        value={csvPreset.ibanColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, ibanColumn: v === -1 ? null : v }))
                        }}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Referentie kolom</label>
                      <select
                        value={csvPreset.referenceColumn ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setCsvPreset(prev => ({ ...prev, referenceColumn: v === -1 ? null : v }))
                        }}
                        className="w-full border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                      >
                        <option value={-1}>-- Niet beschikbaar --</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {csvPreview.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-[var(--ink-3)]">Preview (eerste {csvPreview.length} regels)</p>
                  {/* Legenda bij de kolombadges in de tabelkop hieronder. */}
                  <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ink-3)]">
                    <span><span className="font-semibold text-kern-500">D</span> = Datum</span>
                    <span aria-hidden className="text-[var(--ink-4)]">·</span>
                    <span><span className="font-semibold text-kern-500">B</span> = Bedrag</span>
                    <span aria-hidden className="text-[var(--ink-4)]">·</span>
                    <span><span className="font-semibold text-kern-500">O</span> = Omschrijving</span>
                    <span aria-hidden className="text-[var(--ink-4)]">·</span>
                    <span><span className="font-semibold text-[var(--ink-3)]">T</span> = Tegenpartij</span>
                    <span aria-hidden className="text-[var(--ink-4)]">·</span>
                    <span><span className="font-semibold text-[var(--ink-3)]">I</span> = IBAN</span>
                    <span aria-hidden className="text-[var(--ink-4)]">·</span>
                    <span><span className="font-semibold text-[var(--ink-3)]">R</span> = Referentie</span>
                  </p>
                  <div className="overflow-x-auto border border-[var(--border-ed)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--subtle)]">
                        <tr>
                          {csvHeaders.map((h, i) => (
                            <th key={i} className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">
                              {h || `Kolom ${i + 1}`}
                              {i === csvPreset.dateColumn && <span className="ml-1 text-kern-500">[D]</span>}
                              {i === csvPreset.amountColumn && <span className="ml-1 text-kern-500">[B]</span>}
                              {i === csvPreset.descriptionColumn && <span className="ml-1 text-kern-500">[O]</span>}
                              {i === csvPreset.counterpartyColumn && <span className="ml-1 text-[var(--ink-3)]">[T]</span>}
                              {i === csvPreset.ibanColumn && <span className="ml-1 text-[var(--ink-3)]">[I]</span>}
                              {i === csvPreset.referenceColumn && <span className="ml-1 text-[var(--ink-3)]">[R]</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {csvPreview.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className={`max-w-[150px] truncate px-3 py-1.5 ${
                                ci === csvPreset.dateColumn || ci === csvPreset.amountColumn || ci === csvPreset.descriptionColumn
                                  ? 'bg-kern-50/50 font-medium text-[var(--ink)]'
                                  : ci === csvPreset.counterpartyColumn || ci === csvPreset.ibanColumn || ci === csvPreset.referenceColumn
                                    ? 'bg-teal-50/50 font-medium text-[var(--ink)]'
                                    : 'text-[var(--ink-2)]'
                              }`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                onClick={handleCSVParse}
                disabled={parsing}
                className="inline-flex items-center gap-2 bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Transacties importeren
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Dubbelingen */}
      {step === 2 && (
        <div className="space-y-4">
          {checkingDups ? (
            <div className="flex items-center justify-center gap-3 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-kern-500" />
              <p className="text-sm text-[var(--ink-2)]">Controleren op dubbelingen…</p>
            </div>
          ) : (
            <>
              {/* Terug naar upload — de geparsede rijen blijven behouden, zodat je
                  van rekening of bestand kunt wisselen zonder opnieuw te uploaden. */}
              <button
                type="button"
                onClick={() => { setError(''); setIsNetworkError(false); setStep(1) }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-3)] hover:text-kern-600"
              >
                <ChevronLeft className="h-4 w-4" />
                Terug naar upload
              </button>

              {parseWarnings.length > 0 && (
                <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {parseWarnings.length} {parseWarnings.length === 1 ? 'rij overgeslagen' : 'rijen overgeslagen'} met een onleesbaar bedrag
                  </div>
                  <p className="mt-1 text-orange-700">
                    Deze rijen zijn NIET geïmporteerd (om een verkeerd €0-bedrag te voorkomen).
                    Controleer of de bedrag-kolom goed is toegewezen en probeer het zo nodig opnieuw.
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5">
                    {parseWarnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                    {parseWarnings.length > 8 && (
                      <li>… en nog {parseWarnings.length - 8} andere.</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-sm">
                  <span className="text-emerald-600"><strong>{newCount}</strong> nieuw</span>
                  {dupCount > 0 && (
                    <span className="text-orange-600"><strong>{dupCount}</strong> {dupCount === 1 ? 'duplicaat' : 'duplicaten'}</span>
                  )}
                  {crossSourceCount > 0 && (
                    <span className="text-warning"><strong>{crossSourceCount}</strong> al via bank</span>
                  )}
                  {/* Derde teller (M33): meet de SELECTIE, niet de classificatie
                      hiervoor. De rand markeert die breuk visueel; het label
                      zegt in woorden wat het getal is, zodat "0 nieuw · 7
                      duplicaten · 1 geselecteerd" niet als tegenspraak leest. */}
                  <span className="border-l border-[var(--border-ed)] pl-4 text-[var(--ink-2)]">
                    {selectionLabel}
                  </span>
                </div>
                <button
                  onClick={() => handleImport()}
                  disabled={importing || toImportCount === 0}
                  className="inline-flex items-center gap-2 bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importeren…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Importeren
                    </>
                  )}
                </button>
              </div>

              {dupCount > 0 && (
                <div className="border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                  <strong>{dupCount}</strong> transactie(s) bestaan al in de database en worden overgeslagen. Je kunt ze hieronder aan- of uitvinken.
                </div>
              )}

              {/* Dedup-laag 2: dezelfde boeking kwam eerder al via de bankkoppeling
                  binnen, maar met een andere omschrijvingstekst — dus met een andere
                  hash. Bewust zichtbaar en overrulebaar: bij een import is de
                  gebruiker erbij, en hij kent zijn eigen boekingen beter dan wij. */}
              {crossSourceCount > 0 && (
                <div className="border border-warning/30 bg-warning-bg p-4 text-sm text-warning">
                  <strong>{crossSourceCount}</strong> transactie(s) lijken al via je bankkoppeling
                  binnengekomen — zelfde datum, bedrag en tegenpartij, andere omschrijving.
                  Ze staan hieronder uitgevinkt. Vink je er toch één aan, dan importeren we hem
                  opnieuw — controleer daarna of hij niet dubbel in je overzicht staat.
                </div>
              )}

              {/* Geruststelling: categoriseren gebeurt ná het importeren, op de
                  al-opgeslagen rijen — je raakt dus nooit een import kwijt. */}
              <div className="flex items-start gap-3 border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
                <div className="text-sm">
                  <p className="font-medium text-[var(--ink-2)]">Eerst importeren, dan categoriseren</p>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">
                    Je transacties worden eerst veilig opgeslagen. Daarna kun je ze
                    meteen indelen — of dat rustig later doen op het rekeningdetail.
                    Er gaat onderweg niets verloren.
                  </p>
                </div>
              </div>

              {(() => {
                const step2TotalPages = Math.ceil(rows.length / PAGE_SIZE)
                const step2PageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                const step2Offset = currentPage * PAGE_SIZE
                // Kop-checkbox: staat afgeleid over ÁLLE rijen (niet enkel de pagina),
                // zodat "alles importeren / niets importeren" wizard-breed werkt.
                const { allSelected, indeterminate } = selectAllState(rows)
                return (
                  <div className="overflow-x-auto border border-[var(--border-ed)]">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--subtle)] text-left">
                        <tr>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                aria-label={allSelected ? 'Alle transacties deselecteren' : 'Alle transacties selecteren'}
                                checked={allSelected}
                                ref={(el) => { if (el) el.indeterminate = indeterminate }}
                                onChange={() => toggleSkipAll(allSelected)}
                                className="h-4 w-4 border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                              />
                              <span>Importeer</span>
                            </div>
                          </th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Datum</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Beschrijving</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Bedrag</th>
                          <th className="px-4 py-2 font-medium text-[var(--ink-3)]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {step2PageRows.map((row, localIdx) => {
                          const realIdx = step2Offset + localIdx
                          return (
                            <tr key={realIdx} className={`${row.skipImport ? 'bg-[var(--subtle)] opacity-60' : 'hover:bg-[var(--subtle)]'}`}>
                              <td className="px-4 py-2">
                                {/* Toegankelijke naam per rij (M34): zonder label zijn
                                    dit N identieke naamloze checkboxen, terwijl juist
                                    hier een verkeerd vinkje een dubbele boeking betekent.
                                    Bedrag volgt de maskering — zie row-checkbox-label.ts. */}
                                <input
                                  type="checkbox"
                                  aria-label={rowCheckboxLabel(row, { masked })}
                                  checked={!row.skipImport}
                                  onChange={() => toggleSkip(realIdx)}
                                  className="h-4 w-4 border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                                />
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-[var(--ink-2)]">
                                {new Date(row.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                              </td>
                              <td className="max-w-[300px] truncate px-4 py-2 text-[var(--ink)]">
                                {row.description}
                                {row.counterparty_name && (
                                  <span className="ml-1 text-xs text-[var(--ink-3)]">({row.counterparty_name})</span>
                                )}
                              </td>
                              <td className={`whitespace-nowrap px-4 py-2 font-medium ${
                                row.amount > 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                              }`}>
                                <MaskedAmount value={row.amount} signPrefix={row.amount > 0 ? '+' : ''} tone="kern" decimals />
                              </td>
                              <td className="px-4 py-2">
                                {row.isDuplicate ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                    Duplicaat
                                  </span>
                                ) : row.householdPartnerDuplicate ? (
                                  // Dedup-laag 1b: je partner heeft deze boeking
                                  // al op de gedeelde rekening gezet. Zelfde
                                  // vorm als de laag-2-badge hieronder — korte
                                  // badge, uitleg in de tooltip — want het is
                                  // dezelfde vraag ("waarom staat hier niet
                                  // 'Nieuw'?") en die verdient één antwoordvorm.
                                  <span className="inline-flex items-center gap-1">
                                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                                      Al door partner
                                    </span>
                                    <InfoTooltip
                                      text="Staat al op deze gedeelde rekening (geïmporteerd door je partner). Eén keer importeren is genoeg — jullie zien allebei dezelfde transacties."
                                    />
                                  </span>
                                ) : row.crossSourceDuplicate ? (
                                  // Dedup-laag 2: dezelfde boeking kwam al via de bank
                                  // binnen. De reden (tegenrekening vs. naam) is
                                  // vakjargon en staat daarom in de tooltip, niet op de
                                  // badge — en via InfoTooltip i.p.v. een `title`, want
                                  // dat laatste is voor toetsenbord en schermlezer
                                  // onbereikbaar terwijl dít juist de uitleg is die de
                                  // gebruiker nodig heeft om ons te overrulen.
                                  <span className="inline-flex items-center gap-1">
                                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                                      Al via bank
                                    </span>
                                    <InfoTooltip
                                      text={row.crossSourceDuplicate.reason === 'iban'
                                        ? 'Zelfde datum, bedrag en tegenrekening als een transactie die al via je bankkoppeling binnenkwam.'
                                        : 'Zelfde datum, bedrag en naam van de tegenpartij als een transactie die al via je bankkoppeling binnenkwam.'}
                                    />
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    Nieuw
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <PaginationBar page={currentPage} totalPages={step2TotalPages} onPageChange={setCurrentPage} />
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Step 3: Importeren (voortgang) — de transacties worden nu vastgezet in
          de DB; categoriseren gebeurt daarna op de opgeslagen rijen (stap 4). */}
      {step === 3 && importing && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ink-2)]">
            <strong>{toImportCount}</strong> transacties uit <strong>{fileName}</strong> worden opgeslagen…
          </p>
          {importProgress.total > 0 ? (() => {
            const pct = Math.round((importProgress.current / importProgress.total) * 100)
            const batchNum = Math.ceil(importProgress.current / 100) || 1
            const totalBatches = Math.ceil(importProgress.total / 100)
            const elapsed = importStartTime ? (Date.now() - importStartTime) / 1000 : 0
            const rate = elapsed > 0 && importProgress.current > 0 ? importProgress.current / elapsed : 0
            const remaining = rate > 0 ? Math.ceil((importProgress.total - importProgress.current) / rate) : null
            const remainingStr = remaining !== null && remaining > 0
              ? remaining >= 60
                ? `~${Math.ceil(remaining / 60)} min resterend`
                : `~${remaining}s resterend`
              : null
            return (
              <div className="border border-kern-200 bg-kern-50 p-4">
                <div className="flex justify-between text-xs text-kern-700 mb-1.5">
                  <span className="font-medium">
                    Importeren: {importProgress.current} van {importProgress.total} transacties
                    <span className="text-[var(--ink-4)] ml-1.5">(batch {batchNum}/{totalBatches})</span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold">{pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-kern-200 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full bg-kern-500"
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                      transition: 'width 0.4s ease-out',
                    }}
                  />
                </div>
                {remainingStr && (
                  <p className="mt-1.5 text-[11px] text-[var(--ink-4)]">{remainingStr}</p>
                )}
              </div>
            )
          })() : (
            <div className="flex items-center gap-3 border border-kern-200 bg-kern-50 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-kern-500" />
              <p className="text-sm text-kern-700">Importeren voorbereiden…</p>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Categoriseren (post-import, op de reeds opgeslagen rijen) */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
            <p className="text-sm text-[var(--ink-2)]">
              {postImportRows.length === 0 && categorizeRoundDone ? (
                <>Alle geïmporteerde transacties zijn <strong>ingedeeld</strong>. Je bent klaar.</>
              ) : (
                <>Je transacties zijn <strong>opgeslagen</strong>. Categoriseren is <strong>optioneel</strong> — deel de nog ongecategoriseerde rijen nu in, of doe dat rustig later.</>
              )}
            </p>
            <div className="mt-4 flex flex-col items-center gap-3">
              {/* Zolang de set opnieuw wordt herleid tonen we geen klikbaar aantal: dat
                  aantal is dan verouderd en een tweede ronde op stale rijen kan de
                  zojuist gemaakte keuzes overschrijven. */}
              {refreshingPostImport && !showCategorizeSheet && (
                <span className="inline-flex items-center gap-2 text-sm text-[var(--ink-3)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Bijwerken…
                </span>
              )}
              {postImportRows.length > 0 && !showCategorizeSheet && !refreshingPostImport && (
                <button
                  type="button"
                  onClick={() => setShowCategorizeSheet(true)}
                  className="inline-flex items-center gap-2 bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
                >
                  <Sparkles className="h-4 w-4" />
                  {postImportRows.length} {postImportRows.length === 1 ? 'transactie categoriseren' : 'transacties categoriseren'}
                </button>
              )}
              <Link
                href={selectedAccountId && importedMinMonth ? `/core/assets/cash/${selectedAccountId}?month=${importedMinMonth}` : '/core/cash'}
                className="text-xs font-medium text-[var(--ink-3)] underline hover:text-kern-600"
              >
                {selectedAccountId ? 'Naar rekeningdetail' : 'Naar Cash overzicht'}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Post-import categoriseer-scherm — canonieke AICategorizeSheet, geseed op
          de zojuist opgeslagen ongecategoriseerde rijen (werkt op DB-id's, doet
          zelf de combined pass / sleepmodus / handmatige indeling). */}
      {step === 4 && showCategorizeSheet && postImportRows.length > 0 && (
        <AICategorizeSheet
          transactions={postImportRows}
          budgets={budgets}
          budgetGroups={budgetGroups}
          onClose={() => closeCategorizeSheet(false)}
          onSaved={() => closeCategorizeSheet(true)}
        />
      )}

      {/* Step 3 (vervolg): resultaat + doorstart naar categoriseren */}
      {step === 3 && !importing &&
        (() => {
          const skippedCount = rows.filter((r) => r.skipImport).length
          // Race-vrije bron van waarheid: importProgress.total = insertRows.length (synchroon
          // gezet vóór insert), failed = werkelijk mislukte rijen. toImportCount hangt af van
          // een asynchrone setRows-flush en telt eventueel rijen mee die nooit zijn ingevoegd.
          const importedCount = importProgress.total - importProgress.failed
          return (
            <div className="rounded-[var(--r-lg)] border border-emerald-200 bg-emerald-50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <h2
                className="text-2xl font-black tracking-[-0.02em] text-[var(--ink)]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >Import geslaagd!</h2>
              <p className="mt-2 text-sm text-[var(--ink-2)]">
                <strong>{importedCount}</strong> transacties geïmporteerd
                {importDateRange && (() => {
                  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
                  const startLabel = fmt(importDateRange.min)
                  const endLabel = fmt(importDateRange.max)
                  return importDateRange.minMonth === importDateRange.maxMonth
                    ? <> in <strong>{startLabel}</strong></>
                    : <> van <strong>{startLabel}</strong> tot <strong>{endLabel}</strong></>
                })()}
                .
              </p>
              <div className="mt-3 flex justify-center flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 font-medium">
                  <Check className="h-3 w-3" /> {importedCount} geïmporteerd
                </span>
                {skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--subtle)] px-3 py-1 text-[var(--ink-3)] font-medium">
                    {skippedCount} overgeslagen
                  </span>
                )}
                {importProgress.failed > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-red-700 font-medium">
                    {importProgress.failed} mislukt
                  </span>
                )}
              </div>
              {/* Retry failed batches */}
              {failedBatches.length > 0 && (
                <div className="mt-4 border border-red-200 bg-red-50 p-4 text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-red-800">
                      {failedBatches.reduce((s, fb) => s + fb.rows.length, 0)} transacties in{" "}
                      {failedBatches.length} batch{failedBatches.length > 1 ? "es" : ""} mislukt
                    </p>
                    <div className="flex items-center gap-2">
                      {failedBatches.some((fb) => fb.retries < 2) && (
                        <button
                          type="button"
                          onClick={() => void retryFailedBatches()}
                          disabled={retrying}
                          className="inline-flex items-center gap-1.5 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {retrying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {retrying ? "Bezig..." : "Opnieuw proberen"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowFailedDetails((v) => !v)}
                        className="text-xs text-red-600 underline hover:text-red-800"
                      >
                        {showFailedDetails ? "Verberg details" : "Toon details"}
                      </button>
                    </div>
                  </div>
                  {failedBatches.some((fb) => fb.retries >= 2) && (
                    <p className="mt-1 text-xs text-red-600">
                      Sommige batches hebben het maximum aantal pogingen (2) bereikt.
                    </p>
                  )}
                  {showFailedDetails && (
                    <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                      {failedBatches.map((fb, i) => (
                        <div
                          key={i}
                          className="border border-red-200 bg-white p-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-red-800">
                              Batch {fb.batchIdx + 1} — {fb.rows.length} transacties
                            </span>
                            <span className="text-red-500">
                              {fb.retries >= 2
                                ? "Max pogingen bereikt"
                                : `Poging ${fb.retries}/2`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-red-600 truncate">{fb.error}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 flex justify-center gap-6 text-sm text-[var(--ink-3)]">
                <span>
                  Totaal bij:{" "}
                  <strong className="text-emerald-600">
                    <MaskedAmount value={totalBij} tone="kern" decimals />
                  </strong>
                </span>
                <span>
                  Totaal af:{" "}
                  <strong className="text-red-600">
                    <MaskedAmount value={Math.abs(totalAf)} tone="kern" decimals />
                  </strong>
                </span>
              </div>
              {/* Doorstart: eerst categoriseren (post-import, veilig want de rijen
                  staan al in de DB), anders meteen naar het rekeningdetail. */}
              <div className="mt-4 sm:mt-6 flex flex-col items-center gap-3">
                {postImportRows.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setShowCategorizeSheet(true); setStep(4) }}
                      className="inline-flex items-center gap-2 bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      {postImportRows.length} {postImportRows.length === 1 ? 'transactie categoriseren' : 'transacties categoriseren'}
                    </button>
                    <Link
                      href={
                        selectedAccountId && importedMinMonth
                          ? `/core/assets/cash/${selectedAccountId}?month=${importedMinMonth}`
                          : '/core/cash'
                      }
                      className="text-xs font-medium text-[var(--ink-3)] underline hover:text-kern-600"
                    >
                      Later — {selectedAccountId ? 'naar rekeningdetail' : 'naar Cash overzicht'}
                    </Link>
                  </>
                ) : (
                  <Link
                    href={
                      selectedAccountId && importedMinMonth
                        ? `/core/assets/cash/${selectedAccountId}?month=${importedMinMonth}`
                        : '/core/cash'
                    }
                    className="inline-flex items-center gap-2 bg-kern-600 px-6 py-2 text-sm font-medium text-white hover:bg-kern-700"
                  >
                    {selectedAccountId ? 'Naar rekeningdetail' : 'Naar Cash overzicht'}
                  </Link>
                )}
              </div>
            </div>
          )
        })()}
    </div>
  )
}
