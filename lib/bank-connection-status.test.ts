import { describe, it, expect } from 'vitest'
import {
  deriveBankLinkHealth,
  deriveBankLinkState,
  bankLinkForAsset,
  bankLinkRowForAccount,
  bankLinkRowForAsset,
  BANK_LINK_EXPIRY_WARNING_DAYS,
  type BankLinkSignals,
  type CashBankLink,
} from './bank-connection-status'

/**
 * De afleiding over ALLE VIER de signalen. Dit is de enige plek waar
 * `bank_connection_accounts.is_active`, `bank_connections.status`,
 * `token_expires_at` en `last_synced_at` tot één toestand worden samengevoegd —
 * drie oppervlakken leunen erop, dus de regels staan hier vast en niet in een
 * component.
 */

const NOW = new Date('2026-07-30T12:00:00.000Z')

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

function signals(over: Partial<BankLinkSignals> = {}): BankLinkSignals {
  return {
    linkIsActive: true,
    connectionStatus: 'active',
    tokenExpiresAt: daysFromNow(60),
    lastSyncedAt: '2026-07-29T08:00:00.000Z',
    ...over,
  }
}

describe('deriveBankLinkHealth — signaal 1: bank_connection_accounts.is_active', () => {
  it('géén koppelrij → manual', () => {
    expect(deriveBankLinkState(null, NOW)).toBe('manual')
    expect(deriveBankLinkState(undefined, NOW)).toBe('manual')
  })

  it('zacht ontkoppeld (is_active = false) → manual, want dat is gebruikersintentie', () => {
    expect(deriveBankLinkState(signals({ linkIsActive: false }), NOW)).toBe('manual')
  })

  it('zacht ontkoppeld ÉN verlopen → nog steeds manual: intentie wint van storing', () => {
    // De belangrijkste regel van dit bestand. Wie deze omdraait laat een bewust
    // verbroken koppeling na 90 dagen alsnog om aandacht vragen — een melding
    // over iets dat de gebruiker zelf heeft uitgezet.
    const health = deriveBankLinkHealth(
      signals({ linkIsActive: false, connectionStatus: 'expired', tokenExpiresAt: daysFromNow(-5) }),
      NOW,
    )
    expect(health.state).toBe('manual')
    expect(health.expiringSoon).toBe(false)
    expect(health.daysUntilExpiry).toBeNull()
  })
})

describe('deriveBankLinkHealth — signaal 2: bank_connections.status', () => {
  it('active met een geldig token → linked', () => {
    expect(deriveBankLinkState(signals(), NOW)).toBe('linked')
  })

  it('expired → linked-broken', () => {
    expect(deriveBankLinkState(signals({ connectionStatus: 'expired' }), NOW)).toBe('linked-broken')
  })

  it('revoked → linked-broken, exact dezelfde toestand als expired', () => {
    // §0 van het plan: `revoked` wordt door geen enkel codepad geschreven, dus in
    // de UI is het één herstelpad met neutrale copy.
    const expired = deriveBankLinkHealth(signals({ connectionStatus: 'expired' }), NOW)
    const revoked = deriveBankLinkHealth(signals({ connectionStatus: 'revoked' }), NOW)
    expect(revoked).toEqual(expired)
  })

  it('een onbekende of ontbrekende status maakt een koppeling met geldig token niet kapot', () => {
    expect(deriveBankLinkState(signals({ connectionStatus: null }), NOW)).toBe('linked')
    expect(deriveBankLinkState(signals({ connectionStatus: 'pending' }), NOW)).toBe('linked')
  })
})

describe('deriveBankLinkHealth — signaal 3: token_expires_at', () => {
  it('verstreken autorisatie → linked-broken, ook als de status nog "active" zegt', () => {
    // Nodig náást de statuscontrole: `status` gaat pas op `expired` bij een
    // mislukte refresh, en die draait alleen als iemand synchroniseert.
    const health = deriveBankLinkHealth(
      signals({ connectionStatus: 'active', tokenExpiresAt: daysFromNow(-1) }),
      NOW,
    )
    expect(health.state).toBe('linked-broken')
    expect(health.expiringSoon).toBe(false)
  })

  it('binnen de vooraankondiging → linked mét expiringSoon (níet linked-broken)', () => {
    const health = deriveBankLinkHealth(
      signals({ tokenExpiresAt: daysFromNow(BANK_LINK_EXPIRY_WARNING_DAYS - 1) }),
      NOW,
    )
    expect(health.state).toBe('linked')
    expect(health.expiringSoon).toBe(true)
    expect(health.daysUntilExpiry).toBe(BANK_LINK_EXPIRY_WARNING_DAYS - 1)
  })

  it('precies op de drempel waarschuwt nog; één dag eerder in de tijd niet', () => {
    expect(
      deriveBankLinkHealth(signals({ tokenExpiresAt: daysFromNow(BANK_LINK_EXPIRY_WARNING_DAYS) }), NOW)
        .expiringSoon,
    ).toBe(true)
    expect(
      deriveBankLinkHealth(
        signals({ tokenExpiresAt: daysFromNow(BANK_LINK_EXPIRY_WARNING_DAYS + 1) }),
        NOW,
      ).expiringSoon,
    ).toBe(false)
  })

  it('geen einddatum → geen oordeel over expiratie, wel gewoon linked', () => {
    const health = deriveBankLinkHealth(signals({ tokenExpiresAt: null }), NOW)
    expect(health.state).toBe('linked')
    expect(health.daysUntilExpiry).toBeNull()
    expect(health.expiringSoon).toBe(false)
  })

  it('een onleesbare einddatum verklaart een rekening NIET kapot', () => {
    const health = deriveBankLinkHealth(signals({ tokenExpiresAt: 'geen-datum' }), NOW)
    expect(health.state).toBe('linked')
    expect(health.daysUntilExpiry).toBeNull()
  })
})

describe('deriveBankLinkHealth — signaal 4: last_synced_at', () => {
  it('nog nooit gesynchroniseerd is géén defect', () => {
    const health = deriveBankLinkHealth(signals({ lastSyncedAt: null }), NOW)
    expect(health.state).toBe('linked')
    expect(health.lastSyncedAt).toBeNull()
  })

  it('reist mee zodat detailpagina en badge hun versheidstekst uit één object lezen', () => {
    expect(deriveBankLinkHealth(signals({ lastSyncedAt: '2026-01-01T00:00:00.000Z' }), NOW).lastSyncedAt)
      .toBe('2026-01-01T00:00:00.000Z')
  })

  it('een oude sync maakt een geldige koppeling niet kapot', () => {
    // Synchroniseren is een handmatige actie; "lang niet gedraaid" is een keuze
    // van de gebruiker, geen storing.
    expect(deriveBankLinkState(signals({ lastSyncedAt: '2020-01-01T00:00:00.000Z' }), NOW)).toBe('linked')
  })
})

describe('de loader-vorm — één bron voor beide cash-oppervlakken', () => {
  const LINKS: CashBankLink[] = [
    {
      bankAccountId: 'bank-1',
      assetId: 'asset-1',
      state: 'linked',
      connectionAccountId: 'link-1',
      providerName: 'ING',
    },
    {
      bankAccountId: 'bank-2',
      assetId: 'asset-2',
      state: 'linked-broken',
      connectionAccountId: 'link-2',
      providerName: 'Rabobank',
    },
    {
      bankAccountId: 'bank-3',
      assetId: null,
      state: 'manual',
      connectionAccountId: null,
      providerName: null,
    },
  ]

  it('leest per cash-bezitting', () => {
    expect(bankLinkForAsset(LINKS, 'asset-1')).toBe('linked')
    expect(bankLinkForAsset(LINKS, 'asset-2')).toBe('linked-broken')
  })

  it('een bezitting zonder koppelrij is manual, niet undefined', () => {
    expect(bankLinkForAsset(LINKS, 'onbekend')).toBe('manual')
  })

  it('een asset-loze rekening matcht nooit op assetId null', () => {
    // Zonder deze regel zou `find(l => l.assetId === undefined)` op een
    // ontbrekende sleutel de manual-rij van bank-3 opleveren.
    expect(bankLinkRowForAsset(LINKS, 'onbekend')).toBeNull()
  })

  it('leest per bankrekening — dezelfde bron, andere sleutel', () => {
    expect(bankLinkRowForAccount(LINKS, 'bank-2')?.state).toBe('linked-broken')
    expect(bankLinkRowForAccount(LINKS, 'bank-2')?.connectionAccountId).toBe('link-2')
    expect(bankLinkRowForAccount(LINKS, 'bank-9')).toBeNull()
  })
})
