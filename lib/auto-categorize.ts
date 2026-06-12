/**
 * Pure beslis-logica voor de "automatisch indelen"-flows op het "Transacties
 * categoriseren"-scherm (AICategorizeSheet):
 *
 *  - `computeAutoCategorization` — "Slimme regels": deelt elke transactie in via
 *    de volledige keten (correctieregels → frequentie → trefwoordregels →
 *    eigen-rekening-detectie op IBAN/naam). Hergebruikt `categorizeTransaction`
 *    zodat het exact dezelfde uitkomst geeft als de import-flow.
 *    Spiegelparen (fuzzy signaal) worden hier NIET toegewezen: ze worden los
 *    geteld (`mirrorCandidateCount`) zodat de UI ze als kandidaat-overboekingen
 *    kan melden in plaats van ze stil uit de cijfers te halen.
 *  - `computeOwnAccountDetection` — markeert UITSLUITEND onderlinge overboekingen
 *    tussen eigen rekeningen op een STERK signaal (IBAN-set + naam-patronen) zodat
 *    die niet als uitgave/inkomen tellen. Spiegelparen worden ook hier los geteld,
 *    niet toegewezen. (Geen losse UI-optie meer; de detectie zit nu in de slimme
 *    regels én in de AI-pre-detectie — deze functie blijft als herbruikbare,
 *    geteste bouwsteen.)
 *  - `detectTransferPairs` — pure spiegelpaar-detectie (gedeeld door beide en
 *    door de AI-pre-detectie in de sheet).
 *
 * STERK vs. FUZZY signaal — het kernonderscheid:
 *   IBAN/naam-detectie is een sterk, eenduidig signaal: een herkende eigen-
 *   tegenrekening is vrijwel zeker een overboeking → direct toepassen.
 *   Een spiegelpaar (gelijk bedrag, tegengesteld teken, ≤2 dagen, andere
 *   rekening) is een FUZZY signaal: een échte uitgave (−€X) en een toevallig
 *   gelijke ontvangst (+€X) binnen het venster geven een vals-positief. Zulke
 *   detecties worden daarom NIET meer stil als transfer weggeschreven — ze
 *   gaan als voorgevuld voorstel naar de gebruiker (review) of worden geteld.
 *
 * Alle drie zijn puur (geen DB, geen React) → makkelijk te testen. De sheet
 * laadt de context, draait een van deze functies en past het resultaat
 * gebatcht toe.
 */

import {
  categorizeTransaction,
  isOwnAccountTransfer,
  type CategoryCorrection,
  type FrequencyMatch,
} from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

/** Minimale transactievorm die beide functies nodig hebben. */
export type AutoCatTx = {
  id: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
  /** ISO-datum (YYYY-MM-DD). Optioneel; alleen nodig voor spiegelpaar-detectie. */
  date?: string | null
  /** Rekening waar de transactie op staat. Optioneel; nodig voor spiegelpaar-detectie. */
  account_id?: string | null
}

/** Bedrag-tolerantie voor spiegelpaar-detectie — gelijk aan transfer-matching.ts. */
const PAIR_AMOUNT_TOLERANCE = 0.005
/** Maximaal datumverschil (kalenderdagen) tussen de twee benen van een overboeking. */
const PAIR_MAX_DAY_DIFF = 2
const MS_PER_DAY = 86_400_000

/**
 * Tel het verschil in KALENDERDAGEN tussen twee ISO-datums (YYYY-MM-DD).
 *
 * We ankeren beide op lokale middernacht (`T00:00:00`) en ronden de ms-deling af
 * i.p.v. naar beneden. Reden: bij de najaars-DST omvat een venster van 2
 * kalenderdagen 49 wandklok-uren → een kale `ms / 86_400_000` geeft 2.042 en zou
 * het paar net buiten {@link PAIR_MAX_DAY_DIFF} duwen. `Math.round` corrigeert de
 * ±1-uurs DST-sprong terug naar het bedoelde gehele aantal dagen. Bewust GEEN
 * `toISOString()` (zou in NL de datum een dag terugschuiven — maandgrens-trap).
 */
function calendarDayDiff(isoA: string, isoB: string): number {
  const ms = Math.abs(
    new Date(isoB + 'T00:00:00').getTime() - new Date(isoA + 'T00:00:00').getTime(),
  )
  return Math.round(ms / MS_PER_DAY)
}

/**
 * Detecteer spiegelparen: twee transacties op VERSCHILLENDE eigen rekeningen die
 * samen één overboeking vormen, zónder dat IBAN of naam dat verraadt (bv. beide
 * benen geïmporteerd uit aparte bankexports). Een paar voldoet aan ALLE criteria:
 *  - gelijk |bedrag| (tolerantie {@link PAIR_AMOUNT_TOLERANCE});
 *  - tegengesteld teken;
 *  - kalenderdag-verschil ≤ {@link PAIR_MAX_DAY_DIFF};
 *  - verschillende, beide non-null `account_id`.
 *
 * Matching is greedy, deterministisch en LOKAAL — geen globale optimalisatie:
 * kandidaten worden gesorteerd op (datum, dan id), en per transactie wordt het
 * tegenbeen met het kleinste kalenderdag-verschil gekozen dat nog vrij is. Bij
 * gelijk verschil wint het tegenbeen dat in de sorteervolgorde (datum, dan id)
 * het eerst komt, omdat we strict-kleiner (`<`) vergelijken. Elke transactie zit
 * in hooguit één paar. Bij ≥3 eigen rekeningen met gelijke bedragen kan deze
 * lokale keuze onder-detecteren (een paar missen) — bewust acceptabel: onder-
 * detectie laat de transactie gewoon als normale uitgave/inkomen staan en
 * schrijft dus NOOIT een foute transfer weg.
 *
 * @returns Set van transactie-id's die deel uitmaken van een spiegelpaar.
 */
export function detectTransferPairs(txs: AutoCatTx[]): Set<string> {
  // Alleen transacties met datum én rekening doen mee.
  const usable = txs.filter(
    (t): t is AutoCatTx & { date: string; account_id: string } =>
      !!t.date && !!t.account_id,
  )
  // Deterministische volgorde: datum, dan id.
  usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const paired = new Set<string>()
  for (let i = 0; i < usable.length; i++) {
    const a = usable[i]
    if (paired.has(a.id)) continue
    const aAbs = Math.abs(a.amount)

    let bestIdx = -1
    let bestDayDiff = Infinity
    for (let j = i + 1; j < usable.length; j++) {
      const b = usable[j]
      if (paired.has(b.id)) continue
      if (b.account_id === a.account_id) continue
      if (Math.sign(a.amount) === Math.sign(b.amount)) continue
      if (Math.abs(aAbs - Math.abs(b.amount)) > PAIR_AMOUNT_TOLERANCE) continue
      const dayDiff = calendarDayDiff(a.date, b.date)
      if (dayDiff > PAIR_MAX_DAY_DIFF) continue
      // Kleinste kalenderdag-verschil wint; bij gelijk verschil het tegenbeen dat
      // in de sorteervolgorde (datum, dan id) het eerst komt — strict-kleiner.
      if (dayDiff < bestDayDiff) {
        bestDayDiff = dayDiff
        bestIdx = j
      }
    }

    if (bestIdx !== -1) {
      paired.add(a.id)
      paired.add(usable[bestIdx].id)
    }
  }

  return paired
}

/** Gedeelde context (regels, geschiedenis, eigen-rekening-identifiers). */
export type AutoCatContext = {
  budgets: Budget[]
  corrections: CategoryCorrection[]
  freqMap: Map<string, FrequencyMatch>
  /** Genormaliseerd: geen spaties, uppercase. */
  ownIbans: Set<string>
  /** Lowercase substrings die een eigen rekening aanduiden. */
  ownNamePatterns: string[]
  /** Doel-budget voor herkende overboekingen; null = geen eigen-rekening-budget. */
  eigenRekeningBudgetId: string | null
}

/** Eén voorgestelde toewijzing, klaar om gebatcht naar de DB te schrijven. */
export type AutoAssignment = {
  id: string
  budget_id: string
  /** 'transfer' | 'manual' | 'rule' — landt in transactions.category_source. */
  category_source: string
  isTransfer: boolean
}

export type AutoCatResult = {
  assignments: AutoAssignment[]
  /** Aantal niet-transfer-toewijzingen (regel/frequentie/correctie). */
  ruleCount: number
  /** Aantal als eigen-rekening herkende overboekingen (STERK signaal: IBAN/naam). */
  transferCount: number
  /**
   * Aantal transacties die ALLEEN op een spiegelpaar (fuzzy signaal) wijzen en
   * géén sterke detectie/regel kregen. NIET toegewezen — bewust overgelaten aan
   * de gebruiker (review via Vraag Will of handmatig). De UI meldt dit aantal.
   */
  mirrorCandidateCount: number
  /**
   * Aantal transacties dat noch automatisch ingedeeld is, noch een spiegelpaar-
   * kandidaat. (Spiegelpaar-kandidaten worden apart in `mirrorCandidateCount`
   * geteld en zitten dus NIET in dit getal.)
   */
  unmatchedCount: number
}

/**
 * Optie 3 — deelt elke transactie in via de volledige categorisatie-keten.
 * Transfers met een STERK signaal (IBAN/naam, priority 0 in categorizeTransaction)
 * krijgen het eigen-rekening-budget; lukt dat niet (geen budget geconfigureerd),
 * dan telt de transactie als onmatched in plaats van fout ingedeeld te worden.
 *
 * Spiegelparen (FUZZY signaal) worden NIET meer stil toegewezen: een lid dat enkel
 * op een spiegelpaar wijst en verder nergens in de keten landt, wordt geteld in
 * `mirrorCandidateCount` zodat de UI het als kandidaat-overboeking kan melden.
 * Een tx die ÉN spiegelpaar ÉN IBAN/naam matcht is een sterk signaal en wordt
 * gewoon via de keten als transfer toegewezen.
 */
export function computeAutoCategorization(txs: AutoCatTx[], ctx: AutoCatContext): AutoCatResult {
  const assignments: AutoAssignment[] = []
  let ruleCount = 0
  let transferCount = 0
  let mirrorCandidateCount = 0
  let unmatchedCount = 0

  // Spiegelparen alléén tellen — niet toepassen. We draaien de gewone keten op
  // élke transactie; landt een spiegelpaar-lid daar nergens (geen IBAN/naam-
  // transfer, geen regel), dan is het een kandidaat-overboeking voor de gebruiker.
  const pairIds = detectTransferPairs(txs)

  for (const tx of txs) {
    const res = categorizeTransaction(
      tx.description,
      tx.counterparty_name,
      tx.amount,
      ctx.budgets,
      ctx.corrections,
      ctx.ownIbans,
      tx.counterparty_iban,
      ctx.freqMap,
      ctx.ownNamePatterns,
    )

    if (res.isTransfer) {
      // Sterk signaal (IBAN/naam) — ook als deze tx tevens in een spiegelpaar zit.
      if (ctx.eigenRekeningBudgetId) {
        assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true })
        transferCount++
      } else {
        unmatchedCount++
      }
    } else if (res.budget_id) {
      assignments.push({
        id: tx.id,
        budget_id: res.budget_id,
        category_source: res.category_source ?? 'rule',
        isTransfer: false,
      })
      ruleCount++
    } else if (pairIds.has(tx.id)) {
      // Spiegelpaar-only (fuzzy) → niet toepassen, tel als kandidaat.
      mirrorCandidateCount++
    } else {
      unmatchedCount++
    }
  }

  return { assignments, ruleCount, transferCount, mirrorCandidateCount, unmatchedCount }
}

export type OwnAccountResult = {
  assignments: AutoAssignment[]
  transferCount: number
  /**
   * Spiegelpaar-only kandidaten (fuzzy) die NIET zijn toegewezen — bewust aan de
   * gebruiker overgelaten. Zit niet in `transferCount`.
   */
  mirrorCandidateCount: number
  unmatchedCount: number
}

/**
 * Optie 4 — markeert uitsluitend overboekingen tussen eigen rekeningen op een
 * STERK signaal (IBAN-set + naam-patronen). Geen budget geconfigureerd → niets
 * toewijzen.
 *
 * Spiegelparen (FUZZY signaal) worden hier NIET meer stil toegewezen: een lid dat
 * enkel op een spiegelpaar wijst (geen IBAN/naam-match) wordt in
 * `mirrorCandidateCount` geteld zodat de UI het als kandidaat kan melden.
 */
export function computeOwnAccountDetection(txs: AutoCatTx[], ctx: AutoCatContext): OwnAccountResult {
  if (!ctx.eigenRekeningBudgetId) {
    return { assignments: [], transferCount: 0, mirrorCandidateCount: 0, unmatchedCount: txs.length }
  }

  // Spiegelparen alléén tellen — niet toepassen. Het IBAN/naam-signaal blijft het
  // enige dat stil wordt weggeschreven.
  const pairIds = detectTransferPairs(txs)

  const assignments: AutoAssignment[] = []
  let mirrorCandidateCount = 0
  for (const tx of txs) {
    if (isOwnAccountTransfer(tx.counterparty_iban, ctx.ownIbans, tx.counterparty_name, ctx.ownNamePatterns)) {
      // Sterk signaal — ook als deze tx tevens in een spiegelpaar zit.
      assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true })
    } else if (pairIds.has(tx.id)) {
      // Spiegelpaar-only (fuzzy) → niet toepassen, tel als kandidaat.
      mirrorCandidateCount++
    }
  }

  return {
    assignments,
    transferCount: assignments.length,
    mirrorCandidateCount,
    unmatchedCount: txs.length - assignments.length - mirrorCandidateCount,
  }
}
