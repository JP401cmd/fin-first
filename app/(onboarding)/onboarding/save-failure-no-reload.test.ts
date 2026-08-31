/**
 * Bron-grendel op de tweede helft van besluit C3 (optie A, aug 2026):
 * "geen reload na een mislukte save".
 *
 * WAAROM EEN BRON-TEST: het te bewijzen feit is een AFWEZIGHEID — er mag in het
 * foutpad van `handleSaveOwnData` geen enkele navigatie/reload staan. Een
 * render-test kan aantonen dat één pad geen reload doet, maar niet dat er
 * nérgens in dat blok later een `window.location.reload()` of `router.replace()`
 * bijkomt. Precies dat is de regressie die de gebruiker z'n invoer kost: de
 * bedragen, bezittingen en schulden leven alléén in de in-memory reducer-state
 * (`draft-persistence.ts` persisteert ze bewust niet), dus een reload op het
 * foutpad wist ze definitief. Precedent voor deze vorm:
 * `components/app/horizon/horizon-client.euro-view.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'app', '(onboarding)', 'onboarding', 'page.tsx')

const START_BAKEN = '── OPSLAG-FOUT: GEEN NAVIGATIE'
const EIND_BAKEN = '── EINDE OPSLAG-FOUT'

/** Alles wat de pagina zou herladen of wegnavigeren, en dus de state wist. */
const NAVIGATIE_PATRONEN: readonly RegExp[] = [
  /location\s*\.\s*(reload|assign|replace|href)/,
  /\brouter\s*\.\s*(push|replace|refresh|back)\s*\(/,
  /\bredirect\s*\(/,
  /<\s*Redirect\b/,
]

function leesFoutblok(): string {
  const bron = readFileSync(SOURCE_PATH, 'utf8')
  const start = bron.indexOf(START_BAKEN)
  const eind = bron.indexOf(EIND_BAKEN)
  expect(start, `baken "${START_BAKEN}" ontbreekt in page.tsx`).toBeGreaterThan(-1)
  expect(eind, `baken "${EIND_BAKEN}" ontbreekt in page.tsx`).toBeGreaterThan(start)
  return bron.slice(start, eind)
}

describe('onboarding: mislukte eindopslag navigeert niet (C3)', () => {
  it('bevat geen reload/redirect in het foutafhandelingsblok', () => {
    const blok = leesFoutblok()
    for (const patroon of NAVIGATIE_PATRONEN) {
      expect(patroon.test(blok), `foutpad bevat navigatie die matcht op ${patroon}`).toBe(false)
    }
  })

  it('herstelt de gebruiker naar de laatste inhoudsstap met behoud van state', () => {
    const blok = leesFoutblok()
    // De enige toegestane "verplaatsing" is een reducer-dispatch: die houdt de
    // ingevulde bedragen/posten in dezelfde in-memory state.
    expect(blok).toContain("dispatch({ type: 'SET_STEP'")
    // De melding draagt sinds de scheiding validatie/opslag haar oorzaak mee;
    // dit blok is per definitie het opslagpad. De technische fouttekst gaat
    // naar de console, niet naar de state — de banner toont er toch de vaste
    // tekst, en meereizen zou suggereren dat hij de gebruiker bereikt.
    expect(blok).toContain("setSaveError({ kind: 'save' })")
    expect(blok).toContain('console.error')
  })
})

/**
 * Het validatiepad (ontbrekende naam/geboortedatum) zette dezelfde melding-state
 * als een échte opslagfout, waardoor de gebruiker "Opslaan mislukt — ververs de
 * pagina niet" las terwijl er nooit iets naar de server was gegaan. De copy-
 * beslissing zelf is getest in `draft-notice-copy.test.ts`; hier grendelen we
 * dat de bron beide oorzaken ook werkelijk gescheiden aanlevert — anders is die
 * beslissing niet meer te nemen.
 */
describe('onboarding: validatiemelding is geen opslagfout', () => {
  it('markeert het validatiepad expliciet als kind "validation"', () => {
    const bron = readFileSync(SOURCE_PATH, 'utf8')
    // Regex i.p.v. `toContain`: de regeleindes in de werkboom mogen CRLF zijn.
    expect(/setSaveError\(\{\s*kind:\s*'validation',/.test(bron)).toBe(true)
  })

  it('zet geen enkele melding meer als kale string', () => {
    const bron = readFileSync(SOURCE_PATH, 'utf8')
    expect(/setSaveError\(\s*['"`]/.test(bron)).toBe(false)
  })

  it('rendert de banner uit de gedeelde beslissing, niet uit de save-copy', () => {
    const bron = readFileSync(SOURCE_PATH, 'utf8')
    expect(bron).toContain('resolveNoticeDisplay(saveError)')
    // SAVE_FAILED_NOTICE hoort nog uitsluitend in draft-notice-copy.ts te
    // worden gelezen; staat hij hier weer, dan is de banner-copy opnieuw
    // hardgedraaid op het opslaggeval.
    expect(bron).not.toContain('SAVE_FAILED_NOTICE')
  })
})
