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
import { normalizeCounterparty } from '@/lib/parsers/counterparty-normalize'
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
  /**
   * Zekerheid van de keten-uitkomst (categorizeTransaction): correctie 1.0/0.95,
   * frequentie 0.6–0.95, trefwoord 0.7–1.0, transfer 1.0. Gebruikt door de
   * combined pass om zwakke regel-hits alsnog aan de AI voor te leggen
   * (`minRuleConfidence`); `applyAssignments`-consumers negeren dit veld.
   */
  confidence: number
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
   * De id's achter `mirrorCandidateCount` — de combined pass bouwt hier een
   * voorgevuld eigen-rekening-voorstel van (review, niet stil toepassen).
   */
  mirrorCandidateIds: string[]
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
  const mirrorCandidateIds: string[] = []
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
        assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true, confidence: res.confidence })
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
        confidence: res.confidence,
      })
      ruleCount++
    } else if (pairIds.has(tx.id)) {
      // Spiegelpaar-only (fuzzy) → niet toepassen, tel als kandidaat.
      mirrorCandidateIds.push(tx.id)
    } else {
      unmatchedCount++
    }
  }

  return { assignments, ruleCount, transferCount, mirrorCandidateCount: mirrorCandidateIds.length, mirrorCandidateIds, unmatchedCount }
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
      assignments.push({ id: tx.id, budget_id: ctx.eigenRekeningBudgetId, category_source: 'transfer', isTransfer: true, confidence: 1.0 })
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

// ─── Combined pass: regelmotor → AI (per genormaliseerde tegenpartij) → propagatie ───
//
// De "gecombineerde automaat" (Notion-kaart jul 2026): één orkestrator die de
// bestaande pure bouwstenen samenrijgt i.p.v. of/of.
//
//  Stap 1 (gratis, lokaal): computeAutoCategorization — correcties + frequentie
//         + trefwoord + sterke transfers worden VOORSTELLEN (bron 'rule'/'transfer');
//         spiegelpaar-kandidaten krijgen een voorgevuld eigen-rekening-voorstel
//         (bron 'mirror'). Niets wordt hier toegepast — de caller legt álles ter
//         review voor (eis: ook slim-toewijzingen worden bevestigd).
//  Stap 2 (AI, alleen voor de rest): de overgebleven onbekenden worden gegroepeerd
//         op GENORMALISEERDE tegenpartij-key (zelfde normalizeCounterparty als de
//         frequentie-motor) + richting (inkomst/uitgave). Per ronde gaat van
//         maximaal `batchSize` (≤20) groepen één representant naar de AI-resolver.
//  Stap 3 (slim vervolg): het AI-oordeel propageert naar alle siblings met
//         dezelfde genormaliseerde key (bron 'propagated'); vóór elke volgende
//         ronde worden resterende groepen ook tegen eerdere AI-antwoorden geveegd
//         (cross-key: naam ↔ IBAN), zodat AI-rondes en slim toewijzen elkaar
//         afwisselen tot alles behandeld is — ook bij duizenden transacties.
//
//  Stap 4 (leer-lus: AI-oordeel → category_corrections-regel) is BEWUST niet
//  gebouwd — open productkeuze; alleen expliciete gebruikerskeuzes schrijven
//  regels (bestaand gedrag in de review-UI).
//
// Puur op de geïnjecteerde `aiResolver` na: geen fetch, geen React, geen DB.
// Aantal AI-calls = ceil(onbekende genormaliseerde tegenpartijen / batchSize),
// nooit onbegrensd parallel (strikt sequentieel, ronde voor ronde).

/** Transactievorm voor de combined pass (AutoCatTx + optionele referentie voor de AI). */
export type CombinedTx = AutoCatTx & { reference?: string | null }

/** Herkomst van een voorstel — de review-UI toont dit als label per rij. */
export type CombinedProposalSource = 'rule' | 'transfer' | 'mirror' | 'ai' | 'propagated'

/** Eén voorstel uit de combined pass. NIET toegepast: de caller legt het ter review voor. */
export type CombinedProposal = {
  id: string
  budget_id: string
  confidence: number
  source: CombinedProposalSource
  /** Waarde voor transactions.category_source bij accepteren ('rule'/'manual'/'transfer'/'ai'). */
  category_source: string
  isTransfer: boolean
  reasoning: string | null
}

/** Eén transactie in een AI-batch (de resolver POST dit naar /api/ai/categorize). */
export type CombinedAiBatchItem = {
  id: string
  description: string
  counterparty_name: string | null
  amount: number
  reference: string | null
  date: string | null
}

/** Antwoord van de AI-resolver per aangeboden transactie. */
export type CombinedAiResult = {
  id: string
  budget_id: string | null
  confidence: number
  reasoning?: string | null
}

export type CombinedProgress = {
  /** AI-ronde (0 = nog geen AI-call gedaan). */
  round: number
  /** Afgehandelde transacties in de AI-fase (voorstel gekregen óf definitief onbekend). */
  processed: number
  /** Totaal aantal transacties dat de AI-fase in ging (na de gratis regel-stap). */
  total: number
  /** Waarvan via propagatie (zonder eigen AI-call) van een voorstel voorzien. */
  propagated: number
}

export type CombinedRunResult = {
  /** Voorstellen per transactie-id. Transacties zonder entry bleven onbekend. */
  proposals: Map<string, CombinedProposal>
  counts: {
    rule: number
    transfer: number
    mirror: number
    ai: number
    propagated: number
    unresolved: number
  }
  /** Aantal uitgevoerde AI-rondes (= aantal resolver-aanroepen, incl. mislukte). */
  aiRounds: number
  /** Batches waarvan de resolver faalde — caller kan ze aanbieden voor retry. */
  failedBatches: CombinedAiBatchItem[][]
  /** True wanneer het signaal de run afbrak; de al-gedane voorstellen blijven staan. */
  aborted: boolean
  /**
   * Tx-id's van álle leden van groepen die een AI-ronde doorliepen maar géén
   * bruikbaar voorstel opleverden: de representant kwam zonder resultaat óf
   * zonder budget_id terug (below-threshold/leeg), óf de hele batch faalde (het
   * failedBatches-catch-pad). Hiermee kan de wizard-kaart per groep stoppen met
   * laden i.p.v. te wachten tot de héle run klaar is. Altijd aanwezig — lege
   * array als elke groep een voorstel kreeg. Groepen die via de propagatie-veeg
   * (cross-key answered-cache) alsnog een voorstel krijgen tellen NIET mee;
   * groepen die de veeg juist tegen een eerder als "onbekend" (answered zónder
   * budget_id) beantwoorde key aanloopt tellen WÉL mee — die krijgen nooit een
   * voorstel, dus ook zij moeten de handmatige fallback triggeren.
   */
  noMatchIds: string[]
}

/**
 * Groepeer-key voor AI-dedupe + propagatie: genormaliseerde tegenpartij-naam
 * (PSP-/terminal-ruis gestript — "CCV*BAKKER 12" ↔ "Bakker"), terugvallend op
 * IBAN. De RICHTING (inkomst/uitgave) zit in de key: een AI-oordeel over een
 * uitgave propageert nooit naar een ontvangst van dezelfde tegenpartij
 * (terugbetaling ≠ aankoop). Zonder naam én IBAN is er niets om op te
 * propageren → singleton-groep per transactie.
 */
export function combinedGroupKeys(tx: CombinedTx): { primary: string; all: string[] } {
  const dir = tx.amount > 0 ? 'in' : 'uit'
  const name = normalizeCounterparty(tx.counterparty_name)
  const iban = tx.counterparty_iban ? tx.counterparty_iban.replace(/\s/g, '').toUpperCase() : ''
  const keys: string[] = []
  if (name) keys.push(`name:${name}:${dir}`)
  if (iban) keys.push(`iban:${iban}:${dir}`)
  if (keys.length === 0) return { primary: `tx:${tx.id}`, all: [] }
  return { primary: keys[0], all: keys }
}

/**
 * Groepeer transacties op hun primaire genormaliseerde tegenpartij-key
 * ({@link combinedGroupKeys}). De Map-insertievolgorde = first-seen: de eerste
 * transactie die een nieuwe key introduceert bepaalt de positie van die groep —
 * exact dezelfde volgorde-semantiek als de inline-lus die deze helper verving.
 * Gedeeld door de combined pass (AI-fase) en de wizard-presentatie zodat beide
 * op identieke groepen werken.
 */
export function buildCombinedGroups(txs: CombinedTx[]): Map<string, CombinedTx[]> {
  const groups = new Map<string, CombinedTx[]>()
  for (const tx of txs) {
    const { primary } = combinedGroupKeys(tx)
    const list = groups.get(primary)
    if (list) list.push(tx)
    else groups.set(primary, [tx])
  }
  return groups
}

/**
 * Sorteer groep-keys "grootste eerst": primair op aantal leden aflopend
 * (`members.length` desc), tie-break op de meest recente datum in de groep
 * aflopend. Datums zijn ISO YYYY-MM-DD en worden lexicaal vergeleken; een groep
 * zonder enige datum telt als de oudste (lege string sorteert achteraan). Dé
 * gedeelde comparator voor zowel de motor (`groupOrder: 'largest-first'`) als de
 * wizard-presentatie, zodat één AI-ronde zoveel mogelijk siblings dekt en beide
 * kanten dezelfde volgorde tonen. Muteert de meegegeven `keys`-array niet.
 */
export function orderGroupsLargestFirst(
  keys: string[],
  groups: Map<string, CombinedTx[]>,
): string[] {
  // Meest recente datum binnen een groep; leden zonder datum dragen niet bij,
  // een volledig datumloze groep houdt '' (= oudste bij lexicale vergelijking).
  const mostRecentDate = (members: CombinedTx[]): string => {
    let max = ''
    for (const m of members) {
      if (m.date && m.date > max) max = m.date
    }
    return max
  }
  return [...keys].sort((a, b) => {
    const ga = groups.get(a)!
    const gb = groups.get(b)!
    if (gb.length !== ga.length) return gb.length - ga.length
    const da = mostRecentDate(ga)
    const db = mostRecentDate(gb)
    if (da !== db) return da < db ? 1 : -1
    return 0
  })
}

export async function runCombinedCategorization(
  txs: CombinedTx[],
  ctx: AutoCatContext,
  aiResolver: (batch: CombinedAiBatchItem[]) => Promise<CombinedAiResult[]>,
  opts: {
    /** Max. representanten per AI-call. Default en plafond 20 (de route capt hard). */
    batchSize?: number
    /**
     * Regel-hits (niet-transfers) onder deze zekerheid gaan alsnog naar de AI
     * i.p.v. als regel-voorstel te landen. Default 0 = elke regel-hit blijft
     * lokaal (geen AI-call). De import-flow geeft 0.8 mee (Feature #101-gedrag).
     */
    minRuleConfidence?: number
    onProgress?: (p: CombinedProgress) => void
    /** Per toegevoegd voorstel (ook stap 1) — voor incrementele UI-updates. */
    onProposal?: (p: CombinedProposal) => void
    /** Afbreken tussen rondes: al-gedane voorstellen blijven, er wordt niets toegepast. */
    signal?: AbortSignal
    /**
     * Volgorde waarin de onbekende groepen de AI-fase in gaan. 'largest-first'
     * zet de grootste groepen (meeste siblings) voorop via
     * {@link orderGroupsLargestFirst}, zodat één AI-call zoveel mogelijk
     * transacties dekt. Default (undefined) = insertievolgorde (first-seen),
     * exact het bestaande gedrag.
     */
    groupOrder?: 'largest-first'
    /**
     * Callback vlak vóór elke AI-ronde (bv. het lokale model/de sessie opwarmen).
     * Direct erna wordt opnieuw op `signal` gecontroleerd, zodat een tijdens de
     * callback gezet afbreeksignaal de ronde nog stopt (gedane voorstellen
     * blijven, zelfde semantiek als de afbreek-check tussen de rondes). Zonder
     * hook: geen effect.
     */
    onBeforeRound?: () => Promise<void> | void
    /**
     * Callback per AI-ronde die één of meer no-match-groepen opleverde: ná de
     * propagatie-/registratie-afhandeling van díe ronde aangeroepen met de
     * tx-id's van álle leden van die groepen (representant zonder (bruikbaar)
     * resultaat óf een gefaalde batch). NIET aangeroepen voor een ronde zónder
     * no-matches. Laat de wizard per groep incrementeel stoppen met laden i.p.v.
     * te wachten op het einde van de run; dezelfde ids staan altijd óók in
     * {@link CombinedRunResult.noMatchIds}. Zonder hook: geen effect.
     */
    onNoMatch?: (txIds: string[]) => void
  } = {},
): Promise<CombinedRunResult> {
  const batchSize = Math.max(1, Math.min(20, opts.batchSize ?? 20))
  const minRuleConfidence = opts.minRuleConfidence ?? 0
  const proposals = new Map<string, CombinedProposal>()
  const failedBatches: CombinedAiBatchItem[][] = []
  // No-match-ids over álle rondes heen (contract: representant zonder bruikbaar
  // voorstel óf gefaalde batch). Blijft leeg wanneer elke groep een voorstel kreeg.
  const noMatchIds: string[] = []
  let aborted = false

  // ── Stap 1: gratis, lokaal — regels/frequentie/correcties/transfers ──
  const addProposal = (p: CombinedProposal) => {
    proposals.set(p.id, p)
    opts.onProposal?.(p)
  }

  const stage1 = computeAutoCategorization(txs, ctx)
  for (const a of stage1.assignments) {
    if (!a.isTransfer && a.confidence < minRuleConfidence) continue // te zwak → AI-fase
    addProposal({
      id: a.id,
      budget_id: a.budget_id,
      confidence: a.confidence,
      source: a.isTransfer ? 'transfer' : 'rule',
      category_source: a.category_source,
      isTransfer: a.isTransfer,
      reasoning: a.isTransfer ? 'Overboeking tussen eigen rekeningen (IBAN of naam herkend)' : null,
    })
  }
  // Spiegelpaar-kandidaten (fuzzy): voorgevuld eigen-rekening-voorstel, géén AI-call.
  // Zonder eigen-rekening-budget is er geen voorstel mogelijk → gewoon de AI-fase in.
  if (ctx.eigenRekeningBudgetId) {
    for (const id of stage1.mirrorCandidateIds) {
      addProposal({
        id,
        budget_id: ctx.eigenRekeningBudgetId,
        confidence: 0.85,
        source: 'mirror',
        category_source: 'transfer',
        isTransfer: true,
        reasoning: 'Spiegelboeking: zelfde bedrag tegengesteld op een andere rekening',
      })
    }
  }

  // ── Stap 2+3: interleaved AI-rondes met propagatie op genormaliseerde key ──
  const aiPhaseTxs = txs.filter((t) => !proposals.has(t.id))
  const total = aiPhaseTxs.length
  let processed = 0
  let propagated = 0
  let round = 0

  const groups = buildCombinedGroups(aiPhaseTxs)

  // Eerdere AI-antwoorden, geregistreerd onder ál hun keys (naam én IBAN, per
  // richting) zodat een latere groep met een overlappende key zonder AI-call
  // wordt afgehandeld (de "slim toewijzen"-beurt tussen de AI-beurten).
  const answered = new Map<string, { result: CombinedAiResult; repName: string | null }>()

  const propose = (tx: CombinedTx, result: CombinedAiResult, source: 'ai' | 'propagated', repName: string | null) => {
    addProposal({
      id: tx.id,
      budget_id: result.budget_id!,
      confidence: result.confidence,
      source,
      category_source: 'ai',
      isTransfer: false,
      reasoning:
        source === 'ai'
          ? (result.reasoning ?? null)
          : `Afgeleid van ${repName ?? 'een vergelijkbare transactie'} (zelfde tegenpartij)`,
    })
    processed++
    if (source === 'propagated') propagated++
  }

  const emitProgress = () => opts.onProgress?.({ round, processed, total, propagated })

  let pendingKeys =
    opts.groupOrder === 'largest-first'
      ? orderGroupsLargestFirst(Array.from(groups.keys()), groups)
      : Array.from(groups.keys())
  emitProgress()

  while (pendingKeys.length > 0) {
    if (opts.signal?.aborted) {
      aborted = true
      break
    }

    // Propagatie-veeg vóór elke AI-ronde: groepen waarvan een key al beantwoord
    // is (door een eerdere ronde) krijgen hun voorstel zonder nieuwe AI-call.
    const stillPending: string[] = []
    // Leden die de veeg tegen een eerder-als-onbekend beantwoorde key aanloopt:
    // net als een no-match uit een AI-ronde krijgen die nooit een voorstel, dus
    // moeten ze óók als signaal naar de wizard (anders blijft de kaart laden).
    // Verzameld tijdens de veeg en er direct ná één keer geëmit.
    const sweepNoMatch: string[] = []
    for (const key of pendingKeys) {
      const members = groups.get(key)!
      let hit: { result: CombinedAiResult; repName: string | null } | undefined
      for (const m of members) {
        for (const k of combinedGroupKeys(m).all) {
          hit = answered.get(k)
          if (hit) break
        }
        if (hit) break
      }
      if (hit) {
        if (hit.result.budget_id) {
          for (const m of members) propose(m, hit.result, 'propagated', hit.repName)
        } else {
          // Eerder door de AI als "onbekend" beoordeeld → geen voorstel mogelijk.
          // Tel als afgehandeld én meld als no-match (zelfde contract als een
          // no-match binnen een AI-ronde) zodat de kaart de fallback toont.
          processed += members.length
          for (const m of members) sweepNoMatch.push(m.id)
        }
      } else {
        stillPending.push(key)
      }
    }
    pendingKeys = stillPending
    if (sweepNoMatch.length > 0) {
      noMatchIds.push(...sweepNoMatch)
      opts.onNoMatch?.(sweepNoMatch)
    }
    if (pendingKeys.length === 0) {
      emitProgress()
      break
    }

    // Vlak vóór de AI-ronde: caller-hook (bv. de lokale sessie opwarmen), daarna
    // opnieuw op afbreken checken — zelfde semantiek als de check tussen de rondes
    // (aborted=true, al-gedane voorstellen blijven staan). Zonder hook: geen effect.
    await opts.onBeforeRound?.()
    if (opts.signal?.aborted) {
      aborted = true
      break
    }

    // AI-ronde: één representant per groep, max `batchSize` groepen.
    round++
    const roundKeys = pendingKeys.slice(0, batchSize)
    pendingKeys = pendingKeys.slice(batchSize)
    const batch: CombinedAiBatchItem[] = roundKeys.map((k) => {
      const rep = groups.get(k)![0]
      return {
        id: rep.id,
        description: rep.description,
        counterparty_name: rep.counterparty_name,
        amount: rep.amount,
        reference: rep.reference ?? null,
        date: rep.date ?? null,
      }
    })

    // No-match-ids van díe ronde (representant zonder (bruikbaar) resultaat óf
    // een gefaalde batch) — na afloop van de ronde als signaal doorgegeven.
    const roundNoMatch: string[] = []

    let results: CombinedAiResult[]
    try {
      results = await aiResolver(batch)
    } catch {
      // Mislukte ronde: groepen als afgehandeld-zonder-voorstel tellen zodat de
      // lus nooit blijft hangen; de batch gaat naar failedBatches voor retry.
      // Álle leden van de gefaalde ronde zijn no-match (contract-pad b).
      failedBatches.push(batch)
      for (const k of roundKeys) {
        const members = groups.get(k)!
        processed += members.length
        for (const m of members) roundNoMatch.push(m.id)
      }
      if (roundNoMatch.length > 0) {
        noMatchIds.push(...roundNoMatch)
        opts.onNoMatch?.(roundNoMatch)
      }
      emitProgress()
      continue
    }

    const resultById = new Map(results.map((r) => [r.id, r]))
    for (const k of roundKeys) {
      const members = groups.get(k)!
      const rep = members[0]
      const res = resultById.get(rep.id)
      if (!res) {
        // Representant ontbreekt in de respons (below-threshold/leeg) → no-match
        // voor de hele groep (contract-pad a).
        processed += members.length
        for (const m of members) roundNoMatch.push(m.id)
        continue
      }
      // Registreer onder álle keys van de representant (naam + IBAN, per richting).
      for (const key of combinedGroupKeys(rep).all) {
        if (!answered.has(key)) answered.set(key, { result: res, repName: rep.counterparty_name })
      }
      if (res.budget_id) {
        propose(rep, res, 'ai', null)
        for (const m of members.slice(1)) propose(m, res, 'propagated', rep.counterparty_name)
      } else {
        // Representant kwam zónder budget_id terug (below-threshold) → no-match
        // voor de hele groep (contract-pad a). Blijft wél als answered
        // geregistreerd (hierboven), dus geen herbezoek.
        processed += members.length
        for (const m of members) roundNoMatch.push(m.id)
      }
    }
    if (roundNoMatch.length > 0) {
      noMatchIds.push(...roundNoMatch)
      opts.onNoMatch?.(roundNoMatch)
    }
    emitProgress()
  }

  // ── Telling per bron ──
  const counts = { rule: 0, transfer: 0, mirror: 0, ai: 0, propagated: 0, unresolved: 0 }
  for (const p of proposals.values()) counts[p.source]++
  counts.unresolved = txs.length - proposals.size

  return { proposals, counts, aiRounds: round, failedBatches, aborted, noMatchIds }
}
