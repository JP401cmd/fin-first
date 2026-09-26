/**
 * De katern-stand op de layout (ADR 0179 D7/D8): `data-katern` op een `group/katern`, zodat
 * de server-gerenderde kop en de canvas-kolom in Doelen op mobiel compact kunnen zijn.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const h = vi.hoisted(() => ({ segment: null as string | null }))
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => h.segment }))

import { DOELEN_MOBIEL_COMPACT, ToekomstKaternStand } from './toekomst-katern-stand'

afterEach(cleanup)

describe('ToekomstKaternStand', () => {
  it('zet het actieve katern als data-attribuut op een onzichtbare groep', () => {
    h.segment = 'doelen'
    render(<ToekomstKaternStand><p>x</p></ToekomstKaternStand>)
    const el = screen.getByTestId('toekomst-katern-stand')
    expect(el.getAttribute('data-katern')).toBe('doelen')
    expect(el.className).toContain('group/katern')
    expect(el.className).toContain('contents')
    cleanup()
    h.segment = null
    render(<ToekomstKaternStand><p>x</p></ToekomstKaternStand>)
    expect(screen.getByTestId('toekomst-katern-stand').getAttribute('data-katern')).toBe('plan')
  })

  it('de compacte klassen gelden alleen in Doelen en alleen onder lg', () => {
    for (const klassen of Object.values(DOELEN_MOBIEL_COMPACT)) {
      for (const k of klassen.split(' ')) expect(k.startsWith('max-lg:group-data-[katern=doelen]/katern:'), k).toBe(true)
    }
    expect(DOELEN_MOBIEL_COMPACT.oordeel).toContain('[&_h2]:text-[20px]')
    expect(DOELEN_MOBIEL_COMPACT.ankerregel).toContain('truncate')
  })

  it('de layout gebruikt de groep en de compacte klassen', () => {
    const layout = readSourceLF(join(process.cwd(), 'app', '(app)', 'toekomst', '(katern)', 'layout.tsx'))
    expect(layout).toContain('<ToekomstKaternStand>')
    for (const naam of ['kopSectie', 'oordeel', 'ankerregel', 'canvasKolom', 'koppen']) {
      expect(layout, naam).toContain(`DOELEN_MOBIEL_COMPACT.${naam}`)
    }
  })
})
