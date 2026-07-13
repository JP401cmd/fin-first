import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_TAX_YEAR } from './box3-data'
import {
  FISCALE_KERNGETALLEN,
  FISCALE_DRIFT_PUNTEN,
  FISCAL_DOMAINS,
  buildJaarChecklist,
  validateFiscaleKerngetallen,
} from './fiscale-kerngetallen'

describe('fiscale kerngetallen — catalogus', () => {
  it('is valide (ids uniek, bron + bestand + jaartallen kloppen)', () => {
    expect(validateFiscaleKerngetallen()).toEqual([])
  })

  it('elk bronbestand bestaat op schijf', () => {
    const files = new Set<string>([
      ...FISCALE_KERNGETALLEN.map((k) => k.file),
      ...FISCALE_DRIFT_PUNTEN.flatMap((d) => d.files),
    ])
    for (const f of files) {
      expect(existsSync(join(process.cwd(), f)), `bronbestand ontbreekt: ${f}`).toBe(true)
    }
  })

  it('elk kerngetal heeft een bron-instantie en verificatiedatum', () => {
    for (const k of FISCALE_KERNGETALLEN) {
      expect(k.source, `${k.id} mist bron`).toBeTruthy()
      expect(Date.parse(k.lastVerified), `${k.id} heeft ongeldige lastVerified`).not.toBeNaN()
      expect(Date.parse(k.lastVerified), `${k.id} lastVerified ligt in de toekomst`).toBeLessThanOrEqual(Date.now())
    }
  })

  it('dekt de kernbestanden uit het inventarisatie-onderzoek', () => {
    const files = new Set(FISCALE_KERNGETALLEN.map((k) => k.file))
    for (const expected of [
      // De marginale-IB-vuistregel is per Arch F1 verplaatst van fire-params.ts
      // naar box1-tax.ts (deriveMarginaalTarief/schijfGrensVoor, afgeleid uit
      // BOX1_PARAMS); fire-params.ts delegeert nu enkel en host geen los
      // fiscaal kerngetal meer.
      'lib/box1-tax.ts',
      'lib/box2-data.ts',
      'lib/box3-data.ts',
      'lib/jaarruimte.ts',
      'lib/horizon-data.ts',
      'lib/constants.ts',
      'lib/tax-calendar.ts',
    ]) {
      expect(files.has(expected), `inventaris mist bronbestand ${expected}`).toBe(true)
    }
  })

  it('jaargelaagde bronnen bevatten het actieve belastingjaar', () => {
    for (const k of FISCALE_KERNGETALLEN.filter((x) => x.jaargelaagd)) {
      expect(k.years, `${k.id} mist ${CURRENT_TAX_YEAR}`).toContain(CURRENT_TAX_YEAR)
    }
  })

  it('waarden zijn live afgelezen uit de bronconstanten (Box 3-steekproef)', () => {
    // De 2026-laag moet het forfait beleggingen van 6% tonen — komt de bron
    // met een nieuwe waarde, dan beweegt de catalogus automatisch mee en
    // documenteert deze steekproef de verwachting op het actieve jaar.
    const box3 = FISCALE_KERNGETALLEN.find((k) => k.id === 'box3-params')!
    const row2026 = box3.valuesByYear.find((v) => v.year === 2026)!
    const forfait = row2026.values.find((v) => v.label === 'Forfait beleggingen')!
    expect(forfait.value).toBe('6%')
  })

  it('elk domein in FISCAL_DOMAINS wordt gebruikt', () => {
    const used = new Set(FISCALE_KERNGETALLEN.map((k) => k.domain))
    for (const d of FISCAL_DOMAINS) expect(used.has(d), `domein ${d} is leeg`).toBe(true)
  })
})

describe('fiscale kerngetallen — drift-punten', () => {
  it('bevat de drie punten uit het onderzoek met een expliciete status', () => {
    const ids = FISCALE_DRIFT_PUNTEN.map((d) => d.id)
    expect(ids).toContain('box3-dubbel')
    expect(ids).toContain('aow-bedrag-dubbel')
    expect(ids).toContain('marginale-tarieven-verspreid')
    for (const d of FISCALE_DRIFT_PUNTEN) {
      expect(['open', 'opgelost']).toContain(d.status)
    }
  })
})

describe('fiscale kerngetallen — jaar-checklist', () => {
  it('markeert het komende jaar als te verifiëren zolang de jaarlaag ontbreekt', () => {
    const checklist = buildJaarChecklist(CURRENT_TAX_YEAR + 1)
    expect(checklist.targetYear).toBe(CURRENT_TAX_YEAR + 1)
    // Alle jaarlijks-te-verifiëren kerngetallen staan op de checklist.
    const jaarlijks = FISCALE_KERNGETALLEN.filter((k) => k.updateFrequency === 'jaarlijks')
    expect(checklist.items.length).toBe(jaarlijks.length)
    // Box 3 heeft (nog) geen laag voor het komende jaar → open.
    const box3 = checklist.items.find((i) => i.id === 'box3-params')!
    expect(box3.hasTargetYear).toBe(false)
    expect(box3.note).toContain(String(CURRENT_TAX_YEAR + 1))
    expect(checklist.openCount).toBeGreaterThan(0)
  })

  it('herkent een bestaande jaarlaag als aanwezig', () => {
    const checklist = buildJaarChecklist(CURRENT_TAX_YEAR)
    const box3 = checklist.items.find((i) => i.id === 'box3-params')!
    expect(box3.hasTargetYear).toBe(true)
  })
})
