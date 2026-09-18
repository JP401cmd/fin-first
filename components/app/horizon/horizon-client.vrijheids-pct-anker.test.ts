import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dekkingVanRun } from '@/lib/horizon/lab-uitkomst'
import { computeFreedomProgressWithBasis } from '@/lib/core-metrics'
import { isFinanciallyFree, resolveFreedomFraming } from '@/lib/fire-strategy'
import type { SimResult } from '@/lib/fire-simulation'

/**
 * "Je bent vrij" náást een tekort-lening van € 412.299 (melding 18-09-2026).
 *
 * ## Given / When / Then
 *  - **Given** een plan met een VAST stopmoment-anker en een kernel-run,
 *    **when** het vrijheids-% van /toekomst wordt bepaald,
 *    **then** is dat de DEKKING van het plan (ADR 0129 B3/D5) — nooit een lokaal
 *    herrekende kapitaalratio.
 *  - **Given** een vast anker op ankermaand 0 met een plan dat maar tot leeftijd 47
 *    van de 90 reikt, **when** de hero rendert, **then** opent de vrij-gate NIET en
 *    staat de voortgangsbalk op de dekking (~2 %), niet op 100 %.
 *  - **Given** `solved` (geen vast anker), **then** blijft het de kapitaalratio.
 *
 * ## Waarom een BRON-grendel (precedent: horizon-client.fire-doel-grondslag.test.ts,
 * horizon-client.lab-uitkomst.test.ts, lib/freedom-pct-plan-source.test.ts)
 * `horizon-client.tsx` is >9.000 regels en rendert niet in een unit-test. De fout was
 * ook geen verkeerd getal in één situatie maar een RECOMPUTE die de al correct gekozen
 * bundelwaarde overschreef: de loader koos via `computeFreedomPctForPlan` netjes de
 * dekking, waarna het scherm er onvoorwaardelijk `computeFreedomProgressWithBasis`
 * overheen zette. Onder een vast anker zijn teller en noemer daar dezelfde grootheid
 * (`requiredFireIsAnchorPortfolio`: de noemer IS de geprojecteerde stand op het anker),
 * dus de ratio komt per constructie op ~100 % uit ⇒ `isFinanciallyFree` opent ⇒
 * "Je bent vrij". De gedrag-kant staat in lib/core-metrics.plan-freedom.test.ts en
 * lib/horizon/lab-uitkomst.test.ts; deze suite grendelt dat het scherm die keuze
 * consumeert en er geen tweede definitie naast laat ontstaan.
 */

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')
const source = readFileSync(SOURCE_PATH, 'utf8')

/**
 * De ANKER van een bron-grendel is zijn zwakke plek. De eerste versie van deze suite
 * sneed het blok uit tussen twee bron-COMMENTAREN (`source.indexOf('// (\`planAnchor\`…')`):
 * wie zo'n comment herformuleert maakte de suite rood zónder gedragswijziging, en wie
 * hem verwijderde maakte 'm stil groen op de halve bron. Daarom: geen slices op
 * commentaar, maar regexen die de AFLEIDING zelf beschrijven — met `\s*` waar de
 * formatter mag herformatteren.
 */

/**
 * Alle aanroepen van de kapitaalratio, benoemd naar de afleiding die ze voedt (de
 * dichtstbijzijnde `const <naam> =` ervóór). Vervangt de eerdere telling op het
 * letterlijke `computeFreedomProgressWithBasis({`: die brak op een herformattering en
 * liet een aanroep mét een variabele in plaats van een object-literal er ongezien door.
 */
function ratioAanroepen(): string[] {
  const namen: string[] = []
  const re = /computeFreedomProgressWithBasis\s*\(/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const declaraties = [...source.slice(0, match.index).matchAll(/\bconst (\w+)\s*(?::[^=\n]+)?=/g)]
    namen.push(declaraties.length > 0 ? declaraties[declaraties.length - 1][1] : '<onbekend>')
  }
  return namen
}

describe('horizon-client — het ANKER kiest de definitie van het vrijheids-%', () => {
  it('leest de dekking onder een vast anker uit de gedeelde run-helper', () => {
    // `dekkingVanRun` is letterlijk de loader-formule (lib/horizon/lab-uitkomst.ts) op
    // dezelfde run; hero, lab-dekkingsas en bundel kunnen zo niet uiteenlopen.
    expect(source).toMatch(/const ankerDekkingPct = dekkingVanRun\(simResult, currentAge\)/)
    expect(source).toMatch(/import \{[^}]*dekkingVanRun[^}]*\} from '@\/lib\/horizon\/lab-uitkomst'/)
  })

  it('splitst op `isFixedAnchorMode`, met de dekking vóór de kapitaalratio', () => {
    // Eén regex over de hele toewijzing: de anker-tak eerst (dekking → bundel), de
    // `solved`-tak daarna met de kapitaalratio. Een omgekeerde volgorde, een weggevallen
    // tak of een terugval op 0 matcht niet.
    expect(source).toMatch(
      /const effectiveFreedomPct = isFixedAnchorMode\s*\r?\n?\s*\?\s*\(ankerDekkingPct \?\? firstPaintFreedomPct \?\? initialData\.freedomPct\)\s*\r?\n?\s*:\s*effectiveFireTarget > 0\s*\r?\n?\s*\?\s*computeFreedomProgressWithBasis\(/,
    )
  })

  it('kent precies twee plekken die de kapitaalratio rekenen, en weet welke', () => {
    // Niet "hoeveel", maar "wélke": de hero-tak en de what-if-recompute van de
    // gezondheidsscore. Een derde aanroep — of een van deze twee die verhuist naar een
    // afleiding met een andere naam — valt op.
    expect(ratioAanroepen().sort()).toEqual(['effectiveFreedomPct', 'fPct'])
  })

  it('geeft de gezondheidsscore hetzelfde anker-bewuste getal', () => {
    // De vrijheids-pijler mag niet op een ándere definitie draaien dan de hero erboven —
    // dat was dezelfde fout, één laag dieper.
    expect(source).toMatch(
      /const fPct = isFixedAnchorMode\s*\r?\n?\s*\?\s*\(dekkingVanRun\(simResult, hsCurrentAge\) \?\? firstPaintFreedomPct \?\? initialData\.freedomPct\)/,
    )
    // NIET `healthScoreInput.freedomPct`: dat is de waarde die dit effect zélf schrijft,
    // dus bij een run zonder antwoord zou een stale waarde zichzelf voeden. Dezelfde
    // terugvalketen als de hero, uit de loader-bundel.
    expect(source).not.toMatch(/dekkingVanRun\(simResult, hsCurrentAge\) \?\? healthScoreInput\.freedomPct/)
  })

  it('draait het effect opnieuw zodra er een nieuwe run landt', () => {
    // De deps-array stond op `[input, fireSwr, fireParams, avgIncome6m, avgExpenses6m,
    // fireStrategy]` terwijl de body sinds de anker-splitsing `simResult` leest. Zonder
    // `simResult` in de deps bevriest de vrijheids-pijler op de dekking van vóór de
    // laatste run, terwijl de hero ernaast al bij is — twee definities op één scherm,
    // precies wat deze suite bewaakt. (`isFixedAnchorMode` kán niet in de array: latere
    // `const`, TDZ tijdens de render; hij is een pure functie van `simResult`.)
    const start = source.indexOf('const fPct = ')
    expect(start).toBeGreaterThan(-1)
    const deps = source.slice(start).match(/\}, \[input, fireSwr, fireParams[^\]]*\]\)/)
    expect(deps, 'de deps-array van het gezondheidsscore-effect hoort vindbaar te zijn').not.toBeNull()
    expect(deps![0]).toContain('simResult')
    expect(deps![0]).toContain('firstPaintFreedomPct')
  })
})

/**
 * DE BEDRADING NAAR DE CONSUMENTEN. De asserties hierboven pinnen alleen wáár het getal
 * ontstaat. Zou `heroFreedomState.freedomPct` of de balk-`width` morgen een ándere
 * variabele lezen, dan blijft dat allemaal groen terwijl de hero weer twee definities
 * toont — de oorspronkelijke fout in een nieuwe vermomming. Dus: elk oppervlak dat het
 * vrijheids-% toont, leest `effectiveFreedomPct`.
 */
describe('horizon-client — alle consumenten lezen hetzelfde vrijheids-%', () => {
  it('de vrij-gate van de hero (`heroFreedomState`)', () => {
    expect(source).toMatch(/const heroFreedomState = \{\s*\r?\n\s*freedomPct: effectiveFreedomPct,/)
  })

  it('de vulling van de voortgangsbalk', () => {
    // Een ratio (klasse R, ADR 0093) deflateert nooit — dus geen `view*`-variant hier.
    expect(source).toMatch(
      /width: `\$\{hasPerspectiveHero \? Math\.max\(Math\.min\(perspectiveHero!\.freedomPercentage, 100\), 0\) : effectiveFreedomPct\}%`/,
    )
  })

  it('de persoonlijke hero-projectie die de overlay/kassabon voedt', () => {
    expect(source).toMatch(/freedomPercentage: effectiveFreedomPct,/)
  })
})

/**
 * Tweede melding op DEZELFDE hero (18-09-2026): de tegel "Vermogen op je stopmoment"
 * toonde een netto-LIQUIDE bedrag (€ 17.101 = liquide bezittingen − niet-woningschulden
 * + één maand inleg) onder het kale onderschrift "geprojecteerd op je stopmoment".
 * Zonder de grondslag erbij leest dat als een doelbedrag dat te laag is. De solved-tak
 * noemt zijn grondslag wél (`FIRE_DOEL_ONDERSCHRIFT[fireDoel.grondslag]`, UR2-17).
 */
describe('horizon-client — de vermogenstegel onder een vast anker noemt haar grondslag', () => {
  it('consumeert het onderschrift uit anker-copy, schrijft het niet zelf uit', () => {
    expect(source).toMatch(/import \{[^}]*ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT[^}]*\} from '@\/lib\/horizon\/anker-copy'/)
    expect(source).toMatch(/const fireTargetCaption = isFixedAnchorMode\s*\r?\n\s*\? ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT/)
    // De losse zin mag alleen nog in de constante leven (commentaar uitgezonderd).
    const losseRegels = source
      .split(/\r?\n/)
      .filter((l) => {
        const t = l.trim()
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
      })
      .filter((l) => l.includes("'geprojecteerd op je stopmoment'"))
    expect(losseRegels).toEqual([])
  })

  /**
   * DERDE bevinding op dezelfde tegel (eindreview 18-09-2026), en de stilste: het
   * BEDRAG eronder droeg twee grondslagen onder één kop.
   *
   *   const portfolioAtAow = isFixedAnchorMode && simResult
   *     ? (aowRow?.startPortfolio ?? simResult.firePortfolioAtFire)
   *     : null
   *
   * `aowRow.startPortfolio` is `row.startNetWorth` = Prognose!**I** (netto vermogen,
   * INCLUSIEF de eigen woning — zie de GRONDSLAG-WAARSCHUWING bij `startNettoLiquide`
   * in lib/unified-projection.ts); `firePortfolioAtFire` is Prognose!**J** (liquide,
   * lib/horizon-kernel/bridge.ts). Onder het aow-anker won in de praktijk altijd de
   * I-tak, dus dezelfde tegel stond bij de ene gebruiker op I en bij de andere op J —
   * een factor 10+ verschil, en geen enkel oppervlak dat het zou verraden. Eigenaars-
   * besluit: onder élk vast anker de LIQUIDE stand (J), passend bij het onderschrift
   * "zonder je huis, na schulden" en bij de voortgangsbalk ernaast (liquide uitputting).
   */
  it('het bedrag staat op Prognose!J — de rij-lookup op netto vermogen (I) is weg', () => {
    expect(source).toMatch(
      /const vermogenOpAnker = isFixedAnchorMode && simResult \? simResult\.firePortfolioAtFire : null/,
    )
    // De I-tak mag niet terugkomen; `aowRow` draagt alleen nog de ONTTREKKING (stroom).
    expect(source).not.toMatch(/aowRow\?\.startPortfolio/)
    expect(source).toMatch(/aowRow != null && aowRow\.withdrawal > 0/)
  })

  /**
   * VIERDE bevinding, in dezelfde regel verstopt: het bedrag stáát op de ankermaand,
   * maar werd gedeflateerd met de factor van de AOW-leeftijd. Onder een `age`-anker van
   * 46 bij een AOW van 68,5 rekende "huidige euro's" dat bedrag ruim twintig jaar te ver
   * terug — onzichtbaar, want het resultaat blijft een plausibel bedrag.
   */
  it('deflateert met de factor van de ANKERLEEFTIJD, niet die van de AOW', () => {
    expect(source).toMatch(
      /const ankerFactor = useMemo\(\s*\r?\n?\s*\(\) => factorAtAge\(displayUnifiedRows, simResult\?\.vastStopLeeftijd \?\? null\)/,
    )
    expect(source).toMatch(/const viewVermogenOpAnker = vermogenOpAnker == null \? null : deflate\(vermogenOpAnker, ankerFactor, euroView\)/)
    // `aowFactor` blijft bestaan voor wat er écht op de AOW-leeftijd staat, maar voedt
    // dit bedrag niet meer. Eén deflatie per bedrag (ADR 0090/0093), geen eigen Math.pow.
    expect(source).toMatch(/const viewMonthlyWithdrawalAtAow =\s*\r?\n?\s*monthlyWithdrawalAtAow == null \? null : deflate\(monthlyWithdrawalAtAow, aowFactor, euroView\)/)
    expect(source).not.toMatch(/deflate\(vermogenOpAnker, aowFactor/)
  })
})

// ── Gedragspin op de gate (characterization: deze assertie was óók vóór de fix
// groen — ze bewijst niet de fix zelf, maar legt vast wat de twee definities met de
// hero-gate DOEN, zodat een toekomstige wijziging aan `isFinanciallyFree` of aan de
// dekkingsformule zichtbaar wordt.) ──────────────────────────────────────────────
describe('vast anker op ankermaand 0 — de twee definities leiden tot een andere hero', () => {
  // De gemelde situatie: 46 jaar, stoppen op 46 (= vandaag ⇒ ankermaand 0), plan tot
  // 90, liquide vermogen op na ~12 maanden (reikt tot 47).
  const CURRENT_AGE = 46
  const run = {
    kernelDepletionMonth: 12,
    ankerMaand: 0,
    displayEndAge: 90,
  } as Pick<SimResult, 'kernelDepletionMonth' | 'ankerMaand' | 'displayEndAge'>

  const netWorth = 17_101
  // Onder een vast anker is de "noemer" de geprojecteerde stand op het anker zelf.
  const kapitaalratio = computeFreedomProgressWithBasis({
    homeExcludedFromFire: false,
    netWorthInclHome: netWorth,
    fireEligibleNetWorth: netWorth,
    requiredNetWorthInclHome: netWorth,
    requiredPortfolioExclHome: netWorth,
  })

  it('de kapitaalratio is hier per constructie 100 % — en opent de vrij-gate', () => {
    expect(kapitaalratio).toBe(100)
    expect(
      isFinanciallyFree({
        freedomPct: kapitaalratio,
        currentAge: CURRENT_AGE,
        fireAge: CURRENT_AGE,
        anchor: { kind: 'age', age: CURRENT_AGE },
        aowAge: 67,
      }),
    ).toBe(true)
  })

  it('de dekking is ~2 % — de gate blijft dicht en de framing is `anchored`', () => {
    const dekking = dekkingVanRun(run, CURRENT_AGE)
    expect(dekking).not.toBeNull()
    expect(dekking!).toBeCloseTo((12 / ((90 - 46) * 12)) * 100, 6)
    expect(dekking!).toBeLessThan(3)
    const state = {
      freedomPct: dekking,
      currentAge: CURRENT_AGE,
      fireAge: CURRENT_AGE,
      anchor: { kind: 'age' as const, age: CURRENT_AGE },
      aowAge: 67,
    }
    expect(isFinanciallyFree(state)).toBe(false)
    expect(resolveFreedomFraming(state)).toBe('anchored')
  })

  it('onder `solved` verandert er niets: de kapitaalratio blijft de maat', () => {
    const pct = computeFreedomProgressWithBasis({
      homeExcludedFromFire: false,
      netWorthInclHome: 250_000,
      fireEligibleNetWorth: 250_000,
      requiredNetWorthInclHome: 1_000_000,
      requiredPortfolioExclHome: 1_000_000,
    })
    expect(pct).toBe(25)
    expect(
      resolveFreedomFraming({
        freedomPct: pct,
        currentAge: 40,
        fireAge: 58,
        anchor: { kind: 'solved' },
        aowAge: 67,
      }),
    ).toBe('building')
  })
})
