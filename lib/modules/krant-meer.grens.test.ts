import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { krantRedirect } from './krant-grens'
import { PRODUCT_PRESETS } from './resolve'

/**
 * Krant 2D fase 1 — de weg omhoog ligt binnen de Krant-grens.
 *
 * `/krant/meer` stond al op de allowlist (2B); nu de pagina bestaat, borgt
 * deze suite dat een Krant-account hem echt bereikt, dat de route achter auth
 * staat, en dat de Krant na de overstap aan blijft (de Geheel-preset bevat
 * 'nieuws').
 */

const KRANT = [...PRODUCT_PRESETS.krant.modules]
const GEHEEL = [...PRODUCT_PRESETS.geheel.modules]

describe('/krant/meer en de Krant-grens', () => {
  it('een Krant-account bereikt /krant/meer (krantRedirect geeft null)', () => {
    expect(krantRedirect('/krant/meer', KRANT, false)).toBeNull()
    expect(krantRedirect('/krant/meer/', KRANT, false)).toBeNull()
  })

  it('een Geheel-account bereikt /krant/meer ook (de grens raakt hem niet)', () => {
    expect(krantRedirect('/krant/meer', GEHEEL, false)).toBeNull()
  })

  it('de pagina en de layout met het fin-accent bestaan', () => {
    expect(existsSync(join(process.cwd(), 'app/(app)/krant/meer/page.tsx'))).toBe(true)
    const layout = readFileSync(join(process.cwd(), 'app/(app)/krant/layout.tsx'), 'utf8')
    expect(layout).toContain("'--module-active-700': 'var(--color-fin-700)'")
  })

  it('/krant staat in de protectedPrefixes van de proxy', () => {
    const src = readFileSync(join(process.cwd(), 'lib/supabase/proxy.ts'), 'utf8')
    const blok = src.slice(src.indexOf('const protectedPrefixes'), src.indexOf(']', src.indexOf('const protectedPrefixes')))
    expect(blok).toContain("'/krant'")
  })

  it('de Krant blijft aan na de overstap: de Geheel-preset bevat nieuws', () => {
    expect(GEHEEL).toContain('nieuws')
  })
})
