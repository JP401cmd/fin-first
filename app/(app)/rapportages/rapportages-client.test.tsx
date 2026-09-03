/**
 * Tests voor de rapportage-hub — kaart S9.
 *
 * Drie invarianten:
 *
 *  1. **Curatie per weergavemodus (optie B).** In Eenvoudig staan precies twee
 *     rapportvormen vooraan (balansstaat + persoonlijk plan) en zit de rest
 *     achter één dichte `DepthSection`. In Volledig staat diezelfde sectie
 *     open, zodat alle zeven vormen zichtbaar zijn. De assertie hangt aan
 *     `data-collapsed` op de DepthSection — de open/dicht-stand zelf, niet aan
 *     een tekstuele bijvangst.
 *
 *  2. **Bereikbaarheid.** Weggevouwen is niet weg: ook in Eenvoudig staan alle
 *     zeven kaarten in de DOM (de sectie is één klik open). Dat is precies het
 *     verschil met `HideInSimple`, en de reden dat we hier DepthSection kozen —
 *     een nieuw account landt standaard in Eenvoudig.
 *
 *  3. **Geen slot zonder kassa.** De AI-inleiding is het enige betaalde
 *     onderdeel. Zolang de add-on niet af te rekenen is (`available: false`,
 *     Polar niet live) toont de hub GEEN vergrendeling — een muur zonder deur.
 *     Is de add-on wél te koop en heeft de gebruiker 'm niet, dan is de
 *     vergrendeling vóór de klik zichtbaar mét reden en een weg naar
 *     /mijn/account.
 *
 * Bijt-proef gedraaid: (a) `DepthSection` vervangen door een kaal fragment →
 * test 1 rood op het ontbrekende `data-collapsed`; (b) `aiLocked` vastgezet op
 * `!data.hasAiSubscription` (dus zónder de `available`-voorwaarde) → de
 * "geen slot zolang de add-on niet te koop is"-test rood.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { RapportagesData } from '@/lib/rapportages-data-loader'
import { RapportagesClient } from './rapportages-client'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/rapportages',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// De shell-meta registreert zich bij een provider die hier niet in de boom zit.
vi.mock('@/components/app/shell/nav-stack-meta', () => ({
  NavStackMeta: () => null,
}))

beforeEach(() => {
  // Een modus-wissel doet een optimistische PUT; die mag hier geen echt
  // netwerkverkeer worden.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const BASE: RapportagesData = {
  archive: [],
  hasAiSubscription: false,
  aiAddonAvailable: false,
}

function renderHub(mode: DisplayMode, data: Partial<RapportagesData> = {}) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <RapportagesClient data={{ ...BASE, ...data }} />
    </DisplayModeProvider>,
  )
}

/** De zeven rapportvormen, herkend aan hun kaart-kicker. */
const ALLE_VORMEN = [
  'Balansstaat',
  'Persoonlijk plan',
  'Periodiek rapport',
  'Maandbudget',
  'Vermogensoverzicht',
  'Spiegel',
  'Totaalplan',
]

const VOORAAN = ['Balansstaat', 'Persoonlijk plan']

describe('Rapportage-hub — curatie per weergavemodus (S9, optie B)', () => {
  it('vouwt in Eenvoudig de verdieping dicht en laat twee vormen vooraan staan', () => {
    renderHub('simple')

    const depth = screen.getByTestId('depth-section')
    expect(depth).toHaveAttribute('data-collapsed', 'true')

    // De twee prominente vormen staan BUITEN de ingeklapte sectie.
    for (const vorm of VOORAAN) {
      const kop = screen.getByText(vorm)
      expect(depth.contains(kop)).toBe(false)
    }

    // De overige vijf zitten er allemaal ín — en nergens anders.
    for (const vorm of ALLE_VORMEN.filter((v) => !VOORAAN.includes(v))) {
      expect(within(depth).getByText(vorm)).toBeInTheDocument()
    }
  })

  it('zet in Volledig dezelfde sectie open — alle zeven vormen zichtbaar', () => {
    renderHub('full')

    expect(screen.getByTestId('depth-section')).toHaveAttribute('data-collapsed', 'false')
    for (const vorm of ALLE_VORMEN) {
      expect(screen.getByText(vorm)).toBeInTheDocument()
    }
  })

  it('houdt ook in Eenvoudig elke vorm bereikbaar (weggevouwen, niet verwijderd)', () => {
    renderHub('simple')
    for (const vorm of ALLE_VORMEN) {
      expect(screen.getByText(vorm)).toBeInTheDocument()
    }
  })

  it('geeft in Eenvoudig duiding bij de rangorde in plaats van alleen minder te tonen', () => {
    renderHub('simple')
    expect(screen.getByText(/Twee rapporten staan vooraan/)).toBeInTheDocument()
  })
})

describe('Rapportage-hub — vergrendeling van de AI-inleiding (S9)', () => {
  it('toont GEEN slot zolang de add-on niet af te rekenen is', () => {
    renderHub('full', { aiAddonAvailable: false, hasAiSubscription: false })

    expect(screen.queryByTestId('ai-inleiding-slot')).not.toBeInTheDocument()
    // De keuze blijft dus gewoon bedienbaar.
    expect(screen.getByRole('button', { name: /met ai-inleiding/i })).toBeInTheDocument()
  })

  it('toont het slot vóór de klik zodra de add-on te koop is en ontbreekt', () => {
    renderHub('full', { aiAddonAvailable: true, hasAiSubscription: false })

    expect(screen.getByTestId('ai-inleiding-slot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /met ai-inleiding/i })).not.toBeInTheDocument()
    // Reden + uitweg staan erbij — een slot zonder duiding is precies de
    // ervaring die deze kaart moest wegnemen.
    expect(screen.getByText(/krijg je zonder abonnement volledig/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bekijk de add-on/i })).toHaveAttribute(
      'href',
      '/mijn/account',
    )
  })

  it('laat de keuze open voor wie de add-on wél heeft', () => {
    renderHub('full', { aiAddonAvailable: true, hasAiSubscription: true })

    expect(screen.queryByTestId('ai-inleiding-slot')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /met ai-inleiding/i })).toBeInTheDocument()
  })
})

describe('Rapportage-hub — archief komt uit de server-loader', () => {
  it('rendert het meegegeven archief zonder zelf te fetchen', () => {
    renderHub('full', {
      archive: [
        {
          id: 'cfg-1',
          name: 'Juli 2026',
          period_type: 'month',
          date_from: '2026-07-01',
          date_to: '2026-08-01',
          use_ai: false,
        },
      ],
    })

    // Via de aria-label van de bekijk-knop: de naam "Juli 2026" komt óók voor
    // in de periode-dropdown van het periodieke rapport, dus een kale
    // tekst-match zou niet aanwijzen dat het archief zelf gerenderd is.
    expect(screen.getByRole('button', { name: 'Bekijk Juli 2026' })).toBeInTheDocument()
    expect(screen.queryByText('Je archief is leeg.')).not.toBeInTheDocument()
    // Geen enkele fetch bij het monteren: de hub las het archief vroeger zelf
    // uit de browser (`report_configs`), nu komt het als prop binnen.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('toont de bestaande empty-state bij een leeg archief', () => {
    renderHub('full')
    expect(screen.getByText('Je archief is leeg.')).toBeInTheDocument()
  })
})

/**
 * Regressie bij WF-RAPP-05-bug1 — "1 AUG – DI 02:00".
 *
 * De subtitel rende `date_from`/`date_to` door `formatTimestamp`, een
 * recency-formatter voor échte tijdstippen: viel de grens binnen 7 dagen van
 * nu, dan toonde hij `weekdag HH:MM`. Omdat een date-only string als
 * UTC-middernacht parseert (= 01:00/02:00 in Europe/Amsterdam) leverde dat
 * "DI 02:00" op voor wat gewoon 1 september is.
 *
 * Bijt-proef gedraaid: `formatPeriodeGrens` teruggezet op `formatTimestamp` →
 * de eerste test rood met exact de gemelde tekst ("1 aug – di 02:00"). De
 * tweede test bleef groen en is dan ook de controle: buiten het 7-daagse
 * venster deed `formatTimestamp` het toevallig al goed, wat verklaart waarom
 * alleen recent afgesloten periodes opvielen.
 */
describe('Rapportage-hub — periodegrens is een kalenderdatum, geen tijdstip (WF-RAPP-05-bug1)', () => {
  /**
   * Leest de subtitel van het archief-item met deze naam. De openen-knop draagt
   * geen aria-label; zijn toegankelijke naam begint met de rapportnaam en
   * eindigt met de periode-subtitel (de eye-knop heet "Bekijk <naam>" en matcht
   * daardoor niet op `^naam`).
   */
  function subtitelVan(naam: string): string {
    const knop = screen.getByRole('button', { name: new RegExp(`^${naam}`) })
    return knop.textContent ?? ''
  }

  const AUGUSTUS_RAPPORT = {
    id: 'cfg-recent',
    name: 'Augustus 2026',
    period_type: 'month' as const,
    date_from: '2026-08-01',
    // Exclusieve periodegrens: valt binnen 7 dagen van de gefixeerde 'nu'.
    date_to: '2026-09-01',
    use_ai: false,
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('toont een grens binnen 7 dagen van nu als datum, niet als weekdag + kloktijd', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'))

    renderHub('full', { archive: [AUGUSTUS_RAPPORT] })

    const subtitel = subtitelVan('Augustus 2026')
    expect(subtitel).toContain('1 aug – 1 sep')
    // Geen kloktijd en geen weekdag-afkorting meer in de subtitel.
    expect(subtitel).not.toMatch(/\d{1,2}:\d{2}/)
    expect(subtitel).not.toMatch(/\b(ma|di|wo|do|vr|za|zo)\b/i)
  })

  it('toont een oudere periode ongewijzigd als datumbereik', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T09:00:00Z'))

    renderHub('full', {
      archive: [
        { ...AUGUSTUS_RAPPORT, id: 'cfg-oud', name: 'Q2 2026', period_type: 'quarter' as const, date_from: '2026-04-01', date_to: '2026-07-01' },
      ],
    })

    expect(subtitelVan('Q2 2026')).toContain('1 apr – 1 jul')
  })
})
