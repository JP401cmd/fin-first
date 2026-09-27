/**
 * De verschilregel zonder vrijheidsleeftijd in tekst (besluit eigenaar 27 sep 2026): de
 * voorbeeldvorm "Wordt haalbaar: vrij op 58,4" en "Nog niet haalbaar · tekort € 1.900 → € 1.400
 * per maand". Bedragen masked-aware zoals de bestaande footer; de leeftijd met één decimaal via
 * `formatAge`. De footer is één body voor twee hosts (instellingen-editor én plan-review-wizard),
 * dus deze tekst geldt op beide plekken.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { RegelProjection } from '@/lib/future/regel-sim'

const privacy = vi.hoisted(() => ({ masked: false, view: 'real' as 'real' | 'nominal' }))
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: privacy.masked }),
}))
vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: privacy.view, setView: () => {}, toggle: () => {} }),
}))

import { FireDeltaFooter } from './shared'

afterEach(() => {
  cleanup()
  privacy.masked = false
  privacy.view = 'real'
})

const rij = [{ age: 42 } as RegelProjection['rows'][number]]
const nietHaalbaar = (maandHint: number): RegelProjection => ({
  rows: rij,
  fireAgeFractional: null,
  kernelStatus: 'unreachable_within_horizon',
  maandHint,
})

function tekst(baseline: RegelProjection, draft: RegelProjection): string {
  const { container } = render(<FireDeltaFooter baseline={baseline} draft={draft} />)
  return (container.textContent ?? '').replace(/ /g, ' ')
}

describe('FireDeltaFooter — plan zonder vrijheidsleeftijd', () => {
  it('wordt haalbaar: vrij op X met één decimaal', () => {
    const concept: RegelProjection = { rows: rij, fireAgeFractional: 58.4166, kernelStatus: 'reached_at', maandHint: -10 }
    expect(tekst(nietHaalbaar(1_900), concept)).toBe('Wordt haalbaar: vrij op 58,4')
  })

  it('beide niet haalbaar: tekort A → B per maand, positief bij een kleiner tekort', () => {
    const { container } = render(<FireDeltaFooter baseline={nietHaalbaar(1_900)} draft={nietHaalbaar(1_400)} />)
    expect((container.textContent ?? '').replace(/ /g, ' ')).toBe('Nog niet haalbaar · tekort € 1.900 → € 1.400 per maand')
    expect(container.querySelector('.text-positive')).not.toBeNull()
    expect(container.querySelector('.tabular-nums')).not.toBeNull()
  })

  it('groter tekort kleurt negatief', () => {
    const { container } = render(<FireDeltaFooter baseline={nietHaalbaar(1_400)} draft={nietHaalbaar(1_900)} />)
    expect(container.querySelector('.text-negative')).not.toBeNull()
  })

  it('gelijk tekort: "blijft"', () => {
    expect(tekst(nietHaalbaar(1_900), nietHaalbaar(1_900.3))).toBe('Nog niet haalbaar · tekort blijft € 1.900 per maand')
  })

  it('verborgen bedragen: geen euro-cijfers in de tekst', () => {
    privacy.masked = true
    const t = tekst(nietHaalbaar(1_900), nietHaalbaar(1_400))
    expect(t).toMatch(/^Nog niet haalbaar · tekort .+ → .+ per maand$/)
    expect(t).not.toMatch(/\d/)
  })

  it('geen maatstaf: eerlijk "Geen vergelijking"', () => {
    expect(tekst(nietHaalbaar(1_900), nietHaalbaar(0))).toBe('Geen vergelijking')
  })

  const metPiek = (maandHint: number, piek: number, inflationFactor: number): RegelProjection => ({
    ...nietHaalbaar(maandHint),
    tekortLening: { piek, leeftijd: 60, inflationFactor },
  })

  it(`ADR 0149-klasse: je tekort-lening loopt op tot A → B, elk één keer gedeflateerd (huidige euro's)`, () => {
    const { container } = render(
      <FireDeltaFooter baseline={metPiek(-2_468, 58_800, 1.4)} draft={metPiek(-2_100, 40_300, 1.3)} />,
    )
    // 58.800 / 1,4 = 42.000; 40.300 / 1,3 = 31.000 — de voorbeeldtekst van de eigenaar.
    expect((container.textContent ?? '').replace(/ /g, ' ')).toBe(
      'Nog niet haalbaar · je tekort-lening loopt op tot € 42.000 → € 31.000',
    )
    expect(container.querySelector('.text-positive')).not.toBeNull()
  })

  it(`in toekomstige euro's: het nominale bedrag, geen deling`, () => {
    privacy.view = 'nominal'
    expect(tekst(metPiek(-2_468, 58_800, 1.4), metPiek(-2_100, 40_300, 1.3))).toBe(
      'Nog niet haalbaar · je tekort-lening loopt op tot € 58.800 → € 40.300',
    )
  })

  it(`kleur en "blijft" op de getoonde bedragen: nominaal hoger, in huidige euro's gelijk → blijft`, () => {
    // 42.000 / 1,4 = 30.000 en 45.000 / 1,5 = 30.000.
    expect(tekst(metPiek(-1, 42_000, 1.4), metPiek(-1, 45_000, 1.5))).toBe(
      'Nog niet haalbaar · je tekort-lening blijft € 30.000',
    )
    const { container } = render(<FireDeltaFooter baseline={metPiek(-1, 30_000, 1)} draft={metPiek(-1, 40_000, 1)} />)
    expect(container.querySelector('.text-negative')).not.toBeNull()
  })

  it('wordt niet haalbaar · tekort € X per maand, in rood', () => {
    const haalbaar: RegelProjection = { rows: rij, fireAgeFractional: 58, kernelStatus: 'reached_at', maandHint: -5 }
    const { container } = render(<FireDeltaFooter baseline={haalbaar} draft={nietHaalbaar(1_400)} />)
    expect((container.textContent ?? '').replace(/ /g, ' ')).toBe('Wordt niet haalbaar · tekort € 1.400 per maand')
    expect(container.querySelector('.text-negative')).not.toBeNull()
  })

  it('wordt niet haalbaar · je tekort-lening loopt op tot € X (alleen de piek)', () => {
    const haalbaar: RegelProjection = { rows: rij, fireAgeFractional: 58, kernelStatus: 'reached_at', maandHint: -5 }
    expect(tekst(haalbaar, metPiek(-3, 58_800, 1.4))).toBe('Wordt niet haalbaar · je tekort-lening loopt op tot € 42.000')
  })

  it('verborgen bedragen bij de leningpiek: geen cijfers', () => {
    privacy.masked = true
    const t = tekst(metPiek(-1, 58_800, 1.4), metPiek(-1, 40_300, 1.3))
    expect(t).toMatch(/^Nog niet haalbaar · je tekort-lening loopt op tot .+ → .+$/)
    expect(t).not.toMatch(/\d/)
  })
})
