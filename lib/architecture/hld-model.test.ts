import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '@/lib/module-registry'
import { buildHldModel, validateHldModel } from './hld-model'

const model = buildHldModel()

describe('hld-model — praatplaat', () => {
  it('is valide en coherent', () => {
    expect(validateHldModel(model)).toEqual([])
  })

  it('zet functionaliteiten centraal, in lekentaal per doel', () => {
    expect(model.capabilityGroups.length).toBeGreaterThanOrEqual(4)
    const totalCaps = model.capabilityGroups.reduce((s, g) => s + g.items.length, 0)
    expect(totalCaps).toBeGreaterThanOrEqual(12)
    // doelen zijn in "ik"-taal
    for (const g of model.capabilityGroups) {
      expect(g.goal.toLowerCase()).toContain('ik wil')
      for (const cap of g.items) {
        expect(cap.title.length).toBeGreaterThan(0)
        expect(cap.desc.length).toBeGreaterThan(0)
      }
    }
  })

  it('houdt de modules in sync met MODULE_CATALOG', () => {
    expect(model.modules.map((m) => m.id)).toEqual(MODULE_CATALOG.map((m) => m.id))
  })

  it('heeft de vier soevereiniteitsfasen als motivatie', () => {
    expect(model.phases.map((p) => p.label)).toEqual(['Herstel', 'Stabiliteit', 'Momentum', 'Meesterschap'])
  })

  it('vertelt een reis met een vrijheids-uitkomst', () => {
    expect(model.journey.length).toBeGreaterThanOrEqual(4)
    expect(model.outcome.title.toLowerCase()).toContain('vrijheid')
  })

  it('valideert breekt wanneer modules niet kloppen', () => {
    const broken = { ...model, modules: model.modules.slice(1) }
    expect(validateHldModel(broken).length).toBeGreaterThan(0)
  })
})
