import { describe, it, expect } from 'vitest'
import { draftToSaleConfig, saleConfigToDraft, type SaleConfigDraft } from './sale-config-draft'

/**
 * Het invoerconcept van de verkoopinstelling — gedeeld door het bezittingenformulier en
 * stap 4 van de plan-review (TPR-15). Pint het gedrag vast dat het formulier vóór de
 * extractie inline had.
 */

const leeg: SaleConfigDraft = {
  stand: 'wanneer_nodig',
  triggerAge: '',
  triggerDate: '',
  momentMode: 'leeftijd',
  costsPct: '',
  payoffDebtIds: [],
}

describe('saleConfigToDraft', () => {
  it('zonder config: wanneer_nodig met lege velden', () => {
    expect(saleConfigToDraft(null)).toEqual(leeg)
  })

  it('vast moment op datum: datum-modus, kosten in procenten', () => {
    expect(
      saleConfigToDraft({ stand: 'vast_moment', triggerDate: '2040-01-01', salesCostsPct: 0.065, payoffDebtIds: ['d1'] }),
    ).toEqual({
      stand: 'vast_moment',
      triggerAge: '',
      triggerDate: '2040-01-01',
      momentMode: 'datum',
      costsPct: '6.5',
      payoffDebtIds: ['d1'],
    })
  })

  it('niet verkopen: geen restvelden', () => {
    expect(saleConfigToDraft({ stand: 'niet_verkopen' })).toEqual({ ...leeg, stand: 'niet_verkopen' })
  })
})

describe('draftToSaleConfig', () => {
  it('niet verkopen negeert ingevulde velden', () => {
    expect(draftToSaleConfig({ ...leeg, stand: 'niet_verkopen', triggerAge: '70', costsPct: '5' })).toEqual({
      stand: 'niet_verkopen',
    })
  })

  it('vast moment op leeftijd; lege leeftijd wordt null', () => {
    expect(draftToSaleConfig({ ...leeg, stand: 'vast_moment', triggerAge: '67' })).toEqual({
      stand: 'vast_moment',
      triggerAge: 67,
    })
    expect(draftToSaleConfig({ ...leeg, stand: 'vast_moment' })).toEqual({ stand: 'vast_moment', triggerAge: null })
  })

  it('vast moment op datum laat de leeftijd weg', () => {
    expect(
      draftToSaleConfig({ ...leeg, stand: 'vast_moment', momentMode: 'datum', triggerAge: '67', triggerDate: '2040-05-01' }),
    ).toEqual({ stand: 'vast_moment', triggerDate: '2040-05-01' })
  })

  it('wanneer nodig: optionele velden alleen als ingevuld; kosten % → fractie', () => {
    expect(draftToSaleConfig(leeg)).toEqual({ stand: 'wanneer_nodig' })
    expect(draftToSaleConfig({ ...leeg, triggerAge: '75', costsPct: '6', payoffDebtIds: ['d1', 'd2'] })).toEqual({
      stand: 'wanneer_nodig',
      triggerAge: 75,
      salesCostsPct: 0.06,
      payoffDebtIds: ['d1', 'd2'],
    })
  })

  it('heen en terug is stabiel', () => {
    const cfg = { stand: 'wanneer_nodig', triggerAge: 72, salesCostsPct: 0.08 } as const
    expect(draftToSaleConfig(saleConfigToDraft(cfg))).toEqual(cfg)
  })
})
