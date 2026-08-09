/**
 * Bron-grendel op de euro-weergave-render-grens in `horizon-client.tsx` (T4).
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: dit bestand is >8000 regels met
 * tientallen chart-feeds. Een render-test kan bewijzen dát een bepaald bedrag
 * klopt, maar niet dat er nérgens anders in het bestand nog een tweede
 * omzetting bijkomt. Precies die tweede omzetting is de fout die we moeten
 * uitsluiten: een dubbel gedeeld bedrag ziet er op het scherm plausibel uit.
 * Dus lezen we de bron en eisen we dat álle omzetting binnen één blok ligt.
 * (Precedent: `lib/fire-target-shared.test.ts` leest de bron óók letterlijk.)
 *
 * DRIE REGELS, en regel 3 is de belangrijkste:
 *  1. er is precies één start- en één eindbaken, in die volgorde;
 *  2. elke `deflate(`/`deflateRowsByAge(`/`deflatePoints(`/
 *     `deflateSeriesByOffset(`-aanroep ligt tussen de bakens;
 *  3. elk voorkomen van `inflationFactor` ligt tussen de bakens óf draagt een
 *     `// euro-view: exempt`-markering.
 *
 * Regel 2 alleen is een NAAM-controle: hij vangt `deflate(` maar niet een
 * handgerolde `x / row.inflationFactor` — en die stond er al (het reële
 * erfenisdoel in `housingHeldNotice`). Een test met alleen regel 2 zou dus groen
 * zijn geweest terwijl er buiten het blok gedeeld werd. Regel 3 maakt er een
 * GRENS-controle van.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

const START_BAKEN = 'EURO-WEERGAVE: DE RENDER-GRENS'
const EIND_BAKEN = 'EINDE EURO-WEERGAVE'

/** De vier feed-omzetters uit `lib/euro-display.ts`, als aanroep herkend. */
const DEFLATE_CALL = /\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset)\s*\(/

/** Markering die een bewuste uitzondering buiten het blok legitimeert (D12/D13). */
const EXEMPT_MARK = '// euro-view: exempt'

function readSourceLines(): string[] {
  return readFileSync(SOURCE_PATH, 'utf8').split(/\r?\n/)
}

/** Regelindexen (0-based) van start- en eindbaken. */
function findBakens(lines: string[]): { start: number; eind: number } {
  const starts: number[] = []
  const einden: number[] = []
  lines.forEach((line, index) => {
    if (line.includes(START_BAKEN)) starts.push(index)
    if (line.includes(EIND_BAKEN)) einden.push(index)
  })
  expect(starts, 'exact één startbaken verwacht').toHaveLength(1)
  expect(einden, 'exact één eindbaken verwacht').toHaveLength(1)
  expect(starts[0], 'het startbaken moet vóór het eindbaken staan').toBeLessThan(einden[0])
  return { start: starts[0], eind: einden[0] }
}

/**
 * Draagt deze regel — of de regel erboven — een exempt-markering? Beide, omdat
 * een markering soms boven een meerregelige expressie hoort te staan en soms
 * achter de regel zelf past.
 */
function isExempt(lines: string[], index: number): boolean {
  return (
    lines[index].includes(EXEMPT_MARK) ||
    (index > 0 && lines[index - 1].includes(EXEMPT_MARK))
  )
}

describe('horizon-client.tsx — euro-weergave-render-grens (T4)', () => {
  it('heeft precies één gemarkeerd render-grensblok', () => {
    const lines = readSourceLines()
    const { start, eind } = findBakens(lines)
    // Het blok moet ook daadwerkelijk iets omvatten; een leeg blok zou de
    // grendel formeel groen houden zonder iets te bewaken.
    expect(eind - start).toBeGreaterThan(1)
  })

  it('zet elke deflatie-aanroep binnen de bakens', () => {
    const lines = readSourceLines()
    const { start, eind } = findBakens(lines)

    const buiten: string[] = []
    lines.forEach((line, index) => {
      if (index > start && index < eind) return
      // De import-regels noemen de functienamen zonder ze aan te roepen.
      if (/^\s*(import|export)\b/.test(line)) return
      if (!DEFLATE_CALL.test(line)) return
      if (isExempt(lines, index)) return
      buiten.push(`r${index + 1}: ${line.trim()}`)
    })

    expect(
      buiten,
      'deflatie hoort uitsluitend in het render-grensblok — zet deze aanroep(en) daarbinnen',
    ).toEqual([])
  })

  it('zet elke inflationFactor-verwijzing binnen de bakens of markeert hem exempt', () => {
    const lines = readSourceLines()
    const { start, eind } = findBakens(lines)

    const ongemarkeerd: string[] = []
    lines.forEach((line, index) => {
      if (index > start && index < eind) return
      if (!line.includes('inflationFactor')) return
      if (isExempt(lines, index)) return
      ongemarkeerd.push(`r${index + 1}: ${line.trim()}`)
    })

    expect(
      ongemarkeerd,
      'een handgerolde deling door inflationFactor buiten het blok is precies wat deze grendel moet vangen — ' +
        'zet hem in het blok of markeer hem met "// euro-view: exempt" plus reden',
    ).toEqual([])
  })

  it('gebruikt de naamconventie: de chart-feeds gaan als view*-waarden naar SimChart', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // De vier feeds waar een terugval op de nominale variabele onzichtbaar zou
    // zijn (het bedrag oogt plausibel), dus expliciet gepind.
    expect(src).toMatch(/rows=\{useHouseholdMainLine \? viewHouseholdMainLineRows/)
    expect(src).toMatch(/fireTarget=\{viewFireTarget\}/)
    expect(src).toMatch(/targetEndPortfolio=\{viewTargetEndPortfolio\}/)
    expect(src).toMatch(/targetInflationFactors=\{[^}]*viewTargetInflationFactors\}/)
  })

  it('toont de hero-puntbedragen als view*-waarden (FR-B5)', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // Het FIRE-doel, "vermogen op AOW" en de maandonttrekking horen bij een
    // SPECIFIEKE leeftijd. Een terugval op de nominale variabele is hier
    // onzichtbaar: het bedrag blijft plausibel, alleen te hoog.
    expect(src).not.toMatch(/MaskedAmount value=\{fireTargetInclHome!\}/)
    expect(src).not.toMatch(/MaskedAmount value=\{fireTargetExclHome!\}/)
    expect(src).not.toMatch(/isPensioenMode \? \(portfolioAtAow \?\? 0\) : balkVrijheidDoel/)
    expect(src).toMatch(/const viewFireTargetInclHome = /)
    expect(src).toMatch(/const viewPortfolioAtAow = /)
    expect(src).toMatch(/const viewMonthlyWithdrawalAtAow =/)
    // De factor komt van de bijbehorende leeftijd, niet van "nu".
    expect(src).toMatch(/factorAtAge\(displayUnifiedRows, userAowAge\.fractional\)/)
  })

  it('houdt het voortgangs-PAAR nominaal: balk-fill en balk-label delen één noemer', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // De balk vult op `effectiveFreedomPct` — canoniek uit
    // `computeFreedomProgressWithBasis` met een NOMINALE noemer. Het label
    // rechts van de balk IS die noemer, geen losstaand doelbedrag: zet je daar
    // het gedeflateerde doel neer, dan leest het paar twee grondslagen tegelijk
    // (een balk op 40% naast een bedrag waarvan de breuk 59% is).
    expect(src).toMatch(/width: `\$\{hasPerspectiveHero \? [^`]*effectiveFreedomPct\}%`/)
    expect(src).toMatch(/formatMaskedCurrency\(balkVrijheidDoel, masked\)\} — volledige vrijheid/)
    expect(src).toMatch(/formatMaskedCurrency\(portfolioAtAow \?\? 0, masked\)\} — vermogen op AOW/)
    // …en de uitzondering draagt de verplichte markering (D12/D13).
    expect(src).toMatch(/euro-view: exempt — hoort bij de nominale freedomPct-noemer/)
    // De KPI-tegel "benodigd" is wél een LOSSTAAND doelbedrag en blijft
    // deflateren; anders zou deze fix stil de hele hero nominaal maken.
    expect(src).toMatch(/isPensioenMode \? \(viewPortfolioAtAow \?\? 0\) : viewBalkVrijheidDoel/)
  })

  it('leidt élke FIRE-moment-factor af uit één genormaliseerde leeftijd (KRUIS-27)', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // `factorAtAge` kiest de dichtstbijzijnde rij en laat een leeftijd exact op
    // .5 naar BENEDEN vallen, terwijl /overzicht zijn lookup voedt met de
    // afgeronde weergave-leeftijd uit `fireAgeForDisplay` (naar BOVEN). Zonder
    // normalisatie hangt de deflator dus af van de bron, niet van het bedrag.
    expect(src).toMatch(/const fireFactorAge = useMemo\(/)
    expect(src).toMatch(/fireAgeForDisplay\(simResult\?\.fireAgeFractional \?\? simResult\?\.fireAge \?\? null\)/)
    // Geen enkele FIRE-factor-lookup mag nog rechtstreeks op de fractionele
    // leeftijd sleutelen — dat was precies de divergentie.
    expect(src).not.toMatch(/factorAtAge\(displayUnifiedRows, simResult\??\.fireAgeFractional/)
  })

  it('houdt de twee onzichtbare sleutelkeuzes expliciet op de callsite (K2/K4)', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // K2 — de besteedbaar-lijn plot de waarde van rij `age` op `age + 1`; zonder
    // deze sleutel deflateert de lijn stil één jaar te ver.
    expect(src).toMatch(/deflatePoints\(liquidWealthPoints, factorByAge, euroView, x => x - 1\)/)
    // K4 — partner-/huishoudfeeds sleutelen op POSITIE, niet op leeftijd: hun
    // rijen dragen de leeftijden van een ander.
    expect(src).toMatch(/factorMapByPosition\(partnerLine\.rows, factorByOffset\)/)
    expect(src).toMatch(/factorMapByPosition\(householdMainLine\.rows, factorByOffset\)/)
  })

  it('laat het dagtarief (€ → vrijheidstijd) ongemoeid', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // D15: het dagtarief is per definitie een grootheid van vandaag. Deflateert
    // het mee, dan wordt de deflatie twee keer toegepast op de vrijheidstijd.
    expect(src).toMatch(/dailyExpenseRate=\{\(effectiveInput\?\.yearlyMustExpenses \?\? 0\) \/ 365\}/)
  })

  it('deflateert de vermogensopbouw-staven (WealthCompositionChart) als view*-feed', () => {
    // Given een gebruiker die de hoofdgrafiek op de staafmodus (vermogensopbouw)
    // zet, When hij de euro-weergave op 'huidige euro's' zet, Then horen de
    // gestapelde jaarstanden (spaargeld/beleggingen/pensioen/vastgoed/overig/
    // schulden — klasse S, eigen leeftijd-as) met de jaarfactor gedeeld te zijn.
    // Deze feed werd in wave 2 gemist: hij bevat geen deflate-aanroep en geen
    // inflationFactor-verwijzing, dus regels 2 en 3 konden hem niet vangen —
    // een AFWEZIGE deflatie is voor die grendels onzichtbaar. Vandaar deze pin.
    const src = readFileSync(SOURCE_PATH, 'utf8')
    expect(src).toMatch(/stackedRows=\{viewWealthCompositionRows\}/)
    // De veldenlijst is expliciet (nooit "alles wat een getal is") en `age`
    // mag er niet in staan (klasse R).
    const fieldsMatch = src.match(/const STACKED_ROW_MONEY_FIELDS = \[([^\]]+)\]/)
    expect(fieldsMatch, 'STACKED_ROW_MONEY_FIELDS moet bestaan').not.toBeNull()
    for (const field of ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden']) {
      expect(fieldsMatch![1]).toContain(`'${field}'`)
    }
    expect(fieldsMatch![1]).not.toContain("'age'")
  })

  it('classificeert élk SimRow-veld — de gard werkt andersom dan `satisfies`', () => {
    // `satisfies readonly (keyof SimRow)[]` bewijst alleen dat de GENOEMDE
    // sleutels bestaan, niet dat alle geldvelden genoemd ZIJN. Een nieuw
    // euro-veld op SimRow zou dus ongedeflateerd de rendergrens kruisen zonder
    // compile-fout. De dekkingsgard (`Exclude<keyof SimRow, …>` → `never`) draait
    // dat om; deze pin zorgt dat hij niet stil weggehaald wordt.
    const src = readFileSync(SOURCE_PATH, 'utf8')
    expect(src).toMatch(/const SIM_ROW_NON_MONEY_FIELDS = \[/)
    expect(src).toMatch(/type OngeclassificeerdSimRowVeld = Exclude</)
    expect(src).toMatch(/AlleSimRowVeldenGeclassificeerd<OngeclassificeerdSimRowVeld>/)
  })

  it('passeert de rekenrijen nominaal naar de fase-modals (kruis-regime, N3)', () => {
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // De modals lezen `useEuroView()` zelf en deflateren per klasse; zouden ze
    // hier al-gedeflateerde rijen krijgen, dan deflateert de kassabon dubbel.
    expect(src).not.toMatch(/rows=\{viewUnifiedRows/)
    expect(src).not.toMatch(/allRows=\{view/)
    // …en er gaat geen `view`-prop naar een fase-modal.
    expect(src).not.toMatch(/^\s*view=\{euroView\}/m)
  })
})
