import { describe, it, expect } from 'vitest'
import { buildInkomenUitgaven, type KernelAdapterProfile } from './params'
import { buildConvergentieAdapterProfile, type ConvergentieRawProfileRow } from '../convergentie-router'
import { withResolvedKernelBedragen } from '@/lib/horizon/kernel-profile-basis'

/**
 * REGRESSIESLOT — de kernel rekent op de ADR-0103-grondslag (via injectie).
 *
 * HERKOMST: dit bestand begon als BEVINDING uit het testtraject. Het pinde vast
 * dat de horizon-kernel `net_monthly_income` rechtstreeks uit de rauwe
 * profielrij las, zodat een gebruiker op grondslag 'budget' of 'transaction' —
 * die `profiles.net_monthly_income` normaal leeg laat, want dat veld bestaat
 * alleen voor 'manual' — met €0 basissalaris werd doorgerekend.
 *
 * WAT ER AAN DE INTENTIE VERANDERDE:
 *  • Blok 1 asserteerde "€0 nettoJaarinkomen, en dat is het defect". Het
 *    beschrijft nu hetzelfde mechanisme als BEWUST contract: `buildInkomenUitgaven`
 *    leest bedragen 1-op-1 en neemt geen grondslagbeslissing — dat kán hij ook
 *    niet, want `ConvergentieRawProfileRow` draagt geen budgetsom en geen
 *    transactiereeks. De rauwe rij LEVERT nog steeds €0; dat is geen bug meer
 *    maar de reden dat de app injecteert.
 *  • Blok 2 asserteerde dat een stale 'manual'-bedrag leidend blijft. Dat is nu
 *    omgedraaid: na injectie wint het effectieve bedrag van het stale bedrag.
 *  • Blok 3 (nieuw) is het eigenlijke slot: het toetst dat de injectie het gat
 *    dicht, dat ze idempotent is (loader én hook passen 'm toe) en dat ze door
 *    `buildConvergentieAdapterProfile` heen overleeft.
 *
 * WAAROM INJECTIE EN GEEN CONTRACT-WIJZIGING: de kern modelleert KASSTROOM.
 * `nettoJaarinkomen` voedt via `cf.basissalaris` (bridge.ts) het pre-FIRE-kanaal
 * CF!D. Hij heeft dus BEDRAGEN nodig, geen verhouding — de spaarquote consumeert
 * hij niet. Het bestaande `yearly_essential_expenses`-veld toont het patroon al:
 * een berekende waarde in een veld dat verder als DB-kolom leest.
 */

const DOB = '1986-01-01'

describe('buildInkomenUitgaven — leest BEDRAGEN, neemt geen grondslagbeslissing (bewust)', () => {
  it('mapt net_monthly_income 1-op-1 naar nettoJaarinkomen', () => {
    const profile: KernelAdapterProfile = {
      date_of_birth: DOB,
      net_monthly_income: 3000,
      estimated_monthly_expenses: 2500,
    }
    expect(buildInkomenUitgaven(profile).nettoJaarinkomen).toBe(36_000)
  })

  it('een NIET-geïnjecteerde rij levert €0 — precies waarom de app injecteert', () => {
    // De realistische situatie voor grondslag 'budget'/'transaction':
    // net_monthly_income is nooit ingevuld. Zonder injectie zou de kernel hier
    // met €0 basissalaris rekenen terwijl de rest van de app €60.000/jr toont.
    const profile: KernelAdapterProfile = {
      date_of_birth: DOB,
      net_monthly_income: 0,
      estimated_monthly_expenses: 2500,
    }
    expect(buildInkomenUitgaven(profile).nettoJaarinkomen).toBe(0)
  })

  it('buildConvergentieAdapterProfile mapt de bedragen 1-op-1 door — de grondslag hoort vóór dit punt te zijn opgelost', () => {
    const raw: ConvergentieRawProfileRow = {
      date_of_birth: DOB,
      net_monthly_income: 0,
      estimated_monthly_expenses: 2000,
    }
    const mapped = buildConvergentieAdapterProfile(raw)
    expect(mapped.net_monthly_income).toBe(0)
    expect(buildInkomenUitgaven(mapped).nettoJaarinkomen).toBe(0)
  })
})

describe('withResolvedKernelBedragen — de injectie die het gat dicht (ADR 0103)', () => {
  const EFFECTIEF = { monthlyIncome: 5000, monthlyExpenses: 3000 }

  it("grondslag 'budget' met een leeg net_monthly_income levert nu €60.000 i.p.v. €0", () => {
    const raw: ConvergentieRawProfileRow = {
      date_of_birth: DOB,
      net_monthly_income: 0, // nooit ingevuld — normaal buiten de 'manual'-grondslag
      estimated_monthly_expenses: 2500,
    }
    const injected = withResolvedKernelBedragen(raw, EFFECTIEF)
    const params = buildInkomenUitgaven(buildConvergentieAdapterProfile(injected))
    expect(params.nettoJaarinkomen).toBe(60_000)
    expect(params.nettoJaaruitgaven).toBe(36_000)
  })

  it('een STALE handmatig bedrag wint niet meer van de actieve grondslag', () => {
    // Gebruiker vulde ooit €3.000 handmatig in en stapte over op budgetten die
    // inmiddels €5.000/mnd optellen. Vóór de injectie bleef de kernel op €3.000.
    const raw: ConvergentieRawProfileRow = {
      date_of_birth: DOB,
      net_monthly_income: 3000,
      estimated_monthly_expenses: 2500,
    }
    const injected = buildConvergentieAdapterProfile(withResolvedKernelBedragen(raw, EFFECTIEF))
    expect(buildInkomenUitgaven(injected).nettoJaarinkomen).toBe(60_000)
    expect(buildInkomenUitgaven(injected).nettoJaarinkomen).not.toBe(36_000)
  })

  it('IDEMPOTENT: loader en hook mogen hem allebei toepassen zonder tweede resolutie', () => {
    const raw: ConvergentieRawProfileRow = {
      date_of_birth: DOB,
      net_monthly_income: 0,
      estimated_monthly_expenses: 2500,
    }
    const once = withResolvedKernelBedragen(raw, EFFECTIEF)
    const twice = withResolvedKernelBedragen(once, EFFECTIEF)
    expect(twice).toEqual(once)
  })

  it('raakt geen enkel ander profielveld aan', () => {
    const raw: ConvergentieRawProfileRow = {
      date_of_birth: DOB,
      net_monthly_income: 0,
      estimated_monthly_expenses: 2500,
      yearly_essential_expenses: 24_000,
      retirement_expense_method: 'essential_budgets',
    } as ConvergentieRawProfileRow
    const injected = withResolvedKernelBedragen(raw, EFFECTIEF)
    expect(injected.yearly_essential_expenses).toBe(24_000)
    expect(injected.retirement_expense_method).toBe('essential_budgets')
    expect(injected.date_of_birth).toBe(DOB)
  })

  it("de pensioenuitgave-methode 'current_income' beweegt mee met de geïnjecteerde grondslag", () => {
    // Bij die methode ÍS het jaarinkomen de pensioenuitgave en dus het FIRE-doel;
    // dit is de grootste getalsverschuiving van de injectie.
    const raw = {
      date_of_birth: DOB,
      net_monthly_income: 0,
      estimated_monthly_expenses: 2500,
      retirement_expense_method: 'current_income',
    } as ConvergentieRawProfileRow
    expect(
      buildInkomenUitgaven(buildConvergentieAdapterProfile(raw)).uitgaveNaPensioenPerJaar,
    ).toBe(30_000) // terugval op jaaruitgaven
    const injected = buildConvergentieAdapterProfile(withResolvedKernelBedragen(raw, EFFECTIEF))
    expect(buildInkomenUitgaven(injected).uitgaveNaPensioenPerJaar).toBe(60_000)
  })
})
