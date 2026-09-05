import { describe, it, expect } from 'vitest'
import {
  DATA_NOTE_BELOFTE,
  DATA_NOTE_BY_STEP,
  DATA_NOTE_LINK_LABEL,
  DATA_NOTE_PRIVACY_HREF,
  DATA_NOTE_VERBODEN_FRAGMENTEN,
  dataNoteFor,
  type OnboardingDataNoteStep,
} from './data-note-copy'

const ALLE_STAPPEN = Object.keys(DATA_NOTE_BY_STEP) as OnboardingDataNoteStep[]

describe('data-note-copy — de gegevensregel onder een onboarding-stap', () => {
  it('heeft voor elke stap een regel en levert die via dataNoteFor', () => {
    expect(ALLE_STAPPEN.length).toBeGreaterThan(0)
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap)).toBe(DATA_NOTE_BY_STEP[stap])
      expect(dataNoteFor(stap).length).toBeGreaterThan(20)
    }
  })

  it('draagt op elke stap dezelfde belofte — geen tweede formulering', () => {
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap)).toContain(DATA_NOTE_BELOFTE)
    }
  })

  it('noemt op elke stap dat het later aan te passen is', () => {
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap)).toMatch(/later/)
      expect(dataNoteFor(stap)).toMatch(/aanpassen/)
    }
  })

  it('doet geen belofte die de code niet waarmaakt', () => {
    for (const stap of ALLE_STAPPEN) {
      const regel = dataNoteFor(stap).toLowerCase()
      for (const verboden of DATA_NOTE_VERBODEN_FRAGMENTEN) {
        expect(regel).not.toContain(verboden)
      }
    }
  })

  it('eindigt zonder leesteken, zodat de shell de link erachter kan plakken', () => {
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap)).not.toMatch(/[.!?;:,]$/)
    }
  })

  it('blijft kort genoeg voor één of twee regels op 360 px', () => {
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap).length).toBeLessThanOrEqual(110)
    }
  })

  it('linkt naar de publieke privacyverklaring, niet naar /mijn/privacy', () => {
    // /mijn/privacy kaatst tijdens de onboarding terug naar /onboarding
    // (WF-START-11) zolang onboarding_completed=false.
    expect(DATA_NOTE_PRIVACY_HREF).toBe('/privacy')
    expect(DATA_NOTE_LINK_LABEL).toBe('wat we ermee doen')
  })

  it('spreekt de gebruiker informeel aan (je/jij, nooit u)', () => {
    for (const stap of ALLE_STAPPEN) {
      expect(dataNoteFor(stap)).not.toMatch(/\bu\b|\buw\b/)
    }
  })
})
