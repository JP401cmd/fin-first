/**
 * De gedeelde body van het nieuwsprofiel (Krant 2C, ADR 0192).
 *
 * Wat hier vastligt:
 *  - de vijf groepen dekken de dertien velden precies één keer (een nieuw veld
 *    zonder plek in een scherm valt op), en elk veld heeft keuze · effect · waarom;
 *  - bandlabels komen uit de bandgrenzen van de matcher (lib/krant/profiel.ts):
 *    wat de lezer kiest is precies de band waarmee de Krant rekent;
 *  - de PUT-body bevat alleen aangeraakte velden (overslaan = ongemoeid), null
 *    = bewust "weet ik niet", en onbekende rubrieken vallen weg;
 *  - schulden: "geen" sluit de rest uit, hoogstens één studieschuldband;
 *  - de hypotheek verschijnt alleen bij een koophuis met hypotheek;
 *  - kiezen roept `zet` aan met de juiste waarde; geen koppen (h1–h6) in de body.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { INKOMEN_BANDEN, LEEG_PROFIEL, SPAARGELD_BANDEN, type NieuwsprofielV1 } from '@/lib/krant/profiel'
import { PROFIEL_VELDEN } from '@/lib/krant/profiel-velden'
import { NEWS_CATEGORIES } from '@/lib/news-item'
import { profielPutBodySchema } from '@/lib/krant/contract'
import {
  PROFIEL_GROEPEN,
  PROFIEL_UITLEG,
  ProfielBody,
  RUBRIEK_LABELS,
  WAARDE_LABELS,
  bandLabel,
  putBodyUitConcept,
  schuldenToggle,
} from './profiel-body'
import { KRANT_ONBOARDING_SCHERMEN } from './krant-onboarding'

afterEach(cleanup)

describe('groepen en uitleg', () => {
  it('de vijf groepen dekken elk profielveld precies één keer', () => {
    const alle = PROFIEL_GROEPEN.flatMap((g) => g.velden)
    expect(PROFIEL_GROEPEN).toHaveLength(5)
    expect([...alle].sort()).toEqual([...PROFIEL_VELDEN].sort())
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('elke groep heeft een onboardingscherm met kop en deck', () => {
    expect(Object.keys(KRANT_ONBOARDING_SCHERMEN).sort()).toEqual(PROFIEL_GROEPEN.map((g) => g.id).sort())
  })

  it('elk veld: label, keuze, effect en waarom — gevuld, geen emoji, geen vrijheidstijd', () => {
    for (const veld of PROFIEL_VELDEN) {
      const u = PROFIEL_UITLEG[veld]
      for (const deel of [u.label, u.keuze, u.effect, u.waarom]) {
        expect(deel.trim().length, `${veld}`).toBeGreaterThan(2)
        expect(deel).not.toMatch(/\p{Extended_Pictographic}/u)
        expect(deel).not.toMatch(/vrijheid|dagen vrij|\bdagtarief\b/i)
        expect(deel).not.toMatch(/vrijgekocht|terugkopen|vrijkopen/i)
      }
    }
  })
})

describe('bandlabels komen uit de bandgrenzen van de matcher', () => {
  it('inkomen en spaargeld: één label per band, gelijk aan bandLabel(band)', () => {
    for (const [sleutel, band] of Object.entries(INKOMEN_BANDEN)) {
      expect(WAARDE_LABELS.inkomen[sleutel as keyof typeof INKOMEN_BANDEN]).toBe(bandLabel(band))
    }
    for (const [sleutel, band] of Object.entries(SPAARGELD_BANDEN)) {
      expect(WAARDE_LABELS.spaargeld[sleutel as keyof typeof SPAARGELD_BANDEN]).toBe(bandLabel(band))
    }
  })

  it('de drie vormen van een band', () => {
    // Intl nl-NL zet een vaste spatie tussen € en het bedrag; vergelijk zonder spaties.
    const plat = (s: string) => s.replace(/\s/g, ' ')
    expect(plat(bandLabel({ lo: 0, hi: 1_750 }))).toBe('Tot € 1.750')
    expect(plat(bandLabel({ lo: 1_750, hi: 2_500 }))).toBe('€ 1.750 – € 2.500')
    expect(plat(bandLabel({ lo: 5_500, hi: null }))).toBe('Meer dan € 5.500')
  })

  it('rubrieken: één label per bestaande rubriek', () => {
    expect(Object.keys(RUBRIEK_LABELS).sort()).toEqual([...NEWS_CATEGORIES].sort())
  })
})

describe('putBodyUitConcept', () => {
  const profiel: NieuwsprofielV1 = {
    ...LEEG_PROFIEL,
    inkomen: '2500-3250',
    kinderen: null,
    spaargeld: '5k-25k',
    rubrieken: ['rente', 'sport-oud'],
  }

  it('alleen aangeraakte velden; niets aangeraakt = niets op te slaan', () => {
    expect(putBodyUitConcept(profiel, new Set())).toBeNull()
    expect(putBodyUitConcept(profiel, new Set(['inkomen', 'kinderen'] as const))).toEqual({ inkomen: '2500-3250', kinderen: null })
  })

  it('beperkt tot één groep (een onboardingscherm)', () => {
    const wie = PROFIEL_GROEPEN[0]!.velden
    expect(putBodyUitConcept(profiel, new Set(['inkomen', 'kinderen'] as const), wie)).toEqual({ kinderen: null })
  })

  it('onbekende rubrieken vallen weg; een lege lijst wordt null — en de body is geldig voor de route', () => {
    const body = putBodyUitConcept(profiel, new Set(['rubrieken'] as const))
    expect(body).toEqual({ rubrieken: ['rente'] })
    expect(profielPutBodySchema.safeParse(body).success).toBe(true)
    expect(putBodyUitConcept({ ...profiel, rubrieken: ['sport-oud'] }, new Set(['rubrieken'] as const))).toEqual({ rubrieken: null })
  })
})

describe('schuldenToggle', () => {
  it('"geen" sluit de rest uit, en andersom', () => {
    expect(schuldenToggle(['consumptief-krediet'], 'geen')).toEqual(['geen'])
    expect(schuldenToggle(['geen'], 'consumptief-krediet')).toEqual(['consumptief-krediet'])
  })
  it('hoogstens één studieschuldband', () => {
    expect(schuldenToggle(['studieschuld-tot-15k', 'consumptief-krediet'], 'studieschuld-15k-40k')).toEqual([
      'consumptief-krediet',
      'studieschuld-15k-40k',
    ])
  })
  it('nog een keer klikken haalt de waarde weg', () => {
    expect(schuldenToggle(['geen'], 'geen')).toEqual([])
  })
})

describe('<ProfielBody>', () => {
  function renderBody(profiel: NieuwsprofielV1, velden: readonly (typeof PROFIEL_VELDEN)[number][]) {
    const zet = vi.fn()
    const r = render(<ProfielBody profiel={profiel} velden={velden} zet={zet} gewijzigd={new Set()} />)
    return { zet, ...r }
  }

  it('toont elk veld als fieldset met zijn uitleg, zonder eigen koppen', () => {
    const { container } = renderBody(LEEG_PROFIEL, ['huishouden', 'inkomen'])
    expect(screen.getByRole('group', { name: 'Huishouden' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Netto inkomen per maand' })).toBeTruthy()
    expect(screen.getByText(new RegExp(PROFIEL_UITLEG.inkomen.effect.slice(0, 30)))).toBeTruthy()
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
  })

  it('de hypotheek alleen bij een koophuis met hypotheek', () => {
    renderBody({ ...LEEG_PROFIEL, wonen: 'huur-sociaal' }, ['wonen', 'hypotheek'])
    expect(screen.queryByRole('group', { name: 'Hypotheek' })).toBeNull()
    cleanup()
    renderBody({ ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek' }, ['wonen', 'hypotheek'])
    expect(screen.getByRole('group', { name: 'Hypotheek' })).toBeTruthy()
  })

  it('een band kiezen, en "weet ik niet", roepen zet aan met de juiste waarde', () => {
    const { zet } = renderBody(LEEG_PROFIEL, ['inkomen'])
    // De normalizer van testing-library maakt van de vaste spatie (Intl) een gewone.
    fireEvent.click(screen.getByLabelText(WAARDE_LABELS.inkomen['2500-3250'].replace(/\s/g, ' ')))
    expect(zet).toHaveBeenLastCalledWith('inkomen', '2500-3250')
    fireEvent.click(screen.getByLabelText('Weet ik niet'))
    expect(zet).toHaveBeenLastCalledWith('inkomen', null)
  })

  it('meerkeuze: aanvinken voegt toe, alles uit wordt null', () => {
    const { zet } = renderBody({ ...LEEG_PROFIEL, werk: ['loondienst'] }, ['werk'])
    fireEvent.click(screen.getByLabelText('Zelfstandig ondernemer'))
    expect(zet).toHaveBeenLastCalledWith('werk', ['loondienst', 'zelfstandig'])
    fireEvent.click(screen.getByLabelText('In loondienst'))
    expect(zet).toHaveBeenLastCalledWith('werk', null)
  })

  it('geboortejaar: alleen een geldig jaar gaat door; daarbuiten een melding', () => {
    const { zet } = renderBody(LEEG_PROFIEL, ['geboortejaar'])
    const input = screen.getByLabelText('Geboortejaar') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1899' } })
    expect(zet).not.toHaveBeenCalled()
    expect(screen.getByText(/tussen 1920 en 2020/)).toBeTruthy()
    fireEvent.change(input, { target: { value: '1985' } })
    expect(zet).toHaveBeenLastCalledWith('geboortejaar', 1985)
  })
})
