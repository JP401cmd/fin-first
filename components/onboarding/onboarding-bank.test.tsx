import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * Onboarding-stap "Bank koppelen" (plan §3).
 *
 * Gepind: de doelrekening is een verplichte keuze (anders ontstaat er een dubbele
 * betaalrekening), overslaan vraagt om een reden, en een geslaagde terugkeer biedt
 * "Verder". De footer rendert in de shell tweemaal (desktop inline + mobiel sticky),
 * vandaar `getAllByRole(...)[0]`.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

import { OnboardingBank, preselectTarget } from './onboarding-bank'
import type { TargetAccountOption, TargetAssetOption } from '@/lib/truelayer/target-account'

const asset = (over: Partial<TargetAssetOption> = {}): TargetAssetOption => ({
  id: 'asset-1',
  name: 'Betaalrekening',
  institution: 'ING',
  iban_tail: null,
  account_type: 'checking',
  budget_tracking: true,
  ...over,
})

function stubFetch(assets: TargetAssetOption[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/bank-connect/accounts') {
      return { ok: true, status: 200, json: async () => ({ accounts: [], assets }) }
    }
    if (url === '/api/bank-connect/providers') {
      return { ok: true, status: 200, json: async () => [{ id: 'ob-ing', name: 'ING', logo: '' }] }
    }
    return { ok: false, status: 500, json: async () => ({ error: 'x' }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const button = (name: RegExp | string) => screen.getAllByRole('button', { name })[0] as HTMLButtonElement

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('preselectTarget', () => {
  it('kiest voor bij precies één betaalrekening, anders niet', () => {
    expect(preselectTarget([], [asset()])).toEqual({ kind: 'asset', id: 'asset-1' })
    expect(preselectTarget([], [asset(), asset({ id: 'asset-2' })])).toEqual({ kind: 'none' })
    expect(preselectTarget([], [asset({ account_type: 'savings' })])).toEqual({ kind: 'none' })
    expect(preselectTarget([], [])).toEqual({ kind: 'new' })
  })

  it('houdt de voorselectie na een afgebroken poging: het bezit staat dan als vrije, lege rekening', () => {
    const rekening = (over: Partial<TargetAccountOption> = {}): TargetAccountOption => ({
      id: 'ba-1',
      name: 'Betaalrekening',
      bank_name: 'ING',
      iban_tail: null,
      transaction_count: 0,
      oldest_transaction_date: null,
      newest_transaction_date: null,
      budget_tracking: true,
      linked_provider_name: null,
      fetch_plan: { mode: 'historical', start_date: '2026-01-01' },
      ...over,
    })
    expect(preselectTarget([rekening()], [])).toEqual({ kind: 'existing', id: 'ba-1' })
    // Bezet door een andere bank, of met historie: niet stil kiezen.
    expect(preselectTarget([rekening({ linked_provider_name: 'Rabobank' })], [])).toEqual({ kind: 'none' })
    expect(preselectTarget([rekening({ transaction_count: 12 })], [])).toEqual({ kind: 'none' })
    // Een vrije lege rekening náást een betaalrekening-bezit: twee kandidaten.
    expect(preselectTarget([rekening()], [asset()])).toEqual({ kind: 'none' })
  })
})

describe('OnboardingBank — terugkeer in de browser na de geïnstalleerde app', () => {
  it('toont bij result=connected in een browser de hint dat je dit tabblad kunt sluiten', async () => {
    stubFetch([asset()])
    render(<OnboardingBank result="connected" onDone={vi.fn()} onSkipped={vi.fn()} />)
    expect(await screen.findByText(/kun je dit tabblad sluiten/)).toBeTruthy()
  })
})

describe('OnboardingBank — doelrekening is verplicht', () => {
  it('zonder rekeningkeuze kun je niet verder naar koppelen', async () => {
    stubFetch([asset(), asset({ id: 'asset-2', name: 'Tweede rekening' })])
    render(<OnboardingBank result={null} onDone={vi.fn()} onSkipped={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('radio', { name: /Tweede rekening/ })).toBeTruthy())
    expect(button('Verder').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Koppel mijn bank' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /Tweede rekening/ }))
    expect(button('Verder').disabled).toBe(false)
  })

  it('"Koppel mijn bank" blijft uit tot er ook een bank gekozen is', async () => {
    stubFetch([asset()])
    render(<OnboardingBank result={null} onDone={vi.fn()} onSkipped={vi.fn()} />)

    // Eén betaalrekening → voorgeselecteerd.
    await waitFor(() => expect(button('Verder').disabled).toBe(false))
    fireEvent.click(button('Verder'))

    expect(button('Koppel mijn bank').disabled).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: /ING/ }))
    expect(button('Koppel mijn bank').disabled).toBe(false)
  })
})

describe('OnboardingBank — overslaan met frictie', () => {
  it('"Later doen" blijft uit tot er een reden is, en geeft die reden door', async () => {
    stubFetch([asset()])
    const onSkipped = vi.fn()
    render(<OnboardingBank result={null} onDone={vi.fn()} onSkipped={onSkipped} />)

    fireEvent.click(button('Ik doe dit later'))
    expect(button('Later doen').disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: 'Mijn bank staat er niet tussen' }))
    // Bij een ontbrekende bank de tip over het bankbestand.
    expect(screen.getByText(/CSV- of MT940-bestand/)).toBeTruthy()
    expect(button('Later doen').disabled).toBe(false)

    fireEvent.click(button('Later doen'))
    expect(onSkipped).toHaveBeenCalledWith('bank_ontbreekt')
  })
})

describe('OnboardingBank — terugkeer', () => {
  it('result "connected" toont het succes en "Verder" roept onDone', () => {
    stubFetch([])
    const onDone = vi.fn()
    render(<OnboardingBank result="connected" onDone={onDone} onSkipped={vi.fn()} />)

    expect(screen.getAllByText('Je bank is gekoppeld').length).toBeGreaterThan(0)
    fireEvent.click(button('Verder'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('result "error" biedt opnieuw proberen én nog steeds overslaan', async () => {
    stubFetch([asset()])
    render(<OnboardingBank result="error" onDone={vi.fn()} onSkipped={vi.fn()} />)

    expect(screen.getByRole('alert').textContent).toContain('nog niet gekoppeld')
    expect(button('Ik doe dit later')).toBeTruthy()
    fireEvent.click(button('Opnieuw proberen'))
    await waitFor(() => expect(screen.getByText('Welke rekening koppel je?')).toBeTruthy())
  })
})
