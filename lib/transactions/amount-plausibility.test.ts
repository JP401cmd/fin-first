/**
 * Unit-tests voor de plausibiliteitsgrens op transactiebedragen (UR2-18).
 *
 * De grens is een ZACHTE wedervraag, geen cap. Wat hier geborgd wordt:
 *  1. de drempel bijt op het gemelde bedrag (99.999.999) en op de grens zelf;
 *  2. hij is tekenloos — een tikfout kent geen richting;
 *  3. hij laat gewone bedragen ongemoeid (geen wedervraag op €999,99);
 *  4. de import-samenvatting telt alleen AANGEVINKTE rijen.
 */
import { describe, it, expect } from 'vitest'
import {
  TRANSACTION_AMOUNT_CONFIRM_THRESHOLD,
  needsTransactionAmountConfirmation,
  summarizeImplausibleAmounts,
} from './amount-plausibility'

describe('needsTransactionAmountConfirmation', () => {
  it('vraagt door op het gemelde bedrag uit UR2-18', () => {
    expect(needsTransactionAmountConfirmation(99_999_999)).toBe(true)
  })

  it('vraagt door vanaf de drempel (inclusief)', () => {
    expect(needsTransactionAmountConfirmation(TRANSACTION_AMOUNT_CONFIRM_THRESHOLD)).toBe(true)
    expect(needsTransactionAmountConfirmation(TRANSACTION_AMOUNT_CONFIRM_THRESHOLD - 0.01)).toBe(false)
  })

  it('is tekenloos — een uitgave van dezelfde omvang vraagt net zo goed door', () => {
    expect(needsTransactionAmountConfirmation(-99_999_999)).toBe(true)
    expect(needsTransactionAmountConfirmation(-TRANSACTION_AMOUNT_CONFIRM_THRESHOLD)).toBe(true)
  })

  it('laat een gewoon bedrag ongemoeid — de tikfout, niet de boodschappen', () => {
    expect(needsTransactionAmountConfirmation(999.99)).toBe(false)
    expect(needsTransactionAmountConfirmation(0)).toBe(false)
  })

  it('vraagt niet door op een onleesbaar bedrag (die weigert de vorm-validatie al)', () => {
    expect(needsTransactionAmountConfirmation(Number.NaN)).toBe(false)
    expect(needsTransactionAmountConfirmation(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('summarizeImplausibleAmounts', () => {
  it('telt alleen aangevinkte rijen en houdt het grootste bedrag vast', () => {
    const summary = summarizeImplausibleAmounts([
      { amount: -12.5, skipImport: false },
      { amount: -123_456, skipImport: false },
      { amount: 99_999_999, skipImport: false },
      { amount: 250_000, skipImport: true },
    ])
    expect(summary).toEqual({ count: 2, largest: 99_999_999 })
  })

  it('geeft niets terug wanneer alle grote rijen zijn uitgevinkt', () => {
    const summary = summarizeImplausibleAmounts([
      { amount: 500_000, skipImport: true },
      { amount: -80.2, skipImport: false },
    ])
    expect(summary).toEqual({ count: 0, largest: 0 })
  })

  it('meet het grootste bedrag absoluut, ook als de grootste een uitgave is', () => {
    const summary = summarizeImplausibleAmounts([
      { amount: 150_000, skipImport: false },
      { amount: -900_000, skipImport: false },
    ])
    expect(summary).toEqual({ count: 2, largest: 900_000 })
  })
})
