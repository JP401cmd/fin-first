import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { eventPaneBeschikbaar, eventPaneBron } from './event-pane-bron'

const vol = { fire: {}, input: {}, fireParams: {}, fireStrategy: {}, withdrawalStrategyConfig: {} }

describe('eventPaneBron / eventPaneBeschikbaar — één voorwaarde voor de ene EventPane', () => {
  it('alles aanwezig → beschikbaar, met de vernauwde invoer', () => {
    expect(eventPaneBeschikbaar(vol)).toBe(true)
    expect(eventPaneBron(vol)).toEqual({ input: {}, fireParams: {}, fireStrategy: {}, withdrawalStrategyConfig: {} })
  })

  it.each(['fire', 'input', 'fireParams', 'fireStrategy', 'withdrawalStrategyConfig'] as const)(
    'zonder %s → niet beschikbaar',
    (veld) => {
      expect(eventPaneBeschikbaar({ ...vol, [veld]: undefined })).toBe(false)
      expect(eventPaneBeschikbaar({ ...vol, [veld]: null })).toBe(false)
    },
  )

  it('buiten de provider → niet beschikbaar', () => {
    expect(eventPaneBeschikbaar(null)).toBe(false)
  })

  it('de host en de lijst lezen dezelfde voorwaarde (bron-grendel)', () => {
    const host = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'overlays', 'toekomst-overlays.tsx'))
    const lijst = readSourceLF(join(process.cwd(), 'components', 'future', 'gebeurtenissen-view.tsx'))
    expect(host).toMatch(/eventPaneBron\(\{ input, fireParams, fireStrategy, withdrawalStrategyConfig \}\)/)
    expect(host).not.toMatch(/input && fireParams && fireStrategy && withdrawalStrategyConfig/)
    expect(lijst).toMatch(/eventPaneBeschikbaar\(/)
  })
})
