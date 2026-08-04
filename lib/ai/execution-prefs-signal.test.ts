import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  notifyExecutionPrefsChanged,
  useExecutionPrefsVersion,
  __resetExecutionPrefsVersion,
} from './execution-prefs-signal'

/**
 * Het signaal bestaat om één concrete bug: wie in de chat naar cloud wisselde,
 * hield het waarschuwingsicoon op de Fin-knop tot hij de pagina verving. De
 * schrijver (popover) en de lezer (FAB) zitten in verschillende takken van de
 * boom en wisten niets van elkaar.
 */

beforeEach(() => {
  __resetExecutionPrefsVersion()
})

describe('execution-prefs-signal', () => {
  it('begint op nul', () => {
    const { result } = renderHook(() => useExecutionPrefsVersion())
    expect(result.current).toBe(0)
  })

  it('elke wijziging bereikt de lezer', () => {
    const { result } = renderHook(() => useExecutionPrefsVersion())

    act(() => notifyExecutionPrefsChanged())
    expect(result.current).toBe(1)

    act(() => notifyExecutionPrefsChanged())
    expect(result.current).toBe(2)
  })

  // Een teller en geen boolean: twee wijzigingen vlak na elkaar moeten twee
  // keer tellen, anders mist een lezer de tweede.
  it('twee wijzigingen tellen apart', () => {
    const { result } = renderHook(() => useExecutionPrefsVersion())
    act(() => {
      notifyExecutionPrefsChanged()
      notifyExecutionPrefsChanged()
    })
    expect(result.current).toBe(2)
  })

  it('bereikt ALLE lezers, niet alleen degene met een callback', () => {
    const eerste = renderHook(() => useExecutionPrefsVersion())
    const tweede = renderHook(() => useExecutionPrefsVersion())

    act(() => notifyExecutionPrefsChanged())

    expect(eerste.result.current).toBe(1)
    expect(tweede.result.current, 'de FAB kent de popover niet — en hoeft dat niet').toBe(1)
  })

  it('een afgemelde lezer krijgt niets meer', () => {
    const { result, unmount } = renderHook(() => useExecutionPrefsVersion())
    unmount()
    act(() => notifyExecutionPrefsChanged())
    expect(result.current).toBe(0)
  })
})
