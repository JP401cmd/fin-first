import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Elke ADR heeft een uniek viercijferig nummer — een dubbel nummer maakt elke
// verwijzing ("zie ADR NNNN") ambigu. Dit is één keer echt gebeurd (tweemaal
// 0056; de web-vitals-variant is hernummerd naar 0063). Deze test houdt het
// bij die ene keer.
describe('ADR-nummering', () => {
  const dir = join(process.cwd(), 'docs', 'adr')
  const adrs = readdirSync(dir).filter((f) => /^\d{4}-.+\.md$/.test(f))

  it('vindt ADR-bestanden in docs/adr', () => {
    expect(adrs.length).toBeGreaterThan(0)
  })

  it('heeft geen dubbele nummers', () => {
    const perNummer = new Map<string, string[]>()
    for (const f of adrs) {
      const nummer = f.slice(0, 4)
      perNummer.set(nummer, [...(perNummer.get(nummer) ?? []), f])
    }
    const dubbel = [...perNummer.entries()].filter(([, files]) => files.length > 1)
    expect(dubbel).toEqual([])
  })
})
