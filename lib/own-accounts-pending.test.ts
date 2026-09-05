import { describe, it, expect } from 'vitest'
import {
  PENDING_TRANSFER_REVIEW_CAP,
  collectPendingOwnAccountTransfers,
  isPendingOwnAccountTransfer,
  type PendingTransferCandidate,
} from './own-accounts-pending'
import { buildOwnAccountIdentifiers } from './own-accounts'

// UR3-02. De kern-regressie: een overboeking naar een eigen spaarrekening die
// bij import op een gewoon budget belandde, moet ZICHTBAAR blijven voor de
// herstelbanner. De oude conditie sloot 'm uit zodra `budget_id` gezet was,
// waardoor de enige laagdrempelige correctieroute onbereikbaar werd.

const ids = buildOwnAccountIdentifiers(
  [{ match_type: 'name', match_value: 'paypal' }],
  ['NL20INGB0001234567'],
)

function tx(overrides: Partial<PendingTransferCandidate> = {}): PendingTransferCandidate {
  return {
    budget_id: null,
    category_source: 'rule',
    counterparty_iban: 'NL20INGB0001234567',
    counterparty_name: 'Eigen spaarrekening',
    transaction_type: null,
    ...overrides,
  }
}

describe('isPendingOwnAccountTransfer', () => {
  it('herkent een eigen overboeking zonder budget', () => {
    expect(isPendingOwnAccountTransfer(tx(), ids)).toBe(true)
  })

  it('REGRESSIE UR3-02: herkent een eigen overboeking die al op een gewoon budget staat', () => {
    expect(
      isPendingOwnAccountTransfer(tx({ budget_id: 'budget-sparen', category_source: 'rule' }), ids),
    ).toBe(true)
  })

  it('zwijgt over een transactie waar de gebruiker zelf een budget bij koos', () => {
    expect(
      isPendingOwnAccountTransfer(tx({ budget_id: 'budget-sparen', category_source: 'manual' }), ids),
    ).toBe(false)
  })

  it('zwijgt over een al bevestigde verschuiving', () => {
    expect(isPendingOwnAccountTransfer(tx({ transaction_type: 'transfer' }), ids)).toBe(false)
    expect(isPendingOwnAccountTransfer(tx({ transaction_type: 'joint_transfer' }), ids)).toBe(false)
  })

  it('laat een echte uitgave aan een derde ongemoeid', () => {
    expect(
      isPendingOwnAccountTransfer(
        tx({ counterparty_iban: 'NL44RABO0123456789', counterparty_name: 'Albert Heijn' }),
        ids,
      ),
    ).toBe(false)
  })

  it('herkent een eigen rekening zonder IBAN via het naam-patroon', () => {
    expect(
      isPendingOwnAccountTransfer(
        tx({ counterparty_iban: null, counterparty_name: 'PayPal (Europe) S.a.r.l.' }),
        ids,
      ),
    ).toBe(true)
  })

  it('slaat een gedeelde partnerrij over — die is voor deze kijker niet te muteren', () => {
    // De UPDATE-policy op transactions is eigen-rij; een partnerrij aanbieden
    // ter bevestiging levert een knop die nul rijen raakt.
    expect(isPendingOwnAccountTransfer(tx({ user_id: 'partner' }), ids, 'ik')).toBe(false)
    expect(isPendingOwnAccountTransfer(tx({ user_id: 'ik' }), ids, 'ik')).toBe(true)
  })

  it('slaat een transactie zonder tegenpartij over', () => {
    expect(
      isPendingOwnAccountTransfer(tx({ counterparty_iban: null, counterparty_name: null }), ids),
    ).toBe(false)
  })
})

describe('collectPendingOwnAccountTransfers', () => {
  it('meldt het volledige aantal maar levert hoogstens de cap door', () => {
    const many = Array.from({ length: PENDING_TRANSFER_REVIEW_CAP + 7 }, () => tx())
    const { items, total } = collectPendingOwnAccountTransfers(many, ids)
    expect(total).toBe(PENDING_TRANSFER_REVIEW_CAP + 7)
    expect(items).toHaveLength(PENDING_TRANSFER_REVIEW_CAP)
  })

  it('telt alleen kandidaten, niet de rest van de maand', () => {
    const { items, total } = collectPendingOwnAccountTransfers(
      [
        tx(),
        tx({ counterparty_iban: 'NL44RABO0123456789', counterparty_name: 'Albert Heijn' }),
        tx({ transaction_type: 'transfer' }),
      ],
      ids,
    )
    expect(total).toBe(1)
    expect(items).toHaveLength(1)
  })
})
