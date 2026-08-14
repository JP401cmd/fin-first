import { describe, it, expect, beforeEach } from 'vitest'
import { readRecents, pushRecent } from './recents'
import type { CommandItem } from './types'

/**
 * De recents dragen gebruikersinhoud: `label` is de zelf ingetypte naam van een
 * bezitting, schuld of doel. Ze stonden onder één accountloze sleutel, waardoor
 * het volgende account op hetzelfde toestel die namen in zijn palette zag —
 * dezelfde fout als de krantcache had.
 */

function item(id: string, label: string): CommandItem {
  return { id, kind: 'item', label, sublabel: 'Schuld · Hypotheek', href: `/x/${id}` }
}

describe('command-palette recents — accountgebonden', () => {
  beforeEach(() => localStorage.clear())

  it('toont de recents van een ander account niet', () => {
    pushRecent('user-a', item('debt:1', 'Lening moeder'))

    expect(readRecents('user-b')).toEqual([])
  })

  it('bewaart en leest de eigen recents wel', () => {
    pushRecent('user-a', item('debt:1', 'Lening moeder'))

    const own = readRecents('user-a')
    expect(own).toHaveLength(1)
    expect(own[0].label).toBe('Lening moeder')
  })

  it('negeert en verwijdert de oude accountloze sleutel', () => {
    // Herkomst onbekend — weggooien, niet migreren naar wie nu toevallig inlogt.
    localStorage.setItem(
      'trifinity.cmdk.recents',
      JSON.stringify([{ id: 'debt:9', kind: 'item', label: 'Scheiding 2027', ts: Date.now() }]),
    )

    expect(readRecents('user-b')).toEqual([])
    expect(localStorage.getItem('trifinity.cmdk.recents')).toBeNull()
  })
})
