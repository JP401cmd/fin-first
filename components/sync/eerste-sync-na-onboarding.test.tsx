import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { BankSyncTarget } from '@/lib/sync/global-sync'
import {
  EersteSyncNaOnboarding,
  __resetEersteSync,
} from './eerste-sync-na-onboarding'

/**
 * De eerste ophaal na de onboarding (ADR 0158).
 *
 * Het zwaartepunt van deze suite ligt op wat de trigger NIET mag doen. Hij
 * start een sync zónder dat de gebruiker erom vroeg, en een geslaagde sync
 * sluit onherroepelijk het correctiemoment van ADR 0069 — de actie waarmee een
 * verkeerd gelande koppeling nog te verhangen is. Elke koppeling die hij
 * aanraakt zonder dat hij mag, is dus permanente schade.
 *
 * Vandaar dat de poort aan de KOPPELING hangt (de ids uit de
 * afrondingsmarkering) en niet aan gebruikerstoestand. Een eerdere versie
 * toetste "heeft de gebruiker nog niets gesynchroniseerd?" en liet daarmee een
 * later gelegde koppeling meeliften — de gevallen hieronder pinnen dat vast.
 */

const triggerGlobalSync = vi.fn()
const loadGlobalSyncTargets = vi.fn()
let quiet = false

vi.mock('./global-sync-provider', () => ({
  useGlobalSync: () => ({
    triggerGlobalSync,
    getBankAttempts: () => ({}),
  }),
}))

vi.mock('./use-global-sync-runner', () => ({
  loadGlobalSyncTargets: (...args: unknown[]) => loadGlobalSyncTargets(...args),
}))

vi.mock('@/lib/hooks/use-attention-quiet', () => ({
  useAttentionQuiet: () => quiet,
}))

let pathname = '/overzicht'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

function bank(
  connectionAccountId: string,
  lastSyncedAt: string | null,
  extra: Partial<BankSyncTarget> = {},
): BankSyncTarget {
  return {
    connectionAccountId,
    label: `Bank ${connectionAccountId}`,
    bankAccountId: `ba-${connectionAccountId}`,
    lastSyncedAt,
    ...extra,
  }
}

function targets(banks: BankSyncTarget[]) {
  return { exchanges: [], wallets: [], banks, pricesOnly: banks.length === 0 }
}

/** De koppeling die uit de onboarding kwam. */
const UIT_ONBOARDING = ['ca-onboarding']

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  __resetEersteSync()
  quiet = false
  pathname = '/overzicht'
  triggerGlobalSync.mockReset().mockResolvedValue(undefined)
  loadGlobalSyncTargets
    .mockReset()
    .mockResolvedValue(targets([bank('ca-onboarding', null)]))
})

afterEach(() => {
  vi.useRealTimers()
})

/** Laat de startvertraging verstrijken. */
async function wacht() {
  await vi.advanceTimersByTimeAsync(2500)
}

describe('EersteSyncNaOnboarding', () => {
  it('doet niets zonder koppelingen uit de onboarding', async () => {
    render(<EersteSyncNaOnboarding koppelingen={[]} />)
    await wacht()
    expect(loadGlobalSyncTargets).not.toHaveBeenCalled()
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  it('start de ronde zodra het stil is', async () => {
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    expect(triggerGlobalSync).toHaveBeenCalledWith(targets([bank('ca-onboarding', null)]))
  })

  it('zwijgt zolang de rondleiding (of een andere laag) de aandacht heeft', async () => {
    quiet = true
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  it('slaat over als de onboarding-koppeling al gesynchroniseerd heeft', async () => {
    loadGlobalSyncTargets.mockResolvedValue(
      targets([bank('ca-onboarding', '2026-09-17T09:00:00.000Z')]),
    )
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(loadGlobalSyncTargets).toHaveBeenCalled())
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  // ── Het correctiemoment van ADR 0069 ────────────────────────────────────

  it('raakt een koppeling die NIET uit de onboarding komt nooit aan', async () => {
    // De onboarding-bank is binnen; de gebruiker legde er net een tweede. Die
    // tweede heeft nog een levend correctiemoment en mag hier niet mee.
    loadGlobalSyncTargets.mockResolvedValue(
      targets([
        bank('ca-onboarding', '2026-09-17T09:00:00.000Z'),
        bank('ca-later', null),
      ]),
    )
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(loadGlobalSyncTargets).toHaveBeenCalled())
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  it('laat een later gelegde koppeling ook buiten de ronde als de eerste faalde', async () => {
    // Het scherpe geval: een onboarding-koppeling die kapot of zonder drager
    // landde krijgt NOOIT een `last_synced_at`. Een poort op gebruikerstoestand
    // zou hier 24 uur open blijven staan en de tweede koppeling meesleuren.
    loadGlobalSyncTargets.mockResolvedValue(
      targets([
        bank('ca-onboarding', null, { linkBroken: true, bankAccountId: null }),
        bank('ca-later', null),
      ]),
    )
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))

    // De ronde gaat door voor de onboarding-koppeling (die `planBankSyncs`
    // daarna zelf overslaat), maar `ca-later` zit er niet in.
    const meegegeven = triggerGlobalSync.mock.calls[0][0] as ReturnType<typeof targets>
    expect(meegegeven.banks.map((b) => b.connectionAccountId)).toEqual(['ca-onboarding'])
  })

  it('vuurt nooit binnen de koppelwizard, waar de verhang-actie staat', async () => {
    // De callback is een server-redirect: een volledige pagina-load, dus een
    // verse module-scope waarin de eenmalig-per-tab-vlag weer vals staat.
    pathname = '/core/cash/connect/success'
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    expect(loadGlobalSyncTargets).not.toHaveBeenCalled()
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  it('doet niets zonder enige bankkoppeling', async () => {
    loadGlobalSyncTargets.mockResolvedValue(targets([]))
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(loadGlobalSyncTargets).toHaveBeenCalled())
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  // ── Eenmaligheid en herstel ─────────────────────────────────────────────

  it('vuurt hooguit één keer per tab, ook na opnieuw monteren', async () => {
    const eerste = render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    eerste.unmount()

    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    expect(triggerGlobalSync).toHaveBeenCalledTimes(1)
  })

  it('faalt stil als de leesronde omvalt, maar blokkeert de sessie niet', async () => {
    loadGlobalSyncTargets.mockRejectedValueOnce(new Error('netwerk weg'))
    const eerste = render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(loadGlobalSyncTargets).toHaveBeenCalledTimes(1))
    expect(triggerGlobalSync).not.toHaveBeenCalled()
    eerste.unmount()

    // Eén hapering mag de eerste ophaal niet voor de hele sessie afkappen.
    render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
  })

  it('haalt de sync alsnog op zodra de rondleiding voorbij is', async () => {
    quiet = true
    const { rerender } = render(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await wacht()
    expect(triggerGlobalSync).not.toHaveBeenCalled()

    quiet = false
    rerender(<EersteSyncNaOnboarding koppelingen={UIT_ONBOARDING} />)
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
  })
})
