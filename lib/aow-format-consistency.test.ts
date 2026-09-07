import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { formatAowAge, formatAowAgeKort, lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Zusterbestand van `lib/aow-surface-consistency.test.ts`.
 *
 * Die suite bewaakt de DATABRON (elk oppervlak leest dezelfde `aow_leeftijd`-tabel
 * via dezelfde gedeelde cache). Deze suite bewaakt de laag erbóven: de WEERGAVE.
 *
 * AANLEIDING (UR3-24): de bron was al één, maar dezelfde leeftijd werd op NEGEN
 * manieren geschreven, omdat elk oppervlak zijn eigen omzetting deed —
 *
 *   "67"                 `.years` (maanden stilzwijgend weggegooid — informatieverlies)
 *   "67 jaar en 9 maanden"  `formatAowAge` (canoniek)
 *   "67,8"               `formatPlanAge` — een STOPleeftijd-formatter op een AOW-leeftijd
 *   "68"                 inline `Math.round(fractional)`
 *   "67+9m"              inline `Math.floor` + `Math.round(frac*12)`
 *   "67j + 9m"           weer een eigen inline variant
 *   "(67)"               inline `Math.floor` in de tekort-lening-copy
 *
 * Persona Henk zag vier notaties in één sessie. Sinds UR3-24 is er precies één
 * lopende-tekstvorm plus één vastgelegde uitzondering voor krappe annotaties, en
 * kiest elke weergaveplek daar bewust uit (acceptatiecriterium 3 van de kaart:
 * "een nieuwe weergaveplek dwingt een test de canonieke vorm af").
 *
 * Het BESLUIT van 6 sep 2026 herschreef acceptatiecriterium 2: de display-drift-lock
 * (`Math.ceil` voor de ingangsleeftijd-INVOER/opslag) blijft bewust bestaan en is
 * géén weergave — daarom scant deze suite de opslagpaden niet.
 */

const ROOT = join(__dirname, '..')

// Cohort 1970-07-01..1973-03-31 → 67j9m; het cohort waarop alle negen vormen uiteenliepen.
const COHORT_67J9M: AowLeeftijdRow = {
  id: '06',
  birth_date_from: '1970-07-01',
  birth_date_through: '1973-03-31',
  aow_years: 67,
  aow_months: 9,
  is_definitive: false,
  source: 'test',
}

describe('AOW-weergave — de canonieke vormen zelf', () => {
  it('formatAowAge is DE lopende-tekstvorm: "67 jaar en 9 maanden"', () => {
    expect(formatAowAge(lookupAowAge([COHORT_67J9M], '1971-01-01'))).toBe('67 jaar en 9 maanden')
    expect(formatAowAge({ years: 67, months: 0, fractional: 67, isDefinitive: true })).toBe('67 jaar')
  })

  it('formatAowAgeKort is DE vastgelegde uitzondering voor krappe annotaties: "67+9m"', () => {
    expect(formatAowAgeKort(lookupAowAge([COHORT_67J9M], '1971-01-01'))).toBe('67+9m')
    expect(formatAowAgeKort({ years: 67, months: 0, fractional: 67, isDefinitive: true })).toBe('67')
  })

  it('accepteert óók de FRACTIONELE vorm — oppervlakken die alleen 67.75 dragen hoeven niet zelf terug te rekenen', () => {
    expect(formatAowAge(67.75)).toBe('67 jaar en 9 maanden')
    expect(formatAowAgeKort(67.75)).toBe('67+9m')
    expect(formatAowAge(67)).toBe('67 jaar')
  })

  it('struct en fractional geven op dezelfde leeftijd hetzelfde antwoord (geen tweede grondslag)', () => {
    const age = lookupAowAge([COHORT_67J9M], '1971-01-01')
    expect(formatAowAge(age.fractional)).toBe(formatAowAge(age))
    expect(formatAowAgeKort(age.fractional)).toBe(formatAowAgeKort(age))
  })

  it('drijvende-komma-randgeval: bijna-heel jaar telt door i.p.v. "67 jaar en 12 maanden"', () => {
    expect(formatAowAge(67.9999)).toBe('68 jaar')
    expect(formatAowAgeKort(67.9999)).toBe('68')
  })

  it('geen decimale leeftijd meer op het scherm — nooit "67,8" of "67.75"', () => {
    for (const fractional of [67.25, 67.5, 67.75, 68.5]) {
      expect(formatAowAge(fractional)).not.toMatch(/[.,]\d/)
      expect(formatAowAgeKort(fractional)).not.toMatch(/[.,]\d/)
    }
  })
})

/**
 * De weergave-oppervlakken uit de kaart. Elk moet zijn AOW-leeftijd door de
 * canonieke laag halen — geen eigen `Math.round`/`Math.floor`/`toFixed` en geen
 * `.years`-projectie die de maanden weggooit.
 */
const WEERGAVE_OPPERVLAKKEN: Record<string, string> = {
  'tijdas-grafiek (AOW-stippellijn)': 'components/app/horizon/chart-static-layers.tsx',
  'grafiek-tooltips (chart-tips)': 'lib/chart-tips.ts',
  'pensioen/AOW-widget': 'components/widgets/pensioen-aow-widget.tsx',
  'tekort-lening-copy': 'lib/horizon/deficit-loan-copy.ts',
  'plan-validatie (stop-plan)': 'lib/horizon/plan-draft.ts',
  'stop-plan-vragen (strategieën)': 'components/horizon/stop-plan-vragen.tsx',
  'AOW-strategie-editor': 'components/future/strategie/aow-strategie-editor.tsx',
  'Fin-context (cloud)': 'lib/ai/context/shared-context.ts',
  // Zusteroppervlakken met dezelfde invoer en dezelfde semantiek — die stonden NIET
  // op de kaart maar droegen wél een eigen kopie van dezelfde omzetting. Een guard
  // op één grafiek terwijl de grafiek ernaast het oude getal rendert is geen fix.
  'inkomsten/uitgaven-grafiek (AOW-lijn)': 'components/app/horizon/income-expense-chart.tsx',
  'vermogensopbouw-grafiek (AOW-lijn)': 'components/app/horizon/wealth-composition-chart.tsx',
  'netto-vermogen-projectie (/core)': 'components/core/net-worth-projection-chart.tsx',
  'overgangsfase — gap-analyse': 'components/app/horizon/phase-analysis/overgang/gap-analyse.tsx',
  'overgangsfase — monte carlo': 'components/app/horizon/phase-analysis/overgang/monte-carlo-overgang.tsx',
  'overgangsfase — modal-kop': 'components/app/horizon/phase-modal-overgang.tsx',
}

function bron(relPath: string): string {
  return readSourceLF(join(ROOT, relPath))
}

/**
 * Sommige oppervlakken ronden een AOW-leeftijd af voor GEOMETRIE (een fase-splitsings-
 * jaar, een rij-index), niet voor weergave. Dat mag — maar alleen zichtbaar gemarkeerd,
 * met de reden erbij; spiegelt de `// euro-view: exempt`-conventie uit ADR 0093 D12/D13.
 * Een stille uitzondering is precies hoe de negen vormen konden ontstaan.
 */
const GEOMETRIE_MARKER = 'aow-weergave: geometrie'

function weergaveRegels(relPath: string): string {
  const regels = bron(relPath).split('\n')
  return regels
    .filter((regel, i) => {
      // De markering geldt voor de regel zelf en de twee regels erna (comment boven code).
      const venster = regels.slice(Math.max(0, i - 3), i + 1)
      return !venster.some((r) => r.includes(GEOMETRIE_MARKER))
    })
    .join('\n')
}

describe('AOW-weergave — elk oppervlak consumeert de canonieke formatteerlaag', () => {
  it('elk weergave-oppervlak importeert formatAowAge of formatAowAgeKort uit lib/aow-leeftijd', () => {
    for (const [label, rel] of Object.entries(WEERGAVE_OPPERVLAKKEN)) {
      const src = bron(rel)
      const importeert =
        /from\s+['"]@\/lib\/aow-leeftijd['"]/.test(src) && /formatAowAge(Kort)?\s*[(,}]/.test(src)
      expect(importeert, `${label} (${rel}) schrijft de AOW-leeftijd niet via de canonieke laag`).toBe(true)
    }
  })

  it('geen enkel oppervlak rekent de AOW-leeftijd nog zelf om (Math.round/floor/ceil/toFixed op een aow-waarde)', () => {
    // Vangt de exacte vormen die de kaart meldde: Math.round(userAowAge.fractional),
    // Math.floor(aowAgeFractional), Math.round((frac % 1) * 12), lookupAowAge(...).years
    // en aowAge.toFixed(1).
    //
    // BEWUST NIET verboden: afronden van een BEREKENING waar een AOW-leeftijd in
    // meedoet (`Math.floor(aowAge - currentAge)` = resterende hele jaren) en de
    // opslag-`Math.ceil` van de ingangsleeftijd (de display-drift-lock, die het
    // BESLUIT van 6 sep 2026 expliciet laat staan). Die zijn geen WEERGAVE van de
    // AOW-leeftijd. Het patroon eist daarom dat de afronding direct op de
    // AOW-waarde zelf sluit.
    // Alleen identifiers die echt een LEEFTIJD dragen (aowAge/aowLeeftijd/
    // aowFractional en varianten) — niet elk woord met "aow" erin, want
    // `Math.round(aowCoveragePct)` rondt een dekkingspercentage af en hoort hier niet.
    const AOW_LEEFTIJD = String.raw`[\w$.?]*[Aa]ow(Age|Leeftijd|Fractional)[\w$.?]*`
    const eigenAfronding = new RegExp(String.raw`Math\.(round|floor|ceil)\s*\(\s*${AOW_LEEFTIJD}\s*\)`)
    const maandExtractie = /%\s*1\s*\)?\s*\*\s*12/
    const yearsProjectie = /lookupAowAge\([^)]*\)\.years/
    const decimaal = new RegExp(String.raw`${AOW_LEEFTIJD}\.toFixed\s*\(`)

    for (const [label, rel] of Object.entries(WEERGAVE_OPPERVLAKKEN)) {
      const src = weergaveRegels(rel)
      expect(eigenAfronding.test(src), `${label} (${rel}) rondt de AOW-leeftijd zelf af`).toBe(false)
      expect(maandExtractie.test(src), `${label} (${rel}) pelt de maanden zelf uit de fractie`).toBe(false)
      expect(yearsProjectie.test(src), `${label} (${rel}) gooit de maanden weg via .years`).toBe(false)
      expect(decimaal.test(src), `${label} (${rel}) schrijft een decimale AOW-leeftijd`).toBe(false)
    }
  })

  it('de STOPleeftijd-formatters worden niet op een AOW-leeftijd losgelaten', () => {
    // `formatPlanAge`/`formatStopAge` schrijven "67,8" — bedoeld voor een door de
    // gebruiker GEKOZEN stopleeftijd (58,5 mag daar), nooit voor de AOW-leeftijd.
    const misbruik = /format(Plan|Stop)Age\s*\(\s*[\w$.?]*aow\w*/i
    for (const [label, rel] of Object.entries(WEERGAVE_OPPERVLAKKEN)) {
      expect(misbruik.test(bron(rel)), `${label} (${rel}) schrijft de AOW-leeftijd als stopleeftijd`).toBe(false)
    }
  })

  it('formatPlanAge en formatStopAge zijn ÉÉN implementatie (het duplicaat is opgeruimd)', () => {
    const planDraft = bron('lib/horizon/plan-draft.ts')
    expect(planDraft).toMatch(/export const formatPlanAge = formatStopAge/)
    // Geen tweede eigen komma-formatter meer in plan-draft.
    expect(planDraft).not.toMatch(/toFixed\(1\)\.replace\('\.', ','\)/)
  })
})

describe('AOW-weergave — de Fin-context krijgt de leeftijd gegrond mee', () => {
  it('FinFacts draagt de canonieke AOW-leeftijd, zodat het model niet hoeft te gokken', () => {
    const facts = bron('lib/ai/context/fin-financial-facts.ts')
    expect(facts).toMatch(/aowLeeftijd:\s*number/)
    // Verbatim uit de bundel — geen eigen afleiding uit een geboortejaar.
    expect(facts).toMatch(/coreData\.aowAge/)
  })

  it('de cloud-Fin-context schrijft een AOW-leeftijd-regel met de canonieke vorm', () => {
    const ctx = bron('lib/ai/context/shared-context.ts')
    expect(ctx).toMatch(/AOW-leeftijd: \$\{formatAowAge\(facts\.aowLeeftijd\)\}/)
  })
})
