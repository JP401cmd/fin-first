import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  RONDLEIDING_COACHMARK_ID,
  RONDLEIDING_PENDING_KEY,
  RONDLEIDING_QUERY_PARAM,
  RONDLEIDING_ROUTE,
  __resetRondleidingSignal,
  clearRondleidingRequest,
  isRondleidingActive,
  requestRondleiding,
  setRondleidingActive,
  useRondleidingActive,
  useRondleidingRequested,
} from './signal'

/**
 * lib/rondleiding/signal — de twee module-signalen rond de rondleiding.
 *
 * Waarom hier tests op: dit is de enige plek waar "de rondleiding loopt"
 * vandaan komt voor lezers búiten de /overzicht-boom (FinHome hangt in de
 * app-shell, de startknop in de chat-portal). Een signaal dat niet doorkomt
 * betekent dat Fin dwars door de spotlight heen praat.
 */

beforeEach(() => { __resetRondleidingSignal() })
afterEach(() => { __resetRondleidingSignal() })

describe('constanten (contract met de rest van fase 3)', () => {
  it('legt route, query-param, coachmark-id en pending-sleutel vast', () => {
    expect(RONDLEIDING_ROUTE).toBe('/overzicht')
    expect(RONDLEIDING_QUERY_PARAM).toBe('rondleiding')
    expect(RONDLEIDING_COACHMARK_ID).toBe('overzicht-rondleiding')
    expect(RONDLEIDING_PENDING_KEY).toBe('rondleiding:pending')
  })
})

describe('startverzoek', () => {
  it('begint leeg', () => {
    const { result } = renderHook(() => useRondleidingRequested())
    expect(result.current).toBe(false)
  })

  it('meldt een verzoek aan de lezer en laat zich wissen', () => {
    const { result } = renderHook(() => useRondleidingRequested())
    act(() => { requestRondleiding() })
    expect(result.current).toBe(true)
    act(() => { clearRondleidingRequest() })
    expect(result.current).toBe(false)
  })

  it('bereikt ALLE lezers (module-scoped, niet per component)', () => {
    const a = renderHook(() => useRondleidingRequested())
    const b = renderHook(() => useRondleidingRequested())
    act(() => { requestRondleiding() })
    expect(a.result.current).toBe(true)
    expect(b.result.current).toBe(true)
  })

  it('is idempotent: tweemaal wissen is veilig', () => {
    const { result } = renderHook(() => useRondleidingRequested())
    act(() => { requestRondleiding() })
    act(() => { clearRondleidingRequest(); clearRondleidingRequest() })
    expect(result.current).toBe(false)
  })
})

describe('actief-signaal', () => {
  it('volgt setRondleidingActive in beide richtingen', () => {
    const { result } = renderHook(() => useRondleidingActive())
    expect(result.current).toBe(false)
    act(() => { setRondleidingActive(true) })
    expect(result.current).toBe(true)
    expect(isRondleidingActive()).toBe(true)
    act(() => { setRondleidingActive(false) })
    expect(result.current).toBe(false)
    expect(isRondleidingActive()).toBe(false)
  })

  it('staat los van het startverzoek (twee onafhankelijke signalen)', () => {
    const actief = renderHook(() => useRondleidingActive())
    const gevraagd = renderHook(() => useRondleidingRequested())
    act(() => { requestRondleiding() })
    expect(gevraagd.result.current).toBe(true)
    expect(actief.result.current).toBe(false)
    act(() => { setRondleidingActive(true); clearRondleidingRequest() })
    expect(gevraagd.result.current).toBe(false)
    expect(actief.result.current).toBe(true)
  })

  it('__reset zet beide signalen terug (geen lek tussen tests)', () => {
    const actief = renderHook(() => useRondleidingActive())
    const gevraagd = renderHook(() => useRondleidingRequested())
    act(() => { setRondleidingActive(true); requestRondleiding() })
    act(() => { __resetRondleidingSignal() })
    expect(actief.result.current).toBe(false)
    expect(gevraagd.result.current).toBe(false)
  })
})
