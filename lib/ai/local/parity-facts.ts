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
  /** Per bron-DNA de hash-vergelijking. */
  sources: ParitySourceFact[]
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
  neverGenerated: true,
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

  const sources: ParitySourceFact[] = asArray(root.sources)
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

  return {
    generatedAt,
    manifestGeneratedAt: asString(root.manifestGeneratedAt),
    inSync: asBool(root.inSync),
    dnaSubBudget: asNumber(root.dnaSubBudget),
    dnaEstimatedTokens: asNumber(root.dnaEstimatedTokens),
    dnaTokenSource: asString(root.dnaTokenSource),
    sources,
    neverGenerated: false,
  }
}
