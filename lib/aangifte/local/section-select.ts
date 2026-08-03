// ── Aangifte on-device: deterministische voorselectie ────────────────────────
//
// DIT IS DE STAP DIE HET LOKALE AANGIFTE-PAD ÜBERHAUPT MOGELIJK MAAKT.
//
// Reken het even na. De cloud-systeemprompt is ~1.700 tokens, de zod-`.describe()`-
// laag die lokaal óók in de prompt moet zo'n 600, en een typische aangifte
// inkomstenbelasting levert 7.500-12.500 tokens tekst. Samen 1,2-1,8× het hele
// venster van 8192 tokens dat Gemma 4 E2B heeft. Zonder voorselectie is dit niet
// "moeilijk" maar onmogelijk: het model ziet de helft van het document nooit en
// verzint de rest.
//
// De oplossing is dat de aangifte zichzelf al indeelt. De cloud-prompt sómt de
// kopteksten op waar hij op let ('Bank- en spaartegoeden', 'Eigen woning',
// 'Schulden in Box 3', …). Die opsomming is hier het snijgereedschap: we knippen
// de tekst op precies die kopteksten en sturen alleen de vensters het model in.
// Elk venster is ~400-1.200 tokens — ruim binnen budget, en het model krijgt een
// blok waarin álles relevant is in plaats van een document waarin 90% ruis is.
//
// GEEN KOPTEKST GEVONDEN = GEEN AANGIFTE. Dat dekt de "een jaaropgaaf is geen
// aangifte"-regel uit de cloud-prompt zonder één token te decoderen: geen
// vensters → leeg resultaat → geen modelaanroep. Sneller, goedkoper en
// betrouwbaarder dan een model vragen of het wel een aangifte is.
//
// PAGINA-ARRAY BEHOUDEN. `extractTextFromPdf` plakte alle pagina's aaneen tot
// één string. Dat kan weg: per pagina snijden voorkomt dat een venster over een
// paginagrens heen de voettekst en de kop van de volgende pagina meeneemt.

/** De drie deelvragen waarin we de aangifte opknippen. */
export type AangifteSectionKind = 'assets' | 'debts' | 'box1'

export interface AangifteSectionWindow {
  kind: AangifteSectionKind
  /** De koptekst waarop dit venster begint — puur voor diagnose/tests. */
  heading: string
  /** 1-gebaseerd paginanummer waar het venster begint. */
  page: number
  /** De tekst van het venster, inclusief de koptekst zelf. */
  text: string
}

interface HeadingSpec {
  kind: AangifteSectionKind
  /** Letterlijke koptekst zoals de Belastingdienst 'm afdrukt. */
  label: string
}

/**
 * De kopteksten waarop we snijden. Bewust dezelfde lijst als de cloud-prompt
 * hanteert (lib/aangifte/system-prompt.ts, secties "WAT WEL" + de
 * MAPPING-MATRIX) — dat is geen kopie maar een BEWERKING van dezelfde bron: de
 * prompt gebruikt ze om het model te sturen, wij om de tekst te snijden.
 * Wijzigt de prompt zijn kopteksten, dan hoort deze lijst mee te bewegen.
 *
 * VOLGORDE TELT NIET voor de match (we scannen alle posities), maar de LANGSTE
 * variant moet eerst staan zodat 'Schulden in Box 3' wint van 'Schulden'.
 */
const HEADINGS: readonly HeadingSpec[] = [
  // Box 3 — bezittingen
  { kind: 'assets', label: 'Bank- en spaartegoeden' },
  { kind: 'assets', label: 'Banktegoeden' },
  { kind: 'assets', label: 'Spaartegoeden' },
  { kind: 'assets', label: 'Beleggingen' },
  { kind: 'assets', label: 'Onroerende zaken' },
  { kind: 'assets', label: 'Cryptovaluta' },
  { kind: 'assets', label: 'Vorderingen' },
  // Box 1 — eigen woning (levert zowel een asset als de eigenwoningschuld)
  { kind: 'assets', label: 'Eigen woning' },
  { kind: 'assets', label: 'Hoofdverblijf' },
  // Box 2 — aanmerkelijk belang
  { kind: 'assets', label: 'Aanmerkelijk belang' },
  { kind: 'assets', label: 'Deelneming' },
  // Box 3 — schulden
  { kind: 'debts', label: 'Schulden in Box 3' },
  { kind: 'debts', label: 'Box 3 schulden' },
  { kind: 'debts', label: 'Eigenwoningschuld' },
  { kind: 'debts', label: 'Schulden' },
  // Box 1 — inkomen
  { kind: 'box1', label: 'Inkomen uit werk en woning' },
]

/**
 * Maximale venstergrootte in tekens (~1.000 tokens). Een aangifte-sectie die
 * langer is, is bijna altijd een sectie waarvan het einde niet herkend is; dan
 * liever afkappen dan het venster laten uitdijen tot het model omvalt.
 */
export const MAX_WINDOW_CHARS = 4000

/**
 * Bovengrens op het aantal vensters. Bij ~9-12 tok/s kost elk venster tientallen
 * seconden; twaalf is de grens tussen "even geduld" en "de gebruiker loopt weg".
 * Een aangifte met meer dan twaalf herkende secties bestaat in de praktijk niet.
 */
export const MAX_WINDOWS = 12

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Eén regex met alle kopteksten als alternatieven, langste eerst. Woordgrens
 * aan het begin zodat 'Beleggingen' niet midden in 'Herbeleggingen' matcht.
 */
const HEADING_RE = new RegExp(
  `\\b(${[...HEADINGS]
    .sort((a, b) => b.label.length - a.label.length)
    .map((h) => escapeRegex(h.label))
    .join('|')})\\b`,
  'gi',
)

function kindForHeading(label: string): HeadingSpec | undefined {
  const lower = label.toLowerCase()
  return HEADINGS.find((h) => h.label.toLowerCase() === lower)
}

/**
 * Snijd de aangifte in vensters rond de herkende kopteksten.
 *
 * Elk venster loopt van zijn koptekst tot de volgende koptekst op dezelfde
 * pagina (of het einde van die pagina), afgekapt op {@link MAX_WINDOW_CHARS}.
 *
 * Geeft een LEGE lijst wanneer geen enkele koptekst voorkomt — de aanroeper
 * gebruikt dat als "dit is geen aangifte" en slaat het model volledig over.
 */
export function selectAangifteWindows(pages: string[]): AangifteSectionWindow[] {
  const windows: AangifteSectionWindow[] = []

  pages.forEach((pageText, pageIdx) => {
    if (!pageText || windows.length >= MAX_WINDOWS) return

    // Alle koptekst-posities op deze pagina, in volgorde.
    const hits: { index: number; label: string }[] = []
    HEADING_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = HEADING_RE.exec(pageText)) !== null) {
      hits.push({ index: m.index, label: m[1]! })
    }

    hits.forEach((hit, i) => {
      if (windows.length >= MAX_WINDOWS) return
      const spec = kindForHeading(hit.label)
      if (!spec) return

      const nextIndex = hits[i + 1]?.index ?? pageText.length
      const end = Math.min(nextIndex, hit.index + MAX_WINDOW_CHARS)
      const text = pageText.slice(hit.index, end).trim()
      // Een venster van louter de koptekst (bv. een inhoudsopgave-regel) draagt
      // geen rijen; het model erop loslaten kost tijd en levert niets.
      if (text.length <= hit.label.length + 8) return

      windows.push({ kind: spec.kind, heading: spec.label, page: pageIdx + 1, text })
    })
  })

  return windows
}

// ── Aangiftejaar en peildatum ───────────────────────────────────────────────

/**
 * Het aangiftejaar is volledig deterministisch af te leiden — daar hoeft geen
 * model aan te pas te komen. Drie bronnen, in aflopende betrouwbaarheid:
 *
 *  1. "Aangifte inkomstenbelasting <jaar>" — de titel van het document.
 *  2. "Belastingjaar <jaar>".
 *  3. Een peildatum-vermelding "01-01-<jaar>" of "1 januari <jaar>".
 *
 * Vindt geen van drieën iets, dan telt de `fallback` die de gebruiker in de
 * jaarkiezer heeft gezet. We accepteren alleen 2000-2099: een viercijferig getal
 * elders in de tekst (een bedrag van € 2.024) mag hier nooit als jaar landen.
 */
export function detectTaxYear(text: string, fallback: number): number {
  const patterns: RegExp[] = [
    /aangifte\s+inkomstenbelasting\s+(20\d{2})/i,
    /belastingjaar\s*:?\s*(20\d{2})/i,
    /\b0?1[-/.]0?1[-/.](20\d{2})\b/,
    /\b1\s+januari\s+(20\d{2})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const year = Number(m[1])
      if (Number.isInteger(year) && year >= 2000 && year <= 2099) return year
    }
  }
  return fallback
}

/** Peildatum is per definitie 1 januari van het aangiftejaar. */
export function peildatumFor(taxYear: number): string {
  return `${taxYear}-01-01`
}
