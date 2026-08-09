import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { FinancialInput } from '@/lib/core-metrics'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  computeMarktcheck,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { MARKTCHECK_MAX_RUNS, marktcheckSigma } from '@/lib/horizon-kernel/marktcheck'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import { buildTotaalplanKernelInput } from '@/lib/totaalplan-data'
import {
  computeWhatifMarktcheck,
  computeWhatifProjection,
  type WhatifRawContext,
} from '@/lib/horizon-kernel/whatif-router'
import { runMonteCarlo as runLegacyMonteCarlo } from '@/lib/horizon-data'
import {
  buildFactorByAge,
  buildFactorByOffset,
  deflateSeriesByOffset,
} from '@/lib/euro-display'
import {
  runMarktcheckAsync,
  runWhatifMarktcheckAsync,
} from '@/lib/horizon-kernel/worker/run-in-worker'

/**
 * De Monte-Carlo-overlay op /toekomst (de "Marktcheck"-pil).
 *
 * ## Wat hier stukging
 * De overlay draaide op `lib/horizon/fire-sim-legacy.ts#runMonteCarlo`: een jaarlus
 * `nw = nw·(1+r) + spaarquote·12` over ALLE jaren. Die kent geen stopmoment en geen
 * onttrekkingsfase, dus de band zette de opbouw exponentieel door terwijl de
 * hoofdlijn (horizon-kernel) piekt bij FIRE en daarna afbouwt naar 0. Het
 * percentage was bovendien "kans dat een pad óóit de FIRE-target haalt" terwijl de
 * UI "kans dat je geld het volhoudt" beloofde.
 *
 * ## Wat het contract nu is
 * `computeMarktcheck` draait n VOLLEDIGE kernel-projecties op dezelfde rawContext
 * als de hoofdlijn. De band moet daarom de hele plan-curve volgen — opbouw,
 * overgang én onttrekking — op dezelfde leeftijdsas en dezelfde grondslag
 * (netto vermogen, Prognose!I = `SimRow.endPortfolio`).
 *
 * ## Toleranties (bewuste keuze)
 * De band-vs-hoofdlijn-vergelijkingen gebruiken een RELATIEVE tolerantie (fractie
 * van de hoofdlijn-piek). Absolute cent-toleranties zeggen niets op grootheden van
 * €10^5–10^6, en de foutklasse die we vangen is een ORDE-verschil (€49M op een
 * piek van €1,1M in de melding). Structurele invarianten (percentiel-ordening,
 * as-uitlijning, lengtes) worden wél EXACT getoetst.
 *
 * Persona: spiegel van `lib/totaalplan-data.test.ts`, met eindstrategie `deplete`
 * zodat de hoofdlijn ná FIRE aantoonbaar afbouwt — precies het beeld uit de melding.
 */

const DOB = '1986-01-01'

function makeAssets(): Asset[] {
  return [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 150_000,
      woz_value: null,
      // PERCENTAGE (7 = 7%) — anders dan het profiel-veld hieronder.
      expected_return: 7,
      monthly_contribution: 800,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

function makeKernelContext(
  over: { strategy?: string; monthlyExpenses?: number; yearlyExpenses?: number } = {},
): ConvergentieRawContext {
  return {
    profile: {
      date_of_birth: DOB,
      net_monthly_income: 4000,
      estimated_monthly_expenses: over.monthlyExpenses ?? 2500,
      // LET OP — twee schalen: `profile.expected_return`/`inflation_rate` zijn
      // DECIMALEN (`resolveFireParams` vergelijkt met DEFAULT_RETURN = 0,07),
      // terwijl `asset.expected_return` hierboven een PERCENTAGE is.
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: over.strategy ?? 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      withdrawal_strategy: 'static',
      housing_strategy_config: { mode: 'include_full' },
      retirement_expense_method: 'current_expenses',
      retirement_expense_custom_amount: null,
    },
    assets: makeAssets(),
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: over.yearlyExpenses ?? 30_000,
  }
}

/** De hoofdlijn zoals de grafiek hem tekent: leeftijd → netto vermogen. */
function mainLine(ctx: ConvergentieRawContext) {
  const outcome = computeConvergentieProjection({ rawContext: ctx })
  if (!outcome.ok) throw new Error(`kernel-run faalde: ${outcome.reason}`)
  const sim = toSimResult(outcome.result)
  const byAge = new Map<number, number>([[sim.rows[0].age, sim.rows[0].startPortfolio]])
  for (const r of sim.rows) byAge.set(r.age + 1, r.endPortfolio)
  return { sim, byAge, startAge: sim.rows[0].age, peak: Math.max(...byAge.values()) }
}

describe('Marktcheck /toekomst — de band volgt de plan-curve', () => {
  const ctx = makeKernelContext()
  const { sim, byAge, startAge, peak } = mainLine(ctx)
  const check = computeMarktcheck({ rawContext: ctx })
  if (!check.ok) throw new Error(`marktcheck faalde: ${check.reason}`)
  const band = check.band
  const fireAge = sim.fireAge!
  const eindAge = sim.displayEndAge
  const p50At = (age: number) => band.p50[age - band.startAge]

  it('Given een plan dat ná FIRE afbouwt, When de band wordt berekend, Then daalt p50 in de onttrekkingsfase i.p.v. te stijgen', () => {
    expect(fireAge).toBeLessThan(eindAge)
    expect(p50At(eindAge)).toBeLessThan(p50At(fireAge))
  })

  it('Given de band de onzekerheid rond ditzelfde plan toont, When elke leeftijd wordt getoetst, Then ligt de hoofdlijn binnen p10–p90', () => {
    // DE kern-invariant, en precies wat de legacy-motor schond: het deterministische
    // plan moet ín zijn eigen onzekerheidsband liggen. Ligt de hele band boven de
    // hoofdlijn, dan tekent de grafiek een ander plan dan de lijn eronder.
    for (const [age, waarde] of byAge) {
      const i = age - band.startAge
      if (i < 0 || i >= band.p50.length) continue
      expect(band.p10[i], `p10 op leeftijd ${age}`).toBeLessThanOrEqual(waarde)
      expect(band.p90[i], `p90 op leeftijd ${age}`).toBeGreaterThanOrEqual(waarde)
    }
  })

  it('Given de spreiding rond FIRE nog beperkt is, When de hoofdlijn daar wordt getoetst, Then ligt hij binnen de p25–p75-kern van de band', () => {
    const i = fireAge - band.startAge
    expect(band.p25[i]).toBeLessThanOrEqual(byAge.get(fireAge)!)
    expect(band.p75[i]).toBeGreaterThanOrEqual(byAge.get(fireAge)!)
  })

  it('Given de band de afbouw meeneemt, When de p50-eindstand wordt getoetst, Then blijft hij ónder de hoofdlijn-piek i.p.v. er een orde bovenuit te groeien', () => {
    // De legacy-band eindigde op een VEELVOUD van de piek (melding: ~€49M op een
    // piek van ~€1,1M). Deze grens is bewust grof: hij vangt de foutklasse
    // "opbouw wordt doorgezet" zonder de legitieme statistische spreiding te
    // knijpen. NB: p50 ligt structureel iets bóven de hoofdlijn omdat de mediaan
    // van de 200 deterministische sin-hash-trekkingen +0,54pp is (geen nul) —
    // een eigenschap van het Excel-MC-model, geen bandfout.
    expect(p50At(eindAge)).toBeLessThan(peak)
  })

  it('Given band en hoofdlijn dezelfde as delen, When startAge en lengte worden vergeleken, Then dekt de band de hele hoofdlijn vanaf dezelfde leeftijd', () => {
    expect(band.startAge).toBe(startAge)
    expect(band.p50.length).toBe(sim.rows.length + 1)
    expect(band.startAge + band.p50.length - 1).toBeGreaterThanOrEqual(eindAge)
  })

  it('Given index 0 de stand van vandaag is, When de percentielen daar worden gelezen, Then zijn ze alle gelijk aan het huidige netto vermogen (band start als punt)', () => {
    const nu = byAge.get(startAge)!
    for (const reeks of [band.p10, band.p25, band.p50, band.p75, band.p90]) {
      expect(reeks[0]).toBeCloseTo(nu, 6)
    }
  })

  it('Given percentielen geordend horen te zijn, When elke leeftijd wordt getoetst, Then geldt p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90', () => {
    for (let i = 0; i < band.p50.length; i++) {
      expect(band.p10[i]).toBeLessThanOrEqual(band.p25[i])
      expect(band.p25[i]).toBeLessThanOrEqual(band.p50[i])
      expect(band.p50[i]).toBeLessThanOrEqual(band.p75[i])
      expect(band.p75[i]).toBeLessThanOrEqual(band.p90[i])
    }
  })

  it('Given de band onzekerheid moet tonen, When p10 en p90 op de eindleeftijd worden vergeleken, Then is de band daar niet triviaal smal', () => {
    const i = eindAge - band.startAge
    expect(band.p90[i] - band.p10[i]).toBeGreaterThan(0)
  })

  it('Given elke run een volledige kernel-projectie is, When de runs worden geteld, Then blijven ze binnen MARKTCHECK_MAX_RUNS', () => {
    expect(check.runs).toBeGreaterThan(0)
    expect(check.runs).toBeLessThanOrEqual(MARKTCHECK_MAX_RUNS)
    const klein = computeMarktcheck({ rawContext: ctx, maxRuns: 5 })
    expect(klein.ok).toBe(true)
    expect(klein.ok && klein.runs).toBe(5)
  })
})

describe('Marktcheck — de marge zegt iets over dit plan (en het percentage deed dat niet)', () => {
  /**
   * ## Waarom het percentage weg is
   * `sustainProbability` werd geëvalueerd op de door de solver GEVONDEN
   * FIRE-leeftijd — precies de leeftijd waarop het plan bij het verwachte
   * rendement op nul uitkomt. GEMETEN over dezelfde persona met alleen andere
   * uitgaven (2026-08-09): 1500 → 0,77 · 2200 → 0,51 · 3204 → 0,52 · 4200 → 0,51 ·
   * 6000 → 0,51. Structureel ~51%, ongeacht het plan: de vraag verwerd tot "haalt
   * de markt exact je eigen aanname?".
   *
   * De marge draait de rollen om: de stopleeftijd staat vast, het rendement is de
   * onbekende. Deze suite toetst de UITKOMST — dat het getal beweegt met het plan
   * en met de stopkeuze — niet de formule.
   */
  const uitgavenReeks = [1500, 2200, 3204, 4200, 6000]

  /**
   * `maxRuns: 1` is bewust: de marge is een APARTE binaire zoektocht en hangt
   * niet aan het aantal marktverlopen (de test hieronder bewijst dat). Zonder
   * deze begrenzing zou elke assertie hier 200 volledige projecties kosten en
   * liep de suite in de minuten.
   */
  function margeVan(mnd: number, stopAge?: number | null) {
    const c = computeMarktcheck({
      rawContext: makeKernelContext({ monthlyExpenses: mnd, yearlyExpenses: mnd * 12 }),
      stopAge,
      maxRuns: 1,
    })
    if (!c.ok) throw new Error(`marktcheck faalde bij ${mnd}: ${c.reason}`)
    return c.marge
  }

  it('Given de marge losstaat van de band, When hij bij 1 en bij 20 marktverlopen wordt gelezen, Then is hij identiek', () => {
    const een = computeMarktcheck({ rawContext: makeKernelContext(), maxRuns: 1, stopAge: 60 })
    const twintig = computeMarktcheck({ rawContext: makeKernelContext(), maxRuns: 20, stopAge: 60 })
    expect(een.ok && twintig.ok).toBe(true)
    if (!een.ok || !twintig.ok) return
    expect(een.marge).toEqual(twintig.marge)
    expect(een.runs).toBe(1)
    expect(twintig.runs).toBe(20)
  })

  it('Given vijf sterk verschillende plannen, When de marge op het AOW-anker wordt vergeleken, Then loopt hij ver uiteen — waar de kans structureel ~51% bleef', () => {
    // GEMETEN (2026-08-09, `computeRendementMarge` op het AOW-anker, persona uit
    // deze suite): +6,4 · +3,9 · +3,6 · −2,9 · −13,0 procentpunt.
    const marges = uitgavenReeks.map((mnd) => {
      const m = margeVan(mnd)
      expect(m, `marge ontbreekt bij ${mnd}/mnd`).not.toBeNull()
      return m!.marge
    })
    // Monotoon: duurder plan ⇒ minder speling. Dit is de eigenschap die de kans
    // NIET had (die was 0,51 voor 2200, 3204 én 4200).
    for (let i = 1; i < marges.length; i++) {
      expect(marges[i], `${uitgavenReeks[i]} vs ${uitgavenReeks[i - 1]}`).toBeLessThan(marges[i - 1])
    }
    // En de spreiding is een orde groter dan de weergaveprecisie (0,1pp).
    expect(Math.max(...marges) - Math.min(...marges)).toBeGreaterThan(0.05)
    // Zuinig plan heeft speling, duur plan een tekort — het teken alleen al scheidt ze.
    expect(marges[0]).toBeGreaterThan(0)
    expect(marges[marges.length - 1]).toBeLessThan(0)
  })

  it('Given dezelfde plannen, When de marge op de OPGELOSTE FIRE-leeftijd wordt gemeten, Then is hij per constructie ≈ 0 — precies de val die het anker vermijdt', () => {
    // Dit is de tegenhanger van de test hierboven en de reden dat het anker NIET
    // de solver-uitkomst is. Zonder deze meting oogt "marge" als een verbetering
    // terwijl hij dezelfde muntworp zou zijn.
    for (const mnd of [2200, 3204, 4200]) {
      const outcome = computeConvergentieProjection({
        rawContext: makeKernelContext({ monthlyExpenses: mnd, yearlyExpenses: mnd * 12 }),
      })
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      const opgelost = toSimResult(outcome.result).fireAge!
      const m = margeVan(mnd, opgelost)
      expect(m, `marge ontbreekt bij ${mnd}/mnd`).not.toBeNull()
      // < 0,2 procentpunt: onder de weergaveprecisie ×2 — er valt niets te sturen.
      expect(Math.abs(m!.marge), `${mnd}/mnd op de opgeloste leeftijd`).toBeLessThan(0.002)
    }
  })

  it('Given één plan, When de gekozen stopleeftijd opschuift, Then groeit de marge mee — het getal is stuurbaar', () => {
    // GEMETEN op €2.200/mnd: stop 55 → +0,7pp · stop 60 → +2,1pp · AOW 67 → +3,9pp.
    const bij55 = margeVan(2200, 55)
    const bij60 = margeVan(2200, 60)
    const bij65 = margeVan(2200, 65)
    expect(bij55).not.toBeNull()
    expect(bij60).not.toBeNull()
    expect(bij65).not.toBeNull()
    expect(bij60!.marge).toBeGreaterThan(bij55!.marge)
    expect(bij65!.marge).toBeGreaterThan(bij60!.marge)
    // En een jaar langer doorwerken is zichtbaar op het scherm (≥ de precisie).
    expect(bij60!.marge - bij55!.marge).toBeGreaterThan(0.001)
  })

  it('Given een gekozen stopleeftijd, When de marge wordt gelezen, Then is het anker de stopkeuze; zonder keuze de AOW-leeftijd', () => {
    const metKeuze = margeVan(2500, 58)
    expect(metKeuze?.anker).toBe('stopkeuze')
    expect(metKeuze?.ankerLeeftijd).toBe(58)

    const zonderKeuze = margeVan(2500)
    expect(zonderKeuze?.anker).toBe('aow')
    // De AOW-leeftijd komt uit het profiel, niet uit de solver.
    expect(zonderKeuze!.ankerLeeftijd).toBeGreaterThan(60)
    expect(zonderKeuze!.ankerLeeftijd).toBeLessThan(75)
  })

  it('Given een anker op of voorbij de eindleeftijd, When de marge wordt gelezen, Then is hij `null` — geen onttrekkingsfase om te toetsen', () => {
    // Zelfde degeneratie-regel als de vervangen kans, nu op het ANKER gemeten:
    // stop je pas op je eindleeftijd, dan wordt er nooit onttrokken vóór het
    // meetpunt en is `gap ≥ 0` triviaal waar.
    const opEind = margeVan(2500, 90)
    expect(opEind).toBeNull()
    const voorbijEind = margeVan(2500, 95)
    expect(voorbijEind).toBeNull()
  })

  it('Given het ONhaalbaarste plan (FIRE voorbij de eindleeftijd), When de marge wordt gelezen, Then meldt hij een tekort i.p.v. het oude 100%-artefact', () => {
    // €6.000/mnd op €4.000 inkomen → solver landt op FIRE 91 bij eindleeftijd 90.
    // De oude kans meldde daar 1,00 (hoogste van de hele reeks) tot de guard 'm
    // op null zette. De marge ankert op de AOW-leeftijd (67 < 90), dus er IS een
    // onttrekkingsfase en het antwoord is een eerlijk, groot tekort.
    const ctx = makeKernelContext({ monthlyExpenses: 6000, yearlyExpenses: 72_000 })
    const outcome = computeConvergentieProjection({ rawContext: ctx })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const sim = toSimResult(outcome.result)
    expect(sim.fireAge!).toBeGreaterThanOrEqual(sim.displayEndAge)

    const check = computeMarktcheck({ rawContext: ctx, maxRuns: 1 })
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.marge).not.toBeNull()
    expect(check.marge!.marge).toBeLessThan(-0.05)
    // De band blijft wél gewoon getekend — die zegt niets misleidends.
    expect(check.band.p50.length).toBeGreaterThan(0)
  })

  it('Given de pensioen-eindstrategie, When de marge wordt gelezen, Then is hij de inhoudelijke gap-toets en niet het altijd-1 oracle-criterium', () => {
    // MC!B8 is bij `pensioen` `B16 ≥ AOW` → door de pensioen-kortsluiting altijd 1.
    // De marge kent dat criterium niet: hij toetst de gap op het anker, dus een
    // te duur pensioenplan levert een tekort. GEMETEN: −7,8pp.
    const check = computeMarktcheck({
      rawContext: makeKernelContext({ strategy: 'pensioen', monthlyExpenses: 5200, yearlyExpenses: 62_400 }),
      maxRuns: 1,
    })
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.marge).not.toBeNull()
    expect(check.marge!.marge).toBeLessThan(0)
  })

  it('Given de band en de marge, When de stopkeuze wijzigt, Then verandert alleen de marge — de band volgt het gesolvede plan', () => {
    // De band is 200 runs; de marge 14. Zou de band aan de stopkeuze hangen, dan
    // zou elke slider-tick de zwaarste run opnieuw uitlokken.
    const zonder = computeMarktcheck({ rawContext: makeKernelContext(), maxRuns: 5 })
    const met = computeMarktcheck({ rawContext: makeKernelContext(), maxRuns: 5, stopAge: 62 })
    expect(zonder.ok && met.ok).toBe(true)
    if (!zonder.ok || !met.ok) return
    expect(met.band.p50).toEqual(zonder.band.p50)
    expect(met.marge!.ankerLeeftijd).toBe(62)
    expect(zonder.marge!.anker).toBe('aow')
  })
})

describe('Marktcheck — /toekomst/whatif draait op dezelfde motor én dezelfde context', () => {
  // Het zusteroppervlak had exact hetzelfde defect (`runMonteCarlo` uit
  // fire-sim-legacy op een kernel-hoofdlijn). Hier is de extra eis dat de band
  // de RENDEMENT-SLIDER meeneemt: een band op de baseline zou onder een
  // verschoven scenariolijn liggen.
  const returnDeltaByAssetType = { investment: 0.02 }

  function whatifCtx(): WhatifRawContext {
    const base = makeKernelContext()
    return {
      profile: base.profile,
      assets: [...base.assets],
      debts: [...base.debts],
      lifeEvents: [...base.lifeEvents],
      aowRows: [...(base.aowRows ?? [])],
      returnDeltaByAssetType,
      yearlyExpenses: base.yearlyExpenses,
    }
  }

  it('Given de rendement-slider op +2pp staat, When band en hoofdlijn worden vergeleken, Then ligt de hoofdlijn op elke leeftijd binnen p10–p90', () => {
    const ctx = whatifCtx()
    const outcome = computeWhatifProjection({ rawContext: ctx })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const sim = toSimResult(outcome.result)
    const byAge = new Map<number, number>([[sim.rows[0].age, sim.rows[0].startPortfolio]])
    for (const r of sim.rows) byAge.set(r.age + 1, r.endPortfolio)

    // `maxRuns: 20` — de containment-invariant is schaal-vrij (nearest-rank
    // houdt de 10%/90%-positie), en dit blok moet binnen de 30s-testtimeout
    // blijven wanneer de hele suite parallel draait.
    const check = computeWhatifMarktcheck({ rawContext: ctx, maxRuns: 20 })
    expect(check.ok).toBe(true)
    if (!check.ok) return

    expect(check.band.startAge).toBe(sim.rows[0].age)
    for (const [age, waarde] of byAge) {
      const i = age - check.band.startAge
      if (i < 0 || i >= check.band.p50.length) continue
      expect(check.band.p10[i], `p10 op leeftijd ${age}`).toBeLessThanOrEqual(waarde)
      expect(check.band.p90[i], `p90 op leeftijd ${age}`).toBeGreaterThanOrEqual(waarde)
    }
  })

  it('Given de slider het plan verschuift, When de band met en zonder delta wordt vergeleken, Then verschuift de band mee (band ≠ baseline-band)', () => {
    const metDelta = computeWhatifMarktcheck({ rawContext: whatifCtx(), maxRuns: 20 })
    const zonderDelta = computeWhatifMarktcheck({
      rawContext: { ...whatifCtx(), returnDeltaByAssetType: undefined },
      maxRuns: 20,
    })
    expect(metDelta.ok && zonderDelta.ok).toBe(true)
    if (!metDelta.ok || !zonderDelta.ok) return
    const laatste = metDelta.band.p50.length - 1
    expect(metDelta.band.p50[laatste]).not.toBe(zonderDelta.band.p50[laatste])
  })
})

describe('Marktcheck — de spreiding is een JAARvolatiliteit, geen levenslange shift', () => {
  /**
   * De casus uit de melding: leeftijd 40, vermogen €595.200, inleg €1.296/mnd,
   * doel ~€1,65M, FIRE rond 62, eind 89. De gebruiker zag een Y-as van €3.186M
   * (drie miljard) waarop zijn hele levenslijn tot een streep op nul was
   * platgedrukt.
   *
   * OORZAAK: `wrappers/mc.ts` bakt één trekking uit N(0, σ) PERMANENT in
   * `pot.rendement`, terwijl σ (0,15) de jaarvolatiliteit is. Een p90-run rekende
   * daardoor 25,1%/jr, 49 jaar lang. Deze suite let daarom op de UITKOMST — de
   * ordegrootte van de band — en niet op de formule; de bestaande
   * "p10 ≤ p50 ≤ p90"-tests waren allemaal groen tijdens dit defect.
   */
  const MELDING_DOEL = 1_650_000

  function meldingCtx(): ConvergentieRawContext {
    return {
      profile: {
        date_of_birth: DOB, // leeftijd 40
        net_monthly_income: 4_500,
        estimated_monthly_expenses: 3_204, // → ~€1.296/mnd inleg
        expected_return: 0.07,
        inflation_rate: 0.02,
        box3_method: 'forfaitair',
        fire_end_strategy: 'deplete',
        fire_end_age: 89,
        fire_legacy_amount: 0,
        withdrawal_strategy: 'static',
        housing_strategy_config: { mode: 'include_full' },
        retirement_expense_method: 'current_expenses',
        retirement_expense_custom_amount: null,
      },
      assets: [
        {
          id: 'inv',
          name: 'Beleggingen',
          asset_type: 'investment',
          current_value: 595_200,
          woz_value: null,
          expected_return: 7,
          monthly_contribution: 1_296,
          is_active: true,
          net_worth_inclusion_pct: 100,
          depreciation_rate: 0,
        },
      ] as unknown as Asset[],
      debts: [],
      lifeEvents: [],
      aowRows: [],
      yearlyExpenses: 38_448,
    }
  }

  const check = computeMarktcheck({ rawContext: meldingCtx() })
  if (!check.ok) throw new Error(`marktcheck faalde: ${check.reason}`)
  const band = check.band
  const laatste = band.p50.length - 1
  const bandMax = Math.max(...band.p90)

  /** De band zoals de grafiek 'm toont: t/m de eindleeftijd van het plan (89). */
  const zichtbaarTot = 89 - band.startAge
  const zichtbaarMax = Math.max(...band.p90.slice(0, zichtbaarTot + 1))
  const p50Piek = Math.max(...band.p50)

  it('Given de ongecorrigeerde σ (jaarvolatiliteit als levenslange shift), When beide banden worden vergeleken, Then is de gecorrigeerde band ordes smaller', () => {
    // GEEN gefitte drempel maar een directe A/B op dezelfde persona: dit pint de
    // FIX zelf, niet een toevallig getal. Ongecorrigeerd rekent een p90-run 49
    // jaar lang 25,1%/jr; gecorrigeerd 9,6%/jr.
    const input = buildTotaalplanKernelInput(meldingCtx())
    expect(input).not.toBeNull()
    const ongecorrigeerd = runMonteCarlo({
      ...input!,
      onzekerheid: { ...input!.onzekerheid, mc: { ...input!.onzekerheid.mc, aantalRuns: 200 } },
    })
    const ruweMax = Math.max(...ongecorrigeerd.band.p90.slice(0, zichtbaarTot + 1))
    expect(ruweMax / zichtbaarMax).toBeGreaterThan(10)
  })

  it('Given de zichtbare grafiek t/m de eindleeftijd, When de bovenrand van de band wordt gelezen, Then blijft die binnen 20× de plan-piek', () => {
    // De melding: Y-as €3.186.000.000 op een plan-piek van ~€1,1M — factor ~2850.
    // Deze plafondwaarde ligt twee ordes onder dat defect en ruim boven de
    // gemeten ~10×, dus hij vangt de foutklasse zonder de legitieme spreiding
    // van een 49-jaars decumulatie te knijpen.
    expect(p50Piek).toBeGreaterThan(0)
    expect(zichtbaarMax).toBeLessThan(20 * p50Piek)
    expect(zichtbaarMax).toBeLessThan(20 * MELDING_DOEL)
  })

  it('Given de band de plan-curve volgt, When p50 wordt gelezen, Then piekt hij rond het doelbedrag en loopt hij daarna terug naar bijna nul', () => {
    // Dit is de eigenlijke eis: de mediaan-lijn IS het plan. Piek ~€1,1M rond
    // FIRE, eind ~€0,17M op 89 — niet ordes daarboven.
    expect(p50Piek).toBeLessThan(2 * MELDING_DOEL)
    expect(band.p50[zichtbaarTot]).toBeLessThan(0.5 * p50Piek)
    expect(band.p50[zichtbaarTot]).toBeGreaterThan(-0.5 * p50Piek)
  })

  it('Given de volledige projectiehorizon (t/m 100), When de band verder wordt gelezen, Then blijft ook daar de bovenrand binnen 20× het doelbedrag', () => {
    expect(bandMax).toBeLessThan(20 * MELDING_DOEL)
    expect(band.p50[laatste]).toBeLessThan(2 * MELDING_DOEL)
  })

  it('Given σ de jaarvolatiliteit is, When de marktcheck-σ wordt afgeleid, Then is die geschaald met 1/√T en niet de rauwe jaarvolatiliteit', () => {
    const input = buildTotaalplanKernelInput(meldingCtx())
    expect(input).not.toBeNull()
    const ruw = input!.onzekerheid.mc.sigma
    const geschaald = marktcheckSigma(input!)
    const looptijd = 89 - 40
    expect(ruw).toBeCloseTo(0.15, 6)
    expect(geschaald).toBeCloseTo(ruw / Math.sqrt(looptijd), 6)
    expect(geschaald).toBeLessThan(ruw / 5)
  })

  it('Given een korter plan, When de looptijd halveert, Then wordt de spreiding breder (σ/√T is looptijd-afhankelijk)', () => {
    const lang = buildTotaalplanKernelInput(meldingCtx())
    const kort = buildTotaalplanKernelInput({
      ...meldingCtx(),
      profile: { ...meldingCtx().profile, fire_end_age: 65 },
    })
    expect(lang).not.toBeNull()
    expect(kort).not.toBeNull()
    expect(marktcheckSigma(kort!)).toBeGreaterThan(marktcheckSigma(lang!))
  })
})

describe('Marktcheck — band en hoofdlijn delen ook in `real` dezelfde deflator', () => {
  // De band is geïndexeerd op jaar-OFFSET, de hoofdlijn op LEEFTIJD. Beide punten
  // op leeftijd `startAge + i` dragen de eindstand van jaar-blok i−1 en moeten dus
  // met dezelfde factor `(1+π)^(i-1)` gedeflateerd worden. Zonder de bronjaar-
  // sleutel krijgt de band één jaar extra deflatie en zakt hij ~π onder de lijn.
  const bronjaar = (i: number) => Math.max(i - 1, 0)

  it('Given euroView `real`, When band en hoofdlijn op dezelfde leeftijd worden gedeflateerd, Then gebruiken ze exact dezelfde factor', () => {
    const ctx = makeKernelContext()
    const outcome = computeConvergentieProjection({ rawContext: ctx })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const rows = outcome.result.rows
    const factorByOffset = buildFactorByOffset(rows)
    const factorByAge = buildFactorByAge(rows)
    const startAge = rows[0].age

    // De hoofdlijn plot rows[k].netWorth op leeftijd rows[k].age + 1, gedeflateerd
    // met de factor van rows[k].age. De band plot dezelfde grootheid op index k+1.
    const bandAchtig = rows.map((r) => r.netWorth)
    const bandOpOffset = [rows[0].startNetWorth, ...bandAchtig]
    const gedeflateerdeBand = deflateSeriesByOffset(bandOpOffset, factorByOffset, 'real', bronjaar)

    for (let k = 0; k < rows.length; k++) {
      const leeftijd = rows[k].age + 1
      const factorHoofdlijn = factorByAge.get(rows[k].age)
      if (factorHoofdlijn === undefined) continue
      const hoofdlijnReeel = rows[k].netWorth / factorHoofdlijn
      expect(gedeflateerdeBand[leeftijd - startAge], `leeftijd ${leeftijd}`).toBeCloseTo(
        hoofdlijnReeel,
        6,
      )
    }
  })

  it('Given de oude sleutelloze aanroep, When dezelfde reeks wordt gedeflateerd, Then wijkt hij structureel één inflatiejaar af — het defect dat de sleutel dicht', () => {
    const ctx = makeKernelContext()
    const outcome = computeConvergentieProjection({ rawContext: ctx })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const rows = outcome.result.rows
    const factorByOffset = buildFactorByOffset(rows)
    const reeks = [rows[0].startNetWorth, ...rows.map((r) => r.netWorth)]
    const metSleutel = deflateSeriesByOffset(reeks, factorByOffset, 'real', bronjaar)
    const zonderSleutel = deflateSeriesByOffset(reeks, factorByOffset, 'real')
    // Op elke index > 0 met een positieve waarde is de sleutelloze variant lager.
    const i = Math.min(10, reeks.length - 1)
    expect(reeks[i]).toBeGreaterThan(0)
    expect(zonderSleutel[i]).toBeLessThan(metSleutel[i])
  })
})

describe('Marktcheck — band (netto vermogen) vs. marge (besteedbaar) per woonstrategie', () => {
  // De band staat op Prognose!I (incl. huis), de rendement-marge op de gap-toets
  // die voor deplete Prognose!J (besteedbaar) leest. Onder `include_full` vallen
  // I en J samen; onder de niet-meetellen-strategieën scheelt dat de overwaarde.
  // Dat is geen fout maar het MOET zichtbaar zijn — vandaar deze fixtures.
  function huisCtx(mode: string): ConvergentieRawContext {
    const base = makeKernelContext()
    return {
      ...base,
      profile: { ...base.profile, housing_strategy_config: { mode } },
      assets: [
        ...base.assets,
        {
          id: 'huis',
          name: 'Eigen woning',
          asset_type: 'eigen_huis',
          current_value: 450_000,
          woz_value: 450_000,
          expected_return: 2,
          monthly_contribution: 0,
          is_active: true,
          net_worth_inclusion_pct: 100,
          depreciation_rate: 0,
        },
      ] as unknown as Asset[],
    }
  }

  for (const mode of ['include_full', 'exclude_from_fire', 'reverse_mortgage'] as const) {
    it(`Given woonstrategie ${mode}, When de marktcheck draait, Then staat de band op de netto-vermogensgrondslag van de hoofdlijn`, () => {
      const ctx = huisCtx(mode)
      const outcome = computeConvergentieProjection({ rawContext: ctx })
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      const sim = toSimResult(outcome.result)
      const byAge = new Map<number, number>([[sim.rows[0].age, sim.rows[0].startPortfolio]])
      for (const r of sim.rows) byAge.set(r.age + 1, r.endPortfolio)

      // `maxRuns: 20` i.p.v. de volle 200: de assertie is de percentiel-
      // ORDENING en de containment van de hoofdlijn, en die is schaal-vrij
      // (nearest-rank pakt bij 20 runs de 3e en 19e waarde — dezelfde 10%/90%-
      // positie). Scheelt hier 3 × 180 volledige kernel-projecties, wat dit
      // blok binnen de 30s-testtimeout houdt wanneer de suite volledig draait.
      const check = computeMarktcheck({ rawContext: ctx, maxRuns: 20 })
      expect(check.ok).toBe(true)
      if (!check.ok) return

      expect(check.band.startAge).toBe(sim.rows[0].age)
      // Index 0 = de stand van vandaag, incl. huis — bewijst de I-grondslag.
      expect(check.band.p50[0]).toBeCloseTo(byAge.get(sim.rows[0].age)!, 6)
      for (const [age, waarde] of byAge) {
        const i = age - check.band.startAge
        if (i < 0 || i >= check.band.p50.length) continue
        expect(check.band.p10[i], `p10 op leeftijd ${age} (${mode})`).toBeLessThanOrEqual(waarde)
        expect(check.band.p90[i], `p90 op leeftijd ${age} (${mode})`).toBeGreaterThanOrEqual(waarde)
      }
    })
  }

  /** Laatste rij van de hoofdprojectie voor een woonstrategie. */
  function laatsteRij(mode: string) {
    const outcome = computeConvergentieProjection({ rawContext: huisCtx(mode) })
    if (!outcome.ok) throw new Error(`kernel-run faalde voor ${mode}: ${outcome.reason}`)
    const rows = outcome.result.rows
    return rows[rows.length - 1]
  }

  it('Given woonstrategie include_full, When I en J op de eindleeftijd worden vergeleken, Then vallen band- en marge-grondslag samen', () => {
    const last = laatsteRij('include_full')
    expect(last.nettoLiquide).toBeCloseTo(last.netWorth, 6)
  })

  it('Given woonstrategie exclude_from_fire, When band en marge worden vergeleken, Then eindigt de band ruim boven nul terwijl de besteedbare grondslag eronder ligt — de tegenspraak die de uitleg benoemt', () => {
    const last = laatsteRij('exclude_from_fire')
    const check = computeMarktcheck({ rawContext: huisCtx('exclude_from_fire'), maxRuns: 5 })
    expect(check.ok).toBe(true)
    if (!check.ok) return

    // De grondslagen lópen uiteen — dit is de discriminerende assertie: onder
    // `include_full` zou dit verschil exact 0 zijn (zie de test hierboven).
    expect(last.netWorth).toBeGreaterThan(last.nettoLiquide!)
    // En ze liggen aan wéérszijden van nul: de band (I) eindigt positief, de
    // grondslag van de marge (J) negatief. Precies het beeld waarvoor de
    // explainer en de legenda "(zonder huis)" de grondslag benoemen.
    expect(last.netWorth).toBeGreaterThan(0)
    expect(last.nettoLiquide!).toBeLessThan(0)
    expect(check.band.p50[check.band.p50.length - 1]).toBeGreaterThan(0)
  })

  it('Given elke woonstrategie, When de band-startwaarde wordt gelezen, Then telt het huis altijd mee (I-grondslag, ongeacht de strategie)', () => {
    const modi = ['include_full', 'exclude_from_fire', 'reverse_mortgage'] as const
    const starts = modi.map((m) => {
      // Index 0 is de stand van VANDAAG en dus in élke run identiek — het aantal
      // marktverlopen kan hier niets aan veranderen. `maxRuns: 1` is daarom
      // gedragsbehoudend en scheelt 3 × 199 volledige kernel-projecties.
      const c = computeMarktcheck({ rawContext: huisCtx(m), maxRuns: 1 })
      if (!c.ok) throw new Error(`marktcheck faalde voor ${m}: ${c.reason}`)
      return c.band.p50[0]
    })
    for (const s of starts) expect(s).toBeCloseTo(starts[0], 6)
    // 150k beleggingen + 450k woning — het huis zit er aantoonbaar in.
    expect(starts[0]).toBeCloseTo(600_000, 6)
  })
})

describe('Marktcheck — nooit op de main thread', () => {
  it('Given geen bruikbare Worker (jsdom/SSR), When runMarktcheckAsync wordt aangeroepen, Then komt er `null` i.p.v. een synchrone kernel-run', async () => {
    // jsdom kent geen `Worker`. De gedeelde `dispatch` zou hier normaal synchroon
    // terugvallen; `workerOnly` verbiedt dat, want dit zijn tot 200 volledige
    // kernel-projecties (2,6–5,1 s) die de UI zouden bevriezen.
    expect(typeof Worker).toBe('undefined')
    await expect(runMarktcheckAsync(makeKernelContext())).resolves.toBeNull()
    await expect(
      runWhatifMarktcheckAsync({
        profile: makeKernelContext().profile,
        assets: [...makeKernelContext().assets],
        debts: [],
        lifeEvents: [],
        aowRows: [],
        yearlyExpenses: 30_000,
      }),
    ).resolves.toBeNull()
  })
})

describe('Marktcheck — regressie-slot op de oude motor', () => {
  /** De `FinancialInput` die de /toekomst-callsite vóór de fix aan de legacy-MC voerde. */
  const legacyInput: FinancialInput = {
    totalAssets: 150_000,
    totalDebts: 0,
    monthlyIncome: 4000,
    monthlyExpenses: 2500,
    yearlyMustExpenses: 30_000,
    monthlyContributions: 800,
    dateOfBirth: DOB,
    expectedReturn: 0.07,
  }

  it('Given de losstaande legacy-MC, When zijn band naast de plan-curve wordt gelegd, Then blijft hij stijgen waar het plan afbouwt — daarom voedt hij de grafiek niet meer', () => {
    const ctx = makeKernelContext()
    const { sim, byAge, startAge, peak } = mainLine(ctx)
    const years = Math.max(sim.displayEndAge - startAge, 10)
    const legacy = runLegacyMonteCarlo(legacyInput, 1000, years)
    const eindIdx = sim.displayEndAge - startAge
    const fireIdx = sim.fireAge! - startAge

    // De defect-handtekening: de legacy-band stijgt dóór in de onttrekkingsfase …
    expect(legacy.percentiles.p50[eindIdx]).toBeGreaterThan(legacy.percentiles.p50[fireIdx])
    // … en eindigt een veelvoud van de hoofdlijn-piek boven het werkelijke plan.
    expect(legacy.percentiles.p50[eindIdx] - byAge.get(sim.displayEndAge)!).toBeGreaterThan(peak)
  })
})
