import { describe, it, expect } from 'vitest'
import {
  DOELGROEP_SLEUTELS,
  DOELGROEP_SLEUTEL_LIJST,
  PROFIEL_VELDEN,
  PROFIEL_VELD_AANTAL,
  isGeldigeDoelgroepWaarde,
} from './profiel-velden'

describe('profielmodel v1 (B1 − uitgavenband, B2)', () => {
  it('telt dertien velden en geen uitgavenband', () => {
    expect(PROFIEL_VELDEN).toHaveLength(PROFIEL_VELD_AANTAL)
    expect(PROFIEL_VELD_AANTAL).toBe(13)
    expect(PROFIEL_VELDEN as readonly string[]).not.toContain('uitgaven')
    expect(PROFIEL_VELDEN as readonly string[]).not.toContain('maanduitgaven')
  })

  it('elke doelgroepsleutel wijst naar een bestaand veld', () => {
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      expect(PROFIEL_VELDEN as readonly string[]).toContain(DOELGROEP_SLEUTELS[sleutel].veld)
    }
  })

  it('elk veld behalve rubrieken wordt door minstens één sleutel gelezen', () => {
    const gelezen = new Set<string>(DOELGROEP_SLEUTEL_LIJST.map((s) => DOELGROEP_SLEUTELS[s].veld))
    for (const veld of PROFIEL_VELDEN) {
      if (veld === 'rubrieken') continue
      expect(gelezen.has(veld), `veld "${veld}" wordt nergens gelezen — wat geen regel leest, wordt niet gevraagd`).toBe(true)
    }
    expect(gelezen.has('rubrieken')).toBe(false)
  })

  it('waarden zijn uniek en in sleutelvorm (kleine letters, koppelteken)', () => {
    for (const sleutel of DOELGROEP_SLEUTEL_LIJST) {
      const waarden = DOELGROEP_SLEUTELS[sleutel].waarden as readonly string[]
      expect(new Set(waarden).size).toBe(waarden.length)
      for (const w of waarden) expect(w).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('isGeldigeDoelgroepWaarde: banden exact, jaartal binnen de grenzen', () => {
    expect(isGeldigeDoelgroepWaarde('spaargeld', '25k-50k')).toBe(true)
    expect(isGeldigeDoelgroepWaarde('spaargeld', '25000-50000')).toBe(false)
    expect(isGeldigeDoelgroepWaarde('geboortejaar', '1984')).toBe(true)
    expect(isGeldigeDoelgroepWaarde('geboortejaar', '1899')).toBe(false)
    expect(isGeldigeDoelgroepWaarde('geboortejaar', 'jong')).toBe(false)
  })
})
