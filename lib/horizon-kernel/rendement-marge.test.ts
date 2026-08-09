import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import { RENDEMENT_MARGE_GRENS } from '@/lib/constants'
import { buildTotaalplanKernelInput } from '@/lib/totaalplan-data'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import {
  computeRendementMarge,
  resolveMargeAnker,
} from '@/lib/horizon-kernel/rendement-marge'
import { runKernelProjection } from '@/lib/horizon-kernel/engine'
import { computeEs } from '@/lib/horizon-kernel/tables/es'
import { computeGap, eindleeftijdVan } from '@/lib/horizon-kernel/gap'
import type { KernelInput } from '@/lib/horizon-kernel/types'

/**
 * De **rendement-marge**: hoeveel mag het rendement per jaar tegenvallen voordat
 * het plan omvalt?
 *
 * ## Wat deze suite bewaakt
 * De vorige ronde liet zien dat VORM-tests (p10 ≤ p50 ≤ p90) een defect van drie
 * ordes doorlaten. Deze suite toetst daarom UITKOMSTEN:
 *  - dat de gevonden waarde daadwerkelijk het omslagpunt is (een halve
 *    procentpunt verder valt het plan wél om),
 *  - dat het getal beweegt met het plan en met de stopkeuze,
 *  - dat de degeneratie- en begrenzingsgevallen expliciet zijn.
 *
 * ## Toleranties (bewuste keuze)
 * De vergelijkingen op de marge zelf zijn **ABSOLUUT in procentpunt**, niet
 * relatief: de grootheid ís een rendementsverschil, en het interessante gebied
 * ligt rond nul — daar zou een relatieve tolerantie ontploffen. Gebruikte
 * afstand: 0,05 procentpunt (5·10⁻⁴), ruim boven de zoekresolutie (~0,004pp) en
 * ruim onder de weergaveprecisie (0,1pp).
 */

const DOB = '1986-01-01'
/** Absolute afstand in rendement-shift waarop het omslagpunt getoetst wordt. */
const OMSLAG_EPS = 0.0005

function makeCtx(
  over: {
    monthlyExpenses?: number
    yearlyExpenses?: number
    startwaarde?: number
    inleg?: number
    strategy?: string
    endAge?: number
  } = {},
): ConvergentieRawContext {
  return {
    profile: {
      date_of_birth: DOB,
      net_monthly_income: 4000,
      estimated_monthly_expenses: over.monthlyExpenses ?? 2500,
      expected_return: 0.07,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: over.strategy ?? 'deplete',
      fire_end_age: over.endAge ?? 90,
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
        current_value: over.startwaarde ?? 150_000,
        woz_value: null,
        expected_return: 7,
        monthly_contribution: over.inleg ?? 800,
        is_active: true,
        net_worth_inclusion_pct: 100,
        depreciation_rate: 0,
      },
    ] as unknown as Asset[],
    debts: [],
    lifeEvents: [],
    aowRows: [],
    yearlyExpenses: over.yearlyExpenses ?? 30_000,
  } as ConvergentieRawContext
}

function makeInput(over: Parameters<typeof makeCtx>[0] = {}): KernelInput {
  const input = buildTotaalplanKernelInput(makeCtx(over))
  if (input === null) throw new Error('kernel-invoer kon niet worden gebouwd')
  return input
}

/** P!B38 op `ankerLeeftijd` met het investeringsrendement `delta` verschoven. */
function gapBijShift(input: KernelInput, ankerLeeftijd: number, delta: number): number {
  const es = computeEs(input)
  const verschoven: KernelInput = {
    ...input,
    onzekerheid: { ...input.onzekerheid, shift: input.onzekerheid.shift + delta },
  }
  const proj = runKernelProjection(verschoven, { fireAge: ankerLeeftijd })
  return computeGap(input, es, proj, ankerLeeftijd)
}

describe('Rendement-marge — de gevonden waarde IS het omslagpunt', () => {
  it('Given een plan met speling, When de gap net binnen en net buiten de marge wordt geëvalueerd, Then draait het teken precies daar om', () => {
    const input = makeInput({ monthlyExpenses: 2200, yearlyExpenses: 26_400 })
    const m = computeRendementMarge(input, 60)
    expect(m).not.toBeNull()
    // `−marge` is de shift waarbij het plan nog nét standhoudt …
    expect(gapBijShift(input, m!.ankerLeeftijd, -m!.marge)).toBeGreaterThanOrEqual(0)
    // … een halve procentpunt verder valt het om. Dit is de assertie die een
    // "de marge is gewoon 0"-implementatie NIET zou halen.
    expect(gapBijShift(input, m!.ankerLeeftijd, -m!.marge - OMSLAG_EPS)).toBeLessThan(0)
  })

  it('Given een plan met een tekort, When hetzelfde omslagpunt wordt getoetst, Then geldt dezelfde eigenschap aan de andere kant van nul', () => {
    // €4.200/mnd op €4.000 inkomen, stoppen op 60: er is extra rendement nodig.
    const input = makeInput({ monthlyExpenses: 4200, yearlyExpenses: 50_400 })
    const m = computeRendementMarge(input, 60)
    expect(m).not.toBeNull()
    expect(m!.marge).toBeLessThan(0)
    expect(gapBijShift(input, m!.ankerLeeftijd, -m!.marge)).toBeGreaterThanOrEqual(0)
    expect(gapBijShift(input, m!.ankerLeeftijd, -m!.marge - OMSLAG_EPS)).toBeLessThan(0)
  })
})

describe('Rendement-marge — het anker', () => {
  it('Given géén gekozen stopleeftijd, When het anker wordt bepaald, Then is het de AOW-leeftijd uit het profiel (niet de solver-uitkomst)', () => {
    const input = makeInput()
    const anker = resolveMargeAnker(input, null)
    expect(anker).not.toBeNull()
    expect(anker!.anker).toBe('aow')
    expect(anker!.leeftijd).toBe(computeEs(input).pensioenleeftijd)
  })

  it('Given een gekozen stopleeftijd, When het anker wordt bepaald, Then wint die keuze', () => {
    const anker = resolveMargeAnker(makeInput(), 58)
    expect(anker).toEqual({ leeftijd: 58, anker: 'stopkeuze' })
  })

  it('Given een anker op/voorbij de eindleeftijd, When de marge wordt bepaald, Then is hij `null` — er is geen onttrekkingsfase om te toetsen', () => {
    const input = makeInput()
    const eind = eindleeftijdVan(computeEs(input))
    expect(resolveMargeAnker(input, eind)).toBeNull()
    expect(computeRendementMarge(input, eind)).toBeNull()
    expect(computeRendementMarge(input, eind + 5)).toBeNull()
  })

  it('Given een anker vóór de startleeftijd, When de marge wordt bepaald, Then is hij `null`', () => {
    const input = makeInput()
    expect(computeRendementMarge(input, input.startLeeftijd - 1)).toBeNull()
  })

  it('Given een plan waarvan de eindleeftijd vóór de AOW ligt, When er geen stopkeuze is, Then valt de marge weg i.p.v. een niet-toetsbaar getal te tonen', () => {
    // eindleeftijd 65 < AOW 67 ⇒ de terugval kan niet worden geëvalueerd.
    const input = makeInput({ endAge: 65 })
    expect(computeRendementMarge(input, null)).toBeNull()
  })
})

describe('Rendement-marge — begrenzing van het zoekbereik', () => {
  it('Given een plan dat zelfs bij −15% rendement standhoudt, When de marge wordt gelezen, Then is hij begrensd `boven` op de zoekgrens', () => {
    // €40M vermogen tegen €500/mnd uitgaven: onverwoestbaar binnen het bereik.
    const m = computeRendementMarge(
      makeInput({ monthlyExpenses: 500, yearlyExpenses: 6_000, startwaarde: 40_000_000, inleg: 0 }),
      55,
    )
    expect(m).not.toBeNull()
    expect(m!.begrensd).toBe('boven')
    expect(m!.marge).toBe(RENDEMENT_MARGE_GRENS)
  })

  it('Given een plan dat zelfs bij +15% rendement omvalt, When de marge wordt gelezen, Then is hij begrensd `onder`', () => {
    const m = computeRendementMarge(
      makeInput({ monthlyExpenses: 12_000, yearlyExpenses: 144_000, startwaarde: 5_000, inleg: 0 }),
      45,
    )
    expect(m).not.toBeNull()
    expect(m!.begrensd).toBe('onder')
    expect(m!.marge).toBe(-RENDEMENT_MARGE_GRENS)
  })

  it('Given een gewoon plan, When de marge wordt gelezen, Then is hij NIET begrensd en ligt hij strikt binnen het zoekbereik', () => {
    const m = computeRendementMarge(makeInput(), 60)
    expect(m).not.toBeNull()
    expect(m!.begrensd).toBeNull()
    expect(Math.abs(m!.marge)).toBeLessThan(RENDEMENT_MARGE_GRENS)
  })
})

describe('Rendement-marge — de grondslag is de gap-toets, niet de band', () => {
  it('Given de woonstrategie "niet meetellen", When de marge wordt vergeleken met "meetellen", Then verschilt hij — de overwaarde telt niet mee in het besteedbare vermogen', () => {
    // De band staat op Prognose!I (incl. huis), de marge op de gap-toets die voor
    // deplete Prognose!J leest. Dat verschil MOET zichtbaar zijn, anders zou de
    // marge stilzwijgend de huiswaarde meerekenen.
    function metHuis(mode: string) {
      const base = makeCtx()
      const ctx: ConvergentieRawContext = {
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
      const input = buildTotaalplanKernelInput(ctx)
      if (input === null) throw new Error(`kernel-invoer faalde voor ${mode}`)
      return computeRendementMarge(input, 60)
    }
    const meetellen = metHuis('include_full')
    const uitsluiten = metHuis('exclude_from_fire')
    expect(meetellen).not.toBeNull()
    expect(uitsluiten).not.toBeNull()
    // Zonder het huis in de besteedbare pot is er aantoonbaar minder speling.
    expect(uitsluiten!.marge).toBeLessThan(meetellen!.marge)
  })
})
