// ── Publicatie-screening: de DETERMINISTISCHE helft ─────────────────────────
//
// Een pure functie — geen AI, geen netwerk, geen Supabase — die de naam,
// beschrijving en aannames van een rekenhulp aftast op de drie dingen die
// mechanisch te herkennen zijn: concrete persoonlijke bedragen, met naam
// genoemde aanbieders, en advies-imperatieven. Bruikbaar in de browser (vóór het
// versturen) én op de server.
//
// ═══ WAT DIT NIET IS ═══════════════════════════════════════════════════════
// Dit VERVANGT `screenPublishMetadata` niet en is géén poortwachter.
//
// De echte grens die bij publiceren bewaakt wordt — educatieve rekenhulp (mag)
// versus concreet financieel advies (mag niet, Wft) — is een TAALOORDEEL. "Wat
// levert extra aflossen op?" en "Extra aflossen levert jou dit op" verschillen
// niet in trefwoorden maar in strekking, en dat onderscheid maakt geen enkele
// regex. Bovendien valt een browser-oordeel per definitie te omzeilen: wie de
// client passeert, publiceert ongescreend. Daarom blijft de server-screening
// (`app/api/calculators/publish/route.ts` → `screenPublishMetadata`) onverkort
// de beslissende instantie.
//
// Wat deze functie WEL doet: iemand die publiceren wil vóóraf laten zien wat er
// vrijwel zeker gaat opvallen, zodat hij het kan oplossen zonder eerst een
// afwijzing van de server op te halen. GEEN BEVINDINGEN BETEKENT DUS NIET DAT
// PUBLICEREN ZAL LUKKEN — de UI mag dat nergens suggereren.
//
// ═══ DE AANBIEDERSLIJST ════════════════════════════════════════════════════
// Bewust een eindige, verdedigbare set in plaats van een poging tot volledigheid
// (die zou toch mislukken en valse zekerheid geven): de grootbanken en
// spaarbanken die in Nederland het vaakst in een financiële vraag opduiken, de
// brokers/beleggingsplatformen waar Nederlandse particulieren daadwerkelijk
// zitten, de bekendste fondshuizen/indexaanbieders, de grote verzekeraars/
// pensioenuitvoerders en de crypto-/betaalpartijen met een groot NL-bereik.
// Zo'n lijst veroudert; hij mag hier gerust bijgewerkt worden, maar hij is
// nooit de reden dat iets wél of niet gepubliceerd wordt — dat blijft de server.

/** Vorm gelijk aan `ScreenPublishInput` in screen-publish-metadata.ts. */
export interface DeterministicScreenInput {
  name: string
  description?: string | null
  assumptions?: string[]
}

export type DeterministicFindingSoort = 'bedrag' | 'aanbieder' | 'advies'

export interface DeterministicFinding {
  soort: DeterministicFindingSoort
  /** Waar de treffer stond ("naam", "beschrijving", "aanname 2"). */
  veld: string
  /** De letterlijke tekst die opviel — zodat de auteur 'm terugvindt. */
  treffer: string
  /** Korte Nederlandse uitleg, zelfde rol als `issue` op ScreenPublishResult. */
  issue: string
  suggestion?: string
}

/**
 * Zelfde vorm als `ScreenPublishResult` (ok / issue / suggestion), met de
 * volledige lijst erbij zodat de UI alles ineens kan tonen.
 */
export type DeterministicScreenResult =
  | { ok: true; findings: [] }
  | { ok: false; issue: string; suggestion?: string; findings: DeterministicFinding[] }

// ── 1. Aanbieders ───────────────────────────────────────────────────────────
//
// `hoofdlettergevoelig: true` voor korte afkortingen. Zonder die vlag zou een
// case-insensitive `\bNN\b` of `\bING\b` ook in gewone Nederlandse tekst gaan
// vuren; met hoofdletter-eis is een treffer vrijwel altijd de merknaam.
interface AanbiederRegel {
  naam: string
  hoofdlettergevoelig?: boolean
}

export const AANBIEDER_DENYLIST: readonly AanbiederRegel[] = [
  // Banken
  { naam: 'ING', hoofdlettergevoelig: true },
  { naam: 'Rabobank' },
  { naam: 'ABN AMRO' },
  { naam: 'ABN', hoofdlettergevoelig: true },
  { naam: 'SNS', hoofdlettergevoelig: true },
  { naam: 'RegioBank' },
  { naam: 'ASN Bank' },
  { naam: 'Triodos' },
  { naam: 'Knab' },
  { naam: 'bunq' },
  { naam: 'Van Lanschot' },
  { naam: 'NIBC' },
  // Brokers / beleggingsplatformen
  { naam: 'DEGIRO' },
  { naam: 'Bux' },
  { naam: 'Trade Republic' },
  { naam: 'Saxo' },
  { naam: 'BinckBank' },
  { naam: 'eToro' },
  { naam: 'Interactive Brokers' },
  { naam: 'Meesman' },
  { naam: 'Brand New Day' },
  { naam: 'Semmie' },
  // Hoofdlettergevoelig omdat het merk samenvalt met een gewoon woord
  // ("peaks", "kraken", "wise") — anders vuurt de check op normale zinnen.
  { naam: 'Peaks', hoofdlettergevoelig: true },
  // Fondshuizen / indexaanbieders
  { naam: 'Vanguard' },
  { naam: 'BlackRock' },
  { naam: 'iShares' },
  { naam: 'Robeco' },
  { naam: 'Fidelity' },
  { naam: 'Northern Trust' },
  { naam: 'Actiam' },
  // Verzekeraars / pensioenuitvoerders
  { naam: 'Nationale-Nederlanden' },
  { naam: 'Aegon' },
  { naam: 'Achmea' },
  { naam: 'Centraal Beheer' },
  { naam: 'a.s.r.' },
  { naam: 'Zwitserleven' },
  { naam: 'Allianz' },
  { naam: 'ABP', hoofdlettergevoelig: true },
  { naam: 'PFZW', hoofdlettergevoelig: true },
  // Crypto / betaalpartijen
  { naam: 'Bitvavo' },
  { naam: 'Coinbase' },
  { naam: 'Binance' },
  { naam: 'Kraken', hoofdlettergevoelig: true },
  { naam: 'Revolut' },
  { naam: 'Wise', hoofdlettergevoelig: true },
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Woordgrens-match. Voor meerwoordige namen mag de tussenruimte elke witruimte
 * of een koppelteken zijn ("ABN AMRO", "ABN-AMRO"). Namen die op een punt
 * eindigen ("a.s.r.") krijgen geen sluitende `\b` — een punt is zelf al geen
 * woordkarakter, dus `\b` zou daar nooit matchen.
 */
function aanbiederRegex(regel: AanbiederRegel): RegExp {
  const kern = escapeRegex(regel.naam).replace(/\\?\s+/g, '[\\s-]+')
  const start = /^[a-z0-9]/i.test(regel.naam) ? '\\b' : ''
  const eind = /[a-z0-9]$/i.test(regel.naam) ? '\\b' : ''
  return new RegExp(`${start}${kern}${eind}`, regel.hoofdlettergevoelig ? '' : 'i')
}

// ── 2. Bedragen ─────────────────────────────────────────────────────────────
//
// Drie vormen, in volgorde van hoe hard ze zijn:
//   a. een euroteken met cijfers erachter  → "€321.500", "€ 1.200"
//   b. cijfers met de eenheid erbij        → "50.000 euro", "280000 EUR"
//   c. een gegroepeerd of lang getal       → "321.500", "1 200 000", "280000"
// Jaartallen (1900-2100) vallen bewust buiten c: "Rekenhulp 2026" of "vanaf
// 2030" is geen persoonlijk bedrag, en zo'n valse treffer maakt de hele check
// ongeloofwaardig. Staat er wél een eenheid bij ("2026 euro"), dan vangt b 'm.
const BEDRAG_PATRONEN: readonly RegExp[] = [
  /€\s?\d[\d.,\s]*/g,
  /\b\d[\d.,\s]*\s?(?:euro|EUR)\b/gi,
  /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?\b|\b\d{4,}\b/g,
]

function isJaartal(treffer: string): boolean {
  const kaal = treffer.trim()
  if (!/^\d{4}$/.test(kaal)) return false
  const n = Number(kaal)
  return n >= 1900 && n <= 2100
}

// ── 3. Advies-imperatieven ──────────────────────────────────────────────────
//
// Alleen formuleringen die de LEZER iets opdragen. Vaktermen die alleen de
// berekening benoemen ("aflossen", "beleggen", "vergelijk") blijven bewust
// buiten schot: "Vergelijk extra aflossen met beleggen" beschrijft wát er
// gerekend wordt en is precies het soort naam dat wél mag.
interface AdviesRegel {
  patroon: RegExp
  uitleg: string
}

export const ADVIES_PATRONEN: readonly AdviesRegel[] = [
  { patroon: /\blos\b[^.!?]{0,40}\baf\b/i, uitleg: 'roept op om af te lossen' },
  { patroon: /\bbeleg\b(?!gen)/i, uitleg: 'roept op om te beleggen' },
  { patroon: /\b(?:kies|ga)\s+voor\b/i, uitleg: 'schrijft een keuze voor' },
  { patroon: /\bstap\s+over\b/i, uitleg: 'roept op om over te stappen' },
  { patroon: /\bje\s+(?:moet|zou\s+moeten|kunt\s+beter)\b/i, uitleg: 'schrijft de lezer gedrag voor' },
  { patroon: /\bmoet\s+je\b/i, uitleg: 'schrijft de lezer gedrag voor' },
  { patroon: /\bhet\s+beste\s+(?:is|kun)\b/i, uitleg: 'presenteert één optie als de beste' },
  { patroon: /\b(?:wij\s+)?(?:advis|raad)\w*\s+(?:je|u|ik|wij|aan)\b/i, uitleg: 'geeft expliciet advies' },
  { patroon: /\bwordt\s+rijk\b|\bgegarandeerd\b/i, uitleg: 'belooft een uitkomst' },
]

// ── De check ────────────────────────────────────────────────────────────────

function velden(input: DeterministicScreenInput): Array<{ veld: string; tekst: string }> {
  const uit: Array<{ veld: string; tekst: string }> = []
  if (input.name?.trim()) uit.push({ veld: 'naam', tekst: input.name })
  if (input.description?.trim()) uit.push({ veld: 'beschrijving', tekst: input.description })
  for (const [i, aanname] of (input.assumptions ?? []).entries()) {
    if (aanname?.trim()) uit.push({ veld: `aanname ${i + 1}`, tekst: aanname })
  }
  return uit
}

/**
 * Screen naam/beschrijving/aannames deterministisch. Puur: zelfde invoer geeft
 * altijd dezelfde uitkomst, en er gaat niets het netwerk op.
 */
export function screenPublishDeterministic(
  input: DeterministicScreenInput,
): DeterministicScreenResult {
  const findings: DeterministicFinding[] = []
  const gezien = new Set<string>()

  const voegToe = (f: DeterministicFinding) => {
    // Dezelfde treffer in hetzelfde veld maar één keer melden — een naam die
    // twee bedragen bevat levert twee meldingen, hetzelfde bedrag twee keer niet.
    // Bedragen normaliseren we tot hun cijfers: "€50.000" en "50.000 euro" zijn
    // hetzelfde bedrag, gevonden door twee patronen, en dat mag geen twee
    // meldingen over precies hetzelfde opleveren.
    const kern = f.soort === 'bedrag' ? f.treffer.replace(/\D/g, '') : f.treffer.toLowerCase()
    const sleutel = `${f.soort}|${f.veld}|${kern}`
    if (gezien.has(sleutel)) return
    // Overlappende aanbiedersnamen ("ABN AMRO" bevat "ABN") melden we één keer,
    // op de langste treffer — twee meldingen over dezelfde bank leest als twee
    // problemen terwijl het er één is.
    if (
      f.soort === 'aanbieder' &&
      findings.some(
        (b) =>
          b.soort === 'aanbieder' &&
          b.veld === f.veld &&
          b.treffer.toLowerCase().includes(kern),
      )
    ) {
      return
    }
    gezien.add(sleutel)
    findings.push(f)
  }

  for (const { veld, tekst } of velden(input)) {
    // Bedragen
    for (const patroon of BEDRAG_PATRONEN) {
      for (const match of tekst.matchAll(patroon)) {
        const treffer = match[0].trim()
        if (isJaartal(treffer)) continue
        voegToe({
          soort: 'bedrag',
          veld,
          treffer,
          issue: `In de ${veld} staat een concreet bedrag (${treffer}). Dat is waarschijnlijk jouw eigen situatie en hoort niet in een template die iedereen gebruikt.`,
          suggestion:
            'Haal het bedrag uit de tekst en laat de rekenhulp het zelf uitrekenen — de invoervelden zijn er juist voor.',
        })
      }
    }

    // Aanbieders
    for (const regel of AANBIEDER_DENYLIST) {
      const match = tekst.match(aanbiederRegex(regel))
      if (!match) continue
      voegToe({
        soort: 'aanbieder',
        veld,
        treffer: match[0],
        issue: `In de ${veld} staat een aanbieder met naam (${match[0]}). In een publieke rekenhulp leest dat als een aanbeveling voor dat product.`,
        suggestion: `Vervang "${match[0]}" door een soortnaam, bijvoorbeeld "een online broker", "je bank" of "een indexfonds".`,
      })
    }

    // Advies-imperatieven
    for (const regel of ADVIES_PATRONEN) {
      const match = tekst.match(regel.patroon)
      if (!match) continue
      voegToe({
        soort: 'advies',
        veld,
        treffer: match[0],
        issue: `De ${veld} ${regel.uitleg} ("${match[0]}"). Een publieke rekenhulp beschrijft wát er berekend wordt, niet wat iemand zou moeten doen.`,
        suggestion:
          'Herschrijf als beschrijving van de berekening, bijvoorbeeld "Vergelijk extra aflossen met beleggen".',
      })
    }
  }

  if (findings.length === 0) return { ok: true, findings: [] }
  return {
    ok: false,
    issue: findings[0].issue,
    suggestion: findings[0].suggestion,
    findings,
  }
}
