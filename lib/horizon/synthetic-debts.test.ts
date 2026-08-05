/**
 * Tests voor de gedeelde map met synthetische schuldpotten.
 *
 * Pint de regressie uit de review: een `debtBalances`-sleutel die géén `Debt`-rij
 * heeft ('opeethypotheek', 'tekort-lening') mag NOOIT meer als UUID-afkapping
 * ("opeethyp", "tekort-l") in beeld komen.
 */
import { describe, it, expect } from 'vitest'
import {
  SYNTHETIC_DEBT_LABELS,
  isSyntheticDebtKey,
  syntheticDebtDescriptor,
  resolveDebtLabel,
  type SyntheticDebtKey,
} from './synthetic-debts'

const SYNTHETIC_KEYS: SyntheticDebtKey[] = ['tekort-lening', 'opeethypotheek']

describe('synthetische schuldpotten — herkenning', () => {
  it('herkent beide modelpotten', () => {
    for (const key of SYNTHETIC_KEYS) {
      expect(isSyntheticDebtKey(key)).toBe(true)
      expect(syntheticDebtDescriptor(key)).not.toBeNull()
    }
  })

  it('herkent een gewoon Debt-id niet als modelpot', () => {
    expect(isSyntheticDebtKey('3f2a91c8-0000-4f1a-9c2b-77d0e6b1a123')).toBe(false)
    expect(syntheticDebtDescriptor('3f2a91c8-0000-4f1a-9c2b-77d0e6b1a123')).toBeNull()
  })
})

describe('resolveDebtLabel — geen afkapping meer voor modelpotten', () => {
  it('geeft "Opeethypotheek" i.p.v. de afkapping "opeethyp"', () => {
    expect(resolveDebtLabel('opeethypotheek', {})).toBe('Opeethypotheek')
    expect(resolveDebtLabel('opeethypotheek', {})).not.toBe('opeethypotheek'.slice(0, 8))
  })

  it('geeft "Tekort-lening" i.p.v. de afkapping "tekort-l"', () => {
    expect(resolveDebtLabel('tekort-lening', {})).toBe('Tekort-lening')
    expect(resolveDebtLabel('tekort-lening', {})).not.toBe('tekort-lening'.slice(0, 8))
  })

  it('laat een echte schuldnaam altijd winnen', () => {
    const map = { 'hyp-1': 'Hypotheek Dorpsstraat' }
    expect(resolveDebtLabel('hyp-1', map)).toBe('Hypotheek Dorpsstraat')
  })

  it('valt alleen bij een écht onbekend id terug op de UUID-afkapping', () => {
    expect(resolveDebtLabel('3f2a91c8-0000-4f1a-9c2b-77d0e6b1a123', {})).toBe('3f2a91c8')
  })

  it('geen enkel modelpot-label is een prefix-afkapping van zijn sleutel', () => {
    for (const key of SYNTHETIC_KEYS) {
      const label = SYNTHETIC_DEBT_LABELS[key].name
      expect(label).not.toBe(key.slice(0, 8))
      expect(label.length).toBeGreaterThan(8)
    }
  })
})
