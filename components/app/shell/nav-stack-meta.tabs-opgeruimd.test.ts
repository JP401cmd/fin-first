import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Grendel: niemand vraagt de dode bottom-bar-waarde `'tabs'` meer aan.
 *
 * Sinds ADR 0179 fase 6 zijn de module-tabs afgeschaft: `MobileBottomBar`
 * rendert `kind: 'tabs'` precies zo als `'hidden'` (niets), en de default van
 * `<NavStackMeta>` zonder prop is al `'hidden'`. Tientallen pagina's gaven
 * `bottomBar={{ kind: 'tabs' }}` nog mee — ruis die suggereert dat er iets
 * gebeurt. Die zijn opgeruimd; deze test voorkomt dat de waarde terugsluipt
 * via copy-paste uit een oude pagina.
 *
 * Scope: `app/` en `components/`, zonder `components/app/shell/` (daar leeft
 * de mechaniek zelf, inclusief het type en de provider-tests) en zonder
 * testbestanden (fixtures mogen de waarde gebruiken om mechaniek te toetsen).
 */

const ROOTS = ['app', 'components']
const SHELL_DIR = join('components', 'app', 'shell')
const SOURCE_EXT = /\.(ts|tsx)$/
const TEST_FILE = /\.test\.(ts|tsx)$/

/** JSX-prop (`bottomBar={{ kind: 'tabs' }}`) of object-veld (`bottomBar: { kind: 'tabs' }`). */
const DEAD_TABS_PATTERNS: RegExp[] = [
  /bottomBar\s*=\s*\{\{\s*kind:\s*['"]tabs['"]/,
  /bottomBar\s*:\s*\{\s*kind:\s*['"]tabs['"]/,
]

function collectSourceFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = join(dir, name)
    const rel = relative(process.cwd(), full)
    if (rel === SHELL_DIR || rel.startsWith(SHELL_DIR + sep)) continue
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out)
    } else if (SOURCE_EXT.test(name) && !TEST_FILE.test(name)) {
      out.push(full)
    }
  }
}

describe("NavStackMeta — de dode bottomBar-waarde 'tabs' blijft opgeruimd", () => {
  it("geen pagina of component buiten de shell geeft bottomBar kind 'tabs' mee", () => {
    const files: string[] = []
    for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files)
    // Zelfcontrole: een lege scan zou de grendel stil groen maken.
    expect(files.length).toBeGreaterThan(100)

    const offenders: string[] = []
    for (const file of files) {
      const src = readSourceLF(file)
      // Op de hele tekst matchen (niet per regel), zodat ook een prop die over
      // meerdere regels is uitgeschreven gevangen wordt.
      for (const re of DEAD_TABS_PATTERNS) {
        const match = re.exec(src)
        if (match) {
          const line = src.slice(0, match.index).split('\n').length
          offenders.push(`${relative(process.cwd(), file)}:${line}`)
        }
      }
    }

    expect(
      offenders,
      "bottomBar={{ kind: 'tabs' }} doet niets sinds ADR 0179 fase 6 (MobileBottomBar " +
        "rendert 'tabs' als 'hidden'). Haal de prop weg; de NavStackMeta-default is al 'hidden'.",
    ).toEqual([])
  })
})
