import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ACTIVITY_MODULES, isActivityModule, MODULE_LABELS, moduleVanPad } from './modules'

/**
 * Gebruiksmeting per app-deel (ADR 0147, fase 2): een pad levert hooguit één
 * gesloten modulesleutel op, en beheer/onbekende paden tellen niet mee.
 */

const ROOT = join(__dirname, '..', '..')

describe('moduleVanPad', () => {
  it.each([
    ['/overzicht', 'overzicht'],
    ['/overzicht/tips', 'overzicht'],
    ['/overzicht/bezittingen', 'bezittingen'],
    ['/overzicht/bezittingen/investment', 'bezittingen'],
    ['/overzicht/schulden/mortgage', 'schulden'],
    ['/overzicht/budget/transacties', 'budget'],
    ['/overzicht/belasting/box3', 'belasting'],
    ['/toekomst', 'toekomst'],
    ['/toekomst/doelen', 'toekomst'],
    ['/horizon/inflatie-koopkracht', 'toekomst'],
    ['/core/assets', 'bezittingen'],
    ['/core/cash/import', 'budget'],
    ['/core/checkin', 'overzicht'],
    ['/dashboard', 'overzicht'],
    ['/rapportages/benchmark', 'rapportages'],
    ['/berichten', 'berichten'],
    ['/nieuws', 'nieuws'],
    ['/mijn/uiterlijk', 'mijn'],
    ['/overzicht/budget?tab=x', 'budget'],
    ['/toekomst/', 'toekomst'],
  ])('%s → %s', (pad, verwacht) => {
    expect(moduleVanPad(pad)).toBe(verwacht)
  })

  it.each([['/beheer/vragenlijsten'], ['/onboarding'], ['/'], ['/overzichten'], ['/check'], [''], [null], [undefined]])(
    '%s telt niet mee',
    (pad) => {
      expect(moduleVanPad(pad as string | null | undefined)).toBeNull()
    },
  )

  it('elke module heeft een label en is herkenbaar', () => {
    for (const m of ACTIVITY_MODULES) {
      expect(MODULE_LABELS[m]).toBeTruthy()
      expect(isActivityModule(m)).toBe(true)
    }
    expect(isActivityModule('beheer')).toBe(false)
  })

  it('de hoofdroutes waar modules op wijzen bestaan in app/(app)', () => {
    for (const route of ['overzicht', 'overzicht/bezittingen', 'overzicht/schulden', 'overzicht/budget', 'overzicht/belasting', 'toekomst', 'rapportages', 'berichten', 'nieuws', 'mijn']) {
      expect(existsSync(join(ROOT, 'app', '(app)', route)), route).toBe(true)
    }
  })
})
