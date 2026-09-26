/**
 * Bron-grendel op de vorm van de /toekomst-state-provider (ADR 0179 "Gevolgen", fase 1
 * stap 13).
 *
 * Het risico dat ADR 0179 benoemt: de provider erft de state van ±5.000 regels en wordt
 * de nieuwe god-component. Deze grendel houdt de afspraken vast die dat voorkomen:
 *  1. de provider rendert geen JSX-blokken, alleen de contexts en `children`;
 *  2. elk concern is een eigen hook in een eigen bestand, in de dataflow-volgorde;
 *  3. elke context-waarde is gememoïseerd per concern (`useStabielObject`);
 *  4. de drie meldingen-registraties draaien in de provider, niet in een katern (GW3b);
 *  5. `useInViewOnce` hangt aan het Plan-blad, niet aan de provider (GW3a, kaart V1);
 *  6. de deeplink-afhandeling opent de dode WithdrawalModal niet meer.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { leesToekomst } from '@/lib/test-utils/toekomst-bronnen'

const STATE_DIR = join(process.cwd(), 'components', 'toekomst', 'state')
const provider = leesToekomst('provider')

/** Alle bronbestanden (geen tests) in `components/toekomst/state/`. */
function stateBronnen(): { naam: string; src: string }[] {
  return readdirSync(STATE_DIR)
    .filter((n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n))
    .map((naam) => ({ naam, src: readSourceLF(join(STATE_DIR, naam)) }))
}

describe('toekomst-state-provider — geen nieuwe god-component', () => {
  it('rendert alleen contexts en children, geen JSX-blokken', () => {
    // Alleen de render-return: de generieken (`createContext<…>`) zijn geen JSX.
    const jsx = provider.slice(provider.lastIndexOf('  return ('))
    expect(provider.match(/^ {2}return \(/gm) ?? [], 'één render-return in de provider').toHaveLength(1)
    const tags = [...jsx.matchAll(/<\/?([A-Za-z][\w.]*)/g)].map((m) => m[1])
    expect(tags.length).toBeGreaterThan(0)
    const vreemd = tags.filter((t) => !/^[A-Z]\w*Context\.Provider$/.test(t))
    expect(vreemd, 'de provider hoort alleen <XContext.Provider> te renderen').toEqual([])
    expect(provider).toContain('{children}')
  })

  it('roept de concern-hooks aan in de dataflow-volgorde', () => {
    const volgorde = [
      'useToekomstPerspectief(',
      'useToekomstOverlayState(',
      'useToekomstScenarioState(',
      'useToekomstSim(',
      'useToekomstMeldingen(',
    ].map((aanroep) => {
      const i = provider.indexOf(`= ${aanroep}`)
      expect(i, `${aanroep} ontbreekt in de provider`).toBeGreaterThan(-1)
      return i
    })
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde)
  })

  it('elke concern-hook geeft een per concern gememoïseerde waarde terug', () => {
    for (const { naam, src } of stateBronnen().filter((b) => /^use-toekomst-.*\.ts$/.test(b.naam))) {
      expect(src, `${naam} hoort zijn waarde via useStabielObject te delen`).toMatch(
        /return useStabielObject\(\{/,
      )
    }
  })
})

describe('meldingen en grendels blijven gemount bij een katernwissel', () => {
  it('de drie registratie-hooks draaien in de meldingen-hook, niet in de host (GW3b)', () => {
    const meldingen = leesToekomst('meldingen')
    const host = leesToekomst('host')
    for (const hook of ['useDeficitNotice(', 'useAowNotice(', 'useEindsituatieNotice(']) {
      expect(meldingen, `${hook} hoort in de provider`).toContain(hook)
      expect(host, `${hook} hoort niet in de host`).not.toContain(hook)
    }
  })

  it('useInViewOnce hangt aan het Plan-blad, niet aan de state-laag (GW3a)', () => {
    for (const { naam, src } of stateBronnen()) {
      expect(src, `${naam} mag useInViewOnce niet aanroepen`).not.toMatch(/useInViewOnce\s*\(/)
    }
    expect(readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-verdieping.tsx'))).toMatch(
      /useInViewOnce\s*\(/,
    )
  })

  it('de duiding-grendel gaat alleen van false naar true', () => {
    const sim = leesToekomst('sim')
    expect(sim).toContain('const markeerDuidingInView = useCallback(() => setDuidingInView(true), [])')
    expect(sim.match(/setDuidingInView\(/g) ?? []).toHaveLength(1)
  })
})

describe('afwijkingen van stap 13', () => {
  it('de deeplink-afhandeling opent de dode WithdrawalModal niet meer', () => {
    const overlays = leesToekomst('overlays')
    const tak = overlays.slice(overlays.indexOf("if (modal === 'scenarios'"), overlays.indexOf('setActiveModal(modal)'))
    expect(tak).not.toContain("'withdrawal'")
  })

  it('de kerngetal-tegel rendert tijdens de hydratie de server-stand (geen aria-busy-mismatch)', () => {
    const sim = leesToekomst('sim')
    expect(sim).toMatch(/const naHydratie = useSyncExternalStore\(abonneerNiets, \(\) => true, \(\) => false\)/)
    expect(sim).toContain('isRefining: kernelIsRefining && naHydratie,')
  })
})
