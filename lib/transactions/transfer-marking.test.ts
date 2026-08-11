/**
 * Unit- én PARITYtest voor het canonieke trio.
 *
 * De gedragstabel hieronder is dezelfde die `components/app/transaction-form.test.tsx`
 * op het gerénderde formulier afdwingt. Dat die twee overeenkomen is niet
 * cosmetisch: `isRealAggRow` bepaalt UITSLUITEND op `transaction_type` of een
 * boeking meetelt in inkomsten, uitgaven, spaarquote, vrijheids-% en de
 * FIRE-projectie. Zouden het formulier en de bulkroute elk hun eigen versie van
 * deze regel dragen, dan hangt het van het gebruikte scherm af of een
 * overboeking als verschuiving of als uitgave telt — dat is de drift die AC7/AC8
 * bewaken.
 *
 * De laatste `describe` is daarom een BRONtest: hij faalt zodra iemand de regel
 * opnieuw in het formulier inlijnt. Een gedragstest zou dat níét merken (het
 * gedrag blijft immers hetzelfde tot de kopieën uiteenlopen) — en juist dát
 * moment wil je vóór zijn.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TRANSFER_TYPES,
  isTransferType,
  collectEigenRekeningBudgetIds,
  transferMarkingFor,
} from './transfer-marking'
import { BUDGET_SLUGS } from '@/lib/budget-data'

describe('isTransferType', () => {
  it('kent beide verschuivings-typen', () => {
    expect(isTransferType('transfer')).toBe(true)
    expect(isTransferType('joint_transfer')).toBe(true)
  })

  it('rekent importherkomst NIET als verschuiving', () => {
    expect(isTransferType('DEBIT')).toBe(false)
    expect(isTransferType('payment')).toBe(false)
    expect(isTransferType(null)).toBe(false)
    expect(isTransferType(undefined)).toBe(false)
  })

  it('spiegelt de typelijst van isRealAggRow', () => {
    expect([...TRANSFER_TYPES].sort()).toEqual(['joint_transfer', 'transfer'])
  })
})

describe('collectEigenRekeningBudgetIds', () => {
  it('pakt zowel de hoofdpost als de subpost', () => {
    const ids = collectEigenRekeningBudgetIds([
      { id: 'parent', slug: BUDGET_SLUGS.EIGEN_REKENING },
      { id: 'sub', slug: BUDGET_SLUGS.EIGEN_REKENING_SUB },
      { id: 'boodschappen', slug: 'boodschappen' },
      { id: 'zonder-slug', slug: null },
    ])
    expect([...ids].sort()).toEqual(['parent', 'sub'])
  })
})

describe('transferMarkingFor', () => {
  it('schrijft het canonieke trio bij een boeking op Eigen rekening (AC7)', () => {
    expect(transferMarkingFor({ targetsEigenRekening: true, currentType: null })).toEqual({
      category_source: 'transfer',
      transaction_type: 'transfer',
    })
  })

  it('wist de markering wanneer een verschuiving een gewoon budget krijgt (AC8)', () => {
    expect(transferMarkingFor({ targetsEigenRekening: false, currentType: 'transfer' })).toEqual({
      category_source: 'manual',
      transaction_type: null,
    })
    expect(transferMarkingFor({ targetsEigenRekening: false, currentType: 'joint_transfer' })).toEqual({
      category_source: 'manual',
      transaction_type: null,
    })
  })

  it('LAAT transaction_type weg bij een gewone budgetwijziging — importherkomst blijft', () => {
    const marking = transferMarkingFor({ targetsEigenRekening: false, currentType: 'DEBIT' })
    expect(marking).toEqual({ category_source: 'manual' })
    // De sleutel moet ONTBREKEN, niet op undefined staan: een `{ transaction_type:
    // undefined }` zou bij het spreaden in een UPDATE-payload alsnog als kolom
    // kunnen meeliften.
    expect('transaction_type' in marking).toBe(false)
  })

  it('doet hetzelfde wanneer het huidige type onbekend is', () => {
    expect(transferMarkingFor({ targetsEigenRekening: false })).toEqual({ category_source: 'manual' })
  })
})

describe('pariteit met het bewerkformulier', () => {
  const source = readFileSync(
    join(process.cwd(), 'components', 'app', 'transaction-form.tsx'),
    'utf8',
  )

  it('het formulier consumeert de gedeelde helper', () => {
    expect(source).toContain("from '@/lib/transactions/transfer-marking'")
    expect(source).toContain('transferMarkingFor(')
  })

  it('het formulier bouwt de markering niet zelf meer op', () => {
    // De drie vormen waarin de regel er eerder inline stond. Komt één ervan
    // terug, dan zijn er weer twee bronnen voor dezelfde beslissing.
    expect(source).not.toMatch(/const TRANSFER_TYPES\s*=/)
    expect(source).not.toMatch(/transaction_type\s*=\s*'transfer'/)
    expect(source).not.toMatch(/category_source:\s*\w+\s*\?\s*'transfer'/)
  })
})
