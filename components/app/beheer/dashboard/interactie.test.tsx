/**
 * Wat je op het beheerdashboard kunt DOEN: een dag aanwijzen en vastzetten, de
 * aandachtslijst filteren, de veroorzakers sorteren, ingrepen filteren en het
 * scherm opnieuw laten meten.
 *
 * Vastgelegd: dat elke bediening met muis, aanraking én toetsenbord werkt, dat
 * een filter nooit stil iets verbergt, en dat de bediening geen cijfer
 * verandert (de getallen komen van de server en blijven gelijk).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

import { FIXTURE_NU } from '@/lib/beheer/dashboard/fixture'
import type { AandachtItem } from '@/lib/beheer/dashboard/signalen'
import { AandachtLijst } from './aandacht-lijst'
import { DagReeks } from './dag-reeks'
import { IngrepenFilter } from './ingrepen-filter'
import { IngrepenLijst } from './ingrepen-lijst'
import { Ververs } from './ververs'
import { VeroorzakersLijst, type VeroorzakerRij } from './veroorzakers-lijst'

const NU = new Date(FIXTURE_NU)

describe('DagReeks — een dag aanwijzen', () => {
  const punten = [
    { dag: '2026-09-25', waarde: null },
    { dag: '2026-09-26', waarde: 0 },
    { dag: '2026-09-27', waarde: 12, toelichting: '3 foutsoorten' },
    { dag: '2026-09-28', waarde: 4 },
    { dag: '2026-09-29', waarde: 2, lopend: true },
  ]

  function teken(compact = false) {
    const uit = render(
      <DagReeks
        punten={punten}
        idBasis="test"
        omschrijving="Voorvallen per dag"
        eenheid="voorvallen"
        compact={compact}
        markeringen={[{ dag: '2026-09-27', releases: ['Versie 0.92.012'], beheeracties: 1 }]}
      />,
    )
    const dag = (sleutel: string) => uit.container.querySelector(`[data-dag="${sleutel}"]`) as HTMLElement
    return { ...uit, dag, grafiek: screen.getByTestId('dagreeks-test'), uitlezing: screen.getByTestId('uitlezing-test') }
  }

  it('zegt vooraf hoe de grafiek te bedienen is', () => {
    const { uitlezing } = teken()
    expect(uitlezing).toHaveTextContent('Wijs een dag aan of tik erop')
    expect(uitlezing).toHaveTextContent('pijltjestoetsen')
  })

  it('aanwijzen toont de dag met waarde, toelichting en de ingreep van die dag', () => {
    const { dag, uitlezing } = teken()
    fireEvent.pointerEnter(dag('2026-09-27'))
    expect(uitlezing).toHaveTextContent('27 sep · 12 voorvallen · 3 foutsoorten · Versie 0.92.012, 1 beheeractie')
    expect(dag('2026-09-27')).toHaveAttribute('data-actief', 'ja')
  })

  it('een niet-gemeten dag leest als niet gemeten, nooit als nul', () => {
    const { dag, uitlezing } = teken()
    fireEvent.pointerEnter(dag('2026-09-25'))
    expect(uitlezing).toHaveTextContent('25 sep · niet gemeten')
    expect(uitlezing.textContent).not.toMatch(/\b0\b/)
    // Een echte nul is wel een getal.
    fireEvent.pointerEnter(dag('2026-09-26'))
    expect(uitlezing).toHaveTextContent('26 sep · 0 voorvallen')
  })

  it('de dag van vandaag zegt dat hij nog loopt', () => {
    const { dag, uitlezing } = teken()
    fireEvent.pointerEnter(dag('2026-09-29'))
    expect(uitlezing).toHaveTextContent('29 sep · 2 voorvallen (vandaag, loopt nog)')
  })

  it('de grafiek verlaten laat de dag los', () => {
    const { dag, grafiek, uitlezing } = teken()
    fireEvent.pointerEnter(dag('2026-09-28'))
    fireEvent.pointerLeave(grafiek)
    expect(uitlezing).toHaveTextContent('Wijs een dag aan')
  })

  it('klikken zet de dag vast: hij blijft staan als je de grafiek verlaat of een andere dag aanwijst', () => {
    const { dag, grafiek, uitlezing } = teken()
    fireEvent.click(dag('2026-09-27'))
    expect(grafiek).toHaveAttribute('data-vast', 'ja')
    // "Vastgezet" staat vooraan, zodat het bij een lange regel nooit wegvalt,
    // en de regel zegt hoe je de dag weer loslaat.
    expect(uitlezing.textContent).toMatch(/^vastgezet · 27 sep/)
    expect(uitlezing).toHaveTextContent('klik opnieuw of Esc om los te laten')

    fireEvent.pointerEnter(dag('2026-09-28'))
    fireEvent.pointerLeave(grafiek)
    expect(uitlezing).toHaveTextContent('27 sep · 12 voorvallen')
  })

  it('nog een keer klikken op dezelfde dag laat hem los; klikken op een andere dag verzet hem', () => {
    const { dag, grafiek, uitlezing } = teken()
    fireEvent.click(dag('2026-09-27'))
    fireEvent.click(dag('2026-09-28'))
    expect(uitlezing).toHaveTextContent('28 sep · 4 voorvallen')
    expect(grafiek).toHaveAttribute('data-vast', 'ja')

    fireEvent.click(dag('2026-09-28'))
    expect(grafiek).toHaveAttribute('data-vast', 'nee')
  })

  it('een vastgezette dag ziet er anders uit dan een aangewezen dag', () => {
    const { dag } = teken()
    fireEvent.pointerEnter(dag('2026-09-27'))
    expect(dag('2026-09-27')).not.toHaveAttribute('data-vastgezet')
    expect(dag('2026-09-27').className).not.toContain('outline')

    fireEvent.click(dag('2026-09-27'))
    expect(dag('2026-09-27')).toHaveAttribute('data-vastgezet', 'ja')
    expect(dag('2026-09-27').className).toContain('outline-[var(--ink)]')
    // Alleen de vastgezette dag, niet een andere die je daarna aanwijst.
    fireEvent.pointerEnter(dag('2026-09-28'))
    expect(dag('2026-09-28')).not.toHaveAttribute('data-vastgezet')
  })

  it('aanraken telt alleen als tik: een vinger die over het scherm gaat, wijst niets aan', () => {
    const { dag, uitlezing } = teken()
    fireEvent.pointerEnter(dag('2026-09-27'), { pointerType: 'touch' })
    expect(uitlezing).toHaveTextContent('Wijs een dag aan')
    fireEvent.click(dag('2026-09-27'))
    expect(uitlezing).toHaveTextContent('27 sep · 12 voorvallen')
  })

  it('is met het toetsenbord te bedienen: pijltjes per dag, Home en End naar de randen, Escape laat los', () => {
    const { grafiek, uitlezing } = teken()
    expect(grafiek).toHaveAttribute('tabindex', '0')

    // Zonder gekozen dag begint pijl-links bij de laatste dag.
    fireEvent.keyDown(grafiek, { key: 'ArrowLeft' })
    expect(uitlezing).toHaveTextContent('29 sep')
    fireEvent.keyDown(grafiek, { key: 'ArrowLeft' })
    expect(uitlezing).toHaveTextContent('28 sep · 4 voorvallen')
    fireEvent.keyDown(grafiek, { key: 'Home' })
    expect(uitlezing).toHaveTextContent('25 sep · niet gemeten')
    // Aan de rand blijft de keuze staan.
    fireEvent.keyDown(grafiek, { key: 'ArrowLeft' })
    expect(uitlezing).toHaveTextContent('25 sep')
    fireEvent.keyDown(grafiek, { key: 'End' })
    expect(uitlezing).toHaveTextContent('29 sep')
    fireEvent.keyDown(grafiek, { key: 'ArrowRight' })
    expect(uitlezing).toHaveTextContent('29 sep')

    fireEvent.keyDown(grafiek, { key: 'Escape' })
    expect(uitlezing).toHaveTextContent('Wijs een dag aan')
    expect(grafiek).toHaveAttribute('data-vast', 'nee')
  })

  it('het toetsenbord kiest zonder vast te zetten: de muis werkt daarna gewoon door', () => {
    const { dag, grafiek, uitlezing } = teken()
    fireEvent.keyDown(grafiek, { key: 'ArrowLeft' })
    expect(grafiek).toHaveAttribute('data-vast', 'nee')
    fireEvent.pointerEnter(dag('2026-09-27'))
    expect(uitlezing).toHaveTextContent('27 sep · 12 voorvallen')
  })

  it('een vastgezette dag schuift mee met de pijltjestoetsen en blijft vast', () => {
    const { dag, grafiek, uitlezing } = teken()
    fireEvent.click(dag('2026-09-27'))
    fireEvent.keyDown(grafiek, { key: 'ArrowRight' })
    expect(uitlezing.textContent).toMatch(/^vastgezet · 28 sep/)
    expect(grafiek).toHaveAttribute('data-vast', 'ja')
  })

  it('is voor een schermlezer een schuifregelaar met de gekozen dag als waarde in woorden', () => {
    const { dag, grafiek, uitlezing } = teken()
    expect(grafiek).toHaveAttribute('role', 'slider')
    expect(grafiek).toHaveAccessibleName('Voorvallen per dag. Pijltjestoetsen lezen per dag.')
    expect(grafiek).toHaveAttribute('aria-valuemin', '1')
    expect(grafiek).toHaveAttribute('aria-valuemax', '5')
    expect(grafiek).toHaveAttribute('aria-valuetext', 'Geen dag gekozen')

    fireEvent.keyDown(grafiek, { key: 'ArrowLeft' })
    expect(grafiek).toHaveAttribute('aria-valuenow', '5')
    expect(grafiek).toHaveAttribute('aria-valuetext', '29 sep: 2 voorvallen (vandaag, loopt nog)')
    fireEvent.keyDown(grafiek, { key: 'Home' })
    expect(grafiek).toHaveAttribute('aria-valuenow', '1')
    expect(grafiek).toHaveAttribute('aria-valuetext', '25 sep: niet gemeten')

    fireEvent.click(dag('2026-09-27'))
    expect(grafiek).toHaveAttribute(
      'aria-valuetext',
      '27 sep: 12 voorvallen · 3 foutsoorten · Versie 0.92.012, 1 beheeractie, vastgezet',
    )
    // De zichtbare regel is de vorm voor het oog; de schermlezer leest de waarde
    // van de schuifregelaar en niet nog eens een live-regio bij elke beweging.
    expect(uitlezing).toHaveAttribute('aria-hidden', 'true')
    expect(uitlezing).not.toHaveAttribute('aria-live')
  })

  it('de pijltjes omhoog en omlaag doen hetzelfde als rechts en links (schermlezer op een aanraakscherm)', () => {
    const { grafiek, uitlezing } = teken()
    fireEvent.keyDown(grafiek, { key: 'Home' })
    fireEvent.keyDown(grafiek, { key: 'ArrowUp' })
    expect(uitlezing).toHaveTextContent('26 sep')
    fireEvent.keyDown(grafiek, { key: 'ArrowDown' })
    expect(uitlezing).toHaveTextContent('25 sep')
  })

  it('werkt ook in de compacte grafiek van een kerncijfer', () => {
    const { dag, uitlezing } = teken(true)
    expect(uitlezing).toHaveTextContent('Wijs een dag aan of tik erop.')
    fireEvent.pointerEnter(dag('2026-09-28'))
    expect(uitlezing).toHaveTextContent('28 sep · 4 voorvallen')
  })

  it('aanwijzen verandert geen cijfer: de kolommen houden hun hoogte', () => {
    const { container, dag } = teken()
    const hoogtes = () => [...container.querySelectorAll<HTMLElement>('[data-soort="waarde"]')].map((k) => k.style.height)
    const voor = hoogtes()
    fireEvent.click(dag('2026-09-27'))
    expect(hoogtes()).toEqual(voor)
  })
})

describe('AandachtLijst — filteren', () => {
  const basis: AandachtItem = {
    id: 'x',
    baan: 'nu',
    ernst: 'middel',
    domein: 'technisch',
    titel: 'Titel',
    waarom: 'Waarom',
    impact: { soort: 'onbekend', toelichting: 'Toelichting' },
    sinds: null,
    sindsLabel: 'sinds',
    grond: 'Grond',
    acties: [{ label: 'Open', href: '/beheer/jobs' }],
    onderdelen: [],
    samenloop: null,
  }
  const items: AandachtItem[] = [
    { ...basis, id: 'storing', ernst: 'kritiek', titel: 'AI werkt niet' },
    { ...basis, id: 'taak', ernst: 'hoog', titel: 'Taak loopt achter' },
    { ...basis, id: 'melding', ernst: 'hoog', domein: 'functioneel', titel: 'Melding vastgelopen' },
    { ...basis, id: 'rekenhulp', ernst: 'middel', domein: 'functioneel', titel: 'Rekenhulp wacht' },
    { ...basis, id: 'fiscaal', baan: 'inplannen', ernst: 'laag', domein: 'functioneel', titel: 'Kerngetallen nalopen' },
  ]
  const zichtbaar = () =>
    [...document.querySelectorAll('[data-testid^="aandacht-"][data-domein]')].map((e) =>
      e.getAttribute('data-testid')?.replace('aandacht-', ''),
    )

  it('toont standaard alles, met per filter het aantal', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    expect(zichtbaar()).toEqual(['storing', 'taak', 'melding', 'rekenhulp', 'fiscaal'])
    expect(screen.getByTestId('filter-alles')).toHaveTextContent('Alles 5')
    expect(screen.getByTestId('filter-technisch')).toHaveTextContent('Technisch 2')
    expect(screen.getByTestId('filter-functioneel')).toHaveTextContent('Functioneel 3')
    expect(screen.getByTestId('filter-dringend')).toHaveTextContent('Alleen dringend 3')
    expect(screen.getByTestId('filter-alles')).toHaveAttribute('aria-pressed', 'true')
  })

  it('filtert op domein en houdt de volgorde van de lijst aan', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    fireEvent.click(screen.getByTestId('filter-functioneel'))
    expect(zichtbaar()).toEqual(['melding', 'rekenhulp', 'fiscaal'])
    expect(screen.getByTestId('filter-functioneel')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('filter-alles')).toHaveAttribute('aria-pressed', 'false')
    // De kop zegt hoeveel er van het geheel in beeld zijn.
    expect(screen.getByText('2 van 4')).toBeInTheDocument()
  })

  it('een filter verbergt nooit stil: het zegt hoeveel er buiten beeld zijn en hoeveel daarvan dringend', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    fireEvent.click(screen.getByTestId('filter-functioneel'))
    const melding = screen.getByTestId('filter-melding')
    expect(melding).toHaveTextContent('2 signalen staan buiten beeld door het filter, waarvan 2 dringend.')
    expect(melding).toHaveAttribute('aria-live', 'polite')

    // De knop staat naast de melding, niet erin: anders leest een schermlezer
    // hem bij elke wijziging mee voor.
    expect(within(melding).queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByTestId('filter-toon-alles'))
    expect(zichtbaar()).toHaveLength(5)
    expect(screen.getByTestId('filter-alles')).toHaveAttribute('aria-pressed', 'true')
  })

  it('na "Toon alles" hoort de schermlezer wat er gebeurde en staat de focus op "Alles"', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    // Bij het openen zegt de melding niets.
    expect(screen.getByTestId('filter-melding')).toBeEmptyDOMElement()

    fireEvent.click(screen.getByTestId('filter-functioneel'))
    const knop = screen.getByTestId('filter-toon-alles')
    knop.focus()
    fireEvent.click(knop)

    expect(screen.queryByTestId('filter-toon-alles')).toBeNull()
    expect(screen.getByTestId('filter-melding')).toHaveTextContent('Alle 5 signalen staan weer in beeld.')
    expect(screen.getByTestId('filter-alles')).toHaveFocus()

    // Een nieuw filter haalt die mededeling weer weg.
    fireEvent.click(screen.getByTestId('filter-technisch'))
    expect(screen.getByTestId('filter-melding')).not.toHaveTextContent('staan weer in beeld')
  })

  it('"alleen dringend" laat kritiek en hoog staan en combineert met het domein', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    fireEvent.click(screen.getByTestId('filter-dringend'))
    expect(zichtbaar()).toEqual(['storing', 'taak', 'melding'])
    expect(screen.getByTestId('filter-melding')).toHaveTextContent('2 signalen staan buiten beeld')
    expect(screen.getByTestId('filter-melding')).not.toHaveTextContent('waarvan')

    fireEvent.click(screen.getByTestId('filter-technisch'))
    expect(zichtbaar()).toEqual(['storing', 'taak'])
    expect(screen.getByTestId('filter-melding')).toHaveTextContent('3 signalen staan buiten beeld')
    expect(screen.getByTestId('filter-melding')).toHaveTextContent('waarvan 1 dringend')
  })

  it('nog een keer op hetzelfde domein klikken zet het filter uit', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    fireEvent.click(screen.getByTestId('filter-technisch'))
    fireEvent.click(screen.getByTestId('filter-technisch'))
    expect(zichtbaar()).toHaveLength(5)
  })

  it('een filter zonder treffers zegt dat, en niet dat er niets aan de hand is', () => {
    const alleenTechnisch = items.filter((i) => i.domein === 'technisch')
    render(<AandachtLijst items={alleenTechnisch} nu={NU} />)
    fireEvent.click(screen.getByTestId('filter-functioneel'))
    expect(screen.getByText('Geen signalen binnen dit filter.')).toBeInTheDocument()
    expect(screen.queryByTestId('aandacht-leeg')).toBeNull()
    expect(screen.getByTestId('filter-melding')).toHaveTextContent('waarvan 2 dringend')
  })

  it('klapt de onderbouwing van alle regels tegelijk uit en weer in', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    const details = () => [...document.querySelectorAll('details')]
    expect(details().every((d) => !d.open)).toBe(true)

    const knop = screen.getByTestId('onderbouwing-alles')
    fireEvent.click(knop)
    expect(details().every((d) => d.open)).toBe(true)
    expect(knop).toHaveAttribute('aria-expanded', 'true')
    expect(knop).toHaveTextContent('Onderbouwing inklappen')

    fireEvent.click(knop)
    expect(details().every((d) => !d.open)).toBe(true)
  })

  it('met één signaal valt er niets te filteren', () => {
    render(<AandachtLijst items={[items[0]]} nu={NU} />)
    expect(screen.queryByTestId('aandacht-filter')).toBeNull()
  })

  it('elke knop en elke vervolgactie is groot genoeg om aan te raken', () => {
    render(<AandachtLijst items={items} nu={NU} />)
    for (const e of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(e.className, e.textContent ?? '').toContain('min-h-11')
    }
  })
})

describe('VeroorzakersLijst — sorteren', () => {
  const rij = (deel: Partial<VeroorzakerRij> & Pick<VeroorzakerRij, 'signature' | 'voorbeeld'>): VeroorzakerRij => ({
    context: 'window.onerror',
    stand: 'open',
    voorvallen: 1,
    gebruikers: 1,
    zonderGebruiker: 0,
    laatstGezien: '2026-09-28T09:00:00Z',
    laatstGezienTekst: '28 sep 11:00',
    href: `/beheer/errors?soort=${deel.signature}`,
    ...deel,
  })
  const rijen = [
    rij({ signature: 'a'.repeat(16), voorbeeld: 'Vaak bij één gebruiker', voorvallen: 100, gebruikers: 1 }),
    rij({
      signature: 'b'.repeat(16),
      voorbeeld: 'Raakt velen',
      voorvallen: 12,
      gebruikers: 10,
      laatstGezien: '2026-09-29T08:00:00Z',
      laatstGezienTekst: 'vandaag 10:00',
    }),
    rij({ signature: 'c'.repeat(16), voorbeeld: 'Afgehandeld', voorvallen: 40, gebruikers: 3, stand: 'afgehandeld' }),
    rij({ signature: 'd'.repeat(16), voorbeeld: 'Zonder gebruiker', voorvallen: 5, gebruikers: 0, zonderGebruiker: 5 }),
  ]
  const volgorde = () =>
    within(screen.getByTestId('veroorzakers'))
      .getAllByRole('listitem')
      .map((li) => within(li).getByRole('link').textContent)

  function teken(deel: Partial<Parameters<typeof VeroorzakersLijst>[0]> = {}) {
    return render(<VeroorzakersLijst rijen={rijen} dagen={7} standaardAantal={8} vensterOnvolledig={false} {...deel} />)
  }

  it('staat standaard op de meeste voorvallen', () => {
    teken()
    expect(volgorde()).toEqual(['Vaak bij één gebruiker', 'Afgehandeld', 'Raakt velen', 'Zonder gebruiker'])
    expect(screen.getByTestId('sorteer-voorvallen')).toHaveAttribute('aria-pressed', 'true')
  })

  it('op gebruikers: een fout die velen raakt, staat boven een fout die één gebruiker vaak raakt', () => {
    teken()
    fireEvent.click(screen.getByTestId('sorteer-gebruikers'))
    expect(volgorde()).toEqual(['Raakt velen', 'Afgehandeld', 'Vaak bij één gebruiker', 'Zonder gebruiker'])
  })

  it('op het laatste voorval', () => {
    teken()
    fireEvent.click(screen.getByTestId('sorteer-recent'))
    expect(volgorde()[0]).toBe('Raakt velen')
  })

  it('"alleen open" laat afgehandelde soorten weg en zegt hoeveel er open staan', () => {
    teken()
    expect(screen.getByTestId('alleen-open')).toHaveTextContent('Alleen open 3')
    fireEvent.click(screen.getByTestId('alleen-open'))
    expect(volgorde()).not.toContain('Afgehandeld')
    expect(volgorde()).toHaveLength(3)
  })

  it('sorteren verandert geen getal', () => {
    teken()
    const tekst = (naam: string) =>
      within(screen.getByTestId('veroorzakers'))
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes(naam))?.textContent
    const voor = tekst('Raakt velen')
    fireEvent.click(screen.getByTestId('sorteer-gebruikers'))
    expect(tekst('Raakt velen')).toBe(voor)
    expect(voor).toContain('12×')
    expect(voor).toContain('10 gebr.')
  })

  it('zegt eerlijk wat een ondergrens is en wat onbekend', () => {
    teken({ rijen: [...rijen, rij({ signature: 'e'.repeat(16), voorbeeld: 'Deels zonder', gebruikers: 2, zonderGebruiker: 1 })] })
    const regel = (naam: string) =>
      within(screen.getByTestId('veroorzakers'))
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes(naam)) as HTMLElement
    expect(regel('Deels zonder')).toHaveTextContent('min. 2 gebr.')
    expect(regel('Zonder gebruiker')).toHaveTextContent('gebr. onbekend')
    expect(regel('Raakt velen')).not.toHaveTextContent('min.')
  })

  it('toont de eerste reeks en de rest op verzoek', () => {
    teken({ standaardAantal: 2 })
    expect(volgorde()).toHaveLength(2)
    const knop = screen.getByTestId('veroorzakers-alles')
    expect(knop).toHaveTextContent('Toon alle 4 foutsoorten')
    fireEvent.click(knop)
    expect(volgorde()).toHaveLength(4)
    expect(knop).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('IngrepenFilter', () => {
  const ingreep = (id: string, soort: 'release' | 'beheeractie') => ({
    id,
    soort,
    dag: '2026-09-27',
    moment: null,
    titel: id,
    toelichting: null,
    href: '/beheer/releases',
  })
  const ingrepen = [ingreep('r1', 'release'), ingreep('a1', 'beheeractie'), ingreep('r2', 'release')]

  it('zet het filter op de omhullende laag; de rijen dragen hun soort', () => {
    const { container } = render(
      <IngrepenFilter releases={2} beheeracties={1} eersteReeks={null} naam="de tijdlijn">
        <IngrepenLijst ingrepen={ingrepen} leeg="leeg" />
      </IngrepenFilter>,
    )
    const laag = container.firstElementChild as HTMLElement
    expect(laag).toHaveAttribute('data-toon', 'alles')
    expect(screen.getByTestId('ingrepen-toon-release')).toHaveTextContent('Releases 2')

    fireEvent.click(screen.getByTestId('ingrepen-toon-beheeractie'))
    expect(laag).toHaveAttribute('data-toon', 'beheeractie')
    expect(screen.getByTestId('ingrepen-toon-beheeractie')).toHaveAttribute('aria-pressed', 'true')

    const rijen = within(screen.getByTestId('ingrepen-lijst')).getAllByRole('listitem')
    expect(rijen.map((r) => r.getAttribute('data-soort'))).toEqual(['release', 'beheeractie', 'release'])
    // Elke rij draagt de klassen waarmee ze zich op het filter verbergt.
    for (const r of rijen) expect(r.className).toContain('group-data-[toon=beheeractie]/ingrepen:data-[soort=release]:hidden')
  })

  it('een soortfilter toont ALLE rijen van die soort, ook die voorbij de eerste reeks', () => {
    // De beheeractie staat op de derde plaats, voorbij de eerste reeks van twee.
    // Bleef de grens gelden, dan toonde "Beheeracties 1" een lege lijst.
    const { container } = render(
      <IngrepenFilter releases={2} beheeracties={1} eersteReeks={2} naam="de tabel">
        <IngrepenLijst ingrepen={[ingreep('r1', 'release'), ingreep('r2', 'release'), ingreep('a1', 'beheeractie')]} leeg="leeg" eersteReeks={2} />
      </IngrepenFilter>,
    )
    const laag = container.firstElementChild as HTMLElement
    expect(laag).toHaveAttribute('data-alles', 'nee')
    expect(screen.getByTestId('ingrepen-melding')).toHaveTextContent('De 2 meest recente van 3 ingrepen in beeld.')

    fireEvent.click(screen.getByTestId('ingrepen-toon-beheeractie'))
    expect(laag).toHaveAttribute('data-toon', 'beheeractie')
    expect(laag).toHaveAttribute('data-alles', 'ja')
    expect(screen.getByTestId('ingrepen-melding')).toHaveTextContent('1 beheeractie, allemaal in beeld.')
    // "Toon alle" heeft onder een soortfilter niets te doen.
    expect(screen.queryByTestId('ingrepen-alles')).toBeNull()

    fireEvent.click(screen.getByTestId('ingrepen-toon-release'))
    expect(screen.getByTestId('ingrepen-melding')).toHaveTextContent('2 releases, allemaal in beeld.')

    // Terug naar alles: de grens van de eerste reeks geldt weer.
    fireEvent.click(screen.getByTestId('ingrepen-toon-alles'))
    expect(laag).toHaveAttribute('data-alles', 'nee')
    expect(screen.getByTestId('ingrepen-alles')).toBeInTheDocument()
  })

  it('"toon alle" ontsluit de rijen voorbij de eerste reeks', () => {
    const { container } = render(
      <IngrepenFilter releases={2} beheeracties={1} eersteReeks={2} naam="de tabel">
        <IngrepenLijst ingrepen={ingrepen} leeg="leeg" eersteReeks={2} />
      </IngrepenFilter>,
    )
    const laag = container.firstElementChild as HTMLElement
    expect(laag).toHaveAttribute('data-alles', 'nee')
    const rijen = within(screen.getByTestId('ingrepen-lijst')).getAllByRole('listitem')
    expect(rijen.map((r) => r.getAttribute('data-rest'))).toEqual([null, null, 'ja'])

    fireEvent.click(screen.getByTestId('ingrepen-alles'))
    expect(laag).toHaveAttribute('data-alles', 'ja')
  })

  it('met maar één soort en een korte lijst valt er niets te kiezen', () => {
    render(
      <IngrepenFilter releases={2} beheeracties={0} eersteReeks={12} naam="de tabel">
        <p>inhoud</p>
      </IngrepenFilter>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('inhoud')).toBeInTheDocument()
  })
})

describe('Ververs — nu meten', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('vraagt het scherm opnieuw op en kondigt de nieuwe meting aan', () => {
    render(<Ververs gemetenOm="10:04" />)
    expect(screen.getByTestId('gemeten-om')).toHaveTextContent('Gemeten om 10:04')
    expect(screen.getByTestId('ververs-melding')).toBeEmptyDOMElement()

    // In de test is de verversing meteen klaar; in de app staat de nieuwe
    // meting er op dat moment al.
    fireEvent.click(screen.getByTestId('nu-meten'))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ververs-melding')).toHaveTextContent('opnieuw gemeten om 10:04 (meting 1)')

    // Een tweede meting in dezelfde minuut geeft een andere tekst: die wordt voorgelezen.
    fireEvent.click(screen.getByTestId('nu-meten'))
    expect(screen.getByTestId('ververs-melding')).toHaveTextContent('opnieuw gemeten om 10:04 (meting 2)')
  })

  it('ververst vanzelf elke tien minuten, en kondigt dat niet aan', () => {
    render(<Ververs gemetenOm="10:00" />)
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ververs-melding')).toBeEmptyDOMElement()
  })

  it('ook na een handmatige meting blijft een automatische verversing stil', () => {
    const { rerender } = render(<Ververs gemetenOm="10:04" />)
    fireEvent.click(screen.getByTestId('nu-meten'))
    const naHandmatig = screen.getByTestId('ververs-melding').textContent

    // Tien minuten later ververst het scherm vanzelf en komt er een nieuwe tijd.
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    rerender(<Ververs gemetenOm="10:14" />)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('gemeten-om')).toHaveTextContent('Gemeten om 10:14')
    // De aankondiging is letterlijk dezelfde gebleven: er wordt niets voorgelezen.
    expect(screen.getByTestId('ververs-melding').textContent).toBe(naHandmatig)
    expect(screen.getByTestId('ververs-melding')).not.toHaveTextContent('10:14')
  })

  it('de knop houdt de focus tijdens het meten: niet uitgeschakeld, wel als bezig gemeld', () => {
    render(<Ververs gemetenOm="10:00" />)
    const knop = screen.getByTestId('nu-meten')
    knop.focus()
    fireEvent.click(knop)
    expect(knop).not.toBeDisabled()
    expect(knop).toHaveAttribute('aria-disabled')
    expect(knop).toHaveFocus()
  })

  it('ververst niet op de achtergrond: een verborgen tabblad kost geen leesacties', () => {
    const zichtbaarheid = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<Ververs gemetenOm="10:00" />)
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000)
    })
    expect(mockRefresh).not.toHaveBeenCalled()
    zichtbaarheid.mockRestore()
  })
})
