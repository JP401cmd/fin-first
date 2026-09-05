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
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import { join } from 'node:path'
import { deflate, deflatePoints, factorAtAge } from '@/lib/euro-display'
import {
  APPROX_PREFIX,
  formatCurrency,
  formatMaskedApproxCurrency,
  roundToSignificant,
  MASKED_AMOUNT_PLACEHOLDER,
} from '@/lib/format'

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

  it('zet het balk-label in de actieve euro-weergave, gelijk aan de Doelbedrag-KPI', () => {
    // Given een gebruiker met een nominaal FIRE-doel van € 200.032, When hij de
    // euro-weergave op "huidige euro's" zet, Then toont het label rechts van de
    // voortgangsbalk hetzelfde bedrag als de Doelbedrag-KPI erboven
    // ("ca. € 180.000 — volledige vrijheid") en niet meer het nominale bedrag.
    // Eigenaar-besluit 27-08-2026: twee bedragen voor hetzelfde doel op één
    // scherm leest als een fout, ook al was de eerdere nominale keuze (label =
    // noemer van de balk-fill) intern verdedigbaar.
    const src = readFileSync(SOURCE_PATH, 'utf8')
    // De VULLING blijft op `effectiveFreedomPct` — een ratio (klasse R)
    // deflateert nooit; alleen de euro-weergave van het label wisselt mee.
    expect(src).toMatch(/width: `\$\{hasPerspectiveHero \? [^`]*effectiveFreedomPct\}%`/)
    // Het label leest de view*-waarden — dezelfde variabelen als de KPI, dus
    // per constructie hetzelfde bedrag.
    expect(src).toMatch(/formatMaskedApproxCurrency\(viewBalkVrijheidDoel, masked\)\} — volledige vrijheid/)
    // ADR 0129 D5/D8 — onder een VAST anker meet de balk dekking (tijd), geen kapitaal:
    // het label noemt het einde van het plan en draagt géén bedrag meer (dus ook geen
    // nominale terugval). De vroegere "— vermogen op AOW"-variant is daarmee weg.
    expect(src).toMatch(/isFixedAnchorMode\s*\?\s*\(simResult != null\s*\?\s*`tot je \$\{Math\.round\(simResult\.displayEndAge\)\}e — einde van je plan`/)
    expect(src).not.toMatch(/— vermogen op AOW/)
    // …en de nominale variant is wég. Een terugval hierop is onzichtbaar: het
    // bedrag blijft plausibel, alleen te hoog.
    expect(src).not.toMatch(/formatMaskedCurrency\(balkVrijheidDoel, masked\)/)
    expect(src).not.toMatch(/formatMaskedCurrency\(portfolioAtAow \?\? 0, masked\)/)
    // De euro-view-uitzondering op deze plek is vervallen met het besluit; laat
    // hem niet stil terugkeren (dat zou de oude conventie heropenen).
    expect(src).not.toMatch(/euro-view: exempt — hoort bij de nominale freedomPct-noemer/)
    // De KPI-tegel "benodigd" deflateerde al en blijft ongewijzigd — dit is de
    // waarde waaraan het label is gelijkgetrokken.
    // ADR 0129 F3b: de tegel toont onder ÉLK vast anker het geprojecteerde (gedeflateerde)
    // vermogen op het stopmoment — de sleutel is het anker, niet de pensioen-label.
    expect(src).toMatch(/isFixedAnchorMode \? \(viewPortfolioAtAow \?\? 0\) : viewBalkVrijheidDoel/)
  })

  it('deflateert het balk-doelbedrag via de canonieke route — € 200.032 nominaal wordt ca. € 180.000', () => {
    // Given de kernelrijen van het eigenaarsprofiel (FIRE-moment zes jaar
    // vooruit, ~2% inflatie ⇒ deflator 1,126), When de euro-weergave op 'real'
    // staat, Then deelt de balk het nominale doel exact één keer door de factor
    // van het FIRE-jaar — via `factorAtAge`/`deflate`, nooit een eigen Math.pow —
    // en rondt de M5-weergave dat af op "ca. € 180.000".
    const rows = [
      { age: 46, inflationFactor: 1 },
      { age: 52, inflationFactor: 1.02 ** 6 },
    ]
    const fireFactor = factorAtAge(rows, 52)
    const nominaalDoel = 200032

    const nominaleWeergave = deflate(nominaalDoel, fireFactor, 'nominal')
    expect(nominaleWeergave).toBe(nominaalDoel)
    expect(roundToSignificant(nominaleWeergave)).toBe(200000)

    const reeleWeergave = deflate(nominaalDoel, fireFactor, 'real')
    expect(reeleWeergave).toBeCloseTo(nominaalDoel / 1.02 ** 6, 6)
    expect(roundToSignificant(reeleWeergave)).toBe(180000)

    // Zo komt het op het scherm: "ca." als voorbehoud (M5), en gemaskeerd
    // verdwijnt óók het voorbehoud — bullets zijn geen bedrag.
    expect(formatMaskedApproxCurrency(reeleWeergave, false)).toBe(
      `${APPROX_PREFIX}${formatCurrency(180000)}`,
    )
    expect(formatMaskedApproxCurrency(reeleWeergave, false)).toContain('180.000')
    expect(formatMaskedApproxCurrency(reeleWeergave, true)).toBe(MASKED_AMOUNT_PLACEHOLDER)
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
    // K2b — de scenario-overlays lopen sinds `simRowsToChartPoints` op dezelfde
    // as-conventie als de besteedbaar-lijn (eindstand van rij `age` op `age + 1`)
    // en dragen daarom dezelfde bronjaar-sleutel.
    expect(src).toMatch(
      /points: deflatePoints\(o\.points, factorByAge, euroView, x => x - 1\)/,
    )
    // K4b — de huishoud-overlays sleutelen op positie; de seed op de
    // startleeftijd schuift alle offsets één plek op.
    expect(src).toMatch(/\[1, \.\.\.factorByOffset\]/)
  })

  /**
   * Given  een kernelreeks die via `simRowsToChartPoints` op de chart-as staat:
   *        een seed op de startleeftijd plus de eindstand van rij `age` op
   *        `age + 1`, met `factorByAge` = f(age) = (1+π)^(age − startleeftijd).
   * When   de overlay met de bronjaar-sleutel (`x - 1`) wordt gedeflateerd.
   * Then   elk punt draagt de factor van zijn BRONrij — dezelfde die de hoofdlijn
   *        op die x tekent — én het staartpunt wordt wél gedeflateerd.
   */
  it('deflateert overlay-punten op hun bronjaar, staartpunt incluis (K2b)', () => {
    const startAge = 40
    const rows = [
      { age: 40, startPortfolio: 100_000, endPortfolio: 110_000 },
      { age: 41, startPortfolio: 110_000, endPortfolio: 121_000 },
      { age: 42, startPortfolio: 121_000, endPortfolio: 133_100 },
    ]
    const pts = simRowsToChartPoints(rows)
    // Zoals de loader hem bouwt: alleen leeftijden die de kernel levert (40..42).
    const factorByAge = new Map(rows.map((r) => [r.age, Math.pow(1.02, r.age - startAge)]))

    const out = deflatePoints(pts, factorByAge, 'real', (x) => x - 1)

    // Seed op x=40: sleutel 39 ontbreekt bewust ⇒ ongemoeid. Dat is exact goed,
    // want jaar 0 draagt factor 1.0.
    expect(out[0]).toEqual([40, 100_000])
    // x=41 draagt de eindstand van rij 40 ⇒ factor f(40) = 1.0.
    expect(out[1][0]).toBe(41)
    expect(out[1][1]).toBeCloseTo(110_000, 6)
    // x=42 draagt de eindstand van rij 41 ⇒ factor f(41) = 1.02.
    expect(out[2][1]).toBeCloseTo(121_000 / 1.02, 6)
    // STAARTPUNT x=43: bestaat niet in factorByAge (rijen lopen t/m 42), maar de
    // bronjaar-sleutel 42 wél ⇒ gedeflateerd i.p.v. nominaal blijven staan. Zonder
    // de sleutel bleef dit punt op 133.100 hangen: een zichtbare haak omhoog.
    expect(out[3][0]).toBe(43)
    expect(out[3][1]).toBeCloseTo(133_100 / Math.pow(1.02, 2), 6)
    expect(out[3][1]).not.toBeCloseTo(133_100, 0)
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
