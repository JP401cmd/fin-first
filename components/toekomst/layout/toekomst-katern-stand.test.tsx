/**
 * De katern-stand op de layout (ADR 0179 D7/D8): `data-katern` op een `group/katern`, zodat
 * de server-gerenderde kop en de canvas-kolom in Doelen op mobiel compact kunnen zijn.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import fs from 'node:fs'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const h = vi.hoisted(() => ({ segment: null as string | null }))
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => h.segment }))

import { ToekomstKaternStand } from './toekomst-katern-stand'
import { DOELEN_MOBIEL_COMPACT } from './doelen-mobiel-compact'

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

  it('de compacte klassen komen uit een module zonder use client: een servercomponent krijgt daaruit anders geen waarden', () => {
    // Given de server-layout die DOELEN_MOBIEL_COMPACT in className-strings zet,
    // When hij die constante importeert,
    // Then komt ze uit een gewone module. Uit een 'use client'-module krijgt een
    // servercomponent alleen client-referenties: de klasse wordt letterlijk "undefined".
    const layout = readSourceLF(join(process.cwd(), 'app', '(app)', 'toekomst', '(katern)', 'layout.tsx'))
    const m = layout.match(/import\s*\{[^}]*\bDOELEN_MOBIEL_COMPACT\b[^}]*\}\s*from\s*'([^']+)'/)
    expect(m, 'layout importeert DOELEN_MOBIEL_COMPACT').not.toBeNull()
    const pad = m![1].replace('@/', '')
    const bron = ['.ts', '.tsx'].map((ext) => join(process.cwd(), pad + ext)).find((p) => fs.existsSync(p))
    expect(bron, pad).toBeTruthy()
    expect(readSourceLF(bron!)).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it('de layout gebruikt de groep en de compacte klassen', () => {
    const layout = readSourceLF(join(process.cwd(), 'app', '(app)', 'toekomst', '(katern)', 'layout.tsx'))
    expect(layout).toContain('<ToekomstKaternStand>')
    for (const naam of ['kopSectie', 'oordeel', 'ankerregel', 'canvasKolom', 'koppen']) {
      expect(layout, naam).toContain(`DOELEN_MOBIEL_COMPACT.${naam}`)
    }
  })
})
