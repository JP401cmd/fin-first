// ── Aangifte on-device: de extractor ─────────────────────────────────────────
//
// De lokale tegenhanger van lib/aangifte/extract-aangifte-data.ts, met exact
// dezelfde uitkomst-vorm (`AangifteExtractionResult`) zodat de review-stap niet
// hoeft te weten waar het antwoord vandaan komt.
//
// Structureel de tweeling van de andere lokale resolvers
// (local-categorize-resolver, local-vaste-kosten-resolver): één runner per
// eenheid werk, sessieherstel (dispose + één retry, dan werpen), een
// sessiestart-signaal voor de stille GPU-warmup en progressieve voortgang.
//
// DE VOLGORDE IS DE ARCHITECTUUR:
//
//   1. Snijden      — section-select.ts knipt de pagina's op de aangifte-eigen
//                     kopteksten. Geen koptekst → leeg resultaat, nul tokens.
//   2. Jaar lezen   — detectTaxYear leest het aangiftejaar uit de titel. Geen
//                     modelwerk; peildatum volgt er per definitie uit.
//   3. Model        — één micro-call per venster, met alleen dát venster en
//                     alleen het relevante stukje mapping in de prompt.
//   4. Gronden      — elk bedrag moet LETTERLIJK in het bronvenster staan,
//                     anders vervalt de rij. Zie grounding.ts.
//   5. Opschonen    — sanity-grenzen, BSN/IBAN uit de naamvelden, dedupe.
//
// PRIVACY-WINST DIE HET BENOEMEN WAARD IS: op dit pad verlaat de aangiftetekst
// het toestel helemaal niet — sterker dan de huidige belofte in de upload-UI
// ("alleen de bedragen-tekst, zonder BSN, gaat naar onze AI"). `stripSensitiveData`
// en `stripHouseholdNames` blijven wél staan als defense-in-depth: de vensters
// gaan door een prompt, en een BSN dat er niet in zit kan ook niet in een
// naamveld terechtkomen.
//
// GEEN CLOUD-FALLBACK. Faalt een venster ook ná sessieherstel, dan werpt deze
// functie. De upload-stap toont dan zijn bestaande fout-vlak met "Typ liever
// zelf" — dat is de uitweg, niet een stille cloudcall.

import type {
  AangifteAssetType,
  AangifteBox1Kind,
  AangifteDebtType,
  AangifteExtractionResult,
} from '../extraction-schema'
import { extractionSchema } from '../extraction-schema'
import { extractLocalJsonObjects } from '@/lib/ai/local/parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel NIET
// eager mee. De statische import maakt de generatie-callsite bovendien expliciet
// zodat de sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from '@/lib/ai/local/litert-runtime'
import {
  selectAangifteWindows,
  detectTaxYear,
  peildatumFor,
  type AangifteSectionWindow,
} from './section-select'
import { buildAangifteWindowPrompt, LOCAL_AANGIFTE_DNA } from './prompts'
import {
  collectVerbatimAmounts,
  isAmountGrounded,
  parseAangifteAmount,
  sanitizeExtractedName,
  SANITY_LIMITS,
  withinSanity,
} from './grounding'

// ── Typewhitelists ──────────────────────────────────────────────────────────
//
// Alleen de types die uit een aangifte kúnnen komen. Wat het model daarbuiten
// verzint wordt 'other' — er volgt een review-stap, dus een verkeerd type is
// herstelbaar; een verzonnen type zou de rij laten vervallen.

const ASSET_TYPES: ReadonlySet<string> = new Set<AangifteAssetType>([
  'cash',
  'savings',
  'investment',
  'retirement',
  'eigen_huis',
  'real_estate',
  'crypto',
  'vehicle',
  'physical',
  'deelneming',
  'levensverzekering',
  'vordering',
  'other',
])

const DEBT_TYPES: ReadonlySet<string> = new Set<AangifteDebtType>([
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'payment_plan',
  'belastingschuld',
  'familielening',
  'dga_schuld',
  'other',
])

const BOX1_KINDS: ReadonlySet<string> = new Set<AangifteBox1Kind>([
  'loon',
  'pensioen',
  'aow',
  'uitkering',
  'winst',
])

/** Generiek label wanneer de naam na de BSN/IBAN-zeef onbruikbaar is. */
const FALLBACK_LABELS: Record<string, string> = {
  cash: 'Betaalrekening',
  savings: 'Spaarrekening',
  investment: 'Beleggingsportefeuille',
  eigen_huis: 'Eigen woning',
  real_estate: 'Onroerende zaak',
  crypto: 'Cryptovaluta',
  vordering: 'Vordering',
  deelneming: 'Deelneming',
  mortgage: 'Hypotheek',
  student_loan: 'Studieschuld',
  personal_loan: 'Persoonlijke lening',
  revolving_credit: 'Doorlopend krediet',
  car_loan: 'Autolening',
  credit_card: 'Creditcardschuld',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  dga_schuld: 'Rekening-courant BV',
  loon: 'Bruto loon',
  pensioen: 'Pensioenuitkering',
  aow: 'AOW-uitkering',
  uitkering: 'Uitkering',
  winst: 'Winst uit onderneming',
  other: 'Overig',
}

function normalizeType(raw: unknown, whitelist: ReadonlySet<string>): string {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  return whitelist.has(key) ? key : 'other'
}

// ── Deterministische extra's uit het venster ────────────────────────────────

/**
 * Aflossingsvorm — staat als woord in het venster, dus dat leest TypeScript
 * zelf. Het model hoeft er niet naar te raden en kan het dus ook niet fout doen.
 */
export function detectRepaymentType(window: string): 'aflossingsvrij' | 'annuiteit' | 'lineair' | null {
  if (/aflossingsvrij/i.test(window)) return 'aflossingsvrij'
  if (/annu[ïi]teit/i.test(window)) return 'annuiteit'
  if (/lineair/i.test(window)) return 'lineair'
  return null
}

/**
 * Rentepercentage — alleen wanneer het venster er letterlijk één noemt
 * ("Rentepercentage 3,8%"). Nooit schatten: het schema schrijft `null` voor bij
 * een aangifte die de rente niet vermeldt, en een geschatte rente zou als
 * "uitgelezen uit je aangifte" op het scherm komen.
 */
export function detectInterestRate(window: string): number | null {
  const m = window.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/)
  if (!m) return null
  const rate = Number(m[1]!.replace(',', '.'))
  return withinSanity(rate, SANITY_LIMITS.rate) ? rate : null
}

// ── Rij-parser per venster ──────────────────────────────────────────────────

interface RawRow {
  label: unknown
  type: unknown
  bedrag: unknown
}

function readRow(obj: unknown): RawRow | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const bedrag = o.bedrag ?? o.amount ?? o.current_value ?? o.annual_amount
  if (bedrag === undefined) return null
  return { label: o.label ?? o.name ?? o.naam, type: o.type ?? o.kind, bedrag }
}

/** Wat één venster oplevert. Losse arrays zodat de aanroeper ze kan mergen. */
export interface WindowHarvest {
  assets: AangifteExtractionResult['assets']
  debts: AangifteExtractionResult['debts']
  box1_components: AangifteExtractionResult['box1_components']
  /** Rijen die zijn verworpen — bedrag niet in het venster, of buiten bereik. */
  rejected: number
}

/**
 * PUUR: zet de modeluitvoer van één venster om in geldige rijen.
 *
 * Elke rij moet drie horden nemen: een bruikbare naam (na de BSN/IBAN-zeef), een
 * bedrag dat LETTERLIJK in het venster staat, en een waarde binnen de
 * sanity-grenzen. Zakt hij, dan vervalt de rij — er wordt niets gecorrigeerd.
 *
 * Los te unit-testen: geen sessie, geen async, geen netwerk.
 */
export function harvestWindow(win: AangifteSectionWindow, modelOutput: string): WindowHarvest {
  const { objects } = extractLocalJsonObjects(modelOutput)
  const amounts = collectVerbatimAmounts(win.text)
  const out: WindowHarvest = { assets: [], debts: [], box1_components: [], rejected: 0 }

  const repaymentType = detectRepaymentType(win.text)
  const interestRate = detectInterestRate(win.text)

  for (const obj of objects ?? []) {
    const row = readRow(obj)
    if (!row) {
      out.rejected++
      continue
    }

    const amount = parseAangifteAmount(row.bedrag)
    // BEDRAG-GROUNDING: dit is de regel die verzonnen cijfers buiten de
    // rekenmotoren houdt. Niet verbatim in het venster → verwerpen.
    if (amount === null || !isAmountGrounded(amount, amounts)) {
      out.rejected++
      continue
    }

    if (win.kind === 'box1') {
      // 'other' bestaat niet als Box 1-soort — `normalizeType` valt daarop
      // terug bij een onbekende waarde, en dán laten we de regel liever weg dan
      // 'm als loon te boeken. Vandaar de lidmaatschapstest op de ruwe uitkomst
      // in plaats van een vergelijking op het (versmalde) type.
      const kindRaw = normalizeType(row.type, BOX1_KINDS)
      if (!BOX1_KINDS.has(kindRaw) || !withinSanity(amount, SANITY_LIMITS.annual)) {
        out.rejected++
        continue
      }
      const kind = kindRaw as AangifteBox1Kind
      out.box1_components.push({
        kind,
        annual_amount: amount,
        label: sanitizeExtractedName(row.label) ?? FALLBACK_LABELS[kind] ?? 'Inkomen',
      })
      continue
    }

    if (win.kind === 'debts') {
      const debtType = normalizeType(row.type, DEBT_TYPES) as AangifteDebtType
      if (!withinSanity(amount, SANITY_LIMITS.balance)) {
        out.rejected++
        continue
      }
      out.debts.push({
        name: sanitizeExtractedName(row.label) ?? FALLBACK_LABELS[debtType] ?? 'Schuld',
        debt_type: debtType,
        current_balance: amount,
        // Rente alleen als het venster 'm letterlijk noemt, en alleen bij een
        // hypotheek — bij een Box 3-schuld is een los percentage in het venster
        // vaker een forfait dan de contractrente.
        interest_rate: debtType === 'mortgage' ? interestRate : null,
        repayment_type: debtType === 'mortgage' ? repaymentType : null,
        subtype: debtType === 'mortgage' ? repaymentType : null,
        // Deterministisch: alleen de eigenwoningschuld is aftrekbaar.
        is_tax_deductible: debtType === 'mortgage',
      })
      continue
    }

    const assetType = normalizeType(row.type, ASSET_TYPES) as AangifteAssetType
    const limit = assetType === 'eigen_huis' ? SANITY_LIMITS.woz : SANITY_LIMITS.balance
    if (!withinSanity(amount, limit)) {
      out.rejected++
      continue
    }
    out.assets.push({
      name: sanitizeExtractedName(row.label) ?? FALLBACK_LABELS[assetType] ?? 'Bezitting',
      asset_type: assetType,
      current_value: amount,
      subtype: null,
      // De aangifte rapporteert het eigen huis op WOZ-waarde; current_value en
      // woz_value zijn daar per definitie hetzelfde bedrag.
      woz_value: assetType === 'eigen_huis' ? amount : null,
    })
  }

  return out
}

// ── Merge + dedupe ──────────────────────────────────────────────────────────

function dedupeKey(type: string, amount: number, name: string): string {
  return `${type}|${Math.round(amount)}|${name.trim().toLowerCase()}`
}

/**
 * Voeg de oogst van alle vensters samen en gooi duplicaten weg.
 *
 * Duplicaten zijn hier reëel en niet theoretisch: 'Eigen woning' en
 * 'Eigenwoningschuld' staan vaak in hetzelfde tekstblok, en 'Schulden' matcht
 * óók binnen 'Schulden in Box 3'. Zonder dedupe zou dezelfde hypotheek twee keer
 * in het vermogen landen.
 */
export function mergeHarvests(harvests: WindowHarvest[]): Omit<AangifteExtractionResult, 'peildatum' | 'tax_year'> {
  const assets: AangifteExtractionResult['assets'] = []
  const debts: AangifteExtractionResult['debts'] = []
  const box1: AangifteExtractionResult['box1_components'] = []
  const seen = new Set<string>()

  for (const h of harvests) {
    for (const a of h.assets) {
      const key = dedupeKey(a.asset_type, a.current_value, a.name)
      if (seen.has(key)) continue
      seen.add(key)
      assets.push(a)
    }
    for (const d of h.debts) {
      const key = dedupeKey(d.debt_type, d.current_balance, d.name)
      if (seen.has(key)) continue
      seen.add(key)
      debts.push(d)
    }
    for (const c of h.box1_components) {
      const key = dedupeKey(c.kind, c.annual_amount, c.label)
      if (seen.has(key)) continue
      seen.add(key)
      box1.push(c)
    }
  }

  return { assets, debts, box1_components: box1 }
}

// ── Resolver ────────────────────────────────────────────────────────────────

export interface LocalAangifteOptions {
  /** 'starten' vlak vóór loadModelSession, 'klaar' zodra die resolved. */
  onSessionState?: (s: 'starten' | 'klaar') => void
  /** Voortgang per afgerond venster — anders is dit minutenlang stilte. */
  onVoortgang?: (gedaan: number, totaal: number, sectie: string) => void
}

/**
 * max_new_tokens-schatting per venster. De LiteRT-web-SDK kent geen per-call cap
 * en negeert deze waarde; hij blijft in de signatuur zodat het contract
 * gelijkloopt met de andere lokale resolvers.
 */
export const LOCAL_AANGIFTE_MAX_NEW_TOKENS = 384

function emptyResult(taxYear: number): AangifteExtractionResult {
  return {
    assets: [],
    debts: [],
    box1_components: [],
    peildatum: peildatumFor(taxYear),
    tax_year: taxYear,
  }
}

async function runWindow(win: AangifteSectionWindow, opts: LocalAangifteOptions): Promise<string> {
  opts.onSessionState?.('starten')
  const session = await loadModelSession()
  opts.onSessionState?.('klaar')
  return session.generate(
    [
      { role: 'system', content: LOCAL_AANGIFTE_DNA },
      { role: 'user', content: buildAangifteWindowPrompt(win.kind, win.text) },
    ],
    LOCAL_AANGIFTE_MAX_NEW_TOKENS,
  )
}

async function runWindowWithRecovery(win: AangifteSectionWindow, opts: LocalAangifteOptions): Promise<string> {
  try {
    return await runWindow(win, opts)
  } catch (err) {
    console.error(`[lokale-ai] aangifte-venster "${win.heading}" mislukt — sessieherstel + één retry volgt:`, err)
    await disposeSession()
    try {
      return await runWindow(win, opts)
    } catch (err2) {
      console.error(`[lokale-ai] aangifte-venster "${win.heading}" mislukt ná sessieherstel:`, err2)
      throw err2
    }
  }
}

/**
 * Lees een Nederlandse aangifte inkomstenbelasting on-device uit.
 *
 * @param pages   De tekst per PDF-pagina (behoud de array — zie section-select.ts).
 * @param fallbackTaxYear  Jaar uit de jaarkiezer, gebruikt als de tekst er geen noemt.
 *
 * Werpt wanneer een venster ook ná sessieherstel faalt. NOOIT een stille
 * cloud-fallback.
 */
export async function extractAangifteDataLocal(
  pages: string[],
  fallbackTaxYear: number,
  opts: LocalAangifteOptions = {},
): Promise<AangifteExtractionResult> {
  const fullText = pages.join('\n')
  const taxYear = detectTaxYear(fullText, fallbackTaxYear)

  const windows = selectAangifteWindows(pages)
  if (windows.length === 0) {
    // Geen enkele aangifte-koptekst → dit is geen aangifte (een jaaropgaaf, een
    // bankafschrift, een lege scan). Leeg resultaat, ZONDER modelaanroep: de
    // gebruiker wacht geen minuut op een antwoord dat we nu al weten.
    console.info('[lokale-ai] aangifte: geen aangifte-kopteksten gevonden — leeg resultaat, geen modelaanroep')
    return emptyResult(taxYear)
  }

  const harvests: WindowHarvest[] = []
  for (const [i, win] of windows.entries()) {
    opts.onVoortgang?.(i, windows.length, win.heading)
    const raw = await runWindowWithRecovery(win, opts)
    harvests.push(harvestWindow(win, raw))
  }
  opts.onVoortgang?.(windows.length, windows.length, 'Klaar')

  const merged = mergeHarvests(harvests)
  const rejected = harvests.reduce((sum, h) => sum + h.rejected, 0)
  console.info(
    `[lokale-ai] aangifte: ${windows.length} vensters → ${merged.assets.length} bezittingen, ` +
      `${merged.debts.length} schulden, ${merged.box1_components.length} inkomensbronnen; ${rejected} rijen verworpen`,
  )

  const candidate: AangifteExtractionResult = {
    ...merged,
    peildatum: peildatumFor(taxYear),
    tax_year: taxYear,
  }

  // Eindassertie tegen hetzelfde strikte schema als het cloud-pad. De rijen zijn
  // hierboven in TypeScript samengesteld, dus dit hoort altijd te slagen — het is
  // de vangnet-controle die een toekomstige wijziging betrapt vóór de review-UI.
  const parsed = extractionSchema.safeParse(candidate)
  if (!parsed.success) {
    console.error('[lokale-ai] aangifte: eindvalidatie faalde —', parsed.error.issues[0]?.path.join('.'))
    return emptyResult(taxYear)
  }
  return parsed.data
}
