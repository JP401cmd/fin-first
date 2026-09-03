import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JaarruimteCard } from './jaarruimte-card'
import { computeJaarruimte, JAARRUIMTE_FRANCHISE_2025 } from '@/lib/jaarruimte'

/** De DOM-tekst draagt punt-duizendtallen; die zijn regex-metatekens. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('JaarruimteCard — render (default 2026)', () => {
  it('toont empty-CTA wanneer grossYearlyIncome = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={0} />)
    expect(screen.getByText(/Vul je bruto-jaarinkomen aan/i)).toBeTruthy()
  })

  it('toont jaarruimte-bedrag bij modaal inkomen', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    // €9.248 onbenut (30% × (50000 − 19172), 2026-franchise). Verschijnt zowel
    // als headline als de default inleg-waarde van de slider → meerdere matches.
    expect(screen.getAllByText(/€\s*9\.248/).length).toBeGreaterThan(0)
    expect(screen.getByText(/onbenut/i)).toBeTruthy()
  })

  it('toont "€ 0 onbenut" bij ruimte = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />)
    // factor A €10.000 × 6,27 = 62.700 ≫ basis 9.248 → 0 ruimte
    expect(screen.getByText(/€ 0/)).toBeTruthy()
    expect(screen.getByText(/Je werkgever vult je pensioenaangroei volledig/i)).toBeTruthy()
  })

  it('toont besparings-schatting in de simulator (marginaal-correct via jaarruimteBesparing)', () => {
    render(
      <JaarruimteCard
        grossYearlyIncome={50_000}
      />,
    )
    // Simulator-inleg default = volledige jaarruimte €9.248.
    // Marginaal-correct via jaarruimteBesparing(50000, 9248, 2026) =
    // computeBox1Tax(50000).tax − computeBox1Tax(50000 − 9248).tax = €4.258
    // (ADR 0040/0041 — vervangt de oude vlakke inleg × marginaal-benadering).
    expect(screen.getByText(/€\s*4\.258/)).toBeTruthy()
    expect(screen.getByText(/Belastingbesparing/i)).toBeTruthy()
    // 4258 / 9248 ≈ 46% effectief
    expect(screen.getByText(/≈ 46% effectief/)).toBeTruthy()
  })

  // S12 — BEWUST HERZIEN (eigenaarsbesluit 26-08-2026). Deze test hing aan de
  // voetalinea die de formule uit `JaarruimteUitleg` letterlijk dupliceerde.
  // De rekensom staat nu nog op precies één plek (het uitlegblok direct boven
  // deze kaart, op de enige pagina die 'm gebruikt). Wat de kaart moet blijven
  // dragen is de Wft-regel — die assertie is hier de vervanging, plus het
  // negatieve bewijs dat de dubbeling weg is.
  it('draagt de Wft-regel maar niet langer de gedupliceerde formule (S12)', () => {
    const { container } = render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/Indicatie, geen advies/i)).toBeTruthy()
    const tekst = container.textContent ?? ''
    expect(tekst).not.toMatch(/×\s*\(inkomen/)
    expect(tekst).not.toMatch(/19\.172/)
    expect(tekst).not.toMatch(/35\.589/)
    expect(tekst).not.toMatch(/gepubliceerde referentiewaarde/)
  })

  // S12 — BEWUST HERZIEN. De 18.475-assertie hing uitsluitend aan diezelfde
  // voetalinea. Vervangen door een STERKERE pin: de gerenderde headline wordt
  // vergeleken met de canonieke engine-uitvoer voor exact deze invoer, zodat
  // weergave-drift (verkeerd jaar, verkeerde franchise) zichtbaar wordt in
  // plaats van alleen "er staat een getal".
  it('respecteert expliciet jaar 2025 (gepind op computeJaarruimte)', () => {
    const verwacht = computeJaarruimte(50_000, 0, { year: 2025 })
    expect(verwacht.franchise).toBe(JAARRUIMTE_FRANCHISE_2025)
    render(<JaarruimteCard grossYearlyIncome={50_000} year={2025} />)
    const cijfers = new Intl.NumberFormat('nl-NL').format(verwacht.jaarruimte)
    expect(
      screen.getAllByText(new RegExp(`€\\s*${escapeRegExp(cijfers)}`)).length,
    ).toBeGreaterThan(0)
  })
})

describe('JaarruimteCard — lijfrente-simulator', () => {
  it('toont de inleg-slider wanneer er jaarruimte is', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByLabelText(/Lijfrente-inleg dit jaar/i)).toBeTruthy()
  })

  it('verlaagt de besparing wanneer de inleg-slider zakt', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} />,
    )
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i)
    // Slepen snapt op het stapraster (9.248/100 → stap 92); 2.024 = 22 × 92.
    fireEvent.change(slider, { target: { value: '2024' } })
    // Marginaal-correct via jaarruimteBesparing(50000, 2024, 2026) =
    // computeBox1Tax(50000).tax − computeBox1Tax(47976).tax = €1.021
    expect(screen.getByText(/€\s*1\.021/)).toBeTruthy()
  })

  it('toont géén slider wanneer er geen jaarruimte is', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />,
    )
    expect(screen.queryByLabelText(/Lijfrente-inleg dit jaar/i)).toBeNull()
  })
})

describe('JaarruimteCard — factor A via prop (geen lokale invoer meer)', () => {
  it('rendert géén factor-A-invoerveld meer (bewerken bij pensioen-strategie)', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />)
    expect(screen.queryByLabelText(/Factor A/i)).toBeNull()
    expect(screen.queryByLabelText('Reset naar 0')).toBeNull()
  })

  it('rekent met de opgeslagen factor A uit de prop (× 6,27)', () => {
    const { container } = render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />,
    )
    // factor A €500 × 6,27 = 3135 → 9248 − 3135 = €6.113 onbenut (2026)
    expect(container.textContent).toMatch(/€\s*6\.113/)
    // Toont de toegepaste factor A ter transparantie
    expect(screen.getByText(/opgeslagen factor A/i)).toBeTruthy()
  })

  it('verwijst naar de pensioen-strategie als énige bewerkplek', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    const link = screen.getByRole('link', { name: /pensioen-strategie/i })
    expect(link.getAttribute('href')).toBe(
      '/toekomst/gebeurtenissen?strategie=pensioen',
    )
  })

  it('toont géén bovengrens-badge op de partnerkaart, ook al is factor A onbekend', () => {
    // De partner HEEFT geen eigen factor-A-bron, dus `factorAKnown={false}` is
    // daar de waarheid — maar een "vul je factor A in"-oproep zou naar de
    // verkeerde persoon wijzen. De partner-footer benoemt het al (H23).
    render(
      <JaarruimteCard
        grossYearlyIncome={50_000}
        pensioenAangroei={0}
        factorAKnown={false}
        factorAEditable={false}
      />,
    )
    expect(screen.queryByText(/niet ingevuld/i)).toBeNull()
    expect(screen.getByText(/zonder factor A \(werkgeverspensioen\)/i)).toBeTruthy()
    // Geen bereik in de kop: de partnerkaart houdt één getal.
    expect(screen.getAllByText(/€\s*9\.248/).length).toBeGreaterThan(0)
  })

  it('toont géén eigen-pensioen-strategie-link op de partnerkaart (factorAEditable=false)', () => {
    // Partnerkaart in de huishoud-view: pensioenAangroei bewust 0, geen eigen
    // factor-A-bron → de footer mag NIET naar de eigen pensioen-strategie
    // verwijzen (privacy-guardrail, ADR 0036). Neutrale tekst i.p.v. link.
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAEditable={false} />,
    )
    expect(screen.queryByRole('link', { name: /pensioen-strategie/i })).toBeNull()
    expect(screen.getByText(/zonder factor A/i)).toBeTruthy()
  })
})

/**
 * Bevinding H23 — "Jaarruimte rust op factor A = 0".
 *
 * `factorA = 0` heeft twee betekenissen: "expliciet geen werkgeverspensioen"
 * (zzp, isKnown=true) en "niet ingevuld" (NULL, isKnown=false). De kaart kon ze
 * niet onderscheiden en zei onvoorwaardelijk "berekend met je opgeslagen factor
 * A" onder een bedrag dat de uitleg erboven een bovengrens noemt.
 *
 * IJKGETALLEN (bruto €50.000, 2026, franchise €19.172):
 *  - bovengrens  = 30% × 30.828                             = €9.248
 *  - geschatte factor A = 1,875% × 30.828                   = €578,03
 *  - ondergrens  = 9.248,4 − 6,27 × 578,03                  = €5.624
 * Beide grenzen komen uit `computeJaarruimte` — geen tweede rekenpad.
 */
describe('JaarruimteCard — onbekende factor A = bovengrens (H23)', () => {
  it('toont de badge + het bereik wanneer factor A niet is ingevuld', () => {
    const { container } = render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown={false} />,
    )
    expect(screen.getByText(/Factor A niet ingevuld — bovengrens/i)).toBeTruthy()
    expect(container.textContent).toMatch(/€\s*5\.624\s*–\s*€\s*9\.248/)
    // De ondergrens is de fiscale middelloon-maximum-aanname, benoemd in de tekst.
    expect(container.textContent).toMatch(/1,875%/)
  })

  it('vervangt de tegenstrijdige footer bij onbekende factor A', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown={false} />)
    // De letterlijke tegenspraak uit de bevinding mag NIET meer verschijnen.
    expect(screen.queryByText(/opgeslagen factor A/i)).toBeNull()
    expect(screen.getByText(/Berekend zónder factor A/i)).toBeTruthy()
    // De bewerkplek blijft bereikbaar (eigen kaart).
    expect(screen.getByRole('link', { name: /pensioen-strategie/i })).toBeTruthy()
  })

  it('houdt de bestaande, zekere formulering bij een EXPLICIETE 0 (zzp)', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown={true} />)
    expect(screen.queryByText(/niet ingevuld/i)).toBeNull()
    expect(screen.getByText(/opgeslagen factor A/i)).toBeTruthy()
    // Eén getal, geen bereik.
    expect(screen.queryByText(/€\s*5\.624\s*–/)).toBeNull()
  })

  it('gedraagt zich zonder de prop als "bekend" (achterwaartse compatibiliteit)', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} />)
    expect(screen.queryByText(/Factor A niet ingevuld/i)).toBeNull()
    expect(screen.getByText(/opgeslagen factor A/i)).toBeTruthy()
  })

  it('start de inleg-slider op de ONDERGRENS zolang factor A onbekend is', () => {
    // Het scherpste getal van de module voedt een storting met deadline; de
    // bovengrens als default-suggestie riskeert een niet-aftrekbare inleg.
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown={false} />)
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i) as HTMLInputElement
    expect(slider.value).toBe('5624')
    // De bovengrens blijft bereikbaar — hij is alleen niet meer de suggestie.
    expect(slider.max).toBe('9248')
  })

  it('start op de VOLLE ruimte wanneer factor A wél bekend is', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown />)
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i) as HTMLInputElement
    expect(slider.value).toBe('9248')
  })

  it('waarschuwt zodra de inleg bóven de ondergrens komt (en niet eronder)', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAKnown={false} />)
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i)
    // Default = ondergrens → geen waarschuwing.
    expect(screen.queryByText(/niet-aftrekbare inleg/i)).toBeNull()
    fireEvent.change(slider, { target: { value: '9000' } })
    expect(screen.getByText(/niet-aftrekbare inleg/i)).toBeTruthy()
    fireEvent.change(slider, { target: { value: '3000' } })
    expect(screen.queryByText(/niet-aftrekbare inleg/i)).toBeNull()
  })
})

/**
 * WF-BELAST-10-bug1 (UAT 2 sep 2026) — "slider-thumb staat op 18.868, label op
 * 18.955". Oorzaak: de native `<input type="range">` saneert élke gezette value
 * naar een veelvoud van `step` (stapbasis min=0), buiten React om. jsdom doet
 * dat NIET, dus de DOM-quirk zelf is hier niet te toetsen — wat wél vast te
 * leggen is, is de component-invariant die 'm uitsluit: géén numerieke `step`
 * op de input (step="any"), de exacte ondergrens als value, en het stapraster
 * alleen op gebruikersinteractie.
 *
 * IJKGETALLEN (Tessa, bruto €160.658, 2026, factor A onbekend):
 *  - bovengrens 35.588 → stap round(35588/100) = 356
 *  - ondergrens 18.955 (geen 356-voud: 53 × 356 = 18.868 = de waargenomen drift)
 */
describe('JaarruimteCard — startstand exact, stapraster alleen bij interactie (WF-BELAST-10-bug1)', () => {
  const TESSA_GROSS = 160_658
  const ONDERGRENS = 18_955
  const BOVENGRENS = 35_588
  const STAP = 356

  function renderTessa() {
    render(<JaarruimteCard grossYearlyIncome={TESSA_GROSS} pensioenAangroei={0} factorAKnown={false} />)
    return screen.getByLabelText(/Lijfrente-inleg dit jaar/i) as HTMLInputElement
  }

  it('premisse: de ondergrens is géén veelvoud van de stap (anders bestond de bug niet)', () => {
    expect(computeJaarruimte(TESSA_GROSS, 0, 2026).jaarruimte).toBe(BOVENGRENS)
    expect(Math.max(50, Math.round(BOVENGRENS / 100))).toBe(STAP)
    expect(ONDERGRENS % STAP).not.toBe(0)
    expect(Math.round(ONDERGRENS / STAP) * STAP).toBe(18_868)
  })

  it('draagt géén numerieke step (step="any") en start exact op de ondergrens', () => {
    const slider = renderTessa()
    expect(slider.step).toBe('any')
    expect(slider.value).toBe(String(ONDERGRENS))
    expect(slider.max).toBe(String(BOVENGRENS))
    // Label, besparing en input dragen hetzelfde getal.
    expect(slider.getAttribute('aria-valuetext')).toMatch(/18\.955/)
    expect(screen.getAllByText(/€\s*18\.955/).length).toBeGreaterThan(0)
    expect(screen.getByText(/€\s*9\.383/)).toBeTruthy()
  })

  it('slepen snapt op het 356-raster; de bovengrens blijft exact bereikbaar', () => {
    const slider = renderTessa()
    fireEvent.change(slider, { target: { value: '19100' } })
    expect(slider.value).toBe('19224') // 53,65 → 54 × 356
    // 35.588 / 356 rondt naar 100 × 356 = 35.600 > max → max zelf (niet 35.244).
    fireEvent.change(slider, { target: { value: String(BOVENGRENS) } })
    expect(slider.value).toBe(String(BOVENGRENS))
  })

  it('pijltjestoetsen stappen vanaf de ondergrens naar het eerstvolgende rasterpunt', () => {
    const slider = renderTessa()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider.value).toBe('19224') // 54 × 356, niet 18.955 + 356
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(slider.value).toBe('18868')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(slider.value).toBe(String(BOVENGRENS))
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider.value).toBe('0')
  })

  it('start bij bekende factor A exact op de volle ruimte (die evenmin een stap-voud is)', () => {
    render(<JaarruimteCard grossYearlyIncome={TESSA_GROSS} pensioenAangroei={0} factorAKnown />)
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i) as HTMLInputElement
    expect(BOVENGRENS % STAP).not.toBe(0)
    expect(slider.step).toBe('any')
    expect(slider.value).toBe(String(BOVENGRENS))
  })
})

describe('JaarruimteCard — ruimte 0 benoemt de JUISTE oorzaak', () => {
  it('zegt "franchise" wanneer het inkomen onder de drempel ligt (factor A 0)', () => {
    // Was: "Je werkgever vult je pensioenaangroei volledig" — aantoonbaar onwaar
    // zonder factor A; de ruimte is 0 omdat 15.000 < franchise 19.172.
    render(<JaarruimteCard grossYearlyIncome={15_000} pensioenAangroei={0} />)
    expect(screen.getByText(/onder de franchise/i)).toBeTruthy()
    expect(screen.queryByText(/werkgever vult je pensioenaangroei volledig/i)).toBeNull()
  })

  it('houdt de werkgevers-verklaring wanneer factor A de ruimte wél opeet', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />)
    expect(screen.getByText(/werkgever vult je pensioenaangroei volledig/i)).toBeTruthy()
  })
})
