import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { GEBEURTENIS_NIET_VERPLAATST } from '@/lib/horizon/katern-copy'

const h = vi.hoisted(() => ({
  resultaat: { data: null as { id: string }[] | null, error: null as unknown },
  aanroepen: [] as string[],
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      h.aanroepen.push(`from:${tabel}`)
      return {
        update: (patch: unknown) => {
          h.aanroepen.push(`update:${JSON.stringify(patch)}`)
          return {
            eq: (kolom: string, waarde: string) => {
              h.aanroepen.push(`eq:${kolom}=${waarde}`)
              return {
                select: (kolommen: string) => {
                  h.aanroepen.push(`select:${kolommen}`)
                  return Promise.resolve(h.resultaat)
                },
              }
            },
          }
        },
      }
    },
  }),
}))

import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import type { LifeEvent } from '@/lib/horizon-data'
import { useGebeurtenisSleep, verplaatsLevensgebeurtenis } from './levensgebeurtenis-verplaatsen'

const gebeurtenis = (target_age: number, target_date: string | null = null): LifeEvent => ({
  id: 'ev-1',
  name: 'Sabbatical',
  event_type: 'custom',
  target_age,
  target_date,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 0,
  duration_months: 0,
  icon: 'Calendar',
  is_active: true,
  sort_order: 0,
  is_indexed: false,
})

/**
 * De sleep met echte state, zoals in de provider: een `move` zet de lokale lijst en
 * de volgende render geeft `end` die bijgewerkte lijst mee.
 */
function renderSleep(start: LifeEvent) {
  const loadData = vi.fn()
  const addToast = vi.fn()
  const hook = renderHook(() => {
    const [events, setEvents] = useState<LifeEvent[]>([start])
    return { events, ...useGebeurtenisSleep({ events, setEvents, currentAge: 40, loadData, addToast }) }
  })
  const leeftijd = () => hook.result.current.events[0]!.target_age
  const writes = () => h.aanroepen.filter((a) => a.startsWith('update:'))
  return { hook, loadData, addToast, leeftijd, writes }
}

beforeEach(() => {
  h.aanroepen = []
  h.resultaat = { data: null, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('verplaatsLevensgebeurtenis — alleen precies één geraakte rij is "verplaatst"', () => {
  it('één rij: verplaatst, via update().eq().select("id")', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60, target_date: null })).resolves.toBe('verplaatst')
    expect(h.aanroepen).toEqual([
      'from:life_events',
      'update:{"target_age":60,"target_date":null}',
      'eq:id=ev-1',
      'select:id',
    ])
  })

  it('nul rijen (gedeelde gebeurtenis van je partner, RLS): niet-geraakt, geen stille "verplaatst"', async () => {
    h.resultaat = { data: [], error: null }
    await expect(verplaatsLevensgebeurtenis('ev-partner', { target_age: 60 })).resolves.toBe('niet-geraakt')
  })

  it('geen data: niet-geraakt', async () => {
    h.resultaat = { data: null, error: null }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60 })).resolves.toBe('niet-geraakt')
  })

  it('databasefout: fout', async () => {
    h.resultaat = { data: null, error: { message: 'boom' } }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60 })).resolves.toBe('fout')
  })
})

describe('useGebeurtenisSleep — een sleep op de grafiek (move → end)', () => {
  it('slaat de nieuwe leeftijd op, ook al zette de move hem al lokaal', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    const s = renderSleep(gebeurtenis(50))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 54.75, 'life_event'))
    expect(s.leeftijd()).toBe(55)
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 55, 'life_event'))
    expect(s.writes()).toEqual(['update:{"target_age":55,"target_date":null}'])
    expect(s.leeftijd()).toBe(55)
    expect(s.loadData).toHaveBeenCalledOnce()
  })

  it('nul rijen: terug naar de leeftijd van vóór de sleep, met "Niet verplaatst"', async () => {
    h.resultaat = { data: [], error: null }
    const s = renderSleep(gebeurtenis(50, '2036-01-01'))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 53, 'life_event'))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 55, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 55, 'life_event'))
    expect(s.hook.result.current.events[0]).toMatchObject({ target_age: 50, target_date: '2036-01-01' })
    expect(s.addToast).toHaveBeenCalledWith(expect.objectContaining({ title: GEBEURTENIS_NIET_VERPLAATST.titel }))
    expect(s.loadData).not.toHaveBeenCalled()
  })

  it('databasefout: terug naar de leeftijd van vóór de sleep, zonder melding', async () => {
    h.resultaat = { data: null, error: { message: 'boom' } }
    const s = renderSleep(gebeurtenis(50))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 55, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 55, 'life_event'))
    expect(s.leeftijd()).toBe(50)
    expect(s.addToast).not.toHaveBeenCalled()
  })

  it('heen en terug naar de oude leeftijd: geen write, de oude stand staat er weer', async () => {
    const s = renderSleep(gebeurtenis(50, '2036-01-01'))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 53, 'life_event'))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 50, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 50, 'life_event'))
    expect(s.writes()).toEqual([])
    expect(s.hook.result.current.events[0]).toMatchObject({ target_age: 50, target_date: '2036-01-01' })
  })

  it('een tweede sleep vergelijkt met de uitkomst van de eerste, niet met een oude stand', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    const s = renderSleep(gebeurtenis(50))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 55, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 55, 'life_event'))
    h.resultaat = { data: [], error: null }
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 58, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 58, 'life_event'))
    expect(s.leeftijd()).toBe(55)
  })

  it('rondt af op hele jaren en nooit onder de huidige leeftijd (integer-kolom)', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    const s = renderSleep(gebeurtenis(50))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 30, 'life_event'))
    await act(() => s.hook.result.current.grafiekEnd('ev-1', 'ev-1', 30, 'life_event'))
    expect(s.writes()).toEqual(['update:{"target_age":40,"target_date":null}'])
  })
})

describe('useGebeurtenisSleep — een sleep op de tijdlijn (alleen een einde)', () => {
  it('slaat op en meldt de opgeslagen, afgeronde leeftijd met ongedaan maken', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    const s = renderSleep(gebeurtenis(50))
    await act(() => s.hook.result.current.tijdlijnEnd('ev-1', 54.5))
    expect(s.writes()).toEqual(['update:{"target_age":55}'])
    expect(s.leeftijd()).toBe(55)
    expect(s.addToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sabbatical verplaatst naar 55j', message: 'Was 50j' }),
    )
    expect(s.loadData).toHaveBeenCalledOnce()
  })

  it('nul rijen: terug naar de oude leeftijd, met "Niet verplaatst" en zonder "verplaatst naar"', async () => {
    h.resultaat = { data: [], error: null }
    const s = renderSleep(gebeurtenis(50))
    await act(() => s.hook.result.current.tijdlijnEnd('ev-1', 55))
    expect(s.leeftijd()).toBe(50)
    expect(s.addToast).toHaveBeenCalledOnce()
    expect(s.addToast).toHaveBeenCalledWith(expect.objectContaining({ title: GEBEURTENIS_NIET_VERPLAATST.titel }))
  })

  it('leest de plek van vóór een openstaande grafieksleep (afgebroken) op dezelfde gebeurtenis', async () => {
    h.resultaat = { data: null, error: { message: 'boom' } }
    const s = renderSleep(gebeurtenis(50))
    act(() => s.hook.result.current.grafiekMove('ev-1', 'ev-1', 53, 'life_event'))
    await act(() => s.hook.result.current.tijdlijnEnd('ev-1', 56))
    expect(s.leeftijd()).toBe(50)
  })

  it('zelfde leeftijd: geen write', async () => {
    const s = renderSleep(gebeurtenis(50))
    await act(() => s.hook.result.current.tijdlijnEnd('ev-1', 50.4))
    expect(s.writes()).toEqual([])
  })
})

describe('use-toekomst-lagen — beide sleeppaden lopen via useGebeurtenisSleep', () => {
  const src = readSourceLF(join(process.cwd(), 'components/toekomst/state/use-toekomst-lagen.ts'))

  it('schrijft nooit rechtstreeks naar life_events en heeft geen eigen sleeplogica meer', () => {
    expect(src).not.toMatch(/\.from\(['"]life_events['"]\)/)
    expect(src).not.toContain('verplaatsLevensgebeurtenis(')
    expect(src).toContain('useGebeurtenisSleep(')
  })

  it('de melding heet "Niet verplaatst"', () => {
    expect(GEBEURTENIS_NIET_VERPLAATST.titel).toBe('Niet verplaatst')
  })
})
