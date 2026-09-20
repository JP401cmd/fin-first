import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LabKnoppen, type LabKnopConfig, type LabKnopFormatters } from './lab-knoppen'
import { HEFBOOM_KEYS, type HefboomKey } from '@/lib/horizon/lab-grenzen-types'

/**
 * LabKnoppen — het doelscenario-blok (ADR 0170): vaste knopvolgorde, één uitkomstregel voor
 * beide ankers, en het ingeklapte marktbias-blok. De host levert alles geformatteerd; deze
 * test bewaakt dat het component niets zelf verzint en niets stil weglaat.
 */

const FORMATTERS: Record<HefboomKey, LabKnopFormatters> = {
  verdienen: { value: (v) => `+€ ${v}`, delta: (d) => `+€ ${d}`, grens: (v) => `+€ ${v}` },
  uitgeven: { value: (v) => `−€ ${v}`, grens: (v) => `−€ ${v}` },
  uitgaveNaPensioen: { value: (v) => `€ ${v}/jr`, grens: (v) => `€ ${v}` },
  nalatenschap: { value: (v) => `€ ${v}`, grens: (v) => `€ ${v}` },
  stop: { value: (v) => `${v} jr`, grens: (v) => `${v}` },
}

function knop(over: Partial<LabKnopConfig> = {}): LabKnopConfig {
  return {
    value: 50,
    basis: 0,
    bereik: { min: 0, max: 100, stap: 10 },
    grenzen: { gedekt: 40, ruim: 70, heel: null },
    onChange: vi.fn(),
    ...over,
  }
}

const ALLE: Partial<Record<HefboomKey, LabKnopConfig>> = {
  verdienen: knop(),
  uitgeven: knop(),
  uitgaveNaPensioen: knop(),
  nalatenschap: knop(),
  stop: knop({ value: 62, basis: 62, bereik: { min: 40, max: 90, stap: 0.5 } }),
}

function renderBlok(over: Partial<React.ComponentProps<typeof LabKnoppen>> = {}) {
  const props: React.ComponentProps<typeof LabKnoppen> = {
    vraag: 'Kun je op 62 stoppen?',
    knoppen: ALLE,
    uitkomst: { kind: 'dekking', reikt: '84 → 90', gedekt: '78% → 100%', eindvermogen: '€ 0 → € 50.000' },
    zone: 'oranje',
    formatters: FORMATTERS,
    ...over,
  }
  render(<LabKnoppen {...props} />)
  return props
}

describe('LabKnoppen — volgorde en zichtbaarheid', () => {
  it('rendert de vijf knoppen in de vaste schermvolgorde', () => {
    renderBlok()
    const ids = screen
      .getAllByRole('slider')
      .map((el) => el.getAttribute('id'))
    expect(ids).toEqual([...HEFBOOM_KEYS])
  })

  it('een knop die de host niet levert, wordt niet gerenderd', () => {
    renderBlok({ knoppen: { verdienen: knop(), uitgeven: knop() } })
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    expect(screen.queryByTestId('lab-knop-stop')).toBeNull()
  })

  it('ontbrekende nalatenschap-knop met notitie: zegt waarom in plaats van stil weg te laten', () => {
    renderBlok({
      knoppen: { verdienen: knop() },
      nalatenschapNotitie: 'Je plan houdt je vermogen in stand, dus er is geen nalatenschap om aan te draaien.',
    })
    expect(screen.getByTestId('lab-knop-nalatenschap-notitie').textContent).toContain('in stand')
  })

  it('zonder notitie blijft de ontbrekende knop gewoon weg', () => {
    renderBlok({ knoppen: { verdienen: knop() } })
    expect(screen.queryByTestId('lab-knop-nalatenschap-notitie')).toBeNull()
  })
})

describe('LabKnoppen — uitkomstregel en zone', () => {
  it('vast stopmoment: reikt tot · gedekt · eindvermogen', () => {
    renderBlok()
    expect(screen.getByTestId('lab-uitkomst-reikt').textContent).toBe('84 → 90')
    expect(screen.getByTestId('lab-uitkomst-gedekt').textContent).toBe('78% → 100%')
    expect(screen.getByTestId('lab-uitkomst-eindvermogen').textContent).toBe('€ 0 → € 50.000')
  })

  it('zonder eindvermogen blijft die cel weg (geen lege kicker)', () => {
    renderBlok({ uitkomst: { kind: 'dekking', reikt: '84', gedekt: '78%', eindvermogen: null } })
    expect(screen.queryByTestId('lab-uitkomst-eindvermogen')).toBeNull()
  })

  it('zo vroeg als het kan: vrij op · verschil', () => {
    renderBlok({ uitkomst: { kind: 'vrijheidsleeftijd', vrijOp: '55,3 → 54,1', verschil: '14 mnd eerder vrij' } })
    expect(screen.getByTestId('lab-uitkomst-vrij-op').textContent).toBe('55,3 → 54,1')
    expect(screen.getByTestId('lab-uitkomst-verschil').textContent).toBe('14 mnd eerder vrij')
    expect(screen.queryByTestId('lab-uitkomst-gedekt')).toBeNull()
  })

  it('de zone-pil draagt het woord van de huidige stand; zonder zone "nog aan het rekenen"', () => {
    renderBlok({ zone: 'groen' })
    expect(screen.getByTestId('lab-zone').textContent).toBe('ruim gedekt')
    renderBlok({ zone: null })
    expect(screen.getAllByTestId('lab-zone')[1].textContent).toBe('nog aan het rekenen')
  })

  it('de vraag staat standaard als h2 — op /toekomst is dit de eerste kop na de shell-h1', () => {
    // ADR 0110: nooit een niveau overslaan. De grafiekkaart draagt zelf geen kop en
    // `SectionLabel` is een div, dus een h3 zou hier van h1 naar h3 springen.
    renderBlok()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Kun je op 62 stoppen?')
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('met level="h3" staat hij één niveau lager (voor een host die al een h2 draagt)', () => {
    renderBlok({ level: 'h3' })
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Kun je op 62 stoppen?')
  })
})

describe('LabKnoppen — marktbias en slots', () => {
  it('het rendement-blok staat ingeklapt en klapt op verzoek open', () => {
    renderBlok({ marktbias: <p>rendement-inhoud</p> })
    const toggle = screen.getByRole('button', { name: /Rendement per categorie/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('rendement-inhoud')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('rendement-inhoud')).toBeTruthy()
  })

  it('zonder marktbias-inhoud geen toggle', () => {
    renderBlok()
    expect(screen.queryByRole('button', { name: /Rendement per categorie/ })).toBeNull()
  })

  it('in balk-vorm hangt het stop-slot onder de stop-knop, niet onder de eerste', () => {
    renderBlok({ weergave: 'balk', stopSlot: <span data-testid="plan-actie">Maak dit mijn stopmoment</span> })
    const stopKnop = screen.getByTestId('lab-knop-stop')
    expect(stopKnop.contains(screen.getByTestId('plan-actie'))).toBe(true)
  })

  it('in wijzer-vorm staat het stop-slot onder het hele blok, niet geknepen onder één meter', () => {
    // Vijf meters naast elkaar maakt de cel te smal voor twee tekstlinks; bovendien gaan de
    // plan-acties over het plan als geheel, niet over die ene knop.
    renderBlok({ stopSlot: <span data-testid="plan-actie">Maak dit mijn stopmoment</span> })
    const actie = screen.getByTestId('plan-actie')
    expect(screen.getByTestId('lab-knop-stop').contains(actie)).toBe(false)
    expect(actie).toBeTruthy()
  })
})

describe('LabKnoppen — de twee vormen (ADR 0170, 20 sep 2026)', () => {
  it('standaard wijzers: elke knop tekent de halfronde meter, geen balk-as', () => {
    renderBlok()
    expect(screen.getByTestId('lab-knop-verdienen-meter')).toBeTruthy()
    expect(screen.queryByTestId('lab-knop-verdienen-as')).toBeNull()
    // Dezelfde drie zones als de balk — één bron (`labSegmenten`), twee vormen.
    expect(screen.getByTestId('lab-knop-verdienen-segment-rood')).toBeTruthy()
    expect(screen.getByTestId('lab-knop-verdienen-segment-groen')).toBeTruthy()
  })

  it('de greep houdt een vaste maat van 44px, dus niet meeschalend met de meter', () => {
    renderBlok()
    const greep = screen.getByTestId('lab-knop-verdienen-greep')
    // Een SVG-cirkel zou met de viewBox meeschalen en in het twee-koloms raster op een
    // telefoon terugzakken tot ~32px — precies waar de vinger 'm nodig heeft.
    expect(greep.tagName).toBe('DIV')
    expect(greep.className).toContain('h-11')
    expect(greep.className).toContain('w-11')
  })

  it('weergave "balk" geeft elke knop een gekleurde as in plaats van een meter', () => {
    renderBlok({ weergave: 'balk' })
    expect(screen.getByTestId('lab-knop-verdienen-as')).toBeTruthy()
    expect(screen.queryByTestId('lab-knop-verdienen-meter')).toBeNull()
  })

  it('beide vormen houden dezelfde bediening en dezelfde grensregel', () => {
    renderBlok()
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(5)
    expect(sliders[0].getAttribute('aria-valuetext')).toContain('+€ 50')
    expect(screen.getByTestId('lab-knop-verdienen-grens').textContent).toBe(
      'gedekt vanaf +€ 40 · ruim vanaf +€ 70',
    )
  })

  it('de schakelaar verschijnt alleen wanneer de host de keuze bewaart', () => {
    renderBlok()
    expect(screen.queryByTestId('lab-weergave')).toBeNull()
    const onWeergaveChange = vi.fn()
    renderBlok({ onWeergaveChange })
    fireEvent.click(screen.getByRole('button', { name: 'Balken' }))
    expect(onWeergaveChange).toHaveBeenCalledWith('balk')
    // De standaard is de wijzer; die staat dus ingedrukt zolang de host niets anders zegt.
    expect(screen.getByRole('button', { name: 'Wijzers' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('LabKnoppen — live-regio', () => {
  it('een gewijzigde stand wordt sr-only aangekondigd; de eerste render zwijgt', () => {
    const props: React.ComponentProps<typeof LabKnoppen> = {
      vraag: 'Kun je op 62 stoppen?',
      knoppen: ALLE,
      uitkomst: null,
      zone: 'oranje',
      formatters: FORMATTERS,
    }
    const { rerender } = render(<LabKnoppen {...props} />)
    // Bij het openen van de pagina mag de live-regio niets voorlezen — er is niets gebeurd.
    expect(screen.getByTestId('lab-knop-melding').textContent).toBe('')
    rerender(<LabKnoppen {...props} knoppen={{ ...ALLE, verdienen: knop({ value: 80 }) }} />)
    expect(screen.getByTestId('lab-knop-melding').textContent).toBe('Meer verdienen staat nu op +€ 80.')
  })
})

describe('LabKnoppen — de rad-vorm (ADR 0170 B11)', () => {
  it('toont één balk naast het rad, met alle beschikbare onderwerpen op het rad', () => {
    renderBlok({ weergave: 'rad' })
    expect(screen.getByTestId('lab-rad-rij')).toBeTruthy()
    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(screen.getAllByRole('option').map((el) => el.id)).toEqual(
      HEFBOOM_KEYS.map((k) => `lab-rad-${k}`),
    )
    // De balk verbergt zijn eigen label — het rad ís het label. De naam blijft wél op het
    // range-element staan (aria-label), dus de toegankelijkheidsboom verliest niets.
    expect(screen.queryByTestId('lab-knop-verdienen-as')).toBeTruthy()
    expect(screen.getByTestId('lab-knop-verdienen').textContent).not.toContain('Meer verdienen')
    expect(screen.getByRole('slider').getAttribute('aria-label')).toBe('Meer verdienen')
  })

  it('het rad draagt per onderwerp de zone van dát onderwerp — dezelfde afleiding als de knop', () => {
    renderBlok({
      weergave: 'rad',
      knoppen: {
        verdienen: knop({ value: 20 }), // onder gedekt (40) ⇒ rood
        stop: knop({ value: 80, basis: 62, bereik: { min: 40, max: 90, stap: 0.5 } }), // boven ruim ⇒ groen
      },
    })
    expect(screen.getByTestId('lab-rad-verdienen-punt').getAttribute('data-zone')).toBe('rood')
    expect(screen.getByTestId('lab-rad-stop-punt').getAttribute('data-zone')).toBe('groen')
  })

  it('van onderwerp wisselen wisselt de balk', () => {
    renderBlok({ weergave: 'rad' })
    expect(screen.getByRole('slider').getAttribute('id')).toBe('verdienen')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    expect(screen.getByRole('slider').getAttribute('id')).toBe('uitgeven')
  })

  it('een verdwenen onderwerp valt terug op het eerste dat er wél is, en de notitie staat niet op het rad', () => {
    renderBlok({
      weergave: 'rad',
      knoppen: { uitgeven: knop(), stop: knop() },
      nalatenschapNotitie: 'Je plan houdt je vermogen in stand.',
    })
    expect(screen.getByRole('slider').getAttribute('id')).toBe('uitgeven')
    expect(screen.queryByTestId('lab-knop-nalatenschap-notitie')).toBeNull()
  })

  it('de schakelaar kent alle vormen uit KNOP_WEERGAVEN en de plan-acties staan onder het blok', () => {
    renderBlok({ weergave: 'rad', onWeergaveChange: vi.fn(), stopSlot: <a href="#">Je plan-keuzes</a> })
    const knoppen = screen.getByTestId('lab-weergave').querySelectorAll('button')
    expect([...knoppen].map((b) => b.textContent)).toEqual(['Balken', 'Wijzers', 'Rad', 'Harp', 'Vijfhoek'])
    expect(screen.getByText('Je plan-keuzes')).toBeTruthy()
  })
})

describe('LabKnoppen — de harp-vorm (ADR 0170 B12)', () => {
  it('toont alle vijf stroken als één figuur, met de plan-acties onder het blok', () => {
    renderBlok({ weergave: 'harp', stopSlot: <span data-testid="plan-actie">Maak dit mijn stopmoment</span> })
    expect(screen.getByTestId('lab-harp')).toBeTruthy()
    expect(screen.getAllByRole('slider').map((el) => el.id)).toEqual([...HEFBOOM_KEYS])
    expect(screen.getByTestId('lab-harp-plan')).toBeTruthy()
    expect(screen.getByTestId('lab-harp').contains(screen.getByTestId('plan-actie'))).toBe(false)
    expect(screen.getByTestId('plan-actie')).toBeTruthy()
  })
})

describe('LabKnoppen — de vijfhoek-vorm (ADR 0170 B12)', () => {
  it('toont één pentagram met alle vijf inputs in de legenda, en de plan-acties onder het blok', () => {
    renderBlok({ weergave: 'vijfhoek', stopSlot: <span data-testid="plan-actie">Maak dit mijn stopmoment</span> })
    expect(screen.getByTestId('lab-vijfhoek')).toBeTruthy()
    expect(screen.getByTestId('lab-vijfhoek-plan')).toBeTruthy()
    expect(screen.getAllByRole('slider').map((el) => el.id)).toEqual([...HEFBOOM_KEYS])
    expect(screen.getByTestId('lab-vijfhoek').contains(screen.getByTestId('plan-actie'))).toBe(false)
    expect(screen.getByTestId('plan-actie')).toBeTruthy()
  })
})
