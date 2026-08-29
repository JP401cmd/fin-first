import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import {
  DEFAULT_VOLATILITY,
  RISICO_FACTOR_GEEN,
  RISICO_FACTOR_PER_PROFIEL,
} from '@/lib/constants'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { buildAssetPotten } from '@/lib/horizon-kernel/adapter/potten'
import { assetRisicoFactor, resolveAssetRiskProfile } from '@/lib/horizon-kernel/adapter/risico'
import { buildOnzekerheid } from '@/lib/horizon-kernel/adapter/params'
import { EXCEL_ONZEKERHEID_DEFAULTS } from '@/lib/horizon-kernel/adapter/defaults'
import { buildConvergentieAdapterProfile } from '@/lib/horizon-kernel/convergentie-router'
import { potRisicoFactor } from '@/lib/horizon-kernel/wrappers/risico'
import { runScenarioBand } from '@/lib/horizon-kernel/wrappers/band'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import { computeRendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import type { AssetPot, KernelInput } from '@/lib/horizon-kernel/types'

/**
 * **ADR 0117 — risico volgt de categorie** (snede 1 van de allocatie-modellering).
 *
 * ## Wat hier stukging
 * De scenarioband was een vaste ±2 procentpunt en de Monte-Carlo draaide op één σ,
 * beide gepoort op de binaire `investering`-vlag. Die vlag is in de adapter een
 * whitelist van alleen Beleggingen + Vastgoed. Twee gevolgen:
 *  1. een 100%-obligatiepot kreeg exact dezelfde onzekerheid als een 100%-aandelenpot;
 *  2. een **premieregeling-pensioenpot** — vaak de grootste aandelenblootstelling van
 *     een Nederlands huishouden — bewoog in het geheel NIET mee met band of MC en
 *     groeide deterministisch door. Dat maakte het plan systematisch te zeker,
 *     evenredig met hoeveel pensioenvermogen iemand heeft.
 *
 * ## De toleranties (bewuste keuze per assertie)
 *  - **Byte-identiteit** (overlay afwezig ⇒ oud gedrag) wordt EXACT getoetst met
 *    `toBe`/`toEqual` op de ruwe getallen. Een relatieve tolerantie zou hier precies
 *    de foutklasse verbergen die we willen uitsluiten: de laatste-bit-drift van een
 *    veranderde optelvolgorde. De oracle-parity-suites (`test/horizon-oracle`) zijn
 *    de tweede, onafhankelijke gate op dezelfde eigenschap.
 *  - **Gedragsassertie's** (band verbreedt, pensioenpot beweegt) zijn ORDENINGEN
 *    (`toBeGreaterThan`), geen getalvergelijkingen. De uitkomst hangt van de hele
 *    plan-curve af; een gepind bedrag zou een broze fixture zijn zonder extra
 *    zeggingskracht.
 */

const DOB = '1986-01-01'

function asset(over: Partial<Asset> & { id: string; asset_type: Asset['asset_type'] }): Asset {
  return {
    name: over.id,
    current_value: 100_000,
    expected_return: 6,
    monthly_contribution: 0,
    is_active: true,
    net_worth_inclusion_pct: 100,
    sort_order: 0,
    risk_profile: null,
    subtype: null,
    woz_value: null,
    depreciation_rate: 0,
    ...over,
  } as unknown as Asset
}

function makeInput(assets: readonly Asset[]): KernelInput {
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile({
      date_of_birth: DOB,
      net_monthly_income: 4000,
      estimated_monthly_expenses: 2500,
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      withdrawal_strategy: 'static',
      housing_strategy_config: { mode: 'include_full' },
      retirement_expense_method: 'current_expenses',
      retirement_expense_custom_amount: null,
    } as never),
    assets,
    debts: [],
    lifeEvents: [],
    aowRows: [],
    asOf: new Date('2026-01-01T00:00:00Z'),
  })
}

/** Dezelfde invoer, maar met de risico-overlay VOLLEDIG weggelaten (het legacy-pad). */
function zonderOverlay(input: KernelInput): KernelInput {
  return {
    ...input,
    assetPotten: input.assetPotten.map((p) => {
      const kopie: Record<string, unknown> = { ...p }
      delete kopie.risicoFactor
      return kopie as unknown as AssetPot
    }),
  }
}

/** Zet één vaste factor op elke pot (om het effect van de schaal te isoleren). */
function metFactor(input: KernelInput, factorPerSlot: (p: AssetPot) => number): KernelInput {
  return {
    ...input,
    assetPotten: input.assetPotten.map((p) => ({ ...p, risicoFactor: factorPerSlot(p) })),
  }
}

/** Goedkope MC: 25 runs is ruim genoeg voor een ordening en houdt de suite snel. */
function metRuns(input: KernelInput, runs: number): KernelInput {
  return {
    ...input,
    onzekerheid: { ...input.onzekerheid, mc: { ...input.onzekerheid.mc, aantalRuns: runs } },
  }
}

/** Bandbreedte p90−p10 gesommeerd over de hele leeftijdsas — één maat voor "spreiding". */
function bandbreedte(mc: ReturnType<typeof runMonteCarlo>): number {
  return mc.band.p90.reduce((som, hoog, i) => som + (hoog - mc.band.p10[i]), 0)
}

// ── 1 · De kern-terugval: afwezige factor ⇒ het oude binaire gedrag ───────────

describe('potRisicoFactor — de overlay is inert wanneer hij ontbreekt', () => {
  const basis = {
    slot: 0,
    naam: 'x',
    box3Type: 'Box 3 investering',
    categorie: 'Beleggingen',
    startwaarde: 1000,
    rendement: 0.06,
    rol: null,
  } as unknown as AssetPot

  it('Given een pot zonder risicoFactor, When de factor wordt opgevraagd, Then valt hij terug op de investering-vlag (1 / 0)', () => {
    expect(potRisicoFactor({ ...basis, investering: true })).toBe(1)
    expect(potRisicoFactor({ ...basis, investering: false })).toBe(0)
  })

  it('Given een pot MET risicoFactor, When de factor wordt opgevraagd, Then wint de factor van de investering-vlag', () => {
    // Precies de defect-fix: investering = false (Pensioen valt buiten de whitelist)
    // maar de pot beweegt tóch mee.
    expect(potRisicoFactor({ ...basis, investering: false, risicoFactor: 1 })).toBe(1)
    expect(potRisicoFactor({ ...basis, investering: true, risicoFactor: 0.3 })).toBe(0.3)
    expect(potRisicoFactor({ ...basis, investering: true, risicoFactor: 0 })).toBe(0)
  })

  it('Given een corrupte factor (NaN/negatief/oneindig), When de factor wordt opgevraagd, Then wordt hij genegeerd i.p.v. de projectie te vergiftigen', () => {
    // Een NaN in `rendement` maakt élke maandwaarde NaN, de gap NaN en de
    // solver-bisectie stuurloos — dat mag nooit via deze laag binnenkomen.
    expect(potRisicoFactor({ ...basis, investering: true, risicoFactor: Number.NaN })).toBe(1)
    expect(potRisicoFactor({ ...basis, investering: true, risicoFactor: -0.5 })).toBe(1)
    expect(potRisicoFactor({ ...basis, investering: false, risicoFactor: Number.POSITIVE_INFINITY })).toBe(0)
  })
})

// ── 2 · De afleiding uit risk_profile / subtype / categorie ──────────────────

describe('assetRisicoFactor — risico volgt de categorie en het risicoprofiel', () => {
  it('Given een niet-marktgevoelige categorie, When de factor wordt afgeleid, Then is hij 0 (ongewijzigd t.o.v. vóór ADR 0117)', () => {
    expect(assetRisicoFactor(asset({ id: 'a', asset_type: 'cash' }), 'Spaargeld')).toBe(RISICO_FACTOR_GEEN)
    expect(assetRisicoFactor(asset({ id: 'b', asset_type: 'savings' }), 'Spaargeld')).toBe(RISICO_FACTOR_GEEN)
    expect(assetRisicoFactor(asset({ id: 'c', asset_type: 'eigen_huis' }), 'Eigen huis')).toBe(RISICO_FACTOR_GEEN)
    // Overig blijft bewust buiten deze snede — deelneming/Box 2 is snede 4.
    expect(assetRisicoFactor(asset({ id: 'd', asset_type: 'deelneming' }), 'Overig')).toBe(RISICO_FACTOR_GEEN)
    expect(assetRisicoFactor(asset({ id: 'e', asset_type: 'vehicle' }), 'Overig')).toBe(RISICO_FACTOR_GEEN)
  })

  it('Given een belegging zonder risico-informatie, When de factor wordt afgeleid, Then is hij 1 — exact het niveau van vóór ADR 0117', () => {
    // DE blast-radius-garantie: wie niets heeft ingevuld, ziet niets veranderen.
    expect(assetRisicoFactor(asset({ id: 'i', asset_type: 'investment' }), 'Beleggingen')).toBe(1)
    expect(assetRisicoFactor(asset({ id: 'v', asset_type: 'real_estate' }), 'Vastgoed')).toBe(1)
  })

  it('Given een subtype met een bekend risicoprofiel, When de factor wordt afgeleid, Then volgt hij dat profiel', () => {
    expect(assetRisicoFactor(asset({ id: 'o', asset_type: 'investment', subtype: 'obligaties' }), 'Beleggingen'))
      .toBe(RISICO_FACTOR_PER_PROFIEL.laag)
    expect(assetRisicoFactor(asset({ id: 'aa', asset_type: 'investment', subtype: 'aandelen' }), 'Beleggingen'))
      .toBe(RISICO_FACTOR_PER_PROFIEL.hoog)
    expect(assetRisicoFactor(asset({ id: 'etf', asset_type: 'investment', subtype: 'etf' }), 'Beleggingen'))
      .toBe(RISICO_FACTOR_PER_PROFIEL.middel)
  })

  it('Given een expliciet risk_profile, When de factor wordt afgeleid, Then wint de gebruikerskeuze van de subtype-default', () => {
    // Zelfde precedentie-regel als resolveFireParamsWithAssumptions: expliciet > default.
    const a = asset({ id: 'x', asset_type: 'investment', subtype: 'obligaties', risk_profile: 'hoog' })
    expect(resolveAssetRiskProfile(a)).toBe('hoog')
    expect(assetRisicoFactor(a, 'Beleggingen')).toBe(RISICO_FACTOR_PER_PROFIEL.hoog)
  })

  it('Given een pensioenpot, When de factor wordt afgeleid, Then beweegt hij mee — de scherpste correctie van deze snede', () => {
    // Vóór ADR 0117 was dit ALTIJD 0 (Pensioen viel buiten INVESTERING_CATEGORIEEN).
    const premie = asset({ id: 'p', asset_type: 'retirement', subtype: 'premieregeling' })
    expect(assetRisicoFactor(premie, 'Pensioen')).toBe(RISICO_FACTOR_PER_PROFIEL.middel)
    expect(assetRisicoFactor(premie, 'Pensioen')).toBeGreaterThan(0)

    // Een uitkeringsregeling draagt veel minder marktrisico voor de deelnemer.
    const uitkering = asset({ id: 'u', asset_type: 'retirement', subtype: 'uitkeringsregeling' })
    expect(assetRisicoFactor(uitkering, 'Pensioen')).toBe(RISICO_FACTOR_PER_PROFIEL.laag)

    // Zonder subtype: de terugval is 'middel' (= 1), niet 0.
    expect(assetRisicoFactor(asset({ id: 'q', asset_type: 'retirement' }), 'Pensioen')).toBe(1)
  })
})

describe('buildAssetPotten — de adapter zet de factor op elke pot', () => {
  const potten = buildAssetPotten([
    asset({ id: 'spaar', asset_type: 'savings', sort_order: 0 }),
    asset({ id: 'obli', asset_type: 'investment', subtype: 'obligaties', sort_order: 1 }),
    asset({ id: 'pens', asset_type: 'retirement', subtype: 'premieregeling', sort_order: 2 }),
  ])
  const bijNaam = (naam: string) => potten.find((p) => p.naam === naam)!

  it('Given app-bezittingen, When de potten worden gebouwd, Then draagt elke pot zijn afgeleide risicofactor', () => {
    expect(bijNaam('spaar').risicoFactor).toBe(0)
    expect(bijNaam('obli').risicoFactor).toBe(RISICO_FACTOR_PER_PROFIEL.laag)
    expect(bijNaam('pens').risicoFactor).toBe(RISICO_FACTOR_PER_PROFIEL.middel)
  })

  it('Given de bens!F-vlag een eigen contract is, When de factor wordt gezet, Then blijft `investering` ONgewijzigd', () => {
    // `investering` stuurt tables/bez.ts én de market_shock-scope (alleenInvestering).
    // Hem verbreden zou stil de reikwijdte van een gebruikers-event veranderen.
    expect(bijNaam('pens').investering).toBe(false)
    expect(bijNaam('pens').risicoFactor).toBeGreaterThan(0)
    expect(bijNaam('obli').investering).toBe(true)
  })
})

// ── 3 · Byte-identiteit: de overlay is inert wanneer hij ontbreekt ───────────

describe('Oracle-veiligheid — zonder overlay verandert er geen bit', () => {
  const input = metRuns(makeInput([asset({ id: 'inv', asset_type: 'investment', monthly_contribution: 800 })]), 25)
  const legacy = zonderOverlay(input)
  // De app-adapter geeft deze belegging factor 1; dat MOET exact het legacy-pad zijn.
  const overlay = metFactor(legacy, (p) => (p.investering ? 1 : 0))

  it('Given een scenarioband, When de overlay ontbreekt vs. expliciet 1/0 is, Then zijn de rijen EXACT gelijk', () => {
    expect(runScenarioBand(overlay).rows).toEqual(runScenarioBand(legacy).rows)
  })

  it('Given een Monte-Carlo, When de overlay ontbreekt vs. expliciet 1/0 is, Then zijn outcomes en band EXACT gelijk', () => {
    const a = runMonteCarlo(legacy)
    const b = runMonteCarlo(overlay)
    // `outcomes` en `successProbability` zijn de cel-exacte oracle-velden.
    expect(b.outcomes).toEqual(a.outcomes)
    expect(b.successProbability).toBe(a.successProbability)
    expect(b.band).toEqual(a.band)
    expect(b.bandLiquide).toEqual(a.bandLiquide)
  })

  it('Given de rendement-marge, When de overlay ontbreekt vs. expliciet 1/0 is, Then is de marge EXACT gelijk', () => {
    expect(computeRendementMarge(overlay, 60)).toEqual(computeRendementMarge(legacy, 60))
  })
})

// ── 4 · Het gedrag dat de snede toevoegt ────────────────────────────────────

describe('De pensioenpot beweegt mee met band en marktcheck', () => {
  const basis = metRuns(
    makeInput([
      asset({ id: 'inv', asset_type: 'investment', current_value: 80_000, monthly_contribution: 500 }),
      asset({ id: 'pens', asset_type: 'retirement', subtype: 'premieregeling', current_value: 150_000 }),
    ]),
    25,
  )
  const pensioenSlot = basis.assetPotten.find((p) => p.categorie === 'Pensioen')!.slot
  /** Het oude gedrag: de pensioenpot staat stil. */
  const oud = metFactor(basis, (p) => (p.slot === pensioenSlot ? 0 : 1))
  /** Het nieuwe gedrag: de pensioenpot draagt zijn eigen risico. */
  const nieuw = metFactor(basis, (p) => (p.slot === pensioenSlot ? 1 : 1))

  it('Given een premieregeling-pensioenpot, When de adapter de invoer bouwt, Then draagt die pot een factor > 0', () => {
    expect(basis.assetPotten.find((p) => p.slot === pensioenSlot)!.risicoFactor).toBeGreaterThan(0)
  })

  it('Given de scenarioband, When de pensioenpot meebeweegt, Then verschilt de band van het oude, te zekere beeld', () => {
    expect(runScenarioBand(nieuw).rows).not.toEqual(runScenarioBand(oud).rows)
  })

  it('Given de marktcheck, When de pensioenpot meebeweegt, Then wordt de onzekerheidsband breder', () => {
    // "Systematisch te zeker" is precies dit: een deterministisch groeiende pot
    // versmalt de band zonder dat daar dekking voor is.
    expect(bandbreedte(runMonteCarlo(nieuw))).toBeGreaterThan(bandbreedte(runMonteCarlo(oud)))
  })
})

describe('Risico schaalt met het profiel — obligaties zijn rustiger dan aandelen', () => {
  const basis = metRuns(
    makeInput([asset({ id: 'inv', asset_type: 'investment', current_value: 200_000, monthly_contribution: 500 })]),
    25,
  )
  const laag = metFactor(basis, () => RISICO_FACTOR_PER_PROFIEL.laag)
  const midden = metFactor(basis, () => RISICO_FACTOR_PER_PROFIEL.middel)
  const hoog = metFactor(basis, () => RISICO_FACTOR_PER_PROFIEL.hoog)

  it('Given identieke plannen met alleen een ander risicoprofiel, When de marktcheck draait, Then loopt de bandbreedte laag < middel < hoog', () => {
    const b = [laag, midden, hoog].map((i) => bandbreedte(runMonteCarlo(i)))
    expect(b[0]).toBeLessThan(b[1])
    expect(b[1]).toBeLessThan(b[2])
  })

  it('Given een obligatiepot, When de scenarioband draait, Then is de uitslag kleiner dan bij een aandelenpot', () => {
    const spreiding = (input: KernelInput) => {
      const rows = runScenarioBand(input).rows
      const pess = rows.find((r) => r.scenario === 'Pessimistisch')!.vermogenOpEindleeftijd ?? 0
      const opt = rows.find((r) => r.scenario === 'Optimistisch')!.vermogenOpEindleeftijd ?? 0
      return Math.abs(opt - pess)
    }
    expect(spreiding(laag)).toBeLessThan(spreiding(hoog))
  })
})

// ── 5 · σ komt uit één bron ─────────────────────────────────────────────────

describe('Markt-volatiliteit — één bron, met de jaarlaag als override', () => {
  it('Given de app-pad-terugval, When er geen jaarlaag is, Then is MC!B3 exact DEFAULT_VOLATILITY (geen tweede hardcode)', () => {
    expect(EXCEL_ONZEKERHEID_DEFAULTS.mcSigma).toBe(DEFAULT_VOLATILITY)
    expect(buildOnzekerheid(2026).mc.sigma).toBe(DEFAULT_VOLATILITY)
  })

  it('Given een beheerde jaarlaag, When de onzekerheidslaag wordt gebouwd, Then bereikt fire_assumptions.volatility de projectie', () => {
    // Dit was het defect: beheer kon de volatiliteit zetten zonder dat er iets
    // veranderde, omdat de kernel op zijn eigen hardcode bleef staan.
    expect(buildOnzekerheid(2026, 0.18).mc.sigma).toBe(0.18)
  })

  it('Given een ongeldige of ontbrekende jaarlaag, When de onzekerheidslaag wordt gebouwd, Then valt σ terug op de default', () => {
    // σ = 0 zou de hele band tot één lijn platdrukken zonder dat iemand dat bedoelde.
    for (const ongeldig of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildOnzekerheid(2026, ongeldig).mc.sigma).toBe(DEFAULT_VOLATILITY)
    }
  })

  it('Given de adapter-invoer, When marktVolatiliteit wordt meegegeven, Then draagt de KernelInput die σ', () => {
    const assets = [asset({ id: 'inv', asset_type: 'investment' })]
    expect(makeInput(assets).onzekerheid.mc.sigma).toBe(DEFAULT_VOLATILITY)
    const metJaarlaag = buildKernelInputFromApp({
      profile: buildConvergentieAdapterProfile({ date_of_birth: DOB } as never),
      assets,
      debts: [],
      asOf: new Date('2026-01-01T00:00:00Z'),
      marktVolatiliteit: 0.22,
    })
    expect(metJaarlaag.onzekerheid.mc.sigma).toBe(0.22)
  })
})
