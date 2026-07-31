import { describe, it, expect } from 'vitest'
import { buildBankSignalNotification, type BankSignalInput } from './bank-signalen'

/**
 * Deze suite bewaakt WELK bericht een gebruiker over één bankkoppeling krijgt —
 * en vooral wanneer hij er géén of maar één krijgt. De drie regels die hier
 * vastliggen zijn precies de drie die stilletjes kunnen omvallen:
 *
 *  1. een AL VERLOPEN koppeling is geen "verloopt bijna"-waarschuwing;
 *  2. een ZACHT ONTKOPPELDE rekening zwijgt volledig (gebruikersintentie);
 *  3. verloopt-bijna WINT van niet-gesynchroniseerd — nooit twee berichten die
 *     om dezelfde handeling vragen.
 */

const NOW = new Date('2026-07-29T12:00:00.000Z')
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString()
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function input(overrides: Partial<BankSignalInput> = {}): BankSignalInput {
  return {
    connectionAccountId: 'acc-1',
    label: '1 6430 01',
    providerName: 'ING',
    linkIsActive: true,
    connectionStatus: 'active',
    // Ver buiten het 14-daagse venster en vers gesynchroniseerd: standaard stil.
    tokenExpiresAt: daysFromNow(60),
    lastSyncedAt: daysAgo(0),
    ...overrides,
  }
}

describe('buildBankSignalNotification — verloopt bijna', () => {
  it('zwijgt ruim vóór het venster', () => {
    expect(buildBankSignalNotification(input({ tokenExpiresAt: daysFromNow(30) }), NOW)).toBeNull()
  })

  it('waarschuwt vanaf 14 dagen vóór het verlopen', () => {
    const signal = buildBankSignalNotification(input({ tokenExpiresAt: daysFromNow(14) }), NOW)
    expect(signal).not.toBeNull()
    expect(signal!.id).toBe('bank_expiry_acc-1')
    expect(signal!.type).toBe('sync')
    expect(signal!.title).toContain('over 14 dagen')
  })

  it('zwijgt nog net op 15 dagen', () => {
    expect(buildBankSignalNotification(input({ tokenExpiresAt: daysFromNow(15) }), NOW)).toBeNull()
  })

  it('zegt "morgen" op één dag en "vandaag" op de laatste dag', () => {
    const morgen = buildBankSignalNotification(input({ tokenExpiresAt: daysFromNow(1) }), NOW)
    expect(morgen!.title).toContain('morgen')

    // Zelfde dag, later op de dag → Math.ceil levert 1 dag; pas een tijdstip in
    // het verleden telt als verlopen. Een vervaldatum exact NU is 0 dagen.
    const vandaag = buildBankSignalNotification(input({ tokenExpiresAt: NOW.toISOString() }), NOW)
    expect(vandaag!.title).toContain('vandaag')
  })

  it('zwijgt zonder bekende vervaldatum', () => {
    expect(buildBankSignalNotification(input({ tokenExpiresAt: null }), NOW)).toBeNull()
  })

  it('noemt de BANK, niet het IBAN-fragment', () => {
    // De verloop-waarschuwing raakt elke koppeling 14 van elke 90 dagen en wordt
    // plaintext in de meldingen-historie bewaard. Een stukje rekeningnummer hoort
    // daar niet structureel in te landen; de banknaam identificeert net zo goed.
    const signal = buildBankSignalNotification(
      input({ tokenExpiresAt: daysFromNow(5), providerName: 'Rabobank', label: '7 1643 00' }),
      NOW,
    )
    expect(signal!.title).toContain('Rabobank')
    expect(signal!.title).not.toContain('7 1643 00')
    expect(signal!.description).not.toContain('7 1643 00')
    expect(signal!.aiContext).not.toContain('7 1643 00')
  })

  it('valt terug op een generieke naam zonder bekende bank', () => {
    for (const providerName of [null, '   ']) {
      const signal = buildBankSignalNotification(
        input({ tokenExpiresAt: daysFromNow(5), providerName }),
        NOW,
      )
      expect(signal!.title).toContain('Je bankkoppeling')
      expect(signal!.title).not.toContain('1 6430 01')
    }
  })
})

describe('buildBankSignalNotification — al verlopen is een andere toestand', () => {
  it('geeft GEEN verloop-waarschuwing als de datum verstreken is', () => {
    const signal = buildBankSignalNotification(
      input({ tokenExpiresAt: daysAgo(2), lastSyncedAt: daysAgo(0) }),
      NOW,
    )
    // Wél verlopen, maar vers gesynchroniseerd → niets te melden in dit kanaal.
    expect(signal).toBeNull()
  })

  it('geeft GEEN verloop-waarschuwing bij status expired/revoked', () => {
    for (const status of ['expired', 'revoked']) {
      const signal = buildBankSignalNotification(
        input({ connectionStatus: status, tokenExpiresAt: daysFromNow(5), lastSyncedAt: daysAgo(0) }),
        NOW,
      )
      expect(signal, `status ${status}`).toBeNull()
    }
  })

  it('houdt wél het versheidsbericht als er niets meer binnenkomt', () => {
    // Een kapotte koppeling is juist het moment waarop een duwtje nodig is.
    const signal = buildBankSignalNotification(
      input({ connectionStatus: 'expired', tokenExpiresAt: daysAgo(5), lastSyncedAt: daysAgo(10) }),
      NOW,
    )
    expect(signal!.id).toBe('sync_acc-1')
    expect(signal!.title).toContain('10 dagen niet gesynchroniseerd')
  })
})

describe('buildBankSignalNotification — zacht ontkoppeld zwijgt', () => {
  it('zwijgt volledig, ook als de koppeling bijna verloopt én oud is', () => {
    const signal = buildBankSignalNotification(
      input({ linkIsActive: false, tokenExpiresAt: daysFromNow(3), lastSyncedAt: daysAgo(30) }),
      NOW,
    )
    expect(signal).toBeNull()
  })
})

describe('buildBankSignalNotification — versheid', () => {
  it('meldt na meer dan 3 dagen stilte', () => {
    const signal = buildBankSignalNotification(input({ lastSyncedAt: daysAgo(9) }), NOW)
    expect(signal!.id).toBe('sync_acc-1')
    expect(signal!.priority).toBe(2)
    expect(signal!.description).toContain('Laatste sync')
    // Dit bericht hield bewust zijn bestaande IBAN-label — ongewijzigd gedrag.
    expect(signal!.title).toContain('1 6430 01')
  })

  it('zwijgt op precies 3 dagen (grens ongewijzigd)', () => {
    expect(buildBankSignalNotification(input({ lastSyncedAt: daysAgo(3) }), NOW)).toBeNull()
  })

  it('zwijgt bij een koppeling die nog nooit gesynchroniseerd heeft', () => {
    expect(buildBankSignalNotification(input({ lastSyncedAt: null }), NOW)).toBeNull()
  })
})

describe('buildBankSignalNotification — voorrang', () => {
  it('geeft ALLEEN de verloop-waarschuwing als beide signalen afgaan', () => {
    const signal = buildBankSignalNotification(
      input({ tokenExpiresAt: daysFromNow(4), lastSyncedAt: daysAgo(20) }),
      NOW,
    )
    expect(signal!.id).toBe('bank_expiry_acc-1')
    expect(signal!.title).toContain('over 4 dagen')
    expect(signal!.title).not.toContain('niet gesynchroniseerd')
  })
})
