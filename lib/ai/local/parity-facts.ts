// ── Getypeerde, defensieve toegang tot docs/ai-parity/parity.json ────────────
// Het parity-rapport wordt gegenereerd door scripts/ai-parity/scan.mjs (npm run
// parity:scan) en statisch geïmporteerd door /beheer/kennisbank. Deze selector
// leest het losgetypeerde JSON (als `unknown`) defensief uit en geeft altijd een
// geldig, klein, getypeerd object terug — nooit crashend op een ontbrekende,
// oude of lege snapshot. Zo blijft de server-page losgekoppeld van de exacte
// JSON-vorm (spiegel van lib/architecture/facts.ts#selectInsights).

/** Eén bron-DNA-bestand: opgeslagen vs. live sha256 + of ze gelijk zijn. */
export interface ParitySourceFact {
  file: string
  storedSha256: string
  liveSha256: string
  inSync: boolean
}

/**
 * Eén gecondenseerd prompt-artefact met zijn eigen sub-budget en bron-hashes.
 *
 * Er was er lang maar één (de chat-DNA), en de pagina toonde die dan ook op
 * topniveau. Inmiddels heeft elke lokale functie er een — briefing, rapport,
 * wat-als, aanbevelingen, nieuws, rekenhulp, extractie, aangifte, pensioen — elk
 * met een eigen budget dat het model kan verdringen als het overloopt. Eén
 * artefact tonen en negen verzwijgen zou een halve waarheid zijn.
 */
export interface ParityArtefactFact {
  id: string
  label: string
  /** Naam van de geëxporteerde constante, bv. LOCAL_CHAT_DNA. */
  constant: string
  /** Bestand waarin die constante staat. */
  file: string
  subBudget: number
  estimatedTokens: number
  /** 'live' = uit de bron geëxtraheerd; 'manifest-fallback' = extractie faalde. */
  tokenSource: string
  /** Past het artefact binnen zijn eigen sub-budget? */
  withinBudget: boolean
  /** Zijn alle bron-DNA's van dit artefact nog gelijk aan de baseline? */
  inSync: boolean
  sources: ParitySourceFact[]
}

/** Het uitgelezen parity-rapport in een stabiele, kleine vorm. */
export interface ParityFacts {
  /** ISO-tijd van de laatste scan; '' als er nog nooit een scan draaide. */
  generatedAt: string
  /** ISO-tijd van de baseline (parity-manifest). */
  manifestGeneratedAt: string
  /** Overall: alle bronnen in sync met de opgeslagen baseline. */
  inSync: boolean
  /** Het DNA-condensatie-sub-budget (tokens). */
  dnaSubBudget: number
  /** Live geschat aantal tokens van de gecondenseerde DNA-tekst. */
  dnaEstimatedTokens: number
  /** 'live' = uit de bron geëxtraheerd; 'manifest-fallback' = extractie faalde; '' = onbekend. */
  dnaTokenSource: string
  /** Per bron-DNA de hash-vergelijking (van het chat-artefact — legacy topniveau). */
  sources: ParitySourceFact[]
  /** Passen ALLE artefacten binnen hun eigen sub-budget? */
  budgetsOk: boolean
  /** Alle gecondenseerde prompt-artefacten, in manifest-volgorde. */
  artefacts: ParityArtefactFact[]
  /**
   * Afgeleide vlag: er is nog nooit een parity-scan gedraaid (leeg/afwezig
   * rapport). De page herkent hieraan de neutrale lege-staat.
   */
  neverGenerated: boolean
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function asBool(v: unknown): boolean {
  return v === true
}

/** Neutrale "nog nooit gegenereerd"-vorm — herkend als lege-staat door de page. */
const EMPTY_PARITY: ParityFacts = {
  generatedAt: '',
  manifestGeneratedAt: '',
  inSync: false,
  dnaSubBudget: 0,
  dnaEstimatedTokens: 0,
  dnaTokenSource: '',
  sources: [],
  budgetsOk: true,
  artefacts: [],
  neverGenerated: true,
}

/** Leest de bron-hashes van één artefact (of het legacy topniveau) uit. */
function readSources(raw: unknown): ParitySourceFact[] {
  return asArray(raw)
    .map((s) => {
      const ss = asRecord(s)
      return {
        file: asString(ss.file),
        storedSha256: asString(ss.storedSha256),
        liveSha256: asString(ss.liveSha256),
        inSync: asBool(ss.inSync),
      }
    })
    .filter((s) => s.file)
}

/**
 * Leest defensief het parity-rapport uit de (los getypeerde) JSON-snapshot.
 * Geeft altijd een geldig `ParityFacts`-object terug; bij een leeg/afwezig/oud
 * rapport de neutrale lege-staat (`neverGenerated: true`), zodat de page een
 * lege-staat kan tonen i.p.v. te crashen of verzonnen cijfers te tonen.
 */
export function selectParityFacts(raw: unknown): ParityFacts {
  const root = asRecord(raw)
  const generatedAt = asString(root.generatedAt)

  // Geen scan-tijd → beschouw als "nog nooit gegenereerd" (lege-staat).
  if (!generatedAt) return EMPTY_PARITY

  const sources = readSources(root.sources)

  const artefacts: ParityArtefactFact[] = asArray(root.artefacts)
    .map((a) => {
      const aa = asRecord(a)
      const id = asString(aa.id)
      return {
        id,
        // Valt terug op het id, zodat een artefact zonder label niet als lege
        // rij in de beheerlijst verschijnt.
        label: asString(aa.label) || id,
        constant: asString(aa.constant),
        file: asString(aa.file),
        subBudget: asNumber(aa.subBudget),
        estimatedTokens: asNumber(aa.estimatedTokens),
        tokenSource: asString(aa.tokenSource),
        // Defensieve default: een rapport zónder deze vlag (ouder formaat) mag
        // geen vals alarm geven. Drift en overloop hebben eigen signalen.
        withinBudget: aa.withinBudget === undefined ? true : asBool(aa.withinBudget),
        inSync: asBool(aa.inSync),
        sources: readSources(aa.sources),
      }
    })
    .filter((a) => a.id)

  return {
    generatedAt,
    manifestGeneratedAt: asString(root.manifestGeneratedAt),
    inSync: asBool(root.inSync),
    dnaSubBudget: asNumber(root.dnaSubBudget),
    dnaEstimatedTokens: asNumber(root.dnaEstimatedTokens),
    dnaTokenSource: asString(root.dnaTokenSource),
    sources,
    // Ouder rapport zonder deze vlag → niet als overschrijding tonen.
    budgetsOk: root.budgetsOk === undefined ? true : asBool(root.budgetsOk),
    artefacts,
    neverGenerated: false,
  }
}
