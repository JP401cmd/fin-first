/**
 * Contract-tests voor de zod-schema's van de mutatie- en preview-routes
 * (lib/spend-limits/schema.ts).
 *
 * Waarom hier een eigen suite staat: deze twee schema's zijn het ENIGE punt waar
 * een client-body wordt afgekeurd, en hun validatiemeldingen reizen letterlijk
 * naar het scherm (ADR 0044: `parseBody` geeft de zod-melding als 400-tekst
 * terug). Een gewijzigde literal is dus een gewijzigde UI-tekst — AC-B5-02 pint
 * er één expliciet vast.
 *
 * ── DE UNION IS WEG, DE GRENZEN NIET (10-08-2026) ──────────────────────────
 * Tot fase 5 was dit een `discriminatedUnion('ruleType', …)`: een pot was óf een
 * budget-regel óf een tegenpartij-regel. Een regel mag nu beide dimensies dragen
 * (budget X ÉN tegenpartij Y), dus er valt niets meer te discrimineren. Wat
 * daarvoor in de plaats moet worden bewaakt is de REGEL-INVARIANT: minstens één
 * regel, en elke regel kiest minstens één ding — anders zou een lege regel op
 * álle zichtbare transacties matchen.
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

/** Een geldige minimale body met één budget-regel. */
const budgetBody = (name: unknown) => ({
  name,
  limitAmount: 100,
  rules: [{ budgetIds: [UUID] }],
})

/** Een geldige minimale body met één tegenpartij-regel. */
const counterpartyBody = (name: unknown) => ({
  name,
  limitAmount: 100,
  rules: [{ counterpartyLabels: ['Shell'] }],
})

// ── AC-B5-02: de naam-melding is een letterlijke UI-tekst ───────────────────

describe('SpendLimitInputSchema — naam (AC-B5-02)', () => {
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

  it('dezelfde melding ongeacht welke dimensie de regel gebruikt', () => {
    const res = SpendLimitInputSchema.safeParse(counterpartyBody(''))
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Geef een naam op'])
  })

  it('een te lange naam heeft zijn eigen melding (geen stille afkap)', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody('x'.repeat(61)))
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'name')).toEqual(['Naam is te lang'])
  })

  it('een geldige naam wordt getrimd doorgegeven, met de defaults erbij', () => {
    const res = SpendLimitInputSchema.safeParse(budgetBody('  Boodschappen  '))
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({ name: 'Boodschappen', period: 'month', isActive: true })
    // De subboom telt standaard mee — dezelfde default als vóór de regel-lijst.
    expect(res.data!.rules[0]).toMatchObject({
      budgetIds: [UUID],
      includeChildBudgets: true,
      counterpartyLabels: [],
    })
  })
})

// ── De regel-invariant ──────────────────────────────────────────────────────

describe('SpendLimitInputSchema — regels', () => {
  it('eist minstens één regel', () => {
    const res = SpendLimitInputSchema.safeParse({ name: 'Tanken', limitAmount: 100, rules: [] })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'rules')).toEqual(['Een grens heeft minstens één regel nodig'])
  })

  it('wijst een regel zonder enige dimensie af — die zou op álles matchen', () => {
    const res = SpendLimitInputSchema.safeParse({
      name: 'Tanken',
      limitAmount: 100,
      rules: [{ budgetIds: [], counterpartyLabels: [] }],
    })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'rules.0')).toEqual([
      'Kies minstens één budget of tegenpartij in elke regel',
    ])
  })

  it('aanvaardt meerdere waarden per dimensie én beide dimensies tegelijk', () => {
    const res = SpendLimitInputSchema.safeParse({
      name: 'Uit eten',
      limitAmount: 200,
      rules: [
        { budgetIds: [UUID, UUID_2] },
        { budgetIds: [UUID], counterpartyLabels: ['Gorillas', 'Getir'] },
      ],
    })
    expect(res.success).toBe(true)
    expect(res.data!.rules).toHaveLength(2)
    expect(res.data!.rules[1].counterpartyLabels).toEqual(['Gorillas', 'Getir'])
  })

  it('valideert elk budget-id afzonderlijk, met zijn eigen melding', () => {
    const res = SpendLimitInputSchema.safeParse({
      name: 'Tanken',
      limitAmount: 100,
      rules: [{ budgetIds: [UUID, 'b1'] }],
    })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'rules.0.budgetIds.1')).toEqual(['Kies een geldig budget'])
  })

  it('houdt het opslag-minimum van twee tekens per tegenpartij-label vast', () => {
    const res = SpendLimitInputSchema.safeParse({
      name: 'Brandstof',
      limitAmount: 100,
      rules: [{ counterpartyLabels: ['S'] }],
    })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'rules.0.counterpartyLabels.0')).toEqual([
      'Geef minstens twee tekens om op te matchen',
    ])
  })

  it('period accepteert exact de vijf periodesoorten van de motor', () => {
    for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const) {
      const res = SpendLimitInputSchema.safeParse({ ...budgetBody('Tanken'), period })
      expect(res.success).toBe(true)
      expect(res.data).toMatchObject({ period })
    }
    expect(
      SpendLimitInputSchema.safeParse({ ...budgetBody('Tanken'), period: 'decennium' }).success,
    ).toBe(false)
  })
})

// ── De vorm van de preview-body ─────────────────────────────────────────────

describe('spendLimitPreviewSchema', () => {
  it('minimale tegenpartij-body parst, met de defaults van het hoofdschema', () => {
    const res = spendLimitPreviewSchema.safeParse({ counterpartyLabels: ['  Shell  '] })
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({
      counterpartyLabels: ['Shell'],
      budgetIds: [],
      period: 'month',
    })
    // De tegenpartij-SLEUTEL komt bewust NIET uit de body (de server leidt 'm af).
    expect(res.data).not.toHaveProperty('counterpartyKeys')
  })

  it('minimale budget-body parst, includeChildBudgets staat standaard AAN', () => {
    const res = spendLimitPreviewSchema.safeParse({ budgetIds: [UUID] })
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({
      budgetIds: [UUID],
      includeChildBudgets: true,
      counterpartyLabels: [],
      period: 'month',
    })
  })

  it('aanvaardt een LEGE body — een half ingevuld formulier mag niet schreeuwen', () => {
    const res = spendLimitPreviewSchema.safeParse({})
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({ budgetIds: [], counterpartyLabels: [] })
  })

  it('een leeg tegenpartij-label geeft zijn eigen melding', () => {
    const res = spendLimitPreviewSchema.safeParse({ counterpartyLabels: ['  '] })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'counterpartyLabels.0')).toEqual([
      'Geef een tegenpartij op',
    ])
  })

  it('een budgetId dat geen uuid is geeft zijn eigen melding', () => {
    const res = spendLimitPreviewSchema.safeParse({ budgetIds: ['b1'] })
    expect(res.success).toBe(false)
    expect(messagesFor(res.error!.issues, 'budgetIds.0')).toEqual(['Kies een geldig budget'])
  })

  it('excludeLimitId is optioneel én nullable, maar moet een uuid zijn als hij er is', () => {
    const metId = spendLimitPreviewSchema.safeParse({ budgetIds: [UUID], excludeLimitId: UUID_2 })
    expect(metId.success).toBe(true)
    expect(metId.data).toMatchObject({ excludeLimitId: UUID_2 })

    expect(
      spendLimitPreviewSchema.safeParse({ budgetIds: [UUID], excludeLimitId: null }).success,
    ).toBe(true)

    const fout = spendLimitPreviewSchema.safeParse({ budgetIds: [UUID], excludeLimitId: 'nope' })
    expect(fout.success).toBe(false)
    expect(messagesFor(fout.error!.issues, 'excludeLimitId')).toEqual(['Ongeldig ID'])
  })

  it('period accepteert exact de vijf periodesoorten van de motor', () => {
    for (const period of ['day', 'week', 'month', 'quarter', 'year'] as const) {
      const res = spendLimitPreviewSchema.safeParse({ budgetIds: [UUID], period })
      expect(res.success).toBe(true)
      expect(res.data).toMatchObject({ period })
    }
    expect(
      spendLimitPreviewSchema.safeParse({ budgetIds: [UUID], period: 'decennium' }).success,
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
    expect(spendLimitPreviewSchema.safeParse({ counterpartyLabels: ['S'] }).success).toBe(true)

    const opslaan = SpendLimitInputSchema.safeParse({
      name: 'Brandstof',
      limitAmount: 100,
      rules: [{ counterpartyLabels: ['S'] }],
    })
    expect(opslaan.success).toBe(false)
    expect(messagesFor(opslaan.error!.issues, 'rules.0.counterpartyLabels.0')).toEqual([
      'Geef minstens twee tekens om op te matchen',
    ])
  })
})
