import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Bron-grendels op de gedeelde overlay-host (blokken O, V, AA, AB, AC — kaart §5.1)
 * na de pure kopie uit `components/app/horizon/horizon-client.tsx` @ c1b4849eb
 * (fase 1, ADR 0179). Zelfde invarianten, nieuw bestand:
 *  - euro-view: fase-modals en year-details krijgen NOMINALE rijen (kruis-regime, N3)
 *  - na-pensioen-klik: panes-deel (WF-REKEN-23-bug4)
 *  - deeplink-cleanup: de host leest geen deeplinks en navigeert niet naar /horizon
 *    (effect E2 blijft in de parent tot de provider-stap)
 *  - overlay-standaard (Q9/ADR 0039): geen directe BottomSheet, geen fixed inset-0
 * De integrator schrapt de overeenkomstige JSX-assertions in horizon-client.*.test.ts.
 */

const HOST = join(process.cwd(), 'components', 'toekomst', 'overlays', 'toekomst-overlays.tsx')
const src = readSourceLF(HOST)
const code = src
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*')
  })
  .join('\n')

describe('overlay-host — herkomst', () => {
  it('draagt de verplaats-kop met bronbereik en commit', () => {
    expect(src).toMatch(
      /^\/\/ Verplaatst uit components\/app\/horizon\/horizon-client\.tsx r7753–7767, r10222–10314, r10866–11025 .*@ c1b4849eb \(fase 1, ADR 0179\)\.$/m,
    )
  })
})

describe('overlay-host — euro-weergave (kruis-regime, N3)', () => {
  it('passeert de rekenrijen nominaal naar de fase-modals', () => {
    expect(src).not.toMatch(/rows=\{viewUnifiedRows/)
    expect(src).not.toMatch(/allRows=\{view/)
    expect(src).not.toMatch(/^\s*view=\{euroView\}/m)
    // Drie fase-modals, elk `rows` én `allRows` op de nominale kernelrijen.
    expect(src.match(/ rows=\{unifiedRows \?\? \[\]\}/g) ?? []).toHaveLength(3)
    expect(src.match(/allRows=\{unifiedRows \?\? \[\]\}/g) ?? []).toHaveLength(3)
  })

  it('de jaar-kassabon krijgt de nominale weergaverijen', () => {
    expect(src).toContain('unifiedRows={displayUnifiedRows}')
    expect(src).toContain('simRows={displaySimRows}')
  })

  it('geen enkele view*-feed, deflate-aanroep of inflationFactor in de host', () => {
    expect(code).not.toMatch(/=\{view[A-Z]/)
    expect(code).not.toMatch(/\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset)\(/)
    expect(code).not.toContain('inflationFactor')
    expect(code).not.toContain('useEuroView')
  })

  it('het nominale doel naar SimulationsModal houdt zijn exempt-markering', () => {
    const i = src.indexOf('authoritativeFireTarget={effectiveFireTarget}')
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(Math.max(0, i - 300), i)).toContain('// euro-view: exempt')
  })

  it('draagt een euro-view-regel in de kop', () => {
    expect(src).toMatch(/^\/\/ euro-view: /m)
  })
})

describe('overlay-host — "Na pensioen"-panes (WF-REKEN-23-bug4)', () => {
  it('de huishoud-pane blijft voorwaardelijk op de info', () => {
    expect(src).toMatch(/\{householdRetireInfo && \(\s*<HouseholdRetirementPane/)
  })

  it('het terugval-paneel rendert onvoorwaardelijk', () => {
    expect(src).toMatch(/<UitgavenPane open=\{uitgavenPaneOpen\}/)
  })
})

describe('overlay-host — deeplinks blijven in de parent (E2)', () => {
  it('leest geen query-params en ruimt de URL niet zelf op', () => {
    expect(code).not.toContain('useSearchParams')
    expect(code).not.toContain('usePathname')
    expect(code).not.toContain('buildDeeplinkCleanupUrl')
    expect(code).not.toContain('router.replace(')
  })

  it('navigeert nergens naar een legacy /horizon-route', () => {
    const offenders = code
      .split('\n')
      .filter((line) => /(router\.(replace|push)|triggerDream)\(\s*['"`]\/horizon/.test(line))
    expect(offenders).toEqual([])
  })
})

describe('overlay-host — StrategieModal ververst na sluiten', () => {
  it('sluiten herlaadt en ververst de server-render', () => {
    // Sinds fase 1 stap 3 (A1) is `loadData` zelf `startRefresh(() => router.refresh())`.
    expect(src).toContain(
      'onClose={() => { setActiveModal(null); setStrategieInitialTab(null); loadData() }}',
    )
  })
})

describe('overlay-host — overlay-standaard (ADR 0039, besluit Q9)', () => {
  it('geen directe BottomSheet-import en geen hand-rolled fixed inset-0', () => {
    expect(code).not.toMatch(/from '@\/components\/app\/bottom-sheet'/)
    expect(code).not.toContain('<BottomSheet')
    expect(code).not.toContain('fixed inset-0')
  })

  it('elke dynamic() staat hier precies één keer, zonder SSR', () => {
    const namen = [
      'ScenariosModal', 'SimulationsModal', 'WithdrawalModal', 'BacktestingModal', 'StrategieModal',
      'UitgavenPane', 'EventPane', 'PhaseModalOpbouw', 'PhaseModalOvergang', 'PhaseModalOnttrekking',
      'SimChartModal', 'HorizonYearDetailsSheet',
    ]
    for (const naam of namen) {
      expect(src.match(new RegExp(`const ${naam} = dynamic\\(`, 'g')) ?? [], naam).toHaveLength(1)
    }
    expect(src.match(/\{ ssr: false \}/g) ?? []).toHaveLength(namen.length)
  })
})
