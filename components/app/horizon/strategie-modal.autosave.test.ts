import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Bron-grendel bij de bug van 14 sep 2026: de altijd-gemounte `StrategieModal`
 * schreef bij élke /toekomst-lading `fire_stop_anchor: 'solved'` terug, omdat het
 * autosave-effect de gedebouncede kopie (beginwaarde solved) vergeleek met het
 * zojuist geladen `savedPlan` — en dat verschil als gebruikerswijziging opsloeg.
 * De poort zit nu in `shouldAutosavePlanDraft` (lib/horizon/plan-draft.ts), die
 * eist dat de debounce de live `planDraft` heeft ingehaald. Deze grendel pint dat
 * het effect die poort ook echt gebruikt, mét `planDraft` erin.
 */
const BRON = readFileSync(path.join(process.cwd(), 'components/app/horizon/strategie-modal.tsx'), 'utf8')

describe('StrategieModal — autosave loopt via shouldAutosavePlanDraft', () => {
  it('het effect roept de poort aan met de live planDraft én de gedebouncede kopie', () => {
    expect(BRON).toMatch(/shouldAutosavePlanDraft\(\{[\s\S]*?planDraft,[\s\S]*?debouncedPlan,[\s\S]*?\}\)/)
  })
  it('geen losse vergelijking debouncedPlan↔savedPlan meer buiten de poort om', () => {
    expect(BRON).not.toContain('planDraftEquals(debouncedPlan, savedPlan)')
  })
})
