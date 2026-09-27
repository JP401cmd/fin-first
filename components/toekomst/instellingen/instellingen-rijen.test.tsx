import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { POT_RULES_DEFAULTS } from '@/lib/pot-rules'
import { RIJ_META, RIJ_SLEUTELS, type RijSleutel } from '@/lib/toekomst/instellingen-rij'
import {
  RIJ_LABEL,
  INFLATIE_LINK,
  INSTELLINGEN_SECTIE_KOP,
  NOG_NIET_BEVESTIGD,
  RENDEMENT_HINT,
} from '@/lib/toekomst/instellingen-rijwaarden'
import { freedomDaysToday } from '@/lib/horizon/vrijheidsdagen'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { PlanReviewProgress } from '@/lib/plan-review/types'
import {
  ToekomstKaternMeldingenContext,
  type ToekomstKaternMeldingenWaarde,
} from '@/components/toekomst/meldingen/toekomst-katern-meldingen'

/**
 * InstellingenRijen (ADR 0179 fase 3) — één rij per instelling, elke ✎ opent de bestaande
 * body. De editors zijn hier verklikkers: ze tonen wat er open is en met welke props
 * (anker, kolom, snapshot, jaarruimte). De bodies zelf hebben eigen tests.
 */

const nav = vi.hoisted(() => ({ search: new URLSearchParams(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: nav.refresh, replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
  usePathname: () => '/toekomst/instellingen',
}))

type Stub = Record<string, unknown>
const laatst = vi.hoisted(() => ({ regel: null as Stub | null }))
vi.mock('@/components/future/regel-bewerken-pane', () => ({
  RegelBewerkenPane: (p: Stub) => {
    laatst.regel = p
    return p.open ? (
      <div data-testid="regel-pane">
        {String(p.regelId)}|{String(p.anker ?? '')}|{p.simSnapshot ? 'snap' : 'geen'}
      </div>
    ) : null
  },
}))
vi.mock('@/components/future/voorkeur-bewerken-sheet', () => ({
  VoorkeurBewerkenSheet: (p: Stub) => (
    <div data-testid="voorkeur-sheet">
      {String(p.column)}|{String(p.currentValuePct)}|{p.snapshot ? 'snap' : 'geen'}
    </div>
  ),
}))
vi.mock('@/components/future/box3-methode-sheet', () => ({
  Box3MethodeSheet: (p: Stub) => <div data-testid="box3-sheet">{String(p.current)}|{p.snapshot ? 'snap' : 'geen'}</div>,
}))
vi.mock('./uitgaven-rij-pane', () => ({
  UitgavenRijPane: (p: { open: boolean; snapshot: unknown }) =>
    p.open ? <div data-testid="uitgaven-pane">{p.snapshot ? 'snap' : 'geen'}</div> : null,
}))

import { InstellingenRijen, type InstellingenRijenProps } from './instellingen-rijen'

const PROPS: InstellingenRijenProps = {
  fireParams: { grossReturn: 0.05, inflationRate: 0.02, effectiveSwr: 0.034, box3Method: 'forfaitair', marginaalTarief: 0.37 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  firePlan: { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  withdrawalProfiel: 'afnemend',
  simSnapshot: { rawContext: {} } as never,
  regelVoorkeuren: POT_RULES_DEFAULTS,
  potBalances: { spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0 },
  box3HeffingvrijInkomen: null,
  events: [],
  housingStrategy: { mode: 'include_full' },
  retirementMethod: 'essential_budgets',
  uitgaveNaPensioen: 30_000,
  geenTekortLening: true,
  tekortLeningRente: 0.05,
  dagtarief: 100,
  dagtariefBron: 'transactions',
}

const HIER: RijSleutel[] = RIJ_SLEUTELS.filter((r) => RIJ_META[r].sectie !== 'levensstrategieen')

function renderRijen(
  mode: 'full' | 'simple' = 'full',
  props: InstellingenRijenProps = PROPS,
  meldingen?: ToekomstKaternMeldingenWaarde,
) {
  const boom = (
    <DisplayModeProvider initialMode={mode}>
      <InstellingenRijen {...props} />
    </DisplayModeProvider>
  )
  return render(
    meldingen ? (
      <ToekomstKaternMeldingenContext.Provider value={meldingen}>{boom}</ToekomstKaternMeldingenContext.Provider>
    ) : (
      boom
    ),
  )
}

const rijKnop = (r: RijSleutel) => document.querySelector(`button[data-rij="${r}"]`) as HTMLButtonElement
const ingeklapt = (r: RijSleutel) =>
  (document.querySelector(`[data-rij-wrap="${r}"]`)?.closest('[data-testid="depth-section"]') as HTMLElement | null)
    ?.dataset.collapsed

beforeEach(() => {
  nav.search = new URLSearchParams()
  nav.replace.mockClear()
  nav.refresh.mockClear()
  laatst.regel = null
})
afterEach(cleanup)

describe('InstellingenRijen — R1: drie secties, checklist van je plan', () => {
  it('drie zichtbare h2-secties met kicker en romeins cijfer; geen levensstrategieën, geen h1', () => {
    renderRijen()
    for (const s of ['plan', 'potten', 'markt'] as const) {
      expect(screen.getByRole('heading', { level: 2, name: INSTELLINGEN_SECTIE_KOP[s] })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { name: INSTELLINGEN_SECTIE_KOP.levensstrategieen })).toBeNull()
    for (const r of ['aow', 'pensioen', 'werk', 'huis'] as const) expect(rijKnop(r), r).toBeNull()
    expect(document.body.textContent).toMatch(/I · Wanneer en hoelang/)
    expect(document.querySelector('h1')).toBeNull()
  })

  it('Volledig: elke rij van dit katern is een knop met naam "label: waarde, aanpassen"', () => {
    renderRijen()
    for (const r of HIER) {
      const knop = rijKnop(r)
      expect(knop, r).toBeTruthy()
      expect(knop.textContent).toContain(`${RIJ_LABEL[r]}: `)
      expect(knop.textContent).toMatch(/aanpassen|Toevoegen/)
    }
  })

  it('Stopmoment: "zo vroeg mogelijk" als standaard, zonder leeftijdsgetal (§4.9)', () => {
    renderRijen()
    const waarde = rijKnop('stopmoment').querySelector('[data-staat]')!
    expect(waarde.getAttribute('data-staat')).toBe('standaard')
    expect(waarde.textContent).toContain('zo vroeg mogelijk')
    expect(waarde.textContent).toContain('standaard')
    expect(rijKnop('stopmoment').textContent).not.toMatch(/\d/)
  })

  it('Einde van je plan beantwoordt de vraag', () => {
    renderRijen()
    expect(rijKnop('eindleeftijd').textContent).toContain('Einde van je plan')
    expect(rijKnop('eindleeftijd').textContent).toMatch(/tot 90.*·.*€\s0 over/)
  })

  it('de uitgave-rij: het bedrag uit de bron van KPI 4, met vrijheidstijd uit freedomDaysToday', () => {
    renderRijen()
    const tekst = rijKnop('uitgave-na-pensioen').textContent ?? ''
    expect(tekst).toMatch(/30\.000/)
    const dagen = freedomDaysToday({ nominalAmount: 30_000, canonicalDailyRate: 100, source: 'transactions' })!
    expect(tekst).toContain(`(≈ ${formatFreedomTimeString(calculateFreedomTime(dagen, 1), 'long', false)} vrijheid)`)
  })

  it('de opnamerate staat niet meer in Instellingen (C4)', () => {
    renderRijen()
    expect(document.querySelector('[data-rij="effectief-swr"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Opnamerate/)
  })

  it('inflatie en rendement dragen hun hint onder de eigen rij (I2)', () => {
    renderRijen()
    const inflatie = screen.getByRole('link', { name: new RegExp(INFLATIE_LINK.label) })
    expect(inflatie.getAttribute('href')).toBe(INFLATIE_LINK.href)
    expect(inflatie.closest('[data-rij-wrap="inflatie"]')).toBeTruthy()
    const bezittingen = screen.getByRole('link', { name: RENDEMENT_HINT.link.label })
    expect(bezittingen.closest('[data-rij-wrap="rendement"]')).toBeTruthy()
  })

  it('sectie I draagt het oude anker #voorkeuren', () => {
    const { container } = renderRijen()
    expect(container.querySelector('#voorkeuren')?.contains(rijKnop('stopmoment'))).toBe(true)
  })

  it('II is ook in Volledig ingeklapt, met de samenvatting; openklikken toont de vier regels', () => {
    renderRijen()
    for (const r of ['geen-tekort-lening', 'onttrekkingsvolgorde', 'verdeling-toename', 'onttrekking-afname'] as const) {
      expect(ingeklapt(r), r).toBe('true')
    }
    expect(document.body.textContent).toContain('4 regels · alle standaard')
    expect(ingeklapt('inflatie')).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: /De vier regels voor je potten/ }))
    expect(ingeklapt('geen-tekort-lening')).toBe('false')
  })

  it('II telt een aangepaste regel mee in de samenvatting', () => {
    renderRijen('full', { ...PROPS, geenTekortLening: false })
    expect(document.body.textContent).toContain('4 regels · 1 aangepast')
  })

  it('Eenvoudig: I open; II en III ingeklapt; de koppen blijven h2 (ADR 0110)', () => {
    renderRijen('simple')
    for (const r of ['stopmoment', 'eindleeftijd', 'onttrekking', 'uitgave-na-pensioen'] as const) {
      expect(ingeklapt(r), r).toBeUndefined()
    }
    for (const r of ['geen-tekort-lening', 'inflatie', 'box3'] as const) expect(ingeklapt(r), r).toBe('true')
    expect(screen.getByRole('heading', { level: 2, name: INSTELLINGEN_SECTIE_KOP.markt })).toBeTruthy()
  })

  it('een ontbrekende waarde: italic en "Toevoegen" in plaats van ✎', () => {
    renderRijen('full', { ...PROPS, uitgaveNaPensioen: 0 })
    const knop = rijKnop('uitgave-na-pensioen')
    expect(knop.querySelector('[data-staat]')!.getAttribute('data-staat')).toBe('ontbreekt')
    expect(knop.textContent).toContain('Toevoegen')
    expect(knop.textContent).not.toContain('aanpassen')
  })

  it('"nog niet bevestigd" alleen bij rijen waarvan de wizardstap open staat', () => {
    const progress: PlanReviewProgress = {
      stappen: [
        { stap: 'plan', status: 'bevestigd', reden: null },
        { stap: 'uitgaven', status: 'open', reden: null },
        { stap: 'inkomsten', status: 'open', reden: null },
        { stap: 'woning', status: 'nvt', reden: null },
        { stap: 'potten', status: 'bevestigd', reden: null },
        { stap: 'grondslag', status: 'open', reden: null },
      ],
      bevestigd: 2,
      totaal: 5,
      eersteOpen: 'uitgaven',
      voltooid: false,
    }
    renderRijen('full', { ...PROPS, planReviewProgress: progress })
    expect(rijKnop('uitgave-na-pensioen').textContent).toContain(NOG_NIET_BEVESTIGD)
    for (const r of ['stopmoment', 'onttrekking', 'inflatie'] as const) {
      expect(rijKnop(r).textContent, r).not.toContain(NOG_NIET_BEVESTIGD)
    }
  })
})

describe('InstellingenRijen — duidingsregel bij een plan dat niet haalbaar is (besluit 2)', () => {
  const metMelding = (id: string, titel: string) =>
    ({
      meldingen: {
        plan: {
          meldingen: [
            {
              id,
              katern: 'plan',
              ernst: 'bad',
              titel,
              kort: titel,
              actie: { label: 'Verken je opties', href: '/toekomst/doelen' },
              tweedeActie: { label: 'Stopmoment', href: '/toekomst/instellingen?rij=stopmoment' },
            },
          ],
          hoogsteErnst: 'bad',
          aantal: 1,
        },
        doelen: { meldingen: [], hoogsteErnst: null, aantal: 0 },
        instellingen: { meldingen: [], hoogsteErnst: null, aantal: 0 },
      },
      perKatern: {},
    }) as unknown as ToekomstKaternMeldingenWaarde

  it('dezelfde titel als de Plan-melding, met beide acties in haar volgorde', () => {
    renderRijen('full', PROPS, metMelding('plan-niet-haalbaar', 'Plan nog niet haalbaar'))
    const regel = screen.getByTestId('instellingen-duiding')
    expect(regel.textContent).toBe('Plan nog niet haalbaar. Verken je opties in Doelen, of pas je stopmoment aan ✎.')
    const links = within(regel).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/toekomst/doelen', '/toekomst/instellingen?rij=stopmoment'])
    const link = links[1]
    fireEvent.click(link)
    expect(screen.getByTestId('regel-pane').textContent).toBe('eindstrategie|stop-plan-stopmoment|snap')
  })

  it('ook bij het tekort onder een vast anker; niet bij andere meldingen of zonder provider', () => {
    // Een ankerzin eindigt al op een punt: geen dubbele punt.
    renderRijen('full', PROPS, metMelding('plan-tekort', 'Je geld reikt tot je 90e.'))
    expect(screen.getByTestId('instellingen-duiding').textContent).toMatch(/^Je geld reikt tot je 90e. Verken/)
    cleanup()
    renderRijen('full', PROPS, metMelding('plan-tekort-lening', 'Je plan leunt op een lening'))
    expect(screen.queryByTestId('instellingen-duiding')).toBeNull()
    cleanup()
    renderRijen()
    expect(screen.queryByTestId('instellingen-duiding')).toBeNull()
  })
})

describe('InstellingenRijen — elke ✎ opent de bestaande body, met de snapshot en het rijlabel als titel', () => {
  it.each(HIER)('%s', (r) => {
    renderRijen()
    fireEvent.click(rijKnop(r))
    const e = RIJ_META[r].editor
    switch (e.soort) {
      case 'regel':
        expect(screen.getByTestId('regel-pane').textContent).toBe(`${e.regel}|${e.anker ?? ''}|snap`)
        expect(laatst.regel!.title).toBe(RIJ_LABEL[r])
        break
      case 'voorkeur':
        expect(screen.getByTestId('voorkeur-sheet').textContent).toBe(
          `${e.kolom}|${e.kolom === 'inflation_rate' ? 2 : 5}|snap`,
        )
        break
      case 'box3':
        expect(screen.getByTestId('box3-sheet').textContent).toBe('forfaitair|snap')
        break
      case 'uitgaven':
        expect(screen.getByTestId('uitgaven-pane').textContent).toBe('snap')
        break
      default:
        throw new Error(`onverwachte editor ${e.soort}`)
    }
  })

  it('na opslaan in een regel-body ververst de bundel', () => {
    renderRijen()
    fireEvent.click(rijKnop('onttrekking'))
    ;(laatst.regel!.onSaved as () => void)()
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('InstellingenRijen — deeplinks (?rij= met aliassen)', () => {
  it.each([
    ['rij=eindleeftijd', 'eindstrategie|stop-plan-eindleeftijd|snap'],
    ['rij=geen-tekort-lening', 'eindstrategie|geen-tekort-lening|snap'],
    ['regel=eindstrategie', 'eindstrategie|stop-plan-stopmoment|snap'],
    ['regel=onttrekkingsstrategie', 'onttrekkingsstrategie||snap'],
    ['regel=verdeling-toename', 'verdeling-toename||snap'],
  ])('?%s opent de regel-pane', (q, verwacht) => {
    nav.search = new URLSearchParams(q)
    renderRijen()
    expect(screen.getByTestId('regel-pane').textContent).toBe(verwacht)
  })

  it.each([
    ['rij=aow', '/toekomst?rij=aow#levensstrategieen'],
    ['strategie=pensioen&x=1', '/toekomst?rij=pensioen#levensstrategieen'],
    ['strategie=huis', '/toekomst?rij=huis#levensstrategieen'],
  ])('?%s (levensstrategie) gaat door naar Plan en opent hier niets', (q, doel) => {
    nav.search = new URLSearchParams(q)
    renderRijen()
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith(doel)
    expect(screen.queryByTestId('regel-pane')).toBeNull()
  })

  it('?rij=uitgave-na-pensioen opent de uitgaven-pane', () => {
    nav.search = new URLSearchParams('rij=uitgave-na-pensioen')
    renderRijen()
    expect(screen.getByTestId('uitgaven-pane')).toBeTruthy()
  })

  it('?rij=inflatie werkt ook in Eenvoudig (de rij staat ingeklapt)', () => {
    nav.search = new URLSearchParams('rij=inflatie')
    renderRijen('simple')
    expect(screen.getByTestId('voorkeur-sheet').textContent).toMatch(/^inflation_rate/)
  })

  it('?strategie=open opent niets maar wordt wel opgeruimd', () => {
    nav.search = new URLSearchParams('strategie=open')
    renderRijen()
    expect(screen.queryByTestId('regel-pane')).toBeNull()
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen', { scroll: false })
  })

  it('met ?modal= wacht de rij-deeplink op de overlay-opruimer: één keer open', () => {
    nav.search = new URLSearchParams('modal=withdrawal&rij=onttrekking')
    const { rerender } = renderRijen()
    expect(screen.queryByTestId('regel-pane')).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
    nav.search = new URLSearchParams('rij=onttrekking')
    rerender(
      <DisplayModeProvider initialMode="full">
        <InstellingenRijen {...PROPS} />
      </DisplayModeProvider>,
    )
    expect(screen.getByTestId('regel-pane').textContent).toBe('onttrekkingsstrategie||snap')
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith('/toekomst/instellingen', { scroll: false })
  })

  it('met ?planreview= wacht de rij-deeplink op de opruimer van de review', () => {
    nav.search = new URLSearchParams('planreview=open&rij=box3')
    renderRijen()
    expect(screen.queryByTestId('box3-sheet')).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
  })
})

describe('InstellingenRijen — geen losse Tailwind-kleuren voor module-identiteit', () => {
  it('rendert zonder standaardpaletten', () => {
    const { container } = renderRijen()
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(violet|emerald|amber|sky|teal|purple)-\d/)
  })
})

