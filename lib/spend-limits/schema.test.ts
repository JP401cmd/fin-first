/**
 * Contract-tests voor de zod-schema's van de mutatie- en preview-routes
 * (lib/spend-limits/schema.ts).
 *
 * Waarom hier een eigen suite staat: deze twee schema's zijn het ENIGE punt waar
 * een client-body wordt afgekeurd, en hun validatiemeldingen reizen letterlijk
 * naar het scherm (ADR 0044: `parseBody` geeft de zod-melding als 400-tekst
 * terug). Een gewijzigde literal is dus een gewijzigde UI-tekst — AC-B5-02 pint
 * er één expliciet vast. En de preview is een DISCRIMINATED UNION: valt die stil
 * terug op één tak, dan kan een budget-regel als tegenpartij-regel worden
 * gelezen (of andersom) en toont de preview iets anders dan de pot straks telt.
 *
 * LET OP bij het uitbreiden van dit bestand: `copy.test.ts` scant heel
 * `lib/spend-limits/**` op naam-dragende literals in CODE. De weergavenaam van
 * de functionaliteit hoort dus nergens in een string hier — alleen in comments.
 */

import { describe, it, expect } from 'vitest'
import { SpendLimitInputSchema, spendLimitPreviewSchema } from './schema'

const UUID = '11111111-2222-4333-8444-555555555555'
const UUID_2 = '99999999-8888-4777-8666-555555555555'

/** De melding(en) bij één veldpad, of `[]` als dat pad geen fout gaf. */
function messagesFor(issues: { path: PropertyKey[]; message: string }[], path: string): string[] {
  return issues.filter((i) => i.path.join('.') === path).map((i) => i.message)
}

// ── AC-B5-02: de naam-melding is een letterlijke UI-tekst ───────────────────

describe('SpendLimitInputSchema — naam (AC-B5-02)', () => {
  const budgetBody = (name: unknown) => ({
    ruleType: 'budget',
    name,
    limitAmount: 100,
    budgetId: UUID,
  })
  const counterpartyBody = (name: unknown) => ({
    ruleType: 'counterparty',
    name,
    limitAmount: 100,
    counterpartyLabel: 'Shell',
  })

  it('een lege naam geeft exact de melding "Geef een naam op"', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody(''))
    expect(res.success).toBe(false)
    // Bewust de LITERAL en niet een constante uit het schema: de test moet
    // omvallen als iemand de tekst herschrijft, niet meebewegen.
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Geef een naam op'])
  })

  it('alleen witruimte telt als leeg (trim vóór de minimumlengte)', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody('   '))
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Geef een naam op'])
  })

  it('dezelfde melding in BEIDE takken van de union', () => {
    // De twee takken herhalen `NAME` uit één constante; zou iemand er één
    // inlinen met een andere tekst, dan verschilt de UI per regelsoort.
    const res = SpendLimitInputSchema.safeParse(counterpartyBody(''))
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Geef een naam op'])
  })

  it('een te lange naam heeft zijn eigen melding (geen stille afkap)', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody('x'.repeat(61)))
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Naam is te lang'])
  })

  it('een geldige naam wordt getrimd doorgegeven', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody('  Boodschappen  '))
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({ name: 'Boodschappen', period: 'month', isActive: true })
  })
})

// ── De vorm van de preview-union ────────────────────────────────────────────

describe('spendLimitPreviewSchema — discriminated-union-vormen', () => {
  it('tegenpartij-tak: minimale body parst, met de defaults van het hoofdschema', () => {
    const res = spendLimitPreviewSchema.safeParse({
      ruleType: 'counterparty',
      counterpartyLabel: '  Shell  ',
    })
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({
      ruleType: 'counterparty',
      counterpartyLabel: 'Shell',
      period: 'month',
    })
    // De tegenpartij-SLEUTEL komt bewust NIET uit de body (de server leidt 'm af).
    expect(res.data).not.toHaveProperty('counterpartyKey')
  })

  it('budget-tak: minimale body parst, includeChildBudgets staat standaard AAN', () => {
    const res = spendLimitPreviewSchema.safeParse({ ruleType: 'budget', budgetId: UUID })
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({
      ruleType: 'budget',
      budgetId: UUID,
      includeChildBudgets: true,
      period: 'month',
    })
  })

  it('elke tak houdt UITSLUITEND zijn eigen velden over', () => {
    // Een budget-body met een tegenpartij-label erin mag dat label niet
    // meedragen: anders kan een client een tweede matchregel smokkelen die de
    // preview wél ziet en de pot straks niet.
    const res = spendLimitPreviewSchema.safeParse({
      ruleType: 'budget',
      budgetId: UUID,
      counterpartyLabel: 'Shell',
    })
    expect(res.success).toBe(true)
    expect(res.data).not.toHaveProperty('counterpartyLabel')
  })

  it('de discriminator kiest de tak — een body met de velden van de ándere tak faalt', () => {
    const res = spendLimitPreviewSchema.safeParse({ ruleType: 'counterparty', budgetId: UUID })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'counterpartyLabel')).toHaveLength(1)
  })

  it('een onbekende of ontbrekende ruleType wordt op de discriminator afgekeurd', () => {
    for (const body of [{ ruleType: 'iets_anders' }, {}]) {
      const res = spendLimitPreviewSchema.safeParse(body)
      expect(res.success).toBe(false)
      expect(messagesFor(res.error!.issues, 'ruleType')).toHaveLength(1)
    }
  })

  it('een leeg tegenpartij-label geeft zijn eigen melding', () => {
    const res = spendLimitPreviewSchema.safeParse({ ruleType: 'counterparty', counterpartyLabel: '  ' })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'counterpartyLabel')).toEqual(['Geef een tegenpartij op'])
  })

  it('een budgetId dat geen uuid is geeft zijn eigen melding', () => {
    const res = spendLimitPreviewSchema.safeParse({ ruleType: 'budget', budgetId: 'b1' })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'budgetId')).toEqual(['Kies een geldig budget'])
  })

  it('excludeLimitId is optioneel én nullable, maar moet een uuid zijn als hij er is', () => {
    const metId = spendLimitPreviewSchema.safeParse({
      ruleType: 'budget',
      budgetId: UUID,
      excludeLimitId: UUID_2,
    })
    expect(metId.success).toBe(true)
    expect(metId.data).toMatchObject({ excludeLimitId: UUID_2 })

    expect(
      spendLimitPreviewSchema.safeParse({ ruleType: 'budget', budgetId: UUID, excludeLimitId: null })
        .success,
    ).toBe(true)

    const fout = spendLimitPreviewSchema.safeParse({
      ruleType: 'budget',
      budgetId: UUID,
      excludeLimitId: 'nope',
    })
    expect(fout.success).toBe(false)
    expect(messagesFor(fout.error!.issues, 'excludeLimitId')).toEqual(['Ongeldig ID'])
  })

  it('period accepteert exact de drie kalenderperiodes van de motor', () => {
    for (const period of ['month', 'quarter', 'year'] as const) {
      const res = spendLimitPreviewSchema.safeParse({ ruleType: 'budget', budgetId: UUID, period })
      expect(res.success).toBe(true)
      expect(res.data).toMatchObject({ period })
    }
    expect(
      spendLimitPreviewSchema.safeParse({ ruleType: 'budget', budgetId: UUID, period: 'week' })
        .success,
    ).toBe(false)
  })
})

// ── De bewuste asymmetrie tussen opslaan en previewen ───────────────────────

describe('preview-minimum vs. opslag-minimum (bewuste asymmetrie)', () => {
  it('één teken mag in de PREVIEW, maar niet bij het OPSLAAN', () => {
    // Halverwege het typen mag een te kort label geen validatiefout geven maar
    // een expliciete "te kort om te matchen"-uitkomst; bij opslaan is twee
    // tekens het minimum. Deze twee grenzen horen bij elkaar en drijven anders
    // uit elkaar.
    expect(
      spendLimitPreviewSchema.safeParse({ ruleType: 'counterparty', counterpartyLabel: 'S' })
        .success,
    ).toBe(true)

    const opslaan = SpendLimitInputSchema.safeParse({
      ruleType: 'counterparty',
      name: 'Brandstof',
      limitAmount: 100,
      counterpartyLabel: 'S',
    })
    expect(opslaan.success).toBe(false)
    expect(messagesFor(opslaan.error!.issues, 'counterpartyLabel')).toEqual([
      'Geef minstens twee tekens om op te matchen',
    ])
  })
})
