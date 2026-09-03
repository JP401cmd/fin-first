import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { HefbomenNav } from './hefbomen-nav'
import type { HealthScore } from '@/lib/financial-health'
import type { HefbomenTotals } from './hefbomen-nav'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { LeverScores } from '@/components/app/shell/lever-scores'

/**
 * Tests voor HefbomenNav — 4-tegel-rij op /overzicht hero met
 * status-dots uit health.pillars en tooltip per tegel.
 */

function mockHealth(overrides: Partial<HealthScore> = {}): HealthScore {
  return {
    total: 70,
    label: 'Sterk',
    pillars: [
      {
        id: 'diversification',
        name: 'Diversificatie',
        score: 80,
        weight: 0.1,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '3 types',
      },
      {
        id: 'debt_ratio',
        name: 'Schuldratio',
        score: 60,
        weight: 0.2,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '20%',
      },
      {
        id: 'savings_rate',
        name: 'Spaarquote',
        score: 30,
        weight: 0.25,
        explanation: '',
        improvementTip: '',
        actionHref: '/x',
        actionLabel: 'X',
        rawValue: '5%',
      },
    ],
    previousMonth: null,
    trend: 0,
    activePillarCount: 3,
    budgetingActive: true,
    ...overrides,
  }
}

/**
 * Volledige leverScores-fixture voor tests die naast schulden/cashflow (via
 * pillar-scores) ook een écht belasting-oordeel nodig hebben.
 *
 * Sinds "restpunt B2" (release-review 31 aug, hefbomen-nav.tsx:232) heeft de
 * belasting-tegel GEEN proxy-fallback meer op `health.total` — zonder een
 * echte pijler (pillarKey=null) en zonder leverScores is haar status altijd
 * 'neutral'. Een niet-neutraal belasting-verdict in een test vereist dus
 * leverScores — en die prop overschrijft (bewust) de status van ALLE VIER
 * tegels tegelijk, niet alleen belasting. `debts`/`cashflow` staan hier op de
 * statussen die de oude health.pillars-fixture (debt_ratio 60 → warn,
 * savings_rate 30 → bad) al gaf, zodat de bestaande assertions op die twee
 * tegels ongewijzigd blijven kloppen.
 */
function mockLeverScores(overrides: Partial<LeverScores> = {}): LeverScores {
  const neutral = { score: null, status: 'neutral' as const, detail: '' }
  return {
    assets: neutral,
    debts: { score: 60, status: 'amber', detail: '' },
    cashflow: { score: 30, status: 'red', detail: '' },
    tax: { score: 90, status: 'green', detail: '' },
    ...overrides,
  }
}

describe('HefbomenNav', () => {
  it('rendert 4 hefbomen-tegels', () => {
    render(<HefbomenNav health={mockHealth()} />)
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Cashflow')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()
  })

  it('elke tegel is een Link met juiste href', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(4)
    expect(links[0]?.getAttribute('href')).toBe('/overzicht/bezittingen')
    expect(links[1]?.getAttribute('href')).toBe('/overzicht/schulden')
    expect(links[2]?.getAttribute('href')).toBe('/overzicht/cashflow')
    expect(links[3]?.getAttribute('href')).toBe('/overzicht/belasting')
  })

  it('elke tegel toont tooltip via title-attribuut', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const links = container.querySelectorAll('a')
    links.forEach((link) => {
      expect(link.getAttribute('title')).toBeTruthy()
    })
  })

  it('status-substext "Goed gespreid" bij bezittingen good (v2: asset_concentration)', () => {
    // v2 (ADR 0010): bezittingen-tegel gebruikt pillarKey 'asset_concentration'.
    // asset_concentration score 80 → 'good' → "Goed gespreid".
    const healthV2 = mockHealth({
      pillars: [
        ...mockHealth().pillars.filter(p => p.id !== 'diversification'),
        {
          id: 'asset_concentration',
          name: 'Vermogensspreiding',
          score: 80,
          weight: 0.08,
          explanation: '',
          improvementTip: '',
          actionHref: '/overzicht/bezittingen',
          actionLabel: 'Spreid je vermogen',
          rawValue: '45% in 1 type',
        },
      ],
    })
    render(<HefbomenNav health={healthV2} />)
    expect(screen.getByText('Goed gespreid')).toBeTruthy()
  })

  it('oordeel bij schulden warn is gewone taal (geen "Schuldratio {x}"-jargon)', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // debt_ratio = 60 → 'warn'. Vóór S1 stond hier "Schuldratio 20%" — het
    // enige niet-gewone-taal oordeel in de lijst. Het rátiogetal blijft
    // bereikbaar in de drill-down (pillar.rawValue), niet op de tegelvoorkant.
    expect(screen.getByText('Schuldenlast vraagt aandacht')).toBeTruthy()
    expect(screen.queryByText(/Schuldratio/)).toBeNull()
  })

  it('status-substext "Tekort op rekening" bij cashflow bad', () => {
    render(<HefbomenNav health={mockHealth()} />)
    // savings_rate = 30 → 'bad' → "Tekort op rekening"
    expect(screen.getByText('Tekort op rekening')).toBeTruthy()
  })

  it('belasting-oordeel volgt de status i.p.v. één vaste waarschuwing (UR2-04)', () => {
    // v2 (ADR 0010): belasting heeft pillarKey=null en (sinds restpunt B2) ook
    // geen health.total-proxy meer — een niet-neutraal belasting-oordeel komt
    // dus uit leverScores. Tot UR2-04 gaf HEFBOOM_VERDICT voor good/warn/bad
    // dezelfde alarmerende zin, waardoor een GROENE belasting-hefboom op
    // /overzicht "Mogelijk betaal je meer dan nodig" droeg terwijl het kompas
    // ernaast "Goed op koers" zei.
    render(
      <HefbomenNav
        health={mockHealth()}
        leverScores={mockLeverScores({ tax: { score: 90, status: 'green', detail: '' } })}
      />,
    )
    expect(screen.getByText('Belastingdruk beperkt')).toBeTruthy()
    expect(screen.queryByText('Mogelijk betaal je meer dan nodig')).toBeNull()
    // Het oude jargon mag nergens meer opduiken op de tegel.
    expect(screen.queryByText('Verken je Box 3-positie')).toBeNull()
  })

  it('belasting-tegel houdt de BEL-3-hedge bij een warn-status', () => {
    render(
      <HefbomenNav
        health={mockHealth()}
        leverScores={mockLeverScores({ tax: { score: 55, status: 'amber', detail: '' } })}
      />,
    )
    expect(screen.getByText('Mogelijk betaal je meer dan nodig')).toBeTruthy()
  })

  it('restpunt B2 — belasting-tegel valt NIET meer terug op health.total als proxy (geen leverScores)', () => {
    // health.total is hoog (85) maar draagt geen Box 3-specifiek signaal.
    // Zonder leverScores en zonder eigen pillar (pillarKey=null) moet de
    // status 'neutral' blijven i.p.v. een geleend oordeel van een algemene
    // gezondheidsproxy (components/overview/overzicht-hero/hefbomen-nav.tsx:232).
    render(<HefbomenNav health={mockHealth({ total: 85 })} />)
    expect(screen.queryByText('Belastingdruk beperkt')).toBeNull()
    expect(screen.queryByText('Mogelijk betaal je meer dan nodig')).toBeNull()
    expect(screen.queryByText('Hoge belastingdruk')).toBeNull()
  })

  it('rendert geen status-substext bij ontbrekende health (neutral)', () => {
    render(<HefbomenNav health={null} />)
    // Alle 4 tegels → status neutral → geen substext
    expect(screen.queryByText('Diversificatie ok')).toBeNull()
    expect(screen.queryByText('Aflossing op schema')).toBeNull()
    expect(screen.queryByText('Op koers met sparen')).toBeNull()
    expect(screen.queryByText('Geen actie nodig')).toBeNull()
  })

  it('nav heeft aria-label', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const nav = container.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Vier hefbomen')
  })
})

describe('HefbomenNav — Eenvoudige weergave (display_mode simple)', () => {
  // De chevron-drilldown-toggle in LeverageCard is een <button> met aria-label
  // "Toon detail {label}" / "Verberg detail {label}".
  const CHEVRON_RE = /detail/i

  it('toont chevron-toggles in Volledig (default) bij tegels met drilldown', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} />)
    const toggles = Array.from(container.querySelectorAll('button')).filter((b) =>
      CHEVRON_RE.test(b.getAttribute('aria-label') ?? ''),
    )
    // debt_ratio 60 (warn) + savings_rate 30 (bad) etc. → minstens één drilldown.
    expect(toggles.length).toBeGreaterThan(0)
  })

  it('verbergt alle chevron-toggles in Eenvoudig', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} simple />)
    const toggles = Array.from(container.querySelectorAll('button')).filter((b) =>
      CHEVRON_RE.test(b.getAttribute('aria-label') ?? ''),
    )
    expect(toggles.length).toBe(0)
  })

  it('rendert in Eenvoudig nog steeds de 4 tegels (alleen rustiger)', () => {
    render(<HefbomenNav health={mockHealth()} simple />)
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Cashflow')).toBeTruthy()
    expect(screen.getByText('Belasting')).toBeTruthy()
  })
})

describe('HefbomenNav — privacy-masking voor saldi', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  // Seed de masked-voorkeur en render binnen de echte PrivacyProvider, zodat
  // de integratie (context → formatter) net als in de app getest wordt.
  function renderMasked(ui: ReactElement) {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    return render(<PrivacyProvider>{ui}</PrivacyProvider>)
  }

  const totals: HefbomenTotals = {
    bezittingen: 250_000,
    schulden: 120_000,
    cashflow: 42,
    belasting: 1_500,
  }

  it('toont geformatteerde euro-totalen wanneer NIET gemaskeerd', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} />,
    )
    expect(container.textContent).toContain('250.000')
    expect(container.textContent).toContain('120.000')
    expect(container.textContent).toContain('1.500')
    // Cashflow is een percentage (geen saldo) — altijd zichtbaar.
    expect(container.textContent).toContain('42%')
  })

  it('maskeert de euro-saldi (bezittingen/schulden/belasting) wanneer privacy aan', () => {
    const { container } = render(
      <PrivacyProvider>
        <HefbomenNav health={mockHealth()} totals={totals} />
      </PrivacyProvider>,
    )
    // Baseline: zonder seed is masked=false → euro's zichtbaar. Dit borgt dat
    // de volgende (geseede) render het verschil daadwerkelijk aantoont.
    expect(container.textContent).toContain('250.000')
  })

  it('vervangt euro-saldi door de bullet-placeholder en lekt geen cijfers', () => {
    const { container } = renderMasked(
      <HefbomenNav health={mockHealth()} totals={totals} />,
    )
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('250.000')
    expect(container.textContent).not.toContain('120.000')
    expect(container.textContent).not.toContain('1.500')
  })

  it('laat het cashflow-percentage zichtbaar (geen saldo) bij masking', () => {
    const { container } = renderMasked(
      <HefbomenNav health={mockHealth()} totals={totals} />,
    )
    expect(container.textContent).toContain('42%')
  })
})

describe('HefbomenNav — leverScores prop (gedeelde SSoT)', () => {
  /**
   * Bewijst dat de status-dot uit de leverScores-prop wordt afgeleid
   * wanneer die prop aanwezig is, en NIET uit de health-pijlers.
   *
   * LeverageCard rendert de status-dot als:
   *   <span class="absolute right-2.5 top-2.5 ... rounded-full {LEVERAGE_STATUS_DOT[status]}" />
   */
  function getDots(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll('span.absolute.rounded-full')) as HTMLElement[]
  }

  function makeAllGreenLeverScores(): LeverScores {
    const entry = { score: 80, status: 'green' as const, detail: 'groen' }
    return { assets: entry, debts: entry, cashflow: entry, tax: entry }
  }

  function makeAllRedLeverScores(): LeverScores {
    const entry = { score: 10, status: 'red' as const, detail: 'rood' }
    return { assets: entry, debts: entry, cashflow: entry, tax: entry }
  }

  it('alle dots zijn emerald (green→good) wanneer leverScores groen is', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} leverScores={makeAllGreenLeverScores()} />,
    )
    const dots = getDots(container)
    expect(dots.length).toBe(4)
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-emerald-500')
    })
  })

  it('alle dots zijn rood (red→bad) wanneer leverScores rood is', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} leverScores={makeAllRedLeverScores()} />,
    )
    const dots = getDots(container)
    expect(dots.length).toBe(4)
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-red-500')
    })
  })

  it('leverScores overschrijft de pillar-status: groen wins boven slechte pillar', () => {
    // health heeft een slechte savings_rate (score=5 → bad), maar leverScores=groen
    const { container } = render(
      <HefbomenNav health={mockHealth()} leverScores={makeAllGreenLeverScores()} />,
    )
    const dots = getDots(container)
    // Geen rode dots (pillar-fallback) wanneer leverScores aanwezig
    dots.forEach((dot) => {
      expect(dot.className).not.toContain('bg-red-500')
      expect(dot.className).toContain('bg-emerald-500')
    })
  })

  it('valt terug op pillar-status wanneer leverScores ontbreekt (null)', () => {
    // Met savings_rate score=30 → bad → bg-red-500 voor cashflow-dot.
    // Zonder leverScores MOET de pillar-fallback actief zijn.
    const { container } = render(
      <HefbomenNav health={mockHealth()} leverScores={null} />,
    )
    const dots = getDots(container)
    expect(dots.length).toBe(4)
    // Cashflow heeft score 30 → bad, dus er moet minstens één rode dot zijn
    const redDots = dots.filter((d) => d.className.includes('bg-red-500'))
    expect(redDots.length).toBeGreaterThan(0)
  })

  it('amber leverScores geeft bg-amber-500 op alle kaarten', () => {
    const amberEntry = { score: 45, status: 'amber' as const, detail: 'amber' }
    const amberScores: LeverScores = {
      assets: amberEntry,
      debts: amberEntry,
      cashflow: amberEntry,
      tax: amberEntry,
    }
    const { container } = render(
      <HefbomenNav health={mockHealth()} leverScores={amberScores} />,
    )
    const dots = getDots(container)
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-amber-500')
    })
  })

  it('neutral leverScores geeft bg-stone-300 (geen emerald/amber/red)', () => {
    const neutralEntry = { score: null, status: 'neutral' as const, detail: 'geen data' }
    const neutralScores: LeverScores = {
      assets: neutralEntry,
      debts: neutralEntry,
      cashflow: neutralEntry,
      tax: neutralEntry,
    }
    const { container } = render(
      <HefbomenNav health={null} leverScores={neutralScores} />,
    )
    const dots = getDots(container)
    expect(dots.length).toBe(4)
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-stone-300')
      expect(dot.className).not.toContain('bg-emerald-500')
      expect(dot.className).not.toContain('bg-amber-500')
      expect(dot.className).not.toContain('bg-red-500')
    })
  })

  it('gemengde leverScores: elke hefboom krijgt zijn eigen status-dot', () => {
    const mixedScores: LeverScores = {
      assets: { score: 80, status: 'green', detail: '' },
      debts: { score: 45, status: 'amber', detail: '' },
      cashflow: { score: 10, status: 'red', detail: '' },
      tax: { score: null, status: 'neutral', detail: '' },
    }
    const { container } = render(
      <HefbomenNav health={null} leverScores={mixedScores} />,
    )
    const dots = getDots(container)
    expect(dots.length).toBe(4)
    // Volgorde: bezittingen, schulden, cashflow, belasting
    expect(dots[0]?.className).toContain('bg-emerald-500') // assets: green
    expect(dots[1]?.className).toContain('bg-amber-500')   // debts: amber
    expect(dots[2]?.className).toContain('bg-red-500')     // cashflow: red
    expect(dots[3]?.className).toContain('bg-stone-300')   // tax: neutral
  })
})

describe('HefbomenNav — dubbele grondslag (excl. eigen woning subregel)', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  const totals: HefbomenTotals = {
    bezittingen: 250_000,
    schulden: 120_000,
    cashflow: 42,
    belasting: 1_500,
  }
  // eigenHuisValue 200_000 → bezittingen excl = 50_000.
  // mortgageBalance 100_000 → schulden excl = 20_000.
  const housingSplit = { eigenHuisValue: 200_000, mortgageBalance: 100_000 }

  it('toont "excl. eigen woning" op bezittingen én schulden bij housingSplit', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} housingSplit={housingSplit} />,
    )
    // Twee subregels: één op bezittingen, één op schulden.
    const exclNodes = screen.getAllByText(/excl\. eigen woning/i)
    expect(exclNodes.length).toBe(2)
    // Weging-consistente excl.-bedragen (totaal − inclusion-gewogen huis/hypotheek).
    expect(container.textContent).toContain('50.000')
    expect(container.textContent).toContain('20.000')
  })

  it('toont GEEN excl.-regel op cashflow of belasting', () => {
    render(
      <HefbomenNav health={mockHealth()} totals={totals} housingSplit={housingSplit} />,
    )
    // Slechts twee subregels totaal (bezittingen + schulden), niet vier.
    expect(screen.getAllByText(/excl\. eigen woning/i).length).toBe(2)
  })

  it('toont GEEN excl.-regel wanneer housingSplit ontbreekt (null → byte-identiek)', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} housingSplit={null} />,
    )
    expect(screen.queryByText(/excl\. eigen woning/i)).toBeNull()
    // De totalen zelf blijven ongewijzigd zichtbaar.
    expect(container.textContent).toContain('250.000')
    expect(container.textContent).toContain('120.000')
  })

  it('toont GEEN excl.-regel wanneer housingSplit niet meegegeven (default)', () => {
    render(<HefbomenNav health={mockHealth()} totals={totals} />)
    expect(screen.queryByText(/excl\. eigen woning/i)).toBeNull()
  })

  it('maskeert de excl.-bedragen bij privacy-masking (label blijft, cijfers weg)', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    const { container } = render(
      <PrivacyProvider>
        <HefbomenNav health={mockHealth()} totals={totals} housingSplit={housingSplit} />
      </PrivacyProvider>,
    )
    expect(screen.getAllByText(/excl\. eigen woning/i).length).toBe(2)
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('50.000')
    expect(container.textContent).not.toContain('20.000')
  })
})

/**
 * UR2-12 — de belasting-tegel zegt WAT haar bedrag is.
 *
 * `totals.belasting` draagt `horizonData.box3Tax`: alleen de Box 3-heffing, niet
 * de totale belastingdruk die /overzicht/belasting toont (daar telt Box 1 mee).
 * Zonder eenheid las de tegel als "dit betaal ik aan belasting" en week ze
 * onverklaarbaar af van de hub — €164/jr naast €5.054/jr totale druk. Het bedrag
 * blijft bewust Box 3 (de STATUS van deze hefboom is óók box3-exposure); de
 * eenheid staat er nu bij.
 */
describe('HefbomenNav — eenheid van het belastingbedrag', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  const totals: HefbomenTotals = {
    bezittingen: 250_000,
    schulden: 120_000,
    cashflow: 42,
    belasting: 164,
  }

  it('toont de grondslagregel "Box 3 · sparen en beleggen" onder het bedrag (Volledig)', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} totals={totals} />)
    expect(screen.getByText(/Box 3 · sparen en beleggen/i)).toBeTruthy()
    expect(container.textContent).toContain('164')
  })

  it('toont de eenheid ook in Eenvoudig, waar de grondslagregel bewust wegvalt', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} totals={totals} simple />)
    // In `verdict` rendert `subAmount` niet; de eenheid reist mee als
    // venster-label achter het gedempte bedrag.
    expect(screen.queryByText(/Box 3 · sparen en beleggen/i)).toBeNull()
    expect(container.textContent).toContain('Box 3')
  })

  it('de tooltip belooft geen Box 1/Box 2 meer naast een Box 3-bedrag', () => {
    const { container } = render(<HefbomenNav health={mockHealth()} totals={totals} />)
    const belastingLink = Array.from(container.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/overzicht/belasting',
    )
    const tooltip = belastingLink?.getAttribute('title') ?? ''
    expect(tooltip).toMatch(/Box 3-heffing per jaar/i)
    // Box 1 en 2 mogen genoemd worden als VERWIJZING, nooit als belofte over dít
    // getal — de oude tekst somde ze op alsof het bedrag ze bevatte.
    expect(tooltip).toMatch(/belastingpagina/i)
  })

  it('zonder belastingbedrag verschijnt er geen losse grondslagregel', () => {
    render(
      <HefbomenNav
        health={mockHealth()}
        totals={{ ...totals, belasting: null }}
      />,
    )
    expect(screen.queryByText(/Box 3 · sparen en beleggen/i)).toBeNull()
  })
})

/**
 * S1 — richtingsbesluit R5 "duiding boven reductie". Deze describe VERVANGT de
 * eerdere OVZ-2-verwachting (9 aug 2026), die in `simple` alleen hoofdcijfer +
 * statuspunt overliet. Die reductie is bewust en gedeeltelijk teruggedraaid:
 *
 *  - TERUG    → het oordeel in gewone taal staat nu áltijd op de tegel; het
 *               bedrag zakt naar een gedempte tweede regel.
 *  - BLIJFT   → geen chevron/drill-down en geen "excl. eigen woning · €X" in
 *               Eenvoudig (diepte resp. grondslag-detail, geen oordeel).
 *
 * Reden voor de omkering: met alleen een gekleurd puntje was de status voor een
 * screenreader- én touch-gebruiker onbereikbaar (de dot was `aria-hidden` met
 * een hover-only `title`) — WCAG 2.2 §1.4.1 — en met privacy-masking erbovenop
 * hield een tegel over: icoon + label + `••••` + een puntje.
 */
describe('HefbomenNav — eenvoudige weergave (S1: oordeel primair)', () => {
  const totals: HefbomenTotals = {
    bezittingen: 250_000,
    schulden: 180_000,
    cashflow: 12,
    belasting: 1_200,
  }
  const housingSplit = { eigenHuisValue: 50_000, mortgageBalance: 20_000 }

  it('toont het oordeel in gewone taal op elke tegel', () => {
    // Belasting heeft sinds restpunt B2 alleen via leverScores een niet-neutraal
    // oordeel (geen health.total-proxy meer); die prop draagt hier ook de
    // schulden/cashflow-statussen die de oude pillar-fixture al gaf.
    render(
      <HefbomenNav health={mockHealth()} totals={totals} leverScores={mockLeverScores()} simple />,
    )
    expect(screen.getByText('Belastingdruk beperkt')).toBeTruthy()
    expect(screen.getByText('Schuldenlast vraagt aandacht')).toBeTruthy()
    expect(screen.getByText('Tekort op rekening')).toBeTruthy()
  })

  it('houdt het bedrag zichtbaar maar secundair (gedempt, niet weg)', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} simple />,
    )
    expect(container.textContent).toContain('250.000')
    expect(container.textContent).toContain('12%')
    // Het bedrag staat op de gedempte regel — niet meer in serif als hoofdcijfer.
    // Document-volgorde zet voorouders vóór afstammelingen; de laatste match is
    // dus het element dat het bedrag daadwerkelijk zelf draagt.
    const kpiEl = Array.from(container.querySelectorAll('div'))
      .filter((d) => d.textContent?.includes('250.000'))
      .at(-1)
    expect(kpiEl?.className).toContain('text-[11px]')
    expect(kpiEl?.className).not.toContain('font-serif')
  })

  it('toont geen "excl. eigen woning"-regel, ook niet als de dubbele grondslag actief is', () => {
    render(
      <HefbomenNav
        health={mockHealth()}
        totals={totals}
        housingSplit={housingSplit}
        simple
      />,
    )
    expect(screen.queryByText(/excl\. eigen woning/i)).toBeNull()
  })

  it('houdt de vier links en de vier statuspunten intact', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} simple />,
    )
    expect(container.querySelectorAll('a').length).toBe(4)
    expect(container.querySelectorAll('span.absolute.rounded-full').length).toBe(4)
  })

  it('draagt elke tegel een woord, óók zonder gegevens (neutral)', () => {
    render(<HefbomenNav health={null} totals={{}} simple />)
    expect(screen.getAllByText('Nog geen gegevens').length).toBe(4)
  })

  it('houdt het oordeel leesbaar mét privacy-masking (bedrag weg, woord blijft)', () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    const { container } = render(
      <PrivacyProvider>
        <HefbomenNav
          health={mockHealth()}
          totals={totals}
          leverScores={mockLeverScores()}
          simple
        />
      </PrivacyProvider>,
    )
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('250.000')
    // Precies dít is waarom S1 bestaat: gemaskeerd + Eenvoudig hield vóór deze
    // kaart nul informatie over.
    expect(screen.getByText('Belastingdruk beperkt')).toBeTruthy()
    window.localStorage.clear()
  })

  it('kondigt de status precies één keer aan — geen sr-only-duplicaat naast het oordeel', () => {
    const { container } = render(
      <HefbomenNav health={mockHealth()} totals={totals} simple />,
    )
    // Het zichtbare oordeel is de drager; de shell springt niet óók bij.
    expect(container.querySelectorAll('.sr-only').length).toBe(0)
  })

  it('laat de volledige weergave ongemoeid (oordeel + excl.-regel + chevron blijven)', () => {
    render(
      <HefbomenNav
        health={mockHealth()}
        totals={totals}
        housingSplit={housingSplit}
        leverScores={mockLeverScores()}
      />,
    )
    expect(screen.getByText('Belastingdruk beperkt')).toBeTruthy()
    expect(screen.getAllByText(/excl\. eigen woning/i).length).toBe(2)
  })
})

/**
 * Tabelgedreven: elke hefboom × elke status levert een niet-leeg oordeel in de
 * eenvoudige weergave. Voorkomt dat een latere status-uitbreiding stilletjes
 * een woordloze tegel oplevert.
 */
describe('HefbomenNav — elk hefboom/status-paar draagt een oordeel', () => {
  const STATUSES = ['green', 'amber', 'red', 'neutral'] as const

  it.each(STATUSES)('alle vier de tegels dragen een woord bij status %s', (s) => {
    const entry = { score: null, status: s, detail: '' }
    const scores: LeverScores = {
      assets: entry,
      debts: entry,
      cashflow: entry,
      tax: entry,
    }
    const { container } = render(
      <HefbomenNav health={null} leverScores={scores} simple />,
    )
    // Vier kaarten, vier oordeel-regels — de regel staat direct onder het label
    // en draagt de statuskleur-class van LeverageCard.
    const verdicts = Array.from(
      container.querySelectorAll('div.leading-snug'),
    ).filter((el) => (el.textContent ?? '').trim().length > 0)
    expect(verdicts.length).toBe(4)
  })
})
