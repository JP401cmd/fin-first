/**
 * Bron-grendel op de euro-weergave-render-grens van /toekomst (T4).
 *
 * Verhuisd uit `components/app/horizon/horizon-client.euro-view.test.ts` (ADR 0179
 * fase 1 stap 12): de grens woont sindsdien als één blok in
 * `use-euro-view-feeds.ts`, en "één invariant, één bestand" zegt dat de grendel
 * meeverhuist. Wat hij bewaakt is ongewijzigd; alleen het bereik is breder: hij
 * scant de host (`horizon-client.tsx`) én elk bronbestand in `components/toekomst/state/`,
 * zodat een tweede grens in een nieuw state-bestand even rood wordt als een in de host.
 *
 * WAAROM EEN BRON-TEST EN GEEN (ALLEEN) RENDER-TEST: een render-test kan bewijzen dát
 * een bepaald bedrag klopt, maar niet dat er nérgens anders nog een tweede omzetting
 * bijkomt. Precies die tweede omzetting is de fout die we moeten uitsluiten: een dubbel
 * gedeeld bedrag ziet er op het scherm plausibel uit. Dus lezen we de bron en eisen we
 * dat álle omzetting binnen één blok ligt. (De render-kant staat in
 * `use-euro-view-feeds.test.tsx`: dezelfde hook in 'nominal' en 'real'.)
 *
 * DRIE REGELS, en regel 3 is de belangrijkste:
 *  1. er is precies één start- en één eindbaken, in die volgorde, in één bestand;
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
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import { deflate, deflatePoints, factorAtAge } from '@/lib/euro-display'
import {
  APPROX_PREFIX,
  formatCurrency,
  formatMaskedApproxCurrency,
  roundToSignificant,
  MASKED_AMOUNT_PLACEHOLDER,
} from '@/lib/format'
import { readSourceLF } from '@/lib/test-utils/read-source'

const ROOT = process.cwd()
/** De host die de feeds consumeert (tot de route-groep van stap 15). */
const HOST_PATH = join(ROOT, 'components', 'app', 'horizon', 'horizon-client.tsx')
const STATE_DIR = join(ROOT, 'components', 'toekomst', 'state')
/** Het bestand waar de grens woont. */
const GRENS_PATH = join(STATE_DIR, 'use-euro-view-feeds.ts')
/** De veldclassificatie van de grens woont sinds fase 1 stap 4 (ADR 0179) hier. */
const FEEDS_PATH = join(STATE_DIR, 'euro-view-feeds.ts')

/** De host plus elk bronbestand (geen test) in `components/toekomst/state/`. */
function scanPaden(): string[] {
  const state = readdirSync(STATE_DIR)
    .filter((naam) => /\.(ts|tsx)$/.test(naam) && !/\.test\.(ts|tsx)$/.test(naam))
    .map((naam) => join(STATE_DIR, naam))
  return [HOST_PATH, ...state]
}

const START_BAKEN = 'EURO-WEERGAVE: DE RENDER-GRENS'
const EIND_BAKEN = 'EINDE EURO-WEERGAVE'

/** De vier feed-omzetters uit `lib/euro-display.ts`, als aanroep herkend. */
const DEFLATE_CALL = /\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset)\s*\(/

/** Markering die een bewuste uitzondering buiten het blok legitimeert (D12/D13). */
const EXEMPT_MARK = '// euro-view: exempt'

interface Bron {
  pad: string
  lines: string[]
}

function leesBronnen(): Bron[] {
  return scanPaden().map((pad) => ({ pad, lines: readSourceLF(pad).split('\n') }))
}

/** Het bestand met de bakens en hun regelindexen (0-based); `null` buiten dat bestand. */
function findBakens(bronnen: Bron[]): { pad: string; start: number; eind: number } {
  const starts: { pad: string; index: number }[] = []
  const einden: { pad: string; index: number }[] = []
  for (const { pad, lines } of bronnen) {
    lines.forEach((line, index) => {
      if (line.includes(START_BAKEN)) starts.push({ pad, index })
      if (line.includes(EIND_BAKEN)) einden.push({ pad, index })
    })
  }
  expect(starts, 'exact één startbaken verwacht').toHaveLength(1)
  expect(einden, 'exact één eindbaken verwacht').toHaveLength(1)
  expect(einden[0].pad, 'start- en eindbaken horen in hetzelfde bestand').toBe(starts[0].pad)
  expect(starts[0].index, 'het startbaken moet vóór het eindbaken staan').toBeLessThan(einden[0].index)
  return { pad: starts[0].pad, start: starts[0].index, eind: einden[0].index }
}

/** Ligt regel `index` van `pad` binnen het blok? */
function binnenBlok(bakens: { pad: string; start: number; eind: number }, pad: string, index: number): boolean {
  return pad === bakens.pad && index > bakens.start && index < bakens.eind
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

const label = (pad: string, index: number, line: string) =>
  `${relative(ROOT, pad)}:${index + 1}: ${line.trim()}`

describe('/toekomst — euro-weergave-render-grens (T4)', () => {
  it('heeft precies één gemarkeerd render-grensblok, in use-euro-view-feeds.ts', () => {
    const bakens = findBakens(leesBronnen())
    expect(bakens.pad).toBe(GRENS_PATH)
    // Het blok moet ook daadwerkelijk iets omvatten; een leeg blok zou de
    // grendel formeel groen houden zonder iets te bewaken.
    expect(bakens.eind - bakens.start).toBeGreaterThan(1)
  })

  it('zet elke deflatie-aanroep binnen de bakens', () => {
    const bronnen = leesBronnen()
    const bakens = findBakens(bronnen)

    const buiten: string[] = []
    for (const { pad, lines } of bronnen) {
      lines.forEach((line, index) => {
        if (binnenBlok(bakens, pad, index)) return
        // De import-regels noemen de functienamen zonder ze aan te roepen.
        if (/^\s*(import|export)\b/.test(line)) return
        if (!DEFLATE_CALL.test(line)) return
        if (isExempt(lines, index)) return
        buiten.push(label(pad, index, line))
      })
    }

    expect(
      buiten,
      'deflatie hoort uitsluitend in het render-grensblok — zet deze aanroep(en) daarbinnen',
    ).toEqual([])
  })

  it('zet elke inflationFactor-verwijzing binnen de bakens of markeert hem exempt', () => {
    const bronnen = leesBronnen()
    const bakens = findBakens(bronnen)

    const ongemarkeerd: string[] = []
    for (const { pad, lines } of bronnen) {
      lines.forEach((line, index) => {
        if (binnenBlok(bakens, pad, index)) return
        if (!line.includes('inflationFactor')) return
        if (isExempt(lines, index)) return
        ongemarkeerd.push(label(pad, index, line))
      })
    }

    expect(
      ongemarkeerd,
      'een handgerolde deling door inflationFactor buiten het blok is precies wat deze grendel moet vangen — ' +
        'zet hem in het blok of markeer hem met "// euro-view: exempt" plus reden',
    ).toEqual([])
  })

  it('toont de hero-puntbedragen als view*-waarden (FR-B5)', () => {
    const host = readSourceLF(HOST_PATH)
    const src = readSourceLF(GRENS_PATH)
    // Het FIRE-doel, "vermogen op AOW" en de maandonttrekking horen bij een
    // SPECIFIEKE leeftijd. Een terugval op de nominale variabele is hier
    // onzichtbaar: het bedrag blijft plausibel, alleen te hoog.
    expect(host).not.toMatch(/MaskedAmount value=\{fireTargetInclHome!\}/)
    expect(host).not.toMatch(/MaskedAmount value=\{fireTargetExclHome!\}/)
    expect(host).not.toMatch(/isPensioenMode \? \(vermogenOpAnker \?\? 0\) : balkVrijheidDoel/)
    expect(src).toMatch(/const viewFireTargetInclHome = /)
    expect(src).toMatch(/const viewVermogenOpAnker = /)
    expect(src).toMatch(/const viewMonthlyWithdrawalAtAow =/)
    // De factor komt van de bijbehorende leeftijd, niet van "nu".
    expect(src).toMatch(/factorAtAge\(displayUnifiedRows, userAowAge\.fractional\)/)
    // …en niet van de leeftijd van de BUURWAARDE. `vermogenOpAnker` staat op de
    // ankermaand, dus op `SimResult.vastStopLeeftijd`; met `aowFactor` werd een
    // `age`-anker van 46 bij een AOW van 68,5 ruim twintig jaar te ver
    // teruggerekend — onzichtbaar, want het bedrag bleef plausibel (alleen te laag).
    expect(src).toMatch(/const ankerFactor = useMemo\(\s*\n?\s*\(\) => factorAtAge\(displayUnifiedRows, simResult\?\.vastStopLeeftijd \?\? null\)/)
    expect(src).toMatch(/deflate\(vermogenOpAnker, ankerFactor, euroView\)/)
    expect(src).not.toMatch(/deflate\(vermogenOpAnker, aowFactor/)
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
    const src = readSourceLF(GRENS_PATH)
    // `factorAtAge` kiest de dichtstbijzijnde rij en laat een leeftijd exact op
    // .5 naar BENEDEN vallen, terwijl /overzicht zijn lookup voedt met de
    // afgeronde weergave-leeftijd uit `fireAgeForDisplay` (naar BOVEN). Zonder
    // normalisatie hangt de deflator dus af van de bron, niet van het bedrag.
    expect(src).toMatch(/const fireFactorAge = useMemo\(/)
    expect(src).toMatch(/fireAgeForDisplay\(simResult\?\.fireAgeFractional \?\? simResult\?\.fireAge \?\? null\)/)
    // Geen enkele FIRE-factor-lookup mag nog rechtstreeks op de fractionele
    // leeftijd sleutelen — dat was precies de divergentie.
    for (const pad of scanPaden()) {
      expect(readSourceLF(pad), relative(ROOT, pad)).not.toMatch(
        /factorAtAge\(displayUnifiedRows, simResult\??\.fireAgeFractional/,
      )
    }
  })

  it('houdt de twee onzichtbare sleutelkeuzes expliciet op de callsite (K2/K4)', () => {
    const src = readSourceLF(GRENS_PATH)
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

  it('deflateert de vermogensopbouw-staven (WealthCompositionChart) als view*-feed', () => {
    // Given een gebruiker die de hoofdgrafiek op de staafmodus (vermogensopbouw)
    // zet, When hij de euro-weergave op 'huidige euro's' zet, Then horen de
    // gestapelde jaarstanden (spaargeld/beleggingen/pensioen/vastgoed/overig/
    // schulden — klasse S, eigen leeftijd-as) met de jaarfactor gedeeld te zijn.
    // Deze feed werd in wave 2 gemist: hij bevat geen deflate-aanroep en geen
    // inflationFactor-verwijzing, dus regels 2 en 3 konden hem niet vangen —
    // een AFWEZIGE deflatie is voor die grendels onzichtbaar. Vandaar deze pin.
    // De callsite `stackedRows={viewWealthCompositionRows}` staat sinds fase 1 stap 7
    // in canvas-grafiek.tsx (canvas-grafiek.euro-view.test.ts); de feed zelf in de grens.
    // De veldenlijst is expliciet (nooit "alles wat een getal is") en `age`
    // mag er niet in staan (klasse R).
    expect(readSourceLF(GRENS_PATH)).toMatch(
      /deflateRowsByAge\(wealthCompositionRows, factorByAge, STACKED_ROW_MONEY_FIELDS, euroView\)/,
    )
    const fieldsMatch = readSourceLF(FEEDS_PATH).match(/const STACKED_ROW_MONEY_FIELDS = \[([^\]]+)\]/)
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
    const src = readSourceLF(FEEDS_PATH)
    expect(src).toMatch(/const SIM_ROW_NON_MONEY_FIELDS = \[/)
    expect(src).toMatch(/type OngeclassificeerdSimRowVeld = Exclude</)
    expect(src).toMatch(/AlleSimRowVeldenGeclassificeerd<OngeclassificeerdSimRowVeld>/)
  })

  it('passeert de rekenrijen nominaal naar de fase-modals (kruis-regime, N3)', () => {
    // De modals lezen `useEuroView()` zelf en deflateren per klasse; zouden ze
    // hier al-gedeflateerde rijen krijgen, dan deflateert de kassabon dubbel.
    // De modal-callsites zelf staan in `components/toekomst/overlays/` (die test pint
    // de ontvangende kant); hier de gevende kant: de host en de state-laag.
    for (const pad of scanPaden()) {
      const src = readSourceLF(pad)
      expect(src, relative(ROOT, pad)).not.toMatch(/rows=\{viewUnifiedRows/)
      expect(src, relative(ROOT, pad)).not.toMatch(/allRows=\{view/)
      // …en er gaat geen `view`-prop naar een fase-modal.
      expect(src, relative(ROOT, pad)).not.toMatch(/^\s*view=\{euroView\}/m)
    }
    expect(readSourceLF(HOST_PATH)).toMatch(/unifiedRows=\{unifiedRows\}/)
  })
})
