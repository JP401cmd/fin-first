/**
 * Presentatielaag van het beheerdashboard, getest op handgemaakte feiten
 * (lib/beheer/dashboard/fixture.ts). Vastgelegd: de toestanden per onderdeel
 * (een ontbrekende meting is nooit groen en nooit een nul), dat status altijd
 * als tekst naast het icoon staat, de doorklikroutes, en het koppencontract
 * (geen h1, geen niveau overgeslagen).
 */

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { GebruikAnalyseResultaat } from '@/lib/beheer/gebruik-analyse/loader'
import { bouwAiBeeld } from '@/lib/beheer/dashboard/ai-reeks'
import type { DashboardFeiten } from '@/lib/beheer/dashboard/feiten'
import {
  FIXTURE_NU,
  foutenFeit,
  foutsoort,
  gezondeFeiten,
  gezondeStanden,
  metStand,
  run,
  stand,
  voorval,
} from '@/lib/beheer/dashboard/fixture'
import type { Ingreep } from '@/lib/beheer/dashboard/ingrepen'
import { bouwOnderdelen } from '@/lib/beheer/dashboard/onderdelen'
import { bouwFoutenVerloop, bouwVitalsVerloop } from '@/lib/beheer/dashboard/ontwikkeling'
import { bouwAandacht } from '@/lib/beheer/dashboard/signalen'
import { MEET_STATUS_META, bronOk, type MeetStatus } from '@/lib/beheer/dashboard/status'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'
import { JOB_LIST } from '@/lib/job-catalog'
import { AlleSchermen } from './alle-schermen'
import { DagReeks } from './dag-reeks'
import { Kerncijfer } from './kerncijfer'
import { DashboardNavigatie } from './navigatie'
import { impactKop, momentTekst, verschilTekst } from './opmaak'
import {
  AandachtSectie,
  IngrepenSectie,
  OntwikkelingSectie,
  StatusSectie,
  type OntwikkelingInvoer,
} from './overzicht'
import { StatusTeken } from './status-teken'
import { BLINDE_VLEKKEN, Verantwoording } from './verantwoording'
import { AiWeergave, BetrouwbaarheidWeergave, IngrepenWeergave } from './weergaven'

const NU = new Date(FIXTURE_NU)

// Geteld uit de catalogus: een nieuwe taak breekt deze tests dan niet.
const BEWAAKT = JOB_LIST.filter((j) => j.maxAgeHours != null).length
const ONBEWAAKT = JOB_LIST.length - BEWAAKT

/** Een geslaagde lezing van de ingrepen, met een volledig gelezen audit-trail. */
const lezing = (ingrepen: Ingreep[], actiesAfgekaptVanaf: string | null = null) =>
  bronOk({ ingrepen, actiesAfgekaptVanaf })

const RELEASE: Ingreep = {
  id: 'release-0.92.12',
  soort: 'release',
  dag: '2026-09-27',
  moment: null,
  titel: 'Versie 0.92.012',
  toelichting: 'Banken koppelen',
  href: '/beheer/releases',
}
const ACTIE: Ingreep = {
  id: 'actie-1',
  soort: 'beheeractie',
  dag: '2026-09-15',
  moment: '2026-09-15T08:30:00.000Z',
  titel: 'Configuratie gewijzigd',
  toelichting: 'platform_status',
  href: '/beheer/audit?actie=config.update',
}

/** Geeft de koppen in documentvolgorde als niveaus. */
function kopniveaus(container: HTMLElement): number[] {
  return [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((k) => Number(k.tagName[1]))
}

function verwachtGeldigeKoppen(container: HTMLElement, start: number) {
  const niveaus = kopniveaus(container)
  expect(niveaus.length).toBeGreaterThan(0)
  expect(niveaus).not.toContain(1)
  let vorig = start
  for (const n of niveaus) {
    expect(n, `kopniveau ${n} na ${vorig}`).toBeLessThanOrEqual(vorig + 1)
    vorig = n
  }
}

describe('StatusTeken', () => {
  const alle: MeetStatus[] = ['gezond', 'afwijkend', 'geen-gegevens', 'verouderd', 'meting-mislukt', 'nvt']

  it('toont elke toestand als tekst, niet alleen als kleur of icoon', () => {
    for (const status of alle) {
      const { unmount } = render(<StatusTeken status={status} />)
      expect(screen.getByText(MEET_STATUS_META[status].label)).toBeInTheDocument()
      unmount()
    }
  })

  it('zegt bij een afwijking hoe zwaar die weegt', () => {
    render(<StatusTeken status="afwijkend" ernst="kritiek" />)
    expect(screen.getByText('Afwijkend · kritiek')).toBeInTheDocument()
  })

  it('alleen een gezonde of afwijkende toestand draagt een statuskleur; een ontbrekende meting nooit groen', () => {
    for (const status of ['geen-gegevens', 'verouderd', 'meting-mislukt', 'nvt'] as const) {
      const { container, unmount } = render(<StatusTeken status={status} />)
      expect(container.querySelector('[data-status]')?.className).not.toContain('positive')
      unmount()
    }
  })
})

describe('opmaak', () => {
  it('tijd is absoluut en in Nederlandse tijd', () => {
    expect(momentTekst('2026-09-29T08:30:00Z', NU)).toBe('vandaag 10:30')
    expect(momentTekst('2026-09-28T17:14:00Z', NU)).toBe('28 sep 19:14')
    expect(momentTekst('2025-03-05T12:00:00Z', NU)).toBe('5 mrt 2025')
  })

  it('een ontbrekend of onleesbaar tijdstip is "onbekend", geen datum', () => {
    expect(momentTekst(null, NU)).toBe('onbekend')
    expect(momentTekst('kapot', NU)).toBe('onbekend')
  })

  it('verschil draagt zijn teken', () => {
    expect(verschilTekst(31)).toBe('+31')
    expect(verschilTekst(-1200)).toBe('−1.200')
    expect(verschilTekst(0)).toBe('0')
  })

  it('impact zegt wat er geteld is en of het een ondergrens is', () => {
    expect(impactKop({ soort: 'iedereen', toelichting: '' })).toBe('Iedereen')
    expect(impactKop({ soort: 'aantal', aantal: 3, eenheid: 'gebruikers', ondergrens: true, toelichting: '' })).toBe(
      'Minstens 3 gebruikers',
    )
    expect(impactKop({ soort: 'aantal', aantal: 1, eenheid: 'koppelingen', ondergrens: false, toelichting: '' })).toBe(
      '1 koppeling',
    )
    expect(impactKop({ soort: 'onbekend', toelichting: '' })).toBe('Onbekend')
    expect(impactKop({ soort: 'geen-direct', toelichting: '' })).toBe('Geen direct effect')
  })
})

describe('AandachtSectie', () => {
  it('zonder signalen: zegt dat niets afwijkt en verwijst naar wat niet gemeten is', () => {
    render(<AandachtSectie items={[]} nu={NU} />)
    expect(screen.getByTestId('aandacht-leeg')).toHaveTextContent('Geen enkele meting wijkt af')
    expect(screen.queryByText('Inplannen')).toBeNull()
  })

  it('zonder signalen maar met een afwijkende regel in de tabel: zegt niet dat niets afwijkt', () => {
    render(<AandachtSectie items={[]} nu={NU} afwijkendZonderSignaal={['Fin & AI', 'Webprestaties']} />)
    const leeg = screen.getByTestId('aandacht-leeg')
    expect(leeg).toHaveTextContent('Niets vraagt nu ingrijpen.')
    expect(leeg).toHaveTextContent('Fin & AI, Webprestaties wijken wel af van de norm')
    expect(leeg).not.toHaveTextContent('Geen enkele meting wijkt af')
  })

  it('toont per signaal ernst, gevolg, begin, grond en de vervolgacties', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing', sinceAt: '2026-09-28T08:00:00.000Z', failureCount: 3, lastSuccessAt: null },
    }
    render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)

    const regel = screen.getByTestId('aandacht-ai-gezondheid')
    expect(within(regel).getByText('Kritiek')).toBeInTheDocument()
    expect(within(regel).getByText('Fin en de AI-functies werken niet')).toBeInTheDocument()
    expect(within(regel).getByText('Iedereen')).toBeInTheDocument()
    expect(within(regel).getByText('28 sep 10:00')).toBeInTheDocument()
    expect(within(regel).getByText(/mislukte aanroepen sinds de laatste geslaagde/)).toBeInTheDocument()
    expect(within(regel).getByRole('link', { name: 'AI-instellingen' })).toHaveAttribute('href', '/beheer/ai')
    expect(within(regel).getByRole('link', { name: 'AI-foutmeldingen' })).toHaveAttribute(
      'href',
      '/beheer/errors?context=ai%3A',
    )
  })

  it('een signaal zonder bekend begin zegt dat, in plaats van een datum te tonen', () => {
    const feiten = { ...gezondeFeiten(), inbakken: { errors: 0, feedback: 0, calculator_reports: 2 } }
    render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)
    expect(within(screen.getByTestId('aandacht-inbak-rekenhulp')).getByText('begin niet vastgelegd')).toBeInTheDocument()
  })

  it('houdt de delen van het incident en de onderbouwing achter één uitklap', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing', sinceAt: FIXTURE_NU, failureCount: 3, lastSuccessAt: null },
      fouten: bronOk(
        foutenFeit([foutsoort({ signature: 'a'.repeat(16), context: 'ai:chat', voorbeeld: 'refused: tegoed op' })]),
      ),
    }
    render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)
    const regel = screen.getByTestId('aandacht-ai-gezondheid')
    const uitklap = within(regel).getByText('Onderdelen en onderbouwing').closest('details') as HTMLElement
    expect(uitklap).not.toHaveAttribute('open')
    expect(within(uitklap).getByText(/tegoed op/)).toBeInTheDocument()
    expect(within(uitklap).getByText(/staat daarom niet apart in de lijst/)).toBeInTheDocument()
  })

  it('zet werk om in te plannen in een eigen, compactere lijst', () => {
    const feiten = { ...gezondeFeiten(), fiscaal: { doeljaar: 2027, open: 3, driftOpen: 0 } }
    render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)
    expect(screen.getByTestId('aandacht-leeg')).toBeInTheDocument()
    expect(screen.getByText('Inplannen')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('aandacht-fiscaal-checklist')).getByRole('link', { name: 'Fiscale kerngetallen' }),
    ).toHaveAttribute('href', '/beheer/fiscale-kerngetallen')
  })

  it('houdt de volgorde van de lijst aan: zwaarste eerst', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      ai: { status: 'storing', sinceAt: FIXTURE_NU, failureCount: 3, lastSuccessAt: null },
      inbakken: { errors: 0, feedback: 0, calculator_reports: 1 },
    }
    const { container } = render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)
    expect([...container.querySelectorAll('[data-ernst]')].map((e) => e.getAttribute('data-ernst'))).toEqual([
      'kritiek',
      'kritiek',
      'middel',
      'middel',
    ])
  })

  it('volgt het koppencontract', () => {
    const feiten = { ...gezondeFeiten(), inbakken: { errors: 0, feedback: 2, calculator_reports: 2 } }
    const { container } = render(<AandachtSectie items={bouwAandacht(feiten)} nu={NU} />)
    verwachtGeldigeKoppen(container, 2)
  })
})

describe('StatusSectie', () => {
  it('toont elk onderdeel met toestand, meting en doorklik', () => {
    render(<StatusSectie rijen={bouwOnderdelen(gezondeFeiten())} nu={NU} />)
    const taken = screen.getByTestId('onderdeel-taken')
    expect(taken).toHaveAttribute('data-status', 'gezond')
    expect(within(taken).getByText('Gezond')).toBeInTheDocument()
    expect(within(taken).getByText(`${BEWAAKT} van ${BEWAAKT} bewaakte taken actueel`)).toBeInTheDocument()
    expect(within(taken).getByRole('link', { name: 'Achtergrondtaken' })).toHaveAttribute('href', '/beheer/jobs')
  })

  it('een onleesbare bron staat er als "meting mislukt", zonder cijfer', () => {
    render(<StatusSectie rijen={bouwOnderdelen({ ...gezondeFeiten(), mail: { soort: 'fout' } })} nu={NU} />)
    const mail = screen.getByTestId('onderdeel-mail')
    expect(mail).toHaveAttribute('data-status', 'meting-mislukt')
    expect(within(mail).getByText('Meting mislukt')).toBeInTheDocument()
    expect(within(mail).getByText('De bron kon niet worden gelezen.')).toBeInTheDocument()
    expect(mail.textContent).not.toMatch(/\d+ verzonden/)
  })

  it('noemt per onderdeel de norm en de kanttekeningen', () => {
    render(<StatusSectie rijen={bouwOnderdelen(gezondeFeiten())} nu={NU} />)
    const koppelingen = screen.getByTestId('onderdeel-koppelingen')
    expect(within(koppelingen).getByText(/Afwijkend bij een onbereikbare dienst/)).toBeInTheDocument()
    expect(within(koppelingen).getByText(/een fout per koppeling wordt niet vastgelegd/)).toBeInTheDocument()
  })

  it('toont hoe vers de meting is, of zegt dat ze van dit moment is', () => {
    render(<StatusSectie rijen={bouwOnderdelen(gezondeFeiten())} nu={NU} />)
    expect(within(screen.getByTestId('onderdeel-platform')).getByText('2 sep 10:00')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('onderdeel-meldingen')).getByText('geteld bij het laden van dit scherm'),
    ).toBeInTheDocument()
  })

  it('een bron zonder tijdstip zegt dat, in plaats van een meting "bij het laden" te suggereren', () => {
    const feiten: DashboardFeiten = {
      ...gezondeFeiten(),
      fouten: bronOk(foutenFeit([], [])),
      mail: { soort: 'fout' },
    }
    render(<StatusSectie rijen={bouwOnderdelen(feiten)} nu={NU} />)
    expect(screen.getByTestId('geen-moment-fouten')).toHaveTextContent('geen tijdstip vastgelegd')
    expect(screen.getByTestId('geen-moment-mail')).toHaveTextContent('niet gelezen')
    expect(screen.getByTestId('onderdeel-fouten')).not.toHaveTextContent('bij het laden')
    expect(screen.getByTestId('onderdeel-mail')).not.toHaveTextContent('bij het laden')
  })

  it('volgt het koppencontract', () => {
    const { container } = render(<StatusSectie rijen={bouwOnderdelen(gezondeFeiten())} nu={NU} />)
    verwachtGeldigeKoppen(container, 2)
  })
})

describe('DagReeks', () => {
  const punten = [
    { dag: '2026-09-25', waarde: null },
    { dag: '2026-09-26', waarde: 0 },
    { dag: '2026-09-27', waarde: 12 },
    { dag: '2026-09-28', waarde: 4 },
    { dag: '2026-09-29', waarde: 2, lopend: true },
  ]

  function tekenReeks(extra: Partial<Parameters<typeof DagReeks>[0]> = {}) {
    return render(
      <DagReeks
        punten={punten}
        idBasis="test"
        omschrijving="Voorvallen per dag"
        eenheid="voorvallen"
        markeringen={[{ dag: '2026-09-27', releases: ['Versie 0.92.012'], beheeracties: 1 }]}
        {...extra}
      />,
    )
  }

  it('tekent een niet-gemeten dag als arcering, nooit als kolom of als nul', () => {
    const { container } = tekenReeks()
    expect(container.querySelectorAll('[data-soort="niet-gemeten"]')).toHaveLength(1)
    // Twee gevulde kolommen (12 en 4); de nul heeft geen kolom, vandaag een open.
    expect(container.querySelectorAll('[data-soort="waarde"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-soort="lopend"]')).toHaveLength(1)
    expect(screen.getByText('gearceerd = niet gemeten')).toBeInTheDocument()
    expect(screen.getByText('open kolom = vandaag, loopt nog')).toBeInTheDocument()
  })

  it('zet een ingreep als markering bij de dag en noemt hem in de regel van die dag', () => {
    const { container } = tekenReeks()
    expect(container.querySelectorAll('[data-soort="markering"]')).toHaveLength(1)
    const tips = [...container.querySelectorAll('[data-dag]')].map((t) => t.getAttribute('data-tip'))
    expect(tips).toHaveLength(5)
    expect(tips).toContain('27 sep: 12 voorvallen · Versie 0.92.012, 1 beheeractie')
    expect(tips).toContain('25 sep: niet gemeten')
    expect(tips).toContain('29 sep: 2 voorvallen (vandaag, loopt nog)')
    expect(screen.getByText('release')).toBeInTheDocument()
  })

  it('heeft een toegankelijke naam en een tabelweergave met dezelfde cijfers', () => {
    tekenReeks()
    expect(screen.getByRole('slider', { name: /^Voorvallen per dag/ })).toBeInTheDocument()
    const tabel = screen.getByRole('table')
    expect(within(tabel).getByText('niet gemeten')).toBeInTheDocument()
    expect(within(tabel).getByText('Versie 0.92.012, 1 beheeractie')).toBeInTheDocument()
    expect(within(tabel).getByText('loopt nog')).toBeInTheDocument()
  })

  it('tekent vaste grenzen als lijn en noemt ze in de legenda', () => {
    const { container } = tekenReeks({
      referenties: [
        { waarde: 8, label: 'grens goed', streep: 'lang' },
        { waarde: 10, label: 'grens slecht', streep: 'kort' },
      ],
    })
    const lijnen = [...container.querySelectorAll('[data-soort="referentie"]')]
    expect(lijnen).toHaveLength(2)
    // Twee grenzen zijn ook zonder kleur uit elkaar te houden: een andere streepvorm.
    expect(lijnen.map((l) => l.getAttribute('data-streep'))).toEqual(['lang', 'kort'])
    expect(lijnen[0].className).toContain('border-dashed')
    expect(lijnen[1].className).toContain('border-dotted')
    // Een grens op 8 bij een as tot 20 staat op 40% van de hoogte.
    expect((lijnen[0] as HTMLElement).style.bottom).toBe('40%')
    expect(screen.getByText('grens goed')).toBeInTheDocument()
    expect(screen.getByText('grens slecht')).toBeInTheDocument()
  })

  it('compact: alleen de grafiek, zonder tabel en legenda, maar mét de markering', () => {
    const { container } = tekenReeks({ compact: true })
    expect(screen.getByRole('slider', { name: /^Voorvallen per dag/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('release')).toBeNull()
    expect(container.querySelectorAll('[data-soort="markering"]')).toHaveLength(1)
  })

  it('de hoogte van een kolom volgt de waarde op de schaal van de as', () => {
    const { container } = tekenReeks({ schaalMax: 24 })
    const kolommen = [...container.querySelectorAll<HTMLElement>('[data-soort="waarde"]')]
    // 12 en 4 op een as tot 24.
    expect(kolommen.map((k) => k.style.height)).toEqual(['50%', `${(4 / 24) * 100}%`])
  })

  it('een waarde boven de as loopt niet buiten het veld', () => {
    const { container } = tekenReeks({ schaalMax: 6 })
    const kolommen = [...container.querySelectorAll<HTMLElement>('[data-soort="waarde"]')]
    expect(kolommen[0].style.height).toBe('100%')
  })

  it('zonder dagen: een lege toestand, geen lege grafiek', () => {
    render(<DagReeks punten={[]} idBasis="leeg" omschrijving="Leeg" />)
    expect(screen.getByText('Geen dagen in deze periode.')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

describe('Kerncijfer', () => {
  const basis = {
    label: 'Foutvoorvallen',
    periode: '22–28 sep',
    definitie: 'Regels in het foutenlogboek.',
    href: '/beheer?onderwerp=betrouwbaarheid',
    linkLabel: 'Verloop',
    testId: 'k',
  }

  it('toont het getal met periode, definitie, vergelijking en doorklik', () => {
    render(
      <Kerncijfer
        {...basis}
        waarde="271"
        vergelijking={{ verschil: 31, met: '15–21 sep: 240', stijgingGunstig: false }}
      />,
    )
    const kaart = screen.getByTestId('k')
    expect(within(kaart).getByText('271')).toBeInTheDocument()
    expect(within(kaart).getByText('22–28 sep')).toBeInTheDocument()
    expect(within(kaart).getByText('Regels in het foutenlogboek.')).toBeInTheDocument()
    expect(kaart).toHaveTextContent('+31 (meer) ten opzichte van 15–21 sep: 240')
    expect(within(kaart).getByRole('link', { name: 'Verloop' })).toHaveAttribute('href', basis.href)
  })

  it('kleurt een stijging naar wat ze betekent: meer fouten ongunstig, meer gebruikers gunstig', () => {
    const { container, rerender } = render(
      <Kerncijfer {...basis} waarde="5" vergelijking={{ verschil: 2, met: 'x', stijgingGunstig: false }} />,
    )
    expect(container.querySelector('.text-negative')).not.toBeNull()
    rerender(<Kerncijfer {...basis} waarde="5" vergelijking={{ verschil: 2, met: 'x', stijgingGunstig: true }} />)
    expect(container.querySelector('.text-positive')).not.toBeNull()
    expect(container.querySelector('.text-negative')).toBeNull()
  })

  it('zonder oordeel blijft het verschil neutraal van kleur', () => {
    const { container } = render(
      <Kerncijfer {...basis} waarde="5" vergelijking={{ verschil: 2, met: 'x', stijgingGunstig: null }} />,
    )
    expect(container.querySelector('.text-positive, .text-negative')).toBeNull()
  })

  it('zegt waarom er geen vergelijking is in plaats van een nul te tonen', () => {
    render(
      <Kerncijfer
        {...basis}
        waarde="5"
        vergelijking={{ verschil: null, met: '', reden: 'de vorige periode is niet gemeten.', stijgingGunstig: false }}
      />,
    )
    expect(screen.getByTestId('k')).toHaveTextContent('Geen vergelijking: de vorige periode is niet gemeten.')
  })

  it('zonder meting: een statusteken met uitleg, geen getal', () => {
    render(
      <Kerncijfer
        {...basis}
        waarde={null}
        zonderMeting={{ status: 'meting-mislukt', uitleg: 'De bron kon niet worden gelezen.' }}
      />,
    )
    const kaart = screen.getByTestId('k')
    expect(within(kaart).getByText('Meting mislukt')).toBeInTheDocument()
    expect(within(kaart).getByText('De bron kon niet worden gelezen.')).toBeInTheDocument()
    expect(kaart.querySelector('.text-2xl')).toBeNull()
  })
})

describe('OntwikkelingSectie', () => {
  const momenten = {
    alle: ['2026-09-20T09:00:00Z', '2026-09-27T09:00:00Z', '2026-09-28T09:00:00Z'],
    ai: ['2026-09-28T09:00:00Z'],
    afgekaptVanaf: null,
    vensterGrootte: 1000,
  }
  const w = (n: number) => ({ soort: 'waarde' as const, n })
  const gebruikOk = {
    status: 'ok',
    data: {
      // Band van 30 dagen tot en met 29 sep: begint op maandag 31 aug.
      vensterDagen: 30,
      weektrend: [
        { week: '2026-W38', actief: w(9), nieuw: w(0) },
        { week: '2026-W39', actief: w(12), nieuw: w(0) },
        { week: '2026-W40', actief: { soort: 'klein' as const }, nieuw: w(0) },
      ],
    },
  } as unknown as GebruikAnalyseResultaat

  function invoer(deel: Partial<OntwikkelingInvoer> = {}): OntwikkelingInvoer {
    return {
      dagen: 7,
      nu: NU,
      fouten: bronOk(bouwFoutenVerloop(momenten, 'alle', { nu: NU, dagen: 7 })),
      ai: bronOk(
        bouwAiBeeld({
          aanroepen: [
            {
              created_at: '2026-09-27T09:00:00Z',
              feature: 'chat',
              provider: 'anthropic',
              model: 'claude-sonnet-4-5',
              input: 100,
              output: 10,
              cacheRead: 0,
              cacheWrite: 0,
              systeem: false,
            },
          ],
          mislukt: momenten.ai,
          foutenAfgekaptVanaf: null,
          nu: NU,
          dagen: 7,
        }),
      ),
      gebruik: gebruikOk,
      vitals: bronOk(
        bouwVitalsVerloop(
          {
            dagen: 7,
            samenvatting: [{ metric: 'LCP', p75: 2100, metingen: 640 }],
            perDag: [{ dag: '2026-09-27', metric: 'LCP', p75: 2000, metingen: 90 }],
          },
          'LCP',
          NU,
        ),
      ),
      ingrepen: [RELEASE],
      ...deel,
    }
  }

  it('toont vier kerncijfers, elk met periode en doorklik naar zijn verdieping', () => {
    render(<OntwikkelingSectie invoer={invoer()} />)

    const fouten = screen.getByTestId('kerncijfer-fouten')
    expect(within(fouten).getByText('22–28 sep')).toBeInTheDocument()
    expect(fouten).toHaveTextContent('+1 (meer) ten opzichte van 15–21 sep: 1')
    expect(within(fouten).getByRole('link')).toHaveAttribute('href', '/beheer?onderwerp=betrouwbaarheid&dagen=7')

    const ai = screen.getByTestId('kerncijfer-ai')
    expect(ai).toHaveTextContent('1 van 2 pogingen mislukt')
    expect(within(ai).getByRole('link')).toHaveAttribute('href', '/beheer?onderwerp=ai&dagen=7')

    const gebruik = screen.getByTestId('kerncijfer-gebruik')
    expect(within(gebruik).getByText('12')).toBeInTheDocument()
    expect(within(gebruik).getByText('week 39, 2026')).toBeInTheDocument()
    expect(gebruik).toHaveTextContent('+3 (meer) ten opzichte van wk 38: 9')
    expect(within(gebruik).getByRole('link')).toHaveAttribute('href', '/beheer/gebruik?dagen=30')

    const vitals = screen.getByTestId('kerncijfer-vitals')
    expect(within(vitals).getByText('2.100 ms')).toBeInTheDocument()
    expect(vitals).toHaveTextContent('p75 · goed (goed tot 2.500 ms) · 640 metingen')
    expect(within(vitals).getByRole('link')).toHaveAttribute('href', '/beheer/webprestaties?dagen=7&metric=LCP')
  })

  it('een onderdrukte week toont "< 5" en geen verschil', () => {
    const klein = {
      status: 'ok',
      data: {
        vensterDagen: 30,
        weektrend: [
          { week: '2026-W38', actief: w(9), nieuw: w(0) },
          { week: '2026-W39', actief: { soort: 'klein' as const }, nieuw: w(0) },
        ],
      },
    } as unknown as GebruikAnalyseResultaat
    render(<OntwikkelingSectie invoer={invoer({ gebruik: klein })} />)
    const gebruik = screen.getByTestId('kerncijfer-gebruik')
    expect(within(gebruik).getByText('< 5')).toBeInTheDocument()
    expect(gebruik).toHaveTextContent('Geen vergelijking')
    // In de grafiek is de week gearceerd, nooit een kolom en nooit een nul.
    const weken = [...gebruik.querySelectorAll('[data-dag]')]
    expect(weken.map((k) => k.getAttribute('data-tip'))).toEqual([
      'week 38, 2026: 9 gebruikers',
      'week 39, 2026: < 5 gebruikers',
    ])
    expect(weken[1].querySelector('[data-soort="niet-gemeten"]')).not.toBeNull()
    expect(weken[1].querySelector('[data-soort="waarde"]')).toBeNull()
    expect(gebruik).toHaveTextContent('gearceerd = minder dan vijf of verborgen')
    // De kolommen zijn weken, dus de grafiek praat over weken.
    expect(within(gebruik).getByRole('slider')).toHaveAccessibleName(/Pijltjestoetsen lezen per week/)
    expect(gebruik).toHaveTextContent('Wijs een week aan of tik erop.')
    expect(gebruik).not.toHaveTextContent('Wijs een dag aan')
  })

  it('de afgekapte eerste week van de band telt niet als volle week', () => {
    // Band van 7 dagen tot en met dinsdag 29 sep: begint op woensdag 23 sep,
    // midden in week 39. Die week telt dan vijf dagen en is niet te vergelijken.
    const kort = {
      status: 'ok',
      data: {
        vensterDagen: 7,
        weektrend: [
          { week: '2026-W39', actief: w(4), nieuw: w(0) },
          { week: '2026-W40', actief: w(2), nieuw: w(0) },
        ],
      },
    } as unknown as GebruikAnalyseResultaat
    render(<OntwikkelingSectie invoer={invoer({ gebruik: kort })} />)
    const gebruik = screen.getByTestId('kerncijfer-gebruik')
    expect(within(gebruik).getByText('Geen gegevens')).toBeInTheDocument()
    expect(gebruik).toHaveTextContent('Er is nog geen volle week gemeten.')
    expect(gebruik.querySelectorAll('[data-dag]')).toHaveLength(0)
  })

  it('een afgekapte lezing van de AI-aanroepen geeft geen getal, maar zegt waarom', () => {
    const ai = bronOk(
      bouwAiBeeld({
        aanroepen: [],
        aanroepenAfgekaptVanaf: '2026-09-25T09:00:00Z',
        mislukt: [],
        foutenAfgekaptVanaf: null,
        nu: NU,
        dagen: 7,
      }),
    )
    render(<OntwikkelingSectie invoer={invoer({ ai })} />)
    const kaart = screen.getByTestId('kerncijfer-ai')
    expect(within(kaart).getByText('Geen gegevens')).toBeInTheDocument()
    expect(kaart).toHaveTextContent('raakte haar bovengrens')
    expect(kaart.querySelector('.text-2xl')).toBeNull()
  })

  it('elke bron die faalt geeft zijn eigen kaart een statusteken; de andere kaarten blijven staan', () => {
    render(
      <OntwikkelingSectie
        invoer={invoer({
          fouten: { soort: 'fout' },
          vitals: { soort: 'niet-uitgerold' },
          gebruik: { status: 'fout', vensterDagen: 30, intern: false },
        })}
      />,
    )
    expect(within(screen.getByTestId('kerncijfer-fouten')).getByText('Meting mislukt')).toBeInTheDocument()
    expect(within(screen.getByTestId('kerncijfer-vitals')).getByText('N.v.t.')).toBeInTheDocument()
    expect(within(screen.getByTestId('kerncijfer-gebruik')).getByText('Meting mislukt')).toBeInTheDocument()
    expect(screen.getByTestId('kerncijfer-ai')).toHaveTextContent('1 van 2 pogingen mislukt')
  })

  it('de laadtijd zegt waarom er geen vergelijking met een vorige periode is', () => {
    render(<OntwikkelingSectie invoer={invoer()} />)
    expect(screen.getByTestId('kerncijfer-vitals')).toHaveTextContent('niet over twee periodes naast elkaar')
  })

  it('volgt het koppencontract', () => {
    const { container } = render(<OntwikkelingSectie invoer={invoer()} />)
    verwachtGeldigeKoppen(container, 2)
  })
})

describe('IngrepenSectie', () => {
  it('toont releases en beheeracties met hun moment', () => {
    render(<IngrepenSectie ingrepen={lezing([RELEASE, ACTIE])} dagen={30} nu={NU} />)
    const lijst = screen.getByTestId('ingrepen-lijst')
    expect(within(lijst).getByText('27 sep')).toBeInTheDocument()
    expect(within(lijst).getByText('15 sep 10:30')).toBeInTheDocument()
    expect(within(lijst).getByRole('link', { name: 'Configuratie gewijzigd' })).toHaveAttribute(
      'href',
      '/beheer/audit?actie=config.update',
    )
  })

  it('zegt het als er niets veranderd is', () => {
    render(<IngrepenSectie ingrepen={lezing([])} dagen={30} nu={NU} />)
    expect(screen.getByText('Geen releases of beheeracties in deze periode.')).toBeInTheDocument()
    expect(screen.queryByTestId('ingrepen-afgekapt')).toBeNull()
  })

  it('zegt het als de audit-trail niet volledig gelezen is', () => {
    render(<IngrepenSectie ingrepen={lezing([RELEASE, ACTIE], '2026-09-10T08:00:00Z')} dagen={30} nu={NU} />)
    expect(screen.getByTestId('ingrepen-afgekapt')).toHaveTextContent(
      'De audit-trail is gelezen tot 10 sep 10:00; beheeracties van daarvoor kunnen ontbreken.',
    )
  })

  it('een onleesbare audit-trail is geen lege lijst', () => {
    render(<IngrepenSectie ingrepen={{ soort: 'fout' }} dagen={30} nu={NU} />)
    expect(screen.getByText(/De audit-trail kon niet worden gelezen/)).toBeInTheDocument()
    expect(screen.queryByTestId('ingrepen-lijst')).toBeNull()
  })
})

describe('DashboardNavigatie', () => {
  it('markeert de actieve weergave en periode, en behoudt de ander bij het wisselen', () => {
    render(<DashboardNavigatie onderwerp="betrouwbaarheid" dagen={7} />)
    expect(screen.getByRole('link', { name: 'Betrouwbaarheid' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '7 dagen' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Fin & AI' })).toHaveAttribute('href', '/beheer?onderwerp=ai&dagen=7')
    expect(screen.getByRole('link', { name: '90 dagen' })).toHaveAttribute(
      'href',
      '/beheer?onderwerp=betrouwbaarheid&dagen=90',
    )
    expect(screen.getByRole('link', { name: 'Overzicht' })).toHaveAttribute('href', '/beheer?dagen=7')
  })
})

describe('AlleSchermen', () => {
  const alle = BEHEER_GROUPS.flatMap((g) => g.tools)

  it('houdt elk beheerscherm bereikbaar', () => {
    render(<AlleSchermen counts={{ errors: null, feedback: null, calculator_reports: null }} />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href')).sort()).toEqual(alle.map((t) => t.href).sort())
    for (const tool of alle) {
      const link = links.find((l) => l.getAttribute('href') === tool.href)
      expect(link, tool.href).toHaveTextContent(tool.label)
    }
  })

  it('toont een teller alleen als er werk ligt; een ontbrekende teller is geen nul', () => {
    const { rerender } = render(<AlleSchermen counts={{ errors: 4, feedback: 0, calculator_reports: null }} />)
    expect(screen.getAllByTestId('beheer-inbox-count')).toHaveLength(1)
    expect(screen.getByTestId('beheer-inbox-count')).toHaveTextContent('4 open')
    rerender(<AlleSchermen counts={{ errors: null, feedback: null, calculator_reports: null }} />)
    expect(screen.queryByTestId('beheer-inbox-count')).toBeNull()
  })
})

describe('Verantwoording', () => {
  it('noemt bij elke ontbrekende meting de beslissing die erop wacht', () => {
    render(<Verantwoording />)
    expect(BLINDE_VLEKKEN.length).toBeGreaterThanOrEqual(5)
    for (const v of BLINDE_VLEKKEN) {
      expect(screen.getByText(v.titel)).toBeInTheDocument()
      expect(v.watOntbreekt.length).toBeGreaterThan(20)
      expect(v.welkeBeslissing.length).toBeGreaterThan(10)
    }
  })
})

describe('BetrouwbaarheidWeergave', () => {
  const a = foutsoort({ signature: 'a'.repeat(16), voorbeeld: 'Saldo laadt niet', context: 'client:saldo' })
  const b = foutsoort({ signature: 'b'.repeat(16), voorbeeld: 'Grafiek leeg', open: false })
  const feiten: DashboardFeiten = {
    ...gezondeFeiten(),
    fouten: bronOk(
      foutenFeit(
        [a, b],
        [
          voorval(a.signature, '2026-09-28T09:00:00Z', 1),
          voorval(a.signature, '2026-09-28T10:00:00Z', null),
          voorval(a.signature, '2026-09-27T10:00:00Z', 2),
          voorval(b.signature, '2026-09-27T10:00:00Z', 1),
          voorval(b.signature, '2026-08-01T10:00:00Z', 9),
        ],
      ),
    ),
    taken: bronOk({
      standen: metStand(
        gezondeStanden(),
        stand('snapshots', 'overdue', run('snapshots', 'success', '2026-07-31T07:00:00.000Z')),
      ),
      cronSecret: true,
      pushKanaal: true,
      drift: { unknownCrons: [], unscheduledJobs: [] },
    }),
  }
  const momenten = {
    alle: ['2026-09-27T09:00:00Z', '2026-09-28T09:00:00Z'],
    ai: [],
    afgekaptVanaf: null,
    vensterGrootte: 1000,
  }

  function weergave(deel: Partial<Parameters<typeof BetrouwbaarheidWeergave>[0]> = {}) {
    return render(
      <BetrouwbaarheidWeergave
        dagen={7}
        nu={NU}
        feiten={feiten}
        verloop={bronOk(bouwFoutenVerloop(momenten, 'alle', { nu: NU, dagen: 7 }))}
        vitals={bronOk(
          bouwVitalsVerloop(
            { dagen: 7, samenvatting: [{ metric: 'LCP', p75: 4300, metingen: 640 }], perDag: [] },
            'LCP',
            NU,
          ),
        )}
        ingrepen={[RELEASE]}
        {...deel}
      />,
    )
  }

  it('rangschikt de foutsoorten op voorvallen in de periode en toont de ondergrens aan gebruikers', () => {
    weergave()
    const regels = within(screen.getByTestId('veroorzakers')).getAllByRole('listitem')
    expect(regels).toHaveLength(2)
    expect(regels[0]).toHaveTextContent('Saldo laadt niet')
    expect(regels[0]).toHaveTextContent('3×')
    expect(regels[0]).toHaveTextContent('min. 2 gebr.')
    // Soort b: alleen het voorval binnen de periode telt, dat van augustus niet.
    expect(regels[1]).toHaveTextContent('1×')
    expect(regels[1]).toHaveTextContent('afgehandeld')
    expect(within(regels[0]).getByRole('link')).toHaveAttribute('href', `/beheer/errors?soort=${a.signature}`)
  })

  it('toont per taak de toestand en linkt naar de kaart van die taak', () => {
    weergave()
    const tabel = screen.getByTestId('taken-tabel')
    const rij = within(tabel).getByRole('link', { name: 'Maandsnapshots' }).closest('tr') as HTMLElement
    expect(within(rij).getByText('Afwijkend · hoog')).toBeInTheDocument()
    expect(within(rij).getByText('loopt achter')).toBeInTheDocument()
    expect(within(rij).getByText('binnen 32 dagen')).toBeInTheDocument()
    expect(within(tabel).getByRole('link', { name: 'Maandsnapshots' })).toHaveAttribute(
      'href',
      '/beheer/jobs#taak-snapshots',
    )
    expect(within(tabel).getAllByText('niet bewaakt')).toHaveLength(ONBEWAAKT)
  })

  it('zet de laadtijd af tegen beide grenzen', () => {
    weergave()
    expect(screen.getByText('4.300 ms')).toBeInTheDocument()
    expect(screen.getByText('slecht')).toBeInTheDocument()
    expect(screen.getByText('goed tot 2.500 ms')).toBeInTheDocument()
    expect(screen.getByText('slecht boven 4.000 ms')).toBeInTheDocument()
  })

  it('een onleesbaar foutenlogboek geeft een melding en geen cijfers', () => {
    weergave({ verloop: { soort: 'fout' }, feiten: { ...feiten, fouten: { soort: 'fout' } } })
    expect(screen.getAllByTestId('bron-melding')).toHaveLength(2)
    expect(screen.queryByTestId('veroorzakers')).toBeNull()
    // De taken komen uit een andere bron en blijven staan.
    expect(screen.getByTestId('taken-tabel')).toBeInTheDocument()
  })

  it('zegt het als het leesvenster is afgekapt', () => {
    weergave({
      verloop: bronOk(
        bouwFoutenVerloop({ ...momenten, afgekaptVanaf: '2026-09-24T09:00:00Z' }, 'alle', { nu: NU, dagen: 7 }),
      ),
    })
    expect(screen.getByText(/Dagen daarvoor zijn niet gemeten, niet nul/)).toBeInTheDocument()
  })

  it('een venster dat de periode niet dekt, maakt elk aantal bij de veroorzakers een ondergrens', () => {
    if (feiten.fouten.soort !== 'ok') throw new Error()
    const afgekapt: DashboardFeiten = {
      ...feiten,
      fouten: bronOk({ ...feiten.fouten.data, afgekapt: true, vensterVanaf: '2026-09-27T10:00:00Z' }),
    }
    weergave({ feiten: afgekapt })
    expect(screen.getByTestId('veroorzakers-venster')).toHaveTextContent('begint op 27 sep')
    const regels = within(screen.getByTestId('veroorzakers')).getAllByRole('listitem')
    expect(regels[0]).toHaveTextContent('min. 3×')
    // Ook de soort waarvan elk voorval een gebruiker draagt.
    expect(regels[1]).toHaveTextContent('min. 1 gebr.')
  })

  it('de bereikbaarheidsmeting heet tijdens een storing bij een dienst niet achterstallig', () => {
    if (feiten.taken.soort !== 'ok') throw new Error()
    const storing: DashboardFeiten = {
      ...feiten,
      taken: bronOk({
        ...feiten.taken.data,
        standen: metStand(
          gezondeStanden(),
          stand(
            'integraties-health',
            'overdue',
            run('integraties-health', 'error', FIXTURE_NU, { summary: { probed: 14, ok: 5, failed: 1, failures: { kraken: {} } } }),
            '2026-09-25T18:57:00.000Z',
          ),
        ),
      }),
    }
    weergave({ feiten: storing })
    const rij = within(screen.getByTestId('taken-tabel'))
      .getByRole('link', { name: 'Integraties liveness' })
      .closest('tr') as HTMLElement
    expect(within(rij).getByText('Gezond')).toBeInTheDocument()
    expect(rij).not.toHaveTextContent('loopt achter')
  })

  it('volgt het koppencontract', () => {
    const { container } = weergave()
    verwachtGeldigeKoppen(container, 2)
  })
})

describe('AiWeergave', () => {
  const aanroep = (created_at: string, feature: string, model = 'claude-sonnet-4-5', provider = 'anthropic') => ({
    created_at,
    feature,
    provider,
    model,
    input: 1_000_000,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    systeem: feature !== 'chat',
  })
  const beeld = (aanroepen: ReturnType<typeof aanroep>[]) =>
    bronOk(bouwAiBeeld({ aanroepen, mislukt: ['2026-09-28T09:00:00Z'], foutenAfgekaptVanaf: null, nu: NU, dagen: 7 }))
  const gezond = { status: 'ok' as const, sinceAt: null, failureCount: 0, lastSuccessAt: '2026-09-28T17:00:00.000Z' }
  const koers = { usdNaarEur: 0.5, benadering: false }

  it('toont de stand, het aandeel mislukt en de geschatte kosten in euro', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={gezond}
        aiUit={false}
        beeld={beeld([aanroep('2026-09-27T09:00:00Z', 'chat'), aanroep('2026-09-28T09:00:00Z', 'nieuws_duiding')])}
        koers={koers}
        ingrepen={[]}
      />,
    )
    expect(screen.getByText('Gezond')).toBeInTheDocument()
    expect(screen.getByText('1 van 3 pogingen')).toBeInTheDocument()
    // Twee keer 1 miljoen inputtokens à 3 dollar, tegen 0,50 euro per dollar.
    expect(screen.getAllByText(/€\s*3,00/).length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('functie-balken')).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Verbruik per provider en per account' })).toHaveAttribute(
      'href',
      '/beheer/ai-verbruik?dagen=7',
    )
  })

  it('een model zonder tarief maakt de kosten "onbekend", nooit nul euro', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={gezond}
        aiUit={false}
        beeld={beeld([aanroep('2026-09-27T09:00:00Z', 'chat', 'gpt-4o', 'openai')])}
        koers={koers}
        ingrepen={[]}
      />,
    )
    expect(screen.getAllByText('onbekend').length).toBeGreaterThan(0)
    expect(screen.getByText(/Geen tarief bekend voor gpt-4o/)).toBeInTheDocument()
    expect(screen.queryByText(/€\s*0,00/)).toBeNull()
  })

  it('zegt het als de wisselkoers een benadering is', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={gezond}
        aiUit={false}
        beeld={beeld([aanroep('2026-09-27T09:00:00Z', 'chat')])}
        koers={{ usdNaarEur: 0.92, benadering: true }}
        ingrepen={[]}
      />,
    )
    expect(screen.getByText(/benadering: de actuele koers was niet op te halen/)).toBeInTheDocument()
  })

  it('AI bewust uit: de stand is niet van toepassing, geen storing', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={{ status: 'storing', sinceAt: FIXTURE_NU, failureCount: 4, lastSuccessAt: null }}
        aiUit
        beeld={beeld([])}
        koers={koers}
        ingrepen={[]}
      />,
    )
    expect(screen.getByText('N.v.t.')).toBeInTheDocument()
    expect(screen.getByText(/staat uit via de noodschakelaar/)).toBeInTheDocument()
    expect(screen.queryByText(/Afwijkend/)).toBeNull()
  })

  it('een niet volledig gelezen periode toont geen nul en telt geen kosten op', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={gezond}
        aiUit={false}
        beeld={bronOk(
          bouwAiBeeld({
            aanroepen: [aanroep('2026-09-28T09:00:00Z', 'chat')],
            aanroepenAfgekaptVanaf: '2026-09-26T09:00:00Z',
            mislukt: [],
            foutenAfgekaptVanaf: null,
            nu: NU,
            dagen: 7,
          }),
        )}
        koers={koers}
        ingrepen={[]}
      />,
    )
    expect(screen.getByTestId('ai-verbruik-onvolledig')).toHaveTextContent('een ondergrens')
    expect(screen.getAllByText('niet volledig gemeten').length).toBeGreaterThan(0)
    // Geen totaal uit een deelsom.
    expect(screen.getAllByText('onbekend').length).toBeGreaterThan(0)
  })

  it('een onleesbaar verbruikslogboek laat de stand staan en toont verder geen cijfers', () => {
    render(
      <AiWeergave
        dagen={7}
        nu={NU}
        gezondheid={gezond}
        aiUit={false}
        beeld={{ soort: 'fout' }}
        koers={koers}
        ingrepen={[]}
      />,
    )
    expect(screen.getByText('Gezond')).toBeInTheDocument()
    expect(screen.getByTestId('bron-melding')).toHaveTextContent('Het AI-verbruik kon niet worden gelezen')
    expect(screen.queryByTestId('functie-balken')).toBeNull()
  })
})

describe('IngrepenWeergave', () => {
  const momenten = {
    alle: [
      ...['08', '09', '10', '11', '12', '13', '14'].map((d) => `2026-09-${d}T09:00:00Z`),
      ...['16', '17', '18', '19', '20', '21', '22'].flatMap((d) => [`2026-09-${d}T09:00:00Z`, `2026-09-${d}T10:00:00Z`]),
    ],
    ai: [],
    afgekaptVanaf: null,
    vensterGrootte: 1000,
  }
  const verloop = (welke: 'alle' | 'ai') => bronOk(bouwFoutenVerloop(momenten, welke, { nu: NU, dagen: 30 }))

  it('zet de week ervoor naast de week erna en zegt dat het een waarneming is', () => {
    render(
      <IngrepenWeergave dagen={30} nu={NU} ingrepen={lezing([RELEASE, ACTIE])} fouten={verloop('alle')} aiFouten={verloop('ai')} />,
    )
    expect(screen.getByText(/Dit is een waarneming, geen bewijs/)).toBeInTheDocument()

    const tabel = screen.getByTestId('effect-tabel')
    const actie = within(tabel).getByRole('link', { name: 'Configuratie gewijzigd' }).closest('tr') as HTMLElement
    expect(actie).toHaveTextContent('8–14 sep · 16–22 sep')
    expect(actie).toHaveTextContent('7 → 14verschil +7')

    // De release van 27 sep: de week erna loopt nog.
    const release = within(tabel).getByRole('link', { name: 'Versie 0.92.012' }).closest('tr') as HTMLElement
    expect(release).toHaveTextContent('week erna loopt nog, 1 van 7 dagen')
    expect(release.textContent).not.toMatch(/→/)
  })

  it('noemt wat niet in de tijdlijn staat', () => {
    render(
      <IngrepenWeergave dagen={30} nu={NU} ingrepen={lezing([RELEASE])} fouten={verloop('alle')} aiFouten={verloop('ai')} />,
    )
    expect(screen.getByText('Wat hier niet in staat')).toBeInTheDocument()
    expect(screen.getByText(/Het tijdstip van uitrol/)).toBeInTheDocument()
  })

  it('toont alleen ingrepen binnen de gekozen periode', () => {
    render(
      <IngrepenWeergave dagen={7} nu={NU} ingrepen={lezing([RELEASE, ACTIE])} fouten={verloop('alle')} aiFouten={verloop('ai')} />,
    )
    expect(within(screen.getByTestId('ingrepen-lijst')).getAllByRole('listitem')).toHaveLength(1)
    expect(within(screen.getByTestId('effect-tabel')).queryByText('Configuratie gewijzigd')).toBeNull()
  })

  it('een onleesbare audit-trail geeft een melding, geen lege tabel', () => {
    render(
      <IngrepenWeergave dagen={30} nu={NU} ingrepen={{ soort: 'fout' }} fouten={verloop('alle')} aiFouten={verloop('ai')} />,
    )
    expect(screen.getByTestId('bron-melding')).toHaveTextContent('De audit-trail kon niet worden gelezen')
    expect(screen.queryByTestId('effect-tabel')).toBeNull()
  })

  it('volgt het koppencontract', () => {
    const { container } = render(
      <IngrepenWeergave dagen={30} nu={NU} ingrepen={lezing([RELEASE, ACTIE])} fouten={verloop('alle')} aiFouten={verloop('ai')} />,
    )
    verwachtGeldigeKoppen(container, 2)
  })
})
