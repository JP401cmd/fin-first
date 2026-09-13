import { describe, expect, it } from 'vitest'
import {
  KERNEL_INPUT_REVIEW_REGISTER,
  PLAN_REVIEW_DEKKINGEN,
  kernelBlokkenVoorStap,
} from './register'
import { PLAN_REVIEW_STAPPEN } from './types'

/**
 * Registerplicht (A11): de review mag geen kernel-instelling stil buiten beeld
 * laten. De TYPE-kant (`Record<keyof KernelInput, …>`) dwingt volledigheid af bij
 * `tsc`; deze test bewaakt de inhoud van het register.
 */
describe('plan-review — KernelInput-register (A11)', () => {
  it('elke registratie draagt een geldige dekking en een toelichting', () => {
    for (const [veld, reg] of Object.entries(KERNEL_INPUT_REVIEW_REGISTER)) {
      expect(PLAN_REVIEW_DEKKINGEN, `${veld}: onbekende dekking ${reg.dekking}`).toContain(reg.dekking)
      expect(reg.toelichting.trim().length, `${veld}: toelichting ontbreekt`).toBeGreaterThan(10)
    }
  })

  it('elke review-stap dekt minstens één kernel-blok', () => {
    for (const stap of PLAN_REVIEW_STAPPEN) {
      expect(kernelBlokkenVoorStap(stap).length, `stap ${stap} dekt niets`).toBeGreaterThan(0)
    }
  })

  it('de vijf gevoeligste blokken zitten ín de stappen, niet in laag 2 of brondata', () => {
    // De inventaris (13 sep 2026) noemt deze als stille defaults met groot effect.
    expect(KERNEL_INPUT_REVIEW_REGISTER.eindstrategie.dekking).toBe('plan')
    expect(KERNEL_INPUT_REVIEW_REGISTER.inkomenUitgaven.dekking).toBe('uitgaven')
    expect(KERNEL_INPUT_REVIEW_REGISTER.autoGebeurtenissen.dekking).toBe('inkomsten')
    expect(KERNEL_INPUT_REVIEW_REGISTER.woning.dekking).toBe('woning')
    expect(KERNEL_INPUT_REVIEW_REGISTER.onttrekkingsprofiel.dekking).toBe('potten')
  })
})
