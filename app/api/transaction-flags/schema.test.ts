import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CreateTransactionFlagSchema, UpdateTransactionFlagSchema } from './schema'
import { TRANSACTION_FLAG_NOTE_MAX } from '@/lib/household/transaction-flags'

describe('CreateTransactionFlagSchema', () => {
  it('stript server-bepaalde velden: household_id / flagged_by / resolved_* komen er niet doorheen', () => {
    const parsed = CreateTransactionFlagSchema.parse({
      transactionId: randomUUID(),
      note: ' hoort dit bij de vakantiepot? ',
      household_id: 'ander-huishouden',
      flagged_by: 'iemand-anders',
      resolved_by: 'x',
      resolved_at: 'y',
      status: 'resolved',
    })
    expect(Object.keys(parsed).sort()).toEqual(['note', 'transactionId'])
    expect(parsed.note).toBe('hoort dit bij de vakantiepot?')
  })

  it('normaliseert een lege of witruimte-notitie naar null', () => {
    expect(CreateTransactionFlagSchema.parse({ transactionId: randomUUID(), note: '   ' }).note).toBeNull()
    expect(CreateTransactionFlagSchema.parse({ transactionId: randomUUID() }).note).toBeUndefined()
  })

  it('weigert een ongeldig id en een te lange notitie (spiegelt de DB-CHECK)', () => {
    expect(CreateTransactionFlagSchema.safeParse({ transactionId: 'nope' }).success).toBe(false)
    expect(
      CreateTransactionFlagSchema.safeParse({
        transactionId: randomUUID(),
        note: 'x'.repeat(TRANSACTION_FLAG_NOTE_MAX + 1),
      }).success,
    ).toBe(false)
    expect(
      CreateTransactionFlagSchema.safeParse({
        transactionId: randomUUID(),
        note: 'x'.repeat(TRANSACTION_FLAG_NOTE_MAX),
      }).success,
    ).toBe(true)
  })
})

describe('UpdateTransactionFlagSchema', () => {
  it('accepteert alleen status open|resolved en/of een notitie', () => {
    expect(UpdateTransactionFlagSchema.safeParse({ id: randomUUID(), status: 'resolved' }).success).toBe(true)
    expect(UpdateTransactionFlagSchema.safeParse({ id: randomUUID(), note: 'later' }).success).toBe(true)
    expect(UpdateTransactionFlagSchema.safeParse({ id: randomUUID(), status: 'klaar' }).success).toBe(false)
  })

  it('weigert een verzoek zonder status én zonder notitie', () => {
    expect(UpdateTransactionFlagSchema.safeParse({ id: randomUUID() }).success).toBe(false)
    expect(UpdateTransactionFlagSchema.safeParse({ id: randomUUID(), resolved_by: 'x' }).success).toBe(false)
  })
})
