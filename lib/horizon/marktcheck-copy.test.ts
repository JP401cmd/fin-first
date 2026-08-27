import { describe, it, expect } from 'vitest'
import { RENDEMENT_MARGE_GRENS } from '@/lib/constants'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'
import {
  margeAnkerKort,
  margeAnkerZin,
  margeKort,
  MARGE_EENHEID,
  margeLegenda,
  margeZin,
} from '@/lib/horizon/marktcheck-copy'

/**
 * De taal van de marktcheck-marge. Pil, legenda, explainer en `aria-label` lezen
 * ALLE VIER deze module — de vorige ronde liet zien wat er gebeurt als copy en
 * motor los van elkaar leven (de pil beloofde "kans dat je plan standhoudt"
 * terwijl het getal iets anders mat).
 *
 * Deze suite toetst de UITKOMST van de formulering: welk getal er staat, welk
 * anker benoemd wordt, en dat de drie vormen elkaar niet tegenspreken.
 */

function marge(over: Partial<RendementMarge> = {}): RendementMarge {
  return {
    marge: 0.018,
    ankerLeeftijd: 55,
    anker: 'stopkeuze',
    begrensd: null,
    ...over,
  }
}

describe('Marktcheck-copy — de pil-waarde', () => {
  it('Given speling, When de korte vorm wordt gelezen, Then staat er een positief getal met nl-NL-komma én de eenheid', () => {
    expect(margeKort(marge({ marge: 0.018 }))).toBe(`1,8 ${MARGE_EENHEID}`)
    expect(margeKort(marge({ marge: 0.064 }))).toBe(`6,4 ${MARGE_EENHEID}`)
  })

  it('Given een tekort, When de korte vorm wordt gelezen, Then draagt het getal een minteken', () => {
    expect(margeKort(marge({ marge: -0.029 }))).toBe(`−2,9 ${MARGE_EENHEID}`)
  })

  it('Given een marge binnen de afronding van nul, When de korte vorm wordt gelezen, Then staat er `0` en géén `−0`', () => {
    // Dit is precies wat je ziet als je stopleeftijd samenvalt met de gesolvede
    // FIRE-leeftijd: het plan gaat per constructie precies op. Zonder deze
    // afronding zou het teken van de zoekruis op het scherm belanden.
    expect(margeKort(marge({ marge: -0.00004 }))).toBe(`0 ${MARGE_EENHEID}`)
    expect(margeKort(marge({ marge: 0.00004 }))).toBe(`0 ${MARGE_EENHEID}`)
  })

  it('Given een begrensde uitkomst, When de korte vorm wordt gelezen, Then staat er een grens en geen schijnprecisie', () => {
    expect(margeKort(marge({ marge: RENDEMENT_MARGE_GRENS, begrensd: 'boven' }))).toBe(`>15 ${MARGE_EENHEID}`)
    expect(margeKort(marge({ marge: -RENDEMENT_MARGE_GRENS, begrensd: 'onder' }))).toBe(`<−15 ${MARGE_EENHEID}`)
  })

  // ── H21/F2 ─ de eenheid mag nooit ontbreken ──────────────────────────────
  // De bevinding: op /toekomst stond `4,1%` naast een `99% succeskans`-widget.
  // Twee grootheden uit twee motoren onder één teken — de marge las als een
  // rampzalige slaagkans terwijl het juist een gezonde speling is. De eenheid
  // hoort daarom IN de waarde te zitten, niet in het label ernaast (dat viel op
  // smal scherm weg).
  it('Given élke uitkomst, When de pil-waarde wordt gelezen, Then draagt hij de eenheid en nooit een kaal procentteken', () => {
    const gevallen = [
      marge({ marge: 0.041 }),
      marge({ marge: -0.029 }),
      marge({ marge: 0.00004 }),
      marge({ marge: RENDEMENT_MARGE_GRENS, begrensd: 'boven' }),
      marge({ marge: -RENDEMENT_MARGE_GRENS, begrensd: 'onder' }),
    ]
    for (const m of gevallen) {
      const kort = margeKort(m)
      expect(kort).toContain(MARGE_EENHEID)
      // Niets in de vorm `4,1%` — een getal dat direct door een procentteken
      // wordt gevolgd is precies de vorm die als kans gelezen wordt.
      expect(kort).not.toMatch(/\d%(?!pt)/)
    }
  })
})

describe('Marktcheck-copy — het anker wordt altijd benoemd', () => {
  it('Given een gekozen stopleeftijd, When het anker wordt verwoord, Then noemt de tekst die leeftijd', () => {
    expect(margeAnkerZin(marge({ ankerLeeftijd: 55 }))).toBe('als je stopt op je 55e')
    expect(margeAnkerKort(marge({ ankerLeeftijd: 55 }))).toBe('bij stoppen op je 55e')
  })

  it('Given de AOW-terugval, When het anker wordt verwoord, Then zegt de tekst dat het om doorwerken tot de AOW gaat', () => {
    const m = marge({ anker: 'aow', ankerLeeftijd: 67 })
    expect(margeAnkerZin(m)).toBe('als je doorwerkt tot je AOW (67)')
    expect(margeAnkerKort(m)).toBe('bij doorwerken tot je AOW (67)')
  })

  it('Given een AOW-leeftijd met maanden, When hij wordt getoond, Then staat er een heel jaar (geen 67,25)', () => {
    expect(margeAnkerZin(marge({ anker: 'aow', ankerLeeftijd: 67.25 }))).toContain('(67)')
  })
})

describe('Marktcheck-copy — legenda en volledige zin zeggen hetzelfde als de motor', () => {
  it('Given speling, When legenda en zin worden gelezen, Then dragen beide hetzelfde getal en dezelfde richting', () => {
    const m = marge({ marge: 0.018, ankerLeeftijd: 55 })
    expect(margeLegenda(m)).toBe('Houdt stand tot 1,8% minder rendement per jaar')
    expect(margeZin(m)).toBe(
      'Stop je op je 55e, dan houdt je plan stand tot je rendement 1,8% per jaar tegenvalt.',
    )
    // Geen jargon: "procentpunt" komt in geen van de vormen voor.
    for (const tekst of [margeKort(m), margeLegenda(m), margeZin(m)]) {
      expect(tekst.toLowerCase()).not.toContain('procentpunt')
    }
  })

  it('Given een tekort, When legenda en zin worden gelezen, Then zeggen beide dat het plan het NIET houdt', () => {
    const m = marge({ marge: -0.029, anker: 'aow', ankerLeeftijd: 67 })
    expect(margeLegenda(m)).toBe('Houdt geen stand — 2,9% extra rendement per jaar nodig')
    expect(margeZin(m)).toBe(
      'Werk je door tot je AOW (67), dan houdt je plan het niet: er is 2,9% per jaar méér rendement voor nodig.',
    )
  })

  it('Given een marge van nul, When de tekst wordt gelezen, Then heet dat "geen speling" i.p.v. "houdt stand tot 0%"', () => {
    const m = marge({ marge: 0.00002, ankerLeeftijd: 53 })
    expect(margeLegenda(m)).toBe('Geen speling — je plan gaat precies op')
    expect(margeZin(m)).toContain('gaat je plan precies op')
  })

  it('Given een begrensde uitkomst, When de tekst wordt gelezen, Then staat er "meer dan" en nooit een exact getal op de grens', () => {
    const boven = marge({ marge: RENDEMENT_MARGE_GRENS, begrensd: 'boven' })
    expect(margeLegenda(boven)).toContain('meer dan 15%')
    expect(margeZin(boven)).toContain('méér dan 15%')

    const onder = marge({ marge: -RENDEMENT_MARGE_GRENS, begrensd: 'onder', anker: 'aow', ankerLeeftijd: 67 })
    expect(margeLegenda(onder)).toContain('meer dan 15%')
    expect(margeZin(onder)).toContain('niet genoeg')
  })
})
